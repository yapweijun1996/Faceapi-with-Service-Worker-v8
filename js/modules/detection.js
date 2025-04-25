// Detection Module: captures video frames and sends to worker for face detection

import { getVideoElement } from './camera.js';
import { updateStatus } from './ui.js';

// Increased detection frequency for smoother experience (from 250ms to 150ms)
const stepFps = 150;
const defaultOptions = { inputSize: 128, scoreThreshold: 0.1, maxDetectedFaces: 1 };
let isDetecting = false;
let consecutiveNoFaceFrames = 0;
const MAX_NO_FACE_FRAMES = 10; // Show status message after this many frames with no face

/**
 * Initialize continuous detection loop using service worker.
 * @param {ServiceWorker} worker - Active service worker instance.
 */
export function initDetection(worker) {
  const video = getVideoElement();
  if (!video) return;

  // Create offscreen/dynamic canvas for frame processing
  let detectCanvas;
  let context;
  if (typeof OffscreenCanvas !== 'undefined') {
    detectCanvas = new OffscreenCanvas(1, 1);
    context = detectCanvas.getContext('2d');
  } else {
    detectCanvas = document.createElement('canvas');
    context = detectCanvas.getContext('2d');
  }

  video.addEventListener('play', () => {
    isDetecting = true;
    consecutiveNoFaceFrames = 0;
    updateStatus('Looking for face...', 100);
    
    // Continuous detection loop
    function step() {
      if (!isDetecting) return;
      // Wait for valid video metadata
      if (!video.videoWidth || !video.videoHeight) {
        setTimeout(step, stepFps);
        return;
      }
      // Determine detection size
      const detectWidth = 320;
      const detectHeight = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * detectWidth));
      // Resize offscreen canvas
      detectCanvas.width = detectWidth;
      detectCanvas.height = detectHeight;
      // Draw frame and extract image data
      context.drawImage(video, 0, 0, detectWidth, detectHeight);
      let imageData;
      try {
        imageData = context.getImageData(0, 0, detectWidth, detectHeight);
      } catch (err) {
        console.error('Capture error:', err);
        setTimeout(step, stepFps);
        return;
      }
      
      // Send data to worker
      worker.postMessage({
        type: 'DETECT_FACES',
        imageData,
        width: detectWidth,
        height: detectHeight,
        face_detector_options: defaultOptions
      }, [imageData.data.buffer]);
      
      // Schedule next frame
      if (!video.paused && !video.ended) {
        setTimeout(step, stepFps);
      }
    }
    // Start detection loop
    step();
  });
  
  // Set up handler for detection results
  navigator.serviceWorker.addEventListener('message', event => {
    const { type, data } = event.data;
    if (type === 'DETECTION_RESULT') {
      const detections = data.detections;
      
      // Update face detection status message
      if (!detections || !detections[0] || !detections[0].length) {
        consecutiveNoFaceFrames++;
        if (consecutiveNoFaceFrames >= MAX_NO_FACE_FRAMES) {
          updateStatus('No face detected. Please center your face in the camera view.', 100);
        }
      } else {
        consecutiveNoFaceFrames = 0;
        updateStatus('Face detected!', 100);
      }
    }
  });
}

/**
 * Stop the detection loop.
 */
export function stopDetection() {
  isDetecting = false;
  consecutiveNoFaceFrames = 0;
} 