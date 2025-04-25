// UI Module: handles status updates and toast notifications

/**
 * Update status text and progress bar in the UI.
 * @param {string} text - Message to display in status element.
 * @param {number} percent - Value to set for the progress bar (0-100).
 */
export function updateStatus(text, percent) {
  const statusEl = document.querySelector('.status-indicator__text');
  const progressEl = document.querySelector('.status-indicator__progress');
  if (statusEl) statusEl.innerText = text;
  if (progressEl && typeof percent === 'number') progressEl.value = percent;
}

/**
 * Show a temporary toast notification.
 * @param {string} message - Text content of the toast.
 * @param {'info'|'success'|'error'} type - Style variant of the toast.
 * @param {number} duration - Duration to display toast (ms).
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
} 