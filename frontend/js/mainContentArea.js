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
        <div class="section-io conn-point io-out" data-io="out" data-side="l"></div>
        <div class="section-io conn-point io-in" data-io="in" data-side="r"></div>
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
    }catch{}
    try{ localStorage.removeItem(LS_KEY_TITLE(id)); }catch{}
    try{ localStorage.removeItem(`sectionSettings:${id}`); }catch{}
    try{ localStorage.removeItem(`sectionRaw:${id}`); }catch{}
    try{ localStorage.removeItem(`sectionExercises:${id}`); }catch{}
    try{ localStorage.removeItem(`sectionExercisesCursor:${id}`); }catch{}
    refreshAllConnections();
  }

  function wireSection(sec){
    try{ sec.querySelectorAll('.section-io').forEach(io=>{ if (!io._wired && window.makeConnPointInteractive){ window.makeConnPointInteractive(io, sec); io._wired = true; } }); }catch{}
    try{
      const h2 = sec.querySelector('.head h2');
      if (h2){
        const id = sec.dataset.sectionId || '';
        const onChange = ()=>{ try{ localStorage.setItem(LS_KEY_TITLE(id), (h2.textContent||'').trim()); }catch{} };
        h2.addEventListener('input', onChange);
        h2.addEventListener('blur', onChange);
      }
    }catch{}
    try{
      const head = sec.querySelector('.head');
      if (head && !head.querySelector('[data-role="delSection"]')){
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

  function addSection(title){
    const id = uid();
    const sec = createSectionDom(id, title);
    const main = document.querySelector('.layout .content');
    if (!main) return null;
    const toolbar = main.querySelector('.board-sections-toolbar');
    if (toolbar && toolbar.nextSibling){ main.insertBefore(sec, toolbar.nextSibling); } else { main.appendChild(sec); }
    wireSection(sec);
    const list = loadList(); list.push({ id, title: title||'' }); saveList(list);
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
      });
      saveList(list);
      return;
    }
    const list = loadList();
    if (list.length){
      list.forEach(it=>{
        const title = localStorage.getItem(LS_KEY_TITLE(it.id)) || it.title || '';
        const sec = createSectionDom(it.id, title);
        const toolbar = main?.querySelector('.board-sections-toolbar');
        if (toolbar && toolbar.nextSibling){ main.insertBefore(sec, toolbar.nextSibling); } else { main.appendChild(sec); }
        wireSection(sec);
      });
    } else {
      addSection('Teori');
    }
  }

  // Public API
  window.addBoardSection = addSection;
  window.removeBoardSection = (id)=>{
    const sec = document.querySelector(`.board-section[data-section-id="${CSS.escape(id)}"]`);
    if (sec) removeSection(sec);
  };

  window.addEventListener('DOMContentLoaded', ()=>{
    try{
      const btn = document.getElementById('addBoardSectionBtn');
      if (btn){ btn.addEventListener('click', ()=> addSection('Ny sektion')); }
      restoreExisting();
    }catch{}
  });

  // Ensure section settings initialized after all scripts (including panels.js) are ready
  window.addEventListener('load', ()=>{
    try{ window.initBoardSectionSettings && window.initBoardSectionSettings(); }catch{}
  });
})();
