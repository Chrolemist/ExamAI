// Internet Node: panel UI, settings, and backend web-enabled replies (classic)
// Structured separately to mirror CoWorker behavior but specialized for web tools.
(function(){
  function formatTime(ts){ try{ return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }catch{ return ''; } }
  function sanitizeHtml(html){
    try{
      let s = String(html||'');
      s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
      s = s.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
      s = s.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
      return s;
    }catch{ return String(html||''); }
  }
  // Minimal resize handles and wiring (copied subset to avoid coupling to panels.js internals)
  function addResizeHandles(panel){ const mk=(cls)=>{ const h=document.createElement('div'); h.className='flyout-resize '+cls; h.dataset.resize=cls.replace(/^.*\b([a-z]{1,2})$/, '$1'); return h; }; panel.appendChild(mk('br')); panel.appendChild(mk('t')); panel.appendChild(mk('b')); panel.appendChild(mk('l')); panel.appendChild(mk('r')); }
  function wirePanelResize(panel){ const minW=280, minH=200; let startX=0,startY=0,startW=0,startH=0,startL=0,startT=0,mode=''; const onMove=(e)=>{ const p=window.pointFromEvent(e); const dx=p.x-startX, dy=p.y-startY; let w=startW,h=startH,l=startL,t=startT; if(mode.includes('r')) w=Math.max(minW, startW+dx); if(mode.includes('l')){ w=Math.max(minW, startW-dx); l=startL+Math.min(dx, startW-minW);} if(mode.includes('b')) h=Math.max(minH, startH+dy); if(mode.includes('t')){ h=Math.max(minH, startH-dy); t=startT+Math.min(dy, startH-minH);} panel.style.width=w+'px'; panel.style.height=h+'px'; panel.style.left=l+'px'; panel.style.top=t+'px'; panel.querySelectorAll('.conn-point').forEach(cp=>window.positionPanelConn&&window.positionPanelConn(cp,panel)); window.updateConnectionsFor && window.updateConnectionsFor(panel); }; const onUp=()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; panel.querySelectorAll('.flyout-resize').forEach(h=>{ h.addEventListener('pointerdown',(e)=>{ e.preventDefault(); const r=panel.getBoundingClientRect(); startX=e.clientX; startY=e.clientY; startW=r.width; startH=r.height; startL=r.left; startT=r.top; mode=h.dataset.resize||''; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }); }); }

  function positionPanelNear(panel, hostEl){ panel.style.left=Math.min(window.innerWidth-420, hostEl.getBoundingClientRect().right + 12)+'px'; panel.style.top=Math.max(12, hostEl.getBoundingClientRect().top - 20)+'px'; }
  function positionPanelConn(cp, panel){ const rect = panel.getBoundingClientRect(); const pos = { t:[rect.width/2, 0], b:[rect.width/2, rect.height], l:[0, rect.height/2], r:[rect.width, rect.height/2] }[cp.dataset.side]; cp.style.left = pos[0] + 'px'; cp.style.top = pos[1] + 'px'; }

  function openInternetPanel(hostEl){
    const panel=document.createElement('section'); panel.className='panel-flyout show internet-node-panel'; panel.dataset.sectionId='i'+Math.random().toString(36).slice(2,7); positionPanelNear(panel, hostEl); panel.style.width='440px'; panel.style.height='360px'; panel.dataset.ownerId=hostEl.dataset.id||'';
    const headerName = (hostEl.dataset.displayName||'Internet').trim()||'Internet';
    panel.innerHTML = `
    <header class="drawer-head" data-role="dragHandle">
      <div class="brand" title="Internet">
        <svg class="globe-grid" viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
          <defs>
            <linearGradient id="gradGlobeHdr" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#7c5cff"/>
              <stop offset="100%" stop-color="#00d4ff"/>
            </linearGradient>
            <filter id="glowGlobeHdr" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <g fill="none" stroke="url(#gradGlobeHdr)" stroke-linecap="round" stroke-linejoin="round" filter="url(#glowGlobeHdr)">
            <circle cx="12" cy="12" r="9" stroke-width="1.5"/>
            <ellipse cx="12" cy="12" rx="9" ry="6.5" stroke-width="1.0" opacity="0.85"/>
            <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke-width="0.9" opacity="0.7"/>
            <ellipse cx="12" cy="12" rx="6.5" ry="9" stroke-width="1.0" opacity="0.85"/>
            <ellipse cx="12" cy="12" rx="3.5" ry="9" stroke-width="0.9" opacity="0.7"/>
            <line x1="3" y1="12" x2="21" y2="12" stroke-width="1.0" opacity="0.9"/>
          </g>
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
          <option value="gpt-5">gpt-5</option>
          <option value="gpt-5-mini" selected>gpt-5-mini</option>
          <option value="gpt-5-nano">gpt-5-nano</option>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="3o">3o</option>
        </select>
      </label>
      <label>Topic (fokus)
        <input type="text" placeholder="Ex: Nyheter om AI" data-role="topic" />
      </label>
      <label>Roll (instruktion)
        <input type="text" placeholder="T.ex. webbresearcher som alltid citerar källor" data-role="role" />
      </label>
      <label class="inline">
        <input type="checkbox" data-role="useRole" /> Inkludera roll i prompt
      </label>
      <label>Max tokens
        <input type="range" min="1000" max="30000" step="64" value="2000" data-role="maxTokens" />
        <div class="subtle"><span data-role="maxTokensValue">2000</span></div>
      </label>
      <label>Visningsläge
        <select data-role="renderMode">
          <option value="raw">Rå text</option>
          <option value="md" selected>Snyggt (Markdown)</option>
        </select>
      </label>
    <label>Sökmotor/metod
        <select data-role="webSearchMode">
          <option value="auto" selected>Auto</option>
          <option value="openai">OpenAI web_search</option>
      <option value="serper">Serper (Google)</option>
          <option value="playwright">Playwright (JS-renderad)</option>
          <option value="http">Snabb HTML</option>
        </select>
      </label>
      <fieldset class="subsec">
        <legend>Webbsökning</legend>
        <label class="inline">
          <input type="checkbox" data-role="webUseOpenAITool" checked /> Använd OpenAI web_search
        </label>
        <label class="inline">
          <input type="checkbox" data-role="webForceTool" /> Tvinga web_search för detta svar
        </label>
        <label>Kontextstorlek
          <select data-role="webSearchContextSize">
            <option value="low">Låg</option>
            <option value="medium" selected>Medium</option>
            <option value="high">Hög</option>
          </select>
        </label>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Följ länkar (djup)
            <input type="number" min="0" max="10" step="1" value="0" data-role="webLinkDepth" />
          </label>
          <label>Max sidor
            <input type="number" min="1" max="20" step="1" value="6" data-role="webMaxPages" />
          </label>
        </div>
        <div class="subtle" style="margin:6px 0 4px">Användarlokalisering (för bättre träffar)</div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Land (ISO)
            <input type="text" maxlength="2" placeholder="SE" data-role="webLocCountry" />
          </label>
          <label>Region
            <input type="text" placeholder="Stockholms län" data-role="webLocRegion" />
          </label>
          <label>Stad
            <input type="text" placeholder="Stockholm" data-role="webLocCity" />
          </label>
          <label>Tidszon
            <input type="text" placeholder="Europe/Stockholm" data-role="webLocTimezone" />
          </label>
        </div>
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
      <label>API-nyckel (denna nod)
        <input type="password" placeholder="Valfri – annars används global" data-role="apiKey" />
      </label>
    </div>
    <div class="messages" data-role="messages"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Sök eller be om sammanfattning... "></textarea>
      <button class="send-btn" type="button">Skicka</button>
    </div>`;
    addResizeHandles(panel); document.body.appendChild(panel);
    window.makePanelDraggable && window.makePanelDraggable(panel, panel.querySelector('.drawer-head'));
    // Close/clear
    panel.querySelector('[data-close]')?.addEventListener('click', ()=>panel.remove());
    // delete removes the underlying node and connections
    try{
      const delBtn = panel.querySelector('[data-action="delete"]');
      delBtn && delBtn.addEventListener('click', ()=>{
        try{
          const ownerId = panel.dataset.ownerId||'';
          const host = ownerId ? document.querySelector(`.fab[data-id="${ownerId}"]`) : null;
          if (host) host.remove();
          (window.state?.connections||[]).slice().forEach(c=>{
            if (c.fromId===ownerId || c.toId===ownerId){ try{ c.pathEl?.remove(); }catch{} try{ c.hitEl?.remove(); }catch{} }
          });
          if (window.state && Array.isArray(window.state.connections)) window.state.connections = window.state.connections.filter(c=> c.fromId!==ownerId && c.toId!==ownerId);
          if (window.graph && window.graph.nodes) window.graph.nodes.delete(ownerId);
        }catch{}
        panel.remove();
      });
    }catch{}
    panel.querySelector('[data-action="clear"]')?.addEventListener('click', ()=>{ const m=panel.querySelector('.messages'); if(m) m.innerHTML=''; });
    // Settings toggle
    try{
      const settingsBtn = panel.querySelector('[data-action="settings"]');
      const settingsPane = panel.querySelector('[data-role="settings"]');
      settingsBtn && settingsPane && settingsBtn.addEventListener('click', ()=> settingsPane.classList.toggle('collapsed'));
    }catch{}

    // Settings persistence and badges
    try{
      const ownerId = panel.dataset.ownerId||'';
      const lsKey = (id)=>`nodeSettings:${id}`;
      const detectApiBase = ()=>{
        try{
          if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE;
        }catch{}
        try{
          if (location.protocol === 'file:') return 'http://localhost:8000';
          // If serving frontend on a different port than backend (common: 5500 vs 8000), default to backend 8000
          if (location.port && location.port !== '8000') return 'http://localhost:8000';
        }catch{}
        return '';
      };
      const apiBase = detectApiBase();
      let hasGlobalKey = false;
      try{ fetch(apiBase + '/key-status').then(r=>r.json()).then(d=>{ hasGlobalKey = !!(d&&d.hasKey); updateKeyBadge(); }).catch(()=>{ hasGlobalKey=false; updateKeyBadge(); }); }catch{}
      const readSaved = ()=>{ let s={}; try{ if(window.graph && ownerId) s = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{} try{ const raw = localStorage.getItem(lsKey(ownerId)); if(raw) s = Object.assign({}, s, JSON.parse(raw)||{}); }catch{} return s; };
      const persist = (partial)=>{ try{ if(window.graph && ownerId) window.graph.setNodeSettings(ownerId, partial||{}); }catch{} try{ const cur = readSaved(); const next = Object.assign({}, cur, partial||{}); localStorage.setItem(lsKey(ownerId), JSON.stringify(next)); }catch{} };
    const by = (sel)=>panel.querySelector(sel);
  const modelEl = by('[data-role="model"]'); const topicEl = by('[data-role="topic"]'); const roleEl = by('[data-role="role"]'); const useRoleEl = by('[data-role="useRole"]');
  const maxTokEl = by('[data-role="maxTokens"]'); const maxTokVal = by('[data-role="maxTokensValue"]');
  const renderEl = by('[data-role="renderMode"]');
  const webModeEl = by('[data-role="webSearchMode"]');
  const webUseToolEl = by('[data-role="webUseOpenAITool"]'); const webForceEl = by('[data-role="webForceTool"]'); const webCtxSizeEl = by('[data-role="webSearchContextSize"]');
  const webLocCountryEl = by('[data-role="webLocCountry"]'); const webLocRegionEl = by('[data-role="webLocRegion"]'); const webLocCityEl = by('[data-role="webLocCity"]'); const webLocTzEl = by('[data-role="webLocTimezone"]');
  const webMaxEl = by('[data-role="webMaxResults"]'); const webPerEl = by('[data-role="webPerPageChars"]'); const webPerVal = by('[data-role="webPerPageCharsValue"]'); const webTotEl = by('[data-role="webTotalChars"]'); const webTotVal = by('[data-role="webTotalCharsValue"]');
  const webLinkDepthEl = by('[data-role="webLinkDepth"]'); const webMaxPagesEl = by('[data-role="webMaxPages"]');
      const apiKeyEl = by('[data-role="apiKey"]'); const keyBadge = by('[data-role="keyStatus"]'); const roleBadge = by('[data-role="roleBadge"]');
      const headerNameEl = panel.querySelector('.drawer-head .meta .name');
  const updateKeyBadge = ()=>{ try{ const hasLocal = !!(apiKeyEl && apiKeyEl.value); if(!keyBadge) return; if(hasLocal){ keyBadge.textContent='Lokal nyckel'; keyBadge.classList.add('badge-success'); keyBadge.classList.remove('badge-error'); } else if (hasGlobalKey){ keyBadge.textContent='Global nyckel'; keyBadge.classList.add('badge-success'); keyBadge.classList.remove('badge-error'); } else { keyBadge.textContent='Ingen nyckel'; keyBadge.classList.remove('badge-success'); keyBadge.classList.add('badge-error'); } }catch{} };
      const updateRoleBadge = ()=>{ try{ if(!roleBadge) return; const include = !!(useRoleEl && useRoleEl.checked); const roleTxt = (roleEl && roleEl.value ? String(roleEl.value).trim() : ''); const topicTxt = (topicEl && topicEl.value ? String(topicEl.value).trim() : ''); const active = include && (roleTxt || topicTxt); roleBadge.style.display = active ? '' : 'none'; roleBadge.textContent = 'Roll'; roleBadge.classList.toggle('badge-success', active); let tip = 'Roll'; if (roleTxt) tip += `: ${roleTxt}`; if (topicTxt) tip += (roleTxt ? '\n' : ': ') + `Topic: ${topicTxt}`; roleBadge.title = tip; }catch{} };
      const saved = readSaved();
      if (saved.model && modelEl) modelEl.value = saved.model;
      if (saved.topic && topicEl) topicEl.value = saved.topic;
      if (saved.role && roleEl) roleEl.value = saved.role;
      if (typeof saved.useRole==='boolean' && useRoleEl) useRoleEl.checked = !!saved.useRole;
  if (saved.maxTokens && maxTokEl) { maxTokEl.value=String(saved.maxTokens); if(maxTokVal) maxTokVal.textContent=String(saved.maxTokens); }
  if (saved.renderMode && renderEl) renderEl.value = saved.renderMode;
  if (saved.webSearchMode && webModeEl) webModeEl.value = String(saved.webSearchMode);
  if (typeof saved.webUseOpenAITool === 'boolean' && webUseToolEl) webUseToolEl.checked = !!saved.webUseOpenAITool;
  if (typeof saved.webForceTool === 'boolean' && webForceEl) webForceEl.checked = !!saved.webForceTool;
  if (saved.webSearchContextSize && webCtxSizeEl) webCtxSizeEl.value = String(saved.webSearchContextSize);
  if (saved.webLocCountry && webLocCountryEl) webLocCountryEl.value = String(saved.webLocCountry);
  if (saved.webLocRegion && webLocRegionEl) webLocRegionEl.value = String(saved.webLocRegion);
  if (saved.webLocCity && webLocCityEl) webLocCityEl.value = String(saved.webLocCity);
  if (saved.webLocTimezone && webLocTzEl) webLocTzEl.value = String(saved.webLocTimezone);
  if (saved.webMaxResults && webMaxEl) webMaxEl.value = String(saved.webMaxResults);
      if (saved.webPerPageChars && webPerEl) { webPerEl.value = String(saved.webPerPageChars); if(webPerVal) webPerVal.textContent = String(saved.webPerPageChars); }
      if (saved.webTotalChars && webTotEl) { webTotEl.value = String(saved.webTotalChars); if(webTotVal) webTotVal.textContent = String(saved.webTotalChars); }
  if (typeof saved.webLinkDepth === 'number' && webLinkDepthEl) webLinkDepthEl.value = String(saved.webLinkDepth);
  if (typeof saved.webMaxPages === 'number' && webMaxPagesEl) webMaxPagesEl.value = String(saved.webMaxPages);
      if (saved.apiKey && apiKeyEl) apiKeyEl.value = saved.apiKey;
      updateKeyBadge(); updateRoleBadge();
      modelEl?.addEventListener('change', ()=>persist({ model: modelEl.value }));
      topicEl?.addEventListener('input', ()=>{ persist({ topic: topicEl.value||'' }); updateRoleBadge(); });
      roleEl?.addEventListener('input', ()=>{ persist({ role: roleEl.value||'' }); updateRoleBadge(); });
      useRoleEl?.addEventListener('change', ()=>{ persist({ useRole: !!useRoleEl.checked }); updateRoleBadge(); });
  maxTokEl?.addEventListener('input', ()=>{ const v=Math.max(256, Math.min(30000, Number(maxTokEl.value)||2000)); if(maxTokVal) maxTokVal.textContent=String(v); persist({ maxTokens: v }); });
  renderEl?.addEventListener('change', ()=>persist({ renderMode: renderEl.value }));
  webUseToolEl?.addEventListener('change', ()=>{
    persist({ webUseOpenAITool: !!webUseToolEl.checked });
    // If user toggles OpenAI tool explicitly, keep mode aligned when on auto
    try{
      if (webModeEl && webModeEl.value === 'auto'){
        // stay on auto; checkbox controls preference within auto
      }
    }catch{}
  });
  webModeEl?.addEventListener('change', ()=>{
    const mode = webModeEl.value||'auto';
    persist({ webSearchMode: mode });
    // Light sync with OpenAI toggle for clarity
    try{
      if (webUseToolEl){
        if (mode === 'openai') webUseToolEl.checked = true;
        else if (mode !== 'auto') webUseToolEl.checked = false;
        persist({ webUseOpenAITool: !!webUseToolEl.checked });
      }
    }catch{}
  });
  webForceEl?.addEventListener('change', ()=>persist({ webForceTool: !!webForceEl.checked }));
  webCtxSizeEl?.addEventListener('change', ()=>persist({ webSearchContextSize: webCtxSizeEl.value||'medium' }));
  webLocCountryEl?.addEventListener('input', ()=>persist({ webLocCountry: (webLocCountryEl.value||'').toUpperCase() }));
  webLocRegionEl?.addEventListener('input', ()=>persist({ webLocRegion: webLocRegionEl.value||'' }));
  webLocCityEl?.addEventListener('input', ()=>persist({ webLocCity: webLocCityEl.value||'' }));
  webLocTzEl?.addEventListener('input', ()=>persist({ webLocTimezone: webLocTzEl.value||'' }));
  webMaxEl?.addEventListener('change', ()=>persist({ webMaxResults: Math.max(1, Number(webMaxEl.value)||3) }));
      webPerEl?.addEventListener('input', ()=>{ const v=Math.max(100, Math.min(12000, Number(webPerEl.value)||3000)); if(webPerVal) webPerVal.textContent=String(v); persist({ webPerPageChars: v }); });
      webTotEl?.addEventListener('input', ()=>{ const v=Math.max(1000, Math.min(24000, Number(webTotEl.value)||9000)); if(webTotVal) webTotVal.textContent=String(v); persist({ webTotalChars: v }); });
  webLinkDepthEl?.addEventListener('change', ()=>persist({ webLinkDepth: Math.max(0, Math.min(10, Number(webLinkDepthEl.value)||0)) }));
  webMaxPagesEl?.addEventListener('change', ()=>persist({ webMaxPages: Math.max(1, Math.min(20, Number(webMaxPagesEl.value)||6)) }));
      apiKeyEl?.addEventListener('input', ()=>{ persist({ apiKey: apiKeyEl.value||'' }); updateKeyBadge(); });
      // Keep header/fab name in sync (read-only label here)
      try{ const nm = headerName; const fabLab = hostEl.querySelector('.fab-label'); if(fabLab) fabLab.textContent = nm; hostEl.dataset.displayName = nm; }catch{}
    }catch{}

    // Render existing history
    try{
      const ownerId=panel.dataset.ownerId||''; const list=panel.querySelector('.messages');
      const entries=(window.graph&&ownerId)?(window.graph.getMessages(ownerId)||[]):[];
    // read current render mode (default md)
    let renderMode = 'md';
      try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if(raw){ const s=JSON.parse(raw)||{}; if(s.renderMode) renderMode = String(s.renderMode); } }catch{}
      for(const m of entries){
        const row=document.createElement('div'); row.className='message-row'+(m.who==='user'?' user':'');
        const group=document.createElement('div'); group.className='msg-group';
        const author=document.createElement('div'); author.className='author-label'; author.textContent = m.author || (m.who==='user'?'User':'Assistant');
        const b=document.createElement('div'); b.className='bubble '+(m.who==='user'?'user':'');
        const textEl=document.createElement('div'); textEl.className='msg-text';
        const content = m.text || '';
        if (m.who !== 'user' && renderMode === 'md' && window.mdToHtml){ textEl.innerHTML = sanitizeHtml(window.mdToHtml(String(content))); }
        else { textEl.textContent = String(content); }
        b.appendChild(textEl);
        const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (m.who==='user' ? 'right' : 'left'); meta.textContent = formatTime(m.ts); b.appendChild(meta);
        group.appendChild(author); group.appendChild(b); row.appendChild(group); list?.appendChild(row);
      }
      list && (list.scrollTop = list.scrollHeight);
    }catch{}

    // Composer (reuse global wireComposer if available)
    if (window.wireComposer) window.wireComposer(panel);
    wirePanelResize(panel);
  }

  // Backend call: request a web-enabled reply for Internet node and route outputs
  function requestInternetReply(ownerId, ctx){
    if(!ownerId || !ctx || !ctx.text) return;
    function setThinking(id, on){ try{ const host=document.querySelector(`.fab[data-id="${id}"]`); if(!host) return; const cur=Number(host.dataset.pending||0)||0; const next=on?(cur+1):Math.max(0,cur-1); host.dataset.pending=String(next); host.classList.toggle('busy', next>0); }catch{} }
    const detectApiBase = ()=>{
      try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{}
      try{
        if (location.protocol === 'file:') return 'http://localhost:8000';
        if (location.port && location.port !== '8000') return 'http://localhost:8000';
      }catch{}
      return '';
    };
    const apiBase = detectApiBase();
    // Read settings
    const readSaved = ()=>{ let s={}; try{ if(window.graph) s=Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{} try{ const raw=localStorage.getItem(`nodeSettings:${ownerId}`); if(raw) s=Object.assign({}, s, JSON.parse(raw)||{}); }catch{} return s; };
    const s = readSaved();
  const model = (s.model || 'gpt-5-mini');
    const maxTokens = Math.min(30000, Math.max(256, Number(s.maxTokens||2000)));
    const apiKey = (s.apiKey || '');
    let systemPrompt = '';
    const includeRole = !!s.useRole; const roleText=(s.role||'').trim(); const topicText=(s.topic||'').trim(); if(includeRole && (roleText||topicText)){ systemPrompt = roleText; if(topicText) systemPrompt += (systemPrompt?'\n\n':'') + 'Topic: ' + topicText; }
  const webCfg = { enable: true };
  // OpenAI web_search tool options
  webCfg.useOpenAITool = (typeof s.webUseOpenAITool === 'boolean') ? !!s.webUseOpenAITool : true;
  const webMode = (s.webSearchMode||'auto');
  webCfg.mode = webMode;
  if (webMode && webMode !== 'auto' && webMode !== 'openai'){
    // turn off OpenAI tool if user chose other pipeline
    webCfg.useOpenAITool = false;
  }
  if (typeof s.webForceTool === 'boolean') webCfg.forceTool = !!s.webForceTool;
  if (typeof s.webSearchContextSize === 'string' && s.webSearchContextSize) webCfg.search_context_size = String(s.webSearchContextSize);
  const loc = {};
  if (s.webLocCountry) loc.country = String(s.webLocCountry);
  if (s.webLocRegion) loc.region = String(s.webLocRegion);
  if (s.webLocCity) loc.city = String(s.webLocCity);
  if (s.webLocTimezone) loc.timezone = String(s.webLocTimezone);
  if (Object.keys(loc).length) webCfg.user_location = loc;
  // Legacy fetch pipeline options (used if OpenAI tool unavailable or disabled)
  webCfg.maxResults = Math.max(1, Number(s.webMaxResults||3));
  webCfg.perPageChars = Math.max(100, Number(s.webPerPageChars||3000));
  webCfg.totalCharsCap = Math.max(1000, Number(s.webTotalChars||9000));
  // Link following (HTTP mode)
  webCfg.linkDepth = Math.max(0, Math.min(10, Number(s.webLinkDepth||0)));
  webCfg.maxPages = Math.max(1, Math.min(20, Number(s.webMaxPages||6)));
    // Build history
    let messages = [];
    try{
      const entries = (window.graph && typeof window.graph.getMessages==='function') ? (window.graph.getMessages(ownerId) || []) : [];
      const mapRole = (m)=> (m?.who === 'user' ? 'user' : (m?.who === 'assistant' ? 'assistant' : 'system'));
      messages = entries.map(m => ({ role: mapRole(m), content: String(m.text||'') })).slice(-20);
    }catch{}
    const body = { model, max_tokens: maxTokens, web: webCfg };
    if (systemPrompt) body.system = systemPrompt;
    if (messages && messages.length) body.messages = messages;
    if (apiKey) body.apiKey = apiKey;
    const author = (()=>{ try{ const host=document.querySelector(`.fab[data-id="${ownerId}"]`); return (host?.dataset?.displayName)||'Internet'; }catch{ return 'Internet'; } })();
    setThinking(ownerId, true);
    fetch(apiBase + '/chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) })
      .then(r=>{
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (!r.ok) throw new Error('HTTP '+r.status);
      if (!/application\/json/i.test(String(ct||''))) return r.text().then(t=>{ throw new Error('Oväntat svar (ej JSON)'); });
        return r.json();
      }).then(data=>{
        let reply=''; try{ reply=String(data?.reply||''); }catch{ reply=''; }
        if(!reply) reply = data?.error ? ('Fel: ' + data.error) : 'Tomt svar från AI';
        let ts = Date.now();
        try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, reply, 'assistant'); ts = entry?.ts || ts; } }catch{}
        // Render according to Internet node's render mode
        try{
          const panel = document.querySelector(`.panel-flyout.internet-node-panel[data-owner-id="${ownerId}"]`) || document.querySelector(`.panel-flyout[data-owner-id="${ownerId}"]`);
          const list = panel?.querySelector('.messages');
          if (panel && list){
            let renderMode = 'md';
            try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if(raw){ const s=JSON.parse(raw)||{}; if(s.renderMode) renderMode=String(s.renderMode); } }catch{}
            const row=document.createElement('div'); row.className='message-row';
            const group=document.createElement('div'); group.className='msg-group';
              const authorEl=document.createElement('div'); authorEl.className='author-label'; authorEl.textContent = author || 'Internet';
            const b=document.createElement('div'); b.className='bubble';
            const textEl=document.createElement('div'); textEl.className='msg-text';
            if (renderMode === 'md' && window.mdToHtml){ textEl.innerHTML = sanitizeHtml(window.mdToHtml(String(reply||''))); }
            else { textEl.textContent = String(reply||''); }
            b.appendChild(textEl);
            const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = 'left'; meta.textContent = formatTime(ts); b.appendChild(meta);
            group.appendChild(authorEl); group.appendChild(b); row.appendChild(group); list.appendChild(row);
            list.scrollTop = list.scrollHeight;
          } else {
            if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', { ts });
          }
        }catch{ try{ if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', { ts }); }catch{} }
        // Render citations beneath the last assistant bubble (clickable)
        try{
          const cites = Array.isArray(data?.citations) ? data.citations : [];
          if (cites.length){
            const panel = document.querySelector(`.panel-flyout.internet-node-panel[data-owner-id="${ownerId}"]`) || document.querySelector(`.panel-flyout[data-owner-id="${ownerId}"]`);
            const list = panel?.querySelector('.messages');
            const rows = list ? list.querySelectorAll('.message-row') : null;
            const last = rows && rows.length ? rows[rows.length-1] : null;
            const bubble = last ? last.querySelector('.bubble') : null;
            if (bubble){
              const box = document.createElement('div');
              box.className = 'subtle';
              box.style.marginTop = '6px';
              box.style.fontSize = '12px';
              const parts = cites.map((c, i)=>{
                const title = (c.title||c.url||`Källa ${i+1}`);
                const safeTitle = String(title).replace(/[\n\r]+/g,' ');
                const url = String(c.url||'#');
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">[${i+1}] ${safeTitle}</a>`;
              });
              box.innerHTML = parts.join(' ');
              bubble.appendChild(box);
            }
          }
        }catch{}
        try{ if(window.routeMessageFrom) window.routeMessageFrom(ownerId, reply, { author, who:'assistant', ts }); }catch{}
      })
      .catch(err=>{
        const msg = 'Fel vid webbsökning: ' + (err?.message || String(err));
        let ts = Date.now(); try{ if(window.graph){ const entry=window.graph.addMessage(ownerId, author, msg, 'assistant'); ts = entry?.ts || ts; } }catch{}
        try{ if(window.receiveMessage) window.receiveMessage(ownerId, msg, 'assistant', { ts }); }catch{}
      })
      .finally(()=> setThinking(ownerId, false));
  }

  // expose
  window.openInternetPanel = openInternetPanel;
  window.requestInternetReply = requestInternetReply;
  window.positionPanelConn = window.positionPanelConn || positionPanelConn; // in case panels.js not loaded yet
})();
