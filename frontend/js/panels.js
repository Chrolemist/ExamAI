// Flyout panels and chat UI (classic)
// Responsibility: Flyout-paneler för User/CoWorker/Internet och chat-kompositör (textarea+send).
// Panels are draggable/resizable and connectable via header IO points.
// SOLID hints:
// - S: Panel-UI och render; ingen kabelgeometri (connect.js) och ingen datamodell (graph.js).
// - O: Nya paneltyper kan läggas som egna openXPanel()-funktioner, bevara wireComposer generisk.
// - I: Bryt ut underrubriker (attachments/footnotes/exercises) till små helpers för ökad läsbarhet.
// - D: Bero på små window-APIs (routeMessageFrom, requestAIReply, requestInternetReply) istället för att anropa fetch här.
(function(){
  // Open URLs safely: HEAD-check http(s) targets to avoid blank tabs if the file is missing (404)
  function openIfExists(url){
    try{
      if (!url) return;
      const u = String(url);
      // Skip network preflight for non-http(s) links
      if (!/^https?:/i.test(u)){
        try{ window.open(u, '_blank', 'noopener'); }catch{}
        return;
      }
      const base = u.split('#')[0];
      fetch(base, { method:'HEAD', cache:'no-store' })
        .then(r => {
          if (r && r.ok){
            try{ window.open(u, '_blank', 'noopener'); }
            catch{
              const a=document.createElement('a'); a.href=u; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove();
            }
          } else {
            alert('Denna bilaga saknas – ladda upp igen.');
          }
        })
        .catch(()=>{ alert('Denna bilaga saknas – ladda upp igen.'); });
    }catch{
      try{ window.open(url, '_blank', 'noopener'); }catch{}
    }
  }
  function formatTime(ts){ try{ return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }catch{ return ''; } }
  // Persist panel geometry (position + size) per ownerId
  const geomKey = (ownerId)=> `panelGeom:${ownerId}`;
  function clampGeom(g){
    const pad = 8; const maxW = Math.max(280, window.innerWidth - pad*2); const maxH = Math.max(200, window.innerHeight - pad*2);
    const w = Math.min(maxW, Math.max(280, Math.floor(g.width||360)));
    const h = Math.min(maxH, Math.max(200, Math.floor(g.height||300)));
    const l = Math.min(Math.max(pad, Math.floor(g.left||pad)), Math.max(pad, window.innerWidth - w - pad));
    const t = Math.min(Math.max(pad, Math.floor(g.top||pad)), Math.max(pad, window.innerHeight - h - pad));
    return { left:l, top:t, width:w, height:h };
  }
  function savePanelGeom(panel){ try{ const ownerId = panel?.dataset?.ownerId; if(!ownerId) return; const r = panel.getBoundingClientRect(); const g = clampGeom({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }); localStorage.setItem(geomKey(ownerId), JSON.stringify(g)); }catch{} }
  function loadPanelGeom(ownerId){ try{ const raw = localStorage.getItem(geomKey(ownerId)); if(!raw) return null; const g = JSON.parse(raw); return clampGeom(g||{}); }catch{ return null; } }
  function applyPanelGeom(panel, g){ try{ if(!g) return; panel.style.left = g.left + 'px'; panel.style.top = g.top + 'px'; panel.style.width = g.width + 'px'; panel.style.height = g.height + 'px'; }catch{} }
  // Basic sanitizer for HTML mode: strip <script> and inline event handlers, and javascript: URLs
  function sanitizeHtml(html){
    try{
      let s = String(html||'');
      // remove scripts
      s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  // remove style tags and external stylesheets/metadata that could leak globally
  s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<link[^>]*>/gi, '');
  s = s.replace(/<meta[^>]*>/gi, '');
  s = s.replace(/<base[^>]*>/gi, '');
      // remove on*="..." attributes
      s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
      // neutralize javascript: in href/src
      s = s.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
      s = s.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
      return s;
    }catch{ return String(html||''); }
  }
  try{ window.sanitizeHtml = sanitizeHtml; }catch{}
  /** Position a panel's I/O point at the panel edges. */
  function positionPanelConn(cp, panel){ const rect = panel.getBoundingClientRect(); const pos = { t:[rect.width/2, 0], b:[rect.width/2, rect.height], l:[0, rect.height/2], r:[rect.width, rect.height/2] }[cp.dataset.side]; cp.style.left = pos[0] + 'px'; cp.style.top = pos[1] + 'px'; }
  /** Position a flyout panel near its host node. */
  function positionPanelNear(panel, hostEl){ panel.style.left = Math.min(window.innerWidth-360, hostEl.getBoundingClientRect().right + 12) + 'px'; panel.style.top = Math.max(12, hostEl.getBoundingClientRect().top - 20) + 'px'; }
  /** Add 5 resize handles (br, t, b, l, r) to a panel. */
  function addResizeHandles(panel){ const mk=(cls)=>{ const h=document.createElement('div'); h.className='flyout-resize '+cls; h.dataset.resize=cls.replace(/^.*\b([a-z]{1,2})$/, '$1'); return h; }; panel.appendChild(mk('br')); panel.appendChild(mk('t')); panel.appendChild(mk('b')); panel.appendChild(mk('l')); panel.appendChild(mk('r')); }
  /** Make a panel resizable; updates connection anchors while resizing. */
  function wirePanelResize(panel){ const minW=280, minH=200; let startX=0,startY=0,startW=0,startH=0,startL=0,startT=0,mode=''; const onMove=(e)=>{ const p=window.pointFromEvent(e); const dx=p.x-startX, dy=p.y-startY; let w=startW,h=startH,l=startL,t=startT; if(mode.includes('r')) w=Math.max(minW, startW+dx); if(mode.includes('l')){ w=Math.max(minW, startW-dx); l=startL+Math.min(dx, startW-minW);} if(mode.includes('b')) h=Math.max(minH, startH+dy); if(mode.includes('t')){ h=Math.max(minH, startH-dy); t=startT+Math.min(dy, startH-minH);} panel.style.width=w+'px'; panel.style.height=h+'px'; panel.style.left=l+'px'; panel.style.top=t+'px'; panel.querySelectorAll('.conn-point').forEach(cp=>positionPanelConn(cp,panel)); window.updateConnectionsFor && window.updateConnectionsFor(panel); }; const onUp=()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); savePanelGeom(panel); }; panel.querySelectorAll('.flyout-resize').forEach(h=>{ h.addEventListener('pointerdown',(e)=>{ e.preventDefault(); const r=panel.getBoundingClientRect(); startX=e.clientX; startY=e.clientY; startW=r.width; startH=r.height; startL=r.left; startT=r.top; mode=h.dataset.resize||''; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }); }); }
  /** Make a panel draggable by a specific handle element (saves geometry on release). */
  function makePanelDraggable(panel, handle){
    let sx=0,sy=0,ox=0,oy=0;
    const down=(e)=>{
      const p=window.pointFromEvent(e); const r=panel.getBoundingClientRect();
      sx=p.x; sy=p.y; ox=r.left; oy=r.top;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once:true });
    };
    const move=(e)=>{
      const p=window.pointFromEvent(e);
      const nx=window.clamp(ox+(p.x-sx),0,window.innerWidth-panel.offsetWidth);
      const ny=window.clamp(oy+(p.y-sy),0,window.innerHeight-panel.offsetHeight);
      panel.style.left=nx+'px'; panel.style.top=ny+'px';
      panel.querySelectorAll('.conn-point').forEach(cp=>positionPanelConn(cp,panel));
      window.updateConnectionsFor && window.updateConnectionsFor(panel);
    };
    const up=()=>{ window.removeEventListener('pointermove', move); savePanelGeom(panel); };
    handle.addEventListener('pointerdown', down);
  }
  /** Duplicate a node (clone settings, increment name, place near original). */
  function duplicateNode(hostEl){
    try{
      if (!hostEl) return null;
      const ownerId = hostEl.dataset.id||'';
      const type = hostEl.dataset.type||'coworker';
      const rect = hostEl.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const nx = Math.round(rect.left + scrollX + 28);
      const ny = Math.round(rect.top + scrollY + 28);
      // Read combined settings (Graph + localStorage)
      const lsKey = (id)=>`nodeSettings:${id}`;
      let saved = {};
      try{ if (window.graph && ownerId){ saved = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); } }catch{}
      try{ const raw = localStorage.getItem(lsKey(ownerId)); if (raw){ saved = Object.assign({}, saved, JSON.parse(raw)||{}); } }catch{}
      const origName = (saved.name || hostEl.dataset.displayName || (type==='coworker'?'CoWorker':type==='user'?'User':'Internet')).trim();
      const m = origName.match(/^(.*?)(?:\s+(\d+))$/);
      const base = (m ? m[1] : origName).trim();
      const nextNum = m ? (Number(m[2]) + 1) : 2;
      const newName = `${base} ${nextNum}`;
      // Create new node of same type
      let newEl = null;
      if (window.createIcon) newEl = window.createIcon(type, nx, ny);
      if (!newEl) return null;
      const newId = newEl.dataset.id||'';
      // Persist cloned settings with updated name
      const next = Object.assign({}, saved, { name: newName });
      try{ if (window.graph && newId) window.graph.setNodeSettings(newId, next); }catch{}
      try{ localStorage.setItem(lsKey(newId), JSON.stringify(next)); }catch{}
      // Clone attachments: copy persisted list and drop ephemeral blobUrl
      try{
        const attOldKey = `nodeAttachments:${ownerId}`;
        const attNewKey = `nodeAttachments:${newId}`;
        const raw = localStorage.getItem(attOldKey);
        if (raw){
          const items = (JSON.parse(raw)||[]).map(it=>{
            return {
              name: it.name || 'fil',
              text: String(it.text||''),
              chars: Number(it.chars||0),
              truncated: !!it.truncated,
              url: it.url || '',
              // omit blobUrl; optionally keep origUrl if present
              origUrl: it.origUrl || '',
              mime: it.mime || '',
              pages: Array.isArray(it.pages)? it.pages : []
            };
          });
          localStorage.setItem(attNewKey, JSON.stringify(items));
        }
      }catch{}
      // Update visual label on FAB
      try{ const lab = newEl.querySelector('.fab-label'); if (lab) lab.textContent = newName; newEl.dataset.displayName = newName; }catch{}
      // Announce coworker list change to refresh parking dropdowns
      try{ if (type === 'coworker') window.dispatchEvent(new CustomEvent('coworkers-changed')); }catch{}
      return newEl;
    }catch{ return null; }
  }
  try{ window.duplicateNode = duplicateNode; }catch{}
  /** Generic info panel (used as a simple fallback). */
  function openPanel(hostEl){
    const panel=document.createElement('section');
    panel.className='panel-flyout show';
    panel.dataset.sectionId='p'+Math.random().toString(36).slice(2,7);
    panel.dataset.ownerId=hostEl.dataset.id||'';
    positionPanelNear(panel, hostEl);
    panel.innerHTML=`
    <header class="drawer-head"><div class="brand">${hostEl.dataset.type==='user'?'User':hostEl.dataset.type==='internet'?'Internet':'CoWorker'}</div><button class="icon-btn" data-close>✕</button></header>
    <div class="messages">
      <div class="bubble">Detta är bara UI. Ingen logik körs.</div>
    </div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Skriv ett meddelande…"></textarea>
      <button class="send-btn">Skicka</button>
    </div>`;
    addResizeHandles(panel);
    document.body.appendChild(panel);
    makePanelDraggable(panel, panel.querySelector('.drawer-head'));
    try{ const g = loadPanelGeom(panel.dataset.ownerId||''); if (g) applyPanelGeom(panel, g); }catch{}
    panel.querySelector('[data-close]')?.addEventListener('click', ()=>panel.remove());
  }
  /** Open the appropriate panel for a node by its data-type. */
  function openPanelForNode(hostEl){
    if (hostEl.dataset.type==='user') openUserPanel(hostEl);
    else if (hostEl.dataset.type==='coworker') openCoworkerPanel(hostEl);
    else if (hostEl.dataset.type==='internet') { if (window.openInternetPanel) window.openInternetPanel(hostEl); else openPanel(hostEl); }
  }
  /** Wire a panel's composer (textarea + send) and message rendering. */
  function wireComposer(panel){ const ta=panel.querySelector('.userInput'); const send=panel.querySelector('.send-btn'); const list=panel.querySelector('.messages');
    // Send mode dropdown (default: current-only)
    const composerEl = panel.querySelector('.composer');
    const ownerId = panel.dataset.ownerId||'';
    const lsKey = (id)=>`nodeSettings:${id}`;
    // Persist unsent draft text per node so it survives panel close/reopen
    const draftKey = ownerId ? `nodeDraft:${ownerId}` : '';
    const readSaved = ()=>{ let s={}; try{ if(window.graph && ownerId) s = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{} try{ const raw = localStorage.getItem(lsKey(ownerId)); if(raw){ s = Object.assign({}, s, JSON.parse(raw)||{}); } }catch{} return s; };
    const persist = (partial)=>{ try{ if(window.graph && ownerId) window.graph.setNodeSettings(ownerId, partial||{}); }catch{} try{ const cur = readSaved(); const next = Object.assign({}, cur, partial||{}); localStorage.setItem(lsKey(ownerId), JSON.stringify(next)); }catch{} };
    // Load persisted draft into textarea on open
    try{ if (ta && draftKey){ const d = localStorage.getItem(draftKey); if (typeof d === 'string'){ ta.value = d; } } }catch{}
    // Auto-grow textarea up to max-height; then allow inner scroll
    const autosize = ()=>{
      try{
        if (!ta) return;
        const s = getComputedStyle(ta);
        const maxH = Math.max(80, parseInt(s.maxHeight||'300', 10)||300);
        ta.style.height = 'auto';
        const h = Math.min(ta.scrollHeight, maxH);
        ta.style.height = h + 'px';
        ta.style.overflowY = (ta.scrollHeight > maxH) ? 'auto' : 'hidden';
      }catch{}
    };
    // Save draft on input and resize
    try{
      if (ta){
        ta.addEventListener('input', ()=>{ try{ if (draftKey) localStorage.setItem(draftKey, ta.value||''); }catch{} autosize(); });
        // Initial autosize
        setTimeout(autosize, 0);
      }
    }catch{}
    const ensureSendModeUI = ()=>{
      if (!composerEl || !send) return;
      // Create a small toggle button and menu
      if (send._modeWired) return; send._modeWired = true;
      const wrap = document.createElement('span'); wrap.style.position='relative'; wrap.style.display='inline-block'; wrap.style.marginLeft='-4px';
      const btn = document.createElement('button'); btn.type='button'; btn.title='Sändläge'; btn.textContent='▾'; Object.assign(btn.style,{ background:'transparent', border:'1px solid #2a2a35', color:'#cfd3e3', borderRadius:'8px', padding:'0 8px', height:'28px', marginLeft:'4px', cursor:'pointer' });
      const menu = document.createElement('div'); menu.className='send-mode-menu hidden'; Object.assign(menu.style,{ position:'absolute', right:'0', bottom:'36px', minWidth:'220px', zIndex:'10050', display:'grid', gap:'4px', padding:'6px', background:'linear-gradient(180deg,#121219,#0e0e14)', border:'1px solid #23232b', borderRadius:'8px', boxShadow:'0 12px 28px rgba(0,0,0,0.55)' });
      menu.innerHTML = `
        <button type="button" data-mode="current" style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid #2a2a35; color:#e6e6ec; padding:6px 8px; border-radius:6px; cursor:pointer">Skicka bara nuvarande inmatning</button>
        <button type="button" data-mode="history-once" style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid #2a2a35; color:#e6e6ec; padding:6px 8px; border-radius:6px; cursor:pointer">Skicka all historik som ett meddelande</button>
        <button type="button" data-mode="history-seq" style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid #2a2a35; color:#e6e6ec; padding:6px 8px; border-radius:6px; cursor:pointer">Skicka historik en och en (äldst först)</button>
      `;
      const show = ()=>{ menu.classList.remove('hidden'); };
      const hide = ()=>{ menu.classList.add('hidden'); };
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); if (menu.classList.contains('hidden')) show(); else hide(); });
      document.addEventListener('click', (e)=>{ if (!menu.classList.contains('hidden')) hide(); });
      menu.addEventListener('click', (e)=>{
        const t = e.target.closest('button[data-mode]'); if (!t) return; const mode = t.getAttribute('data-mode'); panel._sendMode = mode; persist({ sendMode: mode }); hide();
      });
      // initialize from saved
      try{ const saved = readSaved(); if (saved.sendMode) panel._sendMode = String(saved.sendMode); else panel._sendMode = 'current'; }catch{ panel._sendMode = 'current'; }
      wrap.appendChild(btn); wrap.appendChild(menu);
      send.parentElement?.insertBefore(wrap, send.nextSibling);
    };
    ensureSendModeUI();
    // Ensure an attachments bar exists
  let attBar = panel.querySelector('[data-role="attachments"]');
  if (!attBar){ attBar = document.createElement('div'); attBar.className = 'attachments hidden'; attBar.setAttribute('data-role','attachments'); attBar.setAttribute('aria-label','Bilagor (drag & släpp)'); const composerEl = panel.querySelector('.composer'); if (composerEl) panel.insertBefore(attBar, composerEl); }
  // Load persisted attachments for this node so they survive panel close/open
  const ownerKey = panel.dataset.ownerId || '';
  const attKey = ownerKey ? `nodeAttachments:${ownerKey}` : '';
  const loadPersistedAtt = ()=>{ try{ if(!attKey) return []; const raw = localStorage.getItem(attKey); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
  const savePersistedAtt = (arr)=>{ try{ if(attKey) localStorage.setItem(attKey, JSON.stringify(arr||[])); }catch{} };
  panel._attachments = Array.isArray(panel._attachments) ? panel._attachments : loadPersistedAtt();
    const detectApiBase = ()=>{ try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{} try{ if (location.protocol === 'file:') return 'http://localhost:8000'; if (location.port && location.port !== '8000') return 'http://localhost:8000'; }catch{} return ''; };
  const renderAttachments = ()=>{ try{ if (!attBar) return; attBar.innerHTML=''; const items = panel._attachments||[]; if (!items.length){ attBar.classList.add('hidden'); savePersistedAtt([]); return; } attBar.classList.remove('hidden');
      // Collapsed state per node
      const collKey = attKey ? attKey+':collapsed' : null;
      let isCollapsed = false; try{ if(collKey){ isCollapsed = localStorage.getItem(collKey)==='1'; } }catch{}
      // Toggle pill
      const toggle = document.createElement('button'); toggle.type='button'; toggle.className='att-toggle'; toggle.title='Visa/dölj bilagor'; const cnt = items.length; const updLbl = ()=>{ toggle.textContent = (contentEl.classList.contains('collapsed') ? `Bilagor (${cnt}) ▸` : `Bilagor (${cnt}) ▾`); };
      // Content container (scrollable)
      const contentEl = document.createElement('div'); contentEl.className = 'att-content'; attBar.appendChild(toggle); attBar.appendChild(contentEl);
      if (isCollapsed) contentEl.classList.add('collapsed');
      updLbl();
      toggle.addEventListener('click', ()=>{ contentEl.classList.toggle('collapsed'); updLbl(); try{ if(collKey) localStorage.setItem(collKey, contentEl.classList.contains('collapsed')?'1':'0'); }catch{} });
      const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
      const pickSnippetAndPage = (att, hintText)=>{
        try{
          if (!isPdf(att) || !Array.isArray(att.pages) || !att.pages.length) return { page:null, q:'' };
          const q = String(hintText||'').trim().slice(0,120);
          if (!q) return { page:null, q:'' };
          // naive search: find first page containing a piece of q
          const tokens = q.split(/\s+/).filter(Boolean).slice(0,8);
          const needle = tokens.slice(0,3).join(' ');
          let best = null;
          for (const p of att.pages){
            const txt = String(p.text||''); if (!txt) continue;
            // try longer match first
            if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best = { page: Number(p.page)||null, q: needle }; break; }
            for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best = { page: Number(p.page)||null, q: tokens.slice(0,5).join(' ') }; break; } }
            if (best) break;
          }
          return best || { page:null, q: tokens.join(' ') };
        }catch{ return { page:null, q:'' }; }
      };
    const openAttachment = (x, opts) => {
        try{
      // Prefer persisted HTTP URL for reliable page fragment support
      let href = x.url || '';
      if (!href) href = x.origUrl || x.blobUrl || '';
          if (!href){ const blob = new Blob([String(x.text||'')], { type:(x.mime||'text/plain')+';charset=utf-8' }); href = URL.createObjectURL(blob); x.blobUrl = href; }
          // If PDF, open our viewer with the blob URL for better UX
          const usePdf = isPdf(x);
          let finalHref = href;
      if (usePdf && x.url){ // add page only when we have http(s) url served by backend
            try{
              const hint = (opts && typeof opts.hintText==='string') ? opts.hintText : '';
              const pick = pickSnippetAndPage(x, hint);
              if (pick && pick.page) finalHref = href + `#page=${encodeURIComponent(pick.page)}`;
            }catch{}
          }
  try{ openIfExists(finalHref); }
  catch{ const a = document.createElement('a'); a.href = finalHref; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
        }catch{}
      };
  items.forEach((it, idx)=>{ const chip = document.createElement('span'); chip.className = 'attachment-chip'; const name = document.createElement('span'); name.className='name'; const fullName = `${it.name||'fil'}${it.chars?` (${it.chars} tecken${it.truncated?', trunkerat':''})`:''}`; name.textContent = fullName; name.title = it.name || 'fil';
        // View/download link; route PDFs via viewer
  const view = document.createElement('a'); view.href = '#'; view.textContent = '↗'; view.title = 'Öppna material'; view.style.marginLeft = '6px'; view.addEventListener('click', (e)=>{ e.preventDefault(); openAttachment(it, { hintText: panel._lastAssistantText||'' }); });
  const rm = document.createElement('button'); rm.className='rm'; rm.type='button'; rm.title='Ta bort'; rm.textContent='×'; rm.addEventListener('click', ()=>{ try{ if (it.blobUrl) { try{ URL.revokeObjectURL(it.blobUrl); }catch{} } panel._attachments.splice(idx,1); savePersistedAtt(panel._attachments); renderAttachments(); }catch{} }); chip.appendChild(name); chip.appendChild(view); chip.appendChild(rm); contentEl.appendChild(chip); }); savePersistedAtt(items); }catch{} };
  // Initial render so persisted attachments are visible on open
  try{ renderAttachments(); }catch{}
  const uploadFiles = async (files)=>{
      try{
        const arr = Array.from(files||[]).filter(f=>{
          const n = (f.name||'').toLowerCase();
          const t = (f.type||'').toLowerCase();
          // Exclude HTML explicitly to avoid confusing page handling and XSS risk
          if (n.endsWith('.html') || n.endsWith('.htm') || t.includes('html')) return false;
          // Allow PDFs and common text/markdown docs
          return n.endsWith('.pdf') || n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown') || t.includes('pdf') || t.includes('text') || t.includes('markdown');
        });
        if (!arr.length) return;
    const fd = new FormData(); arr.forEach(f=>fd.append('files', f)); fd.append('maxChars','1000000'); // 1M max
        const apiBase = detectApiBase();
        const url = apiBase + '/upload?maxChars=1000000';
        const res = await fetch(url, { method:'POST', body: fd });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data.items)){
          const toAdd = data.items.map((x,i)=>{
            const f = arr[i];
            let origUrl = '';
            try{ if (f) origUrl = URL.createObjectURL(f); }catch{}
            const httpUrl = (x && typeof x.url === 'string') ? x.url : '';
            return { name: x.name|| (f?.name || 'fil'), text: String(x.text||''), chars: Number(x.chars||0), truncated: !!x.truncated, origUrl, url: httpUrl, mime: (f?.type||''), pages: Array.isArray(x.pages)? x.pages : [] };
          });
          panel._attachments.push(...toAdd);
          savePersistedAtt(panel._attachments);
          renderAttachments();
        }
      }catch(e){ console.warn('Upload error', e); }
    };
    // Drag & drop wiring: attach only to the panel to avoid duplicate bubbling
    panel.addEventListener('dragover', (e)=>{ try{ e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='copy'; }catch{} });
    panel.addEventListener('drop', (e)=>{ try{
      e.preventDefault(); e.stopPropagation();
      // guard: process a drop only once per event
      if (panel._lastDropStamp === e.timeStamp) return; panel._lastDropStamp = e.timeStamp;
      const files = e.dataTransfer?.files; if (files && files.length){ uploadFiles(files); }
    }catch{} });
    const append=(text, who='user', ts=Date.now())=>{ const row=document.createElement('div'); row.className='message-row'+(who==='user'?' user':''); const group=document.createElement('div'); group.className='msg-group'; const author=document.createElement('div'); author.className='author-label'; if(panel.classList.contains('user-node-panel') && who==='user'){ const name=(panel._displayName||'').trim()||'User'; author.textContent=name; } else { const nameEl=panel.querySelector('.drawer-head .meta .name'); author.textContent=(nameEl?.textContent||(who==='user'?'User':'Assistant')).trim(); } if(panel._nameFont) author.style.fontFamily=panel._nameFont; group.appendChild(author); const b=document.createElement('div'); b.className='bubble '+(who==='user'?'user':''); const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent=text; if(panel._textFont) textEl.style.fontFamily=panel._textFont; b.appendChild(textEl); const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (who==='user' ? 'right' : 'left'); meta.textContent = formatTime(ts); b.appendChild(meta); group.appendChild(b); row.appendChild(group); list.appendChild(row); if(panel.classList.contains('user-node-panel') && who==='user'){ const rgb=window.hexToRgb(panel._bubbleColorHex||'#7c5cff'); if(rgb){ const bg=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${panel._bgOn ? (panel._bubbleAlpha ?? 0.1) : 0})`; const border=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, panel._bgOn ? (panel._bubbleAlpha ?? 0.1) + 0.12 : 0.08)})`; b.style.backgroundColor=bg; b.style.borderColor=border; } } list.scrollTop=list.scrollHeight; };
    // Deprecated: attachments must never be sent out over connections.
    // Kept for potential local-only preview use, but DO NOT call when routing or calling backends.
    const buildMessageWithAttachments = (val)=>{ return val; };
  const clearAttachments = ()=>{ try{ panel._attachments = []; savePersistedAtt([]); renderAttachments(); }catch{} };
  const doSend=()=>{ const val=(ta.value||'').trim(); if(!val) return; const ownerId=panel.dataset.ownerId||null; const authorLabel = panel.querySelector('.drawer-head .meta .name'); const author = (authorLabel?.textContent||'User').trim(); let ts=Date.now(); try{ if(ownerId && window.graph){ const entry = window.graph.addMessage(ownerId, author, val, 'user'); ts = entry?.ts || ts; } }catch{} append(val,'user', ts);
      // Determine send mode
      let mode = 'current'; try{ mode = panel._sendMode || (readSaved().sendMode||'current'); }catch{}
      const entries = (window.graph && ownerId) ? (window.graph.getMessages(ownerId)||[]) : [];
      let lastSent = '';
      const sendCurrent = ()=>{ const msg = val; lastSent = msg; if(ownerId && window.routeMessageFrom){ try{ window.routeMessageFrom(ownerId, msg, { author, who:'user', ts }); }catch{} } };
      const sendHistoryOnce = ()=>{
        const parts = [];
        try{
          for (const m of entries){ const a = m.author || (m.who==='user'?'User':'Assistant'); const t = String(m.text||''); if (t) parts.push(`${a}: ${t}`); }
        }catch{}
        // include current input at the end
        if (val) parts.push(`${author}: ${val}`);
        const combined = parts.join('\n\n');
        lastSent = combined;
        if(ownerId && window.routeMessageFrom){ try{ window.routeMessageFrom(ownerId, combined, { author, who:'user', ts }); }catch{} }
      };
      const sendHistorySeq = ()=>{
        try{ for (const m of entries){ const t = String(m.text||''); if (t && ownerId && window.routeMessageFrom) window.routeMessageFrom(ownerId, t, { author, who:'user', ts }); } }catch{}
        // send current last (no attachments)
        sendCurrent();
      };
      if (mode === 'history-once') sendHistoryOnce();
      else if (mode === 'history-seq') sendHistorySeq();
      else sendCurrent();
  ta.value='';
  try{ if (draftKey) localStorage.removeItem(draftKey); }catch{}
  try{ autosize(); }catch{}
      // If Internet panel, kick off web-enabled reply via backend (no inline attachments)
  try{ const host = document.querySelector(`.fab[data-id="${ownerId}"]`); if(host && host.dataset.type==='internet' && window.requestInternetReply){ const payload = lastSent || val; window.requestInternetReply(ownerId, { text: payload }); } }catch{}
      // If CoWorker panel, optionally kick off AI reply via backend (self chat) if enabled in settings
      try{
        const host = document.querySelector(`.fab[data-id="${ownerId}"]`);
        if (host && host.dataset.type==='coworker' && window.requestAIReply){
          // check setting
          let allow = true;
          try{
            const raw = localStorage.getItem(`nodeSettings:${ownerId}`);
            if (raw){ const s = JSON.parse(raw)||{}; if (typeof s.selfPanelReply === 'boolean') allow = !!s.selfPanelReply; }
          }catch{}
          if (allow){
            const composed = val; // attachments handled internally by node/backend
            window.requestAIReply(ownerId, { text: composed, sourceId: ownerId });
          }
        }
      }catch{}
  }; send.addEventListener('click', doSend); ta.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); doSend(); } });
  // When panel is closed, keep attachments (persisted per coworker)
  panel.querySelector('[data-close]')?.addEventListener('click', ()=>{ /* keep attachments */ }); }
  /** Open the User panel with settings for name/fonts/colors and composer. */
  function openUserPanel(hostEl){
    const panel=document.createElement('section');
    panel.className='panel-flyout show user-node-panel';
    panel.dataset.sectionId='u'+Math.random().toString(36).slice(2,7);
    positionPanelNear(panel, hostEl);
    panel.style.width='360px'; panel.style.height='340px';
    panel.dataset.ownerId=hostEl.dataset.id||'';
    panel.innerHTML=`
  <header class="drawer-head" data-role="dragHandle">
      <div class="user-avatar">👤</div>
      <div class="meta"><div class="name">User</div></div>
  <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
  <button class="icon-btn" data-action="duplicate" title="Duplicera nod">⧉</button>
      <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
  <button class="icon-btn" data-action="delete" title="Radera">🗑</button>
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
      <label>Visningsläge
        <select data-role="renderMode">
          <option value="raw">Rå text</option>
          <option value="md" selected>Snyggt (Markdown)</option>
        </select>
      </label>
      <fieldset style="margin:8px 0; padding:8px; border:1px solid #28283a; border-radius:8px;">
        <legend class="subtle" style="padding:0 6px;">Chunkning</legend>
        <label class="inline">
          <input type="checkbox" data-role="chunkEnable" /> Aktivera chunkning
        </label>
        <div data-role="chunkScope" style="margin-left:20px; display:grid; gap:6px; margin-top:6px;">
          <label class="inline"><input type="checkbox" data-role="chunkNodeToNode" checked /> Mellan noder</label>
          <label class="inline"><input type="checkbox" data-role="chunkToSection" checked /> Till sektioner</label>
          <div style="display:grid; gap:6px;">
            <label class="inline"><input type="checkbox" data-role="chunkUseLines" checked /> Radchunkning (rader/batch)</label>
            <label style="margin-left:22px;">
              <input type="range" min="1" max="50" step="1" value="3" data-role="chunkAgg" />
              <div class="subtle"><span data-role="chunkAggValue">3</span> rader/batch</div>
            </label>
            <label class="inline"><input type="checkbox" data-role="chunkUseNumbering" /> Numrerad chunkning (1., 2), 3: ...)</label>
            <div class="subtle" style="margin-left:22px;">Splitta per numrerad rubrik så att varje del (t.ex. 1–10) blir en egen prompt.</div>
            <label class="inline" style="margin-left:22px;"><input type="checkbox" data-role="chunkTrimNumberedPreamble" /> Trimma preambel före numrerad lista till nästa nod</label>
          </div>
        </div>
      </fieldset>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <button type="button" class="btn danger" data-action="resetAll" title="Nollställ">Nollställ</button>
      </div>
    </div>
  <div class="messages"></div>
  <div class="attachments hidden" data-role="attachments" aria-label="Bilagor (drag & släpp)"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Skriv som människa…"></textarea>
      <button class="send-btn" type="button">➤</button>
    </div>`;
    addResizeHandles(panel);
    document.body.appendChild(panel);
    makePanelDraggable(panel, panel.querySelector('.drawer-head'));
    try{ const g = loadPanelGeom(panel.dataset.ownerId||''); if (g) applyPanelGeom(panel, g); }catch{}
    const settingsBtn=panel.querySelector('[data-action="settings"]'); const settings=panel.querySelector('[data-role="settings"]'); settingsBtn?.addEventListener('click', ()=>settings.classList.toggle('collapsed'));
  const clearBtn=panel.querySelector('[data-action="clear"]');
  // Duplicate node for User
  try{ const dupBtn = panel.querySelector('[data-action="duplicate"]'); dupBtn?.addEventListener('click', ()=>{ try{ duplicateNode(hostEl); }catch{} }); }catch{}
    clearBtn?.addEventListener('click', ()=>{
      try{
        const m=panel.querySelector('.messages'); if(m) m.innerHTML='';
        const ownerId = panel.dataset.ownerId||'';
        if (ownerId && window.graph && typeof window.graph.clearMessages==='function') window.graph.clearMessages(ownerId);
        panel._lastAssistantText = '';
      }catch{}
    });
    const delBtnU=panel.querySelector('[data-action="delete"]'); delBtnU?.addEventListener('click', ()=>{
      try{
        const ownerId = panel.dataset.ownerId||'';
        // Remove UI node
        const host = ownerId ? document.querySelector(`.fab[data-id="${ownerId}"]`) : null;
        if (host) host.remove();
        // Remove connections touching this node
        try{
          (window.state?.connections||[]).slice().forEach(c=>{
            if (c.fromId===ownerId || c.toId===ownerId){ try{ c.pathEl?.remove(); }catch{} try{ c.hitEl?.remove(); }catch{} }
          });
          if (window.state && Array.isArray(window.state.connections)) window.state.connections = window.state.connections.filter(c=> c.fromId!==ownerId && c.toId!==ownerId);
        }catch{}
        // Remove from Graph
        try{ if (window.graph && window.graph.nodes) window.graph.nodes.delete(ownerId); }catch{}
      }catch{}
      panel.remove();
    });
  panel._bubbleColorHex='#7c5cff'; panel._bubbleAlpha=0.10; panel._bgOn=true;
  const colorToggle=panel.querySelector('[data-role="colorToggle"]'); const colorPanel=panel.querySelector('[data-role="colorPanel"]'); const colorPicker=panel.querySelector('[data-role="colorPicker"]'); const alphaEl=panel.querySelector('[data-role="alpha"]'); const alphaVal=panel.querySelector('[data-role="alphaVal"]'); const fontTextSel=panel.querySelector('[data-role="fontText"]'); const fontNameSel=panel.querySelector('[data-role="fontName"]'); const messagesEl=panel.querySelector('.messages'); const inputEl=panel.querySelector('.userInput'); const renderSel=panel.querySelector('[data-role="renderMode"]');
    if(colorPicker) colorPicker.value=panel._bubbleColorHex; if(colorToggle) colorToggle.style.background=panel._bubbleColorHex; if(alphaEl) alphaEl.value=String(Math.round(panel._bubbleAlpha*100)); if(alphaVal) alphaVal.textContent=`${Math.round(panel._bubbleAlpha*100)}%`;
    panel._textFont = fontTextSel ? fontTextSel.value : 'system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._nameFont = fontNameSel ? fontNameSel.value : 'system-ui, Segoe UI, Roboto, Arial, sans-serif'; if(messagesEl) messagesEl.style.fontFamily=panel._textFont; if(inputEl) inputEl.style.fontFamily=panel._textFont; const headerNameElInit=panel.querySelector('.drawer-head .meta .name'); if(headerNameElInit) headerNameElInit.style.fontFamily=panel._nameFont; const userFabLabel=hostEl.querySelector('.fab-label'); if(userFabLabel) userFabLabel.style.fontFamily=panel._nameFont;
    const applyBubbleStyles=()=>{ const rgb=window.hexToRgb(panel._bubbleColorHex); if(!rgb) return; const bg=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${panel._bgOn ? panel._bubbleAlpha : 0})`; const border=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, panel._bgOn ? panel._bubbleAlpha + 0.12 : 0.08)})`; panel.querySelectorAll('.bubble.user').forEach(b=>{ b.style.backgroundColor=bg; b.style.borderColor=border; }); };
    const colorField=panel.querySelector('label.color-field'); colorToggle?.addEventListener('click',(e)=>{ e.stopPropagation(); const collapsed=colorPanel?.classList.contains('collapsed'); if(colorPanel) colorPanel.classList.toggle('collapsed'); if(colorToggle) colorToggle.setAttribute('aria-expanded', collapsed?'true':'false'); });
    const onDocClick=(ev)=>{ if(!colorPanel || colorPanel.classList.contains('collapsed')) return; if(!colorField?.contains(ev.target)){ colorPanel.classList.add('collapsed'); colorToggle?.setAttribute('aria-expanded','false'); } };
    document.addEventListener('click', onDocClick);
    colorPicker?.addEventListener('input', ()=>{ panel._bubbleColorHex=colorPicker.value||'#7c5cff'; if(colorToggle) colorToggle.style.background=panel._bubbleColorHex; applyBubbleStyles(); });
    alphaEl?.addEventListener('input', ()=>{ const v=Math.max(0, Math.min(100, Number(alphaEl.value)||0)); panel._bubbleAlpha=v/100; if(alphaVal) alphaVal.textContent=`${v}%`; applyBubbleStyles(); });
    fontTextSel?.addEventListener('change', ()=>{ panel._textFont=fontTextSel.value; if(messagesEl) messagesEl.style.fontFamily=panel._textFont; if(inputEl) inputEl.style.fontFamily=panel._textFont; });
    fontNameSel?.addEventListener('change', ()=>{ panel._nameFont=fontNameSel.value; const hn=panel.querySelector('.drawer-head .meta .name'); if(hn) hn.style.fontFamily=panel._nameFont; const lab=hostEl.querySelector('.fab-label'); if(lab) lab.style.fontFamily=panel._nameFont; panel.querySelectorAll('.author-label').forEach(el=>{ el.style.fontFamily=panel._nameFont; }); });
  // Persist and initialize User display name (align with coworker persistence)
  const headerNameEl=panel.querySelector('.drawer-head .meta .name');
  const nameInput=panel.querySelector('[data-role="name"]');
  panel._displayName='';
  const ownerIdU = panel.dataset.ownerId||'';
  const lsKeyU = (id)=>`nodeSettings:${id}`;
  const readSavedU = ()=>{ try{ const raw = ownerIdU ? localStorage.getItem(lsKeyU(ownerIdU)) : null; return raw ? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
  const persistU = (partial)=>{ try{ if(!ownerIdU) return; const cur = readSavedU(); const next = Object.assign({}, cur, partial||{}); localStorage.setItem(lsKeyU(ownerIdU), JSON.stringify(next)); }catch{} };
  const updateFabLabel=(text)=>{ const lab=hostEl.querySelector('.fab-label'); if(lab) lab.textContent=text; };
  const applyUserName = (val)=>{ const txt=(val||'').trim()||'User'; if(headerNameEl) headerNameEl.textContent=txt; updateFabLabel(txt); try{ hostEl.dataset.displayName = txt; }catch{} };
  // Initialize from saved userDisplayName if present
  try{ const saved = readSavedU(); const initName = (typeof saved.userDisplayName==='string' && saved.userDisplayName.trim()) ? saved.userDisplayName : (hostEl.dataset.displayName||'User'); if(nameInput) nameInput.value = initName; applyUserName(initName); }catch{ applyUserName(hostEl.dataset.displayName||'User'); }
  nameInput?.addEventListener('input', ()=>{ panel._displayName=(nameInput.value||''); const nameText=panel._displayName.trim()||'User'; applyUserName(nameText); persistU({ userDisplayName: nameText }); });
  // Initialize chunking controls (User: no token chunking)
  try{
    const chunkEnableEl = panel.querySelector('[data-role="chunkEnable"]');
    const chunkScopeWrap = panel.querySelector('[data-role="chunkScope"]');
    const chunkNodeToNodeEl = panel.querySelector('[data-role="chunkNodeToNode"]');
    const chunkToSectionEl = panel.querySelector('[data-role="chunkToSection"]');
    const chunkUseLinesEl = panel.querySelector('[data-role="chunkUseLines"]');
    const chunkUseNumberingEl = panel.querySelector('[data-role="chunkUseNumbering"]');
  const chunkTrimNumPreEl = panel.querySelector('[data-role="chunkTrimNumberedPreamble"]');
    const chunkAggEl = panel.querySelector('[data-role="chunkAgg"]');
    const chunkAggVal = panel.querySelector('[data-role="chunkAggValue"]');
    const savedU = readSavedU();
    if (chunkEnableEl) chunkEnableEl.checked = !!savedU.chunkingEnabled;
    if (chunkScopeWrap){ const en = !!chunkEnableEl?.checked; chunkScopeWrap.style.opacity = en ? '1' : '0.6'; chunkScopeWrap.style.pointerEvents = en ? '' : 'none'; }
    if (chunkNodeToNodeEl) chunkNodeToNodeEl.checked = (savedU.chunkNodeToNode!==undefined) ? !!savedU.chunkNodeToNode : true;
    if (chunkToSectionEl) chunkToSectionEl.checked = (savedU.chunkToSection!==undefined) ? !!savedU.chunkToSection : true;
    if (chunkUseLinesEl) chunkUseLinesEl.checked = (savedU.chunkUseLines!==undefined) ? !!savedU.chunkUseLines : true;
    if (chunkUseNumberingEl) chunkUseNumberingEl.checked = (savedU.chunkUseNumbering!==undefined) ? !!savedU.chunkUseNumbering : false;
  if (chunkTrimNumPreEl) chunkTrimNumPreEl.checked = (savedU.chunkTrimNumberedPreamble!==undefined) ? !!savedU.chunkTrimNumberedPreamble : false;
    if (chunkAggEl){ const n=Math.max(1, Math.min(50, Number(savedU.chunkBatchSize||3))); chunkAggEl.value=String(n); if (chunkAggVal) chunkAggVal.textContent=String(n); }
    const updateChunkUIU = ()=>{ try{ const en = !!chunkEnableEl?.checked; if (chunkScopeWrap){ chunkScopeWrap.style.opacity = en ? '1' : '0.6'; chunkScopeWrap.style.pointerEvents = en ? '' : 'none'; } }catch{} };
    chunkEnableEl?.addEventListener('change', ()=>{ persistU({ chunkingEnabled: !!chunkEnableEl.checked }); updateChunkUIU(); });
    chunkNodeToNodeEl?.addEventListener('change', ()=>persistU({ chunkNodeToNode: !!chunkNodeToNodeEl.checked }));
    chunkToSectionEl?.addEventListener('change', ()=>persistU({ chunkToSection: !!chunkToSectionEl.checked }));
    chunkUseLinesEl?.addEventListener('change', ()=>persistU({ chunkUseLines: !!chunkUseLinesEl.checked }));
    chunkUseNumberingEl?.addEventListener('change', ()=>persistU({ chunkUseNumbering: !!chunkUseNumberingEl.checked }));
  chunkTrimNumPreEl?.addEventListener('change', ()=>persistU({ chunkTrimNumberedPreamble: !!chunkTrimNumPreEl.checked }));
    chunkAggEl?.addEventListener('input', ()=>{ const n=Math.max(1, Math.min(50, Number(chunkAggEl.value)||3)); if (chunkAggVal) chunkAggVal.textContent=String(n); persistU({ chunkBatchSize: n }); });
  }catch{}
  panel.querySelector('[data-action="resetAll"]')?.addEventListener('click', ()=>{ panel._bubbleColorHex='#7c5cff'; panel._bubbleAlpha=0.10; panel._bgOn=true; const m=messagesEl; if(m) m.innerHTML=''; if(colorPicker) colorPicker.value=panel._bubbleColorHex; if(colorToggle) colorToggle.style.background=panel._bubbleColorHex; if(alphaEl) alphaEl.value='10'; if(alphaVal) alphaVal.textContent='10%'; if(fontTextSel){ fontTextSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._textFont=fontTextSel.value; if(messagesEl) messagesEl.style.fontFamily=panel._textFont; if(inputEl) inputEl.style.fontFamily=panel._textFont; } if(fontNameSel){ fontNameSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._nameFont=fontNameSel.value; const hn=panel.querySelector('.drawer-head .meta .name'); if(hn) hn.style.fontFamily=panel._nameFont; const lab=hostEl.querySelector('.fab-label'); if(lab) lab.style.fontFamily=panel._nameFont; panel.querySelectorAll('.author-label').forEach(el=>{ el.style.fontFamily=panel._nameFont; }); } if(renderSel){ renderSel.value='md'; } applyBubbleStyles(); });
  panel.querySelector('[data-close]')?.addEventListener('click', ()=>{ document.removeEventListener('click', onDocClick); panel.remove(); });
    // Render historical messages if any
  try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      // Determine render mode for user panel
  let renderMode = 'md';
      try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if(raw){ const s=JSON.parse(raw)||{}; if (s.userRenderMode) renderMode = String(s.userRenderMode); } }catch{}
      if (renderSel){ try{ renderSel.value = renderMode; }catch{} renderSel.addEventListener('change', ()=>{ try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); const cur = raw? JSON.parse(raw):{}; const next = Object.assign({}, cur, { userRenderMode: renderSel.value }); localStorage.setItem(`nodeSettings:${ownerId}`, JSON.stringify(next)); }catch{} }); }
      for(const m of entries){
        const row=document.createElement('div'); row.className='message-row'+(m.who==='user'?' user':'');
        const group=document.createElement('div'); group.className='msg-group';
        const author=document.createElement('div'); author.className='author-label'; author.textContent = m.author || (m.who==='user'?'User':'Assistant');
        const b=document.createElement('div'); b.className='bubble '+(m.who==='user'?'user':'');
        const textEl=document.createElement('div'); textEl.className='msg-text';
        const content = String(m.text||'');
        if (renderMode === 'md' && window.mdToHtml){
          try{ textEl.innerHTML = sanitizeHtml(window.mdToHtml(content)); }
          catch{ textEl.textContent = content; }
        } else {
          textEl.textContent = content;
        }
        b.appendChild(textEl); const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (m.who==='user' ? 'right' : 'left'); meta.textContent = formatTime(m.ts); b.appendChild(meta); group.appendChild(author); group.appendChild(b); row.appendChild(group); list?.appendChild(row);
      }
      list && (list.scrollTop = list.scrollHeight);
    }catch{}
    wireComposer(panel);
    wirePanelResize(panel);
  }
  /** Open the CoWorker panel with mock config fields and composer. */
  function openCoworkerPanel(hostEl){ const panel=document.createElement('section'); panel.className='panel-flyout show'; panel.dataset.sectionId='c'+Math.random().toString(36).slice(2,7); positionPanelNear(panel, hostEl); panel.style.width='420px'; panel.style.height='360px'; panel.dataset.ownerId=hostEl.dataset.id||''; const gradId='hexGradHdr_'+Math.random().toString(36).slice(2,8); const headerName = (hostEl.dataset.displayName||'CoWorker'); panel.innerHTML=`
    <header class="drawer-head" data-role="dragHandle">
      <div class="hex-avatar" title="CoWorker">
        <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="geometricPrecision">
          <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c5cff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient></defs>
          <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke="url(#${gradId})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
        </svg>
      </div>
  <div class="meta"><div class="name">${headerName}</div></div>
      <span class="badge" data-role="roleBadge" title="Roll">Roll</span>
      <span class="badge badge-error" data-role="keyStatus">Ingen nyckel</span>
  <button class="btn btn-ghost" data-action="settings">Inställningar ▾</button>
  <button class="icon-btn" data-action="duplicate" title="Duplicera nod">⧉</button>
      <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
      <button class="icon-btn" data-action="delete" title="Radera">🗑</button>
      <button class="icon-btn" data-close>✕</button>
    </header>
    <div class="settings collapsed" data-role="settings">
      <label>Modell (text)
        <select data-role="model">
          <option value="gpt-4o-mini" selected>gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4.1-turbo">gpt-4.1-turbo</option>
          <option value="gpt-5">gpt-5</option>
          <option value="gpt-5-mini">gpt-5-mini</option>
          <option value="gpt-5-nano">gpt-5-nano</option>
          <option value="3o">3o</option>
        </select>
      </label>
      <label>Modell (Python)
        <select data-role="modelPy">
          <option value="gpt-4o-mini" selected>gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4.1-turbo">gpt-4.1-turbo</option>
          <option value="gpt-5">gpt-5</option>
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
      <label class="inline">
        <input type="checkbox" data-role="selfReply" checked /> Svara från denna panel (självchatt)
      </label>
      <label>Max tokens
        <input type="range" min="1000" max="30000" step="64" value="1000" data-role="maxTokens" />
        <div class="subtle"><span data-role="maxTokensValue">1000</span></div>
      </label>
      
      <fieldset style="margin:8px 0; padding:8px; border:1px solid #28283a; border-radius:8px;">
        <legend class="subtle" style="padding:0 6px;">Chunkning</legend>
        <label class="inline">
          <input type="checkbox" data-role="chunkEnable" /> Aktivera chunkning
        </label>
        <div data-role="chunkScope" style="margin-left:20px; display:grid; gap:6px; margin-top:6px;">
          <label class="inline"><input type="checkbox" data-role="chunkNodeToNode" checked /> Mellan noder</label>
          <label class="inline"><input type="checkbox" data-role="chunkToSection" checked /> Till sektioner</label>
          <div style="display:grid; gap:6px;">
            <label class="inline"><input type="checkbox" data-role="chunkUseLines" checked /> Radchunkning (rader/batch)</label>
            <label style="margin-left:22px;">
              <input type="range" min="1" max="50" step="1" value="3" data-role="chunkAgg" />
              <div class="subtle"><span data-role="chunkAggValue">3</span> rader/batch</div>
            </label>
            <label class="inline"><input type="checkbox" data-role="chunkUseNumbering" /> Numrerad chunkning (1., 2), 3: ...)</label>
            <div class="subtle" style="margin-left:22px;">Splitta per numrerad rubrik så att varje del (t.ex. 1–10) blir en egen prompt.</div>
            <label class="inline" style="margin-left:22px;"><input type="checkbox" data-role="chunkTrimNumberedPreamble" /> Trimma preambel före numrerad lista till nästa nod</label>
            <label class="inline"><input type="checkbox" data-role="chunkUseTokens" /> Tokenchunkning (tokens/batch)</label>
            <label style="margin-left:22px;">
              <input type="range" min="200" max="2000" step="50" value="800" data-role="chunkToken" />
              <div class="subtle"><span data-role="chunkTokenValue">800</span> tokens/batch</div>
            </label>
          </div>
        </div>
      </fieldset>
      
      <label>Visningsläge
        <select data-role="renderMode">
          <option value="raw">Rå text</option>
          <option value="md" selected>Snyggt (Markdown)</option>
        </select>
      </label>
      <label>API-nyckel (denna copilot)
        <input type="password" placeholder="Valfri – annars används global" data-role="apiKey" />
      </label>
      <fieldset style="margin:8px 0; padding:8px; border:1px solid #28283a; border-radius:8px;">
        <legend class="subtle" style="padding:0 6px;">Verktyg</legend>
        <label class="inline"><input type="checkbox" data-role="enableTools" /> Tillåt verktyg (function calling)</label>
        <div class="subtle" style="margin-left:22px;">Aktivera t.ex. Python‑verktyget så att modellen kan köra kod.</div>
        <label class="inline" style="margin-top:6px; display:block;">
          <input type="checkbox" data-role="forcePython" /> Kräv Python vid beräkningar (tvinga run_python)
        </label>
      </fieldset>
    </div>
    <div class="messages" data-role="messages"></div>
    <div class="attachments hidden" data-role="attachments" aria-label="Bilagor (drag & släpp)"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Skriv ett meddelande..."></textarea>
      <button class="send-btn" type="button">Skicka</button>
      <button class="cancel-btn btn btn-ghost" type="button" style="display:none; margin-left:6px;">Avbryt</button>
    </div>`;
  addResizeHandles(panel); document.body.appendChild(panel); makePanelDraggable(panel, panel.querySelector('.drawer-head'));
  try{ const g = loadPanelGeom(panel.dataset.ownerId||''); if (g) applyPanelGeom(panel, g); }catch{}
  // Wire Cancel visibility to in-flight state
  try{
    const ownerId = panel.dataset.ownerId||'';
    const cancelBtn = panel.querySelector('.cancel-btn');
    const updateCancel = ()=>{ try{ const on = (window.hasActiveAIRequest && ownerId)? window.hasActiveAIRequest(ownerId) : false; if (cancelBtn) cancelBtn.style.display = on ? '' : 'none'; }catch{} };
    updateCancel();
    window.addEventListener('ai-request-started', (e)=>{ try{ if (String(e?.detail?.ownerId||'')===ownerId) updateCancel(); }catch{} });
    window.addEventListener('ai-request-finished', (e)=>{ try{ if (String(e?.detail?.ownerId||'')===ownerId) setTimeout(updateCancel, 50); }catch{} });
    cancelBtn?.addEventListener('click', ()=>{ try{ if (window.cancelAIRequest) window.cancelAIRequest(ownerId); updateCancel(); }catch{} });
  }catch{}
    const settingsBtn=panel.querySelector('[data-action="settings"]'); const settings=panel.querySelector('[data-role="settings"]'); settingsBtn?.addEventListener('click', ()=>settings.classList.toggle('collapsed'));
  const clearBtn=panel.querySelector('[data-action="clear"]');
  // Duplicate node: clone settings + name with increment
  try{ const dupBtn = panel.querySelector('[data-action="duplicate"]'); dupBtn?.addEventListener('click', ()=>{ try{ duplicateNode(hostEl); }catch{} }); }catch{}
    clearBtn?.addEventListener('click', ()=>{
      try{
        const m=panel.querySelector('.messages'); if(m) m.innerHTML='';
        const ownerId = panel.dataset.ownerId||'';
        if (ownerId && window.graph && typeof window.graph.clearMessages==='function') window.graph.clearMessages(ownerId);
        panel._lastAssistantText = '';
      }catch{}
    });
    const delBtn=panel.querySelector('[data-action="delete"]'); delBtn?.addEventListener('click', ()=>{
      try{
        const ownerId = panel.dataset.ownerId||'';
        // Remove UI node
        const host = ownerId ? document.querySelector(`.fab[data-id="${ownerId}"]`) : null;
        if (host) host.remove();
        // Remove connections touching this node
        try{
          (window.state?.connections||[]).slice().forEach(c=>{
            if (c.fromId===ownerId || c.toId===ownerId){ try{ c.pathEl?.remove(); }catch{} try{ c.hitEl?.remove(); }catch{} }
          });
          if (window.state && Array.isArray(window.state.connections)) window.state.connections = window.state.connections.filter(c=> c.fromId!==ownerId && c.toId!==ownerId);
        }catch{}
        // Remove from Graph
        try{ if (window.graph && window.graph.nodes) window.graph.nodes.delete(ownerId); }catch{}
      }catch{}
      panel.remove();
    });
    panel.querySelector('[data-close]')?.addEventListener('click', ()=>panel.remove());
    // Settings persistence wiring (Graph + localStorage)
    try{
      const ownerId = panel.dataset.ownerId||'';
      const lsKey = (id)=>`nodeSettings:${id}`;
      const detectApiBase = ()=>{
        try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{}
        try{
          if (location.protocol === 'file:') return 'http://localhost:8000';
          if (location.port && location.port !== '8000') return 'http://localhost:8000';
        }catch{}
        return '';
      };
      const apiBase = detectApiBase();
      let hasGlobalKey = false;
      // fetch global key status once
      try{
        fetch(apiBase + '/key-status').then(r=>r.json()).then(d=>{ hasGlobalKey = !!(d && d.hasKey); updateKeyBadge(); }).catch(()=>{ hasGlobalKey=false; updateKeyBadge(); });
      }catch{}
      const readSaved = ()=>{
        let s = {};
        try{ if(window.graph && ownerId) s = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{}
        try{ const raw = localStorage.getItem(lsKey(ownerId)); if(raw){ s = Object.assign({}, s, JSON.parse(raw)||{}); } }catch{}
        return s;
      };
      const persist = (partial)=>{
        try{ if(window.graph && ownerId) window.graph.setNodeSettings(ownerId, partial||{}); }catch{}
        try{ const cur = readSaved(); const next = Object.assign({}, cur, partial||{}); localStorage.setItem(lsKey(ownerId), JSON.stringify(next)); }catch{}
      };
      const by = (sel)=>panel.querySelector(sel);
  const modelEl = by('[data-role="model"]');
  const modelPyEl = by('[data-role="modelPy"]');
      const nameEl = by('[data-role="name"]');
      const topicEl = by('[data-role="topic"]');
      const roleEl = by('[data-role="role"]');
      const useRoleEl = by('[data-role="useRole"]');
  const selfReplyEl = by('[data-role="selfReply"]');
      const maxTokEl = by('[data-role="maxTokens"]');
      const maxTokVal = by('[data-role="maxTokensValue"]');
  // Chunking controls
  const chunkEnableEl = by('[data-role="chunkEnable"]');
  const chunkScopeWrap = by('[data-role="chunkScope"]');
  const chunkNodeToNodeEl = by('[data-role="chunkNodeToNode"]');
  const chunkToSectionEl = by('[data-role="chunkToSection"]');
  const chunkAggEl = by('[data-role="chunkAgg"]');
  const chunkAggVal = by('[data-role="chunkAggValue"]');
  const chunkUseLinesEl = by('[data-role="chunkUseLines"]');
  const chunkUseTokensEl = by('[data-role="chunkUseTokens"]');
  const chunkTokenEl = by('[data-role="chunkToken"]');
  const chunkTokenVal = by('[data-role="chunkTokenValue"]');
  const chunkUseNumberingEl = by('[data-role="chunkUseNumbering"]');
  const chunkTrimNumPreEl = by('[data-role\="chunkTrimNumberedPreamble\"]');
      
      const renderEl = by('[data-role="renderMode"]');
  // Web search settings removed from CoWorker; handled by Internet node
  const apiKeyEl = by('[data-role="apiKey"]');
  const enableToolsEl = by('[data-role="enableTools"]');
  const forcePythonEl = by('[data-role="forcePython"]');
      const keyBadge = by('[data-role="keyStatus"]');
      const roleBadge = by('[data-role="roleBadge"]');
      const headerNameEl = panel.querySelector('.drawer-head .meta .name');
      const updateKeyBadge = ()=>{
        try{
          const hasLocal = !!(apiKeyEl && apiKeyEl.value);
          if (!keyBadge) return;
          if (hasLocal){
            keyBadge.textContent = 'Lokal nyckel';
            keyBadge.classList.add('badge-success');
            keyBadge.classList.remove('badge-error');
          } else if (hasGlobalKey){
            keyBadge.textContent = 'Global nyckel';
            keyBadge.classList.add('badge-success');
            keyBadge.classList.remove('badge-error');
          } else {
            keyBadge.textContent = 'Ingen nyckel';
            keyBadge.classList.remove('badge-success');
            keyBadge.classList.add('badge-error');
          }
        }catch{}
      };
      const updateRoleBadge = ()=>{
        try{
          if (!roleBadge) return;
          const include = !!(useRoleEl && useRoleEl.checked);
          const roleTxt = (roleEl && roleEl.value ? String(roleEl.value).trim() : '');
          const topicTxt = (topicEl && topicEl.value ? String(topicEl.value).trim() : '');
          const active = include && (roleTxt || topicTxt);
          roleBadge.style.display = active ? '' : 'none';
          roleBadge.textContent = 'Roll';
          roleBadge.classList.toggle('badge-success', active);
          let tip = 'Roll';
          if (roleTxt) tip += `: ${roleTxt}`;
          if (topicTxt) tip += (roleTxt ? '\n' : ': ') + `Topic: ${topicTxt}`;
          roleBadge.title = tip;
        }catch{}
      };
      const updateName = (name)=>{
        const nm = (name||'').trim() || (hostEl.dataset.displayName||'CoWorker');
        if(headerNameEl) headerNameEl.textContent = nm;
        try{ const fabLab = hostEl.querySelector('.fab-label'); if(fabLab) fabLab.textContent = nm; }catch{}
        try{ hostEl.dataset.displayName = nm; }catch{}
        // Announce coworker list change so parking selectors can refresh labels
        try{ if ((hostEl.dataset.type||'') === 'coworker') window.dispatchEvent(new CustomEvent('coworkers-changed')); }catch{}
      };
      const saved = readSaved();
      // Initialize controls from saved settings
  if (saved.model && modelEl) modelEl.value = saved.model;
  if (saved.modelPy && modelPyEl) modelPyEl.value = saved.modelPy;
      if (saved.name && nameEl) { nameEl.value = saved.name; updateName(saved.name); }
      if (saved.topic && topicEl) topicEl.value = saved.topic;
      if (saved.role && roleEl) roleEl.value = saved.role;
      if (typeof saved.useRole === 'boolean' && useRoleEl) useRoleEl.checked = !!saved.useRole;
  if (typeof saved.selfPanelReply === 'boolean' && selfReplyEl) selfReplyEl.checked = !!saved.selfPanelReply; else if (selfReplyEl && saved.selfPanelReply === undefined) selfReplyEl.checked = true;
      if (saved.maxTokens && maxTokEl) { maxTokEl.value = String(saved.maxTokens); if(maxTokVal) maxTokVal.textContent = String(saved.maxTokens); }
      // Initialize chunking
      try{
        const en = !!saved.chunkingEnabled; if (chunkEnableEl) chunkEnableEl.checked = en;
        if (chunkScopeWrap) chunkScopeWrap.style.opacity = en ? '1' : '0.6';
        if (chunkScopeWrap) chunkScopeWrap.style.pointerEvents = en ? '' : 'none';
        if (chunkNodeToNodeEl) chunkNodeToNodeEl.checked = (saved.chunkNodeToNode!==undefined) ? !!saved.chunkNodeToNode : true;
        if (chunkToSectionEl) chunkToSectionEl.checked = (saved.chunkToSection!==undefined) ? !!saved.chunkToSection : true;
        if (chunkAggEl) chunkAggEl.value = String(Math.max(1, Math.min(50, Number(saved.chunkBatchSize||3))));
        if (chunkAggVal) chunkAggVal.textContent = String(Math.max(1, Math.min(50, Number(saved.chunkBatchSize||3))));
        // Defaults: use lines ON, use tokens OFF unless previously saved
        if (chunkUseLinesEl) chunkUseLinesEl.checked = (saved.chunkUseLines!==undefined) ? !!saved.chunkUseLines : true;
        if (chunkUseTokensEl) chunkUseTokensEl.checked = (saved.chunkUseTokens!==undefined) ? !!saved.chunkUseTokens : false;
  if (chunkUseNumberingEl) chunkUseNumberingEl.checked = (saved.chunkUseNumbering!==undefined) ? !!saved.chunkUseNumbering : false;
  if (chunkTrimNumPreEl) chunkTrimNumPreEl.checked = (saved.chunkTrimNumberedPreamble!==undefined) ? !!saved.chunkTrimNumberedPreamble : false;
        const tokSize = Math.max(200, Math.min(2000, Number(saved.chunkTokenSize||800)));
        if (chunkTokenEl) chunkTokenEl.value = String(tokSize);
        if (chunkTokenVal) chunkTokenVal.textContent = String(tokSize);
      }catch{}
      
      if (saved.renderMode && renderEl) renderEl.value = saved.renderMode;
  // no web settings for coworker anymore
  if (saved.apiKey && apiKeyEl) { apiKeyEl.value = saved.apiKey; }
      if (enableToolsEl){
        if (saved.enableTools === undefined){
          enableToolsEl.checked = true;
          try{ persist({ enableTools: true }); }catch{}
        } else {
          enableToolsEl.checked = !!saved.enableTools;
        }
      }
      if (forcePythonEl){
        if (saved.forcePython === undefined){
          forcePythonEl.checked = true;
          try{ persist({ forcePython: true }); }catch{}
        } else {
          forcePythonEl.checked = !!saved.forcePython;
        }
      }
      updateKeyBadge();
      updateRoleBadge();
      // Wire events to persist immediately
  modelEl?.addEventListener('change', ()=>persist({ model: modelEl.value }));
  modelPyEl?.addEventListener('change', ()=>persist({ modelPy: modelPyEl.value }));
      nameEl?.addEventListener('input', ()=>{ const v=nameEl.value||''; updateName(v); persist({ name: v }); });
      topicEl?.addEventListener('input', ()=>{ persist({ topic: topicEl.value||'' }); updateRoleBadge(); });
      roleEl?.addEventListener('input', ()=>{ persist({ role: roleEl.value||'' }); updateRoleBadge(); });
      useRoleEl?.addEventListener('change', ()=>{ persist({ useRole: !!useRoleEl.checked }); updateRoleBadge(); });
  selfReplyEl?.addEventListener('change', ()=>{ persist({ selfPanelReply: !!selfReplyEl.checked }); });
      maxTokEl?.addEventListener('input', ()=>{ const v=Math.max(256, Math.min(30000, Number(maxTokEl.value)||1000)); if(maxTokVal) maxTokVal.textContent=String(v); persist({ maxTokens: v }); });
      // Chunking listeners
      const updateChunkUI = ()=>{ try{ const en = !!(chunkEnableEl && chunkEnableEl.checked); if (chunkScopeWrap){ chunkScopeWrap.style.opacity = en ? '1' : '0.6'; chunkScopeWrap.style.pointerEvents = en ? '' : 'none'; } }catch{} };
      chunkEnableEl?.addEventListener('change', ()=>{ persist({ chunkingEnabled: !!chunkEnableEl.checked }); updateChunkUI(); });
  chunkNodeToNodeEl?.addEventListener('change', ()=>{ persist({ chunkNodeToNode: !!chunkNodeToNodeEl.checked }); });
  chunkToSectionEl?.addEventListener('change', ()=>{ persist({ chunkToSection: !!chunkToSectionEl.checked }); });
  chunkAggEl?.addEventListener('input', ()=>{ const n=Math.max(1, Math.min(50, Number(chunkAggEl.value)||3)); if (chunkAggVal) chunkAggVal.textContent=String(n); persist({ chunkBatchSize: n }); });
  chunkUseLinesEl?.addEventListener('change', ()=>{ persist({ chunkUseLines: !!chunkUseLinesEl.checked }); });
  chunkUseTokensEl?.addEventListener('change', ()=>{ persist({ chunkUseTokens: !!chunkUseTokensEl.checked }); });
  chunkUseNumberingEl?.addEventListener('change', ()=>{ persist({ chunkUseNumbering: !!chunkUseNumberingEl.checked }); });
  chunkTrimNumPreEl?.addEventListener('change', ()=>{ persist({ chunkTrimNumberedPreamble: !!chunkTrimNumPreEl.checked }); });
  chunkTokenEl?.addEventListener('input', ()=>{ const n=Math.max(200, Math.min(2000, Number(chunkTokenEl.value)||800)); if (chunkTokenVal) chunkTokenVal.textContent = String(n); persist({ chunkTokenSize: n }); });
      updateChunkUI();
      
      renderEl?.addEventListener('change', ()=>persist({ renderMode: renderEl.value }));
  // removed web listeners
  apiKeyEl?.addEventListener('input', ()=>{ persist({ apiKey: apiKeyEl.value||'' }); updateKeyBadge(); });
  enableToolsEl?.addEventListener('change', ()=>{ persist({ enableTools: !!enableToolsEl.checked }); });
  forcePythonEl?.addEventListener('change', ()=>{ persist({ forcePython: !!forcePythonEl.checked }); });
    }catch{}
  // Render historical messages if any
    try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      // Determine render mode (saved or current control)
  let renderMode = 'md';
      try{
        const sel = panel.querySelector('[data-role="renderMode"]');
        if (sel && sel.value) renderMode = String(sel.value);
        else {
          const raw = localStorage.getItem(`nodeSettings:${ownerId}`);
          if (raw){ const s = JSON.parse(raw)||{}; if (s.renderMode) renderMode = String(s.renderMode); }
        }
      }catch{}
      for(const m of entries){
        const row=document.createElement('div'); row.className='message-row'+(m.who==='user'?' user':'');
        const group=document.createElement('div'); group.className='msg-group';
        const author=document.createElement('div'); author.className='author-label'; author.textContent = m.author || (m.who==='user'?'User':'Assistant');
        const b=document.createElement('div'); b.className='bubble '+(m.who==='user'?'user':'');
        const textEl=document.createElement('div'); textEl.className='msg-text';
    const content = String(m.text||'');
  // Compute notes count for [n] linking (prefer attachments passed with the message meta)
  let histAtt = Array.isArray(m?.meta?.attachments) ? m.meta.attachments : (function(){ try{ const rawA = localStorage.getItem(`nodeAttachments:${ownerId}`); return rawA ? (JSON.parse(rawA)||[]) : []; }catch{ return []; } })();
    const histCits = Array.isArray(m?.meta?.citations) ? m.meta.citations : [];
    // Deduplicate for consistent mapping and display
    const seenHA = new Set(); const flatHA = [];
    try{ (histAtt||[]).forEach(it=>{ const key=(it.url||'')||`${it.name||''}|${it.chars||0}`; if(!seenHA.has(key)){ seenHA.add(key); flatHA.push(it); } }); }catch{}
    const seenHC = new Set(); const flatHC = [];
    try{ (histCits||[]).forEach(c=>{ const key = String(c.url||'')||String(c.title||''); if(!seenHC.has(key)){ seenHC.add(key); flatHC.push(c); } }); }catch{}
    const histTotal = flatHA.length + flatHC.length;
        const makeLinkedHtml = (src)=>{
          try{
            // First: [bilaga,sida] -> link that targets specific attachment and page
            // Then: [n] -> classic combined notes index
            return String(src)
              // [n,page] or [n,sida page-page2] (including en-dash). Allow optional "sida/sidor/s." marker.
              .replace(/\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\]/gi, (mm, a, p1, p2)=>{
                const first = Math.max(1, Number(p1)||1);
                const second = Math.max(1, Number(p2)||first);
                const page = Math.min(first, second);
                // If exactly one attachment exists, normalize any [n, ..] to [1, ..] for display and mapping
                const attLen = (Array.isArray(flatHA)? flatHA.length : 0);
                const normBil = (attLen === 1 ? 1 : Number(a)||1);
                // Preserve original formatting (e.g., "sida") but replace the bilaga index at start
                const disp = (attLen === 1 && normBil === 1 && (Number(a)||1) !== 1)
                  ? mm.replace(/^\[\s*\d+/, (s)=> s.replace(/\d+/, '1'))
                  : mm;
                return `<a href="javascript:void(0)" data-bil="${normBil}" data-page="${page}" class="ref-bp">${disp}<\/a>`;
              })
              .replace(/\[(\d+)\]/g, (mm, g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]<\/a>`);
          }catch{ return String(src||''); }
        };
        if (m.who !== 'user' && renderMode === 'md' && window.mdToHtml){
          try{ let html = sanitizeHtml(window.mdToHtml(content)); if (histTotal) html = makeLinkedHtml(html); textEl.innerHTML = html; }
          catch{ textEl.textContent = content; }
        } else {
          try{ const safe = (window.escapeHtml? window.escapeHtml(content) : String(content||'')); const html = histTotal ? makeLinkedHtml(safe) : safe; textEl.innerHTML = html; }
          catch{ textEl.textContent = content; }
        }
        b.appendChild(textEl);
  // Footnotes: attachments (Material) and web citations (Källor)
        try{
          if (m.who !== 'user'){
            // Attachments list
            try{
              const items = Array.isArray(flatHA)? flatHA : [];
              if (items.length){
                const foot = document.createElement('div'); foot.className='subtle'; foot.style.marginTop='6px'; foot.style.fontSize='0.85em'; foot.style.opacity='0.85';
                const lab = document.createElement('div'); lab.textContent='Material:'; foot.appendChild(lab);
                const ol = document.createElement('ol'); ol.style.margin='6px 0 0 16px'; ol.style.padding='0';
                const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
        const getPdfOffset = (it)=>{ try{ const key = String(it?.url||it?.origUrl||''); if(!key) return 0; const v = localStorage.getItem('pdfPageOffset:'+key); const n = Number(v); return Number.isFinite(n)? Math.trunc(n) : 0; }catch{ return 0; } };
                items.forEach((it,i)=>{ const li=document.createElement('li'); const a=document.createElement('a');
                  try{
                    const baseHref = it.url || it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
                    let finalHref = baseHref;
                    if (isPdf(it)){
                      try{
                        const hint = panel._lastAssistantText || (m.text||'');
                        const pick = (function(att, hintText){ try{ if (!Array.isArray(att.pages)||!att.pages.length) return null; const q = String(hintText||'').trim().slice(0,120); if(!q) return null; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null }; break; } } if (best) break; } return best; }catch{return null;} })(it, hint);
                        // Only add #page when we have a backend URL; blob anchors often get blocked
        if (pick && pick.page && it.url){ const off = getPdfOffset(it); const eff = Math.max(1, Number(pick.page)+off); finalHref = it.url + `#page=${encodeURIComponent(eff)}`; }
                      }catch{}
                    }
                    a.href = finalHref; a.target='_blank'; a.rel='noopener';
                    try{ a.addEventListener('click', (e)=>{ e.preventDefault(); openIfExists(finalHref); }); }catch{}
                  }catch{ a.href='#'; }
                  a.textContent = (it.name||`Bilaga ${i+1}`); li.appendChild(a);
      // Calibrate control for PDFs
      if (isPdf(it) && it.url){ const cfg=document.createElement('button'); cfg.type='button'; cfg.className='icon-btn'; cfg.title='Kalibrera sidoffset'; cfg.textContent='⚙'; cfg.style.marginLeft='6px'; cfg.addEventListener('click',()=>{ const key=String(it.url); const cur=String(localStorage.getItem('pdfPageOffset:'+key)||'0'); const v=prompt('Sidoffset för denna PDF (t.ex. 2 om s.1 motsvarar visare #page=3):', cur); if (v==null) return; const n=Number(v); if (Number.isFinite(n)) localStorage.setItem('pdfPageOffset:'+key, String(Math.trunc(n))); else alert('Ogiltigt tal.'); }); li.appendChild(cfg); }
                  if (it.chars){ const small = document.createElement('span'); small.className='subtle'; small.style.marginLeft='6px'; small.textContent = `(${it.chars})`; li.appendChild(small); }
                  ol.appendChild(li); });
                foot.appendChild(ol); b.appendChild(foot);
              }
            }catch{}
            // Web citations if present in meta
            try{
              const cits = Array.isArray(flatHC) ? flatHC : [];
              if (cits.length){ const foot=document.createElement('div'); foot.className='subtle'; foot.style.marginTop='6px'; foot.style.fontSize='0.85em'; foot.style.opacity='0.85'; const lab=document.createElement('div'); lab.textContent='Källor:'; foot.appendChild(lab); const ol=document.createElement('ol'); ol.style.margin='6px 0 0 16px'; ol.style.padding='0'; cits.forEach((c,i)=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=String(c.url||'#'); a.target='_blank'; a.rel='noopener'; a.textContent = (c.title ? `${c.title}` : (c.url||`Källa ${i+1}`)); li.appendChild(a); ol.appendChild(li); }); foot.appendChild(ol); b.appendChild(foot); }
            }catch{}
          }
        }catch{}
        // Inline references bar if no [n] present but we have notes
        try{
          if (m.who !== 'user' && histTotal){
            const hasRefs = /\[(\d+)\]|\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?\d+(?:\s*[-–]\s*\d+)?\]/i.test(textEl.innerHTML || textEl.textContent || '');
            if (!hasRefs){
              const refs = document.createElement('div'); refs.className='subtle'; refs.style.marginTop='6px'; refs.style.fontSize='0.9em'; refs.textContent='Referenser: ';
              for (let i=1;i<=histTotal;i++){ const a=document.createElement('a'); a.href='javascript:void(0)'; a.setAttribute('data-ref', String(i)); a.className='ref'; a.textContent=`[${i}]`; refs.appendChild(a); if (i<histTotal) refs.appendChild(document.createTextNode(' ')); }
              b.appendChild(refs);
            }
          }
        }catch{}
        // Delegate clicks on [n] for historical messages
        try{
          b.addEventListener('click', (ev)=>{
            // [bilaga,sida] direct opener
            try{
              const bp = ev.target && ev.target.closest && ev.target.closest('a.ref-bp');
              if (bp){
                let bil = Math.max(1, Number(bp.getAttribute('data-bil'))||1);
                const page = Math.max(1, Number(bp.getAttribute('data-page'))||1);
                try{
                  const attItems = flatHA; const citItems = flatHC; const attLen = (attItems?.length||0); const total = attLen + (citItems?.length||0);
                  // If there is exactly one attachment, normalize any bil>1 to 1
                  if (attLen === 1 && bil > 1) bil = 1;
                  if (bil <= attLen){
                    const it = attItems[bil-1];
                    const isPdf=(x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
                    // Prefer backend URL for page fragment support
                    const baseHttp = it.url || '';
                    const baseBlob = it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
                    let finalHref = baseHttp || baseBlob;
                    if (isPdf(it) && baseHttp){ const off = (function(){ try{ const v=localStorage.getItem('pdfPageOffset:'+baseHttp); const n=Number(v); return Number.isFinite(n)? Math.trunc(n) : 0; }catch{ return 0; } })(); const eff = Math.max(1, page + off); finalHref = baseHttp + `#page=${encodeURIComponent(eff)}`; }
                      try{ openIfExists(finalHref); }catch{ const tmp=document.createElement('a'); tmp.href=finalHref; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
                  } else if (bil <= total){
                    // Fallback: open citation n (ignore page)
                    const c = citItems[bil - attLen - 1]; const href = String(c?.url||'#'); if(href && href !== '#'){ const tmp=document.createElement('a'); tmp.href=href; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
                  }
                }catch{}
                ev.preventDefault(); ev.stopPropagation(); return;
              }
            }catch{}
            // [n] footnote mapping across attachments + citations
            const a = ev.target && ev.target.closest && ev.target.closest('a.ref'); if (!a) return; const n=a.getAttribute('data-ref'); if(!n) return; const idx = Math.max(1, Number(n)||1);
            try{
              const attItems = flatHA; const citItems = flatHC; const total = (attItems?.length||0) + (citItems?.length||0);
              if (idx <= total){
                if (idx <= (attItems?.length||0)){
                  const it = attItems[idx-1]; const isPdf=(x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
                  const baseHttp = it.url || '';
                  const baseBlob = it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
                  const finalHref = baseHttp || baseBlob;
                  try{ openIfExists(finalHref); }catch{ const tmp=document.createElement('a'); tmp.href=finalHref; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
                } else {
                  const c = citItems[idx - (attItems?.length||0) - 1]; const href=String(c?.url||'#'); if(href && href!=='#'){ const tmp=document.createElement('a'); tmp.href=href; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
                }
              }
            }catch{}
            ev.preventDefault(); ev.stopPropagation();
          });
        }catch{}
        const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (m.who==='user' ? 'right' : 'left'); meta.textContent = formatTime(m.ts); b.appendChild(meta); group.appendChild(author); group.appendChild(b); row.appendChild(group); list?.appendChild(row);
      }
      list && (list.scrollTop = list.scrollHeight);
    }catch{}
    wireComposer(panel); wirePanelResize(panel);
  }
  /** Append a message into a panel by the panel's ownerId if it's open; create minimal panel if needed. */
  function receiveMessage(ownerId, text, who='assistant', meta){
    if(!ownerId) return;
    // find an existing flyout panel with matching ownerId; do NOT auto-open
    const panel = [...document.querySelectorAll('.panel-flyout')].find(p => (p.dataset.ownerId===ownerId));
    if(!panel) return; // silently drop UI render if panel isn't open
    const list = panel.querySelector('.messages'); if(!list) return;
    // reuse wireComposer's appender logic but simplified (no styles)
  const row=document.createElement('div'); row.className='message-row'+(who==='user'?' user':'');
    const group=document.createElement('div'); group.className='msg-group';
    const author=document.createElement('div'); author.className='author-label';
    // Use panel header name if available for assistant; for user panels, use the configured name
    let authorName = (who==='user' ? (meta && meta.author ? String(meta.author) : 'User') : 'Assistant');
    try{
      const headerNameEl = panel.querySelector('.drawer-head .meta .name');
      if (headerNameEl && who !== 'user') authorName = headerNameEl.textContent?.trim() || authorName;
      if (panel.classList.contains('user-node-panel') && who==='user') authorName = (panel._displayName||'').trim() || (meta && meta.author ? String(meta.author) : 'User');
    }catch{}
    author.textContent = authorName;
  const b=document.createElement('div'); b.className='bubble '+(who==='user'?'user':'');
    const textEl=document.createElement('div'); textEl.className='msg-text';
    // If executed tool code is available, show a collapsible section above the text
    try{
      const td = meta && meta.tool_debug ? meta.tool_debug : null;
      const code = td && td.name === 'run_python' ? String(td.code||'') : '';
      if (code){
        const details = document.createElement('details'); details.open = false; details.style.marginBottom='6px';
        const summary = document.createElement('summary'); summary.textContent = 'Visa Pythonkoden som kördes';
        const pre = document.createElement('pre'); pre.className = 'tool-code'; pre.textContent = code;
        details.appendChild(summary); details.appendChild(pre);
        b.appendChild(details);
      }
    }catch{}
    // Determine if this panel should render markdown for assistant messages (coworker) or for user panel mode
  let renderMode = 'md';
    try{
      const sel = panel.querySelector('[data-role="renderMode"]');
      if (sel && sel.value) renderMode = String(sel.value);
      else {
        const raw = localStorage.getItem(`nodeSettings:${ownerId}`);
        if (raw){ const s = JSON.parse(raw)||{}; if (s.renderMode) renderMode = String(s.renderMode); }
      }
    }catch{}
    const content = String(text||'');
  // Collect attachments and citations for footnote mapping (prefer provided in meta)
  let attItems = Array.isArray(meta?.attachments) ? meta.attachments : (function(){ try{ const raw = localStorage.getItem(`nodeAttachments:${ownerId}`); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } })();
  const citItems = Array.isArray(meta?.citations) ? meta.citations : [];
  // Deduplicate for consistent footnotes and click mapping
  const seenAtt2 = new Set(); const flatAtt2 = [];
  try{ (attItems||[]).forEach(it=>{ const key = (it.url||'') || `${it.name||''}|${it.chars||0}`; if(!seenAtt2.has(key)){ seenAtt2.add(key); flatAtt2.push(it); } }); }catch{}
  const seenCit2 = new Set(); const flatCit2 = [];
  try{ (citItems||[]).forEach(c=>{ const key = String(c.url||'')||String(c.title||''); if(!seenCit2.has(key)){ seenCit2.add(key); flatCit2.push(c); } }); }catch{}
  const totalNotes = flatAtt2.length + flatCit2.length;
  const makeLinkedHtml = (src)=>{
      try{
        // [bilaga,sida] then [n]
        return String(src)
          // [n,page] or [n,sida page-page2] (including en-dash); allow optional 'sida/sidor/s.' marker
          .replace(/\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\]/gi, (mm,a,p1,p2)=>{
            const first = Math.max(1, Number(p1)||1);
            const second = Math.max(1, Number(p2)||first);
            const page = Math.min(first, second);
            // If exactly one attachment exists, normalize any [n, ..] to [1, ..] for display and mapping
            const attLen = (Array.isArray(flatAtt2)? flatAtt2.length : 0);
            const normBil = (attLen === 1 ? 1 : Number(a)||1);
            const disp = (attLen === 1 && normBil === 1 && (Number(a)||1) !== 1)
              ? mm.replace(/^\[\s*\d+/, (s)=> s.replace(/\d+/, '1'))
              : mm;
            return `<a href="javascript:void(0)" data-bil="${normBil}" data-page="${page}" class="ref-bp">${disp}<\/a>`;
          })
          .replace(/\[(\d+)\]/g, (m,g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]<\/a>`);
      }catch{ return String(src||''); }
    };
    const isUserPanel = panel.classList.contains('user-node-panel');
    if (!isUserPanel && who !== 'user'){
      if (renderMode === 'md' && window.mdToHtml){
        try{
          let html = sanitizeHtml(window.mdToHtml(content));
          if (totalNotes) html = makeLinkedHtml(html);
          textEl.innerHTML = html;
        }catch{ textEl.textContent = content; }
      } else {
        // raw: escape then optionally linkify [n]
        try{
          const safe = (window.escapeHtml? window.escapeHtml(content) : String(content||''));
          const html = totalNotes ? makeLinkedHtml(safe) : safe;
          textEl.innerHTML = html;
        }catch{ textEl.textContent = content; }
      }
    } else {
      // For User panel: honor its own render mode (stored as userRenderMode), but still linkify assistant refs
      let userMode = 'raw';
      try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if (raw){ const s = JSON.parse(raw)||{}; if (s.userRenderMode) userMode = String(s.userRenderMode); } }catch{}
      if (userMode === 'md' && window.mdToHtml){
        try{
          let html = sanitizeHtml(window.mdToHtml(content));
          if (who !== 'user' && totalNotes) html = makeLinkedHtml(html);
          textEl.innerHTML = html;
        }catch{ textEl.textContent = content; }
      } else {
        if (who !== 'user' && totalNotes){
          try{ const safe = (window.escapeHtml? window.escapeHtml(content) : String(content||'')); const html = makeLinkedHtml(safe); textEl.innerHTML = html; }
          catch{ textEl.textContent = content; }
        } else {
          textEl.textContent = content;
        }
      }
    }
  b.appendChild(textEl);
  // remember last assistant raw text for hinting page search
  if (who !== 'user'){ try{ panel._lastAssistantText = String(text||''); }catch{} }
    // Delegate click on [n] refs: open corresponding attachment/citation, and also scroll to local footnote
    try{
      b.addEventListener('click', (ev)=>{
        // [bilaga,sida]
        try{
          const bp = ev.target && ev.target.closest && ev.target.closest('a.ref-bp');
          if (bp){
            let bil = Math.max(1, Number(bp.getAttribute('data-bil'))||1);
            const page = Math.max(1, Number(bp.getAttribute('data-page'))||1);
            try{
              const attItems = flatAtt2; const citItems = flatCit2;
              const attLen = (attItems?.length||0); const total = attLen + (citItems?.length||0);
              if (attLen === 1 && bil > 1) bil = 1;
              if (bil <= attLen){
                const it = attItems[bil-1];
                const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
                const baseHttp = it.url || '';
                const baseBlob = it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
                const final = (isPdf(it) && baseHttp) ? (function(){ const off=(function(){ try{ const v=localStorage.getItem('pdfPageOffset:'+baseHttp); const n=Number(v); return Number.isFinite(n)? Math.trunc(n) : 0; }catch{ return 0; } })(); const eff=Math.max(1, page+off); return baseHttp + `#page=${encodeURIComponent(eff)}`; })() : (baseHttp || baseBlob);
                  try{ openIfExists(final); }catch{ const tmp = document.createElement('a'); tmp.href = final; tmp.target = '_blank'; tmp.rel = 'noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
              } else if (bil <= total){
                const c = citItems[bil - attLen - 1]; const href = String(c?.url||'#'); if(href && href !== '#'){ const tmp=document.createElement('a'); tmp.href=href; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
              }
            }catch{}
            ev.preventDefault(); ev.stopPropagation(); return;
          }
        }catch{}
        const a = ev.target && ev.target.closest && ev.target.closest('a.ref');
        if (!a) return;
        const n = a.getAttribute('data-ref');
        if (!n) return;
        const idx = Math.max(1, Number(n)||1);
        // Try open: attachments first, then citations
        try{
              const attItems = flatAtt2; const citItems = flatCit2;
              const total = (attItems?.length||0) + (citItems?.length||0);
          if (idx <= total){
            if (idx <= (attItems?.length||0)){
              const it = attItems[idx-1];
              const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
              const baseHttp = it.url || '';
              const baseBlob = it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
              // compute page from nearby sentence around the [n]; fallback to last assistant text
              const hint = panel._lastAssistantText || content || '';
              let finalHref = baseHttp || baseBlob;
              try{
                const pick = (function(att, hintText){ try{ if (!Array.isArray(att.pages)||!att.pages.length) return null; const q = String(hintText||'').trim().slice(0,120); if(!q) return null; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null, q:needle }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null, q:tokens.slice(0,5).join(' ') }; break; } } if (best) break; } return best; }catch{return null;} })(it, hint);
                if (pick && pick.page && baseHttp) finalHref = baseHttp + `#page=${encodeURIComponent(pick.page)}`;
              }catch{}
              const final = isPdf(it) ? finalHref : (baseHttp || baseBlob);
              try{ openIfExists(final); }catch{ const tmp = document.createElement('a'); tmp.href = final; tmp.target = '_blank'; tmp.rel = 'noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
            } else {
              const c = citItems[idx - (attItems?.length||0) - 1];
              const href = String(c?.url||'#'); if (href && href !== '#'){ const tmp = document.createElement('a'); tmp.href = href; tmp.target = '_blank'; tmp.rel = 'noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
            }
          }
        }catch{}
        const fn = b.querySelector(`#fn-${idx}`);
        if (fn){ fn.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
        ev.preventDefault();
        ev.stopPropagation();
      });
    }catch{}
    // If no [n] refs exist in content but notes exist, add a compact inline references bar linking to footnotes
    try{
      if (who !== 'user' && totalNotes){
        const hasRefs = /\[(\d+)\]|\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?\d+(?:\s*[-–]\s*\d+)?\]/i.test(textEl.innerHTML || textEl.textContent || '');
        if (!hasRefs){
          const refs = document.createElement('div');
          refs.className = 'subtle';
          refs.style.marginTop = '6px';
          refs.style.fontSize = '0.9em';
          refs.textContent = 'Referenser: ';
          for (let i=1;i<=totalNotes;i++){
            const a = document.createElement('a'); a.href = 'javascript:void(0)'; a.setAttribute('data-ref', String(i)); a.className='ref'; a.textContent = `[${i}]`;
            refs.appendChild(a);
            if (i<totalNotes){ refs.appendChild(document.createTextNode(' ')); }
          }
          b.appendChild(refs);
        }
      }
    }catch{}
        // Append a consolidated footnote list [1..N] combining Material (attachments) then Web citations
    try{
      if (who !== 'user' && totalNotes){
        const foot = document.createElement('div');
        foot.className = 'subtle';
        foot.style.marginTop = '6px';
        foot.style.fontSize = '0.85em';
        foot.style.opacity = '0.85';
        const lab = document.createElement('div'); lab.textContent = 'Källor:'; lab.style.marginTop = '4px';
        const ol = document.createElement('ol');
        ol.style.margin = '6px 0 0 16px';
        ol.style.padding = '0';
        // Build a de-duplicated list of attachments (by url or name+chars)
        const seenAtt = new Set();
        const flatAtt = [];
        (attItems||[]).forEach((it)=>{
          try{ const key = (it.url||'') || `${it.name||''}|${it.chars||0}`; if (key && !seenAtt.has(key)){ seenAtt.add(key); flatAtt.push(it); } }catch{ flatAtt.push(it); }
        });
        // attachments first (show only title and character count; no raw URL)
        flatAtt.forEach((it,i)=>{
          const idx = i+1; const li = document.createElement('li'); li.id = `fn-${idx}`;
          const a = document.createElement('a');
          try{
            const baseHref = it.url || it.origUrl || it.blobUrl || (function(){ const blob = new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
            const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
            let finalHref = baseHref;
      if (isPdf(it)){
              try{
                const hint = panel._lastAssistantText || content || '';
                const pick = (function(att, hintText){ try{ if (!Array.isArray(att.pages)||!att.pages.length) return null; const q = String(hintText||'').trim().slice(0,120); if(!q) return null; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null }; break; } } if (best) break; } return best; }catch{return null;} })(it, hint);
        if (pick && pick.page){ const off=(function(){ try{ const v=localStorage.getItem('pdfPageOffset:'+baseHref); const n=Number(v); return Number.isFinite(n)? Math.trunc(n) : 0; }catch{ return 0; } })(); const eff=Math.max(1, Number(pick.page)+off); finalHref = baseHref + `#page=${encodeURIComponent(eff)}`; }
              }catch{}
            }
            a.href = finalHref; a.target = '_blank'; a.rel = 'noopener';
            // Intercept to 404-check before opening
            try{ a.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); openIfExists(finalHref); }); }catch{}
          }catch{ a.href = '#'; }
          a.textContent = (it.name||`Bilaga ${idx}`);
          li.appendChild(a);
              // Add gear to calibrate page offset for this PDF and update link immediately
              try{
                const isPdfNow = /\.pdf($|\?)/i.test(String(it?.name||'')) || /pdf/i.test(String(it?.mime||''));
                const httpUrl = String(it?.url||'');
                if (isPdfNow && httpUrl){
                  const cfg = document.createElement('button');
                  cfg.type = 'button'; cfg.className='icon-btn'; cfg.title='Kalibrera sidoffset'; cfg.textContent='⚙'; cfg.style.marginLeft='6px';
                  cfg.addEventListener('click', ()=>{
                    const key = httpUrl; const cur = String(localStorage.getItem('pdfPageOffset:'+key)||'0');
                    const v = prompt('Sidoffset för denna PDF (t.ex. 2 om s.1 motsvarar visare #page=3):', cur);
                    if (v==null) return; const n = Number(v);
                    if (!Number.isFinite(n)) { alert('Ogiltigt tal.'); return; }
                    localStorage.setItem('pdfPageOffset:'+key, String(Math.trunc(n)));
                    // recompute href using current best page pick if present
                    try{
                      const hint = panel._lastAssistantText || content || '';
                      const pick = (function(att, hintText){ try{ if (!Array.isArray(att.pages)||!att.pages.length) return null; const q = String(hintText||'').trim().slice(0,120); if(!q) return null; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null }; break; } } if (best) break; } return best; }catch{return null;} })(it, hint);
                      if (pick && pick.page){ const off = Math.trunc(n); const eff = Math.max(1, Number(pick.page)+off); a.href = httpUrl + `#page=${encodeURIComponent(eff)}`; }
                    }catch{}
                  });
                  li.appendChild(cfg);
                }
              }catch{}
          if (it.chars){ const small = document.createElement('span'); small.className='subtle'; small.style.marginLeft='6px'; small.textContent = `(${it.chars})`; li.appendChild(small); }
          ol.appendChild(li);
        });
        // citations continue numbering
        const seenCit = new Set(); const flatCit = [];
        (citItems||[]).forEach((c)=>{ try{ const key = String(c.url||'')||String(c.title||''); if(key && !seenCit.has(key)){ seenCit.add(key); flatCit.push(c); } }catch{ flatCit.push(c); } });
        flatCit.forEach((c, i)=>{
          const idx = (flatAtt.length||0) + i + 1; const li = document.createElement('li'); li.id = `fn-${idx}`;
          const a = document.createElement('a'); const href = String(c.url||'#'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = (c.title ? `${c.title}` : (c.url||`Källa ${idx}`)); li.appendChild(a);
          ol.appendChild(li);
        });
        foot.appendChild(lab);
        foot.appendChild(ol);
        b.appendChild(foot);
      }
    }catch{}
    const metaEl=document.createElement('div'); metaEl.className='subtle'; metaEl.style.marginTop='6px'; metaEl.style.opacity='0.8'; metaEl.style.textAlign = (who==='user' ? 'right' : 'left'); const ts = meta?.ts || Date.now(); metaEl.textContent = formatTime(ts); b.appendChild(metaEl); group.appendChild(author); group.appendChild(b); row.appendChild(group); list.appendChild(row);
    // Autoscroll guard: only scroll if user at bottom or no user scroll in last 5s
    try{
      if (!list.__autoscrollHooked){ list.__autoscrollHooked = true; list.addEventListener('scroll', ()=>{ try{ if (list.__autoScrolling) return; list.dataset.lastUserScrollTs = String(Date.now()); }catch{} }); }
      const atBottom = (list.scrollTop + list.clientHeight) >= (list.scrollHeight - 8);
      const last = Number(list.dataset.lastUserScrollTs||0);
      const inactive = last ? ((Date.now() - last) >= 5000) : false;
      if (atBottom || inactive){ list.__autoScrolling = true; list.scrollTop = list.scrollHeight; setTimeout(()=>{ try{ list.__autoScrolling=false; }catch{} }, 0); }
    }catch{}
  }
  /** Append text content into a board section (by sectionId) with optional Markdown rendering. */
  function appendToSection(sectionId, text, opts){
    try{
      const sec = document.querySelector(`.panel.board-section[data-section-id="${sectionId}"]`)
                || document.querySelector(`.panel.board-section:nth-of-type(${Number(sectionId?.replace(/^s/,''))||0})`);
      // Determine section settings/mode first
      const getSecSettings = ()=>{
        try{
          const id = sec?.dataset.sectionId || '';
          const raw = localStorage.getItem(`sectionSettings:${id}`);
          return raw ? JSON.parse(raw) : {};
        }catch{ return {}; }
      };
  const settings = getSecSettings();
  // Prefer saved renderMode first; dataset.mode is only a transient UI flag
  const modeNow = settings.renderMode || settings.mode || (sec?.dataset.mode) || 'md';
  const readSecMode = ()=> (settings.renderMode || settings.mode || (sec?.dataset.mode) || 'md');
      // If in exercises mode and a pending feedback index exists, store incoming text as feedback
      if (modeNow === 'exercises'){
        try{
          const id = sec?.dataset.sectionId || '';
          const idxStr = sec?.dataset.pendingFeedback;
          if (idxStr !== undefined){
            const idx = Math.max(0, Number(idxStr)||0);
            const raw = localStorage.getItem(`sectionExercises:${id}`) || '[]';
            const arr = JSON.parse(raw)||[];
            if (arr[idx]){
              // store incoming feedback into current round bucket
              let round = 1; try{ round = Math.max(1, Number(localStorage.getItem(`sectionExercisesRound:${id}`)||'1')||1); }catch{}
              try{ if (!Array.isArray(arr[idx].fbRounds)) arr[idx].fbRounds = []; if (arr[idx].fb && !arr[idx].fbRounds.length){ arr[idx].fbRounds = [ String(arr[idx].fb||'') ]; delete arr[idx].fb; } }catch{}
              const rIndex = round - 1; while (arr[idx].fbRounds.length <= rIndex) arr[idx].fbRounds.push('');
              const prev = String(arr[idx].fbRounds[rIndex]||'');
              arr[idx].fbRounds[rIndex] = prev ? (prev + '\n\n' + String(text||'')) : String(text||'');
            }
            localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr));
            // clear flag and update UI if focus view is present
            delete sec.dataset.pendingFeedback;
            const focus = sec.querySelector('.ex-fb'); if (focus && Number(localStorage.getItem(`sectionExercisesCursor:${id}`)||'0') === idx){ try{ const it = arr[idx]||{}; const rounds = Array.isArray(it.fbRounds)? it.fbRounds : []; const parts = rounds.map((txt,i)=>{ const head = `<div class=\"subtle\" style=\"margin:6px 0 4px; opacity:.85;\">Omgång ${i+1}</div>`; const body = window.mdToHtml? window.mdToHtml(String(txt||'')) : String(txt||''); return head + `<div class=\"fb-round\">${body}</div>`; }); focus.innerHTML = parts.join('<hr style=\"border:none; border-top:1px solid #252532; margin:8px 0;\">'); }catch{ focus.textContent=''; } }
            return; // handled
          }
        }catch{}
      }
      // Fallback to appending into the section note (non-exercises or no pending)
      const note = sec ? sec.querySelector('.note') : null;
      if (!note) return;
      const ensureExercisesLayout = ()=>{
        try{
          const body = sec?.querySelector('.body');
          if (body){ body.style.display = 'grid'; body.style.gridTemplateColumns = '1fr 1fr'; body.style.gap = '12px'; }
        }catch{}
      };
      const importTextAsExercises = (plain)=>{
        try{
          if (!sec) return;
          ensureExercisesLayout();
          const id = sec.dataset.sectionId || '';
          const parse = (txt)=>{ try{ return (window.__parseQuestions? window.__parseQuestions(String(txt||'')) : []); }catch{ return []; } };
          let items = parse(String(plain||''));
          // Fallback: if nothing parsed, make a single question from the whole text
          if (!items.length){
            const q = String(plain||'').trim();
            if (q) items = [{ q }]; else return;
          }
          // merge with existing
          let cur = [];
          try{ const raw = localStorage.getItem(`sectionExercises:${id}`); if(raw){ cur = JSON.parse(raw)||[]; } }catch{}
          const next = cur.concat(items);
          try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(next)); }catch{}
          try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail: { id } })); }catch{}
        }catch{}
      };
      const getSecRaw = (id)=>{ try{ return localStorage.getItem(`sectionRaw:${id}`) || ''; }catch{ return ''; } };
      const setSecRaw = (id, value)=>{ try{ localStorage.setItem(`sectionRaw:${id}`, String(value||'')); }catch{} };
      const mode = (opts && opts.mode) || readSecMode();
      const content = String(text||'');
      const id = sec?.dataset.sectionId || '';
      if (mode === 'exercises'){
        // In exercises mode, convert incoming content to question blocks
        importTextAsExercises(content);
        // Keep a raw copy as well for potential future re-render
        const prev = getSecRaw(id);
        const next = (prev ? (prev + '\n\n') : '') + content;
        setSecRaw(id, next);
        return;
      }
      if (mode === 'md' && window.mdToHtml){
        const prev = getSecRaw(id);
        const next = (prev ? (prev + '\n\n') : '') + content;
        setSecRaw(id, next);
        note.innerHTML = sanitizeHtml(window.mdToHtml(next));
        note.dataset.rendered = '1';
      } else if (mode === 'html'){
        const prev = getSecRaw(id);
        const next = (prev ? (prev + '\n\n') : '') + content;
        setSecRaw(id, next);
        note.innerHTML = sanitizeHtml(next);
        note.dataset.rendered = '1';
      } else {
        const p = document.createElement('p');
        p.className = 'note-block raw';
        p.textContent = content;
        note.appendChild(p);
        try{ setSecRaw(id, note.innerText || ''); }catch{}
      }
    }catch{}
  }
  /** Initialize per-section settings (render mode toggle) and persistence. */
  function initBoardSectionSettings(){
    try{
      document.querySelectorAll('.panel.board-section').forEach((sec)=>{
        const id = sec.dataset.sectionId || '';
        if (!id) return;
        // Inject a simple render mode toggle if not present
        const head = sec.querySelector('.head');
        if (!head) return;
        // Helper: toggle toolbars depending on render mode
        const updateToolbarVisibility = (mode)=>{
          try{
            const exTb = head.querySelector('[data-role="exToolbar"]');
            const txtTb = head.querySelector('[data-role="textToolbar"]');
            const isEx = mode === 'exercises';
            if (exTb) exTb.style.display = isEx ? 'flex' : 'none';
            if (txtTb) txtTb.style.display = isEx ? 'none' : 'flex';
          }catch{}
        };
        // Make section IO points (in/out) interactive for starting connections
        try{
          head.querySelectorAll('.section-io, .conn-point').forEach(io=>{
            if (!io._wired){ window.makeConnPointInteractive && window.makeConnPointInteractive(io, sec); io._wired = true; }
          });
        }catch{}
        // Exercise toolbar (Add block + Grade via cable)
        if (!head.querySelector('[data-role="exToolbar"]')){
          const exBar = document.createElement('div');
          exBar.setAttribute('data-role','exToolbar');
          exBar.style.display = 'flex';
          exBar.style.gap = '6px';
          exBar.style.marginLeft = '8px';
          const btnAdd = document.createElement('button');
          btnAdd.type = 'button'; btnAdd.textContent = 'Övningsblock +'; btnAdd.className='btn btn-ghost';
          const btnGradeAll = document.createElement('button');
          btnGradeAll.type = 'button'; btnGradeAll.textContent = 'Rätta alla frågor'; btnGradeAll.className='btn';
          const btnDeleteAll = document.createElement('button');
          btnDeleteAll.type = 'button'; btnDeleteAll.textContent = 'Ta bort alla'; btnDeleteAll.className='btn btn-ghost';
      const btnClearAnswers = document.createElement('button');
      btnClearAnswers.type = 'button'; btnClearAnswers.textContent = 'Rensa alla svar'; btnClearAnswers.className='btn btn-ghost';
          const btnFullscreen = document.createElement('button');
          btnFullscreen.type = 'button'; btnFullscreen.textContent = 'Öppna helskärm'; btnFullscreen.className='btn';
    exBar.appendChild(btnAdd); exBar.appendChild(btnGradeAll); exBar.appendChild(btnClearAnswers); exBar.appendChild(btnDeleteAll); exBar.appendChild(btnFullscreen);
    // Parking slots for exercises: choose coworker nodes to act as Grader and Improver
    const parkWrap = document.createElement('div');
    parkWrap.style.display='flex'; parkWrap.style.gap='8px'; parkWrap.style.alignItems='center'; parkWrap.style.marginLeft='12px';
    const mkSel = (labelText)=>{ const wrap=document.createElement('label'); wrap.className='subtle'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='6px'; const span=document.createElement('span'); span.textContent=labelText; const sel=document.createElement('select'); sel.className='btn'; wrap.appendChild(span); wrap.appendChild(sel); return { wrap, sel, span }; };
  const selGrader = mkSel('Rättare:');
  const selImprover = mkSel('Förbättra fråga:');
  const selInput = mkSel('Inmatning:');
  parkWrap.appendChild(selGrader.wrap); parkWrap.appendChild(selImprover.wrap); parkWrap.appendChild(selInput.wrap);
    exBar.appendChild(parkWrap);
    // Export dropdown: map this section's content as Theory into a chosen section's full-screen view
    try{
      const expWrap = document.createElement('label');
      expWrap.className = 'subtle';
      expWrap.style.display = 'flex'; expWrap.style.alignItems = 'center'; expWrap.style.gap = '6px'; expWrap.style.marginLeft = '12px';
  const span = document.createElement('span'); span.textContent = 'Exportera till:';
  const sel = document.createElement('select'); sel.className = 'btn';
  const refreshBtn = document.createElement('button'); refreshBtn.type='button'; refreshBtn.className='btn btn-ghost'; refreshBtn.textContent='↻'; refreshBtn.title='Uppdatera lista'; refreshBtn.style.padding='2px 6px';
  expWrap.appendChild(span); expWrap.appendChild(sel); expWrap.appendChild(refreshBtn);
      exBar.appendChild(expWrap);
      const fillSections = ()=>{
        const opts = [{ value:'', label:'— Välj sektion —' }];
        try{
          document.querySelectorAll('.panel.board-section').forEach(el=>{
            const sid = el.dataset.sectionId||''; if (!sid) return;
            const h2 = el.querySelector('.head h2');
            const title = (h2?.textContent||'').trim() || sid;
            opts.push({ value: sid, label: title });
          });
        }catch{}
        sel.innerHTML=''; opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value; op.textContent=o.label; sel.appendChild(op); });
        sel.value='';
      };
  fillSections();
  // Manual refresh
  refreshBtn.addEventListener('click', ()=> fillSections());
      sel.addEventListener('change', ()=>{
        try{
          const targetId = String(sel.value||''); if (!targetId) return;
          // Set mapping: destination section consumes theory from this (source) section
          localStorage.setItem(`sectionTheorySrc:${targetId}`, id);
          try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
          // toast
          let cont = document.getElementById('toastContainer'); if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
          const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Export kopplad – öppna helskärm på målsektionen för att visa Teori.'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1500);
          // reset back to placeholder for repeated use
          sel.value='';
        }catch{}
      });
  // Auto-refresh when sections change (same-tab event + cross-tab storage keys)
  window.addEventListener('board-sections-changed', fillSections);
  window.addEventListener('storage', (e)=>{ try{ if (!e||!e.key) return; if (e.key==='boardSections:list:v1' || /^boardSection:title:/.test(e.key)) fillSections(); }catch{} });
    }catch{}
          // Insert toolbar near title; inline IO is no longer present
          head.appendChild(exBar);
          // Wire actions
          const grid = sec.querySelector('.body .grid') || sec.querySelector('.body');
          btnFullscreen.addEventListener('click', ()=>{
            try{
              const title = (sec.querySelector('.head h2')?.textContent||'').trim();
              const url = new URL(location.origin + location.pathname.replace(/[^\/]*$/, 'exercises-full.html'));
              url.searchParams.set('id', id);
              if (title) url.searchParams.set('title', title);
              window.open(url.toString(), '_blank');
            }catch{}
          });
          // Storage helpers for focus UI
          const getExercises = ()=>{ try{ const raw = localStorage.getItem(`sectionExercises:${id}`); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
  const getParking = ()=>{ try{ const raw = localStorage.getItem(`sectionParking:${id}`); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
  const setParking = (obj)=>{ try{ localStorage.setItem(`sectionParking:${id}`, JSON.stringify(obj||{})); }catch{} };
        // Populate parking selectors with coworker nodes and persist selection
        try{
            const fillFromCoworkers = ()=>{
              const opts = [{ value:'', label:'— Välj nod —' }];
              document.querySelectorAll('.fab[data-type="coworker"]').forEach(el=>{
                const value = el.dataset.id||''; const label = el.dataset.displayName || ('CoWorker '+value);
                if (value) opts.push({ value, label });
              });
              const fill = (sel)=>{ sel.innerHTML=''; opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value; op.textContent=o.label; sel.appendChild(op); }); };
                const cur = getParking();
                const prevGrader = cur && cur.grader ? String(cur.grader) : '';
                const prevImprover = cur && cur.improver ? String(cur.improver) : '';
                const prevInput = cur && cur.input ? String(cur.input) : '';
                fill(selGrader.sel); fill(selImprover.sel); fill(selInput.sel);
                if (prevGrader) selGrader.sel.value = prevGrader;
                if (prevImprover) selImprover.sel.value = prevImprover;
                if (prevInput) selInput.sel.value = prevInput;
            };
            // Initial fill
            fillFromCoworkers();
            // Keep up to date when coworkers are added or renamed
            window.addEventListener('coworkers-changed', fillFromCoworkers);
            selGrader.sel.addEventListener('change', ()=>{ const p=getParking(); p.grader = selGrader.sel.value||null; setParking(p); });
            selImprover.sel.addEventListener('change', ()=>{ const p=getParking(); p.improver = selImprover.sel.value||null; setParking(p); });
              selInput.sel.addEventListener('change', ()=>{ const p=getParking(); p.input = selInput.sel.value||null; setParking(p); });
        }catch{}
          const setExercises = (arr)=>{ try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr||[])); }catch{} };
          // pending feedback target index (store transiently on section)
          const setPendingFeedback = (idx)=>{ try{ sec.dataset.pendingFeedback = String(idx); }catch{} };
          const clearPendingFeedback = ()=>{ try{ delete sec.dataset.pendingFeedback; }catch{} };
          const getPendingFeedback = ()=>{ const v = sec.dataset.pendingFeedback; return (v==null||v==='') ? null : Math.max(0, Number(v)||0); };
          const getCursor = ()=>{ try{ const n = Number(localStorage.getItem(`sectionExercisesCursor:${id}`)); const len = getExercises().length; return isNaN(n)?0: Math.max(0, Math.min(n, Math.max(0,len-1))); }catch{ return 0; } };
          const setCursor = (i)=>{ try{ localStorage.setItem(`sectionExercisesCursor:${id}`, String(i)); }catch{} };
          const getRound = ()=>{ try{ const n = Number(localStorage.getItem(`sectionExercisesRound:${id}`)||'1'); return Math.max(1, n||1); }catch{ return 1; } };
          const incRound = ()=>{ try{ const n = getRound(); localStorage.setItem(`sectionExercisesRound:${id}`, String(n+1)); }catch{} };
          const renderExercisesFocus = ()=>{
            try{
              // layout
              const body = sec.querySelector('.body');
        if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; }
        // mark mode on section for CSS (hide note)
        sec.setAttribute('data-mode','exercises');
              // clear old blocks view and any previous focus containers
              sec.querySelectorAll('.exercise-block').forEach(b=>b.remove());
              sec.querySelectorAll('.ex-focus, .ex-left, .ex-right').forEach(b=>b.remove());
              const wrap = document.createElement('div');
              wrap.className = 'ex-focus';
              // Span full width and host the two panes; inner grid for equal columns
              wrap.style.gridColumn = '1 / span 2';
              wrap.style.display = 'grid';
              wrap.style.gridTemplateColumns = '1fr 1fr';
              wrap.style.gap = '12px';
              // left
        const left = document.createElement('div'); left.className='ex-left';
              // right
        const right = document.createElement('div'); right.className='ex-right';
              // data (do not keep a stale snapshot; always read fresh via getExercises)
              let idx = getCursor();
              { const len = getExercises().length; if (idx >= len) idx = Math.max(0, len-1); }
              setCursor(idx);
              // Build left (question + nav)
        const nav = document.createElement('div'); nav.className='ex-nav';
              const prev = document.createElement('button'); prev.type='button'; prev.className='btn btn-ghost'; prev.textContent='←';
              const next = document.createElement('button'); next.type='button'; next.className='btn btn-ghost'; next.textContent='→';
              const info = document.createElement('div'); info.className='subtle';
              // Round UI: clickable label with tiny dropdown to reset round counter to 1
              const roundBtn = document.createElement('button'); roundBtn.type='button'; roundBtn.className='btn btn-ghost'; roundBtn.textContent='Omgång 1 ▾'; roundBtn.style.marginLeft='8px';
              const roundMenu = document.createElement('div'); roundMenu.className='hidden'; Object.assign(roundMenu.style,{ position:'absolute', zIndex:'10060', marginTop:'4px', right:'0', minWidth:'220px', display:'grid', gap:'4px', padding:'6px', background:'linear-gradient(180deg,#121219,#0e0e14)', border:'1px solid #23232b', borderRadius:'8px', boxShadow:'0 12px 28px rgba(0,0,0,0.55)'});
              const resetBtn = document.createElement('button'); resetBtn.type='button'; resetBtn.textContent='Starta om till omgång 1'; Object.assign(resetBtn.style,{ textAlign:'left', background:'rgba(255,255,255,0.03)', border:'1px solid #2a2a35', color:'#e6e6ec', padding:'6px 8px', borderRadius:'6px', cursor:'pointer' });
              roundMenu.appendChild(resetBtn);
              const infoWrap = document.createElement('div'); infoWrap.style.position='relative'; infoWrap.style.display='inline-block';
              infoWrap.appendChild(info);
              infoWrap.appendChild(roundBtn);
              infoWrap.appendChild(roundMenu);
              const showRoundMenu = ()=>{ roundMenu.classList.remove('hidden'); };
              const hideRoundMenu = ()=>{ roundMenu.classList.add('hidden'); };
              roundBtn.addEventListener('click', (e)=>{ e.stopPropagation(); if (roundMenu.classList.contains('hidden')) showRoundMenu(); else hideRoundMenu(); });
              document.addEventListener('click', ()=>{ hideRoundMenu(); });
              const resetRound = ()=>{ try{ localStorage.setItem(`sectionExercisesRound:${id}`, '1'); localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{} hideRoundMenu(); updateRoundLabel(); };
              resetBtn.addEventListener('click', resetRound);
              const updateRoundLabel = ()=>{ try{ const n=getRound(); roundBtn.textContent = `Omgång ${n} ▾`; }catch{ roundBtn.textContent='Omgång 1 ▾'; } };
              const updateInfo = ()=>{ const len = getExercises().length; info.textContent = len? `Fråga ${idx+1} / ${len}` : 'Inga frågor'; updateRoundLabel(); };
              nav.appendChild(prev); nav.appendChild(infoWrap); nav.appendChild(next);
        const q = document.createElement('div'); q.className='ex-q-focus'; q.contentEditable='true'; q.spellcheck=false;
              { 
                const cur = getExercises(); 
                const rawQ = cur[idx]?.q || ''; 
                if (window.mdToHtml) {
                  q.innerHTML = window.mdToHtml(rawQ);
                } else {
                  q.textContent = rawQ;
                }
              }
              left.appendChild(nav); left.appendChild(q);
              // Build right (answer + actions)
              const a = document.createElement('textarea'); a.className='ex-a-focus'; a.rows=14; a.placeholder='Skriv ditt svar...'; { const cur = getExercises(); a.value = cur[idx]?.a || ''; }
              const fb = document.createElement('div'); fb.className='ex-fb'; fb.setAttribute('aria-live','polite');
              // Overlays for loading state
              const leftOverlay = document.createElement('div'); leftOverlay.className='loader-overlay'; leftOverlay.innerHTML='<div class="spinner-rgb"></div>';
              const rightOverlay = document.createElement('div'); rightOverlay.className='loader-overlay'; rightOverlay.innerHTML='<div class="spinner-rgb"></div>';
              const renderFb = ()=>{
                try{
                  const cur = getExercises(); const it = cur[idx]||{}; const rounds = Array.isArray(it.fbRounds)? it.fbRounds : (it.fb? [String(it.fb)] : []);
                  if (!rounds.length){ fb.innerHTML = '<div class="subtle">Ingen feedback ännu.</div>'; return; }
                  const parts = rounds.map((txt, i)=>{
                    const head = `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span><button type=\"button\" class=\"fb-del\" data-ri=\"${i}\" title=\"Radera omgång\">✕</button></div>`;
                    const body = window.mdToHtml? window.mdToHtml(String(txt||'')) : String(txt||'');
                    return head + `<div class=\"fb-round\" data-ri=\"${i}\">${body}</div>`;
                  });
                  fb.innerHTML = parts.join('<hr style=\"border:none; border-top:1px solid #252532; margin:8px 0;\">');
                  // Make each round editable and persist on change
                  try{
                    const blocks = fb.querySelectorAll('.fb-round');
                    blocks.forEach(el=>{
                      el.contentEditable = 'true';
                      el.spellcheck = false;
                      const saveNow = ()=>{
                        try{
                          const ri = Math.max(0, Number(el.getAttribute('data-ri')||'0')||0);
                          const cur2 = getExercises(); const it2 = cur2[idx]||{};
                          if (!Array.isArray(it2.fbRounds)) it2.fbRounds = (it2.fb? [String(it2.fb)] : []);
                          while (it2.fbRounds.length <= ri) it2.fbRounds.push('');
                          it2.fbRounds[ri] = String(el.innerText||'').trim();
                          cur2[idx] = it2; setExercises(cur2);
                        }catch{}
                      };
                      // Debounce input saves to avoid excessive writes
                      let t=null; el.addEventListener('input', ()=>{ try{ if (t) clearTimeout(t); t=setTimeout(saveNow, 500); }catch{} });
                      el.addEventListener('blur', saveNow);
                    });
                  }catch{}
                  // Wire delete buttons per round
                  try{
                    const dels = fb.querySelectorAll('button.fb-del');
                    dels.forEach(btn=>{
                      btn.addEventListener('click', ()=>{
                        try{
                          const ri = Math.max(0, Number(btn.getAttribute('data-ri')||'0')||0);
                          const cur2 = getExercises(); const it2 = cur2[idx]||{};
                          if (Array.isArray(it2.fbRounds)){
                            it2.fbRounds.splice(ri, 1);
                            cur2[idx] = it2; setExercises(cur2);
                            try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
                            renderFb();
                          }
                        }catch{}
                      });
                    });
                  }catch{}
                }catch{ fb.textContent=''; }
              };
              renderFb();
              const actions = document.createElement('div'); actions.className='ex-actions';
              const gradeOne = document.createElement('button'); gradeOne.type='button'; gradeOne.className='btn'; gradeOne.textContent='Rätta denna';
              const del = document.createElement('button'); del.type='button'; del.className='btn btn-ghost'; del.textContent='Ta bort';
              actions.appendChild(gradeOne); actions.appendChild(del);
              right.appendChild(a); right.appendChild(actions); right.appendChild(fb);
              left.appendChild(leftOverlay); right.appendChild(rightOverlay);
              // insert
              wrap.appendChild(left);
              wrap.appendChild(right);
              grid?.appendChild(wrap);
              updateInfo();
              const go = (delta)=>{
                const cur = getExercises(); const len = cur.length; if (!len) return; idx = Math.max(0, Math.min(len-1, idx+delta)); setCursor(idx);
                const rawQ = cur[idx]?.q || '';
                if (window.mdToHtml) {
                  q.innerHTML = window.mdToHtml(rawQ);
                } else {
                  q.textContent = rawQ;
                }
                a.value = cur[idx]?.a || '';
                renderFb();
                updateInfo();
              };
              prev.addEventListener('click', ()=>go(-1)); next.addEventListener('click', ()=>go(1));
              q.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].q = String(q.textContent||'').trim(); setExercises(cur); } updateInfo(); });
              a.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].a = String(a.value||'').trim(); setExercises(cur); } });
              // Feedback är nu läsbar (renderas per omgång)
              // delete current
              del.addEventListener('click', ()=>{ const cur = getExercises(); if (!cur.length) return; cur.splice(idx,1); setExercises(cur); if (idx >= cur.length) idx = Math.max(0, cur.length-1); setCursor(idx); renderExercisesFocus(); });
              // grade current
              gradeOne.addEventListener('click', (ev)=>{
                const btn = ev.currentTarget; const now = Date.now(); if (btn && btn._lastClick && (now - btn._lastClick) < 400) return; if (btn) btn._lastClick = now;
                const it = getExercises()[idx]; if (!it) return;
                const n = idx+1; const payload = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
                // Prefer parked Grader (direct send), else fall back to cable routing
                try{
                  const park = getParking(); const graderId = park && park.grader ? String(park.grader) : '';
                  // If neither grader nor any outgoing connections from this section -> abort with hint
                  const hasRoute = (function(){ try{ return (window.state?.connections||[]).some(c=> c.fromId===id); }catch{ return false; } })();
                  if (!graderId && !hasRoute){ alert('Ingen "Rättare"-nod vald och inga kopplingar från denna sektion. Välj en Rättare i listan eller dra en kabel.'); return; }
                  // show loading in feedback panel while model works
                  rightOverlay.classList.add('show');
                  const clearOverlay = ()=>{ setTimeout(()=>{ rightOverlay.classList.remove('show'); }, 200); };
                  const doneHandler = (e)=>{ try{ if (!e || !e.detail || e.detail.id === id) clearOverlay(); }catch{ clearOverlay(); } };
                  // on any exercises change (feedback arrival), hide overlay
                  window.addEventListener('exercises-data-changed-global', doneHandler, { once:true });
                  // also listen to local section event
                  sec.addEventListener('exercises-data-changed', doneHandler, { once:true });
                  // and global finish event in case of error
                  const onFinish = (e)=>{ try{ const d=e?.detail; if (!d) return; if (d.sourceId && String(d.sourceId)===String(id)) clearOverlay(); }catch{} };
                  window.addEventListener('ai-request-finished', onFinish, { once:true });
                  // safety timeout to clear overlay if nothing comes back
                  const safety = setTimeout(()=>{
                    try{ rightOverlay.classList.remove('show'); }catch{}
                    try{
                      let cont = document.getElementById('toastContainer'); if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
                      const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Inget svar mottogs. Kontrollera nod, nyckel eller nätverk.'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 2500);
                    }catch{}
                  }, 30000);
                  const clearSafety = ()=>{ try{ clearTimeout(safety); }catch{} };
                  window.addEventListener('exercises-data-changed-global', clearSafety, { once:true });
                  sec.addEventListener('exercises-data-changed', clearSafety, { once:true });
                  window.addEventListener('ai-request-finished', clearSafety, { once:true });
                  if (graderId && window.requestAIReply){ window.requestAIReply(graderId, { text: payload, sourceId: id }); }
                  else if (window.routeMessageFrom) window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() });
                }catch{}
                // mark this index to receive incoming feedback
                setPendingFeedback(idx);
              });
              // When we send an improvement from full-screen, that page handles overlay. If we add an improve button here later, use leftOverlay similarly.
            }catch{}
          };
          sec.addEventListener('exercises-data-changed', ()=>renderExercisesFocus());
          // Cross-tab: re-render when exercises data or cursor changes in another tab
          const onStorage = (e)=>{
            try{
              if (!e || !e.key) return;
              if (e.key === `sectionExercises:${id}` || e.key === `sectionExercisesCursor:${id}` || e.key === '__exercises_changed__'){
                renderExercisesFocus();
              }
            }catch{}
          };
          window.addEventListener('storage', onStorage);
          const renumberExercises = ()=>{
            try{
              const blocks = sec.querySelectorAll('.exercise-block');
              let i = 1;
              blocks.forEach(b=>{
                const n = b.querySelector('.ex-num');
                if (n) n.textContent = String(i++);
              });
            }catch{}
          };
          const createExBlock = (data)=>{
            const box = document.createElement('div');
            box.className = 'exercise-block';
            box.innerHTML = `
              <div class="ex-head" style="display:flex; align-items:center; gap:8px;">
                <span class="ex-num" style="min-width:20px; text-align:right; color:#9aa0b4;">#</span>
                <div class="ex-q" contenteditable="true" spellcheck="false" style="flex:1;">${(data&&data.q)?String(data.q):'Fråga...'}</div>
              </div>
              <textarea class="ex-a" rows="3" placeholder="Skriv ditt svar..." style="margin-top:6px;"></textarea>
              <div class="ex-actions" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px;">
                <button type="button" data-action="grade-one" class="btn">Rätta denna</button>
                <button type="button" data-action="del" class="btn btn-ghost">Ta bort</button>
              </div>
            `;
            const a = box.querySelector('.ex-a'); if (a && data && data.a) a.value = String(data.a);
            // Events
            const save = ()=>saveExercises();
            box.querySelector('.ex-q')?.addEventListener('input', save);
            a?.addEventListener('input', save);
            box.querySelector('[data-action="del"]')?.addEventListener('click', ()=>{ box.remove(); saveExercises(); renumberExercises(); });
            box.querySelector('[data-action="grade-one"]')?.addEventListener('click', (ev)=>{
              // Guard against double-trigger (e.g., event bubbling or fast double click)
              const btn = ev.currentTarget;
              const now = Date.now();
              if (btn && btn._lastClick && (now - btn._lastClick) < 400) return;
              if (btn) btn._lastClick = now;
              const q = String(box.querySelector('.ex-q')?.textContent||'').trim();
              const ans = String(box.querySelector('.ex-a')?.value||'').trim();
              const n = String(box.querySelector('.ex-num')?.textContent||'').trim() || '?';
              // Serialize a single Q/A
              const payload = `Fråga ${n}: ${q}\nSvar ${n}: ${ans}`;
              try{
                const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
                // Prefer parked Grader (direct), else fall back to cable routing
                const park = getParking(); const graderId = park && park.grader ? String(park.grader) : '';
                if (graderId && window.requestAIReply){ window.requestAIReply(graderId, { text: payload, sourceId: id }); }
                else if (window.routeMessageFrom) window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() });
              }catch{}
              // mark pending feedback to current displayed number (1-based -> store index)
              try{ const idx = Math.max(0, (Number(n)||1) - 1); sec.dataset.pendingFeedback = String(idx); }catch{}
            });
            grid?.appendChild(box);
            saveExercises();
            renumberExercises();
          };
          const collectExercises = ()=>{
            const out = []; const blocks = sec.querySelectorAll('.exercise-block');
            if (blocks.length){ blocks.forEach(b=>{ const q = String(b.querySelector('.ex-q')?.textContent||'').trim(); const a = String(b.querySelector('.ex-a')?.value||'').trim(); if (q||a) out.push({ q, a }); }); return out; }
            return getExercises();
          };
          const saveExercises = ()=>{ try{ const data = collectExercises(); localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(data)); sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{} };
          const loadExercises = ()=>{ try{ const raw = localStorage.getItem(`sectionExercises:${id}`); if(!raw) return; const data = JSON.parse(raw)||[]; if (sec.querySelector('.ex-focus')){ renderExercisesFocus(); } else { data.forEach(d=>createExBlock(d)); renumberExercises(); } }catch{} };
          btnAdd.addEventListener('click', ()=>{
            if (sec.querySelector('.ex-focus')){
              const arr = getExercises(); arr.push({ q:'Fråga...', a:'' }); setExercises(arr); setCursor(arr.length-1); renderExercisesFocus();
            } else {
              createExBlock();
            }
          });
          btnGradeAll.addEventListener('click', ()=>{
            const data = collectExercises();
            if (!data.length){ alert('Inga övningsblock i sektionen.'); return; }
            // Serialize to a grading-friendly text
            const parts = [];
            data.forEach((it, idx)=>{
              const n = idx+1;
              parts.push(`Fråga ${n}: ${it.q||''}`);
              parts.push(`Svar ${n}: ${it.a||''}`);
              parts.push('');
            });
            const text = parts.join('\n');
            try{
              const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
              if (window.routeMessageFrom) window.routeMessageFrom(id, text, { author: title, who:'user', ts: Date.now() });
            }catch{}
          });
          btnDeleteAll.addEventListener('click', ()=>{
            if (!confirm('Ta bort alla frågor i denna sektion?')) return;
            // Clear storage
            try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify([])); }catch{}
            try{ localStorage.removeItem(`sectionExercisesCursor:${id}`); }catch{}
            // Clear any pending feedback flag
            try{ delete sec.dataset.pendingFeedback; }catch{}
            // Remove UI blocks or re-render focus
            if (sec.querySelector('.ex-focus')){
              setExercises([]); setCursor(0);
              try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
            } else {
              try{ sec.querySelectorAll('.exercise-block').forEach(b=>b.remove()); }catch{}
            }
          });
          btnClearAnswers.addEventListener('click', ()=>{
            if (!confirm('Rensa alla svar och påbörja ny omgång?')) return;
            try{
              const arr = getExercises().map(it=> Object.assign({}, it, { a: '' }));
              setExercises(arr);
              incRound();
              // notify both same-tab and cross-tab
              try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
              try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
            }catch{}
          });
          // Initial load handled later by the mode-aware renderer below
        }
        // Text toolbar for non-exercises modes
        if (!head.querySelector('[data-role="textToolbar"]')){
          const tBar = document.createElement('div');
          tBar.setAttribute('data-role','textToolbar');
          tBar.style.display = 'flex';
          tBar.style.gap = '6px';
          tBar.style.marginLeft = '8px';
          const btnClear = document.createElement('button');
          btnClear.type = 'button'; btnClear.textContent = 'Rensa all text'; btnClear.className='btn btn-ghost';
          tBar.appendChild(btnClear);
          // Parking selector for non-exercises modes: choose a coworker to auto-append replies as input
          try{
            const parkWrap = document.createElement('label');
            parkWrap.className = 'subtle';
            parkWrap.style.display = 'flex';
            parkWrap.style.alignItems = 'center';
            parkWrap.style.gap = '6px';
            parkWrap.style.marginLeft = '12px';
            const span = document.createElement('span'); span.textContent = 'Inmatning:';
            const sel = document.createElement('select'); sel.className = 'btn';
            parkWrap.appendChild(span); parkWrap.appendChild(sel);
            tBar.appendChild(parkWrap);
            const getParking = ()=>{ try{ const raw = localStorage.getItem(`sectionParking:${id}`); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
            const setParking = (obj)=>{ try{ localStorage.setItem(`sectionParking:${id}`, JSON.stringify(obj||{})); }catch{} };
            const fillFromCoworkers = ()=>{
              const opts = [{ value:'', label:'— Välj nod —' }];
              try{
                document.querySelectorAll('.fab[data-type="coworker"]').forEach(el=>{
                  const value = el.dataset.id||''; const label = el.dataset.displayName || ('CoWorker '+value);
                  if (value) opts.push({ value, label });
                });
              }catch{}
              sel.innerHTML='';
              opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value; op.textContent=o.label; sel.appendChild(op); });
              try{ const cur = getParking(); const prev = cur && cur.input ? String(cur.input) : ''; if (prev) sel.value = prev; }catch{}
            };
            fillFromCoworkers();
            window.addEventListener('coworkers-changed', fillFromCoworkers);
            sel.addEventListener('change', ()=>{ const p=getParking(); p.input = sel.value||null; setParking(p); });
          }catch{}
          // Export dropdown (non-exercises too)
          try{
            const expWrap = document.createElement('label');
            expWrap.className = 'subtle';
            expWrap.style.display = 'flex'; expWrap.style.alignItems = 'center'; expWrap.style.gap = '6px'; expWrap.style.marginLeft = '12px';
            const span = document.createElement('span'); span.textContent = 'Exportera till:';
            const sel = document.createElement('select'); sel.className = 'btn';
            const refreshBtn = document.createElement('button'); refreshBtn.type='button'; refreshBtn.className='btn btn-ghost'; refreshBtn.textContent='↻'; refreshBtn.title='Uppdatera lista'; refreshBtn.style.padding='2px 6px';
            expWrap.appendChild(span); expWrap.appendChild(sel); expWrap.appendChild(refreshBtn);
            tBar.appendChild(expWrap);
            const fillSections = ()=>{
              const opts = [{ value:'', label:'— Välj sektion —' }];
              try{
                document.querySelectorAll('.panel.board-section').forEach(el=>{
                  const sid = el.dataset.sectionId||''; if (!sid) return;
                  const h2 = el.querySelector('.head h2');
                  const title = (h2?.textContent||'').trim() || sid;
                  opts.push({ value: sid, label: title });
                });
              }catch{}
              sel.innerHTML=''; opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value; op.textContent=o.label; sel.appendChild(op); });
              sel.value='';
            };
            fillSections();
            refreshBtn.addEventListener('click', ()=> fillSections());
            sel.addEventListener('change', ()=>{
              try{
                const targetId = String(sel.value||''); if (!targetId) return;
                const srcId = id; // this section is the source of theory
                localStorage.setItem(`sectionTheorySrc:${targetId}`, srcId);
                try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
                // feedback toast
                let cont = document.getElementById('toastContainer'); if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
                const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Export kopplad – öppna helskärm på målsektionen för att visa Teori.'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1500);
                sel.value='';
              }catch{}
            });
            window.addEventListener('board-sections-changed', fillSections);
            window.addEventListener('storage', (e)=>{ try{ if (!e||!e.key) return; if (e.key==='boardSections:list:v1' || /^boardSection:title:/.test(e.key)) fillSections(); }catch{} });
          }catch{}
          head.appendChild(tBar);
          btnClear.addEventListener('click', ()=>{
            if (!confirm('Rensa all text i denna sektion?')) return;
            try{
              const note = sec.querySelector('.note');
              const sel = head.querySelector('[data-role="secRenderMode"]');
              const mode = sel ? sel.value : 'raw';
              // Clear stored raw and DOM content
              try{ localStorage.setItem(`sectionRaw:${id}`, ''); }catch{}
              if (note){
                if (mode === 'html' || mode === 'md'){ note.innerHTML = ''; note.dataset.rendered = '1'; }
                else { note.textContent = ''; delete note.dataset.rendered; }
              }
            }catch{}
          });
        }
        if (!head.querySelector('[data-role="secRenderMode"]')){
          const wrap = document.createElement('div');
          wrap.style.marginLeft = 'auto';
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
          wrap.style.gap = '8px';
          const label = document.createElement('label');
          label.className = 'subtle';
          label.textContent = 'Visning:';
          const sel = document.createElement('select');
          sel.setAttribute('data-role','secRenderMode');
          sel.innerHTML = '<option value="raw">Rå text</option><option value="md">Markdown</option><option value="html">HTML</option><option value="exercises">Övningsblock</option>';
          // load saved
          try{
            const raw = localStorage.getItem(`sectionSettings:${id}`);
            const saved = raw ? JSON.parse(raw) : {};
            if (saved.renderMode) sel.value = saved.renderMode;
          }catch{}
          // Sync toolbar visibility on load
          try{ updateToolbarVisibility(sel.value || 'raw'); }catch{}
    sel.addEventListener('change', ()=>{
            try{
              const raw = localStorage.getItem(`sectionSettings:${id}`);
              const cur = raw ? JSON.parse(raw) : {};
              const next = Object.assign({}, cur, { renderMode: sel.value });
              localStorage.setItem(`sectionSettings:${id}`, JSON.stringify(next));
              // Re-render current content according to the new mode
              const note = sec.querySelector('.note');
              if (note){
                const mode = sel.value;
                if (mode === 'exercises'){
      // Render single-question focus UI
      try{ const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; } }catch{}
      sec.setAttribute('data-mode','exercises');
      try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
                } else if (mode === 'md' && window.mdToHtml){
      sec.removeAttribute('data-mode');
      // remove focus UI if present
      try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
  // reset layout to single-column content area
  try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.innerHTML = sanitizeHtml(window.mdToHtml(src));
                  note.dataset.rendered = '1';
                } else if (mode === 'html'){
      sec.removeAttribute('data-mode');
      try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
  try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.innerHTML = sanitizeHtml(src);
                  note.dataset.rendered = '1';
                } else {
      sec.removeAttribute('data-mode');
      try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.textContent = src;
                  delete note.dataset.rendered;
                  // reset layout
                  try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                }
                // Update toolbars for new mode
                try{ updateToolbarVisibility(mode); }catch{}
        // Toggle Markdown edit button visibility
        try{ const editBtnNow = head.querySelector('.edit-md-btn'); if (editBtnNow) editBtnNow.style.display = (mode === 'md') ? '' : 'none'; }catch{}
              }
            }catch{}
          });
          wrap.appendChild(label);
          wrap.appendChild(sel);
          // Insert before IO point to keep layout
          const io = head.querySelector('.section-io');
          if (io && io.parentElement === head){ head.insertBefore(wrap, io); }
          else { head.appendChild(wrap); }
        }
        // Note focus/blur: auto MD render on blur when mode=md
        const note = sec.querySelector('.note');
        if (note){
          // Add 'Redigera' button for Markdown mode
          let editBtn = head.querySelector('.edit-md-btn');
          if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = 'Redigera';
            editBtn.className = 'edit-md-btn btn btn-ghost';
            editBtn.style.marginLeft = '8px';
            head.appendChild(editBtn);
          }
          let editing = false;
          let textarea = null;
          const renderMarkdown = ()=>{
            const src = localStorage.getItem(`sectionRaw:${id}`) || '';
            note.innerHTML = window.mdToHtml ? sanitizeHtml(window.mdToHtml(src)) : sanitizeHtml(src);
            note.dataset.rendered = '1';
          };
          const startEdit = ()=>{
            if (editing) return;
            editing = true;
            const src = localStorage.getItem(`sectionRaw:${id}`) || '';
            textarea = document.createElement('textarea');
            textarea.className = 'md-edit-area';
            textarea.value = src;
            textarea.style.width = '100%';
            textarea.style.minHeight = '180px';
            textarea.style.fontFamily = 'monospace';
            textarea.style.fontSize = '1em';
            textarea.style.marginTop = '8px';
            note.innerHTML = '';
            note.appendChild(textarea);
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            textarea.addEventListener('keydown', (e)=>{
              if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Escape')){
                e.preventDefault(); finishEdit();
              }
            });
            textarea.addEventListener('blur', finishEdit);
          };
          const finishEdit = ()=>{
            if (!editing) return;
            editing = false;
            const val = textarea.value;
            localStorage.setItem(`sectionRaw:${id}`, val);
            renderMarkdown();
            textarea = null;
          };
          editBtn.onclick = ()=>{ if (!editing) startEdit(); };
          // Only show edit button in Markdown mode
          const s = localStorage.getItem(`sectionSettings:${id}`);
          const mode = s ? (JSON.parse(s).renderMode || 'md') : 'md';
          editBtn.style.display = (mode === 'md') ? '' : 'none';
          // Initial render
          if (mode === 'exercises'){
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; } }catch{}
            sec.setAttribute('data-mode','exercises');
            try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
          } else if (mode === 'md' && window.mdToHtml){
            // ensure layout is reset to single-column and remove any exercises UI
            sec.removeAttribute('data-mode');
            try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            renderMarkdown();
          } else if (mode === 'html'){
            // clear exercises flag/UI and render stored HTML
            sec.removeAttribute('data-mode');
            try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
            localStorage.setItem(`sectionRaw:${id}`, src);
            note.innerHTML = sanitizeHtml(src);
            note.dataset.rendered = '1';
          } else {
            // raw text mode on initial render: clear exercises, reset layout, and show plain text
            sec.removeAttribute('data-mode');
            try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
            localStorage.setItem(`sectionRaw:${id}`, src);
            note.textContent = src;
            delete note.dataset.rendered;
          }
        }
      });
    }catch{}
  }
  // Section streaming helpers: build content incrementally without adding extra newlines per chunk
  try{
    window.__sectionStreamState = window.__sectionStreamState || new Map();
    window.appendToSectionStreamBegin = function(sectionId){
      try{
        const id = String(sectionId||''); if (!id) return;
        if (window.__sectionStreamState.has(id)) return; // already begun
        const base = localStorage.getItem(`sectionRaw:${id}`) || '';
        window.__sectionStreamState.set(id, { base, buf: '' });
      }catch{}
    };
    window.appendToSectionStreamDelta = function(sectionId, delta){
      try{
        const id = String(sectionId||''); if (!id) return;
        const st = window.__sectionStreamState.get(id);
        if (!st){ window.appendToSectionStreamBegin(id); return window.appendToSectionStreamDelta(id, delta); }
        st.buf += String(delta||'');
        const combined = st.base + st.buf;
        localStorage.setItem(`sectionRaw:${id}`, combined);
        // Re-render according to saved renderMode
        const sec = document.querySelector(`.panel.board-section[data-section-id="${id}"]`);
        const note = sec ? sec.querySelector('.note') : null; if (!note) return;
        let mode = 'md';
        try{ const raw = localStorage.getItem(`sectionSettings:${id}`); if (raw){ const s = JSON.parse(raw)||{}; if (s.renderMode) mode = String(s.renderMode); } }catch{}
        if (mode === 'md' && window.mdToHtml){
          try{ note.innerHTML = sanitizeHtml(window.mdToHtml(combined)); note.dataset.rendered = '1'; }catch{ note.textContent = combined; delete note.dataset.rendered; }
        } else if (mode === 'html'){
          try{ note.innerHTML = sanitizeHtml(combined); note.dataset.rendered = '1'; }catch{ note.textContent = combined; delete note.dataset.rendered; }
        } else {
          note.textContent = combined; delete note.dataset.rendered;
        }
      }catch{}
    };
    window.appendToSectionStreamEnd = function(sectionId){
      try{ const id = String(sectionId||''); window.__sectionStreamState.delete(id); }catch{}
    };
  }catch{}
  // Utilities to import questions into a section as exercise blocks
  (function(){
    function parseQuestions(text){
      try{
        const src = String(text||'');
        const lines = src.split(/\r?\n/);
        const items = [];
        let buf = [];
        const flush = ()=>{ const q = buf.join(' ').trim(); if (q) items.push({ q }); buf = []; };
        for (let i=0;i<lines.length;i++){
          const line = lines[i].trim();
          if (!line){ flush(); continue; }
          const isNum = /^\d+[\).]\s+/.test(line);
          const isBullet = /^[-*•]\s+/.test(line);
          const isQ = /^(fråga|question|q[:\-\.]?)\s*/i.test(line);
          const isA = /^(svar|answer|a[:\-\.]?)\s*/i.test(line);
          if (isNum || (isBullet && buf.length===0) || (isQ && buf.length===0)){
            flush();
            const re = new RegExp('^(?:\\d+[\\)\\.]\\s+|[-*•]\\s+|(?:fråga|question|q)[:\\-\\.]?\\s*)','i');
            const cleaned = line.replace(re, '');
            buf.push(cleaned);
            continue;
          }
          if (isA){
            const ans = line.replace(/^(svar|answer|a)[:\-\.]?\s*/i, '');
            if (!buf.length) { items.push({ q:'', a: ans }); }
            else { const q = buf.join(' ').trim(); items.push({ q, a: ans }); buf = []; }
            continue;
          }
          buf.push(line);
        }
        flush();
        return items.filter(it => it.q || it.a);
      }catch{ return []; }
    }
    function saveExercises(sec){
      try{
        const id = sec?.dataset.sectionId||''; if (!id) return;
        const blocks = sec.querySelectorAll('.exercise-block');
        const out = [];
        blocks.forEach(b=>{ const q = String(b.querySelector('.ex-q')?.textContent||'').trim(); const a = String(b.querySelector('.ex-a')?.value||'').trim(); if (q||a) out.push({ q, a }); });
        localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(out));
      }catch{}
    }
    function renumber(sec){
      try{ let i=1; sec.querySelectorAll('.exercise-block .ex-num').forEach(n=>n.textContent=String(i++)); }catch{}
    }
    function createBlock(sec, data){
      const grid = sec.querySelector('.body .grid') || sec.querySelector('.body');
      const box = document.createElement('div');
      box.className = 'exercise-block';
      box.innerHTML = `
        <div class="ex-head" style="display:flex; align-items:center; gap:8px;">
          <span class="ex-num" style="min-width:20px; text-align:right; color:#9aa0b4;">#</span>
          <div class="ex-q" contenteditable="true" spellcheck="false" style="flex:1;"></div>
        </div>
        <textarea class="ex-a" rows="3" placeholder="Skriv ditt svar..." style="margin-top:6px;"></textarea>
        <div class="ex-actions" style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;"><button type="button" data-action="del" class="btn btn-ghost">Ta bort</button></div>
      `;
      box.querySelector('.ex-q').textContent = (data&&data.q)?String(data.q):'Fråga...';
      const a = box.querySelector('.ex-a'); if (a && data && data.a) a.value = String(data.a);
      box.querySelector('.ex-q')?.addEventListener('input', ()=>saveExercises(sec));
      a?.addEventListener('input', ()=>saveExercises(sec));
      box.querySelector('[data-action="del"]')?.addEventListener('click', ()=>{ box.remove(); saveExercises(sec); renumber(sec); });
      grid?.appendChild(box);
    }
    function clearBlocks(sec){
      try{ sec.querySelectorAll('.exercise-block').forEach(b=>b.remove()); }catch{}
    }
    function importExercisesIntoSection(sec, text, opts){
      try{
        let items = parseQuestions(text);
        if (!items.length){
          const q = String(text||'').trim();
          if (q) items = [{ q }]; else return;
        }
        if (!opts || !opts.append) clearBlocks(sec);
        items.forEach(it=>createBlock(sec, it));
        saveExercises(sec);
        renumber(sec);
      }catch{}
    }
    window.__importExercisesIntoSection = importExercisesIntoSection;
    window.__parseQuestions = parseQuestions;
  })();
  // expose
  window.openPanel = openPanel;
  window.openUserPanel = openUserPanel;
  window.openCoworkerPanel = openCoworkerPanel;
  window.openPanelForNode = openPanelForNode;
  window.wireComposer = wireComposer;
  window.makePanelDraggable = makePanelDraggable;
  window.positionPanelConn = positionPanelConn;
  window.receiveMessage = receiveMessage;
  window.appendToSection = appendToSection;
  window.initBoardSectionSettings = initBoardSectionSettings;
})();
