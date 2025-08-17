/**
 * UI Manager - SOLID compliant UI state and DOM management
 * Follows Single Responsibility Principle (SRP) - UI state management only
 * Follows Open/Closed Principle (OCP) - Extensible through component registration
 * Follows Dependency Inversion Principle (DIP) - Event-based communication
 */

export class UIManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.components = new Map();
    this.initialized = false;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Component registration
    this.eventBus.on('ui:register-component', (data) => {
      this.registerComponent(data.name, data.component);
    });

    // UI state management
    this.eventBus.on('ui:show-element', (data) => {
      this.showElement(data.selector, data.options);
    });

    this.eventBus.on('ui:hide-element', (data) => {
      this.hideElement(data.selector, data.options);
    });

    this.eventBus.on('ui:toggle-element', (data) => {
      this.toggleElement(data.selector, data.options);
    });

    // Panel management
    this.eventBus.on('ui:position-panel', (data) => {
      this.positionPanel(data.panel, data.constraints);
    });

    this.eventBus.on('ui:close-panel', (data) => {
      this.closePanel(data.panel);
    });

    // Flow state UI updates
    this.eventBus.on('ui:flow-state-changed', (data) => {
      this.updateFlowUI(data.paused);
    });

    // DOM ready initialization
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  // Initialize UI Manager
  initialize() {
    if (this.initialized) return;
    
    this.setupGlobalUIHandlers();
    this.initializeComponents();
    this.initialized = true;
    
    this.eventBus.emit('ui:initialized');
  }

  // Register UI component
  registerComponent(name, component) {
    this.components.set(name, component);
    
    if (this.initialized && component.initialize) {
      component.initialize();
    }
  }

  // Initialize all registered components
  initializeComponents() {
    for (const [name, component] of this.components) {
      try {
        if (component.initialize) {
          component.initialize();
        }
      } catch (error) {
        console.error(`Failed to initialize component ${name}:`, error);
      }
    }
  }

  // Setup global UI event handlers
  setupGlobalUIHandlers() {
    // Global click handler for panel management
    document.addEventListener('click', (e) => {
      this.handleGlobalClick(e);
    });

    // Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleEscapeKey(e);
      }
    });

    // Window resize handler
    window.addEventListener('resize', () => {
      this.handleWindowResize();
    });
  }

  // Show element with optional animation
  showElement(selector, options = {}) {
    const element = this.getElement(selector);
    if (!element) return false;

    if (options.animation === 'fade') {
      element.style.opacity = '0';
      element.style.display = options.display || 'block';
      
      requestAnimationFrame(() => {
        element.style.transition = `opacity ${options.duration || 200}ms ease`;
        element.style.opacity = '1';
      });
    } else {
      element.style.display = options.display || 'block';
    }

    element.classList.remove('hide');
    element.classList.add('show');
    
    this.eventBus.emit('ui:element-shown', { selector, element });
    return true;
  }

  // Hide element with optional animation
  hideElement(selector, options = {}) {
    const element = this.getElement(selector);
    if (!element) return false;

    if (options.animation === 'fade') {
      element.style.transition = `opacity ${options.duration || 200}ms ease`;
      element.style.opacity = '0';
      
      setTimeout(() => {
        element.style.display = 'none';
      }, options.duration || 200);
    } else {
      element.style.display = 'none';
    }

    element.classList.remove('show');
    element.classList.add('hide');
    
    this.eventBus.emit('ui:element-hidden', { selector, element });
    return true;
  }

  // Toggle element visibility
  toggleElement(selector, options = {}) {
    const element = this.getElement(selector);
    if (!element) return false;

    const isVisible = element.style.display !== 'none' && 
                     !element.classList.contains('hide');
    
    if (isVisible) {
      return this.hideElement(selector, options);
    } else {
      return this.showElement(selector, options);
    }
  }

  // Position panel within constraints
  positionPanel(panel, constraints = {}) {
    if (!panel) return;

    const {
      container = document.querySelector('.node-board'),
      margin = 20,
      center = false
    } = constraints;

    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    let x = parseInt(panel.style.left) || 0;
    let y = parseInt(panel.style.top) || 0;

    // Center panel if requested
    if (center) {
      x = (containerRect.width - panelRect.width) / 2;
      y = (containerRect.height - panelRect.height) / 2;
    }

    // Constrain to container bounds
    x = Math.max(margin, Math.min(x, containerRect.width - panelRect.width - margin));
    y = Math.max(margin, Math.min(y, containerRect.height - panelRect.height - margin));

    panel.style.left = x + 'px';
    panel.style.top = y + 'px';

    this.eventBus.emit('ui:panel-positioned', { panel, x, y });
  }

  // Close panel
  closePanel(panel) {
    if (!panel) return;

    this.hideElement(panel);
    
    // Emit close event for cleanup
    this.eventBus.emit('ui:panel-closed', { panel });
  }

  // Update flow UI state
  updateFlowUI(paused) {
    document.body.classList.toggle('flow-paused', paused);
    
    const pauseBtn = document.getElementById('pauseFlowBtn');
    if (pauseBtn) {
      if (paused) {
        pauseBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 5 L19 12 L7 19 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>`;
        pauseBtn.title = 'Återuppta flöde';
        pauseBtn.classList.add('paused');
      } else {
        pauseBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <line x1="8" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        </svg>`;
        pauseBtn.title = 'Pausa flöde';
        pauseBtn.classList.remove('paused');
      }
    }

    this.updatePauseBanner(paused);
  }

  // Update pause banner
  updatePauseBanner(paused) {
    let banner = document.getElementById('pausedBanner');
    
    if (paused) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'pausedBanner';
        banner.textContent = 'Flödet är pausat';
        document.body.appendChild(banner);
      }
      
      const pauseBtn = document.getElementById('pauseFlowBtn');
      if (pauseBtn) {
        const rect = pauseBtn.getBoundingClientRect();
        banner.style.left = (rect.left + rect.width / 2) + 'px';
        banner.style.top = (rect.bottom + 8) + 'px';
      }
    } else if (banner) {
      banner.remove();
    }
  }

  // Handle global clicks
  handleGlobalClick(e) {
    // Close panels when clicking outside
    const panels = document.querySelectorAll('.panel:not(.hide)');
    for (const panel of panels) {
      if (!panel.contains(e.target)) {
        this.eventBus.emit('ui:outside-click', { panel, event: e });
      }
    }
  }

  // Handle escape key
  handleEscapeKey(e) {
    // Close top-most panel
    const panels = document.querySelectorAll('.panel:not(.hide)');
    if (panels.length > 0) {
      const topPanel = Array.from(panels).pop();
      this.closePanel(topPanel);
    }
  }

  // Handle window resize
  handleWindowResize() {
    // Reposition panels to stay within bounds
    const panels = document.querySelectorAll('.panel:not(.hide)');
    for (const panel of panels) {
      this.positionPanel(panel);
    }

    this.eventBus.emit('ui:window-resized');
  }

  // Get element by selector or element
  getElement(selector) {
    if (typeof selector === 'string') {
      return document.querySelector(selector);
    }
    return selector; // Already an element
  }

  // Create and show modal dialog
  showModal(options = {}) {
    const {
      title = '',
      content = '',
      buttons = [{ text: 'OK', primary: true }],
      onClose = null
    } = options;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" aria-label="Stäng">&times;</button>
        </div>
        <div class="modal-content">${content}</div>
        <div class="modal-footer">
          ${buttons.map(btn => 
            `<button class="btn ${btn.primary ? 'btn-primary' : ''}" data-action="${btn.action || 'close'}">${btn.text}</button>`
          ).join('')}
        </div>
      </div>
    `;

    // Event handlers
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.classList.contains('modal-close')) {
        this.closeModal(modal, onClose);
      }
      
      if (e.target.matches('[data-action]')) {
        const action = e.target.dataset.action;
        if (action === 'close') {
          this.closeModal(modal, onClose);
        } else {
          this.eventBus.emit('ui:modal-action', { action, modal });
        }
      }
    });

    document.body.appendChild(modal);
    this.showElement(modal, { animation: 'fade' });

    return modal;
  }

  // Close modal
  closeModal(modal, onClose = null) {
    this.hideElement(modal, { animation: 'fade' });
    
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
      if (onClose) onClose();
    }, 200);
  }

  // Get component by name
  getComponent(name) {
    return this.components.get(name);
  }

  // Check if UI is initialized
  isInitialized() {
    return this.initialized;
  }
}
