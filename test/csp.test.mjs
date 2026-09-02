// The public Content-Security-Policy allows scripts from this origin only, so
// no served page may carry an inline script or an inline event handler. This
// reads the pages the site serves — the rendered root pages, the generated
// project pages and the sketch page — and the policy itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const served = [
  ...readdirSync(new URL('..', import.meta.url)).filter((f) => f.endsWith('.html')),
  ...readdirSync(new URL('../work', import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => 'work/' + d.name + '/index.html'),
  'sketch/index.html',
];

test('every served page carries no inline script other than JSON-LD', () => {
  assert.ok(served.length >= 28, `expected the site's pages, found ${served.length}`);
  for (const p of served) {
    const html = read(p);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
      if (/\bsrc="/.test(tag)) continue;
      assert.match(tag, /type="application\/ld\+json"/, `${p}: ${tag}`);
    }
    assert.doesNotMatch(html, /\son[a-z]+="/i, `${p} has an inline event handler`);
    assert.doesNotMatch(html, /href="javascript:/i, `${p} has a javascript: URL`);
  }
});

test('every served script and stylesheet is on this origin or Google Fonts', () => {
  for (const p of served) {
    const html = read(p);
    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) assert.doesNotMatch(src, /^(https?:)?\/\//, `${p} loads ${src}`);
    for (const [, href] of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) assert.ok(!/^(https?:)?\/\//.test(href) || href.startsWith('https://fonts.googleapis.com/'), `${p} loads ${href}`);
    for (const [, href] of html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"/g)) assert.ok(!/^(https?:)?\/\//.test(href) || href.startsWith('https://fonts.googleapis.com/'), `${p} loads ${href}`);
  }
});

test('_headers sends the public policy with script-src limited to self', () => {
  const rules = read('_headers').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const at = rules.indexOf('/*');
  assert.ok(at >= 0, 'no /* rule');
  const block = [];
  for (let i = at + 1; i < rules.length && /^\s/.test(rules[i]); i++) block.push(rules[i].trim());
  const csp = block.find((l) => l.startsWith('Content-Security-Policy:'));
  assert.ok(csp, 'no Content-Security-Policy on /*');
  const directives = Object.fromEntries(csp.slice('Content-Security-Policy:'.length).split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(directives['script-src'], ["'self'"]);
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['style-src'], ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
  assert.deepEqual(directives['font-src'], ["'self'", 'https://fonts.gstatic.com']);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.ok(block.includes('X-Content-Type-Options: nosniff'));
  assert.ok(block.includes('Referrer-Policy: strict-origin-when-cross-origin'));
  assert.ok(rules.indexOf('/control/*') > at, 'the /control/* block must follow /* so its own values win');
});
