# Face Recognition App

A browser-based face recognition application using face-api.js and service workers for enhanced performance.

## Setup

1. Clone this repository:
```
git clone <repository-url>
cd Faceapi-with-Service-Worker-v8
```

2. Download the face-api.js models:
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