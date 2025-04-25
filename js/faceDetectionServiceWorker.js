// faceDetectionServiceWorker.js
console.log('🚀 Service Worker: Script started');
importScripts('faceEnvWorkerPatch.js');
console.log('✅ Service Worker: faceEnvWorkerPatch.js imported');
importScripts('face-api.min.js');
console.log('✅ Service Worker: face-api.min.js imported');

// No manual clientsList needed; we'll broadcast to all clients directly
let isModelLoaded = false;

var FaceDetectorOptionsDefault = new faceapi.TinyFaceDetectorOptions({
	inputSize: 128,
	scoreThreshold: 0.1,
	maxDetectedFaces: 1,
});
var face_for_loading_options = FaceDetectorOptionsDefault;

async function loadModels() {
    console.log('📚 Service Worker: Loading face-api.js models...');
    console.log('🔍 Service Worker: Loading tinyFaceDetector model...');
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
        console.log('✅ Service Worker: tinyFaceDetector loaded successfully');
    } catch (error) {
        console.error('❌ Service Worker: Error loading tinyFaceDetector:', error);
        broadcast({ type: 'MODEL_LOAD_ERROR', modelName: 'tinyFaceDetector', error: error.message });
        throw error;
    }
    
    console.log('🔍 Service Worker: Loading faceLandmark68Net model...');
    try {
        await faceapi.nets.faceLandmark68Net.loadFromUri('./models');
        console.log('✅ Service Worker: faceLandmark68Net loaded successfully');
    } catch (error) {
        console.error('❌ Service Worker: Error loading faceLandmark68Net:', error);
        broadcast({ type: 'MODEL_LOAD_ERROR', modelName: 'faceLandmark68Net', error: error.message });
        throw error;
    }
    
    console.log('🔍 Service Worker: Loading faceRecognitionNet model...');
    try {
        await faceapi.nets.faceRecognitionNet.loadFromUri('./models');
        console.log('✅ Service Worker: faceRecognitionNet loaded successfully');
    } catch (error) {
        console.error('❌ Service Worker: Error loading faceRecognitionNet:', error);
        broadcast({ type: 'MODEL_LOAD_ERROR', modelName: 'faceRecognitionNet', error: error.message });
        throw error;
    }

    isModelLoaded = true;
    console.log('🎉 Service Worker: All face detection models loaded successfully');
    broadcast({ type: 'MODELS_LOADED' });
}

async function checkModelsLoaded() {
    console.log('🔍 Service Worker: Checking if models are loaded...');
    if (isModelLoaded) {
        console.log("✅ Service Worker: Models are already loaded.");
        broadcast({ type: 'MODELS_LOADED' });
    } else {
        console.log("⏳ Service Worker: Models are not loaded yet. Starting load process...");
        await loadModels();
    }
}


async function detectFaces(imageData, width, height) {
    if (!isModelLoaded) {
        console.log('❌ Service Worker: Models not loaded yet, cannot detect faces');
        return [null, []];
    }

    console.log(`🔍 Service Worker: Detecting faces in ${width}x${height} image`);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    try {
        console.log('⏳ Service Worker: Running face detection with landmarks and descriptors...');
        const detections = await faceapi.detectAllFaces(canvas, face_for_loading_options).withFaceLandmarks().withFaceDescriptors();
        console.log(`✅ Service Worker: Detection complete. Found ${detections.length} faces`);

        if (detections.length > 0) {
            const landmarks = detections[0].landmarks;

            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            const centerX = (leftEye[0].x + rightEye[0].x) / 2;
            const centerY = (leftEye[0].y + rightEye[0].y) / 2;

            const regionsToExtract = [
                new faceapi.Rect(centerX - 200, centerY - 100, 450, 450)
            ];

            console.log('⏳ Service Worker: Extracting face regions...');
            const faceCanvas = await faceapi.extractFaces(canvas, regionsToExtract);
            console.log(`✅ Service Worker: Extracted ${faceCanvas.length} face regions`);

            // Create an array to hold the image data for each extracted face
            const imageDatas = faceCanvas.map(face => {
                const faceCtx = face.getContext('2d');
                return faceCtx.getImageData(0, 0, face.width, face.height);
            });

            // You can return the imageDatas array along with the detections
            return [detections, imageDatas];
        } else {
            console.log('ℹ️ Service Worker: No face detected in image');
            return [null, []];
        }
    } catch (error) {
        console.error('❌ Service Worker: Error during face detection:', error);
        return [null, []];
    }
}

