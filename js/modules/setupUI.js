// SetupUI Module: initializes UI controls, visibility, and event handlers

import { showToast } from './ui.js';
import { startCamera, stopCamera } from './camera.js';
import { setAction, resetRegistration } from './faceService.js';

/**
 * Initialize UI controls: buttons, upload module visibility, and event handlers.
 */
export function setupUI() {
  // Disable face control buttons until models are loaded
  document.querySelectorAll('.face-section__controls .button').forEach(btn => btn.disabled = true);

  // Hide upload module by default
  const uploadModule = document.getElementById('upload-module');
  if (uploadModule) {
    uploadModule.style.display = 'none';
  }

  // Initialize button references
  const startBtn = document.getElementById('start-camera');
  const stopBtn = document.getElementById('stop-camera');
  const registerBtn = document.getElementById('register-face');
  const verifyBtn = document.getElementById('verify-face');

  // Start Camera button
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      setAction('');
      startCamera();
      showToast('Camera started', 'info');
    });
  }

  // Stop Camera button
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopCamera();
      setAction('');
      showToast('Camera stopped', 'info');
    });
  }

  // Register Face button
  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      setAction('register');
      resetRegistration();
      showToast('Registration mode activated. Position your face in the frame.', 'info');
      
      // Hide upload module during registration
      if (uploadModule) {
        uploadModule.style.display = 'none';
      }
      
      startCamera();
    });
  }

  // Verify Face button
  if (verifyBtn) {
    verifyBtn.addEventListener('click', () => {
      setAction('verify');
      showToast('Verification mode activated. Please upload descriptor JSON.', 'info');
      
      // Show upload module during verification
      if (uploadModule) {
        uploadModule.style.display = 'block';
      }
    });
  }
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