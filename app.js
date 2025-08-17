// Frontend orchestrator imports
import { els } from './js/dom.js';
import { toast, toggleDrawer, showModal, escapeHtml } from './js/ui.js';
import { ConnectionLayer } from './js/graph/connection-layer.js';
import { InternetHub } from './js/graph/internet-hub.js';
import { GraphPersistence } from './js/graph/graph-persistence.js';
import { BoardSections } from './js/graph/board-sections.js';
import { ConversationManager } from './js/graph/conversation-manager.js';
import { CopilotInstance, CopilotManager } from './js/nodes/copilot-instance.js';

// Server key status (from backend /key-status)
let hasServerKey = false;

// Global Pause/Resume manager (centralized and simple)
const PauseManager = (() => {
  const KEY = 'examai.flow.paused';
  const independentQueue = new Map(); // copilotId -> [msg]
  const isPaused = () => {
    try { return localStorage.getItem(KEY) === 'true'; } catch { return false; }
  };
  const updateUi = () => {
    const paused = isPaused();
    // Ensure paused banner exists once
    let banner = document.getElementById('pausedBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'pausedBanner';
      banner.textContent = 'Flödet är pausat';
      document.body.appendChild(banner);
    }
    const btn = document.getElementById('pauseFlowBtn');
    if (btn) {
      // Large clear icons: Pause when running (red), Play when paused (resume)
      if (paused) {
        // Play icon (outline triangle)
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5 L19 12 L7 19 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>`; // play (outline)
        btn.title = 'Återuppta flöde';
        btn.classList.add('paused');
        btn.setAttribute('aria-label', 'Återuppta flöde');
      } else {
        // Pause icon: two thin bars (outline)
        btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><line x1="8" y1="5" x2="8" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="16" y1="5" x2="16" y2="19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`; // pause (outline)
        btn.title = 'Pausa flöde';
        btn.classList.remove('paused');
        btn.setAttribute('aria-label', 'Pausa flöde');
      }
      // Position the paused banner just below the pause button so it doesn't cover it
      const positionBanner = () => {
        try {
          const r = btn.getBoundingClientRect();
          if (!r || !Number.isFinite(r.left)) return;
          banner.style.left = (r.left + r.width / 2) + 'px';
          banner.style.top = (r.bottom + 8) + 'px';
        } catch {}
      };
      positionBanner();
      if (!banner._posBound) {
        banner._posBound = true;
        window.addEventListener('resize', positionBanner);
        window.addEventListener('scroll', positionBanner, { passive: true });
      }
    }
    document.body.classList.toggle('flow-paused', !!paused);
  };
  async function flushQueue() {
    for (const [id, list] of independentQueue.entries()) {
      const inst = CopilotManager?.instances?.get(id);
      if (!inst) continue;
      for (const msg of list) {
        try { await inst.sendQueued?.(msg); } catch {}
      }
    }
    independentQueue.clear();
  }
  async function setPaused(v) {
    try { localStorage.setItem(KEY, v ? 'true' : 'false'); } catch {}
    updateUi();
    if (!v) await flushQueue();
  }
  function toggle() { setPaused(!isPaused()); }
  function queueIndependent(id, msg) {
    const arr = independentQueue.get(id) || [];
    arr.push(msg);
    independentQueue.set(id, arr);
  }
  function resumeAll() { setPaused(false); }
  // Initialize UI once
  updateUi();
  return { isPaused, setPaused, toggle, queueIndependent, flushQueue, resumeAll, _queue: independentQueue };
})();

// Expose globals for modules that consult window.* bridges
try { window.PauseManager = PauseManager; } catch {}
try { window.__ExamAI_hasServerKey = hasServerKey; } catch {}
try { window.CopilotManager = CopilotManager; } catch {}
// Small global for ConversationManager to label user messages
try { window.getGlobalUserName = () => { try { return localStorage.getItem('examai.user.name') || 'Du'; } catch { return 'Du'; } }; } catch {}

// Wire pause button
document.getElementById('pauseFlowBtn')?.addEventListener('click', () => PauseManager.toggle());

// Add copilot button
document.getElementById('addCopilotBtn')?.addEventListener('click', () => CopilotManager.add());

// Initialize Internet hub on load
try { InternetHub.element(); } catch {}
// Initialize board sections (editable headers + IO points)
try { BoardSections.init(); } catch {}
try { window.BoardSections = BoardSections; } catch {}

// Refresh server key status
(async () => {
  try {
    const res = await fetch('/key-status');
    const data = await res.json();
    hasServerKey = !!(data && data.hasKey);
    window.__ExamAI_hasServerKey = hasServerKey;
    window.dispatchEvent(new CustomEvent('examai:serverKeyStatusChanged'));
  } catch {}
})();
// Internet hub already initialized above

