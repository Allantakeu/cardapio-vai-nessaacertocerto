/* Runtime mínimo para as páginas exportadas do design canvas.
   Substitui o support.js do ambiente de autoria: só precisa dar layout aos
   elementos customizados <x-dc>/<helmet> e mover o conteúdo do <helmet>
   para o <head>, como o original fazia. */
(function () {
  /* Reset que faltou: as páginas foram desenhadas contra a folha de base do
     ambiente de autoria (_ds/.../styles.css), que não veio no handoff. Sem
     ela, <button> volta pro chrome padrão do navegador (moldura cinza,
     contorno azul de foco) e width:100%+padding sem box-sizing:border-box
     estoura a largura dos cartões — os dois sintomas de "botão feio". */
  var css = 'x-dc,[data-dc-root]{display:contents}helmet{display:none}'
    + '*,*::before,*::after{box-sizing:border-box}'
    + 'button,input,textarea,select{font:inherit;color:inherit;margin:0}'
    + 'button{background:none;border:0;padding:0;text-align:inherit;cursor:pointer;-webkit-appearance:none;appearance:none}'
    + 'button:disabled{cursor:default}'
    + 'button,a,input,textarea,select{-webkit-tap-highlight-color:transparent}'
    + 'button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--color-accent,var(--acc,#d81b84));outline-offset:2px}'
    + 'img,svg{display:block;max-width:100%}';
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
