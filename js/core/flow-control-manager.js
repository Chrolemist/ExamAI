/**
 * Flow Control Manager - Manages application flow state with DIP
 * Follows SRP and DIP principles
 */
class FlowControlManager {
  constructor(dependencies = {}) {
    this.storage = dependencies.storage || StorageFactory.createWithFallback();
    this.domManager = dependencies.domManager || new FlowControlDomManager();
    this.eventBus = dependencies.eventBus || this.createEventBus();
    
    this.pauseQueue = [];
    this.isPaused = false;
    
    this.init();
  }
  
  /**
   * Initialize the flow control manager
   */
  init() {
    // Load paused state from storage
    this.loadPausedState();
    
    // Setup DOM event listeners
    this.domManager.onToggleClick(() => this.toggle());
    
    // Update UI to reflect current state
    this.updateUI();
  }
  
  /**
   * Check if flow is currently paused
   */
  getIsPaused() {
    return this.isPaused;
  }
  
  /**
   * Set paused state
   */
  async setPaused(paused) {
    if (this.isPaused === paused) return;
    
    this.isPaused = paused;
    this.savePausedState();
    this.updateUI();
    
    this.eventBus.emit('pause-state-changed', { 
      isPaused: this.isPaused,
      timestamp: Date.now() 
    });
    
    if (!paused) {
      await this.flushQueue();
    }
  }
  
  /**
   * Toggle paused state
   */
  async toggle() {
    await this.setPaused(!this.isPaused);
  }
  
  /**
   * Resume all paused operations
   */
  async resumeAll() {
    await this.setPaused(false);
  }
  
  /**
   * Add independent operation to queue
   */
  queueIndependent(operationId, messageCallback) {
    if (!this.isPaused) {
      // Execute immediately if not paused
      try {
        messageCallback();
      } catch (error) {
        console.error('Error executing queued operation:', error);
      }
      return;
    }
    
    // Add to queue for later execution
    this.pauseQueue.push({
      id: operationId,
      callback: messageCallback,
      timestamp: Date.now()
    });
    
    this.eventBus.emit('operation-queued', {
      operationId,
      queueLength: this.pauseQueue.length
    });
  }
  
