/**
 * Node Board FAB Controller - Main controller for FAB management in Node Board
 * Follows Single Responsibility Principle (SRP) - Coordinates FAB management
 * Follows Dependency Inversion Principle (DIP) - Depends on abstractions
 * Follows Open/Closed Principle (OCP) - Extensible through composition
 */
class NodeBoardFabController {
  constructor(nodeBoard) {
    if (!nodeBoard) {
      throw new Error('NodeBoard element is required');
    }

    this.nodeBoard = nodeBoard;
    this.isInitialized = false;
    
    // Dependency injection - can be replaced with other implementations
    this.dragManager = null;
    this.positionManager = null;
    this.eventBus = this.createEventBus();
    
    // FAB registry
    this.registeredFabs = new Map(); // element -> fabInfo
    this.fabIdCounter = 0;
    
    this.init();
  }

  /**
   * Initialize the controller
   */
  init() {
    if (this.isInitialized) return;

    try {
      // Initialize managers
      this.positionManager = new FabPositionManager('examai.fab');
      this.dragManager = new FabDragManager(this.nodeBoard, this.eventBus);
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Auto-register existing FABs in Node Board
      this.autoRegisterExistingFabs();
      
      this.isInitialized = true;
      this.eventBus.emit('controller-initialized', { controller: this });
      
    } catch (error) {
      console.error('Failed to initialize NodeBoardFabController:', error);
      throw error;
    }
  }

  /**
   * Register a new FAB for management
   * @param {HTMLElement} fabElement - The FAB element
   * @param {Object} options - Configuration options
   */
  registerFab(fabElement, options = {}) {
    if (!fabElement || !fabElement.classList.contains('fab')) {
      throw new Error('Invalid FAB element provided');
    }

    if (this.registeredFabs.has(fabElement)) {
      console.warn('FAB already registered, skipping');
      return this.registeredFabs.get(fabElement);
    }

    // Generate unique ID for this FAB
    const fabId = options.id || this.generateFabId(fabElement);
    
    const fabInfo = {
      id: fabId,
      element: fabElement,
      type: this.determineFabType(fabElement),
      registeredAt: Date.now(),
      ...options
    };

    // Set default position based on FAB type and existing FABs
    this.setDefaultPosition(fabInfo);

    // Apply saved or default position
    this.positionManager.applyPosition(fabElement, fabId);

    // Register with drag manager
    const dragConfig = this.createDragConfig(fabInfo);
    this.dragManager.registerFab(fabElement, dragConfig);

    // Store in registry
    this.registeredFabs.set(fabElement, fabInfo);

    this.eventBus.emit('fab-registered', { fabInfo, element: fabElement });
    
    return fabInfo;
  }

  /**
   * Unregister a FAB
   * @param {HTMLElement} fabElement - The FAB element to unregister
   */
  unregisterFab(fabElement) {
    const fabInfo = this.registeredFabs.get(fabElement);
    if (!fabInfo) return false;

    // Unregister from drag manager
    this.dragManager.unregisterFab(fabElement);

    // Remove from registry
    this.registeredFabs.delete(fabElement);

    this.eventBus.emit('fab-unregistered', { fabInfo, element: fabElement });
    
    return true;
  }

  /**
   * Get info about a registered FAB
   * @param {HTMLElement} fabElement - The FAB element
   */
  getFabInfo(fabElement) {
    return this.registeredFabs.get(fabElement) || null;
  }

  /**
   * Get all registered FABs
   */
  getAllFabs() {
    return Array.from(this.registeredFabs.values());
  }

  /**
   * Save current position of a FAB
   * @param {HTMLElement} fabElement - The FAB element
   */
  saveFabPosition(fabElement) {
    const fabInfo = this.registeredFabs.get(fabElement);
    if (!fabInfo) return false;

    const rect = fabElement.getBoundingClientRect();
    const boardRect = this.nodeBoard.getBoundingClientRect();
    
    const x = rect.left - boardRect.left;
    const y = rect.top - boardRect.top;
    
    this.positionManager.savePosition(fabInfo.id, x, y);
    
    this.eventBus.emit('fab-position-saved', { 
      fabInfo, 
      position: { x, y } 
    });
    
    return true;
  }

  /**
   * Reset a FAB to its default position
   * @param {HTMLElement} fabElement - The FAB element
   */
  resetFabPosition(fabElement) {
    const fabInfo = this.registeredFabs.get(fabElement);
    if (!fabInfo) return false;

    // Remove saved position, will fall back to default
    this.positionManager.removePosition(fabInfo.id);
    
    // Reapply position (will use default)
    this.positionManager.applyPosition(fabElement, fabInfo.id);
    
    this.eventBus.emit('fab-position-reset', { fabInfo });
    
    return true;
  }

  /**
   * Arrange all FABs in a grid layout
   * @param {Object} options - Layout options
   */
  arrangeInGrid(options = {}) {
    const fabInfos = Array.from(this.registeredFabs.values());
    const fabIds = fabInfos.map(info => info.id);
    
    const positions = this.positionManager.generateGridLayout(fabIds, {
      startX: 20,
      startY: 40,
      spacingX: 80,
      spacingY: 80,
      maxColumns: 4,
      saveAsDefaults: false, // Don't override defaults
      ...options
    });

    // Apply positions to elements
    positions.forEach(({ fabId, x, y }) => {
      const fabInfo = fabInfos.find(info => info.id === fabId);
      if (fabInfo) {
        fabInfo.element.style.left = x + 'px';
        fabInfo.element.style.top = y + 'px';
        this.positionManager.savePosition(fabId, x, y);
      }
    });

    this.eventBus.emit('fabs-arranged', { positions, layout: 'grid' });
    
    return positions;
  }

