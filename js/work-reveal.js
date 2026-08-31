// Ordered reveal for the Work grid.
//
// Lives in its own file rather than inline in the page template: the DC
// runtime re-creates helmet <script> elements when it renders, and this
// script does not survive that round trip intact.

(function () {
  if (window.__suduWorkArrive) return;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var DUR = 850, STAGGER = 90, HOLD = 250, ROW_TOL = 12;

  function cards() {
    // Scoped to the rendered root, and never to a source the runtime has not
    // resolved yet: during a Turbo swap the raw <x-dc> template is briefly in
    // the document, and touching one of its unresolved images makes the browser
    // fetch the placeholder string literally.
    //
    // The braces are built rather than written: this script lives inside the
    // template, so a literal pair here would itself be read as an interpolation.
    var OPEN = '{' + '{';
    var root = document.getElementById('dc-root');
    if (!root) return [];
    var all = root.querySelectorAll('section[data-screen-label="Work Index"] a[href]');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var img = all[i].querySelector('img');
      if (!img) continue;
      if ((img.getAttribute('src') || '').indexOf(OPEN) !== -1) continue;
      out.push(all[i]);
    }
    return out;
  }

  // Rows are read off the rendered layout rather than assumed, so the same
  // code serves five columns at 2560, whatever 1440 resolves to, two on a
  // tablet and one on a phone. Group by top edge within a tolerance, order
  // the groups top to bottom and each group left to right.
  function rows(list) {
    var byTop = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      var top = Math.round(r.top + window.scrollY), left = Math.round(r.left);
      var row = null;
      for (var j = 0; j < byTop.length; j++) {
        if (Math.abs(byTop[j].top - top) <= ROW_TOL) { row = byTop[j]; break; }
      }
      if (!row) { row = { top: top, items: [] }; byTop.push(row); }
      row.items.push({ el: list[i], left: left });
    }
    byTop.sort(function (a, b) { return a.top - b.top; });
    for (var k = 0; k < byTop.length; k++) {
      byTop[k].items.sort(function (a, b) { return a.left - b.left; });
    }
    return byTop;
  }

  function decoded(card) {
    var img = card.querySelector('img');
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  // A card always reveals in its turn. If its image has not arrived, the card
  // still goes — only the image waits, and fades in when it lands. Readiness
  // never reorders anything.
  function show(card, delay) {
    if (card.getAttribute('data-shown')) return;
    card.setAttribute('data-shown', '1');
    var img = card.querySelector('img');
    if (img && !decoded(card) && !REDUCED.matches) {
      img.classList.add('wk-late');
      var lit = function () { img.classList.add('wk-on'); };
      img.addEventListener('load', lit, { once: true });
      img.addEventListener('error', lit, { once: true });
    }
    setTimeout(function () { card.classList.add('wk-on'); }, delay);
  }

  function showRow(row, base) {
    for (var i = 0; i < row.items.length; i++) show(row.items[i].el, base + i * STAGGER);
  }

  var observer = null;
  function run() {
    var list = cards();
    if (!list.length) return false;

    // Keep the promotion the loading fix put in place: the first two visible
    // rows are fetched with the document, everything below the fold stays lazy.
    for (var j = 0; j < list.length && j < 5; j++) {
      if (list[j].querySelector('img').getAttribute('loading') !== 'eager') {
        list[j].querySelector('img').setAttribute('loading', 'eager');
        list[j].querySelector('img').setAttribute('fetchpriority', 'high');
      }
    }

    if (REDUCED.matches) {
      for (var r = 0; r < list.length; r++) list[r].setAttribute('data-shown', '1');
      return true;
    }

    for (var h = 0; h < list.length; h++) {
      if (!list[h].getAttribute('data-shown')) list[h].classList.add('wk-card');
    }

    var grouped = rows(list);
    var vh = window.innerHeight;
    var first = [], later = [];
    for (var g = 0; g < grouped.length; g++) {
      (grouped[g].top - window.scrollY < vh ? first : later).push(grouped[g]);
    }

    // A short bounded wait lets the promoted images land so the opening row is
    // not a set of empty boxes — but a slow image never holds the sequence.
    var started = false;
    var begin = function () {
      if (started) return; started = true;
      var base = 0;
      for (var f = 0; f < first.length; f++) {
        showRow(first[f], base);
        base += first[f].items.length * STAGGER;
      }
    };
    var ready = function () {
      for (var q = 0; q < first.length; q++) {
        for (var w = 0; w < first[q].items.length; w++) if (!decoded(first[q].items[w].el)) return false;
      }
      return true;
    };
    var t0 = Date.now();
    (function poll() {
      if (ready() || Date.now() - t0 >= HOLD) { begin(); return; }
      requestAnimationFrame(poll);
    })();

    // Later rows wait for the scroller. Revealed once per visit: the observer
    // stops watching a row as soon as it has gone.
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e++) {
        if (!entries[e].isIntersecting) continue;
        var el = entries[e].target;
        observer.unobserve(el);
        for (var n = 0; n < later.length; n++) {
          if (later[n].items[0].el === el) { showRow(later[n], 0); break; }
        }
      }
    }, { rootMargin: '0px 0px -12% 0px' });
    for (var m = 0; m < later.length; m++) observer.observe(later[m].items[0].el);
    return true;
  }

  // The grid is rendered by the runtime, so the first pass may run before it
  // exists; retry for a few frames rather than assuming.
  var pump = function (tries) {
    if (run() || tries > 20) return;
    requestAnimationFrame(function () { pump(tries + 1); });
  };
  window.__suduWorkArrive = function () { pump(0); };
  pump(0);
  document.addEventListener('turbo:load', function () { pump(0); });
})();
