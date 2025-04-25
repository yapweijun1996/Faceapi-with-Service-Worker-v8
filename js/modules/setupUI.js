// SetupUI Module: initializes UI controls, visibility, and event handlers

import { showToast } from './ui.js';
import { startCamera, stopCamera } from './camera.js';
import { setAction, resetRegistration } from './faceService.js';

/**
 * Initialize UI controls: buttons, upload module visibility, and event handlers.
 */
export function setupUI() {
  // Initialize stepper at first step
  updateStepper(1);
  // Disable face control buttons until models are loaded
  document.querySelectorAll('.face-section__controls .button').forEach(btn => btn.disabled = true);

  // Hide upload module by default
  const uploadModule = document.getElementById('upload-module');
  if (uploadModule) uploadModule.style.display = 'none';

  // Button references
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const registerBtn = document.getElementById('register-face');
  const verifyBtn = document.getElementById('verify-face');

  // Event bindings
  if (startBtn) startBtn.addEventListener('click', () => {
    setAction('');
    startCamera();
    // Advance stepper to Start Camera step
    updateStepper(2);
  });

  if (stopBtn) stopBtn.addEventListener('click', () => {
    stopCamera();
    setAction('');
  });

  if (registerBtn) registerBtn.addEventListener('click', () => {
    setAction('register');
    resetRegistration();
    showToast('Registration mode activated.', 'info');
    if (uploadModule) uploadModule.style.display = 'none';
    startCamera();
    // Advance stepper to Register/Verify step
    updateStepper(3);
  });

  if (verifyBtn) verifyBtn.addEventListener('click', () => {
    setAction('verify');
    showToast('Verification mode activated. Please upload descriptor JSON.', 'info');
    if (uploadModule) uploadModule.style.display = 'block';
    // Advance stepper to Register/Verify step
    updateStepper(3);
  });
}

/**
 * Update the wizard stepper UI (1-based index).
 * @param {number} stepIndex
 */
export function updateStepper(stepIndex) {
  const items = document.querySelectorAll('.stepper__item');
  items.forEach((item, idx) => {
    item.classList.remove('is-current', 'is-complete');
    if (idx < stepIndex - 1) item.classList.add('is-complete');
    else if (idx === stepIndex - 1) item.classList.add('is-current');
  });
} 