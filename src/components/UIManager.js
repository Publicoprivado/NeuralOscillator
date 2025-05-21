import * as THREE from 'three';
import { Pane } from 'tweakpane';
import gsap from 'gsap';
import * as Tone from 'tone';  // Import Tone for the start button's audio initialization

export class UIManager {
    constructor(scene, camera, renderer) {
        // Store references to the core components
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        // Initialize Tweakpane
        this.pane = new Pane({
            expanded: true,
        });
        window.pane = this.pane;
        
        // Initialize properties
        this.neuronLabelElement = null;
        this.neuronHoverLabel = null;
        this.startButtonContainer = null;
        
        // Skip creating animated background waveform canvas for performance optimization
        // We will use a static background instead
        this.backgroundWaveformCanvas = null;
        
        // Tutorial system
        this.tutorialActive = false;
        this.tutorialStep = 0;
        this.tutorialOverlay = null;
        
        // Setup UI styles and elements
        this.setupStyles();
        this.createUIElements();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Add a flag to track if the neural network has been started
        this.networkStarted = false;
        
        // Position elements initially
        this.positionNeuronLabel();
        
        // Initialize master limiter
        this.masterLimiter = new Tone.Limiter(-1.0); // Less aggressive limiting
        
        // Setup background waveform renderer
        this.setupBackgroundWaveform();
    }
    
    setupStyles() {
        // Load the 'Press Start 2P' font for 8-bit styling
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
        document.head.appendChild(fontLink);
        
        // Add Font Awesome for icons
        const fontAwesomeLink = document.createElement('link');
        fontAwesomeLink.rel = 'stylesheet';
        fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fontAwesomeLink);
        
