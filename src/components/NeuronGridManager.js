/**
 * NeuronGridManager - Efficiently manages the neuron grid display
 * 
 * Uses:
 * - Element pooling instead of recreating elements
 * - CSS classes instead of inline styles
 * - Efficient updates by only changing what's necessary
 * - One-time event listener binding
 */
import { stateManager } from './StateManager.js';
import './neuron-grid.css';

export class NeuronGridManager {
  constructor() {
    this.container = null;
    this.wrapper = null;
    this.elementPool = []; // Pool of reusable DOM elements
    this.activeElements = new Map(); // Map of neuron ID to active element
    this.initialized = false;
    
    // Store bound event handlers to avoid recreating them
    this.handleElementClick = this.handleElementClick.bind(this);
    
    // Register with state manager
    if (stateManager) {
      stateManager.registerComponent('neuronGridManager', this);
    }
    
    // Make available globally for backward compatibility
    window.updateNeuronGrid = this.update.bind(this);
  }
  
  /**
   * Initialize the grid display container
   * @param {HTMLElement} parentElement - The parent element to attach the grid to
   */
  initialize(parentElement) {
    if (this.initialized) return;
    
    // Find or create the container
    this.container = document.getElementById('neuron-grid-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'neuron-grid-container';
      this.container.className = 'neuron-grid-container';
      parentElement.appendChild(this.container);
    } else {
      // If container exists, make sure it has our class
      this.container.className = 'neuron-grid-container';
    }
    
    // Create grid wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'neuron-grid-wrapper';
    this.container.appendChild(this.wrapper);
    
    // Ensure we have the neuronPulse animation defined only once
    this.ensureAnimationStyleExists();
    
    this.initialized = true;
  }
  
  /**
   * Update the grid display
   * @param {Array} neurons - The array of neurons to display
   */
  update(neurons = window.circles) {
    if (!this.initialized || !this.container) {
      // Try to initialize with the pane element if available
      if (window.pane && window.pane.element) {
        this.initialize(window.pane.element);
      } else {
        // Skip warning, only log errors
        return;
      }
    }
    
    // Create a set of current neuron IDs for tracking
    const currentNeuronIds = new Set();
    
    // Update existing neurons and create new elements as needed
    neurons.forEach(circle => {
      if (!circle || !circle.neuron) return;
      
      const neuronId = circle.neuron.id;
      currentNeuronIds.add(neuronId);
      
      let element = this.activeElements.get(neuronId);
      const isNewElement = !element;
      
      // Create or reuse an element
      if (isNewElement) {
        // Get element from pool or create new
        element = this.elementPool.length > 0 
          ? this.elementPool.pop() 
          : document.createElement('div');
        
        element.className = 'neuron-element';
        element.dataset.neuronId = neuronId;
        
        // Only add event listeners to new elements
        element.addEventListener('click', this.handleElementClick);
        
        // Store in active elements map
        this.activeElements.set(neuronId, element);
        
        // Add to the DOM
        this.wrapper.appendChild(element);
      }
      
      // Update element appearance based on neuron state
      this.updateElementAppearance(element, circle.neuron);
    });
    
    // Remove elements for neurons that no longer exist
    Array.from(this.activeElements.keys()).forEach(neuronId => {
      if (!currentNeuronIds.has(neuronId)) {
        const element = this.activeElements.get(neuronId);
        
        // Remove from DOM
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        
        // Clear any custom properties
        element.className = 'neuron-element';
        element.style = '';
        element.title = '';
        
        // Return to pool
        this.elementPool.push(element);
        
        // Remove from active elements
        this.activeElements.delete(neuronId);
      }
    });
  }
  
  /**
   * Update the appearance of a neuron element
   * @param {HTMLElement} element - The element to update
   * @param {Object} neuron - The neuron data
   */
  updateElementAppearance(element, neuron) {
    // Reset classes
    element.className = 'neuron-element';
    
    // Calculate and set appearance based on neuron state
    if (neuron.isFiring) {
      // Firing state
      element.classList.add('firing');
      
      // Update tooltip
      if (neuron.presetName) {
        element.title = `${neuron.presetName} (Neuron ${neuron.id}) - Firing!`;
      } else {
        element.title = `Neuron ${neuron.id} - Firing!`;
      }
    } else if (neuron.presetColor) {
      // Has preset color
      element.classList.add('has-preset');
      
      // Set color via CSS variables
      const r = Math.floor(neuron.presetColor.r * 255);
      const g = Math.floor(neuron.presetColor.g * 255);
      const b = Math.floor(neuron.presetColor.b * 255);
      
      element.style.setProperty('--neuron-color-r', r);
      element.style.setProperty('--neuron-color-g', g);
      element.style.setProperty('--neuron-color-b', b);
      element.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      
      // Update tooltip
      element.title = `${neuron.presetName || ''} (Neuron ${neuron.id})`;
      
      // Add charging info to tooltip
      if (neuron.currentCharge > 0) {
        element.title += ` - Charging: ${Math.round(neuron.currentCharge * 100)}%`;
      }
      
      // Add DC input info to tooltip
      if (neuron.dcInput > 0) {
        element.title += ` - DC: ${neuron.dcInput.toFixed(2)}`;
        element.classList.add('has-dc');
      }
    } else {
      // Default neuron
      element.classList.add('default');
      
      // Set color based on charge
      const chargeValue = neuron.currentCharge || 0;
      const green = Math.floor(Math.min(0.2, chargeValue) * 255);
      element.style.backgroundColor = `rgb(0, ${green}, 255)`;
      
      // Update tooltip
      element.title = `Neuron ${neuron.id}`;
      
      // Add charging info to tooltip
      if (neuron.currentCharge > 0) {
        element.title += ` - Charging: ${Math.round(neuron.currentCharge * 100)}%`;
      }
      
      // Add DC input info to tooltip
      if (neuron.dcInput > 0) {
        element.title += ` - DC: ${neuron.dcInput.toFixed(2)}`;
        element.classList.add('has-dc');
      }
    }
  }
  
  /**
   * Handle click on a neuron element
   * @param {Event} event - Click event
   */
  handleElementClick(event) {
    const neuronId = event.currentTarget.dataset.neuronId;
    if (!neuronId) return;
    
    // Find the neuron in the circles array
    const neuron = window.circles.find(circle => 
      circle && circle.neuron && circle.neuron.id.toString() === neuronId
    );
    
    // Select the neuron if found and inputManager exists
    if (neuron && window.inputManager) {
      window.inputManager.selectNeuron(neuron);
    }
  }
  
  /**
   * Ensure animation style exists in the document
   * Create it only once
   */
  ensureAnimationStyleExists() {
    if (!document.getElementById('neuronPulseStyle')) {
      // Already defined in the CSS file, no need to create dynamically
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // Remove all elements and clear pools
    this.activeElements.forEach(element => {
      element.removeEventListener('click', this.handleElementClick);
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    this.elementPool.forEach(element => {
      element.removeEventListener('click', this.handleElementClick);
    });
    
    this.elementPool = [];
    this.activeElements.clear();
    
    if (this.wrapper && this.wrapper.parentNode) {
      this.wrapper.parentNode.removeChild(this.wrapper);
    }
    
    this.wrapper = null;
    this.initialized = false;
  }
}

// Create a singleton instance to be imported by other components
export const neuronGridManager = new NeuronGridManager(); 