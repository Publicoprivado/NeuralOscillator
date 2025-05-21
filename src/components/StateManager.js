/**
 * StateManager - Handles application state and component communication
 * 
 * This class replaces the global window properties with a proper state management system
 * that uses pub/sub pattern for component communication
 */
export class StateManager {
  constructor() {
    this.state = {};
    this.listeners = {};
    this.components = {};
  }
  
  /**
   * Set a state value and notify subscribers
   * @param {string} key - The state key
   * @param {any} value - The new value
   */
  setState(key, value) {
    this.state[key] = value;
    if (this.listeners[key]) {
      this.listeners[key].forEach(callback => callback(value));
    }
  }
  
  /**
   * Get a state value
   * @param {string} key - The state key 
   * @returns {any} The state value
   */
  getState(key) {
    return this.state[key];
  }
  
  /**
   * Subscribe to state changes
   * @param {string} key - The state key to watch
   * @param {Function} callback - Function to call when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.listeners[key]) this.listeners[key] = [];
    this.listeners[key].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
    };
  }
  
  /**
   * Register a component for lookup by other components
   * @param {string} name - Component name
   * @param {object} component - Component instance
   */
  registerComponent(name, component) {
    this.components[name] = component;
  }
  
  /**
   * Get a registered component
   * @param {string} name - Component name
   * @returns {object} Component instance
   */
  getComponent(name) {
    return this.components[name];
  }
  
  /**
   * Call a method on a registered component
   * @param {string} componentName - Component name
   * @param {string} methodName - Method name
   * @param {...any} args - Arguments to pass
   * @returns {any} Method return value
   */
  callComponentMethod(componentName, methodName, ...args) {
    const component = this.getComponent(componentName);
    if (!component) return null;
    
    if (typeof component[methodName] === 'function') {
      return component[methodName](...args);
    }
    
    return null;
  }
  
  /**
   * Dispatch an event to the system
   * @param {string} eventName - Event name
   * @param {object} data - Event data
   */
  dispatchEvent(eventName, data = {}) {
    const key = `event:${eventName}`;
    this.setState(key, data);
  }
  
  /**
   * Subscribe to an event
   * @param {string} eventName - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    return this.subscribe(`event:${eventName}`, callback);
  }
}

// Create a single instance to be imported by all components
export const stateManager = new StateManager(); 