// Homepage first-scroll guard.
//
// The main reveal engine deliberately blocks its scroll work while the hero
// intro is settling. If a visitor scrolls during that first 2.7s window, the
// Architecture / Interiors / Design statement can stay fully opaque until the
// intro has completed once. This tiny owner mirrors the existing approved
// opacity formula for that one element only, so first interaction and later
// interactions behave identically. No transform, layout or timing is changed.
(function () {
  if (window.__suduHeroStatementScrollFix) return;
  window.__suduHeroStatementScrollFix = true;

  var q = false;
  function draw() {
    q = false;
    var stmt = document.getElementById('heroStatement');
    if (!stmt) return;
    var vh = window.innerHeight || 1;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (y >= vh) return;
    stmt.style.opacity = String(1 - Math.min(y / (vh * 0.45), 1));
  }
  function queue() {
    if (q) return;
    q = true;
    requestAnimationFrame(draw);
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  document.addEventListener('turbo:load', queue);
  queue();
})();
