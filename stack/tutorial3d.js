import * as THREE from '/stack/vendor/three-shim.js';

const shield = document.querySelector('#stack-cue-shield');
const help = document.querySelector('#stack-help');
const again = document.querySelector('#again');
const stage = document.querySelector('#stack-stage');
const moveCount = document.querySelector('#move-count');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!shield || !stage) {
  throw new Error('STACK tutorial shell is missing');
}

const ACCENT = 0xef5b2a;
const PHASE_MS = reducedMotion ? 1100 : 1750;
const INITIAL_DELAY_MS = reducedMotion ? 250 : 550;
const COLLAPSE_HOLD_MS = reducedMotion ? 500 : 650;
const FALL_DROP = .78;
const FLOOR_Y = .62;
const registry = {
  blocks: [],
  camera: null
};

const originalSceneAdd = THREE.Scene.prototype.add;
const originalLookAt = THREE.PerspectiveCamera.prototype.lookAt;

// Capture the actual block groups and actual camera used by stack.js.
// Every cue is physically parented to a real block, so face colour and
// chevrons inherit its exact perspective, scale, settling and occlusion.
if (!window.__stackLiveCuePatched) {
  window.__stackLiveCuePatched = true;

  THREE.Scene.prototype.add = function (...objects) {
    for (const object of objects) {
      const blockIndex = object?.children?.[0]?.userData?.blockIndex;
      if (Number.isInteger(blockIndex)) registry.blocks[blockIndex] = object;
    }
    return originalSceneAdd.apply(this, objects);
  };

  THREE.PerspectiveCamera.prototype.lookAt = function (...args) {
    registry.camera = this;
    return originalLookAt.apply(this, args);
  };
}

let running = false;
let activeCue = null;
let frameId = 0;
let initialPlayed = false;
let initialTimer = 0;

function blockAt(course, slot) {
  return registry.blocks[course * 3 + slot] || null;
}

function visibleSign(group, axis, half) {
  const plus = new THREE.Vector3(
    axis === 'x' ? half : 0,
    axis === 'y' ? half : 0,
    axis === 'z' ? half : 0
  );
  const minus = plus.clone().multiplyScalar(-1);
  const plusWorld = group.localToWorld(plus.clone());
  const minusWorld = group.localToWorld(minus.clone());
  return registry.camera.position.distanceTo(plusWorld) <= registry.camera.position.distanceTo(minusWorld) ? 1 : -1;
}

function barBetween(a, b, thickness, material) {
  const direction = b.clone().sub(a);
  const length = direction.length();
  const midpoint = a.clone().add(b).multiplyScalar(.5);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.copy(midpoint);
  mesh.scale.set(length, thickness, thickness);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  mesh.renderOrder = 12;
  return mesh;
}

function makeDoubleChevron(direction, perpendicular, origin, scale, material) {
  const group = new THREE.Group();
  const parts = [];
  const dir = direction.clone().normalize();
  const perp = perpendicular.clone().normalize();
  const headDepth = scale * .34;
  const halfHeight = scale * .28;
  const thickness = scale * .125;
  const spacing = scale * .31;

  for (let i = 0; i < 2; i++) {
    const tip = origin.clone().addScaledVector(dir, i * spacing);
    const centreBack = tip.clone().addScaledVector(dir, -headDepth);
    const upper = centreBack.clone().addScaledVector(perp, halfHeight);
    const lower = centreBack.clone().addScaledVector(perp, -halfHeight);
    const upperBar = barBetween(upper, tip, thickness, material);
    const lowerBar = barBetween(lower, tip, thickness, material);
    group.add(upperBar, lowerBar);
    parts.push(upperBar, lowerBar);
  }

  return { group, parts };
}

