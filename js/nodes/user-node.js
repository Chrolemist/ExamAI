/**
 * User Node - Refactored to follow SOLID principles
 * Each responsibility is delegated to specialized managers
 */
class UserNode extends INode {
  constructor(dependencies = {}) {
    super();
    
    // Dependency injection
    this.settingsManager = dependencies.settingsManager || new UserSettingsManager();
    this.historyManager = dependencies.historyManager || new UserHistoryManager();
    this.positionManager = dependencies.positionManager || new FabPositionManager('examai.user');
    this.storageProvider = dependencies.storageProvider || StorageFactory.createWithFallback();
    
    // Core properties
    this.id = 'user';
    this.fab = null;
    this.panel = null;
    this.isInitialized = false;
    
    // Connection management
    this.connectionManager = new NodeConnectionManager(this);
    
    // Event system
    this.eventBus = this.createEventBus();
    
    this.init();
  }
  
  // INode implementation
  getId() { return this.id; }
  getName() { return this.settingsManager.getName(); }
  getElement() { return this.fab; }
  
  /**
   * Initialize the user node
   */
  init() {
    if (this.isInitialized) return;
    
    try {
      this.createComponents();
      this.setupEventListeners();
      this.restorePosition();
      this.isInitialized = true;
      this.eventBus.emit('user-node-initialized', { node: this });
    } catch (error) {
      console.error('Failed to initialize UserNode:', error);
      throw error;
    }
  }
  
  /**
   * Create FAB and panel components
   */
  createComponents() {
    // Create FAB using factory
    this.fab = UserNodeFactory.createFabElement({
      name: this.getName(),
      x: this.getPosition().x,
      y: this.getPosition().y
    });
    
    // Create panel using factory
    this.panel = UserNodeFactory.createPanelElement({
      settings: this.settingsManager,
      history: this.historyManager
    });
    
    // Append to DOM
    this.appendToDom();
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // FAB click handler
    this.fab.addEventListener('click', (e) => this.handleFabClick(e));
    
    // Panel close handler
    const closeBtn = this.panel.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }
    
    // Settings change listeners
    this.settingsManager.onChange('name', (name) => {
      this.updateName(name);
    });
    
    // History change listeners
    this.historyManager.onChange((action, data) => {
      this.handleHistoryChange(action, data);
    });
  }
  
  /**
   * Handle FAB click with drag delay check
   */
  handleFabClick(event) {
    // Check if this was a recent drag to avoid accidental panel toggle
    const now = Date.now();
    if (now - (this._recentDragTs || 0) < 300) {
      return;
    }
    
    if (this.isPanelVisible()) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }
  
  /**
   * Show panel with proper positioning and accessibility
   */
  showPanel() {
    const rect = this.fab.getBoundingClientRect();
    const panelWidth = this.panel.offsetWidth || 420;
    const panelHeight = this.panel.offsetHeight || 320;
    
    // Calculate position
    const x = Math.max(4, Math.min(window.innerWidth - panelWidth - 4, rect.left));
    const minTop = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
    const y = Math.max(minTop, Math.min(window.innerHeight - panelHeight - 4, rect.top - panelHeight - 12));
    
    // Position and show
    this.panel.style.left = x + 'px';
    this.panel.style.top = y + 'px';
    
    // Update aria-hidden BEFORE removing hidden class
    this.panel.setAttribute('aria-hidden', 'false');
    this.panel.classList.remove('hidden');
    
    requestAnimationFrame(() => {
      this.panel.classList.add('show');
    });
    
    this.eventBus.emit('panel-shown', { node: this });
  }
  
  /**
   * Hide panel with proper accessibility
   */
  hidePanel() {
    // Move focus back to FAB if panel contains focused element
    if (document.activeElement && this.panel.contains(document.activeElement)) {
      this.fab.focus();
    }
    
    this.panel.classList.remove('show');
    this.panel.setAttribute('aria-hidden', 'true');
    
    setTimeout(() => {
      this.panel.classList.add('hidden');
    }, 180);
    
    this.eventBus.emit('panel-hidden', { node: this });
  }
  
  /**
   * Check if panel is currently visible
   */
  isPanelVisible() {
    return !this.panel.classList.contains('hidden');
  }
  
  /**
   * Get current position
   */
  getPosition() {
    return this.positionManager.getPosition(this.id) || { x: 74, y: 40 };
  }
  
  /**
   * Set position and save
   */
  setPosition(x, y) {
    this.fab.style.left = x + 'px';
    this.fab.style.top = y + 'px';
    this.positionManager.savePosition(this.id, x, y);
    this.eventBus.emit('position-changed', { node: this, x, y });
  }
  
  /**
   * Restore position from storage
   */
  restorePosition() {
    const position = this.getPosition();
    this.fab.style.left = position.x + 'px';
    this.fab.style.top = position.y + 'px';
  }
  
  /**
   * Update display name
   */
  updateName(name) {
    this.fab.title = name;
    const label = this.fab.querySelector('.fab-label');
    if (label) {
      label.textContent = name;
    }
  }
  
  /**
   * Handle history changes
   */
  handleHistoryChange(action, data) {
    // Propagate to connected nodes if needed
    this.eventBus.emit('history-changed', { action, data, node: this });
  }
  
  /**
   * Append to DOM
   */
  appendToDom() {
    const nodeBoard = document.getElementById('nodeBoard');
    if (nodeBoard) {
      nodeBoard.appendChild(this.fab);
    } else {
      document.body.appendChild(this.fab);
    }
    
    document.body.appendChild(this.panel);
  }
  
  /**
   * Set drag timestamp (called by drag manager)
   */
  setRecentDragTimestamp(timestamp = Date.now()) {
    this._recentDragTs = timestamp;
  }
  
  /**
   * Create event bus
   */
  createEventBus() {
    const listeners = new Map();
    
    return {
      emit: (event, data) => {
        const callbacks = listeners.get(event);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in event listener for ${event}:`, error);
            }
          });
        }
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event).add(callback);
        
        return () => {
          const callbacks = listeners.get(event);
          if (callbacks) {
            callbacks.delete(callback);
          }
        };
      }
    };
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.fab && this.fab.parentNode) {
      this.fab.parentNode.removeChild(this.fab);
    }
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    
    this.eventBus.emit('user-node-destroyed', { node: this });
    this.isInitialized = false;
  }
}
