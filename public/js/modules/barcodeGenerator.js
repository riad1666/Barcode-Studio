/**
 * Module 1: Barcode Generator Controller (Default: PDF417)
 */

import { state } from '../state.js';
import { updateBarcodePreview } from '../components/opticalStage.js';
import { renderEpcForm, renderSwissForm, renderZatcaForm } from '../forms/bankingForm.js';
import { renderGs1Form } from '../forms/gs1Form.js';
import { renderVCardForm, renderMeCardForm, renderWifiForm, renderEventForm } from '../forms/taggingForm.js';
import { downloadBatchZip } from '../api.js';
import { showToast } from '../ui/notifications.js';

let debounceTimer = null;

export function initBarcodeGenerator() {
  bindPills();
  bindPayloadTextarea();
  bindPayloadToggles();
  bindSettingsTabs();
  bindSettingsInputs();

  // Subscribe to symbology changes to update UI and re-render
  state.subscribe('generator:symbologyChanged', (sym) => {
    onSymbologySelected(sym);
  });

  // Initial trigger
  const initialSym = state.catalog.symbologies.find((s) => s.id.toLowerCase() === 'pdf417') || {
    id: 'PDF417',
    name: 'PDF417',
    defaultData: 'This is a PDF417 by Barcode Studio',
    formType: 'text',
    settingsGroup: 'pdf417',
  };
  state.setGeneratorSymbology(initialSym);
  triggerDebouncedRender(50);
}

function bindPills() {
  const pillsContainer = document.getElementById('quickJumpPills');
  if (!pillsContainer) return;

  pillsContainer.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill-item');
    if (!pill) return;
    const targetId = pill.dataset.symId;
    const sym = state.catalog.symbologies.find((s) => s.id.toLowerCase() === targetId.toLowerCase());
    if (sym) {
      state.setGeneratorSymbology(sym);
      const path = `/en/${sym.id.toLowerCase()}`;
      if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
    }
  });

  state.subscribe('generator:symbologyChanged', (sym) => {
    const pills = pillsContainer.querySelectorAll('.pill-item');
    pills.forEach((p) => {
      const match = (p.dataset.symId || '').toLowerCase() === sym.id.toLowerCase();
      p.classList.toggle('active', match);
    });
  });
}

function bindPayloadTextarea() {
  const textarea = document.getElementById('barcodePayload');
  if (!textarea) return;

  textarea.value = state.generator.data;

  textarea.addEventListener('input', (e) => {
    state.generator.data = e.target.value;
    updateRowCount(e.target.value);
    triggerDebouncedRender();
  });

  state.subscribe('generator:symbologyChanged', (sym) => {
    textarea.value = sym.defaultData || '';
    state.generator.data = textarea.value;
    updateRowCount(textarea.value);
  });

  state.subscribe('generator:changed', (gen) => {
    if (gen && gen.data !== undefined) {
      if (textarea.value !== gen.data) {
        textarea.value = gen.data;
      }
      updateRowCount(gen.data);
    }
  });
}

function updateRowCount(text) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const badge = document.getElementById('payloadRowBadge');
  if (badge) {
    badge.textContent = `${lines.length} ${lines.length === 1 ? 'row' : 'rows'}`;
  }
}

function bindPayloadToggles() {
  const trimBox = document.getElementById('toggleTrimWhitespace');
  const escBox = document.getElementById('toggleTranslateEsc');
  const batchBox = document.getElementById('toggleBatchZip');
  const batchActionBtn = document.getElementById('batchZipDownloadBtn');

  if (trimBox) {
    trimBox.checked = state.generator.trimWhitespace;
    trimBox.addEventListener('change', (e) => {
      state.generator.trimWhitespace = e.target.checked;
      triggerDebouncedRender();
    });
  }

  if (escBox) {
    escBox.checked = state.generator.translateEsc;
    escBox.addEventListener('change', (e) => {
      state.generator.translateEsc = e.target.checked;
      triggerDebouncedRender();
    });
  }

  if (batchBox) {
    batchBox.checked = state.generator.multipleBarcodes;
    batchBox.addEventListener('change', (e) => {
      state.generator.multipleBarcodes = e.target.checked;
      if (batchActionBtn) {
        batchActionBtn.style.display = e.target.checked ? 'inline-flex' : 'none';
      }
    });
  }

  if (batchActionBtn) {
    batchActionBtn.addEventListener('click', async () => {
      try {
        batchActionBtn.disabled = true;
        batchActionBtn.textContent = 'Generating Batch ZIP...';
        await downloadBatchZip({
          code: state.generator.code,
          data: state.generator.data,
          imagetype: state.generator.format,
          dpi: state.generator.dpi,
          pdfcolumns: state.generator.pdfcolumns,
          pdfrows: state.generator.pdfrows,
          pdfeclevel: state.generator.pdfeclevel,
        });
        showToast('Batch ZIP downloaded successfully!', 'success');
      } catch (err) {
        showToast(`Batch download failed: ${err.message}`, 'error');
      } finally {
        batchActionBtn.disabled = false;
        batchActionBtn.textContent = 'Download Batch ZIP';
      }
    });
  }
}

