/**
 * Legacy Integration Service - SOLID compliant bridge for legacy modules
 * Follows Single Responsibility Principle (SRP) - Legacy integration only
 * Follows Open/Closed Principle (OCP) - Extensible for new legacy modules
 * Follows Dependency Inversion Principle (DIP) - Event-based communication
 */

export class LegacyIntegrationService {
  constructor(eventBus, container) {
    this.eventBus = eventBus;
    this.container = container;
    this.legacyModules = new Map();
    this.initialized = false;
  }

  // Initialize legacy integration
  async initialize() {
    if (this.initialized) return;

    // Initialize legacy modules in correct order
    await this.initializeLegacyModules();
    
    // Setup legacy event bridges
    this.setupLegacyEventBridges();
    
    // Expose legacy globals
    this.exposeLegacyGlobals();

    this.initialized = true;
    this.eventBus.emit('legacy:initialized');
  }

  // Initialize legacy modules
  async initializeLegacyModules() {
    try {
      // Import legacy modules
      const modules = await this.importLegacyModules();
      
      // Initialize in dependency order
      await this.initializeConnectionLayer(modules);
      await this.initializeConnectionManager(modules);
      await this.initializeIORegistry(modules);
      await this.initializeInternetHub(modules);
      await this.initializeBoardSections(modules);
      await this.initializeNodeBoard(modules);
      await this.initializeCopilotManager(modules);
      await this.initializeUserNode(modules);
      await this.initializeGraphPersistence(modules);

    } catch (error) {
      console.error('Failed to initialize legacy modules:', error);
      this.eventBus.emit('legacy:initialization-failed', { error });
    }
  }

  // Import all legacy modules
  async importLegacyModules() {
    const imports = await Promise.all([
      import('../dom.js'),
      import('../ui.js'),
      import('../graph/connection-layer.js'),
      import('../graph/link.js'),
      import('../graph/internet-hub.js'),
      import('../graph/graph-persistence.js'),
      import('../graph/board-sections.js'),
      import('../graph/node-board.js'),
      import('../graph/io-registry.js'),
      import('../graph/conversation-manager.js'),
      import('../nodes/copilot-instance.js'),
      import('./connection-manager.js'),
      import('../nodes/user-node-refactored.js')
    ]);

    return {
      dom: imports[0],
      ui: imports[1],
      connectionLayer: imports[2],
      link: imports[3],
      internetHub: imports[4],
      graphPersistence: imports[5],
      boardSections: imports[6],
      nodeBoard: imports[7],
      ioRegistry: imports[8],
      conversationManager: imports[9],
      copilotInstance: imports[10],
      connectionManager: imports[11],
      userNode: imports[12]
    };
  }

  // Initialize Connection Layer
  async initializeConnectionLayer(modules) {
    try {
      const { ConnectionLayer } = modules.connectionLayer;
      this.legacyModules.set('connectionLayer', ConnectionLayer);
      
      // Register with connection service (bridge to new system)
      const connectionService = this.container.get('connectionService');
      connectionService.registerConnectionLayer('main', ConnectionLayer);
      
      this.eventBus.emit('legacy:connection-layer-initialized');
    } catch (error) {
      console.error('Failed to initialize ConnectionLayer:', error);
    }
  }

  // Initialize Connection Manager
  async initializeConnectionManager(modules) {
    try {
      const { getConnectionManager } = modules.connectionManager;
      const connectionManager = getConnectionManager();
      this.legacyModules.set('connectionManager', connectionManager);
      
      // Make it globally available for legacy modules
      if (typeof window !== 'undefined') {
        window.connectionManager = connectionManager;
      }
      
      console.log('Legacy connection manager initialized');
      this.eventBus.emit('legacy:connection-manager-initialized');
    } catch (error) {
      console.error('Failed to initialize connection manager:', error);
    }
  }

  // Initialize IORegistry
  async initializeIORegistry(modules) {
    try {
      const { IORegistry } = modules.ioRegistry;
      this.legacyModules.set('ioRegistry', IORegistry);
      
      // Make it globally available
      if (typeof window !== 'undefined') {
        window.IORegistry = IORegistry;
      }
      
      console.log('IORegistry initialized');
      this.eventBus.emit('legacy:io-registry-initialized');
    } catch (error) {
      console.error('Failed to initialize IORegistry:', error);
    }
  }

