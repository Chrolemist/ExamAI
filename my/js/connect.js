// Connection creation, path drawing, and delete UI (classic)
// Purpose: Own all logic for drawing and maintaining SVG paths + user interaction
// around creating/removing connections. No node/panel creation here.
(function(){
  const svg = () => window.svg;
  // simulation toggle
  if (typeof window.aiSimEnabled === 'undefined') window.aiSimEnabled = true;
  // path helpers
  /** Ensure the gradient defs exist once per page. */
  function ensureDefs(){
    const s = svg(); if (!s) return;
    if (s.querySelector('defs')) return;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'flowGrad'; grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','1'); grad.setAttribute('y2','0');
    const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','rgba(124,92,255,0.9)');
    const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','rgba(0,212,255,0.9)');
    grad.appendChild(s1); grad.appendChild(s2);
    defs.appendChild(grad);
    s.appendChild(defs);
  }
  /** Create an invisible, thick stroke path used only for hit-testing. */
  function makeHitPath(){
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'rgba(0,0,0,0)');
    p.setAttribute('stroke-width', '12');
    p.setAttribute('stroke-linecap', 'round');
    p.style.pointerEvents = 'stroke';
    p.style.cursor = 'pointer';
    svg()?.appendChild(p);
    return p;
  }
  /** Is the pointer near any interactive IO point (node or panel)? */
  function isNearAnyIO(x, y, radius=20){
    const ios = document.querySelectorAll('.conn-point, .panel .head .section-io');
    for (const el of ios){
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      if (Math.hypot(cx - x, cy - y) <= radius) return true;
    }
    return false;
  }
  /** Create a new SVG path for a connection (animated while dragging). */
  function makePath(animated=false){
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'url(#flowGrad)');
    p.setAttribute('stroke-width', '3');
    p.setAttribute('stroke-linecap', 'round');
  p.style.pointerEvents = 'stroke';
  p.style.cursor = 'pointer';
    if (animated) {
      p.style.filter = 'drop-shadow(0 2px 10px rgba(124,92,255,0.25))';
      p.setAttribute('stroke-dasharray', '16 12');
      p.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -28 }], { duration: 800, iterations: Infinity });
    }
    ensureDefs();
    svg()?.appendChild(p);
    return p;
  }
  /** Draw mirrored cubic Bezier path between two points. */
  function drawPath(path, x1, y1, x2, y2){
    const dx = Math.abs(x2 - x1);
    const sign = (x2 >= x1) ? 1 : -1;
    const cx = Math.max(40, dx * 0.4);
    const c1x = x1 + sign * cx, c1y = y1;
    const c2x = x2 - sign * cx, c2y = y2;
    path.setAttribute('d', `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`);
  }

  /** Briefly animate a connection path to simulate data flow. */
  function triggerFlowEffect(conn, opts){
    const path = conn?.pathEl; if(!path) return;
    try{
      // glow
      const prevFilter = path.style.filter;
      path.style.filter = 'drop-shadow(0 2px 10px rgba(124,92,255,0.35))';
      // dash animation pulse
      const prevDash = path.getAttribute('stroke-dasharray');
      path.setAttribute('stroke-dasharray','16 12');
      const anim = path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -28 }], { duration: 650, iterations: 1, easing:'linear' });
      anim.addEventListener?.('finish', ()=>{
        // restore shortly after
        path.setAttribute('stroke-dasharray', prevDash || '');
        path.style.filter = prevFilter || '';
      });
      // fallback restore just in case
      setTimeout(()=>{ path.setAttribute('stroke-dasharray', prevDash || ''); path.style.filter = prevFilter || ''; }, 800);
    }catch{}
  }

  /** Find one-hop targets reachable from an owner via its OUT ports. */
  function getOutgoingTargets(ownerId){
    const res = [];
    window.state.connections.forEach(c=>{
      if (c.fromId === ownerId && c.fromCp?.classList?.contains('io-out')){
        // prefer delivering to IN on the other side; if unspecified, still deliver
        if (!c.toCp || c.toCp.classList.contains('io-in')) res.push({ targetId: c.toId, via: c });
      } else if (c.toId === ownerId && c.toCp?.classList?.contains('io-out')){
        if (!c.fromCp || c.fromCp.classList.contains('io-in')) res.push({ targetId: c.fromId, via: c });
      }
    });
    return res;
  }

  /** Route a message from a given ownerId through all outgoing connections. */
  function routeMessageFrom(ownerId, text, meta){
    if(!ownerId || !text) return;
    const targets = getOutgoingTargets(ownerId);
    targets.forEach(({targetId, via})=>{
      transmitOnConnection(via, { sourceId: ownerId, targetId, text: String(text), author: meta?.author||'Incoming', who: 'assistant', ts: meta?.ts || Date.now(), meta });
    });
  }

  /** Deliver a payload through a specific cable (no direct hops). */
  function transmitOnConnection(conn, payload){
    if(!conn || !payload) return;
    const { sourceId, text, author, who='assistant' } = payload;
    if(!sourceId || !text) return;
    // Determine direction and enforce IO roles
    let targetId = null;
    if (sourceId === conn.fromId) {
      if (conn.fromCp?.classList?.contains('io-out') && (!conn.toCp || conn.toCp.classList.contains('io-in'))) targetId = conn.toId;
    } else if (sourceId === conn.toId) {
      if (conn.toCp?.classList?.contains('io-out') && (!conn.fromCp || conn.fromCp.classList.contains('io-in'))) targetId = conn.fromId;
    }
    if(!targetId) return;
  // Notify the cable that traffic is passing; the cable listens and animates itself
  try { conn.pathEl?.dispatchEvent(new CustomEvent('connection:transmit', { detail: payload })); }
  catch { try{ triggerFlowEffect(conn); }catch{} }
    const ts = payload.ts || Date.now();
    try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', text, who, { via: `${conn.fromId}->${conn.toId}`, from: sourceId, ts }); }catch{}
    try{ if(window.receiveMessage) window.receiveMessage(targetId, text, who, { ts, via: `${conn.fromId}->${conn.toId}`, from: sourceId }); }catch{}
    // If the receiving node is a coworker, trigger simulated reply from that node through its OUT cables
    try{
      if (window.aiSimEnabled){
        const host = document.querySelector(`.fab[data-id="${targetId}"]`);
        if (host && host.dataset.type === 'coworker') simulateAIResponse(targetId, String(text), { ...payload, ts });
      }
    }catch{}
  }

  function simulateAIResponse(ownerId, incomingText, meta){
    const delay = 400 + Math.random()*800;
    setTimeout(()=>{
  let author = 'CoWorker';
  try{ const host=document.querySelector(`.fab[data-id="${ownerId}"]`); if(host) author = host.dataset.displayName || author; }catch{}
      const reply = `Svar: ${incomingText}`;
  // Always log in this coworker's own chat log first (captures canonical ts)
  let ts = Date.now();
  try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, reply, 'assistant', { sim:true, inReplyTo: meta?.ts }); ts = entry?.ts || ts; } }catch{}
  // Then render in UI if panel is open
  try{ if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', { ts, sim:true, inReplyTo: meta?.ts }); }catch{}
  // Then emit from coworker node through its OUT cables (if any)
  try{ if(window.routeMessageFrom) window.routeMessageFrom(ownerId, reply, { author, who:'assistant', ts, sim:true, inReplyTo: meta?.ts }); }catch{}
    }, delay);
  }

  // delete UI
  let _connDelBtn = null, _connDelHoveringBtn = false, _hoverConnCount = 0;
  /** Lazy-create the floating delete button reused across all paths. */
  function getConnDeleteBtn(){
    if (_connDelBtn) return _connDelBtn;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.type = 'button';
    Object.assign(btn.style, {
      position:'fixed', zIndex:'10100',
      width:'28px', height:'28px', lineHeight:'28px', textAlign:'center',
      fontSize:'16px', fontWeight:'700', color:'#fff',
      padding:'0', border:'1px solid rgba(160,0,0,0.65)', borderRadius:'999px',
      background:'linear-gradient(135deg, #4f0a0a, #7e0f0f)',
      boxShadow:'0 0 10px rgba(255,0,0,0.35), 0 4px 16px rgba(0,0,0,0.3)',
      cursor:'pointer', display:'none'
    });
    btn.title = 'Ta bort koppling';
  btn.addEventListener('mouseenter', () => { _connDelHoveringBtn = true; });
  btn.addEventListener('mouseleave', () => { _connDelHoveringBtn = false; if(_hoverConnCount===0) btn.style.display='none'; });
    document.body.appendChild(btn);
    _connDelBtn = btn; return btn;
  }
  function positionConnDeleteBtn(x, y){ const btn = getConnDeleteBtn(); const r = 14; btn.style.left = Math.round(x - r)+'px'; btn.style.top = Math.round(y - r)+'px'; }
  /** Remove connection path and its record from UI state and Graph. */
  function removeConnection(conn){ try{ conn.pathEl?.remove(); }catch{} try{ conn.hitEl?.remove(); }catch{} const idx = window.state.connections.indexOf(conn); if (idx>=0) window.state.connections.splice(idx,1); try{ if(window.graph) window.graph.disconnect(conn.fromId, conn.toId); }catch{} }
  function wireConnectionDeleteUI(conn){
    const btn = getConnDeleteBtn();
    const bindHover = (el)=>{
      if(!el) return; let over=false;
      const showBtn = (x,y) => { if (isNearAnyIO(x,y, 20)) { btn.style.display='none'; return; } positionConnDeleteBtn(x,y); btn.style.display='block'; btn.onclick = (e)=>{ e.stopPropagation(); removeConnection(conn); btn.style.display='none'; }; };
      const maybeHide = () => { if (_hoverConnCount===0 && !_connDelHoveringBtn) btn.style.display='none'; };
      el.addEventListener('mouseenter', (e)=>{ if(!over){ over=true; _hoverConnCount++; } showBtn(e.clientX, e.clientY); });
      el.addEventListener('mousemove', (e)=>{ if (!over) return; if (isNearAnyIO(e.clientX, e.clientY, 20)) { btn.style.display='none'; return; } positionConnDeleteBtn(e.clientX, e.clientY); btn.style.display='block'; });
      el.addEventListener('mouseleave', ()=>{ if(over){ over=false; _hoverConnCount=Math.max(0,_hoverConnCount-1);} setTimeout(maybeHide, 20); });
    };
    bindHover(conn.hitEl || conn.pathEl);
    if (conn.hitEl && conn.pathEl && conn.hitEl !== conn.pathEl) bindHover(conn.pathEl);
  }

  // Hide delete cross when mouse is not over any connection path
  document.addEventListener('mousemove', (e)=>{
    const btn = _connDelBtn; if(!btn) return;
    const t = e.target;
    let overLine = false;
    if (t && t instanceof Element && t.tagName && t.tagName.toLowerCase()==='path'){
      for(const c of (window.state?.connections||[])){
        if (c && (c.pathEl===t || c.hitEl===t)) { overLine = true; break; }
      }
    }
    if (!overLine && !_connDelHoveringBtn) btn.style.display='none';
  });

  // geometry helpers
  /** Compute absolute point of a connection-point relative to viewport. */
  function anchorOf(host, cp){ const r1 = host.getBoundingClientRect(); const r2 = cp.getBoundingClientRect(); return { x: r2.left + r2.width/2, y: r2.top + r2.height/2 }; }
  /** Find closest .conn-point within a radius that passes the filter. */
  function findClosestConnPoint(x,y,radius,filter=()=>true){
    const cps = [...document.querySelectorAll('.conn-point')].filter(filter);
    let best=null, bd=radius; cps.forEach(cp=>{ const r=cp.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2; const d=Math.hypot(cx-x, cy-y); if(d<bd){ bd=d; best=cp; } });
    return best;
  }
  /** Recompute all paths touching a moved/resized element. */
  function updateConnectionsFor(el){
    const id = el.dataset.id || el.dataset.sectionId;
    window.state.connections.forEach(c => {
      if (!c.pathEl.isConnected) return;
      if (c.fromId === id || c.toId === id) {
        const aHost = document.querySelector(`[data-id="${c.fromId}"]`) || document.querySelector(`[data-section-id="${c.fromId}"]`);
        const bHost = document.querySelector(`[data-id="${c.toId}"]`) || document.querySelector(`[data-section-id="${c.toId}"]`);
        if (!aHost || !bHost) return;
        const a = anchorOf(aHost, c.fromCp); const b = anchorOf(bHost, c.toCp);
        drawPath(c.pathEl, a.x, a.y, b.x, b.y);
  if (c.hitEl) drawPath(c.hitEl, a.x, a.y, b.x, b.y);
      }
    });
  }

  // interaction
  /** Wire pointer behavior for a connection point: click toggles role, drag starts connection. */
  function makeConnPointInteractive(cp, hostEl){
    let downX=0, downY=0, moved=false, connecting=false; const threshold=4;
    cp.addEventListener('pointerdown', (e)=>{
      e.preventDefault(); e.stopPropagation(); const p = window.pointFromEvent(e); downX=p.x; downY=p.y; moved=false; connecting=false;
      const onMove = (e2)=>{ const p2 = window.pointFromEvent(e2); const dx=p2.x-downX, dy=p2.y-downY; if(!moved && Math.hypot(dx,dy)>threshold) moved=true; if(moved && !connecting){ connecting=true; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); startConnection(hostEl, cp); } };
      const onUp = ()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if(!moved && !connecting){ const hostType = hostEl?.dataset?.type; if(hostType !== 'internet'){ const isIn = cp.classList.contains('io-in'); cp.classList.toggle('io-in', !isIn); cp.classList.toggle('io-out', isIn); } cp.removeAttribute('data-visual-role'); cp.style.background=''; cp.style.borderColor=''; cp.style.boxShadow=''; } };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    });
    cp.addEventListener('click', (e)=>e.stopPropagation());
  }
  /** Begin a live connection line from a conn-point until pointerup. */
  function startConnection(fromEl, fromCp){
    const tmpPath = makePath(); let lastHover=null;
    const fromIsIn = fromCp.classList.contains('io-in'); const fromIsOut = fromCp.classList.contains('io-out');
    const fromType = fromEl?.dataset?.type; const fromIsUser = (fromType==='user'); const fromIsCoworker = (fromType==='coworker');
    const baseFilter = (cp) => cp !== fromCp && (cp.closest('.fab, .panel, .panel-flyout') !== fromEl);
    const cpFilter = (cp) => baseFilter(cp) && ( fromIsOut ? cp.classList.contains('io-in') : fromIsIn ? cp.classList.contains('io-out') : true );
    const move = (e)=>{ const p = window.pointFromEvent(e); const a = anchorOf(fromEl, fromCp); drawPath(tmpPath, a.x, a.y, p.x, p.y);
      let near = findClosestConnPoint(p.x, p.y, 18, cpFilter);
      if (!near && (fromIsUser || fromIsCoworker)) near = findClosestConnPoint(p.x, p.y, 18, baseFilter);
      if (lastHover && lastHover !== near) lastHover.classList.remove('hover'); if (near && lastHover !== near) near.classList.add('hover'); lastHover = near; };
    const up = (e)=>{ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); finalizeConnection(fromEl, fromCp, e); tmpPath.remove(); if (lastHover) lastHover.classList.remove('hover'); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  /** On pointerup, snap to a target conn-point (if found) and finalize path + state. */
  function finalizeConnection(fromEl, fromCp, e){
    const p = window.pointFromEvent(e); const fromIsIn=fromCp.classList.contains('io-in'); const fromIsOut=fromCp.classList.contains('io-out');
    const fromType = fromEl?.dataset?.type; const fromIsUser=(fromType==='user'); const fromIsCoworker=(fromType==='coworker');
    const baseFilter = (cp) => cp !== fromCp && (cp.closest('.fab, .panel, .panel-flyout') !== fromEl);
    let target = findClosestConnPoint(p.x, p.y, 18, (cp)=> baseFilter(cp) && ( fromIsOut ? cp.classList.contains('io-in') : fromIsIn ? cp.classList.contains('io-out') : true ));
    if (!target && (fromIsUser || fromIsCoworker)) target = findClosestConnPoint(p.x, p.y, 18, baseFilter);
    if (!target) return;
    const toEl = target.closest('.fab, .panel, .panel-flyout');
  const path = makePath(false);
  const hit = makeHitPath();
  const a = anchorOf(fromEl, fromCp); const b = anchorOf(toEl, target); drawPath(path, a.x, a.y, b.x, b.y); drawPath(hit, a.x, a.y, b.x, b.y);
    const fromId = fromEl.dataset.id || fromEl.dataset.sectionId; const toId = toEl.dataset.id || toEl.dataset.sectionId;
  const conn = { fromId, toId, pathEl: path, hitEl: hit, fromCp, toCp: target };
    window.state.connections.push(conn);
    wireConnectionDeleteUI(conn);
  // Let the cable self-animate on traffic
  try{ path.addEventListener('connection:transmit', (ev)=>{ try{ triggerFlowEffect(conn, ev?.detail); }catch{} }); }catch{}
    if (fromId && toId && window.graph) window.graph.connect(fromId, toId);
  }

  // expose
  window.ensureDefs = ensureDefs;
  window.makePath = makePath;
  window.drawPath = drawPath;
  window.makeConnPointInteractive = makeConnPointInteractive;
  window.startConnection = startConnection;
  window.finalizeConnection = finalizeConnection;
  window.anchorOf = anchorOf;
  window.findClosestConnPoint = findClosestConnPoint;
  window.updateConnectionsFor = updateConnectionsFor;
  window.triggerFlowEffect = triggerFlowEffect;
  window.routeMessageFrom = routeMessageFrom;
})();
