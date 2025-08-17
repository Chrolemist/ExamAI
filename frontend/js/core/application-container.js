/**
 * Application Container - SOLID compliant dependency injection container
 * Follows Single Responsibility Principle (SRP) - Service management only
 * Follows Open/Closed Principle (OCP) - Extensible through service registration
 * Follows Dependency Inversion Principle (DIP) - Interface-based service injection
 */

import { EventBus } from './event-bus.js';
import { UINotificationService } from './ui-notification-service.js';
import { StorageService } from './storage-service.js';
import { FlowManager } from './flow-manager.js';
import { UIManager } from './ui-manager.js';
import { ConnectionService } from './connection-service.js';

export class ApplicationContainer {
  constructor() {
    this.services = new Map();
    this.initialized = false;
    this.initializationQueue = [];
  }

  // Register a service with optional dependencies
  register(name, factory, dependencies = []) {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, {
      name,
      factory,
      dependencies,
      instance: null,
      initialized: false
    });
  }

  // Get service instance (lazy initialization)
  get(name) {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' is not registered`);
    }

    if (!service.instance) {
      service.instance = this.createServiceInstance(service);
    }

    return service.instance;
  }

  // Check if service is registered
  has(name) {
    return this.services.has(name);
  }

  // Initialize container with core services
  async initialize() {
    if (this.initialized) return;

    // Register core services
    this.registerCoreServices();

    // Initialize services in dependency order
    await this.initializeServices();

    // Setup inter-service communication
    this.setupInterServiceCommunication();

    this.initialized = true;
  }

  // Register core application services
  registerCoreServices() {
    // Event Bus - No dependencies
    this.register('eventBus', () => new EventBus());

    // Storage Service - Depends on EventBus
    this.register('storageService', (container) => 
      new StorageService(container.get('eventBus'), 'localStorage'), ['eventBus']);

    // UI Notification Service - Depends on EventBus
    this.register('uiNotificationService', (container) => 
      new UINotificationService(container.get('eventBus')), ['eventBus']);

    // Flow Manager - Depends on EventBus
    this.register('flowManager', (container) => 
      new FlowManager(container.get('eventBus')), ['eventBus']);

    // UI Manager - Depends on EventBus
    this.register('uiManager', (container) => 
      new UIManager(container.get('eventBus')), ['eventBus']);

    // Connection Service - Depends on EventBus
    this.register('connectionService', (container) => 
      new ConnectionService(container.get('eventBus')), ['eventBus']);
  }

  // Initialize services in dependency order
  async initializeServices() {
    const initOrder = this.resolveDependencyOrder();
    
    for (const serviceName of initOrder) {
      const service = this.services.get(serviceName);
      if (!service.initialized) {
        // Get instance (triggers creation)
        const instance = this.get(serviceName);
        
        // Call initialize if available
        if (instance && typeof instance.initialize === 'function') {
          await instance.initialize();
        }
        
        service.initialized = true;
      }
    }
  }

  // Setup communication between services
  setupInterServiceCommunication() {
    const eventBus = this.get('eventBus');
    const flowManager = this.get('flowManager');
    
    // Connect flow manager state queries
    eventBus.on('flow:get-state', (data) => {
      const paused = flowManager.isPaused();
      if (data.callback) {
        data.callback(paused);
      }
    });

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
            eventBus.emit('storage:save-state');
            break;
        }
      }
    });
  }

  // Create service instance with dependency injection
  createServiceInstance(service) {
    const dependencies = service.dependencies.map(dep => this.get(dep));
    
    if (typeof service.factory === 'function') {
      return service.factory(this, ...dependencies);
    } else {
      throw new Error(`Invalid factory for service '${service.name}'`);
    }
  }

  // Resolve dependency initialization order
  resolveDependencyOrder() {
    const order = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (serviceName) => {
      if (visited.has(serviceName)) return;
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving '${serviceName}'`);
      }

      visiting.add(serviceName);
      
      const service = this.services.get(serviceName);
      if (service) {
        for (const dep of service.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return order;
  }

  // Dispose all services
  async dispose() {
    for (const service of this.services.values()) {
      if (service.instance && typeof service.instance.dispose === 'function') {
        await service.instance.dispose();
      }
    }
    
    this.services.clear();
    this.initialized = false;
  }

  // Get all registered service names
  getServiceNames() {
    return Array.from(this.services.keys());
  }

  // Get service status
  getServiceStatus() {
    const status = {};
    for (const [name, service] of this.services) {
      status[name] = {
        registered: true,
        initialized: service.initialized,
        hasInstance: service.instance !== null,
        dependencies: service.dependencies
      };
    }
    return status;
  }

  // Register external service (for modules)
  registerExternal(name, instance) {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, {
      name,
      factory: () => instance,
      dependencies: [],
      instance,
      initialized: true
    });
  }

  // Emit event through event bus
  emit(eventName, data) {
    const eventBus = this.get('eventBus');
    eventBus.emit(eventName, data);
  }

  // Subscribe to event through event bus
  on(eventName, handler) {
    const eventBus = this.get('eventBus');
    return eventBus.on(eventName, handler);
  }
}