  // Initialize Internet Hub
  async initializeInternetHub(modules) {
    try {
      const { InternetHub } = modules.internetHub;
      this.legacyModules.set('internetHub', InternetHub);
      
      // Initialize hub element
      InternetHub.element();
      
      this.eventBus.emit('legacy:internet-hub-initialized');
    } catch (error) {
      console.error('Failed to initialize InternetHub:', error);
    }
  }

  // Initialize Board Sections
  async initializeBoardSections(modules) {
    try {
      const { BoardSections } = modules.boardSections;
      this.legacyModules.set('boardSections', BoardSections);
      
      // Initialize board sections
      BoardSections.init();
      
      this.eventBus.emit('legacy:board-sections-initialized');
    } catch (error) {
      console.error('Failed to initialize BoardSections:', error);
    }
  }

  // Initialize Node Board
  async initializeNodeBoard(modules) {
    try {
      const { NodeBoard } = modules.nodeBoard;
      this.legacyModules.set('nodeBoard', NodeBoard);
      
      // Initialize node board
      NodeBoard.init();
      
      // Setup board maintenance
      this.setupBoardMaintenance(NodeBoard);
      
      this.eventBus.emit('legacy:node-board-initialized');
    } catch (error) {
      console.error('Failed to initialize NodeBoard:', error);
    }
  }

  // Initialize Copilot Manager
  async initializeCopilotManager(modules) {
    try {
      const { CopilotManager } = modules.copilotInstance;
      this.legacyModules.set('copilotManager', CopilotManager);
      
      // Setup copilot button
      document.getElementById('addCopilotBtn')?.addEventListener('click', () => {
        CopilotManager.add();
      });
      
      this.eventBus.emit('legacy:copilot-manager-initialized');
    } catch (error) {
      console.error('Failed to initialize CopilotManager:', error);
    }
  }

  // Initialize User Node
  async initializeUserNode(modules) {
    try {
      const { UserNodeManager } = modules.userNode;
      this.legacyModules.set('userNodeManager', UserNodeManager);
      
      // Create user node instance
      const userNodeInstance = UserNodeManager.getInstance();
      
      // Create legacy bridge
      const UserNodeBridge = this.createUserNodeBridge(userNodeInstance);
      this.legacyModules.set('userNodeBridge', UserNodeBridge);
      
      this.eventBus.emit('legacy:user-node-initialized');
    } catch (error) {
      console.error('Failed to initialize UserNode:', error);
    }
  }

  // Initialize Graph Persistence
  async initializeGraphPersistence(modules) {
    try {
      const { GraphPersistence } = modules.graphPersistence;
      this.legacyModules.set('graphPersistence', GraphPersistence);
      
      // Restore saved graph
      const restoreContext = {
        InternetHub: this.legacyModules.get('internetHub'),
        UserNode: this.legacyModules.get('userNodeBridge'),
        CopilotManager: this.legacyModules.get('copilotManager'),
        BoardSections: this.legacyModules.get('boardSections')
      };
      
      GraphPersistence.restore(restoreContext);
      
      this.eventBus.emit('legacy:graph-persistence-initialized');
    } catch (error) {
      console.error('Failed to initialize GraphPersistence:', error);
    }
  }

  // Setup board maintenance
  setupBoardMaintenance(NodeBoard) {
    const update = () => {
      try {
        NodeBoard.updateOffset?.();
        window.dispatchEvent(new CustomEvent('examai:fab:moved'));
      } catch (error) {
        console.error('Board maintenance error:', error);
      }
    };

    // Initial update
    update();

    // Update on resize
    window.addEventListener('resize', update, { passive: true });

    // Update on UI changes
    this.eventBus.on('ui:layout-changed', update);
  }

