(function(){
  function ensureDefs(svg){
    try{
      if (!svg) return;
      if (svg.querySelector('defs')) return;
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.id = 'flowGrad'; grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','1'); grad.setAttribute('y2','0');
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','rgba(124,92,255,0.9)');
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','rgba(0,212,255,0.9)');
      grad.appendChild(s1); grad.appendChild(s2);
      defs.appendChild(grad);
      svg.appendChild(defs);
    }catch{}
  }
  function makePath(svgEl, animated){
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'url(#flowGrad)');
    p.setAttribute('stroke-width', '3');
    p.setAttribute('stroke-linecap', 'round');
    p.style.pointerEvents = 'stroke';
    p.style.cursor = 'pointer';
    if (animated) {
      p.style.filter = 'drop-shadow(0 2px 10px rgba(124,92,255,0.25))';
      p.setAttribute('stroke-dasharray', '16 12');
      p.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -28 }], { duration: 800, iterations: Infinity });
    }
    ensureDefs(svgEl);
    svgEl?.appendChild(p);
    return p;
  }
  function makeHitPath(svgEl){
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'rgba(0,0,0,0)');
    p.setAttribute('stroke-width', '12');
    p.setAttribute('stroke-linecap', 'round');
    p.style.cursor = 'pointer';
    svgEl?.appendChild(p);
    return p;
  }
  function drawPath(path, x1, y1, x2, y2){
    const dx = x2 - x1, dy = y2 - y1;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    let c1x, c1y, c2x, c2y;
    if (adx >= ady) {
      const sign = dx >= 0 ? 1 : -1;
      const cx = Math.max(40, adx * 0.4);
      c1x = x1 + sign * cx; c1y = y1 + ( (y1 + y2)/2 - y1 ) * 0.2;
      c2x = x2 - sign * cx; c2y = y2 + ( (y1 + y2)/2 - y2 ) * 0.2;
    } else {
      const signY = dy >= 0 ? 1 : -1;
      const cy = Math.max(40, ady * 0.4);
      c1x = x1 + dx * 0.2; c1y = y1 + signY * cy;
      c2x = x2 - dx * 0.2; c2y = y2 - signY * cy;
    }
    path.setAttribute('d', `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`);
  }
  function triggerFlowEffect(path, opts){
    if(!path) return;
    try{
      const prevFilter = path.style.filter;
      path.style.filter = 'drop-shadow(0 2px 10px rgba(124,92,255,0.35))';
      const prevDash = path.getAttribute('stroke-dasharray');
      path.setAttribute('stroke-dasharray','16 12');
      let toOffset = -28;
      try{
        const src = opts && opts.sourceId;
        if (src && opts && opts.conn){
          if (src === opts.conn.toId) toOffset = 28; else if (src === opts.conn.fromId) toOffset = -28;
        }
      }catch{}
      const anim = path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: toOffset }], { duration: 650, iterations: 1, easing:'linear' });
      anim.addEventListener?.('finish', ()=>{
        path.setAttribute('stroke-dasharray', prevDash || '');
        path.style.filter = prevFilter || '';
      });
      setTimeout(()=>{ path.setAttribute('stroke-dasharray', prevDash || ''); path.style.filter = prevFilter || ''; }, 800);
    }catch{}
  }
  try{
    window.svgHelpers = { ensureDefs, makePath, makeHitPath, drawPath, triggerFlowEffect };
  }catch{}
})();
