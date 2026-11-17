/**
 * Toast and Alert Notifications Manager
 * Full WCAG accessibility with role="alert" / role="status".
 */

import { renderIcon } from './icons.js';

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toastContainer';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

  const iconName = type === 'success' ? 'check' : type === 'error' ? 'alertCircle' : 'sparkle';
  toast.innerHTML = `
    <span class="toast-icon">${renderIcon(iconName, 18)}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  const timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);

  toast.addEventListener('click', () => {
    clearTimeout(timer);
    toast.remove();
  });
}

export function showValidationSummary(errors, summaryContainerId = 'validationSummary') {
  const container = document.getElementById(summaryContainerId);
  if (!container) return;

  const errorKeys = Object.keys(errors || {});
  if (errorKeys.length === 0) {
    clearValidationSummary(summaryContainerId);
    return;
  }

  container.innerHTML = `
    <span class="validation-summary-icon">${renderIcon('alertCircle', 20)}</span>
    <div class="validation-summary-content">
      <div class="validation-summary-title">Please correct ${errorKeys.length} validation ${errorKeys.length === 1 ? 'error' : 'errors'}:</div>
      <ul class="validation-summary-list">
        ${errorKeys.map((key) => `<li><a href="#field_${key}">${escapeHtml(errors[key])}</a></li>`).join('')}
      </ul>
    </div>
  `;
  container.classList.add('is-active');
  container.focus();
}

export function clearValidationSummary(summaryContainerId = 'validationSummary') {
  const container = document.getElementById(summaryContainerId);
  if (container) {
    container.innerHTML = '';
    container.classList.remove('is-active');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
