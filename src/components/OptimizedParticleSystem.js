import * as THREE from 'three';

/**
 * OptimizedParticleSystem - High performance particle system using individual billboard meshes
 * Uses efficient pooling and billboarding for best visual quality and performance
 */
export class OptimizedParticleSystem {
  constructor(scene, maxParticles = 2000) {
    // Core scene reference
    this.scene = scene;
    
    // Particle management
    this.maxParticles = maxParticles;
    this.activeParticles = [];
    this.particlePool = [];
    
    // Tracking data
    this.neuronConnections = new Map(); // Maps sourceId_targetId to particle meshes
    
    // Initialize the particle system
    this.initialize();
    
    console.log(`Particle System initialized with ${maxParticles} maximum particles`);
  }
  
  /**
   * Initialize billboard particle system
   */
  initialize() {
    // Create a shared geometry for all particles
    this.geometry = new THREE.PlaneGeometry(0.05, 0.05);
    
    // Create a shared material template - will be cloned for each particle
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    
    console.log('Initialized billboard particle system');
  }
  
  /**
   * Create a particle traveling between two neurons
   * @param {THREE.Vector3} sourcePos - Start position
   * @param {THREE.Vector3} targetPos - End position
   * @param {number} sourceId - Source neuron ID
   * @param {number} targetId - Target neuron ID
   * @param {number} weight - Connection weight (0-1)
   * @param {number} speed - Speed factor (0-1, where 0=stationary, 1=instant)
   * @returns {string} Particle UUID
   */
  createParticle(sourcePos, targetPos, sourceId, targetId, weight = 0.5, speed = 0.5) {
    // Generate connection key for tracking
    const connectionKey = `${sourceId}_${targetId}`;
    
    // Get a mesh from the pool or create a new one
    let mesh;
    if (this.particlePool.length > 0) {
      mesh = this.particlePool.pop();
    } else {
      // Create a new mesh with its own material instance
      const material = this.material.clone();
      mesh = new THREE.Mesh(this.geometry, material);
    }
    
    // Handle speed parameter based on the input synaptic speed
    let actualSpeed;
    if (speed >= 0.999) {
      // Special case: Instant
      actualSpeed = 1.0;
    } else if (speed <= 0.001) {
      // Special case: No movement
      actualSpeed = 0.0001;  // Nearly no movement but keeps animation active
    } else {
      // Map speed from 0-1 to appropriate range for animation
      // Using a more aggressive exponential curve to make differences more obvious
      actualSpeed = 0.005 * Math.pow(1000, speed - 0.5);
    }
    
    // Position mesh at source
    mesh.position.copy(sourcePos);
    
    // Try to get camera for billboarding
    const camera = this.scene.getObjectByProperty('type', 'OrthographicCamera') || 
                   this.scene.getObjectByProperty('type', 'PerspectiveCamera');
                   
    // Set initial orientation to face camera
    if (camera) {
      mesh.lookAt(camera.position);
    } else {
      // Default is a top-down view
      mesh.rotation.x = -Math.PI / 2;
    }
    
    // Set up particle data
    mesh.userData = {
      sourcePos: sourcePos.clone(),
      targetPos: targetPos.clone(),
      sourceId,
      targetId,
      connectionKey,
      progress: 0,
      speed: actualSpeed,
      weight,
      creationTime: Date.now()
    };
    
    // Add to tracking and scene
    this.activeParticles.push(mesh);
    this.scene.add(mesh);
    
    // Track connection
    if (!this.neuronConnections.has(connectionKey)) {
      this.neuronConnections.set(connectionKey, new Set());
    }
    this.neuronConnections.get(connectionKey).add(mesh.uuid);
    
    // Enforce maximum particles limit by removing oldest if needed
    if (this.activeParticles.length > this.maxParticles) {
      this.removeOldestParticle();
    }
    
    console.log(`Created particle from ${sourceId} to ${targetId}, input speed: ${speed}, calculated speed: ${actualSpeed}`);
    
    // For instant travel, immediately complete the particle journey
    if (speed >= 1) {
      // Set to final position
      mesh.position.copy(targetPos);
      mesh.position.y += 0.2; // Maintain height offset
      
      // Trigger arrival event immediately
      window.dispatchEvent(new CustomEvent('particleArrived', {
        detail: { 
          targetNeuronId: targetId,
          sourceNeuronId: sourceId
        }
      }));
      
      // Remove the particle in the next frame to allow for a brief visual flash
      setTimeout(() => {
        if (this.activeParticles.includes(mesh)) {
          this.removeParticle(mesh);
        }
      }, 50);
    }
    
    return mesh.uuid;
  }
  
  /**
   * Find and remove the oldest particle
   */
  removeOldestParticle() {
    if (this.activeParticles.length === 0) return;
    
    let oldestTime = Infinity;
    let oldestIndex = -1;
    
    // Find the oldest particle
    for (let i = 0; i < this.activeParticles.length; i++) {
      const creationTime = this.activeParticles[i].userData.creationTime;
      if (creationTime < oldestTime) {
        oldestTime = creationTime;
        oldestIndex = i;
      }
    }
    
    if (oldestIndex !== -1) {
      const mesh = this.activeParticles[oldestIndex];
      this.removeParticle(mesh);
    }
  }
  
