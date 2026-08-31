// The single owner of page navigation for sudu.studio.
//
// Turbo swaps page content in place instead of doing full reloads, so the
// background music keeps playing between screens. The problem this file exists
// to solve is not speed but atomicity: the SuDu page is not finished when Turbo
// hands over the new body. The DC runtime still has to render it through React,
// the theme marker still has to classify the incoming sections, and the opening
// image still has to decode. Anything that paints in between is an intermediate
// state the visitor was never meant to see.
//
// So navigation is wrapped in one document View Transition. The browser holds
// the outgoing page on screen while the update callback runs, and every one of
// those steps happens inside that callback — invisibly. Only when the page is
// genuinely finished does the callback resolve, and only then does the browser
// capture the incoming state and cross-fade to it. One outgoing state, one
// incoming state, nothing in between.
//
// Turbo 8.0.23 ships its own View Transition integration, enabled with
// <meta name="view-transition" content="same-origin">. We deliberately do not
// use it. Its update callback resolves as soon as turbo:render has been
// dispatched, and React commits asynchronously after that: measured on this
// site, the browser captured #dc-root with zero children and no text, so the
// native path cross-faded the old page into a blank field and then popped the
// content in. The callback is ours precisely so it can be held open until the
// content is real.
//
// The permanent frame is not part of any of this. The theme lives on <html>
// and the chrome bar is a child of <html>, both of which Turbo never replaces,
// so the ground and the controls are continuously present across a visit:
// content leaves the field and content arrives into it.
(function () {
  if (window.__suduTurboWired) return;
  window.__suduTurboWired = true;

  // Two facts the page's own engines need, because several of them are loaded
  // by the incoming page itself and therefore first execute in the middle of a
  // visit. Without these they would each guess from turbo:load and start their
  // own animation on top of the page transition.
  //   __suduNavPhase — 'gating' while the coordinator is assembling a page
  //   __suduVisited  — sticky: false only on a genuine direct load
  window.__suduNavPhase = 'idle';
  window.__suduVisited = false;

  var root = document.documentElement;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var CAN_VT = typeof document.startViewTransition === 'function';

  var OUT_MS = 200;      // the fallback path's out-fade, where there is one layer
  var IN_MS = 760;       // the incoming one settles
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var IMAGE_HOLD = 350;  // hard cap on waiting for the opening image
  // Without a View Transition there is no held snapshot, so the gate is spent
  // on an empty field rather than on the outgoing page. The same work still
  // happens — it is simply not worth as much time when the visitor is looking
  // at the ground while it runs.
  var IMAGE_HOLD_FALLBACK = 180;
  var GATE_CAP = 1400;   // absolute cap: navigation never hangs on this file
  var COMMIT_TRIES = 30; // bounded wait for React to commit

  var css = document.createElement('style');
  css.textContent =
    '.turbo-progress-bar{height:2px;background:#E17B3E;}' +
    // Opacity only. No translate, scale, blur or clip: the field stays put and
    // only what sits on it changes.
    //
    // The two halves share one window and one curve, so the outgoing layer's
    // opacity and the incoming layer's always sum to exactly 1. That matters
    // because the browser composites the pair additively: giving the old a
    // short fade and the new a long one leaves a stretch where neither is
    // opaque and the cream ground shows through both. Measured on Work to
    // Project, the pair summed to about 0.63 around 100ms and the screen
    // washed out to near-bare ground between two dark pages.
    //
    // The curve is what makes the departure quick without breaking that sum:
    // it is heavily front-loaded, so the outgoing page is 84% gone by 200ms
    // and 95% gone by 300ms, while the incoming one spends the remaining
    // half-second settling the last of the way in.
    '::view-transition-group(root){animation-timing-function:' + EASE + ';}' +
    '::view-transition-old(root){animation:sudu-out ' + IN_MS + 'ms ' + EASE + ' both;}' +
    '::view-transition-new(root){animation:sudu-in ' + IN_MS + 'ms ' + EASE + ' both;}' +
    '@keyframes sudu-out{to{opacity:0}}' +
    '@keyframes sudu-in{from{opacity:0}}' +
    // The chrome bar lives outside <body> and survives every visit intact.
    // Giving it its own group takes it out of the root cross-fade, so it holds
    // still while the content behind it changes.
    '#suduBar{view-transition-name:sudu-chrome;}' +
    '::view-transition-group(sudu-chrome){animation:none;}' +
    '::view-transition-old(sudu-chrome),::view-transition-new(sudu-chrome){animation:none;mix-blend-mode:normal;}' +
    // Reduced motion keeps the atomicity and drops the animation: the incoming
    // page is still assembled out of sight, it simply arrives without a fade.
    // Both halves have to be stated. Dropping only the animation leaves the
    // pair at their default opacity of 1, and the browser composites them
    // additively — two pages summed, which measured as a two-frame wash to
    // near-white. The outgoing half is taken out and the incoming one painted
    // normally instead.
    '@media (prefers-reduced-motion: reduce){' +
      '::view-transition-old(root){animation:none;opacity:0;}' +
      '::view-transition-new(root){animation:none;opacity:1;mix-blend-mode:normal;}}' +
    // The fallback for browsers without the View Transition API. One fade, on
    // the content host only, driven by an attribute on <html>.
    'html[data-nav] #dc-root{opacity:0;}' +
    'html[data-nav="out"] #dc-root{transition:opacity ' + OUT_MS + 'ms ' + EASE + ';}' +
    '@media (prefers-reduced-motion: reduce){html[data-nav] #dc-root{transition:none;}}';
  document.head.appendChild(css);

  // ---------------------------------------------------------------- helpers

  function deferred() {
    var d = {};
    d.promise = new Promise(function (res) { d.resolve = res; });
    return d;
  }

  function afterFrame() {
    return new Promise(function (res) { requestAnimationFrame(function () { res(); }); });
  }

  // Bound any promise so a page that never finishes cannot hold the browser.
  function within(ms, promise) {
    return Promise.race([
      promise,
      new Promise(function (res) { setTimeout(res, ms); })
    ]);
  }

  // React renders through createRoot, which commits asynchronously — the host
  // is still empty in the turn that calls __dcBoot. Wait for the commit rather
  // than assuming it, and give up after a bounded number of frames so a page
  // that genuinely renders nothing is still shown.
  function committed() {
    var tries = 0;
    return new Promise(function (res) {
      (function look() {
        var host = document.getElementById('dc-root');
        if ((host && host.firstChild) || ++tries > COMMIT_TRIES) { res(); return; }
        requestAnimationFrame(look);
      })();
    });
  }

  // The theme marker classifies which incoming elements carry the cream ground.
  // It has to run against the committed DOM and before anything is shown, or
  // html.dm's inversion lands on sections that were never marked.
  function markTheme() {
    if (typeof window.__suduMark === 'function') {
      try { window.__suduMark(); } catch (e) {}
    }
  }

  // The scroll-reveal engines decide, per element, whether it is part of the
  // opening composition (shown outright) or below it (hidden, awaiting the
  // scroller). Running that decision inside the gate means the page is captured
  // in its settled state instead of being captured visible and then hidden.
  function prepareReveals() {
    var engines = [window.__sudu, window.__suduStudioIO, window.__suduProjIO];
    for (var i = 0; i < engines.length; i++) {
      if (engines[i] && typeof engines[i].refresh === 'function') {
        try { engines[i].refresh(); } catch (e) {}
      }
    }
    if (typeof window.__suduWorkPrepare === 'function') {
      try { window.__suduWorkPrepare(); } catch (e) {}
    }
    if (typeof window.__suduHeroZone === 'function') {
      try { window.__suduHeroZone(); } catch (e) {}
    }
  }

  // Only the images the opening composition actually depends on: large enough
  // to read as imagery, and inside the first viewport. Below-fold galleries are
  // never waited for. The homepage drawing is excluded by name — it is authored
  // at opacity 0 and runs its own reveal, and navigation does not own it.
  function criticalImages() {
    var host = document.getElementById('dc-root');
    if (!host) return [];
    var all = host.querySelectorAll('img');
    var vh = window.innerHeight || 1;
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var im = all[i];
      if (im.id === 'heroImg') continue;
      var src = im.getAttribute('src') || '';
      if (!src || src.indexOf('{' + '{') !== -1) continue;   // unresolved template
      var b = im.getBoundingClientRect();
      if (b.width < 120 || b.height < 90) continue;          // marks and icons
      if (b.top >= vh || b.bottom <= 0) continue;            // first screen only
      out.push(im);
    }
    return out;
  }

  function decodeCritical(cap) {
    var imgs = criticalImages();
    if (!imgs.length) return Promise.resolve();
    var jobs = [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      // Every critical image is decoded, including one that already reports
      // complete. complete only says the bytes arrived; it does not say the
      // pixels are ready at the size this page draws it. The project hero is
      // the same file as its thumbnail on the Work index, so arriving from
      // there it was complete and skipped — and the page was captured with an
      // empty hero box, which the fade then hid rather than prevented.
      // decode() is the only thing that actually promises the next paint.
      if (im.getAttribute('loading') === 'lazy') {
        im.setAttribute('loading', 'eager');
        im.setAttribute('fetchpriority', 'high');
      }
      try { jobs.push(im.decode()); } catch (e) {}
    }
    if (!jobs.length) return Promise.resolve();
    // allSettled: a broken image resolves the wait like any other, and the cap
    // means a slow one costs a bounded pause and then arrives on its own fade.
    return within(cap || IMAGE_HOLD, Promise.allSettled(jobs));
  }

  // Everything that has to be true before the incoming page may be shown. All
  // of it runs while the browser is holding the outgoing page on screen.
  function gate(rendered, cap) {
    return rendered
      .then(committed)
      .then(function () { markTheme(); prepareReveals(); })
      .then(afterFrame)          // let the prepared state reach layout
      .then(function () { return decodeCritical(cap); });
  }

  // Local reveal engines start here and nowhere else: the coordinator says when
  // the incoming view exists, instead of every engine guessing from turbo:load.
  function navigationReady() {
    window.__suduNavPhase = 'idle';
    root.removeAttribute('data-nav');
    try {
      document.dispatchEvent(new CustomEvent('sudu:navigation-ready'));
    } catch (e) {}
  }

  // ------------------------------------------------------------ the render

  var pending = null;   // resolved by turbo:render once the runtime has booted

  document.addEventListener('turbo:render', function () {
    var booted = false;
    if (typeof window.__dcBoot === 'function') {
      try { window.__dcBoot(); booted = true; } catch (e) { booted = false; }
    }
    if (!booted) {
      // The runtime was not resident. Fetch it, as the original glue did, and
      // let the gate's own cap decide how long that may take.
      var s = document.createElement('script');
      s.src = '/js/support.js';
      s.onload = function () { if (pending) pending.resolve(); };
      s.onerror = function () { if (pending) pending.resolve(); };
      document.body.appendChild(s);
      return;
    }
    if (pending) pending.resolve();
  });

  document.addEventListener('turbo:before-render', function (event) {
    var resume = event.detail && event.detail.resume;
    if (typeof resume !== 'function') return;   // nothing to coordinate
    event.preventDefault();
    window.__suduNavPhase = 'gating';
    window.__suduVisited = true;

    pending = deferred();
    var rendered = pending.promise;

    if (!CAN_VT) {
      // One fade, on the content host, with the same single-render discipline:
      // the incoming page is still assembled before it is revealed.
      root.setAttribute('data-nav', 'out');
      setTimeout(function () {
        root.setAttribute('data-nav', 'in');
        resume();
        within(GATE_CAP, gate(rendered, IMAGE_HOLD_FALLBACK)).then(function () {
          var host = document.getElementById('dc-root');
          if (!host || REDUCED.matches) { navigationReady(); return; }
          host.style.transition = 'none';
          host.style.opacity = '0';
          void host.offsetWidth;                       // commit the zero
          requestAnimationFrame(function () {
            host.style.transition = 'opacity ' + IN_MS + 'ms ' + EASE;
            host.style.opacity = '1';
            navigationReady();
            setTimeout(function () {
              host.style.transition = ''; host.style.opacity = '';
            }, IN_MS + 120);
          });
        });
      }, REDUCED.matches ? 0 : OUT_MS);
      return;
    }

    var started;
    try {
      started = document.startViewTransition(function () {
        resume();
        return within(GATE_CAP, gate(rendered));
      });
    } catch (e) {
      resume();
      within(GATE_CAP, gate(rendered)).then(navigationReady);
      return;
    }
    // updateCallbackDone fires the moment the incoming state has been captured
    // and the cross-fade begins, which is when the local engines should start:
    // their reveals then run with the arrival rather than after it.
    started.updateCallbackDone.then(navigationReady, navigationReady);
  });

  // Safety net. If anything above failed to take ownership, the page is never
  // left hidden behind the fallback attribute.
  document.addEventListener('turbo:load', function () {
    setTimeout(function () { if (root.hasAttribute('data-nav')) navigationReady(); }, 1500);
  });

  // ------------------------------------------------------------- preload

  // Turbo 8 prefetches eligible links on hover on its own. data-turbo-preload
  // additionally warms the four primary routes up front. On a metered or very
  // slow connection that is four documents the visitor did not ask for, so the
  // attribute is stripped before Turbo's preloader ever looks for it.
  (function () {
    var c = navigator.connection;
    if (!c) return;
    var slow = c.saveData === true || /(^|-)2g$/.test(c.effectiveType || '');
    if (!slow) return;
    var strip = function () {
      var links = document.querySelectorAll('a[data-turbo-preload]');
      for (var i = 0; i < links.length; i++) links[i].removeAttribute('data-turbo-preload');
    };
    strip();
    // Turbo rescans for preload links immediately after dispatching
    // turbo:render, so stripping there is what actually keeps the four
    // documents off a metered connection on every visit after the first.
    document.addEventListener('turbo:before-render', strip);
    document.addEventListener('turbo:render', strip);
    document.addEventListener('sudu:navigation-ready', strip);
  })();

  // ------------------------------------------------------- cache hygiene

  // Turbo caches the page with cloneNode(true), so whatever is inline on an
  // element at this moment is what a later Back button restores. Nothing
  // transient may be frozen into that clone: not a half-finished fade, not a
  // navigation opacity, not a temporary translate.
  //
  // What this must never do is clear a transform an element authored for
  // itself. The homepage drawing positions itself with translate(-50%,-50%),
  // and a pass that cleared it left the drawing half its own width off centre.
  // Only elements this site's own arrival passes marked as theirs are cleaned.
  document.addEventListener('turbo:before-cache', function () {
    root.removeAttribute('data-nav');

    var host = document.getElementById('dc-root');
    if (host) { host.style.transition = ''; host.style.opacity = ''; }

    // the first-screen arrival pass tags every element it touched
    var touched = document.querySelectorAll('[data-arrived]');
    for (var i = 0; i < touched.length; i++) {
      var el = touched[i];
      el.style.transition = '';
      el.style.opacity = '';
      el.style.transform = '';
    }

    // The Work grid is cached in its revealed state. Restoration should return
    // the page as the visitor left it, not replay the whole reading order, and
    // a card cached mid-reveal would otherwise come back invisible.
    if (typeof window.__suduWorkSettle === 'function') {
      try { window.__suduWorkSettle(); } catch (e) {}
    }
  });
})();
