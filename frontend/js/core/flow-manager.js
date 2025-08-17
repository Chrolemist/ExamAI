/**
 * Flow Manager - SOLID compliant flow state management
 * Follows Single Responsibility Principle (SRP) - Flow state management only
 * Follows Open/Closed Principle (OCP) - Extensible through events
 * Follows Dependency Inversion Principle (DIP) - Event-based communication
 */

export class FlowManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.storageKey = 'flow.paused';
    this.messageQueue = new Map(); // copilotId -> [messages]
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for copilot registration to handle queued messages
    this.eventBus.on('copilot:registered', (data) => {
      this.processQueuedMessages(data.id);
    });

    // Listen for flow control requests
    this.eventBus.on('flow:toggle', () => this.toggle());
    this.eventBus.on('flow:pause', () => this.setPaused(true));
    this.eventBus.on('flow:resume', () => this.setPaused(false));
    this.eventBus.on('flow:queue-message', (data) => {
      this.queueMessage(data.copilotId, data.message);
    });
  }

  // Get current pause state
  isPaused() {
    // Emit event to get storage value (DIP compliance)
    let paused = false;
    this.eventBus.emit('storage:get', {
      key: this.storageKey,
      callback: (value) => {
        // StorageService.get JSON-parses primitives, so handle boolean or string
        paused = (value === true) || (value === 'true') || (value === 1) || (value === '1');
      }
    });
    return paused;
  }

  // Set pause state
  async setPaused(paused) {
    try {
      // Emit storage event (DIP compliance)
      this.eventBus.emit('storage:set', {
        key: this.storageKey,
        value: paused ? 'true' : 'false'
      });

      // Emit state change event
      if (paused) {
        this.eventBus.emit('flow:paused', { timestamp: Date.now() });
        // Notify user
        this.eventBus.emit('notification:show', {
          message: 'Flödet är pausat',
          type: 'warning',
          options: { duration: 1800 }
        });
      } else {
        this.eventBus.emit('flow:resumed', { timestamp: Date.now() });
        await this.flushQueue();
        // Notify user
        this.eventBus.emit('notification:show', {
          message: 'Flödet återupptogs',
          type: 'success',
          options: { duration: 1400 }
        });
      }

      // Emit UI update event
      this.eventBus.emit('ui:flow-state-changed', { paused });
      
    } catch (error) {
      console.error('Failed to set pause state:', error);
      this.eventBus.emit('notification:show', {
        message: 'Failed to update flow state',
        type: 'error'
      });
    }
  }

  // Toggle pause state
  async toggle() {
    await this.setPaused(!this.isPaused());
  }

  // Queue message for later processing
  queueMessage(copilotId, message) {
    if (!this.messageQueue.has(copilotId)) {
      this.messageQueue.set(copilotId, []);
    }
    this.messageQueue.get(copilotId).push(message);
    
    this.eventBus.emit('flow:message-queued', {
      copilotId,
      queueSize: this.messageQueue.get(copilotId).length
    });
  }

  // Flush all queued messages
  async flushQueue() {
    for (const [copilotId, messages] of this.messageQueue.entries()) {
      await this.processQueuedMessages(copilotId);
    }
    
    this.messageQueue.clear();
    this.eventBus.emit('flow:queue-flushed');
  }

  // Process queued messages for specific copilot
  async processQueuedMessages(copilotId) {
    const messages = this.messageQueue.get(copilotId);
    if (!messages || messages.length === 0) return;

    // Request copilot instance through events (DIP compliance)
    this.eventBus.emit('copilot:process-queued-messages', {
      copilotId,
      messages: [...messages]
    });

    // Clear processed messages
    this.messageQueue.delete(copilotId);
  }

  // Resume all flows
  async resumeAll() {
    await this.setPaused(false);
  }

  // Get queue status
  getQueueStatus() {
    const totalQueued = Array.from(this.messageQueue.values())
      .reduce((sum, msgs) => sum + msgs.length, 0);
    
    return {
      totalQueued,
      queuesByCopilot: new Map(this.messageQueue),
      isPaused: this.isPaused()
    };
  }

  // Initialize UI elements
  initializeUI() {
  // Sync initial state from storage
  this.updateUIState();
    this.setupUIEventListeners();
  }

  setupUIEventListeners() {
    // Listen for UI button clicks
    const pauseBtn = document.getElementById('pauseFlowBtn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async () => {
        await this.toggle();
        // Update UI immediately to reflect state change
        this.updateUIState();
      });
    }

    // Listen for flow state changes to update UI
    this.eventBus.on('flow:paused', () => this.updateUIState());
    this.eventBus.on('flow:resumed', () => this.updateUIState());
  }

  updateUIState() {
    const paused = this.isPaused();
    const pauseBtn = document.getElementById('pauseFlowBtn');
    
    if (pauseBtn) {
      if (paused) {
        pauseBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5 L19 12 L7 19 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
        pauseBtn.title = 'Återuppta flöde';
        pauseBtn.classList.add('paused');
        pauseBtn.setAttribute('aria-label', 'Återuppta flöde');
      } else {
        pauseBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="8" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
        pauseBtn.title = 'Pausa flöde';
        pauseBtn.classList.remove('paused');
        pauseBtn.setAttribute('aria-label', 'Pausa flöde');
      }
    }

    // Update body class
    document.body.classList.toggle('flow-paused', paused);
    
    // Update pause banner
    this.updatePauseBanner(paused);
  }

  updatePauseBanner(paused) {
    let banner = document.getElementById('pausedBanner');
    
    if (paused) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'pausedBanner';
        banner.textContent = 'Flödet är pausat';
        document.body.appendChild(banner);
      }
      
      // Position banner
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
}
