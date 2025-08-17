// IORegistry: assigns stable ioIds to connection points and provides lookups
// ioId format: `${nodeType}:${nodeId}:${side}:${index}`
export const IORegistry = (() => {
  const byEl = new WeakMap();
  const byId = new Map();

  function makeId({ nodeType, nodeId, side, index = 0 }) {
    return `${nodeType}:${nodeId}:${side}:${index}`;
  }

  function roleKey(ioId) { return `examai.io.role:${ioId}`; }

  function setRole(el, role) {
    const val = role === 'in' ? 'in' : role === 'out' ? 'out' : '';
    el.classList.remove('io-in', 'io-out');
    if (val === 'in') el.classList.add('io-in');
    if (val === 'out') el.classList.add('io-out');
    el.setAttribute('data-io', val);
    const label = (val === 'in') ? 'Input' : (val === 'out') ? 'Output' : '';
    if (label) { el.setAttribute('title', label); el.setAttribute('aria-label', label); }
  }

  function register(el, meta, opts = {}) {
    if (!el || !meta) return null;
    const { nodeType = 'node', nodeId = 'x', side = 'x', index = 0, defaultRole = 'out' } = meta;
    const ioId = makeId({ nodeType, nodeId, side, index });
    try { el.dataset.ioid = ioId; } catch {}
    // restore saved role (in/out) or apply default
    try {
      const saved = localStorage.getItem(roleKey(ioId));
      const role = (saved === 'in' || saved === 'out') ? saved : (defaultRole === 'in' ? 'in' : 'out');
      setRole(el, role);
    } catch { setRole(el, defaultRole === 'in' ? 'in' : 'out'); }
    byEl.set(el, { ioId, nodeType, nodeId, side, index });
    byId.set(ioId, el);
    if (opts.attachToggle) {
      // Alt-click to toggle role persistently
      el.addEventListener('click', (ev) => {
        if (!ev.altKey) return;
        ev.preventDefault(); ev.stopPropagation();
        const cur = el.getAttribute('data-io') || 'out';
        const next = (cur === 'out') ? 'in' : 'out';
        setRole(el, next);
        try { localStorage.setItem(roleKey(ioId), next); } catch {}
      }, { capture: true });
    }
    return ioId;
  }

  function getByEl(el) { return byEl.get(el) || null; }
  function getElById(id) { return byId.get(String(id)) || null; }
  function getRole(elOrId) {
    const el = typeof elOrId === 'string' ? byId.get(elOrId) : elOrId;
    return el ? (el.getAttribute('data-io') || '') : '';
  }
  return { register, getByEl, getElById, getRole, setRole, makeId };
})();