function onSymbologySelected(sym) {
  // Update Header title & description
  const titleEl = document.getElementById('activeSymbologyTitle');
  const descEl = document.getElementById('activeSymbologyDesc');
  if (titleEl) titleEl.textContent = sym.name;
  if (descEl) descEl.textContent = sym.description || sym.id;

  // Toggle structured form vs standard textarea
  const structuredContainer = document.getElementById('structuredFormMount');
  const standardPayloadSection = document.getElementById('standardPayloadSection');

  const formType = sym.formType || 'text';

  if (formType === 'text') {
    if (structuredContainer) structuredContainer.style.display = 'none';
    if (standardPayloadSection) standardPayloadSection.style.display = 'block';
  } else {
    if (standardPayloadSection) standardPayloadSection.style.display = 'none';
    if (structuredContainer) {
      structuredContainer.style.display = 'block';
      mountStructuredForm(structuredContainer, sym);
    }
  }

  // Update Advanced tab visibility
  updateAdvancedTabForSymbology(sym);

  triggerDebouncedRender();
}

function mountStructuredForm(mountEl, sym) {
  mountEl.innerHTML = '';
  const onPayloadChange = (newPayload) => {
    state.generator.data = newPayload;
    const ta = document.getElementById('barcodePayload');
    if (ta) ta.value = newPayload;
    updateRowCount(newPayload);
    triggerDebouncedRender(150);
  };

  switch (sym.formType) {
    case 'epc':
      renderEpcForm(mountEl, onPayloadChange);
      break;
    case 'swiss':
      renderSwissForm(mountEl, sym.swissRefType || 'QRR', onPayloadChange);
      break;
    case 'zatca':
      renderZatcaForm(mountEl, onPayloadChange);
      break;
    case 'gs1DigitalLink':
      renderGs1Form(mountEl, onPayloadChange);
      break;
    case 'vcard':
      renderVCardForm(mountEl, onPayloadChange);
      break;
    case 'mecard':
      renderMeCardForm(mountEl, onPayloadChange);
      break;
    case 'wifi':
      renderWifiForm(mountEl, onPayloadChange);
      break;
    case 'event':
      renderEventForm(mountEl, onPayloadChange);
      break;
    default:
      mountEl.style.display = 'none';
      break;
  }
}

function bindSettingsTabs() {
  const tabsContainer = document.getElementById('generatorSettingsTabs');
  if (!tabsContainer) return;

  tabsContainer.addEventListener('click', (e) => {
    const trigger = e.target.closest('.tab-trigger');
    if (!trigger) return;
    const targetTab = trigger.dataset.tab;

    tabsContainer.querySelectorAll('.tab-trigger').forEach((t) => t.classList.remove('active'));
    trigger.classList.add('active');

    document.querySelectorAll('#generatorSettingsPanels .tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${targetTab}`);
    });
  });
}

