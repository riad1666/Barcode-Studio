/**
 * Banking & Payment QR builders and validators:
 * - EPC QR Code V2 (SEPA Credit Transfer)
 * - Swiss QR Code v2.3 & v2.2 (NON, SCOR, QRR) with Mod-10 recursive check digit & QR-IBAN validation
 * - ZATCA QR Code (Saudi KSA FATOORAH TLV Base64)
 */

// ---------------- EPC QR Code V2 ----------------

export function defaultEpcState() {
  return {
    Receiver: 'Martian Pioneers',
    IBAN: 'DE71110220330123456789',
    BIC: 'BHBLDEHHXXX',
    Amount: '',
    Usage: '',
    Reference: '',
    Information: 'Client:Marie Louise La Lune',
    UserHint: 'Emergency aid donation',
  };
}

export function validateEpcState(s) {
  const errors = {};
  if (!String(s.Receiver || '').trim()) errors.Receiver = 'Name of Beneficiary is required.';
  const iban = String(s.IBAN || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    errors.IBAN = 'Enter a valid IBAN (e.g. DE71110220330123456789).';
  }
  const amt = String(s.Amount || '').trim();
  if (amt && (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0 || Number(amt) > 999999999.99)) {
    errors.Amount = 'Amount must be between 0.01 and 999999999.99.';
  }
  return errors;
}

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

// ---------------- Swiss QR Code (v2.3 & v2.2) ----------------

const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];

/** Compute Mod-10 recursive check digit used for Swiss QR References (26 data digits + 1 check digit). */
export function computeMod10Recursive(digits) {
  const clean = String(digits || '').replace(/\D/g, '');
  let carry = 0;
  for (let i = 0; i < clean.length; i += 1) {
    carry = MOD10_TABLE[(carry + Number(clean[i])) % 10];
  }
  return String((10 - carry) % 10);
}

/** Validate 27-digit Swiss QR Reference check digit. */
export function isValidSwissQrReference(ref) {
  const clean = String(ref || '').replace(/\s+/g, '');
  if (!/^\d{27}$/.test(clean)) return false;
  return computeMod10Recursive(clean.slice(0, 26)) === clean[26];
}

/** Check whether a Swiss/Liechtenstein IBAN is a QR-IBAN (IID 30000–31999). */
export function isQrIban(iban) {
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{19}$/.test(clean)) return false;
  const iid = Number(clean.slice(4, 9));
  return iid >= 30000 && iid <= 31999;
}

export function defaultSwissState(refType = 'QRR') {
  const isQrr = refType === 'QRR';
  const isScor = refType === 'SCOR';
  return {
    CreditorIBAN: isQrr ? 'CH44 3199 9123 0008 8901 2' : 'CH39 0870 4016 0754 7300 7',
    CreditorName: 'Robert Schneider AG',
    CreditorAddress1: 'Rue du Lac',
    CreditorAddress2: '1268',
    CreditorPostalCode: '2501',
    CreditorCity: 'Biel',
    CreditorCountry: 'CH',
    SwissAmount: '',
    Currency: 'CHF',
    DebtorNameS: isQrr || isScor ? 'Pia-Maria Rutschmann-Schnyder' : '',
    DebtorStreet: isQrr || isScor ? 'Grosse Marktgasse' : '',
    DebtorBuildingNumber: isQrr || isScor ? '28' : '',
    DebtorPostalCode: isQrr || isScor ? '9400' : '',
    DebtorCity: isQrr || isScor ? 'Rorschach' : '',
    DebtorCountryS: isQrr || isScor ? 'CH' : '',
    ReferenceType: refType,
    QRReference: isQrr ? '21 00000 00003 13947 14300 09017' : '',
    CreditorReference: isScor ? 'RF18 5390 0754 7034' : '',
    Message: isQrr ? 'Instruction of 15.09.2019' : '',
    BillInfo: isQrr ? '//S1/10/1234/11/220221/30/102673386/32/7.7/40/0:30' : '',
    Parameter1: isQrr ? 'eBill/B/empfaenger@email.com/12345678' : '',
    Parameter2: '',
  };
}

