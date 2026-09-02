// The single owner of page navigation for sudu.studio.
//
// Turbo swaps page content in place instead of doing full reloads, so the
// background music keeps playing between screens. The problem this file exists
// to solve is not speed but atomicity: the SuDu page is not finished when Turbo
// hands over the new body. The theme marker still has to classify the incoming
// sections, the reveal engines still have to settle the opening composition,
// and the opening image still has to decode. Anything that paints in between
// is an intermediate state the visitor was never meant to see.
//
// The shape of the answer is two independent halves rather than one held frame:
//
//   click  -> the outgoing content starts fading on the very next paint, while
//             Turbo's request runs concurrently
//          -> it reaches the permanent SuDu field
//          -> the incoming page is assembled behind that field, from opacity 0
//          -> it fades gently in, once, when it is genuinely ready
//
// This was built on a document View Transition first, and that was wrong. A
// view transition holds the outgoing frame still while its update callback
// runs, and our callback is where all the assembly happens — so the visitor
// clicked and watched a frozen page until the whole gate resolved, then got a
// hard swap. Responsiveness has to come first and be independent of readiness.
// The exit is therefore driven by turbo:before-visit, which fires before the
// request, and the entrance waits on the gate. Neither blocks the other.
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

  // The content field: the #page the build wraps every page's body in.
  function field() {
    return document.getElementById('page');
  }

  // The rhythm is deliberately asymmetric. Leaving is brisk; arriving is slow
  // enough to be watched. What must not happen is a gap between the two — a
  // blank hold followed by a quick appearance reads as a stall, not as a
  // transition — so the incoming page starts its visible fade the moment it
  // has something to show, and takes its time from there.
  var OUT_MS = 200;      // the outgoing content leaves
  var IN_MS = 1150;      // the incoming one materialises
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var IMAGE_HOLD = 260;  // hard cap on waiting for the opening image
  // First direct arrival only: the ground is painted immediately and the page
  // resolves into it. A CSS animation rather than a transition, so it finishes
  // on its own and cannot strand at zero if anything else goes wrong.
  var ARRIVE_MS = 1500;
  var GATE_CAP = 1400;   // absolute cap: navigation never hangs on this file

  var css = document.createElement('style');
  css.textContent =
    '.turbo-progress-bar{height:2px;background:#E17B3E;}' +
    // Only #page moves. The ground on <html>, the chrome bar, the theme and
    // the language, music and colour controls are all outside it and hold
    // still: content leaves the field, content arrives into it.
    //
    // The exit is a plain class change on <html>, so it starts on the next
    // paint after the click with no JavaScript in the way. The hold that
    // follows is the same rule without a transition, which is what keeps a
    // half-assembled page off the screen — the incoming field is already at 0
    // before it can paint, so it never goes 1 to 0 to 1.
    'html[data-nav] #page{opacity:0;}' +
    'html[data-nav="out"] #page{transition:opacity ' + OUT_MS + 'ms ' + EASE + ';}' +
    // Reduced motion keeps the ordering and drops the animation: the incoming
    // page is still assembled out of sight, it simply arrives without a fade.
    '@media (prefers-reduced-motion: reduce){html[data-nav] #page{transition:none;}}' +
    // The first arrival. The class is only ever added by script, so a browser
    // that never runs it simply shows the page — there is no authored
    // opacity:0 for anything to get stuck behind.
    'html.sudu-arrive #page{animation:suduArrive ' + ARRIVE_MS + 'ms ' + EASE + ' forwards;}' +
    '@keyframes suduArrive{from{opacity:0;}to{opacity:1;}}' +
    '@media (prefers-reduced-motion: reduce){html.sudu-arrive #page{animation:none;}}';
  document.head.appendChild(css);

  // ---------------------------------------------------------------- helpers

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

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

  // The theme marker classifies which incoming elements carry the cream ground.
  // It has to run before anything is shown, or html.dm's inversion lands on
  // sections that were never marked.
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
    if (window.suduReveal && typeof window.suduReveal.refresh === 'function') {
      try { window.suduReveal.refresh(); } catch (e) {}
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
  // never waited for.
  function criticalImages() {
    var host = field();
    if (!host) return [];
    var all = host.querySelectorAll('img');
    var vh = window.innerHeight || 1;
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var im = all[i];
      // Two images are never waited for. The homepage drawing is authored at
      // opacity 0 and runs its own reveal. The Studio portrait is secondary
      // imagery that happens to fall in the first viewport: holding the whole
      // Studio composition until a 2048px drawing decodes is exactly the dead
      // pause this rhythm is meant to remove. It fades in on its own once it
      // is ready, inside a page that is already there.
      if (im.id === 'heroImg' || im.id === 'studioTeamIllustration') continue;
      if (!im.getAttribute('src')) continue;
      var b = im.getBoundingClientRect();
      if (b.width < 120 || b.height < 90) continue;
      if (b.top >= vh || b.bottom <= 0) continue;
      out.push(im);
    }
    return out;
  }

  function decodeCritical() {
    var imgs = criticalImages();
    if (!imgs.length) return Promise.resolve();
    var jobs = [];
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      // Every critical image is decoded, including one that already reports
      // complete. complete only says the bytes arrived; it does not say the
      // pixels are ready at the size this page draws it.
      if (im.getAttribute('loading') === 'lazy') {
        im.setAttribute('loading', 'eager');
        im.setAttribute('fetchpriority', 'high');
      }
      try { jobs.push(im.decode()); } catch (e) {}
    }
    if (!jobs.length) return Promise.resolve();
    return within(IMAGE_HOLD, Promise.allSettled(jobs));
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

  var pending = null;
  var exitAt = 0;

  // Everything that has to be true before the incoming page may be shown. It
  // runs while that page is held at opacity 0, over the permanent field.
  function gate(rendered) {
    return rendered
      .then(function () { markTheme(); prepareReveals(); })
      .then(afterFrame)
      .then(decodeCritical);
  }

  // The immediate half. This fires before Turbo issues its request, so the
  // outgoing content is already fading while the fetch, the render and the
  // assembly all happen. Nothing here waits for anything.
  function beginExit() {
    if (root.getAttribute('data-nav') === 'out') return;
    exitAt = now();
    window.__suduNavPhase = 'exiting';
    window.__suduVisited = true;
    root.setAttribute('data-nav', 'out');
  }

  document.addEventListener('turbo:before-visit', beginExit);

  // The new body is in place. The page is complete as served, so this is the
  // whole of "rendered".
  document.addEventListener('turbo:render', function () {
    if (pending) pending.resolve();
  });

  document.addEventListener('turbo:before-render', function (event) {
    var resume = event.detail && event.detail.resume;
    if (typeof resume !== 'function') return;

    beginExit();
    event.preventDefault();
    window.__suduNavPhase = 'gating';

    pending = deferred();
    var rendered = pending.promise;

    var left = REDUCED.matches ? 0 : Math.max(0, OUT_MS - (now() - exitAt));
    setTimeout(function () {
      root.setAttribute('data-nav', 'in');
      resume();
      within(GATE_CAP, gate(rendered)).then(reveal);
    }, left);
  });

  // The incoming page is ready. Fade it in from where it already is — zero —
  // rather than setting zero again.
  function reveal() {
    var host = field();
    if (!host || REDUCED.matches) { navigationReady(); return; }
    host.style.transition = 'none';
    host.style.opacity = '0';
    void host.offsetWidth;
    requestAnimationFrame(function () {
      host.style.transition = 'opacity ' + IN_MS + 'ms ' + EASE;
      host.style.opacity = '1';
      navigationReady();
      setTimeout(function () {
        host.style.transition = '';
        host.style.opacity = '';
      }, IN_MS + 120);
    });
  }

  document.addEventListener('turbo:load', function () {
    setTimeout(function () { if (root.hasAttribute('data-nav')) navigationReady(); }, 1500);
  });

  // ------------------------------------------------------- first arrival
  //
  // Only a genuine direct load, and only once. Every later view is a Turbo
  // navigation, which has its own rhythm above. Opacity only: nothing moves,
  // nothing scales, and there is no splash — the ground, the chrome bar and
  // the controls are all outside #page and are painted before this starts.
  (function () {
    if (REDUCED.matches) return;
    // The class goes on the moment this runs. Any wait before it meant the
    // page painted at full opacity for a frame before the class landed — the
    // page appearing, dropping out, and fading back in.
    root.classList.add('sudu-arrive');
    var done = function () { root.classList.remove('sudu-arrive'); };
    // Detached the moment the arrival finishes, so nothing carries into a
    // navigation, and on a cap regardless in case it never started.
    document.addEventListener('animationend', function (e) {
      if (e.animationName === 'suduArrive') done();
    }, true);
    document.addEventListener('turbo:before-visit', done);
    setTimeout(done, ARRIVE_MS + 4000);
  })();

  // ------------------------------------------------------------- preload

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
    document.addEventListener('turbo:before-render', strip);
    document.addEventListener('turbo:render', strip);
    document.addEventListener('sudu:navigation-ready', strip);
  })();

  // ------------------------------------------------------- cache hygiene

  document.addEventListener('turbo:before-cache', function () {
    root.removeAttribute('data-nav');

    var host = field();
    if (host) { host.style.transition = ''; host.style.opacity = ''; }

    var touched = document.querySelectorAll('[data-arrived]');
    for (var i = 0; i < touched.length; i++) {
      var el = touched[i];
      el.style.transition = '';
      el.style.opacity = '';
      el.style.transform = '';
    }

    if (typeof window.__suduWorkSettle === 'function') {
      try { window.__suduWorkSettle(); } catch (e) {}
    }
  });
})();
