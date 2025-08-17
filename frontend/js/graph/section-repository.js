/**
 * Section Repository - Handles section data persistence
 * Follows SRP - Only manages section data storage
 */
class SectionRepository {
  constructor(storageProvider = null) {
    this.storage = storageProvider || StorageFactory.createWithFallback();
    this.keys = {
      titles: 'examai.sections.titles',
      bodies: 'examai.sections.bodies'
    };
  }
  
  /**
   * Get all section titles
   */
  getTitles() {
    try {
      const data = this.storage.getItem(this.keys.titles);
      return JSON.parse(data || '{}') || {};
    } catch {
      return {};
    }
  }
  
  /**
   * Save section titles
   */
  saveTitles(titles) {
    return this.storage.setItem(this.keys.titles, JSON.stringify(titles));
  }
  
  /**
   * Get title for specific section
   */
  getTitle(sectionKey) {
    const titles = this.getTitles();
    return titles[sectionKey] || null;
  }
  
  /**
   * Set title for specific section
   */
  setTitle(sectionKey, title) {
    const titles = this.getTitles();
    titles[sectionKey] = title;
    return this.saveTitles(titles);
  }
  
  /**
   * Get all section bodies
   */
  getBodies() {
    try {
      const data = this.storage.getItem(this.keys.bodies);
      return JSON.parse(data || '{}') || {};
    } catch {
      return {};
    }
  }
  
  /**
   * Save section bodies
   */
  saveBodies(bodies) {
    return this.storage.setItem(this.keys.bodies, JSON.stringify(bodies));
  }
  
  /**
   * Get body content for specific section
   */
  getBody(sectionKey) {
    const bodies = this.getBodies();
    return bodies[sectionKey] || null;
  }
  
  /**
   * Set body content for specific section
   */
  setBody(sectionKey, content) {
    const bodies = this.getBodies();
    bodies[sectionKey] = content;
    return this.saveBodies(bodies);
  }
  
  /**
   * Remove section data
   */
  removeSection(sectionKey) {
    const titles = this.getTitles();
    const bodies = this.getBodies();
    
    delete titles[sectionKey];
    delete bodies[sectionKey];
    
    const results = {
      titles: this.saveTitles(titles),
      bodies: this.saveBodies(bodies)
    };
    
    return results.titles && results.bodies;
  }
  
  /**
   * Export all section data
   */
  exportAll() {
    return {
      titles: this.getTitles(),
      bodies: this.getBodies(),
      timestamp: Date.now()
    };
  }
  
  /**
   * Import section data
   */
  importAll(data, merge = false) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid section data');
    }
    
    const results = {};
    
    if (data.titles) {
      if (merge) {
        const existing = this.getTitles();
        results.titles = this.saveTitles({ ...existing, ...data.titles });
      } else {
        results.titles = this.saveTitles(data.titles);
      }
    }
    
    if (data.bodies) {
      if (merge) {
        const existing = this.getBodies();
        results.bodies = this.saveBodies({ ...existing, ...data.bodies });
      } else {
        results.bodies = this.saveBodies(data.bodies);
      }
    }
    
    return results;
  }
}
