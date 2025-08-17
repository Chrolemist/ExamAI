// UserNode.js - Clean modular implementation extending BaseNode

import { escapeHtml, toast } from '../ui.js';
import { BaseNode } from '../core/base-node.js';
import { ConnectionLayer } from '../graph/connection-layer.js';
import { Link } from '../graph/link.js';
import { ConnectionFactory } from '../core/connection-factory.js';
import { ConversationManager } from '../graph/conversation-manager.js';
import { IORegistry } from '../graph/io-registry.js';
import { GraphPersistence } from '../graph/graph-persistence.js';
import { NodeBoard } from '../graph/node-board.js';
import { BoardSections } from '../graph/board-sections.js';

function getCopilotManager() {
  try { return window.CopilotManager || null; } catch { return null; }
}

function getAPI() {
  return window.API_BASE_URL || 'http://localhost:8000';
}

export class UserNode extends BaseNode {
  constructor() {
    super('user', 'user');
    
    // Storage keys - modular like CopilotInstance
    this.KEY_NAME = 'examai.user.name';
    this.KEY_FONT = 'examai.user.font';
    this.KEY_COLOR = 'examai.user.bubbleColor';
    this.KEY_ALPHA = 'examai.user.bubbleAlpha';
    this.KEY_BG_VISIBLE = 'examai.user.bubbleBgVisible';
    this.KEY_HISTORY = 'examai.user.history';
    this.KEY_POSITION = 'examai.user.position';
    
    // State management
    this.history = this.loadHistory();
    this._staged = []; // For file attachments
    this._linked = new Set(); // copilot ids
    this._linkLines = new Map(); // copilotId -> connection records
    this._linkedSections = new Set(); // section keys
    this._sectionLinkLines = new Map(); // section connection records
    this._lastSentIndex = -1;
    this._recentDragTs = 0;
    this._ioIds = new Map();
    
    // Create DOM elements
    this.fab = this.#createFab();
    this.panel = this.#createPanel();
    this.connPoints = Array.from(this.fab.querySelectorAll('.conn-point'));
    
    // Initialize functionality
    console.log('UserNode: About to wire connection points, fab:', this.fab);
    this.#wireFabConnections(); // Use same method as CopilotInstance
    this.#setupPanelDrag();
    this.#wireContextMenu();
    this.#initSettings();
  }

  // Settings management - clean like CopilotInstance
  getName() {
    try { return localStorage.getItem(this.KEY_NAME) || 'Du'; } catch { return 'Du'; }
  }
  
  setName(v) {
    const val = (v || '').trim() || 'Du';
    try { localStorage.setItem(this.KEY_NAME, val); } catch {}
    window.dispatchEvent(new CustomEvent('examai:userNameChanged', { detail: { name: val } }));
  }
  
  getFont() { return localStorage.getItem(this.KEY_FONT) || 'system-ui, sans-serif'; }
  setFont(v) { try { localStorage.setItem(this.KEY_FONT, v || 'system-ui, sans-serif'); } catch {} }
  getColor() { return localStorage.getItem(this.KEY_COLOR) || '#1e293b'; }
  setColor(v) { try { localStorage.setItem(this.KEY_COLOR, v || '#1e293b'); } catch {} }
  
  getAlpha(){
    try { const v = parseFloat(localStorage.getItem(this.KEY_ALPHA)); if (Number.isFinite(v)) return Math.max(0, Math.min(1, v)); } catch {}
    return 0.10;
  }
  
  setAlpha(v){
    const n = Math.max(0, Math.min(1, Number(v)||0));
    try { localStorage.setItem(this.KEY_ALPHA, String(n)); } catch {}
  }
  
  getBgVisible(){
    try { const v = localStorage.getItem(this.KEY_BG_VISIBLE); if (v===null) return true; return v==='1'; } catch { return true; }
  }
  
  setBgVisible(vis){
    try { localStorage.setItem(this.KEY_BG_VISIBLE, vis ? '1':'0'); } catch {}
  }
  
  loadHistory() {
    try { 
      const raw = localStorage.getItem(this.KEY_HISTORY); 
      const arr = JSON.parse(raw || '[]'); 
      return Array.isArray(arr) ? arr : []; 
    } catch { 
      return []; 
    }
  }
  
