/**
 * FAB Drag Manager - Handles dragging of FABs within Node Board boundaries
 * Follows Single Responsibility Principle (SRP) - Only manages drag behavior
 * Follows Open/Closed Principle (OCP) - Extensible through event system
 * Follows Dependency Inversion Principle (DIP) - Depends on abstractions
 */
class FabDragManager {
  constructor(nodeBoard, eventEmitter = null) {
    this.nodeBoard = nodeBoard;
    this.eventEmitter = eventEmitter || this.createEventEmitter();
    this.draggables = new Map(); // fabElement -> dragConfig
    this.currentDrag = null;
  }

  /**
   * Register a FAB element for dragging within Node Board
   * @param {HTMLElement} fabElement - The FAB to make draggable
   * @param {Object} config - Drag configuration
   */
  registerFab(fabElement, config = {}) {
    if (!fabElement || !this.isValidFab(fabElement)) {
      throw new Error('Invalid FAB element provided');
    }

    const dragConfig = {
      element: fabElement,
      constrainToBoard: config.constrainToBoard !== false, // default true
      snapToGrid: config.snapToGrid !== false, // default true
      gridSize: config.gridSize || 20,
      onDragStart: config.onDragStart || null,
      onDragMove: config.onDragMove || null,
      onDragEnd: config.onDragEnd || null,
      minX: config.minX || 0,
      minY: config.minY || 0,
      maxX: config.maxX || null,
      maxY: config.maxY || null
    };

    this.draggables.set(fabElement, dragConfig);
    this.attachDragHandlers(fabElement);
    
    this.eventEmitter.emit('fab-registered', { element: fabElement, config: dragConfig });
  }

  /**
   * Unregister a FAB from drag management
   */
  unregisterFab(fabElement) {
    if (this.draggables.has(fabElement)) {
      this.detachDragHandlers(fabElement);
      this.draggables.delete(fabElement);
      this.eventEmitter.emit('fab-unregistered', { element: fabElement });
    }
  }

  /**
   * Get the boundaries of the Node Board for constraining movement
   */
  getBoardBoundaries() {
    if (!this.nodeBoard) return null;
    
    const rect = this.nodeBoard.getBoundingClientRect();
    const style = getComputedStyle(this.nodeBoard);
    const padding = {
      top: parseInt(style.paddingTop, 10) || 0,
      right: parseInt(style.paddingRight, 10) || 0,
      bottom: parseInt(style.paddingBottom, 10) || 0,
      left: parseInt(style.paddingLeft, 10) || 0
    };

    return {
      left: padding.left,
      top: padding.top,
      right: rect.width - padding.right,
      bottom: rect.height - padding.bottom,
      width: rect.width - padding.left - padding.right,
      height: rect.height - padding.top - padding.bottom
    };
  }

