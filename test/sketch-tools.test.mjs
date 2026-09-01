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
  assert.match(script, /\['line', 'room', 'area'\]\.indexOf\(object\.type\)/);
  assert.match(script, /function objectAnchors\(object\)/);
  assert.match(script, /function drawSelection\(target, object\)/);
  assert.match(script, /pointFromEvent\(event, true\)/);
  assert.match(script, /if \(changed\) remember\(previous\);/);
});
