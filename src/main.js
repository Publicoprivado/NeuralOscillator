// Add right at the beginning of main.js, before any other initialization
document.body.style.backgroundColor = 'transparent'; // Ensure body doesn't cover our fluid background

import * as THREE from 'three';
import * as Tone from 'tone';  // Add Tone import
import { initializeManagers, patchExistingCode } from './components/initManagers.js';
import { Neuron } from './components/neuron.js';  // Note the .js extension
import { InputManager } from './components/InputManager';
import { ConnectionManager } from './components/ConnectionManager';
import { OptimizedSoundManager } from './components/OptimizedSoundManager.js';
import { WorkerManager } from './components/WorkerManager.js'; // Import WorkerManager
import { HarmonicSystem } from './components/HarmonicSystem.js'; // Import the HarmonicSystem
import { UIManager } from './components/UIManager.js'; // Import the UIManager
import { SceneManager } from './components/SceneManager.js'; // Import the SceneManager

import soundPresets from './config/soundPresets.js'; // Import sound presets

import gsap from 'gsap';

// Initialize all managers (timer, event, resource)
initializeManagers();

// Patch existing code to use managers (optional, comment out if causing issues)
// patchExistingCode();

// Clear any existing random sound timers
if (window.randomSoundsTimerId) {
    clearTimeout(window.randomSoundsTimerId);
    window.randomSoundsTimerId = null;
}

// Pre-create reusable objects
const vector3 = new THREE.Vector3();
let lastFrameTime = 0;
const frameInterval = 1000 / 240; // Target 240 FPS
let frameCount = 0; // For animation updates

// Initialize SceneManager
const sceneManager = new SceneManager();
window.sceneManager = sceneManager;

// Get references to scene, camera, and renderer from SceneManager
const scene = sceneManager.getScene();
const camera = sceneManager.getCamera();
const renderer = sceneManager.getRenderer();

// Configure scene specific settings
scene.matrixAutoUpdate = false; // Disable automatic matrix updates

// Initialize arrays
window.circles = [];

// Initialize UI Manager
const uiManager = new UIManager(scene, camera, renderer);
window.uiManager = uiManager;

// No longer making the panel draggable as it conflicts with CSS positioning
// uiManager.makePaneDraggable();

// Create shared geometries and materials
const circleGeometry = new THREE.PlaneGeometry(1.0, 1.0);
circleGeometry.computeBoundingSphere();

// Create a larger geometry for touch/click detection (invisible)
const touchGeometry = new THREE.PlaneGeometry(6.0, 6.0);
touchGeometry.computeBoundingSphere();

// Modified to use instancing - vertexColors allows customization per instance
const neuronMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff, // White base color - will be multiplied by vertex colors
    side: THREE.FrontSide,
    transparent: false,
    depthTest: true,
    depthWrite: true,
    precision: 'lowp'
});

// Invisible material for touch detection
const touchMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.0,
    side: THREE.FrontSide,
    depthTest: false,
    depthWrite: false
});

// Create window.settings object
window.settings = {
    // Neuron properties
    selectedNeuron: null,
    
    // Connection properties
    selectedConnection: null,
    selectedWeight: 0.5,
    selectedSpeed: 0.5,
    
    // Audio
    volume: -6,
    volumeNormalization: 1.0,  // Default volume normalization factor
    
    // Selected neuron synth parameters
    selectedPitchDecay: 0.05,
    selectedDetune: 0,
    selectedNeuronVolume: 0,  // Individual neuron volume offset
    selectedAttack: 0.002,
    selectedDecay: 0.3,
    selectedSustain: 0.2,     // Added sustain parameter
    selectedRelease: 0.8,
    selectedNote: null,       // No default frequency
    selectedNoteIndex: null,  // No default note index
    selectedOscillatorType: "triangle", // Default oscillator type
    selectedAttackCurve: "exponential", // Default envelope curve
    selectedUseSustainedTone: false,    // Toggle for sustained tones
    
    // Harmony controls
    isHarmonyAnchor: false,    // Added toggle for harmony anchor
    harmonyStrength: 0.5,      // Global harmony strength
    harmonyDebug: false,       // Debug mode for harmony system
    
    // Filter parameters
    selectedFilterType: "lowpass",
    selectedFilterFrequency: 5000,
    selectedFilterQ: 1,
    
    // Effect send parameters
    selectedReverbSend: 0.2,
    selectedDelaySend: 0.15,
    
    // Modulation parameters
    selectedTremoloFreq: 4,
    selectedTremoloDepth: 0,
    selectedVibratoFreq: 5,
    selectedVibratoDepth: 0,
    
    // Preview sound toggle
    previewSounds: false,
    
    // Spatial audio toggle
    spatialAudioEnabled: false,
    
    // Methods for UI interaction
    addNeuron: (position) => {
        const neuron = createNewNeuron(position);
        window.circles.push(neuron);
        scene.add(neuron);
        return neuron;
    },
    masterCompressor: {
        threshold: -18,    // Even higher threshold to catch peaks earlier
        ratio: 2.5,        // More gentle ratio for transparent compression
        attack: 0.02,      // Slower attack to avoid choking the transients
        release: 0.4,      // Much longer release for smoother compression between triggers
        knee: 20           // Very wide knee for ultra-smooth compression
    }
};

