import * as THREE from 'three';

import Logger from '../utils/logger';

/**
 * ConnectionEffect - Lightweight visual effects for connection signals
 * Handles particle animations without affecting neuron performance
 */
export class ConnectionEffect {
  static particlePool = [];
  static availableParticles = [];
  static initialized = false;
  
  /**
   * Initialize the connection effects system
   * @param {THREE.Scene} scene - The scene to add effects to
   * @param {number} poolSize - Number of pre-created particles (default 30)
   */
  static initialize(scene, poolSize = 30) {
    if (this.initialized) return;
    
    this.scene = scene;
    this.initialized = true;
    Logger.info(`[ConnectionEffect] Initialized with disabled effects for performance`);
  }
  
  /**
   * Create a single signal particle - disabled
   * @returns {THREE.Object3D} A lightweight particle object
   */
  static createParticle() {
    return null;
  }
  
  /**
   * Get an available particle from the pool - disabled
   * @returns {THREE.Object3D} A particle object ready to use
   */
  static getParticle() {
    return null;
  }
  
  /**
   * Return a particle to the pool for reuse - disabled
   * @param {THREE.Object3D} particle - The particle to return to the pool
   */
  static releaseParticle(particle) {
    // Do nothing - disabled
  }
  
  /**
   * Create a signal particle traveling between neurons - disabled for performance
   * @param {THREE.Vector3} sourcePos - Starting position
   * @param {THREE.Vector3} targetPos - Ending position
   * @param {Function} onComplete - Callback when particle reaches target
   * @param {number} speed - Speed factor (0-1)
   * @param {number} weight - Weight factor for particle size (0-1)
   */
  static createSignalParticle(sourcePos, targetPos, onComplete = null, speed = 0.5, weight = 0.5) {
    // Animation disabled for performance, but still trigger the callback
    if (onComplete) {
      // Use a setTimeout with minimal delay to simulate completion
      setTimeout(onComplete, 10);
    }
    return;
  }
  
  /**
   * Clean up all connection effects
   */
  static dispose() {
    if (!this.initialized) return;
    this.initialized = false;
  }
} 