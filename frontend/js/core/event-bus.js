/**
 * Event Bus - Central event system for decoupled communication
 * Follows Single Responsibility Principle (SRP) - Event management only
 * Follows Dependency Inversion Principle (DIP) - Removes window.* dependencies
 * Follows Interface Segregation Principle (ISP) - Clean event interface
 */

export class EventBus {
  constructor() {
    this.listeners = new Map(); // eventName -> Set<listeners>
    this.onceListeners = new Map(); // eventName -> Set<listeners>
  }

  // Subscribe to an event
  on(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
    
    // Return unsubscribe function
    return () => this.off(eventName, listener);
  }

  // Subscribe to an event (one-time only)
  once(eventName, listener) {
    if (!this.onceListeners.has(eventName)) {
      this.onceListeners.set(eventName, new Set());
    }
    this.onceListeners.get(eventName).add(listener);
    
    // Return unsubscribe function
    return () => this.onceListeners.get(eventName)?.delete(listener);
  }

  // Unsubscribe from an event
  off(eventName, listener) {
    this.listeners.get(eventName)?.delete(listener);
    this.onceListeners.get(eventName)?.delete(listener);
  }

  // Emit an event
  emit(eventName, data = null) {
    // Regular listeners
    const regularListeners = this.listeners.get(eventName);
    if (regularListeners) {
      for (const listener of regularListeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventName}:`, error);
        }
      }
    }

    // Once listeners (then remove them)
    const onceListeners = this.onceListeners.get(eventName);
    if (onceListeners) {
      for (const listener of onceListeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in one-time event listener for ${eventName}:`, error);
        }
      }
      this.onceListeners.delete(eventName); // Remove all once listeners
    }
  }

  // Get number of listeners for an event
  listenerCount(eventName) {
    const regular = this.listeners.get(eventName)?.size || 0;
    const once = this.onceListeners.get(eventName)?.size || 0;
    return regular + once;
  }

  // Remove all listeners for an event
  removeAllListeners(eventName) {
    if (eventName) {
      this.listeners.delete(eventName);
      this.onceListeners.delete(eventName);
    } else {
      // Remove all listeners for all events
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  // Get list of all event names
  eventNames() {
    const names = new Set();
    for (const name of this.listeners.keys()) names.add(name);
    for (const name of this.onceListeners.keys()) names.add(name);
    return Array.from(names);
  }
}
