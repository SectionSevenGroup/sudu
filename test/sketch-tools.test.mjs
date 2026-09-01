import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the drawing stage is never registered as a toolbar button', async () => {
  const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../sketch/index.html', import.meta.url), 'utf8');

  assert.match(page, /id="drawStage"[^>]+data-tool=/);
  assert.match(script, /^\s*var toolButtons = .*querySelectorAll\('\.tool-button\[data-tool\]'\).*;$/m);
  assert.doesNotMatch(script, /querySelectorAll\('\[data-tool\]'\)/);
});

test('edit mode exposes grid-snapped resize anchors for walls, rooms and areas', async () => {
  const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../sketch/index.html', import.meta.url), 'utf8');

  assert.match(page, /data-tool="edit"[^>]+aria-keyshortcuts="V"/);
  assert.match(script, /\['line', 'room', 'area', 'stencil'\]\.indexOf\(object\.type\)/);
  assert.match(script, /function objectAnchors\(object\)/);
  assert.match(script, /function drawSelection\(target, object\)/);
  assert.match(script, /pointFromEvent\(event, true\)/);
  assert.match(script, /if \(changed\) remember\(previous\);/);
});

test('architectural templates place, persist, restyle, rotate, move and resize', async () => {
  const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../sketch/index.html', import.meta.url), 'utf8');

  assert.match(page, /data-tool="stencil"[^>]+aria-keyshortcuts="T"/);
  assert.match(page, /data-stencil-category="cars"/);
  assert.match(page, /data-stencil-category="trees"/);
  assert.match(page, /data-stencil-category="furniture"/);
  assert.match(page, /data-stencil-style="outline"/);
  assert.match(page, /data-stencil-style="solid"/);
  assert.match(page, /data-action="rotate-template"/);
  assert.match(script, /type: 'stencil'/);
  assert.match(script, /function drawStencilGlyph\(/);
  assert.match(script, /function drawStencil\(/);
  assert.match(script, /function stencilBounds\(/);
  assert.match(script, /function beginMove\(/);
  assert.match(script, /function moveSelected\(/);
  assert.match(script, /function rotateTemplate\(/);
  assert.match(script, /SOLID_BLACK = '#171613'/);
});

test('the sketch keeps independent layered drawings for three floors', async () => {
  const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../sketch/index.html', import.meta.url), 'utf8');

  assert.equal((page.match(/data-floor="(basement|main|second)"/g) || []).length, 3);
  assert.match(page, /id="traceLayers"/);
  assert.match(page, /data-action="add-trace"/);
  assert.match(page, /data-action="reference-below"/);
  assert.match(page, /data-action="reference-above"/);
  assert.match(script, /var STORAGE_KEY = 'sudu-sketch-v2'/);
  assert.match(script, /var LEGACY_STORAGE_KEY = 'sudu-sketch-v1'/);
  assert.match(script, /function makeFloor\(\)/);
  assert.match(script, /function bindActiveLayer\(\)/);
  assert.match(script, /function addTrace\(\)/);
  assert.match(script, /function toggleLayerVisibility\(id\)/);
});

test('adjacent floor outlines render as non-editable ghost geometry', async () => {
  const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');

  assert.match(script, /function adjacentFloor\(direction\)/);
  assert.match(script, /function drawFloorOutline\(target, key, width, height, direction\)/);
  assert.match(script, /if \(refs\.below && below\) drawFloorOutline/);
  assert.match(script, /if \(refs\.above && above\) drawFloorOutline/);
  assert.match(script, /target\.setLineDash\(direction === 'above'/);
  assert.match(script, /drawScene\(outCtx, width, height, false\)/);
});
