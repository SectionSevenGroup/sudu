// Stamp every local script reference with a hash of the file it points at.
//
// The pages cache-bust with ?v=N, bumped by hand. That failed once already:
// i18n.js and audio-player.js were rewritten to mount their pills into the
// chrome bar, the ?v= stayed put, and returning visitors kept running the old
// files — the language pill positioned itself in the corner instead of in the
// bar, and the music pill never got built at all. A version derived from the
// content cannot drift from it, so the bump stops being something to remember.
//
// Run before build-projects.mjs; the generated pages inherit the stamps.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGES = ['index.html', 'work.html', 'studio.html', 'contact.html', 'project.html'];
const REF = /(<(?:script[^>]*\ssrc|link[^>]*\shref)=")(\.?\/?)([A-Za-z0-9._\/-]+\.(?:js|css))(\?v=[^"]*)?(")/g;

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
  const before = readFileSync(page, 'utf8');
  const after = before.replace(REF, (m, open, prefix, file, _old, close) =>
    open + prefix + file + '?v=' + stamp(file) + close);
  if (after !== before) { writeFileSync(page, after); changed++; }
}
const list = [...hashes].map(([f, h]) => `${f}=${h}`).join(' ');
console.log(`stamped ${hashes.size} assets across ${PAGES.length} pages (${changed} rewritten)`);
console.log('  ' + list);
