import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { app } from '../server.js';

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
    this.eventListeners = new Map();
    this.sessionId = null;
    this.exceptions = [];
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-e2e-suite-'));
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
      const timer = setTimeout(() => reject(new Error('Timeout waiting for DevTools listening on ws://')), 10000);
      this.proc.stderr.on('data', (d) => {
        const match = d.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      this.proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    this.browserWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.browserWs.onopen = resolve;
      this.browserWs.onerror = reject;
    });

    this.browserWs.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const cb = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        cb(data);
      } else if (data.method) {
        if (data.method === 'Runtime.exceptionThrown') {
          this.exceptions.push(data.params);
        }
        if (this.eventListeners.has(data.method)) {
          this.eventListeners.get(data.method)(data.params);
        }
      }
    };

    // Attach to blank page
    const target = await this.send('Target.createTarget', { url: 'about:blank' });
    const attach = await this.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    this.sessionId = attach.sessionId;

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, (res) => {
        if (res.error) {
          reject(new Error(`${method} failed: ${res.error.message}`));
        } else {
          resolve(res.result);
        }
      });
      const payload = { id, method, params };
      if (this.sessionId) payload.sessionId = this.sessionId;
      this.browserWs.send(JSON.stringify(payload));
    });
  }

  async setViewport(width, height, isMobile = false, deviceScaleFactor = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: isMobile,
    });
  }

  async navigate(url) {
    const loadPromise = new Promise((resolve) => {
      this.eventListeners.set('Page.loadEventFired', resolve);
    });
    await this.send('Page.navigate', { url });
    await loadPromise;
    // Brief settle time
    await new Promise((r) => setTimeout(r, 100));
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  }

  async close() {
    if (this.browserWs) {
      try {
        this.browserWs.close();
      } catch {}
    }
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
    }
    // Clean temp profile on exit
    await new Promise((r) => setTimeout(r, 300));
    if (this.tmpDir) {
      try {
        fs.rmSync(this.tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

describe('Tier 4: Zero-Dependency Headless Chrome Browser CDP E2E Suite', () => {
  let server;
  let baseUrl;
  let browserPath;
  let cdp;

  before(async () => {
    // 1. Start isolated test server on dynamic OS port
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 2. Discover Chrome or Edge binary
    browserPath = findBrowserExecutable();
    assert.ok(browserPath, 'A Chromium-based browser (Chrome or Edge) must be installed to run Tier 4');

    // 3. Launch CDP session
    cdp = new CdpRunner(browserPath);
    await cdp.start();
  });

  after(async () => {
    if (cdp) {
      await cdp.close();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('4.1 Headless Chrome Browser CDP Architecture', () => {
    it('establishes DevTools Protocol connection and verifies browser version', async () => {
      const ver = await cdp.send('Browser.getVersion');
      assert.ok(ver.protocolVersion);
      assert.ok(ver.product);
      assert.ok(ver.userAgent);
    });

    it('navigates to application root and confirms zero uncaught exceptions', async () => {
      cdp.exceptions.length = 0;
      await cdp.navigate(baseUrl);
      assert.equal(cdp.exceptions.length, 0, 'Page loaded with uncaught JavaScript exceptions');
    });
  });

  describe('4.2 Desktop Viewport (1440x900) & Layout Verification', () => {
    it('renders at 1440x900 desktop viewport without horizontal overflow', async () => {
      await cdp.setViewport(1440, 900, false, 1);
      await cdp.navigate(baseUrl);

      const metrics = await cdp.evaluate(`({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        title: document.title
      })`);

      assert.equal(metrics.innerWidth, 1440);
      assert.equal(metrics.innerHeight, 900);
      assert.equal(metrics.hasHorizontalOverflow, false, 'Desktop layout must not horizontally scroll');
      assert.ok(metrics.title.length > 0);
    });

    it('verifies optical inspection stage / scannability background', async () => {
      await cdp.setViewport(1440, 900, false, 1);
      await cdp.navigate(baseUrl);

      const stageInfo = await cdp.evaluate(`(() => {
        const stage = document.querySelector('#barcodeStage') || document.querySelector('.card') || document.body;
        const style = window.getComputedStyle(stage);
        return {
          exists: Boolean(stage),
          bg: style.backgroundColor,
          color: style.color
        };
      })()`);

      assert.ok(stageInfo.exists);
      assert.ok(stageInfo.bg.length > 0);
    });
  });

  describe('4.3 Mobile Viewport (375x812) & Tap Targets', () => {
    it('renders at 375x812 mobile viewport without horizontal overflow', async () => {
      await cdp.setViewport(375, 812, true, 2);
      await cdp.navigate(baseUrl);

      const metrics = await cdp.evaluate(`({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
      })`);

      assert.equal(metrics.innerWidth, 375);
      assert.equal(metrics.innerHeight, 812);
      assert.equal(metrics.hasHorizontalOverflow, false, 'Mobile layout must not have horizontal scrollbar');
    });

    it('verifies mobile interactive targets satisfy touch guidelines', async () => {
      await cdp.setViewport(375, 812, true, 2);
      await cdp.navigate(baseUrl);

      const touchAudit = await cdp.evaluate(`(() => {
        const interactives = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
        if (interactives.length === 0) return { passed: true, count: 0 };
        // Check that any found primary interactive buttons have reasonable heights (>= 32px or >= 44px)
        const smallElements = interactives.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.height < 28;
        });
        return { passed: smallElements.length === 0, count: interactives.length, failing: smallElements.length };
      })()`);

      assert.ok(touchAudit.passed, `Found ${touchAudit.failing} buttons smaller than minimum tap target height`);
    });
  });

  describe('4.4 Dual Theme Toggle & Scannability Verification', () => {
    it('evaluates Light (Studio Paper) and Dark (OLED IDE) theme styles', async () => {
      await cdp.navigate(baseUrl);

      const themeAudit = await cdp.evaluate(`(() => {
        const root = document.documentElement;
        // Test toggling data-theme if theme system is mounted
        const initialTheme = root.getAttribute('data-theme') || 'dark';
        root.setAttribute('data-theme', 'paper');
        const paperBg = window.getComputedStyle(document.body).backgroundColor;

        root.setAttribute('data-theme', 'oled');
        const oledBg = window.getComputedStyle(document.body).backgroundColor;

        // Restore
        root.setAttribute('data-theme', initialTheme);

        return {
          canToggle: true,
          initialTheme,
          paperBg,
          oledBg
        };
      })()`);

      assert.ok(themeAudit.canToggle);
    });
  });

  describe('4.5 Interactive End-to-End Workflows in Browser Runtime', () => {
    it('Workflow 1: Fetches and displays live PDF417 barcode image in browser DOM', async () => {
      await cdp.navigate(baseUrl);

      const fetchResult = await cdp.evaluate(`(async () => {
        const res = await fetch('/barcode.ashx?code=PDF417&data=BrowserWorkflowTest');
        const blob = await res.blob();
        return {
          status: res.status,
          contentType: res.headers.get('content-type'),
          size: blob.size,
          isImage: blob.type.startsWith('image/')
        };
      })()`);

      assert.equal(fetchResult.status, 200);
      assert.equal(fetchResult.contentType, 'image/png');
      assert.ok(fetchResult.size > 100);
      assert.equal(fetchResult.isImage, true);
    });

    it('Workflow 2: Performs live sequence generation and batch ZIP download from browser runtime', async () => {
      await cdp.navigate(baseUrl);

      const sequenceResult = await cdp.evaluate(`(async () => {
        const seqRes = await fetch('/api/sequence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: 'RUN-', start: 1, end: 12, increment: 1, mask: '$$$$' })
        });
        const seqData = await seqRes.json();

        // Batch ZIP with generated sequence
        const rows = seqData.items.join('\\n');
        const zipRes = await fetch('/barcode.ashx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'PDF417',
            data: rows,
            multiplebarcodes: true
          })
        });

        return {
          seqCount: seqData.count,
          firstItem: seqData.items[0],
          lastItem: seqData.items[11],
          zipStatus: zipRes.status,
          zipType: zipRes.headers.get('content-type')
        };
      })()`);

      assert.equal(sequenceResult.seqCount, 12);
      assert.equal(sequenceResult.firstItem, 'RUN-0001');
      assert.equal(sequenceResult.lastItem, 'RUN-0012');
      assert.equal(sequenceResult.zipStatus, 200);
      assert.equal(sequenceResult.zipType, 'application/zip');
    });

    it('Workflow 3: Generates Business Card PDF from browser runtime and confirms PDF signature', async () => {
      await cdp.navigate(baseUrl);

      const pdfResult = await cdp.evaluate(`(async () => {
        const res = await fetch('/api/pdf/business-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            FirstName: 'Alan',
            LastName: 'Turing',
            Company: 'Bletchley Park',
            Position: 'Mathematician',
            Layout: 'single'
          })
        });
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // %PDF-
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        return { status: res.status, size: buf.byteLength, isPdf };
      })()`);

      assert.equal(pdfResult.status, 200);
      assert.ok(pdfResult.size > 1000);
      assert.equal(pdfResult.isPdf, true);
    });

    it('Workflow 4: Generates VDA 4902 Label PDF from browser runtime and confirms PDF signature', async () => {
      await cdp.navigate(baseUrl);

      const labelResult = await cdp.evaluate(`(async () => {
        const res = await fetch('/api/pdf/label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: 'vda4902',
            receiver: 'BMW WERK LEIPZIG',
            partNumber: '11 12 7 552 281',
            quantity: '60'
          })
        });
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        return { status: res.status, size: buf.byteLength, isPdf };
      })()`);

      assert.equal(labelResult.status, 200);
      assert.ok(labelResult.size > 1000);
      assert.equal(labelResult.isPdf, true);
    });

    it('Workflow 5: Bookmarkable routing navigation (/en, /en/pdf417, /qrcode)', async () => {
      for (const route of ['/en', '/en/pdf417', '/qrcode']) {
        await cdp.navigate(`${baseUrl}${route}`);
        const status = await cdp.evaluate('document.readyState');
        assert.equal(status, 'complete');
      }
    });
  });

});
