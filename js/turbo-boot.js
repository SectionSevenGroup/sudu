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
    'html[data-nav] #dc-root{opacity:0;}' +
    'html[data-nav="out"] #dc-root{transition:opacity .14s linear;}' +
    '#dc-root{transition:opacity .22s cubic-bezier(.16,1,.3,1);}' +
    // Reduced motion drops both fades. The hold itself stays: it is what keeps
    // a half-rendered template off the screen, which is not decoration.
    '@media (prefers-reduced-motion: reduce){#dc-root{transition:none;}}';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var OUT_MS = 140;
  document.head.appendChild(css);

  function reveal() {
    root.removeAttribute('data-nav');
  }

  // The dark-mode marker is what tells the theme engine which elements carry
  // the cream ground. It only ever ran on a set of timeouts from the first page
  // load, so after a swap the incoming sections stayed unmarked and html.dm's
  // invert applied to content that was never meant to be inverted — the bright
  // frame. It has to run against the committed DOM, before anything is shown.
  function settle() {
    if (typeof window.__suduMark === 'function') {
      try { window.__suduMark(); } catch (e) { /* never block the reveal */ }
    }
    requestAnimationFrame(reveal);
  }

  // React commits asynchronously, so the runtime cannot render into the frame
  // the swap happens on: measured at ~40ms between turbo:render and content.
  // Rather than leave that as a blink of empty ground, the outgoing page is
  // taken to zero first and Turbo is held until it gets there — the swap then
  // occurs on an already-blank page and the gap stops being visible at all.
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
      if ((host && host.firstChild) || ++tries > 12) { settle(); return; }
      requestAnimationFrame(wait);
    })();
  });

  // Belt and braces: whatever happened above, the page is never left hidden.
  document.addEventListener('turbo:load', reveal);
  document.addEventListener('turbo:before-cache', reveal);
})();
