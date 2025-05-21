import * as THREE from 'three';

/**
 * TimerManager - Efficient and robust timer management for neuron simulations
 * Prevents timer loss during heavy operations and animation frame conflicts
 */
export class TimerManager {
  constructor() {
    // Callback registries
    this.rafCallbacks = new Map();
    this.intervalCallbacks = new Map();
    this.timeoutCallbacks = new Map();
    
    // Tracking
    this.isRunning = false;
    this.frameId = null;
    this.lastFrameTime = 0;
    this.frameDelta = 0;
    this.frameCount = 0;
    
    // Performance monitoring
    this.frameRates = [];
    this.averageFrameRate = 60;
    this.frameRateHistory = 60;
    this.lastPerformanceReport = 0;
    this.performanceReportInterval = 5000; // Report every 5 seconds in console
    
    // Start the manager
    this.start();
  }
  
  /**
   * Start the animation loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.frameId = requestAnimationFrame(this.update.bind(this));
  }
  
  /**
   * Stop the animation loop
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    // First stop the animation loop
    this.stop();
    
    // Clear all timers
    for (const [id, _] of this.timeoutCallbacks.entries()) {
      clearTimeout(id);
    }
    this.timeoutCallbacks.clear();
    
    for (const [id, _] of this.intervalCallbacks.entries()) {
      clearInterval(id);
    }
    this.intervalCallbacks.clear();
    
    // Clear all RAF callbacks
    this.rafCallbacks.clear();
  }
  
  /**
   * Main update loop - processes all callbacks
   */
  update(timestamp) {
    if (!this.isRunning) return;
    
    // Calculate delta time
    this.frameDelta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.frameCount++;
    
    // Track performance
    this.frameRates.push(1000 / this.frameDelta);
    if (this.frameRates.length > this.frameRateHistory) {
      this.frameRates.shift();
    }
    
    // Calculate average frame rate
    if (this.frameRates.length > 0) {
      this.averageFrameRate = this.frameRates.reduce((sum, rate) => sum + rate, 0) / this.frameRates.length;
    }
    
    // Process all requestAnimationFrame callbacks
    for (const [id, callback] of this.rafCallbacks.entries()) {
      try {
        // If callback returns false, remove it
        if (callback(timestamp) === false) {
          this.rafCallbacks.delete(id);
        }
      } catch (error) {
        console.error(`[TimerManager] Error in RAF callback ${id}:`, error);
        // Remove problematic callback
        this.rafCallbacks.delete(id);
      }
    }
    
    // Continue the loop
    this.frameId = requestAnimationFrame(this.update.bind(this));
  }
  
