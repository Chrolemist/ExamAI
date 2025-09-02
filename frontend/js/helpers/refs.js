(function(){
  function gatherInputAttachments(sectionId){
    try{
      const rawP = localStorage.getItem(`sectionParking:${sectionId}`);
      const p = rawP ? (JSON.parse(rawP)||{}) : {};
      const inputs = Array.isArray(p?.inputs) ? p.inputs.map(String) : (p?.input ? [String(p.input)] : []);
      const seen = new Set(); const att = [];
      inputs.forEach(nodeId=>{
        try{
          const rawA = localStorage.getItem(`nodeAttachments:${nodeId}`);
          const items = rawA ? (JSON.parse(rawA)||[]) : [];
          (items||[]).forEach(it=>{
            const key = (it.url||'') || `${it.name||''}|${it.chars||0}`;
            if (!seen.has(key)){ seen.add(key); att.push(it); }
          });
        }catch{}
      });
      return att;
    }catch{ return []; }
  }
  function linkifyRefs(html, attItems){
    try{
      const attLen = Array.isArray(attItems)? attItems.length : 0;
      return String(html)
        .replace(/\[(\d+)\s*,\s*(?:s(?:ida|idor|\.)?\s*)?(\d+)(?:\s*[-–]\s*(\d+))?\]/gi, (mm,a,p1,p2)=>{
          const first = Math.max(1, Number(p1)||1);
          const second = Math.max(1, Number(p2)||first);
          const page = Math.min(first, second);
          const normBil = (attLen === 1 ? 1 : Math.max(1, Number(a)||1));
          const disp = (attLen === 1 && normBil === 1 && (Number(a)||1) !== 1)
            ? mm.replace(/^\[\s*\d+/, s=> s.replace(/\d+/, '1'))
            : mm;
          return `<a href="javascript:void(0)" data-bil="${normBil}" data-page="${page}" class="ref-bp">${disp}</a>`;
        })
        .replace(/\[(\d+)\]/g, (m,g)=>`<a href="javascript:void(0)" data-ref="${g}" class="ref">[${g}]</a>`);
    }catch{ return String(html||''); }
  }
  function wireRefClicks(containerEl, attItems, hintText){
    if (!containerEl || containerEl.__refsWired) return;
    containerEl.__refsWired = true;
  const isPdf = (x)=>{ try{ return !!(window.Pdf && Pdf.isPdf(x)); }catch{ return false; } };
    const openIfExists = (url)=>{
      try{
        if (!url) return;
        const u = String(url);
        if (!/^https?:/i.test(u)){ window.open(u, '_blank', 'noopener'); return; }
        const base = u.split('#')[0];
        fetch(base, { method:'HEAD', cache:'no-store' })
          .then(r=> r && r.ok ? window.open(u, '_blank', 'noopener') : alert('Denna bilaga saknas – ladda upp igen.'))
          .catch(()=> alert('Denna bilaga saknas – ladda upp igen.'));
      }catch{ try{ window.open(url, '_blank', 'noopener'); }catch{} }
    };
    containerEl.addEventListener('click', (ev)=>{
      try{
        const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
        if (!a) return;
        if (a.classList.contains('ref-bp')){
          let bil = Math.max(1, Number(a.getAttribute('data-bil'))||1);
          const page = Math.max(1, Number(a.getAttribute('data-page'))||1);
          const n = attItems?.length||0; if (n === 1 && bil > 1) bil = 1;
          if (bil <= n){
            const it = attItems[bil-1];
      const httpUrl = it.url || '';
            const blobUrl = it.origUrl || it.blobUrl || (function(){ const b=new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl=URL.createObjectURL(b); return it.blobUrl; })();
      const href = (isPdf(it) && httpUrl && window.Pdf) ? Pdf.pageAnchorUrl(it, page) : (httpUrl || blobUrl);
            ev.preventDefault(); ev.stopPropagation(); openIfExists(href); return;
          }
        }
        if (a.classList.contains('ref')){
          const idx = Math.max(1, Number(a.getAttribute('data-ref'))||1);
          if (idx <= (attItems?.length||0)){
            const it = attItems[idx-1];
            const httpUrl = it.url || '';
            const blobUrl = it.origUrl || it.blobUrl || (function(){ const b=new Blob([String(it.text||'')], { type:(it.mime||'text/plain')+';charset=utf-8' }); it.blobUrl=URL.createObjectURL(b); return it.blobUrl; })();
            let href = httpUrl || blobUrl;
      if (isPdf(it) && httpUrl && hintText && window.Pdf){
              try{
        const pick = Pdf.pickPageByHint(it, hintText);
        if (pick?.page){ href = Pdf.pageAnchorUrl(it, pick.page); }
              }catch{}
            }
            ev.preventDefault(); ev.stopPropagation(); openIfExists(href);
          }
        }
      }catch{}
    });
  }
  window.__Refs = { gatherInputAttachments, linkifyRefs, wireRefClicks };
})();
