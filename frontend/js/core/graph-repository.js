/**
 * Graph Data Repository - Handles graph data persistence with proper DIP
 * Follows Repository Pattern and DIP
 */
class GraphRepository {
  constructor(storageProvider = null) {
    this.storage = storageProvider || StorageFactory.createWithFallback();
    this.keys = {
      copilots: 'examai.graph.copilots',
      links: 'examai.graph.links',
      positions: 'examai.graph.positions',
      metadata: 'examai.graph.metadata'
    };
  }
  
  // Copilot management
  getCopilots() {
    try {
      const data = this.storage.getItem(this.keys.copilots);
      const parsed = JSON.parse(data || '[]');
      return Array.isArray(parsed) ? Array.from(new Set(parsed)) : [];
    } catch {
      return [];
    }
  }
  
  saveCopilots(copilotIds) {
    const uniqueIds = Array.from(new Set(copilotIds));
    return this.storage.setItem(this.keys.copilots, JSON.stringify(uniqueIds));
  }
  
  addCopilot(copilotId) {
    const existing = this.getCopilots();
    if (!existing.includes(copilotId)) {
      existing.push(copilotId);
      return this.saveCopilots(existing);
    }
    return true;
  }
  
  removeCopilot(copilotId) {
    const existing = this.getCopilots();
    const filtered = existing.filter(id => id !== copilotId);
    return this.saveCopilots(filtered);
  }
  
  // Link management
  getLinks() {
    try {
      const data = this.storage.getItem(this.keys.links);
      const parsed = JSON.parse(data || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  
  saveLinks(links) {
    const validLinks = links.filter(link => this.isValidLink(link));
    return this.storage.setItem(this.keys.links, JSON.stringify(validLinks));
  }
  
  addLink(link) {
    if (!this.isValidLink(link)) {
      throw new Error('Invalid link format');
    }
    
    const existing = this.getLinks();
    const signature = this.getLinkSignature(link);
    
    // Check for duplicates
    const isDuplicate = existing.some(existingLink => 
      this.getLinkSignature(existingLink) === signature
    );
    
    if (!isDuplicate) {
      existing.push(link);
      return this.saveLinks(existing);
    }
    
    return true; // Already exists
  }
  
  removeLinks(predicate) {
    const existing = this.getLinks();
    const filtered = existing.filter(link => {
      try {
        return !predicate(link);
      } catch {
        return true; // Keep link if predicate fails
      }
    });
    
    return this.saveLinks(filtered);
  }
  
  removeLink(link) {
    const signature = this.getLinkSignature(link);
    return this.removeLinks(existingLink => 
      this.getLinkSignature(existingLink) === signature
    );
  }
  
  // Position management
  getPositions() {
    try {
      const data = this.storage.getItem(this.keys.positions);
      const parsed = JSON.parse(data || '{}');
      return typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  
  savePositions(positions) {
    return this.storage.setItem(this.keys.positions, JSON.stringify(positions));
  }
  
  getPosition(nodeId) {
    const positions = this.getPositions();
    return positions[nodeId] || null;
  }
  
  setPosition(nodeId, x, y) {
    const positions = this.getPositions();
    positions[nodeId] = { x, y, timestamp: Date.now() };
    return this.savePositions(positions);
  }
  
  removePosition(nodeId) {
    const positions = this.getPositions();
    delete positions[nodeId];
    return this.savePositions(positions);
  }
  
  // Metadata management
  getMetadata() {
    try {
      const data = this.storage.getItem(this.keys.metadata);
      const parsed = JSON.parse(data || '{}');
      return typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  
  saveMetadata(metadata) {
    return this.storage.setItem(this.keys.metadata, JSON.stringify(metadata));
  }
  
  setMetadata(key, value) {
    const metadata = this.getMetadata();
    metadata[key] = value;
    return this.saveMetadata(metadata);
  }
  
  getMetadataValue(key, defaultValue = null) {
    const metadata = this.getMetadata();
    return metadata[key] ?? defaultValue;
  }
  
  // Bulk operations
  exportAll() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      copilots: this.getCopilots(),
      links: this.getLinks(),
      positions: this.getPositions(),
      metadata: this.getMetadata()
    };
  }
  
  importAll(data, merge = false) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data');
    }
    
    const results = {
      copilots: false,
      links: false,
      positions: false,
      metadata: false
    };
    
    try {
      if (data.copilots) {
        if (merge) {
          const existing = this.getCopilots();
          const merged = Array.from(new Set([...existing, ...data.copilots]));
          results.copilots = this.saveCopilots(merged);
        } else {
          results.copilots = this.saveCopilots(data.copilots);
        }
      }
      
      if (data.links) {
        if (merge) {
          const existing = this.getLinks();
          const merged = this.mergeLinks(existing, data.links);
          results.links = this.saveLinks(merged);
        } else {
          results.links = this.saveLinks(data.links);
        }
      }
      
      if (data.positions) {
        if (merge) {
          const existing = this.getPositions();
          const merged = { ...existing, ...data.positions };
          results.positions = this.savePositions(merged);
        } else {
          results.positions = this.savePositions(data.positions);
        }
      }
      
      if (data.metadata) {
        if (merge) {
          const existing = this.getMetadata();
          const merged = { ...existing, ...data.metadata };
          results.metadata = this.saveMetadata(merged);
        } else {
          results.metadata = this.saveMetadata(data.metadata);
        }
      }
      
      return results;
      
    } catch (error) {
      console.error('Error during import:', error);
      throw error;
    }
  }
  
  clearAll() {
    const results = {
      copilots: this.storage.removeItem(this.keys.copilots),
      links: this.storage.removeItem(this.keys.links),
      positions: this.storage.removeItem(this.keys.positions),
      metadata: this.storage.removeItem(this.keys.metadata)
    };
    
    return results;
  }
  
  // Utility methods
  isValidLink(link) {
    return link && 
           typeof link.fromType === 'string' &&
           typeof link.toType === 'string' &&
           (typeof link.fromId === 'string' || typeof link.fromId === 'number') &&
           (typeof link.toId === 'string' || typeof link.toId === 'number');
  }
  
  getLinkSignature(link) {
    return `${link.fromType}:${link.fromId}:${link.fromSide || 'x'}->${link.toType}:${link.toId}:${link.toSide || 'x'}`;
  }
  
  mergeLinks(existing, newLinks) {
    const signatures = new Set(existing.map(link => this.getLinkSignature(link)));
    const uniqueNew = newLinks.filter(link => !signatures.has(this.getLinkSignature(link)));
    return [...existing, ...uniqueNew];
  }
  
  // Query methods
  getLinksBySource(fromType, fromId) {
    return this.getLinks().filter(link => 
      link.fromType === fromType && link.fromId === fromId
    );
  }
  
  getLinksByTarget(toType, toId) {
    return this.getLinks().filter(link => 
      link.toType === toType && link.toId === toId
    );
  }
  
  getLinksBetween(fromType, fromId, toType, toId) {
    return this.getLinks().filter(link => 
      link.fromType === fromType && link.fromId === fromId &&
      link.toType === toType && link.toId === toId
    );
  }
  
  getStats() {
    return {
      copilots: this.getCopilots().length,
      links: this.getLinks().length,
      positions: Object.keys(this.getPositions()).length,
      metadata: Object.keys(this.getMetadata()).length
    };
  }
}
