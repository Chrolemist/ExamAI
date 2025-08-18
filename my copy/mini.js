// Visual-only prototype: draggable icons, snap-to-connect lines, flyout chat UIs (standalone, no imports)

const state = {
  nodes: [], // {id, el, type, x, y, panelEl?}
  dragging: null, // {id, dx, dy}
  connecting: null, // {fromId, fromEl}
  connections: [], // [{fromId, toId, pathEl}]
};

const svg = (() => {
  const s = document.getElementById('connLayer');
  const resize = () => {
    s.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  };
  window.addEventListener('resize', resize);
  resize();
  return s;
})();

// standalone variant: no external classes/modules

function createIcon(type, x, y) {
  const el = document.createElement('div');
  el.className = 'fab' + (type === 'user' ? ' user-node' : '') + (type === 'internet' ? ' internet-hub' : '');
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.type = type;

  // icon face (match original visuals)
  if (type === 'user') {
    // User avatar emoji
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = '👤';
    el.appendChild(avatar);
    el.style.width = '56px';
    el.style.height = '56px';
  } else if (type === 'internet') {
    // Internet globe
    el.innerHTML = `
      <svg class="globe" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="gradHub" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#7c5cff"/>
            <stop offset="100%" stop-color="#00d4ff"/>
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#gradHub)" stroke-width="1.6">
          <circle cx="12" cy="12" r="9"/>
        </g>
      </svg>`;
  } else {
    // CoWorker hex avatar
    const gradId = 'hexGradFab_' + Math.random().toString(36).slice(2,8);
    el.innerHTML = `
      <div class="hex-avatar" title="CoWorker">
        <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
          </defs>
          <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>`;
  }

  // label
  const label = document.createElement('div');
  label.className = 'fab-label';
  label.textContent = type === 'user' ? 'User' : type === 'internet' ? 'Internet' : 'CoWorker';
  el.appendChild(label);

  // insert into DOM before computing positions
  document.body.appendChild(el);
  // conn points (top/bottom/left/right)
  ['t','r','b','l'].forEach(side => {
    const cp = document.createElement('div');
    cp.dataset.side = side;
    let role = 'io-out';
    if (type === 'internet') {
      role = 'io-in';
    } else if (side === 'l' || side === 't') {
      role = 'io-in';
    } else {
      role = 'io-out';
    }
    cp.className = 'conn-point ' + role;
    el.appendChild(cp);
    positionConnPoint(cp, el);
    makeConnPointInteractive(cp, el);
  });

  makeDraggable(el);
  // open panel on click (icon face or label), but never from conn points
  el.addEventListener('click', (e) => {
    if (e.target.closest('.conn-point')) return;
    const last = el._lastDragTime || 0;
    if (Date.now() - last < 250) return;
    openPanelForNode(el);
  });

  const id = 'n' + Math.random().toString(36).slice(2,7);
  state.nodes.push({ id, el, type, x, y });
  el.dataset.id = id;
  return el;
}

function positionConnPoint(cp, host) {
  const rect = host.getBoundingClientRect();
  const centerX = rect.width/2; const centerY = rect.height/2;
  const pos = { t:[centerX, 0], b:[centerX, rect.height], l:[0, centerY], r:[rect.width, centerY] }[cp.dataset.side];
  cp.style.left = pos[0] + 'px';
  cp.style.top = pos[1] + 'px';
}

function makeDraggable(el) {
  let startX = 0, startY = 0, sx = 0, sy = 0, moved = false;
  const onMove = (e) => {
    const p = pointFromEvent(e);
    const dx = p.x - startX; const dy = p.y - startY;
    if (!moved && Math.hypot(dx, dy) > 3) moved = true;
    const nx = clamp(sx + dx, 8, window.innerWidth - el.offsetWidth - 8);
    const ny = clamp(sy + dy, 8, window.innerHeight - el.offsetHeight - 8);
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    updateConnectionsFor(el);
    // reposition conn points
    el.querySelectorAll('.conn-point').forEach(cp => positionConnPoint(cp, el));
  };
  const onDown = (e) => {
    const p = pointFromEvent(e);
    startX = p.x; startY = p.y;
    const rect = el.getBoundingClientRect();
    sx = rect.left; sy = rect.top;
    el.classList.add('busy');
    moved = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };
  const onUp = () => {
    el.classList.remove('busy');
    window.removeEventListener('pointermove', onMove);
    if (moved) el._lastDragTime = Date.now();
  };
  el.addEventListener('pointerdown', onDown);
}

