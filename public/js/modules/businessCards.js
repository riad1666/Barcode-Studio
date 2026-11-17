/**
 * Module 3: Business Cards (85x54mm PDF) Designer Controller
 */

import { state } from '../state.js';
import { renderBarcodeBase64, fetchBusinessCardPdf, triggerBlobDownload } from '../api.js';
import { showToast } from '../ui/notifications.js';
import { buildVCardPayload, buildMeCardPayload } from '../forms/taggingForm.js';

let debounceTimer = null;

export function initBusinessCards() {
  bindFormInputs();
  bindTemplateChoice();
  bindLogoUpload();
  bindFormatAndSymbology();
  bindExportButtons();

  updateLiveCardVisual();
}

function bindFormInputs() {
  const fields = [
    { id: 'bcFirstName', key: 'FirstName' },
    { id: 'bcLastName', key: 'LastName' },
    { id: 'bcTitle', key: 'Position' },
    { id: 'bcCompany', key: 'Company' },
    { id: 'bcPhone', key: 'PhoneNumber' },
    { id: 'bcEmail', key: 'Email' },
    { id: 'bcUrl', key: 'Url' },
    { id: 'bcAddress', key: 'Address' },
  ];

  fields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = state.businessCards[key] || '';
      el.addEventListener('input', (e) => {
        state.businessCards[key] = e.target.value;
        updateLiveCardVisual();
      });
    }
  });
}

function bindTemplateChoice() {
  const container = document.getElementById('bcTemplatesGrid');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const choice = e.target.closest('.template-card-choice');
    if (!choice) return;
    const tpl = choice.dataset.template;
    state.businessCards.Template = tpl;

    container.querySelectorAll('.template-card-choice').forEach((c) => c.classList.remove('active'));
    choice.classList.add('active');

    updateLiveCardVisual();
  });
}

function bindLogoUpload() {
  const input = document.getElementById('bcLogoInput');
  const removeBtn = document.getElementById('bcRemoveLogoBtn');

  if (input) {
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.match(/^image\/(png|jpe?g)$/i)) {
        showToast('Please upload a valid PNG or JPEG image.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        state.businessCards.LogoDataUrl = reader.result;
        if (removeBtn) removeBtn.style.display = 'inline-flex';
        updateLiveCardVisual();
        showToast('Logo uploaded!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      state.businessCards.LogoDataUrl = null;
      if (input) input.value = '';
      removeBtn.style.display = 'none';
      updateLiveCardVisual();
      showToast('Logo removed.', 'info');
    });
  }
}

function bindFormatAndSymbology() {
  const formatToggle = document.getElementById('bcFormatToggle');
  if (formatToggle) {
    formatToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      state.businessCards.Format = btn.dataset.format;
      formatToggle.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateLiveCardVisual();
    });
  }

  const symToggle = document.getElementById('bcSymbologyToggle');
  if (symToggle) {
    symToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      state.businessCards.Symbology = btn.dataset.symbology;
      symToggle.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateLiveCardVisual();
    });
  }
}

function updateLiveCardVisual() {
  const s = state.businessCards;
  const canvas = document.getElementById('businessCardCanvas');
  if (!canvas) return;

  // Apply template class
  canvas.className = `business-card-canvas template-${s.Template}`;

  // Update text elements
  const nameEl = document.getElementById('cardPreviewName');
  const titleEl = document.getElementById('cardPreviewTitle');
  const compEl = document.getElementById('cardPreviewCompany');
  const phoneEl = document.getElementById('cardPreviewPhone');
  const emailEl = document.getElementById('cardPreviewEmail');
  const urlEl = document.getElementById('cardPreviewUrl');
  const addrEl = document.getElementById('cardPreviewAddress');

  const fullName = [s.FirstName, s.LastName].filter(Boolean).join(' ') || 'John Doe';
  if (nameEl) nameEl.textContent = fullName;
  if (titleEl) titleEl.textContent = s.Position || 'Position';
  if (compEl) compEl.textContent = s.Company || '';
  if (phoneEl) phoneEl.textContent = s.PhoneNumber ? `T: ${s.PhoneNumber}` : '';
  if (emailEl) emailEl.textContent = s.Email ? `E: ${s.Email}` : '';
  if (urlEl) urlEl.textContent = s.Url ? `W: ${s.Url}` : '';
  if (addrEl) addrEl.textContent = s.Address ? `A: ${s.Address}` : '';

  // Logo Preview
  const logoBox = document.getElementById('cardPreviewLogo');
  if (logoBox) {
    if (s.LogoDataUrl) {
      logoBox.innerHTML = `<img src="${s.LogoDataUrl}" alt="Card Logo" />`;
      logoBox.style.display = 'block';
    } else {
      logoBox.innerHTML = '';
      logoBox.style.display = 'none';
    }
  }

  // Render Barcode thumbnail
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const barcodeBox = document.getElementById('cardPreviewBarcode');
    if (!barcodeBox) return;

    try {
      const payload = s.Format === 'mecard'
        ? buildMeCardPayload({ Name: fullName, PhoneNumber: s.PhoneNumber, Email: s.Email, Url: s.Url, Address: s.Address })
        : buildVCardPayload({ FirstName: s.FirstName, LastName: s.LastName, Title: s.Position, Organization: s.Company, PhoneNumber: s.PhoneNumber, Email: s.Email, Url: s.Url, Address: s.Address });

      const res = await renderBarcodeBase64({
        code: s.Symbology || 'QRCode',
        data: payload,
        imagetype: 'png',
        dpi: 150,
      });

      barcodeBox.innerHTML = `<img src="data:${res.mime};base64,${res.base64}" alt="Card 2D Code" />`;
    } catch (err) {
      console.warn('Card barcode preview error:', err);
    }
  }, 150);
}

function bindExportButtons() {
  const exportSingleBtn = document.getElementById('bcExportSinglePdf');
  const exportA4Btn = document.getElementById('bcExportA4Pdf');
  const exportLetterBtn = document.getElementById('bcExportLetterPdf');

  const runExport = async (layout, filename) => {
    try {
      const payload = {
        ...state.businessCards,
        Layout: layout,
      };
      showToast('Generating vector PDF...', 'info');
      const blob = await fetchBusinessCardPdf(payload);
      triggerBlobDownload(blob, filename);
      showToast('Business Card PDF generated successfully!', 'success');
    } catch (err) {
      showToast(`PDF generation failed: ${err.message}`, 'error');
    }
  };

  if (exportSingleBtn) {
    exportSingleBtn.addEventListener('click', () => runExport('single', 'business_card_85x54mm.pdf'));
  }
  if (exportA4Btn) {
    exportA4Btn.addEventListener('click', () => runExport('a4-10up', 'business_cards_a4_10up.pdf'));
  }
  if (exportLetterBtn) {
    exportLetterBtn.addEventListener('click', () => runExport('letter-10up', 'business_cards_letter_10up.pdf'));
  }
}
