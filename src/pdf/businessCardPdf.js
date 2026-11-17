import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { renderBarcode } from '../symbologies/renderer.js';
import { buildVCardPayload, buildMeCardPayload } from '../forms/tagging.js';

const MM_TO_PT = 72 / 25.4;
const CARD_W = 85 * MM_TO_PT;
const CARD_H = 54 * MM_TO_PT;

function decodeDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!match) return null;
  return {
    type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg',
    bytes: Buffer.from(match[2], 'base64'),
  };
}

function drawCropMarks(page, x, y, w, h) {
  const len = 8;
  const gap = 3;
  const color = rgb(0.45, 0.45, 0.45);
  const lines = [
    // Bottom-left
    [[x - gap - len, y], [x - gap, y]],
    [[x, y - gap - len], [x, y - gap]],
    // Bottom-right
    [[x + w + gap, y], [x + w + gap + len, y]],
    [[x + w, y - gap - len], [x + w, y - gap]],
    // Top-left
    [[x - gap - len, y + h], [x - gap, y + h]],
    [[x, y + h + gap], [x, y + h + gap + len]],
    // Top-right
    [[x + w + gap, y + h], [x + w + gap + len, y + h]],
    [[x + w, y + h + gap], [x + w, y + h + gap + len]],
  ];
  for (const [start, end] of lines) {
    page.drawLine({ start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, thickness: 0.5, color });
  }
}

function drawCardAt(page, x, y, { contact, barcodeImg, logoImg, template, fontSans, fontBold, fontMono }) {
  const isDarkBand = template === 'executive-band';
  const isAccentRail = template === 'accent-rail';
  const isCompact = template === 'compact-split';

  // Card background
  page.drawRectangle({
    x, y, width: CARD_W, height: CARD_H,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.86, 0.89, 0.92),
    borderWidth: 0.4,
  });

  if (isDarkBand) {
    page.drawRectangle({ x, y: y + CARD_H - 42, width: CARD_W, height: 42, color: rgb(0.06, 0.09, 0.16) });
  } else if (isAccentRail) {
    page.drawRectangle({ x, y, width: 6, height: CARD_H, color: rgb(0.05, 0.58, 0.53) });
  } else if (isCompact) {
    page.drawRectangle({ x: x + CARD_W - 76, y, width: 76, height: CARD_H, color: rgb(0.96, 0.97, 0.98) });
  }

  const leftPad = isAccentRail ? 16 : 12;
  const fullName = [contact.FirstName, contact.LastName].filter(Boolean).join(' ') || 'Alex Morgan';

  // Header name + title + company
  const nameY = isDarkBand ? y + CARD_H - 20 : y + CARD_H - 22;
  page.drawText(fullName, {
    x: x + leftPad,
    y: nameY,
    size: 11.5,
    font: fontBold,
    color: isDarkBand ? rgb(1, 1, 1) : rgb(0.06, 0.09, 0.16),
  });

  const subtitle = [contact.Position, contact.Company].filter(Boolean).join(' · ');
  if (subtitle) {
    page.drawText(subtitle.slice(0, 48), {
      x: x + leftPad,
      y: nameY - 12,
      size: 7.5,
      font: fontSans,
      color: isDarkBand ? rgb(0.76, 0.82, 0.9) : rgb(0.35, 0.42, 0.51),
    });
  }

  // Optional Logo top-right
  if (logoImg) {
    const dims = logoImg.scaleToFit(46, 22);
    page.drawImage(logoImg, {
      x: x + CARD_W - dims.width - 10,
      y: y + CARD_H - dims.height - 9,
      width: dims.width,
      height: dims.height,
    });
  }

  // Contact lines
  const addrLine = [contact.Address, [contact.City, contact.State, contact.ZIP].filter(Boolean).join(' '), contact.Country]
    .filter(Boolean)
    .join(', ');
  const infoLines = [
    contact.Phone ? `Tel:  ${contact.Phone}` : '',
    contact.Cell ? `Mob:  ${contact.Cell}` : '',
    contact.Fax ? `Fax:  ${contact.Fax}` : '',
    contact.Email ? `Mail: ${contact.Email}` : '',
    contact.Url ? `Web:  ${contact.Url}` : '',
    addrLine ? `Addr: ${addrLine}` : '',
  ].filter(Boolean);

  let curY = isDarkBand ? y + CARD_H - 56 : y + CARD_H - 50;
  for (const line of infoLines.slice(0, 6)) {
    page.drawText(line.slice(0, 44), {
      x: x + leftPad,
      y: curY,
      size: 6.7,
      font: fontMono,
      color: rgb(0.2, 0.25, 0.33),
    });
    curY -= 11;
  }

  // 2D Barcode placed bottom-right (sized cleanly inside 85x54mm)
  const maxCodeW = contact.Symbology === 'PDF417' ? 84 : 58;
  const maxCodeH = contact.Symbology === 'PDF417' ? 38 : 58;
  const codeDims = barcodeImg.scaleToFit(maxCodeW, maxCodeH);
  page.drawImage(barcodeImg, {
    x: x + CARD_W - codeDims.width - 10,
    y: y + 10,
    width: codeDims.width,
    height: codeDims.height,
  });
}

