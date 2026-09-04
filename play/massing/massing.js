const stage = document.querySelector('#massing-stage');
const loading = stage?.querySelector('.massing-loading');
const instruction = document.querySelector('.massing-instruction');
const selectionLabel = document.querySelector('#massing-selection');
const turnButton = document.querySelector('#massing-turn');
const upButton = document.querySelector('#massing-up');
const downButton = document.querySelector('#massing-down');
const viewButton = document.querySelector('#massing-view');
const again = document.querySelector('#again');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!stage || !loading) throw new Error('MASSING stage is unavailable.');

Promise.all([
  import('/play/massing/three-shim.js'),
  import('/stack/vendor/rapier-shim.js')
]).then(async ([THREE, RAPIER]) => {
  await RAPIER.init();
  loading.remove();

  const PHYSICS_STEP = 1 / 120;
  const GRID = .4;
  const EDGE_RADIUS = .025;
  const SNAP_GAP = .014;
  const DRAG_THRESHOLD = 5;
  const MAX_CARRY_SPEED = 3;
  const MAX_HORIZONTAL_SPEED = 1.15;
  const MAX_RISE_SPEED = 1.6;
  const MAX_FALL_SPEED = 3.2;
  const MAX_ANGULAR_SPEED = 4;
  const CONTROL_MOVE_SPEED = 1.6;
  const CONTROL_TURN_SPEED = Math.PI * 1.2;
  const MIN_ELEVATION = THREE.MathUtils.degToRad(4);
  const MAX_ELEVATION = THREE.MathUtils.degToRad(84);
  const MODEL_ELEVATION = THREE.MathUtils.degToRad(30);
  const TOP_ELEVATION = THREE.MathUtils.degToRad(84);
  const MODEL_RADIUS = 27.5;
  const TOP_RADIUS = 24.5;

  const BLOCKS = [
    { name: 'bar 01', halfHeight: .6, position: [-7, .64, -9], shapes: [{ at: [0, 0, 0], size: [6, 1.2, 1.2] }] },
    { name: 'bar 02', halfHeight: .6, position: [0, .64, -9], shapes: [{ at: [0, 0, 0], size: [6, 1.2, 1.2] }] },
    { name: 'bar 03', halfHeight: .6, position: [7, .64, -9], shapes: [{ at: [0, 0, 0], size: [6, 1.2, 1.2] }] },
    { name: 'plate 01', halfHeight: .2, position: [-7, .24, 8.3], shapes: [{ at: [0, 0, 0], size: [6, .4, 3.2] }] },
    { name: 'plate 02', halfHeight: .2, position: [0, .24, 8.3], shapes: [{ at: [0, 0, 0], size: [6, .4, 3.2] }] },
    { name: 'plate 03', halfHeight: .2, position: [7, .24, 8.3], shapes: [{ at: [0, 0, 0], size: [6, .4, 3.2] }] },
    { name: 'room 01', halfHeight: 1.2, position: [-9.2, 1.24, -4.1], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'room 02', halfHeight: 1.2, position: [-9.2, 1.24, 0], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'room 03', halfHeight: 1.2, position: [-9.2, 1.24, 4.1], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'room 04', halfHeight: 1.2, position: [9.2, 1.24, -4.1], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'room 05', halfHeight: 1.2, position: [9.2, 1.24, 0], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'room 06', halfHeight: 1.2, position: [9.2, 1.24, 4.1], shapes: [{ at: [0, 0, 0], size: [4, 2.4, 3.2] }] },
    { name: 'core 01', halfHeight: 1.6, position: [-12.4, 1.64, 7.8], shapes: [{ at: [0, 0, 0], size: [1.6, 3.2, 1.6] }] },
    { name: 'core 02', halfHeight: 1.6, position: [12.4, 1.64, 7.8], shapes: [{ at: [0, 0, 0], size: [1.6, 3.2, 1.6] }] },
    {
      name: 'portal 01',
      halfHeight: 1.6,
      position: [0, 1.64, -12.2],
      shapes: [
        { at: [-2.4, 0, 0], size: [.8, 3.2, 1.2] },
        { at: [2.4, 0, 0], size: [.8, 3.2, 1.2] },
        { at: [0, 1.2, 0], size: [5.6, .8, 1.2] }
      ]
    },
    {
      name: 'corner 01',
      halfHeight: .8,
      position: [-7.1, .84, -13],
      shapes: [
        { at: [0, 0, -1.2], size: [5.2, 1.6, 1.2] },
        { at: [-2, 0, .8], size: [1.2, 1.6, 4] }
      ]
    },
    {
      name: 'corner 02',
      halfHeight: .8,
      position: [7.1, .84, -13],
      rotation: Math.PI,
      shapes: [
        { at: [0, 0, -1.2], size: [5.2, 1.6, 1.2] },
        { at: [-2, 0, .8], size: [1.2, 1.6, 4] }
      ]
    }
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ea);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);

  const requestedLens = Number(new URLSearchParams(location.search).get('lens'));
  const focalLength = [16, 18, 22].includes(requestedLens) ? requestedLens : 18;
  const verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * focalLength)));
  const camera = new THREE.PerspectiveCamera(verticalFov, 1, .1, 120);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const carryPlane = new THREE.Plane();
  const carryPoint = new THREE.Vector3();
  const meshes = [];

  const orbitTarget = new THREE.Vector3(0, 1.35, -1.25);
  let orbitAzimuth = THREE.MathUtils.degToRad(40);
  let orbitElevation = MODEL_ELEVATION;
  let orbitTargetAzimuth = orbitAzimuth;
  let orbitTargetElevation = orbitElevation;
  let orbitRadius = MODEL_RADIUS;
  let orbitTargetRadius = orbitRadius;
  let orbitMinRadius = 17;
  let orbitMaxRadius = 36;
  let cameraConfigured = false;
  let topView = false;
  let orbitGesture = null;
  let orbitVelocityAzimuth = 0;
  let orbitVelocityElevation = 0;

  let world;
  let pieces = [];
  let active = null;
  let selected = null;
  let snapCandidate = null;
  let hovered = null;
  let last = performance.now();
  let accumulator = 0;
  let animationFrame = 0;
  let destroyed = false;

  const faceMaterial = new THREE.MeshBasicMaterial({
    color: 0xf3f1ea,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .72 });
  const hoverMaterial = new THREE.LineBasicMaterial({ color: 0x171613, transparent: true, opacity: 1 });
  const selectedMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: 1 });
  const snapMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: .72, depthTest: false });
  const ghostMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .12 });
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf1efe8 });
  const padMaterial = new THREE.MeshBasicMaterial({ color: 0xf7f5ef, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const padEdgeMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .18 });

  const floorGeometry = new THREE.BoxGeometry(36, .08, 34);
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.position.set(0, -.08, -1.5);
  scene.add(floorMesh);

  const padGeometry = new THREE.BoxGeometry(12, .035, 12);
  const padMesh = new THREE.Mesh(padGeometry, padMaterial);
  padMesh.position.set(0, -.01, 0);
  scene.add(padMesh);
  const padEdges = new THREE.LineSegments(new THREE.EdgesGeometry(padGeometry, 18), padEdgeMaterial);
  padEdges.position.copy(padMesh.position);
  scene.add(padEdges);

  const grid = new THREE.GridHelper(12, 30, 0x24231f, 0x24231f);
  grid.position.set(0, .014, 0);
  grid.material.transparent = true;
  grid.material.opacity = .075;
  scene.add(grid);

  const snapGuide = new THREE.Group();
  snapGuide.visible = false;
  snapGuide.renderOrder = 8;
  scene.add(snapGuide);

  function setInstruction(text) {
    if (instruction) instruction.textContent = text;
  }

  function updateCamera() {
    const horizontal = orbitRadius * Math.cos(orbitElevation);
    camera.position.set(
      orbitTarget.x + Math.sin(orbitAzimuth) * horizontal,
      orbitTarget.y + Math.sin(orbitElevation) * orbitRadius,
      orbitTarget.z + Math.cos(orbitAzimuth) * horizontal
    );
    camera.lookAt(orbitTarget);
  }

  function configureCamera() {
    const phone = innerWidth < 641;
    const tablet = innerWidth < 980;
    orbitMinRadius = phone ? 18.5 : tablet ? 18 : 17;
    orbitMaxRadius = phone ? 34 : tablet ? 35 : 36;

    if (!cameraConfigured) {
      orbitRadius = phone ? 25 : tablet ? 26 : MODEL_RADIUS;
      orbitTargetRadius = orbitRadius;
      cameraConfigured = true;
    } else {
      orbitRadius = THREE.MathUtils.clamp(orbitRadius, orbitMinRadius, orbitMaxRadius);
      orbitTargetRadius = THREE.MathUtils.clamp(orbitTargetRadius, orbitMinRadius, orbitMaxRadius);
    }
    updateCamera();
  }

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    configureCamera();
  }

  function setPieceEdges(piece, material) {
    for (const edge of piece.edges) edge.material = material;
  }

  function setHover(piece) {
    if (hovered === piece) return;
    if (hovered && hovered !== selected) setPieceEdges(hovered, edgeMaterial);
    hovered = piece;
    if (hovered && hovered !== selected) setPieceEdges(hovered, hoverMaterial);
    stage.classList.toggle('is-hovering', !!hovered);
  }

  function updateSelectionUI() {
    const enabled = !!selected;
    if (selectionLabel) selectionLabel.textContent = selected?.name || '';
    for (const button of [turnButton, upButton, downButton]) {
      if (button) button.disabled = !enabled;
    }
  }

  function bodyPosition(piece) {
    const position = piece.body.translation();
    return new THREE.Vector3(position.x, position.y, position.z);
  }

  function uprightRotation(piece) {
    const rotation = piece.body.rotation();
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const longAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const yaw = Math.atan2(-longAxis.z, longAxis.x);
    const quarterTurn = Math.PI / 2;
    const snappedYaw = Math.round(yaw / quarterTurn) * quarterTurn;
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), snappedYaw);
  }

  function clearSnapGuide() {
    snapCandidate = null;
    snapGuide.visible = false;
    while (snapGuide.children.length) snapGuide.remove(snapGuide.children[0]);
  }

  function prepareSnapGuide(piece) {
    clearSnapGuide();
    for (const shape of piece.shapes) {
      const outline = new THREE.LineSegments(shape.outlineGeometry, snapMaterial);
      outline.position.set(...shape.at);
      snapGuide.add(outline);
    }
  }

  function getWorldBounds(shapes, position, rotation) {
    const bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity
    };
    const corner = new THREE.Vector3();

    for (const shape of shapes) {
      const [width, height, depth] = shape.size;
      const [offsetX, offsetY, offsetZ] = shape.at;
      for (const sideX of [-1, 1]) {
        for (const sideY of [-1, 1]) {
          for (const sideZ of [-1, 1]) {
            corner.set(
              offsetX + sideX * width / 2,
              offsetY + sideY * height / 2,
              offsetZ + sideZ * depth / 2
            ).applyQuaternion(rotation).add(position);
            bounds.minX = Math.min(bounds.minX, corner.x);
            bounds.maxX = Math.max(bounds.maxX, corner.x);
            bounds.minY = Math.min(bounds.minY, corner.y);
            bounds.maxY = Math.max(bounds.maxY, corner.y);
            bounds.minZ = Math.min(bounds.minZ, corner.z);
            bounds.maxZ = Math.max(bounds.maxZ, corner.z);
          }
        }
      }
    }

    bounds.centreX = (bounds.minX + bounds.maxX) / 2;
    bounds.centreZ = (bounds.minZ + bounds.maxZ) / 2;
    bounds.width = bounds.maxX - bounds.minX;
    bounds.depth = bounds.maxZ - bounds.minZ;
    return bounds;
  }

  function bodyRotation(piece) {
    const rotation = piece.body.rotation();
    return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  function overlap(minA, maxA, minB, maxB) {
    return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
  }

  function findSnapCandidate(piece, position = piece.targetPosition) {
    const movingBounds = getWorldBounds(piece.shapes, position, piece.targetRotation);
    let best = null;

    for (const target of pieces) {
      if (target === piece) continue;
      const targetPosition = bodyPosition(target);
      const targetRotation = bodyRotation(target);
      const targetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(targetRotation);
      if (targetUp.y < .965) continue;

      const targetBounds = getWorldBounds(target.shapes, targetPosition, targetRotation);
      const shiftsX = [
        targetBounds.minX - movingBounds.minX,
        targetBounds.centreX - movingBounds.centreX,
        targetBounds.maxX - movingBounds.maxX
      ];
      const shiftsZ = [
        targetBounds.minZ - movingBounds.minZ,
        targetBounds.centreZ - movingBounds.centreZ,
        targetBounds.maxZ - movingBounds.maxZ
      ];
      const captureX = THREE.MathUtils.clamp(Math.min(movingBounds.width, targetBounds.width) * .38, .55, 1.35);
      const captureZ = THREE.MathUtils.clamp(Math.min(movingBounds.depth, targetBounds.depth) * .38, .55, 1.35);
      const requiredOverlapX = Math.min(.32, Math.min(movingBounds.width, targetBounds.width) * .3);
      const requiredOverlapZ = Math.min(.32, Math.min(movingBounds.depth, targetBounds.depth) * .3);

      for (const shiftX of shiftsX) {
        if (Math.abs(shiftX) > captureX) continue;
        for (const shiftZ of shiftsZ) {
          if (Math.abs(shiftZ) > captureZ) continue;
          const overlapX = overlap(
            movingBounds.minX + shiftX,
            movingBounds.maxX + shiftX,
            targetBounds.minX,
            targetBounds.maxX
          );
          const overlapZ = overlap(
            movingBounds.minZ + shiftZ,
            movingBounds.maxZ + shiftZ,
            targetBounds.minZ,
            targetBounds.maxZ
          );
          if (overlapX < requiredOverlapX || overlapZ < requiredOverlapZ) continue;

          const snappedPosition = position.clone();
          snappedPosition.x += shiftX;
          snappedPosition.y += targetBounds.maxY - movingBounds.minY + SNAP_GAP;
          snappedPosition.z += shiftZ;
          const score = Math.hypot(shiftX / captureX, shiftZ / captureZ)
            + Math.abs(snappedPosition.y - position.y) * .018;

          if (!best || score < best.score) {
            best = {
              position: snappedPosition,
              rotation: piece.targetRotation.clone(),
              target,
              score
            };
          }
        }
      }
    }

    return best;
  }

  function updateSnapCandidate(position = selected?.targetPosition) {
    if (!selected || !position) {
      snapCandidate = null;
      snapGuide.visible = false;
      return;
    }

    snapCandidate = findSnapCandidate(selected, position);
    snapGuide.visible = !!snapCandidate;
    if (snapCandidate) {
      snapGuide.position.copy(snapCandidate.position);
      snapGuide.quaternion.copy(snapCandidate.rotation);
      setInstruction('release to align');
    } else if (active) {
      setInstruction('drag near a block to align');
    }
  }

  function releaseSelected(applySnap = true) {
    if (!selected) return;
    if (applySnap && snapCandidate) {
      selected.targetPosition.copy(snapCandidate.position);
      selected.targetRotation.copy(snapCandidate.rotation);
    }
    selected.body.setTranslation(selected.targetPosition, true);
    selected.body.setRotation(selected.targetRotation, true);
    selected.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    selected.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    selected.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    selected.body.wakeUp();
    setPieceEdges(selected, selected === hovered ? hoverMaterial : edgeMaterial);
    selected = null;
    active = null;
    clearSnapGuide();
    stage.classList.remove('is-dragging');
    setInstruction('drag a block · release on the outline');
    updateSelectionUI();
  }

  function selectPiece(piece) {
    if (selected && selected !== piece) releaseSelected();
    selected = piece;
    const position = bodyPosition(piece);
    const rotation = uprightRotation(piece);
    piece.targetPosition.copy(position);
    piece.targetPosition.y = Math.max(piece.halfHeight + .04, piece.targetPosition.y);
    piece.targetRotation.copy(rotation);
    piece.controlPosition.copy(piece.targetPosition);
    piece.controlRotation.copy(piece.targetRotation);
    piece.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setNextKinematicTranslation(piece.targetPosition);
    piece.body.setNextKinematicRotation(piece.targetRotation);
    setPieceEdges(piece, selectedMaterial);
    prepareSnapGuide(piece);
    updateSnapCandidate();
    if (!snapCandidate) setInstruction('turn · lift · drag near a block');
    updateSelectionUI();
  }

  function disposePieces() {
    clearSnapGuide();
    for (const piece of pieces) {
      scene.remove(piece.group);
      for (const geometry of piece.geometries) geometry.dispose();
    }
    pieces = [];
    meshes.length = 0;
  }

  function rebuild() {
    releaseSelected(false);
    disposePieces();
    setHover(null);
    accumulator = 0;
    last = performance.now();
    topView = false;
    orbitTargetElevation = MODEL_ELEVATION;
    orbitTargetRadius = innerWidth < 641 ? 25 : innerWidth < 980 ? 26 : MODEL_RADIUS;
    if (viewButton) viewButton.textContent = 'top';

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -.12, -1.5));
    world.createCollider(RAPIER.ColliderDesc.cuboid(18, .08, 17).setFriction(.86), ground);

    for (const definition of BLOCKS) {
      const yaw = definition.rotation || 0;
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...definition.position)
          .setRotation(rotation)
          .setLinearDamping(.62)
          .setAngularDamping(.82)
      );

      const group = new THREE.Group();
      group.position.set(...definition.position);
      group.quaternion.copy(rotation);
      const edges = [];
      const geometries = [];
      const shapes = [];
      const pieceIndex = pieces.length;

      for (const shape of definition.shapes) {
        const [width, height, depth] = shape.size;
        const [x, y, z] = shape.at;
        const collider = RAPIER.ColliderDesc.roundCuboid(
          width / 2 - EDGE_RADIUS,
          height / 2 - EDGE_RADIUS,
          depth / 2 - EDGE_RADIUS,
          EDGE_RADIUS
        )
          .setTranslation(x, y, z)
          .setDensity(1.1)
          .setFriction(.82)
          .setRestitution(0);
        world.createCollider(collider, body);

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const outlineGeometry = new THREE.EdgesGeometry(geometry, 18);
        geometries.push(geometry, outlineGeometry);
        shapes.push({
          at: [x, y, z],
          size: [width, height, depth],
          outlineGeometry
        });

        const face = new THREE.Mesh(geometry, faceMaterial);
        face.position.set(x, y, z);
        face.userData.pieceIndex = pieceIndex;
        group.add(face);
        meshes.push(face);

        const outline = new THREE.LineSegments(outlineGeometry, edgeMaterial);
        outline.position.set(x, y, z);
        group.add(outline);
        edges.push(outline);

        const ghost = new THREE.LineSegments(outlineGeometry, ghostMaterial);
        ghost.position.set(x + .014, y + .008, z - .011);
        ghost.scale.setScalar(1.0015);
        group.add(ghost);
      }

      scene.add(group);
      pieces.push({
        name: definition.name,
        halfHeight: definition.halfHeight,
        body,
        group,
        edges,
        shapes,
        geometries,
        targetPosition: new THREE.Vector3(...definition.position),
        targetRotation: rotation.clone(),
        controlPosition: new THREE.Vector3(...definition.position),
        controlRotation: rotation.clone()
      });
    }

    updateSelectionUI();
    setInstruction('drag a block · release on the outline');
  }

  function setRay(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function hitPiece(event) {
    setRay(event.clientX, event.clientY);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? { piece: pieces[hit.object.userData.pieceIndex], hit } : null;
  }

  function releaseCapture(pointerId) {
    if (pointerId == null) return;
    if (renderer.domElement.hasPointerCapture?.(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
  }

  function snapNear(value, step = GRID, tolerance = .07) {
    const snapped = Math.round(value / step) * step;
    return Math.abs(value - snapped) <= tolerance ? snapped : value;
  }

  function beginCarry(piece, event) {
    selectPiece(piece);
    const origin = piece.targetPosition.clone();
    carryPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), origin);
    setRay(event.clientX, event.clientY);
    const grabPoint = raycaster.ray.intersectPlane(carryPlane, carryPoint) ? carryPoint.clone() : origin.clone();

    active = {
      pointerId: event.pointerId,
      piece,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      carryOrigin: origin,
      carryGrabPoint: grabPoint,
      carryDesired: origin.clone(),
      carryPosition: origin.clone()
    };
    stage.classList.add('is-dragging');
  }

  function finishPointer(event, cancelled = false) {
    if (active && event.pointerId === active.pointerId) {
      const carried = active;
      if (!cancelled && carried.moved) {
        carried.piece.targetPosition.copy(carried.carryPosition);
        carried.piece.body.setNextKinematicTranslation(carried.piece.targetPosition);
        updateSnapCandidate(carried.piece.targetPosition);
      }
      active = null;
      stage.classList.remove('is-dragging');
      releaseCapture(event.pointerId);
      stage.focus({ preventScroll: true });
      if (cancelled || carried.moved) releaseSelected(!cancelled);
      else if (snapCandidate) setInstruction('drag to place · release on the outline');
      else setInstruction('turn · lift · drag near a block');
      return;
    }

    if (orbitGesture && event.pointerId === orbitGesture.pointerId) {
      orbitGesture = null;
      stage.classList.remove('is-orbiting');
      releaseCapture(event.pointerId);
      if (cancelled || reducedMotion) {
        orbitVelocityAzimuth = 0;
        orbitVelocityElevation = 0;
        orbitTargetAzimuth = orbitAzimuth;
        orbitTargetElevation = orbitElevation;
      }
    }
  }

  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

  renderer.domElement.addEventListener('wheel', event => {
    event.preventDefault();
    if (active || orbitGesture) return;
    const delta = THREE.MathUtils.clamp(event.deltaY, -120, 120);
    orbitTargetRadius = THREE.MathUtils.clamp(orbitTargetRadius + delta * .018, orbitMinRadius, orbitMaxRadius);
  }, { passive: false });

  renderer.domElement.addEventListener('pointermove', event => {
    if (active && event.pointerId === active.pointerId) {
      event.preventDefault();
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= DRAG_THRESHOLD) {
        active.moved = true;
      }
      setRay(event.clientX, event.clientY);
      if (raycaster.ray.intersectPlane(carryPlane, carryPoint)) {
        const desired = active.carryOrigin.clone().add(carryPoint.clone().sub(active.carryGrabPoint));
        desired.x = THREE.MathUtils.clamp(snapNear(desired.x), -15.5, 15.5);
        desired.z = THREE.MathUtils.clamp(snapNear(desired.z), -16, 15);
        desired.y = Math.max(active.piece.halfHeight + .04, desired.y);
        const level = active.piece.halfHeight + Math.round((desired.y - active.piece.halfHeight) / GRID) * GRID;
        if (Math.abs(desired.y - level) < .08) desired.y = level + .04;
        active.carryDesired.copy(desired);
      }
      return;
    }

    if (orbitGesture && event.pointerId === orbitGesture.pointerId) {
      event.preventDefault();
      const dx = event.clientX - orbitGesture.lastX;
      const dy = event.clientY - orbitGesture.lastY;
      orbitGesture.lastX = event.clientX;
      orbitGesture.lastY = event.clientY;
      const deltaAzimuth = -dx * .0042;
      const deltaElevation = dy * .0032;
      orbitTargetAzimuth += deltaAzimuth;
      orbitTargetElevation = THREE.MathUtils.clamp(orbitTargetElevation + deltaElevation, MIN_ELEVATION, MAX_ELEVATION);
      orbitVelocityAzimuth = THREE.MathUtils.lerp(orbitVelocityAzimuth, THREE.MathUtils.clamp(deltaAzimuth, -.025, .025), .2);
      orbitVelocityElevation = THREE.MathUtils.lerp(orbitVelocityElevation, THREE.MathUtils.clamp(deltaElevation, -.018, .018), .2);
      return;
    }

    if (event.pointerType === 'mouse') setHover(hitPiece(event)?.piece || null);
  });

  renderer.domElement.addEventListener('pointerdown', event => {
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && ![0, 2].includes(event.button)) return;
    const forceOrbit = event.pointerType === 'mouse' && event.button === 2;
    const info = forceOrbit ? null : hitPiece(event);
    event.preventDefault();

    if (info) {
      renderer.domElement.setPointerCapture(event.pointerId);
      beginCarry(info.piece, event);
      orbitVelocityAzimuth = 0;
      orbitVelocityElevation = 0;
      return;
    }

    setHover(null);
    if (selected && !forceOrbit) {
      releaseSelected();
      stage.focus({ preventScroll: true });
      return;
    }

    renderer.domElement.setPointerCapture(event.pointerId);
    orbitVelocityAzimuth = 0;
    orbitVelocityElevation = 0;
    orbitTargetAzimuth = orbitAzimuth;
    orbitTargetElevation = orbitElevation;
    orbitGesture = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    stage.classList.add('is-orbiting');
  });

  renderer.domElement.addEventListener('pointerup', event => finishPointer(event, false));
  renderer.domElement.addEventListener('pointercancel', event => finishPointer(event, true));
  renderer.domElement.addEventListener('pointerleave', () => {
    if (!active && !orbitGesture) setHover(null);
  });

  function rotateSelected() {
    if (!selected) return;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    turn.multiply(selected.controlRotation).normalize();
    selected.controlRotation.copy(turn);
  }

  function liftSelected(direction) {
    if (!selected) return;
    selected.controlPosition.y = Math.max(
      selected.halfHeight + .04,
      selected.controlPosition.y + direction * GRID
    );
  }

  function moveSelected(x, z) {
    if (!selected) return;
    selected.controlPosition.x = THREE.MathUtils.clamp(selected.controlPosition.x + x * GRID, -15.5, 15.5);
    selected.controlPosition.z = THREE.MathUtils.clamp(selected.controlPosition.z + z * GRID, -16, 15);
  }

  function toggleView() {
    topView = !topView;
    orbitVelocityAzimuth = 0;
    orbitVelocityElevation = 0;
    orbitTargetElevation = topView ? TOP_ELEVATION : MODEL_ELEVATION;
    orbitTargetRadius = THREE.MathUtils.clamp(topView ? TOP_RADIUS : MODEL_RADIUS, orbitMinRadius, orbitMaxRadius);
    if (viewButton) viewButton.textContent = topView ? 'model' : 'top';
  }

  turnButton?.addEventListener('click', rotateSelected);
  upButton?.addEventListener('click', () => liftSelected(1));
  downButton?.addEventListener('click', () => liftSelected(-1));
  viewButton?.addEventListener('click', toggleView);
  again?.addEventListener('click', rebuild);

  stage.addEventListener('keydown', event => {
    if (!selected) return;
    let handled = true;
    if (event.key === 'ArrowLeft') moveSelected(-1, 0);
    else if (event.key === 'ArrowRight') moveSelected(1, 0);
    else if (event.key === 'ArrowUp' && event.shiftKey) liftSelected(1);
    else if (event.key === 'ArrowDown' && event.shiftKey) liftSelected(-1);
    else if (event.key === 'ArrowUp') moveSelected(0, -1);
    else if (event.key === 'ArrowDown') moveSelected(0, 1);
    else if (event.key.toLowerCase() === 'r') rotateSelected();
    else if (event.key === 'Enter' || event.key === 'Escape') releaseSelected();
    else handled = false;
    if (handled) event.preventDefault();
  });

  function updateCarry(delta) {
    if (!active) return;
    const travel = active.carryDesired.clone().sub(active.carryPosition);
    const distance = travel.length();
    const maxStep = MAX_CARRY_SPEED * Math.max(delta, 1 / 240);
    if (distance > maxStep) travel.setLength(maxStep);
    active.carryPosition.add(travel);
    active.piece.targetPosition.copy(active.carryPosition);
    active.piece.body.setNextKinematicTranslation(active.piece.targetPosition);
    active.piece.body.setNextKinematicRotation(active.piece.targetRotation);
    updateSnapCandidate(active.piece.targetPosition);
  }

  function updateSelectedControls(delta) {
    if (!selected || active) return;

    const travel = selected.controlPosition.clone().sub(selected.targetPosition);
    const maxTravel = CONTROL_MOVE_SPEED * Math.max(delta, 1 / 240);
    if (travel.length() > maxTravel) travel.setLength(maxTravel);
    selected.targetPosition.add(travel);
    selected.targetRotation.rotateTowards(selected.controlRotation, CONTROL_TURN_SPEED * delta);
    selected.body.setNextKinematicTranslation(selected.targetPosition);
    selected.body.setNextKinematicRotation(selected.targetRotation);
    if (travel.lengthSq() > 0 || selected.targetRotation.angleTo(selected.controlRotation) > .0001) {
      updateSnapCandidate();
    }
  }

  function updateOrbit(delta) {
    if (!orbitGesture && !reducedMotion) {
      const frameScale = Math.min(1.5, delta * 60);
      orbitTargetAzimuth += orbitVelocityAzimuth * frameScale * .18;
      orbitTargetElevation = THREE.MathUtils.clamp(
        orbitTargetElevation + orbitVelocityElevation * frameScale * .18,
        MIN_ELEVATION,
        MAX_ELEVATION
      );
      const velocityDamping = Math.exp(-13 * delta);
      orbitVelocityAzimuth *= velocityDamping;
      orbitVelocityElevation *= velocityDamping;
    }

    const follow = reducedMotion ? 1 : 1 - Math.exp(-5.5 * delta);
    orbitAzimuth += (orbitTargetAzimuth - orbitAzimuth) * follow;
    orbitElevation += (orbitTargetElevation - orbitElevation) * follow;
    orbitElevation = THREE.MathUtils.clamp(orbitElevation, MIN_ELEVATION, MAX_ELEVATION);

    const zoomFollow = reducedMotion ? 1 : 1 - Math.exp(-6.5 * delta);
    orbitRadius += (orbitTargetRadius - orbitRadius) * zoomFollow;
    orbitRadius = THREE.MathUtils.clamp(orbitRadius, orbitMinRadius, orbitMaxRadius);
    updateCamera();
  }

  function limitBodyMotion(piece) {
    if (piece === selected) return;

    const velocity = piece.body.linvel();
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);
    const horizontalScale = horizontalSpeed > MAX_HORIZONTAL_SPEED
      ? MAX_HORIZONTAL_SPEED / horizontalSpeed
      : 1;
    const cappedY = THREE.MathUtils.clamp(velocity.y, -MAX_FALL_SPEED, MAX_RISE_SPEED);

    if (horizontalScale < 1 || cappedY !== velocity.y) {
      piece.body.setLinvel({
        x: velocity.x * horizontalScale,
        y: cappedY,
        z: velocity.z * horizontalScale
      }, true);
    }

    const angularVelocity = piece.body.angvel();
    const angularSpeed = Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z);
    if (angularSpeed > MAX_ANGULAR_SPEED) {
      const angularScale = MAX_ANGULAR_SPEED / angularSpeed;
      piece.body.setAngvel({
        x: angularVelocity.x * angularScale,
        y: angularVelocity.y * angularScale,
        z: angularVelocity.z * angularScale
      }, true);
    }
  }

  function frame(now) {
    if (destroyed) return;
    animationFrame = requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }

    const delta = Math.min((now - last) / 1000, .05);
    last = now;
    accumulator += delta;
    updateOrbit(delta);
    updateCarry(delta);
    updateSelectedControls(delta);

    while (accumulator >= PHYSICS_STEP) {
      world.timestep = PHYSICS_STEP;
      world.step();
      for (const piece of pieces) limitBodyMotion(piece);
      accumulator -= PHYSICS_STEP;
    }

    for (const piece of pieces) {
      const position = piece.body.translation();
      const rotation = piece.body.rotation();
      piece.group.position.set(position.x, position.y, position.z);
      piece.group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      if (piece !== selected && position.y < -5) {
        piece.body.setTranslation({ x: 0, y: piece.halfHeight + 4, z: 0 }, true);
        piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }

    renderer.render(scene, camera);
  }

  function clearInteraction() {
    if (active) releaseCapture(active.pointerId);
    if (orbitGesture) releaseCapture(orbitGesture.pointerId);
    active = null;
    orbitGesture = null;
    stage.classList.remove('is-dragging', 'is-orbiting');
  }

  function handleResize() {
    clearInteraction();
    resize();
  }

  function handleVisibility() {
    if (document.hidden) clearInteraction();
    last = performance.now();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    clearInteraction();
    removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('turbo:before-cache', destroy);
    removeEventListener('pagehide', destroy);
    disposePieces();
    renderer.dispose();
    renderer.domElement.remove();
  }

  addEventListener('resize', handleResize, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('turbo:before-cache', destroy, { once: true });
  addEventListener('pagehide', destroy, { once: true });

  resize();
  rebuild();
  animationFrame = requestAnimationFrame(frame);
}).catch(error => {
  console.error(error);
  loading.textContent = 'unable to arrange';
});
