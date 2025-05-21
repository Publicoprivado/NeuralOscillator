import * as THREE from 'three';
import { gsap } from 'gsap';

export class ConnectionManager {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.connections = new Map();
        
        // Don't create a new SoundManager here, just reference the global one
        this.soundManager = window.soundManager;
        
        // Log if soundManager is available
        console.log('SoundManager available:', !!this.soundManager);
        if (this.soundManager) {
            console.log('WaveformAnalyzer available:', !!this.soundManager.waveformAnalyzer);
            
            // Diagnostic - check structure of sound manager after a brief delay
            setTimeout(() => this.logSoundManagerInfo(), 2000);
        }
        
        // Arrow position caching to prevent flickering
        this.arrowPositionCache = new Map();
        this.lastSourcePositions = new Map();
        this.lastTargetPositions = new Map();
        this.lastSourceDC = new Map();
        this.lastTargetDC = new Map();
        this.lastConnectionSpeed = new Map();
        this.lastConnectionWeight = new Map();
        
        // Core properties
        this.raycaster = new THREE.Raycaster();
        this.raycaster.params.Line.threshold = 10;
        this.mouse = new THREE.Vector2();
        
        // State
        this.isDraggingArrow = false;
        this.isDraggingNeuron = false; // Track neuron dragging state
        this.selectedArrow = null;
        this.selectedConnection = null;
        this.isDraggingBeforeStart = false;
        this.lastTapTime = 0;
        this.doubleTapDelay = 300;
        this.lastTapPosition = { x: 0, y: 0 };
        this.tapDistanceThreshold = 30;
        
        // Long press detection for mobile
        this.longPressTimeout = null;
        this.longPressDelay = 700; // milliseconds
        this.isLongPressing = false;
        this.longPressStartPosition = { x: 0, y: 0 };
        this.longPressThreshold = 15; // pixels of movement allowed

        // Performance
        this.frameCount = 0;
        this.updateInterval = 1;
        this.needsUpdate = true;
        this.lastUpdateTime = 0;
        this.updateThreshold = 1000 / 120;
        
        // Cache
        this.arrowsCache = [];
        this.lastConnectionCount = 0;
        this.cachedRect = this.renderer.domElement.getBoundingClientRect();
        this.lastRectUpdate = 0;
        this.rectUpdateInterval = 1000;
        
        // Waveform properties
        this.waveformResolution = 30; // Doubled from 30 for smoother waveforms
        this.waveformHeight = 5.5; // Increased from 0.75 to 1.5 for more dramatic waveforms
        this.waveformThickness = 0.025; // Tube radius - controls the thickness of the waveform
        this.defaultWaveform = this.generateDefaultWaveform();
        
        // Connection opacity settings
        this.activeOpacity = 0.95;       // Opacity when a connection is fully active
        this.inactiveOpacity = 0.25;      // Opacity when a connection is inactive
        this.fadeDuration = 500;        // Duration of fade out in milliseconds - increased from 300ms for smoother transitions
        
        this.setupGeometry();
        this.setupEventListeners();
        
        // Validation interval
        this.validationInterval = setInterval(() => this.validateConnections(), 5000);

        // In InputManager.js constructor, add this with the other properties
        this.lastDoubleClickTime = 0;

        // Add a flag to track if we're currently creating a neuron to prevent duplicates
        this.isCreatingNeuron = false;
        