// Add Tweakpane controls
try {
    // Set fixed size for the Tweakpane panel
    pane.element.style.width = '300px';
    pane.element.style.maxWidth = '300px';
    pane.element.style.minWidth = '300px';
    
    // Prevent scaling when sliders change
    pane.on('change', () => {
        pane.element.style.width = '300px';
        pane.element.style.transform = 'none';
    });
    
    // Add additional event listener to prevent panel movement during slider interaction
    setTimeout(() => {
        // Find all slider elements
        const sliders = pane.element.querySelectorAll('.tp-sldv_i');
        sliders.forEach(slider => {
            slider.addEventListener('mousedown', (e) => {
                e.stopPropagation(); // Prevent event from propagating to panel dragging
            });
            
            slider.addEventListener('mousemove', (e) => {
                e.stopPropagation(); // Prevent event from propagating to panel dragging
            });
        });
        
        // Also stop propagation for all inputs and controls
        const controls = pane.element.querySelectorAll('input, button, .tp-rotv_c');
        controls.forEach(control => {
            control.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        });
    }, 200);
    
    // Add neuron grid visualization directly to the main pane
    setTimeout(() => {
        // Find the pane element
        const paneElement = pane.element;
        if (paneElement) {
            // Create grid container
            const gridContainer = document.createElement('div');
            gridContainer.id = 'neuron-grid-container';
            
            // Fixed settings, no dynamic calculations
            gridContainer.style.display = 'flex';
            gridContainer.style.flexWrap = 'wrap';
            gridContainer.style.padding = '0';
            gridContainer.style.margin = '8px 0';
            gridContainer.style.background = 'rgba(0, 0, 0, 0.2)';
            gridContainer.style.width = '280px'; // Exactly 14 cells of 20px each
            gridContainer.style.fontSize = '0';
            gridContainer.style.lineHeight = '0';
            
            // Insert into the pane
            paneElement.appendChild(gridContainer);
            
            // Define the update function
            window.updateNeuronGrid = function() {
                updateNeuronGridDisplay();
            };
            
            // Initial update
            updateNeuronGridDisplay();
        }
    }, 100);
    
    // Add event listeners for neuron state updates to improve synchronization
window.addEventListener('neuronChargeUpdate', (event) => {
    const { neuronId, charge, threshold, isFiring, dcInput } = event.detail;
    
    // Update the hover label if this is the currently hovered neuron
    if (window.currentHoveredNeuron && 
        window.currentHoveredNeuron.neuron && 
        window.currentHoveredNeuron.neuron.id === neuronId) {
        
        // Get the current mouse position from the label position
        if (uiManager.neuronHoverLabel && uiManager.neuronHoverLabel.style.display === 'block') {
            // Extract current position and get back to original mouse coordinates
            const currentLeft = parseInt(uiManager.neuronHoverLabel.style.left);
            const currentTop = parseInt(uiManager.neuronHoverLabel.style.top);
            
            // Get the defined offsets or use defaults if not available
            const offsetX = parseInt(uiManager.neuronHoverLabel.dataset.offsetX || 30);
            const offsetY = parseInt(uiManager.neuronHoverLabel.dataset.offsetY || -20);
            
            // Calculate the original mouse position by removing the offsets
            const originalX = currentLeft - offsetX;
            const originalY = currentTop - offsetY;
            
            // Update the label with the original mouse position - let UIManager apply the offsets
            updateNeuronHoverLabel(window.currentHoveredNeuron, originalX, originalY);
        }
    }
    
    // Only update grid on significant charge changes to avoid performance issues
    if (charge === 0 || charge >= threshold || (charge * 100) % 10 < 0.1) {
        requestAnimationFrame(() => {
            if (window.updateNeuronGrid) {
                window.updateNeuronGrid();
            }
        });
    }
});

// Add event listener for neuron reset
window.addEventListener('neuronReset', (event) => {
    const { neuronId } = event.detail;
    
    // Update grid to reflect reset state
    requestAnimationFrame(() => {
        if (window.updateNeuronGrid) {
            window.updateNeuronGrid();
        }
    });
});

// Function to update the neuron grid display
function updateNeuronGridDisplay() {
    const gridContainer = document.getElementById('neuron-grid-container');
    if (!gridContainer) return;
    
    // Clear existing grid elements
    while (gridContainer.firstChild) {
        gridContainer.removeChild(gridContainer.firstChild);
    }
    
    // Update grid container style
    gridContainer.style.background = 'rgba(0, 0, 0, 0.2)';
    gridContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    gridContainer.style.borderRadius = '4px';
    gridContainer.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.2)';
    gridContainer.style.padding = '4px';
    
    // Fixed cell size of 20px, 14 per row
    const CELL_SIZE = 20;
    const CELLS_PER_ROW = 14;
    
    // Create a grid wrapper
    const gridWrapper = document.createElement('div');
    gridWrapper.style.display = 'flex';
    gridWrapper.style.flexWrap = 'wrap';
    gridWrapper.style.gap = '2px';
    gridWrapper.style.justifyContent = 'center';
    gridContainer.appendChild(gridWrapper);
    
    // Add only cells for existing neurons - no placeholders
    window.circles.forEach((circle) => {
        const neuronElement = document.createElement('div');
        neuronElement.style.width = CELL_SIZE + 'px';
        neuronElement.style.height = CELL_SIZE + 'px';
        neuronElement.style.cursor = 'pointer';
        neuronElement.style.margin = '0';
        neuronElement.style.padding = '0';
        neuronElement.style.boxSizing = 'border-box';
        neuronElement.style.display = 'inline-block';
        neuronElement.style.border = 'none';
        neuronElement.style.borderRadius = '0';
        neuronElement.style.boxShadow = 'none';
        neuronElement.style.transition = 'transform 0.15s, box-shadow 0.15s, border 0.15s, filter 0.15s';
        
        // Store the neuron ID as a data attribute for easier updates
        if (circle.neuron) {
            neuronElement.dataset.neuronId = circle.neuron.id;
        }
        
        // Calculate color based on neuron state and preset color
        const neuron = circle.neuron;
        if (neuron) {
            // Get the preset color if it exists
            const presetColor = neuron.presetColor;
            
            // Get firing state
            if (neuron.isFiring) {
                // Bright yellow when firing, regardless of preset
                neuronElement.style.backgroundColor = '#ffff00';
                neuronElement.style.border = '1px solid #aaaa00';
                neuronElement.style.boxShadow = '0 0 5px rgba(255, 255, 0, 0.7)';
                
                // Add a tooltip showing the preset name if available
                if (neuron.presetName) {
                    neuronElement.title = `${neuron.presetName} (Neuron ${neuron.id}) - Firing!`;
                } else {
                    neuronElement.title = `Neuron ${neuron.id} - Firing!`;
                }
            } else if (presetColor) {
                // Use the preset color, influenced by charge
                const chargeValue = neuron.currentCharge || 0;
                const r = Math.floor(presetColor.r * 255);
                const g = Math.floor(presetColor.g * 255);
                const b = Math.floor(presetColor.b * 255);
                neuronElement.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
                
                
                // Add a subtle glow effect based on the preset color
                neuronElement.style.boxShadow = `0 0 3px rgba(${r}, ${g}, ${b}, 0.8)`;
                
                // Add a tooltip showing the preset name
                neuronElement.title = `${neuron.presetName} (Neuron ${neuron.id})`;
                if (chargeValue > 0) {
                    neuronElement.title += ` - Charging: ${Math.round(chargeValue * 100)}%`;
                }
                if (neuron.dcInput > 0) {
                    neuronElement.title += ` - DC: ${neuron.dcInput.toFixed(2)}`;
                }
                
                // If neuron has DC input, add a subtle pulsing animation
                if (neuron.dcInput > 0) {
                    neuronElement.style.animation = 'neuronPulse 2s infinite';
                    
                    // Create the animation if it doesn't exist yet
                    if (!document.getElementById('neuronPulseStyle')) {
                        const style = document.createElement('style');
                        style.id = 'neuronPulseStyle';
                        style.textContent = `
                            @keyframes neuronPulse {
                                0% { filter: brightness(1); }
                                50% { filter: brightness(1.3); }
                                100% { filter: brightness(1); }
                            }
                        `;
                        document.head.appendChild(style);
                    }
                }
            } else {
                // Default color with charge influence
                const chargeValue = neuron.currentCharge || 0;
                const green = Math.floor(Math.min(0.2, chargeValue) * 255);
                neuronElement.style.backgroundColor = `rgb(0, ${green}, 255)`;
                neuronElement.title = `Neuron ${neuron.id}`;
                if (chargeValue > 0) {
                    neuronElement.title += ` - Charging: ${Math.round(chargeValue * 100)}%`;
                }
                if (neuron.dcInput > 0) {
                    neuronElement.title += ` - DC: ${neuron.dcInput.toFixed(2)}`;
                }
                
                // DC input animation
                if (neuron.dcInput > 0) {
                    neuronElement.style.animation = 'neuronPulse 2s infinite';
                }
            }
        } else {
            neuronElement.style.backgroundColor = '#0000ff'; // Default blue
            neuronElement.title = 'Default neuron';
        }
        
        // Add hover effect
        neuronElement.addEventListener('mouseenter', () => {
            neuronElement.style.transform = 'scale(1.2)';
            neuronElement.style.zIndex = '10';
            neuronElement.style.boxShadow = '0 2px 8px rgba(255, 255, 255, 0.5)';
            neuronElement.style.border = '1px solid rgba(255, 255, 255, 0.9)';
        });
        
        neuronElement.addEventListener('mouseleave', () => {
            neuronElement.style.transform = 'scale(1)';
            neuronElement.style.zIndex = '1';
            neuronElement.style.boxShadow = 'none';
            neuronElement.style.border = 'none';
        });
        
        // Add click handler to select the neuron
        neuronElement.addEventListener('click', () => {
            if (inputManager) {
                inputManager.selectNeuron(circle);
            }
        });
        
        gridWrapper.appendChild(neuronElement);
    });
}

    // Make sure to export the function to the global window object
    window.updateNeuronGrid = updateNeuronGridDisplay;

    // Remove the volume control - as requested
    // const volumeControl = pane.addBinding(window.settings, 'volume', {
    //     min: -48,
    //     max: 6,
    //     step: 1,
    //     label: 'Volume (dB)'
    // }).on('change', (ev) => {
    //     if (window.soundManager) {
    //         window.soundManager.setVolume(ev.value);
    //     }
    // });

    // Weight and Speed controls removed as requested

    // Store references to the control elements for toggling visibility
    // Wait a moment to ensure the DOM is fully processed
    setTimeout(() => {
        // Find the parent elements for each control - going up to the container level
        const findControlContainer = (control) => {
            if (!control || !control.element) return null;
            
            // The actual controller is the first parent
            const controller = control.element.parentElement;
            if (!controller) return null;
            
            // The container is the next parent level
            return controller.parentElement;
        };
        
        // All controls are removed as requested
        window.globalControls = {};
        
        console.log("Global controls initialized:", window.globalControls);
    }, 100);

    // Connection update logic and controls removed as requested

    // --- Add Selected Neuron Synth Parameters ---
    const selectedSynthFolder = pane.addFolder({
        title: 'Sound Controls',
        expanded: true // Start expanded when visible
    });
    
    // Master Compressor removed as requested
    
    // Set initial display state - hidden until a neuron is selected
    selectedSynthFolder.element.style.display = 'none'; 
    
    // Immediately make it available globally
    window.selectedSynthFolder = selectedSynthFolder;
    console.log("Sound controls folder created and assigned to global variable");
    
    // Function to handle display of the synth folder based on device type
    window.updateSynthFolderDisplay = function() {
        const screenWidth = window.innerWidth;
        const isDesktop = screenWidth >= 1024;
        
        if (isDesktop) {
            // On desktop, always show the folder, but only enable controls when a neuron is selected
            if (selectedSynthFolder && selectedSynthFolder.element) {
                selectedSynthFolder.element.style.display = 'block';
                
                // Remove any placeholder messages that might exist
                    const placeholderMsg = document.getElementById('synth-placeholder-msg');
                    if (placeholderMsg) {
                        placeholderMsg.remove();
                }
            }
        } else {
            // On mobile, only show when a neuron is explicitly selected
            if (selectedSynthFolder && selectedSynthFolder.element) {
                selectedSynthFolder.element.style.display = 
                    window.soundManager?.selectedNeuronId ? 'block' : 'none';
            }
        }
        
        // Update neuron label position after changing synth folder visibility
        if (window.updateNeuronLabelPosition) {
            window.updateNeuronLabelPosition();
        }
    };
    
    // Call immediately and set up for changes
    setTimeout(window.updateSynthFolderDisplay, 100);
    window.addEventListener('resize', window.updateSynthFolderDisplay);
    
    // Make sure the folder's internal content is properly initialized
    setTimeout(() => {
        // Ensure the folder is properly initialized
        if (selectedSynthFolder && selectedSynthFolder.element) {
            // Force the internal structure to be created even though it's hidden
            const tempDisplay = selectedSynthFolder.element.style.display;
            selectedSynthFolder.element.style.display = 'block';
            // Give it a moment to render
            setTimeout(() => {
                // Reset to appropriate display state
                window.updateSynthFolderDisplay();
                console.log("Sound controls panel initialized");
            }, 10);
        }
    }, 100);
    
    // Define musical notes with frequencies
    const musicalNotes = [
        // Lower octave (C2 to B2)
        { name: "C2", freq: 65.41 },
        { name: "D2", freq: 73.42 },
        { name: "E2", freq: 82.41 },
        { name: "F2", freq: 87.31 },
        { name: "G2", freq: 98.00 },
        { name: "A2", freq: 110.00 },
        { name: "B2", freq: 123.47 },
        // Middle octave (C3 to B3)
        { name: "C3", freq: 130.81 },
        { name: "D3", freq: 146.83 },
        { name: "E3", freq: 164.81 },
        { name: "F3", freq: 174.61 },
        { name: "G3", freq: 196.00 },
        { name: "A3", freq: 220.00 },
        { name: "B3", freq: 246.94 },
        // Higher octave (C4 to B4)
        { name: "C4", freq: 261.63 },
        { name: "D4", freq: 293.66 },
        { name: "E4", freq: 329.63 },
        { name: "F4", freq: 349.23 },
        { name: "G4", freq: 392.00 },
        { name: "A4", freq: 440.00 },
        { name: "B4", freq: 493.88 },
        // Even higher octave (C5 to B5)
        { name: "C5", freq: 523.25 },
        { name: "D5", freq: 587.33 },
        { name: "E5", freq: 659.25 },
        { name: "F5", freq: 698.46 },
        { name: "G5", freq: 783.99 },
        { name: "A5", freq: 880.00 },
        { name: "B5", freq: 987.77 },
        // Highest octave (C6 to B6)
        { name: "C6", freq: 1046.50 },
        { name: "D6", freq: 1174.66 },
        { name: "E6", freq: 1318.51 },
        { name: "F6", freq: 1396.91 },
        { name: "G6", freq: 1567.98 },
        { name: "A6", freq: 1760.00 },
        { name: "B6", freq: 1975.53 }
    ];
    
    // Make musicalNotes available globally for other functions
    window.musicalNotes = musicalNotes;
    
    // Create buttons for musical note selection with 8-bit styling
    const noteSelectionContainer = document.createElement('div');
    noteSelectionContainer.style.marginBottom = '10px';
    noteSelectionContainer.style.marginLeft = 'auto';
    noteSelectionContainer.style.marginRight = 'auto';
    noteSelectionContainer.style.padding = '5px'; // Reduced padding to fit better
    noteSelectionContainer.style.backgroundColor = '#000000'; // Black background for classic 8-bit look
    noteSelectionContainer.style.borderRadius = '0'; // Square corners for 8-bit aesthetic
    noteSelectionContainer.style.display = 'flex';
    noteSelectionContainer.style.flexDirection = 'column';
    noteSelectionContainer.style.gap = '0'; // Removed gap to tighten space
    noteSelectionContainer.style.border = '2px solid #444444'; // Grey border
    noteSelectionContainer.style.boxShadow = '0 0 0 1px #000000, 0 0 0 4px #222222'; // Pixel-perfect border
    noteSelectionContainer.style.width = '286px'; // Match Tweakpane width (300px - 14px for margins/padding)
    noteSelectionContainer.style.boxSizing = 'border-box'; // Include padding in width calculation
    noteSelectionContainer.style.alignSelf = 'center'; // Center in parent container
    
    // Create note buttons container with exactly 3 rows of buttons
    const noteButtonsContainer = document.createElement('div');
    noteButtonsContainer.style.display = 'grid';
    noteButtonsContainer.style.gridTemplateRows = 'repeat(3, 1fr)'; // Exactly 3 rows
    noteButtonsContainer.style.gridTemplateColumns = 'repeat(12, 1fr)'; // 12 columns per row
    noteButtonsContainer.style.gap = '1px'; // Minimal gap for dense layout
    noteButtonsContainer.style.backgroundColor = '#111111'; // Darker background behind buttons
    noteButtonsContainer.style.padding = '3px'; // Padding around button grid
    noteButtonsContainer.style.border = '1px solid #333333'; // Inner border
    noteButtonsContainer.style.width = '100%'; // Use full width
    noteButtonsContainer.style.height = '76px'; // Fixed height for all 3 rows
    noteButtonsContainer.style.boxSizing = 'border-box'; // Include border in size calculation
    noteButtonsContainer.style.overflow = 'hidden'; // Hide any overflow
    noteSelectionContainer.appendChild(noteButtonsContainer);
    
    // Keep track of active note button
    let activeNoteButton = null;
    
    // Function to create note buttons
    function createNoteButton(note, index) {
        const button = document.createElement('button');
        button.textContent = note.name;
        button.dataset.noteIndex = index;
        button.dataset.frequency = note.freq;
        button.style.padding = '1px 0'; // Minimal padding
        button.style.fontSize = '5px'; // Smaller font size to ensure fitting
        button.style.fontFamily = "'Press Start 2P', monospace"; // 8-bit style font
        button.style.color = '#FFFFFF'; // White text for all buttons for better contrast with grey
        button.style.textShadow = '0px 0px 1px #000000'; // Subtle text shadow for better readability
        button.style.borderRadius = '0'; // Square corners for 8-bit look
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.15s ease';
        button.style.position = 'relative'; // For scanline effect
        button.style.margin = '0'; // No margin for tighter fit
        button.style.textAlign = 'center';
        button.style.boxShadow = 'inset 0 0 2px rgba(255, 255, 255, 0.3)';
        button.style.width = '100%'; // Fill the grid cell completely
        button.style.minWidth = '0'; // Allow very narrow buttons
        button.style.height = '23px'; // Fixed height for each row (70px ÷ 3)
        button.style.lineHeight = '1'; // Tighter line height
        button.style.overflow = 'hidden'; // Prevent text overflow
        button.style.boxSizing = 'border-box'; // Include border in size calculation
        
        // Color-code different octaves with shades of grey for 8-bit look
        const octave = parseInt(note.name.match(/\d+/)[0]);
        
        // Apply different shades of grey based on octave
        let bgColor, borderColorTop, borderColorBottom;
        
        if (octave <= 1) {
            // Darkest grey for lowest octave
            bgColor = '#3A3A3A'; 
            borderColorTop = '#505050';
            borderColorBottom = '#252525';
        } else if (octave === 2) {
            // Dark grey for low octave
            bgColor = '#454545'; 
            borderColorTop = '#5A5A5A';
            borderColorBottom = '#303030';
        } else if (octave === 3) {
            // Medium grey for mid-low octave
            bgColor = '#505050'; 
            borderColorTop = '#656565';
            borderColorBottom = '#3A3A3A';
        } else if (octave === 4) {
            // Light-medium grey for mid octave
            bgColor = '#606060'; 
            borderColorTop = '#757575';
            borderColorBottom = '#454545';
        } else if (octave === 5) {
            // Light grey for high octave
            bgColor = '#707070'; 
            borderColorTop = '#858585';
            borderColorBottom = '#555555';
        } else if (octave >= 6) {
            // Lightest grey for highest octave
            bgColor = '#808080'; 
            borderColorTop = '#959595';
            borderColorBottom = '#656565';
        }
        
        // Highlight black keys (sharps/flats) with different color
        if (note.name.includes('#') || (note.name.length > 2 && note.name[1] === 'b')) {
            bgColor = '#202020';
            borderColorTop = '#3A3A3A';
            borderColorBottom = '#101010';
            button.style.color = '#FFFFFF';
        }
        
        // Apply the colors
        button.style.backgroundColor = bgColor;
        button.style.borderTop = `2px solid ${borderColorTop}`;
        button.style.borderLeft = `2px solid ${borderColorTop}`;
        button.style.borderBottom = `2px solid ${borderColorBottom}`;
        button.style.borderRight = `2px solid ${borderColorBottom}`;
        
        // Store original styles for hover/active effects
        button.dataset.original = bgColor;
        button.dataset.originalBorderTop = borderColorTop;
        button.dataset.originalBorderBottom = borderColorBottom;
        
        // Add click event to select the note - ensure it works with one tap
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent any default behavior
            e.stopPropagation(); // Stop event propagation
            
            // Update the note setting immediately
            window.settings.selectedNote = note.freq;
            window.settings.selectedNoteIndex = index;
            
            // Update sound manager without playing a test tone immediately
            if (window.soundManager) {
                window.soundManager.updateSelectedSynthParam('note', note.freq);
                // Do not play a test tone automatically
            }
            
            // Visual feedback - deactivate previous button
            if (activeNoteButton) {
                // Restore original 8-bit styles
                activeNoteButton.style.backgroundColor = activeNoteButton.dataset.original || '#404040';
                activeNoteButton.style.borderTop = `2px solid ${activeNoteButton.dataset.originalBorderTop || '#505050'}`;
                activeNoteButton.style.borderLeft = `2px solid ${activeNoteButton.dataset.originalBorderTop || '#505050'}`;
                activeNoteButton.style.borderBottom = `2px solid ${activeNoteButton.dataset.originalBorderBottom || '#303030'}`;
                activeNoteButton.style.borderRight = `2px solid ${activeNoteButton.dataset.originalBorderBottom || '#303030'}`;
                activeNoteButton.style.transform = 'scale(1)';
                activeNoteButton.style.boxShadow = 'inset 0 0 2px rgba(255, 255, 255, 0.3)';
                activeNoteButton.style.fontWeight = 'normal';
                activeNoteButton.style.color = 'white';
            }
            
            // Activate this button with a darker shade of the note's original color
            // Get original color and create darker version
            const originalColor = button.dataset.original;
            
            // Function to darken color
            const getDarkerButtonColor = (color) => {
                if (color.startsWith('#')) {
                    const hex = color.replace('#', '');
                    let r = parseInt(hex.substring(0, 2), 16);
                    let g = parseInt(hex.substring(2, 4), 16);
                    let b = parseInt(hex.substring(4, 6), 16);
                    
                    // Make significantly darker (40% of original brightness)
                    r = Math.floor(r * 0.4);
                    g = Math.floor(g * 0.4);
                    b = Math.floor(b * 0.4);
                    
                    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }
                return '#222222'; // Fallback dark color
            };
            
            const darkColor = getDarkerButtonColor(originalColor);
            const veryDarkColor = getDarkerButtonColor(darkColor); // Even darker for borders
            
            // Apply the darker color
            button.style.backgroundColor = darkColor;
            button.style.color = '#FFFFFF'; // White text for contrast on dark background
            button.style.borderTop = `2px solid ${veryDarkColor}`;       // Darker top/left for pressed effect
            button.style.borderLeft = `2px solid ${veryDarkColor}`;
            button.style.borderBottom = `2px solid ${darkColor}`;        // Same color for bottom/right
            button.style.borderRight = `2px solid ${darkColor}`;
            button.style.transform = 'scale(0.95)';                      // Slightly smaller for pressed effect
            button.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.7)'; // Dark inner shadow
            button.style.fontWeight = 'bold';                            // Make selected note text bold
            
            // Add active pixel scanlines
            if (!button.scanlines) {
                const scanlines = document.createElement('div');
                scanlines.style.position = 'absolute';
                scanlines.style.top = '0';
                scanlines.style.left = '0';
                scanlines.style.width = '100%';
                scanlines.style.height = '100%';
                scanlines.style.backgroundImage = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2), rgba(0,0,0,0.2) 1px, transparent 1px, transparent 2px)';
                scanlines.style.pointerEvents = 'none';
                scanlines.style.zIndex = '1';
                button.appendChild(scanlines);
                button.scanlines = scanlines;
            }
            
            activeNoteButton = button;
            window.activeNoteButton = button; // Sync with global reference
            
            console.log(`Note changed to: ${note.name} (${note.freq}Hz)`);
            
            // Return false to prevent any issues with event handling
            return false;
        });
        
        // Also add touchend handler for mobile devices to ensure one-tap functionality
        button.addEventListener('touchend', (e) => {
            e.preventDefault(); // Prevent any default behavior
            
            // Trigger the click event manually
            button.click();
            
            // Return false to prevent any issues with event handling
            return false;
        });
        
        // Add 8-bit style hover effects
        button.addEventListener('mouseenter', () => {
            if (button !== activeNoteButton) {
                // Brighten colors for hover effect but keep 8-bit style
                // Create lighter version of original color
                const brightenColor = (color) => {
                    // Basic implementation to make a hex color brighter
                    if (color.startsWith('#')) {
                        const r = parseInt(color.slice(1, 3), 16);
                        const g = parseInt(color.slice(3, 5), 16);
                        const b = parseInt(color.slice(5, 7), 16);
                        
                        // Brighten by 30%
                        const brighterR = Math.min(255, r + 50).toString(16).padStart(2, '0');
                        const brighterG = Math.min(255, g + 50).toString(16).padStart(2, '0');
                        const brighterB = Math.min(255, b + 50).toString(16).padStart(2, '0');
                        
                        return `#${brighterR}${brighterG}${brighterB}`;
                    }
                    return color; // Fallback
                };
                
                // Brighten the button with pixelated glow
                const brighterBg = brightenColor(button.dataset.original);
                button.style.backgroundColor = brighterBg;
                button.style.boxShadow = 'inset 0 0 4px rgba(255, 255, 255, 0.5)';
                button.style.borderTop = `2px solid ${brightenColor(button.dataset.originalBorderTop)}`;
                button.style.borderLeft = `2px solid ${brightenColor(button.dataset.originalBorderTop)}`;
                
                // Add subtle pulse animation
                button.style.animation = 'noteButtonPulse 1.5s infinite';
                
                // Create animation if it doesn't exist yet
                if (!document.getElementById('noteButtonPulseStyle')) {
                    const style = document.createElement('style');
                    style.id = 'noteButtonPulseStyle';
                    style.textContent = `
                        @keyframes noteButtonPulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                            100% { transform: scale(1); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            }
        });
        
        button.addEventListener('mouseleave', () => {
            if (button !== activeNoteButton) {
                // Reset to original 8-bit styling
                button.style.backgroundColor = button.dataset.original;
                button.style.borderTop = `2px solid ${button.dataset.originalBorderTop}`;
                button.style.borderLeft = `2px solid ${button.dataset.originalBorderTop}`;
                button.style.borderBottom = `2px solid ${button.dataset.originalBorderBottom}`;
                button.style.borderRight = `2px solid ${button.dataset.originalBorderBottom}`;
                button.style.boxShadow = 'inset 0 0 2px rgba(255, 255, 255, 0.3)';
                button.style.animation = 'none';
                button.style.transform = 'scale(1)';
            }
        });
        
        return button;
    }
    
    // Organize notes into exactly 3 rows with notes spread across columns
    
    // Calculate number of notes per row (36 notes total ÷ 3 rows = 12 notes per row)
    const notesPerRow = Math.ceil(musicalNotes.length / 3);
    
    // Create 3 rows of notes
    const rowGroups = [
        musicalNotes.slice(0, notesPerRow),          // Row 1: Lowest third (C2-G3)
        musicalNotes.slice(notesPerRow, notesPerRow * 2),   // Row 2: Middle third (A3-E5)
        musicalNotes.slice(notesPerRow * 2)          // Row 3: Highest third (F5-B6)
    ];
    
    // Add notes row by row (each row will have multiple columns)
    rowGroups.forEach((rowNotes, rowIndex) => {
        rowNotes.forEach((note, noteIndex) => {
            const overallIndex = rowIndex * notesPerRow + noteIndex;
            const button = createNoteButton(note, overallIndex);
        noteButtonsContainer.appendChild(button);
        });
    });
    
    // Function to update the active note button styling with 8-bit aesthetics
    window.updateActiveNoteButton = function(noteFreq) {
        // Find the button with the matching frequency
        const buttons = noteButtonsContainer.querySelectorAll('button');
        
        // First deactivate any currently active button
        if (activeNoteButton) {
            // Restore original 8-bit styles
            activeNoteButton.style.backgroundColor = activeNoteButton.dataset.original || '#404040';
            activeNoteButton.style.borderTop = `2px solid ${activeNoteButton.dataset.originalBorderTop || '#505050'}`;
            activeNoteButton.style.borderLeft = `2px solid ${activeNoteButton.dataset.originalBorderTop || '#505050'}`;
            activeNoteButton.style.borderBottom = `2px solid ${activeNoteButton.dataset.originalBorderBottom || '#303030'}`;
            activeNoteButton.style.borderRight = `2px solid ${activeNoteButton.dataset.originalBorderBottom || '#303030'}`;
            activeNoteButton.style.transform = 'scale(1)';
            activeNoteButton.style.boxShadow = 'inset 0 0 2px rgba(255, 255, 255, 0.3)';
            activeNoteButton.style.fontWeight = 'normal';
            activeNoteButton.style.color = 'white';
            
            // Remove scanlines if they exist
            if (activeNoteButton.scanlines) {
                activeNoteButton.scanlines.remove();
                activeNoteButton.scanlines = null;
            }
            
            activeNoteButton = null;
            window.activeNoteButton = null; // Sync with global reference
        }
        
        // Only activate a button if a valid frequency is provided
        if (noteFreq) {
        // Find and activate the button for the current note
        buttons.forEach(button => {
            const buttonFreq = parseFloat(button.dataset.frequency);
            if (Math.abs(buttonFreq - noteFreq) < 0.1) {
                    // Apply darker shade of note's original color for active styling
                    const originalColor = button.dataset.original;
                    
                    // Function to darken color
                    const getDarkerButtonColor = (color) => {
                        if (color.startsWith('#')) {
                            const hex = color.replace('#', '');
                            let r = parseInt(hex.substring(0, 2), 16);
                            let g = parseInt(hex.substring(2, 4), 16);
                            let b = parseInt(hex.substring(4, 6), 16);
                            
                            // Make significantly darker (40% of original brightness)
                            r = Math.floor(r * 0.4);
                            g = Math.floor(g * 0.4);
                            b = Math.floor(b * 0.4);
                            
                            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                        }
                        return '#222222'; // Fallback dark color
                    };
                    
                    const darkColor = getDarkerButtonColor(originalColor);
                    const veryDarkColor = getDarkerButtonColor(darkColor); // Even darker for borders
                    
                    // Apply the darker color
                    button.style.backgroundColor = darkColor;
                    button.style.color = '#FFFFFF'; // White text for contrast on dark background
                    button.style.borderTop = `2px solid ${veryDarkColor}`;       // Darker top/left for pressed effect
                    button.style.borderLeft = `2px solid ${veryDarkColor}`;
                    button.style.borderBottom = `2px solid ${darkColor}`;        // Same color for bottom/right
                    button.style.borderRight = `2px solid ${darkColor}`;
                    button.style.transform = 'scale(0.95)';                      // Slightly smaller for pressed effect
                    button.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.7)'; // Dark inner shadow
                button.style.fontWeight = 'bold';
                    
                    // Add scanlines for 8-bit effect
                    if (!button.scanlines) {
                        const scanlines = document.createElement('div');
                        scanlines.style.position = 'absolute';
                        scanlines.style.top = '0';
                        scanlines.style.left = '0';
                        scanlines.style.width = '100%';
                        scanlines.style.height = '100%';
                        scanlines.style.backgroundImage = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2), rgba(0,0,0,0.2) 1px, transparent 1px, transparent 2px)';
                        scanlines.style.pointerEvents = 'none';
                        scanlines.style.zIndex = '1';
                        button.appendChild(scanlines);
                        button.scanlines = scanlines;
                    }
                    
                activeNoteButton = button;
                    window.activeNoteButton = button; // Sync with global reference
            }
        });
        }
    };
    
    // Add to sound controls folder at the top with proper alignment
    selectedSynthFolder.element.insertBefore(noteSelectionContainer, selectedSynthFolder.element.firstChild);
    
    // Ensure the container is properly centered within the folder
    const containerParent = noteSelectionContainer.parentElement;
    if (containerParent) {
        containerParent.style.display = 'flex';
        containerParent.style.flexDirection = 'column';
        containerParent.style.alignItems = 'center';
    }
    
    // We'll add preset container right after the notes for better usability
    // Create preset controls now so we can insert them below notes
    const presetContainer = document.createElement('div');
    presetContainer.style.marginTop = '10px';
    presetContainer.style.marginLeft = 'auto';
    presetContainer.style.marginRight = 'auto';
    presetContainer.style.padding = '8px';
    presetContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    presetContainer.style.borderRadius = '6px';
    presetContainer.style.display = 'flex';
    presetContainer.style.flexDirection = 'column';
    presetContainer.style.gap = '8px';
    presetContainer.className = 'preset-container'; // Add class for identification
    presetContainer.style.boxShadow = 'inset 0 0 5px rgba(0, 0, 0, 0.2)';
    presetContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    presetContainer.style.width = '286px'; // Match the width of the note container
    presetContainer.style.boxSizing = 'border-box'; // Include padding in width calculation
    
    // Add the preset container right after the note selection container
    selectedSynthFolder.element.insertBefore(presetContainer, noteSelectionContainer.nextSibling);
    
    // No header needed for presets - keeping UI clean

    // Create button grid container with improved layout
    const presetButtonGrid = document.createElement('div');
    presetButtonGrid.style.display = 'grid';
    presetButtonGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    presetButtonGrid.style.gap = '12px'; // Increased from 6px to 12px for more space between buttons
    presetButtonGrid.style.padding = '4px';  // Slightly more padding
    presetButtonGrid.style.borderRadius = '4px';
    presetButtonGrid.className = 'preset-button-grid'; // Add class for easy selection
    presetContainer.appendChild(presetButtonGrid);

    // Track which preset is active
    let activePresetButton = null;
    
    // We'll remove the slider since the buttons are sufficient and we want more space
    // Instead, directly update the window.settings.selectedNoteIndex in the button click handlers
    // This is already handled in the createNoteButton function
    
    // Create tabs for better organization of sound controls
    const soundTabs = selectedSynthFolder.addTab({
        pages: [
            {title: 'Sound'},
            {title: 'Filter'},
            {title: 'FX Sends'},
            {title: 'Modulation'}
        ]
    });
    
    // Store references to the tabs for refreshing later
    window.soundControlsTabs = soundTabs;
    
    // ---- SOUND PARAMETERS TAB ----
    // Add detune control
    soundTabs.pages[0].addBinding(window.settings, 'selectedDetune', {
        min: -50, max: 50, step: 1, label: 'Detune'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('detune', ev.value);
    });

    // Add neuron-specific volume control
    soundTabs.pages[0].addBinding(window.settings, 'selectedNeuronVolume', {
        min: -12, max: 12, step: 1, label: 'Volume (min=mute)'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('neuronVolume', ev.value);
    });

    // Create oscillator type dropdown
    if (window.soundManager && window.soundManager.getOscillatorTypes) {
        const oscillatorTypes = window.soundManager.getOscillatorTypes();
        soundTabs.pages[0].addBinding(window.settings, 'selectedOscillatorType', {
            options: oscillatorTypes.reduce((acc, type) => {
                acc[type] = type;
                return acc;
            }, {}),
            label: 'Oscillator Type'
        }).on('change', (ev) => {
            window.soundManager?.updateSelectedSynthParam('oscillatorType', ev.value);
        });
    }

    // Add attack parameter control
    soundTabs.pages[0].addBinding(window.settings, 'selectedAttack', {
        min: 0.001, max: 0.5, step: 0.005, label: 'Attack'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('attack', ev.value);
        window.forceRenderEnvelope(); // Update envelope visualization
    });

    soundTabs.pages[0].addBinding(window.settings, 'selectedDecay', {
        min: 0.1, max: 1.5, step: 0.05, label: 'Decay'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('decay', ev.value);
        window.forceRenderEnvelope(); // Update envelope visualization
    });

    // Add sustain parameter
    soundTabs.pages[0].addBinding(window.settings, 'selectedSustain', {
        min: 0, max: 1.0, step: 0.05, label: 'Sustain'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('sustain', ev.value);
        window.forceRenderEnvelope(); // Update envelope visualization
    });

    soundTabs.pages[0].addBinding(window.settings, 'selectedRelease', {
        min: 0.2, max: 3.0, step: 0.1, label: 'Release'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('release', ev.value);
        window.forceRenderEnvelope(); // Update envelope visualization
    });

    // Add envelope curve selector if available
    if (window.soundManager && window.soundManager.getEnvelopeCurves) {
        const curves = window.soundManager.getEnvelopeCurves();
        const curveOptions = curves.reduce((acc, curve) => {
            acc[curve] = curve;
            return acc;
        }, {});
        
        soundTabs.pages[0].addBinding(window.settings, 'selectedAttackCurve', {
            options: curveOptions,
            label: 'Curve Shape'
        }).on('change', (ev) => {
            window.soundManager?.updateSelectedSynthParam('attackCurve', ev.value);
            window.soundManager?.updateSelectedSynthParam('decayCurve', ev.value);
            window.soundManager?.updateSelectedSynthParam('releaseCurve', ev.value);
        });
    }

    // Add pitch decay control
    soundTabs.pages[0].addBinding(window.settings, 'selectedPitchDecay', {
        min: 0.01, max: 0.3, step: 0.01, label: 'Pitch Decay'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('pitchDecay', ev.value);
    });

    // Add sustained tone toggle
    soundTabs.pages[0].addBinding(window.settings, 'selectedUseSustainedTone', {
        label: 'Sustain Mode'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('useSustainedTone', ev.value);
    });

    // Add harmony anchor control
    soundTabs.pages[0].addBinding(window.settings, 'isHarmonyAnchor', {
        label: 'Harmony Anchor'
    }).on('change', (ev) => {
        // Find selected neuron and update its harmony anchor status
        if (window.soundManager && window.soundManager.selectedNeuronId !== null) {
            const selectedNeuronId = window.soundManager.selectedNeuronId;
            const selectedNeuron = window.circles.find(
                circle => circle && circle.neuron && circle.neuron.id === selectedNeuronId
            );
            
            if (selectedNeuron && selectedNeuron.neuron) {
                selectedNeuron.neuron.isHarmonyAnchor = ev.value;
                console.log(`Set neuron ${selectedNeuronId} as harmony anchor: ${ev.value}`);
                
                // Visual indicator for harmony anchors
                if (ev.value) {
                    // Create a visual indicator for harmony anchors
                    if (!selectedNeuron.harmonyAnchorIndicator) {
                        const indicatorGeometry = new THREE.RingGeometry(0.3, 0.35, 16);
                        const indicatorMaterial = new THREE.MeshBasicMaterial({
                            color: 0xffff00,
                            transparent: true,
                            opacity: 0.5,
                            side: THREE.DoubleSide
                        });
                        
                        const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
                        indicator.rotation.x = -Math.PI / 2;
                        indicator.position.copy(selectedNeuron.position);
                        indicator.position.y += 0.05; // Slightly above the neuron
                        
                        // Store reference and add to scene
                        selectedNeuron.harmonyAnchorIndicator = indicator;
                        window.scene.add(indicator);
                    } else {
                        // Show existing indicator
                        selectedNeuron.harmonyAnchorIndicator.visible = true;
                    }
                } else if (selectedNeuron.harmonyAnchorIndicator) {
                    // Hide indicator when toggled off
                    selectedNeuron.harmonyAnchorIndicator.visible = false;
                }
            }
        }
    });

    // ---- FILTER CONTROLS TAB ----
    // Add filter type dropdown
    if (window.soundManager && window.soundManager.getFilterTypes) {
        const filterTypes = window.soundManager.getFilterTypes();
        soundTabs.pages[1].addBinding(window.settings, 'selectedFilterType', {
            options: filterTypes.reduce((acc, type) => {
                acc[type] = type;
                return acc;
            }, {}),
            label: 'Filter Type'
        }).on('change', (ev) => {
            window.soundManager?.updateSelectedSynthParam('filterType', ev.value);
            // Do not play a test tone automatically
        });
    }
    
    // Add filter frequency control
    soundTabs.pages[1].addBinding(window.settings, 'selectedFilterFrequency', {
        min: 50, max: 10000, step: 10, label: 'Frequency'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('filterFrequency', ev.value);
        // Do not play a test tone automatically
    });
    
    // Add filter resonance (Q) control
    soundTabs.pages[1].addBinding(window.settings, 'selectedFilterQ', {
        min: 0.1, max: 10, step: 0.1, label: 'Resonance (Q)'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('filterQ', ev.value);
        // Do not play a test tone automatically
    });
    
    // ---- EFFECTS SEND TAB ----
    // Add reverb send control
    soundTabs.pages[2].addBinding(window.settings, 'selectedReverbSend', {
        min: 0, max: 1, step: 0.01, label: 'Reverb'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('reverbSend', ev.value);
        // Do not play a test tone automatically
    });
    
    // Add delay send control
    soundTabs.pages[2].addBinding(window.settings, 'selectedDelaySend', {
        min: 0, max: 1, step: 0.01, label: 'Delay'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('delaySend', ev.value);
        // Do not play a test tone automatically
    });
    
    // ---- MODULATION TAB ----
    // Add tremolo frequency control
    soundTabs.pages[3].addBinding(window.settings, 'selectedTremoloFreq', {
        min: 0.1, max: 10, step: 0.1, label: 'Tremolo Rate'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('tremoloFreq', ev.value);
        // Do not play a test tone automatically
    });
    
    // Add tremolo depth control
    soundTabs.pages[3].addBinding(window.settings, 'selectedTremoloDepth', {
        min: 0, max: 1, step: 0.01, label: 'Tremolo Depth'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('tremoloDepth', ev.value);
        // Do not play a test tone automatically
    });
    
    // Add vibrato frequency control
    soundTabs.pages[3].addBinding(window.settings, 'selectedVibratoFreq', {
        min: 0.1, max: 10, step: 0.1, label: 'Vibrato Rate'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('vibratoFreq', ev.value);
        // Do not play a test tone automatically
    });
    
    // Add vibrato depth control
    soundTabs.pages[3].addBinding(window.settings, 'selectedVibratoDepth', {
        min: 0, max: 1, step: 0.01, label: 'Vibrato Depth'
    }).on('change', (ev) => {
        window.soundManager?.updateSelectedSynthParam('vibratoDepth', ev.value);
        // Do not play a test tone automatically
    });

    // Add toggle for preview sounds when adjusting parameters
    selectedSynthFolder.addBinding(window.settings, 'previewSounds', {
        label: 'Solo + Preview'
    }).on('change', (ev) => {
        if (window.soundManager) {
            window.soundManager.setPreviewSounds(ev.value);
        }
    });

    // Add toggle for spatial audio
    selectedSynthFolder.addBinding(window.settings, 'spatialAudioEnabled', {
        label: 'Spatial Audio'
    }).on('change', (ev) => {
        if (window.soundManager) {
            window.soundManager.setSpatialAudio(ev.value);
        }
    });

    // Preset container, header, grid, and related components already created earlier

    // Use sound presets imported from config
    const defaultPresets = soundPresets;

    // Make presets available globally for preset detection
    window.defaultPresets = defaultPresets;

    // Function to create a preset button
    function createPresetButton(preset) {
        const button = document.createElement('button');
        button.textContent = preset.name;
        button.style.padding = '5px 6px';  // Reduced padding
        button.style.fontSize = '8px';     // Slightly larger font for better visibility
        button.style.fontFamily = "'Press Start 2P', 'Courier New', monospace"; // Keep the retro font
        button.style.textTransform = 'uppercase';
        button.style.letterSpacing = '0.5px';
        button.style.fontWeight = 'bold'; // Make text bold
        
        // Default settings - will be overridden based on sound type
        let backgroundColor = '#666666';  // Changed to use stroke color as background
        let borderColor = '#333333';      // Darker border
        let textColor = '#000000';        // Black text for contrast
        let glowColor = 'rgba(255, 255, 255, 0.4)';
        
        // Use sound profile to determine colors for distinct retro RGB style
        if (preset.name.includes('Synth') || preset.name.includes('Analog')) {
            // Synthwave style - neon pink/purple
            backgroundColor = '#f706cf';  // Use the border color as background
            borderColor = '#2b0f54';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(247, 6, 207, 0.5)';
        } else if (preset.name.includes('Bass')) {
            // Deep bass style - vibrant blue
            backgroundColor = '#0080ff';  // Use the border color as background
            borderColor = '#00008b';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(0, 128, 255, 0.5)';
        } else if (preset.name.includes('Piano')) {
            // Piano style - black and white
            backgroundColor = '#ffffff';  // Use the border color as background
            borderColor = '#101010';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 255, 255, 0.3)';
        } else if (preset.name.includes('Bell') || preset.name.includes('Pluck')) {
            // Bell/Pluck style - golden
            backgroundColor = '#ffcc00';  // Use the border color as background
            borderColor = '#332200';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 204, 0, 0.5)';
        } else if (preset.name.includes('Pad')) {
            // Pad style - soothing blue/green
            backgroundColor = '#00aaaa';  // Use the border color as background
            borderColor = '#003333';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(0, 170, 170, 0.5)';
        } else if (preset.name.includes('Drum') || preset.name.includes('Percussion')) {
            // Percussion style - red/orange
            backgroundColor = '#ff3300';  // Use the border color as background
            borderColor = '#330000';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 51, 0, 0.5)';
        } else if (preset.name.includes('Hi-Hat')) {
            // Hi-Hat style - yellow/green
            backgroundColor = '#cccc00';  // Use the border color as background
            borderColor = '#1a1a00';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(204, 204, 0, 0.5)';
        } else if (preset.name.includes('Guitar') || preset.name.includes('String')) {
            // Guitar/Strings style - warm amber
            backgroundColor = '#ff8800';  // Use the border color as background
            borderColor = '#331a00';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 136, 0, 0.5)';
        } else if (preset.name.includes('Lead')) {
            // Lead sound style - vivid red
            backgroundColor = '#ff0000';  // Use the border color as background
            borderColor = '#330000';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 0, 0, 0.5)';
        } else if (preset.name.includes('Brass')) {
            // Brass style - bright orange
            backgroundColor = '#ff8800';  // Changed to orange
            borderColor = '#331a00';      // Darker border
            textColor = '#000000';        // Black text
            glowColor = 'rgba(255, 136, 0, 0.5)';
        } else {
            // Use the preset's color as a fallback
            if (preset.color) {
                const r = Math.floor(preset.color.r * 255);
                const g = Math.floor(preset.color.g * 255);
                const b = Math.floor(preset.color.b * 255);
                backgroundColor = `rgb(${r/4}, ${g/4}, ${b/4})`;
                borderColor = `rgb(${r}, ${g}, ${b})`;
                textColor = `rgb(${Math.min(255, r*1.5)}, ${Math.min(255, g*1.5)}, ${Math.min(255, b*1.5)})`;
                glowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
            }
        }
        
        // Set button stylings for retro RGB look
        button.style.backgroundColor = backgroundColor;
        button.style.color = textColor;
        // Replace single border with individual borders for 3D effect
        button.style.borderTop = `2px solid ${getLighterColor(backgroundColor, 50)}`;
        button.style.borderLeft = `2px solid ${getLighterColor(backgroundColor, 30)}`;
        button.style.borderBottom = `2px solid ${getDarkerColor(backgroundColor, 40)}`;
        button.style.borderRight = `2px solid ${getDarkerColor(backgroundColor, 30)}`;
        button.style.borderRadius = '0';  // Square corners
        button.style.cursor = 'pointer';
        button.style.transition = 'all 0.2s ease-in-out';
        button.style.textAlign = 'center';
        button.style.boxShadow = `0 0 0 0 ${glowColor}`;
        button.style.position = 'relative';
        button.style.overflow = 'hidden';
        
        // Add helper functions for color manipulation
        function getLighterColor(color, amount) {
            if (color.startsWith('#')) {
                const hex = color.replace('#', '');
                let r = parseInt(hex.substring(0, 2), 16);
                let g = parseInt(hex.substring(2, 4), 16);
                let b = parseInt(hex.substring(4, 6), 16);
                
                r = Math.min(255, r + amount);
                g = Math.min(255, g + amount);
                b = Math.min(255, b + amount);
                
                return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            } else if (color.startsWith('rgb')) {
                // Extract RGB values
                const matches = color.match(/\d+/g);
                if (matches && matches.length >= 3) {
                    const r = Math.min(255, parseInt(matches[0]) + amount);
                    const g = Math.min(255, parseInt(matches[1]) + amount);
                    const b = Math.min(255, parseInt(matches[2]) + amount);
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            return color; // Fallback if color format is unknown
        }
        
        function getDarkerColor(color, amount) {
            if (color.startsWith('#')) {
                const hex = color.replace('#', '');
                let r = parseInt(hex.substring(0, 2), 16);
                let g = parseInt(hex.substring(2, 4), 16);
                let b = parseInt(hex.substring(4, 6), 16);
                
                r = Math.max(0, r - amount);
                g = Math.max(0, g - amount);
                b = Math.max(0, b - amount);
                
                return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            } else if (color.startsWith('rgb')) {
                // Extract RGB values
                const matches = color.match(/\d+/g);
                if (matches && matches.length >= 3) {
                    const r = Math.max(0, parseInt(matches[0]) - amount);
                    const g = Math.max(0, parseInt(matches[1]) - amount);
                    const b = Math.max(0, parseInt(matches[2]) - amount);
                    return `rgb(${r}, ${g}, ${b})`;
                }
            }
            return color; // Fallback if color format is unknown
        }
        
        // Add scanline effect and pixel noise
        const scanlines = document.createElement('div');
        scanlines.style.position = 'absolute';
        scanlines.style.top = '0';
        scanlines.style.left = '0';
        scanlines.style.width = '100%';
        scanlines.style.height = '100%';
        scanlines.style.backgroundImage = 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15), rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)';
        scanlines.style.pointerEvents = 'none';
        button.appendChild(scanlines);
        
        // Add a tooltip showing what preset is applied
        button.title = `${preset.name} Preset`;

        // Add a subtle glow effect that pulses slightly
        button.style.animation = 'buttonPulse 4s infinite';
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes buttonPulse {
                0% { box-shadow: 0 0 5px 0 ${glowColor}; }
                50% { box-shadow: 0 0 8px 1px ${glowColor}; }
                100% { box-shadow: 0 0 5px 0 ${glowColor}; }
            }
        `;
        document.head.appendChild(styleSheet);
        
        // Store the original styles for hover effects
        button.dataset.original = backgroundColor;
        button.dataset.originalBorderTop = getLighterColor(backgroundColor, 50);
        button.dataset.originalBorderLeft = getLighterColor(backgroundColor, 30);
        button.dataset.originalBorderBottom = getDarkerColor(backgroundColor, 40);
        button.dataset.originalBorderRight = getDarkerColor(backgroundColor, 30);
        button.dataset.originalText = textColor;  // Store original text color
        button.dataset.glow = glowColor;
        
        // Add event listener
        button.addEventListener('click', () => {
            // First apply the preset immediately
            applyPreset(preset);
            
            // Visual feedback - deactivate previous button
            if (activePresetButton) {
                // Properly restore all original colors from the dataset
                activePresetButton.style.backgroundColor = activePresetButton.dataset.original || '#333333';
                activePresetButton.style.color = activePresetButton.dataset.originalText || '#000000';
                activePresetButton.style.borderTop = `2px solid ${activePresetButton.dataset.originalBorderTop || '#333333'}`;
                activePresetButton.style.borderLeft = `2px solid ${activePresetButton.dataset.originalBorderLeft || '#333333'}`;
                activePresetButton.style.borderBottom = `2px solid ${activePresetButton.dataset.originalBorderBottom || '#333333'}`;
                activePresetButton.style.borderRight = `2px solid ${activePresetButton.dataset.originalBorderRight || '#333333'}`;
                activePresetButton.style.transform = 'scale(1)';
                activePresetButton.style.boxShadow = 'none';
                activePresetButton.style.animation = 'buttonPulse 4s infinite';
                activePresetButton.style.fontWeight = 'normal';
            }
            
            // Activate this button with grey color scheme to indicate selection
            button.style.backgroundColor = '#222222'; // Much darker grey background for selected button
            button.style.color = '#eeeeee';          // Light grey text
            // Invert the border colors for a pressed-in appearance
            button.style.borderTop = `2px solid #111111`;
            button.style.borderLeft = `2px solid #111111`;
            button.style.borderBottom = `2px solid #333333`;
            button.style.borderRight = `2px solid #333333`;
            button.style.transform = 'scale(1.05)';
            button.style.boxShadow = '0 0 8px rgba(100, 100, 100, 0.5)';
            button.style.animation = 'activePulse 1.5s infinite';
            
            // Add a special animation for the active button
            const activeStyleSheet = document.createElement('style');
            activeStyleSheet.textContent = `
                @keyframes activePulse {
                    0% { box-shadow: 0 0 8px rgba(100, 100, 100, 0.5); }
                    50% { box-shadow: 0 0 15px rgba(150, 150, 150, 0.7); }
                    100% { box-shadow: 0 0 8px rgba(100, 100, 100, 0.5); }
                }
            `;
            document.head.appendChild(activeStyleSheet);
            
            activePresetButton = button;
        });
        
        // Add hover effect
        button.addEventListener('mouseenter', () => {
            if (button !== activePresetButton) {
                // Brightened background on hover
                const lightenColor = color => {
                    // Simple conversion to HSL for lightening
                    const hex = color.replace('#', '');
                    // Convert hex to RGB
                    let r = parseInt(hex.substring(0, 2), 16);
                    let g = parseInt(hex.substring(2, 4), 16);
                    let b = parseInt(hex.substring(4, 6), 16);
                    
                    // Brighten by adding 20% to each component
                    r = Math.min(255, r + 50);
                    g = Math.min(255, g + 50);
                    b = Math.min(255, b + 50);
                    
                    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                };
                
                let hoveredBgColor;
                if (backgroundColor.startsWith('#')) {
                    hoveredBgColor = lightenColor(backgroundColor);
                } else {
                    // Use simple brightening for RGB colors
                    hoveredBgColor = 'rgba(80, 80, 80, 0.9)';
                }
                
                button.style.backgroundColor = hoveredBgColor;
                // Update borders to maintain 3D effect with new background color
                button.style.borderTop = `2px solid ${getLighterColor(hoveredBgColor, 50)}`;
                button.style.borderLeft = `2px solid ${getLighterColor(hoveredBgColor, 30)}`;
                button.style.borderBottom = `2px solid ${getDarkerColor(hoveredBgColor, 40)}`;
                button.style.borderRight = `2px solid ${getDarkerColor(hoveredBgColor, 30)}`;
                
                button.style.boxShadow = `0 0 5px ${button.dataset.glow}`;
            }
        });
        
        button.addEventListener('mouseleave', () => {
            if (button !== activePresetButton) {
                button.style.backgroundColor = button.dataset.original;
                button.style.borderTop = `2px solid ${button.dataset.originalBorderTop}`;
                button.style.borderLeft = `2px solid ${button.dataset.originalBorderLeft}`;
                button.style.borderBottom = `2px solid ${button.dataset.originalBorderBottom}`;
                button.style.borderRight = `2px solid ${button.dataset.originalBorderRight}`;
                button.style.boxShadow = 'none';
            }
        });
        
        return button;
    }

    // Add preset buttons to grid
    defaultPresets.forEach(preset => {
        const button = createPresetButton(preset);
        presetButtonGrid.appendChild(button);
    });
    
    // Add the preset button grid to the container
    presetContainer.appendChild(presetButtonGrid);

    // Add event listener to deactivate preset button when sliders are changed
    const deactivatePresetOnChange = () => {
        if (activePresetButton) {
            // Properly restore all original colors from the dataset
            activePresetButton.style.backgroundColor = activePresetButton.dataset.original || '#333333';
            activePresetButton.style.color = activePresetButton.dataset.originalText || '#000000';
            activePresetButton.style.borderTop = `2px solid ${activePresetButton.dataset.originalBorderTop || '#333333'}`;
            activePresetButton.style.borderLeft = `2px solid ${activePresetButton.dataset.originalBorderLeft || '#333333'}`;
            activePresetButton.style.borderBottom = `2px solid ${activePresetButton.dataset.originalBorderBottom || '#333333'}`;
            activePresetButton.style.borderRight = `2px solid ${activePresetButton.dataset.originalBorderRight || '#333333'}`;
            activePresetButton.style.transform = 'scale(1)';
            activePresetButton.style.boxShadow = 'none';
            // Restore the original animation
            activePresetButton.style.animation = 'buttonPulse 4s infinite';
            activePresetButton.style.fontWeight = 'normal';
            
            activePresetButton = null;
        }
        // Clear the active preset
        window.activePreset = null;
    };

    // Add listener to each control that would modify the sound
    selectedSynthFolder.children.forEach(control => {
        if (control.label && 
            !control.label.includes('Presets') && 
            !control.label.includes('Preview')) {
            control.on('change', deactivatePresetOnChange);
        }
    });

    // Also add listeners to the controls in the tabs
    if (soundTabs && soundTabs.pages) {
        // Filter tab (index 1)
        if (soundTabs.pages[1] && soundTabs.pages[1].children) {
            soundTabs.pages[1].children.forEach(control => {
            control.on('change', deactivatePresetOnChange);
        });
    }
    
        // Effects tab (index 2)
        if (soundTabs.pages[2] && soundTabs.pages[2].children) {
            soundTabs.pages[2].children.forEach(control => {
            control.on('change', deactivatePresetOnChange);
        });
    }
    
        // Modulation tab (index 3)
        if (soundTabs.pages[3] && soundTabs.pages[3].children) {
            soundTabs.pages[3].children.forEach(control => {
            control.on('change', deactivatePresetOnChange);
        });
        }
    }

    // Preset container was already added to the folder earlier

    // Store reference for InputManager to use
    window.selectedSynthFolder = selectedSynthFolder;

    // Create a container for the waveform visualizer
    const visualizerContainer = document.createElement('div');
    visualizerContainer.id = 'visualizer-container';
    visualizerContainer.style.marginTop = '10px';
    visualizerContainer.style.width = '100%';
    visualizerContainer.style.height = '160px'; // Increased height for better visibility
    visualizerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    visualizerContainer.style.borderRadius = '4px';
    visualizerContainer.style.overflow = 'hidden';
    visualizerContainer.style.position = 'relative';
    visualizerContainer.style.display = 'flex';
    visualizerContainer.style.flexDirection = 'column';

    // Create waveform visualizer (directly in the container, no spectrum visualizer)
    const waveformContainer = document.createElement('div');
    waveformContainer.id = 'waveform-container';
    waveformContainer.style.width = '100%';
    waveformContainer.style.height = '100%'; // Use full height
    waveformContainer.style.position = 'relative';

    // Create canvas for waveform visualization
    const waveformCanvas = document.createElement('canvas');
    waveformCanvas.id = 'waveform-canvas';
    waveformCanvas.width = 280;
    waveformCanvas.height = 160; // Increased height to match container
    waveformCanvas.style.width = '100%';
    waveformCanvas.style.height = '100%';
    waveformContainer.appendChild(waveformCanvas);

    // Add containers to the visualizer - only add the waveform container
    visualizerContainer.appendChild(waveformContainer);

    // Add roundRect polyfill for browsers that don't support it (like Firefox)
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radii) {
            if (typeof radii === 'number') {
                radii = [radii, radii, radii, radii];
            } else if (radii.length === 1) {
                radii = [radii[0], radii[0], radii[0], radii[0]];
            } else if (radii.length === 2) {
                radii = [radii[0], radii[1], radii[0], radii[1]];
            }

            this.beginPath();
            this.moveTo(x + radii[0], y);
            this.lineTo(x + width - radii[1], y);
            this.quadraticCurveTo(x + width, y, x + width, y + radii[1]);
            this.lineTo(x + width, y + height - radii[2]);
            this.quadraticCurveTo(x + width, y + height, x + width - radii[2], y + height);
            this.lineTo(x + radii[3], y + height);
            this.quadraticCurveTo(x, y + height, x, y + height - radii[3]);
            this.lineTo(x, y + radii[0]);
            this.quadraticCurveTo(x, y, x + radii[0], y);
            this.closePath();
            return this;
        };
    }

    // Add ADSR visualization overlay on waveform - improved version with more space
    const drawEnvelopePath = (ctx, x, y, width, height, attack, decay, sustain, release) => {
        const totalTime = attack + decay + 0.2 + release; // Add 0.2 for sustain display
        const attackX = x + (width * (attack / totalTime));
        const decayX = attackX + (width * (decay / totalTime));
        const releaseX = decayX + (width * (0.2 / totalTime)); // Longer sustain display
        const sustainY = y + (height * (1 - sustain));
        
        // Draw background for envelope - changed to dark grey
        ctx.fillStyle = 'rgba(30, 30, 30, 0.4)'; // Dark grey background
        ctx.fillRect(x, y, width, height);
        
        // Draw grid lines - changed to lighter grey
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 0.5;
        
        // Horizontal grid lines
        for (let i = 1; i < 5; i++) { // More grid lines
            const gridY = y + (height * i / 5);
            ctx.beginPath();
            ctx.moveTo(x, gridY);
            ctx.lineTo(x + width, gridY);
            ctx.stroke();
        }
        
        // Vertical grid lines
        for (let i = 1; i < 5; i++) { // More grid lines
            const gridX = x + (width * i / 5);
            ctx.beginPath();
            ctx.moveTo(gridX, y);
            ctx.lineTo(gridX, y + height);
            ctx.stroke();
        }
        
        // Draw ADSR path - changed to grey tones
        ctx.beginPath();
        ctx.moveTo(x, y + height); // Start at bottom left
        ctx.lineTo(x, y + height); // Bottom left
        ctx.lineTo(attackX, y); // Peak (attack)
        ctx.lineTo(decayX, sustainY); // Decay to sustain level
        ctx.lineTo(releaseX, sustainY); // Sustain
        ctx.lineTo(x + width, y + height); // Release to zero
        
        ctx.fillStyle = 'rgba(160, 160, 160, 0.25)'; // Grey with transparency - changed to 0.3 opacity
        ctx.fill();
        
        // ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)'; // Light grey line
        // ctx.lineWidth = 2;
        // ctx.stroke();
        
        // // Add small dots at breakpoints - changed to white
        // ctx.fillStyle = 'rgba(255, 255, 255, 0.0)';
        // ctx.beginPath();
        // ctx.arc(x, y + height, 4, 0, Math.PI * 2); // Start point - larger dots
        // ctx.arc(attackX, y, 4, 0, Math.PI * 2); // Attack point
        // ctx.arc(decayX, sustainY, 4, 0, Math.PI * 2); // Decay/sustain point
        // ctx.arc(releaseX, sustainY, 4, 0, Math.PI * 2); // End of sustain
        // ctx.arc(x + width, y + height, 4, 0, Math.PI * 2); // End point
        // ctx.fill();
        
        // Add labels with larger font - changed to white
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3';
        ctx.font = '11px monospace'; // Larger font
        ctx.textAlign = 'center';
        
        // Label each section with its value
        ctx.fillText(`A: ${attack.toFixed(2)}`, (x + attackX) / 2, y + height - 8);
        ctx.fillText(`D: ${decay.toFixed(2)}`, (attackX + decayX) / 2, y + 20);
        ctx.fillText(`S: ${sustain.toFixed(2)}`, (decayX + releaseX) / 2, sustainY - 8);
        ctx.fillText(`R: ${release.toFixed(2)}`, (releaseX + x + width) / 2, y + height - 8);
    };

    // Add container to the folder after a delay to ensure folder is created
    setTimeout(() => {
        if (selectedSynthFolder && selectedSynthFolder.element) {
            selectedSynthFolder.element.appendChild(visualizerContainer);
        }
    }, 100);

    // Function to draw both visualizations
    window.drawVisualizations = function() {
        // Schedule next frame
        if (window.visualizationAnimationFrame) {
            cancelAnimationFrame(window.visualizationAnimationFrame);
        }
        window.visualizationAnimationFrame = requestAnimationFrame(window.drawVisualizations);
        
        if (!window.soundManager) return;
        
        const container = document.getElementById('visualizer-container');
        if (container && window.getComputedStyle(container).display === 'none') {
            return; // Don't draw if container is hidden
        }
        
        // Draw waveform visualization
        if (window.soundManager.waveformAnalyzer) {
            const canvas = document.getElementById('waveform-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const waveform = window.soundManager.waveformAnalyzer.getValue();
                
                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw ADSR envelope overlay first (as background)
                if (window.settings) {
                    drawEnvelopePath(
                        ctx, 
                        10, // x
                        10, // y
                        canvas.width - 20, // width
                        canvas.height - 20, // height
                        window.settings.selectedAttack,
                        window.settings.selectedDecay,
                        window.settings.selectedSustain,
                        window.settings.selectedRelease
                    );
                }
                
                // Add center line
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, canvas.height / 2);
                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
                
                // Only draw the waveform if we have a selected neuron
                if (window.soundManager.selectedNeuronId !== null) {
                    // Check if there's an actual signal
                    let hasSignal = false;
                    for (let i = 0; i < waveform.length; i++) {
                        if (Math.abs(waveform[i]) > 0.01) {
                            hasSignal = true;
                            break;
                        }
                    }
                    
                    if (hasSignal) {
                        ctx.beginPath();
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                        ctx.lineWidth = 1.5;
                        
                        const sliceWidth = canvas.width / waveform.length;
                        let x = 0;
                        
                        // Start at the beginning of the waveform
                        ctx.moveTo(x, (waveform[0] * canvas.height / 2) + canvas.height / 2);
                        
                        // Connect all points with lines
                        for (let i = 1; i < waveform.length; i++) {
                            const y = (waveform[i] * canvas.height / 2) + canvas.height / 2;
                            ctx.lineTo(x += sliceWidth, y);
                        }
                        
                        ctx.stroke();
                    }
                }
            }
        }
    };

    // Start the animation and store the ID for cleanup
    window.startVisualizations = function() {
        if (window.visualizationAnimationFrame) {
            cancelAnimationFrame(window.visualizationAnimationFrame);
        }
        window.visualizationAnimationFrame = requestAnimationFrame(window.drawVisualizations);
        console.log("Started audio visualizations");
    };

    // Stop the animation to save resources
    window.stopVisualizations = function() {
        if (window.visualizationAnimationFrame) {
            cancelAnimationFrame(window.visualizationAnimationFrame);
            window.visualizationAnimationFrame = null;
            console.log("Stopped audio visualizations");
        }
    };

    // Initialize analyzer and start visualizations (renamed for clarity)
    window.setupSpectrumAnalyzer = function() {
        if (!window.soundManager) return;
        
        console.log("Setting up audio visualizer");
        
        // Only initialize the waveform analyzer, remove spectrum analyzer code
        if (!window.soundManager.waveformAnalyzer) {
            console.log("Creating waveform analyzer");
            window.soundManager.waveformAnalyzer = new Tone.Analyser("waveform", 128);
            Tone.Destination.connect(window.soundManager.waveformAnalyzer);
        }
        
        // Start visualizations immediately
        window.startVisualizations();
    };

    // Rename the function for clarity but keep the old name for compatibility
    window.setupAudioVisualizer = window.setupSpectrumAnalyzer;

    // Fix the method to play a test tone when the Test Sound button is clicked
    window.playTestTone = function() {
        if (window.soundManager && window.soundManager.selectedNeuronId !== null) {
            console.log("Playing test tone for neuron:", window.soundManager.selectedNeuronId);
            
            // Ensure Tone.js audio context is started
            if (Tone && Tone.context && Tone.context.state !== 'running') {
                Tone.context.resume();
            }
            
            // Override playPreviewSounds setting temporarily for explicit test sound
            const originalPreviewSetting = window.settings?.previewSounds;
            if (window.settings) window.settings.previewSounds = true;
            
            // Play the sound immediately
            window.soundManager.playNeuronFiring(
                0.7, // weight
                0.5, // speed
                window.soundManager.selectedNeuronId,
                true, // isolated
                true, // hasDC
                0    // distance
            );
            
            // Restore original preview setting
            if (window.settings) window.settings.previewSounds = originalPreviewSetting;
            
            // Flash the Test Sound button for visual feedback
            const button = document.querySelector('#visualizer-container button');
            if (button) {
                const originalColor = button.style.backgroundColor;
                button.style.backgroundColor = 'rgba(180, 255, 200, 0.9)';
                button.style.boxShadow = '0 0 8px rgba(100,255,150,0.8)';
                
                // Stronger pulse effect
                setTimeout(() => {
                    button.style.backgroundColor = 'rgba(200, 255, 220, 1.0)';
                    button.style.boxShadow = '0 0 12px rgba(120,255,170,0.9)';
                }, 50);
                
                setTimeout(() => {
                    button.style.backgroundColor = originalColor;
                    button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                }, 300);
            }
            
            // Force update of the envelope visualization
            if (window.drawVisualizations) {
                window.drawVisualizations();
            }
        } else {
            console.warn("Cannot play test tone - no neuron selected");
        }
    };

    // Update InputManager to start visualization when showing the synth panel
    setTimeout(() => {
        const InputManager = window.InputManager;
        if (InputManager && InputManager.prototype.toggleSynthPanel) {
            const originalToggleSynthPanel = InputManager.prototype.toggleSynthPanel;
            
            InputManager.prototype.toggleSynthPanel = function(show, neuron = null) {
                // Call the original method first
                originalToggleSynthPanel.call(this, show, neuron);
                
                // If showing panel for a neuron, update the harmony anchor status
                if (show && neuron) {
                    // Update isHarmonyAnchor in settings based on the selected neuron
                    window.settings.isHarmonyAnchor = neuron.isHarmonyAnchor || false;
                    
                    // Update UI to reflect current status
                    if (window.selectedSynthFolder) {
                        // Force refresh of the synth folder
                        window.selectedSynthFolder.refresh();
                    }
                    
                    // Update any visual indicators for harmony anchors
                    const selectedCircle = window.circles.find(circle => 
                        circle && circle.neuron && circle.neuron.id === window.soundManager?.selectedNeuronId
                    );
                    
                    if (selectedCircle && selectedCircle.neuron && selectedCircle.neuron.isHarmonyAnchor) {
                        // Create or show harmony anchor indicator
                        if (!selectedCircle.harmonyAnchorIndicator) {
                            const indicatorGeometry = new THREE.RingGeometry(0.3, 0.35, 16);
                            const indicatorMaterial = new THREE.MeshBasicMaterial({
                                color: 0xffff00,
                                transparent: true,
                                opacity: 0.5,
                                side: THREE.DoubleSide
                            });
                            
                            const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
                            indicator.rotation.x = -Math.PI / 2;
                            indicator.position.copy(selectedCircle.position);
                            indicator.position.y += 0.05; // Slightly above the neuron
                            
                            // Store reference and add to scene
                            selectedCircle.harmonyAnchorIndicator = indicator;
                            window.scene.add(indicator);
                        } else {
                            // Ensure indicator is visible
                            selectedCircle.harmonyAnchorIndicator.visible = true;
                        }
                    }
                }
                
                // Get the screen width to determine if we're on desktop (≥1024) or mobile
                const screenWidth = window.innerWidth;
                const isDesktop = screenWidth >= 1024;
                
                // Make sure the panel is visible with proper display setting
                if (window.selectedSynthFolder && window.selectedSynthFolder.element) {
                    const panel = window.selectedSynthFolder.element;
                    
                    if (show) {
                        // On mobile, we show/hide based on user action
                        // On desktop, the panel is always visible, but we update the content
                        if (!isDesktop) {
                        panel.style.display = 'block';
                        }
                        
                        // Force a browser reflow to ensure display changes take effect
                        void panel.offsetWidth;
                        
                        // Make sure all sound control children are visible
                        Array.from(panel.children).forEach(child => {
                            if (child) {
                                child.style.display = 'block';
                                // If child has children, make them visible too
                                if (child.children) {
                                    Array.from(child.children).forEach(grandchild => {
                                        if (grandchild) grandchild.style.display = 'block';
                                    });
                                }
                            }
                        });
                        
                        // Remove the placeholder message when a neuron is selected
                        const placeholderMsg = document.getElementById('synth-placeholder-msg');
                        if (placeholderMsg) {
                            placeholderMsg.remove();
                        }
                        
                        // Explicitly refresh the panel
                        if (window.selectedSynthFolder.refresh) {
                            setTimeout(() => {
                                window.selectedSynthFolder.refresh();
                                console.log("Sound controls refreshed after showing");
                            }, 50);
                        }
                    } else {
                        // On mobile, hide the panel when no neuron is selected
                        // On desktop, we show a placeholder message instead
                        if (!isDesktop) {
                        panel.style.display = 'none';
                        } else {
                            // We keep the panel visible but show a placeholder message
                            panel.style.display = 'block';
                            
                            // Add a placeholder message if not already present
                            if (!document.getElementById('synth-placeholder-msg')) {
                                const placeholderMsg = document.createElement('div');
                                placeholderMsg.id = 'synth-placeholder-msg';
                                placeholderMsg.style.padding = '10px';
                                placeholderMsg.style.textAlign = 'center';
                                placeholderMsg.style.color = '#aaa';
                                placeholderMsg.style.fontStyle = 'italic';
                                placeholderMsg.innerHTML = 'Select a neuron to edit sound parameters';
                                
                                // Insert at the top of the folder
                                panel.insertBefore(placeholderMsg, panel.firstChild);
                            }
                        }
                    }
                    
                    console.log(`InputManager: Sound panel display set to ${panel.style.display}, isDesktop: ${isDesktop}`);
                }
                
                // Toggle visibility of global controls when sound panel is shown/hidden
                if (window.globalControls && !isDesktop) {
                    // When showing sound panel, hide global controls (mobile only)
                    const displayValue = show ? 'none' : '';
                    
                    try {
                        console.log("Toggling global controls visibility:", displayValue);
                        for (const key in window.globalControls) {
                            if (window.globalControls[key]) {
                                console.log(`Setting ${key} display to ${displayValue}`);
                                window.globalControls[key].style.display = displayValue;
                            }
                        }
                    } catch (error) {
                        console.error("Error toggling control visibility:", error);
                    }
                } else {
                    console.log("Global controls not toggled (desktop mode or not found)");
                }
                
                // Start visualization if panel is shown
                if (show && neuron && window.drawVisualizations) {
                    console.log("Starting audio visualizations for neuron:", neuron.id);
                    
                    // Initialize and start visualizations
                    if (!window.setupSpectrumAnalyzer) {
                        console.error("setupSpectrumAnalyzer function not found!");
                    } else {
                        window.setupSpectrumAnalyzer(); 
                    }
                    
                    // Force immediate rendering of the envelope visualization
                    forceRenderEnvelope();
                    
                    // Don't automatically highlight any note, let user explicitly select
                    // Clear any existing active note button
                    if (window.activeNoteButton && window.activeNoteButton !== null) {
                        window.activeNoteButton.style.backgroundColor = window.activeNoteButton.dataset.original || 'rgba(50, 50, 50, 0.7)';
                        window.activeNoteButton.style.transform = 'scale(1)';
                        window.activeNoteButton.style.boxShadow = 'none';
                        window.activeNoteButton.style.fontWeight = 'normal';
                        window.activeNoteButton = null;
                    }
                    
                    // Remove automatic test tone when showing panel
                }
                
                // Always update the neuron label position
                if (window.updateNeuronLabelPosition) {
                    window.updateNeuronLabelPosition();
                }
            };
            
            console.log("Successfully patched InputManager.toggleSynthPanel");
        } else {
            console.warn("Could not patch InputManager.toggleSynthPanel - not available");
        }
    }, 1000);

    // Function to render the envelope - uses ReactiveManager for efficient rendering
    function renderEnvelope(canvas) {
        // Make sure we have the canvas
        if (!canvas) {
            console.warn("Waveform canvas not found, can't render envelope");
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn("Could not get canvas context");
            return;
        }
        
        // Ensure canvas is cleared completely
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Use state manager to get settings if available, otherwise use window.settings
        let settings;
        if (typeof stateManager !== 'undefined') {
            settings = stateManager.getState('settings');
        }
        
        // Fallback to window.settings if stateManager is unavailable or returned no settings
        if (!settings) {
            settings = window.settings;
            if (!settings) {
                console.warn("Settings not available for envelope rendering");
            return;
            }
        }
        
        // Draw the envelope using the current settings
        // Use the drawEnvelopePath function if available
        if (typeof drawEnvelopePath === 'function') {
            drawEnvelopePath(
                ctx,
                10, // x
                10, // y
                canvas.width - 20, // width
                canvas.height - 20, // height
                settings.selectedAttack,
                settings.selectedDecay,
                settings.selectedSustain,
                settings.selectedRelease
            );
        } else {
            // If drawEnvelopePath isn't available, provide a minimal drawing
            const x = 10;
            const y = 10;
            const width = canvas.width - 20;
            const height = canvas.height - 20;
            
            const attack = settings.selectedAttack;
            const decay = settings.selectedDecay;
            const sustain = settings.selectedSustain;
            const release = settings.selectedRelease;
            
            const totalTime = attack + decay + 0.1 + release;
            const attackX = x + (width * (attack / totalTime));
            const decayX = attackX + (width * (decay / totalTime));
            const releaseX = decayX + (width * (0.1 / totalTime));
            const sustainY = y + (height * (1 - sustain));
            
            // Draw background
            ctx.fillStyle = 'rgba(20, 40, 20, 0.4)';
            ctx.fillRect(x, y, width, height);
            
            // Draw ADSR path
            ctx.beginPath();
            ctx.moveTo(x, y + height);
            ctx.lineTo(attackX, y);
            ctx.lineTo(decayX, sustainY);
            ctx.lineTo(releaseX, sustainY);
            ctx.lineTo(x + width, y + height);
            
            ctx.fillStyle = 'rgba(90, 200, 120, 0.3)';
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(120, 240, 160, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }
    
    // Function to request an envelope update via ReactiveManager
    function forceRenderEnvelope() {
        // Use the ReactiveManager if available, otherwise fallback to direct rendering
        if (typeof reactiveManager !== 'undefined') {
            reactiveManager.markCanvasForUpdate();
        } else {
            // Direct rendering fallback
            const canvas = document.getElementById('waveform-canvas');
            if (canvas) {
                renderEnvelope(canvas);
            }
        }
    }

    // Register renderEnvelope with state manager - do this when both are available
    try {
        if (stateManager && window.soundManager) {
            stateManager.registerComponent('soundManager', {
                ...window.soundManager,
                renderEnvelope: renderEnvelope
            });
        }
    } catch (error) {
        console.warn("Could not register soundManager with stateManager:", error);
    }
    
    // Make wrapper function available for backward compatibility
    window.forceRenderEnvelope = forceRenderEnvelope;

    // Make sure envelope is initialized after setup
    setTimeout(() => {
        // Initialize analyzer immediately if it exists
        if (window.setupSpectrumAnalyzer) {
            window.setupSpectrumAnalyzer();
        }
        
        // Also initialize envelope if a synth panel is already open
        if (window.selectedSynthFolder && window.selectedSynthFolder.element.style.display !== 'none') {
            forceRenderEnvelope();
        }
    }, 1000);

    // Add volume balance control directly to main pane
pane.addBinding(window.settings, 'volumeNormalization', {
        min: 0,
        max: 2,
        step: 0.1,
        label: 'Volume Balance'
    }).on('change', (ev) => {
        if (window.soundManager) {
            window.soundManager.setVolumeNormalization(ev.value);
        }
    });

    // Connection Weight and Speed controls removed as requested

    // Initialize global controls object
    window.globalControls = {};
        
        console.log("Global controls initialized:", window.globalControls);

    // Add the updateSynthControls function to the window object
    window.updateSynthControls = function(params) {
        if (!params) return;
        
        // Update all controls with the new values
        Object.keys(params).forEach(key => {
            if (key in window.settings) {
                window.settings[key] = params[key];
            }
        });
        
        // Refresh the pane to show updated values
        if (pane && pane.refresh) {
            pane.refresh();
        }
    };

    // Initialize envelope visualization
    // const envelopeVisualizationFolder = selectedSynthFolder.addFolder({
    //     title: 'Envelope Visualization',
    //     expanded: false
    // });
    
    // Add a Test Sound button to the top of the selectedSynthFolder
    // so users can intentionally hear the sound of the selected neuron
    /*
    const testSoundButton = selectedSynthFolder.addButton({
        title: 'Test Sound',
        label: 'Test Sound'
    });
    
    testSoundButton.on('click', () => {
        if (window.soundManager && window.soundManager.selectedNeuronId !== null) {
            window.playTestTone();
        }
    });
    */
    
    // Create a canvas for the envelope visualization
    // const envelopeCanvas = document.createElement('canvas');

    // Function to highlight preset button by preset name
    window.highlightPresetButton = function(presetName) {
        // First unhighlight any currently active button
        if (activePresetButton) {
            activePresetButton.style.backgroundColor = activePresetButton.dataset.original || '#333333';
            activePresetButton.style.color = activePresetButton.dataset.originalText || '#000000';
            activePresetButton.style.transform = 'scale(1)';
            activePresetButton.style.boxShadow = 'none';
            
            // Restore individual borders instead of setting a single border property
            activePresetButton.style.borderTop = `2px solid ${activePresetButton.dataset.originalBorderTop || '#333333'}`;
            activePresetButton.style.borderLeft = `2px solid ${activePresetButton.dataset.originalBorderLeft || '#333333'}`;
            activePresetButton.style.borderBottom = `2px solid ${activePresetButton.dataset.originalBorderBottom || '#333333'}`;
            activePresetButton.style.borderRight = `2px solid ${activePresetButton.dataset.originalBorderRight || '#333333'}`;
            
            activePresetButton.style.animation = '';
            activePresetButton.style.fontWeight = 'normal';
        }
        
        // Find the button with matching preset name
        const allButtons = presetButtonGrid.querySelectorAll('button');
        let foundButton = null;
        
        allButtons.forEach(button => {
            if (button.textContent === presetName) {
                foundButton = button;
            }
        });
        
        if (foundButton) {
        // Apply much more pronounced active styling - smaller and darker
        // Use the button's original color but darken it by 70%
        const originalColor = foundButton.dataset.original || '#333333';
        let darkerColor;
        
        if (originalColor.startsWith('#')) {
            // Convert hex to RGB and darken
            const hex = originalColor.replace('#', '');
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);
            
            // Darken by reducing each component to 30%
            r = Math.floor(r * 0.3);
            g = Math.floor(g * 0.3);
            b = Math.floor(b * 0.3);
            
            darkerColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        } else if (originalColor.startsWith('rgb')) {
            // Handle RGB format
            const matches = originalColor.match(/\d+/g);
            if (matches && matches.length >= 3) {
                const r = Math.floor(parseInt(matches[0]) * 0.3);
                const g = Math.floor(parseInt(matches[1]) * 0.3);
                const b = Math.floor(parseInt(matches[2]) * 0.3);
                darkerColor = `rgb(${r}, ${g}, ${b})`;
            } else {
                darkerColor = '#111111'; // Fallback if parsing fails
            }
        } else {
            darkerColor = '#111111'; // Fallback for unknown formats
        }
        
        foundButton.style.backgroundColor = darkerColor;
        foundButton.style.color = '#d8d8d8';          // Slightly dimmer text
        foundButton.style.transform = 'scale(0.92)';  // Smaller scale 
        foundButton.style.fontWeight = 'bold';        // Make text bold
        foundButton.style.boxShadow = '0 0 8px rgba(80, 80, 80, 0.4)'; // Very subtle glow
        
        // Inverted lighting effect with darker borders
        foundButton.style.borderTop = '3px solid #000000';    // Darker top
        foundButton.style.borderLeft = '3px solid #000000';   // Darker left
        foundButton.style.borderBottom = '3px solid #222222'; // Lighter bottom
        foundButton.style.borderRight = '3px solid #222222';  // Lighter right
        
        // Add a pulsing border
        const keyframes = document.createElement('style');
        // Create an animation that uses a very subtle, darker pulse effect
        let glowColor = 'rgba(60, 60, 60, 0.3)';
        let glowColorBright = 'rgba(80, 80, 80, 0.4)';
        
        // Try to derive glow color from the original but make it darker
        if (originalColor.startsWith('#')) {
            const hex = originalColor.replace('#', '');
            let r = parseInt(hex.substring(0, 2), 16);
            let g = parseInt(hex.substring(2, 4), 16);
            let b = parseInt(hex.substring(4, 6), 16);
            
            // Make the glow darker than the original color
            r = Math.floor(r * 0.25);
            g = Math.floor(g * 0.25);
            b = Math.floor(b * 0.25);
            
            glowColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
            glowColorBright = `rgba(${r}, ${g}, ${b}, 0.4)`;
        }
        
        keyframes.textContent = `
            @keyframes activePulse {
                0% { box-shadow: 0 0 3px ${glowColor}; }
                50% { box-shadow: 0 0 5px ${glowColorBright}; }
                100% { box-shadow: 0 0 3px ${glowColor}; }
            }
        `;
        document.head.appendChild(keyframes);
        
        foundButton.style.animation = 'activePulse 1.2s infinite';
        
        // Add checkmark indicator
        foundButton.style.position = 'relative';
            
            // Set as active button
            activePresetButton = foundButton;
            
            console.log(`Highlighted preset button: ${presetName}`);
        }
    };
    
    // Function to unhighlight the active preset button
    window.unhighlightActivePreset = function() {
        if (activePresetButton) {
            // Restore original appearance
            activePresetButton.style.backgroundColor = activePresetButton.dataset.original || '#333333';
            activePresetButton.style.color = activePresetButton.dataset.originalText || '#000000';
            activePresetButton.style.transform = 'scale(1)';
            activePresetButton.style.boxShadow = 'none';
            
            // Restore individual borders instead of setting a single border property
            activePresetButton.style.borderTop = `2px solid ${activePresetButton.dataset.originalBorderTop || '#333333'}`;
            activePresetButton.style.borderLeft = `2px solid ${activePresetButton.dataset.originalBorderLeft || '#333333'}`;
            activePresetButton.style.borderBottom = `2px solid ${activePresetButton.dataset.originalBorderBottom || '#333333'}`;
            activePresetButton.style.borderRight = `2px solid ${activePresetButton.dataset.originalBorderRight || '#333333'}`;
            
            activePresetButton.style.animation = '';
            activePresetButton.style.fontWeight = 'normal';
            activePresetButton = null;
        }
        // Clear the active preset
        window.activePreset = null;
    };

    // Create utility function to apply a preset and remember it for future neurons
    window.applyAndRememberPreset = function(preset, neuronId = null) {
        if (!preset) return false;
        
        console.log(`%c[PRESET SYSTEM] Remembering preset "${preset.name}" for future neurons`, "color: #00ff00; font-weight: bold;");
        
        // Store this preset globally as the active preset
        window.activePreset = preset;
        
        // Store the preset but specially handle the color property to preserve THREE.Color instance
        window.lastSelectedPreset = JSON.parse(JSON.stringify(preset)); // Deep clone
        
        // Special handling for color - JSON.stringify/parse loses THREE.Color type
        if (preset.color && preset.color.isColor) {
            // If it's a THREE.Color, create a new one and copy values
            window.lastSelectedPreset.color = new THREE.Color();
            window.lastSelectedPreset.color.copy(preset.color);
        }
        
        // If we have a neuron ID, apply the preset to that neuron
        if (neuronId !== null && window.soundManager) {
            // Apply to specific neuron
            applyPreset(preset, neuronId);
            return true;
        }
        
        return true;
    };

    // Add function to check and adjust volume for specific instrument types
    window.adjustVolumeForInstrumentType = function(params) {
        if (!params) return params;
        
        // Check the instrument type by name
        const name = params.name?.toLowerCase() || '';
        
        // Simple name-based checks for main instrument categories
        if (name.includes('lead') || name.includes('organ') || name.includes('pad')) {
            // Don't override manually set values for lead, organ or pad instruments
            console.log(`%c[VOLUME ADJUSTMENT] Using preset value for ${params.name}`, "color: #ff8800;");
            // No change - use the preset value
        } else if (name.includes('brass') || name.includes('string')) {
            console.log(`%c[VOLUME ADJUSTMENT] Setting volume to -8dB for ${params.name}`, "color: #ff8800;");
            params.neuronVolume = -8;
        }
        
        return params;
    };

    // Create utility function to apply a preset to a specific neuron
    window.applyPreset = function(preset, neuronId) {
        if (!preset) return false;
        
        // If neuronId is not provided, use the currently selected neuron
        if (!neuronId && window.soundManager) {
            neuronId = window.soundManager.selectedNeuronId;
        }
        
        // Still need a valid neuronId to proceed
        if (!neuronId || !window.soundManager) {
            console.error(`[PRESET SYSTEM] No neuron selected or provided`);
            return false;
        }
        
        console.log(`%c[PRESET SYSTEM] Applying preset "${preset.name}" to neuron ${neuronId}`, "color: #00ff00; font-weight: bold;");
        
        // Get the neuron's mesh
        const neuron = window.circles.find(circle => 
            circle && circle.neuron && circle.neuron.id === neuronId
        );
        
        if (!neuron) {
            console.error(`[PRESET SYSTEM] Could not find neuron ${neuronId}`);
            return false;
        }
        
        // Apply color to the neuron's material with animation
        if (preset.color) {
            // Store original color for animation
            const originalColor = neuron.material.color.clone();
            const targetColor = preset.color.clone();
            
            // Store the preset color for future reference
            neuron.neuron.presetColor = preset.color.clone();
            
            // Create animation for smooth color transition
            gsap.to(originalColor, {
                r: targetColor.r,
                g: targetColor.g,
                b: targetColor.b,
                duration: 0.5, // 500ms animation
                ease: "power2.out",
                onUpdate: function() {
                    // Update the neuron's material color during animation
                    neuron.material.color.setRGB(originalColor.r, originalColor.g, originalColor.b);
                },
                onComplete: function() {
                    // Ensure final color is exactly the target color
                    neuron.material.color.copy(targetColor);
                }
            });
            
            // Create an immediate and more dramatic particle explosion with the new preset color
            // Check if the particle explosion method exists
            
            if (neuron.neuron && typeof neuron.neuron.createParticleExplosion === 'function') {
                // Use the built-in method
                // Trigger an immediate particle explosion with the new color
                neuron.neuron.createParticleExplosion({
                    color: preset.color,
                    count: 25,         // Much more particles 
                    speed: 1.2,        // Faster particles for more dramatic effect
                    scale: 0.2,        // Larger particles
                    duration: 1200     // Longer duration
                });
                
                // Add a second burst for extra visual impact
                setTimeout(() => {
                    neuron.neuron.createParticleExplosion({
                        color: preset.color,
                        count: 15,
                        speed: 0.9,
                        scale: 0.15,
                        duration: 1000
                    });
                }, 150); // Small delay for second burst
            } else {
                // Fallback: Create direct explosion by accessing the scene directly
                // Create our own particle explosion since the built-in method isn't available
                
                const createDirectExplosion = (count, scale, speed, duration) => {
                                         const particleGeometry = new THREE.PlaneGeometry(scale, scale);
                     const particleColor = preset.color.clone();
                     // Less brightening of color to keep it closer to the original
                     particleColor.r = Math.min(1.2, particleColor.r * 1.1);
                     particleColor.g = Math.min(1.2, particleColor.g * 1.1);
                     particleColor.b = Math.min(1.2, particleColor.b * 1.1);
                    
                    const particleMaterial = new THREE.MeshBasicMaterial({
                        color: particleColor,
                        transparent: true,
                        opacity: 1.0,  // Reduced opacity
                        side: THREE.DoubleSide,
                        depthTest: false,
                        depthWrite: false
                    });
                    
                    for (let i = 0; i < count; i++) {
                        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
                        const angle = (i / count) * Math.PI * 2;
                        const radius = 0.1;  // Smaller initial radius
                        
                        particle.position.set(
                            neuron.position.x + Math.cos(angle) * radius,
                            neuron.position.y + 0.05,  // Just slightly above neuron
                            neuron.position.z + Math.sin(angle) * radius
                        );
                        
                        particle.rotation.x = -Math.PI / 2;
                        particle.renderOrder = 9999;  // Very high render order
                        
                        // Add to scene directly
                        scene.add(particle);
                        
                        gsap.to(particle.position, {
                            x: neuron.position.x + Math.cos(angle) * (radius * speed * 13),  // Reduced travel distance
                            y: particle.position.y + 0.1,  // Lower maximum height
                            z: neuron.position.z + Math.sin(angle) * (radius * speed * 13),  // Reduced travel distance
                            duration: duration / 1000,
                            ease: "power2.out"
                        });
                        
                        gsap.to(particle.material, {
                            opacity: 0,
                            duration: duration / 1000,
                            ease: "power1.out",
                            onComplete: () => {
                                scene.remove(particle);
                                particle.material.dispose();
                                particle.geometry.dispose();
                            }
                        });
                    }
                };
                
                // Create direct particle explosions with our fallback - using more subtle values
                createDirectExplosion(8, 0.15, 0.75, 800);
                

            }
            
            // Update the neuron grid display immediately
            if (window.updateNeuronGrid) {
                window.updateNeuronGrid();
            }
        }
        
        // Store the preset name - handle case where presetName might be read-only
        try {
            // Try to set the presetName directly
            neuron.neuron.presetName = preset.name;
        } catch (e) {
            // If fails, it might be a read-only property, store it in userData instead
            console.log("Using alternative method to store preset name");
            if (!neuron.userData) neuron.userData = {};
            neuron.userData.presetName = preset.name;
        }
        
        // Create sound parameters from the preset
        const soundParams = {
            ...preset,
            envelope: {
                attack: preset.attack || 0.002,
                decay: preset.decay || 0.3,
                sustain: preset.sustain || 0.2,
                release: preset.release || 0.8
            },
            oscillator: {
                type: preset.oscillatorType || 'triangle'
            },
            filter: {
                type: preset.filterType || 'lowpass',
                frequency: preset.filterFrequency || 5000,
                Q: preset.filterQ || 1
            },
            effects: {
                reverbSend: preset.reverbSend || 0.2,
                delaySend: preset.delaySend || 0.15
            },
            modulation: {
                tremoloFreq: preset.tremoloFreq || 4,
                tremoloDepth: preset.tremoloDepth || 0,
                vibratoFreq: preset.vibratoFreq || 5,
                vibratoDepth: preset.vibratoDepth || 0
            }
        };
        
        // Apply the sound parameters
        window.soundManager.neuronSoundOverrides.set(neuronId, soundParams);
        
        // Remember this preset for future neurons
        window.lastSelectedPreset = JSON.parse(JSON.stringify(preset)); // Deep clone
        
        // Special handling for color - JSON.stringify/parse loses THREE.Color type
        if (preset.color && preset.color.isColor) {
            // If it's a THREE.Color, create a new one and copy values
            window.lastSelectedPreset.color = new THREE.Color();
            window.lastSelectedPreset.color.copy(preset.color);
        }
        
        // Update UI if available
        if (window.refreshSoundControls) {
            window.refreshSoundControls();
        }
        
        // Play a test sound if preview is enabled
        if (window.settings && window.settings.previewSounds && window.soundManager) {
            setTimeout(() => {
                window.soundManager.playNeuronFiring(
                    0.5,  // medium weight
                    0.7,  // faster speed
                    neuronId,
                    true, // isolated
                    false, // hasDC
                    0     // no distance
                );
            }, 100);
        }
        
        return true;
    };

} catch(error) {
    console.error("Error setting up Tweakpane controls:", error);
}

