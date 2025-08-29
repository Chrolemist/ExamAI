(function(){
  const keyBuf = (sid)=>`__sec_stream_buf:${sid}`;
  function begin(sectionId){ try{ if (!sectionId) return; const base = String(localStorage.getItem(`sectionRaw:${sectionId}`)||''); localStorage.setItem(keyBuf(sectionId), base); }catch{} }
  function delta(sectionId, d){ try{ if (!sectionId || !d) return; const k=keyBuf(sectionId); const base=String(localStorage.getItem(k)||''); const next = base + String(d); localStorage.setItem(k, next); localStorage.setItem(`sectionRaw:${sectionId}`, next); // trigger rerender according to persisted renderMode
    try{ window.dispatchEvent(new CustomEvent('section-stream-delta', { detail:{ id: sectionId, text: next } })); }catch{} }catch{} }
  function end(sectionId){ try{ if (!sectionId) return; localStorage.removeItem(keyBuf(sectionId)); window.dispatchEvent(new CustomEvent('section-stream-end', { detail:{ id: sectionId } })); }catch{} }
  try{ window.sectionStream = { begin, delta, end }; }catch{}
})();
