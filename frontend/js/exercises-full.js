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
  els.f.innerHTML = (window.mdToHtml? window.mdToHtml(it.fb||'') : (it.fb||''));
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
  if (els.btnLayout){ els.btnLayout.addEventListener('click', toggleLayout); }
  // Grade current question via backend /chat
  (function(){
    const btn = document.getElementById('fxGrade'); if (!btn) return;
    const detectApiBase = ()=>{ try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{} try{ if (location.protocol==='file:') return 'http://localhost:8000'; if (location.port && location.port !== '8000') return 'http://localhost:8000'; }catch{} return ''; };
    const renderFb = (s)=>{ try{ els.f.innerHTML = (window.mdToHtml? window.mdToHtml(s||'') : String(s||'')); }catch{ els.f.textContent = String(s||''); } };
    btn.addEventListener('click', async ()=>{
      try{
        const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it){ alert('Ingen fråga vald.'); return; }
        const n = i+1;
        const payloadText = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
        const apiBase = detectApiBase();
        const body = { model: 'gpt-5-mini', messages: [ { role:'system', content:'Du är en lärare. Ge kort, konstruktiv feedback på svaret. Om relevant, föreslå förbättringar. Svara på svenska. Använd Markdown.' }, { role:'user', content: payloadText } ], max_completion_tokens: 600 };
        btn.disabled = true; const prevTxt = btn.textContent; btn.textContent = 'Rättar…';
        const r = await fetch(apiBase + '/chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
        if (!r.ok){ const t = await r.text().catch(()=>'' ); throw new Error(`Rätta misslyckades (${r.status}): ${t.slice(0,200)}`); }
        const data = await r.json(); const reply = String(data?.reply||'');
        it.fb = reply; setList(arr);
        renderFb(reply);
      }catch(e){ alert(String(e?.message||e)); }
      finally{ btn.disabled=false; btn.textContent='Rätta'; }
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

  initLayout();
  render();
})();