  // Create User Node Bridge for legacy compatibility
  createUserNodeBridge(userNodeInstance) {
    return {
      ensure: () => userNodeInstance,
      
      linkFromCopilot: (inst, startEl = null, endEl = null) => {
        try {
          userNodeInstance.linkFromCopilot(inst, startEl, endEl);
        } catch (error) {
          console.error('User node link error:', error);
        }
      },
      linkToCopilot: (inst, startEl = null, endEl = null) => {
        try {
          userNodeInstance.linkToCopilot(inst, startEl, endEl);
        } catch (error) {
          console.error('User node linkToCopilot error:', error);
        }
      },
      
    getLinkLineIdFor: (copilotId, dir = 'out') => {
        try {
      return userNodeInstance.getLinkLineIdFor?.(copilotId, dir) || null;
        } catch {
          return null;
        }
      },
      
      unlinkFor: (copilotId) => {
        try {
          userNodeInstance.unlinkCopilot?.(copilotId);
        } catch (error) {
          console.error('User node unlink error:', error);
        }
      },
      
  linkFromCopilotSides: (inst, fromSide, toSide) => this.linkFromCopilot(inst),
  linkToCopilotSides: (inst, fromSide, toSide) => this.linkToCopilot(inst),
      
      linkToSectionByKey: (key) => {
        // Section linking implementation
        console.log('Section linking not yet implemented in new architecture');
      }
    };
  }

  // Setup legacy event bridges
  setupLegacyEventBridges() {
    // Bridge service events to legacy globals
    this.eventBus.on('api:server-key-status', (data) => {
      try {
        window.__ExamAI_hasServerKey = data.hasKey;
        window.dispatchEvent(new CustomEvent('examai:serverKeyStatusChanged'));
      } catch {}
    });

    this.eventBus.on('user:name-changed', (data) => {
      try {
        window.dispatchEvent(new CustomEvent('examai:userNameChanged', { 
          detail: data 
        }));
      } catch {}
    });

    this.eventBus.on('flow:paused', () => {
      try {
        window.dispatchEvent(new CustomEvent('examai:flowPaused'));
      } catch {}
    });

    this.eventBus.on('flow:resumed', () => {
      try {
        window.dispatchEvent(new CustomEvent('examai:flowResumed'));
      } catch {}
    });
  }

  // Expose legacy globals for backwards compatibility
  exposeLegacyGlobals() {
    const { toast } = this.legacyModules.get('ui') || {};
    const apiService = this.container.get('apiService');
    const userService = this.container.get('userService');
    const gridService = this.container.get('gridService');
    const flowManager = this.container.get('flowManager');

    try {
      // UI globals
      if (toast) {
        window.toast = toast;
      }

      // API globals
      window.API_BASE_URL = apiService.getBaseUrl();
      window.__ExamAI_hasServerKey = apiService.hasKey();

      // User globals
      window.getGlobalUserName = () => userService.getUserName();

      // Grid globals
      window.GridSnap = {
        showAt: (x, y) => gridService.showGuides(x, y),
        hide: () => gridService.hideGuides(),
        snap: (x, y) => gridService.snap(x, y),
        gridSize: gridService.gridSize
      };

      // Flow globals
      window.PauseManager = {
        isPaused: () => flowManager.isPaused(),
        setPaused: (paused) => flowManager.setPaused(paused),
        toggle: () => flowManager.toggle(),
        queueIndependent: (id, msg) => flowManager.queueMessage(id, msg),
        resumeAll: () => flowManager.resumeAll(),
        _queue: flowManager.getQueueStatus().queuesByCopilot
      };

      // Module globals - CRITICAL: Make sure ConnectionLayer is available
      window.CopilotManager = this.legacyModules.get('copilotManager');
      window.BoardSections = this.legacyModules.get('boardSections');
      window.__ExamAI_UserNodeApi = this.legacyModules.get('userNodeBridge');
      window.ConnectionLayer = this.legacyModules.get('connectionLayer');
      window.InternetHub = this.legacyModules.get('internetHub');
      window.IORegistry = this.legacyModules.get('ioRegistry');

      // Connection manager
      window.connectionManager = this.legacyModules.get('connectionManager');

    } catch (error) {
      console.error('Failed to expose legacy globals:', error);
    }
  }

  // Get legacy module
  getLegacyModule(name) {
    return this.legacyModules.get(name);
  }

  // Check if legacy integration is initialized
  isInitialized() {
    return this.initialized;
  }
}
