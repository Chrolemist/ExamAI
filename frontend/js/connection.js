// Connection-klassen – klassisk variant, exponeras på window.Connection
// Responsibility: representerar en logisk koppling mellan två noder i datamodellen (ingen DOM).
// SOLID hints:
// - S (Single Responsibility): Håll denna klass som en ren datastruktur (frånId, tillId). Render/DOM hör hemma i connect.js.
// - O (Open/Closed): Lägg ny metadata via extra fält/DTO om det behövs, undvik att blanda UI-state här.
// - L (Liskov): Om du inför specialiserade kopplingar, se till att de fungerar där Connection förväntas.
// - I (Interface Segregation): Om metoder växer, överväg små gränssnitt (t.ex. Routable, Persistable) istället för en monolit.
// - D (Dependency Inversion): Konsumenter (UI/Router) bör bero på ett abstrakt kontrakt (shape) snarare än konkret klass.
(function(){
  class Connection {
    constructor(fromId, toId) {
      this.fromId = fromId;
      this.toId = toId;
    }
  }
  window.Connection = Connection;
})();