function bindSettingsInputs() {
  // DPI
  const dpiSlider = document.getElementById('settingDpiSlider');
  const dpiInput = document.getElementById('settingDpiInput');
  if (dpiSlider && dpiInput) {
    dpiSlider.addEventListener('input', (e) => {
      dpiInput.value = e.target.value;
      state.generator.dpi = parseInt(e.target.value, 10);
      triggerDebouncedRender();
    });
    dpiInput.addEventListener('change', (e) => {
      dpiSlider.value = e.target.value;
      state.generator.dpi = parseInt(e.target.value, 10);
      triggerDebouncedRender();
    });
  }

  // Module width
  const modWidth = document.getElementById('settingModuleWidth');
  if (modWidth) {
    modWidth.addEventListener('input', (e) => {
      state.generator.modulewidth = e.target.value;
      triggerDebouncedRender();
    });
  }

  // Colors
  const fgColor = document.getElementById('settingColorPicker');
  const fgHex = document.getElementById('settingColorHex');
  if (fgColor && fgHex) {
    fgColor.addEventListener('input', (e) => {
      fgHex.value = e.target.value;
      state.generator.color = e.target.value;
      triggerDebouncedRender();
    });
    fgHex.addEventListener('change', (e) => {
      fgColor.value = e.target.value;
      state.generator.color = e.target.value;
      triggerDebouncedRender();
    });
  }

  const bgColor = document.getElementById('settingBgPicker');
  const bgHex = document.getElementById('settingBgHex');
  const transBox = document.getElementById('settingTransparent');
  if (bgColor && bgHex && transBox) {
    bgColor.addEventListener('input', (e) => {
      bgHex.value = e.target.value;
      state.generator.bgcolor = e.target.value;
      triggerDebouncedRender();
    });
    bgHex.addEventListener('change', (e) => {
      bgColor.value = e.target.value;
      state.generator.bgcolor = e.target.value;
      triggerDebouncedRender();
    });
    transBox.addEventListener('change', (e) => {
      state.generator.transparent = e.target.checked;
      bgColor.disabled = e.target.checked;
      bgHex.disabled = e.target.checked;
      triggerDebouncedRender();
    });
  }

  // Font
  const showHrt = document.getElementById('settingShowHrt');
  const fontName = document.getElementById('settingFontFamily');
  const fontSize = document.getElementById('settingFontSize');
  if (showHrt) {
    showHrt.addEventListener('change', (e) => {
      state.generator.showhrt = e.target.checked;
      triggerDebouncedRender();
    });
  }
  if (fontName) {
    fontName.addEventListener('change', (e) => {
      state.generator.fontname = e.target.value;
      triggerDebouncedRender();
    });
  }
  if (fontSize) {
    fontSize.addEventListener('change', (e) => {
      state.generator.fontsize = parseInt(e.target.value, 10);
      triggerDebouncedRender();
    });
  }

  // PDF417 Advanced Controls
  const pdfCols = document.getElementById('advPdfColumns');
  const pdfRows = document.getElementById('advPdfRows');
  const pdfEc = document.getElementById('advPdfEcLevel');
  const pdfCompact = document.getElementById('advPdfCompact');
  const pdfRowMult = document.getElementById('advPdfRowMult');

  if (pdfCols) {
    pdfCols.addEventListener('change', (e) => {
      state.generator.pdfcolumns = e.target.value;
      triggerDebouncedRender();
    });
  }
  if (pdfRows) {
    pdfRows.addEventListener('change', (e) => {
      state.generator.pdfrows = e.target.value;
      triggerDebouncedRender();
    });
  }
  if (pdfEc) {
    pdfEc.addEventListener('change', (e) => {
      state.generator.pdfeclevel = e.target.value;
      triggerDebouncedRender();
    });
  }
  if (pdfCompact) {
    pdfCompact.addEventListener('change', (e) => {
      state.generator.pdfcompact = e.target.checked;
      triggerDebouncedRender();
    });
  }
  if (pdfRowMult) {
    pdfRowMult.addEventListener('change', (e) => {
      state.generator.pdfrowmult = parseInt(e.target.value, 10);
      triggerDebouncedRender();
    });
  }

  // Data Matrix Size
  const dmSize = document.getElementById('advDmSize');
  if (dmSize) {
    dmSize.addEventListener('change', (e) => {
      state.generator.dmsize = e.target.value;
      triggerDebouncedRender();
    });
  }

  // QR EC Level
  const qrEc = document.getElementById('advQrEcLevel');
  if (qrEc) {
    qrEc.addEventListener('change', (e) => {
      state.generator.eclevel = e.target.value;
      triggerDebouncedRender();
    });
  }

  // Code Page
  const codePage = document.getElementById('advCodePage');
  if (codePage) {
    codePage.addEventListener('change', (e) => {
      state.generator.codepage = e.target.value;
      triggerDebouncedRender();
    });
  }
}

function updateAdvancedTabForSymbology(sym) {
  const isPdf = sym.id.toLowerCase().includes('pdf417');
  const isDm = sym.id.toLowerCase().includes('datamatrix');
  const isQr = sym.id.toLowerCase().includes('qr');

  const pdfGroup = document.getElementById('advGroupPdf417');
  const dmGroup = document.getElementById('advGroupDataMatrix');
  const qrGroup = document.getElementById('advGroupQr');

  if (pdfGroup) pdfGroup.style.display = isPdf ? 'block' : 'none';
  if (dmGroup) dmGroup.style.display = isDm ? 'block' : 'none';
  if (qrGroup) qrGroup.style.display = isQr ? 'block' : 'none';
}

function triggerDebouncedRender(delay = 200) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    updateBarcodePreview();
  }, delay);
}
