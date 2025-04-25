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
        return;
    }

    // Reset counters
    frameCount = 0;
    consecutiveErrorCount = 0;

    // Create canvas for frame processing
    let captureCanvas;
    let canvasContext;
    
    // Use OffscreenCanvas if available (better performance) or fall back to regular canvas
    if (typeof OffscreenCanvas !== 'undefined') {
        captureCanvas = new OffscreenCanvas(1, 1);
        canvasContext = captureCanvas.getContext('2d');
    } else {
        captureCanvas = document.createElement('canvas');
        canvasContext = captureCanvas.getContext('2d');
    }

    // Begin detection when video starts playing
    video.addEventListener('play', () => {
        isDetectionActive = true;
        console.log('Starting face detection loop');
        
        // Process video frames at regular intervals
        function processNextFrame() {
            // Stop if detection has been disabled
            if (!isDetectionActive) return;
            
            // Wait until video is actually playing and has dimensions
            if (!video.videoWidth || !video.videoHeight || video.videoWidth < 10 || video.videoHeight < 10) {
                console.log('Waiting for valid video dimensions...');
                setTimeout(processNextFrame, FRAME_INTERVAL_MS);
                return;
            }
            
            try {
                // Calculate appropriate frame size for detection (smaller = faster)
                const frameWidth = Math.min(320, video.videoWidth);
                const aspectRatio = video.videoHeight / video.videoWidth;
                const frameHeight = Math.min(240, Math.max(1, Math.round(frameWidth * aspectRatio)));
                
                // Log occasional debug info
                if (frameCount % 20 === 0) {
                    console.log(`Processing frame ${frameCount}, size: ${frameWidth}x${frameHeight}px`);
                }
                frameCount++;
                
                // Resize canvas to match frame size
                captureCanvas.width = frameWidth;
                captureCanvas.height = frameHeight;
                
                // Validate dimensions
                if (frameWidth <= 0 || frameHeight <= 0) {
                    console.error('Invalid canvas dimensions', { frameWidth, frameHeight });
                    setTimeout(processNextFrame, FRAME_INTERVAL_MS);
                    return;
                }
                
                // Draw current video frame to canvas
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
                        frameImageData.width <= 0 || frameImageData.height <= 0) {
                        throw new Error('Invalid image data extracted from canvas');
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
                
                // Send frame to worker for processing
                // Note: Using transferable objects (imageData.data.buffer) for better performance
                worker.postMessage({
                    type: 'DETECT_FACES',
                    imageData: frameImageData,
                    width: frameWidth,
                    height: frameHeight,
                    face_detector_options: DETECTION_OPTIONS
                }, [frameImageData.data.buffer]);  // Transfer ownership of the buffer
                
            } catch (error) {
                console.error('Error in detection process:', error);
                consecutiveErrorCount++;
            }
            
            // Schedule next frame if video is still playing
            if (!video.paused && !video.ended) {
                setTimeout(processNextFrame, FRAME_INTERVAL_MS);
            } else {
                console.log('Video playback stopped - pausing detection');
                isDetectionActive = false;
            }
        }
        
        // Start the frame processing loop
        processNextFrame();
    });
}

/**
 * Stop the face detection loop
 */
export function stopDetection() {
    console.log('Stopping face detection');
    isDetectionActive = false;
} 