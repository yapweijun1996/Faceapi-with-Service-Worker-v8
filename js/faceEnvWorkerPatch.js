// Patches the Web Worker environment to mimic browser globals required by face-api.js/TensorFlow.js
// From: https://github.com/justadudewhohacks/face-api.js/issues/47

// --- Canvas Polyfills ---
// Use OffscreenCanvas as the Canvas implementation in the worker
self.Canvas = self.HTMLCanvasElement = OffscreenCanvas;
self.HTMLCanvasElement.name = 'HTMLCanvasElement'; // Set name property expected by some checks
self.Canvas.name = 'Canvas';

// Use OffscreenCanvasRenderingContext2D for the 2D context
self.CanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;

// --- Dummy HTML Element Constructors ---
// Define dummy constructors for Image and Video elements. face-api might check for their existence.
function HTMLImageElement() { console.log("Worker Patch: Dummy HTMLImageElement created"); }
function HTMLVideoElement() { console.log("Worker Patch: Dummy HTMLVideoElement created"); }

self.Image = HTMLImageElement;
self.Video = HTMLVideoElement;

// --- Fake localStorage ---
// Simple in-memory implementation of the Storage API for localStorage.
function Storage() {
    let _data = {};
    this.clear = function () {
        _data = {};
    };
    this.getItem = function (id) {
        // Use hasOwnProperty for safer lookup
        return Object.prototype.hasOwnProperty.call(_data, id) ? _data[id] : undefined;
    };
    this.removeItem = function (id) {
        return delete _data[id];
    };
    this.setItem = function (id, val) {
        // Ensure value is stored as a string, as per localStorage spec
        return _data[id] = String(val);
    };
    // Add length property required by Storage interface
    Object.defineProperty(this, 'length', {
        get: () => Object.keys(_data).length
    });
}

// --- Fake Document & Window ---
// Minimal Document implementation (needed for createElement)
class Document extends EventTarget {}
const document = new Document(); // Use const as document is not reassigned

// Set window to the worker's global scope (`self`)
const window = self.Window = self; // Use const as window is not reassigned

// Assign the fake localStorage
self.localStorage = new Storage();

// Minimal document.createElement implementation
function createElement(element) {
    switch (element.toLowerCase()) { // Use toLowerCase for case-insensitivity
        case 'canvas':
            console.log('Worker Patch: Creating fake canvas element');
            // Create an OffscreenCanvas and mimic properties of an HTMLCanvasElement
            const canvas = new Canvas(1, 1); // Use the patched Canvas (OffscreenCanvas)
            canvas.localName = 'canvas';
            canvas.nodeName = 'CANVAS';
            canvas.tagName = 'CANVAS';
            canvas.nodeType = 1; // Node.ELEMENT_NODE
            canvas.innerHTML = ''; // Mimic innerHTML property
            canvas.remove = () => { console.log('Worker Patch: Fake canvas remove() called'); };
            return canvas;
        // Add basic stubs for img and video if needed by specific checks, though they don't do much
        case 'img':
             console.log('Worker Patch: Creating fake img element');
             return new HTMLImageElement();
        case 'video':
             console.log('Worker Patch: Creating fake video element');
             return new HTMLVideoElement();
        default:
            console.warn('Worker Patch: document.createElement called for unhandled element:', element);
            // Return a generic object or throw an error depending on expected behavior
            return { nodeName: element.toUpperCase(), localName: element.toLowerCase(), tagName: element.toUpperCase(), nodeType: 1 };
    }
}
document.createElement = createElement;

// Assign worker's location to document.location
document.location = self.location;

// --- Final Global Assignments & Checks ---
// Ensure globals are assigned correctly
self.window = window;
self.document = document;
self.HTMLImageElement = HTMLImageElement;
self.HTMLVideoElement = HTMLVideoElement;

// Check if all required patches seem to be in place
const isBrowserCheck = (
    typeof window === 'object' &&
    typeof document !== 'undefined' &&
    typeof HTMLImageElement !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLVideoElement !== 'undefined' &&
    typeof ImageData !== 'undefined' &&
    typeof CanvasRenderingContext2D !== 'undefined'
);

if (!isBrowserCheck) {
    console.error("Monkey patch check failed. Required globals:", {
        window: typeof window,
        document: typeof document,
        HTMLImageElement: typeof HTMLImageElement,
        HTMLCanvasElement: typeof HTMLCanvasElement,
        HTMLVideoElement: typeof HTMLVideoElement,
        ImageData: typeof ImageData,
        CanvasRenderingContext2D: typeof CanvasRenderingContext2D
    });
    throw new Error("Failed to monkey patch worker environment for face-api.js.");
} else {
    console.log("Worker environment patched successfully for face-api.js.");
}

// const ofc = new OffscreenCanvas(1,1);
// const ctx = ofc.getContext('2d');
// console.log(typeof ctx, ctx);