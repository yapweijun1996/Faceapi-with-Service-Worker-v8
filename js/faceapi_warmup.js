/**
 * faceapi_warmup.js
 * ------------------
 * Helper utilities that sit on top of face-api.js + a Service Worker.
 * The script is responsible for:
 *   • Boot-strapping the Service Worker that loads the neural-network models in a
 *     separate thread (avoids blocking the main UI).
 *   • Handling camera start / stop, reading frames and forwarding them to the
 *     worker for inference.
 *   • Drawing helper overlays: raw frame, bounding box, facial landmarks, etc.
 *   • Performing basic registration / verification logic using Euclidean
 *     distance between face descriptors.
 *
 * NOTE: For brevity the implementation uses a bunch of global variables. If you
 * intend to maintain / extend the code consider wrapping it inside an IIFE or
 * converting it to an ES Module to avoid polluting the global scope.
 */
var videoId = "video";
var canvasId = "canvas";
var canvasId2 = "canvas2";
var canvasId3 = "canvas3";
var canvasOutputId = "canvas_output";
var step_fps = 125 ; // 1000 / 125 = 8 FPS
var vle_face_landmark_position_yn = "y" ; // y / n
var vle_facebox_yn = "y" ; // y / n


var isWorkerReady = false;
var worker = "";
var serviceWorkerFileName = "faceDetectionServiceWorker.js";
var serviceWorkerFilePath = "./js/faceDetectionServiceWorker.js";
var imgFaceFilePathForWarmup = "./models/face_for_loading.png";

if(typeof face_detector_options_setup === "undefined" || face_detector_options_setup === "undefined"){
	var face_detector_options_setup = {
		inputSize: 128,
		scoreThreshold: 0.1,
		maxDetectedFaces: 1,
	};
}

var isDetectingFrame = false;          // Prevent overlapping detection requests
var videoDetectionStep = null;         // Reference to the next frame callback

async function camera_start() {
	var video = document.getElementById(videoId);
	try {
		var stream = await navigator.mediaDevices.getUserMedia({ video: true });
		video.srcObject = stream;
	} catch (error) {
		console.error('Error accessing webcam:', error);
	}
}

async function camera_stop() {
	var video = document.getElementById(videoId);
	if (video.srcObject) {
		const stream = video.srcObject;
		const tracks = stream.getTracks();
		tracks.forEach(track => track.stop());
		video.srcObject = null;
	}
}

async function handleJsonFileInput(event) {
	const file = event.target.files[0];
	if (file) {
		const reader = new FileReader();
		reader.onload = async (e) => {
			const jsonContent = e.target.result;
			await load_face_descriptor_json(jsonContent);
		};
		reader.readAsText(file);
	}
}

async function load_face_descriptor_json(warmupFaceDescriptorJson) {
	try {
		console.log('warmupFaceDescriptorJson:');
		console.log(warmupFaceDescriptorJson);
		
		const data = JSON.parse(warmupFaceDescriptorJson);
		console.log('data:');
		console.log(data);
		//registeredDescriptors = Object.values(data).map(descriptor => new Float32Array(descriptor));
		registeredDescriptors = Object.values(data).map(descriptor => {
			if (Array.isArray(descriptor) || typeof descriptor === 'object' && descriptor !== null) {
				return new Float32Array(Object.values(descriptor));
			} else {
				console.warn('Invalid descriptor format, expected an object or array:', descriptor);
				return null;
			}
		}).filter(descriptor => descriptor !== null);
		
		
		console.log('registeredDescriptors:');
		console.log(registeredDescriptors);
		console.log('Default face descriptors loaded:', registeredDescriptors);
		
		/** Start Camera and Detection [start] **/
		camera_start();
		video_face_detection();
		/** Start Camera and Detection [end  ] **/
		
	} catch (error) {
		console.error('Error loading default face descriptors:', error);
	}
}

