/**
 * UI Components Manager - Handles UI interactions following SOLID principles
 * Follows SRP - Only manages UI components and interactions
 * Follows DIP - Depends on DOM abstraction
 */
class UIComponentsManager {
  constructor(domManager) {
    this.dom = domManager;
    this.toasts = new Set();
    this.modals = new Map();
    this.drawers = new Map();
    this.initialized = false;
  }
  
  /**
   * Initialize UI components
   */
  init() {
    if (this.initialized) return;
    
    this.setupToastContainer();
    this.initialized = true;
  }
  
  /**
   * Show toast notification
   */
  toast(message, type = 'info', duration = 2000) {
    const container = this.getToastContainer();
    
    const toast = this.dom.create('div', {
      className: `hex-bubble ${this.getToastClass(type)}`,
      style: {
        marginBottom: '8px',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease'
      }
    });
    
    this.dom.setText(toast, message);
    this.dom.append(container, toast);
    
    // Animate in
    requestAnimationFrame(() => {
      this.dom.setStyle(toast, {
        opacity: '1',
        transform: 'translateX(0)'
      });
    });
    
    // Store reference
    this.toasts.add(toast);
    
    // Auto remove
    setTimeout(() => {
      this.removeToast(toast);
    }, duration);
    
    return toast;
  }
  
  /**
   * Remove specific toast
   */
  removeToast(toast) {
    if (!this.toasts.has(toast)) return;
    
    // Animate out
    this.dom.setStyle(toast, {
      opacity: '0',
      transform: 'translateX(100%)'
    });
    
    // Remove after animation
    setTimeout(() => {
      this.dom.remove(toast);
      this.toasts.delete(toast);
    }, 300);
  }
  
  /**
   * Show modal dialog
   */
  showModal(modalId, show = true) {
    const modal = this.dom.get(modalId);
    if (!modal) {
      console.warn(`Modal not found: ${modalId}`);
      return false;
    }
    
    if (show) {
      this.dom.removeClass(modal, 'hidden');
      this.dom.addClass(modal, 'show');
      this.modals.set(modalId, modal);
      
      // Add escape key listener
      this.addModalEscapeListener(modalId);
    } else {
      this.dom.removeClass(modal, 'show');
      setTimeout(() => {
        this.dom.addClass(modal, 'hidden');
      }, 250);
      this.modals.delete(modalId);
      
      // Remove escape key listener
      this.removeModalEscapeListener(modalId);
    }
    
    return true;
  }
  
  /**
   * Toggle drawer panel
   */
  toggleDrawer(panelId, direction = 'right') {
    const panel = this.dom.get(panelId);
    if (!panel) {
      console.warn(`Drawer panel not found: ${panelId}`);
      return false;
    }
    
    const isHidden = this.dom.hasClass(panel, 'hidden') || 
                    !this.dom.hasClass(panel, 'show');
    
    // Add direction class
    this.dom.addClass(panel, `from-${direction}`);
    
    if (isHidden) {
      // Show drawer
      this.dom.removeClass(panel, 'hidden');
      requestAnimationFrame(() => {
        this.dom.addClass(panel, 'show');
      });
      this.drawers.set(panelId, panel);
    } else {
      // Hide drawer
      this.dom.removeClass(panel, 'show');
      setTimeout(() => {
        this.dom.addClass(panel, 'hidden');
      }, 250);
      this.drawers.delete(panelId);
    }
    
    return !isHidden; // Return new visible state
  }
  
