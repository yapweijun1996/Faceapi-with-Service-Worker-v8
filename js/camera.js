/**
 * Camera Module
 * Handles camera initialization, access, and frame capture
 */

// Camera settings
const CAMERA_CONSTRAINTS = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: 'user',
    frameRate: { ideal: 30 }
  },
  audio: false
};

// Module state
let videoElement = null;
let stream = null;
let canvasElement = null;
let canvasContext = null;

/**
 * Initialize the camera and video stream
 * @returns {Promise<boolean>} Success status
 */
async function initCamera() {
  try {
    // Create video element if it doesn't exist
    if (!videoElement) {
      videoElement = document.getElementById('video') || document.createElement('video');
      videoElement.id = 'video';
      videoElement.autoplay = true;
      videoElement.muted = true;
      videoElement.playsInline = true;
      
      // Add to DOM if not already there
      if (!document.getElementById('video')) {
        const videoContainer = document.getElementById('video-container');
        if (videoContainer) {
          videoContainer.appendChild(videoElement);
        } else {
          document.body.appendChild(videoElement);
        }
      }
    }
    
    // Request camera access
    stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    
    // Connect stream to video element
    videoElement.srcObject = stream;
    
    // Create canvas for frame capture
    canvasElement = document.createElement('canvas');
    canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });
    
    // Wait for video to be ready
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        // Set canvas dimensions to match video
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        
        // Start playback
        videoElement.play().then(() => {
          console.log('Camera initialized:', 
                     `${videoElement.videoWidth}x${videoElement.videoHeight}`,
                     `@ ${stream.getVideoTracks()[0].getSettings().frameRate}fps`);
          resolve(true);
        }).catch(error => {
          console.error('Error starting video playback:', error);
          resolve(false);
        });
      };
      
      videoElement.onerror = (error) => {
        console.error('Video element error:', error);
        resolve(false);
      };
    });
  } catch (error) {
    console.error('Camera initialization error:', error);
    return false;
  }
}

/**
 * Stop camera stream and release resources
 */
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
    });
    stream = null;
  }
  
  if (videoElement) {
    videoElement.srcObject = null;
  }
}

/**
 * Capture a frame from the video element
 * @param {HTMLVideoElement} videoEl - Video element to capture from (defaults to module's video element)
 * @returns {Object} Object containing imageData, width, and height
 */
function captureFrame(videoEl) {
  const video = videoEl || videoElement;
  
  if (!video || video.readyState < 2 || !canvasContext) {
    return { imageData: null, width: 0, height: 0 };
  }
  
  const width = video.videoWidth;
  const height = video.videoHeight;
  
  // Ensure canvas dimensions match video
  if (canvasElement.width !== width || canvasElement.height !== height) {
    canvasElement.width = width;
    canvasElement.height = height;
  }
  
  // Draw video frame to canvas
  canvasContext.drawImage(video, 0, 0, width, height);
  
  // Get image data from canvas
  const imageData = canvasContext.getImageData(0, 0, width, height);
  
  return { imageData, width, height };
}

/**
 * Get the video element
 * @returns {HTMLVideoElement} Video element
 */
function getVideoElement() {
  return videoElement;
}

/**
 * Get current camera resolution
 * @returns {Object} Width and height of current video feed
 */
function getCameraResolution() {
  if (!videoElement) return { width: 0, height: 0 };
  
  return {
    width: videoElement.videoWidth,
    height: videoElement.videoHeight
  };
}

// Export public methods
export {
  initCamera,
  stopCamera,
  captureFrame,
  getVideoElement,
  getCameraResolution,
  CAMERA_CONSTRAINTS
}; 