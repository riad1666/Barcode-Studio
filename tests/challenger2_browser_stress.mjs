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

class HeadlessRunner {
  constructor(browserPath) {
    this.browserPath = browserPath;
    this.proc = null;
    this.tmpDir = null;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.sessionId = null;
    this.exceptions = [];
  }

  async start() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-chal2-'));
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
        this.exceptions.push(desc);
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
    await new Promise((r) => setTimeout(r, 1200));
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
      this.proc.kill('SIGKILL');
    }
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('CHALLENGER 2: BROWSER WORKFLOWS STRESS HARNESS');
  console.log('======================================================\n');

  const browserPath = findBrowser();
  if (!browserPath) {
    console.error('No Chrome or Edge browser found on host!');
    process.exitCode = 1;
    return;
  }

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const runner = new HeadlessRunner(browserPath);
  await runner.start();

  try {
    console.log(`Navigating to ${baseUrl}...`);
    await runner.navigate(baseUrl);

    // ------------------------------------------------------------------
    // TEST 1: Large Sequence Generation (120 items) via Sequence Modal
    // ------------------------------------------------------------------
    console.log('\n[Test 1] Large Sequence Generation (120 items) in Sequence Modal:');
    const seqResult = await runner.evaluate(`(async () => {
      document.getElementById('openSequenceModalBtn').click();
      const modal = document.getElementById('sequenceModal');

      const prefix = document.getElementById('seqPrefix');
      const suffix = document.getElementById('seqSuffix');
      const start = document.getElementById('seqStart');
      const end = document.getElementById('seqEnd');
      const step = document.getElementById('seqStep');
      const mask = document.getElementById('seqMask');

      prefix.value = 'PALLET-';
      prefix.dispatchEvent(new Event('input', { bubbles: true }));

      suffix.value = '-CH';
      suffix.dispatchEvent(new Event('input', { bubbles: true }));

      start.value = '1';
      start.dispatchEvent(new Event('input', { bubbles: true }));

      end.value = '120';
      end.dispatchEvent(new Event('input', { bubbles: true }));

      step.value = '1';
      step.dispatchEvent(new Event('input', { bubbles: true }));

      mask.value = '$$$$$';
      mask.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for async sequence calculation
      await new Promise(r => setTimeout(r, 500));

      const badge = document.getElementById('seqCountBadge')?.textContent?.trim();
      const items = Array.from(document.querySelectorAll('#seqPreviewTable div')).map(d => d.textContent.trim());

      // Click Insert into Payload
      document.getElementById('seqInsertBtn').click();
      await new Promise(r => setTimeout(r, 400));

      const ta = document.getElementById('barcodePayload');
      const rowBadge = document.getElementById('payloadRowBadge')?.textContent?.trim();
      const lines = ta.value.split('\\n').filter(l => l.trim().length > 0);

      return {
        badge,
        previewCount: items.length,
        firstPreview: items[0],
        lastPreview: items[items.length - 1],
        payloadCount: lines.length,
        firstLine: lines[0],
        lastLine: lines[lines.length - 1],
        rowBadgeText: rowBadge,
        modalClosed: modal.getAttribute('aria-hidden') === 'true'
      };
    })()`);

    console.log('  Sequence Modal preview badge:', seqResult.badge);
    console.log('  Preview div count:', seqResult.previewCount);
    console.log('  First item:', seqResult.firstPreview);
    console.log('  Last item:', seqResult.lastPreview);
    console.log('  Payload row badge:', seqResult.rowBadgeText);
    console.log('  Payload lines count:', seqResult.payloadCount);

    assert.equal(seqResult.badge, '120 items');
    assert.equal(seqResult.previewCount, 120);
    assert.equal(seqResult.firstPreview, 'PALLET-00001-CH');
    assert.equal(seqResult.lastPreview, 'PALLET-00120-CH');
    assert.equal(seqResult.payloadCount, 120);
    assert.equal(seqResult.firstLine, 'PALLET-00001-CH');
    assert.equal(seqResult.lastLine, 'PALLET-00120-CH');
    assert.equal(seqResult.rowBadgeText, '120 rows');
    assert.equal(seqResult.modalClosed, true);
    console.log('  ✔ [PASS] 120-item sequence generated and inserted cleanly into payload');

    // ------------------------------------------------------------------
    // TEST 2: CSV Grid Sheet Pagination in Browser Runtime
    // ------------------------------------------------------------------
    console.log('\n[Test 2] CSV Grid Sheet Pagination in Browser Runtime:');

    // Switch to label printing module
    await runner.evaluate(`(async () => {
      document.querySelector('.nav-tab[data-module="labels"]').click();
      await new Promise(r => setTimeout(r, 400));
      document.querySelector('#labelTemplatesSelector .label-template-option[data-template="csv-sheet"]').click();
      await new Promise(r => setTimeout(r, 400));
    })()`);

    const boundaryCounts = [24, 25, 48, 49];
    const expectedPages = [1, 2, 2, 3];

    for (let i = 0; i < boundaryCounts.length; i += 1) {
      const count = boundaryCounts[i];
      const expPage = expectedPages[i];

      const res = await runner.evaluate(`(async (rowCount) => {
        const testCsv = 'Title,Code\\n' +
          Array.from({ length: rowCount }, (_, idx) => \`Label \${idx + 1},SKU-\${String(idx + 1).padStart(4, '0')}\`).join('\\n');

        const csvArea = document.getElementById('labelCsvText');
        csvArea.value = testCsv;
        csvArea.dispatchEvent(new Event('input', { bubbles: true }));

        const cols = document.getElementById('labelCsvCols');
        cols.value = '3';
        cols.dispatchEvent(new Event('change', { bubbles: true }));

        const rows = document.getElementById('labelCsvRows');
        rows.value = '8';
        rows.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 200));

        const r = await fetch('/api/pdf/label', {
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

        const buf = Array.from(new Uint8Array(await r.arrayBuffer()));
        return { status: r.status, byteLength: buf.length, buf };
      })(${count})`);

      assert.equal(res.status, 200);
      assert.ok(res.byteLength > 1000);

      const doc = await PDFDocument.load(new Uint8Array(res.buf));
      const pageCount = doc.getPageCount();
      console.log(`  Count ${count} items -> ${pageCount} pages (expected ${expPage})`);
      assert.equal(pageCount, expPage, `Expected ${expPage} pages for ${count} items, got ${pageCount}`);
    }
    console.log('  ✔ [PASS] Boundary pagination 24=1, 25=2, 48=2, 49=3 verified in browser');

    // ------------------------------------------------------------------
    // TEST 3: Browser Unhandled Exceptions Check
    // ------------------------------------------------------------------
    console.log('\n[Test 3] Browser Unhandled Exceptions Audit:');
    console.log(`  Exceptions recorded: ${runner.exceptions.length}`);
    if (runner.exceptions.length > 0) {
      console.error('  Exceptions:', runner.exceptions);
    }
    assert.equal(runner.exceptions.length, 0, 'Zero uncaught browser exceptions expected');
    console.log('  ✔ [PASS] 0 uncaught exceptions recorded across all browser actions');

    console.log('\n======================================================');
    console.log('ALL CHALLENGER 2 BROWSER STRESS TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    await runner.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
