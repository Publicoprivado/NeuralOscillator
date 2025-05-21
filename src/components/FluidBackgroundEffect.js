import * as THREE from 'three';

export class FluidBackgroundEffect {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.neurons = [];
        this.clock = new THREE.Clock();
        
        // Configuration - use visible but not too bright colors
        this.colors = {
            dark: new THREE.Color('#1a1a1a'),   // Brighter dark gray
            light: new THREE.Color('#2a2a2a')   // Brighter medium gray
        };
        
        // Initialize the effect
        this.initialize();
    }
    
    initialize() {
        // Create shader material
        this.shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                neuronPositions: { value: new Float32Array(30 * 3) }, // xyz for 30 neurons max
                neuronStrengths: { value: new Float32Array(30) },
                neuronCount: { value: 0 },
                colorDark: { value: this.colors.dark },
                colorLight: { value: this.colors.light }
            },
            vertexShader: `
                varying vec2 vUv;
                
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 resolution;
                uniform float neuronPositions[90]; // x,y,z for each neuron (max 30)
                uniform float neuronStrengths[30];
                uniform int neuronCount;
                uniform vec3 colorDark;
                uniform vec3 colorLight;
                
                varying vec2 vUv;
                
                // Grid calculation function
                float grid(vec2 uv, float size) {
                    // Adjust UV coordinates based on aspect ratio
                    vec2 aspectCorrectedUV = uv;
                    aspectCorrectedUV.x *= resolution.x / resolution.y;
                    
                    // Calculate grid with aspect ratio correction
                    vec2 grid = fract(aspectCorrectedUV * size);
                    return (step(0.95, grid.x) + step(0.95, grid.y)) * 0.018;
                }
                
                // Simplified fluid-like function
                float fluidEffect(vec2 p, float time) {
                    float value = 0.0;
                    
                    // Add base wave pattern - more visible
                    value += 0.6 * sin(p.x * 2.0 + time * 0.3) * sin(p.y * 2.2 + time * 0.2);
                    
                    // Add secondary waves for more complexity
                    value += 0.3 * sin(p.x * 5.0 - time * 0.2) * sin(p.y * 4.0 - time * 0.1);
                    value += 0.15 * sin(p.x * 10.0 + time * 0.5) * sin(p.y * 8.0 - time * 0.3);
                    
                    // Add neuron influences with stronger effect
                    for (int i = 0; i < 30; i++) {
                        if (i >= neuronCount) break;
                        
                        // Get neuron screen position from float array
                        vec2 neuronPos = vec2(
                            neuronPositions[i * 3],     // x
                            neuronPositions[i * 3 + 1]  // y
                        );
                        
                        // Calculate distance with proper aspect ratio
                        vec2 aspectCorrectedPos = neuronPos;
                        aspectCorrectedPos.x *= resolution.x / resolution.y;
                        vec2 aspectCorrectedP = p;
                        aspectCorrectedP.x *= resolution.x / resolution.y;
                        float dist = distance(aspectCorrectedP, aspectCorrectedPos);
                        
                        // Create ripple effect around each neuron
                        float strength = neuronStrengths[i];
                        float ripple = strength * 0.005 * sin(dist * 15.0 - time * 3.0) / (1.0 + dist * 3.0);
                        
                        // Add repulsion force (neurons push fluid away)
                        float repulsion = strength * 0.3 / (0.05 + dist * dist * 4.0);
                        
                        value += ripple + repulsion;
                    }
                    
                    return value;
                }
                
                void main() {
                    // Convert UV to normalized device coordinates
                    vec2 p = vUv * 2.0 - 1.0;
                    
                    // Get fluid effect value
                    float fluid = fluidEffect(p, time);
                    
                    // Enhance contrast with non-linear mapping
                    fluid = 0.5 + 0.5 * fluid;
                    fluid = pow(fluid, 1.5); // Increase contrast reduction
                    
                    // Create gradient between dark and light colors
                    vec3 color = mix(colorDark, colorLight, fluid);
                    
                    // Add grid overlay
                    float gridValue = grid(vUv, 20.0); // Adjust grid size by changing the number
                    color = mix(color, vec3(1.0), gridValue);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            transparent: false,
            depthWrite: false, // Don't write to depth buffer
            depthTest: false,  // Don't test against depth buffer
            needsUpdate: true  // Force update
        });
        
        // Create a plane that fills the view
        const planeGeometry = new THREE.PlaneGeometry(2, 2);
        this.plane = new THREE.Mesh(planeGeometry, this.shaderMaterial);
        
        // Create a separate scene and camera for the background
        this.bgScene = new THREE.Scene();
        this.bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
        
        // Add plane to the background scene
        this.bgScene.add(this.plane);
        
        // Ensure the plane is visible
        this.plane.position.z = -5;
        
        // Set up resize handler
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Remove the DOM fallback - we won't need it now
        const existingFallback = document.getElementById('fluid-fallback');
        if (existingFallback) {
            existingFallback.parentNode.removeChild(existingFallback);
        }
        
        // Log initialization
        console.log('Fluid background effect initialized');
    }
    
    handleResize() {
        // Update resolution uniform
        this.shaderMaterial.uniforms.resolution.value.set(
            window.innerWidth, window.innerHeight
        );
    }
    
    // Method to update neuron data
    updateNeurons(neurons) {
        this.neurons = neurons;
        
        // Cap at 30 neurons for performance
        const count = Math.min(neurons.length, 30);
        
        // Create arrays for positions and strengths
        const positions = new Float32Array(count * 3); // xyz for each neuron
        const strengths = new Float32Array(count);
        
        // Fill arrays with data
        for (let i = 0; i < count; i++) {
            const neuron = neurons[i];
            
            if (neuron && neuron.position) {
                // Project 3D position to screen space (-1 to 1)
                const pos = neuron.position.clone();
                pos.project(this.camera);
                
                // Add position to Float32Array
                positions[i * 3] = pos.x;
                positions[i * 3 + 1] = pos.y;
                positions[i * 3 + 2] = pos.z;
                
                // Add strength based on neuron charge or firing state
                let strength = 0.2; // Base strength
                
                if (neuron.neuron) {
                    // Increase strength when firing
                    if (neuron.neuron.isFiring) {
                        strength = 1.0;
                    } 
                    // Or use current charge
                    else if (neuron.neuron.currentCharge) {
                        strength = 0.2 + neuron.neuron.currentCharge * 0.8;
                    }
                }
                
                strengths[i] = strength;
            } else {
                // Add defaults if neuron data is incomplete
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
                strengths[i] = 0;
            }
        }
        
        // Update shader uniforms
        this.shaderMaterial.uniforms.neuronPositions.value = positions;
        this.shaderMaterial.uniforms.neuronStrengths.value = strengths;
        this.shaderMaterial.uniforms.neuronCount.value = count;
    }
    
    // Render the background
    render(renderer) {
        if (!renderer) {
            console.error('No renderer provided to fluid background render method');
            return;
        }
        
        // Update time uniform
        this.shaderMaterial.uniforms.time.value = this.clock.getElapsedTime();
        
        // Debug log (only at startup or once per 300 frames)
        if (this._renderCount === undefined) {
            this._renderCount = 0;
            console.log(`Rendering fluid with ${this.shaderMaterial.uniforms.neuronCount.value} neurons`);
        } else if (this._renderCount % 300 === 0) {
            console.log(`Fluid effect active with ${this.shaderMaterial.uniforms.neuronCount.value} neurons`);
        }
        this._renderCount++;
        
        // Force essential rendering states
        const originalAutoClear = renderer.autoClear;
        
        // Render the background scene
        renderer.autoClear = true; // Clear everything first
        renderer.render(this.bgScene, this.bgCamera);
        
        // Restore original state
        renderer.autoClear = originalAutoClear;
    }
} 