import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import JSZip from 'jszip';
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
    this.consoleLogs = [];
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-fe-stress-'));
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
        } else if (data.method === 'Runtime.consoleAPICalled') {
          this.consoleLogs.push(data.params);
        }
        if (this.eventListeners.has(data.method)) {
          this.eventListeners.get(data.method)(data.params);
        }
      }
    };

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
    await new Promise((r) => setTimeout(r, 200));
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
      try { this.browserWs.close(); } catch {}
    }
    if (this.proc) {
      try { this.proc.kill(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 300));
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

describe('Tier 6: Empirical Stress-Testing of 7 Frontend Workflows in Headless Chrome', () => {
  let server;
  let baseUrl;
  let browserPath;
  let cdp;

  before(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    browserPath = findBrowserExecutable();
    assert.ok(browserPath, 'A Chromium-based browser (Chrome or Edge) must be installed');

    cdp = new CdpRunner(browserPath);
    await cdp.start();
    await cdp.setViewport(1440, 900, false, 1);
  });

  after(async () => {
    if (cdp) await cdp.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  // ----------------------------------------------------
  // WORKFLOW 1: Landing on PDF417 Default & Updating Parameters
  // ----------------------------------------------------
  describe('Workflow 1: Landing on PDF417 Default & Updating Parameters', () => {
    it('1.1 Verifies default PDF417 DOM elements, payload, render target, metrics, and embed code on landing', async () => {
      cdp.exceptions.length = 0;
      await cdp.navigate(baseUrl);

      // Wait for catalog and initial preview to finish
      await cdp.evaluate(`new Promise(resolve => setTimeout(resolve, 600))`);

      const initialDom = await cdp.evaluate(`(() => {
        const title = document.getElementById('activeSymbologyTitle')?.textContent?.trim();
        const payload = document.getElementById('barcodePayload')?.value;
        const img = document.querySelector('#barcodeRenderTarget img');
        const metrics = document.getElementById('stageMetrics')?.textContent?.trim();
        const embed = document.getElementById('embedCodeText')?.textContent?.trim();
        const activeTab = document.querySelector('#generatorSettingsTabs .tab-trigger.active')?.dataset?.tab;

        return {
          title,
          payload,
          hasImg: Boolean(img),
          imgSrcPrefix: img ? img.src.substring(0, 30) : null,
          imgWidth: img ? img.naturalWidth : 0,
          imgHeight: img ? img.naturalHeight : 0,
          metrics,
          embed,
          activeTab
        };
      })()`);

      assert.equal(initialDom.title, 'PDF417');
      assert.ok(initialDom.payload.includes('PDF417'));
      assert.equal(initialDom.hasImg, true);
      assert.ok(initialDom.imgSrcPrefix.startsWith('data:image/png;base64,'));
      assert.ok(initialDom.imgWidth > 50, `Image width should be > 50, got ${initialDom.imgWidth}`);
      assert.ok(initialDom.imgHeight > 20, `Image height should be > 20, got ${initialDom.imgHeight}`);
      assert.ok(initialDom.metrics.includes('px'), `Metrics should contain px: ${initialDom.metrics}`);
      assert.ok(initialDom.embed.includes('code=PDF417'), `Embed should reference PDF417: ${initialDom.embed}`);
    });

    it('1.2 Updates PDF417 Advanced Engineering Parameters (columns, rows, EC, compact, row mult) interactively', async () => {
      // 1. Switch to Advanced Tab
      await cdp.evaluate(`(() => {
        const advTab = document.querySelector('#generatorSettingsTabs .tab-trigger[data-tab="advanced"]');
        advTab.click();
      })()`);

      const tabActive = await cdp.evaluate(`document.getElementById('tab-advanced').classList.contains('active')`);
      assert.equal(tabActive, true, 'Advanced tab must be active');

      // 2. Modify PDF417 columns, rows, EC level, compact, row multiplier
      const updateResult = await cdp.evaluate(`(async () => {
        const cols = document.getElementById('advPdfColumns');
        const rows = document.getElementById('advPdfRows');
        const ec = document.getElementById('advPdfEcLevel');
        const compact = document.getElementById('advPdfCompact');
        const rowMult = document.getElementById('advPdfRowMult');

        cols.value = '4';
        cols.dispatchEvent(new Event('change', { bubbles: true }));

        rows.value = '12';
        rows.dispatchEvent(new Event('change', { bubbles: true }));

        ec.value = '4';
        ec.dispatchEvent(new Event('change', { bubbles: true }));

        compact.checked = true;
        compact.dispatchEvent(new Event('change', { bubbles: true }));

        rowMult.value = '5';
        rowMult.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for debounced render (200ms + network)
        await new Promise(r => setTimeout(r, 600));

        const img = document.querySelector('#barcodeRenderTarget img');
        return {
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0,
          imgHeight: img ? img.naturalHeight : 0,
          srcPrefix: img ? img.src.substring(0, 30) : null
        };
      })()`);

      assert.equal(updateResult.hasImg, true);
      assert.ok(updateResult.imgWidth > 0);
      assert.ok(updateResult.imgHeight > 0);
    });

    it('1.3 Tests Colors and Font tabs, Zoom controls, Grid toggle, and Single format downloads', async () => {
      const suiteResult = await cdp.evaluate(`(async () => {
        // Switch to Colors tab
        document.querySelector('#generatorSettingsTabs .tab-trigger[data-tab="colors"]').click();
        const transBox = document.getElementById('settingTransparent');
        transBox.checked = true;
        transBox.dispatchEvent(new Event('change', { bubbles: true }));

        // Switch to Settings tab and change DPI
        document.querySelector('#generatorSettingsTabs .tab-trigger[data-tab="settings"]').click();
        const dpiInput = document.getElementById('settingDpiInput');
        dpiInput.value = '150';
        dpiInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Zoom tests
        const zoomInBtn = document.getElementById('stageZoomInBtn');
        const zoomResetBtn = document.getElementById('stageZoomResetBtn');
        const gridBtn = document.getElementById('stageGridToggleBtn');
        const stage = document.getElementById('barcodeStage');

        zoomInBtn.click();
        const zoomedText = document.getElementById('stageZoomLevel').textContent;
        zoomResetBtn.click();
        const resetText = document.getElementById('stageZoomLevel').textContent;

        gridBtn.click();
        const hasGrid = stage.classList.contains('has-grid');

        // Test single format downloads via direct fetch or button handlers
        const resPng = await fetch('/barcode.ashx?code=PDF417&data=DLTest&imagetype=png');
        const resSvg = await fetch('/barcode.ashx?code=PDF417&data=DLTest&imagetype=svg');
        const resJpg = await fetch('/barcode.ashx?code=PDF417&data=DLTest&imagetype=jpg');
        const resGif = await fetch('/barcode.ashx?code=PDF417&data=DLTest&imagetype=gif');

        return {
          zoomedText,
          resetText,
          hasGrid,
          pngOk: resPng.status === 200 && resPng.headers.get('content-type') === 'image/png',
          svgOk: resSvg.status === 200 && resSvg.headers.get('content-type') === 'image/svg+xml',
          jpgOk: resJpg.status === 200 && resJpg.headers.get('content-type') === 'image/jpeg',
          gifOk: resGif.status === 200 && resGif.headers.get('content-type') === 'image/gif'
        };
      })()`);

      assert.equal(suiteResult.zoomedText, '120%');
      assert.equal(suiteResult.resetText, '100%');
      assert.equal(suiteResult.hasGrid, true);
      assert.equal(suiteResult.pngOk, true);
      assert.equal(suiteResult.svgOk, true);
      assert.equal(suiteResult.jpgOk, true);
      assert.equal(suiteResult.gifOk, true);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 2: Ctrl+K Search and Switching Symbologies
  // ----------------------------------------------------
  describe('Workflow 2: Ctrl+K Search and Switching Symbologies', () => {
    it('2.1 Opens quick search modal via Ctrl+K and filters symbologies', async () => {
      const openResult = await cdp.evaluate(`(() => {
        // Dispatch Ctrl+K keydown on document
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'k',
          code: 'KeyK',
          ctrlKey: true,
          bubbles: true
        }));

        const modal = document.getElementById('searchPaletteModal');
        const input = document.getElementById('searchPaletteInput');
        return {
          isOpen: modal.classList.contains('is-open'),
          ariaHidden: modal.getAttribute('aria-hidden'),
          inputVal: input.value
        };
      })()`);

      assert.equal(openResult.isOpen, true, 'Modal should have is-open class');
      assert.equal(openResult.ariaHidden, 'false');

      // Filter for 'Data Matrix'
      const filterResult = await cdp.evaluate(`(() => {
        const input = document.getElementById('searchPaletteInput');
        input.value = 'Data Matrix';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const items = Array.from(document.querySelectorAll('#searchPaletteResults .search-result-item'));
        return {
          count: items.length,
          firstItemText: items[0]?.textContent?.trim()
        };
      })()`);

      assert.ok(filterResult.count > 0, 'Should find at least 1 result for Data Matrix');
      assert.ok(filterResult.firstItemText.includes('Data Matrix'));
    });

    it('2.2 Selects symbology via Enter / click, switches state, updates URL and re-renders', async () => {
      const selectResult = await cdp.evaluate(`(async () => {
        const input = document.getElementById('searchPaletteInput');
        // Press Enter to select the currently selected result
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true
        }));

        const modal = document.getElementById('searchPaletteModal');
        await new Promise(r => setTimeout(r, 600));

        const title = document.getElementById('activeSymbologyTitle')?.textContent?.trim();
        const dmGroup = document.getElementById('advGroupDataMatrix');
        const pathname = window.location.pathname;
        const img = document.querySelector('#barcodeRenderTarget img');

        return {
          modalHidden: modal.getAttribute('aria-hidden') === 'true',
          title,
          dmGroupVisible: dmGroup && window.getComputedStyle(dmGroup).display !== 'none',
          pathname,
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0
        };
      })()`);

      assert.equal(selectResult.modalHidden, true, 'Search modal should close');
      assert.equal(selectResult.title, 'Data Matrix');
      assert.equal(selectResult.pathname, '/en/datamatrix');
      assert.equal(selectResult.hasImg, true);
      assert.ok(selectResult.imgWidth > 0);
    });

    it('2.3 Quick-jump pills switch symbologies instantly (QR Code, Code-128, EAN-13)', async () => {
      for (const { symId, expectedTitle, expectedPath } of [
        { symId: 'QRCode', expectedTitle: 'QR Code', expectedPath: '/en/qrcode' },
        { symId: 'Code128', expectedTitle: 'Code-128', expectedPath: '/en/code128' },
        { symId: 'EAN13', expectedTitle: 'EAN-13', expectedPath: '/en/ean13' }
      ]) {
        const pillResult = await cdp.evaluate(`(async (targetSymId) => {
          const pill = document.querySelector(\`#quickJumpPills .pill-item[data-sym-id="\${targetSymId}"]\`);
          pill.click();
          await new Promise(r => setTimeout(r, 500));
          const title = document.getElementById('activeSymbologyTitle')?.textContent?.trim();
          const activePill = document.querySelector('#quickJumpPills .pill-item.active')?.dataset?.symId;
          const img = document.querySelector('#barcodeRenderTarget img');
          return {
            title,
            activePill,
            pathname: window.location.pathname,
            hasImg: Boolean(img),
            width: img ? img.naturalWidth : 0
          };
        })('${symId}')`);

        assert.equal(pillResult.title, expectedTitle);
        assert.equal(pillResult.activePill, symId);
        assert.equal(pillResult.pathname, expectedPath);
        assert.equal(pillResult.hasImg, true);
        assert.ok(pillResult.width > 0);
      }
    });

    it('2.4 Handles adversarial search edge cases (unmatched gibberish, escape key)', async () => {
      const advResult = await cdp.evaluate(`(() => {
        // Open search via button
        document.querySelector('[data-open-search]').click();
        const input = document.getElementById('searchPaletteInput');
        input.value = 'zzzyyy_no_such_barcode_999';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const resultsText = document.getElementById('searchPaletteResults')?.textContent?.trim();

        // Press Escape to close modal
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const modal = document.getElementById('searchPaletteModal');

        return {
          resultsText,
          closed: modal.getAttribute('aria-hidden') === 'true'
        };
      })()`);

      assert.ok(advResult.resultsText.includes('No matching symbologies found'));
      assert.equal(advResult.closed, true);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 3: Structured Form Application (Swiss QR v2.3 QRR, GS1 Digital Link)
  // ----------------------------------------------------
  describe('Workflow 3: Structured Form Application (Swiss QR v2.3 QRR, GS1 Digital Link)', () => {
    it('3.1 Selects Swiss QR v2.3 QRR, mounts banking form, edits fields, and renders valid Swiss QR', async () => {
      const swissResult = await cdp.evaluate(`(async () => {
        // Switch to Swiss QR via pill
        const pill = document.querySelector('#quickJumpPills .pill-item[data-sym-id="SwissQRCodeV23QRR"]');
        pill.click();
        await new Promise(r => setTimeout(r, 600));

        const structuredMount = document.getElementById('structuredFormMount');
        const standardSection = document.getElementById('standardPayloadSection');

        // Check form elements
        const ibanInput = document.getElementById('swiss_iban');
        const nameInput = document.getElementById('swiss_name');
        const amtInput = document.getElementById('swiss_amount');
        const refInput = document.getElementById('swiss_ref');

        // Edit fields
        nameInput.value = 'Alpine Technologies AG';
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));

        amtInput.value = '1899.50';
        amtInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Wait for debounced render
        await new Promise(r => setTimeout(r, 600));

        const img = document.querySelector('#barcodeRenderTarget img');
        return {
          mountVisible: structuredMount && window.getComputedStyle(structuredMount).display !== 'none',
          standardHidden: standardSection && window.getComputedStyle(standardSection).display === 'none',
          defaultIban: ibanInput.value,
          defaultRef: refInput.value,
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0,
          imgHeight: img ? img.naturalHeight : 0
        };
      })()`);

      assert.equal(swissResult.mountVisible, true, 'Structured form mount must be visible');
      assert.equal(swissResult.standardHidden, true, 'Standard payload section must be hidden');
      assert.ok(swissResult.defaultIban.includes('3199'), 'Must be Swiss QR-IBAN');
      assert.ok(swissResult.defaultRef.length >= 26, 'Must be 27-digit reference');
      assert.equal(swissResult.hasImg, true);
      assert.ok(swissResult.imgWidth > 100);
      assert.ok(swissResult.imgHeight > 100);
    });

    it('3.2 Selects GS1 Digital Link, mounts dynamic URI builder, updates attributes and renders GS1 QR', async () => {
      const gs1Result = await cdp.evaluate(`(async () => {
        // Trigger Ctrl+K search and select GS1DigitalLink_QRCode
        document.querySelector('[data-open-search]').click();
        const input = document.getElementById('searchPaletteInput');
        input.value = 'GS1 Digital Link (QR)';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Click first matching item
        const firstItem = document.querySelector('#searchPaletteResults .search-result-item');
        firstItem.click();

        await new Promise(r => setTimeout(r, 600));

        // Form elements
        const resolver = document.getElementById('gs1_resolver');
        const pkVal = document.getElementById('gs1_pk_val');
        const q10 = document.getElementById('gs1_q10');
        const q21 = document.getElementById('gs1_q21');

        pkVal.value = '07612345678900';
        pkVal.dispatchEvent(new Event('input', { bubbles: true }));

        q10.value = 'LOT-9988';
        q10.dispatchEvent(new Event('input', { bubbles: true }));

        q21.value = 'SER-00123';
        q21.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 600));

        const previewUri = document.getElementById('gs1_uri_preview')?.textContent?.trim();
        const img = document.querySelector('#barcodeRenderTarget img');

        return {
          previewUri,
          hasImg: Boolean(img),
          width: img ? img.naturalWidth : 0,
          height: img ? img.naturalHeight : 0
        };
      })()`);

      assert.ok(gs1Result.previewUri.includes('https://dalgiardino.com/01/07612345678900/10/LOT-9988/21/SER-00123'));
      assert.equal(gs1Result.hasImg, true);
      assert.ok(gs1Result.width > 50);
      assert.ok(gs1Result.height > 50);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 4: Sequence Generation and Batch ZIP Download
  // ----------------------------------------------------
  describe('Workflow 4: Sequence Generation and Batch ZIP Download', () => {
    it('4.1 Opens sequence modal, configures sequence parameters with mask, and inspects live preview table', async () => {
      // Switch back to PDF417
      await cdp.evaluate(`(() => {
        document.querySelector('#quickJumpPills .pill-item[data-sym-id="PDF417"]').click();
      })()`);
      await cdp.evaluate(`new Promise(r => setTimeout(r, 300))`);

      const modalResult = await cdp.evaluate(`(async () => {
        document.getElementById('openSequenceModalBtn').click();
        const modal = document.getElementById('sequenceModal');

        const prefix = document.getElementById('seqPrefix');
        const suffix = document.getElementById('seqSuffix');
        const start = document.getElementById('seqStart');
        const end = document.getElementById('seqEnd');
        const step = document.getElementById('seqStep');
        const mask = document.getElementById('seqMask');

        prefix.value = 'BOX-';
        prefix.dispatchEvent(new Event('input', { bubbles: true }));

        suffix.value = '-CH';
        suffix.dispatchEvent(new Event('input', { bubbles: true }));

        start.value = '1';
        start.dispatchEvent(new Event('input', { bubbles: true }));

        end.value = '20';
        end.dispatchEvent(new Event('input', { bubbles: true }));

        step.value = '1';
        step.dispatchEvent(new Event('input', { bubbles: true }));

        mask.value = '$$$$';
        mask.dispatchEvent(new Event('input', { bubbles: true }));

        // Wait for preview update
        await new Promise(r => setTimeout(r, 400));

        const badge = document.getElementById('seqCountBadge')?.textContent?.trim();
        const items = Array.from(document.querySelectorAll('#seqPreviewTable div')).map(d => d.textContent.trim());

        return {
          isOpen: modal.classList.contains('is-open'),
          badge,
          firstItem: items[0],
          lastItem: items[items.length - 1],
          totalPreviewItems: items.length
        };
      })()`);

      assert.equal(modalResult.isOpen, true);
      assert.equal(modalResult.badge, '20 items');
      assert.equal(modalResult.firstItem, 'BOX-0001-CH');
      assert.equal(modalResult.lastItem, 'BOX-0020-CH');
      assert.equal(modalResult.totalPreviewItems, 20);
    });

    it('4.2 Inserts sequence into payload, enables batch ZIP toggle, and downloads valid 20-row ZIP', async () => {
      const insertResult = await cdp.evaluate(`(async () => {
        // Click Insert into Payload
        document.getElementById('seqInsertBtn').click();
        await new Promise(r => setTimeout(r, 300));

        const modal = document.getElementById('sequenceModal');
        const ta = document.getElementById('barcodePayload');
        const badge = document.getElementById('payloadRowBadge')?.textContent?.trim();
        const batchBox = document.getElementById('toggleBatchZip');
        const batchBtn = document.getElementById('batchZipDownloadBtn');

        const lines = ta.value.split('\\n').filter(l => l.trim().length > 0);

        return {
          modalClosed: modal.getAttribute('aria-hidden') === 'true',
          rowCount: lines.length,
          firstRow: lines[0],
          lastRow: lines[lines.length - 1],
          badgeText: badge,
          batchChecked: batchBox.checked,
          batchBtnVisible: window.getComputedStyle(batchBtn).display !== 'none'
        };
      })()`);

      assert.equal(insertResult.modalClosed, true);
      assert.equal(insertResult.rowCount, 20);
      assert.equal(insertResult.firstRow, 'BOX-0001-CH');
      assert.equal(insertResult.lastRow, 'BOX-0020-CH');
      assert.equal(insertResult.badgeText, '20 rows');
      assert.equal(insertResult.batchChecked, true);
      assert.equal(insertResult.batchBtnVisible, true);

      // Verify batch ZIP download by requesting it with the payload in browser runtime
      const zipData = await cdp.evaluate(`(async () => {
        const payload = document.getElementById('barcodePayload').value;
        const res = await fetch('/barcode.ashx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'PDF417',
            data: payload,
            multiplebarcodes: true
          })
        });

        const buf = await res.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buf));
        return {
          status: res.status,
          contentType: res.headers.get('content-type'),
          byteLength: bytes.length,
          bytes: bytes.slice(0, 10)
        };
      })()`);

      assert.equal(zipData.status, 200);
      assert.equal(zipData.contentType, 'application/zip');
      assert.ok(zipData.byteLength > 2000);
      // Magic bytes PK\x03\x04
      assert.equal(zipData.bytes[0], 0x50);
      assert.equal(zipData.bytes[1], 0x4B);
      assert.equal(zipData.bytes[2], 0x03);
      assert.equal(zipData.bytes[3], 0x04);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 5: QR Code Studio Presets and Exports
  // ----------------------------------------------------
  describe('Workflow 5: QR Code Studio Presets and Exports', () => {
    it('5.1 Switches to QR Code Studio, verifies 10 presets, and mounts Wi-Fi form with live preview', async () => {
      const switchResult = await cdp.evaluate(`(async () => {
        // Click nav tab for qr-studio
        document.querySelector('.nav-tab[data-module="qr-studio"]').click();
        await new Promise(r => setTimeout(r, 400));

        const mod2 = document.getElementById('module-qr-studio');
        const presetCards = Array.from(document.querySelectorAll('#qrPresetsGrid .qr-preset-card')).map(c => c.dataset.presetId);

        // Click Wi-Fi preset card
        const wifiCard = document.querySelector('.qr-preset-card[data-preset-id="wifi"]');
        wifiCard.click();
        await new Promise(r => setTimeout(r, 400));

        const ssid = document.getElementById('qr_wifi_ssid');
        const pass = document.getElementById('qr_wifi_pass');
        const enc = document.getElementById('qr_wifi_enc');

        ssid.value = 'SwissStudio-5G';
        ssid.dispatchEvent(new Event('input', { bubbles: true }));

        pass.value = 'PrecisionPass2026';
        pass.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 600));

        const img = document.getElementById('qrStudioRenderImg');

        return {
          isModActive: mod2.classList.contains('active'),
          presetsCount: presetCards.length,
          hasWifiPreset: presetCards.includes('wifi'),
          hasImg: Boolean(img),
          srcPrefix: img ? img.src.substring(0, 30) : null,
          width: img ? img.naturalWidth : 0
        };
      })()`);

      assert.equal(switchResult.isModActive, true);
      assert.equal(switchResult.presetsCount, 10);
      assert.equal(switchResult.hasWifiPreset, true);
      assert.equal(switchResult.hasImg, true);
      assert.ok(switchResult.srcPrefix.startsWith('data:image/png;base64,'));
      assert.ok(switchResult.width > 100);
    });

    it('5.2 Tests Event & vCard presets, size presets (800px), EC level (H), transparent background, and exports', async () => {
      const studioResult = await cdp.evaluate(`(async () => {
        // Click vCard preset
        document.querySelector('.qr-preset-card[data-preset-id="vcard"]').click();
        await new Promise(r => setTimeout(r, 400));

        const fn = document.getElementById('qr_vc_fn');
        const ln = document.getElementById('qr_vc_ln');
        fn.value = 'Nikola';
        fn.dispatchEvent(new Event('input', { bubbles: true }));
        ln.value = 'Tesla';
        ln.dispatchEvent(new Event('input', { bubbles: true }));

        // Click Size preset 800px
        const size800 = document.querySelector('#qrSizePresets button[data-size="800"]');
        size800.click();

        // Click EC preset H (30%)
        const ecH = document.querySelector('#qrEcPresets button[data-ec="H"]');
        ecH.click();

        // Toggle transparent background
        const transToggle = document.getElementById('qrTransparentToggle');
        transToggle.checked = true;
        transToggle.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 600));

        const img = document.getElementById('qrStudioRenderImg');

        // Test download API endpoints for QR Studio (PNG, SVG, JPG)
        const resPng = await fetch('/barcode.ashx?code=QRCode&data=BEGIN:VCARD%0AN:Tesla;Nikola%0AEND:VCARD&imagetype=png&eclevel=H');
        const resSvg = await fetch('/barcode.ashx?code=QRCode&data=BEGIN:VCARD%0AN:Tesla;Nikola%0AEND:VCARD&imagetype=svg&eclevel=H');
        const resJpg = await fetch('/barcode.ashx?code=QRCode&data=BEGIN:VCARD%0AN:Tesla;Nikola%0AEND:VCARD&imagetype=jpg&eclevel=H');

        return {
          sizeActive: size800.classList.contains('active'),
          ecActive: ecH.classList.contains('active'),
          transChecked: transToggle.checked,
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0,
          pngStatus: resPng.status,
          svgStatus: resSvg.status,
          jpgStatus: resJpg.status
        };
      })()`);

      assert.equal(studioResult.sizeActive, true);
      assert.equal(studioResult.ecActive, true);
      assert.equal(studioResult.transChecked, true);
      assert.equal(studioResult.hasImg, true);
      assert.ok(studioResult.imgWidth > 100);
      assert.equal(studioResult.pngStatus, 200);
      assert.equal(studioResult.svgStatus, 200);
      assert.equal(studioResult.jpgStatus, 200);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 6: Business Cards Designer and PDF Exports
  // ----------------------------------------------------
  describe('Workflow 6: Business Cards Designer and PDF Exports', () => {
    it('6.1 Switches to Business Cards, edits contact fields, and verifies live 85x54mm card visual canvas', async () => {
      const bcResult = await cdp.evaluate(`(async () => {
        document.querySelector('.nav-tab[data-module="business-cards"]').click();
        await new Promise(r => setTimeout(r, 400));

        const fn = document.getElementById('bcFirstName');
        const ln = document.getElementById('bcLastName');
        const title = document.getElementById('bcTitle');
        const comp = document.getElementById('bcCompany');
        const email = document.getElementById('bcEmail');

        fn.value = 'Hedy';
        fn.dispatchEvent(new Event('input', { bubbles: true }));

        ln.value = 'Lamarr';
        ln.dispatchEvent(new Event('input', { bubbles: true }));

        title.value = 'Frequency Hopping Pioneer';
        title.dispatchEvent(new Event('input', { bubbles: true }));

        comp.value = 'Spread Spectrum Labs';
        comp.dispatchEvent(new Event('input', { bubbles: true }));

        email.value = 'hedy@frequency.ch';
        email.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 600));

        const previewName = document.getElementById('cardPreviewName')?.textContent?.trim();
        const previewTitle = document.getElementById('cardPreviewTitle')?.textContent?.trim();
        const previewComp = document.getElementById('cardPreviewCompany')?.textContent?.trim();
        const previewEmail = document.getElementById('cardPreviewEmail')?.textContent?.trim();
        const barcodeBox = document.getElementById('cardPreviewBarcode');
        const img = barcodeBox ? barcodeBox.querySelector('img') : null;

        return {
          previewName,
          previewTitle,
          previewComp,
          previewEmail,
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0
        };
      })()`);

      assert.equal(bcResult.previewName, 'Hedy Lamarr');
      assert.equal(bcResult.previewTitle, 'Frequency Hopping Pioneer');
      assert.equal(bcResult.previewComp, 'Spread Spectrum Labs');
      assert.ok(bcResult.previewEmail.includes('hedy@frequency.ch'));
      assert.equal(bcResult.hasImg, true);
      assert.ok(bcResult.imgWidth > 0);
    });

    it('6.2 Switches visual templates and 2D symbologies (PDF417, Data Matrix, QR Code)', async () => {
      for (const tpl of ['executive-band', 'accent-rail', 'compact-split', 'classic-minimal']) {
        const tplResult = await cdp.evaluate(`(async (targetTpl) => {
          const choice = document.querySelector(\`#bcTemplatesGrid .template-card-choice[data-template="\${targetTpl}"]\`);
          choice.click();
          await new Promise(r => setTimeout(r, 200));

          const canvas = document.getElementById('businessCardCanvas');
          return {
            hasTplClass: canvas.classList.contains(\`template-\${targetTpl}\`)
          };
        })('${tpl}')`);

        assert.equal(tplResult.hasTplClass, true, `Canvas must have template-${tpl}`);
      }

      // Toggle symbology to PDF417
      const symResult = await cdp.evaluate(`(async () => {
        const pdfBtn = document.querySelector('#bcSymbologyToggle button[data-symbology="PDF417"]');
        pdfBtn.click();
        await new Promise(r => setTimeout(r, 600));

        const img = document.querySelector('#cardPreviewBarcode img');
        return {
          btnActive: pdfBtn.classList.contains('active'),
          hasImg: Boolean(img),
          imgWidth: img ? img.naturalWidth : 0
        };
      })()`);

      assert.equal(symResult.btnActive, true);
      assert.equal(symResult.hasImg, true);
      assert.ok(symResult.imgWidth > 0);
    });

    it('6.3 Generates Single 85x54mm, 10-up A4, and 10-up Letter PDFs from browser runtime', async () => {
      const pdfBytesMap = await cdp.evaluate(`(async () => {
        // Single
        const resSingle = await fetch('/api/pdf/business-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            FirstName: 'Hedy',
            LastName: 'Lamarr',
            Position: 'Pioneer',
            Company: 'Spectrum Labs',
            Layout: 'single'
          })
        });
        const bufSingle = Array.from(new Uint8Array(await resSingle.arrayBuffer()));

        // 10-up A4
        const resA4 = await fetch('/api/pdf/business-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            FirstName: 'Hedy',
            LastName: 'Lamarr',
            Position: 'Pioneer',
            Company: 'Spectrum Labs',
            Layout: 'sheet10',
            PageSize: 'a4'
          })
        });
        const bufA4 = Array.from(new Uint8Array(await resA4.arrayBuffer()));

        // 10-up Letter
        const resLetter = await fetch('/api/pdf/business-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            FirstName: 'Hedy',
            LastName: 'Lamarr',
            Position: 'Pioneer',
            Company: 'Spectrum Labs',
            Layout: 'sheet10',
            PageSize: 'letter'
          })
        });
        const bufLetter = Array.from(new Uint8Array(await resLetter.arrayBuffer()));

        return { bufSingle, bufA4, bufLetter };
      })()`);

      // Verify single card PDF
      const singleDoc = await PDFDocument.load(new Uint8Array(pdfBytesMap.bufSingle));
      assert.equal(singleDoc.getPageCount(), 1);
      const singlePage = singleDoc.getPage(0);
      assert.ok(Math.abs(singlePage.getWidth() - 240.94) < 1.0, `Width expected ~241, got ${singlePage.getWidth()}`);
      assert.ok(Math.abs(singlePage.getHeight() - 153.07) < 1.0, `Height expected ~153, got ${singlePage.getHeight()}`);

      // Verify 10-up A4
      const a4Doc = await PDFDocument.load(new Uint8Array(pdfBytesMap.bufA4));
      assert.equal(a4Doc.getPageCount(), 1);
      const a4Page = a4Doc.getPage(0);
      assert.ok(Math.abs(a4Page.getWidth() - 595.28) < 1.0, `A4 Width expected ~595, got ${a4Page.getWidth()}`);
      assert.ok(Math.abs(a4Page.getHeight() - 841.89) < 1.0, `A4 Height expected ~842, got ${a4Page.getHeight()}`);

      // Verify 10-up Letter
      const letterDoc = await PDFDocument.load(new Uint8Array(pdfBytesMap.bufLetter));
      assert.equal(letterDoc.getPageCount(), 1);
      const letterPage = letterDoc.getPage(0);
      assert.ok(Math.abs(letterPage.getWidth() - 612) < 1.0, `Letter Width expected 612, got ${letterPage.getWidth()}`);
      assert.ok(Math.abs(letterPage.getHeight() - 792) < 1.0, `Letter Height expected 792, got ${letterPage.getHeight()}`);
    });
  });

  // ----------------------------------------------------
  // WORKFLOW 7: Label Printing Templates and PDF Exports
  // ----------------------------------------------------
  describe('Workflow 7: Label Printing Templates and PDF Exports', () => {
    it('7.1 Switches to Label Printing, configures VDA 4902 V4 fields, and inspects visual mockup', async () => {
      const labelResult = await cdp.evaluate(`(async () => {
        document.querySelector('.nav-tab[data-module="labels"]').click();
        await new Promise(r => setTimeout(r, 400));

        const receiver = document.getElementById('lblReceiver');
        const part = document.getElementById('lblPartNumber');
        const qty = document.getElementById('lblQuantity');

        receiver.value = 'PORSCHE WERK ZUFFENHAUSEN';
        receiver.dispatchEvent(new Event('input', { bubbles: true }));

        part.value = '991 106 023 00';
        part.dispatchEvent(new Event('input', { bubbles: true }));

        qty.value = '150';
        qty.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 500));

        const mockup = document.getElementById('labelVisualMockup');
        return {
          mockupText: mockup?.textContent?.trim(),
          hasBarcode: Boolean(mockup?.querySelector('.vda-barcode-cell'))
        };
      })()`);

      assert.ok(labelResult.mockupText.includes('PORSCHE WERK ZUFFENHAUSEN'));
      assert.ok(labelResult.mockupText.includes('991 106 023 00'));
      assert.ok(labelResult.mockupText.includes('150'));
      assert.equal(labelResult.hasBarcode, true);
    });

    it('7.2 Switches across compliance templates (AIAG B-10, GS1 4x6" Shipping) and triggers PDF export', async () => {
      for (const tpl of ['aiag-b10', 'gs1-shipping', 'vda4902']) {
        const tplTest = await cdp.evaluate(`(async (targetTpl) => {
          const opt = document.querySelector(\`#labelTemplatesSelector .label-template-option[data-template="\${targetTpl}"]\`);
          opt.click();
          await new Promise(r => setTimeout(r, 300));

          // Fetch PDF for template
          const res = await fetch('/api/pdf/label', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              template: targetTpl,
              receiver: 'FACTORY TEST PLANT',
              partNumber: 'PART-9988',
              quantity: '40'
            })
          });

          const buf = Array.from(new Uint8Array(await res.arrayBuffer()));
          return {
            status: res.status,
            contentType: res.headers.get('content-type'),
            byteLength: buf.length,
            pdfHeader: String.fromCharCode(...buf.slice(0, 5))
          };
        })('${tpl}')`);

        assert.equal(tplTest.status, 200);
        assert.equal(tplTest.contentType, 'application/pdf');
        assert.ok(tplTest.byteLength > 1000);
        assert.equal(tplTest.pdfHeader, '%PDF-');
      }
    });

    it('7.3 Switches to CSV Grid Sheet template, inputs multiline CSV data, and exports multi-page PDF', async () => {
      const csvResult = await cdp.evaluate(`(async () => {
        // Switch to csv-sheet
        const opt = document.querySelector('#labelTemplatesSelector .label-template-option[data-template="csv-sheet"]');
        opt.click();
        await new Promise(r => setTimeout(r, 400));

        const stdFields = document.getElementById('labelStandardFields');
        const csvFields = document.getElementById('labelCsvGridFields');
        const csvArea = document.getElementById('labelCsvText');
        const cols = document.getElementById('labelCsvCols');
        const rows = document.getElementById('labelCsvRows');

        cols.value = '3';
        cols.dispatchEvent(new Event('change', { bubbles: true }));

        rows.value = '8';
        rows.dispatchEvent(new Event('change', { bubbles: true }));

        const testCsv = 'AssetTitle,AssetBarcode\\n' +
          Array.from({ length: 30 }, (_, i) => \`Asset \${i + 1},AST-\${String(i + 1).padStart(4, '0')}\`).join('\\n');

        csvArea.value = testCsv;
        csvArea.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 400));

        // Export PDF
        const res = await fetch('/api/pdf/label', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: 'csv-grid',
            csvText: testCsv,
            cols: 3,
            rows: 8,
            paperSize: 'a4'
          })
        });

        const buf = Array.from(new Uint8Array(await res.arrayBuffer()));

        return {
          stdHidden: stdFields && window.getComputedStyle(stdFields).display === 'none',
          csvVisible: csvFields && window.getComputedStyle(csvFields).display !== 'none',
          status: res.status,
          buf
        };
      })()`);

      assert.equal(csvResult.stdHidden, true, 'Standard fields must hide on CSV sheet');
      assert.equal(csvResult.csvVisible, true, 'CSV grid fields must show');
      assert.equal(csvResult.status, 200);

      // Verify multi-page PDF (30 items on 24 per page -> 2 pages)
      const doc = await PDFDocument.load(new Uint8Array(csvResult.buf));
      assert.equal(doc.getPageCount(), 2, '30 labels on 3x8 (24/page) grid should produce 2 pages');
    });

    it('7.4 Verifies zero unhandled exceptions throughout all 7 interactive workflow tests', async () => {
      assert.equal(cdp.exceptions.length, 0, `Detected ${cdp.exceptions.length} unhandled browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
    });
  });
});
