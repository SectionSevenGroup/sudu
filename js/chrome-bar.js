// The persistent chrome bar: a fixed strip across the bottom of the viewport
// holding the language pill, the music pill, and the background-colour pill.
//
// Runtime recovery epoch: this comment intentionally changes the content hash
// after PR #33. A tab that executed that broken singleton must not be allowed to
// reuse it under an older asset URL; stamp-assets.mjs gives this file a new
// content-derived ?v= and marks it as Turbo reload-tracked.
//
// It is appended to <html> rather than <body> for two reasons. Turbo replaces
// the body on every visit, which would orphan the bar and everything mounted
// in it; and dark mode applies `filter: invert(1) hue-rotate(180deg)` to
// header/section/footer, which would both invert the bar and — because a
// filtered ancestor becomes the containing block for fixed descendants —
// break its positioning. Outside the body it is immune to both.
(function () {
  if (window.suduBar) return;

  var CSS = [
    '#suduBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;box-sizing:content-box;height:52px;',
    'display:flex;align-items:center;justify-content:space-between;',
    'gap:12px;padding:0 max(clamp(20px,4.5vw,64px),calc((100% - var(--sudu-rail,1760px)) / 2)) env(safe-area-inset-bottom,0px);',
    'font-family:\'Urbanist\',sans-serif;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    'background:color-mix(in srgb,#F3F1EA 72%,transparent);color:#171613;transition:background .45s ease,color .45s ease;}',
    'html.dm #suduBar{background:color-mix(in srgb,var(--dm-bg,#C0431F) 72%,transparent);color:#F5F3EC;}',
    'html.dm #suduBar,html.dm #suduBar *{filter:none !important;}',

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

    // Charcoal keeps the existing inversion architecture, but the original
    // source greys invert to values that are too dark against #121110. These
    // overrides change only the pre-filter source values, so the visible result
    // is a clearer secondary/tertiary hierarchy without touching Off-white or
    // Burnt. Primary ink remains exactly as authored.
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="color:#67655D"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="color: #67655D"]{color:#55534D !important;}',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="color:#A6A399"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="color: #A6A399"]{color:#747168 !important;}',

    // Structural hairlines need more source alpha on Charcoal because the
    // section filter is applied after compositing. Major section/card/FAQ rules
    // are raised modestly; form fields and outlined controls remain stronger.
    'html.dm:not(.dmwarm):not(.dmred) body section[style*="border-"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="border-top"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="border-bottom"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="border-left"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="border-right"]{border-color:rgba(23,22,19,.30) !important;}',
    'html.dm:not(.dmwarm):not(.dmred) body section input,',
    'html.dm:not(.dmwarm):not(.dmred) body section textarea,',
    'html.dm:not(.dmwarm):not(.dmred) body section button[style*="border:1px"]{border-color:rgba(23,22,19,.48) !important;}',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="background:rgba(23,22,19,0.22)"],',
    'html.dm:not(.dmwarm):not(.dmred) body section [style*="background: rgba(23,22,19,0.22)"]{background:rgba(23,22,19,.38) !important;}'
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
      h.classList.remove('dm','dmwarm','dmred','dmlight');
      h.style.removeProperty('--dm-bg');
    } else if (v === '#C0431F') {
      h.classList.add('dm','dmwarm','dmred');
      h.classList.remove('dmlight');
      h.style.setProperty('--dm-bg','#C0431F');
    } else {
      h.classList.add('dm');
      h.classList.remove('dmwarm','dmred','dmlight');
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
