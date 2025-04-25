// JSON Loader Module: handles loading face descriptor JSON files

import { setDescriptors, getAction } from './faceService.js';
import { showToast } from './ui.js';
import { startCamera } from './camera.js';
import { updateStepper } from './setupUI.js';

/**
 * Initialize JSON file input handler for loading face descriptors.
 */
export function initJsonLoader() {
  const fileInput = document.getElementById('jsonFileInput');
  if (!fileInput) return;

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Convert loaded data into Float32Array descriptors
      const descriptors = Object.values(parsed)
        .map(item => {
          if (Array.isArray(item)) return new Float32Array(item);
          if (item && typeof item === 'object') return new Float32Array(Object.values(item));
          return null;
        })
        .filter(d => d !== null);

      if (descriptors.length === 0) {
        showToast('No valid descriptors found in JSON.', 'error');
        return;
      }

      setDescriptors(descriptors);
      showToast('Descriptor JSON loaded.', 'success');
      // Advance wizard to 'Start Camera' step
      updateStepper(2);
      // If in verification mode, automatically start camera
      if (getAction() === 'verify') {
        startCamera();
        showToast('Camera started for verification.', 'info');
      }
    } catch (error) {
      console.error('Error loading JSON:', error);
      showToast('Failed to load JSON.', 'error');
    }
  });
} 