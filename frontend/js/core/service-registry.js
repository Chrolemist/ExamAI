/**
 * Service Registry - Dependency Injection Container
 * Follows Single Responsibility Principle (SRP) - Service registration and retrieval
 * Follows Interface Segregation Principle (ISP) - Clean service interfaces
 * Follows Dependency Inversion Principle (DIP) - Abstractions over concretions
 */

export class ServiceRegistry {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
    this.singletons = new Map();
  }

  // Register a service factory
  register(name, factory, options = {}) {
    this.factories.set(name, { factory, options });
    console.log(`Service registered: ${name}`);
  }

  // Register a singleton service
  registerSingleton(name, factory) {
    this.register(name, factory, { singleton: true });
  }

  // Get a service instance
  get(name) {
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    const serviceConfig = this.factories.get(name);
    if (!serviceConfig) {
      throw new Error(`Service not found: ${name}`);
    }

    const instance = serviceConfig.factory(this);
    
    if (serviceConfig.options.singleton) {
      this.singletons.set(name, instance);
    }

    return instance;
  }

  // Register core application services
  async registerCoreServices() {
    // Import and register services dynamically
    const { ConnectionManager } = await import('./connection-manager.js');
    const { UserNodeManager } = await import('../nodes/user-node-refactored.js');
    const { CopilotManager } = await import('../nodes/copilot-instance.js');
    const { FlowManager } = await import('./flow-manager.js');

    this.registerSingleton('connectionManager', () => new ConnectionManager());
    this.registerSingleton('userNodeManager', () => UserNodeManager.getInstance());
    this.registerSingleton('copilotManager', () => CopilotManager);
    this.registerSingleton('flowManager', (registry) => new FlowManager(registry));
  }

  // Check if service is registered
  has(name) {
    return this.factories.has(name);
  }

  // List all registered services
  list() {
    return Array.from(this.factories.keys());
  }
}
