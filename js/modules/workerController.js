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
  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.error('Service workers are not supported in this browser.');
    showToast('Your browser does not support service workers.', 'error');
    return null;
  }

  try {
    // Register or reuse existing service worker
    updateStatus('Registering service worker...', 10);
    
    // Get all registered service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    
    // Try to find an existing worker with our name
    const existing = registrations.find(reg =>
      (reg.active && reg.active.scriptURL.endsWith(SERVICE_WORKER_NAME)) ||
      (reg.installing && reg.installing.scriptURL.endsWith(SERVICE_WORKER_NAME))
    );
    
    let serviceWorkerRegistration;
    
    // Use existing or register a new service worker
    if (existing) {
      console.log('Using existing service worker registration');
      serviceWorkerRegistration = existing;
    } else {
      console.log('Registering new service worker');
      serviceWorkerRegistration = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
    }
    
    // Wait for the service worker to be ready
    updateStatus('Waiting for service worker to activate...', 20);
    
    // Get an active service worker
    const sw = await getActiveServiceWorker(serviceWorkerRegistration);
    
    if (!sw) {
      throw new Error('Failed to get an active service worker');
    }
    
    console.log('Service worker is active and ready');
    
    // Listen for messages from worker
    updateStatus('Service worker ready. Initializing listener...', 30);
    
    navigator.serviceWorker.addEventListener('message', event => {
      if (!event.data) return;
      
      const { type, data, error } = event.data;
      switch (type) {
        case 'DETECTION_RESULT':
          if (onDetectCallback && data) {
            onDetectCallback(data);
          }
          break;
        case 'MODELS_LOADED':
          updateStatus('Models loaded. Ready to use!', 100);
          document.querySelectorAll('.face-section__controls .button').forEach(btn => btn.disabled = false);
          showToast('Models loaded. Click Start Camera to begin.', 'info');
          break;
        case 'MODELS_ERROR':
          updateStatus('Error loading models. Please check console.', 100);
          showToast('Failed to load face detection models: ' + (error || 'Unknown error'), 'error');
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
    
    // Send message to load models
    sw.postMessage({ type: 'INIT' });
    updateStatus('Waiting for models to load...', 70);

    return sw;
  } catch (error) {
    console.error('Service worker initialization error:', error);
    showToast('Failed to initialize face detection. Please reload the page.', 'error');
    updateStatus('Service worker initialization failed.', 100);
    return null;
  }
}

/**
 * Wait for a service worker to become active
 * @param {ServiceWorkerRegistration} registration - Service worker registration
 * @returns {Promise<ServiceWorker>} Active service worker
 */
async function getActiveServiceWorker(registration) {
  // If worker is already active, use it
  if (registration.active) {
    return registration.active;
  }
  
  // Wait for the installing worker to become active
  return new Promise((resolve, reject) => {
    // If there's an installing worker, wait for it
    if (registration.installing) {
      registration.installing.addEventListener('statechange', function() {
        if (this.state === 'activated') {
          console.log('Service worker activated');
          resolve(registration.active);
        }
      });
      
      // Set a timeout to avoid hanging indefinitely
      setTimeout(() => {
        if (registration.active) {
          resolve(registration.active);
        } else {
          reject(new Error('Service worker activation timed out'));
        }
      }, 10000); // 10 second timeout
    } else if (registration.waiting) {
      // If there's a waiting worker, try to activate it
      registration.waiting.postMessage({type: 'SKIP_WAITING'});
      
      // Check again after a delay
      setTimeout(() => {
        if (registration.active) {
          resolve(registration.active);
        } else {
          reject(new Error('Service worker in waiting state could not be activated'));
        }
      }, 3000);
    } else {
      reject(new Error('No installing or waiting service worker found'));
    }
  });
}

/**
 * Utility to pause execution for given milliseconds.
 * @param {number} ms
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
} 