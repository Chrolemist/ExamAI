// Snapshot Panel (UI-only)
// Responsibility: build and manage the snapshot bar UI (save/load/list/delete snapshots)
// SOLID hints:
// - S: Enbart UI; all lagring/persistens finns i persistence.js (window.saveSnapshot etc.).
// - D: Bero endast på publika window-API från persistence, inte på interna detaljer.
// This module *uses* the persistence functions exposed on `window` (saveSnapshot, loadSnapshot, listSnapshots, deleteSnapshot)
// to avoid coupling UI code with storage logic. The persistence layer remains in `persistence.js`.
(function(){
  const LS_UI_COLLAPSED = 'snapshot:uiCollapsed';

  /**
   * Refresh the <select> listing available snapshots.
   */
  function refreshList(){
    const list = document.getElementById('snapList'); if (!list) return;
    const items = (window.listSnapshots && typeof window.listSnapshots === 'function') ? window.listSnapshots() : [];
    list.innerHTML = items.map(n=>`<option value="${n}">${n}</option>`).join('');
  }

  /**
   * Create the snapshot bar DOM and wire events.
   * This intentionally keeps DOM ids and event names stable so other code can continue to reference them.
   */
  function initSnapshotBar(){
    if (document.getElementById('snapshotBar')) return; // already created
    const bar = document.createElement('div');
    bar.id = 'snapshotBar';
    Object.assign(bar.style, { position:'fixed', top:'6px', left:'50%', transform:'translateX(-50%)', zIndex:'9999', background:'rgba(24,24,32,0.85)', color:'#fff', padding:'6px 8px', borderRadius:'10px', boxShadow:'0 6px 20px rgba(0,0,0,0.35)', fontSize:'12px', display:'flex', flexDirection:'column', gap:'6px', alignItems:'stretch', backdropFilter:'blur(6px)' });
    bar.innerHTML = `
      <div id="snapHeader" style="display:flex;align-items:center;gap:8px">
        <button id="snapToggle" type="button" title="Visa/dölj" style="width:24px;height:22px;line-height:20px;text-align:center;border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(0,0,0,0.2);color:#fff;cursor:pointer;padding:0">▾</button>
        <div style="font-weight:600;opacity:0.9">Snapshots</div>
        <div style="flex:1"></div>
        <div style="position:relative">
          <button id="snapAddBtn" type="button" title="Lägg till nod" style="width:26px;height:22px;line-height:18px;text-align:center;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:linear-gradient(135deg,#7c5cff,#00d4ff);color:#111;font-weight:700;cursor:pointer;padding:0">+</button>
          <div id="snapAddMenu" class="hidden" role="menu" aria-hidden="true" style="position:absolute;right:0;top:26px;background:rgba(24,24,32,0.95);border:1px solid rgba(255,255,255,0.2);border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,0.35);padding:6px;">
            <button type="button" data-kind="coworker" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny CoWorker</button>
            <button type="button" data-kind="user" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny User</button>
            <button type="button" data-kind="internet" style="display:block;width:100%;text-align:left;color:#fff;background:none;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Ny Internet</button>
          </div>
        </div>
      </div>
      <div id="snapBody" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;">Namn
          <input id="snapName" type="text" placeholder="ex: demo-1" style="width:180px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;">
        </label>
        <button id="btnSaveSnap" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:linear-gradient(135deg,#7c5cff,#00d4ff);color:#111;font-weight:600;">Save</button>
        <select id="snapList" style="padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;"></select>
        <button id="btnLoadSnap" type="button" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.15);color:#fff;">Load</button>
        <button id="btnDeleteSnap" type="button" title="Ta bort vald sparning" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,80,80,0.5);background:rgba(120,20,20,0.35);color:#fff;">Delete</button>
        <div style="flex:1"></div>
        <button id="btnClearLocal" type="button" title="Rensa all lokal data (noder, inställningar, bilagor)" style="padding:5px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,80,80,0.15);color:#ffdede;">Rensa lokal data</button>
      </div>
    `;
    document.body.appendChild(bar);

    // Wire basic actions using the persistence API exposed on window
    document.getElementById('btnSaveSnap')?.addEventListener('click', ()=>{
      const name = (document.getElementById('snapName')?.value || '').trim();
      if (!name){ alert('Ange ett namn innan du sparar.'); return; }
      const res = window.saveSnapshot ? window.saveSnapshot(name) : { ok:false, error:'saknas saveSnapshot' };
      if (!res.ok) alert('Kunde inte spara: '+res.error);
      refreshList();
    });
    document.getElementById('btnLoadSnap')?.addEventListener('click', ()=>{
      const list = document.getElementById('snapList'); const name = list && list.value;
      if (!name){ alert('Välj en sparning att ladda.'); return; }
      const res = window.loadSnapshot ? window.loadSnapshot(name) : { ok:false, error:'saknas loadSnapshot' };
      if (!res.ok) alert('Kunde inte ladda: '+res.error);
    });
    document.getElementById('btnDeleteSnap')?.addEventListener('click', ()=>{
      const list = document.getElementById('snapList'); const name = list && list.value;
      if (!name){ alert('Välj en sparning att ta bort.'); return; }
      if (!confirm(`Ta bort "${name}"?`)) return;
      const res = window.deleteSnapshot ? window.deleteSnapshot(name) : { ok:false, error:'saknas deleteSnapshot' };
      if (!res.ok) { alert('Kunde inte ta bort: '+res.error); return; }
      refreshList();
    });

    // Clear local storage from snapshot bar
    document.getElementById('btnClearLocal')?.addEventListener('click', ()=>{
      try{
        if (!confirm('Rensa all lokal data (noder, inställningar, bilagor)?')) return;
        localStorage.clear();
        try{ if (window.graph && typeof window.graph.reset === 'function') window.graph.reset(); }catch{}
        try{ if (window.resetConnections) window.resetConnections(); }catch{}
      }catch{}
      location.reload();
    });

    // Toggle behavior inside bar
    const body = document.getElementById('snapBody');
    const toggle = document.getElementById('snapToggle');
    const applyCollapsed = (collapsed)=>{
      if (body) body.style.display = collapsed ? 'none' : 'flex';
      if (toggle) toggle.textContent = collapsed ? '▾' : '▴';
    };
    let collapsed = false;
    try{ collapsed = localStorage.getItem(LS_UI_COLLAPSED) === '1'; }catch{}
    applyCollapsed(collapsed);
    toggle?.addEventListener('click', ()=>{
      collapsed = !collapsed;
      applyCollapsed(collapsed);
      try{ localStorage.setItem(LS_UI_COLLAPSED, collapsed ? '1' : '0'); }catch{}
    });
    refreshList();

    // Inline + add menu wiring (create nodes from the menu)
    try{
      const addBtn = document.getElementById('snapAddBtn');
      const menu = document.getElementById('snapAddMenu');
      const show = ()=>{ if(menu){ menu.classList.remove('hidden'); menu.setAttribute('aria-hidden','false'); } };
      const hide = ()=>{ if(menu){ menu.classList.add('hidden'); menu.setAttribute('aria-hidden','true'); } };
      addBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); const vis = menu && !menu.classList.contains('hidden'); if(vis) hide(); else show(); });
      document.addEventListener('click', (e)=>{ if(!menu) return; if (menu.classList.contains('hidden')) return; if (!menu.contains(e.target) && e.target !== addBtn) hide(); });
      menu?.addEventListener('click', (e)=>{
        const t = e.target.closest('button[data-kind]'); if (!t) return; hide();
        const kind = t.getAttribute('data-kind');
        let pos = { x: 60, y: Math.max(80, window.innerHeight - 140) };
        try{ if (window.getNextNodePosition) pos = window.getNextNodePosition(); }catch{}
        if (window.createIcon) window.createIcon(kind === 'user' ? 'user' : kind === 'internet' ? 'internet' : 'coworker', pos.x, pos.y);
      });
      // Hide legacy topbar controls for a cleaner UI if present
      try{ const old = document.querySelector('.copilot-plus-wrap'); if (old) old.style.display='none'; }catch{}
    }catch{}
  }

  // Initialize on DOMContentLoaded so snapshot UI is present early
  window.addEventListener('DOMContentLoaded', initSnapshotBar);

  // Also expose an init function in case other code wants to programmatically ensure the panel
  window.SnapshotPanel = window.SnapshotPanel || {};
  window.SnapshotPanel.init = initSnapshotBar;
})();
