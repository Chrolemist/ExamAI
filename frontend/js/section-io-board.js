// Section IO Board: a neat panel between Node Board and Main Content Area that mirrors IO points for each section.
// Responsibility: Maintain a compact list of Section-IO items, one per board-section, to keep cables tidy.
// Public API: window.sectionIOBoard.syncAll(), add(id,name), remove(id), rename(id,name)
(function(){
  function ensureBoard(){
    let board = document.getElementById('sectionIoBoard');
    if (board) return board;
    // Insert after Node Board
    const nb = document.getElementById('nodeBoard');
    const wrap = document.createElement('section');
    wrap.id = 'sectionIoBoard';
    wrap.setAttribute('aria-label','Section IO');
    wrap.className = 'section-io-board';
    wrap.innerHTML = `
      <div class="sib-head">
        <h2>Section IO</h2>
      </div>
      <div class="sib-list"></div>`;
    if (nb && nb.parentElement){ nb.parentElement.insertBefore(wrap, nb.nextSibling); }
    else { document.querySelector('#app')?.appendChild(wrap); }
    return wrap;
  }

  function makeItem(id, name){
    const item = document.createElement('div');
    item.className = 'sib-item panel';
    item.setAttribute('data-section-id', id);
    item.innerHTML = `
      <div class="head">
        <h3 class="sib-title">${name||id}</h3>
        <div class="conn-point io-out" data-io="out" data-side="l" title="Från ${name||id}"></div>
        <div class="conn-point io-in" data-io="in" data-side="r" title="Till ${name||id}"></div>
      </div>`;
    return item;
  }

  function wireItem(item){
    try{ item.querySelectorAll('.conn-point').forEach(cp=>{ if (!cp._wired && window.makeConnPointInteractive){ window.makeConnPointInteractive(cp, item); cp._wired = true; } }); }catch{}
    try{ window.updateConnectionsFor && window.updateConnectionsFor(item); }catch{}
  }

  function add(id, name){
    const board = ensureBoard();
    const list = board.querySelector('.sib-list');
    if (!list) return;
    // Avoid duplicates
    if (list.querySelector(`.sib-item[data-section-id="${CSS.escape(id)}"]`)) return;
    const item = makeItem(id, name);
    list.appendChild(item);
    wireItem(item);
  }

  function remove(id){
    const board = ensureBoard();
    const item = board.querySelector(`.sib-item[data-section-id="${CSS.escape(id)}"]`);
    if (item) item.remove();
  }

  function rename(id, name){
    const board = ensureBoard();
    const item = board.querySelector(`.sib-item[data-section-id="${CSS.escape(id)}"]`);
    if (!item) return;
    const t = item.querySelector('.sib-title'); if (t) t.textContent = name || id;
    // Update titles on IO for accessibility
    try{
      item.querySelectorAll('.conn-point').forEach(cp=>{ cp.title = (cp.classList.contains('io-in')?'Till ':'Från ') + (name||id); });
    }catch{}
  }

  function syncAll(){
    const board = ensureBoard();
    const list = board.querySelector('.sib-list');
    if (!list) return;
    // Reset current
    list.innerHTML = '';
    // Build from existing sections
    document.querySelectorAll('.panel.board-section').forEach(sec=>{
      const id = sec.dataset.sectionId || '';
      const name = sec.querySelector('.head h2')?.textContent?.trim() || id || 'Sektion';
      if (!id) return;
      const item = makeItem(id, name);
      list.appendChild(item);
      wireItem(item);
    });
  }

  window.sectionIOBoard = { ensureBoard, add, remove, rename, syncAll };

  window.addEventListener('DOMContentLoaded', ()=>{
    try{ ensureBoard(); syncAll(); }catch{}
  });
})();
