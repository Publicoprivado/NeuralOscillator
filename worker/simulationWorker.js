// simulationWorker.js
// Worker script for neuron simulation calculations

// Simulation state
const neurons = new Map();
const connections = new Map();
let simulationTime = 0;
let lastUpdateTime = 0;
let isRunning = true;
let updateInterval = null;
let simulationRate = 16; // milliseconds between updates (60fps)

// Neuron parameters
const NEURON_DEFAULTS = {
  threshold: 30,
  restingPotential: 0,
  refractoryPeriod: 50,
  decayRate: 0.01,
  baseScale: 0.2,
  maxScale: 0.5
};

// Initialize worker
self.onmessage = function(e) {
  const message = e.data;
  
  switch (message.type) {
    case 'init':
      console.log('[SimulationWorker] Initialized');
      startSimulation();
      break;
      
    case 'addNeuron':
      addNeuron(message.neuron);
      break;
      
    case 'updateNeuron':
      updateNeuron(message.neuronId, message.properties);
      break;
      
    case 'removeNeuron':
      removeNeuron(message.neuronId);
      break;
      
    case 'addConnection':
      addConnection(message.connection);
      break;
      
    case 'updateConnection':
      updateConnection(message.connectionId, message.properties);
      break;
      
    case 'removeConnection':
      removeConnection(message.connectionId);
      break;
      
    case 'setDCInput':
      if (neurons.has(message.neuronId)) {
        const neuron = neurons.get(message.neuronId);
        neuron.dcInput = Math.max(0, Math.min(1, message.value));
      }
      break;
      
    case 'externalInput':
      if (neurons.has(message.neuronId)) {
        const neuron = neurons.get(message.neuronId);
        neuron.currentPotential += message.value;
        checkFiring(neuron);
      }
      break;
      
    case 'pause':
      isRunning = false;
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      break;
      
    case 'resume':
      isRunning = true;
      lastUpdateTime = performance.now();
      startSimulation();
      break;
      
    case 'updateRate':
      simulationRate = message.rate;
      if (isRunning) {
        clearInterval(updateInterval);
        startSimulation();
      }
      break;
      
    case 'sync':
      // Receive full state from main thread
      message.neurons.forEach(n => {
        if (!neurons.has(n.id)) {
          addNeuron(n);
        } else {
          updateNeuron(n.id, n);
        }
      });
      
      message.connections.forEach(c => {
        if (!connections.has(c.id)) {
          addConnection(c);
        } else {
          updateConnection(c.id, c);
        }
      });
      
      // Send confirmation
      self.postMessage({
        type: 'syncComplete',
        time: performance.now()
      });
      break;
  }
};

// Start the simulation loop
function startSimulation() {
  if (updateInterval) clearInterval(updateInterval);
  
  updateInterval = setInterval(() => {
    if (!isRunning) return;
    
    const now = performance.now();
    const deltaTime = now - lastUpdateTime;
    simulationTime += deltaTime;
    lastUpdateTime = now;
    
    updateSimulation(deltaTime);
  }, simulationRate);
}

// Update the simulation state
function updateSimulation(deltaTime) {
  const firingEvents = [];
  
  // Update all neurons
  neurons.forEach(neuron => {
    // Skip neurons in refractory period
    if (neuron.inRefractoryPeriod) {
      if (simulationTime >= neuron.refractoryEndTime) {
        neuron.inRefractoryPeriod = false;
        neuron.currentPotential = neuron.restingPotential;
      } else {
        return;
      }
    }
    
    // Handle DC input
    if (neuron.dcInput > 0) {
      if (neuron.type === 'oscillator') {
        // Oscillator mode - fire at regular intervals based on frequency
        const period = 1000 / (neuron.oscillatorFrequency * neuron.dcInput);
        if (simulationTime - neuron.lastOscillatorFire >= period) {
          neuron.lastOscillatorFire = simulationTime;
          
          // Create firing event
          const event = createFiringEvent(neuron);
          if (event) {
            firingEvents.push(event);
          }
        }
      } else {
        // Regular neuron with DC input
        // Reduced for more subtle control at low DC values
        neuron.currentPotential += neuron.dcInput * (deltaTime * 0.025);
        checkFiring(neuron, firingEvents);
      }
    }
    
    // Decay current potential
    neuron.currentPotential = neuron.currentPotential + 
      (neuron.restingPotential - neuron.currentPotential) * neuron.decayRate * (deltaTime * 0.05);
    
    checkFiring(neuron, firingEvents);
  });
  
  // Process delayed signals
  processDelayedSignals(firingEvents);
  
  // Send updates to main thread
  if (firingEvents.length > 0) {
    self.postMessage({
      type: 'firingEvents',
      events: firingEvents,
      time: simulationTime
    });
  }
  
  // Periodically send full state update (every 1000ms)
  if (simulationTime % 1000 < simulationRate) {
    self.postMessage({
      type: 'stateUpdate',
      neurons: Array.from(neurons.values()),
      time: simulationTime
    });
  }
}

