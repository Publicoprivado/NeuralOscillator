import * as THREE from 'three';

import Logger from '../utils/logger';

/**
 * NeuronEffect - Lightweight visual effects for neuron firing
 * Separates visual effects from core neuron logic for better performance
 */
export class NeuronEffect {
  static effectsPool = [];
  static availableEffects = [];
  static initialized = false;
  
  /**
   * Initialize the effects system with a pool of reusable effects
   * @param {THREE.Scene} scene - The scene to add effects to
   * @param {number} poolSize - Number of pre-created effects (default 20)
   */
  static initialize(scene, poolSize = 20) {
    if (this.initialized) return;
    
    this.scene = scene;
    this.initialized = true;
    Logger.info(`[NeuronEffect] Initialized with disabled effects for performance`);
  }
  
  /**
   * Create a single firing effect object - disabled
   * @returns {THREE.Object3D} A lightweight effect object
   */
  static createEffect() {
    return null;
  }
  
  /**
   * Get an available effect from the pool - disabled
   * @returns {THREE.Object3D} An effect object ready to use
   */
  static getEffect() {
    return null;
  }
  
  /**
   * Return an effect to the pool for reuse - disabled
   * @param {THREE.Object3D} effect - The effect to return to the pool
   */
  static releaseEffect(effect) {
    // Do nothing - disabled
  }
  
  /**
   * Create a firing effect at the specified neuron - disabled for performance
   * @param {THREE.Object3D} neuronMesh - The neuron mesh
   * @param {THREE.Color} color - Color of the effect (optional)
   */
  static createFiringEffect(neuronMesh, color = null) {
    // Animation disabled for performance
    return;
  }
  
  /**
   * Clean up all effects
   */
  static dispose() {
    if (!this.initialized) return;
    this.initialized = false;
  }
} 