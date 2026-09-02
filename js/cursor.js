// The crosshair cursor, once for every page.
//
// The site hides the native cursor and draws a crosshair that stretches with
// pointer velocity: the one piece of pure atmosphere on the site. It is for
// mouse users only. A touch device, or a hybrid that claims a fine pointer but
// is driven by touch, keeps its native cursor; so does a visitor who asks for
// reduced motion, since a cursor that stretches as it moves is motion. Each of
// those is a media query, watched live, so the native cursor comes back the
// moment a preference changes rather than on the next load.
//
// The crosshair is a child of <html>, which Turbo never replaces, and it is
// built on the first genuine pointer movement, not on load: created up front
// it sat stranded at 0,0 until the pointer happened to move. The listeners
// are on the window and the document, which persist too, so no visit owns
// anything here and there is nothing to tear down between them; arrival only
// re-checks the queries.
//
// The pages' own stylesheets carry the drawing (#xhair) and the rule that
// hides the native cursor (html.xh, html.xh * { cursor:none }). The class is
// the switch: while it is off, every control shows the native cursor, which
// the chrome bar's own cursor:none would otherwise still take away.
(function () {
  if (window.suduCursor) { window.suduCursor.bind(); return; }

  var FINE = matchMedia('(pointer:fine)');
  var HOVER = matchMedia('(hover:hover)');
  var COARSE = matchMedia('(pointer:coarse)');
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

  var css = document.createElement('style');
  css.textContent = 'html:not(.xh) #suduBar button,html:not(.xh) #dmSwatches button{cursor:auto !important;}';
  document.head.appendChild(css);

  var on = false;
  var el = null, x = 0, y = 0, raf = 0;
  var lx = 0, ly = 0, lt = 0, len = 16, tlen = 16, loop = 0;

  function wanted() {
    return FINE.matches && HOVER.matches && !COARSE.matches && !REDUCED.matches;
  }

  function make() {
    if (el || !document.body) return;
    el = document.getElementById('xhair');
    if (!el) {
      el = document.createElement('div');
      el.id = 'xhair';
      el.innerHTML = '<i></i><i></i><i></i><i></i>';
      document.documentElement.appendChild(el);
    }
    document.documentElement.classList.add('xh');
  }

  function draw() {
    raf = 0;
    if (el) el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }

  // The arms lengthen with speed and ease back to 16px at rest.
  function tick() {
    var d = tlen - len;
    len += d * 0.18;
    if (el) el.style.setProperty('--len', len.toFixed(1) + 'px');
    tlen += (16 - tlen) * 0.06;
    if (Math.abs(d) > 0.3 || tlen > 16.5) {
      loop = requestAnimationFrame(tick);
    } else {
      loop = 0; len = 16; tlen = 16;
      if (el) el.style.setProperty('--len', '16px');
    }
  }

  function move(e) {
    if (!on) return;
    var t = e.timeStamp || performance.now();
    var dt = Math.max(t - lt, 8);
    var sp = Math.hypot(e.clientX - lx, e.clientY - ly) / dt * 16;
    lx = e.clientX; ly = e.clientY; lt = t;
    x = e.clientX; y = e.clientY;
    tlen = Math.min(16 + sp * 2.4, 120);
    make();
    if (!loop) loop = requestAnimationFrame(tick);
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function fade(o) { return function () { if (el) el.style.opacity = o; }; }

  addEventListener('pointermove', move, { passive: true });
  addEventListener('pointerdown', fade('.5'), { passive: true });
  addEventListener('pointerup', fade('1'), { passive: true });
  document.addEventListener('mouseleave', fade('0'));
  document.addEventListener('mouseenter', fade('1'));

  function enable() { on = true; }

  // The native cursor returns at once: the drawing goes, the class that hid
  // the cursor goes, and the animation loops stop where they are.
  function disable() {
    on = false;
    if (loop) { cancelAnimationFrame(loop); loop = 0; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    len = 16; tlen = 16;
    if (el) { el.remove(); el = null; }
    document.documentElement.classList.remove('xh');
  }

  function bind() {
    if (wanted()) enable(); else disable();
  }

  var queries = [FINE, HOVER, COARSE, REDUCED];
  for (var i = 0; i < queries.length; i++) {
    if (queries[i].addEventListener) queries[i].addEventListener('change', bind);
    else queries[i].addListener(bind);
  }

  window.suduCursor = { bind: bind };
  document.addEventListener('turbo:render', bind);
  bind();
})();
