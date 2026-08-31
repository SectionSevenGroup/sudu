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

writeFileSync(path, html);
