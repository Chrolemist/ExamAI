/**
 * Refactored Connection Layer - SOLID compliant version
 * Follows SRP - Only coordinates between rendering, path calculation, and animation
 */
import { SVGRenderer } from '../core/svg-renderer.js';
import { PathCalculator } from '../core/path-calculator.js';
import { ConnectionAnimator } from '../core/connection-animator.js';

class ConnectionLayerController {
  constructor() {
    // Initialize components
    this.svgRenderer = new SVGRenderer();
    this.pathCalculator = new PathCalculator();
    this.animator = new ConnectionAnimator(this.svgRenderer);
    
    // Track allowed connections
    this.allowedConnections = new Set();
  }
  
  /**
   * Allow a connection to be drawn
   */
  allow(connectionId) {
    this.allowedConnections.add(String(connectionId));
  }
  
  /**
   * Disallow a connection from being drawn
   */
  disallow(connectionId) {
    this.allowedConnections.delete(String(connectionId));
  }
  
  /**
   * Check if connection is allowed
   */
  isAllowed(connectionId) {
    return this.allowedConnections.has(String(connectionId));
  }
  
  /**
   * Draw connection between two points
   */
  draw(connectionId, pointA, pointB, options = {}) {
    const id = String(connectionId);
    
    // Guard against stale listeners
    if (!this.isAllowed(id)) {
      return;
    }
    
    // Ensure SVG container and gradient defs exist
    this.svgRenderer.ensureContainer();
    this.svgRenderer.ensureGradientDefs();
    
    // Find or create path element
    let pathElement = this.svgRenderer.findPath(id);
    if (!pathElement) {
      pathElement = this.svgRenderer.createPath(id);
      this.svgRenderer.appendChild(pathElement);
    }
    
    // Calculate and set path
    const pathData = this.pathCalculator.calculatePath(pointA, pointB, options.pathOptions);
    pathElement.setAttribute('d', pathData);
    
    // Apply animation if needed
    if (options.animate) {
      this.animator.fadeIn(id, options.animate.duration);
    }
  }
  
  /**
   * Remove connection
   */
  remove(connectionId) {
    const id = String(connectionId);
    
    // Stop any active animations
    this.animator.stopAnimation(id);
    
    // Disallow further drawing
    this.disallow(id);
    
    // Remove path element
    const pathElement = this.svgRenderer.findPath(id);
    if (pathElement) {
      this.svgRenderer.removeElement(pathElement);
    }
  }
  
  /**
   * Create pulse animation on connection
   */
  pulse(connectionId, options = {}) {
    const id = String(connectionId);
    
    // Validate connection exists
    if (!this.svgRenderer.findPath(id)) {
      console.warn(`Cannot pulse connection ${id}: path not found`);
      return;
    }
    
    this.animator.pulse(id, options);
  }
  
  /**
   * Highlight connection
   */
  highlight(connectionId, options = {}) {
    const id = String(connectionId);
    this.animator.highlight(id, options);
  }
  
  /**
   * Fade out and remove connection
   */
  async fadeOutAndRemove(connectionId, duration = 500) {
    const id = String(connectionId);
    
    await this.animator.fadeOut(id, duration);
    this.remove(id);
  }
  
  /**
   * Check if connection exists
   */
  exists(connectionId) {
    const id = String(connectionId);
    return !!this.svgRenderer.findPath(id);
  }
  
  /**
   * Get all active connection IDs
   */
  getActiveConnections() {
    const container = this.svgRenderer.svgElement;
    if (!container) return [];
    
    const paths = container.querySelectorAll('path[data-id]');
    return Array.from(paths).map(path => path.getAttribute('data-id'));
  }
  
  /**
   * Clear all connections
   */
  clearAll() {
    // Stop all animations
    this.animator.stopAllAnimations();
    
    // Get all active connections and remove them
    const connections = this.getActiveConnections();
    connections.forEach(id => this.remove(id));
    
    // Clear allowed set
    this.allowedConnections.clear();
  }
  
  /**
   * Update path calculation settings
   */
  updatePathSettings(settings) {
    this.pathCalculator.setDefaultCurveIntensity(settings);
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      allowedConnections: this.allowedConnections.size,
      activeConnections: this.getActiveConnections().length,
      activeAnimations: this.animator.getActiveAnimationCount(),
      hasContainer: !!this.svgRenderer.svgElement
    };
  }
}

// Create singleton instance
const connectionLayerController = new ConnectionLayerController();

// Backward compatibility layer
export const ConnectionLayer = {
  allow: (id) => connectionLayerController.allow(id),
  disallow: (id) => connectionLayerController.disallow(id),
  draw: (id, a, b, options) => connectionLayerController.draw(id, a, b, options),
  remove: (id) => connectionLayerController.remove(id),
  pulse: (id, options) => connectionLayerController.pulse(id, options),
  exists: (id) => connectionLayerController.exists(id),
  
  // Additional methods for enhanced functionality
  highlight: (id, options) => connectionLayerController.highlight(id, options),
  fadeOutAndRemove: (id, duration) => connectionLayerController.fadeOutAndRemove(id, duration),
  clearAll: () => connectionLayerController.clearAll(),
  getStats: () => connectionLayerController.getStats()
};
