/**
 * Face Recognition Application
 * Main entry point that initializes the application components.
 * 
 * Architecture:
 * - UI components and user interactions
 * - Face detection processing in a service worker
 * - Camera handling and face feature management
 */

// Core UI utilities
import { updateStatus, showToast } from './modules/ui.js';

// Camera management
import { startCamera, stopCamera, getVideoElement } from './modules/camera.js';

// Face detection and processing
import { initDetection } from './modules/detection.js';
import { initWorker } from './modules/workerController.js';
import { drawImageDataToCanvas } from './modules/renderer.js';

// Face data management
import { handleRegister, handleVerify, getAction } from './modules/faceService.js';

// UI setup and file handling
import { setupUI } from './modules/setupUI.js';
import { initJsonLoader } from './modules/jsonLoader.js';

// Initialize application when DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Set up the UI components from templates
        initializeUIComponents();
        
        // Set up event handlers and UI state
        setupUI();
        initJsonLoader();
        
        // Initialize the face detection worker
        const worker = await initializeWorker();
        
        // Start detection loop if worker was successfully initialized
        if (worker) {
            initDetection(worker);
        } else {
            throw new Error('Worker initialization failed');
        }
    } catch (error) {
        console.error('Application initialization error:', error);
        showToast('Failed to initialize the application. Please reload the page.', 'error');
        updateStatus('Application initialization failed. Please reload.', 100);
    }
});

/**
 * Initialize UI components from templates
 */
function initializeUIComponents() {
    // Get the container for face controls
    const controlsContainer = document.getElementById('face-controls-container');
    
    // Get the template with button controls
    const template = document.getElementById('face-controls-template');
    
    // Clone the template into the container
    if (controlsContainer && template) {
        controlsContainer.appendChild(template.content.cloneNode(true));
    } else {
        console.warn('Could not initialize UI components: missing container or template');
    }
}

/**
 * Initialize the face detection service worker
 * @returns {Promise<ServiceWorker|null>} The worker instance or null if initialization failed
 */
async function initializeWorker() {
    try {
        updateStatus('Initializing face detection...', 10);
        
        const worker = await initWorker((payload) => {
            // This callback processes detection results from the worker
            if (!payload) {
                console.warn('Received empty payload from worker');
                return;
            }
            
            const detections = payload.detections;
            
            // Check if we received a valid face descriptor
            if (detections && detections[0] && detections[0][0] && detections[0][0].descriptor) {
                // Convert to Float32Array for compatibility
                const descriptor = new Float32Array(detections[0][0].descriptor);
                
                // Process the descriptor based on the current action mode
                const currentAction = getAction();
                
                if (currentAction === 'register') {
                    handleRegister(descriptor);
                } else if (currentAction === 'verify') {
                    handleVerify(descriptor);
                }
            }
            
            // Render detection results to output canvas
            drawImageDataToCanvas(detections, 'output-canvas');
        });
        
        return worker;
    } catch (error) {
        console.error('Worker initialization failed:', error);
        showToast('Failed to initialize face detection. Please reload the page.', 'error');
        updateStatus('Face detection initialization failed.', 100);
        return null;
    }
} 