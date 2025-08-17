/**
 * Storage Interface - Abstraction for different storage implementations
 * Follows DIP - Depend on abstractions, not concretions
 */

// Interface (contract)
class IStorageProvider {
  getItem(key) { throw new Error('Must implement getItem'); }
  setItem(key, value) { throw new Error('Must implement setItem'); }
  removeItem(key) { throw new Error('Must implement removeItem'); }
  clear() { throw new Error('Must implement clear'); }
}

// LocalStorage implementation
class LocalStorageProvider extends IStorageProvider {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
  
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
}

// Memory storage implementation (for testing or fallback)
class MemoryStorageProvider extends IStorageProvider {
  constructor() {
    super();
    this.store = new Map();
  }
  
  getItem(key) {
    return this.store.get(key) || null;
  }
  
  setItem(key, value) {
    this.store.set(key, value);
    return true;
  }
  
  removeItem(key) {
    return this.store.delete(key);
  }
  
  clear() {
    this.store.clear();
    return true;
  }
}

// Factory for creating storage providers
class StorageFactory {
  static create(type = 'localStorage') {
    switch (type) {
      case 'localStorage':
        return new LocalStorageProvider();
      case 'memory':
        return new MemoryStorageProvider();
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }
  
  static createWithFallback() {
    try {
      // Test localStorage availability
      localStorage.setItem('__test__', 'test');
      localStorage.removeItem('__test__');
      return new LocalStorageProvider();
    } catch {
      console.warn('localStorage not available, falling back to memory storage');
      return new MemoryStorageProvider();
    }
  }
}
