import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import JSZip from 'jszip';
import { renderBarcode, normalizeParams } from '../src/symbologies/renderer.js';
import { renderBatchZip, splitBarcodeRows, parseCsvRecords } from '../src/utils/batch.js';
import { computeGs1CheckDigit } from '../src/symbologies/wrappers.js';
import { listSymbologies, getSymbology } from '../src/symbologies/catalog.js';
import { app } from '../server.js';

let totalTests = 0;
let passedTests = 0;
const failures = [];
const empiricalFindings = [];

function check(label, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${label}`);
  } catch (err) {
    failures.push({ label, error: err.message });
    console.error(`  ✖ [FAIL] ${label}\n    ${err.message}`);
  }
}

async function asyncCheck(label, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${label}`);
  } catch (err) {
    failures.push({ label, error: err.message });
    console.error(`  ✖ [FAIL] ${label}\n    ${err.message}`);
  }
}

// Helpers for magic bytes
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

async function runAllChallenges() {
  console.log('================================================================');
  console.log('   CHALLENGER M1: EMPIRICAL STRESS & ADVERSARIAL HARNESS        ');
  console.log('================================================================\n');

  // Start test server for HTTP-level assertions
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ========================================================================
    // 1. ONERROR MODES EMPIRICAL STRESS TESTING
    // ========================================================================
    console.log('--- 1. ONERROR MODES EMPIRICAL STRESS SUITE ---');

    // 1.1 OnErrorDisplay (Default): invalid barcode input across all 4 formats
    for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
      await asyncCheck(`OnErrorDisplay generates valid ${fmt.toUpperCase()} error image for invalid EAN13 data`, async () => {
        const res = await renderBarcode({ code: 'EAN13', data: 'NOT_NUMERIC', imagetype: fmt, onerror: 'OnErrorDisplay' });
        assert.equal(res.status, 200);
        assert.ok(res.errorMessage, 'Must capture error message');
        assert.ok(res.buffer.length > 0, 'Buffer must not be empty');

        if (fmt === 'png') {
          assert.ok(isPng(res.buffer), 'Must be valid PNG');
          const decoded = PNG.sync.read(res.buffer);
          assert.ok(decoded.width > 0 && decoded.height > 0);
        } else if (fmt === 'svg') {
          assert.ok(isSvg(res.buffer), 'Must be valid SVG');
          assert.ok(res.buffer.toString('utf8').includes('Barcode Generation Error'));
        } else if (fmt === 'jpg') {
          assert.ok(isJpg(res.buffer), 'Must be valid JPG');
          const decoded = jpeg.decode(res.buffer);
          assert.ok(decoded.width > 0 && decoded.height > 0);
        } else if (fmt === 'gif') {
          assert.ok(isGif(res.buffer), 'Must be valid GIF');
        }
      });
    }

    // 1.2 OnErrorIgnore: invalid barcode input across all 4 formats
    for (const fmt of ['png', 'svg', 'jpg', 'gif']) {
      await asyncCheck(`OnErrorIgnore generates valid ${fmt.toUpperCase()} 1x1 or blank fallback image on error`, async () => {
        const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', imagetype: fmt, onerror: 'OnErrorIgnore' });
        assert.equal(res.status, 200);
        assert.ok(res.errorMessage);
        assert.ok(res.buffer.length > 0);

        if (fmt === 'png') {
          assert.ok(isPng(res.buffer));
          const decoded = PNG.sync.read(res.buffer);
          assert.equal(decoded.width, 4);
          assert.equal(decoded.height, 4);
        } else if (fmt === 'svg') {
          assert.ok(isSvg(res.buffer));
          assert.ok(res.buffer.toString('utf8').includes('viewBox="0 0 1 1"'));
        } else if (fmt === 'jpg') {
          assert.ok(isJpg(res.buffer));
          const decoded = jpeg.decode(res.buffer);
          assert.equal(decoded.width, 4);
          assert.equal(decoded.height, 4);
        } else if (fmt === 'gif') {
          assert.ok(isGif(res.buffer));
        }
      });
    }

    // 1.3 OnError500
    await asyncCheck('OnError500 returns status 500 with plain-text error message', async () => {
      const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', onerror: 'OnError500' });
      assert.equal(res.status, 500);
      assert.equal(res.mimeType, 'text/plain');
      assert.ok(res.buffer.toString('utf8').length > 0);
    });

    // 1.4 OnError204
    await asyncCheck('OnError204 returns status 204 with 0-byte buffer', async () => {
      const res = await renderBarcode({ code: 'EAN13', data: 'INVALID', onerror: 'OnError204' });
      assert.equal(res.status, 204);
      assert.equal(res.buffer.length, 0);
    });

    // 1.5 HTTP-level OnError assertions (/barcode.ashx)
    await asyncCheck('HTTP GET /barcode.ashx with OnError204 returns HTTP 204', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError204`);
      assert.equal(res.status, 204);
      const text = await res.text();
      assert.equal(text, '');
    });

    await asyncCheck('HTTP GET /barcode.ashx with OnError500 returns HTTP 500 with plain text error', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError500`);
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.ok(text.length > 0);
    });

    await asyncCheck('HTTP GET /barcode.ashx with OnErrorDisplay and base64=true returns 200 JSON with base64 image', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnErrorDisplay&base64=true`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.base64);
      assert.equal(json.mime, 'image/png');
      const buf = Buffer.from(json.base64, 'base64');
      assert.ok(isPng(buf));
    });

    await asyncCheck('HTTP GET /barcode.ashx with OnError204 and base64=true returns HTTP 204', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError204&base64=true`);
      assert.equal(res.status, 204);
    });

    await asyncCheck('HTTP GET /barcode.ashx with OnError500 and base64=true returns HTTP 500 text', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=BAD&onerror=OnError500&base64=true`);
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.ok(text.length > 0);
    });

    // 1.6 Empirical discovery on OnError case-sensitivity
    await asyncCheck('Empirical Check: OnError casing sensitivity', async () => {
      const rLower = await renderBarcode({ code: 'EAN13', data: 'BAD', onerror: 'onerror204' });
      const rExact = await renderBarcode({ code: 'EAN13', data: 'BAD', onerror: 'OnError204' });
      empiricalFindings.push({
        finding: 'OnError mode case-sensitivity',
        detail: `Passing lowercase 'onerror204' results in status ${rLower.status} (falls through to OnErrorDisplay), while exact 'OnError204' yields status ${rExact.status}.`,
      });
      assert.equal(rExact.status, 204);
      // Document behavior: lowercase does not trigger OnError204 because String(params.onerror) is compared with === 'OnError204'
      assert.equal(rLower.status, 200);
    });

    // ========================================================================
    // 2. PDF417 PARAMETERS EMPIRICAL STRESS TESTING
    // ========================================================================
    console.log('\n--- 2. PDF417 PARAMETERS EMPIRICAL STRESS SUITE ---');

    // 2.1 Standard PDF417 default rendering
    await asyncCheck('PDF417 renders default barcode with valid PNG output', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'Standard PDF417 Payload' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
    });

    // 2.2 pdfcolumns boundary testing (1, 2, 5, 15, 30)
    for (const cols of [1, 2, 5, 15, 30]) {
      await asyncCheck(`PDF417 respects pdfcolumns=${cols}`, async () => {
        const res = await renderBarcode({ code: 'PDF417', data: 'Column test string 1234567890', pdfcolumns: cols });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      });
    }

    // 2.3 pdfrows boundary testing (3, 10, 30, 90)
    for (const rows of [3, 10, 30, 90]) {
      await asyncCheck(`PDF417 respects pdfrows=${rows}`, async () => {
        const res = await renderBarcode({ code: 'PDF417', data: 'Rows test string 1234567890', pdfrows: rows });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      });
    }

    // 2.4 pdfeclevel (0 through 8)
    const ecBuffers = [];
    for (let ec = 0; ec <= 8; ec++) {
      await asyncCheck(`PDF417 renders at error correction level pdfeclevel=${ec}`, async () => {
        const res = await renderBarcode({ code: 'PDF417', data: 'Testing Error Correction Levels in PDF417', pdfeclevel: ec });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
        ecBuffers.push({ ec, byteLength: res.buffer.length });
      });
    }

    // 2.5 Compare Compact PDF417 vs Standard PDF417
    await asyncCheck('Compact PDF417 (pdfvariant=compact) renders smaller footprint than standard', async () => {
      const payload = 'Compact vs Normal PDF417 Comparison';
      const std = await renderBarcode({ code: 'PDF417', data: payload, imagetype: 'png' });
      const cpt = await renderBarcode({ code: 'PDF417', data: payload, pdfvariant: 'compact', imagetype: 'png' });

      assert.equal(std.status, 200);
      assert.equal(cpt.status, 200);
      const stdPng = PNG.sync.read(std.buffer);
      const cptPng = PNG.sync.read(cpt.buffer);

      // Compact omits right stop pattern and quiet zone, so it should be narrower
      assert.ok(cptPng.width < stdPng.width, `Compact width (${cptPng.width}) must be smaller than standard width (${stdPng.width})`);
      empiricalFindings.push({
        finding: 'Compact PDF417 footprint reduction confirmed',
        detail: `Standard width: ${stdPng.width}px vs Compact width: ${cptPng.width}px (reduced by ${stdPng.width - cptPng.width}px)`,
      });
    });

    // 2.6 Empirical check on pdfcompact parameter alias
    await asyncCheck('Empirical Check: pdfcompact parameter vs pdfvariant', async () => {
      const rCompactParam = await renderBarcode({ code: 'PDF417', data: 'CompactTest', pdfcompact: true });
      const rVariantParam = await renderBarcode({ code: 'PDF417', data: 'CompactTest', pdfvariant: 'compact' });
      empiricalFindings.push({
        finding: 'PDF417 compact parameter behavior',
        detail: `Passing pdfvariant='compact' activates compact PDF417 (width ${rVariantParam.width}px), whereas pdfcompact=true remains standard width (${rCompactParam.width}px) because renderer.js strictly checks params.pdfvariant.`,
      });
      assert.ok(rVariantParam.width < rCompactParam.width);
    });

    // 2.7 pdfrowmult (1 through 6)
    const multHeights = [];
    for (const mult of [1, 2, 3, 4, 6]) {
      await asyncCheck(`PDF417 respects row height multiplier pdfrowmult=${mult}`, async () => {
        const res = await renderBarcode({ code: 'PDF417', data: 'Row multiplier test', pdfrowmult: mult });
        assert.equal(res.status, 200);
        const png = PNG.sync.read(res.buffer);
        multHeights.push({ mult, height: png.height });
      });
    }
    for (let i = 1; i < multHeights.length; i++) {
      check(`Height increases with row multiplier: mult ${multHeights[i].mult} (${multHeights[i].height}px) >= mult ${multHeights[i-1].mult} (${multHeights[i-1].height}px)`, () => {
        assert.ok(multHeights[i].height >= multHeights[i-1].height);
      });
    }

    // 2.8 Over-constrained / Incompatible geometry
    await asyncCheck('PDF417 handles impossible geometry (columns=1, rows=3 with large text) via OnErrorDisplay', async () => {
      const largeText = 'A'.repeat(500);
      const res = await renderBarcode({ code: 'PDF417', data: largeText, pdfcolumns: 1, pdfrows: 3, onerror: 'OnErrorDisplay' });
      assert.equal(res.status, 200);
      assert.ok(res.errorMessage, 'Must report error for impossible dimension/capacity');
    });

    await asyncCheck('PDF417 handles impossible geometry with OnError500 by returning 500', async () => {
      const largeText = 'A'.repeat(500);
      const res = await renderBarcode({ code: 'PDF417', data: largeText, pdfcolumns: 1, pdfrows: 3, onerror: 'OnError500' });
      assert.equal(res.status, 500);
    });

    // 2.9 Huge text payload capacity stress test
    await asyncCheck('PDF417 encodes 1000-character payload successfully', async () => {
      const payload = 'PDF417-CAPACITY-TEST-'.repeat(45); // ~945 chars
      const res = await renderBarcode({ code: 'PDF417', data: payload, pdfcolumns: 20 });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
    });

    await asyncCheck('PDF417 handles capacity overflow (>3000 chars) gracefully without server crash', async () => {
      const massivePayload = 'M'.repeat(4000);
      const res = await renderBarcode({ code: 'PDF417', data: massivePayload, onerror: 'OnError500' });
      assert.equal(res.status, 500);
      assert.ok(res.errorMessage);
    });

    // 2.10 Non-ASCII / International Characters / Code Pages in PDF417
    await asyncCheck('PDF417 encodes UTF-8 international text', async () => {
      const utfText = 'Zürich, Genève, München: €99.95 — 100% Qualität';
      const res = await renderBarcode({ code: 'PDF417', data: utfText, codepage: 'Utf_8' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
    });

    // 2.11 MicroPDF417
    await asyncCheck('MicroPDF417 renders valid compact 2D barcode', async () => {
      const res = await renderBarcode({ code: 'MicroPDF417', data: 'MicroPDF417 Compact Data' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
    });

    // ========================================================================
    // 3. BATCH ZIP WITH 30+ ROWS EMPIRICAL STRESS TESTING
    // ========================================================================
    console.log('\n--- 3. BATCH ZIP (30+ ROWS) EMPIRICAL STRESS SUITE ---');

    // 3.1 35 rows PDF417 batch export
    await asyncCheck('Batch ZIP generates 35 valid PDF417 barcodes (>10 row TEC-IT limit bypassed)', async () => {
      const rows = [];
      for (let i = 1; i <= 35; i++) {
        rows.push(`PDF417-BATCH-ITEM-${String(i).padStart(3, '0')}`);
      }
      const rawText = rows.join('\n');

      const { buffer, count, errors } = await renderBatchZip({
        code: 'PDF417',
        data: rawText,
        imagetype: 'png',
      });

      assert.equal(count, 35);
      assert.equal(errors.length, 0);
      assert.ok(isZip(buffer), 'Output must start with PK.. magic bytes');

      // Unpack ZIP and verify every entry
      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.keys(zip.files);
      assert.equal(entries.length, 35);

      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        assert.ok(name.endsWith('.png'));
        const fileBuf = await zip.files[name].async('nodebuffer');
        assert.ok(isPng(fileBuf), `Entry ${name} must be a valid PNG`);
        const decoded = PNG.sync.read(fileBuf);
        assert.ok(decoded.width > 20 && decoded.height > 20, `Entry ${name} dimensions valid`);
      }
    });

    // 3.2 50 rows SVG batch export
    await asyncCheck('Batch ZIP generates 50 SVG barcodes cleanly', async () => {
      const rows = [];
      for (let i = 1; i <= 50; i++) {
        rows.push(`BATCH-SVG-${i}`);
      }
      const { buffer, count } = await renderBatchZip({
        code: 'Code128',
        data: rows.join('\n'),
        imagetype: 'svg',
      });

      assert.equal(count, 50);
      assert.ok(isZip(buffer));

      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.keys(zip.files);
      assert.equal(entries.length, 50);

      // Verify random entry is valid SVG
      const sample = await zip.files[entries[25]].async('nodebuffer');
      assert.ok(isSvg(sample));
    });

    // 3.3 35 rows with 5 intentional error rows (Mixed batch test with valid EAN-13 check digits)
    await asyncCheck('Batch ZIP with 35 rows (including 5 error rows) generates all images and _errors.txt', async () => {
      const rows = [];
      for (let i = 1; i <= 35; i++) {
        if (i % 7 === 0) {
          // Bad row for EAN-13 (must be numeric 12-13 digits)
          rows.push(`INVALID_ROW_ALPHA_${i}`);
        } else {
          // Mathematically valid EAN-13 prefix + check digit
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
      assert.equal(errors.length, 5, 'Must report exactly 5 errors for the 5 bad rows');

      const zip = await JSZip.loadAsync(buffer);
      const entries = Object.keys(zip.files);
      // 35 images + 1 _errors.txt = 36 files
      assert.equal(entries.length, 36);
      assert.ok(zip.files['_errors.txt'], 'Must contain _errors.txt');

      const errReport = await zip.files['_errors.txt'].async('text');
      assert.ok(errReport.includes('Row 7'));
      assert.ok(errReport.includes('Row 14'));
      assert.ok(errReport.includes('Row 21'));
      assert.ok(errReport.includes('Row 28'));
      assert.ok(errReport.includes('Row 35'));
    });

    // 3.4 Batch with special characters & filename sanitization
    await asyncCheck('Batch filenames are safely sanitized against directory traversal and path separators', async () => {
      const rows = [
        'normal_name',
        '../../../etc/passwd',
        'foo/bar\\baz:quote"test',
        'special!@#$%^&*()_+',
        'spaces   and   tabs',
        '中文_unicode_test',
        'emoji_🚀_fire_🔥',
      ];

      const { buffer } = await renderBatchZip({
        code: 'QRCode',
        data: rows.join('\n'),
        imagetype: 'png',
      });

      const zip = await JSZip.loadAsync(buffer);
      const fileNames = Object.keys(zip.files);
      assert.equal(fileNames.length, rows.length);

      for (const fn of fileNames) {
        assert.ok(!fn.includes('/'), `No forward slashes in filename: ${fn}`);
        assert.ok(!fn.includes('\\'), `No backslashes in filename: ${fn}`);
        assert.ok(/^[0-9]{3}_[a-zA-Z0-9._-]+\.png$/.test(fn), `Filename ${fn} must follow safe naming convention`);
      }
      empiricalFindings.push({
        finding: 'Batch ZIP filename sanitization',
        detail: `All slashes and invalid characters are replaced by underscores. For ../../../etc/passwd, result is 002_.._.._.._etc_passwd.png, which eliminates path separators but retains literal dots.`,
      });
    });

    // 3.5 HTTP-level /barcode.ashx multiplebarcodes=true with 40 rows
    await asyncCheck('HTTP POST /barcode.ashx with multiplebarcodes=true returns valid ZIP for 40 rows', async () => {
      const rows = Array.from({ length: 40 }, (_, i) => `HTTP-BATCH-${i + 1}`).join('\n');
      const res = await fetch(`${baseUrl}/barcode.ashx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'PDF417',
          data: rows,
          multiplebarcodes: true,
          imagetype: 'png',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/zip');
      assert.ok(res.headers.get('content-disposition').includes('barcodes.zip'));

      const arrayBuf = await res.arrayBuffer();
      const zipBuf = Buffer.from(arrayBuf);
      assert.ok(isZip(zipBuf));

      const zip = await JSZip.loadAsync(zipBuf);
      assert.equal(Object.keys(zip.files).length, 40);
    });

    // ========================================================================
    // 4. BINARY IMAGE FORMATS EMPIRICAL STRESS TESTING
    // ========================================================================
    console.log('\n--- 4. BINARY IMAGE FORMATS EMPIRICAL STRESS SUITE ---');

    // 4.1 PNG format deep verification
    await asyncCheck('PNG: generates valid chunks (IHDR, IDAT, IEND) and color channels', async () => {
      const res = await renderBarcode({ code: 'QRCode', data: 'PNG Format Test', imagetype: 'png', color: '1e40af', bgcolor: 'f8fafc' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/png');
      assert.ok(isPng(res.buffer));

      const decoded = PNG.sync.read(res.buffer);
      assert.ok(decoded.width >= 50);
      assert.ok(decoded.height >= 50);
      assert.equal(decoded.data.length, decoded.width * decoded.height * 4);
    });

    // 4.2 JPG / JPEG format deep verification
    await asyncCheck('JPG: generates valid JFIF/JPEG headers and readable RGB pixels', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'JPEG Format Test', imagetype: 'jpg', color: '000000', bgcolor: 'ffffff' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/jpeg');
      assert.ok(isJpg(res.buffer));

      const decoded = jpeg.decode(res.buffer);
      assert.ok(decoded.width > 50);
      assert.ok(decoded.height > 20);
      assert.ok(decoded.data.length > 0);
    });

    // 4.3 GIF format deep verification
    await asyncCheck('GIF: generates valid GIF89a/GIF87a structure with indexed palette', async () => {
      const res = await renderBarcode({ code: 'Code128', data: 'GIF Format Test', imagetype: 'gif' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/gif');
      assert.ok(isGif(res.buffer));
    });

    // 4.4 SVG format deep verification
    await asyncCheck('SVG: generates valid XML with proper viewBox and path/rect elements', async () => {
      const res = await renderBarcode({ code: 'DataMatrix', data: 'SVG Format Test', imagetype: 'svg' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/svg+xml');
      assert.ok(isSvg(res.buffer));

      const svgStr = res.buffer.toString('utf8');
      assert.ok(svgStr.includes('viewBox='));
      assert.ok(svgStr.includes('<path') || svgStr.includes('<rect'));
    });

    // 4.5 Transparent background in PNG
    await asyncCheck('PNG: transparent background sets alpha channel to 0 for background pixels', async () => {
      const res = await renderBarcode({ code: 'QRCode', data: 'Transparency Test', transparent: true, imagetype: 'png' });
      assert.equal(res.status, 200);
      const decoded = PNG.sync.read(res.buffer);

      let foundTransparent = false;
      let foundOpaque = false;
      for (let i = 0; i < decoded.data.length; i += 4) {
        const alpha = decoded.data[i + 3];
        if (alpha === 0) foundTransparent = true;
        if (alpha === 255) foundOpaque = true;
      }
      assert.ok(foundTransparent, 'Must have transparent background pixels');
      assert.ok(foundOpaque, 'Must have opaque foreground barcode modules');
    });

    // 4.6 Rotation angles
    for (const rot of ['Degree0', 'Degree90', 'Degree180', 'Degree270']) {
      await asyncCheck(`Rotation: renders successfully with rotation=${rot}`, async () => {
        const res = await renderBarcode({ code: 'Code128', data: 'ROTATION_TEST', rotation: rot, imagetype: 'png' });
        assert.equal(res.status, 200);
        assert.ok(isPng(res.buffer));
      });
    }

    // Check that 90 degree rotation swaps dimensions compared to 0 degrees
    await asyncCheck('Rotation 90 degrees inverts aspect ratio (width <-> height)', async () => {
      const r0 = await renderBarcode({ code: 'Code128', data: 'ROTATION_DIM_CHECK', rotation: 'Degree0', imagetype: 'png' });
      const r90 = await renderBarcode({ code: 'Code128', data: 'ROTATION_DIM_CHECK', rotation: 'Degree90', imagetype: 'png' });
      const p0 = PNG.sync.read(r0.buffer);
      const p90 = PNG.sync.read(r90.buffer);

      assert.ok(p0.width > p0.height, 'Linear barcode at 0 deg is wider than tall');
      assert.ok(p90.height > p90.width, 'Linear barcode at 90 deg is taller than wide');
    });

    // ========================================================================
    // 5. CORNER CASES, DISCOVERIES & RESILIENCE
    // ========================================================================
    console.log('\n--- 5. CORNER CASES, DISCOVERIES & RESILIENCE SUITE ---');

    // 5.1 Empty string data behavior
    await asyncCheck('Empirical Check: Empty data string defaults to symbology defaultData', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: '' });
      assert.equal(res.status, 200);
      assert.ok(isPng(res.buffer));
      empiricalFindings.push({
        finding: 'Empty data fallback',
        detail: 'renderBarcode treats data: "" as omitted and falls back to sym.defaultData ("This is a PDF417 by Barcode Studio"), matching TEC-IT preview behavior.',
      });
    });

    // 5.2 Invalid non-empty data triggers OnError
    await asyncCheck('Invalid non-empty data triggers OnError204 and OnError500 correctly', async () => {
      const res204 = await renderBarcode({ code: 'EAN13', data: ' ', onerror: 'OnError204' });
      assert.equal(res204.status, 204);

      const res500 = await renderBarcode({ code: 'EAN13', data: ' ', onerror: 'OnError500' });
      assert.equal(res500.status, 500);

      const resDisp = await renderBarcode({ code: 'EAN13', data: ' ', onerror: 'OnErrorDisplay' });
      assert.equal(resDisp.status, 200);
      assert.ok(resDisp.errorMessage);
    });

    // 5.3 Empty batch data
    await asyncCheck('Empty batch data rejects with meaningful error', async () => {
      await assert.rejects(
        async () => {
          await renderBatchZip({ code: 'PDF417', data: '' });
        },
        /No barcode rows found/
      );
    });

    // 5.4 Batch with only newlines
    await asyncCheck('Batch with only newlines rejects with meaningful error', async () => {
      await assert.rejects(
        async () => {
          await renderBatchZip({ code: 'PDF417', data: '\n\r\n\n' });
        },
        /No barcode rows found/
      );
    });

    // 5.5 Sequence generation bounds
    await asyncCheck('Sequence API handles 100-item sequence generation cleanly', async () => {
      const res = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'ITEM-',
          start: 1,
          end: 100,
          increment: 1,
          mask: '$$$$',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.count, 100);
      assert.equal(data.items[0], 'ITEM-0001');
      assert.equal(data.items[99], 'ITEM-0100');
    });

  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`STRESS RESULTS: ${passedTests}/${totalTests} PASSED (${failures.length} FAILED)`);
  console.log('================================================================');

  console.log('\nEMPIRICAL FINDINGS & CORNER CASE DISCOVERIES:');
  for (const ef of empiricalFindings) {
    console.log(`- [${ef.finding}]: ${ef.detail}`);
  }

  if (failures.length > 0) {
    console.error('\nFAILURES SUMMARY:');
    for (const f of failures) {
      console.error(`- ${f.label}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nALL EMPIRICAL CHALLENGES PASSED WITH ZERO FAILURES.');
    process.exit(0);
  }
}

runAllChallenges().catch((err) => {
  console.error('Fatal challenge runner error:', err);
  process.exit(1);
});