        // Track when a connection is being scrolled over
        this.scrollingConnections = new Set();
    }

    // Generate a default flat waveform for when no sound is playing
    generateDefaultWaveform() {
        const points = [];
        for (let i = 0; i < this.waveformResolution; i++) {
            points.push(0);
        }
        return points;
    }

    // Get the current waveform data for a neuron
    getWaveformForNeuron(neuronId) {
        // If sound manager or waveform analyzer is not available, return the default waveform
        if (!window.soundManager || !window.soundManager.waveformAnalyzer) {
            return this.defaultWaveform;
        }
        
        try {
            // Get the current waveform from the analyzer
            const fullWaveform = window.soundManager.waveformAnalyzer.getValue();
            
            // Check if there's any actual signal
            let hasSignal = false;
            if (fullWaveform) {
                for (let i = 0; i < fullWaveform.length; i++) {
                    if (Math.abs(fullWaveform[i]) > 0.01) {
                        hasSignal = true;
                        break;
                    }
                }
            }
            
            if (!fullWaveform || !hasSignal) {
                return this.defaultWaveform;
            }
            
            // Return the raw waveform so we can process it in updateConnectionWaveform
            return fullWaveform;
            
        } catch (error) {
            console.warn('Error getting waveform data:', error);
            return this.defaultWaveform;
        }
    }
    
    // Get waveform directly from SoundManager for a specific neuron
    getDirectWaveform(neuronId) {
        if (!window.soundManager) return null;
        
        try {
            // Check if there's a direct method to get waveform for a neuron
            if (typeof window.soundManager.getWaveformForNeuron === 'function') {
                return window.soundManager.getWaveformForNeuron(neuronId);
            }
            
            // If there's an oscillator for this neuron, try to get its waveform
            if (window.soundManager.oscillators && window.soundManager.oscillators[neuronId]) {
                const oscillator = window.soundManager.oscillators[neuronId];
                if (oscillator && oscillator.waveform) {
                    return oscillator.waveform;
                }
            }
            
            // Fall back to the global analyzer if no neuron-specific data
            if (window.soundManager.waveformAnalyzer) {
                return window.soundManager.waveformAnalyzer.getValue();
            }
        } catch (error) {
            console.warn(`Error getting direct waveform for neuron ${neuronId}:`, error);
        }
        
        return null;
    }

    setupGeometry() {
          // Check if device is mobile
        const isMobile = 'ontouchstart' in window;
        
        // Set size multiplier based on device type
        const sizeMultiplier = isMobile ? 0.5 : 0.5; // 15% larger for mobile
        
        this.arrowShape = new THREE.Shape();
        this.arrowShape.moveTo(1.4 * sizeMultiplier, 0);
        this.arrowShape.lineTo(-0.7 * sizeMultiplier, 1.05 * sizeMultiplier);
        this.arrowShape.lineTo(-0.7 * sizeMultiplier, -1.05 * sizeMultiplier);
        this.arrowShape.lineTo(1.0 * sizeMultiplier, 0);

        const extrudeSettings = {
            steps: 1,
            depth: 0.2,
            bevelEnabled: false
        };
        
        this.arrowGeometry = new THREE.ExtrudeGeometry(this.arrowShape, extrudeSettings);
        this.arrowGeometry.computeBoundingSphere();
        this.arrowGeometry.computeBoundingBox();
        
        this.arrowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, // Change to cyan to match waveforms (was 0xaaaaaa)
            transparent: true,
            opacity: 0.005, // Lower initial opacity
            depthTest: true,
            depthWrite: true,
            precision: 'lowp'
        });
    }

    setupEventListeners() {
        const canvas = this.renderer.domElement;
        
        // Bind methods
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleRightClick = this.handleRightClick.bind(this);

        // Use eventManager for event handling
        if (window.eventManager) {
            const componentId = 'connectionManager';
            
            // Register with event manager
            window.eventManager.registerComponent(componentId, this);
            
            // Mouse events - use throttling for move events
            window.eventManager.addEventListener(canvas, 'mousedown', this.handlePointerDown, {}, componentId);
            window.eventManager.addThrottledEventListener(canvas, 'mousemove', this.handlePointerMove, 16, {}, componentId);
            window.eventManager.addEventListener(canvas, 'mouseup', this.handlePointerUp, {}, componentId);
            // Add passive: false option to allow preventDefault() to work
            window.eventManager.addThrottledEventListener(canvas, 'wheel', this.handleWheel, 50, {passive: false}, componentId);
            
            // Touch events with throttling
            window.eventManager.addEventListener(canvas, 'touchstart', this.handlePointerDown, {passive: false}, componentId);
            window.eventManager.addThrottledEventListener(canvas, 'touchmove', this.handlePointerMove, 16, {passive: false}, componentId);
            window.eventManager.addEventListener(canvas, 'touchend', this.handlePointerUp, {}, componentId);
            
            // Right click/context menu
            window.eventManager.addEventListener(canvas, 'contextmenu', this.handleRightClick, {}, componentId);
            
            // Mouse leave for hiding weight label
            window.eventManager.addEventListener(canvas, 'mouseleave', () => this.hideWeightLabel(), {}, componentId);
        } else {
            // Fallback to direct event listeners if eventManager not available
            // Mouse events
            canvas.addEventListener('mousedown', this.handlePointerDown);
            canvas.addEventListener('mousemove', this.handlePointerMove);
            canvas.addEventListener('mouseup', this.handlePointerUp);
            // Add passive: false option to allow preventDefault() to work
            canvas.addEventListener('wheel', this.handleWheel, { passive: false });
            canvas.addEventListener('mouseleave', () => this.hideWeightLabel());

            // Touch events
            canvas.addEventListener('touchstart', this.handlePointerDown);
            canvas.addEventListener('touchmove', this.handlePointerMove);
            canvas.addEventListener('touchend', this.handlePointerUp);
            
            // Replace the default context menu prevention with our handler
            canvas.addEventListener('contextmenu', this.handleRightClick);
        }
        
        canvas.style.touchAction = 'none';
    }

    updateMousePosition(event) {
        const now = performance.now();
        
        if (now - this.lastRectUpdate > this.rectUpdateInterval) {
            this.cachedRect = this.renderer.domElement.getBoundingClientRect();
            this.lastRectUpdate = now;
        }
        
        if (event.touches) {
            const touch = event.touches[0];
            this.mouse.x = ((touch.clientX - this.cachedRect.left) / this.cachedRect.width) * 2 - 1;
            this.mouse.y = -((touch.clientY - this.cachedRect.top) / this.cachedRect.height) * 2 + 1;
        } else {
            this.mouse.x = ((event.clientX - this.cachedRect.left) / this.cachedRect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - this.cachedRect.top) / this.cachedRect.height) * 2 + 1;
        }
    }


    checkProximityConnection(neuron) {
        if (!neuron || !neuron.position || !neuron.parent) return;

        const circles = window.circles || [];
        circles.forEach(otherNeuron => {
            if (!otherNeuron || !otherNeuron.position || !otherNeuron.parent) return;
            if (neuron === otherNeuron) return;
            
            // Safety check for neuron objects
            if (!neuron.neuron || !otherNeuron.neuron) return;

            const distance = neuron.position.distanceTo(otherNeuron.position);
            const threshold = 0.5;

            // Check for existing connections in both directions
            let sourceToTargetConnection = null;
            let targetToSourceConnection = null;
            let sourceToTargetGroup = null;
            let targetToSourceGroup = null;
            
            this.connections.forEach((connection, group) => {
                if (!connection.source || !connection.target) return;
                
                if (connection.source === neuron && connection.target === otherNeuron) {
                    sourceToTargetConnection = connection;
                    sourceToTargetGroup = group;
                }
                
                if (connection.source === otherNeuron && connection.target === neuron) {
                    targetToSourceConnection = connection;
                    targetToSourceGroup = group;
                }
            });

            // If we have a connection in one direction but not the other,
            // and we're close enough, reverse the connection
            if (distance < threshold) {
                if (sourceToTargetConnection) {
                    // We already have a connection from neuron to otherNeuron
                    // No need to do anything
                    return;
                } else if (targetToSourceConnection) {
                    // We have a connection from otherNeuron to neuron
                    // Reverse it!
                    
                    // Visual feedback
                    const triggerVisualFeedback = (targetNeuron) => {
                        const originalColor = targetNeuron.material.color.clone();
                        const originalScale = targetNeuron.scale.clone();
                        
                        gsap.timeline()
                            .to(targetNeuron.material.color, {
                                r: 1,
                                g: 0.5,
                                b: 0,
                                duration: 0.2
                            }, 0)
                            .to(targetNeuron.material.color, {
                                r: originalColor.r,
                                g: originalColor.g,
                                b: originalColor.b,
                                duration: 0.2
                            }, 0.2);
                    };
                    
                    triggerVisualFeedback(neuron);
                    triggerVisualFeedback(otherNeuron);
                    
                    // Get the existing connection properties
                    const weight = targetToSourceConnection.weight;
                    const speed = targetToSourceConnection.speed;
                    
                    // Remove the connection from target to source
                    const sourceIndex = window.circles.indexOf(neuron);
                    otherNeuron.neuron.removeConnection(sourceIndex);
                    this.disposeConnection(targetToSourceConnection, targetToSourceGroup);
                    
                    // Instead of manually creating a connection, use the existing createConnection method
                    // and then update its properties to match the previous connection
                    const connectionGroup = this.createConnection(neuron, otherNeuron);
                    
                    if (connectionGroup) {
                        const connection = this.connections.get(connectionGroup);
                        if (connection) {
                            connection.weight = weight;
                            connection.speed = speed;
                            
                            // Update the weight and speed in the neuron
                            const targetIndex = window.circles.indexOf(otherNeuron);
                            neuron.neuron.updateConnectionWeight(targetIndex, weight);
                            neuron.neuron.updateConnectionSpeed(targetIndex, speed);
                            
                            // Force an update
                            this.updateConnection(connectionGroup);
                        }
                    }
                    
                    // Play a sound or visual effect to indicate reversal
                    if (window.soundManager && typeof window.soundManager.playSmallSound === 'function') {
                        try {
                            window.soundManager.playSmallSound(0.8, 0.2, 0.2);
                        } catch (error) {
                            console.warn('Error playing connection reversal sound:', error);
                        }
                    }
                    
                    return;
                } else {
                    // No connection in either direction - create a new one
                    const triggerVisualFeedback = (targetNeuron) => {
                        const originalColor = targetNeuron.material.color.clone();
                        const originalScale = targetNeuron.scale.clone();
                        
                        gsap.timeline()
                            .to(targetNeuron.scale, {
                                x: originalScale.x * 1.3,
                                y: originalScale.y * 1.3,
                                z: originalScale.z * 1.3,
                                duration: 0.2,
                                ease: "power2.out"
                            }, 0)
                            .to(targetNeuron.material.color, {
                                r: 0,
                                g: 1,
                                b: 0,
                                duration: 0.2
                            }, 0)
                            .to(targetNeuron.scale, {
                                x: originalScale.x,
                                y: originalScale.y,
                                z: originalScale.z,
                                duration: 0.2,
                                ease: "power2.in"
                            }, 0.2)
                            .to(targetNeuron.material.color, {
                                r: originalColor.r,
                                g: originalColor.g,
                                b: originalColor.b,
                                duration: 0.2
                            }, 0.2);
                    };

                    // Create a particle explosion animation on the target neuron
                    const createParticleExplosion = (neuron) => {
                        if (!neuron || !neuron.position) return;
                        
                        // Create 8 particles in a burst around the neuron
                        const numParticles = 8;
                        const particleGeometry = new THREE.PlaneGeometry(0.1, 0.1);
                        
                        // Create bright cyan material for particles
                        const particleMaterial = new THREE.MeshBasicMaterial({
                            color: new THREE.Color(0, 1.5, 1.5), // Bright cyan
                            transparent: true,
                            opacity: 0.9
                        });
                        
                        for (let i = 0; i < numParticles; i++) {
                            const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
                            const angle = (i / numParticles) * Math.PI * 2;
                            const radius = 0.2;
                            
                            // Position around the neuron in a circle
                            particle.position.set(
                                neuron.position.x + Math.cos(angle) * radius,
                                neuron.position.y,
                                neuron.position.z + Math.sin(angle) * radius
                            );
                            
                            // Set rotation to face camera
                            particle.rotation.x = -Math.PI / 2;
                            
                            // Add to scene
                            this.scene.add(particle);
                            
                            // Animate outward in a straight line
                            gsap.to(particle.position, {
                                x: neuron.position.x + Math.cos(angle) * (radius * 4),
                                z: neuron.position.z + Math.sin(angle) * (radius * 4),
                                duration: 1,
                                ease: "power2.out"
                            });
                            
                            // Fade out and remove
                            gsap.to(particle.material, {
                                opacity: 0,
                                duration: 1,
                                ease: "power2.out",
                                onComplete: () => {
                                    this.scene.remove(particle);
                                    particle.material.dispose();
                                    particle.geometry.dispose();
                                }
                            });
                        }
                    };

                    // Create connection from the dragged neuron to the other
                    triggerVisualFeedback(neuron);
                    triggerVisualFeedback(otherNeuron);
                    
                    // Add particle explosion effect on the target neuron only
                    createParticleExplosion(otherNeuron);
                    
                    this.createConnection(neuron, otherNeuron);
                }
            }
        });
    }

    updateConnectionProperties(weight, speed) {
        if (this.selectedConnection) {
            if (weight !== undefined) {
                this.selectedConnection.weight = weight;
                const targetIndex = window.circles.indexOf(this.selectedConnection.target);
                if (this.selectedConnection.source?.neuron) {
                    this.selectedConnection.source.neuron.updateConnectionWeight(targetIndex, weight);
                }
            }
    
            if (speed !== undefined) {
                this.selectedConnection.speed = speed;
                const targetIndex = window.circles.indexOf(this.selectedConnection.target);
                if (this.selectedConnection.source?.neuron) {
                    this.selectedConnection.source.neuron.updateConnectionSpeed(targetIndex, speed);
                }
    
                // Update arrow position based on speed
                if (this.selectedConnection.arrow) {
                    const source = this.selectedConnection.source.position;
                    const target = this.selectedConnection.target.position;
                    const position = new THREE.Vector3().lerpVectors(
                        source,
                        target,
                        0.2 + (speed * 0.6)  // Map 0-1 to 0.2-0.8 range
                    );
                    this.selectedConnection.arrow.position.copy(position);
                    this.selectedConnection.arrow.position.y = 0.5; // Position above the neuron plane
                }
            }
    
            // Update GUI to reflect current values
            if (window.settings) {
                window.settings.selectedConnection = this.selectedConnection;
                if (weight !== undefined) window.settings.selectedWeight = weight;
                if (speed !== undefined) window.settings.selectedSpeed = speed;
            }
    
            const connectionGroup = Array.from(this.connections.entries())
                .find(([_, conn]) => conn === this.selectedConnection)?.[0];
            if (connectionGroup) {
                this.updateConnection(connectionGroup);
            }

            // Show updated weight label if visible
            if (this.weightLabel && this.selectedConnection.arrow) {
                this.showWeightLabel(this.selectedConnection.arrow, this.selectedConnection.weight);
            }
        }
    }

    shouldUpdateArrow(group, connection) {
        // Always update if dragging an arrow
        if (this.isDraggingArrow) {
            return true;
        }
        
        // Also always update if we're dragging a neuron that's part of this connection
        if (this.isDraggingNeuron && 
            (window.draggedNeuron === connection.source || 
             window.draggedNeuron === connection.target)) {
            // Clear cached positions to force a fresh calculation
            const connectionId = connection.source?.neuron?.id + "_" + connection.target?.neuron?.id;
            if (connectionId) {
                this.arrowPositionCache.delete(connectionId);
            }
            return true;
        }
        
        // Force updates every 60 frames as a safety measure
        if (this.frameCount % 60 === 0) {
            return true;
        }
        
        // Get source and target neurons
        const sourceNeuron = connection.source?.neuron;
        const targetNeuron = connection.target?.neuron;
        if (!sourceNeuron || !targetNeuron) {
            return true; // Always update if we don't have neurons for caching
        }
        
        // Check if source position has changed
        const sourcePos = connection.source.position;
        const lastSourcePos = this.lastSourcePositions.get(sourceNeuron.id);
        if (!lastSourcePos || 
            lastSourcePos.x !== sourcePos.x || 
            lastSourcePos.z !== sourcePos.z) {
            // Position has changed, update cache and return true
            this.lastSourcePositions.set(sourceNeuron.id, sourcePos.clone());
            return true;
        }
        
        // Check if target position has changed
        const targetPos = connection.target.position;
        const lastTargetPos = this.lastTargetPositions.get(targetNeuron.id);
        if (!lastTargetPos || 
            lastTargetPos.x !== targetPos.x || 
            lastTargetPos.z !== targetPos.z) {
            // Position has changed, update cache and return true
            this.lastTargetPositions.set(targetNeuron.id, targetPos.clone());
            return true;
        }
        
        // Check if source DC input has changed
        const sourceDC = sourceNeuron.dcInput || 0;
        const lastSourceDC = this.lastSourceDC.get(sourceNeuron.id);
        if (lastSourceDC === undefined || Math.abs(lastSourceDC - sourceDC) > 0.001) {
            this.lastSourceDC.set(sourceNeuron.id, sourceDC);
            return true;
        }
        
        // Check if target DC input has changed
        const targetDC = targetNeuron.dcInput || 0;
        const lastTargetDC = this.lastTargetDC.get(targetNeuron.id);
        if (lastTargetDC === undefined || Math.abs(lastTargetDC - targetDC) > 0.001) {
            this.lastTargetDC.set(targetNeuron.id, targetDC);
            return true;
        }
        
        // Check if connection weight or speed has changed
        const weight = connection.weight || 0.5;
        const speed = connection.speed || 0.5;
        const lastWeight = this.lastConnectionWeight.get(group);
        const lastSpeed = this.lastConnectionSpeed.get(group);
        
        if (lastWeight === undefined || Math.abs(lastWeight - weight) > 0.001) {
            this.lastConnectionWeight.set(group, weight);
            return true;
        }
        
        if (lastSpeed === undefined || Math.abs(lastSpeed - speed) > 0.001) {
            this.lastConnectionSpeed.set(group, speed);
            return true;
        }
        
        // Nothing has changed, don't update
        return false;
    }
    
    updateArrowsCache() {
        // Only rebuild the cache if the connection count has changed, or if the cache is empty
        if (this.connections.size !== this.lastConnectionCount || !this.arrowsCache.length) {
            this.arrowsCache = Array.from(this.connections.values())
                .map(connection => connection.arrow)
                .filter(Boolean);
            this.lastConnectionCount = this.connections.size;
        }
        return this.arrowsCache;
    }

    showWeightLabel(arrow, weight) {
        if (!this.weightLabel) {
            this.weightLabel = document.createElement('div');
            this.weightLabel.style.position = 'absolute';
            this.weightLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
            this.weightLabel.style.padding = '5px';
            this.weightLabel.style.color = 'white';
            this.weightLabel.style.borderRadius = '3px';
            this.weightLabel.style.fontSize = '14px';
            this.weightLabel.style.fontFamily = 'Consolas, monospace';
            this.weightLabel.style.pointerEvents = 'none';
            document.body.appendChild(this.weightLabel);
        }

        let speed = 0;
        this.connections.forEach((connection) => {
            if (connection.arrow === arrow) {
                speed = connection.speed;
            }
        });

        this.weightLabel.innerHTML = `Weight: ${weight.toFixed(1)}<br>Speed: ${speed.toFixed(1)}`;
        const vector = new THREE.Vector3();
        arrow.getWorldPosition(vector);
        vector.project(this.camera);

        const x = (vector.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight;

        this.weightLabel.style.left = `${x}px`;
        this.weightLabel.style.top = `${y - 50}px`;
    }

    hideWeightLabel() {
        if (this.weightLabel) {
            document.body.removeChild(this.weightLabel);
            this.weightLabel = null;
        }
    }

    handlePointerDown(event) {
        const isTouch = event.type === 'touchstart';

        
        // Handle long press detection for touch events
        if (isTouch) {
            if (this.longPressTimeout) {
                clearTimeout(this.longPressTimeout);
            }
            
            const touch = event.touches[0];
            this.longPressStartPosition = { 
                x: touch.clientX, 
                y: touch.clientY 
            };
            
            this.longPressTimeout = setTimeout(() => {
                // Check if we're still in roughly the same position
                if (this.selectedConnection) {
                    this.isLongPressing = true;
                    this.handleLongPress(this.selectedConnection);
                }
            }, this.longPressDelay);
        }
        
        // Skip if middle button is pressed
        if (!isTouch && event.button === 1) return;
        
        // Only check for arrow clicks on left-click
        if (!isTouch && event.button !== 0) return;
        
        // If we're already dragging, don't start a new interaction
        if (this.isDraggingArrow) return;
        
        // Get the pointer for either mouse or touch
        const pointer = isTouch ? event.touches[0] : event;
        
        // Flag for double-tap detection
        let isDoubleTap = false;
        
        if (isTouch) {
            const currentTime = new Date().getTime();
            const tapDistance = Math.sqrt(
                Math.pow(pointer.clientX - this.lastTapPosition.x, 2) +
                Math.pow(pointer.clientY - this.lastTapPosition.y, 2)
            );
            
            // Check if the current tap is close enough to the last one
            // and within the time threshold to be a double tap
            if (currentTime - this.lastTapTime < this.doubleTapDelay && 
                tapDistance < this.tapDistanceThreshold) {
                console.log("Double tap detected!");
                isDoubleTap = true;
            }
            
            // Update last tap info
            this.lastTapTime = currentTime;
            this.lastTapPosition = { x: pointer.clientX, y: pointer.clientY };
        }
        
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Add increased Line threshold for better arrow detection
        const originalThreshold = this.raycaster.params.Line ? this.raycaster.params.Line.threshold : 1;
        if (this.raycaster.params.Line) {
            this.raycaster.params.Line.threshold = isTouch ? 8 : 5;
        }
        
        // Get arrows using the arrow cache mechanism
        const arrows = this.updateArrowsCache();
        const intersects = this.raycaster.intersectObjects(arrows, false);
        
        // Reset threshold
        if (this.raycaster.params.Line) {
            this.raycaster.params.Line.threshold = originalThreshold;
        }
        
        if (intersects.length > 0) {
            // Prevent default event handling
            event.preventDefault();
            event.stopPropagation();
            
            console.log("Arrow intersected, starting drag operation");
            
            // Start dragging the arrow to adjust the connection speed
            const arrow = intersects[0].object;
            
            // Find the corresponding connection
            for (const [group, connection] of this.connections.entries()) {
                if (connection.arrow === arrow) {
                    console.log("Selected connection for arrow:", connection.source?.neuron?.id, "->", connection.target?.neuron?.id);
                    
                    // Flag that we're now dragging this arrow
                    this.isDraggingArrow = true;
                    this.isDraggingBeforeStart = true;
                    this.selectedArrow = arrow;
                    this.selectedConnection = connection;
                    
                    // Make the arrow fully visible during dragging
                    arrow.material.opacity = 1.0;
                    arrow.material.color.setHex(0x00ff00);
                    
                    // Update UI
                    this.showWeightLabel(arrow, connection.weight);
                    
                    // Update global settings
                    if (window.settings) {
                        window.settings.selectedConnection = connection;
                        window.settings.selectedWeight = connection.weight || 0.5;
                        window.settings.selectedSpeed = connection.speed || 0.5;
                        
                        // Refresh tweakpane if available
                        if (window.pane) {
                            window.pane.refresh();
                        }
                    }
                    
                    // Force an immediate update to ensure the connection is visible and properly initialized
                    this.updateConnection(group);
                    
                    // Force a secondary update after a short delay to ensure everything is loaded correctly
                    // This helps with the neuron 03 to neuron 01 connection issue
                    setTimeout(() => {
                        if (this.isDraggingArrow && this.selectedConnection === connection) {
                            this.updateConnection(group);
                        }
                    }, 50);
                    
                    break;
                }
            }
        }
    }

    handlePointerMove(event) {
        const isTouch = event.type === 'touchmove';
        const pointer = isTouch ? event.touches[0] : event;
        
        // If we have a long press timer running and this is a touch event, check if we've moved too far
        if (this.longPressTimeout && isTouch) {
            const distance = Math.sqrt(
                Math.pow(pointer.clientX - this.longPressStartPosition.x, 2) +
                Math.pow(pointer.clientY - this.longPressStartPosition.y, 2)
            );
            
            // If moved beyond threshold, cancel the long press
            if (distance > this.longPressThreshold) {
                clearTimeout(this.longPressTimeout);
                this.longPressTimeout = null;
            }
        }
    
        if (!this.isDraggingArrow || !this.selectedArrow || !this.selectedConnection) {
            this.updateMousePosition(event);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Set threshold for better detection
            const originalThreshold = this.raycaster.params.Line ? this.raycaster.params.Line.threshold : 1;
            if (this.raycaster.params.Line) {
                this.raycaster.params.Line.threshold = isTouch ? 8 : 5;
            }
            
            // Get arrows only
            const arrows = this.updateArrowsCache();
            const intersects = this.raycaster.intersectObjects(arrows, false);
            
            // Reset threshold
            if (this.raycaster.params.Line) {
                this.raycaster.params.Line.threshold = originalThreshold;
            }
            
            // Only show weight label when hovering over an arrow
            if (intersects.length > 0) {
                const arrow = intersects[0].object;
                const connection = Array.from(this.connections.values())
                    .find(conn => conn.arrow === arrow);
                if (connection) {
                    this.showWeightLabel(arrow, connection.weight);
                }
            } else {
                this.hideWeightLabel();
            }
            return;
        }

        // Only prevent default if we're actually dragging an arrow 
        if (this.isDraggingArrow) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Safety check - ensure arrow exists
        if (!this.selectedArrow || !this.selectedArrow.material) {
            console.warn("Arrow lost during drag operation");
            this.isDraggingArrow = false;
            return;
        }
        
        // Ensure the arrow is visible during dragging
        this.selectedArrow.material.opacity = 1.0;
        this.selectedArrow.material.color.setHex(0x00ff00);
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouseX = pointer.clientX - rect.left;
        const mouseZ = pointer.clientY - rect.top;

        if (!this.selectedConnection.source || !this.selectedConnection.target) {
            console.warn("Connection endpoints lost during dragging");
            this.isDraggingArrow = false;
            return;
        }

        const source = this.selectedConnection.source.position.clone();
        const target = this.selectedConnection.target.position.clone();
        
        source.project(this.camera);
        target.project(this.camera);
        
        const sourceScreen = {
            x: (source.x + 1) * rect.width / 2,
            y: (-source.y + 1) * rect.height / 2
        };
        
        const targetScreen = {
            x: (target.x + 1) * rect.width / 2,
            y: (-target.y + 1) * rect.height / 2
        };

        const dragResult = this.calculateDragPosition(mouseX, mouseZ, sourceScreen, targetScreen);
        
        // Create a new world position for the arrow
        const worldPos = new THREE.Vector3();
        worldPos.copy(this.selectedConnection.source.position);
        
        const direction = new THREE.Vector3().subVectors(
            this.selectedConnection.target.position,
            this.selectedConnection.source.position
        ).normalize();
        
        const distance = this.selectedConnection.source.position.distanceTo(
            this.selectedConnection.target.position
        );
        
        worldPos.add(direction.multiplyScalar(dragResult.percentage * distance));
        
        // CRITICAL: Always maintain the y-position of the arrow above the neuron plane
        worldPos.y = 0.5;
        this.selectedArrow.position.copy(worldPos);
        
        // Log the arrow position for debugging
        // console.log("Arrow positioned at:", worldPos.x.toFixed(2), worldPos.y.toFixed(2), worldPos.z.toFixed(2));

        // Update the connection speed
        this.selectedConnection.speed = dragResult.normalizedSpeed;
        
        if (window.settings) {
            window.settings.selectedSpeed = dragResult.normalizedSpeed;
        }

        // Force an update 
        this.needsUpdate = true;

        // Update the connection in the neuron
        const targetIndex = window.circles.indexOf(this.selectedConnection.target);
        if (this.selectedConnection.source?.neuron) {
            this.selectedConnection.source.neuron.updateConnectionSpeed(targetIndex, dragResult.normalizedSpeed);
        }

        // Update the UI
        this.showWeightLabel(this.selectedArrow, this.selectedConnection.weight);
        
        // Force the connection group to update
        const connectionGroup = Array.from(this.connections.entries())
            .find(([_, conn]) => conn === this.selectedConnection)?.[0];
        if (connectionGroup) {
            this.updateConnection(connectionGroup);
        }
    }

    handlePointerUp(event) {
        // Clear any long press timeout
        if (this.longPressTimeout) {
            clearTimeout(this.longPressTimeout);
            this.longPressTimeout = null;
        }
        
        if (!this.isDraggingArrow) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        // Only access speed if selectedConnection exists
        if (this.selectedConnection) {
            const speed = this.selectedConnection.speed;
            console.log("Arrow drag ended, final speed:", speed);
            
            const targetIndex = window.circles.indexOf(this.selectedConnection.target);
            if (this.selectedConnection.source?.neuron) {
                this.selectedConnection.source.neuron.updateConnectionSpeed(targetIndex, speed);
            }
            
            // Update global settings
            if (window.settings) {
                window.settings.selectedConnection = this.selectedConnection;
                window.settings.selectedWeight = this.selectedConnection.weight;
                window.settings.selectedSpeed = speed;
                
                // Refresh the panel
                if (window.pane) {
                    window.pane.refresh();
                }
            }
            
            // Force a final update to ensure visibility
            const connectionGroup = Array.from(this.connections.entries())
                .find(([_, conn]) => conn === this.selectedConnection)?.[0];
            if (connectionGroup) {
                this.updateConnection(connectionGroup);
            }
        }
        
        // Keep selected connection arrow visible with green color
        if (this.selectedConnection && this.selectedArrow) {
            console.log("Keeping arrow visible after drag");
            this.selectedArrow.material.color.setHex(0x00ff00);
            // Ensure arrow remains visible after drag ends
            this.selectedArrow.material.opacity = 1.0;
        }
        
        this.isDraggingArrow = false;
        this.isDraggingBeforeStart = false;
        this.hideWeightLabel();
    }

    handleWheel(event) {
        if (this.isDraggingArrow) return;
        event.preventDefault();
        
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Set threshold for better detection
        const originalThreshold = this.raycaster.params.Line ? this.raycaster.params.Line.threshold : 1;
        if (this.raycaster.params.Line) {
            this.raycaster.params.Line.threshold = 5; // Increased threshold for easier detection
        }
        
        const arrows = this.updateArrowsCache();
        const intersects = this.raycaster.intersectObjects(arrows);
        
        // Reset threshold
        if (this.raycaster.params.Line) {
            this.raycaster.params.Line.threshold = originalThreshold;
        }
        
        if (intersects.length > 0) {
            const arrow = intersects[0].object;
            let connectionGroup = null;
            
            this.connections.forEach((connection, group) => {
                if (connection.arrow === arrow) {
                    // First, make sure this connection is selected
                    this.selectConnection(connection);
                    connectionGroup = group;
                    
                    if (connection.source.neuron) {
                        connection.source.neuron.isScrolling = true;
                        if (connection.source.neuron.scrollTimeout) {
                            clearTimeout(connection.source.neuron.scrollTimeout);
                        }
                    }

                    // Add to scrolling connections set
                    this.scrollingConnections.add(connection);
                    
                    // Make sure the arrow is fully visible
                    connection.arrow.material.opacity = 1.0;
                    
                    const delta = event.deltaY > 0 ? -0.1 : 0.1;
                    const currentWeight = connection.weight ?? 0.5;
                    let newWeight = Math.max(0, Math.min(1, currentWeight + delta));
                    
                    connection.weight = newWeight;
                    if (window.settings) {
                        window.settings.selectedWeight = newWeight;
                        
                        // Make sure to refresh the panel
                        if (window.pane) {
                            window.pane.refresh();
                        }
                    }
                    
                    const targetIndex = window.circles.indexOf(connection.target);
                    connection.source.neuron.updateConnectionWeight(targetIndex, newWeight);
                    
                    // Force an update on the connection
                    this.updateConnection(group);
                    this.showWeightLabel(arrow, newWeight);
                    
                    // Schedule reset isScrolling flag
                    if (connection.source.neuron) {
                        connection.source.neuron.scrollTimeout = setTimeout(() => {
                            if (connection.source.neuron) {
                                connection.source.neuron.isScrolling = false;
                            }
                            // Remove from scrolling connections set after delay
                            this.scrollingConnections.delete(connection);
                        }, 500);
                    }
                }
            });
            
            // Force another update after a short delay to ensure proper initialization
            // This helps with the neuron 03 to neuron 01 connection issue
            if (connectionGroup) {
                setTimeout(() => {
                    this.updateConnection(connectionGroup);
                }, 50);
            }
        }
    }

    handleDoubleClick(event) {
        event.preventDefault();
        console.log("Double click event received");
        
        // Prevent multiple creation calls
        if (this.isCreatingNeuron) {
            console.log("Already creating a neuron, ignoring additional click");
            return;
        }
        
        this.isCreatingNeuron = true;
        
        // Get mouse position in normalized device coordinates (-1 to +1)
        this.updateMousePosition(event);
        
        // Set up raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Create a plane at y=0 to intersect with
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersectionPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, intersectionPoint);
        
        // Check if we clicked on empty space (not on existing neurons)
        const intersects = this.raycaster.intersectObjects(window.circles);
        if (intersects.length === 0) {
            console.log("Creating new neuron at", intersectionPoint.x, intersectionPoint.z);
            
            // Create new neuron at intersection point
            const neuron = window.settings.addNeuron(intersectionPoint);
            if (neuron) {
                // Set position properly
                neuron.position.copy(intersectionPoint);
                neuron.position.y = 0.1;
                
                // Update touch area position
                if (neuron.touchArea) {
                    neuron.touchArea.position.copy(neuron.position);
                    neuron.touchArea.position.y = 0.1;
                }
                
                console.log("Created neuron:", neuron.neuron.id);
            }
        }
        
        // Reset the flag after a short delay to prevent further events
        setTimeout(() => {
            this.isCreatingNeuron = false;
        }, 300);
    }

    calculateDragPosition(mouseX, mouseY, sourceScreen, targetScreen) {
        const screenVector = {
            x: targetScreen.x - sourceScreen.x,
            y: targetScreen.y - sourceScreen.y
        };

        const mouseVector = {
            x: mouseX - sourceScreen.x,
            y: mouseY - sourceScreen.y
        };

        const screenVectorLength = Math.sqrt(screenVector.x * screenVector.x + screenVector.y * screenVector.y);
        const dotProduct = mouseVector.x * screenVector.x + mouseVector.y * screenVector.y;
        
        let rawPercentage = dotProduct / (screenVectorLength * screenVectorLength);

        const sourceGrowth = this.selectedConnection.source.neuron ? 
            this.selectedConnection.source.neuron.baseScale + 
            (this.selectedConnection.source.neuron.dcInput * 0.2) : 0.2;
        const targetGrowth = this.selectedConnection.target.neuron ? 
            this.selectedConnection.target.neuron.baseScale + 
            (this.selectedConnection.target.neuron.dcInput * 0.2) : 0.2;

        const MIN_VISUAL = sourceGrowth;
        const MAX_VISUAL = 1 - targetGrowth;
        
        rawPercentage = Math.max(MIN_VISUAL, Math.min(MAX_VISUAL, rawPercentage));
        
        const normalizedSpeed = (rawPercentage - MIN_VISUAL) / (MAX_VISUAL - MIN_VISUAL);
        
        return {
            percentage: rawPercentage,
            normalizedSpeed: Math.max(0, Math.min(1, normalizedSpeed))
        };
    }

    updateAllConnections() {
        // Check if we should update based on time
        const now = performance.now();
        const timeDelta = now - this.lastUpdateTime;
        
        // If we're dragging or time threshold is met, do a full update
        if (this.isDraggingArrow || this.needsUpdate || timeDelta > this.updateThreshold) {
            this.lastUpdateTime = now;
            this.needsUpdate = false;
            
            // Validate cache if the number of connections has changed
            if (this.connections.size !== this.lastConnectionCount) {
                this.arrowsCache = this.updateArrowsCache();
                this.lastConnectionCount = this.connections.size;
            }
            
            // Track problematic connection
            let problematicConnection = null;
            let problematicConnectionGroup = null;
            
            // Update all connections
            for (const [group, connection] of this.connections.entries()) {
                try {
                    // Check for the problematic connection (neuron 03 to neuron 01)
                    if (connection.source?.neuron?.id === '03' && connection.target?.neuron?.id === '01') {
                        problematicConnection = connection;
                        problematicConnectionGroup = group;
                    }
                    
                    // Only update static position if something has changed or it's been a while
                    const shouldUpdateArrow = this.shouldUpdateArrow(group, connection);
                    
                    // Update the static line and arrow positions only when needed
                    if (shouldUpdateArrow) {
                        this.updateConnection(group);
                    }
                    
                    // Update waveforms every frame for smoother animations during rapid firing
                    // Changed from frameCount % 2 to update every frame
                    if (this.frameCount % 1 === 0) {
                        this.updateConnectionWaveform(connection);
                    }
                } catch (error) {
                    console.warn('Error updating connection:', error);
                }
            }
            
            // Extra update for the problematic connection (only check opacity)
            if (problematicConnection && problematicConnectionGroup) {
                // Check if the arrow has the right opacity
                if (problematicConnection.arrow && 
                    problematicConnection.arrow.material.opacity < 0.2) {
                    
                    console.log("Fixing problematic connection (neuron 03 to neuron 01)");
                    
                    // Ensure the arrow is properly visible
                    problematicConnection.arrow.material.opacity = 0.4;
                    
                    // Force update cached position
                    const connectionId = problematicConnection.source?.neuron?.id + "_" + problematicConnection.target?.neuron?.id;
                    if (connectionId) {
                        // Remove from cache to force recalculation
                        this.arrowPositionCache.delete(connectionId);
                        
                        // Force another update
                        this.updateConnection(problematicConnectionGroup);
                    }
                }
            }
            
            this.frameCount++;
            
            // Reset drag state after the update
            if (this.isDraggingNeuron && !window.draggedNeuron) {
                this.isDraggingNeuron = false;
            }
        }
    }

    // Update a connection's waveform visualization
    updateConnectionWaveform(connection) {
        if (!connection || !connection.waveformLine) return;
        
        // Get the source and target positions
        const sourcePos = connection.source.position;
        const targetPos = connection.target.position;
        
        // Check if neuron is currently firing or fired very recently
        let isActive = false;
        if (connection.source.neuron) {
            const now = performance.now();
            // Consider neuron active if it fired in the last 200ms (increased from 100ms)
            // This helps maintain waveform visibility during rapid firing
            isActive = connection.source.neuron.isFiring || (now - (connection.source.neuron.lastFiredTime || 0) < 200);
            
            // Store the active state directly on the connection for animation consistency
            connection.isActive = isActive;
        }
        
        // Calculate distance between neurons for color gradient
        const dx = targetPos.x - sourcePos.x;
        const dz = targetPos.z - sourcePos.z;
        const neuronDistance = Math.sqrt(dx * dx + dz * dz);
        
        // Set color based on distance - cyan (near) to grey (far)
        const nearColor = new THREE.Color(0x00FF00);  // Cyan
        const farColor = new THREE.Color(0x808080);   // Grey
        
        // Normalize distance for color interpolation
        // 2.0 units = close, 10.0 units = far
        const minDist = 2.0;
        const maxDist = 10.0;
        const normDist = Math.min(1.0, Math.max(0.0, (neuronDistance - minDist) / (maxDist - minDist)));
        
        // Set the color by lerping between green and grey based on distance
        connection.waveformLine.material.color.lerpColors(nearColor, farColor, normDist);
        
        // Track last active time to create smooth fade out effect
        if (!connection.lastActiveTime) connection.lastActiveTime = 0;
        if (isActive) {
            connection.lastActiveTime = performance.now();
        }
        
        // Calculate fade factor - smooth transition over longer period after neuron stops firing
        const timeSinceActive = performance.now() - connection.lastActiveTime;
        const fadeFactor = isActive ? 1.0 : Math.max(0, 1 - (timeSinceActive / this.fadeDuration));
        
        // Cache the fade factor for animation consistency between frames
        connection.fadeFactor = fadeFactor;
        
        // Get actual waveform data from the source neuron's sound
        let waveform = [];
        const neuronId = connection.source.neuron ? connection.source.neuron.id : null;
        
        // Check if this is an instant connection
        const speed = connection.speed || 0.5; 
        const isInstantConnection = speed >= 0.99;
        
        // IMPORTANT: Only process waveform if the neuron is active or recently active (still fading)
        // Lowered threshold from 0.01 to 0.001 to ensure smoother transitions during rapid firing
        if (fadeFactor > 0.001) {
            // Try to get direct waveform first
            const directWaveform = this.getDirectWaveform(neuronId);
            
            if (directWaveform && directWaveform.length > 0) {
                // We got direct waveform data, process it
                const stepSize = Math.floor(directWaveform.length / this.waveformResolution);
                
                for (let i = 0; i < this.waveformResolution; i++) {
                    const index = i * stepSize;
                    if (index < directWaveform.length) {
                        // Scale up the waveform value and apply weight/fade factor
                        const scaleFactor = this.waveformHeight * fadeFactor * (connection.weight || 0.5);
                        waveform.push(directWaveform[index] * scaleFactor);
                    } else {
                        waveform.push(0);
                    }
                }
            } else if (window.soundManager && window.soundManager.waveformAnalyzer) {
                // Fall back to global analyzer
                try {
                    // Get the current waveform from the analyzer
                    const fullWaveform = window.soundManager.waveformAnalyzer.getValue();
                    
                    // Only use real waveform if we have data and neuron is active
                    if (fullWaveform && fullWaveform.length > 0) {
                        // Sample the waveform data to our desired resolution
                        const stepSize = Math.floor(fullWaveform.length / this.waveformResolution);
                        
                        for (let i = 0; i < this.waveformResolution; i++) {
                            const index = i * stepSize;
                            if (index < fullWaveform.length) {
                                // Scale up the waveform value and apply weight/fade factor
                                const scaleFactor = this.waveformHeight * fadeFactor * (connection.weight || 0.5);
                                waveform.push(fullWaveform[index] * scaleFactor);
                            } else {
                                waveform.push(0);
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error getting waveform data:', error);
                    waveform = [];
                }
            }
        }
        
        // If we have no waveform data yet and we're active, create a synthetic one
        if (waveform.length === 0 && fadeFactor > 0.01) {
            // Add animation phase based on time for moving wave effect
            const currentTime = performance.now() / 1000; // Convert to seconds
            const animationSpeed = isInstantConnection ? 
                12 : // Very fast animation for instant connections
                2 + (speed * 6); // Regular speed scaling for normal connections
                
            const phase = (currentTime * animationSpeed) % (Math.PI * 2);
            
            // Calculate base amplitude - fades out when neuron stops firing
            // Use a higher minimum amplitude for better visibility
            const weight = connection.weight || 0.5;
            const baseAmplitude = fadeFactor * (0.5 + weight * 1.5); // Increased base amplitude
            
            // Create a more distinct traveling wave with higher amplitude
            for (let i = 0; i < this.waveformResolution; i++) {
                // Create a wave based on the connection properties
                const t = i / (this.waveformResolution - 1);
                
                // Use a clearer sine wave pattern with higher frequency based on weight
                // For instant connections, use higher frequency
                const frequency = isInstantConnection ?
                    4 + (weight * 4) : // Higher frequency for instant connections
                    2 + (weight * 3); // Normal frequency for regular connections
                
                // This creates a traveling wave moving from source to target
                // The wave should travel in the direction of the connection
                const animatedPhase = phase - (t * Math.PI * 2); 
                
                // Create a clearer sine wave with higher amplitude
                const waveValue = Math.sin(t * frequency * Math.PI * 2 + animatedPhase);
                
                // Apply a "bump" function to make center of wave more pronounced
                const bump = 0.5 + 0.5 * Math.sin((t - 0.5) * Math.PI);
                
                // Scale wave by fade factor and add the bump effect
                waveform.push(waveValue * baseAmplitude * (0.8 + 0.2 * bump));
            }
        } else if (waveform.length === 0) {
            // Create a flat line when neuron is inactive
            for (let i = 0; i < this.waveformResolution; i++) {
                waveform.push(0);
            }
        }
        
        // Calculate direction vector from source to target
        const dirX = targetPos.x - sourcePos.x;
        const dirZ = targetPos.z - sourcePos.z;
        const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);
        
        // Create normalized direction and perpendicular vectors
        const normalizedDirX = dirX / distance;
        const normalizedDirZ = dirZ / distance;
        const perpX = -normalizedDirZ;
        const perpZ = normalizedDirX;
        
        // Check if we have the new tube geometry setup
        if (connection.waveformLine.userData.points && connection.waveformLine.userData.path) {
            // Update the points for the CatmullRomCurve3
            const points = connection.waveformLine.userData.points;
            
            // Start at source
            for (let i = 0; i < this.waveformResolution; i++) {
                const t = i / (this.waveformResolution - 1); // Normalize to 0-1
                
                // Base position along straight line from source to target
                const x = sourcePos.x + (dirX * t);
                const z = sourcePos.z + (dirZ * t);
                
                // Apply waveform displacement perpendicular to the direction
                const displacement = waveform[i];
                
                // Update the point position
                points[i].set(
                    x + (perpX * displacement),
                    -10, // Keep waveform at neuron plane level
                    z + (perpZ * displacement)
                );
            }
            
            // Update the path from the modified points
            connection.waveformLine.userData.path.points = points;
            
            // Recreate the tube geometry
            const newTubeGeometry = new THREE.TubeGeometry(
                connection.waveformLine.userData.path,
                this.waveformResolution,  // tubularSegments
                this.waveformThickness * (isInstantConnection ? 1.5 : 1), // Thicker for instant connections
                8,                       // radialSegments
                false                    // closed
            );
            
            // Update the geometry
            connection.waveformLine.geometry.dispose();
            connection.waveformLine.geometry = newTubeGeometry;
        } else {
            // Legacy support for regular line geometry
            console.warn('Using legacy line geometry update - tube geometry not found');
            
            // If using the old approach with direct buffer geometry
            if (connection.waveformLine.geometry.attributes && 
                connection.waveformLine.geometry.attributes.position) {
                
                const positions = connection.waveformLine.geometry.attributes.position.array;
                
                // Start at source
                for (let i = 0; i < this.waveformResolution; i++) {
                    const t = i / (this.waveformResolution - 1); // Normalize to 0-1
                    
                    // Base position along straight line from source to target
                    const x = sourcePos.x + (dirX * t);
                    const z = sourcePos.z + (dirZ * t);
                    
                    // Apply waveform displacement perpendicular to the direction
                    const displacement = waveform[i];
                    
                    const index = i * 3;
                    positions[index] = x + (perpX * displacement);
                    positions[index + 1] = 0.5;
                    positions[index + 2] = z + (perpZ * displacement);
                }
                
                connection.waveformLine.geometry.attributes.position.needsUpdate = true;
            }
        }
        
        // Make sure the arrow color matches the waveform color
        if (connection.arrow && connection.arrow.material) {
            // Apply the same color as the waveform
            connection.arrow.material.color.copy(connection.waveformLine.material.color);
        }
        
        // Set final opacity based on activity
        if (connection.waveformLine && connection.waveformLine.material) {
            // Check if this connection is being scrolled over
            const isBeingScrolled = this.scrollingConnections.has(connection);
            
            if (isBeingScrolled) {
                // Keep full opacity when scrolling
                connection.waveformLine.material.opacity = 1.0;
                if (connection.arrow && connection.arrow.material) {
                    connection.arrow.material.opacity = 1.0;
                }
            } else {
                // Update opacity based on fade factor
                const minOpacity = this.inactiveOpacity;
                const maxOpacity = this.activeOpacity;
                const weight = connection.weight || 0.5;
                // Weight affects maximum opacity
                const targetOpacity = minOpacity + ((maxOpacity - minOpacity) * fadeFactor * weight * 1.2);
                
                // Update material opacity
                connection.waveformLine.material.opacity = targetOpacity;
                
                // Update arrow opacity to match
                if (connection.arrow && connection.arrow.material) {
                    connection.arrow.material.opacity = targetOpacity;
                }
            }
        }
        
        // Request animation frame to ensure continuous updates while firing or fading
        if (fadeFactor > 0) {
            this.needsUpdate = true;
        }
    }

    updateConnection(connectionGroup) {
        const connection = this.connections.get(connectionGroup);
        if (!connection) return;

        const { source, target, line, arrow, waveformLine } = connection;
        
        // Check for missing elements
        if (!source || !target || !line || !arrow) {
            console.warn("Connection has missing elements:", !!source, !!target, !!line, !!arrow);
            return;
        }
        
        // Update the straight reference line (keep invisible)
        const positions = line.geometry.attributes.position.array;
        positions[0] = source.position.x;
        positions[1] = -10; // Keep the line at neuron plane level
        positions[2] = source.position.z;
        positions[3] = target.position.x;
        positions[4] = -10; // Keep the line at neuron plane level
        positions[5] = target.position.z;
        line.geometry.attributes.position.needsUpdate = true;
        
        const direction = new THREE.Vector3().subVectors(target.position, source.position).normalize();

        const sourceGrowth = source.neuron ? 
            source.neuron.baseScale + (source.neuron.dcInput * 0.2) : 0.2;
        const targetGrowth = target.neuron ? 
            target.neuron.baseScale + (target.neuron.dcInput * 0.2) : 0.2;

        const minPosition = sourceGrowth;
        const maxPosition = 1 - targetGrowth;

        // Set opacity based on weight
        const weight = connection.weight ?? 0.1;
        const baseOpacity = 0.1;
        const maxOpacity = 1.0;
        
        // Check if this is an instant connection
        const speed = connection.speed ?? 0.5; 
        const isInstantConnection = speed >= 0.99;
        
        // Ensure arrow is visible while dragging or selected
        if (this.isDraggingArrow && arrow === this.selectedArrow) {
            arrow.material.opacity = 1.0; // Always fully visible when dragging
            arrow.material.color.setHex(0x00ff00); // Green for selected
            arrow.scale.setScalar(0.3); // Make it larger when selected for better visibility
            
            // Make waveform line match with higher brightness when selected
            if (waveformLine) {
                waveformLine.material.opacity = maxOpacity;
                waveformLine.material.color.setHex(0x00ffff); // Bright cyan for selected
            }
        } else {
            // Check if the neuron is firing - for consistent coloring with updateConnectionWaveform
            const isActive = source.neuron && source.neuron.isFiring;
            
            // Check for harmonic relationship if harmonicSystem exists
            let isHarmonic = false;
            if (window.harmonicSystem && source.neuron && target.neuron) {
                // Calculate distance between neurons
                const distance = source.position.distanceTo(target.position);
                
                // Check if in harmonic proximity
                if (window.harmonicSystem.isInHarmonicProximity(distance)) {
                    const relationship = window.harmonicSystem.getHarmonicRelationship(
                        source.neuron.id,
                        target.neuron.id
                    );
                    
                    if (relationship) {
                                        // This is a harmonic connection - use cyan for the arrow too
                const harmonyColor = new THREE.Color(0x00ffff); // Pure cyan
                        const normalColor = new THREE.Color(0x00ffff);  // Cyan for regular
                        const strength = Math.min(1.0, relationship.strength * 3);
                        
                        // Apply harmonic coloring
                        arrow.material.color.lerpColors(normalColor, harmonyColor, strength);
                        isHarmonic = true;
                    }
                }
            }
            
            // Only set default colors if not a harmonic connection
            if (!isHarmonic) {
                // For instant connections, use a bright white-blue color 
                if (isInstantConnection) {
                    arrow.material.color.setHex(0x40e0ff); // Light cyan/electric blue for instant connections
                } else {
                    // Default color is grey for normal connections
                    arrow.material.color.setHex(0x808080); // Grey (was cyan)
                }
            }
            
            // Instant connections should be more visible
            const opacity = isInstantConnection ? 
                Math.max(0.5, baseOpacity + (weight * (maxOpacity - baseOpacity))) : // Higher minimum for instant
                Math.max(0.3, baseOpacity + (weight * (maxOpacity - baseOpacity))); // Regular minimum
            
            arrow.material.opacity = opacity;
            
            // Adjust scale based on weight and speed - instant connections get larger arrows
            const baseScale = isInstantConnection ? 0.2 : 0.15;
            const maxScale = isInstantConnection ? 0.45 : 0.35;
            const scale = baseScale + (weight * (maxScale - baseScale));
            arrow.scale.setScalar(scale);
        }

        // Only update arrow position if not being dragged
        if (!this.isDraggingArrow || arrow !== this.selectedArrow) {
            // Check if we have a cached position for this arrow
            const connectionId = connection.source?.neuron?.id + "_" + connection.target?.neuron?.id;
            
            // Only recalculate position if needed or if a neuron in this connection is being dragged
            if (!this.arrowPositionCache.has(connectionId) || 
                this.frameCount % 60 === 0 ||
                this.isDraggingNeuron ||
                window.draggedNeuron === connection.source ||
                window.draggedNeuron === connection.target) {
                
                // Position the arrow differently for instant connections
                let restrictedPosition;
                
                if (isInstantConnection) {
                    // For instant connections, position arrow much closer to target
                    restrictedPosition = 0.75; // Fixed position at 75% of the way to target
                } else {
                    // Normal positioning based on speed - use Math.round to ensure consistency
                    const normalizedSpeed = Math.round(speed * 1000) / 1000; // Round to 3 decimal places
                    restrictedPosition = minPosition + (normalizedSpeed * (maxPosition - minPosition));
                }
                
                // Use a temp vector to avoid modifying source/target
                const tempPos = new THREE.Vector3();
                tempPos.lerpVectors(
                    source.position,
                    target.position,
                    restrictedPosition
                );
                
                // Round position to avoid minor floating point differences
                tempPos.x = Math.round(tempPos.x * 1000) / 1000;
                tempPos.z = Math.round(tempPos.z * 1000) / 1000;
                tempPos.y = 0.5; // Fixed Y position ABOVE the neuron plane
                
                // Cache the calculated position
                this.arrowPositionCache.set(connectionId, tempPos.clone());
                
                // Direct copy instead of component-wise assignment
                arrow.position.copy(tempPos);
            } else {
                // Use cached position
                arrow.position.copy(this.arrowPositionCache.get(connectionId));
            }
        }

        const angle = Math.atan2(direction.z, direction.x);
        arrow.rotation.set(-Math.PI/2, 0, -angle);
        
        // Keep regular line invisible since we're using waveform line instead
        line.material.opacity = 0;
    }

    createConnection(sourceNeuron, targetNeuron) {
        if (!sourceNeuron || !sourceNeuron.position || 
            !targetNeuron || !targetNeuron.position) {
            console.warn('Invalid neurons for connection');
            return null;
        }
    
        // Generate random speed between 0.3 and 0.8
        const randomSpeed = 0.3 + Math.random() * 0.5;  // This gives us a range of 0.3 to 0.8
        
        const connectionGroup = new THREE.Group();
        
        // Create regular line (keep but make invisible)
        const line = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.MeshBasicMaterial({
                color: 0xaaaaaa,
                transparent: true,
                opacity: 0, // Make invisible
                depthTest: true,
                depthWrite: true
            })
        );
        
        const positions = new Float32Array(6);
        line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        
        // Create initial waveform points - will be updated in updateConnectionWaveform
        const waveformPoints = [];
        for (let i = 0; i < this.waveformResolution; i++) {
            // Create flat line initially
            const t = i / (this.waveformResolution - 1);
            waveformPoints.push(new THREE.Vector3(t, 0, 0));
        }
        
        // Create a tube geometry for thicker lines
        const waveformPath = new THREE.CatmullRomCurve3(waveformPoints);
        const tubeGeometry = new THREE.TubeGeometry(
            waveformPath,
            this.waveformResolution,  // tubularSegments
            this.waveformThickness,   // radius - use the configurable thickness property
            8,                       // radialSegments
            false                    // closed
        );
        
        // Create waveform with tube geometry - use grey
        const waveformLine = new THREE.Mesh(
            tubeGeometry,
            new THREE.MeshBasicMaterial({
                color: 0x808080,  // Grey color (was cyan)
                transparent: true,
                opacity: 0, // Start fully transparent
                depthTest: true,
                depthWrite: true
            })
        );
        
        // Store path and points for updates
        waveformLine.userData.path = waveformPath;
        waveformLine.userData.points = waveformPoints;
        
        // Use grey for arrow too
        const arrow = new THREE.Mesh(this.arrowGeometry, this.arrowMaterial.clone());
        arrow.userData.isConnectionArrow = true;
        arrow.matrixAutoUpdate = true;
        arrow.raycast = THREE.Mesh.prototype.raycast;
        arrow.material.opacity = 0; // Start fully transparent
        arrow.material.color.setHex(0x808080); // Grey (was cyan)
        
        // Set initial arrow position above the neuron plane
        arrow.position.y = 0.5;
        
        connectionGroup.add(line);
        connectionGroup.add(waveformLine);
        connectionGroup.add(arrow);
        
        const connection = {
            source: sourceNeuron,
            target: targetNeuron,
            line: line,
            waveformLine: waveformLine,
            arrow: arrow,
            weight: 0.4,
            speed: randomSpeed  // Use the random speed
        };
        this.connections.set(connectionGroup, connection);
        
        // Initialize the waveform
        this.updateConnectionWaveform(connection);
        
        this.scene.add(connectionGroup);
    
        const targetIndex = window.circles.indexOf(targetNeuron);
        
        // CRITICAL FIX: Add connection WITHOUT causing any pause in neuron firing
        // The improved addConnection method now ensures no disruption to DC neuron timing
        console.log(`[ConnectionManager] Creating connection from ${sourceNeuron?.neuron?.id} to ${targetNeuron?.neuron?.id}`);
        console.log(`[ConnectionManager] Checking for centralized system: ${!!window.neuralSystem}`);
        
        if (window.neuralSystem) {
            // Get the source neuron ID properly - it could be either in neuronId or in neuron.id
            const sourceId = sourceNeuron.neuronId || (sourceNeuron.neuron ? sourceNeuron.neuron.id : null);
            
            // CRITICAL FIX: Get the target neuron ID instead of using array index
            const targetId = targetNeuron.neuronId || (targetNeuron.neuron ? targetNeuron.neuron.id : null);
            
            console.log(`[ConnectionManager] Using centralized system - sourceId: ${sourceId}, targetId: ${targetId}`);
            
            // Use the centralized neural system
            if (sourceId !== null && targetId !== null) {
                // Ensure both neurons exist in the centralized system
                const sourceExists = this.ensureNeuronExists(sourceId, sourceNeuron);
                const targetExists = this.ensureNeuronExists(targetId, targetNeuron);
                
                if (sourceExists && targetExists) {
                    window.neuralSystem.adapter.createConnection(
                        sourceId, 
                        targetId, 
                        connection.weight, 
                        connection.speed
                    );
                    console.log(`[ConnectionManager] Connection created via centralized system`);
                } else {
                    console.warn(`[ConnectionManager] Failed to ensure neurons exist: source=${sourceExists}, target=${targetExists}`);
                    // Fall back to the old method
                    sourceNeuron.neuron.addConnection(targetIndex, connection.weight, connection.speed);
                }
            } else {
                console.warn(`[ConnectionManager] Cannot use centralized system - invalid IDs`);
                // Fall back to the old method
                sourceNeuron.neuron.addConnection(targetIndex, connection.weight, connection.speed);
            }
        } else {
            console.log(`[ConnectionManager] Using legacy connection method`);
            // Fall back to the old method
            sourceNeuron.neuron.addConnection(targetIndex, connection.weight, connection.speed);
        }
        
        // REMOVED the refreshDCNeurons call entirely - it's no longer needed
        // Our improved neuron.js code now handles connection changes without disruption
        
        // Fade in the connection
        const weight = connection.weight ?? 0.5;
        const baseOpacity = 0.1;
        const maxOpacity = 1.0; // Slightly lower max opacity
        const finalOpacity = baseOpacity + (weight * (maxOpacity - baseOpacity));
        
        gsap.to(arrow.material, {
            opacity: finalOpacity,
            duration: 0.3,
            ease: "power1.inOut"
        });
        
        gsap.to(waveformLine.material, {
            opacity: finalOpacity,
            duration: 0.3,
            ease: "power1.inOut"
        });
        
        // Visual feedback: flash both neurons green to indicate connection created
        const flashNeuronGreen = (neuron) => {
            if (!neuron || !neuron.material) return;
            
            // CRITICAL FIX: Don't block the neuron's internal updates
            // REMOVED: setExternalAnimation call that was causing neurons to freeze
            
            // Kill any existing animations on this neuron
            gsap.killTweensOf(neuron.scale);
            gsap.killTweensOf(neuron.material.color);
            
            // Store original properties
            const originalColor = neuron.material.color.clone();
            const originalScale = neuron.scale.clone();
            
            // Create a timeline for the animation
            gsap.timeline()
                // First phase: scale up and turn bright cyan
                .to(neuron.scale, {
                    x: originalScale.x * 1.5, // Bigger scale increase (was 1.3)
                    y: originalScale.y * 1.5,
                    z: originalScale.z * 1.5,
                    duration: 0.25, // Slightly longer duration
                    ease: "power3.out" // Stronger easing
                }, 0)
                .to(neuron.material.color, {
                    r: 0,
                    g: 1.5, b: 1.5, // Brighter cyan (can exceed 1.0 for extra brightness in THREE.js)
                    duration: 0.25
                }, 0)
                // Second phase: scale back and fade to original color
                .to(neuron.scale, {
                    x: originalScale.x,
                    y: originalScale.y,
                    z: originalScale.z,
                    duration: 0.4, // Slightly longer for smoother return
                    ease: "elastic.out(1.1, 0.5)" // Add elastic bounce when returning to normal size
                }, 0.25)
                .to(neuron.material.color, {
                    r: originalColor.r,
                    g: originalColor.g,
                    b: originalColor.b,
                    duration: 0.4
                }, 0.25);
        };
        
        // Create a particle explosion animation for the target neuron
        const createParticleExplosion = (neuron) => {
            if (!neuron || !neuron.position) return;
            
            // Create 8 particles in a burst around the neuron
            const numParticles = 8;
            const particleGeometry = new THREE.PlaneGeometry(0.1, 0.1);
            
            // Create bright cyan material for particles
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(0, 1.5, 1.5), // Bright cyan
                transparent: true,
                opacity: 0.9
            });
            
            for (let i = 0; i < numParticles; i++) {
                const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
                const angle = (i / numParticles) * Math.PI * 2;
                const radius = 0.2;
                
                // Position around the neuron in a circle
                particle.position.set(
                    neuron.position.x + Math.cos(angle) * radius,
                    neuron.position.y,
                    neuron.position.z + Math.sin(angle) * radius
                );
                
                // Set rotation to face camera
                particle.rotation.x = -Math.PI / 2;
                
                // Add to scene
                this.scene.add(particle);
                
                // Animate outward in a straight line
                gsap.to(particle.position, {
                    x: neuron.position.x + Math.cos(angle) * (radius * 4),
                    z: neuron.position.z + Math.sin(angle) * (radius * 4),
                    duration: 1,
                    ease: "power2.out"
                });
                
                // Fade out and remove
                gsap.to(particle.material, {
                    opacity: 0,
                    duration: 1,
                    ease: "power2.out",
                    onComplete: () => {
                        this.scene.remove(particle);
                        particle.material.dispose();
                        particle.geometry.dispose();
                    }
                });
            }
        };
        
        // Flash both neurons
        flashNeuronGreen(sourceNeuron);
        flashNeuronGreen(targetNeuron);
        
        // Add particle explosion on the target neuron only
        createParticleExplosion(targetNeuron);
        
        // Selection ring has been removed - no bounce animation needed
        
        return connectionGroup;
    }

    validateConnections() {
        for (const [group, connection] of this.connections) {
            if (!connection.arrow || !connection.arrow.parent) {
                console.warn('Invalid connection found:', connection);
                this.connections.delete(group);
                this.lastConnectionCount = this.connections.size;
            }
        }
    }

    disposeConnection(connection, connectionGroup) {
        // Store the IDs of source and target neurons to clean up related signal particles
        let sourceNeuronId = null;
        let targetNeuronId = null;
        
        // Make sure to remove the connection from the source neuron
        if (connection.source && connection.source.neuron && connection.target) {
            sourceNeuronId = connection.source.neuron.id;
            
            const targetIndex = window.circles.indexOf(connection.target);
            if (targetIndex !== -1) {
                // Get target neuron ID if possible BEFORE removing the connection
                if (connection.target.neuron) {
                    targetNeuronId = connection.target.neuron.id;
                }
                
                // Now remove the connection - this should also handle charge timeout cancellation
                connection.source.neuron.removeConnection(targetIndex);
                
                // Create connection key
                const connectionKey = `${sourceNeuronId}_${targetNeuronId}`;
                
                // Manually check and cancel any pending timeouts for this connection
                if (window.Neuron && window.Neuron.pendingChargeDeliveries && 
                    window.Neuron.pendingChargeDeliveries.has(connectionKey)) {
                    console.log(`Canceling pending charge delivery timeout for ${connectionKey}`);
                    clearTimeout(window.Neuron.pendingChargeDeliveries.get(connectionKey));
                    window.Neuron.pendingChargeDeliveries.delete(connectionKey);
                }
            }
        }
        
        // Clean up any signal particles related to this connection
        // Use the centralized static method for particle cleanup
        if (window.Neuron && typeof window.Neuron.cleanupConnectionParticles === 'function') {
            const removedCount = window.Neuron.cleanupConnectionParticles(sourceNeuronId, targetNeuronId);
            console.log(`Cleaned up ${removedCount || 0} particles for connection from ${sourceNeuronId} to ${targetNeuronId}`);
        }
        
        // Immediate cleanup of any particles in the scene that might match this connection
        // This is a more aggressive approach to ensure no orphaned particles remain
        if (window.Neuron && window.Neuron.allParticles && window.Neuron.allParticles.length > 0) {
            console.log(`Checking ${window.Neuron.allParticles.length} particles for manual cleanup`);
            
            // Create a copy of the array to safely remove items while iterating
            const particles = [...window.Neuron.allParticles];
            
            // Track removed particles
            let manuallyRemoved = 0;
            
            // Check each particle
            particles.forEach(particle => {
                if (!particle || !particle.parent) return;
                
                // Check if this particle is part of the connection being removed
                if (particle.sourceNeuronId === sourceNeuronId && particle.targetNeuronId === targetNeuronId) {
                    // Cancel any timeout
                    if (particle.timeoutId) {
                        clearTimeout(particle.timeoutId);
                    }
                    
                            // Remove from scene
                                particle.parent.remove(particle);
                            
                    // Dispose resources
                    if (particle.material) particle.material.dispose();
                    if (particle.geometry) particle.geometry.dispose();
                            
                    // Remove from global array
                            const index = window.Neuron.allParticles.indexOf(particle);
                            if (index !== -1) {
                                window.Neuron.allParticles.splice(index, 1);
                        manuallyRemoved++;
                            }
                        }
                    });
            
            if (manuallyRemoved > 0) {
                console.log(`Manually removed ${manuallyRemoved} additional particles for connection ${sourceNeuronId} -> ${targetNeuronId}`);
            }
        }
        
        // Dispose of geometries and materials
        if (connection.line) {
            connection.line.geometry.dispose();
            connection.line.material.dispose();
        }
        
        if (connection.waveformLine) {
            connection.waveformLine.geometry.dispose();
            connection.waveformLine.material.dispose();
        }
        
        if (connection.arrow) {
            connection.arrow.geometry.dispose();
            connection.arrow.material.dispose();
        }
        
        // Remove from scene and connection map
        this.scene.remove(connectionGroup);
        this.connections.delete(connectionGroup);
        
        // Force a global orphaned particle cleanup after a short delay
        // This catches any particles that might have been created after the connection was removed
        setTimeout(() => {
            if (window.Neuron && typeof window.Neuron.cleanupOrphanedParticles === 'function') {
                window.Neuron.cleanupOrphanedParticles();
            }
        }, 100);
    }

    dispose() {
        const componentId = 'connectionManager';
        
        // Use the eventManager if available
        if (window.eventManager) {
            window.eventManager.cleanupComponent(componentId);
        } else {
            // Fallback to direct event listener removal
            const canvas = this.renderer.domElement;
            canvas.removeEventListener('mousedown', this.handlePointerDown);
            canvas.removeEventListener('mousemove', this.handlePointerMove);
            canvas.removeEventListener('mouseup', this.handlePointerUp);
            canvas.removeEventListener('wheel', this.handleWheel);
            canvas.removeEventListener('mouseleave', () => this.hideWeightLabel());
            canvas.removeEventListener('touchstart', this.handlePointerDown);
            canvas.removeEventListener('touchmove', this.handlePointerMove);
            canvas.removeEventListener('touchend', this.handlePointerUp);
            canvas.removeEventListener('contextmenu', this.handleRightClick);
        }
        
        // Use the timerManager if available
        if (window.timerManager) {
            window.timerManager.clearGroup(componentId);
        } else {
            // Clear any active timeouts
            if (this.longPressTimeout) {
                clearTimeout(this.longPressTimeout);
                this.longPressTimeout = null;
            }
            
            // Clear intervals
            if (this.validationInterval) {
                clearInterval(this.validationInterval);
                this.validationInterval = null;
            }
        }
        
        // Clean up UI elements
        this.hideWeightLabel();
        
        // Use resourceManager if available to dispose THREE.js resources
        if (window.resourceManager) {
            window.resourceManager.cleanupOwner(componentId);
        } else {
            // Fallback to direct disposal
            // Dispose of geometries and materials
            if (this.arrowGeometry) this.arrowGeometry.dispose();
            if (this.arrowMaterial) this.arrowMaterial.dispose();
            
            // Clean up all connections
            this.connections.forEach(this.disposeConnection.bind(this));
        }
    }

    // Centralized method to select a connection
    selectConnection(connection) {
        // Deselect the currently selected connection if any
        if (this.selectedConnection && this.selectedConnection !== connection) {
            this.selectedConnection.arrow.material.color.setHex(0x00ffff); // Cyan for non-selected
            this.selectedConnection.arrow.scale.setScalar(0.25);
        }
        
        // Set new selection
        this.selectedConnection = connection;
        if (connection) {
            this.selectedArrow = connection.arrow;
            
            // Update the global settings - don't override existing values
            if (window.settings) {
                window.settings.selectedConnection = connection;
                
                // Only set these if they're not already set to the correct values
                // This prevents overriding the current values when selecting an already configured connection
                if (window.settings.selectedWeight !== connection.weight) {
                    window.settings.selectedWeight = connection.weight || 0.5;
                }
                
                if (window.settings.selectedSpeed !== connection.speed) {
                    window.settings.selectedSpeed = connection.speed || 0.5;
                }
                
                // Force refresh Tweakpane
                if (window.pane) {
                    window.pane.refresh();
                }
            }
            
            // Update the arrow appearance to show it's selected
            connection.arrow.material.color.setHex(0x00ff00); // Bright green for selected
            connection.arrow.scale.setScalar(0.3);
            connection.arrow.material.opacity = 1.0;
            
            // Force an update of this connection
            const connectionGroup = Array.from(this.connections.entries())
                .find(([_, conn]) => conn === connection)?.[0];
            if (connectionGroup) {
                this.updateConnection(connectionGroup);
            }
        }
    }
    
    // Method to deselect current connection
    deselectConnection() {
        if (this.selectedConnection) {
            this.selectedConnection.arrow.material.color.setHex(0x00ffff); // Cyan for non-selected
            this.selectedConnection.arrow.scale.setScalar(0.25);
            this.selectedConnection = null;
            this.selectedArrow = null;
            
            // Reset connection settings
            if (window.settings) {
                window.settings.selectedConnection = null;
                window.settings.selectedWeight = 0.5;
                window.settings.selectedSpeed = 0.5;
                
                // Force refresh Tweakpane
                if (window.pane) {
                    window.pane.refresh();
                }
            }
        }
    }

    // Handle right-click to delete connections
    handleRightClick(event) {
        // Prevent the default context menu
        event.preventDefault();
        
        // Update mouse position and raycaster
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Make intersection area much larger for better arrow detection
        const originalLineThreshold = this.raycaster.params.Line ? this.raycaster.params.Line.threshold : 1;
        if (this.raycaster.params.Line) {
            // Significantly increase the threshold to make it easier to click
            this.raycaster.params.Line.threshold = 15;
        }
        
        // Get all arrows and waveform lines for better hit detection
        const arrows = [];
        const waveformLines = [];
        
        this.connections.forEach(connection => {
            if (connection.arrow) arrows.push(connection.arrow);
            if (connection.waveformLine) waveformLines.push(connection.waveformLine);
        });
        
        // First check for intersections with arrows
        let intersects = this.raycaster.intersectObjects(arrows, false);
        
        // If no arrows were hit, try the waveform lines too
        if (intersects.length === 0) {
            intersects = this.raycaster.intersectObjects(waveformLines, false);
        }
        
        // Reset the raycaster threshold
        if (this.raycaster.params.Line) {
            this.raycaster.params.Line.threshold = originalLineThreshold;
        }
        
        // Only proceed if we actually clicked on a connection element
        if (intersects.length > 0) {
            // Find the connection that was clicked
            let connectionToDelete = null;
            let connectionGroupToDelete = null;
            const clickedObject = intersects[0].object;
            
            for (const [group, connection] of this.connections.entries()) {
                if (connection.arrow === clickedObject || connection.waveformLine === clickedObject) {
                    connectionToDelete = connection;
                    connectionGroupToDelete = group;
                    break;
                }
            }
            
            if (connectionToDelete && connectionGroupToDelete) {
                // Store references to source/target for visual feedback
                const source = connectionToDelete.source;
                const target = connectionToDelete.target;
                
                // First, flash the neurons red to indicate deletion
                if (source && target) {
                    // Flash the source and target neurons in red
                    const flashFeedback = (neuron) => {
                        if (!neuron || !neuron.material) return;
                        
                        const originalColor = neuron.material.color.clone();
                        gsap.timeline()
                            .to(neuron.material.color, {
                                r: 1,
                                g: 0,
                                b: 0,
                                duration: 0.2
                            })
                            .to(neuron.material.color, {
                                r: originalColor.r,
                                g: originalColor.g,
                                b: originalColor.b,
                                duration: 0.2
                            });
                    };
                    
                    // Flash both neurons that are involved
                    flashFeedback(source);
                    flashFeedback(target);
                }
                
                // IMPORTANT: Immediately make the connection visible and red
                // This provides visual feedback without risking animation issues
                if (connectionToDelete.arrow && connectionToDelete.arrow.material) {
                    connectionToDelete.arrow.material.color.set(0xff0000);
                    connectionToDelete.arrow.material.opacity = 1.0;
                }
                
                if (connectionToDelete.waveformLine && connectionToDelete.waveformLine.material) {
                    connectionToDelete.waveformLine.material.color.set(0xff0000);
                    connectionToDelete.waveformLine.material.opacity = 1.0;
                }
                
                // Play a sound for deletion feedback
                if (window.soundManager && typeof window.soundManager.playSmallSound === 'function') {
                    try {
                        window.soundManager.playSmallSound(0.2, 0.8, 0.5);
                    } catch (error) {
                        console.warn('Error playing connection deletion sound:', error);
                    }
                }
                
                // Use a very short timeout to ensure the red visuals render before deletion
                setTimeout(() => {
                    // Now actually delete the connection
                    if (connectionToDelete && connectionGroupToDelete) {
                        // Check if this was the selected connection and deselect if needed
                        if (this.selectedConnection === connectionToDelete) {
                            this.selectedConnection = null;
                            this.selectedArrow = null;
                            
                            // Update the UI
                            if (window.settings) {
                                window.settings.selectedConnection = null;
                                window.settings.selectedWeight = 0.5;
                                window.settings.selectedSpeed = 0.5;
                                
                                // Force refresh Tweakpane
                                if (window.pane) {
                                    window.pane.refresh();
                                }
                            }
                        }
                        
                        // Do the actual disposal
                        this.disposeConnection(connectionToDelete, connectionGroupToDelete);
                        
                        // Force a redraw to ensure changes are visible
                        this.needsUpdate = true;
                    }
                }, 50); // Short delay to ensure the red flash is visible
            }
        }
    }

    // Handle long press on mobile for connection deletion
    handleLongPress(connection) {
        // Only proceed if the connection is valid
        if (!connection || !connection.source || !connection.target) return;
        
        // Find the connection group
        let connectionGroup = null;
        for (const [group, conn] of this.connections.entries()) {
            if (conn === connection) {
                connectionGroup = group;
                break;
            }
        }
        
        if (!connectionGroup) return;
        
        // Clear the timeout
        this.longPressTimeout = null;
        
        // Get source and target
        const source = connection.source;
        const target = connection.target;
        
        // Visual feedback - pulse animation in red
        const flashFeedback = (neuron) => {
            if (!neuron || !neuron.material) return;
            
            const originalColor = neuron.material.color.clone();
            const originalScale = neuron.scale.clone();
            
            gsap.timeline()
                .to(neuron.scale, {
                    x: originalScale.x * 1.3,
                    y: originalScale.y * 1.3,
                    z: originalScale.z * 1.3,
                    duration: 0.2,
                    ease: "power2.out"
                }, 0)
                .to(neuron.material.color, {
                    r: 1,
                    g: 0,
                    b: 0,
                    duration: 0.2
                }, 0)
                .to(neuron.scale, {
                    x: originalScale.x,
                    y: originalScale.y,
                    z: originalScale.z,
                    duration: 0.2,
                    ease: "power2.in"
                }, 0.2)
                .to(neuron.material.color, {
                    r: originalColor.r,
                    g: originalColor.g,
                    b: originalColor.b,
                    duration: 0.2
                }, 0.2);
        };
        
        flashFeedback(source);
        flashFeedback(target);
        
        // Play deletion sound
        if (window.soundManager && typeof window.soundManager.playSmallSound === 'function') {
            try {
                window.soundManager.playSmallSound(0.2, 0.8, 0.5);
            } catch (error) {
                console.warn('Error playing connection deletion sound:', error);
            }
        }
        
        // Delete the connection
        this.disposeConnection(connection, connectionGroup);
        
        // Deselect the connection if it was selected
        if (this.selectedConnection === connection) {
            this.selectedConnection = null;
            this.selectedArrow = null;
            
            // Update UI
            if (window.settings) {
                window.settings.selectedConnection = null;
                window.settings.selectedWeight = 0.5;
                window.settings.selectedSpeed = 0.5;
                
                // Force refresh Tweakpane
                if (window.pane) {
                    window.pane.refresh();
                }
            }
        }
    }

    // Diagnostic function to log information about the sound manager
    logSoundManagerInfo() {
        if (!window.soundManager) {
            console.log('No soundManager available');
            return;
        }
        
        console.log('SoundManager inspection:');
        
        // Check oscillators
        if (window.soundManager.oscillators) {
            console.log('Oscillators available:', Object.keys(window.soundManager.oscillators).length);
            
            // Check first oscillator
            const firstKey = Object.keys(window.soundManager.oscillators)[0];
            if (firstKey) {
                const osc = window.soundManager.oscillators[firstKey];
                console.log('Sample oscillator structure:', Object.keys(osc));
                
                // Check if there's a method to get waveform
                console.log('Has waveform property:', !!osc.waveform);
            }
        } else {
            console.log('No oscillators property found');
        }
        
        // Check analyzer
        if (window.soundManager.waveformAnalyzer) {
            console.log('WaveformAnalyzer available');
            console.log('Analyzer methods:', Object.keys(window.soundManager.waveformAnalyzer));
            
            // Try to get a sample
            try {
                const sample = window.soundManager.waveformAnalyzer.getValue();
                console.log('Sample waveform data:', sample ? `Length: ${sample.length}` : 'No data');
                
                if (sample && sample.length > 0) {
                    console.log('First few values:', sample.slice(0, 5));
                }
            } catch (error) {
                console.log('Error getting analyzer data:', error);
            }
        }
        
        // Check for direct methods
        console.log('Has getWaveformForNeuron method:', typeof window.soundManager.getWaveformForNeuron === 'function');
    }

    // Method to change the waveform thickness
    setWaveformThickness(thickness) {
        if (thickness < 0.1) thickness = 0.1; // Minimum thickness
        if (thickness > 2.0) thickness = 2.0; // Maximum thickness
        
        this.waveformThickness = thickness;
        
        // Update all connections with new thickness
        this.connections.forEach((connection, connectionGroup) => {
            // Only update if using tube geometry
            if (connection.waveformLine && 
                connection.waveformLine.userData && 
                connection.waveformLine.userData.path) {
                
                // Create new tube geometry with updated thickness
                const newTubeGeometry = new THREE.TubeGeometry(
                    connection.waveformLine.userData.path,
                    this.waveformResolution,
                    this.waveformThickness,
                    8,
                    false
                );
                
                // Update the geometry
                connection.waveformLine.geometry.dispose();
                connection.waveformLine.geometry = newTubeGeometry;
            }
        });
        
        console.log(`Waveform thickness set to: ${thickness}`);
        return thickness;
    }

    /**
     * Force updates for all connections involving a specific neuron
     * @param {Object} neuron - The neuron that's being dragged
     */
    forceUpdateConnectionsForNeuron(neuron) {
        if (!neuron || !neuron.neuron) return;
        
        // Set drag state to true to ensure immediate updates
        this.isDraggingNeuron = true;
        
        // Track which connections we've updated
        const updatedConnections = new Set();
        
        // Clear all position caches for connections involving this neuron
        this.connections.forEach((connection, group) => {
            if (connection.source === neuron || connection.target === neuron) {
                // Clear cached positions for this connection
                const connectionId = connection.source?.neuron?.id + "_" + connection.target?.neuron?.id;
                if (connectionId) {
                    this.arrowPositionCache.delete(connectionId);
                }
                
                // Clear source/target position caches
                if (connection.source?.neuron) {
                    this.lastSourcePositions.delete(connection.source.neuron.id);
                }
                
                if (connection.target?.neuron) {
                    this.lastTargetPositions.delete(connection.target.neuron.id);
                }
                
                // Force an immediate update of this connection
                if (!updatedConnections.has(group)) {
                    this.updateConnection(group);
                    updatedConnections.add(group);
                }
            }
        });
        
        // Force a waveform update too
        if (this.frameCount % 2 !== 0) {
            this.connections.forEach(connection => {
                if (connection.source === neuron || connection.target === neuron) {
                    this.updateConnectionWaveform(connection);
                }
            });
        }
        
        // Request another update on the next frame
        this.needsUpdate = true;
    }

    // Debug method to log neuron firing state
    debugNeuronFiring() {
        // Get all neurons
        const neurons = window.circles || [];
        
        console.log(`----- Neuron Firing States (${neurons.length} neurons) -----`);
        
        let firingCount = 0;
        neurons.forEach((neuron, index) => {
            if (!neuron.neuron) return;
            
            const isFiring = neuron.neuron.isFiring;
            if (isFiring) {
                firingCount++;
                console.log(`Neuron ${neuron.neuron.id}: FIRING`);
            }
        });
        
        console.log(`Total firing neurons: ${firingCount}/${neurons.length}`);
        
        // Check connections
        console.log(`----- Connection Status (${this.connections.size} connections) -----`);
        
        let activeConnections = 0;
        this.connections.forEach((connection) => {
            const sourceNeuron = connection.source?.neuron;
            const sourceId = sourceNeuron ? sourceNeuron.id : "unknown";
            const isFiring = sourceNeuron ? sourceNeuron.isFiring : false;
            
            if (isFiring) {
                activeConnections++;
                const targetNeuron = connection.target?.neuron;
                const targetId = targetNeuron ? targetNeuron.id : "unknown";
                console.log(`Connection ${sourceId} -> ${targetId}: ACTIVE`);
            }
        });
        
        console.log(`Active connections: ${activeConnections}/${this.connections.size}`);
    }

    /**
     * Ensure a neuron exists in the centralized system
     * This is a helper method to avoid "neuron not found" errors
     * @param {string} neuronId The ID of the neuron to ensure
     * @param {Object} neuron The neuron object with properties
     * @returns {boolean} True if the neuron exists or was created
     */
    ensureNeuronExists(neuronId, circle) {
        if (!window.neuralSystem || !neuronId) return false;
        
        // Check if the neuron already exists
        if (window.neuralEngine.getNeuron(neuronId)) {
            return true;
        }
        
        console.log(`[ConnectionManager] Creating missing neuron ${neuronId} in centralized system`);
        
        // Create the neuron in the centralized system
        const baseProps = circle.neuron || {};
        const neuron = window.neuralEngine.createNeuron({
            id: neuronId,
            mesh: circle,
            position: {
                x: circle.position.x,
                y: circle.position.y,
                z: circle.position.z
            },
            baseScale: baseProps.baseScale || 0.2,
            maxScale: baseProps.maxScale || 1,
            originalColor: baseProps.originalColor || 0x0000ff,
            firingColor: baseProps.firingColor || 0xffff00,
            presetColor: baseProps.presetColor || null,
            presetName: baseProps.presetName || null,
            dcInput: baseProps.dcInput || 0
        });
        
        // Register with adapter
        if (window.neuronAdapter) {
            window.neuronAdapter.neuronMeshes.set(neuronId, circle);
        }
        
        // Store neuronId on circle
        circle.neuronId = neuronId;
        
        return true;
    }
}
