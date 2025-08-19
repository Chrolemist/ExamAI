// SVG connection layer setup (classic)
// Purpose: Initialize the single full-screen SVG used to render connection paths.
// Exposes window.svg to be used by connect.js path utilities.
(function(){
  const s = document.getElementById('connLayer');
  /** Keep the SVG viewBox in sync with the viewport to simplify coordinates. */
  function resize(){ s.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`); }
  window.addEventListener('resize', resize);
  resize();
  window.svg = s;
})();
