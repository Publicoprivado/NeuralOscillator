/**
 * NeuronEngine - Central neural simulation system
 * 
 * Manages all neuron updates within a single, centralized loop.
 * Replaces individual neuron timers with a synchronous update system.
 */

import * as THREE from 'three';

class NeuronEngine {
  constructor() {
    // Core simulation properties
    this.neurons = new Map(); // Map of id -> neuron data
  }

  /**
   * Check if a neuron is visible (on-screen)
   * @param {Object} neuron The neuron to check
   * @returns {boolean} Whether the neuron is visible
   * @private
   */
  _isNeuronVisible(neuron) {
    // If no position data, consider it visible (better to process than miss it)
    if (!neuron.position) return true;
    
    // If position is all zeros, assume it's visible (safety check)
    if (neuron.position.x === 0 && neuron.position.y === 0 && neuron.position.z === 0) {
      return true;
    }
    
    // Need camera and scene for frustum checks
    if (!window.camera) return true;
    
    // Get neuron 3D position
    const position = neuron.position;
    
    // Create temp vector to avoid garbage collection
    if (!this._tempVec3) {
      this._tempVec3 = new THREE.Vector3();
    }
    
    // Set vector to neuron position
    this._tempVec3.set(position.x, position.y, position.z);
    
    // Get camera frustum
    if (!this._frustum) {
      this._frustum = new THREE.Frustum();
    }
    
    // Calculate current frustum
    this._frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        window.camera.projectionMatrix,
        window.camera.matrixWorldInverse
      )
    );
    
    // Return whether point is in frustum
    return this._frustum.containsPoint(this._tempVec3);
  }

  /**
   * Update all neurons in the simulation
   * @param {number} deltaTime Time since last update in ms
   * @private
   */
  _updateNeurons(deltaTime) {
    // Convert deltaTime to seconds for charge calculations
    const dt = deltaTime / 1000;
    
    // Process each neuron
    for (const [id, neuron] of this.neurons) {
      // Skip processing deleted neurons
      if (!neuron) continue;
      
      // Skip updating non-critical offscreen neurons to improve performance
      // Only process onscreen neurons or ones with DC input or current charge
      const isVisible = this._isNeuronVisible(neuron);
      const hasDCInput = neuron.dcInput > 0;
      const hasCharge = neuron.currentCharge > 0.01;
      const isFiring = neuron.isFiring;
      
      if (!isVisible && !hasDCInput && !hasCharge && !isFiring) {
        continue; // Skip processing this neuron
      }
      
      // If neuron has DC input and isn't in refractory period or firing, accumulate charge
      if (neuron.dcInput > 0 && !neuron.isFiring) {
        // Calculate charge increment based on DC input value
        // Reduced for more subtle control at low DC values
        const chargeIncrement = dt * neuron.dcInput * 5;
        neuron.currentCharge += chargeIncrement;
        
        // Flag for firing if threshold reached
        if (neuron.currentCharge >= this.THRESHOLD) {
          neuron.shouldFire = true;
        }
      }
      
      // Update any neuron state that depends on time
      this._updateNeuronState(neuron, deltaTime);
    }
  }
} 