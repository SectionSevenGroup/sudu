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

// One arrow language across the site: use the exact Urbanist single-chevron
// glyph used by the homepage's ›› controls (U+203A / &#8250;). Contact uses a
// single glyph for each FAQ row. Size can differ; geometry cannot.
html = html.replace(
  /<span style="flex:none; font-weight:600; color:#E17B3E; transition:transform \.3s ease; transform:\{\{ faq\.rot \}\};">&#8250;<\/span>/g,
  '<span aria-hidden="true" style="font-family:\'Urbanist\', sans-serif; font-size:18px; font-weight:700; letter-spacing:-0.12em; line-height:1; color:inherit; display:inline-flex; align-items:center; justify-content:center; width:1.2em; height:1.2em; flex:none; transform:{{ faq.rot }}; transition:transform .3s ease;">&#8250;</span>'
);

// Send inquiry uses that same glyph and typography. The component already
// emits U+203A for its arrow state, so this only aligns its rendering with the
// homepage chevron; the sent-state checkmark remains a checkmark.
html = html.replace(
  /<span style="font-weight:700; color:#E17B3E;">\{\{ sendGlyph \}\}<\/span>/g,
  '<span style="font-family:\'Urbanist\', sans-serif; font-size:17px; font-weight:700; letter-spacing:-0.12em; line-height:1; color:inherit; display:inline-flex; align-items:center; justify-content:center; width:1.2em; height:1.2em;">{{ sendGlyph }}</span>'
);

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
