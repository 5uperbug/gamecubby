// Loaded as a plain blocking <script> in <head>, before any CSS paints:
// applies the saved (or system) theme so pages never flash the wrong colours,
// and adds the `js` class that keeps [data-reveal] elements hidden until
// their entrance animation runs.
(function () {
  var root = document.documentElement;
  var theme = null;
  try { theme = localStorage.getItem('gamecubby:theme'); } catch (e) { /* storage blocked */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
  root.classList.add('js');
})();
