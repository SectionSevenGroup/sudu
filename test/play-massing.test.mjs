import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('STACK and MASSING are one quiet SuDu PLAY family', async () => {
  const [stack, massing] = await Promise.all([
    read('stack.html'),
    read('play/massing/index.html')
  ]);

  assert.match(stack, /href="\/play\/massing\/"/);
  assert.match(massing, /href="\/stack"/);
  assert.match(massing, /href="\/stack\/stack\.css"/);
  assert.match(massing, /src="\/stack\/intro\.js"/);
  assert.match(massing, /src="\/play\/massing\/massing\.js"/);
});

test('MASSING reuses local STACK physics without burdening the homepage', async () => {
  const [massingScript, home] = await Promise.all([
    read('play/massing/massing.js'),
    read('index.html')
  ]);

  assert.match(massingScript, /import\('\/stack\/vendor\/three-shim\.js'\)/);
  assert.match(massingScript, /import\('\/stack\/vendor\/rapier-shim\.js'\)/);
  assert.doesNotMatch(home, /massing\.js|stack-deps\.js|rapier-shim\.js/);
});

test('MASSING exposes pointer, keyboard and reduced-motion paths', async () => {
  const [script, style] = await Promise.all([
    read('play/massing/massing.js'),
    read('play/massing/massing.css')
  ]);

  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /stage\.addEventListener\('keydown'/);
  assert.match(script, /event\.key\.toLowerCase\(\) === 'r'/);
  assert.match(script, /event\.key === 'Enter'/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});
