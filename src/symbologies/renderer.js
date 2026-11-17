import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bwipjs from 'bwip-js';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import gifencPkg from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifencPkg.GIFEncoder ? gifencPkg : (gifencPkg.default || gifencPkg);
import { DM_SIZES, getSymbology } from './catalog.js';
import { encodeWithCodePage } from './formatters.js';
import { prepareSymbologyPayload } from './wrappers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

const WINDOWS_FONT_FILES = {
  'Arial': { regular: 'arial.ttf', bold: 'arialbd.ttf', italic: 'ariali.ttf' },
  'Calibri': { regular: 'calibri.ttf', bold: 'calibrib.ttf', italic: 'calibrii.ttf' },
  'Comic Sans MS': { regular: 'comic.ttf', bold: 'comicbd.ttf', italic: 'comici.ttf' },
  'Consolas': { regular: 'consola.ttf', bold: 'consolab.ttf', italic: 'consolai.ttf' },
  'Courier New': { regular: 'cour.ttf', bold: 'courbd.ttf', italic: 'couri.ttf' },
  'Georgia': { regular: 'georgia.ttf', bold: 'georgiab.ttf', italic: 'georgiai.ttf' },
  'Impact': { regular: 'impact.ttf', bold: 'impact.ttf', italic: 'impact.ttf' },
  'Lucida Console': { regular: 'lucon.ttf', bold: 'lucon.ttf', italic: 'lucon.ttf' },
  'Lucida Sans Unicode': { regular: 'l_10646.ttf', bold: 'l_10646.ttf', italic: 'l_10646.ttf' },
  'Segoe UI': { regular: 'segoeui.ttf', bold: 'segoeuib.ttf', italic: 'segoeuii.ttf' },
  'Tahoma': { regular: 'tahoma.ttf', bold: 'tahomabd.ttf', italic: 'tahoma.ttf' },
  'Times New Roman': { regular: 'times.ttf', bold: 'timesbd.ttf', italic: 'timesi.ttf' },
  'Verdana': { regular: 'verdana.ttf', bold: 'verdanab.ttf', italic: 'verdanai.ttf' },
};

const REGISTERED_FONTS = new Set();
let fontsInitialized = false;

/** Load bundled OCR-B/Inconsolata fonts plus available Windows system TTFs into bwip-js. */
export function initFonts() {
  if (fontsInitialized) return;
  fontsInitialized = true;

  const tryRegister = (key, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        bwipjs.loadFont(key, fs.readFileSync(filePath));
        REGISTERED_FONTS.add(key);
      }
    } catch {
      // Non-fatal: fallback to bwip-js built-in OCR-B
    }
  };

  tryRegister('OCRB_REGULAR', path.join(ROOT_DIR, 'node_modules/bwip-js/fonts/OCRB7.ttf'));
  tryRegister('INCONSOLATA_REGULAR', path.join(ROOT_DIR, 'node_modules/bwip-js/fonts/Inconsolata.otf'));

  const winFontsDir = process.env.WINDIR ? path.join(process.env.WINDIR, 'Fonts') : 'C:\\Windows\\Fonts';
  for (const [name, files] of Object.entries(WINDOWS_FONT_FILES)) {
    const baseKey = name.toUpperCase().replace(/[^A-Z0-9]+/g, '');
    for (const [style, file] of Object.entries(files)) {
      const fullKey = `${baseKey}_${style.toUpperCase()}`;
      tryRegister(fullKey, path.join(winFontsDir, file));
    }
  }
}

function resolveFontKey(fontName = 'Arial', fontStyle = 'regular') {
  initFonts();
  const baseKey = String(fontName || 'Arial').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const style = String(fontStyle || 'regular').toUpperCase();
  const exact = `${baseKey}_${style}`;
  if (REGISTERED_FONTS.has(exact)) return exact;
  const reg = `${baseKey}_REGULAR`;
  if (REGISTERED_FONTS.has(reg)) return reg;
  if (REGISTERED_FONTS.has('OCRB_REGULAR')) return 'OCRB_REGULAR';
  return undefined;
}

