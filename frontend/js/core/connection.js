// Connection: object-oriented link carrying payloads between Ports
import { ConnectionLayer } from '../graph/connection-layer.js';
import { Link } from '../graph/link.js';

export class Connection {
  constructor({ id, sourcePort, targetPort, visual = null }) {
    if (!sourcePort || !targetPort) throw new Error('Connection requires source and target ports');
    if (sourcePort.direction !== 'out' || targetPort.direction !== 'in') {
      throw new Error('Invalid port directions: require output → input');
    }
    this.id = id || this.#makeId(sourcePort, targetPort);
    this.sourcePort = sourcePort;
    this.targetPort = targetPort;
    this.payload = null;
    this.created = Date.now();
    this.visual = visual; // Link record for rendering and event hooks
  }

  static create({ sourcePort, targetPort }) {
    if (!sourcePort || !targetPort) return null;
    if (sourcePort.direction !== 'out' || targetPort.direction !== 'in') return null;
    const id = `link_${sourcePort.ioId}__${targetPort.ioId}`;
    // Draw or reuse visual via Link
    const startEl = sourcePort.el;
    const endEl = targetPort.el;
    const visual = Link.create({ lineId: id, startEl, endEl, from: `${sourcePort.nodeType}:${sourcePort.nodeId}`, to: `${targetPort.nodeType}:${targetPort.nodeId}` });
    return new Connection({ id, sourcePort, targetPort, visual });
  }

  #makeId(a, b) { return `link_${a.ioId}__${b.ioId}`; }

  transmit(payload, meta = {}) {
    this.payload = payload;
    try { ConnectionLayer.pulse(this.id, { duration: Math.min(2000, Math.max(400, meta.duration || 900)), reverse: !!meta.reverse }); } catch {}
    try { this.targetPort.receive(payload, { ...meta, via: this }); } catch {}
  }

  destroy() {
    try { this.visual?.remove?.(); } catch {}
  }
}