function makeConnPointInteractive(cp, hostEl) {
  // Click toggles color; drag starts a connection
  let downX = 0, downY = 0, moved = false, connecting = false;
  const threshold = 4;
  const onMove = (e) => {
    const p = pointFromEvent(e);
    const dx = p.x - downX, dy = p.y - downY;
    if (!moved && Math.hypot(dx, dy) > threshold) moved = true;
    if (moved && !connecting) {
      connecting = true;
      // cleanup our handlers before handing off to connection logic
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      startConnection(hostEl, cp);
    }
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!moved && !connecting) {
      // Flip actual role class each click (purple <-> green)
      const hostType = hostEl?.dataset?.type;
      // Keep Internet as input-only
      if (hostType !== 'internet') {
        const isIn = cp.classList.contains('io-in');
        cp.classList.toggle('io-in', !isIn);
        cp.classList.toggle('io-out', isIn);
      }
      // Let CSS control visuals; clear any inline overrides
      cp.removeAttribute('data-visual-role');
      cp.style.background = '';
      cp.style.borderColor = '';
      cp.style.boxShadow = '';
    }
  };
  cp.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = pointFromEvent(e);
    downX = p.x; downY = p.y; moved = false; connecting = false;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  // Prevent click bubbling from cp to host (so icon-click opens won't fire)
  cp.addEventListener('click', (e) => e.stopPropagation());
}

function startConnection(fromEl, fromCp) {
  const tmpPath = makePath();
  let lastHover = null;
  const fromIsIn = fromCp.classList.contains('io-in');
  const fromIsOut = fromCp.classList.contains('io-out');
  const fromType = fromEl?.dataset?.type;
  const fromIsUser = (fromType === 'user');
  const fromIsCoworker = (fromType === 'coworker');
  // Disallow connecting to another point on the same host element
  const baseFilter = (cp) => cp !== fromCp && (cp.closest('.fab, .panel, .panel-flyout') !== fromEl);
  const cpFilter = (cp) => baseFilter(cp) && (
    fromIsOut ? cp.classList.contains('io-in') : fromIsIn ? cp.classList.contains('io-out') : true
  );
  const move = (e) => {
    const p = pointFromEvent(e);
    const a = anchorOf(fromEl, fromCp);
    drawPath(tmpPath, a.x, a.y, p.x, p.y);
    // hover highlight nearest conn point
    let near = findClosestConnPoint(p.x, p.y, 18, cpFilter);
    if (!near && (fromIsUser || fromIsCoworker)) {
      // fallback: allow any target cp on other hosts if none with opposite I/O within radius
      near = findClosestConnPoint(p.x, p.y, 18, baseFilter);
    }
    if (lastHover && lastHover !== near) lastHover.classList.remove('hover');
    if (near && lastHover !== near) near.classList.add('hover');
    lastHover = near;
  };
  const up = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    finalizeConnection(fromEl, fromCp, e);
    tmpPath.remove();
    if (lastHover) lastHover.classList.remove('hover');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function finalizeConnection(fromEl, fromCp, e) {
  const p = pointFromEvent(e);
  // find nearest connection target within radius
  const fromIsIn = fromCp.classList.contains('io-in');
  const fromIsOut = fromCp.classList.contains('io-out');
  const fromType = fromEl?.dataset?.type;
  const fromIsUser = (fromType === 'user');
  const fromIsCoworker = (fromType === 'coworker');
  const baseFilter = (cp) => cp !== fromCp && (cp.closest('.fab, .panel, .panel-flyout') !== fromEl);
  let target = findClosestConnPoint(p.x, p.y, 18, (cp) => baseFilter(cp) && (
    fromIsOut ? cp.classList.contains('io-in') : fromIsIn ? cp.classList.contains('io-out') : true
  ));
  if (!target && (fromIsUser || fromIsCoworker)) {
    target = findClosestConnPoint(p.x, p.y, 18, baseFilter);
  }
  if (!target) return; // no snap
  const toEl = target.closest('.fab, .panel, .panel-flyout');
  const path = makePath(false);
  const a = anchorOf(fromEl, fromCp);
  const b = anchorOf(toEl, target);
  drawPath(path, a.x, a.y, b.x, b.y);
  const fromId = fromEl.dataset.id || fromEl.dataset.sectionId;
  const toId = toEl.dataset.id || toEl.dataset.sectionId;
  const conn = { fromId, toId, pathEl: path, fromCp, toCp: target };
  state.connections.push(conn);
  wireConnectionDeleteUI(conn);
}

function makePath(animated=false) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'url(#flowGrad)');
  p.setAttribute('stroke-width', '3');
  p.setAttribute('stroke-linecap', 'round');
  if (animated) {
    p.style.filter = 'drop-shadow(0 2px 10px rgba(124,92,255,0.25))';
    p.setAttribute('stroke-dasharray', '16 12');
    p.animate([
      { strokeDashoffset: 0 },
      { strokeDashoffset: -28 }
    ], { duration: 800, iterations: Infinity });
  }
  ensureDefs();
  svg.appendChild(p);
  return p;
}

