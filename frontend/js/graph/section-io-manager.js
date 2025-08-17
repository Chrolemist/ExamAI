/**
 * Section IO Manager - Handles IO points for sections
 * Follows SRP - Only manages section connectivity
 */
class SectionIOManager {
  constructor(domManager, ioRegistry = null) {
    this.dom = domManager;
    this.ioRegistry = ioRegistry;
    this.ioPoints = new Map(); // sectionKey -> ioElement
    this.connections = new Map(); // sectionKey -> Set<connectionIds>
  }
  
  /**
   * Create IO point for a section
   */
  createIOPoint(sectionKey, parentElement, options = {}) {
    if (!sectionKey || !parentElement) {
      throw new Error('Section key and parent element are required');
    }
    
    const ioPoint = this.dom.create('span', {
      className: 'conn-point io-in section-io',
      title: options.title || 'Input',
      'data-io': options.role || 'in',
      'data-side': options.side || 'r'
    });
    
    // Append to parent
    this.dom.append(parentElement, ioPoint);
    
    // Register with IO registry if available
    if (this.ioRegistry) {
      try {
        this.ioRegistry.register(ioPoint, {
          nodeType: 'section',
          nodeId: sectionKey,
          side: options.side || 'r',
          index: options.index || 0,
          defaultRole: options.role || 'in'
        });
      } catch (error) {
        console.warn('Failed to register IO point:', error);
      }
    }
    
    // Store reference
    this.ioPoints.set(sectionKey, ioPoint);
    
    // Initialize connection tracking
    if (!this.connections.has(sectionKey)) {
      this.connections.set(sectionKey, new Set());
    }
    
    return ioPoint;
  }
  
  /**
   * Get IO point for section
   */
  getIOPoint(sectionKey) {
    return this.ioPoints.get(sectionKey);
  }
  
  /**
   * Remove IO point for section
   */
  removeIOPoint(sectionKey) {
    const ioPoint = this.ioPoints.get(sectionKey);
    if (ioPoint) {
      // Unregister from IO registry
      if (this.ioRegistry) {
        try {
          this.ioRegistry.unregister(ioPoint);
        } catch (error) {
          console.warn('Failed to unregister IO point:', error);
        }
      }
      
      // Remove from DOM
      this.dom.remove(ioPoint);
      
      // Clear references
      this.ioPoints.delete(sectionKey);
      this.connections.delete(sectionKey);
    }
  }
  
  /**
   * Add connection to section
   */
  addConnection(sectionKey, connectionId) {
    if (!this.connections.has(sectionKey)) {
      this.connections.set(sectionKey, new Set());
    }
    
    this.connections.get(sectionKey).add(connectionId);
  }
  
  /**
   * Remove connection from section
   */
  removeConnection(sectionKey, connectionId) {
    const connections = this.connections.get(sectionKey);
    if (connections) {
      connections.delete(connectionId);
    }
  }
  
  /**
   * Get all connections for section
   */
  getConnections(sectionKey) {
    const connections = this.connections.get(sectionKey);
    return connections ? Array.from(connections) : [];
  }
  
  /**
   * Check if section has connections
   */
  hasConnections(sectionKey) {
    const connections = this.connections.get(sectionKey);
    return connections && connections.size > 0;
  }
  
  /**
   * Remove all connections for section
   */
  removeAllConnections(sectionKey) {
    const connections = this.connections.get(sectionKey);
    if (connections) {
      connections.clear();
    }
  }
  
  /**
   * Get sections that have IO points
   */
  getSectionsWithIO() {
    return Array.from(this.ioPoints.keys());
  }
  
  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const stats = {};
    
    this.connections.forEach((connections, sectionKey) => {
      stats[sectionKey] = connections.size;
    });
    
    return {
      sections: Object.keys(stats).length,
      totalConnections: Object.values(stats).reduce((sum, count) => sum + count, 0),
      perSection: stats
    };
  }
  
  /**
   * Update IO point appearance based on connection state
   */
  updateIOAppearance(sectionKey) {
    const ioPoint = this.getIOPoint(sectionKey);
    if (!ioPoint) return;
    
    const hasConnections = this.hasConnections(sectionKey);
    
    if (hasConnections) {
      this.dom.addClass(ioPoint, 'connected');
      this.dom.removeClass(ioPoint, 'disconnected');
    } else {
      this.dom.addClass(ioPoint, 'disconnected');
      this.dom.removeClass(ioPoint, 'connected');
    }
  }
  
  /**
   * Validate IO point configuration
   */
  validateIOPoint(sectionKey) {
    const ioPoint = this.getIOPoint(sectionKey);
    if (!ioPoint) return false;
    
    // Check required attributes
    const requiredAttrs = ['data-io', 'data-side'];
    return requiredAttrs.every(attr => ioPoint.hasAttribute(attr));
  }
  
  /**
   * Cleanup all IO points
   */
  destroy() {
    // Remove all IO points
    Array.from(this.ioPoints.keys()).forEach(sectionKey => {
      this.removeIOPoint(sectionKey);
    });
    
    // Clear all data
    this.ioPoints.clear();
    this.connections.clear();
  }
}
