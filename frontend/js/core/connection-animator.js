/**
 * Connection Animator - Handles visual effects for connections
 * Follows SRP - Only responsible for connection animations and effects
 */
class ConnectionAnimator {
  constructor(svgRenderer) {
    this.svgRenderer = svgRenderer;
    this.activeAnimations = new Map(); // id -> { interval, timeout }
  }
  
  /**
   * Create pulse animation on connection
   */
  pulse(connectionId, options = {}) {
    const {
      strokeColor = '#00d4ff',
      strokeWidth = 3,
      opacity = 0.95,
      dashArray = '10 14',
      duration = 1400,
      step = 22,
      reverse = false
    } = options;
    
    // Find the base path element
    const basePath = this.svgRenderer.findPath(connectionId);
    if (!basePath) {
      console.warn(`Connection ${connectionId} not found for pulse animation`);
      return;
    }
    
    // Stop any existing animation for this connection
    this.stopAnimation(connectionId);
    
    // Create overlay for animation
    const overlay = this.createAnimationOverlay(basePath, {
      strokeColor,
      strokeWidth,
      opacity,
      dashArray,
      connectionId
    });
    
    // Start the animation
    this.startPulseAnimation(overlay, connectionId, {
      step: reverse ? -step : step,
      duration
    });
  }
  
  /**
   * Create animation overlay element
   */
  createAnimationOverlay(basePath, options) {
    const overlay = basePath.cloneNode(false);
    
    // Remove base path attributes and add animation-specific ones
    overlay.removeAttribute('data-id');
    overlay.setAttribute('data-flow-of', options.connectionId);
    overlay.setAttribute('stroke', options.strokeColor);
    overlay.setAttribute('stroke-width', String(options.strokeWidth));
    overlay.setAttribute('opacity', String(options.opacity));
    overlay.setAttribute('stroke-dasharray', options.dashArray);
    
    this.svgRenderer.appendChild(overlay);
    
    return overlay;
  }
  
  /**
   * Start pulse animation
   */
  startPulseAnimation(overlay, connectionId, options) {
    let offset = 0;
    
    // Animation loop
    const interval = setInterval(() => {
      offset += options.step;
      overlay.setAttribute('stroke-dashoffset', String(offset));
    }, 30);
    
    // Cleanup after duration
    const timeout = setTimeout(() => {
      this.stopAnimation(connectionId);
    }, options.duration);
    
    // Track active animation
    this.activeAnimations.set(connectionId, { 
      interval, 
      timeout, 
      overlay 
    });
  }
  
  /**
   * Stop animation for specific connection
   */
  stopAnimation(connectionId) {
    const animation = this.activeAnimations.get(connectionId);
    if (!animation) return;
    
    // Clear timers
    if (animation.interval) {
      clearInterval(animation.interval);
    }
    if (animation.timeout) {
      clearTimeout(animation.timeout);
    }
    
    // Remove overlay element
    if (animation.overlay) {
      this.svgRenderer.removeElement(animation.overlay);
    }
    
    // Remove from tracking
    this.activeAnimations.delete(connectionId);
  }
  
  /**
   * Stop all animations
   */
  stopAllAnimations() {
    const connectionIds = Array.from(this.activeAnimations.keys());
    connectionIds.forEach(id => this.stopAnimation(id));
  }
  
  /**
   * Create fade in animation
   */
  fadeIn(connectionId, duration = 500) {
    const path = this.svgRenderer.findPath(connectionId);
    if (!path) return;
    
    path.style.opacity = '0';
    path.style.transition = `opacity ${duration}ms ease-in-out`;
    
    // Trigger fade in
    setTimeout(() => {
      path.style.opacity = '1';
    }, 10);
    
    // Clean up transition after animation
    setTimeout(() => {
      path.style.transition = '';
    }, duration + 50);
  }
  
  /**
   * Create fade out animation
   */
  fadeOut(connectionId, duration = 500) {
    return new Promise((resolve) => {
      const path = this.svgRenderer.findPath(connectionId);
      if (!path) {
        resolve();
        return;
      }
      
      path.style.transition = `opacity ${duration}ms ease-in-out`;
      path.style.opacity = '0';
      
      setTimeout(() => {
        path.style.transition = '';
        resolve();
      }, duration);
    });
  }
  
  /**
   * Create highlight effect
   */
  highlight(connectionId, options = {}) {
    const {
      color = '#ffff00',
      width = 4,
      duration = 2000
    } = options;
    
    const path = this.svgRenderer.findPath(connectionId);
    if (!path) return;
    
    // Store original values
    const originalStroke = path.getAttribute('stroke');
    const originalWidth = path.getAttribute('stroke-width');
    
    // Apply highlight
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', String(width));
    
    // Restore after duration
    setTimeout(() => {
      path.setAttribute('stroke', originalStroke);
      path.setAttribute('stroke-width', originalWidth);
    }, duration);
  }
  
  /**
   * Get active animation count
   */
  getActiveAnimationCount() {
    return this.activeAnimations.size;
  }
  
  /**
   * Get active animation IDs
   */
  getActiveAnimationIds() {
    return Array.from(this.activeAnimations.keys());
  }
  
  /**
   * Check if connection has active animation
   */
  hasActiveAnimation(connectionId) {
    return this.activeAnimations.has(connectionId);
  }
}

// Make ConnectionAnimator available globally
window.ConnectionAnimator = ConnectionAnimator;