function ensureDefs() {
  if (svg.querySelector('defs')) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.id = 'flowGrad';
  grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','1'); grad.setAttribute('y2','0');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','rgba(124,92,255,0.9)');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','rgba(0,212,255,0.9)');
  grad.appendChild(s1); grad.appendChild(s2);
  defs.appendChild(grad);
  svg.appendChild(defs);
}

function drawPath(path, x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const sign = (x2 >= x1) ? 1 : -1;
  const cx = Math.max(40, dx * 0.4);
  const c1x = x1 + sign * cx; const c1y = y1;
  const c2x = x2 - sign * cx; const c2y = y2;
  path.setAttribute('d', `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`);
}

// --- Connection delete UI ---
let _connDelBtn = null;
let _connDelHoveringBtn = false;
function getConnDeleteBtn() {
  if (_connDelBtn) return _connDelBtn;
  const btn = document.createElement('button');
  btn.textContent = 'ta bort';
  btn.type = 'button';
  btn.style.position = 'fixed';
  btn.style.zIndex = '10100';
  btn.style.fontSize = '12px';
  btn.style.padding = '4px 8px';
  btn.style.border = '1px solid rgba(0,0,0,0.15)';
  btn.style.borderRadius = '6px';
  btn.style.background = '#fff';
  btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.12)';
  btn.style.cursor = 'pointer';
  btn.style.display = 'none';
  btn.addEventListener('mouseenter', () => { _connDelHoveringBtn = true; });
  btn.addEventListener('mouseleave', () => { _connDelHoveringBtn = false; });
  document.body.appendChild(btn);
  _connDelBtn = btn;
  return btn;
}

function positionConnDeleteBtn(x, y) {
  const btn = getConnDeleteBtn();
  // Slight offset from cursor
  btn.style.left = Math.round(x + 10) + 'px';
  btn.style.top = Math.round(y + 10) + 'px';
}

function removeConnection(conn) {
  try { conn.pathEl?.remove(); } catch {}
  const idx = state.connections.indexOf(conn);
  if (idx >= 0) state.connections.splice(idx, 1);
}

function wireConnectionDeleteUI(conn) {
  const path = conn.pathEl;
  if (!path) return;
  let overPath = false;
  const btn = getConnDeleteBtn();
  const showBtn = (x, y) => {
    positionConnDeleteBtn(x, y);
    btn.style.display = 'block';
    // rebind click to delete this specific connection
    btn.onclick = (e) => {
      e.stopPropagation();
      removeConnection(conn);
      btn.style.display = 'none';
    };
  };
  const maybeHide = () => {
    // Hide only if we're neither over path nor button
    if (!overPath && !_connDelHoveringBtn) {
      btn.style.display = 'none';
    }
  };
  path.addEventListener('mouseenter', (e) => {
    overPath = true;
    showBtn(e.clientX, e.clientY);
  });
  path.addEventListener('mousemove', (e) => {
    if (overPath) positionConnDeleteBtn(e.clientX, e.clientY);
  });
  path.addEventListener('mouseleave', () => {
    overPath = false;
    // Defer hide a tick to allow moving into the button
    setTimeout(maybeHide, 80);
  });
}

function anchorOf(host, cp) {
  const r1 = host.getBoundingClientRect();
  const r2 = cp.getBoundingClientRect();
  return { x: r2.left + r2.width/2, y: r2.top + r2.height/2 };
}

function findClosestConnPoint(x, y, radius, filter = () => true) {
  const cps = [...document.querySelectorAll('.conn-point')].filter(filter);
  let best = null, bd = radius;
  cps.forEach(cp => {
    const r = cp.getBoundingClientRect();
    const cx = r.left + r.width/2; const cy = r.top + r.height/2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bd) { bd = d; best = cp; }
  });
  return best;
}

