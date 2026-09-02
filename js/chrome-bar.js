// The persistent chrome bar: a fixed strip across the bottom of the viewport
// holding the language pill, the music pill, and the background-colour pill.
//
// Runtime recovery epoch: this comment intentionally changes the content hash
// after PR #33. A tab that executed that broken singleton must not be allowed to
// reuse it under an older asset URL; stamp-assets.mjs gives this file a new
// content-derived ?v= and marks it as Turbo reload-tracked.
//
// It is appended to <html> rather than <body>: Turbo replaces the body on
// every visit, which would orphan the bar and everything mounted in it. Its
// ground and ink are the page's tokens (css/tokens.css), so the class on
// <html> that selects the ground recolours the bar with everything else.
(function () {
  if (window.suduBar) return;

  var CSS = [
    '#suduBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;box-sizing:content-box;height:52px;',
    'display:flex;align-items:center;justify-content:space-between;',
    'gap:12px;padding:0 max(clamp(20px,4.5vw,64px),calc((100% - var(--sudu-rail,1760px)) / 2)) env(safe-area-inset-bottom,0px);',
    'font-family:\'Urbanist\',sans-serif;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    'background:color-mix(in srgb,var(--ground,var(--paper,#F3F1EA)) 72%,transparent);color:var(--ink,#171613);transition:background .45s ease,color .45s ease;}',
    'html.dm #suduBar{color:var(--chrome-ink,#F5F3EC);}',

    '#suduBar #langSwitch,#suduBar #dmSwatches,#suduBar #musicPill{position:static !important;',
    'background:transparent !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important;',
    'border:0 !important;border-radius:0 !important;padding:0 !important;',
    'color:inherit !important;display:flex;align-items:center;flex:0 0 auto;gap:15px;}',
    '#suduBar #langSwitch{order:1;margin-right:auto;}',
    '#suduBar #musicPill{order:2;position:absolute !important;left:50%;transform:translateX(-50%);}',
    '#suduBar #dmSwatches{order:3;margin-left:auto;}',
    '#suduBar #langSwitch button,#suduBar #dmSwatches button,#suduBar #musicPill button{position:relative;}',
    '#suduBar #langSwitch button:not([hidden])~button:not([hidden])::before,',
    '#suduBar #dmSwatches button:not([hidden])~button:not([hidden])::before,',
    '#suduBar #musicPill button:not([hidden])~button:not([hidden])::before{',
    'content:"";position:absolute;left:-8px;top:50%;transform:translateY(-50%);',
    'width:1px;height:11px;background:currentColor;opacity:0.32;pointer-events:none;}',
    '@media (max-width:559px){#suduBar{gap:10px;padding:0 16px env(safe-area-inset-bottom,0px);}',
    '#suduBar #musicPill{position:static !important;transform:none;}',
    '#suduBar #langSwitch,#suduBar #dmSwatches,#suduBar #musicPill{gap:13px;}}',
    '#suduBar button{font-family:inherit;color:inherit;cursor:none;background:none;border:0;padding:0;}',
  ].join('');

  // The theme picker lives inside page templates and therefore does not always
  // re-run after Turbo swaps. Keep the persistent <html> theme state canonical
  // here so Burnt can never lose dmwarm/dmred and fall into Charcoal styling.
  function syncThemeState() {
    var v = '#F3F1EA';
    try { v = localStorage.getItem('sudu-dm-bg') || v; } catch (e) {}
    if (v === '#D0271F') v = '#C0431F';
    var h = document.documentElement;
    if (v === '#F3F1EA') {
      h.classList.remove('dm','dmwarm','dmred');
      h.style.removeProperty('--dm-bg');
    } else if (v === '#C0431F') {
      h.classList.add('dm','dmwarm','dmred');
      h.style.setProperty('--dm-bg','#C0431F');
    } else {
      h.classList.add('dm');
      h.classList.remove('dmwarm','dmred');
      h.style.setProperty('--dm-bg','#121110');
    }
  }

  function ensure() {
    var bar = document.getElementById('suduBar');
    if (bar) return bar;
    var st = document.getElementById('suduBarCss');
    if (!st) {
      st = document.createElement('style');
      st.id = 'suduBarCss';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    bar = document.createElement('div');
    bar.id = 'suduBar';
    document.documentElement.appendChild(bar);
    return bar;
  }

  window.suduBar = ensure;
  syncThemeState();
  ensure();

  document.addEventListener('turbo:render', function () {
    syncThemeState();
    ensure();
  });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#dmSwatches button');
    if (b) setTimeout(syncThemeState, 0);
  });
})();
