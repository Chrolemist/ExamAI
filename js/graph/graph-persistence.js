// GraphPersistence module: persists copilot ids and directional links with anchor sides.
// Provides restore() that accepts dependencies to avoid circular imports.
import { ConnectionLayer } from './connection-layer.js';
import { IORegistry } from './io-registry.js';

export const GraphPersistence = (() => {
  const KEY_COPILOTS = 'examai.graph.copilots';
  const KEY_LINKS = 'examai.graph.links';

  function _readCopilots() {
    try { return JSON.parse(localStorage.getItem(KEY_COPILOTS) || '[]') || []; } catch { return []; }
  }
  function _writeCopilots(list) {
    try { localStorage.setItem(KEY_COPILOTS, JSON.stringify(Array.from(new Set(list)))); } catch {}
  }
  function _readLinks() {
    try { return JSON.parse(localStorage.getItem(KEY_LINKS) || '[]') || []; } catch { return []; }
  }
  function _writeLinks(list) {
    try { localStorage.setItem(KEY_LINKS, JSON.stringify(list)); } catch {}
  }

  function registerCopilot(id) {
    const all = _readCopilots();
    if (!all.includes(id)) { all.push(id); _writeCopilots(all); }
  }

  function unregisterCopilot(id) {
    const all = _readCopilots().filter(x => x !== id);
    _writeCopilots(all);
    // also drop any links involving this id
    removeWhere(l => (l.fromType === 'copilot' && l.fromId === id) || (l.toType === 'copilot' && l.toId === id));
  }

  function addLink(link) {
    // link: { fromType, fromId, fromSide, toType, toId, toSide }
    const norm = { ...link };
    const sig = `${norm.fromType}:${norm.fromId}:${norm.fromSide}->${norm.toType}:${norm.toId}:${norm.toSide}`;
    const list = _readLinks();
    if (!list.some(l => `${l.fromType}:${l.fromId}:${l.fromSide}->${l.toType}:${l.toId}:${l.toSide}` === sig)) {
      list.push(norm); _writeLinks(list);
    }
  }

  function removeWhere(pred) {
    const list = _readLinks();
    const next = list.filter(l => { try { return !pred(l); } catch { return true; } });
    _writeLinks(next);
  }

  async function restore(deps = {}) {
  const { InternetHub, UserNode, CopilotManager, BoardSections } = deps;
    try {
      // Ensure required singletons
      try { InternetHub?.element?.(); } catch {}
      const user = UserNode?.ensure ? UserNode.ensure() : null;
      // Restore copilots
      const ids = _readCopilots();
      if (Array.isArray(ids)) {
        ids.forEach(id => { try { CopilotManager?.add?.(id); } catch {} });
      }
      // Restore links
      const links = _readLinks();
      for (const l of links) {
        try {
          if (l.fromType === 'copilot' && l.toType === 'internet') {
            const inst = CopilotManager?.instances?.get?.(l.fromId);
            if (inst && InternetHub?.linkCopilot) InternetHub.linkCopilot(inst);
            continue;
          }
          if (l.fromType === 'copilot' && l.toType === 'copilot') {
            const a = CopilotManager?.instances?.get?.(l.fromId);
            const b = CopilotManager?.instances?.get?.(l.toId);
            if (a && b && a.id !== b.id) { try { a.linkTo(b, l.fromSide || 'x', l.toSide || 'x', { persist: false }); } catch {} }
            continue;
          }
          if (l.fromType === 'copilot' && l.toType === 'section') {
            const a = CopilotManager?.instances?.get?.(l.fromId);
            const io = BoardSections?.getIoFor?.(l.toId);
            if (a && io) {
              try {
                const start = a.fab.querySelector(`.conn-point[data-side="${l.fromSide || 'x'}"]`) || a.fab;
                const end = io;
                // draw a line like in interactive path
                const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
                const fromIoId = (IORegistry.getByEl(start)?.ioId) || `copilot:${a.id}:${l.fromSide || 'x'}:0`;
                const toIoId = (IORegistry.getByEl(end)?.ioId) || `section:${l.toId}:r:0`;
                const lineId = `link_${fromIoId}__${toIoId}`;
                ConnectionLayer.allow(lineId);
                const updateLine = () => { ConnectionLayer.draw(lineId, getCenter(start), getCenter(end)); };
                window.addEventListener('resize', updateLine);
                window.addEventListener('scroll', updateLine, { passive:true });
                window.addEventListener('examai:fab:moved', updateLine);
                setTimeout(updateLine, 0);
                const rec = { lineId, updateLine, from: a.id, to: `section:${l.toId}`, startEl: start, endEl: end };
                const key = `section:${l.toId}`;
                const mine = a.connections.get(key);
                if (mine) { if (Array.isArray(mine)) mine.push(rec); else a.connections.set(key, [mine, rec]); }
                else { a.connections.set(key, [rec]); }
                try { a.outNeighbors?.add(key); } catch {}
              } catch {}
            }
            continue;
          }
          if (l.toType === 'user' && user) {
            const a = CopilotManager?.instances?.get?.(l.fromId);
            if (a) {
              // Draw the visual link and restore routing semantics so replies fan out to the user
              try { UserNode.linkFromCopilotSides(a, l.fromSide || 'x', l.toSide || 'x'); } catch {}
              try { a.outNeighbors?.add('user'); } catch {}
            }
            continue;
          }
          if (l.fromType === 'user' && l.toType === 'copilot' && user) {
            const b = CopilotManager?.instances?.get?.(l.toId);
            if (b) {
              try { UserNode.linkToCopilotSides(b, l.fromSide || 'x', l.toSide || 'x'); } catch {}
              // Ensure routing semantics restored
              try { b.inNeighbors?.add('user'); } catch {}
            }
            continue;
          }
          if (l.fromType === 'user' && l.toType === 'section' && user) {
            try { UserNode.linkToSectionByKey?.(l.toId, l.fromSide || 'x'); } catch {}
            continue;
          }
        } catch {}
      }
    } catch {}
  }

  return { registerCopilot, unregisterCopilot, addLink, removeWhere, restore };
})();
