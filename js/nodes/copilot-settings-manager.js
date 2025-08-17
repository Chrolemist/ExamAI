/**
 * Copilot Settings Manager - Handles copilot-specific settings
 * Follows SRP - Only manages copilot settings
 */
class CopilotSettingsManager {
  constructor(copilotId, storageProvider = null) {
    this.copilotId = copilotId;
    this.storage = storageProvider || new LocalStorageProvider();
    this.prefix = `examai.copilot.${copilotId}`;
    this.globalPrefix = 'examai';
    this.listeners = new Map();
  }
  
  // Core settings getters with fallbacks to global settings
  getName() {
    return this.getWithFallback('name', 'CoWorker');
  }
  
  getModel() {
    const global = document.getElementById('modelSelect')?.value;
    return this.getWithFallback('model', global || 'gpt-4-mini');
  }
  
  getMaxTokens() {
    const value = this.getWithFallback('max_tokens', '3000');
    return Math.max(1, parseInt(value, 10) || 3000);
  }
  
  getTypingSpeed() {
    const value = this.getWithFallback('typing_speed', '10');
    return Math.max(1, parseInt(value, 10) || 10);
  }
  
  getRenderMode() {
    return this.getWithFallback('render_mode', 'raw');
  }
  
  getTopic() {
    return this.getSetting('topic', '');
  }
  
  getRole() {
    return this.getSetting('role', '');
  }
  
  getUseRole() {
    const value = this.getSetting('use_role', 'true');
    return value === 'true';
  }
  
  // Web search settings
  getWebEnabled() {
    const value = this.getSetting('web_enabled', 'false');
    return value === 'true';
  }
  
  getWebMaxResults() {
    const value = this.getSetting('web_max_results', '3');
    return Math.max(1, parseInt(value, 10) || 3);
  }
  
  getWebPerPageChars() {
    const value = this.getSetting('web_per_page_chars', '2000');
    return Math.max(100, parseInt(value, 10) || 2000);
  }
  
  getWebTotalChars() {
    const value = this.getSetting('web_total_chars', '6000');
    return Math.max(100, parseInt(value, 10) || 6000);
  }
  
  // Setters with validation and events
  setName(value) {
    const name = (value || '').trim() || 'CoWorker';
    this.setSetting('name', name);
    this.notifyChange('name', name);
  }
  
  setModel(value) {
    if (value && typeof value === 'string') {
      this.setSetting('model', value);
      this.notifyChange('model', value);
    }
  }
  
  setMaxTokens(value) {
    const tokens = Math.max(1, parseInt(value, 10) || 3000);
    this.setSetting('max_tokens', String(tokens));
    this.notifyChange('max_tokens', tokens);
  }
  
  setTypingSpeed(value) {
    const speed = Math.max(1, parseInt(value, 10) || 10);
    this.setSetting('typing_speed', String(speed));
    this.notifyChange('typing_speed', speed);
  }
  
  setRenderMode(value) {
    if (['raw', 'markdown', 'html'].includes(value)) {
      this.setSetting('render_mode', value);
      this.notifyChange('render_mode', value);
    }
  }
  
  setTopic(value) {
    this.setSetting('topic', value || '');
    this.notifyChange('topic', value);
  }
  
  setRole(value) {
    this.setSetting('role', value || '');
    this.notifyChange('role', value);
  }
  
  setUseRole(value) {
    const useRole = Boolean(value);
    this.setSetting('use_role', String(useRole));
    this.notifyChange('use_role', useRole);
  }
  
  setWebEnabled(value) {
    const enabled = Boolean(value);
    this.setSetting('web_enabled', String(enabled));
    this.notifyChange('web_enabled', enabled);
  }
  
  setWebMaxResults(value) {
    const maxResults = Math.max(1, parseInt(value, 10) || 3);
    this.setSetting('web_max_results', String(maxResults));
    this.notifyChange('web_max_results', maxResults);
  }
  
  setWebPerPageChars(value) {
    const chars = Math.max(100, parseInt(value, 10) || 2000);
    this.setSetting('web_per_page_chars', String(chars));
    this.notifyChange('web_per_page_chars', chars);
  }
  
  setWebTotalChars(value) {
    const chars = Math.max(100, parseInt(value, 10) || 6000);
    this.setSetting('web_total_chars', String(chars));
    this.notifyChange('web_total_chars', chars);
  }
  
  // Utility methods
  exportSettings() {
    const settings = {};
    const keys = [
      'name', 'model', 'max_tokens', 'typing_speed', 'render_mode',
      'topic', 'role', 'use_role', 'web_enabled', 'web_max_results',
      'web_per_page_chars', 'web_total_chars'
    ];
    
    keys.forEach(key => {
      const value = this.getSetting(key);
      if (value !== null) {
        settings[key] = value;
      }
    });
    
    return {
      copilotId: this.copilotId,
      settings,
      timestamp: Date.now()
    };
  }
  
  importSettings(exportData) {
    if (!exportData || !exportData.settings) {
      throw new Error('Invalid settings export data');
    }
    
    Object.entries(exportData.settings).forEach(([key, value]) => {
      this.setSetting(key, value);
    });
    
    this.notifyChange('imported', exportData);
  }
  
  resetToDefaults() {
    const keys = [
      'name', 'model', 'max_tokens', 'typing_speed', 'render_mode',
      'topic', 'role', 'use_role', 'web_enabled', 'web_max_results',
      'web_per_page_chars', 'web_total_chars'
    ];
    
    keys.forEach(key => {
      this.removeSetting(key);
    });
    
    this.notifyChange('reset', {});
  }
  
  // Event system
  onChange(setting, callback) {
    if (!this.listeners.has(setting)) {
      this.listeners.set(setting, new Set());
    }
    this.listeners.get(setting).add(callback);
    
    return () => {
      const callbacks = this.listeners.get(setting);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }
  
  // Private helper methods
  getWithFallback(key, defaultValue) {
    // Try copilot-specific setting first
    let value = this.getSetting(key);
    if (value !== null) return value;
    
    // Fall back to global setting
    value = this.storage.getItem(`${this.globalPrefix}.${key}`);
    if (value !== null) return value;
    
    // Return default
    return defaultValue;
  }
  
  getSetting(key, defaultValue = null) {
    return this.storage.getItem(`${this.prefix}.${key}`) || defaultValue;
  }
  
  setSetting(key, value) {
    const success = this.storage.setItem(`${this.prefix}.${key}`, value);
    if (!success) {
      console.warn(`Failed to save setting ${key} for copilot ${this.copilotId}`);
    }
    return success;
  }
  
  removeSetting(key) {
    return this.storage.removeItem(`${this.prefix}.${key}`);
  }
  
  notifyChange(setting, value) {
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
}
