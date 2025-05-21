/**
 * TimerManager - Centralized timer management to prevent memory leaks and inefficient timer usage
 * 
 * Provides:
 * - Centralized setTimeout and setInterval management
 * - Automatic cleanup of timers when components are destroyed
 * - Throttling and debouncing utilities
 * - RAF (requestAnimationFrame) management
 */

export class TimerManager {
  constructor() {
    // Store timers by group ID
    this.timeouts = new Map();
    this.intervals = new Map();
    this.animationFrames = new Map();
    this.debounceTimers = new Map();
    this.throttleData = new Map();
    
    // For tracking which component owns which timer
    this.groupOwnership = new Map();
  }
  
  /**
   * Create a setTimeout that is automatically tracked
   * @param {string} groupId - ID to group related timers (usually component name)
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {string} [timerId] - Optional ID for this specific timer
   * @returns {string} Timer ID for reference
   */
  setTimeout(groupId, callback, delay, timerId = null) {
    // Generate timer ID if not provided
    const id = timerId || `timeout_${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the timeout
    const timeoutId = setTimeout(() => {
      // Execute callback
      callback();
      // Remove from tracking when done
      this.clearTimeout(groupId, id);
    }, delay);
    
    // Store in the map
    if (!this.timeouts.has(groupId)) {
      this.timeouts.set(groupId, new Map());
    }
    this.timeouts.get(groupId).set(id, timeoutId);
    
    // Track ownership
    this._trackOwnership(groupId);
    
    return id;
  }
  
  /**
   * Clear a specific timeout
   * @param {string} groupId - Group ID
   * @param {string} timerId - Timer ID
   */
  clearTimeout(groupId, timerId) {
    if (this.timeouts.has(groupId) && this.timeouts.get(groupId).has(timerId)) {
      clearTimeout(this.timeouts.get(groupId).get(timerId));
      this.timeouts.get(groupId).delete(timerId);
      
      // Clean up the group if empty
      if (this.timeouts.get(groupId).size === 0) {
        this.timeouts.delete(groupId);
      }
    }
  }
  
  /**
   * Create a setInterval that is automatically tracked
   * @param {string} groupId - ID to group related timers
   * @param {Function} callback - Function to execute
   * @param {number} delay - Interval in milliseconds
   * @param {string} [timerId] - Optional ID for this specific timer
   * @returns {string} Timer ID for reference
   */
  setInterval(groupId, callback, delay, timerId = null) {
    // Generate timer ID if not provided
    const id = timerId || `interval_${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create the interval
    const intervalId = setInterval(callback, delay);
    
    // Store in the map
    if (!this.intervals.has(groupId)) {
      this.intervals.set(groupId, new Map());
    }
    this.intervals.get(groupId).set(id, intervalId);
    
    // Track ownership
    this._trackOwnership(groupId);
    
    return id;
  }
  
  /**
   * Clear a specific interval
   * @param {string} groupId - Group ID
   * @param {string} timerId - Timer ID
   */
  clearInterval(groupId, timerId) {
    if (this.intervals.has(groupId) && this.intervals.get(groupId).has(timerId)) {
      clearInterval(this.intervals.get(groupId).get(timerId));
      this.intervals.get(groupId).delete(timerId);
      
      // Clean up the group if empty
      if (this.intervals.get(groupId).size === 0) {
        this.intervals.delete(groupId);
      }
    }
  }
  
  /**
   * Create a requestAnimationFrame that is automatically tracked
   * @param {string} groupId - ID to group related timers
   * @param {Function} callback - Animation frame callback
   * @param {string} [timerId] - Optional ID for this specific timer
   * @returns {string} Timer ID for reference
   */
  requestAnimationFrame(groupId, callback, timerId = null) {
    // Generate timer ID if not provided
    const id = timerId || `raf_${groupId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Set up recursive RAF call that maintains tracking
    const rafCallback = (timestamp) => {
      // If the timer is still being tracked
      if (this.animationFrames.has(groupId) && this.animationFrames.get(groupId).has(id)) {
        // Execute the callback
        const result = callback(timestamp);
        
        // Continue the animation loop unless callback returned false
        if (result !== false) {
          const rafId = requestAnimationFrame(rafCallback);
          this.animationFrames.get(groupId).set(id, rafId);
        } else {
          // Animation loop was explicitly stopped by callback
          this.animationFrames.get(groupId).delete(id);
          
          // Clean up the group if empty
          if (this.animationFrames.get(groupId).size === 0) {
            this.animationFrames.delete(groupId);
          }
        }
      }
    };
    
    // Start the animation loop
    const rafId = requestAnimationFrame(rafCallback);
    
    // Store in the map
    if (!this.animationFrames.has(groupId)) {
      this.animationFrames.set(groupId, new Map());
    }
    this.animationFrames.get(groupId).set(id, rafId);
    
    // Track ownership
    this._trackOwnership(groupId);
    
    return id;
  }
  
  /**
   * Cancel a requestAnimationFrame
   * @param {string} groupId - Group ID
   * @param {string} timerId - Timer ID
   */
  cancelAnimationFrame(groupId, timerId) {
    if (this.animationFrames.has(groupId) && this.animationFrames.get(groupId).has(timerId)) {
      cancelAnimationFrame(this.animationFrames.get(groupId).get(timerId));
      this.animationFrames.get(groupId).delete(timerId);
      
      // Clean up the group if empty
      if (this.animationFrames.get(groupId).size === 0) {
        this.animationFrames.delete(groupId);
      }
    }
  }
  
  /**
   * Debounce a function call
   * @param {string} groupId - Group ID
   * @param {string} functionId - Function identifier
   * @param {Function} callback - Function to debounce
   * @param {number} delay - Debounce delay in milliseconds
   */
  debounce(groupId, functionId, callback, delay) {
    // Clear existing timer if any
    this._clearDebounceTimer(groupId, functionId);
    
    // Create new debounce timer
    const timerId = this.setTimeout(groupId, callback, delay, `debounce_${functionId}`);
    
    // Store for tracking
    if (!this.debounceTimers.has(groupId)) {
      this.debounceTimers.set(groupId, new Map());
    }
    this.debounceTimers.get(groupId).set(functionId, timerId);
    
    // Track ownership
    this._trackOwnership(groupId);
  }
  
  /**
   * Throttle a function call
   * @param {string} groupId - Group ID
   * @param {string} functionId - Function identifier
   * @param {Function} callback - Function to throttle
   * @param {number} limit - Throttle limit in milliseconds
   * @returns {boolean} Whether the function was executed
   */
  throttle(groupId, functionId, callback, limit) {
    // Track ownership
    this._trackOwnership(groupId);
    
    // Initialize throttle data for this group if needed
    if (!this.throttleData.has(groupId)) {
      this.throttleData.set(groupId, new Map());
    }
    
    const now = Date.now();
    
    // Get last execution time
    const throttleInfo = this.throttleData.get(groupId).get(functionId);
    const lastExecution = throttleInfo ? throttleInfo.lastExecution : 0;
    
    // Check if we can execute
    if (!lastExecution || now - lastExecution >= limit) {
      // Execute callback
      callback();
      
      // Update last execution time
      this.throttleData.get(groupId).set(functionId, { 
        lastExecution: now
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Clear all timers for a specific group
   * @param {string} groupId - Group ID to clear
   */
  clearGroup(groupId) {
    // Clear all timeouts for this group
    if (this.timeouts.has(groupId)) {
      const timeouts = this.timeouts.get(groupId);
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      this.timeouts.delete(groupId);
    }
    
    // Clear all intervals for this group
    if (this.intervals.has(groupId)) {
      const intervals = this.intervals.get(groupId);
      intervals.forEach(intervalId => clearInterval(intervalId));
      this.intervals.delete(groupId);
    }
    
    // Clear all animation frames for this group
    if (this.animationFrames.has(groupId)) {
      const frames = this.animationFrames.get(groupId);
      frames.forEach(frameId => cancelAnimationFrame(frameId));
      this.animationFrames.delete(groupId);
    }
    
    // Clear debounce timers
    if (this.debounceTimers.has(groupId)) {
      this.debounceTimers.delete(groupId);
    }
    
    // Clear throttle data
    if (this.throttleData.has(groupId)) {
      this.throttleData.delete(groupId);
    }
    
    // Remove from ownership tracking
    this.groupOwnership.delete(groupId);
  }
  
  /**
   * Helper to clear a debounce timer
   * @private
   */
  _clearDebounceTimer(groupId, functionId) {
    if (this.debounceTimers.has(groupId) && 
        this.debounceTimers.get(groupId).has(functionId)) {
      const timerId = this.debounceTimers.get(groupId).get(functionId);
      this.clearTimeout(groupId, timerId);
      this.debounceTimers.get(groupId).delete(functionId);
      
      // Clean up if empty
      if (this.debounceTimers.get(groupId).size === 0) {
        this.debounceTimers.delete(groupId);
      }
    }
  }
  
  /**
   * Track which components own which timer groups
   * @private
   */
  _trackOwnership(groupId) {
    // Just ensure the group is in the ownership map
    if (!this.groupOwnership.has(groupId)) {
      this.groupOwnership.set(groupId, true);
    }
  }
  
  /**
   * Register a component with the timer manager
   * @param {string} componentId - Unique component ID
   * @param {Object} component - Component instance
   */
  registerComponent(componentId, component) {
    // This could be expanded to add additional functionality
    this._trackOwnership(componentId);
  }
  
  /**
   * Clean up all timers
   */
  cleanup() {
    // Clear all groups
    this.groupOwnership.forEach((_, groupId) => {
      this.clearGroup(groupId);
    });
    
    // Reset all maps
    this.timeouts.clear();
    this.intervals.clear();
    this.animationFrames.clear();
    this.debounceTimers.clear();
    this.throttleData.clear();
    this.groupOwnership.clear();
  }
}

// Create singleton instance
export const timerManager = new TimerManager(); 