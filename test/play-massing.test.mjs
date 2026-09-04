import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('MASSING uses the SuDu placement template without changing STACK', async () => {
  const [stack, massing] = await Promise.all([
    read('stack.html'),
    read('play/blocks/index.html')
  ]);

  assert.doesNotMatch(stack, /MASSING|play-switch|play\/massing/);
  assert.match(massing, /href="\/play\/massing\/massing\.css"/);
  assert.match(massing, /src="\/play\/massing\/massing\.js"/);
  assert.doesNotMatch(massing, /stack\.css|stack\/intro\.js|stack-intro|massing-place/);
});

test('MASSING reuses the local physics bundle without burdening the homepage', async () => {
  const [massingScript, massingShim, rapierShim, stackShim, home] = await Promise.all([
    read('play/blocks/massing.js'),
    read('play/blocks/three-shim.js'),
    read('play/blocks/rapier-shim.js'),
    read('stack/vendor/three-shim.js'),
    read('index.html')
  ]);

  assert.match(massingScript, /import\('\/play\/massing\/three-shim\.js'\)/);
  assert.match(massingScript, /import\('\/play\/massing\/rapier-shim\.js'\)/);
  assert.match(massingShim, /import \{ THREE \} from '\/stack\/vendor\/stack-deps\.js'/);
  assert.match(rapierShim, /import \{ RAPIER \} from '\/stack\/vendor\/stack-deps\.js'/);
  assert.match(rapierShim, /CoefficientCombineRule/);
  assert.doesNotMatch(stackShim, /GridHelper|PlaneGeometry/);
  assert.doesNotMatch(home, /massing\.js|stack-deps\.js|rapier-shim\.js/);
});

test('MASSING previews aligned stacking and places automatically on release', async () => {
  const script = await read('play/blocks/massing.js');

  assert.match(script, /function findSnapCandidate/);
  assert.match(script, /const snapGuide = new THREE\.Group\(\)/);
  assert.match(script, /setInstruction\('release to align'\)/);
  assert.match(script, /if \(cancelled \|\| carried\.moved\) releaseSelected\(!cancelled\)/);
  assert.match(script, /selected\.body\.setTranslation\(selected\.targetPosition, true\)/);
});