function updateConnectionsFor(el) {
  const id = el.dataset.id || el.dataset.sectionId;
  state.connections.forEach(c => {
    if (!c.pathEl.isConnected) return;
    if (c.fromId === id || c.toId === id) {
      const a = anchorOf(document.querySelector(`[data-id="${c.fromId}"]`) || document.querySelector(`[data-section-id="${c.fromId}"]`), c.fromCp);
      const b = anchorOf(document.querySelector(`[data-id="${c.toId}"]`) || document.querySelector(`[data-section-id="${c.toId}"]`), c.toCp);
      drawPath(c.pathEl, a.x, a.y, b.x, b.y);
    }
  });
}

function openPanel(hostEl) {
  const panel = document.createElement('section');
  panel.className = 'panel-flyout show';
  panel.dataset.sectionId = 'p' + Math.random().toString(36).slice(2,7);
  panel.style.left = Math.min(window.innerWidth-360, hostEl.getBoundingClientRect().right + 12) + 'px';
  panel.style.top = Math.max(12, hostEl.getBoundingClientRect().top - 20) + 'px';
  panel.innerHTML = `
    <header class="drawer-head"><div class="brand">${hostEl.dataset.type === 'user' ? 'User' : hostEl.dataset.type === 'internet' ? 'Internet' : 'CoWorker'}</div><button class="icon-btn" data-close>✕</button></header>
    <div class="messages">
      <div class="bubble">Detta är bara UI. Ingen logik körs.</div>
    </div>
    <div class="composer">
  <textarea class="userInput" rows="1" placeholder="Skriv ett meddelande (inget skickas)"></textarea>
      <button class="send-btn">Skicka</button>
    </div>
  `;

  // drag the panel by header
  const head = panel.querySelector('.drawer-head');
  makePanelDraggable(panel, head);

  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  document.body.appendChild(panel);
}

function openPanelForNode(hostEl) {
  if (hostEl.dataset.type === 'user') {
    openUserPanel(hostEl);
  } else if (hostEl.dataset.type === 'coworker') {
    openCoworkerPanel(hostEl);
  } else if (hostEl.dataset.type === 'internet') {
    openPanel(hostEl);
  }
}

