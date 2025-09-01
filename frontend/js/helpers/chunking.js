(function(){
  function approxTokens(s){ try{ const w=(String(s||'').match(/\S+/g)||[]).length; return Math.ceil(w*1.3); }catch{ return Math.ceil(String(s||'').length/4); } }
  // Split text into blocks based on numbering like "1.", "2)", "3:", "4 -" etc.
  // Primary mode: line-based (numbered headings at start of line). Fallback: inline numbering within a single line.
  function splitByNumbering(inputText){
    try{
      const str = String(inputText||'');
      if (!str.trim()) return [str];
      const lines = str.split(/\r?\n/);
      const isNumHead = (ln)=> /^\s*\d{1,3}[\.)\:\-–—]\s+/.test(ln);
      const chunks = []; let buf = []; let foundHeads = 0;
      for (let i=0;i<lines.length;i++){
        const ln = lines[i];
        if (isNumHead(ln)){
          if (buf.length){ chunks.push(buf.join('\n').replace(/\n+$/,'').replace(/^\n+/,'')); }
          buf = [ln];
          foundHeads += 1;
        } else {
          buf.push(ln);
        }
      }
      if (buf.length) chunks.push(buf.join('\n').replace(/\n+$/,'').replace(/^\n+/,''));
      // If 2+ numbered heads found on separate lines, use those
      if (foundHeads >= 2) return chunks.filter(Boolean);
      // Fallback: inline numbered list, e.g., "1. ... 2) ... 3: ..." on a single line
      // Find all number markers not inside brackets like [1,4] (won't match because pattern requires punctuation after the number)
      const numRe = /\d{1,3}[\.)\:\-–—]\s+/g;
      const indices = [];
      let m;
      while ((m = numRe.exec(str))){
        const idx = m.index;
        // Accept only if at start or preceded by whitespace/newline
        const prev = idx > 0 ? str[idx-1] : '';
        if (idx === 0 || /\s/.test(prev)) indices.push(idx);
      }
      if (indices.length >= 2){
        const out=[]; indices.push(str.length);
        for (let i=0;i<indices.length-1;i++){
          const start = indices[i];
          const end = indices[i+1];
          out.push(str.slice(start, end).trim());
        }
        // If there is preamble before first marker, include it as first chunk
        const firstIdx = indices[0];
        if (firstIdx > 0){
          const pre = str.slice(0, firstIdx).trim();
          if (pre) out.unshift(pre);
        }
        return out.filter(Boolean);
      }
      return [str];
    }catch{ return [String(inputText||'')]; }
  }
  function makeLineBatches(inputText, size=3){
    try{
      const lines = String(inputText||'').split(/\r?\n/).map(s=>s.replace(/\s+$/,'')).filter(s=>s.trim().length>0);
      if (lines.length <= size) return [lines.join('\n')];
      const batches=[]; for (let i=0;i<lines.length;i+=size) batches.push(lines.slice(i, i+size).join('\n'));
      return batches;
    }catch{ return [String(inputText||'')]; }
  }
  function smartChunk(inputText, maxT=800, overlapTokens=60){
    const str = String(inputText||'');
    let units = [];
    try{ const qRe = /(\n|^)(Fråga\s*\d+\s*:[\s\S]*?)(?=\nFråga\s*\d+\s*:|$)/gi; let m=null, acc=[]; while((m=qRe.exec(str))){ acc.push(m[2].trim()); } if (acc.length>=2) units = acc; }catch{}
    if (!units.length){ units = str.split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean); }
    if (!units.length){ units=[str]; }
    const chunks=[]; let cur=[]; let curT=0;
    const tok = (s)=> approxTokens(s);
    for (let i=0;i<units.length;i++){
      const u=units[i]; const uT=tok(u);
      if (curT + uT > maxT){
        if (cur.length){
          chunks.push(cur.join('\n\n'));
          const words = cur.join('\n\n').split(/\s+/);
          const keep = Math.min(words.length, overlapTokens);
          const overlap = keep ? words.slice(words.length-keep).join(' ') : '';
          cur = overlap ? [overlap] : [];
          curT = tok(overlap);
        }
      }
      cur.push(u); curT += uT;
    }
    if (cur.length) chunks.push(cur.join('\n\n'));
    return chunks;
  }
  function estimateChunkBudget(targetId){
    try{
      const panel = document.querySelector(`.panel-flyout[data-owner-id="${targetId}"]`);
      const mt = panel?.querySelector('[data-role="maxTokens"]');
      const v = mt && Number(mt.value) ? Number(mt.value) : 0;
      if (v>0) return Math.max(400, Math.min(2000, Math.floor(v*0.6)));
    }catch{}
    return 800;
  }
  try{ window.chunking = { approxTokens, splitByNumbering, makeLineBatches, smartChunk, estimateChunkBudget }; }catch{}
})();
