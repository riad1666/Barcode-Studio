/**
 * Isolated Optical Barcode Inspection Stage Component
 * Provides clean scannability surface, dimensional metrics, zoom/pan, image copy, and embed snippet.
 */

import { renderBarcodeBase64, renderBarcodeBlob, buildBarcodeUrl, triggerBlobDownload } from '../api.js';
import { showToast } from '../ui/notifications.js';
import { state } from '../state.js';

let currentZoom = 1.0;
let currentBlob = null;
let currentBase64 = null;
let currentDimensions = { width: 0, height: 0 };

export function initOpticalStage() {
  const stage = document.getElementById('barcodeStage');
  const target = document.getElementById('barcodeRenderTarget');
  if (!stage || !target) return;

  // Zoom controls
  const zoomInBtn = document.getElementById('stageZoomInBtn');
  const zoomOutBtn = document.getElementById('stageZoomOutBtn');
  const zoomResetBtn = document.getElementById('stageZoomResetBtn');
  const gridToggleBtn = document.getElementById('stageGridToggleBtn');

  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      currentZoom = Math.min(currentZoom + 0.2, 3.0);
      applyZoom(target);
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      currentZoom = Math.max(currentZoom - 0.2, 0.4);
      applyZoom(target);
    });
  }

  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', () => {
      currentZoom = 1.0;
      applyZoom(target);
    });
  }

  if (gridToggleBtn) {
    gridToggleBtn.addEventListener('click', () => {
      stage.classList.toggle('has-grid');
      gridToggleBtn.classList.toggle('active', stage.classList.contains('has-grid'));
    });
  }

  // Copy Image Button
  const copyImgBtn = document.getElementById('copyBarcodeImgBtn');
  if (copyImgBtn) {
    copyImgBtn.addEventListener('click', async () => {
      try {
        await copyBarcodeImageToClipboard();
        showToast('Barcode image copied to clipboard!', 'success');
      } catch (err) {
        showToast(`Copy failed: ${err.message}`, 'error');
      }
    });
  }

  // Copy Page Link Button
  const copyLinkBtn = document.getElementById('copyPageLinkBtn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const shareUrl = buildShareableUrl();
      navigator.clipboard.writeText(shareUrl).then(
        () => showToast('Shareable link copied to clipboard!', 'success'),
        (err) => showToast(`Failed to copy link: ${err}`, 'error'),
      );
    });
  }

  // Embed Drawer Toggle & Copy Embed Code
  const embedDrawer = document.getElementById('embedDrawer');
  const embedToggle = document.getElementById('embedDrawerToggle');
  const copyEmbedBtn = document.getElementById('copyEmbedCodeBtn');

  if (embedToggle && embedDrawer) {
    embedToggle.addEventListener('click', () => {
      embedDrawer.classList.toggle('is-open');
    });
  }

  if (copyEmbedBtn) {
    copyEmbedBtn.addEventListener('click', () => {
      const codeEl = document.getElementById('embedCodeText');
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent).then(
          () => showToast('HTML embed code copied!', 'success'),
          (err) => showToast(`Copy failed: ${err}`, 'error'),
        );
      }
    });
  }

  // Download format buttons
  const formats = ['png', 'svg', 'jpg', 'gif'];
  formats.forEach((fmt) => {
    const btn = document.getElementById(`download${fmt.toUpperCase()}Btn`);
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const params = getActiveRenderParams();
          params.imagetype = fmt;
          const blob = await renderBarcodeBlob(params);
          triggerBlobDownload(blob, `barcode_${state.generator.code.toLowerCase()}.${fmt === 'jpeg' ? 'jpg' : fmt}`);
          showToast(`Downloaded ${fmt.toUpperCase()} barcode.`, 'success');
        } catch (err) {
          showToast(`Download failed: ${err.message}`, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }
  });
}

function applyZoom(target) {
  target.style.transform = `scale(${currentZoom})`;
  const label = document.getElementById('stageZoomLevel');
  if (label) label.textContent = `${Math.round(currentZoom * 100)}%`;
}

