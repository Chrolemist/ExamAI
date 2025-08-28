// Connection creation, path drawing, and delete UI (classic)
// Responsibility: Äga all logik för att rita/underhålla SVG-kablar och interaktion runt skapa/ta bort.
// No node/panel creation here; panel-UI lever i panels.js och internet-node.js.
// SOLID hints:
// - S: Dela gärna i tre små delar vid refactor: (1) Geometry/Path, (2) Interaction/Drag, (3) Router/Transmit.
// - O: Lägg nya visuella effekter som separata helpers utan att röra routing.
// - I: Exportera ett litet API (startConnection, finalizeConnection, updateConnectionsFor, routeMessageFrom).
// - D: requestAIReply/internet-reply bör vara injicerbara beroenden (t.ex. window.requestAIReply) i stället för direkt fetch.
(function(){
  const svg = () => window.svg;
  // Track a selected connection for keyboard deletion
  let _selectedConn = null;
  // simulation toggle
  // AI-simulering borttagen
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
  // Allow events for permanent paths (hover/delete), but the SVG container itself ignores events
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
  /** Draw a cubic Bezier path that flips bend direction depending on geometry. */
  function drawPath(path, x1, y1, x2, y2){
    const dx = x2 - x1, dy = y2 - y1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    let c1x, c1y, c2x, c2y;
    if (adx >= ady) {
      // Predominantly horizontal: bend left/right; flip when x crosses
      const sign = dx >= 0 ? 1 : -1;
      const cx = Math.max(40, adx * 0.4);
      c1x = x1 + sign * cx; c1y = y1 + ( (y1 + y2)/2 - y1 ) * 0.2; // slight pull toward mid-y
      c2x = x2 - sign * cx; c2y = y2 + ( (y1 + y2)/2 - y2 ) * 0.2;
    } else {
      // Predominantly vertical: bend up/down; flip when y crosses
      const signY = dy >= 0 ? 1 : -1;
      const cy = Math.max(40, ady * 0.4);
      c1x = x1 + dx * 0.2; c1y = y1 + signY * cy;
      c2x = x2 - dx * 0.2; c2y = y2 - signY * cy;
    }
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
      // Choose direction: if source is fromId we flow start->end (-offset), if from toId we flow end->start (+offset)
      let toOffset = -28;
      try{
        const src = opts && opts.sourceId;
        if (src){
          if (src === conn.toId) toOffset = 28; // reverse
          else if (src === conn.fromId) toOffset = -28; // forward
        }
      }catch{}
      const anim = path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: toOffset }], { duration: 650, iterations: 1, easing:'linear' });
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
    // Deduplicate by targetId in case multiple cables point to the same node
    const seen = new Set();
    for (const {targetId, via} of targets){
      if (!targetId || seen.has(targetId)) continue;
      seen.add(targetId);
      transmitOnConnection(via, { sourceId: ownerId, targetId, text: String(text), author: meta?.author||'Incoming', who: (meta && meta.who) ? meta.who : 'assistant', ts: meta?.ts || Date.now(), meta });
    }
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
    // If the receiver is a coworker, treat incoming text as a 'user' message to that coworker
    let whoForTarget = who || 'assistant';
    try{
      const host = document.querySelector(`.fab[data-id="${targetId}"]`);
      if (host && host.dataset.type === 'coworker') whoForTarget = 'user';
    }catch{}
  const baseMeta = (payload && payload.meta) ? Object.assign({}, payload.meta) : {};
  // Never propagate attachments out of a node; keep only safe metadata like citations
  if (baseMeta && baseMeta.attachments) delete baseMeta.attachments;
  const routedMeta = Object.assign(baseMeta, { ts, via: `${conn.fromId}->${conn.toId}`, from: sourceId, author: (author||'Incoming') });
  try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', text, whoForTarget, routedMeta); }catch{}
  try{ if(window.receiveMessage) window.receiveMessage(targetId, text, whoForTarget, routedMeta); }catch{}
  // If the target is a board section, append content there as well
    try{
      const targetEl = document.querySelector(`.panel.board-section[data-section-id="${targetId}"]`);
      if (targetEl && window.appendToSection){
    // Sections decide their own render mode; just pass text
    window.appendToSection(targetId, text);
      }
    }catch{}
    // If the receiving node is a coworker, request a real AI reply from backend
    try{
      const host = document.querySelector(`.fab[data-id="${targetId}"]`);
      if (host && host.dataset.type === 'coworker') requestAIReply(targetId, { text: String(text), sourceId, via: `${conn.fromId}->${conn.toId}` });
      if (host && host.dataset.type === 'internet' && window.requestInternetReply) window.requestInternetReply(targetId, { text: String(text), sourceId, via: `${conn.fromId}->${conn.toId}` });
    }catch{}
  }

  // Backend integration: request an AI reply for a coworker node
  function requestAIReply(ownerId, ctx){
    if (!ownerId || !ctx || !ctx.text) return;
    // Turn on thinking glow on the coworker while request is in-flight
    function setThinking(id, on){
      try{
        const host = document.querySelector(`.fab[data-id="${id}"]`);
        if (!host) return;
        const cur = Number(host.dataset.pending||0) || 0;
        const next = on ? (cur+1) : Math.max(0, cur-1);
        host.dataset.pending = String(next);
        host.classList.toggle('busy', next > 0);
      }catch{}
    }
    const detectApiBase = ()=>{
      try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{}
      try{
        if (location.protocol === 'file:') return 'http://localhost:8000';
        if (location.port && location.port !== '8000') return 'http://localhost:8000';
      }catch{}
      return '';
    };
    const apiBase = detectApiBase();
    // Gather settings from coworker panel if present, else from Graph/localStorage
  let model = 'gpt-5-mini';
  let systemPrompt = '';
    let apiKey = '';
    let maxTokens = 1000;
    const readSaved = ()=>{
      let s={};
      try{ if(window.graph) s = Object.assign({}, window.graph.getNodeSettings(ownerId)||{}); }catch{}
      try{ const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if(raw) s = Object.assign({}, s, JSON.parse(raw)||{}); }catch{}
      return s;
    };
  try{
      const panel = [...document.querySelectorAll('.panel-flyout')].find(p => p.dataset.ownerId === ownerId);
      if (panel){
  const mEl = panel.querySelector('[data-role="model"]'); if (mEl && mEl.value) model = String(mEl.value);
        const useRole = panel.querySelector('[data-role="useRole"]');
        const roleEl = panel.querySelector('[data-role="role"]');
        const topicEl = panel.querySelector('[data-role="topic"]');
        const keyEl = panel.querySelector('[data-role="apiKey"]');
        const mtEl = panel.querySelector('[data-role="maxTokens"]');
        if (keyEl && keyEl.value) apiKey = String(keyEl.value);
        if (mtEl && mtEl.value) { const v = Number(mtEl.value); if (!Number.isNaN(v) && v>0) maxTokens = Math.min(30000, Math.max(256, v)); }
        const roleText = roleEl && roleEl.value ? String(roleEl.value).trim() : '';
        const topicText = topicEl && topicEl.value ? String(topicEl.value).trim() : '';
        const includeRole = !!(useRole && useRole.checked);
        if (includeRole && (roleText || topicText)){
          systemPrompt = roleText;
          if (topicText) systemPrompt += (systemPrompt ? '\n\n' : '') + 'Topic: ' + topicText;
        }
        // Build a materials index from both coworker and sender attachments for [n] referencing
        try{
          const getAtt = (id)=>{ try{ const raw = localStorage.getItem(`nodeAttachments:${id}`); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
          const coworkerAtt = getAtt(ownerId);
          const senderAtt = (ctx && ctx.sourceId) ? getAtt(ctx.sourceId) : [];
          // Merge with coworker first, then sender, then de-duplicate by url or name+chars to keep numbering stable with UI
          const merged = ([]).concat(Array.isArray(coworkerAtt)?coworkerAtt:[], Array.isArray(senderAtt)?senderAtt:[]);
          const seen = new Set();
          const combined = [];
          for (const it of (merged||[])){
            try{
              const key = (it && (it.url||it.origUrl||'')) || `${it?.name||''}|${it?.chars||0}`;
              if (!key) { combined.push(it); continue; }
              if (!seen.has(key)) { seen.add(key); combined.push(it); }
            }catch{ combined.push(it); }
          }
          if (combined.length){
            const lines = combined.map((it, i)=>`[${i+1}] ${String(it.name||'Bilaga').trim()} (${Number(it.chars||0)} tecken)`);
            const guide = 'Material för denna fråga (använd [n] eller [n,sida] i svaret, t.ex. [1,7], där n matchar listan; lägg fullständiga källor längst ned):\n' + lines.join('\n');
            systemPrompt = (systemPrompt ? (systemPrompt + '\n\n') : '') + guide;
            // Stash for meta to allow footnotes rendering
            requestAIReply._lastAttachments = combined;
            // Also include attachment contents as a dedicated user message marked with 'Bilaga:' so backend guidance is enabled
            try{
              const joinSep = '\n\n---\n\n';
              const blocks = combined.map((it, i)=>{
                const head = `[${i+1}] ${String(it.name||'Bilaga').trim()} (${Number(it.chars||0)} tecken)`;
                const body = String(it.text||'');
                return head + (body ? `\n${body}` : '');
              }).filter(Boolean);
              const materials = 'Bilaga:\n' + blocks.join(joinSep);
              // Insert before the most recent user question if present, else append
              if (Array.isArray(messages) && messages.length){
                const lastIdx = messages.length - 1;
                if (messages[lastIdx] && messages[lastIdx].role === 'user') messages.splice(lastIdx, 0, { role:'user', content: materials });
                else messages.push({ role:'user', content: materials });
              } else {
                messages = [{ role:'user', content: materials }];
              }
            }catch{}
          } else {
            requestAIReply._lastAttachments = [];
          }
        }catch{ requestAIReply._lastAttachments = []; }
      } else {
        const s = readSaved();
        if (s.model) model = s.model;
        if (s.maxTokens) maxTokens = Math.min(30000, Math.max(256, Number(s.maxTokens)||1000));
        if (s.apiKey) apiKey = s.apiKey;
        const includeRole = !!s.useRole;
        const roleText = (s.role||'').trim();
        const topicText = (s.topic||'').trim();
        if (includeRole && (roleText || topicText)){
          systemPrompt = roleText;
          if (topicText) systemPrompt += (systemPrompt ? '\n\n' : '') + 'Topic: ' + topicText;
        }
        // Also include attachments list from storage if present for both coworker and sender
        try{
          const getAtt = (id)=>{ try{ const raw = localStorage.getItem(`nodeAttachments:${id}`); return raw ? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
          const coworkerAtt = getAtt(ownerId);
          const senderAtt = (ctx && ctx.sourceId) ? getAtt(ctx.sourceId) : [];
          const merged = ([]).concat(Array.isArray(coworkerAtt)?coworkerAtt:[], Array.isArray(senderAtt)?senderAtt:[]);
          const seen = new Set();
          const combined = [];
          for (const it of (merged||[])){
            try{
              const key = (it && (it.url||it.origUrl||'')) || `${it?.name||''}|${it?.chars||0}`;
              if (!key) { combined.push(it); continue; }
              if (!seen.has(key)) { seen.add(key); combined.push(it); }
            }catch{ combined.push(it); }
          }
          if (combined.length){
            const lines = combined.map((it, i)=>`[${i+1}] ${String(it.name||'Bilaga').trim()} (${Number(it.chars||0)} tecken)`);
            const guide = 'Material för denna fråga (använd [n] eller [n,sida] i svaret, t.ex. [1,7], där n matchar listan; lägg fullständiga källor längst ned):\n' + lines.join('\n');
            systemPrompt = (systemPrompt ? (systemPrompt + '\n\n') : '') + guide;
            requestAIReply._lastAttachments = combined;
            // Include attachment contents as a 'Bilaga:' message so backend sees materials
            try{
              const joinSep = '\n\n---\n\n';
              const blocks = combined.map((it, i)=>{
                const head = `[${i+1}] ${String(it.name||'Bilaga').trim()} (${Number(it.chars||0)} tecken)`;
                const body = String(it.text||'');
                return head + (body ? `\n${body}` : '');
              }).filter(Boolean);
              const materials = 'Bilaga:\n' + blocks.join(joinSep);
              if (Array.isArray(messages) && messages.length){
                const lastIdx = messages.length - 1;
                if (messages[lastIdx] && messages[lastIdx].role === 'user') messages.splice(lastIdx, 0, { role:'user', content: materials });
                else messages.push({ role:'user', content: materials });
              } else {
                messages = [{ role:'user', content: materials }];
              }
            }catch{}
          } else {
            requestAIReply._lastAttachments = [];
          }
        }catch{ requestAIReply._lastAttachments = []; }
      }
    }catch{}
    // Build message history from Graph log for this coworker
    let messages = [];
    try{
      const entries = (window.graph && typeof window.graph.getMessages==='function') ? (window.graph.getMessages(ownerId) || []) : [];
      const mapRole = (m)=> (m?.who === 'user' ? 'user' : (m?.who === 'assistant' ? 'assistant' : 'system'));
      const mapped = entries.map(m => ({ role: mapRole(m), content: String(m.text||'') }));
      // No client-side clipping: include full history and content
      messages = mapped;
      // If this was triggered from the panel, include the composed text (with attachments) as the latest user turn
      const extra = (ctx && typeof ctx.text === 'string') ? ctx.text : '';
      if (extra){
        const last = messages[messages.length-1];
        const raw = String(extra);
        if (!last || last.content !== raw){ messages = messages.concat([{ role:'user', content: raw }]); }
      }
      // Ensure last turn includes the just received user/assistant? The incoming to coworker was an assistant or user? In our model, payload.who was 'assistant' for received.
      // No extra append needed because transmitOnConnection already added it to Graph before this call.
    }catch{}
    // After building history, inject materials block if attachments exist and not already present
    try{
      const combined = Array.isArray(requestAIReply._lastAttachments) ? requestAIReply._lastAttachments : [];
      if (combined.length){
        const hasMaterials = (Array.isArray(messages)?messages:[]).some(m => m && m.role==='user' && /Bilaga:/i.test(String(m.content||'')));
        if (!hasMaterials){
          const joinSep = '\n\n---\n\n';
          const blocks = combined.map((it, i)=>{
            const head = `[${i+1}] ${String(it.name||'Bilaga').trim()} (${Number(it.chars||0)} tecken)`;
            const body = String(it.text||'');
            return head + (body ? `\n${body}` : '');
          }).filter(Boolean);
          const materials = 'Bilaga:\n' + blocks.join(joinSep);
          if (Array.isArray(messages) && messages.length){
            const lastIdx = messages.length - 1;
            if (messages[lastIdx] && messages[lastIdx].role === 'user') messages.splice(lastIdx, 0, { role:'user', content: materials });
            else messages.push({ role:'user', content: materials });
          } else {
            messages = [{ role:'user', content: materials }];
          }
        }
      }
    }catch{}
    // If user explicitly asks to show/quote a template/structure, guide the model to include short quotes with [n,sida]
    let quoteMode = false;
    try{
      const lastUserMsg = [...(Array.isArray(messages)?messages:[])].reverse().find(m=>m && m.role==='user' && !/^\s*Bilaga:/i.test(String(m.content||'')));
      const q = String(lastUserMsg?.content||'').toLowerCase();
      if (q && (q.includes('visa') || q.includes('återge') || q.includes('aterge')) && (q.includes('mall') || q.includes('struktur'))) quoteMode = true;
    }catch{}
    if (quoteMode){
      const extraGuide = 'ANVISNING: När användaren ber att visa/återge hur en mall/struktur ser ut enligt bilagan, gör så här: 1) Ge en kort punktlista över sektioner (sammanfattade i egna ord), 2) Lägg in korta ordagranna citat ≤ 200 tecken med [n,sida] där relevant, 3) Om du behöver fler sidor, skriv exakt MER_SIDOR.';
      systemPrompt = (systemPrompt ? (systemPrompt + '\n\n') : '') + extraGuide;
    }
    // Coerce unsupported/legacy model aliases to a safe default, but preserve gpt-5* defaults
    try{
      const ml = (model||'').toLowerCase();
      // If empty or clearly invalid, fall back to gpt-5-mini as default
      if (!ml || ml === 'mini') model = 'gpt-5-mini';
      // Keep gpt-5 family as-is; map old experimental aliases to gpt-5-mini
      else if (ml === '3o' || ml === 'o3') model = 'gpt-5-mini';
      // Otherwise, leave user-selected models untouched
    }catch{}
  // No client-side clipping
  const body = { model, max_tokens: maxTokens, noClip: true };
  // If we have attachments, enable simple pagewise mode (one page per step)
  let hasMaterials = false;
  try { hasMaterials = Array.isArray(requestAIReply._lastAttachments) && requestAIReply._lastAttachments.length > 0; } catch {}
  let _pgStart = 1;
  // Simplified: no UI or stored setting; enable pgwise with default window size (backend default)
  if (hasMaterials) body.pgwise = { enable: true, startPage: _pgStart };
  if (systemPrompt) body.system = systemPrompt;
    if (messages && messages.length) body.messages = messages;
    if (apiKey) body.apiKey = apiKey;
  // Author label used for replies from this coworker
  const author = (()=>{ try{ const host=document.querySelector(`.fab[data-id="${ownerId}"]`); return (host?.dataset?.displayName)||'Assistant'; }catch{ return 'Assistant'; } })();
  // Determine sender display name for the inbound (user) message from ctx.sourceId
  const senderName = (()=>{ try{ const src = ctx?.sourceId ? document.querySelector(`.fab[data-id="${ctx.sourceId}"]`) : null; return (src?.dataset?.displayName)|| (src?.dataset?.type==='user'?'User':'Incoming'); }catch{ return 'Incoming'; } })();
  setThinking(ownerId, true);
  // Debug: log request metadata (DO NOT log API keys) to help diagnose 400/5xx responses
  try{
    const redacted = Object.assign({}, body);
    if (redacted.apiKey) redacted.apiKey = '<REDACTED>';
    console.debug('[requestAIReply] apiBase=%s payload=%o', apiBase || '<auto>', redacted);
  }catch(e){}
  const sendOnce = (payload)=> fetch(apiBase + '/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(async r=>{
      const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (!r.ok) {
        if (/application\/json/i.test(String(ct||''))) {
          try{ const errData = await r.json(); const msg = (errData && (errData.error||errData.message||errData.hint)) || ('HTTP '+r.status); throw new Error(String(msg)); }
          catch{ throw new Error('HTTP '+r.status); }
        } else {
          try{ const t = await r.text(); throw new Error('HTTP '+r.status+': '+String(t||'').slice(0,200)); }
          catch{ throw new Error('HTTP '+r.status); }
        }
      }
      if (!/application\/json/i.test(String(ct||''))) { const _ = await r.text().catch(()=>null); throw new Error('Oväntat svar (ej JSON)'); }
      return r.json();
  });
  let triedFallback = false;
  const tryRequest = (payload)=> sendOnce(payload).catch(err=>{
    const em = String(err?.message||'').toLowerCase();
    // Heuristic: if the error seems model-related, try a safer fallback once
    if (!triedFallback && (em.includes('model') || em.includes('invalid') || em.includes('not found'))){
      triedFallback = true;
      try{
        const fallbackBody = Object.assign({}, payload, { model: 'gpt-4o-mini' });
        console.warn('[requestAIReply] Falling back to model gpt-4o-mini due to error:', err?.message||err);
        return sendOnce(fallbackBody);
      }catch{}
    }
    throw err;
  });
  // Pagewise auto-continue: if model asks for MER_SIDOR and backend indicates more pages, request next window.
  const handleFinal = (data)=>{
    let reply = '';
    try{ reply = String(data?.reply || ''); }catch{ reply = ''; }
    if (!reply) reply = data?.error ? `Fel: ${data.error}` : 'Tomt svar från AI';
    // Remove any stray MER_SIDOR token from final display
    try{ reply = reply.replace(/\bMER_SIDOR\b/g, '').trim(); }catch{}
    const citations = (function(){ try{ return Array.isArray(data?.citations) ? data.citations : []; }catch{ return []; } })();
    let ts = Date.now();
    const meta = { ts, citations };
    try{ if (Array.isArray(requestAIReply._lastAttachments)) meta.attachments = requestAIReply._lastAttachments; }catch{}
    try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, reply, 'assistant', meta); ts = entry?.ts || ts; meta.ts = ts; } }catch{}
    try{ if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', meta); }catch{}
    try{ const routedMeta = { author, who:'assistant', ts, citations }; if(window.routeMessageFrom) window.routeMessageFrom(ownerId, reply, routedMeta); }catch{}
  // New: append reply into any board section that has this coworker selected as its Input (Inmatning)
    try{
      const secs = document.querySelectorAll('.panel.board-section');
      secs.forEach(sec=>{
        try{
          const sid = sec?.dataset?.sectionId || '';
          if (!sid) return;
          const raw = localStorage.getItem(`sectionParking:${sid}`);
          const cfg = raw ? (JSON.parse(raw)||{}) : {};
          // 1) Input append
          if (cfg && String(cfg.input||'') === String(ownerId)){
            // Avoid duplicate if this coworker is already cabled directly to this section (routeMessageFrom already appended)
            let connected = false;
            try{ connected = (window.state?.connections||[]).some(c => ( (c.fromId===ownerId && c.toId===sid) || (c.toId===ownerId && c.fromId===sid) )); }catch{}
            if (!connected && window.appendToSection) window.appendToSection(sid, reply);
          }
          // 2) Improver update: if section awaits improvement from this coworker, update that specific question text
          let pendingImproveIdx = null;
          if (cfg && String(cfg.improver||'') === String(ownerId)){
            if (sec?.dataset?.pendingImprove !== undefined){ pendingImproveIdx = Math.max(0, Number(sec.dataset.pendingImprove)||0); try{ delete sec.dataset.pendingImprove; }catch{} }
            // Cross-tab marker from full-screen view
            if (pendingImproveIdx==null){ try{ const v = localStorage.getItem(`sectionPendingImprove:${sid}`); if (v!=null){ pendingImproveIdx = Math.max(0, Number(v)||0); localStorage.removeItem(`sectionPendingImprove:${sid}`); } }catch{} }
          }
          if (pendingImproveIdx!=null){
            try{
              const key = `sectionExercises:${sid}`;
              const arr = JSON.parse(localStorage.getItem(key)||'[]')||[];
              if (arr[pendingImproveIdx]){
                arr[pendingImproveIdx].q = String(reply||'').trim() || arr[pendingImproveIdx].q;
                localStorage.setItem(key, JSON.stringify(arr));
                // cross-tab notify and same-tab global event
                try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
                try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
                // trigger re-render of focus UI if visible
                sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } }));
              }
            }catch{}
          }
        }catch{}
      });
    }catch{}
  // Also handle feedback updates when full-screen flagged an index but section isn’t mounted
    try{
      const all = document.querySelectorAll('.panel.board-section');
      all.forEach(sec=>{
        try{
          const sid = sec?.dataset?.sectionId || '';
          if (!sid) return;
          const raw = localStorage.getItem(`sectionParking:${sid}`) || '{}';
          const cfg = JSON.parse(raw||'{}')||{};
          if (!cfg || String(cfg.grader||'') !== String(ownerId)) return;
          // collect pending feedback idx: dataset flag or cross-tab key
          let idx = null;
          if (sec?.dataset?.pendingFeedback !== undefined){ idx = Math.max(0, Number(sec.dataset.pendingFeedback)||0); try{ delete sec.dataset.pendingFeedback; }catch{} }
          if (idx==null){ try{ const v = localStorage.getItem(`sectionPendingFeedback:${sid}`); if (v!=null){ idx = Math.max(0, Number(v)||0); localStorage.removeItem(`sectionPendingFeedback:${sid}`); } }catch{} }
          if (idx==null) return;
          const key = `sectionExercises:${sid}`;
          const arr = JSON.parse(localStorage.getItem(key)||'[]')||[];
          if (arr[idx]){
            arr[idx].fb = (arr[idx].fb ? (arr[idx].fb + '\n\n') : '') + String(reply||'');
            localStorage.setItem(key, JSON.stringify(arr));
            try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
            try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
            sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } }));
          }
        }catch{}
      });
    }catch{}
    // Also handle improvement updates cross-tab when no section element is needed
    try{
      // Iterate localStorage for pending improve markers
      const keys = Object.keys(localStorage || {}).filter(k => /^sectionPendingImprove:/.test(k));
      for (const k of keys){
        try{
          const sid = k.replace(/^sectionPendingImprove:/, '');
          const raw = localStorage.getItem(`sectionParking:${sid}`) || '{}';
          const cfg = JSON.parse(raw||'{}')||{};
          if (!cfg || String(cfg.improver||'') !== String(ownerId)) continue;
          const v = localStorage.getItem(k);
          if (v==null) continue;
          const idx = Math.max(0, Number(v)||0);
          // apply update
          const keyEx = `sectionExercises:${sid}`;
          const arr = JSON.parse(localStorage.getItem(keyEx)||'[]')||[];
          if (arr[idx]){
            arr[idx].q = String(reply||'').trim() || arr[idx].q;
            localStorage.setItem(keyEx, JSON.stringify(arr));
            // remove marker
            localStorage.removeItem(k);
            // cross-tab notify and same-tab event
            try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
            try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
            // if section is present, inform UI
            const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`);
            if (sec) sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } }));
          }
        }catch{}
      }
    }catch{}
  };
  const doStep = (pgStart, step)=>{
    const payload = Object.assign({}, body);
    if (payload.pgwise && typeof pgStart === 'number') payload.pgwise.startPage = pgStart;
    return tryRequest(payload).then(data=>{
      const pw = data && data.pagewise;
      const wantsMore = !!(pw && pw.enabled && pw.modelRequestedMore && pw.hasMore);
      if (wantsMore && step < 5){
        // Don't show this intermediate reply (likely contains MER_SIDOR); immediately fetch next window.
        const nextStart = Number(pw.nextStartPage)|| (pgStart+1);
        return doStep(nextStart, step+1);
      }
      // Final step: render normally
      handleFinal(data);
      return data;
    });
  };
  doStep(_pgStart, 0).catch(err=>{
      const msg = 'Fel vid AI-förfrågan: ' + (err?.message||String(err));
      // Show a toast with the error and a tip to increase tokens
      try{
        (function(){
          const txt = String(msg + '\nTips: Höj "Max tokens" i CoWorker-inställningarna om svaret klipps.');
          let cont = document.getElementById('toastContainer');
          if (!cont){
            cont = document.createElement('div'); cont.id='toastContainer';
            Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' });
            document.body.appendChild(cont);
          }
          const t = document.createElement('div');
          t.className='toast';
          Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'10px 12px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', maxWidth:'420px', fontSize:'14px', whiteSpace:'pre-wrap' });
          t.textContent = txt;
          cont.appendChild(t);
          setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 300ms'; setTimeout(()=>{ t.remove(); if (cont && !cont.children.length) cont.remove(); }, 320); }catch{} }, 3500);
        })();
      }catch{}
      let ts = Date.now();
      try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, msg.startsWith('Fel')?author:senderName, msg, 'assistant'); ts = entry?.ts || ts; } }catch{}
      try{ if(window.receiveMessage) window.receiveMessage(ownerId, msg, 'assistant', { ts }); }catch{}
  }).finally(()=>{
    // Delay clearing busy a bit to avoid flicker when follow-up work kicks in
    setTimeout(()=>{ try{ setThinking(ownerId, false); }catch{} }, 700);
  });
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
      // Also support click-to-select and right-click to delete
      el.addEventListener('click', (e)=>{
        e.stopPropagation();
        // clear previous selection
        try{ if (_selectedConn && _selectedConn !== conn){ _selectedConn.pathEl.style.filter=''; _selectedConn.pathEl.setAttribute('stroke-width','3'); } }catch{}
        _selectedConn = conn;
        try{ conn.pathEl.setAttribute('stroke-width','5'); conn.pathEl.style.filter='drop-shadow(0 2px 10px rgba(124,92,255,0.45))'; }catch{}
      });
      el.addEventListener('contextmenu', (e)=>{
        e.preventDefault(); e.stopPropagation();
        removeConnection(conn);
        btn.style.display='none';
        if (_selectedConn === conn) _selectedConn = null;
      });
    };
    bindHover(conn.hitEl || conn.pathEl);
    if (conn.hitEl && conn.pathEl && conn.hitEl !== conn.pathEl) bindHover(conn.pathEl);
  }

  // Global keyboard handler: Delete/Backspace removes selected connection
  document.addEventListener('keydown', (e)=>{
    try{
      if ((e.key === 'Delete' || e.key === 'Backspace') && _selectedConn){
        e.preventDefault();
        removeConnection(_selectedConn);
        _selectedConn = null;
        const btn = getConnDeleteBtn(); if (btn) btn.style.display='none';
      }
      // Esc clears selection
      if (e.key === 'Escape' && _selectedConn){
        _selectedConn.pathEl.style.filter='';
        _selectedConn.pathEl.setAttribute('stroke-width','3');
        _selectedConn = null;
      }
    }catch{}
  });

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
  // Show the cable above panels while dragging for better visibility
  const s = svg && svg();
  const prevZ = s ? s.style.zIndex : '';
  if (s) s.style.zIndex = '12000';
  // Don't intercept pointer events with the temporary path
  try{ tmpPath.style.pointerEvents = 'none'; }catch{}
    const fromIsIn = fromCp.classList.contains('io-in'); const fromIsOut = fromCp.classList.contains('io-out');
    const fromType = fromEl?.dataset?.type; const fromIsUser = (fromType==='user'); const fromIsCoworker = (fromType==='coworker');
    const baseFilter = (cp) => cp !== fromCp && (cp.closest('.fab, .panel, .panel-flyout') !== fromEl);
    const cpFilter = (cp) => baseFilter(cp) && ( fromIsOut ? cp.classList.contains('io-in') : fromIsIn ? cp.classList.contains('io-out') : true );
    const move = (e)=>{ const p = window.pointFromEvent(e); const a = anchorOf(fromEl, fromCp); drawPath(tmpPath, a.x, a.y, p.x, p.y);
      let near = findClosestConnPoint(p.x, p.y, 18, cpFilter);
      if (!near && (fromIsUser || fromIsCoworker)) near = findClosestConnPoint(p.x, p.y, 18, baseFilter);
      if (lastHover && lastHover !== near) lastHover.classList.remove('hover'); if (near && lastHover !== near) near.classList.add('hover'); lastHover = near; };
    const up = (e)=>{ 
      window.removeEventListener('pointermove', move); 
      window.removeEventListener('pointerup', up); 
      finalizeConnection(fromEl, fromCp, e); 
      tmpPath.remove(); 
      if (lastHover) lastHover.classList.remove('hover'); 
      // Restore SVG z-index after finishing the drag
      if (s) s.style.zIndex = prevZ || '';
    };
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
    // If one side is a board section, ensure it has a stable sectionId attribute
    try{
      const a = document.querySelector(`[data-id="${fromId}"]`) || document.querySelector(`[data-section-id="${fromId}"]`);
      const b = document.querySelector(`[data-id="${toId}"]`) || document.querySelector(`[data-section-id="${toId}"]`);
      const ensureSecId = (el, fallbackIdx)=>{
        if (!el) return;
        if (el.classList.contains('panel') && el.classList.contains('board-section')){
          if (!el.dataset.sectionId){ el.dataset.sectionId = fallbackIdx || ('s'+Math.random().toString(36).slice(2,6)); }
        }
      };
      ensureSecId(a);
      ensureSecId(b);
    }catch{}
  }

  // Expose minimal API for other modules
  window.makeConnPointInteractive = makeConnPointInteractive;
  window.updateConnectionsFor = updateConnectionsFor;
  window.routeMessageFrom = routeMessageFrom;
  window.transmitOnConnection = transmitOnConnection;

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
  // Expose so panels can trigger self-replies
  window.requestAIReply = requestAIReply;
})();
