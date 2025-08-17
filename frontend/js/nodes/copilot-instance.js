// Fully extracted CopilotInstance and CopilotManager
// Dependencies
import { toast, escapeHtml } from '../ui.js';
import { BaseNode } from '../core/base-node.js';
import { ConnectionLayer } from '../graph/connection-layer.js';
import { Link } from '../graph/link.js';
import { ConversationManager } from '../graph/conversation-manager.js';
import { IORegistry } from '../graph/io-registry.js';
import { InternetHub } from '../graph/internet-hub.js';
import { GraphPersistence } from '../graph/graph-persistence.js';
import { NodeBoard } from '../graph/node-board.js';
import { getConnectionManager } from '../core/connection-manager.js';

function getUserApi() {
  try { return window.__ExamAI_UserNodeApi || null; } catch { return null; }
}

export class CopilotInstance extends BaseNode {
  constructor(id, opts = {}) {
    super(id, 'copilot');
    
    this.name = opts.name || `CoWorker`;
    this.model = opts.model || (document.getElementById('modelSelect')?.value || 'gpt-5-mini');
    try {
      const storedName = localStorage.getItem(`examai.copilot.${id}.name`);
      if (storedName) this.name = storedName;
      const storedModel = localStorage.getItem(`examai.copilot.${id}.model`);
      if (storedModel) this.model = storedModel;
    } catch {}
    this.history = [];
    this.renderMode = (localStorage.getItem(`examai.copilot.${id}.render_mode`) || localStorage.getItem('examai.render_mode') || 'raw');
    this.maxTokens = parseInt(localStorage.getItem(`examai.copilot.${id}.max_tokens`) || localStorage.getItem('examai.max_tokens') || '3000', 10) || 3000;
    this.typingSpeed = parseInt(localStorage.getItem(`examai.copilot.${id}.typing_speed`) || localStorage.getItem('examai.typing_speed') || '10', 10) || 10;
    this.topic = localStorage.getItem(`examai.copilot.${id}.topic`) || '';
    this.role = localStorage.getItem(`examai.copilot.${id}.role`) || '';
    this.useRole = (localStorage.getItem(`examai.copilot.${id}.use_role`) ?? 'true') === 'true';
    this.flowInId = null;
    this.flowOutId = null;
    this.inNeighbors = new Set();
    this.outNeighbors = new Set();
    this._lastDragAt = 0;
    this.fab = this.#createFab();
    this.panel = this.#createFlyout();
    this.msgEl = this.panel.querySelector('[data-role="messages"]');
    this.formEl = this.panel.querySelector('[data-role="composer"]');
    this.inputEl = this.panel.querySelector('[data-role="input"]');
    this.settingsEl = this.panel.querySelector('[data-role="settings"]');
    this.modelEl = this.panel.querySelector('[data-role="model"]');
    this.nameEl = this.panel.querySelector('[data-role="name"]');
    this.tokensEl = this.panel.querySelector('[data-role="maxTokens"]');
    this.tokensLabelEl = this.panel.querySelector('[data-role="maxTokensValue"]');
    this.speedEl = this.panel.querySelector('[data-role="typingSpeed"]');
    this.speedLabelEl = this.panel.querySelector('[data-role="typingSpeedValue"]');
    this.renderModeEl = this.panel.querySelector('[data-role="renderMode"]');
    this.webEnableEl = this.panel.querySelector('[data-role="webEnable"]');
    this.webMaxResultsEl = this.panel.querySelector('[data-role="webMaxResults"]');
    this.apiKeyEl = this.panel.querySelector('[data-role="apiKey"]');
    this.webPerPageCharsEl = this.panel.querySelector('[data-role="webPerPageChars"]');
    this.webPerPageCharsValueEl = this.panel.querySelector('[data-role="webPerPageCharsValue"]');
    this.webTotalCharsEl = this.panel.querySelector('[data-role="webTotalChars"]');
    this.webTotalCharsValueEl = this.panel.querySelector('[data-role="webTotalCharsValue"]');
    this.keyBadgeEl = this.panel.querySelector('[data-role="keyStatus"]');
    this.topicEl = this.panel.querySelector('[data-role="topic"]');
    this.roleEl = this.panel.querySelector('[data-role="role"]');
    this.roleBadgeEl = this.panel.querySelector('[data-role="roleBadge"]');
    this.useRoleEl = this.panel.querySelector('[data-role="useRole"]');
    this.attachBarEl = this.panel.querySelector('[data-role="attachments"]');
    this._stagedFiles = [];
    this.connections = new Map();
    this.#wireDrag();
    this.#wireToggle();
    this.#wireSubmit();
    this.#wireSettings();
    this.#wireResize();
    this.#initInputAutoResize();
    this.#wirePanelDrag();
    this.#wireFabContextMenu?.();
    this.#wireFabConnections(); // Use original working method
    this.#wireDrops();
    this.#wireUnlinkEvents();
  // Load and render any persisted chat history for this copilot
  try { this.#loadAndRenderHistory(); } catch {}
  }

  #createFab() {
    const b = document.createElement('button');
    b.className = 'fab';
    b.setAttribute('data-copilot-id', String(this.id));
    b.title = this.name;
    b.innerHTML = `
      <div class="hex-avatar" title="${this.name}">
        <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
          <defs>
            <linearGradient id="hexGradFab${this.id}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
          </defs>
          <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#hexGradFab${this.id})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>`;
    const vw = Math.max(320, window.innerWidth || 320);
    const vh = Math.max(240, window.innerHeight || 240);
    const margin = 18;
    const fabSize = 56;
    // Static position within Node Board area instead of random
    const staticX = 140 + (this.id * 80); // Spread horizontally based on ID
    const staticY = 40 + ((this.id % 2) * 80); // Alternate between two rows
    b.style.left = staticX + 'px';
    b.style.top = staticY + 'px';
  b.style.right = 'auto';
  b.style.bottom = 'auto';
  b.style.position = 'absolute';
    ['t','b','l','r'].forEach(side => {
      const p = document.createElement('div');
      p.className = 'conn-point';
      p.setAttribute('data-side', side);
      b.appendChild(p);
    });
    const lbl = document.createElement('div');
    lbl.className = 'fab-label';
    lbl.textContent = this.name || '';
    b.appendChild(lbl);
    const nodeBoard = document.getElementById('nodeBoard');
    if (nodeBoard) {
      nodeBoard.appendChild(b);
    } else {
      document.body.appendChild(b);
    }
  try { NodeBoard.bind?.(b); } catch {}
    return b;
  }
  #createFlyout() {
    const sec = document.createElement('section');
    sec.className = 'panel-flyout hidden';
    sec.setAttribute('aria-hidden', 'true');
    sec.setAttribute('data-copilot-id', String(this.id));
    sec.innerHTML = `
      <header class="drawer-head" data-role="dragHandle">
        <div class="hex-avatar" title="${this.name}">
          <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
            <defs><linearGradient id="hexGradF${this.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs>
            <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#hexGradF${this.id})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        </div>
        <div class="meta"><div class="name">${this.name}</div></div>
        <span class="badge" data-role="roleBadge" title="Roll (klicka för att toggla)">Roll</span>
        <span class="badge badge-error" data-role="keyStatus">Ingen nyckel</span>
  <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
  <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
  <button class="icon-btn" data-action="delete" title="Radera">🗑</button>
        <button class="icon-btn" data-action="close">✕</button>
      </header>
      <div class="settings collapsed" data-role="settings">
        <label>Modell
          <select data-role="model">
            <option value="gpt-5">gpt-5</option>
            <option value="gpt-5-mini" selected>gpt-5-mini</option>
            <option value="gpt-5-nano">gpt-5-nano</option>
            <option value="3o">3o</option>
          </select>
        </label>
        <label>Copilot-namn
          <input type="text" placeholder="Namn" data-role="name" />
        </label>
        
        <label>Topic (fokus)
          <input type="text" placeholder="Ex: Frontend UX" data-role="topic" />
        </label>
        <label>Roll (instruktion)
          <input type="text" placeholder="T.ex. du är en pedagogisk lärare med erfarenhet inom programmering" data-role="role" />
        </label>
        <label>
          <input type="checkbox" data-role="useRole" /> Inkludera roll i prompt
        </label>
        <label>Max tokens
          <input type="range" min="1000" max="30000" step="64" value="1000" data-role="maxTokens" />
          <div class="subtle"><span data-role="maxTokensValue">1000</span></div>
        </label>
        <label>Skrivhastighet
          <input type="range" min="0" max="100" step="1" value="10" data-role="typingSpeed" />
          <div class="subtle">(<span data-role="typingSpeedValue">Snabb</span>)</div>
        </label>
        <label>Visningsläge
          <select data-role="renderMode">
            <option value="raw">Rå text</option>
            <option value="md">Snyggt (Markdown)</option>
          </select>
        </label>
        
        <fieldset class="subsec">
          <legend>Webbsökning</legend>
          <label>Max källor
            <input type="number" min="1" step="1" value="3" data-role="webMaxResults" />
          </label>
          <label>Max text per källa
            <input type="range" min="1000" max="12000" step="250" value="3000" data-role="webPerPageChars" />
            <div class="subtle"><span data-role="webPerPageCharsValue">3000</span> tecken</div>
          </label>
          <label>Total textbudget
            <input type="range" min="2000" max="24000" step="500" value="9000" data-role="webTotalChars" />
            <div class="subtle"><span data-role="webTotalCharsValue">9000</span> tecken</div>
          </label>
        </fieldset>
        <label>API-nyckel (denna copilot)
          <input type="password" placeholder="Valfri – annars används global" data-role="apiKey" />
        </label>
      </div>
      <div class="messages" data-role="messages"></div>
      <div class="attachments hidden" data-role="attachments" aria-label="Bilagor (dra & släpp hit)"></div>
      
      <form class="composer" data-role="composer">
        <textarea placeholder="Skriv här..." rows="2" data-role="input"></textarea>
        <button class="send-btn" title="Skicka">➤</button>
      </form>
      <div class="flyout-resize br" data-resize="br" title="Ändra storlek"></div>
      <div class="flyout-resize t" data-resize="t" title="Dra för höjd"></div>
      <div class="flyout-resize b" data-resize="b" title="Dra för höjd"></div>
      <div class="flyout-resize l" data-resize="l" title="Dra för bredd"></div>
      <div class="flyout-resize r" data-resize="r" title="Dra för bredd"></div>`;
    document.body.appendChild(sec);
    sec.querySelector('[data-action="close"]').addEventListener('click', () => this.hide());
    sec.querySelector('[data-action="settings"]').addEventListener('click', () => {
      this.settingsEl.classList.toggle('collapsed');
    });
    const delBtn = sec.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', () => this.destroy());
    const clrBtn = sec.querySelector('[data-action="clear"]');
    if (clrBtn) clrBtn.addEventListener('click', () => {
      const ok = confirm('Rensa denna panels chatt? Det går inte att ångra.');
      if (!ok) return;
      try { this.history = []; this._saveHistory(); } catch {}
      try { this.msgEl.innerHTML = ''; } catch {}
      try { this._stagedFiles = []; this.#renderAttachments(); } catch {}
      toast('Chatt rensad.');
    });
    return sec;
  }
  #wireDrops() {
    const targets = [this.msgEl, this.inputEl, this.panel];
    const highlight = (on) => { targets.forEach(t => { if (t && t.classList) t.classList.toggle('drag', !!on); }); };
    const onDrop = (e) => {
      e.preventDefault();
      highlight(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      const added = [];
      for (const f of files) {
        if (!/\.(pdf|txt|md|text)$/i.test(f.name)) continue;
        if (!this._stagedFiles.find(x => x.name === f.name && x.size === f.size)) {
          this._stagedFiles.push(f);
          added.push(f.name);
        }
      }
      if (added.length) {
        this.#renderAttachments();
        toast(`${added.length} bilaga(or) tillagda. Skicka för att läsa.`);
      }
    };
    targets.forEach(t => {
      if (!t) return;
      t.addEventListener('dragover', (e) => { e.preventDefault(); highlight(true); });
      t.addEventListener('dragleave', () => highlight(false));
      t.addEventListener('drop', onDrop);
    });
  }
  #renderAttachments() {
    const bar = this.attachBarEl;
    if (!bar) return;
    if (!this._stagedFiles.length) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    this._stagedFiles.forEach((f, idx) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${f.name} (${Math.round(f.size/1024)} KB)`;
      const rm = document.createElement('button');
      rm.className = 'rm'; rm.type = 'button'; rm.title = 'Ta bort'; rm.textContent = '\u00d7';
      rm.addEventListener('click', () => { this._stagedFiles.splice(idx, 1); this.#renderAttachments(); });
      chip.appendChild(name); chip.appendChild(rm);
      bar.appendChild(chip);
    });
  }

  #historyKey() { return `examai.copilot.${this.id}.history`; }
  _saveHistory() {
    try { localStorage.setItem(this.#historyKey(), JSON.stringify(this.history || [])); } catch {}
  }
  #loadAndRenderHistory() {
    // Load
    try {
      const raw = localStorage.getItem(this.#historyKey());
      const arr = JSON.parse(raw || '[]');
      if (Array.isArray(arr)) this.history = arr;
    } catch {}
    // Render without mutating history again
    try {
      const authorUser = (window.getGlobalUserName || (() => 'Användare'))();
      for (const m of (this.history || [])) {
        if (!m || !m.role) continue;
        if (m.role === 'user') this.addUser(m.content || '', authorUser);
        else if (m.role === 'assistant') this.addAssistant(m.content || '', this.name);
        else if (m.role === 'system') this.addAssistant(m.content || '', this.name);
      }
    } catch {}
  }

  unlinkSelf() {
    if (!this._convId) { toast('Inte länkad.', 'warn'); return; }
    
    // Use centralized connection manager for proper two-way unlinking
    const connectionManager = getConnectionManager();
    
    // Remove all connections for this node
    const removedConnections = connectionManager.removeAllConnectionsFor(this.id);
    
    // Also detach from Internet hub if linked, and clear persisted internet link
    try { InternetHub.unlinkCopilot(this); } catch {}
    try { GraphPersistence.removeWhere(l => l.fromType==='copilot' && l.fromId===this.id && l.toType==='internet'); } catch {}
    
    // Legacy cleanup for any remaining direct connections
    for (const [otherId, recs] of this.connections.entries()) {
      const arr = Array.isArray(recs) ? recs : [recs];
      arr.forEach(({ lineId, updateLine }) => {
        try { ConnectionLayer.remove(lineId); } catch {}
        try { window.removeEventListener('resize', updateLine); } catch {}
        try { window.removeEventListener('scroll', updateLine); } catch {}
        try { window.removeEventListener('examai:internet:moved', updateLine); } catch {}
        try { window.removeEventListener('examai:fab:moved', updateLine); } catch {}
      });
      
      // Notify other copilot about disconnection
      const other = CopilotManager.instances.get(otherId);
      if (other) {
        try { other.connections.delete(this.id); } catch {}
        try { other.inNeighbors?.delete(this.id); other.outNeighbors?.delete(this.id); } catch {}
        if (other.flowInId === this.id) other.flowInId = null;
        if (other.flowOutId === this.id) other.flowOutId = null;
      }
    }
    
    // Clear local state
    this.connections.clear();
    this.flowInId = null;
    this.flowOutId = null;
    try { this.inNeighbors?.clear(); this.outNeighbors?.clear(); } catch {}
    
    // Unlink from user node
    try { const UserNode = getUserApi(); if (UserNode && typeof UserNode.unlinkFor === 'function') { UserNode.unlinkFor(this.id); } } catch {}
    
    // Clean up conversation state
    try {
      if (this._convId && ConversationManager && typeof ConversationManager.removePendingFor === 'function') {
        ConversationManager.removePendingFor(this.id);
      }
    } catch (e) {}
    try { ConversationManager.removeMember(this._convId, this); } catch (e) {}
    this._convId = null;
    this.panel.classList.remove('active-speaking');
    
    // Remove from persistence
    try { GraphPersistence.removeWhere(l => (l.fromType==='copilot'&&l.fromId===this.id) || (l.toType==='copilot'&&l.toId===this.id)); } catch {}
    
    // Emit global unlink event for UI updates
    window.dispatchEvent(new CustomEvent('examai:copilot:unlinked', {
      detail: { 
        copilotId: this.id, 
        removedConnections: removedConnections.length 
      }
    }));
    
    toast(`Urkopplad. ${removedConnections.length} kopplingar borttagna.`);
  }
  _setOutbound(target) {
    const prev = this.flowOutId;
    if (Number.isInteger(prev) && prev !== target) {
      try {
        const prevInst = CopilotManager.instances.get(prev);
        const conn = this.connections.get(prev);
        if (conn) {
          ConnectionLayer.remove(conn.lineId);
          window.removeEventListener('resize', conn.updateLine);
          window.removeEventListener('scroll', conn.updateLine);
          window.removeEventListener('examai:fab:moved', conn.updateLine);
          this.connections.delete(prev);
        }
        if (prevInst) {
          const rev = prevInst.connections.get(this.id);
          if (rev) {
            ConnectionLayer.remove(rev.lineId);
            window.removeEventListener('resize', rev.updateLine);
            window.removeEventListener('scroll', rev.updateLine);
            window.removeEventListener('examai:fab:moved', rev.updateLine);
            prevInst.connections.delete(this.id);
          }
          if (prevInst.flowInId === this.id) prevInst.flowInId = null;
        }
      } catch {}
    }
    this.flowOutId = target;
  }
  #wireFabConnections() {
  const points = Array.from(this.fab.querySelectorAll('.conn-point'));
  let dragging = false, start = null, ghostId = null, overPoint = null, startPointEl = null;
  const ioIds = new Map(); // el -> ioId
    const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const where = 'fab';
    const roleKey = (pt) => `io:${this.id}:${where}:${pt.getAttribute('data-side') || 'x'}`;
    const setPointRole = (el, role, persist = false) => {
      el.classList.remove('io-in', 'io-out');
      if (role === 'in') el.classList.add('io-in');
      if (role === 'out') el.classList.add('io-out');
      el.setAttribute('data-io', role || '');
      const label = role === 'in' ? 'Input' : role === 'out' ? 'Output' : '';
      if (label) { el.setAttribute('title', label); el.setAttribute('aria-label', label); }
      if (persist) { try { localStorage.setItem(roleKey(el), role || ''); } catch {} }
    };
    // Register points in IORegistry and restore saved IO roles (default to 'out')
    points.forEach((pt, idx) => {
      try { const id = IORegistry.register(pt, { nodeType: 'copilot', nodeId: String(this.id), side: pt.getAttribute('data-side') || 'x', index: idx }, { attachToggle: true }); ioIds.set(pt, id); } catch {}
      try { const r = localStorage.getItem(roleKey(pt)); setPointRole(pt, (r === 'in' || r === 'out') ? r : 'out', false); } catch { setPointRole(pt, 'out', false); }
    });
    const pickPointAt = (x, y) => {
      // Allow linking to panel/fab points, Internet hub, and section IO targets
      const all = document.querySelectorAll('.panel-flyout .conn-point, .internet-hub .conn-point, .fab .conn-point, .panel .head .section-io');
      for (const p of all) { const r = p.getBoundingClientRect(); if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return p; }
      return null;
    };
    const onMove = (e) => {
      if (!dragging) return; const p = e.touches ? e.touches[0] : e; const b = { x: p.clientX, y: p.clientY };
      ConnectionLayer.draw(ghostId, start, b);
      const hit = pickPointAt(b.x, b.y);
      if (overPoint && overPoint !== hit) overPoint.classList.remove('hover');
      overPoint = hit; if (overPoint) overPoint.classList.add('hover');
      e.preventDefault();
    };
    const finish = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
    const onUp = () => {
      if (!dragging) return; dragging = false; if (overPoint) overPoint.classList.remove('hover');
      finish();
      const endPt = overPoint; if (ghostId) { try { ConnectionLayer.remove(ghostId); } catch {} ghostId = null; } if (!endPt) return;
      // Ensure start is Output
      if (startPointEl?.getAttribute('data-io') !== 'out') setPointRole(startPointEl, 'out', true);
      // Section link
      const head = endPt.closest('.head');
      const secEl = head && head.closest('.board-section');
      const secKey = secEl && (secEl.getAttribute('data-section-key') || secEl.id);
      if (secKey) {
        const ss = (startPointEl.getAttribute && startPointEl.getAttribute('data-side')) || 'x';
        const fromIoId = (IORegistry.getByEl(startPointEl)?.ioId) || `copilot:${this.id}:${ss}:0`;
        const toIoId = `section:${secKey}:r:0`;
        const lineId = `link_${fromIoId}__${toIoId}`;
        // prevent duplicate identical copilot→section
        {
          const key = `section:${secKey}`;
          const mine = this.connections.get(key);
          const arr = Array.isArray(mine) ? mine : (mine ? [mine] : []);
          if (arr.some(r => r && r.lineId === lineId)) {
            try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
            try { toast('Den kopplingen finns redan.', 'info'); } catch {}
            return;
          }
        }
  const rec = Link.create({ lineId, startEl: startPointEl, endEl: endPt, from: this.id, to: `section:${secKey}` });
        const key = `section:${secKey}`;
        const mine = this.connections.get(key);
        if (mine) { if (Array.isArray(mine)) mine.push(rec); else this.connections.set(key, [mine, rec]); } else { this.connections.set(key, [rec]); }
        try { this.outNeighbors?.add(key); } catch {}
        try { GraphPersistence.addLink({ fromType: 'copilot', fromId: this.id, fromSide: ss, toType: 'section', toId: secKey, toSide: 'r' }); } catch {}
        return;
      }
      // Internet hub
      const hubEl = endPt.closest('.internet-hub');
      if (hubEl) {
        InternetHub.linkCopilot(this, startPointEl, endPt);
        return;
      }
      // Other copilot or user
      const panel = endPt.closest('.panel-flyout');
      const fab = endPt.closest('.fab');
      let other = null;
      if (panel) {
        if (panel.classList.contains('user-node-panel')) {
          const endRoleUser = endPt.getAttribute('data-io');
          if (endRoleUser !== 'in') { endPt.classList.remove('io-out'); endPt.classList.add('io-in'); endPt.setAttribute('data-io', 'in'); endPt.setAttribute('title', 'Input'); }
          try { const UserNode = getUserApi(); if (UserNode) UserNode.linkFromCopilot(this, startPointEl, endPt); } catch {}
          try { this.outNeighbors?.add('user'); } catch {}
          return;
        }
        const id = parseInt(panel.getAttribute('data-copilot-id'), 10);
        other = CopilotManager.instances.get(id);
      } else if (fab && fab !== this.fab) {
        if (fab.classList.contains('user-node')) {
          // Auto-adjust user end to Input for Output→Input linking
          const endRoleUser = endPt.getAttribute('data-io');
          if (endRoleUser !== 'in') { endPt.classList.remove('io-out'); endPt.classList.add('io-in'); endPt.setAttribute('data-io','in'); endPt.setAttribute('title','Input'); }
          try { const UserNode = getUserApi(); if (UserNode) UserNode.linkFromCopilot(this, startPointEl, endPt); } catch {}
          try { this.outNeighbors?.add('user'); } catch {}
          this.flowOutId = 'user';
          return;
        }
        const id = parseInt(fab.getAttribute('data-copilot-id'), 10);
        other = CopilotManager.instances.get(id);
      }
      if (other) {
        let startRole = startPointEl?.getAttribute('data-io');
        let endRole = endPt.getAttribute('data-io');
        let adjusted = false;
        if (startRole !== 'out') { setPointRole(startPointEl, 'out', true); startRole = 'out'; adjusted = true; }
        if (endRole !== 'in') { endPt.classList.remove('io-out'); endPt.classList.add('io-in'); endPt.setAttribute('data-io', 'in'); endRole = 'in'; adjusted = true; }
        if (adjusted) toast('IO-roller justerades för att koppla Output → Input.', 'info');
        ConversationManager.link(this, other);
        try { this.outNeighbors?.add(other.id); other.inNeighbors?.add(this.id); } catch {}
        const startEl = startPointEl;
        const endEl = endPt;
  const fromIoId = ioIds.get(startEl) || `copilot:${this.id}:${(startEl.getAttribute && startEl.getAttribute('data-side')) || 'x'}:0`;
  const toIoId = (IORegistry.getByEl(endEl)?.ioId) || `copilot:${other.id}:${(endEl.getAttribute && endEl.getAttribute('data-side')) || 'x'}:0`;
  const lineId = `link_${fromIoId}__${toIoId}`;
        // prevent duplicate identical copilot→copilot
        {
          const mine = this.connections.get(other.id);
          const arr = Array.isArray(mine) ? mine : (mine ? [mine] : []);
          if (arr.some(r => r && r.lineId === lineId)) {
            try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
            try { toast('Den kopplingen finns redan.', 'info'); } catch {}
            return;
          }
        }
  const rec = Link.create({ lineId, startEl, endEl, from: this.id, to: other.id });
        if (rec) {
          const mine = this.connections.get(other.id);
          if (mine) { if (Array.isArray(mine)) mine.push(rec); else this.connections.set(other.id, [mine, rec]); } else { this.connections.set(other.id, [rec]); }
          const theirs = other.connections.get(this.id);
          if (theirs) { if (Array.isArray(theirs)) theirs.push(rec); else other.connections.set(this.id, [theirs, rec]); } else { other.connections.set(this.id, [rec]); }
        }
        try {
          const ss = (startEl.getAttribute && startEl.getAttribute('data-side')) || 'x';
          const es = (endEl.getAttribute && endEl.getAttribute('data-side')) || 'x';
          GraphPersistence.addLink({ fromType: 'copilot', fromId: this.id, fromSide: ss, toType: 'copilot', toId: other.id, toSide: es });
        } catch {}
      }
    };
    // Listeners
  points.forEach(pt => {
      const startDrag = (e) => {
        dragging = true; overPoint = null; const c = getCenter(pt); start = c; startPointEl = pt; ghostId = `ghost_${this.id}_${Date.now()}`;
        try { ConnectionLayer.allow(ghostId); } catch {}
        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp, { passive: false });
        e.preventDefault(); e.stopPropagation();
      };
      pt.addEventListener('mousedown', startDrag, { passive: false });
      pt.addEventListener('touchstart', startDrag, { passive: false });
    });
  }
  linkTo(other, fromSide = 'x', toSide = 'x', { persist = true } = {}) {
    if (!other || other === this) return;
    const getCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
    const startEl = this.fab.querySelector(`.conn-point[data-side="${fromSide}"]`) || this.fab;
    const endEl = other.fab.querySelector(`.conn-point[data-side="${toSide}"]`) || other.fab;
  const ss = fromSide || 'x'; const es = toSide || 'x';
  const fromIoId = (IORegistry.getByEl(startEl)?.ioId) || `copilot:${this.id}:${ss}:0`;
  const toIoId = (IORegistry.getByEl(endEl)?.ioId) || `copilot:${other.id}:${es}:0`;
  const lineId = `link_${fromIoId}__${toIoId}`;
    // prevent duplicates on programmatic path
    {
      const mine = this.connections.get(other.id);
      const arr = Array.isArray(mine) ? mine : (mine ? [mine] : []);
      if (arr.some(r => r && r.lineId === lineId)) {
        try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
        return;
      }
    }
  const rec = Link.create({ lineId, startEl, endEl, from: this.id, to: other.id });
    if (rec) {
      const mine = this.connections.get(other.id);
      if (mine) { if (Array.isArray(mine)) mine.push(rec); else this.connections.set(other.id, [mine, rec]); }
      else { this.connections.set(other.id, [rec]); }
      const theirs = other.connections.get(this.id);
      if (theirs) { if (Array.isArray(theirs)) theirs.push(rec); else other.connections.set(this.id, [theirs, rec]); }
      else { other.connections.set(this.id, [rec]); }
    }
    try { this.outNeighbors?.add(other.id); other.inNeighbors?.add(this.id); } catch {}
    if (persist) try { GraphPersistence.addLink({ fromType:'copilot', fromId:this.id, fromSide:ss, toType:'copilot', toId:other.id, toSide:es }); } catch {}
  }
  #wireFabContextMenu() {
    // Context menu functionality removed - using disconnect buttons on connection lines instead
    return;
  }
  #wireDrag() {
    // Drag functionality disabled - FABs are now statically positioned
  }
  #positionFabUnderPanel() {
  // NO-OP: keep copilots' FAB fixed; panels should position centered over their FAB without moving it
  return;
  }
  #wireToggle() {
    this.fab.addEventListener('click', (e) => {
      const now = Date.now();
      // Check both old and new drag timestamp properties
      const lastDrag = Math.max(this._lastDragAt || 0, this.fab._lastDragTime || 0);
      if (now - lastDrag < 300) { e.preventDefault(); e.stopPropagation(); return; }
      if (this.panel.classList.contains('hidden')) this.show(); else this.hide();
    });
  }
  destroy() {
    try { InternetHub.unlinkCopilot(this); } catch {}
    try { this.unlinkSelf(); } catch {}
    try { const UserNode = getUserApi(); if (UserNode && typeof UserNode.unlinkFor === 'function') UserNode.unlinkFor(this.id); } catch {}
    for (const [key, { lineId, updateLine }] of this.connections.entries()) {
      try { ConnectionLayer.remove(lineId); } catch {}
      try { window.removeEventListener('examai:fab:moved', updateLine); } catch {}
      try { window.removeEventListener('resize', updateLine); } catch {}
      try { window.removeEventListener('scroll', updateLine); } catch {}
    }
    this.connections.clear();
    try { this.panel.remove(); } catch {}
    try { this.fab.remove(); } catch {}
    try { CopilotManager.instances.delete(this.id); } catch {}
    try { GraphPersistence.unregisterCopilot(this.id); } catch {}
    toast('Copilot borttagen.');
  }
  #wireSettings() {
    this.modelEl.value = localStorage.getItem(`examai.copilot.${this.id}.model`) || this.model;
    this.nameEl.value = localStorage.getItem(`examai.copilot.${this.id}.name`) || this.name;
    if (this.topicEl) this.topicEl.value = this.topic;
    if (this.roleEl) this.roleEl.value = this.role;
    if (this.useRoleEl) this.useRoleEl.checked = !!this.useRole;
    this.tokensEl.value = String(this.maxTokens);
    this.tokensLabelEl.textContent = String(this.maxTokens);
    this.speedEl.value = String(this.typingSpeed);
    this.#updateSpeedLabel(this.typingSpeed);
    this.renderModeEl.value = (this.renderMode === 'md' ? 'md' : 'raw');
    const instKey = localStorage.getItem(`examai.copilot.${this.id}.key`) || '';
    if (instKey) this.apiKeyEl.value = '•••• •••• ••••';
    const webLinked = InternetHub.isLinked(this.id);
    if (this.webEnableEl) {
      this.webEnableEl.checked = webLinked;
      this.webEnableEl.disabled = true;
      this.webEnableEl.title = webLinked ? 'Webb tillåts via Internet-noden' : 'Koppla till Internet-noden för webbtillgång';
    }
    const webMax = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
    if (this.webMaxResultsEl) this.webMaxResultsEl.value = String(Number.isFinite(webMax) && webMax > 0 ? webMax : 3);
    const perPageDefault = 3000;
    const totalBudgetDefault = 9000;
    const perPageSaved = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || String(perPageDefault), 10);
    const totalSaved = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || String(totalBudgetDefault), 10);
    if (this.webPerPageCharsEl) {
      const v = Number.isFinite(perPageSaved) ? perPageSaved : perPageDefault;
      this.webPerPageCharsEl.value = String(v);
      if (this.webPerPageCharsValueEl) this.webPerPageCharsValueEl.textContent = String(v);
    }
    if (this.webTotalCharsEl) {
      const v = Number.isFinite(totalSaved) ? totalSaved : totalBudgetDefault;
      this.webTotalCharsEl.value = String(v);
      if (this.webTotalCharsValueEl) this.webTotalCharsValueEl.textContent = String(v);
    }
    this.modelEl.addEventListener('change', () => {
      this.model = this.modelEl.value;
      localStorage.setItem(`examai.copilot.${this.id}.model`, this.model);
      toast(`Modell uppdaterad: ${this.model}`);
    });
    let tmrName = null;
    this.nameEl.addEventListener('input', () => {
      this.name = this.nameEl.value.trim() || `Copilot ${this.id}`;
      const nm = this.panel.querySelector('.meta .name');
      if (nm) nm.textContent = this.name;
      if (this.fab) this.fab.title = this.name;
      try { const lbl = this.fab.querySelector('.fab-label'); if (lbl) lbl.textContent = this.name; } catch (e) {}
      if (tmrName) clearTimeout(tmrName);
      tmrName = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.name`, this.name);
        toast('Namn uppdaterat.');
      }, 400);
    });
    this.nameEl.addEventListener('blur', () => {
      if (tmrName) { clearTimeout(tmrName); tmrName = null; }
      localStorage.setItem(`examai.copilot.${this.id}.name`, this.name);
      toast('Namn uppdaterat.');
    });
    if (this.topicEl) {
      let tmrTopic = null;
      this.topicEl.addEventListener('input', () => {
        this.topic = this.topicEl.value.trim();
        if (tmrTopic) clearTimeout(tmrTopic);
        tmrTopic = setTimeout(() => {
          localStorage.setItem(`examai.copilot.${this.id}.topic`, this.topic);
          toast('Topic sparad.');
        }, 400);
      });
    }
    if (this.roleEl) {
      this.roleEl.addEventListener('input', () => {
        this.role = this.roleEl.value;
        localStorage.setItem(`examai.copilot.${this.id}.role`, this.role);
        this.updateRoleBadge();
      });
      this.roleEl.addEventListener('blur', () => {
        this.role = (this.roleEl.value || '').trim();
        localStorage.setItem(`examai.copilot.${this.id}.role`, this.role);
        this.updateRoleBadge();
        if (this.roleBadgeEl) { this.roleBadgeEl.classList.add('saved'); setTimeout(() => this.roleBadgeEl.classList.remove('saved'), 1200); }
        toast('Roll sparad.');
      });
    }
    if (this.useRoleEl) {
      this.useRoleEl.addEventListener('change', () => {
        this.useRole = !!this.useRoleEl.checked;
        localStorage.setItem(`examai.copilot.${this.id}.use_role`, String(this.useRole));
        this.updateRoleBadge();
        toast(this.useRole ? 'Roll kommer användas i prompt.' : 'Roll används inte i prompt.');
      });
    }
    if (this.roleBadgeEl) {
      this.roleBadgeEl.style.cursor = 'pointer';
      this.roleBadgeEl.addEventListener('click', () => {
        this.useRole = !this.useRole;
        if (this.useRoleEl) this.useRoleEl.checked = this.useRole;
        localStorage.setItem(`examai.copilot.${this.id}.use_role`, String(this.useRole));
        this.updateRoleBadge();
        toast(this.useRole ? 'Roll kommer användas i prompt.' : 'Roll används inte i prompt.');
      });
    }
    this.updateRoleBadge();
    let tmrTok = null;
    this.tokensEl.addEventListener('input', () => {
      this.maxTokens = parseInt(this.tokensEl.value, 10);
      this.tokensLabelEl.textContent = String(this.maxTokens);
      if (tmrTok) clearTimeout(tmrTok);
      tmrTok = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.max_tokens`, String(this.maxTokens));
        toast('Max tokens sparat.');
      }, 400);
    });
    let tmrSpd = null;
    this.speedEl.addEventListener('input', () => {
      this.typingSpeed = parseInt(this.speedEl.value, 10);
      this.#updateSpeedLabel(this.typingSpeed);
      if (tmrSpd) clearTimeout(tmrSpd);
      tmrSpd = setTimeout(() => {
        localStorage.setItem(`examai.copilot.${this.id}.typing_speed`, String(this.typingSpeed));
        toast('Skrivhastighet sparad.');
      }, 400);
    });
    this.renderModeEl.addEventListener('change', () => {
      this.renderMode = (this.renderModeEl.value === 'md' ? 'md' : 'raw');
      localStorage.setItem(`examai.copilot.${this.id}.render_mode`, this.renderMode);
      toast(`Visningsläge: ${this.renderMode === 'md' ? 'Markdown' : 'Rå text'}.`);
    });
    this.apiKeyEl.addEventListener('blur', () => {
      const v = (this.apiKeyEl.value || '').trim();
      if (!v || v.startsWith('••')) return;
      localStorage.setItem(`examai.copilot.${this.id}.key`, v);
      this.apiKeyEl.value = '•••• •••• ••••';
      this.updateKeyStatusBadge();
      toast('API-nyckel sparad.');
      try { window.dispatchEvent(new CustomEvent('examai:perKeyChanged', { detail: { id: this.id, present: true } })); } catch {}
    });
    this.apiKeyEl.addEventListener('input', () => {
      const raw = (this.apiKeyEl.value || '').trim();
      if (!raw) {
        localStorage.removeItem(`examai.copilot.${this.id}.key`);
        this.updateKeyStatusBadge();
        try { window.dispatchEvent(new CustomEvent('examai:perKeyChanged', { detail: { id: this.id, present: false } })); } catch {}
      }
    });
    const updateWebUi = () => {
      const linked = InternetHub.isLinked(this.id);
      if (this.webEnableEl) {
        this.webEnableEl.checked = linked;
        this.webEnableEl.disabled = true;
        this.webEnableEl.title = linked ? 'Webb tillåts via Internet-noden' : 'Koppla till Internet-noden för webbtillgång';
      }
    };
    window.addEventListener('examai:internet:linked', (e) => { if (e.detail?.copilotId === this.id) updateWebUi(); });
    window.addEventListener('examai:internet:unlinked', (e) => { if (e.detail?.copilotId === this.id) updateWebUi(); });
    updateWebUi();
    if (this.webMaxResultsEl) {
      this.webMaxResultsEl.addEventListener('input', () => {
        const raw = parseInt(this.webMaxResultsEl.value, 10);
        if (Number.isFinite(raw) && raw > 0) {
          localStorage.setItem(`examai.copilot.${this.id}.web_max_results`, String(raw));
        }
      });
    }
    if (this.webPerPageCharsEl) {
      this.webPerPageCharsEl.addEventListener('input', () => {
        const raw = parseInt(this.webPerPageCharsEl.value, 10);
        if (Number.isFinite(raw) && raw >= 500) {
          localStorage.setItem(`examai.copilot.${this.id}.web_per_page_chars`, String(raw));
          if (this.webPerPageCharsValueEl) this.webPerPageCharsValueEl.textContent = String(raw);
        }
      });
    }
    if (this.webTotalCharsEl) {
      this.webTotalCharsEl.addEventListener('input', () => {
        const raw = parseInt(this.webTotalCharsEl.value, 10);
        if (Number.isFinite(raw) && raw >= 1000) {
          localStorage.setItem(`examai.copilot.${this.id}.web_total_chars_cap`, String(raw));
          if (this.webTotalCharsValueEl) this.webTotalCharsValueEl.textContent = String(raw);
        }
      });
    }
    try {
      this.updateKeyStatusBadge();
      if (typeof this._attachKeyListenersOnce === 'function') {
        this._attachKeyListenersOnce(this);
      }
    } catch {}
  }
  #updateSpeedLabel(v) {
    let label = 'Snabb';
    if (v <= 5) label = 'Mycket långsam';
    else if (v <= 20) label = 'Långsam';
    else if (v <= 60) label = 'Medel';
    else if (v <= 90) label = 'Snabb';
    else label = 'Omedelbar';
    this.speedLabelEl.textContent = label;
  }
  updateKeyStatusBadge() {
    if (!this.keyBadgeEl) return;
    const perKey = !!localStorage.getItem(`examai.copilot.${this.id}.key`);
    const globalKey = !!localStorage.getItem('examai.openai.key');
    const server = !!(typeof window !== 'undefined' && window.__ExamAI_hasServerKey);
    if (perKey) {
      this.keyBadgeEl.textContent = 'Nyckel: per‑copilot';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else if (globalKey) {
      this.keyBadgeEl.textContent = 'Nyckel: global';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else if (server) {
      this.keyBadgeEl.textContent = 'Nyckel i server (.env)';
      this.keyBadgeEl.classList.remove('badge-error');
      this.keyBadgeEl.classList.add('badge-ok');
    } else {
      this.keyBadgeEl.textContent = 'Ingen nyckel';
      this.keyBadgeEl.classList.remove('badge-ok');
      this.keyBadgeEl.classList.add('badge-error');
    }
  }
  _attachKeyListenersOnce = (() => {
    let attached = false;
    return (inst) => {
      if (attached) return;
      attached = true;
      window.addEventListener('examai:globalKeyChanged', () => inst.updateKeyStatusBadge());
      window.addEventListener('examai:serverKeyStatusChanged', () => inst.updateKeyStatusBadge());
      window.addEventListener('examai:perKeyChanged', () => inst.updateKeyStatusBadge());
    };
  })();
  updateRoleBadge() {
    if (!this.roleBadgeEl) return;
    const hasRole = !!(this.role && this.role.trim());
    if (!hasRole) { this.roleBadgeEl.style.display = 'none'; return; }
    this.roleBadgeEl.style.display = '';
    const short = (this.role || '').trim().slice(0, 24) || 'Roll';
    this.roleBadgeEl.textContent = `${this.useRole ? 'Roll: På' : 'Roll: Av'} · ${short}${(this.role||'').length>24?'…':''}`;
    this.roleBadgeEl.title = this.role || 'Roll';
    this.roleBadgeEl.classList.toggle('badge-ok', !!this.useRole);
    this.roleBadgeEl.classList.toggle('badge-error', !this.useRole);
  }
  #wirePanelDrag() {
    const handle = this.panel.querySelector('[data-role="dragHandle"]');
    if (!handle) return;
    let dragging = false, moved=false, sx=0, sy=0, sl=0, st=0;
    const onDown = (e) => {
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
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const onMove = (e) => {
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      const w = this.panel.offsetWidth;
      const h = this.panel.offsetHeight;
      
      // Get Node Board bounds to constrain panels within it
      const nodeBoard = document.getElementById('nodeBoard');
      const nodeBoardRect = nodeBoard ? nodeBoard.getBoundingClientRect() : null;
      
      let minLeft = 4, minTop = 8, maxRight = window.innerWidth - 4, maxBottom = window.innerHeight - 4;
      
      if (nodeBoardRect) {
        // Constrain to Node Board area
        minLeft = nodeBoardRect.left + 4;
        minTop = nodeBoardRect.top + 8;
        maxRight = nodeBoardRect.right - 4;
        maxBottom = nodeBoardRect.bottom - 4;
      } else {
        // Fallback constraint if no Node Board found
        const topMin = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
        minTop = topMin;
      }
      
      let nl = clamp(sl + dx, minLeft, maxRight - w);
      let nt = clamp(st + dy, minTop, maxBottom - h);
      
      // Prevent overlap with other panels by simple collision stop and edge snapping
      try {
        const pads = 6; const snap = 10;
        const myRect = { left: nl, top: nt, right: nl + w, bottom: nt + h };
        const panels = Array.from(document.querySelectorAll('.panel-flyout.show')).filter(el => el !== this.panel);
        for (const el of panels) {
          const r = el.getBoundingClientRect();
          const other = { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height };
          const inter = !(myRect.right < other.left + pads || myRect.left > other.right - pads || myRect.bottom < other.top + pads || myRect.top > other.bottom - pads);
          if (inter) {
            // push out to nearest side
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
            // edge snapping when close
            if (Math.abs(myRect.left - other.right) <= snap) nl = other.right; // snap my left to their right
            if (Math.abs(myRect.right - other.left) <= snap) nl = other.left - w; // snap my right to their left
            if (Math.abs(myRect.top - other.bottom) <= snap) nt = other.bottom; // snap my top to their bottom
            if (Math.abs(myRect.bottom - other.top) <= snap) nt = other.top - h; // snap my bottom to their top
          }
        }
      } catch {}
      
      // Final clamp to ensure we stay within bounds
      nl = clamp(nl, minLeft, maxRight - w);
      nt = clamp(nt, minTop, maxBottom - h);
      
      this.panel.style.left = Math.round(nl) + 'px';
      this.panel.style.top = Math.round(nt) + 'px';
      this.#positionFabUnderPanel();
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (moved) this._lastDragAt = Date.now();
      const l = parseInt((this.panel.style.left || '0').replace('px',''), 10) || 0;
      const t = parseInt((this.panel.style.top || '0').replace('px',''), 10) || 0;
      localStorage.setItem(`examai.copilot.${this.id}.pos`, JSON.stringify({ x: l, y: t }));
      const r = this.fab.getBoundingClientRect();
      localStorage.setItem(`examai.fab.${this.id}.pos`, JSON.stringify({ x: r.left, y: r.top }));
    };
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive:false });
  }
  #initInputAutoResize() {
    const MIN = 40, MAX = 300;
    const resize = () => {
      this.inputEl.style.height = 'auto';
      const next = Math.max(MIN, Math.min(MAX, this.inputEl.scrollHeight));
      this.inputEl.style.height = next + 'px';
    };
    this.inputEl.addEventListener('input', resize);
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendFromInput(); }
    });
    resize();
  }
  #wireResize() {
    const handles = this.panel.querySelectorAll('[data-resize]');
    const MIN_W = 280, MAX_W = Math.min(window.innerWidth * 0.92, 1000);
    const MIN_H = 220, MAX_H = Math.min(window.innerHeight * 0.85, 900);
    let dir = null, sx=0, sy=0, sw=0, sh=0, sl=0, st=0, resizing=false;
    const onDown = (e) => {
      const target = e.currentTarget;
      dir = target.getAttribute('data-resize');
      e.preventDefault();
      const p = e.touches ? e.touches[0] : e;
      const r = this.panel.getBoundingClientRect();
      sx = p.clientX; sy = p.clientY; sw = r.width; sh = r.height; sl = r.left; st = r.top; resizing = true;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive:false });
      document.addEventListener('touchend', onUp);
    };
    const onMove = (e) => {
      if (!resizing) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - sx;
      const dy = p.clientY - sy;
      let newW = sw, newH = sh, newL = sl, newT = st;
      if (dir === 'br' || dir === 'r') { newW = Math.max(MIN_W, Math.min(MAX_W, sw + dx)); }
      if (dir === 'br' || dir === 'b') { newH = Math.max(MIN_H, Math.min(MAX_H, sh + dy)); }
      if (dir === 'l') { const rawW = sw - dx; newW = Math.max(MIN_W, Math.min(MAX_W, rawW)); const maxDx = sw - newW; newL = sl + Math.min(Math.max(dx, -10000), maxDx); }
      if (dir === 't') {
        const rawH = sh - dy; newH = Math.max(MIN_H, Math.min(MAX_H, rawH)); const maxDy = sh - newH; newT = st + Math.min(Math.max(dy, -10000), maxDy);
        const topMin = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
        if (newT < topMin) {
          const bottom = st + sh; newT = topMin; newH = Math.max(MIN_H, Math.min(MAX_H, bottom - newT));
        }
      }
      this.panel.style.width = newW + 'px'; this.panel.style.height = newH + 'px';
      if (dir === 'l' || dir === 't') { this.panel.style.left = newL + 'px'; this.panel.style.top = newT + 'px'; }
      this.#positionFabUnderPanel();
    };
    const onUp = () => {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      const w = parseInt((this.panel.style.width || '0').replace('px',''), 10) || 0;
      const h = parseInt((this.panel.style.height || '0').replace('px',''), 10) || 0;
      if (w && h) localStorage.setItem(`examai.copilot.${this.id}.size`, JSON.stringify({ w, h }));
      const l = parseInt((this.panel.style.left || '0').replace('px',''), 10) || 0;
      const t = parseInt((this.panel.style.top || '0').replace('px',''), 10) || 0;
      localStorage.setItem(`examai.copilot.${this.id}.pos`, JSON.stringify({ x: l, y: t }));
    };
    handles.forEach(h => { h.addEventListener('mousedown', onDown); h.addEventListener('touchstart', onDown, { passive:false }); });
    try {
      const s = localStorage.getItem(`examai.copilot.${this.id}.size`);
      if (s) {
        const { w, h } = JSON.parse(s);
        if (w) this.panel.style.width = w + 'px';
        if (h) this.panel.style.height = h + 'px';
      }
      const p = localStorage.getItem(`examai.copilot.${this.id}.pos`);
      if (p) {
        const { x, y } = JSON.parse(p);
        // Clamp to viewport and keep below sticky app bar to avoid getting stuck under it
        const r = this.panel.getBoundingClientRect();
        const w = r.width || parseInt(this.panel.style.width || '420', 10) || 420;
        const h = r.height || parseInt(this.panel.style.height || '320', 10) || 320;
        const topMin = (document.querySelector('.appbar')?.getBoundingClientRect()?.bottom || 0) + 8;
        if (Number.isFinite(x)) {
          const clampedX = Math.max(4, Math.min(window.innerWidth - w - 4, x));
          this.panel.style.left = clampedX + 'px';
        }
        if (Number.isFinite(y)) {
          const clampedY = Math.max(topMin, Math.min(window.innerHeight - h - 4, y));
          this.panel.style.top = clampedY + 'px';
        }
      }
    } catch {}
  }
  #wireSubmit() { this.formEl.addEventListener('submit', (e) => { e.preventDefault(); this.sendFromInput(); }); }
  
  /**
   * Wire event listeners for global unlink events
   */
  #wireUnlinkEvents() {
    // Listen for when other copilots unlink themselves
    window.addEventListener('examai:copilot:unlinked', (event) => {
      const { copilotId } = event.detail;
      
      // If this copilot was connected to the unlinked one, update UI
      if (this.connections.has(copilotId)) {
        this.connections.delete(copilotId);
        
        // Update flow connections
        if (this.flowInId === copilotId) {
          this.flowInId = null;
        }
        if (this.flowOutId === copilotId) {
          this.flowOutId = null;
        }
        
        // Update neighbor sets
        if (this.inNeighbors) {
          this.inNeighbors.delete(copilotId);
        }
        if (this.outNeighbors) {
          this.outNeighbors.delete(copilotId);
        }
        
        console.log(`Copilot ${this.id} updated due to ${copilotId} unlinking`);
      }
    });
    
    // Listen for connection manager events
    const connectionManager = getConnectionManager();
    connectionManager.eventBus.on('connection-removed', (data) => {
      const { connection } = data;
      
      // Update this copilot if it was involved in the removed connection
      if (connection.from.id === this.id || connection.to.id === this.id) {
        const otherId = connection.from.id === this.id ? connection.to.id : connection.from.id;
        
        // Remove from local connections if it exists
        if (this.connections.has(otherId)) {
          const existing = this.connections.get(otherId);
          if (Array.isArray(existing)) {
            // Remove the specific connection from the array
            const filtered = existing.filter(conn => conn.lineId !== connection.lineId);
            if (filtered.length === 0) {
              this.connections.delete(otherId);
            } else {
              this.connections.set(otherId, filtered);
            }
          } else if (existing.lineId === connection.lineId) {
            this.connections.delete(otherId);
          }
        }
      }
    });
  }
  
  show() {
    const r = this.fab.getBoundingClientRect();
    const w = this.panel.offsetWidth || 420;
    const h = this.panel.offsetHeight || 320;
    
    // Get Node Board bounds to constrain panels within it
    const nodeBoard = document.getElementById('nodeBoard');
    const nodeBoardRect = nodeBoard ? nodeBoard.getBoundingClientRect() : null;
    
    let maxRight, maxBottom;
    if (nodeBoardRect) {
      // Constrain to Node Board area
      maxRight = nodeBoardRect.right - 4;
      maxBottom = nodeBoardRect.bottom - 4;
    } else {
      // Fallback to viewport if Node Board not found
      maxRight = window.innerWidth - 4;
      maxBottom = window.innerHeight - 4;
    }
    
    const px = Math.max(4, Math.min(maxRight - w, r.left));
    const minTop = nodeBoardRect ? nodeBoardRect.top + 8 : 8;
    const py = Math.max(minTop, Math.min(maxBottom - h, r.top - h - 12));
    
    this.panel.style.left = px + 'px';
    this.panel.style.top = py + 'px';
    
    // Update aria-hidden BEFORE removing hidden class to prevent focus conflicts
    this.panel.setAttribute('aria-hidden', 'false');
    this.panel.classList.remove('hidden');
    
    requestAnimationFrame(() => {
      this.panel.classList.add('show');
      try { this.updateKeyStatusBadge(); } catch {}
      this.#positionFabUnderPanel();
      if (!this._fabAlignOnResize) { this._fabAlignOnResize = () => { if (!this.panel.classList.contains('hidden')) this.#positionFabUnderPanel(); }; }
      window.addEventListener('resize', this._fabAlignOnResize);
    });
  }
  hide() { 
    // Move focus back to the FAB button before hiding
    if (document.activeElement && this.panel.contains(document.activeElement)) {
      this.fab.focus();
    }
    
    this.panel.classList.remove('show'); 
    this.panel.setAttribute('aria-hidden', 'true');
    setTimeout(() => { 
      this.panel.classList.add('hidden'); 
      if (this._fabAlignOnResize) window.removeEventListener('resize', this._fabAlignOnResize); 
    }, 180); 
  }
  addUser(text, author) {
    const div = document.createElement('div');
  div.className = 'bubble user user-bubble';
    const name = (author && author.trim()) ? author : 'Användare';
    div.innerHTML = `<div class="msg-author">${escapeHtml(name)}</div><div class="msg-text"></div>`;
    const msgEl = div.querySelector('.msg-text');
    msgEl.textContent = text;
    this.msgEl.appendChild(div);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
  }
  addAssistant(text, author) {
    const el = document.createElement('div');
    el.className = 'assistant';
    const name = (author && author.trim()) ? author : this.name;
    el.innerHTML = `<div class=\"msg-author\">${escapeHtml(name)}</div><div class=\"msg-text\"></div>`;
    const msgEl = el.querySelector('.msg-text');
    if ((this.renderMode || 'raw') === 'md' && window.markdownit) {
      const mdloc = window.markdownit({ html:false, linkify:true, breaks:true });
      msgEl.innerHTML = mdloc.render(text || '');
    } else {
      msgEl.textContent = text || '';
    }
    this.msgEl.appendChild(el);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
  }
  renderAssistantReply(text, author) { if ((this.renderMode || 'raw') === 'md') { this.addAssistant(text, author); } else { this.#renderTyping(text); } }
  #renderTyping(text) {
    const el = document.createElement('div');
    el.className = 'assistant typing';
    el.innerHTML = `<div class=\"msg-author\">${escapeHtml(this.name)}</div><div class=\"msg-text\"></div>`;
    const msgEl = el.querySelector('.msg-text');
    this.msgEl.appendChild(el);
    this.msgEl.scrollTop = this.msgEl.scrollHeight;
    const len = (text || '').length;
    if (len === 0) { el.classList.remove('typing'); return; }
    const targetMs = Math.max(0, 4000 - Math.round((Math.max(0, Math.min(100, this.typingSpeed)) / 100) * 4000));
    const frameMs = 16; const frames = Math.max(1, Math.round(targetMs / frameMs));
    const chunk = Math.max(1, Math.ceil(len / frames));
    let i = 0; const timer = setInterval(() => {
      i = Math.min(len, i + chunk);
      msgEl.textContent = text.slice(0, i);
      this.msgEl.scrollTop = this.msgEl.scrollHeight;
      if (i >= len) { clearInterval(timer); el.classList.remove('typing'); if ((this.renderMode||'raw')==='md' && window.markdownit) { const mdloc = window.markdownit({html:false,linkify:true,breaks:true}); msgEl.innerHTML = mdloc.render(text||''); } else { msgEl.textContent = text||''; } }
    }, frameMs);
  }
  async sendFromInput() {
    const msg = (this.inputEl.value || '').trim();
    if (!msg) return;
    if (window.PauseManager && window.PauseManager.isPaused && window.PauseManager.isPaused()) {
      try { const nm = (window.getGlobalUserName || (() => 'Du'))(); this.addUser(msg, nm); }
      catch { this.addUser(msg); }
      this.inputEl.value = '';
      if (this._convId) { ConversationManager.enqueueUser(this, msg); } else { window.PauseManager.queueIndependent?.(this.id, msg); }
      toast('Flöde pausat – meddelandet köades.', 'warn');
      return;
    }
    try { const nm = (window.getGlobalUserName || (() => 'Du'))(); this.addUser(msg, nm); }
    catch { this.addUser(msg); }
    this.inputEl.value = '';
    if (this._stagedFiles && this._stagedFiles.length) {
      const form = new FormData();
      for (const f of this._stagedFiles) form.append('files', f, f.name);
      form.append('maxChars', '60000');
      try {
        const resU = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/upload`, { method: 'POST', body: form });
        const dataU = await resU.json();
        if (!resU.ok) {
          toast(dataU.error || 'Kunde inte läsa bilagor', 'error');
        } else {
          const count = dataU.count || (dataU.items ? dataU.items.length : 0);
          const names = (dataU.items || []).map(it => it.name).join(', ');
          this.addAssistant(`(Läste ${count} bilaga(or): ${names})`);
          for (const it of (dataU.items || [])) {
            const label = `Innehåll från ${it.name}${it.truncated ? ' (trunkerad)' : ''}`;
            this.history.push({ role: 'system', content: `${label}:\n\n${it.text || ''}` });
          }
          try { this._saveHistory(); } catch {}
        }
      } catch (e) {
        console.error(e);
        toast('Nätverksfel vid bilagor', 'error');
      } finally {
        this._stagedFiles = [];
        this.#renderAttachments();
      }
    }
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
  const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '3000', 10) || 3000)));
    try {
      let messages = [...this.history, { role: 'user', content: msg }];
      if (this.useRole && (this.role || '').trim()) { messages = [{ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }, ...messages]; }
      else if (!this.useRole && (this.role || '').trim()) { messages = [{ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }, ...messages]; }
      const model = this.model || 'gpt-5-mini';
      const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
      const body = { message: msg, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
      const webEnable = InternetHub.isLinked(this.id);
      if (webEnable) {
        const maxResults = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
        const perPage = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || '3000', 10);
        const totalCap = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || '9000', 10);
        body.web = { enable: true, maxResults: (Number.isFinite(maxResults) && maxResults > 0) ? maxResults : 3, perPageChars: (Number.isFinite(perPage) && perPage >= 500) ? perPage : 3000, totalCharsCap: (Number.isFinite(totalCap) && totalCap >= 1000) ? totalCap : 9000 };
      }
      body.max_tokens = maxTok;
      if (webEnable) InternetHub.setActive(true);
      const res = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
      if (!res.ok) { this.addAssistant((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
  const reply = data.reply || '(inget svar)';
  this.renderAssistantReply(reply);
      if (data && Array.isArray(data.citations) && data.citations.length) {
        const cites = document.createElement('div');
        cites.className = 'assistant cites';
        const items = data.citations.map((c, i) => `<a href="${escapeHtml(c.url||'')}" target="_blank" rel="noopener">[${i+1}] ${escapeHtml(c.title||c.url||'Källa')}</a>`).join(' ');
        cites.innerHTML = `<div class="msg-author">Källor</div><div class="msg-text">${items}</div>`;
        this.msgEl.appendChild(cites);
      } else {
        const lastUser = msg.toLowerCase();
        if (/(länk|lank|käll|källa|kalla)/.test(lastUser)) {
          const linked = InternetHub.isLinked(this.id);
          if (!linked) toast('Inga källor returnerades. Koppla denna copilot till Internet-noden för att få klickbara länkar.', 'warn');
        }
      }
  // Fan-out this copilot's reply to linked outputs (user, other copilots, sections)
  try { await this.#routeReplyFanOut(reply, undefined, { omitSelf: true }); } catch {}
  if (!this._convId) {
        this.history.push({ role: 'user', content: msg });
        if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
  try { this._saveHistory(); } catch {}
      } else {
        if (data && data.reply) ConversationManager.recordAssistant(this._convId, data.reply);
        this.panel.classList.remove('active-speaking');
      }
    } catch (e) { this.addAssistant('Nätverksfel.'); }
    finally { InternetHub.setActive(false); }
  }
  async sendQueued(msg) {
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
  const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '3000', 10) || 3000)));
    try {
      let messages = [...this.history, { role: 'user', content: msg }];
      if (this.useRole && (this.role || '').trim()) { messages = [{ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }, ...messages]; }
      else if (!this.useRole && (this.role || '').trim()) { messages = [{ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }, ...messages]; }
      const model = this.model || 'gpt-5-mini';
      const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
      const body = { message: msg, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
      const webEnable = InternetHub.isLinked(this.id);
      if (webEnable) {
        const maxResults = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
        const perPage = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || '3000', 10);
        const totalCap = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || '9000', 10);
        body.web = { enable: true, maxResults: (Number.isFinite(maxResults) && maxResults > 0) ? maxResults : 3, perPageChars: (Number.isFinite(perPage) && perPage >= 500) ? perPage : 3000, totalCharsCap: (Number.isFinite(totalCap) && totalCap >= 1000) ? totalCap : 9000 };
      }
      body.max_tokens = maxTok;
      if (webEnable) InternetHub.setActive(true);
      const res = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
      if (!res.ok) { this.renderAssistantReply((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
      const reply = data.reply || '(inget svar)';
      this.renderAssistantReply(reply);
      this.history.push({ role: 'user', content: msg });
  if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
  try { this._saveHistory(); } catch {}
    } catch { this.addAssistant('Nätverksfel.'); }
    finally { InternetHub.setActive(false); }
  }
  async generateReply(messages) {
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
  const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '3000', 10) || 3000)));
    const model = this.model || 'gpt-5-mini';
    const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
    let finalMsgs = messages;
    if (this._convId) {
      const sys = [];
      if (this.useRole && (this.role || '').trim()) { sys.push({ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }); }
      else if (!this.useRole && (this.role || '').trim()) { sys.push({ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }); }
      const myTopic = (this.topic || '').trim();
      if (myTopic) sys.push({ role: 'system', content: `Håll dig till ämnet: ${myTopic}.` });
      finalMsgs = [...sys, ...messages];
    }
    const body = { message: finalMsgs[finalMsgs.length-1]?.content || '', messages: finalMsgs, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined) };
    const webEnable = InternetHub.isLinked(this.id);
    if (webEnable) {
      const maxResults = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
      const perPage = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || '3000', 10);
      const totalCap = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || '9000', 10);
      body.web = { enable: true, maxResults: (Number.isFinite(maxResults) && maxResults > 0) ? maxResults : 3, perPageChars: (Number.isFinite(perPage) && perPage >= 500) ? perPage : 3000, totalCharsCap: (Number.isFinite(totalCap) && totalCap >= 1000) ? totalCap : 9000 };
    }
    body.max_tokens = maxTok;
    if (webEnable) InternetHub.setActive(true);
    const res = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null; let rawText = '';
    try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
    if (!res.ok) { InternetHub.setActive(false); throw new Error((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); }
    InternetHub.setActive(false);
    return (data && data.reply) || '(inget svar)';
  }
  #neighbors() {
    const arr = [];
    try {
      this.connections.forEach((val, key) => {
        if (key === InternetHub.LINK_KEY) return;
        if (typeof key === 'number') { const inst = CopilotManager.instances.get(key); if (inst) arr.push(inst); }
      });
    } catch {}
    return arr;
  }
  setBusy(on) { try { this.panel.classList.toggle('busy', !!on); this.fab.classList.toggle('busy', !!on); } catch {} }
  #getLinkLineIdWith(otherId, dir = 'out') {
    try {
      const conn = this.connections.get(otherId);
      if (!conn) return null;
      if (Array.isArray(conn)) { const pick = conn.find(r => (dir === 'out' ? (r.from === this.id) : (r.to === this.id))) || conn[0]; return pick?.lineId || null; }
      return conn.lineId || null;
    } catch { return null; }
  }
  async #routeReplyFanOut(text, userInst, options = {}) {
    if (!options || !options.omitSelf) this.renderAssistantReply(text);
    try {
  const outs = Array.from(this.outNeighbors || []);
      for (const o of outs) {
        if (o === 'user') {
          try { const UserNode = getUserApi(); const lid = UserNode?.getLinkLineIdFor?.(this.id, 'in'); if (lid) ConnectionLayer.pulse(lid, { duration: 1200 }); } catch {}
          const u = userInst || (getUserApi()?.ensure ? getUserApi().ensure() : null);
          if (u && typeof u.addAssistantLocal === 'function') u.addAssistantLocal(text, this.name);
          continue;
        }
        if (Number.isInteger(o)) {
          const dest = CopilotManager.instances.get(o);
          if (dest && dest.id !== this.id) {
            try { const lid = this.#getLinkLineIdWith(dest.id, 'out'); if (lid) ConnectionLayer.pulse(lid, { duration: 1200 }); } catch {}
            await dest.receiveFromCopilot(text, this.id, 0, { passThrough: false, userInst });
          }
        }
        // Section fan-out: check synthetic connection entries stored in this.connections with keys like 'section:<key>'
        if (typeof o === 'string' && o.startsWith('section:')) {
          const key = o.split(':')[1];
          try { const lid = this.#getLinkLineIdWith(`section:${key}`, 'out'); if (lid) ConnectionLayer.pulse(lid, { duration: 1200 }); } catch {}
          try { const BoardSections = window?.BoardSections || (await import('../graph/board-sections.js')).BoardSections; BoardSections.append(key, text, { author: this.name, renderMode: this.renderMode }); } catch {}
        }
      }
    } catch {}
  }
  async receiveFromUser(text, userInst, opts = {}) {
    const sysSeed = Array.isArray(opts.seed) ? opts.seed : [];
    if (!this._seededFromUser) this._seededFromUser = true;
    if (sysSeed.length) { try { this.history.push(...sysSeed); } catch {} }
  try { const nm = (window.getGlobalUserName || (() => 'Du'))(); this.addUser(text, nm); }
  catch { this.addUser(text, 'Användare'); }
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
  const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '3000', 10) || 3000)));
    let messages = [...this.history, { role: 'user', content: text }];
    if (this.useRole && (this.role || '').trim()) messages = [{ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` }, ...messages];
    else if (!this.useRole && (this.role || '').trim()) messages = [{ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' }, ...messages];
    const model = this.model || 'gpt-5-mini';
    const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
    const body = { message: text, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined), max_tokens: maxTok };
    const webEnable = InternetHub.isLinked(this.id);
    if (webEnable) {
      const maxResults = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
      const perPage = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || '3000', 10);
      const totalCap = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || '9000', 10);
      body.web = { enable: true, maxResults: (Number.isFinite(maxResults) && maxResults > 0) ? maxResults : 3, perPageChars: (Number.isFinite(perPage) && perPage >= 500) ? perPage : 3000, totalCharsCap: (Number.isFinite(totalCap) && totalCap >= 1000) ? totalCap : 9000 };
    }
    try { const UserNode = getUserApi(); const lid = UserNode?.getLinkLineIdFor?.(this.id); if (lid) ConnectionLayer.pulse(lid, { duration: 1200 }); } catch {}
    this.setBusy(true);
    if (webEnable) InternetHub.setActive(true);
    try {
      const res = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
    if (!res.ok) { this.addAssistant((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
      const reply = (data && data.reply) || '(inget svar)';
      this.setBusy(false);
  this.#routeReplyFanOut(reply, userInst);
  this.history.push({ role: 'user', content: text });
  if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
  try { this._saveHistory(); } catch {}
    } catch { this.addAssistant('Nätverksfel.'); }
    finally { this.setBusy(false); if (webEnable) InternetHub.setActive(false); }
  }
  async receiveFromCopilot(text, fromId, hop = 0, options = {}) {
    const from = CopilotManager.instances.get(fromId);
    const author = from ? from.name : `Copilot ${fromId}`;
    this.addUser(text, author);
    const instTok = parseInt(localStorage.getItem(`examai.copilot.${this.id}.max_tokens`) || '', 10);
    const maxTok = Math.max(1000, Math.min(30000, (Number.isFinite(instTok) && instTok) ? instTok : (parseInt(localStorage.getItem('examai.max_tokens') || '1000', 10) || 1000)));
    // Build message list with this copilot's own system role/topic so chains respect per-node persona
    let messages = [...this.history, { role: 'user', content: text }];
    const sysMsgs = [];
    if (this.useRole && (this.role || '').trim()) {
      sysMsgs.push({ role: 'system', content: `Ignorera tidigare rollinstruktioner. Ny roll: ${this.role.trim()}` });
    } else if (!this.useRole && (this.role || '').trim()) {
      sysMsgs.push({ role: 'system', content: 'Ignorera tidigare rollinstruktioner. Använd neutral roll.' });
    }
    const myTopic = (this.topic || '').trim();
    if (myTopic) sysMsgs.push({ role: 'system', content: `Håll dig till ämnet: ${myTopic}.` });
    if (sysMsgs.length) messages = [...sysMsgs, ...messages];
    const model = this.model || 'gpt-5-mini';
    const perKey = localStorage.getItem(`examai.copilot.${this.id}.key`);
    const body = { message: text, messages, model, apiKey: (perKey || localStorage.getItem('examai.openai.key') || undefined), max_tokens: maxTok };
    const webEnable = InternetHub.isLinked(this.id);
    if (webEnable) {
      const maxResults = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_max_results`) || '3', 10);
      const perPage = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_per_page_chars`) || '3000', 10);
      const totalCap = parseInt(localStorage.getItem(`examai.copilot.${this.id}.web_total_chars_cap`) || '9000', 10);
      body.web = { enable: true, maxResults: (Number.isFinite(maxResults) && maxResults > 0) ? maxResults : 3, perPageChars: (Number.isFinite(perPage) && perPage >= 500) ? perPage : 3000, totalCharsCap: (Number.isFinite(totalCap) && totalCap >= 1000) ? totalCap : 9000 };
    }
    try { const lid = this.#getLinkLineIdWith(fromId, 'in'); if (lid) ConnectionLayer.pulse(lid, { duration: 1200 }); } catch {}
    this.setBusy(true);
    if (webEnable) InternetHub.setActive(true);
    try {
      const res = await fetch(`${window.API_BASE_URL || 'http://localhost:8000'}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data = null; let rawText = '';
      try { data = await res.json(); } catch { try { rawText = await res.text(); } catch {} }
  if (!res.ok) { this.addAssistant((data && (data.error || data.message)) || rawText || 'Fel vid förfrågan.'); return; }
      const reply = (data && data.reply) || '(inget svar)';
      this.setBusy(false);
      this.#routeReplyFanOut(reply, options.userInst);
  this.history.push({ role: 'user', content: text });
  if (data && data.reply) this.history.push({ role: 'assistant', content: data.reply });
  try { this._saveHistory(); } catch {}
    } catch { this.addAssistant('Nätverksfel.'); }
    finally { this.setBusy(false); if (webEnable) InternetHub.setActive(false); }
  }
}

export const CopilotManager = (() => {
  let nextId = 1;
  const instances = new Map();
  function add(forceId) {
    const usingForced = Number.isInteger(forceId);
    const id = usingForced ? forceId : nextId++;
    // If we are restoring with explicit IDs, advance nextId so subsequent adds don't collide (e.g. after restore [1..N])
    if (usingForced) {
      nextId = Math.max(nextId, id + 1);
    }
    // Compute next default name: CoWorker N (avoid duplicates among existing CoWorkers)
    const base = 'CoWorker';
    const used = new Set();
    try {
      instances.forEach(inst => {
        const n = (inst && inst.name) ? String(inst.name) : '';
        const m = n.match(/^CoWorker\s+(\d+)$/i);
        if (m) used.add(parseInt(m[1], 10));
      });
    } catch {}
    let n = 1; while (used.has(n)) n++;
    const defaultName = `${base} ${n}`;
    const cp = new CopilotInstance(id, { name: defaultName });
    instances.set(id, cp);
    try { GraphPersistence.registerCopilot(id); } catch {}
    return cp;
  }
  return { add, instances };
})();
