// Face Service Module: manages face registration and verification state

import { showToast } from './ui.js';
import { stopCamera } from './camera.js';
import { stopDetection } from './detection.js';

// Internal state
let action = '';
let registeredDescriptors = [];
let registrationCompleted = false;
const maxCaptures = 3;
const threshold = 0.3; // Euclidean distance threshold

/**
 * Set the current mode: 'register' or 'verify'
 * @param {string} mode
 */
export function setAction(mode) {
  action = mode;
}

/**
 * Get the current mode
 * @returns {string}
 */
export function getAction() {
  return action;
}

/**
 * Reset registration state and descriptors
 */
export function resetRegistration() {
  registeredDescriptors = [];
  registrationCompleted = false;
}

/**
 * Handle a new face descriptor for registration
 * @param {Float32Array} descriptor
 */
export function handleRegister(descriptor) {
  if (!descriptor || registrationCompleted) return;
  registeredDescriptors.push(descriptor);
  if (registeredDescriptors.length >= maxCaptures) {
    registrationCompleted = true;
    showToast('Registration completed!', 'success');
    action = '';
    // Stop detection and camera
    stopDetection();
    stopCamera();

    // Prepare JSON download of descriptors
    const data = registeredDescriptors.map(d => Array.from(d));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'face_descriptors.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Handle a new face descriptor for verification
 * @param {Float32Array} descriptor
 */
export function handleVerify(descriptor) {
  if (!registeredDescriptors.length) {
    showToast('Please upload descriptor JSON before verifying.', 'info');
    return;
  }
  let match = false;
  let distance = 0;

  for (const saved of registeredDescriptors) {
    if (descriptor.length !== saved.length) continue;
    distance = euclideanDistance(descriptor, saved);
    if (distance < threshold) {
      match = true;
      break;
    }
  }

  if (match) {
    // Successful verification
    stopDetection();
    stopCamera();
    showToast(`Face Verified! Distance: ${(distance * 100).toFixed(2)}%`, 'success');
    action = '';
  } else {
    showToast('Face not recognized. Please try again.', 'error');
    // Keep detection running for retry
  }
}

/**
 * Load descriptors directly from JSON data
 * @param {Float32Array[]} descriptors
 */
export function setDescriptors(descriptors) {
  resetRegistration();
  registeredDescriptors = descriptors;
}

/**
 * Compute Euclidean distance between two feature vectors
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
} 