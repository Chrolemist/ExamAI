// NodeBoard: top area with sections and parking spots for organizing nodes
export const NodeBoard = (() => {
  const KEY_TITLES = 'examai.nodeboard.titles';
  const titles = (() => { try { return JSON.parse(localStorage.getItem(KEY_TITLES)||'{}')||{}; } catch { return {}; } })();
  const grid = 24;
  function snap(v) { return Math.round(v / grid) * grid; }
  
  // FAB Controller for managing draggable nodes
  let fabController = null;
  
  // Track elements that should stay bound to the Node Board's vertical band
  const bound = new Set();
  function bind(el) {
    if (!el || !el.style) return;
    bound.add(el);
    
    // If FAB controller is available, register the element
    if (fabController) {
      try {
        fabController.registerFab(el);
      } catch (error) {
        console.warn('Failed to register FAB with controller:', error);
      }
    }
  }
  function unbind(el) { 
    try { 
      bound.delete(el); 
      
      // Unregister from FAB controller if available
      if (fabController) {
        fabController.unregisterFab(el);
      }
    } catch {} 
  }
  function init() {
    const el = document.getElementById('nodeBoard');
    if (!el) return;
    
    // Initialize FAB controller for draggable node management
    try {
      fabController = new NodeBoardFabController(el);
      
      // Set up event listeners for FAB events
      fabController.eventBus.on('fab-moved', (data) => {
        // Emit compatibility event for existing code
        window.dispatchEvent(new CustomEvent('examai:fab:moved', {
          detail: { element: data.element, position: data.newPosition }
        }));
      });
      
    } catch (error) {
      console.error('Failed to initialize FAB controller:', error);
    }
    
    // Restore editable titles
    el.querySelectorAll('.nb-sec').forEach(sec => {
      const id = sec.getAttribute('data-nb-id');
      const title = sec.querySelector('.nb-title');
      if (titles[id]) title.textContent = titles[id];
      title.addEventListener('blur', () => { titles[id] = title.textContent || ''; try { localStorage.setItem(KEY_TITLES, JSON.stringify(titles)); } catch {}; updateOffset(); });
    });
    
    // When layout changes (resize only), update connections
    const onResize = () => { try { updateOffset(); window.dispatchEvent(new CustomEvent('examai:fab:moved')); } catch {} };
    window.addEventListener('resize', onResize);
    // Allow scrolling the board even when mouse is over fixed FABs by forwarding wheel events
    const forwardWheel = (ev) => {
      try {
        if (!el) return;
        el.scrollTop += ev.deltaY;
        ev.preventDefault();
      } catch {}
    };
    document.addEventListener('wheel', (ev) => {
      const target = ev.target;
      // Forward only if hovering a FAB within the Node Board vertical band
      if (target && target.closest && target.closest('.fab')) {
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          forwardWheel(ev);
        }
      }
    }, { passive: false });
    // Initial offset update
  try { setTimeout(onResize, 0); } catch {}
  }
  // Clamp a top value so nodes remain in/near the board when the page scrolls
  function clampTop(y) {
    const board = document.getElementById('nodeBoard');
    if (!board) return y;
    const r = board.getBoundingClientRect();
    // Use viewport coordinates (position:fixed uses viewport space)
  const minY = r.top + 8; // directly under Node Board top
  const maxY = Math.max(minY, r.bottom - 72); // keep within Node Board band
    return Math.max(minY, Math.min(maxY, y));
  }
  // Update CSS var that offsets the main content below the fixed Node Board
  function updateOffset() {
    try {
      const el = document.getElementById('nodeBoard');
      if (!el) return;
      // Prefer the configured band height if set
      const cssH = getComputedStyle(document.documentElement).getPropertyValue('--nodeboard-height').trim();
      let h = 0;
      if (cssH && /px$/.test(cssH)) h = parseInt(cssH, 10) || 0;
      if (!h) {
        const r = el.getBoundingClientRect();
        h = Math.ceil(r.height || 0);
      }
      document.documentElement.style.setProperty('--nodeboard-offset', Math.max(0, h) + 'px');
    } catch {}
  }
  // Called after a bound element moved (drag) to refresh its stored offset
  function onMoved(el) {
    try {
      if (!el || !bound.has(el)) return;
      const board = document.getElementById('nodeBoard');
      if (!board) return;
      const br = board.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const offY = er.top - br.top;
      el.dataset.nbOffY = String(Math.max(0, Math.round(offY)));
    } catch {}
  }
  // Arrange all FABs in a grid layout (new feature)
  function arrangeInGrid(options = {}) {
    if (fabController) {
      return fabController.arrangeInGrid(options);
    }
    return [];
  }
  
  // Get FAB controller instance (for advanced usage)
  function getFabController() {
    return fabController;
  }
  
  return { 
    init, 
    snap, 
    clampTop, 
    gridSize: grid, 
    bind, 
    unbind, 
    onMoved, 
    updateOffset,
    arrangeInGrid,
    getFabController
  };
})();
