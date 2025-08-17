/**
 * User History Manager - Handles chat history persistence and management
 * Follows SRP - Only manages history operations
 */
class UserHistoryManager {
  constructor(storageKey = 'examai.user.history') {
    this.storageKey = storageKey;
    this.history = this.loadHistory();
    this.listeners = new Set(); // callbacks for history changes
  }
  
  /**
   * Load history from storage
   */
  loadHistory() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const array = JSON.parse(raw || '[]');
      return Array.isArray(array) ? array : [];
    } catch {
      return [];
    }
  }
  
  /**
   * Save history to storage
   */
  saveHistory(history = this.history) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(history || []));
      this.notifyListeners('saved', history);
    } catch (error) {
      console.error('Failed to save user history:', error);
    }
  }
  
  /**
   * Add a new entry to history
   */
  addEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid history entry');
    }
    
    const historyEntry = {
      id: entry.id || Date.now(),
      text: entry.text || '',
      timestamp: entry.timestamp || Date.now(),
      author: entry.author || 'Du',
      ...entry
    };
    
    this.history.push(historyEntry);
    this.saveHistory();
    this.notifyListeners('added', historyEntry);
    
    return historyEntry;
  }
  
  /**
   * Get history entries
   */
  getHistory() {
    return [...this.history]; // Return copy to prevent external mutation
  }
  
  /**
   * Get history entries after a specific index
   */
  getHistoryAfter(index) {
    if (typeof index !== 'number' || index < 0) {
      return this.getHistory();
    }
    return this.history.slice(index + 1);
  }
  
  /**
   * Clear all history
   */
  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.notifyListeners('cleared', []);
  }
  
  /**
   * Get the last entry index
   */
  getLastIndex() {
    return this.history.length - 1;
  }
  
  /**
   * Subscribe to history changes
   */
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      
      // Return unsubscribe function
      return () => {
        this.listeners.delete(callback);
      };
    }
  }
  
  /**
   * Notify all listeners of changes
   */
  notifyListeners(action, data) {
    this.listeners.forEach(callback => {
      try {
        callback(action, data, this.history);
      } catch (error) {
        console.error('Error in history listener:', error);
      }
    });
  }
  
  /**
   * Export history for sharing or backup
   */
  exportHistory() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      entries: this.getHistory()
    };
  }
  
  /**
   * Import history from export
   */
  importHistory(exportData, merge = false) {
    if (!exportData || !Array.isArray(exportData.entries)) {
      throw new Error('Invalid history export data');
    }
    
    if (merge) {
      // Merge with existing history, avoiding duplicates
      const existingIds = new Set(this.history.map(entry => entry.id));
      const newEntries = exportData.entries.filter(entry => !existingIds.has(entry.id));
      this.history.push(...newEntries);
    } else {
      // Replace entire history
      this.history = [...exportData.entries];
    }
    
    this.saveHistory();
    this.notifyListeners('imported', exportData);
  }
}
