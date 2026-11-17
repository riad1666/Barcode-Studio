/**
 * Module 2: QR Code Studio Controller
 */

import { state } from '../state.js';
import { renderBarcodeBase64, renderBarcodeBlob, triggerBlobDownload } from '../api.js';
import { showToast } from '../ui/notifications.js';
import { buildVCardPayload, buildMeCardPayload, buildWifiPayload, buildEventPayload } from '../forms/taggingForm.js';
import { buildEpcPayload } from '../forms/bankingForm.js';

let debounceTimer = null;

const PRESETS = [
  { id: 'text', label: 'Plain Text', icon: 'textT' },
  { id: 'url', label: 'Website URL', icon: 'link' },
  { id: 'phone', label: 'Phone', icon: 'phone' },
  { id: 'sms', label: 'SMS', icon: 'envelope' },
  { id: 'email', label: 'Email', icon: 'envelope' },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi' },
  { id: 'event', label: 'Event', icon: 'calendar' },
  { id: 'vcard', label: 'vCard', icon: 'card' },
  { id: 'mecard', label: 'MeCard', icon: 'card' },
  { id: 'epc', label: 'EPC SEPA', icon: 'bank' },
];

export function initQrStudio() {
  bindPresetGrid();
  bindSizePresets();
  bindEcLevels();
  bindOptions();
  bindDownloads();

  // Render initial preset
  switchPreset('url');
}

function bindPresetGrid() {
  const container = document.getElementById('qrPresetsGrid');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.qr-preset-card');
    if (!card) return;
    const presetId = card.dataset.presetId;
    switchPreset(presetId);
  });
}

function switchPreset(presetId) {
  state.qrStudio.preset = presetId;

  // Update active card
  document.querySelectorAll('.qr-preset-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.presetId === presetId);
  });

  const formMount = document.getElementById('qrFormMount');
  if (!formMount) return;

  renderPresetForm(formMount, presetId);
}

