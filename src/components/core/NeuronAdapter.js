/**
 * NeuronAdapter - Interfaces between the centralized NeuronEngine and THREE.js visuals
 * 
 * This adapter handles the visual representation of neurons and their connections,
 * while delegating all simulation logic to the centralized NeuronEngine.
 */

import * as THREE from 'three';
import neuronEngine from './NeuronEngine';

export class NeuronAdapter {
  constructor(scene, options = {}) {
    // Store scene reference
    this.scene = scene;
    
    // Configuration
    this.options = {
      chargeColorInterpolation: true,
      showScaleChanges: true,
      ...options
    };
    
    // Visual properties
    this.neuronMeshes = new Map(); // Map of neuronId -> THREE.Mesh
    this.connectionLines = new Map(); // Map of connectionId -> THREE.Line
    
    // Internal state
    this.initialized = false;
    
    // Effects manager reference
    this.effectsManager = null;
    
    // Bind methods
    this.handleEffects = this.handleEffects.bind(this);
    this.handleSounds = this.handleSounds.bind(this);
  }
  
  /**
   * Initialize the adapter
   * @param {Object} effectsManager Optional effects manager
   */
  initialize(effectsManager = null) {
    if (this.initialized) return this;
    
    // Store effects manager
    this.effectsManager = effectsManager;
    
    // Initialize neuron engine with our callback handlers
    neuronEngine.initialize({
      onEffectNeeded: this.handleEffects,
      onSoundNeeded: this.handleSounds
    });
    
    // Start the simulation
    neuronEngine.start();
    
    this.initialized = true;
    return this;
  }
  
  /**
   * Create a neuron with visual representation
   * @param {THREE.Mesh} mesh The THREE.js mesh for this neuron
   * @param {Object} properties Additional neuron properties
   * @returns {Object} The created neuron data
   */
  createNeuron(mesh, properties = {}) {
    if (!mesh) {
      console.error('[NeuronAdapter] Cannot create neuron without mesh');
      return null;
    }
    
    // Extract position from mesh
    const position = {
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z
    };
    
    // Create neuron in engine
    const neuron = neuronEngine.createNeuron({
      mesh: mesh, // Store reference but not used directly by engine
      position: position,
      baseScale: properties.baseScale || 0.2,
      maxScale: properties.maxScale || 1,
      originalColor: properties.originalColor || 0x0000ff,
      firingColor: properties.firingColor || 0xffff00,
      presetColor: properties.presetColor || null,
      presetName: properties.presetName || null,
      isHarmonyAnchor: properties.isHarmonyAnchor || false,
      currentEnvelope: properties.currentEnvelope || { attack: 0, sustain: 0, release: 0 }
    });
    
    // Store mesh reference for this neuron
    this.neuronMeshes.set(neuron.id, mesh);
    
    // Set initial visual state
    this.updateNeuronVisuals(neuron);
    
    // Also store neuron reference on the mesh
    mesh.neuronId = neuron.id;
    
    return neuron;
  }
  
  /**
   * Remove a neuron and its visual representation
   * @param {number} neuronId Neuron ID
   */
  removeNeuron(neuronId) {
    const neuron = neuronEngine.getNeuron(neuronId);
    if (!neuron) return;
    
    // Remove from engine
    neuronEngine.removeNeuron(neuronId);
    
    // Remove mesh from scene if it exists
    const mesh = this.neuronMeshes.get(neuronId);
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
    
    // Remove from mesh map
    this.neuronMeshes.delete(neuronId);
  }
  
  /**
   * Create a connection between neurons
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} weight Initial connection weight (0-1)
   * @param {number} speed Initial connection speed (0-1)
   */
  createConnection(sourceId, targetId, weight = 0.1, speed = 0.5) {
    // Create connection in engine
    const success = neuronEngine.createConnection(sourceId, targetId, weight, speed);
    
    if (success) {
      // Update visual representation
      this.updateConnectionVisuals(sourceId, targetId);
    } else {
      console.error(`[NeuronAdapter] Failed to create connection in engine`);
    }
    
    return success;
  }
  
  /**
   * Remove a connection
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   */
  removeConnection(sourceId, targetId) {
    // Remove connection from engine
    const success = neuronEngine.removeConnection(sourceId, targetId);
    
    if (success) {
      // Remove visual representation
      const connectionKey = `${sourceId}_${targetId}`;
      const line = this.connectionLines.get(connectionKey);
      
      if (line && line.parent) {
        line.parent.remove(line);
      }
      
      this.connectionLines.delete(connectionKey);
    }
    
    return success;
  }
  
