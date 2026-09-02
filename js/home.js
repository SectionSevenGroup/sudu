// The home page's own behaviour, in plain script.
//
// Four things, each of which the page's Component used to carry: the
// Experience Index disclosure, the hero drawing's arrival, the scroll frame
// (the statement and caption fading out, the drawing's parallax, the header's
// ground past 40px) and the hover preview over the index rows. Reveal is not
// here: js/reveal.js owns [data-reveal] on this page as on every other.
//
// One singleton, reachable as window.suduHome. The script is loaded once and
// every later visit to the home page re-enters through bind(); everything a
// visit adds to the window and the body is torn down on turbo:before-render,
// so nothing from one visit leaks into the next. The preview card is the one
// permanent piece: it is a child of <html>, which Turbo never replaces.
(function () {
  if (window.suduHome) { window.suduHome.bind(); return; }

  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The state of one visit: what bind() created and unbind() clears.
  var live = null;

  // a) Experience Index ------------------------------------------------------
  // The list is emitted closed with the hidden attribute, so its entries are
  // out of the tab order until it opens. The chevron rotates off aria-expanded
  // through a class, so the button's one attribute is the whole state.
  function wireIndex(v) {
    var btn = document.querySelector('#experience > button[aria-controls]');
    var list = btn && document.getElementById(btn.getAttribute('aria-controls'));
    if (!btn || !list) return;
    var onClick = function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      list.hidden = open;
      if (!open && window.suduReveal) window.suduReveal.refresh();
    };
    btn.addEventListener('click', onClick);
    v.offs.push(function () { btn.removeEventListener('click', onClick); });
  }

  // b) The drawing's arrival, and the caption that follows it ---------------
  // The single owner: nothing else starts a transition on #heroImg. Idempotent
  // per element, so it runs once for each drawing that reaches the page and
  // never twice for the same one. The timings were tuned and are kept.
  function heroArrival(v) {
    var hi = document.getElementById('heroImg');
    var hf = document.getElementById('heroFoot');
    if (!hi || hi._intro) return;
    hi._intro = true;
    v.intro = true;
    var settle = function () {
      hi.style.transition = 'none';
      var hf2 = document.getElementById('heroFoot');
      if (hf2) { hf2.style.transition = 'none'; hf2.style.transitionDelay = '0ms'; hf2.style.opacity = '1'; hf2.style.transform = 'translateY(0)'; }
      v.intro = false;
      v.jsPar = true;
      var hi2 = document.getElementById('heroImg');
      if (hi2) { hi2.style.transition = 'none'; hi2.style.opacity = '1'; hi2.style.transform = 'translate(-50%,-50%)'; hi2.style.willChange = 'transform'; }
      run(v);
    };
    // Reduced motion: no arrival at all, straight to the settled state.
    if (REDUCED.matches) { settle(); return; }
    hi.style.opacity = '0';
    if (hf) { hf.style.opacity = '0'; hf.style.transform = 'translateY(26px)'; }
    var started = false;
    var start = function () {
      if (started) return;
      started = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          hi.style.transition = 'opacity 1.9s ' + EASE;
          hi.style.opacity = '1';
          if (hf) {
            hf.style.transition = 'opacity 1.4s ' + EASE + ', transform 1.6s ' + EASE;
            hf.style.transitionDelay = '0.7s';
            hf.style.opacity = '1';
            hf.style.transform = 'translateY(0)';
          }
        });
      });
      v.timers.push(setTimeout(settle, 2700));
    };
    // The fade begins only once the drawing is decoded, so a slow mobile load
    // fades instead of popping; 8s is the cap on waiting for it.
    if (hi.complete && hi.naturalWidth) start();
    else { hi.addEventListener('load', start, { once: true }); v.timers.push(setTimeout(start, 8000)); }
  }

  // c) The scroll frame ------------------------------------------------------
  // One rAF per scroll, and only the hero's own work while the hero is on
  // screen. The statement's fade is applied from the first scroll, arrival or
  // not: the engine used to hold every hero update while the intro settled,
  // and a visitor who scrolled inside that window kept a fully opaque
  // statement until the intro had finished once. home-scroll-fade-fix.js
  // mirrored the formula for that one element; this is now the one formula.
  function run(v) {
    if (!v || v.queued) return;
    v.queued = true;
    requestAnimationFrame(function () {
      v.queued = false;
      if (v !== live) return;
      var vh = window.innerHeight || 1;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (y < vh) {
        var stmt = document.getElementById('heroStatement');
        if (stmt) stmt.style.opacity = String(1 - Math.min(y / (vh * 0.45), 1));
        if (!v.intro) {
          var foot = document.getElementById('heroFoot');
          if (foot) { foot.style.opacity = String(1 - Math.min(y / (vh * 0.55), 1)); foot.style.transform = 'translateY(0)'; }
          if (v.jsPar && !REDUCED.matches) {
            var img = document.getElementById('heroImg');
            // vertical only, and at rest it resolves to the authored form
            // rather than a calc that merely evaluates to it
            if (img) {
              img.style.opacity = '1';
              var dy = y * 0.12;
              img.style.transform = dy < 0.05
                ? 'translate(-50%,-50%)'
                : 'translate(-50%, calc(-50% + ' + dy.toFixed(1) + 'px))';
            }
          }
        }
      }
      var past = y > 40;
      if (past !== v.navPast) {
        v.navPast = past;
        var nav = document.getElementById('suduNav');
        if (nav) {
          nav.style.transition = 'background .5s ease, border-color .5s ease';
          nav.style.background = past ? 'rgba(243,241,234,0.94)' : 'rgba(243,241,234,0.82)';
          nav.style.borderBottomColor = past ? 'rgba(23,22,19,0.13)' : 'rgba(23,22,19,0)';
        }
      }
    });
  }

  // d) The hover preview over the index rows ---------------------------------
  // Appended to <html>, so it survives every body swap, and built once: the
  // id is the guard. Its shadow is the one shadow on the site, by design.
  // On the Burnt ground the rows show a blurred text card only, never a photo.
  function previewCard() {
    if (document.getElementById('suduPreview')) return;
    var pv = document.createElement('div');
    pv.id = 'suduPreview';
    pv.style.cssText = 'position:fixed;z-index:90;width:230px;overflow:hidden;pointer-events:none;opacity:0;transform:scale(.95);transition:opacity .35s ' + EASE + ',transform .5s ' + EASE + ';box-shadow:0 18px 44px rgba(23,22,19,.2);background:#E8E5DC;';
    var pi = document.createElement('img');
    pi.style.cssText = 'width:100%;aspect-ratio:4/3;object-fit:cover;display:block;';
    var pt = document.createElement('div');
    pt.style.cssText = "padding:14px 16px;font-family:'Urbanist',sans-serif;font-size:12px;line-height:1.6;color:#F3F1EA;background:#171613;display:none;";
    pv.appendChild(pt);
    pv.appendChild(pi);
    document.documentElement.appendChild(pv);
    document.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-preview],[data-info]') : null;
      if (t) {
        var burnt = document.documentElement.classList.contains('dmwarm');
        var src = burnt ? null : t.getAttribute('data-preview');
        if (src) {
          pi.style.display = 'block'; pt.style.display = 'none';
          pv.style.background = '#E8E5DC';
          pv.style.backdropFilter = pv.style.webkitBackdropFilter = '';
        } else {
          pi.style.display = 'none'; pt.style.display = 'block';
          pt.textContent = t.getAttribute('data-info') || (t.textContent || '').trim();
          if (burnt) {
            pv.style.background = 'color-mix(in srgb, var(--dm-bg,#C0431F) 55%, transparent)';
            pv.style.backdropFilter = pv.style.webkitBackdropFilter = 'blur(16px) saturate(1.1)';
            pt.style.background = 'transparent';
            pt.style.color = '#F5F3EC';
            pt.style.border = '0.5px solid rgba(255,255,255,.3)';
          } else {
            pv.style.background = '#E8E5DC';
            pv.style.backdropFilter = pv.style.webkitBackdropFilter = '';
            pt.style.background = '#171613';
            pt.style.color = '#F3F1EA';
            pt.style.border = '0';
          }
        }
        if (src && pi.getAttribute('src') !== src) pi.src = src;
        pv.style.left = Math.min(e.clientX + 26, window.innerWidth - 250) + 'px';
        pv.style.top = Math.max(e.clientY - 100, 12) + 'px';
        pv.style.opacity = '1';
        pv.style.transform = 'scale(1)';
      } else {
        pv.style.opacity = '0';
        pv.style.transform = 'scale(.95)';
      }
    }, { passive: true });
  }

  // ------------------------------------------------------------- lifecycle
  function bind() {
    if (!document.getElementById('heroImg')) return;            // not the home page
    if (live && live.body === document.body) return;             // this body is bound
    unbind();
    var v = live = { body: document.body, intro: false, jsPar: false, navPast: null, queued: false, timers: [], offs: [] };
    wireIndex(v);
    previewCard();
    heroArrival(v);
    var onScroll = function () { run(v); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    v.offs.push(function () {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    });
    run(v);
  }

  function unbind() {
    if (!live) return;
    var v = live;
    live = null;
    for (var i = 0; i < v.timers.length; i++) clearTimeout(v.timers[i]);
    for (var j = 0; j < v.offs.length; j++) v.offs[j]();
  }

  window.suduHome = { bind: bind, unbind: unbind };
  document.addEventListener('turbo:before-render', unbind);
  document.addEventListener('turbo:render', bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
