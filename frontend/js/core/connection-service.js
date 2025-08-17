/**
 * Connection Service - SOLID compliant connection management
 * Follows Single Responsibility Principle (SRP) - Connection logic only
 * Follows Open/Closed Principle (OCP) - Extensible through connection types
 * Follows Dependency Inversion Principle (DIP) - Event-based communication
 */

export class ConnectionService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.connections = new Map(); // connectionId -> connection data
    this.connectionsByNode = new Map(); // nodeId -> Set<connectionId>
    this.connectionLayers = new Map(); // layerId -> layer instance
    this.dragState = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Connection creation
    this.eventBus.on('connection:start-drag', (data) => {
      this.startConnectionDrag(data);
    });

    this.eventBus.on('connection:update-drag', (data) => {
      this.updateConnectionDrag(data);
    });

    this.eventBus.on('connection:end-drag', (data) => {
      this.endConnectionDrag(data);
    });

    // Connection management
    this.eventBus.on('connection:create', (data) => {
      this.createConnection(data);
    });

    this.eventBus.on('connection:remove', (data) => {
      this.removeConnection(data.connectionId);
    });

    this.eventBus.on('connection:remove-by-node', (data) => {
      this.removeConnectionsByNode(data.nodeId);
    });

    // Layer management
    this.eventBus.on('connection:register-layer', (data) => {
      this.registerConnectionLayer(data.layerId, data.layer);
    });

    // Connection point registration
    this.eventBus.on('connection:register-point', (data) => {
      this.registerConnectionPoint(data);
    });

    this.eventBus.on('connection:unregister-point', (data) => {
      this.unregisterConnectionPoint(data);
    });
  }

  // Start connection drag
  startConnectionDrag(data) {
    const { sourceNode, sourcePoint, startX, startY } = data;
    
    this.dragState = {
      id: this.generateConnectionId(),
      sourceNode,
      sourcePoint,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      isActive: true
    };

    // Create temporary visual connection
    this.createTemporaryConnection(this.dragState);
    
    this.eventBus.emit('connection:drag-started', {
      connectionId: this.dragState.id,
      sourceNode,
      sourcePoint
    });
  }

  // Update connection drag
  updateConnectionDrag(data) {
    if (!this.dragState || !this.dragState.isActive) return;

    const { x, y } = data;
    this.dragState.currentX = x;
    this.dragState.currentY = y;

    // Update temporary visual connection
    this.updateTemporaryConnection(this.dragState);
    
    this.eventBus.emit('connection:drag-updated', {
      connectionId: this.dragState.id,
      x,
      y
    });
  }

  // End connection drag
  endConnectionDrag(data) {
    if (!this.dragState || !this.dragState.isActive) return;

    const { targetNode, targetPoint, x, y } = data;
    const dragInfo = { ...this.dragState };
    
    // Clear drag state
    this.dragState = null;

    // Remove temporary connection
    this.removeTemporaryConnection(dragInfo.id);

    if (targetNode && targetPoint) {
      // Create actual connection
      this.createConnection({
        sourceNode: dragInfo.sourceNode,
        sourcePoint: dragInfo.sourcePoint,
        targetNode,
        targetPoint
      });
    }

    this.eventBus.emit('connection:drag-ended', {
      connectionId: dragInfo.id,
      completed: !!(targetNode && targetPoint),
      targetNode,
      targetPoint
    });
  }

  // Create a connection between two points
  createConnection(data) {
    const { sourceNode, sourcePoint, targetNode, targetPoint, id } = data;
    const connectionId = id || this.generateConnectionId();

    // Validate connection
    if (!this.isValidConnection(sourceNode, sourcePoint, targetNode, targetPoint)) {
      this.eventBus.emit('connection:creation-failed', {
        reason: 'Invalid connection parameters',
        data
      });
      return null;
    }

    // Check for existing connection
    if (this.hasConnection(sourceNode, sourcePoint, targetNode, targetPoint)) {
      this.eventBus.emit('connection:creation-failed', {
        reason: 'Connection already exists',
        data
      });
      return null;
    }

    const connection = {
      id: connectionId,
      sourceNode,
      sourcePoint,
      targetNode,
      targetPoint,
      created: Date.now(),
      type: this.determineConnectionType(sourcePoint, targetPoint)
    };

    // Store connection
    this.connections.set(connectionId, connection);
    
    // Update node mappings
    this.addConnectionToNode(sourceNode, connectionId);
    this.addConnectionToNode(targetNode, connectionId);

    // Create visual connection
    this.createVisualConnection(connection);

    this.eventBus.emit('connection:created', {
      connection,
      sourceNode,
      targetNode
    });

    return connection;
  }

  // Remove connection
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    // Remove from node mappings
    this.removeConnectionFromNode(connection.sourceNode, connectionId);
    this.removeConnectionFromNode(connection.targetNode, connectionId);

    // Remove visual connection
    this.removeVisualConnection(connection);

    // Remove from storage
    this.connections.delete(connectionId);

    this.eventBus.emit('connection:removed', {
      connection,
      connectionId
    });

    return true;
  }

  // Remove all connections for a node
  removeConnectionsByNode(nodeId) {
    const nodeConnections = this.connectionsByNode.get(nodeId);
    if (!nodeConnections) return;

    const connectionsToRemove = Array.from(nodeConnections);
    for (const connectionId of connectionsToRemove) {
      this.removeConnection(connectionId);
    }
  }

  // Register connection layer
  registerConnectionLayer(layerId, layer) {
    this.connectionLayers.set(layerId, layer);
    
    this.eventBus.emit('connection:layer-registered', {
      layerId,
      layer
    });
  }

  // Register connection point
  registerConnectionPoint(data) {
    const { nodeId, pointId, element, type = 'output' } = data;
    
    // Add connection point event listeners
    if (element) {
      element.addEventListener('mousedown', (e) => {
        this.handleConnectionPointMouseDown(e, nodeId, pointId, type);
      });

      element.addEventListener('mouseup', (e) => {
        this.handleConnectionPointMouseUp(e, nodeId, pointId, type);
      });

      element.addEventListener('mouseenter', (e) => {
        this.handleConnectionPointMouseEnter(e, nodeId, pointId, type);
      });

      element.addEventListener('mouseleave', (e) => {
        this.handleConnectionPointMouseLeave(e, nodeId, pointId, type);
      });
    }

    this.eventBus.emit('connection:point-registered', {
      nodeId,
      pointId,
      type
    });
  }

  // Unregister connection point
  unregisterConnectionPoint(data) {
    const { nodeId, pointId } = data;
    
    this.eventBus.emit('connection:point-unregistered', {
      nodeId,
      pointId
    });
  }

  // Handle connection point mouse events
  handleConnectionPointMouseDown(e, nodeId, pointId, type) {
    if (e.button !== 0) return; // Only left mouse button

    e.preventDefault();
    e.stopPropagation();

    if (type === 'output') {
      const rect = e.target.getBoundingClientRect();
      this.startConnectionDrag({
        sourceNode: nodeId,
        sourcePoint: pointId,
        startX: rect.left + rect.width / 2,
        startY: rect.top + rect.height / 2
      });
    }
  }

  handleConnectionPointMouseUp(e, nodeId, pointId, type) {
    if (!this.dragState || !this.dragState.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    if (type === 'input' && this.dragState.sourceNode !== nodeId) {
      this.endConnectionDrag({
        targetNode: nodeId,
        targetPoint: pointId,
        x: e.clientX,
        y: e.clientY
      });
    } else {
      this.endConnectionDrag({
        x: e.clientX,
        y: e.clientY
      });
    }
  }

  handleConnectionPointMouseEnter(e, nodeId, pointId, type) {
    if (this.dragState && this.dragState.isActive) {
      e.target.classList.add('connection-hover');
    }
  }

  handleConnectionPointMouseLeave(e, nodeId, pointId, type) {
    e.target.classList.remove('connection-hover');
  }

  // Create temporary visual connection during drag
  createTemporaryConnection(dragState) {
    const layer = this.getConnectionLayer();
    if (layer && layer.draw) {
      // Allow temporary connection
      layer.allow(dragState.id);
      
      // Draw from start point to current mouse position
      const sourcePoint = { x: dragState.startX, y: dragState.startY };
      const targetPoint = { x: dragState.currentX, y: dragState.currentY };
      
      layer.draw(dragState.id, sourcePoint, targetPoint);
    }
  }

  // Update temporary visual connection
  updateTemporaryConnection(dragState) {
    const layer = this.getConnectionLayer();
    if (layer && layer.draw) {
      // Update existing temporary connection
      const sourcePoint = { x: dragState.startX, y: dragState.startY };
      const targetPoint = { x: dragState.currentX, y: dragState.currentY };
      
      layer.draw(dragState.id, sourcePoint, targetPoint);
    }
  }

  // Remove temporary visual connection
  removeTemporaryConnection(connectionId) {
    const layer = this.getConnectionLayer();
    if (layer && layer.remove) {
      layer.remove(connectionId);
    }
  }

  // Create visual connection
  createVisualConnection(connection) {
    const layer = this.getConnectionLayer();
    if (layer && layer.draw) {
      // Get connection points for visual rendering
      const sourcePoint = this.getConnectionPointPosition(connection.sourceNode, connection.sourcePoint);
      const targetPoint = this.getConnectionPointPosition(connection.targetNode, connection.targetPoint);
      
      if (sourcePoint && targetPoint) {
        // Allow connection to be drawn
        layer.allow(connection.id);
        
        // Draw the visual connection
        layer.draw(connection.id, sourcePoint, targetPoint, {
          animate: { duration: 300 }
        });
      }
    }
  }

  // Remove visual connection
  removeVisualConnection(connection) {
    const layer = this.getConnectionLayer();
    if (layer && layer.remove) {
      layer.remove(connection.id);
    }
  }

  // Utility methods
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  isValidConnection(sourceNode, sourcePoint, targetNode, targetPoint) {
    return sourceNode && sourcePoint && targetNode && targetPoint && 
           sourceNode !== targetNode;
  }

  hasConnection(sourceNode, sourcePoint, targetNode, targetPoint) {
    for (const connection of this.connections.values()) {
      if (connection.sourceNode === sourceNode && 
          connection.sourcePoint === sourcePoint &&
          connection.targetNode === targetNode && 
          connection.targetPoint === targetPoint) {
        return true;
      }
    }
    return false;
  }

  determineConnectionType(sourcePoint, targetPoint) {
    // Simple type determination - can be extended
    return 'data';
  }

  addConnectionToNode(nodeId, connectionId) {
    if (!this.connectionsByNode.has(nodeId)) {
      this.connectionsByNode.set(nodeId, new Set());
    }
    this.connectionsByNode.get(nodeId).add(connectionId);
  }

  removeConnectionFromNode(nodeId, connectionId) {
    const nodeConnections = this.connectionsByNode.get(nodeId);
    if (nodeConnections) {
      nodeConnections.delete(connectionId);
      if (nodeConnections.size === 0) {
        this.connectionsByNode.delete(nodeId);
      }
    }
  }

  getConnectionLayer() {
    // Return the first available layer or main layer
    return this.connectionLayers.get('main') || 
           Array.from(this.connectionLayers.values())[0];
  }

  // Get connection point position for visual rendering
  getConnectionPointPosition(nodeId, pointId) {
    // Find the node element
    const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!nodeElement) {
      console.warn(`Node element not found for ${nodeId}`);
      return null;
    }

    // Find the connection point within the node
    const pointElement = nodeElement.querySelector(`[data-point-id="${pointId}"]`);
    if (!pointElement) {
      console.warn(`Connection point ${pointId} not found in node ${nodeId}`);
      return null;
    }

    // Get element position
    const rect = pointElement.getBoundingClientRect();
    
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  // Public API methods
  getConnections() {
    return new Map(this.connections);
  }

  getConnectionsByNode(nodeId) {
    const connectionIds = this.connectionsByNode.get(nodeId);
    if (!connectionIds) return [];

    return Array.from(connectionIds).map(id => this.connections.get(id)).filter(Boolean);
  }

  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  hasConnectionPoint(nodeId, pointId) {
    return this.getConnectionsByNode(nodeId).some(conn => 
      (conn.sourceNode === nodeId && conn.sourcePoint === pointId) ||
      (conn.targetNode === nodeId && conn.targetPoint === pointId)
    );
  }
}
