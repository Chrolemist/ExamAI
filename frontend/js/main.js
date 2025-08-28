// Startar appen – klassisk variant (ingen import/export).
// Responsibility: Bootstrap/uppstart, skapar standardnoder och kopplar baslyssnare.
// Påverkar inte mini.js; du kan ladda båda vid behov.
// SOLID hints:
// - S: Håll endast uppstart här; flytta affärslogik till respektive modul.
(function(){
	// Skapa en global graf-instans om Graph finns
	if (window.Graph) {
		window.graph = new window.Graph();
		console.info('[ExamAI] main.js (klassisk) laddad. graph finns på window.graph');
	} else {
		console.info('[ExamAI] main.js: väntar på Graph...');
	}
	// Flytta uppstart från mini.js hit (bryta ut bootstrap)
	window.addEventListener('DOMContentLoaded', () => {
		if (window.__examaiBootstrapped) return;
		window.__examaiBootstrapped = true;

		try {
			const midX = Math.round(window.innerWidth/2);
			if (window.createIcon) {
				window.createIcon('user', midX - 200, 160);
				window.createIcon('coworker', midX - 20, 240);
				window.createIcon('internet', midX + 200, 160);
	// Ensure section toolbars refresh coworker lists on fresh loads
	try{ window.dispatchEvent(new CustomEvent('coworkers-changed')); }catch{}
			}

			// Persist Node Board headings (Analys/Idéer/Produktion) across reloads
			try{
				const LS_KEY = 'nbTitles:v1';
				const loadMap = ()=>{ try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) || {} : {}; }catch{ return {}; } };
				const saveMap = (m)=>{ try{ localStorage.setItem(LS_KEY, JSON.stringify(m||{})); }catch{} };
				const titles = document.querySelectorAll('#nodeBoard .nb-sec');
				const map = loadMap();
				titles.forEach(sec => {
					const id = sec.getAttribute('data-nb-id') || '';
					const t = sec.querySelector('.nb-title');
					if (!t) return;
					if (id && map[id]) t.textContent = String(map[id]);
					const onChange = ()=>{
						const cur = (t.textContent||'').trim();
						if (!id) return;
						map[id] = cur || '';
						saveMap(map);
					};
					t.addEventListener('input', onChange);
					t.addEventListener('blur', onChange);
				});
			}catch{}

			const addBtn = document.getElementById('addCopilotBtn');
			// Legacy click-to-create handler removed; creation is now handled by the dropdown in index.html

			// mark header IO points as connectable
			document.querySelectorAll('.panel .head .section-io').forEach((io, idx) => {
				const section = io.closest('.panel');
				if (section && !section.dataset.sectionId) section.dataset.sectionId = 's' + idx;
				if (window.makeConnPointInteractive) window.makeConnPointInteractive(io, section);
			});

			// keep paths and points fresh on resize
			window.addEventListener('resize', () => {
				document.querySelectorAll('.fab').forEach(f => {
					f.querySelectorAll('.conn-point').forEach(cp => window.positionConnPoint && window.positionConnPoint(cp, f));
					window.updateConnectionsFor && window.updateConnectionsFor(f);
				});
				document.querySelectorAll('.panel').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
				document.querySelectorAll('.panel-flyout').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
			});

			// also keep connections fresh on scroll (window or scroll container)
			const refreshAllConnections = () => {
				try{
					document.querySelectorAll('.fab').forEach(f => window.updateConnectionsFor && window.updateConnectionsFor(f));
					document.querySelectorAll('.panel').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
					document.querySelectorAll('.panel-flyout').forEach(p => window.updateConnectionsFor && window.updateConnectionsFor(p));
				}catch{}
			};
			window.addEventListener('scroll', refreshAllConnections, { passive: true });
			try{ const sc = document.querySelector('.layout'); if (sc) sc.addEventListener('scroll', refreshAllConnections, { passive: true }); }catch{}

			// Initialize per-section settings (render mode)
			try{ window.initBoardSectionSettings && window.initBoardSectionSettings(); }catch{}
		} catch (err) {
			console.error('[ExamAI] Bootstrap error:', err);
		}
	});
})();
