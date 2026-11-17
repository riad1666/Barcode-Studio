import JSZip from 'jszip';
import { renderBarcode } from '../symbologies/renderer.js';

/** Split multiline text into non-empty barcode rows. */
export function splitBarcodeRows(rawText) {
  return String(rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0);
}

/** Parse RFC-4180-style CSV text into { headers, rows }. */
export function parseCsvRecords(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === ',' || ch === ';') && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? '';
    });
    return obj;
  });
  return { headers, rows };
}

function safeFilenamePart(str) {
  return String(str || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36) || 'barcode';
}

/** Render an array of rows (no artificial 10-barcode limit) into a ZIP archive Buffer. */
export async function renderBatchZip(rawParams = {}) {
  const rows = splitBarcodeRows(rawParams.data);
  if (rows.length === 0) {
    throw new Error('No barcode rows found for batch export.');
  }

  const zip = new JSZip();
  const errors = [];
  const padWidth = Math.max(3, String(rows.length).length);

  for (let i = 0; i < rows.length; i += 1) {
    const rowText = rows[i];
    const res = await renderBarcode({ ...rawParams, data: rowText, onerror: 'OnErrorDisplay' });
    const num = String(i + 1).padStart(padWidth, '0');
    const slug = safeFilenamePart(rowText);
    const fileName = `${num}_${slug}.${res.ext}`;
    zip.file(fileName, res.buffer);
    if (res.errorMessage) {
      errors.push({ row: i + 1, data: rowText, error: res.errorMessage });
    }
  }

  if (errors.length > 0) {
    const report = errors.map((e) => `Row ${e.row} ("${e.data}"): ${e.error}`).join('\n');
    zip.file('_errors.txt', report);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, count: rows.length, errors };
}
