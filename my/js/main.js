// Startar appen – klassisk variant (ingen import/export).
// Påverkar inte mini.js; du kan ladda båda vid behov.
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
			}

			const addBtn = document.getElementById('addCopilotBtn');
			if (addBtn) {
				addBtn.addEventListener('click', () => {
					const x = 40 + Math.random() * (window.innerWidth - 120);
					const y = 80 + Math.random() * (window.innerHeight - 160);
					if (window.createIcon) window.createIcon('coworker', x, y);
				});
			}

			// mark header IO points as connectable
			document.querySelectorAll('.panel .head .section-io').forEach((io, idx) => {
				const section = io.closest('.panel');
				if (section) section.dataset.sectionId = 's' + idx;
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
		} catch (err) {
			console.error('[ExamAI] Bootstrap error:', err);
		}
	});
})();
