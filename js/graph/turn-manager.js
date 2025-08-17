/**
 * Turn Manager - Handles turn-taking logic in conversations
 * Follows SRP - Only manages conversation turns and processing
 */
class TurnManager {
  constructor(conversationRepository, messageRouter, eventBus = null) {
    this.repository = conversationRepository;
    this.router = messageRouter;
    this.eventBus = eventBus;
    this.processingQueue = new Map(); // convId -> processing promise
  }
  
  /**
   * Process pending messages in conversation
   */
  async processConversation(convId) {
    // Prevent concurrent processing of same conversation
    if (this.processingQueue.has(convId)) {
      return await this.processingQueue.get(convId);
    }
    
    const processingPromise = this._processConversationInternal(convId);
    this.processingQueue.set(convId, processingPromise);
    
    try {
      const result = await processingPromise;
      return result;
    } finally {
      this.processingQueue.delete(convId);
    }
  }
  
  /**
   * Internal conversation processing logic
   */
  async _processConversationInternal(convId) {
    const conversation = this.repository.getConversation(convId);
    
    if (!conversation) {
      throw new Error(`Conversation not found: ${convId}`);
    }
    
    // Check if conversation is already busy
    if (conversation.busy) {
      console.log(`Conversation ${convId} is already busy`);
      return { status: 'busy' };
    }
    
    // Check if flow is paused
    if (this.isFlowPaused()) {
      console.log('Flow is paused, skipping conversation processing');
      return { status: 'paused' };
    }
    
    // Check if there are pending messages
    const pending = this.repository.consumePendingQueue(convId);
    if (pending.length === 0) {
      return { status: 'no-pending' };
    }
    
    // Mark conversation as busy
    this.repository.setBusyStatus(convId, true);
    
    try {
      // Get conversation members
      const members = Array.from(conversation.members);
      if (members.length === 0) {
        return { status: 'no-members' };
      }
      
      // Determine next responder
      const nextResponder = this.selectNextResponder(conversation, members);
      if (!nextResponder) {
        return { status: 'no-responder' };
      }
      
      // Update turn index
      const nextIndex = (conversation.turnIndex + 1) % members.length;
      this.repository.updateTurnIndex(convId, nextIndex);
      
      // Mark active speaker
      this.markActiveSpeaker(nextResponder.id);
      
      // Generate response
      const responseResult = await this.generateResponse(nextResponder, conversation);
      
      // Route response to other members
      if (responseResult.success) {
        const routingResult = this.router.routeAssistantMessage(
          conversation,
          responseResult.message,
          nextResponder.id,
          { senderName: nextResponder.name }
        );
        
        // Add to conversation history
        this.repository.addMessage(convId, {
          role: 'assistant',
          content: responseResult.message,
          senderId: nextResponder.id,
          senderName: nextResponder.name
        });
        
        this.emitEvent('turn-completed', {
          conversationId: convId,
          responderId: nextResponder.id,
          message: responseResult.message,
          routingResult
        });
      }
      
      return {
        status: 'processed',
        responderId: nextResponder.id,
        response: responseResult,
        pendingProcessed: pending.length
      };
      
    } catch (error) {
      console.error(`Error processing conversation ${convId}:`, error);
      
      // Send error message to members
      const errorMessage = 'Nätverksfel.';
      this.router.routeAssistantMessage(conversation, errorMessage, null, {
        senderName: 'System'
      });
      
      this.emitEvent('turn-error', {
        conversationId: convId,
        error: error.message
      });
      
      return {
        status: 'error',
        error: error.message
      };
      
    } finally {
      // Clear active speaker
      this.clearActiveSpeaker();
      
      // Mark conversation as not busy
      this.repository.setBusyStatus(convId, false);
      
      // Check if more processing needed
      const remainingPending = conversation.pending.length;
      if (remainingPending > 0) {
        // Schedule next processing
        setTimeout(() => {
          this.processConversation(convId);
        }, 20);
      }
    }
  }
  
