/**
 * Central Reactive Application State Store
 */

class StateStore {
  constructor() {
    this.subscribers = new Map();

    this.activeModule = 'generator'; // 'generator' | 'qr-studio' | 'business-cards' | 'labels'

    // Module 1: Barcode Generator
    this.generator = {
      code: 'PDF417',
      symbology: null, // Full catalog object
      data: 'This is a PDF417 by Barcode Studio',
      trimWhitespace: false,
      translateEsc: false,
      multipleBarcodes: false,
      format: 'png',
      dpi: 96,
      modulewidth: '',
      color: '#000000',
      bgcolor: '#ffffff',
      transparent: false,
      showhrt: false,
      fontname: 'Arial',
      fontsize: 10,
      codepage: 'Default',
      // PDF417 options
      pdfvariant: 'Standard',
      pdfcolumns: '',
      pdfrows: '',
      pdfeclevel: '',
      pdfcompact: false,
      pdfrowmult: 3,
      // Data Matrix options
      dmsize: 'Default',
      // QR options
      eclevel: 'M',
      // Structured forms data
      structuredFormType: 'text',
      structuredFormData: {},
      // Render output cache
      lastRender: null,
      isRendering: false,
    };

    // Module 2: QR Code Studio
    this.qrStudio = {
      preset: 'text',
      data: 'https://www.tec-it.com',
      size: 400,
      eclevel: 'M',
      transparent: false,
      color: '#000000',
      bgcolor: '#ffffff',
    };

    // Module 3: Business Cards
    this.businessCards = {
      FirstName: 'John',
      LastName: 'Doe',
      Company: 'Acme Corporation',
      Position: 'Lead Engineer',
      PhoneNumber: '+1 (555) 019-2834',
      Email: 'john.doe@example.com',
      Url: 'https://example.com',
      Address: '100 Market St, Suite 400, San Francisco, CA',
      Format: 'vcard', // 'vcard' | 'mecard'
      Symbology: 'QRCode', // 'QRCode' | 'DataMatrix' | 'PDF417'
      Template: 'classic-minimal', // 'classic-minimal' | 'executive-band' | 'accent-rail' | 'compact-split'
      Layout: 'single', // 'single' | 'a4-10up' | 'letter-10up'
      LogoDataUrl: null,
    };

    // Module 4: Label Printing
    this.labels = {
      template: 'vda4902', // 'vda4902' | 'aiag-b10' | 'gs1-shipping' | 'csv-sheet'
      fields: {
        receiver: 'BMW WERK LEIPZIG',
        receiverCity: 'LEIPZIG / GERMANY',
        dock: 'GATE 04',
        adviceNote: '12345678',
        supplierId: 'V987654',
        partNumber: '11 12 7 552 281',
        quantity: '60',
        partDescription: 'CYLINDER HEAD GASKET',
        packageId: '1J0123456789',
        batchNumber: 'B449102',
        date: '2026-11-16',
        shipFrom: 'SUPPLIER CORP',
        shipTo: 'LOGISTICS HUB 01',
        carrier: 'EXPRESS CARRIER',
        sku: 'SKU-99210-A',
        sscc: '003761234567890128',
      },
      csvText: 'Title,CodeData\nPart A,SN-00100\nPart B,SN-00101\nPart C,SN-00102',
      cols: 3,
      rows: 8,
      paperSize: 'a4',
      showhrt: true,
      symbology: 'PDF417',
    };

    // Catalog metadata cache
    this.catalog = {
      categories: [],
      symbologies: [],
      quickJump: [],
      codePages: [],
      fonts: [],
      dmSizes: [],
    };
  }

  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);
    return () => this.subscribers.get(event).delete(callback);
  }

  notify(event, data) {
    if (this.subscribers.has(event)) {
      for (const cb of this.subscribers.get(event)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in subscriber for ${event}:`, err);
        }
      }
    }
    // Also notify wildcard '*'
    if (this.subscribers.has('*')) {
      for (const cb of this.subscribers.get('*')) {
        try {
          cb({ event, data });
        } catch (err) {
          console.error(`Error in wildcard subscriber for ${event}:`, err);
        }
      }
    }
  }

  setActiveModule(moduleName) {
    if (this.activeModule !== moduleName) {
      this.activeModule = moduleName;
      this.notify('module:changed', moduleName);
    }
  }

  setGeneratorSymbology(symbology) {
    this.generator.code = symbology.id;
    this.generator.symbology = symbology;
    this.generator.data = symbology.defaultData || '';
    this.generator.translateEsc = Boolean(symbology.escapeDefault);
    this.generator.showhrt = Boolean(symbology.showHrtDefault);
    this.generator.structuredFormType = symbology.formType || 'text';

    if (symbology.codePageDefault) {
      this.generator.codepage = symbology.codePageDefault;
    }

    this.notify('generator:symbologyChanged', symbology);
  }

  updateGenerator(partial) {
    Object.assign(this.generator, partial);
    this.notify('generator:changed', this.generator);
  }
}

export const state = new StateStore();
