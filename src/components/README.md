# Optimized Sound Manager for SNN Visualization

This directory contains two sound manager implementations:

1. **SoundManager** - The original implementation (limited to ~30 neurons with good performance)
2. **OptimizedSoundManager** - A bus-based implementation that can handle 100+ neurons efficiently

## Usage

To use the OptimizedSoundManager in your application, you have two options:

### Option 1: Direct Replacement (Preferred)

Simply replace this line in your code:

```javascript
window.soundManager = new SoundManager(scene, camera, renderer);
```

with:

```javascript
import { OptimizedSoundManager } from './components/OptimizedSoundManager';
window.soundManager = new OptimizedSoundManager(scene, camera, renderer);
```

### Option 2: Using the Factory Function

You can use the provided factory function to automatically choose the appropriate implementation:

```javascript
import { createSoundManager } from './components/index';
window.soundManager = createSoundManager(scene, camera, renderer, {
    useOptimized: true,  // Force optimized version
    expectedNeurons: 100 // Expected number of neurons
});
```

## Implementation Details

The OptimizedSoundManager implements the same interface as the original SoundManager, so it's a drop-in replacement. However, it uses a completely different architecture internally:

1. **Bus-Based Audio Architecture**: Instead of a single effects chain, it uses 7 parallel audio buses:
   - Low/Mid/High Percussion buses
   - Low/Mid/High Tonal buses
   - Selected Neuron bus (high quality)

2. **Voice Management**: Implements a priority-based voice allocation system that can manage 100+ neurons while keeping within the browser's audio limitations.

3. **Parameter Caching**: Keeps per-neuron settings but applies them efficiently to the appropriate bus.

4. **Adaptive Quality**: Uses higher quality for important sounds and lower quality for background elements.

## Key Benefits

- Support for 100+ neurons with good performance
- Each neuron has individual sound characteristics
- Better performance on standard computers
- Prevents audio dropouts
- Maintains browser responsiveness

## How to Choose Which Neurons Get Priority

When many neurons fire simultaneously, the system prioritizes:

1. The currently selected neuron
2. Neurons with DC input
3. Neurons with more connections
4. Neurons that haven't fired recently

You can adjust these priorities in the `calculateNeuronPriority` method. 