import { parseEscapeSequences } from './formatters.js';

/** Standard GS1 fixed-length AI prefix table (2, 3, or 4 digit prefixes -> total payload length excluding AI). */
const GS1_FIXED_AI_LEN = new Map([
  ['00', 18], ['01', 14], ['02', 14], ['03', 14], ['04', 16],
  ['11', 6], ['12', 6], ['13', 6], ['14', 6], ['15', 6], ['16', 6], ['17', 6],
  ['18', 6], ['19', 6], ['20', 2],
  ['410', 13], ['411', 13], ['412', 13], ['413', 13], ['414', 13], ['415', 13], ['416', 13], ['417', 13],
]);

// AIs 310x–369x have 4-digit AI + 6-digit payload
function getFixedAiDataLength(ai) {
  if (GS1_FIXED_AI_LEN.has(ai)) return GS1_FIXED_AI_LEN.get(ai);
  if (/^3[1-6]\d\d$/.test(ai)) return 6;
  return null;
}

/** Compute GS1 Mod-10 check digit for a numeric digit string (excluding check digit). */
export function computeGs1CheckDigit(digits) {
  const clean = String(digits).replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const d = Number(clean[clean.length - 1 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

/** Normalize 13 or 14 digit GTIN input into 14-digit GTIN string. */
function normalizeGtin14(raw) {
  const digits = String(raw || '').replace(/^\(01\)/, '').replace(/\D/g, '');
  if (digits.length === 14) return digits;
  if (digits.length === 13) return `${digits}${computeGs1CheckDigit(digits)}`;
  if (digits.length === 12) {
    const padded = `0${digits}`;
    return `${padded}${computeGs1CheckDigit(padded)}`;
  }
  return digits.padStart(14, '0').slice(0, 14);
}

/**
 * Convert TEC-IT unparenthesized GS1 strings (with \F / \x1D separators) into BWIPP (AI)val syntax.
 * Falls back cleanly to raw FNC1 Code-128 mode if non-AI arbitrary text is provided.
 */
function toBwippGs1(text, defaultBcid) {
  const raw = String(text ?? '');
  if (/^\(\d{2,4}\)/.test(raw)) {
    return { bcid: defaultBcid, text: raw, extraOpts: {} };
  }

  // Split by GS (\x1D)
  const segments = raw.split('\x1D').filter(Boolean);
  const parsed = [];
  let valid = segments.length > 0;

  for (const seg of segments) {
    let pos = 0;
    while (pos < seg.length) {
      const two = seg.slice(pos, pos + 2);
      const three = seg.slice(pos, pos + 3);
      const four = seg.slice(pos, pos + 4);
      let ai = null;
      let fixedLen = null;

      if (getFixedAiDataLength(two) !== null) {
        ai = two;
        fixedLen = getFixedAiDataLength(two);
      } else if (getFixedAiDataLength(three) !== null) {
        ai = three;
        fixedLen = getFixedAiDataLength(three);
      } else if (getFixedAiDataLength(four) !== null) {
        ai = four;
        fixedLen = getFixedAiDataLength(four);
      }

      if (ai && fixedLen !== null && pos + ai.length + fixedLen <= seg.length) {
        const val = seg.slice(pos + ai.length, pos + ai.length + fixedLen);
        parsed.push(`(${ai})${val}`);
        pos += ai.length + fixedLen;
        continue;
      }

      // Variable-length AI up to end of segment (GS boundary)
      const varMatch = seg.slice(pos).match(/^(8200|800[1-9]|801\d|8020|811\d|700\d|71\d|72\d|42\d|40\d|25\d|24\d|30|37|9\d|10|21|22|235)(.+)$/);
      if (varMatch) {
        parsed.push(`(${varMatch[1]})${varMatch[2]}`);
        pos = seg.length;
        continue;
      }

      valid = false;
      break;
    }
    if (!valid) break;
  }

  if (valid && parsed.length > 0) {
    return { bcid: defaultBcid, text: parsed.join(''), extraOpts: {} };
  }

  // Fallback for arbitrary TEC-IT GS1 strings without strict AIs on GS1-128: encode FNC1 directly
  if (defaultBcid === 'gs1-128') {
    const fnc1Text = `^FNC1${raw.replace(/\x1D/g, '^FNC1')}`;
    return { bcid: 'code128', text: fnc1Text, extraOpts: { parse: true } };
  }
  return { bcid: defaultBcid, text: raw, extraOpts: {} };
}

/**
 * Korean Postal Authority 3-of-5 bar-width pattern generator (for bwip-js 'raw' encoder).
 * Encodes 6 digits + Mod-10 check digit using standard Korea Post 5-bar / 2-wide weights.
 */
const KOREA_POST_PATTERNS = {
  '0': '11331', '1': '31113', '2': '13113', '3': '33111', '4': '11313',
  '5': '31311', '6': '13311', '7': '11133', '8': '31131', '9': '13131',
};

function encodeKoreanPostalRaw(input) {
  const digits = String(input || '').replace(/[^0-9]/g, '');
  if (digits.length !== 6) {
    throw new Error('Korean Postal Authority Code requires exactly 6 digits (e.g. 123456 or 123-456).');
  }
  const sum = Array.from(digits).reduce((acc, d) => acc + Number(d), 0);
  const check = String((10 - (sum % 10)) % 10);
  const allDigits = `${digits}${check}`;

  // Start guard (31) + digit bars interleaved with narrow (1) spaces + stop guard (13)
  let rawPattern = '31';
  for (const ch of allDigits) {
    const pat = KOREA_POST_PATTERNS[ch];
    for (const w of pat) {
      rawPattern += `1${w}`;
    }
  }
  rawPattern += '13';
  return rawPattern;
}

/** Format 9/12/13-digit numeric ISSN (e.g. 977123456700) into BWIPP XXXX-XXXX [NN] format. */
function formatIssn(raw) {
  const trimmed = String(raw || '').trim();
  if (/^\d{4}-\d{3}[\dX](\s+\d{2}(\s+\d{2})?)?$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const digits = trimmed.replace(/[^0-9X]/gi, '');
  let base7 = '';
  let addon = '';
  if (digits.startsWith('977') && digits.length >= 10) {
    base7 = digits.slice(3, 10);
    if (digits.length >= 14) addon = digits.slice(12, 14);
    else if (digits.length === 12) addon = digits.slice(10, 12);
  } else if (digits.length >= 7) {
    base7 = digits.slice(0, 7);
    if (digits.length >= 11) addon = digits.slice(9, 11);
    else if (digits.length === 9) addon = digits.slice(7, 9);
  }
  if (base7.length === 7) {
    let weighted = 0;
    for (let i = 0; i < 7; i += 1) {
      weighted += Number(base7[i]) * (8 - i);
    }
    const rem = weighted % 11;
    const chk = rem === 0 ? '0' : rem === 1 ? 'X' : String(11 - rem);
    const formatted = `${base7.slice(0, 4)}-${base7.slice(4)}${chk}`;
    return addon ? `${formatted} 00 ${addon}` : formatted;
  }
  return trimmed;
}

/** Format raw 12/13/18-digit ISBN into hyphenated BWIPP format when hyphens are omitted. */
function formatIsbn(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.includes('-')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 18) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12, 13)} ${digits.slice(13)}`;
  }
  return trimmed;
}

/** Format raw 12/13-digit ISMN into hyphenated 979-0-xxxx-xxxx-x when hyphens are omitted. */
function formatIsmn(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.includes('-')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('9790')) {
    return `979-0-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  if (digits.length === 12 && digits.startsWith('9790')) {
    const chk = computeGs1CheckDigit(digits);
    return `979-0-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${chk}`;
  }
  return trimmed;
}

/** Wrap Mobile Tagging templates for QR Code, Data Matrix, and Aztec. */
function applyMobileTemplate(key, data) {
  const val = String(data ?? '').trim();
  switch (key) {
    case 'Url':
    case 'FacebookLike':
    case 'LinkedInShare':
      return /^https?:\/\//i.test(val) ? val : `https://${val}`;
    case 'Phone':
      return val.startsWith('tel:') ? val : `tel:${val}`;
    case 'SMS': {
      if (val.toUpperCase().startsWith('SMSTO:')) return val;
      const sep = val.indexOf(':');
      if (sep >= 0) return `SMSTO:${val.slice(0, sep)}:${val.slice(sep + 1)}`;
      return `SMSTO:${val}:`;
    }
    case 'TwitterProfile':
      return val.startsWith('http') ? val : `https://twitter.com/${val.replace(/^@/, '')}`;
    case 'TwitterStatus':
      return val.startsWith('http') ? val : `https://twitter.com/intent/tweet?text=${encodeURIComponent(val)}`;
    case 'FacebookProfile':
      return val.startsWith('http') ? val : `https://www.facebook.com/${val}`;
    case 'LinkedInProfile':
      return val.startsWith('http') ? val : `https://www.linkedin.com/in/${val}`;
    case 'LinkedInCompanyProfile':
      return val.startsWith('http') ? val : `https://www.linkedin.com/company/${val}`;
    case 'AndroidMarketPubSearch':
      return val.startsWith('market://') ? val : `https://play.google.com/store/search?q=pub:${encodeURIComponent(val)}`;
    case 'AndroidMarketPackSearch':
      return val.startsWith('market://') ? val : `https://play.google.com/store/apps/details?id=${encodeURIComponent(val)}`;
    default:
      return val;
  }
}

/** Compute HIBC Mod-43 check character. */
const HIBC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
function computeHibcMod43(str) {
  let sum = 0;
  for (const ch of str.toUpperCase()) {
    const idx = HIBC_CHARSET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid HIBC character '${ch}'.`);
    sum += idx;
  }
  return HIBC_CHARSET[sum % 43];
}

/**
 * Apply symbology-specific wrappers, escape parsing, and BWIPP normalization.
 * Returns { bcid, text, extraOpts }.
 */
export function prepareSymbologyPayload(sym, rawText, { translateEsc = sym.escapeDefault } = {}) {
  const isGs1 = sym.wrapper === 'gs1' || sym.wrapper === 'uspsimpb' || sym.wrapper === 'composite-gs1';
  const textWithEsc = translateEsc
    ? parseEscapeSequences(rawText, { fnc1Token: '\x1D' })
    : String(rawText ?? '');

  let bcid = sym.bcid;
  let text = textWithEsc;
  const extraOpts = {};

  if (sym.pzn8) {
    extraOpts.pzn8 = true;
  }

  switch (sym.wrapper) {
    case 'gs1': {
      return toBwippGs1(text, bcid);
    }
    case 'uspsimpb': {
      let clean = text.trim();
      if (!/^\(/.test(clean)) {
        if (/^420\d{5}9\d{20,24}$/.test(clean)) {
          clean = `(420)${clean.slice(3, 8)}(${clean.slice(8, 10)})${clean.slice(10)}`;
        } else if (/^420\d{9}9\d{20,24}$/.test(clean)) {
          clean = `(420)${clean.slice(3, 12)}(${clean.slice(12, 14)})${clean.slice(14)}`;
        } else if (/^9\d{21,25}$/.test(clean)) {
          clean = `(${clean.slice(0, 2)})${clean.slice(2)}`;
        }
      }
      const res = toBwippGs1(clean, bcid);
      if (res.bcid === 'code128' && !clean.startsWith('^FNC1')) {
        res.text = `^FNC1${clean.replace(/\s+/g, '')}`;
        res.extraOpts = { parse: true };
      }
      return res;
    }
    case 'gtin': {
      text = `(01)${normalizeGtin14(text)}`;
      break;
    }
    case 'composite-gtin': {
      const [lin, comp = '(99)00'] = text.split('|');
      const normComp = /^\(\d{2,4}\)/.test(comp) ? comp : `(99)${comp}`;
      text = `(01)${normalizeGtin14(lin)}|${normComp}`;
      break;
    }
    case 'composite-gs1': {
      const [lin, comp = '(99)00'] = text.split('|');
      const linRes = toBwippGs1(lin, 'gs1-128');
      const compRes = toBwippGs1(comp, 'gs1-cc');
      const normComp = /^\(\d{2,4}\)/.test(compRes.text) ? compRes.text : `(99)${comp}`;
      text = `${linRes.text}|${normComp}`;
      break;
    }
    case 'composite-raw': {
      const [lin, comp = '(99)00'] = text.split('|');
      const normComp = /^\(\d{2,4}\)/.test(comp) ? comp : `(99)${comp}`;
      text = `${lin}|${normComp}`;
      break;
    }
    case 'auspost': {
      const clean = text.replace(/\D/g, '');
      if (/^\d{8}$/.test(clean)) {
        text = `11${clean}`;
      }
      break;
    }
    case 'koreanPostal': {
      text = encodeKoreanPostalRaw(text);
      break;
    }
    case 'dpd': {
      const clean = text.trim();
      if (!/^[XE][A-Z0-9]{10,}$/i.test(clean)) {
        throw new Error('DPD Barcode must start with X or E followed by alphanumeric parcel routing fields.');
      }
      text = clean;
      break;
    }
    case 'upus10': {
      const clean = text.trim().toUpperCase();
      if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(clean)) {
        throw new Error('UPU S10 requires 13 characters: 2 service letters + 9 digits + 2-letter ISO country code (e.g. EE123456785CH).');
      }
      text = clean;
      break;
    }
    case 'mailmark4': {
      extraOpts.type = text.trim().length <= 16 ? 7 : 29;
      break;
    }
    case 'ppn': {
      // IFA PPN Macro 06 Data Matrix envelope if raw 9N... provided
      if (!text.startsWith('[)>')) {
        text = `[)>\x1E06\x1D${text}\x1E\x04`;
      }
      break;
    }
    case 'hibc': {
      // BWIPP hibc* automatically adds leading '+' and trailing mod-43 check char
      text = text.trim().replace(/^\+/, '');
      break;
    }
    case 'hibc-pas': {
      const clean = text.trim().toUpperCase();
      const body = clean.startsWith('+') ? clean : `+${clean}`;
      const chk = computeHibcMod43(body);
      text = `${body}${chk}`;
      break;
    }
    case 'isbn': {
      text = formatIsbn(text);
      break;
    }
    case 'ismn': {
      text = formatIsmn(text);
      break;
    }
    case 'issn': {
      text = formatIssn(text);
      break;
    }
    default: {
      if (sym.wrapper && sym.wrapper.startsWith('mobile:')) {
        const key = sym.wrapper.slice('mobile:'.length);
        text = applyMobileTemplate(key, text);
      }
      break;
    }
  }

  return { bcid, text, extraOpts };
}
