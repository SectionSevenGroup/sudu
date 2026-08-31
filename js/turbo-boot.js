// Turbo Drive integration for sudu.studio.
//
// Turbo swaps page content in place instead of doing full reloads, so the
// background music keeps playing seamlessly between screens and navigation
// feels instant.
//
// The gap this file exists to close: Turbo replaces <body> at turbo:render,
// which destroys #dc-root, and the DC runtime has to re-render the incoming
// template before anything is on screen again. Booting it from turbo:load by
// injecting a fresh <script src="/js/support.js"> cost a request, a parse of
// the whole runtime and a second event-loop turn — measured at ~126ms of
// empty themed ground between the swap and the first painted content, with
// every image then arriving after it.
//
// The runtime assigns its API onto window on first load, so after that first
// page __dcBoot is already in memory. Calling it synchronously inside
// turbo:render — which fires after the new body is in the DOM but before the
// browser paints — means the first frame after the swap already has content.
// The script injection is kept only as the fallback for the case where the
// runtime somehow is not resident.
//
// The theme lives on <html>, which Turbo never replaces, so the ground colour
// is continuous across the swap; nothing here needs to restore it.
(function () {
  if (window.__suduTurboWired) return;
  window.__suduTurboWired = true;

  var root = document.documentElement;
  var css = document.createElement('style');
  css.textContent =
    // Turbo's own progress bar, in the accent.
    '.turbo-progress-bar{height:2px;background:#E17B3E;}' +
    // The incoming page is held at zero for the one frame it takes the runtime
    // to render, then settles. Opacity only: no transform, no scale, nothing
    // that would fight the reveal engine already running inside the page.
    // Only #dc-root fades. The ground lives on <html>/<body> and is never
    // touched, so the Burnt / Charcoal / Off-white field stays continuously
    // visible: content leaves the field and content arrives into it.
    'html[data-nav] #dc-root{opacity:0;}' +
    'html[data-nav="out"] #dc-root{transition:opacity .18s cubic-bezier(.16,1,.3,1);}' +
    // The arrival borrows the reveal engine's easing and sits at roughly half
    // its 1.5s duration — long enough to read as settling rather than cutting,
    // short enough that navigation is not something you wait through.
    '#dc-root{transition:opacity .85s cubic-bezier(.16,1,.3,1);}' +
    // Reduced motion drops both fades. The hold itself stays: it is what keeps
    // a half-rendered template off the screen, which is not decoration.
    '@media (prefers-reduced-motion: reduce){#dc-root{transition:none;}}';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var OUT_MS = 180;
  var IN_MS = 850;
  document.head.appendChild(css);

  function reveal() {
    root.removeAttribute('data-nav');
  }

  // The dark-mode marker is what tells the theme engine which elements carry
  // the cream ground. It only ever ran on a set of timeouts from the first page
  // load, so after a swap the incoming sections stayed unmarked and html.dm's
  // invert applied to content that was never meant to be inverted — the bright
  // frame. It has to run against the committed DOM, before anything is shown.
  // The runtime replaces #dc-root wholesale on every boot, and a brand-new
  // element has no committed start value for a transition to run from — the
  // attribute-driven fade simply jumped to 1. So the arrival is driven on the
  // element itself, with the zero flushed before the change.
  function settle() {
    if (typeof window.__suduMark === 'function') {
      try { window.__suduMark(); } catch (e) { /* never block the reveal */ }
    }
    if (typeof window.__suduWorkArrive === 'function') {
      try { window.__suduWorkArrive(); } catch (e) {}
    }
    if (typeof window.__suduArrival === 'function') {
      try { window.__suduArrival(); } catch (e) {}
    }
    var host = document.getElementById('dc-root');
    if (!host || REDUCED.matches) { reveal(); return; }
    host.style.transition = 'none';
    host.style.opacity = '0';
    void host.offsetWidth;                       // commit the zero
    requestAnimationFrame(function () {
      host.style.transition = 'opacity ' + IN_MS + 'ms cubic-bezier(.16,1,.3,1)';
      host.style.opacity = '1';
      reveal();
      // hand the element back to the stylesheet once it has arrived
      setTimeout(function () {
        host.style.transition = '';
        host.style.opacity = '';
      }, IN_MS + 120);
    });
  }

  document.addEventListener('turbo:before-render', function (event) {
    if (REDUCED.matches) { root.setAttribute('data-nav', 'in'); return; }
    root.setAttribute('data-nav', 'out');
    event.preventDefault();
    setTimeout(function () {
      root.setAttribute('data-nav', 'in');
      event.detail.resume();
    }, OUT_MS);
  });

  // Fires with the new body in the DOM and before paint. Rendering here is what
  // removes the blank frame; doing it at turbo:load is already too late.
  document.addEventListener('turbo:render', function () {
    var booted = false;
    if (typeof window.__dcBoot === 'function') {
      try { window.__dcBoot(); booted = true; } catch (e) { booted = false; }
    }
    if (!booted) {
      // The runtime was not resident: fetch it, as the original glue did.
      var s = document.createElement('script');
      s.src = '/js/support.js';
      s.onload = settle;
      s.onerror = reveal;
      document.body.appendChild(s);
      setTimeout(reveal, 1200);
      return;
    }
    // __dcBoot renders through React, which commits asynchronously — the host
    // is still empty in this turn. Wait for the commit rather than assuming it,
    // then mark and expose. Bounded so a page that never renders is still shown.
    var tries = 0;
    (function wait() {
      var host = document.getElementById('dc-root');
      // hold the new host at zero the instant it exists, so it never paints
      // at full opacity while React is still committing into it
      if (host && !REDUCED.matches && host.style.opacity !== '0') {
        host.style.transition = 'none';
        host.style.opacity = '0';
      }
      if ((host && host.firstChild) || ++tries > 12) { settle(); return; }
      requestAnimationFrame(wait);
    })();
  });

  // Belt and braces: whatever happened above, the page is never left hidden.
  // turbo:load fires immediately after turbo:render — long before React has
  // committed — so revealing there exposed the incoming page at full opacity
  // for a frame or two before the arrival could take it back to zero. It is a
  // safety net, so it behaves like one: it only acts if the render path has
  // not already taken ownership.
  document.addEventListener('turbo:load', function () {
    setTimeout(function () { if (root.hasAttribute('data-nav')) reveal(); }, 1500);
  });
  document.addEventListener('turbo:before-cache', reveal);
})();
