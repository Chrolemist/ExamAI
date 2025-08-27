// Flyout panels and chat UI (classic)
// Purpose: Owns the flyout panel UIs for User/CoWorker/Internet and the chat composer.
// Panels are draggable/resizable and connectable via header IO points.
(function(){
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
    const readSaved = ()=>{ let s={}; try{ if(window.graph && ownerId) s = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{} try{ const raw = localStorage.getItem(lsKey(ownerId)); if(raw){ s = Object.assign({}, s, JSON.parse(raw)||{}); } }catch{} return s; };
    const persist = (partial)=>{ try{ if(window.graph && ownerId) window.graph.setNodeSettings(ownerId, partial||{}); }catch{} try{ const cur = readSaved(); const next = Object.assign({}, cur, partial||{}); localStorage.setItem(lsKey(ownerId), JSON.stringify(next)); }catch{} };
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
      // Attempt to migrate a blob-only attachment to a stable HTTP URL by re-uploading it
      const migrateToHttp = async (x) => {
        try{
          if (x && !x.url && (x.origUrl || x.blobUrl)){
            const src = x.origUrl || x.blobUrl; if (!src) return false;
            const apiBase = detectApiBase(); if (!apiBase) return false;
            const blob = await fetch(src).then(r=>r.blob());
            const name = String(x.name || 'fil');
            const type = String(x.mime || blob.type || 'application/octet-stream');
            const file = new File([blob], name, { type });
            const fd = new FormData(); fd.append('files', file);
            const res = await fetch(apiBase + '/upload', { method:'POST', body: fd });
            if (!res.ok) return false;
            const data = await res.json();
            const first = data && Array.isArray(data.items) ? data.items[0] : null;
            if (first && first.url){
              x.url = String(first.url);
              if (Array.isArray(first.pages)) x.pages = first.pages;
              if (typeof first.chars === 'number') x.chars = first.chars;
              if (typeof first.truncated === 'boolean') x.truncated = first.truncated;
              try{ savePersistedAtt(panel._attachments); }catch{}
              try{ if (x.origUrl) URL.revokeObjectURL(x.origUrl); }catch{}
              return true;
            }
          }
        }catch{}
        return false;
      };

      const buildPdfUrl = (base, pick)=>{
        try{
          if (!base) return base;
          const hasHash = /#/.test(base);
          const parts = [];
          if (pick && pick.page) parts.push('page=' + encodeURIComponent(pick.page));
          if (pick && pick.q){
            // use first 6 words to keep it short for viewers
            const q = String(pick.q||'').split(/\s+/).filter(Boolean).slice(0,6).join(' ');
            if (q) parts.push('search=' + encodeURIComponent(q));
          }
          if (!parts.length) return base;
          return base + (hasHash ? (base.endsWith('#') ? '' : '&') : '#') + parts.join('&');
        }catch{ return base; }
      };

      const openAttachment = async (x, opts) => {
        try{
          let href = x.url || x.origUrl || x.blobUrl;
          if (!href){ const blob = new Blob([String(x.text||'')], { type:(x.mime||'text/plain')+';charset=utf-8' }); href = URL.createObjectURL(blob); x.blobUrl = href; }
          // If this is a blob and we can migrate, try to upgrade to a stable HTTP URL first
          if (/^blob:/i.test(String(href||''))){
            try{ const ok = await migrateToHttp(x); if (ok && x.url) href = x.url; }catch{}
          }
          // If PDF, open our viewer with the blob URL for better UX
          const usePdf = isPdf(x);
          let finalHref = href;
          if (usePdf){
            try{
              const hint = (opts && typeof opts.hintText==='string') ? opts.hintText : '';
              const pick = pickSnippetAndPage(x, hint);
              finalHref = buildPdfUrl(href, pick);
            }catch{}
          }
          const a = document.createElement('a'); a.href = finalHref; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
        }catch{}
      };
      items.forEach((it, idx)=>{ const chip = document.createElement('span'); chip.className = 'attachment-chip'; const name = document.createElement('span'); name.textContent = `${it.name||'fil'}${it.chars?` (${it.chars} tecken${it.truncated?', trunkerat':''})`:''}`;
        // View/download link; open directly (prefer HTTP), migrate if needed
  const view = document.createElement('a'); view.href = '#'; view.textContent = '↗'; view.title = 'Öppna material'; view.style.marginLeft = '6px'; view.addEventListener('click', (e)=>{ e.preventDefault(); openAttachment(it, { hintText: panel._lastAssistantText||'' }); });
        const rm = document.createElement('button'); rm.className='rm'; rm.type='button'; rm.title='Ta bort'; rm.textContent='×'; rm.addEventListener('click', ()=>{ try{ if (it.blobUrl) { try{ URL.revokeObjectURL(it.blobUrl); }catch{} } panel._attachments.splice(idx,1); savePersistedAtt(panel._attachments); renderAttachments(); }catch{} }); chip.appendChild(name); chip.appendChild(view); chip.appendChild(rm); attBar.appendChild(chip); }); savePersistedAtt(items); }catch{} };
  // Initial render so persisted attachments are visible on open
  try{ renderAttachments(); }catch{}
  // Kick off a lazy migration of any blob-only attachments to stable HTTP URLs
  (async()=>{
    try{
      const arr = Array.isArray(panel._attachments)? panel._attachments : [];
      const needs = arr.filter(x=>x && !x.url && (x.origUrl || x.blobUrl));
      if (!needs.length) return;
      for (const x of needs){ try{ await migrateToHttp(x); }catch{} }
      savePersistedAtt(panel._attachments);
      renderAttachments();
    }catch{}
  })();
  const uploadFiles = async (files)=>{
      try{
        const arr = Array.from(files||[]).filter(f=>{
          const n = (f.name||'').toLowerCase(); const t = (f.type||'').toLowerCase();
          return n.endsWith('.pdf') || n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown') || t.includes('pdf') || t.includes('text') || t.includes('markdown');
        });
        if (!arr.length) return;
    const fd = new FormData(); arr.forEach(f=>fd.append('files', f)); fd.append('maxChars','50000');
        const apiBase = detectApiBase();
        const url = apiBase + '/upload?maxChars=50000';
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
    const buildMessageWithAttachments = (val)=>{
      try{
        const items = panel._attachments||[]; if (!items.length) return val;
        const parts = [val];
        for (const it of items){
          const header = `\n\n---\nBilaga: ${it.name}${it.chars?` (${it.chars} tecken${it.truncated?', trunkerat':''})`:''}\n\n`;
          parts.push(header + (it.text||''));
        }
        return parts.join('');
      }catch{ return val; }
    };
  const clearAttachments = ()=>{ try{ panel._attachments = []; savePersistedAtt([]); renderAttachments(); }catch{} };
    const doSend=()=>{ const val=(ta.value||'').trim(); if(!val) return; const ownerId=panel.dataset.ownerId||null; const authorLabel = panel.querySelector('.drawer-head .meta .name'); const author = (authorLabel?.textContent||'User').trim(); let ts=Date.now(); try{ if(ownerId && window.graph){ const entry = window.graph.addMessage(ownerId, author, val, 'user'); ts = entry?.ts || ts; } }catch{} append(val,'user', ts);
      // Determine send mode
      let mode = 'current'; try{ mode = panel._sendMode || (readSaved().sendMode||'current'); }catch{}
      const entries = (window.graph && ownerId) ? (window.graph.getMessages(ownerId)||[]) : [];
      let lastSent = '';
      const sendCurrent = ()=>{ const msg = buildMessageWithAttachments(val); lastSent = msg; if(ownerId && window.routeMessageFrom){ try{ window.routeMessageFrom(ownerId, msg, { author, who:'user', ts }); }catch{} } };
      const sendHistoryOnce = ()=>{
        const parts = [];
        try{
          for (const m of entries){ const a = m.author || (m.who==='user'?'User':'Assistant'); const t = String(m.text||''); if (t) parts.push(`${a}: ${t}`); }
        }catch{}
        // include current input at the end
        if (val) parts.push(`${author}: ${val}`);
        let combined = parts.join('\n\n');
        combined = buildMessageWithAttachments(combined);
        lastSent = combined;
        if(ownerId && window.routeMessageFrom){ try{ window.routeMessageFrom(ownerId, combined, { author, who:'user', ts }); }catch{} }
      };
      const sendHistorySeq = ()=>{
        try{ for (const m of entries){ const t = String(m.text||''); if (t && ownerId && window.routeMessageFrom) window.routeMessageFrom(ownerId, t, { author, who:'user', ts }); } }catch{}
        // send current last with attachments
        sendCurrent();
      };
      if (mode === 'history-once') sendHistoryOnce();
      else if (mode === 'history-seq') sendHistorySeq();
      else sendCurrent();
  ta.value='';
      // If Internet panel, kick off web-enabled reply via backend
  try{ const host = document.querySelector(`.fab[data-id="${ownerId}"]`); if(host && host.dataset.type==='internet' && window.requestInternetReply){ const payload = lastSent || buildMessageWithAttachments(val); window.requestInternetReply(ownerId, { text: payload }); } }catch{}
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
            const composed = (mode==='current' ? buildMessageWithAttachments(val) : val);
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
      <label>Visningsläge
        <select data-role="renderMode">
          <option value="raw">Rå text</option>
          <option value="md">Snyggt (Markdown)</option>
        </select>
      </label>
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
    const clearBtn=panel.querySelector('[data-action="clear"]'); clearBtn?.addEventListener('click', ()=>{ const m=panel.querySelector('.messages'); if(m) m.innerHTML=''; });
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
    const headerNameEl=panel.querySelector('.drawer-head .meta .name'); const nameInput=panel.querySelector('[data-role="name"]'); panel._displayName=''; const updateFabLabel=(text)=>{ const lab=hostEl.querySelector('.fab-label'); if(lab) lab.textContent=text; };
    nameInput?.addEventListener('input', ()=>{ panel._displayName=nameInput.value||''; const nameText=panel._displayName.trim()||'User'; if(headerNameEl) headerNameEl.textContent=nameText; updateFabLabel(nameText); }); if(headerNameEl) headerNameEl.textContent='User'; updateFabLabel('User');
  panel.querySelector('[data-action="resetAll"]')?.addEventListener('click', ()=>{ panel._bubbleColorHex='#7c5cff'; panel._bubbleAlpha=0.10; panel._bgOn=true; const m=messagesEl; if(m) m.innerHTML=''; if(colorPicker) colorPicker.value=panel._bubbleColorHex; if(colorToggle) colorToggle.style.background=panel._bubbleColorHex; if(alphaEl) alphaEl.value='10'; if(alphaVal) alphaVal.textContent='10%'; if(fontTextSel){ fontTextSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._textFont=fontTextSel.value; if(messagesEl) messagesEl.style.fontFamily=panel._textFont; if(inputEl) inputEl.style.fontFamily=panel._textFont; } if(fontNameSel){ fontNameSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._nameFont=fontNameSel.value; const hn=panel.querySelector('.drawer-head .meta .name'); if(hn) hn.style.fontFamily=panel._nameFont; const lab=hostEl.querySelector('.fab-label'); if(lab) lab.style.fontFamily=panel._nameFont; panel.querySelectorAll('.author-label').forEach(el=>{ el.style.fontFamily=panel._nameFont; }); } if(renderSel){ renderSel.value='raw'; } applyBubbleStyles(); });
  panel.querySelector('[data-close]')?.addEventListener('click', ()=>{ document.removeEventListener('click', onDocClick); panel.remove(); });
    // Render historical messages if any
  try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      // Determine render mode for user panel
      let renderMode = 'raw';
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
      <button class="icon-btn" data-action="clear" title="Rensa chatt">🧹</button>
      <button class="icon-btn" data-action="delete" title="Radera">🗑</button>
      <button class="icon-btn" data-close>✕</button>
    </header>
    <div class="settings collapsed" data-role="settings">
      <label>Modell
        <select data-role="model">
          <option value="gpt-4o-mini" selected>gpt-4o-mini</option>
          <option value="gpt-5">gpt-5</option>
          <option value="gpt-5-mini">gpt-5-mini</option>
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
      <label class="inline">
        <input type="checkbox" data-role="selfReply" checked /> Svara från denna panel (självchatt)
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
  addResizeHandles(panel); document.body.appendChild(panel); makePanelDraggable(panel, panel.querySelector('.drawer-head'));
  try{ const g = loadPanelGeom(panel.dataset.ownerId||''); if (g) applyPanelGeom(panel, g); }catch{}
    const settingsBtn=panel.querySelector('[data-action="settings"]'); const settings=panel.querySelector('[data-role="settings"]'); settingsBtn?.addEventListener('click', ()=>settings.classList.toggle('collapsed'));
    const clearBtn=panel.querySelector('[data-action="clear"]'); clearBtn?.addEventListener('click', ()=>{ const m=panel.querySelector('.messages'); if(m) m.innerHTML=''; });
    const delBtn=panel.querySelector('[data-action="delete"]'); delBtn?.addEventListener('click', ()=>panel.remove());
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
      const nameEl = by('[data-role="name"]');
      const topicEl = by('[data-role="topic"]');
      const roleEl = by('[data-role="role"]');
      const useRoleEl = by('[data-role="useRole"]');
  const selfReplyEl = by('[data-role="selfReply"]');
      const maxTokEl = by('[data-role="maxTokens"]');
      const maxTokVal = by('[data-role="maxTokensValue"]');
      const typeSpdEl = by('[data-role="typingSpeed"]');
      const typeSpdVal = by('[data-role="typingSpeedValue"]');
      const renderEl = by('[data-role="renderMode"]');
  // Web search settings removed from CoWorker; handled by Internet node
      const apiKeyEl = by('[data-role="apiKey"]');
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
      };
      const saved = readSaved();
      // Initialize controls from saved settings
      if (saved.model && modelEl) modelEl.value = saved.model;
      if (saved.name && nameEl) { nameEl.value = saved.name; updateName(saved.name); }
      if (saved.topic && topicEl) topicEl.value = saved.topic;
      if (saved.role && roleEl) roleEl.value = saved.role;
      if (typeof saved.useRole === 'boolean' && useRoleEl) useRoleEl.checked = !!saved.useRole;
  if (typeof saved.selfPanelReply === 'boolean' && selfReplyEl) selfReplyEl.checked = !!saved.selfPanelReply; else if (selfReplyEl && saved.selfPanelReply === undefined) selfReplyEl.checked = true;
      if (saved.maxTokens && maxTokEl) { maxTokEl.value = String(saved.maxTokens); if(maxTokVal) maxTokVal.textContent = String(saved.maxTokens); }
      if (typeof saved.typingSpeed === 'number' && typeSpdEl) { typeSpdEl.value = String(saved.typingSpeed); if(typeSpdVal) typeSpdVal.textContent = (saved.typingSpeed>=66?'Snabb':saved.typingSpeed<=33?'Långsam':'Medel'); }
      if (saved.renderMode && renderEl) renderEl.value = saved.renderMode;
  // no web settings for coworker anymore
      if (saved.apiKey && apiKeyEl) { apiKeyEl.value = saved.apiKey; }
      updateKeyBadge();
      updateRoleBadge();
      // Wire events to persist immediately
      modelEl?.addEventListener('change', ()=>persist({ model: modelEl.value }));
      nameEl?.addEventListener('input', ()=>{ const v=nameEl.value||''; updateName(v); persist({ name: v }); });
      topicEl?.addEventListener('input', ()=>{ persist({ topic: topicEl.value||'' }); updateRoleBadge(); });
      roleEl?.addEventListener('input', ()=>{ persist({ role: roleEl.value||'' }); updateRoleBadge(); });
      useRoleEl?.addEventListener('change', ()=>{ persist({ useRole: !!useRoleEl.checked }); updateRoleBadge(); });
  selfReplyEl?.addEventListener('change', ()=>{ persist({ selfPanelReply: !!selfReplyEl.checked }); });
      maxTokEl?.addEventListener('input', ()=>{ const v=Math.max(256, Math.min(30000, Number(maxTokEl.value)||1000)); if(maxTokVal) maxTokVal.textContent=String(v); persist({ maxTokens: v }); });
      typeSpdEl?.addEventListener('input', ()=>{ const v = Math.max(0, Math.min(100, Number(typeSpdEl.value)||10)); if(typeSpdVal) typeSpdVal.textContent = (v>=66?'Snabb':v<=33?'Långsam':'Medel'); persist({ typingSpeed: v }); });
      renderEl?.addEventListener('change', ()=>persist({ renderMode: renderEl.value }));
  // removed web listeners
      apiKeyEl?.addEventListener('input', ()=>{ persist({ apiKey: apiKeyEl.value||'' }); updateKeyBadge(); });
    }catch{}
  // Render historical messages if any
    try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      // Determine render mode (saved or current control)
      let renderMode = 'raw';
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
        const histTotal = (histAtt?.length||0) + (histCits?.length||0);
        const makeLinkedHtml = (src)=>{ try{ return String(src).replace(/\[(\d+)\]/g, (mm, g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]<\/a>`); }catch{ return String(src||''); } };
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
              // De-duplicate by stable url or by name+chars to avoid duplicates
              const items0 = Array.isArray(histAtt)? histAtt : [];
              const seen = new Set();
              const items = [];
              for (const it of items0){ const key = (it && typeof it.url==='string' && it.url) || (`${it?.name||''}|${Number(it?.chars||0)}`); if (seen.has(key)) continue; seen.add(key); items.push(it); }
              if (items.length){
                const foot = document.createElement('div'); foot.className='subtle'; foot.style.marginTop='6px'; foot.style.fontSize='0.85em'; foot.style.opacity='0.85';
                const lab = document.createElement('div'); lab.textContent='Material:'; foot.appendChild(lab);
                const ol = document.createElement('ol'); ol.style.margin='6px 0 0 16px'; ol.style.padding='0';
                const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
                items.forEach((it,i)=>{ const li=document.createElement('li'); const a=document.createElement('a');
                  try{
                    a.href = '#'; a.addEventListener('click', (ev)=>{ ev.preventDefault(); openAttachment(it, { hintText: panel._lastAssistantText || (m.text||'') }); }); a.target='_blank'; a.rel='noopener';
                  }catch{ a.href='#'; }
                  a.textContent = (it.name||`Bilaga ${i+1}`); li.appendChild(a);
                  try{ const u = document.createElement('code'); u.style.marginLeft='6px'; u.style.opacity='0.85'; u.textContent = (it.url || ''); li.appendChild(u); }catch{}
                  ol.appendChild(li); });
                foot.appendChild(ol); b.appendChild(foot);
              }
            }catch{}
            // Web citations if present in meta
            try{
              const cits = Array.isArray(m?.meta?.citations) ? m.meta.citations : [];
              if (cits.length){ const foot=document.createElement('div'); foot.className='subtle'; foot.style.marginTop='6px'; foot.style.fontSize='0.85em'; foot.style.opacity='0.85'; const lab=document.createElement('div'); lab.textContent='Källor:'; foot.appendChild(lab); const ol=document.createElement('ol'); ol.style.margin='6px 0 0 16px'; ol.style.padding='0'; cits.forEach((c,i)=>{ const li=document.createElement('li'); const a=document.createElement('a'); a.href=String(c.url||'#'); a.target='_blank'; a.rel='noopener'; a.textContent = (c.title ? `${c.title}` : (c.url||`Källa ${i+1}`)); li.appendChild(a); ol.appendChild(li); }); foot.appendChild(ol); b.appendChild(foot); }
            }catch{}
          }
        }catch{}
        // Inline references bar if no [n] present but we have notes
        try{
          if (m.who !== 'user' && histTotal){
            const hasRefs = /\[(\d+)\]/.test(textEl.innerHTML || textEl.textContent || '');
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
            const a = ev.target && ev.target.closest && ev.target.closest('a.ref'); if (!a) return; const n=a.getAttribute('data-ref'); if(!n) return; const idx = Math.max(1, Number(n)||1);
            try{
        const attItems = histAtt; const citItems = histCits; const total = (attItems?.length||0) + (citItems?.length||0);
              if (idx <= total){
                if (idx <= (attItems?.length||0)){
          const it = attItems[idx-1];
          openAttachment(it, { hintText: panel._lastAssistantText || (m.text||'') });
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
    // Determine if this panel should render markdown for assistant messages (coworker) or for user panel mode
    let renderMode = 'raw';
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
    const totalNotes = (Array.isArray(attItems)?attItems.length:0) + (Array.isArray(citItems)?citItems.length:0);
  const makeLinkedHtml = (src)=>{
      try{
    // Replace [n] with anchors that scroll to footnote within this panel instead of changing window hash
    return String(src).replace(/\[(\d+)\]/g, (m,g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]<\/a>`);
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
      // For User panel: honor its own render mode (stored as userRenderMode)
      let userMode = 'raw';
      try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if (raw){ const s = JSON.parse(raw)||{}; if (s.userRenderMode) userMode = String(s.userRenderMode); } }catch{}
      if (userMode === 'md' && window.mdToHtml){
        try{ textEl.innerHTML = sanitizeHtml(window.mdToHtml(content)); }catch{ textEl.textContent = content; }
      } else {
        textEl.textContent = content;
      }
    }
  b.appendChild(textEl);
  // remember last assistant raw text for hinting page search
  if (who !== 'user'){ try{ panel._lastAssistantText = String(text||''); }catch{} }
    // Delegate click on [n] refs: open corresponding attachment/citation with stable HTTP (no blob), and also scroll to local footnote
    try{
      b.addEventListener('click', async (ev)=>{
        const a = ev.target && ev.target.closest && ev.target.closest('a.ref');
        if (!a) return;
        const n = a.getAttribute('data-ref');
        if (!n) return;
        const idx = Math.max(1, Number(n)||1);
        // Try open: attachments first, then citations, always prefer stable HTTP via backend
        try{
          const attItems = (function(){ try{ const raw = localStorage.getItem(`nodeAttachments:${ownerId}`); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } })();
          const citItems = Array.isArray(meta?.citations) ? meta.citations : [];
          const total = (attItems?.length||0) + (citItems?.length||0);
          // helpers
          const detectApiBase = ()=>{ try{ if (window.API_BASE && typeof window.API_BASE==='string') return window.API_BASE; }catch{} try{ if (location.protocol==='file:') return 'http://localhost:8000'; if (location.port && location.port !== '8000') return 'http://localhost:8000'; }catch{} return ''; };
          const migrateToHttp = async (x)=>{ try{ if (x && !x.url && (x.origUrl || x.blobUrl)){ const src = x.origUrl || x.blobUrl; if(!src) return false; const apiBase = detectApiBase(); if(!apiBase) return false; const blob = await fetch(src).then(r=>r.blob()); const name=String(x.name||'fil'); const type=String(x.mime||blob.type||'application/octet-stream'); const file=new File([blob], name, { type }); const fd=new FormData(); fd.append('files', file); const res=await fetch(apiBase + '/upload', { method:'POST', body: fd }); if(!res.ok) return false; const data=await res.json(); const first = data && Array.isArray(data.items) ? data.items[0] : null; if(first && first.url){ x.url=String(first.url); if(Array.isArray(first.pages)) x.pages=first.pages; if(typeof first.chars==='number') x.chars=first.chars; if(typeof first.truncated==='boolean') x.truncated=first.truncated; try{ const k=`nodeAttachments:${ownerId}`; const raw=localStorage.getItem(k); const cur=raw?JSON.parse(raw):[]; const idx = cur.findIndex((y)=>y && (y.name===x.name) && (y.chars===x.chars)); if(idx>=0){ cur[idx]=x; localStorage.setItem(k, JSON.stringify(cur)); } }catch{} try{ if (x.origUrl) URL.revokeObjectURL(x.origUrl); }catch{} return true; } } }catch{} return false; };
          const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
          const pickSnippetAndPage = (att, hintText)=>{ try{ if (!isPdf(att) || !Array.isArray(att.pages) || !att.pages.length) return { page:null, q:'' }; const q=String(hintText||'').trim().slice(0,120); if(!q) return { page:null, q:'' }; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null, q:needle }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null, q:tokens.slice(0,5).join(' ') }; break; } } if (best) break; } return best || { page:null, q: tokens.join(' ') }; }catch{ return { page:null, q:'' }; } };
          const buildPdfUrl = (base, pick)=>{ try{ if(!base) return base; const hasHash = /#/.test(base); const parts=[]; if(pick && pick.page) parts.push('page='+encodeURIComponent(pick.page)); if(pick && pick.q){ const q=String(pick.q||'').split(/\s+/).filter(Boolean).slice(0,6).join(' '); if(q) parts.push('search='+encodeURIComponent(q)); } if(!parts.length) return base; return base + (hasHash ? (base.endsWith('#') ? '' : '&') : '#') + parts.join('&'); }catch{ return base; } };
          const openIt = async (it, hint)=>{ let href = it.url || it.origUrl || it.blobUrl || ''; if (!it.url && href){ try{ if (/^blob:/i.test(String(href))) await migrateToHttp(it); }catch{} href = it.url || href; } if (!it.url){ return; } let finalHref = it.url; if (isPdf(it)){ try{ const pick = pickSnippetAndPage(it, hint); finalHref = buildPdfUrl(it.url, pick); }catch{} } const tmp = document.createElement('a'); tmp.href = finalHref; tmp.target = '_blank'; tmp.rel = 'noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); };
          if (idx <= total){
            if (idx <= (attItems?.length||0)){
              const it = attItems[idx-1];
              const hint = panel._lastAssistantText || content || '';
              await openIt(it, hint);
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
        const hasRefs = /\[(\d+)\]/.test(textEl.innerHTML || textEl.textContent || '');
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
        // attachments first – open via stable HTTP and page hinting
        (attItems||[]).forEach((it,i)=>{
          const idx = i+1; const li = document.createElement('li'); li.id = `fn-${idx}`;
          const a = document.createElement('a'); a.href = '#'; a.target = '_blank'; a.rel = 'noopener';
          try{
            a.addEventListener('click', async (ev2)=>{ ev2.preventDefault();
              // local helpers (mirror above)
              const detectApiBase = ()=>{ try{ if (window.API_BASE && typeof window.API_BASE==='string') return window.API_BASE; }catch{} try{ if (location.protocol==='file:') return 'http://localhost:8000'; if (location.port && location.port !== '8000') return 'http://localhost:8000'; }catch{} return ''; };
              const migrateToHttp = async (x)=>{ try{ if (x && !x.url && (x.origUrl || x.blobUrl)){ const src = x.origUrl || x.blobUrl; if(!src) return false; const apiBase = detectApiBase(); if(!apiBase) return false; const blob = await fetch(src).then(r=>r.blob()); const name=String(x.name||'fil'); const type=String(x.mime||blob.type||'application/octet-stream'); const file=new File([blob], name, { type }); const fd=new FormData(); fd.append('files', file); const res=await fetch(apiBase + '/upload', { method:'POST', body: fd }); if(!res.ok) return false; const data=await res.json(); const first = data && Array.isArray(data.items) ? data.items[0] : null; if(first && first.url){ x.url=String(first.url); if(Array.isArray(first.pages)) x.pages=first.pages; if(typeof first.chars==='number') x.chars=first.chars; if(typeof first.truncated==='boolean') x.truncated=first.truncated; try{ const k=`nodeAttachments:${ownerId}`; const raw=localStorage.getItem(k); const cur=raw?JSON.parse(raw):[]; const j = cur.findIndex((y)=>y && (y.name===x.name) && (y.chars===x.chars)); if(j>=0){ cur[j]=x; localStorage.setItem(k, JSON.stringify(cur)); } }catch{} try{ if (x.origUrl) URL.revokeObjectURL(x.origUrl); }catch{} return true; } } }catch{} return false; };
              const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
              const buildPdfUrl = (base, pick)=>{ try{ if(!base) return base; const hasHash = /#/.test(base); const parts=[]; if(pick && pick.page) parts.push('page='+encodeURIComponent(pick.page)); if(pick && pick.q){ const q=String(pick.q||'').split(/\s+/).filter(Boolean).slice(0,6).join(' '); if(q) parts.push('search='+encodeURIComponent(q)); } if(!parts.length) return base; return base + (hasHash ? (base.endsWith('#') ? '' : '&') : '#') + parts.join('&'); }catch{ return base; } };
              const pickSnippetAndPage = (att, hintText)=>{ try{ if (!isPdf(att) || !Array.isArray(att.pages) || !att.pages.length) return { page:null, q:'' }; const q=String(hintText||'').trim().slice(0,120); if(!q) return { page:null, q:'' }; const tokens=q.split(/\s+/).filter(Boolean).slice(0,8); const needle=tokens.slice(0,3).join(' '); let best=null; for (const p of att.pages){ const txt=String(p.text||''); if(!txt) continue; if (needle && txt.toLowerCase().includes(needle.toLowerCase())) { best={ page:Number(p.page)||null, q:needle }; break; } for (const t of tokens){ if (t.length>=4 && txt.toLowerCase().includes(t.toLowerCase())) { best={ page:Number(p.page)||null, q:tokens.slice(0,5).join(' ') }; break; } } if (best) break; } return best || { page:null, q: tokens.join(' ') }; }catch{ return { page:null, q:'' }; } };
              if (!it.url){ try{ if (it.origUrl || it.blobUrl) await migrateToHttp(it); }catch{} }
              if (!it.url) return;
              let href = it.url; if (isPdf(it)){ const hint = panel._lastAssistantText || content || ''; const pick = pickSnippetAndPage(it, hint); href = buildPdfUrl(it.url, pick); }
              const tmp = document.createElement('a'); tmp.href = href; tmp.target = '_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove();
            });
          }catch{}
          a.textContent = (it.name||`Bilaga ${idx}`);
          li.appendChild(a);
          // show URL as clickable code and small meta
          try{ const codeWrap = document.createElement('span'); codeWrap.style.marginLeft='6px'; const u = document.createElement('a'); u.target = '_blank'; u.rel='noopener'; const httpUrl = (it.url || ''); u.href = httpUrl || '#'; const code = document.createElement('code'); code.style.opacity='0.85'; code.textContent = httpUrl; u.appendChild(code); codeWrap.appendChild(u); li.appendChild(codeWrap); }catch{}
          if (it.chars){ const small = document.createElement('span'); small.className='subtle'; small.style.marginLeft='6px'; small.textContent = `(${it.chars} tecken${it.truncated?', trunkerat':''})`; li.appendChild(small); }
          ol.appendChild(li);
        });
        // citations continue numbering
        (citItems||[]).forEach((c, i)=>{
          const idx = (attItems?.length||0) + i + 1; const li = document.createElement('li'); li.id = `fn-${idx}`;
          const a = document.createElement('a'); const href = String(c.url||'#'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = (c.title ? `${c.title}` : (c.url||`Källa ${idx}`)); li.appendChild(a);
          try{ const codeWrap = document.createElement('span'); codeWrap.style.marginLeft='6px'; const u = document.createElement('a'); u.href = href; u.target='_blank'; u.rel='noopener'; const code = document.createElement('code'); code.style.opacity='0.85'; code.textContent = href; u.appendChild(code); codeWrap.appendChild(u); li.appendChild(codeWrap); }catch{}
          ol.appendChild(li);
        });
        foot.appendChild(lab);
        foot.appendChild(ol);
        b.appendChild(foot);
      }
    }catch{}
    const metaEl=document.createElement('div'); metaEl.className='subtle'; metaEl.style.marginTop='6px'; metaEl.style.opacity='0.8'; metaEl.style.textAlign = (who==='user' ? 'right' : 'left'); const ts = meta?.ts || Date.now(); metaEl.textContent = formatTime(ts); b.appendChild(metaEl); group.appendChild(author); group.appendChild(b); row.appendChild(group); list.appendChild(row); list.scrollTop=list.scrollHeight;
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
      const modeNow = (sec?.dataset.mode) || settings.mode || settings.renderMode || 'raw';
  const readSecMode = ()=> ((sec?.dataset.mode) || settings.mode || settings.renderMode || 'raw');
      // If in exercises mode and a pending feedback index exists, store incoming text as feedback
      if (modeNow === 'exercises'){
        try{
          const id = sec?.dataset.sectionId || '';
          const idxStr = sec?.dataset.pendingFeedback;
          if (idxStr !== undefined){
            const idx = Math.max(0, Number(idxStr)||0);
            const raw = localStorage.getItem(`sectionExercises:${id}`) || '[]';
            const arr = JSON.parse(raw)||[];
            if (arr[idx]){ arr[idx].fb = (arr[idx].fb ? (arr[idx].fb + '\n\n') : '') + String(text||''); }
            localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr));
            // clear flag and update UI if focus view is present
            delete sec.dataset.pendingFeedback;
            const focus = sec.querySelector('.ex-fb'); if (focus && Number(localStorage.getItem(`sectionExercisesCursor:${id}`)||'0') === idx){ focus.textContent = arr[idx].fb || ''; }
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
          const items = parse(String(plain||''));
          if (!items.length) return;
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
        note.innerHTML = window.mdToHtml(next);
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
          exBar.appendChild(btnAdd); exBar.appendChild(btnGradeAll); exBar.appendChild(btnDeleteAll);
          // Insert before the IO point to keep layout
          const io = head.querySelector('.section-io');
          if (io && io.parentElement === head){ head.insertBefore(exBar, io); } else { head.appendChild(exBar); }
          // Wire actions
          const grid = sec.querySelector('.body .grid') || sec.querySelector('.body');
          // Storage helpers for focus UI
          const getExercises = ()=>{ try{ const raw = localStorage.getItem(`sectionExercises:${id}`); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
          const setExercises = (arr)=>{ try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr||[])); }catch{} };
          // pending feedback target index (store transiently on section)
          const setPendingFeedback = (idx)=>{ try{ sec.dataset.pendingFeedback = String(idx); }catch{} };
          const clearPendingFeedback = ()=>{ try{ delete sec.dataset.pendingFeedback; }catch{} };
          const getPendingFeedback = ()=>{ const v = sec.dataset.pendingFeedback; return (v==null||v==='') ? null : Math.max(0, Number(v)||0); };
          const getCursor = ()=>{ try{ const n = Number(localStorage.getItem(`sectionExercisesCursor:${id}`)); const len = getExercises().length; return isNaN(n)?0: Math.max(0, Math.min(n, Math.max(0,len-1))); }catch{ return 0; } };
          const setCursor = (i)=>{ try{ localStorage.setItem(`sectionExercisesCursor:${id}`, String(i)); }catch{} };
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
              const updateInfo = ()=>{ const len = getExercises().length; info.textContent = len? `Fråga ${idx+1} / ${len}` : 'Inga frågor'; };
              nav.appendChild(prev); nav.appendChild(info); nav.appendChild(next);
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
              const fb = document.createElement('div'); fb.className='ex-fb'; fb.setAttribute('contenteditable','true'); fb.setAttribute('spellcheck','false'); { const cur = getExercises(); fb.textContent = cur[idx]?.fb || ''; }
              const actions = document.createElement('div'); actions.className='ex-actions';
              const gradeOne = document.createElement('button'); gradeOne.type='button'; gradeOne.className='btn'; gradeOne.textContent='Rätta denna';
              const del = document.createElement('button'); del.type='button'; del.className='btn btn-ghost'; del.textContent='Ta bort';
              actions.appendChild(gradeOne); actions.appendChild(del);
              right.appendChild(a); right.appendChild(actions); right.appendChild(fb);
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
                fb.textContent = cur[idx]?.fb || '';
                updateInfo();
              };
              prev.addEventListener('click', ()=>go(-1)); next.addEventListener('click', ()=>go(1));
              q.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].q = String(q.textContent||'').trim(); setExercises(cur); } updateInfo(); });
              a.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].a = String(a.value||'').trim(); setExercises(cur); } });
              const saveFb = ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].fb = String(fb.textContent||'').trim(); setExercises(cur); } };
              fb.addEventListener('input', saveFb);
              fb.addEventListener('blur', saveFb);
              // delete current
              del.addEventListener('click', ()=>{ const cur = getExercises(); if (!cur.length) return; cur.splice(idx,1); setExercises(cur); if (idx >= cur.length) idx = Math.max(0, cur.length-1); setCursor(idx); renderExercisesFocus(); });
              // grade current
              gradeOne.addEventListener('click', (ev)=>{
                const btn = ev.currentTarget; const now = Date.now(); if (btn && btn._lastClick && (now - btn._lastClick) < 400) return; if (btn) btn._lastClick = now;
                const it = getExercises()[idx]; if (!it) return;
                const n = idx+1; const payload = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                try{ const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion'; if (window.routeMessageFrom) window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() }); }catch{}
                // mark this index to receive incoming feedback
                setPendingFeedback(idx);
              });
            }catch{}
          };
          sec.addEventListener('exercises-data-changed', ()=>renderExercisesFocus());
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
                // Use the section's id to route out via cables
                if (window.routeMessageFrom) window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() });
              }catch{}
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
          // Initial load handled later by the mode-aware renderer below
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
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.innerHTML = window.mdToHtml(src);
                  note.dataset.rendered = '1';
                } else if (mode === 'html'){
      sec.removeAttribute('data-mode');
      try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
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
            note.innerHTML = window.mdToHtml ? window.mdToHtml(src) : src;
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
          const mode = s ? (JSON.parse(s).renderMode || 'raw') : 'raw';
          editBtn.style.display = (mode === 'md') ? '' : 'none';
          // Initial render
          if (mode === 'exercises'){
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; } }catch{}
            sec.setAttribute('data-mode','exercises');
            try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
          } else if (mode === 'md' && window.mdToHtml){
            renderMarkdown();
          } else if (mode === 'html'){
            const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
            localStorage.setItem(`sectionRaw:${id}`, src);
            note.innerHTML = sanitizeHtml(src);
            note.dataset.rendered = '1';
          }
        }
      });
    }catch{}
  }
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
        const items = parseQuestions(text);
        if (!items.length) return;
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
