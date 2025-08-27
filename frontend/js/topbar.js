(function(){
  // Top dropdown (add copilot + actions)
  const btn = document.getElementById('addCopilotBtn');
  const menu = document.getElementById('addMenu');
  if (!btn || !menu) return;
  const show = ()=>{ menu.classList.remove('hidden'); menu.removeAttribute('inert'); (menu.querySelector('button')||btn).focus(); };
  const hide = ()=>{ try{ if (menu.contains(document.activeElement)) btn.focus(); }catch{} menu.classList.add('hidden'); menu.setAttribute('inert',''); };
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); const vis = !menu.classList.contains('hidden'); if (vis) hide(); else show(); });
  document.addEventListener('click', (e)=>{ if (menu.classList.contains('hidden')) return; if (!menu.contains(e.target) && e.target !== btn) hide(); });
  menu.addEventListener('click', (e)=>{
    const t = e.target.closest('button[data-kind]');
    if (!t) return;
    hide();
    const kind = t.getAttribute('data-kind');
    let pos = { x: 60, y: Math.max(80, window.innerHeight - 140) };
    try{ if (window.getNextNodePosition) pos = window.getNextNodePosition(); }catch{}
    if (window.createIcon) window.createIcon(kind === 'user' ? 'user' : kind === 'internet' ? 'internet' : 'coworker', pos.x, pos.y);
  });

  // Clear local storage and reset app
  const clearBtn = document.getElementById('clearStorageBtn');
  if (clearBtn){
    clearBtn.addEventListener('click', ()=>{
      try{
        if (!confirm('Rensa all lokal data (noder, inställningar, bilagor)?')) return;
        localStorage.clear();
        try{ if (window.graph && typeof window.graph.reset === 'function') window.graph.reset(); }catch{}
        try{ if (window.resetConnections) window.resetConnections(); }catch{}
      }catch{}
      location.reload();
    });
  }
})();
