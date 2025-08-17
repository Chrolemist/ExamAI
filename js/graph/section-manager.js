/**
 * Section Manager - Main coordinator for board sections
 * Follows SRP and coordinates specialized managers
 * Follows DIP - Depends on abstractions
 */
class SectionManager {
  constructor(dependencies = {}) {
    this.repository = dependencies.repository || new SectionRepository();
    this.editor = dependencies.editor || new SectionEditor(this.repository, dependencies.domManager);
    this.ioManager = dependencies.ioManager || new SectionIOManager(dependencies.domManager, dependencies.ioRegistry);
    this.dom = dependencies.domManager;
    this.eventBus = dependencies.eventBus || this.createEventBus();
    
    this.sections = new Map(); // sectionKey -> section info
    this.initialized = false;
  }
  
  /**
   * Initialize all sections on the page
   */
  init() {
    if (this.initialized) return;
    
    try {
      this.dom.queryAll('.board-section').forEach(sectionElement => {
        this.initializeSection(sectionElement);
      });
      
      this.initialized = true;
      this.eventBus.emit('sections-initialized', { manager: this });
      
    } catch (error) {
      console.error('Failed to initialize sections:', error);
      throw error;
    }
  }
  
  /**
   * Initialize a single section
   */
  initializeSection(sectionElement) {
    const sectionKey = this.getSectionKey(sectionElement);
    if (!sectionKey) {
      console.warn('Section missing key attribute:', sectionElement);
      return null;
    }
    
    // Find header and body elements
    const headerElement = sectionElement.querySelector('.head h2');
    const bodyElement = sectionElement.querySelector('.body');
    const headContainer = sectionElement.querySelector('.head');
    
    if (!headerElement) {
      console.warn('Section missing header element:', sectionKey);
      return null;
    }
    
    // Setup editable header
    const headerSession = headerElement ? 
      this.editor.makeHeaderEditable(headerElement, sectionKey) : null;
    
    // Setup editable body
    const bodySession = bodyElement ? 
      this.editor.makeBodyEditable(bodyElement, sectionKey) : null;
    
    // Create IO point
    const ioPoint = headContainer ? 
      this.ioManager.createIOPoint(sectionKey, headContainer, {
        title: 'Input',
        role: 'in',
        side: 'r',
        index: 0
      }) : null;
    
    // Setup context menu for unlinking
    if (headContainer) {
      this.setupContextMenu(headContainer, sectionKey);
    }
    
    if (ioPoint) {
      this.setupContextMenu(ioPoint, sectionKey);
    }
    
    // Store section info
    const sectionInfo = {
      key: sectionKey,
      element: sectionElement,
      headerElement,
      bodyElement,
      headContainer,
      ioPoint,
      headerSession,
      bodySession
    };
    
    this.sections.set(sectionKey, sectionInfo);
    
    this.eventBus.emit('section-initialized', { 
      sectionKey, 
      sectionInfo 
    });
    
    return sectionInfo;
  }
  
  /**
   * Get section key from element
   */
  getSectionKey(sectionElement) {
    return sectionElement.getAttribute('data-section-key') || 
           sectionElement.id || 
           `sec_${this.sections.size + 1}`;
  }
  
