/**
 * AppInitializer - Handles the initialization of all architectural components
 */
import { stateManager } from './StateManager.js';
import { reactiveManager } from './ReactiveManager.js';
import { eventSystem } from './EventSystem.js';
import { timerManager } from './TimerManager.js';
import { eventManager } from './EventManager.js';
import { resourceManager } from './ResourceManager.js';

export class AppInitializer {
  constructor() {
    this.initialized = false;
  }
  
  /**
   * Initialize the application architecture
   * @param {Object} components - Object containing core application components
   */
  initialize(components) {
    if (this.initialized) {
      // Only log errors, not warnings
      return;
    }
    
    // Register core components with state manager
    Object.entries(components).forEach(([name, component]) => {
      stateManager.registerComponent(name, component);
    });
    
    // Initialize managers in correct sequence
    this.initializeStateManager(components);
    this.initializeResourceManager();
    this.initializeTimerManager();
    this.initializeEventManager();
    this.initializeReactiveManager();
    this.initializeEventSystem();
    
    // Set up event relay between system components
    this.setupEventRelay();
    
    // Initialize reactive UI updates
    this.setupReactiveUI();
    
    // Make managers globally available
    this.exposeManagersGlobally();
    
    // Mark as initialized
    this.initialized = true;
  }
  
  /**
   * Initialize the state manager with initial values
   * @param {Object} components - Core application components
   */
  initializeStateManager(components) {
    // Store initial state values
    stateManager.setState('isMobile', window.innerWidth < 1024);
    stateManager.setState('circles', components.circles || []);
    stateManager.setState('settings', components.settings || {});
    stateManager.setState('neuronGridNeedsUpdate', false);
    stateManager.setState('canvasNeedsUpdate', false);
    
    // Store functions
    if (components.updateNeuronGrid) {
      stateManager.setState('updateNeuronGrid', components.updateNeuronGrid);
    }
  }
  
  /**
   * Initialize the resource manager for THREE.js object management
   */
  initializeResourceManager() {
    // Nothing special needed for initialization
  }
  
  /**
   * Initialize the timer manager for centralized timer handling
   */
  initializeTimerManager() {
    // Nothing special needed for initialization
  }
  
  /**
   * Initialize the event manager for centralized event handling
   */
  initializeEventManager() {
    // Nothing special needed for initialization
  }
  
  /**
   * Initialize the reactive manager
   */
  initializeReactiveManager() {
    reactiveManager.initialize();
  }
  
  /**
   * Initialize the event system
   */
  initializeEventSystem() {
    eventSystem.initialize();
  }
  
  /**
   * Set up event relay between components
   */
  setupEventRelay() {
    // Neuron state changes -> Grid updates
    stateManager.on('neuronStateChanged', () => {
      stateManager.setState('neuronGridNeedsUpdate', true);
    });
    
    // Layout changes -> UI updates
    stateManager.on('layoutChanged', ({ isMobile }) => {
      const uiManager = stateManager.getComponent('uiManager');
      if (isMobile && uiManager) {
        uiManager.updateSynthPanelMobileView();
      }
    });
    
    // Sound parameter changes -> Canvas updates
    stateManager.on('soundParameterChanged', () => {
      reactiveManager.markCanvasForUpdate();
    });
  }
  
  /**
   * Set up reactive UI updates
   */
  setupReactiveUI() {
    // Set up resize observer for responsive layout using reactiveManager
    reactiveManager.observeResize(document.body, 'layout', (entries) => {
      const isMobile = window.innerWidth < 1024;
      if (stateManager.getState('isMobile') !== isMobile) {
        stateManager.setState('isMobile', isMobile);
        stateManager.dispatchEvent('layoutChanged', { isMobile });
      }
    });
  }
  
  /**
   * Expose managers globally for backward compatibility
   */
  exposeManagersGlobally() {
    // Make managers available on window for existing code
    window.stateManager = stateManager;
    window.reactiveManager = reactiveManager;
    window.timerManager = timerManager;
    window.eventManager = eventManager;
    window.resourceManager = resourceManager;
  }
  
  /**
   * Clean up all managers when shutting down the application
   */
  cleanup() {
    // Clean up in reverse order of initialization
    reactiveManager.cleanup();
    eventSystem.cleanup();
    eventManager.cleanup();
    timerManager.cleanup();
    resourceManager.cleanup();
    
    // Mark as uninitialized
    this.initialized = false;
  }
}

// Create a single instance to be imported by all components
export const appInitializer = new AppInitializer(); 