function renderPresetForm(mountEl, presetId) {
  mountEl.innerHTML = '';

  const onDataUpdate = (data) => {
    state.qrStudio.data = data;
    triggerQrRender();
  };

  switch (presetId) {
    case 'text':
      mountEl.innerHTML = `
        <div class="form-group">
          <label class="form-label" for="qr_text_input">Text Content</label>
          <textarea class="input-textarea code-font" id="qr_text_input" rows="4">Swiss Precision QR Code</textarea>
        </div>
      `;
      const ta = mountEl.querySelector('#qr_text_input');
      ta.addEventListener('input', (e) => onDataUpdate(e.target.value));
      onDataUpdate(ta.value);
      break;

    case 'url':
      mountEl.innerHTML = `
        <div class="form-group">
          <label class="form-label" for="qr_url_input">Website URL (with https://)</label>
          <input class="input-text code-font" id="qr_url_input" value="https://www.tec-it.com" />
        </div>
      `;
      const urlInput = mountEl.querySelector('#qr_url_input');
      urlInput.addEventListener('input', (e) => onDataUpdate(e.target.value));
      onDataUpdate(urlInput.value);
      break;

    case 'phone':
      mountEl.innerHTML = `
        <div class="form-group">
          <label class="form-label" for="qr_phone_input">Telephone Number</label>
          <input class="input-text" id="qr_phone_input" type="tel" value="+43 7252 72720" />
        </div>
      `;
      const phoneInput = mountEl.querySelector('#qr_phone_input');
      phoneInput.addEventListener('input', (e) => onDataUpdate(`tel:${e.target.value.trim()}`));
      onDataUpdate(`tel:${phoneInput.value.trim()}`);
      break;

    case 'sms':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_sms_phone">Recipient Phone Number</label>
            <input class="input-text" id="qr_sms_phone" value="+436991005328" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_sms_msg">SMS Message Text</label>
            <input class="input-text" id="qr_sms_msg" value="Hello from QR Studio!" />
          </div>
        </div>
      `;
      const pEl = mountEl.querySelector('#qr_sms_phone');
      const mEl = mountEl.querySelector('#qr_sms_msg');
      const updateSms = () => onDataUpdate(`SMSTO:${pEl.value.trim()}:${mEl.value}`);
      pEl.addEventListener('input', updateSms);
      mEl.addEventListener('input', updateSms);
      updateSms();
      break;

    case 'email':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_email_addr">Recipient Email</label>
            <input class="input-text" id="qr_email_addr" type="email" value="office@tec-it.com" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_email_sub">Subject</label>
            <input class="input-text" id="qr_email_sub" value="Inquiry via QR Code" />
          </div>
        </div>
      `;
      const emAddr = mountEl.querySelector('#qr_email_addr');
      const emSub = mountEl.querySelector('#qr_email_sub');
      const updateEmail = () => onDataUpdate(`mailto:${emAddr.value.trim()}?subject=${encodeURIComponent(emSub.value)}`);
      emAddr.addEventListener('input', updateEmail);
      emSub.addEventListener('input', updateEmail);
      updateEmail();
      break;

    case 'wifi':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_wifi_ssid">Network Name (SSID)</label>
            <input class="input-text" id="qr_wifi_ssid" value="Guest-Wifi" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_wifi_pass">Password</label>
            <input class="input-text" id="qr_wifi_pass" type="password" value="SecretPassword123" />
          </div>
        </div>
      `;
      const wSsid = mountEl.querySelector('#qr_wifi_ssid');
      const wPass = mountEl.querySelector('#qr_wifi_pass');
      const updateWifi = () => onDataUpdate(buildWifiPayload({ SSID: wSsid.value, Password: wPass.value, Authentication: 'WPA' }));
      wSsid.addEventListener('input', updateWifi);
      wPass.addEventListener('input', updateWifi);
      updateWifi();
      break;

    case 'event':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_ev_title">Event Title</label>
            <input class="input-text" id="qr_ev_title" value="Product Launch" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_ev_loc">Location</label>
            <input class="input-text" id="qr_ev_loc" value="Convention Hall 2" />
          </div>
        </div>
      `;
      const evT = mountEl.querySelector('#qr_ev_title');
      const evL = mountEl.querySelector('#qr_ev_loc');
      const updateEv = () => onDataUpdate(buildEventPayload({ Summary: evT.value, Location: evL.value }));
      evT.addEventListener('input', updateEv);
      evL.addEventListener('input', updateEv);
      updateEv();
      break;

    case 'vcard':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_vc_fn">First Name</label>
            <input class="input-text" id="qr_vc_fn" value="Jane" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_vc_ln">Last Name</label>
            <input class="input-text" id="qr_vc_ln" value="Doe" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="qr_vc_org">Company</label>
          <input class="input-text" id="qr_vc_org" value="ACME Inc" />
        </div>
      `;
      const vcFn = mountEl.querySelector('#qr_vc_fn');
      const vcLn = mountEl.querySelector('#qr_vc_ln');
      const vcO = mountEl.querySelector('#qr_vc_org');
      const updateVc = () => onDataUpdate(buildVCardPayload({
        FirstName: vcFn ? vcFn.value : '',
        LastName: vcLn ? vcLn.value : '',
        Organization: vcO ? vcO.value : '',
      }));
      if (vcFn) vcFn.addEventListener('input', updateVc);
      if (vcLn) vcLn.addEventListener('input', updateVc);
      if (vcO) vcO.addEventListener('input', updateVc);
      updateVc();
      break;

    case 'mecard':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_mc_name">Contact Name</label>
            <input class="input-text" id="qr_mc_name" value="Jane Doe" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_mc_phone">Phone</label>
            <input class="input-text" id="qr_mc_phone" value="+1555123456" />
          </div>
        </div>
      `;
      const mcN = mountEl.querySelector('#qr_mc_name');
      const mcP = mountEl.querySelector('#qr_mc_phone');
      const updateMc = () => onDataUpdate(buildMeCardPayload({ Name: mcN.value, PhoneNumber: mcP.value }));
      mcN.addEventListener('input', updateMc);
      mcP.addEventListener('input', updateMc);
      updateMc();
      break;

    case 'epc':
      mountEl.innerHTML = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="qr_epc_name">Beneficiary Name</label>
            <input class="input-text" id="qr_epc_name" value="Martian Pioneers" />
          </div>
          <div class="form-group">
            <label class="form-label" for="qr_epc_iban">IBAN</label>
            <input class="input-text code-font" id="qr_epc_iban" value="DE71110220330123456789" />
          </div>
        </div>
      `;
      const epcN = mountEl.querySelector('#qr_epc_name');
      const epcI = mountEl.querySelector('#qr_epc_iban');
      const updateEpc = () => onDataUpdate(buildEpcPayload({ Receiver: epcN.value, IBAN: epcI.value, Amount: '99.00' }));
      epcN.addEventListener('input', updateEpc);
      epcI.addEventListener('input', updateEpc);
      updateEpc();
      break;
  }
}

function bindSizePresets() {
  const container = document.getElementById('qrSizePresets');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    const sz = parseInt(btn.dataset.size, 10);
    state.qrStudio.size = sz;

    container.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    triggerQrRender();
  });
}

function bindEcLevels() {
  const container = document.getElementById('qrEcPresets');
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    const ec = btn.dataset.ec;
    state.qrStudio.eclevel = ec;

    container.querySelectorAll('.segmented-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    triggerQrRender();
  });
}

function bindOptions() {
  const transBox = document.getElementById('qrTransparentToggle');
  const wrapper = document.getElementById('qrStudioImageWrapper');
  const fgPicker = document.getElementById('qrColorPicker');
  const fgHex = document.getElementById('qrColorHex');
  const bgPicker = document.getElementById('qrBgPicker');
  const bgHex = document.getElementById('qrBgHex');

  const normalizeHex = (val, fallback) => {
    const clean = String(val || '').replace(/^#/, '').trim();
    return /^[0-9a-fA-F]{6}$/.test(clean) ? `#${clean.toLowerCase()}` : fallback;
  };

  if (fgPicker && fgHex) {
    fgPicker.addEventListener('input', (e) => {
      fgHex.value = e.target.value;
      state.qrStudio.color = e.target.value;
      triggerQrRender();
    });
    fgHex.addEventListener('change', (e) => {
      const normalized = normalizeHex(e.target.value, state.qrStudio.color);
      fgHex.value = normalized;
      fgPicker.value = normalized;
      state.qrStudio.color = normalized;
      triggerQrRender();
    });
  }

  if (bgPicker && bgHex) {
    bgPicker.addEventListener('input', (e) => {
      bgHex.value = e.target.value;
      state.qrStudio.bgcolor = e.target.value;
      if (wrapper && !state.qrStudio.transparent) wrapper.style.backgroundColor = e.target.value;
      triggerQrRender();
    });
    bgHex.addEventListener('change', (e) => {
      const normalized = normalizeHex(e.target.value, state.qrStudio.bgcolor);
      bgHex.value = normalized;
      bgPicker.value = normalized;
      state.qrStudio.bgcolor = normalized;
      if (wrapper && !state.qrStudio.transparent) wrapper.style.backgroundColor = normalized;
      triggerQrRender();
    });
  }

  if (transBox) {
    transBox.addEventListener('change', (e) => {
      state.qrStudio.transparent = e.target.checked;
      if (bgPicker) bgPicker.disabled = e.target.checked;
      if (bgHex) bgHex.disabled = e.target.checked;
      if (wrapper) {
        wrapper.classList.toggle('transparent-bg', e.target.checked);
        wrapper.style.backgroundColor = e.target.checked ? '#ffffff' : state.qrStudio.bgcolor;
      }
      triggerQrRender();
    });
  }
}

