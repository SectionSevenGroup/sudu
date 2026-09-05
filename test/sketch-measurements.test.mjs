import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');

// Exercise the production pointer handlers and model transforms without a browser.
function drawingState() {
  const captures = new Set();
  const classes = new Set();
  const state = {
    cssWidth: 900, cssHeight: 650, dpr: 2, PAPER: '#F3F1EA',
    camera: { x: 30, y: 20, scale: 0.5 },
    canvas: {
      getBoundingClientRect: () => ({ left: 11, top: 22 }),
      setPointerCapture: id => captures.add(id),
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture: id => captures.delete(id)
    },
    ctx: Object.fromEntries(['setTransform', 'clearRect', 'fillRect', 'save', 'translate', 'scale', 'restore'].map(key => [key, () => {}])),
    stage: { classList: { add() {}, remove() {} } },
    cursor: { style: {}, classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), contains: key => classes.has(key) } },
    measurements: { hidden: true, textContent: '', offsetWidth: 132, offsetHeight: 68, style: {} },
    paperPointer: { x: 0, y: 0, type: 'mouse', inside: false },
    active: null, resizeDrag: null, moveDrag: null, panDrag: null, gesture: null,
    objects: [], undoStack: [], tool: 'line', pointers: new Map(), spaceHeld: false,
    rulerState: { visible: false, angle: 0 },
    toolHints: { edit: '' }, doorFlip: false,
    activeLayerState: () => ({ locked: false }),
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    clone: value => JSON.parse(JSON.stringify(value)),
    makeObjectId: type => type + '-test',
    drawScene() {}, setHint() {}, clampCamera() {}
  };
  state.remember = previous => state.undoStack.push(previous);
  state.setObjects = next => { state.objects = next; };
  runInNewContext(script.slice(script.indexOf('  var GRID_SPACING'), script.indexOf('  var camera')), state);
  for (const name of [
    'formatFeet', 'measurementText', 'measurementPosition', 'updatePaperFeedback', 'trackPaperPointer',
    'screenPoint', 'pointFromEvent', 'px', 'constrainToRuler', 'pointerScreen', 'screenDistance',
    'onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'render',
    'beginGesture', 'moveGesture', 'beginPan', 'movePan', 'endPan', 'moveResize', 'finishResize'
  ]) {
    const start = script.indexOf('  function ' + name + '(');
    const end = script.indexOf('\n  function ', start + 1);
    assert.ok(start >= 0 && end > start, name);
    runInNewContext(script.slice(start, end), state);
  }
  state.event = (xFeet, yFeet, type = 'mouse', id = 1) => ({
    clientX: 11 + state.camera.x + xFeet * 14 * state.camera.scale,
    clientY: 22 + state.camera.y + yFeet * 14 * state.camera.scale,
    pointerType: type, pointerId: id, button: 0, target: state.canvas
  });
  return state;
}

test('live line length and crosshair follow snapped geometry at different zooms', () => {
  for (const scale of [0.35, 1, 2.5]) {
    const state = drawingState();
    state.camera.scale = scale;
    state.onPointerDown(state.event(1, 1));
    state.onPointerMove(state.event(4.2, 5.1));
    assert.equal(state.measurements.hidden, false);
    assert.equal(state.measurements.textContent, 'Length  5′');
    assert.equal(state.cursor.style.left, (30 + 4 * 14 * scale) + 'px');
    assert.equal(state.cursor.style.top, (20 + 5 * 14 * scale) + 'px');
    assert.equal(state.cursor.classList.contains('is-visible'), true);
    assert.equal(state.objects.length, 0);
    state.onPointerUp(state.event(4.2, 5.1));
    assert.equal(state.measurements.hidden, true);
    assert.equal(state.objects.length, 1);
    assert.equal(state.undoStack.length, 1);
    assert.equal(state.measurementText(state.objects[0]), 'Length  5′');
  }
});

