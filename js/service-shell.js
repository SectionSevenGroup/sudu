// Shared compatibility shell for the four evergreen SEO/service pages.
// These pages predate the current persistent chrome/theme architecture. This
// file gives them the same ground control without changing their authored copy
// or turning them into a second design system.
(function () {
  if (window.__suduServiceShell) return;
  window.__suduServiceShell = true;

  var st = document.createElement('style');
  st.id = 'suduServiceThemeCss';
  st.textContent = [
    'html.dm,html.dm body{background:var(--dm-bg,#C0431F)!important;}',
    'html.dm [data-theme-surface="cream"],html.dm [data-theme-surface="content"]{background:transparent!important;}',
    'html.dm body #page>div{background:var(--dm-bg,#C0431F)!important;}',
    'html.dm section{filter:invert(1) hue-rotate(180deg);}',
    'html.dm section img{filter:invert(1) hue-rotate(180deg)!important;}',
    'html.dm header,html.dm footer{filter:none!important;background:transparent!important;}',
    'html.dm header a,html.dm footer,html.dm footer *{color:#F5F3EC!important;}',
    'html.dm header img,html.dm footer img{filter:invert(1)!important;}',
    'html.dm #suduNav{background:color-mix(in srgb,var(--dm-bg,#C0431F) 90%,transparent)!important;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}',
    '#dmSwatches{display:flex!important;}',
    '#dmSwatches button{box-shadow:none!important;border:0!important;}'
  ].join('');
  (document.head || document.documentElement).appendChild(st);

  var P = 'sudu-dm-bg';
  var opts = [['Charcoal','#121110'],['Off white','#F3F1EA'],['Burnt','#C0431F']];
  var saved = '#F3F1EA';

  function apply(v) {
    saved = v;
    var h = document.documentElement;
    if (v === '#F3F1EA') { h.classList.remove('dm'); h.style.removeProperty('--dm-bg'); }
    else { h.classList.add('dm'); h.style.setProperty('--dm-bg', v); }
    try { localStorage.setItem(P,v); } catch(e) {}
    var sw = document.getElementById('dmSwatches');
    if (sw) Array.prototype.forEach.call(sw.children, function (b) { b.hidden = b.getAttribute('data-v') === v; });
  }
  function build() {
    if (document.getElementById('dmSwatches') || !document.body) return;
    var d = document.createElement('div'); d.id = 'dmSwatches';
    opts.forEach(function (o) {
      var b = document.createElement('button');
      b.title = o[0]; b.setAttribute('data-v',o[1]); b.setAttribute('aria-label','Background: '+o[0]);
      b.style.cssText = 'width:13px;height:13px;border-radius:50%;border:0;padding:0;background:'+o[1];
      b.onclick = function () { apply(o[1]); };
      d.appendChild(b);
    });
    if (window.suduBar) window.suduBar().appendChild(d);
    else document.documentElement.appendChild(d);
  }

  try { saved = localStorage.getItem(P) || saved; } catch(e) {}
  apply(saved === '#D0271F' ? '#C0431F' : saved);
  build();
  document.addEventListener('turbo:render', function () { apply(saved); build(); });
})();
