/**
 * User Settings Manager - Handles user preferences and storage
 * Follows SRP - Only manages user settings
 */
class UserSettingsManager {
  constructor(storagePrefix = 'examai.user') {
    this.prefix = storagePrefix;
    this.listeners = new Map(); // setting -> Set<callback>
  }
  
  // Getters with validation and defaults
  getName() {
    try { 
      return localStorage.getItem(`${this.prefix}.name`) || 'Du'; 
    } catch { 
      return 'Du'; 
    }
  }
  
  getFont() { 
    return localStorage.getItem(`${this.prefix}.font`) || 'system-ui, sans-serif'; 
  }
  
  getColor() { 
    return localStorage.getItem(`${this.prefix}.bubbleColor`) || '#1e293b'; 
  }
  
  getAlpha() {
    try { 
      const value = parseFloat(localStorage.getItem(`${this.prefix}.bubbleAlpha`)); 
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.10; 
    } catch { 
      return 0.10; 
    }
  }
  
  getBgVisible() {
    try { 
      const value = localStorage.getItem(`${this.prefix}.bubbleBgVisible`); 
      return value === null ? true : value === '1'; 
    } catch { 
      return true; 
    }
  }
  
  // Setters with validation and events
  setName(value) {
    const name = (value || '').trim() || 'Du';
    this.saveAndNotify('name', name);
    window.dispatchEvent(new CustomEvent('examai:userNameChanged', { 
      detail: { name } 
    }));
  }
  
  setFont(value) {
    this.saveAndNotify('font', value || 'system-ui, sans-serif');
  }
  
  setColor(value) {
    this.saveAndNotify('bubbleColor', value || '#1e293b');
  }
  
  setAlpha(value) {
    const alpha = Math.max(0, Math.min(1, Number(value) || 0));
    this.saveAndNotify('bubbleAlpha', String(alpha));
  }
  
  setBgVisible(visible) {
    this.saveAndNotify('bubbleBgVisible', visible ? '1' : '0');
  }
  
  // Private helper methods
  saveAndNotify(key, value) {
    try {
      localStorage.setItem(`${this.prefix}.${key}`, value);
      this.notifyListeners(key, value);
    } catch (error) {
      console.warn(`Failed to save setting ${key}:`, error);
    }
  }
  
  notifyListeners(setting, value) {
    const callbacks = this.listeners.get(setting);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(value, setting);
        } catch (error) {
          console.error(`Error in settings listener for ${setting}:`, error);
        }
      });
    }
  }
  
  // Event subscription
  onChange(setting, callback) {
    if (!this.listeners.has(setting)) {
      this.listeners.set(setting, new Set());
    }
    this.listeners.get(setting).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(setting);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }
  
  // Utility methods
  hexToRgba(hex, alpha) {
    let h = (hex || '').trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 3) {
      h = h.split('').map(ch => ch + ch).join('');
    }
    if (h.length !== 6) {
      return `rgba(30,41,59,${Math.max(0, Math.min(1, alpha || 0.10))})`;
    }
    
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const al = Math.max(0, Math.min(1, alpha || 0.10));
    
    return `rgba(${r},${g},${b},${al})`;
  }
}
