// First-screen arrival for the inner pages, on a direct load only.
//
// On a first load nothing brings the page in, so everything inside it is simply
// present the moment it renders and the information all lands at once. This
// gives the opening screen a small order: the page's principal statement
// settles first, its supporting information a beat later, and everything below
// is left to the scroll reveals.
//
// It deliberately does not run during a Turbo navigation. There the page-level
// transition already owns the first screen — it holds the outgoing page on
// screen, assembles the incoming one out of sight and cross-fades the finished
// composition in. Fading the same pixels a second time on top of that is the
// double arrival this pass used to cause, so navigation is left alone.
//
// Two groups only. Labels, metadata and fields are never animated individually
// — related information moves together, and the fixed frame (header, nav,
// language, music, colour) never moves at all.
//
// In its own file rather than inline in a page template: the DC runtime
// re-creates helmet scripts when it renders, and a script does not reliably
// survive that round trip.
(function () {
  if (window.__suduArrival) return;

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var DUR = 1000;          // inside the 900–1100ms band
  var PRIMARY = 110;       // after the page's own arrival begins
  var SECONDARY = 230;
  var RISE = 6;            // opacity is the dominant effect

  function firstSection() {
    var root = document.getElementById('dc-root');
    if (!root) return null;
    var secs = root.querySelectorAll('section[data-screen-label]');
    for (var i = 0; i < secs.length; i++) {
      // The homepage hero is not an inner page's opening screen. It runs its
      // own intro, and its drawing is positioned by a transform, so settling
      // this section overwrote translate(-50%,-50%) with translateY(6px) and
      // then cleared it: the drawing ended up half its own width to the right
      // of centre, which read as the whole page being displaced.
      if (secs[i].id === 'hero' || secs[i].querySelector('#heroImg')) continue;
      // the opening screen is the first section that actually carries content
      if (secs[i].textContent.trim().length > 20) return secs[i];
    }
    return null;
  }

  function settle(el, delay) {
    if (!el || el.getAttribute('data-arrived')) return;
    // An element that carries its own inline transform is positioning itself.
    // This pass animates a transform and then clears it, which would destroy
    // that positioning, so it leaves such elements alone.
    if (el.style && el.style.transform) return;
    if (el.querySelector && el.querySelector('#heroImg')) return;
    el.setAttribute('data-arrived', '1');
    if (REDUCED.matches) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(' + RISE + 'px)';
    el.style.transition = 'opacity ' + DUR + 'ms ' + EASE + ' ' + delay + 'ms, transform '
      + DUR + 'ms ' + EASE + ' ' + delay + 'ms';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.opacity = '1';
        el.style.transform = 'none';
        setTimeout(function () {
          el.style.transition = ''; el.style.transform = ''; el.style.opacity = '';
        }, DUR + delay + 120);
      });
    });
  }

  function run() {
    var sec = firstSection();
    if (!sec) return false;
    if (sec.getAttribute('data-arrival')) return true;
    sec.setAttribute('data-arrival', '1');

    // Primary is the page's own identity: its principal heading, together with
    // any eyebrow sitting immediately above it. Secondary is the rest of the
    // opening screen's information, taken as one group so nothing inside it
    // — a chip, a field, a metadata pair — moves on its own.
    var head = sec.querySelector('h1, h2');
    if (!head) return true;
    var primary = head.parentElement === sec ? head : head.parentElement;
    settle(primary, PRIMARY);

    var kids = sec.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] === primary || kids[i].contains(primary)) continue;
      if (kids[i].hasAttribute('data-reveal')) continue;   // the scroll engine owns it
      settle(kids[i], SECONDARY);
    }
    return true;
  }

  var pump = function (tries) {
    if (run() || tries > 20) return;
    requestAnimationFrame(function () { pump(tries + 1); });
  };
  // Exposed for the direct-load path only; the coordinator does not call it
  // during a visit, and there is no turbo:load listener for the same reason.
  window.__suduArrival = function () { pump(0); };
  // This file is loaded by the page it belongs to, so on a navigation it first
  // executes in the middle of the visit. __suduVisited is the difference
  // between "nothing else is bringing this page in" and "the coordinator
  // already is".
  if (!window.__suduVisited) pump(0);
})();
