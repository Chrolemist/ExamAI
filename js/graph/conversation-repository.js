/**
 * Conversation Repository - Manages conversation data persistence
 * Follows SRP - Only handles conversation data storage
 */
class ConversationRepository {
  constructor(storageProvider = null) {
    this.storage = storageProvider || StorageFactory.createWithFallback();
    this.conversations = new Map();
    this.storageKey = 'examai.conversations';
    
    this.loadConversations();
  }
  
  /**
   * Create new conversation
   */
  createConversation(id = null) {
    const convId = id || this.generateConversationId();
    
    const conversation = {
      id: convId,
      members: new Set(),
      history: [],
      turnIndex: 0,
      pending: [],
      busy: false,
      created: Date.now(),
      lastActivity: Date.now()
    };
    
    this.conversations.set(convId, conversation);
    this.saveConversations();
    
    return conversation;
  }
  
  /**
   * Get conversation by ID
   */
  getConversation(convId) {
    return this.conversations.get(convId) || null;
  }
  
  /**
   * Get or create conversation
   */
  ensureConversation(convId) {
    return this.getConversation(convId) || this.createConversation(convId);
  }
  
  /**
   * Update conversation
   */
  updateConversation(convId, updates) {
    const conversation = this.getConversation(convId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${convId}`);
    }
    
    Object.assign(conversation, updates, {
      lastActivity: Date.now()
    });
    
    this.saveConversations();
    return conversation;
  }
  
  /**
   * Delete conversation
   */
  deleteConversation(convId) {
    const success = this.conversations.delete(convId);
    if (success) {
      this.saveConversations();
    }
    return success;
  }
  
  /**
   * Get all conversations
   */
  getAllConversations() {
    return Array.from(this.conversations.values());
  }
  
  /**
   * Get conversations for member
   */
  getConversationsForMember(memberId) {
    return this.getAllConversations().filter(conv => 
      conv.members.has(memberId)
    );
  }
  
  /**
   * Add member to conversation
   */
  addMember(convId, memberId) {
    const conversation = this.ensureConversation(convId);
    conversation.members.add(memberId);
    conversation.lastActivity = Date.now();
    
    this.saveConversations();
    return conversation;
  }
  
  /**
   * Remove member from conversation
   */
  removeMember(convId, memberId) {
    const conversation = this.getConversation(convId);
    if (!conversation) return false;
    
    const success = conversation.members.delete(memberId);
    if (success) {
      conversation.lastActivity = Date.now();
      
      // Delete conversation if no members left
      if (conversation.members.size === 0) {
        this.deleteConversation(convId);
      } else {
        this.saveConversations();
      }
    }
    
    return success;
  }
  
  /**
   * Add message to history
   */
  addMessage(convId, message) {
    const conversation = this.getConversation(convId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${convId}`);
    }
    
    const historyEntry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      ...message
    };
    
    conversation.history.push(historyEntry);
    conversation.lastActivity = Date.now();
    
    this.saveConversations();
    return historyEntry;
  }
  
  /**
   * Get conversation history
   */
  getHistory(convId) {
    const conversation = this.getConversation(convId);
    return conversation ? [...conversation.history] : [];
  }
  
  /**
   * Clear conversation history
   */
  clearHistory(convId) {
    const conversation = this.getConversation(convId);
    if (conversation) {
      conversation.history = [];
      conversation.lastActivity = Date.now();
      this.saveConversations();
      return true;
    }
    return false;
  }
  
  /**
   * Add to pending queue
   */
  addToPendingQueue(convId, pendingItem) {
    const conversation = this.getConversation(convId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${convId}`);
    }
    
    conversation.pending.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      ...pendingItem
    });
    
    this.saveConversations();
  }
  
  /**
   * Get and clear pending queue
   */
  consumePendingQueue(convId) {
    const conversation = this.getConversation(convId);
    if (!conversation) return [];
    
    const pending = [...conversation.pending];
    conversation.pending = [];
    this.saveConversations();
    
    return pending;
  }
  
  /**
   * Update turn index
   */
  updateTurnIndex(convId, newIndex) {
    return this.updateConversation(convId, { turnIndex: newIndex });
  }
  
  /**
   * Set busy status
   */
  setBusyStatus(convId, busy) {
    return this.updateConversation(convId, { busy });
  }
  
  /**
   * Export conversations
   */
  exportConversations() {
    const conversations = {};
    
    this.conversations.forEach((conv, id) => {
      conversations[id] = {
        ...conv,
        members: Array.from(conv.members) // Convert Set to Array for JSON
      };
    });
    
    return {
      conversations,
      version: '1.0',
      timestamp: Date.now()
    };
  }
  
  /**
   * Import conversations
   */
  importConversations(data, merge = false) {
    if (!data || !data.conversations) {
      throw new Error('Invalid conversation data');
    }
    
    if (!merge) {
      this.conversations.clear();
    }
    
    Object.entries(data.conversations).forEach(([id, convData]) => {
      const conversation = {
        ...convData,
        members: new Set(convData.members) // Convert Array back to Set
      };
      
      this.conversations.set(id, conversation);
    });
    
    this.saveConversations();
  }
  
  /**
   * Get conversation statistics
   */
  getStats() {
    const conversations = this.getAllConversations();
    
    return {
      total: conversations.length,
      totalMembers: conversations.reduce((sum, conv) => sum + conv.members.size, 0),
      totalMessages: conversations.reduce((sum, conv) => sum + conv.history.length, 0),
      activeBusy: conversations.filter(conv => conv.busy).length,
      withPending: conversations.filter(conv => conv.pending.length > 0).length
    };
  }
  
  // Private methods
  
  /**
   * Generate unique conversation ID
   */
  generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }
  
  /**
   * Load conversations from storage
   */
  loadConversations() {
    try {
      const data = this.storage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.importConversations(parsed, false);
      }
    } catch (error) {
      console.warn('Failed to load conversations:', error);
      this.conversations.clear();
    }
  }
  
  /**
   * Save conversations to storage
   */
  saveConversations() {
    try {
      const data = this.exportConversations();
      this.storage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save conversations:', error);
    }
  }
}
