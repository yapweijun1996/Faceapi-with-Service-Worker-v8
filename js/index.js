/**
 * Main entry point for Face Recognition App.
 */
import { updateStatus, showToast } from './modules/ui.js';
import { startCamera, stopCamera, getVideoElement } from './modules/camera.js';
import { initDetection } from './modules/detection.js';
import { initWorker } from './modules/workerController.js';
import { drawImageDataToCanvas } from './modules/renderer.js';
import { handleRegister, handleVerify, getAction } from './modules/faceService.js';
import { setupUI } from './modules/setupUI.js';
import { initJsonLoader } from './modules/jsonLoader.js';

// Define action types as constants for better maintainability
const ACTION_REGISTER = 'register';
const ACTION_VERIFY = 'verify';

document.addEventListener('DOMContentLoaded', async () => {
    try { // Add top-level try...catch for robust error handling
        // Render face controls from template
        const controlsContainer = document.getElementById('face-controls-container');
        const template = document.getElementById('face-controls-template');
        if (controlsContainer && template) {
            controlsContainer.appendChild(template.content.cloneNode(true));
        } else {
            console.warn('Could not find face controls container or template.'); // Warn if elements are missing
        }

        // Initialize UI and JSON loader first
        setupUI(); // Sets up button listeners etc. which might define the initial 'action'
        initJsonLoader();

        // Initialize the service worker which will handle heavy computations
        const worker = await initWorker((payload) => {
            // Callback function executed when the worker sends data back
            const detections = payload.detections;
            const descriptor = detections?.[0]?.[0]?.descriptor; // Use optional chaining for safer access

            if (descriptor) {
                const floatDescriptor = new Float32Array(descriptor); // Convert descriptor if present
                const currentAction = getAction(); // Determine if we are registering or verifying (state managed in faceService/setupUI)

                if (currentAction === ACTION_REGISTER) {
                    handleRegister(floatDescriptor);
                } else if (currentAction === ACTION_VERIFY) {
                    handleVerify(floatDescriptor);
                }
            } else {
                // Optionally handle cases where no descriptor is found in detections
                // console.log("No descriptor found in detection payload:", payload);
            }

            // Always attempt to draw the detections (or lack thereof) to the canvas
            drawImageDataToCanvas(detections, 'output-canvas');
        });

        // Start the detection loop if the worker was initialized successfully
        if (worker) {
            initDetection(worker); // Passes the worker instance to the detection loop
        } else {
            // Handle case where worker initialization failed (initWorker should ideally throw an error caught below)
            updateStatus('Failed to initialize face detection worker.');
            showToast('Error: Worker initialization failed.', 'error');
        }

    } catch (error) {
        // Catch any errors during initialization
        console.error('Initialization failed:', error);
        updateStatus('Initialization failed. Please check console.');
        showToast(`Error: ${error.message}`, 'error');
        // Optionally, disable relevant UI elements here
    }
}); 