import * as Tone from 'tone';

/**
 * OptimizedSoundManager class
 * Provides an optimized sound engine for SNN visualization with up to 100 neurons
 * Uses a bus-based architecture with voice allocation to maximize performance
 */
export class OptimizedSoundManager {
    constructor(scene, camera, renderer) {
        // Core references
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        
        // Initialize audio context
        this.ensureAudioContext();
        
        // Global settings
        this.volume = -6;
        this.volumeNormalization = 1.0; // Add volume normalization factor
        this.baseFrequency = 440;
        
        // Add spatial audio settings
        this.spatialAudioEnabled = false;
        this.spatialAudioPanners = new Map(); // Store panners by neuron ID
        this.spatialAudioNodes = new Map(); // Store all nodes for cleanup
        
        // Data structures for neuron sound parameters
        this.neuronSoundOverrides = new Map();
        this.neuronFrequencies = new Map();
        this.neuronBusAssignments = new Map();
        
        // Keep track of the last selected neuron's parameters to apply to new neurons
        this.lastSelectedNeuronParams = null;
        
        // Voice management
        this.activeVoices = new Set();
        this.maxVoices = 48;  // Increased from 24 to 48 maximum concurrent voices
        this.voiceTimeout = 1000; // Reduced from 2000ms to 1000ms - voice considered active for 1s
        this.voicePriorities = new Map(); // Neuron ID to priority score
        this.lastPlayTime = 0;
        this.minTimeBetweenNotes = 15; // Increased from 5ms to 15ms for more consistent timing
        this.neuronLastPlayTime = new Map(); // Track last play time per neuron for rhythm consistency
        
        // Add tracking for polyphony management
        this.lastPlayedNotes = [];
        
        // Added tracking for recent sound types to detect potential clipping scenarios
        this.recentSoundTypes = {
            bass: { lastPlayed: 0, isPlaying: false },
            hihat: { lastPlayed: 0, isPlaying: false }
        };
        
        // Add performance monitoring statistics
        this.stats = {
            totalOscillators: 0,
            activeOscillators: 0,
            oscillatorsCreated: 0,
            oscillatorsDisposed: 0,
            lastStatsTime: Date.now(),
            peakOscillatorCount: 0
        };
        
        // Selection state
        this.selectedNeuronId = null;
        this.playPreviewSounds = false;
        
        // Musical parameters
        this.melodicPattern = [0, 2, 4, 7, 9, 12, 11, 9, 7, 4, 2, 0];
        this.currentPatternIndex = 0;
        this.lastFreqIndex = 0;
        this.melodyDirection = 1;
        
        // Frequency ranges organized by bus type
        this.frequencyRanges = {
            low: ['C2', 'D2', 'E2', 'G2', 'A2', 'C3'],
            mid: ['C3', 'D3', 'E3', 'G3', 'A3', 'C4'],
            high: ['C4', 'D4', 'E4', 'G4', 'A4', 'C5'],
            veryHigh: ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'], // High range
            ultra: ['C6', 'D6', 'E6', 'G6', 'A6'] // Highest range
        };
        
        // Last used audio time for scheduling (prevents errors)
        this.lastAudioTime = 0;
        
        // Initialize bus structure and audio chain
        this.initializeAudioBuses();
        
        // Available types for UI controls
        this.oscillatorTypes = [
            "sine", "triangle", "sawtooth", "square", 
            "sine3", "triangle3", "sawtooth3", "square3", "noise"
        ];
        
        this.envelopeCurves = [
            "linear", "exponential", "sine", "cosine", "bounce", "ripple", "step"
        ];
        
        this.filterTypes = [
            "lowpass", "highpass", "bandpass", "notch", "lowshelf", "highshelf", "allpass"
        ];
        
        // Initialize analyzer
        this.waveformAnalyzer = new Tone.Analyser("waveform", 1024);
        Tone.Destination.connect(this.waveformAnalyzer);

        // Initialize oscillator bank with lazy loading
        this.oscillatorBank = new Map();
        this.pendingOscillators = new Map(); // Track oscillators scheduled for creation
        this._cleanupScheduled = false;
        this.initializeOscillatorBank();
    }
    
    // Modified method to initialize the oscillator bank with lazy loading
    initializeOscillatorBank() {
        console.log("%c[OSCILLATOR BANK] Initializing optimized oscillator bank with lazy loading", "color: #00ff00; font-weight: bold;");
        
        // Only pre-create a small subset of common oscillators
        const commonNotes = ['C3', 'E3', 'G3', 'C4']; // Most common notes
        const commonTypes = ["sine", "triangle"]; // Most common types
        
        // Convert notes to frequencies
        const commonFrequencies = commonNotes.map(note => Tone.Frequency(note).toFrequency());
        
        // Setup all type maps first
        this.oscillatorTypes.forEach(type => {
            this.oscillatorBank.set(type, new Map());
        });
        
        // Create only common oscillators upfront
        commonTypes.forEach(type => {
            commonFrequencies.forEach(freq => {
                this._createOscillator(type, freq);
            });
        });
        
        console.log(`%c[OSCILLATOR BANK] Created initial bank with ${commonTypes.length} types × ${commonFrequencies.length} frequencies = ${commonTypes.length * commonFrequencies.length} oscillators`, "color: #00ff00; font-weight: bold;");
        console.log("%c[OSCILLATOR BANK] Lazy oscillator creation ENABLED", "color: #00ff00; font-weight: bold; font-size: 14px;");
        
        // Schedule periodic cleanup
        setInterval(() => this.cleanupUnusedOscillators(), 60000); // Cleanup once per minute
        this._cleanupScheduled = true;
    }
    
    // New method to create oscillator on demand
    _getOrCreateOscillator(type, freq) {
        // Check if it exists
        if (this.oscillatorBank.has(type) && this.oscillatorBank.get(type).has(freq)) {
            const oscData = this.oscillatorBank.get(type).get(freq);
            oscData.lastUsed = Date.now(); // Update usage timestamp
            return oscData;
        }
        
        // If not, create it
        return this._createOscillator(type, freq);
    }
    
    // New helper method to create oscillator
    _createOscillator(type, freq) {
        // Ensure type map exists
        if (!this.oscillatorBank.has(type)) {
            this.oscillatorBank.set(type, new Map());
        }
        
        // Create oscillator
        let osc;
        if (type === 'noise') {
            osc = new Tone.Noise('white');
            osc.start();
        } else {
            osc = new Tone.Oscillator({
                frequency: freq,
                type: type
            }).start();
        }
        
        // Create gain node (starts at 0 - silent)
        const gain = new Tone.Gain(0);
        
        // Connect oscillator -> gain
        osc.connect(gain);
        
        // Store in the bank with last used timestamp
        const oscData = {
            oscillator: osc,
            gain: gain,
            activeNeurons: new Set(),
            lastUsed: Date.now()
        };
        
        // Update stats
        this.stats.oscillatorsCreated++;
        this.stats.totalOscillators++;
        this.stats.peakOscillatorCount = Math.max(this.stats.peakOscillatorCount, this.stats.totalOscillators);
        
        this.oscillatorBank.get(type).set(freq, oscData);
        return oscData;
    }
    
    // New method to clean up unused oscillators
    cleanupUnusedOscillators() {
        const now = Date.now();
        const unusedThreshold = 30000; // 30 seconds
        let cleanupCount = 0;
        let total = 0;
        
        // Iterate through all oscillator types
        for (const [type, freqMap] of this.oscillatorBank.entries()) {
            total += freqMap.size;
            
            // Check each frequency
            for (const [freq, oscData] of freqMap.entries()) {
                // Skip oscillators that are in use or recently used
                if (oscData.activeNeurons.size > 0 || now - oscData.lastUsed < unusedThreshold) {
                    continue;
                }
                
                // Dispose unused oscillator
                if (oscData.oscillator) {
                    try {
                        oscData.oscillator.stop();
                        oscData.oscillator.dispose();
                    } catch (e) {
                        console.warn(`Error disposing oscillator: ${e}`);
                    }
                }
                
                if (oscData.gain) {
                    try {
                        oscData.gain.dispose();
                    } catch (e) {
                        console.warn(`Error disposing gain: ${e}`);
                    }
                }
                
                // Remove from map
                freqMap.delete(freq);
                cleanupCount++;
                
                // Update stats
                this.stats.oscillatorsDisposed++;
                this.stats.totalOscillators--;
            }
        }
        
        if (cleanupCount > 0) {
            console.log(`Cleaned up ${cleanupCount} unused oscillators, keeping ${total - cleanupCount}/${total}`);
        }
    }
    
    // Create a simplified stereo panner with ILD and ITD effects (no high-shelf filters)
    createSimplePanner(pan = 0) {
        // Create channel splitting/merging for stereo processing
        const splitter = new Tone.Split(2);
        const merger = new Tone.Merge();
        
        // Create gain nodes for left and right channels (for ILD - Interaural Level Difference)
        const leftGain = new Tone.Gain(1);
        const rightGain = new Tone.Gain(1);
        
        // Create delay nodes for left and right channels (for ITD - Interaural Time Difference)
        const leftDelay = new Tone.Delay(0);
        const rightDelay = new Tone.Delay(0);
        
        // Create input/output for chaining
        const input = new Tone.Gain(1);
        const output = new Tone.Gain(1);
        
        // Connect the processing chain
        input.connect(splitter);
        
        // Left channel processing chain (simplified)
        splitter.connect(leftDelay, 0);
        leftDelay.connect(leftGain);
        leftGain.connect(merger, 0, 0);  // Connect to left output
        
        // Right channel processing chain (simplified)
        splitter.connect(rightDelay, 1);
        rightDelay.connect(rightGain);
        rightGain.connect(merger, 0, 1);  // Connect to right output
        
        // Connect to output
        merger.connect(output);
        
        // Store all nodes for cleanup
        const allNodes = [
            input, output, splitter, merger,
            leftGain, rightGain, leftDelay, rightDelay
        ];
        
        // Set initial position
        const updatePanPosition = (panValue) => {
            // Clamp to valid range (-1 to 1)
            const pan = Math.max(-1, Math.min(1, panValue));
            
            // Convert pan (-1 to 1) to azimuth angle in radians
            // pan -1 = 90° left, pan 0 = center, pan 1 = 90° right
            const azimuth = pan * (Math.PI / 2);  // Scale to ±90° (±π/2 radians)
            
            // Set gain values with more conservative range (0.6-1.0) to prevent clipping
            // These values ensure the overall volume doesn't increase significantly
            leftGain.gain.value = 0.6 + 0.4 * Math.max(0, -pan);   // Louder when pan is negative (left)
            rightGain.gain.value = 0.6 + 0.4 * Math.max(0, pan);   // Louder when pan is positive (right)
            
            // Apply subtle delay cues (ITD - Interaural Time Difference)
            // Using a smaller max delay to prevent phasing issues
            const maxDelay = 0.0004;  // 0.4ms maximum delay
            
            // Set delay times based on pan position
            leftDelay.delayTime.value = Math.max(0, maxDelay * pan);      // Delay left when pan is positive (right)
            rightDelay.delayTime.value = Math.max(0, -maxDelay * pan);    // Delay right when pan is negative (left)
            
            console.log(`Simplified panner set to ${pan.toFixed(2)}`);
        };
        
        // Set initial position
        updatePanPosition(pan);
        
        return {
            input,
            output,
            // Method to update panning position
            updatePosition: (newPan) => {
                updatePanPosition(newPan);
            },
            // Method for cleanup
            dispose: () => {
                allNodes.forEach(node => {
                    if (node && typeof node.dispose === 'function') {
                        node.dispose();
                    }
                });
            },
            allNodes
        };
    }
    
    // Calculate spatial position for a neuron based on its 3D position
    calculateSpatialPosition(neuronId) {
        // Default to center if neuron doesn't exist
        if (!window.circles) {
            return 0; // Center (pan = 0)
        }
        
        // Find the neuron in the circles array
        const neuron = Array.from(window.circles).find(circle => 
            circle && circle.neuron && circle.neuron.id === neuronId
        );
        
        if (!neuron) {
            return 0; // Center if neuron not found
        }
        
        // Get the neuron's position
        const neuronPos = neuron.position;
        
        // Get the camera position
        const cameraPos = this.camera.position;
        
        // Calculate the position relative to camera on X axis (left/right)
        // This creates a direct mapping from spatial position to stereo field
        const relativeX = neuronPos.x - cameraPos.x;
        
        // Normalize to -1 to 1 range with a scaling factor to prevent extreme panning
        // Scale by 0.5 to make the panning more moderate (adjust as needed)
        const scaleFactor = 0.8;
        const normalizedPan = Math.max(-1, Math.min(1, relativeX * scaleFactor));
        
        console.log(`Neuron ${neuronId} spatial position: pan = ${normalizedPan.toFixed(2)}`);
        return normalizedPan;
    }npm
    
