/**
 * Connection Manager - Central manager for handling connections between nodes
 * Follows Single Responsibility Principle (SRP) - Manages connections only
 * Follows Open/Closed Principle (OCP) - Extensible for new connection types
 * Follows Dependency Inversion Principle (DIP) - Depends on abstractions
 */
class ConnectionManager {
  constructor() {
    this.connections = new Map(); // connId -> {from, to, lineId, type}
    this.nodeConnections = new Map(); // nodeId -> Set of connection IDs
    this.eventBus = this.createEventBus();
  }

  /**
   * Create a connection between two nodes
   * @param {Object} connectionInfo - Connection information
   * @returns {string} - Connection ID
   */
  createConnection({ fromNode, toNode, lineId, type = 'default' }) {
    const connId = this.generateConnectionId(fromNode.id, toNode.id);
    
    const connection = {
      id: connId,
      from: fromNode,
      to: toNode,
      lineId,
      type,
      createdAt: Date.now()
    };

    // Store connection
    this.connections.set(connId, connection);
    
    // Track connections for each node
    this.addNodeConnection(fromNode.id, connId);
    this.addNodeConnection(toNode.id, connId);

    // Emit connection created event
    this.eventBus.emit('connection-created', {
      connectionId: connId,
      connection,
      affectedNodes: [fromNode.id, toNode.id]
    });

    return connId;
  }