export async function updateBarcodePreview() {
  const target = document.getElementById('barcodeRenderTarget');
  const metricsEl = document.getElementById('stageMetrics');
  const embedCodeEl = document.getElementById('embedCodeText');
  if (!target) return;

  const t0 = performance.now();
  const params = getActiveRenderParams();

  try {
    target.style.opacity = '0.6';
    const result = await renderBarcodeBase64(params);
    const renderDuration = Math.round(performance.now() - t0);

    currentBase64 = result.base64;
    const src = `data:${result.mime};base64,${result.base64}`;

    // Render image
    const img = new Image();
    img.onload = () => {
      target.innerHTML = '';
      target.appendChild(img);
      target.style.opacity = '1';

      currentDimensions = { width: img.naturalWidth, height: img.naturalHeight };
      const dpi = params.dpi || 96;
      const mmW = ((img.naturalWidth / dpi) * 25.4).toFixed(1);
      const mmH = ((img.naturalHeight / dpi) * 25.4).toFixed(1);

      if (metricsEl) {
        metricsEl.innerHTML = `
          <span class="metrics-item"><strong>${img.naturalWidth} &times; ${img.naturalHeight}</strong> px</span>
          <span class="metrics-item">(${mmW} &times; ${mmH} mm @ ${dpi} DPI)</span>
          <span class="metrics-item" style="margin-left:auto;">${renderDuration} ms</span>
        `;
      }
    };
    img.onerror = () => {
      target.innerHTML = `<div style="padding:16px; color:var(--color-destructive); font-size:var(--text-xs);">Preview failed to load.</div>`;
      target.style.opacity = '1';
    };
    img.src = src;

    // Update Embed Code
    if (embedCodeEl) {
      const publicUrl = buildBarcodeUrl({
        code: params.code,
        data: params.data,
        dpi: params.dpi,
      });
      embedCodeEl.textContent = `<img src="${publicUrl}" alt="Barcode ${params.code}" />`;
    }

  } catch (err) {
    target.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--color-destructive); font-size: var(--text-xs);">
        <strong>Rendering Error:</strong><br />
        ${escapeHtml(err.message)}
      </div>
    `;
    target.style.opacity = '1';
  }
}

function getActiveRenderParams() {
  const g = state.generator;
  const params = {
    code: g.code,
    data: g.data,
    imagetype: g.format,
    dpi: g.dpi,
    color: g.color,
    bgcolor: g.transparent ? 'none' : g.bgcolor,
    showhrt: g.showhrt ? 'true' : 'false',
    fontname: g.fontname,
    fontsize: g.fontsize,
  };

  if (g.trimWhitespace) params['trim-whitespace'] = 'true';
  if (g.translateEsc) params['translate-esc'] = 'true';
  if (g.modulewidth) params.modulewidth = g.modulewidth;
  if (g.codepage && g.codepage !== 'Default') params.codepage = g.codepage;

  // Symbology specific
  if (g.code.toLowerCase().includes('pdf417')) {
    if (g.pdfcolumns) params.pdfcolumns = g.pdfcolumns;
    if (g.pdfrows) params.pdfrows = g.pdfrows;
    if (g.pdfeclevel !== '') params.pdfeclevel = g.pdfeclevel;
    if (g.pdfvariant) params.pdfvariant = g.pdfvariant.toLowerCase();
    if (g.pdfcompact) params.pdfcompact = 'true';
    if (g.pdfrowmult) params.pdfrowmult = g.pdfrowmult;
  }

  if (g.code.toLowerCase().includes('datamatrix')) {
    if (g.dmsize && g.dmsize !== 'Default') params.dmsize = g.dmsize;
  }

  if (g.code.toLowerCase().includes('qr')) {
    if (g.eclevel) params.eclevel = g.eclevel;
  }

  return params;
}

async function copyBarcodeImageToClipboard() {
  const params = getActiveRenderParams();
  params.imagetype = 'png';
  const blob = await renderBarcodeBlob(params);

  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ]);
  } else {
    throw new Error('ClipboardItem API not supported in this browser.');
  }
}

function buildShareableUrl() {
  const url = new URL(window.location.origin);
  url.pathname = `/en/${state.generator.code.toLowerCase()}`;
  url.searchParams.set('data', state.generator.data);
  return url.toString();
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
