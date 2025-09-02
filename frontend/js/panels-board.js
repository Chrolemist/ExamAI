// BoardView panels module: renders sections in board view
(function(){
  if (!window.__Refs) return;
  const { gatherInputAttachments, linkifyRefs, wireRefClicks } = window.__Refs;
  try{ window.PanelsBoard = { version: '0.1.0' }; }catch{}

  function sanitizeHtml(html){ try{ return window.sanitizeHtml? window.sanitizeHtml(String(html||'')) : String(html||''); }catch{ return String(html||''); } }

  function readSecMode(id){ try{ const raw=localStorage.getItem(`sectionSettings:${id}`); if(!raw) return 'raw'; const s=JSON.parse(raw)||{}; return String(s.renderMode||'raw'); }catch{ return 'raw'; } }

  // Public API called by mainContentArea.js after load
  window.initBoardSectionSettings = function(){
    try{
      document.querySelectorAll('.panel.board-section').forEach((sec)=>{
        const id = sec.dataset.sectionId || '';
        if (!id) return;
        const head = sec.querySelector('.head'); const note = sec.querySelector('.note');
        if (!head || !note) return;

        // Toolbars visibility toggle
        const updateToolbarVisibility = (mode)=>{
          try{
            const exTb = head.querySelector('[data-role="exToolbar"]');
            const txtTb = head.querySelector('[data-role="textToolbar"]');
            const isEx = mode === 'exercises';
            if (exTb) exTb.style.display = isEx ? 'flex' : 'none';
            if (txtTb) txtTb.style.display = isEx ? 'none' : 'flex';
          }catch{}
        };

        // Render helpers
        const renderMd = ()=>{
          const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
          localStorage.setItem(`sectionRaw:${id}`, src);
          try{
            const html0 = sanitizeHtml(window.mdToHtml? window.mdToHtml(src) : src);
            const attItems = gatherInputAttachments(id);
            const html = attItems.length ? linkifyRefs(html0, attItems) : html0;
            note.innerHTML = html; note.dataset.rendered = '1';
            if (attItems.length) wireRefClicks(note, attItems, String(src||''));
          }catch{ note.innerHTML = sanitizeHtml(window.mdToHtml? window.mdToHtml(src) : src); note.dataset.rendered = '1'; }
        };
        const renderHtml = ()=>{
          const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerHTML || '');
          localStorage.setItem(`sectionRaw:${id}`, src);
          try{
            const html0 = sanitizeHtml(src);
            const attItems = gatherInputAttachments(id);
            const html = attItems.length ? linkifyRefs(html0, attItems) : html0;
            note.innerHTML = html; note.dataset.rendered = '1';
            if (attItems.length) wireRefClicks(note, attItems, String(src||''));
          }catch{ note.innerHTML = sanitizeHtml(src); note.dataset.rendered = '1'; }
        };
        const renderRaw = ()=>{
          const src = localStorage.getItem(`sectionRaw:${id}`) || (note.innerText || '');
          localStorage.setItem(`sectionRaw:${id}`, src);
          note.textContent = src; delete note.dataset.rendered;
        };

        // Visning selector (create if missing)
        if (!head.querySelector('[data-role="secRenderMode"]')){
          const wrap = document.createElement('div');
          wrap.style.marginLeft='auto'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px';
          const label = document.createElement('label'); label.className='subtle'; label.textContent='Visning:';
          const sel = document.createElement('select'); sel.setAttribute('data-role','secRenderMode');
          sel.innerHTML = '<option value="raw">Rå text</option><option value="md">Markdown</option><option value="html">HTML</option><option value="exercises">Övningsblock</option>';
          try{ const raw = localStorage.getItem(`sectionSettings:${id}`); const saved = raw? JSON.parse(raw):{}; if (saved.renderMode) sel.value=saved.renderMode; }catch{}
          try{ updateToolbarVisibility(sel.value||'raw'); }catch{}
          sel.addEventListener('change', ()=>{
            try{
              const raw = localStorage.getItem(`sectionSettings:${id}`); const cur = raw? JSON.parse(raw):{};
              const next = Object.assign({}, cur, { renderMode: sel.value });
              localStorage.setItem(`sectionSettings:${id}`, JSON.stringify(next));
              const mode = sel.value;
              if (mode==='exercises'){
                try{ const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; } }catch{}
                sec.setAttribute('data-mode','exercises');
                try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
              } else if (mode==='md'){
                sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
                try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                renderMd();
              } else if (mode==='html'){
                sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
                try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                renderHtml();
              } else {
                sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
                try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
                renderRaw();
              }
              try{ updateToolbarVisibility(mode); }catch{}
            }catch{}
          });
          wrap.appendChild(label); wrap.appendChild(sel);
          const io = head.querySelector('.section-io'); if (io && io.parentElement===head){ head.insertBefore(wrap, io); } else head.appendChild(wrap);
        }

        // Make section IO points (in/out) interactive for starting connections
        try{
          head.querySelectorAll('.section-io, .conn-point').forEach(io=>{
            if (!io._wired){ window.makeConnPointInteractive && window.makeConnPointInteractive(io, sec); io._wired = true; }
          });
        }catch{}

        // Exercises toolbar + parking (migrated from legacy panels.js)
        if (!head.querySelector('[data-role="exToolbar"]')){
          const exBar = document.createElement('div');
          exBar.setAttribute('data-role','exToolbar');
          exBar.style.display = 'flex';
          exBar.style.gap = '6px';
          exBar.style.flexWrap = 'nowrap';
          exBar.style.marginLeft = '8px';
          const btnAdd = document.createElement('button');
          btnAdd.type = 'button'; btnAdd.textContent = 'Övningsblock +'; btnAdd.className='btn btn-ghost';
          const btnGradeAll = document.createElement('button');
          btnGradeAll.type = 'button'; btnGradeAll.textContent = 'Rätta alla frågor'; btnGradeAll.className='btn';
          const btnClearAnswers = document.createElement('button');
          btnClearAnswers.type = 'button'; btnClearAnswers.textContent = 'Rensa alla svar'; btnClearAnswers.className='btn btn-ghost';
          const btnDeleteAll = document.createElement('button');
          btnDeleteAll.type = 'button'; btnDeleteAll.textContent = 'Ta bort alla'; btnDeleteAll.className='btn btn-ghost';
          exBar.appendChild(btnAdd); exBar.appendChild(btnGradeAll); exBar.appendChild(btnClearAnswers); exBar.appendChild(btnDeleteAll);

          // Parking slots: Graders (multi with roles), Improver (single), Inputs (ordered multi)
          const parkWrap = document.createElement('div');
          parkWrap.style.display='flex'; parkWrap.style.gap='8px'; parkWrap.style.alignItems='center'; parkWrap.style.marginLeft='12px';
          const mkSel = (labelText)=>{ const wrap=document.createElement('label'); wrap.className='subtle'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='6px'; const span=document.createElement('span'); span.textContent=labelText; const sel=document.createElement('select'); sel.className='btn'; wrap.appendChild(span); wrap.appendChild(sel); return { wrap, sel, span }; };
          // Graders chips + manage
          const gradersWrap = document.createElement('label'); gradersWrap.className='subtle'; Object.assign(gradersWrap.style,{ display:'flex', alignItems:'center', gap:'6px', maxWidth:'60%' });
          const gradersLabel = document.createElement('span'); gradersLabel.textContent = 'Rättare:';
          const gradersChips = document.createElement('div'); Object.assign(gradersChips.style,{ display:'flex', alignItems:'center', gap:'6px', overflow:'hidden' });
          const gradersManage = document.createElement('button'); gradersManage.type='button'; gradersManage.className='btn btn-ghost'; gradersManage.textContent='Hantera'; gradersManage.title='Välj, ordna och ange roller för rättare'; gradersManage.style.padding='2px 8px';
          gradersWrap.appendChild(gradersLabel); gradersWrap.appendChild(gradersChips); gradersWrap.appendChild(gradersManage);
          const selImprover = mkSel('Förbättra fråga:');
          // Inputs chips + manage
          const inputsWrap = document.createElement('label'); inputsWrap.className='subtle'; Object.assign(inputsWrap.style,{ display:'flex', alignItems:'center', gap:'6px', maxWidth:'60%' });
          const inputsLabel = document.createElement('span'); inputsLabel.textContent = 'Inmatning:';
          const chipsWrap = document.createElement('div'); Object.assign(chipsWrap.style,{ display:'flex', alignItems:'center', gap:'6px', overflow:'hidden' });
          const manageBtn = document.createElement('button'); manageBtn.type='button'; manageBtn.className='btn btn-ghost'; manageBtn.textContent='Hantera'; manageBtn.title='Välj och ordna inmatningar'; manageBtn.style.padding='2px 8px';
          inputsWrap.appendChild(inputsLabel); inputsWrap.appendChild(chipsWrap); inputsWrap.appendChild(manageBtn);
          parkWrap.appendChild(gradersWrap); parkWrap.appendChild(selImprover.wrap); parkWrap.appendChild(inputsWrap);
          exBar.appendChild(parkWrap);

          // Export dropdown: expose this section as Theory in another section's fullscreen
          try{
            const expWrap = document.createElement('label'); expWrap.className='subtle'; expWrap.style.display='flex'; expWrap.style.alignItems='center'; expWrap.style.gap='6px'; expWrap.style.marginLeft='12px';
            const span = document.createElement('span'); span.textContent = 'Exportera till:';
            const sel = document.createElement('select'); sel.className='btn';
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
            refreshBtn.addEventListener('click', ()=> fillSections());
            sel.addEventListener('change', ()=>{
              try{
                const targetId = String(sel.value||''); if (!targetId) return;
                localStorage.setItem(`sectionTheorySrc:${targetId}`, id);
                try{ localStorage.setItem('__exercises_changed__', String(Date.now())); }catch{}
                // toast
                let cont = document.getElementById('toastContainer'); if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
                const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Export kopplad – öppna helskärm på målsektionen för att visa Teori.'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1500);
                sel.value='';
              }catch{}
            });
            window.addEventListener('board-sections-changed', fillSections);
            window.addEventListener('storage', (e)=>{ try{ if (!e||!e.key) return; if (e.key==='boardSections:list:v1' || /^boardSection:title:/.test(e.key)) fillSections(); }catch{} });
          }catch{}

          head.appendChild(exBar);

          // Storage helpers and UI wiring for exercises focus
          const grid = sec.querySelector('.body .grid') || sec.querySelector('.body');
          const getExercises = ()=>{ try{ const raw = localStorage.getItem(`sectionExercises:${id}`); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } };
          const setExercises = (arr)=>{ try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr||[])); }catch{} };
          const getParking = ()=>{ try{ const raw = localStorage.getItem(`sectionParking:${id}`); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } };
          const setParking = (obj)=>{ try{ localStorage.setItem(`sectionParking:${id}`, JSON.stringify(obj||{})); }catch{} };
          const getInputs = ()=>{ try{ const p=getParking(); if (Array.isArray(p.inputs)) return p.inputs.map(String); const one = p.input? String(p.input):''; return one?[one]:[]; }catch{ return []; } };
          const setInputs = (arr)=>{
            try{
              const p = getParking();
              const next = []; const seen = new Set();
              for (const v of (arr||[])){
                const s = String(v||'');
                if (s === '') { next.push(''); continue; }
                if (!seen.has(s)) { seen.add(s); next.push(s); }
              }
              p.inputs = next; p.input = next.find(v=>v)!==undefined ? (next.find(v=>v) || null) : null;
              setParking(p);
            }catch{}
          };

          // Populate parking selectors with coworker nodes and persist selection
          try{
            const fillFromCoworkers = ()=>{
              const opts = [{ value:'', label:'— Välj nod —' }];
              const idToLabel = new Map();
              document.querySelectorAll('.fab[data-type="coworker"]').forEach(el=>{
                const value = el.dataset.id||''; const label = el.dataset.displayName || ('CoWorker '+value);
                if (value){ opts.push({ value, label }); idToLabel.set(value, label); }
              });
              const fill = (sel)=>{ sel.innerHTML=''; opts.forEach(o=>{ const op=document.createElement('option'); op.value=o.value; op.textContent=o.label; sel.appendChild(op); }); };
              // Helpers for graders (multi)
              const getGraders = ()=>{ try{ const p=getParking(); if (Array.isArray(p.graders)) return (p.graders||[]).map(x=>({ id:String(x.id||''), role:String(x.role||'') })); const g=p.grader?String(p.grader):''; return g?[{ id:g, role:'' }]:[]; }catch{ return []; } };
              const setGraders = (arr)=>{ try{ const p=getParking(); const clean=[]; const seen=new Set(); (arr||[]).forEach(x=>{ const id=String(x?.id||''); const role=String(x?.role||''); if(!id) return; if(seen.has(id)) return; seen.add(id); clean.push({ id, role }); }); p.graders = clean; p.grader = clean[0]?.id || null; setParking(p); }catch{} };
              const cur = getParking();
              const prevImprover = cur && cur.improver ? String(cur.improver) : '';
              fill(selImprover.sel);
              if (prevImprover) selImprover.sel.value = prevImprover;
              // Render selected Inputs chips
              const renderChips = ()=>{
                chipsWrap.innerHTML='';
                const values = getInputs();
                const maxChips = 6; const shown = values.slice(0, maxChips);
                shown.forEach((id, idx)=>{
                  const name = idToLabel.get(String(id)) || String(id);
                  const chip = document.createElement('span');
                  Object.assign(chip.style,{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'2px 6px', border:'1px solid #3a3a4a', borderRadius:'999px', color:'#cfd3e3', background:'rgba(255,255,255,0.03)', fontSize:'12px', maxWidth:'160px' });
                  const badge = document.createElement('span'); badge.textContent = String(idx+1); Object.assign(badge.style,{ display:'inline-flex', width:'16px', height:'16px', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'#ccc', border:'1px solid #3a3a4a', borderRadius:'999px' });
                  const label = document.createElement('span'); label.textContent = name; label.style.overflow='hidden'; label.style.textOverflow='ellipsis'; label.style.whiteSpace='nowrap';
                  chip.appendChild(badge); chip.appendChild(label);
                  chipsWrap.appendChild(chip);
                });
                if (values.length > maxChips){ const more = document.createElement('span'); more.textContent = `+${values.length - maxChips}`; Object.assign(more.style,{ padding:'2px 6px', border:'1px dashed #3a3a4a', borderRadius:'999px', color:'#aaa', fontSize:'12px' }); chipsWrap.appendChild(more); }
              };
              renderChips();
              // Render graders chips (ordered with roles)
              const getNodeRole = (gid)=>{ try{ const raw=localStorage.getItem(`nodeSettings:${gid}`); if(!raw) return ''; const s=JSON.parse(raw)||{}; const r=String(s.role||'').trim(); return r; }catch{ return ''; } };
              const renderGraders = ()=>{
                gradersChips.innerHTML='';
                const list = getGraders(); const max = 6; const shown = list.slice(0, max);
                shown.forEach((g, idx)=>{
                  const name = idToLabel.get(String(g.id)) || String(g.id);
                  const roleTxt = getNodeRole(String(g.id));
                  const chip = document.createElement('span');
                  Object.assign(chip.style,{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'2px 6px', border:'1px solid #3a3a4a', borderRadius:'999px', color:'#cfd3e3', background:'rgba(255,255,255,0.03)', fontSize:'12px', maxWidth:'220px' });
                  const badge = document.createElement('span'); badge.textContent = String(idx+1); Object.assign(badge.style,{ display:'inline-flex', width:'16px', height:'16px', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'#ccc', border:'1px solid #3a3a4a', borderRadius:'999px' });
                  const label = document.createElement('span'); label.textContent = roleTxt ? `${name} — ${roleTxt}` : name; label.style.overflow='hidden'; label.style.textOverflow='ellipsis'; label.style.whiteSpace='nowrap';
                  chip.appendChild(badge); chip.appendChild(label);
                  gradersChips.appendChild(chip);
                });
                if (list.length > max){ const more=document.createElement('span'); more.textContent = `+${list.length-max}`; Object.assign(more.style,{ padding:'2px 6px', border:'1px dashed #3a3a4a', borderRadius:'999px', color:'#aaa', fontSize:'12px' }); gradersChips.appendChild(more); }
              };
              renderGraders();

              // Popovers
              const openInputsManager = ()=>{
                let sel = getInputs().filter(Boolean);
                const all = opts.filter(o=>o.value);
                const anchor = manageBtn; const r = anchor.getBoundingClientRect();
                const pop = document.createElement('div'); Object.assign(pop.style,{ position:'fixed', left:Math.max(8, Math.min(window.innerWidth-360, r.left))+'px', top:(r.bottom+6)+'px', zIndex:'10080', width:'340px', maxHeight:'60vh', overflow:'auto', padding:'10px', background:'linear-gradient(180deg,#121219,#0e0e14)', border:'1px solid #23232b', borderRadius:'8px', boxShadow:'0 12px 28px rgba(0,0,0,0.55)' }); pop.setAttribute('role','dialog');
                const title = document.createElement('div'); title.textContent='Hantera inmatningar'; Object.assign(title.style,{ fontWeight:'600', marginBottom:'8px' }); pop.appendChild(title);
                const search = document.createElement('input'); search.type='search'; search.placeholder='Sök nod…'; Object.assign(search.style,{ width:'100%', marginBottom:'8px', padding:'6px 8px', background:'#0f0f14', border:'1px solid #2a2a35', color:'#e6e6ec', borderRadius:'6px' }); pop.appendChild(search);
                const selWrap = document.createElement('div'); Object.assign(selWrap.style,{ display:'grid', gridTemplateColumns:'1fr', gap:'6px', marginBottom:'10px' }); pop.appendChild(selWrap);
                const availWrap = document.createElement('div'); Object.assign(availWrap.style,{ display:'grid', gridTemplateColumns:'1fr', gap:'4px', marginBottom:'10px' }); pop.appendChild(availWrap);
                const btns = document.createElement('div'); Object.assign(btns.style,{ display:'flex', justifyContent:'flex-end', gap:'8px' });
                const cancel = document.createElement('button'); cancel.type='button'; cancel.className='btn btn-ghost'; cancel.textContent='Avbryt';
                const save = document.createElement('button'); save.type='button'; save.className='btn'; save.textContent='Spara';
                btns.appendChild(cancel); btns.appendChild(save); pop.appendChild(btns);
                const renderLists = ()=>{
                  selWrap.innerHTML=''; availWrap.innerHTML='';
                  const filter = (search.value||'').toLowerCase();
                  const labelOf = (id)=> idToLabel.get(String(id)) || String(id);
                  sel.forEach((id, idx)=>{
                    const name = labelOf(id); if (filter && !name.toLowerCase().includes(filter)) return;
                    const row = document.createElement('div'); Object.assign(row.style,{ display:'grid', gridTemplateColumns:'24px 1fr 24px 24px 24px', alignItems:'center', gap:'6px' });
                    const badge = document.createElement('span'); badge.textContent=String(idx+1); Object.assign(badge.style,{ display:'inline-flex', width:'18px', height:'18px', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'#ccc', border:'1px solid #3a3a4a', borderRadius:'999px' });
                    const label = document.createElement('div'); label.textContent=name; label.className='subtle'; label.style.overflow='hidden'; label.style.textOverflow='ellipsis';
                    const up = document.createElement('button'); up.type='button'; up.title='Flytta upp'; up.textContent='↑'; up.className='btn btn-ghost'; up.style.padding='0 6px';
                    const down = document.createElement('button'); down.type='button'; down.title='Flytta ner'; down.textContent='↓'; down.className='btn btn-ghost'; down.style.padding='0 6px';
                    const rem = document.createElement('button'); rem.type='button'; rem.title='Ta bort'; rem.textContent='✕'; rem.className='btn btn-ghost'; rem.style.padding='0 6px';
                    up.onclick = ()=>{ if (idx>0){ const tmp=sel[idx-1]; sel[idx-1]=sel[idx]; sel[idx]=tmp; renderLists(); } };
                    down.onclick = ()=>{ if (idx<sel.length-1){ const tmp=sel[idx+1]; sel[idx+1]=sel[idx]; sel[idx]=tmp; renderLists(); } };
                    rem.onclick = ()=>{ sel = sel.filter(x=>x!==id); renderLists(); };
                    row.appendChild(badge); row.appendChild(label); row.appendChild(up); row.appendChild(down); row.appendChild(rem);
                    selWrap.appendChild(row);
                  });
                  all.forEach(o=>{
                    if (sel.includes(o.value)) return;
                    if (filter && !o.label.toLowerCase().includes(filter)) return;
                    const row = document.createElement('div'); Object.assign(row.style,{ display:'grid', gridTemplateColumns:'1fr 60px', alignItems:'center', gap:'6px' });
                    const label = document.createElement('div'); label.textContent=o.label; label.className='subtle';
                    const add = document.createElement('button'); add.type='button'; add.textContent='Lägg till'; add.className='btn btn-ghost'; add.style.padding='2px 6px';
                    add.onclick = ()=>{ sel.push(o.value); renderLists(); };
                    row.appendChild(label); row.appendChild(add);
                    availWrap.appendChild(row);
                  });
                };
                renderLists();
                search.addEventListener('input', renderLists);
                const onCancel = ()=>{ document.body.removeChild(pop); document.removeEventListener('click', onDocClick, true); };
                cancel.onclick = onCancel; save.onclick = ()=>{ setInputs(sel); renderChips(); onCancel(); };
                document.body.appendChild(pop);
                const onDocClick = (e)=>{ if (!pop.contains(e.target) && e.target !== anchor){ onCancel(); } };
                setTimeout(()=> document.addEventListener('click', onDocClick, true), 0);
              };
              manageBtn.onclick = openInputsManager;

              const openGraders = ()=>{
                let sel = getGraders().map(x=>({ id:x.id, role:x.role||'' }));
                const all = opts.filter(o=>o.value);
                const anchor = gradersManage; const r = anchor.getBoundingClientRect();
                const pop = document.createElement('div'); Object.assign(pop.style,{ position:'fixed', left:Math.max(8, Math.min(window.innerWidth-420, r.left))+'px', top:(r.bottom+6)+'px', zIndex:'10080', width:'400px', maxHeight:'60vh', overflow:'auto', padding:'10px', background:'linear-gradient(180deg,#121219,#0e0e14)', border:'1px solid #23232b', borderRadius:'8px', boxShadow:'0 12px 28px rgba(0,0,0,0.55)' }); pop.setAttribute('role','dialog');
                const title=document.createElement('div'); title.textContent='Hantera rättare'; Object.assign(title.style,{ fontWeight:'600', marginBottom:'8px' }); pop.appendChild(title);
                const search=document.createElement('input'); search.type='search'; search.placeholder='Sök nod…'; Object.assign(search.style,{ width:'100%', marginBottom:'8px', padding:'6px 8px', background:'#0f0f14', border:'1px solid #2a2a35', color:'#e6e6ec', borderRadius:'6px' }); pop.appendChild(search);
                const selWrap=document.createElement('div'); Object.assign(selWrap.style,{ display:'grid', gridTemplateColumns:'1fr', gap:'6px', marginBottom:'10px' }); pop.appendChild(selWrap);
                const availWrap=document.createElement('div'); Object.assign(availWrap.style,{ display:'grid', gridTemplateColumns:'1fr', gap:'4px', marginBottom:'10px' }); pop.appendChild(availWrap);
                const btns=document.createElement('div'); Object.assign(btns.style,{ display:'flex', justifyContent:'flex-end', gap:'8px' });
                const cancel=document.createElement('button'); cancel.type='button'; cancel.className='btn btn-ghost'; cancel.textContent='Avbryt';
                const save=document.createElement('button'); save.type='button'; save.className='btn'; save.textContent='Spara';
                btns.appendChild(cancel); btns.appendChild(save); pop.appendChild(btns);
                const labelOf = (id)=> idToLabel.get(String(id)) || String(id);
                const getNodeRole = (gid)=>{ try{ const raw=localStorage.getItem(`nodeSettings:${gid}`); if(!raw) return ''; const s=JSON.parse(raw)||{}; const r=String(s.role||'').trim(); return r; }catch{ return ''; } };
                const renderLists=()=>{
                  selWrap.innerHTML=''; availWrap.innerHTML=''; const filter=(search.value||'').toLowerCase();
                  sel.forEach((g, idx)=>{
                    const name = labelOf(g.id); const roleTxt = getNodeRole(g.id); if (filter && !name.toLowerCase().includes(filter) && !roleTxt.toLowerCase().includes(filter)) return;
                    const row=document.createElement('div'); Object.assign(row.style,{ display:'grid', gridTemplateColumns:'24px 1fr 24px 24px 24px', alignItems:'center', gap:'6px' });
                    const badge=document.createElement('span'); badge.textContent=String(idx+1); Object.assign(badge.style,{ display:'inline-flex', width:'18px', height:'18px', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'#ccc', border:'1px solid #3a3a4a', borderRadius:'999px' });
                    const label=document.createElement('div'); label.textContent = roleTxt ? `${name} — ${roleTxt}` : name; label.className='subtle'; label.style.overflow='hidden'; label.style.textOverflow='ellipsis';
                    const up=document.createElement('button'); up.type='button'; up.title='Flytta upp'; up.textContent='↑'; up.className='btn btn-ghost'; up.style.padding='0 6px';
                    const down=document.createElement('button'); down.type='button'; down.title='Flytta ner'; down.textContent='↓'; down.className='btn btn-ghost'; down.style.padding='0 6px';
                    const rem=document.createElement('button'); rem.type='button'; rem.title='Ta bort'; rem.textContent='✕'; rem.className='btn btn-ghost'; rem.style.padding='0 6px';
                    up.onclick = ()=>{ if (idx>0){ const tmp=sel[idx-1]; sel[idx-1]=sel[idx]; sel[idx]=tmp; renderLists(); } };
                    down.onclick = ()=>{ if (idx<sel.length-1){ const tmp=sel[idx+1]; sel[idx+1]=sel[idx]; sel[idx]=tmp; renderLists(); } };
                    rem.onclick = ()=>{ sel = sel.filter(x=>x.id!==g.id); renderLists(); };
                    row.appendChild(badge); row.appendChild(label); row.appendChild(up); row.appendChild(down); row.appendChild(rem);
                    selWrap.appendChild(row);
                  });
                  all.forEach(o=>{
                    if (sel.some(x=>x.id===o.value)) return; if ((search.value||'') && !o.label.toLowerCase().includes((search.value||'').toLowerCase())) return;
                    const row=document.createElement('div'); Object.assign(row.style,{ display:'grid', gridTemplateColumns:'1fr 60px', alignItems:'center', gap:'6px' });
                    const label=document.createElement('div'); label.textContent=o.label; label.className='subtle';
                    const add=document.createElement('button'); add.type='button'; add.textContent='Lägg till'; add.className='btn btn-ghost'; add.style.padding='2px 6px'; add.onclick=()=>{ sel.push({ id:o.value }); renderLists(); };
                    row.appendChild(label); row.appendChild(add); availWrap.appendChild(row);
                  });
                };
                renderLists(); search.addEventListener('input', renderLists);
                const onCancel = ()=>{ document.body.removeChild(pop); document.removeEventListener('click', onDocClick, true); };
                cancel.onclick=onCancel; save.onclick=()=>{ setGraders(sel); renderGraders(); onCancel(); };
                document.body.appendChild(pop);
                const onDocClick=(e)=>{ if (!pop.contains(e.target) && e.target !== anchor){ onCancel(); } };
                setTimeout(()=> document.addEventListener('click', onDocClick, true), 0);
              };
              gradersManage.onclick = openGraders;

              // Persist parking changes
              selImprover.sel.addEventListener('change', ()=>{ const p=getParking(); p.improver = selImprover.sel.value||null; setParking(p); });
            };
            // Initial fill and keep updated
            fillFromCoworkers();
            window.addEventListener('coworkers-changed', fillFromCoworkers);
          }catch{}

          // Focus layout rendering (ex-focus)
          const getCursor = ()=>{ try{ const n = Number(localStorage.getItem(`sectionExercisesCursor:${id}`)); const len = getExercises().length; return isNaN(n)?0: Math.max(0, Math.min(n, Math.max(0,len-1))); }catch{ return 0; } };
          const setCursor = (i)=>{ try{ localStorage.setItem(`sectionExercisesCursor:${id}`, String(i)); }catch{} };
          const getRound = ()=>{ try{ const n = Number(localStorage.getItem(`sectionExercisesRound:${id}`)||'1'); return Math.max(1, n||1); }catch{ return 1; } };
          const incRound = ()=>{ try{ const n = getRound(); localStorage.setItem(`sectionExercisesRound:${id}`, String(n+1)); }catch{} };
          const renderVisControls = (graders)=>{
            try{
              const visKey = (sid)=> `sectionGradersVisible:${sid}`;
              const getVisibleGraders = ()=>{ try{ const raw=localStorage.getItem(visKey(id)); if(!raw) return null; const arr=JSON.parse(raw)||[]; if(Array.isArray(arr)&&arr.length) return arr.map(String); return null; }catch{ return null; } };
              const setVisibleGraders = (list)=>{ try{ localStorage.setItem(visKey(id), JSON.stringify(list||[])); }catch{} };
              const vis = getVisibleGraders();
              const bar = document.createElement('div'); bar.className='subtle'; bar.style.margin='6px 0'; bar.style.display='flex'; bar.style.flexWrap='wrap'; bar.style.gap='6px';
              const lab = document.createElement('span'); lab.textContent='Visa:'; bar.appendChild(lab);
              const p = getParking();
              const gradersList = Array.isArray(p.graders)? p.graders.map(g=>({ id:String(g.id||''), role:String(g.role||'') })) : (p.grader? [{ id:String(p.grader), role:'' }] : []);
              gradersList.forEach(g=>{
                const name = (document.querySelector(`.fab[data-id="${g.id}"]`)?.dataset?.displayName || g.id);
                let roleTxt = ''; try{ const raw=localStorage.getItem(`nodeSettings:${g.id}`); if(raw){ const s=JSON.parse(raw)||{}; roleTxt = String(s.role||'').trim(); } }catch{}
                const btn = document.createElement('button'); btn.type='button'; btn.className='btn btn-ghost'; btn.style.padding='2px 8px'; btn.dataset.gid=g.id;
                const active = !vis || vis.includes(String(g.id));
                btn.textContent = (roleTxt? `${roleTxt} — `: '') + name + (active? ' (på)' : ' (av)');
                btn.onclick = ()=>{
                  const cur = getVisibleGraders();
                  let next = Array.isArray(cur) ? cur.slice() : gradersList.map(x=>String(x.id));
                  if (next.includes(String(g.id))) next = next.filter(x=>x!==String(g.id)); else next.push(String(g.id));
                  setVisibleGraders(next);
                  try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
                };
                bar.appendChild(btn);
              });
              return bar;
            }catch{ return null; }
          };

          const renderExercisesFocus = ()=>{
            try{
              const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; }
              sec.setAttribute('data-mode','exercises');
              // clear old
              sec.querySelectorAll('.exercise-block').forEach(b=>b.remove());
              sec.querySelectorAll('.ex-focus, .ex-left, .ex-right').forEach(b=>b.remove());
              const wrap = document.createElement('div'); wrap.className = 'ex-focus'; wrap.style.gridColumn='1 / span 2'; wrap.style.display='grid'; wrap.style.gridTemplateColumns='1fr 1fr'; wrap.style.gap='12px';
              const left = document.createElement('div'); left.className='ex-left';
              const right = document.createElement('div'); right.className='ex-right';
              let idx = getCursor(); { const len = getExercises().length; if (idx >= len) idx = Math.max(0, len-1); } setCursor(idx);
              // left: nav + q
              const nav = document.createElement('div'); nav.className='ex-nav';
              const prev = document.createElement('button'); prev.type='button'; prev.className='btn btn-ghost'; prev.textContent='←';
              const next = document.createElement('button'); next.type='button'; next.className='btn btn-ghost'; next.textContent='→';
              const info = document.createElement('div'); info.className='subtle';
              const roundBtn = document.createElement('button'); roundBtn.type='button'; roundBtn.className='btn btn-ghost'; roundBtn.textContent='Omgång 1 ▾'; roundBtn.style.marginLeft='8px';
              const roundMenu = document.createElement('div'); roundMenu.className='hidden'; Object.assign(roundMenu.style,{ position:'absolute', zIndex:'10060', marginTop:'4px', right:'0', minWidth:'220px', display:'grid', gap:'4px', padding:'6px', background:'linear-gradient(180deg,#121219,#0e0e14)', border:'1px solid #23232b', borderRadius:'8px', boxShadow:'0 12px 28px rgba(0,0,0,0.55)'});
              const resetBtn = document.createElement('button'); resetBtn.type='button'; resetBtn.textContent='Starta om till omgång 1'; Object.assign(resetBtn.style,{ textAlign:'left', background:'rgba(255,255,255,0.03)', border:'1px solid #2a2a35', color:'#e6e6ec', padding:'6px 8px', borderRadius:'6px', cursor:'pointer' });
              roundMenu.appendChild(resetBtn);
              const infoWrap = document.createElement('div'); infoWrap.style.position='relative'; infoWrap.style.display='inline-block';
              infoWrap.appendChild(info); infoWrap.appendChild(roundBtn); infoWrap.appendChild(roundMenu);
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
              { const cur = getExercises(); const rawQ = cur[idx]?.q || ''; if (window.mdToHtml) { q.innerHTML = window.mdToHtml(rawQ); } else { q.textContent = rawQ; } }
              left.appendChild(nav); left.appendChild(q);

              // right: answer + actions + feedback
              const a = document.createElement('textarea'); a.className='ex-a-focus'; a.rows=14; a.placeholder='Skriv ditt svar...'; { const cur = getExercises(); a.value = cur[idx]?.a || ''; }
              const fb = document.createElement('div'); fb.className='ex-fb'; fb.setAttribute('aria-live','polite');
              const leftOverlay = document.createElement('div'); leftOverlay.className='loader-overlay'; leftOverlay.innerHTML='<div class="spinner-rgb"></div>';
              const rightOverlay = document.createElement('div'); rightOverlay.className='loader-overlay'; rightOverlay.innerHTML='<div class="spinner-rgb"></div>';

              const renderFb = ()=>{
                try{
                  const cur = getExercises(); const it = cur[idx]||{};
                  const p = getParking();
                  const graders = Array.isArray(p.graders)? p.graders.map(g=>({ id:String(g.id||''), role:String(g.role||'') })) : (p.grader? [{ id:String(p.grader), role:'' }] : []);
                  const blocks = [];
                  if (graders.length && it.fbByGrader){
                    const visBar = renderVisControls(graders);
                    const visRaw = localStorage.getItem(`sectionGradersVisible:${id}`);
                    const vis = (function(){ try{ const arr = JSON.parse(visRaw||'null'); return Array.isArray(arr)? arr.map(String): null; }catch{ return null; } })();
                    graders.forEach(g=>{
                      if (vis && !vis.includes(String(g.id))) return;
                      const rows = Array.isArray(it.fbByGrader[g.id]) ? it.fbByGrader[g.id] : [];
                      const name = (document.querySelector(`.fab[data-id="${g.id}"]`)?.dataset?.displayName || g.id);
                      const title = document.createElement('div'); title.className='subtle'; title.style.margin='8px 0 6px';
                      let roleTxt = ''; try{ const raw=localStorage.getItem(`nodeSettings:${g.id}`); if(raw){ const s=JSON.parse(raw)||{}; roleTxt = String(s.role||'').trim(); } }catch{}
                      title.innerHTML = `Rättare: ${((roleTxt? roleTxt+' — ' : '') + name)} <button type="button" class="btn btn-ghost" data-action="grade-with" data-gid="${g.id}" style="margin-left:8px; padding:0 6px;">Rätta endast denna</button>`;
                      blocks.push(title.outerHTML);
                      if (!rows.length){ blocks.push('<div class="subtle">Ingen feedback ännu.</div>'); return; }
                      rows.forEach((txt, i)=>{
                        const head = `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85; display:flex; align-items:center; justify-content:space-between; gap:8px;\"><span>Omgång ${i+1}</span></div>`;
                        const body = window.mdToHtml? window.mdToHtml(String(txt||'')) : String(txt||'');
                        blocks.push(head + `<div class=\"fb-round\" data-ri=\"${i}\" data-grader=\"${g.id}\">${body}</div>`);
                      });
                      blocks.push('<hr style=\"border:none; border-top:1px solid #252532; margin:8px 0;\">');
                    });
                    fb.innerHTML = blocks.join('');
                    try{ if (visBar) fb.insertBefore(visBar, fb.firstChild||null); }catch{}
                  } else {
                    const rounds = Array.isArray(it.fbRounds)? it.fbRounds : (it.fb? [String(it.fb)] : []);
                    if (!rounds.length){ fb.innerHTML = '<div class="subtle">Ingen feedback ännu.</div>'; return; }
                    const parts = rounds.map((txt, i)=>{
                      const head = `<div class=\"subtle fb-head\" style=\"margin:6px 0 4px; opacity:.85;\"><span>Omgång ${i+1}</span></div>`;
                      const body = window.mdToHtml? window.mdToHtml(String(txt||'')) : String(txt||'');
                      return head + `<div class=\"fb-round\" data-ri=\"${i}\">${body}</div>`;
                    });
                    fb.innerHTML = parts.join('<hr style=\"border:none; border-top:1px solid #252532; margin:8px 0;\">');
                  }
                  // Delegated click: per-grader "Rätta endast denna"
                  fb.addEventListener('click', (ev)=>{
                    const btn = ev.target && ev.target.closest && ev.target.closest('button[data-action="grade-with"][data-gid]');
                    if (!btn) return; ev.preventDefault(); ev.stopPropagation();
                    try{
                      const gid = String(btn.getAttribute('data-gid')||''); if (!gid) return;
                      const cur = getExercises(); const it = cur[idx]; if (!it) return;
                      const n = idx+1; const payload = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                      try{ localStorage.setItem(`sectionPendingFeedback:${id}:${gid}`, String(idx)); }catch{}
                      const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
                      if (window.requestAIReply){ window.requestAIReply(gid, { text: payload, sourceId: id }); }
                      else if (window.routeMessageFrom) window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() });
                      rightOverlay.classList.add('show');
                    }catch{}
                  }, { once:false });
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
              wrap.appendChild(left); wrap.appendChild(right); grid?.appendChild(wrap);
              updateInfo();
              const go = (delta)=>{
                const cur = getExercises(); const len = cur.length; if (!len) return; idx = Math.max(0, Math.min(len-1, idx+delta)); setCursor(idx);
                const rawQ = cur[idx]?.q || '';
                if (window.mdToHtml) { q.innerHTML = window.mdToHtml(rawQ); } else { q.textContent = rawQ; }
                a.value = cur[idx]?.a || '';
                renderFb(); updateInfo();
              };
              prev.addEventListener('click', ()=>go(-1)); next.addEventListener('click', ()=>go(1));
              q.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].q = String(q.textContent||'').trim(); setExercises(cur); } updateInfo(); });
              a.addEventListener('input', ()=>{ const cur = getExercises(); if (cur[idx]){ cur[idx].a = String(a.value||'').trim(); setExercises(cur); } });
              del.addEventListener('click', ()=>{ const cur = getExercises(); if (!cur.length) return; cur.splice(idx,1); setExercises(cur); if (idx >= cur.length) idx = Math.max(0, cur.length-1); setCursor(idx); renderExercisesFocus(); });
              gradeOne.addEventListener('click', (ev)=>{
                const btn = ev.currentTarget; const now = Date.now(); if (btn && btn._lastClick && (now - btn._lastClick) < 400) return; if (btn) btn._lastClick = now;
                const it = getExercises()[idx]; if (!it) return;
                const n = idx+1; const payload = `Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`;
                const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
                try{
                  const park = getParking(); const graders = Array.isArray(park.graders)? park.graders : (park.grader? [{ id:String(park.grader), role:'' }] : []);
                  const hasRoute = (function(){ try{ return (window.state?.connections||[]).some(c=> c.fromId===id); }catch{ return false; } })();
                  if ((!graders || !graders.length) && !hasRoute){ alert('Ingen "Rättare" vald och inga kopplingar från denna sektion. Välj minst en Rättare eller dra en kabel.'); return; }
                  rightOverlay.classList.add('show');
                  const clearOverlay = ()=>{ setTimeout(()=>{ rightOverlay.classList.remove('show'); }, 200); };
                  const doneHandler = (e)=>{ try{ if (!e || !e.detail || e.detail.id === id) clearOverlay(); }catch{ clearOverlay(); } };
                  window.addEventListener('exercises-data-changed-global', doneHandler, { once:true });
                  sec.addEventListener('exercises-data-changed', doneHandler, { once:true });
                  const onFinish = (e)=>{ try{ const d=e?.detail; if (!d) return; if (d.sourceId && String(d.sourceId)===String(id)) clearOverlay(); }catch{} };
                  window.addEventListener('ai-request-finished', onFinish, { once:true });
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
                  if (graders && graders.length && window.requestAIReply){
                    graders.forEach(g=>{ const gid = String(g?.id||''); if (!gid) return; try{ localStorage.setItem(`sectionPendingFeedback:${id}:${gid}`, String(idx)); }catch{} window.requestAIReply(gid, { text: payload, sourceId: id }); });
                  } else if (window.routeMessageFrom){
                    window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() });
                  }
                }catch{}
                try{ sec.dataset.pendingFeedback = String(idx); }catch{}
              });
            }catch{}
          };

          // Events to keep focus UI in sync
          sec.addEventListener('exercises-data-changed', ()=>{ try{ if (readSecMode(id)==='exercises') renderExercisesFocus(); }catch{} });
          const onExStorage = (e)=>{ try{ if (!e||!e.key) return; if (e.key===`sectionExercises:${id}` || e.key===`sectionExercisesCursor:${id}` || e.key==='__exercises_changed__'){ if (readSecMode(id)==='exercises') renderExercisesFocus(); } }catch{} };
          window.addEventListener('storage', onExStorage);
          // Clean up ex-focus listeners when section removed
          const obs2 = new MutationObserver(()=>{ if (!document.body.contains(sec)){ try{ window.removeEventListener('storage', onExStorage); }catch{} try{ obs2.disconnect(); }catch{} } });
          try{ obs2.observe(document.body, { childList:true, subtree:true }); }catch{}

          // Wire toolbar buttons
          const saveAndDispatch = (arr)=>{ try{ localStorage.setItem(`sectionExercises:${id}`, JSON.stringify(arr||[])); sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{} };
          const serializeAllForGrading = ()=>{
            const data = getExercises(); if (!data.length) return '';
            const parts = []; data.forEach((it, i)=>{ const n=i+1; parts.push(`Fråga ${n}: ${it.q||''}\nSvar ${n}: ${it.a||''}`); });
            return parts.join('\n\n');
          };
          btnAdd.addEventListener('click', ()=>{
            if (readSecMode(id)==='exercises'){
              const arr = getExercises(); arr.push({ q:'Fråga...', a:'' }); setExercises(arr); setCursor(arr.length-1); renderExercisesFocus();
            } else {
              // In blocks layout, add a new block element-like: just append to data and refresh
              const arr = getExercises(); arr.push({ q:'Fråga...', a:'' }); saveAndDispatch(arr);
            }
          });
          btnDeleteAll.addEventListener('click', ()=>{
            if (!confirm('Ta bort alla övningar i denna sektion?')) return;
            saveAndDispatch([]);
          });
          btnClearAnswers.addEventListener('click', ()=>{
            const arr = getExercises().map(x=>({ q:String(x.q||''), a:'' })); saveAndDispatch(arr);
          });
          btnGradeAll.addEventListener('click', ()=>{
            const payload = serializeAllForGrading(); if (!payload){ alert('Inga övningsblock i sektionen.'); return; }
            const title = sec.querySelector('.head h2')?.textContent?.trim() || 'Sektion';
            const park = getParking(); const graders = Array.isArray(park.graders)? park.graders : (park.grader? [{ id:String(park.grader), role:'' }] : []);
            const hasRoute = (function(){ try{ return (window.state?.connections||[]).some(c=> c.fromId===id); }catch{ return false; } })();
            if ((!graders || !graders.length) && !hasRoute){ alert('Ingen "Rättare" vald och inga kopplingar från denna sektion. Välj minst en Rättare eller dra en kabel.'); return; }
            // Show a brief toast to indicate sending
            try{
              let cont = document.getElementById('toastContainer'); if (!cont){ cont = document.createElement('div'); cont.id='toastContainer'; Object.assign(cont.style,{ position:'fixed', right:'16px', bottom:'16px', zIndex:'10050', display:'grid', gap:'8px' }); document.body.appendChild(cont); }
              const t = document.createElement('div'); t.className='toast'; Object.assign(t.style,{ background:'rgba(30,30,40,0.95)', border:'1px solid #3a3a4a', color:'#fff', padding:'8px 10px', borderRadius:'8px', boxShadow:'0 8px 18px rgba(0,0,0,0.4)', fontSize:'13px' }); t.textContent='Skickar alla frågor till rättare…'; cont.appendChild(t); setTimeout(()=>{ try{ t.style.opacity='0'; t.style.transition='opacity 250ms'; setTimeout(()=>{ t.remove(); if (!cont.children.length) cont.remove(); }, 260); }catch{} }, 1200);
            }catch{}
            if (graders && graders.length && window.requestAIReply){ graders.forEach(g=>{ const gid=String(g?.id||''); if (!gid) return; window.requestAIReply(gid, { text: payload, sourceId: id }); }); }
            else if (window.routeMessageFrom){ window.routeMessageFrom(id, payload, { author: title, who:'user', ts: Date.now() }); }
          });
        }

        // Helper: rerender according to current mode
        const rerender = ()=>{
          const m = readSecMode(id);
          if (m==='exercises'){
            // Do nothing here; exercises UI handled elsewhere (legacy until migrated)
            return;
          }
          if (m==='md') return renderMd();
          if (m==='html') return renderHtml();
          return renderRaw();
        };

        // Initial render
        const mode = readSecMode(id);
        if (!sec.dataset.renderInitDone){
          if (mode==='exercises'){
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display='grid'; body.style.gridTemplateColumns='1fr 1fr'; body.style.gap='12px'; } }catch{}
            sec.setAttribute('data-mode','exercises');
            try{ sec.dispatchEvent(new CustomEvent('exercises-data-changed', { detail:{ id } })); }catch{}
          } else if (mode==='md'){
            sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            renderMd();
          } else if (mode==='html'){
            sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            renderHtml();
          } else {
            sec.removeAttribute('data-mode'); try{ sec.querySelector('.ex-focus')?.remove(); }catch{}
            try{ const body = sec.querySelector('.body'); if (body){ body.style.display=''; body.style.gridTemplateColumns=''; body.style.gap=''; } }catch{}
            renderRaw();
          }
          sec.dataset.renderInitDone = '1';
        } else {
          try{ updateToolbarVisibility(mode); }catch{}
        }

          // Live updates: storage and streaming
          const onStorage = (e)=>{
            try{
              if (!e || !e.key) return;
              const k = String(e.key||'');
              if (k === `sectionRaw:${id}` || k === `sectionSettings:${id}` || k === `sectionParking:${id}` || /^nodeAttachments:/.test(k)){
                rerender();
              }
            }catch{}
          };
          const onDelta = (ev)=>{ try{ if (ev?.detail?.id === id) rerender(); }catch{} };
          const onEnd = (ev)=>{ try{ if (ev?.detail?.id === id) rerender(); }catch{} };
          window.addEventListener('storage', onStorage);
          window.addEventListener('section-stream-delta', onDelta);
          window.addEventListener('section-stream-end', onEnd);
          // Clean-up on DOM removal
          const obs = new MutationObserver(()=>{
            if (!document.body.contains(sec)){
              try{ window.removeEventListener('storage', onStorage); }catch{}
              try{ window.removeEventListener('section-stream-delta', onDelta); }catch{}
              try{ window.removeEventListener('section-stream-end', onEnd); }catch{}
              try{ obs.disconnect(); }catch{}
            }
          });
          try{ obs.observe(document.body, { childList:true, subtree:true }); }catch{}

        // Persist manual edits for raw/html (NOT for md)
        const getMode = ()=>{ try{ const raw = localStorage.getItem(`sectionSettings:${id}`); if (raw){ const s=JSON.parse(raw)||{}; return String(s.renderMode||'raw'); } }catch{} return 'raw'; };
        let saveTimer=null;
        const saveNow = ()=>{
          try{
            const m = getMode(); if (m==='exercises' || m==='md') return;
            if (m==='html'){
              const src = String(note.innerHTML||'');
              localStorage.setItem(`sectionRaw:${id}`, src);
            } else {
              const src = String(note.innerText||'');
              localStorage.setItem(`sectionRaw:${id}`, src);
            }
          }catch{}
        };
        note.addEventListener('input', ()=>{ try{ if (saveTimer) clearTimeout(saveTimer); saveTimer=setTimeout(saveNow, 300); }catch{} });
        note.addEventListener('blur', ()=>{ try{ if (saveTimer){ clearTimeout(saveTimer); saveTimer=null; } saveNow(); }catch{} });
      });
    }catch{}
  };
})();
