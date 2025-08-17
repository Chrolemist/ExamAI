// Internet hub node that copilots can link to for web access
import { ConnectionLayer } from './connection-layer.js';
import { GraphPersistence } from './graph-persistence.js';

export const InternetHub = (() => {
  let el = null;
  const LINK_KEY = 'internet-noden';
  const linked = new Set(); // copilot ids
  let dragging = false, sx=0, sy=0, ox=0, oy=0;
  function ensure() {
    if (el) return el;
    const d = document.createElement('div');
    d.id = 'internetHub';
    d.className = 'internet-hub fab';
    d.title = 'Internet';
    d.innerHTML = `
      <svg class="globe" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="url(#gradHub)" stroke-width="1.6"><defs><linearGradient id="gradHub" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></g></svg>
    `;
    const vh = Math.max(240, window.innerHeight || 240);
    d.style.left = '18px';
    d.style.top = (vh - 110) + 'px';
    d.style.right = 'auto';
    d.style.bottom = 'auto';
    // connection points
    ['t','b','l','r'].forEach(side => {
      const p = document.createElement('div');
      p.className = 'conn-point io-in';
      p.setAttribute('data-side', side);
      d.appendChild(p);
    });
    document.body.appendChild(d);
    const onDown = (e) => {
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      const r = d.getBoundingClientRect();
      ox = r.left; oy = r.top;
      document.addEventListener('mousemove', onMove, { passive:false });
      document.addEventListener('mouseup', onUp, { passive:false });
      document.addEventListener('touchmove', onMove, { passive:false });
      document.addEventListener('touchend', onUp, { passive:false });
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const nx = ox + (p.clientX - sx);
      const ny = oy + (p.clientY - sy);
      d.style.left = nx + 'px';
      d.style.top = ny + 'px';
      d.style.right = 'auto'; d.style.bottom = 'auto';
      window.dispatchEvent(new CustomEvent('examai:internet:moved'));
      e.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      try {
        const r = d.getBoundingClientRect();
        localStorage.setItem('examai.internetHub.pos', JSON.stringify({ x: r.left, y: r.top }));
      } catch {}
    };
    d.addEventListener('mousedown', onDown, { passive:false });
    d.addEventListener('touchstart', onDown, { passive:false });
    try {
      const saved = localStorage.getItem('examai.internetHub.pos');
      if (saved) {
        const { x, y } = JSON.parse(saved);
        if (Number.isFinite(x)) d.style.left = x + 'px';
        if (Number.isFinite(y)) d.style.top = y + 'px';
      }
    } catch {}
    el = d;
    return el;
  }
  function element() { return ensure(); }
  function getCenter(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; }
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

    const lineId = `link_internet_${inst.id}`;
    ConnectionLayer.allow(lineId);
    const updateLine = () => ConnectionLayer.draw(lineId, getCenter(startEl), getCenter(endEl));
    window.addEventListener('resize', updateLine);
    window.addEventListener('scroll', updateLine, { passive:true });
    window.addEventListener('examai:internet:moved', updateLine);
    window.addEventListener('examai:fab:moved', updateLine);
    // initial draw
    updateLine();
    linked.add(inst.id);
    // Persist sides if we can resolve them
    try {
      const ss = (startEl?.getAttribute && startEl.getAttribute('data-side')) || 'x';
      const es = (endEl?.getAttribute && endEl.getAttribute('data-side')) || 'x';
      GraphPersistence.addLink({ fromType:'copilot', fromId:inst.id, fromSide:ss, toType:'internet', toId:'hub', toSide:es });
    } catch {}
    inst.connections.set(LINK_KEY, { lineId, updateLine, ro: [] });
    window.dispatchEvent(new CustomEvent('examai:internet:linked', { detail: { copilotId: inst.id } }));
    setTimeout(updateLine, 0);
  }
  function unlinkCopilot(inst) {
    if (!linked.has(inst.id)) return;
    const item = inst.connections.get(LINK_KEY);
    if (item) {
  ConnectionLayer.remove(item.lineId);
      window.removeEventListener('resize', item.updateLine);
      window.removeEventListener('scroll', item.updateLine);
      window.removeEventListener('examai:internet:moved', item.updateLine);
      window.removeEventListener('examai:fab:moved', item.updateLine);
      inst.connections.delete(LINK_KEY);
    }
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
