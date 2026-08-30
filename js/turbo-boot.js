// Turbo Drive integration for sudu.studio.
// Turbo swaps page content in place instead of doing full reloads, so the
// background music keeps playing seamlessly between screens and navigation
// feels instant. The DC runtime (js/support.js) boots once per full page
// load, so after every Turbo visit we re-execute it against the freshly
// swapped <x-dc> template. If Turbo fails to load, links simply fall back to
// normal navigation.
(function () {
  if (window.__suduTurboWired) return;
  window.__suduTurboWired = true;

  var css = document.createElement('style');
  css.textContent = '.turbo-progress-bar{height:2px;background:#E17B3E;}';
  document.head.appendChild(css);

  var firstLoad = true;
  document.addEventListener('turbo:load', function () {
    if (firstLoad) { firstLoad = false; return; }
    // Re-boot the DC runtime against the new page's template. The path has to
    // be root-absolute: a script src resolves against the *document* URL, which
    // after a visit to /work/<slug>/ would make 'js/support.js' mean
    // /work/<slug>/js/support.js and 404, leaving the swapped page blank.
    var s = document.createElement('script');
    s.src = '/js/support.js';
    document.body.appendChild(s);
  });
})();
