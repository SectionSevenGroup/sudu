// The persistent chrome bar: a fixed strip across the bottom of the viewport
// holding the language pill, the music pill, and the background-colour pill.
//
// It is appended to <html> rather than <body> for two reasons. Turbo replaces
// the body on every visit, which would orphan the bar and everything mounted
// in it; and dark mode applies `filter: invert(1) hue-rotate(180deg)` to
// header/section/footer, which would both invert the bar and — because a
// filtered ancestor becomes the containing block for fixed descendants —
// break its positioning. Outside the body it is immune to both.
//
// The three pills are built by three different scripts (i18n.js, the inline
// theme picker, audio-player.js). Each one calls suduBar() to get its mount
// point, so this file owns the bar's existence and layout and none of them
// needs to know about the others.
(function () {
  if (window.suduBar) return;

  var CSS = [
    // The bar. Translucent rather than solid, with the backdrop blur the
    // header uses, at roughly half the header's height.
    '#suduBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;height:52px;',
    'display:flex;align-items:center;justify-content:space-between;',
    'gap:12px;padding:0 clamp(20px,4.5vw,64px);',
    'font-family:\'Urbanist\',sans-serif;',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    'background:color-mix(in srgb,#F3F1EA 72%,transparent);',
    'border-top:1px solid rgba(23,22,19,0.13);',
    'color:#171613;transition:background .45s ease,border-color .45s ease,color .45s ease;}',
    // Dark grounds (Charcoal and Burnt both set html.dm plus --dm-bg), so one
    // rule covers the two of them and any future colour.
    'html.dm #suduBar{background:color-mix(in srgb,var(--dm-bg,#C0431F) 72%,transparent);',
    'border-top-color:rgba(255,255,255,0.22);color:#F5F3EC;}',
    // Never let the dark-mode inversion reach the bar or anything inside it.
    'html.dm #suduBar,html.dm #suduBar *{filter:none !important;}',
    // The pills are outlines now; the blur and ground belong to the bar.
    '#suduBar #langSwitch,#suduBar #dmSwatches,#suduBar #musicPill{position:static !important;',
    'background:transparent !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important;',
    'border:0.5px solid currentColor !important;border-radius:22px;color:inherit !important;',
    'display:flex;align-items:center;flex:0 0 auto;}',
    // The three pills are appended by three independent scripts in whatever
    // order those happen to run, so the left-to-right order is stated here
    // rather than left to chance.
    // Each pill is pinned to its own side rather than relying on
    // space-between, which would bunch the survivors together if one of the
    // three failed to mount — the failure mode that put the colour pill on
    // top of the language pill when a stale cached i18n.js kept positioning
    // itself in the corner instead of mounting here.
    '#suduBar #langSwitch{order:1;gap:11px;padding:6px 12px;margin-right:auto;}',
    '#suduBar #dmSwatches{order:3;gap:9px;padding:6px 9px;margin-left:auto;}',
    '#suduBar #musicPill{order:2;gap:9px;padding:5px 9px 5px 11px;}',
    // Centre the music pill on the viewport, not on whatever space the other
    // two leave, so it does not shift when a language or swatch drops out.
    '#suduBar #musicPill{position:absolute !important;left:50%;transform:translateX(-50%);}',
    // Below 560px there is not room for three pills in a row; the music pill
    // returns to the flow and the bar lets them share the width evenly.
    '@media (max-width:559px){#suduBar{gap:8px;padding:0 16px;}',
    '#suduBar #musicPill{position:static !important;transform:none;}',
    '#suduBar #langSwitch{gap:8px;padding:6px 9px;}}',
    '#suduBar button{font-family:inherit;color:inherit;cursor:none;}'
  ].join('');

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
  ensure();
})();
