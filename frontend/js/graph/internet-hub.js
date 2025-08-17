// Internet hub node that copilots can link to for web access
import { ConnectionLayer } from './connection-layer.js';
import { GraphPersistence } from './graph-persistence.js';
import { IORegistry } from './io-registry.js';
import { Link } from './link.js';
import { ConnectionFactory } from '../core/connection-factory.js';
import { NodeBoard } from './node-board.js';

export const InternetHub = (() => {
  let el = null;
  const LINK_KEY = 'internet-noden';
  const linked = new Set(); // copilot ids
  function ensure() {
    if (el) return el;
    const d = document.createElement('div');
    d.id = 'internetHub';
    d.className = 'internet-hub fab';
    d.title = 'Internet';
    d.innerHTML = `
      <svg class="globe" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="url(#gradHub)" stroke-width="1.6"><defs><linearGradient id="gradHub" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></g></svg>
    `;
    d.style.left = '2px'; // Relative to Node Board padding
    d.style.top = '40px'; // Relative to Node Board
    d.style.right = 'auto';
    d.style.bottom = 'auto';
    // connection points
    ['t','b','l','r'].forEach(side => {
      const p = document.createElement('div');
      p.className = 'conn-point io-in';
      p.setAttribute('data-side', side);
      d.appendChild(p);
      // Register hub IO points for stable identities
      try { IORegistry.register(p, { nodeType: 'internet', nodeId: 'hub', side, index: 0, defaultRole: 'in' }); } catch {}
    });
    const nodeBoard = document.getElementById('nodeBoard');
    if (nodeBoard) {
      nodeBoard.appendChild(d);
    } else {
      document.body.appendChild(d);
    }
    try { NodeBoard.bind?.(d); } catch {}
    // No drag functionality - FABs are now statically positioned
    try { NodeBoard.onMoved?.(d); } catch {}
    el = d;
    return el;
  }
  function element() { return ensure(); }
  function linkCopilot(inst, startElOrSide = null, endElOrSide = null) {
    // If already linked and a new drop occurs, replace the link with the new endpoints
    if (linked.has(inst.id)) {
      const existing = inst.connections.get(LINK_KEY);
      if (existing) {
        // If user is explicitly dropping again (new anchors provided), recreate the link
        if (startElOrSide || endElOrSide) {
          try { existing.remove?.(); } catch {}
          try { inst.connections.delete(LINK_KEY); } catch {}
          linked.delete(inst.id);
        } else {
          try { if (existing.lineId) ConnectionLayer.pulse(existing.lineId, { duration: 700 }); } catch {}
          try { toast('Redan kopplad: Internet.', 'info'); } catch {}
          return;
        }
      } else {
        // Inconsistent state: allow recreating
        linked.delete(inst.id);
      }
    }
    const hub = element();
    // Determine anchors: use provided elements if available, else query by side, else fall back to centers
    const isEl = (x) => x && typeof x.getBoundingClientRect === 'function';
    let startEl = null;
    if (isEl(startElOrSide)) startEl = startElOrSide;
    else if (typeof startElOrSide === 'string' && inst?.fab) startEl = inst.fab.querySelector(`.conn-point[data-side="${startElOrSide}"]`);
    if (!startEl && inst?.fab) {
      // Prefer side towards hub (left if hub is left of copilot)
      try {
        const hubRect = element().getBoundingClientRect();
        const fabRect = inst.fab.getBoundingClientRect();
        const side = (hubRect.left < fabRect.left) ? 'l' : 'r';
        startEl = inst.fab.querySelector(`.conn-point[data-side="${side}"]`) || inst.fab;
      } catch { startEl = inst.fab; }
    }

    let endEl = null;
    if (isEl(endElOrSide)) endEl = endElOrSide;
    else if (typeof endElOrSide === 'string') endEl = hub.querySelector(`.conn-point[data-side="${endElOrSide}"]`);
    if (!endEl) {
      // Prefer side facing the copilot
      try {
        const hubRect = hub.getBoundingClientRect();
        const fabRect = inst.fab.getBoundingClientRect();
        const side = (fabRect.left < hubRect.left) ? 'l' : 'r';
        endEl = hub.querySelector(`.conn-point[data-side="${side}"]`) || hub;
      } catch { endEl = hub; }
    }

  // Build ioId-based lineId for dedup and consistency
  const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
  const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
  const fromIoId = (IORegistry.getByEl(startEl)?.ioId) || `copilot:${inst.id}:${ss}:0`;
  const toIoId = (IORegistry.getByEl(endEl)?.ioId) || `internet:hub:${es}:0`;
  const lineId = `link_${fromIoId}__${toIoId}`;
  const conn = ConnectionFactory.connect(startEl, endEl, { nodeType:'copilot', nodeId: String(inst.id) }, { nodeType:'internet', nodeId:'hub' }, { ownerOut: inst, ownerIn: InternetHub });
  const rec = conn || Link.create({ lineId, startEl, endEl, from: inst.id, to: 'internet' });
    linked.add(inst.id);
    // Persist sides if we can resolve them
    try {
      const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
      const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
      GraphPersistence.addLink({ fromType:'copilot', fromId:inst.id, fromSide:ss, toType:'internet', toId:'hub', toSide:es });
    } catch {}
  inst.connections.set(LINK_KEY, rec);
    window.dispatchEvent(new CustomEvent('examai:internet:linked', { detail: { copilotId: inst.id } }));
  try { rec.update?.(); } catch {}
  setTimeout(() => rec.update?.(), 0);
  }

  // Optional: allow user node to link visually to the hub as well
  function linkUser(userNode, startElOrSide = null, endElOrSide = null) {
    const hub = element();
    const isEl = (x) => x && typeof x.getBoundingClientRect === 'function';
    let startEl = null;
    if (isEl(startElOrSide)) startEl = startElOrSide; else if (typeof startElOrSide === 'string' && userNode?.fab) startEl = userNode.fab.querySelector(`.conn-point[data-side="${startElOrSide}"]`);
    if (!startEl && userNode?.fab) startEl = userNode.fab;
    let endEl = null;
    if (isEl(endElOrSide)) endEl = endElOrSide; else if (typeof endElOrSide === 'string') endEl = hub.querySelector(`.conn-point[data-side="${endElOrSide}"]`);
    if (!endEl) endEl = hub;

    const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
    const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
    const fromIoId = (IORegistry.getByEl(startEl)?.ioId) || `user:${userNode?.id || 'user'}:${ss}:0`;
    const toIoId = (IORegistry.getByEl(endEl)?.ioId) || `internet:hub:${es}:0`;
    const lineId = `link_${fromIoId}__${toIoId}`;
    const rec = Link.create({ lineId, startEl, endEl, from: 'user', to: 'internet' });
    setTimeout(() => rec.update?.(), 0);
    return rec;
  }
  function unlinkCopilot(inst) {
    if (!linked.has(inst.id)) return;
  const item = inst.connections.get(LINK_KEY);
  if (item) { try { item.remove?.(); } catch {} inst.connections.delete(LINK_KEY); }
    linked.delete(inst.id);
    try { GraphPersistence.removeWhere(l => l.fromType==='copilot' && l.fromId===inst.id && l.toType==='internet'); } catch {}
    window.dispatchEvent(new CustomEvent('examai:internet:unlinked', { detail: { copilotId: inst.id } }));
  }
  function unlinkAll() {
    const ids = Array.from(linked);
    ids.forEach(id => { const inst = window?.CopilotManager?.instances?.get?.(id); if (inst) unlinkCopilot(inst); });
  }
  // Context menu functionality removed - using disconnect buttons on connection lines instead
  function attachMenu() {
    const hub = element();
    if (hub._menuAttached) return; 
    hub._menuAttached = true;
    // Menu functionality disabled - using disconnect buttons instead
  }
  function isLinked(copilotId) { return linked.has(copilotId); }
  function setActive(v) { element().classList.toggle('active', !!v); }
  attachMenu();
  return { element, linkCopilot, linkUser, unlinkCopilot, unlinkAll, isLinked, setActive, LINK_KEY };
})();
