/**
 * Tagging and Mobile Forms: vCard 3.0, MeCard, VEVENT, Wi-Fi
 */

// ---------------- vCard 3.0 ----------------

export function buildVCardPayload(s) {
  const fn = [s.Prefix, s.FirstName, s.LastName].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
  const n = `${String(s.LastName || '').trim()};${String(s.FirstName || '').trim()};;${String(s.Prefix || '').trim()};`;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${n}`];
  if (fn) lines.push(`FN:${fn}`);
  if (s.Organization) lines.push(`ORG:${String(s.Organization).trim()}`);
  if (s.Title) lines.push(`TITLE:${String(s.Title).trim()}`);
  if (s.PhoneNumber) lines.push(`TEL;TYPE=CELL:${String(s.PhoneNumber).trim()}`);
  if (s.PhoneNumberWork) lines.push(`TEL;TYPE=WORK:${String(s.PhoneNumberWork).trim()}`);
  if (s.Email) lines.push(`EMAIL:${String(s.Email).trim()}`);
  if (s.Url) lines.push(`URL:${String(s.Url).trim()}`);
  if (s.Address) lines.push(`ADR;TYPE=WORK:;;${String(s.Address).trim()};;;;`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export function renderVCardForm(container, onPayloadChange) {
  const state = {
    FirstName: 'John',
    LastName: 'Doe',
    Organization: 'TEC-IT',
    Title: 'Lead Engineer',
    PhoneNumber: '0043-7252-72720',
    Email: 'john.doe@example.com',
    Url: 'https://www.tec-it.com',
    Address: 'Steyr, Austria',
  };

  const update = () => onPayloadChange(buildVCardPayload(state));

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="vcard_fname">First Name</label>
        <input class="input-text" id="vcard_fname" value="${state.FirstName}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="vcard_lname">Last Name</label>
        <input class="input-text" id="vcard_lname" value="${state.LastName}" />
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="vcard_org">Organization / Company</label>
        <input class="input-text" id="vcard_org" value="${state.Organization}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="vcard_title">Job Title / Position</label>
        <input class="input-text" id="vcard_title" value="${state.Title}" />
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="vcard_phone">Mobile / Phone</label>
        <input class="input-text" id="vcard_phone" value="${state.PhoneNumber}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="vcard_email">Email Address</label>
        <input class="input-text" id="vcard_email" type="email" value="${state.Email}" />
      </div>
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) el.addEventListener('input', (e) => { state[prop] = e.target.value; update(); });
  };
  bind('vcard_fname', 'FirstName');
  bind('vcard_lname', 'LastName');
  bind('vcard_org', 'Organization');
  bind('vcard_title', 'Title');
  bind('vcard_phone', 'PhoneNumber');
  bind('vcard_email', 'Email');

  update();
}

// ---------------- MeCard ----------------

export function buildMeCardPayload(s) {
  const parts = [`N:${String(s.Name || '').replace(/([\\;:,])/g, '\\$1')}`];
  if (s.PhoneNumber) parts.push(`TEL:${String(s.PhoneNumber).replace(/([\\;:,])/g, '\\$1')}`);
  if (s.Email) parts.push(`EMAIL:${String(s.Email).replace(/([\\;:,])/g, '\\$1')}`);
  if (s.Memo) parts.push(`NOTE:${String(s.Memo).replace(/([\\;:,])/g, '\\$1')}`);
  if (s.Url) parts.push(`URL:${String(s.Url).replace(/([\\;:,])/g, '\\$1')}`);
  return `MECARD:${parts.join(';')};;`;
}

export function renderMeCardForm(container, onPayloadChange) {
  const state = {
    Name: 'John Doe',
    PhoneNumber: '0043-7252-72720',
    Email: 'email@example.com',
    Memo: 'Contoso',
    Url: 'https://www.example.com',
  };

  const update = () => onPayloadChange(buildMeCardPayload(state));

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="mecard_name">Full Name</label>
        <input class="input-text" id="mecard_name" value="${state.Name}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="mecard_phone">Phone</label>
        <input class="input-text" id="mecard_phone" value="${state.PhoneNumber}" />
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="mecard_email">Email</label>
        <input class="input-text" id="mecard_email" type="email" value="${state.Email}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="mecard_memo">Note / Memo</label>
        <input class="input-text" id="mecard_memo" value="${state.Memo}" />
      </div>
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) el.addEventListener('input', (e) => { state[prop] = e.target.value; update(); });
  };
  bind('mecard_name', 'Name');
  bind('mecard_phone', 'PhoneNumber');
  bind('mecard_email', 'Email');
  bind('mecard_memo', 'Memo');

  update();
}

// ---------------- Wi-Fi ----------------

export function buildWifiPayload(s) {
  const auth = s.Authentication || 'WPA';
  const ssid = String(s.SSID || '').replace(/([\\;,:"])/g, '\\$1');
  const pass = auth === 'nopass' ? '' : String(s.Password || '').replace(/([\\;,:"])/g, '\\$1');
  const hidden = s.IsHidden ? 'true' : 'false';
  return `WIFI:T:${auth};S:${ssid};P:${pass};H:${hidden};;`;
}

export function renderWifiForm(container, onPayloadChange) {
  const state = {
    Authentication: 'WPA',
    SSID: 'Office-Network',
    Password: 'SuperSecretPassword',
    IsHidden: false,
  };

  const update = () => onPayloadChange(buildWifiPayload(state));

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="wifi_ssid">Network Name (SSID)*</label>
        <input class="input-text" id="wifi_ssid" value="${state.SSID}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="wifi_auth">Encryption Type</label>
        <select class="input-select" id="wifi_auth">
          <option value="WPA" selected>WPA / WPA2 / WPA3</option>
          <option value="WEP">WEP</option>
          <option value="nopass">None (Open Network)</option>
        </select>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="wifi_pass">Network Password</label>
        <input class="input-text" id="wifi_pass" type="password" value="${state.Password}" />
      </div>
      <div class="form-group" style="justify-content:center; margin-top:20px;">
        <label class="checkbox-item">
          <input type="checkbox" id="wifi_hidden" />
          <span>Hidden Network (Do not broadcast SSID)</span>
        </label>
      </div>
    </div>
  `;

  const ssidEl = container.querySelector('#wifi_ssid');
  const authEl = container.querySelector('#wifi_auth');
  const passEl = container.querySelector('#wifi_pass');
  const hiddenEl = container.querySelector('#wifi_hidden');

  if (ssidEl) ssidEl.addEventListener('input', (e) => { state.SSID = e.target.value; update(); });
  if (authEl) authEl.addEventListener('change', (e) => { state.Authentication = e.target.value; update(); });
  if (passEl) passEl.addEventListener('input', (e) => { state.Password = e.target.value; update(); });
  if (hiddenEl) hiddenEl.addEventListener('change', (e) => { state.IsHidden = e.target.checked; update(); });

  update();
}

