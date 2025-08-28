// Port-klassen – klassisk variant, exponeras på window.Port
// Responsibility: Ren datastruktur som beskriver en ports läge och roll för en nod.
// SOLID hints:
// - S: Inga rita/drag-händelser här; UI (nodes-ui/connect) hanterar interaktion.
// - O: Nya attribut (t.ex. label) kan läggas till utan att påverka konsumenter som läser nodeId/side/role.
(function(){
  class Port {
    /**
     * @param {string} nodeId
     * @param {'t'|'r'|'b'|'l'} side
     * @param {'in'|'out'} role
     */
    constructor(nodeId, side, role = 'out') {
      this.nodeId = nodeId;
      this.side = side;
      this.role = role;
    }
  }
  window.Port = Port;
})();
