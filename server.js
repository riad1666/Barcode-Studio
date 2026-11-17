import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  getSymbology,
  listSymbologies,
  CATEGORIES,
  QUICK_JUMP_IDS,
  CODE_PAGES,
  FONT_OPTIONS,
  DM_SIZES,
} from './src/symbologies/catalog.js';
import { renderBarcode, normalizeParams } from './src/symbologies/renderer.js';
import { generateSequence } from './src/symbologies/formatters.js';
import { renderBatchZip } from './src/utils/batch.js';
import { generateBusinessCardPdf } from './src/pdf/businessCardPdf.js';
import { generateLabelPdf } from './src/pdf/labelPdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsers
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.text({ limit: '10mb' }));

// Static files
app.use(express.static(publicDir));

// CORS and Preflight
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization, X-Mime-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Mime-Type, Content-Disposition, Content-Length');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * TEC-IT /barcode.ashx Compatibility Handler
 * Accepts parameters via req.query (GET) or req.body (POST)
 */
async function handleBarcodeAshx(req, res) {
  const rawParams = {
    ...req.query,
    ...(req.body && typeof req.body === 'object' ? req.body : {}),
  };

  if (typeof req.body === 'string' && req.body && !rawParams.data) {
    rawParams.data = req.body;
  }

  const params = normalizeParams(rawParams);

  const isBatch =
    params.multiplebarcodes === true ||
    ['true', '1', 'yes', 'on'].includes(String(params.multiplebarcodes).toLowerCase());
  const isBase64 =
    params.base64 === true ||
    ['true', '1', 'yes', 'on'].includes(String(params.base64).toLowerCase());

  // Unlimited batch ZIP download
  if (isBatch) {
    try {
      const { buffer } = await renderBatchZip(rawParams);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="barcodes.zip"');
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).send(buffer);
    } catch (err) {
      const onError = String(params.onerror || 'OnErrorDisplay');
      if (onError === 'OnError204') {
        return res.status(204).end();
      }
      if (onError === 'OnError500') {
        return res.status(500).type('text/plain; charset=utf-8').send(err.message);
      }
      return res.status(400).type('text/plain; charset=utf-8').send(`Batch error: ${err.message}`);
    }
  }

  try {
    const result = await renderBarcode(rawParams);

    // OnError204
    if (result.status === 204) {
      return res.status(204).end();
    }

    // OnError500
    if (result.status === 500) {
      return res
        .status(500)
        .type('text/plain; charset=utf-8')
        .send(result.errorMessage || 'Barcode generation failed');
    }

    // Base64 Preview mode
    if (isBase64) {
      const b64 = result.buffer.toString('base64');
      res.setHeader('X-Mime-Type', result.mimeType);
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).json({
        mime: result.mimeType,
        base64: b64,
      });
    }

    // Single image binary output
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="barcode.${result.ext}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(result.buffer);
  } catch (err) {
    const onError = String(params.onerror || 'OnErrorDisplay');
    if (onError === 'OnError204') {
      return res.status(204).end();
    }
    if (onError === 'OnError500') {
      return res.status(500).type('text/plain; charset=utf-8').send(err.message);
    }
    if (onError === 'OnErrorIgnore') {
      return res
        .status(200)
        .type('image/svg+xml')
        .send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="1" height="1"></svg>');
    }
    // Default OnErrorDisplay
    const errSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 88" width="380" height="88">
  <rect x="1" y="1" width="378" height="86" rx="6" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
  <text x="16" y="28" font-family="sans-serif" font-size="13" font-weight="700" fill="#b91c1c">Barcode Generation Error</text>
  <text x="16" y="52" font-family="monospace" font-size="11" fill="#7f1d1d">${escapeXml(err.message)}</text>
</svg>`;
    return res.status(200).type('image/svg+xml').send(errSvg);
  }
}

app.get('/barcode.ashx', handleBarcodeAshx);
app.post('/barcode.ashx', handleBarcodeAshx);

// Catalog Endpoints
app.get('/api/catalog', (req, res) => {
  res.json({
    quickJump: QUICK_JUMP_IDS,
    quickJumps: QUICK_JUMP_IDS,
    codePages: CODE_PAGES,
    fonts: FONT_OPTIONS,
    fontOptions: FONT_OPTIONS,
    dmSizes: DM_SIZES,
    dataMatrixSizes: DM_SIZES,
    categories: CATEGORIES,
  });
});

app.get('/api/symbologies', (req, res) => {
  res.json(listSymbologies());
});

app.get('/api/symbologies/:id', (req, res) => {
  const sym = getSymbology(req.params.id);
  if (!sym) {
    return res.status(404).json({ error: 'Symbology not found' });
  }
  res.json(sym);
});

// Sequence Generation Endpoint
app.post('/api/sequence', (req, res) => {
  try {
    const body = req.body || {};
    const rows = generateSequence({
      prefix: body.prefix ?? '',
      suffix: body.suffix ?? '',
      start: body.start ?? 1,
      end: body.end ?? 25,
      increment: body.increment ?? body.step ?? 1,
      mask: body.mask ?? '$$$$',
      maxCount: body.maxCount ?? 2000,
    });
    res.json({ count: rows.length, rows, items: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Dedicated Batch ZIP Endpoint
async function handleBatchZip(req, res) {
  try {
    const rawParams = {
      ...req.query,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    };
    const { buffer, count } = await renderBatchZip(rawParams);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="barcodes.zip"');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Barcode-Count', String(count));
    res.status(200).send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
app.post('/api/batch', handleBatchZip);
app.get('/api/batch', handleBatchZip);

// PDF Generation Endpoints
async function handleBusinessCardPdf(req, res) {
  try {
    const body = {
      ...req.query,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    };
    const pdfBuf = await generateBusinessCardPdf(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="business-cards.pdf"');
    res.status(200).send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.post('/api/pdf/business-card', handleBusinessCardPdf);
app.get('/api/pdf/business-card', handleBusinessCardPdf);

async function handleLabelPdf(req, res) {
  try {
    const body = {
      ...req.query,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    };
    const pdfBuf = await generateLabelPdf(body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="labels.pdf"');
    res.status(200).send(pdfBuf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.post('/api/pdf/label', handleLabelPdf);
app.get('/api/pdf/label', handleLabelPdf);

// Health Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Bookmarkable SPA Routes
const serveSpa = (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(200).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Barcode, QR Code, and PDF417 Studio Suite</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1e293b;
      padding: 2.5rem;
      border-radius: 12px;
      border: 1px solid #334155;
      max-width: 520px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    h1 { margin-top: 0; font-size: 1.5rem; font-weight: 600; color: #38bdf8; }
    p { color: #94a3b8; line-height: 1.6; }
    code { background: #0f172a; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: monospace; color: #a5f3fc; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 9999px; background: #064e3b; color: #6ee7b7; font-size: 0.875rem; font-weight: 500; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Barcode, QR Code, &amp; PDF417 Studio</h1>
    <p>TEC-IT Parity Engine and Express Backend active.</p>
    <p>Try <code>/barcode.ashx?code=PDF417&amp;data=Hello</code> or <code>/api/catalog</code></p>
    <div class="status">
      <span class="dot"></span>
      Backend Engine Online &bull; Parity 100%
    </div>
  </div>
</body>
</html>`);
};

app.get('/', serveSpa);
app.get('/en', serveSpa);
app.get('/en/:code', serveSpa);
app.get('/:code', (req, res, next) => {
  const code = req.params.code;
  if (
    code.includes('.') ||
    code.startsWith('api') ||
    code === 'barcode.ashx' ||
    code === 'health'
  ) {
    return next();
  }
  serveSpa(req, res);
});

// Start listening if run directly or not suppressed
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  process.argv[1].endsWith('server.js')
);

let server = null;
if (isMain || process.env.AUTO_START === '1') {
  server = app.listen(PORT, () => {
    console.log(`Barcode Studio Suite running on http://localhost:${PORT}`);
  });
}

export function startServer(port = PORT) {
  if (!server) {
    server = app.listen(port, () => {
      console.log(`Barcode Studio Suite running on http://localhost:${port}`);
    });
  }
  return server;
}

export { app, server };
export default app;
