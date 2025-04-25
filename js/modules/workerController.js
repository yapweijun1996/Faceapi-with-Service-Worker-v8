// Worker Controller Module: handles service worker registration, model loading, and message handling

import { updateStatus, showToast } from './ui.js';

const SERVICE_WORKER_SCRIPT = './js/faceDetectionServiceWorker.js';
const SERVICE_WORKER_NAME = 'faceDetectionServiceWorker.js';

/**
 * Initialize the service worker, load models, and set up message listener.
 * @param {function} onDetectCallback - Called with {detections, displaySize} on detection.
 * @returns {Promise<ServiceWorker>|null} Active service worker instance.
 */
export async function initWorker(onDetectCallback) {
  if (!('serviceWorker' in navigator)) {
    console.error('Service workers are not supported in this browser.');
    return null;
  }

  // Register or reuse existing service worker
  updateStatus('Registering service worker...', 10);
  const registrations = await navigator.serviceWorker.getRegistrations();
  let sw;
  const existing = registrations.find(reg =>
    reg.active && reg.active.scriptURL.endsWith(SERVICE_WORKER_NAME)
  );
  if (existing) {
    sw = existing.active;
  } else {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
    sw = registration.active;
  }

  // Listen for messages from worker
  updateStatus('Service worker ready. Initializing listener...', 30);
  navigator.serviceWorker.addEventListener('message', event => {
    const { type, data, error } = event.data;
    switch (type) {
      case 'DETECTION_RESULT':
        onDetectCallback(data);
        break;
      case 'MODELS_LOADED':
        updateStatus('Models loaded. Ready to use!', 100);
        document.querySelectorAll('.face-section__controls .button').forEach(btn => btn.disabled = false);
        showToast('Models loaded. Click Start Camera to begin.', 'info');
        break;
      case 'MODELS_ERROR':
        updateStatus('Error loading models. Please check console.', 100);
        showToast('Failed to load face detection models: ' + error, 'error');
        console.error('Model loading error:', error);
        break;
      default:
        console.log('Unhandled worker message type:', type);
    }
  });

  // Load models in the worker
  updateStatus('Listener initialized. Loading models...', 50);
  await delay(500);
  updateStatus('Loading models...', 60);
  sw.postMessage({ type: 'LOAD_MODELS' });
  updateStatus('Waiting for models to load...', 70);

  return sw;
}

/**
 * Utility to pause execution for given milliseconds.
 * @param {number} ms
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
} 