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
  
  // Always draw the current video frame first
  const video = getVideoElement();
  if (video && video.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA) {
    outputCanvas.width = video.videoWidth;
    outputCanvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
  }

  // If no processed face image returned, add a "No face detected" message
  if (!Array.isArray(detections) || !detections[1] || detections[1].length === 0) {
    ctx.font = '24px Arial';
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    const message = 'No face detected';
    const x = outputCanvas.width / 2 - 100;
    const y = 40;
    
    // Draw text with stroke for better visibility
    ctx.strokeText(message, x, y);
    ctx.fillText(message, x, y);
    return;
  }

  // If face detected, draw detection details over the video
  if (Array.isArray(detections[0]) && detections[0].length > 0 && detections[0][0]) {
    const detection = detections[0][0];
    
    // Draw box around the face if box info is available
    if (detection.detection && detection.detection._box) {
      const box = detection.detection._box;
      const scale = outputCanvas.width / box._imageDims._width;
      
      const x = box._x * scale;
      const y = box._y * scale;
      const width = box._width * scale;
      const height = box._height * scale;
      
      // Draw face rectangle
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      // Draw confidence if available
      if (typeof detection.detection._score === 'number') {
        const confidence = detection.detection._score * 100;
        ctx.font = '24px Arial';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        
        // Draw text with stroke for better visibility
        const text = `Confidence: ${confidence.toFixed(2)}%`;
        ctx.strokeText(text, x, y - 10);
        ctx.fillText(text, x, y - 10);
      }
    }
    
    // Draw landmarks if available
    if (detection.landmarks) {
      const positions = detection.landmarks._positions;
      const scale = outputCanvas.width / detection.landmarks._imageDims._width;
      
      ctx.fillStyle = 'blue';
      positions.forEach(point => {
        ctx.beginPath();
        ctx.arc(point._x * scale, point._y * scale, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }
} 