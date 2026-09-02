// Renders the pages that no longer need the DC runtime. The authored file
// stays under src/; the plain HTML it produces is written to the root path
// the site serves, the way build-projects.mjs generates work/<slug>/.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderPage } from '../lib/render-page.mjs';

export const PAGES = [
  'studio.html',
  'work.html',
  'custom-home-design-edmonton.html',
  'renovations-additions-edmonton.html',
  'restaurant-hospitality-design-edmonton.html',
  'commercial-retail-design-edmonton.html'
];

for (const page of PAGES) {
  writeFileSync(page, renderPage(readFileSync('src/' + page, 'utf8')));
}
console.log(`rendered ${PAGES.length} pages from src/`);
