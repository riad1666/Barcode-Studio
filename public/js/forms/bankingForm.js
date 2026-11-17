/**
 * Banking & Payment Forms (EPC QR V2, Swiss QR v2.3/v2.2, ZATCA TLV Base64)
 */

const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

export function computeMod10Recursive(digits) {
  const clean = String(digits || '').replace(/\D/g, '');
  let carry = 0;
  for (let i = 0; i < clean.length; i += 1) {
    carry = MOD10_TABLE[(carry + Number(clean[i])) % 10];
  }
  return String((10 - carry) % 10);
}

export function isValidSwissQrReference(ref) {
  const clean = String(ref || '').replace(/\s+/g, '');
  if (!/^\d{27}$/.test(clean)) return false;
  return computeMod10Recursive(clean.slice(0, 26)) === clean[26];
}

export function isQrIban(iban) {
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{19}$/.test(clean)) return false;
  const iid = Number(clean.slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

// ---------------- EPC QR V2 ----------------

export function buildEpcPayload(s) {
  const iban = String(s.IBAN || '').replace(/\s+/g, '').toUpperCase();
  const amt = String(s.Amount || '').trim();
  const formattedAmt = amt ? `EUR${Number(amt).toFixed(2)}` : '';
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    String(s.BIC || '').trim().toUpperCase(),
    String(s.Receiver || '').trim().slice(0, 70),
    iban,
    formattedAmt,
    String(s.Usage || '').trim().slice(0, 4),
    String(s.Reference || '').trim().slice(0, 35),
    String(s.Information || '').trim().slice(0, 140),
    String(s.UserHint || '').trim().slice(0, 70),
  ];
  return lines.join('\n').replace(/\n+$/, '');
}

export function renderEpcForm(container, onPayloadChange) {
  const state = {
    Receiver: 'Martian Pioneers',
    IBAN: 'DE71110220330123456789',
    BIC: 'BHBLDEHHXXX',
    Amount: '125.00',
    Usage: 'GDDS',
    Reference: 'RF18539007547034',
    Information: 'Client: Marie Louise La Lune',
    UserHint: 'Invoice 2026-99',
  };

  const update = () => {
    const payload = buildEpcPayload(state);
    onPayloadChange(payload);
  };

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="epc_receiver">Beneficiary Name (Max 70)*</label>
        <input class="input-text" id="epc_receiver" value="${state.Receiver}" maxlength="70" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="epc_iban">IBAN (SEPA)*</label>
        <input class="input-text code-font" id="epc_iban" value="${state.IBAN}" required />
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label class="form-label" for="epc_bic">BIC / SWIFT</label>
        <input class="input-text code-font" id="epc_bic" value="${state.BIC}" maxlength="11" />
      </div>
      <div class="form-group">
        <label class="form-label" for="epc_amount">Amount (EUR)</label>
        <input class="input-text" id="epc_amount" type="number" step="0.01" value="${state.Amount}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="epc_usage">Purpose Code (4 chars)</label>
        <input class="input-text code-font" id="epc_usage" value="${state.Usage}" maxlength="4" />
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="epc_ref">Creditor Reference (ISO 11649)</label>
        <input class="input-text code-font" id="epc_ref" value="${state.Reference}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="epc_info">Remittance Information</label>
        <input class="input-text" id="epc_info" value="${state.Information}" />
      </div>
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('input', (e) => {
        state[prop] = e.target.value;
        update();
      });
    }
  };

  bind('epc_receiver', 'Receiver');
  bind('epc_iban', 'IBAN');
  bind('epc_bic', 'BIC');
  bind('epc_amount', 'Amount');
  bind('epc_usage', 'Usage');
  bind('epc_ref', 'Reference');
  bind('epc_info', 'Information');

  update();
}

// ---------------- Swiss QR Code v2.3 / v2.2 ----------------