// Restore local User and Coworker panels (standalone)
function openUserPanel(hostEl) {
  const panel = document.createElement('section');
  panel.className = 'panel-flyout show user-node-panel';
  panel.dataset.sectionId = 'u' + Math.random().toString(36).slice(2,7);
  positionPanelNear(panel, hostEl);
  panel.style.width = '360px';
  panel.style.height = '340px';
  panel.innerHTML = `
    <header class="drawer-head" data-role="dragHandle">
  <div class="user-avatar">👤</div>
  <div class="meta"><div class="name">User</div></div>
      <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
      <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
      <button class="icon-btn" data-close>✕</button>
    </header>
    <div class="settings collapsed" data-role="settings">
      <label>Namn
        <input type="text" data-role="name" placeholder="Ditt namn" />
      </label>
      <label>Teckensnitt – Meddelandetext
        <select data-role="fontText">
          <option value="system-ui, Segoe UI, Roboto, Arial, sans-serif">System (Standard)</option>
          <option value="Inter, system-ui, Segoe UI, Roboto, Arial, sans-serif">Inter</option>
          <option value="Segoe UI, system-ui, Roboto, Arial, sans-serif">Segoe UI</option>
          <option value="Roboto, system-ui, Segoe UI, Arial, sans-serif">Roboto</option>
          <option value="Georgia, serif">Georgia (Serif)</option>
          <option value="Times New Roman, Times, serif">Times New Roman (Serif)</option>
          <option value="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace">Monospace</option>
        </select>
      </label>
      <label>Teckensnitt – Namn
        <select data-role="fontName">
          <option value="system-ui, Segoe UI, Roboto, Arial, sans-serif">System (Standard)</option>
          <option value="Inter, system-ui, Segoe UI, Roboto, Arial, sans-serif">Inter</option>
          <option value="Segoe UI, system-ui, Roboto, Arial, sans-serif">Segoe UI</option>
          <option value="Roboto, system-ui, Segoe UI, Arial, sans-serif">Roboto</option>
          <option value="Georgia, serif">Georgia (Serif)</option>
          <option value="Times New Roman, Times, serif">Times New Roman (Serif)</option>
          <option value="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace">Monospace</option>
        </select>
      </label>
      <label class="color-field">Bubbelfärg
        <button type="button" class="color-toggle" data-role="colorToggle" aria-expanded="false" title="Välj färg"></button>
        <div class="color-panel collapsed" data-role="colorPanel">
          <input type="color" data-role="colorPicker" />
        </div>
      </label>
      <label>Transparens
        <input type="range" min="0" max="100" step="1" data-role="alpha" />
        <span class="subtle" data-role="alphaVal">10%</span>
      </label>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button type="button" class="btn danger" data-action="resetAll" title="Nollställ">Nollställ</button>
      </div>
    </div>
  <div class="messages"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Skriv som människa…"></textarea>
      <button class="send-btn" type="button">➤</button>
    </div>`;
  addResizeHandles(panel);
  document.body.appendChild(panel);
  makePanelDraggable(panel, panel.querySelector('.drawer-head'));
  const settingsBtn = panel.querySelector('[data-action="settings"]');
  const settings = panel.querySelector('[data-role="settings"]');
  settingsBtn?.addEventListener('click', () => settings.classList.toggle('collapsed'));
  const clearBtn = panel.querySelector('[data-action="clear"]');
  clearBtn?.addEventListener('click', () => { const m = panel.querySelector('.messages'); if (m) m.innerHTML=''; });
  // User appearance setup: color, alpha, fonts (background always on)
  panel._bubbleColorHex = '#7c5cff';
  panel._bubbleAlpha = 0.10;
  panel._bgOn = true; // always on; no toggle UI
  const colorToggle = panel.querySelector('[data-role="colorToggle"]');
  const colorPanel = panel.querySelector('[data-role="colorPanel"]');
  const colorPicker = panel.querySelector('[data-role="colorPicker"]');
  const alphaEl = panel.querySelector('[data-role="alpha"]');
  const alphaVal = panel.querySelector('[data-role="alphaVal"]');
  const fontTextSel = panel.querySelector('[data-role="fontText"]');
  const fontNameSel = panel.querySelector('[data-role="fontName"]');
  const messagesEl = panel.querySelector('.messages');
  const inputEl = panel.querySelector('.userInput');

  if (colorPicker) colorPicker.value = panel._bubbleColorHex;
  if (colorToggle) colorToggle.style.background = panel._bubbleColorHex;
  if (alphaEl) alphaEl.value = String(Math.round(panel._bubbleAlpha * 100));
  if (alphaVal) alphaVal.textContent = `${Math.round(panel._bubbleAlpha * 100)}%`;
  // Fonts: initialize defaults
  panel._textFont = fontTextSel ? fontTextSel.value : 'system-ui, Segoe UI, Roboto, Arial, sans-serif';
  panel._nameFont = fontNameSel ? fontNameSel.value : 'system-ui, Segoe UI, Roboto, Arial, sans-serif';
  if (messagesEl) messagesEl.style.fontFamily = panel._textFont;
  if (inputEl) inputEl.style.fontFamily = panel._textFont;
  const headerNameElInit = panel.querySelector('.drawer-head .meta .name');
  if (headerNameElInit) headerNameElInit.style.fontFamily = panel._nameFont;
  const userFabLabel = hostEl.querySelector('.fab-label');
  if (userFabLabel) userFabLabel.style.fontFamily = panel._nameFont;

  const applyBubbleStyles = () => {
    const rgb = hexToRgb(panel._bubbleColorHex);
    if (!rgb) return;
    const bg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${panel._bgOn ? panel._bubbleAlpha : 0})`;
    const border = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, panel._bgOn ? panel._bubbleAlpha + 0.12 : 0.08)})`;
    panel.querySelectorAll('.bubble.user').forEach(b => {
      b.style.backgroundColor = bg;
      b.style.borderColor = border;
    });
  };

  const colorField = panel.querySelector('label.color-field');
  colorToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = colorPanel?.classList.contains('collapsed');
    if (colorPanel) colorPanel.classList.toggle('collapsed');
    if (colorToggle) colorToggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
  });
  const onDocClick = (ev) => {
    if (!colorPanel || colorPanel.classList.contains('collapsed')) return;
    if (!colorField?.contains(ev.target)) {
      colorPanel.classList.add('collapsed');
      colorToggle?.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', onDocClick);

  colorPicker?.addEventListener('input', () => {
    panel._bubbleColorHex = colorPicker.value || '#7c5cff';
    if (colorToggle) colorToggle.style.background = panel._bubbleColorHex;
    applyBubbleStyles();
  });
  alphaEl?.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, Number(alphaEl.value)||0));
    panel._bubbleAlpha = v/100;
    if (alphaVal) alphaVal.textContent = `${v}%`;
    applyBubbleStyles();
  });
  fontTextSel?.addEventListener('change', () => {
    panel._textFont = fontTextSel.value;
    if (messagesEl) messagesEl.style.fontFamily = panel._textFont;
    if (inputEl) inputEl.style.fontFamily = panel._textFont;
  });
  fontNameSel?.addEventListener('change', () => {
    panel._nameFont = fontNameSel.value;
    const hn = panel.querySelector('.drawer-head .meta .name');
    if (hn) hn.style.fontFamily = panel._nameFont;
    const lab = hostEl.querySelector('.fab-label');
    if (lab) lab.style.fontFamily = panel._nameFont;
    // Update existing author labels in this panel
    panel.querySelectorAll('.author-label').forEach(el => { el.style.fontFamily = panel._nameFont; });
  });

  // Wire name input to header and FAB label; bubbles will include author label per message
  const headerNameEl = panel.querySelector('.drawer-head .meta .name');
  const nameInput = panel.querySelector('[data-role="name"]');
  panel._displayName = '';
  const updateFabLabel = (text) => {
    const lab = hostEl.querySelector('.fab-label');
    if (lab) lab.textContent = text;
  };
  nameInput?.addEventListener('input', () => {
    panel._displayName = nameInput.value || '';
    const nameText = panel._displayName.trim() || 'User';
    if (headerNameEl) headerNameEl.textContent = nameText;
    updateFabLabel(nameText);
  });
  // Set initial header and label
  if (headerNameEl) headerNameEl.textContent = 'User';
  updateFabLabel('User');

  panel.querySelector('[data-action="resetAll"]')?.addEventListener('click', () => {
    panel._bubbleColorHex = '#7c5cff';
    panel._bubbleAlpha = 0.10;
    panel._bgOn = true;
  // Clear chat messages as part of reset
  if (messagesEl) { messagesEl.innerHTML = ''; }
    if (colorPicker) colorPicker.value = panel._bubbleColorHex;
    if (colorToggle) colorToggle.style.background = panel._bubbleColorHex;
    if (alphaEl) alphaEl.value = '10';
    if (alphaVal) alphaVal.textContent = '10%';
    if (fontTextSel) {
      fontTextSel.value = 'system-ui, Segoe UI, Roboto, Arial, sans-serif';
      panel._textFont = fontTextSel.value;
      if (messagesEl) messagesEl.style.fontFamily = panel._textFont;
      if (inputEl) inputEl.style.fontFamily = panel._textFont;
    }
    if (fontNameSel) {
      fontNameSel.value = 'system-ui, Segoe UI, Roboto, Arial, sans-serif';
      panel._nameFont = fontNameSel.value;
      const hn = panel.querySelector('.drawer-head .meta .name');
      if (hn) hn.style.fontFamily = panel._nameFont;
      const lab = hostEl.querySelector('.fab-label');
      if (lab) lab.style.fontFamily = panel._nameFont;
      panel.querySelectorAll('.author-label').forEach(el => { el.style.fontFamily = panel._nameFont; });
    }
    applyBubbleStyles();
  // Nothing else to restore here
  });

  panel.querySelector('[data-close]').addEventListener('click', () => {
    document.removeEventListener('click', onDocClick);
    panel.remove();
  });
  wireComposer(panel);
  wirePanelResize(panel);
}

