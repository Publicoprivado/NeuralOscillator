/**
 * NeuronEngine - Central neural simulation system
 * 
 * Manages all neuron updates within a single, centralized loop.
 * Replaces individual neuron timers with a synchronous update system.
 */

class NeuronEngine {
  constructor() {
    // Core simulation properties
    this.neurons = new Map(); // Map of id -> neuron data
    this.connections = new Map(); // Map of sourceId_targetId -> connection data
    
    // Simulation timing
    this.isRunning = false;
    this.updateInterval = 16; // ~60fps (ms)
    this.updateTimerId = null;
    this.lastUpdateTime = 0;
    this.deltaTime = 0;
    
    // Performance monitoring
    this.frameCount = 0;
    this.startTime = 0;
    this.fps = 60;
    this.isPaused = false;
    
    // System callbacks
    this.onEffectNeeded = null; // Called when visual effects should be created
    this.onSoundNeeded = null; // Called when neuron sounds should be played
    this.onUpdate = null; // Called after each update cycle
    
    // Internal constants
    this.THRESHOLD = 1.0; // Default firing threshold
    
    // Bind methods
    this._update = this._update.bind(this);
  }
  
  /**
   * Initialize the engine
   * @param {Object} options Configuration options
   */
  initialize(options = {}) {
    this.updateInterval = options.updateInterval || 16;
    this.onEffectNeeded = options.onEffectNeeded;
    this.onSoundNeeded = options.onSoundNeeded;
    this.onUpdate = options.onUpdate;
    
    return this;
  }
  
  /**
   * Start the simulation
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = performance.now();
    this.lastUpdateTime = this.startTime;
    
    // Use requestAnimationFrame for better timing
    this.updateTimerId = requestAnimationFrame(this._update);
    
    return this;
  }
  
  /**
   * Pause the simulation
   */
  pause() {
    this.isPaused = true;
    return this;
  }
  
  /**
   * Resume the simulation
   */
  resume() {
    this.isPaused = false;
    return this;
  }
  
