# Visual-only prototype (my/)

What this includes
- Same look and feel: panels, FAB icons (User, CoWorker, Internet), glow, animated flow lines
- Basic interactions only: drag icons, open chat panel on double-click, connect icons/panels with snapping line
- No logic or storage: inputs do nothing, no localStorage, no backend

How to use
- Open `my/index.html` in a browser
- Click + to add a CoWorker icon
- Double-click any icon to open its chat panel UI
- Start a connection by dragging from a small IO dot; release near another IO dot to snap

Notes
- Lines auto-update when moving icons or panels and on window resize
- You can edit section titles inline; they are not saved

## Code structure
- The UI and data are split across small classic JS files in `my/js/` so the page can run via file:// (no modules/build).
- See `my/js/README.md` for responsibilities and the exact script load order used in `index.html`.
