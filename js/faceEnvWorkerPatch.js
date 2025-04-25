/**
 * Service Worker Environment Patch for face-api.js
 * 
 * This script creates browser-like objects in the Service Worker context
 * that are required by face-api.js but not normally available in workers.
 * 
 * Based on: https://github.com/justadudewhohacks/face-api.js/issues/47
 */

// TensorFlow environment initialization
self.tf = self.tf || {};
self.tf.ENV = self.tf.ENV || {
    set: function(key, value) {
        console.log(`Setting TF environment variable ${key} to ${value}`);
        if (!self.tf.envVars) self.tf.envVars = {};
        self.tf.envVars[key] = value;
    },
    get: function(key) {
        return self.tf.envVars ? self.tf.envVars[key] : undefined;
    }
};

// Disable WebGL packing to prevent height errors
self.tf.ENV.set('WEBGL_PACK', false);

// Mock DOM elements required by face-api.js
self.Canvas = self.HTMLCanvasElement = OffscreenCanvas;
self.HTMLCanvasElement.name = 'HTMLCanvasElement';
self.Canvas.name = 'Canvas';
self.CanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;

// Mock HTML elements that don't exist in Service Worker
function HTMLImageElement() {}
function HTMLVideoElement() {}

self.Image = HTMLImageElement;
self.Video = HTMLVideoElement;

// Create localStorage mock
function Storage() {
    const _data = {};
    
    this.clear = function() {
        Object.keys(_data).forEach(key => delete _data[key]);
        return {};
    };
    
    this.getItem = function(id) {
        return _data.hasOwnProperty(id) ? _data[id] : undefined;
    };
    
    this.removeItem = function(id) {
        return delete _data[id];
    };
    
    this.setItem = function(id, val) {
        return _data[id] = String(val);
    };
}

// Create a minimal Document implementation
class Document extends EventTarget {
    constructor() {
        super();
        this.location = self.location;
    }
    
    // Mock document.createElement
    createElement(element) {
        if (element === 'canvas') {
            const canvas = new Canvas(1, 1);
            canvas.localName = 'canvas';
            canvas.nodeName = 'CANVAS';
            canvas.tagName = 'CANVAS';
            canvas.nodeType = 1;
            canvas.innerHTML = '';
            canvas.remove = () => {};
            return canvas;
        }
        
        console.log('createElement called with unsupported element:', element);
        return null;
    }
}

// Create global objects
const document = new Document();
const window = self;

// Assign to global scope
self.window = window;
self.document = document;
self.localStorage = new Storage();
self.HTMLImageElement = HTMLImageElement;
self.HTMLVideoElement = HTMLVideoElement;

// Verify that all required objects are available
const isBrowserEnvironmentAvailable = 
    typeof window === 'object' &&
    typeof document !== 'undefined' &&
    typeof HTMLImageElement !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLVideoElement !== 'undefined' &&
    typeof ImageData !== 'undefined' &&
    typeof CanvasRenderingContext2D !== 'undefined';

// Throw an error if environment setup failed
if (!isBrowserEnvironmentAvailable) {
    throw new Error("Failed to set up browser environment in worker");
}