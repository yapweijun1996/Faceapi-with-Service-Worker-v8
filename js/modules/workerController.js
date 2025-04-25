// Worker Controller Module: handles service worker registration, model loading, and message handling

import { updateStatus, showToast } from './ui.js';

const SERVICE_WORKER_SCRIPT = './faceDetectionServiceWorker.js';
const SERVICE_WORKER_NAME = 'faceDetectionServiceWorker.js';

/**
 * Initialize the service worker, load models, and set up message listener.
 * @param {function} onDetectCallback - Called with {detections, displaySize} on detection.
 * @returns {Promise<ServiceWorker>|null} Active service worker instance.
 */
export async function initWorker(onDetectCallback) {
  console.log('🔍 Initializing worker controller...');
  if (!('serviceWorker' in navigator)) {
    console.error('❌ Service workers are not supported in this browser.');
    return null;
  }

  // Register or reuse existing service worker
  updateStatus('Registering service worker...', 10);
  console.log('🔄 Getting service worker registrations...');
  const registrations = await navigator.serviceWorker.getRegistrations();
  console.log(`📋 Found ${registrations.length} registered service workers`);
  
  let sw;
  const existing = registrations.find(reg =>
    reg.active && reg.active.scriptURL.endsWith(SERVICE_WORKER_NAME)
  );
  
  if (existing) {
    console.log('✅ Found existing service worker:', existing.active.scriptURL);
    sw = existing.active;
  } else {
    console.log('🆕 Registering new service worker:', SERVICE_WORKER_SCRIPT);
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_SCRIPT);
    console.log('⏳ Waiting for service worker to become active...');
    
    // Wait for the service worker to be ready if it's installing
    if (registration.installing) {
      console.log('⚙️ Service worker is installing...');
      sw = registration.installing;
      
      // Wait for the service worker to be activated
      await new Promise(resolve => {
        sw.addEventListener('statechange', () => {
          console.log(`📢 Service worker state changed to: ${sw.state}`);
          if (sw.state === 'activated') {
            resolve();
          }
        });
      });
    } else {
      sw = registration.active;
    }
    
    console.log('✅ Service worker is now active');
  }

  // Listen for messages from worker
  updateStatus('Service worker ready. Initializing listener...', 30);
  console.log('🎧 Setting up message listener...');
  
  navigator.serviceWorker.addEventListener('message', event => {
    console.log('📨 Received message from service worker:', event.data);
    const { type, data } = event.data;
    switch (type) {
      case 'DETECTION_RESULT':
        console.log('🔍 Detection result received:', 
          data.detections ? 
          `Found ${data.detections[0]?.length || 0} faces` : 
          'No faces detected');
        onDetectCallback(data);
        break;
      case 'MODELS_LOADED':
        console.log('📚 Face detection models loaded successfully');
        updateStatus('Models loaded. Ready to use!', 100);
        document.querySelectorAll('.face-section__controls .button').forEach(btn => btn.disabled = false);
        showToast('Models loaded. Click Start Camera to begin.', 'info');
        break;
      default:
        console.log('❓ Unhandled worker message type:', type);
    }
  });

  // Load models in the worker
  updateStatus('Listener initialized. Loading models...', 50);
  await delay(500);
  updateStatus('Loading models...', 60);
  console.log('📤 Sending LOAD_MODELS message to service worker');
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