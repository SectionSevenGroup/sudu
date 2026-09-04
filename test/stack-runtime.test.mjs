import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { setMaxListeners } from 'node:events';
import { THREE, RAPIER } from '../stack/vendor/stack-deps.js';
import { blockTilt, createCollapseMonitor } from '../stack/game-state.js';

// Run the authored runtime with real Three geometry/raycasting and Rapier WASM.
// Only browser presentation is replaced; these tests do not claim visual QA.
class Element extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.hidden = true;
    this.clientWidth = 1440;
    this.clientHeight = 900;
    this.classes = new Set();
    this.attributes = new Map();
    this.classList = {
      add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: n => this.classes.has(n),
      toggle: (n, enabled = !this.classes.has(n)) => enabled ? this.classes.add(n) : this.classes.delete(n)
    };
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  toggleAttribute(name, value) { if (value) this.attributes.set(name, ''); else this.attributes.delete(name); }
  append(item) { this.children.push(item); item.parent = this; item.isConnected = true; }
  replaceChildren() { this.children = []; }
  remove() { this.parent.children = this.parent.children.filter(x => x !== this); this.isConnected = false; }
  focus() {}
  querySelector(selector) { return this.select?.[selector] || null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture(id) { if (this.capture === id) this.capture = null; }
}

function event(type, fields = {}) {
  const value = new Event(type, { cancelable: true });
  Object.assign(value, fields);
  return value;
}

