import * as THREE from 'three';

import Logger from './utils/logger';

/**
 * WorkerManager
 * Coordinates between simulation worker, audio worker, and main thread
 * Decouples UI operations from simulation and audio processing
 */
export class WorkerManager {
  constructor(soundManager) {
    this.soundManager = soundManager;
    this.simulationWorker = null;
    this.audioWorker = null;
    this.isInitialized = false;
    this.neuronState = new Map();
    this.connectionState = new Map();
    this.lastSyncTime = 0;
    this.pendingAudioEvents = [];
    this.stats = {
      simulationFPS: 0,
      audioEventsPerSecond: 0,
      audioQueueLength: 0,
      simulationQueueLength: 0
    };
    
    // Debug logging
    this.enableDebugLogging = false;
    
    // Initialize the workers
    this.initialize();
    
    // Populate with existing neurons after a brief delay
    setTimeout(() => this.initializeWithExistingNeurons(), 100);
    
    // Bind methods
    this.handleSimulationMessage = this.handleSimulationMessage.bind(this);
    this.handleAudioMessage = this.handleAudioMessage.bind(this);
    this.processAudioEvents = this.processAudioEvents.bind(this);
  }
  
  // Initialize all workers
  initialize() {
    try {
      this.log('Initializing workers...');
      
      // Create simulation worker
      this.simulationWorker = new Worker('/worker/simulationWorker.js');
      this.simulationWorker.onmessage = this.handleSimulationMessage.bind(this);
      
      // Create audio worker
      this.audioWorker = new Worker('/worker/audioWorker.js');
      this.audioWorker.onmessage = this.handleAudioMessage.bind(this);
      
      // Initialize workers
      this.simulationWorker.postMessage({ type: 'init' });
      this.audioWorker.postMessage({ type: 'init' });
      
      this.isInitialized = true;
      this.log('Workers initialized');
      
      // Set up periodic sync to keep workers in sync with main thread
      this.syncInterval = setInterval(() => this.syncState(), 5000);
      
      // Handle audio events processing on main thread
      this.processAudioEvents();
    } catch (error) {
      Logger.error('Failed to initialize workers:', error);
      this.isInitialized = false;
    }
  }
  
  // Initialize with existing neurons from the scene
  initializeWithExistingNeurons() {
    if (!this.isInitialized) return;
    
    try {
      if (window.circles && window.circles.length > 0) {
        this.log(`Adding ${window.circles.length} existing neurons to simulation worker`);
        
        // Add all existing neurons to the simulation worker
        window.circles.forEach(circle => {
          if (circle.neuron) {
            this.addNeuron(circle.neuron);
          }
        });
        
        // Add all existing connections to the simulation worker
        if (window.connectionManager && window.connectionManager.connections) {
          this.log(`Adding existing connections to simulation worker`);
          
          window.connectionManager.connections.forEach((connection, id) => {
            if (connection.source && connection.target && 
                connection.source.neuron && connection.target.neuron) {
              
              this.addConnection({
                id: id,
                sourceId: connection.source.neuron.id,
                targetId: connection.target.neuron.id,
                weight: connection.weight || 0.5,
                delay: connection.delay || 0,
                speed: connection.speed || 0.5
              });
            }
          });
        }
      }
    } catch (error) {
      Logger.error('Error initializing with existing neurons:', error);
    }
  }
  
  // Handle messages from simulation worker
  handleSimulationMessage(event) {
    const message = event.data;
    
    switch (message.type) {
      case 'firingEvents':
        this.handleFiringEvents(message.events);
        break;
        
      case 'stateUpdate':
        // Update local state with worker state
        message.neurons.forEach(neuron => {
          this.neuronState.set(neuron.id, neuron);
        });
        break;
        
      case 'syncComplete':
        this.log(`Simulation sync complete: ${performance.now() - message.time}ms`);
        break;
    }
  }
  
  // Handle messages from audio worker
  handleAudioMessage(event) {
    const message = event.data;
    
    switch (message.type) {
      case 'playSound':
        // Queue the sound event for processing
        this.pendingAudioEvents.push(message.event);
        break;
        
      case 'stats':
        this.stats.audioQueueLength = message.queueLength;
        this.stats.audioEventsPerSecond = message.totalProcessed;
        break;
    }
  }
  
