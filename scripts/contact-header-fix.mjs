#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../contact.html', import.meta.url);
let html = readFileSync(path, 'utf8');

// Contact is the only page where the active navigation item retained a visible
// underline on the off-white ground. Match the current active Contact link and
// make only its bottom border transparent; no other header behaviour changes.
html = html.replace(
  /(<a href="\/contact"[^>]*style="[^"]*?)border-bottom:1px solid #171613;([^"]*"[^>]*>Contact<\/a>)/,
  '$1border-bottom:1px solid transparent;$2'
);

// The FAQ's single glyph chevron reads too lightly at this scale. Replace only
// that glyph with a small two-stroke geometric chevron. It inherits the FAQ
// button's current text colour, so black text gets a black chevron and dark
// themes follow the existing text-colour system automatically.
html = html.replace(
  /<span style="flex:none; font-weight:600; color:#E17B3E; transition:transform \.3s ease; transform:\{\{ faq\.rot \}\};">&#8250;<\/span>/g,
  '<span aria-hidden="true" style="position:relative; flex:none; width:10px; height:14px; color:inherit; transition:transform .3s ease; transform:{{ faq.rot }};"><span style="position:absolute; left:1px; top:3px; width:8px; height:8px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg);"></span></span>'
);

// The Send inquiry arrow should use the same ink as its label rather than the
// orange accent, and carry enough weight to read as part of the control rather
// than a decorative punctuation mark. The sent-state checkmark inherits this
// same treatment.
html = html.replace(
  /<span style="font-weight:700; color:#E17B3E;">\{\{ sendGlyph \}\}<\/span>/g,
  '<span style="font-weight:900; font-size:15px; line-height:1; color:inherit;">{{ sendGlyph }}</span>'
);

// Charcoal needs more optical contrast than Off-white/Burnt. The current dark
// theme is produced by filtering each section, so the original warm greys and
// low-alpha rules become too dim after inversion. These overrides change only
// the Contact page on the Charcoal ground, preserving the existing Off-white
// and Burnt values exactly. Values are chosen pre-filter so the rendered result
// lands at roughly #B8B6AE for secondary ink, #8F8D86 for tertiary ink, with
// visibly stronger soft/medium rules.
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

writeFileSync(path, html);
