/**
 * Module 4: Label Printing Templates Controller
 */

import { state } from '../state.js';
import { fetchLabelPdf, triggerBlobDownload } from '../api.js';
import { showToast } from '../ui/notifications.js';

export function initLabelPrinting() {
  bindTemplateSelector();
  bindFormInputs();
  bindExportButton();

  updateLiveLabelPreview();
}

function bindTemplateSelector() {
  const container = document.getElementById('labelTemplatesSelector');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const opt = e.target.closest('.label-template-option');
    if (!opt) return;
    const tpl = opt.dataset.template;
    state.labels.template = tpl;

    container.querySelectorAll('.label-template-option').forEach((o) => o.classList.remove('active'));
    opt.classList.add('active');

    // Toggle fields view (Standard vs CSV Grid)
    const stdFields = document.getElementById('labelStandardFields');
    const csvFields = document.getElementById('labelCsvGridFields');
    if (tpl === 'csv-sheet') {
      if (stdFields) stdFields.style.display = 'none';
      if (csvFields) csvFields.style.display = 'block';
    } else {
      if (stdFields) stdFields.style.display = 'block';
      if (csvFields) csvFields.style.display = 'none';
    }

    updateLiveLabelPreview();
  });
}

function bindFormInputs() {
  // Standard fields
  const fields = [
    { id: 'lblReceiver', key: 'receiver' },
    { id: 'lblDock', key: 'dock' },
    { id: 'lblAdviceNote', key: 'adviceNote' },
    { id: 'lblSupplierId', key: 'supplierId' },
    { id: 'lblPartNumber', key: 'partNumber' },
    { id: 'lblQuantity', key: 'quantity' },
    { id: 'lblPartDesc', key: 'partDescription' },
    { id: 'lblPackageId', key: 'packageId' },
    { id: 'lblBatch', key: 'batchNumber' },
  ];

  fields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = state.labels.fields[key] || '';
      el.addEventListener('input', (e) => {
        state.labels.fields[key] = e.target.value;
        updateLiveLabelPreview();
      });
    }
  });

  // CSV Grid fields
  const csvArea = document.getElementById('labelCsvText');
  const csvCols = document.getElementById('labelCsvCols');
  const csvRows = document.getElementById('labelCsvRows');
  const csvPaper = document.getElementById('labelCsvPaper');

  if (csvArea) {
    csvArea.value = state.labels.csvText;
    csvArea.addEventListener('input', (e) => {
      state.labels.csvText = e.target.value;
      updateLiveLabelPreview();
    });
  }
  if (csvCols) {
    csvCols.addEventListener('change', (e) => {
      state.labels.cols = parseInt(e.target.value, 10);
      updateLiveLabelPreview();
    });
  }
  if (csvRows) {
    csvRows.addEventListener('change', (e) => {
      state.labels.rows = parseInt(e.target.value, 10);
      updateLiveLabelPreview();
    });
  }
  if (csvPaper) {
    csvPaper.addEventListener('change', (e) => {
      state.labels.paperSize = e.target.value;
    });
  }
}

