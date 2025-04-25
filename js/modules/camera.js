// Camera Module: handles video stream operations

import { showToast } from './ui.js';

/**
 * Get the main video element from the DOM.
 * @returns {HTMLVideoElement|null}
 */
export function getVideoElement() {
  return document.getElementById('video');
}

/**
 * Start the user's camera and stream to the video element.
 * @returns {Promise<void>}
 */
export async function startCamera() {
  const video = getVideoElement();
  if (!video) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    console.error('Error accessing webcam:', error);
    showToast('Unable to access camera.', 'error');
  }
}

/**
 * Stop the video stream and clear the video element.
 */
export function stopCamera() {
  const video = getVideoElement();
  if (video && video.srcObject) {
    const stream = video.srcObject;
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
} 