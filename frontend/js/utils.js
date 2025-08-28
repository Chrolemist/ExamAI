// Utils (classic, no modules)
// Responsibility: Små, återanvändbara hjälpfunktioner som inte har UI-koppling.
// Exposes functions on window to avoid module imports (works via file://):
// - pointFromEvent, clamp, hexToRgb, cssToRgb, ROLE_COLORS, getColorForRole
// SOLID hints:
// - S: Lägg endast generiska helpers här (inga DOM-specifika beroenden annat än getComputedStyle vid färger).
// - I: Håll API:t litet; splitta i fler filer om verktygen växer (color-utils, dom-utils, math-utils).
// - D: Konsumenter bör inte känna till implementationsdetaljer; exponera små, stabila funktioner.
(function(){
  /** Convert Mouse/Pointers events into a simple point. */
  function pointFromEvent(e){ return { x: e.clientX, y: e.clientY }; }
  /** Clamp a number to [min, max]. */
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  /** Parse #RGB/#RRGGBB into an RGB object or null. */
  function hexToRgb(hex){
    const m = (hex||'').trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
    if(!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    const num = parseInt(h, 16);
    return { r: (num>>16)&255, g: (num>>8)&255, b: num&255 };
  }
  /** Parse rgba()/rgb()/#hex into an RGB object or null. */
  function cssToRgb(color){
    if (!color) return null;
    const c = color.trim();
    if (c.startsWith('#')) return hexToRgb(c);
    const m = c.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1))?\)$/i);
    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    return null;
  }
  /** Default role colors for I/O connection points. */
  const ROLE_COLORS = { in: '#22c55e', out: '#7c5cff' };
  /**
   * Get color for a role (in/out), optionally overridden by CSS variables:
   *  --conn-in-color / --conn-out-color on :root
   */
  function getColorForRole(el, role){
    try {
      const root = getComputedStyle(document.documentElement);
      const varName = role === 'in' ? '--conn-in-color' : '--conn-out-color';
      const v = (root.getPropertyValue(varName) || '').trim();
      if (v) return v;
    } catch {}
    return ROLE_COLORS[role] || (role === 'in' ? '#22c55e' : '#7c5cff');
  }
  window.pointFromEvent = pointFromEvent;
  window.clamp = clamp;
  window.hexToRgb = hexToRgb;
  window.cssToRgb = cssToRgb;
  window.ROLE_COLORS = ROLE_COLORS;
  window.getColorForRole = getColorForRole;
})();
