/**
 * Node Connection Manager - Handles connections between nodes
 * Follows SRP - Only manages node connections
 */
class NodeConnectionManager {
  constructor(ownerNode) {
    this.ownerNode = ownerNode;
    this.connections = new Map(); // targetId -> connectionInfo
    this.inboundConnections = new Set(); // sourceIds
    this.linkLines = new Map(); // targetId -> Array<linkRecord>
  }
  
  /**
   * Connect to another node
   */
  connectTo(targetNode, options = {}) {
    if (!targetNode || !targetNode.getId) {
      throw new Error('Invalid target node');
    }
    
    const targetId = targetNode.getId();
    
    // Prevent duplicate connections
    if (this.connections.has(targetId)) {
      console.warn(`Already connected to ${targetId}`);
      return false;
    }
    
    const connectionInfo = {
      targetNode,
      targetId,
      timestamp: Date.now(),
      type: options.type || 'default',
      metadata: options.metadata || {}
    };
    
    this.connections.set(targetId, connectionInfo);
    
    // Create visual link if elements provided
    if (options.startEl && options.endEl) {
      this.createVisualLink(targetId, options.startEl, options.endEl, options);
    }
    
    // Notify target node of inbound connection
    if (targetNode.connectionManager) {
      targetNode.connectionManager.addInboundConnection(this.ownerNode.getId());
    }
    
    // Persist connection if persistence is available
    try {
      GraphPersistence?.addLink({
        fromType: this.ownerNode.constructor.name.toLowerCase(),
        fromId: this.ownerNode.getId(),
        fromSide: options.fromSide || 'x',
        toType: targetNode.constructor.name.toLowerCase(),
        toId: targetId,
        toSide: options.toSide || 'x'
      });
    } catch (error) {
      console.warn('Failed to persist connection:', error);
    }
    
    this.notifyConnectionChanged('connected', connectionInfo);
    return true;
  }
  
  /**
   * Disconnect from a node
   */
  disconnectFrom(targetId) {
    const connectionInfo = this.connections.get(targetId);
    if (!connectionInfo) {
      return false;
    }
    
    // Remove visual links
    this.removeVisualLinks(targetId);
    
    // Remove connection
    this.connections.delete(targetId);
    
    // Notify target node
    if (connectionInfo.targetNode && connectionInfo.targetNode.connectionManager) {
      connectionInfo.targetNode.connectionManager.removeInboundConnection(this.ownerNode.getId());
    }
    
    // Remove from persistence
    try {
      GraphPersistence?.removeWhere(link => 
        link.fromId === this.ownerNode.getId() && link.toId === targetId
      );
    } catch (error) {
      console.warn('Failed to remove persisted connection:', error);
    }
    
    this.notifyConnectionChanged('disconnected', connectionInfo);
    return true;
  }
  
  /**
   * Disconnect all connections
   */
  disconnectAll() {
    const targetIds = Array.from(this.connections.keys());
    targetIds.forEach(targetId => this.disconnectFrom(targetId));
  }
  
  /**
   * Add inbound connection reference
   */
  addInboundConnection(sourceId) {
    this.inboundConnections.add(sourceId);
  }
  
  /**
   * Remove inbound connection reference
   */
  removeInboundConnection(sourceId) {
    this.inboundConnections.delete(sourceId);
  }
  
  /**
   * Check if connected to target
   */
  isConnectedTo(targetId) {
    return this.connections.has(targetId);
  }
  
  /**
   * Get all connections
   */
  getConnections() {
    return Array.from(this.connections.values());
  }
  
  /**
   * Get connection by target ID
   */
  getConnection(targetId) {
    return this.connections.get(targetId);
  }
  
  /**
   * Create visual link between nodes
   */
  createVisualLink(targetId, startEl, endEl, options = {}) {
    try {
      const lineId = `link_${this.ownerNode.getId()}_${targetId}_${Date.now()}`;
      
      const linkRecord = Link.create({
        lineId,
        startEl,
        endEl,
        from: this.ownerNode.getId(),
        to: targetId,
        ...options
      });
      
      // Store link record
      const existingLinks = this.linkLines.get(targetId) || [];
      existingLinks.push(linkRecord);
      this.linkLines.set(targetId, existingLinks);
      
      return linkRecord;
    } catch (error) {
      console.error('Failed to create visual link:', error);
      return null;
    }
  }
  
  /**
   * Remove visual links for target
   */
  removeVisualLinks(targetId) {
    const links = this.linkLines.get(targetId);
    if (links) {
      links.forEach(linkRecord => {
        try {
          linkRecord.remove?.();
        } catch (error) {
          console.warn('Failed to remove visual link:', error);
        }
      });
      this.linkLines.delete(targetId);
    }
  }
  
  /**
   * Pulse a connection visually
   */
  pulseConnection(targetId, options = {}) {
    const links = this.linkLines.get(targetId);
    if (links && links.length > 0) {
      try {
        const lineId = links[0].lineId;
        ConnectionLayer?.pulse(lineId, options);
      } catch (error) {
        console.warn('Failed to pulse connection:', error);
      }
    }
  }
  
  /**
   * Notify about connection changes
   */
  notifyConnectionChanged(action, connectionInfo) {
    if (this.ownerNode.eventBus) {
      this.ownerNode.eventBus.emit('connection-changed', {
        action,
        connection: connectionInfo,
        ownerNode: this.ownerNode
      });
    }
  }
  
  /**
   * Get connection statistics
   */
  getStats() {
    return {
      outbound: this.connections.size,
      inbound: this.inboundConnections.size,
      total: this.connections.size + this.inboundConnections.size
    };
  }
  
  /**
   * Validate connection rules (override in subclasses)
   */
  canConnectTo(targetNode) {
    // Default: allow all connections
    return true;
  }
  
  /**
   * Cleanup all connections
   */
  destroy() {
    this.disconnectAll();
    
    // Clear inbound references
    this.inboundConnections.clear();
    
    // Clear visual links
    for (const targetId of this.linkLines.keys()) {
      this.removeVisualLinks(targetId);
    }
  }
}
