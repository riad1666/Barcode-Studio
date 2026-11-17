# Test Infrastructure & 4-Tier Automated Verification Architecture

## Overview

The Barcode, QR Code, and PDF417 Studio Suite utilizes a native, zero-dependency 4-Tier automated test suite powered directly by Node.js v24.18.1's built-in test runner (`node:test` and `node:assert/strict`).

Running `npm test` executes:
```bash
node --test tests/*.test.js
```
Total Test Count: **102 tests across 28 suites** with **100% pass rate (0 failures)**.

---

## 4-Tier Architecture

```
tests/
├── tier1_symbologies.test.js    # Tier 1: Symbologies, Escape Sequences & Masks (49 tests)
├── tier2_exports.test.js        # Tier 2: Binary Signatures, Batch ZIP & PDF Generators (19 tests)
├── tier3_http_api.test.js       # Tier 3: TEC-IT /barcode.ashx, JSON & PDF REST APIs (22 tests)
└── tier4_browser_e2e.test.js    # Tier 4: Zero-Dependency Headless Chrome CDP Runner (12 tests)
```

### Tier 1: Symbology Engine, Escaping & Sequences (`tests/tier1_symbologies.test.js`)
- **Coverage**:
  - Full catalog verification (all 150 symbology IDs, 13 categories, default PDF417 fallback, case-insensitive alias lookup).
  - Category 1 (Linear): Code128 (PNG/SVG), Code39, Code25IL, GS1-128.
  - Category 2 (Postal): KoreanPostal (raw 3-of-5), DPD (routing prefix normalization), UPU S10, PostNet11, AustralianPost.
  - Category 3 (GS1 DataBar): GS1DataBar, GS1DataBarExpanded, GS1DataBarStacked, GS1-128CCA Composite.
  - Category 4 (EAN/UPC): EAN13, EAN8, UPCA, UPCE, EAN13CCA Composite.
  - Category 5 (2D): PDF417 (columns 1–30, rows 3–90, EC 0–8, row multiplier 1–6, compact variant), MicroPDF417, QRCode (EC levels L, M, Q, H), Data Matrix (square 10x10, 26x26, 144x144, rectangular 8x18, 16x48), Aztec, DotCode.
  - Category 6 (GS1 2D): GS1DigitalLink_QRCode, GS1DigitalLink_DataMatrix, GS1QRCode, GS1DataMatrix, URI builder with qualifiers and attributes.
  - Category 7 (Banking): SwissQRCodeV23QRR (with recursive Mod-10 check digit and QR-IBAN validation), SwissQRCodeV23SCOR, SwissQRCodeV23 (NON), EPCQRCode (SEPA Credit Transfer), ZATCAQRCode (Saudi KSA TLV Base64).
  - Category 8–13 (Mobile, Healthcare, Publishing, Cards, Events, Wi-Fi): HIBC LIC/PAS, PZN7/8, PPN, ISBN13, ISMN, ISSN, vCard 3.0, MeCard, VEVENT, Wi-Fi WPA.
  - Escape sequences: `\F` (FNC1 token translation), `\t`, `\n`, `\r`, `\\`, `\xHH` hex escaping, adversarial mixed control characters.
  - Sequence expansion: `$`, `#`, `*` mask rules, overflow handling, prefix/suffix wrapping, step increments, validation boundaries.

### Tier 2: Export Formats, Batch ZIP & PDF Production (`tests/tier2_exports.test.js`)
- **Coverage**:
  - Binary format signatures:
    - PNG: `89 50 4E 47 0D 0A 1A 0A`
    - SVG: `<svg xmlns="http://www.w3.org/2000/svg"`
    - JPEG: `FF D8 FF`
    - GIF: `GIF89a` / `GIF87a` (`47 49 46 38`)
    - PDF: `%PDF-` (`25 50 44 46 2D`)
    - ZIP: `PK..` (`50 4B 03 04`)
  - Unlimited Multiline Batch ZIP:
    - 25 rows generated and packed into ZIP without TEC-IT's 10-barcode artificial cap.
    - All ZIP entry headers unpacked and verified to contain non-empty, valid PNG streams.
    - Error logging capture in `_errors.txt` when invalid rows are submitted.
  - Business Card PDF Generation (`generateBusinessCardPdf`):
    - Single 85×54 mm card (exact 240.94 × 153.07 pt dimensions).
    - 10-up A4 sheet (595.28 × 841.89 pt) with crop marks.
    - 10-up US Letter sheet (612 × 792 pt).
    - 4 templates: `classic-minimal`, `executive-band`, `accent-rail`, `compact-split`.
    - Data URL embedded company logos (PNG / JPEG).
  - Industrial & Compliance Label PDF Generation (`generateLabelPdf`):
    - VDA 4902 V4 (A5 Landscape 210×148 mm).
    - AIAG B-10 shipping label.
    - GS1 4×6" Shipping Label (PDF417 manifest + SSCC-18 GS1-128).
    - Multi-page CSV Grid Sheet (30 records on 24-up grid across multiple pages).

