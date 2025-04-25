// faceDetectionServiceWorker.js
importScripts('faceEnvWorkerPatch.js');
importScripts('face-api.min.js');

let isModelLoaded = false;

// Default options for the TinyFaceDetector
const defaultFaceDetectorOptions = new faceapi.TinyFaceDetectorOptions({
	inputSize: 128,
	scoreThreshold: 0.1,
	maxDetectedFaces: 1,
});

// Constants for face extraction region calculation
const EXTRACTION_WIDTH = 450;
const EXTRACTION_HEIGHT = 450;
const OFFSET_X_FACTOR = 0.44; // approx 200 / 450
const OFFSET_Y_FACTOR = 0.22; // approx 100 / 450

/**
 * Loads the required face-api.js models.
 */
async function loadModels() {
	try {
		await faceapi.nets.tinyFaceDetector.loadFromUri('../models');
		await faceapi.nets.faceLandmark68Net.loadFromUri('../models');
		await faceapi.nets.faceRecognitionNet.loadFromUri('../models');
		isModelLoaded = true;
		console.log("Models loaded successfully.");
		broadcast({ type: 'MODELS_LOADED' });
	} catch (error) {
		console.error("Error loading models:", error);
		// Optionally broadcast an error state
		broadcast({ type: 'MODEL_LOAD_ERROR', error: error.message });
	}
}

/**
 * Checks if models are loaded, loads them if not.
 */
async function checkModelsLoaded() {
	if (isModelLoaded) {
		console.log("checkModelsLoaded: Models are already loaded.");
		broadcast({ type: 'MODELS_LOADED' }); // Notify again in case a client connects late
	} else {
		console.log("checkModelsLoaded: Models are not loaded yet. Loading...");
		await loadModels();
	}
}

/**
 * Detects faces in the provided image data using specified options.
 * @param {ImageData} imageData - The image data to process.
 * @param {number} width - The width of the image data.
 * @param {number} height - The height of the image data.
 * @param {object} detectionOptions - Options for faceapi.detectAllFaces.
 * @returns {Promise<Array>} A promise that resolves to an array containing [detections, extractedFaceImageDatas].
 */
async function detectFaces(imageData, width, height, detectionOptions) {
	if (!isModelLoaded) {
		console.warn('detectFaces called before models were loaded.');
		return [null, []]; // Return empty result if models aren't ready
	}

	try {
		// Use OffscreenCanvas for efficient processing in worker
		const canvas = new OffscreenCanvas(width, height);
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error("Could not get OffscreenCanvas 2D context.");
		}
		ctx.putImageData(imageData, 0, 0);

		// Perform detection with landmarks and descriptors
		const detections = await faceapi.detectAllFaces(canvas, detectionOptions)
			.withFaceLandmarks()
			.withFaceDescriptors();

		if (detections.length > 0) {
			// Process the first detected face
			const firstDetection = detections[0];
			const landmarks = firstDetection.landmarks;

			// --- Face Extraction Logic ---
			let imageDatas = [];
			try {
				// Calculate center based on eye landmarks (assuming landmarks are available)
				const leftEye = landmarks.getLeftEye();
				const rightEye = landmarks.getRightEye();

				// Basic check if landmark arrays are valid
				if (leftEye && leftEye.length > 0 && rightEye && rightEye.length > 0) {
					// Use the first point of each eye array for center calculation
					const centerX = (leftEye[0].x + rightEye[0].x) / 2;
					const centerY = (leftEye[0].y + rightEye[0].y) / 2;

					// Calculate top-left corner for extraction, ensuring it stays within bounds
					let extractX = Math.max(0, centerX - EXTRACTION_WIDTH * OFFSET_X_FACTOR);
					let extractY = Math.max(0, centerY - EXTRACTION_HEIGHT * OFFSET_Y_FACTOR);

					// Ensure the extraction region doesn't go out of bounds on the right/bottom
					const maxExtractX = width - EXTRACTION_WIDTH;
					const maxExtractY = height - EXTRACTION_HEIGHT;
					extractX = Math.min(extractX, maxExtractX);
					extractY = Math.min(extractY, maxExtractY);

					// Handle cases where image is smaller than extraction size
					const currentWidth = Math.min(EXTRACTION_WIDTH, width);
					const currentHeight = Math.min(EXTRACTION_HEIGHT, height);

					if (extractX >= 0 && extractY >= 0 && currentWidth > 0 && currentHeight > 0) {
						const regionsToExtract = [ new faceapi.Rect(extractX, extractY, currentWidth, currentHeight) ];
						const faceCanvases = await faceapi.extractFaces(canvas, regionsToExtract);

						// Convert extracted faces (OffscreenCanvas) to ImageData
						imageDatas = faceCanvases.map(faceCanvas => {
							const faceCtx = faceCanvas.getContext('2d');
							return faceCtx ? faceCtx.getImageData(0, 0, faceCanvas.width, faceCanvas.height) : null;
						}).filter(Boolean); // Filter out nulls if context failed
					} else {
						 console.warn("Calculated extraction region is invalid or outside bounds.");
					}
				} else {
					console.warn("Could not get valid eye landmarks for extraction.");
				}
			} catch (extractError) {
				console.error("Error during face extraction:", extractError);
				// Proceed without extracted faces if extraction fails
			}
			// --- End Face Extraction Logic ---

			// Return original detections and any successfully extracted face image data
			return [detections, imageDatas];

		} else {
			// console.log('No face detected in this frame.'); // Less verbose logging
			return [null, []]; // Return empty result if no faces detected
		}
	} catch (error) {
		console.error('Error during face detection:', error);
		// Consider broadcasting an error message back to the main thread
		broadcast({ type: 'DETECTION_ERROR', error: error.message });
		return [null, []]; // Return empty result on error
	}
}