function makeCue(type, block) {
  let faceGeometry;
  let facePosition;
  let direction;
  let perpendicular;
  let arrowOrigin;
  let arrowScale;

  if (type === 'end') {
    const sign = visibleSign(block, 'x', 1.5);
    direction = new THREE.Vector3(sign, 0, 0);
    perpendicular = new THREE.Vector3(0, 1, 0);
    faceGeometry = new THREE.BoxGeometry(.028, .346, .89);
    facePosition = new THREE.Vector3(sign * 1.518, 0, 0);
    arrowOrigin = facePosition.clone().addScaledVector(direction, .32);
    arrowScale = .52;
  } else if (type === 'side') {
    const sign = visibleSign(block, 'z', .46);
    direction = new THREE.Vector3(0, 0, sign);
    perpendicular = new THREE.Vector3(0, 1, 0);
    faceGeometry = new THREE.BoxGeometry(2.94, .346, .028);
    facePosition = new THREE.Vector3(0, 0, sign * .472);
    arrowOrigin = facePosition.clone().addScaledVector(direction, .28);
    arrowScale = .48;
  } else {
    direction = new THREE.Vector3(0, 1, 0);
    perpendicular = new THREE.Vector3(1, 0, 0);
    faceGeometry = new THREE.BoxGeometry(2.94, .028, .89);
    facePosition = new THREE.Vector3(0, .192, 0);
    arrowOrigin = facePosition.clone().addScaledVector(direction, .34);
    arrowScale = .52;
  }

  const faceMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false
  });
  const arrowMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false
  });

  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.copy(facePosition);
  face.renderOrder = 11;
  block.add(face);

  const arrows = makeDoubleChevron(direction, perpendicular, arrowOrigin, arrowScale, arrowMaterial);
  block.add(arrows.group);

  return {
    type,
    block,
    face,
    faceMaterial,
    arrowMaterial,
    arrowGroup: arrows.group,
    arrowParts: arrows.parts,
    arrowBase: arrows.group.position.clone(),
    direction
  };
}

function removeActiveCue() {
  if (!activeCue) return;

  activeCue.block.remove(activeCue.face);
  activeCue.block.remove(activeCue.arrowGroup);
  activeCue.face.geometry.dispose();
  activeCue.arrowParts.forEach(part => part.geometry.dispose());
  activeCue.faceMaterial.dispose();
  activeCue.arrowMaterial.dispose();
  activeCue = null;
}

function setCue(type, block) {
  removeActiveCue();
  activeCue = makeCue(type, block);
}

function updateCue(now, startTime) {
  if (!activeCue) return;

  const phase = Math.min(1, Math.max(0, (now - startTime) / PHASE_MS));
  const pulse = reducedMotion ? .88 : Math.sin(Math.PI * phase);
  const travel = reducedMotion ? 0 : Math.sin(phase * Math.PI * 2) * .055;

  activeCue.faceMaterial.opacity = .16 + pulse * .50;
  activeCue.arrowMaterial.opacity = .44 + pulse * .56;
  activeCue.arrowGroup.position.copy(activeCue.arrowBase).addScaledVector(activeCue.direction, travel);
}

function stopTutorial() {
  cancelAnimationFrame(frameId);
  running = false;
  removeActiveCue();
  shield.classList.remove('is-active');
  document.body.classList.remove('stack-cue-open');
  if (!document.body.classList.contains('stack-game-over')) stage.focus({ preventScroll: true });
}

function playStep(step) {
  const targets = [
    { type: 'end', block: blockAt(13, 2) },
    { type: 'side', block: blockAt(12, 2) },
    { type: 'top', block: blockAt(23, 1) }
  ];
  const target = targets[step];

  if (!target?.block) {
    stopTutorial();
    return;
  }

  setCue(target.type, target.block);
  const started = performance.now();

  function animate(now) {
    if (!running) return;
    updateCue(now, started);
    if (now - started >= PHASE_MS) {
      if (step < targets.length - 1) playStep(step + 1);
      else stopTutorial();
      return;
    }
    frameId = requestAnimationFrame(animate);
  }

  frameId = requestAnimationFrame(animate);
}

function startTutorial() {
  if (document.body.classList.contains('stack-game-over')) return false;
  if (!registry.camera || registry.blocks.filter(Boolean).length < 72) return false;
  stopTutorial();
  running = true;
  shield.classList.add('is-active');
  document.body.classList.add('stack-cue-open');
  playStep(0);
  return true;
}

/* --------------------------------------------------------------------------
   Collapse detection

   The game ends only when part of the original tower actually falls.
   Touching, sliding, rotating, extracting, carrying and placing blocks are
   never failure states. A genuine partial/full collapse requires at least two
   original, non-relocated tower blocks to drop substantially below the height
   where they began, and that condition must persist briefly.
---------------------------------------------------------------------------- */
const homeSnapshots = new Map();
const relocated = new Set();
let homeReady = false;
let towerInteracted = false;
let collapseSent = false;
let collapseCandidateSince = 0;
let detectorFrame = 0;
let resetCaptureTimer = 0;
let lastMoveCount = 0;
let initialTop = 0;

