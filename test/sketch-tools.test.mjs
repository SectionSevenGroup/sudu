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

test('mobile menu state opens, switches and closes without changing drawing state', async () => {
  const { runInNewContext } = await import('node:vm');
  const script = await readFile(scriptUrl, 'utf8');
  const element = (attrs = {}) => {
    const classes = new Set();
    return {
      hidden: true, disabled: false,
      getAttribute: key => attrs[key],
      setAttribute: (key, value) => { attrs[key] = value; },
      classList: {
        add: key => classes.add(key), remove: key => classes.delete(key),
        contains: key => classes.has(key),
        toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }
      }
    };
  };
  const traceBar = element();
  const state = {
    mobileOpenPanel: '', mobileUi: element(), mobileSheet: element(),
    mobileToolsToggle: element(), stencilPanel: element(), tool: 'pen',
    mobilePanels: ['draw', 'add', 'more'].map(name => element({ 'data-mobile-panel': name })),
    mobileMenuButtons: ['draw', 'add', 'more'].map(name => element({ 'data-mobile-menu': name })),
    mobileToolButtons: [], mobileActionButtons: [], actionButtons: {}, rulerState: { visible: false },
    document: { querySelector: selector => selector === '.trace-bar' || traceBar.classList.contains('is-mobile-open') ? traceBar : null }
  };
  runInNewContext(script.slice(script.indexOf('  function closeMobilePanels()'), script.indexOf('  function closeNoteComposer()')), state);
  state.openMobilePanel('draw');
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(state.mobileUi.classList.contains('is-tools-open'), true);
  assert.equal(state.mobilePanels[0].hidden, false);
  state.openMobilePanel('add');
  assert.equal(state.mobilePanels[0].hidden, true);
  assert.equal(state.mobilePanels[1].hidden, false);
  state.closeMobilePanels();
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(state.mobileUi.classList.contains('is-tools-open'), false);
  assert.equal(state.mobileSheet.hidden, true);
  state.openMobileLayers();
  assert.equal(traceBar.classList.contains('is-mobile-open'), true);
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'true');
  state.closeMobilePanels();
  assert.equal(traceBar.classList.contains('is-mobile-open'), false);
  assert.equal(state.tool, 'pen');
});

test('Sketch preserves desktop SuDu chrome and uses a mobile tools pill with top menus', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');

  assert.match(page, /class="mobile-master-bar"[^>]+aria-label="Main drawing tools"/);
  assert.equal((page.match(/data-mobile-menu="(draw|add|more)"/g) || []).length, 3);
  assert.match(page, /data-mobile-tool="edit"/);
  assert.match(page, /class="mobile-undo-top"[^>]+data-mobile-action="undo"/);
  assert.match(page, /class="sketch-product-header"[\s\S]+alt="SuDu"[\s\S]+class="sketch-product-name">Sketch</);
  assert.doesNotMatch(page, /mobile-master-bar[\s\S]{0,500}data-mobile-action="undo"/);
  assert.match(page, /data-mobile-panel="draw"/);
  assert.match(page, /data-mobile-panel="add"/);
  assert.match(page, /data-mobile-panel="more"/);
  assert.match(script, /function openMobilePanel\(name\)/);
  assert.match(script, /function closeMobilePanels\(\)/);
  assert.match(script, /function syncMobileControls\(\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.mobile-master-bar/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  const desktopCss = css.split('@media (max-width: 760px)')[0];
  assert.doesNotMatch(desktopCss, /\.sketch-header[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#suduBar[^{}]*\{[^}]*display:\s*none/);
  assert.match(css, /html #suduBar #musicPill \{[^}]*position: fixed !important;[^}]*top:/);
  assert.match(css, /html #suduBar \{[^}]*backdrop-filter: none/);
  assert.match(css, /\.mobile-master-bar \{[^}]*top: var\(--sketch-menu-top\)/);
  assert.match(css, /\.mobile-tool-sheet \{[^}]*top: calc\(var\(--sketch-menu-top\) \+ 44px\)/);
  assert.match(page, /id="sketchToolsToggle"[^>]*aria-expanded="false"[^>]*>Tools<\/button>/);
  assert.match(css, /\.sketch-tools-pill \{[^}]*border-radius: 999px/);
  assert.match(css, /\.mobile-undo-top \{[\s\S]+display: block/);
  assert.match(css, /grid-template-columns: 76px minmax\(0, auto\) 1fr/);
  assert.match(css, /\.sketch-product-header \{[\s\S]+min-height: 54px/);
  assert.match(css, /\.mobile-master-bar button \{[^}]*font-weight: 600/);
  assert.match(css, /\.sketch-toolbar,[\s\S]+\.sketch-workspace-footer \{ display: none; \}/);
});
