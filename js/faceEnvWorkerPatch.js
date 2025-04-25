/**
 * Service Worker Environment Patch for face-api.js
 * 
 * This script creates browser-like objects in the Service Worker context
 * that are required by face-api.js but not normally available in workers.
 * 
 * Based on: https://github.com/justadudewhohacks/face-api.js/issues/47
 */

// Define global browser dimension properties to prevent 'height' undefined errors
self.innerWidth = 1280;
self.innerHeight = 800;
self.outerWidth = 1280;
self.outerHeight = 800;
self.screen = {
    width: 1280,
    height: 800,
    availWidth: 1280,
    availHeight: 800
};

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
    },
    features: {},
    getBool: function(name, defVal) { 
        return typeof defVal === 'boolean' ? defVal : false; 
    },
    getNumber: function(name, defVal) { 
        return typeof defVal === 'number' ? defVal : 0; 
    },
    getBytes: function(name, defVal) { 
        return defVal; 
    }
};

// Prevent WebGL packing to avoid height errors
self.tf.ENV.set('WEBGL_PACK', false);

// Configure memory handling
self.tf.ENV.set('WEBGL_FORCE_F16_TEXTURES', false);
self.tf.ENV.set('WEBGL_RENDER_FLOAT32_ENABLED', true);
self.tf.ENV.set('WEBGL_FLUSH_THRESHOLD', 1);
self.tf.ENV.set('CPU_HANDOFF_SIZE_THRESHOLD', 128);

// Override getBackend to always return 'cpu' if asked
self.tf.getBackend = function() { return 'cpu'; };
self.tf.setBackend = function(backend) { 
    console.log(`Attempted to set backend to ${backend}, using CPU instead`);
    return Promise.resolve('cpu'); 
};

// Mock DOM elements required by face-api.js
self.Canvas = self.HTMLCanvasElement = OffscreenCanvas;
self.HTMLCanvasElement.name = 'HTMLCanvasElement';
self.Canvas.name = 'Canvas';
self.CanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;

// Add a dummy prototype for image element
function HTMLImageElement() {}
HTMLImageElement.prototype.width = 0;
HTMLImageElement.prototype.height = 0;
HTMLImageElement.prototype.naturalWidth = 0;
HTMLImageElement.prototype.naturalHeight = 0;
HTMLImageElement.prototype.complete = true;

// Add a dummy prototype for video element
function HTMLVideoElement() {}
HTMLVideoElement.prototype.width = 0;
HTMLVideoElement.prototype.height = 0;
HTMLVideoElement.prototype.videoWidth = 0;
HTMLVideoElement.prototype.videoHeight = 0;

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
        this.readyState = 'complete';
        this.documentElement = {
            clientWidth: 1280,
            clientHeight: 800
        };
        this.body = {
            clientWidth: 1280,
            clientHeight: 800
        };
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
window.performance = {
    now: () => Date.now()
};

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

// Log successful setup
console.log("Service worker environment patch applied successfully");