// ---------------- VEVENT (Calendar Event) ----------------

export function buildEventPayload(s) {
  const lines = [
    'BEGIN:VEVENT',
    `SUMMARY:${String(s.Summary || '').trim()}`,
    `DESCRIPTION:${String(s.Description || '').trim()}`,
    `LOCATION:${String(s.Location || '').trim()}`,
    `DTSTART:${String(s.DateStart || '').replace(/[-:]/g, '')}`,
    `DTEND:${String(s.DateEnd || s.DateStart || '').replace(/[-:]/g, '')}`,
    'END:VEVENT',
  ];
  return lines.join('\n');
}

export function renderEventForm(container, onPayloadChange) {
  const state = {
    Summary: 'Engineering Team Sync',
    Description: 'Quarterly architecture and roadmap review',
    Location: 'Zurich Tech Lab & Online',
    DateStart: '20261117T100000',
    DateEnd: '20261117T113000',
  };

  const update = () => onPayloadChange(buildEventPayload(state));

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="event_sum">Event Title (Summary)*</label>
        <input class="input-text" id="event_sum" value="${state.Summary}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="event_loc">Location</label>
        <input class="input-text" id="event_loc" value="${state.Location}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="event_desc">Description</label>
      <input class="input-text" id="event_desc" value="${state.Description}" />
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) el.addEventListener('input', (e) => { state[prop] = e.target.value; update(); });
  };
  bind('event_sum', 'Summary');
  bind('event_loc', 'Location');
  bind('event_desc', 'Description');

  update();
}
