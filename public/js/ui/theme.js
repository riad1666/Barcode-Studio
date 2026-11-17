/**
 * Theme Controller — Light Studio Paper & Dark OLED IDE
 * Dual-theme management with localStorage persistence and prefers-color-scheme fallback.
 */

import { renderIcon } from './icons.js';

const STORAGE_KEY = 'studio_theme';
const THEME_PAPER = 'paper';
const THEME_OLED = 'oled';

export function getTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === THEME_PAPER || saved === THEME_OLED || saved === 'light' || saved === 'dark') {
    return saved === 'light' ? THEME_PAPER : saved === 'dark' ? THEME_OLED : saved;
  }
  // System preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return THEME_OLED;
  }
  return THEME_PAPER;
}

export function setTheme(theme) {
  const target = theme === 'light' ? THEME_PAPER : theme === 'dark' ? THEME_OLED : theme;
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem(STORAGE_KEY, target);
  updateThemeToggleUi(target);
  // Dispatch custom event for listeners (like optical stage)
  window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: target } }));
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === THEME_OLED ? THEME_PAPER : THEME_OLED;
  setTheme(next);
  return next;
}

function updateThemeToggleUi(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isDark = theme === THEME_OLED;
  btn.innerHTML = isDark ? renderIcon('sun', 18) : renderIcon('moon', 18);
  btn.setAttribute('aria-label', isDark ? 'Switch to Light Studio Paper theme' : 'Switch to Dark OLED IDE theme');
  btn.setAttribute('title', isDark ? 'Switch to Light (Studio Paper)' : 'Switch to Dark (OLED IDE)');
}

export function initTheme() {
  const initial = getTheme();
  setTheme(initial);

  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      toggleTheme();
    });
  }

  // React to system color scheme changes if user hasn't explicitly set a preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? THEME_OLED : THEME_PAPER);
      }
    });
  }
}
