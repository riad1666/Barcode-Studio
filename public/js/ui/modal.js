/**
 * Accessible Modal Controller with Focus Trapping and Keyboard Dismissal
 */

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let activeTriggerElement = null;
let currentOpenModal = null;

export function openModal(modalId, triggerElement = null) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal) return;

  activeTriggerElement = triggerElement || document.activeElement;
  currentOpenModal = modal;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  // Focus the first focusable element inside the modal
  const focusables = modal.querySelectorAll(FOCUSABLE_SELECTOR);
  if (focusables.length > 0) {
    setTimeout(() => focusables[0].focus(), 50);
  }

  document.body.style.overflow = 'hidden';
}

export function closeModal(modalId = null) {
  const modal = modalId ? (typeof modalId === 'string' ? document.getElementById(modalId) : modalId) : currentOpenModal;
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  if (activeTriggerElement && typeof activeTriggerElement.focus === 'function') {
    activeTriggerElement.focus();
  }

  if (currentOpenModal === modal) {
    currentOpenModal = null;
  }
}

export function initModalListeners() {
  // Global Escape key handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentOpenModal) {
      closeModal(currentOpenModal);
    }
  });

  // Modal backdrop click & close button handlers
  document.addEventListener('click', (e) => {
    if (e.target.matches('.modal-overlay')) {
      closeModal(e.target);
    } else if (e.target.closest('[data-modal-close]')) {
      const modal = e.target.closest('.modal-overlay');
      if (modal) closeModal(modal);
    }
  });

  // Trap focus within open modal
  document.addEventListener('keydown', (e) => {
    if (!currentOpenModal || e.key !== 'Tab') return;
    const focusables = Array.from(currentOpenModal.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  });
}