    // Enable or disable spatial audio
    setSpatialAudio(enabled) {
        // Skip if status isn't changing
        if (this.spatialAudioEnabled === enabled) return;
        
        console.log(`${enabled ? 'Enabling' : 'Disabling'} spatial audio`);
        this.spatialAudioEnabled = enabled;
        
        if (enabled) {
            // Create spatial panners for all existing audio buses if needed
            Object.values(this.buses).forEach(bus => {
                // Skip if this bus already has a panner
                if (bus.spatialPanner) return;
                
                // Create simple panner with center position
                bus.spatialPanner = this.createSimplePanner(0);
                
                // Store for cleanup
                this.spatialAudioNodes.set(bus.id, bus.spatialPanner);
                
                // Insert panner in the signal chain
                if (!bus.gain) {
                    console.warn(`No gain node for bus ${bus.id}, skipping panner setup`);
                    return;
                }
                
                try {
                    // Disconnect gain from the previous destination
                    const originalDestination = bus.originalDestination || this.finalMixer || Tone.Destination;
                    bus.gain.disconnect();
                    
                    // Connect through the panner
                    bus.gain.connect(bus.spatialPanner.input);
                    bus.spatialPanner.output.connect(originalDestination);
                    
                    // Store original destination for later reconnection
                    bus.originalDestination = originalDestination;
                    
                    console.log(`Successfully connected spatial panner for bus ${bus.id}`);
                } catch (error) {
                    console.error(`Error setting up panner for bus ${bus.id}:`, error);
                }
            });
            
            // Force update any currently playing neurons
            if (window.circles) {
                window.circles.forEach(circle => {
                    if (circle && circle.neuron) {
                        const neuronId = circle.neuron.id;
                        this.updateNeuronSpatialPosition(neuronId);
                    }
                });
            }
        } else {
            // Disconnect panners and restore original connections
            Object.values(this.buses).forEach(bus => {
                if (bus.spatialPanner) {
                    try {
                        // Disconnect from the signal chain
                        bus.gain.disconnect();
                        
                        // Reconnect directly to original destination
                        const originalDestination = bus.originalDestination || this.finalMixer || Tone.Destination;
                        bus.gain.connect(originalDestination);
                        
                        // Dispose panner
                        bus.spatialPanner.dispose();
                        bus.spatialPanner = null;
                    } catch (error) {
                        console.error(`Error disconnecting panner for bus ${bus.id}:`, error);
                    }
                }
            });
            
            // Cleanup all stored nodes
            this.spatialAudioNodes.forEach(panner => {
                if (panner && typeof panner.dispose === 'function') {
                    panner.dispose();
                }
            });
            this.spatialAudioNodes.clear();
            this.spatialAudioPanners.clear();
        }
    }
    
    // Update spatial position for a neuron's audio
    updateNeuronSpatialPosition(neuronId) {
        // Skip if spatial audio is disabled
        if (!this.spatialAudioEnabled) return;
        
        // Calculate the spatial position (pan value)
        const pan = this.calculateSpatialPosition(neuronId);
        
        // Get the bus for this neuron
        const busId = this.neuronBusAssignments.get(neuronId);
        if (!busId || !this.buses[busId] || !this.buses[busId].spatialPanner) {
            return;
        }
        
        try {
            // Update the panner position
            this.buses[busId].spatialPanner.updatePosition(pan);
            
            // Store this position for future reference
            this.spatialAudioPanners.set(neuronId, pan);
        } catch (error) {
            console.error(`Error updating spatial position for neuron ${neuronId}:`, error);
        }
    }

    // New method to log performance statistics
    logPerformanceStats() {
        console.log(
            `%c[OSCILLATOR STATS] Total: ${this.stats.totalOscillators} | ` +
            `Active: ${this.stats.activeOscillators} | ` + 
            `Created: ${this.stats.oscillatorsCreated} | ` +
            `Disposed: ${this.stats.oscillatorsDisposed} | ` +
            `Peak: ${this.stats.peakOscillatorCount}`,
            "color: #00cc00; background: #111; padding: 3px; border-radius: 2px;"
        );
        
        // Calculate memory savings
        const originalApproach = this.oscillatorTypes.length * 30; // Approx frequencies in original approach
        const currentCount = this.stats.totalOscillators;
        const savedOscillators = originalApproach - currentCount;
        const savingsPercent = Math.round((savedOscillators / originalApproach) * 100);
        
        if (savingsPercent > 0) {
            console.log(
                `%c[OPTIMIZATION] Using ${currentCount} oscillators instead of ~${originalApproach} (${savingsPercent}% reduction)`,
                "color: #00ffaa; background: #111; padding: 3px; border-radius: 2px;"
            );
        }
    }
    
    // Add method to monitor active oscillator creation/usage in realtime
    startPerformanceMonitoring(intervalMs = 30000) {
        if (this._perfMonitoringInterval) {
            clearInterval(this._perfMonitoringInterval);
        }
        
        this._perfMonitoringInterval = setInterval(() => {
            this.logPerformanceStats();
        }, intervalMs);
        
        console.log(`%c[OSCILLATOR BANK] Performance monitoring started (${intervalMs/1000}s interval)`, "color: #00cc00;");
        return this;
    }
    
    // Method to get oscillator usage statistics for UI display
    getOscillatorStats() {
        return { ...this.stats }; // Return a copy of stats
    }
    
    // Modified method to get closest frequency with quantization
    getClosestFrequency(targetFreq) {
        // Implement frequency quantization - round to nearest semitone
        // This reduces the total number of oscillators needed
        const semitone = Math.round(12 * Math.log2(targetFreq/440)) + 49; // A4 = 49
        const quantizedFreq = 440 * Math.pow(2, (semitone - 49) / 12);
        
        return quantizedFreq;
    }
    
    // Ensures audio context is running
    ensureAudioContext() {
        // Start Tone.js context if needed
        if (Tone.context.state !== "running") {
            Tone.start().then(() => {
                console.log("Audio context started successfully");
                Tone.Transport.start();
            }).catch(e => {
                console.warn("Error starting audio context:", e);
            });
        }
    }
    
    /**
     * Initialize the optimized audio bus architecture
     * Creates a multi-bus system with different effects chains for different neuron groups
     */
    initializeAudioBuses() {
        console.log("Initializing audio buses with compression and limiter for improved sound quality");
        
        try {
            // Create master limiter (final stage before output)
            this.masterLimiter = new Tone.Limiter(-2.0); // Changed from -0.5 to -2.0 for more headroom
            this.masterLimiter.toDestination();
            
            // Create master compressor that feeds into the limiter
            this.masterCompressor = new Tone.Compressor({
                threshold: -22, // Changed from -28 to -22 for less aggressive compression
                ratio: 4,       // Changed from 6 to 4 for more natural compression
                attack: 0.005,  // Slightly increased from 0.003 to 0.005
                release: 0.15,  // Increased from 0.1 to 0.15 to prevent pumping with bass
                knee: 12        // Kept the same knee value for smooth compression
            });
            this.masterCompressor.connect(this.masterLimiter);
            
            // Create final mixer that feeds into the master compressor
            this.finalMixer = new Tone.Gain(0.92); // Reduced from 1.0 to 0.92 (slight overall reduction)
            this.finalMixer.connect(this.masterCompressor);
            
            // Create splitter to separate signals
            this.splitter = new Tone.Split(2);
            
            // Connect to finalMixer
            this.splitter.connect(this.finalMixer, 0);
            
            // Create hi-hat path components
            this.hiHatFilter = new Tone.Filter({
                type: "highpass",
                frequency: 3800, // Increased from 2800 to 3800 for better separation from bass
                rolloff: -24,
                Q: 0.7 // Reduced from 0.8 to 0.7 for smoother response
            });
            
            this.hiHatCompressor = new Tone.Compressor({
                threshold: -20, // Changed from -22 to -20 (less aggressive)
                ratio: 4,       // Changed from 6 to 4 (less aggressive)
                attack: 0.001,  // Kept ultra-fast attack for transients
                release: 0.08,  // Increased from 0.05 to 0.08
                knee: 8         // Increased from 6 to 8 for smoother compression
            });
            
            // Connect hi-hat parallel path with blending
            this.splitter.connect(this.hiHatFilter, 1);
            
            // Create a splitter for hi-hat path to create parallel processing
            this.hiHatSplitter = new Tone.Split(2);
            this.hiHatFilter.connect(this.hiHatSplitter);
            
            // Mix control to blend compressed hi-hat with main signal
            this.hiHatWet = new Tone.Gain(0.5); // Changed from 0.6 to 0.5 (50% wet)
            this.hiHatDry = new Tone.Gain(0.5); // Changed from 0.4 to 0.5 (50% dry)
            
            // Process one path through the compressor (wet)
            this.hiHatSplitter.connect(this.hiHatCompressor, 0);
            this.hiHatCompressor.connect(this.hiHatWet);
            this.hiHatWet.connect(this.finalMixer);
            
            // Send the other path directly (dry)
            this.hiHatSplitter.connect(this.hiHatDry, 1);
            this.hiHatDry.connect(this.finalMixer);
            
            // Define helper function to detect hi-hat-like sounds
            this.isHiHatSound = (params) => {
                return params && 
                      (params.filterType === "highpass" && params.filterFrequency > 2000) ||
                      (params.name && params.name.toLowerCase().includes("hi-hat")) ||
                      (params.oscillatorType === "triangle" && params.decay < 0.15 && params.sustain === 0) ||
                      (params.oscillatorType === "noise");
            };
            
            // Now create the buses for regular audio routing
            this.buses = {};

            // Create buses for different frequency ranges and types - use try/catch for each
            try {
            this.buses.low = this.createAudioBus('low', {
                eq: {
                    low: 0,
                    mid: -3,
                    high: -6
                },
                reverb: {
                    decay: 2.0,
                    wet: 0.15
                },
                delay: {
                    delayTime: 0.25,
                    feedback: 0.2,
                    wet: 0.1
                }
            });
            } catch (e) {
                console.error(`Failed to create low bus:`, e);
                // Create minimal fallback bus
                this.buses.low = {
                    id: 'low',
                    gain: new Tone.Gain(1).toDestination()
                };
            }

            try {
            this.buses.mid = this.createAudioBus('mid', {
                eq: {
                    low: -3,
                    mid: 0,
                    high: -3
                },
                reverb: {
                    decay: 1.5,
                    wet: 0.12
                },
                delay: {
                    delayTime: 0.2,
                    feedback: 0.15,
                    wet: 0.08
                }
            });
            } catch (e) {
                console.error(`Failed to create mid bus:`, e);
                // Create minimal fallback bus
                this.buses.mid = {
                    id: 'mid',
                    gain: new Tone.Gain(1).toDestination()
                };
            }

            try {
            this.buses.high = this.createAudioBus('high', {
                eq: {
                    low: -6,
                    mid: -3,
                    high: 0
                },
                reverb: {
                    decay: 1.0,
                    wet: 0.1
                },
                delay: {
                    delayTime: 0.15,
                    feedback: 0.1,
                    wet: 0.06
                }
            });
            } catch (e) {
                console.error(`Failed to create high bus:`, e);
                // Create minimal fallback bus
                this.buses.high = {
                    id: 'high',
                    gain: new Tone.Gain(1).toDestination()
                };
            }

            try {
            this.buses.highPerc = this.createAudioBus('highPerc', {
                eq: {
                    low: -2,
                    mid: 0,
                    high: +2
                },
                reverb: {
                    decay: 1.2,
                    wet: 0.18
                },
                delay: {
                    delayTime: 0.18,
                    feedback: 0.25,
                    wet: 0.15
                }
            });
            } catch (e) {
                console.error(`Failed to create highPerc bus:`, e);
                // Create minimal fallback bus
                this.buses.highPerc = {
                    id: 'highPerc',
                    gain: new Tone.Gain(1).toDestination()
                };
            }
            
            // Create specialized bus for hi-hat sounds
            try {
            this.buses.hiHat = this.createAudioBus('hiHat', {
                eq: {
                    low: -12, // Changed from -10 to -12 (stronger low cut for hi-hats)
                    mid: -2,  // Changed from -3 to -2 (slightly less mid reduction)
                    high: +2  // Changed from +3 to +2 (slightly less high boosting)
                },
                filterType: 'highpass',
                filterFrequency: 1200, // Changed from 800 to 1200 for cleaner separation from bass
                reverb: {
                    decay: 0.8,
                    wet: 0.1  // Reduced from 0.12 to 0.1 (less reverb to avoid buildup)
                },
                delay: {
                    delayTime: 0.08,
                    feedback: 0.05,
                    wet: 0.04 // Reduced from 0.06 to 0.04 (less delay to avoid buildup)
                },
                useParallelCompression: true
                });
            } catch (e) {
                console.error(`Failed to create hiHat bus:`, e);
                // Create minimal fallback bus
                this.buses.hiHat = {
                    id: 'hiHat',
                    gain: new Tone.Gain(1).toDestination()
                };
            }
            
            // Create specialized bus for organ and sustained sounds
            try {
                this.buses.organ = this.createAudioBus('organ', {
                    eq: {
                        low: -2,     // Slightly reduce low end to prevent muddiness
                        mid: +2,     // Boost mids for pipe organ character
                        high: +1     // Slight high boost for harmonics
                    },
                    filterType: 'lowpass',
                    filterFrequency: 3500, // Let harmonics through but control harshness
                    filterQ: 0.7,    // Low resonance for smooth sound
                    reverb: {
                        decay: 3.0,  // Long decay for church-like space
                        wet: 0.35    // More reverb for realistic church organ sound
                    },
                    delay: {
                        delayTime: 0.15,
                        feedback: 0.1,
                        wet: 0.05    // Minimal delay for clarity
                    },
                    compression: {   // Special compression settings for organ
                        threshold: -20,
                        ratio: 2.5,
                        attack: 0.03,
                        release: 0.3,
                        knee: 10
                    },
                    useOrganism: true // Flag to use specialized organ processing
                });
            } catch (e) {
                console.error(`Failed to create organ bus:`, e);
                // Create minimal fallback bus
                this.buses.organ = {
                    id: 'organ',
                    gain: new Tone.Gain(1).toDestination()
                };
            }
            
            // Make sure all buses have at least the minimal required components
            Object.keys(this.buses).forEach(busId => {
                const bus = this.buses[busId];
                
                // Add minimal components if missing
                if (!bus.filter) {
                    bus.filter = new Tone.Filter(1000, "allpass").connect(bus.gain || Tone.Destination);
                }
                
                if (!bus.eq) {
                    bus.eq = new Tone.EQ3(0, 0, 0).connect(bus.filter);
                }
            });
        
        // Create synths for each bus
        this.synths = {};
        this.createSynthsForBuses();
        } catch (error) {
            console.error(`Error initializing audio buses:`, error);
            
            // Create at least one minimal working bus as fallback
            if (!this.buses || Object.keys(this.buses).length === 0) {
                this.buses = {
                    fallback: {
                        id: 'fallback',
                        gain: new Tone.Gain(1).toDestination(),
                        filter: new Tone.Filter(1000, "allpass").toDestination(),
                        eq: new Tone.EQ3(0, 0, 0).toDestination()
                    }
                };
                
                // Connect minimal fallback chain
                try {
                    this.buses.fallback.eq.connect(this.buses.fallback.filter);
                    this.buses.fallback.filter.connect(this.buses.fallback.gain);
                } catch (e) {
                    console.error("Failed to connect fallback bus:", e);
                }
                
                console.warn("Created emergency fallback audio bus");
            }
            
            // Create at least one synth
            this.synths = {};
            this.createSynthsForBuses();
        }
    }
    
