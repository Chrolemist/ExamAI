(function(){
  // Bubble visual effect for transient chat prompts
  // SOLID: Single Responsibility — visual-only; no business logic or API calls
  // Open/Closed — configurable via options; extend by subclassing BubbleEffect
  // Liskov — Consumers depend on the small IBubble interface (pop/dispose)
  // Interface Segregation — minimal public surface
  // Dependency Inversion — no hard deps; consumers pass host element

  function ensureStyles(){
    if (document.getElementById('bubbleEffectStyles')) return;
  const css = `
  /* Layer sits inside a positioned host; keep above card loaders (z:20) but below menus/tooltips */
  .fx-bubble-layer{ position:absolute; inset:0; pointer-events:none; overflow:visible; z-index:40; }
  .fx-bubble{ position:absolute; max-width: 60%; transform-origin: center; will-change: transform, opacity; animation: bubble-float var(--bubble-float-dur, 20s) linear forwards; background:transparent; }
  .fx-bubble-i{ color:#e8e8ff; padding:8px 12px; border-radius:999px; border:1px solid rgba(140,160,255,.35);
      background: transparent;
      box-shadow: 0 6px 16px rgba(20,20,40,.15);
      font-size: 13px; line-height: 1.35; white-space: pre-wrap; word-wrap: break-word;
      animation: bubble-sway var(--bubble-sway-dur, 3.8s) ease-in-out infinite alternate;
    }
    @keyframes bubble-float { from { transform: translate3d(var(--sx,0px), 0, 0) scale(1); } to { transform: translate3d(var(--sx,0px), -500%, 0) scale(1.06); } }
    @keyframes bubble-sway { from { transform: translateX(calc(var(--sway, 14px) * -1)); } to { transform: translateX(var(--sway, 14px)); } }
  .fx-bubble.pop { animation: bubble-pop .28s ease-out forwards; }
    @keyframes bubble-pop { 0%{ transform: translate3d(var(--sx,0px), var(--y,0), 0) scale(1); opacity: .95; }
      60%{ transform: translate3d(var(--sx,0px), var(--y,0), 0) scale(1.18); opacity:.9; }
      100%{ transform: translate3d(var(--sx,0px), var(--y,0), 0) scale(.6); opacity: 0; } }
    `;
    const style = document.createElement('style'); style.id='bubbleEffectStyles'; style.textContent = css; document.head.appendChild(style);
  }

  class BubbleHandle {
    constructor(el){ this.el = el; this._done=false; }
    fadeOut(ms){
      if (this._done) return; this._done = true;
      try{
        if (!this.el) return;
        // smooth fade; keep floating while opacity drops
        this.el.style.transition = `opacity ${Math.max(100, Number(ms)||10000)}ms linear`;
        this.el.style.opacity = '0';
        const ttl = Math.max(100, Number(ms)||10000);
        setTimeout(()=>{ try{ this.el.remove(); }catch{} }, ttl + 120);
      }catch{}
    }
    pop(){ // fast removal fallback
      if (this._done) return; this._done=true;
      try{ if (!this.el) return; this.el.classList.add('pop'); setTimeout(()=>{ try{ this.el.remove(); }catch{} }, 300); }catch{}
    }
    dispose(){ this.fadeOut(300); }
  }

  class BubbleEffect {
    constructor(host, options){
      if (!host) throw new Error('BubbleEffect requires a host element');
      ensureStyles();
      this.host = host;
      // Make sure host creates a positioning context for the absolute layer
      try{
        const cs = getComputedStyle(this.host);
        if (!cs || cs.position === 'static') this.host.style.position = 'relative';
      }catch{}
  this.opts = Object.assign({ startOffsetY: -72, dur: 20000 }, options||{});
  this.layer = host.querySelector(':scope > .fx-bubble-layer');
  if (!this.layer){ this.layer = document.createElement('div'); this.layer.className='fx-bubble-layer'; host.appendChild(this.layer); }
    }
    spawn(text, options){
      const opts = Object.assign({}, this.opts, options||{});
  const el = document.createElement('div'); el.className='fx-bubble';
  const inner = document.createElement('div'); inner.className='fx-bubble-i'; inner.textContent = String(text||''); el.appendChild(inner);
      // Position near bottom of host, slightly above input, with small random horizontal shift
      const hostRect = this.host.getBoundingClientRect();
      const sx = (Math.random() * 40 - 20); // -20..20 px sideways drift anchor
      el.style.setProperty('--sx', sx.toFixed(1)+'px');
  el.style.setProperty('--bubble-float-dur', Math.max(8000, Number(opts.dur)||20000)+'ms');
      // random sway
      el.style.setProperty('--sway', (10 + Math.random()*14).toFixed(1)+'px');
      el.style.setProperty('--bubble-sway-dur', (3.2 + Math.random()*2.0).toFixed(1)+'s');
      // Place at ~85% height, center-ish
      const leftPct = 50 + (Math.random()*10-5); // 45..55%
      el.style.left = leftPct+'%';
      el.style.bottom = Math.max(6, Math.min(hostRect.height-10, (opts.startOffsetY<0? -opts.startOffsetY : opts.startOffsetY)))+'px';
      el.style.transform = 'translateX(-50%)';
      this.layer.appendChild(el);
      return new BubbleHandle(el);
    }
    spawnAt(anchorEl, text, options){
      if (!anchorEl) return this.spawn(text, options);
      const opts = Object.assign({}, this.opts, options||{});
  const el = document.createElement('div'); el.className='fx-bubble';
  const inner = document.createElement('div'); inner.className='fx-bubble-i'; inner.textContent = String(text||''); el.appendChild(inner);
      const hostRect = this.host.getBoundingClientRect();
      const aRect = anchorEl.getBoundingClientRect();
      const sx = (Math.random() * 24 - 12);
      el.style.setProperty('--sx', sx.toFixed(1)+'px');
  el.style.setProperty('--bubble-float-dur', Math.max(8000, Number(opts.dur)||20000)+'ms');
      // random sway
      el.style.setProperty('--sway', (10 + Math.random()*14).toFixed(1)+'px');
      el.style.setProperty('--bubble-sway-dur', (3.2 + Math.random()*2.0).toFixed(1)+'s');
      // Center horizontally over the input; start slightly above the input
      const centerX = aRect.left - hostRect.left + (aRect.width / 2);
      const bottomPx = Math.max(6, (hostRect.bottom - aRect.bottom) + 8); // 8px above input bottom
      el.style.left = Math.round(centerX) + 'px';
      el.style.bottom = Math.round(bottomPx) + 'px';
      el.style.transform = 'translateX(-50%)';
      this.layer.appendChild(el);
      return new BubbleHandle(el);
    }
  }

  // expose
  window.BubbleEffect = BubbleEffect;
})();
