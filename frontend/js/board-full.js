(function(){
  function loadList(){ try{ const raw = localStorage.getItem('boardSections:list:v1'); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } }
  function getTitle(id, fallback){ try{ return localStorage.getItem(`boardSection:title:${id}`) || fallback || ''; }catch{ return fallback||''; } }
  function getSettings(id){ try{ const raw = localStorage.getItem(`sectionSettings:${id}`); return raw? (JSON.parse(raw)||{}) : {}; }catch{ return {}; } }
  function getRaw(id){ try{ return localStorage.getItem(`sectionRaw:${id}`)||''; }catch{ return ''; } }
  function getExercises(id){ try{ const raw = localStorage.getItem(`sectionExercises:${id}`); return raw? (JSON.parse(raw)||[]) : []; }catch{ return []; } }

  function md(html){ try{ return window.mdToHtml ? window.mdToHtml(html) : html; }catch{ return html; } }

  function render(){
    const fx = document.getElementById('fx'); if (!fx) return;
    fx.innerHTML = '';
    const list = loadList();
    const order = list.map(it=>String(it.id));
    const cards = [];
    order.forEach((id, i)=>{
      const s = getSettings(id);
      const title = getTitle(id, list[i]?.title||'Sektion');
      const badge = (i+1);
      const card = document.createElement('section'); card.className='sec-card';
      const head = document.createElement('div'); head.className='sec-head';
      const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='8px';
      const b = document.createElement('span'); b.className='badge'; b.textContent=String(badge);
      const t = document.createElement('span'); t.className='sec-title'; t.textContent=title;
      left.appendChild(b); left.appendChild(t); head.appendChild(left);
      card.appendChild(head);
      const body = document.createElement('div'); body.className='content';
      // Show exercises or text/html/markdown
      const mode = String(s.renderMode||'raw');
  if (i===0 && mode==='exercises'){ card.classList.add('primary'); }
      if (mode==='exercises'){
        // Embed the full three-panel exercises UI with standard header and controls
        const frame = document.createElement('iframe');
  const u = new URL(location.origin + location.pathname.replace(/[^\/]*$/, 'exercises-full.html'));
        u.searchParams.set('id', id);
        if (title) u.searchParams.set('title', title);
  u.searchParams.set('wide', '1');
        frame.src = u.toString();
  frame.style.width = '100%';
  frame.style.border = 'none';
  frame.style.minHeight = '92vh';
        frame.loading = 'lazy';
        body.appendChild(frame);
      } else if (mode==='md'){
        const raw = getRaw(id); body.innerHTML = md(raw);
      } else if (mode==='html'){
        const raw = getRaw(id); body.innerHTML = raw;
      } else {
        const raw = getRaw(id); body.textContent = raw;
      }
      card.appendChild(body);
      cards.push(card);
    });
    cards.forEach(c=> fx.appendChild(c));
  }

  window.addEventListener('storage', (e)=>{ try{ if (!e||!e.key) return; if (/^boardSections:list:v1$/.test(e.key) || /^boardSection:title:/.test(e.key) || /^sectionSettings:/.test(e.key) || /^sectionRaw:/.test(e.key)) render(); }catch{} });
  window.addEventListener('DOMContentLoaded', render);
})();
