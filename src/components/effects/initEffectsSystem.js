import { EffectsManager } from './EffectsManager';
import Logger from '../utils/logger';

import { ensureManagersInitialized } from '../utils/initSystemManagers';

/**
 * Initialize the effects system for the SNN visualization
 * @param {THREE.Scene} scene - The THREE.js scene to add effects to
 * @returns {EffectsManager} The initialized effects manager
 */
export function initEffectsSystem(scene) {
  // Ensure our high-performance TimerManager is available
  ensureManagersInitialized();
  
  // Create the effects manager if it doesn't exist
  if (!window.effectsManager && scene) {
    Logger.debug('[Effects] Creating new EffectsManager...');
    window.effectsManager = new EffectsManager(scene);
    Logger.info('[Effects] EffectsManager created and globally available');
  }
  
  return window.effectsManager;
}

/**
 * Safely dispose the effects system
 */
export function disposeEffectsSystem() {
  if (window.effectsManager) {
    Logger.debug('[Effects] Disposing EffectsManager...');
    window.effectsManager.dispose();
    window.effectsManager = null;
    Logger.debug('[Effects] EffectsManager disposed');
  }
} 