test('ruler-constrained length uses the projected endpoint and rounds inches with carry', () => {
  const state = drawingState();
  state.rulerState = { visible: true, angle: 45 };
  state.onPointerDown(state.event(1, 1));
  state.onPointerMove(state.event(4, 5));
  assert.equal(state.measurements.textContent, 'Length  4′ 11″');
  assert.ok(Math.abs(parseFloat(state.cursor.style.left) - 61.5) < 1e-8);
  assert.ok(Math.abs(parseFloat(state.cursor.style.top) - 51.5) < 1e-8);
  state.onPointerMove({ ...state.event(4, 5), altKey: true });
  assert.equal(state.measurements.textContent, 'Length  5′');
  assert.equal(state.formatFeet(11.9999 / 12), '1′');
  assert.equal(state.formatFeet(0), '0′');
  assert.equal(state.formatFeet(3.5), '3′ 6″');
});

test('room and area trackers show positive X, Y and area in either drag direction', () => {
  for (const tool of ['room', 'area']) {
    for (const reverse of [false, true]) {
      const state = drawingState();
      state.tool = tool;
      const a = reverse ? [4, 5] : [1, 1];
      const b = reverse ? [1, 1] : [4, 5];
      state.onPointerDown(state.event(...a, 'touch'));
      state.onPointerMove(state.event(...b, 'touch'));
      assert.equal(state.measurements.textContent, 'X  3′\nY  4′\nArea  12 ft²');
      state.onPointerUp(state.event(...b, 'touch'));
      assert.equal(state.measurements.hidden, true);
      assert.equal(state.cursor.classList.contains('is-visible'), false);
      assert.equal(state.objects.length, 1);
    }
  }
});

test('tracker stays within a small canvas and sits above a finger when space permits', () => {
  const state = drawingState();
  state.cssWidth = 320;
  state.cssHeight = 240;
  for (const x of [-200, 0, 160, 320, 500]) {
    for (const y of [-200, 0, 120, 240, 500]) {
      for (const touch of [false, true]) {
        const position = state.measurementPosition({ x, y }, 132, 68, touch);
        assert.ok(position.x >= 8 && position.x + 132 <= 312);
        assert.ok(position.y >= 8 && position.y + 68 <= 232);
      }
    }
  }
  const position = state.measurementPosition({ x: 120, y: 200 }, 132, 68, true);
  assert.equal(position.y + 68, 152);
});

test('anchor resizing updates dimensions and cancellation restores the object without an undo step', () => {
  const state = drawingState();
  state.tool = 'edit';
  const original = { type: 'room', start: { x: 1 / 128, y: 1 / 96 }, end: { x: 4 / 128, y: 5 / 96 } };
  state.objects = [state.clone(original)];
  state.resizeDrag = { index: 0, handle: 'corner', opposite: original.start, previous: [original], changed: false };
  state.onPointerMove(state.event(7, 6));
  assert.equal(state.measurements.textContent, 'X  6′\nY  5′\nArea  30 ft²');
  state.onPointerCancel(state.event(7, 6));
  assert.equal(state.measurements.hidden, true);
  assert.equal(state.measurementText(state.objects[0]), 'X  3′\nY  4′\nArea  12 ft²');
  assert.equal(state.undoStack.length, 0);
});

test('cancelled drawing and a second touch dismiss the preview and measurements', () => {
  for (const finish of ['cancel', 'pinch']) {
    const state = drawingState();
    state.onPointerDown(state.event(1, 1, 'touch'));
    state.onPointerMove(state.event(4, 5, 'touch'));
    assert.equal(state.measurements.hidden, false);
    if (finish === 'cancel') state.onPointerCancel(state.event(4, 5, 'touch'));
    else state.onPointerDown(state.event(10, 10, 'touch', 2));
    assert.equal(state.measurements.hidden, true);
    assert.equal(state.active, null);
    assert.equal(state.objects.length, 0);
    assert.equal(state.undoStack.length, 0);
  }
});
