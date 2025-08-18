// Port-klassen – klassisk variant, exponeras på window.Port
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
