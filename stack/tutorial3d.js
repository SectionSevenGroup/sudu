// The runtime supplies its actual camera and blocks. Cues share its lifecycle.
export function createTutorial(THREE, { stage, getBlocks, camera, isGameOver, isInteracting, reducedMotion }) {
  const shield = document.querySelector('#stack-cue-shield');
  const help = document.querySelector('#stack-help');
  const ACCENT = 0xef5b2a;
  const PHASE_MS = reducedMotion ? 1100 : 1750;
  let initialAt = performance.now() + (reducedMotion ? 250 : 550);
  let running = false;
  let activeCue = null;
  let currentStep = 0;
  let stepStarted = 0;

  function blockAt(course, slot) {
    return getBlocks()[course * 3 + slot]?.group || null;
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
    return camera.position.distanceTo(plusWorld) <= camera.position.distanceTo(minusWorld) ? 1 : -1;
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
    running = false;
    removeActiveCue();
    shield.classList.remove('is-active');
    document.body.classList.remove('stack-cue-open');
  }

  function playStep(step) {
    const targets = [
      { type: 'end', block: blockAt(13, 2) },
      { type: 'side', block: blockAt(12, 2) },
      { type: 'top', block: blockAt(23, 1) }
    ];
    const target = targets[step];
    if (!target?.block) return stopTutorial();
    currentStep = step;
    stepStarted = performance.now();
    setCue(target.type, target.block);
  }

  function startTutorial() {
    if (isGameOver() || getBlocks().length < 72 || isInteracting()) return;
    stopTutorial();
    running = true;
    shield.classList.add('is-active');
    document.body.classList.add('stack-cue-open');
    playStep(0);
  }

  function onHelp() {
    initialAt = 0;
    startTutorial();
  }

  function onPointer() {
    initialAt = 0;
    stopTutorial();
  }

  function onKey(event) {
    if (event.key === 'Escape' && running) stopTutorial();
  }

  help?.addEventListener('click', onHelp);
  stage.addEventListener('pointerdown', onPointer);
  stage.addEventListener('keydown', onKey);

  return {
    update(now) {
      if (initialAt && now >= initialAt) {
        initialAt = 0;
        startTutorial();
      }
      if (!running) return;
      updateCue(now, stepStarted);
      if (now - stepStarted >= PHASE_MS) {
        if (currentStep < 2) playStep(currentStep + 1);
        else stopTutorial();
      }
    },
    stop: onPointer,
    dispose() {
      stopTutorial();
      help?.removeEventListener('click', onHelp);
      stage.removeEventListener('pointerdown', onPointer);
      stage.removeEventListener('keydown', onKey);
    }
  };
}