  /**
   * Remove a connection by ID
   * @param {string} connectionId - Connection ID to remove
   * @returns {boolean} - Success status
   */
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      console.warn(`Connection ${connectionId} not found`);
      return false;
    }

    // Remove visual connection
    try {
      if (window.ConnectionLayer && connection.lineId) {
        window.ConnectionLayer.remove(connection.lineId);
      }
    } catch (error) {
      console.warn('Failed to remove visual connection:', error);
    }

    // Remove from node tracking
    this.removeNodeConnection(connection.from.id, connectionId);
    this.removeNodeConnection(connection.to.id, connectionId);

    // Remove from connections
    this.connections.delete(connectionId);

    // Notify both nodes about disconnection
    this.notifyNodeDisconnected(connection.from, connection.to, connectionId);
    this.notifyNodeDisconnected(connection.to, connection.from, connectionId);

    // Emit connection removed event
    this.eventBus.emit('connection-removed', {
      connectionId,
      connection,
      affectedNodes: [connection.from.id, connection.to.id]
    });

    return true;
  }

  /**
   * Remove all connections for a specific node
   * @param {string} nodeId - Node ID
   */
  removeAllConnectionsFor(nodeId) {
    const nodeConnectionIds = this.nodeConnections.get(nodeId) || new Set();
    const connectionIds = Array.from(nodeConnectionIds);
    
    const removedConnections = [];
    connectionIds.forEach(connId => {
      if (this.removeConnection(connId)) {
        removedConnections.push(connId);
      }
    });

    // Emit batch removal event
    this.eventBus.emit('connections-removed-batch', {
      nodeId,
      removedConnections,
      count: removedConnections.length
    });

    return removedConnections;
  }

  /**
   * Remove connection between two specific nodes
   * @param {string} nodeId1 - First node ID
   * @param {string} nodeId2 - Second node ID
   */
  removeConnectionBetween(nodeId1, nodeId2) {
    const connections = this.getConnectionsBetween(nodeId1, nodeId2);
    
    connections.forEach(conn => {
      this.removeConnection(conn.id);
    });

    return connections.length > 0;
  }

  /**
   * Get all connections involving a node
   * @param {string} nodeId - Node ID
   * @returns {Array} - Array of connections
   */
  getConnectionsFor(nodeId) {
    const nodeConnectionIds = this.nodeConnections.get(nodeId) || new Set();
    return Array.from(nodeConnectionIds)
      .map(connId => this.connections.get(connId))
      .filter(Boolean);
  }

  /**
   * Get connections between two specific nodes
   * @param {string} nodeId1 - First node ID
   * @param {string} nodeId2 - Second node ID
   * @returns {Array} - Array of connections between the nodes
   */
  getConnectionsBetween(nodeId1, nodeId2) {
    return Array.from(this.connections.values()).filter(conn => 
      (conn.from.id === nodeId1 && conn.to.id === nodeId2) ||
      (conn.from.id === nodeId2 && conn.to.id === nodeId1)
    );
  }

  /**
   * Check if two nodes are connected
   * @param {string} nodeId1 - First node ID
   * @param {string} nodeId2 - Second node ID
   * @returns {boolean} - True if connected
   */
  areNodesConnected(nodeId1, nodeId2) {
    return this.getConnectionsBetween(nodeId1, nodeId2).length > 0;
  }

  /**
   * Generate unique connection ID
   * @private
   */
  generateConnectionId(fromId, toId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `conn_${fromId}_${toId}_${timestamp}_${random}`;
  }

  /**
   * Add connection tracking for a node
   * @private
   */
  addNodeConnection(nodeId, connectionId) {
    if (!this.nodeConnections.has(nodeId)) {
      this.nodeConnections.set(nodeId, new Set());
    }
    this.nodeConnections.get(nodeId).add(connectionId);
  }

  /**
   * Remove connection tracking for a node
   * @private
   */
  removeNodeConnection(nodeId, connectionId) {
    const nodeConnections = this.nodeConnections.get(nodeId);
    if (nodeConnections) {
      nodeConnections.delete(connectionId);
      if (nodeConnections.size === 0) {
        this.nodeConnections.delete(nodeId);
      }
    }
  }

  /**
   * Notify a node that it has been disconnected
   * @private
   */
  notifyNodeDisconnected(node, otherNode, connectionId) {
    try {
      // Update node's internal state
      if (node.connections && node.connections.has(otherNode.id)) {
        node.connections.delete(otherNode.id);
      }

      // Update flow connections
      if (node.flowInId === otherNode.id) {
        node.flowInId = null;
      }
      if (node.flowOutId === otherNode.id) {
        node.flowOutId = null;
      }

      // Clear neighbor sets
      if (node.inNeighbors) {
        node.inNeighbors.delete(otherNode.id);
      }
      if (node.outNeighbors) {
        node.outNeighbors.delete(otherNode.id);
      }

      // Emit node-specific disconnection event
      this.eventBus.emit('node-disconnected', {
        nodeId: node.id,
        disconnectedFromId: otherNode.id,
        connectionId
      });

    } catch (error) {
      console.warn(`Failed to notify node ${node.id} about disconnection:`, error);
    }
  }

  /**
   * Create simple event bus
   * @private
   */
  createEventBus() {
    const listeners = new Map();
    
    return {
      emit: (event, data) => {
        const eventListeners = listeners.get(event) || [];
        eventListeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in connection event listener for '${event}':`, error);
          }
        });
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(callback);
      },
      
      off: (event, callback) => {
        const eventListeners = listeners.get(event);
        if (eventListeners) {
          const index = eventListeners.indexOf(callback);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      }
    };
  }

  /**
   * Get current state of all connections
   */
  getState() {
    return {
      totalConnections: this.connections.size,
      totalNodes: this.nodeConnections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        from: conn.from.id,
        to: conn.to.id,
        type: conn.type,
        lineId: conn.lineId
      }))
    };
  }

  /**
   * Clear all connections
   */
  clear() {
    // Remove all visual connections
    this.connections.forEach(conn => {
      try {
        if (window.ConnectionLayer && conn.lineId) {
          window.ConnectionLayer.remove(conn.lineId);
        }
      } catch (error) {
        console.warn('Failed to remove visual connection during clear:', error);
      }
    });

    this.connections.clear();
    this.nodeConnections.clear();
    
    this.eventBus.emit('connections-cleared');
  }
}

// Global instance
let globalConnectionManager = null;

/**
 * Get or create global connection manager instance
 */
function getConnectionManager() {
  if (!globalConnectionManager) {
    globalConnectionManager = new ConnectionManager();
  }
  return globalConnectionManager;
}

// Export for ES6 modules
export { ConnectionManager, getConnectionManager };

// Also make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.ConnectionManager = ConnectionManager;
  window.getConnectionManager = getConnectionManager;
}
