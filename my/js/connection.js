// Connection-klassen – klassisk variant, exponeras på window.Connection
(function(){
  class Connection {
    constructor(fromId, toId) {
      this.fromId = fromId;
      this.toId = toId;
    }
  }
  window.Connection = Connection;
})();