function openCoworkerPanel(hostEl) {
  const panel = document.createElement('section');
  panel.className = 'panel-flyout show';
  panel.dataset.sectionId = 'c' + Math.random().toString(36).slice(2,7);
  positionPanelNear(panel, hostEl);
  panel.style.width = '380px';
  panel.style.height = '360px';
  const gradId = 'hexGradHdr_' + Math.random().toString(36).slice(2,8);
  panel.innerHTML = `
    <header class="drawer-head" data-role="dragHandle">
      <div class="hex-avatar" title="CoWorker">
        <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
          <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs>
          <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>
      <div class="meta"><div class="name">CoWorker</div></div>
      <span class="badge" data-role="roleBadge" title="Roll">Roll</span>
      <span class="badge badge-error" data-role="keyStatus">Ingen nyckel</span>
      <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
      <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
      <button class="icon-btn" data-action="delete" title="Radera">🗑</button>
      <button class="icon-btn" data-close>✕</button>
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
      <label class="inline">
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
    <div class="attachments hidden" data-role="attachments" aria-label="Bilagor (drag & släpp)"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Skriv ett meddelande..."></textarea>
      <button class="send-btn" type="button">Skicka</button>
  </div>`;
  addResizeHandles(panel);
  document.body.appendChild(panel);
  makePanelDraggable(panel, panel.querySelector('.drawer-head'));
  const settingsBtn = panel.querySelector('[data-action="settings"]');
  const settings = panel.querySelector('[data-role="settings"]');
  settingsBtn?.addEventListener('click', () => settings.classList.toggle('collapsed'));
  const clearBtn = panel.querySelector('[data-action="clear"]');
  clearBtn?.addEventListener('click', () => { const m = panel.querySelector('.messages'); if (m) m.innerHTML=''; });
  const delBtn = panel.querySelector('[data-action="delete"]');
  delBtn?.addEventListener('click', () => panel.remove());
  panel.querySelector('[data-close]').addEventListener('click', () => panel.remove());
  wireComposer(panel);
  wirePanelResize(panel);
}

