(function(){
  // Local sanitizer to prevent style/script/link/meta/base leakage in full-screen page
  function sanitizeHtmlLocal(html){
    try{
      let s = String(html||'');
      s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
      s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
      s = s.replace(/<link[^>]*>/gi, '');
      s = s.replace(/<meta[^>]*>/gi, '');
      s = s.replace(/<base[^>]*>/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
      s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
      s = s.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"');
      s = s.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
      return s;
    }catch{ return String(html||''); }
  }
  // Query params
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const title = params.get('title') || '';
  const embed = params.get('embed') === '1';
  const wide = params.get('wide') === '1';
  document.getElementById('fxTitle').textContent = title ? `Övningar – ${title}` : 'Övningar';

  const key = (s)=> `sectionExercises:${s}`;
  const cursorKey = (s)=> `sectionExercisesCursor:${s}`;
  const layoutKey = (s)=> `sectionExercisesLayout:${s}`;
  const roundKey = (s)=> `sectionExercisesRound:${s}`;
  const fbViewKey = (s)=> `sectionExercisesFbView:${s}`; // 'edit' | 'preview'

  // Local open helper (mirrors panels.js behavior for http(s) targets)
  function openIfExists(url){
    try{
      if (!url) return;
      const u = String(url);
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

  // Local helpers: read grader's attachments for this section, linkify refs, and wire clicks
  function getSectionGraderAttachmentsLocal(sectionId){
    try{
      const sid = String(sectionId||''); if (!sid) return { attItems: [] };
      const rawP = localStorage.getItem(`sectionParking:${sid}`);
      const p = rawP ? (JSON.parse(rawP)||{}) : {};
      const graderId = p && p.grader ? String(p.grader) : '';
      if (!graderId) return { attItems: [] };
      const rawA = localStorage.getItem(`nodeAttachments:${graderId}`);
      const items = rawA ? (JSON.parse(rawA)||[]) : [];
      const seen = new Set(); const flat = [];
      (items||[]).forEach(it=>{ try{ const key = (it.url||'') || `${it.name||''}|${it.chars||0}`; if (!seen.has(key)){ seen.add(key); flat.push(it); } }catch{ flat.push(it); } });
      return { attItems: flat };
    }catch{ return { attItems: [] }; }
  }
  function linkifySectionRefsLocal(html, attItems){
    try{
      const attLen = Array.isArray(attItems) ? attItems.length : 0;
      return String(html)
        .replace(/\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\]/gi, (mm,a,p1,p2)=>{
          const first = Math.max(1, Number(p1)||1);
          const second = Math.max(1, Number(p2)||first);
          const page = Math.min(first, second);
          const normBil = (attLen === 1 ? 1 : Math.max(1, Number(a)||1));
          const disp = (attLen === 1 && normBil === 1 && (Number(a)||1) !== 1)
            ? mm.replace(/^\[\s*\d+/, s=> s.replace(/\d+/, '1'))
            : mm;
          return `<a href="javascript:void(0)" data-bil="${normBil}" data-page="${page}" class="ref-bp">${disp}<\/a>`;
        })
        .replace(/\[(\d+)\]/g, (m,g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]<\/a>`);
    }catch{ return String(html||''); }
  }
  function wireSectionRefClicksLocal(containerEl, attItems, hintText){
    try{
      if (!containerEl) return;
      if (containerEl.__refsWired) return; containerEl.__refsWired = true;
      const isPdf = (x)=>{ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } };
      containerEl.addEventListener('click', (ev)=>{
        try{
          const tgt = ev.target && ev.target.closest ? ev.target.closest('a') : null; if (!tgt) return;
          if (tgt.classList.contains('ref-bp')){
            let bil = Math.max(1, Number(tgt.getAttribute('data-bil'))||1);
            const page = Math.max(1, Number(tgt.getAttribute('data-page'))||1);
            const attLen = attItems?.length||0; if (attLen === 1 && bil > 1) bil = 1;
            if (bil <= attLen){
              const it = attItems[bil-1];
              const httpUrl = it.url || '';
              const blobUrl = it.origUrl || it.blobUrl || (function(){ const blob=new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
              let finalHref = httpUrl || blobUrl;
              if (isPdf(it) && httpUrl){ finalHref = httpUrl + `#page=${encodeURIComponent(Math.max(1,page))}`; }
              ev.preventDefault(); ev.stopPropagation();
              try{ openIfExists(finalHref); }catch{ const tmp=document.createElement('a'); tmp.href=finalHref; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
              return;
            }
          }
          if (tgt.classList.contains('ref')){
            const idx = Math.max(1, Number(tgt.getAttribute('data-ref'))||1);
            if (idx <= (attItems?.length||0)){
              const it = attItems[idx-1];
              const httpUrl = it.url || '';
              const blobUrl = it.origUrl || it.blobUrl || (function(){ const blob=new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl = URL.createObjectURL(blob); return it.blobUrl; })();
              let finalHref = httpUrl || blobUrl;
              if (isPdf(it) && httpUrl && hintText){
                try{
                  const pages = Array.isArray(it.pages)? it.pages : [];
                  const q = String(hintText||'').trim().slice(0,120);
                  const tokens = q.split(/\s+/).filter(Boolean).slice(0,8);
                  const needle = tokens.slice(0,3).join(' ');
                  let pick=null;
                  for (const p of pages){ const t = String(p.text||''); if (!t) continue; if (needle && t.toLowerCase().includes(needle.toLowerCase())){ pick={ page:Number(p.page)||null }; break; } for (const tok of tokens){ if (tok.length>=4 && t.toLowerCase().includes(tok.toLowerCase())){ pick={ page:Number(p.page)||null }; break; } } if (pick) break; }
                  if (pick && pick.page){ finalHref = httpUrl + `#page=${encodeURIComponent(pick.page)}`; }
                }catch{}
              }
              ev.preventDefault(); ev.stopPropagation();
              try{ openIfExists(finalHref); }catch{ const tmp=document.createElement('a'); tmp.href=finalHref; tmp.target='_blank'; tmp.rel='noopener'; document.body.appendChild(tmp); tmp.click(); tmp.remove(); }
              return;
            }
          }
        }catch{}
      });
    }catch{}
  }

  const els = {
  t: document.getElementById('fxT'),
    q: document.getElementById('fxQ'),
    a: document.getElementById('fxA'),
    f: document.getElementById('fxF'),
  // info element removed in favor of top counter
  infoTop: document.getElementById('fxInfoTop'),
    empty: document.getElementById('fxEmpty'),
    main: document.getElementById('fxMain'),
    btnLayout: document.getElementById('fxLayout'),
    controls: document.querySelector('.fx-controls'),
    cards: {
      q: document.getElementById('cardQ'),
      a: document.getElementById('cardA'),
  f: document.getElementById('cardF'),
  t: document.getElementById('cardT'),
    },
  };

  function getFbView(){ try{ const v = localStorage.getItem(fbViewKey(id))||'edit'; return v==='preview'?'preview':'edit'; }catch{ return 'edit'; } }
  function setFbView(v){ try{ localStorage.setItem(fbViewKey(id), v==='preview'?'preview':'edit'); }catch{} }

  // Visual indicator for layout mode (fast vs fritt)
  let layoutBadge = null;
  function ensureLayoutBadge(){
    try{
      if (layoutBadge && layoutBadge.isConnected) return layoutBadge;
      layoutBadge = document.createElement('span');
      layoutBadge.id = 'fxLayoutBadge';
      Object.assign(layoutBadge.style, {
        marginLeft: '8px', padding: '2px 8px',
        border: '1px solid #3a3a4a', borderRadius: '999px',
        fontSize: '12px', color: '#e6e6ec', opacity: .9,
        background: 'rgba(255,255,255,0.03)'
      });
      if (els.controls) els.controls.insertBefore(layoutBadge, els.btnLayout?.nextSibling || null);
      return layoutBadge;
    }catch{ return null; }
  }
  function updateLayoutUI(isFree){
    try{
      if (els.btnLayout){ els.btnLayout.textContent = isFree ? 'Layoutläge: Fritt' : 'Layoutläge: Fast'; }
      const b = ensureLayoutBadge(); if (b){ b.textContent = isFree ? 'Fritt läge' : 'Fast läge'; }
    }catch{}
  }

  function getList(){ try{ const raw = localStorage.getItem(key(id)); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } }
  function setList(arr){ try{ localStorage.setItem(key(id), JSON.stringify(arr||[])); dispatchChanged(); }catch{} }
  function getCursor(){ try{ return Math.max(0, Number(localStorage.getItem(cursorKey(id))||'0')||0); }catch{ return 0; } }
  function setCursor(i){ try{ localStorage.setItem(cursorKey(id), String(i)); dispatchChanged(); }catch{} }
  function dispatchChanged(){ try{ window.localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{} }

  function render(){
    // Theory card: render if this section has an import marker
    try{
      const tCard = els.cards.t; const tEl = els.t; if (tCard && tEl){
        const srcKey = `sectionTheorySrc:${id}`; const from = localStorage.getItem(srcKey)||'';
        if (from){
          // Show card and render source section's raw text in its chosen renderMode
          tCard.hidden = false;
          const raw = localStorage.getItem(`sectionRaw:${from}`)||'';
          // Always render Theory as Markdown when possible, regardless of source mode
          if (window.mdToHtml){
            try{ tEl.innerHTML = sanitizeHtmlLocal(window.mdToHtml(raw)); }
            catch{ tEl.textContent = raw; }
          } else {
            tEl.textContent = raw;
          }
        } else {
          tCard.hidden = true; tEl.innerHTML = '';
        }
      }
    }catch{}
    const arr = getList();
    const idx = Math.min(getCursor(), Math.max(0, arr.length-1));
  els.empty.hidden = !!arr.length;
  if (!arr.length){ els.q.innerHTML=''; els.a.value=''; els.f.innerHTML=''; if(els.infoTop) els.infoTop.textContent=''; return; }
    const it = arr[idx] || {};
  els.q.innerHTML = (window.mdToHtml? sanitizeHtmlLocal(window.mdToHtml(it.q||'')) : (it.q||''));
    els.a.value = it.a || '';
  // Render feedback grouped by rounds (supports multi-graders; edit vs preview)
    const rounds = Array.isArray(it.fbRounds) ? it.fbRounds : (it.fb ? [String(it.fb)] : []);
    // Check for per-grader map
    const rawPark = localStorage.getItem(`sectionParking:${id}`);
    const park = rawPark ? (JSON.parse(rawPark)||{}) : {};
    const graders = Array.isArray(park.graders)? park.graders.map(g=>({ id:String(g.id||''), role:String(g.role||'') })) : (park.grader? [{ id:String(park.grader), role:'' }] : []);
    const fbByGrader = it.fbByGrader && typeof it.fbByGrader==='object' ? it.fbByGrader : null;
    // Visible graders filter (persisted per section)
    const visKey = (sid)=> `sectionGradersVisible:${sid}`;
    const getVisibleGraders = ()=>{ try{ const raw=localStorage.getItem(visKey(id)); if(!raw) return null; const arr=JSON.parse(raw)||[]; if(Array.isArray(arr)&&arr.length) return arr.map(String); return null; }catch{ return null; } };
    const setVisibleGraders = (list)=>{ try{ localStorage.setItem(visKey(id), JSON.stringify(list||[])); }catch{} };
    const graderName = (gid)=>{ try{ const raw = localStorage.getItem(`nodeSettings:${gid}`); if (raw){ const s = JSON.parse(raw)||{}; const nm = String(s.name||'').trim(); if (nm) return nm; } }catch{} return String(gid); };
  const main = els.main;
  // Clean up any previously rendered grader cards/vis bars
  try{ main.querySelectorAll('.grader-card, .grader-visbar').forEach(el=>el.remove()); }catch{}
  const isFree = !!(loadLayout().free);
  // If there are graders: render multi-panels; single-panel path only when no graders exist
  if (graders.length){
    const view = getFbView();
    if (!isFree){
      // Grid layout: show original feedback card and render per-grader blocks inside it (like free layout)
      try{ const cf = document.getElementById('cardF'); if (cf){ cf.hidden = false; cf.style.display = ''; } }catch{}
      const ids = graders.map(g=>String(g.id));
      // Normalize visibility
      let vis = getVisibleGraders();
      if (!Array.isArray(vis)){ try{ setVisibleGraders(ids); }catch{} vis = ids; }
      const curVis = getVisibleGraders();
      const bar = [
        '<div class="grader-visbar subtle" style="margin:6px 0; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">',
        '<span>Visa:</span>'
      ];
      graders.forEach(g=>{
        const active = !curVis || curVis.includes(String(g.id));
        const nm = graderName(g.id);
        bar.push(`<button type="button" class="btn btn-ghost" data-action="toggle-vis" data-gid="${g.id}" style="padding:2px 8px;">${nm}${active?' (på)':' (av)'}<\/button>`);
      });
      bar.push('</div>');
      try{ els.f.innerHTML = bar.join(''); }catch{ els.f.innerHTML = ''; }
      graders.forEach(g=>{
        if (curVis && !curVis.includes(String(g.id))) return;
        const nm = graderName(g.id);
        const rows = fbByGrader && Array.isArray(fbByGrader[g.id]) ? fbByGrader[g.id] : [];
        const header = `<div class=\"subtle\" style=\"margin:8px 0 6px; display:flex; align-items:center; justify-content:space-between; gap:8px;\"><span>${nm}</span><span><button type=\"button\" class=\"btn btn-ghost\" data-action=\"toggle-fb-view\">${(view==='preview')?'Redigera':'Förhandsgranska'}<\/button> <button type=\"button\" class=\"btn btn-ghost\" data-action=\"grade-one\" data-gid=\"${g.id}\">Rätta endast denna<\/button></span><\/div>`;
        els.f.insertAdjacentHTML('beforeend', header);
        if (!rows.length){ els.f.insertAdjacentHTML('beforeend', '<div class="subtle">Ingen feedback ännu.</div>'); els.f.insertAdjacentHTML('beforeend', '<hr style="border:none; border-top:1px solid #252532; margin:8px 0;">'); return; }
        rows.forEach((txt, i)=>{
          if (view==='preview'){
            let body = window.mdToHtml? sanitizeHtmlLocal(window.mdToHtml(String(txt||''))) : String(txt||'');
            try{ const info = getSectionGraderAttachmentsLocal(id) || { attItems: [] }; if (info.attItems && info.attItems.length){ body = linkifySectionRefsLocal(body, info.attItems); } }catch{}
            els.f.insertAdjacentHTML('beforeend', `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span></div><div class=\"fb-round fb-preview\" data-ri=\"${i}\" data-grader=\"${g.id}\" contenteditable=\"false\">${body}</div>`);
          } else {
            const body = window.mdToHtml? sanitizeHtmlLocal(window.mdToHtml(String(txt||''))) : String(txt||'');
            els.f.insertAdjacentHTML('beforeend', `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span></div><div class=\"fb-round\" data-ri=\"${i}\" data-grader=\"${g.id}\">${body}</div>`);
          }
        });
        els.f.insertAdjacentHTML('beforeend', '<hr style="border:none; border-top:1px solid #252532; margin:8px 0;">');
      });
      // Wire editable rounds or clickable refs
      if (view!=='preview'){
        try{
          els.f.querySelectorAll('.fb-round').forEach(el=>{
            el.contentEditable='true'; el.spellcheck=false;
            const saveNow = ()=>{
              try{
                const ri = Math.max(0, Number(el.getAttribute('data-ri')||'0')||0);
                const gid = String(el.getAttribute('data-grader')||''); if (!gid) return;
                const arr2 = getList(); const i2 = Math.min(getCursor(), Math.max(0, arr2.length-1));
                const it2 = arr2[i2] || {};
                if (!it2.fbByGrader || typeof it2.fbByGrader!=='object') it2.fbByGrader = {};
                const rows = Array.isArray(it2.fbByGrader[gid]) ? it2.fbByGrader[gid] : [];
                while (rows.length <= ri) rows.push('');
                rows[ri] = String(el.innerText||'').trim();
                it2.fbByGrader[gid] = rows;
                arr2[i2] = it2; setList(arr2);
              }catch{}
            };
            let t=null; el.addEventListener('input', ()=>{ try{ if (t) clearTimeout(t); t=setTimeout(saveNow, 500); }catch{} });
            el.addEventListener('blur', saveNow);
          });
        }catch{}
      } else {
        try{ const info = getSectionGraderAttachmentsLocal(id) || { attItems: [] }; if (info.attItems && info.attItems.length){ wireSectionRefClicksLocal(els.f, info.attItems, ''); } }catch{}
      }
      // Delegated actions for grid inside F card
      try{
        if (!els.f.__graderHandlers){
          els.f.__graderHandlers = true;
          els.f.addEventListener('click', (ev)=>{
            const toggleBtn = ev.target && ev.target.closest && ev.target.closest('button[data-action="toggle-vis"][data-gid]');
            const gradeBtn = ev.target && ev.target.closest && ev.target.closest('button[data-action="grade-one"][data-gid]');
            const toggleViewBtn = ev.target && ev.target.closest && ev.target.closest('button[data-action="toggle-fb-view"]');
            if (!toggleBtn && !gradeBtn && !toggleViewBtn) return; ev.preventDefault(); ev.stopPropagation();
            if (toggleBtn){
              try{
                const gid = String(toggleBtn.getAttribute('data-gid')||'');
                const cur = getVisibleGraders();
                let next = Array.isArray(cur) ? cur.slice() : graders.map(x=>String(x.id));
                if (next.includes(gid)) next = next.filter(x=>x!==gid); else next.push(gid);
                setVisibleGraders(next);
                render();
              }catch{}
              return;
            }
            if (toggleViewBtn){
              try{ const curV = getFbView(); setFbView(curV==='preview'?'edit':'preview'); render(); }catch{}
              return;
            }
            if (gradeBtn){
              try{
                const gid = String(gradeBtn.getAttribute('data-gid')||''); if (!gid) return;
                const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it){ alert('Ingen fråga vald.'); return; }
                const n = i+1;
                const payloadText = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                try{ localStorage.setItem(`sectionPendingFeedback:${id}:${gid}`, String(i)); }catch{}
                try{ document.getElementById('fxFLoad')?.classList.add('show'); }catch{}
                let sent = false;
                if (window.requestAIReply){ try{ window.requestAIReply(gid, { text: payloadText, sourceId: id }); sent = true; }catch{} }
                if (!sent && window.routeMessageFrom){ try{ window.routeMessageFrom(id, payloadText, { author: 'Fråga', who:'user', ts: Date.now() }); sent = true; }catch{} }
                try{
                  let cont = document.getElementById('toastContainer');
                  if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
                  const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Skickat till rättare (endast denna)'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1100);
                }catch{}
              }catch{}
            }
          }, { once:false });
        }
      }catch{}
      return;
    } else {
  // Free layout: show the original feedback card and render per-grader blocks inside it
  try{ const cf = document.getElementById('cardF'); if (cf){ cf.hidden = false; cf.style.display = ''; } }catch{}
      const ids = graders.map(g=>String(g.id));
      // Normalize visibility
      let vis = getVisibleGraders();
      if (!Array.isArray(vis)){ try{ setVisibleGraders(ids); }catch{} vis = ids; }
      const curVis = getVisibleGraders();
      const bar = [
        '<div class="grader-visbar subtle" style="margin:6px 0; display:flex; flex-wrap:wrap; gap:6px; align-items:center;">',
        '<span>Visa:</span>'
      ];
      graders.forEach(g=>{
        const active = !curVis || curVis.includes(String(g.id));
        const nm = graderName(g.id);
        bar.push(`<button type="button" class="btn btn-ghost" data-action="toggle-vis" data-gid="${g.id}" style="padding:2px 8px;">${nm}${active?' (på)':' (av)'}</button>`);
      });
      bar.push('</div>');
      try{ els.f.innerHTML = bar.join(''); }catch{ els.f.innerHTML = ''; }
      graders.forEach(g=>{
        if (curVis && !curVis.includes(String(g.id))) return;
        const nm = graderName(g.id);
        const rows = fbByGrader && Array.isArray(fbByGrader[g.id]) ? fbByGrader[g.id] : [];
        const header = `<div class=\"subtle\" style=\"margin:8px 0 6px; display:flex; align-items:center; justify-content:space-between; gap:8px;\"><span>${nm}</span><button type=\"button\" class=\"btn btn-ghost\" data-action=\"grade-one\" data-gid=\"${g.id}\">Rätta endast denna<\/button><\/div>`;
        els.f.insertAdjacentHTML('beforeend', header);
        if (!rows.length){ els.f.insertAdjacentHTML('beforeend', '<div class="subtle">Ingen feedback ännu.</div>'); return; }
        rows.forEach((txt, i)=>{
          if (view==='preview'){
            let body = window.mdToHtml? sanitizeHtmlLocal(window.mdToHtml(String(txt||''))) : String(txt||'');
            try{ const info = getSectionGraderAttachmentsLocal(id) || { attItems: [] }; if (info.attItems && info.attItems.length){ body = linkifySectionRefsLocal(body, info.attItems); } }catch{}
            els.f.insertAdjacentHTML('beforeend', `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span></div><div class=\"fb-round fb-preview\" data-ri=\"${i}\" data-grader=\"${g.id}\" contenteditable=\"false\">${body}</div>`);
          } else {
            const body = window.mdToHtml? sanitizeHtmlLocal(window.mdToHtml(String(txt||''))) : String(txt||'');
            els.f.insertAdjacentHTML('beforeend', `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span></div><div class=\"fb-round\" data-ri=\"${i}\" data-grader=\"${g.id}\">${body}</div>`);
          }
        });
        els.f.insertAdjacentHTML('beforeend', '<hr style="border:none; border-top:1px solid #252532; margin:8px 0;">');
      });
      // Wire editable rounds or clickable refs in free layout
      if (view!=='preview'){
        try{
          els.f.querySelectorAll('.fb-round').forEach(el=>{
            el.contentEditable='true'; el.spellcheck=false;
            const saveNow = ()=>{
              try{
                const ri = Math.max(0, Number(el.getAttribute('data-ri')||'0')||0);
                const gid = String(el.getAttribute('data-grader')||''); if (!gid) return;
                const arr2 = getList(); const i2 = Math.min(getCursor(), Math.max(0, arr2.length-1));
                const it2 = arr2[i2] || {};
                if (!it2.fbByGrader || typeof it2.fbByGrader!=='object') it2.fbByGrader = {};
                const rows = Array.isArray(it2.fbByGrader[gid]) ? it2.fbByGrader[gid] : [];
                while (rows.length <= ri) rows.push('');
                rows[ri] = String(el.innerText||'').trim();
                it2.fbByGrader[gid] = rows;
                arr2[i2] = it2; setList(arr2);
              }catch{}
            };
            let t=null; el.addEventListener('input', ()=>{ try{ if (t) clearTimeout(t); t=setTimeout(saveNow, 500); }catch{} });
            el.addEventListener('blur', saveNow);
          });
        }catch{}
      } else {
        try{ const info = getSectionGraderAttachmentsLocal(id) || { attItems: [] }; if (info.attItems && info.attItems.length){ wireSectionRefClicksLocal(els.f, info.attItems, ''); } }catch{}
      }
      // Delegated actions in free layout
      try{
        if (!els.f.__graderHandlers){
          els.f.__graderHandlers = true;
          els.f.addEventListener('click', (ev)=>{
            const toggleBtn = ev.target && ev.target.closest && ev.target.closest('button[data-action="toggle-vis"][data-gid]');
            const gradeBtn = ev.target && ev.target.closest && ev.target.closest('button[data-action="grade-one"][data-gid]');
            if (!toggleBtn && !gradeBtn) return; ev.preventDefault(); ev.stopPropagation();
            if (toggleBtn){
              try{
                const gid = String(toggleBtn.getAttribute('data-gid')||'');
                const cur = getVisibleGraders();
                let next = Array.isArray(cur) ? cur.slice() : graders.map(x=>String(x.id));
                if (next.includes(gid)) next = next.filter(x=>x!==gid); else next.push(gid);
                setVisibleGraders(next);
                render();
              }catch{}
              return;
            }
            if (gradeBtn){
              try{
                const gid = String(gradeBtn.getAttribute('data-gid')||''); if (!gid) return;
                const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it){ alert('Ingen fråga vald.'); return; }
                const n = i+1;
                const payloadText = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                try{ localStorage.setItem(`sectionPendingFeedback:${id}:${gid}`, String(i)); }catch{}
                try{ document.getElementById('fxFLoad')?.classList.add('show'); }catch{}
                let sent = false;
                if (window.requestAIReply){ try{ window.requestAIReply(gid, { text: payloadText, sourceId: id }); sent = true; }catch{} }
                if (!sent && window.routeMessageFrom){ try{ window.routeMessageFrom(id, payloadText, { author: 'Fråga', who:'user', ts: Date.now() }); sent = true; }catch{} }
                try{
                  let cont = document.getElementById('toastContainer');
                  if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
                  const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Skickat till rättare (endast denna)'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1100);
                }catch{}
              }catch{}
            }
          }, { once:false });
        }
      }catch{}
      return;
    }
  }
  // No graders configured: show an informational message instead of legacy single-panel
  try{ els.f.innerHTML = '<div class="subtle">Ingen rättare vald. Lägg till en eller flera rättare i sektionen för att visa feedback här.</div>'; }catch{ els.f.textContent = 'Ingen rättare vald.'; }
  const counter = `${idx+1} / ${arr.length}`;
  if (els.infoTop) els.infoTop.textContent = counter;
  // Update round label
  try{
    const rb = document.getElementById('fxRoundBtn'); if (rb){ const n = Math.max(1, Number(localStorage.getItem(roundKey(id))||'1')||1); rb.textContent = `Omgång ${n} ▾`; }
  }catch{}
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
  updateLayoutUI(free);
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
  function toggleLayout(){
    const l = loadLayout();
    const goingFree = !l.free;
    if (goingFree){
      // Capture current fixed (grid) positions/sizes relative to the main container
      try{
        const cont = els.main.getBoundingClientRect();
        // Predict container offset in free mode (so saved coords preserve viewport position)
        let deltaX = 0, deltaY = 0;
        try{
          const wrap = document.querySelector('.fx-wrap');
          if (wrap){
            const prevVis = wrap.style.visibility;
            wrap.style.visibility = 'hidden';
            wrap.classList.add('free');
            const contAfter = els.main.getBoundingClientRect();
            wrap.classList.remove('free');
            wrap.style.visibility = prevVis;
            deltaX = Math.round(cont.left - contAfter.left);
            deltaY = Math.round(cont.top - contAfter.top);
          }
        }catch{}
        const snap = (el)=>{
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: Math.round((r.left - cont.left) + deltaX),
            y: Math.round((r.top - cont.top) + deltaY),
            w: Math.round(r.width),
            h: Math.round(r.height)
          };
        };
        const next = Object.assign({}, l, { free: true });
        const q = snap(els.cards.q); if (q) next.q = q;
        const a = snap(els.cards.a); if (a) next.a = a;
        const f = snap(els.cards.f); if (f) next.f = f;
        const t = snap(els.cards.t); if (t) next.t = t;
        // If Theory exists, clamp its Y so it starts below Q/A/F stack when entering free layout
        try{
          if (next.t){
            const rQ = els.cards.q?.getBoundingClientRect();
            const rA = els.cards.a?.getBoundingClientRect();
            const rF = els.cards.f?.getBoundingClientRect();
            const bottoms = [rQ?.bottom, rA?.bottom, rF?.bottom].filter(v=>Number.isFinite(v));
            if (bottoms.length){
              const minTopAbs = Math.max.apply(null, bottoms);
              const minY = Math.max(0, Math.round(minTopAbs - cont.top) + 12 + deltaY);
              if (next.t.y < minY) next.t.y = minY;
            }
          }
        }catch{}
        saveLayout(next);
      }catch{ l.free = true; saveLayout(l); }
    } else {
      l.free = false; saveLayout(l);
    }
    applyLayout();
  }

  function persistCard(card){
  const name = card.id==='cardQ'?'q': card.id==='cardA'?'a': card.id==='cardF'?'f':'t';
    const r = card.getBoundingClientRect();
    const c = els.main.getBoundingClientRect();
    const l = loadLayout(); l[name] = { x: Math.round(r.left - c.left), y: Math.round(r.top - c.top), w: Math.round(r.width), h: Math.round(r.height) }; saveLayout(l);
  }
  function initLayout(){
    // If requested by parent, expand to viewport width
    if (wide){ try{ const wrap=document.querySelector('.fx-wrap'); if (wrap){ wrap.classList.add('free'); wrap.style.maxWidth='100vw'; wrap.style.margin='0'; } }catch{} }
    Object.values(els.cards).forEach(c=>{
      if(!c) return;
      const handle = c.querySelector('.drag-handle');
      const grip = c.querySelector('.fx-resize');
      if (window.makeDraggableWithin && handle){
        window.makeDraggableWithin(els.main, c, handle, {
          enabled: ()=> loadLayout().free===true,
          // Prevent Theory card (T) from covering Q/A/F: clamp its top within a safe band
      bounds: (el, cont)=>{
            try{
              if (el.id === 'cardT'){
        const rQ = els.cards.q?.getBoundingClientRect();
        const rA = els.cards.a?.getBoundingClientRect();
        const rF = els.cards.f?.getBoundingClientRect();
        const rc = cont.getBoundingClientRect();
        // Keep Theory strictly below the Q/A/F stack: anchor to their maximum bottom + gap
        const bottoms = [rQ?.bottom, rA?.bottom, rF?.bottom].filter(v=>Number.isFinite(v));
        const minTopAbs = bottoms.length ? Math.max.apply(null, bottoms) : rc.top + 20;
        const minY = Math.max(0, Math.round(minTopAbs - rc.top) + 12);
        return { minX: 0, minY, maxX: rc.width - el.offsetWidth, maxY: rc.height - el.offsetHeight };
              }
            }catch{}
            return { minX: 0, minY: 0, maxX: cont.clientWidth - c.offsetWidth, maxY: cont.clientHeight - c.offsetHeight };
          },
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

  // Wire nav (skip Close in embed)
  document.getElementById('fxPrev').addEventListener('click', ()=>{ const arr=getList(); const n=Math.max(0, getCursor()-1); setCursor(n); render(); });
  document.getElementById('fxNext').addEventListener('click', ()=>{ const arr=getList(); const n=Math.min(Math.max(0, arr.length-1), getCursor()+1); setCursor(n); render(); });
  if (!embed){ document.getElementById('fxClose').addEventListener('click', ()=>{ window.close(); }); }
  // Round dropdown wiring
  (function(){
    const btn = document.getElementById('fxRoundBtn'); const menu = document.getElementById('fxRoundMenu'); const reset = document.getElementById('fxRoundReset'); if(!btn||!menu||!reset) return;
    const show=()=>menu.classList.remove('hidden'); const hide=()=>menu.classList.add('hidden');
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); if(menu.classList.contains('hidden')) show(); else hide(); });
    document.addEventListener('click', ()=>hide());
    reset.addEventListener('click', ()=>{ try{ localStorage.setItem(roundKey(id), '1'); localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{} hide(); render(); });
  })();
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
  // Feedback edit/preview toggle
  (function(){
    let btn = document.getElementById('fxFToggle');
    if (!btn){
      try{
        const meta = document.getElementById('fxMetaF');
        if (meta){
          const host = meta.querySelector('div') || meta;
          btn = document.createElement('button');
          btn.type = 'button';
          btn.id = 'fxFToggle';
          btn.className = 'btn btn-ghost';
          btn.title = 'Visa förhandsgranskning';
          btn.textContent = 'Förhandsgranska';
          host.appendChild(btn);
        }
      }catch{}
    }
    if(!btn) return;
    const apply=()=>{ const v=getFbView(); btn.textContent = (v==='preview')? 'Redigera' : 'Förhandsgranska'; btn.title = (v==='preview')? 'Switcha till redigering' : 'Visa förhandsgranskning'; };
    apply();
    btn.addEventListener('click', ()=>{ const cur=getFbView(); setFbView(cur==='preview'?'edit':'preview'); apply(); render(); });
  })();
  // Initialize layout badge state once on load
  try{ updateLayoutUI(!!(loadLayout().free)); }catch{}
  // Question improver mini-chat
  (function(){
    const inp = document.getElementById('fxQChat'); const send = document.getElementById('fxQSend'); if (!inp || !send) return;
  const qLoad = document.getElementById('fxQLoad');
  // Bubble effect instance attached to the question card
  let bubbleFx = null; try{ const host = document.getElementById('cardQ'); if (host && window.BubbleEffect) bubbleFx = new window.BubbleEffect(host); }catch{}
  let activeBubble = null; let bubbleTimer = null;
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
  // show loader on question card
      try{ qLoad?.classList.add('show'); }catch{}
      // Spawn a floating bubble from the chat input and schedule a timed pop
      try{
        if (bubbleFx){
          if (activeBubble) { try{ activeBubble.dispose(); }catch{} activeBubble=null; }
          activeBubble = bubbleFx.spawnAt(inp, v);
          if (bubbleTimer) { try{ clearTimeout(bubbleTimer); }catch{} bubbleTimer=null; }
          bubbleTimer = setTimeout(()=>{ try{ if (activeBubble){ activeBubble.fadeOut(10000); activeBubble=null; } }catch{} }, 10000);
        }
      }catch{}
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
  // Bubble now pops on a hardcoded timer; keep loader cleanup via existing listeners above
  })();
  // Grade current question via backend /chat
  (function(){
    const btn = document.getElementById('fxGrade'); if (!btn) return;
  const fLoad = document.getElementById('fxFLoad');
    btn.addEventListener('click', ()=>{
      try{
        const arr = getList(); const i = getCursor(); const it = arr[i]; if (!it){ alert('Ingen fråga vald.'); return; }
        const n = i+1;
        const payloadText = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
        // Mark pending feedback so the coworker reply is stored here (cross-tab)
        try{
          const rawP = localStorage.getItem(`sectionParking:${id}`);
          const p = rawP ? (JSON.parse(rawP)||{}) : {};
          const graders = Array.isArray(p.graders)? p.graders : (p.grader? [{ id:String(p.grader), role:'' }] : []);
          if (graders && graders.length){ graders.forEach(g=>{ const gid=String(g?.id||''); if (!gid) return; localStorage.setItem(`sectionPendingFeedback:${id}:${gid}`, String(i)); }); }
          else { localStorage.setItem(`sectionPendingFeedback:${id}`, String(i)); }
        }catch{}
        // Prefer parked Grader
        const parkRaw = localStorage.getItem(`sectionParking:${id}`);
        const park = parkRaw ? (JSON.parse(parkRaw)||{}) : {};
        const gradersSend = Array.isArray(park.graders)? park.graders : (park.grader? [{ id:String(park.grader), role:'' }] : []);
        if (!gradersSend || !gradersSend.length){ alert('Ingen "Rättare"-nod vald i sektionen. Välj en eller flera CoWorker-noder.'); return; }
    // show loader on feedback card
    try{ fLoad?.classList.add('show'); }catch{}
        let sent = false;
        if (window.requestAIReply){ try{ gradersSend.forEach(g=>{ const gid=String(g?.id||''); if (!gid) return; window.requestAIReply(gid, { text: payloadText, sourceId: id }); }); sent = true; }catch{} }
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
  // Remove Theory mapping
  (function(){
    const btn = document.getElementById('fxTRemove'); if (!btn) return;
  // Avoid triggering drag when pressing the button in layout mode
  btn.addEventListener('mousedown', (e)=>{ e.stopPropagation(); });
    btn.addEventListener('click', ()=>{
      try{
        const k = `sectionTheorySrc:${id}`;
        localStorage.removeItem(k);
        // notify others
        try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
        // tiny toast
        try{
          let cont = document.getElementById('toastContainer');
          if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
          const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Teorikoppling borttagen'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1100);
        }catch{}
        render();
      }catch{}
    });
  })();
  // Make question content editable and persist
  try{
    els.q.contentEditable = 'true';
    els.q.spellcheck = false;
    const saveQ = ()=>{ try{ const arr=getList(); const i=getCursor(); if(arr[i]){ arr[i].q = String(els.q.innerText||'').trim(); setList(arr); } }catch{} };
    let tq=null; els.q.addEventListener('input', ()=>{ try{ if (tq) clearTimeout(tq); tq=setTimeout(saveQ, 500); }catch{} });
    els.q.addEventListener('blur', saveQ);
  }catch{}

  // Cross-tab sync via storage events
  window.addEventListener('storage', (e)=>{
    try{
      if (!e) return;
  if (e.key && (e.key === key(id) || e.key === cursorKey(id) || e.key === roundKey(id) || e.key === fbViewKey(id) || e.key === `sectionParking:${id}` || e.key === `sectionGradersVisible:${id}` || /^nodeAttachments:/.test(e.key||'') || e.key === '__exercises_changed__' || /^sectionRaw:/.test(e.key) || /^sectionSettings:/.test(e.key) || e.key === `sectionTheorySrc:${id}`)){
        render();
      }
    }catch{}
  });
  // Same-tab global event (dispatched by connect.js when exercises change)
  window.addEventListener('exercises-data-changed-global', (ev)=>{
  try{ render(); }catch{}
  // hide loaders when data changed
  try{ document.getElementById('fxFLoad')?.classList.remove('show'); }catch{}
  try{ document.getElementById('fxQLoad')?.classList.remove('show'); }catch{}
  });
  // Also hide loaders when backend signals an AI request finished (success or error)
  window.addEventListener('ai-request-finished', (ev)=>{
    try{
      const src = ev?.detail?.sourceId; if (!src) return;
      // Only react if event is for this section id
      if (String(src) !== String(id)) return;
      document.getElementById('fxFLoad')?.classList.remove('show');
      document.getElementById('fxQLoad')?.classList.remove('show');
    }catch{}
  });

  initLayout();
  render();
})();
