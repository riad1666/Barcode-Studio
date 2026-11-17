/**
 * Structured payload builders for Business Cards (vCard 3.0 & MeCard),
 * Events (VEVENT), and Wi-Fi credentials.
 */

export function defaultVCardState() {
  return {
    Prefix: '',
    FirstName: 'John',
    LastName: 'Doe',
    PhoneNumber: '0043-7252-72720',
    PhoneNumberWork: '0043-7252-72720',
    Email: 'email@example.com',
    Organization: 'TEC-IT',
    Title: '',
    Birthday: '',
    Address: '',
    Url: 'https://www.example.com',
  };
}

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
  if (s.Birthday) lines.push(`BDAY:${String(s.Birthday).trim()}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export function defaultMeCardState() {
  return {
    Name: 'John Doe',
    Nickname: '',
    PhoneNumber: '0043-7252-72720',
    Reading: '',
    Email: 'email@example.com',
    Memo: 'Contoso',
    Url: 'https://www.example.com',
    Address: '',
    Birthday: '',
  };
}

function escapeMeCard(v) {
  return String(v || '').trim().replace(/([\\;:,])/g, '\\$1');
}

export function buildMeCardPayload(s) {
  const parts = [`N:${escapeMeCard(s.Name)}`];
  if (s.Reading) parts.push(`SOUND:${escapeMeCard(s.Reading)}`);
  if (s.PhoneNumber) parts.push(`TEL:${escapeMeCard(s.PhoneNumber)}`);
  if (s.Email) parts.push(`EMAIL:${escapeMeCard(s.Email)}`);
  if (s.Memo) parts.push(`NOTE:${escapeMeCard(s.Memo)}`);
  if (s.Birthday) parts.push(`BDAY:${escapeMeCard(s.Birthday).replace(/-/g, '')}`);
  if (s.Address) parts.push(`ADR:${escapeMeCard(s.Address)}`);
  if (s.Url) parts.push(`URL:${escapeMeCard(s.Url)}`);
  if (s.Nickname) parts.push(`NICKNAME:${escapeMeCard(s.Nickname)}`);
  return `MECARD:${parts.join(';')};;`;
}

export function defaultEventState() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  return {
    Summary: 'My Event',
    Description: 'Description',
    Location: 'Location',
    DateStart: dateStr,
    TimeStart: timeStr,
    DateEnd: '',
    TimeEnd: '',
  };
}

function toIcsTimestamp(dateStr, timeStr) {
  const cleanDate = String(dateStr || '').trim();
  if (!cleanDate) return '';
  let y = '';
  let m = '';
  let d = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    [y, m, d] = cleanDate.split('-');
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
    const [mm, dd, yy] = cleanDate.split('/');
    y = yy;
    m = mm.padStart(2, '0');
    d = dd.padStart(2, '0');
  } else {
    return cleanDate.replace(/[-/:]/g, '');
  }
  const t = String(timeStr || '00:00:00').replace(/:/g, '').padEnd(6, '0').slice(0, 6);
  return `${y}${m}${d}T${t}`;
}

export function buildEventPayload(s) {
  const dtStart = toIcsTimestamp(s.DateStart, s.TimeStart);
  const dtEnd = s.DateEnd ? toIcsTimestamp(s.DateEnd, s.TimeEnd || s.TimeStart) : dtStart;
  const lines = ['BEGIN:VEVENT'];
  if (s.Summary) lines.push(`SUMMARY:${String(s.Summary).trim()}`);
  if (s.Description) lines.push(`DESCRIPTION:${String(s.Description).trim()}`);
  if (s.Location) lines.push(`LOCATION:${String(s.Location).trim()}`);
  if (dtStart) lines.push(`DTSTART:${dtStart}`);
  if (dtEnd) lines.push(`DTEND:${dtEnd}`);
  lines.push('END:VEVENT');
  return lines.join('\n');
}

export function defaultWifiState() {
  return {
    Authentication: 'WPA',
    SSID: 'MyNetwork',
    IsHidden: false,
    Password: 'MySecretPassword',
  };
}

function escapeWifi(v) {
  return String(v || '').replace(/([\\;,:"])/g, '\\$1');
}

export function buildWifiPayload(s) {
  const auth = s.Authentication || 'WPA';
  const ssid = escapeWifi(s.SSID);
  const pass = auth === 'nopass' ? '' : escapeWifi(s.Password);
  const hidden = s.IsHidden ? 'true' : 'false';
  return `WIFI:T:${auth};S:${ssid};P:${pass};H:${hidden};;`;
}
