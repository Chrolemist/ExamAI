// Main Content Area orchestration: manages dynamic board sections and their wiring.
// Responsibility: Everything inside <main class="content"> that is not node board.
// Consolidates previous board-sections logic under a clearer name.
(function(){
  // Signal that Main Content Area is managed here
  window.__mcaManaged = true;
  // --- Internals & persistence helpers ---
  const LS_KEY_LIST = 'boardSections:list:v1';
  const LS_KEY_TITLE = (id)=>`boardSection:title:${id}`;
  function uid(){ return 's-' + Math.random().toString(36).slice(2, 9); }
  function saveList(ids){ try{ localStorage.setItem(LS_KEY_LIST, JSON.stringify(ids||[])); }catch{} }
  function loadList(){ try{ const raw = localStorage.getItem(LS_KEY_LIST); return raw? JSON.parse(raw)||[] : []; }catch{ return []; } }

  // --- DOM builders ---
  function createSectionDom(id, title){
    const sec = document.createElement('section');
    sec.className = 'panel board-section';
    sec.setAttribute('aria-label', title || 'Sektion');
    sec.dataset.sectionId = id;
  sec.innerHTML = `
      <div class="head">
        <h2 contenteditable="true" spellcheck="false">${title || 'Skriv rubrik'}</h2>
      </div>
      <div class="body">
        <div class="grid"></div>
        <article class="note" contenteditable="true" spellcheck="false"></article>
      </div>`;
    return sec;
  }

  function refreshAllConnections(){
    try{
      document.querySelectorAll('.fab').forEach(f => window.updateConnectionsFor && window.updateConnectionsFor(f));
      document.querySelectorAll('.panel').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
      document.querySelectorAll('.panel-flyout').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
    }catch{}
  }

  function removeSection(sec){
    if (!sec) return;
    const id = sec.dataset.sectionId || '';
    try{ sec.remove(); }catch{}
    try{
      const list = loadList();
      const next = list.filter(it => it && it.id !== id);
      saveList(next);
  try{ window.dispatchEvent(new CustomEvent('board-sections-changed', { detail: { type: 'remove', id } })); }catch{}
    }catch{}
    try{ localStorage.removeItem(LS_KEY_TITLE(id)); }catch{}
    try{ localStorage.removeItem(`sectionSettings:${id}`); }catch{}
    try{ localStorage.removeItem(`sectionRaw:${id}`); }catch{}
    try{ localStorage.removeItem(`sectionExercises:${id}`); }catch{}
  try{ localStorage.removeItem(`sectionExercisesCursor:${id}`); }catch{}
  refreshAllConnections();
  // Section IO Board is deprecated (no UI); no removal needed
  }

  function wireSection(sec){
  // Remove legacy inline section IO (we use Section IO Board now)
  try{ sec.querySelectorAll('.section-io, .conn-point').forEach(io=> io.remove()); }catch{}
    try{
      const h2 = sec.querySelector('.head h2');
      if (h2){
        const id = sec.dataset.sectionId || '';
  const onChange = ()=>{ try{ const name=(h2.textContent||'').trim(); localStorage.setItem(LS_KEY_TITLE(id), name); /* sectionIOBoard deprecated */ try{ window.dispatchEvent(new CustomEvent('board-sections-changed', { detail: { type: 'rename', id, title: name } })); }catch{} }catch{} };
        h2.addEventListener('input', onChange);
        h2.addEventListener('blur', onChange);
      }
    }catch{}
    try{
      const head = sec.querySelector('.head');
      if (head && !head.querySelector('[data-role="delSection"]')){
        // Add numeric badge per section order
        try{
          const badge = document.createElement('span');
          badge.setAttribute('data-role','secBadge');
          Object.assign(badge.style,{ marginLeft:'8px', display:'inline-flex', width:'18px', height:'18px', alignItems:'center', justifyContent:'center', border:'1px solid #3a3a4a', borderRadius:'999px', fontSize:'11px', color:'#ccc' });
          head.appendChild(badge);
        }catch{}
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost';
        btn.setAttribute('data-role','delSection');
        btn.title = 'Ta bort sektion';
        btn.textContent = 'Ta bort';
        btn.style.marginLeft = '8px';
        const io = head.querySelector('.section-io');
        if (io && io.parentElement === head){ head.insertBefore(btn, io); } else { head.appendChild(btn); }
        btn.addEventListener('click', ()=>{ if (!confirm('Ta bort denna sektion?')) return; removeSection(sec); });
      }
    }catch{}
    try{ window.initBoardSectionSettings && window.initBoardSectionSettings(); }catch{}
    try{ window.updateConnectionsFor && window.updateConnectionsFor(sec); }catch{}
  }

  function nextSequentialTitle(){
    const list = loadList();
    const n = (list?.length || 0) + 1;
    return `Sektion ${n}`;
  }

  function addSection(title){
    const id = uid();
    const name = title && title.trim() ? title.trim() : nextSequentialTitle();
    const sec = createSectionDom(id, name);
    const main = document.querySelector('.layout .content');
    if (!main) return null;
    // Place new section after the last existing section (bottom of the list)
    const existing = main.querySelectorAll('.board-section');
    if (existing && existing.length){
      const last = existing[existing.length - 1];
      if (last && last.parentNode){ last.parentNode.insertBefore(sec, last.nextSibling); }
      else { main.appendChild(sec); }
    } else {
      const toolbar = main.querySelector('.board-sections-toolbar');
      if (toolbar && toolbar.parentNode){ toolbar.parentNode.insertBefore(sec, toolbar.nextSibling); }
      else { main.appendChild(sec); }
    }
    wireSection(sec);
    const list = loadList(); list.push({ id, title: name }); saveList(list);
  try{ updateBadges(); }catch{}
  /* sectionIOBoard deprecated */
  try{ window.dispatchEvent(new CustomEvent('board-sections-changed', { detail: { type: 'add', id, title: name } })); }catch{}
    return sec;
  }

  function restoreExisting(){
    const main = document.querySelector('.layout .content'); if (!main) return;
    const existing = Array.from(main.querySelectorAll('.board-section'));
    if (existing.length){
      const list = [];
      existing.forEach((sec, idx)=>{
        const id = sec.dataset.sectionId || ('s' + (idx+1));
        sec.dataset.sectionId = id;
        const savedTitle = localStorage.getItem(LS_KEY_TITLE(id));
        const h2 = sec.querySelector('.head h2');
        if (h2){
          if (savedTitle) h2.textContent = savedTitle;
          list.push({ id, title: (h2.textContent||'').trim() });
        }
        wireSection(sec);
  /* sectionIOBoard deprecated */
      });
  saveList(list); try{ updateBadges(); }catch{}
      return;
    }
    const list = loadList();
    if (list.length){
      // Append in saved order to preserve order as-is (don’t insert before toolbar each time)
      const toolbar = main?.querySelector('.board-sections-toolbar');
      list.forEach(it=>{
        const title = localStorage.getItem(LS_KEY_TITLE(it.id)) || it.title || '';
        const sec = createSectionDom(it.id, title);
        // Always append after whatever exists to keep list order stable
        if (toolbar && !toolbar.nextSibling && main){ main.appendChild(sec); }
        else { main.appendChild(sec); }
        wireSection(sec);
        /* sectionIOBoard deprecated */
      });
      try{ updateBadges(); }catch{}
    } else {
      addSection('Sektion 1');
    }
  }

  function updateBadges(){
    const list = loadList();
    const order = list.map(it=>String(it.id));
    document.querySelectorAll('.board-section').forEach(sec=>{
      try{
        const id = sec.dataset.sectionId||'';
        const idx = Math.max(0, order.indexOf(id));
        const n = idx>=0 ? idx+1 : '';
        const h = sec.querySelector('.head');
        const b = h && h.querySelector('[data-role="secBadge"]');
        if (b) b.textContent = n ? String(n) : '';
      }catch{}
    });
  }

  // Public rebuild: remove all current sections and re-create from the saved list
  function rebuildFromList(){
    const main = document.querySelector('.layout .content'); if (!main) return;
    // Remove existing sections
    try{ main.querySelectorAll('.board-section').forEach(sec=> sec.remove()); }catch{}
    // Rebuild in saved order
    const list = loadList();
    if (!list || !list.length){ return; }
    list.forEach(it=>{
      const title = localStorage.getItem(LS_KEY_TITLE(it.id)) || it.title || '';
      const sec = createSectionDom(it.id, title);
      main.appendChild(sec);
      wireSection(sec);
      /* sectionIOBoard deprecated */
    });
    try{ updateBadges(); }catch{}
    try{ window.dispatchEvent(new CustomEvent('board-sections-changed', { detail: { type: 'rebuild' } })); }catch{}
  }

  // Public API
  window.addBoardSection = addSection;
  window.removeBoardSection = (id)=>{
    const sec = document.querySelector(`.board-section[data-section-id="${CSS.escape(id)}"]`);
  if (sec) removeSection(sec);
  };
  window.rebuildBoardSections = rebuildFromList;

  window.addEventListener('DOMContentLoaded', ()=>{
    try{
      const btn = document.getElementById('addBoardSectionBtn');
  if (btn){ btn.addEventListener('click', ()=> addSection('')); }
      const rmAllBtn = document.getElementById('removeAllSectionsBtn');
      if (rmAllBtn){
        rmAllBtn.addEventListener('click', ()=>{
          if (!confirm('Ta bort ALLA sektioner?')) return;
          // Remove DOM sections first
          document.querySelectorAll('.board-section').forEach(sec=>{ try{ sec.remove(); }catch{} });
          // Clear persisted list and per-section keys best-effort
          try{ const list = loadList(); (list||[]).forEach(it=>{
            try{ localStorage.removeItem(LS_KEY_TITLE(it.id)); }catch{}
            try{ localStorage.removeItem(`sectionSettings:${it.id}`); }catch{}
            try{ localStorage.removeItem(`sectionRaw:${it.id}`); }catch{}
            try{ localStorage.removeItem(`sectionExercises:${it.id}`); }catch{}
            try{ localStorage.removeItem(`sectionExercisesCursor:${it.id}`); }catch{}
          }); }catch{}
          try{ saveList([]); }catch{}
          try{ window.dispatchEvent(new CustomEvent('board-sections-changed', { detail: { type: 'clear' } })); }catch{}
          // Clear IO board
          /* sectionIOBoard deprecated */
          // Refresh cables
          try{ const svg = document.getElementById('connLayer'); if (svg){ svg.querySelectorAll('path').forEach(p=>p.remove()); } }catch{}
        });
      }
      const openFxBtn = document.getElementById('openFullScreenBtn');
      if (openFxBtn){
        openFxBtn.addEventListener('click', ()=>{
          try{
            const url = new URL(location.origin + location.pathname.replace(/[^\/]*$/, 'board-full.html'));
            window.open(url.toString(), '_blank');
          }catch{}
        });
      }
      restoreExisting();
    }catch{}
  });

  // Ensure section settings initialized after all scripts (including panels.js) are ready
  window.addEventListener('load', ()=>{
    try{ window.initBoardSectionSettings && window.initBoardSectionSettings(); }catch{}
  });
})();
