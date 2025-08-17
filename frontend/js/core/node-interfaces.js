/**
 * Node Interfaces - Segregated interfaces following ISP
 * Clients should not be forced to depend on interfaces they don't use
 */

// Base node interface
class INode {
  getId() { throw new Error('Must implement getId'); }
  getName() { throw new Error('Must implement getName'); }
  getElement() { throw new Error('Must implement getElement'); }
}

// Draggable behavior interface
class IDraggable {
  isDraggable() { throw new Error('Must implement isDraggable'); }
  setDraggable(enabled) { throw new Error('Must implement setDraggable'); }
  onDragStart() { throw new Error('Must implement onDragStart'); }
  onDragEnd() { throw new Error('Must implement onDragEnd'); }
}

// Connectable behavior interface  
class IConnectable {
  getConnectionPoints() { throw new Error('Must implement getConnectionPoints'); }
  canConnectTo(target) { throw new Error('Must implement canConnectTo'); }
  connectTo(target) { throw new Error('Must implement connectTo'); }
  disconnect(target) { throw new Error('Must implement disconnect'); }
}

// Positionable behavior interface
class IPositionable {
  getPosition() { throw new Error('Must implement getPosition'); }
  setPosition(x, y) { throw new Error('Must implement setPosition'); }
  savePosition() { throw new Error('Must implement savePosition'); }
  restorePosition() { throw new Error('Must implement restorePosition'); }
}

// Panel behavior interface
class IPanelNode {
  getPanel() { throw new Error('Must implement getPanel'); }
  showPanel() { throw new Error('Must implement showPanel'); }
  hidePanel() { throw new Error('Must implement hidePanel'); }
  isPanelVisible() { throw new Error('Must implement isPanelVisible'); }
}

// Settings behavior interface
class IConfigurable {
  getSettings() { throw new Error('Must implement getSettings'); }
  updateSettings(settings) { throw new Error('Must implement updateSettings'); }
  resetSettings() { throw new Error('Must implement resetSettings'); }
}

// History behavior interface
class IHistoryNode {
  getHistory() { throw new Error('Must implement getHistory'); }
  addToHistory(entry) { throw new Error('Must implement addToHistory'); }
  clearHistory() { throw new Error('Must implement clearHistory'); }
}

// Persistence behavior interface
class IPersistable {
  serialize() { throw new Error('Must implement serialize'); }
  deserialize(data) { throw new Error('Must implement deserialize'); }
  save() { throw new Error('Must implement save'); }
  load() { throw new Error('Must implement load'); }
}

// Factory interface for creating nodes
class INodeFactory {
  createNode(type, config) { throw new Error('Must implement createNode'); }
  getSupportedTypes() { throw new Error('Must implement getSupportedTypes'); }
}

// Connection interface
class IConnection {
  connect(from, to) { throw new Error('Must implement connect'); }
  disconnect() { throw new Error('Must implement disconnect'); }
  isConnected() { throw new Error('Must implement isConnected'); }
}

// Conversation participant interface
class IConversationParticipant {
  sendMessage(message) { throw new Error('Must implement sendMessage'); }
  receiveMessage(message) { throw new Error('Must implement receiveMessage'); }
  getParticipantId() { throw new Error('Must implement getParticipantId'); }
}

// History management interface
class IHistoryManager {
  addEntry(entry) { throw new Error('Must implement addEntry'); }
  getHistory() { throw new Error('Must implement getHistory'); }
  clearHistory() { throw new Error('Must implement clearHistory'); }
}

// Make available globally for backwards compatibility
window.INode = INode;
window.IDraggable = IDraggable;
window.IConnectable = IConnectable;
window.IPositionable = IPositionable;
window.IPanelNode = IPanelNode;
window.IConfigurable = IConfigurable;
window.IHistoryNode = IHistoryNode;
window.IPersistable = IPersistable;
window.INodeFactory = INodeFactory;
window.IConnection = IConnection;
window.IConversationParticipant = IConversationParticipant;
window.IHistoryManager = IHistoryManager;
