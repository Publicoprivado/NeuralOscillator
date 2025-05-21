import * as THREE from 'three';
import Logger from './utils/logger';

import { initEffectsSystem } from './effects/initEffectsSystem';
import { enableCentralizedNeuralSystem } from './core/integrator';
import { FluidBackgroundEffect } from './FluidBackgroundEffect';
import { OptimizedParticleSystem } from './OptimizedParticleSystem';

export class SceneManager {
    constructor() {
        // Core scene components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // Scene settings
        this.frustumSize = 20; // Match original frustum size from main.js
        this.backgroundColor = 0x000000; // Match original black background
        
        // Stats and metrics
        this.frameCount = 0;
        this.startTime = performance.now();
        this.lastTime = this.startTime;

        // Animation
        this.isAnimating = false;
        this.animationFrameId = null;
        
        // Setup core components
        this.initScene();
        this.initCamera();
        this.initRenderer();
        
        // Initialize fluid background effect first, before any other scene objects
        this.initFluidBackground();
        
        this.setupLighting();
        this.setupEventListeners();
        
        // Initialize particle system before effects system
        this.initParticleSystem();
        
        // Initialize effects system
        this.initEffectsSystem();
        
        // Initialize centralized neural system
        this.initCentralizedNeuralSystem();
    }
    
    initScene() {
        // Create scene with minimal settings matching the original
        this.scene = new THREE.Scene();
        // Make scene background transparent so our fluid shader is visible
        this.scene.background = null;
        
        // Match original scene settings
        this.scene.matrixAutoUpdate = false; // Disable automatic matrix updates
    }
    
    initCamera() {
        // Create orthographic camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.OrthographicCamera(
            -this.frustumSize * aspect / 2,
            this.frustumSize * aspect / 2,
            this.frustumSize / 2,
            -this.frustumSize / 2,
            0.1,
            1000
        );
        
