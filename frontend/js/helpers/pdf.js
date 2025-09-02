// PDF & pagewise utilities (SOLID: single responsibility for PDF detection, links, page picking, MER_SIDOR cleaning, and pgwise config)
(function(){
  try{ if (window.Pdf) return; }catch{}
  function isPdf(x){ try{ return /pdf/i.test(String(x?.mime||'')) || /\.pdf$/i.test(String(x?.name||'')); }catch{ return false; } }
  function httpUrlOf(att){ try{ const u = String(att?.url||''); if (u) return u; const o = String(att?.origUrl||''); if (o) return o; return ''; }catch{ return ''; } }
  function pageAnchorUrl(att, page){ try{ const base = httpUrlOf(att); if (!base) return base; const p = Math.max(1, Number(page)||1); return isPdf(att) ? (base + '#page=' + encodeURIComponent(p)) : base; }catch{ return httpUrlOf(att); } }
  // Given an attachment with pages:[{page,text}], pick the page that best matches hintText
  function pickPageByHint(att, hintText){
    try{
      if (!att || !Array.isArray(att.pages) || !att.pages.length) return { page:null, q:'' };
      const hint = String(hintText||'').trim(); if (!hint) return { page: att.pages[0]?.page||1, q:'' };
      const lc = hint.toLowerCase();
      let best = null; let bestScore = -1;
      for (const p of att.pages){
        const txt = String(p?.text||''); if (!txt) continue;
        const t = txt.toLowerCase();
        // simple heuristic: count occurrences of distinct words from hint
        const words = lc.split(/\s+/).filter(Boolean).slice(0, 8);
        let score = 0; for (const w of words){ if (t.includes(w)) score++; }
        if (score > bestScore){ bestScore = score; best = p; }
      }
      return { page: best?.page || att.pages[0]?.page || 1, q: hint };
    }catch{ return { page:null, q:'' }; }
  }
  // Clean MER_SIDOR control token from text
  function cleanMerSidor(text){ try{ return String(text||'').replace(/\bMER_SIDOR\b/g,'').trim(); }catch{ return String(text||''); } }
  // Decide whether to enable pagewise, based on context and settings
  function computePgwiseConfig(opts){
    try{
      const { attachments, fromCoworker, fromSection, nodeSettings, startPage } = (opts||{});
      const hasMaterials = Array.isArray(attachments) && attachments.length>0;
      const wantPagewise = !!(nodeSettings && nodeSettings.pagewise);
      if (!hasMaterials) return null;
      if (!fromCoworker && !fromSection) return { enable:true, startPage: Math.max(1, Number(startPage)||1) };
      if (fromCoworker && !fromSection && wantPagewise) return { enable:true, startPage: Math.max(1, Number(startPage)||1) };
      return null;
    }catch{ return null; }
  }
  window.Pdf = { isPdf, httpUrlOf, pageAnchorUrl, pickPageByHint, cleanMerSidor, computePgwiseConfig };
})();
