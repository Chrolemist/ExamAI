// Node icons: creation, dragging, connection points (classic)
// Purpose: Everything related to the on-canvas node FABs (but no panel UI).
(function(){
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
    const onDown = (e)=>{ const p=window.pointFromEvent(e); startX=p.x; startY=p.y; const rect=el.getBoundingClientRect(); sx=rect.left; sy=rect.top; el.classList.add('busy'); moved=false; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp, { once:true }); };
    const onUp = ()=>{ el.classList.remove('busy'); window.removeEventListener('pointermove', onMove); if (moved) el._lastDragTime = Date.now(); };
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
    ;['t','r','b','l'].forEach(side => { const cp = document.createElement('div'); cp.dataset.side=side; let role='io-out'; if (type==='internet') role='io-in'; else if (side==='l'||side==='t') role='io-in'; else role='io-out'; cp.className='conn-point '+role; el.appendChild(cp); positionConnPoint(cp, el); window.makeConnPointInteractive && window.makeConnPointInteractive(cp, el); });
    makeDraggable(el);
    el.addEventListener('click', (e)=>{ if (e.target.closest('.conn-point')) return; const last=el._lastDragTime||0; if (Date.now()-last<250) return; window.openPanelForNode && window.openPanelForNode(el); });
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
    return el;
  }
  // expose
  window.createIcon = createIcon;
  window.positionConnPoint = positionConnPoint;
  window.makeDraggable = makeDraggable;
})();