// Replace broadcast implementation
async function broadcast(message) {
    console.log('📢 Service Worker: Broadcasting message to clients:', message.type);
    // Send message to all connected clients
    const allClients = await self.clients.matchAll({ includeUncontrolled: true });
    console.log(`📤 Service Worker: Sending to ${allClients.length} clients`);
    allClients.forEach(client => {
        client.postMessage(message);
    });
}

self.addEventListener('message', async function(event) {
    // Handle incoming messages from clients and respond accordingly
    console.log('📩 Service Worker: Received message:', event.data.type);
    const { type, imageData, width, height, face_detector_options } = event.data;
    if(typeof face_detector_options === "undefined" || face_detector_options === "undefined"){
        face_for_loading_options = FaceDetectorOptionsDefault;
    }else{
        face_for_loading_options = new faceapi.TinyFaceDetectorOptions(face_detector_options);
    }

    var detections;
    switch (type) {
        case 'LOAD_MODELS':
            console.log('📚 Service Worker: Received request to load models');
            await checkModelsLoaded();
            break;
        case 'DETECT_FACES':
            console.log('🔍 Service Worker: Received request to detect faces');
            detections = await detectFaces(imageData, width, height);
            console.log('📤 Service Worker: Sending detection results back to client');
            broadcast({
                type: 'DETECTION_RESULT',
                data: {
                    detections: detections,
                    displaySize: { width, height }
                }
            });
            break;
        case 'WARMUP_FACES':
            console.log('🔥 Service Worker: Received warmup request');
            detections = await detectFaces(imageData, width, height);
            console.log('📤 Service Worker: Sending warmup results back to client');
            broadcast({
                type: 'WARMUP_RESULT',
                data: {
                    detections: detections,
                    displaySize: { width, height }
                }
            });
            break;
        case 'TEST_FACE_DETECTION':
            console.log('🧪 Service Worker: Received test request');
            // Test if models are loaded
            const modelStatus = {
                isModelLoaded,
                tinyFaceDetector: faceapi.nets.tinyFaceDetector.isLoaded,
                faceLandmark68Net: faceapi.nets.faceLandmark68Net.isLoaded,
                faceRecognitionNet: faceapi.nets.faceRecognitionNet.isLoaded,
                timestamp: Date.now()
            };
            console.log('📊 Service Worker: Model status:', modelStatus);
            
            // Send status back to client
            broadcast({
                type: 'TEST_RESULT',
                status: modelStatus
            });
            
            // If models aren't loaded, try loading them
            if (!isModelLoaded) {
                console.log('🔄 Service Worker: Models not loaded, attempting to load them now');
                try {
                    await loadModels();
                    console.log('✅ Service Worker: Models loaded successfully after test request');
                } catch (error) {
                    console.error('❌ Service Worker: Failed to load models after test request:', error);
                }
            }
            break;
        default:
            console.log('❓ Service Worker: Unknown message type:', type);
    }
});

self.addEventListener('messageerror', function(event) {
    console.error('❌ Service Worker: Message error: ', event);
});

self.addEventListener('activate', event => {
    console.log('🔄 Service Worker: Activated');
});

self.addEventListener('install', event => {
    console.log('⚙️ Service Worker: Installed');
    // Force immediate activation
    self.skipWaiting();
});