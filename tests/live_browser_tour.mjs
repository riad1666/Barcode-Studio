/**
 * Comprehensive Live Browser Verification Tour via Chrome DevTools Protocol (CDP)
 * Tests all 4 Modules, Dual Themes, Optical Stage, and asserts 0 console errors / exceptions.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { app } from '../server.js';

const CHROME_CANDIDATE_PATHS = [
  process.env.CHROME_BIN,
  process.env.EDGE_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findBrowser() {
  for (const p of CHROME_CANDIDATE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

class HeadlessTourRunner {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.tmpDir = null;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.sessionId = null;
    this.exceptions = [];
    this.consoleErrors = [];
    this.allLogs = [];
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tour-'));
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
      const timer = setTimeout(() => reject(new Error('Timeout waiting for DevTools ws URL')), 10000);
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

    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
        this.exceptions.push({
          type: 'exception',
          text: desc,
          details: msg.params.exceptionDetails,
        });
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = msg.params.args?.map((a) => a.value || a.description || JSON.stringify(a)).join(' ') || '';
        this.allLogs.push({ type, text, timestamp: Date.now() });
        if (type === 'error' || type === 'assert') {
          this.consoleErrors.push({ type, text });
        }
      }
    };

    const targets = await this.send('Target.getTargets');
    const pageTarget = targets.targetInfos.find((t) => t.type === 'page');
    const attached = await this.send('Target.attachToTarget', {
      targetId: pageTarget.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;

    await this.sendToPage('Runtime.enable');
    await this.sendToPage('Page.enable');
    await this.sendToPage('DOM.enable');

    // Grant clipboard permissions so clipboard actions won't reject
    try {
      await this.send('Browser.grantPermissions', {
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      });
    } catch {
      // Ignore if unsupported in environment
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  sendToPage(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, sessionId: this.sessionId, method, params }));
    });
  }

  async navigate(url) {
    await this.sendToPage('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 1500));
  }

  async evaluate(expr) {
    const res = await this.sendToPage('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const err = new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      throw err;
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch {}
    }
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function runLiveTour() {
  console.log('='.repeat(70));
  console.log('LIVE BROWSER VERIFICATION TOUR (CDP + HEADLESS CHROMIUM)');
  console.log('='.repeat(70));

  const browserPath = findBrowser();
  assert.ok(browserPath, 'No Chromium or Edge browser found on host system!');
  console.log(`[CDP] Discovered browser binary: ${browserPath}`);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Server] Express 5 server booted on ${baseUrl}`);

  const runner = new HeadlessTourRunner(browserPath);
  await runner.start();
  console.log('[CDP] Headless Chrome session started with DevTools Protocol enabled.\n');

  try {
    // -------------------------------------------------------------------------
    // TOUR 1: Landing Page & Default PDF417 State
    // -------------------------------------------------------------------------
    console.log('[Tour 1] Landing on default route and verifying PDF417 state...');
    await runner.navigate(baseUrl);

    const initialPdf417 = await runner.evaluate(`(() => {
      const title = document.getElementById('activeSymbologyTitle')?.textContent?.trim();
      const payload = document.getElementById('barcodePayload')?.value;
      const rowBadge = document.getElementById('payloadRowBadge')?.textContent?.trim();
      const img = document.querySelector('#barcodeRenderTarget img');
      const metrics = document.getElementById('stageMetrics')?.textContent?.trim();
      const embedCode = document.getElementById('embedCodeText')?.textContent?.trim();
      const activePill = document.querySelector('.pill-item.active')?.dataset?.symId;

      return {
        title,
        payload,
        rowBadge,
        hasImage: Boolean(img),
        imgSrc: img?.src?.slice(0, 35),
        imgNaturalWidth: img?.naturalWidth || 0,
        imgNaturalHeight: img?.naturalHeight || 0,
        metrics,
        embedCode,
        activePill
      };
    })()`);

    console.log('  Active Symbology Title:', initialPdf417.title);
    console.log('  Active Quick-Jump Pill:', initialPdf417.activePill);
    console.log('  Payload (first 40 chars):', initialPdf417.payload?.slice(0, 40));
    console.log('  Payload Row Badge:', initialPdf417.rowBadge);
    console.log('  Rendered Barcode Image:', initialPdf417.imgSrc, `(${initialPdf417.imgNaturalWidth}x${initialPdf417.imgNaturalHeight}px)`);
    console.log('  Stage Metrics Display:', initialPdf417.metrics);
    console.log('  Embed Code Snippet:', initialPdf417.embedCode);

    assert.equal(initialPdf417.title, 'PDF417');
    assert.equal(initialPdf417.activePill, 'PDF417');
    assert.ok(initialPdf417.hasImage, 'Barcode image element missing from optical stage');
    assert.ok(initialPdf417.imgNaturalWidth > 50, 'Barcode naturalWidth too small');
    assert.ok(initialPdf417.imgNaturalHeight > 20, 'Barcode naturalHeight too small');
    assert.ok(initialPdf417.embedCode.includes('barcode.ashx?code=PDF417'), 'Embed snippet missing PDF417 URL');
    console.log('  ✔ [PASS] Tour 1: PDF417 default load verified successfully.\n');

    // -------------------------------------------------------------------------
    // TOUR 2: PDF417 High-Capacity Engineering Parameters
    // -------------------------------------------------------------------------
    console.log('[Tour 2] Testing PDF417 high-capacity engineering controls...');
    const advResult = await runner.evaluate(`(async () => {
      // Switch to Advanced tab
      document.querySelector('#generatorSettingsTabs .tab-trigger[data-tab="advanced"]').click();
      await new Promise(r => setTimeout(r, 100));

      const cols = document.getElementById('advPdfColumns');
      const rows = document.getElementById('advPdfRows');
      const ec = document.getElementById('advPdfEcLevel');
      const mult = document.getElementById('advPdfRowMult');
      const compact = document.getElementById('advPdfCompact');

      cols.value = '5';
      cols.dispatchEvent(new Event('input', { bubbles: true }));

      rows.value = '15';
      rows.dispatchEvent(new Event('input', { bubbles: true }));

      ec.value = '4';
      ec.dispatchEvent(new Event('change', { bubbles: true }));

      mult.value = '4';
      mult.dispatchEvent(new Event('input', { bubbles: true }));

      compact.checked = true;
      compact.dispatchEvent(new Event('change', { bubbles: true }));

      // Wait for re-render
      await new Promise(r => setTimeout(r, 600));

      const img = document.querySelector('#barcodeRenderTarget img');
      const metrics = document.getElementById('stageMetrics')?.textContent?.trim();

      return {
        advTabActive: document.getElementById('tab-advanced')?.classList.contains('active'),
        imgNaturalWidth: img?.naturalWidth || 0,
        imgNaturalHeight: img?.naturalHeight || 0,
        metrics
      };
    })()`);

    console.log('  Advanced Tab Active:', advResult.advTabActive);
    console.log('  New Dimensions with 5 cols, 15 rows, EC 4, RowMult 4, Compact:', `${advResult.imgNaturalWidth}x${advResult.imgNaturalHeight}px`);
    console.log('  Updated Stage Metrics:', advResult.metrics);

    assert.equal(advResult.advTabActive, true);
    assert.ok(advResult.imgNaturalWidth > 50);
    assert.ok(advResult.imgNaturalHeight > 50);
    console.log('  ✔ [PASS] Tour 2: PDF417 advanced engineering parameters updated and rendered.\n');

    // -------------------------------------------------------------------------
    // TOUR 3: Symbology Switching (Quick-Jump Pills & Ctrl+K Search Palette)
    // -------------------------------------------------------------------------
    console.log('[Tour 3] Testing Symbology Switching via Quick-Jump Pills & Ctrl+K Palette...');

    // 3a. Quick-jump pills
    const pillPicks = ['QRCode', 'Code128', 'DataMatrix', 'EAN13', 'SwissQRCodeV23QRR'];
    for (const symId of pillPicks) {
      const pillResult = await runner.evaluate(`(async (targetSym) => {
        const pill = document.querySelector(\`.pill-item[data-sym-id="\${targetSym}"]\`);
        pill.click();
        await new Promise(r => setTimeout(r, 500));
        return {
          title: document.getElementById('activeSymbologyTitle')?.textContent?.trim(),
          pillActive: pill.classList.contains('active'),
          pathname: window.location.pathname,
          hasImg: Boolean(document.querySelector('#barcodeRenderTarget img'))
        };
      })("${symId}")`);

      console.log(`  Pill [${symId}] -> Active Title: "${pillResult.title}", Path: ${pillResult.pathname}`);
      assert.ok(pillResult.pillActive);
      assert.ok(pillResult.hasImg);
    }

    // 3b. Ctrl+K Search Palette
    console.log('  Testing Ctrl+K Quick Search Palette modal...');
    const searchResult = await runner.evaluate(`(async () => {
      // Trigger search palette open
      document.querySelector('[data-open-search]').click();
      await new Promise(r => setTimeout(r, 200));

      const modal = document.getElementById('searchPaletteModal');
      const input = document.getElementById('searchPaletteInput');
      const list = document.getElementById('searchPaletteResults');

      input.value = 'PDF417';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));

      const firstItem = list.querySelector('.search-result-item');
      const firstTitle = firstItem?.querySelector('span[style*="font-weight: 600"]')?.textContent?.trim() || firstItem?.textContent?.trim();

      // Click the first result
      if (firstItem) {
        firstItem.click();
      }
      await new Promise(r => setTimeout(r, 500));

      return {
        modalClosed: modal.getAttribute('aria-hidden') === 'true',
        firstTitle,
        activeSym: document.getElementById('activeSymbologyTitle')?.textContent?.trim()
      };
    })()`);

    console.log('  Search Palette First Result for "PDF417":', searchResult.firstTitle);
    console.log('  Selected from Palette -> Active Title:', searchResult.activeSym);
    assert.equal(searchResult.firstTitle, 'PDF417');
    assert.equal(searchResult.activeSym, 'PDF417');
    assert.equal(searchResult.modalClosed, true);
    console.log('  ✔ [PASS] Tour 3: Quick-jump pills & Ctrl+K search palette verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 4: Scannability Stage Zoom & Actions (Downloads & Clipboard)
    // -------------------------------------------------------------------------
    console.log('[Tour 4] Testing Optical Scannability Stage (Zoom, Grid, Copy, Downloads)...');
    const stageResult = await runner.evaluate(`(async () => {
      const zoomIn = document.getElementById('stageZoomInBtn');
      const zoomOut = document.getElementById('stageZoomOutBtn');
      const zoomReset = document.getElementById('stageZoomResetBtn');
      const gridBtn = document.getElementById('stageGridToggleBtn');
      const stage = document.getElementById('barcodeStage');
      const target = document.getElementById('barcodeRenderTarget');

      // Zoom In
      zoomIn.click();
      const zoom120 = document.getElementById('stageZoomLevel')?.textContent?.trim();
      const scale120 = target.style.transform;

      // Zoom Reset
      zoomReset.click();
      const zoom100 = document.getElementById('stageZoomLevel')?.textContent?.trim();
      const scale100 = target.style.transform;

      // Grid toggle
      gridBtn.click();
      const hasGridTrue = stage.classList.contains('has-grid');
      gridBtn.click();
      const hasGridFalse = stage.classList.contains('has-grid');

      // Test copy link
      document.getElementById('copyPageLinkBtn').click();

      // Test format downloads via fetch
      const testDownloads = {};
      for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
        const res = await fetch(\`/barcode.ashx?code=PDF417&data=OpticalStageTest&imagetype=\${fmt}\`);
        const blob = await res.blob();
        testDownloads[fmt] = {
          status: res.status,
          contentType: res.headers.get('content-type'),
          size: blob.size
        };
      }

      return {
        zoom120,
        scale120,
        zoom100,
        scale100,
        hasGridTrue,
        hasGridFalse,
        testDownloads
      };
    })()`);

    console.log('  Stage Zoom In Level:', stageResult.zoom120, 'Transform:', stageResult.scale120);
    console.log('  Stage Zoom Reset Level:', stageResult.zoom100, 'Transform:', stageResult.scale100);
    console.log('  Grid Toggle: on =', stageResult.hasGridTrue, ', off =', stageResult.hasGridFalse);
    console.log('  Format Downloads:', JSON.stringify(stageResult.testDownloads));

    assert.equal(stageResult.zoom120, '120%');
    assert.equal(stageResult.zoom100, '100%');
    assert.equal(stageResult.hasGridTrue, true);
    assert.equal(stageResult.hasGridFalse, false);
    for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
      assert.equal(stageResult.testDownloads[fmt].status, 200);
      assert.ok(stageResult.testDownloads[fmt].size > 50);
    }
    console.log('  ✔ [PASS] Tour 4: Scannability stage zoom, grid, and multi-format downloads verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 5: Dual Theme Switching (Paper vs OLED IDE)
    // -------------------------------------------------------------------------
    console.log('[Tour 5] Testing Dual Theme Switching (Paper vs OLED IDE)...');
    const themeResult = await runner.evaluate(`(async () => {
      const toggleBtn = document.getElementById('themeToggleBtn');
      const root = document.documentElement;

      const initialTheme = root.getAttribute('data-theme');

      // Click to switch theme
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const secondTheme = root.getAttribute('data-theme');
      const secondBg = window.getComputedStyle(document.body).backgroundColor;

      // Click again to switch back
      toggleBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const thirdTheme = root.getAttribute('data-theme');
      const thirdBg = window.getComputedStyle(document.body).backgroundColor;

      // Check optical stage style isolation
      const stage = document.getElementById('barcodeStage');
      const stageStyle = window.getComputedStyle(stage);

      return {
        initialTheme,
        secondTheme,
        secondBg,
        thirdTheme,
        thirdBg,
        stageBg: stageStyle.backgroundColor
      };
    })()`);

    console.log('  Initial Theme:', themeResult.initialTheme);
    console.log('  After 1st toggle:', themeResult.secondTheme, 'Body BG:', themeResult.secondBg);
    console.log('  After 2nd toggle:', themeResult.thirdTheme, 'Body BG:', themeResult.thirdBg);
    console.log('  Optical Stage BG:', themeResult.stageBg);

    assert.notEqual(themeResult.initialTheme, themeResult.secondTheme);
    assert.equal(themeResult.initialTheme, themeResult.thirdTheme);
    assert.ok(themeResult.stageBg.length > 0);
    console.log('  ✔ [PASS] Tour 5: Dual theme switching (Paper vs OLED IDE) verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 6: Module 2 - QR Code Studio
    // -------------------------------------------------------------------------
    console.log('[Tour 6] Testing Module 2: QR Code Studio (Presets, Size 800px, Transparent PNG)...');
    const qrResult = await runner.evaluate(`(async () => {
      // Switch to QR Studio module
      document.querySelector('.nav-tab[data-module="qr-studio"]').click();
      await new Promise(r => setTimeout(r, 400));

      const isModuleActive = document.getElementById('module-qr-studio')?.classList.contains('active');

      // Test Preset: Wi-Fi
      const wifiCard = document.querySelector('.qr-preset-card[data-preset-id="wifi"]');
      wifiCard.click();
      await new Promise(r => setTimeout(r, 300));

      const ssidInput = document.getElementById('qr_wifi_ssid');
      const passInput = document.getElementById('qr_wifi_pass');
      if (ssidInput) {
        ssidInput.value = 'Swiss_Studio_Guest';
        ssidInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (passInput) {
        passInput.value = 'Precision2026';
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Test Size Preset 800px
      const size800Btn = document.querySelector('#qrSizePresets .segmented-btn[data-size="800"]');
      size800Btn.click();
      await new Promise(r => setTimeout(r, 200));

      // Test EC level H
      const ecHBtn = document.querySelector('#qrEcPresets .segmented-btn[data-ec="H"]');
      ecHBtn.click();
      await new Promise(r => setTimeout(r, 200));

      // Test Transparent background toggle
      const transBox = document.getElementById('qrTransparentToggle');
      transBox.checked = true;
      transBox.dispatchEvent(new Event('change', { bubbles: true }));

      // Wait for re-render
      await new Promise(r => setTimeout(r, 600));

      const img = document.getElementById('qrStudioRenderImg');

      // Test fetch transparent PNG from backend
      const res = await fetch('/barcode.ashx?code=QRCode&data=WIFI:S:Swiss_Studio_Guest;T:WPA;P:Precision2026;;&eclevel=H&transparent=true&bgcolor=none');
      const buf = await res.arrayBuffer();

      return {
        isModuleActive,
        wifiCardActive: wifiCard.classList.contains('active'),
        size800Active: size800Btn.classList.contains('active'),
        ecHActive: ecHBtn.classList.contains('active'),
        hasRenderImg: Boolean(img && img.src),
        pngByteLength: buf.byteLength,
        status: res.status
      };
    })()`);

    console.log('  QR Studio Module Active:', qrResult.isModuleActive);
    console.log('  Wi-Fi Preset Active:', qrResult.wifiCardActive);
    console.log('  800px Size Active:', qrResult.size800Active);
    console.log('  EC Level H Active:', qrResult.ecHActive);
    console.log('  QR Render Image Present:', qrResult.hasRenderImg);
    console.log('  Transparent PNG Status:', qrResult.status, 'Bytes:', qrResult.pngByteLength);

    assert.equal(qrResult.isModuleActive, true);
    assert.equal(qrResult.wifiCardActive, true);
    assert.equal(qrResult.size800Active, true);
    assert.equal(qrResult.ecHActive, true);
    assert.equal(qrResult.hasRenderImg, true);
    assert.equal(qrResult.status, 200);
    assert.ok(qrResult.pngByteLength > 200);
    console.log('  ✔ [PASS] Tour 6: QR Code Studio presets, 800px size, and transparent PNG verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 7: Module 3 - Business Cards PDF Designer (85x54 mm)
    // -------------------------------------------------------------------------
    console.log('[Tour 7] Testing Module 3: Business Cards Designer (85x54mm Preview, 10-Up A4 & Letter PDFs)...');
    const bcResult = await runner.evaluate(`(async () => {
      // Switch to Business Cards module
      document.querySelector('.nav-tab[data-module="business-cards"]').click();
      await new Promise(r => setTimeout(r, 400));

      const isModuleActive = document.getElementById('module-business-cards')?.classList.contains('active');

      // Edit contact fields
      const fn = document.getElementById('bcFirstName');
      const ln = document.getElementById('bcLastName');
      const title = document.getElementById('bcTitle');
      const comp = document.getElementById('bcCompany');

      fn.value = 'Hedy';
      fn.dispatchEvent(new Event('input', { bubbles: true }));
      ln.value = 'Lamarr';
      ln.dispatchEvent(new Event('input', { bubbles: true }));
      title.value = 'Inventor & Spread Spectrum Pioneer';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      comp.value = 'Frequency Hopping Labs';
      comp.dispatchEvent(new Event('input', { bubbles: true }));

      // Switch Template to Executive Band
      const execCard = document.querySelector('.template-card-choice[data-template="executive-band"]');
      execCard.click();
      await new Promise(r => setTimeout(r, 200));

      // Switch Symbology to Data Matrix
      const dmBtn = document.querySelector('#bcSymbologyToggle .segmented-btn[data-symbology="DataMatrix"]');
      dmBtn.click();
      await new Promise(r => setTimeout(r, 400));

      const canvas = document.getElementById('businessCardCanvas');
      const previewName = document.getElementById('cardPreviewName')?.textContent?.trim();
      const previewTitle = document.getElementById('cardPreviewTitle')?.textContent?.trim();

      // Test Generating Single 85x54mm PDF
      const resSingle = await fetch('/api/pdf/business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FirstName: 'Hedy',
          LastName: 'Lamarr',
          Position: 'Inventor & Spread Spectrum Pioneer',
          Company: 'Frequency Hopping Labs',
          Layout: 'single'
        })
      });
      const bufSingle = await resSingle.arrayBuffer();

      // Test Generating 10-Up A4 PDF
      const resA4 = await fetch('/api/pdf/business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FirstName: 'Hedy',
          LastName: 'Lamarr',
          Layout: 'sheet10',
          pageSize: 'a4'
        })
      });
      const bufA4 = await resA4.arrayBuffer();

      // Test Generating 10-Up Letter PDF
      const resLetter = await fetch('/api/pdf/business-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FirstName: 'Hedy',
          LastName: 'Lamarr',
          Layout: 'letter-10up'
        })
      });
      const bufLetter = await resLetter.arrayBuffer();

      return {
        isModuleActive,
        previewName,
        previewTitle,
        canvasTemplate: canvas.className,
        singleBytes: Array.from(new Uint8Array(bufSingle.slice(0, 10))),
        singleSize: bufSingle.byteLength,
        a4Size: bufA4.byteLength,
        letterSize: bufLetter.byteLength,
        rawA4: Array.from(new Uint8Array(bufA4)),
        rawLetter: Array.from(new Uint8Array(bufLetter))
      };
    })()`);

    console.log('  Business Cards Module Active:', bcResult.isModuleActive);
    console.log('  Live Canvas Preview Name:', bcResult.previewName);
    console.log('  Live Canvas Preview Title:', bcResult.previewTitle);
    console.log('  Live Canvas Class:', bcResult.canvasTemplate);
    console.log('  Single PDF Size:', bcResult.singleSize, 'bytes');
    console.log('  10-Up A4 Sheet PDF Size:', bcResult.a4Size, 'bytes');
    console.log('  10-Up Letter Sheet PDF Size:', bcResult.letterSize, 'bytes');

    assert.equal(bcResult.isModuleActive, true);
    assert.equal(bcResult.previewName, 'Hedy Lamarr');
    assert.ok(bcResult.canvasTemplate.includes('template-executive-band'));
    // Check %PDF- header (0x25, 0x50, 0x44, 0x46, 0x2D)
    assert.deepEqual(bcResult.singleBytes.slice(0, 5), [0x25, 0x50, 0x44, 0x46, 0x2d]);

    // Parse PDFs to confirm exact dimensions
    const pdfDocA4 = await PDFDocument.load(new Uint8Array(bcResult.rawA4));
    const pageA4 = pdfDocA4.getPage(0);
    console.log(`  Parsed A4 Page Dimensions: ${pageA4.getWidth().toFixed(2)} x ${pageA4.getHeight().toFixed(2)} pt`);
    assert.equal(Math.round(pageA4.getWidth()), 595); // 595.28 pt A4
    assert.equal(Math.round(pageA4.getHeight()), 842); // 841.89 pt A4

    const pdfDocLetter = await PDFDocument.load(new Uint8Array(bcResult.rawLetter));
    const pageLetter = pdfDocLetter.getPage(0);
    console.log(`  Parsed Letter Page Dimensions: ${pageLetter.getWidth().toFixed(2)} x ${pageLetter.getHeight().toFixed(2)} pt`);
    assert.equal(Math.round(pageLetter.getWidth()), 612); // 612 pt Letter
    assert.equal(Math.round(pageLetter.getHeight()), 792); // 792 pt Letter

    console.log('  ✔ [PASS] Tour 7: Business Cards 85x54mm preview and 10-up A4 / Letter PDFs verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 8: Module 4 - Label Printing Templates & Multi-Page CSV Grid
    // -------------------------------------------------------------------------
    console.log('[Tour 8] Testing Module 4: Label Printing Templates (VDA 4902, AIAG B-10, GS1, CSV Grid Sheet)...');
    const labelResult = await runner.evaluate(`(async () => {
      // Switch to Label Printing module
      document.querySelector('.nav-tab[data-module="labels"]').click();
      await new Promise(r => setTimeout(r, 400));

      const isModuleActive = document.getElementById('module-labels')?.classList.contains('active');

      // 8a. VDA 4902
      const vdaOpt = document.querySelector('.label-template-option[data-template="vda4902"]');
      vdaOpt.click();
      await new Promise(r => setTimeout(r, 300));
      const vdaMockupHasCell = Boolean(document.querySelector('.vda-barcode-cell'));

      const resVda = await fetch('/api/pdf/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'vda4902',
          receiver: 'BMW WERK LEIPZIG',
          partNumber: '11 12 7 552 281',
          quantity: '60'
        })
      });
      const bufVda = await resVda.arrayBuffer();

      // 8b. AIAG B-10
      const aiagOpt = document.querySelector('.label-template-option[data-template="aiag-b10"]');
      aiagOpt.click();
      await new Promise(r => setTimeout(r, 300));

      const resAiag = await fetch('/api/pdf/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'aiag-b10',
          supplier: 'ACME AUTO SUPPLY',
          partNumber: 'P987654321',
          quantity: '100'
        })
      });
      const bufAiag = await resAiag.arrayBuffer();

      // 8c. GS1 Shipping
      const gs1Opt = document.querySelector('.label-template-option[data-template="gs1-shipping"]');
      gs1Opt.click();
      await new Promise(r => setTimeout(r, 300));

      const resGs1 = await fetch('/api/pdf/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'gs1-shipping',
          shipFrom: 'CENTRAL DC',
          shipTo: 'RETAIL HUB 9',
          sscc: '003761234567890128'
        })
      });
      const bufGs1 = await resGs1.arrayBuffer();

      // 8d. CSV Grid Sheet with 30 items (3 cols x 8 rows = 24 items/page -> exactly 2 pages)
      const csvOpt = document.querySelector('.label-template-option[data-template="csv-sheet"]');
      csvOpt.click();
      await new Promise(r => setTimeout(r, 300));

      const csvRows = ['Title,CodeData'];
      for (let i = 1; i <= 30; i++) {
        csvRows.push(\`PALLET-\${String(i).padStart(4, '0')},DATA-\${1000 + i}\`);
      }
      const csvContent = csvRows.join('\\n');

      const csvArea = document.getElementById('labelCsvText');
      csvArea.value = csvContent;
      csvArea.dispatchEvent(new Event('input', { bubbles: true }));

      const resCsv = await fetch('/api/pdf/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'csv-sheet',
          csvText: csvContent,
          cols: 3,
          rows: 8,
          paperSize: 'a4'
        })
      });
      const bufCsv = await resCsv.arrayBuffer();

      return {
        isModuleActive,
        vdaMockupHasCell,
        vdaSize: bufVda.byteLength,
        aiagSize: bufAiag.byteLength,
        gs1Size: bufGs1.byteLength,
        csvSize: bufCsv.byteLength,
        rawCsv: Array.from(new Uint8Array(bufCsv))
      };
    })()`);

    console.log('  Label Printing Module Active:', labelResult.isModuleActive);
    console.log('  VDA 4902 Mockup Contains Barcode Cell:', labelResult.vdaMockupHasCell);
    console.log('  VDA 4902 PDF Size:', labelResult.vdaSize, 'bytes');
    console.log('  AIAG B-10 PDF Size:', labelResult.aiagSize, 'bytes');
    console.log('  GS1 Shipping PDF Size:', labelResult.gs1Size, 'bytes');
    console.log('  CSV Grid Sheet PDF Size:', labelResult.csvSize, 'bytes');

    assert.equal(labelResult.isModuleActive, true);
    assert.equal(labelResult.vdaMockupHasCell, true);
    assert.ok(labelResult.vdaSize > 1000);
    assert.ok(labelResult.aiagSize > 1000);
    assert.ok(labelResult.gs1Size > 1000);

    // Verify 30 items on 3x8 layout produced exactly 2 pages
    const csvPdfDoc = await PDFDocument.load(new Uint8Array(labelResult.rawCsv));
    const csvPageCount = csvPdfDoc.getPageCount();
    console.log(`  CSV Grid Sheet Page Count for 30 items (3x8 grid): ${csvPageCount} pages`);
    assert.equal(csvPageCount, 2, 'CSV Grid Sheet with 30 items must generate exactly 2 pages');
    console.log('  ✔ [PASS] Tour 8: Label printing templates and 2-page CSV Grid Sheet verified.\n');

    // -------------------------------------------------------------------------
    // TOUR 9: Final Global Health Check (0 Console Errors & 0 Unhandled Exceptions)
    // -------------------------------------------------------------------------
    console.log('[Tour 9] Asserting 0 browser console errors and 0 unhandled exceptions...');
    console.log(`  Total Log Events Captured: ${runner.allLogs.length}`);
    console.log(`  Console Errors: ${runner.consoleErrors.length}`);
    console.log(`  Unhandled Runtime Exceptions: ${runner.exceptions.length}`);

    if (runner.consoleErrors.length > 0) {
      console.error('Console Errors Detected:', runner.consoleErrors);
    }
    if (runner.exceptions.length > 0) {
      console.error('Unhandled Exceptions Detected:', runner.exceptions);
    }

    assert.equal(runner.consoleErrors.length, 0, `Detected ${runner.consoleErrors.length} console errors`);
    assert.equal(runner.exceptions.length, 0, `Detected ${runner.exceptions.length} unhandled runtime exceptions`);
    console.log('  ✔ [PASS] Tour 9: Confirmed exactly 0 console errors and 0 unhandled exceptions!\n');

    console.log('='.repeat(70));
    console.log('ALL 9 LIVE BROWSER VERIFICATION TOUR CHECKS PASSED FLAWLESSLY!');
    console.log('='.repeat(70));

  } finally {
    await runner.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

runLiveTour().catch((err) => {
  console.error('\n❌ Live Browser Verification Tour Failed:', err);
  process.exitCode = 1;
});
