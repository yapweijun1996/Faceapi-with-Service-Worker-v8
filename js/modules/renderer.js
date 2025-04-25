import { getVideoElement } from './camera.js';

/**
 * Draw face detection and processed image data to output canvas.
 * @param {Array} detections - Detections array from service worker.
 * @param {string} canvasId - ID of the output canvas element.
 */
export function drawImageDataToCanvas(detections, canvasId) {
  const placeholder = document.getElementById('output-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  const outputCanvas = document.getElementById(canvasId);
  if (!outputCanvas) return;
  const ctx = outputCanvas.getContext('2d');

  // If no processed face image returned, draw the current video frame as proof
  if (!Array.isArray(detections) || !detections[1] || detections[1].length === 0) {
    const video = getVideoElement();
    if (video && video.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA) {
      outputCanvas.width = video.videoWidth;
      outputCanvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      ctx.font = '20px Arial';
      ctx.fillStyle = 'white';
      ctx.fillText('No face detected', 10, 30);
    }
    return;
  }

  // Draw the processed face image
  const imageData = detections[1][0];
  outputCanvas.width = imageData.width;
  outputCanvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);

  // Draw confidence if available
  let confidence = 0;
  if (Array.isArray(detections[0]) && detections[0].length > 0 &&
      detections[0][0] && detections[0][0].detection &&
      typeof detections[0][0].detection._score === 'number') {
    confidence = detections[0][0].detection._score * 100;
  }
  ctx.font = '20px Arial';
  ctx.fillStyle = 'white';
  ctx.fillText(`Confidence: ${confidence.toFixed(2)}%`, 10, 30);
} 