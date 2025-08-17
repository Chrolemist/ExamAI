/**
 * Application Bootstrap - SOLID compliant application initialization
 * Follows Single Responsibility Principle (SRP) - Application startup only
 * Follows Dependency Inversion Principle (DIP) - Service-based architecture
 */

import { ApplicationContainer } from './js/core/application-container.js';
import { LegacyIntegrationService } from './js/core/legacy-integration-service.js';

// Application configuration
const APP_CONFIG = {
  apiBaseUrl: 'http://localhost:8000',
  gridSize: 24,
  storagePrefix: 'examai'
};

// Application Bootstrap Class
class ApplicationBootstrap {
  constructor() {
    this.container = new ApplicationContainer();
    this.initialized = false;
  }

  // Initialize entire application
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize service container
      await this.container.initialize();

      // Register application services
      this.registerApplicationServices();

      // Initialize legacy integration
      await this.initializeLegacyIntegration();

      // Setup application event handlers
      this.setupApplicationHandlers();

      // Initialize modules
      await this.initializeModules();

      this.initialized = true;
      
      // Emit application ready event
      this.container.emit('app:initialized', { 
        timestamp: Date.now(),
        config: APP_CONFIG 
      });

      console.log('🚀 ExamAI Application initialized with SOLID architecture');

    } catch (error) {
      console.error('❌ Failed to initialize application:', error);
      this.container.emit('app:initialization-failed', { error });
    }
  }

  // Register application-specific services
  registerApplicationServices() {
    // API Service
    this.container.register('apiService', () => {
      return new APIService(APP_CONFIG.apiBaseUrl, this.container.get('eventBus'));
    }, ['eventBus']);

    // Grid Service
    this.container.register('gridService', () => {
      return new GridService(APP_CONFIG.gridSize, this.container.get('eventBus'));
    }, ['eventBus']);

    // User Service
    this.container.register('userService', () => {
      return new UserService(this.container.get('eventBus'), this.container.get('storageService'));
    }, ['eventBus', 'storageService']);

    // Legacy Integration Service
    this.container.register('legacyIntegrationService', () => {
      return new LegacyIntegrationService(this.container.get('eventBus'), this.container);
    }, ['eventBus']);
  }

  // Initialize legacy integration
  async initializeLegacyIntegration() {
    const legacyService = this.container.get('legacyIntegrationService');
    await legacyService.initialize();
  }

  // Setup global application event handlers
  setupApplicationHandlers() {
    const eventBus = this.container.get('eventBus');

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'p':
            e.preventDefault();
            eventBus.emit('flow:toggle');
            break;
          case 's':
            e.preventDefault();
            eventBus.emit('app:save-state');
            break;
          case 'n':
            e.preventDefault();
            eventBus.emit('copilot:add');
            break;
        }
      }
    });

    // Window resize handling
    window.addEventListener('resize', () => {
      eventBus.emit('app:window-resized');
    });

    // Application state persistence
    eventBus.on('app:save-state', () => {
      this.saveApplicationState();
    });

    // Automatic state saving
    setInterval(() => {
      eventBus.emit('app:auto-save');
    }, 30000); // Auto-save every 30 seconds
  }

  // Initialize application modules
  async initializeModules() {
    const eventBus = this.container.get('eventBus');
    
    // Initialize modules in correct order
    const modules = [
      'connectionService',
      'uiManager',
      'flowManager',
      'userService'
    ];

    for (const moduleName of modules) {
      try {
        const module = this.container.get(moduleName);
        if (module.initializeUI) {
          await module.initializeUI();
        }
        eventBus.emit('module:initialized', { moduleName });
      } catch (error) {
        console.error(`Failed to initialize module ${moduleName}:`, error);
      }
    }
  }

  // Save application state to storage
  saveApplicationState() {
    const eventBus = this.container.get('eventBus');
    
    // Emit save events for all modules
    eventBus.emit('user:save-preferences');
    eventBus.emit('flow:save-state');
  }

  // Get service from container
  getService(name) {
    return this.container.get(name);
  }

  // Check if application is initialized
  isInitialized() {
    return this.initialized;
  }
}

// Simple services for application functionality
class APIService {
  constructor(baseUrl, eventBus) {
    this.baseUrl = baseUrl;
    this.eventBus = eventBus;
    this.hasServerKey = false;
    this.checkServerKey();
  }

  async checkServerKey() {
    try {
      const response = await fetch(`${this.baseUrl}/key-status`);
      const data = await response.json();
      this.hasServerKey = !!(data && data.hasKey);
      
      this.eventBus.emit('api:server-key-status', { 
        hasKey: this.hasServerKey 
      });
    } catch (error) {
      console.error('Failed to check server key:', error);
    }
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  hasKey() {
    return this.hasServerKey;
  }
}

class GridService {
  constructor(gridSize, eventBus) {
    this.gridSize = gridSize;
    this.eventBus = eventBus;
    this.guides = { vertical: null, horizontal: null };
    this.createGuides();
  }

  createGuides() {
    this.guides.vertical = document.createElement('div');
    this.guides.horizontal = document.createElement('div');
    
    this.guides.vertical.className = 'grid-guide v';
    this.guides.horizontal.className = 'grid-guide h';
    
    document.body.appendChild(this.guides.vertical);
    document.body.appendChild(this.guides.horizontal);
  }

  snap(x, y) {
    return {
      x: Math.round(x / this.gridSize) * this.gridSize,
      y: Math.round(y / this.gridSize) * this.gridSize
    };
  }

  showGuides(x, y) {
    const snapped = this.snap(x, y);
    this.guides.vertical.style.display = 'block';
    this.guides.horizontal.style.display = 'block';
    this.guides.vertical.style.left = snapped.x + 'px';
    this.guides.horizontal.style.top = snapped.y + 'px';
  }

  hideGuides() {
    this.guides.vertical.style.display = 'none';
    this.guides.horizontal.style.display = 'none';
  }
}

class UserService {
  constructor(eventBus, storageService) {
    this.eventBus = eventBus;
    this.storageService = storageService;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.eventBus.on('user:save-preferences', () => this.savePreferences());
    this.eventBus.on('user:restore-preferences', () => this.restorePreferences());
  }

  getUserName() {
    return this.storageService.get('user.name', 'Du');
  }

  setUserName(name) {
    this.storageService.set('user.name', name);
    this.eventBus.emit('user:name-changed', { name });
  }

  savePreferences() {
    this.eventBus.emit('user:preferences-saved');
  }

  restorePreferences() {
    this.eventBus.emit('user:preferences-restored');
  }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

async function initializeApp() {
  const bootstrap = new ApplicationBootstrap();
  await bootstrap.initialize();
  
  // Expose bootstrap globally for debugging
  window.__ExamAI_Bootstrap = bootstrap;
}