  /**
   * Select next responder in conversation
   */
  selectNextResponder(conversation, members) {
    if (members.length === 0) return null;
    
    const nextIndex = (conversation.turnIndex + 1) % members.length;
    const nextMemberId = members[nextIndex];
    
    // Get responder instance
    const responder = window.CopilotManager?.instances?.get(nextMemberId);
    
    if (!responder) {
      // Fallback to any available instance
      const fallback = window.CopilotManager?.instances?.values()?.next()?.value;
      return fallback;
    }
    
    return responder;
  }
  
  /**
   * Generate response from responder
   */
  async generateResponse(responder, conversation) {
    try {
      const messages = [...conversation.history];
      const reply = await responder.generateReply(messages);
      
      return {
        success: true,
        message: reply || '(inget svar)',
        responderId: responder.id
      };
      
    } catch (error) {
      console.error('Failed to generate response:', error);
      
      return {
        success: false,
        error: error.message,
        message: 'Nätverksfel.',
        responderId: responder.id
      };
    }
  }
  
  /**
   * Mark active speaker visually
   */
  markActiveSpeaker(speakerId) {
    // Clear previous active speakers
    this.clearActiveSpeaker();
    
    // Mark new active speaker
    const speakerInstance = window.CopilotManager?.instances?.get(speakerId);
    if (speakerInstance && speakerInstance.panel) {
      speakerInstance.panel.classList.add('active-speaking');
    }
    
    this.emitEvent('active-speaker-changed', { speakerId });
  }
  
  /**
   * Clear active speaker indicators
   */
  clearActiveSpeaker() {
    // Clear all active speaking indicators
    window.CopilotManager?.instances?.forEach(instance => {
      if (instance.panel) {
        instance.panel.classList.remove('active-speaking');
      }
    });
    
    this.emitEvent('active-speaker-cleared', {});
  }
  
  /**
   * Enqueue user message for processing
   */
  enqueueUserMessage(senderId, message) {
    const senderInstance = window.CopilotManager?.instances?.get(senderId);
    if (!senderInstance || !senderInstance._convId) {
      console.warn('Sender not found or not in conversation:', senderId);
      return false;
    }
    
    const convId = senderInstance._convId;
    const conversation = this.repository.getConversation(convId);
    
    if (!conversation) {
      console.warn('Conversation not found:', convId);
      return false;
    }
    
    // Add to conversation history
    this.repository.addMessage(convId, {
      role: 'user',
      content: message,
      senderId
    });
    
    // Route to other members
    this.router.routeUserMessage(conversation, message, senderId);
    
    // Add to pending queue for processing
    this.repository.addToPendingQueue(convId, {
      type: 'user-message',
      senderId,
      message
    });
    
    // Check if flow is paused
    if (this.isFlowPaused()) {
      this.emitEvent('message-queued', {
        conversationId: convId,
        senderId,
        message,
        reason: 'flow-paused'
      });
      
      if (window.toast) {
        window.toast('Flöde pausat – meddelandet köades.', 'warn');
      }
      
      return true;
    }
    
    // Process immediately if not paused
    this.processConversation(convId);
    
    return true;
  }
  
  /**
   * Check if flow is paused
   */
  isFlowPaused() {
    return window.PauseManager?.isPaused?.() || false;
  }
  
  /**
   * Get processing status for conversation
   */
  getProcessingStatus(convId) {
    return {
      isProcessing: this.processingQueue.has(convId),
      conversation: this.repository.getConversation(convId)
    };
  }
  
  /**
   * Get all processing conversations
   */
  getProcessingConversations() {
    return Array.from(this.processingQueue.keys());
  }
  
  /**
   * Force stop processing for conversation
   */
  stopProcessing(convId) {
    const conversation = this.repository.getConversation(convId);
    if (conversation) {
      this.repository.setBusyStatus(convId, false);
    }
    
    this.processingQueue.delete(convId);
    this.clearActiveSpeaker();
    
    this.emitEvent('processing-stopped', { conversationId: convId });
  }
  
  /**
   * Emit event if event bus is available
   */
  emitEvent(eventName, data) {
    if (this.eventBus) {
      this.eventBus.emit(eventName, data);
    }
  }
  
  /**
   * Get turn management statistics
   */
  getStats() {
    return {
      activeProcessing: this.processingQueue.size,
      processingConversations: Array.from(this.processingQueue.keys())
    };
  }
}
