// BoardSections: editable section headers with IO points you can link Output->Input into.
import { ConnectionLayer } from './connection-layer.js';
import { GraphPersistence } from './graph-persistence.js';
import { IORegistry } from './io-registry.js';
import { toast } from '../ui.js';

export const BoardSections = (() => {
  const KEY_TITLES = 'examai.sections.titles';
  const titles = (() => { try { return JSON.parse(localStorage.getItem(KEY_TITLES)||'{}')||{}; } catch { return {}; } })();
  const KEY_BODIES = 'examai.sections.bodies';
  const bodies = (() => { try { return JSON.parse(localStorage.getItem(KEY_BODIES)||'{}')||{}; } catch { return {}; } })();
  const sections = new Map(); // key -> { el, titleEl, ioPoint }

  function saveTitles() { try { localStorage.setItem(KEY_TITLES, JSON.stringify(titles)); } catch {} }
  function saveBodies() { try { localStorage.setItem(KEY_BODIES, JSON.stringify(bodies)); } catch {} }

  function init() {
    document.querySelectorAll('.board-section').forEach(sec => {
      const key = sec.getAttribute('data-section-key') || sec.id || `sec_${sections.size+1}`;
      const head = sec.querySelector('.head h2');
      if (!head) return;
      const orig = head.textContent || '';
      head.contentEditable = 'true';
      head.spellcheck = false;
      head.setAttribute('data-key', key);
      head.addEventListener('blur', () => {
        titles[key] = head.textContent || orig; saveTitles();
      });
      // restore saved title
      if (titles[key]) head.textContent = titles[key];
      // Make entire body editable + persisted
      const body = sec.querySelector('.body');
      if (body) {
        body.contentEditable = 'true';
        body.spellcheck = true;
        body.setAttribute('data-key', key);
        const applyInitial = () => { if (bodies[key]) body.innerHTML = bodies[key]; };
        applyInitial();
        let t=null;
        const saveNow = () => { bodies[key] = body.innerHTML || ''; saveBodies(); };
        body.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(saveNow, 400); });
        body.addEventListener('blur', saveNow);
      }
  // add an IO point to the right side of header
  let io = document.createElement('span');
      io.className = 'conn-point io-in section-io';
      io.setAttribute('title', 'Input');
      io.setAttribute('data-io', 'in');
      io.setAttribute('data-side', 'r');
      // position inline in header
      const headContainer = sec.querySelector('.head');
      headContainer && headContainer.appendChild(io);
  // Register IO point for stable identity
  try { IORegistry.register(io, { nodeType: 'section', nodeId: key, side: 'r', index: 0, defaultRole: 'in' }); } catch {}
      // record
      sections.set(key, { el: sec, titleEl: head, ioPoint: io });

      // Attach a simple context menu to unlink all connections into this section
      const attachMenu = (targetEl) => {
        targetEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const menu = document.createElement('div');
          menu.className = 'fab-menu';
          menu.innerHTML = `<div class="fab-menu-row"><button data-action="unlink-all">Unlink till denna sektion</button></div>`;
          document.body.appendChild(menu);
          const pad = 8, mw = 220;
          const left = Math.min(Math.max(pad, e.clientX), window.innerWidth - mw - pad);
          const top = Math.min(Math.max(pad, e.clientY), window.innerHeight - 40 - pad);
          menu.style.left = left + 'px'; menu.style.top = top + 'px';
          menu.classList.add('show');
          const onDoc = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); } };
          document.addEventListener('mousedown', onDoc);
          document.addEventListener('touchstart', onDoc);
          menu.querySelector('[data-action="unlink-all"]').onclick = (ev) => { ev.stopPropagation(); try { unlinkAllFor(key); toast('Alla länkar till sektionen togs bort.'); } catch {} menu.remove(); };
        });
      };
      // Context menu on header row and IO dot
      if (headContainer) attachMenu(headContainer);
      if (io) attachMenu(io);
    });
  }

  // Helper to query section IO element by key
  function getIoFor(key) {
    const rec = sections.get(key);
    return rec && rec.ioPoint;
  }

  // Helper to resolve a section element by key
  function getSectionEl(key) {
    const rec = sections.get(key);
    return rec && rec.el;
  }

  // Append content into a section's body as a block (supports markdown if markdown-it is present)
  function append(key, text, opts = {}) {
    const el = getSectionEl(key) || document.querySelector(`.board-section[data-section-key="${key}"]`);
    if (!el) return;
    const body = el.querySelector('.body') || el;
    const block = document.createElement('div');
    block.className = 'section-item assistant';
  const who = (opts.author && String(opts.author).trim()) || 'Coworker';
    block.innerHTML = `<div class="msg-author">${who}</div><div class="msg-text"></div>`;
    const msgEl = block.querySelector('.msg-text');
    try {
      if (window.markdownit && (opts.renderMode === 'md' || localStorage.getItem('examai.render_mode') === 'md')) {
        const md = window.markdownit({ html:false, linkify:true, breaks:true });
        msgEl.innerHTML = md.render(text || '');
      } else {
        msgEl.textContent = text || '';
      }
    } catch { msgEl.textContent = text || ''; }
    body.appendChild(block);
    try { body.scrollTop = body.scrollHeight; } catch {}
  // Persist the updated body HTML so appended items survive reload
  try { const k = key; if (k) { bodies[k] = body.innerHTML || ''; saveBodies(); } } catch {}
  }

  // Unlink all incoming links into a section (from all copilots and the user)
  function unlinkAllFor(key) {
    // From copilots
    try {
      const CM = window?.CopilotManager;
      if (CM?.instances) {
        for (const [id, inst] of CM.instances.entries()) {
          const conn = inst?.connections?.get?.(`section:${key}`);
          if (conn) {
            const arr = Array.isArray(conn) ? conn : [conn];
            arr.forEach(rec => { try { rec.remove?.(); } catch {} });
            try { inst.connections.delete(`section:${key}`); } catch {}
            try { inst.outNeighbors?.delete?.(`section:${key}`); } catch {}
          }
        }
      }
      GraphPersistence.removeWhere(l => l.fromType==='copilot' && l.toType==='section' && l.toId===key);
    } catch {}
    // From user
    try {
      const UN = window?.__ExamAI_UserNodeApi;
      const u = UN?.ensure ? UN.ensure() : null;
      if (u && u._sectionLinkLines) {
        const lines = u._sectionLinkLines.get(key);
        if (lines) {
          const arr = Array.isArray(lines) ? lines : [lines];
          arr.forEach(rec => { try { rec.remove?.(); } catch {} });
          try { u._sectionLinkLines.delete(key); } catch {}
        }
        try { u._linkedSections?.delete?.(key); } catch {}
      }
      GraphPersistence.removeWhere(l => l.fromType==='user' && l.toType==='section' && l.toId===key);
    } catch {}
  }

  return { init, getIoFor, getSectionEl, append, unlinkAllFor };
})();
