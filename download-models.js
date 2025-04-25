// Model downloader script
const fs = require('fs');
const path = require('path');
const https = require('https');

// Create models directory if it doesn't exist
const modelsDir = path.join(__dirname, 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
  console.log('Created models directory');
}

// Model files to download
const modelFiles = [
  // Tiny Face Detector
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model-shard1',
  
  // Face Landmark Model
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  
  // Face Recognition Model
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

// Base URL for model files
const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

// Download each model file
let completedDownloads = 0;
modelFiles.forEach(file => {
  const filePath = path.join(modelsDir, file);
  const fileUrl = baseUrl + file;
  
  console.log(`Downloading ${file}...`);
  
  const fileStream = fs.createWriteStream(filePath);
  https.get(fileUrl, response => {
    response.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      completedDownloads++;
      console.log(`Downloaded ${file} (${completedDownloads}/${modelFiles.length})`);
      
      if (completedDownloads === modelFiles.length) {
        console.log('\nAll model files downloaded successfully!');
        console.log('You can now run your face recognition app.');
      }
    });
  }).on('error', err => {
    fs.unlink(filePath, () => {}); // Delete file on error
    console.error(`Error downloading ${file}: ${err.message}`);
  });
}); 