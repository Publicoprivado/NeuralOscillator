/**
 * ReactiveManager - Handles reactive updates to replace polling mechanisms
 * 
 * This class provides event-driven alternatives to setInterval polling
 */
import { stateManager } from './StateManager.js';

export class ReactiveManager {
  constructor() {
    this.observers = {};
    this.activeTimers = {};
    this.mutationObservers = {};
    this.resizeObservers = {};
    this.canvasNeedsUpdate = false;
    this.animationFrameRequested = false;
    
    // Bind methods to preserve 'this' context
    this.requestRender = this.requestRender.bind(this);
    this.markCanvasForUpdate = this.markCanvasForUpdate.bind(this);
  }
  
  /**
   * Initialize reactive updates
   */
  initialize() {
    // Initialize canvas rendering loop
    this.startRenderLoop();
    
    // Setup responsive layout observers
    this.setupResponsiveObservers();
    
    // Setup DOM change detection 
    this.setupDomObservers();
  }
  
  /**
   * Set up responsive layout observers
   */
  setupResponsiveObservers() {
    // Mobile view updates via ResizeObserver instead of polling
    const bodyResizeObserver = new ResizeObserver(entries => {
      const isMobile = window.innerWidth < 1024;
      
      // Dispatch an event when layout changes
      if (stateManager.getState('isMobile') !== isMobile) {
        stateManager.setState('isMobile', isMobile);
        stateManager.dispatchEvent('layoutChanged', { isMobile });
      }
      
      // Update mobile UI if needed
      if (isMobile) {
        const uiManager = stateManager.getComponent('uiManager');
        if (uiManager && typeof uiManager.updateSynthPanelMobileView === 'function') {
          uiManager.updateSynthPanelMobileView();
        }
      }
    });
    
    // Observe the body for size changes
    bodyResizeObserver.observe(document.body);
    this.resizeObservers.body = bodyResizeObserver;
  }
  
  /**
   * Creates a ResizeObserver to watch an element and call a callback when it resizes
   * @param {Element} element - The DOM element to observe
   * @param {string} id - Unique identifier for this observer
   * @param {Function} callback - Function to call when resize occurs
   * @returns {ResizeObserver} The created observer instance
   */
  observeResize(element, id, callback) {
    // Check if element is valid
    if (!element || !(element instanceof Element)) {
      // Only logging errors, not warnings
      return null;
    }
    
    // Clean up any existing observer with the same ID
    if (this.resizeObservers[id]) {
      this.resizeObservers[id].disconnect();
    }
    
    // Create a new ResizeObserver
    try {
      const observer = new ResizeObserver(entries => {
        // Call the provided callback with the entries
        callback(entries);
      });
      
      // Start observing the element
      observer.observe(element);
      
      // Store for cleanup
      this.resizeObservers[id] = observer;
      
      return observer;
    } catch (error) {
      console.error('Error creating ResizeObserver:', error);
      return null;
    }
  }
  
  /**
   * Set up DOM mutation observers
   */
  setupDomObservers() {
    // Watch for neuron grid changes
    const gridContainer = document.getElementById('neuron-grid-container');
    if (gridContainer) {
      const gridObserver = new MutationObserver(mutations => {
        stateManager.dispatchEvent('neuronGridChanged');
      });
      
      gridObserver.observe(gridContainer, { 
        childList: true,
        subtree: true,
        attributes: true
      });
      
      this.mutationObservers.grid = gridObserver;
    }
    
    // Watch for preset selection changes
    const presetContainer = document.querySelector('.preset-container');
    if (presetContainer) {
      const presetObserver = new MutationObserver(mutations => {
        stateManager.dispatchEvent('presetChanged');
      });
      
      presetObserver.observe(presetContainer, {
        childList: true,
        subtree: true,
        attributes: true
      });
      
      this.mutationObservers.presets = presetObserver;
    }
  }
  
  /**
   * Start the render loop for canvas updates
   */
  startRenderLoop() {
    // Define the update canvas function with proper binding
    this.renderFunction = () => {
      this.animationFrameRequested = false;
      
      if (this.canvasNeedsUpdate) {
        // Find all canvases that need updates
        const waveformCanvas = document.getElementById('waveform-canvas');
        if (waveformCanvas) {
          const renderEnvelope = stateManager.getComponent('soundManager')?.renderEnvelope;
          if (typeof renderEnvelope === 'function') {
            renderEnvelope(waveformCanvas);
          }
        }
        
        // Reset the flag
        this.canvasNeedsUpdate = false;
      }
    };
    
    // Ensure the render function is properly bound to this instance
    this.boundRenderFunction = this.renderFunction.bind(this);
  }
  
  /**
   * Request a render in the next animation frame
   */
  requestRender() {
    if (!this.animationFrameRequested) {
      this.animationFrameRequested = true;
      // Use the bound function to ensure proper context
      requestAnimationFrame(this.boundRenderFunction);
    }
  }
  
  /**
   * Mark canvas as needing update
   */
  markCanvasForUpdate() {
    this.canvasNeedsUpdate = true;
    
    // Check for sound manager's renderEnvelope before requesting render
    const soundManager = stateManager.getComponent('soundManager');
    if (soundManager && typeof soundManager.renderEnvelope === 'function') {
      // Ensure we have a valid bound function before calling requestAnimationFrame
      if (typeof this.boundRenderFunction === 'function') {
        this.requestRender();
      } else {
        // Rebuild the function if it's missing
        this.startRenderLoop();
        this.requestRender();
      }
    } else {
      // Fallback if soundManager isn't available yet
      const waveformCanvas = document.getElementById('waveform-canvas');
      if (waveformCanvas && window.renderEnvelope) {
        window.renderEnvelope(waveformCanvas);
      }
    }
  }
  
  /**
   * Clean up all observers and timers
   */
  cleanup() {
    // Stop all observers
    Object.values(this.resizeObservers).forEach(observer => observer.disconnect());
    Object.values(this.mutationObservers).forEach(observer => observer.disconnect());
    
    // Clear all timers
    Object.values(this.activeTimers).forEach(timer => clearInterval(timer));
  }
}

// Create a single instance to be imported by all components
export const reactiveManager = new ReactiveManager(); 