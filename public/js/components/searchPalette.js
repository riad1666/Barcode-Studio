/**
 * Ctrl+K Quick Search Modal across all 13 categories and 150 symbologies
 */

import { openModal, closeModal } from '../ui/modal.js';
import { renderIcon } from '../ui/icons.js';
import { state } from '../state.js';

let allSymbologies = [];
let onSelectCallback = null;
let selectedIndex = 0;
let currentResults = [];

export function initSearchPalette(symbologies, onSelectSymbology) {
  allSymbologies = symbologies || [];
  onSelectCallback = onSelectSymbology;

  const modal = document.getElementById('searchPaletteModal');
  const input = document.getElementById('searchPaletteInput');
  const resultsContainer = document.getElementById('searchPaletteResults');

  if (!modal || !input || !resultsContainer) return;

  // Filter input
  input.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    filterResults(q, resultsContainer);
  });

  // Keyboard navigation inside input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        updateHighlight(resultsContainer);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentResults.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        updateHighlight(resultsContainer);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentResults[selectedIndex]) {
        selectItem(currentResults[selectedIndex]);
      }
    }
  });

  // Global Ctrl+K / Cmd+K listener
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearchPalette();
    }
  });

  // Search buttons in UI
  document.querySelectorAll('[data-open-search]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openSearchPalette();
    });
  });
}

export function openSearchPalette() {
  const modal = document.getElementById('searchPaletteModal');
  const input = document.getElementById('searchPaletteInput');
  const resultsContainer = document.getElementById('searchPaletteResults');

  if (!modal || !input || !resultsContainer) return;

  input.value = '';
  filterResults('', resultsContainer);
  openModal(modal);
  setTimeout(() => input.focus(), 80);
}

function filterResults(query, container) {
  if (!query) {
    // Show top popular symbologies by default
    currentResults = allSymbologies.slice(0, 15);
  } else {
    const cleanQuery = query.toLowerCase().trim();
    // Normalize query into clean tokens (stripping punctuation like parentheses, hyphens, underscores)
    const tokens = cleanQuery.replace(/[()_-]/g, ' ').split(/\s+/).filter(Boolean);

    const scored = [];
    for (const s of allSymbologies) {
      const name = (s.name || '').toLowerCase();
      const id = (s.id || '').toLowerCase();
      const bcid = (s.bcid || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      const cat = (s.categoryName || '').toLowerCase();
      const haystack = `${name} ${id} ${bcid} ${desc} ${cat}`;

      let score = 0;

      // Exact matches
      if (name === cleanQuery) {
        score += 1000;
      } else if (id === cleanQuery.replace(/\s+/g, '')) {
        score += 900;
      } else if (name.startsWith(cleanQuery)) {
        score += 800;
      } else if (name.includes(cleanQuery)) {
        score += 600;
      } else if (id.includes(cleanQuery.replace(/\s+/g, ''))) {
        score += 500;
      } else if (bcid && bcid.includes(cleanQuery.replace(/\s+/g, ''))) {
        score += 300;
      } else if (desc.includes(cleanQuery)) {
        score += 100;
      } else if (cat.includes(cleanQuery)) {
        score += 50;
      }

      // Token-based matching (handles 'GS1 Digital Link (QR)' matching 'GS1 Digital Link QR code')
      if (tokens.length > 0) {
        const allTokensMatch = tokens.every((t) => haystack.includes(t));
        if (allTokensMatch) {
          score += 250;
          const nameTokens = tokens.filter((t) => name.includes(t)).length;
          score += nameTokens * 50;
        }
      }

      if (score > 0) {
        scored.push({ item: s, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    currentResults = scored.map((entry) => entry.item);
  }

  selectedIndex = 0;
  renderResults(container);
}

function renderResults(container) {
  container.innerHTML = '';

  if (currentResults.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--color-text-muted); font-size: var(--text-sm);">
        No matching symbologies found.
      </div>
    `;
    return;
  }

  currentResults.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = `search-result-item ${index === selectedIndex ? 'selected' : ''}`;
    itemEl.dataset.index = index;

    itemEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--color-primary);">${renderIcon('barcode', 16)}</span>
          <span style="font-weight: 600; font-size: var(--text-sm);">${item.name}</span>
        </div>
        <span class="badge">${item.categoryName || 'Symbology'}</span>
      </div>
      <div style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px;">
        ${item.description || item.id}
      </div>
    `;

    itemEl.addEventListener('click', () => {
      selectItem(item);
    });

    itemEl.addEventListener('mouseenter', () => {
      selectedIndex = index;
      updateHighlight(container);
    });

    container.appendChild(itemEl);
  });

  updateHighlight(container);
}

function updateHighlight(container) {
  const items = container.querySelectorAll('.search-result-item');
  items.forEach((el, idx) => {
    el.classList.toggle('selected', idx === selectedIndex);
    if (idx === selectedIndex) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectItem(item) {
  closeModal('searchPaletteModal');
  if (onSelectCallback) {
    onSelectCallback(item);
  }
}
