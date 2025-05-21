# Centralized Neural Simulation System

A complete rewrite of the neural simulation system with a centralized architecture that guarantees stable timing and performance, even during complex operations like connecting neurons.

## Key Features

- **Single Source of Truth**: One central system manages all neuron states
- **Centralized Update Loop**: Single timer that updates all neurons, never loses timing
- **Separation of Concerns**: Complete separation of simulation logic from visual effects
- **Performance Optimized**: No redundant timers, efficient object pooling
- **Stable Timing**: Consistent neural firing patterns even during intensive operations
- **Compatibility Layer**: Can be integrated with existing codebase without complete rewrite

## Architecture

The system consists of three main components:

1. **NeuronEngine**: Core simulation engine that maintains neuron state and handles updates
2. **NeuronAdapter**: Handles visual representation and connects with THREE.js
3. **Integration Layer**: Seamlessly integrates with existing code

## Installation

### Option 1: Quick Integration (Recommended)

1. Add this import to your main.js file:
```javascript
import { enableCentralizedNeuralSystem } from './components/core/integrator';
```

2. After creating your scene and effects manager, add:
```javascript
// Initialize after creating scene
const sceneManager = new SceneManager();
const scene = sceneManager.getScene();

// Initialize effects manager
const effectsManager = new EffectsManager(scene);

// Enable the centralized neural system
enableCentralizedNeuralSystem(scene, effectsManager);
```

### Option 2: Manual Integration (Advanced)

1. Import the components you need:
```javascript
import { neuronEngine, NeuronAdapter } from './components/core';
import { applyCompatibilityPatches } from './components/core/patchExistingCode';
```

2. Initialize the system:
```javascript
// Initialize the engine
neuronEngine.initialize({
  onEffectNeeded: handleEffects,
  onSoundNeeded: handleSounds
});

// Start the engine
neuronEngine.start();

// Create and initialize the adapter
const adapter = new NeuronAdapter(scene);
adapter.initialize(effectsManager);

// Apply compatibility patches
applyCompatibilityPatches();
```

## Testing

You can test the system in isolation using the included tester:

```javascript
// In browser console
import('./components/core/tester.js').then(m => m.runTest());

// To stop the test
import('./components/core/tester.js').then(m => m.stopTest());
```

## API Overview

### NeuronEngine

```javascript
// Create a neuron
const neuron = neuronEngine.createNeuron({
  position: { x: 0, y: 0, z: 0 },
  baseScale: 0.2,
  originalColor: 0x0000ff,
  firingColor: 0xffff00
});

// Create a connection
neuronEngine.createConnection(sourceId, targetId, weight, speed);

// Set DC input
neuronEngine.setDCInput(neuronId, value);

// Add charge
neuronEngine.addCharge(neuronId, amount);

// Force firing
neuronEngine.fireNeuron(neuronId);
```

### NeuronAdapter

```javascript
// Create a neuron with visual representation
const neuron = adapter.createNeuron(mesh, {
  baseScale: 0.2,
  originalColor: 0x0000ff
});

// Create a connection with visual representation
adapter.createConnection(sourceId, targetId, weight, speed);
```

## Troubleshooting

### Performance Issues

If you're experiencing performance issues:

1. Check console for warnings about excessive neurons/connections
2. Use the performance monitoring tools in the browser
3. Consider disabling some visual effects or reducing the number of neurons

### Integration Problems

If the integration is causing issues:

1. Try the manual integration approach for more control
2. Disable the compatibility layer: `enableCentralizedNeuralSystem(scene, effectsManager, { applyPatches: false })`
3. Check for conflicts with other systems (SoundManager, etc.)

## Benefits Over Previous System

- **No Timing Pauses**: Neurons will continue their oscillating patterns, even during connection creation
- **Consistent Performance**: CPU load stays constant regardless of operations
- **Memory Efficient**: Fewer objects, better reuse of resources
- **Guaranteed Synchronization**: All neurons update on the same clock cycle
- **Testable**: Can be tested in isolation from the rest of the codebase

By using this system, you'll eliminate the timer issues that caused neurons to pause their firing patterns during connection creation, resulting in a much more stable and reliable simulation. 