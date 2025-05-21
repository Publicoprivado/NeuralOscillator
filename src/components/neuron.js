import * as THREE from 'three';
import gsap from 'gsap';
import { ensureManagersInitialized } from './utils/initSystemManagers';
import { enableCentralizedNeuralSystem } from './core/integrator';

export class Neuron {
    // Ensure Neuron class is accessible in the global scope
    static {
        if (typeof window !== 'undefined') {
            window.Neuron = Neuron;
        }
    }
    static isScrolling = false;
    static scrollTimeout = null;
    static neuronCount = 0;
    
    // Track window focus state
    static windowHasFocus = true;
    // Track if application is actively running
    static isAppActive = true;
    
    // Track neurons with DC input
    static dcNeurons = new Set();
    
    // Pre-allocate reusable objects
    static tempVector = new THREE.Vector3();
    static tempVector2 = new THREE.Vector3();
    static tempColor = new THREE.Color();

    // Static initialization block
    static {
        // Pre-allocate reusable geometry
        this.particleGeometry = new THREE.PlaneGeometry(0.05, 0.05);
        this.particleGeometry.computeBoundingSphere();
        
        // Global array to track all particles for deletion purposes
        this.allParticles = [];
        
        // Track pending charge deliveries for cleanup when connections are deleted
        this.pendingChargeDeliveries = new Map();
        
        // Track when the last particle cleanup occurred
        this.lastParticleCleanupTime = Date.now();
        
        // Set up periodic particle cleanup to catch any orphaned particles
        // This runs every 5 seconds and removes particles with invalid sources/targets
        if (typeof window !== 'undefined' && window.timerManager) {
            window.timerManager.setInterval('neuron_particle_cleanup', () => {
                // Only run if we have particles to clean up
                if (this.allParticles && this.allParticles.length > 0) {
                    this.cleanupOrphanedParticles();
                }
            }, 5000);
        }
        
        // Ensure the TimerManager is initialized
        ensureManagersInitialized();
        
        // Add event listeners for window focus/blur to handle DC intervals properly
        window.addEventListener('focus', () => {
            console.log('Window gained focus - restoring DC intervals');
            this.windowHasFocus = true;
            this.isAppActive = true;
            
            // Restore DC inputs for all tracked neurons
            this.dcNeurons.forEach(neuron => {
                if (neuron && neuron.dcInput > 0) {
                    // Store the current DC value
                    const dcValue = neuron.dcInput;
                    
                    // Force clear the interval first
                    if (neuron.dcInterval) {
                        if (window.timerManager && neuron.dcParameters?.usingRAF) {
                            window.timerManager.cancelAnimationFrame('neuron_' + neuron.id, neuron.dcInterval);
                        } else if (neuron.dcParameters?.usingRAF) {
                            cancelAnimationFrame(neuron.dcInterval);
                        } else {
                            clearInterval(neuron.dcInterval);
                        }
                        neuron.dcInterval = null;
                    }
                    
                    // Re-establish the DC input with a short delay to ensure proper timing
                    setTimeout(() => {
                        neuron.setDCInput(dcValue, false, true);
                    }, 50);
                }
            });
            
            // Also ensure the audio context resumes
            if (window.Tone && window.Tone.context && window.Tone.context.state === 'suspended') {
                window.Tone.context.resume();
                console.log('Resumed Tone.js audio context');
            }
            // Restore all neuron sound assignments
            if (window.soundManager && typeof window.soundManager.restoreAllNeuronSounds === 'function') {
                window.soundManager.restoreAllNeuronSounds();
            }
        });
        
        window.addEventListener('blur', () => {
            console.log('Window lost focus - stopping all DC intervals and audio');
            this.windowHasFocus = false;
            this.isAppActive = false;
            
            // Stop all DC neurons from firing when window loses focus
            this.dcNeurons.forEach(neuron => {
                if (neuron && neuron.dcInput > 0) {
                    // Force clear the interval to stop firing
                    if (neuron.dcInterval) {
                        if (window.timerManager && neuron.dcParameters?.usingRAF) {
                            window.timerManager.cancelAnimationFrame('neuron_' + neuron.id, neuron.dcInterval);
                        } else if (neuron.dcParameters?.usingRAF) {
                            cancelAnimationFrame(neuron.dcInterval);
                        } else {
                            clearInterval(neuron.dcInterval);
                        }
                        neuron.dcInterval = null;
                    }
                }
            });
            
            // Suspend audio context to stop all sound immediately
            if (window.Tone && window.Tone.context && window.Tone.context.state === 'running') {
                window.Tone.context.suspend();
                console.log('Suspended Tone.js audio context');
            }
            
            // Additionally silence all neurons via SoundManager if available
            if (window.soundManager && typeof window.soundManager.silenceAllNeurons === 'function') {
                window.soundManager.silenceAllNeurons();
                console.log('Silenced all neurons via SoundManager');
            }
        });
        
        // Also add visibilitychange event to handle tab visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('Tab hidden - stopping all DC intervals and audio');
                this.isAppActive = false;
                
                // Stop all DC neurons from firing when tab is hidden
                this.dcNeurons.forEach(neuron => {
                    if (neuron && neuron.dcInput > 0) {
                        // Force clear the interval to stop firing
                        if (neuron.dcInterval) {
                            if (window.timerManager && neuron.dcParameters?.usingRAF) {
                                window.timerManager.cancelAnimationFrame('neuron_' + neuron.id, neuron.dcInterval);
                            } else if (neuron.dcParameters?.usingRAF) {
                                cancelAnimationFrame(neuron.dcInterval);
                            } else {
                                clearInterval(neuron.dcInterval);
                            }
                            neuron.dcInterval = null;
                        }
                    }
                });
                
                // Suspend audio context to stop all sound immediately
                if (window.Tone && window.Tone.context && window.Tone.context.state === 'running') {
                    window.Tone.context.suspend();
                    console.log('Suspended Tone.js audio context due to tab hidden');
                }
            } else {
                console.log('Tab visible again - restoring DC intervals');
                
                // Only restore if the window has focus
                if (this.windowHasFocus) {
                    this.isAppActive = true;
                    
                    // Restore DC inputs for all tracked neurons with a short delay to sync timing
                    setTimeout(() => {
                        this.dcNeurons.forEach(neuron => {
                            if (neuron && neuron.dcInput > 0) {
                                // Store the current DC value
                                const dcValue = neuron.dcInput;
                                
                                // Force clear the interval first
                                if (neuron.dcInterval) {
                                    if (window.timerManager && neuron.dcParameters?.usingRAF) {
                                        window.timerManager.cancelAnimationFrame('neuron_' + neuron.id, neuron.dcInterval);
                                    } else if (neuron.dcParameters?.usingRAF) {
                                        cancelAnimationFrame(neuron.dcInterval);
                                    } else {
                                        clearInterval(neuron.dcInterval);
                                    }
                                    neuron.dcInterval = null;
                                }
                                
                                // Re-establish the DC input
                                neuron.setDCInput(dcValue, false, true);
                            }
                        });
                        
                        // Resume audio context
                        if (window.Tone && window.Tone.context && window.Tone.context.state === 'suspended') {
                            window.Tone.context.resume();
                            console.log('Resumed Tone.js audio context');
                        }
                    }, 50);
                }
            }
        });
        
        // Also add a periodic checker to ensure DC inputs are maintained even during long unfocused periods
        let checkerId = null;
        const startPeriodicChecker = () => {
            // Use TimerManager for better reliability
            if (window.timerManager) {
                checkerId = window.timerManager.setInterval('neuron_dc_checker', () => {
                    // Only run this check if we have focus and the page is visible

                    
                    // Make sure scrolling state gets cleared properly after inactivity
                    if (this.isScrolling) {
                        if (!this.scrollTimeout) {
                            this.scrollTimeout = setTimeout(() => {
                                this.isScrolling = false;
                                this.scrollTimeout = null;
                                console.log("Clearing scrolling state after inactivity");
                            }, 300);
                        }
                    }
                }, 1000);
            } else {
                // Fallback to regular setInterval
                checkerId = setInterval(() => {
                    // Only run this check if we have focus and the page is visible
                    if (this.windowHasFocus && !document.hidden) {
                        this.dcNeurons.forEach(neuron => {
                            if (neuron && neuron.dcInput > 0 && !neuron.dcInterval) {
                                console.log(`Restoring missing DC interval for neuron ${neuron.id}`);
                                neuron.setDCInput(neuron.dcInput, false, true);
                            }
                        });
                    }
                    
                    // Make sure scrolling state gets cleared properly after inactivity
                    if (this.isScrolling) {
                        if (!this.scrollTimeout) {
                            this.scrollTimeout = setTimeout(() => {
                                this.isScrolling = false;
                                this.scrollTimeout = null;
                                console.log("Clearing scrolling state after inactivity");
                            }, 300);
                        }
                    }
                }, 1000);
            }
        };
        
        // Start the checker
        startPeriodicChecker();
    }

    // Shared particle material
    static particleMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
    });

    constructor(mesh) {
        this.id = ++Neuron.neuronCount;
        mesh.position.y = -0.01 + (this.id * 0.1);
        this.mesh = mesh;

        // Constants
        this.threshold = 1;
        this.chargeRate = 0.01;
        this.chargingInterval = 1000;
        this.baseScale = 0.2;
        this.maxScale = 1;
        this.refractionPeriod = 10;
        this.originalColor = 0x0000ff; // Pure Blue
        this.firingColor = 0xffff00; // Pure Yellow
        
        // Add preset colors support
        this.presetColor = null;  // THREE.Color object when a preset is applied
        this.presetName = null;   // Name of the applied preset
        
        // Add envelope details storage here
        this.currentEnvelope = {
            attack: 0,
            sustain: 0,
            release: 0
        };
        
        // State
        this.currentCharge = 0;
        this.lastFiredTime = 0;
        this.isFiring = false;
        this.dcInput = 0;
        this.dcInterval = null;
        
        // Musical harmony settings
        this.isHarmonyAnchor = false; // Added: neurons marked as anchors resist harmonic influence
        
        // Scale management - NEW unified system
        this.scaleState = {
            base: this.baseScale,
            target: this.baseScale,
            current: this.baseScale,
            animation: null,
            animating: false,
            lastUpdate: 0
        };
        
        // Optimized collections
        this.outgoingConnections = new Set();
        this.synapticWeights = new Map();
        this.synapticSpeeds = new Map();
        
        // Animation management
        this.currentAnimation = null;
        this.particleAnimations = new Set();
        this.lastUpdateTime = performance.now();
        
        // Add flag to control external animations
        this.externalAnimationActive = false;
        this.externalAnimationEndTime = 0;
        
        // Add flag to track refractory period for more precise control
        this.inRefractoryPeriod = false;
        this.refractoryEndTime = 0;
        this.lastFiringAttempt = 0; // Track when we last tried to fire
        this.minTimeBetweenFirings = 50; // Minimum 50ms between firing attempts
        
        // Initialize color update tracking
        this.lastColorUpdate = {
            isFiring: false,
            currentCharge: 0,
            colorUpdateNeeded: true // Set to true initially to force first update
        };
    
        // Set initial scale
        this.mesh.scale.setScalar(this.baseScale);
    }

    // Method to temporarily block color updates during external animations
    setExternalAnimation(duration = 500) {
        this.externalAnimationActive = true;
        this.externalAnimationEndTime = performance.now() + duration;
        
        // Set a timeout to reset the flag
        setTimeout(() => {
            this.externalAnimationActive = false;
        }, duration);
        
        return this;
    }

    update() {
        const currentTime = performance.now();

        // Safety check for stuck firing state
        if (this.isFiring && currentTime - this.lastFiredTime > this.refractionPeriod * 2) {
            this.forceReset();
            return;
        }

        // Update refractory period state
        if (this.inRefractoryPeriod && currentTime >= this.refractoryEndTime) {
            this.inRefractoryPeriod = false;
            this.refractoryEndTime = 0;
        }

        // Only check for DC firing if DC input is greater than 0
        if (!this.isFiring && !this.isInRefractoryPeriod() && this.dcInput > 0) {
            // If we're scrolling and the DC interval got lost, restore it
            if ((Neuron.isScrolling || document.hidden) && this.dcInput > 0 && !this.dcInterval) {
                // Re-create charging interval based on stored parameters
                if (this.dcParameters) {
                    // Use the exact same parameters that were calculated before
                    const { chargePerInterval, intervalTime } = this.dcParameters;
                    
                    this.dcInterval = setInterval(() => {
                        if (!this.isFiring && !this.isInRefractoryPeriod()) {
                            this.addCharge(chargePerInterval);
                        }
                    }, intervalTime);
                } else {
                    // If parameters weren't stored for some reason, recreate with current settings
                    this.setDCInput(this.dcInput);
                }
            }
        }

        // Check if we need to update color based on firing state changes
        let colorUpdateNeeded = false;
        
        // Handle firing state and visual effects
        if (!this.externalAnimationActive) {
            if (this.isFiring) {
                const timeSinceFiring = currentTime - this.lastFiredTime;
                if (timeSinceFiring < this.refractionPeriod) {
                    // Only update color if firing state changed
                    if (!this.lastColorUpdate.isFiring) {
                        colorUpdateNeeded = true;
                    }
                } else {
                    // Firing ended
                    this.isFiring = false;
                    this.currentCharge = 0; // Reset charge when firing ends
                    this.inRefractoryPeriod = true;
                    this.refractoryEndTime = currentTime + 50; // 50ms additional refractory period
                    colorUpdateNeeded = true;
                }
            }
        } else if (currentTime > this.externalAnimationEndTime) {
            // Animation expired but flag not reset
            this.externalAnimationActive = false;
            colorUpdateNeeded = true;
        }

        // Mark that we need a color update if state changed
        if (colorUpdateNeeded) {
            this.lastColorUpdate.colorUpdateNeeded = true;
        }

        // Update scale based on state, but only update colors when necessary
        this.updateVisualState();
    }

    // Color updates are now managed through this.lastColorUpdate
    // which is initialized in the constructor
    
    updateVisualState() {
        if (!this.mesh) return;

        // Calculate base scale from DC input with more gradual increase
        const dcScale = this.baseScale + (this.maxScale - this.baseScale) * Math.min(1.0, this.dcInput);
        
        // Calculate charge scale with more controlled growth
        let chargeScale;
        
        // Different scaling approach based on DC input level
        if (this.dcInput > 0.5) {
            // For high DC input, use a milder charge scale factor to prevent excessive growth
            chargeScale = dcScale * (1 + (this.currentCharge / this.threshold) * 0.3);
        } else {
            // For low or no DC input, allow more dramatic charge scaling
            chargeScale = dcScale * (1 + (this.currentCharge / this.threshold) * 0.5);
        }
        
        // Apply absolute maximum scale limit
        const ABSOLUTE_MAX_SCALE = 0.8; // Hard limit on maximum size
        const cappedScale = Math.min(chargeScale, ABSOLUTE_MAX_SCALE);
        
        // Update scale state
        this.scaleState.base = dcScale;
        
        // Apply damping to target scale changes to prevent jitter
        const previousTarget = this.scaleState.target;
        const newTarget = this.isFiring ? this.scaleState.current : cappedScale;
        
        // Apply damping for smoother transitions (reduce by 90%)
        const damping = 0.9;
        this.scaleState.target = previousTarget 
            ? previousTarget + (newTarget - previousTarget) * (1 - damping)
            : newTarget;
        
        // IMPORTANT FIX: Enforce absolute maximum scale to prevent indefinite growth
        this.scaleState.target = Math.min(this.scaleState.target, ABSOLUTE_MAX_SCALE);
        
        // Only apply scale directly if no animation is running
        if (!this.scaleState.animating) {
            // IMPORTANT FIX: Apply the target scale directly, don't allow previous scaling to affect it
            this.mesh.scale.set(this.scaleState.target, this.scaleState.target, this.scaleState.target);
            this.scaleState.current = this.scaleState.target;
        }
        
        // Only check for the explicit flag for color updates - ignoring charge and firing states
        const initialUpdate = this.lastColorUpdate.colorUpdateNeeded;
        
        // Only update colors when explicitly requested (e.g., when instrument changes)
        if (!this.externalAnimationActive && initialUpdate) {
            // If a preset color is available, use it as the base color
            if (this.presetColor) {
                // Just use the preset color directly - no charge or firing state effects
                this.mesh.material.color.copy(this.presetColor);
            } else {
                // Default behavior for non-preset neurons - plain blue
                this.mesh.material.color.setHex(this.originalColor);
            }
            
            // Store current values for next comparison
            this.lastColorUpdate.isFiring = this.isFiring;
            this.lastColorUpdate.currentCharge = this.currentCharge;
            this.lastColorUpdate.colorUpdateNeeded = false;
        }
    }

    fire() {
        // Enforce minimum time between firings to prevent double-firing
        const currentTime = performance.now();
        const timeSinceLastAttempt = currentTime - this.lastFiringAttempt;
        
        // Update last attempt time
        this.lastFiringAttempt = currentTime;
        
        // If we're already firing or in refractory period, don't allow new firing
        if (this.isFiring || this.isInRefractoryPeriod()) {
            return;
        }
        
        // Enforce minimum time between firing attempts (prevents double-firing)
        if (timeSinceLastAttempt < this.minTimeBetweenFirings) {
            return;
        }
        
        // We are now firing!
        this.isFiring = true;
        this.lastFiredTime = currentTime;
        
        // Gather connection data for sound and animation
        const connectionCount = this.outgoingConnections.size;
        let totalWeight = 0;
        let totalSpeed = 0;
        let totalDistance = 0;
    
        for (const targetIndex of this.outgoingConnections) {
            const weight = this.synapticWeights.get(targetIndex) ?? 0.1;
            const speed = this.synapticSpeeds.get(targetIndex) ?? 0.5;
            totalWeight += weight;
            totalSpeed += speed;
            
            if (window.circles?.[targetIndex]) {
                const target = window.circles[targetIndex];
                const dx = target.position.x - this.mesh.position.x;
                const dz = target.position.z - this.mesh.position.z;
                totalDistance += Math.sqrt(dx * dx + dz * dz);
            }
        }
        
        let avgWeight = connectionCount > 0 ? totalWeight / connectionCount : 0.5;
        let avgSpeed = connectionCount > 0 ? totalSpeed / connectionCount : 0.5;
        let avgDistance = connectionCount > 0 ? totalDistance / connectionCount : 0;
        
        // Cap at reasonable values to prevent extreme results
        avgWeight = Math.min(1, Math.max(0.1, avgWeight));
        avgSpeed = Math.min(1, Math.max(0.1, avgSpeed));
        avgDistance = Math.min(20, Math.max(1, avgDistance));
    
        // Update envelope details with minimum values
        this.currentEnvelope = {
            attack: Math.max(0.1, avgWeight ? (0.45 - (avgWeight * 0.45)).toFixed(2) : 0.1),
            sustain: Math.max(0.2, avgWeight ? (avgWeight * 0.3).toFixed(2) : 0.2),
            release: Math.max(0.1, avgDistance < 6 ? 0.1 : (Math.min(avgDistance, 10) / 10 * 0.5).toFixed(2))
        };
    
        // Play sound
        if (window.soundManager && typeof window.soundManager.playNeuronFiring === 'function') {
            window.soundManager.playNeuronFiring(
                avgWeight, 
                avgSpeed, 
                this.id,
                connectionCount === 0,
                this.dcInput > 0,
                avgDistance
            );
        }
        
        // Visual firing animation
        this.animateFiring();
    
        // Process outgoing connections - simple and direct
        for (const targetIndex of this.outgoingConnections) {
            const targetNeuron = window.circles?.[targetIndex]?.neuron;
            if (!targetNeuron) continue;
            
            const weight = this.synapticWeights.get(targetIndex) ?? 0.1;
            const speed = this.synapticSpeeds.get(targetIndex) ?? 0.5;
            
            // High speed (near 1.0) means almost instant delivery
            const delay = speed >= 0.99 ? 0 : Math.max(50, (1 - speed) * 500);
            console.log(`Connection from=${this.id} to=${targetIndex}: speed=${speed.toFixed(2)}, delay=${delay}ms`);
            
            // Create a unique connection identifier
            const connectionId = `${this.id}_${targetNeuron.id}`;
            
            // Clear any existing pending deliveries for this connection
            if (Neuron.pendingChargeDeliveries.has(connectionId)) {
                clearTimeout(Neuron.pendingChargeDeliveries.get(connectionId));
                Neuron.pendingChargeDeliveries.delete(connectionId);
            }
            
            // Store the timeout reference so it can be canceled if the connection is deleted
            const timeoutId = setTimeout(() => {
                // Remove from pending deliveries when executed
                Neuron.pendingChargeDeliveries.delete(connectionId);
                
                // Check if the connection still exists before delivering charge
                if (this.outgoingConnections.has(targetIndex) && targetNeuron) {
                    if (delay === 0) {
                        // Instant delivery without visual effect
                        targetNeuron.addCharge(weight);
                    } else {
                        // Use OptimizedParticleSystem if available, otherwise fall back to legacy system
                        if (window.particleSystem && typeof window.particleSystem.createParticle === 'function') {
                            // Calculate source and target positions
                            const sourcePos = new THREE.Vector3(
                                this.mesh.position.x,
                                0.05,
                                this.mesh.position.z
                            );
                            
                            const targetPos = new THREE.Vector3(
                                window.circles[targetIndex].position.x,
                                0.05,
                                window.circles[targetIndex].position.z
                            );
                            
                            console.log(`Creating optimized particle: from=${this.id} to=${targetIndex}, speed=${speed.toFixed(2)}`);
                            window.particleSystem.createParticle(
                                sourcePos,
                                targetPos,
                                this.id,
                                targetNeuron.id,
                                weight,
                                speed
                            );
                        } else {
                            // Fall back to legacy particle system
                            console.warn(`Falling back to legacy particle system: from=${this.id} to=${targetIndex}, speed=${speed.toFixed(2)}`);
                            this.createAndAnimateSignalParticle(targetIndex, weight, speed, targetNeuron);
                        }
                    }
                }
            }, delay);
            
            // Store in the static map for potential cancellation
            Neuron.pendingChargeDeliveries.set(connectionId, timeoutId);
        }
        
        this.updateVisualState();
    }
    
    // Visual animation for firing, simplified with no color changes
    animateFiring() {
        // No color updates during firing - only update state and trigger refractory period
        
        // Add refractory period after a short delay
        setTimeout(() => {
            // Reset firing state
            this.isFiring = false;
            this.currentCharge = 0;
            
            // Set refractory period
            this.inRefractoryPeriod = true;
            this.refractoryEndTime = performance.now() + 50;
            
            // Only update scale, not color
            this.updateVisualState();
        }, 150);
    }
    
    /**
     * Propagate DC input to connected neurons
     * This is called when the neuron fires and has a non-zero DC input
     */
    // DC doesn't propagate between neurons in a true SNN
    // Removed propagateDC method

    createAndAnimateSignalParticle(targetIndex, weight, speed, targetNeuron) {
        console.log(`Creating signal particle: target=${targetIndex}, weight=${weight.toFixed(2)}, speed=${speed.toFixed(2)}`);
        
        if (!this.mesh || !this.mesh.parent || !window.circles[targetIndex]) return;
        
        // Calculate source and target positions
        const sourcePos = new THREE.Vector3(
            this.mesh.position.x,
            0.05,
            this.mesh.position.z
        );
        
        const targetPos = new THREE.Vector3(
            window.circles[targetIndex].position.x,
            0.05,
            window.circles[targetIndex].position.z
        );
        
        // Handle instant signal for high speeds
        if (speed >= 0.99) {
            console.log(`Speed too high (${speed.toFixed(2)}), skipping particle creation`);
            if (targetNeuron) {
                targetNeuron.addCharge(weight);
            }
            return;
        }
        
        // Create a particle
        // Create a particle traveling from source to target
        const geometry = new THREE.SphereGeometry(0.15, 8, 8); // Increased size from 0.05 to 0.15
        
        // Set particle color based on weight (hue varies with weight)
        const color = new THREE.Color();
        // Create a color based on weight - higher weight = more red/yellow
        color.setHSL(weight * 0.3, 1, 0.5);
        
        const material = new THREE.MeshBasicMaterial({ 
            color,
            transparent: true,
            opacity: 1.0 // Increased opacity from 0.8 to 1.0
        });
        
        const particle = new THREE.Mesh(geometry, material);
        
        // Position at source
        particle.position.copy(sourcePos);
        
        // Store information for animation
        particle.targetPosition = targetPos.clone();
        particle.sourcePosition = sourcePos.clone();
        particle.progress = 0;
        particle.speed = 0.01 + (speed * 0.04); // Scale speed for animation (0.01-0.05)
        particle.sourceNeuronId = this.id;
        particle.targetNeuronId = targetNeuron ? targetNeuron.id : null;
        particle.creationTime = Date.now(); // Store creation time for cleanup
        particle.connectionId = `${this.id}_${targetNeuron ? targetNeuron.id : targetIndex}`; // Store connection ID
        
        // Add to scene and tracking
        if (window.scene) {
            window.scene.add(particle);
            console.log(`Added particle to scene, current particles: ${window.Neuron.allParticles?.length || 0}`);
        } else if (this.mesh.parent) {
            this.mesh.parent.add(particle);
            console.log(`Added particle to mesh.parent, current particles: ${window.Neuron.allParticles?.length || 0}`);
        } else {
            console.warn("Could not add particle to any scene!");
            return;
        }
        
        // Initialize global tracking array if needed
        if (!window.Neuron.allParticles) {
            window.Neuron.allParticles = [];
        }
        
        // Add to global tracking array
        window.Neuron.allParticles.push(particle);
        
        // Calculate delay based on distance and speed for charge delivery
        const distance = sourcePos.distanceTo(targetPos);
        
        // Base delay is proportional to animation time
        // For speed=0.1: particle.speed~0.014 -> ~71 frames to travel (1166ms at 60fps)
        // For speed=0.9: particle.speed~0.046 -> ~22 frames to travel (366ms at 60fps)
        const baseDelay = 500; // ms
        const speedFactor = 1 - speed;
        const delay = baseDelay * speedFactor * (distance / 5);
        
        // Create a unique connection identifier - same format used in the fire method
        const connectionId = `${this.id}_${targetNeuron ? targetNeuron.id : targetIndex}`;
        
        // Clear any existing pending deliveries for this connection
        if (Neuron.pendingChargeDeliveries.has(connectionId)) {
            clearTimeout(Neuron.pendingChargeDeliveries.get(connectionId));
            Neuron.pendingChargeDeliveries.delete(connectionId);
        }
        
        // Store the timeout reference so it can be canceled if the connection is deleted
        const timeoutId = setTimeout(() => {
            // Remove from pending deliveries when executed
            Neuron.pendingChargeDeliveries.delete(connectionId);
            
            // Check if the connection still exists before delivering charge
            if (this.outgoingConnections.has(targetIndex) && targetNeuron) {
                targetNeuron.addCharge(weight);
            }
            
            // Clean up this specific particle if it still exists
            if (particle && particle.parent) {
                particle.parent.remove(particle);
                if (particle.material) particle.material.dispose();
                if (particle.geometry) particle.geometry.dispose();
                
                // Remove from tracking array
                const index = Neuron.allParticles.indexOf(particle);
                if (index !== -1) Neuron.allParticles.splice(index, 1);
            }
        }, delay);
        
        // Store in the static map for potential cancellation
        Neuron.pendingChargeDeliveries.set(connectionId, timeoutId);
        
        // Store the timeout ID directly on the particle for immediate cleanup
        particle.timeoutId = timeoutId;
    }

    setDCInput(value, resetCharge = false, preserveContinuity = true) {
        const previousDC = this.dcInput;
        
        // Just clamp value between 0 and 1, no rounding
        this.dcInput = Math.max(0, Math.min(1, value));
        
        // No longer updating color when DC input changes
        
        // If DC input is 0, reset the neuron and remove from tracking
        if (this.dcInput <= 0) {
            // Always clear interval if DC = 0
            if (this.dcInterval) {
                if (window.timerManager && this.dcParameters?.usingRAF) {
                    window.timerManager.cancelAnimationFrame('neuron_' + this.id, this.dcInterval);
                } else if (this.dcParameters?.usingRAF) {
                    cancelAnimationFrame(this.dcInterval);
                } else {
                    clearInterval(this.dcInterval);
                }
                this.dcInterval = null;
            }
            
            Neuron.dcNeurons.delete(this);
            this.forceReset();
            return;
        }
        
        // CRITICAL IMPROVEMENT: Use the timerManager if available
        // Track this neuron even before we decide whether to recreate the timer
        if (this.dcInput > 0) {
            Neuron.dcNeurons.add(this);
        }
        
        // IMPORTANT: This is a critical part that ensures continuous firing.
        // We'll now avoid recreating the timer in even more cases to maintain rhythm.
        // Only recreate the timer if:
        // 1. No timer exists yet
        // 2. DC was previously 0 (neuron was off)
        // 3. User explicitly requested a reset AND not preserving continuity
        const needsTimerRecreation = !this.dcInterval || 
                                    previousDC === 0 ||
                                    (resetCharge === true && preserveContinuity === false);
        
        // Update visual state immediately 
        this.updateVisualState();
        
        // If we can preserve continuity and already have a timer running, don't recreate it
        if (!needsTimerRecreation) {
            // Just update the dc parameters without stopping the timer
            // Reduced for more subtle control at low DC values
            const baseChargeRate = 0.04;
            const chargePerFrame = baseChargeRate * this.dcInput;
            
            // Update parameters without stopping firing cycle
            if (this.dcParameters) {
                this.dcParameters.chargePerFrame = chargePerFrame;
            } else {
                this.dcParameters = {
                    chargePerFrame: chargePerFrame,
                    usingRAF: true
                };
            }
            
            return; // Exit early to maintain continuity
        }
        
        // If we're here, we need to recreate the timer
        
        // Clear any existing interval if we need to recreate it
        if (this.dcInterval) {
            if (window.timerManager && this.dcParameters?.usingRAF) {
                window.timerManager.cancelAnimationFrame('neuron_' + this.id, this.dcInterval);
            } else if (this.dcParameters?.usingRAF) {
                cancelAnimationFrame(this.dcInterval);
            } else {
                clearInterval(this.dcInterval);
            }
            this.dcInterval = null;
        }
        
        // Only start DC charging if the app is active (window has focus and tab is visible)
        if (this.dcInput > 0 && Neuron.isAppActive) {
            // Set base charge rate - how quickly DC adds charge each frame
            // Reduced for more subtle control at low DC values
            const baseChargeRate = 0.04;
            
            // Calculate charge per frame based on DC input
            const chargePerFrame = baseChargeRate * this.dcInput;
            
            // Reset neuron state only in specific circumstances
            // - If explicitly requested
            // - If DC was previously 0 (neuron was off)
            // - But NOT during normal interaction like selecting or connecting
            if (resetCharge || previousDC === 0) {
                this.currentCharge = 0;
                this.isFiring = false;
                this.lastFiredTime = 0;
                this.inRefractoryPeriod = false;
                this.refractoryEndTime = 0;
            }
            
            // Store parameters for restoration
            this.dcParameters = {
                chargePerFrame: chargePerFrame,
                usingRAF: true
            };
            
            // Create charge update function that's more resilient to errors
            const updateCharge = (timestamp) => {
                // Safety checks
                if (!this.mesh || this.dcInput <= 0) {
                    return false; // Stop the animation loop
                }
                
                try {
                    // Add charge if not firing or in refractory period
                    if (!this.isFiring && !this.isInRefractoryPeriod()) {
                        this.addCharge(this.dcParameters.chargePerFrame); // Use current parameter value
                    }
                } catch (error) {
                    console.error(`Error in DC update for neuron ${this.id}:`, error);
                    // Don't return false here - keep the timer running even if there's an error
                }
                
                return true; // Continue the animation loop
            };
            
            // Use timerManager if available for better reliability
            if (window.timerManager) {
                this.dcInterval = window.timerManager.requestAnimationFrame(
                    'neuron_' + this.id,
                    updateCharge
                );
                
                // Track this neuron in our global list
                Neuron.dcNeurons.add(this);
            } else {
                // Use direct requestAnimationFrame as fallback
                const rafCallback = (timestamp) => {
                    if (updateCharge(timestamp) && this.dcInput > 0) {
                        this.dcInterval = requestAnimationFrame(rafCallback);
                    } else {
                        this.dcInterval = null;
                    }
                };
                this.dcInterval = requestAnimationFrame(rafCallback);
            }
            
            // Register with global tracker
            if (!window.activeDCNeurons) window.activeDCNeurons = new Set();
            window.activeDCNeurons.add(this);
        } else if (this.dcInput > 0) {
            // If app not active, store parameters for later
            // Reduced for more subtle control at low DC values
            const baseChargeRate = 0.04;
            const chargePerFrame = baseChargeRate * this.dcInput;
            
            this.dcParameters = {
                chargePerFrame: chargePerFrame,
                usingRAF: true
            };
        }
    }

    addCharge(amount) {
        // Don't add charge if we're already firing or in refractory period
        if (this.isFiring || this.isInRefractoryPeriod()) {
            return;
        }
        
        // Allow neurons with DC=0 to receive input charges from other neurons
        // The DC is only used for auto-charging, not for receiving signals
    
        const previousCharge = this.currentCharge;
        this.currentCharge = Math.min(this.currentCharge + amount, this.threshold);
    
        // Update visual state when charge changes
        if (this.currentCharge !== previousCharge) {
            // No longer updating color for charge changes
            this.lastColorUpdate.currentCharge = this.currentCharge;
            
            this.updateVisualState();
            
            // Fire event for UI updates
            if (window.dispatchEvent && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('neuronChargeUpdate', { 
                    detail: { 
                        neuronId: this.id, 
                        charge: this.currentCharge,
                        threshold: this.threshold,
                        isFiring: this.isFiring,
                        inRefractory: this.isInRefractoryPeriod(),
                        dcInput: this.dcInput
                    } 
                }));
            }
        }
    
        // Check if threshold reached - fire the neuron
        if (this.currentCharge >= this.threshold && !this.isFiring) {
            this.fire();
        }
    }

    forceReset() {
        // Kill any ongoing animations
        if (this.currentAnimation) {
            this.currentAnimation.kill(null, false);
            this.currentAnimation = null;
        }
        
        // Kill scale animation
        if (this.scaleState.animation) {
            this.scaleState.animation.kill();
            this.scaleState.animation = null;
            this.scaleState.animating = false;
        }
        
        // Reset all state
        this.isFiring = false;
        this.currentCharge = 0;
        this.lastFiredTime = 0;
        
        // Cancel animation frame or clear interval properly
        if (this.dcInterval) {
            if (window.timerManager && this.dcParameters?.usingRAF) {
                window.timerManager.cancelAnimationFrame('neuron_' + this.id, this.dcInterval);
            } else if (this.dcParameters?.usingRAF) {
                cancelAnimationFrame(this.dcInterval);
            } else {
                clearInterval(this.dcInterval);
            }
            this.dcInterval = null;
        }
        
        // Reset visual appearance
        if (this.mesh) {
            // Force color update on next visual state update
            this.lastColorUpdate.colorUpdateNeeded = true;
            this.lastColorUpdate.isFiring = false;
            this.lastColorUpdate.currentCharge = 0;
            
            const baseScale = this.baseScale + (this.maxScale - this.baseScale) * this.dcInput;
            this.mesh.scale.setScalar(baseScale);
            
            // Update scale state
            this.scaleState.base = baseScale;
            this.scaleState.target = baseScale;
            this.scaleState.current = baseScale;
        }
        
        this.updateVisualState();
        
        // Dispatch reset event for UI updates through stateManager if available
        if (window.stateManager) {
            window.stateManager.dispatchEvent('neuronReset', { neuronId: this.id });
        } else if (window.dispatchEvent && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('neuronReset', { 
                detail: { neuronId: this.id } 
            }));
        }
    }

    // Utility methods
    isInRefractoryPeriod() {
        // More accurate refractory period tracking
        // Check both time-based method and explicit flag
        const currentTime = performance.now();
        const timeSinceFiring = currentTime - this.lastFiredTime;
        
        // Return true if either explicit flag is set or traditional time check is true
        return this.inRefractoryPeriod || 
               (this.lastFiredTime > 0 && timeSinceFiring < this.refractionPeriod);
    }

    getNeuronState() {
        return {
            id: this.id,
            charge: this.currentCharge,
            isFiring: this.isFiring,
            isRefractory: this.isInRefractoryPeriod(),
            dcInput: this.dcInput,
            connections: Array.from(this.outgoingConnections),
            weights: Array.from(this.synapticWeights),
            speeds: Array.from(this.synapticSpeeds)
        };
    }

    // Connection management methods
    addConnection(targetIndex, initialWeight = 0.1, initialSpeed = 0.5) {
        // Add connection details
        this.outgoingConnections.add(targetIndex);
        this.synapticWeights.set(targetIndex, initialWeight);
        this.synapticSpeeds.set(targetIndex, initialSpeed);
        
        // NOTE: We don't need to set the color here
        // The ConnectionManager already handles green flashing for both neurons
        // through its flashNeuronGreen function
        
        // IMPORTANT: Track the current DC state before adding the connection
        const hadDCInput = this.dcInput > 0;
        const currentDCValue = this.dcInput;
        
        // Absolutely no reapplying of DC input or resetting of timers
        // This ensures continuous firing without any disruption
        
        // Redundant safety check - if the DC interval was somehow lost during connection,
        // restore it without disrupting the neuron's current state
        if (hadDCInput && currentDCValue > 0 && !this.dcInterval) {
            console.log(`Restoring DC during connection for neuron ${this.id}`);
            // Re-establish DC input while preserving continuity
            this.setDCInput(currentDCValue, false, true);
        }
    }

    updateConnectionWeight(targetIndex, weight) {
        if (this.outgoingConnections.has(targetIndex)) {
            this.synapticWeights.set(targetIndex, weight);
            // No need to reapply DC - maintaining continuity
        }
    }

    updateConnectionSpeed(targetIndex, speed) {
        if (this.outgoingConnections.has(targetIndex)) {
            this.synapticSpeeds.set(targetIndex, speed);
            // No need to reapply DC - maintaining continuity
        }
    }

    removeConnection(targetIndex) {
        // Get the target neuron ID before removing the connection
        const targetNeuron = window.circles?.[targetIndex]?.neuron;
        const sourceId = this.id;
        let targetId = null;
        
        if (targetNeuron) {
            targetId = targetNeuron.id;
            // Cancel any pending charge deliveries for this connection
            const connectionId = `${this.id}_${targetNeuron.id}`;
            if (Neuron.pendingChargeDeliveries.has(connectionId)) {
                clearTimeout(Neuron.pendingChargeDeliveries.get(connectionId));
                Neuron.pendingChargeDeliveries.delete(connectionId);
            }
            
            // Explicitly clean up any particles associated with this connection
            Neuron.cleanupConnectionParticles(sourceId, targetId);
            
            // Log the cleanup
            console.log(`Removing connection: ${sourceId} -> ${targetId}, cleaning up particles`);
        } else {
            console.warn(`Cannot find target neuron at index ${targetIndex} for cleanup`);
        }
        
        // Remove the connection from data structures
        this.outgoingConnections.delete(targetIndex);
        this.synapticWeights.delete(targetIndex);
        this.synapticSpeeds.delete(targetIndex);
        
        // Force another cleanup in case any particles were in the process of being created
        setTimeout(() => {
            if (sourceId && targetId) {
                Neuron.cleanupConnectionParticles(sourceId, targetId);
            }
        }, 100);
        
        // Run orphaned particle cleanup to catch any remaining particles
        setTimeout(() => {
            Neuron.cleanupOrphanedParticles();
        }, 200);
    }

    reset() {
        this.currentCharge = 0;
        this.isFiring = false;
        this.lastFiredTime = 0;
        this.updateVisualState();
    }

    cleanup() {
        const neuronId = this.id;
        const componentId = 'neuron_' + neuronId;
        
        // Use timerManager if available for timer cleanup
        if (window.timerManager) {
            window.timerManager.clearGroup(componentId);
        } else {
            // Clear interval/animation frame the traditional way
            if (this.dcInterval) {
                if (this.dcParameters?.usingRAF) {
                    cancelAnimationFrame(this.dcInterval);
                } else {
                    clearInterval(this.dcInterval);
                }
                this.dcInterval = null;
            }
        }
        
        // Remove from DC neurons tracking
        Neuron.dcNeurons.delete(this);
        
        // Use resourceManager if available
        if (window.resourceManager) {
            // Register THREE.js objects with resourceManager
            if (this.mesh) {
                if (this.mesh.material) {
                    if (Array.isArray(this.mesh.material)) {
                        this.mesh.material.forEach(material => {
                            if (material) {
                                window.resourceManager.registerResource('materials', material, componentId);
                            }
                        });
                    } else {
                        window.resourceManager.registerResource('materials', this.mesh.material, componentId);
                    }
                }
                
                if (this.mesh.geometry) {
                    window.resourceManager.registerResource('geometries', this.mesh.geometry, componentId);
                }
                
                // Register touch area
                if (this.mesh.touchArea) {
                    if (this.mesh.touchArea.material) {
                        window.resourceManager.registerResource('materials', this.mesh.touchArea.material, componentId);
                    }
                    if (this.mesh.touchArea.geometry) {
                        window.resourceManager.registerResource('geometries', this.mesh.touchArea.geometry, componentId);
                    }
                    window.resourceManager.registerResource('objects', this.mesh.touchArea, componentId);
                }
                
                // Register harmony anchor indicator
                if (this.mesh.harmonyAnchorIndicator) {
                    if (this.mesh.harmonyAnchorIndicator.material) {
                        window.resourceManager.registerResource('materials', this.mesh.harmonyAnchorIndicator.material, componentId);
                    }
                    if (this.mesh.harmonyAnchorIndicator.geometry) {
                        window.resourceManager.registerResource('geometries', this.mesh.harmonyAnchorIndicator.geometry, componentId);
                    }
                    window.resourceManager.registerResource('objects', this.mesh.harmonyAnchorIndicator, componentId);
                }
                
                // Register the mesh itself
                window.resourceManager.registerResource('meshes', this.mesh, componentId);
            }
            
            // Let resourceManager dispose all at once
            window.resourceManager.cleanupOwner(componentId, false);
        } else {
            // Traditional resource cleanup
            // Remove from scene if it still exists
            if (this.mesh && this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }
            
            // Dispose of material if it exists
            if (this.mesh && this.mesh.material) {
                // Check if it's an array of materials
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(material => {
                        if (material && material.dispose) {
                            material.dispose();
                        }
                    });
                } else if (this.mesh.material.dispose) {
                    this.mesh.material.dispose();
                }
            }
            
            // Dispose of geometry if it exists
            if (this.mesh && this.mesh.geometry && this.mesh.geometry.dispose) {
                this.mesh.geometry.dispose();
            }
            
            // Remove touch area if it exists
            if (this.mesh.touchArea && this.mesh.touchArea.parent) {
                this.mesh.touchArea.parent.remove(this.mesh.touchArea);
                
                // Dispose of touchArea geometry and material
                if (this.mesh.touchArea.geometry) {
                    this.mesh.touchArea.geometry.dispose();
                }
                if (this.mesh.touchArea.material) {
                    this.mesh.touchArea.material.dispose();
                }
            }
            
            // Remove harmony anchor indicator if it exists
            if (this.mesh && this.mesh.harmonyAnchorIndicator) {
                if (this.mesh.harmonyAnchorIndicator.parent) {
                    this.mesh.harmonyAnchorIndicator.parent.remove(this.mesh.harmonyAnchorIndicator);
                }
                
                // Dispose resources
                if (this.mesh.harmonyAnchorIndicator.geometry) {
                    this.mesh.harmonyAnchorIndicator.geometry.dispose();
                }
                if (this.mesh.harmonyAnchorIndicator.material) {
                    this.mesh.harmonyAnchorIndicator.material.dispose();
                }
                
                // Clear reference
                this.mesh.harmonyAnchorIndicator = null;
            }
        }
        
        // Clean up any particles associated with this neuron
        if (Neuron.allParticles && Neuron.allParticles.length > 0) {
            // Create a copy of the array to safely remove items while iterating
            const particles = [...Neuron.allParticles];
            
            // Check each particle
            particles.forEach(particle => {
                if (!particle || !particle.parent) return;
                
                // If particle is associated with this neuron, remove it
                // We don't have direct association, so check position proximity
                if (this.mesh && particle.position) {
                    const distance = particle.position.distanceTo(this.mesh.position);
                    // If particle is close to this neuron or exactly at its position
                    if (distance < 1.0) {
                        // Remove from scene
                        particle.parent.remove(particle);
                        
                        // Use resourceManager if available
                        if (window.resourceManager) {
                            if (particle.material) {
                                window.resourceManager.registerResource('materials', particle.material, componentId);
                            }
                            if (particle.geometry) {
                                window.resourceManager.registerResource('geometries', particle.geometry, componentId);
                            }
                        } else {
                            // Dispose material manually
                            if (particle.material) particle.material.dispose();
                        }
                        
                        // Remove from global array
                        const index = Neuron.allParticles.indexOf(particle);
                        if (index !== -1) Neuron.allParticles.splice(index, 1);
                    }
                }
            });
            
            // Final cleanup if using resourceManager
            if (window.resourceManager) {
                window.resourceManager.cleanupOwner(componentId, false);
            }
        }
        
        // Clear collections
        this.outgoingConnections.clear();
        this.synapticWeights.clear();
        this.synapticSpeeds.clear();
        
        // IMPORTANT: Clean up sound references in SoundManager
        if (window.soundManager) {
            // If this neuron is selected, deselect it
            if (window.soundManager.selectedNeuronId === this.id) {
                window.soundManager.selectedNeuronId = null;
            }
            
            // Clear any cached sound data for this neuron
            if (window.soundManager.neuronFrequencies) {
                window.soundManager.neuronFrequencies.delete(this.id);
            }
            
            if (window.soundManager.neuronSoundOverrides) {
                window.soundManager.neuronSoundOverrides.delete(this.id);
            }
            
            // Clear pending restorations for this neuron using timerManager if available
            if (window.timerManager && window.soundManager.pendingRestorations && window.soundManager.pendingRestorations.has(this.id)) {
                window.timerManager.clearTimeout('soundManager', window.soundManager.pendingRestorations.get(this.id));
                window.soundManager.pendingRestorations.delete(this.id);
            } else if (window.soundManager.pendingRestorations && window.soundManager.pendingRestorations.has(this.id)) {
                clearTimeout(window.soundManager.pendingRestorations.get(this.id));
                window.soundManager.pendingRestorations.delete(this.id);
            }
            
            // Additional cleanups based on OptimizedSoundManager
            if (window.soundManager.neuronBusAssignments) {
                window.soundManager.neuronBusAssignments.delete(this.id);
            }
            
            if (window.soundManager.voicePriorities) {
                window.soundManager.voicePriorities.delete(this.id);
            }
            
            // Force silence any active sounds that might be playing for this neuron
            try {
                if (typeof window.soundManager.silenceNeuron === 'function') {
                    window.soundManager.silenceNeuron(this.id);
                }
            } catch (error) {
                console.warn('Error silencing neuron during cleanup:', error);
            }
        }
        
        // Notify stateManager that neuron was removed
        if (window.stateManager) {
            window.stateManager.dispatchEvent('neuronRemoved', { neuronId: this.id });
        }
    }

    static updateAllDCNeurons() {
        // Ensure all neurons with DC input have active intervals
        if (Neuron.dcNeurons.size > 0) {
            Neuron.dcNeurons.forEach(neuron => {
                // Check if the neuron's interval is active
                if (neuron.dcInput > 0 && !neuron.dcInterval) {
                    // Reset the DC input to restart the interval but preserve continuity
                    neuron.setDCInput(neuron.dcInput, false, true);
                }
            });
        }
    }

    // Method to create a particle explosion around the neuron
    createParticleExplosion(options = {}) {
        if (!this.mesh || !this.mesh.parent) return;
        
        // Use provided options or defaults
        const numParticles = options.count || 8;
        const particleSize = options.scale || 0.1;
        const particleGeometry = new THREE.PlaneGeometry(particleSize, particleSize);
        const duration = options.duration || 1000; // milliseconds
        const particleSpeed = options.speed || 0.5; // multiplier for animation speed
        
        // Use the provided color, or neuron's preset color, or neuron's actual color
        const particleColor = options.color ? 
            options.color.clone() : 
            (this.presetColor ? 
            this.presetColor.clone() : 
                this.mesh.material.color.clone());
            
        // Brighten the color slightly for better visibility
        particleColor.r = Math.min(1.5, particleColor.r * 1.2);
        particleColor.g = Math.min(1.5, particleColor.g * 1.2);
        particleColor.b = Math.min(1.5, particleColor.b * 1.2);
            
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: particleColor,
            transparent: true,
            opacity: 0.9
        });
        
        for (let i = 0; i < numParticles; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
            const angle = (i / numParticles) * Math.PI * 2;
            const radius = 0.2;
            
            // Position around the neuron in a circle
            particle.position.set(
                this.mesh.position.x + Math.cos(angle) * radius,
                this.mesh.position.y,
                this.mesh.position.z + Math.sin(angle) * radius
            );
            
            // Set rotation to face camera
            particle.rotation.x = -Math.PI / 2;
            
            // Add to scene
            this.mesh.parent.add(particle);
            
            // Animate outward in a straight line - use particleSpeed to control distance and speed
            const animDuration = duration / 1000; // Convert ms to seconds for GSAP
            const distanceFactor = 4 * particleSpeed; // Adjust distance based on speed
            
            gsap.to(particle.position, {
                x: this.mesh.position.x + Math.cos(angle) * (radius * distanceFactor),
                z: this.mesh.position.z + Math.sin(angle) * (radius * distanceFactor),
                duration: animDuration,
                ease: "power2.out"
            });
            
            // Fade out and remove
            gsap.to(particle.material, {
                opacity: 0,
                duration: animDuration,
                ease: "power2.out",
                onComplete: () => {
                    if (particle.parent) {
                        particle.parent.remove(particle);
                    }
                    particle.material.dispose();
                    particle.geometry.dispose();
                }
            });
        }
    }

    /**
     * Static method to create a particle between two neurons
     * This allows direct particle creation from anywhere in the code
     * @param {THREE.Object3D} sourceNeuron Source neuron mesh/object
     * @param {THREE.Object3D} targetNeuron Target neuron mesh/object
     * @param {number} weight Connection weight (0-1)
     * @param {number} speed Connection speed (0-1)
     */
    static createParticle(sourceNeuron, targetNeuron, weight = 0.5, speed = 0.5) {
        if (!sourceNeuron || !targetNeuron || !sourceNeuron.neuron || !targetNeuron.neuron) {
            console.warn("[Neuron.createParticle] Missing neuron parameters:", sourceNeuron, targetNeuron);
            return;
        }
        
        try {
            console.log(`[Neuron.createParticle] Creating particle from ${sourceNeuron.neuron.id} to ${targetNeuron.neuron.id}`);
            
            // Use the optimized particle system if available
            if (window.particleSystem && typeof window.particleSystem.createParticle === 'function') {
                // Calculate source and target positions
                const sourcePos = new THREE.Vector3(
                    sourceNeuron.position.x,
                    0.05,
                    sourceNeuron.position.z
                );
                
                const targetPos = new THREE.Vector3(
                    targetNeuron.position.x,
                    0.05,
                    targetNeuron.position.z
                );
                
                // Use the optimized particle system
                window.particleSystem.createParticle(
                    sourcePos,
                    targetPos,
                    sourceNeuron.neuron.id,
                    targetNeuron.neuron.id,
                    weight,
                    speed
                );
                
                console.log(`[Neuron.createParticle] Created particle via OptimizedParticleSystem`);
            } else {
                // Fallback to worker manager if available
                if (window.workerManager && typeof window.workerManager.createParticle === 'function') {
                    window.workerManager.createParticle(sourceNeuron, targetNeuron, weight, speed);
                    console.log(`[Neuron.createParticle] Created particle via WorkerManager`);
                } else {
                    console.warn("[Neuron.createParticle] No particle system available");
                }
            }
        } catch (error) {
            console.error("[Neuron.createParticle] Error creating particle:", error);
        }
    }

    // Clean up any active particles for a connection being deleted
    static cleanupConnectionParticles(sourceNeuronId, targetNeuronId) {
        // Forward to the optimized particle system if available
        if (window.particleSystem && typeof window.particleSystem.removeConnection === 'function') {
            window.particleSystem.removeConnection(sourceNeuronId, targetNeuronId);
            return;
        }
        
        // If no optimized system, notify but do nothing (legacy code removed)
        console.warn('[Neuron.cleanupConnectionParticles] OptimizedParticleSystem not available');
    }

    // Method to clean up "orphaned" particles that lack valid source or target neurons
    static cleanupOrphanedParticles() {
        // Get all active neurons in the scene from the circles array
        const activeNeuronIds = [];
        if (window.circles) {
            for (const circle of window.circles) {
                if (circle && circle.neuron) {
                    activeNeuronIds.push(circle.neuron.id);
                }
            }
        }
        
        // Forward to the optimized particle system if available
        if (window.particleSystem && typeof window.particleSystem.cleanupOrphanedParticles === 'function') {
            window.particleSystem.cleanupOrphanedParticles(activeNeuronIds);
            return;
        }
        
        // If no optimized system, notify but do nothing (legacy code removed)
        console.warn('[Neuron.cleanupOrphanedParticles] OptimizedParticleSystem not available');
    }
} // End of Neuron class