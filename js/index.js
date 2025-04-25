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

document.addEventListener('DOMContentLoaded', async () => {
    // Render face controls from template
    const controlsContainer = document.getElementById('face-controls-container');
    const template = document.getElementById('face-controls-template');
    if (controlsContainer && template) {
        controlsContainer.appendChild(template.content.cloneNode(true));
    }

    // Initialize UI and JSON loader
    setupUI();
    initJsonLoader();

    // Initialize service worker and models
    const worker = await initWorker((payload) => {
        const detections = payload.detections;
        if (detections && detections[0] && detections[0][0] && detections[0][0].descriptor) {
            const descriptor = new Float32Array(detections[0][0].descriptor);
            if (getAction() === 'register') {
                handleRegister(descriptor);
            } else if (getAction() === 'verify') {
                handleVerify(descriptor);
            }
        }
        drawImageDataToCanvas(detections, 'output-canvas');
    });

    // Start detection loop if worker ready
    if (worker) {
        initDetection(worker);
    }
}); 