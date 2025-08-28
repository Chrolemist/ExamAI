(function(){
  function point(e){ return (window.pointFromEvent ? window.pointFromEvent(e) : { x: e.clientX, y: e.clientY }); }
  function clamp(v, min, max){ return (window.clamp ? window.clamp(v, min, max) : Math.max(min, Math.min(max, v))); }

  function makeDraggableWithin(container, el, handle, opts){
    if (!container || !el || !handle) return;
    let sx=0, sy=0, sl=0, st=0, crect=null, active=false;
    const onMove = (e)=>{
      if(!active) return;
      const p = point(e);
      const dx = p.x - sx, dy = p.y - sy;
      const left = clamp(sl + dx, 0, Math.max(0, crect.width - el.offsetWidth));
      const top  = clamp(st + dy, 0, Math.max(0, crect.height - el.offsetHeight));
      el.style.left = left + 'px';
      el.style.top  = top + 'px';
      if (opts && typeof opts.onMove==='function') { try{ opts.onMove(left, top); }catch{} }
    };
    const onUp = (e)=>{
      if(!active) return;
      active=false;
      window.removeEventListener('pointermove', onMove);
      if (opts && typeof opts.onEnd==='function'){
        try{
          const r = el.getBoundingClientRect();
          const c = container.getBoundingClientRect();
          opts.onEnd(r.left - c.left, r.top - c.top);
        }catch{}
      }
    };
    handle.addEventListener('pointerdown', (e)=>{
      if (opts && typeof opts.enabled==='function' && !opts.enabled()) return;
      active=true;
      const p = point(e);
      const r = el.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      crect = c;
      sx = p.x; sy = p.y;
      sl = r.left - c.left; st = r.top - c.top;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once:true });
      e.preventDefault();
    });
  }

  function makeResizableWithin(container, el, grip, opts){
    if (!container || !el || !grip) return;
    let sx=0, sy=0, sw=0, sh=0, sl=0, st=0, crect=null, active=false;
    const minW = (opts && opts.minW) || 240;
    const minH = (opts && opts.minH) || 180;
    const onMove = (e)=>{
      if(!active) return;
      const p = point(e);
      const dx = p.x - sx, dy = p.y - sy;
      const maxW = Math.max(minW, crect.width - sl);
      const maxH = Math.max(minH, crect.height - st);
      el.style.width  = clamp(sw + dx, minW, maxW) + 'px';
      el.style.height = clamp(sh + dy, minH, maxH) + 'px';
      if (opts && typeof opts.onMove==='function') { try{ opts.onMove(); }catch{} }
    };
    const onUp = ()=>{
      if(!active) return;
      active=false;
      window.removeEventListener('pointermove', onMove);
      if (opts && typeof opts.onEnd==='function'){
        try{
          const r = el.getBoundingClientRect();
          const c = container.getBoundingClientRect();
          opts.onEnd(r.width, r.height, r.left - c.left, r.top - c.top);
        }catch{}
      }
    };
    grip.addEventListener('pointerdown', (e)=>{
      if (opts && typeof opts.enabled==='function' && !opts.enabled()) return;
      active=true;
      const p = point(e);
      const r = el.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      crect = c;
      sx = p.x; sy = p.y;
      sw = r.width; sh = r.height;
      sl = r.left - c.left; st = r.top - c.top;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once:true });
      e.preventDefault();
    });
  }

  window.makeDraggableWithin = makeDraggableWithin;
  window.makeResizableWithin = makeResizableWithin;
})();