function readMoveCount() {
  return Number.parseInt(moveCount?.textContent || '', 10) || 0;
}

function captureHomes() {
  if (registry.blocks.filter(Boolean).length < 72) return false;

  homeSnapshots.clear();
  relocated.clear();
  initialTop = -Infinity;

  registry.blocks.forEach((group, index) => {
    if (!group) return;
    homeSnapshots.set(index, {
      x: group.position.x,
      y: group.position.y,
      z: group.position.z
    });
    initialTop = Math.max(initialTop, group.position.y);
  });

  homeReady = homeSnapshots.size >= 72;
  lastMoveCount = readMoveCount();
  return homeReady;
}

function markPlacedBlock() {
  if (!homeReady) return;

  let bestIndex = null;
  let bestScore = .34;

  registry.blocks.forEach((group, index) => {
    if (!group || relocated.has(index)) return;
    const home = homeSnapshots.get(index);
    if (!home) return;

    if (group.position.y < initialTop - .28) return;

    const dx = group.position.x - home.x;
    const dy = group.position.y - home.y;
    const dz = group.position.z - home.z;
    const distance = Math.hypot(dx, dy, dz);
    const score = distance + Math.max(0, group.position.y - initialTop) * 1.5;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestIndex != null) relocated.add(bestIndex);
}

function syncPlacedBlocks() {
  const nextMoves = readMoveCount();

  if (nextMoves > lastMoveCount) {
    for (let move = lastMoveCount; move < nextMoves; move++) markPlacedBlock();
    towerInteracted = true;
  }

  lastMoveCount = nextMoves;
}

function collapseMetrics() {
  let fallenBlocks = 0;
  let floorBlocks = 0;
  let deepestDrop = 0;

  registry.blocks.forEach((group, index) => {
    if (!group || relocated.has(index)) return;
    const home = homeSnapshots.get(index);
    if (!home) return;

    const drop = home.y - group.position.y;
    deepestDrop = Math.max(deepestDrop, drop);

    if (drop >= FALL_DROP) fallenBlocks++;
    if (home.y > 1.0 && group.position.y <= FLOOR_Y) floorBlocks++;
  });

  const failed = fallenBlocks >= 2 || floorBlocks >= 2;
  return { failed, fallenBlocks, floorBlocks, deepestDrop };
}

function runCollapseDetector(now) {
  detectorFrame = requestAnimationFrame(runCollapseDetector);

  if (!homeReady || !towerInteracted || collapseSent || running || document.body.classList.contains('stack-game-over')) {
    collapseCandidateSince = 0;
    return;
  }

  syncPlacedBlocks();
  const metrics = collapseMetrics();

  if (!metrics.failed) {
    collapseCandidateSince = 0;
    return;
  }

  if (!collapseCandidateSince) collapseCandidateSince = now;
  if (now - collapseCandidateSince < COLLAPSE_HOLD_MS) return;

  collapseSent = true;
  stopTutorial();
  window.dispatchEvent(new CustomEvent('stack:gamecollapse', { detail: metrics }));
}

stage.addEventListener('pointerdown', () => {
  requestAnimationFrame(() => {
    if (stage.classList.contains('is-dragging')) towerInteracted = true;
  });
});

if (moveCount) {
  new MutationObserver(syncPlacedBlocks).observe(moveCount, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function prepareInitialTower() {
  if (!captureHomes()) {
    requestAnimationFrame(prepareInitialTower);
    return;
  }

  if (!initialPlayed) {
    initialPlayed = true;
    initialTimer = window.setTimeout(() => startTutorial(), INITIAL_DELAY_MS);
  }
}

help?.addEventListener('click', event => {
  event.preventDefault();
  window.clearTimeout(initialTimer);
  if (!startTutorial()) requestAnimationFrame(startTutorial);
});

again?.addEventListener('click', () => {
  window.clearTimeout(initialTimer);
  window.clearTimeout(resetCaptureTimer);
  if (running) stopTutorial();

  homeReady = false;
  towerInteracted = false;
  collapseSent = false;
  collapseCandidateSince = 0;
  lastMoveCount = 0;
  relocated.clear();
  homeSnapshots.clear();

  resetCaptureTimer = window.setTimeout(() => {
    captureHomes();
  }, 650);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && running) stopTutorial();
});

requestAnimationFrame(prepareInitialTower);
detectorFrame = requestAnimationFrame(runCollapseDetector);