function bindDownloads() {
  ['png', 'svg', 'jpg'].forEach((fmt) => {
    const btn = document.getElementById(`qrDownload${fmt.toUpperCase()}`);
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          const params = getQrRenderParams();
          params.imagetype = fmt;
          const blob = await renderBarcodeBlob(params);
          triggerBlobDownload(blob, `qrcode_studio.${fmt}`);
          showToast(`Downloaded QR Code (${fmt.toUpperCase()}).`, 'success');
        } catch (err) {
          showToast(`Download failed: ${err.message}`, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }
  });
}

function triggerQrRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const target = document.getElementById('qrStudioRenderImg');
    if (!target) return;

    try {
      const params = getQrRenderParams();
      const result = await renderBarcodeBase64(params);
      target.src = `data:${result.mime};base64,${result.base64}`;
    } catch (err) {
      console.warn('QR Studio render error:', err);
    }
  }, 100);
}

function getQrRenderParams() {
  const s = state.qrStudio;
  const dpi = s.size >= 1200 ? 300 : 96;
  return {
    code: 'QRCode',
    data: s.data || 'https://www.tec-it.com',
    imagetype: 'png',
    dpi,
    eclevel: s.eclevel,
    transparent: Boolean(s.transparent),
    bgcolor: s.transparent ? 'none' : s.bgcolor,
    color: s.color,
  };
}
