/**
 * Test script for the centralized neural simulation system
 * 
 * This script creates a simple test environment to verify the system works correctly.
 * Run this in the browser console to test the system:
 * 
 * import('./components/core/tester.js').then(m => m.runTest());
 */

import neuronEngine from './NeuronEngine';
import { NeuronAdapter } from './NeuronAdapter';
import * as THREE from 'three';

/**
 * Create a simple test scene with a few neurons
 * @returns {Object} The test scene and objects
 */
function createTestScene() {
  // Create a simple scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;
  
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // Create a few meshes to represent neurons
  const neurons = [];
  const geometry = new THREE.SphereGeometry(0.3, 32, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.position.x = (i - 2) * 1.5;
    scene.add(mesh);
    neurons.push(mesh);
  }
  
  // Animation function
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  
  // Start animation
  animate();
  
  return {
    scene,
    camera,
    renderer,
    neurons
  };
}

/**
 * Run a test of the centralized neural system
 */
export function runTest() {
  // Create test scene
  const { scene, neurons } = createTestScene();
  
  // Initialize the neural engine
  neuronEngine.initialize({
    onEffectNeeded: (type, data) => {
      // Skip non-critical logging
    },
    onSoundNeeded: (type, data) => {
      // Skip non-critical logging
    }
  });
  
  // Start the engine
  neuronEngine.start();
  
  // Create adapter
  const adapter = new NeuronAdapter(scene);
  adapter.initialize();
  
  // Create neurons in the engine
  const engineNeurons = [];
  for (let i = 0; i < neurons.length; i++) {
    const neuron = adapter.createNeuron(neurons[i], {
      originalColor: 0x0000ff,
      firingColor: 0xff0000
    });
    engineNeurons.push(neuron);
  }
  
  // Create some connections
  neuronEngine.createConnection(engineNeurons[0].id, engineNeurons[1].id, 0.5, 0.5);
  neuronEngine.createConnection(engineNeurons[1].id, engineNeurons[2].id, 0.5, 0.5);
  neuronEngine.createConnection(engineNeurons[2].id, engineNeurons[3].id, 0.5, 0.5);
  neuronEngine.createConnection(engineNeurons[3].id, engineNeurons[4].id, 0.5, 0.5);
  neuronEngine.createConnection(engineNeurons[4].id, engineNeurons[0].id, 0.5, 0.5);
  
  // Set DC input for the first neuron
  neuronEngine.setDCInput(engineNeurons[0].id, 0.5);
  
  // Add some charge to the second neuron to make it fire
  setTimeout(() => {
    neuronEngine.addCharge(engineNeurons[1].id, 1.0);
  }, 1000);
  
  // Update DC input after a delay
  setTimeout(() => {
    neuronEngine.setDCInput(engineNeurons[0].id, 0.8);
  }, 2000);
  
  // Remove DC input after a delay
  setTimeout(() => {
    neuronEngine.setDCInput(engineNeurons[0].id, 0);
  }, 5000);
  
  // Force the third neuron to fire
  setTimeout(() => {
    neuronEngine.fireNeuron(engineNeurons[2].id);
  }, 3000);
  
  // Make objects available globally for console interaction
  window.testEngine = neuronEngine;
  window.testAdapter = adapter;
  window.testNeurons = engineNeurons;
  
  return {
    engine: neuronEngine,
    adapter: adapter,
    neurons: engineNeurons,
    scene: scene
  };
}

/**
 * Stop the test
 */
export function stopTest() {
  // Stop the engine
  if (window.testEngine) {
    window.testEngine.stop();
  }
  
  // Clean up the adapter
  if (window.testAdapter) {
    window.testAdapter.dispose();
  }
  
  // Remove the renderer
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.remove();
  }
} 