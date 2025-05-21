import * as THREE from 'three';
import Logger from '../utils/logger';

import { Neuron, neuronEngine } from './index';

/**
 * Patch functions to make existing code compatible with the centralized neural system
 * 
 * This module provides patches that can be applied to make the existing codebase
 * work with our new centralized neural simulation system without requiring a complete rewrite.
 */

/**
 * Apply patches to make the existing code work with the centralized system
 */
export function applyCompatibilityPatches() {
  Logger.debug('[Patches] Applying compatibility patches for centralized neural system');
  
  // Store original Neuron class for reference
  if (window.OriginalNeuron) {
    Logger.warn('[Patches] Original Neuron class already stored, skipping backup');
  } else {
    window.OriginalNeuron = window.Neuron;
  }
  
  // Replace global Neuron class with our compatibility layer
  window.Neuron = Neuron;
  
  // Patch global circles array to work with our system
  if (window.circles && Array.isArray(window.circles)) {
    patchCirclesArray();
  }
  
  // Add support for legacy "neuron" property on mesh objects
  patchMeshNeuronProperty();
  
  Logger.debug('[Patches] Compatibility patches applied successfully');
}

/**
 * Patch the global circles array to work with our centralized system
 */
function patchCirclesArray() {
  // Store original array
  const originalCircles = [...window.circles];
  
  Logger.debug(`[Patches] Starting migration of ${originalCircles.length} neurons to centralized system`);
  
  // For each circle that has a neuron property
  originalCircles.forEach((circle, index) => {
    if (circle && circle.neuron) {
      const originalNeuron = circle.neuron;
      
      // Ensure we have a proper ID (use the original ID if available, otherwise create one)
      // CRITICAL FIX: Use the string ID rather than numeric index to ensure correct connections
      const neuronId = originalNeuron.id || `${index + 1}`;
      
      Logger.debug(`[Patches] Migrating neuron ${neuronId} to centralized system`);
      
      // Create a neuron in our centralized system
      const neuron = neuronEngine.createNeuron({
        id: neuronId,
        mesh: circle,
        position: {
          x: circle.position.x,
          y: circle.position.y,
          z: circle.position.z
        },
        baseScale: originalNeuron.baseScale || 0.2,
        maxScale: originalNeuron.maxScale || 1,
        originalColor: originalNeuron.originalColor || 0x0000ff,
        firingColor: originalNeuron.firingColor || 0xffff00,
        presetColor: originalNeuron.presetColor || null,
        presetName: originalNeuron.presetName || null,
        dcInput: originalNeuron.dcInput || 0,
        isHarmonyAnchor: originalNeuron.isHarmonyAnchor || false
      });
      
      // Store the neuron mesh in the adapter for visualization
      if (window.neuronAdapter) {
        window.neuronAdapter.neuronMeshes.set(neuronId, circle);
      }
      
      // Copy connections if any
      if (originalNeuron.outgoingConnections && originalNeuron.outgoingConnections.size > 0) {
        Logger.debug(`[Patches] Migrating ${originalNeuron.outgoingConnections.size} connections for neuron ${neuronId}`);
        
        originalNeuron.outgoingConnections.forEach(targetIndex => {
          // Convert the target index to a proper ID (same approach as above)
          // The target should be the ID, not the array index
          const targetNeuron = window.circles[targetIndex]?.neuron;
          const targetId = targetNeuron?.id || `${targetIndex + 1}`;
          
          const weight = originalNeuron.synapticWeights.get(targetIndex) || 0.1;
          const speed = originalNeuron.synapticSpeeds.get(targetIndex) || 0.5;
          
          Logger.debug(`[Patches] Creating connection from ${neuronId} to ${targetId}`);
          neuronEngine.createConnection(neuronId, targetId, weight, speed);
        });
      }
      
      // Replace original neuron reference with a neuron adapter
      circle.neuron = createNeuronShim(neuronId);
      circle.neuronId = neuronId;
    }
  });
  
  Logger.debug('[Patches] Patched circles array with centralized neurons');
}

/**
 * Patch mesh objects to support legacy "neuron" property
 */
