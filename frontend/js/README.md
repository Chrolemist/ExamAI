# my/js – classic modular structure (no imports)

Purpose: Keep UI and data concerns split into small files that can run via file:// without a build.

## Files and responsibilities

- node.js – window.Node
  - Pure data for a node (id, type, x, y, connections:Set)
- port.js – window.Port
  - Optional data model for ports (side t/r/b/l, role in/out)
- connection.js – window.Connection
  - Pure data for a connection (fromId, toId)
- graph.js – window.Graph
  - Data model only; addNode, moveNode, connect, addMessage; no DOM

- state.js – window.state
  - UI-only state for DOM elements and transient interaction (nodes[], connections[])
- utils.js
  - Shared helpers: pointFromEvent, clamp, hexToRgb, cssToRgb, ROLE_COLORS, getColorForRole
- svg-layer.js – window.svg
  - Initializes the full-viewport SVG used for connection paths
- connect.js
  - Owns connection creation logic, path drawing, hover delete UI, and path updates
- nodes-ui.js
  - Creates/positions node FABs, dragging, and their connection points
- panels.js
  - Flyout panels (User/CoWorker/Internet), chat composer, resize/drag
- main.js
  - Bootstrap: creates default nodes, wires + button and section IO, sets resize listeners; ensures single window.graph

## Load order in index.html

1. port.js
2. connection.js
3. node.js
4. graph.js
5. state.js
6. utils.js
7. svg-layer.js
8. connect.js
9. panels.js
10. nodes-ui.js
11. main.js

This order guarantees that shared symbols exist before files that consume them.

## Data vs UI
- Graph is the single source of truth for data (nodes, connections, messages).
- state.js holds DOM references and transient UI bits that should not pollute Graph.
- UI files (nodes-ui, panels) call Graph methods but never store DOM inside Graph.

## Developing locally (no server)
- Double-click `my/index.html` and it runs. No CORS issues because we avoid ES modules.
- All functions/classes are attached to `window.*` for simplicity.

## Extending
- Add a new node type: extend Node if needed (usually not), add rendering in nodes-ui.js, and any special panel in panels.js.
- New visuals for connections: tweak connect.js (drawPath, ensureDefs) and CSS variables for colors.
- Persistence: can be added by serializing `window.graph` and restoring at startup; keep DOM out of Graph.

## Troubleshooting
- If nothing renders: check the script order and that `#connLayer` exists in index.html.
- If connections don’t update: ensure updateConnectionsFor is called on drag/resize.
- If styles look off: verify `my/styles.css` is linked (or `my/style.css` importing it).
