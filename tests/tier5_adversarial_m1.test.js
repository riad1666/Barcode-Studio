import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import JSZip from 'jszip';
import { renderBarcode } from '../src/symbologies/renderer.js';
import { renderBatchZip } from '../src/utils/batch.js';
import { computeGs1CheckDigit } from '../src/symbologies/wrappers.js';
import { app } from '../server.js';

function isPng(buf) {
  return buf && buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
}

function isJpg(buf) {
  return buf && buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
}

function isGif(buf) {
  return buf && buf.length >= 6 &&
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
    (buf[4] === 0x39 || buf[4] === 0x37) && buf[5] === 0x61;
}

function isSvg(buf) {
  const str = buf.toString('utf8').trim();
  return str.startsWith('<svg') && str.includes('xmlns="http://www.w3.org/2000/svg"') && str.endsWith('</svg>');
}

function isZip(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
}

describe('Tier 5: Adversarial Stress Suite (Milestone M1 Empirical Challenge)', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('5.1 OnError Handling Modes Empirical Stress', () => {
    it('OnErrorDisplay: returns valid format-specific error graphic for invalid input (PNG, SVG, JPG, GIF)', async () => {
      for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
        const res = await renderBarcode({ code: 'EAN13', data: 'NOT_NUMERIC', imagetype: fmt, onerror: 'OnErrorDisplay' });
        assert.equal(res.status, 200);
        assert.ok(res.errorMessage);
        assert.ok(res.buffer.length > 0);

        if (fmt === 'png') assert.ok(isPng(res.buffer));
        if (fmt === 'svg') assert.ok(isSvg(res.buffer));
        if (fmt === 'jpg') assert.ok(isJpg(res.buffer));
        if (fmt === 'gif') assert.ok(isGif(res.buffer));
      }
    });

    it('OnErrorIgnore: returns valid minimal 1x1 / 4x4 blank fallback for invalid input', async () => {
      for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
        const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', imagetype: fmt, onerror: 'OnErrorIgnore' });
        assert.equal(res.status, 200);
        assert.ok(res.errorMessage);
        assert.ok(res.buffer.length > 0);

        if (fmt === 'png') {
          assert.ok(isPng(res.buffer));
          const p = PNG.sync.read(res.buffer);
          assert.equal(p.width, 4);
        }
        if (fmt === 'svg') {
          assert.ok(isSvg(res.buffer));
          assert.ok(res.buffer.toString('utf8').includes('viewBox="0 0 1 1"'));
        }
        if (fmt === 'jpg') assert.ok(isJpg(res.buffer));
        if (fmt === 'gif') assert.ok(isGif(res.buffer));
      }
    });

    it('OnError500: returns status 500 with plain-text error message on failure', async () => {
      const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', onerror: 'OnError500' });
      assert.equal(res.status, 500);
      assert.equal(res.mimeType, 'text/plain');
      assert.ok(res.buffer.toString('utf8').length > 0);
    });

    it('OnError204: returns status 204 with empty buffer on failure', async () => {
      const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', onerror: 'OnError204' });
      assert.equal(res.status, 204);
      assert.equal(res.buffer.length, 0);
    });

    it('HTTP /barcode.ashx: validates OnError modes across GET and POST with base64 and raw outputs', async () => {
      // 204
      const res204 = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError204`);
      assert.equal(res204.status, 204);

      // 500
      const res500 = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError500`);
      assert.equal(res500.status, 500);
      assert.ok((await res500.text()).length > 0);

      // OnErrorDisplay + base64
      const resB64 = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnErrorDisplay&base64=true`);
      assert.equal(resB64.status, 200);
      const jsonB64 = await resB64.json();
      assert.ok(jsonB64.base64);
      assert.ok(isPng(Buffer.from(jsonB64.base64, 'base64')));
    });
  });

  describe('5.2 PDF417 Advanced Parameters Stress Testing', () => {
    it('supports PDF417 columns boundary values (1, 2, 5, 15, 30)', async () => {
      for (const cols of [1, 2, 5, 15, 30]) {
        const res = await renderBarcode({ code: 'PDF417', data: 'Boundary column testing payload', pdfcolumns: cols });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      }
    });

    it('supports PDF417 rows boundary values (3, 10, 30, 90)', async () => {
      for (const rows of [3, 10, 30, 90]) {
        const res = await renderBarcode({ code: 'PDF417', data: 'Boundary row testing payload', pdfrows: rows });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      }
    });

    it('supports all PDF417 error correction levels (0 through 8)', async () => {
      for (let ec = 0; ec <= 8; ec++) {
        const res = await renderBarcode({ code: 'PDF417', data: 'EC level testing payload', pdfeclevel: ec });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      }
    });

    it('compact PDF417 (pdfvariant=compact) renders smaller width than standard PDF417', async () => {
      const payload = 'Compact vs Normal Comparison Payload';
      const std = await renderBarcode({ code: 'PDF417', data: payload });
      const cpt = await renderBarcode({ code: 'PDF417', data: payload, pdfvariant: 'compact' });
      assert.equal(std.status, 200);
      assert.equal(cpt.status, 200);
      const stdPng = PNG.sync.read(std.buffer);
      const cptPng = PNG.sync.read(cpt.buffer);
      assert.ok(cptPng.width < stdPng.width, 'Compact PDF417 width must be strictly smaller');
    });

    it('scales row height monotonically with pdfrowmult (1 through 6)', async () => {
      const heights = [];
      for (const mult of [1, 2, 3, 4, 6]) {
        const res = await renderBarcode({ code: 'PDF417', data: 'Row multiplier test', pdfrowmult: mult });
        assert.equal(res.status, 200);
        const png = PNG.sync.read(res.buffer);
        heights.push(png.height);
      }
      for (let i = 1; i < heights.length; i++) {
        assert.ok(heights[i] >= heights[i - 1], `Height ${heights[i]} must be >= ${heights[i - 1]}`);
      }
    });

    it('handles impossible PDF417 geometry gracefully without server crash', async () => {
      const largeText = 'A'.repeat(500);
      const resDisp = await renderBarcode({ code: 'PDF417', data: largeText, pdfcolumns: 1, pdfrows: 3, onerror: 'OnErrorDisplay' });
      assert.equal(resDisp.status, 200);
      assert.ok(resDisp.errorMessage);

      const res500 = await renderBarcode({ code: 'PDF417', data: largeText, pdfcolumns: 1, pdfrows: 3, onerror: 'OnError500' });
      assert.equal(res500.status, 500);
    });

    it('encodes large text payloads (1,000 chars) and UTF-8 international text', async () => {
      const largeText = 'PDF417-CAPACITY-'.repeat(60);
      const res = await renderBarcode({ code: 'PDF417', data: largeText, pdfcolumns: 20 });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));

      const utfText = 'Zürich, Genève, München: €99.95 — 100% Qualität';
      const resUtf = await renderBarcode({ code: 'PDF417', data: utfText, codepage: 'Utf_8' });
      assert.equal(resUtf.status, 200);
      assert.ok(isPng(resUtf.buffer));
    });

    it('renders MicroPDF417 compact 2D barcode', async () => {
      const res = await renderBarcode({ code: 'MicroPDF417', data: 'MicroPDF417 Sample' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
    });
  });

  describe('5.3 Batch ZIP with 30+ Rows Stress Testing', () => {
    it('generates 35 rows PDF417 batch ZIP, unpacking and verifying every entry', async () => {
      const rows = Array.from({ length: 35 }, (_, i) => `PDF417-ROW-${String(i + 1).padStart(3, '0')}`).join('\n');
      const { buffer, count, errors } = await renderBatchZip({
        code: 'PDF417',
        data: rows,
        imagetype: 'png',
      });

      assert.equal(count, 35);
      assert.equal(errors.length, 0);
      assert.ok(isZip(buffer));

      const zip = await JSZip.loadAsync(buffer);
      const files = Object.keys(zip.files);
      assert.equal(files.length, 35);

      for (const fn of files) {
        assert.ok(fn.endsWith('.png'));
        const fbuf = await zip.files[fn].async('nodebuffer');
        assert.ok(isPng(fbuf));
        const p = PNG.sync.read(fbuf);
        assert.ok(p.width > 20 && p.height > 20);
      }
    });

    it('generates 50 rows SVG batch ZIP without row limits', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => `SVG-ROW-${i + 1}`).join('\n');
      const { buffer, count } = await renderBatchZip({
        code: 'Code128',
        data: rows,
        imagetype: 'svg',
      });
      assert.equal(count, 50);
      assert.ok(isZip(buffer));

      const zip = await JSZip.loadAsync(buffer);
      assert.equal(Object.keys(zip.files).length, 50);
    });

    it('mixed batch with 35 rows and 5 error rows creates all images + _errors.txt', async () => {
      const rows = [];
      for (let i = 1; i <= 35; i++) {
        if (i % 7 === 0) {
          rows.push(`INVALID_ALPHA_${i}`);
        } else {
          const p = `40063813339${i % 10}`;
          rows.push(`${p}${computeGs1CheckDigit(p)}`);
        }
      }

      const { buffer, count, errors } = await renderBatchZip({
        code: 'EAN13',
        data: rows.join('\n'),
        imagetype: 'png',
      });

      assert.equal(count, 35);
      assert.equal(errors.length, 5);

      const zip = await JSZip.loadAsync(buffer);
      assert.equal(Object.keys(zip.files).length, 36); // 35 images + _errors.txt
      assert.ok(zip.files['_errors.txt']);
      const report = await zip.files['_errors.txt'].async('text');
      assert.ok(report.includes('Row 7'));
      assert.ok(report.includes('Row 35'));
    });

    it('sanitizes filenames against directory traversal and path separators', async () => {
      const rows = [
        '../../../etc/passwd',
        'sub/dir\\file',
        'colon:quote"test',
        'spaces   and   tabs',
        'unicode_中文',
        'emoji_🚀',
      ].join('\n');

      const { buffer } = await renderBatchZip({ code: 'QRCode', data: rows, imagetype: 'png' });
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.keys(zip.files);

      for (const fn of entries) {
        assert.ok(!fn.includes('/'), `Path separator / detected: ${fn}`);
        assert.ok(!fn.includes('\\'), `Path separator \\ detected: ${fn}`);
        assert.ok(/^[0-9]{3}_[a-zA-Z0-9._-]+\.png$/.test(fn), `Invalid filename format: ${fn}`);
      }
    });

    it('HTTP /barcode.ashx multiplebarcodes=true handles 40 rows via POST', async () => {
      const rows = Array.from({ length: 40 }, (_, i) => `HTTP-BATCH-${i + 1}`).join('\n');
      const res = await fetch(`${baseUrl}/barcode.ashx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'PDF417',
          data: rows,
          multiplebarcodes: true,
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/zip');
      const ab = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(Buffer.from(ab));
      assert.equal(Object.keys(zip.files).length, 40);
    });
  });

  describe('5.4 Binary Formats, Color Manipulation & Rotation', () => {
    it('PNG: generates valid chunks, dimensions, and transparent background', async () => {
      const res = await renderBarcode({ code: 'QRCode', data: 'Transparency Test', transparent: true, imagetype: 'png' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
      const p = PNG.sync.read(res.buffer);

      let hasTransparent = false;
      let hasOpaque = false;
      for (let i = 0; i < p.data.length; i += 4) {
        if (p.data[i + 3] === 0) hasTransparent = true;
        if (p.data[i + 3] === 255) hasOpaque = true;
      }
      assert.ok(hasTransparent && hasOpaque, 'PNG must have transparent and opaque pixels');
    });

    it('JPG: generates valid JFIF header with correct dimensions', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'JPG Test', imagetype: 'jpg' });
      assert.equal(res.status, 200);
      assert.ok(isJpg(res.buffer));
      const d = jpeg.decode(res.buffer);
      assert.ok(d.width > 20 && d.height > 20);
    });

    it('GIF: generates valid GIF89a/GIF87a palette-indexed image', async () => {
      const res = await renderBarcode({ code: 'Code128', data: 'GIF Test', imagetype: 'gif' });
      assert.equal(res.status, 200);
      assert.ok(isGif(res.buffer));
    });

    it('SVG: generates valid XML with viewBox and vector primitives', async () => {
      const res = await renderBarcode({ code: 'DataMatrix', data: 'SVG Test', imagetype: 'svg' });
      assert.equal(res.status, 200);
      assert.ok(isSvg(res.buffer));
    });

    it('Rotation: 90 degree rotation inverts width and height dimensions', async () => {
      const r0 = await renderBarcode({ code: 'Code128', data: 'ROTATION_DIM_CHECK', rotation: 'Degree0', imagetype: 'png' });
      const r90 = await renderBarcode({ code: 'Code128', data: 'ROTATION_DIM_CHECK', rotation: 'Degree90', imagetype: 'png' });
      const p0 = PNG.sync.read(r0.buffer);
      const p90 = PNG.sync.read(r90.buffer);

      assert.ok(p0.width > p0.height, '0 degree barcode is wider than tall');
      assert.ok(p90.height > p90.width, '90 degree barcode is taller than wide');
    });
  });
});