test('MASSING softly aligns only the joined cluster on double click', async () => {
  const [page, script] = await Promise.all([
    read('play/blocks/index.html'),
    read('play/blocks/massing.js')
  ]);

  assert.match(page, /scroll lifts · double-click aligns/);
  assert.match(script, /addEventListener\('dblclick'/);
  assert.match(script, /function contactRelation/);
  assert.match(script, /function findTouchingCluster/);
  assert.match(script, /function alignTouchingCluster/);
  assert.match(script, /function updateClusterSettle/);
  assert.match(script, /progress \* progress \* \(3 - 2 \* progress\)/);
  assert.match(script, /RigidBodyType\.KinematicPositionBased/);
  assert.match(script, /const HOLD_DURATION = 8000/);
  assert.match(script, /RigidBodyType\.Fixed/);
  assert.match(script, /function updateHolds/);
  assert.match(script, /held 8s · add a counterbalance/);
});

test('MASSING uses a smart crane for simple up-and-over placement', async () => {
  const [page, script] = await Promise.all([
    read('play/blocks/index.html'),
    read('play/blocks/massing.js')
  ]);

  assert.match(page, /Scroll to change its height/);
  assert.match(script, /function suggestedCarryHeight/);
  assert.match(script, /new THREE\.Vector3\(0, 1, 0\)/);
  assert.match(script, /const CARRY_CLEARANCE = \.38/);
  assert.match(script, /const CARRY_LOOKAHEAD = \.22/);
  assert.match(script, /wheelAccumulator/);
  assert.match(script, /levelOffset/);
  assert.match(script, /function carriedSupports/);
  assert.match(script, /function updateCarriedSupports/);
  assert.match(script, /carryIgnore/);
  assert.match(script, /release to align/);
});

test('MASSING releases supports and stabilises every physics transition', async () => {
  const script = await read('play/blocks/massing.js');

  assert.match(script, /if \(piece\.hold\) releaseHold\(piece\.hold\)/);
  assert.match(script, /function wakeTouchingCluster/);
  assert.match(script, /for \(const piece of released\) wakeTouchingCluster\(piece\)/);
  assert.match(script, /const CARRY_FRICTION = \.025/);
  assert.match(script, /setFrictionCombineRule\(RAPIER\.CoefficientCombineRule\.Min\)/);
  assert.match(script, /setAdditionalSolverIterations\(SOLVER_ITERATIONS\)/);
  assert.match(script, /setCcdEnabled\(true\)/);
  assert.match(script, /numSolverIterations = 8/);
  assert.match(script, /numInternalPgsIterations = 2/);
  assert.match(script, /function recoverFallenPiece/);
  assert.match(script, /if \(piece\.hold\) releaseHold\(piece\.hold\)/);
  assert.match(script, /if \(interruptedCarry\) releaseSelected\(\)/);
});

test('MASSING draws its grid directly on the continuous cream floor', async () => {
  const script = await read('play/blocks/massing.js');

  assert.match(script, /scene\.background = new THREE\.Color\(0xf3f1ea\)/);
  assert.match(script, /floorMaterial = new THREE\.MeshBasicMaterial\(\{ color: 0xf3f1ea \}\)/);
  assert.match(script, /new THREE\.GridHelper\(14\.4, 24/);
  assert.match(script, /const FLOOR_LEVEL = \.04/);
  assert.match(script, /floorMesh\.position\.set\(0, FLOOR_LEVEL - \.04, -1\.5\)/);
  assert.match(script, /setTranslation\(0, FLOOR_LEVEL - \.08, -1\.5\)/);
  assert.doesNotMatch(script, /padMaterial|padMesh|padEdges/);
});

test('MASSING uses a coherent architectural kit of parts', async () => {
  const [script, shim] = await Promise.all([
    read('play/blocks/massing.js'),
    read('play/blocks/three-shim.js')
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
    read('play/blocks/massing.js'),
    read('play/blocks/massing.css')
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
    read('play/blocks/massing.js'),
    read('play/blocks/massing.css')
  ]);

  assert.match(script, /addEventListener\('pointerdown'/);
  assert.match(script, /stage\.addEventListener\('keydown'/);
  assert.match(script, /event\.key\.toLowerCase\(\) === 'r'/);
  assert.match(script, /event\.key === 'Enter'/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});

test('MASSING physics drops a removed load and lets unstable blocks finish settling', async () => {
  const script = await read('play/blocks/massing.js');
  const constant = (name) => {
    const match = script.match(new RegExp(`const ${name} = ([.\\d]+)`));
    assert.ok(match, `${name} is declared`);
    return Number(match[1]);
  };
  const { RAPIER } = await import('../stack/vendor/stack-deps.js');
  await RAPIER.init();

  const floorLevel = constant('FLOOR_LEVEL');
  const blockFriction = constant('BLOCK_FRICTION');
  const groundFriction = constant('GROUND_FRICTION');
  const carryFriction = constant('CARRY_FRICTION');
  const linearDamping = constant('LINEAR_DAMPING');
  const angularDamping = constant('ANGULAR_DAMPING');
  const solverIterations = constant('SOLVER_ITERATIONS');
  const softCcdPrediction = constant('SOFT_CCD_PREDICTION');
  const step = 1 / 120;

  const makeWorld = () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.integrationParameters.numSolverIterations = 8;
    world.integrationParameters.numInternalPgsIterations = 2;
    world.integrationParameters.maxCcdSubsteps = 2;
    const ground = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, floorLevel - .08, 0)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(8, .08, 8)
        .setFriction(groundFriction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
      ground
    );
    return world;
  };

  const addBlock = (world, size, position) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(...position)
        .setLinearDamping(linearDamping)
        .setAngularDamping(angularDamping)
        .setAdditionalSolverIterations(solverIterations)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(softCcdPrediction)
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        size[0] / 2 - .025,
        size[1] / 2 - .025,
        size[2] / 2 - .025,
        .025
      )
        .setDensity(1.1)
        .setFriction(blockFriction)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0),
      body
    );
    return { body, collider };
  };

  const run = (world, frames) => {
    for (let frame = 0; frame < frames; frame += 1) {
      world.timestep = step;
      world.step();
    }
  };

  const supportWorld = makeWorld();
  const support = addBlock(supportWorld, [2.4, 1.2, 1.2], [0, floorLevel + .6, 0]);
  const load = addBlock(supportWorld, [1.2, 1.2, 1.2], [0, floorLevel + 1.8 + .014, 0]);
  run(supportWorld, 480);
  support.collider.setFriction(carryFriction);
  support.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  load.body.wakeUp();
  for (let frame = 0; frame < 120; frame += 1) {
    support.body.setNextKinematicTranslation({
      x: 3 * frame / 119,
      y: support.body.translation().y,
      z: 0
    });
    supportWorld.timestep = step;
    supportWorld.step();
  }
  run(supportWorld, 480);
  assert.ok(load.body.translation().y < floorLevel + .72, 'the upper block reaches the ground');
  assert.ok(Math.abs(load.body.translation().x) < 1.1, 'the support does not carry the load away');
  assert.equal(load.body.isSleeping(), true, 'the fallen block comes to rest');
  supportWorld.free();

  const balanceWorld = makeWorld();
  addBlock(balanceWorld, [1.2, 1.2, 1.2], [0, floorLevel + .6, 0]);
  const unstable = addBlock(balanceWorld, [1.2, 1.2, 1.2], [.72, floorLevel + 1.8 + .014, 0]);
  run(balanceWorld, 1200);
  assert.ok(unstable.body.translation().y < floorLevel + .72, 'an unsupported centre of mass falls');
  assert.equal(unstable.body.isSleeping(), true, 'an unstable block does not slide indefinitely');
  balanceWorld.free();
});
