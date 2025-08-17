/**
 * Path Calculator - Handles path generation for connections
 * Follows SRP - Only responsible for calculating SVG paths
 */
class PathCalculator {
  constructor() {
    this.defaultCurveIntensity = { min: 30, max: 200, factor: 0.5 };
  }
  
  /**
   * Calculate SVG path between two points
   */
  calculatePath(pointA, pointB, options = {}) {
    const {
      curveIntensity = this.defaultCurveIntensity,
      pathType = 'curved'
    } = options;
    
    switch (pathType) {
      case 'straight':
        return this.calculateStraightPath(pointA, pointB);
      case 'curved':
      default:
        return this.calculateCurvedPath(pointA, pointB, curveIntensity);
    }
  }
  
  /**
   * Calculate straight line path
   */
  calculateStraightPath(pointA, pointB) {
    return `M ${pointA.x},${pointA.y} L ${pointB.x},${pointB.y}`;
  }
  
  /**
   * Calculate curved path with bezier curves
   */
  calculateCurvedPath(pointA, pointB, curveIntensity) {
    const deltaX = Math.abs(pointB.x - pointA.x);
    const deltaY = Math.abs(pointB.y - pointA.y);
    
    const curveStrength = Math.max(
      curveIntensity.min,
      Math.min(
        curveIntensity.max,
        Math.max(deltaX, deltaY) * curveIntensity.factor
      )
    );
    
    // Flip curve direction when going leftwards
    const direction = (pointB.x >= pointA.x) ? 1 : -1;
    
    const controlPoint1X = pointA.x + (curveStrength * direction);
    const controlPoint2X = pointB.x - (curveStrength * direction);
    
    return `M ${pointA.x},${pointA.y} C ${controlPoint1X},${pointA.y} ${controlPoint2X},${pointB.y} ${pointB.x},${pointB.y}`;
  }
  
  /**
   * Calculate path with custom control points
   */
  calculateCustomPath(pointA, pointB, controlPoint1, controlPoint2) {
    return `M ${pointA.x},${pointA.y} C ${controlPoint1.x},${controlPoint1.y} ${controlPoint2.x},${controlPoint2.y} ${pointB.x},${pointB.y}`;
  }
  
  /**
   * Calculate arc path
   */
  calculateArcPath(pointA, pointB, radius = 50, largeArc = false, sweep = true) {
    const largeArcFlag = largeArc ? 1 : 0;
    const sweepFlag = sweep ? 1 : 0;
    
    return `M ${pointA.x},${pointA.y} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${pointB.x},${pointB.y}`;
  }
  
  /**
   * Set default curve intensity
   */
  setDefaultCurveIntensity(intensity) {
    this.defaultCurveIntensity = { ...this.defaultCurveIntensity, ...intensity };
  }
  
  /**
   * Get path bounds (approximate)
   */
  getPathBounds(pointA, pointB) {
    return {
      minX: Math.min(pointA.x, pointB.x),
      maxX: Math.max(pointA.x, pointB.x),
      minY: Math.min(pointA.y, pointB.y),
      maxY: Math.max(pointA.y, pointB.y),
      width: Math.abs(pointB.x - pointA.x),
      height: Math.abs(pointB.y - pointA.y)
    };
  }
}

export { PathCalculator };
