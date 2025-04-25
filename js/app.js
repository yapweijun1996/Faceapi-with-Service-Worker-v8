/**
 * Face API Demo Application
 * Main application module for camera handling and face detection
 */

// Import modules
import { initCamera, stopCamera, getVideoElement, captureFrame } from './camera.js';
import { showToast, updateDetectionStatus, showError, hideLoader, showLoader } from './ui.js';

// Application state
let faceDetectionWorker = null;
let isInitialized = false;
let isProcessingFrame = false;
let detectionInterval = null;
let lastDetectionTime = 0;
let consecutiveNoFaces = 0;
const MAX_NO_FACE_FRAMES = 10;
const DETECTION_INTERVAL = 150; // ms between detections

/**
 * Initialize the face detection worker
 * @returns {Promise<boolean>} Success status
 */
async function initFaceDetectionWorker() {
  showLoader('Initializing face detection...');
  
  try {
    // Register service worker if supported
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.register('./js/faceDetectionServiceWorker.js', {
        scope: './'
      });
      
      console.log('Service Worker registered with scope:', registration.scope);
    } else {
      console.warn('Service Workers not supported in this browser');
    }
    
    // Create a dedicated worker for face detection
    faceDetectionWorker = new Worker('./js/faceDetectionServiceWorker.js');
    
    // Setup message and error handlers
    faceDetectionWorker.onmessage = handleWorkerMessage;
    faceDetectionWorker.onerror = handleWorkerError;
    
    // Initialize the worker
    faceDetectionWorker.postMessage({ type: 'INIT' });
    
    // Set timeout for initialization (fail after 10 seconds)
    const initTimeout = setTimeout(() => {
      if (!isInitialized) {
        showError('Face detection initialization timed out');
        faceDetectionWorker.terminate();
        faceDetectionWorker = null;
      }
    }, 10000);
    
    // Wait for the worker to signal it's ready
    return new Promise((resolve) => {
      const messageHandler = (event) => {
        const { type } = event.data;
        
        if (type === 'READY' || type === 'MODELS_LOADED') {
          clearTimeout(initTimeout);
          faceDetectionWorker.removeEventListener('message', messageHandler);
          isInitialized = true;
          hideLoader();
          showToast('Face detection ready');
          resolve(true);
        } else if (type === 'DETECTION_ERROR' && event.data.data && event.data.data.fatal) {
          clearTimeout(initTimeout);
          faceDetectionWorker.removeEventListener('message', messageHandler);
          showError(`Face detection initialization failed: ${event.data.data.error}`);
          faceDetectionWorker.terminate();
          faceDetectionWorker = null;
          resolve(false);
        }
      };
      
      faceDetectionWorker.addEventListener('message', messageHandler);
    });
  } catch (error) {
    hideLoader();
    showError(`Failed to initialize face detection: ${error.message}`);
    console.error('Worker initialization error:', error);
    return false;
  }
}

/**
 * Handle messages from the worker
 * @param {MessageEvent} event - Message event from worker
 */
function handleWorkerMessage(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'FACE_DETECTED':
      // Face detected successfully
      updateDetectionStatus(true, data.faceBox);
      lastDetectionTime = data.timestamp;
      consecutiveNoFaces = 0;
      break;
      
    case 'NO_FACE_DETECTED':
      // No face detected in frame
      updateDetectionStatus(false);
      consecutiveNoFaces++;
      
      if (consecutiveNoFaces > MAX_NO_FACE_FRAMES) {
        showToast('No face detected');
      }
      break;
      
    case 'MULTIPLE_FACES_DETECTED':
      // Multiple faces detected
      updateDetectionStatus(false);
      showToast(`Multiple faces detected (${data.count})`);
      break;
      
    case 'MODELS_LOADED':
      // Models loaded successfully
      hideLoader();
      isInitialized = true;
      showToast('Face detection models loaded');
      break;
      
    case 'DETECTION_ERROR':
      // Error during detection
      console.error('Detection error:', data.error);
      
      if (data.fatal) {
        showError(`Face detection error: ${data.error}`);
        stopDetection();
        restartWorker();
      } else {
        showToast(`Detection error: ${data.error}`, 'error');
      }
      break;
      
    case 'LOG':
      // Log message from worker
      console.log('Worker log:', data.message);
      break;
      
    default:
      console.log('Unknown message from worker:', type);
  }
  
  // Mark processing as complete
  isProcessingFrame = false;
}

