import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Override only to test a downloaded copy of the deployed physics bundle.
const bundle = process.env.MASSING_PHYSICS_BUNDLE;
const { RAPIER } = await import(bundle ? pathToFileURL(bundle).href : '../stack/vendor/stack-deps.js');
await RAPIER.init();
const source = await readFile(new URL('../play/blocks/massing.js', import.meta.url), 'utf8');
const transitions = [...source.matchAll(/(\w+)\.body\.setBodyType\(RAPIER\.RigidBodyType\.Dynamic, true\);\s*(?:\/\/[^\n]*\n\s*)?\1\.body\.recomputeMassPropertiesFromColliders\(\);/g)];

test('every dynamic release recalculates mass', () => {
  assert.equal(transitions.length, 6);
  assert.equal(transitions.length, [...source.matchAll(/setBodyType\(RAPIER\.RigidBodyType\.Dynamic/g)].length);
});

for (const [index, transition] of transitions.entries()) {
  test(`release path ${index + 1}: tray, gravity, hold, support removal`, () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    const step = (n) => { for (let i = 0; i < n; i++) world.step(); };
    try {
      world.createCollider(RAPIER.ColliderDesc.cuboid(20, .1, 20).setTranslation(0, -.1, 0));
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
      const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(.5, .5, .5).setDensity(1.1), body);
      collider.setEnabled(false);
      body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      step(2);
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      step(2);
      collider.setEnabled(true);
      const release = new Function(transition[1], 'RAPIER', transition[0]);
      release({ body }, RAPIER);
      assert.ok(body.mass() > 1, 'tray release must restore mass');
      step(60);
      assert.ok(body.translation().y < 4, 'gravity must accelerate the released block');
      step(300);
      assert.ok(Math.abs(body.translation().y - .5) < .03, 'block must settle on the floor');

      body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      body.setTranslation({ x: 0, y: 3, z: 0 }, true);
      step(1200);
      assert.equal(body.translation().y, 3, 'temporary fixed hold must prevent falling');
      release({ body }, RAPIER);
      step(240);
      assert.ok(Math.abs(body.translation().y - .5) < .03, 'gravity must resume after hold');

      const support = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, .5, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(1, .5, 1), support);
      body.setTranslation({ x: 0, y: 1.5, z: 0 }, true);
      step(300);
      world.removeRigidBody(support);
      body.wakeUp();
      step(240);
      assert.ok(Math.abs(body.translation().y - .5) < .03, 'unsupported block must fall');
    } finally { world.free(); }
  });
}
