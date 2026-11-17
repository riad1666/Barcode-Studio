import iconv from 'iconv-lite';
import { CODE_PAGES } from './catalog.js';

const CODE_PAGE_MAP = new Map(CODE_PAGES.map((cp) => [cp.value.toLowerCase(), cp.encoding]));

/**
 * Translate TEC-IT escape sequences (\F, \t, \n, \r, \\, \xHH).
 * When `fnc1Token` is specified (e.g. '^FNC1' or '\x1D'), \F maps to that token.
 */
export function parseEscapeSequences(text, { fnc1Token = '\x1D' } = {}) {
  if (typeof text !== 'string' || !text.includes('\\')) {
    return String(text ?? '');
  }
  return text.replace(/\\(x[0-9a-fA-F]{2}|[Ftnr\\])/g, (match, code) => {
    if (code === 'F') return fnc1Token;
    if (code === 't') return '\t';
    if (code === 'n') return '\n';
    if (code === 'r') return '\r';
    if (code === '\\') return '\\';
    if (code.startsWith('x')) {
      return String.fromCharCode(parseInt(code.slice(1), 16));
    }
    return match;
  });
}

/**
 * Format a single sequence integer using TEC-IT placeholder rules:
 * '$' = leading zero, '#' = leading space, '*' = leading asterisk; other chars literal.
 */
export function formatSequenceValue(num, mask = '$$$$') {
  const digits = String(num);
  if (!mask || !/[$#*]/.test(mask)) {
    return digits;
  }

  const chars = Array.from(mask);
  const placeholderIndices = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === '$' || chars[i] === '#' || chars[i] === '*') {
      placeholderIndices.push(i);
    }
  }

  // If number has more digits than placeholders, prepend overflow before first placeholder.
  let digitCursor = digits.length - 1;
  for (let p = placeholderIndices.length - 1; p >= 0; p -= 1) {
    const idx = placeholderIndices[p];
    const padChar = chars[idx] === '$' ? '0' : chars[idx] === '#' ? ' ' : '*';
    if (digitCursor >= 0) {
      chars[idx] = digits[digitCursor];
      digitCursor -= 1;
    } else {
      chars[idx] = padChar;
    }
  }

  if (digitCursor >= 0) {
    const overflow = digits.slice(0, digitCursor + 1);
    const firstIdx = placeholderIndices[0];
    chars.splice(firstIdx, 0, overflow);
  }

  return chars.join('');
}

/**
 * Generate a sequence array of strings from TEC-IT sequence parameters.
 * Removes TEC-IT's 10-barcode limit while capping at maxCount (default 2000) for safety.
 */
export function generateSequence({
  prefix = '',
  suffix = '',
  start = 10,
  end = 100,
  increment = 10,
  mask = '$$$$',
  maxCount = 2000,
} = {}) {
  const s = Number(start);
  const e = Number(end);
  const inc = Number(increment);

  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(inc)) {
    throw new Error('Start, End, and Increment must be valid numbers.');
  }
  if (inc <= 0) {
    throw new Error('Increment must be greater than 0.');
  }
  if (e < s) {
    throw new Error('End Value must be greater than or equal to Start Value.');
  }

  const rows = [];
  for (let val = s; val <= e; val += inc) {
    if (rows.length >= maxCount) {
      break;
    }
    rows.push(`${prefix ?? ''}${formatSequenceValue(val, mask)}${suffix ?? ''}`);
  }
  return rows;
}

/**
 * Transcode a UTF-16 JS string into a single-byte / code-page byte string for bwip-js.
 * Returns { text, binarytext } ready for bwip-js options.
 */
export function encodeWithCodePage(text, codePage = 'Default') {
  const str = String(text ?? '');
  const key = String(codePage || 'Default').trim().toLowerCase();
  const encoding = CODE_PAGE_MAP.get(key) || 'utf8';

  if (encoding === 'utf8' || /^[\x00-\x7F]*$/.test(str)) {
    return { text: str, binarytext: false };
  }

  if (!iconv.encodingExists(encoding)) {
    return { text: str, binarytext: false };
  }

  const buf = iconv.encode(str, encoding);
  // Convert raw bytes 1:1 to a Latin-1 JS string and signal binarytext=true to bwip-js
  let raw = '';
  for (let i = 0; i < buf.length; i += 1) {
    raw += String.fromCharCode(buf[i]);
  }
  return { text: raw, binarytext: true };
}
