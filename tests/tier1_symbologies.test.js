import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderBarcode } from '../src/symbologies/renderer.js';
import { getSymbology, listSymbologies, DM_SIZES } from '../src/symbologies/catalog.js';
import { parseEscapeSequences, formatSequenceValue, generateSequence } from '../src/symbologies/formatters.js';
import { computeMod10Recursive, isValidSwissQrReference, isQrIban, buildSwissPayload, defaultSwissState, buildEpcPayload, defaultEpcState, buildZatcaPayload, defaultZatcaState } from '../src/forms/banking.js';
import { buildGs1DigitalLink, defaultGs1DigitalLinkState, validateGs1DigitalLink } from '../src/forms/gs1DigitalLink.js';

describe('Tier 1: Symbologies, Escape Sequences & Sequence Expansion', () => {

  describe('1.1 Symbology Catalog Verification', () => {
    it('enumerates all 150 symbology entries across 13 categories', () => {
      const allSyms = listSymbologies();
      assert.equal(allSyms.length, 150, `Expected 150 symbologies, got ${allSyms.length}`);
      
      const categoryIds = new Set(allSyms.map(s => s.categoryId));
      const requiredCategories = [
        'linear', 'postal', 'gs1-databar', 'ean-upc', '2d',
        'gs1-2d', 'banking', 'mobile', 'healthcare', 'isbn',
        'business-cards', 'events', 'wifi'
      ];
      for (const cat of requiredCategories) {
        assert.ok(categoryIds.has(cat), `Missing required category: ${cat}`);
      }
    });

    it('retrieves default PDF417 symbology when code is omitted', () => {
      const defaultSym = getSymbology();
      assert.ok(defaultSym);
      assert.equal(defaultSym.id, 'PDF417');
      assert.equal(defaultSym.bcid, 'pdf417');
    });

    it('case-insensitively resolves aliases and symbology identifiers', () => {
      assert.equal(getSymbology('pdf417').id, 'PDF417');
      assert.equal(getSymbology('PDF417').id, 'PDF417');
      assert.equal(getSymbology('qrcode').id, 'QRCode');
      assert.equal(getSymbology('QRCODE').id, 'QRCode');
      assert.equal(getSymbology('code128').id, 'Code128');
      assert.equal(getSymbology('datamatrix').id, 'DataMatrix');
    });
  });

  describe('1.2 Category 1: Linear Symbologies', () => {
    it('renders Code128 with PNG and SVG output', async () => {
      const pngRes = await renderBarcode({ code: 'Code128', data: 'INV-2026-9901', imagetype: 'png' });
      assert.equal(pngRes.status, 200);
      assert.equal(pngRes.mimeType, 'image/png');
      assert.ok(pngRes.buffer.length > 50);

      const svgRes = await renderBarcode({ code: 'Code128', data: 'INV-2026-9901', imagetype: 'svg' });
      assert.equal(svgRes.status, 200);
      assert.equal(svgRes.mimeType, 'image/svg+xml');
      const svgStr = svgRes.buffer.toString('utf8');
      assert.ok(svgStr.includes('<svg'), 'Expected SVG element');
    });

    it('renders Code39, Code25IL (Interleaved 2 of 5), and GS1-128', async () => {
      const code39Res = await renderBarcode({ code: 'Code39', data: 'TEST-39' });
      assert.equal(code39Res.status, 200);
      assert.ok(code39Res.buffer.length > 50);

      const code25Res = await renderBarcode({ code: 'Code25IL', data: '0123456789' });
      assert.equal(code25Res.status, 200);
      assert.ok(code25Res.buffer.length > 50);

      const gs1Res = await renderBarcode({ code: 'GS1-128', data: '(01)01234567890128(21)SER123' });
      assert.equal(gs1Res.status, 200);
      assert.ok(gs1Res.buffer.length > 50);
    });
  });

  describe('1.3 Category 2: Postal Symbologies', () => {
    it('renders Korean Postal Authority Code (raw 3-of-5)', async () => {
      const res = await renderBarcode({ code: 'KoreanPostal', data: '123456' });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });

    it('renders DPD Barcode with (I) routing prefix normalization', async () => {
      const res = await renderBarcode({ code: 'DPD', data: 'X007110601631234567890136276' });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });

    it('renders UPU S10 and PostNet11', async () => {
      const upuRes = await renderBarcode({ code: 'UPUS10', data: 'EE123456785CH' });
      assert.equal(upuRes.status, 200);
      assert.ok(upuRes.buffer.length > 50);

      const postnetRes = await renderBarcode({ code: 'PostNet11', data: '01234567890' });
      assert.equal(postnetRes.status, 200);
      assert.ok(postnetRes.buffer.length > 50);
    });

    it('renders AustralianPost Standard Customer', async () => {
      const ausRes = await renderBarcode({ code: 'AustralianPost', data: '59564391' });
      assert.equal(ausRes.status, 200);
      assert.ok(ausRes.buffer.length > 50);
    });
  });

  describe('1.4 Category 3: GS1 DataBar Symbologies', () => {
    it('renders GS1DataBar, GS1DataBarExpanded, and GS1DataBarStacked', async () => {
      const omni = await renderBarcode({ code: 'GS1DataBar', data: '0123456789012' });
      assert.equal(omni.status, 200);
      assert.ok(omni.buffer.length > 50);

      const exp = await renderBarcode({ code: 'GS1DataBarExpanded', data: '(01)09521234543213(3103)000123' });
      assert.equal(exp.status, 200);
      assert.ok(exp.buffer.length > 50);

      const stacked = await renderBarcode({ code: 'GS1DataBarStacked', data: '0123456789012' });
      assert.equal(stacked.status, 200);
      assert.ok(stacked.buffer.length > 50);
    });

    it('renders GS1-128CCA Composite Symbology with 2D composite separator', async () => {
      const res = await renderBarcode({
        code: 'GS1-128CCA',
        data: '(00)095287654321012346|(02)09521234543213(37)24',
      });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });
  });

  describe('1.5 Category 4: EAN / UPC Symbologies', () => {
    it('renders EAN13, EAN8, UPCA, and UPCE', async () => {
      const ean13 = await renderBarcode({ code: 'EAN13', data: '9520123456788' });
      assert.equal(ean13.status, 200);
      assert.ok(ean13.buffer.length > 50);

      const ean8 = await renderBarcode({ code: 'EAN8', data: '95200002' });
      assert.equal(ean8.status, 200);
      assert.ok(ean8.buffer.length > 50);

      const upca = await renderBarcode({ code: 'UPCA', data: '012345678905' });
      assert.equal(upca.status, 200);
      assert.ok(upca.buffer.length > 50);

      const upce = await renderBarcode({ code: 'UPCE', data: '0123456' });
      assert.equal(upce.status, 200);
      assert.ok(upce.buffer.length > 50);
    });

    it('renders EAN13CCA Composite with 2D segment', async () => {
      const res = await renderBarcode({ code: 'EAN13CCA', data: '9520123456788|(21)A12345678' });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });
  });

  describe('1.6 Category 5: 2D Codes (PDF417, MicroPDF417, QRCode, DataMatrix, Aztec, DotCode)', () => {
    it('renders standard PDF417 with default parameters', async () => {
      const res = await renderBarcode({ code: 'PDF417', data: 'PDF417 Production Test Payload' });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 100);
    });

    it('applies PDF417 advanced parameters: columns, rows, eclevel, rowmult', async () => {
      // Column limits
      const resCols = await renderBarcode({
        code: 'PDF417',
        data: 'PDF417 Columns Test',
        pdfcolumns: 5,
      });
      assert.equal(resCols.status, 200);

      // Explicit rows
      const resRows = await renderBarcode({
        code: 'PDF417',
        data: 'PDF417 Explicit Rows Test',
        pdfcolumns: 3,
        pdfrows: 15,
      });
      assert.equal(resRows.status, 200);

      // Security / Error Correction levels 0 through 8
      for (const ec of [0, 2, 5, 8]) {
        const resEc = await renderBarcode({
          code: 'PDF417',
          data: `PDF417 Security Level ${ec} Test Payload`,
          pdfeclevel: ec,
        });
        assert.equal(resEc.status, 200, `PDF417 EC ${ec} failed`);
      }

      // Row height multiplier
      const resMult = await renderBarcode({
        code: 'PDF417',
        data: 'PDF417 Row Height Multiplier Test',
        pdfrowmult: 4,
      });
      assert.equal(resMult.status, 200);
    });

    it('renders PDF417 Compact variant', async () => {
      const res = await renderBarcode({
        code: 'PDF417',
        data: 'Compact PDF417 Test Payload',
        pdfvariant: 'compact',
      });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });

    it('renders MicroPDF417 symbology', async () => {
      const res = await renderBarcode({
        code: 'MicroPDF417',
        data: 'MicroPDF417 Space-Constrained Label',
      });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 50);
    });

    it('renders QR Code with all 4 Error Correction levels (L, M, Q, H)', async () => {
      for (const ec of ['L', 'M', 'Q', 'H']) {
        const res = await renderBarcode({
          code: 'QRCode',
          data: `QR Code EC Level ${ec} Verification`,
          eclevel: ec,
        });
        assert.equal(res.status, 200, `QR Code EC ${ec} failed`);
        assert.ok(res.buffer.length > 100);
      }
    });

    it('renders Data Matrix across square and rectangular symbol sizes', async () => {
      // Default auto-sizing
      const defaultDm = await renderBarcode({ code: 'DataMatrix', data: 'Data Matrix Standard Payload' });
      assert.equal(defaultDm.status, 200);

      // Square sizes (10x10, 26x26, 144x144)
      for (const dim of ['10x10', '26x26', '144x144']) {
        const res = await renderBarcode({
          code: 'DataMatrix',
          data: `Square ${dim}`,
          dmsize: `Square${dim}`,
        });
        assert.equal(res.status, 200, `Data Matrix Square${dim} failed`);
      }

      // Rectangular sizes (8x18, 16x48)
      for (const dim of ['8x18', '16x48']) {
        const res = await renderBarcode({
          code: 'DataMatrix',
          data: `Rect ${dim}`,
          dmsize: `Rectangle${dim}`,
        });
        assert.equal(res.status, 200, `Data Matrix Rectangle${dim} failed`);
      }
    });

    it('renders Aztec and DotCode symbologies', async () => {
      const aztec = await renderBarcode({ code: 'Aztec', data: 'Aztec Code Verification Payload' });
      assert.equal(aztec.status, 200);
      assert.ok(aztec.buffer.length > 50);

      const dotcode = await renderBarcode({ code: 'DotCode', data: 'DotCode DPM Laser Test 12345' });
      assert.equal(dotcode.status, 200);
      assert.ok(dotcode.buffer.length > 50);
    });
  });

  describe('1.7 Category 6: GS1 2D Codes', () => {
    it('renders GS1DigitalLink_QRCode and GS1DigitalLink_DataMatrix', async () => {
      const dlUri = 'https://dalgiardino.com/01/09506000134376/10/ABC/21/123456?17=221231';

      const qrRes = await renderBarcode({ code: 'GS1DigitalLink_QRCode', data: dlUri });
      assert.equal(qrRes.status, 200);
      assert.ok(qrRes.buffer.length > 100);

      const dmRes = await renderBarcode({ code: 'GS1DigitalLink_DataMatrix', data: dlUri });
      assert.equal(dmRes.status, 200);
      assert.ok(dmRes.buffer.length > 100);
    });

    it('validates and builds GS1 Digital Link URIs with primary key, qualifiers, and attributes', () => {
      const state = defaultGs1DigitalLinkState();
      const errors = validateGs1DigitalLink(state);
      assert.equal(Object.keys(errors).length, 0);

      const uri = buildGs1DigitalLink(state);
      assert.ok(uri.startsWith('https://dalgiardino.com/01/09506000134376'));
      assert.ok(uri.includes('/10/ABC'));
      assert.ok(uri.includes('/21/123456'));
      assert.ok(uri.includes('17=221231'));
    });

    it('renders GS1QRCode and GS1DataMatrix carrying GS1 AIs with FNC1 separators', async () => {
      const gs1qr = await renderBarcode({
        code: 'GS1QRCode',
        data: '0101234567890128\\F21SER9999',
        'translate-esc': 'true',
      });
      assert.equal(gs1qr.status, 200);

      const gs1dm = await renderBarcode({
        code: 'GS1DataMatrix',
        data: '01012345678901281721022110BATCH1\\F21SER2',
        'translate-esc': 'true',
      });
      assert.equal(gs1dm.status, 200);
    });
  });

  describe('1.8 Category 7: Banking & Payment Codes (Swiss QR, EPC, ZATCA)', () => {
    it('computes Mod-10 recursive check digit for Swiss QR Reference', () => {
      // Known reference: 21 00000 00003 13947 14300 09017
      // 26 digits data: 21000000000313947143000901
      // Check digit: 7
      const checkDigit = computeMod10Recursive('21000000000313947143000901');
      assert.equal(checkDigit, '7');
      assert.ok(isValidSwissQrReference('210000000003139471430009017'));
      assert.equal(isValidSwissQrReference('210000000003139471430009018'), false);
    });

    it('identifies QR-IBAN (IID between 30000 and 31999)', () => {
      assert.ok(isQrIban('CH4431999123000889012'), 'Should be QR-IBAN');
      assert.equal(isQrIban('CH3908704016075473007'), false, 'Standard IBAN is not QR-IBAN');
    });

    it('renders SwissQRCodeV23QRR with valid Swiss QR v2.3 QRR payload', async () => {
      const state = defaultSwissState('QRR');
      const payload = buildSwissPayload(state, 'QRR');
      assert.ok(payload.startsWith('SPC\r\n0200\r\n1\r\nCH4431999123000889012'));
      assert.ok(payload.includes('QRR'));

      const res = await renderBarcode({ code: 'SwissQRCodeV23QRR', data: payload });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 100);
    });

    it('renders SwissQRCodeV23SCOR and SwissQRCodeV23 (NON)', async () => {
      const scorPayload = buildSwissPayload(defaultSwissState('SCOR'), 'SCOR');
      const scorRes = await renderBarcode({ code: 'SwissQRCodeV23SCOR', data: scorPayload });
      assert.equal(scorRes.status, 200);

      const nonPayload = buildSwissPayload(defaultSwissState('NON'), 'NON');
      const nonRes = await renderBarcode({ code: 'SwissQRCodeV23', data: nonPayload });
      assert.equal(nonRes.status, 200);
    });

    it('renders EPCQRCode with SEPA Credit Transfer payload', async () => {
      const epcState = defaultEpcState();
      epcState.Amount = '150.00';
      const epcPayload = buildEpcPayload(epcState);
      assert.ok(epcPayload.startsWith('BCD\n002\n1\nSCT\nBHBLDEHHXXX\nMartian Pioneers\nDE71110220330123456789\nEUR150.00'));

      const res = await renderBarcode({ code: 'EPCQRCode', data: epcPayload });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 100);
    });

    it('encodes and renders ZATCAQRCode with Saudi KSA TLV Base64', async () => {
      const zatcaState = defaultZatcaState();
      const b64 = buildZatcaPayload(zatcaState);
      assert.ok(typeof b64 === 'string' && b64.length > 20);

      const res = await renderBarcode({ code: 'ZATCAQRCode', data: b64 });
      assert.equal(res.status, 200);
      assert.ok(res.buffer.length > 100);
    });
  });

  describe('1.9 Categories 8–13: Mobile, Healthcare, Publishing, Cards, Events, Wi-Fi', () => {
    it('renders Mobile QR, Mobile URL, and Mobile Aztec SMS', async () => {
      const urlRes = await renderBarcode({ code: 'MobileSemaUrl', data: 'https://tec-it.com' });
      assert.equal(urlRes.status, 200);

      const smsRes = await renderBarcode({ code: 'MobileAztecSMS', data: 'SMSTO:+123456789:Hello' });
      assert.equal(smsRes.status, 200);
    });

    it('renders Healthcare codes: HIBC LIC, HIBC PAS, PZN7, PZN8, PPN', async () => {
      const hibcLic = await renderBarcode({ code: 'Health_HIBCLIC128', data: '+A123BJC543211' });
      assert.equal(hibcLic.status, 200);

      const hibcPas = await renderBarcode({ code: 'Health_HIBCPAS128', data: '+$$70123451234' });
      assert.equal(hibcPas.status, 200);

      const pzn7 = await renderBarcode({ code: 'Health_PZN7', data: '123456' });
      assert.equal(pzn7.status, 200);

      const pzn8 = await renderBarcode({ code: 'Health_PZN8', data: '1234567' });
      assert.equal(pzn8.status, 200);

      const ppn = await renderBarcode({ code: 'Health_PPN', data: '9N110375286414' });
      assert.equal(ppn.status, 200);
    });

    it('renders Publishing codes: ISBN13, ISBN13P5, ISMN, ISSN, ISSNP2', async () => {
      const isbn = await renderBarcode({ code: 'ISBN13', data: '978-3-16-148410-0' });
      assert.equal(isbn.status, 200);

      const ismn = await renderBarcode({ code: 'ISMN', data: '979-0-2600-0043-8' });
      assert.equal(ismn.status, 200);

      const issn = await renderBarcode({ code: 'ISSN', data: '1234-5679' });
      assert.equal(issn.status, 200);

      const issnp2 = await renderBarcode({ code: 'ISSNP2', data: '1234-5679 05' });
      assert.equal(issnp2.status, 200);
    });

    it('renders Business Cards (vCard, MeCard)', async () => {
      const vcard = await renderBarcode({
        code: 'QRCode_Business_vCard',
        data: 'BEGIN:VCARD\nVERSION:3.0\nN:Doe;John\nFN:John Doe\nTEL:+15551234567\nEND:VCARD',
      });
      assert.equal(vcard.status, 200);

      const mecard = await renderBarcode({
        code: 'QRCode_Business_meCard',
        data: 'MECARD:N:Doe,John;TEL:15551234567;;',
      });
      assert.equal(mecard.status, 200);
    });

    it('renders Events (VEVENT iCalendar)', async () => {
      const ev = await renderBarcode({
        code: 'QRCode_Events',
        data: 'BEGIN:VEVENT\nSUMMARY:Launch\nDTSTART:20261116T120000Z\nDTEND:20261116T130000Z\nEND:VEVENT',
      });
      assert.equal(ev.status, 200);
    });

    it('renders Wi-Fi credentials QR Code & Data Matrix', async () => {
      const wifiPayload = 'WIFI:T:WPA;S:StudioNetwork;P:SuperSecretPass;H:false;;';
      const wifiQr = await renderBarcode({ code: 'QRCode_Wifi', data: wifiPayload });
      assert.equal(wifiQr.status, 200);

      const wifiDm = await renderBarcode({ code: 'DataMatrix_Wifi', data: wifiPayload });
      assert.equal(wifiDm.status, 200);
    });
  });

  describe('1.10 Escape Sequences Translation', () => {
    it('translates \\F to FNC1 token (default \\x1D)', () => {
      const res = parseEscapeSequences('0101234567890128\\F21SER1234');
      assert.equal(res, '0101234567890128\x1D21SER1234');
    });

    it('translates \\F to custom FNC1 token when specified', () => {
      const res = parseEscapeSequences('0101234567890128\\F21SER1234', { fnc1Token: '^FNC1' });
      assert.equal(res, '0101234567890128^FNC121SER1234');
    });

    it('translates \\t, \\n, \\r, \\\\', () => {
      const res = parseEscapeSequences('Line1\\nLine2\\r\\tTabbed\\\\Backslash');
      assert.equal(res, 'Line1\nLine2\r\tTabbed\\Backslash');
    });

    it('translates hex escape sequences \\xHH', () => {
      const res = parseEscapeSequences('Prefix\\x1DRecord\\x1ESeparator\\x41');
      assert.equal(res, 'Prefix\x1DRecord\x1ESeparatorA');
    });

    it('leaves plain strings without backslashes unmodified', () => {
      const plain = 'Normal text without escapes 12345!';
      assert.equal(parseEscapeSequences(plain), plain);
    });

    it('handles adversarial escaping and mixed control characters', () => {
      const adv = '\\x01\\x02\\x03\\t\\n\\r\\\\FNC1:\\F\\x20End';
      const parsed = parseEscapeSequences(adv);
      assert.equal(parsed, '\x01\x02\x03\t\n\r\\FNC1:\x1D End');
    });
  });

  describe('1.11 Sequence Expansion ($, #, * Masks)', () => {
    it('formats sequence value with $ mask (leading zeros)', () => {
      assert.equal(formatSequenceValue(7, '$$$$'), '0007');
      assert.equal(formatSequenceValue(42, '$$$$'), '0042');
      assert.equal(formatSequenceValue(999, '$$$$'), '0999');
      assert.equal(formatSequenceValue(1000, '$$$$'), '1000');
    });

    it('handles $ mask overflow when value has more digits than mask', () => {
      assert.equal(formatSequenceValue(12345, '$$$$'), '12345');
      assert.equal(formatSequenceValue(9876543, '$$$'), '9876543');
    });

    it('formats sequence value with # mask (leading spaces)', () => {
      assert.equal(formatSequenceValue(7, '####'), '   7');
      assert.equal(formatSequenceValue(42, '####'), '  42');
      assert.equal(formatSequenceValue(1234, '####'), '1234');
    });

    it('formats sequence value with * mask (leading asterisks)', () => {
      assert.equal(formatSequenceValue(7, '****'), '***7');
      assert.equal(formatSequenceValue(42, '****'), '**42');
      assert.equal(formatSequenceValue(1234, '****'), '1234');
    });

    it('preserves literal characters around placeholders in masks', () => {
      assert.equal(formatSequenceValue(42, 'ID-$$$$-X'), 'ID-0042-X');
      assert.equal(formatSequenceValue(7, 'A#B#C#'), 'A B C7');
    });

    it('generates a full sequence array with prefix, suffix, and step', () => {
      const items = generateSequence({
        prefix: 'PALLET-',
        suffix: '-A',
        start: 10,
        end: 50,
        increment: 10,
        mask: '$$$$',
      });
      assert.deepEqual(items, [
        'PALLET-0010-A',
        'PALLET-0020-A',
        'PALLET-0030-A',
        'PALLET-0040-A',
        'PALLET-0050-A',
      ]);
    });

    it('respects safety maxCount cap on sequence generation', () => {
      const items = generateSequence({
        start: 1,
        end: 100000,
        increment: 1,
        mask: '$$$$',
        maxCount: 25,
      });
      assert.equal(items.length, 25);
      assert.equal(items[0], '0001');
      assert.equal(items[24], '0025');
    });

    it('throws meaningful errors for invalid sequence bounds and parameters', () => {
      assert.throws(() => generateSequence({ start: 10, end: 5, increment: 1 }), /End Value must be greater than or equal to Start Value/);
      assert.throws(() => generateSequence({ start: 1, end: 10, increment: 0 }), /Increment must be greater than 0/);
      assert.throws(() => generateSequence({ start: 'invalid', end: 10, increment: 1 }), /Start, End, and Increment must be valid numbers/);
    });
  });

});
