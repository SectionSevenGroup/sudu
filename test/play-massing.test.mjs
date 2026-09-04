import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('MASSING uses the SuDu placement template without changing STACK', async () => {
  const [stack, massing] = await Promise.all([
    read('stack.html'),
    read('play/massing/index.html')
  ]);

  assert.doesNotMatch(stack, /MASSING|play-switch|play\/massing/);
  assert.match(massing, /href="\/play\/massing\/massing\.css"/);
  assert.match(massing, /src="\/play\/massing\/massing\.js"/);
  assert.doesNotMatch(massing, /stack\.css|stack\/intro\.js|stack-intro|massing-place/);
});

test('MASSING reuses local STACK physics without burdening the homepage', async () => {
  const [massingScript, massingShim, stackShim, home] = await Promise.all([
    read('play/massing/massing.js'),
    read('play/massing/three-shim.js'),
    read('stack/vendor/three-shim.js'),
    read('index.html')
  ]);

  assert.match(massingScript, /import\('\/play\/massing\/three-shim\.js'\)/);
  assert.match(massingScript, /import\('\/stack\/vendor\/rapier-shim\.js'\)/);
  assert.match(massingShim, /import \{ THREE \} from '\/stack\/vendor\/stack-deps\.js'/);
  assert.doesNotMatch(stackShim, /GridHelper|PlaneGeometry/);
  assert.doesNotMatch(home, /massing\.js|stack-deps\.js|rapier-shim\.js/);
});

test('MASSING previews aligned stacking and places automatically on release', async () => {
  const script = await read('play/massing/massing.js');

  assert.match(script, /function findSnapCandidate/);
  assert.match(script, /const snapGuide = new THREE\.Group\(\)/);
  assert.match(script, /setInstruction\('release to align'\)/);
  assert.match(script, /if \(cancelled \|\| carried\.moved\) releaseSelected\(!cancelled\)/);
  assert.match(script, /selected\.body\.setTranslation\(selected\.targetPosition, true\)/);
});

test('MASSING softly aligns only the joined cluster on double click', async () => {
  const [page, script] = await Promise.all([
    read('play/massing/index.html'),
    read('play/massing/massing.js')
  ]);

  assert.match(page, /double-click group to align/);
  assert.match(script, /addEventListener\('dblclick'/);
  assert.match(script, /function contactRelation/);
  assert.match(script, /function findTouchingCluster/);
  assert.match(script, /function alignTouchingCluster/);
  assert.match(script, /function updateClusterSettle/);
  assert.match(script, /progress \* progress \* \(3 - 2 \* progress\)/);
  assert.match(script, /RigidBodyType\.KinematicPositionBased/);
  assert.match(script, /item\.piece\.body\.sleep\(\)/);
});

test('MASSING draws its grid directly on the continuous cream floor', async () => {
  const script = await read('play/massing/massing.js');

  assert.match(script, /scene\.background = new THREE\.Color\(0xf3f1ea\)/);
  assert.match(script, /floorMaterial = new THREE\.MeshBasicMaterial\(\{ color: 0xf3f1ea \}\)/);
  assert.match(script, /new THREE\.GridHelper\(14\.4, 24/);
  assert.doesNotMatch(script, /padMaterial|padMesh|padEdges/);
});

test('MASSING uses a coherent architectural kit of parts', async () => {
  const [script, shim] = await Promise.all([
    read('play/massing/massing.js'),
    read('play/massing/three-shim.js')
  ]);

  assert.match(script, /const MODULE = 1\.2/);
  for (const family of [
    'unit 01',
    'double unit 01',
    'long mass 01',
    'room mass 01',
    'slab 01',
    'wall 01',
    'beam 01',
    'column 01',
    'core 01',
    'L mass',
    'U mass',
    'frame',
    'stair',
    'round tower',
    'quarter curve',
    'gable roof',
    'mono pitch'
  ]) assert.match(script, new RegExp(`name: '${family}'`));
  assert.match(script, /ColliderDesc\.cylinder/);
  assert.match(script, /ColliderDesc\.convexHull/);
  assert.match(shim, /export const CylinderGeometry/);
  assert.match(shim, /export const BufferGeometry/);
});

test('MASSING matches the current SuDu chrome and limits collision energy', async () => {
  const [script, style] = await Promise.all([
    read('play/massing/massing.js'),
    read('play/massing/massing.css')
  ]);

  assert.match(style, /padding: 34px clamp\(20px, 4\.5vw, 64px\) 30px/);
  assert.match(style, /height: 38px/);
  assert.match(style, /font-size: 13px/);
  assert.match(script, /const MIN_CARRY_SPEED = 1\.25/);
  assert.match(script, /const MAX_CARRY_SPEED = 8/);
  assert.match(script, /const CARRY_ACCEL_DISTANCE = 3\.5/);
  assert.match(script, /const easedResponse = response \* response \* \(3 - 2 \* response\)/);
  assert.match(script, /const MAX_HORIZONTAL_SPEED = 1\.15/);
  assert.match(script, /const CONTROL_TURN_SPEED = Math\.PI \* 1\.2/);
  assert.match(script, /function limitBodyMotion/);
  assert.match(script, /function updateSelectedControls/);
  assert.match(script, /for \(const piece of pieces\) limitBodyMotion\(piece\)/);
  assert.doesNotMatch(script, /carryPosition\.copy\(carried\.carryDesired\)/);
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