// Remove any grid container we may have added to the document body
const existingGridContainer = document.getElementById('neuron-grid-container');
if (existingGridContainer && existingGridContainer.parentNode) {
    existingGridContainer.parentNode.removeChild(existingGridContainer);
}

// Initialize managers
const connectionManager = new ConnectionManager(scene, camera, renderer);
const inputManager = new InputManager(camera, renderer, connectionManager);

// Make inputManager available globally for debugging
window.inputManager = inputManager;

// Initialize SoundManager here
console.log("Initializing OptimizedSoundManager with oscillator bank for phase synchronization");
window.soundManager = new OptimizedSoundManager(scene, camera, renderer);

// Initialize the Worker Manager to decouple UI from audio processing
console.log("Initializing WorkerManager for decoupled audio/simulation processing");
window.workerManager = new WorkerManager(window.soundManager);

// Initialize HarmonicSystem after SoundManager
console.log("Initializing HarmonicSystem for proximity-based harmonic relationships");
window.harmonicSystem = new HarmonicSystem(scene, window.soundManager);
console.log("Harmonic system initialized!");

// Initialize the waveform analyzer right after creating the sound manager
setTimeout(() => {
    if (window.setupSpectrumAnalyzer) {
        window.setupSpectrumAnalyzer();
        console.log("Initialized waveform analyzer at startup");
    }
}, 500);