  /**
   * Register a requestAnimationFrame callback
   * @param {string} id - Unique identifier for the callback
   * @param {Function} callback - Function to call each frame
   * @returns {string} The ID of the registered callback
   */
  requestAnimationFrame(id, callback) {
    // Generate a unique ID if not provided
    const callbackId = id || `raf_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store the callback
    this.rafCallbacks.set(callbackId, callback);
    
    return callbackId;
  }
  
  /**
   * Cancel a requestAnimationFrame callback
   * @param {string} id - Identifier for the callback to cancel
   * @param {string} callbackId - The specific callback ID to cancel
   */
  cancelAnimationFrame(id, callbackId) {
    // If specific callbackId provided, use that
    const targetId = callbackId || id;
    
    // Remove the callback
    if (this.rafCallbacks.has(targetId)) {
      this.rafCallbacks.delete(targetId);
      return true;
    }
    
    return false;
  }
  
  /**
   * Set a timeout that's tracked by the manager
   * @param {string} group - Optional group identifier
   * @param {Function} callback - Function to call
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timeout ID
   */
  setTimeout(group, callback, delay) {
    const timeoutId = setTimeout(() => {
      // Execute callback
      try {
        callback();
      } catch (error) {
        console.error(`[TimerManager] Error in timeout callback (${group}):`, error);
      }
      
      // Remove from tracking
      this.timeoutCallbacks.delete(timeoutId);
    }, delay);
    
    // Store for tracking/cleanup
    this.timeoutCallbacks.set(timeoutId, { group });
    
    return timeoutId;
  }
  
  /**
   * Clear a timeout
   * @param {number} timeoutId - The timeout ID to clear
   */
  clearTimeout(group, timeoutId) {
    if (this.timeoutCallbacks.has(timeoutId)) {
      clearTimeout(timeoutId);
      this.timeoutCallbacks.delete(timeoutId);
      return true;
    }
    return false;
  }
  
  /**
   * Set an interval that's tracked by the manager
   * @param {string} group - Optional group identifier
   * @param {Function} callback - Function to call
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Interval ID
   */
  setInterval(group, callback, delay) {
    const intervalId = setInterval(() => {
      // Execute callback
      try {
        callback();
      } catch (error) {
        console.error(`[TimerManager] Error in interval callback (${group}):`, error);
      }
    }, delay);
    
    // Store for tracking/cleanup
    this.intervalCallbacks.set(intervalId, { group });
    
    return intervalId;
  }
  
  /**
   * Clear an interval
   * @param {number} intervalId - The interval ID to clear
   */
  clearInterval(group, intervalId) {
    if (this.intervalCallbacks.has(intervalId)) {
      clearInterval(intervalId);
      this.intervalCallbacks.delete(intervalId);
      return true;
    }
    return false;
  }
  
  /**
   * Clear all timers in a group
   * @param {string} group - Group identifier
   */
  clearGroup(group) {
    // Clear timeouts in this group
    for (const [id, info] of this.timeoutCallbacks.entries()) {
      if (info.group === group) {
        clearTimeout(id);
        this.timeoutCallbacks.delete(id);
      }
    }
    
    // Clear intervals in this group
    for (const [id, info] of this.intervalCallbacks.entries()) {
      if (info.group === group) {
        clearInterval(id);
        this.intervalCallbacks.delete(id);
      }
    }
    
    // Clear RAF callbacks in this group
    for (const [id, _] of this.rafCallbacks.entries()) {
      if (id.startsWith(`${group}_`)) {
        this.rafCallbacks.delete(id);
      }
    }
  }
  
  /**
   * Throttle a function to only execute once per limit period
   * @param {string} group - Group identifier
   * @param {string} id - Throttle ID
   * @param {Function} fn - Function to throttle
   * @param {number} limit - Throttle limit in ms
   */
  throttle(group, id, fn, limit) {
    const throttleKey = `${group}_throttle_${id}`;
    
    // Check if we're still in throttle period
    if (this.timeoutCallbacks.has(throttleKey)) {
      return;
    }
    
    // Execute function
    fn();
    
    // Set up throttle period
    this.setTimeout(group, () => {}, limit, throttleKey);
  }
  
  /**
   * Debounce a function to only execute after quiet period
   * @param {string} group - Group identifier
   * @param {string} id - Debounce ID
   * @param {Function} fn - Function to debounce
   * @param {number} wait - Debounce wait in ms
   */
  debounce(group, id, fn, wait) {
    const debounceKey = `${group}_debounce_${id}`;
    
    // Clear any existing timeout
    if (this.timeoutCallbacks.has(debounceKey)) {
      this.clearTimeout(group, debounceKey);
    }
    
    // Set up new timeout
    this.setTimeout(group, fn, wait, debounceKey);
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      frameRate: this.averageFrameRate,
      activeTasks: {
        raf: this.rafCallbacks.size,
        interval: this.intervalCallbacks.size,
        timeout: this.timeoutCallbacks.size
      }
    };
  }
}

// Initialize and make available as a singleton
export const initTimerManager = () => {
  if (window.timerManager) {
    try {
      window.timerManager.cleanup();
    } catch (error) {
      console.error('[TimerManager] Error cleaning up old timer manager:', error);
    }
  }
  
  // Create new instance
  window.timerManager = new TimerManager();
  return window.timerManager;
};

// Export the singleton instance for module imports
export const timerManager = window.timerManager || new TimerManager(); 