/**
 * SVG Renderer - Handles SVG element creation and management
 * Follows SRP - Only responsible for SVG element manipulation
 */
class SVGRenderer {
  constructor() {
    this.svgElement = null;
    this.defsCreated = false;
  }
  
  /**
   * Ensure SVG container exists
   */
  ensureContainer() {
    if (this.svgElement) return this.svgElement;
    
    this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgElement.setAttribute('id', 'connLayer');
    this.svgElement.setAttribute('width', '100%');
    this.svgElement.setAttribute('height', '100%');
    this.svgElement.style.position = 'fixed';
    this.svgElement.style.inset = '0';
    this.svgElement.style.pointerEvents = 'none';
    
    document.body.appendChild(this.svgElement);
    
    return this.svgElement;
  }
  
  /**
   * Create path element
   */
  createPath(id) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    element.setAttribute('data-id', id);
    element.setAttribute('fill', 'none');
    element.setAttribute('stroke', 'url(#gradLine)');
    element.setAttribute('stroke-width', '2');
    element.setAttribute('stroke-linecap', 'round');
    
    return element;
  }
  
  /**
   * Ensure gradient definitions exist
   */
  ensureGradientDefs() {
    if (this.defsCreated) return;
    
    const container = this.ensureContainer();
    if (container.querySelector('defs')) {
      this.defsCreated = true;
      return;
    }
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = this.createLinearGradient();
    
    defs.appendChild(grad);
    container.appendChild(defs);
    
    this.defsCreated = true;
  }
  
  /**
   * Create linear gradient for connections
   */
  createLinearGradient() {
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.setAttribute('id', 'gradLine');
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '1');
    grad.setAttribute('y2', '1');
    
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#7c5cff');
    
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#00d4ff');
    
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    
    return grad;
  }
  
  /**
   * Find path element by ID
   */
  findPath(id) {
    if (!this.svgElement) return null;
    return this.svgElement.querySelector(`path[data-id="${id}"]`);
  }
  
  /**
   * Add element to container
   */
  appendChild(element) {
    const container = this.ensureContainer();
    container.appendChild(element);
  }
  
  /**
   * Remove element from container
   */
  removeElement(element) {
    if (element && element.remove) {
      element.remove();
    }
  }
  
  /**
   * Query elements by selector
   */
  querySelector(selector) {
    if (!this.svgElement) return null;
    return this.svgElement.querySelector(selector);
  }
}

export { SVGRenderer };
