/**
 * Connection Event Manager - Handles event binding and cleanup for connections
 * Follows SRP - Only manages event listeners for connection updates
 */
class ConnectionEventManager {
  constructor() {
    this.activeListeners = new Map(); // connectionId -> { events, cleanupFunctions }
  }
  
  /**
   * Register update listeners for a connection
   */
  registerUpdateListeners(connectionId, updateCallback, options = {}) {
    const {
      events = ['resize', 'scroll', 'examai:fab:moved', 'examai:internet:moved'],
      passive = true
    } = options;
    
    // Clean up any existing listeners
    this.cleanupListeners(connectionId);
    
    const listeners = [];
    const cleanupFunctions = [];
    
    events.forEach(eventName => {
      const listener = this.createEventListener(updateCallback);
      const eventOptions = eventName === 'scroll' ? { passive } : undefined;
      
      window.addEventListener(eventName, listener, eventOptions);
      
      listeners.push({ eventName, listener, options: eventOptions });
      cleanupFunctions.push(() => {
        window.removeEventListener(eventName, listener, eventOptions);
      });
    });
    
    // Store for cleanup
    this.activeListeners.set(connectionId, {
      listeners,
      cleanupFunctions,
      updateCallback
    });
    
    // Schedule initial update
    this.scheduleUpdate(updateCallback);
  }
  
  /**
   * Create event listener with error handling
   */
  createEventListener(updateCallback) {
    return () => {
      try {
        updateCallback();
      } catch (error) {
        console.warn('Error in connection update listener:', error);
      }
    };
  }
  
  /**
   * Schedule update with debouncing
   */
  scheduleUpdate(updateCallback, delay = 0) {
    setTimeout(() => {
      try {
        updateCallback();
      } catch (error) {
        console.warn('Error in scheduled connection update:', error);
      }
    }, delay);
  }
  
  /**
   * Clean up listeners for specific connection
   */
  cleanupListeners(connectionId) {
    const listenerInfo = this.activeListeners.get(connectionId);
    if (!listenerInfo) return;
    
    listenerInfo.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.warn('Error cleaning up listener:', error);
      }
    });
    
    this.activeListeners.delete(connectionId);
  }
  
  /**
   * Clean up all listeners
   */
  cleanupAllListeners() {
    const connectionIds = Array.from(this.activeListeners.keys());
    connectionIds.forEach(id => this.cleanupListeners(id));
  }
  
  /**
   * Trigger update for specific connection
   */
  triggerUpdate(connectionId) {
    const listenerInfo = this.activeListeners.get(connectionId);
    if (listenerInfo?.updateCallback) {
      this.scheduleUpdate(listenerInfo.updateCallback);
    }
  }
  
  /**
   * Trigger update for all connections
   */
  triggerUpdateAll() {
    this.activeListeners.forEach((listenerInfo) => {
      if (listenerInfo.updateCallback) {
        this.scheduleUpdate(listenerInfo.updateCallback);
      }
    });
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      activeConnections: this.activeListeners.size,
      totalListeners: Array.from(this.activeListeners.values()).reduce(
        (total, info) => total + info.listeners.length,
        0
      )
    };
  }
}

export { ConnectionEventManager };