function video_face_detection() {
	var video = document.getElementById(videoId);
	var canvas = document.getElementById(canvasId);
	canvas.willReadFrequently = true; 
	var context = canvas.getContext("2d");
	context.willReadFrequently = true; 
	
	video.addEventListener('play', () => {
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		function step() {
			// Skip processing if video is paused/ended or a detection is already running
			if (video.paused || video.ended) {
				return;
			}
			if (isDetectingFrame) {
				// Wait until the previous detection result returns
				requestAnimationFrame(step);
				return;
			}

			// Capture current frame
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

			// Mark a detection in-flight and send the frame to the worker
			isDetectingFrame = true;
			worker.postMessage({
				type: 'DETECT_FACES',
				imageData,
				width: canvas.width,
				height: canvas.height,
				face_detector_options: face_detector_options_setup,
			});

			// Schedule the next frame – this will be skipped if detection is still running
			// Next frame will be scheduled when the worker returns the detection result
		}

		// Store reference so we can trigger a new cycle from the worker callback
		videoDetectionStep = step;
		requestAnimationFrame(step);
	});
}
			
async function unregisterAllServiceWorker() {
	navigator.serviceWorker.getRegistrations().then(registrations => {
		registrations.forEach(registration => {
			registration.unregister();
		});
	});
}

async function drawImageDataToCanvas(detections, canvasId) {
    var canvas = document.getElementById(canvasId);
    var context = canvas.getContext("2d");

    // Check if detections have faces
    if (Array.isArray(detections) && detections.length > 0) {
        const imageData = detections[1][0]; // Assuming imageData is part of detections
		var confidence = 0;
		
		if (detections.length > 0 && detections[0].length > 0) {
			if(detections[0][0].detection._score !== "undefined"){
				confidence = detections[0][0].detection._score;
			}
			if(confidence != 0){
				confidence = confidence * 100;
			}
		}
		console.log(confidence);

        // Set canvas dimensions to match the imageData
        canvas.width = imageData.width;
        canvas.height = imageData.height;

        // Draw the first ImageData onto the canvas at position (0, 0)
        context.putImageData(imageData, 0, 0);
		
		// Display confidence percentage
        context.font = '20px Arial';
        context.fillStyle = 'white'; // Color for text
        context.fillText(`Confidence: ${confidence.toFixed(2)}%`, 10, 30); // Fixed to 2 decimal places

    } else {
        console.log('No image data to draw');
    }
}

function drawLandmarks(landmarks) {
	const canvas = document.getElementById('canvas2');
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings

	ctx.fillStyle = 'red'; // Color for landmarks
	landmarks.forEach(landmark => {
		ctx.beginPath();
		ctx.arc(landmark.x, landmark.y, 2, 0, 2 * Math.PI); // Draw small circles
		ctx.fill();
	});
}

// Function to draw the face bounding box on the canvas
function draw_face_box(canvas_id, box, confidence) {
    var canvas = document.getElementById(canvas_id);
    var context = canvas.getContext("2d");
    var video = document.getElementById(videoId);

    if (typeof canvas === "object") {
        // Set canvas dimensions to match video dimensions
        canvas.width = video.videoWidth;  // Use video.videoWidth for accurate dimensions
        canvas.height = video.videoHeight; // Use video.videoHeight for accurate dimensions
        // Optional: Adjust canvas position using CSS
        //canvas.style.marginTop = `-${video.videoHeight}px`; // Move canvas up by video height if needed

        canvas.style.display = "block";
        console.log("draw_face_box start");
        console.log(typeof canvasId3);

        // Ensure the canvas is cleared before drawing the new box
        context.clearRect(0, 0, canvas.width, canvas.height); // Clear any previous drawings

        // Determine the color based on confidence
        let boxColor = 'red';  // Default to red if no confidence or low confidence
        if (confidence >= 0.8) {
            boxColor = 'green';  // High confidence: green
        } else if (confidence >= 0.5) {
            boxColor = 'yellow'; // Medium confidence: yellow
        }

        // Draw the bounding box on the canvas
        context.beginPath();
        context.rect(box._x, box._y, box._width, box._height);  // Draw the rectangle
        context.lineWidth = 3;  // Set the border width
        context.strokeStyle = boxColor;  // Set the border color
        context.fillStyle = 'rgba(255, 0, 0, 0)';  // Optional: Set fill color with transparency

        // Fill the rectangle (optional) and then stroke (outline)
        context.fill();
        context.stroke();

        // Display confidence rate above the bounding box, top-right corner
        context.font = "16px Arial";  // Set font size for the text above the box
        context.fillStyle = boxColor;  // Use white for red boxes, black for others
        context.textAlign = "right";  // Align the text to the right of the bounding box
        context.textBaseline = "bottom"; // Align text to the bottom (so it's above the box)

        // Calculate the position to place the confidence rate above the bounding box
        let confidenceText = `${Math.round(confidence * 100)}%`;
        let textX = box._x + box._width - 5;  // Position the text at the right edge of the box, with a small margin
        let textY = box._y - 10;  // Place the text 10px above the box

        // Draw the confidence text above the bounding box
        context.fillText(confidenceText, textX, textY);  // Draw the confidence percentage above the box
    }
}