  /**
   * Auto-register existing FABs in the Node Board
   */
  autoRegisterExistingFabs() {
    const existingFabs = this.nodeBoard.querySelectorAll('.fab');
    
    existingFabs.forEach(fabElement => {
      try {
        this.registerFab(fabElement);
      } catch (error) {
        console.warn('Failed to auto-register FAB:', error);
      }
    });
  }

  /**
   * Generate a unique ID for a FAB
   */
  generateFabId(fabElement) {
    // Try to get existing ID from data attribute or element ID
    let id = fabElement.dataset.copilotId || 
             fabElement.dataset.fabId || 
             fabElement.id;

    if (id) {
      return id;
    }

    // Check for specific FAB types
    if (fabElement.classList.contains('user-node')) {
      return 'user';
    }
    
    if (fabElement.classList.contains('internet-hub')) {
      return 'internet';
    }

    // Generate a unique ID
    return `fab-${++this.fabIdCounter}`;
  }

  /**
   * Determine FAB type from element
   */
  determineFabType(fabElement) {
    if (fabElement.classList.contains('user-node')) return 'user';
    if (fabElement.classList.contains('internet-hub')) return 'internet';
    if (fabElement.dataset.copilotId) return 'copilot';
    return 'unknown';
  }

  /**
   * Set default position for a FAB based on its type
   */
  setDefaultPosition(fabInfo) {
    const { type, id } = fabInfo;
    let x, y;

    switch (type) {
      case 'user':
        x = 74;
        y = 40;
        break;
      
      case 'internet':
        x = 2;
        y = 40;
        break;
      
      case 'copilot':
        // Use existing logic for copilot positioning
        const copilotId = parseInt(fabInfo.element.dataset.copilotId) || 0;
        x = 140 + (copilotId * 80);
        y = 40 + ((copilotId % 2) * 80);
        break;
      
      default:
        // Default positioning for unknown types
        const registeredCount = this.registeredFabs.size;
        x = 20 + (registeredCount * 60);
        y = 40;
        break;
    }

    this.positionManager.setDefaultPosition(id, x, y);
  }

  /**
   * Create drag configuration for a FAB
   */
  createDragConfig(fabInfo) {
    return {
      constrainToBoard: true,
      snapToGrid: true,
      gridSize: 20,
      onDragEnd: (element, position) => {
        this.positionManager.savePosition(fabInfo.id, position.x, position.y);
      }
    };
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Throttle real-time drag events to prevent visual glitches
    let lastDragUpdate = 0;
    const dragThrottleMs = 16; // ~60fps
    
    // Listen for real-time drag events
    this.eventBus.on('drag-move', (data) => {
      const now = Date.now();
      if (now - lastDragUpdate < dragThrottleMs) {
        return; // Skip this update to prevent overwhelming the UI
      }
      lastDragUpdate = now;
      
      const fabInfo = this.registeredFabs.get(data.element);
      if (fabInfo) {
        // Use requestAnimationFrame for smooth visual updates
        requestAnimationFrame(() => {
          // Emit the custom event that links listen for
          // This enables real-time link updates during dragging
          const customEvent = new CustomEvent('examai:fab:moved', {
            detail: { 
              fabInfo, 
              position: data.position,
              element: data.element
            }
          });
          window.dispatchEvent(customEvent);
        });
      }
    });

    // Listen for drag events
    this.eventBus.on('drag-end', (data) => {
      const fabInfo = this.registeredFabs.get(data.element);
      if (fabInfo && data.wasMoved) {
        // Mark the element as recently dragged to prevent immediate clicks
        data.element._lastDragTime = Date.now();
        
        // Position is already saved in drag config, just emit event
        this.eventBus.emit('fab-moved', { 
          fabInfo, 
          newPosition: data.finalPosition 
        });
      }
    });

    // Listen for Node Board changes (if it gets resized, etc.)
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.eventBus.emit('nodeboard-resized', { 
          boundaries: this.dragManager.getBoardBoundaries() 
        });
      });
      this.resizeObserver.observe(this.nodeBoard);
    }
  }

  /**
   * Create a simple event bus
   */
  createEventBus() {
    const listeners = new Map();
    
    return {
      emit: (event, data) => {
        const eventListeners = listeners.get(event) || [];
        eventListeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in event listener for '${event}':`, error);
          }
        });
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(callback);
      },
      
      off: (event, callback) => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      }
    };
  }

  /**
   * Get current state of the controller
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      totalFabs: this.registeredFabs.size,
      fabTypes: this.getAllFabs().reduce((acc, info) => {
        acc[info.type] = (acc[info.type] || 0) + 1;
        return acc;
      }, {}),
      boundaries: this.dragManager ? this.dragManager.getBoardBoundaries() : null
    };
  }

  /**
   * Cleanup and destroy the controller
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.dragManager) {
      this.dragManager.destroy();
    }

    this.registeredFabs.clear();
    this.isInitialized = false;
    
    this.eventBus.emit('controller-destroyed');
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NodeBoardFabController;
} else {
  window.NodeBoardFabController = NodeBoardFabController;
}
