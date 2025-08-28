// Section IO Board: a neat panel between Node Board and Main Content Area that mirrors IO points for each section.
// Responsibility: Maintain a compact list of Section-IO items, one per board-section, to keep cables tidy.
// Public API: window.sectionIOBoard.syncAll(), add(id,name), remove(id), rename(id,name)
(function(){
  // Section IO Board deprecated: keep no-op API for compatibility
  function ensureBoard(){ return null; }

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

  function add(id, name){ /* no-op */ }

  function remove(id){ /* no-op */ }

  function rename(id, name){ /* no-op */ }

  function syncAll(){ /* no-op */ }

  window.sectionIOBoard = { ensureBoard, add, remove, rename, syncAll };

  window.addEventListener('DOMContentLoaded', ()=>{ /* no UI */ });
})();
