/**
 * UI Notification Service - SOLID replacement for window.toast
 * Follows Single Responsibility Principle (SRP) - Notification management only
 * Follows Dependency Inversion Principle (DIP) - Event-based, no global dependencies
 * Follows Open/Closed Principle (OCP) - Extensible notification types
 */

export class UINotificationService {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.container = null;
    this.activeNotifications = new Map(); // id -> notification element
    this.notificationId = 0;
    
    this.initialize();
  }

  initialize() {
    this.createContainer();
    this.setupEventListeners();
  }

  createContainer() {
    // Ensure notifications container exists
    this.container = document.getElementById('hexNotifications');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'hexNotifications';
      this.container.className = 'hex-notify global';
      this.container.style.position = 'fixed';
      this.container.style.top = '12px';
      this.container.style.right = '12px';
      this.container.style.zIndex = '9999';
      document.body.appendChild(this.container);
    }
  }

  setupEventListeners() {
    // Listen for notification requests
    this.eventBus.on('notification:show', (data) => {
      this.show(data.message, data.type, data.options);
    });

    this.eventBus.on('notification:hide', (data) => {
      this.hide(data.id);
    });

    this.eventBus.on('notification:clear-all', () => {
      this.clearAll();
    });
  }

  show(message, type = 'info', options = {}) {
    const id = ++this.notificationId;
    const {
      duration = 2000,
      persistent = false,
      className = '',
      html = false
    } = options;

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `hex-bubble ${this.getTypeClass(type)} ${className}`;
    notification.setAttribute('data-notification-id', id);

    // Set content
    if (html) {
      notification.innerHTML = message;
    } else {
      notification.textContent = message;
    }

    // Add to container
    this.container.appendChild(notification);
    this.activeNotifications.set(id, notification);

    // Emit event
    this.eventBus.emit('notification:shown', { id, message, type });

    // Auto-hide if not persistent
    if (!persistent && duration > 0) {
      setTimeout(() => this.startFadeOut(id), duration);
      setTimeout(() => this.hide(id), duration + 400);
    }

    return id;
  }

  hide(id) {
    const notification = this.activeNotifications.get(id);
    if (!notification) return;

    notification.remove();
    this.activeNotifications.delete(id);
    
    this.eventBus.emit('notification:hidden', { id });
  }

  startFadeOut(id) {
    const notification = this.activeNotifications.get(id);
    if (notification) {
      notification.classList.add('fade-out');
    }
  }

  clearAll() {
    for (const [id] of this.activeNotifications) {
      this.hide(id);
    }
  }

  getTypeClass(type) {
    switch (type) {
      case 'error': return 'error';
      case 'warn': 
      case 'warning': return 'warn';
      case 'success': return 'success';
      case 'info':
      default: return '';
    }
  }

  // Convenience methods that emit events
  info(message, options) {
    this.eventBus.emit('notification:show', { 
      message, 
      type: 'info', 
      options 
    });
  }

  success(message, options) {
    this.eventBus.emit('notification:show', { 
      message, 
      type: 'success', 
      options 
    });
  }

  warning(message, options) {
    this.eventBus.emit('notification:show', { 
      message, 
      type: 'warning', 
      options 
    });
  }

  error(message, options) {
    this.eventBus.emit('notification:show', { 
      message, 
      type: 'error', 
      options 
    });
  }

  // Legacy compatibility method
  toast(message, type = 'info') {
    this.show(message, type);
  }
}