/**
 * Create a vector PDF (single 85x54mm card or 10-up A4/Letter sheet with crop marks).
 * Returns Buffer of PDF bytes.
 */
export async function generateBusinessCardPdf(body = {}) {
  const contact = body.contact || body;
  const format = contact.Format === 'MeCard' ? 'MeCard' : 'vCard';
  const payload = format === 'MeCard'
    ? buildMeCardPayload({
      Name: `${contact.FirstName || ''} ${contact.LastName || ''}`.trim(),
      PhoneNumber: contact.Phone || contact.Cell || '',
      Email: contact.Email || '',
      Memo: contact.Company || '',
      Url: contact.Url || '',
      Address: [contact.Address, contact.City, contact.State, contact.ZIP, contact.Country].filter(Boolean).join(', '),
    })
    : buildVCardPayload({
      FirstName: contact.FirstName || '',
      LastName: contact.LastName || '',
      Organization: contact.Company || '',
      Title: contact.Position || '',
      PhoneNumber: contact.Cell || '',
      PhoneNumberWork: contact.Phone || '',
      Email: contact.Email || '',
      Url: contact.Url || '',
      Address: [contact.Address, contact.City, contact.State, contact.ZIP, contact.Country].filter(Boolean).join(', '),
    });

  const codeType = ['QRCode', 'DataMatrix', 'PDF417'].includes(contact.Symbology)
    ? contact.Symbology
    : 'QRCode';

  const rendered = await renderBarcode({
    code: codeType,
    data: payload,
    imagetype: 'Png',
    dpi: 300,
    eclevel: 'M',
    color: '#0f172a',
    bgcolor: '#ffffff',
  });

  const pdfDoc = await PDFDocument.create();
  const fontSans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const barcodeImg = await pdfDoc.embedPng(rendered.buffer);

  let logoImg = null;
  const logoDecoded = decodeDataUrl(contact.LogoDataUrl);
  if (logoDecoded) {
    logoImg = logoDecoded.type === 'png'
      ? await pdfDoc.embedPng(logoDecoded.bytes)
      : await pdfDoc.embedJpg(logoDecoded.bytes);
  }

  const template = contact.Template || contact.template || body.Template || body.template || 'classic-minimal';
  const layout = String(contact.Layout || contact.layout || body.Layout || body.layout || 'single').toLowerCase();
  const pageSize = String(contact.PageSize || contact.pageSize || body.PageSize || body.pageSize || '').toLowerCase();

  if (layout === 'single') {
    const page = pdfDoc.addPage([CARD_W, CARD_H]);
    drawCardAt(page, 0, 0, { contact, barcodeImg, logoImg, template, fontSans, fontBold, fontMono });
  } else {
    const isLetter = layout === 'letter-10up' || pageSize === 'letter';
    const pageW = isLetter ? 612 : 595.28;
    const pageH = isLetter ? 792 : 841.89;
    const page = pdfDoc.addPage([pageW, pageH]);
    const gapX = 14;
    const gapY = 10;
    const totalW = CARD_W * 2 + gapX;
    const totalH = CARD_H * 5 + gapY * 4;
    const startX = (pageW - totalW) / 2;
    const startY = (pageH - totalH) / 2;

    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const cx = startX + col * (CARD_W + gapX);
        const cy = startY + (4 - row) * (CARD_H + gapY);
        drawCardAt(page, cx, cy, { contact, barcodeImg, logoImg, template, fontSans, fontBold, fontMono });
        drawCropMarks(page, cx, cy, CARD_W, CARD_H);
      }
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
