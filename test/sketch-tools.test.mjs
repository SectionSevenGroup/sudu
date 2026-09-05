import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('../js/sketch.js', import.meta.url);
const pageUrl = new URL('../sketch/index.html', import.meta.url);
const cssUrl = new URL('../css/sketch.css', import.meta.url);

test('the drawing stage is never registered as a toolbar button', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /id="drawStage"[^>]+data-tool=/);
  assert.match(script, /^\s*var toolButtons = .*querySelectorAll\('\.tool-button\[data-tool\]'\).*;$/m);
  assert.doesNotMatch(script, /querySelectorAll\('\[data-tool\]'\)/);
});

test('edit mode handles every object and exposes opening and geometry anchors', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /data-tool="edit"[^>]+aria-keyshortcuts="V"/);
  assert.match(script, /\['line', 'room', 'door', 'window', 'area', 'stencil'\]\.indexOf\(object\.type\)/);
  assert.match(script, /function objectAnchors\(object\)/);
  assert.match(script, /function objectBounds\(object\)/);
  assert.match(script, /function moveSelected\(event\)/);
  assert.match(script, /if \(original\.points\) object\.points = original\.points\.map\(shiftPoint\)/);
});

test('the plan has fixed world units plus mouse and touch navigation', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /data-tool="pan"/);
  assert.match(page, /data-action="zoom-in"/);
  assert.match(page, /data-action="zoom-out"/);
  assert.match(page, /data-action="fit-view"/);
  assert.match(script, /var WORLD_DOTS_X = 64/);
  assert.match(script, /var WORLD_DOTS_Y = 48/);
  assert.match(script, /var DOT_FEET = 2/);
  assert.match(script, /function fitView\(\)/);
  assert.match(script, /function zoomAt\(/);
  assert.match(script, /function beginGesture\(\)/);
  assert.match(script, /canvas\.addEventListener\('wheel'/);
});

test('doors and windows attach to wall identities and resolve after wall edits', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.match(script, /function makeObjectId\(type\)/);
  assert.match(script, /function segmentForHost\(hostId, edge, floorKey\)/);
  assert.match(script, /function resolvedOpening\(object, floorKey\)/);
  assert.match(script, /function attachOpening\(opening, point\)/);
  assert.match(script, /hostId: closest && closest\.distance/);
  assert.match(script, /opening\.lengthDots/);
});

test('trace layers import, lock, rename, reorder, duplicate, calibrate and change opacity', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /data-action="import-underlay"/);
  assert.match(page, /id="underlayInput"[^>]+image\/png,image\/jpeg,image\/webp/);
  assert.match(script, /function importUnderlay\(file\)/);
  assert.match(script, /function toggleLayerLock\(id\)/);
  assert.match(script, /function renameLayer\(id\)/);
  assert.match(script, /function duplicateLayer\(id\)/);
  assert.match(script, /function reorderLayer\(id, direction\)/);
  assert.match(script, /function calibrateUnderlay\(id\)/);
  assert.match(script, /function setLayerOpacity\(id, value\)/);
});

test('architectural templates use theme-aware solid ink and remain editable', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /data-stencil-category="cars"/);
  assert.match(page, /data-stencil-category="trees"/);
  assert.match(page, /data-stencil-category="furniture"/);
  assert.match(script, /function drawStencilGlyph\(/);
  assert.match(script, /var detail = filled \? PAPER : INK/);
  assert.match(script, /target\.fillStyle = INK/);
  assert.doesNotMatch(script, /SOLID_BLACK/);
});

test('projects persist across three floors and export project, PNG and PDF files', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');

  assert.equal((page.match(/data-floor="(basement|main|second)"/g) || []).length, 3);
  assert.match(script, /var STORAGE_KEY = 'sudu-sketch-v3'/);
  assert.match(script, /var PREVIOUS_STORAGE_KEY = 'sudu-sketch-v2'/);
  assert.match(script, /function serializeWorkspace\(\)/);
  assert.match(script, /function openProject\(file\)/);
  assert.match(script, /sudu-sketch-project\.sudusketch/);
  assert.match(script, /function captureScreenshot\(\)/);
  assert.match(script, /function capturePDF\(\)/);
  assert.match(page, /data-action="pdf"/);
});

test('the existing SuDu template shell stays intact', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');

  assert.match(page, /<header id="suduNav" class="sketch-header">/);
  assert.match(page, /<footer class="sketch-footer">/);
  assert.match(page, /href="\/work"/);
  assert.match(page, /href="\/studio"/);
  assert.match(page, /href="\/contact"/);
  assert.match(css, /html\.dm\.dmwarm\s+\{ --paper: #C0431F; \}/);
  assert.match(css, /html\.dm:not\(\.dmwarm\) \{ --paper: #121110; \}/);
});

test('mobile uses a standalone app shell with top-left undo and collapsible tool sheets', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');

  assert.match(page, /class="mobile-master-bar"[^>]+aria-label="Main drawing tools"/);
  assert.equal((page.match(/data-mobile-menu="(draw|add|more)"/g) || []).length, 3);
  assert.match(page, /data-mobile-tool="edit"/);
  assert.match(page, /class="mobile-undo-top"[^>]+data-mobile-action="undo"/);
  assert.doesNotMatch(page, /mobile-master-bar[\s\S]{0,500}data-mobile-action="undo"/);
  assert.match(page, /data-mobile-panel="draw"/);
  assert.match(page, /data-mobile-panel="add"/);
  assert.match(page, /data-mobile-panel="more"/);
  assert.match(script, /function openMobilePanel\(name\)/);
  assert.match(script, /function closeMobilePanels\(\)/);
  assert.match(script, /function syncMobileControls\(\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.mobile-master-bar/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /#suduBar,[\s\S]+\.sketch-header,[\s\S]+\.sketch-intro,[\s\S]+\.sketch-footer \{ display: none !important; \}/);
  assert.match(css, /\.mobile-undo-top \{[\s\S]+display: block/);
  assert.match(css, /\.sketch-toolbar,[\s\S]+\.sketch-workspace-footer \{ display: none; \}/);
});
