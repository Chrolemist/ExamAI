// Graph-klassen: ren datamodell (ingen DOM)
// Purpose: Hålla koll på noder, kopplingar och chatloggar. UI skriver/läser härifrån.
// Klassisk variant (ingen import/export) – exponeras på window.Graph
(function(){
  class Graph {
    constructor() {
      /** @type {Map<string, any>} */
      this.nodes = new Map();
      /** @type {any[]} */
      this.connections = [];
  /** @type {Map<string, Array<{id:string,author:string,text?:string,parts?:Array<{type:string,text?:string,url?:string,meta?:any}>,who:'user'|'assistant'|'system',ts:number,meta?:any}>>} */
      this.chatLogs = new Map();
  /** Internal monotonically increasing node id counter (numeric, stored as string) */
  this.nextId = 1;
    }

  /** Skapa en nod och returnera dess id. */
    addNode(type, x, y, id = null) {
      // If id is provided, use it; otherwise allocate a new sequential numeric id
      const nid = (id != null && id !== '') ? String(id) : String(this.nextId++);
      const NodeCls = window.Node;
      const n = new NodeCls(nid, type, x, y);
      this.nodes.set(nid, n);
      return nid;
    }

  /** Uppdatera nodens position (UI bör anropa vid drag). */
    moveNode(id, x, y) {
      const n = this.nodes.get(id);
      if (n) { n.x = x; n.y = y; }
    }

  /** Skapa en koppling mellan två noder (ignorerar self/ogiltiga id:n). */
    connect(fromId, toId) {
      if (!fromId || !toId || fromId === toId) return null;
      const a = this.nodes.get(fromId), b = this.nodes.get(toId);
      if (!a || !b) return null;
      const ConnectionCls = window.Connection;
      const c = new ConnectionCls(fromId, toId);
      this.connections.push(c);
      a.connections.add(toId);
      b.connections.add(fromId);
      return c;
    }

  /** Ta bort en koppling mellan två noder (om den finns). */
    disconnect(fromId, toId){
      if (!fromId || !toId) return false;
      const before = this.connections.length;
      this.connections = this.connections.filter(c => !(c.fromId===fromId && c.toId===toId) && !(c.fromId===toId && c.toId===fromId));
      const a = this.nodes.get(fromId), b = this.nodes.get(toId);
      if (a) a.connections.delete(toId);
      if (b) b.connections.delete(fromId);
      return this.connections.length !== before;
    }

  /**
   * Lägg till ett chattmeddelande för en panelägare (node/panel-id).
   * content kan vara string eller en parts-array [{type:'text', text:'...'}].
   */
    addMessage(ownerId, author, content, who = 'user', meta = undefined) {
      /** @type {Array<{type:string,text?:string,url?:string,meta?:any}>} */
      let parts;
      let text;
      if (Array.isArray(content)) {
        parts = content;
        text = (content.find(p=>p.type==='text')?.text) || '';
      } else {
        text = String(content ?? '');
        parts = [{ type:'text', text }];
      }
      const entry = { id: 'm'+Math.random().toString(36).slice(2,9), author, text, parts, who, ts: Date.now(), meta };
      if (!this.chatLogs.has(ownerId)) this.chatLogs.set(ownerId, []);
      this.chatLogs.get(ownerId).push(entry);
      return entry;
    }

  /** Hämta kopplad chattlogg för en ägare (tom array om saknas). */
    getMessages(ownerId){ return this.chatLogs.get(ownerId) || []; }

  /** Rensa chattlogg (om du vill rensa historik). */
    clearMessages(ownerId){ this.chatLogs.delete(ownerId); }

  /** Get settings for a node (returns an object, never null). */
    getNodeSettings(id){ const n=this.nodes.get(id); return (n && n.settings) ? n.settings : {}; }

  /** Merge and persist settings for a node. Shallow merge. */
    setNodeSettings(id, partial){ const n=this.nodes.get(id); if(!n) return; n.settings = Object.assign({}, n.settings||{}, partial||{}); }
  }

  window.Graph = Graph;
})();
