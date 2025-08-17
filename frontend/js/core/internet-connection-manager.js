/**
 * Internet Hub Connection Manager - Handles copilot connections to internet hub
 * Follows SRP - Only manages connections between copilots and internet hub
 */
class InternetConnectionManager {
  constructor(linkManager, eventBus = null) {
    this.linkManager = linkManager;
    this.eventBus = eventBus;
    this.linkedCopilots = new Set();
    this.LINK_KEY = 'internet-noden';
  }
  
  /**
   * Link a copilot to the internet hub
   */
  linkCopilot(copilot, startElement = null, endElement = null) {
    // Prevent duplicate links
    if (this.linkedCopilots.has(copilot.id)) {
      this.handleDuplicateLink(copilot);
      return false;
    }
    
    const linkResult = this.linkManager.createLink({
      source: { type: 'copilot', id: copilot.id, element: startElement },
      target: { type: 'internet', id: 'hub', element: endElement },
      linkKey: this.LINK_KEY
    });
    
    if (linkResult.success) {
      this.linkedCopilots.add(copilot.id);
      copilot.connections.set(this.LINK_KEY, linkResult.connection);
      
      this.emitEvent('internet:linked', { 
        copilotId: copilot.id,
        connection: linkResult.connection 
      });
      
      // Schedule connection update
      setTimeout(() => linkResult.connection.update?.(), 0);
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Unlink a copilot from the internet hub
   */
  unlinkCopilot(copilot) {
    if (!this.linkedCopilots.has(copilot.id)) {
      return false;
    }
    
    const connection = copilot.connections.get(this.LINK_KEY);
    if (connection) {
      try {
        connection.remove?.();
      } catch (error) {
        console.warn('Error removing connection:', error);
      }
      copilot.connections.delete(this.LINK_KEY);
    }
    
    this.linkedCopilots.delete(copilot.id);
    
    // Remove from persistence
    this.linkManager.removePersistentLink({
      fromType: 'copilot',
      fromId: copilot.id,
      toType: 'internet'
    });
    
    this.emitEvent('internet:unlinked', { copilotId: copilot.id });
    
    return true;
  }
  
  /**
   * Unlink all copilots from internet hub
   */
  unlinkAll() {
    const copilotIds = Array.from(this.linkedCopilots);
    const results = [];
    
    copilotIds.forEach(id => {
      const copilot = window?.CopilotManager?.instances?.get?.(id);
      if (copilot) {
        const result = this.unlinkCopilot(copilot);
        results.push({ copilotId: id, success: result });
      }
    });
    
    this.emitEvent('internet:all-unlinked', { results });
    
    return results;
  }
  
  /**
   * Check if copilot is linked to internet hub
   */
  isLinked(copilotId) {
    return this.linkedCopilots.has(copilotId);
  }
  
  /**
   * Get all linked copilot IDs
   */
  getLinkedCopilots() {
    return Array.from(this.linkedCopilots);
  }
  
  /**
   * Handle duplicate link attempt
   */
  handleDuplicateLink(copilot) {
    try {
      const connection = copilot.connections.get(this.LINK_KEY);
      if (connection?.lineId) {
        // Pulse existing connection
        window.ConnectionLayer?.pulse(connection.lineId, { duration: 700 });
      }
      
      if (window.toast) {
        window.toast('Redan kopplad: Internet.', 'info');
      }
    } catch (error) {
      console.warn('Error handling duplicate link:', error);
    }
  }
  
  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalLinked: this.linkedCopilots.size,
      linkedCopilots: this.getLinkedCopilots()
    };
  }
  
  /**
   * Emit event if event bus is available
   */
  emitEvent(eventName, data) {
    if (this.eventBus) {
      this.eventBus.emit(eventName, data);
    }
    
    // Also emit as DOM event for backward compatibility
    try {
      window.dispatchEvent(new CustomEvent(`examai:${eventName}`, { detail: data }));
    } catch (error) {
      console.warn('Error emitting DOM event:', error);
    }
  }
}

// Make InternetConnectionManager available globally
window.InternetConnectionManager = InternetConnectionManager;
