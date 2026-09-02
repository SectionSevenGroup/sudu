// The one scroll-reveal engine, replacing the copies each page's Component
// used to carry. It reveals [data-reveal] elements as they enter the
// viewport, in the motion vocabulary the pages already speak:
//   major   full-width imagery: opacity only, nothing moves
//   pair    adjacent members of one row, staggered left to right
//   detail  ordinary editorial content and grouped galleries
//   (none)  the quiet default
// data-reveal-clip is the project page's variant: the element is unmasked
// from the top instead of rising.
(function () {
  if (window.suduReveal) { window.suduReveal.refresh(); return; }

  var EASE = 'cubic-bezier(.16,1,.3,1)';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var MOTION = {
    major:  { rise: 0, op: 1.15, tr: 1.15 },
    pair:   { rise: 6, op: 0.95, tr: 1.05 },
    detail: { rise: 7, op: 1.0,  tr: 1.1 },
    '':     { rise: 8, op: 1.0,  tr: 1.1 }
  };

  function show(el) {
    el.style.opacity = '1';
    if (el.hasAttribute('data-reveal-clip')) el.style.clipPath = 'inset(0 0 0 0)';
    else el.style.transform = 'none';
  }

  // Elements that have left a swapped-out body are unobserved by collection,
  // so one observer serves every page of a visit.
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      show(entries[i].target);
      io.unobserve(entries[i].target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  function prepare(el, vh) {
    // Already in view at prep time: shown outright, never hidden first.
    if (el.getBoundingClientRect().top < vh * 0.92) { el.style.opacity = '1'; return; }
    if (el.hasAttribute('data-reveal-clip')) {
      el.style.opacity = '0';
      el.style.clipPath = 'inset(0 0 92% 0)';
      el.style.transition = 'opacity 1.2s ' + EASE + ', clip-path 1.5s ' + EASE;
      io.observe(el);
      return;
    }
    var kind = el.getAttribute('data-motion') || '';
    var m = MOTION[kind] || MOTION[''];
    // A pair takes its stagger from its own order within its row, so the
    // sequence reads left to right without anything being hard-coded.
    var delay = 0;
    if (kind === 'pair' && el.parentElement) {
      var sibs = Array.prototype.slice.call(el.parentElement.querySelectorAll('[data-motion="pair"]'))
        .sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
      delay = Math.max(0, sibs.indexOf(el)) * 0.1;
    }
    el.style.opacity = '0';
    el.style.transform = m.rise ? 'translateY(' + m.rise + 'px)' : 'none';
    el.style.transition = 'opacity ' + m.op + 's ' + EASE + ' ' + delay + 's, transform '
      + m.tr + 's ' + EASE + ' ' + delay + 's';
    io.observe(el);
  }

  function refresh() {
    if (REDUCED.matches) return;
    var vh = window.innerHeight || 1;
    var els = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.__suduReveal) { el.__suduReveal = true; prepare(el, vh); continue; }
      // Swept past by an anchor jump or a fast scroll: the observer may never
      // have fired, so anything still hidden above the viewport is shown.
      if (el.style.opacity === '0' && el.getBoundingClientRect().bottom <= 0) show(el);
    }
  }

  var queued = false;
  window.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; refresh(); });
  }, { passive: true });

  window.suduReveal = { refresh: refresh };

  document.addEventListener('turbo:render', refresh);
  document.addEventListener('sudu:navigation-ready', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
