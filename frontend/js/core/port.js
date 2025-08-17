// Port: typed connection endpoint for a node (input/output)
// Encapsulates DOM element, IO identity, direction, and attached connections
import { IORegistry } from '../graph/io-registry.js';

const _byEl = new WeakMap(); // element -> Port

export class Port {
  constructor({ el, nodeType, nodeId, side = 'x', index = 0, direction = 'out', owner = null }) {
    if (!el) throw new Error('Port requires a DOM element');
    this.el = el;
    this.nodeType = String(nodeType || 'node');
    this.nodeId = String(nodeId ?? 'x');
    this.side = side || 'x';
    this.index = Number(index) || 0;
    this.direction = direction === 'in' ? 'in' : 'out';
    this.owner = owner; // optional reference to node instance
    this.connections = new Set();
    this.ioId = this.#ensureIoId();
    _byEl.set(el, this);
  }

  static fromElement(el, meta = {}, owner = null) {
    // Reuse existing if present
    const existing = _byEl.get(el);
    if (existing) return existing;
    // Try reading metadata from IORegistry if available
    let side = 'x', index = 0, nodeType = meta.nodeType, nodeId = meta.nodeId;
    try {
      const info = IORegistry.getByEl?.(el);
      if (info) {
        nodeType = info.nodeType ?? nodeType;
        nodeId = info.nodeId ?? nodeId;
        side = info.side ?? side;
        index = info.index ?? index;
      }
    } catch {}
    // Determine direction from element (data-io)
    let direction = 'out';
    try { const v = el.getAttribute('data-io'); if (v === 'in' || v === 'out') direction = v; } catch {}
    return new Port({ el, nodeType, nodeId, side, index, direction, owner });
  }

  #ensureIoId() {
    try {
      const info = IORegistry.getByEl?.(this.el);
      if (info?.ioId) return info.ioId;
    } catch {}
    // If not registered, register now
    try {
      return IORegistry.register(this.el, {
        nodeType: this.nodeType,
        nodeId: this.nodeId,
        side: this.side,
        index: this.index,
        defaultRole: this.direction
      });
    } catch {
      // Fallback synthetic id
      return `${this.nodeType}:${this.nodeId}:${this.side}:${this.index}`;
    }
  }

  canConnectTo(target) {
    return !!(target && target instanceof Port && this !== target && this.direction === 'out' && target.direction === 'in');
  }

  connectTo(target, ConnectionClass, options = {}) {
    if (!this.canConnectTo(target)) return null;
    const conn = ConnectionClass?.create?.({ sourcePort: this, targetPort: target, ...options });
    if (conn) {
      this.connections.add(conn);
      target.connections.add(conn);
    }
    return conn;
  }

  disconnect(conn) {
    if (!conn) return;
    try { conn.destroy?.(); } catch {}
    this.connections.delete(conn);
    try { conn.targetPort?.connections?.delete?.(conn); } catch {}
  }

  send(payload, meta = {}) {
    // Send payload through all outbound connections
    for (const conn of this.connections) {
      if (conn?.sourcePort === this) {
        try { conn.transmit(payload, meta); } catch {}
      }
    }
  }

  receive(payload, meta = {}) {
    // Default behavior: forward to owner if it exposes a receiver API
    try {
      if (this.owner && typeof this.owner.onPortReceive === 'function') {
        this.owner.onPortReceive(this, payload, meta);
      }
    } catch {}
  }

  static getByElement(el) { return _byEl.get(el) || null; }
}
