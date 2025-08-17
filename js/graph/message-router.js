/**
 * Message Router - Handles message routing between conversation members
 * Follows SRP - Only handles message distribution logic
 */
class MessageRouter {
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.routingStrategies = new Map();
    this.messageTransforms = new Map();
    
    // Register default routing strategies
    this.registerStrategy('round-robin', this.roundRobinStrategy.bind(this));
    this.registerStrategy('broadcast', this.broadcastStrategy.bind(this));
    this.registerStrategy('targeted', this.targetedStrategy.bind(this));
  }
  
  /**
   * Register a routing strategy
   */
  registerStrategy(name, strategyFunction) {
    this.routingStrategies.set(name, strategyFunction);
  }
  
  /**
   * Register a message transform
   */
  registerTransform(name, transformFunction) {
    this.messageTransforms.set(name, transformFunction);
  }
  
  /**
   * Route user message to conversation members
   */
  routeUserMessage(conversation, message, senderId, options = {}) {
    const strategy = options.strategy || 'broadcast';
    const transform = options.transform || 'default';
    
    // Apply message transform
    const transformedMessage = this.applyTransform(message, transform, {
      senderId,
      conversation,
      messageType: 'user'
    });
    
    // Get target members using strategy
    const targets = this.getRoutingTargets(conversation, senderId, strategy, options);
    
    // Send to targets
    const results = targets.map(targetId => {
      return this.sendMessageToTarget(targetId, transformedMessage, {
        type: 'user',
        senderId,
        conversationId: conversation.id,
        originalMessage: message
      });
    });
    
    // Emit routing event
    if (this.eventBus) {
      this.eventBus.emit('message-routed', {
        conversation,
        message: transformedMessage,
        senderId,
        targets,
        results,
        strategy,
        transform
      });
    }
    
    return {
      targets,
      results,
      message: transformedMessage
    };
  }
  
  /**
   * Route assistant message to conversation members
   */
  routeAssistantMessage(conversation, message, senderId, options = {}) {
    const transform = options.transform || 'default';
    
    // Apply message transform
    const transformedMessage = this.applyTransform(message, transform, {
      senderId,
      conversation,
      messageType: 'assistant'
    });
    
    // Broadcast to all members except sender
    const targets = this.getAllMembersExcept(conversation, senderId);
    
    // Send to targets
    const results = targets.map(targetId => {
      return this.sendMessageToTarget(targetId, transformedMessage, {
        type: 'assistant',
        senderId,
        senderName: options.senderName,
        conversationId: conversation.id,
        originalMessage: message
      });
    });
    
    // Emit routing event
    if (this.eventBus) {
      this.eventBus.emit('assistant-message-routed', {
        conversation,
        message: transformedMessage,
        senderId,
        senderName: options.senderName,
        targets,
        results
      });
    }
    
    return {
      targets,
      results,
      message: transformedMessage
    };
  }
  
  /**
   * Get routing targets based on strategy
   */
  getRoutingTargets(conversation, senderId, strategy, options = {}) {
    const strategyFunction = this.routingStrategies.get(strategy);
    
    if (!strategyFunction) {
      throw new Error(`Unknown routing strategy: ${strategy}`);
    }
    
    return strategyFunction(conversation, senderId, options);
  }
  
  /**
   * Apply message transform
   */
  applyTransform(message, transformName, context) {
    if (transformName === 'default') {
      return message;
    }
    
    const transformFunction = this.messageTransforms.get(transformName);
    
    if (!transformFunction) {
      console.warn(`Unknown message transform: ${transformName}`);
      return message;
    }
    
    try {
      return transformFunction(message, context);
    } catch (error) {
      console.error('Error applying message transform:', error);
      return message;
    }
  }
  
  /**
   * Send message to specific target
   */
  sendMessageToTarget(targetId, message, metadata = {}) {
    try {
      // Get target instance from CopilotManager
      const targetInstance = window.CopilotManager?.instances?.get(targetId);
      
      if (!targetInstance) {
        console.warn(`Target instance not found: ${targetId}`);
        return { success: false, error: 'Target not found' };
      }
      
      // Route based on message type
      if (metadata.type === 'user') {
        const authorName = this.getUserDisplayName();
        targetInstance.addUser(message, authorName);
      } else if (metadata.type === 'assistant') {
        this.renderAssistantMessage(targetInstance, message, metadata.senderName);
      }
      
      return { success: true, targetId };
      
    } catch (error) {
      console.error(`Failed to send message to ${targetId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Render assistant message in target instance
   */
  renderAssistantMessage(targetInstance, message, senderName) {
    if (typeof targetInstance.renderAssistantReply === 'function') {
      targetInstance.renderAssistantReply(message, senderName);
    } else if ((targetInstance.renderMode || 'raw') === 'md') {
      targetInstance.addAssistant(message, senderName);
    } else {
      targetInstance.addAssistant(message, senderName);
    }
  }
  
  /**
   * Get user display name
   */
  getUserDisplayName() {
    try {
      return (window.getGlobalUserName || (() => 'Du'))();
    } catch {
      return 'Du';
    }
  }
  
  /**
   * Get all conversation members except specified ID
   */
  getAllMembersExcept(conversation, excludeId) {
    return Array.from(conversation.members).filter(id => id !== excludeId);
  }
  
  // Routing strategies
  
  /**
   * Round-robin routing strategy
   */
  roundRobinStrategy(conversation, senderId, options = {}) {
    const members = this.getAllMembersExcept(conversation, senderId);
    if (members.length === 0) return [];
    
    const currentIndex = conversation.turnIndex || 0;
    const targetIndex = currentIndex % members.length;
    
    return [members[targetIndex]];
  }
  
  /**
   * Broadcast routing strategy
   */
  broadcastStrategy(conversation, senderId, options = {}) {
    return this.getAllMembersExcept(conversation, senderId);
  }
  
  /**
   * Targeted routing strategy
   */
  targetedStrategy(conversation, senderId, options = {}) {
    const targetIds = options.targets || [];
    
    if (!Array.isArray(targetIds)) {
      throw new Error('Targeted strategy requires targets array');
    }
    
    // Filter to valid conversation members
    const validTargets = targetIds.filter(id => 
      conversation.members.has(id) && id !== senderId
    );
    
    return validTargets;
  }
  
  /**
   * Get routing statistics
   */
  getRoutingStats() {
    return {
      strategies: Array.from(this.routingStrategies.keys()),
      transforms: Array.from(this.messageTransforms.keys())
    };
  }
}
