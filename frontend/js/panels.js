// Flyout panels and chat UI (classic)
// Purpose: Owns the flyout panel UIs for User/CoWorker/Internet and the chat composer.
// Panels are draggable/resizable and connectable via header IO points.
(function(){
  function formatTime(ts){ try{ return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }catch{ return ''; } }
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
  function wirePanelResize(panel){ const minW=280, minH=200; let startX=0,startY=0,startW=0,startH=0,startL=0,startT=0,mode=''; const onMove=(e)=>{ const p=window.pointFromEvent(e); const dx=p.x-startX, dy=p.y-startY; let w=startW,h=startH,l=startL,t=startT; if(mode.includes('r')) w=Math.max(minW, startW+dx); if(mode.includes('l')){ w=Math.max(minW, startW-dx); l=startL+Math.min(dx, startW-minW);} if(mode.includes('b')) h=Math.max(minH, startH+dy); if(mode.includes('t')){ h=Math.max(minH, startH-dy); t=startT+Math.min(dy, startH-minH);} panel.style.width=w+'px'; panel.style.height=h+'px'; panel.style.left=l+'px'; panel.style.top=t+'px'; panel.querySelectorAll('.conn-point').forEach(cp=>positionPanelConn(cp,panel)); window.updateConnectionsFor && window.updateConnectionsFor(panel); }; const onUp=()=>{ window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; panel.querySelectorAll('.flyout-resize').forEach(h=>{ h.addEventListener('pointerdown',(e)=>{ e.preventDefault(); const r=panel.getBoundingClientRect(); startX=e.clientX; startY=e.clientY; startW=r.width; startH=r.height; startL=r.left; startT=r.top; mode=h.dataset.resize||''; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }); }); }
  /** Make a panel draggable by a specific handle element. */
  function makePanelDraggable(panel, handle){ let sx=0,sy=0,ox=0,oy=0; const down=(e)=>{ const p=window.pointFromEvent(e); const r=panel.getBoundingClientRect(); sx=p.x; sy=p.y; ox=r.left; oy=r.top; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once:true }); }; const move=(e)=>{ const p=window.pointFromEvent(e); const nx=window.clamp(ox+(p.x-sx),0,window.innerWidth-panel.offsetWidth); const ny=window.clamp(oy+(p.y-sy),0,window.innerHeight-panel.offsetHeight); panel.style.left=nx+'px'; panel.style.top=ny+'px'; panel.querySelectorAll('.conn-point').forEach(cp=>positionPanelConn(cp,panel)); window.updateConnectionsFor && window.updateConnectionsFor(panel); }; const up=()=>{ window.removeEventListener('pointermove', move); }; handle.addEventListener('pointerdown', down); }
  /** Generic info panel (used for Internet). */
  function openPanel(hostEl){ const panel=document.createElement('section'); panel.className='panel-flyout show'; panel.dataset.sectionId='p'+Math.random().toString(36).slice(2,7); panel.dataset.ownerId=hostEl.dataset.id||''; panel.style.left=Math.min(window.innerWidth-360, hostEl.getBoundingClientRect().right + 12)+'px'; panel.style.top=Math.max(12, hostEl.getBoundingClientRect().top - 20)+'px'; panel.innerHTML=`
    <header class="drawer-head"><div class="brand">${hostEl.dataset.type==='user'?'User':hostEl.dataset.type==='internet'?'Internet':'CoWorker'}</div><button class="icon-btn" data-close>✕</button></header>
    <div class="messages">
      <div class="bubble">Detta är bara UI. Ingen logik körs.</div>
    </div>
    <div class="composer">
  <textarea class="userInput" rows="1" placeholder="Skriv ett meddelande…"></textarea>
      <button class="send-btn">Skicka</button>
    </div>`; const head=panel.querySelector('.drawer-head'); makePanelDraggable(panel, head); panel.querySelector('[data-close]').addEventListener('click', ()=>panel.remove()); document.body.appendChild(panel); }
  /** Open the appropriate panel for a node by its data-type. */
  function openPanelForNode(hostEl){ if (hostEl.dataset.type==='user') openUserPanel(hostEl); else if (hostEl.dataset.type==='coworker') openCoworkerPanel(hostEl); else if (hostEl.dataset.type==='internet') openPanel(hostEl); }
  /** Wire a panel's composer (textarea + send) and message rendering. */
  function wireComposer(panel){ const ta=panel.querySelector('.userInput'); const send=panel.querySelector('.send-btn'); const list=panel.querySelector('.messages'); const append=(text, who='user', ts=Date.now())=>{ const row=document.createElement('div'); row.className='message-row'+(who==='user'?' user':''); const group=document.createElement('div'); group.className='msg-group'; const author=document.createElement('div'); author.className='author-label'; if(panel.classList.contains('user-node-panel') && who==='user'){ const name=(panel._displayName||'').trim()||'User'; author.textContent=name; } else { const nameEl=panel.querySelector('.drawer-head .meta .name'); author.textContent=(nameEl?.textContent||(who==='user'?'User':'Assistant')).trim(); } if(panel._nameFont) author.style.fontFamily=panel._nameFont; group.appendChild(author); const b=document.createElement('div'); b.className='bubble '+(who==='user'?'user':''); const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent=text; if(panel._textFont) textEl.style.fontFamily=panel._textFont; b.appendChild(textEl); const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (who==='user' ? 'right' : 'left'); meta.textContent = formatTime(ts); b.appendChild(meta); group.appendChild(b); row.appendChild(group); list.appendChild(row); if(panel.classList.contains('user-node-panel') && who==='user'){ const rgb=window.hexToRgb(panel._bubbleColorHex||'#7c5cff'); if(rgb){ const bg=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${panel._bgOn ? (panel._bubbleAlpha ?? 0.1) : 0})`; const border=`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, panel._bgOn ? (panel._bubbleAlpha ?? 0.1) + 0.12 : 0.08)})`; b.style.backgroundColor=bg; b.style.borderColor=border; } } list.scrollTop=list.scrollHeight; }; const doSend=()=>{ const val=(ta.value||'').trim(); if(!val) return; const ownerId=panel.dataset.ownerId||null; const authorLabel = panel.querySelector('.drawer-head .meta .name'); const author = (authorLabel?.textContent||'User').trim(); let ts=Date.now(); try{ if(ownerId && window.graph){ const entry = window.graph.addMessage(ownerId, author, val, 'user'); ts = entry?.ts || ts; } }catch{} append(val,'user', ts); if(ownerId && window.routeMessageFrom){ try{ window.routeMessageFrom(ownerId, val, { author, who:'user', ts }); }catch{} } ta.value=''; }; send.addEventListener('click', doSend); ta.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); doSend(); } }); }
  /** Open the User panel with settings for name/fonts/colors and composer. */
  function openUserPanel(hostEl){ const panel=document.createElement('section'); panel.className='panel-flyout show user-node-panel'; panel.dataset.sectionId='u'+Math.random().toString(36).slice(2,7); positionPanelNear(panel, hostEl); panel.style.width='360px'; panel.style.height='340px'; panel.dataset.ownerId=hostEl.dataset.id||''; panel.innerHTML=`
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
    addResizeHandles(panel); document.body.appendChild(panel); makePanelDraggable(panel, panel.querySelector('.drawer-head'));
    const settingsBtn=panel.querySelector('[data-action="settings"]'); const settings=panel.querySelector('[data-role="settings"]'); settingsBtn?.addEventListener('click', ()=>settings.classList.toggle('collapsed'));
    const clearBtn=panel.querySelector('[data-action="clear"]'); clearBtn?.addEventListener('click', ()=>{ const m=panel.querySelector('.messages'); if(m) m.innerHTML=''; });
    panel._bubbleColorHex='#7c5cff'; panel._bubbleAlpha=0.10; panel._bgOn=true;
    const colorToggle=panel.querySelector('[data-role="colorToggle"]'); const colorPanel=panel.querySelector('[data-role="colorPanel"]'); const colorPicker=panel.querySelector('[data-role="colorPicker"]'); const alphaEl=panel.querySelector('[data-role="alpha"]'); const alphaVal=panel.querySelector('[data-role="alphaVal"]'); const fontTextSel=panel.querySelector('[data-role="fontText"]'); const fontNameSel=panel.querySelector('[data-role="fontName"]'); const messagesEl=panel.querySelector('.messages'); const inputEl=panel.querySelector('.userInput');
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
    panel.querySelector('[data-action="resetAll"]')?.addEventListener('click', ()=>{ panel._bubbleColorHex='#7c5cff'; panel._bubbleAlpha=0.10; panel._bgOn=true; const m=messagesEl; if(m) m.innerHTML=''; if(colorPicker) colorPicker.value=panel._bubbleColorHex; if(colorToggle) colorToggle.style.background=panel._bubbleColorHex; if(alphaEl) alphaEl.value='10'; if(alphaVal) alphaVal.textContent='10%'; if(fontTextSel){ fontTextSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._textFont=fontTextSel.value; if(messagesEl) messagesEl.style.fontFamily=panel._textFont; if(inputEl) inputEl.style.fontFamily=panel._textFont; } if(fontNameSel){ fontNameSel.value='system-ui, Segoe UI, Roboto, Arial, sans-serif'; panel._nameFont=fontNameSel.value; const hn=panel.querySelector('.drawer-head .meta .name'); if(hn) hn.style.fontFamily=panel._nameFont; const lab=hostEl.querySelector('.fab-label'); if(lab) lab.style.fontFamily=panel._nameFont; panel.querySelectorAll('.author-label').forEach(el=>{ el.style.fontFamily=panel._nameFont; }); } applyBubbleStyles(); });
    panel.querySelector('[data-close]')?.addEventListener('click', ()=>{ document.removeEventListener('click', onDocClick); panel.remove(); });
    // Render historical messages if any
  try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      for(const m of entries){
        const row=document.createElement('div'); row.className='message-row'+(m.who==='user'?' user':'');
        const group=document.createElement('div'); group.className='msg-group';
        const author=document.createElement('div'); author.className='author-label'; author.textContent = m.author || (m.who==='user'?'User':'Assistant');
        const b=document.createElement('div'); b.className='bubble '+(m.who==='user'?'user':'');
        const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent = m.text || '';
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
    addResizeHandles(panel); document.body.appendChild(panel); makePanelDraggable(panel, panel.querySelector('.drawer-head'));
    const settingsBtn=panel.querySelector('[data-action="settings"]'); const settings=panel.querySelector('[data-role="settings"]'); settingsBtn?.addEventListener('click', ()=>settings.classList.toggle('collapsed'));
    const clearBtn=panel.querySelector('[data-action="clear"]'); clearBtn?.addEventListener('click', ()=>{ const m=panel.querySelector('.messages'); if(m) m.innerHTML=''; });
    const delBtn=panel.querySelector('[data-action="delete"]'); delBtn?.addEventListener('click', ()=>panel.remove());
    panel.querySelector('[data-close]')?.addEventListener('click', ()=>panel.remove());
    // Settings persistence wiring (Graph + localStorage)
    try{
      const ownerId = panel.dataset.ownerId||'';
      const lsKey = (id)=>`nodeSettings:${id}`;
      const apiBase = (location.protocol === 'file:') ? 'http://localhost:5000' : '';
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
      const maxTokEl = by('[data-role="maxTokens"]');
      const maxTokVal = by('[data-role="maxTokensValue"]');
      const typeSpdEl = by('[data-role="typingSpeed"]');
      const typeSpdVal = by('[data-role="typingSpeedValue"]');
      const renderEl = by('[data-role="renderMode"]');
      const webMaxEl = by('[data-role="webMaxResults"]');
      const webPerEl = by('[data-role="webPerPageChars"]');
      const webPerVal = by('[data-role="webPerPageCharsValue"]');
      const webTotEl = by('[data-role="webTotalChars"]');
      const webTotVal = by('[data-role="webTotalCharsValue"]');
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
            keyBadge.classList.remove('badge-success');
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
      if (saved.maxTokens && maxTokEl) { maxTokEl.value = String(saved.maxTokens); if(maxTokVal) maxTokVal.textContent = String(saved.maxTokens); }
      if (typeof saved.typingSpeed === 'number' && typeSpdEl) { typeSpdEl.value = String(saved.typingSpeed); if(typeSpdVal) typeSpdVal.textContent = (saved.typingSpeed>=66?'Snabb':saved.typingSpeed<=33?'Långsam':'Medel'); }
      if (saved.renderMode && renderEl) renderEl.value = saved.renderMode;
      if (saved.webMaxResults && webMaxEl) webMaxEl.value = String(saved.webMaxResults);
      if (saved.webPerPageChars && webPerEl) { webPerEl.value = String(saved.webPerPageChars); if(webPerVal) webPerVal.textContent = String(saved.webPerPageChars); }
      if (saved.webTotalChars && webTotEl) { webTotEl.value = String(saved.webTotalChars); if(webTotVal) webTotVal.textContent = String(saved.webTotalChars); }
      if (saved.apiKey && apiKeyEl) { apiKeyEl.value = saved.apiKey; }
      updateKeyBadge();
      updateRoleBadge();
      // Wire events to persist immediately
      modelEl?.addEventListener('change', ()=>persist({ model: modelEl.value }));
      nameEl?.addEventListener('input', ()=>{ const v=nameEl.value||''; updateName(v); persist({ name: v }); });
      topicEl?.addEventListener('input', ()=>{ persist({ topic: topicEl.value||'' }); updateRoleBadge(); });
      roleEl?.addEventListener('input', ()=>{ persist({ role: roleEl.value||'' }); updateRoleBadge(); });
      useRoleEl?.addEventListener('change', ()=>{ persist({ useRole: !!useRoleEl.checked }); updateRoleBadge(); });
      maxTokEl?.addEventListener('input', ()=>{ const v=Math.max(256, Math.min(30000, Number(maxTokEl.value)||1000)); if(maxTokVal) maxTokVal.textContent=String(v); persist({ maxTokens: v }); });
      typeSpdEl?.addEventListener('input', ()=>{ const v = Math.max(0, Math.min(100, Number(typeSpdEl.value)||10)); if(typeSpdVal) typeSpdVal.textContent = (v>=66?'Snabb':v<=33?'Långsam':'Medel'); persist({ typingSpeed: v }); });
      renderEl?.addEventListener('change', ()=>persist({ renderMode: renderEl.value }));
      webMaxEl?.addEventListener('change', ()=>persist({ webMaxResults: Math.max(1, Number(webMaxEl.value)||3) }));
      webPerEl?.addEventListener('input', ()=>{ const v=Math.max(100, Math.min(12000, Number(webPerEl.value)||3000)); if(webPerVal) webPerVal.textContent=String(v); persist({ webPerPageChars: v }); });
      webTotEl?.addEventListener('input', ()=>{ const v=Math.max(1000, Math.min(24000, Number(webTotEl.value)||9000)); if(webTotVal) webTotVal.textContent=String(v); persist({ webTotalChars: v }); });
      apiKeyEl?.addEventListener('input', ()=>{ persist({ apiKey: apiKeyEl.value||'' }); updateKeyBadge(); });
    }catch{}
  // Render historical messages if any
    try{
      const ownerId = panel.dataset.ownerId||''; const list = panel.querySelector('.messages');
      const entries = (window.graph && ownerId) ? window.graph.getMessages(ownerId) : [];
      for(const m of entries){
        const row=document.createElement('div'); row.className='message-row'+(m.who==='user'?' user':'');
        const group=document.createElement('div'); group.className='msg-group';
        const author=document.createElement('div'); author.className='author-label'; author.textContent = m.author || (m.who==='user'?'User':'Assistant');
        const b=document.createElement('div'); b.className='bubble '+(m.who==='user'?'user':'');
        const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent = m.text || '';
        b.appendChild(textEl); const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign = (m.who==='user' ? 'right' : 'left'); meta.textContent = formatTime(m.ts); b.appendChild(meta); group.appendChild(author); group.appendChild(b); row.appendChild(group); list?.appendChild(row);
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
    let authorName = (who==='user' ? 'User' : 'Assistant');
    try{
      const headerNameEl = panel.querySelector('.drawer-head .meta .name');
      if (headerNameEl && who !== 'user') authorName = headerNameEl.textContent?.trim() || authorName;
      if (panel.classList.contains('user-node-panel') && who==='user') authorName = (panel._displayName||'').trim() || 'User';
    }catch{}
    author.textContent = authorName;
    const b=document.createElement('div'); b.className='bubble '+(who==='user'?'user':'');
    const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent=String(text);
  b.appendChild(textEl); const metaEl=document.createElement('div'); metaEl.className='subtle'; metaEl.style.marginTop='6px'; metaEl.style.opacity='0.8'; metaEl.style.textAlign = (who==='user' ? 'right' : 'left'); const ts = meta?.ts || Date.now(); metaEl.textContent = formatTime(ts); b.appendChild(metaEl); group.appendChild(author); group.appendChild(b); row.appendChild(group); list.appendChild(row); list.scrollTop=list.scrollHeight;
  }
  /** Append text content into a board section (by sectionId) with optional Markdown rendering. */
  function appendToSection(sectionId, text, opts){
    try{
      const sec = document.querySelector(`.panel.board-section[data-section-id="${sectionId}"]`)
                || document.querySelector(`.panel.board-section:nth-of-type(${Number(sectionId?.replace(/^s/,''))||0})`);
      const note = sec ? sec.querySelector('.note') : null;
      if (!note) return;
      // Determine section's own render mode
      const readSecMode = ()=>{
        try{
          const id = sec?.dataset.sectionId || '';
          const raw = localStorage.getItem(`sectionSettings:${id}`);
          const saved = raw ? JSON.parse(raw) : {};
          return saved.renderMode || 'raw';
        }catch{ return 'raw'; }
      };
      const getSecRaw = (id)=>{ try{ return localStorage.getItem(`sectionRaw:${id}`) || ''; }catch{ return ''; } };
      const setSecRaw = (id, value)=>{ try{ localStorage.setItem(`sectionRaw:${id}`, String(value||'')); }catch{} };
      const mode = (opts && opts.mode) || readSecMode();
      const content = String(text||'');
      const id = sec?.dataset.sectionId || '';
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
          sel.innerHTML = '<option value="raw">Rå text</option><option value="md">Markdown</option><option value="html">HTML</option>';
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
                if (mode === 'md' && window.mdToHtml){
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.innerHTML = window.mdToHtml(src);
                  note.dataset.rendered = '1';
                } else if (mode === 'html'){
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.innerHTML = sanitizeHtml(src);
                  note.dataset.rendered = '1';
                } else {
                  const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                  note.textContent = src;
                  delete note.dataset.rendered;
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
          note.addEventListener('focus', ()=>{
            try{
              const raw = localStorage.getItem(`sectionRaw:${id}`);
              const mode = (function(){ const s = localStorage.getItem(`sectionSettings:${id}`); try{ return (s?JSON.parse(s):{}).renderMode||'raw'; }catch{ return 'raw'; } })();
              if (mode === 'md' || mode === 'html'){
                if (raw != null){ note.textContent = raw; delete note.dataset.rendered; }
                else {
                  const src = (mode === 'md') ? (note.innerText || '') : (note.innerHTML || '');
                  localStorage.setItem(`sectionRaw:${id}`, src);
                }
              }
            }catch{}
          });
          note.addEventListener('blur', ()=>{
            try{
              const mode = (function(){ const s = localStorage.getItem(`sectionSettings:${id}`); try{ return (s?JSON.parse(s):{}).renderMode||'raw'; }catch{ return 'raw'; } })();
              const alreadyRendered = note.dataset.rendered === '1';
              const storedRaw = localStorage.getItem(`sectionRaw:${id}`) || '';
              const src = alreadyRendered ? storedRaw : (note.textContent || '');
              // Only update stored raw if we were editing (not already rendered)
              if (!alreadyRendered){ localStorage.setItem(`sectionRaw:${id}`, src); }
              if (mode === 'md' && window.mdToHtml){ note.innerHTML = window.mdToHtml(src); note.dataset.rendered = '1'; }
              else if (mode === 'html'){ note.innerHTML = sanitizeHtml(src); note.dataset.rendered = '1'; }
            }catch{}
          });
          // Ctrl+Enter: render immediately without losing focus context permanently
          note.addEventListener('keydown', (e)=>{
            try{
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
                e.preventDefault();
                const src = note.textContent || '';
                localStorage.setItem(`sectionRaw:${id}`, src);
                const mode = (function(){ const s = localStorage.getItem(`sectionSettings:${id}`); try{ return (s?JSON.parse(s):{}).renderMode||'raw'; }catch{ return 'raw'; } })();
                if (mode === 'md' && window.mdToHtml){ note.innerHTML = window.mdToHtml(src); note.dataset.rendered = '1'; }
                else if (mode === 'html'){ note.innerHTML = sanitizeHtml(src); note.dataset.rendered = '1'; }
                else { note.textContent = src; }
              }
            }catch{}
          });
          // Initial render if mode=md and we have stored raw
          try{
            const s = localStorage.getItem(`sectionSettings:${id}`);
            const mode = s ? (JSON.parse(s).renderMode || 'raw') : 'raw';
            if (mode === 'md' && window.mdToHtml){
              const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
              localStorage.setItem(`sectionRaw:${id}`, src);
              note.innerHTML = window.mdToHtml(src);
              note.dataset.rendered = '1';
            } else if (mode === 'html'){
              const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
              localStorage.setItem(`sectionRaw:${id}`, src);
              note.innerHTML = sanitizeHtml(src);
              note.dataset.rendered = '1';
            }
          }catch{}
        }
      });
    }catch{}
  }
  // expose
  window.openPanel = openPanel;
  window.openUserPanel = openUserPanel;
  window.openCoworkerPanel = openCoworkerPanel;
  window.openPanelForNode = openPanelForNode;
  window.makePanelDraggable = makePanelDraggable;
  window.positionPanelConn = positionPanelConn;
  window.receiveMessage = receiveMessage;
  window.appendToSection = appendToSection;
  window.initBoardSectionSettings = initBoardSectionSettings;
})();
