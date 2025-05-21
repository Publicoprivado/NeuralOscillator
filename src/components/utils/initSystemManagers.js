import { TimerManager } from './TimerManager';

/**
 * Initialize system managers required for optimal SNN simulation
 * This ensures TimerManager and other core services are available 
 * before the simulation starts
 */
export function initSystemManagers() {
  // Create and expose the global timer manager
  if (!window.timerManager) {
    window.timerManager = new TimerManager();
  }
  
  return {
    timerManager: window.timerManager
  };
}

// Create a function to check if the necessary managers are available
export function ensureManagersInitialized() {
  if (!window.timerManager) {
    return initSystemManagers();
  }
  return {
    timerManager: window.timerManager
  };
} 