// Check if a neuron should fire
function checkFiring(neuron, firingEvents = []) {
  if (neuron.currentPotential >= neuron.threshold && !neuron.inRefractoryPeriod) {
    const event = createFiringEvent(neuron);
    if (event && firingEvents) {
      firingEvents.push(event);
    }
  }
}

// Create a firing event for a neuron
function createFiringEvent(neuron) {
  if (neuron.inRefractoryPeriod) return null;
  
  // Reset potential and enter refractory period
  neuron.currentPotential = neuron.restingPotential;
  neuron.inRefractoryPeriod = true;
  neuron.refractoryEndTime = simulationTime + neuron.refractoryPeriod;
  
  // Get outgoing connections
  const outgoing = [];
  connections.forEach(conn => {
    if (conn.sourceId === neuron.id) {
      outgoing.push({
        connectionId: conn.id,
        targetId: conn.targetId,
        weight: conn.weight,
        delay: conn.delay,
        speed: conn.speed || 0.5
      });
    }
  });
  
  return {
    neuronId: neuron.id,
    timestamp: simulationTime,
    connections: outgoing,
    hasDC: neuron.dcInput > 0
  };
}

// Process signals that are propagating along connections with delay
function processDelayedSignals(firingEvents) {
  // This would handle delayed signal propagation
  // For simplicity, we're assuming signals arrive immediately in this implementation
}

// Add a neuron to the simulation
function addNeuron(neuronData) {
  const neuron = {
    id: neuronData.id,
    type: neuronData.type || 'standard',
    threshold: neuronData.threshold || NEURON_DEFAULTS.threshold,
    restingPotential: neuronData.restingPotential || NEURON_DEFAULTS.restingPotential,
    currentPotential: neuronData.currentPotential || NEURON_DEFAULTS.restingPotential,
    refractoryPeriod: neuronData.refractoryPeriod || NEURON_DEFAULTS.refractoryPeriod,
    decayRate: neuronData.decayRate || NEURON_DEFAULTS.decayRate,
    inRefractoryPeriod: neuronData.inRefractoryPeriod || false,
    refractoryEndTime: neuronData.refractoryEndTime || 0,
    dcInput: neuronData.dcInput || 0,
    baseScale: neuronData.baseScale || NEURON_DEFAULTS.baseScale,
    maxScale: neuronData.maxScale || NEURON_DEFAULTS.maxScale,
    
    // Oscillator specific
    oscillatorFrequency: neuronData.oscillatorFrequency || 5, // Hz
    lastOscillatorFire: 0
  };
  
  neurons.set(neuron.id, neuron);
  
  self.postMessage({
    type: 'neuronAdded',
    neuronId: neuron.id
  });
}

// Update neuron properties
function updateNeuron(neuronId, properties) {
  if (!neurons.has(neuronId)) return;
  
  const neuron = neurons.get(neuronId);
  
  // Update any properties that were provided
  Object.keys(properties).forEach(key => {
    neuron[key] = properties[key];
  });
}

// Remove a neuron
function removeNeuron(neuronId) {
  if (neurons.has(neuronId)) {
    neurons.delete(neuronId);
    
    // Remove any connections involving this neuron
    connections.forEach((conn, id) => {
      if (conn.sourceId === neuronId || conn.targetId === neuronId) {
        connections.delete(id);
      }
    });
    
    self.postMessage({
      type: 'neuronRemoved',
      neuronId: neuronId
    });
  }
}

// Add a connection
function addConnection(connectionData) {
  const connection = {
    id: connectionData.id,
    sourceId: connectionData.sourceId,
    targetId: connectionData.targetId,
    weight: connectionData.weight || 0.5,
    speed: connectionData.speed || 0.5,
    delay: 0 // Will be calculated based on speed
  };
  
  connections.set(connection.id, connection);
  
  self.postMessage({
    type: 'connectionAdded',
    connectionId: connection.id
  });
}

// Update connection properties
function updateConnection(connectionId, properties) {
  if (!connections.has(connectionId)) return;
  
  const connection = connections.get(connectionId);
  
  // Update any properties that were provided
  Object.keys(properties).forEach(key => {
    connection[key] = properties[key];
  });
}

// Remove a connection
function removeConnection(connectionId) {
  if (connections.has(connectionId)) {
    connections.delete(connectionId);
    
    self.postMessage({
      type: 'connectionRemoved',
      connectionId: connectionId
    });
  }
} 