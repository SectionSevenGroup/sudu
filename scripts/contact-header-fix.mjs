#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const contactPath = new URL('../contact.html', import.meta.url);
let html = readFileSync(contactPath, 'utf8');

// Contact is the only page where the active navigation item retained a visible
// underline on the off-white ground. Match the current active Contact link and
// make only its bottom border transparent; no other header behaviour changes.
html = html.replace(
  /(<a href="\/contact"[^>]*style="[^"]*?)border-bottom:1px solid #171613;([^"]*"[^>]*>Contact<\/a>)/,
  '$1border-bottom:1px solid transparent;$2'
);

// One arrow language across the site: the exact Urbanist single-chevron glyph
// already used by the homepage's ›› controls (U+203A / &#8250;). First author
// it directly into the template where possible.
html = html.replace(
  /<span style="flex:none; font-weight:600; color:#E17B3E; transition:transform \.3s ease; transform:\{\{ faq\.rot \}\};">&#8250;<\/span>/g,
  '<span data-sudu-chevron="faq" aria-hidden="true" style="font-family:\'Urbanist\', sans-serif; font-size:20px; font-weight:700; letter-spacing:-0.12em; line-height:1; color:inherit; display:inline-flex; align-items:center; justify-content:center; width:1.2em; height:1.2em; flex:none; transform:{{ faq.rot }}; transition:transform .3s ease;">&#8250;</span>'
);
html = html.replace(
  /<span style="font-weight:700; color:#E17B3E;">\{\{ sendGlyph \}\}<\/span>/g,
  '<span data-sudu-chevron="send" style="font-family:\'Urbanist\', sans-serif; font-size:18px; font-weight:700; letter-spacing:-0.12em; line-height:1; color:inherit; display:inline-flex; align-items:center; justify-content:center; width:1.2em; height:1.2em;">{{ sendGlyph }}</span>'
);

// The DC runtime can re-render Contact after the source template has been
// processed. Enforce the same glyph/style on the rendered controls as a second,
// deterministic layer so a re-render or Turbo visit cannot restore the older
// orange/light arrow treatment. This does not invent a new icon: it writes the
// same Urbanist U+203A glyph the homepage already uses.
if (!html.includes('id="contactChevronStandard"')) {
  const chevrons = `
<script id="contactChevronStandard">
(function(){
  var glyph='\u203A';
  function style(el,size){
    if(!el)return;
    el.style.fontFamily="'Urbanist', sans-serif";
    el.style.fontSize=size;
    el.style.fontWeight='700';
    el.style.letterSpacing='-0.12em';
    el.style.lineHeight='1';
    el.style.color='inherit';
    el.style.display='inline-flex';
    el.style.alignItems='center';
    el.style.justifyContent='center';
    el.style.width='1.2em';
    el.style.height='1.2em';
    el.style.flex='none';
  }
  function apply(){
    document.querySelectorAll('section[data-screen-label="FAQ"] button[aria-expanded] > span:last-child').forEach(function(el){
      if(el.textContent!==glyph)el.textContent=glyph;
      style(el,'20px');
    });
    var send=document.querySelector('form[name="contact"] button[type="submit"] > span:last-child');
    if(send){
      var t=(send.textContent||'').trim();
      if(t && t!=='✓' && t!==glyph)send.textContent=glyph;
      style(send,'18px');
    }
  }
  var queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;apply();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue);else queue();
  document.addEventListener('turbo:load',queue);
  document.addEventListener('turbo:render',queue);
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;
  html = html.replace('</helmet>', chevrons + '\n</helmet>');
}

// Charcoal needs more optical contrast than Off-white/Burnt. The current dark
// theme is produced by filtering each section, so the original warm greys and
// low-alpha rules become too dim after inversion. These overrides change only
// the Contact page on the Charcoal ground, preserving the existing Off-white
// and Burnt values exactly.
if (!html.includes('id="contactCharcoalContrast"')) {
  const charcoal = `
<style id="contactCharcoalContrast">
  html.dm:not(.dmwarm):not(.dmred) section [style*="color:#67655D"] { color:#4B4941 !important; }
  html.dm:not(.dmwarm):not(.dmred) section [style*="color:#A6A399"] { color:#74726B !important; }
  html.dm:not(.dmwarm):not(.dmred) section [style*="rgba(23,22,19,0.13)"] { border-color:rgba(23,22,19,.24) !important; }
  html.dm:not(.dmwarm):not(.dmred) section [style*="rgba(23,22,19,0.22)"] { border-color:rgba(23,22,19,.36) !important; }
  html.dm:not(.dmwarm):not(.dmred) section [style*="rgba(23,22,19,0.32)"] { border-color:rgba(23,22,19,.44) !important; }
  html.dm:not(.dmwarm):not(.dmred) section input,
  html.dm:not(.dmwarm):not(.dmred) section textarea { caret-color:#F5F3EC; }
</style>`;
  html = html.replace('</helmet>', charcoal + '\n</helmet>');
}

writeFileSync(contactPath, html);

// Work: the project total adds no useful information and becomes visual noise.
// Remove the rendered count node entirely, which removes it in every language
// and on every ground while leaving the project data and list untouched.
const workPath = new URL('../work.html', import.meta.url);
let work = readFileSync(workPath, 'utf8');
work = work.replace(
  /\s*<span style="font-family:'Urbanist', sans-serif; font-size:11px; font-weight:500; letter-spacing:0\.08em; color:#A6A399;">\{\{ countLabel \}\}<\/span>/,
  ''
);
writeFileSync(workPath, work);