  /**
   * Setup context menu for section elements
   */
  setupContextMenu(element, sectionKey) {
    this.dom.addEventListener(element, 'contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY, sectionKey);
    });
  }
  
  /**
   * Show context menu for section
   */
  showContextMenu(x, y, sectionKey) {
    const menu = this.dom.create('div', {
      className: 'fab-menu section-menu'
    });
    
    const unlinkButton = this.dom.create('button', {
      'data-action': 'unlink-all',
      textContent: 'Unlink till denna sektion'
    });
    
    const menuRow = this.dom.create('div', {
      className: 'fab-menu-row'
    });
    
    this.dom.append(menuRow, unlinkButton);
    this.dom.append(menu, menuRow);
    this.dom.append(document.body, menu);
    
    // Position menu
    const padding = 8;
    const menuWidth = 220;
    const left = Math.min(Math.max(padding, x), window.innerWidth - menuWidth - padding);
    const top = Math.min(Math.max(padding, y), window.innerHeight - 40 - padding);
    
    this.dom.setStyle(menu, {
      left: left + 'px',
      top: top + 'px'
    });
    
    this.dom.addClass(menu, 'show');
    
    // Setup event handlers
    const cleanup = () => this.dom.remove(menu);
    
    const outsideClickHandler = (ev) => {
      if (!menu.contains(ev.target)) {
        cleanup();
        document.removeEventListener('mousedown', outsideClickHandler);
        document.removeEventListener('touchstart', outsideClickHandler);
      }
    };
    
    document.addEventListener('mousedown', outsideClickHandler);
    document.addEventListener('touchstart', outsideClickHandler);
    
    this.dom.addEventListener(unlinkButton, 'click', (ev) => {
      ev.stopPropagation();
      this.unlinkAllConnections(sectionKey);
      cleanup();
    });
  }
  
  /**
   * Append content to section
   */
  appendToSection(sectionKey, content, options = {}) {
    const sectionInfo = this.sections.get(sectionKey);
    if (!sectionInfo || !sectionInfo.bodyElement) {
      console.warn(`Section not found or has no body: ${sectionKey}`);
      return false;
    }
    
    const block = this.editor.appendToBody(sectionInfo.bodyElement, content, options);
    
    this.eventBus.emit('content-appended', {
      sectionKey,
      content,
      block,
      options
    });
    
    return block;
  }
  
  /**
   * Get section element by key
   */
  getSectionElement(sectionKey) {
    const sectionInfo = this.sections.get(sectionKey);
    return sectionInfo ? sectionInfo.element : null;
  }
  
  /**
   * Get section IO point by key
   */
  getSectionIOPoint(sectionKey) {
    return this.ioManager.getIOPoint(sectionKey);
  }
  
  /**
   * Unlink all connections to a section
   */
  unlinkAllConnections(sectionKey) {
    try {
      // Remove connections through graph persistence if available
      if (window.GraphPersistence) {
        window.GraphPersistence.removeWhere(link => 
          link.toType === 'section' && link.toId === sectionKey
        );
      }
      
      // Clear local connection tracking
      this.ioManager.removeAllConnections(sectionKey);
      
      // Update IO appearance
      this.ioManager.updateIOAppearance(sectionKey);
      
      this.eventBus.emit('connections-unlinked', { sectionKey });
      
      // Show feedback
      if (window.toast) {
        window.toast('Alla länkar till sektionen togs bort.');
      }
      
    } catch (error) {
      console.error('Failed to unlink section connections:', error);
    }
  }
  
  /**
   * Get section by key
   */
  getSection(sectionKey) {
    return this.sections.get(sectionKey);
  }
  
  /**
   * Get all sections
   */
  getAllSections() {
    return Array.from(this.sections.values());
  }
  
  /**
   * Get section keys
   */
  getSectionKeys() {
    return Array.from(this.sections.keys());
  }
  
  /**
   * Remove section
   */
  removeSection(sectionKey) {
    const sectionInfo = this.sections.get(sectionKey);
    if (!sectionInfo) return false;
    
    // Stop editing sessions
    this.editor.stopEditing(sectionKey);
    
    // Remove IO point
    this.ioManager.removeIOPoint(sectionKey);
    
    // Remove from repository
    this.repository.removeSection(sectionKey);
    
    // Remove from sections map
    this.sections.delete(sectionKey);
    
    this.eventBus.emit('section-removed', { sectionKey });
    
    return true;
  }
  
  /**
   * Export all section data
   */
  exportSections() {
    return {
      data: this.repository.exportAll(),
      sections: this.getSectionKeys(),
      connections: this.ioManager.getConnectionStats(),
      timestamp: Date.now()
    };
  }
  
  /**
   * Import section data
   */
  importSections(exportData, merge = false) {
    return this.repository.importAll(exportData.data, merge);
  }
  
  /**
   * Create event bus
   */
  createEventBus() {
    const listeners = new Map();
    
    return {
      emit: (event, data) => {
        const callbacks = listeners.get(event);
        if (callbacks) {
          callbacks.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error(`Error in section event listener for ${event}:`, error);
            }
          });
        }
      },
      
      on: (event, callback) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event).add(callback);
        
        return () => {
          const callbacks = listeners.get(event);
          if (callbacks) {
            callbacks.delete(callback);
          }
        };
      }
    };
  }
  
  /**
   * Cleanup and destroy
   */
  destroy() {
    // Stop all editing sessions
    this.editor.destroy();
    
    // Remove all IO points
    this.ioManager.destroy();
    
    // Clear sections
    this.sections.clear();
    
    this.eventBus.emit('sections-destroyed', { manager: this });
    this.initialized = false;
  }
}

// Export factory function
export function createSectionManager(dependencies = {}) {
  return new SectionManager(dependencies);
}
