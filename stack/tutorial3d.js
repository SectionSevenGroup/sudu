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

  function planarGeometry(points, along, across, indices) {
    const vertices = points.flatMap(([u, v]) => [
      along.x * u + across.x * v,
      along.y * u + across.y * v,
      along.z * u + across.z * v
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  function cueMaterial() {
    return new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }

  function makeChevrons(along, across, faceCentre, height) {
    const width = height * .74;
    const pitch = width + height * .30;
    // The whole strip is outside its source face. Its first tail leaves a
    // deliberate air gap, and the sequence runs out along the face normal.
    const origin = faceCentre.clone().addScaledVector(along, .12 + width / 2);
    // One flat, continuous six-point silhouette. Squared ends, matched arms
    // and an exact central notch, with no overlapping rods or rounded joins.
    const geometry = planarGeometry([
      [-.5 * width, .5 * height],
      [-.18 * width, .5 * height],
      [.5 * width, 0],
      [-.18 * width, -.5 * height],
      [-.5 * width, -.5 * height],
      [.18 * width, 0]
    ], along, across, [0, 1, 5, 1, 2, 5, 5, 2, 3, 5, 3, 4]);
    const group = new THREE.Group();
    group.name = 'stack-face-chevrons';
    const materials = [];
    for (let i = 0; i < 3; i++) {
      const material = cueMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(origin).addScaledVector(along, i * pitch);
      mesh.renderOrder = 12;
      group.add(mesh);
      materials.push(material);
    }
    return { group, geometry, materials };
  }

  function makeCue(type, block) {
    const endSign = visibleSign(block, 'x', 1.5);
    const sideSign = visibleSign(block, 'z', .46);
    const up = new THREE.Vector3(0, 1, 0);
    const long = new THREE.Vector3(1, 0, 0);
    const cross = new THREE.Vector3(0, 0, 1);
    let faceOrigin, faceAlong, faceAcross, faceWidth, faceHeight;
    let arrowAlong, arrowAcross;

    if (type === 'end') {
      faceOrigin = new THREE.Vector3(endSign * 1.501, 0, 0);
      faceAlong = cross;
      faceAcross = up;
      faceWidth = .89;
      faceHeight = .346;
      // End: pull/push lengthwise, directly out from the end-face centre.
      arrowAlong = long.clone().multiplyScalar(endSign);
      arrowAcross = up;
    } else if (type === 'side') {
      faceOrigin = new THREE.Vector3(0, 0, sideSign * .461);
      faceAlong = long;
      faceAcross = up;
      faceWidth = 2.94;
      faceHeight = .346;
      // Side: pull/push across the width, directly out from the side centre.
      arrowAlong = cross.clone().multiplyScalar(sideSign);
      arrowAcross = up;
    } else {
      faceOrigin = new THREE.Vector3(0, .181, 0);
      faceAlong = long;
      faceAcross = cross;
      faceWidth = 2.94;
      faceHeight = .89;
      // Top: pull/push vertically, above the top-face centre. Pick a block
      // axis for the upright plane, keeping real perspective without a
      // camera-facing billboard or a flattened graphic on the wood.
      arrowAlong = up;
      const localCamera = block.worldToLocal(camera.position.clone());
      arrowAcross = Math.abs(localCamera.z) >= Math.abs(localCamera.x) ? long : cross;
    }

    const faceGeometry = planarGeometry([
      [-faceWidth / 2, -faceHeight / 2],
      [faceWidth / 2, -faceHeight / 2],
      [faceWidth / 2, faceHeight / 2],
      [-faceWidth / 2, faceHeight / 2]
    ], faceAlong, faceAcross, [0, 1, 2, 0, 2, 3]);
    const faceMaterial = cueMaterial();
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.copy(faceOrigin);
    face.renderOrder = 11;
    block.add(face);
    const arrows = makeChevrons(arrowAlong, arrowAcross, faceOrigin, .30);
    block.add(arrows.group);
    return { block, face, faceMaterial, arrows };
  }

  function removeActiveCue() {
    if (!activeCue) return;

    activeCue.block.remove(activeCue.face);
    activeCue.block.remove(activeCue.arrows.group);
    activeCue.face.geometry.dispose();
    activeCue.arrows.geometry.dispose();
    activeCue.faceMaterial.dispose();
    activeCue.arrows.materials.forEach(material => material.dispose());
    activeCue = null;
  }

  function setCue(type, block) {
    removeActiveCue();
    activeCue = makeCue(type, block);
  }

  function updateCue(now, startTime) {
    if (!activeCue) return;

    if (reducedMotion) {
      activeCue.faceMaterial.opacity = .16;
      activeCue.arrows.materials.forEach(material => { material.opacity = .88; });
      return;
    }

    const elapsed = now - startTime;
    const envelope = THREE.MathUtils.smoothstep(elapsed, 0, 180)
      * (1 - THREE.MathUtils.smoothstep(elapsed, PHASE_MS - 260, PHASE_MS));
    activeCue.faceMaterial.opacity = .18 * envelope;
    activeCue.arrows.materials.forEach((material, index) => {
      const local = elapsed - 120 - index * 320;
      const fadeIn = THREE.MathUtils.smoothstep(local, 0, 180);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(local, 280, 700);
      material.opacity = .94 * fadeIn * fadeOut;
    });
    // Position, scale and orientation never animate. Only opacity travels
    // from the first chevron to the third, along the block's physical axis.

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
