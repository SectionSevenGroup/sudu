#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const pages = [
  'custom-home-design-edmonton.html',
  'renovations-additions-edmonton.html',
  'restaurant-hospitality-design-edmonton.html',
  'commercial-retail-design-edmonton.html'
];
for (const p of pages) {
  const path = join(root,p);
  let s = readFileSync(path,'utf8');
  if (!s.includes('js/service-shell.js')) {
    s = s.replace('<script src="js/chrome-bar.js"></script>', '<script src="js/chrome-bar.js"></script>\n<script src="js/service-shell.js" defer></script>\n<script src="i18n.js" defer></script>\n<script src="js/audio-player.js" defer></script>');
  }
  // Leave space for persistent bottom chrome, matching current core pages.
  s = s.replace(/<footer style="([^"]*)">/g, (m, style) => style.includes('padding-bottom:64px') ? m : `<footer style="${style}; padding-bottom:64px">`);
  writeFileSync(path,s);
}
console.log('Service pages joined to persistent SuDu chrome.');