/**
 * Broadcasts a message to all connected clients.
 * @param {object} message - The message object to send.
 */
async function broadcast(message) {
	try {
		const allClients = await self.clients.matchAll({ includeUncontrolled: true });
		allClients.forEach(client => {
			if (client) { // Add a check for client existence
				 client.postMessage(message);
			}
		});
	} catch (error) {
		console.error("Error broadcasting message:", error);
	}
}

// Listener for messages from the main thread
self.addEventListener('message', async (event) => {
	const { type, imageData, width, height, face_detector_options } = event.data;

	// Determine which detection options to use
	let currentDetectionOptions = defaultFaceDetectorOptions;
	// Use simpler check for undefined options
	if (face_detector_options !== undefined) {
		try {
			 // Validate or sanitize incoming options before creating new options object
			 // For simplicity, we assume valid options are passed for now.
			currentDetectionOptions = new faceapi.TinyFaceDetectorOptions(face_detector_options);
		} catch (optionsError) {
			console.error("Error applying custom face detector options:", optionsError);
			// Fallback to default options if custom ones are invalid
			currentDetectionOptions = defaultFaceDetectorOptions;
		}
	}

	let detectionResult;
	switch (type) {
		case 'LOAD_MODELS':
			await checkModelsLoaded();
			break;
		case 'DETECT_FACES':
			detectionResult = await detectFaces(imageData, width, height, currentDetectionOptions);
			broadcast({
				type: 'DETECTION_RESULT',
				// Send back original detections and any extracted faces
				data: {
					detections: detectionResult[0], // Full detection data (includes descriptors, landmarks etc.)
					extractedFaces: detectionResult[1], // ImageData of extracted faces
					displaySize: { width, height } // Keep displaySize if needed by main thread
				}
			});
			break;
		case 'WARMUP_FACES':
			// Purpose: Primarily to load models and potentially warm up the JS engine/GPU for detection.
			//            The result itself might not be immediately used by the client.
			console.log("Performing warmup detection...");
			detectionResult = await detectFaces(imageData, width, height, currentDetectionOptions);
			broadcast({
				type: 'WARMUP_RESULT',
				data: {
					// Send minimal data or just confirmation for warmup
					success: detectionResult && detectionResult[0] !== null,
					modelsLoaded: isModelLoaded
				}
			});
			console.log("Warmup detection finished.");
			break;
		default:
			console.warn('Unknown message type received in worker:', type);
	}
});

// Listener for errors during message handling
self.addEventListener('messageerror', (event) => {
	console.error('Service Worker messageerror event:', event);
});

// Initial model load trigger (optional, could also be triggered by first client message)
// loadModels(); // Uncomment if you want models to load as soon as the worker starts