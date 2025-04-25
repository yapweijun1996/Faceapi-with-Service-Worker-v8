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
  console.log('🚀 Initializing face detection loop');
  const video = getVideoElement();
  if (!video) {
    console.error('❌ Video element not found');
    return;
  }

  // Create offscreen/dynamic canvas for frame processing
  let detectCanvas;
  let context;
  if (typeof OffscreenCanvas !== 'undefined') {
    console.log('✅ Using OffscreenCanvas for detection');
    detectCanvas = new OffscreenCanvas(1, 1);
    context = detectCanvas.getContext('2d');
  } else {
    console.log('ℹ️ Using regular canvas for detection');
    detectCanvas = document.createElement('canvas');
    context = detectCanvas.getContext('2d');
  }

  video.addEventListener('play', () => {
    console.log('▶️ Video started playing, beginning detection loop');
    isDetecting = true;
    consecutiveNoFaceFrames = 0;
    updateStatus('Looking for face...', 100);
    
    // Continuous detection loop
    function step() {
      if (!isDetecting) {
        console.log('⏹️ Detection stopped');
        return;
      }
      // Wait for valid video metadata
      if (!video.videoWidth || !video.videoHeight) {
        console.log('⏳ Waiting for valid video dimensions...');
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
        console.error('❌ Capture error:', err);
        setTimeout(step, stepFps);
        return;
      }
      
      // Send data to worker
      console.log('📤 Sending frame to service worker for detection', { time: new Date().toISOString() });
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
      } else {
        console.log('⏸️ Video paused or ended, detection paused');
      }
    }
    // Start detection loop
    step();
  });
  
  // Setup handler for face detection results from service worker
  const messageHandler = event => {
    console.log('📨 Message received in detection module:', event.data);
    const { type, data } = event.data;
    if (type === 'DETECTION_RESULT') {
      console.log('🔍 Detection result handling in detection.js module');
      const detections = data.detections;
      
      // Update face detection status message
      if (!detections || !detections[0] || !detections[0].length) {
        consecutiveNoFaceFrames++;
        console.log(`❌ No face detected (${consecutiveNoFaceFrames}/${MAX_NO_FACE_FRAMES})`);
        if (consecutiveNoFaceFrames >= MAX_NO_FACE_FRAMES) {
          updateStatus('No face detected. Please center your face in the camera view.', 100);
        }
      } else {
        consecutiveNoFaceFrames = 0;
        console.log('✅ Face detected:', detections[0].length > 0 ? 'Yes' : 'No');
        updateStatus('Face detected!', 100);
      }
    }
  };
  
  // Ensure we only add the listener once
  console.log('🎧 Setting up detection result listener');
  navigator.serviceWorker.removeEventListener('message', messageHandler);
  navigator.serviceWorker.addEventListener('message', messageHandler);
}

/**
 * Stop the detection loop.
 */
export function stopDetection() {
  console.log('⏹️ Stopping detection loop');
  isDetecting = false;
  consecutiveNoFaceFrames = 0;
} 