export function buildSwissPayload(s, refType = 'QRR') {
  const iban = String(s.CreditorIBAN || '').replace(/\s+/g, '').toUpperCase();
  const hasDebtor = Boolean(
    String(s.DebtorNameS || '').trim() ||
    String(s.DebtorPostalCode || '').trim() ||
    String(s.DebtorCity || '').trim(),
  );
  const amt = String(s.SwissAmount || '').trim();
  const formattedAmt = amt ? Number(amt).toFixed(2) : '';
  const refValue = refType === 'QRR'
    ? String(s.QRReference || '').replace(/\s+/g, '')
    : refType === 'SCOR'
      ? String(s.CreditorReference || '').replace(/\s+/g, '').toUpperCase()
      : '';

  const lines = [
    'SPC',
    '0200',
    '1',
    iban,
    'S',
    String(s.CreditorName || '').trim(),
    String(s.CreditorAddress1 || '').trim(),
    String(s.CreditorAddress2 || '').trim(),
    String(s.CreditorPostalCode || '').trim(),
    String(s.CreditorCity || '').trim(),
    String(s.CreditorCountry || 'CH').trim().toUpperCase(),
    '', '', '', '', '', '', '',
    formattedAmt,
    String(s.Currency || 'CHF').trim().toUpperCase(),
    hasDebtor ? 'S' : '',
    hasDebtor ? String(s.DebtorNameS || '').trim() : '',
    hasDebtor ? String(s.DebtorStreet || '').trim() : '',
    hasDebtor ? String(s.DebtorBuildingNumber || '').trim() : '',
    hasDebtor ? String(s.DebtorPostalCode || '').trim() : '',
    hasDebtor ? String(s.DebtorCity || '').trim() : '',
    hasDebtor ? String(s.DebtorCountryS || '').trim().toUpperCase() : '',
    refType,
    refValue,
    String(s.Message || '').trim(),
    'EPD',
    String(s.BillInfo || '').trim(),
  ];

  return lines.join('\r\n');
}

export function renderSwissForm(container, refType = 'QRR', onPayloadChange) {
  const isQrr = refType === 'QRR';
  const isScor = refType === 'SCOR';

  const state = {
    CreditorIBAN: isQrr ? 'CH44 3199 9123 0008 8901 2' : 'CH39 0870 4016 0754 7300 7',
    CreditorName: 'Robert Schneider AG',
    CreditorAddress1: 'Rue du Lac',
    CreditorAddress2: '1268',
    CreditorPostalCode: '2501',
    CreditorCity: 'Biel',
    CreditorCountry: 'CH',
    SwissAmount: '199.95',
    Currency: 'CHF',
    DebtorNameS: 'Pia-Maria Rutschmann-Schnyder',
    DebtorStreet: 'Grosse Marktgasse',
    DebtorBuildingNumber: '28',
    DebtorPostalCode: '9400',
    DebtorCity: 'Rorschach',
    DebtorCountryS: 'CH',
    QRReference: isQrr ? '21 00000 00003 13947 14300 09017' : '',
    CreditorReference: isScor ? 'RF18 5390 0754 7034' : '',
    Message: 'Instruction of 15.09.2019',
    BillInfo: '//S1/10/1234/11/220221',
  };

  const update = () => {
    const payload = buildSwissPayload(state, refType);
    onPayloadChange(payload);
  };

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="swiss_iban">Creditor IBAN ${isQrr ? '(QR-IBAN required)' : ''}*</label>
        <input class="input-text code-font" id="swiss_iban" value="${state.CreditorIBAN}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="swiss_name">Creditor Name*</label>
        <input class="input-text" id="swiss_name" value="${state.CreditorName}" required />
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label class="form-label" for="swiss_street">Street / Address 1</label>
        <input class="input-text" id="swiss_street" value="${state.CreditorAddress1}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="swiss_bldg">Building No / Address 2</label>
        <input class="input-text" id="swiss_bldg" value="${state.CreditorAddress2}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="swiss_city">Postal Code & City*</label>
        <div style="display:flex; gap:6px;">
          <input class="input-text" id="swiss_zip" style="width:90px;" value="${state.CreditorPostalCode}" />
          <input class="input-text" id="swiss_city" value="${state.CreditorCity}" />
        </div>
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="swiss_amount">Amount (${state.Currency})</label>
        <input class="input-text" id="swiss_amount" type="number" step="0.01" value="${state.SwissAmount}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="swiss_ref">${isQrr ? '27-Digit QR Reference (Mod-10 Check)' : isScor ? 'ISO 11649 SCOR Reference' : 'Reference'}</label>
        <input class="input-text code-font" id="swiss_ref" value="${isQrr ? state.QRReference : state.CreditorReference}" />
      </div>
    </div>
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="swiss_debtor_name">Debtor Name</label>
        <input class="input-text" id="swiss_debtor_name" value="${state.DebtorNameS}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="swiss_msg">Unstructured Message</label>
        <input class="input-text" id="swiss_msg" value="${state.Message}" />
      </div>
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('input', (e) => {
        state[prop] = e.target.value;
        update();
      });
    }
  };

  bind('swiss_iban', 'CreditorIBAN');
  bind('swiss_name', 'CreditorName');
  bind('swiss_street', 'CreditorAddress1');
  bind('swiss_bldg', 'CreditorAddress2');
  bind('swiss_zip', 'CreditorPostalCode');
  bind('swiss_city', 'CreditorCity');
  bind('swiss_amount', 'SwissAmount');
  if (isQrr) bind('swiss_ref', 'QRReference');
  else if (isScor) bind('swiss_ref', 'CreditorReference');
  bind('swiss_debtor_name', 'DebtorNameS');
  bind('swiss_msg', 'Message');

  update();
}