function addResizeHandles(panel) {
  const mk = (cls) => { const h = document.createElement('div'); h.className = 'flyout-resize ' + cls; h.dataset.resize = cls.replace(/^.*\b([a-z]{1,2})$/,'$1'); return h; };
  panel.appendChild(mk('br'));
  panel.appendChild(mk('t'));
  panel.appendChild(mk('b'));
  panel.appendChild(mk('l'));
  panel.appendChild(mk('r'));
}

function wirePanelResize(panel) {
  const minW = 280, minH = 200;
  let startX=0, startY=0, startW=0, startH=0, startL=0, startT=0, mode='';
  const onMove = (e) => {
    const p = pointFromEvent(e);
    const dx = p.x - startX; const dy = p.y - startY;
    let w = startW, h = startH, l = startL, t = startT;
    if (mode.includes('r')) w = Math.max(minW, startW + dx);
    if (mode.includes('l')) { w = Math.max(minW, startW - dx); l = startL + Math.min(dx, startW - minW); }
    if (mode.includes('b')) h = Math.max(minH, startH + dy);
    if (mode.includes('t')) { h = Math.max(minH, startH - dy); t = startT + Math.min(dy, startH - minH); }
    panel.style.width = w + 'px';
    panel.style.height = h + 'px';
    panel.style.left = l + 'px';
    panel.style.top = t + 'px';
    panel.querySelectorAll('.conn-point').forEach(cp => positionPanelConn(cp, panel));
    updateConnectionsFor(panel);
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  panel.querySelectorAll('.flyout-resize').forEach(h => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startW = r.width; startH = r.height; startL = r.left; startT = r.top;
      mode = h.dataset.resize || '';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

function wireComposer(panel) {
  const ta = panel.querySelector('.userInput');
  const send = panel.querySelector('.send-btn');
  const list = panel.querySelector('.messages');
  const append = (text, who='user') => {
    // Group author label and bubble so we can align per side
    const row = document.createElement('div');
    row.className = 'message-row' + (who === 'user' ? ' user' : '');
    const group = document.createElement('div');
    group.className = 'msg-group';

    // Author label above the bubble
    const author = document.createElement('div');
    author.className = 'author-label';
    if (panel.classList.contains('user-node-panel') && who === 'user') {
      const name = (panel._displayName || '').trim() || 'User';
      author.textContent = name;
    } else {
      const nameEl = panel.querySelector('.drawer-head .meta .name');
      author.textContent = (nameEl?.textContent || (who === 'user' ? 'User' : 'Assistant')).trim();
    }
    // Apply name font if set
  if (panel._nameFont) author.style.fontFamily = panel._nameFont;
  group.appendChild(author);

    // The bubble with message text
  const b = document.createElement('div');
    b.className = 'bubble ' + (who === 'user' ? 'user' : '');
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;
    // Apply message font if set
    if (panel._textFont) textEl.style.fontFamily = panel._textFont;
    b.appendChild(textEl);
  group.appendChild(b);
  row.appendChild(group);
  list.appendChild(row);
  // If this is the User panel, apply current bubble styles
      if (panel.classList.contains('user-node-panel') && who === 'user') {
        const rgb = hexToRgb(panel._bubbleColorHex || '#7c5cff');
        if (rgb) {
          const bg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${panel._bgOn ? (panel._bubbleAlpha ?? 0.1) : 0})`;
          const border = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, panel._bgOn ? (panel._bubbleAlpha ?? 0.1) + 0.12 : 0.08)})`;
          b.style.backgroundColor = bg;
          b.style.borderColor = border;
        }
      }
    list.scrollTop = list.scrollHeight;
  };
  const doSend = () => {
    const val = (ta.value || '').trim();
    if (!val) return;
    append(val, 'user');
    ta.value = '';
  };
  send.addEventListener('click', doSend);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
}

function positionPanelNear(panel, hostEl) {
  panel.style.left = Math.min(window.innerWidth-360, hostEl.getBoundingClientRect().right + 12) + 'px';
  panel.style.top = Math.max(12, hostEl.getBoundingClientRect().top - 20) + 'px';
}

function positionPanelConn(cp, panel) {
  const rect = panel.getBoundingClientRect();
  const pos = { t:[rect.width/2, 0], b:[rect.width/2, rect.height], l:[0, rect.height/2], r:[rect.width, rect.height/2] }[cp.dataset.side];
  cp.style.left = pos[0] + 'px';
  cp.style.top = pos[1] + 'px';
}

function makePanelDraggable(panel, handle) {
  let sx=0, sy=0, ox=0, oy=0;
  const down = (e) => {
    const p = pointFromEvent(e);
    const r = panel.getBoundingClientRect();
    sx = p.x; sy = p.y; ox = r.left; oy = r.top;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const move = (e) => {
    const p = pointFromEvent(e);
    const nx = clamp(ox + (p.x - sx), 0, window.innerWidth - panel.offsetWidth);
    const ny = clamp(oy + (p.y - sy), 0, window.innerHeight - panel.offsetHeight);
    panel.style.left = nx + 'px';
    panel.style.top = ny + 'px';
    panel.querySelectorAll('.conn-point').forEach(cp => positionPanelConn(cp, panel));
    updateConnectionsFor(panel);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
  };
  handle.addEventListener('pointerdown', down);
}

function pointFromEvent(e) {
  return { x: e.clientX, y: e.clientY };
}
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function hexToRgb(hex){
  const m = (hex||'').trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if(!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c=>c+c).join('');
  const num = parseInt(h, 16);
  return { r: (num>>16)&255, g: (num>>8)&255, b: num&255 };
}

// Role colors: input=green, output=purple (defaults; can be overridden via CSS vars on :root)
const ROLE_COLORS = { in: '#22c55e', out: '#7c5cff' };
function cssToRgb(color) {
  if (!color) return null;
  const c = color.trim();
  if (c.startsWith('#')) return hexToRgb(c);
  const m = c.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1))?\)$/i);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}
