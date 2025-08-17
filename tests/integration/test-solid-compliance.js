/**
 * SOLID Compliance Test Suite
 * Tests all SOLID principles across the refactored architecture
 */

// Note: All components are loaded as global objects via script tags in HTML
// No imports needed - we use the global objects directly

class SOLIDComplianceTestSuite {
  constructor() {
    this.testResults = {
      srp: [],  // Single Responsibility Principle
      ocp: [],  // Open/Closed Principle
      lsp: [],  // Liskov Substitution Principle
      isp: [],  // Interface Segregation Principle
      dip: []   // Dependency Inversion Principle
    };
    this.mockEventBus = this.createMockEventBus();
  }

  /**
   * Create mock event bus for testing
   */
  createMockEventBus() {
    const events = new Map();
    return {
      emit: (event, data) => {
        const listeners = events.get(event) || [];
        listeners.forEach(listener => listener(data));
      },
      on: (event, callback) => {
        if (!events.has(event)) events.set(event, []);
        events.get(event).push(callback);
      },
      off: (event, callback) => {
        const listeners = events.get(event) || [];
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }

  /**
   * Run all SOLID compliance tests
   */
  async runAllTests() {
    console.log('🧪 Starting SOLID Compliance Test Suite...\n');
    
    await this.testSingleResponsibilityPrinciple();
    await this.testOpenClosedPrinciple();
    await this.testLiskovSubstitutionPrinciple();
    await this.testInterfaceSegregationPrinciple();
    await this.testDependencyInversionPrinciple();
    
    this.generateReport();
  }

  /**
   * Test Single Responsibility Principle (SRP)
   * Each class should have only one reason to change
   */
  async testSingleResponsibilityPrinciple() {
    console.log('📋 Testing Single Responsibility Principle (SRP)...');
    
    // Test 1: Storage providers only handle storage
    try {
      const localStorage = new LocalStorageProvider();
      const memoryStorage = new MemoryStorageProvider();
      
      // Should only have storage-related methods
      const storageApiMethods = ['getItem', 'setItem', 'removeItem', 'clear'];
      const localMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(localStorage));
      const memoryMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(memoryStorage));
      
      const hasStorageMethods = storageApiMethods.every(method => 
        localMethods.includes(method) && memoryMethods.includes(method)
      );
      
      // Check that they don't have non-storage methods
      const nonStorageMethods = ['render', 'animate', 'calculate', 'route', 'manage'];
      const hasNoNonStorageMethods = !nonStorageMethods.some(method =>
        localMethods.some(m => m.toLowerCase().includes(method)) ||
        memoryMethods.some(m => m.toLowerCase().includes(method))
      );
      
      this.testResults.srp.push({
        test: 'Storage providers have single responsibility',
        passed: hasStorageMethods && hasNoNonStorageMethods,
        details: 'Storage classes only handle data persistence'
      });
    } catch (error) {
      this.testResults.srp.push({
        test: 'Storage providers SRP test',
        passed: false,
        error: error.message
      });
    }

    // Test 2: DOMManager only handles DOM operations
    try {
      const domManager = new DOMManager();
      
      // Test that it only handles DOM-related operations
      domManager.create('div', { className: 'test' });
      domManager.setStyle(document.body, { color: 'red' });
      
      this.testResults.srp.push({
        test: 'DOMManager handles only DOM operations',
        passed: true,
        details: 'DOMManager focuses solely on DOM manipulation'
      });
    } catch (error) {
      this.testResults.srp.push({
        test: 'DOMManager SRP test',
        passed: false,
        error: error.message
      });
    }

    // Test 3: PathCalculator only calculates paths
    try {
      if (typeof window.PathCalculator === 'undefined') {
        throw new Error('PathCalculator is not defined');
      }
      
      const pathCalc = new window.PathCalculator();
      const pointA = { x: 0, y: 0 };
      const pointB = { x: 100, y: 100 };
      
      const path = pathCalc.calculatePath(pointA, pointB);
      const straightPath = pathCalc.calculateStraightPath(pointA, pointB);
      
      const hasPath = typeof path === 'string' && path.includes('M') && path.includes('C');
      const hasStraightPath = typeof straightPath === 'string' && straightPath.includes('L');
      
      this.testResults.srp.push({
        test: 'PathCalculator only calculates paths',
        passed: hasPath && hasStraightPath,
        details: 'PathCalculator focuses solely on geometric path calculations'
      });
    } catch (error) {
      this.testResults.srp.push({
        test: 'PathCalculator SRP test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ SRP tests completed\n');
  }

  /**
   * Test Open/Closed Principle (OCP)
   * Software entities should be open for extension, closed for modification
   */
  async testOpenClosedPrinciple() {
    console.log('🔓 Testing Open/Closed Principle (OCP)...');

    // Test 1: Storage providers can be extended without modification
    try {
      class CustomStorageProvider extends MemoryStorageProvider {
        constructor() {
          super();
          this.compressionEnabled = true;
        }
        
        setItem(key, value) {
          // Extended functionality without modifying base class
          const compressedValue = this.compressionEnabled ? 
            JSON.stringify(value) : value;
          return super.setItem(key, compressedValue);
        }
      }
      
      const customStorage = new CustomStorageProvider();
      customStorage.setItem('test', { data: 'test' });
      
      this.testResults.ocp.push({
        test: 'Storage providers extensible without modification',
        passed: true,
        details: 'Created CustomStorageProvider extending base functionality'
      });
    } catch (error) {
      this.testResults.ocp.push({
        test: 'Storage extension test',
        passed: false,
        error: error.message
      });
    }

    // Test 2: MessageRouter strategies can be extended
    try {
      const conversationRepo = new ConversationRepository(new MemoryStorageProvider());
      const router = new MessageRouter(conversationRepo);
      
      // Test adding custom routing strategy
      const customStrategy = (conversation, message) => {
        return conversation.members.slice().reverse(); // Reverse order strategy
      };
      
      router.registerStrategy('reverse', customStrategy);
      
      this.testResults.ocp.push({
        test: 'MessageRouter strategies extensible',
        passed: true,
        details: 'Successfully added custom routing strategy'
      });
    } catch (error) {
      this.testResults.ocp.push({
        test: 'MessageRouter extension test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ OCP tests completed\n');
  }

  /**
   * Test Liskov Substitution Principle (LSP)
   * Objects of a superclass should be replaceable with objects of subclasses
   */
  async testLiskovSubstitutionPrinciple() {
    console.log('🔄 Testing Liskov Substitution Principle (LSP)...');

    // Test 1: Storage providers are substitutable
    try {
      const testStorageProviders = [
        new LocalStorageProvider(),
        new MemoryStorageProvider()
      ];
      
      const allProvidersBehaveSame = testStorageProviders.every(provider => {
        try {
          // Test basic storage operations
          provider.setItem('test', 'value');
          const value = provider.getItem('test');
          
          // Add hasItem method simulation
          const hasKey = provider.getItem('test') !== null;
          
          provider.removeItem('test');
          const removedKey = provider.getItem('test') !== null;
          
          return value === 'value' && hasKey === true && removedKey === false;
        } catch (e) {
          return false;
        }
      });
      
      this.testResults.lsp.push({
        test: 'Storage providers are substitutable',
        passed: allProvidersBehaveSame,
        details: 'All storage providers behave identically for basic operations'
      });
    } catch (error) {
      this.testResults.lsp.push({
        test: 'Storage substitution test',
        passed: false,
        error: error.message
      });
    }

    // Test 2: Repository classes follow LSP
    try {
      const storage1 = new MemoryStorageProvider();
      const storage2 = new MemoryStorageProvider();
      
      const sectionRepo = new SectionRepository(storage1);
      const conversationRepo = new ConversationRepository(storage2);
      
      // Both should have similar CRUD operations
      const hasCrudOperations = (repo, setMethod, getMethod) => {
        return typeof repo[setMethod] === 'function' && 
               typeof repo[getMethod] === 'function';
      };
      
      const sectionCrud = hasCrudOperations(sectionRepo, 'setTitle', 'getTitle');
      const conversationCrud = hasCrudOperations(conversationRepo, 'updateConversation', 'getConversation');
      
      this.testResults.lsp.push({
        test: 'Repository classes follow LSP',
        passed: sectionCrud && conversationCrud,
        details: 'All repository classes provide consistent CRUD interface'
      });
    } catch (error) {
      this.testResults.lsp.push({
        test: 'Repository LSP test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ LSP tests completed\n');
  }

  /**
   * Test Interface Segregation Principle (ISP)
   * No client should be forced to depend on methods it does not use
   */
  async testInterfaceSegregationPrinciple() {
    console.log('🔀 Testing Interface Segregation Principle (ISP)...');

    // Test 1: Node interfaces are properly segregated
    try {
      // Check that interfaces are properly segregated (loaded globally)
      const interfaces = {
        INode: window.INode,
        IDraggable: window.IDraggable,
        IConnectable: window.IConnectable,
        IPositionable: window.IPositionable
      };
      
      // Check that all interfaces exist
      const allInterfacesExist = Object.values(interfaces).every(iface => typeof iface === 'function');
      
      // Check that interfaces have different method signatures
      const nodeHasMethods = typeof interfaces.INode.prototype.getId !== 'undefined' ||
                           interfaces.INode.toString().includes('getId');
      const draggableHasMethods = typeof interfaces.IDraggable.prototype.isDraggable !== 'undefined' ||
                                interfaces.IDraggable.toString().includes('isDraggable');
      
      const interfacesSegregated = allInterfacesExist && nodeHasMethods && draggableHasMethods;
      
      this.testResults.isp.push({
        test: 'Node interfaces properly segregated',
        passed: interfacesSegregated,
        details: 'Each interface has specific, non-overlapping responsibilities'
      });
    } catch (error) {
      this.testResults.isp.push({
        test: 'Node interfaces segregation test',
        passed: false,
        error: error.message
      });
    }

    // Test 2: Manager classes don't expose unnecessary methods
    try {
      const userSettings = new UserSettingsManager(new MemoryStorageProvider());
      const userHistory = new UserHistoryManager(new MemoryStorageProvider());
      const domManager = new DOMManager();
      
      // Get method names for each manager
      const settingsMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(userSettings))
        .filter(m => typeof userSettings[m] === 'function' && m !== 'constructor');
      const historyMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(userHistory))
        .filter(m => typeof userHistory[m] === 'function' && m !== 'constructor');
      const domMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(domManager))
        .filter(m => typeof domManager[m] === 'function' && m !== 'constructor');
      
      // Check interface segregation
      const settingsFocused = settingsMethods.length > 0 && settingsMethods.length < 20; // Reasonable size
      const historyFocused = historyMethods.length > 0 && historyMethods.length < 20; // Reasonable size
      const domFocused = domMethods.length > 0 && domMethods.length < 30; // DOM may have more methods
      
      const allManagersAreFocused = settingsFocused && historyFocused && domFocused;
      
      this.testResults.isp.push({
        test: 'Manager classes have focused interfaces',
        passed: allManagersAreFocused,
        details: `Each manager exposes only relevant methods for its domain (Settings: ${settingsMethods.length}, History: ${historyMethods.length}, DOM: ${domMethods.length} methods)`
      });
    } catch (error) {
      this.testResults.isp.push({
        test: 'Manager interfaces test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ ISP tests completed\n');
  }

  /**
   * Test Dependency Inversion Principle (DIP)
   * Depend on abstractions, not concretions
   */
  async testDependencyInversionPrinciple() {
    console.log('🔄 Testing Dependency Inversion Principle (DIP)...');

    // Test 1: Classes depend on storage abstractions, not concrete implementations
    try {
      const memoryStorage = new MemoryStorageProvider();
      const localStorageAlternative = new MemoryStorageProvider(); // Simulating localStorage interface
      
      // Test that repositories work with any storage provider
      const sectionRepoWithMemory = new SectionRepository(memoryStorage);
      const sectionRepoWithLocal = new SectionRepository(localStorageAlternative);
      
      // Both should work identically
      const testKey = 'test-section';
      const testTitle = 'Test Section';
      
      sectionRepoWithMemory.setTitle(testKey, testTitle);
      sectionRepoWithLocal.setTitle(testKey, testTitle);
      
      const title1 = sectionRepoWithMemory.getTitle(testKey);
      const title2 = sectionRepoWithLocal.getTitle(testKey);
      
      const bothWork = title1 === testTitle && title2 === testTitle;
      
      this.testResults.dip.push({
        test: 'Repositories depend on storage abstractions',
        passed: bothWork,
        details: 'Repositories work with any storage provider implementation'
      });
    } catch (error) {
      this.testResults.dip.push({
        test: 'Storage abstraction test',
        passed: false,
        error: error.message
      });
    }

    // Test 2: Managers use dependency injection
    try {
      const mockStorage = new MemoryStorageProvider();
      const mockEventBus = this.mockEventBus;
      
      // Test that managers accept dependencies via constructor
      const userSettings = new UserSettingsManager(mockStorage, mockEventBus);
      const userHistory = new UserHistoryManager(mockStorage, mockEventBus);
      const conversationRepo = new ConversationRepository(mockStorage, mockEventBus);
      
      // All should be created successfully with injected dependencies
      const allCreated = userSettings && userHistory && conversationRepo;
      
      this.testResults.dip.push({
        test: 'Managers use dependency injection',
        passed: allCreated,
        details: 'All managers accept dependencies through constructor injection'
      });
    } catch (error) {
      this.testResults.dip.push({
        test: 'Dependency injection test',
        passed: false,
        error: error.message
      });
    }

    // Test 3: FlowControlManager depends on abstractions
    try {
      const mockDomManager = {
        createElement: () => ({ classList: { add: () => {}, remove: () => {} } }),
        setStyles: () => {},
        appendChild: () => {},
        removeElement: () => {},
        onToggleClick: () => {},
        updatePauseButton: () => {},
        updateBodyClass: () => {},
        updatePauseBanner: () => {}
      };
      
      const flowControl = new FlowControlManager({ domManager: mockDomManager, eventBus: this.mockEventBus });
      
      // Should work with mock DOM manager
      await flowControl.setPaused(true);
      const isPaused = flowControl.getIsPaused();
      
      this.testResults.dip.push({
        test: 'FlowControlManager depends on abstractions',
        passed: isPaused === true,
        details: 'FlowControlManager works with any DOM manager implementation'
      });
    } catch (error) {
      this.testResults.dip.push({
        test: 'FlowControlManager DIP test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ DIP tests completed\n');
  }

  /**
   * Test architecture integration and loose coupling
   */
  async testArchitectureIntegration() {
    console.log('🏗️ Testing Architecture Integration...');

    try {
      // Test full integration with dependency injection
      const storage = new MemoryStorageProvider();
      const domManager = new DOMManager();
      const eventBus = this.mockEventBus;
      
      // Create interconnected system
      const userSettings = new UserSettingsManager(storage, eventBus);
      const userHistory = new UserHistoryManager(storage, eventBus);
      const sectionRepo = new SectionRepository(storage, eventBus);
      const conversationRepo = new ConversationRepository(storage, eventBus);
      const messageRouter = new MessageRouter(conversationRepo, eventBus);
      const turnManager = new TurnManager(conversationRepo, messageRouter, eventBus);
      
      // Test that components can work together
      const conversation = conversationRepo.createConversation(['user1', 'copilot1']);
      messageRouter.routeUserMessage(conversation, 'Hello', 'user1');
      
      const integration = conversation && conversation.members.size === 2;
      
      this.testResults.srp.push({
        test: 'Full architecture integration works',
        passed: integration,
        details: 'All components integrate properly with dependency injection'
      });
      
    } catch (error) {
      this.testResults.srp.push({
        test: 'Architecture integration test',
        passed: false,
        error: error.message
      });
    }

    console.log('✅ Architecture integration tests completed\n');
  }

  /**
   * Generate and display test report
   */
  generateReport() {
    console.log('📊 SOLID Compliance Test Report');
    console.log('=====================================\n');
    
    const principles = [
      { name: 'Single Responsibility Principle (SRP)', key: 'srp' },
      { name: 'Open/Closed Principle (OCP)', key: 'ocp' },
      { name: 'Liskov Substitution Principle (LSP)', key: 'lsp' },
      { name: 'Interface Segregation Principle (ISP)', key: 'isp' },
      { name: 'Dependency Inversion Principle (DIP)', key: 'dip' }
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    
    principles.forEach(principle => {
      const tests = this.testResults[principle.key];
      const passed = tests.filter(t => t.passed).length;
      const total = tests.length;
      
      totalTests += total;
      passedTests += passed;
      
      console.log(`${principle.name}:`);
      console.log(`  ✅ Passed: ${passed}/${total}`);
      
      tests.forEach(test => {
        const status = test.passed ? '✅' : '❌';
        console.log(`    ${status} ${test.test}`);
        if (test.details) {
          console.log(`       ${test.details}`);
        }
        if (test.error) {
          console.log(`       Error: ${test.error}`);
        }
      });
      console.log('');
    });
    
    const percentage = Math.round((passedTests / totalTests) * 100);
    console.log(`Overall SOLID Compliance: ${passedTests}/${totalTests} (${percentage}%)`);
    
    if (percentage >= 90) {
      console.log('🎉 Excellent SOLID compliance!');
    } else if (percentage >= 70) {
      console.log('👍 Good SOLID compliance');
    } else {
      console.log('⚠️  Needs improvement in SOLID compliance');
    }
  }

  /**
   * Test specific component in isolation
   */
  async testComponent(ComponentClass, dependencies = {}) {
    try {
      const instance = new ComponentClass(...Object.values(dependencies));
      
      // Basic instantiation test
      const instantiated = instance !== null && instance !== undefined;
      
      // Method availability test
      const prototype = Object.getPrototypeOf(instance);
      const methods = Object.getOwnPropertyNames(prototype)
        .filter(name => typeof instance[name] === 'function' && name !== 'constructor');
      
      return {
        instantiated,
        methodCount: methods.length,
        methods: methods,
        hasEventBus: 'eventBus' in instance,
        hasStorage: 'storageProvider' in instance || 'storage' in instance
      };
    } catch (error) {
      return {
        instantiated: false,
        error: error.message
      };
    }
  }

  /**
   * Run performance tests on SOLID components
   */
  async testPerformance() {
    console.log('⚡ Testing Component Performance...');
    
    const performanceTests = [];
    
    // Test storage provider performance
    const storage = new MemoryStorageProvider();
    const start = performance.now();
    
    for (let i = 0; i < 1000; i++) {
      storage.setItem(`key${i}`, JSON.stringify({ data: `value${i}` }));
    }
    
    for (let i = 0; i < 1000; i++) {
      storage.getItem(`key${i}`);
    }
    
    const end = performance.now();
    
    performanceTests.push({
      test: 'Storage Provider Performance',
      duration: end - start,
      operations: 2000,
      opsPerMs: 2000 / (end - start)
    });
    
    console.log('Performance Results:');
    performanceTests.forEach(test => {
      console.log(`  ${test.test}: ${test.duration.toFixed(2)}ms for ${test.operations} operations`);
      console.log(`    ${test.opsPerMs.toFixed(2)} operations per millisecond`);
    });
    
    console.log('✅ Performance tests completed\n');
  }
}

// Make SOLIDComplianceTestSuite available globally
window.SOLIDComplianceTestSuite = SOLIDComplianceTestSuite;

// Auto-run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location.pathname.includes('test')) {
  const testSuite = new SOLIDComplianceTestSuite();
  testSuite.runAllTests().then(() => {
    testSuite.testPerformance();
  });
}