  /**
   * Snap coordinates to grid if enabled
   */
  snapToGrid(x, y, gridSize) {
    if (!gridSize) return { x, y };
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize
    };
  }

  /**
   * Constrain coordinates to board boundaries
   */
  constrainToBoard(x, y, fabWidth, fabHeight) {
    const boundaries = this.getBoardBoundaries();
    if (!boundaries) return { x, y };

    return {
      x: Math.max(boundaries.left, Math.min(boundaries.right - fabWidth, x)),
      y: Math.max(boundaries.top, Math.min(boundaries.bottom - fabHeight, y))
    };
  }

  /**
   * Validate that element is a proper FAB
   */
  isValidFab(element) {
    return element && 
           element.nodeType === Node.ELEMENT_NODE && 
           element.classList.contains('fab');
  }

  /**
   * Attach drag event handlers to a FAB
   */
  attachDragHandlers(fabElement) {
    const config = this.draggables.get(fabElement);
    if (!config) return;

    // Prevent dragging from connection points
    const onDown = (e) => {
      if (e.target.closest('.conn-point')) return;
      this.startDrag(e, fabElement);
    };

    fabElement.addEventListener('mousedown', onDown, { passive: false });
    fabElement.addEventListener('touchstart', onDown, { passive: false });
    
    // Store handlers for cleanup
    config._handlers = { onDown };
  }

  /**
   * Detach drag event handlers from a FAB
   */
  detachDragHandlers(fabElement) {
    const config = this.draggables.get(fabElement);
    if (!config || !config._handlers) return;

    fabElement.removeEventListener('mousedown', config._handlers.onDown);
    fabElement.removeEventListener('touchstart', config._handlers.onDown);
  }

  /**
   * Start dragging a FAB
   */
  startDrag(event, fabElement) {
    event.preventDefault();
    
    const config = this.draggables.get(fabElement);
    if (!config || this.currentDrag) return;

    const pointer = event.touches ? event.touches[0] : event;
    const rect = fabElement.getBoundingClientRect();
    const boardRect = this.nodeBoard.getBoundingClientRect();

    this.currentDrag = {
      element: fabElement,
      config: config,
      startX: pointer.clientX,
      startY: pointer.clientY,
      initialLeft: rect.left - boardRect.left,
      initialTop: rect.top - boardRect.top,
      moved: false
    };

    // Global event listeners for drag
    document.addEventListener('mousemove', this.onDragMove, { passive: false });
    document.addEventListener('mouseup', this.onDragEnd, { passive: false });
    document.addEventListener('touchmove', this.onDragMove, { passive: false });
    document.addEventListener('touchend', this.onDragEnd, { passive: false });

    // Custom callback
    if (config.onDragStart) {
      config.onDragStart(fabElement, this.currentDrag);
    }

    this.eventEmitter.emit('drag-start', { 
      element: fabElement, 
      startPos: { x: this.currentDrag.initialLeft, y: this.currentDrag.initialTop }
    });
  }

  /**
   * Handle drag movement
   */
  onDragMove = (event) => {
    if (!this.currentDrag) return;
    
    event.preventDefault();
    const pointer = event.touches ? event.touches[0] : event;
    const { element, config, startX, startY, initialLeft, initialTop } = this.currentDrag;

    const deltaX = pointer.clientX - startX;
    const deltaY = pointer.clientY - startY;

    // Mark as moved if threshold exceeded
    if (!this.currentDrag.moved && Math.hypot(deltaX, deltaY) > 3) {
      this.currentDrag.moved = true;
      element.style.cursor = 'grabbing';
    }

    if (!this.currentDrag.moved) return;

    let newX = initialLeft + deltaX;
    let newY = initialTop + deltaY;

    // Apply custom constraints
    if (config.maxX !== null) newX = Math.min(newX, config.maxX);
    if (config.maxY !== null) newY = Math.min(newY, config.maxY);
    newX = Math.max(newX, config.minX);
    newY = Math.max(newY, config.minY);

    // Snap to grid
    if (config.snapToGrid) {
      const snapped = this.snapToGrid(newX, newY, config.gridSize);
      newX = snapped.x;
      newY = snapped.y;
    }

    // Constrain to board
    if (config.constrainToBoard) {
      const rect = element.getBoundingClientRect();
      const constrained = this.constrainToBoard(newX, newY, rect.width, rect.height);
      newX = constrained.x;
      newY = constrained.y;
    }

    // Apply position
    element.style.left = newX + 'px';
    element.style.top = newY + 'px';

    // Custom callback
    if (config.onDragMove) {
      config.onDragMove(element, { x: newX, y: newY }, this.currentDrag);
    }

    this.eventEmitter.emit('drag-move', { 
      element, 
      position: { x: newX, y: newY },
      delta: { x: deltaX, y: deltaY }
    });
  }

  /**
   * End dragging
   */
  onDragEnd = (event) => {
    if (!this.currentDrag) return;

    const { element, config, moved } = this.currentDrag;
    
    // Cleanup
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.onDragEnd);
    document.removeEventListener('touchmove', this.onDragMove);
    document.removeEventListener('touchend', this.onDragEnd);

    element.style.cursor = 'grab';

    if (moved) {
      const rect = element.getBoundingClientRect();
      const boardRect = this.nodeBoard.getBoundingClientRect();
      const finalPos = {
        x: rect.left - boardRect.left,
        y: rect.top - boardRect.top
      };

      // Custom callback
      if (config.onDragEnd) {
        config.onDragEnd(element, finalPos, this.currentDrag);
      }

      this.eventEmitter.emit('drag-end', { 
        element, 
        finalPosition: finalPos,
        wasMoved: moved
      });
    }

    this.currentDrag = null;
  }

  /**
   * Create a simple event emitter if none provided
   */
  createEventEmitter() {
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
   * Get current drag state
   */
  isDragging() {
    return this.currentDrag !== null;
  }

  /**
   * Get all registered FABs
   */
  getRegisteredFabs() {
    return Array.from(this.draggables.keys());
  }

  /**
   * Cleanup and destroy the manager
   */
  destroy() {
    // Unregister all FABs
    for (const fabElement of this.draggables.keys()) {
      this.unregisterFab(fabElement);
    }
    
    // Clean up current drag if active
    if (this.currentDrag) {
      this.onDragEnd();
    }
    
    this.draggables.clear();
    this.currentDrag = null;
    this.nodeBoard = null;
    this.eventEmitter = null;
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FabDragManager;
} else {
  window.FabDragManager = FabDragManager;
}