// Function to draw the face landmarks on the canvas
function draw_face_landmarks() {
	
	var video = document.getElementById(videoId);
	var canvas = document.getElementById(canvasId2);
	var ctx = canvas.getContext('2d');
	
	console.log(typeof canvas);
	if(typeof canvas === "object"){
		canvas.style.display = "block";
		
		// Set canvas dimensions to match video dimensions
		canvas.width = video.videoWidth;  // Use video.videoWidth for accurate dimensions
		canvas.height = video.videoHeight; // Use video.videoHeight for accurate dimensions// Optional: Adjust canvas position using CSS
		//canvas.style.marginTop = `-${video.videoHeight}px`; // Move canvas up by video height if needed
		
		// Get the landmarks
		var landmarks = event.data.data.detections[0][0].landmarks._positions;
		
		// Clear the canvas
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Set styles for drawing
		ctx.fillStyle = 'red'; // Color for landmarks
		ctx.strokeStyle = 'red'; // Color for landmark lines, if needed
		ctx.lineWidth = 2; // Line width for any lines drawn between landmarks

		// Draw each landmark as a circle
		landmarks.forEach(landmark => {
			ctx.beginPath();
			ctx.arc(landmark._x, landmark._y, 2, 0, 2 * Math.PI); // Draw a small circle at each landmark
			ctx.fill();
		});

		// Optionally, draw lines between specific landmarks if needed (e.g., connecting certain features)
		// Example: Connect the first few landmarks (adjust based on your needs)
		ctx.beginPath();
		ctx.moveTo(landmarks[0]._x, landmarks[0]._y); // Start from the first landmark
		landmarks.slice(1, 5).forEach(landmark => { // Connect the first 4 landmarks
			ctx.lineTo(landmark._x, landmark._y);
		});
		ctx.stroke();
	}
}

var registeredDescriptors = [];
var maxCaptures = 3;
var registrationCompleted = false;
var verificationCompleted = false;

function faceapi_register(descriptor) {
    if (descriptor && !registrationCompleted) {
        registeredDescriptors.push(descriptor);

        if (registeredDescriptors.length >= maxCaptures) {
            faceapi_get_face_id_descriptors = registeredDescriptors;
            
            alert("Registration completed");
            registrationCompleted = true;
            faceapi_action = null;
            camera_stop();

            // Convert the descriptors array to a JSON string
            const jsonData = JSON.stringify(faceapi_get_face_id_descriptors, null, 2);
            
            // Create a Blob with the JSON data and set its MIME type to 'application/json'
            const blob = new Blob([jsonData], { type: 'application/json' });
            
            // Create an object URL for the Blob
            const url = URL.createObjectURL(blob);
            
            // Create a download link
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = 'faceapi_get_face_id_descriptors.json';
            downloadLink.textContent = 'Download Descriptors JSON';

            // Append the link to the document body or any appropriate container
            document.body.appendChild(downloadLink);

            // Optionally trigger the download automatically
            downloadLink.click();

            // Clean up by revoking the object URL and removing the download link
            URL.revokeObjectURL(url);
            document.body.removeChild(downloadLink);
        }
    }
}

var vle_distance_rate = 0.3;

/**
 * Threshold used by face-api.js Euclidean distance to decide whether two
 * face descriptors correspond to the same person.
 *
 * A lower value makes the verification stricter (fewer false positives but
 * more false negatives). 0.3 is a commonly used starting point that works
 * well in good lighting conditions. Adjust empirically for your setup.
 */
