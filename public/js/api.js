/**
 * Centralized API Client for Server Communication
 */

export async function fetchCatalog() {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`Failed to load catalog: ${res.statusText}`);
  return res.json();
}

export async function fetchSymbologies() {
  const res = await fetch('/api/symbologies');
  if (!res.ok) throw new Error(`Failed to load symbologies: ${res.statusText}`);
  return res.json();
}

export function buildBarcodeUrl(params) {
  const url = new URL('/barcode.ashx', window.location.origin);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val));
    }
  }
  return url.toString();
}

export async function renderBarcodeBase64(params) {
  const postParams = {
    ...params,
    base64: 'true',
  };

  const res = await fetch('/barcode.ashx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postParams),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Render failed (${res.status})`);
  }

  const json = await res.json();
  return json; // { mime, base64 }
}

export async function renderBarcodeBlob(params) {
  const res = await fetch('/barcode.ashx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Render failed (${res.status})`);
  }

  const blob = await res.blob();
  return blob;
}

export async function generateSequence(options) {
  const res = await fetch('/api/sequence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Sequence generation failed');
  }

  return res.json(); // { count, rows, items }
}

export async function downloadBatchZip(params) {
  const postParams = {
    ...params,
    multiplebarcodes: 'true',
  };

  const res = await fetch('/barcode.ashx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postParams),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Batch ZIP generation failed');
  }

  const blob = await res.blob();
  triggerBlobDownload(blob, 'barcodes.zip');
}

export async function fetchBusinessCardPdf(payload) {
  const res = await fetch('/api/pdf/business-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Business Card PDF generation failed');
  }

  const blob = await res.blob();
  return blob;
}

export async function fetchLabelPdf(payload) {
  const res = await fetch('/api/pdf/label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Label PDF generation failed');
  }

  const blob = await res.blob();
  return blob;
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