// Add test sound function after setup
setTimeout(() => {
    // Test sound directly to make sure audio is working
    if (window.soundManager && window.soundManager.testSound) {
        console.log("Playing test sound to verify audio is working...");
        window.soundManager.testSound();
    } else {
        console.error("Test sound function not found!");
    }
}, 1000);

// Patch Neuron methods to use the worker manager
setTimeout(() => {
    if (window.workerManager && window.workerManager.isInitialized) {
        console.log("Patching neuron methods to use worker manager...");
        
        // Replace Neuron.prototype.fire with a version that uses the worker manager
        const originalFire = Neuron.prototype.fire;
        Neuron.prototype.fire = function(timeOffset = 0) {
            // Still call the original fire method for visual effects and local state
            const result = originalFire.call(this, timeOffset);
            
            // If worker manager is available, let it handle the actual firing logic
            if (window.workerManager && window.workerManager.isInitialized) {
                // Send firing event to simulation worker
                window.workerManager.simulationWorker.postMessage({
                    type: 'externalInput',
                    neuronId: this.id,
                    value: this.threshold // Force it to reach threshold
                });
            }
            
            return result;
        };
        
        // Patch setDCInput to use worker manager
        const originalSetDCInput = Neuron.prototype.setDCInput;
        Neuron.prototype.setDCInput = function(value) {
            // Still call the original method for visual updates
            const result = originalSetDCInput.call(this, value);
            
            // If worker manager is available, let it handle the DC logic
            if (window.workerManager && window.workerManager.isInitialized) {
                window.workerManager.setDCInput(this.id, value);
            }
            
            return result;
        };
        
        // Patch add neuron to register with worker manager
        const originalAddNeuron = window.settings.addNeuron;
        window.settings.addNeuron = function(position) {
            // Call original method to create the neuron
            const neuron = originalAddNeuron.call(this, position);
            
            // Register the new neuron with the worker manager
            if (window.workerManager && window.workerManager.isInitialized && neuron) {
                window.workerManager.addNeuron(neuron);
            }
            
            return neuron;
        };
        
        console.log("Neuron methods patched successfully!");
    }
}, 1500);

