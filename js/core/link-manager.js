/**
 * Link Management System - Handles creation and management of visual connections
 * Follows SRP - Only manages link creation, persistence, and lifecycle
 */
class LinkManager {
  constructor(storageProvider, eventBus = null) {
    this.storageProvider = storageProvider;
    this.eventBus = eventBus;
    this.connectionLayer = null;
    this.ioRegistry = null;
    this.graphPersistence = null;
  }
  
  /**
   * Set dependencies (Dependency Injection)
   */
  setDependencies({ connectionLayer, ioRegistry, graphPersistence }) {
    this.connectionLayer = connectionLayer;
    this.ioRegistry = ioRegistry;
    this.graphPersistence = graphPersistence;
  }
  
  /**
   * Create a link between two elements
   */
  createLink({ source, target, linkKey = null }) {
    try {
      const anchors = this.resolveAnchors(source, target);
      const lineId = this.generateLineId(anchors.source, anchors.target);
      
      // Check for existing link
      if (this.linkExists(lineId)) {
        return {
          success: false,
          reason: 'duplicate',
          lineId
        };
      }
      
      // Create visual connection
      const connection = this.createVisualConnection({
        lineId,
        startElement: anchors.source.element,
        endElement: anchors.target.element,
        source: source,
        target: target
      });
      
      // Persist the link
      this.persistLink(anchors.source, anchors.target);
      
      // Emit creation event
      this.emitEvent('link-created', {
        lineId,
        source,
        target,
        connection
      });
      
      return {
        success: true,
        lineId,
        connection,
        anchors
      };
      
    } catch (error) {
      console.error('Error creating link:', error);
      return {
        success: false,
        reason: 'error',
        error: error.message
      };
    }
  }
  
  /**
   * Resolve anchor elements and positions
   */
  resolveAnchors(source, target) {
    const sourceAnchor = this.resolveAnchor(source);
    const targetAnchor = this.resolveAnchor(target);
    
    return {
      source: sourceAnchor,
      target: targetAnchor
    };
  }
  
  /**
   * Resolve a single anchor
   */
  resolveAnchor(nodeInfo) {
    const { type, id, element } = nodeInfo;
    
    // If element is provided and valid, use it
    if (this.isValidElement(element)) {
      return {
        element,
        side: element.getAttribute?.('data-side') || 'x',
        ioId: this.getIoId(element, type, id)
      };
    }
    
    // Try to find element by type and id
    const foundElement = this.findElementByTypeAndId(type, id);
    if (foundElement) {
      return {
        element: foundElement,
        side: foundElement.getAttribute?.('data-side') || 'x',
        ioId: this.getIoId(foundElement, type, id)
      };
    }
    
    // Fallback: try to get main element
    const fallbackElement = this.getFallbackElement(type, id);
    return {
      element: fallbackElement,
      side: 'x',
      ioId: this.getIoId(fallbackElement, type, id)
    };
  }
  
  /**
   * Check if element is valid for connection
   */
  isValidElement(element) {
    return element && typeof element.getBoundingClientRect === 'function';
  }
  
  /**
   * Find element by type and id
   */
  findElementByTypeAndId(type, id) {
    switch (type) {
      case 'copilot':
        const copilot = window.CopilotManager?.instances?.get(id);
        return copilot?.fab;
        
      case 'user':
        return window.userInst?.fab;
        
      case 'internet':
        return document.getElementById('internetHub');
        
      case 'section':
        return document.querySelector(`[data-section-key="${id}"]`);
        
      default:
        return null;
    }
  }
  
  /**
   * Get fallback element when specific element not found
   */
  getFallbackElement(type, id) {
    // Same as findElementByTypeAndId for now
    return this.findElementByTypeAndId(type, id);
  }
  
