# Face Recognition App

A browser-based face recognition application using face-api.js and service workers for enhanced performance.

## Setup

1. Clone this repository:
```
git clone <repository-url>
cd Faceapi-with-Service-Worker-v8
```

2. Download the face-api.js models using the provided script:
```
# If you have Node.js installed:
node download-models.js
```

Alternatively, manually download models:
   - Create a `models` directory in the root of the project
   - Download the required models from [face-api.js models](https://github.com/justadudewhohacks/face-api.js/tree/master/weights)
   - Required models:
     - tiny_face_detector_model-weights_manifest.json
     - tiny_face_detector_model-shard1
     - face_landmark_68_model-weights_manifest.json
     - face_landmark_68_model-shard1
     - face_recognition_model-weights_manifest.json
     - face_recognition_model-shard1
     - face_recognition_model-shard2

3. Start a local server:
```
python -m http.server 8000
```
Or use any other local server of your choice.

4. Open your browser and navigate to:
```
http://localhost:8000
```

## Troubleshooting

### Common Issues

1. **Service Worker Loading Errors**
   - Make sure your server supports HTTPS if testing remotely, as service workers require secure contexts
   - For local development, service workers are allowed on localhost

2. **face-api.js Loading Issues**
   - The environment patch must be loaded before face-api.js in the service worker
   - If you see "Could not find a global object" error, check that faceEnvWorkerPatch.js is loaded first

3. **Models Not Loading**
   - Ensure the models folder contains all required model files
   - Check browser console for specific path errors

4. **Camera Access**
   - Ensure your browser has permission to access the camera
   - Some browsers require HTTPS even for camera access

### Testing Locally

For local testing, you can use:
```bash
npx http-server
```

Or if you prefer Python:
```bash
# Python 3
python -m http.server
```

Then open `http://localhost:8080` in your browser.

## Usage

1. Upload a JSON file with facial descriptors (if you have one)
2. Click "Start Camera" to enable your webcam
3. Use "Register Face" to save your facial features 
4. Use "Verify Face" to check against saved facial data

## Browser Compatibility

This application requires:
- Modern browser with Service Worker support
- WebRTC / getUserMedia support for camera access
- WebGL for face-api.js processing

## License

This project is licensed under the MIT License - see the LICENSE file for details. 