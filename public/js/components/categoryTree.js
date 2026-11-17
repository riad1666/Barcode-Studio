/**
 * Collapsible 13-Category Tree Component with Nested Mobile Tagging Subgroups
 */

import { renderIcon } from '../ui/icons.js';
import { state } from '../state.js';

export function renderCategoryTree(container, categories, onSelectSymbology) {
  if (!container || !categories) return;

  container.innerHTML = '';

  for (const cat of categories) {
    const groupEl = document.createElement('div');
    groupEl.className = 'category-group';
    groupEl.dataset.categoryId = cat.id;

    // Header with category icon, title, and chevron
    const headerBtn = document.createElement('button');
    headerBtn.className = 'category-header';
    headerBtn.type = 'button';
    headerBtn.setAttribute('aria-expanded', 'true');

    const catIcon = cat.icon || 'barcode';
    headerBtn.innerHTML = `
      <span class="category-header-title">
        ${renderIcon(catIcon, 16)}
        <span>${cat.name}</span>
      </span>
      <span class="chevron">${renderIcon('chevronDown', 12)}</span>
    `;

    headerBtn.addEventListener('click', () => {
      const isCollapsed = groupEl.classList.toggle('collapsed');
      headerBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    });

    groupEl.appendChild(headerBtn);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'category-items';

    // Standard items
    if (cat.items && cat.items.length > 0) {
      for (const item of cat.items) {
        const itemBtn = createItemButton(item, onSelectSymbology);
        itemsContainer.appendChild(itemBtn);
      }
    }

    // Nested subgroups (Mobile Tagging)
    if (cat.subgroups && cat.subgroups.length > 0) {
      for (const sub of cat.subgroups) {
        const subGroupEl = document.createElement('div');
        subGroupEl.className = 'subgroup-wrapper';

        const subHeader = document.createElement('div');
        subHeader.className = 'subgroup-header';
        subHeader.textContent = sub.name;
        subGroupEl.appendChild(subHeader);

        const subItemsEl = document.createElement('div');
        subItemsEl.className = 'subgroup-items';

        for (const item of sub.items) {
          const itemBtn = createItemButton(item, onSelectSymbology);
          subItemsEl.appendChild(itemBtn);
        }

        subGroupEl.appendChild(subItemsEl);
        itemsContainer.appendChild(subGroupEl);
      }
    }

    groupEl.appendChild(itemsContainer);
    container.appendChild(groupEl);
  }

  // Update active state when symbology changes
  state.subscribe('generator:symbologyChanged', (sym) => {
    updateActiveTreeItem(container, sym.id);
  });
}

function createItemButton(item, onSelectSymbology) {
  const btn = document.createElement('button');
  btn.className = 'category-item';
  btn.type = 'button';
  btn.dataset.symId = item.id;
  btn.title = item.description || item.name;

  btn.innerHTML = `
    <span>${item.name}</span>
  `;

  btn.addEventListener('click', () => {
    onSelectSymbology(item);
  });

  return btn;
}

export function updateActiveTreeItem(container, activeId) {
  if (!container) return;
  const targetId = String(activeId || '').toLowerCase();

  const allItems = container.querySelectorAll('.category-item');
  for (const item of allItems) {
    const isMatch = (item.dataset.symId || '').toLowerCase() === targetId;
    item.classList.toggle('active', isMatch);
    if (isMatch) {
      // Ensure parent category group is expanded
      const group = item.closest('.category-group');
      if (group && group.classList.contains('collapsed')) {
        group.classList.remove('collapsed');
        const header = group.querySelector('.category-header');
        if (header) header.setAttribute('aria-expanded', 'true');
      }
    }
  }
}
