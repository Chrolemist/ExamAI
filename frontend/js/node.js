// Node-klassen (ren datamodell) – klassisk variant på window.Node
// Responsibility: Hålla id, typ, position och kopplingsrelationer; samt lätta settings.
// SOLID hints:
// - S: Ingen DOM och inga panel-fält här; UI/flygpaneler lever i panels.js/internet-node.js.
// - O: Lägg ny metadata i settings för att undvika brytande ändringar.
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
  /** per-node settings persisted in Graph (e.g., model, role, topic, etc.) */
  this.settings = {};
    }
  }
  window.Node = Node;
})();
