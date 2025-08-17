/**
 * FAB Position Manager - Handles persistence and restoration of FAB positions
 * Follows Single Responsibility Principle (SRP) - Only manages position persistence
 * Follows Interface Segregation Principle (ISP) - Minimal, focused interface
 */
class FabPositionManager {
  constructor(storagePrefix = 'examai.fab', storage = localStorage) {
    this.storagePrefix = storagePrefix;
    this.storage = storage;
    this.positions = new Map(); // fabId -> {x, y, timestamp}
    this.defaultPositions = new Map(); // fabId -> {x, y}
    
    this.loadAllPositions();
  }

  /**
   * Set a default position for a FAB (used if no saved position exists)
   * @param {string} fabId - Unique identifier for the FAB
   * @param {number} x - Default X position
   * @param {number} y - Default Y position
   */
  setDefaultPosition(fabId, x, y) {
    if (!this.isValidId(fabId) || !this.isValidCoordinate(x) || !this.isValidCoordinate(y)) {
      throw new Error('Invalid parameters for default position');
    }
    
    this.defaultPositions.set(fabId, { x, y });
  }

  /**
   * Save the current position of a FAB
   * @param {string} fabId - Unique identifier for the FAB
   * @param {number} x - X position relative to Node Board
   * @param {number} y - Y position relative to Node Board
   * @param {boolean} persist - Whether to save to storage (default: true)
   */
  savePosition(fabId, x, y, persist = true) {
    if (!this.isValidId(fabId) || !this.isValidCoordinate(x) || !this.isValidCoordinate(y)) {
      throw new Error('Invalid parameters for position');
    }

    const position = {
      x: Math.round(x),
      y: Math.round(y),
      timestamp: Date.now()
    };

    this.positions.set(fabId, position);

    if (persist) {
      try {
        const key = this.getStorageKey(fabId);
        this.storage.setItem(key, JSON.stringify(position));
      } catch (error) {
        console.warn(`Failed to persist position for FAB ${fabId}:`, error);
      }
    }

    return position;
  }

  /**
   * Get the position of a FAB (saved or default)
   * @param {string} fabId - Unique identifier for the FAB
   * @returns {Object|null} Position object {x, y} or null if not found
   */
  getPosition(fabId) {
    if (!this.isValidId(fabId)) {
      return null;
    }

    // Check saved positions first
    const saved = this.positions.get(fabId);
    if (saved) {
      return { x: saved.x, y: saved.y };
    }

    // Fall back to default position
    const defaultPos = this.defaultPositions.get(fabId);
    if (defaultPos) {
      return { x: defaultPos.x, y: defaultPos.y };
    }

    return null;
  }

  /**
   * Get detailed position info including metadata
   * @param {string} fabId - Unique identifier for the FAB
   * @returns {Object|null} Full position object with timestamp
   */
  getPositionDetails(fabId) {
    if (!this.isValidId(fabId)) {
      return null;
    }

    const saved = this.positions.get(fabId);
    if (saved) {
      return { ...saved };
    }

    const defaultPos = this.defaultPositions.get(fabId);
    if (defaultPos) {
      return {
        x: defaultPos.x,
        y: defaultPos.y,
        timestamp: null,
        isDefault: true
      };
    }

    return null;
  }

  /**
   * Apply a saved position to a FAB element
   * @param {HTMLElement} fabElement - The FAB element to position
   * @param {string} fabId - Unique identifier for the FAB
   * @returns {boolean} True if position was applied, false otherwise
   */
  applyPosition(fabElement, fabId) {
    if (!fabElement || !this.isValidId(fabId)) {
      return false;
    }

    const position = this.getPosition(fabId);
    if (!position) {
      return false;
    }

    try {
      fabElement.style.left = position.x + 'px';
      fabElement.style.top = position.y + 'px';
      fabElement.style.position = 'absolute';
      return true;
    } catch (error) {
      console.warn(`Failed to apply position to FAB ${fabId}:`, error);
      return false;
    }
  }

