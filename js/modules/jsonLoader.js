/**
 * JSON Loader Module
 * Handles loading face descriptor JSON files for verification.
 */

import { setDescriptors, getAction } from './faceService.js';
import { showToast } from './ui.js';
import { startCamera } from './camera.js';

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
      // Read and parse the JSON file
      const text = await file.text();
      const parsed = JSON.parse(text);
      
      // Convert loaded data into Float32Array descriptors
      const descriptors = Object.values(parsed)
        .map(item => {
          if (Array.isArray(item)) {
            return new Float32Array(item);
          }
          if (item && typeof item === 'object') {
            return new Float32Array(Object.values(item));
          }
          return null;
        })
        .filter(d => d !== null);

      // Handle empty or invalid JSON
      if (descriptors.length === 0) {
        showToast('No valid face descriptors found in the JSON file.', 'error');
        return;
      }

      // Save the descriptors for verification
      setDescriptors(descriptors);
      showToast(`${descriptors.length} face descriptor(s) loaded successfully.`, 'success');
      
      // If in verification mode, automatically start camera
      if (getAction() === 'verify') {
        startCamera();
        showToast('Camera started for verification. Position your face in the frame.', 'info');
      }
    } catch (error) {
      console.error('Error loading JSON:', error);
      showToast('Failed to load JSON file. Please check the file format.', 'error');
    }
  });
} 