// ===================== User Node (human) =====================
// A single draggable FAB and panel representing the human. Holds identity and history.
const UserNode = (() => {
  const KEY_NAME = 'examai.user.name';
  const KEY_FONT = 'examai.user.font';
  const KEY_COLOR = 'examai.user.bubbleColor';
  const KEY_HISTORY = 'examai.user.history';
  let instance = null;

  function getName() {
    try { return localStorage.getItem(KEY_NAME) || 'Du'; } catch { return 'Du'; }
  }
  function setName(v) {
    const val = (v || '').trim() || 'Du';
    try { localStorage.setItem(KEY_NAME, val); } catch {}
    window.dispatchEvent(new CustomEvent('examai:userNameChanged', { detail: { name: val } }));
  }
  function getFont() { return localStorage.getItem(KEY_FONT) || 'system-ui, sans-serif'; }
  function setFont(v) { try { localStorage.setItem(KEY_FONT, v || 'system-ui, sans-serif'); } catch {} }
  function getColor() { return localStorage.getItem(KEY_COLOR) || '#1e293b'; }
  function setColor(v) { try { localStorage.setItem(KEY_COLOR, v || '#1e293b'); } catch {} }
  function loadHistory() {
    try { const raw = localStorage.getItem(KEY_HISTORY); const arr = JSON.parse(raw || '[]'); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }
  function saveHistory(arr) {
    try { localStorage.setItem(KEY_HISTORY, JSON.stringify(arr || [])); } catch {}
  }

  class UserInst {
    constructor() {
      this.history = loadHistory();
      this.fab = this.#createFab();
      this.panel = this.#createPanel();
      this.connPoints = Array.from(this.panel.querySelectorAll('.conn-point'));
  // For keeping the FAB centered under the panel when open
  this._fabAlignOnResize = null;
  // Track recent drag to avoid accidental click toggling
  this._recentDragTs = 0;
  // Track linked copilots and last sent index in our user history
  this._linked = new Set(); // copilot ids
  this._linkLines = new Map(); // copilotId -> Array<{ lineId, updateLine, from:'user'|number, to:'user'|number, startEl, endEl }>
  // Track section links (by key) for routing and unlink visuals
  this._linkedSections = new Set(); // Set<string>
  this._sectionLinkLines = new Map(); // key -> Array<{ lineId, updateLine, startEl, endEl }>
  this._lastSentIndex = -1; // index in this.history last sent to copilots
  // Round-robin index for exclusive dispatch across linked copilots
  this._rrIndex = 0;
  // Track where we've already seeded system messages to avoid duplicates
  this._seededConvs = new Set(); // convId set
  this._seededSingles = new Set(); // copilotId set
      this.#wireConn();
      this.#wireDrag();
      this.#wirePanelDrag();
      this.#wireResize();
      this.#initSettings();
  this.#wireContextMenu();
    }
    #positionFabUnderPanel() {
  // NO-OP: user requested panels should center over the FAB without moving the FAB.
  // Kept as a defined private method so other code can call it safely.
  return;
    }
    _linkFromCopilot(inst, startEl = null, endEl = null) {
      if (!inst || !inst.fab || typeof inst.id !== 'number') return;
      // Only draw a visual link for copilot→user; do NOT add to user's outbound links
      // Draw/update line between exact selected points when provided, else fall back to FAB centers
      const ss = (startEl && startEl.getAttribute && startEl.getAttribute('data-side')) || 'x';
      const es = (endEl && endEl.getAttribute && endEl.getAttribute('data-side')) || 'x';
      const lineId = `link_${inst.id}_${ss}_user_${es}`;
      // Deduplicate identical directional line
      const existingFor = this._linkLines.get(inst.id);
      if (existingFor) {
        const arr = Array.isArray(existingFor) ? existingFor : [existingFor];
        if (arr.some(r => r && r.lineId === lineId)) {
          try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
          return;
        }
      }
  // Allow this line to be drawn (guarded by ConnectionLayer)
  try { ConnectionLayer.allow(lineId); } catch {}
      const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
      // Freeze anchor elements at creation to prevent snapping to other points later
      const anchorStart = (startEl && startEl.getBoundingClientRect) ? startEl : inst.fab;
      const anchorEnd = (endEl && endEl.getBoundingClientRect) ? endEl : this.fab;
      // Ensure the user's end point is marked as Input for consistent UI semantics
      try { if (anchorEnd && anchorEnd.classList) { anchorEnd.classList.remove('io-out'); anchorEnd.classList.add('io-in'); anchorEnd.setAttribute('data-io','in'); anchorEnd.setAttribute('title','Input'); anchorEnd.setAttribute('aria-label','Input'); } } catch {}
      const updateLine = () => {
        ConnectionLayer.draw(lineId, getCenter(anchorStart), getCenter(anchorEnd));
      };
      window.addEventListener('resize', updateLine);
      window.addEventListener('scroll', updateLine, { passive:true });
      window.addEventListener('examai:fab:moved', updateLine);
      setTimeout(updateLine, 0);
  const rec = { lineId, updateLine, from: inst.id, to: 'user', startEl: anchorStart, endEl: anchorEnd };
      const existing = this._linkLines.get(inst.id);
      if (existing) {
        if (Array.isArray(existing)) existing.push(rec); else this._linkLines.set(inst.id, [existing, rec]);
      } else {
        this._linkLines.set(inst.id, [rec]);
      }
  try { GraphPersistence.addLink({ fromType:'copilot', fromId:inst.id, fromSide:ss, toType:'user', toId:0, toSide:es }); } catch {}
  toast('Kopplad: copilot → användare. Skriv något i användarpanelen för att dela historik.');
    }
    _unlinkCopilot(copilotId) {
      // Remove visual line and listeners; clear references on both sides
      const links = this._linkLines.get(copilotId);
      if (links) {
        const arr = Array.isArray(links) ? links : [links];
        arr.forEach(({ lineId, updateLine }) => {
          try { ConnectionLayer.remove(lineId); } catch {}
          try { window.removeEventListener('resize', updateLine); } catch {}
          try { window.removeEventListener('scroll', updateLine); } catch {}
          try { window.removeEventListener('examai:fab:moved', updateLine); } catch {}
        });
        this._linkLines.delete(copilotId);
      }
  this._linked.delete(copilotId);
  try { GraphPersistence.removeWhere(l => (l.fromType==='user'&&l.toType==='copilot'&&l.toId===copilotId) || (l.fromType==='copilot'&&l.fromId===copilotId&&l.toType==='user')); } catch {}
      // Remove inbound neighbor flag from target copilot for 'user'
      const inst = CopilotManager.instances.get(copilotId);
      if (inst && inst.inNeighbors) {
        try { inst.inNeighbors.delete('user'); } catch {}
        if (inst.flowInId === 'user') inst.flowInId = null;
      }
    }
    #unlinkAll() {
      // Unlink all user-side connections to copilots
      try {
        Array.from(this._linkLines.keys()).forEach(id => this._unlinkCopilot(id));
      } catch {}
      // Also remove any user→section links
      try {
        if (this._sectionLinkLines) {
          for (const [key, links] of this._sectionLinkLines.entries()) {
            const arr = Array.isArray(links) ? links : [links];
            arr.forEach(({ lineId, updateLine }) => {
              try { ConnectionLayer.remove(lineId); } catch {}
              try { window.removeEventListener('resize', updateLine); } catch {}
              try { window.removeEventListener('scroll', updateLine); } catch {}
              try { window.removeEventListener('examai:fab:moved', updateLine); } catch {}
            });
          }
          this._sectionLinkLines.clear();
        }
        if (this._linkedSections) this._linkedSections.clear();
        try { GraphPersistence.removeWhere(l => (l.fromType==='user' && l.toType==='section')); } catch {}
      } catch {}
    }
    #wireContextMenu() {
      const fab = this.fab;
      if (!fab) return;
      let longPressTimer = null;
      const clearLong = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
      const removeExisting = () => { const ex = document.querySelector('.fab-menu.user'); if (ex) ex.remove(); };
      const showMenuAt = (x, y) => {
        removeExisting();
        const menu = document.createElement('div');
        menu.className = 'fab-menu user';
        menu.innerHTML = `
          <div class="fab-menu-row">
            <button data-action="unlink-all">Unlink alla</button>
          </div>`;
        document.body.appendChild(menu);
        const pad = 8, mw = 160;
        const left = Math.min(Math.max(pad, x), window.innerWidth - mw - pad);
        const top = Math.min(Math.max(pad, y), window.innerHeight - 40 - pad);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.classList.add('show');
        const onDocClick = (ev) => { if (!menu.contains(ev.target)) { menu.classList.remove('show'); setTimeout(()=>menu.remove(),120); document.removeEventListener('mousedown', onDocClick); document.removeEventListener('touchstart', onDocClick); } };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('touchstart', onDocClick);
        const btn = menu.querySelector('[data-action="unlink-all"]');
        btn.onclick = (ev) => { ev.stopPropagation(); removeExisting(); this.#unlinkAll(); toast('Alla användarlänkar borttagna.'); };
      };
      fab.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenuAt(e.clientX, e.clientY); });
      fab.addEventListener('touchstart', (e) => { clearLong(); const p = e.touches ? e.touches[0] : e; longPressTimer = setTimeout(()=> showMenuAt(p.clientX, p.clientY), 600); }, { passive: true });
      fab.addEventListener('touchend', clearLong);
      fab.addEventListener('touchmove', clearLong);
      fab.addEventListener('touchcancel', clearLong);
    }
    #createFab() {
      const b = document.createElement('button');
      b.className = 'fab user-node';
  b.title = getName();
      b.innerHTML = '<div class="user-avatar">👤</div>';
  // Align with copilot: fixed positioning
  b.style.position = 'fixed';
      // default position (bottom-left offset from Internet)
      const saved = localStorage.getItem('examai.user.fab.pos');
      if (saved) {
        try { const { x, y } = JSON.parse(saved); b.style.left = x + 'px'; b.style.top = y + 'px'; } catch {}
      } else {
        b.style.left = '90px'; b.style.top = (Math.max(240, window.innerHeight || 240) - 110) + 'px';
      }
      // Add connection points on FAB
  ;['t','b','l','r'].forEach(side => { const p = document.createElement('div'); p.className = 'conn-point'; p.setAttribute('data-side', side); b.appendChild(p); });
  // Add a floating label above the FAB showing the user name (same style as copilot)
  const lbl = document.createElement('div');
  lbl.className = 'fab-label';
  lbl.textContent = getName();
  b.appendChild(lbl);
      document.body.appendChild(b);
      // toggle panel (ignore clicks immediately after a drag)
      b.addEventListener('click', () => {
        const now = Date.now();
        if (now - (this._recentDragTs || 0) < 300) return;
        if (this.panel.classList.contains('hidden')) this.show(); else this.hide();
      });
      return b;
    }
    #createPanel() {
      const sec = document.createElement('section');
      sec.className = 'panel-flyout user-node-panel hidden';
      sec.setAttribute('aria-hidden', 'true');
      sec.innerHTML = `
        <header class="drawer-head" data-role="dragHandle">
          <div class="user-avatar small">👤</div>
          <div class="meta"><div class="name">${escapeHtml(getName())}</div></div>
          <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
          <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
          <button class="icon-btn" data-action="close">✕</button>
        </header>
        <div class="settings collapsed" data-role="settings">
          <label>Namn
            <input type="text" data-role="name" placeholder="Ditt namn" />
          </label>
          <label>Teckensnitt (CSS family)
            <input type="text" data-role="font" placeholder="system-ui, sans-serif" />
          </label>
          <label>Bubbelfärg
            <input type="color" data-role="color" />
          </label>
          <div style="margin-top:10px;display:flex;justify-content:flex-end">
            <button type="button" class="btn danger" data-action="resetAll" title="Rensa alla inställningar och chattar">Nollställ allt</button>
          </div>
        </div>
  <div class="messages user" data-role="messages"></div>
  <div class="attachments hidden" data-role="attachments" aria-label="Bilagor (dra & släpp hit)"></div>
        <form class="composer" data-role="composer">
          <textarea placeholder="Skriv som människa…" rows="2" data-role="input"></textarea>
          <button class="send-btn" title="Lägg till">➤</button>
        </form>
        <div class="flyout-resize br" data-resize="br" title="Ändra storlek"></div>
        <div class="flyout-resize t" data-resize="t" title="Dra för höjd"></div>
        <div class="flyout-resize b" data-resize="b" title="Dra för höjd"></div>
        <div class="flyout-resize l" data-resize="l" title="Dra för bredd"></div>
        <div class="flyout-resize r" data-resize="r" title="Dra för bredd"></div>`;
  // (No connection points on the user panel; use only the user FAB for linking)
      document.body.appendChild(sec);
      sec.querySelector('[data-action="close"]').addEventListener('click', () => this.hide());
      // Clear chat like copilot panels
      const clearBtn = sec.querySelector('[data-action="clear"]');
      clearBtn?.addEventListener('click', () => {
        const box = sec.querySelector('[data-role="messages"]');
        if (box) box.innerHTML = '';
        this.history = [];
        this._lastSentIndex = -1;
        try { saveHistory(this.history); } catch {}
        toast('Användarchatten rensad.');
      });
      // Toggle settings like copilot panels
      const settingsEl = sec.querySelector('[data-role="settings"]');
      const settingsBtn = sec.querySelector('[data-action="settings"]');
      settingsBtn?.addEventListener('click', () => settingsEl?.classList.toggle('collapsed'));
      // input submit -> record-only message
  const form = sec.querySelector('[data-role="composer"]');
  const input = sec.querySelector('[data-role="input"]');
  const attachBar = sec.querySelector('[data-role="attachments"]');
  this._staged = [];
      // Auto-resize like other panels
      const INPUT_MIN_H = 40;
      const INPUT_MAX_H = 300;
      const autoResize = () => {
        input.style.height = 'auto';
        const next = Math.max(INPUT_MIN_H, Math.min(INPUT_MAX_H, input.scrollHeight));
        input.style.height = next + 'px';
      };
      input.addEventListener('input', autoResize);
      // Initialize height
      autoResize();
      // Enter to send, Shift+Enter for newline (same as copilots)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Submit the form programmatically
          if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = (input.value || '').trim();
        if (!msg) return;
        this.addUserLocal(msg);
        input.value = '';
        input.style.height = INPUT_MIN_H + 'px';
        // If linked later, this history will seed the conversation
  // If we are already linked to one or more copilots, dispatch unsent user messages now
  try { await this.#dispatchUnsentToLinked(); } catch {}
      });
      // Drag & drop on user panel to stage files, preview them by extracting via /upload immediately
      const targets = [sec, input];
      const highlight = (on) => targets.forEach(t => t.classList.toggle?.('drag', !!on));
      const renderAttach = () => {
        if (!attachBar) return;
        if (!this._staged.length) { attachBar.classList.add('hidden'); attachBar.innerHTML = ''; return; }
        attachBar.classList.remove('hidden'); attachBar.innerHTML = '';
        this._staged.forEach((it, idx) => {
          const chip = document.createElement('div'); chip.className = 'attachment-chip';
          const name = document.createElement('span'); name.className = 'name'; name.textContent = `${it.name}`;
          const rm = document.createElement('button'); rm.className = 'rm'; rm.type = 'button'; rm.title = 'Ta bort'; rm.textContent = '\u00D7';
          rm.addEventListener('click', () => { this._staged.splice(idx, 1); renderAttach(); });
          chip.appendChild(name); chip.appendChild(rm); attachBar.appendChild(chip);
        });
      };
      const onDrop = async (e) => {
        e.preventDefault(); highlight(false);
        const files = Array.from(e.dataTransfer?.files || []);
        if (!files.length) return;
        // Upload now to preview extracted text
        const formU = new FormData();
        files.forEach(f => formU.append('files', f, f.name));
        formU.append('maxChars', '40000');
        try {
          const resU = await fetch('/upload', { method: 'POST', body: formU });
          const dataU = await resU.json();
          if (!resU.ok) { toast(dataU.error || 'Kunde inte l\u00e4sa bilagor', 'error'); return; }
          const items = Array.isArray(dataU.items) ? dataU.items : [];
          for (const it of items) {
            // Display a preview bubble in the user panel so the human can see the extracted text before involving copilots
            const previewTitle = `Förhandsvisning: ${it.name}${it.truncated ? ' (trunkerad)' : ''}`;
            const snippet = (it.text || '').slice(0, 2000);
            const box = this.panel.querySelector('[data-role="messages"]');
            const div = document.createElement('div');
            div.className = 'assistant';
            div.innerHTML = `<div class="msg-author">${previewTitle}</div><div class="msg-text"></div>`;
            div.querySelector('.msg-text').textContent = snippet;
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            // Keep the full text in our local history as a system message, so later dispatch includes it
            this.history.push({ role: 'system', content: `${previewTitle}:\n\n${it.text || ''}` });
          }
          saveHistory(this.history);
          // Keep staged list by file name for visual reference
          files.forEach(f => { if (!this._staged.find(x => x.name === f.name && x.size === f.size)) this._staged.push({ name: f.name, size: f.size }); });
          renderAttach();
          toast(`Läste ${items.length} bilaga(or).`);
        } catch (err) {
          console.error(err);
          toast('Nätverksfel vid bilagor', 'error');
        }
      };
      targets.forEach(t => {
        t.addEventListener('dragover', (e) => { e.preventDefault(); highlight(true); });
        t.addEventListener('dragleave', () => highlight(false));
        t.addEventListener('drop', onDrop);
      });
      // Render any previously saved history into the panel now
      try { this.#renderHistoryInto(sec); } catch {}
      return sec;
    }
    #renderHistoryInto(panelEl) {
      if (!Array.isArray(this.history) || !panelEl) return;
      const box = panelEl.querySelector('[data-role="messages"]');
      if (!box) return;
      box.innerHTML = '';
      for (const m of this.history) {
        if (!m || !m.role) continue;
        if (m.role === 'user') {
          const div = document.createElement('div');
          div.className = 'bubble user user-bubble';
          div.style.setProperty('--user-font', getFont());
          div.style.setProperty('--user-bubble-bg', getColor());
          div.innerHTML = `<div class="msg-author">${escapeHtml(getName())}</div><div class="msg-text"></div>`;
          div.querySelector('.msg-text').textContent = m.content || '';
          box.appendChild(div);
        } else {
          const div = document.createElement('div');
          div.className = 'assistant';
          const who = (m.role === 'system') ? 'System' : 'Copilot';
          div.innerHTML = `<div class="msg-author">${who}</div><div class="msg-text"></div>`;
          const msgEl = div.querySelector('.msg-text');
          if ((localStorage.getItem('examai.render_mode') || 'raw') === 'md' && window.markdownit) {
            const mdloc = window.markdownit({ html:false, linkify:true, breaks:true });
            msgEl.innerHTML = mdloc.render(m.content || '');
          } else {
            msgEl.textContent = m.content || '';
          }
          box.appendChild(div);
        }
      }
      box.scrollTop = box.scrollHeight;
    }
    addUserLocal(text) {
      const box = this.panel.querySelector('[data-role="messages"]');
      const div = document.createElement('div');
      div.className = 'bubble user user-bubble';
  div.style.setProperty('--user-font', getFont());
  div.style.setProperty('--user-bubble-bg', getColor());
      div.innerHTML = `<div class="msg-author">${escapeHtml(getName())}</div><div class="msg-text"></div>`;
      div.querySelector('.msg-text').textContent = text;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      // persist
      this.history.push({ role: 'user', content: text });
      saveHistory(this.history);
    }
    addAssistantLocal(text, authorName) {
      const box = this.panel.querySelector('[data-role="messages"]');
      const div = document.createElement('div');
      div.className = 'assistant';
      const who = (authorName && authorName.trim()) ? authorName : 'Copilot';
      div.innerHTML = `<div class="msg-author">${escapeHtml(who)}</div><div class="msg-text"></div>`;
      const msgEl = div.querySelector('.msg-text');
      if ((localStorage.getItem('examai.render_mode') || 'raw') === 'md' && window.markdownit) {
        const mdloc = window.markdownit({ html:false, linkify:true, breaks:true });
        msgEl.innerHTML = mdloc.render(text || '');
      } else {
        msgEl.textContent = text || '';
      }
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
      this.history.push({ role: 'assistant', content: text || '' });
      saveHistory(this.history);
    }
    #unsentUserMessages() {
      // Return unsent user-role messages from our history since _lastSentIndex
      const start = Math.max(0, this._lastSentIndex + 1);
      const slice = this.history.slice(start);
      return slice.filter(m => m && m.role === 'user');
    }
    #allSystemMessages() {
      try { return this.history.filter(m => m && m.role === 'system'); } catch { return []; }
    }
    async #dispatchUnsentToLinked() {
      if ((!this._linked || this._linked.size === 0) && (!this._linkedSections || this._linkedSections.size === 0)) return;
      const msgs = this.#unsentUserMessages();
    if (!msgs.length) return; 
      const sysMsgs = this.#allSystemMessages();
      const ids = Array.from(this._linked).filter(id => {
        const inst = CopilotManager.instances.get(id);
        return !!(inst && inst.inNeighbors && inst.inNeighbors.has('user'));
      });
    if (!ids.length && !this._linkedSections.size) return;
      for (const m of msgs) {
        // Broadcast to all linked copilots (fan-out)
        for (const destId of ids) {
          const inst = CopilotManager.instances.get(destId);
          if (!inst) continue;
          try {
            const arr = this._linkLines.get(destId);
            const rec = Array.isArray(arr) ? (arr.find(r => r.from === 'user') || arr[0]) : arr;
            const lid = rec?.lineId;
            if (lid) ConnectionLayer.pulse(lid, { duration: 1200 });
          } catch {}
          try { await inst.receiveFromUser(m.content || '', this, { seed: sysMsgs }); } catch {}
        }
        // Also append to linked sections
        if (this._linkedSections && this._linkedSections.size) {
          for (const key of this._linkedSections) {
            try {
              const lines = this._sectionLinkLines?.get(key);
              const rec = Array.isArray(lines) ? lines[0] : lines;
              const lid = rec?.lineId; if (lid) ConnectionLayer.pulse(lid, { duration: 1200 });
            } catch {}
            try { BoardSections.append?.(key, m.content || '', { author: getName(), renderMode: localStorage.getItem('examai.render_mode') || 'raw' }); } catch {}
          }
        }
      }
      this._lastSentIndex = this.history.length - 1;
    }
    seedInto(convId) {
      // push existing history into the shared conversation if empty
      try {
        const hist = this.history.slice();
        const convHist = ConversationManager.getHistory(convId);
        if (Array.isArray(convHist) && Array.isArray(hist) && convHist.length === 0 && hist.length) {
          hist.forEach(m => convHist.push(m));
        }
      } catch {}
    }
    #wireConn() {
      const points = Array.from(this.fab.querySelectorAll('.conn-point'));
      let dragging = false, start = null, ghostId = null, overPoint = null, startPointEl = null;
      // IO roles for user points with persistence and toggle
      const where = 'fab';
      const roleKey = (pt) => `io:user:${where}:${pt.getAttribute('data-side') || 'x'}`;
      const setPointRole = (el, role, persist = false) => {
        el.classList.remove('io-in', 'io-out');
        if (role === 'in') el.classList.add('io-in');
        if (role === 'out') el.classList.add('io-out');
        el.setAttribute('data-io', role || '');
        const label = role === 'in' ? 'Input' : role === 'out' ? 'Output' : '';
        if (label) { el.setAttribute('title', label); el.setAttribute('aria-label', label); }
        if (persist) { try { localStorage.setItem(roleKey(el), role || ''); } catch {}
        }
      };
      // restore saved roles (default to 'out')
      points.forEach(pt => {
        try { const r = localStorage.getItem(roleKey(pt)); setPointRole(pt, (r === 'in' || r === 'out') ? r : 'out', false); }
        catch { setPointRole(pt, 'out', false); }
      });
      const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const pickPointAt = (x, y) => {
        // Allow user to link to copilot FAB points and section IOs
        const all = document.querySelectorAll('.fab .conn-point, .panel .head .section-io');
        for (const p of all) {
          const r = p.getBoundingClientRect();
          if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return p;
        }
        return null;
      };
      const onMove = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e; const b = { x: p.clientX, y: p.clientY };
        ConnectionLayer.draw(ghostId, start, b);
        const hit = pickPointAt(b.x, b.y);
        if (overPoint && overPoint !== hit) overPoint.classList.remove('hover');
        overPoint = hit; if (overPoint) overPoint.classList.add('hover');
        e.preventDefault();
      };
      const finish = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', finish);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', finish);
      };
      const onUp = () => {
        if (!dragging) return; finish(); if (overPoint) overPoint.classList.remove('hover');
  const endPt = overPoint; if (ghostId) { try { ConnectionLayer.remove(ghostId); } catch {} ghostId = null; } if (!endPt) return;
        const otherPanel = endPt.closest('.panel-flyout'); const otherFab = endPt.closest('.fab');
        let targetInst = null;
        if (otherPanel && !otherPanel.classList.contains('user-node-panel')) {
          const id = parseInt(otherPanel.getAttribute('data-copilot-id'), 10);
          targetInst = CopilotManager.instances.get(id);
        } else if (otherFab && !otherFab.classList.contains('user-node')) {
          const id = parseInt(otherFab.getAttribute('data-copilot-id'), 10);
          targetInst = CopilotManager.instances.get(id);
        }
        // User -> Section link (no behavior yet other than visual)
    if (!targetInst && endPt.classList.contains('section-io')) {
          const head = endPt.closest('.head');
          const secEl = head && head.closest('.board-section');
          const secKey = secEl && (secEl.getAttribute('data-section-key') || secEl.id);
          if (secKey) {
      // Enforce Output (user) -> Input (section IO)
      let startRole = startPointEl?.getAttribute('data-io');
      if (startRole !== 'out') { setPointRole(startPointEl, 'out', true); }
      try { endPt.classList.remove('io-out'); endPt.classList.add('io-in'); endPt.setAttribute('data-io','in'); endPt.setAttribute('title','Input'); } catch {}
            const ss = (startPointEl.getAttribute && startPointEl.getAttribute('data-side')) || 'x';
            const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
            const lineId = `link_user_${ss}_section_${secKey}`;
            ConnectionLayer.allow(lineId);
            const updateLine = () => ConnectionLayer.draw(lineId, getCenter(startPointEl), getCenter(endPt));
            window.addEventListener('resize', updateLine);
            window.addEventListener('scroll', updateLine, { passive: true });
            window.addEventListener('examai:fab:moved', updateLine);
            setTimeout(updateLine, 0);
      // Track visuals and routing
      const rec = { lineId, updateLine, startEl: startPointEl, endEl: endPt };
      const existing = this._sectionLinkLines.get(secKey);
      if (existing) { if (Array.isArray(existing)) existing.push(rec); else this._sectionLinkLines.set(secKey, [existing, rec]); }
      else { this._sectionLinkLines.set(secKey, [rec]); }
      this._linkedSections.add(secKey);
      try { GraphPersistence.addLink({ fromType:'user', fromId:0, fromSide:ss, toType:'section', toId:secKey, toSide:'r' }); } catch {}
      toast(`Kopplad: användare → sektion (${secKey}).`);
          }
          return;
        }
        if (targetInst) {
          // Robustly enforce Output (user) -> Input (copilot); auto-adjust IO roles when needed
          let startRole = startPointEl?.getAttribute('data-io');
          let endRole = endPt.getAttribute('data-io');
          let adjusted = false;
          if (startRole !== 'out') { setPointRole(startPointEl, 'out', true); startRole = 'out'; adjusted = true; }
          if (endRole !== 'in') { endPt.classList.remove('io-out'); endPt.classList.add('io-in'); endPt.setAttribute('data-io','in'); endRole = 'in'; adjusted = true; }
          if (adjusted) toast('IO-roller justerades för att koppla Output → Input.', 'info');
          // Track link (do not send history now; will dispatch on next user message)
          this._linked.add(targetInst.id);
          // Directional: user -> copilot
          try { targetInst.inNeighbors?.add('user'); } catch {}
          // Draw a connection line from user FAB to copilot FAB and keep it updated, anchored to selected points (frozen)
          const ss = (startPointEl.getAttribute && startPointEl.getAttribute('data-side')) || 'x';
          const es = (endPt.getAttribute && endPt.getAttribute('data-side')) || 'x';
          const lineId = `link_user_${ss}_${targetInst.id}_${es}`;
          // If identical line already exists, just pulse it and inform
          {
            const maybe = this._linkLines.get(targetInst.id);
            const arr = Array.isArray(maybe) ? maybe : (maybe ? [maybe] : []);
            if (arr.some(r => r && r.lineId === lineId)) {
              try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
              try { toast('Den kopplingen finns redan.', 'info'); } catch {}
              return;
            }
          }
          ConnectionLayer.allow(lineId);
          const anchorStart = startPointEl;
          const anchorEnd = endPt;
          // Ensure UI labels match roles
          try { endPt.setAttribute('title','Input'); endPt.setAttribute('aria-label','Input'); } catch {}
          const updateLine = () => ConnectionLayer.draw(lineId, getCenter(anchorStart), getCenter(anchorEnd));
          window.addEventListener('resize', updateLine);
          window.addEventListener('scroll', updateLine, { passive: true });
          window.addEventListener('examai:fab:moved', updateLine);
          setTimeout(updateLine, 0);
          const rec = { lineId, updateLine, from: 'user', to: targetInst.id, startEl: anchorStart, endEl: anchorEnd };
          const existing = this._linkLines.get(targetInst.id);
          if (existing) {
            if (Array.isArray(existing)) existing.push(rec); else this._linkLines.set(targetInst.id, [existing, rec]);
          } else {
            this._linkLines.set(targetInst.id, [rec]);
          }
          try { GraphPersistence.addLink({ fromType:'user', fromId:0, fromSide:ss, toType:'copilot', toId:targetInst.id, toSide:es }); } catch {}
          toast('Kopplad: användare → copilot. Skriv något så skickas din historik.');
        }
      };
      const startDrag = (pt) => (e) => {
        if (e.altKey) { e.preventDefault(); e.stopPropagation(); return; }
        dragging = true; const p = e.touches ? e.touches[0] : e; const c = getCenter(pt); start = c; startPointEl = pt; ghostId = `ghost_user_${Date.now()}`;
        try { ConnectionLayer.allow(ghostId); } catch {}
        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp, { passive: false });
        e.preventDefault(); e.stopPropagation();
      };
      points.forEach(pt => {
        // Alt-click toggles IO role
        pt.addEventListener('click', (e) => {
          if (!e.altKey) return; e.preventDefault(); e.stopPropagation();
          const cur = pt.getAttribute('data-io') || 'out';
          const next = (cur === 'out') ? 'in' : 'out';
          setPointRole(pt, next, true);
        });
        pt.addEventListener('mousedown', startDrag(pt), { passive: false });
        pt.addEventListener('touchstart', startDrag(pt), { passive: false });
      });
    }
    #wireDrag() {
      const fab = this.fab; let dragging=false, moved=false, sx=0, sy=0, ox=0, oy=0;
      const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
      const onDown = (e) => {
          // If panel is open, FAB follows panel and shouldn't be dragged directly
          if (!this.panel.classList.contains('hidden')) return;
          const p = e.touches ? e.touches[0] : e;
          // Only start dragging if the press is within the FAB's own rect
          const hit = fab.getBoundingClientRect();
          if (!(p.clientX >= hit.left && p.clientX <= hit.right && p.clientY >= hit.top && p.clientY <= hit.bottom)) {
            return;
          }
          dragging = true; moved = false;
        sx = p.clientX; sy = p.clientY;
        const r = fab.getBoundingClientRect(); ox = r.left; oy = r.top;
        document.addEventListener('mousemove', onMove, { passive:false });
        document.addEventListener('mouseup', onUp, { passive:false });
        document.addEventListener('touchmove', onMove, { passive:false });
        document.addEventListener('touchend', onUp, { passive:false });
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - sx; const dy = p.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        const fr = fab.getBoundingClientRect();
        const nx = clamp(ox + dx, 4, window.innerWidth - fr.width - 4);
        const ny = clamp(oy + dy, 4, window.innerHeight - fr.height - 4);
        fab.style.left = nx + 'px';
        fab.style.top = ny + 'px';
        window.dispatchEvent(new CustomEvent('examai:fab:moved'));
        e.preventDefault();
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        if (moved) {
          this._recentDragTs = Date.now();
        }
        const r = fab.getBoundingClientRect();
        localStorage.setItem('examai.user.fab.pos', JSON.stringify({ x: r.left, y: r.top }));
      };
      const dragStartIfSelf = (handler) => (ev) => {
        const target = ev.target;
        if (target && target.closest('.conn-point')) return;
        handler(ev);
      };
      fab.addEventListener('mousedown', dragStartIfSelf(onDown), { passive:false });
      fab.addEventListener('touchstart', dragStartIfSelf(onDown), { passive:false });
    }
    #wirePanelDrag() {
      const handle = this.panel.querySelector('[data-role="dragHandle"]');
      if (!handle) return;
      let dragging=false, moved=false, sx=0, sy=0, sl=0, st=0;
      const clamp = (val,min,max) => Math.max(min, Math.min(max, val));
      const onDown = (e) => {
        // ignore drag start on controls
        const target = e.target;
        if (target.closest('button,select,input,textarea')) return;
        dragging = true; moved = false;
        const p = e.touches ? e.touches[0] : e;
        sx = p.clientX; sy = p.clientY;
        const r = this.panel.getBoundingClientRect();
        sl = r.left; st = r.top;
        document.addEventListener('mousemove', onMove, { passive:false });
        document.addEventListener('mouseup', onUp, { passive:false });
        document.addEventListener('touchmove', onMove, { passive:false });
        document.addEventListener('touchend', onUp, { passive:false });
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - sx;
        const dy = p.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
  const w = this.panel.offsetWidth; const h = this.panel.offsetHeight;
  const topMin = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
  let nl = clamp(sl + dx, 4, window.innerWidth - w - 4);
  let nt = clamp(st + dy, topMin, window.innerHeight - h - 4);
        // Collision stop + edge snap against other floating panels
        try {
          const pads = 6; const snap = 10;
          const myRect = { left: nl, top: nt, right: nl + w, bottom: nt + h };
          const panels = Array.from(document.querySelectorAll('.panel-flyout.show')).filter(el => el !== this.panel);
          for (const el of panels) {
            const r = el.getBoundingClientRect();
            const other = { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height };
            const inter = !(myRect.right < other.left + pads || myRect.left > other.right - pads || myRect.bottom < other.top + pads || myRect.top > other.bottom - pads);
            if (inter) {
              const dxL = Math.abs(myRect.right - other.left);
              const dxR = Math.abs(other.right - myRect.left);
              const dyT = Math.abs(myRect.bottom - other.top);
              const dyB = Math.abs(other.bottom - myRect.top);
              const min = Math.min(dxL, dxR, dyT, dyB);
              if (min === dxL) nl = other.left - w - pads;
              else if (min === dxR) nl = other.right + pads;
              else if (min === dyT) nt = other.top - h - pads;
              else nt = other.bottom + pads;
              myRect.left = nl; myRect.top = nt; myRect.right = nl + w; myRect.bottom = nt + h;
            } else {
              if (Math.abs(myRect.left - other.right) <= snap) nl = other.right;
              if (Math.abs(myRect.right - other.left) <= snap) nl = other.left - w;
              if (Math.abs(myRect.top - other.bottom) <= snap) nt = other.bottom;
              if (Math.abs(myRect.bottom - other.top) <= snap) nt = other.top - h;
            }
          }
        } catch {}
  // Final clamp to viewport and top app bar boundary
  nl = clamp(nl, 4, window.innerWidth - w - 4);
  nt = clamp(nt, topMin, window.innerHeight - h - 4);
  this.panel.style.left = Math.round(nl) + 'px';
  this.panel.style.top = Math.round(nt) + 'px';
        // keep FAB centered below the panel while dragging
        this.#positionFabUnderPanel();
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        // persist position
        const l = parseInt((this.panel.style.left || '0').replace('px',''), 10) || 0;
        const t = parseInt((this.panel.style.top || '0').replace('px',''), 10) || 0;
        try { localStorage.setItem('examai.user.panel.pos', JSON.stringify({ x:l, y:t })); } catch {}
        // also persist current FAB position like copilot drag does
        try {
          const r = this.fab.getBoundingClientRect();
          localStorage.setItem('examai.user.fab.pos', JSON.stringify({ x: r.left, y: r.top }));
        } catch {}
      };
      handle.addEventListener('mousedown', onDown, { passive:false });
      handle.addEventListener('touchstart', onDown, { passive:false });
    }
    #wireResize() {
      const handles = this.panel.querySelectorAll('[data-resize]');
      let dir=null,sx=0,sy=0,sw=0,sh=0,sl=0,st=0,resizing=false;
      const onDown=(e)=>{ const target=e.currentTarget; dir=target.getAttribute('data-resize'); const p=e.touches?e.touches[0]:e; const r=this.panel.getBoundingClientRect(); sx=p.clientX; sy=p.clientY; sw=r.width; sh=r.height; sl=r.left; st=r.top; resizing=true; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.addEventListener('touchmove', onMove, {passive:false}); document.addEventListener('touchend', onUp); };
  const onMove=(e)=>{ if(!resizing) return; const p=e.touches?e.touches[0]:e; const dx=p.clientX-sx; const dy=p.clientY-sy; let newW=sw,newH=sh,newL=sl,newT=st; if(dir==='br'||dir==='r'){ newW=Math.max(260, Math.min(900, sw+dx)); } if(dir==='br'||dir==='b'){ newH=Math.max(200, Math.min(800, sh+dy)); } if(dir==='l'){ newW=Math.max(260, Math.min(900, sw-dx)); newL=sl+dx; } if(dir==='t'){ newH=Math.max(200, Math.min(800, sh-dy)); newT=st+dy; const topMin=(document.querySelector('.appbar')?.getBoundingClientRect()?.bottom||0)+8; if(newT<topMin){ const bottom=st+sh; newT=topMin; newH=Math.max(200, Math.min(800, bottom-newT)); } } this.panel.style.width=newW+'px'; this.panel.style.height=newH+'px'; if(dir==='l'||dir==='t'){ this.panel.style.left=newL+'px'; this.panel.style.top=newT+'px'; } };
      const onUp=()=>{ if(!resizing) return; resizing=false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); const w=parseInt((this.panel.style.width||'0').replace('px',''),10)||0; const h=parseInt((this.panel.style.height||'0').replace('px',''),10)||0; localStorage.setItem('examai.user.panel.size', JSON.stringify({w,h})); };
      handles.forEach(h=>{ h.addEventListener('mousedown', onDown); h.addEventListener('touchstart', onDown, {passive:false}); });
      // While resizing, keep FAB centered under panel
      const boundResizeMove = (e) => { onMove(e); this.#positionFabUnderPanel(); };
      handles.forEach(h=>{
        h.removeEventListener?.('mousedown', onDown);
        const onDownResize = (e) => { const target=e.currentTarget; dir=target.getAttribute('data-resize'); const p=e.touches?e.touches[0]:e; const r=this.panel.getBoundingClientRect(); sx=p.clientX; sy=p.clientY; sw=r.width; sh=r.height; sl=r.left; st=r.top; resizing=true; document.addEventListener('mousemove', boundResizeMove); document.addEventListener('mouseup', onUp); document.addEventListener('touchmove', boundResizeMove, {passive:false}); document.addEventListener('touchend', onUp); };
        h.addEventListener('mousedown', onDownResize);
        h.addEventListener('touchstart', onDownResize, {passive:false});
      });
      // restore size/pos
      try { const s=localStorage.getItem('examai.user.panel.size'); if(s){ const {w,h}=JSON.parse(s); if(w) this.panel.style.width=w+'px'; if(h) this.panel.style.height=h+'px'; } const p=localStorage.getItem('examai.user.panel.pos'); if(p){ const {x,y}=JSON.parse(p); if(Number.isFinite(x)) this.panel.style.left=x+'px'; if(Number.isFinite(y)) this.panel.style.top=y+'px'; } } catch {}
    }
    #initSettings() {
      const nameEl = this.panel.querySelector('[data-role="name"]');
      const fontEl = this.panel.querySelector('[data-role="font"]');
      const colorEl = this.panel.querySelector('[data-role="color"]');
  const resetBtn = this.panel.querySelector('[data-action="resetAll"]');
      const nm = getName();
      nameEl.value = nm;
      fontEl.value = getFont();
      colorEl.value = getColor();
      const metaName = this.panel.querySelector('.meta .name');
      const applyPreview = () => {
        document.documentElement.style.setProperty('--user-font', getFont());
        document.documentElement.style.setProperty('--user-bubble-bg', getColor());
      };
      applyPreview();
  let t=null; const saveName=()=>{ setName(nameEl.value||''); if(metaName) metaName.textContent = escapeHtml(getName()); try { const lbl=this.fab.querySelector('.fab-label'); if (lbl) lbl.textContent = getName(); this.fab.title = getName(); } catch {} toast('Namn sparat.'); };
      nameEl.addEventListener('input', ()=>{ if(t) clearTimeout(t); t=setTimeout(saveName, 350); });
      nameEl.addEventListener('blur', saveName);
      fontEl.addEventListener('input', ()=>{ setFont(fontEl.value||''); applyPreview(); });
      colorEl.addEventListener('input', ()=>{ setColor(colorEl.value||''); applyPreview(); });
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const ok = confirm('Detta rensar alla ExamAI-inställningar, chattar och sparade positioner. Fortsätt?');
          if (!ok) return;
          try {
            // Remove all localStorage keys that belong to this app
            const toDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!k) continue;
              if (k.startsWith('examai.')) toDelete.push(k);
            }
            toDelete.forEach(k => localStorage.removeItem(k));
          } catch {}
          // Reload to re-init defaults
          location.reload();
        });
      }
    }
    show() {
      const r = this.fab.getBoundingClientRect();
  const px = Math.min(window.innerWidth - 20, r.left);
  const minTop = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
  const py = Math.max(minTop, r.top - (this.panel.offsetHeight || 320) - 12);
      this.panel.style.left = px + 'px';
      this.panel.style.top = py + 'px';
      this.panel.classList.remove('hidden');
      requestAnimationFrame(()=> {
        this.panel.classList.add('show');
        // Once visible, snap FAB under the panel and keep aligned on window resizes
        this.#positionFabUnderPanel();
        if (!this._fabAlignOnResize) {
          this._fabAlignOnResize = () => {
            if (!this.panel.classList.contains('hidden')) this.#positionFabUnderPanel();
          };
        }
        window.addEventListener('resize', this._fabAlignOnResize);
      });
    }
    hide() { this.panel.classList.remove('show'); setTimeout(()=> { this.panel.classList.add('hidden'); if (this._fabAlignOnResize) window.removeEventListener('resize', this._fabAlignOnResize); }, 180); }
  }

  function ensure() { if (instance) return instance; instance = new UserInst(); return instance; }
  function linkFromCopilot(inst, startEl, endEl) { ensure(); instance._linkFromCopilot(inst, startEl, endEl); }
  // Programmatic link helpers used by GraphPersistence
  function linkFromCopilotSides(inst, fromSide = 'x', toSide = 'x') {
    ensure();
    const start = (inst && inst.fab) ? inst.fab.querySelector(`.conn-point[data-side="${fromSide}"]`) : null;
    const end = instance.fab.querySelector(`.conn-point[data-side="${toSide}"]`);
    instance._linkFromCopilot(inst, start, end);
  }
  function linkToCopilotSides(inst, fromSide = 'x', toSide = 'x') {
    ensure();
    const start = instance.fab.querySelector(`.conn-point[data-side="${fromSide}"]`);
    const end = (inst && inst.fab) ? inst.fab.querySelector(`.conn-point[data-side="${toSide}"]`) : null;
    // emulate the minimal part of onUp path to draw and record link
    const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const ss = fromSide || 'x'; const es = toSide || 'x';
  const lineId = `link_user_${ss}_${inst.id}_${es}`;
  ConnectionLayer.allow(lineId);
    const anchorStart = start || instance.fab; const anchorEnd = end || inst.fab;
    const updateLine = () => ConnectionLayer.draw(lineId, getCenter(anchorStart), getCenter(anchorEnd));
    window.addEventListener('resize', updateLine);
    window.addEventListener('scroll', updateLine, { passive: true });
    window.addEventListener('examai:fab:moved', updateLine);
    setTimeout(updateLine, 0);
    const rec = { lineId, updateLine, from: 'user', to: inst.id, startEl: anchorStart, endEl: anchorEnd };
    const existing = instance._linkLines.get(inst.id);
    if (existing) { if (Array.isArray(existing)) existing.push(rec); else instance._linkLines.set(inst.id, [existing, rec]); }
    else { instance._linkLines.set(inst.id, [rec]); }
  // Also restore routing semantics
  try { instance._linked.add(inst.id); } catch {}
  try { inst.inNeighbors?.add('user'); } catch {}
  }
  // Allow user to link directly to a section input point (for future features like manual notes)
  function linkToSectionByKey(secKey, fromSide = 'x') {
    ensure();
    const start = instance.fab.querySelector(`.conn-point[data-side="${fromSide}"]`);
    const end = BoardSections.getIoFor?.(secKey);
    if (!end || !start) return;
    const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const ss = fromSide || 'x';
      const lineId = `link_user_${ss}_section_${secKey}`;
      // Prevent duplicate user→section identical edge
      {
        const arr = this._sectionLinkLines.get(secKey);
        const lines = Array.isArray(arr) ? arr : (arr ? [arr] : []);
        if (lines.some(r => r && r.lineId === lineId)) {
          try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
          try { toast('Den kopplingen finns redan.', 'info'); } catch {}
          return;
        }
      }
      ConnectionLayer.allow(lineId);
    const updateLine = () => ConnectionLayer.draw(lineId, getCenter(start), getCenter(end));
    window.addEventListener('resize', updateLine);
    window.addEventListener('scroll', updateLine, { passive: true });
    window.addEventListener('examai:fab:moved', updateLine);
    setTimeout(updateLine, 0);
  const rec = { lineId, updateLine, startEl: start, endEl: end };
  const existing = instance._sectionLinkLines.get(secKey);
  if (existing) { if (Array.isArray(existing)) existing.push(rec); else instance._sectionLinkLines.set(secKey, [existing, rec]); }
  else { instance._sectionLinkLines.set(secKey, [rec]); }
  instance._linkedSections.add(secKey);
  }
  function getLinkLineIdFor(copilotId, dir = 'out') {
    try {
      ensure();
      const arr = instance._linkLines.get(copilotId);
      const rec = Array.isArray(arr)
        ? (dir === 'out'
            ? (arr.find(r => r.from === 'user') || arr[0])
            : (arr.find(r => r.from === copilotId) || arr[0]))
        : arr;
      return rec?.lineId || null;
    } catch { return null; }
  }
  function unlinkFor(copilotId) { try { ensure(); instance._unlinkCopilot(copilotId); } catch {} }
  return { ensure, linkFromCopilot, getLinkLineIdFor, unlinkFor, linkFromCopilotSides, linkToCopilotSides, linkToSectionByKey };
})();

