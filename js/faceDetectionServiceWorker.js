/**
 * Face Detection Service Worker
 * Handles face detection processing off the main thread
 */

// Import the environment patch first to set up the worker environment
importScripts('faceEnvWorkerPatch.js');

// Import face-api.js (path relative to service worker location)
importScripts('face-api.js');

// State
let modelsLoaded = false;
let processingQueue = [];
let isProcessing = false;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// Determine the base URL for models based on our location
// This helps with different deployment environments like GitHub Pages
const getBasePath = () => {
  // For service workers, location.pathname gives the path to the worker script
  const workerPath = self.location.pathname;
  // Check if we're in a GitHub Pages context
  if (workerPath.includes('/Faceapi-with-Service-Worker-v8/')) {
    return '/Faceapi-with-Service-Worker-v8';
  }
  return '';
};

// Constants with adaptive paths
const MODEL_URL = `${getBasePath()}/models`;
const DETECTION_OPTIONS = {
  // Adjust these values based on performance needs
  scoreThreshold: 0.5,
  inputSize: 320,
  boxSizeLimit: 100
};

/**
 * Initialize face detection models
 * @returns {Promise} Resolves when models are loaded
 */
async function initFaceDetection() {
  console.log('Initializing face detection in worker');
  
  try {
    // Configure face-api.js
    faceapi.env.setEnv({ Canvas: OffscreenCanvas });
    
    // Load face detection models
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    
    console.log('Face detection models loaded in worker');
    modelsLoaded = true;
    
    // Notify main thread that models are loaded
    self.postMessage({ type: 'MODELS_LOADED' });
    
    return true;
  } catch (error) {
    console.error('Error loading face detection models:', error);
    self.postMessage({ 
      type: 'DETECTION_ERROR', 
      data: { 
        error: `Failed to load face detection models: ${error.message}`,
        fatal: true
      }
    });
    return false;
  }
}

/**
 * Process an image for face detection
 * @param {ImageData|ImageBitmap} imageData - The image data to process
 * @returns {Promise<Object>} Detection results
 */
async function processImage(imageData) {
  if (!modelsLoaded) {
    throw new Error('Face detection models not loaded');
  }
  
  if (!imageData) {
    throw new Error('Invalid image data provided');
  }
  
  try {
    // Validate dimensions
    if (!imageData.width || !imageData.height || 
        imageData.width <= 0 || imageData.height <= 0) {
      throw new Error(`Invalid image dimensions: ${imageData.width}x${imageData.height}`);
    }
    
    // Check for proper size (not too large to cause memory issues)
    if (imageData.width > 2000 || imageData.height > 2000) {
      throw new Error(`Image dimensions too large: ${imageData.width}x${imageData.height}`);
    }
    
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: DETECTION_OPTIONS.inputSize,
      scoreThreshold: DETECTION_OPTIONS.scoreThreshold
    });
    
    // Process the frame with face-api.js
    const detections = await faceapi.detectAllFaces(imageData, detectionOptions)
      .withFaceLandmarks()
      .withFaceDescriptors();
    
    consecutiveErrors = 0; // Reset error counter on success
    
    // Return detection results
    return { 
      detections,
      timestamp: Date.now(),
      count: detections.length
    };
  } catch (error) {
    consecutiveErrors++;
    
    // Log whether this is a persistent error
    const isFatal = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
    
    console.error(`Face detection error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);
    
    throw new Error(`Face detection failed: ${error.message}`);
  }
}

/**
 * Handle a frame for processing
 * @param {Object} data - Frame data from main thread
 */
async function handleFrame(data) {
  try {
    if (!data || !data.imageData) {
      throw new Error('Invalid frame data received');
    }
    
    // Get image data
    const imageData = data.imageData;
    
    // Process the image
    const results = await processImage(imageData);
    
    // Send results back to main thread
    if (results.count === 0) {
      self.postMessage({ type: 'NO_FACE_DETECTED' });
    } else if (results.count === 1) {
      self.postMessage({ 
        type: 'FACE_DETECTED',
        data: {
          faceBox: results.detections[0].detection.box,
          timestamp: results.timestamp
        }
      });
    } else if (results.count > 1) {
      self.postMessage({ 
        type: 'MULTIPLE_FACES_DETECTED',
        data: { count: results.count }
      });
    }
  } catch (error) {
    const isFatal = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;
    
    self.postMessage({ 
      type: 'DETECTION_ERROR', 
      data: { 
        error: error.message,
        fatal: isFatal,
        consecutiveErrors
      }
    });
  }
}

/**
 * Process queued frames
 */
async function processQueue() {
  if (isProcessing || processingQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    // Get the newest frame and discard others to avoid backlog
    const frame = processingQueue.pop();
    processingQueue = [];
    
    // Process the frame
    await handleFrame(frame);
  } catch (error) {
    console.error('Error processing frame queue:', error);
  } finally {
    isProcessing = false;
    
    // Continue processing queue if items remain
    if (processingQueue.length > 0) {
      processQueue();
    }
  }
}

/**
 * Add a frame to the processing queue
 * @param {Object} frame - Frame data
 */
function queueFrame(frame) {
  // Add frame to queue
  processingQueue.push(frame);
  
  // Start processing if not already in progress
  if (!isProcessing) {
    processQueue();
  }
}

// Event listeners
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'INIT':
      try {
        await initFaceDetection();
        self.postMessage({ type: 'READY' });
      } catch (error) {
        self.postMessage({ 
          type: 'DETECTION_ERROR', 
          data: { 
            error: `Initialization failed: ${error.message}`,
            fatal: true
          }
        });
      }
      break;
      
    case 'PROCESS_FRAME':
      // Queue the frame for processing
      queueFrame(data);
      break;
      
    case 'RESET':
      // Reset internal state
      processingQueue = [];
      isProcessing = false;
      consecutiveErrors = 0;
      self.postMessage({ type: 'RESET_COMPLETE' });
      break;
      
    default:
      console.log('Unknown message type in worker:', type);
  }
});

// If running as a dedicated worker, not a service worker
if (typeof ServiceWorkerGlobalScope === 'undefined') {
  console.log('Running as dedicated worker');
  
  // Send log message to main thread
  self.postMessage({ 
    type: 'LOG', 
    data: { message: 'Face detection worker initialized' }
  });
}

// Service worker specific event listeners
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  
  // Take control immediately
  event.waitUntil(self.clients.claim());
});