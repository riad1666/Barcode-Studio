import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderBarcode } from '../symbologies/renderer.js';
import { parseCsvRecords } from '../utils/batch.js';

const MM = 72 / 25.4;

async function embedBarcodePng(pdfDoc, params) {
  const res = await renderBarcode({
    dpi: 300,
    imagetype: 'Png',
    color: '#000000',
    bgcolor: '#ffffff',
    ...params,
  });
  return pdfDoc.embedPng(res.buffer);
}

/** Render VDA 4902 V4 (210x148mm A5 Landscape) compliance label page. */
async function drawVda4902Page(pdfDoc, data, fonts) {
  const W = 210 * MM;
  const H = 148 * MM;
  const page = pdfDoc.addPage([W, H]);
  const margin = 8 * MM;
  const innerW = W - margin * 2;
  const innerH = H - margin * 2;
  const left = margin;
  const bottom = margin;
  const top = bottom + innerH;

  // Outer frame
  page.drawRectangle({ x: left, y: bottom, width: innerW, height: innerH, borderWidth: 1.2, borderColor: rgb(0, 0, 0) });

  // Horizontal grid splits (5 rows matching VDA 4902 proportions)
  const rowHeights = [26 * MM, 24 * MM, 30 * MM, 26 * MM, 26 * MM];
  let curY = top;
  const rowTops = [];
  for (const rh of rowHeights) {
    rowTops.push(curY);
    curY -= rh;
    if (curY > bottom + 1) {
      page.drawLine({ start: { x: left, y: curY }, end: { x: left + innerW, y: curY }, thickness: 0.9, color: rgb(0, 0, 0) });
    }
  }

  const label = (x, y, text) => page.drawText(text, { x, y, size: 6.5, font: fonts.sans, color: rgb(0.25, 0.25, 0.25) });
  const val = (x, y, text, size = 12) => page.drawText(String(text || '').slice(0, 44), { x, y, size, font: fonts.bold, color: rgb(0, 0, 0) });

  // Vertical splits
  const colMid = left + innerW * 0.56;
  page.drawLine({ start: { x: colMid, y: rowTops[0] }, end: { x: colMid, y: rowTops[0] - rowHeights[0] }, thickness: 0.9 });
  page.drawLine({ start: { x: colMid, y: rowTops[1] }, end: { x: colMid, y: rowTops[1] - rowHeights[1] }, thickness: 0.9 });
  const colSplit4 = left + innerW * 0.45;
  page.drawLine({ start: { x: colSplit4, y: rowTops[3] }, end: { x: colSplit4, y: rowTops[3] - rowHeights[3] }, thickness: 0.9 });
  page.drawLine({ start: { x: colSplit4, y: rowTops[4] }, end: { x: colSplit4, y: rowTops[4] - rowHeights[4] }, thickness: 0.9 });

  // Row 1: Receiver | Dock/Gate
  label(left + 4, rowTops[0] - 9, '1 RECEIVER (EMPFÄNGER)');
  val(left + 6, rowTops[0] - 24, data.receiver || 'AUTOMOTIVE PLANT 01', 11);
  val(left + 6, rowTops[0] - 38, data.receiverCity || 'STEYR / AUSTRIA', 9);
  label(colMid + 4, rowTops[0] - 9, '2 DOCK / GATE (ABLADESTELLE)');
  val(colMid + 8, rowTops[0] - 28, data.dock || 'GATE B-14', 15);

  // Row 2: Advice Note (N) + Code-39 | Supplier (V)
  label(left + 4, rowTops[1] - 9, '3 ADVICE NOTE NO. (N) / LIEFERSCHEIN');
  const advImg = await embedBarcodePng(pdfDoc, { code: 'Code39', data: `N${data.adviceNote || '12345678'}`, showhrt: 'false', height: 10 });
  const advD = advImg.scaleToFit(innerW * 0.5, 13 * MM);
  page.drawImage(advImg, { x: left + 6, y: rowTops[1] - 21 * MM, width: advD.width, height: advD.height });
  val(left + 6, rowTops[1] - 11, data.adviceNote || '12345678', 8);

  label(colMid + 4, rowTops[1] - 9, '4 SUPPLIER ID (V)');
  val(colMid + 8, rowTops[1] - 24, data.supplier || 'SUP-90412', 12);

  // Row 3: Part Number (P) + full-width Code-39
  label(left + 4, rowTops[2] - 9, '5 PART NUMBER (P) / SACHNUMMER');
  val(left + 8, rowTops[2] - 24, data.partNumber || '8E0-857-535-D', 15);
  const partImg = await embedBarcodePng(pdfDoc, { code: 'Code39', data: `P${data.partNumber || '8E0-857-535-D'}`, showhrt: 'false', height: 12 });
  const partD = partImg.scaleToFit(innerW - 20, 14 * MM);
  page.drawImage(partImg, { x: left + 10, y: rowTops[2] - 28 * MM, width: partD.width, height: partD.height });

  // Row 4: Quantity (Q) + Barcode | Description + Date
  label(left + 4, rowTops[3] - 9, '6 QUANTITY (Q)');
  val(left + 8, rowTops[3] - 22, data.quantity || '250', 14);
  const qtyImg = await embedBarcodePng(pdfDoc, { code: 'Code39', data: `Q${data.quantity || '250'}`, showhrt: 'false', height: 9 });
  const qtyD = qtyImg.scaleToFit(innerW * 0.4, 11 * MM);
  page.drawImage(qtyImg, { x: left + 6, y: rowTops[3] - 24 * MM, width: qtyD.width, height: qtyD.height });

  label(colSplit4 + 4, rowTops[3] - 9, '7 PART DESCRIPTION & DATE');
  val(colSplit4 + 8, rowTops[3] - 22, data.description || 'MIRROR HOUSING ASSEMBLY', 10);
  val(colSplit4 + 8, rowTops[3] - 38, `DATE: ${data.date || '2026-11-16'}`, 9);

  // Row 5: Package ID (S) + Code-39 | Batch (H) + PDF417 summary
  label(left + 4, rowTops[4] - 9, '8 PACKAGE ID (S)');
  const pkgImg = await embedBarcodePng(pdfDoc, { code: 'Code39', data: `S${data.packageId || '000987654'}`, showhrt: 'true', height: 10 });
  const pkgD = pkgImg.scaleToFit(innerW * 0.4, 14 * MM);
  page.drawImage(pkgImg, { x: left + 6, y: rowTops[4] - 24 * MM, width: pkgD.width, height: pkgD.height });

  label(colSplit4 + 4, rowTops[4] - 9, '9 BATCH (H) & 2D PDF417');
  val(colSplit4 + 8, rowTops[4] - 21, `BATCH: ${data.batch || 'B-2026-44'}`, 9);
  const vda2d = `[)>\x1E06\x1DP${data.partNumber || '8E0-857-535-D'}\x1DQ${data.quantity || '250'}\x1DV${data.supplier || 'SUP-90412'}\x1DS${data.packageId || '000987654'}\x1E\x04`;
  const pdfImg = await embedBarcodePng(pdfDoc, { code: 'PDF417', data: vda2d, pdfcolumns: 4 });
  const pdfD = pdfImg.scaleToFit(innerW * 0.48, 14 * MM);
  page.drawImage(pdfImg, { x: colSplit4 + 8, y: rowTops[4] - 24.5 * MM, width: pdfD.width, height: pdfD.height });
}