  /**
   * Stop the simulation
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.isPaused = false;
    
    if (this.updateTimerId) {
      cancelAnimationFrame(this.updateTimerId);
      this.updateTimerId = null;
    }
    
    return this;
  }
  
  /**
   * Main update loop - processes all neurons
   * @private
   */
  _update(timestamp) {
    if (!this.isRunning) return;
    
    // Calculate delta time
    this.deltaTime = timestamp - this.lastUpdateTime;
    this.lastUpdateTime = timestamp;
    
    // Update FPS counter
    this.frameCount++;
    if (this.frameCount >= 30) {
      const elapsed = (timestamp - this.startTime) / 1000;
      this.fps = Math.round(this.frameCount / elapsed);
      this.frameCount = 0;
      this.startTime = timestamp;
    }
    
    // Skip update if paused
    if (!this.isPaused) {
      // Update all neurons
      this._updateNeurons(this.deltaTime);
      
      // Process any neurons that should fire
      this._processFiringNeurons();
      
      // Call onUpdate callback if provided
      if (typeof this.onUpdate === 'function') {
        this.onUpdate(timestamp, this.deltaTime, this.fps);
      }
    }
    
    // Continue the update loop
    this.updateTimerId = requestAnimationFrame(this._update);
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
  
  /**
   * Process neurons that should fire this frame
   * @private
   */
  _processFiringNeurons() {
    // Collect neurons that should fire
    const firingNeurons = [];
    
    for (const [id, neuron] of this.neurons) {
      if (neuron && neuron.shouldFire && !neuron.isFiring) {
        firingNeurons.push(neuron);
      }
    }
    
    // Process firing for these neurons
    for (const neuron of firingNeurons) {
      this._fireNeuron(neuron);
    }
  }
  
  /**
   * Fire a specific neuron and propagate signals
   * @param {Object} neuron The neuron data object
   * @private
   */
  _fireNeuron(neuron) {
    // Reset firing flag
    neuron.shouldFire = false;
    
    // Set firing state
    neuron.isFiring = true;
    
    // Reset charge
    neuron.currentCharge = 0;
    
    // Add a lastFiredTime to track when we can charge again
    neuron.lastFiredTime = performance.now();
    
    // Trigger visual effect if callback provided
    if (typeof this.onEffectNeeded === 'function') {
      this.onEffectNeeded('fire', neuron);
    }
    
    // Trigger sound if callback provided
    if (typeof this.onSoundNeeded === 'function') {
      this.onSoundNeeded('fire', neuron);
    }
    
    // After short delay, reset firing state
    setTimeout(() => {
      neuron.isFiring = false;
      
      // Trigger visual state update if callback provided
      if (typeof this.onEffectNeeded === 'function') {
        this.onEffectNeeded('update', neuron);
      }
    }, 5);
    
    // Propagate signals to connected neurons
    this._propagateSignals(neuron);
  }
  
  /**
   * Propagate signals from a firing neuron to its connected neurons
   * @param {Object} neuron The source neuron
   * @private
   */
  _propagateSignals(neuron) {
    console.debug(`[NeuronEngine] Propagating signals from neuron ${neuron.id}`);
    console.debug(`[NeuronEngine] Outgoing connections: ${neuron.outgoingConnections.length}`);
    
    if (!neuron.outgoingConnections || neuron.outgoingConnections.length === 0) {
      console.debug(`[NeuronEngine] No outgoing connections for neuron ${neuron.id}`);
      return;
    }
    
    // Process each connection
    for (const targetId of neuron.outgoingConnections) {
      const targetNeuron = this.neurons.get(targetId);
      if (!targetNeuron) {
        console.warn(`[NeuronEngine] Target neuron ${targetId} not found`);
        continue;
      }
      
      console.debug(`[NeuronEngine] Propagating to target ${targetId}`);
      
      // Get connection properties
      const weight = neuron.synapticWeights.get(targetId) || 0.1;
      const speed = neuron.synapticSpeeds.get(targetId) || 0.5;
      
      console.debug(`[NeuronEngine] Connection properties: weight=${weight}, speed=${speed}`);
      
      // *** ADDED: Directly create visual particles if WorkerManager is available ***
      this._createVisualParticle(neuron.id, targetId, weight, speed);
      
      // For speed=1 connections, deliver signal immediately without visual effect
      if (speed === 1) {
        console.debug(`[NeuronEngine] Instant connection - delivering signal immediately without visual effect`);
        this._deliverSignal(targetNeuron, weight);
        continue;
      }
      
      // For very fast connections (0.95-0.99), deliver signal immediately but still show visual effect
      if (speed >= 0.95) {
        console.debug(`[NeuronEngine] Fast connection - delivering signal immediately with visual effect`);
        this._deliverSignal(targetNeuron, weight);
        
        // Still create visual effect
        if (typeof this.onEffectNeeded === 'function') {
          this.onEffectNeeded('signal', {
            sourceNeuron: neuron,
            targetNeuron: targetNeuron,
            weight: weight,
            speed: speed,
            delay: 0
          });
        }
        continue;
      }
      
      // Otherwise calculate delay based on speed and create visual signal
      // Make speed have a more dramatic effect:
      // speed 0.1 (slow) = up to 900ms delay
      // speed 0.9 (fast) = as little as 50ms delay
      const delay = Math.max(50, Math.pow(1 - speed, 2) * 1000);
      console.debug(`[NeuronEngine] Scheduled signal delivery with delay: ${delay.toFixed(0)}ms (speed: ${speed.toFixed(2)})`);
      
      // Trigger signal particle effect if callback provided
      if (typeof this.onEffectNeeded === 'function') {
        this.onEffectNeeded('signal', {
          sourceNeuron: neuron,
          targetNeuron: targetNeuron,
          weight: weight,
          speed: speed,
          delay: delay
        });
      }
      
      // Schedule signal delivery after delay
      setTimeout(() => {
        this._deliverSignal(targetNeuron, weight);
      }, delay);
    }
  }
  
  /**
   * Create a visual particle for signal animation
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} weight Connection weight
   * @param {number} speed Connection speed
   * @private
   */
  _createVisualParticle(sourceId, targetId, weight, speed) {
    // Only proceed if we're in browser environment with window object
    if (typeof window === 'undefined') return;
    
    try {
      // Find the source and target neuron visual objects
      if (window.circles && Array.isArray(window.circles)) {
        const sourceNeuron = window.circles.find(c => c.neuron && c.neuron.id === sourceId);
        const targetNeuron = window.circles.find(c => c.neuron && c.neuron.id === targetId);
        
        if (sourceNeuron && targetNeuron) {
          // If WorkerManager is available, create the particle using its method
          if (window.workerManager && typeof window.workerManager.createParticle === 'function') {
            console.debug(`[NeuronEngine] Creating particle via WorkerManager: ${sourceId} → ${targetId}`);
            window.workerManager.createParticle(sourceNeuron, targetNeuron, weight, speed);
          } 
          // Alternative direct particle creation (backup method)
          else if (window.Neuron && typeof window.Neuron.createParticle === 'function') {
            console.debug(`[NeuronEngine] Creating particle via Neuron.createParticle: ${sourceId} → ${targetId}`);
            window.Neuron.createParticle(sourceNeuron, targetNeuron, weight, speed);
          }
          // Direct method call on sourceNeuron if available
          else if (sourceNeuron.neuron && typeof sourceNeuron.neuron.createAndAnimateSignalParticle === 'function') {
            console.debug(`[NeuronEngine] Creating particle via neuron method: ${sourceId} → ${targetId}`);
            sourceNeuron.neuron.createAndAnimateSignalParticle(targetId, weight, speed, targetNeuron.neuron);
          }
        }
      }
    } catch (error) {
      console.error(`[NeuronEngine] Error creating visual particle:`, error);
    }
  }
  
  /**
   * Deliver a signal to a target neuron
   * @param {Object} targetNeuron The target neuron
   * @param {number} weight The synaptic weight
   * @private
   */
  _deliverSignal(targetNeuron, weight) {
    console.debug(`[NeuronEngine] Delivering signal to neuron ${targetNeuron.id} with weight ${weight}`);
    
    if (!targetNeuron) {
      console.error(`[NeuronEngine] Cannot deliver signal: target neuron is null`);
      return;
    }
    
    if (targetNeuron.isFiring) {
      console.info(`[NeuronEngine] Cannot deliver signal: neuron ${targetNeuron.id} is already firing`);
      return;
    }
    
    const previousCharge = targetNeuron.currentCharge;
    
    // Add charge based on weight with a more pronounced effect
    // Scale weight to make differences more noticeable (0.1 = small charge, 1.0 = large charge)
    // Use a non-linear scaling to make differences more apparent
    const scaledWeight = weight * weight * 1.5; // Weight has a quadratic effect on charge
    targetNeuron.currentCharge += scaledWeight;
    
    console.debug(`[NeuronEngine] Charge update: ${previousCharge.toFixed(2)} -> ${targetNeuron.currentCharge.toFixed(2)} (added ${scaledWeight.toFixed(2)})`);
    
    // Check if threshold reached
    if (targetNeuron.currentCharge >= this.THRESHOLD) {
      console.debug(`[NeuronEngine] Neuron ${targetNeuron.id} reached threshold, scheduling fire`);
      targetNeuron.shouldFire = true;
    }
    
    // Trigger visual update if callback provided
    if (typeof this.onEffectNeeded === 'function') {
      this.onEffectNeeded('update', targetNeuron);
    }
  }
  
  /**
   * Update a neuron's state based on elapsed time
   * @param {Object} neuron The neuron to update
   * @param {number} deltaTime Time since last update in ms
   * @private
   */
  _updateNeuronState(neuron, deltaTime) {
    // Trigger visual update if callback provided
    if (typeof this.onEffectNeeded === 'function') {
      this.onEffectNeeded('update', neuron);
    }
  }
  
  /**
   * Create a new neuron in the simulation
   * @param {Object} data Initial neuron data
   * @returns {Object} The created neuron data object
   */
  createNeuron(data = {}) {
    // Generate unique ID if not provided
    const id = data.id || this.neurons.size + 1;
    
    // Create neuron data object
    const neuron = {
      id: id,
      mesh: data.mesh || null,
      position: data.position || { x: 0, y: 0, z: 0 },
      
      // State
      currentCharge: 0,
      isFiring: false,
      shouldFire: false,
      
      // Properties
      dcInput: data.dcInput || 0,
      baseScale: data.baseScale || 0.2,
      maxScale: data.maxScale || 1,
      originalColor: data.originalColor || 0x0000ff,
      firingColor: data.firingColor || 0xffff00,
      presetColor: data.presetColor || null,
      presetName: data.presetName || null,
      
      // Connections
      outgoingConnections: [], // Array of target IDs
      synapticWeights: new Map(), // Map of targetId -> weight
      synapticSpeeds: new Map(), // Map of targetId -> speed
      
      // Additional properties
      isHarmonyAnchor: data.isHarmonyAnchor || false,
      currentEnvelope: data.currentEnvelope || { attack: 0, sustain: 0, release: 0 }
    };
    
    // Store in neurons map
    this.neurons.set(id, neuron);
    
    console.info(`[NeuronEngine] Created neuron ${id}`);
    return neuron;
  }
  
  /**
   * Remove a neuron from the simulation
   * @param {number} id The neuron ID
   * @returns {boolean} Success
   */
  removeNeuron(id) {
    if (!this.neurons.has(id)) {
      return false;
    }
    
    // Get the neuron
    const neuron = this.neurons.get(id);
    
    // Remove all connections to/from this neuron
    for (const targetId of neuron.outgoingConnections) {
      this.removeConnection(id, targetId);
    }
    
    // Remove incoming connections from other neurons
    for (const [sourceId, sourceNeuron] of this.neurons) {
      if (sourceNeuron.outgoingConnections.includes(id)) {
        this.removeConnection(sourceId, id);
      }
    }
    
    // Remove from neurons map
    this.neurons.delete(id);
    
    console.debug(`[NeuronEngine] Removed neuron ${id}`);
    return true;
  }
  
  /**
   * Create a connection between neurons in the centralized system
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} weight Initial synaptic weight (0-1)
   * @param {number} speed Initial synaptic speed (0-1)
   * @returns {boolean} Success
   */
  createConnection(sourceId, targetId, weight = 0.1, speed = 0.5) {
    console.debug(`[NeuronEngine] Creating connection from ${sourceId} to ${targetId} (weight: ${weight}, speed: ${speed})`);
    
    // Validate neurons exist
    if (!this.neurons.has(sourceId) || !this.neurons.has(targetId)) {
      console.error(`[NeuronEngine] Cannot create connection: neuron not found (source: ${sourceId}, target: ${targetId})`);
      return false;
    }
    
    const sourceNeuron = this.neurons.get(sourceId);
    
    // Add to outgoing connections if not already there
    if (!sourceNeuron.outgoingConnections.includes(targetId)) {
      sourceNeuron.outgoingConnections.push(targetId);
    }
    
    // Set weight and speed
    sourceNeuron.synapticWeights.set(targetId, weight);
    sourceNeuron.synapticSpeeds.set(targetId, speed);
    
    // Store connection key for lookup
    const connectionKey = `${sourceId}_${targetId}`;
    this.connections.set(connectionKey, { sourceId, targetId, weight, speed });
    
    console.info(`[NeuronEngine] Created connection from ${sourceId} to ${targetId}`);
    return true;
  }
  
  /**
   * Remove a connection between neurons
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @returns {boolean} Success
   */
  removeConnection(sourceId, targetId) {
    if (!this.neurons.has(sourceId)) {
      return false;
    }
    
    const sourceNeuron = this.neurons.get(sourceId);
    
    // Remove from outgoing connections
    sourceNeuron.outgoingConnections = sourceNeuron.outgoingConnections.filter(id => id !== targetId);
    
    // Remove weight and speed
    sourceNeuron.synapticWeights.delete(targetId);
    sourceNeuron.synapticSpeeds.delete(targetId);
    
    // Remove from connections map
    const connectionKey = `${sourceId}_${targetId}`;
    this.connections.delete(connectionKey);
    
    console.debug(`[NeuronEngine] Removed connection from ${sourceId} to ${targetId}`);
    return true;
  }
  
  /**
   * Update a connection's weight
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} weight New synaptic weight (0-1)
   * @returns {boolean} Success
   */
  updateConnectionWeight(sourceId, targetId, weight) {
    if (!this.neurons.has(sourceId) || !this.neurons.has(targetId)) {
      return false;
    }
    
    const sourceNeuron = this.neurons.get(sourceId);
    sourceNeuron.synapticWeights.set(targetId, weight);
    
    // Update in connections map
    const connectionKey = `${sourceId}_${targetId}`;
    const connection = this.connections.get(connectionKey);
    if (connection) {
      connection.weight = weight;
    }
    
    return true;
  }
  
  /**
   * Update a connection's speed
   * @param {number} sourceId Source neuron ID
   * @param {number} targetId Target neuron ID
   * @param {number} speed New synaptic speed (0-1)
   * @returns {boolean} Success
   */
  updateConnectionSpeed(sourceId, targetId, speed) {
    if (!this.neurons.has(sourceId) || !this.neurons.has(targetId)) {
      return false;
    }
    
    const sourceNeuron = this.neurons.get(sourceId);
    sourceNeuron.synapticSpeeds.set(targetId, speed);
    
    // Update in connections map
    const connectionKey = `${sourceId}_${targetId}`;
    const connection = this.connections.get(connectionKey);
    if (connection) {
      connection.speed = speed;
    }
    
    return true;
  }
  
  /**
   * Set DC input for a neuron
   * @param {number} neuronId Neuron ID
   * @param {number} value DC input value (0-1)
   * @param {boolean} resetCharge Whether to reset current charge
   * @returns {boolean} Success
   */
  setDCInput(neuronId, value, resetCharge = false) {
    if (!this.neurons.has(neuronId)) {
      return false;
    }
    
    const neuron = this.neurons.get(neuronId);
    
    // Clamp value without rounding
    neuron.dcInput = Math.max(0, Math.min(1, value));
    
    // Reset charge if requested
    if (resetCharge) {
      neuron.currentCharge = 0;
      neuron.isFiring = false;
      neuron.shouldFire = false;
    }
    
    console.debug(`[NeuronEngine] Set DC input for neuron ${neuronId} to ${neuron.dcInput}`);
    return true;
  }
  
  /**
   * Add charge to a neuron
   * @param {number} neuronId Neuron ID
   * @param {number} amount Amount of charge to add
   * @returns {boolean} Success
   */
  addCharge(neuronId, amount) {
    if (!this.neurons.has(neuronId)) {
      return false;
    }
    
    const neuron = this.neurons.get(neuronId);
    
    // Don't add charge if firing
    if (neuron.isFiring) {
      return false;
    }
    
    // Add charge and cap at threshold
    neuron.currentCharge = Math.min(neuron.currentCharge + amount, this.THRESHOLD);
    
    // Check if neuron should fire
    if (neuron.currentCharge >= this.THRESHOLD) {
      neuron.shouldFire = true;
    }
    
    return true;
  }
  
  /**
   * Get a neuron by ID
   * @param {number} neuronId Neuron ID
   * @returns {Object} Neuron data object
   */
  getNeuron(neuronId) {
    return this.neurons.get(neuronId);
  }
  
  /**
   * Get all neurons
   * @returns {Array} Array of neuron data objects
   */
  getAllNeurons() {
    return Array.from(this.neurons.values());
  }
  
  /**
   * Force a neuron to fire
   * @param {number} neuronId Neuron ID
   * @returns {boolean} Success
   */
  fireNeuron(neuronId) {
    if (!this.neurons.has(neuronId)) {
      return false;
    }
    
    const neuron = this.neurons.get(neuronId);
    
    // Don't fire if already firing
    if (neuron.isFiring) {
      return false;
    }
    
    // Set should fire flag
    neuron.shouldFire = true;
    
    return true;
  }
  
  /**
   * Reset a neuron to initial state
   * @param {number} neuronId Neuron ID
   * @returns {boolean} Success
   */
  resetNeuron(neuronId) {
    if (!this.neurons.has(neuronId)) {
      return false;
    }
    
    const neuron = this.neurons.get(neuronId);
    
    // Reset to initial state
    neuron.currentCharge = 0;
    neuron.isFiring = false;
    neuron.shouldFire = false;
    
    return true;
  }
  
  /**
   * Reset all neurons to initial state
   */
  resetAllNeurons() {
    for (const neuron of this.neurons.values()) {
      // Reset to initial state
      neuron.currentCharge = 0;
      neuron.isFiring = false;
      neuron.shouldFire = false;
    }
  }
  
  /**
   * Get all DC neurons
   * @returns {Array} Array of neuron data objects with DC input > 0
   */
  getDCNeurons() {
    return Array.from(this.neurons.values())
      .filter(neuron => neuron.dcInput > 0);
  }
  
  /**
   * Clean up resources and stop the simulation
   */
  dispose() {
    this.stop();
    
    // Clear all timeouts that might be pending
    for (const neuron of this.neurons.values()) {
      neuron.outgoingConnections = [];
      neuron.synapticWeights.clear();
      neuron.synapticSpeeds.clear();
    }
    
    this.neurons.clear();
    this.connections.clear();
    
    console.debug('[NeuronEngine] Disposed');
  }
}

// Create and export a singleton instance
export const neuronEngine = new NeuronEngine();
export default neuronEngine; 