    /**
     * Create an audio processing bus with specific characteristics
     * @param {string} id - Bus identifier
     * @param {object} options - Bus configuration options
     * @returns {object} Bus with effects chain
     */
    createAudioBus(id, options = {}) {
        console.log(`Creating audio bus: ${id} with options:`, options);
        
        // Initialize bus components with error handling
        try {
        const bus = {
            id: id,
                eq: new Tone.EQ3(
                    options.eq?.low || 0,
                    options.eq?.mid || 0,
                    options.eq?.high || 0
                ),
            filter: new Tone.Filter({
                    type: options.filterType || "allpass",
                    frequency: options.filterFrequency || 1000,
                    rolloff: -12,
                    Q: options.filterQ || 1
                }),
                gain: new Tone.Gain(1)
            };
            
            // Create reverb with pre-generated impulse
            bus.reverb = new Tone.Reverb({
                decay: options.reverb?.decay || 1.5,
                wet: options.reverb?.wet || 0.2,
                preDelay: 0.01
            });
            
            // Use immediate value for wet parameter instead of the object setter
            if (bus.reverb && bus.reverb.wet) {
                bus.reverb.wet.value = options.reverb?.wet || 0.2;
            }
            
            try {
                // Generate impulse response but don't wait
                bus.reverb.generate();
            } catch (err) {
                console.warn(`Error generating reverb impulse for bus ${id}:`, err);
            }
            
            // Create delay with safer connection
            bus.delay = new Tone.FeedbackDelay({
                delayTime: options.delay?.delayTime || 0.2,
                feedback: options.delay?.feedback || 0.2,
                wet: options.delay?.wet || 0.15,
                maxDelay: 1
            });
            
            // Set wet value directly to avoid connection issues
            if (bus.delay && bus.delay.wet) {
                bus.delay.wet.value = options.delay?.wet || 0.15;
            }
            
            // Add compression for certain buses (like organ)
            if (options.compression) {
                bus.compressor = new Tone.Compressor({
                    threshold: options.compression.threshold || -20,
                    ratio: options.compression.ratio || 3,
                    attack: options.compression.attack || 0.02,
                    release: options.compression.release || 0.3,
                    knee: options.compression.knee || 10
                });
                console.log(`Added compressor to bus ${id}`);
            }
            
            // Add soft saturation for warmth (especially for organ sounds)
            if (options.useOrganism) {
                bus.saturation = new Tone.Distortion({
                    distortion: 0.08, // Very subtle distortion for warmth
                    wet: 0.3         // Blend with clean signal
                });
                
                // Add chorusing for organ sound movement
                bus.chorus = new Tone.Chorus({
                    frequency: 0.6,  // Slow movement
                    delayTime: 4,    // Slight depth
                    depth: 0.3,      // Moderate depth
                    type: "sine",
                    spread: 40,      // Stereo spread
                    wet: 0.15        // Subtle effect
                });
                
                // Start the chorus LFO (safe even without audio running)
                try {
                    bus.chorus.start();
                } catch (err) {
                    console.warn(`Error starting chorus for bus ${id}:`, err);
                }
                
                console.log(`Added organ-specific processing to bus ${id}`);
            }
            
            // Connect effects chain with verification at each step and error handling for each connection
            try {
                if (options.useOrganism && bus.saturation && bus.chorus) {
                    // Specialized organ chain with safer connections
                    // filter -> saturation -> eq -> compressor -> chorus -> delay -> reverb -> gain
                    try { bus.filter.connect(bus.saturation); } catch (e) { console.warn("Connection error 1:", e); }
                    
                    try { bus.saturation.connect(bus.eq); } catch (e) { console.warn("Connection error 2:", e); }
                    
                    if (bus.compressor) {
                        try { bus.eq.connect(bus.compressor); } catch (e) { console.warn("Connection error 3:", e); }
                        try { bus.compressor.connect(bus.chorus); } catch (e) { console.warn("Connection error 4:", e); }
                    } else {
                        try { bus.eq.connect(bus.chorus); } catch (e) { console.warn("Connection error 5:", e); }
                    }
                    
                    try { bus.chorus.connect(bus.delay); } catch (e) { console.warn("Connection error 6:", e); }
                    
                    console.log(`Connected specialized organ chain for bus ${id}`);
                } else {
                    // Standard chain with safer connections
                    // filter -> eq -> compressor -> delay -> reverb -> gain
                    try { bus.filter.connect(bus.eq); } catch (e) { console.warn("Connection error 7:", e); }
                    
                    if (bus.compressor) {
                        try { bus.eq.connect(bus.compressor); } catch (e) { console.warn("Connection error 8:", e); }
                        try { bus.compressor.connect(bus.delay); } catch (e) { console.warn("Connection error 9:", e); }
                    } else {
                        try { bus.eq.connect(bus.delay); } catch (e) { console.warn("Connection error 10:", e); }
                    }
                    
                    console.log(`Connected standard chain for bus ${id}`);
                }
                
                // Connect final stages of the chain with individual error handling
                try { 
        bus.delay.connect(bus.reverb);
            console.log(`Connected delay to reverb for bus ${id}`);
                } catch (e) { 
                    console.warn("Error connecting delay to reverb:", e);
                    // Try direct connection to gain on failure
                    try { bus.delay.connect(bus.gain); } catch (err) { 
                        console.warn("Fallback connection failed:", err);
                    }
                }
                
                try { 
        bus.reverb.connect(bus.gain);
            console.log(`Connected reverb to gain for bus ${id}`);
                } catch (e) { 
                    console.warn("Error connecting reverb to gain:", e); 
                }
            
            // Direct connection to output chain
            if (options.useParallelCompression) {
                console.log(`Using parallel compression for ${id} bus`);
                if (!this.hiHatFilter) {
                        console.warn(`hiHatFilter not available for bus ${id}, connecting to main output`);
                        try { bus.gain.connect(this.finalMixer || Tone.Destination); } catch (e) { 
                            console.warn("Error connecting to finalMixer:", e); 
                            // Last resort fallback
                            try { bus.gain.toDestination(); } catch (err) { console.error("Emergency connection failed:", err); }
                        }
                } else {
                        try { 
                    bus.gain.connect(this.hiHatFilter);
                    console.log(`Connected ${id} bus to hiHatFilter for parallel processing`);
                        } catch (e) { 
                            console.warn("Error connecting to hiHatFilter:", e);
                            // Fallback to main mixer on error 
                            try { bus.gain.connect(this.finalMixer || Tone.Destination); } catch (err) { 
                                console.warn("Fallback connection failed:", err); 
                                // Last resort
                                try { bus.gain.toDestination(); } catch (lastErr) { console.error("Emergency connection failed:", lastErr); }
                            }
                        }
                }
            } else {
                // Safer direct connection to main mixer
                console.log(`Using standard routing for ${id} bus`);
                    try {
                        bus.gain.connect(this.finalMixer || Tone.Destination);
                console.log(`Connected ${id} bus gain directly to finalMixer`);
                    } catch (e) {
                        console.warn("Error connecting to finalMixer:", e);
                        // Last resort fallback
                        try { 
                            bus.gain.toDestination(); 
                            console.log("Emergency connection to destination successful");
                        } catch (err) { 
                            console.error("Emergency connection failed:", err);
                        }
                    }
                }
            } catch (connectionError) {
                console.error(`Error in connecting audio nodes for bus ${id}:`, connectionError);
                
                // Emergency direct connections to ensure something works
                try {
                    bus.filter.toDestination();
                    console.log("Emergency direct connection established");
                } catch (e) {
                    console.error("Failed all connection attempts:", e);
                }
            }
        
        return bus;
        } catch (error) {
            console.error(`Error creating audio bus ${id}:`, error);
            
            // Fallback minimal bus to avoid crashes
            const fallbackBus = {
                id: id,
                eq: new Tone.EQ3(0, 0, 0),
                gain: new Tone.Gain(1)
            };
            
            // Direct connection to output
            try {
            fallbackBus.eq.connect(fallbackBus.gain);
            fallbackBus.gain.connect(this.finalMixer || Tone.Destination);
            } catch (e) {
                console.error("Failed to connect fallback bus:", e);
                try {
                    fallbackBus.eq.toDestination();
                } catch (err) {
                    console.error("Failed all fallback connection attempts:", err);
                }
            }
            
            console.log(`Created fallback bus for ${id} due to error`);
            return fallbackBus;
        }
    }
    
