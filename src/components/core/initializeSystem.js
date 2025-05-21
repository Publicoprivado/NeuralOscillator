/**
 * Initialize the Centralized Neural Simulation System and integrate with existing code
 */

import { initializeCentralizedSystem } from './index';
import { applyCompatibilityPatches } from './patchExistingCode';
import Logger from '../utils/logger.js';

/**
 * Initialize the centralized neural simulation system in the main application
 * @param {Object} scene The THREE.js scene
 * @param {Object} effectsManager The effects manager instance
 * @param {Object} options Additional options
 * @returns {Object} The initialized system components
 */
export function initializeCentralizedNeuralSystem(scene, effectsManager = null, options = {}) {
  // Log initialization
  Logger.debug('==== Initializing Centralized Neural Simulation System ====');
  Logger.info('Scene:', scene ? 'Available' : 'Missing');
  Logger.info('EffectsManager:', effectsManager ? 'Available' : 'Missing');
  
  // Initialize the centralized system
  const { engine, adapter } = initializeCentralizedSystem(scene, effectsManager);
  
  // Apply compatibility patches to work with existing code
  if (options.applyPatches !== false) {
    applyCompatibilityPatches();
    Logger.debug('Applied compatibility patches for existing code');
  }
  
  // Register with global application state if available
  if (window.stateManager) {
    window.stateManager.registerComponent('neuralEngine', engine);
    window.stateManager.registerComponent('neuronAdapter', adapter);
    Logger.debug('Registered neural components with state manager');
  }
  
  // Set up centralized system event listeners
  setupEventListeners(engine, adapter);
  
  Logger.debug('==== Centralized Neural Simulation System Initialization Complete ====');
  
  // Return components
  return {
    engine,
    adapter
  };
}

/**
 * Set up event listeners for the centralized system
 * @param {Object} engine The neural engine
 * @param {Object} adapter The neuron adapter
 */
function setupEventListeners(engine, adapter) {
  // Listen for window focus/blur events
  window.addEventListener('focus', () => {
    // Resume the simulation when window gains focus
    if (engine.isPaused) {
      engine.resume();
      Logger.debug('[System] Resumed neural simulation');
    }
  });
  
  window.addEventListener('blur', () => {
    // Pause the simulation when window loses focus
    if (!engine.isPaused) {
      engine.pause();
      Logger.debug('[System] Paused neural simulation');
    }
  });
  
  // Listen for scene-specific events if using an event system
  if (window.eventManager) {
    // Listen for neuron creation/removal events
    window.eventManager.addEventListener(window, 'neuronCreated', (event) => {
      // event.detail would contain the neuron data
      Logger.debug('[System] Detected neuron creation event');
    });
    
    window.eventManager.addEventListener(window, 'neuronRemoved', (event) => {
      // event.detail would contain the neuron ID
      Logger.debug('[System] Detected neuron removal event');
    });
  }
  
  // Global error handler to prevent simulation crashes
  window.addEventListener('error', (event) => {
    Logger.error('[System] Caught global error:', event.error);
    // Prevent the error from crashing the simulation
    event.preventDefault();
  });
}

// Export the initialization function as default
export default initializeCentralizedNeuralSystem; 