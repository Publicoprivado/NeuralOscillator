/**
 * EventManager - Centralized event handling system
 * 
 * Provides:
 * - Automatic tracking of event listeners
 * - Proper cleanup to prevent memory leaks
 * - Throttling and debouncing for event handlers
 * - Event delegation for efficient DOM event handling
 */
import { timerManager } from './TimerManager.js';

export class EventManager {
  constructor() {
    this.listeners = new Map();
    this.delegatedListeners = new Map();
    this.componentListeners = new Map();
    
    // Bind methods that are used as callbacks
    this._handleDelegatedEvent = this._handleDelegatedEvent.bind(this);
  }
  
  /**
   * Add an event listener with automatic tracking
   * @param {EventTarget} target - DOM element or other event target
   * @param {string} eventType - Event type (e.g., 'click')
   * @param {Function} handler - Event handler function
   * @param {Object} options - addEventListener options
   * @param {string} componentId - ID of the component that owns this listener
   * @returns {Object} Reference object for removing the listener
   */
  addEventListener(target, eventType, handler, options = {}, componentId = 'global') {
    if (!target || !target.addEventListener) {
      // Skip warning, only log errors
      return null;
    }
    
    // Create the bound handler that will be used
    const boundHandler = handler.bind(target);
    
    // Add the event listener
    target.addEventListener(eventType, boundHandler, options);
    
    // Store for tracking
    const listenerRef = { target, eventType, originalHandler: handler, boundHandler, options };
    
    // Initialize maps if needed
    if (!this.listeners.has(componentId)) {
      this.listeners.set(componentId, []);
    }
    
    // Store the listener reference
    this.listeners.get(componentId).push(listenerRef);
    
    // Also track by component for easy cleanup
    if (!this.componentListeners.has(componentId)) {
      this.componentListeners.set(componentId, new Set());
    }
    this.componentListeners.get(componentId).add(listenerRef);
    
    // Return reference for manual removal if needed
    return listenerRef;
  }
  
  /**
   * Remove a specific event listener
   * @param {Object} listenerRef - Reference returned by addEventListener
   * @param {string} componentId - Component ID
   */
  removeEventListener(listenerRef, componentId = 'global') {
    if (!listenerRef || !listenerRef.target) return;
    
    // Remove the actual event listener
    listenerRef.target.removeEventListener(
      listenerRef.eventType,
      listenerRef.boundHandler,
      listenerRef.options
    );
    
    // Remove from component listeners
    if (componentId && this.componentListeners.has(componentId)) {
      this.componentListeners.get(componentId).delete(listenerRef);
      
      // Clean up if empty
      if (this.componentListeners.get(componentId).size === 0) {
        this.componentListeners.delete(componentId);
      }
    }
    
    // Remove from main listeners tracking
    if (this.listeners.has(componentId)) {
      const index = this.listeners.get(componentId).indexOf(listenerRef);
      if (index !== -1) {
        this.listeners.get(componentId).splice(index, 1);
      }
      
      // Clean up if empty
      if (this.listeners.get(componentId).length === 0) {
        this.listeners.delete(componentId);
      }
    }
  }
  
  /**
   * Add a throttled event listener
   * @param {EventTarget} target - DOM element
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {number} limit - Throttle limit in ms
   * @param {Object} options - addEventListener options
   * @param {string} componentId - Component ID
   * @returns {Object} Listener reference
   */
  addThrottledEventListener(target, eventType, handler, limit, options = {}, componentId = 'global') {
    // Create unique ID for this handler
    const handlerId = `${componentId}_${eventType}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create throttled handler
    const throttledHandler = (event) => {
      timerManager.throttle(componentId, handlerId, () => {
        handler.call(target, event);
      }, limit);
    };
    
    // Add event listener with throttled handler
    return this.addEventListener(target, eventType, throttledHandler, options, componentId);
  }
  
  /**
   * Add a debounced event listener
   * @param {EventTarget} target - DOM element
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {number} delay - Debounce delay in ms
   * @param {Object} options - addEventListener options
   * @param {string} componentId - Component ID
   * @returns {Object} Listener reference
   */
  addDebouncedEventListener(target, eventType, handler, delay, options = {}, componentId = 'global') {
    // Create unique ID for this handler
    const handlerId = `${componentId}_${eventType}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create debounced handler
    const debouncedHandler = (event) => {
      // Store event data for use in the debounced callback
      const eventData = {
        type: event.type,
        target: event.target,
        currentTarget: event.currentTarget,
        clientX: event.clientX,
        clientY: event.clientY,
        // Any other properties you typically need
      };
      
      timerManager.debounce(componentId, handlerId, () => {
        // Call the handler with the stored event data
        handler.call(target, { ...event, eventData });
      }, delay);
    };
    
    // Add event listener with debounced handler
    return this.addEventListener(target, eventType, debouncedHandler, options, componentId);
  }
  
