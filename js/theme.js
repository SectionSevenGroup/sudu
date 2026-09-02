// The ground picker, once for every page.
//
// The picker is the three swatches in the chrome bar; the choice lives on
// <html> as classes and --dm-bg, and persists in localStorage under
// sudu-dm-bg. The classes select the ground's token block in css/tokens.css,
// which is all a ground is now: no marker, no inversion.
//
// One singleton, reachable as window.suduTheme. The swatches sit in the
// chrome bar on <html>, which Turbo never replaces, so they are built once.
// Nothing here belongs to one visit — no timer, no listener on the body — so
// there is nothing to tear down between them.
(function () {
  if (window.suduTheme) { window.suduTheme.bind(); return; }

  var KEY = 'sudu-dm-bg';
  var OFF_WHITE = '#F3F1EA';
  var CHARCOAL = '#121110';
  var OPTS = [['Charcoal', CHARCOAL], ['Off white', OFF_WHITE], ['Burnt', '#C0431F']];

  function saved() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    // The earlier red was retired for Burnt; a stored choice of it follows.
    return v === '#D0271F' ? '#C0431F' : (v || OFF_WHITE);
  }

  function apply(v) {
    var h = document.documentElement;
    if (v === OFF_WHITE) {
      h.classList.remove('dm', 'dmwarm', 'dmred');
      h.style.removeProperty('--dm-bg');
    } else {
      h.classList.add('dm');
      h.style.setProperty('--dm-bg', v);
      h.classList.toggle('dmwarm', v !== CHARCOAL);
      h.classList.toggle('dmred', v !== CHARCOAL);
    }
    try { localStorage.setItem(KEY, v); } catch (e) {}
    // The current ground's own swatch is withdrawn from the bar.
    var sw = document.getElementById('dmSwatches');
    if (sw) {
      for (var i = 0; i < sw.children.length; i++) {
        sw.children[i].hidden = sw.children[i].getAttribute('data-v') === v;
      }
    }
  }

  function build() {
    if (document.getElementById('dmSwatches')) return;
    var d = document.createElement('div');
    d.id = 'dmSwatches';
    for (var i = 0; i < OPTS.length; i++) {
      (function (o) {
        var b = document.createElement('button');
        b.title = o[0];
        b.setAttribute('data-v', o[1]);
        b.setAttribute('aria-label', 'Background: ' + o[0]);
        b.style.cssText = 'width:13px;height:13px;border-radius:50%;border:0;cursor:none;padding:0;background:' + o[1];
        b.onclick = function () { apply(o[1]); };
        d.appendChild(b);
      })(OPTS[i]);
    }
    (window.suduBar ? window.suduBar() : document.documentElement).appendChild(d);
  }

  function bind() {
    apply(saved());
    build();
  }

  window.suduTheme = { bind: bind, apply: apply };
  document.addEventListener('turbo:render', bind);
  bind();
})();
