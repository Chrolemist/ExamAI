// Persistence: Save/Load full board state (nodes, connections, settings, sections, chat logs)
// Lightweight, localStorage-based snapshots addressed by a user-provided name.
(function(){
  const LS_PREFIX = 'snapshot:';
  const LS_UI_COLLAPSED = 'snapshot:uiCollapsed';

  function collectSections(){
    const secs = [];
    document.querySelectorAll('.panel.board-section').forEach(sec=>{
      const id = sec.dataset.sectionId || '';
      const titleEl = sec.querySelector('.head h2');
      const bodyEl = sec.querySelector('.body .note');
      secs.push({ id, title: (titleEl?.textContent||'').trim(), html: bodyEl ? bodyEl.innerHTML : '' });
    });
    return secs;
  }

  function restoreSections(items){
    const map = new Map();
    (items||[]).forEach(s=> map.set(String(s.id||''), s));
    document.querySelectorAll('.panel.board-section').forEach(sec=>{
      const id = sec.dataset.sectionId || '';
      const item = map.get(id);
      if (!item) return;
      try{ const titleEl = sec.querySelector('.head h2'); if (titleEl) titleEl.textContent = item.title || ''; }catch{}
      try{ const bodyEl = sec.querySelector('.body .note'); if (bodyEl) bodyEl.innerHTML = item.html || ''; }catch{}
    });
  }

  function snapshot(){
    // Nodes and their settings/positions
    const nodes = [];
    document.querySelectorAll('.fab').forEach(fab=>{
      const id = fab.dataset.id || '';
      const type = fab.dataset.type || '';
      const x = Math.round(parseFloat(fab.style.left||'0'))||0;
      const y = Math.round(parseFloat(fab.style.top||'0'))||0;
      const name = fab.dataset.displayName || '';
      let settings = {};
      try{ if (window.graph) settings = Object.assign({}, window.graph.getNodeSettings(id)); }catch{}
      nodes.push({ id, type, x, y, name, settings });
    });
    // Connections: merge from Graph (nodes-only) and UI state (includes section I/O) and de-duplicate
    const connections = [];
    try{
      const seen = new Set();
      const pushConn = (fromId, toId)=>{
        if (!fromId || !toId) return; const k = fromId+"->"+toId; if (seen.has(k)) return; seen.add(k); connections.push({ fromId, toId });
      };
      if (window.graph && Array.isArray(window.graph.connections)){
        window.graph.connections.forEach(c=> pushConn(c.fromId, c.toId));
      }
      if (window.state && Array.isArray(window.state.connections)){
        window.state.connections.forEach(c=> pushConn(c.fromId, c.toId));
      }
    }catch{}
    // Chat logs per node
    const chat = {};
    try{
      if (window.graph && window.graph.chatLogs){
        window.graph.chatLogs.forEach((arr, ownerId)=>{
          chat[ownerId] = (arr||[]).map(m=>({ author:m.author, text:m.text, who:m.who, ts:m.ts }));
        });
      }
    }catch{}
    // Sections (title + html)
    const sections = collectSections();
    return { version: 1, createdAt: Date.now(), nodes, connections, chat, sections };
  }

  function restore(data){
    if (!data) return;
    // Clear current state
    try{
      document.querySelectorAll('.fab').forEach(el=> el.remove());
      (window.state?.connections||[]).splice(0);
      document.querySelectorAll('#connLayer path').forEach(p=> p.remove());
      if (window.graph){ window.graph = new window.Graph(); }
    }catch{}
    // Recreate nodes first
    const idMap = new Map();
    (data.nodes||[]).forEach(n=>{
      const el = window.createIcon ? window.createIcon(n.type, n.x, n.y) : null;
      if (!el) return;
      // Force id for consistency
      try{ if (n.id){ el.dataset.id = String(n.id); if (window.graph){ const gnode = window.graph.nodes.get(el.dataset.id); if(gnode){ gnode.id = String(n.id); gnode.type = n.type; gnode.x = n.x; gnode.y = n.y; } } } }catch{}
      // Display name and per-node settings
      try{ el.dataset.displayName = n.name || el.dataset.displayName; const lab = el.querySelector('.fab-label'); if(lab && n.name) lab.textContent = n.name; }catch{}
      try{ if (window.graph && n.settings) window.graph.setNodeSettings(el.dataset.id, n.settings); }catch{}
      idMap.set(n.id, el.dataset.id);
    });
    // Helpers for robust connection restoration
  const pickOut = (el)=> el && (el.querySelector('.conn-point.io-out') || el.querySelector('.section-io[data-io="out"]') || el.querySelector('.conn-point'));
  const pickIn  = (el)=> el && (el.querySelector('.conn-point.io-in')  || el.querySelector('.section-io[data-io="in"]')  || el.querySelector('.conn-point'));
    const hasConn = (fromId, toId)=>{
      try{ return (window.state?.connections||[]).some(c=>c.fromId===fromId && c.toId===toId); }catch{ return false; }
    };
    const waitForPortsReady = (items, tries=40)=> new Promise(resolve=>{
      const tick=()=>{
        const ok = items.every(c=>{
          const a = document.querySelector(`.fab[data-id="${c.fromId}"]`) || document.querySelector(`.panel.board-section[data-section-id="${c.fromId}"]`) || document.querySelector(`.panel[data-section-id="${c.fromId}"]`);
          const b = document.querySelector(`.fab[data-id="${c.toId}"]`) || document.querySelector(`.panel.board-section[data-section-id="${c.toId}"]`) || document.querySelector(`.panel[data-section-id="${c.toId}"]`);
          return !!(a && b && pickOut(a) && pickIn(b));
        });
        if (ok || tries--<=0) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    const restoreConnections = async (items)=>{
      await waitForPortsReady(items);
      (items||[]).forEach(c=>{
  const a = document.querySelector(`.fab[data-id="${c.fromId}"]`) || document.querySelector(`.panel.board-section[data-section-id="${c.fromId}"]`) || document.querySelector(`.panel[data-section-id="${c.fromId}"]`);
  const b = document.querySelector(`.fab[data-id="${c.toId}"]`) || document.querySelector(`.panel.board-section[data-section-id="${c.toId}"]`) || document.querySelector(`.panel[data-section-id="${c.toId}"]`);
        if (!a || !b) return;
        const fromCp = pickOut(a); const toCp = pickIn(b);
        if (!fromCp || !toCp) return;
        const fromId = a.dataset.id || a.dataset.sectionId; const toId = b.dataset.id || b.dataset.sectionId;
        if (!fromId || !toId || hasConn(fromId, toId)) return;
        // Simulate a pointerup at the target conn-point center to reuse finalizeConnection wiring
        try{
          const r = toCp.getBoundingClientRect();
          const fake = { clientX: r.left + r.width/2, clientY: r.top + r.height/2 };
          if (window.finalizeConnection) window.finalizeConnection(a, fromCp, fake);
        }catch{}
      });
    };
    restoreConnections(data.connections||[]);
    // Restore chat logs
    try{
      const chat = data.chat || {};
      Object.keys(chat).forEach(ownerId=>{
        const msgs = chat[ownerId]||[];
        msgs.forEach(m=>{
          try{ window.graph && window.graph.addMessage(ownerId, m.author||'', m.text||'', m.who||'user', { ts: m.ts||Date.now() }); }catch{}
        });
      });
    }catch{}
    // Restore sections
    restoreSections(data.sections||[]);
  // Refresh connection geometry once after a tick
  setTimeout(()=>{ try{ window.updateConnectionsFor && document.querySelectorAll('.fab,.panel').forEach(el=> window.updateConnectionsFor(el)); }catch{} }, 0);
  }

  function saveSnapshot(name){
    if (!name) return { ok:false, error:'namn krävs' };
    const key = LS_PREFIX + name;
    try{ localStorage.setItem(key, JSON.stringify(snapshot())); return { ok:true, key };
    }catch(e){ return { ok:false, error: String(e) } }
  }

  function listSnapshots(){
    const out = [];
    try{
      for (let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
      }
    }catch{}
    return out.sort();
  }

  function deleteSnapshot(name){
    if (!name) return { ok:false, error:'namn saknas' };
    const key = LS_PREFIX + name;
    try{ localStorage.removeItem(key); return { ok:true };
    }catch(e){ return { ok:false, error: String(e) } }
  }

  function loadSnapshot(name){
    const key = LS_PREFIX + name;
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return { ok:false, error:'saknas' };
      const data = JSON.parse(raw);
      restore(data);
      return { ok:true };
    }catch(e){ return { ok:false, error: String(e) } }
  }

  // Minimal top bar UI
  function ensureTopBar(){
    if (document.getElementById('snapshotBar')) return;
    // Panel bar with internal header (toggle + plus)
    const bar = document.createElement('div');
    bar.id = 'snapshotBar';
    Object.assign(bar.style, { position:'fixed', top:'6px', left:'50%', transform:'translateX(-50%)', zIndex:'9999', background:'rgba(24,24,32,0.85)', color:'#fff', padding:'6px 8px', borderRadius:'10px', boxShadow:'0 6px 20px rgba(0,0,0,0.35)', fontSize:'12px', display:'flex', flexDirection:'column', gap:'6px', alignItems:'stretch', backdropFilter:'blur(6px)' });
    bar.innerHTML = `
      <div id="snapHeader" style="display:flex;align-items:center;gap:8px">
        <button id="snapToggle" type="button" title="Visa/dölj" style="width:24px;height:22px;line-height:20px;text-align:center;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.2);color:#fff;cursor:pointer;padding:0">▾</button>
        <div style="font-weight:600;opacity:0.9">Snapshots</div>
        <div style="flex:1"></div>
        <div style="position:relative">
          <button id="snapAddBtn" type="button" title="Lägg till nod" style="width:26px;height:22px;line-height:18px;text-align:center;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:linear-gradient(135deg,#7c5cff,#00d4ff);color:#111;font-weight:700;cursor:pointer;padding:0">+</button>
          <div id="snapAddMenu" class="hidden" role="menu" aria-hidden="true" style="position:absolute;right:0;top:26px;background:rgba(24,24,32,0.95);border:1px solid rgba(255,255,255,0.2);border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.35);padding:6px;">
            <button type="button" data-kind="coworker" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny CoWorker</button>
            <button type="button" data-kind="user" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny User</button>
            <button type="button" data-kind="internet" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny Internet</button>
          </div>
        </div>
      </div>
      <div id="snapBody" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;">Namn
          <input id="snapName" type="text" placeholder="ex: demo-1" style="width:180px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;">
        </label>
        <button id="btnSaveSnap" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:linear-gradient(135deg,#7c5cff,#00d4ff);color:#111;font-weight:600;">Save</button>
        <select id="snapList" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;"></select>
        <button id="btnLoadSnap" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.15);color:#fff;">Load</button>
        <button id="btnDeleteSnap" type="button" title="Ta bort vald sparning" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,80,80,0.5);background:rgba(120,20,20,0.35);color:#fff;">Delete</button>
        <div style="flex:1"></div>
        <button id="btnClearLocal" type="button" title="Rensa all lokal data (noder, inställningar, bilagor)" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,80,80,0.15);color:#ffdede;">Rensa lokal data</button>
      </div>
    `;
    document.body.appendChild(bar);
    const refreshList = ()=>{
      const list = document.getElementById('snapList'); if (!list) return;
      const items = listSnapshots();
      list.innerHTML = items.map(n=>`<option value="${n}">${n}</option>`).join('');
    };
    document.getElementById('btnSaveSnap')?.addEventListener('click', ()=>{
      const name = (document.getElementById('snapName')?.value || '').trim();
      if (!name){ alert('Ange ett namn innan du sparar.'); return; }
      const res = saveSnapshot(name);
      if (!res.ok) alert('Kunde inte spara: '+res.error);
      refreshList();
    });
    document.getElementById('btnLoadSnap')?.addEventListener('click', ()=>{
      const list = document.getElementById('snapList'); const name = list && list.value;
      if (!name){ alert('Välj en sparning att ladda.'); return; }
      const res = loadSnapshot(name);
      if (!res.ok) alert('Kunde inte ladda: '+res.error);
    });
    document.getElementById('btnDeleteSnap')?.addEventListener('click', ()=>{
      const list = document.getElementById('snapList'); const name = list && list.value;
      if (!name){ alert('Välj en sparning att ta bort.'); return; }
      if (!confirm(`Ta bort "${name}"?`)) return;
      const res = deleteSnapshot(name);
      if (!res.ok) { alert('Kunde inte ta bort: '+res.error); return; }
      refreshList();
    });
    // Clear local storage from snapshot bar
    document.getElementById('btnClearLocal')?.addEventListener('click', ()=>{
      try{
        if (!confirm('Rensa all lokal data (noder, inställningar, bilagor)?')) return;
        localStorage.clear();
        try{ if (window.graph && typeof window.graph.reset === 'function') window.graph.reset(); }catch{}
        try{ if (window.resetConnections) window.resetConnections(); }catch{}
      }catch{}
      location.reload();
    });
    // Toggle behavior inside bar
    const body = document.getElementById('snapBody');
    const toggle = document.getElementById('snapToggle');
    const applyCollapsed = (collapsed)=>{
      if (body) body.style.display = collapsed ? 'none' : 'flex';
      if (toggle) toggle.textContent = collapsed ? '▾' : '▴';
    };
    let collapsed = false;
    try{ collapsed = localStorage.getItem(LS_UI_COLLAPSED) === '1'; }catch{}
    applyCollapsed(collapsed);
    toggle?.addEventListener('click', ()=>{
      collapsed = !collapsed;
      applyCollapsed(collapsed);
      try{ localStorage.setItem(LS_UI_COLLAPSED, collapsed ? '1' : '0'); }catch{}
    });
    refreshList();

    // Inline + add menu
    try{
      const addBtn = document.getElementById('snapAddBtn');
      const menu = document.getElementById('snapAddMenu');
      const show = ()=>{ if(menu){ menu.classList.remove('hidden'); menu.setAttribute('aria-hidden','false'); } };
      const hide = ()=>{ if(menu){ menu.classList.add('hidden'); menu.setAttribute('aria-hidden','true'); } };
      addBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); const vis = menu && !menu.classList.contains('hidden'); if(vis) hide(); else show(); });
      document.addEventListener('click', (e)=>{ if(!menu) return; if (menu.classList.contains('hidden')) return; if (!menu.contains(e.target) && e.target !== addBtn) hide(); });
      menu?.addEventListener('click', (e)=>{
        const t = e.target.closest('button[data-kind]'); if (!t) return; hide();
        const kind = t.getAttribute('data-kind');
        let pos = { x: 60, y: Math.max(80, window.innerHeight - 140) };
        try{ if (window.getNextNodePosition) pos = window.getNextNodePosition(); }catch{}
        if (window.createIcon) window.createIcon(kind === 'user' ? 'user' : kind === 'internet' ? 'internet' : 'coworker', pos.x, pos.y);
      });
  // Hide the legacy topbar controls for a cleaner UI
  try{ const old = document.querySelector('.copilot-plus-wrap'); if (old) old.style.display='none'; }catch{}
    }catch{}
  }

  window.addEventListener('DOMContentLoaded', ensureTopBar);

  // expose programmatic API
  window.saveSnapshot = saveSnapshot;
  window.loadSnapshot = loadSnapshot;
  window.listSnapshots = listSnapshots;
  window.deleteSnapshot = deleteSnapshot;
})();
