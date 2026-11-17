/**
 * Complete barcode symbology catalog mirroring barcode.tec-it.com (13 categories, 150 entries),
 * plus shared settings metadata (code pages, fonts, Data Matrix symbol sizes, PDF417 options).
 */

export const QUICK_JUMP_IDS = [
  'PDF417',
  'MicroPDF417',
  'QRCode',
  'Code128',
  'DataMatrix',
  'GS1-128',
  'EAN13',
  'SwissQRCodeV23QRR',
  'ZATCAQRCode',
];

export const CODE_PAGES = [
  { value: 'Default', label: 'Default', encoding: 'utf8' },
  { value: 'Ansi', label: 'ANSI (Windows-1252)', encoding: 'win1252' },
  { value: 'Ansi_Cyrillic', label: 'ANSI Cyrillic (Windows-1251)', encoding: 'win1251' },
  { value: 'Ascii_Extended', label: 'ASCII Extended (CP437)', encoding: 'cp437' },
  { value: 'Chinese_GB18030', label: 'Chinese GB18030', encoding: 'gb18030' },
  { value: 'Latin_I', label: 'ISO 8859-1 Latin-1', encoding: 'iso88591' },
  { value: 'ISO_8859_2', label: 'ISO 8859-2 Central Eur.', encoding: 'iso88592' },
  { value: 'ISO_8859_3', label: 'ISO 8859-3 South Eur.', encoding: 'iso88593' },
  { value: 'ISO_8859_4', label: 'ISO 8859-4 North Eur.', encoding: 'iso88594' },
  { value: 'ISO_8859_5', label: 'ISO 8859-5 Cyrillic', encoding: 'iso88595' },
  { value: 'ISO_8859_6', label: 'ISO 8859-6 Arabic', encoding: 'iso88596' },
  { value: 'ISO_8859_7', label: 'ISO 8859-7 Greek', encoding: 'iso88597' },
  { value: 'ISO_8859_8', label: 'ISO 8859-8 Hebrew', encoding: 'iso88598' },
  { value: 'ISO_8859_9', label: 'ISO 8859-9 Turkish', encoding: 'iso88599' },
  { value: 'ISO_8859_13', label: 'ISO 8859-13 Baltic', encoding: 'iso885913' },
  { value: 'ISO_8859_15', label: 'ISO 8859-15 Western Eur.', encoding: 'iso885915' },
  { value: 'Japanese_ShiftJis', label: 'Japanese Shift JIS', encoding: 'shift_jis' },
  { value: 'Korean', label: 'Korean (EUC-KR)', encoding: 'euc-kr' },
  { value: 'MAC_Roman', label: 'MAC Roman', encoding: 'macroman' },
  { value: 'Russian_Koi8_R', label: 'Russian KOI8-R', encoding: 'koi8-r' },
  { value: 'Simplified_Chinese', label: 'Simplified Chinese (GBK)', encoding: 'gbk' },
  { value: 'Traditional_Chinese', label: 'Traditional Chinese (Big5)', encoding: 'big5' },
  { value: 'Utf_8', label: 'UTF-8', encoding: 'utf8' },
  { value: 'Windows1252', label: 'Windows-1252', encoding: 'win1252' },
];

export const FONT_OPTIONS = [
  'Arial',
  'Calibri',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Lucida Sans Unicode',
  'OCRB',
  'Segoe UI',
  'SimSun',
  'Tahoma',
  'Times New Roman',
  'Verdana',
];

const DM_RECT_EXTENSION_SET = new Set([
  '8x48', '8x64', '8x80', '8x96', '8x120', '8x144',
  '12x64', '12x88', '16x64',
  '20x36', '20x44', '20x64',
  '22x40', '22x48',
  '24x32', '24x36', '24x48', '24x64',
  '26x32', '26x40', '26x48', '26x64',
]);

const RAW_DM_DIMS = [
  '8x18', '8x32', '8x48', '8x64', '8x80', '8x96', '8x120', '8x144',
  '10x10', '12x12', '12x26', '12x36', '12x64', '12x88',
  '14x14', '16x16', '16x36', '16x48', '16x64',
  '18x18', '20x20', '20x36', '20x44', '20x64',
  '22x22', '22x40', '22x48',
  '24x24', '24x32', '24x36', '24x48', '24x64',
  '26x26', '26x32', '26x40', '26x48', '26x64',
  '32x32', '36x36', '40x40', '44x44', '48x48',
  '52x52', '64x64', '72x72', '80x80', '88x88',
  '96x96', '104x104', '120x120', '132x132', '144x144',
];