/** Render AIAG B-10 / GS1 4x6" Shipping Label (101.6x152.4mm). */
async function drawShippingOrAiagPage(pdfDoc, template, data, fonts) {
  const W = 101.6 * MM;
  const H = 152.4 * MM;
  const page = pdfDoc.addPage([W, H]);
  const m = 5 * MM;

  page.drawRectangle({ x: m, y: m, width: W - m * 2, height: H - m * 2, borderWidth: 1.1, borderColor: rgb(0, 0, 0) });

  // Top Header band
  page.drawRectangle({ x: m, y: H - m - 14 * MM, width: W - m * 2, height: 14 * MM, color: rgb(0.08, 0.11, 0.17) });
  page.drawText(template === 'aiag-b10' ? 'AIAG B-10 COMPLIANCE LABEL' : 'GS1 LOGISTICS SHIPPING LABEL', {
    x: m + 6, y: H - m - 9.5 * MM, size: 10.5, font: fonts.bold, color: rgb(1, 1, 1),
  });

  // Ship From / Ship To
  const ySec1 = H - m - 16 * MM;
  page.drawText('FROM:', { x: m + 6, y: ySec1 - 8, size: 7, font: fonts.bold });
  page.drawText(data.shipFrom || 'Global Parts Logistics, Steyr', { x: m + 6, y: ySec1 - 19, size: 8.5, font: fonts.sans });
  page.drawText('TO:', { x: m + 6, y: ySec1 - 36, size: 7, font: fonts.bold });
  page.drawText(data.shipTo || 'Apex Assembly Hub, Munich', { x: m + 6, y: ySec1 - 48, size: 10.5, font: fonts.bold });

  page.drawLine({ start: { x: m, y: ySec1 - 56 }, end: { x: W - m, y: ySec1 - 56 }, thickness: 0.8 });

  // Carrier / Part / Qty / Order
  const ySec2 = ySec1 - 60;
  page.drawText(`CARRIER: ${data.carrier || 'EXPRESS FREIGHT'}   |   REF: ${data.reference || 'ORD-88241'}`, {
    x: m + 6, y: ySec2 - 10, size: 8, font: fonts.bold,
  });
  page.drawText(`PART / SKU: ${data.partNumber || 'SKU-417-PRO'}   |   QTY: ${data.quantity || '48'}`, {
    x: m + 6, y: ySec2 - 23, size: 8.5, font: fonts.sans,
  });

  // Middle PDF417 Manifest Barcode
  const manifestData = `SHIP:${data.reference || 'ORD-88241'}|PART:${data.partNumber || 'SKU-417-PRO'}|QTY:${data.quantity || '48'}|SSCC:${data.sscc || '003456789012345678'}`;
  const pdfImg = await embedBarcodePng(pdfDoc, { code: 'PDF417', data: manifestData, pdfcolumns: 4 });
  const pdfD = pdfImg.scaleToFit(W - m * 2 - 16, 26 * MM);
  page.drawImage(pdfImg, { x: (W - pdfD.width) / 2, y: ySec2 - 30 - pdfD.height, width: pdfD.width, height: pdfD.height });

  // Bottom SSCC-18 GS1-128 Barcode
  const ssccDigits = String(data.sscc || '003456789012345678').replace(/\D/g, '').padEnd(18, '0').slice(0, 18);
  const ssccImg = await embedBarcodePng(pdfDoc, { code: 'GS1-128', data: `(00)${ssccDigits}`, showhrt: 'true', height: 22 });
  const ssccD = ssccImg.scaleToFit(W - m * 2 - 12, 34 * MM);
  page.drawLine({ start: { x: m, y: m + 42 * MM }, end: { x: W - m, y: m + 42 * MM }, thickness: 0.8 });
  page.drawText('SSCC-18 SERIAL SHIPPING CONTAINER CODE', { x: m + 6, y: m + 36 * MM, size: 7.5, font: fonts.bold });
  page.drawImage(ssccImg, { x: (W - ssccD.width) / 2, y: m + 5 * MM, width: ssccD.width, height: ssccD.height });
}

