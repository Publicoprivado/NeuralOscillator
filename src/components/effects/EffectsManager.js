import * as THREE from 'three';
import Logger from '../utils/logger';

import { NeuronEffect } from './NeuronEffect';
import { ConnectionEffect } from './ConnectionEffect';

/**
 * EffectsManager - Coordinates all visual effects in the SNN
 * Provides a single interface to manage all lightweight effects
 */
export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.initialized = false;
    
    // Initialize the effect systems
    this.initialize();
  }
  
  /**
   * Initialize all effect systems
   */
  initialize() {
    if (this.initialized) return;
    
    Logger.debug('[EffectsManager] Initializing effect systems');
    
    // Initialize neuron effects
    NeuronEffect.initialize(this.scene, 20);
    
    // Initialize connection effects
    ConnectionEffect.initialize(this.scene, 30);
    
    this.initialized = true;
    Logger.info('[EffectsManager] All effect systems initialized');
  }
  
  /**
   * Create a neuron firing effect
   * @param {THREE.Object3D} neuronMesh - The neuron mesh
   * @param {THREE.Color} color - Optional color for the effect
   */
  createNeuronFiringEffect(neuronMesh, color = null) {
    if (!this.initialized) return;
    NeuronEffect.createFiringEffect(neuronMesh, color);
  }
  
  /**
   * Create a signal particle between neurons
   * @param {THREE.Vector3} sourcePos - Starting position
   * @param {THREE.Vector3} targetPos - Ending position
   * @param {Function} onComplete - Callback when particle reaches target
   * @param {number} speed - Speed factor (0-1)
   * @param {number} weight - Weight factor for particle size (0-1)
   */
  createSignalParticle(sourcePos, targetPos, onComplete = null, speed = 0.5, weight = 0.5) {
    if (!this.initialized) return;
    ConnectionEffect.createSignalParticle(sourcePos, targetPos, onComplete, speed, weight);
  }
  
  /**
   * Clean up all resources
   */
  dispose() {
    if (!this.initialized) return;
    
    NeuronEffect.dispose();
    ConnectionEffect.dispose();
    
    this.initialized = false;
  }
} 