function patchMeshNeuronProperty() {
  // We can't replace THREE.Mesh directly as it's read-only
  // Instead, add a utility function to patch individual meshes
  
  // Create a global utility function to patch mesh objects
  window.patchMeshForNeuron = function(mesh) {
    if (!mesh) return mesh;
    
    // Skip if already patched
    if (mesh._neuronPatched) return mesh;
    
    // Add neuronId property (used by our adapter)
    mesh.neuronId = null;
    
    // Add neuron property with getter/setter
    Object.defineProperty(mesh, 'neuron', {
      get: function() {
        if (!this.neuronId) return null;
        return createNeuronShim(this.neuronId);
      },
      set: function(value) {
        // If value is null, remove neuron
        if (!value) {
          if (this.neuronId) {
            neuronEngine.removeNeuron(this.neuronId);
            this.neuronId = null;
          }
          return;
        }
        
        // If the value is already a neuron shim, just store its ID
        if (value.isNeuronShim) {
          this.neuronId = value.id;
          return;
        }
        
        // Otherwise, create a new neuron in the centralized system
        const neuron = neuronEngine.createNeuron({
          mesh: this,
          position: {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
          },
          // Try to copy properties from the old neuron
          baseScale: value.baseScale || 0.2,
          maxScale: value.maxScale || 1,
          originalColor: value.originalColor || 0x0000ff,
          firingColor: value.firingColor || 0xffff00,
          presetColor: value.presetColor || null,
          presetName: value.presetName || null,
          dcInput: value.dcInput || 0,
          isHarmonyAnchor: value.isHarmonyAnchor || false
        });
        
        this.neuronId = neuron.id;
      },
      enumerable: true,
      configurable: true
    });
    
    // Mark as patched to avoid double patching
    mesh._neuronPatched = true;
    
    return mesh;
  };
  
  // Patch the createNeuron function to ensure meshes are patched
  const originalCreateNeuron = neuronEngine.createNeuron;
  neuronEngine.createNeuron = function(options) {
    if (options.mesh) {
      window.patchMeshForNeuron(options.mesh);
    }
    return originalCreateNeuron.call(this, options);
  };
  
  // Patch any existing meshes in the scene
  if (window.scene && Array.isArray(window.scene.children)) {
    window.scene.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        window.patchMeshForNeuron(child);
      }
    });
  }
  
  Logger.debug('[Patches] Added patchMeshForNeuron utility function');
}

/**
 * Create a shim object that mimics the interface of the original Neuron class
 * but delegates all operations to our centralized neural engine
 * @param {number} neuronId The ID of the neuron in our centralized system
 * @returns {Object} A shim that behaves like the original Neuron instance
 */
function createNeuronShim(neuronId) {
  const neuron = neuronEngine.getNeuron(neuronId);
  if (!neuron) {
    Logger.error(`[Patches] Cannot create shim for non-existent neuron: ${neuronId}`);
    return null;
  }
  
  // Create a proxy object that mimics the original Neuron interface
  const shim = {
    id: neuronId,
    isNeuronShim: true,
    
    // Properties that mirror the engine's neuron properties
    get mesh() { return window.neuronAdapter?.getNeuronMesh(neuronId); },
    get currentCharge() { return neuron.currentCharge; },
    get isFiring() { return neuron.isFiring; },
    get dcInput() { return neuron.dcInput; },
    get outgoingConnections() { return new Set(neuron.outgoingConnections); },
    get synapticWeights() { return new Map(neuron.synapticWeights); },
    get synapticSpeeds() { return new Map(neuron.synapticSpeeds); },
    get baseScale() { return neuron.baseScale; },
    get maxScale() { return neuron.maxScale; },
    get originalColor() { return neuron.originalColor; },
    get firingColor() { return neuron.firingColor; },
    get presetColor() { return neuron.presetColor; },
    set presetColor(value) { neuron.presetColor = value; },
    get presetName() { return neuron.presetName; },
    get isHarmonyAnchor() { return neuron.isHarmonyAnchor; },
    get currentEnvelope() { return neuron.currentEnvelope; },
    
    // Main methods that delegate to the engine
    setDCInput(value, resetCharge = false) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.setDCInput(neuronId, value, resetCharge);
      }
      return neuronEngine.setDCInput(neuronId, value, resetCharge);
    },
    
    addCharge(amount) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.addCharge(neuronId, amount);
      }
      return neuronEngine.addCharge(neuronId, amount);
    },
    
    fire() {
      if (window.neuronAdapter) {
        return window.neuronAdapter.fireNeuron(neuronId);
      }
      return neuronEngine.fireNeuron(neuronId);
    },
    
    addConnection(targetId, weight = 0.1, speed = 0.5) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.createConnection(neuronId, targetId, weight, speed);
      }
      return neuronEngine.createConnection(neuronId, targetId, weight, speed);
    },
    
    updateConnectionWeight(targetId, weight) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.updateConnectionWeight(neuronId, targetId, weight);
      }
      return neuronEngine.updateConnectionWeight(neuronId, targetId, weight);
    },
    
    updateConnectionSpeed(targetId, speed) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.updateConnectionSpeed(neuronId, targetId, speed);
      }
      return neuronEngine.updateConnectionSpeed(neuronId, targetId, speed);
    },
    
    removeConnection(targetId) {
      if (window.neuronAdapter) {
        return window.neuronAdapter.removeConnection(neuronId, targetId);
      }
      return neuronEngine.removeConnection(neuronId, targetId);
    },
    
    reset() {
      return neuronEngine.resetNeuron(neuronId);
    },
    
    // Methods that do nothing in the centralized system
    update() {
      // No-op, handled by central update loop
    },
    
    updateVisualState() {
      // No-op, handled by adapter
    },
    
    cleanup() {
      return neuronEngine.removeNeuron(neuronId);
    },
    
    setExternalAnimation(duration = 500) {
      return true;
    },
    
    // Compatibility methods for code that expects refractory period
    isInRefractoryPeriod() {
      return false;
    }
  };
  
  return shim;
}

/**
 * Restore original code patched by this module
 */
export function removeCompatibilityPatches() {
  // Restore original Neuron class
  if (window.OriginalNeuron) {
    window.Neuron = window.OriginalNeuron;
    window.OriginalNeuron = null;
  }
  
  // Cleanup any remaining references
  Logger.debug('[Patches] Compatibility patches removed');
} 