function sanitizeHexColor(hex, fallback = '000000') {
  const clean = String(hex || '').replace(/^#/, '').trim();
  return /^[0-9a-fA-F]{6}$/.test(clean) ? clean.toLowerCase() : fallback;
}

function hexToRgb(hex) {
  const clean = sanitizeHexColor(hex, 'ffffff');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function mapRotation(rot = 'Degree0') {
  const s = String(rot || 'Degree0').toLowerCase();
  if (s === 'degree90' || s === '90' || s === 'r') return 'R';
  if (s === 'degree180' || s === '180' || s === 'i') return 'I';
  if (s === 'degree270' || s === '270' || s === 'l') return 'L';
  return 'N';
}

function computeScaleAndQuiet(params) {
  const dpi = Math.max(72, Math.min(600, Number(params.dpi) || 96));
  const unit = String(params.unit || 'Fit').toLowerCase();
  const mw = Number(params.modulewidth ?? params.mw ?? params.width);

  let scale = Math.max(1, Math.round((dpi / 96) * 2));
  if (unit === 'min' || unit === 'minimal') {
    scale = 1;
  } else if (Number.isFinite(mw) && mw > 0) {
    if (unit === 'px') {
      scale = Math.max(1, Math.min(20, Math.round(mw)));
    } else if (unit === 'mm') {
      scale = Math.max(1, Math.min(20, Math.round((mw / 25.4) * dpi)));
    } else if (unit === 'mils') {
      scale = Math.max(1, Math.min(20, Math.round((mw / 1000) * dpi)));
    }
  }

  const quietVal = Math.max(0, Number(params.quiet) || 0);
  const qUnit = String(params.qunit || 'Mm').toLowerCase();
  let paddingPts = 0;
  if (quietVal > 0) {
    if (qUnit === 'px') {
      paddingPts = Math.max(0, Math.round(quietVal / scale));
    } else if (qUnit === 'mil' || qUnit === 'mils') {
      paddingPts = Math.max(0, Math.round((quietVal / 1000) * 72));
    } else {
      paddingPts = Math.max(0, Math.round((quietVal / 25.4) * 72));
    }
  }

  return { dpi, scale, paddingPts: Math.min(120, paddingPts) };
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalize flat query/body parameter keys to lowercase canonical settings. */
export function normalizeParams(input = {}) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    const cleanKey = k.replace(/^Settings\./i, '').toLowerCase();
    out[cleanKey] = Array.isArray(v) ? v[v.length - 1] : v;
  }
  return out;
}

function pngToJpg(pngBuffer, bgHex = 'ffffff') {
  const decoded = PNG.sync.read(pngBuffer);
  const [bgR, bgG, bgB] = hexToRgb(bgHex);
  const rgba = decoded.data;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    if (a < 1) {
      rgba[i] = Math.round(rgba[i] * a + bgR * (1 - a));
      rgba[i + 1] = Math.round(rgba[i + 1] * a + bgG * (1 - a));
      rgba[i + 2] = Math.round(rgba[i + 2] * a + bgB * (1 - a));
      rgba[i + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data: rgba, width: decoded.width, height: decoded.height }, 92);
  return { buffer: Buffer.from(encoded.data), width: decoded.width, height: decoded.height };
}

function pngToGif(pngBuffer, bgHex = 'ffffff') {
  const decoded = PNG.sync.read(pngBuffer);
  const [bgR, bgG, bgB] = hexToRgb(bgHex);
  const rgba = decoded.data;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    if (a < 1) {
      rgba[i] = Math.round(rgba[i] * a + bgR * (1 - a));
      rgba[i + 1] = Math.round(rgba[i + 1] * a + bgG * (1 - a));
      rgba[i + 2] = Math.round(rgba[i + 2] * a + bgB * (1 - a));
      rgba[i + 3] = 255;
    }
  }
  const palette = quantize(rgba, 64);
  const index = applyPalette(rgba, palette);
  const gif = GIFEncoder();
  gif.writeFrame(index, decoded.width, decoded.height, { palette });
  gif.finish();
  return { buffer: Buffer.from(gif.bytes()), width: decoded.width, height: decoded.height };
}

