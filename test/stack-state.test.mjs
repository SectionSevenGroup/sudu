import assert from 'node:assert/strict';
import test from 'node:test';
import { blockTilt, createCollapseMonitor } from '../stack/game-state.js';
import { THREE } from '../stack/vendor/stack-deps.js';

const block = (y = 4) => {
  const position = { x: 0, y, z: 0 };
  return { free: false, carryable: false, position, body: { translation: () => position } };
};

test('normal course yaw never counts as tilt, including during sideways extraction', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    assert.equal(blockTilt(rotation), 0);
    rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .6));
    assert.ok(Math.abs(blockTilt(rotation) - .6) < 1e-8);
  }
});

test('two actual falls must persist; wobble and a single loose piece do not end play', () => {
  const blocks = [block(), block(), block()];
  const monitor = createCollapseMonitor();
  monitor.arm(blocks);
  blocks[0].position.y = 2;
  assert.equal(monitor.step(blocks, null, 1), null);
  blocks[1].position.y = 2;
  assert.equal(monitor.step(blocks, null, .4), null);
  blocks[1].position.y = 4;
  assert.equal(monitor.step(blocks, null, .3), null);
  blocks[1].position.y = 2;
  assert.equal(monitor.step(blocks, null, .4), null);
  assert.equal(monitor.step(blocks, null, .3).fallenBlocks, 2);
  assert.equal(monitor.step(blocks, null, 1), null, 'collapse emits once');
});

test('held and intentionally dropped blocks are excluded, fallen carryable blocks are counted', () => {
  const blocks = [block(), block(), block()];
  const monitor = createCollapseMonitor();
  monitor.arm(blocks);
  blocks.forEach(b => { b.position.y = 1; b.carryable = true; });
  blocks[0].free = true;
  assert.equal(monitor.step(blocks, blocks[1], 1), null);
  assert.equal(monitor.step(blocks, null, 1).fallenBlocks, 2);
});

test('a placed block uses its exact new home and can later participate in collapse', () => {
  const blocks = [block(), block()];
  const monitor = createCollapseMonitor();
  monitor.arm(blocks);
  blocks[0].position.y = 10;
  monitor.placed(blocks[0], 10);
  assert.equal(monitor.step(blocks, null, 1), null);
  blocks[0].position.y = 8;
  blocks[1].position.y = 2;
  assert.equal(monitor.step(blocks, null, 1).fallenBlocks, 2);
});

test('reset removes old homes, timing and terminal state, including immediate new play', () => {
  const blocks = [block(), block()];
  const monitor = createCollapseMonitor();
  monitor.arm(blocks);
  blocks.forEach(b => { b.position.y = 1; });
  monitor.step(blocks, null, .5);
  monitor.reset();
  assert.equal(monitor.step(blocks, null, 1), null);
  const rebuilt = [block(8), block(8)];
  monitor.arm(rebuilt);
  rebuilt.forEach(b => { b.position.y = 6; });
  assert.equal(monitor.step(rebuilt, null, .2), null);
  assert.ok(monitor.step(rebuilt, null, .5));
});
