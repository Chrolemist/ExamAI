/**
 * Application Bootstrap - SOLID compliant entry point
 * Follows Single Responsibility Principle (SRP) - Only application initialization
 * Follows Dependency Inversion Principle (DIP) - Uses abstractions and injection
 */

import { AppConfigurationManager } from './js/core/app-configuration-manager.js';
import { ServiceRegistry } from './js/core/service-registry.js';
import { ApplicationStateManager } from './js/core/application-state-manager.js';
import { UIEventCoordinator } from './js/core/ui-event-coordinator.js';

// Single Responsibility: Bootstrap the application
class ApplicationBootstrap {
  constructor() {
    this.serviceRegistry = new ServiceRegistry();
    this.configManager = new AppConfigurationManager();
    this.stateManager = new ApplicationStateManager(this.serviceRegistry);
    this.eventCoordinator = new UIEventCoordinator(this.serviceRegistry);
  }

  async initialize() {
    try {
      // Load configuration
      await this.configManager.load();
      
      // Register core services
      await this.serviceRegistry.registerCoreServices();
      
      // Initialize application state
      await this.stateManager.initialize();
      
      // Setup UI event coordination
      await this.eventCoordinator.initialize();
      
      console.log('ExamAI application initialized successfully');
    } catch (error) {
      console.error('Failed to initialize application:', error);
      throw error;
    }
  }
}

// Bootstrap the application
const app = new ApplicationBootstrap();
app.initialize().catch(console.error);

export { app };
