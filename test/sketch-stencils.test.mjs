import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
function loadFunctions(state, names) {
  for (const name of names) {
    const start = script.indexOf('  function ' + name + '(');
    const end = script.indexOf('\n  function ', start + 1);
    assert.ok(start >= 0 && end > start, name);
    runInNewContext(script.slice(start, end), state);
  }
}
function library() {
  const state = { WORLD_DOTS_X: 64, WORLD_DOTS_Y: 48, DOT_FEET: 2, WORLD_WIDTH: 1792, WORLD_HEIGHT: 1344 };
  runInNewContext(script.slice(script.indexOf('  var STENCILS ='), script.indexOf('  var toolHints =')), state);
  loadFunctions(state, ['stencilSpec', 'stencilDimensions', 'stencilSizeLabel', 'formatFeet', 'stencilBounds', 'drawStencilGlyph', 'roundedRectPath']);
  return state;
}

test('realistic footprints use inches and keep vehicle, bed and dining sizes distinct', () => {
  const state = library();
  assert.equal(state.STENCILS.length, 17);
  assert.equal(new Set(state.STENCILS.map(spec => spec.id)).size, 17);
  const cases = { 'car-sedan': [194, 82], 'car-suv': [198, 86], bed: [84, 66], 'bed-king': [84, 82], dining: [108, 72] };
  for (const [id, [length, width]] of Object.entries(cases)) {
    const spec = state.stencilSpec(id);
    const dimensions = state.stencilDimensions(spec);
    assert.equal(dimensions.width * 128 * 12, length);
    assert.equal(dimensions.height * 96 * 12, width);
  }
  assert.equal(state.stencilSizeLabel(state.stencilSpec('car-sedan')), '16′ 2″ × 6′ 10″');
  assert.equal(state.stencilSizeLabel(state.stencilSpec('bed')), '7′ × 5′ 6″');
});

test('placing any template preserves its footprint through rotation and project reload', () => {
  const state = library();
  Object.assign(state, {
    tool: 'stencil', spaceHeld: false, stencilFilled: false, objects: [],
    activeLayerState: () => ({ locked: false }),
    trackPaperPointer() {}, pointFromEvent: () => ({ x: 0.5, y: 0.5 }),
    canvas: { setPointerCapture() {}, hasPointerCapture: () => false },
    clone: value => JSON.parse(JSON.stringify(value)),
    makeObjectId: id => id + '-test', remember() {}, setHint() {}, render() {},
    allowedTypes: ['stencil'], ensureObjectId: object => object
  });
  loadFunctions(state, ['onPointerDown', 'cleanObjects']);
  for (const spec of state.STENCILS) {
    for (const rotation of [0, 90]) {
      state.stencilId = spec.id;
      state.stencilRotation = rotation;
      state.onPointerDown({ button: 0, pointerId: 1, pointerType: 'mouse' });
      const object = state.objects.at(-1);
      const saved = JSON.stringify(object);
      assert.equal(JSON.stringify(state.cleanObjects(JSON.parse('[' + saved + ']'))[0]), saved);
      const bounds = state.stencilBounds(object);
      assert.ok(Math.abs((bounds.right - bounds.left) * 128 * 12 - spec.inches[rotation ? 1 : 0]) < 1e-8);
      assert.ok(Math.abs((bounds.bottom - bounds.top) * 96 * 12 - spec.inches[rotation ? 0 : 1]) < 1e-8);
    }
  }
  // Existing v3 objects keep their stored size, even if their original default was small.
  const legacy = { type: 'stencil', stencil: 'car-sedan', width: 0.0625, height: 1 / 24, point: { x: 0.2, y: 0.3 } };
  assert.equal(state.cleanObjects([legacy])[0].width, 0.0625);
  assert.equal(state.cleanObjects([legacy])[0].height, 1 / 24);
});

test('every plan symbol renders finite paths with theme-aware detail colours on all three grounds', () => {
  const state = library();
  for (const [paper, ink] of [['#F3F1EA', '#171613'], ['#121110', '#F5F3EC'], ['#C0431F', '#F5F3EC']]) {
    state.PAPER = paper;
    state.INK = ink;
    for (const spec of state.STENCILS) {
      for (const filled of [false, true]) {
        const strokes = [], fills = [];
        let depth = 0;
        const target = {
          save() { depth++; }, restore() { depth--; },
          beginPath() {}, closePath() {},
          stroke() { strokes.push(this.strokeStyle); }, fill() { fills.push(this.fillStyle); }
        };
        for (const name of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse', 'translate', 'rotate']) {
          target[name] = (...values) => assert.ok(values.every(Number.isFinite), spec.id + ' ' + name);
        }
        state.drawStencilGlyph(target, spec.id, spec.inches[0], spec.inches[1], filled, 1);
        assert.equal(depth, 0, spec.id);
        assert.ok(fills.length > 0 && strokes.length >= 2, spec.id);
        assert.ok(fills.every(colour => colour === (filled ? ink : paper)), spec.id);
        assert.ok(strokes.includes(ink), spec.id);
        assert.ok(strokes.includes(filled ? paper : ink), spec.id);
      }
    }
  }
});

test('template selection works when an opening is above it in the object stack', () => {
  const state = library();
  Object.assign(state, {
    resolvedOpening: object => object,
    distanceToSegment: () => 100,
    objects: [
      { type: 'stencil', stencil: 'sofa', point: { x: 0.5, y: 0.5 }, width: 0.1, height: 0.1 },
      { type: 'door', start: { x: 0, y: 0 }, end: { x: 0.02, y: 0 } }
    ]
  });
  loadFunctions(state, ['hitObject', 'selectableObjectAt']);
  assert.equal(state.selectableObjectAt({ x: 0.5, y: 0.5 }), 0);
});
