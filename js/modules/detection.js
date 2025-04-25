// Detection Module: captures video frames and sends to worker for face detection

import { getVideoElement } from './camera.js';

const stepFps = 250;
const defaultOptions = { inputSize: 128, scoreThreshold: 0.1, maxDetectedFaces: 1 };
let isDetecting = false;

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
}

/**
 * Stop the detection loop.
 */
export function stopDetection() {
  isDetecting = false;
} 