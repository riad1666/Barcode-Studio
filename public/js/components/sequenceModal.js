/**
 * Create Sequence Modal ($/#/* Masks) Component
 */

import { openModal, closeModal } from '../ui/modal.js';
import { generateSequence, downloadBatchZip } from '../api.js';
import { showToast } from '../ui/notifications.js';
import { state } from '../state.js';

export function initSequenceModal(onApplySequence) {
  const modal = document.getElementById('sequenceModal');
  const triggerBtn = document.getElementById('openSequenceModalBtn');
  if (!modal || !triggerBtn) return;

  triggerBtn.addEventListener('click', () => {
    openModal(modal);
    updateSequencePreview();
  });

  const inputs = [
    'seqPrefix',
    'seqSuffix',
    'seqStart',
    'seqEnd',
    'seqStep',
    'seqMask',
  ];

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        updateSequencePreview();
      });
    }
  });

  // Insert into payload
  const insertBtn = document.getElementById('seqInsertBtn');
  if (insertBtn) {
    insertBtn.addEventListener('click', async () => {
      try {
        const rows = await getSequenceRows();
        if (rows && rows.length > 0) {
          onApplySequence(rows.join('\n'));
          closeModal(modal);
          showToast(`Inserted ${rows.length} sequence items into payload.`, 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Direct Batch ZIP download
  const zipBtn = document.getElementById('seqZipBtn');
  if (zipBtn) {
    zipBtn.addEventListener('click', async () => {
      try {
        const rows = await getSequenceRows();
        if (rows && rows.length > 0) {
          zipBtn.disabled = true;
          zipBtn.textContent = 'Generating ZIP...';
          await downloadBatchZip({
            code: state.generator.code,
            data: rows.join('\n'),
            imagetype: state.generator.format,
            dpi: state.generator.dpi,
            pdfcolumns: state.generator.pdfcolumns,
            pdfrows: state.generator.pdfrows,
            pdfeclevel: state.generator.pdfeclevel,
          });
          closeModal(modal);
          showToast(`Downloaded batch ZIP with ${rows.length} barcodes.`, 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        zipBtn.disabled = false;
        zipBtn.textContent = 'Download Batch ZIP';
      }
    });
  }
}

async function getSequenceRows() {
  const prefix = document.getElementById('seqPrefix')?.value || '';
  const suffix = document.getElementById('seqSuffix')?.value || '';
  const start = parseInt(document.getElementById('seqStart')?.value || '1', 10);
  const end = parseInt(document.getElementById('seqEnd')?.value || '25', 10);
  const step = parseInt(document.getElementById('seqStep')?.value || '1', 10);
  const mask = document.getElementById('seqMask')?.value || '$$$$';

  const result = await generateSequence({
    prefix,
    suffix,
    start,
    end,
    step,
    increment: step,
    mask,
  });

  return result.items || result.rows || [];
}

async function updateSequencePreview() {
  const previewEl = document.getElementById('seqPreviewTable');
  const countBadge = document.getElementById('seqCountBadge');
  if (!previewEl) return;

  try {
    const rows = await getSequenceRows();
    if (countBadge) countBadge.textContent = `${rows.length} items`;

    if (rows.length === 0) {
      previewEl.innerHTML = '<div style="padding:12px; color:var(--color-text-muted);">No sequence items.</div>';
      return;
    }

    // Render each item directly as a <div> child inside #seqPreviewTable
    previewEl.innerHTML = rows
      .map(
        (r) =>
          `<div style="padding: 2px 0; font-family: var(--font-mono); font-size: var(--text-xs); line-height: 1.5;">${escapeHtml(r)}</div>`
      )
      .join('');
  } catch (err) {
    previewEl.innerHTML = `<div style="color:var(--color-destructive); font-size:var(--text-xs);">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