function getColorForRole(el, role){
  try {
    const root = getComputedStyle(document.documentElement);
    const varName = role === 'in' ? '--conn-in-color' : '--conn-out-color';
    const v = (root.getPropertyValue(varName) || '').trim();
    if (v) return v;
  } catch {}
  return ROLE_COLORS[role] || (role === 'in' ? '#22c55e' : '#7c5cff');
}

// Setup: put three default icons (User, Internet, one CoWorker)
window.addEventListener('DOMContentLoaded', () => {
  const midX = Math.round(window.innerWidth/2);
  createIcon('user', midX - 200, 160);
  createIcon('coworker', midX - 20, 240);
  createIcon('internet', midX + 200, 160);

  document.getElementById('addCopilotBtn').addEventListener('click', () => {
    const x = 40 + Math.random() * (window.innerWidth - 120);
    const y = 80 + Math.random() * (window.innerHeight - 160);
    createIcon('coworker', x, y);
  });

  // mark header IO points as connectable
  document.querySelectorAll('.panel .head .section-io').forEach((io, idx) => {
    const section = io.closest('.panel');
    section.dataset.sectionId = 's' + idx;
    makeConnPointInteractive(io, section);
  });

  // keep paths and points fresh on resize (only nodes have edge conn points)
  window.addEventListener('resize', () => {
    document.querySelectorAll('.fab').forEach(f => {
      f.querySelectorAll('.conn-point').forEach(cp => positionConnPoint(cp, f));
      updateConnectionsFor(f);
    });
    // For board sections, header IO stays positioned by CSS; just refresh paths
    document.querySelectorAll('.panel').forEach(p => updateConnectionsFor(p));
    document.querySelectorAll('.panel-flyout').forEach(p => updateConnectionsFor(p));
  });
});