        // Position camera for a top-down view - match original position
        this.camera.position.set(0, 10, 0);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.z = 0;
        this.camera.updateMatrix();
        this.camera.updateMatrixWorld();
    }
    
    initRenderer() {
        // Create WebGL renderer with optimized settings but not too aggressive
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,                 // Disable antialiasing for performance
            powerPreference: 'high-performance', // Request high-performance GPU
            precision: 'mediump',             // Use medium precision for better performance
            logarithmicDepthBuffer: false     // Disable depth buffer for performance
        });
        
        // Set renderer size and pixel ratio - using a fixed ratio for consistency
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1); // Fixed pixel ratio for consistent performance
        
        // Keep sortObjects true to ensure proper rendering order
        this.renderer.sortObjects = true;
        
        // Set dark grey background color with full alpha
        this.renderer.setClearColor(0x111111, 1);
        
        // Append renderer to DOM
        document.body.appendChild(this.renderer.domElement);
        
        // Log for debugging
        console.log('Renderer initialized with dark grey background');
    }
    
    setupLighting() {
        // Better lighting to make connections visible
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        // Add directional light to improve visibility
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
    }
    
    setupEventListeners() {
        const componentId = 'sceneManager';
        
        // Bind the resize handler
        this.handleResize = this.handleResize.bind(this);
        
        // Use eventManager if available
        if (window.eventManager) {
            window.eventManager.registerComponent(componentId, this);
            window.eventManager.addEventListener(window, 'resize', this.handleResize, false, componentId);
        } else {
            // Handle window resize
            window.addEventListener('resize', this.handleResize, false);
        }
    }
    
    handleResize() {
        // Update aspect ratio
        const aspect = window.innerWidth / window.innerHeight;
        
        // Update camera frustum
        this.camera.left = -this.frustumSize * aspect / 2;
        this.camera.right = this.frustumSize * aspect / 2;
        this.camera.top = this.frustumSize / 2;
        this.camera.bottom = -this.frustumSize / 2;
        this.camera.updateProjectionMatrix();
        
        // Update renderer size
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    startAnimation(animateCallback) {
        // Store the callback
        this.animateCallback = animateCallback;
        
        // Bind the animation method
        this._animate = this._animate.bind(this);
        
        // Start the animation
        if (window.timerManager) {
            // Use timerManager for animation frame
            this.animationId = window.timerManager.requestAnimationFrame('sceneManager', this._animate);
        } else {
            // Fallback to direct requestAnimationFrame
            this.animationId = requestAnimationFrame(this._animate);
        }
    }
    
    stopAnimation() {
        if (window.timerManager && this.animationId) {
            window.timerManager.cancelAnimationFrame('sceneManager', this.animationId);
        } else if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.animationId = null;
    }
    
    _animate(timestamp) {
        // Calculate delta time since last frame
        const deltaTime = (timestamp - this.lastTime) / 1000; // convert to seconds
        this.lastTime = timestamp;
        
        // Cap delta time to prevent huge jumps after tab inactivity
        const clampedDeltaTime = Math.min(deltaTime, 0.1);
        
        // Increment frame counter
        this.frameCount++;
        
        // Calculate FPS (every 20 frames to avoid too frequent updates)
        if (this.frameCount % 20 === 0) {
            const elapsedTime = (timestamp - this.startTime) / 1000;
            const fps = Math.round((this.frameCount / elapsedTime) * 10) / 10;
            
            // Update any FPS counter if available
            if (window.uiManager && typeof window.uiManager.updateFPSCounter === 'function') {
                window.uiManager.updateFPSCounter(fps);
            }
        }
        
        // Update the particle system if available - BEFORE rendering
        if (window.particleSystem && typeof window.particleSystem.update === 'function') {
            try {
                window.particleSystem.update(clampedDeltaTime);
            } catch (error) {
                console.error('Error updating particle system:', error);
            }
        }
        
        // Call custom animation callback if provided
        if (this.animateCallback) {
            this.animateCallback(timestamp, clampedDeltaTime, this.frameCount);
        }
        
        // Update fluid background effect if available
        if (this.fluidBackground) {
            // Call render instead of update for the fluid background
            this.fluidBackground.render(this.renderer);
        }
        
        // Render the scene with our camera
        this.renderer.render(this.scene, this.camera);
        
        // Continue animation loop
        if (this.isAnimating) {
            if (window.timerManager) {
                this.animationId = window.timerManager.requestAnimationFrame('sceneManager', this._animate);
            } else {
                this.animationId = requestAnimationFrame(this._animate);
            }
        }
    }
    
    addToScene(object) {
        this.scene.add(object);
    }
    
    removeFromScene(object) {
        this.scene.remove(object);
    }
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
    
    getRenderer() {
        return this.renderer;
    }
    
    initFluidBackground() {
        // Create the fluid background effect
        this.fluidBackground = new FluidBackgroundEffect(this.scene, this.camera);
    }
    
    initParticleSystem() {
        // Create the optimized particle system and make it globally available
        if (this.scene) {
            Logger.debug('[SceneManager] Initializing OptimizedParticleSystem');
            window.particleSystem = new OptimizedParticleSystem(this.scene, 2000);
            Logger.info('[SceneManager] OptimizedParticleSystem initialized with 2000 max particles');
            
            // Clean up any legacy particles
            this.cleanupLegacyParticles();
        }
    }
    
    cleanupLegacyParticles() {
        // Clean up legacy particles to free memory
        if (window.Neuron && window.Neuron.allParticles && window.Neuron.allParticles.length > 0) {
            Logger.info(`[SceneManager] Cleaning up ${window.Neuron.allParticles.length} legacy particles`);
            
            // Remove all legacy particles from the scene
            for (const particle of window.Neuron.allParticles) {
                if (particle && particle.parent) {
                    particle.parent.remove(particle);
                    
                    // Dispose resources
                    if (particle.material) particle.material.dispose();
                    if (particle.geometry) particle.geometry.dispose();
                }
            }
            
            // Clear the array
            window.Neuron.allParticles = [];
            
            Logger.info('[SceneManager] Legacy particles cleaned up');
        }
    }
    
    initEffectsSystem() {
        // Initialize the effects system with our scene
        if (this.scene) {
            Logger.debug('Initializing effects system with scene');
            this.effectsManager = initEffectsSystem(this.scene);
        }
    }
    
    initCentralizedNeuralSystem() {
        // Initialize the centralized neural system with our scene and effects manager
        if (this.scene && this.effectsManager) {
            Logger.debug('Initializing centralized neural system');
            this.neuralSystem = enableCentralizedNeuralSystem(this.scene, this.effectsManager);
            
            // Make it available globally
            window.neuralSystem = this.neuralSystem;
        }
    }
    
    dispose() {
        // Stop the animation first
        this.stopAnimation();
        
        // Clean up event listeners using eventManager if available
        if (window.eventManager) {
            window.eventManager.removeAllForComponent('sceneManager');
        } else {
            // Manually remove event listeners
            window.removeEventListener('resize', this.handleResize, false);
        }
        
        // Clean up the fluid background
        if (this.fluidBackground) {
            // Dispose of fluid background resources
            if (this.fluidBackground.shaderMaterial) {
                this.fluidBackground.shaderMaterial.dispose();
            }
            if (this.fluidBackground.plane && this.fluidBackground.plane.geometry) {
                this.fluidBackground.plane.geometry.dispose();
            }
        }
        
        // Clean up the renderer
        if (this.renderer) {
            if (this.renderer.domElement && this.renderer.domElement.parentNode) {
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
            }
            this.renderer.dispose();
            this.renderer = null;
        }
        
        // Clean up effects system
        if (window.effectsManager) {
            window.effectsManager.dispose();
        }
        
        // Clean up scene - remove all objects and their geometries/materials
        if (this.scene) {
            this.disposeSceneObjects(this.scene);
            this.scene = null;
        }
        
        // Release camera reference
        this.camera = null;
        
        Logger.debug('SceneManager disposed');
    }
    
    disposeSceneObjects(scene) {
        if (!scene) return;
        
        const disposeMaterial = material => {
            if (!material) return;
            
            // Handle arrays of materials
            if (Array.isArray(material)) {
                material.forEach(disposeMaterial);
                return;
            }
            
            // Handle regular materials with textures
            if (material.map) material.map.dispose();
            if (material.lightMap) material.lightMap.dispose();
            if (material.bumpMap) material.bumpMap.dispose();
            if (material.normalMap) material.normalMap.dispose();
            if (material.specularMap) material.specularMap.dispose();
            if (material.envMap) material.envMap.dispose();
            
            // Dispose the material itself
            material.dispose();
        };
        
        // Remove each object from the scene
        while (scene.children.length > 0) {
            const object = scene.children[0];
            scene.remove(object);
            
            // Dispose of geometries and materials
            if (object.geometry) object.geometry.dispose();
            if (object.material) disposeMaterial(object.material);
            
            // Handle recursive children
            if (object.children && object.children.length > 0) {
                this.disposeSceneObjects(object);
            }
        }
    }
}