export const DM_SIZES = [
  { value: 'Default', label: 'Default', rows: null, columns: null, bcid: 'datamatrix' },
  ...RAW_DM_DIMS.map((dim) => {
    const [r, c] = dim.split('x').map(Number);
    const isRect = r !== c;
    const value = `${isRect ? 'Rectangle' : 'Square'}${dim}`;
    const label = isRect ? `${dim} - Rectangle` : dim;
    const bcid = !isRect
      ? 'datamatrix'
      : DM_RECT_EXTENSION_SET.has(dim)
        ? 'datamatrixrectangularextension'
        : 'datamatrixrectangular';
    return { value, label, rows: r, columns: c, bcid };
  }),
];

/** Helper to construct a standard catalog entry cleanly. */
function sym(id, name, bcid, defaultData, description, extra = {}) {
  return {
    id,
    name,
    bcid,
    defaultData,
    description,
    escapeDefault: false,
    formType: 'text',
    showHrtDefault: true,
    settingsGroup: 'standard',
    ...extra,
  };
}

const MOBILE_TEMPLATES = [
  { key: 'Url', name: 'URL', description: 'Enter the URL - e.g. https://www.tec-it.com', defaultData: 'https://www.tec-it.com' },
  { key: 'Phone', name: 'Dial a Phonenumber', description: 'Enter the phone number to call', defaultData: '0043725272720' },
  { key: 'SMS', name: 'Text a Message (SMS)', description: "Enter phone number and SMS text separated by ':'", defaultData: '0043(699)10053283:text' },
  { key: 'TwitterProfile', name: 'Twitter Profile', description: 'Enter the Twitter user name', defaultData: 'tecit' },
  { key: 'TwitterStatus', name: 'Twitter Tweet', description: 'Enter your tweet (max. 140 characters)', defaultData: 'Checking out Barcode Studio Pro!' },
  { key: 'FacebookProfile', name: 'Facebook Profile', description: 'Enter the User Id or handle of the Facebook profile', defaultData: '100000000000001' },
  { key: 'FacebookLike', name: 'Facebook Like', description: 'Enter the URL of the page to be liked', defaultData: 'https://www.tec-it.com' },
  { key: 'LinkedInProfile', name: 'LinkedIn User Profile', description: 'Enter the profile name of your LinkedIn user profile', defaultData: 'john-doe' },
  { key: 'LinkedInCompanyProfile', name: 'LinkedIn Company Profile', description: 'Enter the profile name of your LinkedIn company profile', defaultData: 'tec-it' },
  { key: 'LinkedInShare', name: 'LinkedIn Share', description: 'Enter the URL of the page to be shared', defaultData: 'https://www.tec-it.com' },
  { key: 'AndroidMarketPubSearch', name: 'Google Play Publisher Search', description: 'Enter the name of the publisher to search (case-sensitive)', defaultData: 'TEC-IT' },
  { key: 'AndroidMarketPackSearch', name: 'Google Play Package Search', description: 'Enter the name of the package to search (case-sensitive)', defaultData: 'com.tecit.android.blueserial' },
];

function buildMobileGroup(prefix, bcid, settingsGroup, extraItems = []) {
  return [
    ...extraItems,
    ...MOBILE_TEMPLATES.map((t) =>
      sym(`${prefix}${t.key}`, t.name, bcid, t.defaultData, t.description, {
        settingsGroup,
        showHrtDefault: false,
        wrapper: `mobile:${t.key}`,
        codePageDefault: bcid === 'qrcode' ? 'Utf_8' : 'Default',
      }),
    ),
  ];
}

