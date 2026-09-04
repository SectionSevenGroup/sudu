import * as THREE from '/stack/vendor/three-shim.js';

const shield = document.querySelector('#stack-cue-shield');
const help = document.querySelector('#stack-help');
const stage = document.querySelector('#stack-stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!shield || !stage) {
  throw new Error('STACK tutorial shell is missing');
}

const ACCENT = 0xef5b2a;
const PHASE_MS = reducedMotion ? 1100 : 1750;
const INITIAL_DELAY_MS = reducedMotion ? 250 : 550;
const registry = {
  blocks: [],
  camera: null
};

const originalSceneAdd = THREE.Scene.prototype.add;
const originalLookAt = THREE.PerspectiveCamera.prototype.lookAt;

// Capture the actual block groups and actual camera used by stack.js.
// The cue is physically parented to a real block face, so it inherits the
// block's true perspective, scale, settling and occlusion.
if (!window.__stackLiveCuePatched) {
  window.__stackLiveCuePatched = true;

  THREE.Scene.prototype.add = function (...objects) {
    for (const object of objects) {
      const blockIndex = object?.children?.[0]?.userData?.blockIndex;
      if (Number.isInteger(blockIndex)) registry.blocks[blockIndex] = object;
    }
    return originalSceneAdd.apply(this, objects);
  };

  // WebGLRenderer.render is an instance method in this Three build, so a
  // prototype patch there never saw the live camera. Camera.lookAt is called
  // by STACK on setup and every orbit frame, making it the reliable hook.
  THREE.PerspectiveCamera.prototype.lookAt = function (...args) {
    registry.camera = this;
    return originalLookAt.apply(this, args);
  };
}

const chevron = document.createElement('div');
chevron.className = 'stack-live-chevron';
chevron.setAttribute('aria-hidden', 'true');
shield.append(chevron);

let running = false;
let activeCue = null;
let frameId = 0;
let initialPlayed = false;
let initialTimer = 0;

function blockAt(course, slot) {
  return registry.blocks[course * 3 + slot] || null;
}

function screenPoint(world) {
  const projected = world.clone().project(registry.camera);
  const rect = stage.getBoundingClientRect();
  return {
    x: rect.left + (projected.x * .5 + .5) * rect.width,
    y: rect.top + (-projected.y * .5 + .5) * rect.height
  };
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

function makeHighlight(type, group) {
  let geometry;
  let position;
  let normal;

  if (type === 'end') {
    const sign = visibleSign(group, 'x', 1.5);
    geometry = new THREE.BoxGeometry(.028, .346, .89);
    position = new THREE.Vector3(sign * 1.518, 0, 0);
    normal = new THREE.Vector3(sign, 0, 0);
  } else if (type === 'side') {
    const sign = visibleSign(group, 'z', .46);
    geometry = new THREE.BoxGeometry(2.94, .346, .028);
    position = new THREE.Vector3(0, 0, sign * .472);
    normal = new THREE.Vector3(0, 0, sign);
  } else {
    geometry = new THREE.BoxGeometry(2.94, .028, .89);
    position = new THREE.Vector3(0, .192, 0);
    normal = new THREE.Vector3(0, 1, 0);
  }

  const material = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.renderOrder = 10;
  group.add(mesh);

  return { type, group, mesh, material, localCentre: position, localNormal: normal };
}

function chevronMarkup(type) {
  if (type === 'top') {
    return '<svg viewBox="0 0 72 30" aria-hidden="true"><path d="M42 6 54 15 42 24"/><path d="M28 6 40 15 28 24"/></svg>';
  }
  return '<svg viewBox="0 0 86 30" aria-hidden="true"><path d="M22 6 10 15 22 24"/><path d="M64 6 76 15 64 24"/></svg>';
}

function removeActiveCue() {
  if (!activeCue) return;
  activeCue.group.remove(activeCue.mesh);
  activeCue.mesh.geometry.dispose();
  activeCue.material.dispose();
  activeCue = null;
  chevron.style.opacity = '0';
}

function setCue(type, block) {
  removeActiveCue();
  activeCue = makeHighlight(type, block);
  chevron.innerHTML = chevronMarkup(type);
  chevron.classList.toggle('is-one-way', type === 'top');
}

function updateCue(now, startTime) {
  if (!activeCue || !registry.camera) return;

  const phase = Math.min(1, Math.max(0, (now - startTime) / PHASE_MS));
  const pulse = reducedMotion ? .88 : Math.sin(Math.PI * phase);
  activeCue.material.opacity = .18 + pulse * .48;

  const centreWorld = activeCue.group.localToWorld(activeCue.localCentre.clone());
  const outwardLocal = activeCue.localCentre.clone().addScaledVector(activeCue.localNormal, .82);
  const outwardWorld = activeCue.group.localToWorld(outwardLocal);
  const centre = screenPoint(centreWorld);
  const outward = screenPoint(outwardWorld);
  let dx = outward.x - centre.x;
  let dy = outward.y - centre.y;
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;

  const offset = activeCue.type === 'top' ? 34 : 30;
  const travel = reducedMotion ? 0 : (activeCue.type === 'top' ? pulse * 8 : Math.sin(phase * Math.PI * 2) * 4);
  const x = centre.x + dx * offset;
  const y = centre.y + dy * offset;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  chevron.style.left = `${x}px`;
  chevron.style.top = `${y}px`;
  chevron.style.opacity = `${.38 + pulse * .62}`;
  chevron.style.transform = `translate(-50%, -50%) rotate(${angle}deg) translateX(${travel}px)`;
}

function stopTutorial() {
  cancelAnimationFrame(frameId);
  running = false;
  removeActiveCue();
  shield.classList.remove('is-active');
  document.body.classList.remove('stack-cue-open');
  stage.focus({ preventScroll: true });
}

function playStep(step) {
  const targets = [
    // A genuinely exposed end face around mid-height.
    { type: 'end', block: blockAt(13, 2) },
    // A visible long face on the front side of the tower.
    { type: 'side', block: blockAt(12, 2) },
    // A real upper top face for the lift cue.
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
  if (!registry.camera || registry.blocks.filter(Boolean).length < 72) return false;
  stopTutorial();
  running = true;
  shield.classList.add('is-active');
  document.body.classList.add('stack-cue-open');
  playStep(0);
  return true;
}

function waitForTower() {
  if (initialPlayed) return;

  if (registry.camera && registry.blocks.filter(Boolean).length >= 72) {
    initialPlayed = true;
    initialTimer = window.setTimeout(() => startTutorial(), INITIAL_DELAY_MS);
    return;
  }

  requestAnimationFrame(waitForTower);
}

help?.addEventListener('click', event => {
  event.preventDefault();
  window.clearTimeout(initialTimer);
  if (!startTutorial()) requestAnimationFrame(startTutorial);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && running) stopTutorial();
});

requestAnimationFrame(waitForTower);
