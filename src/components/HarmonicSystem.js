import * as Tone from 'tone';
import Logger from './utils/logger';

import * as THREE from 'three';

/**
 * HarmonicSystem class
 * 
 * Implements a proximity-based harmonic relationship system that allows
 * neurons to influence each other's musical characteristics based on
 * their spatial proximity and interaction over time.
 */
export class HarmonicSystem {
    constructor(scene, soundManager) {
        // Core references
        this.scene = scene;
        this.soundManager = soundManager;
        
        // Configuration
        this.harmonyStrength = 0.5; // 0-1 scale of global harmonic influence
        this.maxInfluenceDistance = 2.5; // Increased to 2.5 for wider range of green connections
        this.minInfluenceDistance = 0.6; // Distance for maximum harmonic influence
        this.learningRate = 0.1; // Dramatically increased from 0.02 to 0.1
        this.forgetRate = 0.001; // Decreased forget rate so relationships stay longer
        
        // Relationships between neurons
        this.relationships = new Map(); // Map of sourceId -> Map of targetId -> relationship
        
        // Musical system
        this.currentTonalCenter = null; // The detected key/scale
        this.leadingNeurons = []; // Neurons with strongest influence
        this.activeNeurons = new Set(); // Currently active neurons
        
        // Scales for harmonic relationships
        this.scales = {
            'major': [0, 2, 4, 5, 7, 9, 11],
            'minor': [0, 2, 3, 5, 7, 8, 10],
            'pentatonic': [0, 2, 4, 7, 9],
            'blues': [0, 3, 5, 6, 7, 10]
        };
        
        // Visualization
        this.relationshipVisuals = new Map(); // Visual representations of strong relationships
        this.visualizationEnabled = true;
        this.createHelperMaterials();
        
        // Debugging and monitoring
        this.isDebugMode = false;
        this.historyLength = 50; // Number of updates to keep in history
        this.updateHistory = [];
        
        // Frame count for rate limiting
        this.frameCount = 0;
    }
    
