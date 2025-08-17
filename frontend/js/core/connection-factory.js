import { Port } from './port.js';
import { Connection } from './connection.js';

export const ConnectionFactory = (() => {
  const connectionsById = new Map();
  function connect(elOut, elIn, metaOut = {}, metaIn = {}, { ownerOut = null, ownerIn = null } = {}) {
    const out = Port.fromElement(elOut, metaOut, ownerOut);
    const inp = Port.fromElement(elIn, metaIn, ownerIn);
    if (!out.canConnectTo(inp)) return null;
    const conn = Connection.create({ sourcePort: out, targetPort: inp });
    if (conn) connectionsById.set(conn.id, conn);
    return conn;
  }
  function get(id) { return connectionsById.get(id) || null; }
  function remove(id) { const c = connectionsById.get(id); if (c) { try { c.destroy(); } catch {} connectionsById.delete(id); return true; } return false; }
  function sendThrough(id, payload, meta = {}) { const c = get(id); if (c) c.transmit(payload, meta); }
  return { connect, get, remove, sendThrough };
})();