  // Handle firing events from simulation worker
  handleFiringEvents(events) {
    events.forEach(event => {
      // Update visual state for neuron
      if (window.circles) {
        const neuronVisual = window.circles.find(c => c.neuron && c.neuron.id === event.neuronId);
        if (neuronVisual) {
          // Flash the neuron
          this.flashNeuron(neuronVisual);
          
          // Create particle effects on main thread
          event.connections.forEach(conn => {
            const targetNeuron = window.circles.find(c => c.neuron && c.neuron.id === conn.targetId);
            if (targetNeuron) {
              this.createParticle(neuronVisual, targetNeuron, conn.weight, conn.speed);
            }
          });
        }
      }
      
      // Forward to audio worker with neuron sound parameters
      let params = {};
      if (this.soundManager && typeof this.soundManager.getNeuronSoundParameters === 'function') {
        params = this.soundManager.getNeuronSoundParameters(event.neuronId) || {};
      }
      
      this.audioWorker.postMessage({
        type: 'neuronFired',
        neuronId: event.neuronId,
        timestamp: event.timestamp,
        weight: event.connections.length > 0 ? event.connections[0].weight : 0.5,
        speed: event.connections.length > 0 ? event.connections[0].speed : 0.5,
        hasDC: event.hasDC,
        parameters: params
      });
    });
  }
  
  // Process audio events on main thread
  processAudioEvents() {
    const processFrame = () => {
      if (this.pendingAudioEvents.length > 0) {
        // Process a limited number of events per frame to maintain UI responsiveness
        const maxEventsPerFrame = 5;
        const eventsToProcess = this.pendingAudioEvents.splice(0, maxEventsPerFrame);
        
        eventsToProcess.forEach(event => {
          if (this.soundManager && typeof this.soundManager.playNeuronFiring === 'function') {
            this.soundManager.playNeuronFiring(
              event.weight || 0.5,
              event.speed || 0.5,
              event.neuronId,
              false,
              event.hasDC
            );
          }
        });
      }
      
      requestAnimationFrame(processFrame);
    };
    
    processFrame();
  }
  
  // Flash a neuron visual in the 3D scene
  flashNeuron(neuronVisual) {
    if (!neuronVisual || !neuronVisual.material) return;
    
    const originalColor = neuronVisual.material.color.clone();
    const flashColor = new THREE.Color(1, 1, 1);
    
    // Keep track of original color
    if (!neuronVisual.originalColor) {
      neuronVisual.originalColor = originalColor.clone();
    }
    
    // Flash white, then return to original
    neuronVisual.material.color.copy(flashColor);
    
    setTimeout(() => {
      if (neuronVisual && neuronVisual.material) {
        neuronVisual.material.color.copy(originalColor);
      }
    }, 50);
  }
  
  // Create a particle to visualize neuron signal
  createParticle(sourceNeuron, targetNeuron, weight = 0.5, speed = 0.5) {
    // Make sure we have the scene
    if (!window.scene) return;
    
    // Check if we have the optimized particle system
    if (window.particleSystem && typeof window.particleSystem.createParticle === 'function') {
      // Get source and target positions
      const sourcePos = sourceNeuron.position.clone();
      sourcePos.y = 0.05; // Raise slightly above the neuron
      
      const targetPos = targetNeuron.position.clone();
      targetPos.y = 0.05;
      
      // Use the optimized particle system
      window.particleSystem.createParticle(
        sourcePos,
        targetPos,
        sourceNeuron.neuron.id,
        targetNeuron.neuron.id,
        weight,
        speed
      );
      
      Logger.debug(`[WorkerManager] Created particle via OptimizedParticleSystem`);
    } else {
      Logger.warn('[WorkerManager] OptimizedParticleSystem not available');
    }
  }
  
  // Update particles is no longer needed as the OptimizedParticleSystem handles its own updates
  updateParticles(deltaTime) {
    // Forward to optimized particle system if available
    if (window.particleSystem && typeof window.particleSystem.update === 'function') {
      window.particleSystem.update(deltaTime);
    }
  }
  
  // Add a neuron to the simulation
  addNeuron(neuron) {
    if (!this.isInitialized) return;
    
    const neuronData = {
      id: neuron.id,
      type: neuron.type || 'LIF',
      threshold: neuron.threshold,
      restingPotential: neuron.restingPotential,
      currentPotential: neuron.currentPotential,
      refractoryPeriod: neuron.refractoryPeriod,
      dcInput: neuron.dcInput || 0,
      decayRate: neuron.decayRate,
      position: {
        x: neuron.position ? neuron.position.x : 0,
        y: neuron.position ? neuron.position.y : 0,
        z: neuron.position ? neuron.position.z : 0
      },
      oscillatorFrequency: neuron.oscillatorFrequency || 10
    };
    
    this.neuronState.set(neuron.id, neuronData);
    
    this.simulationWorker.postMessage({
      type: 'addNeuron',
      neuron: neuronData
    });
  }
  
