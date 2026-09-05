import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { THREE } = await import(process.env.MASSING_PHYSICS_BUNDLE ? pathToFileURL(process.env.MASSING_PHYSICS_BUNDLE).href : '../stack/vendor/stack-deps.js');
const source = await readFile(new URL('../play/blocks/massing.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0);
  let depth = 0;
  const brace = source.indexOf('{', start);
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
}
const axes = source.slice(source.indexOf('  const AXES ='), source.indexOf('  function axisOverlap'));
const names = ['getWorldBounds', 'bodyPosition', 'bodyRotation', 'overlap', 'axisOverlap', 'snapPlacementClear', 'findSnapCandidate', 'carrySurfacePoint'];
function fixture() {
  const pieces = [];
  const meshes = [];
  const raycaster = new THREE.Raycaster();
  const api = new Function('THREE', 'pieces', 'meshes', 'raycaster', `const SNAP_GAP=.014; ${axes}\n${names.map(extract).join('\n')}\nreturn {findSnapCandidate,carrySurfacePoint};`)(THREE, pieces, meshes, raycaster);
  function add(size, y, x = 0) {
    const position = new THREE.Vector3(x, y, 0);
    const rotation = new THREE.Quaternion();
    const piece = { shapes: [{ size, at: [0, 0, 0] }], targetPosition: position, targetRotation: rotation, body: { translation: () => position, rotation: () => rotation }, group: { visible: true } };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
    mesh.position.copy(position);
    mesh.userData.pieceIndex = pieces.length;
    mesh.updateMatrixWorld(true);
    meshes.push(mesh);
    pieces.push(piece);
    return piece;
  }
  return { ...api, pieces, meshes, raycaster, add };
}
test('third block snaps above second instead of into it', () => {
  const f = fixture();
  f.add([4, 1, 2], .5);
  const second = f.add([2, 1, 2], 1.5);
  const third = f.add([1, 1, 1], 1);
  const snap = f.findSnapCandidate(third);
  assert.equal(snap.target, second);
  assert.ok(Math.abs(snap.position.y - 2.514) < .001);
});
test('exposed lower surfaces remain available beside the second block', () => {
  const f = fixture();
  const bottom = f.add([6, 1, 2], .5);
  f.add([1, 1, 1], 1.5);
  const third = f.add([1, 1, 1], 1, 2.5);
  assert.equal(f.findSnapCandidate(third).target, bottom);
});
test('ray aimed at second block uses its upper surface and ignores carried mesh', () => {
  const f = fixture();
  f.add([4, 1, 2], .5);
  f.add([2, 1, 2], 1.5);
  const third = f.add([1, 1, 1], 3);
  f.raycaster.set(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  const point = f.carrySurfacePoint({ piece: third, carryIgnore: new Set() });
  assert.equal(point.y, 2);
  assert.equal(point.x, 0);
});