        // Add styles for the application
        const style = document.createElement('style');
        style.textContent = `
            /* Base styles */
            body {
                margin: 0;
                overflow: hidden;
                font-family: --tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace
            }
            
            canvas {
                display: block;
                width: 100vw;
                height: 100vh;
            }
            
            /* Start button styles - 8-bit pixel perfect styling */
            .start-button {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 15px 30px;
                font-size: 1.2rem;
                background-color: #0066cc;
                color: white;
                cursor: pointer;
                z-index: 1000;
                font-family: 'Press Start 2P', monospace;
                letter-spacing: 1px;
                
                /* 8-bit pixel styling */
                border: none;
                border-radius: 0; /* Square corners for 8-bit look */
                border-top: 3px solid #3399ff;
                border-left: 3px solid #3399ff;
                border-bottom: 3px solid #003366;
                border-right: 3px solid #003366;
                box-shadow: 0 0 0 2px #000000, inset 0 0 3px rgba(255, 255, 255, 0.3);
                text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
                transition: all 0.1s ease;
            }

            .start-button:hover {
                background-color: #0077ee;
                transform: translate(-50%, -50%) scale(1.05);
                box-shadow: 0 0 8px rgba(0, 119, 255, 0.6), 0 0 0 2px #000000;
            }
            
            .start-button:active,
            .start-button.pressed {
                transform: translate(-50%, -50%) scale(0.95);
                border-top: 3px solid #003366;
                border-left: 3px solid #003366;
                border-bottom: 3px solid #3399ff;
                border-right: 3px solid #3399ff;
                box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.5), 0 0 0 2px #000000;
                background-color: #005599;
            }
            
            /* Sound Control Button - 8-bit pixel perfect styling */
            .sound-control-btn {
                position: fixed;
                display: none;
                background-color: #555555;
                color: #FFFFFF;
                padding: 8px 12px;
                border-radius: 0; /* Square corners for 8-bit look */
                font-size: 12px;
                font-family: 'Press Start 2P', monospace;
                pointer-events: auto;
                cursor: pointer;
                z-index: 1001;
                border: none; /* Remove default border */
                /* Beveled borders like notes buttons */
                border-top: 2px solid #777777;
                border-left: 2px solid #777777;
                border-bottom: 2px solid #333333;
                border-right: 2px solid #333333;
                box-shadow: 0 0 0 1px #000000, inset 0 0 2px rgba(255, 255, 255, 0.3);
                text-shadow: 1px 1px 0 rgba(0,0,0,0.5);
                transition: all 0.1s ease;
                line-height: 1.2;
                letter-spacing: 0px;
            }
            
            /* Hover state */
            .sound-control-btn.hover {
                background-color: #606060;
                transform: scale(1.05);
                box-shadow: 0 0 5px rgba(100, 100, 100, 0.8);
            }
            
            /* Active/pressed state */
            .sound-control-btn.active {
                transform: scale(0.95);
                border-top: 2px solid #333333;
                border-left: 2px solid #333333;
                border-bottom: 2px solid #777777;
                border-right: 2px solid #777777;
                box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.3);
            }
            
            .sound-control-btn i {
                margin-left: 5px;
                font-size: 12px;
            }
            
            /* Neuron hover label */
            .neuron-hover-label {
                position: fixed;
                display: none;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                pointer-events: none;
                z-index: 1000;
                max-width: 200px;
            }
            
            /* Tutorial overlay styles */
            .tutorial-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.7);
                z-index: 2000;
                display: flex;
                justify-content: center;
                align-items: center;
                pointer-events: all;
            }
            
            .tutorial-container {
                background-color: #222;
                padding: 20px;
                max-width: 300px;
                width: 90%;
                position: relative;
            }
            
            .tutorial-header {
                font-size: 10px;
                color: #00aaff;
                margin-bottom: 15px;
                font-weight: bold;
                text-align: center;
                font-family: -tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace;
                
            }
            
            .tutorial-content {
                color: #fff;
                margin-bottom: 20px;
                line-height: 1.5;
                font-size: 14px;
            }
            
            .tutorial-buttons {
                display: flex;
                justify-content: space-between;
            }
            
            .tutorial-button {
                background-color: #00aaff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-family: --tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace;
                font-size: 10px;
                letter-spacing: 1px;
                transition: all 0.2s ease;
            }
            
            .tutorial-button:hover {
                background-color: #0088cc;
            }
            
            .tutorial-button.secondary {
                background-color: #555;
            }
            
            .tutorial-button.secondary:hover {
                background-color: #444;
            }
            
            .tutorial-highlight {
                position: absolute;
                border: 3px dashed #00aaff;
                border-radius: 5px;
                box-shadow: 0 0 15px rgba(0, 170, 255, 0.4);
                pointer-events: none;
                z-index: 2001;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 15px rgba(0, 170, 255, 0.4); }
                50% { box-shadow: 0 0 20px rgba(0, 170, 255, 0.7); }
                100% { box-shadow: 0 0 15px rgba(0, 170, 255, 0.4); }
            }
            
            /* Global Panel Styles - base styles for all devices */
            .tp-rotv {
                box-sizing: border-box;
                position: fixed !important;
                top: 10px !important;
                z-index: 1000 !important;
                width: 300px !important;
                min-width: 300px !important;
                max-width: 90vw !important;
            }
            
            /* Mobile styles (default) - centered positioning */
            @media (max-width: 1023px) {
                .tp-rotv {
                    right: auto !important;
                    left: 50% !important;
                    transform: translateX(-50%) !important;
                }
                
                /* Hide waveform visualizer on mobile */
                #visualizer-container {
                    display: none !important;
                }
                
                #synth-panel-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background-color: rgba(0, 0, 0, 0.7);
                    z-index: 1499;
                }
                
                /* This targets the Sound Controls panel specifically */
                .tp-rotv[data-synth-panel="true"] {
                    max-height: 80vh !important;
                    overflow-y: auto !important;
                    z-index: 1500 !important;
                    background-color: rgba(40, 40, 40, 0.95) !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
            }
            
                /* Ensure panel's position doesn't get overridden during interactions */
                .tp-rotv[data-synth-panel="true"] .tp-rotv_c {
                    position: relative !important;
                }
            }
            
            /* Desktop styles - right-aligned positioning */
            @media (min-width: 1024px) {
                .tp-rotv {
                    right: 10px !important;
                    left: auto !important;
                    transform: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    createUIElements() {
        // Create Start Button
        this.createStartButton();
        
        // Create Neuron Label Element
        this.createNeuronLabel();
        
        // Create Neuron Hover Label
        this.createNeuronHoverLabel();
    }
    
    createStartButton() {
        // Create and add the start button
        this.startButtonContainer = document.createElement('div');
        this.startButtonContainer.className = 'start-button-container';

        const startButton = document.createElement('button');
        startButton.className = 'start-button';
        startButton.textContent = 'START';

        startButton.addEventListener('click', async () => {
            // Add pressed class for 8-bit pressed effect
            startButton.classList.add('pressed');
            
            // Set a small delay to show the animation
            setTimeout(async () => {
            try {
                await Tone.start();
                console.log('Audio is ready');
                if (typeof window.setupInitialNetwork === 'function') {
                    window.setupInitialNetwork();
                }
                this.startButtonContainer.style.display = 'none';
                this.networkStarted = true;
                    
                // Remove automatic tutorial start
                // this.startTutorial();
            } catch (error) {
                console.error("Error during startup:", error);
                    // Remove pressed class if error occurs
                    startButton.classList.remove('pressed');
            }
            }, 200);
        });

        this.startButtonContainer.appendChild(startButton);
        document.body.appendChild(this.startButtonContainer);
    }
    
    createNeuronLabel() {
        // Create neuron label element
        this.neuronLabelElement = document.createElement('div');
        this.neuronLabelElement.id = 'neuron-label';
        // Add our custom CSS class
        this.neuronLabelElement.className = 'sound-control-btn';
        
        // Set initial positioning only - styles will come from CSS
        this.neuronLabelElement.style.bottom = '20px';
        this.neuronLabelElement.style.right = '20px';
        this.neuronLabelElement.style.display = 'none';
        
        document.body.appendChild(this.neuronLabelElement);
        
        // Setup neuron label event listeners
        this.setupNeuronLabelEvents();
    }
    
    createNeuronHoverLabel() {
        // Create neuron hover info label element
        this.neuronHoverLabel = document.createElement('div');
        this.neuronHoverLabel.id = 'neuron-hover-label';
        this.neuronHoverLabel.style.position = 'fixed';
        this.neuronHoverLabel.style.pointerEvents = 'none'; // Make sure it doesn't interfere with mouse events
        this.neuronHoverLabel.style.padding = '5px';
        this.neuronHoverLabel.style.backgroundColor = 'transparent';
        this.neuronHoverLabel.style.color = 'white';
        this.neuronHoverLabel.style.borderRadius = '4px';
        this.neuronHoverLabel.style.display = 'none';
        this.neuronHoverLabel.style.zIndex = '1002'; // Higher than neuron label
        this.neuronHoverLabel.style.fontFamily = '--tp-base-font-family, Roboto Mono, Source Code Pro, Menlo, Courier, monospace;';
        this.neuronHoverLabel.style.fontSize = '12px'; // Slightly smaller for mobile
        this.neuronHoverLabel.style.textShadow = '0 0 4px rgba(0,0,0,0.8)'; // Add text shadow for better visibility
        document.body.appendChild(this.neuronHoverLabel);
        
        // Timer to auto-hide the label
        this.hoverLabelTimer = null;
        
        // Set up the global helper function for updating the hover label
        window.updateNeuronHoverLabel = (neuron, x, y) => {
            // Clear any existing timer
            if (this.hoverLabelTimer) {
                clearTimeout(this.hoverLabelTimer);
                this.hoverLabelTimer = null;
            }
            
            if (!neuron || !neuron.neuron) {
                this.neuronHoverLabel.style.display = 'none';
                window.currentHoveredNeuron = null;
                return;
            }
            
            const dcInput = neuron.neuron.dcInput.toFixed(2);
            const charge = neuron.neuron.currentCharge.toFixed(2);
            const id = neuron.neuron.id;
            const chargePercent = Math.round(neuron.neuron.currentCharge * 100);
            
            // Get preset name from userData or via the getter method
            let presetName = '';
            if (neuron.userData && neuron.userData.presetName) {
                presetName = neuron.userData.presetName;
            } else if (neuron.neuron && neuron.neuron.getPresetName && typeof neuron.neuron.getPresetName === 'function') {
                presetName = neuron.neuron.getPresetName();
            } else if (neuron.neuron && neuron.neuron.presetName) {
                // Fallback to direct property if we can access it
                presetName = neuron.neuron.presetName;
            }
            
            // Get preset color and convert to CSS color
            let colorStyle = '';
            if (neuron.neuron.presetColor) {
                const color = neuron.neuron.presetColor;
                // Convert THREE.Color (0-1 range) to RGB format (0-255 range)
                const r = Math.floor(color.r * 255);
                const g = Math.floor(color.g * 255);
                const b = Math.floor(color.b * 255);
                colorStyle = `color: rgb(${r}, ${g}, ${b}); text-shadow: 0 0 2px rgba(0,0,0,0.8);`;
            }
            
            // Get the note information
            let noteInfo = '';
            if (window.soundManager) {
                // Try to get the note from the neuron's sound parameters
                const params = window.soundManager.getNeuronSynthParams(neuron.neuron.id);
                if (params && params.note) {
                    // Convert frequency to note name
                    const noteFreq = params.note;
                    
                    // Find matching note in musicalNotes array
                    const noteObj = window.musicalNotes && window.musicalNotes.find(note => 
                        Math.abs(note.freq - noteFreq) < 0.1
                    );
                    
                    if (noteObj) {
                        noteInfo = `Note: ${noteObj.name}`;
                    } else {
                        noteInfo = `Note: ${noteFreq.toFixed(1)} Hz`;
                    }
                }
            }
            
            // Update label content
            this.neuronHoverLabel.innerHTML = `
                ${id}<br><strong style="${colorStyle}">${presetName}</strong><br>
                ${noteInfo ? noteInfo + '<br>' : ''}DC: ${dcInput}<br>
                ${chargePercent}%
            `;
            
            if (neuron.neuron.isFiring) {
                this.neuronHoverLabel.innerHTML += `<br><span style="color:#ffff00">Firing!</span>`;
            }
            
            // Check if we're on mobile
            const isMobile = window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            
            // Get Tweakpane position and dimensions to prevent overlap
            let tweakpaneRect = null;
            if (window.pane && window.pane.element) {
                tweakpaneRect = window.pane.element.getBoundingClientRect();
            }
            
            // Position the label differently for mobile vs desktop
            if (isMobile) {
                // Get the neuron's world position
                const worldPos = neuron.position.clone();
            
                // Project the world position to screen coordinates
                const vector = worldPos.clone().project(this.camera);
                
                // Convert the normalized device coordinates to screen coordinates
                const screenX = (vector.x + 1) / 2 * window.innerWidth;
                const screenY = -(vector.y - 1) / 2 * window.innerHeight;
                
                // Position label in the upper right of the neuron
                // Ensure it doesn't get covered by the finger during touch/drag
                let labelX = screenX + 40; // 40px to the right
                let labelY = screenY - 70; // 70px above
                
                // Check if this would overlap with Tweakpane and adjust if needed
                if (tweakpaneRect) {
                    // Create a temp div to measure the label's size
                    const tempDiv = document.createElement('div');
                    tempDiv.style.position = 'absolute';
                    tempDiv.style.visibility = 'hidden';
                    tempDiv.innerHTML = this.neuronHoverLabel.innerHTML;
                    tempDiv.style.width = 'auto';
                    tempDiv.style.padding = '5px';
                    document.body.appendChild(tempDiv);
                    const labelWidth = tempDiv.offsetWidth;
                    const labelHeight = tempDiv.offsetHeight;
                    document.body.removeChild(tempDiv);
                    
                    // Check for overlap with Tweakpane
                    if (labelX < tweakpaneRect.right && 
                        labelX + labelWidth > tweakpaneRect.left && 
                        labelY < tweakpaneRect.bottom && 
                        labelY + labelHeight > tweakpaneRect.top) {
                        
                        // Try positioning it below the neuron instead
                        labelY = screenY + 70; // 70px below
                        
                        // If still overlapping, try left side
                        if (labelY < tweakpaneRect.bottom && 
                            labelY + labelHeight > tweakpaneRect.top) {
                            labelX = screenX - labelWidth - 20; // 20px to the left
                        }
                    }
                }
                
                this.neuronHoverLabel.style.left = `${labelX}px`;
                this.neuronHoverLabel.style.top = `${labelY}px`;
                
                // Save these offsets for when we update during dragging
                this.neuronHoverLabel.dataset.offsetX = labelX - screenX;
                this.neuronHoverLabel.dataset.offsetY = labelY - screenY;
                
            } else {
                // For desktop, keep the label in its original position if it's already visible,
                // otherwise position it near the mouse pointer
                if (this.neuronHoverLabel.style.display === 'none' && x && y) {
                    const LABEL_OFFSET_X = 20;
                    const LABEL_OFFSET_Y = 10;
                    
                    let labelX = x + LABEL_OFFSET_X;
                    let labelY = y + LABEL_OFFSET_Y;
                    
                    // Check for overlap with Tweakpane
                    if (tweakpaneRect) {
                        // Create a temp div to measure the label's size
                        const tempDiv = document.createElement('div');
                        tempDiv.style.position = 'absolute';
                        tempDiv.style.visibility = 'hidden';
                        tempDiv.innerHTML = this.neuronHoverLabel.innerHTML;
                        tempDiv.style.width = 'auto';
                        tempDiv.style.padding = '5px';
                        document.body.appendChild(tempDiv);
                        const labelWidth = tempDiv.offsetWidth;
                        const labelHeight = tempDiv.offsetHeight;
                        document.body.removeChild(tempDiv);
                        
                        // Check for overlap with Tweakpane
                        if (labelX < tweakpaneRect.right && 
                            labelX + labelWidth > tweakpaneRect.left && 
                            labelY < tweakpaneRect.bottom && 
                            labelY + labelHeight > tweakpaneRect.top) {
                            
                            // Try positioning it on the left side of the cursor
                            labelX = x - labelWidth - 20;
                            
                            // If still overlapping or too close to left edge, position below cursor
                            if ((labelX < tweakpaneRect.right && 
                                labelX + labelWidth > tweakpaneRect.left && 
                                labelY < tweakpaneRect.bottom && 
                                labelY + labelHeight > tweakpaneRect.top) || 
                                labelX < 10) {
                                
                                labelX = x + LABEL_OFFSET_X;
                                labelY = y + labelHeight + 20; // Below cursor
                            }
                        }
                    }
                    
                    this.neuronHoverLabel.style.left = `${labelX}px`;
                    this.neuronHoverLabel.style.top = `${labelY}px`;
            
            // Store the offset values as data attributes for reference
                    this.neuronHoverLabel.dataset.offsetX = labelX - x;
                    this.neuronHoverLabel.dataset.offsetY = labelY - y;
                }
                // If the label is already visible, leave its position unchanged
            }
            
            this.neuronHoverLabel.style.display = 'block';
            
            // Save the reference to the neuron for real-time updates
            window.currentHoveredNeuron = neuron;
            
            // Check if the neuron is currently being dragged
            const isDragging = neuron === window.draggedNeuron;
            
            // Set a timer to hide the label after 1 second, but only on mobile and if not actively dragging
            if (isMobile && !isDragging) {
                this.hoverLabelTimer = setTimeout(() => {
                    this.neuronHoverLabel.style.display = 'none';
                    window.currentHoveredNeuron = null;
                }, 1000); // 1 second timeout
            }
        };
    }
    
    setupNeuronLabelEvents() {
        // Helper function to toggle synth panel
        const toggleSynthPanelFromLabel = () => {
            if (!window.selectedSynthFolder || !window.selectedSynthFolder.element) return;
            const panel = window.selectedSynthFolder.element;
            const isVisible = panel.style.display === 'block';
            panel.style.display = isVisible ? 'none' : 'block';
            if (!isVisible && this.isMobile() && window.updateSynthPanelMobileView) {
                window.updateSynthPanelMobileView();
            }
        };

        // Add click event
        this.neuronLabelElement.addEventListener('click', toggleSynthPanelFromLabel);
        
        // Add touch events
        this.neuronLabelElement.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            this.neuronLabelElement.classList.add('active');
        });

        this.neuronLabelElement.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.neuronLabelElement.classList.remove('active');
            
            // Simple toggle for touch events as well
            if (window.selectedSynthFolder && window.selectedSynthFolder.element) {
                const panel = window.selectedSynthFolder.element;
                const isVisible = panel.style.display === 'block';
                
                // Simply toggle display
                panel.style.display = isVisible ? 'none' : 'block';
                console.log(`Sound panel toggled to (touch): ${panel.style.display}`);
            } else {
                console.error("Sound panel not available for touch!");
            }
        });

        // Add hover effect
        this.neuronLabelElement.addEventListener('mouseenter', () => {
            // Use classList to handle hover state with CSS
            this.neuronLabelElement.classList.add('hover');
        });

        this.neuronLabelElement.addEventListener('mouseleave', () => {
            // Remove hover class when mouse leaves
            this.neuronLabelElement.classList.remove('hover');
        });

        // Add active effect
        this.neuronLabelElement.addEventListener('mousedown', () => {
            this.neuronLabelElement.classList.add('active');
        });

        this.neuronLabelElement.addEventListener('mouseup', () => {
            this.neuronLabelElement.classList.remove('active');
        });
        
        // Set up the global helper function to update the neuron label
        window.updateNeuronLabel = (neuronId) => {
            if (neuronId === null) {
                this.neuronLabelElement.style.display = 'none';
            } else {
                // Use sliders icon instead of sound icon
                this.neuronLabelElement.innerHTML = `neuron ${neuronId.toString().padStart(2, '0')} <i class="fa-solid fa-sliders"></i>`;
                
                // Make sure the element has the proper class
                if (!this.neuronLabelElement.classList.contains('sound-control-btn')) {
                    this.neuronLabelElement.className = 'sound-control-btn';
                }
                
                this.neuronLabelElement.style.display = 'block';
                
                // Add tooltip for clarity
                this.neuronLabelElement.title = "Click to toggle sound controls";
            }
        };
    }
    
    positionNeuronLabel() {
        const screenWidth = window.innerWidth;
        
        // Position based on device size
        if (screenWidth < 768) { // Phone
            this.neuronLabelElement.style.bottom = '25px';
            this.neuronLabelElement.style.right = 'auto';
            this.neuronLabelElement.style.left = '50%';
            this.neuronLabelElement.style.transform = 'translateX(-50%)';
        } else if (screenWidth < 1024) { // Tablet
            this.neuronLabelElement.style.bottom = '30px'; 
            this.neuronLabelElement.style.right = 'auto';
            this.neuronLabelElement.style.left = '50%';
            this.neuronLabelElement.style.transform = 'translateX(-50%)';
        } else { // Desktop
            // Calculate the position based on the Tweakpane panel
            const tweakpanePanel = window.pane?.element;
            if (tweakpanePanel) {
                // Position below the Tweakpane panel with extra padding
                const panelRect = tweakpanePanel.getBoundingClientRect();
                // Add at least 20px of space below the panel
                this.neuronLabelElement.style.top = (panelRect.bottom + 20) + 'px';
                this.neuronLabelElement.style.right = '20px';
                this.neuronLabelElement.style.bottom = 'auto';
                
                // Add a bit more padding on desktop for better visibility
                // but don't override other styles
                this.neuronLabelElement.style.padding = '12px 16px';
            } else {
                // Fallback if panel not found
                this.neuronLabelElement.style.top = '80px';
                this.neuronLabelElement.style.right = '20px';
                this.neuronLabelElement.style.bottom = 'auto';
            }
        }
    }
    
    setupEventListeners() {
        // Position neuron label on resize
        window.addEventListener('resize', this.positionNeuronLabel.bind(this));
        

        
        // Set up global helper to update label position only
        window.updateNeuronLabelPosition = () => {
            // Only update the neuron label position, not the panel positions
            setTimeout(() => {
                this.positionNeuronLabel.bind(this)();
            }, 50);
        };
        
        // Set up observer to reposition when Tweakpane panel changes
        setTimeout(() => {
            if (window.pane && window.pane.element) {
                const observer = new MutationObserver(this.positionNeuronLabel.bind(this));
                observer.observe(window.pane.element, { attributes: true, subtree: true, childList: true });
            }
        }, 1000);
    }
    
    isMobile() {
        return window.innerWidth < 1024;
        }
        
    // Helper method to enforce consistent tab widths
    enforcePanelWidth() {
        if (!window.selectedSynthFolder || !window.selectedSynthFolder.element) {
            return;
        }
        
        // Find all tab components and set their width
        const tabContainers = document.querySelectorAll('.tp-tabv_c, .tp-tbiv_c');
        tabContainers.forEach(container => {
            container.style.width = '100%';
            container.style.minWidth = '280px';
        });
            
        // Add observers to tabs to maintain fixed width when switching
        const tabs = document.querySelectorAll('.tp-tabv');
        tabs.forEach(tab => {
            if (!tab.dataset.hasWidthObserver) {
                const observer = new MutationObserver(() => {
                    // Force a refresh of all tab content widths
                    const tabPages = tab.querySelectorAll('.tp-tbiv_c');
                    tabPages.forEach(page => {
                        page.style.width = '100%';
                        page.style.minWidth = '280px';
                    });
                });
                
                observer.observe(tab, { childList: true, subtree: true });
                tab.dataset.hasWidthObserver = 'true';
            }
        });
    }
    
    toggleSynthPanelMobile() {
        if (!window.selectedSynthFolder || !window.selectedSynthFolder.element) {
            return;
        }
        
        const panel = window.selectedSynthFolder.element;
        const isVisible = panel.style.display === 'block';
        
        if (isVisible) {
            this.hideSynthPanelOnMobile();
        } else {
            // Mark the panel with data attribute for CSS targeting
            panel.dataset.synthPanel = 'true';
            panel.style.display = 'block';
            
            // Handle backdrop
            let backdrop = document.getElementById('synth-panel-backdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.id = 'synth-panel-backdrop';
                
                // Close panel when clicking backdrop
                backdrop.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.hideSynthPanelOnMobile();
                });
                
                document.body.appendChild(backdrop);
            }
            
            backdrop.style.display = 'block';
        }
    }
    
    hideSynthPanelOnMobile() {
        if (!window.selectedSynthFolder || !window.selectedSynthFolder.element) {
            return;
        }
        
        const panel = window.selectedSynthFolder.element;
        panel.style.display = 'none';
        
        // Hide backdrop
        const backdrop = document.getElementById('synth-panel-backdrop');
        if (backdrop) {
            backdrop.style.display = 'none';
        }
    }
    
    // Method to initialize Tweakpane with settings
    initTweakpane(settings) {
        // This is a placeholder - the actual implementation would come from main.js
        console.log('Tweakpane initialization should be implemented here');
    }
    
    // Setup background waveform renderer
    setupBackgroundWaveform() {
        // We're now using a fluid shader background instead of a static one
        // Remove any existing background elements
        
        // Remove the animated waveform canvas if it exists
        if (this.backgroundWaveformCanvas) {
            if (this.backgroundWaveformCanvas.parentNode) {
                this.backgroundWaveformCanvas.parentNode.removeChild(this.backgroundWaveformCanvas);
            }
            this.backgroundWaveformCanvas = null;
        }
        
        // Cancel any existing animation frame
        if (this.backgroundWaveformAnimationFrame) {
            cancelAnimationFrame(this.backgroundWaveformAnimationFrame);
            this.backgroundWaveformAnimationFrame = null;
        }
        
        // Remove the static background element if it exists
        const existingBackground = document.getElementById('static-background');
        if (existingBackground && existingBackground.parentNode) {
            existingBackground.parentNode.removeChild(existingBackground);
        }
        
        // The fluid background is now handled by the SceneManager
        console.log('Using fluid background shader for interactive effects');
    }
    
    // Tutorial methods
    startTutorial() {
        console.log('Starting tutorial');
        this.tutorialActive = true;
        this.tutorialStep = 0;
        this.showTutorialStep(this.tutorialStep);
    }
    
    showTutorialStep(step) {
        // Clear any previous tutorial UI
        this.clearTutorialUI();
        
        // Tutorial steps content
        const tutorialSteps = [
            {
                title: "Creating Neurons",
                content: "Double-click anywhere on the canvas to create a new neuron.",
                nextLabel: "Next",
                skipLabel: "Skip Tutorial",
                highlight: { type: "canvas" }
            },
            {
                title: "Connecting Neurons",
                content: "Drag one neuron close to another.",
                nextLabel: "Next",
                skipLabel: "Skip"
            },
            {
                title: "Adjusting Connection Weight",
                content: "Mouse wheel when hovering over the connection arrow increases the amount of charge sent.",
                nextLabel: "Next",
                skipLabel: "Skip"
            },
            {
                title: "Setting DC Input",
                content: "Mouse wheel over a neuron to apply stimuli, so the neuron fires on its own.",
                nextLabel: "Next",
                skipLabel: "Skip"
            },
            {
                title: "Adjusting Sound",
                content: "Use the control panel to adjust its sound properties like pitch, envelope, and effects.",
                nextLabel: "Next",
                skipLabel: "Skip",
                highlight: { type: "controlPanel" }
            },
        ];
        
        // If we've reached the end of the tutorial, clean up and return
        if (step >= tutorialSteps.length) {
            this.endTutorial();
            return;
        }
        
        const currentStep = tutorialSteps[step];
        
        // Create the tutorial overlay - make it non-blocking
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.style.backgroundColor = 'transparent';
        overlay.style.pointerEvents = 'none'; // Make it non-blocking
        
        // Create the tutorial container positioned at the bottom
        const container = document.createElement('div');
        container.className = 'tutorial-container';
        container.style.position = 'absolute';
        container.style.bottom = '10%';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.maxWidth = '80%';
        container.style.width = 'auto';
        container.style.backgroundColor = 'transparent';
        container.style.borderRadius = '10px';
        container.style.padding = '15px';
        container.style.textAlign = 'center';
        container.style.pointerEvents = 'auto'; // Make buttons clickable
        
        // Create title
        const header = document.createElement('div');
        header.className = 'tutorial-header';
        header.textContent = currentStep.title;
        header.style.fontSize = '14px';
        header.style.marginBottom = '10px';
        header.style.color = '#ffffff';
        container.appendChild(header);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'tutorial-content';
        content.textContent = currentStep.content;
        content.style.fontSize = '14px';
        content.style.marginBottom = '15px';
        content.style.color = '#ffffff';
        container.appendChild(content);
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'tutorial-buttons';
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.justifyContent = 'center';
        buttonsContainer.style.gap = '10px';
        
        // Create next button
        const nextButton = document.createElement('button');
        nextButton.className = 'tutorial-button';
        nextButton.textContent = 'next';
        nextButton.style.fontSize = '12px';
        nextButton.style.padding = '6px 12px';
        nextButton.addEventListener('click', () => this.nextTutorialStep());
        buttonsContainer.appendChild(nextButton);
        
        container.appendChild(buttonsContainer);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
        
        // Store reference to the tutorial overlay
        this.tutorialOverlay = overlay;
        
        // Add highlight if specified
        if (currentStep.highlight) {
            this.addHighlight(currentStep.highlight);
        }
    }
    
    nextTutorialStep() {
        this.tutorialStep++;
        this.showTutorialStep(this.tutorialStep);
    }
    
    endTutorial() {
        this.tutorialActive = false;
        this.clearTutorialUI();
        
        // Create completion message in tutorial style
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.style.backgroundColor = 'transparent';
        overlay.style.pointerEvents = 'none';
        
        const container = document.createElement('div');
        container.className = 'tutorial-container';
        container.style.position = 'absolute';
        container.style.bottom = '10%';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.maxWidth = '80%';
        container.style.width = 'auto';
        container.style.backgroundColor = 'transparent';
        container.style.borderRadius = '10px';
        container.style.padding = '15px';
        container.style.textAlign = 'center';
        container.style.pointerEvents = 'auto';
        
        const content = document.createElement('div');
        content.className = 'tutorial-content';
        content.textContent = "Tutorial completed!";
        content.style.fontSize = '14px';
        content.style.color = '#ffffff';
        content.style.textShadow = '0 0 4px rgba(0,0,0,0.8)';
        
        container.appendChild(content);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
            }
        }, 3000);
    }
    
    clearTutorialUI() {
        if (this.tutorialOverlay) {
            document.body.removeChild(this.tutorialOverlay);
            this.tutorialOverlay = null;
        }
        
        // Remove any highlights
        const highlights = document.querySelectorAll('.tutorial-highlight');
        highlights.forEach(highlight => {
            document.body.removeChild(highlight);
        });
    }
    
    addHighlight(highlightInfo) {
        const highlight = document.createElement('div');
        highlight.className = 'tutorial-highlight';
        
        // Position based on type
        if (highlightInfo.type === 'canvas') {
            // Highlight the canvas area
            highlight.style.position = 'fixed';
            highlight.style.top = '0';
            highlight.style.left = '0';
            highlight.style.width = '100%';
            highlight.style.height = '100%';
            highlight.style.border = 'none';
            highlight.style.boxShadow = 'inset 0 0 30px rgba(0, 170, 255, 0.4)';
        } else if (highlightInfo.type === 'controlPanel') {
            // Highlight the control panel
            if (window.pane && window.pane.element) {
                const rect = window.pane.element.getBoundingClientRect();
                highlight.style.top = `${rect.top - 5}px`;
                highlight.style.left = `${rect.left - 5}px`;
                highlight.style.width = `${rect.width + 10}px`;
                highlight.style.height = `${rect.height + 10}px`;
            }
        }
        
        document.body.appendChild(highlight);
    }
    
    showNotification(message, duration = 3000) {
        // Create a notification element
        const notification = document.createElement('div');
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.backgroundColor = '#00aaff';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '2000';
        notification.style.fontFamily = 'sans-serif';
        notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, duration);
    }
} 