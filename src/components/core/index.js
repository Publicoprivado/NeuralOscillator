/**
 * Centralized Neural Simulation System
 * 
 * Exports a completely redesigned neural simulation system with:
 * - Single source of truth
 * - Centralized update loop
 * - Separation of simulation and visualization
 * - Stable timing and performance
 */

import neuronEngine from './NeuronEngine';
import { NeuronAdapter } from './NeuronAdapter';
import Logger from '../utils/logger.js';

/**
 * Directly register existing neurons into the centralized system
 * This ensures all neurons exist before trying to create connections between them
 */
export function registerExistingNeurons() {
  if (!window.circles || !Array.isArray(window.circles)) {
    return;
  }
  
  // First register all neurons with their IDs
  window.circles.forEach((circle, index) => {
    if (!circle || !circle.position) return;
    
    // Get the neuron ID from the circle or generate one
    const neuronId = circle.neuron?.id || `${index + 1}`;
    
    // Check if this neuron already exists in the system
    if (neuronEngine.getNeuron(neuronId)) {
      return;
    }
    
    // Create the neuron in the centralized system
    const neuron = neuronEngine.createNeuron({
      id: neuronId,
      mesh: circle,
      position: {
        x: circle.position.x,
        y: circle.position.y,
        z: circle.position.z
      },
      baseScale: circle.neuron?.baseScale || 0.2,
      maxScale: circle.neuron?.maxScale || 1,
      originalColor: circle.neuron?.originalColor || 0x0000ff,
      firingColor: circle.neuron?.firingColor || 0xffff00,
      presetColor: circle.neuron?.presetColor || null,
      presetName: circle.neuron?.presetName || null,
      dcInput: circle.neuron?.dcInput || 0
    });
    
    // Store reference to neuron in the circle
    circle.neuronId = neuronId;
    
    // Register with adapter
    if (window.neuronAdapter) {
      window.neuronAdapter.neuronMeshes.set(neuronId, circle);
    }
  });
  
  // After all neurons are registered, create the connections
  window.circles.forEach((circle, index) => {
    if (!circle || !circle.neuron || !circle.neuronId) return;
    
    const sourceId = circle.neuronId;
    
    // Get outgoing connections
    const connections = circle.neuron.outgoingConnections;
    if (!connections || connections.size === 0) return;
    
    // Create each connection
    connections.forEach(targetIndex => {
      if (targetIndex < 0 || targetIndex >= window.circles.length) return;
      
      const targetCircle = window.circles[targetIndex];
      if (!targetCircle || !targetCircle.neuronId) return;
      
      const targetId = targetCircle.neuronId;
      const weight = circle.neuron.synapticWeights?.get(targetIndex) || 0.1;
      const speed = circle.neuron.synapticSpeeds?.get(targetIndex) || 0.5;
      
      neuronEngine.createConnection(sourceId, targetId, weight, speed);
    });
  });
}

/**
 * Initialize the centralized neural simulation system
 * @param {THREE.Scene} scene - The THREE.js scene
 * @param {Object} effectsManager - Optional effects manager
 * @returns {Object} - The initialized systems
 */
export function initializeCentralizedSystem(scene, effectsManager = null) {
  // Create adapter instance
  const neuronAdapter = new NeuronAdapter(scene);
  
  // Initialize with effects manager if provided
  neuronAdapter.initialize(effectsManager);
  
  // Make available globally (for compatibility with existing code)
  window.neuralEngine = neuronEngine;
  window.neuronAdapter = neuronAdapter;
  
  // Register any existing neurons
  registerExistingNeurons();
  
  // Return references to both components
  return {
    engine: neuronEngine,
    adapter: neuronAdapter
  };
}

// Export components
export { neuronEngine, NeuronAdapter };

// Export a compatibility layer for existing code
export const Neuron = {
  // Static methods
  createNeuron: (mesh, properties) => {
    if (!window.neuronAdapter) {
      Logger.error('[Compatibility] Neuron adapter not initialized');
      return null;
    }
    return window.neuronAdapter.createNeuron(mesh, properties);
  },
  
  // Legacy static properties and methods
  dcNeurons: {
    size: 0,
    add: () => {},
    delete: () => {},
    forEach: (callback) => {
      if (!window.neuralEngine) return;
      const dcNeurons = window.neuralEngine.getDCNeurons();
      dcNeurons.forEach(callback);
    }
  },
  
  // Static method to update all DC neurons (not needed in new system)
  updateAllDCNeurons: () => {
    // No-op, handled by central system
  }
}; 