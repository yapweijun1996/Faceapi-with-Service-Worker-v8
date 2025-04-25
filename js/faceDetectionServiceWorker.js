// Face Detection Service Worker
// Handles face detection processing in a separate thread 
importScripts('faceEnvWorkerPatch.js');
importScripts('face-api.js');

// Initialize TensorFlow environment for worker
self.tf = self.tf || {};
self.tf.ENV.set('WEBGL_PACK', false);  // Prevents common height-related errors

// Track model loading state
let isModelLoaded = false;

// Default detector options - small input size for better performance
const DEFAULT_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
	inputSize: 128,
	scoreThreshold: 0.1,
	maxDetectedFaces: 1,
});

// Current detector options (may be overridden by messages)
let currentDetectorOptions = DEFAULT_DETECTOR_OPTIONS;

/**
 * Load all required face-api models
 * Returns a promise that resolves when models are loaded
 */
async function loadModels() {
    try {
        // Load required models from models directory
        await faceapi.nets.tinyFaceDetector.loadFromUri('../models');
        await faceapi.nets.faceLandmark68Net.loadFromUri('../models');
        await faceapi.nets.faceRecognitionNet.loadFromUri('../models');

        isModelLoaded = true;
        broadcast({ type: 'MODELS_LOADED' });
    } catch (error) {
        console.error('Error loading models:', error);
        broadcast({ 
            type: 'MODELS_ERROR', 
            error: error.message || 'Unknown model loading error' 
        });
    }
}

/**
 * Check if models are loaded, load them if not
 */
async function checkModelsLoaded() {
    if (isModelLoaded) {
        console.log("Models already loaded");
        broadcast({ type: 'MODELS_LOADED' });
    } else {
        console.log("Loading models...");
        await loadModels();
    }
}

/**
 * Process frame to detect faces and extract descriptors
 * @param {ImageData} imageData - Raw pixel data from canvas
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Array} - [detections, extractedFaces] or [null, []] if no face found
 */
async function detectFaces(imageData, width, height) {
    // Return early if models aren't loaded
    if (!isModelLoaded) {
        console.log('Models not loaded yet');
        return [null, []];
    }

    try {
        // Validate input dimensions
        if (!width || !height || width <= 0 || height <= 0) {
            console.error('Invalid dimensions:', { width, height });
            return [null, []];
        }

        // Validate image data
        if (!imageData || !imageData.data || imageData.data.length === 0) {
            console.error('Invalid image data');
            return [null, []];
        }

        // Create offscreen canvas and draw image
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        // Verify canvas has content (sanity check)
        const testData = ctx.getImageData(0, 0, 1, 1);
        if (!testData || !testData.data) {
            console.error('Canvas is empty');
            return [null, []];
        }

        // Run face detection with landmarks and descriptors
        const detections = await faceapi
            .detectAllFaces(canvas, currentDetectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptors();

        // No faces found
        if (!detections || detections.length === 0) {
            return [null, []]; 
        }

        // Proceed with the first detected face
        const landmarks = detections[0].landmarks;
        
        // Validate landmarks
        if (!landmarks) {
            console.error('No landmarks detected');
            return [detections, []];
        }

        // Get eye positions for face alignment
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        
        if (!leftEye || !leftEye[0] || !rightEye || !rightEye[0]) {
            console.error('Invalid eye landmarks');
            return [detections, []];
        }
        
        // Calculate face center based on eyes
        const centerX = (leftEye[0].x + rightEye[0].x) / 2;
        const centerY = (leftEye[0].y + rightEye[0].y) / 2;

        // Extract face region centered on eyes
        const regionsToExtract = [
            new faceapi.Rect(centerX - 200, centerY - 100, 450, 450)
        ];

        // Extract face image data for visualization
        const faceCanvas = await faceapi.extractFaces(canvas, regionsToExtract);
        const faceImageData = faceCanvas.map(face => {
            const faceCtx = face.getContext('2d');
            return faceCtx.getImageData(0, 0, face.width, face.height);
        });

        return [detections, faceImageData];
    } catch (error) {
        console.error('Error in face detection:', error);
        return [null, []];
    }
}

/**
 * Send message to all connected clients
 * @param {Object} message - Message object to broadcast
 */
async function broadcast(message) {
    const allClients = await self.clients.matchAll({ includeUncontrolled: true });
    allClients.forEach(client => {
        client.postMessage(message);
    });
}

// Handle messages from main thread
self.addEventListener('message', async function(event) {
    const { type, imageData, width, height, face_detector_options } = event.data;
    
    // Update detector options if provided
    if (face_detector_options && face_detector_options !== "undefined") {
        currentDetectorOptions = new faceapi.TinyFaceDetectorOptions(face_detector_options);
    } else {
        currentDetectorOptions = DEFAULT_DETECTOR_OPTIONS;
    }

    // Process different message types
    switch (type) {
        case 'LOAD_MODELS':
            await checkModelsLoaded();
            break;
            
        case 'DETECT_FACES':
            const detections = await detectFaces(imageData, width, height);
            broadcast({
                type: 'DETECTION_RESULT',
                data: {
                    detections: detections,
                    displaySize: { width, height }
                }
            });
            break;
            
        case 'WARMUP_FACES':
            // Similar to DETECT_FACES but with different response type
            const warmupDetections = await detectFaces(imageData, width, height);
            broadcast({
                type: 'WARMUP_RESULT',
                data: {
                    detections: warmupDetections,
                    displaySize: { width, height }
                }
            });
            break;
            
        default:
            console.log('Unknown message type:', type);
    }
});

// Handle message errors
self.addEventListener('messageerror', function(event) {
    console.error('Service Worker message error:', event);
    broadcast({
        type: 'SERVICE_WORKER_ERROR',
        error: 'Error processing message'
    });
});