function updateLiveLabelPreview() {
  const container = document.getElementById('labelVisualMockup');
  if (!container) return;

  const tpl = state.labels.template;
  const f = state.labels.fields;

  if (tpl === 'vda4902') {
    container.innerHTML = `
      <div class="vda-mockup-grid">
        <div class="vda-row">
          <div class="vda-cell" style="flex:1.4;">
            <div class="vda-tag">1 RECEIVER (EMPFÄNGER)</div>
            <div class="vda-val">${escapeHtml(f.receiver)}</div>
            <div style="font-size:9px; color:#555;">LEIPZIG / GERMANY</div>
          </div>
          <div class="vda-cell">
            <div class="vda-tag">2 DOCK / GATE (ABLADESTELLE)</div>
            <div class="vda-val" style="font-size:16px;">${escapeHtml(f.dock)}</div>
          </div>
        </div>
        <div class="vda-row">
          <div class="vda-cell" style="flex:1.4;">
            <div class="vda-tag">3 ADVICE NOTE (LIEFERSCHEIN-NR)</div>
            <div class="vda-val">${escapeHtml(f.adviceNote)}</div>
          </div>
          <div class="vda-cell">
            <div class="vda-tag">4 SUPPLIER (LIEFERANTEN-NR)</div>
            <div class="vda-val">${escapeHtml(f.supplierId)}</div>
          </div>
        </div>
        <div class="vda-row" style="min-height:56px;">
          <div class="vda-cell">
            <div class="vda-tag">5 PART NUMBER (SACH-NR)</div>
            <div class="vda-val" style="font-size:14px; letter-spacing:1px;">P${escapeHtml(f.partNumber)}</div>
          </div>
          <div class="vda-cell" style="width:110px; flex:none;">
            <div class="vda-tag">6 QUANTITY (MENGE)</div>
            <div class="vda-val" style="font-size:16px;">Q${escapeHtml(f.quantity)}</div>
          </div>
        </div>
        <div class="vda-row">
          <div class="vda-cell">
            <div class="vda-tag">7 DESCRIPTION (BEZEICHNUNG)</div>
            <div class="vda-val">${escapeHtml(f.partDescription)}</div>
          </div>
          <div class="vda-cell">
            <div class="vda-tag">8 PACKAGE ID (PACKSTÜCK-NR)</div>
            <div class="vda-val">S${escapeHtml(f.packageId)}</div>
          </div>
        </div>
        <div class="vda-row vda-barcode-row">
          <div class="vda-cell vda-barcode-cell" style="flex:1; background:#f8fafc; padding:4px 8px; display:flex; flex-direction:row; justify-content:space-between; align-items:center;">
            <span style="font-size:9px; font-weight:700; color:#334155;">PDF417 TRANSPORT SUMMARY MANIFEST</span>
            <span style="font-size:9px; font-family:var(--font-mono); color:#64748b;">[)> 06 VDA-4902</span>
          </div>
        </div>
      </div>
    `;
  } else if (tpl === 'aiag-b10' || tpl === 'gs1-shipping') {
    container.innerHTML = `
      <div style="border: 2px solid #0f172a; padding: 12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #cbd5e1; padding-bottom:6px;">
          <div>
            <div style="font-size:9px; font-weight:700; color:#64748b;">SHIP FROM</div>
            <div style="font-size:12px; font-weight:700;">${escapeHtml(f.shipFrom || 'SUPPLIER CORP')}</div>
          </div>
          <div>
            <div style="font-size:9px; font-weight:700; color:#64748b;">SHIP TO</div>
            <div style="font-size:12px; font-weight:700;">${escapeHtml(f.shipTo || 'DISTRIBUTION CTR 4')}</div>
          </div>
        </div>
        <div style="border:1px dashed #94a3b8; padding:12px; text-align:center; background:#f8fafc;">
          <div style="font-size:10px; font-weight:700; color:#0f172a;">PDF417 SHIPPING MANIFEST</div>
          <div style="font-size:9px; font-family:var(--font-mono); color:#64748b; margin-top:2px;">[)> 06 (00)${escapeHtml(f.sscc || '003761234567890128')}</div>
        </div>
        <div style="border-top:1px solid #cbd5e1; padding-top:6px;">
          <div style="font-size:9px; font-weight:700; color:#64748b;">SSCC-18 (SERIAL SHIPPING CONTAINER CODE)</div>
          <div style="font-size:14px; font-family:var(--font-mono); font-weight:700;">(00) ${escapeHtml(f.sscc || '003761234567890128')}</div>
        </div>
      </div>
    `;
  } else if (tpl === 'csv-sheet') {
    const lines = state.labels.csvText.split('\n').filter((l) => l.trim().length > 0);
    const count = Math.max(lines.length - 1, 0); // exclude header
    container.innerHTML = `
      <div style="border: 1px solid #cbd5e1; padding: 16px; background:#ffffff; text-align:center;">
        <h4 style="font-size:14px; font-weight:700;">CSV Sticky Grid Sheet Preview</h4>
        <p style="font-size:12px; color:#64748b; margin-top:4px;">
          Layout: ${state.labels.cols} Columns &times; ${state.labels.rows} Rows per page (${state.labels.paperSize.toUpperCase()})
        </p>
        <div class="badge badge-accent" style="margin-top:10px;">
          ${count} Barcode ${count === 1 ? 'Label' : 'Labels'} in CSV
        </div>
      </div>
    `;
  }
}

function bindExportButton() {
  const exportBtn = document.getElementById('labelExportPdfBtn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    try {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Generating PDF...';
      showToast('Rendering industrial vector PDF...', 'info');

      const payload = {
        template: state.labels.template,
        ...(state.labels.template === 'csv-sheet' || state.labels.template === 'csv-grid'
          ? {
              csvText: state.labels.csvText,
              cols: state.labels.cols,
              rows: state.labels.rows,
              paperSize: state.labels.paperSize,
              showhrt: state.labels.showhrt,
              symCode: state.labels.symbology,
            }
          : {
              ...state.labels.fields,
            }),
      };

      const blob = await fetchLabelPdf(payload);
      triggerBlobDownload(blob, `compliance_label_${state.labels.template}.pdf`);
      showToast('Compliance Label PDF generated successfully!', 'success');
    } catch (err) {
      showToast(`Label PDF generation failed: ${err.message}`, 'error');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Generate Print-Ready PDF';
    }
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