// Use the already declared activeNoteButton variable
window.activeNoteButton = null;

// Optimized neuron creation - NO label references
function createNewNeuron(position = null, dcInput = null) {
    // Create a new instance of the material for each neuron instead of sharing
    const circleMaterial = neuronMaterial.clone();
    
    // Use the cloned material for this neuron
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    circle.rotation.x = -Math.PI / 2;
    
    if (position) {
        circle.position.set(position.x, 0.1, position.z);
    } else {
        circle.position.set(
            (Math.random() - 0.5) * 10,
            0.1,
            (Math.random() - 0.5) * 10
        );
    }
    
    circle.scale.setScalar(0.2);
    circle.matrixAutoUpdate = true;
    
    // Create color for this instance
    let neuronColor = new THREE.Color(0x0000ff); // Default blue
    
    // Set color based on preset
    if (window.lastSelectedPreset && window.lastSelectedPreset.color) {
        if (window.lastSelectedPreset.color.isColor) {
            neuronColor.copy(window.lastSelectedPreset.color);
        } else if (typeof window.lastSelectedPreset.color === 'object') {
            const r = window.lastSelectedPreset.color.r !== undefined ? window.lastSelectedPreset.color.r : 0;
            const g = window.lastSelectedPreset.color.g !== undefined ? window.lastSelectedPreset.color.g : 0;
            const b = window.lastSelectedPreset.color.b !== undefined ? window.lastSelectedPreset.color.b : 1;
            neuronColor.setRGB(r, g, b);
        } else {
            neuronColor.set(window.lastSelectedPreset.color);
        }
    } else if (window.activePreset && window.activePreset.color) {
        if (window.activePreset.color.isColor) {
            neuronColor.copy(window.activePreset.color);
        } else {
            neuronColor.set(window.activePreset.color);
        }
    }
    
    // Apply color directly to the material
    circleMaterial.color.copy(neuronColor);
    
    // Store the current color for later reference 
    circle.userData.originalColor = neuronColor.clone();
    
    // Create the larger invisible touch area
    const touchArea = new THREE.Mesh(touchGeometry, touchMaterial);
    touchArea.rotation.x = -Math.PI / 2;
    touchArea.position.copy(circle.position);
    
    // Make touch areas much larger, especially on mobile devices
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const touchScale = isMobile ? 0.1 : 0.2; // Increased from 3.0 to 8.0 for desktop
    
    touchArea.scale.setScalar(touchScale);
    touchArea.matrixAutoUpdate = true;
    touchArea.visible = false; // Invisible touch area
    touchArea.isHitArea = true;  // Flag to identify the hit area
    touchArea.parentCircle = circle;  // Reference to the parent circle
    
    // Add the touch area to the scene
    scene.add(touchArea);
    
    // Store the touch area reference
    circle.touchArea = touchArea;
    
    const neuron = new Neuron(circle);
    circle.neuron = neuron;
    
    // Add the circle to the scene
    scene.add(circle);
    
    // Make sure the neuron has a note assigned immediately
    if (window.soundManager) {
        // Assign a note right away
        window.soundManager.assignFrequencyRange(neuron.id);
        
        // Apply sound parameters to the new neuron
        if (window.soundManager.neuronSoundOverrides) {
            let paramToUse;
            
            // First priority: Use lastSelectedPreset if available
            if (window.lastSelectedPreset) {

                
                // Clone params but keep special handling for the color object
                paramToUse = JSON.parse(JSON.stringify(window.lastSelectedPreset)); 
                
                // Apply volume adjustment for specific instrument types
                if (window.adjustVolumeForInstrumentType) {
                    window.adjustVolumeForInstrumentType(paramToUse);
                }
                
                // Restore the proper color object that might have been lost in JSON serialization
                if (window.lastSelectedPreset.color) {
                    if (window.lastSelectedPreset.color.isColor) {
                        paramToUse.color = window.lastSelectedPreset.color;
                    } else if (typeof window.lastSelectedPreset.color === 'object') {
                        const r = window.lastSelectedPreset.color.r !== undefined ? window.lastSelectedPreset.color.r : 0;
                        const g = window.lastSelectedPreset.color.g !== undefined ? window.lastSelectedPreset.color.g : 0;
                        const b = window.lastSelectedPreset.color.b !== undefined ? window.lastSelectedPreset.color.b : 1;
                        paramToUse.color = new THREE.Color(r, g, b);
                    } else {
                        paramToUse.color = new THREE.Color(window.lastSelectedPreset.color);
                    }
                }
                
                // Store the color and name in the neuron for reference
                neuron.presetColor = circle.material.color.clone();
                neuron.presetName = paramToUse.name || "Remembered Preset";
            }
            // Second priority: Use soundManager's lastSelectedNeuronParams
            else if (window.soundManager.lastSelectedNeuronParams) {

                paramToUse = JSON.parse(JSON.stringify(window.soundManager.lastSelectedNeuronParams));
                
                // Apply color if available
                if (paramToUse.color) {
                    // Apply color to the neuron's material
                    if (typeof paramToUse.color === 'object' && paramToUse.color.isColor) {
                        circle.material.color.copy(paramToUse.color);
                        neuron.presetColor = paramToUse.color.clone ? paramToUse.color.clone() : new THREE.Color(paramToUse.color);
                    } else if (typeof paramToUse.color === 'object') {
                        const color = new THREE.Color(
                            paramToUse.color.r !== undefined ? paramToUse.color.r : 0,
                            paramToUse.color.g !== undefined ? paramToUse.color.g : 0,
                            paramToUse.color.b !== undefined ? paramToUse.color.b : 1
                        );
                        circle.material.color.copy(color);
                        neuron.presetColor = color;
                    }
                    
                    neuron.presetName = paramToUse.name || "Custom Sound";

                }
            }
            // Third priority: Use a random preset from defaults
            else {

                const randomPresetIndex = Math.floor(Math.random() * defaultPresets.length);
                const randomPreset = defaultPresets[randomPresetIndex];
                paramToUse = randomPreset;
                
                // Also set the preset color and name
                if (randomPreset.color) {
                    // Apply color to the neuron's material
                    circle.material.color.copy(randomPreset.color);
                    
                    // Store preset color and name
                    neuron.presetColor = randomPreset.color.clone();
                    neuron.presetName = randomPreset.name;
                    

                }
            }
            

            
            // Create sound overrides from the selected parameters with special care to handle nested properties
            const soundParams = {
                // Copy top-level properties
                ...paramToUse,
                
                // Create envelope structure properly
                envelope: {
                    attack: paramToUse.attack || (paramToUse.envelope ? paramToUse.envelope.attack : undefined) || 0.002,
                    decay: paramToUse.decay || (paramToUse.envelope ? paramToUse.envelope.decay : undefined) || 0.3,
                    sustain: paramToUse.sustain || (paramToUse.envelope ? paramToUse.envelope.sustain : undefined) || 0.2,
                    release: paramToUse.release || (paramToUse.envelope ? paramToUse.envelope.release : undefined) || 0.8,
                    attackCurve: paramToUse.attackCurve || (paramToUse.envelope ? paramToUse.envelope.attackCurve : undefined) || "exponential",
                    decayCurve: paramToUse.decayCurve || (paramToUse.envelope ? paramToUse.envelope.decayCurve : undefined) || "exponential",
                    releaseCurve: paramToUse.releaseCurve || (paramToUse.envelope ? paramToUse.envelope.releaseCurve : undefined) || "exponential"
                },
                
                // Create oscillator structure properly
                oscillator: {
                    type: paramToUse.oscillatorType || (paramToUse.oscillator ? paramToUse.oscillator.type : undefined) || "triangle"
                },
                
                // Create filter structure properly
                filter: {
                    type: paramToUse.filterType || (paramToUse.filter ? paramToUse.filter.type : undefined) || "lowpass",
                    frequency: paramToUse.filterFrequency || (paramToUse.filter ? paramToUse.filter.frequency : undefined) || 5000,
                    Q: paramToUse.filterQ || (paramToUse.filter ? paramToUse.filter.Q : undefined) || 1
                },
                
                // Create effects structure properly
                effects: {
                    reverbSend: paramToUse.reverbSend || (paramToUse.effects ? paramToUse.effects.reverbSend : undefined) || 0.2,
                    delaySend: paramToUse.delaySend || (paramToUse.effects ? paramToUse.effects.delaySend : undefined) || 0.15
                },
                
                // Create modulation structure properly
                modulation: {
                    tremoloFreq: paramToUse.tremoloFreq || (paramToUse.modulation ? paramToUse.modulation.tremoloFreq : undefined) || 4,
                    tremoloDepth: paramToUse.tremoloDepth || (paramToUse.modulation ? paramToUse.modulation.tremoloDepth : undefined) || 0,
                    vibratoFreq: paramToUse.vibratoFreq || (paramToUse.modulation ? paramToUse.modulation.vibratoFreq : undefined) || 5,
                    vibratoDepth: paramToUse.vibratoDepth || (paramToUse.modulation ? paramToUse.modulation.vibratoDepth : undefined) || 0
                },
                
                // Store name explicitly
                name: paramToUse.name
            };
            
            window.soundManager.neuronSoundOverrides.set(neuron.id, soundParams);

        }
        
        // Only play initial sound if preview sounds are enabled
        if (window.settings && window.settings.previewSounds) {
        setTimeout(() => {
            window.soundManager.playNeuronFiring(
                0.5,  // medium weight
                0.7,  // faster speed
                neuron.id,
                true, // isolated
                dcInput > 0, // hasDC
                0 // no distance
            );
        }, 100);
        }
    }
    
    if (dcInput !== null) {
        neuron.dcInput = dcInput;
        neuron.currentCharge = dcInput;
        
        if (dcInput === 1.0) {
            setTimeout(() => {
                neuron.fire();
            }, 200);
        }
    }
    
    // Make sure to update the neuron grid display to show the new neuron with its color
    if (window.updateNeuronGrid) {
        setTimeout(() => window.updateNeuronGrid(), 200);
    }
    
    // Add visual feedback animation for new neuron creation
    circle.neuron.createParticleExplosion();
    
    return circle;
}