### Tier 3: HTTP API & TEC-IT Compatibility Suite (`tests/tier3_http_api.test.js`)
- **Coverage**:
  - Dynamic port binding (`http://127.0.0.1:0`) ensuring zero port collision during testing.
  - `/barcode.ashx`:
    - GET and POST method parity.
    - Default PNG rendering (200 OK).
    - SVG (`format=svg`) and JPEG (`format=jpg`) output.
    - `base64=true` preview mode with JSON `{ mime, base64 }` and `X-Mime-Type` header.
    - OnError handling: `OnError204` (204 No Content), `OnError500` (500 Error), `OnErrorDisplay` (200 with error image).
    - `multiplebarcodes=true` returning binary ZIP archive (`application/zip`).
    - Both JSON and `application/x-www-form-urlencoded` body formats.
  - Catalog REST endpoints:
    - `GET /api/catalog`
    - `GET /api/symbologies`
    - `GET /api/symbologies/:id`
  - Sequence generation:
    - `POST /api/sequence` with parameter validation (400 on inverted bounds).
  - PDF Generation endpoints:
    - `POST /api/pdf/business-card`
    - `POST /api/pdf/label`
  - Bookmarkable SPA routing:
    - `/`, `/en`, `/en/:code`, `/:code` all returning HTTP 200 with HTML content.
  - Server health:
    - `GET /health`

### Tier 4: Zero-Dependency Headless Chrome Browser CDP E2E Suite (`tests/tier4_browser_e2e.test.js`)
- **Coverage**:
  - Zero external browser automation packages (uses native Node 24 `WebSocket` and `child_process`).
  - Auto-discovery of local Chromium installation (`C:\Program Files\Google\Chrome\Application\chrome.exe` or Edge).
  - Direct Chrome DevTools Protocol 1.3 session management:
    - `Target.createTarget`, `Target.attachToTarget` (flatten: true).
    - `Page.enable`, `Runtime.enable`, `DOM.enable`.
    - Uncaught exception listener catching any runtime JavaScript errors.
  - Responsive Viewport Testing:
    - Desktop 1440×900 (`Emulation.setDeviceMetricsOverride`): checks horizontal overflow (`scrollWidth <= window.innerWidth`).
    - Mobile 375×812 (`mobile: true`, `deviceScaleFactor: 2`): checks horizontal overflow and touch target guidelines (>= 28px/44px).
  - Dual Theme Switching:
    - Evaluates Light Studio Paper (`data-theme="paper"`) and Dark OLED IDE (`data-theme="oled"`).
    - Optical barcode stage scannability validation.
  - Live Browser Runtime Workflows:
    - Workflow 1: Live image fetch and DOM insertion via `/barcode.ashx`.
    - Workflow 2: In-browser sequence expansion and batch ZIP streaming.
    - Workflow 3: In-browser Business Card PDF generation and `%PDF-` verification.
    - Workflow 4: In-browser Label PDF generation and `%PDF-` verification.
    - Workflow 5: Bookmarkable routing navigation.

---

## Running the Tests

### Full Test Suite
```bash
npm test
# OR
node --test tests/*.test.js
```

### Individual Tiers
```bash
# Tier 1: Symbologies, Escapes & Sequences
node --test tests/tier1_symbologies.test.js

# Tier 2: Export Signatures, Batch ZIP & PDF
node --test tests/tier2_exports.test.js

# Tier 3: HTTP API & Server Compatibility
node --test tests/tier3_http_api.test.js

# Tier 4: Headless Chrome Browser CDP E2E
node --test tests/tier4_browser_e2e.test.js
```

### Formatted TAP / Spec Output
```bash
node --test --test-reporter=spec tests/*.test.js
```
