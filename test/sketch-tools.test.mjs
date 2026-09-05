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
  assert.match(script, /\['line', 'room', 'door', 'window', 'area', 'stencil', 'shape'\]\.indexOf\(object\.type\)/);
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

test('one-foot grid snaps accurately and marks four-foot intersections without rescaling the model', async () => {
  const { runInNewContext } = await import('node:vm');
  const script = await readFile(scriptUrl, 'utf8');
  const dots = [];
  const state = {
    GRID: '#000', camera: { x: 13, y: 17, scale: 0.5 },
    canvas: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value))
  };
  runInNewContext(script.slice(script.indexOf('  var GRID_SPACING'), script.indexOf('  var camera')), state);
  runInNewContext(script.slice(script.indexOf('  function pointFromEvent('), script.indexOf('  function px(')), state);
  runInNewContext(script.slice(script.indexOf('  function drawGrid('), script.indexOf('  function drawOpening(')), state);
  assert.equal(state.WORLD_WIDTH, 1792);
  assert.equal(state.WORLD_HEIGHT, 1344);
  assert.equal(state.WORLD_DOTS_X * state.DOT_FEET, 128);
  assert.equal(state.GRID_STEP, 14);
  // Existing opening lengths and new template dimensions still use legacy units.
  assert.equal(1.5 * state.GRID_SPACING / state.GRID_STEP, 3);
  assert.equal(2 * state.GRID_SPACING / state.GRID_STEP, 4);
  const point = state.pointFromEvent({ clientX: 30.6, clientY: 44.6 }, true);
  assert.equal(point.x * 128, 1);
  assert.equal(point.y * 96, 1);
  const target = { save() {}, restore() {}, beginPath() {}, fill() {}, arc: (x, y, radius) => dots.push({ x, y, radius }) };
  for (const width of [1792, 1800]) {
    dots.length = 0;
    state.drawGrid(target, width, width * 0.75);
    assert.equal(dots.length, 129 * 97);
    assert.equal(dots[0].x, 0);
    assert.equal(dots[0].y, 0);
    assert.equal(dots.at(-1).x, width);
    assert.equal(dots.at(-1).y, width * 0.75);
    assert.equal(dots.filter(dot => Math.abs(dot.radius - 1.2 * width / 1792) < 1e-9).length, 33 * 25);
    assert.equal(dots[4 * 97 + 4].radius, dots[0].radius);
    assert.ok(dots[4 * 97 + 1].radius < dots[0].radius);
  }
  assert.match(script, /grid: \{ feetPerDot: GRID_FEET, majorEveryFeet: MAJOR_GRID_FEET \}/);
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /1′ grid · 4′ major/);
  assert.doesNotMatch(page, /two feet|2′ per dot/);
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

