// The founders portrait's arrival, for the Studio page.
//
// The single owner of #studioTeamIllustration's reveal. Keyed on the id, not
// on a tag shape, so nothing about the markup can quietly detach it. A fresh
// element gets the reveal on every arrival and the same one is never revealed
// twice. Decode success, decode failure, a cached image, an uncached image
// and a missing file all end the same way: visible.
//
// One singleton, reachable as window.suduStudio. On a direct load it binds as
// soon as it runs; on a Turbo visit it waits for the coordinator's
// sudu:navigation-ready, as it always did, so the portrait fades in inside a
// page that is already there rather than during the gate. What a visit adds —
// the image's listeners and the fallback timer — is torn down on
// turbo:before-render. This used to be inline in the page and added a window
// load listener on every arrival, none of which was ever removed.
(function () {
  if (window.suduStudio) { window.suduStudio.bind(); return; }

  var live = null;

  function bind() {
    var im = document.getElementById('studioTeamIllustration');
    if (!im) return;                                   // not the studio page
    if (live && live.im === im) return;                // this portrait is owned
    unbind();
    var v = live = { im: im, timer: 0, off: null };
    var show = function () { im.classList.add('portrait-in'); };
    var ready = function () {
      if (typeof im.decode === 'function') im.decode().then(show, show); else show();
    };
    if (im.complete && im.naturalWidth) ready();
    else {
      im.addEventListener('load', ready, { once: true });
      im.addEventListener('error', show, { once: true });
      v.off = function () {
        im.removeEventListener('load', ready);
        im.removeEventListener('error', show);
      };
    }
    // Nothing above may be the only path to visible.
    v.timer = setTimeout(show, 3000);
  }

  function unbind() {
    if (!live) return;
    var v = live;
    live = null;
    clearTimeout(v.timer);
    if (v.off) v.off();
  }

  window.suduStudio = { bind: bind, unbind: unbind };
  document.addEventListener('turbo:before-render', unbind);
  document.addEventListener('turbo:render', function () {
    if (window.__suduNavPhase !== 'gating') bind();
  });
  document.addEventListener('sudu:navigation-ready', bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
