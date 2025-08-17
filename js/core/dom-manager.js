/**
 * DOM Manager - Centralized DOM manipulation following SOLID principles
 * Follows SRP - Only handles DOM operations
 * Follows DIP - Abstracts DOM access
 */
class DOMManager {
  constructor() {
    this.elements = new Map();
    this.observers = new Set();
    this.initialized = false;
  }
  
  /**
   * Initialize DOM manager
   */
  init() {
    if (this.initialized) return;
    
    this.cacheElements();
    this.setupMutationObserver();
    this.initialized = true;
  }
  
  /**
   * Cache commonly used elements
   */
  cacheElements() {
    const elementIds = [
      'copilotFab', 'copilotPanel', 'copilotClose', 'messages', 'composer',
      'userInput', 'modelSelect', 'apiKeyInput', 'deleteKeyBtn', 'keyStatus',
      'settingsToggle', 'settingsPanel', 'copilotNameInput', 'copilotName',
      'hexAvatar', 'hexNotifications', 'maxTokens', 'maxTokensValue',
      'typingSpeed', 'typingSpeedValue', 'renderMode', 'btnCreateExam',
      'filePickerModal', 'filePickerClose', 'dzLectures', 'dzExams',
      'filesLectures', 'filesExams', 'listLectures', 'listExams',
      'confirmBuildExam', 'examModal', 'examClose', 'examViewer',
      'examTitle', 'clearChatBtn', 'savedChatsSelect', 'loadChatBtn',
      'copilotResize', 'attachmentsBar', 'pauseFlowBtn', 'addCopilotBtn',
      'nodeBoard'
    ];
    
    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        this.elements.set(id, element);
      }
    });
  }
  
  /**
   * Get cached element by ID
   */
  get(elementId) {
    if (this.elements.has(elementId)) {
      return this.elements.get(elementId);
    }
    
    // Try to find and cache if not found
    const element = document.getElementById(elementId);
    if (element) {
      this.elements.set(elementId, element);
    }
    
    return element;
  }
  
  /**
   * Create element with attributes and content
   */
  create(tagName, attributes = {}, content = '') {
    const element = document.createElement(tagName);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('data-')) {
        element.setAttribute(key, value);
      } else {
        element[key] = value;
      }
    });
    
    // Set content
    if (content) {
      if (typeof content === 'string') {
        element.innerHTML = content;
      } else if (content instanceof Node) {
        element.appendChild(content);
      }
    }
    
    return element;
  }
  
  /**
   * Query element using selector
   */
  query(selector, parent = document) {
    return parent.querySelector(selector);
  }
  
  /**
   * Query all elements using selector
   */
  queryAll(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }
  
  /**
   * Add event listener with automatic cleanup tracking
   */
  addEventListener(element, event, handler, options = {}) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (!element) {
      console.warn(`Element not found for event listener: ${element}`);
      return null;
    }
    
    element.addEventListener(event, handler, options);
    
    // Return cleanup function
    return () => {
      element.removeEventListener(event, handler, options);
    };
  }
  
  /**
   * Remove element safely
   */
  remove(element) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
      
      // Remove from cache if it was cached by ID
      for (const [id, cachedElement] of this.elements.entries()) {
        if (cachedElement === element) {
          this.elements.delete(id);
          break;
        }
      }
    }
  }
  
  /**
   * Append child to parent
   */
  append(parent, child) {
    if (typeof parent === 'string') {
      parent = this.get(parent);
    }
    
    if (parent && child) {
      parent.appendChild(child);
    }
  }
  
  /**
   * Set text content safely
   */
  setText(element, text) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element) {
      element.textContent = text;
    }
  }
  
  /**
   * Set HTML content safely (use with caution)
   */
  setHTML(element, html) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element) {
      element.innerHTML = html;
    }
  }
  
  /**
   * Add CSS class
   */
  addClass(element, className) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element && className) {
      element.classList.add(className);
    }
  }
  
  /**
   * Remove CSS class
   */
  removeClass(element, className) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element && className) {
      element.classList.remove(className);
    }
  }
  
  /**
   * Toggle CSS class
   */
  toggleClass(element, className, force = undefined) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element && className) {
      return element.classList.toggle(className, force);
    }
    
    return false;
  }
  
  /**
   * Check if element has class
   */
  hasClass(element, className) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    return element ? element.classList.contains(className) : false;
  }
  
  /**
   * Set CSS style
   */
  setStyle(element, property, value) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (element && property) {
      if (typeof property === 'object') {
        Object.assign(element.style, property);
      } else {
        element.style[property] = value;
      }
    }
  }
  
  /**
   * Get element position
   */
  getPosition(element) {
    if (typeof element === 'string') {
      element = this.get(element);
    }
    
    if (!element) return null;
    
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    };
  }
  
  /**
   * Setup mutation observer for dynamic content
   */
  setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // Notify observers about DOM changes
          this.notifyObservers('dom-changed', mutation);
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  /**
   * Add DOM change observer
   */
  addObserver(callback) {
    this.observers.add(callback);
    
    return () => {
      this.observers.delete(callback);
    };
  }
  
  /**
   * Notify observers of changes
   */
  notifyObservers(event, data) {
    this.observers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in DOM observer:', error);
      }
    });
  }
  
  /**
   * Cleanup all cached elements and observers
   */
  destroy() {
    this.elements.clear();
    this.observers.clear();
    this.initialized = false;
  }
}

// Export singleton instance
export const domManager = new DOMManager();