function makeBlankPng(width = 160, height = 60, bgHex = 'ffffff') {
  const png = new PNG({ width, height });
  const [r, g, b] = hexToRgb(bgHex);
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Build an SVG image displaying an encoding error message cleanly (for OnErrorDisplay). */
function buildErrorSvg(message) {
  const safe = escapeXml(message || 'Barcode encoding error');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 88" width="380" height="88">
  <rect x="1" y="1" width="378" height="86" rx="6" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
  <text x="16" y="28" font-family="sans-serif" font-size="13" font-weight="700" fill="#b91c1c">Barcode Generation Error</text>
  <text x="16" y="52" font-family="monospace" font-size="11" fill="#7f1d1d">${safe.slice(0, 62)}</text>
  <text x="16" y="70" font-family="monospace" font-size="11" fill="#7f1d1d">${safe.slice(62, 124)}</text>
</svg>`;
}

/** Convert an SVG into the target image format (used for fallback blank/error images). */
async function convertOutputFormat(pngBuffer, svgString, format, bgHex) {
  const fmt = String(format || 'Png').toLowerCase();
  if (fmt === 'svg') {
    const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svgString);
    return {
      buffer: Buffer.from(svgString, 'utf8'),
      mimeType: 'image/svg+xml',
      ext: 'svg',
      width: m ? Math.round(Number(m[1])) : 200,
      height: m ? Math.round(Number(m[2])) : 100,
    };
  }
  if (fmt === 'jpg' || fmt === 'jpeg') {
    const out = pngToJpg(pngBuffer, bgHex);
    return { ...out, mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (fmt === 'gif') {
    const out = pngToGif(pngBuffer, bgHex);
    return { ...out, mimeType: 'image/gif', ext: 'gif' };
  }
  const decoded = PNG.sync.read(pngBuffer);
  return {
    buffer: pngBuffer,
    mimeType: 'image/png',
    ext: 'png',
    width: decoded.width,
    height: decoded.height,
  };
}

/**
 * Render a single barcode image (or handle OnError behavior).
 * Returns { status, buffer, mimeType, ext, width, height, dpi, errorMessage }.
 */
export async function renderBarcode(rawInput = {}) {
  initFonts();
  const params = normalizeParams(rawInput);
  const sym = getSymbology(params.code || params.datatype || 'PDF417');
  let rawData = params.data !== undefined && params.data !== '' ? String(params.data) : sym.defaultData;
  if (!rawData && sym.formType) {
    if (sym.formType === 'epc') {
      rawData = 'BCD\n002\n1\nSCT\nBHBLDEHHXXX\nMartian Pioneers\nDE71110220330123456789\n\n\nClient:Marie Louise La Lune\nEmergency aid donation';
    } else if (sym.formType === 'zatca') {
      rawData = 'AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDYuMjUFBjEzMS4yNQ==';
    } else if (sym.formType === 'swiss') {
      const isQrr = sym.swissRefType === 'QRR';
      const isScor = sym.swissRefType === 'SCOR';
      const iban = isQrr ? 'CH4431999123000889012' : 'CH3908704016075473007';
      const ref = isQrr ? '210000000003139471430009017' : isScor ? 'RF18539007547034' : '';
      const refType = sym.swissRefType || 'NON';
      rawData = `SPC\r\n0200\r\n1\r\n${iban}\r\nS\r\nRobert Schneider AG\r\nRue du Lac\r\n1268\r\n2501\r\nBiel\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n199.95\r\nCHF\r\nS\r\nPia-Maria Rutschmann-Schnyder\r\nGrosse Marktgasse\r\n28\r\n9400\r\nRorschach\r\nCH\r\n${refType}\r\n${ref}\r\nOrder 10.05.2022\r\nEPD`;
    } else if (sym.formType === 'vcard') {
      rawData = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;;;\r\nFN:Jane Doe\r\nORG:Acme Corp\r\nTITLE:Architect\r\nTEL;TYPE=CELL:+1234567890\r\nEMAIL:jane.doe@example.com\r\nEND:VCARD';
    } else if (sym.formType === 'mecard') {
      rawData = 'MECARD:N:Doe,Jane;TEL:1234567890;EMAIL:jane@example.com;;';
    } else if (sym.formType === 'event') {
      rawData = 'BEGIN:VEVENT\r\nSUMMARY:Project Review\r\nDTSTART:20261116T120000Z\r\nDTEND:20261116T130000Z\r\nEND:VEVENT';
    } else if (sym.formType === 'wifi') {
      rawData = 'WIFI:T:WPA;S:StudioNetwork;P:SuperSecret;;';
    }
  }
  const format = String(params.imagetype || params.format || 'Png').toLowerCase();
  const onError = String(params.onerror || 'OnErrorDisplay');

  const translateEsc = params['translate-esc'] === undefined
    ? sym.escapeDefault
    : ['true', 'on', '1', 'yes'].includes(String(params['translate-esc']).toLowerCase());

  const barColor = sanitizeHexColor(params.color, '000000');
  const bgColor = params.transparent === true || params.transparent === 'true'
    ? null
    : sanitizeHexColor(params.bgcolor, 'ffffff');
  const textColor = sanitizeHexColor(params.textcolor, barColor);
  const { dpi, scale, paddingPts } = computeScaleAndQuiet(params);

  try {
    if (!rawData || rawData.length === 0) {
      throw new Error('Barcode data cannot be empty.');
    }

    const prepared = prepareSymbologyPayload(sym, rawData, { translateEsc });
    let { bcid, text, extraOpts } = prepared;

    // Transcode non-ASCII text using requested Code Page unless already parsed GS1/BWIPP
    const codePage = params.codepage || sym.codePageDefault || 'Default';
    let binarytext = false;
    if (sym.settingsGroup !== 'swiss' && codePage !== 'Default') {
      const encoded = encodeWithCodePage(text, codePage);
      text = encoded.text;
      binarytext = encoded.binarytext;
    }

    const bwipOpts = {
      bcid,
      text,
      scale,
      rotate: mapRotation(params.rotation),
      barcolor: barColor,
      textcolor: textColor,
      padding: paddingPts,
      ...extraOpts,
    };

    if (binarytext) {
      bwipOpts.binarytext = true;
    }
    if (bgColor) {
      bwipOpts.backgroundcolor = bgColor;
    }

    // Human Readable Text (HRT) applies to 1D / postal / retail / ISBN / HIBC-1D symbols
    const showHrtParam = params.showhrt === undefined
      ? sym.showHrtDefault
      : !['false', 'no', '0'].includes(String(params.showhrt).toLowerCase());

    if (showHrtParam && sym.showHrtDefault) {
      bwipOpts.includetext = true;
      bwipOpts.textxalign = 'center';
      const fontKey = resolveFontKey(params.fontname, params.fontstyle);
      if (fontKey) bwipOpts.textfont = fontKey;
      const fontSize = Number(params.fontsize);
      if (Number.isFinite(fontSize) && fontSize >= 4 && fontSize <= 72) {
        bwipOpts.textsize = Math.round(fontSize * 0.72);
      }
    }

    // Standard linear height when not explicitly overridden
    if (!['qrcode', 'datamatrix', 'aztec', 'maxicode', 'hanxin', 'dotcode', 'pdf417', 'micropdf417', 'swiss', 'epc', 'bankingQr'].includes(sym.settingsGroup)) {
      if (sym.categoryId !== '2d' && sym.categoryId !== 'gs1-2d' && sym.categoryId !== 'banking') {
        bwipOpts.height = Math.max(8, Number(params.height ?? params.moduleheight) || 18);
      }
    }

    // QR Error Correction Level
    if (sym.settingsGroup === 'swiss' || sym.settingsGroup === 'epc') {
      bwipOpts.eclevel = 'M';
      if (sym.settingsGroup === 'swiss') {
        bwipOpts.width = 46;
        bwipOpts.height = 46;
      }
    } else if (sym.settingsGroup === 'qrcode' || sym.settingsGroup === 'bankingQr') {
      const ec = String(params.eclevel || 'M').toUpperCase();
      if (['L', 'M', 'Q', 'H'].includes(ec)) {
        bwipOpts.eclevel = ec;
      }
    }

    // Data Matrix Symbol Size
    if (sym.settingsGroup === 'datamatrix' && params.dmsize && params.dmsize !== 'Default') {
      const dmSpec = DM_SIZES.find((d) => d.value === params.dmsize);
      if (dmSpec) {
        bwipOpts.bcid = dmSpec.bcid;
        if (dmSpec.rows) bwipOpts.rows = dmSpec.rows;
        if (dmSpec.columns) bwipOpts.columns = dmSpec.columns;
      }
    }

    // PDF417 & MicroPDF417 Advanced Controls
    if (sym.settingsGroup === 'pdf417') {
      if (bwipOpts.bcid === 'pdf417' && String(params.pdfvariant || '').toLowerCase() === 'compact') {
        bwipOpts.bcid = 'pdf417compact';
      }
      const cols = Number(params.pdfcolumns);
      if (Number.isFinite(cols) && cols >= 1 && cols <= 30) bwipOpts.columns = Math.round(cols);
      const rows = Number(params.pdfrows);
      if (Number.isFinite(rows) && rows >= 3 && rows <= 90) bwipOpts.rows = Math.round(rows);
      const ec = Number(params.pdfeclevel);
      if (params.pdfeclevel !== '' && params.pdfeclevel !== undefined && Number.isFinite(ec) && ec >= 0 && ec <= 8) {
        bwipOpts.eclevel = Math.round(ec);
      }
      const rowMult = Number(params.pdfrowmult);
      if (Number.isFinite(rowMult) && rowMult >= 1 && rowMult <= 6) bwipOpts.rowmult = Math.round(rowMult);
    }

    if (format === 'svg') {
      const svg = bwipjs.toSVG(bwipOpts);
      const out = await convertOutputFormat(null, svg, 'svg', bgColor || 'ffffff');
      return { status: 200, dpi, errorMessage: null, ...out };
    }

    const pngBuf = await bwipjs.toBuffer(bwipOpts);
    const out = await convertOutputFormat(pngBuf, null, format, bgColor || 'ffffff');
    return { status: 200, dpi, errorMessage: null, ...out };
  } catch (err) {
    const msg = err?.message || String(err);
    if (onError === 'OnError204') {
      return { status: 204, buffer: Buffer.alloc(0), mimeType: 'text/plain', ext: 'txt', width: 0, height: 0, dpi, errorMessage: msg };
    }
    if (onError === 'OnError500') {
      return { status: 500, buffer: Buffer.from(msg, 'utf8'), mimeType: 'text/plain', ext: 'txt', width: 0, height: 0, dpi, errorMessage: msg };
    }
    if (onError === 'OnErrorIgnore') {
      const blankSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1"></svg>';
      const blankPng = makeBlankPng(4, 4, bgColor || 'ffffff');
      const out = await convertOutputFormat(blankPng, blankSvg, format, bgColor || 'ffffff');
      return { status: 200, dpi, errorMessage: msg, ...out };
    }
    // Default OnErrorDisplay
    const errSvg = buildErrorSvg(msg);
    const fallbackPng = makeBlankPng(360, 80, 'fef2f2');
    const out = await convertOutputFormat(fallbackPng, errSvg, format, 'fef2f2');
    return { status: 200, dpi, errorMessage: msg, ...out };
  }
}