  saveHistory(arr) {
    try { localStorage.setItem(this.KEY_HISTORY, JSON.stringify(arr || [])); } catch {}
  }

  // Node Board bounds - key fix for positioning
  #getNodeBoardBounds() {
    const nodeBoard = document.getElementById('nodeBoard');
    if (!nodeBoard) return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    
    const rect = nodeBoard.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top, 
      right: rect.right,
      bottom: rect.bottom
    };
  }

  show() {
    if (!this.panel) {
      console.error('No panel found!');
      return;
    }
    
    this.panel.classList.remove('hidden');
    this.panel.classList.add('show');
    this.panel.setAttribute('aria-hidden', 'false');
    
    // Get Node Board bounds instead of viewport - CRITICAL FIX
    const bounds = this.#getNodeBoardBounds();
    
    // Try to restore saved position first
    let x, y;
    try {
      const saved = localStorage.getItem(this.KEY_POSITION);
      if (saved) {
        const pos = JSON.parse(saved);
        x = pos.x;
        y = pos.y;
      }
    } catch {}
    
    // Use defaults if no saved position
    if (x === undefined || y === undefined) {
      x = bounds.left + 100;
      y = bounds.top + 100;
    }
    
    // CRITICAL: Ensure panel stays within Node Board bounds
    const panelRect = this.panel.getBoundingClientRect();
    const constrainedX = Math.max(bounds.left, Math.min(x, bounds.right - panelRect.width));
    const constrainedY = Math.max(bounds.top, Math.min(y, bounds.bottom - panelRect.height));
    
    this.panel.style.left = constrainedX + 'px';
    this.panel.style.top = constrainedY + 'px';
    
    // Save the constrained position
    this.#savePosition(constrainedX, constrainedY);
  }

  hide() {
    if (!this.panel) return;
    
    // Remove focus from any focused element within the panel before hiding
    const activeElement = document.activeElement;
    if (activeElement && this.panel.contains(activeElement)) {
      activeElement.blur();
    }
    
    this.panel.classList.remove('show');
    this.panel.classList.add('hidden');
    this.panel.setAttribute('aria-hidden', 'true');
  }

  #savePosition(x, y) {
    try {
      localStorage.setItem(this.KEY_POSITION, JSON.stringify({ x, y }));
    } catch {}
  }

  #setupPanelDrag() {
    const dragHandle = this.panel.querySelector('[data-role="dragHandle"]');
    if (!dragHandle) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      this._recentDragTs = Date.now();
      this.panel.style.cursor = 'grabbing';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;
      
      // CRITICAL: Constrain to Node Board bounds during drag
      const bounds = this.#getNodeBoardBounds();
      const panelRect = this.panel.getBoundingClientRect();
      
      newLeft = Math.max(bounds.left, Math.min(newLeft, bounds.right - panelRect.width));
      newTop = Math.max(bounds.top, Math.min(newTop, bounds.bottom - panelRect.height));
      
      this.panel.style.left = newLeft + 'px';
      this.panel.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      this.panel.style.cursor = '';
      
      // Save final position
      const rect = this.panel.getBoundingClientRect();
      this.#savePosition(rect.left, rect.top);
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    dragHandle.addEventListener('mousedown', onMouseDown);
  }

  #createFab() {
    const b = document.createElement('button');
    b.className = 'fab user-node';
    b.title = this.getName();
    b.innerHTML = '<div class="user-avatar">👤</div>';
    b.setAttribute('data-user-id', this.id); // Add identifier for BaseNode
    
    // Position within Node Board like CopilotInstance
    b.style.position = 'absolute';
    b.style.left = '74px';
    b.style.top = '40px';
    
    // Add connection points on FAB
    ['t','b','l','r'].forEach(side => {
      const p = document.createElement('div');
      p.className = 'conn-point';
      p.setAttribute('data-side', side);
      b.appendChild(p);
    });
    
    // Add a floating label above the FAB showing the user name
    const lbl = document.createElement('div');
    lbl.className = 'fab-label';
    lbl.textContent = this.getName();
    b.appendChild(lbl);
    
    const nodeBoard = document.getElementById('nodeBoard');
    if (nodeBoard) {
      nodeBoard.appendChild(b);
    } else {
      document.body.appendChild(b);
    }
    
    try { NodeBoard.bind?.(b); } catch {}
    
    // Toggle panel (ignore clicks immediately after a drag)
    b.addEventListener('click', () => {
      const now = Date.now();
      const lastDrag = Math.max(this._recentDragTs || 0, b._lastDragTime || 0);
      if (now - lastDrag < 300) return;
      
      if (this.panel.classList.contains('hidden')) {
        this.show();
      } else {
        this.hide();
      }
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
        <div class="meta"><div class="name">${escapeHtml(this.getName())}</div></div>
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
        <label>Transparens
          <input type="range" min="0" max="100" step="1" data-role="alpha" />
          <span data-role="alphaVal">10%</span>
        </label>
        <div style="margin:8px 0; display:flex; align-items:center; gap:8px">
          <button type="button" class="icon-btn" data-action="toggleBubbleBg" title="Visa/Dölj bubbelfond" aria-pressed="true">👁️</button>
          <small style="opacity:.8">Visa bakgrund</small>
        </div>
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
    
    document.body.appendChild(sec);
    
    // Wire up panel functionality
    this.#wirePanel(sec);
    
    // Render any previously saved history
    try { this.#renderHistoryInto(sec); } catch {}
    
    return sec;
  }

  #wirePanel(sec) {
    // Close button
    sec.querySelector('[data-action="close"]').addEventListener('click', () => this.hide());
    
    // Clear chat button
    const clearBtn = sec.querySelector('[data-action="clear"]');
    clearBtn?.addEventListener('click', () => {
      const box = sec.querySelector('[data-role="messages"]');
      if (box) box.innerHTML = '';
      this.history = [];
      this._lastSentIndex = -1;
      try { this.saveHistory(this.history); } catch {}
      toast('Användarchatten rensad.');
    });
    
    // Settings toggle
    const settingsEl = sec.querySelector('[data-role="settings"]');
    const settingsBtn = sec.querySelector('[data-action="settings"]');
    settingsBtn?.addEventListener('click', () => settingsEl?.classList.toggle('collapsed'));
    
    // Form submission
    const form = sec.querySelector('[data-role="composer"]');
    const input = sec.querySelector('[data-role="input"]');
    
    // Auto-resize textarea
    const INPUT_MIN_H = 40;
    const INPUT_MAX_H = 300;
    const autoResize = () => {
      input.style.height = 'auto';
      const next = Math.max(INPUT_MIN_H, Math.min(INPUT_MAX_H, input.scrollHeight));
      input.style.height = next + 'px';
    };
    input.addEventListener('input', autoResize);
    autoResize();
    
    // Enter to send, Shift+Enter for newline
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }
    });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = (input.value || '').trim();
      if (!msg) return;
      
      this.addUserLocal(msg);
      input.value = '';
      input.style.height = INPUT_MIN_H + 'px';
      
      // If linked, dispatch unsent user messages
      try { await this.#dispatchUnsentToLinked(); } catch {}
    });

    // Wire up file drag & drop
    this.#wireFileDropzone(sec, input);
  }

  #wireFileDropzone(sec, input) {
    const attachBar = sec.querySelector('[data-role="attachments"]');
    const targets = [sec, input];
    
    const highlight = (on) => targets.forEach(t => t.classList.toggle?.('drag', !!on));
    
    const renderAttach = () => {
      if (!attachBar) return;
      if (!this._staged.length) { 
        attachBar.classList.add('hidden'); 
        attachBar.innerHTML = ''; 
        return; 
      }
      
      attachBar.classList.remove('hidden'); 
      attachBar.innerHTML = '';
      
      this._staged.forEach((it, idx) => {
        const chip = document.createElement('div'); 
        chip.className = 'attachment-chip';
        const name = document.createElement('span'); 
        name.className = 'name'; 
        name.textContent = `${it.name}`;
        const rm = document.createElement('button'); 
        rm.className = 'rm'; 
        rm.type = 'button'; 
        rm.title = 'Ta bort'; 
        rm.textContent = '\u00D7';
        rm.addEventListener('click', () => { 
          this._staged.splice(idx, 1); 
          renderAttach(); 
        });
        chip.appendChild(name); 
        chip.appendChild(rm); 
        attachBar.appendChild(chip);
      });
    };

    const onDrop = async (e) => {
      e.preventDefault(); 
      highlight(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;

      const API_BASE_URL = getAPI();
      
      // Upload to preview extracted text
      const formU = new FormData();
      files.forEach(f => formU.append('files', f, f.name));
      formU.append('maxChars', '40000');
      
      try {
        const resU = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formU });
        const dataU = await resU.json();
        
        if (!resU.ok) { 
          toast(dataU.error || 'Kunde inte läsa bilagor', 'error'); 
          return; 
        }
        
        const items = Array.isArray(dataU.items) ? dataU.items : [];
        
        for (const it of items) {
          const previewTitle = `Förhandsvisning: ${it.name}${it.truncated ? ' (trunkerad)' : ''}`;
          const snippet = (it.text || '').slice(0, 2000);
          const box = this.panel.querySelector('[data-role="messages"]');
          const div = document.createElement('div');
          div.className = 'assistant';
          div.innerHTML = `<div class="msg-author">${previewTitle}</div><div class="msg-text"></div>`;
          div.querySelector('.msg-text').textContent = snippet;
          box.appendChild(div);
          box.scrollTop = box.scrollHeight;
          
          this.history.push({ role: 'system', content: `${previewTitle}:\n\n${it.text || ''}` });
        }
        
        this.saveHistory(this.history);
        
        files.forEach(f => { 
          if (!this._staged.find(x => x.name === f.name && x.size === f.size)) {
            this._staged.push({ name: f.name, size: f.size }); 
          }
        });
        
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
  }

  addUserLocal(text) {
    const box = this.panel.querySelector('[data-role="messages"]');
    const div = document.createElement('div');
    div.className = 'bubble user user-bubble';
    div.innerHTML = `<div class="msg-author">${escapeHtml(this.getName())}</div><div class="msg-text"></div>`;
    div.querySelector('.msg-text').textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    
    this.history.push({ role: 'user', content: text });
    this.saveHistory(this.history);
  }

  addAssistantLocal(text, authorName) {
    const box = this.panel.querySelector('[data-role="messages"]');
    const div = document.createElement('div');
    div.className = 'assistant';
    const who = (authorName && authorName.trim()) ? authorName : 'COworker';
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
    this.history.push({ role: 'assistant', content: text || '', author: who });
    this.saveHistory(this.history);
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
        div.innerHTML = `<div class="msg-author">${escapeHtml(this.getName())}</div><div class="msg-text"></div>`;
        div.querySelector('.msg-text').textContent = m.content || '';
        box.appendChild(div);
      } else {
        const div = document.createElement('div');
        div.className = 'assistant';
        let who = 'COworker';
        if (m.role === 'system') who = 'System';
        else if (m.author && String(m.author).trim()) who = String(m.author).trim();
        
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

  #unsentUserMessages() {
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
    const CopilotManager = getCopilotManager();
    
    if (!CopilotManager) return;
    
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
            const lid = rec?.lineId; 
            if (lid) ConnectionLayer.pulse(lid, { duration: 1200 });
          } catch {}
          
          try { 
            BoardSections.append?.(key, m.content || '', { 
              author: this.getName(), 
              renderMode: localStorage.getItem('examai.render_mode') || 'raw' 
            }); 
          } catch {}
        }
      }
    }
    
    this._lastSentIndex = this.history.length - 1;
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
      try { 
        if (window.IORegistry) {
          const id = window.IORegistry.register(pt, { 
            nodeType: 'user', 
            nodeId: String(this.id), 
            side: pt.getAttribute('data-side') || 'x', 
            index: idx 
          }, { attachToggle: true }); 
          ioIds.set(pt, id); 
        }
      } catch {}
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
        const fromIoId = (window.IORegistry?.getByEl && window.IORegistry.getByEl(startPointEl)?.ioId) || `user:${this.id}:${ss}:0`;
        const toIoId = `section:${secKey}:r:0`;
        const lineId = `link_${fromIoId}__${toIoId}`;
        
        const rec = Link.create({ lineId, startEl: startPointEl, endEl: endPt, from: this.id, to: `section:${secKey}` });
  const key = `section:${secKey}`;
  // Back-compat: keep in _linkLines map under synthetic key
  if (!this._linkLines) this._linkLines = new Map();
  const mine = this._linkLines.get(key);
  if (mine) { if (Array.isArray(mine)) mine.push(rec); else this._linkLines.set(key, [mine, rec]); } else { this._linkLines.set(key, [rec]); }
  // New: track in dedicated section structures so sending appends to the section
  if (!this._sectionLinkLines) this._sectionLinkLines = new Map();
  const secArr = this._sectionLinkLines.get(secKey);
  if (secArr) { if (Array.isArray(secArr)) secArr.push(rec); else this._sectionLinkLines.set(secKey, [secArr, rec]); }
  else { this._sectionLinkLines.set(secKey, [rec]); }
  if (!this._linkedSections) this._linkedSections = new Set();
  this._linkedSections.add(secKey);
        try { GraphPersistence.addLink({ fromType: 'user', fromId: this.id, fromSide: ss, toType: 'section', toId: secKey, toSide: 'r' }); } catch {}
        return;
      }
      
      // Internet hub
      const hubEl = endPt.closest('.internet-hub');
      if (hubEl) {
        try {
          if (window.InternetHub && window.InternetHub.linkUser) {
            window.InternetHub.linkUser(this, startPointEl, endPt);
          }
        } catch {}
        return;
      }
      
      // Other copilot or user
      const panel = endPt.closest('.panel-flyout');
      const fab = endPt.closest('.fab');
      let other = null;
      
      if (panel) {
        const copilotId = parseInt(panel.getAttribute('data-copilot-id'), 10);
        if (!isNaN(copilotId)) {
          other = window.CopilotManager?.instances?.get(copilotId);
          if (other) {
            // Link user to copilot
            const endRole = endPt.getAttribute('data-io');
            if (endRole !== 'in') { 
              endPt.classList.remove('io-out'); 
              endPt.classList.add('io-in'); 
              endPt.setAttribute('data-io', 'in'); 
              endPt.setAttribute('title', 'Input'); 
            }
            this.linkToCopilot(other, startPointEl, endPt);
            return;
          }
        }
      } else if (fab && fab !== this.fab) {
        const copilotId = parseInt(fab.getAttribute('data-copilot-id'), 10);
        if (!isNaN(copilotId)) {
          other = window.CopilotManager?.instances?.get(copilotId);
          if (other) {
            // Link user to copilot FAB
            const endRole = endPt.getAttribute('data-io');
            if (endRole !== 'in') { 
              endPt.classList.remove('io-out'); 
              endPt.classList.add('io-in'); 
              endPt.setAttribute('data-io', 'in'); 
              endPt.setAttribute('title', 'Input'); 
            }
            this.linkToCopilot(other, startPointEl, endPt);
            return;
          }
        }
      }
    };
    
    // Listeners
    points.forEach(pt => {
      const startDrag = (e) => {
        dragging = true; overPoint = null; const c = getCenter(pt); start = c; startPointEl = pt; ghostId = `ghost_user_${Date.now()}`;
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
  
  #wireContextMenu() {
    // Context menu for unlink functionality (simplified stub)
  }
  
  #initSettings() {
    // Settings initialization (simplified stub)
  }

  // Link management methods
  linkFromCopilot(inst, startEl = null, endEl = null) {
    if (!inst || !inst.fab || typeof inst.id !== 'number') return;

    // Resolve anchors (fallbacks if not provided)
    const isEl = (x) => x && typeof x.getBoundingClientRect === 'function';
    let sEl = null;
    if (isEl(startEl)) sEl = startEl;
    else sEl = inst.fab.querySelector('.conn-point.io-out') || inst.fab;

    let eEl = null;
    if (isEl(endEl)) eEl = endEl;
    else eEl = this.fab.querySelector('.conn-point.io-in') || this.fab;

    // Build ioId-based lineId for dedup and consistency
    const ss = (sEl?.getAttribute && sEl.getAttribute('data-side')) || 'x';
    const es = (eEl?.getAttribute && eEl.getAttribute('data-side')) || 'x';
    const fromIoId = (window.IORegistry?.getByEl?.(sEl)?.ioId) || `copilot:${inst.id}:${ss}:0`;
    const toIoId = (window.IORegistry?.getByEl?.(eEl)?.ioId) || `user:${this.id}:${es}:0`;
    const lineId = `link_${fromIoId}__${toIoId}`;

    // Prevent duplicate identical copilot → user link
    if (!this._linkLines) this._linkLines = new Map();
    const existing = this._linkLines.get(inst.id);
    const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    if (arr.some(r => r && r.lineId === lineId)) {
      try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
      try { toast('Den kopplingen finns redan.', 'info'); } catch {}
      return;
    }

    // Create visual link and persist bookkeeping
  // Build OO connection to enforce out→in rule and carry payloads; also get visual record
  const conn = ConnectionFactory.connect(sEl, eEl, { nodeType:'copilot', nodeId: String(inst.id) }, { nodeType:'user', nodeId: String(this.id) }, { ownerOut: inst, ownerIn: this });
  const rec = conn || Link.create({ lineId, startEl: sEl, endEl: eEl, from: inst.id, to: 'user' });
    if (rec) {
      const mine = this._linkLines.get(inst.id);
      if (mine) { if (Array.isArray(mine)) mine.push(rec); else this._linkLines.set(inst.id, [mine, rec]); }
      else { this._linkLines.set(inst.id, [rec]); }
    }

  // Track logical linkage
  this._linked.add(inst.id);
  // Mark copilot as having user as an inbound neighbor so dispatch filter passes
  try { inst.inNeighbors?.add('user'); } catch {}

    // Persist graph relationship
    try { GraphPersistence.addLink({ fromType: 'copilot', fromId: inst.id, fromSide: ss, toType: 'user', toId: this.id, toSide: es }); } catch {}

    try { toast('Kopplad: copilot → användare'); } catch {}
  }

  // New: create a link from USER (this) OUTPUT to copilot INPUT for correct flow direction
  linkToCopilot(inst, startEl = null, endEl = null) {
    if (!inst || !inst.fab || typeof inst.id !== 'number') return;
    const isEl = (x) => x && typeof x.getBoundingClientRect === 'function';
    // start: user output point (fallback: any .io-out or fab)
    let sEl = null;
    if (isEl(startEl)) sEl = startEl; else sEl = this.fab.querySelector('.conn-point.io-out') || this.fab;
    // end: copilot input point (fallback: any .io-in or fab)
    let eEl = null;
    if (isEl(endEl)) eEl = endEl; else eEl = inst.fab.querySelector('.conn-point.io-in') || inst.fab;

    const ss = (sEl?.getAttribute && sEl.getAttribute('data-side')) || 'x';
    const es = (eEl?.getAttribute && eEl.getAttribute('data-side')) || 'x';
    const fromIoId = (window.IORegistry?.getByEl?.(sEl)?.ioId) || `user:${this.id}:${ss}:0`;
    const toIoId = (window.IORegistry?.getByEl?.(eEl)?.ioId) || `copilot:${inst.id}:${es}:0`;
    const lineId = `link_${fromIoId}__${toIoId}`;

    if (!this._linkLines) this._linkLines = new Map();
    const existing = this._linkLines.get(inst.id);
    const arr = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    if (arr.some(r => r && r.lineId === lineId)) {
      try { ConnectionLayer.pulse(lineId, { duration: 700 }); } catch {}
      try { toast('Den kopplingen finns redan.', 'info'); } catch {}
      return;
    }

  const conn = ConnectionFactory.connect(sEl, eEl, { nodeType:'user', nodeId: String(this.id) }, { nodeType:'copilot', nodeId: String(inst.id) }, { ownerOut: this, ownerIn: inst });
  const rec = conn || Link.create({ lineId, startEl: sEl, endEl: eEl, from: 'user', to: inst.id });
    if (rec) {
      const mine = this._linkLines.get(inst.id);
      if (mine) { if (Array.isArray(mine)) mine.push(rec); else this._linkLines.set(inst.id, [mine, rec]); }
      else { this._linkLines.set(inst.id, [rec]); }
    }

    // Track logical linkage so dispatch fans out to this copilot
    this._linked.add(inst.id);
    try { inst.inNeighbors?.add('user'); } catch {}
    // Persist graph relationship (user → copilot)
    try { GraphPersistence.addLink({ fromType: 'user', fromId: this.id, fromSide: ss, toType: 'copilot', toId: inst.id, toSide: es }); } catch {}
    try { toast('Kopplad: användare → copilot'); } catch {}
  }

  // Back-compat for disconnect handler in ConnectionLayer
  _unlinkCopilot(copilotId) { this.unlinkCopilot(copilotId); }
  
  unlinkCopilot(copilotId) {
    this._linked.delete(copilotId);
    // Clean up visual lines
    const links = this._linkLines.get(copilotId);
    if (links) {
      const arr = Array.isArray(links) ? links : [links];
      arr.forEach(rec => { try { rec.remove?.(); } catch {} });
      this._linkLines.delete(copilotId);
    }
  // Remove persisted link user<->copilot
  try { GraphPersistence.removeWhere(l => (l.fromType==='copilot' && l.toType==='user' && l.fromId===copilotId) || (l.fromType==='user' && l.toType==='copilot' && l.toId===copilotId)); } catch {}
  }

  // Allow copilots to query the lineId for UI pulse
  getLinkLineIdFor(copilotId, dir = 'out') {
    try {
      const arr = this._linkLines?.get?.(copilotId);
      if (!arr) return null;
      const list = Array.isArray(arr) ? arr : [arr];
      // dir: 'out' means user → copilot; 'in' means copilot → user
      const rec = (dir === 'in')
        ? (list.find(r => r && r.to === 'user') || list[0])
        : (list.find(r => r && r.from === 'user') || list[0]);
      return rec?.lineId || null;
    } catch { return null; }
  }

  // Unlink user -> section links by key
  unlinkSection(secKey) {
    if (!secKey) return;
    const key = `section:${secKey}`;
    // Remove visual links stored in dedicated structures
    const lines = this._sectionLinkLines?.get?.(secKey);
    if (lines) {
      const arr = Array.isArray(lines) ? lines : [lines];
      arr.forEach(rec => { try { rec.remove?.(); } catch {} });
      this._sectionLinkLines.delete(secKey);
    }
    // Also clean any back-compat entries under _linkLines with synthetic key
    if (this._linkLines?.has?.(key)) {
      try {
        const ls = this._linkLines.get(key);
        (Array.isArray(ls) ? ls : [ls]).forEach(rec => { try { rec.remove?.(); } catch {} });
      } catch {}
      this._linkLines.delete(key);
    }
    // Update linked set and persistence
    try { this._linkedSections?.delete?.(secKey); } catch {}
    try { GraphPersistence.removeWhere(l => l.fromType==='user' && l.toType==='section' && l.toId===secKey); } catch {}
  }
  
  seedInto(convId) {
    // Seed conversation with user history
    try {
      const hist = this.history.slice();
      const convHist = ConversationManager.getHistory(convId);
      if (Array.isArray(convHist) && Array.isArray(hist) && convHist.length === 0 && hist.length) {
        hist.forEach(m => convHist.push(m));
      }
    } catch {}
  }
}

// UserNode Manager for singleton pattern
export class UserNodeManager {
  static instance = null;
  
  static getInstance() {
    if (!UserNodeManager.instance) {
      UserNodeManager.instance = new UserNode();
      // Make available globally like CopilotManager
      try { window.__ExamAI_UserNodeApi = UserNodeManager.instance; } catch {}
    }
    return UserNodeManager.instance;
  }
  
  static reset() {
    if (UserNodeManager.instance) {
      // Clean up old instance
      try {
        if (UserNodeManager.instance.fab) UserNodeManager.instance.fab.remove();
        if (UserNodeManager.instance.panel) UserNodeManager.instance.panel.remove();
      } catch {}
    }
    UserNodeManager.instance = null;
  }
}
