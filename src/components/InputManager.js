import * as THREE from 'three';
import gsap from 'gsap';

const INPUT_CONFIG = {
  mouse: {
    dragThreshold: 0.001,
    doubleClickDelay: 300,
    canvasDragSpeed: 0.01
  },
  touch: {
    maxDragDistance: 5.0,
    selectionThreshold: 3.5,
    doubleTapDelay: 300,
    tapDistanceThreshold: 30
  },
  animation: {
    flashDuration: 0.2,
    momentumMultiplier: 10,
    momentumDuration: 0.5
  },
  performance: {
    throttleInterval: 16, // ~60fps
    raycastDistance: 10
  },
  debug: {
    showTouchAreas: false,
    logStateTransitions: false
  }
};

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export class InputManager {
    constructor(camera, renderer, connectionManager) {
        this.camera = camera;
        this.renderer = renderer;
        this.connectionManager = connectionManager;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.draggedNeuron = null;
        this.isDragging = false;
        this.isRightClickDragging = false; // New state for right-click canvas dragging
        this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.dragOffset = new THREE.Vector3();
        this.lastPosition = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lastMousePosition = new THREE.Vector2(); // Store last mouse position for right-click drag
        this.canvasDragVelocity = new THREE.Vector3(); // Add velocity tracking for canvas drag
        
        // Force drag release when touch is too far from neuron
        this.maxDragDistance = 5.0;
        this.initialTouchPosition = new THREE.Vector3();
        this.touchTargetNeuron = null; // Explicitly track which neuron is the target of the current touch
        this.touchSelectionConfirmed = false; // Flag to track if the current touch has confirmed a neuron selection
        this.neuronSelectionThreshold = 3.5; // Detection threshold for neuron selection

        // Mobile-specific properties
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        this.lastTouchDistance = 0;
        this.isMultiTouch = false;
        this.lastTapTime = 0;
        this.doubleTapDelay = 300;
        this.lastTapPosition = { x: 0, y: 0 };
        this.tapDistanceThreshold = 30;
        
        // Debug mode for touch interaction - set to true to see touch areas
        this.debugTouchAreas = false;
        
        // If in debug mode and on mobile, make touch areas visible
        if (this.debugTouchAreas && this.isMobile) {
            setTimeout(() => {
                window.circles.forEach(circle => {
                    if (circle.touchArea) {
                        // Make touch areas semi-transparent for debugging
                        circle.touchArea.material.opacity = 0.2;
                        circle.touchArea.visible = true;
                    }
                });
            }, 1000); // Delay to ensure neurons are initialized
        }

        // For UI references
        this.ui = {
            synthFolder: null,
            neuronLabel: null,
            refreshFunctions: {}
        };
        
        // Initialize UI references with a delay
        setTimeout(() => this.initializeUI(), 500);
        
        // Mobile GUI properties - only create if on mobile
        if (this.isMobile) {
            this.selectedConnection = null;
            this.mobileControls = null;
            this.createMobileControls();
        }

        this.lastClickTime = 0;
        this.doubleClickDelay = 300; // milliseconds
        this.lastClickPosition = { x: 0, y: 0 };
        this.clickDistanceThreshold = 30;

        // Adjust this value to change canvas drag speed (0.1 = slower, 1.0 = faster)
        this.canvasDragSpeed = 0.01;
        
        // Create a pool for vector3 objects to reduce garbage collection
        this.vector3Pool = [];
        for (let i = 0; i < 10; i++) {
            this.vector3Pool.push(new THREE.Vector3());
        }

        // Initialize state management
        this.state = {
            current: 'idle',
            context: {}
        };

        // Throttle mouse/touch move events for better performance
        const throttle = (func, limit) => {
            let lastCall = 0;
            return function(...args) {
                const now = performance.now();
                if (now - lastCall >= limit) {
                    lastCall = now;
                    func.apply(this, args);
                }
            };
        };

        // Set up event handlers
        this.onMouseDownBound = this.onMouseDown.bind(this);
        this.onMouseMoveBound = this.onMouseMove.bind(this);
        this.onMouseUpBound = this.onMouseUp.bind(this);
        this.onMouseLeaveBound = this.onMouseLeave.bind(this); // NEW - mouse leave handler
        this.onTouchStartBound = this.onTouchStart.bind(this);
        this.onTouchMoveBound = this.onTouchMove.bind(this);
        this.onTouchEndBound = this.onTouchEnd.bind(this);
        this.onWheelBound = this.onWheel.bind(this);
        this.onDoubleClickBound = this.onDoubleClick.bind(this);
        this.handleRightClickBound = this.handleRightClick.bind(this);
        
        // Attach event listeners to the renderer's domElement
        renderer.domElement.addEventListener('mousedown', this.onMouseDownBound, false);
        renderer.domElement.addEventListener('mousemove', this.onMouseMoveBound, false);
        renderer.domElement.addEventListener('mouseup', this.onMouseUpBound, false);
        renderer.domElement.addEventListener('mouseleave', this.onMouseLeaveBound, false); // NEW - mouse leave event

        // Add event listeners based on device type
        if (this.isMobile) {
            renderer.domElement.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
            renderer.domElement.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
            renderer.domElement.addEventListener('touchend', this.onTouchEndBound, { passive: false });
            // Prevent context menu on long press
            renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
        } else {
            renderer.domElement.addEventListener('wheel', this.onWheelBound, { passive: false });
            renderer.domElement.addEventListener('dblclick', this.onDoubleClickBound); // Add double click for desktop
        }

        // Add a property to store the last audio time used
        this.lastAudioTime = 0;

        // Add our own context menu handler for neuron deletion
        renderer.domElement.addEventListener('contextmenu', this.handleRightClickBound);
    }

    createMobileControls() {
        this.mobileControls = document.createElement('div');
        this.mobileControls.style.position = 'fixed';
        this.mobileControls.style.bottom = '20px';
        this.mobileControls.style.left = '50%';
        this.mobileControls.style.transform = 'translateX(-50%)';
        this.mobileControls.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        this.mobileControls.style.padding = '15px';
        this.mobileControls.style.borderRadius = '10px';
        this.mobileControls.style.display = 'none';
        this.mobileControls.style.zIndex = '1000';
        this.mobileControls.style.width = '80%';
        this.mobileControls.style.maxWidth = '300px';

        const title = document.createElement('div');
        title.textContent = 'Synapse Control';
        title.style.color = 'white';
        title.style.textAlign = 'center';
        title.style.marginBottom = '15px';
        title.style.fontSize = '18px';
        this.mobileControls.appendChild(title);

        // Weight Slider
        const weightContainer = this.createSliderContainer('Weight');
        this.mobileControls.appendChild(weightContainer);

        // Speed Slider
        const speedContainer = this.createSliderContainer('Speed');
        this.mobileControls.appendChild(speedContainer);

        document.body.appendChild(this.mobileControls);
    }

    createSliderContainer(label) {
        const container = document.createElement('div');
        container.style.marginBottom = '20px';
        
        const labelElement = document.createElement('div');
        labelElement.style.color = 'white';
        labelElement.style.marginBottom = '10px';
        labelElement.style.display = 'flex';
        labelElement.style.justifyContent = 'space-between';
        labelElement.style.alignItems = 'center';
        
        const labelText = document.createElement('span');
        labelText.textContent = label;
        labelText.style.fontSize = '16px';
        labelElement.appendChild(labelText);
        
        const value = document.createElement('span');
        value.textContent = '0.50';
        value.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        value.style.padding = '4px 8px';
        value.style.borderRadius = '4px';
        value.style.fontSize = '14px';
        labelElement.appendChild(value);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = '0.5';
        slider.style.width = '100%';
        slider.style.height = '20px';
        slider.style.webkitAppearance = 'none';
        slider.style.appearance = 'none';
        slider.style.background = 'rgba(255, 255, 255, 0.1)';
        slider.style.outline = 'none';
        slider.style.borderRadius = '10px';
        slider.style.transition = 'background 0.2s';
        
        // Slider thumb styles
        const thumbStyles = `
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 24px;
                height: 24px;
                background: #4CAF50;
                border-radius: 50%;
                cursor: pointer;
                transition: background 0.2s;
            }
            input[type="range"]::-webkit-slider-thumb:hover {
                background: #45a049;
            }
            input[type="range"]::-moz-range-thumb {
                width: 24px;
                height: 24px;
                background: #4CAF50;
                border-radius: 50%;
                cursor: pointer;
                border: none;
                transition: background 0.2s;
            }
            input[type="range"]::-moz-range-thumb:hover {
                background: #45a049;
            }
        `;
    
        // Add styles to document if not already added
        if (!document.getElementById('sliderStyles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'sliderStyles';
            styleSheet.textContent = thumbStyles;
            document.head.appendChild(styleSheet);
        }
        
        slider.addEventListener('input', (e) => {
            value.textContent = parseFloat(e.target.value).toFixed(2);
            if (label === 'Weight') {
                this.updateConnectionWeight(e.target.value);
            } else {
                this.updateConnectionSpeed(e.target.value);
            }
        });
    
        container.appendChild(labelElement);
        container.appendChild(slider);
        return container;
    }

    updateMousePosition(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    updateTouchPosition(touch) {
        if (!touch) return; // Safety check
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        
        // For mobile, adjust touch position calculation for better precision
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        if (isMobile) {
            // For mobile, we need to ensure touch coordinates are properly mapped
            // to the WebGL coordinate system
            
            // Ensure we use clientX/Y which are coordinates relative to the viewport
            const touchX = touch.clientX;
            const touchY = touch.clientY;
            
            // Calculate normalized device coordinates (-1 to +1)
            // These calculations map screen coordinates to WebGL's normalized device coordinates
            this.mouse.x = ((touchX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((touchY - rect.top) / rect.height) * 2 + 1;
            
            // Optional debug visualization - uncomment to see touch points
            // this.showTouchDebug(touchX, touchY);
        } else {
            // Standard calculation for non-mobile
            this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        }
    }

    getTouchDistance(touches) {
        // Calculate the distance between two touches for pinch gesture
        if (!touches || touches.length < 2) return 0;
        
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getIntersectionPoint(mouse) {
        // Calculate where in 3D space the mouse/touch is pointing
        this.raycaster.setFromCamera(mouse, this.camera);
        const intersectionPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);
        return intersectionPoint;
    }

    updateConnectionWeight(value) {
        if (!this.isMobile || !this.selectedConnection) return;
        const newWeight = parseFloat(value);
        this.selectedConnection.weight = newWeight;
        
        const targetIndex = window.circles.indexOf(this.selectedConnection.target);
        if (this.selectedConnection.source?.neuron) {
            this.selectedConnection.source.neuron.updateConnectionWeight(targetIndex, newWeight);
        }
    }

    updateConnectionSpeed(value) {
        if (!this.isMobile || !this.selectedConnection) return;
        const newSpeed = parseFloat(value);
        this.selectedConnection.speed = newSpeed;
        
        const targetIndex = window.circles.indexOf(this.selectedConnection.target);
        if (this.selectedConnection.source?.neuron) {
            this.selectedConnection.source.neuron.updateConnectionSpeed(targetIndex, newSpeed);
        }
    }

    onTouchStart(event) {
        event.preventDefault();
        
        // Reset touch state completely
        this.touchSelectionConfirmed = false;
        this.touchTargetNeuron = null;
        
        const currentTime = new Date().getTime();
        const touch = event.touches[0];
        
        // Handle multi-touch first
        if (event.touches.length === 2) {
            this.isMultiTouch = true;
            this.lastTouchDistance = this.getTouchDistance(event.touches);
            
            // Calculate midpoint between fingers for better positioning
            const midpoint = {
                x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
                y: (event.touches[0].clientY + event.touches[1].clientY) / 2
            };
            
            // If a neuron is already selected, use it for pinch
            if (this.draggedNeuron) {
                this.updateTouchPosition({ clientX: midpoint.x, clientY: midpoint.y });
                this.touchTargetNeuron = this.draggedNeuron;
                this.touchSelectionConfirmed = true;
                console.log("Using previously selected neuron for pinch:", this.draggedNeuron.neuron?.id);
                return;
            }
            
            // Try to select a neuron at the midpoint of the pinch
            this.updateTouchPosition({ clientX: midpoint.x, clientY: midpoint.y });
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Use a larger threshold for pinch detection
            this.raycaster.params.Mesh = this.raycaster.params.Mesh || {};
            const originalThreshold = this.raycaster.params.Mesh.threshold || 0;
            this.raycaster.params.Mesh.threshold = this.neuronSelectionThreshold;
            
            const circles = [];
            window.circles.forEach(circle => {
                if (circle.touchArea) circles.push(circle.touchArea);
                circles.push(circle);
            });
            
            const intersects = this.raycaster.intersectObjects(circles);
            this.raycaster.params.Mesh.threshold = originalThreshold;
            
            if (intersects.length > 0) {
                let selectedObject = intersects[0].object;
                
                if (selectedObject.isHitArea && selectedObject.parentCircle) {
                    selectedObject = selectedObject.parentCircle;
                }
                
                this.touchTargetNeuron = selectedObject;
                this.touchSelectionConfirmed = true;
                this.selectNeuron(selectedObject); // Use centralized selection method
                console.log("Selected neuron for pinch:", this.touchTargetNeuron.neuron?.id);
            }
            
            return;
        }
        
        // Reset multi-touch state
        this.isMultiTouch = false;
        
        // Update touch position for all subsequent checks
        this.updateTouchPosition(touch);
        
        // Determine what we're touching in the 3D world
        const touchWorldPosition = this.getIntersectionPoint(this.mouse);
        this.initialTouchPosition.copy(touchWorldPosition); // Store for distance checks
        
        // Check for double tap - this needs to happen BEFORE arrow detection
        const tapPosition = { x: touch.clientX, y: touch.clientY };
        const timeDiff = currentTime - this.lastTapTime;
        const distance = Math.sqrt(
            Math.pow(tapPosition.x - this.lastTapPosition.x, 2) + 
            Math.pow(tapPosition.y - this.lastTapPosition.y, 2)
        );
        
        // Store current tap info for next time
        this.lastTapTime = currentTime;
        this.lastTapPosition = tapPosition;
        
        // If double tap detected, create a new neuron
        if (timeDiff < this.doubleTapDelay && distance < this.tapDistanceThreshold) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectionPoint = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(plane, intersectionPoint);
            
            const intersects = this.raycaster.intersectObjects(window.circles);
            if (intersects.length === 0) {
                console.log("Double tap detected, creating neuron at", intersectionPoint);
                // Create new neuron
                const neuron = window.settings.addNeuron(intersectionPoint);
                if (neuron) {
                    neuron.position.copy(intersectionPoint);
                    neuron.position.y = 0.1;
                    
                    // Update touch area position too
                    if (neuron.touchArea) {
                        neuron.touchArea.position.copy(neuron.position);
                        neuron.touchArea.position.y = 0.1;
                    }
                    
                    // Select the newly created neuron using central method
                    this.selectNeuron(neuron);
                    this.touchTargetNeuron = neuron;
                    this.touchSelectionConfirmed = true;
                    
                    // Provide visual feedback
                    gsap.from(neuron.scale, {
                        x: 0.05, y: 0.05, z: 0.05,
                        duration: 0.3,
                        ease: "back.out(1.7)"
                    });
                }
            }
            return;
        }
        
        // Check if we're clicking on an arrow using our custom method
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.isClickingOnArrow(event)) {
            // Let ConnectionManager handle arrow interactions
            // Deselect any previously selected neuron
            this.deselectNeuron();
            return;
        }
        
        // --- Look for neurons under the touch point ---
        
        // Use threshold for better touch detection
        this.raycaster.params.Mesh = this.raycaster.params.Mesh || {};
        const originalThreshold = this.raycaster.params.Mesh.threshold || 0;
        this.raycaster.params.Mesh.threshold = this.neuronSelectionThreshold;
        
        const circles = [];
        window.circles.forEach(circle => {
            if (circle.touchArea) circles.push(circle.touchArea);
            circles.push(circle);
        });
        
        const intersects = this.raycaster.intersectObjects(circles);
        this.raycaster.params.Mesh.threshold = originalThreshold;
        
        if (intersects.length > 0) {
            // Found a neuron under the touch
            let selectedObject = intersects[0].object;
            
            if (selectedObject.isHitArea && selectedObject.parentCircle) {
                selectedObject = selectedObject.parentCircle;
            }
            
            // Select the neuron using our central method
            this.selectNeuron(selectedObject);
            this.touchTargetNeuron = selectedObject;
            this.touchSelectionConfirmed = true;
            
            // Set up for dragging
            this.setState('neuronDragging', { neuron: selectedObject });
            this.dragOffset.copy(selectedObject.position).sub(touchWorldPosition);
            this.lastPosition.copy(selectedObject.position);
            
            console.log('Touch selected neuron:', selectedObject.neuron?.id);
        } else {
            // Touched empty space - deselect current neuron
            this.setState('idle');
            console.log('Touch on empty space - deselected all');
        }
    }

    onDoubleClick(event) {
        event.preventDefault();
        
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
            // Create new neuron at intersection point
            const neuron = window.settings.addNeuron(intersectionPoint);
            if (neuron) {
                // Set proper position for immediate interaction
                neuron.position.copy(intersectionPoint);
                neuron.position.y = 0.1; // Position at 0.1 instead of -10 so it's immediately visible
                
                // Update touch area position too
                if (neuron.touchArea) {
                    neuron.touchArea.position.copy(neuron.position);
                    neuron.touchArea.position.y = 0.1;
                }
                
                // Add subtle animation for visual feedback
                const originalScale = neuron.scale.clone();
                gsap.from(neuron.scale, {
                    x: 0.05,
                    y: 0.05,
                    z: 0.05,
                    duration: 0.3,
                    ease: "back.out(1.7)",
                    onComplete: () => {
                        neuron.scale.copy(originalScale);
                    }
                });
                
                // Automatically select the newly created neuron
                this.selectNeuron(neuron);
            }
        }
    }

    onTouchMove(event) {
        // Always prevent default for touch moves to prevent page scrolling
        event.preventDefault();
        
        // Ignore multi-touch events if we're in connection mode
        if (this.state === 'connection' && event.touches.length > 1) {
            return;
        }
        
        // Get the first touch
        const touch = event.touches[0];
        
        // Handle pinch gesture for DC input
        if (event.touches.length === 2) {
            // Already handled in previous version
            // Reset velocity to prevent slingshot
            this.velocity.set(0, 0, 0);
            
            const currentDistance = this.getTouchDistance(event.touches);
            // Reduce sensitivity for more controlled pinching
            const delta = (currentDistance - this.lastTouchDistance) * 0.005;
            
            // Calculate midpoint between fingers
            const midpoint = {
                x: (event.touches[0].clientX + event.touches[1].clientX) / 2,
                y: (event.touches[0].clientY + event.touches[1].clientY) / 2
            };
            
            if (this.touchTargetNeuron?.neuron) {
                const currentDC = this.touchTargetNeuron.neuron.dcInput || 0;
                // Calculate new DC input value with clamping
                const newDC = Math.max(0, Math.min(1, currentDC + delta));
                
                // Only update if change is significant and not too frequent
                // This helps prevent jitter and double-firing
                if (Math.abs(newDC - currentDC) > 0.01) {
                    this.touchTargetNeuron.neuron.setDCInput(newDC);
                    
                    // Update the neuron's visual scale using animation for smoother transition
                    const targetScale = this.touchTargetNeuron.neuron.baseScale + 
                        (this.touchTargetNeuron.neuron.maxScale - this.touchTargetNeuron.neuron.baseScale) * newDC;
                    
                    // Use GSAP for smooth animation instead of instant scale change
                    gsap.to(this.touchTargetNeuron.scale, {
                        x: targetScale,
                        y: targetScale,
                        z: targetScale,
                        duration: 0.2,
                        ease: "power2.out"
                    });
                    
                    // Also update touchArea scale proportionally
                    if (this.touchTargetNeuron.touchArea) {
                        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                        const touchScale = isMobile ? 0.1 : 1.0;
                        gsap.to(this.touchTargetNeuron.touchArea.scale, {
                            x: touchScale * targetScale / 0.2,
                            y: touchScale * targetScale / 0.2,
                            z: touchScale * targetScale / 0.2,
                            duration: 0.2,
                            ease: "power2.out"
                        });
                    }
                }
            }
            
            this.lastTouchDistance = currentDistance;
            this.lastMidpoint = midpoint; // Store midpoint for touch end
            return;
        }
        
        // We're handling a single touch - update the position
        this.updateTouchPosition(touch);
        
        // If no neuron is selected or we're not in drag mode, nothing more to do
        if (!this.touchSelectionConfirmed || !this.touchTargetNeuron) {
            return;
        }
        
        // Get the intersection point with the drag plane
        const intersectionPoint = this.getIntersectionPoint(this.mouse);
        
        // Calculate the distance from original touch position
        const distanceFromStart = this.initialTouchPosition.distanceTo(intersectionPoint);
        
        // If the touch has moved too far from its starting point, confirm we're in drag mode
        // This helps distinguish between taps and actual drag attempts
        if (distanceFromStart > 0.1) {
            this.setState('neuronDragging', { neuron: this.touchTargetNeuron });
        }
        
        // If not in drag mode, exit early
        if (this.state.current !== 'neuronDragging') {
            return;
        }
        
        // Apply the drag offset to the intersection point
        const newPosition = this.getVector3().copy(intersectionPoint).add(this.dragOffset);
        newPosition.y = 0.1;
        
        // Calculate velocity for momentum effect
        this.velocity.subVectors(newPosition, this.lastPosition);
        
        // Update position of the dragged neuron
        this.touchTargetNeuron.position.copy(newPosition);
        
        // Update touch area position too
        if (this.touchTargetNeuron.touchArea) {
            this.touchTargetNeuron.touchArea.position.copy(this.touchTargetNeuron.position);
        }
        
        // Store this position for next frame's velocity calculation
        this.lastPosition.copy(newPosition);
        
        // Update hover label for the dragged neuron too
        if (window.updateNeuronHoverLabel) {
            window.updateNeuronHoverLabel(
                this.draggedNeuron, 
                event.clientX, 
                event.clientY
            );
        }
        
        // Store a global reference to the currently dragged neuron for use in ConnectionManager
        window.draggedNeuron = this.touchTargetNeuron;
        
        // Force-update all connections related to this neuron immediately
        // This ensures the arrows follow the neuron without delay during dragging
        if (this.connectionManager && this.connectionManager.forceUpdateConnectionsForNeuron) {
            // First clear any cached positions to force fresh calculations
            if (this.connectionManager.arrowPositionCache) {
                // Find all connections involving this neuron
                this.connectionManager.connections.forEach(connection => {
                    if (connection.source === this.touchTargetNeuron || 
                        connection.target === this.touchTargetNeuron) {
                        // Clear the cached position
                        const connectionId = connection.source?.neuron?.id + "_" + connection.target?.neuron?.id;
                        if (connectionId) {
                            this.connectionManager.arrowPositionCache.delete(connectionId);
                        }
                    }
                });
            }
            
            // Then force update
            this.connectionManager.forceUpdateConnectionsForNeuron(this.touchTargetNeuron);
        }
        
        // Check for proximity connections
        this.connectionManager.checkProximityConnection(this.touchTargetNeuron);
    }

    onTouchEnd(event) {
        // If touch ended without any selection, just exit
        if (!this.touchSelectionConfirmed && !this.isMultiTouch) {
            return;
        }
        
        event.preventDefault();
        
        if (this.isMultiTouch) {
            // We were pinching - cleanup multi-touch state
            this.isMultiTouch = false;
            this.lastTouchDistance = 0;
            this.lastMidpoint = null;
        }
        
        // Capture the currently dragged neuron before we reset state
        const wasDraggingNeuron = this.state.current === 'neuronDragging';
        const draggedNeuron = this.touchTargetNeuron;
        
        // Handle momentum if we were dragging
        if (wasDraggingNeuron && this.touchTargetNeuron) {
            const speed = this.velocity.length();
            if (speed > INPUT_CONFIG.mouse.dragThreshold) {
                const targetPosition = new THREE.Vector3()
                    .copy(this.touchTargetNeuron.position)
                    .add(this.velocity.multiplyScalar(INPUT_CONFIG.animation.momentumMultiplier));
                
                // Ensure y coordinate stays at 0.1
                targetPosition.y = 0.1;
                
                // Keep a reference to the neuron that we were dragging
                const neuron = this.touchTargetNeuron;

                gsap.to(neuron.position, {
                    x: targetPosition.x,
                    z: targetPosition.z,
                    duration: INPUT_CONFIG.animation.momentumDuration,
                    ease: "power2.out",
                    onUpdate: () => {
                        // Safety check to make sure neuron and touchArea still exist
                        if (neuron && neuron.touchArea && neuron.parent) {
                            neuron.touchArea.position.copy(neuron.position);
                            this.connectionManager.checkProximityConnection(neuron);
                        } else {
                            // If the neuron has been removed, kill the animation
                            const tween = gsap.getTweenById(this);
                            if (tween) tween.kill();
                        }
                    }
                });
            }
        }
        
        // Reset touch states but keep selection
        this.setState('idle');
        this.touchSelectionConfirmed = false;
        this.touchTargetNeuron = null;
        this.velocity.set(0, 0, 0);
        window.draggedNeuron = null;  // Clear global reference
        
        // For mobile - ensure the hover label gets a timeout to hide
        // This fixes cases where the timeout wasn't set during drag operations
        const isMobile = window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isMobile && wasDraggingNeuron && draggedNeuron) {
            // Check if the hover label is visible
            const hoverLabel = document.getElementById('neuron-hover-label');
            if (hoverLabel && hoverLabel.style.display === 'block') {
                // Set a timer to hide the label after dragging is complete
                setTimeout(() => {
                    // Double check the label still exists
                    if (hoverLabel && hoverLabel.style) {
                        hoverLabel.style.display = 'none';
                    }
                    // Also clear global reference
                    window.currentHoveredNeuron = null;
                }, 1000); // 1 second timeout
            }
        }
    }

    onMouseDown(event) {
        this.updateMousePosition(event);
        
        // For touch events, create an event point
        if (event.type === 'touchstart') {
            this.touchStartTime = Date.now();
        }
        
        // Cancel any active drag operation
        this.isDragOperation = false;

        // Handle right-click canvas dragging
        if (event.button === 2) { // Right click
            // Check if we're clicking on an arrow first
            if (this.isClickingOnArrow(event)) {
                // Let ConnectionManager handle the arrow click
                return;
            }

            // If not clicking on an arrow, start canvas dragging
            this.setState('rightClickDragging', { startPosition: this.mouse.clone() });
            return;
        }

        // Determine whether we're clicking on a neuron
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Find all objects (visible and invisible)
        const intersects = this.raycaster.intersectObjects(window.circles.flatMap(circle => 
            [circle, circle.touchArea].filter(obj => obj)
        ), false);
        
        if (intersects.length > 0) {
            this.setState('neuronDragging', { neuron: intersects[0].object });
            
            let selectedObject = intersects[0].object;
            
            // If we hit a touch area, get its parent circle
            if (selectedObject.isHitArea && selectedObject.parentCircle) {
                selectedObject = selectedObject.parentCircle;
            }
            
            // Use the central selectNeuron method for consistency instead of direct calls
            this.selectNeuron(selectedObject);
            
            const intersectionPoint = this.getIntersectionPoint(this.mouse);
            this.dragOffset.copy(this.draggedNeuron.position).sub(intersectionPoint);
            this.lastPosition.copy(this.draggedNeuron.position);
        } else {
            // Clicked on empty space - deselect current neuron
            if (window.soundManager && window.selectedSynthFolder) {
                window.soundManager.deselectNeuron();
                this.toggleSynthPanel(false);
            }
            
            // Deselect connection if we're not clicking on an arrow
            // (ConnectionManager handles arrow clicks separately)
            if (this.connectionManager && !this.isClickingOnArrow(event)) {
                this.connectionManager.deselectConnection();
            }
        }
    }

    onMouseMove(event) {
        // Handle right-click canvas dragging
        if (this.state.current === 'rightClickDragging') {
            this.updateMousePosition(event);
            const deltaX = this.mouse.x - this.state.context.startPosition.x;
            const deltaY = -(this.mouse.y - this.state.context.startPosition.y);
            
            // Calculate screen-to-world scaling factor
            const rect = this.renderer.domElement.getBoundingClientRect();
            const scaleX = (rect.width / 2) * this.canvasDragSpeed;
            const scaleY = (rect.height / 2) * this.canvasDragSpeed;
            
            // Calculate movement delta
            const worldDelta = new THREE.Vector3(
                deltaX * scaleX,
                0,
                deltaY * scaleY
            );
            
            // Update velocity for momentum
            this.canvasDragVelocity.copy(worldDelta);
            
            // Move all neurons by the mouse delta
            window.circles.forEach(circle => {
                if (circle && circle.position) {
                    circle.position.add(worldDelta);
                    
                    // Update touch area position if it exists
                    if (circle.touchArea) {
                        circle.touchArea.position.copy(circle.position);
                    }
                }
            });
            
            // Update last mouse position
            this.state.context.startPosition.copy(this.mouse);
            return;
        }

        // NEW - Neuron hover detection for showing hover label
        if (this.state.current === 'idle') {
            this.updateMousePosition(event);
            
            // Check if we're hovering over a neuron
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Get all objects that could be intersected (neurons and their touch areas)
            const objects = window.circles.flatMap(circle => 
                [circle, circle.touchArea].filter(obj => obj)
            );
            
            const intersects = this.raycaster.intersectObjects(objects, false);
            
            if (intersects.length > 0) {
                // Found a neuron or touch area under the mouse
                let hoverObject = intersects[0].object;
                
                // If we hit a touch area, get its parent circle
                if (hoverObject.isHitArea && hoverObject.parentCircle) {
                    hoverObject = hoverObject.parentCircle;
                }
                
                // Update and show the hover label at the mouse position
                if (window.updateNeuronHoverLabel) {
                    window.updateNeuronHoverLabel(
                        hoverObject, 
                        event.clientX, 
                        event.clientY
                    );
                }
            } else {
                // Not hovering over a neuron, hide the label
                if (window.updateNeuronHoverLabel) {
                    window.updateNeuronHoverLabel(null);
                }
            }
        }

        if (this.state.current !== 'neuronDragging') return;
    
        this.updateMousePosition(event);
        const intersectionPoint = this.getIntersectionPoint(this.mouse);
        
        const newPosition = this.getVector3().copy(intersectionPoint).add(this.dragOffset);
        newPosition.y = 0.1;
    
        this.velocity.subVectors(newPosition, this.lastPosition);
        
        this.draggedNeuron.position.copy(newPosition);
        
        // Update touch area position too
        if (this.draggedNeuron.touchArea) {
            this.draggedNeuron.touchArea.position.copy(this.draggedNeuron.position);
        }
        
        this.lastPosition.copy(newPosition);
    
        // Update hover label for the dragged neuron too
        if (window.updateNeuronHoverLabel) {
            window.updateNeuronHoverLabel(
                this.draggedNeuron, 
                event.clientX, 
                event.clientY
            );
        }
        
        // Store a global reference to the currently dragged neuron for use in ConnectionManager
        window.draggedNeuron = this.draggedNeuron;
        
        // Force-update all connections related to this neuron immediately
        // This ensures the arrows follow the neuron without delay during dragging
        if (this.connectionManager && this.connectionManager.forceUpdateConnectionsForNeuron) {
            // First clear any cached positions to force fresh calculations
            if (this.connectionManager.arrowPositionCache) {
                // Find all connections involving this neuron
                this.connectionManager.connections.forEach(connection => {
                    if (connection.source === this.draggedNeuron || 
                        connection.target === this.draggedNeuron) {
                        // Clear the cached position
                        const connectionId = connection.source?.neuron?.id + "_" + connection.target?.neuron?.id;
                        if (connectionId) {
                            this.connectionManager.arrowPositionCache.delete(connectionId);
                        }
                    }
                });
            }
            
            // Then force update
            this.connectionManager.forceUpdateConnectionsForNeuron(this.draggedNeuron);
        }
        
        // Check for nearby neurons and trigger feedback
        const circles = window.circles || [];
        circles.forEach(otherNeuron => {
            if (!otherNeuron || otherNeuron === this.draggedNeuron) return;
            
            const distance = this.draggedNeuron.position.distanceTo(otherNeuron.position);
            const threshold = 0.5;
    
            // Check if connection exists
            let connectionExists = false;
            this.connectionManager.connections.forEach(connection => {
                if ((connection.source === this.draggedNeuron && connection.target === otherNeuron) ||
                    (connection.source === otherNeuron && connection.target === this.draggedNeuron)) {
                    connectionExists = true;
                }
            });
    
            if (distance < threshold && !connectionExists) {
                // Trigger green feedback on both neurons
                const draggedNeuron = this.draggedNeuron; // Store reference for animation
                const originalColor = draggedNeuron.material.color.clone();
                
                gsap.to(draggedNeuron.material.color, {
                    r: 0,
                    g: 1,
                    b: 0,
                    duration: 0.2,
                    onComplete: () => {
                        // Check if the neuron still exists before animating back
                        if (draggedNeuron.parent) {
                            gsap.to(draggedNeuron.material.color, {
                                r: originalColor.r,
                                g: originalColor.g,
                                b: originalColor.b,
                                duration: 0.2
                            });
                        }
                    }
                });
                
                // Also trigger feedback on the other neuron
                const otherOriginalColor = otherNeuron.material.color.clone();
                gsap.to(otherNeuron.material.color, {
                    r: 0,
                    g: 1,
                    b: 0,
                    duration: 0.2,
                    onComplete: () => {
                        // Check if the other neuron still exists
                        if (otherNeuron.parent) {
                            gsap.to(otherNeuron.material.color, {
                                r: otherOriginalColor.r,
                                g: otherOriginalColor.g,
                                b: otherOriginalColor.b,
                                duration: 0.2
                            });
                        }
                    }
                });
            }
        });
    
        // Check for connections while dragging
        this.connectionManager.checkProximityConnection(this.draggedNeuron);
    }

    onMouseUp(event) {
        // Handle right-click drag end
        if (this.state.current === 'rightClickDragging') {
            this.setState('idle');
            this.canvasDragVelocity.set(0, 0, 0);
            return;
        }

        // Check if we're dealing with a simple click vs. a drag
        const wasJustAClick = this.state.current === 'neuronDragging' && this.velocity.length() < INPUT_CONFIG.mouse.dragThreshold;
        
        if (this.state.current === 'neuronDragging' && this.draggedNeuron) {
            // Handle momentum for actual drags
            const speed = this.velocity.length();
            if (speed > INPUT_CONFIG.mouse.dragThreshold) {
                const targetPosition = new THREE.Vector3()
                    .copy(this.draggedNeuron.position)
                    .add(this.velocity.multiplyScalar(INPUT_CONFIG.animation.momentumMultiplier));
                
                // Ensure y coordinate stays at 0.1
                targetPosition.y = 0.1;
                
                // Keep a reference to the neuron that we were dragging
                const neuron = this.draggedNeuron;

                gsap.to(neuron.position, {
                    x: targetPosition.x,
                    z: targetPosition.z,
                    duration: INPUT_CONFIG.animation.momentumDuration,
                    ease: "power2.out",
                    onUpdate: () => {
                        // Safety check to make sure neuron and touchArea still exist
                        if (neuron && neuron.touchArea && neuron.parent) {
                            neuron.touchArea.position.copy(neuron.position);
                            this.connectionManager.checkProximityConnection(neuron);
                        } else {
                            // If the neuron has been removed, kill the animation
                            const tween = gsap.getTweenById(this);
                            if (tween) tween.kill();
                        }
                    }
                });
            } else if (wasJustAClick) {
                // If it was just a click (not a significant drag)
                // Just update the neuron label, don't show sound panel
                if (this.draggedNeuron && this.draggedNeuron.neuron) {
                    console.log("Neuron clicked, updated neuron label:", this.draggedNeuron.neuron.id);
                    if (window.updateNeuronLabel) {
                        window.updateNeuronLabel(this.draggedNeuron.neuron.id);
                    }
                }
            }
        }

        this.setState('idle');
        this.draggedNeuron = null;   // Reset the dragged neuron reference
        window.draggedNeuron = null;  // Clear global reference as well
        this.velocity.set(0, 0, 0);
    }

    onWheel(event) {
        event.preventDefault();
        
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(window.circles);
        
        if (intersects.length > 0) {
            const neuron = intersects[0].object;
            // Use 0.01 steps for more precise DC control
            const delta = event.deltaY > 0 ? -0.01 : 0.01;
            
            if (neuron.neuron) {
                // For better consistency, track the last DC change time
                const currentTime = performance.now();
                const lastChangeTime = neuron.neuron.lastDCChangeTime || 0;
                
                // Prevent too frequent DC changes (helps with rhythm consistency)
                if (currentTime - lastChangeTime < 50) { // 50ms minimum between changes
                    return;
                }
                
                // Calculate new DC value
                let newDC = (neuron.neuron.dcInput || 0) + delta;
                newDC = Math.max(0, Math.min(1, newDC));
                
                // Track DC change time
                neuron.neuron.lastDCChangeTime = currentTime;
                
                // If DC becomes 0, use the reset method instead of direct property assignment
                // This properly resets the neuron state through the centralized system
                if (newDC === 0) {
                    // Use the reset method which properly handles state changes
                    neuron.neuron.reset();
                }
                
                // Apply the new DC value but keep accumulated charge
                neuron.neuron.setDCInput(newDC);
                
                // Force update scale with animation for better visual feedback
                const targetScale = neuron.neuron.baseScale + 
                    (neuron.neuron.maxScale - neuron.neuron.baseScale) * newDC;
                
                gsap.to(neuron.scale, {
                    x: targetScale,
                    y: targetScale,
                    z: targetScale,
                    duration: 0.2,
                    ease: "power2.out"
                });
            }
        }
    }

    cleanup() {
        if (this.isMobile) {
            this.renderer.domElement.removeEventListener('touchstart', this.onTouchStartBound);
            this.renderer.domElement.removeEventListener('touchmove', this.onTouchMoveBound);
            this.renderer.domElement.removeEventListener('touchend', this.onTouchEndBound);
            this.renderer.domElement.removeEventListener('contextmenu', e => e.preventDefault());
            
            // Remove mobile UI elements
            if (this.mobileControls?.parentNode) {
                this.mobileControls.parentNode.removeChild(this.mobileControls);
                this.mobileControls = null;
            }
        } else {
            this.renderer.domElement.removeEventListener('mousedown', this.onMouseDownBound);
            this.renderer.domElement.removeEventListener('mousemove', this.onMouseMoveBound);
            this.renderer.domElement.removeEventListener('mouseup', this.onMouseUpBound);
            this.renderer.domElement.removeEventListener('mouseleave', this.onMouseLeaveBound); // Remove mouseleave handler
            this.renderer.domElement.removeEventListener('wheel', this.onWheelBound);
            this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClickBound); // Added this line
        }

        // Remove our context menu handler
        this.renderer.domElement.removeEventListener('contextmenu', this.handleRightClickBound);
    }

    // Method to toggle the visibility of the synth panel
    toggleSynthPanel(show, neuron = null) {
        // Get a reference to the synth folder from window
        const synthFolder = window.selectedSynthFolder;
        
        if (synthFolder) {
            if (show) {
                console.log("InputManager: Showing synth panel");
                
                // Get screen size to determine if we're in desktop mode
                const isDesktop = window.innerWidth >= 1024;
                
                // Show the panel (although in desktop mode this might already be visible)
                if (!isDesktop) {
                    // Mark the panel for CSS targeting
                    synthFolder.element.dataset.synthPanel = 'true';
                    synthFolder.element.style.display = 'block';
                    // Don't reposition the panel - CSS will handle it
                }
                
                // Make sure we have a neuron
                if (neuron && neuron.neuron) {
                    // Update the neuron label with the neuron's ID
                    if (window.updateNeuronLabel) {
                        window.updateNeuronLabel(neuron.neuron.id);
                    }
                    
                    // Default delay before refreshing
                    const refreshDelay = 10;
                    
                    // Add a small delay to ensure DOM changes have propagated
                    setTimeout(() => {
                        // Update the connection parameters in Tweakpane
                        if (window.refreshSoundControls) {
                            window.refreshSoundControls();
                        }
                        
                        // Update envelope visualization if available
                        if (window.forceRenderEnvelope) {
                            window.forceRenderEnvelope();
                        }
                    
                        // Update note button UI if needed
                        if (window.updateActiveNoteButton && window.settings.selectedNote) {
                            window.updateActiveNoteButton(window.settings.selectedNote);
                        }
                        
                        console.log("Synth panel fully refreshed");
                    }, refreshDelay); // Short delay to ensure DOM is updated
                }
            } else {
                const isDesktop = window.innerWidth >= 1024;
                
                if (!isDesktop) {
                    console.log("InputManager: Hiding synth panel");
                    // Hide the panel only in mobile mode
                    synthFolder.element.style.display = 'none';
                } else {
                    console.log("InputManager: Desktop mode - panel remains visible but shows placeholder");
                    // In desktop mode, we keep the panel visible but update to show placeholder
                    if (window.updateSynthFolderDisplay) {
                        window.updateSynthFolderDisplay();
                    }
                }
                
                // Always hide the neuron label when no neuron is selected
                if (window.updateNeuronLabel) {
                    window.updateNeuronLabel(null);
                }
                
                // Reset active note button
                if (window.updateActiveNoteButton) {
                    window.updateActiveNoteButton(null);
                }
            }
        } else {
            console.warn("InputManager: selectedSynthFolder not available");
        }
        
        // Update only the neuron label position, not the panel position
        if (window.updateNeuronLabelPosition) {
            setTimeout(() => window.updateNeuronLabelPosition(), 20);
        }
    }
    
    // --- Method to select a neuron --- 
    selectNeuron(circle) {
        if (this.draggedNeuron === circle) return; // Already selected
        this.deselectNeuron(); // Deselect previous one first
        this.draggedNeuron = circle;
        if (this.draggedNeuron && this.draggedNeuron.neuron) {
            console.log("Selected Neuron:", this.draggedNeuron.neuron.id);
            // ... existing color/visual feedback code ...
            // Selection ring has been removed - no need to update
            if (window.updateNeuronLabel) {
                window.updateNeuronLabel(this.draggedNeuron.neuron.id);
            }
            if (window.soundManager) {
                window.soundManager.selectedNeuronId = this.draggedNeuron.neuron.id;
                const params = window.soundManager.getNeuronSoundParameters(this.draggedNeuron.neuron.id);
                if (params) {
                    // Only show synth panel automatically on desktop
                    if (window.innerWidth >= 1024) {
                    this.toggleSynthPanel(true, this.draggedNeuron.neuron);
                    }
                    if (window.refreshSoundControls) {
                        window.refreshSoundControls();
                    }
                    if (this.draggedNeuron.neuron.presetName && window.highlightPresetButton) {
                        window.highlightPresetButton(this.draggedNeuron.neuron.presetName);
                    } else if (window.unhighlightActivePreset) {
                        window.unhighlightActivePreset();
                    }
                    
                    // Don't play preview sound when selecting a neuron
                    if (window.soundManager.previewDebounceTimeout) {
                        clearTimeout(window.soundManager.previewDebounceTimeout);
                    }
                }
            }
            if (window.updateNeuronGrid) {
                window.updateNeuronGrid();
            }
            // No need to reset active DC neurons on selection anymore
            // We maintain firing continuity with our improved setDCInput method
        }
    }
    
    // --- Method to deselect a neuron ---
    deselectNeuron() {
        if (this.draggedNeuron === null) return;
        
        // Return to original color if it was saved
        if (this.draggedNeuron.originalColor) {
            // Immediately set back to original color
            this.draggedNeuron.material.color.copy(this.draggedNeuron.originalColor);
            
            // If this neuron has a preset color saved, restore it
            if (this.draggedNeuron.neuron && this.draggedNeuron.neuron.presetColor) {
                this.draggedNeuron.material.color.copy(this.draggedNeuron.neuron.presetColor);
            }
        }
        
        // Tell the sound manager we're deselecting
        if (window.soundManager) {
            window.soundManager.selectedNeuronId = null;
        }
        
        // Deactivate selection ring
                    // Selection ring has been removed - no need to deselect
        
        // Hide the label
        if (window.updateNeuronLabel) {
            window.updateNeuronLabel(null);
        }
        
        // Hide synth panel
        this.toggleSynthPanel(false);
        
        // Clean up the reference
        this.draggedNeuron = null;
        
        // Update neuron grid
        if (window.updateNeuronGrid) {
            window.updateNeuronGrid();
        }
        
        // No need to reset active DC neurons on deselection anymore
        // We maintain firing continuity with our improved setDCInput method
    }
    
    handleOutsideClick(event) {
        // If the click is on the canvas, let the canvas handlers manage selection
        if (event.target === this.renderer.domElement) {
            return;
        }
        // If the click is inside the Tweakpane panel, ignore it
        if (window.pane && window.pane.element.contains(event.target)) {
             return;
        }
        
        // Otherwise, deselect any selected neuron
        this.deselectNeuron();
    }

    // Helper method to find outgoing connections from a neuron
    findOutgoingConnections(neuron) {
        if (!neuron || !this.connectionManager) return [];
        
        const outgoingConnections = [];
        this.connectionManager.connections.forEach(connection => {
            if (connection.source === neuron) {
                outgoingConnections.push(connection);
            }
        });
        
        return outgoingConnections;
    }

    // Helper to check if we're clicking on an arrow
    isClickingOnArrow(event) {
        // Properly handle touch events by extracting touch position
        if (event.touches) {
            this.updateTouchPosition(event.touches[0]);
        } else {
            this.updateMousePosition(event);
        }
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.mouse, this.camera);
        
        // For mobile, use a much larger threshold to make arrow detection easier
        if (event.touches) {
            raycaster.params.Line = raycaster.params.Line || {};
            raycaster.params.Line.threshold = 15; // Increased threshold for touch (was 10)
        }
        
        if (!this.connectionManager) return false;
        
        const arrows = Array.from(this.connectionManager.connections.values())
            .map(connection => connection.arrow)
            .filter(Boolean);
        
        const intersects = raycaster.intersectObjects(arrows);
        return intersects.length > 0;
    }

    // Helper method to visualize touch points (for debugging)
    showTouchDebug(x, y) {
        // Remove old debug element if it exists
        const oldDebug = document.getElementById('touch-debug');
        if (oldDebug) {
            document.body.removeChild(oldDebug);
        }
        
        // Create new debug element
        const debugEl = document.createElement('div');
        debugEl.id = 'touch-debug';
        debugEl.style.position = 'absolute';
        debugEl.style.left = (x - 10) + 'px';
        debugEl.style.top = (y - 10) + 'px';
        debugEl.style.width = '20px';
        debugEl.style.height = '20px';
        debugEl.style.borderRadius = '50%';
        debugEl.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        debugEl.style.pointerEvents = 'none';
        debugEl.style.zIndex = '10000';
        
        document.body.appendChild(debugEl);
        
        // Remove after a short time
        setTimeout(() => {
            if (debugEl.parentNode) {
                document.body.removeChild(debugEl);
            }
        }, 1000);
    }

    // Helper method to toggle visibility of touch areas for debugging
    toggleTouchAreaVisibility(visible) {
        this.debugTouchAreas = visible !== undefined ? visible : !this.debugTouchAreas;
        
        window.circles.forEach(circle => {
            if (circle.touchArea) {
                if (this.debugTouchAreas) {
                    circle.touchArea.material.opacity = 0.2;
                    circle.touchArea.visible = true;
                } else {
                    circle.touchArea.visible = false;
                }
            }
        });
        
        console.log(`Touch areas are now ${this.debugTouchAreas ? 'visible' : 'hidden'}`);
        return this.debugTouchAreas;
    }

    // Add helper methods
    getVector3() {
        return this.vector3Pool.pop() || new THREE.Vector3();
    }

    releaseVector3(v) {
        if (this.vector3Pool.length < 20) {
            v.set(0, 0, 0);
            this.vector3Pool.push(v);
        }
    }

    setState(newState, context = {}) {
        console.log(`State transition: ${this.state.current} -> ${newState}`);
        this.state.current = newState;
        this.state.context = {...this.state.context, ...context};
    }

    initializeUI() {
        // Only initialize if these objects/functions exist in the window
        this.ui = this.ui || {};
        this.ui.synthFolder = window.selectedSynthFolder;
        this.ui.neuronLabel = document.getElementById('neuron-label');
        
        // Initialize refresh functions object if not already
        this.ui.refreshFunctions = this.ui.refreshFunctions || {};
        this.ui.refreshFunctions.soundControls = window.refreshSoundControls;
        this.ui.refreshFunctions.activeNoteButton = window.updateActiveNoteButton;
        this.ui.refreshFunctions.neuronLabel = window.updateNeuronLabel;
        this.ui.refreshFunctions.envelope = window.forceRenderEnvelope;
        
        console.log("UI references initialized:", this.ui);
    }
    
    // Add a helper method to safely access UI elements
    getUIElement(path) {
        // Example: getUIElement("synthFolder.element") 
        const parts = path.split('.');
        let current = this.ui;
        
        for (const part of parts) {
            if (!current || current[part] === undefined) {
                return null;
            }
            current = current[part];
        }
        
        return current;
    }

    // Add a new method to handle right-click for neuron deletion
    handleRightClick(event) {
        // Prevent the default context menu
        event.preventDefault();
        
        // Update mouse position and raycaster
        this.updateMousePosition(event);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // First, check for signal particles (prioritize them)
        if (window.Neuron && window.Neuron.allParticles) {
            const particleIntersects = this.raycaster.intersectObjects(window.Neuron.allParticles);
            
            if (particleIntersects.length > 0) {
                // Found a signal particle, delete it
                const particle = particleIntersects[0].object;
                this.deleteSignalParticle(particle);
                return; // Exit after deleting a particle
            }
        }
        
        // If no particle was clicked, check for neuron intersections
        const touchAreas = window.circles
            .map(circle => circle.touchArea)
            .filter(Boolean);
        
        const intersects = this.raycaster.intersectObjects(touchAreas, false);
        
        if (intersects.length > 0) {
            // Found a neuron to delete
            const touchArea = intersects[0].object;
            if (touchArea.parentCircle && touchArea.isHitArea) {
                const neuronToDelete = touchArea.parentCircle;
                
                // Delete the neuron - the deleteNeuron method now handles all animations
                this.deleteNeuron(neuronToDelete);
            }
        }
    }
    
    // Add method to handle neuron deletion
    deleteNeuron(neuron) {
        if (!neuron) return;
        
        console.log("Deleting neuron:", neuron.neuron?.id);
        
        // Create a red particle explosion animation
        const createRedParticleExplosion = (neuron) => {
            if (!neuron || !neuron.position) return;
            
            // Create 12 particles in a burst around the neuron (more for deletion)
            const numParticles = 12;
            const particleGeometry = new THREE.PlaneGeometry(0.1, 0.1);
            
            // Create bright red material for particles
            const particleMaterial = new THREE.MeshBasicMaterial({
                color: new THREE.Color(1.5, 0, 0), // Bright red
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
                
                // Add to scene (use window.scene for the particles to outlive the neuron)
                if (window.scene) {
                    window.scene.add(particle);
                } else if (neuron.parent) {
                    neuron.parent.add(particle);
                }
                
                // Animate outward in a straight line with slightly faster speed for deletion
                gsap.to(particle.position, {
                    x: neuron.position.x + Math.cos(angle) * (radius * 5), // Increased spread
                    z: neuron.position.z + Math.sin(angle) * (radius * 5),
                    duration: 0.8, // Faster animation
                    ease: "power2.out"
                });
                
                // Fade out and remove
                gsap.to(particle.material, {
                    opacity: 0,
                    duration: 0.8, // Match position animation
                    ease: "power2.out",
                    onComplete: () => {
                        // Clean up particle from scene
                        if (particle.parent) {
                            particle.parent.remove(particle);
                        }
                        
                        // Dispose resources
                        if (particle.material) {
                            particle.material.dispose();
                        }
                        if (particle.geometry) {
                            particle.geometry.dispose();
                        }
                        
                        // Remove from global particles array
                        const index = window.Neuron.allParticles.indexOf(particle);
                        if (index !== -1) {
                            window.Neuron.allParticles.splice(index, 1);
                        }
                    }
                });
            }
        };
        
        // Trigger the particle explosion
        createRedParticleExplosion(neuron);
        
        // Get the neuron's ID before removal for use in signal particle cleanup
        const neuronId = neuron.neuron?.id;
        
        // Make the neuron flash red and shrink before deletion
        if (neuron.material) {
            const originalColor = neuron.material.color.clone();
            const originalScale = neuron.scale.clone();
            
            // Create a timeline for blinking red effect before shrinking
            const timeline = gsap.timeline();
            
            // Check if material supports emissive property (MeshStandardMaterial or MeshPhongMaterial)
            const hasEmissive = neuron.material.emissive !== undefined;
            
            // Store original emissive color if it exists
            const originalEmissive = hasEmissive ? neuron.material.emissive.clone() : null;
            
            // Add 2 red blinks (red -> original -> red) and end on red
            // Use a brighter red with r value > 1 for more intensity
            timeline.to(neuron.material.color, { 
                r: 1.6, g: 0, b: 0, 
                duration: 0.15,
                onStart: () => {
                    // Set emissive to red if supported
                    if (hasEmissive) {
                        neuron.material.emissive.set(0xff0000);
                    }
                }
            })
            .to(neuron.material.color, { 
                r: originalColor.r, 
                g: originalColor.g, 
                b: originalColor.b, 
                duration: 0.15,
                onStart: () => {
                    // Reset emissive if supported
                    if (hasEmissive && originalEmissive) {
                        neuron.material.emissive.copy(originalEmissive);
                    }
                }
            })
            .to(neuron.material.color, { 
                r: 1.6, g: 0, b: 0, 
                duration: 0.15,
                onStart: () => {
                    // Set emissive to red if supported
                    if (hasEmissive) {
                        neuron.material.emissive.set(0xff0000);
                    }
                }
            });
            
            // No shrinking animation - just delete immediately after blinking
        }
        
        // Minimal delay for the second red blink to complete
        setTimeout(() => {
            // If this was the selected neuron, deselect it first
            if (this.draggedNeuron === neuron) {
                this.deselectNeuron();
            }
            
            // Remove all connections to and from this neuron
            if (this.connectionManager) {
                // Delete connections where this neuron is the source
                for (const [group, connection] of this.connectionManager.connections.entries()) {
                    if (connection.source === neuron || connection.target === neuron) {
                        this.connectionManager.disposeConnection(connection, group);
                    }
                }
            }
            
            // Clean up all signal particles heading to or from this neuron
            if (window.Neuron && window.Neuron.allParticles && neuronId) {
                // Create a copy of the array to safely remove while iterating
                const particles = [...window.Neuron.allParticles];
                
                for (const particle of particles) {
                    // Check if this particle is heading to or from the deleted neuron
                    if (particle.targetNeuronId === neuronId || particle.sourceNeuronId === neuronId) {
                        // Visual feedback - briefly flash red before deletion
                        gsap.to(particle.material.color, {
                            r: 1, g: 0, b: 0, // Red
                            duration: 0.1,
                            onComplete: () => {
                                // Remove from scene
                                if (particle.parent) {
                                    particle.parent.remove(particle);
                                }
                                
                                // Dispose resources
                                if (particle.material) {
                                    particle.material.dispose();
                                }
                                
                                // Remove from global particles array
                                const index = window.Neuron.allParticles.indexOf(particle);
                                if (index !== -1) {
                                    window.Neuron.allParticles.splice(index, 1);
                                }
                            }
                        });
                    }
                }
            }
            
            // Clean up the neuron's resources
            if (neuron.neuron) {
                neuron.neuron.cleanup();
            }
            
            // Remove touch area from scene
            if (neuron.touchArea && neuron.touchArea.parent) {
                neuron.touchArea.parent.remove(neuron.touchArea);
                neuron.touchArea.geometry.dispose();
                neuron.touchArea.material.dispose();
            }
            
            // Remove neuron from scene
            if (neuron.parent) {
                neuron.parent.remove(neuron);
            }
            
            // Remove neuron from circles array
            const index = window.circles.indexOf(neuron);
            if (index > -1) {
                window.circles.splice(index, 1);
            }
            
            // Dispose geometry and materials
            if (neuron.geometry) neuron.geometry.dispose();
            if (neuron.material) neuron.material.dispose();
            
            // Explicitly silence any sounds associated with this neuron
            if (window.soundManager && neuronId) {
                try {
                    if (typeof window.soundManager.silenceNeuron === 'function') {
                        window.soundManager.silenceNeuron(neuronId);
                    }
                } catch (error) {
                    console.warn('Error silencing neuron during deletion:', error);
                }
            }
            
            // If this was the last neuron, silence all sounds
            if (window.circles.length === 0 && window.soundManager) {
                try {
                    if (typeof window.soundManager.silenceAllNeurons === 'function') {
                        window.soundManager.silenceAllNeurons();
                    }
                } catch (error) {
                    console.warn('Error silencing all sounds after deleting last neuron:', error);
                }
            }
            
            // Play deletion sound if sound manager exists
            if (window.soundManager && typeof window.soundManager.playSmallSound === 'function') {
                try {
                    window.soundManager.playSmallSound(0.5, 0.3, 0.7); // Different sound for neuron deletion
                } catch (error) {
                    console.warn('Error playing neuron deletion sound:', error);
                }
            }
            
            // Update the neuron grid display if available
            if (window.updateNeuronGrid) {
                window.updateNeuronGrid();
            }
        }, 350); // Only wait for the two blinks to complete (0.15 + 0.15 + 0.15 = 0.45s)
    }

    // NEW - handle mouse leave event
    onMouseLeave() {
        // Hide the hover label when the mouse leaves the canvas
        if (window.updateNeuronHoverLabel) {
            window.updateNeuronHoverLabel(null);
        }
        
        // Clear the hovered neuron reference
        window.currentHoveredNeuron = null;
    }

    // Add a new method to delete signal particles
    deleteSignalParticle(particle) {
        if (!particle) return;
        
        console.log("Deleting signal particle");
        
        // Visual feedback - briefly flash red before deletion
        gsap.to(particle.material.color, {
            r: 1, g: 0, b: 0, // Red
            duration: 0.1,
            onComplete: () => {
                // Remove from scene
                if (particle.parent) {
                    particle.parent.remove(particle);
                }
                
                // Dispose resources
                if (particle.material) {
                    particle.material.dispose();
                }
                
                // Remove from global particles array
                if (window.Neuron && window.Neuron.allParticles) {
                    const index = window.Neuron.allParticles.indexOf(particle);
                    if (index !== -1) {
                        window.Neuron.allParticles.splice(index, 1);
                    }
                }
                
                // Play a soft deletion sound if sound manager exists
                if (window.soundManager && typeof window.soundManager.playSmallSound === 'function') {
                    try {
                        window.soundManager.playSmallSound(0.3, 0.6, 0.2); // Different sound for particle deletion
                    } catch (error) {
                        console.warn('Error playing particle deletion sound:', error);
                    }
                }
            }
        });
    }
}