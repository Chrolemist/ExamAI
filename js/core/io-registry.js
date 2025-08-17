/**
 * IO Registry Interface - Abstraction for IO point management
 * Follows ISP and DIP principles
 */
class IIORegistry {
  register(element, metadata, options = {}) {
    throw new Error('Must implement register method');
  }
  
  unregister(element) {
    throw new Error('Must implement unregister method');
  }
  
  getByElement(element) {
    throw new Error('Must implement getByElement method');
  }
  
  getElementById(id) {
    throw new Error('Must implement getElementById method');
  }
  
  getRole(elementOrId) {
    throw new Error('Must implement getRole method');
  }
  
  setRole(elementOrId, role) {
    throw new Error('Must implement setRole method');
  }
  
  makeId(metadata) {
    throw new Error('Must implement makeId method');
  }
}

/**
 * IO Registry Implementation - Concrete implementation with improved SOLID compliance
 * Follows SRP - Only manages IO point registration and lookup
 */
class IORegistryImpl extends IIORegistry {
  constructor(storageProvider = null) {
    super();
    this.storage = storageProvider || StorageFactory.createWithFallback();
    this.elementToMeta = new WeakMap();
    this.idToElement = new Map();
    this.roleChangeListeners = new Set();
  }
  
  /**
   * Generate unique IO ID from metadata
   */
  makeId(metadata) {
    const { nodeType = 'node', nodeId = 'x', side = 'x', index = 0 } = metadata;
    return `${nodeType}:${nodeId}:${side}:${index}`;
  }
  
  /**
   * Register an IO point element
   */
  register(element, metadata, options = {}) {
    if (!element || !metadata) {
      throw new Error('Element and metadata are required');
    }
    
    const { nodeType = 'node', nodeId = 'x', side = 'x', index = 0, defaultRole = 'out' } = metadata;
    const ioId = this.makeId({ nodeType, nodeId, side, index });
    
    // Store metadata
    const ioMeta = { ioId, nodeType, nodeId, side, index };
    this.elementToMeta.set(element, ioMeta);
    this.idToElement.set(ioId, element);
    
    // Set dataset attribute
    try {
      element.dataset.ioid = ioId;
    } catch (error) {
      console.warn('Failed to set dataset attribute:', error);
    }
    
    // Restore or set role
    const savedRole = this.getSavedRole(ioId);
    const role = savedRole || defaultRole;
    this.setRole(element, role);
    
    // Attach role toggle if requested
    if (options.attachToggle) {
      this.attachRoleToggle(element, ioId);
    }
    
    return ioId;
  }
  
