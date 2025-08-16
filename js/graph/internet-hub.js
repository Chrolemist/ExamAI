// Internet hub node that copilots can link to for web access
import { ConnectionLayer } from './connection-layer.js';

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
      p.className = 'conn-point';
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
  function linkCopilot(inst) {
    const hub = element();
    const a = getCenter(inst.fab);
    const b = getCenter(hub);
    const lineId = `link_internet_${inst.id}`;
    ConnectionLayer.draw(lineId, a, b);
    const updateLine = () => ConnectionLayer.draw(lineId, getCenter(inst.fab), getCenter(hub));
    window.addEventListener('resize', updateLine);
    window.addEventListener('scroll', updateLine, { passive:true });
    window.addEventListener('examai:internet:moved', updateLine);
    window.addEventListener('examai:fab:moved', updateLine);
    linked.add(inst.id);
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
    window.dispatchEvent(new CustomEvent('examai:internet:unlinked', { detail: { copilotId: inst.id } }));
  }
  function isLinked(copilotId) { return linked.has(copilotId); }
  function setActive(v) { element().classList.toggle('active', !!v); }
  return { element, linkCopilot, unlinkCopilot, isLinked, setActive, LINK_KEY };
})();
