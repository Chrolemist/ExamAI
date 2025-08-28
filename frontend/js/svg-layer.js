// SVG connection layer setup (classic)
// Responsibility: Initiera och exponera en enda helskärms-SVG för kopplingsvägar.
// Exposes window.svg to be used by connect.js path utilities.
// SOLID hints:
// - S: Endast lager-init + resize; ingen pathlogik här (den bor i connect.js).
// - D: Andra moduler använder window.svg (enkelt kontrakt) i stället för att skapa egna SVGs.
(function(){
  const s = document.getElementById('connLayer');
  /** Keep the SVG viewBox in sync with the viewport to simplify coordinates. */
  function resize(){ s.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`); }
  window.addEventListener('resize', resize);
  resize();
  window.svg = s;
})();