// Animation loop - now called by SceneManager
function animate(currentTime, deltaTime, fps) {
    // Update connection manager
    connectionManager.updateAllConnections();
    
    // Update neurons
    window.circles.forEach(circle => {
        if (circle.neuron) {
            circle.neuron.update();
        }
    });
    
    // Update the harmonic system every frame - important for visual feedback
    if (window.harmonicSystem) {
        window.harmonicSystem.update();
        
        // Ensure harmonic visualization always works by forcing minimum values
        if (window.harmonicSystem.harmonyStrength < 0.1) {
            window.harmonicSystem.harmonyStrength = 0.1;
        }
    }
    
    // Update particles using the optimized particle system
    if (window.particleSystem && typeof window.particleSystem.update === 'function') {
        window.particleSystem.update(deltaTime);
    } else if (window.workerManager && typeof window.workerManager.updateParticles === 'function') {
        window.workerManager.updateParticles(deltaTime);
    }
    
    // The legacy particle system code has been removed in favor of OptimizedParticleSystem
    
    // Real-time update of hover label if a neuron is currently being hovered
    if (window.currentHoveredNeuron && uiManager.neuronHoverLabel.style.display === 'block') {
        const neuron = window.currentHoveredNeuron;
        if (neuron && neuron.neuron) {
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
                colorStyle = `color: rgb(${r}, ${g}, ${b}); text-shadow: 0 0 2px rgba(0,0,0,0.5);`;
            }
            
            // Update the hover label with current info
            // Simplified HTML with cleaner layout
            uiManager.neuronHoverLabel.innerHTML = `
                <div class="neuron-info-header ${presetName ? 'with-preset' : ''}" style="${colorStyle}">
                    <span class="neuron-id">N${id}</span>
                    <span class="neuron-preset">${presetName || ''}</span>
                </div>
                <div class="neuron-info-stats">
                    <div class="stat-group">
                        <div class="stat-label">Charge:</div>
                        <div class="stat-value">${charge} (${chargePercent}%)</div>
                    </div>
                    <div class="stat-group">
                        <div class="stat-label">DC Input:</div>
                        <div class="stat-value">${dcInput}</div>
                    </div>
                </div>
            `;
        }
    }
}