  /**
   * Remove a particle and return it to the pool
   * @param {THREE.Mesh} mesh - The particle mesh to remove
   */
  removeParticle(mesh) {
    // Remove from scene
    this.scene.remove(mesh);
    
    // Remove from active particles list
    const index = this.activeParticles.indexOf(mesh);
    if (index !== -1) {
      this.activeParticles.splice(index, 1);
    }
    
    // Remove from connection tracking
    const connectionKey = mesh.userData.connectionKey;
    if (this.neuronConnections.has(connectionKey)) {
      this.neuronConnections.get(connectionKey).delete(mesh.uuid);
      
      // Clean up empty sets
      if (this.neuronConnections.get(connectionKey).size === 0) {
        this.neuronConnections.delete(connectionKey);
      }
    }
    
    // Return to pool for reuse
    this.particlePool.push(mesh);
  }
  
  /**
   * Update all active particles
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    // Cap delta time to prevent huge jumps if frame rate drops
    const cappedDelta = Math.min(deltaTime, 0.1);
    
    // Track particles to remove
    const particlesToRemove = [];
    
    // Get camera if available in the scene
    const camera = this.scene.getObjectByProperty('type', 'OrthographicCamera') || 
                   this.scene.getObjectByProperty('type', 'PerspectiveCamera');
    
    // Update each active mesh
    for (let i = 0; i < this.activeParticles.length; i++) {
      const mesh = this.activeParticles[i];
      const data = mesh.userData;
      
      // Update progress based on speed and delta time
      data.progress += data.speed * cappedDelta * 60;
      
      // Check if completed
      if (data.progress >= 1.0) {
        particlesToRemove.push(mesh);
        
        // Dispatch arrived event
        window.dispatchEvent(new CustomEvent('particleArrived', {
          detail: { 
            targetNeuronId: data.targetId,
            sourceNeuronId: data.sourceId
          }
        }));
        continue;
      }
      
      // Update position - lerp with arc
      const t = data.progress;
      const sourcePos = data.sourcePos;
      const targetPos = data.targetPos;
      
      // Linear interpolation
      mesh.position.x = sourcePos.x + (targetPos.x - sourcePos.x) * t;
      mesh.position.z = sourcePos.z + (targetPos.z - sourcePos.z) * t;
      
      // Add arc effect
      const arcHeight = 0.6;
      const arc = Math.sin(t * Math.PI);
      mesh.position.y = 0.2 + (arcHeight * arc);
      
      // Pulse size
      const pulseFactor = 0.9 + 0.2 * Math.sin(t * 12);
      const scale = 1.0 * pulseFactor;
      mesh.scale.set(scale, scale, scale);
      
      // Billboard effect - make the plane always face the camera
      if (camera) {
        mesh.lookAt(camera.position);
      } else {
        // Default orientation if no camera found (top-down view)
        mesh.rotation.x = -Math.PI / 2;
      }
    }
    
    // Remove completed particles
    for (const mesh of particlesToRemove) {
      this.removeParticle(mesh);
    }
    
    // Only log occasionally if there are significant changes
    if ((this.activeParticles.length > 10 || particlesToRemove.length > 5) && Math.random() < 0.01) {
      console.log(`Updating ${this.activeParticles.length} particles, removed ${particlesToRemove.length}`);
    }
  }
  
  /**
   * Clean up particles associated with a connection
   * @param {number} sourceId - Source neuron ID
   * @param {number} targetId - Target neuron ID
   */
  removeConnection(sourceId, targetId) {
    const connectionKey = `${sourceId}_${targetId}`;
    
    if (this.neuronConnections.has(connectionKey)) {
      const meshIds = Array.from(this.neuronConnections.get(connectionKey));
      
      for (const meshId of meshIds) {
        // Find the mesh
        const mesh = this.activeParticles.find(m => m.uuid === meshId);
        if (mesh) {
          this.removeParticle(mesh);
        }
      }
      
      // Clear connection
      this.neuronConnections.delete(connectionKey);
      
      console.log(`Removed all particles for connection ${sourceId} → ${targetId}`);
    }
  }
  
  /**
   * Clean up all particles (e.g., during scene reset)
   */
  clearAllParticles() {
    // Remove all active meshes from scene and return to pool
    while (this.activeParticles.length > 0) {
      const mesh = this.activeParticles[0];
      this.removeParticle(mesh);
    }
    
    // Clear connection tracking
    this.neuronConnections.clear();
    
    console.log('Cleared all particles');
  }
  
  /**
   * Find and remove orphaned particles (neurons no longer exist)
   * @param {Array} activeNeuronIds - Array of active neuron IDs
   */
  cleanupOrphanedParticles(activeNeuronIds) {
    // Convert to Set for faster lookups
    const activeIds = new Set(activeNeuronIds);
    const particlesToRemove = [];
    
    // Check each active mesh
    for (const mesh of this.activeParticles) {
      const data = mesh.userData;
      if (!activeIds.has(data.sourceId) || !activeIds.has(data.targetId)) {
        particlesToRemove.push(mesh);
      }
    }
    
    // Remove orphaned particles
    for (const mesh of particlesToRemove) {
      this.removeParticle(mesh);
    }
    
    if (particlesToRemove.length > 0) {
      console.log(`Removed ${particlesToRemove.length} orphaned particles`);
    }
  }
  
  /**
   * Dispose of all resources
   */
  dispose() {
    // Clean up all active particles
    this.clearAllParticles();
    
    // Dispose shared geometry and material
    this.geometry.dispose();
    this.material.dispose();
    
    // Clear particle pool
    for (const mesh of this.particlePool) {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
      if (mesh.material) mesh.material.dispose();
    }
    this.particlePool = [];
    
    console.log('Disposed particle system');
  }
} 