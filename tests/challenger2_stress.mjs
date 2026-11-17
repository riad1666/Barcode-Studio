import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { generateSequence, formatSequenceValue, parseEscapeSequences } from '../src/symbologies/formatters.js';
import { generateLabelPdf } from '../src/pdf/labelPdf.js';
import { generateBusinessCardPdf } from '../src/pdf/businessCardPdf.js';
import { validateGs1DigitalLink, buildGs1DigitalLink } from '../src/forms/gs1DigitalLink.js';
import { splitBarcodeRows, parseCsvRecords } from '../src/utils/batch.js';
import { listSymbologies } from '../src/symbologies/catalog.js';
import { app } from '../server.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests += 1;
  try {
    await fn();
    passedTests += 1;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests += 1;
    failures.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('CHALLENGER 2: EMPIRICAL STRESS-TEST HARNESS');
  console.log('======================================================\n');

  // Start temporary server for HTTP endpoint tests
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ------------------------------------------------------------------
    // DIMENSION 1: LARGE SEQUENCE GENERATION & CUSTOM MASKS
    // ------------------------------------------------------------------
    console.log('\n--- Dimension 1: Sequence Generations & Custom Masks ---');

    await test('1.1 Large sequence (100 items) with start: 1, end: 100, step: 1', () => {
      const rows = generateSequence({ start: 1, end: 100, increment: 1, mask: '$$$$' });
      assert.equal(rows.length, 100);
      assert.equal(rows[0], '0001');
      assert.equal(rows[99], '0100');
    });

    await test('1.2 Large sequence (500 items) with prefix and suffix', () => {
      const rows = generateSequence({
        prefix: 'PALLET-',
        suffix: '-DE',
        start: 1,
        end: 500,
        increment: 1,
        mask: '$$$$$',
      });
      assert.equal(rows.length, 500);
      assert.equal(rows[0], 'PALLET-00001-DE');
      assert.equal(rows[249], 'PALLET-00250-DE');
      assert.equal(rows[499], 'PALLET-00500-DE');
    });

    await test('1.3 MaxCount boundary capping at 2000 rows', () => {
      const rows = generateSequence({
        start: 1,
        end: 5000,
        increment: 1,
        mask: '$$$$',
        maxCount: 2000,
      });
      assert.equal(rows.length, 2000);
      assert.equal(rows[1999], '2000');
    });

    await test('1.4 Custom mask formats: $, #, * placeholders', () => {
      assert.equal(formatSequenceValue(42, '$$$$'), '0042');
      assert.equal(formatSequenceValue(42, '####'), '  42');
      assert.equal(formatSequenceValue(42, '****'), '**42');
    });

    await test('1.5 Custom mask with literal characters and interleaved masks', () => {
      assert.equal(formatSequenceValue(7, 'BOX-$$$$-CH'), 'BOX-0007-CH');
      assert.equal(formatSequenceValue(89, 'LOT-##-**-$$'), 'LOT-  -**-89');
    });

    await test('1.6 Custom mask overflow: digits exceed mask placeholders', () => {
      assert.equal(formatSequenceValue(12345, '$$$'), '12345');
      assert.equal(formatSequenceValue(999999, 'ITEM-$$'), 'ITEM-999999');
    });

    await test('1.7 Custom mask edge cases: empty mask or no placeholder characters', () => {
      assert.equal(formatSequenceValue(42, ''), '42');
      assert.equal(formatSequenceValue(42, 'LITERAL_ONLY'), '42');
      assert.equal(formatSequenceValue(42, null), '42');
    });

    await test('1.8 Boundary rejection: start > end, step <= 0, invalid numbers', () => {
      assert.throws(() => generateSequence({ start: 10, end: 5, increment: 1 }), /End Value must be greater/);
      assert.throws(() => generateSequence({ start: 1, end: 10, increment: 0 }), /Increment must be greater than 0/);
      assert.throws(() => generateSequence({ start: 1, end: 10, increment: -2 }), /Increment must be greater than 0/);
      assert.throws(() => generateSequence({ start: 'foo', end: 10, increment: 1 }), /valid numbers/);
    });

    await test('1.9 HTTP POST /api/sequence with 150 items', async () => {
      const res = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'ITEM-',
          suffix: '-QC',
          start: 1,
          end: 150,
          step: 1,
          mask: '$$$$',
        }),
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.count, 150);
      assert.equal(json.items.length, 150);
      assert.equal(json.items[0], 'ITEM-0001-QC');
      assert.equal(json.items[149], 'ITEM-0150-QC');
    });

    // ------------------------------------------------------------------
    // DIMENSION 2: CSV GRID SHEET BOUNDARY PAGINATION
    // ------------------------------------------------------------------
    console.log('\n--- Dimension 2: CSV Grid Sheet Boundary Pagination ---');

    function makeCsv(numRows) {
      const lines = ['Title,CodeData'];
      for (let i = 1; i <= numRows; i += 1) {
        lines.push(`Label ${i},SKU-${String(i).padStart(4, '0')}`);
      }
      return lines.join('\n');
    }

    await test('2.1 CSV Grid Sheet with exactly 24 items (3x8 grid) = exactly 1 page', async () => {
      const csv = makeCsv(24);
      const pdfBytes = await generateLabelPdf({
        template: 'csv-grid',
        csvText: csv,
        cols: 3,
        rows: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      assert.equal(doc.getPageCount(), 1, `Expected 1 page for 24 items, got ${doc.getPageCount()}`);
    });

    await test('2.2 CSV Grid Sheet with exactly 25 items (3x8 grid) = exactly 2 pages', async () => {
      const csv = makeCsv(25);
      const pdfBytes = await generateLabelPdf({
        template: 'csv-grid',
        csvText: csv,
        cols: 3,
        rows: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      assert.equal(doc.getPageCount(), 2, `Expected 2 pages for 25 items, got ${doc.getPageCount()}`);
    });

    await test('2.3 CSV Grid Sheet with exactly 48 items (3x8 grid) = exactly 2 pages', async () => {
      const csv = makeCsv(48);
      const pdfBytes = await generateLabelPdf({
        template: 'csv-grid',
        csvText: csv,
        cols: 3,
        rows: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      assert.equal(doc.getPageCount(), 2, `Expected 2 pages for 48 items, got ${doc.getPageCount()}`);
    });

    await test('2.4 CSV Grid Sheet with exactly 49 items (3x8 grid) = exactly 3 pages', async () => {
      const csv = makeCsv(49);
      const pdfBytes = await generateLabelPdf({
        template: 'csv-grid',
        csvText: csv,
        cols: 3,
        rows: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      assert.equal(doc.getPageCount(), 3, `Expected 3 pages for 49 items, got ${doc.getPageCount()}`);
    });

    await test('2.5 CSV Grid Sheet with 100 items (3x8 grid) = exactly 5 pages', async () => {
      const csv = makeCsv(100);
      const pdfBytes = await generateLabelPdf({
        template: 'csv-grid',
        csvText: csv,
        cols: 3,
        rows: 8,
      });
      const doc = await PDFDocument.load(pdfBytes);
      assert.equal(doc.getPageCount(), 5, `Expected 5 pages for 100 items, got ${doc.getPageCount()}`);
    });

    await test('2.6 CSV Grid Sheet with custom dimensions: 2 cols x 5 rows = 10 per page', async () => {
      // 10 items -> 1 page
      const pdf10 = await generateLabelPdf({
        template: 'csv-grid',
        csvText: makeCsv(10),
        cols: 2,
        rows: 5,
      });
      const doc10 = await PDFDocument.load(pdf10);
      assert.equal(doc10.getPageCount(), 1);

      // 11 items -> 2 pages
      const pdf11 = await generateLabelPdf({
        template: 'csv-grid',
        csvText: makeCsv(11),
        cols: 2,
        rows: 5,
      });
      const doc11 = await PDFDocument.load(pdf11);
      assert.equal(doc11.getPageCount(), 2);
    });

    await test('2.7 CSV Grid Sheet template aliases (csv-sheet, csv-grid, csv, grid)', async () => {
      const aliases = ['csv-sheet', 'csv-grid', 'csv', 'grid', 'CSV-GRID'];
      for (const tpl of aliases) {
        const pdf = await generateLabelPdf({
          template: tpl,
          csvText: makeCsv(25),
          cols: 3,
          rows: 8,
        });
        const doc = await PDFDocument.load(pdf);
        assert.equal(doc.getPageCount(), 2, `Alias ${tpl} should produce 2 pages for 25 items`);
      }
    });

    await test('2.8 CSV Grid Sheet Paper Sizes: A4 vs Letter dimensions', async () => {
      const pdfA4 = await generateLabelPdf({ template: 'csv-grid', csvText: makeCsv(2), paperSize: 'a4' });
      const docA4 = await PDFDocument.load(pdfA4);
      const pageA4 = docA4.getPage(0);
      assert.ok(Math.abs(pageA4.getWidth() - 595.28) < 1, `A4 Width: ${pageA4.getWidth()}`);
      assert.ok(Math.abs(pageA4.getHeight() - 841.89) < 1, `A4 Height: ${pageA4.getHeight()}`);

      const pdfLetter = await generateLabelPdf({ template: 'csv-grid', csvText: makeCsv(2), paperSize: 'letter' });
      const docLetter = await PDFDocument.load(pdfLetter);
      const pageLetter = docLetter.getPage(0);
      assert.equal(pageLetter.getWidth(), 612);
      assert.equal(pageLetter.getHeight(), 792);
    });

    await test('2.9 CSV Grid Sheet edge case: empty CSV string or headers only', async () => {
      // Empty CSV
      const pdfEmpty = await generateLabelPdf({ template: 'csv-grid', csvText: '' });
      const docEmpty = await PDFDocument.load(pdfEmpty);
      assert.equal(docEmpty.getPageCount(), 1);

      // Whitespace CSV
      const pdfWs = await generateLabelPdf({ template: 'csv-grid', csvText: '   \n\r\n  ' });
      const docWs = await PDFDocument.load(pdfWs);
      assert.equal(docWs.getPageCount(), 1);

      // Header-only CSV
      const pdfHdr = await generateLabelPdf({ template: 'csv-grid', csvText: 'Title,CodeData\n' });
      const docHdr = await PDFDocument.load(pdfHdr);
      assert.ok(docHdr.getPageCount() >= 1);
    });

    await test('2.10 CSV Grid Sheet with semicolon-separated and quoted fields', async () => {
      const semiCsv = 'Title;CodeData\r\n"Item, 1";SKU001\r\n"Item; 2";SKU002\r\n"Item ""3""";SKU003';
      const pdf = await generateLabelPdf({ template: 'csv-grid', csvText: semiCsv });
      const doc = await PDFDocument.load(pdf);
      assert.equal(doc.getPageCount(), 1);
    });

    await test('2.11 CSV Grid Sheet with symbology / symCode parameter support', async () => {
      // Test both symbology and symCode params with QRCode
      const pdf1 = await generateLabelPdf({
        template: 'csv-grid',
        csvText: makeCsv(5),
        symbology: 'QRCode',
      });
      assert.ok(pdf1.length > 1000);

      // Check whether passing symCode works or defaults safely
      const pdf2 = await generateLabelPdf({
        template: 'csv-grid',
        csvText: makeCsv(5),
        symCode: 'QRCode',
      });
      assert.ok(pdf2.length > 1000);
    });

    // ------------------------------------------------------------------
    // DIMENSION 3: MALFORMED INPUTS, UNDEFINED PROPERTIES & MISSING ATTRS
    // ------------------------------------------------------------------
    console.log('\n--- Dimension 3: Malformed Inputs, Undefined Properties & Missing Attributes ---');

    await test('3.1 validateGs1DigitalLink handles null, undefined, empty state without throw', () => {
      const err1 = validateGs1DigitalLink();
      assert.ok(err1.GS1Resolver);
      assert.ok(err1.PrimaryKeyValue);

      const err2 = validateGs1DigitalLink(null);
      assert.ok(err2.GS1Resolver);

      const err3 = validateGs1DigitalLink({});
      assert.ok(err3.GS1Resolver);

      const err4 = validateGs1DigitalLink({ attributes: null });
      assert.ok(err4.GS1Resolver);

      const err5 = validateGs1DigitalLink({
        attributes: [null, undefined, { key: null, value: undefined }, { key: 'invalid', value: '123' }],
      });
      assert.ok(err5.attr_3);
    });

    await test('3.2 buildGs1DigitalLink handles null, undefined, empty state without throw', () => {
      const url1 = buildGs1DigitalLink();
      assert.ok(url1.startsWith('https://id.gs1.org'));

      const url2 = buildGs1DigitalLink(null);
      assert.ok(url2.startsWith('https://id.gs1.org'));

      const url3 = buildGs1DigitalLink({});
      assert.ok(url3.startsWith('https://id.gs1.org'));

      const url4 = buildGs1DigitalLink({
        GS1Resolver: 'https://custom.resolver.com/path/',
        PrimaryKeyEnum: '_01',
        PrimaryKeyValue: '12345678901231',
        KeyQualifier10: 'BATCH42',
        attributes: [null, { key: '17', value: '230101' }, undefined],
      });
      assert.ok(url4.includes('https://custom.resolver.com/path/01/12345678901231/10/BATCH42?17=230101'));
    });

    await test('3.3 Business Card PDF with empty body, undefined contact and extreme params', async () => {
      // Completely empty body
      const bufEmpty = await generateBusinessCardPdf({});
      assert.ok(bufEmpty.subarray(0, 4).toString() === '%PDF');

      // Undefined fields in contact
      const bufContactEmpty = await generateBusinessCardPdf({ contact: {} });
      assert.ok(bufContactEmpty.subarray(0, 4).toString() === '%PDF');

      // Sheet10 A4
      const bufSheetA4 = await generateBusinessCardPdf({
        layout: 'sheet10',
        pageSize: 'a4',
        contact: { FirstName: 'Max', LastName: 'Mustermann' },
      });
      const docA4 = await PDFDocument.load(bufSheetA4);
      assert.equal(docA4.getPageCount(), 1);
      assert.ok(Math.abs(docA4.getPage(0).getWidth() - 595.28) < 1);

      // Sheet10 Letter
      const bufSheetLetter = await generateBusinessCardPdf({
        layout: 'sheet10',
        pageSize: 'letter',
        contact: { FirstName: 'John', LastName: 'Smith' },
      });
      const docLetter = await PDFDocument.load(bufSheetLetter);
      assert.equal(docLetter.getPageCount(), 1);
      assert.equal(docLetter.getPage(0).getWidth(), 612);

      // Layout 'letter-10up'
      const bufLetter10up = await generateBusinessCardPdf({
        layout: 'letter-10up',
        contact: { FirstName: 'Jane' },
      });
      const docLetter10up = await PDFDocument.load(bufLetter10up);
      assert.equal(docLetter10up.getPage(0).getWidth(), 612);
    });

    await test('3.4 Business Card PDF rejects invalid logo format with descriptive error', async () => {
      await assert.rejects(
        () =>
          generateBusinessCardPdf({
            contact: {
              FirstName: 'Test',
              LogoDataUrl: 'data:image/png;base64,invalid_base64_not_really_png',
            },
          }),
        /not a PNG file/i
      );

      // And valid data URL embeds successfully
      const validLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buf = await generateBusinessCardPdf({ contact: { FirstName: 'Valid', LogoDataUrl: validLogo } });
      assert.ok(buf.subarray(0, 4).toString() === '%PDF');
    });

    await test('3.5 splitBarcodeRows and parseCsvRecords resilience with null/undefined/types', () => {
      assert.deepEqual(splitBarcodeRows(null), []);
      assert.deepEqual(splitBarcodeRows(undefined), []);
      assert.deepEqual(splitBarcodeRows(''), []);
      assert.deepEqual(splitBarcodeRows('Line1\r\n\r\nLine2\n'), ['Line1', 'Line2']);

      assert.deepEqual(parseCsvRecords(null), { headers: [], rows: [] });
      assert.deepEqual(parseCsvRecords(undefined), { headers: [], rows: [] });
      assert.deepEqual(parseCsvRecords(''), { headers: [], rows: [] });
    });

    await test('3.6 Symbology catalog and metadata integrity across all 150 entries', () => {
      const syms = listSymbologies();
      assert.ok(syms.length >= 150, `Expected at least 150 symbologies, got ${syms.length}`);

      for (const s of syms) {
        assert.ok(s.id, `Missing id for item: ${JSON.stringify(s)}`);
        assert.ok(s.name, `Missing name for ${s.id}`);
        assert.ok(s.categoryId, `Missing categoryId for ${s.id}`);
        assert.ok(s.categoryName, `Missing categoryName for ${s.id}`);
      }
    });

    await test('3.7 Search palette relevance scoring and punctuation normalization', () => {
      const allSyms = listSymbologies();

      function scoreSearch(query) {
        if (!query) return allSyms.slice(0, 15);
        const cleanQuery = query.toLowerCase().trim();
        const tokens = cleanQuery.replace(/[()_-]/g, ' ').split(/\s+/).filter(Boolean);

        const scored = [];
        for (const s of allSyms) {
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
          if (score > 0) scored.push({ item: s, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.map((e) => e.item);
      }

      // Query "Data Matrix" -> DataMatrix must be #1, NOT Royal Mail Mailmark
      const dmResults = scoreSearch('Data Matrix');
      assert.ok(dmResults.length > 0);
      assert.equal(dmResults[0].id, 'DataMatrix');

      // Query "GS1 Digital Link (QR)" -> GS1DigitalLink_QRCode must be in top 3
      const gs1Results = scoreSearch('GS1 Digital Link (QR)');
      assert.ok(gs1Results.length > 0);
      assert.equal(gs1Results[0].id, 'GS1DigitalLink_QRCode');

      // Query "PDF417" -> PDF417 must be #1
      const pdfResults = scoreSearch('PDF417');
      assert.equal(pdfResults[0].id, 'PDF417');

      // Query gibberish -> 0 results
      const gibResults = scoreSearch('nonexistent_gibberish_barcode_xyz123');
      assert.equal(gibResults.length, 0);

      // Query empty -> 15 items
      const emptyResults = scoreSearch('');
      assert.equal(emptyResults.length, 15);
    });

    await test('3.7 parseEscapeSequences handles null, undefined, non-string, unescaped strings', () => {
      assert.equal(parseEscapeSequences(null), '');
      assert.equal(parseEscapeSequences(undefined), '');
      assert.equal(parseEscapeSequences('plain text'), 'plain text');
      assert.equal(parseEscapeSequences('\\F12345'), '\x1D12345');
      assert.equal(parseEscapeSequences('\\t\\n\\r'), '\t\n\r');
      assert.equal(parseEscapeSequences('\\x41\\x42\\x43'), 'ABC');
      assert.equal(parseEscapeSequences('\\z\\9'), '\\z\\9'); // unhandled escape retained
    });

    await test('3.8 HTTP /api/pdf/label with malformed and empty payload defaults gracefully', async () => {
      const res = await fetch(`${baseUrl}/api/pdf/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    });

    await test('3.9 HTTP /api/pdf/business-card with malformed and empty payload defaults gracefully', async () => {
      const res = await fetch(`${baseUrl}/api/pdf/business-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 4).toString(), '%PDF');
    });

    await test('3.10 HTTP /api/sequence rejects invalid start/end/increment with 400', async () => {
      const res1 = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 'abc', end: 100 }),
      });
      assert.equal(res1.status, 400);

      const res2 = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 100, end: 10 }),
      });
      assert.equal(res2.status, 400);

      const res3 = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 1, end: 10, step: 0 }),
      });
      assert.equal(res3.status, 400);
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exitCode = 1;
  }
}

run();
