// Stamp every local script, stylesheet and icon reference with a hash of the file it points at.
//
// Returning visitors once kept running stale shared runtime files after those
// files had changed. Content-derived ?v= hashes prevent URL reuse; the chrome
// runtime is additionally marked data-turbo-track="reload" so a changed
// persistent singleton forces a full document reload instead of surviving a
// Turbo body swap.
//
// Icons are included because browsers keep favicons in a cache of their own that
// outlives ordinary HTTP revalidation; a changed mark needs a changed URL.
//
// Run before build-projects.mjs; generated pages inherit the stamped source.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGES = [
  'index.html',
  'work.html',
  'studio.html',
  'contact.html',
  'sketch/index.html',
  'src/project.html',
  'custom-home-design-edmonton.html',
  'renovations-additions-edmonton.html',
  'restaurant-hospitality-design-edmonton.html',
  'commercial-retail-design-edmonton.html',
  'src/index.html',
  'src/contact.html',
  'src/studio.html',
  'src/work.html',
  'src/custom-home-design-edmonton.html',
  'src/renovations-additions-edmonton.html',
  'src/restaurant-hospitality-design-edmonton.html',
  'src/commercial-retail-design-edmonton.html'
];
const REF = /(<(?:script[^>]*\ssrc|link[^>]*\shref)=")(\.?\/?)([A-Za-z0-9._\/-]+\.(?:js|css|png|ico))(\?v=[^"]*)?(")/g;
const CHROME = /<script([^>]*\bsrc="[^"]*js\/chrome-bar\.js\?v=[^"]+"[^>]*)>/g;

const hashes = new Map();
function stamp(file) {
  if (!hashes.has(file)) {
    if (!existsSync(file)) throw new Error(`page references ${file}, which does not exist`);
    hashes.set(file, createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8));
  }
  return hashes.get(file);
}

let changed = 0;
for (const page of PAGES) {
  if (!existsSync(page)) continue;
  const before = readFileSync(page, 'utf8');
  let after = before.replace(REF, (m, open, prefix, file, _old, close) =>
    open + prefix + file + '?v=' + stamp(file) + close);

  // chrome-bar.js is a persistent singleton outside Turbo's replaceable body.
  // If its content hash changes, Turbo must reload the whole document so an
  // already-running previous version cannot remain alive in the tab.
  after = after.replace(CHROME, (m, attrs) =>
    /\bdata-turbo-track=/.test(attrs)
      ? m
      : '<script' + attrs + ' data-turbo-track="reload">');

  if (after !== before) {
    writeFileSync(page, after);
    changed++;
  }
}
const list = [...hashes].map(([f, h]) => `${f}=${h}`).join(' ');
console.log(`stamped ${hashes.size} assets across ${PAGES.length} pages (${changed} rewritten)`);
console.log('  ' + list);
