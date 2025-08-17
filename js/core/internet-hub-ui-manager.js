/**
 * Internet Hub UI Manager - Manages the visual representation and user interaction
 * Follows SRP - Only manages the UI aspects of the internet hub
 */
class InternetHubUIManager {
  constructor(domManager, eventBus = null) {
    this.domManager = domManager;
    this.eventBus = eventBus;
    this.hubElement = null;
    this.menuAttached = false;
  }
  
  /**
   * Create and return the internet hub element
   */
  createHubElement() {
    if (this.hubElement) {
      return this.hubElement;
    }
    
    const config = this.getHubConfig();
    const element = this.domManager.createElement('div', {
      id: 'internetHub',
      className: 'internet-hub fab',
      title: 'Internet',
      innerHTML: this.getHubSVG()
    });
    
    // Apply positioning
    this.domManager.setStyles(element, config.styles);
    
    // Add connection points
    this.addConnectionPoints(element);
    
    // Mount to appropriate container
    this.mountHub(element);
    
    // Register with NodeBoard if available
    this.registerWithNodeBoard(element);
    
    // Attach context menu
    this.attachContextMenu(element);
    
    this.hubElement = element;
    
    this.emitEvent('hub-created', { element });
    
    return element;
  }
  
  /**
   * Get hub configuration
   */
  getHubConfig() {
    return {
      styles: {
        left: '2px',  // Relative to Node Board padding
        top: '40px',  // Relative to Node Board
        right: 'auto',
        bottom: 'auto'
      },
      connectionSides: ['t', 'b', 'l', 'r']
    };
  }
  
  /**
   * Get hub SVG markup
   */
  getHubSVG() {
    return `
      <svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="url(#gradHub)" stroke-width="1.6">
          <defs>
            <linearGradient id="gradHub" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="9"/>
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>
        </g>
      </svg>
    `;
  }
  
  /**
   * Add connection points to hub element
   */
  addConnectionPoints(hubElement) {
    const config = this.getHubConfig();
    
    config.connectionSides.forEach(side => {
      const connectionPoint = this.domManager.createElement('div', {
        className: 'conn-point io-in',
        'data-side': side
      });
      
      hubElement.appendChild(connectionPoint);
    });
  }
  
  /**
   * Mount hub to appropriate container
   */
  mountHub(hubElement) {
    const nodeBoard = this.domManager.getElementById('nodeBoard');
    const container = nodeBoard || document.body;
    
    container.appendChild(hubElement);
    
    this.emitEvent('hub-mounted', { 
      element: hubElement, 
      container: container.id || 'body' 
    });
  }
  
  /**
   * Register hub with NodeBoard if available
   */
  registerWithNodeBoard(hubElement) {
    try {
      window.NodeBoard?.bind?.(hubElement);
      window.NodeBoard?.onMoved?.(hubElement);
    } catch (error) {
      console.warn('Could not register with NodeBoard:', error);
    }
  }
  
  /**
   * Attach context menu to hub
   */
  attachContextMenu(hubElement) {
    if (this.menuAttached) return;
    
    hubElement.addEventListener('contextmenu', (event) => {
      this.handleContextMenu(event);
    });
    
    this.menuAttached = true;
  }
  
  /**
   * Handle context menu interaction
   */
  handleContextMenu(event) {
    event.preventDefault();
    
    const menu = this.createContextMenu();
    const position = this.calculateMenuPosition(event);
    
    this.domManager.setStyles(menu, {
      left: `${position.left}px`,
      top: `${position.top}px`
    });
    
    document.body.appendChild(menu);
    menu.classList.add('show');
    
    // Setup menu handlers
    this.setupMenuHandlers(menu);
  }
  
  /**
   * Create context menu element
   */
  createContextMenu() {
    return this.domManager.createElement('div', {
      className: 'fab-menu',
      innerHTML: `
        <div class="fab-menu-row">
          <button data-action="unlink-all">Unlink alla</button>
        </div>
      `
    });
  }
  
  /**
   * Calculate menu position
   */
  calculateMenuPosition(event) {
    const pad = 8;
    const menuWidth = 160;
    const menuHeight = 40;
    
    return {
      left: Math.min(
        Math.max(pad, event.clientX), 
        window.innerWidth - menuWidth - pad
      ),
      top: Math.min(
        Math.max(pad, event.clientY), 
        window.innerHeight - menuHeight - pad
      )
    };
  }
  
  /**
   * Setup menu event handlers
   */
  setupMenuHandlers(menu) {
    // Click outside to close
    const closeHandler = (event) => {
      if (!menu.contains(event.target)) {
        this.closeMenu(menu, closeHandler);
      }
    };
    
    document.addEventListener('mousedown', closeHandler);
    document.addEventListener('touchstart', closeHandler);
    
    // Menu button click handler
    const unlinkButton = menu.querySelector('[data-action="unlink-all"]');
    if (unlinkButton) {
      unlinkButton.onclick = (event) => {
        event.stopPropagation();
        this.emitEvent('unlink-all-requested', {});
        this.closeMenu(menu, closeHandler);
      };
    }
  }
  
  /**
   * Close context menu
   */
  closeMenu(menu, closeHandler) {
    menu.remove();
    document.removeEventListener('mousedown', closeHandler);
    document.removeEventListener('touchstart', closeHandler);
  }
  
  /**
   * Set hub active state
   */
  setActiveState(isActive) {
    if (this.hubElement) {
      this.hubElement.classList.toggle('active', !!isActive);
      
      this.emitEvent('hub-active-changed', { 
        isActive: !!isActive 
      });
    }
  }
  
  /**
   * Get hub element (create if not exists)
   */
  getElement() {
    return this.hubElement || this.createHubElement();
  }
  
  /**
   * Destroy hub element
   */
  destroy() {
    if (this.hubElement) {
      this.hubElement.remove();
      this.hubElement = null;
      this.menuAttached = false;
      
      this.emitEvent('hub-destroyed', {});
    }
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

export { InternetHubUIManager };
