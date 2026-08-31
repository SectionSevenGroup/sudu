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

console.log('Applied Contact header, charcoal contrast, and Work count fixes.');