  /**
   * Create and show loading spinner
   */
  showLoading(parentElement, message = 'Loading...') {
    if (typeof parentElement === 'string') {
      parentElement = this.dom.get(parentElement);
    }
    
    if (!parentElement) return null;
    
    const spinner = this.dom.create('div', {
      className: 'loading-overlay',
      style: {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(255, 255, 255, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        zIndex: '1000'
      }
    });
    
    const spinnerIcon = this.dom.create('div', {
      className: 'spinner',
      style: {
        width: '32px',
        height: '32px',
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #007bff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '8px'
      }
    });
    
    const spinnerText = this.dom.create('div', {
      style: {
        fontSize: '14px',
        color: '#666'
      }
    });
    
    this.dom.setText(spinnerText, message);
    this.dom.append(spinner, spinnerIcon);
    this.dom.append(spinner, spinnerText);
    this.dom.append(parentElement, spinner);
    
    return {
      remove: () => this.dom.remove(spinner),
      updateMessage: (newMessage) => this.dom.setText(spinnerText, newMessage)
    };
  }
  
  /**
   * Create confirmation dialog
   */
  confirm(message, title = 'Confirm', options = {}) {
    return new Promise((resolve) => {
      const modal = this.dom.create('div', {
        className: 'modal-overlay confirm-modal',
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '10000'
        }
      });
      
      const dialog = this.dom.create('div', {
        className: 'modal-dialog',
        style: {
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
        }
      });
      
      const titleEl = this.dom.create('h3', {
        style: { marginTop: '0', marginBottom: '16px', fontSize: '18px' }
      });
      this.dom.setText(titleEl, title);
      
      const messageEl = this.dom.create('p', {
        style: { marginBottom: '24px', lineHeight: '1.5' }
      });
      this.dom.setText(messageEl, message);
      
      const buttonContainer = this.dom.create('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }
      });
      
      const cancelBtn = this.dom.create('button', {
        className: 'btn btn-secondary',
        textContent: options.cancelText || 'Cancel'
      });
      
      const confirmBtn = this.dom.create('button', {
        className: 'btn btn-primary',
        textContent: options.confirmText || 'OK'
      });
      
      // Event handlers
      const cleanup = () => this.dom.remove(modal);
      
      this.dom.addEventListener(cancelBtn, 'click', () => {
        cleanup();
        resolve(false);
      });
      
      this.dom.addEventListener(confirmBtn, 'click', () => {
        cleanup();
        resolve(true);
      });
      
      this.dom.addEventListener(modal, 'click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve(false);
        }
      });
      
      // Build and show dialog
      this.dom.append(buttonContainer, cancelBtn);
      this.dom.append(buttonContainer, confirmBtn);
      this.dom.append(dialog, titleEl);
      this.dom.append(dialog, messageEl);
      this.dom.append(dialog, buttonContainer);
      this.dom.append(modal, dialog);
      this.dom.append(document.body, modal);
      
      // Focus confirm button
      confirmBtn.focus();
    });
  }
  
  /**
   * Escape HTML for safe display
   */
  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  /**
   * Setup toast container
   */
  setupToastContainer() {
    let container = this.dom.get('hexNotifications');
    
    if (!container) {
      container = this.dom.create('div', {
        id: 'hexNotifications',
        className: 'hex-notify global',
        style: {
          position: 'fixed',
          top: '12px',
          right: '12px',
          zIndex: '9999',
          pointerEvents: 'none'
        }
      });
      
      this.dom.append(document.body, container);
    }
    
    return container;
  }
  
  /**
   * Get toast container
   */
  getToastContainer() {
    return this.dom.get('hexNotifications') || this.setupToastContainer();
  }
  
  /**
   * Get toast CSS class based on type
   */
  getToastClass(type) {
    switch (type) {
      case 'error': return 'error';
      case 'warning': return 'warn';
      case 'success': return 'success';
      default: return '';
    }
  }
  
  /**
   * Add escape key listener for modal
   */
  addModalEscapeListener(modalId) {
    const listener = (e) => {
      if (e.key === 'Escape') {
        this.showModal(modalId, false);
      }
    };
    
    document.addEventListener('keydown', listener);
    
    // Store listener for cleanup
    if (!this._escapeListeners) this._escapeListeners = new Map();
    this._escapeListeners.set(modalId, listener);
  }
  
  /**
   * Remove escape key listener for modal
   */
  removeModalEscapeListener(modalId) {
    if (this._escapeListeners && this._escapeListeners.has(modalId)) {
      const listener = this._escapeListeners.get(modalId);
      document.removeEventListener('keydown', listener);
      this._escapeListeners.delete(modalId);
    }
  }
  
  /**
   * Cleanup all UI components
   */
  destroy() {
    // Remove all toasts
    this.toasts.forEach(toast => this.dom.remove(toast));
    this.toasts.clear();
    
    // Hide all modals
    this.modals.forEach((_, modalId) => this.showModal(modalId, false));
    this.modals.clear();
    
    // Hide all drawers
    this.drawers.forEach((_, panelId) => this.toggleDrawer(panelId));
    this.drawers.clear();
    
    // Remove escape listeners
    if (this._escapeListeners) {
      this._escapeListeners.forEach((listener, modalId) => {
        this.removeModalEscapeListener(modalId);
      });
    }
    
    this.initialized = false;
  }
}

// Export factory function
export function createUIManager(domManager) {
  return new UIComponentsManager(domManager);
}
