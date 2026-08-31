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
// that glyph with a small two-stroke geometric chevron. The outer wrapper keeps
// the existing open/closed rotation, position and orange accent; row spacing
// and interaction behaviour are unchanged.
html = html.replace(
  /<span style="flex:none; font-weight:600; color:#E17B3E; transition:transform \.3s ease; transform:\{\{ faq\.rot \}\};">&#8250;<\/span>/g,
  '<span aria-hidden="true" style="position:relative; flex:none; width:10px; height:14px; color:#E17B3E; transition:transform .3s ease; transform:{{ faq.rot }};"><span style="position:absolute; left:1px; top:3px; width:8px; height:8px; border-right:1.5px solid #E17B3E; border-bottom:1.5px solid #E17B3E; transform:rotate(-45deg);"></span></span>'
);

writeFileSync(path, html);
