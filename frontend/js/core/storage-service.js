/**
 * Storage Service - SOLID storage abstraction
 * Follows Single Responsibility Principle (SRP) - Storage management only
 * Follows Open/Closed Principle (OCP) - Extensible storage backends
 * Follows Dependency Inversion Principle (DIP) - Storage abstraction
 */

export class StorageService {
  constructor(eventBus, backend = 'localStorage') {
    this.eventBus = eventBus;
    this.backend = this.createBackend(backend);
    this.prefix = 'examai.';
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for storage operations from event bus
    this.eventBus.on('storage:get', (data) => {
      const value = this.get(data.key, data.defaultValue);
      if (data.callback) {
        data.callback(value);
      }
    });

    this.eventBus.on('storage:set', (data) => {
      this.set(data.key, data.value);
    });

    this.eventBus.on('storage:remove', (data) => {
      this.remove(data.key);
    });

    this.eventBus.on('storage:clear', () => {
      this.clear();
    });
  }

  createBackend(type) {
    switch (type) {
      case 'localStorage':
        return new LocalStorageBackend();
      case 'sessionStorage':
        return new SessionStorageBackend();
      case 'memory':
        return new MemoryStorageBackend();
      default:
        throw new Error(`Unknown storage backend: ${type}`);
    }
  }

  // Get value with optional default
  get(key, defaultValue = null) {
    try {
      const fullKey = this.prefix + key;
      const value = this.backend.getItem(fullKey);
      if (value === null) return defaultValue;
      
      // Try to parse as JSON, fall back to string
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.warn(`Storage get error for key ${key}:`, error);
      return defaultValue;
    }
  }

  // Set value (automatically serializes)
  set(key, value) {
    try {
      const fullKey = this.prefix + key;
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      this.backend.setItem(fullKey, serialized);
      return true;
    } catch (error) {
      console.warn(`Storage set error for key ${key}:`, error);
      return false;
    }
  }

  // Remove key
  remove(key) {
    try {
      const fullKey = this.prefix + key;
      this.backend.removeItem(fullKey);
      return true;
    } catch (error) {
      console.warn(`Storage remove error for key ${key}:`, error);
      return false;
    }
  }

  // Check if key exists
  has(key) {
    const fullKey = this.prefix + key;
    return this.backend.getItem(fullKey) !== null;
  }

  // Get all keys with prefix
  keys() {
    return this.backend.keys().filter(key => key.startsWith(this.prefix))
      .map(key => key.substring(this.prefix.length));
  }

  // Clear all keys with prefix
  clear() {
    const keys = this.backend.keys().filter(key => key.startsWith(this.prefix));
    keys.forEach(key => this.backend.removeItem(key));
  }

  // Get storage size info
  getSize() {
    return this.backend.getSize();
  }
}

// Storage backend implementations
class LocalStorageBackend {
  getItem(key) {
    return localStorage.getItem(key);
  }

  setItem(key, value) {
    localStorage.setItem(key, value);
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  keys() {
    return Object.keys(localStorage);
  }

  getSize() {
    let size = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        size += localStorage[key].length + key.length;
      }
    }
    return size;
  }
}

class SessionStorageBackend {
  getItem(key) {
    return sessionStorage.getItem(key);
  }

  setItem(key, value) {
    sessionStorage.setItem(key, value);
  }

  removeItem(key) {
    sessionStorage.removeItem(key);
  }

  keys() {
    return Object.keys(sessionStorage);
  }

  getSize() {
    let size = 0;
    for (let key in sessionStorage) {
      if (sessionStorage.hasOwnProperty(key)) {
        size += sessionStorage[key].length + key.length;
      }
    }
    return size;
  }
}

class MemoryStorageBackend {
  constructor() {
    this.storage = new Map();
  }

  getItem(key) {
    return this.storage.get(key) || null;
  }

  setItem(key, value) {
    this.storage.set(key, value);
  }

  removeItem(key) {
    this.storage.delete(key);
  }

  keys() {
    return Array.from(this.storage.keys());
  }

  getSize() {
    let size = 0;
    for (let [key, value] of this.storage) {
      size += key.length + value.length;
    }
    return size;
  }
}
