/**
 * BaseNode - Abstract base class for all interactive nodes
 * Follows Single Responsibility Principle (SRP) - Base node functionality
 * Follows Open/Closed Principle (OCP) - Open for extension, closed for modification
 * Follows Liskov Substitution Principle (LSP) - Subclasses can replace base class
 * Follows Interface Segregation Principle (ISP) - Focused interfaces
 * Follows Dependency Inversion Principle (DIP) - Depends on abstractions
 */

import { ConnectionLayer } from '../graph/connection-layer.js';

export class BaseNode {
  constructor(id, type = 'base') {
    if (new.target === BaseNode) {
      throw new Error('BaseNode is abstract and cannot be instantiated directly');
    }
    
    this.id = id;
    this.type = type;
    this.fab = null;
    this._linkLines = new Map();
    this._connectionPoints = new Map();
    this._isVisible = false;
  }

  // Abstract methods that subclasses must implement
  createFab() {
    throw new Error('createFab() must be implemented by subclass');
  }

  // Common connection functionality for all nodes
  wireConnectionPoints() {
    if (!this.fab) {
      console.warn(`BaseNode ${this.id}: No FAB found for wireConnectionPoints`);
      return;
    }
    
    const points = Array.from(this.fab.querySelectorAll('.conn-point'));
    console.log(`BaseNode ${this.id}: Found ${points.length} connection points`);
    
    if (points.length === 0) {
      console.warn(`BaseNode ${this.id}: No connection points found in FAB`);
      return;
    }
    
    let dragging = false, start = null, ghostId = null, overPoint = null, startPointEl = null;
    const getCenter = (el) => { 
      const r = el.getBoundingClientRect(); 
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; 
    };
    const where = 'fab';
    const roleKey = (pt) => `io:${this.type}:${where}:${pt.getAttribute('data-side') || 'x'}`;
    
    const setPointRole = (el, role, persist = false) => {
      el.classList.remove('io-in', 'io-out');
      if (role === 'in') el.classList.add('io-in');
      if (role === 'out') el.classList.add('io-out');
      el.setAttribute('data-io', role || '');
      const label = role === 'in' ? 'Input' : role === 'out' ? 'Output' : '';
      if (label) { 
        el.setAttribute('title', label); 
        el.setAttribute('aria-label', label); 
      }
      if (persist) { 
        try { localStorage.setItem(roleKey(el), role || ''); } catch {} 
      }
    };
    
    // Restore saved IO roles and register with IORegistry
    points.forEach((pt, idx) => {
      try { 
        const saved = localStorage.getItem(roleKey(pt));
        if (saved) setPointRole(pt, saved);
        else setPointRole(pt, 'out', false); // Default to out like CopilotInstance
      } catch {}
      
      // Register with IORegistry like CopilotInstance does
      try { 
        if (window.IORegistry) {
          const id = window.IORegistry.register(pt, { 
            nodeType: this.type, 
            nodeId: String(this.id), 
            side: pt.getAttribute('data-side') || 'x', 
            index: idx 
          }, { attachToggle: true }); 
        }
      } catch {}
    });
    
    const pickPointAt = (x, y) => {
      // Allow linking to panel/fab points, Internet hub, and section IO targets
      const all = document.querySelectorAll('.panel-flyout .conn-point, .internet-hub .conn-point, .fab .conn-point, .panel .head .section-io');
      for (const p of all) { 
        const r = p.getBoundingClientRect(); 
        if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return p; 
      }
      return null;
    };
    
    const onMove = (e) => {
      if (!dragging) return; 
      const p = e.touches ? e.touches[0] : e; 
      const b = { x: p.clientX, y: p.clientY };
      ConnectionLayer.draw(ghostId, start, b);
      const hit = pickPointAt(b.x, b.y);
      if (overPoint && overPoint !== hit) overPoint.classList.remove('hover');
      overPoint = hit; 
      if (overPoint) overPoint.classList.add('hover');
      e.preventDefault();
    };
    
    const finish = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    
    const onUp = () => {
      if (!dragging) return; 
      dragging = false; 
      if (overPoint) overPoint.classList.remove('hover');
      finish();
      const endPt = overPoint; 
      if (ghostId) { 
        try { ConnectionLayer.remove(ghostId); } catch {} 
        ghostId = null; 
      } 
      if (!endPt) return;
      
      // Ensure start is Output
      if (startPointEl?.getAttribute('data-io') !== 'out') setPointRole(startPointEl, 'out', true);
      
      // Use existing connection creation logic
      this.createConnectionTo(startPointEl, endPt);
    };
    
    // Make connection points draggable
    points.forEach(pt => {
      const startDrag = (e) => {
        dragging = true;
        start = getCenter(pt);
        startPointEl = pt;
        ghostId = 'temp_connection_line_' + Date.now();
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp, { passive: false });
        e.preventDefault(); 
        e.stopPropagation();
      };
      
      pt.addEventListener('mousedown', startDrag, { passive: false });
      pt.addEventListener('touchstart', startDrag, { passive: false });
    });