  /**
   * Flush all queued operations
   */
  async flushQueue() {
    if (this.pauseQueue.length === 0) return;
    
    const operations = [...this.pauseQueue];
    this.pauseQueue = [];
    
    this.eventBus.emit('queue-flush-started', {
      operationCount: operations.length
    });
    
    for (const operation of operations) {
      try {
        await operation.callback();
      } catch (error) {
        console.error(`Error executing queued operation ${operation.id}:`, error);
      }
    }
    
    this.eventBus.emit('queue-flush-completed', {
      processedCount: operations.length
    });
  }
  
  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      length: this.pauseQueue.length,
      oldestTimestamp: this.pauseQueue.length > 0 ? 
        Math.min(...this.pauseQueue.map(op => op.timestamp)) : null
    };
  }
  
  /**
   * Clear the queue without executing
   */
  clearQueue() {
    const clearedCount = this.pauseQueue.length;
    this.pauseQueue = [];
    
    this.eventBus.emit('queue-cleared', { clearedCount });
  }
  
  /**
   * Update UI to reflect current state
   */
  updateUI() {
    this.domManager.updatePauseButton(this.isPaused);
    this.domManager.updateBodyClass(this.isPaused);
    this.domManager.updatePauseBanner(this.isPaused, this.pauseQueue.length);
  }
  
  /**
   * Load paused state from storage
   */
  loadPausedState() {
    try {
      const stored = this.storage.getItem('examai.flow.paused');
      this.isPaused = stored === 'true';
    } catch {
      this.isPaused = false;
    }
  }
  
  /**
   * Save paused state to storage
   */
  savePausedState() {
    try {
      this.storage.setItem('examai.flow.paused', String(this.isPaused));
    } catch (error) {
      console.warn('Failed to save paused state:', error);
    }
  }
  
  /**
   * Create event bus
   */
  createEventBus() {
    const listeners = new Map();
    
    return {
      emit: (event, data) => {
        const callbacks = listeners.get(event);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in event listener for ${event}:`, error);
            }
          });
        }
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event).add(callback);
        
        return () => {
          const callbacks = listeners.get(event);
          if (callbacks) {
            callbacks.delete(callback);
          }
        };
      }
    };
  }
  
  /**
   * Cleanup
   */
  destroy() {
    this.clearQueue();
    this.domManager.destroy();
    this.eventBus.emit('flow-control-destroyed', {});
  }
}

/**
 * Flow Control DOM Manager - Handles DOM interactions for flow control
 * Follows SRP - Only manages DOM for flow control
 */
class FlowControlDomManager {
  constructor() {
    this.pauseButton = document.getElementById('pauseFlowBtn');
    this.pauseBanner = null;
    this.toggleCallback = null;
  }
  
  /**
   * Set callback for toggle button clicks
   */
  onToggleClick(callback) {
    this.toggleCallback = callback;
    
    if (this.pauseButton) {
      this.pauseButton.addEventListener('click', callback);
    }
  }
  
  /**
   * Update pause button appearance
   */
  updatePauseButton(isPaused) {
    if (!this.pauseButton) return;
    
    if (isPaused) {
      this.pauseButton.classList.add('paused');
      this.pauseButton.title = 'Återuppta flöde';
      this.pauseButton.textContent = '▶️';
    } else {
      this.pauseButton.classList.remove('paused');
      this.pauseButton.title = 'Pausa flöde';
      this.pauseButton.textContent = '⏸️';
    }
  }
  
  /**
   * Update body class for global styling
   */
  updateBodyClass(isPaused) {
    document.body.classList.toggle('flow-paused', isPaused);
  }
  
  /**
   * Update pause banner
   */
  updatePauseBanner(isPaused, queueLength = 0) {
    if (isPaused) {
      this.showPauseBanner(queueLength);
    } else {
      this.hidePauseBanner();
    }
  }
  
  /**
   * Show pause banner
   */
  showPauseBanner(queueLength) {
    if (!this.pauseBanner) {
      this.createPauseBanner();
    }
    
    if (this.pauseBanner) {
      const message = queueLength > 0 ? 
        `Flöde pausat (${queueLength} väntande)` : 
        'Flöde pausat';
      
      this.pauseBanner.textContent = message;
      this.pauseBanner.style.display = 'block';
      this.positionBanner();
    }
  }
  
  /**
   * Hide pause banner
   */
  hidePauseBanner() {
    if (this.pauseBanner) {
      this.pauseBanner.style.display = 'none';
    }
  }
  
  /**
   * Create pause banner element
   */
  createPauseBanner() {
    this.pauseBanner = document.createElement('div');
    this.pauseBanner.className = 'pause-banner';
    this.pauseBanner.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #f59e0b;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: none;
    `;
    
    document.body.appendChild(this.pauseBanner);
  }
  
  /**
   * Position banner correctly
   */
  positionBanner() {
    if (!this.pauseBanner) return;
    
    // Ensure banner doesn't overlap with other UI elements
    const nodeBoard = document.getElementById('nodeBoard');
    if (nodeBoard) {
      const rect = nodeBoard.getBoundingClientRect();
      this.pauseBanner.style.top = Math.max(10, rect.top + 10) + 'px';
    }
  }
  
  /**
   * Cleanup DOM elements
   */
  destroy() {
    if (this.pauseBanner && this.pauseBanner.parentNode) {
      this.pauseBanner.parentNode.removeChild(this.pauseBanner);
    }
    
    if (this.pauseButton && this.toggleCallback) {
      this.pauseButton.removeEventListener('click', this.toggleCallback);
    }
  }
}