/** Render A4 / US Letter multi-page Grid Sticker Sheet from CSV or row list. */
async function drawGridSheetPages(pdfDoc, body, fonts) {
  const isLetter = String(body.paperSize || body.PageSize || '').toLowerCase() === 'letter';
  const pageW = isLetter ? 612 : 595.28;
  const pageH = isLetter ? 792 : 841.89;
  const cols = Math.max(1, Math.min(6, Number(body.cols) || 3));
  const rows = Math.max(1, Math.min(14, Number(body.rows) || 8));
  const margin = 10 * MM;
  const gap = 3 * MM;
  const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (pageH - margin * 2 - gap * (rows - 1)) / rows;

  let records = [];
  if (body.csvText && body.csvText.trim()) {
    const parsed = parseCsvRecords(body.csvText);
    if (parsed.rows.length > 0) {
      records = parsed.rows.map((r) => {
        const keys = Object.keys(r);
        const titleKey = keys.find((k) => /title|name|desc/i.test(k));
        const codeKey = keys.find((k) => /barcode|code|data|payload|val|sku/i.test(k));
        const title = titleKey ? r[titleKey] : (keys.length > 1 ? r[keys[0]] : '');
        const codeData = codeKey ? r[codeKey] : (keys.length > 1 ? r[keys[1]] : Object.values(r)[0] || '');
        return {
          title: r.title || r.Title || r.name || r.Name || title || '',
          codeData: r.data || r.Data || r.code || r.Code || codeData || Object.values(r)[0] || '',
        };
      });
    } else {
      records = parsed.headers.map((h) => ({ title: '', codeData: h }));
    }
  }
  if (records.length === 0) {
    records = [{ title: 'Sample Label', codeData: body.data || 'PDF417-LABEL-001' }];
  }

  const perPage = cols * rows;
  const symCode = body.symbology || 'PDF417';

  for (let idx = 0; idx < records.length; idx += 1) {
    const slot = idx % perPage;
    const page = slot === 0 ? pdfDoc.addPage([pageW, pageH]) : pdfDoc.getPage(pdfDoc.getPageCount() - 1);
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = margin + col * (cellW + gap);
    const y = pageH - margin - (row + 1) * cellH - row * gap;

    page.drawRectangle({
      x, y, width: cellW, height: cellH,
      borderWidth: 0.4, borderColor: rgb(0.78, 0.82, 0.86),
    });

    const rec = records[idx];
    const topSpace = rec.title ? 12 : 4;
    if (rec.title) {
      page.drawText(String(rec.title).slice(0, 32), {
        x: x + 5, y: y + cellH - 11, size: 7.5, font: fonts.bold, color: rgb(0.1, 0.14, 0.2),
      });
    }

    const img = await embedBarcodePng(pdfDoc, {
      code: symCode,
      data: String(rec.codeData || 'EMPTY'),
      showhrt: body.showhrt !== false ? 'true' : 'false',
    });
    const dims = img.scaleToFit(cellW - 10, cellH - topSpace - 8);
    page.drawImage(img, {
      x: x + (cellW - dims.width) / 2,
      y: y + (cellH - topSpace - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
}

/** Generate compliance or CSV batch label PDF according to template ('vda4902' | 'aiag-b10' | 'gs1-shipping' | 'csv-sheet'). */
export async function generateLabelPdf(body = {}) {
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    sans: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
    mono: await pdfDoc.embedFont(StandardFonts.Courier),
  };

  const template = String(body.template || 'vda4902').toLowerCase();
  const isCsvGrid = template === 'csv-sheet' || template === 'csv-grid' || template === 'csv' || template === 'grid' || template.includes('grid') || template.includes('csv');
  if (isCsvGrid) {
    await drawGridSheetPages(pdfDoc, body, fonts);
  } else {
    // Support batch rows via optional CSV when generating multiple VDA/AIAG/Shipping labels
    let records = [body.fields || body];
    if (body.csvText && body.csvText.trim()) {
      const parsed = parseCsvRecords(body.csvText);
      if (parsed.rows.length > 0) records = parsed.rows;
    }
    for (const rec of records) {
      if (template === 'vda4902') {
        await drawVda4902Page(pdfDoc, rec, fonts);
      } else {
        await drawShippingOrAiagPage(pdfDoc, template, rec, fonts);
      }
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