function setupInitialNetwork() {
    // Helper function to find a preset by name
    const findPresetByName = (name) => {
        if (!window.defaultPresets) return null;
        return window.defaultPresets.find(preset => preset.name === name);
    };

    const initialSetup = [
        { position: { x: -2, z: -3 }, dc: 0.25, preset: "Bass" },        // Neuron 1: DC 0.25, Bass
        { position: { x: 2, z: -3 }, dc: 0.1, preset: "Bright Hi-Hat" }, // Neuron 2: DC 0.1, Hi-Hat
        { position: { x: 0, z: 1 }, dc: 0.0, preset: "Pad" }             // Neuron 3: DC 0, Pad
    ];

    const connections = [
        { from: 0, to: 1, weight: 0.2, speed: 0.5 },
        { from: 1, to: 2, weight: 0.2, speed: 0.5 },
        { from: 2, to: 0, weight: 0.2, speed: 0.7 }
    ];

    // First, set up the presets so new neurons will be created with them
    initialSetup.forEach((setup, index) => {
        // Find the preset by name
        const preset = findPresetByName(setup.preset);
        
        // If we found the preset, remember it temporarily
        if (preset) {
            // Store for the next neuron creation
            window.lastSelectedPreset = JSON.parse(JSON.stringify(preset));
            
            // Special handling for color property
            if (preset.color && preset.color.isColor) {
                window.lastSelectedPreset.color = new THREE.Color();
                window.lastSelectedPreset.color.copy(preset.color);
            }
            
            // Create the neuron with the specific preset
        const neuron = createNewNeuron(setup.position, 0); // Start with 0 DC
        window.circles.push(neuron);
        scene.add(neuron);
            
            // --- Ensure neuron 1 is set to F2 and no custom override ---
            if (index === 0 && window.soundManager) {
                // Assign F2 as the note (will set baseFreq)
                window.soundManager.assignFrequencyRange(neuron.neuron.id);
                // Remove any custom note override for neuron 1
                if (window.soundManager.neuronSoundOverrides) {
                    const overrides = window.soundManager.neuronSoundOverrides.get(neuron.neuron.id);
                    if (overrides && overrides.note) {
                        delete overrides.note;
                    }
                }
                // Also ensure customFreq is null
                if (window.soundManager.neuronFrequencies) {
                    const freqData = window.soundManager.neuronFrequencies.get(neuron.neuron.id);
                    if (freqData) {
                        freqData.customFreq = null;
                    }
                }
            }
            // --- End F2 enforcement ---
        } else {
            console.warn(`Preset ${setup.preset} not found, using random preset`);
            const neuron = createNewNeuron(setup.position, 0);
            window.circles.push(neuron);
            scene.add(neuron);
        }
    });

    setTimeout(() => {
        try {
        // Set DC inputs using the proper method
        window.circles.forEach((circle, index) => {
                if (circle.neuron && initialSetup[index]) { // Added check for index bounds
                circle.neuron.setDCInput(initialSetup[index].dc);
            }
        });

        // Create connection array to track all created connections
        const createdConnections = [];

        connections.forEach(({ from, to, weight, speed }) => {
                // Add checks for valid indices
                if (from < window.circles.length && to < window.circles.length) {
            const connection = connectionManager.createConnection(
                window.circles[from],
                window.circles[to]
            );

            if (connection) {
                const connectionData = connectionManager.connections.get(connection);
                if (connectionData) {
                    connectionData.weight = weight;
                    connectionData.speed = speed;
                            // Check if neuron exists before calling methods
                            if (window.circles[from]?.neuron) {
                    window.circles[from].neuron.updateConnectionWeight(to, weight);
                    window.circles[from].neuron.updateConnectionSpeed(to, speed);
                }
                    // Store connection for later update
                    createdConnections.push(connection);
                        }
                    }
                } else {
                    console.warn(`Invalid connection indices: from ${from}, to ${to}`);
                }
            });
            
            // Update neuron grid after setup
            if (window.updateNeuronGrid) {
                window.updateNeuronGrid();
            }

            // Force multiple updates of each connection to ensure they're properly initialized
            setTimeout(() => {
                // Extra initialization for each connection
                createdConnections.forEach(connectionGroup => {
                    connectionManager.updateConnection(connectionGroup);
                });
                
                // Reset lastSelectedPreset to avoid affecting future neuron creation
                window.lastSelectedPreset = null;
                
            }, 300);
            
        } catch (error) {
            console.error("Error setting up initial network connections:", error);
        }
    }, 100);
}

