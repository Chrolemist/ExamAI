(function(){
  const $ = (id)=>document.getElementById(id);
  const logEl = $("log");
  const plannedEl = $("planned");
  const scheduledEl = $("scheduled");
  const doneEl = $("done");
  const cacheEl = $("cache");
  const retriesEl = $("retries");
  const barEl = $("bar");
  const btnStart = $("start");
  const btnCancel = $("cancel");
  const filesEl = $("files");

  function detectApiBase(){
    try{ if (window.API_BASE && typeof window.API_BASE === 'string') return window.API_BASE; }catch{}
    try{
      if (location.protocol === 'file:') return 'http://localhost:8000';
      if (location.port && location.port !== '8000') return 'http://localhost:8000';
    }catch{}
    return '';
  }

  function appendLog(line){
    logEl.textContent += (line + "\n");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setBar(done, planned){
    const pct = (!planned || planned<=0) ? 0 : Math.min(100, Math.round(done*100/planned));
    barEl.style.width = pct + '%';
  }

  function readFilesAsText(files){
    return Promise.all(Array.from(files||[]).map(f=>new Promise((resolve)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve({ name: f.name, text: String(fr.result||'') });
      fr.onerror = ()=>resolve({ name: f.name, text: '' });
      fr.readAsText(f);
    })));
  }

  async function uploadFilesAndGetPageText(files){
    // Hit upload endpoint and return joined text with [Sida N] markers, plus bilaga names
    const api = detectApiBase();
    const fd = new FormData();
    Array.from(files||[]).forEach(f=>fd.append('files', f));
    const res = await fetch(api + '/upload', { method:'POST', body: fd });
    if (!res.ok) throw new Error('Upload failed: ' + res.status);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    // Join items into a single text block, one after another
    let allText = '';
    const names = [];
    for (const it of items){
      if (it && it.text){
        if (allText) allText += "\n\n";
        allText += String(it.text||'');
      }
      if (it && it.name) names.push(it.name);
    }
    const bilaga = names.length ? names.join(', ') : 'Bilaga';
    return { text: allText, bilaga };
  }

  function streamIngest(payload, signal){
    const api = detectApiBase();
    return fetch(api + '/rag/ingest_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  }

  function parseNdjsonStream(stream, onEvent){
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    function pump(){
      return reader.read().then(({value, done})=>{
        if (done){
          if (buf.trim()) { try{ onEvent(JSON.parse(buf)); }catch{} }
          return;
        }
        buf += decoder.decode(value, { stream:true });
        let idx; let last = 0;
        while ((idx = buf.indexOf('\n', last)) >= 0){
          const line = buf.slice(last, idx).trim();
          if (line){
            try{ onEvent(JSON.parse(line)); }catch(e){ /* ignore parse errors */ }
          }
          last = idx + 1;
        }
        buf = buf.slice(last);
        return pump();
      });
    }
    return pump();
  }

  function buildPayload(){
    const p = {
      collection: $("collection").value.trim() || 'default',
      chunkTokens: Math.max(100, Number($("chunkTokens").value) || 800),
      overlapTokens: Math.max(0, Number($("overlapTokens").value) || 100),
      embeddingModel: $("embeddingModel").value.trim() || 'text-embedding-3-large',
    };
    const mb = Number($("maxTokensPerBatch").value);
    if (!Number.isNaN(mb) && mb>0) p.maxTokensPerBatch = mb;
    return p;
  }

  function resetCounters(){
    plannedEl.textContent = '-';
    scheduledEl.textContent = '-';
    doneEl.textContent = '-';
    cacheEl.textContent = '-';
    retriesEl.textContent = '-';
    setBar(0, 0);
  }

  let controller = null;
  btnStart.addEventListener('click', async ()=>{
    btnStart.disabled = true; btnCancel.disabled = false; logEl.textContent = ''; resetCounters();
    try{
      let payload = buildPayload();
      const files = filesEl.files;
      if (files && files.length){
        const { text, bilaga } = await uploadFilesAndGetPageText(files);
        payload.text = text;
        payload.bilaga = bilaga;
      } else {
        payload.text = $("text").value;
        payload.bilaga = $("bilaga").value || 'Bilaga';
      }
      if (!payload.text || !payload.text.trim()) throw new Error('Ingen text att ingest:a. Ladda upp PDF eller klistra in text.');

      controller = new AbortController();
      const res = await streamIngest(payload, controller.signal);
      if (!res.ok || !res.body) throw new Error('Ingest start misslyckades: ' + res.status);

      let planned = 0; let done = 0; let cacheHits = 0; let scheduled = 0; let retries = 0;
      appendLog('Ingest startad...');
      await parseNdjsonStream(res.body, (ev)=>{
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'started'){
          planned = Number(ev.chunksPlanned||0);
          plannedEl.textContent = String(planned);
          appendLog('Planerade chunks: ' + planned);
        } else if (ev.type === 'scheduled'){
          scheduled = Number(ev.chunks||0);
          scheduledEl.textContent = String(scheduled);
        } else if (ev.type === 'progress'){
          if (typeof ev.done === 'number') { done = ev.done; doneEl.textContent = String(done); }
          if (typeof ev.cache_hits === 'number') { cacheHits = ev.cache_hits; cacheEl.textContent = String(cacheHits); }
          if (typeof ev.retries_total === 'number') { retries = ev.retries_total; retriesEl.textContent = String(retries); }
          if (ev.stage) appendLog('Progress: ' + ev.stage);
          setBar(done, planned || scheduled || 0);
        } else if (ev.type === 'indexed'){
          appendLog('Indexerade ' + (ev.chunks||0) + ' chunks.');
        } else if (ev.type === 'done'){
          appendLog('Klar.');
        } else if (ev.type === 'error'){
          appendLog('Fel: ' + (ev.error||'okänt'));
        }
      });
    }catch(e){
      appendLog('Avbruten eller fel: ' + (e && e.message ? e.message : String(e)));
    } finally {
      btnStart.disabled = false; btnCancel.disabled = true; controller = null;
    }
  });

  btnCancel.addEventListener('click', ()=>{
    try{ controller && controller.abort(); }catch{}
  });
})();