  /**
   * Remove a saved position
   * @param {string} fabId - Unique identifier for the FAB
   * @param {boolean} removeFromStorage - Whether to remove from persistent storage
   */
  removePosition(fabId, removeFromStorage = true) {
    if (!this.isValidId(fabId)) {
      return false;
    }

    this.positions.delete(fabId);

    if (removeFromStorage) {
      try {
        const key = this.getStorageKey(fabId);
        this.storage.removeItem(key);
      } catch (error) {
        console.warn(`Failed to remove position from storage for FAB ${fabId}:`, error);
      }
    }

    return true;
  }

  /**
   * Get all saved positions
   * @returns {Map} Map of fabId -> position
   */
  getAllPositions() {
    const result = new Map();
    
    // Add saved positions
    for (const [fabId, position] of this.positions) {
      result.set(fabId, { x: position.x, y: position.y });
    }
    
    // Add default positions for FABs without saved positions
    for (const [fabId, defaultPos] of this.defaultPositions) {
      if (!result.has(fabId)) {
        result.set(fabId, { x: defaultPos.x, y: defaultPos.y });
      }
    }
    
    return result;
  }

  /**
   * Clear all positions
   * @param {boolean} clearStorage - Whether to clear persistent storage
   */
  clearAllPositions(clearStorage = true) {
    this.positions.clear();

    if (clearStorage) {
      try {
        // Remove all keys with our prefix
        const keysToRemove = [];
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (key && key.startsWith(this.storagePrefix)) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => this.storage.removeItem(key));
      } catch (error) {
        console.warn('Failed to clear positions from storage:', error);
      }
    }
  }

  /**
   * Generate automatic positions for multiple FABs in a grid layout
   * @param {Array} fabIds - Array of FAB identifiers
   * @param {Object} options - Layout options
   */
  generateGridLayout(fabIds, options = {}) {
    const {
      startX = 20,
      startY = 40,
      spacingX = 80,
      spacingY = 80,
      maxColumns = 4,
      saveAsDefaults = true
    } = options;

    if (!Array.isArray(fabIds)) {
      throw new Error('fabIds must be an array');
    }

    const positions = [];
    
    fabIds.forEach((fabId, index) => {
      const row = Math.floor(index / maxColumns);
      const col = index % maxColumns;
      
      const x = startX + (col * spacingX);
      const y = startY + (row * spacingY);
      
      positions.push({ fabId, x, y });
      
      if (saveAsDefaults) {
        this.setDefaultPosition(fabId, x, y);
      }
    });

    return positions;
  }

  /**
   * Load all positions from storage
   */
  loadAllPositions() {
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.storagePrefix)) {
          const fabId = this.extractFabIdFromKey(key);
          const data = this.storage.getItem(key);
          
          if (fabId && data) {
            const position = JSON.parse(data);
            if (this.isValidPosition(position)) {
              this.positions.set(fabId, position);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load positions from storage:', error);
    }
  }

  /**
   * Validate FAB ID
   */
  isValidId(fabId) {
    return typeof fabId === 'string' && fabId.length > 0;
  }

  /**
   * Validate coordinate
   */
  isValidCoordinate(coord) {
    return typeof coord === 'number' && Number.isFinite(coord);
  }

  /**
   * Validate position object
   */
  isValidPosition(position) {
    return position && 
           typeof position === 'object' &&
           this.isValidCoordinate(position.x) &&
           this.isValidCoordinate(position.y);
  }

  /**
   * Get storage key for a FAB ID
   */
  getStorageKey(fabId) {
    return `${this.storagePrefix}.${fabId}.pos`;
  }

  /**
   * Extract FAB ID from storage key
   */
  extractFabIdFromKey(key) {
    const suffix = '.pos';
    if (key.startsWith(this.storagePrefix) && key.endsWith(suffix)) {
      const start = this.storagePrefix.length + 1; // +1 for the dot
      const end = key.length - suffix.length;
      return key.substring(start, end);
    }
    return null;
  }

  /**
   * Get statistics about stored positions
   */
  getStats() {
    return {
      totalSaved: this.positions.size,
      totalDefaults: this.defaultPositions.size,
      oldestTimestamp: Math.min(...Array.from(this.positions.values()).map(p => p.timestamp || Date.now())),
      newestTimestamp: Math.max(...Array.from(this.positions.values()).map(p => p.timestamp || 0))
    };
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FabPositionManager;
} else {
  window.FabPositionManager = FabPositionManager;
}