// ---------------- ZATCA QR Code (Saudi Arabia FATOORAH) ----------------

export function buildZatcaPayload(s) {
  const fields = [
    [1, s.Seller],
    [2, s.VATNumber],
    [3, s.EITimeStamp],
    [4, s.Invoice],
    [5, s.VAT],
  ];
  const encoder = new TextEncoder();
  const chunks = [];
  let totalLen = 0;

  for (const [tag, rawVal] of fields) {
    const val = String(rawVal || '').trim();
    if (!val) continue;
    const bytes = encoder.encode(val);
    const tlv = new Uint8Array(2 + bytes.length);
    tlv[0] = tag;
    tlv[1] = bytes.length;
    tlv.set(bytes, 2);
    chunks.push(tlv);
    totalLen += tlv.length;
  }

  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  let binary = '';
  for (let i = 0; i < combined.length; i += 1) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export function renderZatcaForm(container, onPayloadChange) {
  const state = {
    Seller: 'Bobs Records',
    VATNumber: '310122393500003',
    EITimeStamp: '2026-11-16T15:30:00Z',
    Invoice: '1006.25',
    VAT: '131.25',
  };

  const update = () => {
    try {
      const payload = buildZatcaPayload(state);
      onPayloadChange(payload);
    } catch (err) {
      console.warn('ZATCA encoding error:', err);
    }
  };

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="zatca_seller">Seller Name (English / Arabic)*</label>
        <input class="input-text" id="zatca_seller" value="${state.Seller}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="zatca_vat">VAT Registration Number (15 digits)*</label>
        <input class="input-text code-font" id="zatca_vat" value="${state.VATNumber}" maxlength="15" required />
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label class="form-label" for="zatca_time">Invoice Timestamp (ISO-8601)*</label>
        <input class="input-text code-font" id="zatca_time" value="${state.EITimeStamp}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="zatca_total">Invoice Total (with VAT)*</label>
        <input class="input-text" id="zatca_total" type="number" step="0.01" value="${state.Invoice}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="zatca_vat_total">VAT Total Amount*</label>
        <input class="input-text" id="zatca_vat_total" type="number" step="0.01" value="${state.VAT}" required />
      </div>
    </div>
  `;

  const bind = (id, prop) => {
    const el = container.querySelector(`#${id}`);
    if (el) {
      el.addEventListener('input', (e) => {
        state[prop] = e.target.value;
        update();
      });
    }
  };

  bind('zatca_seller', 'Seller');
  bind('zatca_vat', 'VATNumber');
  bind('zatca_time', 'EITimeStamp');
  bind('zatca_total', 'Invoice');
  bind('zatca_vat_total', 'VAT');

  update();
}
