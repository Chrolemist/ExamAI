// Link: encapsulates a visual connection between two IO points
// Provides: create(), pulse(), update(), remove(), fields: lineId, from, to, startEl, endEl
import { ConnectionLayer } from './connection-layer.js';

function getCenter(el) {
  if (!el || !el.getBoundingClientRect) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export class Link {
  static create({ lineId, startEl, endEl, from, to }) {
    if (!lineId || !startEl || !endEl) return null;
    try { ConnectionLayer.allow(lineId); } catch {}
    const updateLine = () => { try { ConnectionLayer.draw(lineId, getCenter(startEl), getCenter(endEl)); } catch {} };
  window.addEventListener('resize', updateLine);
  window.addEventListener('scroll', updateLine, { passive: true });
  window.addEventListener('examai:fab:moved', updateLine);
  window.addEventListener('examai:internet:moved', updateLine);
    setTimeout(updateLine, 0);
    const remove = () => {
      try { ConnectionLayer.remove(lineId); } catch {}
      try { window.removeEventListener('resize', updateLine); } catch {}
      try { window.removeEventListener('scroll', updateLine); } catch {}
      try { window.removeEventListener('examai:fab:moved', updateLine); } catch {}
  try { window.removeEventListener('examai:internet:moved', updateLine); } catch {}
    };
    const pulse = (opts = {}) => { try { ConnectionLayer.pulse(lineId, opts); } catch {} };
    const rec = { lineId, updateLine, startEl, endEl, from, to, remove, pulse, update: updateLine };
    return rec;
  }
}
