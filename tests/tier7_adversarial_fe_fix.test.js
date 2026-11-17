import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { PDFDocument } from 'pdf-lib';
import { app } from '../server.js';
import { listSymbologies, getSymbology } from '../src/symbologies/catalog.js';
import { buildGs1DigitalLink, validateGs1DigitalLink, GS1_PRIMARY_KEYS, GS1_QUALIFIERS } from '../src/forms/gs1DigitalLink.js';
import { renderBarcode } from '../src/symbologies/renderer.js';
import { generateBusinessCardPdf } from '../src/pdf/businessCardPdf.js';
import { generateLabelPdf } from '../src/pdf/labelPdf.js';
import { generateSequence } from '../src/symbologies/formatters.js';
import { buildVCardPayload } from '../src/forms/tagging.js';

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
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-adversarial-'));
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
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`CDP evaluate exception: ${desc}`);
    }
    return res.result?.value;
  }

  async stop() {
    try {
      if (this.browserWs) this.browserWs.close();
    } catch {}
    try {
      if (this.proc) this.proc.kill();
    } catch {}
    try {
      if (this.tmpDir && fs.existsSync(this.tmpDir)) {
        fs.rmSync(this.tmpDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

/** Mirror of the search scoring algorithm in public/js/components/searchPalette.js */
function scoreSymbologies(query, symbologies) {
  if (!query) return symbologies.slice(0, 15);
  const cleanQuery = query.toLowerCase().trim();
  const tokens = cleanQuery.replace(/[()_-]/g, ' ').split(/\s+/).filter(Boolean);

  const scored = [];
  for (const s of symbologies) {
    const name = (s.name || '').toLowerCase();
    const id = (s.id || '').toLowerCase();
    const bcid = (s.bcid || '').toLowerCase();
    const desc = (s.description || '').toLowerCase();
    const cat = (s.categoryName || '').toLowerCase();
    const haystack = `${name} ${id} ${bcid} ${desc} ${cat}`;

    let score = 0;
    if (name === cleanQuery) score += 1000;
    else if (id === cleanQuery.replace(/\s+/g, '')) score += 900;
    else if (name.startsWith(cleanQuery)) score += 800;
    else if (name.includes(cleanQuery)) score += 600;
    else if (id.includes(cleanQuery.replace(/\s+/g, ''))) score += 500;
    else if (bcid && bcid.includes(cleanQuery.replace(/\s+/g, ''))) score += 300;
    else if (desc.includes(cleanQuery)) score += 100;
    else if (cat.includes(cleanQuery)) score += 50;

    if (tokens.length > 0) {
      const allTokensMatch = tokens.every((t) => haystack.includes(t));
      if (allTokensMatch) {
        score += 250;
        const nameTokens = tokens.filter((t) => name.includes(t)).length;
        score += nameTokens * 50;
      }
    }

    if (score > 0) {
      scored.push({ item: s, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((e) => e.item);
}

describe('Tier 7: Empirical Adversarial Stress Testing of Frontend Fixes', () => {
  let server;
  let serverPort;
  let baseUrl;
  let cdp;
  const browserPath = findBrowserExecutable();
  const allSyms = listSymbologies();

  before(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    serverPort = server.address().port;
    baseUrl = `http://127.0.0.1:${serverPort}`;

    if (browserPath) {
      cdp = new CdpRunner(browserPath);
      await cdp.start();
      await cdp.setViewport(1440, 900);
    }
  });

  after(async () => {
    if (cdp) await cdp.stop();
    if (server) await new Promise((r) => server.close(r));
  });

  // ---------------------------------------------------------------------------
  // AREA 1: Search Scoring & Ranking Stress
  // ---------------------------------------------------------------------------
  describe('Area 1: Search Scoring & Ranking with Conflicting Queries', () => {
    it('1.1 Exact match "Data Matrix" ranks DataMatrix #1 above Royal Mail Mailmark 2D', () => {
      const results = scoreSymbologies('Data Matrix', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'DataMatrix');
      assert.notEqual(results[0].id, 'RoyalMail2D');
    });

    it('1.2 Exact match "QR Code" ranks QRCode #1 above Micro QR and GS1 QR', () => {
      const results = scoreSymbologies('QR Code', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'QRCode');
      assert.notEqual(results[0].id, 'MicroQRCode');
      assert.notEqual(results[0].id, 'GS1QRCode');
    });

    it('1.3 Exact match "Code 128" ranks Code128 #1 above subsets A/B/C and GS1-128', () => {
      const results = scoreSymbologies('Code 128', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'Code128');
    });

    it('1.4 Exact match "PDF417" ranks PDF417 #1 above MicroPDF417 and Compact PDF417', () => {
      const results = scoreSymbologies('PDF417', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'PDF417');
    });

    it('1.5 Exact match "EAN-13" ranks EAN13 #1 above EAN-8 and EAN-14', () => {
      const results = scoreSymbologies('EAN-13', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'EAN13');
    });

    it('1.6 Punctuation and parenthesis query "GS1 Digital Link (QR)" ranks GS1DigitalLink_QRCode #1', () => {
      const results = scoreSymbologies('GS1 Digital Link (QR)', allSyms);
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'GS1DigitalLink_QRCode');
    });

    it('1.7 Confusing query "GS1 Digital Link" ranks GS1DigitalLink_QRCode and GS1DigitalLink_DataMatrix top', () => {
      const results = scoreSymbologies('GS1 Digital Link', allSyms);
      assert.ok(results.length >= 2);
      const topIds = [results[0].id, results[1].id];
      assert.ok(topIds.includes('GS1DigitalLink_QRCode'));
      assert.ok(topIds.includes('GS1DigitalLink_DataMatrix'));
    });

    it('1.8 Hostile regex metacharacters in query do not crash and resolve gracefully', () => {
      const hostileQueries = [
        '.*+?^${}()|[]\\',
        '(.*)',
        '[a-z]+',
        '\\d{2,4}',
        '???***',
        '   () --- _   ',
      ];
      for (const q of hostileQueries) {
        assert.doesNotThrow(() => {
          const res = scoreSymbologies(q, allSyms);
          assert.ok(Array.isArray(res));
        });
      }
    });

    it('1.9 Excessive whitespace and mixed casing resolve correctly', () => {
      const res1 = scoreSymbologies('   dAtA   mAtRiX   ', allSyms);
      assert.equal(res1[0].id, 'DataMatrix');

      const res2 = scoreSymbologies('   pDf417   ', allSyms);
      assert.equal(res2[0].id, 'PDF417');
    });

    it('1.10 In-browser Ctrl+K search modal ranking verification', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const searchTest = await cdp.evaluate(`(async () => {
        const input = document.getElementById('searchPaletteInput');
        const resultsEl = document.getElementById('searchPaletteResults');

        // Trigger open search
        document.querySelector('[data-open-search]').click();
        await new Promise(r => setTimeout(r, 200));

        // Search "Data Matrix"
        input.value = 'Data Matrix';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));

        const firstItem = resultsEl.querySelector('.search-result-item span[style*="font-weight: 600"]')?.textContent.trim();

        // Search "GS1 Digital Link (QR)"
        input.value = 'GS1 Digital Link (QR)';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));

        const gs1Item = resultsEl.querySelector('.search-result-item span[style*="font-weight: 600"]')?.textContent.trim();

        // Close modal
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        return { firstItem, gs1Item };
      })()`);

      assert.equal(searchTest.firstItem, 'Data Matrix');
      assert.equal(searchTest.gs1Item, 'GS1 Digital Link QR code');
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 2: Quick-Jump Pills & URL State Synchronization
  // ---------------------------------------------------------------------------
  describe('Area 2: Quick-Jump Pills URL State Synchronization', () => {
    it('2.1 Verifies all 9 quick-jump pills exist with data-sym-id', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const pills = await cdp.evaluate(`(() => {
        const items = Array.from(document.querySelectorAll('#quickJumpPills .pill-item'));
        return items.map(p => ({
          symId: p.dataset.symId,
          text: p.textContent.trim(),
          active: p.classList.contains('active')
        }));
      })()`);

      assert.equal(pills.length, 9);
      const symIds = pills.map(p => p.symId.toLowerCase());
      assert.ok(symIds.includes('pdf417'));
      assert.ok(symIds.includes('qrcode'));
      assert.ok(symIds.includes('code128'));
      assert.ok(symIds.includes('datamatrix'));
      assert.ok(symIds.includes('ean13'));
    });

    it('2.2 Clicking pill updates URL, state, active class, and payload textarea', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const clickTest = await cdp.evaluate(`(async () => {
        const qrPill = document.querySelector('#quickJumpPills .pill-item[data-sym-id="QRCode"]');
        qrPill.click();
        await new Promise(r => setTimeout(r, 400));

        const state1 = {
          pathname: window.location.pathname,
          activePill: document.querySelector('#quickJumpPills .pill-item.active')?.dataset.symId,
          title: document.getElementById('activeSymbologyTitle')?.textContent?.trim(),
          payloadVal: document.getElementById('barcodePayload')?.value
        };

        const eanPill = document.querySelector('#quickJumpPills .pill-item[data-sym-id="EAN13"]');
        eanPill.click();
        await new Promise(r => setTimeout(r, 400));

        const state2 = {
          pathname: window.location.pathname,
          activePill: document.querySelector('#quickJumpPills .pill-item.active')?.dataset.symId,
          title: document.getElementById('activeSymbologyTitle')?.textContent?.trim(),
          payloadVal: document.getElementById('barcodePayload')?.value
        };

        return { state1, state2 };
      })()`);

      assert.equal(clickTest.state1.pathname, '/en/qrcode');
      assert.equal(clickTest.state1.activePill, 'QRCode');
      assert.equal(clickTest.state1.title, 'QR Code');

      assert.equal(clickTest.state2.pathname, '/en/ean13');
      assert.equal(clickTest.state2.activePill, 'EAN13');
      assert.equal(clickTest.state2.title, 'EAN-13');
    });

    it('2.3 Browser history popstate restores state and updates active pill', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const popstateTest = await cdp.evaluate(`(async () => {
        // Step 1: Click QRCode
        document.querySelector('#quickJumpPills .pill-item[data-sym-id="QRCode"]').click();
        await new Promise(r => setTimeout(r, 300));

        // Step 2: Click Code128
        document.querySelector('#quickJumpPills .pill-item[data-sym-id="Code128"]').click();
        await new Promise(r => setTimeout(r, 300));

        // Step 3: History back
        window.history.back();
        await new Promise(r => setTimeout(r, 400));

        return {
          pathname: window.location.pathname,
          activePill: document.querySelector('#quickJumpPills .pill-item.active')?.dataset.symId,
          title: document.getElementById('activeSymbologyTitle')?.textContent?.trim()
        };
      })()`);

      assert.equal(popstateTest.pathname, '/en/qrcode');
      assert.equal(popstateTest.activePill, 'QRCode');
      assert.equal(popstateTest.title, 'QR Code');
    });

    it('2.4 Direct bookmarkable URL with mixed case resolves properly', async () => {
      if (!cdp) return;
      await cdp.navigate(`${baseUrl}/en/DataMatrix`);
      await new Promise(r => setTimeout(r, 400));

      const directRoute = await cdp.evaluate(`(() => {
        return {
          pathname: window.location.pathname,
          title: document.getElementById('activeSymbologyTitle')?.textContent?.trim(),
          activePill: document.querySelector('#quickJumpPills .pill-item.active')?.dataset.symId
        };
      })()`);

      assert.equal(directRoute.title, 'Data Matrix');
      assert.equal(directRoute.activePill, 'DataMatrix');
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 3: GS1 Digital Link Builder Edge Cases & Special Characters
  // ---------------------------------------------------------------------------
  describe('Area 3: GS1 Digital Link Builder Edge Cases & Special Characters', () => {
    it('3.1 Handles null, undefined, and empty state without throwing', () => {
      assert.doesNotThrow(() => {
        const url1 = buildGs1DigitalLink();
        assert.ok(url1.startsWith('https://'));

        const url2 = buildGs1DigitalLink(null);
        assert.ok(url2.startsWith('https://'));

        const url3 = buildGs1DigitalLink({});
        assert.ok(url3.startsWith('https://'));

        const err1 = validateGs1DigitalLink();
        assert.ok(err1.PrimaryKeyValue);

        const err2 = validateGs1DigitalLink(null);
        assert.ok(err2.PrimaryKeyValue);
      });
    });

    it('3.2 Encodes special characters in qualifiers and attributes safely', () => {
      const state = {
        GS1Resolver: 'https://id.gs1.org',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '09506000134376',
        KeyQualifier10: 'LOT/45#99?&=+',
        KeyQualifier21: 'SN:123 456/A',
        attributes: [
          { key: '17', value: '251231' },
          { key: '3103', value: '001500' },
          { key: '91', value: 'COMPANY/A&B=C' },
        ],
      };

      const uri = buildGs1DigitalLink(state);

      // Verify segments are properly URI encoded
      assert.ok(uri.includes('/10/LOT%2F45%2399%3F%26%3D%2B'));
      assert.ok(uri.includes('/21/SN%3A123%20456%2FA'));
      assert.ok(uri.includes('17=251231'));
      assert.ok(uri.includes('3103=001500'));
      assert.ok(uri.includes('91=COMPANY%2FA%26B%3DC'));
    });

    it('3.3 Strips multiple trailing slashes from custom resolver', () => {
      const state = {
        GS1Resolver: 'https://id.gs1.org///',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '09506000134376',
        attributes: [],
      };
      const uri = buildGs1DigitalLink(state);
      assert.ok(uri.startsWith('https://id.gs1.org/01/09506000134376'));
      assert.ok(!uri.includes('https://id.gs1.org//'));
    });

    it('3.4 Validates primary key format, attribute digit keys, and duplicate keys', () => {
      // Invalid GTIN (letters)
      const err1 = validateGs1DigitalLink({
        GS1Resolver: 'https://id.gs1.org',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: 'INVALID_GTIN',
      });
      assert.ok(err1.PrimaryKeyValue);

      // Non-numeric attribute key
      const err2 = validateGs1DigitalLink({
        GS1Resolver: 'https://id.gs1.org',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '09506000134376',
        attributes: [{ key: 'ABC', value: '123' }],
      });
      assert.ok(err2.attr_0);

      // Duplicate attribute keys
      const err3 = validateGs1DigitalLink({
        GS1Resolver: 'https://id.gs1.org',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '09506000134376',
        attributes: [
          { key: '17', value: '251231' },
          { key: '17', value: '261231' },
        ],
      });
      assert.ok(err3.attr_1);
    });

    it('3.5 Renders built GS1 Digital Link URI as valid QR barcode image', async () => {
      const uri = buildGs1DigitalLink({
        GS1Resolver: 'https://id.gs1.org',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '09506000134376',
        KeyQualifier10: 'LOT123',
        attributes: [{ key: '17', value: '251231' }],
      });

      const res = await renderBarcode({
        code: 'QRCode',
        data: uri,
        imagetype: 'png',
        dpi: 96,
      });

      assert.equal(res.mimeType, 'image/png');
      assert.ok(res.buffer.length > 100);
      // Valid PNG signature
      assert.equal(res.buffer[0], 0x89);
      assert.equal(res.buffer[1], 0x50);
      assert.equal(res.buffer[2], 0x4e);
      assert.equal(res.buffer[3], 0x47);
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 4: Sequence Modal Row Formatting & Row Count Badge Updates
  // ---------------------------------------------------------------------------
  describe('Area 4: Sequence Modal Row Formatting & Row Count Badge Updates', () => {
    it('4.1 Generates 20 rows with mask BOX-$$$$-CH', () => {
      const rows = generateSequence({
        prefix: 'BOX-',
        suffix: '-CH',
        start: 1,
        end: 20,
        increment: 1,
        mask: '$$$$',
      });

      assert.equal(rows.length, 20);
      assert.equal(rows[0], 'BOX-0001-CH');
      assert.equal(rows[19], 'BOX-0020-CH');
    });

    it('4.2 In-browser sequence modal renders child <div> items without unwanted prefix', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const modalTest = await cdp.evaluate(`(async () => {
        // Open modal
        document.getElementById('openSequenceModalBtn')?.click();
        await new Promise(r => setTimeout(r, 200));

        // Configure fields
        document.getElementById('seqPrefix').value = 'BOX-';
        document.getElementById('seqSuffix').value = '-CH';
        document.getElementById('seqStart').value = '1';
        document.getElementById('seqEnd').value = '20';
        document.getElementById('seqStep').value = '1';
        document.getElementById('seqMask').value = '$$$$';

        // Trigger input event
        document.getElementById('seqPrefix').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        const previewContainer = document.getElementById('seqPreviewTable');
        const childDivs = Array.from(previewContainer.querySelectorAll('div'));
        const countBadge = document.getElementById('seqCountBadge')?.textContent;

        return {
          divCount: childDivs.length,
          firstText: childDivs[0]?.textContent,
          lastText: childDivs[childDivs.length - 1]?.textContent,
          countBadge
        };
      })()`);

      assert.equal(modalTest.divCount, 20);
      assert.equal(modalTest.firstText, 'BOX-0001-CH');
      assert.equal(modalTest.lastText, 'BOX-0020-CH');
      assert.equal(modalTest.countBadge, '20 items');
    });

    it('4.3 Escapes HTML characters in sequence prefix preventing XSS', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const xssTest = await cdp.evaluate(`(async () => {
        document.getElementById('openSequenceModalBtn')?.click();
        await new Promise(r => setTimeout(r, 200));

        document.getElementById('seqPrefix').value = '<b id="xss">BOLD</b>';
        document.getElementById('seqStart').value = '1';
        document.getElementById('seqEnd').value = '2';
        document.getElementById('seqPrefix').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        const previewContainer = document.getElementById('seqPreviewTable');
        const hasInjectedBold = previewContainer.querySelector('#xss') !== null;
        const text = previewContainer.querySelector('div')?.textContent;

        return { hasInjectedBold, text };
      })()`);

      assert.equal(xssTest.hasInjectedBold, false);
      assert.ok(xssTest.text.includes('<b id="xss">BOLD</b>'));
    });

    it('4.4 Inserting sequence updates badge to "20 rows", enables batch toggle and shows download button', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const applyTest = await cdp.evaluate(`(async () => {
        document.getElementById('openSequenceModalBtn')?.click();
        await new Promise(r => setTimeout(r, 200));

        document.getElementById('seqPrefix').value = 'BOX-';
        document.getElementById('seqSuffix').value = '-CH';
        document.getElementById('seqStart').value = '1';
        document.getElementById('seqEnd').value = '20';
        document.getElementById('seqMask').value = '$$$$';
        document.getElementById('seqPrefix').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        // Click Insert into Payload
        document.getElementById('seqInsertBtn')?.click();
        await new Promise(r => setTimeout(r, 300));

        const badge = document.getElementById('payloadRowBadge')?.textContent?.trim();
        const batchChecked = document.getElementById('toggleBatchZip')?.checked;
        const batchBtnDisplay = document.getElementById('batchZipDownloadBtn')?.style.display;
        const lines = document.getElementById('barcodePayload')?.value.trim().split('\\n').filter(l => l.trim().length > 0);

        return { badge, batchChecked, batchBtnDisplay, lineCount: lines.length };
      })()`);

      assert.equal(applyTest.badge, '20 rows');
      assert.equal(applyTest.batchChecked, true);
      assert.equal(applyTest.batchBtnDisplay, 'inline-flex');
      assert.equal(applyTest.lineCount, 20);
    });

    it('4.5 Dynamic manual text edits correctly update payload row badge', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const badgeTest = await cdp.evaluate(`(async () => {
        const textarea = document.getElementById('barcodePayload');
        const badge = document.getElementById('payloadRowBadge');

        // Single line
        textarea.value = 'LINE1';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const single = badge.textContent?.trim();

        // Multiple lines with blank gaps
        textarea.value = 'LINE1\\n\\nLINE2\\n\\nLINE3\\n';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const multi = badge.textContent?.trim();

        // Empty
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const empty = badge.textContent?.trim();

        return { single, multi, empty };
      })()`);

      assert.equal(badgeTest.single, '1 row');
      assert.equal(badgeTest.multi, '3 rows');
      assert.equal(badgeTest.empty, '0 rows');
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 5: QR Studio vCard Fields, Size Presets, and Transparent PNG
  // ---------------------------------------------------------------------------
  describe('Area 5: QR Studio vCard Fields, Size Presets, and Transparent PNG', () => {
    it('5.1 vCard form element IDs (#qr_vc_fn, #qr_vc_ln) update state and payload', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const vcardTest = await cdp.evaluate(`(async () => {
        // Switch to QR Studio
        document.querySelector('.nav-tab[data-module="qr-studio"]')?.click();
        await new Promise(r => setTimeout(r, 200));

        // Select vCard preset
        document.querySelector('.qr-preset-card[data-preset-id="vcard"]')?.click();
        await new Promise(r => setTimeout(r, 200));

        const fn = document.getElementById('qr_vc_fn');
        const ln = document.getElementById('qr_vc_ln');
        const org = document.getElementById('qr_vc_org');

        if (!fn || !ln) return { found: false };

        fn.value = 'Nikola';
        fn.dispatchEvent(new Event('input', { bubbles: true }));

        ln.value = 'Tesla';
        ln.dispatchEvent(new Event('input', { bubbles: true }));

        org.value = 'Tesla Motors';
        org.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        const img = document.getElementById('qrStudioRenderImg');

        return {
          found: true,
          fnVal: fn.value,
          lnVal: ln.value,
          orgVal: org.value,
          hasImg: Boolean(img),
          imgSrc: img ? img.src.substring(0, 30) : null
        };
      })()`);

      assert.equal(vcardTest.found, true);
      assert.equal(vcardTest.fnVal, 'Nikola');
      assert.equal(vcardTest.lnVal, 'Tesla');
      assert.equal(vcardTest.hasImg, true);
      assert.ok(vcardTest.imgSrc?.startsWith('data:image/png;base64,'));
    });

    it('5.2 Size presets switch active classes on buttons', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const sizeTest = await cdp.evaluate(`(async () => {
        document.querySelector('.nav-tab[data-module="qr-studio"]')?.click();
        await new Promise(r => setTimeout(r, 200));

        const sizes = [200, 400, 800, 1200];
        const results = [];

        for (const sz of sizes) {
          const btn = document.querySelector(\`#qrSizePresets .segmented-btn[data-size="\${sz}"]\`);
          if (btn) {
            btn.click();
            await new Promise(r => setTimeout(r, 100));
            results.push({
              sz,
              isActive: btn.classList.contains('active')
            });
          }
        }
        return results;
      })()`);

      assert.equal(sizeTest.length, 4);
      for (const res of sizeTest) {
        assert.equal(res.isActive, true);
      }
    });

    it('5.3 EC level switches active class on button H', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const ecTest = await cdp.evaluate(`(async () => {
        document.querySelector('.nav-tab[data-module="qr-studio"]')?.click();
        await new Promise(r => setTimeout(r, 200));

        const btnH = document.querySelector('#qrEcPresets .segmented-btn[data-ec="H"]');
        btnH.click();
        await new Promise(r => setTimeout(r, 100));

        return {
          isActive: btnH.classList.contains('active')
        };
      })()`);

      assert.equal(ecTest.isActive, true);
    });

    it('5.4 Transparent background produces PNG with true alpha channel and zero alpha background', async () => {
      // 1. Transparent PNG
      const resTrans = await renderBarcode({
        code: 'QRCode',
        data: 'https://example.com/test-transparent',
        transparent: true,
        imagetype: 'png',
        dpi: 96,
      });

      assert.equal(resTrans.mimeType, 'image/png');
      const pngTrans = PNG.sync.read(resTrans.buffer);
      assert.equal(pngTrans.alpha, true, 'PNG must have an alpha channel');

      // Transparent barcode must contain pixels with alpha === 0
      const transparentPixelCount = Array.from(pngTrans.data).filter((val, i) => i % 4 === 3 && val === 0).length;
      assert.ok(transparentPixelCount > 1000, `Expected > 1000 transparent pixels, got ${transparentPixelCount}`);

      // 2. Non-transparent PNG
      const resOpaque = await renderBarcode({
        code: 'QRCode',
        data: 'https://example.com/test-opaque',
        transparent: false,
        bgcolor: 'ffffff',
        imagetype: 'png',
        dpi: 96,
      });

      const pngOpaque = PNG.sync.read(resOpaque.buffer);
      const opaqueTransparentCount = Array.from(pngOpaque.data).filter((val, i) => i % 4 === 3 && val === 0).length;
      assert.equal(opaqueTransparentCount, 0, 'Opaque background must have zero transparent pixels');

      // 3. Transparent PNG with quiet zone margin
      const resTransQuiet = await renderBarcode({
        code: 'QRCode',
        data: 'https://example.com/test-quiet',
        transparent: true,
        imagetype: 'png',
        dpi: 96,
        quiet: 10,
        qunit: 'px',
      });
      const pngTransQuiet = PNG.sync.read(resTransQuiet.buffer);
      assert.equal(pngTransQuiet.data[3], 0, 'Transparent quiet zone corner pixel must have alpha = 0');
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 6: Business Card Letter Size PDF Dimensions (612x792 pt)
  // ---------------------------------------------------------------------------
  describe('Area 6: Business Card Letter Size PDF Dimensions (612x792 pt)', () => {
    it('6.1 Generates 10-up Letter PDF with dimensions exactly 612x792 pt for layout="letter-10up"', async () => {
      const pdfBuffer = await generateBusinessCardPdf({
        layout: 'letter-10up',
        template: 'classic-minimal',
        contact: {
          fullName: 'Jane Doe',
          title: 'Senior Engineer',
          company: 'Acme Labs',
          email: 'jane@acme.com',
          phone: '+1-555-0199',
        },
      });

      assert.ok(pdfBuffer.length > 500);
      assert.equal(pdfBuffer.slice(0, 5).toString(), '%PDF-');

      const doc = await PDFDocument.load(pdfBuffer);
      assert.equal(doc.getPageCount(), 1);
      const page = doc.getPage(0);
      assert.equal(Math.round(page.getWidth()), 612);
      assert.equal(Math.round(page.getHeight()), 792);
    });

    it('6.2 Generates 10-up Letter PDF with dimensions exactly 612x792 pt for layout="sheet10" & pageSize="letter"', async () => {
      const pdfBuffer = await generateBusinessCardPdf({
        layout: 'sheet10',
        pageSize: 'letter',
        template: 'executive-band',
        contact: {
          fullName: 'John Smith',
          title: 'Chief Architect',
        },
      });

      const doc = await PDFDocument.load(pdfBuffer);
      const page = doc.getPage(0);
      assert.equal(Math.round(page.getWidth()), 612);
      assert.equal(Math.round(page.getHeight()), 792);
    });

    it('6.3 Generates 10-up A4 PDF with dimensions exactly 595.28x841.89 pt for pageSize="a4"', async () => {
      const pdfBuffer = await generateBusinessCardPdf({
        layout: 'sheet10',
        pageSize: 'a4',
        template: 'accent-rail',
      });

      const doc = await PDFDocument.load(pdfBuffer);
      const page = doc.getPage(0);
      assert.equal(Math.round(page.getWidth()), 595);
      assert.equal(Math.round(page.getHeight()), 842);
    });

    it('6.4 Generates single 85x54mm card PDF with dimensions exactly 240.94x153.07 pt', async () => {
      const pdfBuffer = await generateBusinessCardPdf({
        layout: 'single',
        template: 'compact-split',
      });

      const doc = await PDFDocument.load(pdfBuffer);
      const page = doc.getPage(0);
      assert.equal(Math.round(page.getWidth() * 100) / 100, 240.94);
      assert.equal(Math.round(page.getHeight() * 100) / 100, 153.07);
    });

    it('6.5 Stress-tests all 4 templates with embedded PNG and JPG logos', async () => {
      // 1x1 transparent PNG data URL
      const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const templates = ['classic-minimal', 'executive-band', 'accent-rail', 'compact-split'];

      for (const tpl of templates) {
        const buf = await generateBusinessCardPdf({
          layout: 'letter-10up',
          template: tpl,
          logoDataUrl: pngDataUrl,
          contact: {
            fullName: `Test ${tpl}`,
            title: 'Design Specialist',
            company: 'Design System Corp',
          },
        });
        assert.ok(buf.length > 500);
        const doc = await PDFDocument.load(buf);
        assert.equal(doc.getPageCount(), 1);
        const page = doc.getPage(0);
        assert.equal(Math.round(page.getWidth()), 612);
        assert.equal(Math.round(page.getHeight()), 792);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AREA 7: Label Printing Visual Mockups & CSV Grid Multi-Page PDF Generation
  // ---------------------------------------------------------------------------
  describe('Area 7: Label Printing Mockups & CSV Grid Multi-Page PDF Generation', () => {
    it('7.1 VDA 4902 visual mockup contains .vda-barcode-cell in DOM', async () => {
      if (!cdp) return;
      await cdp.navigate(baseUrl);

      const vdaMockup = await cdp.evaluate(`(async () => {
        document.querySelector('.nav-tab[data-module="labels"]')?.click();
        await new Promise(r => setTimeout(r, 200));

        // Ensure VDA 4902 is selected
        const opt = document.querySelector('#labelTemplatesSelector .label-template-option[data-template="vda4902"]');
        if (opt) opt.click();
        await new Promise(r => setTimeout(r, 200));

        const container = document.getElementById('labelVisualMockup');
        const hasBarcodeRow = container?.querySelector('.vda-barcode-row') !== null;
        const hasBarcodeCell = container?.querySelector('.vda-barcode-cell') !== null;
        const cellText = container?.querySelector('.vda-barcode-cell')?.textContent;

        return { hasBarcodeRow, hasBarcodeCell, cellText };
      })()`);

      assert.equal(vdaMockup.hasBarcodeRow, true);
      assert.equal(vdaMockup.hasBarcodeCell, true);
      assert.ok(vdaMockup.cellText.includes('PDF417 TRANSPORT SUMMARY MANIFEST'));
    });

    it('7.2 CSV Grid Sheet with 30 items on 3 cols x 8 rows generates exactly 2 pages', async () => {
      // 30 items, 24 per page -> Page 1: 24, Page 2: 6
      const csvHeader = 'sku,barcode\n';
      const csvRows = Array.from({ length: 30 }, (_, i) => `SKU-${1000 + i},LABEL-ITEM-${1000 + i}`).join('\n');
      const csvText = csvHeader + csvRows;

      const pdfBuffer = await generateLabelPdf({
        template: 'csv-grid',
        csvText,
        cols: 3,
        rows: 8,
        paperSize: 'letter',
      });

      assert.ok(pdfBuffer.length > 1000);
      assert.equal(pdfBuffer.slice(0, 5).toString(), '%PDF-');

      const doc = await PDFDocument.load(pdfBuffer);
      assert.equal(doc.getPageCount(), 2, '30 items on 24 per page must yield exactly 2 pages');

      const p1 = doc.getPage(0);
      assert.equal(Math.round(p1.getWidth()), 612);
      assert.equal(Math.round(p1.getHeight()), 792);

      const p2 = doc.getPage(1);
      assert.equal(Math.round(p2.getWidth()), 612);
      assert.equal(Math.round(p2.getHeight()), 792);
    });

    it('7.3 CSV Grid Sheet with 50 items on 3 cols x 8 rows generates exactly 3 pages', async () => {
      // 50 items, 24 per page -> Page 1: 24, Page 2: 24, Page 3: 2
      const csvHeader = 'title,data\n';
      const csvRows = Array.from({ length: 50 }, (_, i) => `PART-${i + 1},DATA-${i + 1}`).join('\n');
      const csvText = csvHeader + csvRows;

      const pdfBuffer = await generateLabelPdf({
        template: 'csv-sheet',
        csvText,
        cols: 3,
        rows: 8,
        paperSize: 'a4',
      });

      const doc = await PDFDocument.load(pdfBuffer);
      assert.equal(doc.getPageCount(), 3, '50 items on 24 per page must yield exactly 3 pages');

      const page = doc.getPage(0);
      assert.equal(Math.round(page.getWidth()), 595);
      assert.equal(Math.round(page.getHeight()), 842);
    });

    it('7.4 Robust column parsing across varied header names and single-column CSV', async () => {
      // Single column CSV without title
      const singleColCsv = 'code\n' + Array.from({ length: 5 }, (_, i) => `SINGLE-${i}`).join('\n');
      const bufSingle = await generateLabelPdf({
        template: 'csv-grid',
        csvText: singleColCsv,
        cols: 2,
        rows: 3,
      });
      const docSingle = await PDFDocument.load(bufSingle);
      assert.equal(docSingle.getPageCount(), 1);

      // Semicolon delimited CSV with European header names
      const semiCsv = 'Bezeichnung;Artikelnummer\n' + Array.from({ length: 10 }, (_, i) => `Teil ${i};ART-${i}`).join('\n');
      const bufSemi = await generateLabelPdf({
        template: 'csv-grid',
        csvText: semiCsv,
        cols: 2,
        rows: 3,
      });
      const docSemi = await PDFDocument.load(bufSemi);
      assert.equal(docSemi.getPageCount(), 2, '10 items on 6 per page must yield 2 pages');
    });

    it('7.5 End-to-end browser workflow verification: zero unhandled exceptions', () => {
      if (!cdp) return;
      assert.equal(cdp.exceptions.length, 0, `Detected unhandled browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
    });
  });
});
