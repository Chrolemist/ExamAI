/**
 * Section Editor - Handles editable section content
 * Follows SRP - Only manages content editing functionality
 */
class SectionEditor {
  constructor(sectionRepository, domManager) {
    this.repository = sectionRepository;
    this.dom = domManager;
    this.editingSessions = new Map(); // sectionKey -> editing session
    this.saveTimeouts = new Map(); // sectionKey -> timeout id
    this.saveDelay = 400; // ms to wait before auto-saving
  }
  
  /**
   * Make a section header editable
   */
  makeHeaderEditable(headerElement, sectionKey) {
    if (!headerElement || !sectionKey) {
      throw new Error('Header element and section key are required');
    }
    
    const originalTitle = headerElement.textContent || '';
    
    // Configure editable header
    headerElement.contentEditable = 'true';
    headerElement.spellcheck = false;
    headerElement.setAttribute('data-key', sectionKey);
    
    // Restore saved title
    const savedTitle = this.repository.getTitle(sectionKey);
    if (savedTitle) {
      headerElement.textContent = savedTitle;
    }
    
    // Setup event listeners
    const saveHandler = () => {
      const currentTitle = headerElement.textContent || originalTitle;
      this.repository.setTitle(sectionKey, currentTitle);
    };
    
    this.dom.addEventListener(headerElement, 'blur', saveHandler);
    this.dom.addEventListener(headerElement, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        headerElement.blur();
      }
    });
    
    return {
      element: headerElement,
      sectionKey,
      save: saveHandler,
      getTitle: () => headerElement.textContent || '',
      setTitle: (title) => { headerElement.textContent = title; }
    };
  }
  
  /**
   * Make a section body editable
   */
  makeBodyEditable(bodyElement, sectionKey) {
    if (!bodyElement || !sectionKey) {
      throw new Error('Body element and section key are required');
    }
    
    // Configure editable body
    bodyElement.contentEditable = 'true';
    bodyElement.spellcheck = true;
    bodyElement.setAttribute('data-key', sectionKey);
    
    // Restore saved content
    const savedContent = this.repository.getBody(sectionKey);
    if (savedContent) {
      bodyElement.innerHTML = savedContent;
    }
    
    // Setup auto-save with debouncing
    const saveHandler = () => {
      const content = bodyElement.innerHTML || '';
      this.repository.setBody(sectionKey, content);
    };
    
    const debouncedSave = () => {
      // Clear existing timeout
      if (this.saveTimeouts.has(sectionKey)) {
        clearTimeout(this.saveTimeouts.get(sectionKey));
      }
      
      // Set new timeout
      const timeoutId = setTimeout(() => {
        saveHandler();
        this.saveTimeouts.delete(sectionKey);
      }, this.saveDelay);
      
      this.saveTimeouts.set(sectionKey, timeoutId);
    };
    
    // Event listeners
    this.dom.addEventListener(bodyElement, 'input', debouncedSave);
    this.dom.addEventListener(bodyElement, 'blur', saveHandler);
    
    // Track editing session
    const session = {
      element: bodyElement,
      sectionKey,
      save: saveHandler,
      getContent: () => bodyElement.innerHTML || '',
      setContent: (content) => { bodyElement.innerHTML = content; },
      appendContent: (content) => this.appendToBody(bodyElement, content)
    };
    
    this.editingSessions.set(sectionKey, session);
    
    return session;
  }
  
  /**
   * Append content to section body
   */
  appendToBody(bodyElement, content, options = {}) {
    const block = this.dom.create('div', {
      className: 'content-block'
    });
    
    if (options.useMarkdown && window.markdownit) {
      // Render markdown if available
      const md = window.markdownit();
      block.innerHTML = md.render(content);
    } else {
      // Plain text or HTML
      if (options.escapeHtml) {
        this.dom.setText(block, content);
      } else {
        block.innerHTML = content;
      }
    }
    
    this.dom.append(bodyElement, block);
    
    // Trigger save
    const session = this.getEditingSession(bodyElement.getAttribute('data-key'));
    if (session) {
      session.save();
    }
    
    return block;
  }
  
  /**
   * Get editing session for section
   */
  getEditingSession(sectionKey) {
    return this.editingSessions.get(sectionKey);
  }
  
  /**
   * Stop editing session for section
   */
  stopEditing(sectionKey) {
    const session = this.editingSessions.get(sectionKey);
    if (session) {
      // Save current content
      session.save();
      
      // Clear timeout
      if (this.saveTimeouts.has(sectionKey)) {
        clearTimeout(this.saveTimeouts.get(sectionKey));
        this.saveTimeouts.delete(sectionKey);
      }
      
      // Remove session
      this.editingSessions.delete(sectionKey);
    }
  }
  
  /**
   * Save all editing sessions
   */
  saveAll() {
    this.editingSessions.forEach((session, sectionKey) => {
      session.save();
      
      // Clear pending timeouts
      if (this.saveTimeouts.has(sectionKey)) {
        clearTimeout(this.saveTimeouts.get(sectionKey));
        this.saveTimeouts.delete(sectionKey);
      }
    });
  }
  
  /**
   * Get all active editing sessions
   */
  getActiveSessions() {
    return Array.from(this.editingSessions.values());
  }
  
  /**
   * Clear content from section
   */
  clearSection(sectionKey) {
    const session = this.editingSessions.get(sectionKey);
    if (session) {
      session.setContent('');
      session.save();
    }
  }
  
  /**
   * Set content for section
   */
  setContent(sectionKey, content) {
    const session = this.editingSessions.get(sectionKey);
    if (session) {
      session.setContent(content);
      session.save();
    } else {
      // Save directly to repository if no active session
      this.repository.setBody(sectionKey, content);
    }
  }
  
  /**
   * Get content from section
   */
  getContent(sectionKey) {
    const session = this.editingSessions.get(sectionKey);
    if (session) {
      return session.getContent();
    } else {
      // Get from repository if no active session
      return this.repository.getBody(sectionKey) || '';
    }
  }
  
  /**
   * Cleanup all editing sessions
   */
  destroy() {
    // Save all sessions before cleanup
    this.saveAll();
    
    // Clear all timeouts
    this.saveTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.saveTimeouts.clear();
    
    // Clear sessions
    this.editingSessions.clear();
  }
}
