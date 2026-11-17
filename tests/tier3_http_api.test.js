import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { app } from '../server.js';

describe('Tier 3: HTTP API & TEC-IT Compatibility Suite', () => {
  let server;
  let baseUrl;

  before(() => {
    return new Promise((resolve) => {
      // Allocate a dynamic OS port to ensure complete test isolation
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      if (server) {
        server.close(resolve);
      } else {
        resolve();
      }
    });
  });

  describe('3.1 TEC-IT /barcode.ashx Compatibility (GET & POST)', () => {
    it('GET /barcode.ashx returns 200 with PNG image by default', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=PDF417&data=HTTP-Test-Payload`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      const buf = Buffer.from(await res.arrayBuffer());
      const expectedPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      assert.deepEqual(buf.subarray(0, 4), expectedPngHeader);
    });

    it('GET /barcode.ashx returns 200 with SVG vector format', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=QRCode&data=Hello-SVG&format=svg`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('image/svg+xml'));
      const text = await res.text();
      assert.ok(text.includes('<svg') && text.includes('</svg>'));
    });

    it('GET /barcode.ashx returns 200 with JPEG format', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=Code128&data=INV-1002&format=jpg`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/jpeg');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf[0], 0xFF);
      assert.equal(buf[1], 0xD8);
      assert.equal(buf[2], 0xFF);
    });

    it('GET /barcode.ashx base64=true returns JSON payload and X-Mime-Type header', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=PDF417&data=Base64Check&base64=true`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-mime-type'), 'image/png');
      const data = await res.json();
      assert.equal(data.mime, 'image/png');
      assert.ok(typeof data.base64 === 'string' && data.base64.length > 50);

      // Verify base64 string decodes to valid PNG
      const decodedBuf = Buffer.from(data.base64, 'base64');
      const expectedPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      assert.deepEqual(decodedBuf.subarray(0, 4), expectedPngHeader);
    });

    it('GET /barcode.ashx OnError modes: OnError204 returns 204 No Content on error', async () => {
      // EAN13 with non-numeric text triggers encoding failure
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=NOT_A_VALID_EAN&onerror=OnError204`);
      assert.equal(res.status, 204);
      const text = await res.text();
      assert.equal(text, '');
    });

    it('GET /barcode.ashx OnError modes: OnError500 returns 500 Internal Server Error with message', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=NOT_A_VALID_EAN&onerror=OnError500`);
      assert.equal(res.status, 500);
      const text = await res.text();
      assert.ok(text.length > 0);
    });

    it('GET /barcode.ashx OnError modes: OnErrorDisplay returns 200 with error image', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx?code=EAN13&data=NOT_A_VALID_EAN&onerror=OnErrorDisplay`);
      assert.equal(res.status, 200);
      const buf = Buffer.from(await res.arrayBuffer());
      assert.ok(buf.length > 50);
    });

    it('GET /barcode.ashx multiplebarcodes=true returns application/zip with barcodes', async () => {
      const res = await fetch(
        `${baseUrl}/barcode.ashx?code=Code128&multiplebarcodes=true&data=ROW-A%0AROW-B%0AROW-C`,
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/zip');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf[0], 0x50);
      assert.equal(buf[1], 0x4B);

      const zip = await JSZip.loadAsync(buf);
      const fileNames = Object.keys(zip.files).filter((fn) => !fn.endsWith('/'));
      assert.equal(fileNames.length, 3);
    });

    it('POST /barcode.ashx handles JSON body parameters identically to GET', async () => {
      const res = await fetch(`${baseUrl}/barcode.ashx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'PDF417',
          data: 'POST-JSON-DATA',
          imagetype: 'svg',
        }),
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('image/svg+xml'));
      const text = await res.text();
      assert.ok(text.includes('<svg'));
    });

    it('POST /barcode.ashx handles application/x-www-form-urlencoded body', async () => {
      const body = new URLSearchParams({
        code: 'QRCode',
        data: 'POST-Form-UrlEncoded',
        imagetype: 'png',
      }).toString();

      const res = await fetch(`${baseUrl}/barcode.ashx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
    });
  });

  describe('3.2 Catalog & Sequence Endpoints', () => {
    it('GET /api/catalog returns complete symbology metadata and configuration lists', async () => {
      const res = await fetch(`${baseUrl}/api/catalog`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.categories), 'categories must be an array');
      assert.equal(data.categories.length, 13, 'must include all 13 categories');

      assert.ok(Array.isArray(data.quickJump), 'quickJump must be an array');
      assert.ok(data.quickJump.includes('PDF417'));
      assert.ok(data.quickJump.includes('QRCode'));

      assert.ok(Array.isArray(data.codePages), 'codePages must be an array');
      assert.ok(Array.isArray(data.fonts) || Array.isArray(data.fontOptions));
      assert.ok(Array.isArray(data.dmSizes) || Array.isArray(data.dataMatrixSizes));
    });

    it('GET /api/symbologies returns all 150 symbologies', async () => {
      const res = await fetch(`${baseUrl}/api/symbologies`);
      assert.equal(res.status, 200);
      const list = await res.json();
      assert.ok(Array.isArray(list));
      assert.equal(list.length, 150);
    });

    it('GET /api/symbologies/:id returns detailed metadata for a specific symbology', async () => {
      const res = await fetch(`${baseUrl}/api/symbologies/PDF417`);
      assert.equal(res.status, 200);
      const sym = await res.json();
      assert.equal(sym.id, 'PDF417');
      assert.equal(sym.bcid, 'pdf417');
    });

    it('POST /api/sequence generates expanded sequence items', async () => {
      const res = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'ITEM-',
          suffix: '-2026',
          start: 1,
          end: 5,
          increment: 1,
          mask: '$$$$',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.count, 5);
      const items = data.items || data.rows;
      assert.deepEqual(items, [
        'ITEM-0001-2026',
        'ITEM-0002-2026',
        'ITEM-0003-2026',
        'ITEM-0004-2026',
        'ITEM-0005-2026',
      ]);
    });

    it('POST /api/sequence rejects invalid numeric ranges with 400', async () => {
      const res = await fetch(`${baseUrl}/api/sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 10, end: 1, increment: 1 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });
  });

  describe('3.3 PDF Generation Endpoints', () => {
    it('POST /api/pdf/business-card returns valid PDF buffer', async () => {
      const res = await fetch(`${baseUrl}/api/pdf/business-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FirstName: 'Grace',
          LastName: 'Hopper',
          Company: 'US Navy / Harvard',
          Position: 'Rear Admiral',
          Email: 'hopper@navy.mil',
          Layout: 'single',
          Symbology: 'QRCode',
          Template: 'classic-minimal',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');

      const doc = await PDFDocument.load(buf);
      assert.equal(doc.getPageCount(), 1);
    });

    it('POST /api/pdf/label returns valid PDF compliance label', async () => {
      const res = await fetch(`${baseUrl}/api/pdf/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: 'vda4902',
          receiver: 'TEST AUDIT PLANT',
          partNumber: 'VDA-TEST-001',
          quantity: '100',
        }),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');

      const doc = await PDFDocument.load(buf);
      assert.equal(doc.getPageCount(), 1);
    });
  });

  describe('3.4 Bookmarkable SPA Routes & Health Check', () => {
    it('GET / serves the SPA HTML with 200', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'));
      const text = await res.text();
      assert.ok(text.includes('<!DOCTYPE html>') || text.includes('<html'));
    });

    it('GET /en serves the SPA HTML with 200', async () => {
      const res = await fetch(`${baseUrl}/en`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'));
    });

    it('GET /en/:code (e.g. /en/pdf417, /en/qrcode) serves SPA with 200', async () => {
      const res1 = await fetch(`${baseUrl}/en/pdf417`);
      assert.equal(res1.status, 200);
      assert.ok(res1.headers.get('content-type')?.includes('text/html'));

      const res2 = await fetch(`${baseUrl}/en/qrcode`);
      assert.equal(res2.status, 200);
      assert.ok(res2.headers.get('content-type')?.includes('text/html'));
    });

    it('GET /:code (e.g. /pdf417, /datamatrix) serves SPA with 200', async () => {
      const res = await fetch(`${baseUrl}/pdf417`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/html'));
    });

    it('GET /health returns 200 with server status', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(typeof data.uptime === 'number');
    });
  });

});
