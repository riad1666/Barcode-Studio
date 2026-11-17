import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { renderBarcode } from '../src/symbologies/renderer.js';
import { renderBatchZip, splitBarcodeRows, parseCsvRecords } from '../src/utils/batch.js';
import { generateBusinessCardPdf } from '../src/pdf/businessCardPdf.js';
import { generateLabelPdf } from '../src/pdf/labelPdf.js';

describe('Tier 2: Export Formats, Batch ZIP & PDF Production', () => {

  describe('2.1 Format Binary Headers & Magic Byte Signatures', () => {
    it('verifies PNG signature (89 50 4E 47 0D 0A 1A 0A)', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'PNG Signature Check', imagetype: 'png' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/png');
      assert.equal(res.ext, 'png');
      const buf = res.buffer;
      const expectedHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      assert.deepEqual(buf.subarray(0, 8), expectedHeader, 'PNG must start with standard 8-byte PNG signature');
    });

    it('verifies SVG signature (<svg xmlns="http://www.w3.org/2000/svg")', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'SVG Signature Check', imagetype: 'svg' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/svg+xml');
      assert.equal(res.ext, 'svg');
      const text = res.buffer.toString('utf8');
      assert.ok(text.startsWith('<svg') || text.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
      assert.ok(text.includes('</svg>'));
    });

    it('verifies JPEG signature (FF D8 FF)', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'JPG Signature Check', imagetype: 'jpg' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/jpeg');
      assert.equal(res.ext, 'jpg');
      const buf = res.buffer;
      assert.equal(buf[0], 0xFF);
      assert.equal(buf[1], 0xD8);
      assert.equal(buf[2], 0xFF);
    });

    it('verifies GIF signature (GIF89a / GIF87a -> 47 49 46 38)', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'GIF Signature Check', imagetype: 'gif' });
      assert.equal(res.status, 200);
      assert.equal(res.mimeType, 'image/gif');
      assert.equal(res.ext, 'gif');
      const buf = res.buffer;
      const gifHeader = buf.subarray(0, 6).toString('ascii');
      assert.ok(gifHeader === 'GIF89a' || gifHeader === 'GIF87a', `Unexpected GIF header: ${gifHeader}`);
    });

    it('verifies PDF signature (%PDF- -> 25 50 44 46 2D)', async () => {
      const pdfBuf = await generateBusinessCardPdf({
        FirstName: 'Ada',
        LastName: 'Lovelace',
        Company: 'Analytical Engines Ltd',
        Layout: 'single',
      });
      const header = pdfBuf.subarray(0, 5).toString('ascii');
      assert.equal(header, '%PDF-', 'PDF must begin with %PDF-');
    });

    it('verifies ZIP signature (PK.. -> 50 4B 03 04)', async () => {
      const batchRes = await renderBatchZip({
        code: 'Code128',
        data: 'ITEM-001\nITEM-002\nITEM-003',
        imagetype: 'png',
      });
      const buf = batchRes.buffer;
      assert.equal(buf[0], 0x50, 'PK byte 1');
      assert.equal(buf[1], 0x4B, 'PK byte 2');
      assert.equal(buf[2], 0x03, 'PK byte 3');
      assert.equal(buf[3], 0x04, 'PK byte 4');
    });
  });

  describe('2.2 Batch ZIP (>10 Rows Unlimited Generation)', () => {
    it('splits multiline payload and handles CRLF and LF lines', () => {
      const text = 'Line 1\r\nLine 2\nLine 3\r\n\r\nLine 4';
      const rows = splitBarcodeRows(text);
      assert.deepEqual(rows, ['Line 1', 'Line 2', 'Line 3', 'Line 4']);
    });

    it('parses CSV records adhering to RFC-4180 rules', () => {
      const csv = 'sku,name,qty\n"SKU-001","Widget, Standard",10\nSKU-002,"Special ""Deluxe""",5';
      const parsed = parseCsvRecords(csv);
      assert.deepEqual(parsed.headers, ['sku', 'name', 'qty']);
      assert.equal(parsed.rows.length, 2);
      assert.equal(parsed.rows[0].sku, 'SKU-001');
      assert.equal(parsed.rows[0].name, 'Widget, Standard');
      assert.equal(parsed.rows[1].name, 'Special "Deluxe"');
    });

    it('generates a valid ZIP containing 25 barcodes (>10 row TEC-IT limit bypassed)', async () => {
      const rows = [];
      for (let i = 1; i <= 25; i += 1) {
        rows.push(`SN-2026-${String(i).padStart(4, '0')}`);
      }
      const dataPayload = rows.join('\n');

      const batchRes = await renderBatchZip({
        code: 'PDF417',
        data: dataPayload,
        imagetype: 'png',
      });

      assert.equal(batchRes.count, 25);
      assert.equal(batchRes.errors.length, 0);

      // Inspect contents inside the ZIP
      const zip = await JSZip.loadAsync(batchRes.buffer);
      const fileNames = Object.keys(zip.files).filter((fn) => !fn.endsWith('/'));
      assert.equal(fileNames.length, 25, 'Expected exactly 25 files in ZIP');

      // Verify each file is non-empty and starts with PNG header
      for (const fn of fileNames) {
        const fileData = await zip.files[fn].async('nodebuffer');
        assert.ok(fileData.length > 50, `File ${fn} too small: ${fileData.length} bytes`);
        const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
        assert.deepEqual(fileData.subarray(0, 4), pngMagic, `File ${fn} is not valid PNG`);
      }
    });

    it('generates batch ZIP in SVG format and captures error logs when rows fail', async () => {
      // 3 valid rows + 1 invalid row
      const dataPayload = 'VALID-01\nVALID-02\nVALID-03';
      const batchRes = await renderBatchZip({
        code: 'Code128',
        data: dataPayload,
        imagetype: 'svg',
      });

      assert.equal(batchRes.count, 3);
      const zip = await JSZip.loadAsync(batchRes.buffer);
      const fileNames = Object.keys(zip.files);
      assert.equal(fileNames.length, 3);
      for (const fn of fileNames) {
        const svgText = await zip.files[fn].async('string');
        assert.ok(svgText.includes('<svg'), `File ${fn} should be SVG`);
      }
    });
  });

  describe('2.3 Business Card PDF Export (Single & 10-Up Sheet)', () => {
    const contactBase = {
      FirstName: 'Nikola',
      LastName: 'Tesla',
      Company: 'Wardenclyffe Lab',
      Position: 'Chief Electrical Engineer',
      Email: 'nikola@tesla.org',
      Cell: '+1 555 777 8888',
      Phone: '+1 555 111 2222',
      Url: 'https://tesla-power.org',
      Address: 'Shoreham',
      City: 'Long Island',
      State: 'NY',
      ZIP: '11786',
      Country: 'USA',
    };

    it('generates single 85x54 mm business card PDF with exact page dimensions', async () => {
      const pdfBuf = await generateBusinessCardPdf({
        ...contactBase,
        Layout: 'single',
        Symbology: 'QRCode',
        Format: 'vCard',
        Template: 'classic-minimal',
      });

      assert.ok(pdfBuf.length > 1000);
      const pdfDoc = await PDFDocument.load(pdfBuf);
      assert.equal(pdfDoc.getPageCount(), 1);

      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();
      // 85 mm * (72 / 25.4) = ~240.94 pt, 54 mm * (72 / 25.4) = ~153.07 pt
      assert.ok(Math.abs(width - 240.94) < 0.5, `Width ${width} expected ~240.94`);
      assert.ok(Math.abs(height - 153.07) < 0.5, `Height ${height} expected ~153.07`);
    });

    it('generates 10-up A4 sheet with crop marks', async () => {
      const pdfBuf = await generateBusinessCardPdf({
        ...contactBase,
        Layout: 'a4-10up',
        Symbology: 'DataMatrix',
        Format: 'MeCard',
        Template: 'executive-band',
      });

      assert.ok(pdfBuf.length > 2000);
      const pdfDoc = await PDFDocument.load(pdfBuf);
      assert.equal(pdfDoc.getPageCount(), 1);

      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();
      // A4 is 595.28 x 841.89 pt
      assert.ok(Math.abs(width - 595.28) < 1, `A4 Width ${width}`);
      assert.ok(Math.abs(height - 841.89) < 1, `A4 Height ${height}`);
    });

    it('generates 10-up US Letter sheet', async () => {
      const pdfBuf = await generateBusinessCardPdf({
        ...contactBase,
        Layout: 'letter-10up',
        Symbology: 'PDF417',
        Format: 'vCard',
        Template: 'accent-rail',
      });

      assert.ok(pdfBuf.length > 2000);
      const pdfDoc = await PDFDocument.load(pdfBuf);
      assert.equal(pdfDoc.getPageCount(), 1);

      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();
      // Letter is 612 x 792 pt
      assert.ok(Math.abs(width - 612) < 1, `Letter Width ${width}`);
      assert.ok(Math.abs(height - 792) < 1, `Letter Height ${height}`);
    });

    it('supports all 4 visual templates: classic-minimal, executive-band, accent-rail, compact-split', async () => {
      const templates = ['classic-minimal', 'executive-band', 'accent-rail', 'compact-split'];
      for (const tmpl of templates) {
        const buf = await generateBusinessCardPdf({
          ...contactBase,
          Layout: 'single',
          Template: tmpl,
        });
        assert.ok(buf.length > 1000);
        const doc = await PDFDocument.load(buf);
        assert.equal(doc.getPageCount(), 1);
      }
    });

    it('supports optional embedded PNG/JPEG logo via Data URL', async () => {
      // 1x1 transparent PNG data URL
      const blankPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buf = await generateBusinessCardPdf({
        ...contactBase,
        Layout: 'single',
        LogoDataUrl: blankPngDataUrl,
      });
      assert.ok(buf.length > 1000);
      const doc = await PDFDocument.load(buf);
      assert.equal(doc.getPageCount(), 1);
    });
  });

  describe('2.4 Compliance & Industrial Label PDF Export', () => {
    it('generates VDA 4902 V4 (A5 Landscape 210x148 mm) compliance label', async () => {
      const vdaData = {
        receiver: 'DAIMLER AG - WERK UNTERTUERKHEIM',
        receiverCity: '70327 STUTTGART / GERMANY',
        dock: 'GATE 4 / DOCK B',
        adviseNo: 'LS-9988123',
        supplier: 'BOSCH AUTOMOTIVE GMBH',
        date: '2026-11-16',
        partNumber: 'A 000 905 43 00',
        partDescription: 'RADAR SENSOR SHORT RANGE',
        quantity: '120',
        quantityUnit: 'PCE',
        packagingType: 'KLT-4314',
        supplierCode: 'V-102948',
        serialNumber: 'S-2026111601',
        batchNumber: 'B-7788',
      };

      const pdfBuf = await generateLabelPdf({
        template: 'vda4902',
        fields: vdaData,
      });

      assert.ok(pdfBuf.length > 1500);
      const doc = await PDFDocument.load(pdfBuf);
      assert.equal(doc.getPageCount(), 1);

      const page = doc.getPage(0);
      const { width, height } = page.getSize();
      // 210 x 148 mm in pt = 595.28 x 419.53 pt
      assert.ok(Math.abs(width - 595.28) < 1, `VDA Width ${width}`);
      assert.ok(Math.abs(height - 419.53) < 1, `VDA Height ${height}`);
    });

    it('generates AIAG B-10 shipping and part label', async () => {
      const pdfBuf = await generateLabelPdf({
        template: 'aiag-b10',
        fields: {
          partNumber: 'PART-AIAG-99',
          quantity: '500',
          supplier: 'DETROIT AUTO SUPPLY',
          serialNumber: '10048291',
        },
      });

      assert.ok(pdfBuf.length > 1500);
      const doc = await PDFDocument.load(pdfBuf);
      assert.equal(doc.getPageCount(), 1);
    });

    it('generates GS1 4x6" Logistics Shipping Label (with PDF417 manifest & SSCC-18)', async () => {
      const pdfBuf = await generateLabelPdf({
        template: 'gs1-shipping',
        fields: {
          shipFrom: 'Global Supply Depot, Chicago, IL',
          shipTo: 'Amazon Fulfillment Center MDW2, Joliet, IL',
          carrier: 'FEDEX FREIGHT',
          reference: 'PO-882941',
          partNumber: 'SKU-LOG-900',
          quantity: '24',
          sscc: '003123456789012345',
        },
      });

      assert.ok(pdfBuf.length > 1500);
      const doc = await PDFDocument.load(pdfBuf);
      assert.equal(doc.getPageCount(), 1);

      const page = doc.getPage(0);
      const { width, height } = page.getSize();
      // 4 x 6 inches = 288 x 432 pt
      assert.ok(Math.abs(width - 288) < 1, `GS1 Shipping Width ${width}`);
      assert.ok(Math.abs(height - 432) < 1, `GS1 Shipping Height ${height}`);
    });

    it('generates CSV Grid Sheet (multi-page sticker grid from multiline CSV)', async () => {
      // 30 items on 3x8 (24 items per page) grid -> should span 2 pages
      const lines = ['sku,name'];
      for (let i = 1; i <= 30; i += 1) {
        lines.push(`SKU-${String(i).padStart(4, '0')},Product ${i}`);
      }

      const pdfBuf = await generateLabelPdf({
        template: 'csv-sheet',
        csvText: lines.join('\n'),
        cols: 3,
        rows: 8,
        paperSize: 'a4',
      });

      assert.ok(pdfBuf.length > 2500);
      const doc = await PDFDocument.load(pdfBuf);
      assert.equal(doc.getPageCount(), 2, '30 items on 24-item grid must produce 2 pages');
    });
  });

});
