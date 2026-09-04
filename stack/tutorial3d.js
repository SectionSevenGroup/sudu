import * as THREE from '/stack/vendor/three-shim.js';

const shield = document.querySelector('#stack-cue-shield');
const help = document.querySelector('#stack-help');
const stage = document.querySelector('#stack-stage');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!shield || !stage) {
  throw new Error('STACK tutorial shell is missing');
}

const ACCENT = 0xef5b2a;
const PHASE_MS = reducedMotion ? 1050 : 1650;
const registry = {
  blocks: [],
  camera: null,
  renderer: null
};

const originalSceneAdd = THREE.Scene.prototype.add;
const originalRender = THREE.WebGLRenderer.prototype.render;

// Capture the actual block groups created by stack.js. The tutorial never
// redraws the tower. It adds a temporary face layer directly to a real block.
if (!window.__stackLiveCuePatched) {
  window.__stackLiveCuePatched = true;

  THREE.Scene.prototype.add = function (...objects) {
    for (const object of objects) {
      const blockIndex = object?.children?.[0]?.userData?.blockIndex;
      if (Number.isInteger(blockIndex)) registry.blocks[blockIndex] = object;
    }
    return originalSceneAdd.apply(this, objects);
  };

  THREE.WebGLRenderer.prototype.render = function (scene, camera) {
    registry.camera = camera;
    registry.renderer = this;
    return originalRender.call(this, scene, camera);
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

function blockAt(course, slot) {
  return registry.blocks[course * 3 + slot] || null;
}

function screenPoint(world) {
  const projected = world.clone().project(registry.camera);
  return {
    x: (projected.x * .5 + .5) * innerWidth,
    y: (-projected.y * .5 + .5) * innerHeight
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
    geometry = new THREE.BoxGeometry(.026, .348, .90);
    position = new THREE.Vector3(sign * 1.515, 0, 0);
    normal = new THREE.Vector3(sign, 0, 0);
  } else if (type === 'side') {
    const sign = visibleSign(group, 'z', .46);
    geometry = new THREE.BoxGeometry(2.96, .348, .026);
    position = new THREE.Vector3(0, 0, sign * .468);
    normal = new THREE.Vector3(0, 0, sign);
  } else {
    geometry = new THREE.BoxGeometry(2.96, .026, .90);
    position = new THREE.Vector3(0, .188, 0);
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
  const pulse = reducedMotion ? .82 : Math.sin(Math.PI * phase);
  activeCue.material.opacity = .10 + pulse * .44;

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

  const offset = activeCue.type === 'top' ? 30 : 27;
  const travel = reducedMotion ? 0 : (activeCue.type === 'top' ? pulse * 7 : Math.sin(phase * Math.PI * 2) * 3);
  const x = centre.x + dx * offset;
  const y = centre.y + dy * offset;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  chevron.style.left = `${x}px`;
  chevron.style.top = `${y}px`;
  chevron.style.opacity = `${.26 + pulse * .74}`;
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
  // These are deliberately visible, exposed faces in the default camera:
  // an end on a front corner block, the long side of a front-row block, then
  // the top face of an upper block. The highlight is physically parented to
  // that exact live block so perspective and any tiny settling stay correct.
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
  if (!registry.camera || registry.blocks.filter(Boolean).length < 72) return false;
  stopTutorial();
  running = true;
  shield.classList.add('is-active');
  document.body.classList.add('stack-cue-open');
  playStep(0);
  return true;
}

function waitForTower() {
  if (!initialPlayed && startTutorial()) {
    initialPlayed = true;
    return;
  }
  requestAnimationFrame(waitForTower);
}

help?.addEventListener('click', event => {
  event.preventDefault();
  if (!startTutorial()) requestAnimationFrame(startTutorial);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && running) stopTutorial();
});

requestAnimationFrame(waitForTower);
