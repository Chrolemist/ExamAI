// SVG connection rendering layer
export const ConnectionLayer = (() => {
  let svg = null;
  const allowed = new Set();
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
    // If perfectly horizontal or vertical, draw a straight line to avoid degenerate Bezier
    if (dx === 0 || dy === 0) {
      return `M ${a.x},${a.y} L ${b.x},${b.y}`;
    }
    const c = Math.max(30, Math.min(200, Math.max(dx, dy) * 0.5));
    const sx = (b.x >= a.x) ? 1 : -1; // flip curve when going leftwards
    return `M ${a.x},${a.y} C ${a.x + (c * sx)},${a.y} ${b.x - (c * sx)},${b.y} ${b.x},${b.y}`;
  }
  function allow(id) { 
    allowed.add(String(id)); 
  }
  function disallow(id) { 
    allowed.delete(String(id)); 
  }
  function draw(id, a, b) {
    if (!allowed.has(String(id))) {
      return; // guard against stale listeners
    }
    
    // Validate coordinates to prevent invalid paths
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return; // Skip invalid coordinates
    }
    // If points coincide, render a tiny dot segment so it remains visible
    if (a.x === b.x && a.y === b.y) {
      b = { x: b.x + 0.01, y: b.y + 0.01 };
    }
    
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
        // Use userSpaceOnUse to avoid objectBoundingBox degeneracy when bbox width/height is 0
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        const setGradSpan = () => {
          try {
            grad.setAttribute('x1', '0');
            grad.setAttribute('y1', '0');
            grad.setAttribute('x2', String(window.innerWidth));
            grad.setAttribute('y2', String(window.innerHeight));
          } catch {}
        };
        setGradSpan();
        // Keep gradient covering the viewport on resize
        try { window.addEventListener('resize', setGradSpan, { passive: true }); } catch {}
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color','#7c5cff');
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color','#00d4ff');
        grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); root.appendChild(defs);
      }
      root.appendChild(el);
    }
    
    // Only update if the path would actually change (reduces DOM thrashing)
    const newPath = pathFor(a, b);
    if (el.getAttribute('d') !== newPath) {
      el.setAttribute('d', newPath);
    }

    // Add/update disconnect button at midpoint
    updateDisconnectButton(id, a, b, root);
  }
  function remove(id) {
    disallow(id);
    const root = ensure();
    // Remove main path(s)
    try {
      const nodes = root.querySelectorAll(`path[data-id="${id}"]`);
      nodes.forEach(n => n.remove());
    } catch {}
    // Also remove any pulse overlays linked to this line
    try {
      const overlays = root.querySelectorAll(`path[data-flow-of="${id}"]`);
      overlays.forEach(n => n.remove());
    } catch {}
    // Remove disconnect button
    try {
      const btn = root.querySelector(`g[data-disconnect-for="${id}"]`);
      if (btn) btn.remove();
    } catch {}
  }

  function updateDisconnectButton(lineId, a, b, root) {
    // Calculate midpoint
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    let btnGroup = root.querySelector(`g[data-disconnect-for="${lineId}"]`);
    if (!btnGroup) {
      btnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      btnGroup.setAttribute('data-disconnect-for', lineId);
      btnGroup.setAttribute('class', 'disconnect-btn');
      btnGroup.style.cursor = 'pointer';
      
      // Background circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '8');
      circle.setAttribute('fill', '#ff4444');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('opacity', '0.9');
      
      // X symbol
      const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line1.setAttribute('x1', '-4');
      line1.setAttribute('y1', '-4');
      line1.setAttribute('x2', '4');
      line1.setAttribute('y2', '4');
      line1.setAttribute('stroke', '#ffffff');
      line1.setAttribute('stroke-width', '2');
      line1.setAttribute('stroke-linecap', 'round');
      
      const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line2.setAttribute('x1', '4');
      line2.setAttribute('y1', '-4');
      line2.setAttribute('x2', '-4');
      line2.setAttribute('y2', '4');
      line2.setAttribute('stroke', '#ffffff');
      line2.setAttribute('stroke-width', '2');
      line2.setAttribute('stroke-linecap', 'round');

      btnGroup.appendChild(circle);
      btnGroup.appendChild(line1);
      btnGroup.appendChild(line2);

      // Click handler
      btnGroup.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleDisconnectClick(lineId);
      });

      // Hover effects
      btnGroup.addEventListener('mouseenter', () => {
        circle.setAttribute('opacity', '1');
        circle.setAttribute('fill', '#ff6666');
      });
      
      btnGroup.addEventListener('mouseleave', () => {
        circle.setAttribute('opacity', '0.9');
        circle.setAttribute('fill', '#ff4444');
      });

      root.appendChild(btnGroup);
    }

    // Update position
    btnGroup.setAttribute('transform', `translate(${midX}, ${midY})`);
  }

  function handleDisconnectClick(lineId) {
    // Find which nodes this connection belongs to and disconnect them
    try {
      // Emit a global event that connection managers can listen to
      window.dispatchEvent(new CustomEvent('examai:disconnect:requested', {
        detail: { lineId }
      }));
      
      // Also try to find the connection in common places and remove it
      disconnectByLineId(lineId);
      
    } catch (error) {
      console.warn('Error handling disconnect click:', error);
    }
  }

  function disconnectByLineId(lineId) {
    try {
      // Check copilot instances
      if (window.CopilotManager?.instances) {
        for (const [id, inst] of window.CopilotManager.instances.entries()) {
          if (inst.connections) {
            for (const [targetId, connData] of inst.connections.entries()) {
              const connections = Array.isArray(connData) ? connData : [connData];
              const matchingConn = connections.find(conn => conn.lineId === lineId);
              if (matchingConn) {
                // Special-case: Internet hub link — delegate to InternetHub so it can clear its own state and persistence
                try {
                  const LINK_KEY = window.InternetHub?.LINK_KEY;
                  if (LINK_KEY && String(targetId) === String(LINK_KEY)) {
                    // This will remove the visual, delete the connection entry, update internal linked set,
                    // and crucially remove persisted copilot→internet link so it doesn't restore on refresh.
                    window.InternetHub.unlinkCopilot(inst);
                    try { 
                      if (typeof window.toast === 'function') {
                        window.toast('Internet-koppling frånkopplad.');
                      }
                    } catch {}
                    return;
                  }
                } catch {}
                // Remove this specific connection
                try { matchingConn.remove?.(); } catch {}
                
                // Update the connection data
                if (Array.isArray(connData)) {
                  const filtered = connections.filter(conn => conn.lineId !== lineId);
                  if (filtered.length === 0) {
                    inst.connections.delete(targetId);
                  } else {
                    inst.connections.set(targetId, filtered.length === 1 ? filtered[0] : filtered);
                  }
                } else {
                  inst.connections.delete(targetId);
                }
                
                // Clean up target side if it's another copilot
                const targetInst = window.CopilotManager.instances.get(targetId);
                if (targetInst?.connections) {
                  const targetConnData = targetInst.connections.get(id);
                  if (targetConnData) {
                    const targetConnections = Array.isArray(targetConnData) ? targetConnData : [targetConnData];
                    const filtered = targetConnections.filter(conn => conn.lineId !== lineId);
                    if (filtered.length === 0) {
                      targetInst.connections.delete(id);
                    } else {
                      targetInst.connections.set(id, filtered.length === 1 ? filtered[0] : filtered);
                    }
                  }
                }
                
                // Clean up flow references
                if (inst.flowOutId === targetId) inst.flowOutId = null;
                if (inst.flowInId === targetId) inst.flowInId = null;
                if (targetInst) {
                  if (targetInst.flowOutId === id) targetInst.flowOutId = null;
                  if (targetInst.flowInId === id) targetInst.flowInId = null;
                }

                // Remove persisted link for copilot↔copilot
                try {
                  const GP = window.GraphPersistence;
                  GP?.removeWhere?.(l => (
                    (l.fromType==='copilot' && l.fromId===id && l.toType==='copilot' && l.toId===targetId) ||
                    (l.fromType==='copilot' && l.fromId===targetId && l.toType==='copilot' && l.toId===id)
                  ));
                } catch {}

                // Remove persisted link for copilot→section
                try {
                  if (typeof targetId === 'string' && targetId.startsWith('section:')) {
                    const secKey = targetId.slice('section:'.length);
                    window.GraphPersistence?.removeWhere?.(l => (
                      l.fromType==='copilot' && l.fromId===id && l.toType==='section' && l.toId===secKey
                    ));
                  }
                } catch {}

                try { 
                  if (typeof window.toast === 'function') {
                    window.toast('Koppling frånkopplad.');
                  }
                } catch {}
                return;
              }
            }
          }
        }
      }

      // Check user node connections
      if (window.__ExamAI_UserNodeApi?.ensure) {
        const userNode = window.__ExamAI_UserNodeApi.ensure();
        if (userNode._linkLines) {
          for (const [copilotId, connections] of userNode._linkLines.entries()) {
            const connArray = Array.isArray(connections) ? connections : [connections];
            const matchingConn = connArray.find(conn => conn.lineId === lineId);
            if (matchingConn) {
              // If this is a section link tracked under synthetic key "section:<key>", delegate to unlinkSection
              if (typeof copilotId === 'string' && copilotId.startsWith('section:') && userNode.unlinkSection) {
                const key = copilotId.slice('section:'.length);
                try { userNode.unlinkSection(key); } catch {}
              } else {
                userNode._unlinkCopilot(copilotId);
              }
              try { 
                if (typeof window.toast === 'function') {
                  window.toast('Användarkoppling frånkopplad.');
                }
              } catch {}
              return;
            }
          }
        }
      }

      // Check Internet hub connections
      if (window.InternetHub) {
        if (window.CopilotManager?.instances) {
          for (const [id, inst] of window.CopilotManager.instances.entries()) {
            const internetConn = inst.connections?.get?.(window.InternetHub.LINK_KEY);
            if (internetConn?.lineId === lineId) {
              window.InternetHub.unlinkCopilot(inst);
              try { 
                if (typeof window.toast === 'function') {
                  window.toast('Internet-koppling frånkopplad.');
                }
              } catch {}
              return;
            }
          }
        }
      }

    } catch (error) {
      console.warn('Error in disconnectByLineId:', error);
    }
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
  return { draw, remove, pulse, allow, disallow, updateDisconnectButton, handleDisconnectClick };
})();
