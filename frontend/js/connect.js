// Connection creation, path drawing, and delete UI (classic)
// Responsibility: Äga all logik för att rita/underhålla SVG-kablar och interaktion runt skapa/ta bort.
// No node/panel creation here; panel-UI lever i panels.js och internet-node.js.
// SOLID hints:
// - S: Dela gärna i tre små delar vid refactor: (1) Geometry/Path, (2) Interaction/Drag, (3) Router/Transmit.
// - O: Lägg nya visuella effekter som separata helpers utan att röra routing.
// - I: Exportera ett litet API (startConnection, finalizeConnection, updateConnectionsFor, routeMessageFrom).
// - D: requestAIReply/internet-reply bör vara injicerbara beroenden (t.ex. window.requestAIReply) i stället för direkt fetch.
console.log('[DEBUG] connect.js loaded with tool debugging enabled');
(function(){
  const svg = () => window.svg;
  const { ensureDefs, makePath, makeHitPath, drawPath, triggerFlowEffect } = (window.svgHelpers||{});
  // Per-target queue: ensure a node waits for the downstream node to finish before sending the next payload
  window.__nodeQueues = window.__nodeQueues || new Map();
  function enqueueNodeWork(targetId, task){
    try{
      const q = window.__nodeQueues.get(targetId) || Promise.resolve();
      const next = q.then(async ()=>{ try{ await task(); }catch(e){
        // Ignore benign aborts to reduce console noise when streams are canceled or superseded
        try{ if (e && (e._aborted || e.name==='AbortError' || /\babort(ed)?\b/i.test(String(e.message||'')))) return; }catch{}
        console.warn('[queue] task error for', targetId, e);
      } });
      // Keep chain; don't drop errors to avoid breaking sequence
      window.__nodeQueues.set(targetId, next.catch(()=>{}));
      return next;
    }catch(e){ console.warn('[queue] enqueue failed', e); try{ return Promise.resolve().then(()=>task()); }catch{ return Promise.resolve(); } }
  }
  // Track a selected connection for keyboard deletion
  let _selectedConn = null;
  // simulation toggle
  // AI-simulering borttagen
  // path helpers
  /** Ensure the gradient defs exist once per page. */
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

  /** Briefly animate a connection path to simulate data flow. */
  // triggerFlowEffect provided by helpers

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
  // Smart chunking for large payloads going into coworker nodes to avoid 400s
  try{
    const host = document.querySelector(`.fab[data-id="${targetId}"]`);
  const isCoworkerTarget = !!(host && host.dataset.type === 'coworker');
  const isInternetTarget = !!(host && host.dataset.type === 'internet');
  const srcHost = document.querySelector(`.fab[data-id="${sourceId}"]`);
  const isCoworkerSource = !!(srcHost && srcHost.dataset.type === 'coworker');
  const isInternetSource = !!(srcHost && srcHost.dataset.type === 'internet');
  const isUserSource = !!(srcHost && srcHost.dataset.type === 'user');
    // Settings-driven backpressure & chunkning (remove controller):
    // Read coworker settings of source node (controls) and apply when sending to another coworker
    const readNodeSettings = (id)=>{ try{ const raw = localStorage.getItem(`nodeSettings:${id}`); return raw ? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
    const srcSettings = readNodeSettings(sourceId);
  const { approxTokens, estimateChunkBudget, makeLineBatches, smartChunk } = (window.chunking||{});
  // smartChunk now provided by helpers
    const maybeChunk = ()=>{
  // Determine if target is a board section
  const targetIsSection = !!document.querySelector(`.panel.board-section[data-section-id="${targetId}"]`);
  // Backpressure & chunking are controlled by source settings
      const chunkEnabled = !!srcSettings.chunkingEnabled;
      const allowNodeToNode = (srcSettings.chunkNodeToNode!==undefined) ? !!srcSettings.chunkNodeToNode : true;
  const allowToSection = (srcSettings.chunkToSection!==undefined) ? !!srcSettings.chunkToSection : true;
  const useLines = (srcSettings.chunkUseLines!==undefined) ? !!srcSettings.chunkUseLines : true;
  const useNumbering = !!srcSettings.chunkUseNumbering;
      const useTokens = !!srcSettings.chunkUseTokens;
      const batchSize = Math.max(1, Math.min(50, Number(srcSettings.chunkBatchSize||3)));
      const tokenSize = Math.max(200, Math.min(2000, Number(srcSettings.chunkTokenSize||800)));
      // 1) Numbered chunking (strongest) → strict backpressure per numbered block
  if ((isCoworkerSource || isInternetSource || isUserSource) && chunkEnabled && useNumbering && window.chunking && typeof window.chunking.splitByNumbering==='function' && (
      (allowNodeToNode && (isCoworkerTarget || isInternetTarget)) || (allowToSection && targetIsSection)
    )){
        let parts = window.chunking.splitByNumbering(text);
        if (Array.isArray(parts) && parts.length>1){
          // Optional: trim any preamble before the first numbered item for downstream forwarding only
          try{
            const trimPre = !!srcSettings.chunkTrimNumberedPreamble;
            if (trimPre){
              const isNumHead = (s)=>/^\s*\d{1,3}[\.)\:\-–—]\s+/.test(String(s||''));
              if (parts.length && !isNumHead(parts[0])) parts = parts.slice(1);
            }
          }catch{}
          enqueueNodeWork(targetId, async ()=>{
            for (let i=0;i<parts.length;i++){
              const part = parts[i];
              const payloadPart = part;
              const ts2 = Date.now();
              const meta2 = Object.assign({}, routedMeta, { ts: ts2 });
              try { conn.pathEl?.dispatchEvent(new CustomEvent('connection:transmit', { detail: { sourceId, text: payloadPart, author, who: whoForTarget, ts: ts2 } })); }catch{}
              try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', payloadPart, whoForTarget, meta2); }catch{}
              try{ if(window.receiveMessage) window.receiveMessage(targetId, payloadPart, whoForTarget, meta2); }catch{}
      // Append to section per chunk when target is a board section and allowed
      try{ if (targetIsSection && allowToSection && window.appendToSection) window.appendToSection(targetId, payloadPart); }catch{}
              try{
                const tType = host?.dataset?.type;
                if (tType === 'coworker' && window.requestAIReply){ await window.requestAIReply(targetId, { text: payloadPart, sourceId }); }
                else if (tType === 'internet' && window.requestInternetReply){ await window.requestInternetReply(targetId, { text: payloadPart, sourceId }); }
              }catch(e){ if (e && (e._aborted || e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))) break; }
            }
          });
          return true;
        }
      }
      // 2) Line chunking
  if ((isCoworkerSource || isInternetSource || isUserSource) && chunkEnabled && useLines && (
      (allowNodeToNode && (isCoworkerTarget || isInternetTarget)) || (allowToSection && targetIsSection)
    )){
        const parts = makeLineBatches(text, batchSize);
        if (Array.isArray(parts) && parts.length>1){
          enqueueNodeWork(targetId, async ()=>{
            for (let i=0;i<parts.length;i++){
              const part = parts[i];
              const payloadPart = part;
              const ts2 = Date.now();
              const meta2 = Object.assign({}, routedMeta, { ts: ts2 });
              try { conn.pathEl?.dispatchEvent(new CustomEvent('connection:transmit', { detail: { sourceId, text: payloadPart, author, who: whoForTarget, ts: ts2 } })); }catch{}
              try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', payloadPart, whoForTarget, meta2); }catch{}
              try{ if(window.receiveMessage) window.receiveMessage(targetId, payloadPart, whoForTarget, meta2); }catch{}
      try{ if (targetIsSection && allowToSection && window.appendToSection) window.appendToSection(targetId, payloadPart); }catch{}
              try{
                const tType = host?.dataset?.type;
                if (tType === 'coworker' && window.requestAIReply){ await window.requestAIReply(targetId, { text: payloadPart, sourceId }); }
                else if (tType === 'internet' && window.requestInternetReply){ await window.requestInternetReply(targetId, { text: payloadPart, sourceId }); }
              }catch(e){ if (e && (e._aborted || e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))) break; }
            }
          });
          return true;
        }
      }
      // Token-based chunking (optional): when enabled and oversized for configured tokenSize
  if (chunkEnabled && useTokens && !isUserSource && (
      (allowNodeToNode && (isCoworkerTarget || isInternetTarget)) || (allowToSection && targetIsSection)
    )){
        const totalT = approxTokens(text);
        const maxT = tokenSize || estimateChunkBudget();
        if (totalT > maxT){
          const parts = smartChunk(text, maxT);
          if (!parts || parts.length<=1) return false;
          enqueueNodeWork(targetId, async ()=>{
            for (let i=0;i<parts.length;i++){
              const part = parts[i];
              const payloadPart = part;
              const ts2 = Date.now();
              const meta2 = Object.assign({}, routedMeta, { ts: ts2 });
              try { conn.pathEl?.dispatchEvent(new CustomEvent('connection:transmit', { detail: { sourceId, text: payloadPart, author, who: whoForTarget, ts: ts2 } })); }catch{}
              try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', payloadPart, whoForTarget, meta2); }catch{}
              try{ if(window.receiveMessage) window.receiveMessage(targetId, payloadPart, whoForTarget, meta2); }catch{}
      try{ if (targetIsSection && allowToSection && window.appendToSection) window.appendToSection(targetId, payloadPart); }catch{}
              try{
                const tType = host?.dataset?.type;
                if (tType === 'coworker' && window.requestAIReply){ await window.requestAIReply(targetId, { text: payloadPart, sourceId }); }
                else if (tType === 'internet' && window.requestInternetReply){ await window.requestInternetReply(targetId, { text: payloadPart, sourceId }); }
              }catch(e){ if (e && (e._aborted || e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))) break; }
            }
          });
          return true;
        }
      }
      // Legacy fallback: auto token chunking when dramatically oversized and no explicit tokens setting
      const totalT = approxTokens(text);
      const budget = estimateChunkBudget();
      if (totalT <= Math.max(1000, Math.floor(budget*1.25))) return false;
      const parts = smartChunk(text);
      if (!parts || parts.length<=1) return false;
      enqueueNodeWork(targetId, async ()=>{
        for (let i=0;i<parts.length;i++){
          const part = parts[i];
          const payloadPart = part;
          const ts2 = Date.now();
          const meta2 = Object.assign({}, routedMeta, { ts: ts2 });
          try { conn.pathEl?.dispatchEvent(new CustomEvent('connection:transmit', { detail: { sourceId, text: payloadPart, author, who: whoForTarget, ts: ts2 } })); }catch{}
          try{ if(window.graph) window.graph.addMessage(targetId, author||'Incoming', payloadPart, whoForTarget, meta2); }catch{}
          try{ if(window.receiveMessage) window.receiveMessage(targetId, payloadPart, whoForTarget, meta2); }catch{}
          try{ if (targetIsSection && allowToSection && window.appendToSection) window.appendToSection(targetId, payloadPart); }catch{}
          try{
            const tType = host?.dataset?.type;
            if (tType === 'coworker' && window.requestAIReply){ await window.requestAIReply(targetId, { text: payloadPart, sourceId }); }
            else if (tType === 'internet' && window.requestInternetReply){ await window.requestInternetReply(targetId, { text: payloadPart, sourceId }); }
          }catch(e){ if (e && (e._aborted || e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))) break; }
        }
      });
      return true;
    };
    if (maybeChunk()) return;
  }catch{}
  // Default single-shot route (queued)
  enqueueNodeWork(targetId, async ()=>{
      if(window.graph) window.graph.addMessage(targetId, author||'Incoming', text, whoForTarget, routedMeta);
      if(window.receiveMessage) window.receiveMessage(targetId, text, whoForTarget, routedMeta);
      // If the target is a board section, append content there as well (unless caller streamed deltas already)
      const targetEl = document.querySelector(`.panel.board-section[data-section-id="${targetId}"]`);
      if (targetEl && window.appendToSection){
        const skip = !!(payload && payload.meta && payload.meta.skipSectionFinalAppend);
        if (!skip){
          // Simple final append; section streaming already handled during coworker stream
          window.appendToSection(targetId, text);
        }
      }
      // If the receiving node is a coworker/internet, await backend reply to enforce sequencing
      const host2 = document.querySelector(`.fab[data-id="${targetId}"]`);
      if (host2 && host2.dataset.type === 'coworker' && window.requestAIReply) await window.requestAIReply(targetId, { text: String(text), sourceId, via: `${conn.fromId}->${conn.toId}` });
      if (host2 && host2.dataset.type === 'internet' && window.requestInternetReply) await window.requestInternetReply(targetId, { text: String(text), sourceId, via: `${conn.fromId}->${conn.toId}` });
  });
  }

  // Backend integration: request an AI reply for a coworker node
  function requestAIReply(ownerId, ctx){
    console.log('[DEBUG] requestAIReply called for ownerId:', ownerId, 'ctx:', ctx);
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
  // Track in-flight requests per owner for cancel support
  window.__aiInflight = window.__aiInflight || new Map();
  const inflight = window.__aiInflight;
  // If an older request is still running, optionally keep it or cancel it; we keep both with unique controllers
  const controller = new AbortController();
  const signal = controller.signal;
  try{ inflight.set(ownerId, controller); }catch{}
    // Gather settings from coworker panel if present, else from Graph/localStorage
  let model = 'gpt-4o-mini';
  let modelPy = '';
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
            const single = (combined.length === 1);
            const guide = (single
              ? 'Material för denna fråga (endast 1 bilaga: använd alltid [1,sida] direkt efter varje påstående som stöds, t.ex. [1,7]; lägg fullständiga källor längst ned):\n'
              : 'Material för denna fråga (använd [n] eller [n,sida] i svaret, t.ex. [1,7], där n matchar listan; lägg fullständiga källor längst ned):\n'
            ) + lines.join('\n');
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
        if (s.modelPy) modelPy = s.modelPy;
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
            const single = (combined.length === 1);
            const guide = (single
              ? 'Material för denna fråga (endast 1 bilaga: använd alltid [1,sida] direkt efter varje påstående som stöds, t.ex. [1,7]; lägg fullständiga källor längst ned):\n'
              : 'Material för denna fråga (använd [n] eller [n,sida] i svaret, t.ex. [1,7], där n matchar listan; lägg fullständiga källor längst ned):\n'
            ) + lines.join('\n');
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
      // If empty or clearly invalid, fall back to gpt-4o-mini as default
      if (!ml || ml === 'mini') model = 'gpt-4o-mini';
      // Keep gpt-4 family as-is; map old experimental aliases to gpt-4o-mini
      else if (ml === '3o' || ml === 'o3') model = 'gpt-4o-mini';
      // Otherwise, leave user-selected models untouched
    }catch{}
  // No client-side clipping
  const body = { model, max_tokens: maxTokens, noClip: true };
  let toolsEnabled = false;
  // Optional: expose run_python tool to the model when enabled in node settings
  try{
    const sRaw = localStorage.getItem(`nodeSettings:${ownerId}`);
    const sCfg = sRaw ? (JSON.parse(sRaw)||{}) : {};
    // Default OFF: require explicit enableTools === true to turn on tools
    toolsEnabled = (sCfg.enableTools === true);
    if (toolsEnabled){
      // Use the dedicated Python model when tools are active; default to a stable Python-capable model
      body.model = sCfg.modelPy || 'gpt-4o-mini';
      // Advertise the Python tool
      body.tools = [
        {
          type: 'function',
          function: {
            name: 'run_python',
            description: 'Kör Pythonkod och returnerar resultatet som text. Använd print() för att skriva ut det slutliga svaret så att det visas i stdout.',
            parameters: {
              type: 'object',
              properties: { code: { type: 'string', description: 'Pythonkod att köra, inklusive print() för output' } },
              required: ['code']
            }
          }
        }
      ];
      // Optional: force the tool for this turn
      if (sCfg.forcePython){
        body.tool_choice = { type: 'function', function: { name: 'run_python' } };
      }
      // Hint the model to actually print final answers
      const toolHint = 'Om en uppgift innebär beräkning, lista, filtrering eller kod, använd verktyget run_python. Skriv ut slutresultatet med print() så att det syns i stdout.';
      systemPrompt = systemPrompt ? (systemPrompt + '\n\n' + toolHint) : toolHint;
    }
  }catch{}
  // If we have attachments, enable simple pagewise mode (one page per step)
  let hasMaterials = false;
  try { hasMaterials = Array.isArray(requestAIReply._lastAttachments) && requestAIReply._lastAttachments.length > 0; } catch {}
  // Detect origin to decide if we still want streaming despite attachments
  let fromCoworker = false; try{ const srcEl = ctx && ctx.sourceId ? document.querySelector(`.fab[data-id="${ctx.sourceId}"]`) : null; fromCoworker = !!(srcEl && srcEl.dataset.type==='coworker'); }catch{}
  // Also detect if the sender is a board section (e.g., Exercises/Sections flows)
  let fromSection = false; try{ const secEl = ctx && ctx.sourceId ? document.querySelector(`.panel.board-section[data-section-id="${ctx.sourceId}"]`) : null; fromSection = !!secEl; }catch{}
  let _pgStart = 1;
  // Enable pgwise only when not coming from a coworker or a board section (keep streaming for section-sourced flows)
  if (hasMaterials && !fromCoworker && !fromSection) body.pgwise = { enable: true, startPage: _pgStart };
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
    console.log('[DEBUG] About to make request. apiBase=%s payload=%o', apiBase || '<auto>', redacted);
    console.log('[DEBUG] API key present:', !!(body.apiKey));
  }catch(e){}
  // JSON (non-streaming) request helper
  const sendJSONOnce = (payload)=> {
    console.log('[DEBUG] sendJSONOnce called with payload:', payload);
    return fetch(apiBase + '/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal
    }).then(async r=>{
      console.log('[DEBUG] sendJSONOnce response status:', r.status);
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
      const jsonData = await r.json();
      console.log('[DEBUG] sendJSONOnce JSON response:', jsonData);
      return jsonData;
    });
  };
  // NDJSON streaming helper (expects application/x-ndjson)
  const sendStreamOnce = async (payload)=>{
    const res = await fetch(apiBase + '/chat/stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal
    });
    const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (!res.ok) {
      // try to surface JSON error if present
      if (/application\/json/i.test(String(ct||''))) {
        let errData=null; try{ errData = await res.json(); }catch{}
        const msg = (errData && (errData.error||errData.message||errData.hint)) || ('HTTP '+res.status);
        throw new Error(String(msg));
      } else {
        let txt=''; try{ txt = await res.text(); }catch{}
        throw new Error('HTTP '+res.status+': '+String((txt||'')).slice(0,200));
      }
    }
    if (!/x-ndjson/i.test(String(ct||''))) {
      // Not a stream; let caller fallback to JSON path
      throw new Error('NO_STREAM');
    }
    // Live UI: set up a temporary streaming bubble if panel is open
    const findPanelList = ()=>{
      try{ const panel = [...document.querySelectorAll('.panel-flyout')].find(p => p.dataset.ownerId === ownerId); if(!panel) return null; const list = panel.querySelector('.messages'); if(!list) return null; return { panel, list }; }catch{ return null; }
    };
    const ensureStreamUI = ()=>{
      const ctx = findPanelList(); if (!ctx) return null;
      // Reuse existing streaming row if it's still attached
      if (ensureStreamUI._el && ensureStreamUI._el.row && ensureStreamUI._el.row.isConnected) return ensureStreamUI._el;
      const row=document.createElement('div'); row.className='message-row';
      const group=document.createElement('div'); group.className='msg-group';
      const authorEl=document.createElement('div'); authorEl.className='author-label'; authorEl.textContent = author || 'Assistant';
      const b=document.createElement('div'); b.className='bubble';
      const textEl=document.createElement('div'); textEl.className='msg-text'; textEl.textContent='';
      b.appendChild(textEl);
      const meta=document.createElement('div'); meta.className='subtle'; meta.style.marginTop='6px'; meta.style.opacity='0.8'; meta.style.textAlign='left'; meta.textContent = '';
      b.appendChild(meta);
      group.appendChild(authorEl); group.appendChild(b); row.appendChild(group); ctx.list.appendChild(row);
      // Autoscroll guard: only scroll if user is at bottom or inactive for 5s
      try{
        wireAutoscrollGuard(ctx.list);
        const shouldScroll = shouldAutoscrollNow(ctx.list);
        if (shouldScroll){ ctx.list.__autoScrolling = true; ctx.list.scrollTop = ctx.list.scrollHeight; setTimeout(()=>{ try{ ctx.list.__autoScrolling=false; }catch{} }, 0); }
      }catch{}
      ensureStreamUI._el = { row, bubble:b, textEl, metaEl:meta, panel:ctx.panel, list:ctx.list };
      try{
        window.__streamBubbleByOwner = window.__streamBubbleByOwner || new Map();
        window.__streamBubbleByOwner.set(ownerId, ensureStreamUI._el);
      }catch{}
      return ensureStreamUI._el;
    };
    // Autoscroll helpers: pause autoscroll if user scrolled within last 5s
    function wireAutoscrollGuard(list){ try{ if(!list || list.__autoscrollHooked) return; list.__autoscrollHooked = true; list.addEventListener('scroll', ()=>{ try{ if (list.__autoScrolling) return; list.dataset.lastUserScrollTs = String(Date.now()); }catch{} }); }catch{} }
    function shouldAutoscrollNow(list){ try{ const atBottom = (list.scrollTop + list.clientHeight) >= (list.scrollHeight - 8); if (atBottom) return true; const last = Number(list.dataset.lastUserScrollTs||0); if (!last) return false; return (Date.now() - last) >= 5000; }catch{ return true; } }
  let acc = '';
  let toolPending = false;
    // Track sections we stream into, to avoid duplicate full append on completion
    const streamedSids = new Set();
    const findParkedSectionIds = ()=>{
      const ids = new Set();
      try{
        document.querySelectorAll('.panel.board-section').forEach(sec=>{
          const sid = sec?.dataset?.sectionId || '';
          if (!sid) return;
          try{
            const raw = localStorage.getItem(`sectionParking:${sid}`);
            const cfg = raw ? (JSON.parse(raw)||{}) : {};
            if (cfg && String(cfg.input||'') === String(ownerId)) ids.add(sid);
          }catch{}
        });
      }catch{}
      return [...ids];
    };
    const appendDeltaToSections = (delta)=>{
      const d = String(delta||''); if (!d) return;
      const targets = findParkedSectionIds();
      targets.forEach(sid=>{
        try{
          // Begin stream once per section id
          if (!streamedSids.has(sid)){
            if (window.sectionStream && window.sectionStream.begin) window.sectionStream.begin(sid);
            if (typeof window.appendToSectionStreamBegin === 'function') window.appendToSectionStreamBegin(sid);
            streamedSids.add(sid);
          }
          // Write delta to persisted raw and re-render DOM live
          if (window.sectionStream && window.sectionStream.delta) window.sectionStream.delta(sid, d);
          if (typeof window.appendToSectionStreamDelta === 'function') window.appendToSectionStreamDelta(sid, d);
        }catch{}
      });
    };
  // Stream feedback deltas into fullscreen/regular section when grading
    const feedbackCtx = (function(){
      try{
        const sid = String((ctx && ctx.sourceId) || '') || '';
        if (!sid) return null;
        // Only stream if this coworker is the selected grader for the section
        const rawP = localStorage.getItem(`sectionParking:${sid}`);
        const park = rawP ? (JSON.parse(rawP)||{}) : {};
        if (!park || String(park.grader||'') !== String(ownerId)) return null;
        // Prefer explicit fullscreen marker; else fall back to DOM dataset for the live section panel
        let markerType = 'ls';
        let v = localStorage.getItem(`sectionPendingFeedback:${sid}`);
        if (v==null){
          const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`);
          const ds = sec && sec.dataset ? sec.dataset.pendingFeedback : undefined;
          if (ds !== undefined) { v = ds; markerType = 'dom'; }
        }
        if (v==null) return null;
        const idx = Math.max(0, Number(v)||0);
        return { sid, idx, markerType };
      }catch{ return null; }
    })();
    const appendDeltaToFeedback = (delta)=>{
      try{
        if (!feedbackCtx) return;
        const { sid, idx } = feedbackCtx;
        const key = `sectionExercises:${sid}`;
        const roundKey = `sectionExercisesRound:${sid}`;
        let arr = []; try{ arr = JSON.parse(localStorage.getItem(key)||'[]')||[]; }catch{ arr=[]; }
        if (!arr[idx]) return;
        let round = 1; try{ round = Math.max(1, Number(localStorage.getItem(roundKey)||'1')||1); }catch{}
        if (!Array.isArray(arr[idx].fbRounds)) arr[idx].fbRounds = (arr[idx].fb? [String(arr[idx].fb)] : []);
        const rIndex = round - 1; while (arr[idx].fbRounds.length <= rIndex) arr[idx].fbRounds.push('');
        const prev = String(arr[idx].fbRounds[rIndex]||'');
        arr[idx].fbRounds[rIndex] = prev + String(delta||'');
        localStorage.setItem(key, JSON.stringify(arr));
        try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
        try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
        try{ const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`); if (sec) sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } })); }catch{}
      }catch{}
    };
  // Stream improvement deltas into the exercise question when improving
    const improveCtx = (function(){
      try{
        const sid = String((ctx && ctx.sourceId) || '') || '';
        if (!sid) return null;
        const rawP = localStorage.getItem(`sectionParking:${sid}`);
        const park = rawP ? (JSON.parse(rawP)||{}) : {};
        if (!park || String(park.improver||'') !== String(ownerId)) return null;
        // Prefer fullscreen marker; else fall back to section DOM dataset
        let v = localStorage.getItem(`sectionPendingImprove:${sid}`);
        if (v==null){
          const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`);
          const ds = sec && sec.dataset ? sec.dataset.pendingImprove : undefined;
          if (ds !== undefined) v = ds;
        }
        if (v==null) return null;
        const idx = Math.max(0, Number(v)||0);
        return { sid, idx };
      }catch{ return null; }
    })();
    let improveBuf = '';
    const appendDeltaToImprovement = (delta)=>{
      try{
        if (!improveCtx) return;
        const { sid, idx } = improveCtx;
        const key = `sectionExercises:${sid}`;
        let arr = []; try{ arr = JSON.parse(localStorage.getItem(key)||'[]')||[]; }catch{ arr=[]; }
        if (!arr[idx]) return;
        improveBuf += String(delta||'');
        arr[idx].q = String(improveBuf);
        localStorage.setItem(key, JSON.stringify(arr));
        try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
        try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
        try{ const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`); if (sec) sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } })); }catch{}
      }catch{}
    };
  let finalCitations = [];
  const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
  let done=false, aborted=false;
  let bailForTools=false;
  let toolPendingTs=0;
    try{
      let leftover='';
      while(true){
        const { value, done:dr } = await reader.read();
        if (dr) break;
        const chunk = decoder.decode(value, { stream:true });
        let data = leftover + chunk;
        const lines = data.split(/\r?\n/);
        leftover = lines.pop() || '';
  for (const line of lines){
          const t = String(line||'').trim(); if (!t) continue;
          let obj=null; try{ obj = JSON.parse(t); }catch{ continue; }
          const kind = String(obj?.type||'');
          if (kind === 'meta'){
            // If server signals pending tool calls, abort stream and fall back to JSON path
            try{
              if (String(obj?.note||'') === 'tool_calls_pending'){
    toolPending = true;
    if (!toolPendingTs) toolPendingTs = Date.now();
                console.log('[DEBUG] Tool calls detected, grace period before bailing');
                // Show a small inline status in the streaming bubble before we fallback
                try{
                  const ui = ensureStreamUI();
                  if (ui && ui.metaEl){
                    const tools = Array.isArray(obj?.tools) ? obj.tools.filter(Boolean) : [];
                    const isPy = tools.some(t => String(t).toLowerCase() === 'run_python');
                    const toolTxt = tools.length ? (tools.join(', ')) : 'verktyg';
                    ui.metaEl.innerHTML = '';
                    // Collapsible placeholder shown immediately
                    const details = document.createElement('details');
                    details.open = false; details.dataset.kind = 'tool-live';
                    const summary = document.createElement('summary'); summary.textContent = isPy ? 'Python (live) – visa' : `${toolTxt} (live) – visa`;
                    const pre = document.createElement('pre'); pre.className='tool-code'; pre.textContent = '…';
                    details.appendChild(summary); details.appendChild(pre);
                    // Small spinner hint next to the placeholder
                    const hint = document.createElement('div');
                    hint.className = 'subtle';
                    const sp = document.createElement('i'); sp.className = 'inline-spinner';
                    const txt = document.createElement('span'); txt.textContent = isPy ? 'Kör Python…' : `Kör ${toolTxt}…`;
                    hint.appendChild(sp); hint.appendChild(txt);
                    ui.metaEl.appendChild(details);
                    ui.metaEl.appendChild(hint);
                  }
                }catch{}
              }
            }catch{}
          } else if (kind === 'tool_delta'){
            // Live tool argument deltas (e.g., Python code being constructed)
            try{
              const nm = String(obj?.name||'');
              const arg = String(obj?.arguments_delta||'');
              if (nm && arg){
                const ui = ensureStreamUI();
                if (ui && ui.metaEl){
                  // Maintain a growing code buffer per owner for the current stream
                  window.__liveToolBuf = window.__liveToolBuf || new Map();
                  const prev = window.__liveToolBuf.get(ownerId) || '';
                  const next = prev + arg;
                  window.__liveToolBuf.set(ownerId, next);
                  // Update existing collapsible placeholder if present; else create one
                  let details = ui.metaEl.querySelector('details[data-kind="tool-live"]');
                  if (!details){
                    ui.metaEl.innerHTML = '';
                    details = document.createElement('details');
                    details.open = false; details.dataset.kind = 'tool-live';
                    const summary = document.createElement('summary'); summary.textContent = (nm==='run_python') ? 'Python (live) – visa' : (nm + ' (live) – visa');
                    const pre = document.createElement('pre'); pre.className='tool-code'; pre.textContent = next;
                    details.appendChild(summary); details.appendChild(pre);
                    ui.metaEl.appendChild(details);
                  } else {
                    const pre = details.querySelector('pre.tool-code') || (()=>{ const p=document.createElement('pre'); p.className='tool-code'; details.appendChild(p); return p; })();
                    pre.textContent = next;
                  }
                }
              }
            }catch{}
          } else if (kind === 'delta'){
            const d = String(obj?.delta||'');
            if (d){
              acc += d;
              const ui = ensureStreamUI();
              if (ui){
                try{
                  wireAutoscrollGuard(ui.list);
                  const shouldScroll = shouldAutoscrollNow(ui.list);
                  ui.textEl.textContent = acc;
                  if (shouldScroll){ ui.list.__autoScrolling = true; ui.list.scrollTop = ui.list.scrollHeight; setTimeout(()=>{ try{ ui.list.__autoScrolling=false; }catch{} }, 0); }
                }catch{}
              }
              // Also stream into connected/parked sections
              try{ appendDeltaToSections(d); }catch{}
              // And stream into exercises feedback if active
              try{ appendDeltaToFeedback(d); }catch{}
              // And stream into exercises improvement (question text) if active
              try{ appendDeltaToImprovement(d); }catch{}
            }
          } else if (kind === 'error'){
            throw new Error(String(obj?.error||'Strömfel'));
           } else if (kind === 'done'){
            try{ if (Array.isArray(obj?.citations)) finalCitations = obj.citations; }catch{}
            done = true;
          }
  }
  // If a tool call is pending, allow a short grace window to receive live tool deltas before bailing
  if (toolPending && toolPendingTs && (Date.now() - toolPendingTs) >= 900){ bailForTools = true; }
  if (bailForTools) break;
      }
    }catch(e){
      if (e && (e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))){ aborted=true; const err=new Error('ABORTED'); err._aborted=true; throw err; }
      throw e;
    }
    if (toolPending){
      console.log('[DEBUG] Tool pending detected, throwing TOOL_PENDING');
      const err = new Error('TOOL_PENDING');
      throw err;
    }
    // Finalize UI render: convert to markdown if configured and append citations
  const ui = ensureStreamUI();
  let finalText = String(acc||'');
    // Clean MER_SIDOR if present in non-pgwise flows (should not appear)
  try{ finalText = finalText.replace(/\bMER_SIDOR\b/g,'').trim(); }catch{}
  if (!finalText) finalText = 'Tomt svar från AI';
    // Update graph and propagate
    let ts = Date.now();
    const meta = { ts, citations: Array.isArray(finalCitations)?finalCitations:[] };
    try{ if (Array.isArray(requestAIReply._lastAttachments)) meta.attachments = requestAIReply._lastAttachments; }catch{}
    try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, finalText, 'assistant', meta); ts = entry?.ts || ts; meta.ts = ts; } }catch{}
  // Render or update the UI bubble
    try{
      if (ui){
        // choose render mode
        let renderMode = 'md';
        try{
          const sel = ui.panel.querySelector('[data-role="renderMode"]');
          if (sel && sel.value) renderMode = String(sel.value);
          else { const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if (raw){ const s=JSON.parse(raw)||{}; if (s.renderMode) renderMode = String(s.renderMode); } }
        }catch{}
  wireAutoscrollGuard(ui.list);
  const stayDown = shouldAutoscrollNow(ui.list);
        if (renderMode === 'md' && window.mdToHtml){
          try{
            const html = window.mdToHtml(finalText);
            if (typeof window.sanitizeHtml === 'function') ui.textEl.innerHTML = window.sanitizeHtml(html);
            else ui.textEl.innerHTML = html;
          }catch{ ui.textEl.textContent = finalText; }
        } else { ui.textEl.textContent = finalText; }
        // citations under bubble
        try{
          const cites = Array.isArray(finalCitations) ? finalCitations : [];
          if (cites.length){
            const box = document.createElement('div'); box.className='subtle'; box.style.marginTop='6px'; box.style.fontSize='12px';
            const parts = cites.map((c,i)=>{ const title = (c?.title||c?.url||`Källa ${i+1}`); const safe = String(title).replace(/[\n\r]+/g,' '); const url = String(c?.url||'#'); return `<a href="${url}" target="_blank" rel="noopener noreferrer">[${i+1}] ${safe}<\/a>`; });
            box.innerHTML = parts.join(' ');
            // remove existing footers (if any) and append
            const old = ui.bubble.querySelectorAll('.subtle'); old.forEach((el,idx)=>{ if(idx>0) el.remove(); });
            ui.bubble.appendChild(box);
          }
        }catch{}
  if (ui.metaEl) ui.metaEl.textContent = (window.formatTime? window.formatTime(ts) : '');
  if (stayDown){ ui.list.__autoScrolling = true; ui.list.scrollTop = ui.list.scrollHeight; setTimeout(()=>{ try{ ui.list.__autoScrolling=false; }catch{} }, 0); }
      } else {
        if(window.receiveMessage) window.receiveMessage(ownerId, finalText, 'assistant', meta);
      }
    }catch{ try{ if(!ensureStreamUI._el) if(window.receiveMessage) window.receiveMessage(ownerId, finalText, 'assistant', meta); }catch{} }
  // Route onward; avoid duplicating full append into sections we streamed into
  try{ const routedMeta = { author, who:'assistant', ts, citations: Array.isArray(finalCitations)?finalCitations:[], skipSectionFinalAppend: true }; if(window.routeMessageFrom) window.routeMessageFrom(ownerId, finalText, routedMeta); }catch{}
  // End section streaming sessions
  try{
    streamedSids.forEach(sid=>{
      try{ if (window.sectionStream && window.sectionStream.end) window.sectionStream.end(sid); }catch{}
      try{ if (typeof window.appendToSectionStreamEnd === 'function') window.appendToSectionStreamEnd(sid); }catch{}
    });
  }catch{}
    // Completion event
    try{
      // If grading, clear pending marker (both fullscreen key and live section dataset)
      if (feedbackCtx && feedbackCtx.sid){
        try{ localStorage.removeItem(`sectionPendingFeedback:${feedbackCtx.sid}`); }catch{}
        try{ const sec = document.querySelector(`.panel.board-section[data-section-id="${feedbackCtx.sid}"]`); if (sec && sec.dataset) delete sec.dataset.pendingFeedback; }catch{}
        try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
        try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: feedbackCtx.sid } })); }catch{}
      }
      // If improving, clear pending marker too (both fullscreen key and live section dataset)
      if (improveCtx && improveCtx.sid){
        try{ localStorage.removeItem(`sectionPendingImprove:${improveCtx.sid}`); }catch{}
        try{ const sec = document.querySelector(`.panel.board-section[data-section-id="${improveCtx.sid}"]`); if (sec && sec.dataset) delete sec.dataset.pendingImprove; }catch{}
        try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
        try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: improveCtx.sid } })); }catch{}
      }
      const src = (ctx && ctx.sourceId) ? String(ctx.sourceId) : null;
      window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, sourceId: src, ok: true } }));
    }catch{}
    return { reply: finalText, citations: finalCitations };
  };
  let triedFallback = false;
  const tryRequest = (payload)=> sendJSONOnce(payload).catch(err=>{
  // If aborted, propagate a special marker to stop the pipeline silently
  if (err && (err.name === 'AbortError' || /aborted|abort/i.test(String(err.message||'')))){ const e = new Error('ABORTED'); e._aborted = true; throw e; }
    const em = String(err?.message||'').toLowerCase();
    // Heuristic: if the error seems model-related, try a safer fallback once
    if (!triedFallback && (em.includes('model') || em.includes('invalid') || em.includes('not found'))){
      triedFallback = true;
      try{
        const fallbackBody = Object.assign({}, payload, { model: 'gpt-4o-mini' });
        console.warn('[requestAIReply] Falling back to model gpt-4o-mini due to error:', err?.message||err);
        return sendJSONOnce(fallbackBody);
      }catch{}
    }
    throw err;
  });
  // Pagewise auto-continue: if model asks for MER_SIDOR and backend indicates more pages, request next window.
  let triedNoTools = false;
  const handleFinal = async (data)=>{
    console.log('[DEBUG] handleFinal called with data:', data);
    let reply = '';
    try{ reply = String(data?.reply || ''); }catch{ reply = ''; }
    console.log('[DEBUG] Extracted reply:', reply);
    if (!reply) {
      // One opportunistic retry with a safer fallback model if we haven't tried already
      if (!triedFallback){
        try{
          triedFallback = true;
          const fallbackBody = Object.assign({}, body, { model: 'gpt-4o-mini' });
          const data2 = await sendJSONOnce(fallbackBody);
          return await handleFinal(data2);
        }catch{}
      }
      // If tools were enabled, try once more with tools disabled to force a pure text reply
      if (!triedNoTools && toolsEnabled){
        try{
          triedNoTools = true;
          const bodyNoTools = Object.assign({}, body);
          delete bodyNoTools.tools;
          const data3 = await sendJSONOnce(bodyNoTools);
          return await handleFinal(data3);
        }catch{}
      }
      reply = data?.error ? `Fel: ${data.error}` : 'Tomt svar från AI';
    }
    // Remove any stray MER_SIDOR token from final display
  try{ reply = reply.replace(/\bMER_SIDOR\b/g, '').trim(); }catch{}
  if (!reply) {
    // Final guard: one last try without tools if still enabled and not tried
    if (!triedNoTools && toolsEnabled){
      try{
        triedNoTools = true;
        const bodyNoTools = Object.assign({}, body); delete bodyNoTools.tools;
        const data4 = await sendJSONOnce(bodyNoTools);
        let r4 = '';
        try{ r4 = String(data4?.reply||''); }catch{ r4=''; }
        if (r4) reply = r4;
      }catch{}
    }
    if (!reply) reply = 'Tomt svar från AI';
  }
    const citations = (function(){ try{ return Array.isArray(data?.citations) ? data.citations : []; }catch{ return []; } })();
    let ts = Date.now();
  const meta = { ts, citations };
    try{ if (Array.isArray(requestAIReply._lastAttachments)) meta.attachments = requestAIReply._lastAttachments; }catch{}
  // Propagate executed tool debug info so non-stream UI can render a collapsible code block
  try{ if (data && data.tool_debug) meta.tool_debug = data.tool_debug; }catch{}
    // If a streaming bubble exists (created before tool fallback), reuse it instead of adding a new row
    let reused = false;
    try{
      const map = window.__streamBubbleByOwner;
      const ui = map && map.get ? map.get(ownerId) : null;
      if (ui && ui.textEl){
        let injectedToolCode = false;
        // If backend provided executed tool code, show it above the reply
        try{
          const td = data && data.tool_debug ? data.tool_debug : null;
          const code = td && td.name==='run_python' ? String(td.code||'') : '';
          if (code && ui.metaEl){
            const details = document.createElement('details');
            details.open = false;
            const summary = document.createElement('summary'); summary.textContent = 'Visa Pythonkoden som kördes';
            const pre = document.createElement('pre'); pre.className='tool-code'; pre.textContent = code;
            details.appendChild(summary); details.appendChild(pre);
            ui.metaEl.innerHTML='';
            ui.metaEl.appendChild(details);
            // keep a small timestamp under the details
            const timeEl = document.createElement('div'); timeEl.className='subtle'; timeEl.style.marginTop='4px'; timeEl.textContent = (window.formatTime? window.formatTime(ts) : '');
            ui.metaEl.appendChild(timeEl);
            injectedToolCode = true;
          }
        }catch{}
        // choose render mode from the owner panel if possible
        let renderMode = 'md';
        try{
          const panel = ui.panel || [...document.querySelectorAll('.panel-flyout')].find(p => p.dataset.ownerId === ownerId);
          const sel = panel && panel.querySelector ? panel.querySelector('[data-role="renderMode"]') : null;
          if (sel && sel.value) renderMode = String(sel.value);
          else { const raw = localStorage.getItem(`nodeSettings:${ownerId}`); if (raw){ const s=JSON.parse(raw)||{}; if (s.renderMode) renderMode = String(s.renderMode); } }
        }catch{}
        // render into the existing bubble
        if (renderMode === 'md' && window.mdToHtml){
          try{
            const html = window.mdToHtml(reply);
            if (typeof window.sanitizeHtml === 'function') ui.textEl.innerHTML = window.sanitizeHtml(html);
            else ui.textEl.innerHTML = html;
          }catch{ ui.textEl.textContent = reply; }
        } else { ui.textEl.textContent = reply; }
        // citations + time
        try{
          const cites = Array.isArray(citations) ? citations : [];
          if (cites.length){
            const box = document.createElement('div'); box.className='subtle'; box.style.marginTop='6px'; box.style.fontSize='12px';
            const parts = cites.map((c,i)=>{ const title = (c?.title||c?.url||`Källa ${i+1}`); const safe = String(title).replace(/[\n\r]+/g,' '); const url = String(c?.url||'#'); return `<a href="${url}" target="_blank" rel="noopener noreferrer">[${i+1}] ${safe}<\/a>`; });
            box.innerHTML = parts.join(' ');
            const old = ui.bubble.querySelectorAll('.subtle'); old.forEach((el,idx)=>{ if(idx>0) el.remove(); });
            ui.bubble.appendChild(box);
          }
        }catch{}
        try{
          // Clear live tool buffer and finalize meta timestamp (keep details block if injected)
          if (window.__liveToolBuf && window.__liveToolBuf.delete) window.__liveToolBuf.delete(ownerId);
          if (ui.metaEl && !injectedToolCode) ui.metaEl.textContent = (window.formatTime? window.formatTime(ts) : '');
        }catch{}
        reused = true;
      }
      if (map && map.delete) map.delete(ownerId);
    }catch{}
    if (!reused){
      // If not reusing a stream bubble, add assistant message normally; any executed code will be shown in meta via a details block
      try{ if(window.graph){ const entry = window.graph.addMessage(ownerId, author, reply, 'assistant', meta); ts = entry?.ts || ts; meta.ts = ts; } }catch{}
      try{ if(window.receiveMessage) window.receiveMessage(ownerId, reply, 'assistant', meta); }catch{}
    }
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
          // 1) Input append: if this coworker is configured as an input for the section (supports multiple ordered inputs)
          const inputs = Array.isArray(cfg?.inputs) ? cfg.inputs.map(String) : [];
          const singleInput = String(cfg?.input||'');
          const isInput = (inputs.length ? inputs.includes(String(ownerId)) : (singleInput && singleInput === String(ownerId)));
          if (isInput){
            if (window.appendToSection) window.appendToSection(sid, reply);
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
            // compute current round counter (1-based), default 1
            let round = 1; try{ round = Math.max(1, Number(localStorage.getItem(`sectionExercisesRound:${sid}`)||'1')||1); }catch{}
            // Ensure fbRounds is an array and migrate legacy fb
            try{ if (!Array.isArray(arr[idx].fbRounds)) arr[idx].fbRounds = []; if (arr[idx].fb && !arr[idx].fbRounds.length){ arr[idx].fbRounds = [ String(arr[idx].fb||'') ]; delete arr[idx].fb; } }catch{}
            const rIndex = round - 1; // zero-based
            // Ensure array length
            while (arr[idx].fbRounds.length <= rIndex) arr[idx].fbRounds.push('');
            const prev = String(arr[idx].fbRounds[rIndex]||'');
            arr[idx].fbRounds[rIndex] = prev ? (prev + '\n\n' + String(reply||'')) : String(reply||'');
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
    // Cross-tab only: if no section DOM exists, still handle pending feedback markers across tabs
    try{
      const keys = Object.keys(localStorage || {}).filter(k => /^sectionPendingFeedback:/.test(k));
      for (const k of keys){
        try{
          const sid = k.replace(/^sectionPendingFeedback:/, '');
          const raw = localStorage.getItem(`sectionParking:${sid}`) || '{}';
          const cfg = JSON.parse(raw||'{}')||{};
          if (!cfg || String(cfg.grader||'') !== String(ownerId)) continue;
          const v = localStorage.getItem(k);
          if (v==null) continue;
          const idx = Math.max(0, Number(v)||0);
          const keyEx = `sectionExercises:${sid}`;
          const arr = JSON.parse(localStorage.getItem(keyEx)||'[]')||[];
          if (!arr[idx]) continue;
          // round-aware append
          let round = 1; try{ round = Math.max(1, Number(localStorage.getItem(`sectionExercisesRound:${sid}`)||'1')||1); }catch{}
          try{ if (!Array.isArray(arr[idx].fbRounds)) arr[idx].fbRounds = []; if (arr[idx].fb && !arr[idx].fbRounds.length){ arr[idx].fbRounds = [ String(arr[idx].fb||'') ]; delete arr[idx].fb; } }catch{}
          const rIndex = round - 1; while (arr[idx].fbRounds.length <= rIndex) arr[idx].fbRounds.push('');
          const prev = String(arr[idx].fbRounds[rIndex]||'');
          arr[idx].fbRounds[rIndex] = prev ? (prev + '\n\n' + String(reply||'')) : String(reply||'');
          localStorage.setItem(keyEx, JSON.stringify(arr));
          localStorage.removeItem(k);
                   try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
          try{ window.dispatchEvent(new CustomEvent('exercises-data-changed-global', { detail:{ id: sid } })); }catch{}
          // If a section is also present in this tab, inform it too
          try{ const sec = document.querySelector(`.panel.board-section[data-section-id="${sid}"]`); if (sec) sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id: sid } })); }catch{}
        }catch{}
      }
    }catch{}
  // Announce completion to UI listeners (use body.sourceId if present)
  try{ const src = (body && body.sourceId) ? String(body.sourceId) : null; window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, sourceId: src, ok: true } })); }catch{}
  };
  const doStep = async (pgStart, step)=>{
    console.log('[DEBUG] doStep called with pgStart:', pgStart, 'step:', step);
    const payload = Object.assign({}, body);
    if (payload.pgwise && typeof pgStart === 'number') payload.pgwise.startPage = pgStart;
    console.log('[DEBUG] Making JSON request with payload:', payload);
    const data = await tryRequest(payload);
    console.log('[DEBUG] Got JSON response:', data);
    const pw = data && data.pagewise;
    const wantsMore = !!(pw && pw.enabled && pw.modelRequestedMore && pw.hasMore);
    if (wantsMore && step < 5){
      // Don't show this intermediate reply (likely contains MER_SIDOR); immediately fetch next window.
      const nextStart = Number(pw.nextStartPage)|| (pgStart+1);
      return doStep(nextStart, step+1);
    }
    // Final step: render normally (await to ensure UI update before returning)
    await handleFinal(data);
    return data;
  };
  // Announce start for UI (e.g., show cancel button)
  try{ window.dispatchEvent(new CustomEvent('ai-request-started', { detail:{ ownerId, sourceId: ctx && ctx.sourceId ? String(ctx.sourceId) : null } })); }catch{}
  // Prefer streaming when no pagewise (materials) are involved, or when source is coworker/section; fallback to JSON on error
  // Keep streaming for section-sourced grading/improving even with attachments
  const preferStream = ((!hasMaterials) || fromCoworker || fromSection);
  const startPromise = (preferStream ? (async ()=>{
    const basePayload = Object.assign({}, body);
    try{ return await sendStreamOnce(basePayload); }
    catch(e){
      // Allow fallback if server doesn't support stream or other non-abort error
      if (e && (e._aborted || e.name==='AbortError' || /aborted|abort/i.test(String(e.message||'')))) throw e;
      // If NO_STREAM marker, just use JSON path
      if (String(e?.message||'')==='NO_STREAM' || String(e?.message||'')==='TOOL_PENDING') {
        console.log('[DEBUG] Fallback to JSON due to:', e?.message);
        // For tool calls, make a clean JSON request without pagewise to avoid complications
        if (String(e?.message||'')==='TOOL_PENDING') {
          const cleanPayload = Object.assign({}, body);
          delete cleanPayload.pgwise; // Remove pagewise for tool calls
          return tryRequest(cleanPayload).then(data => {
            handleFinal(data);
            return data;
          });
        }
        return await doStep(_pgStart, 0);
      }
      // Try model fallback once for stream
      if (!triedFallback){
        triedFallback = true;
        try{ const fb = Object.assign({}, basePayload, { model: 'gpt-4o-mini' }); return await sendStreamOnce(fb); }catch{}
      }
      // Fallback to JSON path finally
      return await doStep(_pgStart, 0);
    }
  })() : doStep(_pgStart, 0));
  startPromise.catch(err=>{
      // If aborted, do nothing except emit finished with ok:false
      if (err && (err._aborted || err.name === 'AbortError' || /aborted|abort/i.test(String(err.message||'')))){
        try{ const src = (body && body.sourceId) ? String(body.sourceId) : null; window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, sourceId: src, ok: false, error: 'aborted' } })); }catch{}
        return;
      }
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
    // Also announce error completion for overlay cleanup
    try{ const src = (body && body.sourceId) ? String(body.sourceId) : null; window.dispatchEvent(new CustomEvent('ai-request-finished', { detail:{ ownerId, sourceId: src, ok: false, error: String(err?.message||err) } })); }catch{}
  }).finally(()=>{
    // Delay clearing busy a bit to avoid flicker when follow-up work kicks in
    setTimeout(()=>{ try{ setThinking(ownerId, false); }catch{} }, 700);
    // Clear inflight state
    try{ if (inflight.get(ownerId) === controller) inflight.delete(ownerId); }catch{}
  });
  return startPromise;
  }

  // Expose cancel helper
  try{
    if (!window.cancelAIRequest){
      window.cancelAIRequest = function(id){ try{ const c = (window.__aiInflight && window.__aiInflight.get) ? window.__aiInflight.get(id) : null; if (c && c.abort) c.abort(); }catch{} };
    }
    if (!window.hasActiveAIRequest){
      window.hasActiveAIRequest = function(id){ try{ return !!(window.__aiInflight && window.__aiInflight.has && window.__aiInflight.has(id)); }catch{ return false; } };
    }
  }catch{}

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
  const tmpPath = makePath(svg()); let lastHover=null;
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
  /** Programmatically create a connection using exact endpoints (no hit-testing). */
  function createConnectionDirect(fromEl, fromCp, toEl, toCp){
    try{
      if (!fromEl || !fromCp || !toEl || !toCp) return;
      const a = anchorOf(fromEl, fromCp);
      const b = anchorOf(toEl, toCp);
      const path = makePath(svg(), false);
      const hit = makeHitPath(svg());
      drawPath(path, a.x, a.y, b.x, b.y);
      drawPath(hit, a.x, a.y, b.x, b.y);
      const fromId = fromEl.dataset.id || fromEl.dataset.sectionId;
      const toId = toEl.dataset.id || toEl.dataset.sectionId;
      const conn = { fromId, toId, pathEl: path, hitEl: hit, fromCp, toCp };
      window.state.connections.push(conn);
      wireConnectionDeleteUI(conn);
      try{ path.addEventListener('connection:transmit', (ev)=>{ try{ triggerFlowEffect(conn, ev?.detail); }catch{} }); }catch{}
      if (fromId && toId && window.graph) window.graph.connect(fromId, toId);
      // Ensure stable section ids if needed
      try{
        const aEl = document.querySelector(`[data-id="${fromId}"]`) || document.querySelector(`[data-section-id="${fromId}"]`);
        const bEl = document.querySelector(`[data-id="${toId}"]`) || document.querySelector(`[data-section-id="${toId}"]`);
        const ensureSecId = (el)=>{ if (!el) return; if (el.classList.contains('panel') && el.classList.contains('board-section')){ if (!el.dataset.sectionId){ el.dataset.sectionId = 's'+Math.random().toString(36).slice(2,6); } } };
        ensureSecId(aEl); ensureSecId(bEl);
      }catch{}
    }catch{}
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
  const path = makePath(svg(), false);
  const hit = makeHitPath(svg());
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
  window.createConnectionDirect = createConnectionDirect;
  window.anchorOf = anchorOf;
  window.findClosestConnPoint = findClosestConnPoint;
  window.updateConnectionsFor = updateConnectionsFor;
  window.triggerFlowEffect = triggerFlowEffect;
  window.routeMessageFrom = routeMessageFrom;
  // Expose so panels can trigger self-replies
  window.requestAIReply = requestAIReply;
})();
