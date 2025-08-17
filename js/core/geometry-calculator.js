/**
 * Geometry Calculator - Handles geometric calculations for UI elements
 * Follows SRP - Only responsible for geometric calculations
 */
class GeometryCalculator {
  constructor() {
    this.defaultOptions = {
      includeMargins: false,
      includePadding: false,
      relativeTo: 'viewport'
    };
  }
  
  /**
   * Get center point of an element
   */
  getElementCenter(element, options = {}) {
    if (!element || !element.getBoundingClientRect) {
      return { x: 0, y: 0 };
    }
    
    const {
      includeMargins = this.defaultOptions.includeMargins,
      relativeTo = this.defaultOptions.relativeTo
    } = options;
    
    const rect = element.getBoundingClientRect();
    
    let centerX = rect.left + rect.width / 2;
    let centerY = rect.top + rect.height / 2;
    
    // Adjust for margins if requested
    if (includeMargins) {
      const computedStyle = window.getComputedStyle(element);
      const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
      const marginTop = parseFloat(computedStyle.marginTop) || 0;
      const marginRight = parseFloat(computedStyle.marginRight) || 0;
      const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
      
      centerX += (marginLeft - marginRight) / 2;
      centerY += (marginTop - marginBottom) / 2;
    }
    
    // Adjust relative positioning if needed
    if (relativeTo !== 'viewport') {
      const adjustment = this.getRelativeOffset(relativeTo);
      centerX += adjustment.x;
      centerY += adjustment.y;
    }
    
    return { x: centerX, y: centerY };
  }
  
  /**
   * Get element bounds
   */
  getElementBounds(element, options = {}) {
    if (!element || !element.getBoundingClientRect) {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
    
    const rect = element.getBoundingClientRect();
    const {
      includeMargins = this.defaultOptions.includeMargins,
      includePadding = this.defaultOptions.includePadding
    } = options;
    
    let bounds = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
    
    if (includeMargins || includePadding) {
      const computedStyle = window.getComputedStyle(element);
      
      if (includeMargins) {
        const marginLeft = parseFloat(computedStyle.marginLeft) || 0;
        const marginTop = parseFloat(computedStyle.marginTop) || 0;
        const marginRight = parseFloat(computedStyle.marginRight) || 0;
        const marginBottom = parseFloat(computedStyle.marginBottom) || 0;
        
        bounds.left -= marginLeft;
        bounds.top -= marginTop;
        bounds.right += marginRight;
        bounds.bottom += marginBottom;
        bounds.width += marginLeft + marginRight;
        bounds.height += marginTop + marginBottom;
      }
      
      if (includePadding) {
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        
        // For padding, we typically want the inner bounds
        bounds.left += paddingLeft;
        bounds.top += paddingTop;
        bounds.right -= paddingRight;
        bounds.bottom -= paddingBottom;
        bounds.width -= paddingLeft + paddingRight;
        bounds.height -= paddingTop + paddingBottom;
      }
    }
    
    return bounds;
  }
  
  /**
   * Calculate distance between two points
   */
  calculateDistance(point1, point2) {
    const deltaX = point2.x - point1.x;
    const deltaY = point2.y - point1.y;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }
  
  /**
   * Calculate distance between two elements
   */
  calculateElementDistance(element1, element2, options = {}) {
    const center1 = this.getElementCenter(element1, options);
    const center2 = this.getElementCenter(element2, options);
    return this.calculateDistance(center1, center2);
  }
  
  /**
   * Check if point is within element bounds
   */
  isPointInElement(point, element, tolerance = 0) {
    const bounds = this.getElementBounds(element);
    
    return (
      point.x >= bounds.left - tolerance &&
      point.x <= bounds.right + tolerance &&
      point.y >= bounds.top - tolerance &&
      point.y <= bounds.bottom + tolerance
    );
  }
  
  /**
   * Find closest element to a point from a list of elements
   */
  findClosestElement(point, elements, options = {}) {
    if (!elements || elements.length === 0) return null;
    
    let closestElement = null;
    let closestDistance = Infinity;
    
    elements.forEach(element => {
      const center = this.getElementCenter(element, options);
      const distance = this.calculateDistance(point, center);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestElement = element;
      }
    });
    
    return {
      element: closestElement,
      distance: closestDistance,
      center: this.getElementCenter(closestElement, options)
    };
  }
  
  /**
   * Calculate angle between two points (in radians)
   */
  calculateAngle(point1, point2) {
    const deltaX = point2.x - point1.x;
    const deltaY = point2.y - point1.y;
    return Math.atan2(deltaY, deltaX);
  }
  
  /**
   * Calculate angle between two elements
   */
  calculateElementAngle(element1, element2, options = {}) {
    const center1 = this.getElementCenter(element1, options);
    const center2 = this.getElementCenter(element2, options);
    return this.calculateAngle(center1, center2);
  }
  
  /**
   * Get relative offset for positioning calculations
   */
  getRelativeOffset(relativeTo) {
    // This could be extended to handle different coordinate systems
    switch (relativeTo) {
      case 'document':
        return { x: -window.scrollX, y: -window.scrollY };
      case 'viewport':
      default:
        return { x: 0, y: 0 };
    }
  }
  
  /**
   * Normalize angle to 0-2π range
   */
  normalizeAngle(angle) {
    while (angle < 0) angle += 2 * Math.PI;
    while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
    return angle;
  }
  
  /**
   * Convert radians to degrees
   */
  radiansToDegrees(radians) {
    return radians * (180 / Math.PI);
  }
  
  /**
   * Convert degrees to radians
   */
  degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  /**
   * Get viewport dimensions
   */
  getViewportDimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }
  
  /**
   * Get document dimensions
   */
  getDocumentDimensions() {
    return {
      width: Math.max(
        document.body.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.clientWidth,
        document.documentElement.scrollWidth,
        document.documentElement.offsetWidth
      ),
      height: Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
    };
  }
}

export { GeometryCalculator };
