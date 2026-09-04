import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a direct load never fades the page root or SuDu navigation', async () => {
  const script = await readFile(new URL('../js/turbo-boot.js', import.meta.url), 'utf8');

  assert.doesNotMatch(script, /html\.sudu-arrive #page/);
  assert.doesNotMatch(script, /root\.classList\.add\('sudu-arrive'\)/);
  assert.doesNotMatch(script, /@keyframes suduArrive/);
});

test('Turbo page-to-page navigation keeps its existing fade', async () => {
  const script = await readFile(new URL('../js/turbo-boot.js', import.meta.url), 'utf8');

  assert.match(script, /html\[data-nav\] #page\{opacity:0;\}/);
  assert.match(script, /html\[data-nav="out"\] #page\{transition:opacity/);
});
