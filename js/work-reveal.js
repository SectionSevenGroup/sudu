// Ordered reveal for the Work grid.
//
// The card is the only visual reveal owner. Images are allowed to paint once
// their pixels are ready; they do not run a second nested opacity animation.
// This matters most on mobile, where a late image fade multiplied by the card
// fade read as a second load/flicker.
(function () {
  if (window.__suduWorkPrepare) return;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  var STAGGER = 90, ROW_TOL = 12;

  function cards() {
    var OPEN = '{' + '{';
    var root = document.getElementById('page') || document.getElementById('dc-root');
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

  function show(card, delay) {
    if (card.getAttribute('data-shown')) return;
    card.setAttribute('data-shown', '1');
    setTimeout(function () { card.classList.add('wk-on'); }, delay);
  }

  function showRow(row, base) {
    for (var i = 0; i < row.items.length; i++) show(row.items[i].el, base + i * STAGGER);
  }

  var observer = null;
  var staged = null;

  function prepare() {
    var list = cards();
    if (!list.length) return false;

    // Promote only what is actually in/near the opening viewport. The old
    // fixed first-five rule asked a phone to high-priority fetch five cards at
    // once, competing with the one image the visitor could actually see.
    var vh = window.innerHeight || 1;
    var promoted = 0;
    for (var j = 0; j < list.length && promoted < 6; j++) {
      var img = list[j].querySelector('img');
      var box = list[j].getBoundingClientRect();
      if (!img || box.top > vh * 1.25 || box.bottom < -vh * 0.1) continue;
      if (img.getAttribute('loading') !== 'eager') img.setAttribute('loading', 'eager');
      img.setAttribute('fetchpriority', 'high');
      promoted++;
    }

    if (REDUCED.matches) {
      for (var r = 0; r < list.length; r++) list[r].setAttribute('data-shown', '1');
      staged = { first: [], later: [] };
      return true;
    }

    for (var h = 0; h < list.length; h++) {
      if (!list[h].getAttribute('data-shown')) list[h].classList.add('wk-card');
    }

    var grouped = rows(list);
    var first = [], later = [];
    for (var g = 0; g < grouped.length; g++) {
      (grouped[g].top - window.scrollY < vh ? first : later).push(grouped[g]);
    }
    staged = { first: first, later: later };
    return true;
  }

  function start() {
    if (!staged) { if (!prepare()) return false; }
    var first = staged.first, later = staged.later;

    var base = 0;
    for (var f = 0; f < first.length; f++) {
      showRow(first[f], base);
      base += first[f].items.length * STAGGER;
    }

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

  function pump(fn, tries) {
    if (fn() || tries > 20) return;
    requestAnimationFrame(function () { pump(fn, tries + 1); });
  }

  window.__suduWorkPrepare = function () { staged = null; pump(prepare, 0); };

  window.__suduWorkSettle = function () {
    var list = cards();
    for (var i = 0; i < list.length; i++) {
      list[i].setAttribute('data-shown', '1');
      list[i].classList.add('wk-card', 'wk-on');
    }
  };

  if (window.__suduNavPhase !== 'gating') pump(start, 0);
  document.addEventListener('sudu:navigation-ready', function () { pump(start, 0); });
})();
