(function(){
  // Query params
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const title = params.get('title') || '';
  document.getElementById('fxTitle').textContent = title ? `Övningar – ${title}` : 'Övningar';

  const key = (s)=> `sectionExercises:${s}`;
  const cursorKey = (s)=> `sectionExercisesCursor:${s}`;
  const layoutKey = (s)=> `sectionExercisesLayout:${s}`;

  const els = {
    q: document.getElementById('fxQ'),
    a: document.getElementById('fxA'),
    f: document.getElementById('fxF'),
  // info element removed in favor of top counter
  infoTop: document.getElementById('fxInfoTop'),
    empty: document.getElementById('fxEmpty'),
    main: document.getElementById('fxMain'),
    btnLayout: document.getElementById('fxLayout'),
    cards: {
      q: document.getElementById('cardQ'),
      a: document.getElementById('cardA'),
      f: document.getElementById('cardF'),
    },
  };

  function getList(){ try{ const raw = localStorage.getItem(key(id)); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } }
  function setList(arr){ try{ localStorage.setItem(key(id), JSON.stringify(arr||[])); dispatchChanged(); }catch{} }
  function getCursor(){ try{ return Math.max(0, Number(localStorage.getItem(cursorKey(id))||'0')||0); }catch{ return 0; } }
  function setCursor(i){ try{ localStorage.setItem(cursorKey(id), String(i)); dispatchChanged(); }catch{} }
  function dispatchChanged(){ try{ window.localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{} }

  function render(){
    const arr = getList();
    const idx = Math.min(getCursor(), Math.max(0, arr.length-1));
  els.empty.hidden = !!arr.length;
  if (!arr.length){ els.q.innerHTML=''; els.a.value=''; els.f.innerHTML=''; if(els.infoTop) els.infoTop.textContent=''; return; }
    const it = arr[idx] || {};
  els.q.innerHTML = (window.mdToHtml? window.mdToHtml(it.q||'') : (it.q||''));
    els.a.value = it.a || '';
    // Render feedback grouped by rounds
    const rounds = Array.isArray(it.fbRounds) ? it.fbRounds : (it.fb ? [String(it.fb)] : []);
    if (!rounds.length){ els.f.innerHTML = '<div class="subtle">Ingen feedback ännu.</div>'; }
    else {
      const parts = rounds.map((txt, i)=>{
        const head = `<div class="subtle" style="margin:6px 0 4px; opacity:.85;">Omgång ${i+1}</div>`;
        const body = window.mdToHtml? window.mdToHtml(String(txt||'')) : String(txt||'');
        return head + `<div class="fb-round">${body}</div>`;
      });
      els.f.innerHTML = parts.join('<hr style="border:none; border-top:1px solid #252532; margin:8px 0;">');
    }
  const counter = `${idx+1} / ${arr.length}`;
  if (els.infoTop) els.infoTop.textContent = counter;
  }

  // ---- Layout mode (drag/resize, persisted) ----
  function loadLayout(){ try{ const raw = localStorage.getItem(layoutKey(id)); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } }
  function saveLayout(obj){ try{ localStorage.setItem(layoutKey(id), JSON.stringify(obj||{})); }catch{} }
  function applyLayout(){
    const l = loadLayout();
    const free = !!l.free;
  const wrap = document.querySelector('.fx-wrap');
  if (wrap){ wrap.classList.toggle('free', free); }
    els.main.style.display = free ? 'block' : 'grid';
    Object.entries(els.cards).forEach(([k,card])=>{
      if (!card) return;
      if (free){
        card.dataset.free = '1';
        const st = l[k] || {};
    card.style.left = (st.x?? 20) + 'px';
    card.style.top = (st.y?? 20) + 'px';
        card.style.width = (st.w?? 360) + 'px';
        card.style.height = (st.h?? 320) + 'px';
      } else {
        card.dataset.free = '0';
        card.style.left = card.style.top = card.style.width = card.style.height = '';
      }
    });
  }
  function toggleLayout(){ const l = loadLayout(); l.free = !l.free; saveLayout(l); applyLayout(); }

  function persistCard(card){
    const name = card.id==='cardQ'?'q': card.id==='cardA'?'a':'f';
    const r = card.getBoundingClientRect();
    const c = els.main.getBoundingClientRect();
    const l = loadLayout(); l[name] = { x: Math.round(r.left - c.left), y: Math.round(r.top - c.top), w: Math.round(r.width), h: Math.round(r.height) }; saveLayout(l);
  }
  function initLayout(){
    Object.values(els.cards).forEach(c=>{
      if(!c) return;
      const handle = c.querySelector('.drag-handle');
      const grip = c.querySelector('.fx-resize');
      if (window.makeDraggableWithin && handle){
        window.makeDraggableWithin(els.main, c, handle, {
          enabled: ()=> loadLayout().free===true,
          onEnd: ()=> persistCard(c),
        });
      }
      if (window.makeResizableWithin && grip){
        window.makeResizableWithin(els.main, c, grip, {
          enabled: ()=> loadLayout().free===true,
          onEnd: ()=> persistCard(c),
          minW: 240,
          minH: 180,
        });
      }
    });
    applyLayout();
  }

  // Wire nav
  document.getElementById('fxPrev').addEventListener('click', ()=>{ const arr=getList(); const n=Math.max(0, getCursor()-1); setCursor(n); render(); });
  document.getElementById('fxNext').addEventListener('click', ()=>{ const arr=getList(); const n=Math.min(Math.max(0, arr.length-1), getCursor()+1); setCursor(n); render(); });
  document.getElementById('fxClose').addEventListener('click', ()=>{ window.close(); });
  // Clear all answers in this section and increment round
  (function(){ const btn = document.getElementById('fxClearAns'); if (!btn) return; btn.addEventListener('click', ()=>{
    if (!confirm('Rensa alla svar och påbörja ny omgång?')) return;
    try{
      const arr = getList().map(it=> Object.assign({}, it, { a: '' }));
      setList(arr);
      try{ const keyR = `sectionExercisesRound:${id}`; const n = Math.max(1, Number(localStorage.getItem(keyR)||'1')||1); localStorage.setItem(keyR, String(n+1)); }catch{}
      dispatchChanged();
      render();
    }catch{}
  }); })();
  if (els.btnLayout){ els.btnLayout.addEventListener('click', toggleLayout); }
  // Question improver mini-chat
  (function(){
    const inp = document.getElementById('fxQChat'); const send = document.getElementById('fxQSend'); if (!inp || !send) return;
    const getParking = ()=>{ try{ const raw = localStorage.getItem(`sectionParking:${id}`); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
    const sendToImprover = (userText)=>{
      const v = String(userText||'').trim(); if (!v) return;
      const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it) return;
      const n = i+1;
      // Include current question + user's prompt so the coworker has full context
      const payload = [
        `Fråga ${n}: ${it.q||''}`,
        `Instruktion: ${v}`
      ].join('\n');
      // Mark pending improvement (cross-tab) so the reply replaces this question text
      try{ localStorage.setItem(`sectionPendingImprove:${id}`, String(i)); }catch{}
      const park = getParking(); const improverId = park && park.improver ? String(park.improver) : '';
      if (!improverId){ alert('Ingen "Förbättra fråga"-nod vald i sektionen. Välj en CoWorker i listan.'); return; }
      // Prefer direct coworker AI call if available, else route via connections
      let sent = false;
      if (improverId && window.requestAIReply){ try{ window.requestAIReply(improverId, { text: payload, sourceId: id }); sent = true; }catch{} }
      if (!sent && window.routeMessageFrom){ try{ window.routeMessageFrom(id, payload, { author: 'Fråga', who:'user', ts: Date.now() }); sent = true; }catch{} }
      // UX: brief indicator that message was sent
      try{
        let cont = document.getElementById('toastContainer');
        if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
        const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Skickat till förbättrare'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1100);
      }catch{}
    };
    send.addEventListener('click', ()=>{ const v=String(inp.value||'').trim(); if(!v) return; sendToImprover(v); inp.value=''; });
    inp.addEventListener('keydown', (e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); const v=String(inp.value||'').trim(); if(!v) return; sendToImprover(v); inp.value=''; } });
  })();
  // Grade current question via backend /chat
  (function(){
    const btn = document.getElementById('fxGrade'); if (!btn) return;
    btn.addEventListener('click', ()=>{
      try{
        const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it){ alert('Ingen fråga vald.'); return; }
        const n = i+1;
        const payloadText = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
        // Mark pending feedback so the coworker reply is stored here (cross-tab)
        try{ localStorage.setItem(`sectionPendingFeedback:${id}`, String(i)); }catch{}
        // Prefer parked Grader
        const parkRaw = localStorage.getItem(`sectionParking:${id}`);
        const park = parkRaw ? (JSON.parse(parkRaw)||{}) : {};
        const graderId = park && park.grader ? String(park.grader) : '';
        if (!graderId){ alert('Ingen "Rättare"-nod vald i sektionen. Välj en CoWorker i listan.'); return; }
        let sent = false;
        if (graderId && window.requestAIReply){ try{ window.requestAIReply(graderId, { text: payloadText, sourceId: id }); sent = true; }catch{} }
        if (!sent && window.routeMessageFrom){ try{ window.routeMessageFrom(id, payloadText, { author: 'Fråga', who:'user', ts: Date.now() }); sent = true; }catch{} }
        // tiny sent toast
        try{
          let cont = document.getElementById('toastContainer');
          if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
          const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Skickat till rättare'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1100);
        }catch{}
      }catch(e){ alert(String(e?.message||e)); }
    });
  })();

  // Edits -> persist
  els.a.addEventListener('input', ()=>{ const arr=getList(); const i=getCursor(); if(arr[i]){ arr[i].a = els.a.value; setList(arr); }});

  // Cross-tab sync via storage events
  window.addEventListener('storage', (e)=>{
    try{
      if (!e) return;
      if (e.key && (e.key === key(id) || e.key === cursorKey(id) || e.key === '__exercises_changed__')){
        render();
      }
    }catch{}
  });
  // Same-tab global event (dispatched by connect.js when exercises change)
  window.addEventListener('exercises-data-changed-global', (ev)=>{
    try{ render(); }catch{}
  });

  initLayout();
  render();
})();
