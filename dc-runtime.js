/* dc-runtime.js — runtime das páginas .dc.html
 *
 * As páginas de design vieram sem o bundle proprietário que as renderizava.
 * Este arquivo reimplementa a superfície que elas realmente usam, e só ela:
 *
 *   - classe base DCLogic:  state, setState(obj|fn), props,
 *                           componentDidMount / componentDidUpdate / componentWillUnmount,
 *                           renderVals() devolvendo o escopo do template
 *   - template:             {{ caminho.pontuado }} em texto e atributos,
 *                           <sc-if value="{{ x }}">, <sc-for list="{{ xs }}" as="x">,
 *                           e as formas em atributo dc-if / dc-for + dc-as (necessárias
 *                           dentro de <tbody>/<select>, onde o parser HTML expulsaria
 *                           um elemento desconhecido para fora da tabela)
 *   - atributos onClick / onChange / onKeyDown / onPointerDown / onScroll,
 *     ref="{{ fn }}" (callback ref) e key="{{ x }}"
 *
 * A renderização é um diff de DOM por posição: nós existentes são reaproveitados,
 * então o foco e a posição do cursor nos inputs sobrevivem a um setState — que é o
 * que o checkout precisa para dar pra digitar.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- escopo */

  /* Só existem caminhos pontuados, literais e uma negação em todo o template
     (435 das 436 expressões são a.b.c), então não há por que embutir um
     avaliador de JS aqui. */
  function evalExpr(src, scope) {
    var e = String(src == null ? '' : src).trim();
    var neg = false;
    while (e.charAt(0) === '!') { neg = !neg; e = e.slice(1).trim(); }
    var v;
    if (e === '') v = undefined;
    else if (e === 'true') v = true;
    else if (e === 'false') v = false;
    else if (e === 'null' || e === 'undefined') v = null;
    else if (/^-?\d+(\.\d+)?$/.test(e)) v = parseFloat(e);
    else if (/^'[^']*'$/.test(e) || /^"[^"]*"$/.test(e)) v = e.slice(1, -1);
    else {
      var parts = e.split('.');
      v = scope;
      for (var i = 0; i < parts.length; i++) {
        if (v == null) { v = undefined; break; }
        v = v[parts[i]];
      }
    }
    return neg ? !v : v;
  }

  var SOLO = /^\s*\{\{([^}]*)\}\}\s*$/;
  var ANY = /\{\{([^}]*)\}\}/g;

  /* Um atributo que é só {{ x }} devolve o valor cru — é assim que funções
     (onClick, ref) e booleanos chegam inteiros. Misturado com texto, vira string. */
  function interp(str, scope) {
    if (str.indexOf('{{') < 0) return str;
    var solo = SOLO.exec(str);
    if (solo) return evalExpr(solo[1], scope);
    return str.replace(ANY, function (_, ex) {
      var v = evalExpr(ex, scope);
      return v == null ? '' : String(v);
    });
  }

  function interpText(str, scope) {
    var v = interp(str, scope);
    return v == null ? '' : String(v);
  }

  function childScope(scope, name, value) {
    var s = Object.create(scope);
    s[name] = value;
    return s;
  }

  /* --------------------------------------------------------------- eventos */

  var EVENT_ATTRS = {
    onclick: 'click',
    onchange: null,          /* resolvido por elemento, ver eventTypeFor */
    oninput: 'input',
    onkeydown: 'keydown',
    onkeyup: 'keyup',
    onpointerdown: 'pointerdown',
    onscroll: 'scroll',
    onfocus: 'focus',
    onblur: 'blur',
    onsubmit: 'submit'
  };

  /* onChange segue a semântica do React (dispara a cada tecla), exceto no
     seletor de arquivo, onde só change faz sentido. */
  function eventTypeFor(el, attr) {
    if (attr !== 'onchange') return EVENT_ATTRS[attr];
    var t = (el.getAttribute('type') || '').toLowerCase();
    return (el.tagName === 'INPUT' && t === 'file') ? 'change' : 'input';
  }

  function bindEvent(el, attr, fn) {
    var type = eventTypeFor(el, attr);
    if (!type) return;
    var store = el.__dcEv || (el.__dcEv = {});
    if (store[type]) { store[type].fn = fn; return; }
    var slot = store[type] = { fn: fn };
    el.addEventListener(type, function (e) {
      if (typeof slot.fn === 'function') slot.fn(e);
    });
  }

  /* ------------------------------------------------------------- atributos */

  var FORM_TAGS = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };

  function applyAttr(el, name, val) {
    if (val == null || val === false) {
      if (name === 'value' && FORM_TAGS[el.tagName]) { if (el.value !== '') el.value = ''; return; }
      if (el.hasAttribute(name)) el.removeAttribute(name);
      return;
    }
    if (val === true) { if (el.getAttribute(name) !== '') el.setAttribute(name, ''); return; }
    var s = String(val);
    /* value vai como propriedade nos campos de formulário: reescrever o atributo
       reposicionaria o cursor no fim a cada tecla digitada. */
    if (name === 'value' && FORM_TAGS[el.tagName]) {
      if (el.value !== s) el.value = s;
      return;
    }
    if (el.getAttribute(name) !== s) el.setAttribute(name, s);
  }

  /* ----------------------------------------------------- template -> vnodes */

  function buildChildren(tplNode, scope, out) {
    var kids = tplNode.childNodes;
    for (var i = 0; i < kids.length; i++) buildNode(kids[i], scope, out);
  }

  function buildNode(n, scope, out) {
    if (n.nodeType === 3) {
      var t = n.nodeValue;
      if (t.indexOf('{{') >= 0) t = interpText(t, scope);
      if (t !== '') out.push({ text: t });
      return;
    }
    if (n.nodeType !== 1) return;

    var tag = n.tagName.toLowerCase();
    if (tag === 'helmet' || tag === 'script' || tag === 'template') return;

    if (tag === 'sc-if') {
      if (interp(n.getAttribute('value') || '', scope)) buildChildren(n, scope, out);
      return;
    }
    if (tag === 'sc-for') {
      repeat(n, interp(n.getAttribute('list') || '', scope), n.getAttribute('as'), scope, out, true);
      return;
    }
    if (n.hasAttribute('dc-if') && !evalExpr(n.getAttribute('dc-if'), scope)) return;
    if (n.hasAttribute('dc-for')) {
      repeat(n, evalExpr(n.getAttribute('dc-for'), scope), n.getAttribute('dc-as'), scope, out, false);
      return;
    }
    out.push(makeVNode(n, scope));
  }

  /* inner=true repete os filhos do elemento (forma <sc-for>);
     inner=false repete o próprio elemento (forma dc-for). */
  function repeat(el, list, as, scope, out, inner) {
    if (!list || typeof list.length !== 'number') return;
    for (var i = 0; i < list.length; i++) {
      var s = childScope(scope, as, list[i]);
      if (inner) buildChildren(el, s, out);
      else out.push(makeVNode(el, s));
    }
  }

  var SKIP_ATTR = { 'dc-for': 1, 'dc-as': 1, 'dc-if': 1 };

  function makeVNode(el, scope) {
    var v = {
      tag: el.tagName.toLowerCase(),
      attrs: {},
      events: null,
      ref: null,
      key: undefined,
      children: []
    };
    var at = el.attributes;
    for (var i = 0; i < at.length; i++) {
      var name = at[i].name, raw = at[i].value;
      if (SKIP_ATTR[name] || name.indexOf('hint-') === 0) continue;
      if (name === 'key') { v.key = interp(raw, scope); continue; }
      var val = interp(raw, scope);
      if (name === 'ref' && typeof val === 'function') { v.ref = val; continue; }
      if (EVENT_ATTRS.hasOwnProperty(name)) {
        (v.events || (v.events = {}))[name] = typeof val === 'function' ? val : null;
        continue;
      }
      v.attrs[name] = val;
    }
    buildChildren(el, scope, v.children);
    return v;
  }

  /* ----------------------------------------------------------- vnode -> DOM */

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function createNode(v, inSvg) {
    if (v.text !== undefined) {
      v.dom = document.createTextNode(v.text);
      return v.dom;
    }
    var svg = inSvg || v.tag === 'svg';
    var el = svg
      ? document.createElementNS(SVG_NS, v.tag)
      : document.createElement(v.tag);
    v.dom = el;

    /* Filhos antes dos atributos: um <select value="..."> só consegue casar o
       valor depois que as <option> existem. */
    for (var i = 0; i < v.children.length; i++) el.appendChild(createNode(v.children[i], svg));
    for (var k in v.attrs) applyAttr(el, k, v.attrs[k]);
    if (v.events) for (var e in v.events) bindEvent(el, e, v.events[e]);
    if (v.ref) v.ref(el);
    return el;
  }

  function destroy(v) {
    if (v.text !== undefined) return;
    if (v.ref) v.ref(null);
    for (var i = 0; i < v.children.length; i++) destroy(v.children[i]);
  }

  function sameType(a, b) {
    if (a.text !== undefined) return b.text !== undefined;
    return b.text === undefined && a.tag === b.tag && a.key === b.key;
  }

  function patchNode(o, n, inSvg) {
    n.dom = o.dom;
    if (n.text !== undefined) {
      if (n.text !== o.text) o.dom.nodeValue = n.text;
      return;
    }
    var el = o.dom;
    var svg = inSvg || n.tag === 'svg';
    patchChildren(el, o.children, n.children, svg);

    var k;
    for (k in o.attrs) if (!(k in n.attrs)) applyAttr(el, k, null);
    for (k in n.attrs) if (n.attrs[k] !== o.attrs[k] || k === 'value') applyAttr(el, k, n.attrs[k]);

    var oe = o.events, ne = n.events, e;
    if (oe) for (e in oe) if (!ne || !(e in ne)) bindEvent(el, e, null);
    if (ne) for (e in ne) bindEvent(el, e, ne[e]);

    if (n.ref !== o.ref) {
      if (o.ref) o.ref(null);
      if (n.ref) n.ref(el);
    }
  }

  function patchChildren(parent, oldV, newV, inSvg) {
    var max = Math.max(oldV.length, newV.length);
    for (var i = 0; i < max; i++) {
      var o = oldV[i], n = newV[i];
      if (o && n) {
        if (sameType(o, n)) patchNode(o, n, inSvg);
        else {
          parent.replaceChild(createNode(n, inSvg), o.dom);
          destroy(o);
        }
      } else if (n) {
        parent.appendChild(createNode(n, inSvg));
      } else {
        if (o.dom && o.dom.parentNode === parent) parent.removeChild(o.dom);
        destroy(o);
      }
    }
  }

  /* ------------------------------------------------------------ componente */

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch, callback) {
    var next = typeof patch === 'function' ? patch(this.state) : patch;
    if (next) {
      var merged = {}, a, b;
      for (a in this.state) merged[a] = this.state[a];
      for (b in next) merged[b] = next[b];
      this.state = merged;
    }
    if (typeof callback === 'function') schedule(this, callback);
    else schedule(this);
  };
  DCLogic.prototype.renderVals = function () { return {}; };

  function schedule(inst, callback) {
    if (callback) (inst._dcCbs || (inst._dcCbs = [])).push(callback);
    if (inst._dcDirty) return;
    inst._dcDirty = true;
    Promise.resolve().then(function () {
      inst._dcDirty = false;
      render(inst);
      var cbs = inst._dcCbs;
      if (cbs) {
        inst._dcCbs = null;
        for (var i = 0; i < cbs.length; i++) cbs[i]();
      }
    });
  }

  function render(inst) {
    var scope;
    try { scope = inst.renderVals() || {}; }
    catch (err) { console.error('[dc-runtime] renderVals falhou:', err); return; }
    var next = [];
    buildChildren(inst._dcTpl, scope, next);
    patchChildren(inst._dcRoot, inst._dcVnodes, next, false);
    inst._dcVnodes = next;
    if (inst._dcMounted && inst.componentDidUpdate) {
      try { inst.componentDidUpdate(); }
      catch (err) { console.error('[dc-runtime] componentDidUpdate falhou:', err); }
    }
  }

  /* ------------------------------------------------------------------ boot */

  function readProps(scriptEl) {
    var props = {};
    try {
      var defs = JSON.parse(scriptEl.getAttribute('data-props') || '{}');
      for (var k in defs) {
        if (defs[k] && typeof defs[k] === 'object' && 'default' in defs[k]) props[k] = defs[k]['default'];
      }
    } catch (e) { /* data-props é só a folha de propriedades do editor */ }
    return props;
  }

  function boot() {
    var host = document.querySelector('x-dc');
    var tplEl = document.querySelector('template[data-dc-template]');
    var scriptEl = document.querySelector('script[type="text/x-dc"]');
    if (!host || !tplEl || !scriptEl) return;

    var Component;
    try {
      Component = new Function('DCLogic', scriptEl.textContent + '\n;return Component;')(DCLogic);
    } catch (err) {
      console.error('[dc-runtime] não foi possível compilar o componente:', err);
      return;
    }

    var inst = new Component(readProps(scriptEl));
    var root = document.createElement('div');
    root.setAttribute('data-dc-root', '');
    root.style.display = 'contents';
    host.appendChild(root);

    inst._dcTpl = tplEl.content;
    inst._dcRoot = root;
    inst._dcVnodes = [];

    render(inst);
    inst._dcMounted = true;
    if (inst.componentDidMount) {
      try { inst.componentDidMount(); }
      catch (err) { console.error('[dc-runtime] componentDidMount falhou:', err); }
    }
    window.addEventListener('pagehide', function () {
      if (inst.componentWillUnmount) inst.componentWillUnmount();
    });
    window.DC = { instance: inst, render: function () { render(inst); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
