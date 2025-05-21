/**
 * EventSystem - Handles event delegation and interception
 * 
 * This class provides a clean way to intercept and delegate events
 * without monkey-patching native functions
 */
import { stateManager } from './StateManager.js';

export class EventSystem {
  constructor() {
    this.handlers = {};
    this.originalHandlers = {};
    this.delegations = {};
  }
  
  /**
   * Initialize the event system
   */
  initialize() {
    // Set up global event handling
    document.addEventListener('click', this.handleGlobalEvent.bind(this, 'click'));
    document.addEventListener('dblclick', this.handleGlobalEvent.bind(this, 'dblclick'));
    document.addEventListener('touchend', this.handleGlobalEvent.bind(this, 'touchend'));
    document.addEventListener('touchstart', this.handleGlobalEvent.bind(this, 'touchstart'));
  }
  
  /**
   * Global event handler that delegates to registered handlers
   * @param {string} eventType - Type of event
   * @param {Event} event - DOM event object
   */
  handleGlobalEvent(eventType, event) {
    // Skip if no delegations for this event type
    if (!this.delegations[eventType]) return;
    
    // Check if the event target matches any delegated selectors
    for (const { selector, handler } of this.delegations[eventType]) {
      // Check if the event target matches the selector
      if (event.target.matches && event.target.matches(selector)) {
        // Call the handler with the event
        handler(event);
      }
    }
  }
  
  /**
   * Register a delegate for a specific event type and selector
   * @param {string} eventType - Type of event (click, touchend, etc)
   * @param {string} selector - CSS selector to match targets
   * @param {Function} handler - Event handler function
   */
  delegate(eventType, selector, handler) {
    // Initialize array for this event type if needed
    if (!this.delegations[eventType]) {
      this.delegations[eventType] = [];
    }
    
    // Add the delegation
    this.delegations[eventType].push({ selector, handler });
  }
  
  /**
   * Register an interceptor for a component's method
   * @param {object} component - The component instance
   * @param {string} methodName - Method name to intercept
   * @param {Function} beforeFn - Function to call before method (can prevent original)
   * @param {Function} afterFn - Function to call after method
   */
  intercept(component, methodName, beforeFn, afterFn) {
    // Skip if method doesn't exist
    if (typeof component[methodName] !== 'function') {
      // Skip non-critical warnings
      return;
    }
    
    // Skip if already intercepted
    if (this.handlers[component] && this.handlers[component][methodName]) {
      // Skip non-critical warnings
      return;
    }
    
    // Initialize handlers for this component if needed
    if (!this.handlers[component]) {
      this.handlers[component] = {};
      this.originalHandlers[component] = {};
    }
    
    // Store the original method
    const originalMethod = component[methodName];
    this.originalHandlers[component][methodName] = originalMethod;
    
    // Create the intercepted method
    component[methodName] = (...args) => {
      // Call the before function, which can prevent the original method
      let shouldCallOriginal = true;
      let modifiedArgs = args;
      
      if (beforeFn) {
        const beforeResult = beforeFn(...args);
        if (beforeResult === false) {
          shouldCallOriginal = false;
        } else if (Array.isArray(beforeResult)) {
          modifiedArgs = beforeResult;
        }
      }
      
      // Call the original method if allowed
      let result;
      if (shouldCallOriginal) {
        result = originalMethod.apply(component, modifiedArgs);
      }
      
      // Call the after function with the result
      if (afterFn) {
        const afterResult = afterFn(result, ...modifiedArgs);
        if (afterResult !== undefined) {
          result = afterResult;
        }
      }
      
      return result;
    };
    
    // Store the handler
    this.handlers[component][methodName] = component[methodName];
  }
  
  /**
   * Restore original method implementation
   * @param {object} component - The component instance
   * @param {string} methodName - Method name to restore
   * @returns {boolean} True if restoration was successful
   */
  restoreOriginal(component, methodName) {
    // Check if method was intercepted
    if (!this.originalHandlers[component] || !this.originalHandlers[component][methodName]) {
      return false;
    }
    
    // Restore the original method
    component[methodName] = this.originalHandlers[component][methodName];
    
    // Remove stored handlers
    delete this.originalHandlers[component][methodName];
    delete this.handlers[component][methodName];
    
    return true;
  }
  
  /**
   * Clean up all interceptors
   */
  cleanup() {
    // Restore all original methods
    Object.keys(this.originalHandlers).forEach(component => {
      Object.keys(this.originalHandlers[component]).forEach(methodName => {
        component[methodName] = this.originalHandlers[component][methodName];
      });
    });
    
    // Clear all handlers
    this.handlers = {};
    this.originalHandlers = {};
    
    // Remove global event listeners
    document.removeEventListener('click', this.handleGlobalEvent.bind(this, 'click'));
    document.removeEventListener('dblclick', this.handleGlobalEvent.bind(this, 'dblclick'));
    document.removeEventListener('touchend', this.handleGlobalEvent.bind(this, 'touchend'));
    document.removeEventListener('touchstart', this.handleGlobalEvent.bind(this, 'touchstart'));
  }
}

// Create a single instance to be imported by all components
export const eventSystem = new EventSystem(); 