  /**
   * Get IO ID for element
   */
  getIoId(element, type, id) {
    if (!element) return `${type}:${id}:x:0`;
    
    // Try to get from IORegistry
    const registryInfo = this.ioRegistry?.getByEl?.(element);
    if (registryInfo?.ioId) {
      return registryInfo.ioId;
    }
    
    // Generate fallback IO ID
    const side = element.getAttribute?.('data-side') || 'x';
    return `${type}:${id}:${side}:0`;
  }
  
  /**
   * Generate unique line ID
   */
  generateLineId(sourceAnchor, targetAnchor) {
    return `link_${sourceAnchor.ioId}__${targetAnchor.ioId}`;
  }
  
  /**
   * Check if link already exists
   */
  linkExists(lineId) {
    // Check with ConnectionLayer if available
    return this.connectionLayer?.exists?.(lineId) || false;
  }
  
  /**
   * Create visual connection using Link class
   */
  createVisualConnection({ lineId, startElement, endElement, source, target }) {
    // Use global Link class for backward compatibility
    if (window.Link?.create) {
      return window.Link.create({
        lineId,
        startEl: startElement,
        endEl: endElement,
        from: source.id,
        to: target.id
      });
    }
    
    // Fallback: create minimal connection object
    return {
      lineId,
      startElement,
      endElement,
      update: () => {},
      remove: () => {
        this.connectionLayer?.remove?.(lineId);
      }
    };
  }
  
  /**
   * Persist link to storage
   */
  persistLink(sourceAnchor, targetAnchor) {
    if (!this.graphPersistence?.addLink) return;
    
    try {
      // Extract type and id from ioId
      const sourceInfo = this.parseIoId(sourceAnchor.ioId);
      const targetInfo = this.parseIoId(targetAnchor.ioId);
      
      this.graphPersistence.addLink({
        fromType: sourceInfo.type,
        fromId: sourceInfo.id,
        fromSide: sourceAnchor.side,
        toType: targetInfo.type,
        toId: targetInfo.id,
        toSide: targetAnchor.side
      });
      
    } catch (error) {
      console.warn('Could not persist link:', error);
    }
  }
  
  /**
   * Parse IO ID to extract type and id
   */
  parseIoId(ioId) {
    const parts = ioId.split(':');
    return {
      type: parts[0] || 'unknown',
      id: parts[1] || '0',
      side: parts[2] || 'x',
      index: parts[3] || '0'
    };
  }
  
  /**
   * Remove a link
   */
  removeLink(lineId) {
    try {
      // Remove visual connection
      this.connectionLayer?.remove?.(lineId);
      
      // Remove from persistence would need more context
      // This would typically be handled by the calling code
      
      this.emitEvent('link-removed', { lineId });
      
      return true;
    } catch (error) {
      console.error('Error removing link:', error);
      return false;
    }
  }
  
  /**
   * Remove persistent link by criteria
   */
  removePersistentLink(criteria) {
    if (!this.graphPersistence?.removeWhere) return;
    
    try {
      this.graphPersistence.removeWhere(link => {
        return Object.keys(criteria).every(key => {
          return link[key] === criteria[key];
        });
      });
    } catch (error) {
      console.warn('Could not remove persistent link:', error);
    }
  }
  
  /**
   * Pulse a connection for visual feedback
   */
  pulseConnection(lineId, options = {}) {
    try {
      this.connectionLayer?.pulse?.(lineId, {
        duration: 700,
        ...options
      });
    } catch (error) {
      console.warn('Could not pulse connection:', error);
    }
  }
  
  /**
   * Get link statistics
   */
  getStats() {
    return {
      // Could be extended with more detailed statistics
      hasConnectionLayer: !!this.connectionLayer,
      hasIoRegistry: !!this.ioRegistry,
      hasGraphPersistence: !!this.graphPersistence
    };
  }
  
  /**
   * Emit event if event bus is available
   */
  emitEvent(eventName, data) {
    if (this.eventBus) {
      this.eventBus.emit(eventName, data);
    }
  }
}

export { LinkManager };
