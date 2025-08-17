/**
 * Copilot Chat Manager - Handles chat functionality and API communication
 * Follows SRP - Only manages chat operations
 */
class CopilotChatManager {
  constructor(copilotId, eventBus, settings) {
    this.copilotId = copilotId;
    this.eventBus = eventBus;
    this.settings = settings;
    this.history = [];
    this.isTyping = false;
    this.currentRequest = null;
    
    this.loadHistory();
  }
  
  /**
   * Send a message to the API
   */
  async sendMessage(message, options = {}) {
    if (this.isTyping || !message?.trim()) {
      return false;
    }
    
    try {
      this.isTyping = true;
      this.eventBus.emit('typing-started', { manager: this });
      
      // Add user message to history
      const userEntry = this.addToHistory({
        role: 'user',
        content: message.trim(),
        timestamp: Date.now()
      });
      
      // Prepare API request
      const requestData = this.buildApiRequest(options);
      
      // Make API call
      this.currentRequest = this.makeApiCall(requestData);
      const response = await this.currentRequest;
      
      // Process response
      if (response && response.content) {
        const assistantEntry = this.addToHistory({
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
          model: this.settings.getModel(),
          tokens: response.tokens || 0
        });
        
        this.eventBus.emit('message-received', {
          userEntry,
          assistantEntry,
          response
        });
      }
      
      return true;
      
    } catch (error) {
      this.eventBus.emit('chat-error', { error, message });
      throw error;
    } finally {
      this.isTyping = false;
      this.currentRequest = null;
      this.eventBus.emit('typing-ended', { manager: this });
    }
  }
  
  /**
   * Add entry to chat history
   */
  addToHistory(entry) {
    const historyEntry = {
      id: entry.id || `${this.copilotId}_${Date.now()}`,
      ...entry
    };
    
    this.history.push(historyEntry);
    this.saveHistory();
    this.eventBus.emit('history-updated', { entry: historyEntry });
    
    return historyEntry;
  }
  
  /**
   * Build API request payload
   */
  buildApiRequest(options = {}) {
    const messages = this.prepareMessages(options);
    
    return {
      model: this.settings.getModel(),
      messages,
      max_tokens: this.settings.getMaxTokens(),
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 1,
      frequency_penalty: options.frequency_penalty || 0,
      presence_penalty: options.presence_penalty || 0,
      ...options.apiParams
    };
  }
  
  /**
   * Prepare messages for API call
   */
  prepareMessages(options = {}) {
    let messages = [...this.history];
    
    // Add system message if role is enabled
    if (this.settings.getUseRole() && this.settings.getRole()) {
      messages.unshift({
        role: 'system',
        content: this.settings.getRole()
      });
    }
    
    // Apply context window management
    if (options.maxContextLength) {
      messages = this.truncateContext(messages, options.maxContextLength);
    }
    
    return messages;
  }
  
  /**
   * Make the actual API call
   */
  async makeApiCall(requestData) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  /**
   * Truncate context to fit within limits
   */
  truncateContext(messages, maxLength) {
    // Implementation for intelligent context truncation
    // Keep system message, recent messages, and important context
    // This is a simplified version
    if (messages.length <= maxLength) {
      return messages;
    }
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    // Keep recent messages
    const recentMessages = otherMessages.slice(-(maxLength - systemMessages.length));
    
    return [...systemMessages, ...recentMessages];
  }
  
  /**
   * Cancel current request
   */
  cancelRequest() {
    if (this.currentRequest) {
      // If using AbortController, cancel here
      this.isTyping = false;
      this.currentRequest = null;
      this.eventBus.emit('request-cancelled', { manager: this });
    }
  }
  
  /**
   * Clear chat history
   */
  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.eventBus.emit('history-cleared', { manager: this });
  }
  
  /**
   * Get chat statistics
   */
  getStats() {
    const totalMessages = this.history.length;
    const userMessages = this.history.filter(m => m.role === 'user').length;
    const assistantMessages = this.history.filter(m => m.role === 'assistant').length;
    const totalTokens = this.history.reduce((sum, m) => sum + (m.tokens || 0), 0);
    
    return {
      totalMessages,
      userMessages,
      assistantMessages,
      totalTokens
    };
  }
  
  /**
   * Load history from storage
   */
  loadHistory() {
    try {
      const stored = localStorage.getItem(`examai.copilot.${this.copilotId}.history`);
      this.history = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load chat history:', error);
      this.history = [];
    }
  }
  
  /**
   * Save history to storage
   */
  saveHistory() {
    try {
      localStorage.setItem(
        `examai.copilot.${this.copilotId}.history`,
        JSON.stringify(this.history)
      );
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }
}
