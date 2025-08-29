(function(){
  // A lightweight traffic/controller agent that orchestrates turn-taking and batching across agents (nodes)
  // It does NOT generate content; it decides who speaks next, with how much, and when to stop.
  const MAX_ROUNDS_DEFAULT = 5;

  function isCoworker(id){ try{ const el=document.querySelector(`.fab[data-id="${id}"]`); return !!(el && el.dataset.type==='coworker'); }catch{ return false; } }

  // Simple policy object with overridables
  const defaultPolicy = {
    maxRounds: MAX_ROUNDS_DEFAULT,
    preferBackpressure: true,
    lineBatchSize: 3,
    allowOverlap: false, // if true, allow returns while next batch is en route
    priority: (a,b)=>0, // tie-breaker; 0 means no priority
    stopWhen: (ctx)=> false // custom stop condition
  };

  // Controller state per conversation chain (keyed by a routeId)
  const controllers = new Map();

  function getRouteId(fromId, toId){ return `${fromId}->${toId}`; }

  function createController(routeId, policy){
    const ctrl = {
      id: routeId,
      rounds: 0,
      waiting: false,
      queue: [], // pending outbound chunks
      policy: Object.assign({}, defaultPolicy, policy||{}),
      locked: false, // if true, strict ping-pong
      lastSpeaker: null
    };
    controllers.set(routeId, ctrl);
    return ctrl;
  }
  function getController(fromId, toId, policy){ const id = getRouteId(fromId,toId); return controllers.get(id) || createController(id, policy); }

  // Split into line batches (delegates to chunking helper if present)
  function toLineBatches(text, size){ try{ return (window.chunking?.makeLineBatches||((t,n)=>[String(t||'')]))(text, size); }catch{ return [String(text||'')]; } }

  // Public API
  async function orchestrate(fromId, toId, text, opts){
    const ctrl = getController(fromId, toId, opts?.policy);
    const batchSize = Math.max(1, Number(ctrl.policy.lineBatchSize)||3);
    const batches = (ctrl.policy.preferBackpressure && isCoworker(fromId) && isCoworker(toId))
      ? toLineBatches(text, batchSize)
      : [String(text||'')];
    // Enqueue all batches
    ctrl.queue.push(...batches);
    // If already processing, just return; the current loop will pick these up
    if (ctrl.waiting) return;
    ctrl.waiting = true;
    try{
      while(ctrl.queue.length){
        // Stop condition guard
        ctrl.rounds += 1;
        if (ctrl.policy.maxRounds && ctrl.rounds > ctrl.policy.maxRounds) break;
        if (typeof ctrl.policy.stopWhen==='function' && ctrl.policy.stopWhen(ctrl)) break;
        // Dequeue next chunk
        const chunk = ctrl.queue.shift();
        const payload = chunk;
        // Send: graph+ui enqueue + await requestAIReply
        try{ if(window.graph) window.graph.addMessage(toId, 'Incoming', payload, 'user', { via:getRouteId(fromId,toId) }); }catch{}
        try{ if(window.receiveMessage) window.receiveMessage(toId, payload, 'user', { via:getRouteId(fromId,toId) }); }catch{}
        // Await completion (stream done)
        try{ if(window.requestAIReply) await window.requestAIReply(toId, { text: payload, sourceId: fromId }); }
        catch(e){ if (e && (e._aborted || e.name==='AbortError')) break; }
        ctrl.lastSpeaker = toId;
        // If overlap not allowed, ensure any return path does not inject new outbound immediately (handled by routing policy elsewhere)
      }
    } finally {
      ctrl.waiting = false;
    }
  }

  function reset(fromId, toId){ const id=getRouteId(fromId,toId); controllers.delete(id); }
  function setPolicy(fromId, toId, policy){ const ctrl = getController(fromId,toId, policy); ctrl.policy = Object.assign({}, ctrl.policy, policy||{}); return ctrl.policy; }

  try{ window.trafficController = { orchestrate, reset, setPolicy, getController } }catch{}
})();
