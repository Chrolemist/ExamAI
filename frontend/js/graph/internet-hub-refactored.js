/**
 * Refactored Internet Hub - SOLID compliant version
 * Follows SRP - Only coordinates between UI and connection management
 */
import { InternetConnectionManager } from '../core/internet-connection-manager.js';
import { InternetHubUIManager } from '../core/internet-hub-ui-manager.js';
import { LinkManager } from '../core/link-manager.js';
import { DOMManager } from '../core/dom-manager.js';
import { LocalStorageProvider } from '../core/storage-provider.js';

class InternetHubController {
  constructor() {
    // Initialize dependencies
    this.storageProvider = new LocalStorageProvider();
    this.domManager = new DOMManager();
    this.linkManager = new LinkManager(this.storageProvider);
    this.connectionManager = new InternetConnectionManager(this.linkManager);
    this.uiManager = new InternetHubUIManager(this.domManager);
    
    // Set up link manager dependencies
    this.setupDependencies();
    
    // Wire up event handlers
    this.wireEvents();
  }
  
  /**
   * Setup dependencies for link manager
   */
  setupDependencies() {
    // Set dependencies when available
    if (window.ConnectionLayer && window.IORegistry && window.GraphPersistence) {
      this.linkManager.setDependencies({
        connectionLayer: window.ConnectionLayer,
        ioRegistry: window.IORegistry,
        graphPersistence: window.GraphPersistence
      });
    }
  }
  
  /**
   * Wire up event handlers between components
   */
  wireEvents() {
    // UI requests unlink all
    this.uiManager.eventBus = {
      emit: (eventName, data) => {
        if (eventName === 'unlink-all-requested') {
          this.connectionManager.unlinkAll();
        }
      }
    };
  }
  
  /**
   * Get the hub element (create if needed)
   */
  element() {
    return this.uiManager.getElement();
  }
  
  /**
   * Link a copilot to the internet hub
   */
  linkCopilot(copilot, startElementOrSide = null, endElementOrSide = null) {
    // Resolve elements
    const startElement = this.resolveElement(startElementOrSide, copilot?.fab);
    const endElement = this.resolveElement(endElementOrSide, this.element());
    
    return this.connectionManager.linkCopilot(copilot, startElement, endElement);
  }
  
  /**
   * Unlink a copilot from the internet hub
   */
  unlinkCopilot(copilot) {
    return this.connectionManager.unlinkCopilot(copilot);
  }
  
  /**
   * Unlink all copilots from internet hub
   */
  unlinkAll() {
    return this.connectionManager.unlinkAll();
  }
  
  /**
   * Check if copilot is linked to internet hub
   */
  isLinked(copilotId) {
    return this.connectionManager.isLinked(copilotId);
  }
  
  /**
   * Set hub active state
   */
  setActive(isActive) {
    this.uiManager.setActiveState(isActive);
  }
  
  /**
   * Get the link key used for internet connections
   */
  get LINK_KEY() {
    return this.connectionManager.LINK_KEY;
  }
  
  /**
   * Resolve element from parameter (element or side string)
   */
  resolveElement(elementOrSide, fallbackElement) {
    // If it's already an element, return it
    if (elementOrSide && typeof elementOrSide.getBoundingClientRect === 'function') {
      return elementOrSide;
    }
    
    // If it's a string, try to find connection point
    if (typeof elementOrSide === 'string' && fallbackElement) {
      const connectionPoint = fallbackElement.querySelector(
        `.conn-point[data-side="${elementOrSide}"]`
      );
      if (connectionPoint) {
        return connectionPoint;
      }
    }
    
    // Return fallback element
    return fallbackElement;
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      ui: {
        elementExists: !!this.uiManager.hubElement,
        menuAttached: this.uiManager.menuAttached
      },
      connections: this.connectionManager.getStats(),
      linkManager: this.linkManager.getStats()
    };
  }
}

// Create singleton instance
const internetHubController = new InternetHubController();

// Backward compatibility layer
export const InternetHub = {
  element: () => internetHubController.element(),
  linkCopilot: (copilot, start, end) => internetHubController.linkCopilot(copilot, start, end),
  unlinkCopilot: (copilot) => internetHubController.unlinkCopilot(copilot),
  unlinkAll: () => internetHubController.unlinkAll(),
  isLinked: (copilotId) => internetHubController.isLinked(copilotId),
  setActive: (isActive) => internetHubController.setActive(isActive),
  LINK_KEY: internetHubController.LINK_KEY
};
