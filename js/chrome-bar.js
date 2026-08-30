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
    // The bar: a blurred ground and nothing else. No rule along the top, and
    // no outline around the groups inside it — the separators do that work.
    '#suduBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;height:52px;',
    'display:flex;align-items:center;justify-content:space-between;',
    'gap:12px;padding:0 clamp(20px,4.5vw,64px);',
    'font-family:\'Urbanist\',sans-serif;',
    '-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);',
    'background:color-mix(in srgb,#F3F1EA 72%,transparent);',
    'color:#171613;transition:background .45s ease,color .45s ease;}',
    // Charcoal and Burnt both set html.dm plus --dm-bg, so one rule covers the
    // two of them and any ground added later.
    'html.dm #suduBar{background:color-mix(in srgb,var(--dm-bg,#C0431F) 72%,transparent);color:#F5F3EC;}',
    // Never let the dark-mode inversion reach the bar or anything inside it.
    'html.dm #suduBar,html.dm #suduBar *{filter:none !important;}',
    // The three groups are bare rows now. Each is pinned to its own side
    // rather than relying on space-between, which would bunch the survivors
    // together if one of the three ever failed to mount.
    '#suduBar #langSwitch,#suduBar #dmSwatches,#suduBar #musicPill{position:static !important;',
    'background:transparent !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important;',
    'border:0 !important;border-radius:0 !important;padding:0 !important;',
    'color:inherit !important;display:flex;align-items:center;flex:0 0 auto;gap:15px;}',
    '#suduBar #langSwitch{order:1;margin-right:auto;}',
    '#suduBar #musicPill{order:2;position:absolute !important;left:50%;transform:translateX(-50%);}',
    '#suduBar #dmSwatches{order:3;margin-left:auto;}',
    // One hairline between neighbours, drawn in the gap and out of the hit
    // area so it never widens a target. The sibling combinator counts only
    // visible neighbours, so the colour group — which hides whichever swatch
    // is currently active — never leads with a stray divider.
    '#suduBar #langSwitch button,#suduBar #dmSwatches button,#suduBar #musicPill button{position:relative;}',
    '#suduBar #langSwitch button:not([hidden])~button:not([hidden])::before,',
    '#suduBar #dmSwatches button:not([hidden])~button:not([hidden])::before,',
    '#suduBar #musicPill button:not([hidden])~button:not([hidden])::before{',
    'content:"";position:absolute;left:-8px;top:50%;transform:translateY(-50%);',
    'width:1px;height:11px;background:currentColor;opacity:0.32;pointer-events:none;}',
    // Below 560px the music group rejoins the flow so the three share the width.
    '@media (max-width:559px){#suduBar{gap:10px;padding:0 16px;}',
    '#suduBar #musicPill{position:static !important;transform:none;}',
    '#suduBar #langSwitch,#suduBar #dmSwatches,#suduBar #musicPill{gap:13px;}}',
    '#suduBar button{font-family:inherit;color:inherit;cursor:none;background:none;border:0;padding:0;}'
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