// Expose UserNode bridge for Copilot module
try { window.__ExamAI_UserNodeApi = UserNode; } catch {}

// Create the user node on load
try { UserNode.ensure(); } catch {}
// Restore saved graph (copilots + links)
try { GraphPersistence.restore({ InternetHub, UserNode, CopilotManager, BoardSections }); } catch {}

// --- Grid snap helper (shared) ---------------------------------
// Exposed as window.GridSnap for small UI helpers (show guides while dragging panels)
const GridSnap = (() => {
  const size = 24; // snap grid pixels
  let guideV = null, guideH = null;
  function ensureGuides() {
    if (guideV && guideH) return;
    guideV = document.createElement('div'); guideH = document.createElement('div');
    guideV.className = 'grid-guide v'; guideH.className = 'grid-guide h';
    document.body.appendChild(guideV); document.body.appendChild(guideH);
  }
  function showAt(x, y) {
    ensureGuides();
    guideV.style.display = 'block'; guideH.style.display = 'block';
    guideV.style.left = Math.round(x) + 'px'; guideH.style.top = Math.round(y) + 'px';
  }
  function hide() { if (guideV) guideV.style.display = 'none'; if (guideH) guideH.style.display = 'none'; }
  function snap(x, y) { return { x: Math.round(x / size) * size, y: Math.round(y / size) * size }; }
  return { showAt, hide, snap, gridSize: size };
})();
try { window.GridSnap = GridSnap; } catch {}
