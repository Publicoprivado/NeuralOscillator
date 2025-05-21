// Import sound manager implementation
import { OptimizedSoundManager } from './OptimizedSoundManager';
import { WorkerManager } from './WorkerManager';

// Import managers for resource, event, and timer handling
import { resourceManager } from './ResourceManager';
import { eventManager } from './EventManager';
import { timerManager } from './TimerManager';

// Export component singletons
export { resourceManager, eventManager, timerManager };

// Export all manager classes
export { OptimizedSoundManager, WorkerManager };

// Export state managers
export { stateManager } from './StateManager';
export { reactiveManager } from './ReactiveManager';

// Export managers that handle specific aspects of the application
export { neuronGridManager } from './NeuronGridManager';
export { SceneManager } from './SceneManager';
export { UIManager } from './UIManager';
export { HarmonicSystem } from './HarmonicSystem';
export { InputManager } from './InputManager';
export { ConnectionManager } from './ConnectionManager';
export { EventSystem } from './EventSystem';
export { Neuron } from './neuron';

// Export utility methods from tutorial
export * from './tutorial';

// Export a factory function that creates the sound manager
export function createSoundManager(scene, camera, renderer, options = {}) {
    console.log("Creating optimized sound manager");
    return new OptimizedSoundManager(scene, camera, renderer);
} 