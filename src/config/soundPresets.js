import * as THREE from 'three';

// Define sound presets for use in the application
const soundPresets = [
    { 
        name: "Pluck", 
        attack: 0.001,
        decay: 0.2,
        sustain: 0.1,
        release: 0.4,
        pitchDecay: 0.02,
        detune: 2,
        oscillatorType: "square",
        filterType: "lowpass",
        filterFrequency: 3000,
        filterQ: 2,
        reverbSend: 0.15,
        delaySend: 0.2,
        volumeScaling: 0.8, // Medium scaling for pluck sounds
        color: new THREE.Color(0xcccc00) // Yellow
    },
    { 
        name: "Lo-Fi Piano", 
        attack: 0.002,
        decay: 0.12,
        sustain: 0.3,
        release: 0.8,
        oscillatorType: "triangle",
        pitchDecay: 0.01,
        detune: 3,
        filterType: "lowpass",
        filterFrequency: 5000,
        filterQ: 0.8,
        reverbSend: 0.15,
        delaySend: 0.05,
        neuronVolume: 2,
        volumeScaling: 0.7, // Medium scaling for piano
        color: new THREE.Color(0xffffff) // White
    },
    { 
        name: "Analog Synth", 
        attack: 0.01, 
        decay: 0.3, 
        sustain: 0.4, 
        release: 0.7,
        oscillatorType: "sawtooth",
        filterType: "lowpass",
        filterFrequency: 1500,
        filterQ: 3,
        reverbSend: 0.15,
        delaySend: 0.2,
        neuronVolume: 2,
        volumeScaling: 0.65, // Medium-low scaling for sawtooth waves
        color: new THREE.Color(0x7700ff) // Vibrant Purple
    },
    { 
        name: "Pad", 
        attack: 0.3, 
        decay: 0.5, 
        sustain: 0.8, 
        release: 2.0, 
        oscillatorType: "sine", 
        useSustainedTone: true,
        filterType: "lowpass",
        filterFrequency: 1800,
        filterQ: 0.6,
        reverbSend: 0.4,
        delaySend: 0.2,
        vibratoFreq: 3.5,
        vibratoDepth: 0.1,
        neuronVolume: -6, // Changed from -10 to a more moderate starting value
        volumeScaling: 0.15, // Reduced from 0.3 to 0.15 for much quieter pads
        color: new THREE.Color(0x00ffff) // Pure Cyan
    },
    { 
        name: "Bell", 
        attack: 0.001,
        decay: 0.4,
        sustain: 0.1,
        release: 1.2,
        pitchDecay: 0.1,
        detune: 5,
        oscillatorType: "sine",
        filterType: "highpass",
        filterFrequency: 1000,
        filterQ: 1.5,
        reverbSend: 0.4,
        delaySend: 0.1,
        vibratoFreq: 5,
        vibratoDepth: 0.1,
        volumeScaling: 0.75, // Medium scaling for bells
        color: new THREE.Color(0xffcc00) // Golden
    },
    { 
        name: "Percussion", 
        attack: 0.001,
        decay: 0.1,
        sustain: 0.0,
        release: 0.2,
        oscillatorType: "square",
        filterType: "bandpass",
        filterFrequency: 1000,
        filterQ: 2,
        reverbSend: 0.1,
        delaySend: 0.05,
        volumeScaling: 0.55, // Medium-low scaling for percussion
        color: new THREE.Color(0xff3300) // Red/orange
    },
    { 
        name: "Brass", 
        attack: 0.05,
        decay: 0.3,
        sustain: 0.7,
        release: 0.8,
        oscillatorType: "sawtooth",
        filterType: "lowpass",
        filterFrequency: 2000,
        filterQ: 1,
        reverbSend: 0.2,
        delaySend: 0.1,
        neuronVolume: -8, // Changed to -8
        volumeScaling: 0.5, // Medium-low scaling for brass
        color: new THREE.Color(0xff8800) // Changed to orange
    },
    { 
        name: "String", 
        attack: 0.1,
        decay: 0.4,
        sustain: 0.6,
        release: 1.0,
        oscillatorType: "sine",
        filterType: "lowpass",
        filterFrequency: 3000,
        filterQ: 0.5,
        reverbSend: 0.3,
        delaySend: 0.2,
        neuronVolume: -8, // Changed to -8
        volumeScaling: 0.5, // Medium-low scaling for strings
        color: new THREE.Color(0xff8800) // Warm amber
    },
    { 
        name: "Guitar", 
        attack: 0.01,
        decay: 0.2,
        sustain: 0.4,
        release: 0.6,
        oscillatorType: "sine",
        filterType: "lowpass",
        filterFrequency: 2500,
        filterQ: 1,
        reverbSend: 0.2,
        delaySend: 0.15,
        volumeScaling: 0.7, // Medium scaling for guitar
        color: new THREE.Color(0xff8800) // Warm amber
    },
    { 
        name: "Synth Lead", 
        attack: 0.1,     // Slow attack for natural organ swell
        decay: 0.4,      // Moderate decay for organ-like sustained body
        sustain: 0.8,    // High sustain like a real church organ
        release: 2.0,    // Long release for natural fade
        oscillatorType: "sine", // Pure sine for fundamental tone
        pitchDecay: 0.0, // No pitch decay for stable organ sound
        detune: 0,       // No detune for pure organ sound
        useSustainedTone: true, // Important for organ-like sound
        filterType: "lowpass",
        filterFrequency: 2000, // Warmer tone with less high-end harshness
        filterQ: 0.7,    // Low resonance for natural sound
        reverbSend: 0.4, // More reverb for church-like space
        delaySend: 0.1,  // Slight delay for richer sound
        vibratoFreq: 5.5, // Gentle vibrato like pipe organ tremulant
        vibratoDepth: 0.08, // Subtle vibrato depth
        tremoloFreq: 2.5, // Slow tremolo for subtle movement
        tremoloDepth: 0.1, // Very subtle tremolo
        neuronVolume: -4, // Changed from -11.0 to a more moderate starting value
        volumeScaling: 0.25, // Reduced from 0.35 to 0.25 for better balance
        color: new THREE.Color(0x8800ff) // Purple with more blue for church organ feel
    },
    { 
        name: "Acoustic Drum", 
        attack: 0.001, 
        decay: 0.18, 
        sustain: 0.0, 
        release: 0.3,
        oscillatorType: "triangle",
        filterType: "lowpass",
        filterFrequency: 1200,
        filterQ: 1.5,
        reverbSend: 0.22,
        delaySend: 0.05,
        neuronVolume: 4,
        volumeScaling: 0.6, // Medium-low scaling for drums
        color: new THREE.Color(0xff0000) // Pure Red
    },
    { 
        name: "Bass", 
        attack: 0.01,           // Slightly slower attack for smoother start
        decay: 0.3,             // Longer decay for more body
        sustain: 0.2,           // More sustain for fullness
        release: 0.5,           // Longer release to avoid clipping
        oscillatorType: "sine", // Pure sine wave for cleaner deep bass
        pitchDecay: 0.08,       // Subtle pitch decay for movement
        detune: 3,              // Minimal detune for clarity
        filterType: "lowpass",  // Lowpass to focus on the low end
        filterFrequency: 350,   // Much lower frequency cutoff for deep bass
        filterQ: 0.7,           // Reduced from 0.8 to 0.7 for smoother sound
        reverbSend: 0.04,       // Reduced from 0.05 to 0.04 (less reverb for cleaner bass)
        delaySend: 0.02,        // Reduced from 0.03 to 0.02 (less delay to avoid mud)
        neuronVolume: 3,        // Reduced from 5 to 3 (lower volume to prevent clipping)
        volumeScaling: 0.7,     // Reduced from 0.8 to 0.7 for better balance with hi-hats
        note: 41.20,            // E1 - very low bass register
        color: new THREE.Color(0x0080ff) // Vibrant blue
    },
    { 
        name: "Gentle Hi-Hat", 
        attack: 0.001, 
        decay: 0.1,     
        sustain: 0.0, 
        release: 0.15,
        oscillatorType: "noise", // Changed to noise for realism
        filterType: "highpass",
        filterFrequency: 8000, // Much higher frequency for hi-hats 
        filterQ: 1.2,           // Reduced from 1.5 to 1.2 for smoother sound
        reverbSend: 0.08,       // Reduced from 0.12 to 0.08 (less reverb)
        delaySend: 0.02,        // Reduced from 0.03 to 0.02 (less delay) 
        neuronVolume: 0,        // Reduced from 1 to 0 (lower volume to prevent clipping)
        volumeScaling: 0.22,    // Reduced from 0.25 to 0.22 (even lower scaling for better balance)
        color: new THREE.Color(0xcccc00) // Yellow  
    },
    { 
        name: "Bright Hi-Hat", 
        attack: 0.0005, 
        decay: 0.04,     
        sustain: 0.0, 
        release: 0.06,
        oscillatorType: "noise", // Changed to noise
        filterType: "highpass",
        filterFrequency: 11000, // Very high frequency for bright sound
        filterQ: 2.5,           // Reduced from 3.0 to 2.5 for smoother sound
        reverbSend: 0.04,       // Reduced from 0.05 to 0.04
        delaySend: 0.01,        // Reduced from 0.02 to 0.01 
        neuronVolume: 2,        // Reduced from 4 to 2 (lower volume to prevent clipping)
        volumeScaling: 0.18,    // Reduced from 0.2 to 0.18 (lower scaling for better balance)
        color: new THREE.Color(0xcccc00) // Yellow
    }
];

export default soundPresets; 