function faceapi_verify(descriptor){
	/**
	 * Compares the descriptor extracted from the current video frame against all
	 * previously registered descriptors and determines whether the face belongs
	 * to the registered person.
	 *
	 * The comparison uses the Euclidean distance provided by face-api.js. If any
	 * distance is below `vle_distance_rate` we treat it as a match. The routine
	 * runs only once per verification session – after a positive result the
	 * `verificationCompleted` flag is set so we do not re-enter.
	 *
	 * @param {Float32Array} descriptor – Descriptor returned by face-api.js for
	 *        the face detected in the current frame (128-length vector).
	 */
	// multiple [start]
	if (descriptor && !verificationCompleted) {
		let matchFound = false;
		let distance;
		
		for (let i = 0; i < registeredDescriptors.length; i++) {
		console.log("--descriptor.length "+descriptor.length);
		console.log("--registeredDescriptors[i].length "+registeredDescriptors[i].length);
			if (descriptor.length === registeredDescriptors[i].length) {
				distance = faceapi.euclideanDistance(descriptor, registeredDescriptors[i]);
				
				console.log("--distance "+distance);
				if (distance < vle_distance_rate) {
					matchFound = true;
					break;
				}
			}
		}
		
		if (matchFound) {
			camera_stop();
			verificationCompleted = true;
			faceapi_action = null;
			alert("Face Verified: Same Person, distance : " + distance);
		} else {
			// The current descriptor did not match any reference. In production you might
			// want to provide user feedback here (e.g., shake animation, sound, etc.) or
			// count failed attempts before locking the flow.
		}
	}
	// multiple [end  ]
}

async function initWorkerAddEventListener() {
	navigator.serviceWorker.addEventListener('message', (event) => {
		console.log('event.data.type.');
		console.log(event.data.type);
		switch (event.data.type) {
			case 'MODELS_LOADED':
			console.log('Face detection models loaded.');
			faceapi_warmup();
			break;
			case 'DETECTION_RESULT':
			console.log("DETECTION_RESULT here");
			console.log(event);
			console.log(event.data.data.detections[0]);
			console.log("event.data.data.detections");
			console.log(event.data.data.detections);
			
			
			if(event.data.data.detections[0] !== null){
				if(typeof event.data.data.detections[0][0]["descriptor"] !== "undefined"){
					console.log("descriptor : ");
					console.log(event.data.data.detections[0][0]["descriptor"]);
					var temp_descriptor = event.data.data.detections[0][0]["descriptor"];
					
					if(faceapi_action == "verify"){
						faceapi_verify(temp_descriptor);
					}else if(faceapi_action == "register"){
						faceapi_register(temp_descriptor);
					}else{
						console.log("faceapi_action is NULL");
					}
					
					
				}
				try{drawImageDataToCanvas(event.data.data.detections, canvasOutputId);}catch(err){console.log(err);}
			}
			
			if(typeof vle_face_landmark_position_yn === "string"){
				if(vle_face_landmark_position_yn == "y"){
					
					var temp_canvas_id = canvasId2;
					var temp_canvas = document.getElementById(temp_canvas_id);
					
					if (event.data.data.detections[0] !== null) {
						console.log("drawFaceLandmarks");
						draw_face_landmarks();
					}else{
						temp_canvas.style.display = "none";
					}
				}	
			}
			
			
			if(typeof vle_facebox_yn === "string"){
				if(vle_facebox_yn == "y"){
					var temp_canvas_id = canvasId3;
					var temp_canvas = document.getElementById(temp_canvas_id);
					if (event.data.data.detections[0] !== null) {
						// facebox
						console.log("draw_face_box");
						if (event.data.data.detections[0] && event.data.data.detections[0] !== undefined) {
							var box = event.data.data.detections[0][0].alignedRect._box;
							var confidence = event.data.data.detections[0][0].detection._score;

							// Check if box is defined and not null
							if (box && box._x !== undefined && box._y !== undefined && box._width !== undefined && box._height !== undefined) {
								// Safe to call the function as box is valid
								draw_face_box(temp_canvas_id, box, confidence);
							} else {
								console.log("Box is not defined or invalid");
							}
						}
					}else{
						temp_canvas.style.display = "none";
					}
				}
			}
			
			
			// After all drawing operations are complete, mark detection as done and queue the next frame.
			isDetectingFrame = false;
			if (typeof videoDetectionStep === 'function') {
				requestAnimationFrame(videoDetectionStep);
			}
			
			break;
			case 'WARMUP_RESULT':
			console.log('WARMUP_RESULT.');
			console.log(event);
			console.log(event.data.data.detections);
			
			if (typeof warmup_completed !== 'undefined') {
				// Execute all functions in the array
				if (warmup_completed.length > 0) {
					warmup_completed.forEach(func => func());
				}
			}else{
				setTimeout(faceapi_warmup, 10000);
			}
			
			break;
			default:
			console.log('Unknown message type:', event.data.type);
		}
	});
}

