// SVG connection rendering layer
export const ConnectionLayer = (() => {
  let svg = null;
  function ensure() {
    if (svg) return svg;
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'connLayer');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'fixed';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    document.body.appendChild(svg);
    return svg;
  }
  function pathFor(a, b) {
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const c = Math.max(30, Math.min(200, Math.max(dx, dy) * 0.5));
    const sx = (b.x >= a.x) ? 1 : -1; // flip curve when going leftwards
    return `M ${a.x},${a.y} C ${a.x + (c * sx)},${a.y} ${b.x - (c * sx)},${b.y} ${b.x},${b.y}`;
  }
  function draw(id, a, b) {
    const root = ensure();
    let el = root.querySelector(`path[data-id="${id}"]`);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('data-id', id);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', 'url(#gradLine)');
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linecap', 'round');
      // gradient def once
      if (!root.querySelector('defs')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', 'gradLine');
        grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
        grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#7c5cff');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#00d4ff');
        grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); root.appendChild(defs);
      }
      root.appendChild(el);
    }
    el.setAttribute('d', pathFor(a, b));
  }
  function remove(id) {
    if (!svg) return;
    const el = svg.querySelector(`path[data-id=\"${id}\"]`);
    if (el) el.remove();
  }
  function pulse(id, opts = {}) {
    const root = ensure();
    const base = root.querySelector(`path[data-id=\"${id}\"]`);
    if (!base) return;
    const overlay = base.cloneNode(false);
    overlay.removeAttribute('data-id');
    overlay.setAttribute('data-flow-of', id);
    overlay.setAttribute('stroke', '#00d4ff');
    overlay.setAttribute('stroke-width', String(opts.strokeWidth || 3));
    overlay.setAttribute('opacity', '0.95');
    overlay.setAttribute('stroke-dasharray', opts.dash || '10 14');
    let offset = 0;
    const dir = opts.reverse ? -1 : 1;
    const step = (opts.step || 22) * dir;
    const lifetime = Math.max(400, Math.min(4000, opts.duration || 1400));
    root.appendChild(overlay);
    const int = setInterval(() => {
      offset += step;
      overlay.setAttribute('stroke-dashoffset', String(offset));
    }, 30);
    setTimeout(() => { clearInterval(int); overlay.remove(); }, lifetime);
  }
  return { draw, remove, pulse };
})();