async function runtime() {
  const selectors = ['#stack-stage', '.stack-loading', '#move-count', '#again', '.stack-instruction',
    '#stack-cue-shield', '#stack-help', '#stack-player-form', '#stack-player-input',
    '#stack-player-list', '#stack-result', '#stack-result-name', '#stack-result-state'];
  const elements = Object.fromEntries(selectors.map(s => [s, new Element()]));
  const stage = elements['#stack-stage'];
  stage.select = { '.stack-loading': elements['.stack-loading'] };
  stage.append(elements['.stack-loading']);
  elements['#stack-player-form'].select = { button: new Element() };
  const document = new Element();
  document.hidden = false;
  document.body = new Element();
  document.querySelector = s => elements[s];
  document.createElement = () => new Element();
  const window = new Element();
  const raf = new Map();
  let nextFrame = 0;
  let now = 0;
  let scene, camera, canvas;
  const worlds = [];
  const errors = [];
  class World extends RAPIER.World {
    constructor(...args) { super(...args); worlds.push(this); }
    free() { this.wasFreed = true; return super.free(); }
  }
  class Renderer {
    constructor() { this.domElement = canvas = new Element(); }
    setPixelRatio() {}
    setSize() {}
    render(s, c) { scene = s; camera = c; scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
    dispose() { this.disposed = true; }
  }
  class Controller extends AbortController {
    constructor() { super(); setMaxListeners(0, this.signal); }
  }
  const globals = {
    document, window, performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++nextFrame; raf.set(id, fn); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    matchMedia: () => ({ matches: false }), innerWidth: 1440, devicePixelRatio: 1,
    location: { search: '' }, URLSearchParams, AbortController: Controller,
    CustomEvent: class extends Event { constructor(type, options) { super(type); this.detail = options.detail; } },
    console: { error: e => errors.push(e) }, blockTilt, createCollapseMonitor,
    deps: { THREE: { ...THREE, WebGLRenderer: Renderer }, RAPIER: { ...RAPIER, World } }
  };
  function run(source) { return new Function(...Object.keys(globals), source)(...Object.values(globals)); }
  const tutorial = await readFile(new URL('../stack/tutorial3d.js', import.meta.url), 'utf8');
  globals.createTutorial = run(tutorial.replace('export function', 'function') + '\nreturn createTutorial;');
  run(await readFile(new URL('../stack/players.js', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../stack/stack.js', import.meta.url), 'utf8');
  await run(source.replace(/^import .*;\n/gm, '')
    .replace('Promise.all([', 'return Promise.all([')
    .replace("import('/stack/vendor/three-shim.js?v=72k')", 'Promise.resolve(deps.THREE)')
    .replace("import('/stack/vendor/rapier-shim.js')", 'Promise.resolve(deps.RAPIER)'));
  assert.deepEqual(errors, [], 'runtime initialises');
  function advance(seconds, hz = 60) {
    for (let i = 0; i < Math.round(seconds * hz); i++) {
      now += 1000 / hz;
      const callbacks = [...raf.values()];
      raf.clear();
      callbacks.forEach(fn => fn(now));
    }
  }
  const groups = () => scene.children.filter(g => Number.isInteger(g.children[0]?.userData.blockIndex));
  function point(group, local = new THREE.Vector3(1.51, 0, 0)) {
    const p = group.localToWorld(local).project(camera);
    return { clientX: (p.x + 1) * 720, clientY: (1 - p.y) * 450 };
  }
  const pointer = (type, position, extra = {}) => canvas.dispatchEvent(event(type,
    { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, ...position, ...extra }));
  advance(.1);
  return { elements, window, document, advance, groups, point, pointer, worlds, raf,
    emit: (type, detail = {}) => window.dispatchEvent(new globals.CustomEvent(type, { detail })) };
}

test('real 72-block runtime: settling, raycast grip, cancellation, repeated reset and teardown', async () => {
  const originalAdd = THREE.Scene.prototype.add;
  const originalLookAt = THREE.PerspectiveCamera.prototype.lookAt;
  const r = await runtime();
  const stage = r.elements['#stack-stage'];
  assert.equal(r.groups().length, 72);
  r.advance(2);
  assert.equal(THREE.Scene.prototype.add, originalAdd);
  assert.equal(THREE.PerspectiveCamera.prototype.lookAt, originalLookAt);
  assert.equal(r.document.body.classList.contains('stack-game-over'), false);
  let turnStarts = 0;
  r.window.addEventListener('stack:turnstart', () => turnStarts++);
  const at = r.point(r.groups()[41]);
  r.pointer('pointerdown', at);
  assert.equal(stage.classList.contains('is-dragging'), true);
  assert.equal(turnStarts, 1);
  r.pointer('pointerdown', at, { button: 2 });
  assert.equal(turnStarts, 1, 'secondary button does not steal the hand');
  assert.equal(stage.classList.contains('is-orbiting'), false);
  r.advance(.2);
  r.pointer('lostpointercapture', at);
  assert.equal(stage.classList.contains('is-dragging'), false);
  r.advance(3);
  assert.equal(r.document.body.classList.contains('stack-game-over'), false);
  for (let i = 0; i < 3; i++) {
    r.elements['#again'].dispatchEvent(event('click'));
    r.advance(.1);
    assert.equal(r.groups().length, 72);
    assert.equal(r.raf.size, 1, 'one animation loop after every reset');
  }
  assert.equal(r.worlds.length, 4);
  assert.ok(r.worlds.slice(0, -1).every(w => w.wasFreed));
  r.window.dispatchEvent(event('pagehide', { persisted: false }));
  assert.equal(r.raf.size, 0);
  assert.ok(r.worlds.at(-1).wasFreed);
});

test('four-player turn events preserve score, resolve collapse, and reset names immediately', async () => {
  const r = await runtime();
  const list = r.elements['#stack-player-list'];
  const names = ['Joe', 'Jen', 'Mike', 'Guest'];
  for (const name of names) {
    r.elements['#stack-player-input'].value = name;
    r.elements['#stack-player-form'].dispatchEvent(event('submit'));
  }
  assert.equal(list.children.length, 4);
  const active = () => list.children.find(x => x.classList.contains('is-active'))?.textContent;
  assert.equal(active(), 'Joe');
  for (let moves = 1; moves <= 5; moves++) {
    r.emit('stack:turnstart');
    r.elements['#move-count'].textContent = `${moves} moves`;
    r.emit('stack:placed', { moves, blockIndex: moves });
    r.emit('stack:placed', { moves, blockIndex: moves });
    assert.equal(active(), names[moves % 4], 'each placement advances once');
  }
  r.emit('stack:turnstart');
  r.emit('stack:gamecollapse');
  assert.equal(r.elements['#stack-result-name'].textContent, 'Joe');
  assert.equal(r.elements['#move-count'].textContent, '5 moves');
  r.emit('stack:placed', { moves: 6 });
  assert.equal(active(), undefined, 'finished ledger cannot advance');
  r.elements['#again'].dispatchEvent(event('click'));
  assert.equal(active(), 'Joe');
  assert.deepEqual(list.children.map(x => x.textContent), names);
  assert.equal(r.elements['#move-count'].textContent, '');
  assert.equal(r.elements['#stack-result'].hidden, true);
  r.window.dispatchEvent(event('pagehide', { persisted: false }));
});

test('held-block travel follows the same fixed physics speed at 30, 60 and 144 Hz', async () => {
  const distances = [];
  for (const hz of [30, 60, 144]) {
    const r = await runtime();
    r.advance(1);
    const bodies = [];
    r.worlds[0].bodies.forEach(body => { if (body.isDynamic()) bodies.push(body); });
    const body = bodies[41];
    body.setTranslation({ x: -5, y: 5, z: 4 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    r.advance(.1);
    const at = r.point(r.groups()[41], new THREE.Vector3(0, 0, 0));
    r.pointer('pointerdown', at);
    assert.equal(body.isKinematic(), true, 'a loose piece can be lifted');
    const start = { ...body.translation() };
    r.pointer('pointermove', { clientX: at.clientX - 300, clientY: at.clientY });
    r.advance(.5, hz);
    const end = body.translation();
    distances.push(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z));
    r.window.dispatchEvent(event('blur'));
    assert.equal(body.isDynamic(), true, 'interruption restores gravity');
    assert.equal(r.elements['#stack-stage'].classList.contains('is-dragging'), false);
    r.window.dispatchEvent(event('pagehide', { persisted: false }));
  }
  distances.forEach(distance => assert.ok(Math.abs(distance - 1.6) < .04, `travel was ${distance}`));
  assert.ok(Math.max(...distances) - Math.min(...distances) < .03);
});

test('wood contacts start settled and an assisted placement lands without a drop or rebound', async () => {
  const r = await runtime();
  const bodies = [];
  r.worlds[0].bodies.forEach(body => { if (body.isDynamic()) bodies.push(body); });
  const top = bodies[70];
  const firstHeight = top.translation().y;
  r.advance(2);
  assert.ok(Math.abs(firstHeight - top.translation().y) < .002, 'no startup concertina');

  // Present an extracted piece beside the top and complete the actual pointer
  // carry/placement path. The guide must follow settled physical support.
  const loose = bodies[41];
  loose.setTranslation({ x: -3.6, y: 8.8, z: 4 }, true);
  loose.setLinvel({ x: 0, y: 0, z: 0 }, true);
  r.advance(.05);
  const at = r.point(r.groups()[41], new THREE.Vector3());
  r.pointer('pointerdown', at);
  assert.ok(loose.isKinematic());
  const target = new THREE.Vector3(0, top.translation().y + .366, -.98);
  const destination = r.point({ localToWorld: () => target });
  r.pointer('pointermove', destination);
  r.advance(2);
  r.pointer('pointerup', destination);
  assert.equal(r.elements['#move-count'].textContent, '1 move');
  assert.ok(loose.isDynamic());
  assert.equal(loose.linvel().y, 0, 'placement does not add an upward kick');

  const placedHeight = loose.translation().y;
  const supportHeight = top.translation().y;
  let low = placedHeight;
  let high = placedHeight;
  let lowestSupport = supportHeight;
  for (let i = 0; i < 180; i++) {
    r.advance(1 / 120, 120);
    low = Math.min(low, loose.translation().y);
    high = Math.max(high, loose.translation().y);
    lowestSupport = Math.min(lowestSupport, top.translation().y);
  }
  assert.ok(placedHeight - low < .02, 'block is placed on wood, not above an air gap');
  assert.ok(high - placedHeight < .002, 'no visible upward rebound');
  assert.ok(supportHeight - lowestSupport < .006, 'support does not visibly compress');
  assert.equal(r.document.body.classList.contains('stack-game-over'), false);
  r.window.dispatchEvent(event('pagehide', { persisted: false }));
});

test('a top-face grip pushes against support and lifts vertically as a dynamic wooden block', async () => {
  const r = await runtime();
  const bodies = [];
  r.worlds[0].bodies.forEach(body => { if (body.isDynamic()) bodies.push(body); });
  const top = bodies[70];
  const initial = { ...top.translation() };
  const supports = bodies.map(body => ({ ...body.translation() }));
  const at = r.point(r.groups()[70], new THREE.Vector3(0, .18, 0));

  r.pointer('pointerdown', at);
  r.pointer('pointermove', { clientX: at.clientX, clientY: at.clientY + 200 });
  r.advance(2);
  assert.ok(initial.y - top.translation().y < .003, 'supporting wood resists a downward push');
  assert.ok(top.isDynamic(), 'contact remains physical');
  r.pointer('pointerup', at);

  const lift = r.point(r.groups()[70], new THREE.Vector3(0, .18, 0));
  r.pointer('pointerdown', lift);
  r.pointer('pointermove', { clientX: lift.clientX, clientY: lift.clientY - 100 });
  r.advance(1);
  const raised = top.translation();
  assert.ok(raised.y - initial.y > .3, 'the top gesture actually lifts an unloaded piece');
  assert.ok(Math.hypot(raised.x - initial.x, raised.z - initial.z) < .05, 'top pull does not slide along a horizontal face');
  assert.ok(top.isDynamic(), 'lifting does not bypass collisions with kinematic carry');
  bodies.forEach((body, index) => {
    if (index !== 70) assert.ok(Math.abs(body.translation().y - supports[index].y) < .006, 'the rest of the tower stays settled');
  });
  r.pointer('pointerup', lift);
  r.advance(2);
  assert.ok(Math.abs(top.translation().y - initial.y) < .006, 'release returns the piece to its support under gravity');
  assert.equal(r.document.body.classList.contains('stack-game-over'), false);
  r.window.dispatchEvent(event('pagehide', { persisted: false }));
});
