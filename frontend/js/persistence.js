// Persistence: Save/Load full board state (nodes, connections, settings, sections, chat logs)
// Responsibility: Endast snapshot-lagring/återställning (localStorage). Ingen UI här.
// Lightweight, localStorage-based snapshots addressed by a user-provided name.
// SOLID hints:
// - S: UI för snapshots bor i snapshot-panel.js. Denna fil exponerar endast window.save/load/list/delete.
// - O: Lägg nya fält i snapshot-objektet utan att bryta API. Versionera vid stora ändringar.
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
    // Per-section state (render mode/settings, exercises list, cursor, full-screen layout)
    const sectionState = {};
    try{
      document.querySelectorAll('.panel.board-section').forEach(sec=>{
        const id = sec.dataset.sectionId || '';
        if (!id) return;
        const readJSON = (k, def)=>{ try{ const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : def; }catch{ return def; } };
        const readStr  = (k, def)=>{ try{ const v = localStorage.getItem(k); return (v==null? def: v); }catch{ return def; } };
        const readNum  = (k, def)=>{ try{ const v = Number(localStorage.getItem(k)); return Number.isFinite(v)? v : def; }catch{ return def; } };
        const settings = readJSON(`sectionSettings:${id}`, null);
        const exercises = readJSON(`sectionExercises:${id}`, null);
        const cursor = readNum(`sectionExercisesCursor:${id}`, null);
        const layout = readJSON(`sectionExercisesLayout:${id}`, null);
        sectionState[id] = { settings, exercises, cursor, layout };
      });
    }catch{}
    // Per-node attachments and flyout panel geometry
    const nodeAttachments = {};
    const panelGeom = {};
    try{
      nodes.forEach(n=>{
        const id = n.id;
        if (!id) return;
        try{ const rawAtt = localStorage.getItem(`nodeAttachments:${id}`); if (rawAtt) nodeAttachments[id] = JSON.parse(rawAtt)||[]; }catch{}
        try{ const rawGeom = localStorage.getItem(`panelGeom:${id}`); if (rawGeom) panelGeom[id] = JSON.parse(rawGeom)||null; }catch{}
      });
    }catch{}
    return { version: 2, createdAt: Date.now(), nodes, connections, chat, sections, sectionState, nodeAttachments, panelGeom };
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
      // Display name: prefer saved settings then snapshot name, then fallback
      try{
        let displayName = '';
        // read saved settings for this node type
        const ownerId = el.dataset.id;
        let saved = {};
        try{ const raw = ownerId ? localStorage.getItem(`nodeSettings:${ownerId}`) : null; if (raw) saved = JSON.parse(raw)||{}; }catch{}
        if (el.dataset.type === 'coworker'){
          displayName = (typeof saved.name==='string' && saved.name.trim()) ? saved.name : (n.name||'');
        } else if (el.dataset.type === 'user'){
          displayName = (typeof saved.userDisplayName==='string' && saved.userDisplayName.trim()) ? saved.userDisplayName : (n.name||'');
        } else if (el.dataset.type === 'internet'){
          displayName = n.name || 'Internet';
        } else {
          displayName = n.name || '';
        }
        if (!displayName){
          if (el.dataset.type === 'coworker') displayName = `CoWorker ${ownerId||''}`.trim();
          else if (el.dataset.type === 'user') displayName = 'User';
          else if (el.dataset.type === 'internet') displayName = 'Internet';
        }
        el.dataset.displayName = displayName;
        const lab = el.querySelector('.fab-label'); if(lab) lab.textContent = displayName;
      }catch{}
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
    // Restore section-related localStorage-backed state first (so UI can pick it up)
    try{
      const sectionState = data.sectionState || {};
      Object.keys(sectionState||{}).forEach(id=>{
        const st = sectionState[id]||{};
        const write = (k, v)=>{ try{ if (v===null || v===undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch{} };
        if ('settings' in st) write(`sectionSettings:${id}`, st.settings);
        if ('exercises' in st) write(`sectionExercises:${id}`, st.exercises);
        if ('cursor' in st){ try{ if (st.cursor==null) localStorage.removeItem(`sectionExercisesCursor:${id}`); else localStorage.setItem(`sectionExercisesCursor:${id}`, String(st.cursor)); }catch{} }
        if ('layout' in st) write(`sectionExercisesLayout:${id}`, st.layout);
      });
    }catch{}
    // Restore per-node attachments and flyout panel geometry to localStorage
    try{
      const at = data.nodeAttachments || {};
      Object.keys(at||{}).forEach(id=>{ try{ localStorage.setItem(`nodeAttachments:${id}`, JSON.stringify(at[id]||[])); }catch{} });
      const pg = data.panelGeom || {};
      Object.keys(pg||{}).forEach(id=>{ try{ if (pg[id]) localStorage.setItem(`panelGeom:${id}`, JSON.stringify(pg[id])); }catch{} });
    }catch{}
    // Restore sections (DOM content)
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

  // Snapshot UI has been moved to `snapshot-panel.js` to separate concerns (UI vs persistence).
  // This file retains the snapshot persistence functions and continues to expose them on `window`.
  // To initialize the snapshot bar UI programmatically, call:
  //    window.SnapshotPanel && window.SnapshotPanel.init()

  // expose programmatic API
  window.saveSnapshot = saveSnapshot;
  window.loadSnapshot = loadSnapshot;
  window.listSnapshots = listSnapshots;
  window.deleteSnapshot = deleteSnapshot;
})();