    /**
     * Create synths for each audio bus
     */
    createSynthsForBuses() {
        // Create synths for each bus
        console.log("Creating synths for audio buses with error handling...");
        
        try {
            this.synths = {};
            
            // Make sure we have at least one fallback synth
            const fallbackOutputNode = this.finalMixer || Tone.Destination;
            this.synths['defaultTone'] = new Tone.PolySynth(Tone.Synth, {
                maxPolyphony: 8,
                oscillator: {
                    type: "triangle"
                },
                envelope: {
                    attack: 0.002,
                    decay: 0.3,
                    sustain: 0.2,
                    release: 0.8
                },
                volume: this.volume || -6
            }).toDestination();
            
            // Process each bus
        Object.keys(this.buses).forEach(busId => {
                try {
            const bus = this.buses[busId];
                    
                    // Skip if bus is invalid
                    if (!bus || !bus.id) {
                        console.warn(`Skipping invalid bus: ${busId}`);
                        return;
                    }
                    
                    // Determine destination node for the synth
                    let destinationNode;
                    if (bus.filter && typeof bus.filter.input !== 'undefined') {
                        destinationNode = bus.filter;
                    } else if (bus.eq && typeof bus.eq.input !== 'undefined') {
                        destinationNode = bus.eq;
                    } else if (bus.gain && typeof bus.gain.input !== 'undefined') {
                        destinationNode = bus.gain;
                    } else {
                        destinationNode = fallbackOutputNode;
                        console.warn(`Using fallback output for ${busId} synths`);
                    }
                    
                    const isHighQuality = bus.highQuality || false;
            const polyphony = isHighQuality ? 16 : 8; // Increased polyphony for all synths (was 8:4)
                    
                    console.log(`Creating synths for bus ${busId} with destination:`, destinationNode);
            
            // Use different synth configurations based on bus type
                    if (busId === 'organ') {
                        try {
                            // Create specialized organ synth with layered harmonics
                            this.synths[busId + "Tone"] = new Tone.PolySynth(Tone.Synth, {
                                maxPolyphony: 24, // Increased from 12 to 24 to prevent "Max polyphony exceeded" errors
                                oscillator: {
                                    type: "sine" // Pure sine for fundamental tone
                                },
                                envelope: {
                                    attack: 0.1,     // Slow attack for pipe organ swell
                                    decay: 0.4,      // Moderate decay
                                    sustain: 0.8,    // High sustain for organ-like tone
                                    release: 2.5,    // Long release for natural decay
                                    attackCurve: "linear" // Linear attack for more natural swell
                                },
                                volume: this.volume - 4 // Lower volume to allow for layering
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Tone"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Tone"} to bus, using fallback:`, e);
                                this.synths[busId + "Tone"].toDestination();
                            }
                            
                            // Create second organ synth for harmonics (octave up)
                            this.synths[busId + "OctaveUp"] = new Tone.PolySynth(Tone.Synth, {
                                maxPolyphony: 24, // Increased from 12 to 24 to prevent "Max polyphony exceeded" errors
                                oscillator: {
                                    type: "sine"
                                },
                                envelope: {
                                    attack: 0.15,    // Slightly slower attack
                                    decay: 0.3,
                                    sustain: 0.7,    // Slightly lower sustain
                                    release: 2.2,    
                                    attackCurve: "linear"
                                },
                                volume: this.volume - 10 // Much quieter for proper harmonic mix
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "OctaveUp"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "OctaveUp"} to bus, using fallback:`, e);
                                this.synths[busId + "OctaveUp"].toDestination();
                            }
                            
                            // Create third organ synth for sub-harmonic (fifth)
                            this.synths[busId + "Fifth"] = new Tone.PolySynth(Tone.Synth, {
                                maxPolyphony: 24, // Increased from 12 to 24 to prevent "Max polyphony exceeded" errors
                                oscillator: {
                                    type: "sine"
                                },
                                envelope: {
                                    attack: 0.12,
                                    decay: 0.35,
                                    sustain: 0.75,
                                    release: 2.3,
                                    attackCurve: "linear"
                                },
                                volume: this.volume - 12 // Even quieter
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Fifth"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Fifth"} to bus, using fallback:`, e);
                                this.synths[busId + "Fifth"].toDestination();
                            }
                            
                            // Create subtle noise component for air/breath sound
                            this.synths[busId + "Air"] = new Tone.Noise({
                                type: "pink",
                                volume: this.volume - 24 // Very quiet, just for air movement
                            });
                            
                            // Don't connect the air noise yet - it gets connected dynamically when used
                            try {
                                this.synths[busId + "Air"].start();
                            } catch (e) {
                                console.warn(`Failed to start ${busId + "Air"} noise:`, e);
                            }
                            
                            console.log(`Created specialized organ synths for ${busId} bus`);
                        } catch (e) {
                            console.error(`Failed to create organ synths for ${busId}:`, e);
                        }
                    } else if (busId.includes("Perc")) {
                        try {
                // Percussion synths
                this.synths[busId + "Membrane"] = new Tone.MembraneSynth({
                    pitchDecay: 0.05,
                    octaves: 2,
                    envelope: {
                        attack: 0.002,
                        decay: 0.3,
                        sustain: 0.2,
                        release: 0.8,
                        attackCurve: "exponential"
                    },
                    volume: this.volume
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Membrane"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Membrane"} to bus, using fallback:`, e);
                                this.synths[busId + "Membrane"].toDestination();
                            }
                
                this.synths[busId + "Tone"] = new Tone.PolySynth(Tone.Synth, {
                    maxPolyphony: polyphony,
                    oscillator: {
                        type: "sine",
                        partials: [1, 0.3, 0.1]
                    },
                    envelope: {
                        attack: 0.002,
                        decay: 0.3,
                        sustain: 0.2,
                        release: 0.8
                    },
                    volume: this.volume - 5
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Tone"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Tone"} to bus, using fallback:`, e);
                                this.synths[busId + "Tone"].toDestination();
                            }
                        } catch (e) {
                            console.error(`Failed to create percussion synths for ${busId}:`, e);
                        }
            } else {
                        try {
                // Tonal synths
                this.synths[busId + "Tone"] = new Tone.PolySynth(Tone.Synth, {
                    maxPolyphony: polyphony,
                    oscillator: {
                        type: "triangle",
                        count: isHighQuality ? 3 : 2,
                        spread: isHighQuality ? 10 : 5
                    },
                    envelope: {
                        attack: 0.002,
                        decay: 0.3,
                        sustain: 0.2,
                        release: 0.8
                    },
                    volume: this.volume
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Tone"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Tone"} to bus, using fallback:`, e);
                                this.synths[busId + "Tone"].toDestination();
                            }
                
                this.synths[busId + "Sustain"] = new Tone.PolySynth(Tone.Synth, {
                    maxPolyphony: Math.max(4, Math.floor(polyphony / 2)), // Increased from 2 to 4 minimum
                    oscillator: {
                        type: "sine",
                        partials: [1, 0.5, 0.2]
                    },
                    envelope: {
                        attack: 0.4,
                        decay: 0.8,
                        sustain: 0.8,
                        release: 2.0
                    },
                    volume: this.volume - 8
                            });
                            
                            // Connect to destination node safely
                            try {
                                this.synths[busId + "Sustain"].connect(destinationNode);
                            } catch (e) {
                                console.warn(`Failed to connect ${busId + "Sustain"} to bus, using fallback:`, e);
                                this.synths[busId + "Sustain"].toDestination();
                            }
                        } catch (e) {
                            console.error(`Failed to create tonal synths for ${busId}:`, e);
                        }
                    }
                } catch (busError) {
                    console.error(`Error processing bus ${busId}:`, busError);
                }
            });
            
            console.log(`Created synths for ${Object.keys(this.buses).length} buses`);
        } catch (error) {
            console.error(`Error initializing synths:`, error);
            
            // Create emergency fallback synth if something goes wrong
            if (!this.synths || Object.keys(this.synths).length === 0) {
                console.warn("Creating emergency fallback synth");
                this.synths = {
                    'emergencyTone': new Tone.PolySynth(Tone.Synth, {
                        maxPolyphony: 8,
                        volume: -10
                    }).toDestination()
                };
            }
        }
    }
    
    /**
     * Get the best bus for a neuron based on its characteristics
     * @param {number} neuronId - Neuron ID
     * @param {boolean} isSelected - Whether the neuron is currently selected
     * @param {boolean} hasDC - Whether the neuron has DC input
     * @param {object} params - Neuron sound parameters
     * @returns {string} Bus ID
     */
    getBusForNeuron(neuronId, isSelected, hasDC, params = {}) {
        // Check if this sound matches hi-hat characteristics - route to special processing
        const isHiHatSound = this.isHiHatSound(params);
        
        // Add detection for organ sounds
        const isOrganSound = this.isOrganSound(params);
        
        // Always use high-quality bus for DC input, selected neurons, or hi-hat sounds
        if (hasDC || isSelected) {
            // If it's an organ sound and selected, use organ bus for better sound
            if (isOrganSound) {
                console.log(`Routing selected organ sound for neuron ${neuronId} through organ bus`);
                return this.buses.organ;
            }
            return this.buses.highPerc;
        }
        
        // Use organ bus for organ-like sounds
        if (isOrganSound) {
            console.log(`Routing organ sound for neuron ${neuronId} through specialized organ bus`);
            return this.buses.organ;
        }
        
        // Use hi-hat bus for hi-hat sounds to go through the parallel compression path
        if (isHiHatSound) {
            console.log(`Routing hi-hat sound for neuron ${neuronId} through special hi-hat bus`);
            return this.buses.hiHat; // This will connect to the parallel processing path
        }

        // Use appropriate bus based on neuron ID
        const busIndex = neuronId % 3; // Simple round-robin approach for bus distribution
        
        switch (busIndex) {
            case 0:
                return this.buses.low;
            case 1:
                return this.buses.mid;
            case 2:
                return this.buses.high;
            default:
                return this.buses.mid;
        }
    }
    
    /**
     * Detect if a sound has organ-like characteristics
     * @param {object} params - Sound parameters
     * @returns {boolean} True if sound has organ-like characteristics
     */
    isOrganSound(params) {
        if (!params) return false;
        
        // Check if the preset name contains organ but NOT synth lead
        if (params.name) {
            // Only consider actual organ sounds as organs, not synth leads
            if (params.name.toLowerCase().includes('organ')) {
                return true;
            }
            // Explicitly avoid treating synth lead as an organ sound
            if (params.name.toLowerCase().includes('synth lead')) {
                return false;
            }
        }
        
        // Check for organ-like parameter combinations
        const hasOrganEnvelope = params.attack > 0.05 && params.sustain > 0.7 && params.release > 1.5;
        const hasOrganOscillator = params.oscillatorType === 'sine';
        const useSustainedTone = params.useSustainedTone === true;
        
        // If it has organ-like envelope and either uses sine wave or sustained tone, consider it an organ
        return hasOrganEnvelope && (hasOrganOscillator || useSustainedTone);
    }
    
    /**
     * Helper method to detect if a sound has hi-hat characteristics
     */
    isHiHatSound(params) {
        if (!params) return false;
        
        // Check multiple characteristics that indicate a hi-hat sound
        return (params.name && params.name.toLowerCase().includes('hi-hat')) ||
               (params.filterType === 'highpass' && params.filterFrequency > 2000) ||
               (params.oscillatorType === 'noise') || // Added detection for noise oscillator
               (params.oscillatorType === 'triangle' && params.decay < 0.15 && params.sustain === 0);
    }
    
    /**
     * Creates a realistic hi-hat sound using noise rather than oscillators
     * @param {number} velocity - Volume of the hi-hat (0-1)
     * @param {object} params - Sound parameters
     * @param {string} busId - Bus ID to use for the sound
     * @param {number} duration - Duration of the sound
     * @returns {void}
     */
    createNoisyHiHat(velocity, params, busId, duration) {
        try {
            // Get appropriate bus for hi-hat
            const bus = this.buses[busId] || this.buses.hiHat || this.buses.highPerc;
            if (!bus) return;
            
            // Create a noise source for the hi-hat
            const noise = new Tone.Noise({
                type: "white", // White noise for sharpness
                volume: -12 // Changed from -10 to -12 (start even quieter)
            }).start();
            
            // Create a bandpass filter to shape the noise into hi-hat sound
            const filter = new Tone.Filter({
                type: "bandpass",
                frequency: params.filterFrequency || 8000, // Very high frequency for hi-hats
                Q: params.filterQ || 1
            });
            
            // Add a high-pass filter to remove low frequencies
            const highpass = new Tone.Filter({
                type: "highpass",
                frequency: 7000, // Changed from 6000 to 7000 (cut even more lows)
                rolloff: -48 // Steeper rolloff
            });
            
            // Create mid-scoop EQ to prevent interference with bass frequencies
            const midScoopEQ = new Tone.Filter({
                type: "notch", // Add notch filter to create a mid-scoop
                frequency: 500, // Center frequency in the mid-bass range
                Q: 1.2,       // Wider Q for broader cut
                gain: -12     // Deep cut to ensure no bass interference
            });
            
            // Add a resonant peak for metallic character
            const peakEQ = new Tone.Filter({
                type: "peaking",
                frequency: 9000, // Metallic resonance
                Q: 2,
                gain: 5 // Changed from 6 to 5 (slightly less boost)
            });
            
            // Envelope for the hi-hat
            const envelope = new Tone.AmplitudeEnvelope({
                attack: params.attack || 0.001, // Ultra-fast attack
                decay: params.decay || 0.08,    // Short decay
                sustain: 0,                     // No sustain for hi-hats
                release: params.release || 0.05, // Very short release
            });
            
            // Connect the enhanced chain with mid-scoop
            noise.connect(filter);
            filter.connect(highpass);
            highpass.connect(midScoopEQ);       // Add midScoopEQ to the chain
            midScoopEQ.connect(peakEQ);         // Connect to peakEQ
            peakEQ.connect(envelope);
            
            // Connect to destination
            envelope.connect(bus.filter || bus.gain || Tone.Destination);
            
            // Get current time
            const now = Tone.now();
            
            // Set velocity-dependent volume
            envelope.attackCurve = "exponential";
            envelope.releaseCurve = "exponential";
            noise.volume.value = -17 + (velocity * 14); // Changed from -15 + (velocity * 15) to -17 + (velocity * 14)
            
            // Trigger the envelope
            envelope.triggerAttackRelease(duration, now);
            
            // Clean up after sound is done
            setTimeout(() => {
                noise.stop();
                noise.dispose();
                filter.dispose();
                highpass.dispose();
                midScoopEQ.dispose();           // Dispose of the new filter
                peakEQ.dispose();
                envelope.dispose();
            }, (duration * 1000) + 200);
            
            return true;
        } catch (error) {
            console.error("Error creating hi-hat sound:", error);
            return false;
        }
    }
    
    /**
     * Determines if a neuron is allowed to play sound
     * @param {number} neuronId - Neuron ID
     * @param {boolean} hasDC - Whether the neuron has DC input
     * @param {boolean} isIsolated - Whether the neuron is isolated
     * @returns {boolean} Whether the neuron can play
     */
    canPlaySound(neuronId, hasDC, isIsolated) {
        // Always allow selected neuron to play
        if (neuronId === this.selectedNeuronId) {
            return true;
        }
        
        // If preview mode is active, only allow selected neuron to play
        if (this.playPreviewSounds && this.selectedNeuronId !== null) {
            return false;
        }
        
        // Check if we're already at the maximum number of voices
        if (this.activeVoices.size >= this.maxVoices) {
            // Calculate priority (0-100)
            const priority = this.calculateNeuronPriority(neuronId, hasDC, isIsolated);
            
            // Lower priority threshold from 70 to 50 to allow more neurons to play
            return priority >= 50;
        }
        
        return true;
    }
    
    /**
     * Calculate neuron priority for voice allocation
     * @param {number} neuronId - Neuron ID
     * @param {boolean} hasDC - Whether the neuron has DC input
     * @param {boolean} isIsolated - Whether the neuron is isolated
     * @returns {number} Priority value (0-100)
     */
    calculateNeuronPriority(neuronId, hasDC, isIsolated) {
        let priority = 50; // Default priority
        
        // DC input neurons are more important - but slightly less boost
        if (hasDC) {
            priority += 25; // Reduced from 30 to 25
        }
        
        // Isolated neurons are less important - but not as penalized
        if (isIsolated) {
            priority -= 15; // Reduced penalty from 20 to 15
        }
        
        // Neurons that have just played are less important to avoid repetition
        if (this.activeVoices.has(neuronId)) {
            priority -= 20; // Reduced penalty from 30 to 20
        }
        
        // Clamp priority to 0-100 range
        return Math.max(0, Math.min(100, priority));
    }
    
    /**
     * Track active voice in the voice allocation system
     * @param {number} neuronId - Neuron ID
     */
    trackActiveVoice(neuronId) {
        // Add neuron to active voices
        this.activeVoices.add(neuronId);
        
        // Remove after timeout - using the adjusted voiceTimeout of 1000ms
        setTimeout(() => {
            this.activeVoices.delete(neuronId);
        }, this.voiceTimeout);
    }
    
    /**
     * Play sound when a neuron fires
     * @param {number} weight - Connection weight (0-1)
     * @param {number} speed - Connection speed (0-1)
     * @param {number} neuronId - Neuron ID
     * @param {boolean} isIsolated - Whether the neuron is isolated
     * @param {boolean} hasDC - Whether the neuron has DC input
     * @param {number} distance - Distance to target neuron
     */
    playNeuronFiring(weight = 0.5, speed = 0.5, neuronId, isIsolated = false, hasDC = false, distance = 0) {
        // Update spatial position if spatial audio is enabled
        if (this.spatialAudioEnabled && neuronId) {
            this.updateNeuronSpatialPosition(neuronId);
        }
        
        // Check if we can play a sound for this neuron (voice management)
        if (!this.canPlaySound(neuronId, hasDC, isIsolated)) {
            return false;
        }
        
        // Check audio context
        if (!Tone.context || Tone.context.state !== 'running') {
            console.warn("Audio context not running, can't play sound");
            return;
        }
        
        try {
            // Get current time for timing calculations
            const currentTime = performance.now();
        
            // Check global minimum time between sounds first
            const timeSinceLastPlay = currentTime - this.lastPlayTime;
            if (timeSinceLastPlay < this.minTimeBetweenNotes) {
                return;
            }
            
            // Check neuron-specific timing for consistency (especially important for DC neurons)
            if (hasDC && neuronId) {
                const neuronTimeSinceLastPlay = currentTime - (this.neuronLastPlayTime.get(neuronId) || 0);
                
                // For DC neurons, enforce a minimum time between firings to prevent double-firing
                // This is crucial for rhythm consistency
                const minNeuronPlayInterval = hasDC ? 50 : 25; // 50ms minimum between sounds from same DC neuron
                
                if (neuronTimeSinceLastPlay < minNeuronPlayInterval) {
                    console.log(`Skipping too-frequent sound for neuron ${neuronId} (${neuronTimeSinceLastPlay.toFixed(1)}ms)`);
                    return;
                }
                
                // Update neuron-specific last play time
                this.neuronLastPlayTime.set(neuronId, currentTime);
            }
            
            // Update global last play time
            this.lastPlayTime = currentTime;
        
            // Get neuron parameters
            const params = this.getNeuronSynthParams(neuronId);
            if (!params) {
                console.error(`No parameters found for neuron ${neuronId}`);
                return;
            }
        
            // Check if volume is at minimum - if so, completely silence this neuron
            if (params.neuronVolume !== undefined && params.neuronVolume <= -12) {
                // Simply return without playing any sound to completely silence the neuron
                console.log(`Neuron ${neuronId} is muted (volume at minimum)`);
                return;
            }
            
            // Check if this is a hi-hat sound
            const isHiHatSound = this.isHiHatSound(params);
        
            // Check if this is an organ-type sound
            const isOrganSound = this.isOrganSound(params);
        
            // Check if this is a bass sound
            const isBassSound = params && 
                (params.name && params.name.toLowerCase().includes('bass')) || 
                (params.filterType === 'lowpass' && params.filterFrequency < 400);
        
            // Track sound type activity for dynamic processing
            if (isHiHatSound) {
                this.recentSoundTypes.hihat.lastPlayed = performance.now();
            }
            if (isBassSound) {
                this.recentSoundTypes.bass.lastPlayed = performance.now();
            }
            // Update sound type tracking
            this.trackSoundTypeActivity();
        
            // Get appropriate bus for this neuron
            const bus = this.getBusForNeuron(neuronId, neuronId === this.selectedNeuronId, hasDC, params);
            if (!bus) {
                console.error(`No bus found for neuron ${neuronId}`);
                return;
            }
        
            const busId = bus.id;
            
            // Store bus assignment for spatial audio
            this.neuronBusAssignments.set(neuronId, busId);
            
            // Track voice
            this.trackActiveVoice(neuronId);
            
            // Apply sound parameters to bus
            this.applyNeuronParametersToBus(neuronId, bus, params);
            
            // Get frequency data
            let noteFreq = params.note; // Already set in params
            
            // Adjust based on weight and neuron volume
            let velocity = Math.min(0.9, Math.max(0.3, weight * 0.8));
            
            // Apply instrument-specific volume adjustments for better bass/hi-hat balance
            if (isBassSound) {
                // Reduce bass velocity slightly to prevent clipping when mixed with hi-hats
                velocity *= 0.75; // Additional 25% reduction for bass sounds
            }
            
            if (isHiHatSound) {
                // Further reduce hi-hat volume for better balance
                velocity *= 0.85; // Additional 15% reduction for hi-hat sounds
            }
            
            // Apply neuron volume with extra attenuation for low volumes
            if (params.neuronVolume !== undefined) {
                // Check if this is a sustained sound
                const isSustainedSound = params.useSustainedTone || (params.sustain > 0.5) || 
                                        params.name?.toLowerCase().includes('pad') || 
                                        params.name?.toLowerCase().includes('organ') || 
                                        params.name?.toLowerCase().includes('synth');
                
                // Check specifically for pad sounds which need more aggressive attenuation
                const isPadSound = params.name?.toLowerCase().includes('pad');
                
                // Calculate base volume factor using a smoother curve for all sounds
                // Use a consistent logarithmic curve with a slight bend for more natural feeling
                let volumeFactor;
                
                if (params.neuronVolume >= 0) {
                    // For positive values, use standard dB conversion
                    volumeFactor = Math.pow(10, params.neuronVolume / 20);
                } else {
                    // For negative values, use a smooth exponential curve
                    // This creates a natural-feeling taper without special thresholds at -10dB
                    const curve = 1 - Math.min(1, Math.abs(params.neuronVolume) / 12);
                    volumeFactor = Math.pow(10, params.neuronVolume / 20) * (0.3 + 0.7 * curve);
                }
                
                // Apply the volume factor
                velocity *= volumeFactor;
                
                // Apply consistent reductions for sustained sounds and pads
                // Apply reduction for pad sounds regardless of volume level
                if (isPadSound) {
                    // The volumeScaling parameter in the preset will handle most of the pad reduction
                    velocity *= 0.7; // 30% reduction for all pad sounds
                }
                
                // Apply less aggressive reduction for sustained sounds
                if (isSustainedSound && !isPadSound) { // Don't double-apply for pads
                    velocity *= 0.8; // 20% reduction for all sustained sounds
                }
                
                // Final safety check - use a more gradual curve that starts fading earlier
                if (params.neuronVolume <= -9) {
                    // Create a smooth fade from -9 to -12 (instead of sharp cutoff at -11)
                    const fadeOutFactor = Math.max(0, (params.neuronVolume + 12) / 3); // Linear fade over 3dB
                    velocity *= fadeOutFactor;
                }
            }
            
            // Apply volume normalization
            velocity *= this.volumeNormalization;
            
            // Apply instrument-specific volume scaling if defined
            if (params.volumeScaling !== undefined) {
                velocity *= params.volumeScaling;
            }
            
            // Get oscillator type for our optimized oscillator bank
            const oscillatorType = params.oscillator?.type || params.oscillatorType || 'triangle';
            
            // Get quantized frequency using our improved method
            const quantizedFreq = this.getClosestFrequency(noteFreq);
            
            // Get or create the oscillator (lazy initialization)
            const oscData = this._getOrCreateOscillator(oscillatorType, quantizedFreq);
            
            // Track this neuron with the oscillator
            oscData.activeNeurons.add(neuronId);
            
            // Schedule cleanup after the sound should be done
            setTimeout(() => {
                oscData.activeNeurons.delete(neuronId);
            }, 2000); // After sound should be done
            
            // Get envelope parameters
            const attack = params.envelope?.attack || params.attack || 0.002;
            const decay = params.envelope?.decay || params.decay || 0.3;
            const sustain = params.envelope?.sustain || params.sustain || 0.2;
            const release = params.envelope?.release || params.release || 0.8;
            
            // Calculate note duration based on envelope and speed
            const noteDuration = Math.max(0.1, attack + decay + (sustain > 0.01 ? release * 0.8 : 0));
            
            // Schedule the audio (with slight delay to avoid scheduling errors)
            const now = Tone.now();
            const noteTime = now + 0.01;
            
            // For hi-hat sounds, use the specialized noise-based hi-hat
            if (isHiHatSound) {
                // Use our noisy hi-hat generator for more realistic hi-hats
                const success = this.createNoisyHiHat(velocity, params, busId, noteDuration);
                if (success) {
                    return; // Exit early if hi-hat was successfully created
                }
                // Otherwise fall back to standard synth
            }
            
            // Determine which synth to use based on bus and parameters
            let synthToUse = null;
            
            if (isOrganSound && busId === 'organ') {
                // Handle organ sound (layered synths)
                const baseSynth = this.synths[busId + 'Tone'];
                const octaveSynth = this.synths[busId + 'OctaveUp'];
                const fifthSynth = this.synths[busId + 'Fifth'];
                const airSynth = this.synths[busId + 'Air'];
                
                if (baseSynth && octaveSynth && fifthSynth) {
                    // Check and manage polyphony before playing new notes
                    this.managePolyphonyOverflow(baseSynth);
                    this.managePolyphonyOverflow(octaveSynth);
                    this.managePolyphonyOverflow(fifthSynth);
                    
                    // Calculate harmonic frequencies
                    const octaveFreq = quantizedFreq * 2; // One octave up
                    const fifthFreq = quantizedFreq * 1.5; // Perfect fifth
                    
                    // Use slightly different velocities for harmonics to add complexity
                    const octaveVelocity = velocity * 0.6; // Quieter octave
                    const fifthVelocity = velocity * 0.4; // Even quieter fifth
                    
                    // Handle potential "Max polyphony exceeded" errors - prioritize base notes
                    try {
                        // First, monitor the active voices count to detect potential polyphony issues
                        const organActiveVoices = Object.values(this.synths)
                            .filter(synth => synth && synth._activeVoices && synth._activeVoices.size)
                            .reduce((total, synth) => total + synth._activeVoices.size, 0);
                        
                        // If we're approaching polyphony limits, prioritize base notes and drop some harmonics
                        const isApproachingLimit = organActiveVoices > 15; // Getting close to our limit
                        
                        // Base note - always play this with highest priority
                        baseSynth.triggerAttackRelease(quantizedFreq, noteDuration, noteTime, velocity);
                        
                        // Octave up - play only if we're not at risk of exceeding polyphony
                        if (!isApproachingLimit) {
                            octaveSynth.triggerAttackRelease(octaveFreq, noteDuration * 0.9, noteTime + 0.02, octaveVelocity);
                        }
                        
                        // Fifth - lowest priority, play only if we have plenty of polyphony available
                        if (organActiveVoices < 12) {
                            fifthSynth.triggerAttackRelease(fifthFreq, noteDuration * 0.85, noteTime + 0.03, fifthVelocity);
                        }
                    } catch (err) {
                        // Fallback in case of any errors - just play the base note
                        console.warn(`Organ harmonics error, falling back to base note: ${err.message}`);
                        try {
                            baseSynth.triggerAttackRelease(quantizedFreq, noteDuration, noteTime, velocity);
                        } catch (baseErr) {
                            console.error(`Failed to play even base organ note: ${baseErr.message}`);
                        }
                    }
                    
                    // Add air noise for realism if available
                    if (airSynth) {
                        // Create a gain envelope for the noise
                        const airGain = new Tone.Gain(0).connect(bus.filter);
                        airSynth.connect(airGain);
                        
                        // Schedule envelope for the air noise
                        airGain.gain.cancelScheduledValues(noteTime);
                        airGain.gain.setValueAtTime(0, noteTime);
                        airGain.gain.linearRampToValueAtTime(0.02 * velocity, noteTime + attack * 0.5);
                        airGain.gain.linearRampToValueAtTime(0.01 * velocity, noteTime + attack + decay);
                        airGain.gain.linearRampToValueAtTime(0, noteTime + noteDuration);
                        
                        // Clean up gain node after use
                        setTimeout(() => {
                            airGain.dispose();
                        }, (noteDuration + 0.1) * 1000);
                    }
                    
                    console.log(`Played layered organ sound for neuron ${neuronId} - base: ${quantizedFreq.toFixed(1)}Hz, octave: ${octaveFreq.toFixed(1)}Hz, fifth: ${fifthFreq.toFixed(1)}Hz`);
                } else {
                    // Fallback to standard synth if organ synths not available
                    synthToUse = this.synths[busId + 'Tone'] || this.synths['midTone'];
                    if (synthToUse) {
                        // Manage polyphony for this synth too
                        this.managePolyphonyOverflow(synthToUse);
                        synthToUse.triggerAttackRelease(quantizedFreq, noteDuration, noteTime, velocity);
                    } else {
                        console.error(`No synth available for neuron ${neuronId}`);
                    }
                }
            } else {
                // Use membrane synth for percussion sounds
                if (params.useMembrane || (attack < 0.01 && decay < 0.1 && sustain < 0.1)) {
                    synthToUse = this.synths[busId + 'Membrane'] || this.synths['midMembrane'] || this.synths[busId + 'Tone'];
                } 
                // Use sustain synth for sustained sounds
                else if (params.useSustainedTone || sustain > 0.5) {
                    synthToUse = this.synths[busId + 'Sustain'] || this.synths['midSustain'] || this.synths[busId + 'Tone'];
                } 
                // Default to tone synth
                else {
                    synthToUse = this.synths[busId + 'Tone'] || this.synths['midTone'];
                }
                
                // Play the sound if synth is available
                if (synthToUse) {
                    // Manage polyphony before playing
                    this.managePolyphonyOverflow(synthToUse);
                    synthToUse.triggerAttackRelease(quantizedFreq, noteDuration, noteTime, velocity);
                } else {
                    console.error(`No synth available for neuron ${neuronId}`);
                }
            }
        } catch (error) {
            console.error(`Error playing neuron firing sound:`, error);
        }
    }
    
    /**
     * Configure membrane synth parameters
     */
    setMembraneSynthParams(synth, params, hardness, speed, baseVolume) {
        // Make membrane synths more responsive to volume changes
        let adjustedVolume = baseVolume;
        
        // Apply gradual reduction as volume decreases without hard thresholds
        const reductionAmount = Math.max(0, Math.min(8, Math.abs(baseVolume) / 1.5));
        adjustedVolume -= reductionAmount;
        
        synth.set({
            pitchDecay: (params.pitchDecay || 0.05) * (1 + (1-speed)), // More pitch decay for slower hits
            oscillator: {
                type: params.oscillator?.type || 'triangle'
            },
            envelope: {
                attack: params.envelope?.attack || 0.002,
                decay: (params.envelope?.decay || 0.3) * hardness, // Harder hits decay faster
                sustain: Math.min(1, Math.max(0, params.envelope?.sustain || 0.2)),
                release: params.envelope?.release || 0.8,
                attackCurve: params.envelope?.attackCurve || 'exponential'
            },
            volume: adjustedVolume // Modified volume
        });
    }
    
    /**
     * Configure tonal synth parameters
     */
    setTonalSynthParams(synth, params, hardness, baseVolume) {
        // Calculate volume adjustment using a smooth curve
        let adjustedVolume = baseVolume;
        
        // Apply a gradual reduction based on volume without hard thresholds
        const reductionAmount = Math.max(0, Math.min(6, Math.abs(baseVolume) / 2));
        adjustedVolume -= reductionAmount;
        
        // Check if this is a Synth Lead sound specifically
        const isSynthLead = params.name?.toLowerCase().includes('synth lead');
        
        // Apply instrument-specific adjustments
        if (isSynthLead) {
            // Use a smaller baseline reduction for Synth Lead (-3 instead of -5)
            adjustedVolume -= 3;
        } else {
            // Standard reduction for other instruments
            adjustedVolume -= 5;
        }
        
        synth.set({
            detune: params.detune || 0,
            oscillator: {
                type: params.oscillator?.type || 'sine'
            },
            envelope: {
                attack: params.envelope?.attack || 0.002,
                decay: (params.envelope?.decay || 0.3) * (1 + (1-hardness)*0.5), // Softer hits decay slower
                sustain: Math.min(1, Math.max(0, params.envelope?.sustain || 0.2)),
                release: params.envelope?.release || 0.8,
                attackCurve: params.envelope?.attackCurve || 'exponential',
                decayCurve: params.envelope?.decayCurve || 'exponential',
                releaseCurve: params.envelope?.releaseCurve || 'exponential'
            },
            volume: adjustedVolume // Now uses the instrument-specific adjusted volume
        });
    }
    
    /**
     * Configure sustain synth parameters
     */
    setSustainSynthParams(synth, params, baseVolume) {
        // Calculate adjusted volume with a moderate, consistent reduction
        let adjustedVolume = baseVolume - 6; // Changed from -8 to -6 for less aggressive base reduction
        
        // Check if this is specifically a pad sound
        const isPadSound = params.name?.toLowerCase().includes('pad');
        
        // Apply a small additional reduction for pad sounds (instead of volume-dependent reductions)
        if (isPadSound) {
            adjustedVolume -= 2; // Consistent -2dB reduction for pad sounds
        }
        
        synth.set({
            oscillator: {
                type: params.oscillator?.type || 'sine'
            },
            envelope: {
                attack: (params.envelope?.attack || 0.002) * 2,     // Slower attack for pad sound
                decay: (params.envelope?.decay || 0.3) * 2,       // Longer decay
                sustain: Math.min(1, Math.max(0, (params.envelope?.sustain || 0.2) * 1.2)),
                release: (params.envelope?.release || 0.8) * 2.5  // Much longer release
            },
            volume: adjustedVolume // Use the adjusted volume with moderate attenuation
        });
    }
    
    /**
     * Apply neuron parameters to a bus's effects
     */
    applyNeuronParametersToBus(neuronId, bus, params) {
        // Only apply parameters if not in the middle of a sound
        if (this.activeVoices.has(neuronId)) {
            return;
        }
        
        // Safety check for bus
        if (!bus || !bus.eq) {
            console.warn('Cannot apply parameters to bus - invalid bus or missing components');
            return;
        }
        
        let now = Tone.now();
        if (now <= this.lastAudioTime) {
            now = this.lastAudioTime + 0.01;
        }
        this.lastAudioTime = now;
        
        try {
        // Apply filter parameters (with smoothing)
            if (params.filter || (params.filterType && params.filterFrequency)) {
                // Get filter parameters from either nested object or top-level properties
                const filterType = params.filter?.type || params.filterType || "lowpass";
                const filterFreq = params.filter?.frequency || params.filterFrequency || 5000;
                const filterQ = params.filter?.q || params.filterQ || 1;
                
                // Update filter
                bus.filter.type = filterType;
                bus.filter.frequency.cancelScheduledValues(now);
                bus.filter.frequency.setValueAtTime(bus.filter.frequency.value, now);
                bus.filter.frequency.linearRampToValueAtTime(filterFreq, now + 0.05);
            
                bus.filter.Q.cancelScheduledValues(now);
                bus.filter.Q.setValueAtTime(bus.filter.Q.value, now);
                bus.filter.Q.linearRampToValueAtTime(filterQ, now + 0.05);
            }
            
            // Apply EQ (if provided)
            if (params.eq && bus.eq) {
                bus.eq.low.value = params.eq.low || 0;
                bus.eq.mid.value = params.eq.mid || 0;
                bus.eq.high.value = params.eq.high || 0;
            }
            
            // Apply effect sends (with smoothing)
            if (params.effects || (params.reverbSend !== undefined || params.delaySend !== undefined)) {
                // Get effect parameters from either nested object or top-level properties
                const reverbSend = params.effects?.reverbSend ?? params.reverbSend ?? 0.2;
                const delaySend = params.effects?.delaySend ?? params.delaySend ?? 0.15;
                
                // Update reverb send
                if (bus.reverb && bus.reverb.wet) {
                    bus.reverb.wet.cancelScheduledValues(now);
                    bus.reverb.wet.setValueAtTime(bus.reverb.wet.value, now);
                    bus.reverb.wet.linearRampToValueAtTime(reverbSend, now + 0.05);
                }
                
                // Update delay send
                if (bus.delay && bus.delay.wet) {
                    bus.delay.wet.cancelScheduledValues(now);
                    bus.delay.wet.setValueAtTime(bus.delay.wet.value, now);
                    bus.delay.wet.linearRampToValueAtTime(delaySend, now + 0.05);
                }
            }
            
            // Apply modulation parameters (with smoothing)
            if (params.modulation || 
                (params.tremoloFreq !== undefined || params.tremoloDepth !== undefined || 
                 params.vibratoFreq !== undefined || params.vibratoDepth !== undefined)) {
                
                // Get modulation parameters from either nested object or top-level properties
                const tremoloFreq = params.modulation?.tremoloFreq ?? params.tremoloFreq ?? 4;
                const tremoloDepth = params.modulation?.tremoloDepth ?? params.tremoloDepth ?? 0;
                const vibratoFreq = params.modulation?.vibratoFreq ?? params.vibratoFreq ?? 5;
                const vibratoDepth = params.modulation?.vibratoDepth ?? params.vibratoDepth ?? 0;
                
                // Update tremolo
                if (bus.tremolo) {
                    bus.tremolo.frequency.value = tremoloFreq;
                    bus.tremolo.depth.value = tremoloDepth;
                    bus.tremolo.wet.value = tremoloDepth > 0 ? 1 : 0;
                }
                
                // Update vibrato
                if (bus.vibrato) {
                    bus.vibrato.frequency.value = vibratoFreq;
                    bus.vibrato.depth.value = vibratoDepth;
                    bus.vibrato.wet.value = vibratoDepth > 0 ? 1 : 0;
                }
            }
        } catch (err) {
            console.error('Error applying parameters to bus:', err);
        }
    }
    
    /**
     * Assign a frequency range to a neuron
     */
    assignFrequencyRange(neuronId) {
        // Special handling for the first neuron (ID 1)
        if (neuronId === 1) {
            // Use F2 note for the bass
            const bassNote = 'F2'; // Changed from C2 to F2
            const baseFreq = Tone.Frequency(bassNote).toFrequency();
            
            // Store frequency information
            this.neuronFrequencies.set(neuronId, {
                range: 'low',
                freqIndex: 0,
                baseFreq: baseFreq,
                customFreq: null
            });

            console.log(`%c[OSCILLATOR BANK] Assigned ${bassNote} (${baseFreq.toFixed(2)}Hz) in low range to first neuron`, "color: #00ff00;");
            return this.neuronFrequencies.get(neuronId);
        }

        // Original frequency assignment logic for other neurons
        const ranges = Object.keys(this.frequencyRanges);
        const rangeIndex = neuronId % ranges.length;
        let range = ranges[rangeIndex];
        
        // Use melodic pattern for frequency selection
        const freqIndex = this.melodicPattern[this.currentPatternIndex];
        this.currentPatternIndex = (this.currentPatternIndex + 1) % this.melodicPattern.length;

        // Get note from the selected range and index
        const notesInRange = this.frequencyRanges[range];
        
        // Add error checking to prevent undefined access
        if (!notesInRange || !notesInRange.length) {
            console.error(`No notes found for range "${range}". Falling back to mid range.`);
            // Fallback to mid range if the selected range doesn't exist
            range = 'mid';
            if (!this.frequencyRanges[range]) {
                // Last resort fallback
                console.error(`Critical error: No mid range found. Check frequencyRanges configuration.`);
                return { range: 'mid', freqIndex: 0, baseFreq: 440, customFreq: null };
            }
        }
        
        const noteInRange = notesInRange[freqIndex % notesInRange.length];
        
        // Calculate base frequency for the note
        let baseFreq = 440; // Default A4
        if (noteInRange) {
            // Convert note name to frequency using Tone.js
            try {
                baseFreq = Tone.Frequency(noteInRange).toFrequency();
            } catch (e) {
                console.warn(`Could not convert note ${noteInRange} to frequency, using default`);
            }
        }

        // Store frequency information
        this.neuronFrequencies.set(neuronId, {
            range: range,
            freqIndex: freqIndex,
            baseFreq: baseFreq,
            customFreq: null // Default to no custom frequency
        });

        console.log(`%c[OSCILLATOR BANK] Assigned ${noteInRange} (${baseFreq.toFixed(2)}Hz) in ${range} range to neuron ${neuronId}`, "color: #00ff00;");

        // Update melody direction for variety
        if (this.lastFreqIndex >= notesInRange.length - 1) {
            this.melodyDirection = -1;
        } else if (this.lastFreqIndex <= 0) {
            this.melodyDirection = 1;
        }
        this.lastFreqIndex = (this.lastFreqIndex + this.melodyDirection) % notesInRange.length;

        return this.neuronFrequencies.get(neuronId);
    }
    
    /**
     * Get the sound parameters for a neuron
     */
    getNeuronSoundParameters(neuronId) {
        // Get the neuron's current parameters from the overrides
        const overrides = this.neuronSoundOverrides.get(neuronId) || {};
        
        // Get frequency data if available
        let noteFreq = 440; // Default to A4
        if (this.neuronFrequencies.has(neuronId)) {
            const freqData = this.neuronFrequencies.get(neuronId);
            noteFreq = freqData.customFreq || freqData.baseFreq || noteFreq;
        } else {
            // Assign a new frequency if none exists
            const freqData = this.assignFrequencyRange(neuronId);
            noteFreq = freqData.customFreq || freqData.baseFreq || noteFreq;
        }
        
        // Get the base parameters
        const baseParams = {
            attack: 0.002,
            decay: 0.3,
            sustain: 0.2,
            release: 0.8,
            pitchDecay: 0.05,
            detune: 0,
            neuronVolume: 0,
            note: noteFreq,
            oscillatorType: 'triangle',
            filterType: "lowpass",
            filterFrequency: 5000,
            filterQ: 1,
            reverbSend: 0.2,
            delaySend: 0.15,
            tremoloFreq: 4,
            tremoloDepth: 0,
            vibratoFreq: 5,
            vibratoDepth: 0,
            useSustainedTone: false
        };

        // Combine parameters
        const params = {
            ...baseParams,
            ...overrides,
            note: Number(overrides.note || baseParams.note)
        };
        
        // Ensure proper structure
        if (!params.envelope) {
            params.envelope = {
                attack: params.attack || baseParams.attack,
                decay: params.decay || baseParams.decay,
                sustain: params.sustain || baseParams.sustain,
                release: params.release || baseParams.release,
                attackCurve: params.attackCurve || 'exponential',
                decayCurve: params.decayCurve || 'exponential',
                releaseCurve: params.releaseCurve || 'exponential'
            };
        }
        
        if (!params.oscillator) {
            params.oscillator = {
                type: params.oscillatorType || baseParams.oscillatorType
            };
        }
        
        if (!params.filter) {
            params.filter = {
                type: params.filterType || baseParams.filterType,
                frequency: params.filterFrequency || baseParams.filterFrequency,
                Q: params.filterQ || baseParams.filterQ
            };
        }
        
        if (!params.effects) {
            params.effects = {
                reverbSend: params.reverbSend ?? baseParams.reverbSend,
                delaySend: params.delaySend ?? baseParams.delaySend
            };
        }
        
        if (!params.modulation) {
            params.modulation = {
                tremoloFreq: params.tremoloFreq ?? baseParams.tremoloFreq,
                tremoloDepth: params.tremoloDepth ?? baseParams.tremoloDepth,
                vibratoFreq: params.vibratoFreq ?? baseParams.vibratoFreq,
                vibratoDepth: params.vibratoDepth ?? baseParams.vibratoDepth
            };
        }
        
        return params;
    }
    
    /**
     * Alias for getNeuronSoundParameters - fixes the naming inconsistency error
     * @param {number} neuronId - Neuron ID
     * @returns {object} Sound parameters for the neuron
     */
    getNeuronSynthParams(neuronId) {
        // Call the correctly named method
        return this.getNeuronSoundParameters(neuronId);
    }
    
    /**
     * Select a neuron for editing
     * @param {number} neuronId - Neuron ID
     */
    selectNeuron(neuronId) {
        if (neuronId === null) {
            this.deselectNeuron();
            return;
        }

        console.log(`SoundManager: Selecting neuron ${neuronId}`);
        
        // Store the previous neuron ID before updating
        const previousNeuronId = this.selectedNeuronId;
        this.selectedNeuronId = neuronId;
        
        // Initialize settings for this neuron if they don't exist yet
        if (!this.neuronSoundOverrides.has(neuronId)) {
            console.log(`Creating initial sound settings for neuron ${neuronId}`);
            
            // If we have previously selected neuron parameters, use those instead of defaults
            if (this.lastSelectedNeuronParams) {
                console.log(`Applying sound settings from previous neuron to neuron ${neuronId}`);
                this.neuronSoundOverrides.set(neuronId, JSON.parse(JSON.stringify(this.lastSelectedNeuronParams)));
            } else {
            // Create initial sound settings with default values
            const defaultParams = this.getDefaultSynthParams();
            this.neuronSoundOverrides.set(neuronId, {
                pitchDecay: defaultParams.pitchDecay,
                detune: defaultParams.detune,
                neuronVolume: defaultParams.neuronVolume,
                useSustainedTone: defaultParams.useSustainedTone,
                envelope: {
                    attack: defaultParams.attack,
                    decay: defaultParams.decay,
                    sustain: defaultParams.sustain,
                    release: defaultParams.release
                },
                oscillator: {
                    type: defaultParams.oscillatorType
                },
                filter: {
                    type: defaultParams.filterType,
                    frequency: defaultParams.filterFrequency,
                    Q: defaultParams.filterQ
                },
                effects: {
                    reverbSend: defaultParams.reverbSend,
                    delaySend: defaultParams.delaySend
                },
                modulation: {
                    tremoloFreq: defaultParams.tremoloFreq,
                    tremoloDepth: defaultParams.tremoloDepth,
                    vibratoFreq: defaultParams.vibratoFreq,
                    vibratoDepth: defaultParams.vibratoDepth
                }
            });
            }
        } else {
            // Store the current neuron's parameters to apply to future new neurons
            this.lastSelectedNeuronParams = JSON.parse(JSON.stringify(this.neuronSoundOverrides.get(neuronId)));
            console.log(`Stored sound settings from neuron ${neuronId} for future new neurons`);
        }
        
        // Initialize frequency data if it doesn't exist yet
        if (!this.neuronFrequencies.has(neuronId)) {
            console.log(`Assigning frequency data for neuron ${neuronId}`);
            this.assignFrequencyRange(neuronId);
        }

        // Find neuron position for the selection ring
        let neuronPosition = null;
        let neuronScale = null;
        for (const circle of window.circles || []) {
            if (circle && circle.neuron && circle.neuron.id === neuronId) {
                neuronPosition = {
                    x: circle.position.x,
                    y: circle.position.y,
                    z: circle.position.z
                };
                neuronScale = circle.scale.x;
                break;
            }
        }

        // Selection ring has been removed - no need to update
    }
    
    /**
     * Deselect the currently selected neuron
     */
    deselectNeuron() {
        this.selectedNeuronId = null;
        
        // Selection ring has been removed - no deselection needed
    }
    
    /**
     * Get default synth parameters for UI initialization
     */
    getDefaultSynthParams() {
        return {
            attack: 0.002,
            decay: 0.3,
            sustain: 0.2,
            release: 0.8,
            pitchDecay: 0.05,
            detune: 0,
            neuronVolume: 0,
            note: this.baseFrequency,
            oscillatorType: "triangle",
            attackCurve: "exponential",
            useSustainedTone: false,
            filterType: "lowpass",
            filterFrequency: 5000,
            filterQ: 1,
            reverbSend: 0.2,
            delaySend: 0.15,
            tremoloFreq: 4,
            tremoloDepth: 0,
            vibratoFreq: 5,
            vibratoDepth: 0
        };
    }
    
    /**
     * Update parameters for the selected neuron
     */
    updateSelectedSynthParam(paramName, value) {
        if (this.selectedNeuronId === null) return; // No neuron selected

        console.log(`%c[OSCILLATOR BANK] Updating parameter ${paramName} to ${value}`, "color: #00aaff;");
        
        // Get the current overrides for this neuron
        if (!this.neuronSoundOverrides.has(this.selectedNeuronId)) {
            this.neuronSoundOverrides.set(this.selectedNeuronId, {});
        }
        
        const overrides = this.neuronSoundOverrides.get(this.selectedNeuronId);
        
        // Handle note frequency change separately
        if (paramName === 'note') {
            // Make sure neuronFrequencies has this neuron
            if (!this.neuronFrequencies.has(this.selectedNeuronId)) {
                this.assignFrequencyRange(this.selectedNeuronId);
            }
            
            // Get current frequency data
            const freqData = this.neuronFrequencies.get(this.selectedNeuronId);
            
            // Update custom frequency
            freqData.customFreq = value;
            
            // Set the override value
            overrides.note = value;
        } 
        // Handle envelope parameters
        else if (['attack', 'decay', 'sustain', 'release', 'attackCurve', 'decayCurve', 'releaseCurve'].includes(paramName)) {
            // Initialize envelope object if not exists
            if (!overrides.envelope) {
                overrides.envelope = {};
            }
            overrides.envelope[paramName] = value;
            
            // Also set the top-level parameter for compatibility
            overrides[paramName] = value;
        }
        // Handle oscillator parameters
        else if (paramName === 'oscillatorType') {
            // Initialize oscillator object if not exists
            if (!overrides.oscillator) {
                overrides.oscillator = {};
            }
            overrides.oscillator.type = value;
            
            // Also set the top-level parameter for compatibility
            overrides[paramName] = value;
            
            // Validate that this oscillator type exists in our bank
            if (!this.oscillatorBank.has(value)) {
                console.warn(`Oscillator type "${value}" not found in oscillator bank. Using "sine" instead.`);
                overrides.oscillator.type = "sine";
            }
            
            // Ensure this change is immediately reflected in UI
            if (window.settings) {
                window.settings.selectedOscillatorType = value;
                console.log(`%c[OSCILLATOR BANK] Updated oscillator type to ${value} for neuron ${this.selectedNeuronId}`, "color: #00ff00;");
            }
        }
        // Handle filter parameters
        else if (['filterType', 'filterFrequency', 'filterQ'].includes(paramName)) {
            // Initialize filter object if not exists
            if (!overrides.filter) {
                overrides.filter = {};
            }
            
            const filterParamName = paramName.replace('filter', '').toLowerCase();
            overrides.filter[filterParamName] = value;
            
            // Also set the top-level parameter for compatibility
            overrides[paramName] = value;
            
            // Update bus filter immediately for selected neuron
            if (this.buses && this.buses.selected && this.buses.selected.filter) {
                if (filterParamName === 'type') {
                    this.buses.selected.filter.type = value;
                } else if (filterParamName === 'frequency') {
                    const now = Tone.now();
                    this.buses.selected.filter.frequency.cancelScheduledValues(now);
                    this.buses.selected.filter.frequency.setValueAtTime(this.buses.selected.filter.frequency.value, now);
                    this.buses.selected.filter.frequency.linearRampToValueAtTime(value, now + 0.05);
                } else if (filterParamName === 'q') {
                    const now = Tone.now();
                    this.buses.selected.filter.Q.cancelScheduledValues(now);
                    this.buses.selected.filter.Q.setValueAtTime(this.buses.selected.filter.Q.value, now);
                    this.buses.selected.filter.Q.linearRampToValueAtTime(value, now + 0.05);
                }
            }
        }
        // Handle effect parameters
        else if (['reverbSend', 'delaySend'].includes(paramName)) {
            // Initialize effects object if not exists
            if (!overrides.effects) {
                overrides.effects = {};
            }
            
            overrides.effects[paramName] = value;
            
            // Also set the top-level parameter for compatibility
            overrides[paramName] = value;
            
            // Update bus effects immediately for selected neuron
            if (this.buses && this.buses.selected) {
                if (paramName === 'reverbSend' && this.buses.selected.reverb) {
                    this.buses.selected.reverb.wet.value = value;
                } else if (paramName === 'delaySend' && this.buses.selected.delay) {
                    this.buses.selected.delay.wet.value = value;
                }
            }
        }
        // Handle modulation parameters
        else if (['tremoloFreq', 'tremoloDepth', 'vibratoFreq', 'vibratoDepth'].includes(paramName)) {
            // Initialize modulation object if not exists
            if (!overrides.modulation) {
                overrides.modulation = {};
            }
            
            overrides.modulation[paramName] = value;
            
            // Also set the top-level parameter for compatibility
            overrides[paramName] = value;
            
            // Update bus modulation immediately for selected neuron
            if (this.buses && this.buses.selected) {
                if (paramName === 'tremoloFreq' && this.buses.selected.tremolo) {
                    this.buses.selected.tremolo.frequency.value = value;
                } else if (paramName === 'tremoloDepth' && this.buses.selected.tremolo) {
                    this.buses.selected.tremolo.depth.value = value;
                    this.buses.selected.tremolo.wet.value = value > 0 ? 1 : 0;
                } else if (paramName === 'vibratoFreq' && this.buses.selected.vibrato) {
                    this.buses.selected.vibrato.frequency.value = value;
                } else if (paramName === 'vibratoDepth' && this.buses.selected.vibrato) {
                    this.buses.selected.vibrato.depth.value = value;
                    this.buses.selected.vibrato.wet.value = value > 0 ? 1 : 0;
                }
            }
        }
        // Handle other parameters
        else {
            overrides[paramName] = value;
            
            // Special handling for preset name
            if (paramName === 'name') {
                console.log(`%c[OSCILLATOR BANK] Set preset name to "${value}" for neuron ${this.selectedNeuronId}`, "color: #00aaff;");
            }
        }
        
        // Save the updated overrides back to the map
        this.neuronSoundOverrides.set(this.selectedNeuronId, overrides);
        
        // Update window.settings to reflect the changes (for tweakpane updates)
        if (window.settings) {
            // Convert paramName to match the tweakpane control name format
            const settingName = `selected${paramName.charAt(0).toUpperCase() + paramName.slice(1)}`;
            window.settings[settingName] = value;
            
            // Refresh UI controls if they exist
            if (window.selectedSynthFolder) {
                window.selectedSynthFolder.refresh();
            }
        }
        
        // Only play a preview sound if explicitly enabled
        if (window.settings && window.settings.previewSounds) {
            this.triggerPreviewSound();
        }
    }

    /**
     * Trigger a preview sound to demonstrate current sound settings
     */
    triggerPreviewSound() {
        // Only play preview sounds if enabled
        if (!window.settings || !window.settings.previewSounds) {
            return;
        }
        
        // Clear any existing debounce timeout
        if (this.previewDebounceTimeout) {
            clearTimeout(this.previewDebounceTimeout);
        }
        
        // Debounce to prevent too many sounds from playing at once during slider adjustment
        this.previewDebounceTimeout = setTimeout(() => {
            if (this.selectedNeuronId !== null) {
                this.playNeuronFiring(
                    0.7, // weight
                    0.5, // speed
                    this.selectedNeuronId,
                    true, // isIsolated
                    true, // hasDC
                    0    // distance
                );
                
                // Force update of visualizations
                if (window.drawVisualizations) {
                    window.drawVisualizations();
                }
            }
        }, 50); // Short debounce delay
    }

    /**
     * Play a small sound for UI feedback
     * @param {number} pitch - Pitch parameter (0-1)
     * @param {number} speed - Speed parameter (0-1)
     * @param {number} volume - Volume parameter (0-1)
     */
    playSmallSound(pitch = 0.5, speed = 0.5, volume = 0.3) {
        // Ensure audio context is running
        this.ensureAudioContext();
        
        // Convert pitch parameter to a frequency in a suitable range
        const freq = 600 + (pitch * 600);
        
        // Duration based on speed (faster = shorter sound)
        const duration = 0.1 + ((1 - speed) * 0.2);
        
        // Use one of our existing buses for simplicity
        const bus = this.buses["selected"];
        if (!bus || !bus.eq) {
            console.warn("Cannot play small sound - bus not available");
            return;
        }
        
        // Get quantized frequency
        const quantizedFreq = this.getClosestFrequency(freq);
        
        // Get oscillator data for sine wave (simplest for UI sounds)
        const oscillatorType = "sine";
        
        // Get or create the oscillator (lazy initialization)
        const oscData = this._getOrCreateOscillator(oscillatorType, quantizedFreq);
        
        if (!oscData) {
            console.warn(`No oscillator found for UI sound`);
            return;
        }
        
        // Create a temporary gain node for this sound
        const tempGain = new Tone.Gain(0).connect(bus.gain);
        oscData.oscillator.connect(tempGain);
        
        // Play a quick double tone with envelope
        const now = Tone.now();
        
        // First tone
        tempGain.gain.cancelScheduledValues(now);
        tempGain.gain.setValueAtTime(0, now);
        tempGain.gain.linearRampToValueAtTime(volume * 0.7, now + 0.01);
        tempGain.gain.linearRampToValueAtTime(0, now + duration * 0.6);
        
        // Cleanup gain node after sound is done
        setTimeout(() => {
            tempGain.dispose();
        }, (duration * 1000) + 200);
    }

    // Set the global volume
    setVolume(volume) {
        this.volume = volume;
        if (this.finalMixer) {
            // Convert from dB to linear gain
            const gainValue = Math.pow(10, volume / 20);
            this.finalMixer.gain.value = gainValue;
        }
        console.log(`Set master volume to ${volume}dB (gain: ${Math.pow(10, volume / 20).toFixed(3)})`);
    }
    
    // Set the volume normalization factor
    setVolumeNormalization(factor) {
        this.volumeNormalization = factor;
        console.log(`Set volume normalization factor to ${factor.toFixed(2)}`);
    }
    
    /**
     * Set preview sounds mode (solo selected neuron)
     * @param {boolean} enabled - Whether preview sounds mode is enabled
     */
    setPreviewSounds(enabled) {
        this.playPreviewSounds = enabled;
        console.log(`Preview sounds ${enabled ? 'enabled' : 'disabled'} - ${enabled ? 'Only selected neuron' : 'All neurons'} will play`);
    }
    
    // Add a direct test sound method at the end of the class
    testSound() {
        console.log("Playing test sound...");
        this.ensureAudioContext();
        
        // Create a simple oscillator and connect it directly to the output
        const osc = new Tone.Oscillator({
            frequency: 440,
            type: "sine"
        }).start();
        
        const gain = new Tone.Gain(0).toDestination();
        osc.connect(gain);
        
        // Simple envelope
        const now = Tone.now();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        
        // Clean up
        setTimeout(() => {
            osc.stop();
            osc.dispose();
            gain.dispose();
            console.log("Test sound completed");
        }, 600);
    }
    
    // Immediately silence a specific neuron
    silenceNeuron(neuronId) {
        if (!neuronId) return;
        
        console.log(`Silencing neuron ${neuronId}`);
        
        // Find the appropriate bus for this neuron
        const busId = this.neuronBusAssignments.get(neuronId) || 'mid';
        const bus = this.buses[busId];
        
        // If we have a bus, temporarily mute it to silence any ongoing sounds for this neuron
        if (bus && bus.gain) {
            // Store the original volume
            const originalVolume = bus.gain.gain.value;
            
            // Immediately set gain to 0 to silence
            bus.gain.gain.setValueAtTime(0, Tone.now());
            
            // Restore after a short time (to allow disconnects to happen)
            setTimeout(() => {
                bus.gain.gain.setValueAtTime(originalVolume, Tone.now());
            }, 100);
        }
        
        // Clean up any pending restorations
        if (this.pendingRestorations && this.pendingRestorations.has(neuronId)) {
            clearTimeout(this.pendingRestorations.get(neuronId));
            this.pendingRestorations.delete(neuronId);
        }
        
        // Remove from active voices
        if (this.activeVoices) {
            this.activeVoices.delete(neuronId);
        }
        
        // Clear any synth overrides
        this.neuronSoundOverrides.delete(neuronId);
        
        // Clear any frequency assignments
        this.neuronFrequencies.delete(neuronId);
        
        // Clear any bus assignments
        this.neuronBusAssignments.delete(neuronId);
        
        // If this was the selected neuron, deselect it
        if (this.selectedNeuronId === neuronId) {
            this.selectedNeuronId = null;
        }
    }
    
    // Silence all neurons and clear all neuron-related sound data
    silenceAllNeurons() {
        console.log("Silencing all neurons");
        
        // Save current sound state before clearing
        this._lastNeuronSoundState = {
            neuronSoundOverrides: new Map(this.neuronSoundOverrides),
            neuronFrequencies: new Map(this.neuronFrequencies),
            neuronBusAssignments: new Map(this.neuronBusAssignments)
        };
        
        // Temporarily mute all buses to immediately stop all sounds
        Object.values(this.buses).forEach(bus => {
            if (bus && bus.gain) {
                const originalVolume = bus.gain.gain.value;
                // Immediately silence
                bus.gain.gain.setValueAtTime(0, Tone.now());
                
                // Restore after a short delay
                setTimeout(() => {
                    bus.gain.gain.setValueAtTime(originalVolume, Tone.now());
                }, 100);
            }
        });
        
        // Clear all pending restorations
        if (this.pendingRestorations) {
            this.pendingRestorations.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            this.pendingRestorations.clear();
        }
        
        // Clear all data structures
        this.activeVoices.clear();
        this.neuronSoundOverrides.clear();
        this.neuronFrequencies.clear();
        this.neuronBusAssignments.clear();
        this.voicePriorities.clear();
        
        // Reset selected neuron
        this.selectedNeuronId = null;
    }

    /**
     * Restore all neuron sound assignments after audio context resume
     */
    restoreAllNeuronSounds() {
        // If we have a backup from before silence, restore it
        if (this._lastNeuronSoundState) {
            this.neuronSoundOverrides = new Map(this._lastNeuronSoundState.neuronSoundOverrides);
            this.neuronFrequencies = new Map(this._lastNeuronSoundState.neuronFrequencies);
            this.neuronBusAssignments = new Map(this._lastNeuronSoundState.neuronBusAssignments);
            this._lastNeuronSoundState = null; // Clear backup after restoring
            console.log('Restored neuron sound state from backup.');
        }
        if (!window.circles) return;
        window.circles.forEach(circle => {
            if (circle && circle.neuron) {
                const neuronId = circle.neuron.id;
                // If we have stored overrides and frequency, re-apply them
                if (this.neuronSoundOverrides.has(neuronId) && this.neuronFrequencies.has(neuronId)) {
                    // Re-set the override and frequency to themselves to ensure they're in the map
                    const overrides = this.neuronSoundOverrides.get(neuronId);
                    this.neuronSoundOverrides.set(neuronId, {...overrides});
                    const freqData = this.neuronFrequencies.get(neuronId);
                    this.neuronFrequencies.set(neuronId, {...freqData});
                }
                // Ensure bus assignment
                if (!this.neuronBusAssignments.has(neuronId)) {
                    const params = this.getNeuronSynthParams ? this.getNeuronSynthParams(neuronId) : this.getNeuronSoundParameters(neuronId);
                    const isIsolated = !circle.neuron.outgoingConnections.size;
                    const hasDC = circle.neuron.dcInput > 0;
                    const busId = this.getBusForNeuron(neuronId, false, hasDC, params);
                    this.neuronBusAssignments.set(neuronId, busId);
                }
            }
        });
        console.log('Restored all neuron sound assignments after audio context resume.');
    }
    
    /**
     * Refresh DC neuron functionality without disrupting sound playback
     * This is a replacement for the previous implementation that would 
     * cause neurons to pause when creating connections
     */
    refreshDCNeurons() {
        // We intentionally do nothing disruptive here
        // With our improved neuron.js implementation, there's actually 
        // no need to reset or refresh anything when connections change
        
        // This empty method ensures any legacy code calling refreshDCNeurons 
        // will not cause any disruption to audio playback
        
        // Here's why we've removed all logic:
        // 1. When a neuron has DC input, its internal timer continues firing regularly
        // 2. When connections are created/modified, they don't affect the DC timing
        // 3. Our neuron.js improvements ensure DC timing is preserved during all operations
        
        // The empty method exists only for backward compatibility
        return;
    }

    // Add method for tracking active sound types
    trackSoundTypeActivity() {
        // Update playing status based on time elapsed (consider a sound "active" for 200ms)
        const now = performance.now();
        const activeThreshold = 200; // 200ms
        
        // Check if bass is still playing
        if (now - this.recentSoundTypes.bass.lastPlayed < activeThreshold) {
            this.recentSoundTypes.bass.isPlaying = true;
        } else {
            this.recentSoundTypes.bass.isPlaying = false;
        }
        
        // Check if hi-hat is still playing
        if (now - this.recentSoundTypes.hihat.lastPlayed < activeThreshold) {
            this.recentSoundTypes.hihat.isPlaying = true;
        } else {
            this.recentSoundTypes.hihat.isPlaying = false;
        }
        
        // If both are playing, ensure the finalMixer gain is reduced
        if (this.recentSoundTypes.bass.isPlaying && this.recentSoundTypes.hihat.isPlaying) {
            if (this.finalMixer && this.finalMixer.gain) {
                // Temporarily reduce the gain to prevent clipping
                this.finalMixer.gain.value = 0.85; // Further reduce from 0.92 to 0.85 when both are active
            }
        } else {
            // Return to normal gain
            if (this.finalMixer && this.finalMixer.gain) {
                this.finalMixer.gain.value = 0.92;
            }
        }
    }

    // Add a new dispose method to ensure proper cleanup at shutdown
    dispose() {
        console.log("%c[OSCILLATOR BANK] Disposing all oscillators and audio resources", "color: #ff0000; font-weight: bold;");
        
        // Clean up all oscillators
        this.oscillatorBank.forEach((freqMap, type) => {
            freqMap.forEach((oscData, freq) => {
                if (oscData.gain) oscData.gain.dispose();
                if (oscData.oscillator) oscData.oscillator.dispose();
            });
            freqMap.clear();
        });
        this.oscillatorBank.clear();
        
        // Also clean up audio buses and other resources
        if (this.buses) {
            Object.values(this.buses).forEach(bus => {
                if (bus.gain) bus.gain.dispose();
                if (bus.eq) bus.eq.dispose();
                if (bus.compressor) bus.compressor.dispose();
                if (bus.reverb) bus.reverb.dispose();
                if (bus.delay) bus.delay.dispose();
            });
        }
        
        if (this.masterLimiter) this.masterLimiter.dispose();
        if (this.masterCompressor) this.masterCompressor.dispose();
        if (this.finalMixer) this.finalMixer.dispose();
        if (this.waveformAnalyzer) this.waveformAnalyzer.dispose();
        
        // Clean up spatial audio nodes
        this.spatialAudioNodes.forEach(panner => {
            if (panner && typeof panner.dispose === 'function') {
                panner.dispose();
            }
        });
        this.spatialAudioNodes.clear();
        this.spatialAudioPanners.clear();
        
        console.log("%c[OSCILLATOR BANK] All audio resources disposed", "color: #ff0000; font-weight: bold;");
    }

    // Add a method to manage polyphony by releasing old notes when needed
    managePolyphonyOverflow(synth) {
        if (!synth || !synth._activeVoices) return;
        
        // Check if we're close to the polyphony limit
        if (synth._activeVoices.size >= synth.options.maxPolyphony - 2) {
            console.log(`%c[POLYPHONY] Managing polyphony for synth - active voices: ${synth._activeVoices.size}/${synth.options.maxPolyphony}`, "color: #ff9900;");
            
            // Get notes that have been playing the longest
            const activeNotes = Array.from(synth._activeVoices.entries());
            
            // Sort by start time (oldest first)
            activeNotes.sort((a, b) => a[1].startTime - b[1].startTime);
            
            // Release up to 4 of the oldest notes to make room for new ones
            const notesToRelease = activeNotes.slice(0, Math.min(4, Math.ceil(activeNotes.length * 0.25)));
            
            notesToRelease.forEach(noteEntry => {
                try {
                    const note = noteEntry[0];
                    // Force an immediate release
                    synth.triggerRelease(note, Tone.now());
                    console.log(`%c[POLYPHONY] Released old note ${note} to make room for new notes`, "color: #ff9900;");
                } catch (err) {
                    console.warn(`Error releasing note: ${err.message}`);
                }
            });
        }
    }
} 

// Set up the global helper function to update the neuron label
window.updateNeuronLabel = (neuronId) => {
    if (neuronId === null) {
        this.neuronLabelElement.style.display = 'none';
    } else {
        // Find the neuron to get its preset name
        let presetName = '';
        let dcValue = '0.00';
        
        if (window.circles) {
            const neuron = window.circles.find(circle => 
                circle && circle.neuron && circle.neuron.id === neuronId);
            
            if (neuron && neuron.neuron) {
                presetName = neuron.neuron.presetName || '';
                dcValue = neuron.neuron.dcInput?.toFixed(2) || '0.00';
            }
        }
        
        // Format the label with [ID] and preset name
        this.neuronLabelElement.innerHTML = `[ ${neuronId} ]  ${presetName}<br>DC: ${dcValue} <span style="margin-left: 5px; font-size: 12px;">🔊</span>`;
        this.neuronLabelElement.style.display = 'block';
        
        // Add tooltip for clarity
        this.neuronLabelElement.title = "Click to toggle sound controls";
    }
};