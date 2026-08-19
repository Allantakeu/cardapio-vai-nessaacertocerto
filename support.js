/* Runtime mínimo para as páginas exportadas do design canvas.
   Substitui o support.js do ambiente de autoria: só precisa dar layout aos
   elementos customizados <x-dc>/<helmet> e mover o conteúdo do <helmet>
   para o <head>, como o original fazia. */
(function () {
  var css = 'x-dc,[data-dc-root]{display:contents}helmet{display:none}';
  var s = document.createElement('style');
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);

  function hoist() {
    var helmets = document.querySelectorAll('helmet');
    for (var i = 0; i < helmets.length; i++) {
      var h = helmets[i];
      while (h.firstChild) document.head.appendChild(h.firstChild);
      if (h.parentNode) h.parentNode.removeChild(h);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hoist);
  } else {
    hoist();
  }
})();
