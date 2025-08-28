// Node icons: creation, dragging, connection points (classic)
// Responsibility: Allt kring FAB-noder på canvas (skapa, dra, IO-punkter) – ingen panel-UI och ingen path-drag.
// SOLID hints:
// - S: Paneler hanteras i panels.js/internet-node.js; kablar i connect.js. Här endast FAB:ar.
// - D: Bero på små publika API: window.graph.addNode, window.updateConnectionsFor, window.makeConnPointInteractive.
(function(){
  // Compute deterministic positions for newly created nodes.
  // New behavior: spawn inside Node Board – first at center, then around a clockwise circle, avoiding overlaps.
  function getNextNodePosition(){
    try{
      const board = document.getElementById('nodeBoard');
      const nodeW = 72, nodeH = 72; // approximate FAB size incl. spacing
      const gap = 16; // radial spacing buffer
      if (board){
        const rect = board.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const cx = rect.left + rect.width/2 + scrollX;
        const cy = rect.top + rect.height/2 + scrollY;
        const margin = 8;
        // spawn index (0 = center)
        const idx = (window.__spawnIndex == null) ? 0 : window.__spawnIndex;
        let x, y;
        if (idx === 0){
          x = Math.round(cx - nodeW/2);
          y = Math.round(cy - nodeH/2);
        } else {
          // Excluding center, distribute on rings with 6*r slots per ring r
          let i = idx - 1; // slot index among ring positions
          let ring = 1;
          while (i >= 6*ring){ i -= 6*ring; ring++; }
          const slots = 6*ring;
          const step = (Math.PI * 2) / slots;
          const theta = i * step; // increasing theta is clockwise on screen coords
          const R = ring * (Math.max(nodeW, nodeH) + gap);
          x = Math.round(cx + R * Math.cos(theta) - nodeW/2);
          y = Math.round(cy + R * Math.sin(theta) - nodeH/2);
        }
        // Clamp within board (to avoid half-outside)
        const left = rect.left + scrollX + margin;
        const top = rect.top + scrollY + margin;
        const right = rect.right + scrollX - margin - nodeW;
        const bottom = rect.bottom + scrollY - margin - nodeH;
        x = Math.max(left, Math.min(x, right));
        y = Math.max(top, Math.min(y, bottom));
        window.__spawnIndex = idx + 1;
        return { x, y };
      }
      // Fallback: previous bottom-row algorithm if board missing
      const margin = 16;
      const gapX = 16;
      const gapY = 12;
      const usableLeft = margin;
      const usableRight = window.innerWidth - margin - nodeW;
      const baseY = Math.max(80, window.innerHeight - (nodeH + margin));
      const fabs = [...document.querySelectorAll('.fab')];
      if (!fabs.length) return { x: usableLeft, y: baseY };
      const last = window.__nextNodePos || { x: usableLeft - (gapX + nodeW), y: baseY };
      let nx = last.x + nodeW + gapX;
      let ny = last.y;
      if (nx > usableRight){ nx = usableLeft; ny = Math.min(baseY, last.y - (nodeH + gapY)); }
      nx = Math.max(usableLeft, Math.min(nx, usableRight));
      ny = Math.max(margin, Math.min(ny, baseY));
      window.__nextNodePos = { x: nx, y: ny };
      return { x: nx, y: ny };
    }catch{
      return { x: 60, y: Math.max(80, window.innerHeight - 140) };
    }
  }
  /** Position a connection point at the edge of its host node. */
  function positionConnPoint(cp, host){
    const rect = host.getBoundingClientRect();
    const centerX = rect.width/2, centerY = rect.height/2;
    const pos = { t:[centerX, 0], b:[centerX, rect.height], l:[0, centerY], r:[rect.width, centerY] }[cp.dataset.side];
    cp.style.left = pos[0] + 'px'; cp.style.top = pos[1] + 'px';
  }
  /** Make a node draggable; updates Graph and reflows connection paths during drag. */
  function makeDraggable(el){
    let startX=0, startY=0, sx=0, sy=0, moved=false;
    const onMove = (e)=>{
      const p = window.pointFromEvent(e); const dx=p.x-startX, dy=p.y-startY;
      if (!moved && Math.hypot(dx,dy) > 3) moved = true;
      const nx = window.clamp(sx + dx, 8, window.innerWidth - el.offsetWidth - 8);
      const ny = window.clamp(sy + dy, 8, window.innerHeight - el.offsetHeight - 8);
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      const nodeId = el.dataset.id; if (nodeId && window.graph) window.graph.moveNode(nodeId, nx, ny);
      window.updateConnectionsFor && window.updateConnectionsFor(el);
      el.querySelectorAll('.conn-point').forEach(cp => positionConnPoint(cp, el));
    };
  const onDown = (e)=>{ const p=window.pointFromEvent(e); startX=p.x; startY=p.y; const rect=el.getBoundingClientRect(); sx=rect.left; sy=rect.top; el.classList.add('dragging'); moved=false; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once:true }); };
  const onUp = ()=>{ el.classList.remove('dragging'); window.removeEventListener('pointermove', onMove); if (moved) el._lastDragTime = Date.now(); };
    el.addEventListener('pointerdown', onDown);
  }
  /** Create a new node FAB of a given type at (x, y) and register in state/graph. */
  function createIcon(type, x, y){
    const el = document.createElement('div');
    el.className = 'fab' + (type === 'user' ? ' user-node' : '') + (type === 'internet' ? ' internet-hub' : '');
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.dataset.type = type;
    if (type === 'user') {
      const avatar = document.createElement('div'); avatar.className='user-avatar'; avatar.textContent='👤'; el.appendChild(avatar); el.style.width='56px'; el.style.height='56px';
    } else if (type === 'internet') {
      const gradId = 'gradGlobeFab_' + Math.random().toString(36).slice(2,8);
      const glowId = 'glowGlobeFab_' + Math.random().toString(36).slice(2,8);
      el.innerHTML = `
        <svg class="globe-grid" viewBox="0 0 24 24" aria-hidden="true" width="28" height="28">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
            <filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <g fill="none" stroke="url(#${gradId})" stroke-linecap="round" stroke-linejoin="round" filter="url(#${glowId})">
            <!-- Outer globe -->
            <circle cx="12" cy="12" r="9" stroke-width="1.6"/>
            <!-- Latitudes -->
            <ellipse cx="12" cy="12" rx="9" ry="6.5" stroke-width="1.1" opacity="0.85"/>
            <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke-width="1.0" opacity="0.7"/>
            <!-- Meridians -->
            <ellipse cx="12" cy="12" rx="6.5" ry="9" stroke-width="1.1" opacity="0.85"/>
            <ellipse cx="12" cy="12" rx="3.5" ry="9" stroke-width="1.0" opacity="0.7"/>
            <!-- Equator -->
            <line x1="3" y1="12" x2="21" y2="12" stroke-width="1.1" opacity="0.9"/>
          </g>
        </svg>`;
    } else {
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
  // Label will be set after id is created (so coworker can include its unique id)
  const label = document.createElement('div');
  label.className='fab-label';
  el.appendChild(label);
  document.body.appendChild(el);
  ;['t','r','b','l'].forEach(side => { const cp = document.createElement('div'); cp.dataset.side=side; let role='io-out'; if (side==='l'||side==='t') role='io-in'; else role='io-out'; cp.className='conn-point '+role; el.appendChild(cp); positionConnPoint(cp, el); window.makeConnPointInteractive && window.makeConnPointInteractive(cp, el); });
    makeDraggable(el);
    el.addEventListener('click', (e)=>{
      if (e.target.closest('.conn-point')) return;
      const last = el._lastDragTime || 0;
      if (Date.now() - last < 250) return;
      const ownerId = el.dataset.id || '';
  // If this node has pending work, ensure the busy glow remains asserted
  try{ const p = Number(el.dataset.pending||0)||0; if (p>0) el.classList.add('busy'); }catch{}
      const existing = ownerId ? document.querySelector(`.panel-flyout[data-owner-id="${ownerId}"]`) : null;
      if (existing) {
        // Toggle: hide by removing the panel (state is persisted in Graph/localStorage)
        existing.remove();
        return;
      }
      window.openPanelForNode && window.openPanelForNode(el);
    });
    // Use Graph to allocate a sequential numeric id when available; fallback to timestamp
    let id = '';
    if (window.graph && typeof window.graph.addNode === 'function') {
      id = window.graph.addNode(type, x, y) || '';
    } else {
      id = String(Math.floor(Date.now() % 1e9));
    }
    window.state.nodes.push({ id, el, type, x, y });
    el.dataset.id = id;
    // Compute display name now that id exists
    let displayName;
    if (type === 'coworker') displayName = `CoWorker ${id}`; else if (type === 'user') displayName = 'User'; else if (type === 'internet') displayName = 'Internet'; else displayName = type;
    label.textContent = displayName;
    el.dataset.displayName = displayName;
    if (window.graph && el._model == null) { el._model = window.graph.nodes.get(id); }
  // Notify listeners (e.g., section toolbars) that coworker list may have changed
  try{ if (type === 'coworker') window.dispatchEvent(new CustomEvent('coworkers-changed')); }catch{}
    return el;
  }
  // expose
  window.createIcon = createIcon;
  window.getNextNodePosition = getNextNodePosition;
  window.positionConnPoint = positionConnPoint;
  window.makeDraggable = makeDraggable;
})();