export const CATEGORIES = [
  {
    id: 'linear',
    name: 'Linear Codes',
    icon: 'barcode',
    description: 'Linear barcodes (1D codes) commonly used in logistics and industry for serial numbers and product IDs.',
    items: [
      sym('Code128', 'Code-128', 'code128', 'ABC-abc-1234', 'Encodes the full ASCII set [0..127]', { escapeDefault: true }),
      sym('Code11', 'Code-11', 'code11', '0123456789', 'Encodes numeric data [0..9] and [-]'),
      sym('Code25IL', 'Code-2of5 Interleaved', 'interleaved2of5', '0123456789', 'Encodes numeric data (alias ITF)'),
      sym('Code39', 'Code-39', 'code39', 'ABC-1234', 'Encodes [0..9 A..Z -.$/+% Space]'),
      sym('Code39FullASCII', 'Code-39 Full ASCII', 'code39ext', 'ABC-abc-1234', 'Encodes the full ASCII set [0..127]', { escapeDefault: true }),
      sym('Code93', 'Code-93', 'code93', 'ABC-1234', 'Encodes [0..9 A..Z -.$/+% Space]'),
      sym('Flattermarken', 'Flattermarken', 'flattermarken', '11099', 'Encodes numeric data [0..9]', { showHrtDefault: false }),
      sym('GS1-128', 'GS1-128 (UCC/EAN-128)', 'gs1-128', '0101234567890128TEC-IT', 'Enter digits and AIs (FNC1 = \\F)', { escapeDefault: true, wrapper: 'gs1' }),
      sym('MSI', 'MSI', 'msi', '0123456789', 'Encodes numeric data [0..9]'),
      sym('OneTrackPharmacode', 'Pharmacode One-Track', 'pharmacode', '117480', 'Encodes numeric [0..9] pharmaceutical data', { showHrtDefault: false }),
      sym('TwoTrackPharmacode', 'Pharmacode Two-Track', 'pharmacode2', '117480', 'Encodes numeric [0..9] two-track data', { showHrtDefault: false }),
      sym('TelepenAlpha', 'Telepen Alpha', 'telepen', 'ABC-abc-1234', 'Encodes the full ASCII set [0..127]'),
    ],
  },
  {
    id: 'postal',
    name: 'Postal Codes',
    icon: 'envelope',
    description: 'Postal bar codes used by postal service providers in several countries to optimize mail delivery.',
    items: [
      sym('AustralianPost', 'Australian Post Standard Customer', 'auspost', '59564391', 'Enter 8 digits', { wrapper: 'auspost' }),
      sym('DAFT', 'DAFT', 'daft', 'FATDAFTDAD', 'Generic 4-state barcode (enter D, A, F, or T)', { showHrtDefault: false }),
      sym('DPD', 'DPD Barcode (DPD Parcel Label)', 'code128', 'X007110601631234567890136276', 'DPD Parcel format: (I)PPPPPPPTTTTTTTTTTTTTTSSSCCC', { wrapper: 'dpd' }),
      sym('JapanesePostal', 'Japanese Postal (Customer) Code', 'japanpost', '6540123789-A-K-Z', 'Enter 7 digits (ZIP) + address code [0..9 A..Z -]'),
      sym('KIX', 'KIX (TNT Post Netherlands)', 'kix', '1231FZ13XHS', 'Encodes alphanumeric postal routing [0..9 A..Z]'),
      sym('KoreanPostal', 'Korean Postal Authority Code', 'raw', '123456', 'Enter 6 digits (Korea Post 3-of-5 bar pattern)', { wrapper: 'koreanPostal', showHrtDefault: false }),
      sym('PlanetCode12', 'Planet Code 12', 'planet', '01234567890', 'Enter 11 digits'),
      sym('RoyalMail', 'Royal Mail 4-State', 'royalmail', 'LE28HS9Z', 'Enter [0..9 A..Z]'),
      sym('RoyalMailMailmark', 'Royal Mail Mailmark 4-State', 'mailmark', 'JGB 012100123412345678AB19XY1A 0             ', 'Enter 22 or 26 characters [0..9 A..Z] padded with spaces', { wrapper: 'mailmark4' }),
      sym('RoyalMailMailmark2D', 'Royal Mail Mailmark 2D', 'datamatrix', 'JGB 012100123412345678AB19XY1A 0             ', 'Used to identify mail pieces for Royal Mail (2D Data Matrix)', { showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('PostNet5', 'USPS PostNet 5', 'postnet', '01234', 'Enter 5 digits (ZIP)'),
      sym('PostNet9', 'USPS PostNet 9', 'postnet', '012345678', 'Enter 5 (ZIP) + 4 digits'),
      sym('PostNet11', 'USPS PostNet 11', 'postnet', '01234567890', 'Enter 5 (ZIP) + 4 + 2 digits'),
      sym('USPSIMPackage', 'USPS IM Package', 'gs1-128', '42012345\\F920010000000000000000', 'Enter 22 to 34 digits (USPS IMpb)', { escapeDefault: true, wrapper: 'uspsimpb' }),
      sym('UPUS10', 'UPU S10', 'code128', 'EE123456785CH', 'Universal Postal Union 13-character S10 identifier', { wrapper: 'upus10' }),
    ],
  },
  {
    id: 'gs1-databar',
    name: 'GS1 DataBar',
    icon: 'grid-four',
    description: 'GS1-DataBar is intended for trade item identification and retail point of sale (POS) applications.',
    items: [
      sym('GS1DataBar', 'GS1-DataBar', 'databaromni', '0123456789012', 'Enter 13 or 14 digits (GTIN)', { wrapper: 'gtin' }),
      sym('GS1DataBarStacked', 'GS1-DataBar Stacked', 'databarstacked', '0123456789012', 'Enter 13 or 14 digits (GTIN)', { wrapper: 'gtin', showHrtDefault: false }),
      sym('GS1DataBarStackedOmni', 'GS1-DataBar Stacked Omni', 'databarstackedomni', '0123456789012', 'Enter 13 or 14 digits (GTIN)', { wrapper: 'gtin', showHrtDefault: false }),
      sym('GS1DataBarLimited', 'GS1-DataBar Limited', 'databarlimited', '0123456789012', 'Enter 13 or 14 digits (GTIN starting 0 or 1)', { wrapper: 'gtin' }),
      sym('GS1DataBarExpanded', 'GS1-DataBar Expanded', 'databarexpanded', '(01)09521234543213(3103)000123', 'Encodes GS1 AIs and alphanumeric data', { wrapper: 'gs1' }),
      sym('GS1DataBarExpandedStacked', 'GS1-DataBar Expanded Stacked', 'databarexpandedstacked', '(01)09521234543213(3103)000123', 'Encodes GS1 AIs across stacked rows', { wrapper: 'gs1', showHrtDefault: false }),
      sym('GS1-128CCA', 'GS1-128 Composite Symbology', 'gs1-128composite', '(00)095287654321012346|(02)09521234543213(37)24', 'Enter GS1-128 AIs | composite 2D data', { wrapper: 'composite-gs1' }),
      sym('GS1DataBarCCA', 'GS1-DataBar Composite', 'databaromnicomposite', '09521234543213|(11)990102', 'Enter 13 or 14 digits (GTIN) | composite data', { wrapper: 'composite-gtin' }),
      sym('GS1DataBarStackedCCA', 'GS1-DataBar Stacked Composite', 'databarstackedcomposite', '09521234543213|(17)010200', 'Enter 13 or 14 digits (GTIN) | composite data', { wrapper: 'composite-gtin', showHrtDefault: false }),
      sym('GS1DataBarStackedOmniCCA', 'GS1-DataBar Stacked Omni Composite', 'databarstackedomnicomposite', '03612345678904|(11)990102', 'Enter 13 or 14 digits (GTIN) | composite data', { wrapper: 'composite-gtin', showHrtDefault: false }),
      sym('GS1DataBarLimitedCCA', 'GS1-DataBar Limited Composite', 'databarlimitedcomposite', '09521234543213|(21)ABCD1234', 'Enter 13 or 14 digits (GTIN) | composite data', { wrapper: 'composite-gtin' }),
      sym('GS1DataBarExpandedCCA', 'GS1-DataBar Expanded Composite', 'databarexpandedcomposite', '(01)09521234543213(3103)001234|(91)1A2B3C', 'Enter AI data | composite data', { wrapper: 'composite-gs1' }),
      sym('GS1DataBarExpandedStackedCCA', 'GS1-DataBar Expanded Stacked Composite', 'databarexpandedstackedcomposite', '(01)09521234543213(10)ABCDEF|(21)12345678', 'Enter AI data | composite data', { wrapper: 'composite-gs1', showHrtDefault: false }),
    ],
  },
  {
    id: 'ean-upc',
    name: 'EAN / UPC',
    icon: 'scan',
    description: 'EAN and UPC bar-codes used in retail point of sale for product identification and composite extensions.',
    items: [
      sym('EAN8', 'EAN-8', 'ean8', '95200002', 'Enter 7 or 8 digits'),
      sym('EAN13', 'EAN-13', 'ean13', '9520123456788', 'Enter 12 or 13 digits'),
      sym('EAN14', 'EAN-14 / GS1-128', 'ean14', '09528765432108', 'Enter 13 or 14 digits', { wrapper: 'gtin' }),
      sym('EAN8CCA', 'EAN-8 Composite Symbology', 'ean8composite', '95200002|(21)A12345678', 'Enter 7 or 8 digits | composite data', { wrapper: 'composite-raw' }),
      sym('EAN13CCA', 'EAN-13 Composite Symbology', 'ean13composite', '9520123456788|(99)1234-abcd', 'Enter 12 or 13 digits | composite data', { wrapper: 'composite-raw' }),
      sym('UPCA', 'UPC-A', 'upca', '012345000058', 'Enter 11 or 12 digits'),
      sym('UPCE', 'UPC-E', 'upce', '01234558', 'Enter 7 or 8 digits'),
      sym('UPCACCA', 'UPC-A Composite Symbology', 'upcacomposite', '012345000058|(99)1234-abcd', 'Enter 11 or 12 digits | composite data', { wrapper: 'composite-raw' }),
      sym('UPCECCA', 'UPC-E Composite Symbology', 'upcecomposite', '01234558|(15)021231', 'Enter 7 or 8 digits | composite data', { wrapper: 'composite-raw' }),
    ],
  },
  {
    id: '2d',
    name: '2D Codes',
    icon: 'qr-code',
    description: '2D codes encode hundreds of bytes. Most common symbologies are PDF417, QR-Code, Data Matrix (ECC200), and Aztec.',
    items: [
      sym('QRCode', 'QR Code', 'qrcode', 'This is a QR Code by TEC-IT', 'Encodes alphanumeric & byte data using Latin-1 encoding', { showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Latin_I' }),
      sym('MobileQRCode', 'QR Code (Mobile/Smartphone)', 'qrcode', 'This is a mobile QR Code by TEC-IT', 'Encodes alphanumeric & Unicode data using UTF-8 encoding', { showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
      sym('DataMatrix', 'Data Matrix', 'datamatrix', 'This is a Data Matrix by TEC-IT', 'Encodes alphanumeric characters (Latin-1) and Bytes', { escapeDefault: true, showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('Aztec', 'Aztec', 'azteccode', 'This is an Aztec Code by TEC-IT', 'Encodes alphanumeric data (ISO8859-1) and Bytes', { showHrtDefault: false }),
      sym('CodablockF', 'Codablock-F', 'codablockf', 'CODABLOCK F 34567890123456789010040', 'Stacked 1D/2D symbology encoding ASCII [0..127] + ISO-8859-1', { showHrtDefault: false }),
      sym('MaxiCode', 'MaxiCode', 'maxicode', '[)>\\x1E01\\x1D96152382802\\x1D840\\x1D001\\x1D1Z00004951\\x1DUPSN\\x1D06X610\\x1D159\\x1D1234567\\x1D1/1\\x1D\\x1DY\\x1D\\x04', 'Encodes structured carrier/USPS logistics data (Mode 2/3/4)', { escapeDefault: true, showHrtDefault: false }),
      sym('MicroPDF417', 'MicroPDF417', 'micropdf417', 'This is a MicroPDF417 by Barcode Studio', 'Compact multi-row 2D symbology for space-constrained labels', { showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('PDF417', 'PDF417', 'pdf417', 'This is a PDF417 by Barcode Studio', 'High-capacity stacked 2D barcode encoding ASCII, Numeric, and Binary bytes', { showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('MicroQR', 'Micro QR Code', 'microqrcode', '12345678', 'Space-saving QR variant for small parts', { showHrtDefault: false, settingsGroup: 'qrcode' }),
      sym('HanXin', 'Han Xin', 'hanxin', 'This is Han Xin Code', 'Optimized for Chinese multibyte characters (GB18030) and high-density bytes', { showHrtDefault: false }),
      sym('DotCode', 'DotCode', 'dotcode', 'This is a DotCode by Barcode Studio', 'Designed for high-speed inkjet and laser direct part marking (DPM)', { showHrtDefault: false }),
      sym('RoyalMail2D', 'Royal Mail Mailmark 2D', 'datamatrix', 'JGB 012100123412345678AB19XY1A 0             ', 'Used to identify mail pieces for Royal Mail', { showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('NTIN', 'NTIN Code', 'gs1datamatrix', '01076123456789001725123110BATCH01\\F21SER001', 'GS1 National Trade Item Number in GS1 DataMatrix', { escapeDefault: true, showHrtDefault: false, wrapper: 'gs1', settingsGroup: 'datamatrix' }),
      sym('PPN', 'PPN Code', 'datamatrix', '9N110375286414', 'IFA Pharmacy Product Number (Macro 06 Data Matrix)', { escapeDefault: true, showHrtDefault: false, wrapper: 'ppn', settingsGroup: 'datamatrix' }),
    ],
  },
  {
    id: 'gs1-2d',
    name: 'GS1 2D Barcodes',
    icon: 'globe',
    description: 'GS1 2D Codes hold trade item information such as GTIN, expiry date, serial number, or GS1 Digital Link URIs.',
    items: [
      sym('GS1QRCode', 'GS1 QR Code', 'gs1qrcode', '010123456789012890TEC-IT\\F8200https://www.tec-it.com', 'GS1 QR Code carrying GS1 keys and AIs', { escapeDefault: true, showHrtDefault: false, wrapper: 'gs1', settingsGroup: 'qrcode' }),
      sym('GS1DataMatrix', 'GS1 DataMatrix', 'gs1datamatrix', '01012345678901281721022110ABCD1234\\F217654', 'GS1 DataMatrix for healthcare & trade items', { escapeDefault: true, showHrtDefault: false, wrapper: 'gs1', settingsGroup: 'datamatrix' }),
      sym('GS1DigitalLink_QRCode', 'GS1 Digital Link QR code', 'gs1dlqrcode', 'https://dalgiardino.com/01/09506000134376/10/ABC/21/123456?17=221231', 'Structured GS1 Digital Link URI encoded as QR Code (QR)', { formType: 'gs1DigitalLink', showHrtDefault: false, settingsGroup: 'qrcode' }),
      sym('GS1DigitalLink_DataMatrix', 'GS1 Digital Link Data Matrix', 'gs1dldatamatrix', 'https://dalgiardino.com/01/09506000134376/10/ABC/21/123456?17=221231', 'Structured GS1 Digital Link URI encoded as Data Matrix', { formType: 'gs1DigitalLink', showHrtDefault: false, settingsGroup: 'datamatrix' }),
    ],
  },
  {
    id: 'banking',
    name: 'Banking and Payments',
    icon: 'bank',
    description: 'Payment QR codes for SEPA EPC invoices, Swiss QR-bills (v2.3/v2.2/v1.0), and Saudi ZATCA FATOORAH e-invoicing.',
    items: [
      sym('EPCQRCode', 'EPC QR Code V2', 'qrcode', '', 'SEPA Credit Transfer QR code (locked to EC Level M)', { formType: 'epc', showHrtDefault: false, settingsGroup: 'epc' }),
      sym('SwissQRCodeV23', 'Swiss QR Code v.2.3 (No Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.3 (NON reference, structured addresses)', { formType: 'swiss', swissVersion: '2.3', swissRefType: 'NON', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCodeV23SCOR', 'Swiss QR Code v.2.3 (Creditor Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.3 (ISO 11649 SCOR Creditor Reference)', { formType: 'swiss', swissVersion: '2.3', swissRefType: 'SCOR', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCodeV23QRR', 'Swiss QR Code v.2.3 (QR Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.3 (27-digit QR-IBAN + Mod-10 QRR reference)', { formType: 'swiss', swissVersion: '2.3', swissRefType: 'QRR', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCodeV2', 'Swiss QR Code v.2.2 (No Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.2 (NON reference)', { formType: 'swiss', swissVersion: '2.2', swissRefType: 'NON', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCodeV2SCOR', 'Swiss QR Code v.2.2 (Creditor Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.2 (SCOR reference)', { formType: 'swiss', swissVersion: '2.2', swissRefType: 'SCOR', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCodeV2QRR', 'Swiss QR Code v.2.2 (QR Reference)', 'swissqrcode', '', 'Swiss QR-bill v2.2 (QRR reference)', { formType: 'swiss', swissVersion: '2.2', swissRefType: 'QRR', showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('SwissQRCode', 'Swiss QR Code v.1.0', 'swissqrcode', 'SPC\r\n0100\r\n1\r\nCH4431999123000889012\r\nRobert Schneider AG\r\nRue du Lac\r\n1268\r\n2501\r\nBiel\r\nCH\r\n\r\n\r\n\r\n\r\n\r\n\r\n199.95\r\nCHF\r\nPia-Maria Rutschmann-Schnyder\r\nGrosse Marktgasse\r\n28\r\n9400\r\nRorschach\r\nCH\r\nNON\r\n\r\nOrder 10.05.2022', 'Raw Swiss QR Code v1.0 payload', { showHrtDefault: false, settingsGroup: 'swiss' }),
      sym('ZATCAQRCode', 'ZATCA QR Code', 'qrcode', '', 'KSA E-Invoicing (FATOORAH) TLV Base64 QR Code', { formType: 'zatca', showHrtDefault: false, settingsGroup: 'bankingQr', codePageDefault: 'Utf_8' }),
    ],
  },
  {
    id: 'mobile',
    name: 'Mobile Tagging',
    icon: 'device-mobile',
    description: 'Action-ready QR Code, Data Matrix, and Aztec payloads for URLs, phone numbers, SMS, and social links.',
    subgroups: [
      {
        id: 'mobile-qr',
        name: 'QR Code',
        items: buildMobileGroup('MobileQR', 'qrcode', 'qrcode', [
          sym('MobileQRCode_Tag', 'QR Code (Mobile/Smartphone)', 'qrcode', 'This is a QR Code by Barcode Studio', 'Encodes UTF-8 alphanumeric text for smartphone scanning', { showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
        ]),
      },
      {
        id: 'mobile-dm',
        name: 'Data Matrix',
        items: buildMobileGroup('MobileSema', 'datamatrix', 'datamatrix'),
      },
      {
        id: 'mobile-aztec',
        name: 'Aztec',
        items: buildMobileGroup('MobileAztec', 'azteccode', 'standard'),
      },
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare Codes',
    icon: 'first-aid',
    description: 'Healthcare and pharmaceutical symbologies (HIBC LIC/PAS, PZN7/PZN8, NTIN, PPN, Code32, Pharmacode).',
    items: [
      sym('Health_Code32', 'Code32', 'code32', '01234567', 'Italian Pharmacode numeric [0..9]'),
      sym('Health_Flattermarken', 'Flattermarken', 'flattermarken', '11099', 'Encodes numeric data [0..9]', { showHrtDefault: false }),
      sym('Health_HIBCLIC128', 'HIBC LIC 128', 'hibccode128', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (Code 128)', { wrapper: 'hibc' }),
      sym('Health_HIBCLIC39', 'HIBC LIC 39', 'hibccode39', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (Code 39)', { wrapper: 'hibc' }),
      sym('Health_HIBCLICAztec', 'HIBC LIC Aztec', 'hibcazteccode', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (Aztec)', { wrapper: 'hibc', showHrtDefault: false }),
      sym('Health_HIBCLICCodaF', 'HIBC LIC Codablock-F', 'hibccodablockf', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (Codablock-F)', { wrapper: 'hibc', showHrtDefault: false }),
      sym('Health_HIBCLICDataMatrix', 'HIBC LIC Data Matrix', 'hibcdatamatrix', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (Data Matrix)', { wrapper: 'hibc', showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('Health_HIBCLICMicroPDF', 'HIBC LIC Micro PDF 417', 'hibcmicropdf417', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (MicroPDF417)', { wrapper: 'hibc', showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('Health_HIBCLICPDF417', 'HIBC LIC PDF417', 'hibcpdf417', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (PDF417)', { wrapper: 'hibc', showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('Health_HIBCLICQR', 'HIBC LIC QR-Code', 'hibcqrcode', '+A99912345/$$52001510X3', 'HIBC Supplier Labeling Standard (QR Code)', { wrapper: 'hibc', showHrtDefault: false, settingsGroup: 'qrcode' }),
      sym('Health_HIBCPAS128', 'HIBC PAS 128', 'code128', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (Code 128)', { wrapper: 'hibc-pas' }),
      sym('Health_HIBCPAS39', 'HIBC PAS 39', 'code39', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (Code 39)', { wrapper: 'hibc-pas' }),
      sym('Health_HIBCPASAztec', 'HIBC PAS Aztec', 'azteccode', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (Aztec)', { wrapper: 'hibc-pas', showHrtDefault: false }),
      sym('Health_HIBCPASCodaF', 'HIBC PAS Codablock-F', 'codablockf', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (Codablock-F)', { wrapper: 'hibc-pas', showHrtDefault: false }),
      sym('Health_HIBCPASDataMatrix', 'HIBC PAS Data Matrix', 'datamatrix', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (Data Matrix)', { wrapper: 'hibc-pas', showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('Health_HIBCPASMicroPDF', 'HIBC PAS Micro PDF417', 'micropdf417', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (MicroPDF417)', { wrapper: 'hibc-pas', showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('Health_HIBCPASPDF417', 'HIBC PAS PDF417', 'pdf417', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (PDF417)', { wrapper: 'hibc-pas', showHrtDefault: false, settingsGroup: 'pdf417' }),
      sym('Health_HIBCPASQR', 'HIBC PAS QR-Code', 'qrcode', '+$$52001510X3/A99912345', 'HIBC Provider Applications Standard (QR Code)', { wrapper: 'hibc-pas', showHrtDefault: false, settingsGroup: 'qrcode' }),
      sym('Health_NTIN', 'NTIN (Data Matrix)', 'gs1datamatrix', '01076123456789001725123110BATCH01\\F21SER001', 'GS1 National Trade Item Number', { escapeDefault: true, showHrtDefault: false, wrapper: 'gs1', settingsGroup: 'datamatrix' }),
      sym('Health_Pharma1T', 'Pharmacode One-Track', 'pharmacode', '117480', 'Encodes numeric [0..9] data', { showHrtDefault: false }),
      sym('Health_Pharma2T', 'Pharmacode Two-Track', 'pharmacode2', '117480', 'Encodes numeric [0..9] data', { showHrtDefault: false }),
      sym('Health_PPN', 'PPN (Pharmacy Product Number)', 'datamatrix', '9N110375286414', 'IFA Pharmacy Product Number (Macro 06 Data Matrix)', { escapeDefault: true, showHrtDefault: false, wrapper: 'ppn', settingsGroup: 'datamatrix' }),
      sym('Health_PZN7', 'PZN7', 'pzn', '123456', 'German Pharma Central Number (7-digit PZN7)'),
      sym('Health_PZN8', 'PZN8', 'pzn', '12345678', 'German Pharma Central Number (8-digit PZN8)', { pzn8: true }),
    ],
  },
  {
    id: 'isbn',
    name: 'ISBN Codes',
    icon: 'book-open',
    description: 'ISBN, ISSN, and ISMN barcodes used to identify books, periodicals, and printed music.',
    items: [
      sym('ISBN13', 'ISBN 13', 'isbn', '978-1-56581-231-4', 'Enter ISBN-13 (with or without hyphens)', { wrapper: 'isbn' }),
      sym('ISBN13P5', 'ISBN 13 + 5 Digits', 'isbn', '978-1-56581-231-4 90000', 'Enter ISBN-13 + 5-digit price add-on', { wrapper: 'isbn' }),
      sym('ISMN', 'ISMN', 'ismn', '979-0-2605-3211-3', 'Enter ISMN number (979-0-...)', { wrapper: 'ismn' }),
      sym('ISSN', 'ISSN', 'issn', '0311-175X', 'Enter 8-digit ISSN (XXXX-XXXX) or 977 EAN digits', { wrapper: 'issn' }),
      sym('ISSNP2', 'ISSN + 2 Digits', 'issn', '0311-175X 00 17', 'Enter ISSN + 2-digit issue add-on', { wrapper: 'issn' }),
    ],
  },
  {
    id: 'business-cards',
    name: 'Business Cards',
    icon: 'identification-card',
    description: '2D codes encoding contact details in vCard 3.0 or MeCard format for instant smartphone import.',
    items: [
      sym('QRCode_Business_vCard', 'QR Code vCard', 'qrcode', '', 'Create QR Codes for vCard 3.0 Contacts', { formType: 'vcard', showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
      sym('DataMatrix_Business_vCard', 'Data Matrix vCard', 'datamatrix', '', 'Create Data Matrix for vCard 3.0 Contacts', { formType: 'vcard', showHrtDefault: false, settingsGroup: 'datamatrix' }),
      sym('QRCode_Business_meCard', 'QR Code MeCard', 'qrcode', '', 'Create QR Codes for MeCard Contacts', { formType: 'mecard', showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
      sym('DataMatrix_Business_meCard', 'Data Matrix MeCard', 'datamatrix', '', 'Create Data Matrix for MeCard Contacts', { formType: 'mecard', showHrtDefault: false, settingsGroup: 'datamatrix' }),
    ],
  },
  {
    id: 'events',
    name: 'Event Barcodes',
    icon: 'calendar',
    description: '2D codes encoding calendar appointments (iCalendar VEVENT) for mobile scanners.',
    items: [
      sym('QRCode_Events', 'QR Code', 'qrcode', '', 'Create QR Codes for Calendar Events', { formType: 'event', showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
      sym('DataMatrix_Events', 'Data Matrix', 'datamatrix', '', 'Create Data Matrix for Calendar Events', { formType: 'event', showHrtDefault: false, settingsGroup: 'datamatrix' }),
    ],
  },
  {
    id: 'wifi',
    name: 'Wi-Fi Barcodes',
    icon: 'wifi-high',
    description: '2D codes to share Wi-Fi credentials with iOS and Android devices automatically.',
    items: [
      sym('QRCode_Wifi', 'QR Code', 'qrcode', '', 'Create QR Codes for Wi-Fi Networks', { formType: 'wifi', showHrtDefault: false, settingsGroup: 'qrcode', codePageDefault: 'Utf_8' }),
      sym('DataMatrix_Wifi', 'Data Matrix', 'datamatrix', '', 'Create Data Matrix for Wi-Fi Networks', { formType: 'wifi', showHrtDefault: false, settingsGroup: 'datamatrix' }),
    ],
  },
];

// Build flat lookup map (case-insensitive alias friendly)
const BY_ID = new Map();
for (const cat of CATEGORIES) {
  if (cat.items) {
    for (const item of cat.items) {
      BY_ID.set(item.id.toLowerCase(), { ...item, categoryId: cat.id, categoryName: cat.name });
    }
  }
  if (cat.subgroups) {
    for (const sub of cat.subgroups) {
      for (const item of sub.items) {
        BY_ID.set(item.id.toLowerCase(), {
          ...item,
          categoryId: cat.id,
          categoryName: cat.name,
          subgroupId: sub.id,
          subgroupName: sub.name,
        });
      }
    }
  }
}

/** Lookup a symbology entry by ID (defaults to PDF417 when omitted). */
export function getSymbology(id = 'PDF417') {
  const key = String(id || 'PDF417').trim().toLowerCase();
  return BY_ID.get(key) || BY_ID.get('pdf417');
}

/** Return flat array of all 150 symbology definitions. */
export function listSymbologies() {
  const out = [];
  for (const cat of CATEGORIES) {
    if (cat.items) {
      for (const item of cat.items) {
        out.push({ ...item, categoryId: cat.id, categoryName: cat.name });
      }
    }
    if (cat.subgroups) {
      for (const sub of cat.subgroups) {
        for (const item of sub.items) {
          out.push({
            ...item,
            categoryId: cat.id,
            categoryName: cat.name,
            subgroupId: sub.id,
            subgroupName: sub.name,
          });
        }
      }
    }
  }
  return out;
}