    // Store connection points for easy access
    this._connectionPoints.set('points', points);
  }

  // Common connection creation logic
  createConnectionTo(fromPoint, toPoint) {
    // Determine what we're connecting to
    const targetFab = toPoint.closest('.fab');
    const targetHub = toPoint.closest('.internet-hub');
    const targetSection = toPoint.closest('.panel-head');
    
    if (targetFab) {
      this.linkToFab(fromPoint, toPoint, targetFab);
    } else if (targetHub) {
      this.linkToInternetHub(fromPoint, toPoint);
    } else if (targetSection) {
      this.linkToSection(fromPoint, toPoint, targetSection);
    }
  }

  // Common FAB linking logic
  linkToFab(fromPoint, toPoint, targetFab) {
    try {
      const fromSide = fromPoint.getAttribute('data-side') || 'x';
      const toSide = toPoint.getAttribute('data-side') || 'x';
      
      // Determine target type
      const targetCopilotId = targetFab.getAttribute('data-copilot-id');
      const targetUserId = targetFab.getAttribute('data-user-id');
      
      let targetNode = null;
      let targetType = '';
      
      if (targetCopilotId) {
        targetNode = window.CopilotManager?.instances?.get(targetCopilotId);
        targetType = 'copilot';
      } else if (targetUserId) {
        targetNode = window.UserNodeManager?.getInstance();
        targetType = 'user';
      }
      
      if (!targetNode) return;
      
      // Create visual connection
      const getCenter = (el) => { 
        const r = el.getBoundingClientRect(); 
        return { x: r.left + r.width/2, y: r.top + r.height/2 }; 
      };
      
      const start = getCenter(fromPoint);
      const end = getCenter(toPoint);
      
      const fromIoId = `${this.type}:${this.id}:${fromSide}:0`;
      const toIoId = `${targetType}:${targetNode.id}:${toSide}:0`;
      const lineId = `link_${fromIoId}__${toIoId}`;
      
      // Use ConnectionLayer for visual connection
      try {
        ConnectionLayer.draw(lineId, start, end);
        ConnectionLayer.pulse(lineId, { duration: 700 });
      } catch {}
      
      // Store connection data
      this._linkLines.set(`${targetType}:${targetNode.id}`, { 
        lineId, 
        fromEl: fromPoint, 
        toEl: toPoint,
        targetNode,
        targetType 
      });
      
      // Register with IORegistry if available
      if (window.IORegistry) {
        try {
          window.IORegistry.registerConnection(fromIoId, toIoId, lineId);
        } catch {}
      }
      
    } catch (error) {
      console.error(`Failed to create connection from ${this.type} to FAB:`, error);
    }
  }

  // Common internet hub linking
  linkToInternetHub(fromPoint, toPoint) {
    try {
      const fromSide = fromPoint.getAttribute('data-side') || 'x';
      const toSide = toPoint.getAttribute('data-side') || 'x';
      
      const getCenter = (el) => { 
        const r = el.getBoundingClientRect(); 
        return { x: r.left + r.width/2, y: r.top + r.height/2 }; 
      };
      
      const start = getCenter(fromPoint);
      const end = getCenter(toPoint);
      
      const fromIoId = `${this.type}:${this.id}:${fromSide}:0`;
      const toIoId = `hub:${toSide}:0`;
      const lineId = `link_${fromIoId}__${toIoId}`;
      
      // Use ConnectionLayer for visual connection
      try {
        ConnectionLayer.draw(lineId, start, end);
        ConnectionLayer.pulse(lineId, { duration: 700 });
      } catch {}
      
      // Store connection data
      this._linkLines.set('hub', { 
        lineId, 
        fromEl: fromPoint, 
        toEl: toPoint 
      });
      
      // Register with IORegistry if available
      if (window.IORegistry) {
        try {
          window.IORegistry.registerConnection(fromIoId, toIoId, lineId);
        } catch {}
      }
      
    } catch (error) {
      console.error(`Failed to create connection from ${this.type} to hub:`, error);
    }
  }

  // Common section linking
  linkToSection(fromPoint, toPoint, targetSection) {
    try {
      const fromSide = fromPoint.getAttribute('data-side') || 'x';
      const sectionKey = targetSection.closest('.panel').getAttribute('data-section-key');
      
      if (!sectionKey) return;
      
      const getCenter = (el) => { 
        const r = el.getBoundingClientRect(); 
        return { x: r.left + r.width/2, y: r.top + r.height/2 }; 
      };
      
      const start = getCenter(fromPoint);
      const end = getCenter(toPoint);
      
      const fromIoId = `${this.type}:${this.id}:${fromSide}:0`;
      const toIoId = `section:${sectionKey}:0`;
      const lineId = `link_${fromIoId}__${toIoId}`;
      
      // Use ConnectionLayer for visual connection
      try {
        ConnectionLayer.draw(lineId, start, end);
        ConnectionLayer.pulse(lineId, { duration: 700 });
      } catch {}
      
      // Store connection data
      this._linkLines.set(`section:${sectionKey}`, { 
        lineId, 
        fromEl: fromPoint, 
        toEl: toPoint,
        sectionKey 
      });
      
      // Register with IORegistry if available
      if (window.IORegistry) {
        try {
          window.IORegistry.registerConnection(fromIoId, toIoId, lineId);
        } catch {}
      }
      
    } catch (error) {
      console.error(`Failed to create connection from ${this.type} to section:`, error);
    }
  }

  // Common connection cleanup
  removeAllConnections() {
    this._linkLines.forEach((conn, key) => {
      try {
        if (conn.lineId) {
          ConnectionLayer.remove(conn.lineId);
        }
      } catch {}
    });
    this._linkLines.clear();
  }

  // Common cleanup
  destroy() {
    this.removeAllConnections();
    if (this.fab && this.fab.parentNode) {
      this.fab.parentNode.removeChild(this.fab);
    }
    this.fab = null;
    this._connectionPoints.clear();
  }
}
