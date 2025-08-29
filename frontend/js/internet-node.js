// Internet Node: panel UI, settings, and backend web-enabled replies (classic)
// Responsibility: Specialiserad panel för webbsök/länkar, speglar coworker men med web-verktyg.
// Structured separately to mirror CoWorker behavior but specialized for web tools.
// SOLID hints:
// - S: Håll webbspecifika inställningar/UX här; allmän panel-UI i panels.js.
// - O: Stötta fler webbpipelines genom att lägga till alternativa branches utan att flytta logik till andra filer.
// - D: Backend-anrop via window.API_BASE och fetch; undvik hårda beroenden.
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
  <button class="icon-btn" data-action="duplicate" title="Duplicera nod">⧉</button>
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
      <fieldset class="subsec">
        <legend>Chunkning</legend>
        <label class="inline">
          <input type="checkbox" data-role="chunkEnable" /> Aktivera chunkning
        </label>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="inline"><input type="checkbox" data-role="chunkNodeToNode" checked /> Mellan noder</label>
          <label class="inline"><input type="checkbox" data-role="chunkToSection" checked /> Till sektioner</label>
        </div>
        <label class="inline" style="margin-top:6px">
          <input type="checkbox" data-role="chunkNumbered" /> Numrerad chunkning (1., 2), 3: …)
        </label>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px; margin-top:6px">
          <label class="inline"><input type="checkbox" data-role="chunkLines" checked /> Radchunkning</label>
          <label>rader/batch
            <input type="range" min="1" max="50" step="1" value="3" data-role="chunkBatchSize" />
            <span class="subtle" data-role="chunkBatchSizeVal">3</span>
          </label>
        </div>
        <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px; margin-top:6px">
          <label class="inline"><input type="checkbox" data-role="chunkTokens" /> Tokenchunkning</label>
          <label>tokens/batch
            <input type="range" min="200" max="2000" step="50" value="800" data-role="chunkTokenSize" />
            <span class="subtle" data-role="chunkTokenSizeVal">800</span>
          </label>
        </div>
      </fieldset>
      <label>API-nyckel (denna nod)
        <input type="password" placeholder="Valfri – annars används global" data-role="apiKey" />
      </label>
    </div>
    <div class="messages" data-role="messages"></div>
    <div class="composer">
      <textarea class="userInput" rows="1" placeholder="Sök eller be om sammanfattning... "></textarea>
  <button class="send-btn" type="button">Skicka</button>
  <button class="cancel-btn btn btn-ghost" type="button" style="display:none; margin-left:6px;">Avbryt</button>
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
  // Duplicate Internet node
  try{ const dupBtn = panel.querySelector('[data-action="duplicate"]'); dupBtn?.addEventListener('click', ()=>{ try{ window.duplicateNode && window.duplicateNode(hostEl); }catch{} }); }catch{}
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
  // Chunking controls (Internet node supports tokens, lines, numbering)
  const chEnableEl = by('[data-role="chunkEnable"]');
  const chNodeToNodeEl = by('[data-role="chunkNodeToNode"]');
  const chToSectionEl = by('[data-role="chunkToSection"]');
  const chNumberedEl = by('[data-role="chunkNumbered"]');
  const chLinesEl = by('[data-role="chunkLines"]');
  const chBatchEl = by('[data-role="chunkBatchSize"]');
  const chBatchValEl = by('[data-role="chunkBatchSizeVal"]');
  const chTokensEl = by('[data-role="chunkTokens"]');
  const chTokSizeEl = by('[data-role="chunkTokenSize"]');
  const chTokSizeValEl = by('[data-role="chunkTokenSizeVal"]');
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
      // Initialize chunking UI
      if (typeof saved.chunkingEnabled==='boolean' && chEnableEl) chEnableEl.checked = !!saved.chunkingEnabled;
      if (typeof saved.chunkNodeToNode==='boolean' && chNodeToNodeEl) chNodeToNodeEl.checked = !!saved.chunkNodeToNode; else if (chNodeToNodeEl) chNodeToNodeEl.checked = true;
      if (typeof saved.chunkToSection==='boolean' && chToSectionEl) chToSectionEl.checked = !!saved.chunkToSection; else if (chToSectionEl) chToSectionEl.checked = true;
      if (typeof saved.chunkUseNumbering==='boolean' && chNumberedEl) chNumberedEl.checked = !!saved.chunkUseNumbering;
      if (typeof saved.chunkUseLines==='boolean' && chLinesEl) chLinesEl.checked = !!saved.chunkUseLines; else if (chLinesEl) chLinesEl.checked = true;
      if (saved.chunkBatchSize && chBatchEl){ chBatchEl.value = String(Math.max(1, Math.min(50, Number(saved.chunkBatchSize)||3))); if(chBatchValEl) chBatchValEl.textContent = chBatchEl.value; }
      if (typeof saved.chunkUseTokens==='boolean' && chTokensEl) chTokensEl.checked = !!saved.chunkUseTokens;
      if (saved.chunkTokenSize && chTokSizeEl){ chTokSizeEl.value = String(Math.max(200, Math.min(2000, Number(saved.chunkTokenSize)||800))); if(chTokSizeValEl) chTokSizeValEl.textContent = chTokSizeEl.value; }
      const updChunkDisabled = ()=>{
        const on = !!(chEnableEl && chEnableEl.checked);
        [chNodeToNodeEl, chToSectionEl, chNumberedEl, chLinesEl, chBatchEl, chTokensEl, chTokSizeEl].forEach(el=>{ if (el) el.disabled = !on; });
      };
      updChunkDisabled();
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
  // Chunking persistence
  chEnableEl?.addEventListener('change', ()=>{ persist({ chunkingEnabled: !!chEnableEl.checked }); updChunkDisabled(); });
  chNodeToNodeEl?.addEventListener('change', ()=>persist({ chunkNodeToNode: !!chNodeToNodeEl.checked }));
  chToSectionEl?.addEventListener('change', ()=>persist({ chunkToSection: !!chToSectionEl.checked }));
  chNumberedEl?.addEventListener('change', ()=>persist({ chunkUseNumbering: !!chNumberedEl.checked }));
  chLinesEl?.addEventListener('change', ()=>persist({ chunkUseLines: !!chLinesEl.checked }));
  chBatchEl?.addEventListener('input', ()=>{ const v=Math.max(1, Math.min(50, Number(chBatchEl.value)||3)); if (chBatchValEl) chBatchValEl.textContent=String(v); persist({ chunkBatchSize: v }); });
  chTokensEl?.addEventListener('change', ()=>persist({ chunkUseTokens: !!chTokensEl.checked }));
  chTokSizeEl?.addEventListener('input', ()=>{ const v=Math.max(200, Math.min(2000, Number(chTokSizeEl.value)||800)); if (chTokSizeValEl) chTokSizeValEl.textContent=String(v); persist({ chunkTokenSize: v }); });
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
    // Wire Cancel visibility to in-flight state
    try{
      const ownerId = panel.dataset.ownerId||'';
      const cancelBtn = panel.querySelector('.cancel-btn');
      const updateCancel = ()=>{ try{ let on = false; if (window.hasActiveAIRequest && ownerId) { on = !!window.hasActiveAIRequest(ownerId); } else if (window.__aiInflight && window.__aiInflight.has) { on = window.__aiInflight.has(ownerId); } if (cancelBtn) cancelBtn.style.display = on ? '' : 'none'; }catch{} };
      updateCancel();
      window.addEventListener('ai-request-started', (e)=>{ try{ if (String(e?.detail?.ownerId||'')===ownerId) updateCancel(); }catch{} });
      window.addEventListener('ai-request-finished', (e)=>{ try{ if (String(e?.detail?.ownerId||'')===ownerId) setTimeout(updateCancel, 50); }catch{} });
      cancelBtn?.addEventListener('click', ()=>{ try{ if (window.cancelAIRequest) { window.cancelAIRequest(ownerId); } else if (window.__aiInflight && window.__aiInflight.get) { const c = window.__aiInflight.get(ownerId); try{ c?.abort?.(); }catch{} try{ window.__aiInflight.delete(ownerId); }catch{} } window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, ok:false, canceled:true } })); updateCancel(); }catch{} });
    }catch{}
    wirePanelResize(panel);
  }

  // Backend call: request a web-enabled reply for Internet node and route outputs
  function requestInternetReply(ownerId, ctx){
    if(!ownerId || !ctx || !ctx.text) return Promise.resolve();
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
      const mapped = entries.map(m => ({ role: mapRole(m), content: String(m.text||'') }));
      const MAX_MSGS = 16, MAX_CHARS_PER_MSG = 6000;
      messages = mapped.slice(-MAX_MSGS).map(x => ({ role: x.role, content: String(x.content||'').slice(0, MAX_CHARS_PER_MSG) }));
    }catch{}
    if (systemPrompt && systemPrompt.length > 12000) systemPrompt = systemPrompt.slice(0, 12000);
    const body = { model, max_tokens: maxTokens, web: webCfg };
    if (systemPrompt) body.system = systemPrompt;
    if (messages && messages.length) body.messages = messages;
    if (apiKey) body.apiKey = apiKey;
    const author = (()=>{ try{ const host=document.querySelector(`.fab[data-id="${ownerId}"]`); return (host?.dataset?.displayName)||'Internet'; }catch{ return 'Internet'; } })();
    setThinking(ownerId, true);
    const controller = new AbortController(); const signal = controller.signal;
    // Track in-flight for cancel and toggle
    try{
      window.__aiInflight = window.__aiInflight || new Map();
      window.__aiInflight.set(ownerId, controller);
    }catch{}
    // Stream helper for Internet node
    const sendStreamOnce = async (payload)=>{
      const res = await fetch(apiBase + '/chat/stream', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal });
      const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (!res.ok){ let txt=''; try{ txt = await res.text(); }catch{}; throw new Error('HTTP '+res.status+': '+String((txt||'')).slice(0,200)); }
      if (!/x-ndjson/i.test(String(ct||''))) throw new Error('NO_STREAM');
      const panel = document.querySelector(`.panel-flyout.internet-node-panel[data-owner-id="${ownerId}"]`) || document.querySelector(`.panel-flyout[data-owner-id="${ownerId}"]`);
      const list = panel?.querySelector('.messages');
      const ensureUI = ()=>{
        if (!panel || !list) return null;
        if (ensureUI._el && ensureUI._el.row && ensureUI._el.row.isConnected) return ensureUI._el;
        const row=document.createElement('div'); row.className='message-row';
        const group=document.createElement('div'); group.className='msg-group';
        const authorEl=document.createElement('div'); authorEl.className='author-label'; authorEl.textContent = author || 'Internet';
        const b=document.createElement('div'); b.className='bubble';
        const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent='';
        const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = 'left'; meta.textContent='';
        b.appendChild(textEl); b.appendChild(meta); group.appendChild(authorEl); group.appendChild(b); row.appendChild(group); list.appendChild(row);
        // only autoscroll if at bottom or inactive for 5s
        try{ wireAutoscrollGuard(list); const shouldScroll = shouldAutoscrollNow(list); if (shouldScroll){ list.__autoScrolling=true; list.scrollTop = list.scrollHeight; setTimeout(()=>{ try{ list.__autoScrolling=false; }catch{} }, 0); } }catch{}
        ensureUI._el = { row, bubble:b, textEl, metaEl:meta, panel, list };
        return ensureUI._el;
      };
      function wireAutoscrollGuard(list){ try{ if(!list || list.__autoscrollHooked) return; list.__autoscrollHooked = true; list.addEventListener('scroll', ()=>{ try{ if (list.__autoScrolling) return; list.dataset.lastUserScrollTs = String(Date.now()); }catch{} }); }catch{} }
      function shouldAutoscrollNow(list){ try{ const atBottom = (list.scrollTop + list.clientHeight) >= (list.scrollHeight - 8); if (atBottom) return true; const last = Number(list.dataset.lastUserScrollTs||0); if (!last) return false; return (Date.now() - last) >= 5000; }catch{ return true; } }
      const reader = res.body.getReader(); const decoder = new TextDecoder('utf-8');
      let acc='';
      while(true){
        const { value, done } = await reader.read(); if (done) break;
        const chunk = decoder.decode(value, { stream:true });
        const lines = chunk.split(/\r?\n/);
        for (const line of lines){ const t = String(line||'').trim(); if(!t) continue; let obj=null; try{ obj = JSON.parse(t); }catch{ continue; }
          const type = String(obj?.type||'');
          if (type === 'delta'){ const d = String(obj?.delta||''); if(d){ acc += d; const ui = ensureUI(); if(ui){ try{ wireAutoscrollGuard(ui.list); const shouldScroll = shouldAutoscrollNow(ui.list); ui.textEl.textContent = acc; if (shouldScroll){ ui.list.__autoScrolling=true; ui.list.scrollTop = ui.list.scrollHeight; setTimeout(()=>{ try{ ui.list.__autoScrolling=false; }catch{} }, 0); } }catch{} } } }
        }
      }
      // finalize
      let finalText = String(acc||''); let ts = Date.now();
      try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, finalText, 'assistant'); ts = entry?.ts || ts; } }catch{}
      try{
        const ui = ensureUI();
        if (ui){
          let renderMode = 'md'; try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if(raw){ const s=JSON.parse(raw)||{}; if(s.renderMode) renderMode = String(s.renderMode); } }catch{}
          if (renderMode === 'md' && window.mdToHtml){ try{ ui.textEl.innerHTML = sanitizeHtml(window.mdToHtml(finalText)); }catch{ ui.textEl.textContent = finalText; } } else { ui.textEl.textContent = finalText; }
          if (ui.metaEl) ui.metaEl.textContent = formatTime(ts);
          wireAutoscrollGuard(ui.list);
          const shouldScroll = shouldAutoscrollNow(ui.list);
          if (shouldScroll){ ui.list.__autoScrolling=true; ui.list.scrollTop = ui.list.scrollHeight; setTimeout(()=>{ try{ ui.list.__autoScrolling=false; }catch{} }, 0); }
        } else { if(window.receiveMessage) window.receiveMessage(ownerId, finalText, 'assistant', { ts }); }
      }catch{ try{ if(window.receiveMessage) window.receiveMessage(ownerId, finalText, 'assistant', { ts }); }catch{} }
      try{ if(window.routeMessageFrom) window.routeMessageFrom(ownerId, finalText, { author, who:'assistant', ts }); }catch{}
      return { reply: finalText };
    };
    const sendJSONOnce = async (payload)=>{
      const r = await fetch(apiBase + '/chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal });
      const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (!r.ok){ let text=''; try{ text=await r.text(); }catch{}; throw new Error('HTTP '+r.status+': '+String((text||'')).slice(0,200)); }
      if (!/application\/json/i.test(String(ct||''))){ const _ = await r.text().catch(()=>null); throw new Error('Oväntat svar (ej JSON)'); }
      return r.json();
    };
    // Announce start for UI (to show cancel button)
    try{ window.dispatchEvent(new CustomEvent('ai-request-started', { detail:{ ownerId, sourceId: ctx && ctx.sourceId ? String(ctx.sourceId) : null } })); }catch{}
    let __ok = false;
    const run = async ()=>{
      try{
        // Prefer streaming
        try{ return await sendStreamOnce(body); }
        catch(e){
          if (String(e?.message||'')==='NO_STREAM') {
            const data = await sendJSONOnce(body);
            const reply = String(data?.reply||'') || (data?.error? ('Fel: '+data.error) : 'Tomt svar från AI');
            let ts=Date.now();
            try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, reply, 'assistant'); ts = entry?.ts || ts; } }catch{}
            try{ if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', { ts }); }catch{}
            try{ if(window.routeMessageFrom) window.routeMessageFrom(ownerId, reply, { author, who:'assistant', ts }); }catch{}
            return { reply };
          } else { throw e; }
        }
      } finally {
        __ok = true;
      }
    };
    // Ensure cleanup and events even when awaited by callers
    const p = run().catch(err=>{
      const msg = 'Fel vid webbsökning: ' + (err?.message || String(err));
      let ts = Date.now();
      try{ if(window.graph){ const entry=window.graph.addMessage(ownerId, author, msg, 'assistant'); ts = entry?.ts || ts; } }catch{}
      try{ if(window.receiveMessage) window.receiveMessage(ownerId, msg, 'assistant', { ts }); }catch{}
      return { error: msg };
    }).finally(()=>{
      setTimeout(()=>{ try{ setThinking(ownerId, false); }catch{} }, 700);
      try{ if (window.__aiInflight && window.__aiInflight.get && window.__aiInflight.get(ownerId) === controller) window.__aiInflight.delete(ownerId); }catch{}
      try{ window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, ok: __ok } })); }catch{}
    });
    return p;
  }

  // expose
  window.openInternetPanel = openInternetPanel;
  window.requestInternetReply = requestInternetReply;
  window.positionPanelConn = window.positionPanelConn || positionPanelConn; // in case panels.js not loaded yet
})();
