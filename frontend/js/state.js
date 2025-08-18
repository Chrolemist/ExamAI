// Global app state (classic)
// Purpose: UI-only state separate from the data model (Graph).
// Keeps DOM elements and transient interaction states that shouldn't live in Graph.
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