    /**
     * Initialize materials for relationship visualization
     */
    createHelperMaterials() {
        this.harmonicLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, // Cyan instead of green for maximum visibility
            transparent: true,
            opacity: 1.0, // Fully opaque
            linewidth: 3, // Even thicker lines
            depthTest: false, // Ensure lines are visible over other objects
            fog: false // Disable fog for clearer lines
        });
    }
    
    /**
     * Update all harmonic relationships based on current neuron positions
     */
    update() {
        if (!window.circles || !this.soundManager) return;
        
        // Get only neurons that exist and have positions
        const neurons = window.circles.filter(circle => 
            circle && circle.neuron && circle.position);
        
        // Check DC speed - slow down harmonic processing at very high speeds
        const dcSpeed = window.settings?.dcSpeedMultiplier || 0;
        const isHighSpeed = dcSpeed > 5;
        
        // At high DC speeds, process updates less frequently to prevent overwhelming the system
        if (isHighSpeed && this.frameCount % 2 !== 0) {
            this.frameCount = (this.frameCount + 1) % 10000;
            return; // Skip this update cycle
        }
        
        // Count the frame for rate limiting at high speeds
        this.frameCount = (this.frameCount + 1) % 10000;
        
        // Detect currently active neurons
        this.updateActiveNeurons(neurons);
        
        // If too many neurons are active at high speeds, limit processing
        if (isHighSpeed && this.activeNeurons.size > 10) {
            Logger.debug(`%c[HARMONIC SYSTEM] Limiting processing due to ${this.activeNeurons.size} active neurons at DC speed ${dcSpeed}`, "color: #ffaa00;");
            
            // Skip the more intensive computations, but still update relationships
            this.updateRelationships(neurons);
            return;
        }
        
        // Detect the current tonal center based on active neurons
        this.detectTonalCenter();
        
        // Update relationship strengths based on proximity
        this.updateRelationships(neurons);
        
        // Update neuron pitches based on relationships
        this.applyHarmonicInfluence(neurons);
        
        // Update visualizations
        if (this.visualizationEnabled) {
            this.updateVisualizations();
        }
        
        // Update debug information
        this.updateDebugInfo();
    }
    
    /**
     * Track which neurons are currently active
     */
    updateActiveNeurons(neurons) {
        // Clear existing active neurons that are no longer firing
        for (const id of this.activeNeurons) {
            const neuron = neurons.find(n => n.neuron.id === id);
            if (!neuron || !neuron.neuron.isFiring) {
                this.activeNeurons.delete(id);
            }
        }
        
        // Add newly firing neurons
        neurons.forEach(neuron => {
            if (neuron.neuron.isFiring) {
                this.activeNeurons.add(neuron.neuron.id);
            }
        });
    }
    
    /**
     * Detect the current tonal center based on active neurons
     */
    detectTonalCenter() {
        if (this.activeNeurons.size === 0) return;
        
        // Count occurrences of each pitch class
        const pitchClassCounts = new Array(12).fill(0);
        
        // Get the pitch classes of all active neurons
        for (const neuronId of this.activeNeurons) {
            const neuronFreq = this.getNeuronFrequency(neuronId);
            if (neuronFreq) {
                // Convert frequency to pitch class (0-11)
                const pitchClass = this.frequencyToPitchClass(neuronFreq);
                if (pitchClass !== null) {
                    pitchClassCounts[pitchClass]++;
                }
            }
        }
        
        // Find the most common pitch class
        let maxCount = 0;
        let dominantPitchClass = 0;
        
        pitchClassCounts.forEach((count, pitchClass) => {
            if (count > maxCount) {
                maxCount = count;
                dominantPitchClass = pitchClass;
            }
        });
        
        // Determine which scale best fits the active notes
        let bestScaleFit = 0;
        let bestScale = 'major';
        
        for (const [scaleName, scalePattern] of Object.entries(this.scales)) {
            let scaleMatchCount = 0;
            
            // For each active neuron, check if it fits in the scale
            for (const neuronId of this.activeNeurons) {
                const neuronFreq = this.getNeuronFrequency(neuronId);
                if (neuronFreq) {
                    const pitchClass = this.frequencyToPitchClass(neuronFreq);
                    if (pitchClass !== null) {
                        // Calculate relative pitch class to the dominant
                        const relativePitchClass = (pitchClass - dominantPitchClass + 12) % 12;
                        
                        // Check if this pitch class is in the scale
                        if (scalePattern.includes(relativePitchClass)) {
                            scaleMatchCount++;
                        }
                    }
                }
            }
            
            // Calculate the fit as a percentage of active notes
            const scaleFit = this.activeNeurons.size > 0 ? 
                scaleMatchCount / this.activeNeurons.size : 0;
            
            if (scaleFit > bestScaleFit) {
                bestScaleFit = scaleFit;
                bestScale = scaleName;
            }
        }
        
        // Update the tonal center
        this.currentTonalCenter = {
            root: dominantPitchClass,
            scale: bestScale,
            confidence: bestScaleFit
        };
        
        // If there's high confidence, identify leading neurons
        if (bestScaleFit > 0.5) {
            this.identifyLeadingNeurons();
        }
        
        // Debug output
        if (this.isDebugMode) {
            Logger.debug(`Detected tonal center: ${Tone.Frequency(dominantPitchClass, "midi").toNote()} ${bestScale} (confidence: ${bestScaleFit.toFixed(2)})`);
        }
    }
    
    /**
     * Identify which neurons have the most influence on the current tonality
     */
    identifyLeadingNeurons() {
        // Reset leading neurons
        this.leadingNeurons = [];
        
        if (!this.currentTonalCenter || this.activeNeurons.size === 0) return;
        
        // Calculate influence score for each active neuron
        const neuronInfluence = [];
        
        for (const neuronId of this.activeNeurons) {
            // Base influence - being active gives some influence
            let influence = 1.0;
            
            // Check if the neuron is in the detected scale
            const neuronFreq = this.getNeuronFrequency(neuronId);
            if (neuronFreq) {
                const pitchClass = this.frequencyToPitchClass(neuronFreq);
                
                if (pitchClass !== null) {
                    // Calculate relative pitch class to the tonal center
                    const relativePitchClass = (pitchClass - this.currentTonalCenter.root + 12) % 12;
                    
                    // Neurons on the root note have more influence
                    if (relativePitchClass === 0) {
                        influence += 3.0; // Root note
                    } 
                    // Neurons on perfect fifth or fourth have more influence
                    else if (relativePitchClass === 7 || relativePitchClass === 5) {
                        influence += 2.0; // Perfect fifth or fourth
                    }
                    // Neurons on third have some influence
                    else if (relativePitchClass === 4 || relativePitchClass === 3) {
                        influence += 1.5; // Major or minor third
                    }
                    
                    // Check if the note is in the current scale
                    const scalePattern = this.scales[this.currentTonalCenter.scale];
                    if (scalePattern.includes(relativePitchClass)) {
                        influence += 1.0; // Note is in scale
                    }
                }
            }
            
            // Add DC input value to influence - neurons with more DC input are more influential
            const neuron = this.getNeuronById(neuronId);
            if (neuron && neuron.neuron) {
                influence += neuron.neuron.dcInput * 2.0;
            }
            
            // Add to influence list
            neuronInfluence.push({ id: neuronId, score: influence });
        }
        
        // Sort by influence score (highest first)
        neuronInfluence.sort((a, b) => b.score - a.score);
        
        // Take top 3 or fewer as leading
        this.leadingNeurons = neuronInfluence.slice(0, 3).map(n => n.id);
        
        if (this.isDebugMode) {
            Logger.debug("Leading neurons:", this.leadingNeurons);
        }
    }
    
    /**
     * Update the strength of all relationships based on neuron proximities
     */
    updateRelationships(neurons) {
        // For each pair of neurons, update their relationship
        for (let i = 0; i < neurons.length; i++) {
            const sourceNeuron = neurons[i];
            const sourceId = sourceNeuron.neuron.id;
            
            // Ensure source neuron has a relationship map
            if (!this.relationships.has(sourceId)) {
                this.relationships.set(sourceId, new Map());
            }
            
            // Get existing relationships for this source
            const sourceRelationships = this.relationships.get(sourceId);
            
            for (let j = 0; j < neurons.length; j++) {
                // Skip self-relationships
                if (i === j) continue;
                
                const targetNeuron = neurons[j];
                const targetId = targetNeuron.neuron.id;
                
                // Calculate distance between neurons
                const distance = sourceNeuron.position.distanceTo(targetNeuron.position);
                
                // Get or create relationship
                let relationship;
                if (sourceRelationships.has(targetId)) {
                    relationship = sourceRelationships.get(targetId);
                } else {
                    relationship = {
                        sourceId,
                        targetId,
                        strength: 0,           // 0-1 scale of harmonic influence
                        learningTime: 0,       // cumulative time in proximity
                        lastUpdateTime: Date.now()
                    };
                    sourceRelationships.set(targetId, relationship);
                }
                
                // Update the relationship
                this.updateRelationshipStrength(relationship, distance);
            }
            
            // Clean up relationships for neurons that are no longer close
            // or where the relationship has weakened significantly
            for (const [targetId, relationship] of sourceRelationships.entries()) {
                // If relationship is very weak, remove it
                if (relationship.strength < 0.02) {
                    sourceRelationships.delete(targetId);
                    
                    // Also remove any visualizations
                    this.removeRelationshipVisualization(sourceId, targetId);
                }
            }
        }
    }
    
    /**
     * Update the strength of a single relationship based on distance
     */
    updateRelationshipStrength(relationship, distance) {
        const now = Date.now();
        const deltaTime = (now - relationship.lastUpdateTime) / 1000; // in seconds
        relationship.lastUpdateTime = now;
        
        // Influence range: 0 at maxDistance, 1 at minDistance or closer
        const distanceInfluence = Math.max(0, Math.min(1, 
            (this.maxInfluenceDistance - distance) / 
            (this.maxInfluenceDistance - this.minInfluenceDistance)
        ));
        
        if (distance <= this.maxInfluenceDistance) {
            // Inside influence range - strengthen relationship
            relationship.learningTime += deltaTime * distanceInfluence;
            
            // Learning curve: faster initial learning, then slower approach to maximum
            const learningCurve = 1 - Math.exp(-relationship.learningTime / 10);
            
            // Update strength based on distance and learning time
            relationship.strength = Math.min(1, 
                relationship.strength + 
                (this.learningRate * distanceInfluence * learningCurve * deltaTime * this.harmonyStrength)
            );
        } else {
            // Outside influence range - weaken relationship
            relationship.strength = Math.max(0, 
                relationship.strength - (this.forgetRate * deltaTime)
            );
            
            // Also decrease learning time
            relationship.learningTime = Math.max(0, 
                relationship.learningTime - (this.forgetRate * deltaTime * 5)
            );
        }
    }
    
    /**
     * Apply harmonic adjustments to neurons based on relationships
     */
    applyHarmonicInfluence(neurons) {
        // Skip if harmony strength is zero or no tonal center is detected
        if (this.harmonyStrength <= 0 || !this.currentTonalCenter) return;
        
        for (const targetNeuron of neurons) {
            const targetId = targetNeuron.neuron.id;
            
            // Skip neurons marked as "harmony anchors" (if we implement that feature)
            if (targetNeuron.neuron.isHarmonyAnchor) continue;
            
            // Gather all influences on this target neuron
            let totalInfluence = 0;
            let targetAdjustments = [];
            
            for (const sourceNeuron of neurons) {
                const sourceId = sourceNeuron.neuron.id;
                
                // Skip self-influence
                if (sourceId === targetId) continue;
                
                // Get the relationship if it exists
                const relationship = this.getRelationship(sourceId, targetId);
                if (!relationship || relationship.strength <= 0) continue;
                
                // Calculate the suggested pitch adjustment
                const adjustment = this.calculatePitchAdjustment(sourceNeuron, targetNeuron, relationship);
                if (adjustment) {
                    // Weight by relationship strength
                    adjustment.influence *= relationship.strength;
                    totalInfluence += adjustment.influence;
                    
                    targetAdjustments.push(adjustment);
                }
            }
            
            // If there are valid adjustments, apply them
            if (targetAdjustments.length > 0 && totalInfluence > 0) {
                // Normalize influences
                targetAdjustments.forEach(adj => {
                    adj.influence /= totalInfluence;
                });
                
                // Apply combined adjustment
                this.applyPitchAdjustment(targetNeuron, targetAdjustments);
            }
        }
    }
    
    /**
     * Calculate how a source neuron should influence a target neuron's pitch
     */
    calculatePitchAdjustment(sourceNeuron, targetNeuron, relationship) {
        // Get information about both neurons
        const sourceFreq = this.getNeuronFrequency(sourceNeuron.neuron.id);
        const targetFreq = this.getNeuronFrequency(targetNeuron.neuron.id);
        
        if (!sourceFreq || !targetFreq) return null;
        
        // Convert frequencies to pitch classes (0-11 representing C to B)
        const sourcePitchClass = this.frequencyToPitchClass(sourceFreq);
        const targetPitchClass = this.frequencyToPitchClass(targetFreq);
        
        if (sourcePitchClass === null || targetPitchClass === null) return null;
        
        // Get current scale
        const currentScale = this.scales[this.currentTonalCenter.scale] || this.scales.major;
        
        // Find closest notes in the scale relative to the source note
        const relativeSourcePitchClass = (sourcePitchClass - this.currentTonalCenter.root + 12) % 12;
        const relativeTargetPitchClass = (targetPitchClass - this.currentTonalCenter.root + 12) % 12;
        
        // Check if target is already in scale relative to source
        const isTargetInScale = currentScale.includes(relativeTargetPitchClass);
        
        // If already in scale and source is a leading neuron, strengthen that choice
        if (isTargetInScale && this.leadingNeurons.includes(sourceNeuron.neuron.id)) {
            return {
                influence: 1.0,
                targetPitchClass: targetPitchClass, // Keep the same
                adjustment: 0
            };
        }
        
        // If not in scale, find the closest note in scale
        if (!isTargetInScale) {
            // Find the closest note in the scale
            let closestScaleNote = null;
            let smallestDistance = 12;
            
            for (const scaleDegree of currentScale) {
                // Calculate the absolute pitch class in the current key
                const absolutePitchClass = (this.currentTonalCenter.root + scaleDegree) % 12;
                
                // Calculate distance (considering circular nature of pitch classes)
                const distance = Math.min(
                    Math.abs(targetPitchClass - absolutePitchClass),
                    12 - Math.abs(targetPitchClass - absolutePitchClass)
                );
                
                if (distance < smallestDistance) {
                    smallestDistance = distance;
                    closestScaleNote = absolutePitchClass;
                }
            }
            
            // Calculate the adjustment
            if (closestScaleNote !== null) {
                // Ensure we choose the closest direction (+/- semitones)
                let adjustment = closestScaleNote - targetPitchClass;
                if (adjustment > 6) adjustment -= 12;
                if (adjustment < -6) adjustment += 12;
                
                // Source's influence is stronger based on relationship and being a leading neuron
                const leaderBonus = this.leadingNeurons.includes(sourceNeuron.neuron.id) ? 2.0 : 1.0;
                const influenceScore = relationship.strength * leaderBonus;
                
                return {
                    influence: influenceScore,
                    targetPitchClass: closestScaleNote,
                    adjustment
                };
            }
        }
        
        return null;
    }
    
    /**
     * Apply a calculated pitch adjustment to a neuron
     */
    applyPitchAdjustment(targetNeuron, adjustments) {
        if (!targetNeuron || !targetNeuron.neuron || adjustments.length === 0) return;
        
        const targetId = targetNeuron.neuron.id;
        const currentFreq = this.getNeuronFrequency(targetId);
        
        if (!currentFreq) return;
        
        // Calculate the weighted adjustment in semitones
        let totalAdjustment = 0;
        adjustments.forEach(adj => {
            totalAdjustment += adj.adjustment * adj.influence;
        });
        
        // Only apply if there's a significant adjustment
        if (Math.abs(totalAdjustment) < 0.25) return;
        
        // Round to nearest semitone if adjustment is large enough
        const roundedAdjustment = Math.abs(totalAdjustment) >= 0.5 ? 
            Math.sign(totalAdjustment) * Math.round(Math.abs(totalAdjustment)) : totalAdjustment;
        
        // Calculate new frequency using equal temperament formula: f = f0 * 2^(n/12)
        const newFreq = currentFreq * Math.pow(2, roundedAdjustment / 12);
        
        // Apply the new frequency to the neuron
        this.updateNeuronFrequency(targetId, newFreq);
    }
    
    /**
     * Update the visualizations for strong relationships
     */
    updateVisualizations() {
        // Skip custom visualization since we're now using connection waveforms
        // for visual feedback on harmonic relationships
        return;
        
        // Original code commented out below
        /*
        // Create/update visualizations for strong relationships
        for (const [sourceId, relationships] of this.relationships.entries()) {
            for (const [targetId, relationship] of relationships.entries()) {
                // Drastically lowered threshold to show relationships immediately
                if (relationship.strength > 0.05) {
                    this.createOrUpdateRelationshipVisualization(sourceId, targetId, relationship.strength);
                } else {
                    this.removeRelationshipVisualization(sourceId, targetId);
                }
            }
        }
        */
    }
    
    /**
     * Create or update a visualization for a relationship
     */
    createOrUpdateRelationshipVisualization(sourceId, targetId, strength) {
        const sourceNeuron = this.getNeuronById(sourceId);
        const targetNeuron = this.getNeuronById(targetId);
        
        if (!sourceNeuron || !targetNeuron || !this.scene) return;
        
        const relationshipKey = `${sourceId}_${targetId}`;
        
        // Update existing visualization or create a new one
        if (this.relationshipVisuals.has(relationshipKey)) {
            const visual = this.relationshipVisuals.get(relationshipKey);
            
            // Update line positions
            const positions = visual.geometry.attributes.position.array;
            
            positions[0] = sourceNeuron.position.x;
            positions[1] = sourceNeuron.position.y + 0.2; // Raised higher above neurons
            positions[2] = sourceNeuron.position.z;
            
            positions[3] = targetNeuron.position.x;
            positions[4] = targetNeuron.position.y + 0.2; // Raised higher above neurons
            positions[5] = targetNeuron.position.z;
            
            visual.geometry.attributes.position.needsUpdate = true;
            
            // Make lines always highly visible regardless of relationship strength
            visual.material.opacity = 0.8 + (strength * 0.2); // Minimum 0.8 opacity
        } else {
            // Create a new line
            const lineGeometry = new THREE.BufferGeometry();
            const positions = new Float32Array(6);
            
            positions[0] = sourceNeuron.position.x;
            positions[1] = sourceNeuron.position.y + 0.2; // Raised higher above neurons
            positions[2] = sourceNeuron.position.z;
            
            positions[3] = targetNeuron.position.x;
            positions[4] = targetNeuron.position.y + 0.2; // Raised higher above neurons
            positions[5] = targetNeuron.position.z;
            
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            
            // Create line with custom material that's always highly visible
            const material = this.harmonicLineMaterial.clone();
            material.opacity = 0.8 + (strength * 0.2); // Minimum 0.8 opacity
            
            const line = new THREE.Line(lineGeometry, material);
            line.renderOrder = 1000; // Extremely high render order to ensure visibility
            
            // Add to scene
            this.scene.add(line);
            
            // Store reference
            this.relationshipVisuals.set(relationshipKey, line);
            
            // Debug log to verify line creation
            Logger.info(`Created harmonic relationship line between neurons ${sourceId} and ${targetId}`);
        }
    }
    
    /**
     * Remove a relationship visualization if it exists
     */
    removeRelationshipVisualization(sourceId, targetId) {
        const relationshipKey = `${sourceId}_${targetId}`;
        
        if (this.relationshipVisuals.has(relationshipKey)) {
            const visual = this.relationshipVisuals.get(relationshipKey);
            
            // Remove from scene
            if (visual && visual.parent) {
                visual.parent.remove(visual);
            }
            
            // Dispose of resources
            if (visual) {
                if (visual.geometry) visual.geometry.dispose();
                if (visual.material) visual.material.dispose();
            }
            
            // Remove from map
            this.relationshipVisuals.delete(relationshipKey);
        }
    }
    
    /**
     * Helper method to get a neuron object by ID
     */
    getNeuronById(neuronId) {
        if (!window.circles) return null;
        
        return window.circles.find(circle => 
            circle && circle.neuron && circle.neuron.id === neuronId);
    }
    
    /**
     * Get the frequency of a neuron from the sound manager
     */
    getNeuronFrequency(neuronId) {
        if (!this.soundManager || !this.soundManager.neuronFrequencies) return null;
        
        const freqData = this.soundManager.neuronFrequencies.get(neuronId);
        if (!freqData) return null;
        
        // Use custom frequency if set, otherwise use base frequency
        return freqData.customFreq || freqData.baseFreq;
    }
    
    /**
     * Get an existing relationship or null if none exists
     */
    getRelationship(sourceId, targetId) {
        if (!this.relationships.has(sourceId)) return null;
        
        return this.relationships.get(sourceId).get(targetId) || null;
    }
    
    /**
     * Convert a frequency to a pitch class (0-11 representing C to B)
     */
    frequencyToPitchClass(frequency) {
        if (!frequency || frequency <= 0) return null;
        
        // Calculate MIDI note number: 69 + 12 * log2(f / 440)
        const midiNote = Math.round(69 + 12 * Math.log2(frequency / 440));
        
        // Extract pitch class (0-11, where 0 is C, 1 is C#, etc.)
        return midiNote % 12;
    }
    
    /**
     * Update a neuron's frequency through the sound manager
     */
    updateNeuronFrequency(neuronId, newFrequency) {
        if (!this.soundManager || !this.soundManager.neuronFrequencies) return;
        
        const freqData = this.soundManager.neuronFrequencies.get(neuronId);
        if (!freqData) return;
        
        // Only update if the change is significant enough
        const currentFreq = freqData.customFreq || freqData.baseFreq;
        const percentChange = Math.abs((newFrequency - currentFreq) / currentFreq);
        
        if (percentChange < 0.001) return; // Skip tiny changes
        
        // Update the custom frequency
        freqData.customFreq = newFrequency;
        
        // Also update the sound manager's internal state if this is the selected neuron
        if (this.soundManager.selectedNeuronId === neuronId) {
            this.soundManager.updateSelectedSynthParam('note', newFrequency);
        }
        
        // Add visual feedback when a note changes
        const neuronCircle = this.getNeuronById(neuronId);
        if (neuronCircle) {
            // Flash the neuron briefly
            const originalColor = neuronCircle.material.color.clone();
            const originalScale = neuronCircle.scale.clone();
            
            // Flash to bright cyan to indicate harmonic adjustment
            neuronCircle.material.color.set(0x00ffff);
            neuronCircle.scale.multiplyScalar(1.5);
            
            // Return to original appearance after a moment
            setTimeout(() => {
                if (neuronCircle && neuronCircle.material) {
                    neuronCircle.material.color.copy(originalColor);
                    neuronCircle.scale.copy(originalScale);
                }
            }, 300);
        }
        
        // Debug output
        if (this.isDebugMode) {
            const noteName = this.soundManager.getNoteNameFromFrequency 
                ? this.soundManager.getNoteNameFromFrequency(newFrequency) 
                : Tone.Frequency(newFrequency).toNote();
                
            Logger.debug(`Adjusted neuron ${neuronId} to frequency ${newFrequency.toFixed(2)}Hz (${noteName})`);
        }
    }
    
    /**
     * Set the global harmonic influence strength
     */
    setHarmonyStrength(value) {
        this.harmonyStrength = Math.max(0, Math.min(1, value));
        
        // Update visualizations when harmony strength changes
        if (this.visualizationEnabled) {
            // If harmony strength is 0, remove all visualizations
            if (this.harmonyStrength <= 0) {
                this.clearAllVisualizations();
            } else {
                this.updateVisualizations();
            }
        }
    }
    
    /**
     * Get current harmonic system status
     */
    getStatus() {
        return {
            activeNeurons: Array.from(this.activeNeurons),
            leadingNeurons: this.leadingNeurons,
            tonalCenter: this.currentTonalCenter,
            relationships: {
                total: Array.from(this.relationships.keys()).reduce((total, sourceId) => {
                    return total + this.relationships.get(sourceId).size;
                }, 0),
                strong: Array.from(this.relationships.keys()).reduce((total, sourceId) => {
                    const sourceRels = this.relationships.get(sourceId);
                    return total + Array.from(sourceRels.values())
                        .filter(rel => rel.strength > 0.5).length;
                }, 0)
            },
            harmonyStrength: this.harmonyStrength
        };
    }
    
    /**
     * Enable or disable debug mode
     */
    setDebugMode(enabled) {
        this.isDebugMode = enabled;
    }
    
    /**
     * Toggle visualization of harmonic relationships
     */
    toggleVisualization(enabled) {
        this.visualizationEnabled = enabled;
        
        // If disabled, clear all visualizations
        if (!enabled) {
            this.clearAllVisualizations();
        }
    }
    
    /**
     * Remove all relationship visualizations
     */
    clearAllVisualizations() {
        for (const [relationshipKey, visual] of this.relationshipVisuals.entries()) {
            // Remove from scene
            if (visual && visual.parent) {
                visual.parent.remove(visual);
            }
            
            // Dispose of resources
            if (visual) {
                if (visual.geometry) visual.geometry.dispose();
                if (visual.material) visual.material.dispose();
            }
        }
        
        // Clear the map
        this.relationshipVisuals.clear();
    }
    
    /**
     * Update debug information
     */
    updateDebugInfo() {
        if (!this.isDebugMode) return;
        
        // Add current update to history
        this.updateHistory.push({
            time: Date.now(),
            activeNeurons: this.activeNeurons.size,
            tonalCenter: this.currentTonalCenter ? 
                `${Tone.Frequency(this.currentTonalCenter.root, "midi").toNote()} ${this.currentTonalCenter.scale}` : 
                'None',
            leadingNeurons: this.leadingNeurons.length,
            relationships: Array.from(this.relationships.keys()).reduce((total, sourceId) => {
                return total + this.relationships.get(sourceId).size;
            }, 0)
        });
        
        // Trim history if too long
        if (this.updateHistory.length > this.historyLength) {
            this.updateHistory = this.updateHistory.slice(-this.historyLength);
        }
    }
    
    /**
     * Clean up resources when system is no longer needed
     */
    cleanup() {
        // Clear all visualizations
        this.clearAllVisualizations();
        
        // Clear maps
        this.relationships.clear();
        this.relationshipVisuals.clear();
        this.activeNeurons.clear();
        this.leadingNeurons = [];
        
        // Dispose of materials
        if (this.harmonicLineMaterial) {
            this.harmonicLineMaterial.dispose();
        }
    }
    
    /**
     * Check if a harmonic relationship exists between two neurons
     * This can be called from other classes like ConnectionManager
     * @param {number} sourceId - The source neuron's ID
     * @param {number} targetId - The target neuron's ID
     * @returns {Object|null} - The relationship object or null if none exists
     */
    getHarmonicRelationship(sourceId, targetId) {
        // Check relationships in both directions with very low threshold for visual feedback
        const directRelationship = this.getRelationship(sourceId, targetId);
        if (directRelationship && directRelationship.strength > 0.01) { // Lowered threshold from 0.05
            return directRelationship;
        }
        
        // Also check the reverse direction
        const reverseRelationship = this.getRelationship(targetId, sourceId);
        if (reverseRelationship && reverseRelationship.strength > 0.01) { // Lowered threshold from 0.05
            return reverseRelationship;
        }
        
        return null;
    }
    
    /**
     * Check if a harmonic relationship should exist between neurons at the given distance
     * Used to show relationships based on proximity even before they've been established
     * @param {number} distance - Distance between neurons
     * @returns {boolean} - Whether these neurons are in harmonic proximity
     */
    isInHarmonicProximity(distance) {
        // Use a slightly more aggressive distance threshold for visual feedback
        return distance <= (this.maxInfluenceDistance * 1.1); // 10% buffer for better visualization
    }
} 