test('Sketch keeps SuDu branding and the slim control bar without website navigation or a second footer', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');

  assert.match(page, /<header id="suduNav" class="sketch-header">/);
  assert.match(page, /<span class="sketch-page-name">SKETCH<\/span>/);
  assert.doesNotMatch(page, /<footer class="sketch-footer">|<nav\b/);
  assert.doesNotMatch(page, /href="\/(work|studio|contact)"/);
  assert.match(page, /src="\/images\/sudu-mark.png"/);
  assert.match(page, /src="\/js\/chrome-bar.js\?v=/);
  assert.match(page, /href="\/css\/tool-footer.css\?v=/);
  assert.match(css, /\.sketch-main \{\s*padding: clamp\(124px, 15vh, 164px\) var\(--sudu-inset\) var\(--sudu-chrome\);/);
  assert.match(css, /html\.dm\.dmwarm\s+\{ --paper: #C0431F; \}/);
  assert.match(css, /html\.dm:not\(\.dmwarm\) \{ --paper: #121110; \}/);
});

test('resizing the canvas refits the page but preserves a manually zoomed view', async () => {
  const { runInNewContext } = await import('node:vm');
  const script = await readFile(scriptUrl, 'utf8');
  let bounds = { width: 1000, height: 400 };
  const state = {
    cssWidth: 0, cssHeight: 0, dpr: 1,
    WORLD_WIDTH: 1792, WORLD_HEIGHT: 1344,
    GRID_STEP: 14, GRID_FEET: 1, MAJOR_GRID_FEET: 4,
    camera: { x: 0, y: 0, scale: 1, fitted: false },
    canvas: { style: {} }, ctx: { setTransform() {} },
    stage: { getBoundingClientRect: () => bounds, style: { setProperty() {} } },
    window: { devicePixelRatio: 2 }, zoomLevel: {}, rulerState: { visible: false },
    positionRuler() {}, render() {}
  };
  runInNewContext(script.slice(script.indexOf('  function resize()'), script.indexOf('  function pointFromEvent(')), state);
  state.resize();
  const initialScale = state.camera.scale;
  bounds = { width: 1000, height: 1300 };
  state.resize();
  assert.ok(state.camera.scale > initialScale);
  assert.equal(state.camera.scale, state.fittedScale(1000, 1300));
  assert.equal(state.canvas.height, 2600);
  assert.equal(state.canvas.style.height, '1300px');
  state.zoomAt(1.5, 500, 650);
  const centre = [(state.cssWidth / 2 - state.camera.x) / 1.5, (state.cssHeight / 2 - state.camera.y) / 1.5];
  bounds = { width: 1200, height: 1100 };
  state.resize();
  assert.equal(state.camera.scale, 1.5);
  assert.equal((state.cssWidth / 2 - state.camera.x) / 1.5, centre[0]);
  assert.equal((state.cssHeight / 2 - state.camera.y) / 1.5, centre[1]);
  assert.equal(state.WORLD_WIDTH, 1792);
  assert.equal(state.WORLD_HEIGHT, 1344);
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
  const levels = element();
  const floorName = element();
  const state = {
    mobileOpenPanel: '', mobileUi: element(), mobileSheet: element(),
    mobileToolsToggle: element(), stencilPanel: element(), tool: 'pen',
    mobilePanels: [element({ 'data-mobile-panel': 'draw' })],
    mobileToolButtons: [],
    mobileActionButtons: ['undo', 'levels', 'layers', 'templates', 'clear'].map(name => element({ 'data-mobile-action': name })),
    actionButtons: { undo: { disabled: true }, clear: { disabled: true } }, rulerState: { visible: false },
    activeFloor: 'main', FLOOR_LABELS: { main: 'Main', basement: 'Basement' },
    activeLayerState: () => ({ name: 'Drawing' }),
    document: { querySelector: selector => ({ '.trace-bar': traceBar, '#sketchLevels': levels, '#mobileFloorName': floorName })[selector] || (selector === '.trace-bar.is-mobile-open' && traceBar.classList.contains('is-mobile-open') ? traceBar : null) }
  };
  state.setTool = tool => { state.tool = tool; };
  runInNewContext(script.slice(script.indexOf('  function closeMobilePanels()'), script.indexOf('  function closeNoteComposer()')), state);
  state.openMobilePanel('draw');
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'true');
  assert.equal(state.mobileUi.classList.contains('is-tools-open'), true);
  assert.equal(state.mobilePanels[0].hidden, false);
  state.openMobileSection('levels');
  assert.equal(state.mobilePanels[0].hidden, true);
  assert.equal(levels.classList.contains('is-mobile-open'), true);
  assert.equal(state.mobileActionButtons[1].getAttribute('aria-expanded'), 'true');
  assert.equal(floorName.textContent, 'Main');
  state.activeFloor = 'basement';
  state.syncMobileControls();
  assert.equal(floorName.textContent, 'Basement');
  state.closeMobilePanels();
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(state.mobileUi.classList.contains('is-tools-open'), false);
  assert.equal(state.mobileSheet.hidden, true);
  state.openMobileSection('layers');
  assert.equal(traceBar.classList.contains('is-mobile-open'), true);
  assert.equal(levels.classList.contains('is-mobile-open'), false);
  assert.equal(state.mobileToolsToggle.getAttribute('aria-expanded'), 'true');
  state.openMobileSection('templates');
  assert.equal(traceBar.classList.contains('is-mobile-open'), false);
  assert.equal(state.stencilPanel.hidden, false);
  assert.equal(state.mobileActionButtons[3].getAttribute('aria-expanded'), 'true');
  assert.equal(state.tool, 'stencil');
  state.openMobilePanel('draw');
  assert.equal(state.stencilPanel.hidden, true);
  assert.equal(state.mobileActionButtons[3].getAttribute('aria-expanded'), 'false');
  assert.equal(state.mobileActionButtons[0].disabled, true);
  assert.equal(state.mobileActionButtons[4].disabled, true);
  state.actionButtons.clear.disabled = false;
  state.syncMobileControls();
  assert.equal(state.mobileActionButtons[4].disabled, false);
  state.closeMobilePanels();
  assert.equal(traceBar.classList.contains('is-mobile-open'), false);
  assert.equal(state.tool, 'stencil');
});

test('Sketch preserves desktop SuDu chrome and uses a mobile tools pill with top menus', async () => {
  const script = await readFile(scriptUrl, 'utf8');
  const page = await readFile(pageUrl, 'utf8');
  const css = await readFile(cssUrl, 'utf8');

  assert.doesNotMatch(page, /data-mobile-menu=|mobile-master-bar/);
  const context = page.slice(page.indexOf('class="sketch-context-bar"'), page.indexOf('id="sketchLevels"'));
  for (const name of ['undo', 'levels', 'layers', 'templates', 'clear']) assert.match(context, new RegExp('data-mobile-action="' + name + '"'));
  assert.match(page, /id="mobileFloorName">Main</);
  assert.match(page, /data-mobile-tool="edit"/);
  assert.match(page, /class="mobile-undo-top"[^>]+data-mobile-action="undo"/);
  assert.match(page, /class="sketch-product-header"[\s\S]+alt="SuDu"[\s\S]+class="sketch-product-name">Sketch</);
  assert.doesNotMatch(page, /mobile-master-bar[\s\S]{0,500}data-mobile-action="undo"/);
  assert.match(page, /data-mobile-panel="draw"/);
  assert.equal((page.match(/data-mobile-panel=/g) || []).length, 1);
  assert.match(script, /function openMobilePanel\(name\)/);
  assert.match(script, /function closeMobilePanels\(\)/);
  assert.match(script, /function syncMobileControls\(\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]+\.mobile-context-control/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  const desktopCss = css.split('@media (max-width: 760px)')[0];
  assert.doesNotMatch(desktopCss, /\.sketch-header[^{}]*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /#suduBar[^{}]*\{[^}]*display:\s*none/);
  assert.match(css, /html #suduBar #musicPill \{[^}]*position: fixed !important;[^}]*top:/);
  assert.match(css, /html #suduBar \{[^}]*backdrop-filter: none/);
  assert.match(css, /\.mobile-tool-sheet \{[^}]*top: var\(--sketch-menu-top\)/);
  assert.match(page, /id="sketchToolsToggle"[^>]*aria-expanded="false"[^>]*>Add<\/button>/);
  assert.match(css, /\.sketch-tools-pill \{[^}]*border-radius: 999px/);
  assert.match(css, /\.mobile-undo-top \{[\s\S]+display: block/);
  assert.match(css, /grid-template-columns: 76px minmax\(0, auto\) 1fr/);
  assert.match(css, /\.sketch-product-header \{[\s\S]+min-height: 54px/);
  assert.match(css, /\.mobile-tool-panel button \{[^}]*min-height: 40px/);
  assert.match(css, /\.trace-copy, \.trace-order \{ display: block; \}/);
  assert.match(css, /\.sketch-toolbar,[\s\S]+\.sketch-workspace-footer \{ display: none; \}/);
});

test('clear confirms its layer and floor, preserves other layers and can be undone', async () => {
  const { runInNewContext } = await import('node:vm');
  const script = await readFile(scriptUrl, 'utf8');
  const original = [{ type: 'line' }];
  let accepted = false;
  let locked = false;
  let prompt = '';
  let undo;
  const state = {
    objects: original, selectedIndex: 0, activeFloor: 'main', FLOOR_LABELS: { main: 'Main' },
    activeLayerState: () => ({ name: 'Trace 2', locked }),
    window: { confirm: text => { prompt = text; return accepted; } },
    clone: value => structuredClone(value), setObjects: value => { state.objects = value; },
    updateStencilPanel() {}, remember: value => { undo = value; }, render() {}
  };
  runInNewContext(script.slice(script.indexOf('  function clearDrawing()'), script.indexOf('  function saveDrawing()')), state);
  state.clearDrawing();
  assert.equal(state.objects, original);
  assert.equal(prompt, 'Clear Trace 2 on the main floor?');
  accepted = true;
  locked = true;
  state.clearDrawing();
  assert.equal(state.objects, original);
  locked = false;
  state.clearDrawing();
  assert.equal(state.objects.length, 0);
  assert.deepEqual(undo, original);
  assert.equal(state.selectedIndex, -1);
});
