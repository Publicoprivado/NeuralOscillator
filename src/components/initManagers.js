/**
 * initManagers.js - Initialize all manager components in one import
 * 
 * This file exports a function that initializes all manager components
 * and makes them available globally. It can be imported at the top of main.js
 * or any other entry point file.
 */

import { resourceManager } from './ResourceManager.js';
import { eventManager } from './EventManager.js';
import { timerManager } from './TimerManager.js';
import { stateManager } from './StateManager.js';
import { reactiveManager } from './ReactiveManager.js';
import { neuronGridManager } from './NeuronGridManager.js';
import Logger from './utils/logger.js';

/**
 * Initialize all resource and event managers
 * Making them available globally and setting up initial state
 */
export function initializeManagers() {
  Logger.debug('Initializing all resource and event managers...');
  
  // Make managers available globally
  window.resourceManager = resourceManager;
  window.eventManager = eventManager;
  window.timerManager = timerManager;
  window.stateManager = stateManager;
  window.reactiveManager = reactiveManager;
  window.neuronGridManager = neuronGridManager;
  
  // Set up global cleanup function
  window.cleanupAllManagers = () => {
    Logger.debug('Cleaning up all managers...');
    
    // Clean up in reverse order of dependencies
    neuronGridManager.cleanup();
    reactiveManager.cleanup();
    eventManager.cleanup();
    timerManager.cleanup();
    resourceManager.cleanup();
    
    Logger.debug('All managers cleaned up.');
  };
  
  // Register cleanup on page unload
  window.addEventListener('beforeunload', window.cleanupAllManagers);
  
  Logger.info('All managers initialized and available globally.');
  
  return {
    resourceManager,
    eventManager,
    timerManager,
    stateManager,
    reactiveManager,
    neuronGridManager
  };
}

// Auto-initialize when this file is imported if autoInit=true URL parameter is present
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('autoInit') === 'true') {
  initializeManagers();
}

/**
 * Patch existing application code to use managers
 * This smooths the transition by redirecting commonly used methods
 * to their manager equivalents
 */
export function patchExistingCode() {
  // Patch setTimeout/setInterval with timerManager
  const originalSetTimeout = window.setTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearTimeout = window.clearTimeout;
  const originalClearInterval = window.clearInterval;
  
  // Store mapping between original timer IDs and manager timer IDs
  const timeoutMap = new Map();
  const intervalMap = new Map();
  
  // Replace global setTimeout
  window.setTimeout = (callback, delay, ...args) => {
    if (window.timerManager) {
      const managerId = window.timerManager.setTimeout('global', () => {
        callback(...args);
      }, delay);
      
      // Create a fake ID for legacy code
      const fakeId = Math.floor(Math.random() * 1000000000);
      timeoutMap.set(fakeId, managerId);
      return fakeId;
    } else {
      return originalSetTimeout(callback, delay, ...args);
    }
  };
  
  // Replace global setInterval
  window.setInterval = (callback, delay, ...args) => {
    if (window.timerManager) {
      const managerId = window.timerManager.setInterval('global', () => {
        callback(...args);
      }, delay);
      
      // Create a fake ID for legacy code
      const fakeId = Math.floor(Math.random() * 1000000000);
      intervalMap.set(fakeId, managerId);
      return fakeId;
    } else {
      return originalSetInterval(callback, delay, ...args);
    }
  };
  
  // Replace global clearTimeout
  window.clearTimeout = (id) => {
    if (window.timerManager && timeoutMap.has(id)) {
      window.timerManager.clearTimeout('global', timeoutMap.get(id));
      timeoutMap.delete(id);
    } else {
      originalClearTimeout(id);
    }
  };
  
  // Replace global clearInterval
  window.clearInterval = (id) => {
    if (window.timerManager && intervalMap.has(id)) {
      window.timerManager.clearInterval('global', intervalMap.get(id));
      intervalMap.delete(id);
    } else {
      originalClearInterval(id);
    }
  };
  
  Logger.debug('Patched existing code to use managers.');
}

// Export function to restore original methods
export function restoreOriginalCode() {
  if (window._originalSetTimeout) window.setTimeout = window._originalSetTimeout;
  if (window._originalSetInterval) window.setInterval = window._originalSetInterval;
  if (window._originalClearTimeout) window.clearTimeout = window._originalClearTimeout;
  if (window._originalClearInterval) window.clearInterval = window._originalClearInterval;
  
  Logger.debug('Restored original methods.');
} 