export function validateSwissState(s, refType = 'NON') {
  const errors = {};
  const iban = String(s.CreditorIBAN || '').replace(/\s+/g, '').toUpperCase();
  if (!/^(CH|LI)\d{19}$/.test(iban)) {
    errors.CreditorIBAN = 'Must be a valid 21-character CH or LI IBAN.';
  } else if (refType === 'QRR' && !isQrIban(iban)) {
    errors.CreditorIBAN = 'QR Reference (QRR) requires a QR-IBAN (IID 30000–31999 at positions 5–9).';
  } else if (refType !== 'QRR' && isQrIban(iban)) {
    errors.CreditorIBAN = 'QR-IBAN is only valid with QR Reference (QRR).';
  }

  if (!String(s.CreditorName || '').trim()) errors.CreditorName = 'Creditor Name is required.';
  if (!String(s.CreditorPostalCode || '').trim()) errors.CreditorPostalCode = 'Postal Code is required.';
  if (!String(s.CreditorCity || '').trim()) errors.CreditorCity = 'Town/City is required.';
  if (!/^[A-Z]{2}$/i.test(String(s.CreditorCountry || '').trim())) {
    errors.CreditorCountry = '2-letter ISO country code is required.';
  }

  const amt = String(s.SwissAmount || '').trim();
  if (amt && (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) < 0)) {
    errors.SwissAmount = 'Amount must be a non-negative decimal (up to 2 decimal places).';
  }

  if (refType === 'QRR') {
    const qrr = String(s.QRReference || '').replace(/\s+/g, '');
    if (!/^\d{27}$/.test(qrr)) {
      errors.QRReference = 'QR Reference must contain 27 digits.';
    } else if (!isValidSwissQrReference(qrr)) {
      errors.QRReference = 'Invalid Mod-10 recursive check digit in 27-digit QR Reference.';
    }
  } else if (refType === 'SCOR') {
    const scor = String(s.CreditorReference || '').replace(/\s+/g, '').toUpperCase();
    if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(scor)) {
      errors.CreditorReference = 'Creditor Reference must follow ISO 11649 (RFxx...).';
    }
  }

  return errors;
}

export function buildSwissPayload(s, refType = 'NON') {
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
    // Ultimate creditor (7 empty lines)
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
    String(s.Parameter1 || '').trim(),
    String(s.Parameter2 || '').trim(),
  ];

  // Trim trailing empty alternative scheme lines if unused
  while (lines.length > 31 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\r\n');
}

// ---------------- ZATCA QR Code (Saudi KSA TLV Base64) ----------------

export function defaultZatcaState() {
  return {
    Seller: 'Bobs Records',
    VATNumber: '310122393500003',
    EITimeStamp: '2022-04-25T15:30:00Z',
    Invoice: '1006.25',
    VAT: '131.25',
    XMLHash: '',
    ECDSASignature: '',
    ECDSAPublicKey: '',
    ECDSASignature2: '',
  };
}

export function validateZatcaState(s) {
  const errors = {};
  if (!String(s.Seller || '').trim()) errors.Seller = "Seller's Name is required.";
  if (!/^\d{15}$/.test(String(s.VATNumber || '').trim())) {
    errors.VATNumber = 'VAT Registration Number must be 15 digits.';
  }
  if (!String(s.EITimeStamp || '').trim()) errors.EITimeStamp = 'Timestamp is required (ISO-8601).';
  if (!/^\d+(\.\d{1,2})?$/.test(String(s.Invoice || '').trim())) errors.Invoice = 'Invoice Total must be numeric.';
  if (!/^\d+(\.\d{1,2})?$/.test(String(s.VAT || '').trim())) errors.VAT = 'VAT Total must be numeric.';
  return errors;
}

/** Encode ZATCA Tags 1–9 into TLV binary bytes and return Base64 string (isomorphic Node & Browser). */
export function buildZatcaPayload(s) {
  const fields = [
    [1, s.Seller],
    [2, s.VATNumber],
    [3, s.EITimeStamp],
    [4, s.Invoice],
    [5, s.VAT],
    [6, s.XMLHash],
    [7, s.ECDSASignature],
    [8, s.ECDSAPublicKey],
    [9, s.ECDSASignature2],
  ];
  const encoder = new TextEncoder();
  const chunks = [];
  let totalLen = 0;

  for (const [tag, rawVal] of fields) {
    const val = String(rawVal || '').trim();
    if (!val) continue;
    const bytes = encoder.encode(val);
    if (bytes.length > 255) {
      throw new Error(`ZATCA TLV field tag ${tag} exceeds 255 UTF-8 bytes.`);
    }
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
