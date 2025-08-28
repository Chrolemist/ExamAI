// Global app state (classic)
// Responsibility: UI-transient tillstånd separerat från datamodellen (Graph).
// Keeps DOM elements and transient interaction states that shouldn't live in Graph.
// SOLID hints:
// - S: Endast UI-artefakter (DOM-element, drag, hit-helpers). Ingen persistens här.
// - D: UI-komponenter bör läsa/skriva via små helpers istället för att mutera strukturen direkt.
(function(){
  /**
   * @typedef {{id:string, el:HTMLElement, type:string, x:number, y:number, panelEl?:HTMLElement}} UINode
   * @typedef {{fromId:string, toId:string, pathEl:SVGPathElement, fromCp:HTMLElement, toCp:HTMLElement}} UIConnection
   */
  window.state = window.state || {
    /** @type {UINode[]} */
    nodes: [],
    /** Active drag bookkeeping (internal) */
    dragging: null,
    /** Active connection started from a conn-point (internal) */
    connecting: null,
    /** @type {UIConnection[]} */
    connections: [],
  };
})();