  /**
   * Unregister an IO point element
   */
  unregister(element) {
    const meta = this.elementToMeta.get(element);
    if (meta) {
      this.idToElement.delete(meta.ioId);
      this.elementToMeta.delete(element);
      
      // Clear dataset attribute
      try {
        delete element.dataset.ioid;
      } catch (error) {
        console.warn('Failed to clear dataset attribute:', error);
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get IO metadata by element
   */
  getByElement(element) {
    return this.elementToMeta.get(element) || null;
  }
  
  /**
   * Get element by IO ID
   */
  getElementById(id) {
    return this.idToElement.get(String(id)) || null;
  }
  
  /**
   * Get role of IO point
   */
  getRole(elementOrId) {
    const element = typeof elementOrId === 'string' ? 
      this.getElementById(elementOrId) : elementOrId;
    
    if (!element) return '';
    
    return element.getAttribute('data-io') || '';
  }
  
  /**
   * Set role of IO point
   */
  setRole(elementOrId, role) {
    const element = typeof elementOrId === 'string' ? 
      this.getElementById(elementOrId) : elementOrId;
    
    if (!element) {
      throw new Error('Element not found');
    }
    
    const validRoles = ['in', 'out'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}. Must be 'in' or 'out'`);
    }
    
    // Update classes
    element.classList.remove('io-in', 'io-out');
    element.classList.add(`io-${role}`);
    
    // Update attributes
    element.setAttribute('data-io', role);
    
    const label = role === 'in' ? 'Input' : 'Output';
    element.setAttribute('title', label);
    element.setAttribute('aria-label', label);
    
    // Save role if element is registered
    const meta = this.getByElement(element);
    if (meta) {
      this.saveRole(meta.ioId, role);
    }
    
    // Notify listeners
    this.notifyRoleChange(element, role);
  }
  
  /**
   * Toggle role of IO point
   */
  toggleRole(elementOrId) {
    const currentRole = this.getRole(elementOrId);
    const newRole = currentRole === 'in' ? 'out' : 'in';
    this.setRole(elementOrId, newRole);
    return newRole;
  }
  
  /**
   * Get all registered IO points
   */
  getAllIOPoints() {
    return Array.from(this.idToElement.entries()).map(([id, element]) => ({
      id,
      element,
      metadata: this.getByElement(element),
      role: this.getRole(element)
    }));
  }
  
  /**
   * Get IO points by node
   */
  getIOPointsByNode(nodeType, nodeId) {
    return this.getAllIOPoints().filter(io => 
      io.metadata.nodeType === nodeType && io.metadata.nodeId === nodeId
    );
  }
  
  /**
   * Get IO points by role
   */
  getIOPointsByRole(role) {
    return this.getAllIOPoints().filter(io => io.role === role);
  }
  
  /**
   * Check if element is registered
   */
  isRegistered(element) {
    return this.elementToMeta.has(element);
  }
  
  /**
   * Add role change listener
   */
  onRoleChange(callback) {
    this.roleChangeListeners.add(callback);
    
    return () => {
      this.roleChangeListeners.delete(callback);
    };
  }
  
  /**
   * Export all IO configurations
   */
  exportConfigurations() {
    const configurations = {};
    
    this.getAllIOPoints().forEach(io => {
      configurations[io.id] = {
        role: io.role,
        metadata: io.metadata,
        timestamp: Date.now()
      };
    });
    
    return configurations;
  }
  
  /**
   * Import IO configurations
   */
  importConfigurations(configurations) {
    if (!configurations || typeof configurations !== 'object') {
      throw new Error('Invalid configurations object');
    }
    
    Object.entries(configurations).forEach(([ioId, config]) => {
      if (config.role) {
        this.saveRole(ioId, config.role);
        
        // Update element if currently registered
        const element = this.getElementById(ioId);
        if (element) {
          this.setRole(element, config.role);
        }
      }
    });
  }
  
  /**
   * Clear all registrations
   */
  clear() {
    this.elementToMeta = new WeakMap();
    this.idToElement.clear();
  }
  
  // Private methods
  
  /**
   * Get saved role from storage
   */
  getSavedRole(ioId) {
    try {
      const saved = this.storage.getItem(`examai.io.role:${ioId}`);
      return ['in', 'out'].includes(saved) ? saved : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Save role to storage
   */
  saveRole(ioId, role) {
    try {
      this.storage.setItem(`examai.io.role:${ioId}`, role);
    } catch (error) {
      console.warn('Failed to save IO role:', error);
    }
  }
  
  /**
   * Attach role toggle functionality
   */
  attachRoleToggle(element, ioId) {
    const toggleHandler = (event) => {
      if (!event.altKey) return;
      
      event.preventDefault();
      event.stopPropagation();
      
      try {
        this.toggleRole(element);
      } catch (error) {
        console.error('Failed to toggle IO role:', error);
      }
    };
    
    element.addEventListener('click', toggleHandler, { capture: true });
    
    // Store handler for potential cleanup
    if (!element._ioToggleHandler) {
      element._ioToggleHandler = toggleHandler;
    }
  }
  
  /**
   * Notify role change listeners
   */
  notifyRoleChange(element, newRole) {
    const meta = this.getByElement(element);
    
    this.roleChangeListeners.forEach(callback => {
      try {
        callback({
          element,
          ioId: meta?.ioId,
          metadata: meta,
          newRole,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error in role change listener:', error);
      }
    });
  }
}

// Export the implementation and factory
export { IIORegistry, IORegistryImpl };

export function createIORegistry(storageProvider = null) {
  return new IORegistryImpl(storageProvider);
}
