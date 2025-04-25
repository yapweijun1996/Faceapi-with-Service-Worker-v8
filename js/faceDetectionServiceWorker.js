// faceDetectionServiceWorker.js
importScripts('faceEnvWorkerPatch.js');
importScripts('face-api.min.js');

let clientsList = [];
let isModelLoaded = false;

// Default threshold for face verification (euclidean distance)
const DEFAULT_VERIFY_THRESHOLD = 0.6;

var FaceDetectorOptionsDefault = new faceapi.TinyFaceDetectorOptions({
	inputSize: 128,
	scoreThreshold: 0.1,
	maxDetectedFaces: 1,
});
var face_for_loading_options = FaceDetectorOptionsDefault;

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('../models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('../models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('../models');

    isModelLoaded = true;
    broadcast({ type: 'MODELS_LOADED' });
}

async function checkModelsLoaded() {
    if (isModelLoaded) {
        console.log("checkModelsLoaded : Models are loaded.");
        broadcast({ type: 'MODELS_LOADED' });
    } else {
        console.log("checkModelsLoaded : Models are not loaded yet.");
        await loadModels();
    }
}


async function detectFaces(imageData, width, height) {
    if (!isModelLoaded) {
        console.log('Models not loaded yet');
        return;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    const detections = await faceapi.detectAllFaces(canvas, face_for_loading_options).withFaceLandmarks().withFaceDescriptors();

    if (detections.length > 0) {
        const landmarks = detections[0].landmarks;

        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const centerX = (leftEye[0].x + rightEye[0].x) / 2;
        const centerY = (leftEye[0].y + rightEye[0].y) / 2;

        const regionsToExtract = [
            new faceapi.Rect(centerX - 200, centerY - 100, 450, 450)
        ];

        const faceCanvas = await faceapi.extractFaces(canvas, regionsToExtract);

        // Create an array to hold the image data for each extracted face
        const imageDatas = faceCanvas.map(face => {
            const faceCtx = face.getContext('2d');
            return faceCtx.getImageData(0, 0, face.width, face.height);
        });

        // You can return the imageDatas array along with the detections
        return [detections, imageDatas];
    } else {
        console.log('No face detected');
        return [null, []];
    }
}


function broadcast(message) {
    clientsList.forEach(client => {
        client.postMessage(message);
    });
}

self.addEventListener('message', async function(event) {
    const client = event.source;
    // If a MessageChannel port was passed, use it for replying
    const port = event.ports && event.ports[0];
    if (!clientsList.includes(client)) {
        clientsList.push(client);
    }

    const { type, imageData, width, height, face_detector_options, image, targetDescriptor, threshold } = event.data;
	if(typeof face_detector_options === "undefined" || face_detector_options === "undefined"){
		face_for_loading_options = FaceDetectorOptionsDefault;
	}else{
		face_for_loading_options = new faceapi.TinyFaceDetectorOptions(face_detector_options);
		
	}
	
    var detections;
    switch (type) {
        case 'LOAD_MODELS':
            await checkModelsLoaded();
            break;
        case 'DETECT_FACES':
            detections = await detectFaces(imageData, width, height);
            // send detection result back to the requesting client
            client.postMessage({
                type: 'DETECTION_RESULT',
                data: { detections: detections, displaySize: { width, height } }
            });
            break;
        case 'WARMUP_FACES':
            detections = await detectFaces(imageData, width, height);
            client.postMessage({
                type: 'WARMUP_RESULT',
                data: { detections: detections, displaySize: { width, height } }
            });
            break;
        case 'REGISTER_REQUEST': {
            // Ensure models are loaded before registration
            if (!isModelLoaded) {
                await checkModelsLoaded();
            }
            // Draw ImageBitmap to OffscreenCanvas
            const img = image;
            const regCanvas = new OffscreenCanvas(img.width, img.height);
            const regCtx = regCanvas.getContext('2d');
            regCtx.drawImage(img, 0, 0);
            // Detect single face and descriptor
            const regResult = await faceapi.detectSingleFace(regCanvas, face_for_loading_options)
                .withFaceLandmarks()
                .withFaceDescriptor();
            if (regResult && regResult.descriptor) {
                port && port.postMessage({ descriptor: Array.from(regResult.descriptor) });
            } else {
                port && port.postMessage({ error: 'No face detected' });
            }
        } break;
        case 'VERIFY_REQUEST': {
            // Ensure models loaded before verification
            if (!isModelLoaded) {
                await checkModelsLoaded();
            }
            const img2 = image;
            const verCanvas = new OffscreenCanvas(img2.width, img2.height);
            const verCtx = verCanvas.getContext('2d');
            verCtx.drawImage(img2, 0, 0);
            const verResult = await faceapi.detectSingleFace(verCanvas, face_for_loading_options)
                .withFaceLandmarks()
                .withFaceDescriptor();
            if (verResult && verResult.descriptor) {
                const distance = faceapi.euclideanDistance(targetDescriptor, verResult.descriptor);
                const thr = typeof threshold === 'number' ? threshold : DEFAULT_VERIFY_THRESHOLD;
                const match = distance < thr;
                port && port.postMessage({ match, distance });
            } else {
                port && port.postMessage({ match: false, distance: null, error: 'No face detected' });
            }
        } break;
        default:
            console.log('Unknown message type:', type);
    }
});

self.addEventListener('messageerror', function(event) {
    console.error('Service Worker message error: ', event);
});