async function workerRegistration() {
	if (!('serviceWorker' in navigator)) {
		console.error('Service workers are not supported in this browser.');
		return;
	}

	// Ensure the scope of the SW covers the current page (script directory by default)
	const swScope = './js/';

	// Attempt to find an existing registration for our SW file within scope
	const registrations = await navigator.serviceWorker.getRegistrations();
	let registration = registrations.find(reg => reg.active && reg.active.scriptURL.endsWith(serviceWorkerFileName));

	if (!registration) {
		console.log('Registering new service worker');
		try {
			registration = await navigator.serviceWorker.register(serviceWorkerFilePath, { scope: swScope });
		} catch (err) {
			console.error('Service worker registration failed:', err);
			throw err;
		}
	}

	// Wait until the service worker is activated. Avoid using navigator.serviceWorker.ready
	if (!registration.active) {
		console.log('Waiting for service worker to activate...');

		await new Promise(resolve => {
			// If there is an installing worker listen for state changes
			const installingWorker = registration.installing || registration.waiting;
			if (!installingWorker) {
				// No worker yet (very unlikely) – resolve immediately
				return resolve();
			}

			if (installingWorker.state === 'activated') {
				return resolve();
			}

			installingWorker.addEventListener('statechange', evt => {
				if (evt.target.state === 'activated') {
					resolve();
				}
			});
		});
	}

	// After activation grab the worker reference
	worker = registration.active || registration.waiting || registration.installing;
	return worker;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function load_model() {
    if (!worker) {
        // Ensure we have a reference – this should usually not happen because
        // initWorker already awaited workerRegistration(), but keep it as a
        // safeguard.
        await workerRegistration();
    }

    if (worker) {
        worker.postMessage({ type: 'LOAD_MODELS' });
    } else {
        console.error('Unable to post message, worker is undefined');
    }
}

async function initWorker() {
    if ('serviceWorker' in navigator) {
        try {
            // Optionally uncomment if needed
            // await unregisterAllServiceWorker();

            console.log("Registering service worker...");
            await workerRegistration(); // Wait for worker registration

            console.log("Adding event listeners...");
            await initWorkerAddEventListener(); // Wait for event listeners to be added

            console.log("Waiting for 1 second...");
            await delay(500); // Wait for 1 second to give the service worker some time to activate. If not, when the service worker is created for the first time, posting a message will cause an error and stop everything.

            console.log("Loading model...");
            await load_model(); // Wait for the model to load
            
            isWorkerReady = true; // Set the worker as ready
            console.log("Worker initialized successfully.");
        } catch (error) {
            console.error("Error initializing worker:", error);
        }
    } else {
        console.error('Service workers are not supported in this browser.');
    }
}


function faceapi_warmup() {
	var img_face_for_loading = imgFaceFilePathForWarmup;
	if (img_face_for_loading) {
		var img = new Image();
		img.src = img_face_for_loading;
		img.onload = () => {
			
			// Create the canvas element
			let canvas_hidden = document.createElement('canvas');
			canvas_hidden.willReadFrequently = true; 
			canvas_hidden.style.display = 'none'; // Hide the canvas
			document.body.appendChild(canvas_hidden); // Append to the body
			let context = canvas_hidden.getContext("2d");

			canvas_hidden.width = img.width;
			canvas_hidden.height = img.height;
			context.drawImage(img, 0, 0, img.width, img.height);
			var imageData = context.getImageData(0, 0, img.width, img.height);
			worker.postMessage({
				type: 'WARMUP_FACES',
				imageData,
				width: img.width,
				height: img.height
			});
			canvas_hidden.remove();
		};
	}
}

//initWorker();
window.onload = function(e){ 
    //console.log("window.onload"); 
	//initWorker();
}

document.addEventListener("DOMContentLoaded", async function(event) {
    /* 
    - Code to execute when only the HTML document is loaded.
    - This doesn't wait for stylesheets, 
    images, and subframes to finish loading. 
    */
    console.log("DOMContentLoaded"); 
    await initWorker();
});