/**
 * GS1 Digital Link form metadata, validation rules, and URI builder.
 * Shared between browser UI and server-side validation.
 */

export const GS1_PRIMARY_KEYS = [
  { value: '_00', ai: '00', label: '(00) Serial Shipping Container Code (SSCC)', regex: /^\d{18}$/, hint: '18 digits' },
  { value: '_01', ai: '01', label: '(01) Global Trade Item Number (GTIN)', regex: /^\d{8,14}$/, hint: '8–14 digits' },
  { value: '_253', ai: '253', label: '(253) Global Document Type Identifier (GDTI)', regex: /^\d{13}[\x21-\x7E]{0,17}$/, hint: '13 digits + optional serial' },
  { value: '_255', ai: '255', label: '(255) Global Coupon Number (GCN)', regex: /^\d{13,25}$/, hint: '13–25 digits' },
  { value: '_401', ai: '401', label: '(401) Global Identification Number for Consignment (GINC)', regex: /^[\x21-\x7E]{1,30}$/, hint: '1–30 chars' },
  { value: '_402', ai: '402', label: '(402) Global Shipment Identification Number (GSIN)', regex: /^\d{17}$/, hint: '17 digits' },
  { value: '_410', ai: '410', label: '(410) Ship to / Deliver to GLN', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_411', ai: '411', label: '(411) Bill to / Invoice to GLN', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_412', ai: '412', label: '(412) Purchased from GLN', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_413', ai: '413', label: '(413) Ship for / Deliver for - Forward to GLN', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_414', ai: '414', label: '(414) Identification of a physical location (GLN)', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_415', ai: '415', label: '(415) GLN of the invoicing party', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_416', ai: '416', label: '(416) GLN of production or service location', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_417', ai: '417', label: '(417) Party Global Location Number (GLN)', regex: /^\d{13}$/, hint: '13 digits' },
  { value: '_8003', ai: '8003', label: '(8003) Global Returnable Asset Identifier (GRAI)', regex: /^\d{14}[\x21-\x7E]{0,16}$/, hint: '14 digits + optional serial' },
  { value: '_8004', ai: '8004', label: '(8004) Global Individual Asset Identifier (GIAI)', regex: /^[\x21-\x7E]{1,30}$/, hint: '1–30 chars' },
  { value: '_8006', ai: '8006', label: '(8006) Individual trade item piece (ITIP)', regex: /^\d{18}$/, hint: '18 digits' },
  { value: '_8010', ai: '8010', label: '(8010) Component/Part Identifier (CPID)', regex: /^[A-Z0-9\-#\/]{1,30}$/i, hint: '1–30 chars' },
  { value: '_8013', ai: '8013', label: '(8013) Global Model Number (GMN)', regex: /^[\x21-\x7E]{1,25}$/, hint: '1–25 chars' },
  { value: '_8017', ai: '8017', label: '(8017) Global Service Relation Number - Provider', regex: /^\d{18}$/, hint: '18 digits' },
  { value: '_8018', ai: '8018', label: '(8018) Global Service Relation Number - Recipient', regex: /^\d{18}$/, hint: '18 digits' },
];

export const GS1_QUALIFIERS = [
  { id: 'KeyQualifier22', ai: '22', label: '(22) Consumer product variant' },
  { id: 'KeyQualifier10', ai: '10', label: '(10) Batch or lot number' },
  { id: 'KeyQualifier21', ai: '21', label: '(21) Serial number' },
  { id: 'KeyQualifier254', ai: '254', label: '(254) GLN extension component' },
  { id: 'KeyQualifier8011', ai: '8011', label: '(8011) CPID serial number' },
  { id: 'KeyQualifier8019', ai: '8019', label: '(8019) Service Relation Instance Number (SRIN)' },
];

export function defaultGs1DigitalLinkState() {
  return {
    GS1Resolver: 'https://dalgiardino.com',
    PrimaryKeyEnum: '_01',
    PrimaryKeyValue: '09506000134376',
    KeyQualifier22: '',
    KeyQualifier10: 'ABC',
    KeyQualifier21: '123456',
    KeyQualifier254: '',
    KeyQualifier8011: '',
    KeyQualifier8019: '',
    attributes: [{ key: '17', value: '221231' }],
  };
}

export function validateGs1DigitalLink(state = {}) {
  const safeState = state || {};
  const errors = {};
  const resolver = String(safeState.GS1Resolver || '').trim();
  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(resolver)) {
    errors.GS1Resolver = 'Enter a valid HTTP/HTTPS resolver URL (e.g. https://id.gs1.org).';
  }

  const pkSpec = GS1_PRIMARY_KEYS.find((k) => k.value === safeState.PrimaryKeyEnum) || GS1_PRIMARY_KEYS[1];
  const pkVal = String(safeState.PrimaryKeyValue || '').trim();
  if (!pkVal) {
    errors.PrimaryKeyValue = `Primary key value (${pkSpec.hint}) is required.`;
  } else if (!pkSpec.regex.test(pkVal)) {
    errors.PrimaryKeyValue = `Expected ${pkSpec.hint} for AI (${pkSpec.ai}).`;
  }

  const seenKeys = new Set();
  for (let i = 0; i < (safeState.attributes || []).length; i += 1) {
    const k = String(safeState.attributes[i]?.key || '').trim();
    const v = String(safeState.attributes[i]?.value || '').trim();
    if (!k && !v) continue;
    if (!/^\d{2,4}$/.test(k)) {
      errors[`attr_${i}`] = 'Data Attribute AI key must be 2–4 digits.';
    } else if (seenKeys.has(k)) {
      errors[`attr_${i}`] = `Duplicate Data Attribute AI (${k}).`;
    }
    seenKeys.add(k);
  }
  return errors;
}

export function buildGs1DigitalLink(state = {}) {
  const safeState = state || {};
  const base = String(safeState.GS1Resolver || 'https://id.gs1.org').trim().replace(/\/+$/, '');
  const pkSpec = GS1_PRIMARY_KEYS.find((k) => k.value === safeState.PrimaryKeyEnum) || GS1_PRIMARY_KEYS[1];
  const segments = [base, pkSpec.ai, encodeURIComponent(String(safeState.PrimaryKeyValue || '').trim())];

  for (const q of GS1_QUALIFIERS) {
    const val = String(safeState[q.id] || '').trim();
    if (val) {
      segments.push(q.ai, encodeURIComponent(val));
    }
  }

  const params = [];
  for (const attr of safeState.attributes || []) {
    const k = String(attr?.key || '').trim();
    const v = String(attr?.value || '').trim();
    if (k && v) {
      params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }

  const url = segments.join('/');
  return params.length ? `${url}?${params.join('&')}` : url;
}
