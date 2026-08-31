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

// Contact already authors the exact same glyph used by the homepage controls:
// U+203A / &#8250; (›). Do not mutate the DOM to change it. Instead, verify
// that the source still contains the expected glyphs and apply the homepage's
// Urbanist chevron treatment with CSS only. If either source contract changes,
// fail the build rather than silently shipping a different arrow language.
if (!html.includes('>&#8250;</span>')) {
  throw new Error('Contact FAQ chevron glyph contract changed: expected U+203A / &#8250;');
}
if (!html.includes("sent ? '\\u2713' : '\\u203A'")) {
  throw new Error('Contact Send inquiry glyph contract changed: expected U+203A in sendGlyph');
}

if (!html.includes('id="contactChevronStandard"')) {
  const chevrons = `
<style id="contactChevronStandard">
  section[data-screen-label="FAQ"] button[aria-expanded] > span:last-child,
  form[name="contact"] button[type="submit"] > span:last-child {
    font-family:'Urbanist',sans-serif !important;
    font-weight:700 !important;
    letter-spacing:-0.12em !important;
    line-height:1 !important;
    color:inherit !important;
    display:inline-flex !important;
    align-items:center !important;
    justify-content:center !important;
    width:1.2em !important;
    height:1.2em !important;
    flex:none !important;
  }
  section[data-screen-label="FAQ"] button[aria-expanded] > span:last-child {
    font-size:20px !important;
  }
  form[name="contact"] button[type="submit"] > span:last-child {
    font-size:18px !important;
  }
</style>`;
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

console.log('Applied Contact header, chevron CSS, charcoal contrast, and Work count fixes.');
