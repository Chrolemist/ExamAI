/**
 * Refactored Link System - SOLID compliant version
 * Follows SRP - Only coordinates between geometry, events, and connection layer
 */
import { ConnectionEventManager } from '../core/connection-event-manager.js';
import { GeometryCalculator } from '../core/geometry-calculator.js';

class LinkController {
  constructor() {
    this.eventManager = new ConnectionEventManager();
    this.geometryCalculator = new GeometryCalculator();
    this.connectionLayer = null;
    this.activeLinks = new Map(); // lineId -> linkInfo
  }
  
  /**
   * Set connection layer dependency
   */
  setConnectionLayer(connectionLayer) {
    this.connectionLayer = connectionLayer;
  }
  
  /**
   * Create a new link
   */
  create({ lineId, startEl, endEl, from, to, options = {} }) {
    if (!lineId || !startEl || !endEl) {
      console.warn('Missing required parameters for link creation');
      return null;
    }
    
    // Allow connection in layer
    try {
      if (this.connectionLayer?.allow) {
        this.connectionLayer.allow(lineId);
      }
    } catch (error) {
      console.warn('Error allowing connection:', error);
    }
    
    // Create update function
    const updateLine = () => this.updateLink(lineId);
    
    // Register event listeners
    this.eventManager.registerUpdateListeners(lineId, updateLine, options.eventOptions);
    
    // Create link object
    const link = {
      lineId,
      startEl,
      endEl,
      from,
      to,
      update: updateLine,
      remove: () => this.removeLink(lineId),
      pulse: (pulseOptions = {}) => this.pulseLink(lineId, pulseOptions),
      updateLine // Backward compatibility
    };
    
    // Store link info
    this.activeLinks.set(lineId, {
      ...link,
      options,
      createdAt: Date.now()
    });
    
    // Perform initial update
    this.updateLink(lineId);
    
    return link;
  }
  
  /**
   * Update link visualization
   */
  updateLink(lineId) {
    const linkInfo = this.activeLinks.get(lineId);
    if (!linkInfo) {
      console.warn(`Link ${lineId} not found for update`);
      return;
    }
    
    try {
      if (!this.connectionLayer?.draw) {
        console.warn('Connection layer not available for drawing');
        return;
      }
      
      const startCenter = this.geometryCalculator.getElementCenter(linkInfo.startEl);
      const endCenter = this.geometryCalculator.getElementCenter(linkInfo.endEl);
      
      this.connectionLayer.draw(lineId, startCenter, endCenter, linkInfo.options);
      
    } catch (error) {
      console.warn(`Error updating link ${lineId}:`, error);
    }
  }
  
  /**
   * Remove link
   */
  removeLink(lineId) {
    const linkInfo = this.activeLinks.get(lineId);
    if (!linkInfo) return;
    
    try {
      // Clean up event listeners
      this.eventManager.cleanupListeners(lineId);
      
      // Remove from connection layer
      if (this.connectionLayer?.remove) {
        this.connectionLayer.remove(lineId);
      }
      
      // Remove from active links
      this.activeLinks.delete(lineId);
      
    } catch (error) {
      console.warn(`Error removing link ${lineId}:`, error);
    }
  }
  
  /**
   * Pulse link for visual feedback
   */
  pulseLink(lineId, options = {}) {
    try {
      if (this.connectionLayer?.pulse) {
        this.connectionLayer.pulse(lineId, options);
      }
    } catch (error) {
      console.warn(`Error pulsing link ${lineId}:`, error);
    }
  }
  
  /**
   * Update all links
   */
  updateAllLinks() {
    this.activeLinks.forEach((linkInfo, lineId) => {
      this.updateLink(lineId);
    });
  }
  
  /**
   * Remove all links
   */
  removeAllLinks() {
    const lineIds = Array.from(this.activeLinks.keys());
    lineIds.forEach(lineId => this.removeLink(lineId));
  }
  
  /**
   * Get link by ID
   */
  getLink(lineId) {
    return this.activeLinks.get(lineId);
  }
  
  /**
   * Check if link exists
   */
  hasLink(lineId) {
    return this.activeLinks.has(lineId);
  }
  
  /**
   * Get all active link IDs
   */
  getActiveLinkIds() {
    return Array.from(this.activeLinks.keys());
  }
  
  /**
   * Get links by element
   */
  getLinksByElement(element) {
    const links = [];
    
    this.activeLinks.forEach((linkInfo) => {
      if (linkInfo.startEl === element || linkInfo.endEl === element) {
        links.push(linkInfo);
      }
    });
    
    return links;
  }
  
  /**
   * Get links by node ID
   */
  getLinksByNodeId(nodeId) {
    const links = [];
    
    this.activeLinks.forEach((linkInfo) => {
      if (linkInfo.from === nodeId || linkInfo.to === nodeId) {
        links.push(linkInfo);
      }
    });
    
    return links;
  }
  
  /**
   * Trigger update for specific element's links
   */
  updateLinksForElement(element) {
    const links = this.getLinksByElement(element);
    links.forEach(linkInfo => {
      this.updateLink(linkInfo.lineId);
    });
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      activeLinks: this.activeLinks.size,
      eventManagerStats: this.eventManager.getStats(),
      hasConnectionLayer: !!this.connectionLayer,
      oldestLink: this.getOldestLinkAge(),
      newestLink: this.getNewestLinkAge()
    };
  }
  
  /**
   * Get oldest link age in milliseconds
   */
  getOldestLinkAge() {
    if (this.activeLinks.size === 0) return 0;
    
    const now = Date.now();
    let oldest = 0;
    
    this.activeLinks.forEach(linkInfo => {
      const age = now - linkInfo.createdAt;
      if (age > oldest) {
        oldest = age;
      }
    });
    
    return oldest;
  }
  
  /**
   * Get newest link age in milliseconds
   */
  getNewestLinkAge() {
    if (this.activeLinks.size === 0) return 0;
    
    const now = Date.now();
    let newest = Infinity;
    
    this.activeLinks.forEach(linkInfo => {
      const age = now - linkInfo.createdAt;
      if (age < newest) {
        newest = age;
      }
    });
    
    return newest === Infinity ? 0 : newest;
  }
}

// Create singleton instance
const linkController = new LinkController();

// Set connection layer when available
if (typeof window !== 'undefined') {
  // Try to set connection layer from global scope
  setTimeout(() => {
    if (window.ConnectionLayer) {
      linkController.setConnectionLayer(window.ConnectionLayer);
    }
  }, 0);
}

// Backward compatibility layer
export const Link = {
  create: (params) => linkController.create(params)
};

// Export controller for advanced usage
export { LinkController };