  /**
   * Set DC input for a neuron
   * @param {number} neuronId Neuron ID
   * @param {number} value DC input value (0-1)
   * @param {boolean} resetCharge Whether to reset current charge
   */
  setDCInput(neuronId, value, resetCharge = false) {
    // Update in engine
    const success = neuronEngine.setDCInput(neuronId, value, resetCharge);
    
    if (success) {
      // Update visuals
      const neuron = neuronEngine.getNeuron(neuronId);
      this.updateNeuronVisuals(neuron);
    }
    
    return success;
  }
  
  /**
   * Add charge to a neuron
   * @param {number} neuronId Neuron ID
   * @param {number} amount Amount of charge to add
   */
  addCharge(neuronId, amount) {
    // Add charge in engine
    const success = neuronEngine.addCharge(neuronId, amount);
    
    if (success) {
      // Update visuals
      const neuron = neuronEngine.getNeuron(neuronId);
      this.updateNeuronVisuals(neuron);
    }
    
    return success;
  }
  
  /**
   * Force a neuron to fire
   * @param {number} neuronId Neuron ID
   */
  fireNeuron(neuronId) {
    return neuronEngine.fireNeuron(neuronId);
  }
  
  /**
   * Update a connection's weight
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} weight New weight (0-1)
   */
  updateConnectionWeight(sourceId, targetId, weight) {
    return neuronEngine.updateConnectionWeight(sourceId, targetId, weight);
  }
  
  /**
   * Update a connection's speed
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} speed New speed (0-1)
   */
  updateConnectionSpeed(sourceId, targetId, speed) {
    return neuronEngine.updateConnectionSpeed(sourceId, targetId, speed);
  }
  
  /**
   * Reset a neuron to initial state
   * @param {number} neuronId Neuron ID
   */
  resetNeuron(neuronId) {
    const success = neuronEngine.resetNeuron(neuronId);
    
    if (success) {
      // Update visuals
      const neuron = neuronEngine.getNeuron(neuronId);
      this.updateNeuronVisuals(neuron);
    }
    
    return success;
  }
  
  /**
   * Get a neuron by ID
   * @param {number} neuronId Neuron ID
   * @returns {Object} Neuron data
   */
  getNeuron(neuronId) {
    return neuronEngine.getNeuron(neuronId);
  }
  
  /**
   * Get the THREE.js mesh for a neuron
   * @param {number} neuronId Neuron ID
   * @returns {THREE.Mesh} The neuron's mesh
   */
  getNeuronMesh(neuronId) {
    return this.neuronMeshes.get(neuronId);
  }
  
  /**
   * Handle effect requests from the neuron engine
   * @param {string} type Effect type (fire, signal, update)
   * @param {Object} data Effect data
   * @private
   */
  handleEffects(type, data) {
    switch (type) {
      case 'fire':
        this.createFiringEffect(data);
        break;
      case 'signal':
        this.createSignalEffect(data);
        break;
      case 'update':
        this.updateNeuronVisuals(data);
        break;
    }
  }
  
  /**
   * Handle sound requests from the neuron engine
   * @param {string} type Sound type (fire)
   * @param {Object} data Sound data
   * @private
   */
  handleSounds(type, data) {
    if (type === 'fire' && window.soundManager) {
      const neuron = data;
      
      // Calculate sound parameters based on neuron properties
      const sourcesCount = neuron.outgoingConnections.length;
      let avgWeight = 0;
      let avgSpeed = 0;
      
      if (sourcesCount > 0) {
        let totalWeight = 0;
        let totalSpeed = 0;
        
        for (const targetId of neuron.outgoingConnections) {
          totalWeight += neuron.synapticWeights.get(targetId) || 0.1;
          totalSpeed += neuron.synapticSpeeds.get(targetId) || 0.5;
        }
        
        avgWeight = totalWeight / sourcesCount;
        avgSpeed = totalSpeed / sourcesCount;
      } else {
        avgWeight = 0.5;
        avgSpeed = 0.5;
      }
      
      // Play sound through sound manager
      window.soundManager.playNeuronFiring(
        avgWeight,
        avgSpeed,
        neuron.id,
        sourcesCount === 0,
        neuron.dcInput > 0,
        1 // distance (not used in centralized system)
      );
    }
  }
  
