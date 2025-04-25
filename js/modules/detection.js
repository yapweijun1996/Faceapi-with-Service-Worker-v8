/**
 * Face Detection Module
 * Captures video frames and sends them to the service worker for processing.
 */

import { getVideoElement } from './camera.js';
import { showToast } from './ui.js';

// Configuration
const FRAME_INTERVAL_MS = 250; // 4 frames per second
const DETECTION_OPTIONS = { 
    inputSize: 128,         // Smaller size = faster but less accurate
    scoreThreshold: 0.1,    // Minimum confidence score (0-1)
    maxDetectedFaces: 1     // Only detect one face for performance
};

// Module state
let isDetectionActive = false;
let frameCount = 0;
let consecutiveErrorCount = 0;
let lastFrameTimestamp = 0;

/**
 * Ensures the provided dimensions are valid for processing
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @returns {boolean} - Whether dimensions are valid
 */
function validateDimensions(width, height) {
    if (!width || !height || 
        typeof width !== 'number' || typeof height !== 'number' || 
        width <= 0 || height <= 0 || 
        width > 2000 || height > 2000) {
        console.error('Invalid dimensions:', { width, height });
        return false;
    }
    return true;
}

/**
 * Utility to create optimized frame dimensions
 * @param {HTMLVideoElement} video - Video element
 * @returns {Object} - Computed width and height
 */
function computeFrameDimensions(video) {
    // Base size - keep small for performance
    const baseWidth = 320;
    
    // Validate video element has dimensions
    if (!video.videoWidth || !video.videoHeight || 
        video.videoWidth < 10 || video.videoHeight < 10) {
        return { width: baseWidth, height: baseWidth * 0.75 }; // Default 4:3 aspect
    }
    
    // Calculate appropriate frame size for detection (smaller = faster)
    const frameWidth = Math.min(baseWidth, video.videoWidth);
    const aspectRatio = video.videoHeight / video.videoWidth;
    const frameHeight = Math.min(
        baseWidth * 0.75,  // Avoid too tall frames
        Math.max(1, Math.round(frameWidth * aspectRatio))
    );
    
    // Ensure dimensions are even numbers (helps with some image processing)
    return {
        width: Math.floor(frameWidth / 2) * 2,
        height: Math.floor(frameHeight / 2) * 2
    };
}

/**
 * Start continuous face detection using the service worker
 * 
 * @param {ServiceWorker} worker - Active face detection service worker
 */