  // Update a neuron's properties
  updateNeuron(neuronId, properties) {
    if (!this.isInitialized) return;
    
    // Update local state
    if (this.neuronState.has(neuronId)) {
      const neuron = this.neuronState.get(neuronId);
      Object.assign(neuron, properties);
    }
    
    // Send to worker
    this.simulationWorker.postMessage({
      type: 'updateNeuron',
      neuronId,
      properties
    });
  }
  
  // Remove a neuron from the simulation
  removeNeuron(neuronId) {
    if (!this.isInitialized) return;
    
    this.neuronState.delete(neuronId);
    
    this.simulationWorker.postMessage({
      type: 'removeNeuron',
      neuronId
    });
  }
  
  // Set DC input for a neuron
  setDCInput(neuronId, value) {
    if (!this.isInitialized) return;
    
    // Update local state
    if (this.neuronState.has(neuronId)) {
      const neuron = this.neuronState.get(neuronId);
      neuron.dcInput = Math.max(0, Math.min(1, value));
    }
    
    // Send to worker
    this.simulationWorker.postMessage({
      type: 'setDCInput',
      neuronId,
      value
    });
  }
  
  // Add a connection to the simulation
  addConnection(connection) {
    if (!this.isInitialized) return;
    
    try {
      // Only send to the simulation worker - avoid any disruptions to the main thread
      this.simulationWorker.postMessage({
        type: 'addConnection',
        connection: connection
      });
      
      // Store in local state
      this.connectionState.set(connection.id, connection);
      
      this.log(`Added connection from ${connection.sourceId} to ${connection.targetId}`);
    } catch (error) {
      Logger.error('Error adding connection to worker:', error);
    }
  }
  
  // Update a connection's properties
  updateConnection(connectionId, properties) {
    if (!this.isInitialized) return;
    
    // Update local state
    if (this.connectionState.has(connectionId)) {
      const connection = this.connectionState.get(connectionId);
      Object.assign(connection, properties);
    }
    
    // Send to worker
    this.simulationWorker.postMessage({
      type: 'updateConnection',
      connectionId,
      properties
    });
  }
  
  // Remove a connection from the simulation
  removeConnection(connectionId) {
    if (!this.isInitialized) return;
    
    this.connectionState.delete(connectionId);
    
    this.simulationWorker.postMessage({
      type: 'removeConnection',
      connectionId
    });
  }
  
  // Sync state between main thread and workers
  syncState() {
    if (!this.isInitialized) return;
    
    this.lastSyncTime = performance.now();
    
    // Send current state to simulation worker
    this.simulationWorker.postMessage({
      type: 'sync',
      neurons: Array.from(this.neuronState.values()),
      connections: Array.from(this.connectionState.values()),
      time: this.lastSyncTime
    });
  }
  
  // Pause both workers
  pause() {
    if (!this.isInitialized) return;
    
    this.simulationWorker.postMessage({ type: 'pause' });
    this.audioWorker.postMessage({ type: 'pause' });
  }
  
  // Resume both workers
  resume() {
    if (!this.isInitialized) return;
    
    this.simulationWorker.postMessage({ type: 'resume' });
    this.audioWorker.postMessage({ type: 'resume' });
  }
  
  // Set simulation rate
  setSimulationRate(rate) {
    if (!this.isInitialized) return;
    
    this.simulationWorker.postMessage({
      type: 'updateRate',
      rate
    });
  }
  
  // Update audio settings
  updateAudioSettings(settings) {
    if (!this.isInitialized) return;
    
    this.audioWorker.postMessage({
      type: 'updateSettings',
      settings
    });
  }
  
  // Get current statistics
  getStats() {
    return this.stats;
  }
  
  // Clean up resources
  cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.simulationWorker) {
      this.simulationWorker.terminate();
      this.simulationWorker = null;
    }
    
    if (this.audioWorker) {
      this.audioWorker.terminate();
      this.audioWorker = null;
    }
    
    this.isInitialized = false;
    this.neuronState.clear();
    this.connectionState.clear();
    this.pendingAudioEvents = [];
  }
  
  // Helper for logging
  log(message) {
    if (this.enableDebugLogging) {
      Logger.debug(`[WorkerManager] ${message}`);
    }
  }
} 