  /**
   * Create firing effect for a neuron - simplified for performance
   * @param {Object} neuron Neuron data
   * @private
   */
  createFiringEffect(neuron) {
    // Update the visual state first
    this.updateNeuronVisuals(neuron);
    
    // Get the mesh
    const mesh = this.neuronMeshes.get(neuron.id);
    if (!mesh) return;
    
    // Basic color change without additional animations
    const firingColor = neuron.presetColor ?
      new THREE.Color().copy(neuron.presetColor).multiplyScalar(1.5) :
      new THREE.Color(neuron.firingColor);
    
    if (mesh.material) {
      mesh.material.color.copy(firingColor);
      
      // Reset color after delay
      setTimeout(() => {
        if (mesh.material) {
          const originalColor = neuron.presetColor ?
            new THREE.Color().copy(neuron.presetColor) :
            new THREE.Color(neuron.originalColor);
          mesh.material.color.copy(originalColor);
        }
      }, 150);
    }
  }
  
  /**
   * Create signal effect between neurons - disabled for performance
   * @param {Object} data Signal data
   * @private
   */
  createSignalEffect(data) {
    // Signal animations are disabled for performance
    // The engine already handles the logic without needing visual effects
    return;
  }
  
  /**
   * Update the visual representation of a neuron
   * @param {Object} neuron Neuron data
   * @private
   */
  updateNeuronVisuals(neuron) {
    if (!neuron) return;
    
    const mesh = this.neuronMeshes.get(neuron.id);
    if (!mesh || !mesh.material) return;
    
    // Update scale based on charge and DC input
    if (this.options.showScaleChanges) {
      const dcScale = neuron.baseScale + (neuron.maxScale - neuron.baseScale) * Math.min(1.0, neuron.dcInput);
      const chargeRatio = neuron.currentCharge / 1.0; // Assume threshold is 1.0
      let targetScale;
      
      if (neuron.isFiring) {
        // Use larger scale when firing
        targetScale = Math.min(dcScale * 1.4, neuron.maxScale);
      } else {
        // Scale based on charge
        targetScale = dcScale * (1 + chargeRatio * 0.5);
      }
      
      // Apply scale
      mesh.scale.setScalar(targetScale);
    }
    
    // Update color based on state
    if (neuron.isFiring) {
      // Use firing color
      if (neuron.presetColor) {
        // For preset colors, just make them brighter when firing
        mesh.material.color.copy(neuron.presetColor).multiplyScalar(1.8);
      } else {
        mesh.material.color.setHex(neuron.firingColor);
      }
    } else if (this.options.chargeColorInterpolation) {
      // Interpolate color based on charge
      if (neuron.presetColor) {
        // Use preset color as base and brighten based on charge
        const chargeRatio = neuron.currentCharge / 1.0;
        if (chargeRatio > 0) {
          const baseColor = new THREE.Color().copy(neuron.presetColor);
          const brighterColor = new THREE.Color().copy(neuron.presetColor).multiplyScalar(1.5);
          mesh.material.color.copy(baseColor).lerp(brighterColor, chargeRatio);
        } else {
          mesh.material.color.copy(neuron.presetColor);
        }
      } else {
        // Default interpolation
        const chargeRatio = neuron.currentCharge / 1.0;
        const originalColor = new THREE.Color(neuron.originalColor);
        const chargingColor = new THREE.Color(0x00ffff); // Cyan for charging
        mesh.material.color.copy(originalColor).lerp(chargingColor, chargeRatio);
      }
    } else {
      // Just use original color
      if (neuron.presetColor) {
        mesh.material.color.copy(neuron.presetColor);
      } else {
        mesh.material.color.setHex(neuron.originalColor);
      }
    }
  }
  
  /**
   * Update the visual representation of a connection
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @private
   */
  updateConnectionVisuals(sourceId, targetId) {
    // This would implement connection line visualization
    // But we're focusing on the core functionality for now
  }
  
  /**
   * Handle neuron update from engine
   * This is called every frame by the engine
   * @private
   */
  update(timestamp, deltaTime) {
    // Additional visual updates could be performed here
    // But most updates are triggered by events
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    // Stop the engine
    neuronEngine.dispose();
    
    // Clean up connection lines
    for (const line of this.connectionLines.values()) {
      if (line.parent) {
        line.parent.remove(line);
      }
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    }
    this.connectionLines.clear();
    
    // Clear references
    this.neuronMeshes.clear();
    this.effectsManager = null;
    this.initialized = false;
  }
}

// Export singleton instance
export default NeuronAdapter; 