/**
 * GS1 Digital Link Dynamic URI Builder Component
 */

export const GS1_PRIMARY_KEYS = [
  { value: '_01', ai: '01', label: '(01) Global Trade Item Number (GTIN)', hint: '8–14 digits' },
  { value: '_00', ai: '00', label: '(00) Serial Shipping Container Code (SSCC)', hint: '18 digits' },
  { value: '_253', ai: '253', label: '(253) Global Document Type Identifier (GDTI)', hint: '13 digits + serial' },
  { value: '_255', ai: '255', label: '(255) Global Coupon Number (GCN)', hint: '13–25 digits' },
  { value: '_401', ai: '401', label: '(401) Global Identification Consignment (GINC)', hint: '1–30 chars' },
  { value: '_402', ai: '402', label: '(402) Global Shipment Identification (GSIN)', hint: '17 digits' },
  { value: '_414', ai: '414', label: '(414) Physical Location GLN', hint: '13 digits' },
  { value: '_8003', ai: '8003', label: '(8003) Global Returnable Asset Identifier (GRAI)', hint: '14 digits' },
  { value: '_8004', ai: '8004', label: '(8004) Global Individual Asset Identifier (GIAI)', hint: '1–30 chars' },
];

export const GS1_QUALIFIERS = [
  { id: 'KeyQualifier10', ai: '10', label: '(10) Batch or lot number' },
  { id: 'KeyQualifier21', ai: '21', label: '(21) Serial number' },
  { id: 'KeyQualifier22', ai: '22', label: '(22) Consumer product variant' },
];

export function buildGs1DigitalLink(state = {}) {
  const safeState = state || {};
  const base = String(safeState.GS1Resolver || 'https://dalgiardino.com').trim().replace(/\/+$/, '');
  const pkSpec = GS1_PRIMARY_KEYS.find((k) => k.value === safeState.PrimaryKeyEnum) || GS1_PRIMARY_KEYS[0];
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

  let uri = segments.join('/');
  if (params.length > 0) {
    uri += `?${params.join('&')}`;
  }
  return uri;
}

export function renderGs1Form(container, onPayloadChange) {
  const state = {
    GS1Resolver: 'https://dalgiardino.com',
    PrimaryKeyEnum: '_01',
    PrimaryKeyValue: '09506000134376',
    KeyQualifier10: 'ABC',
    KeyQualifier21: '123456',
    KeyQualifier22: '',
    attributes: [{ key: '17', value: '221231' }],
  };

  const update = () => {
    const uri = buildGs1DigitalLink(state);
    const uriPreviewEl = container.querySelector('#gs1_uri_preview');
    if (uriPreviewEl) uriPreviewEl.textContent = uri;
    onPayloadChange(uri);
  };

  container.innerHTML = `
    <div class="form-grid-2">
      <div class="form-group">
        <label class="form-label" for="gs1_resolver">Web Resolver URL</label>
        <input class="input-text code-font" id="gs1_resolver" value="${state.GS1Resolver}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="gs1_pk_type">Primary Key AI</label>
        <select class="input-select" id="gs1_pk_type">
          ${GS1_PRIMARY_KEYS.map((k) => `<option value="${k.value}" ${k.value === state.PrimaryKeyEnum ? 'selected' : ''}>${k.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-grid-3">
      <div class="form-group">
        <label class="form-label" for="gs1_pk_val">Primary Key Value*</label>
        <input class="input-text code-font" id="gs1_pk_val" value="${state.PrimaryKeyValue}" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="gs1_q10">(10) Batch / Lot</label>
        <input class="input-text" id="gs1_q10" value="${state.KeyQualifier10}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="gs1_q21">(21) Serial Number</label>
        <input class="input-text" id="gs1_q21" value="${state.KeyQualifier21}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Constructed GS1 Digital Link URI</label>
      <div id="gs1_uri_preview" class="embed-code-block" style="min-height:36px; padding:8px 12px; word-break:break-all;"></div>
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

  bind('gs1_resolver', 'GS1Resolver');
  bind('gs1_pk_type', 'PrimaryKeyEnum');
  bind('gs1_pk_val', 'PrimaryKeyValue');
  bind('gs1_q10', 'KeyQualifier10');
  bind('gs1_q21', 'KeyQualifier21');

  update();
}
