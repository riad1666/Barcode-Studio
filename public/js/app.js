/**
 * Main Application Bootstrapper & SPA Router
 */

import { state } from './state.js';
import { initTheme } from './ui/theme.js';
import { initModalListeners } from './ui/modal.js';
import { fetchCatalog, fetchSymbologies } from './api.js';
import { renderCategoryTree, updateActiveTreeItem } from './components/categoryTree.js';
import { initSearchPalette } from './components/searchPalette.js';
import { initOpticalStage } from './components/opticalStage.js';
import { initSequenceModal } from './components/sequenceModal.js';
import { initBarcodeGenerator } from './modules/barcodeGenerator.js';
import { initQrStudio } from './modules/qrStudio.js';
import { initBusinessCards } from './modules/businessCards.js';
import { initLabelPrinting } from './modules/labelPrinting.js';

async function bootstrap() {
  // 1. Initialize Theme & Modals
  initTheme();
  initModalListeners();

  // 2. Fetch Catalog & Symbology Metadata
  try {
    const [catalogData, symbologyList] = await Promise.all([
      fetchCatalog(),
      fetchSymbologies(),
    ]);

    state.catalog.categories = catalogData.categories || [];
    state.catalog.quickJump = catalogData.quickJump || [];
    state.catalog.codePages = catalogData.codePages || [];
    state.catalog.fonts = catalogData.fonts || [];
    state.catalog.dmSizes = catalogData.dmSizes || [];
    state.catalog.symbologies = symbologyList || [];

    // Populate advanced dropdown selects
    populateCatalogSelects(catalogData);

    // 3. Render Category Tree
    const treeContainer = document.getElementById('categoryTreeNav');
    renderCategoryTree(treeContainer, state.catalog.categories, (sym) => {
      selectSymbology(sym);
    });

    // 4. Initialize Components
    initSearchPalette(state.catalog.symbologies, (sym) => {
      selectSymbology(sym);
    });

    initOpticalStage();

    initSequenceModal((newSequenceText) => {
      const textarea = document.getElementById('barcodePayload');
      if (textarea) {
        textarea.value = newSequenceText;
        state.generator.data = newSequenceText;
        state.generator.multipleBarcodes = true;

        const batchBox = document.getElementById('toggleBatchZip');
        if (batchBox) {
          batchBox.checked = true;
          batchBox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const batchBtn = document.getElementById('batchZipDownloadBtn');
        if (batchBtn) batchBtn.style.display = 'inline-flex';

        // Synchronously update row count badge and dispatch input event
        const badge = document.getElementById('payloadRowBadge');
        if (badge) {
          const lines = newSequenceText.split('\n').filter((l) => l.trim().length > 0);
          badge.textContent = `${lines.length} ${lines.length === 1 ? 'row' : 'rows'}`;
        }

        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        // Trigger render
        state.notify('generator:changed', state.generator);
      }
    });

    // 5. Initialize Modules
    initBarcodeGenerator();
    initQrStudio();
    initBusinessCards();
    initLabelPrinting();

    // 6. Navigation Tabs Switcher
    bindMainNav();

    // 7. Route initial URL
    handleInitialRoute();

    // Listen to popstate
    window.addEventListener('popstate', () => {
      handleInitialRoute();
    });

  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
}

function selectSymbology(sym) {
  state.setGeneratorSymbology(sym);
  // Switch to generator module if on another module
  if (state.activeModule !== 'generator') {
    switchActiveModule('generator');
  }
  // Push clean bookmarkable URL
  const path = `/en/${sym.id.toLowerCase()}`;
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
}

function handleInitialRoute() {
  const path = window.location.pathname.replace(/^\/en/, '').replace(/^\//, '');
  if (!path) return;

  // Check for module paths
  if (path === 'qr' || path === 'qr-studio') {
    switchActiveModule('qr-studio');
    return;
  }
  if (path === 'cards' || path === 'business-cards') {
    switchActiveModule('business-cards');
    return;
  }
  if (path === 'labels' || path === 'label-printing') {
    switchActiveModule('labels');
    return;
  }

  // Check if matches a symbology slug
  const matched = state.catalog.symbologies.find((s) => s.id.toLowerCase() === path.toLowerCase());
  if (matched) {
    state.setGeneratorSymbology(matched);
    switchActiveModule('generator');
  }
}

function bindMainNav() {
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetModule = tab.dataset.module;
      switchActiveModule(targetModule);
    });
  });
}

function switchActiveModule(moduleName) {
  state.setActiveModule(moduleName);

  // Update tabs
  document.querySelectorAll('.nav-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.module === moduleName);
  });

  // Update views
  document.querySelectorAll('.module-view').forEach((v) => {
    v.classList.toggle('active', v.id === `module-${moduleName}`);
  });
}

function populateCatalogSelects(catalogData) {
  // Populate Code Pages
  const codePageSelect = document.getElementById('advCodePage');
  if (codePageSelect && catalogData.codePages) {
    codePageSelect.innerHTML = catalogData.codePages
      .map((cp) => `<option value="${cp.value}">${cp.label}</option>`)
      .join('');
  }

  // Populate Data Matrix Sizes
  const dmSizeSelect = document.getElementById('advDmSize');
  if (dmSizeSelect && catalogData.dmSizes) {
    dmSizeSelect.innerHTML = catalogData.dmSizes
      .map((dm) => `<option value="${dm.value}">${dm.label}</option>`)
      .join('');
  }

  // Populate Fonts
  const fontSelect = document.getElementById('settingFontFamily');
  if (fontSelect && catalogData.fonts) {
    fontSelect.innerHTML = catalogData.fonts
      .map((f) => `<option value="${f}">${f}</option>`)
      .join('');
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