export function initDetection(worker) {
    // Get video element reference
    const video = getVideoElement();
    if (!video) {
        console.error('Video element not found - cannot start detection');
        showToast('Camera element not found', 'error');
        return;
    }

    // Reset counters
    frameCount = 0;
    consecutiveErrorCount = 0;
    lastFrameTimestamp = 0;

    // Create canvas for frame processing
    let captureCanvas;
    let canvasContext;
    
    // Use OffscreenCanvas if available (better performance) or fall back to regular canvas
    if (typeof OffscreenCanvas !== 'undefined') {
        captureCanvas = new OffscreenCanvas(1, 1);
        canvasContext = captureCanvas.getContext('2d', { willReadFrequently: true });
    } else {
        captureCanvas = document.createElement('canvas');
        canvasContext = captureCanvas.getContext('2d', { willReadFrequently: true });
    }
    
    if (!canvasContext) {
        console.error('Failed to create canvas context');
        showToast('Your browser does not support required canvas features', 'error');
        return;
    }

    // Begin detection when video starts playing
    video.addEventListener('play', () => {
        isDetectionActive = true;
        console.log('Starting face detection loop');
        
        // Process video frames at regular intervals
        function processNextFrame() {
            // Check if detection is active
            if (!isDetectionActive) return;
            
            // Enforce frame rate by checking time since last frame
            const now = performance.now();
            if (now - lastFrameTimestamp < FRAME_INTERVAL_MS) {
                requestAnimationFrame(processNextFrame);
                return;
            }
            
            // Update last frame timestamp
            lastFrameTimestamp = now;
            
            try {
                // Skip processing if video isn't ready
                if (!video.readyState || video.readyState < 2) { // HAVE_CURRENT_DATA = 2
                    setTimeout(processNextFrame, 100);
                    return;
                }
                
                // Get optimized dimensions for the frame
                const { width: frameWidth, height: frameHeight } = computeFrameDimensions(video);
                
                // Validate dimensions
                if (!validateDimensions(frameWidth, frameHeight)) {
                    setTimeout(processNextFrame, FRAME_INTERVAL_MS);
                    return;
                }
                
                // Log occasional debug info
                if (frameCount % 20 === 0) {
                    console.log(`Processing frame ${frameCount}, size: ${frameWidth}x${frameHeight}px`);
                }
                frameCount++;
                
                // Resize canvas to match frame size
                captureCanvas.width = frameWidth;
                captureCanvas.height = frameHeight;
                
                // Draw current video frame to canvas - first clear it
                canvasContext.clearRect(0, 0, frameWidth, frameHeight);
                canvasContext.drawImage(video, 0, 0, frameWidth, frameHeight);
                
                // Verify canvas context is still valid
                if (!canvasContext) {
                    console.error('Canvas context lost');
                    setTimeout(processNextFrame, FRAME_INTERVAL_MS);
                    return;
                }
                
                // Extract image data from canvas
                let frameImageData;
                try {
                    frameImageData = canvasContext.getImageData(0, 0, frameWidth, frameHeight);
                    
                    // Validate image data is usable
                    if (!frameImageData || !frameImageData.data || frameImageData.data.length === 0 || 
                        frameImageData.width <= 0 || frameImageData.height <= 0 ||
                        frameImageData.data.length !== frameWidth * frameHeight * 4) {
                        throw new Error(
                            `Invalid image data: expected ${frameWidth}x${frameHeight}×4 = ${frameWidth * frameHeight * 4} bytes, ` +
                            `got ${frameImageData ? (frameImageData.data ? frameImageData.data.length : 'null data') : 'null imageData'}`
                        );
                    }
                } catch (err) {
                    consecutiveErrorCount++;
                    console.error('Error capturing video frame:', err);
                    
                    // Notify user after several errors
                    if (consecutiveErrorCount > 5) {
                        showToast('Face detection is having problems. Try restarting the camera.', 'error');
                        consecutiveErrorCount = 0; // Reset to avoid spamming the user
                    }
                    
                    setTimeout(processNextFrame, FRAME_INTERVAL_MS);
                    return;
                }
                
                // Reset error counter on successful frame capture
                consecutiveErrorCount = 0;
                
                try {
                    // Send frame to worker for processing
                    // Note: Using transferable objects (imageData.data.buffer) for better performance
                    worker.postMessage({
                        type: 'DETECT_FACES',
                        imageData: frameImageData,
                        width: frameWidth,
                        height: frameHeight,
                        timestamp: Date.now(),
                        face_detector_options: DETECTION_OPTIONS
                    }, [frameImageData.data.buffer]);  // Transfer ownership of the buffer
                } catch (postError) {
                    console.error('Error sending data to worker:', postError);
                    // Don't increment consecutiveErrorCount here as this is a different kind of error
                }
            } catch (error) {
                console.error('Error in detection process:', error);
                consecutiveErrorCount++;
            }
            
            // Schedule next frame using requestAnimationFrame for better performance
            // but still respect our desired frame rate
            if (!video.paused && !video.ended) {
                requestAnimationFrame(processNextFrame);
            } else {
                console.log('Video playback stopped - pausing detection');
                isDetectionActive = false;
            }
        }
        
        // Start the frame processing loop using requestAnimationFrame
        requestAnimationFrame(processNextFrame);
    });
}

/**
 * Stop the face detection loop
 */
export function stopDetection() {
    console.log('Stopping face detection');
    isDetectionActive = false;
} 