/**
 * Handle worker errors
 * @param {ErrorEvent} error - Error event from worker
 */
function handleWorkerError(error) {
  console.error('Worker error:', error);
  showError(`Face detection worker error: ${error.message}`);
  
  // Try to restart the worker
  setTimeout(restartWorker, 2000);
}

/**
 * Restart the face detection worker after failure
 */
async function restartWorker() {
  if (faceDetectionWorker) {
    faceDetectionWorker.terminate();
    faceDetectionWorker = null;
  }
  
  showToast('Restarting face detection...', 'info');
  const success = await initFaceDetectionWorker();
  
  if (success) {
    startDetection();
  } else {
    showError('Failed to restart face detection');
  }
}

/**
 * Start face detection process
 */
function startDetection() {
  if (!faceDetectionWorker || !isInitialized) {
    showError('Face detection not initialized');
    return;
  }
  
  // Clear any existing interval
  stopDetection();
  
  // Start detection loop
  detectionInterval = setInterval(processVideoFrame, DETECTION_INTERVAL);
  
  showToast('Face detection started');
}

/**
 * Stop face detection process
 */
function stopDetection() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  
  updateDetectionStatus(false);
}

/**
 * Process a video frame for face detection
 */
async function processVideoFrame() {
  // Skip if already processing a frame or not initialized
  if (isProcessingFrame || !faceDetectionWorker || !isInitialized) {
    return;
  }
  
  try {
    // Mark as processing to prevent overlapping requests
    isProcessingFrame = true;
    
    // Get video element and check if it's ready
    const video = getVideoElement();
    if (!video || video.readyState < 2) {
      isProcessingFrame = false;
      return;
    }
    
    // Capture frame from camera
    const { imageData, width, height } = captureFrame(video);
    
    if (!imageData || !width || !height) {
      console.error('Invalid frame captured');
      isProcessingFrame = false;
      return;
    }
    
    // Send frame to worker for processing
    faceDetectionWorker.postMessage({
      type: 'PROCESS_FRAME',
      data: { imageData, width, height }
    }, [imageData.data.buffer]); // Transfer buffer for better performance
  } catch (error) {
    console.error('Error processing video frame:', error);
    isProcessingFrame = false;
    showToast('Error processing frame', 'error');
  }
}

/**
 * Initialize the application
 */
async function initApp() {
  try {
    showLoader('Initializing camera...');
    
    // Initialize camera
    const cameraReady = await initCamera();
    if (!cameraReady) {
      showError('Failed to initialize camera');
      return;
    }
    
    showToast('Camera initialized', 'success');
    
    // Initialize face detection
    const faceDetectionReady = await initFaceDetectionWorker();
    if (!faceDetectionReady) {
      return;
    }
    
    // Start detection
    startDetection();
  } catch (error) {
    hideLoader();
    showError(`Initialization error: ${error.message}`);
    console.error('App initialization error:', error);
  }
}

/**
 * Clean up application resources
 */
function cleanupApp() {
  stopDetection();
  stopCamera();
  
  if (faceDetectionWorker) {
    faceDetectionWorker.terminate();
    faceDetectionWorker = null;
  }
  
  isInitialized = false;
}

// Initialize application when window loads
window.addEventListener('load', initApp);

// Clean up resources when window unloads
window.addEventListener('unload', cleanupApp);

// Export public methods
export {
  initApp,
  startDetection,
  stopDetection,
  cleanupApp
}; 