  /**
   * Set up event delegation for efficiently handling events on multiple elements
   * @param {EventTarget} container - Container element
   * @param {string} eventType - Event type
   * @param {string} selector - CSS selector for target elements
   * @param {Function} handler - Event handler
   * @param {string} componentId - Component ID
   * @returns {Object} Delegation reference
   */
  delegate(container, eventType, selector, handler, componentId = 'global') {
    // Initialize delegation maps if needed
    if (!this.delegatedListeners.has(eventType)) {
      this.delegatedListeners.set(eventType, new Map());
      
      // Set up the global handler for this event type
      document.addEventListener(eventType, (event) => {
        this._handleDelegatedEvent(eventType, event);
      });
    }
    
    // Generate a unique ID for this delegation
    const delegationId = `${componentId}_${selector}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store the delegation
    this.delegatedListeners.get(eventType).set(delegationId, {
      container, 
      selector, 
      handler, 
      componentId
    });
    
    // Return reference for removal
    return { eventType, delegationId };
  }
  
  /**
   * Internal handler for delegated events
   * @private
   */
  _handleDelegatedEvent(eventType, event) {
    if (!this.delegatedListeners.has(eventType)) return;
    
    this.delegatedListeners.get(eventType).forEach((delegation, delegationId) => {
      const { container, selector, handler } = delegation;
      
      // Check if the event target matches the selector and is within the container
      if (event.target.matches(selector) && container.contains(event.target)) {
        handler.call(container, event);
      }
    });
  }
  
  /**
   * Remove a delegated event handler
   * @param {Object} delegationRef - Reference returned by delegate
   */
  undelegate(delegationRef) {
    if (!delegationRef || !delegationRef.eventType || !delegationRef.delegationId) return;
    
    if (this.delegatedListeners.has(delegationRef.eventType)) {
      this.delegatedListeners.get(delegationRef.eventType).delete(delegationRef.delegationId);
      
      // Clean up if no more delegations for this event type
      if (this.delegatedListeners.get(delegationRef.eventType).size === 0) {
        document.removeEventListener(delegationRef.eventType, (event) => {
          this._handleDelegatedEvent(delegationRef.eventType, event);
        });
        this.delegatedListeners.delete(delegationRef.eventType);
      }
    }
  }
  
  /**
   * Register a component with the event manager
   * @param {string} componentId - Component ID
   * @param {Object} component - Component instance
   */
  registerComponent(componentId, component) {
    // This is mainly for tracking purposes
    if (!this.componentListeners.has(componentId)) {
      this.componentListeners.set(componentId, new Set());
    }
  }
  
  /**
   * Clean up all event listeners for a component
   * @param {string} componentId - Component ID
   */
  cleanupComponent(componentId) {
    // Remove all event listeners for this component
    if (this.componentListeners.has(componentId)) {
      const listeners = this.componentListeners.get(componentId);
      listeners.forEach(listenerRef => {
        if (listenerRef.target) {
          listenerRef.target.removeEventListener(
            listenerRef.eventType, 
            listenerRef.boundHandler,
            listenerRef.options
          );
        }
      });
      
      this.componentListeners.delete(componentId);
    }
    
    // Remove from main listeners tracking
    if (this.listeners.has(componentId)) {
      this.listeners.delete(componentId);
    }
    
    // Clean up delegations
    this.delegatedListeners.forEach((delegations, eventType) => {
      // Create array of delegationIds to remove
      const toRemove = [];
      delegations.forEach((delegation, delegationId) => {
        if (delegation.componentId === componentId) {
          toRemove.push({ eventType, delegationId });
        }
      });
      
      // Remove the identified delegations
      toRemove.forEach(ref => this.undelegate(ref));
    });
  }
  
  /**
   * Clean up all event listeners
   */
  cleanup() {
    // Clean up all normal event listeners
    this.listeners.forEach((listeners, componentId) => {
      listeners.forEach(listenerRef => {
        if (listenerRef.target) {
          listenerRef.target.removeEventListener(
            listenerRef.eventType, 
            listenerRef.boundHandler,
            listenerRef.options
          );
        }
      });
    });
    
    // Clean up all delegated listeners
    this.delegatedListeners.forEach((delegations, eventType) => {
      // Remove the global handler for this event type
      document.removeEventListener(eventType, (event) => {
        this._handleDelegatedEvent(eventType, event);
      });
    });
    
    // Clear all tracking
    this.listeners.clear();
    this.delegatedListeners.clear();
    this.componentListeners.clear();
  }
}

// Create singleton instance
export const eventManager = new EventManager(); 