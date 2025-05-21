/**
 * ResourceManager - Manages THREE.js resources and handles proper disposal
 * 
 * Provides:
 * - Centralized tracking of THREE.js resources
 * - Automatic disposal of materials, geometries, textures
 * - Resource pooling to prevent recreating objects
 */
import * as THREE from 'three';

export class ResourceManager {
  constructor() {
    // Track all resources by type and owner
    this.resources = {
      geometries: new Map(),
      materials: new Map(),
      textures: new Map(),
      objects: new Map(),
      meshes: new Map(),
      shaders: new Map(),
      renderers: new Map()
    };
    
    // Object pools for reuse
    this.pools = {
      geometries: new Map(),
      materials: new Map(),
      meshes: new Map()
    };
    
    // Resource ownership
    this.ownership = new Map();
  }
  
  /**
   * Register a THREE.js resource for tracking
   * @param {string} type - Resource type (geometry, material, etc.)
   * @param {Object} resource - The THREE.js resource object
   * @param {string} ownerId - ID of component that owns this resource
   * @param {string} [resourceId] - Optional unique ID for this resource
   * @returns {string} Resource ID for reference
   */
  registerResource(type, resource, ownerId, resourceId = null) {
    // Check if the type is valid
    if (!this.resources[type]) {
      // Skip warning, only log errors
      return null;
    }
    
    // Generate resource ID if not provided
    const id = resourceId || `${type}_${ownerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the resource
    this.resources[type].set(id, resource);
    
    // Track ownership
    if (!this.ownership.has(ownerId)) {
      this.ownership.set(ownerId, new Map());
    }
    
    if (!this.ownership.get(ownerId).has(type)) {
      this.ownership.get(ownerId).set(type, new Set());
    }
    
    this.ownership.get(ownerId).get(type).add(id);
    
    return id;
  }
  
  /**
   * Get a resource by ID
   * @param {string} type - Resource type
   * @param {string} id - Resource ID
   * @returns {Object} The resource
   */
  getResource(type, id) {
    if (!this.resources[type]) return null;
    return this.resources[type].get(id);
  }
  
  /**
   * Dispose of a specific resource
   * @param {string} type - Resource type
   * @param {string} id - Resource ID
   * @param {boolean} addToPool - Whether to add to pool instead of disposing
   * @returns {boolean} Success
   */
  disposeResource(type, id, addToPool = false) {
    if (!this.resources[type] || !this.resources[type].has(id)) {
      return false;
    }
    
    const resource = this.resources[type].get(id);
    
    // Add to pool instead of disposing if requested and supported
    if (addToPool && this.pools[type]) {
      // Get resource key (depends on type)
      let key;
      if (type === 'geometries' && resource.type) {
        key = resource.type;
      } else if (type === 'materials' && resource.type) {
        key = `${resource.type}_${resource.color ? resource.color.getHex() : 0}`;
      } else {
        // Generic fallback
        key = type;
      }
      
      // Add to pool
      if (!this.pools[type].has(key)) {
        this.pools[type].set(key, []);
      }
      
      // Reset properties to clean state before pooling
      this._resetResourceForPooling(type, resource);
      
      // Add to pool
      this.pools[type].get(key).push(resource);
    } else {
      // Dispose properly based on type
      this._disposeByType(type, resource);
    }
    
    // Remove from tracking
    this.resources[type].delete(id);
    
    // Update ownership tracking
    for (const [ownerId, typeMap] of this.ownership.entries()) {
      if (typeMap.has(type)) {
        const resourceSet = typeMap.get(type);
        if (resourceSet.has(id)) {
          resourceSet.delete(id);
          
          // Clean up if empty
          if (resourceSet.size === 0) {
            typeMap.delete(type);
            if (typeMap.size === 0) {
              this.ownership.delete(ownerId);
            }
          }
          break;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Get a resource from the pool or create new
   * @param {string} type - Resource type
   * @param {string} key - Pool key
   * @param {Function} createFn - Function to create new resource if none in pool
   * @param {string} ownerId - Component ID
   * @returns {Object} Resource and its ID
   */
  getPooledResource(type, key, createFn, ownerId) {
    let resource;
    
    // Try to get from pool
    if (this.pools[type] && this.pools[type].has(key) && this.pools[type].get(key).length > 0) {
      resource = this.pools[type].get(key).pop();
    } else {
      // Create new if not in pool
      resource = createFn();
    }
    
    // Register the resource
    const resourceId = this.registerResource(type, resource, ownerId);
    
    return { resource, resourceId };
  }
  
  /**
   * Clean up all resources for a component
   * @param {string} ownerId - Component ID
   * @param {boolean} addToPool - Whether to pool resources instead of disposing
   */
  cleanupOwner(ownerId, addToPool = false) {
    if (!this.ownership.has(ownerId)) return;
    
    const typeMap = this.ownership.get(ownerId);
    
    // For each resource type owned by this component
    typeMap.forEach((resourceIds, type) => {
      // Create a copy of the set to avoid modification during iteration
      const idsToRemove = [...resourceIds];
      
      // Dispose each resource
      idsToRemove.forEach(id => {
        this.disposeResource(type, id, addToPool);
      });
    });
    
    // Remove the owner from tracking
    this.ownership.delete(ownerId);
  }
  
  /**
   * Create a THREE.js geometry with automatic tracking
   * @param {string} ownerId - Component ID
   * @param {string} geometryType - Type of geometry to create
   * @param {Array} params - Parameters for the geometry constructor
   * @param {boolean} usePooling - Whether to check pool first
   * @returns {Object} The geometry and its tracking ID
   */
  createGeometry(ownerId, geometryType, params = [], usePooling = true) {
    // Try to get from pool if requested
    if (usePooling) {
      return this.getPooledResource(
        'geometries',
        geometryType,
        () => {
          // Create the appropriate geometry type
          switch (geometryType) {
            case 'BoxGeometry':
              return new THREE.BoxGeometry(...params);
            case 'SphereGeometry':
              return new THREE.SphereGeometry(...params);
            case 'PlaneGeometry':
              return new THREE.PlaneGeometry(...params);
            case 'CircleGeometry':
              return new THREE.CircleGeometry(...params);
            case 'CylinderGeometry':
              return new THREE.CylinderGeometry(...params);
            case 'BufferGeometry':
              return new THREE.BufferGeometry();
            default:
              return new THREE.BufferGeometry();
          }
        },
        ownerId
      );
    }
    
    // Create directly if pooling not requested
    let geometry;
    switch (geometryType) {
      case 'BoxGeometry':
        geometry = new THREE.BoxGeometry(...params);
        break;
      case 'SphereGeometry':
        geometry = new THREE.SphereGeometry(...params);
        break;
      case 'PlaneGeometry':
        geometry = new THREE.PlaneGeometry(...params);
        break;
      case 'CircleGeometry':
        geometry = new THREE.CircleGeometry(...params);
        break;
      case 'CylinderGeometry':
        geometry = new THREE.CylinderGeometry(...params);
        break;
      case 'BufferGeometry':
        geometry = new THREE.BufferGeometry();
        break;
      default:
        return { resource: new THREE.BufferGeometry(), resourceId: null };
    }
    
    // Register and return
    const resourceId = this.registerResource('geometries', geometry, ownerId);
    return { resource: geometry, resourceId };
  }
  
  /**
   * Create a THREE.js material with automatic tracking
   * @param {string} ownerId - Component ID
   * @param {string} materialType - Type of material
   * @param {Object} params - Parameters for the material
   * @param {boolean} usePooling - Whether to check pool first
   * @returns {Object} The material and its tracking ID
   */
  createMaterial(ownerId, materialType, params = {}, usePooling = true) {
    // Generate a pool key based on material type and color
    const color = params.color !== undefined ? 
      (typeof params.color === 'number' ? params.color : new THREE.Color(params.color).getHex()) : 
      0;
    
    const poolKey = `${materialType}_${color}`;
    
    // Try to get from pool if requested
    if (usePooling) {
      return this.getPooledResource(
        'materials',
        poolKey,
        () => {
          // Create the appropriate material type
          switch (materialType) {
            case 'MeshBasicMaterial':
              return new THREE.MeshBasicMaterial(params);
            case 'MeshStandardMaterial':
              return new THREE.MeshStandardMaterial(params);
            case 'MeshPhongMaterial':
              return new THREE.MeshPhongMaterial(params);
            case 'MeshLambertMaterial':
              return new THREE.MeshLambertMaterial(params);
            case 'LineBasicMaterial':
              return new THREE.LineBasicMaterial(params);
            default:
              return new THREE.MeshBasicMaterial(params);
          }
        },
        ownerId
      );
    }
    
    // Create directly if pooling not requested
    let material;
    switch (materialType) {
      case 'MeshBasicMaterial':
        material = new THREE.MeshBasicMaterial(params);
        break;
      case 'MeshStandardMaterial':
        material = new THREE.MeshStandardMaterial(params);
        break;
      case 'MeshPhongMaterial':
        material = new THREE.MeshPhongMaterial(params);
        break;
      case 'MeshLambertMaterial':
        material = new THREE.MeshLambertMaterial(params);
        break;
      case 'LineBasicMaterial':
        material = new THREE.LineBasicMaterial(params);
        break;
      default:
        return { resource: new THREE.MeshBasicMaterial(params), resourceId: null };
    }
    
    // Register and return
    const resourceId = this.registerResource('materials', material, ownerId);
    return { resource: material, resourceId };
  }
  
  /**
   * Properly dispose resource based on its type
   * @private
   */
  _disposeByType(type, resource) {
    if (!resource) return;
    
    switch (type) {
      case 'geometries':
        if (resource.dispose) resource.dispose();
        break;
        
      case 'materials':
        if (resource.dispose) resource.dispose();
        
        // Also dispose any textures owned by this material
        for (const prop in resource) {
          const value = resource[prop];
          if (value && value.isTexture) {
            value.dispose();
          }
        }
        break;
        
      case 'textures':
        if (resource.dispose) resource.dispose();
        break;
        
      case 'objects':
        // For generic objects, remove from parent
        if (resource.parent) {
          resource.parent.remove(resource);
        }
        
        // Dispose any geometries or materials
        if (resource.geometry && resource.geometry.dispose) {
          resource.geometry.dispose();
        }
        
        if (resource.material) {
          // Handle array of materials
          if (Array.isArray(resource.material)) {
            resource.material.forEach(material => {
              if (material && material.dispose) material.dispose();
            });
          } else if (resource.material.dispose) {
            resource.material.dispose();
          }
        }
        break;
        
      case 'meshes':
        // For meshes, handle it the same as objects
        if (resource.parent) {
          resource.parent.remove(resource);
        }
        
        if (resource.geometry && resource.geometry.dispose) {
          resource.geometry.dispose();
        }
        
        if (resource.material) {
          // Handle array of materials
          if (Array.isArray(resource.material)) {
            resource.material.forEach(material => {
              if (material && material.dispose) material.dispose();
            });
          } else if (resource.material.dispose) {
            resource.material.dispose();
          }
        }
        break;
        
      case 'renderers':
        if (resource.dispose) resource.dispose();
        break;
        
      case 'shaders':
        // Shaders might not have their own dispose method
        // but may need special handling
        break;
        
      default:
        // For unknown types, try to call dispose if available
        if (resource.dispose) resource.dispose();
    }
  }
  
  /**
   * Reset a resource for pooling
   * @private
   */
  _resetResourceForPooling(type, resource) {
    switch (type) {
      case 'geometries':
        // For geometries, nothing special needed as they're generally immutable
        break;
        
      case 'materials':
        // Reset material properties to default values
        if (resource.opacity !== undefined) resource.opacity = 1;
        if (resource.transparent !== undefined) resource.transparent = false;
        if (resource.depthTest !== undefined) resource.depthTest = true;
        if (resource.needsUpdate !== undefined) resource.needsUpdate = true;
        break;
        
      case 'meshes':
        // Reset transformation
        if (resource.position) resource.position.set(0, 0, 0);
        if (resource.rotation) resource.rotation.set(0, 0, 0);
        if (resource.scale) resource.scale.set(1, 1, 1);
        if (resource.visible !== undefined) resource.visible = true;
        break;
    }
  }
  
  /**
   * Clean up all resources - call when shutting down
   * @param {boolean} addToPool - Whether to pool resources instead of disposing
   */
  cleanup(addToPool = false) {
    // Clean up resources by type
    Object.keys(this.resources).forEach(type => {
      // Convert to array to avoid modification during iteration
      const resourceIds = Array.from(this.resources[type].keys());
      
      // Dispose each resource
      resourceIds.forEach(id => {
        this.disposeResource(type, id, addToPool);
      });
      
      // Clear the map
      this.resources[type].clear();
    });
    
    // Clear ownership tracking
    this.ownership.clear();
    
    // If not adding to pool, clear the pools
    if (!addToPool) {
      Object.keys(this.pools).forEach(type => {
        this.pools[type].forEach(resources => {
          resources.forEach(resource => {
            this._disposeByType(type, resource);
          });
        });
        this.pools[type].clear();
      });
    }
  }
}

// Create singleton instance
export const resourceManager = new ResourceManager(); 