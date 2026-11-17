import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { app } from '../server.js';
import { renderBarcode } from '../src/symbologies/renderer.js';

const CHROME_CANDIDATE_PATHS = [
  process.env.CHROME_BIN,
  process.env.EDGE_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findBrowserExecutable() {
  for (const p of CHROME_CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class CdpRunner {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.tmpDir = null;
    this.browserWs = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.sessionId = null;
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-trans-'));
    this.proc = spawn(this.browserPath, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      `--user-data-dir=${this.tmpDir}`,
      'about:blank',
    ]);

    const wsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for DevTools')), 10000);
      this.proc.stderr.on('data', (d) => {
        const m = d.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      this.proc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Browser exited prematurely (${code})`));
      });
    });

    this.browserWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.browserWs.addEventListener('open', resolve);
      this.browserWs.addEventListener('error', reject);
    });

    this.browserWs.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    const { targetInfos } = await this.send('Target.getTargets');
    const pageTarget = targetInfos.find((t) => t.type === 'page') || targetInfos[0];
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
    this.sessionId = sessionId;
    await this.send('Page.enable', {}, this.sessionId);
    await this.send('Runtime.enable', {}, this.sessionId);
  }

  send(method, params = {}, sessionId = null) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.callbacks.set(id, {
        resolve: (res) => { clearTimeout(timer); resolve(res); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.browserWs.send(JSON.stringify(payload));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, this.sessionId);
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async goto(url) {
    await this.send('Page.navigate', { url }, this.sessionId);
    await new Promise((r) => setTimeout(r, 1200));
  }

  async stop() {
    if (this.browserWs) {
      try { this.browserWs.close(); } catch {}
    }
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch {}
    }
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

function analyzePngPixels(buf) {
  const png = PNG.sync.read(buf);
  let alpha0 = 0;
  let whiteOpaque = 0;
  const fgColors = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];
    if (a === 0) {
      alpha0++;
    } else if (a === 255) {
      if (r === 255 && g === 255 && b === 255) whiteOpaque++;
      fgColors.add(`${r},${g},${b}`);
    }
  }
  return { width: png.width, height: png.height, alpha0, whiteOpaque, fgColors: Array.from(fgColors) };
}

describe('Tier 8: Transparent Background Rendering & UI E2E', () => {
  let server;
  let baseUrl;
  let cdp;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const browserPath = findBrowserExecutable();
    if (browserPath) {
      cdp = new CdpRunner(browserPath);
      await cdp.start();
    }
  });

  after(async () => {
    if (cdp) await cdp.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('Renderer supports transparent=true, transparent=1, bgcolor=none, and bgcolor=transparent across PNG, SVG, and GIF', async () => {
    for (const opts of [
      { code: 'QRCode', data: 'https://example.com', imagetype: 'png', transparent: true, color: '#000000' },
      { code: 'QRCode', data: 'https://example.com', imagetype: 'png', transparent: '1', color: '#1d4ed8' },
      { code: 'QRCode', data: 'https://example.com', imagetype: 'png', bgcolor: 'none', color: '#dc2626' },
      { code: 'QRCode', data: 'https://example.com', imagetype: 'png', bgcolor: 'transparent', color: '#059669' },
      { code: 'PDF417', data: 'PDF417 Transparent', imagetype: 'png', transparent: 'true', color: '#1d4ed8' },
    ]) {
      const res = await renderBarcode(opts);
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/png');
      const stats = analyzePngPixels(res.buffer);
      assert.ok(stats.alpha0 > 500, `Expected transparent pixels > 500, got ${stats.alpha0}`);
      assert.equal(stats.whiteOpaque, 0, 'Transparent PNG must have 0 opaque white background pixels');
    }

    // SVG with custom foreground color and zero background rect
    const svgRes = await renderBarcode({
      code: 'QRCode',
      data: 'https://example.com',
      imagetype: 'svg',
      transparent: true,
      color: '#1d4ed8',
    });
    const svgText = svgRes.buffer.toString('utf8');
    assert.equal(/<rect/i.test(svgText), false, 'Transparent SVG must not contain a background <rect>');
    assert.ok(svgText.includes('fill="#1d4ed8"'), 'Transparent SVG must preserve custom foreground color');

    // GIF with transparency Graphic Control Extension
    const gifRes = await renderBarcode({
      code: 'QRCode',
      data: 'https://example.com',
      imagetype: 'gif',
      transparent: true,
      color: '#000000',
    });
    assert.equal(gifRes.buffer.subarray(0, 6).toString('ascii'), 'GIF89a');
    // Graphic Control Extension: 0x21 0xF9 0x04 with packed byte bit 0 (transparent flag = 1)
    const gceIdx = gifRes.buffer.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
    assert.ok(gceIdx !== -1, 'GIF must contain Graphic Control Extension');
    assert.equal(gifRes.buffer[gceIdx + 3] & 1, 1, 'GIF Graphic Control Extension transparent flag must be 1');
  });

  it('HTTP /barcode.ashx preserves transparent PNG when bgcolor=none or transparent=true', async () => {
    const r1 = await fetch(`${baseUrl}/barcode.ashx?code=QRCode&data=Hello&imagetype=png&transparent=true&color=%231d4ed8`);
    assert.equal(r1.status, 200);
    const s1 = analyzePngPixels(Buffer.from(await r1.arrayBuffer()));
    assert.ok(s1.alpha0 > 500);
    assert.equal(s1.whiteOpaque, 0);
    assert.ok(s1.fgColors.includes('29,78,216'), `Expected #1d4ed8 foreground, got ${s1.fgColors.join('; ')}`);

    const r2 = await fetch(`${baseUrl}/barcode.ashx?code=QRCode&data=Hello&imagetype=png&bgcolor=none`);
    assert.equal(r2.status, 200);
    const s2 = analyzePngPixels(Buffer.from(await r2.arrayBuffer()));
    assert.ok(s2.alpha0 > 500);
    assert.equal(s2.whiteOpaque, 0);
  });

  it('Module 1 (Barcode Generator) renders and exports genuinely transparent PNG/SVG with custom foreground color', async (t) => {
    if (!cdp) return t.skip('Headless browser unavailable');

    await cdp.goto(baseUrl);

    const mod1 = await cdp.evaluate(`(async () => {
      document.querySelector('#quickJumpPills .pill-item[data-sym-id="QRCode"]').click();
      await new Promise((r) => setTimeout(r, 300));

      document.querySelector('#generatorSettingsTabs .tab-trigger[data-tab="colors"]').click();
      const fgHex = document.getElementById('settingColorHex');
      fgHex.value = '#1d4ed8';
      fgHex.dispatchEvent(new Event('change', { bubbles: true }));

      const transBox = document.getElementById('settingTransparent');
      transBox.checked = true;
      transBox.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 500));

      const stageHasTrans = document.getElementById('barcodeStage').classList.contains('transparent-bg');
      const imgSrc = document.querySelector('#barcodeRenderTarget img')?.src || '';
      const embedCode = document.getElementById('embedCodeText')?.textContent || '';
      const bgDisabled = document.getElementById('settingBgHex').disabled;
      return { stageHasTrans, imgSrc, embedCode, bgDisabled };
    })()`);

    assert.equal(mod1.stageHasTrans, true, 'Optical stage should show transparent checkerboard');
    assert.equal(mod1.bgDisabled, true, 'Background color input should be disabled when transparent');
    assert.ok(mod1.imgSrc.startsWith('data:image/png;base64,'), 'Stage preview should render PNG');
    assert.ok(mod1.embedCode.includes('transparent=true'), 'Embed code must include transparent=true');

    const b64 = mod1.imgSrc.replace('data:image/png;base64,', '');
    const pngStats = analyzePngPixels(Buffer.from(b64, 'base64'));
    assert.ok(pngStats.alpha0 > 500, `Expected transparent preview pixels > 500, got ${pngStats.alpha0}`);
    assert.equal(pngStats.whiteOpaque, 0, 'Preview PNG must have 0 opaque white pixels');
    assert.ok(pngStats.fgColors.includes('29,78,216'), `Expected #1d4ed8 foreground pixels, got ${pngStats.fgColors}`);
  });

  it('Module 2 (QR Code Studio) renders transparent PNG with custom foreground color', async (t) => {
    if (!cdp) return t.skip('Headless browser unavailable');

    const mod2 = await cdp.evaluate(`(async () => {
      document.querySelector('.nav-tab[data-module="qr-studio"]').click();
      await new Promise((r) => setTimeout(r, 300));

      const fgHex = document.getElementById('qrColorHex');
      fgHex.value = '#dc2626';
      fgHex.dispatchEvent(new Event('change', { bubbles: true }));

      const transBox = document.getElementById('qrTransparentToggle');
      transBox.checked = true;
      transBox.dispatchEvent(new Event('change', { bubbles: true }));

      await new Promise((r) => setTimeout(r, 400));

      const wrapperHasTrans = document.getElementById('qrStudioImageWrapper').classList.contains('transparent-bg');
      const imgSrc = document.getElementById('qrStudioRenderImg')?.src || '';
      const bgDisabled = document.getElementById('qrBgHex').disabled;
      return { wrapperHasTrans, imgSrc, bgDisabled };
    })()`);

    assert.equal(mod2.wrapperHasTrans, true, 'QR Studio wrapper should display checkerboard');
    assert.equal(mod2.bgDisabled, true, 'QR Studio background input should be disabled when transparent');
    assert.ok(mod2.imgSrc.startsWith('data:image/png;base64,'));

    const b64 = mod2.imgSrc.replace('data:image/png;base64,', '');
    const pngStats = analyzePngPixels(Buffer.from(b64, 'base64'));
    assert.ok(pngStats.alpha0 > 500, `Expected transparent QR Studio pixels > 500, got ${pngStats.alpha0}`);
    assert.equal(pngStats.whiteOpaque, 0, 'QR Studio PNG must have 0 opaque white pixels');
    assert.ok(pngStats.fgColors.includes('220,38,38'), `Expected #dc2626 foreground pixels, got ${pngStats.fgColors}`);
  });
});
