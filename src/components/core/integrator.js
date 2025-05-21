/**
 * Integrator - Provides a central point to activate the centralized neural system
 * 
 * Usage:
 * 1. Import this file in main.js: import { enableCentralizedNeuralSystem } from './components/core/integrator';
 * 2. Call the function after scene setup: enableCentralizedNeuralSystem(scene, effectsManager);
 * 3. Everything else will be handled automatically
 */

import initializeCentralizedNeuralSystem from './initializeSystem';
import { registerExistingNeurons } from './index';
import Logger from '../utils/logger.js';

// Store original objects to support restoring
let originalObjects = {
  Neuron: null,
  circles: null
};

// Flag to track if the system is enabled
let isEnabled = false;

/**
 * Enable the centralized neural system
 * @param {THREE.Scene} scene The THREE.js scene
 * @param {Object} effectsManager The effects manager (optional)
 * @param {Object} options Additional options
 * @returns {Object} The initialized system components
 */
export function enableCentralizedNeuralSystem(scene, effectsManager = null, options = {}) {
  if (isEnabled) {
    // Skip non-critical logs
    return window.neuralSystem || null;
  }
  
  // First check if we have existing neurons to migrate
  const hasExistingNeurons = window.circles && Array.isArray(window.circles) && window.circles.length > 0;
  
  if (hasExistingNeurons) {
    Logger.debug(`[Integrator] Found ${window.circles.length} existing neurons to migrate`);
    
    // Log the IDs of existing neurons for debugging
    const existingIds = window.circles
      .filter(circle => circle && circle.neuron)
      .map(circle => circle.neuron.id || 'unknown');
    
    Logger.debug(`[Integrator] Existing neuron IDs: ${existingIds.join(', ')}`);
  }
  
  // Store original objects for potential restoration
  originalObjects.Neuron = window.Neuron;
  originalObjects.circles = window.circles ? [...window.circles] : null;
  
  // If no scene is provided but it's available globally, use that
  if (!scene && window.scene) {
    scene = window.scene;
    Logger.debug('[Integrator] Using global scene');
  }
  
  // Same for effects manager
  if (!effectsManager && window.effectsManager) {
    effectsManager = window.effectsManager;
    Logger.debug('[Integrator] Using global effects manager');
  }
  
  // Initialize the system
  const system = initializeCentralizedNeuralSystem(scene, effectsManager, options);
  
  // Make the system globally available
  window.neuralSystem = system;
  
  // Log initialization success in a noticeable way
  Logger.debug('[NEURAL SYSTEM] Centralized neural system ENABLED');
  Logger.info('- Engine and adapter are available at window.neuralSystem');
  Logger.debug('- Direct access: window.neuralEngine and window.neuronAdapter');
  
  // Verify that neurons were correctly migrated if we had existing ones
  if (hasExistingNeurons && system.engine) {
    const migratedNeurons = system.engine.getAllNeurons();
    Logger.debug(`[Integrator] Neurons in centralized system: ${migratedNeurons.length}`);
    
    // Check each neuron for connections
    migratedNeurons.forEach(neuron => {
      Logger.debug(`[Integrator] Neuron ${neuron.id} has ${neuron.outgoingConnections.length} connections`);
    });
  }
  
  // Mark as enabled
  isEnabled = true;
  
  // Return the system components
  return system;
}

/**
 * Disable the centralized neural system and restore original behavior
 * @returns {boolean} Success
 */
export function disableCentralizedNeuralSystem() {
  if (!isEnabled) {
    // Skip non-critical logs
    return false;
  }
  
  // Clean up neural engine
  if (window.neuralEngine) {
    window.neuralEngine.dispose();
  }
  
  // Restore original objects
  if (originalObjects.Neuron) {
    window.Neuron = originalObjects.Neuron;
  }
  
  // Restore circles would be complex and is not fully implemented
  
  // Mark as disabled
  isEnabled = false;
  
  Logger.debug('[Integrator] Centralized neural system disabled');
  return true;
}

/**
 * Check if the centralized neural system is enabled
 * @returns {boolean} Whether the system is enabled
 */
export function isCentralizedNeuralSystemEnabled() {
  return isEnabled;
}

/**
 * Get access to the neural engine and adapter
 * @returns {Object} The neural engine and adapter
 */
export function getNeuralSystem() {
  if (!isEnabled) {
    // Skip non-critical logs
    return null;
  }
  
  return {
    engine: window.neuralEngine,
    adapter: window.neuronAdapter
  };
}

/**
 * Utility function to fix neuron registration issues
 * This can be called directly from the console or by application code
 * @returns {boolean} Success flag
 */
export function fixNeuronRegistration() {
  if (!isEnabled) {
    Logger.error('[Integrator] Cannot fix neurons - centralized system not enabled');
    return false;
  }
  
  // Ensure neuronEngine and adapter are available
  if (!window.neuralEngine || !window.neuronAdapter) {
    Logger.error('[Integrator] Cannot fix neurons - missing engine or adapter');
    return false;
  }
  
  // Re-register all existing neurons
  registerExistingNeurons();
  
  return true;
}

// Make the fix function globally available for debugging
if (typeof window !== 'undefined') {
  window.fixNeuralSystem = fixNeuronRegistration;
} 