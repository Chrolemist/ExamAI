// Node-klassen (ren datamodell) – klassisk variant på window.Node
(function(){
  class Node {
    /**
     * @param {string} id
     * @param {'user'|'coworker'|'internet'} type
     * @param {number} x
     * @param {number} y
     */
    constructor(id, type, x, y) {
      this.id = id;
      this.type = type;
      this.x = x;
      this.y = y;
      /** @type {Set<string>} */
      this.connections = new Set();
    }
  }
  window.Node = Node;
})();
