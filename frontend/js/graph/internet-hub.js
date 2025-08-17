// Internet hub node that copilots can link to for web access
import { ConnectionLayer } from './connection-layer.js';
import { GraphPersistence } from './graph-persistence.js';
import { IORegistry } from './io-registry.js';
import { Link } from './link.js';
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
    // Prevent duplicate link creation; just pulse existing
    if (linked.has(inst.id)) {
      try {
        const item = inst.connections.get(LINK_KEY);
        if (item?.lineId) ConnectionLayer.pulse(item.lineId, { duration: 700 });
        try { toast('Redan kopplad: Internet.', 'info'); } catch {}
      } catch {}
      return;
    }
    const hub = element();
    // Determine anchors: use provided elements if available, else query by side, else fall back to centers
    const isEl = (x) => x && typeof x.getBoundingClientRect === 'function';
    let startEl = null;
    if (isEl(startElOrSide)) startEl = startElOrSide;
    else if (typeof startElOrSide === 'string' && inst?.fab) startEl = inst.fab.querySelector(`.conn-point[data-side="${startElOrSide}"]`);
    if (!startEl && inst?.fab) startEl = inst.fab; // fallback to center

    let endEl = null;
    if (isEl(endElOrSide)) endEl = endElOrSide;
    else if (typeof endElOrSide === 'string') endEl = hub.querySelector(`.conn-point[data-side="${endElOrSide}"]`);
    if (!endEl) endEl = hub; // fallback to center

  // Build ioId-based lineId for dedup and consistency
  const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
  const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
  const fromIoId = (IORegistry.getByEl(startEl)?.ioId) || `copilot:${inst.id}:${ss}:0`;
  const toIoId = (IORegistry.getByEl(endEl)?.ioId) || `internet:hub:${es}:0`;
  const lineId = `link_${fromIoId}__${toIoId}`;
  const rec = Link.create({ lineId, startEl, endEl, from: inst.id, to: 'internet' });
    linked.add(inst.id);
    // Persist sides if we can resolve them
    try {
      const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
      const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
      GraphPersistence.addLink({ fromType:'copilot', fromId:inst.id, fromSide:ss, toType:'internet', toId:'hub', toSide:es });
    } catch {}
  inst.connections.set(LINK_KEY, rec);
    window.dispatchEvent(new CustomEvent('examai:internet:linked', { detail: { copilotId: inst.id } }));
  setTimeout(() => rec.update?.(), 0);
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
  // Simple context menu for the hub to allow manual unlinking without the copilot menu
  function attachMenu() {
    const hub = element();
    if (hub._menuAttached) return; hub._menuAttached = true;
    hub.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = document.createElement('div');
      menu.className = 'fab-menu';
      menu.innerHTML = `<div class="fab-menu-row"><button data-action="unlink-all">Unlink alla</button></div>`;
      document.body.appendChild(menu);
      const pad = 8; const mw = 160;
      const left = Math.min(Math.max(pad, e.clientX), window.innerWidth - mw - pad);
      const top = Math.min(Math.max(pad, e.clientY), window.innerHeight - 40 - pad);
      menu.style.left = left + 'px'; menu.style.top = top + 'px'; menu.classList.add('show');
      const onDoc = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); } };
      document.addEventListener('mousedown', onDoc); document.addEventListener('touchstart', onDoc);
      const btn = menu.querySelector('[data-action="unlink-all"]');
      btn.onclick = (ev) => { ev.stopPropagation(); unlinkAll(); menu.remove(); };
    });
  }
  function isLinked(copilotId) { return linked.has(copilotId); }
  function setActive(v) { element().classList.toggle('active', !!v); }
  attachMenu();
  return { element, linkCopilot, unlinkCopilot, unlinkAll, isLinked, setActive, LINK_KEY };
})();