// Export this function to global scope for the UIManager start button
window.setupInitialNetwork = setupInitialNetwork;

// Resize handling is now managed by SceneManager

// Exports
window.scene = scene;
window.THREE = THREE;
window.Neuron = Neuron; // Add Neuron class to window object for global access
window.Neuron.allParticles = []; // Initialize the particles array
window.sceneManager = sceneManager; // Export sceneManager globally

// Set up global isMobile and UI-related functions for external components to use
window.isMobile = function() {
    return uiManager.isMobile();
};

window.updateSynthPanelMobileView = function() {
    // Just mark the panel with data attribute for CSS to handle positioning
    if (!window.selectedSynthFolder || !window.selectedSynthFolder.element) return;
    
    const panel = window.selectedSynthFolder.element;
    panel.dataset.synthPanel = 'true';
};

window.toggleSynthPanelMobile = function() {
    uiManager.toggleSynthPanelMobile();
};

window.hideSynthPanelOnMobile = function() {
    uiManager.hideSynthPanelOnMobile();
};

// Tweakpane draggability handled by UIManager

// SelectionRing removed as it's not needed

// Store the original window.updateNeuronGrid function as a fallback
if (window.updateNeuronGrid && !window._originalUpdateNeuronGrid) {
  window._originalUpdateNeuronGrid = window.updateNeuronGrid;
}

// Make sure stateManager is added to window for global access
window.stateManager = stateManager;
window.reactiveManager = reactiveManager;

// Start animation using SceneManager
sceneManager.startAnimation(animate);

// Add this function to force a complete refresh of the sound controls
window.refreshSoundControls = function() {
    if (window.selectedSynthFolder) {
        try {
            // Get the currently selected neuron ID from soundManager
            const selectedNeuronId = window.soundManager?.selectedNeuronId;

    
            // Re-fetch the parameters directly if we have a selected neuron
            if (selectedNeuronId && window.soundManager) {
                const params = window.soundManager.getNeuronSoundParameters(selectedNeuronId);
    
                
                if (params) {
                    // Update window.settings with the freshly retrieved parameters
                    window.settings.selectedAttack = params.envelope?.attack || params.attack;
                    window.settings.selectedDecay = params.envelope?.decay || params.decay;
                    window.settings.selectedSustain = params.envelope?.sustain || params.sustain;
                    window.settings.selectedRelease = params.envelope?.release || params.release;
                    window.settings.selectedPitchDecay = params.pitchDecay || 0.05;
                    window.settings.selectedDetune = params.detune || 0;
                    window.settings.selectedNeuronVolume = params.neuronVolume || 0;
                    window.settings.selectedNote = params.note || null;
                    window.settings.selectedOscillatorType = params.oscillator?.type || params.oscillatorType || "triangle";
                    window.settings.selectedUseSustainedTone = params.useSustainedTone ?? false;
                    window.settings.selectedFilterType = params.filter?.type || params.filterType || "lowpass";
                    window.settings.selectedFilterFrequency = params.filter?.frequency || params.filterFrequency || 5000;
                    window.settings.selectedFilterQ = params.filter?.Q || params.filterQ || 1;
                    window.settings.selectedReverbSend = params.effects?.reverbSend || params.reverbSend || 0.2;
                    window.settings.selectedDelaySend = params.effects?.delaySend || params.delaySend || 0.15;
                    window.settings.selectedTremoloFreq = params.modulation?.tremoloFreq || params.tremoloFreq || 4;
                    window.settings.selectedTremoloDepth = params.modulation?.tremoloDepth || params.tremoloDepth || 0;
                    window.settings.selectedVibratoFreq = params.modulation?.vibratoFreq || params.vibratoFreq || 5;
                    window.settings.selectedVibratoDepth = params.modulation?.vibratoDepth || params.vibratoDepth || 0;
                    
                    // Check if the parameters match any preset and highlight it if found
                    if (typeof findMatchingPreset === 'function') {
                        const matchedPreset = findMatchingPreset(params);
                        if (matchedPreset) {
                            highlightPresetButton(matchedPreset.name);
                        } else {
                            // No preset matches, unhighlight any active preset
                            unhighlightActivePreset();
                        }
                    }
                    

                }
            }
            
            // Refresh the folder first
            window.selectedSynthFolder.refresh();
            
            // Loop through and refresh each child control
            if (window.selectedSynthFolder.children) {
                window.selectedSynthFolder.children.forEach(control => {
                    if (control && control.refresh) {
                        control.refresh();
                    }
                });
    }
    
            // Force the envelope visualization to update
            if (window.forceRenderEnvelope) {
                window.forceRenderEnvelope();
            }
            
            // Update note button UI if needed
            if (window.updateActiveNoteButton && window.settings.selectedNote) {
                window.updateActiveNoteButton(window.settings.selectedNote);
            }
            

        } catch (error) {
            console.error("Error refreshing sound controls:", error);
        }
    }
};

// Add helper function to find a matching preset based on parameters
window.findMatchingPreset = function(params) {
    if (!window.defaultPresets || !params) return null;
    
    // Look through all presets to find a match
    for (const preset of window.defaultPresets) {
        // Check core parameters for a match (we use fuzzy matching with small tolerance)
        const attackMatch = Math.abs(preset.attack - (params.envelope?.attack || params.attack || 0)) < 0.01;
        const decayMatch = Math.abs(preset.decay - (params.envelope?.decay || params.decay || 0)) < 0.01;
        const sustainMatch = Math.abs(preset.sustain - (params.envelope?.sustain || params.sustain || 0)) < 0.05;
        const releaseMatch = Math.abs(preset.release - (params.envelope?.release || params.release || 0)) < 0.05;
        const oscTypeMatch = preset.oscillatorType === (params.oscillator?.type || params.oscillatorType);
        
        // If all core parameters match, we consider it a match
        if (attackMatch && decayMatch && sustainMatch && releaseMatch && oscTypeMatch) {

            return preset;
        }
    }
    
    return null;
};

// Add a helper function to stop random sounds
window.stopRandomSounds = function() {
    if (window.randomSoundsTimerId) {
        clearTimeout(window.randomSoundsTimerId);
        window.randomSoundsTimerId = null;
        
    }
};



// Import application architecture components
import { appInitializer } from './components/AppInitializer.js';
import { stateManager } from './components/StateManager.js';
import { reactiveManager } from './components/ReactiveManager.js';

// Defer initialization to ensure all components are loaded before app architecture setup
setTimeout(() => {
  try {
    // Initialize application architecture with all core components
    appInitializer.initialize({
      uiManager,
      soundManager: window.soundManager,
      workerManager: window.workerManager, // Add worker manager to app initializer
      connectionManager,
      sceneManager,
      settings: window.settings,
      circles: window.circles,
      updateNeuronGrid: window.updateNeuronGrid
    });
    // Application architecture successfully initialized
  } catch (error) {
    console.error("Error initializing application architecture:", error);
  }
}, 500);

inputManager.cleanup = function() {
    // Restore all original methods
    Object.keys(this.originalHandlers).forEach(component => {
      Object.keys(this.originalHandlers[component]).forEach(methodName => {
        component[methodName] = this.originalHandlers[component][methodName];
      });
    });
    
    // Clear all handlers
    this.handlers = {};
    this.originalHandlers = {};
    
    // Clean up event listeners
    if (window.eventManager) {
      window.eventManager.cleanupComponent('eventSystem');
    } else {
      document.removeEventListener('click', this.handleGlobalEvent.bind(this, 'click'), false);
      document.removeEventListener('dblclick', this.handleGlobalEvent.bind(this, 'dblclick'), false);
      document.removeEventListener('touchend', this.handleGlobalEvent.bind(this, 'touchend'), false);
      document.removeEventListener('touchstart', this.handleGlobalEvent.bind(this, 'touchstart'), false);
    }
}

// Add this near the bottom of main.js, after all components are initialized
// Direct fix for mouse events - ensures events are properly forwarded to InputManager
setTimeout(() => {
  // Backup original event handler and capture all dblclick events at document level
  document.addEventListener('dblclick', function(event) {
    // Stop event propagation only if it's heading to the document handler from EventSystem
    const isOnCanvas = event.target === renderer.domElement;
    
    if (isOnCanvas && inputManager && inputManager.onDoubleClickBound) {
      // If it's on the canvas, manually call InputManager's handler and prevent further propagation
      inputManager.onDoubleClickBound(event);
      event.stopPropagation();
      event.preventDefault();
    }
  }, true); // Use capture phase to intercept before EventSystem
  
  // Similar approach for wheel events
  document.addEventListener('wheel', function(event) {
    const isOnCanvas = event.target === renderer.domElement;
    
    if (isOnCanvas) {
      // Check if we're hovering over an arrow first
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      // Create a raycaster to check for arrow intersections
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      
      // Set a larger threshold for better arrow detection
      if (raycaster.params.Line) {
        raycaster.params.Line.threshold = 5;
      }
      
      // Get all arrows from the connection manager
      let isOverArrow = false;
      if (connectionManager && connectionManager.connections) {
        const arrows = Array.from(connectionManager.connections.values())
          .map(conn => conn.arrow)
          .filter(Boolean);
          
        // Check if we're intersecting any arrows
        const intersects = raycaster.intersectObjects(arrows);
        isOverArrow = intersects.length > 0;
      }
      
      // Only let InputManager handle the wheel event if we're not over an arrow
      if (!isOverArrow && inputManager && inputManager.onWheelBound) {
        inputManager.onWheelBound(event);
        event.stopPropagation();
        event.preventDefault();
      }
    }
  }, { capture: true, passive: false });
  
  console.log('Applied direct event forwarding patch to fix mouse interactions');
}, 1000); // Wait for all other initializations to complete

// Make tutorial available globally
window.startTutorial = function() {
    if (window.uiManager) {
        window.uiManager.startTutorial();
    }
};

// Create help button for tutorial access after starting
function createHelpButton() {
    const helpButton = document.createElement('button');
    helpButton.textContent = '?';
    helpButton.style.position = 'fixed';
    helpButton.style.bottom = '20px';  // Match neuron settings button position
    helpButton.style.right = '20px';
    helpButton.style.width = '30px';
    helpButton.style.height = '30px';
    
    helpButton.style.backgroundColor = 'rgba(85, 85, 85, 0.7)';  // Grey color
    helpButton.style.color = 'white';
    helpButton.style.border = 'none';
    helpButton.style.fontSize = '16px';
    helpButton.style.fontWeight = 'bold';
    helpButton.style.cursor = 'pointer';
    helpButton.style.zIndex = '1000';
    helpButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    helpButton.style.display = 'flex';
    helpButton.style.alignItems = 'center';
    helpButton.style.justifyContent = 'center';
    helpButton.title = 'Tutorial';
    
    // Add hover effect
    helpButton.addEventListener('mouseenter', () => {
        helpButton.style.backgroundColor = 'rgba(102, 102, 102, 0.9)';  // Lighter grey on hover
        helpButton.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
    });
    
    helpButton.addEventListener('mouseleave', () => {
        helpButton.style.backgroundColor = 'rgba(85, 85, 85, 0.7)';  // Back to original grey
        helpButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    });
    
    helpButton.addEventListener('click', () => {
        window.startTutorial();
    });
    
    document.body.appendChild(helpButton);
}

// Create help button
createHelpButton();

// Continue with any other initialization code
// ... existing code ...