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
const DEFAULT_INSTRUCTION = 'drag · double-click group to align';

if (!stage || !loading) throw new Error('MASSING stage is unavailable.');

Promise.all([
  import('/play/massing/three-shim.js'),
  import('/stack/vendor/rapier-shim.js')
]).then(async ([THREE, RAPIER]) => {
  await RAPIER.init();
  loading.remove();

  const PHYSICS_STEP = 1 / 120;
  const MODULE = 1.2;
  const GRID = MODULE / 2;
  const EDGE_RADIUS = .025;
  const SNAP_GAP = .014;
  const ALIGN_GAP = .004;
  const CONTACT_CAPTURE = .28;
  const CONTACT_OVERLAP = .12;
  const ALIGN_CAPTURE = MODULE * .55;
  const ALIGN_DURATION = .72;
  const DRAG_THRESHOLD = 5;
  const MIN_CARRY_SPEED = 1.25;
  const MAX_CARRY_SPEED = 8;
  const CARRY_ACCEL_DISTANCE = 3.5;
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
  const MODEL_RADIUS = 31.5;
  const TOP_RADIUS = 29;

  const box = (size, at = [0, 0, 0]) => ({ kind: 'box', at, size });
  const cylinder = (radius, height, at = [0, 0, 0]) => ({
    kind: 'cylinder',
    at,
    radius,
    height,
    size: [radius * 2, height, radius * 2]
  });
  const profile = (kind, size, at = [0, 0, 0]) => ({ kind, at, size });

  const BLOCKS = [
    { name: 'wall 01', halfHeight: 1.2, position: [-8, 1.24, -15], shapes: [box([4.8, 2.4, .3])] },
    { name: 'wall 02', halfHeight: 1.2, position: [-2.7, 1.24, -15], shapes: [box([4.8, 2.4, .3])] },
    { name: 'beam 01', halfHeight: .3, position: [2.7, .34, -15], shapes: [box([4.8, .6, .6])] },
    { name: 'beam 02', halfHeight: .3, position: [8, .34, -15], shapes: [box([4.8, .6, .6])] },

    { name: 'long mass 01', halfHeight: .6, position: [-8, .64, -10.5], shapes: [box([4.8, 1.2, 1.2])] },
    { name: 'long mass 02', halfHeight: .6, position: [-2.7, .64, -10.5], shapes: [box([4.8, 1.2, 1.2])] },
    { name: 'double unit 01', halfHeight: .6, position: [2.2, .64, -10.5], shapes: [box([2.4, 1.2, 1.2])] },
    { name: 'double unit 02', halfHeight: .6, position: [5.4, .64, -10.5], shapes: [box([2.4, 1.2, 1.2])] },

    { name: 'slab 01', halfHeight: .15, position: [-7.8, .19, 10.5], shapes: [box([4.8, .3, 3.6])] },
    { name: 'slab 02', halfHeight: .15, position: [-2.4, .19, 10.5], shapes: [box([4.8, .3, 3.6])] },
    { name: 'room mass 01', halfHeight: 1.2, position: [3, 1.24, 10.5], shapes: [box([3.6, 2.4, 2.4])] },
    { name: 'room mass 02', halfHeight: 1.2, position: [7.3, 1.24, 10.5], shapes: [box([3.6, 2.4, 2.4])] },

    {
      name: 'L mass',
      halfHeight: .6,
      position: [-8, .64, 15.2],
      shapes: [
        box([3.6, 1.2, 1.2], [0, 0, -1.2]),
        box([1.2, 1.2, 2.4], [-1.2, 0, .6])
      ]
    },
    {
      name: 'U mass',
      halfHeight: .6,
      position: [-2.6, .64, 15.2],
      shapes: [
        box([4.8, 1.2, 1.2], [0, 0, -1.2]),
        box([1.2, 1.2, 2.4], [-1.8, 0, .6]),
        box([1.2, 1.2, 2.4], [1.8, 0, .6])
      ]
    },
    {
      name: 'frame',
      halfHeight: 1.8,
      position: [3, 1.84, 15.2],
      shapes: [
        box([.6, 3, .6], [-1.8, -.3, 0]),
        box([.6, 3, .6], [1.8, -.3, 0]),
        box([4.2, .6, .6], [0, 1.5, 0])
      ]
    },
    {
      name: 'stair',
      halfHeight: .9,
      position: [8, .94, 15.2],
      shapes: [
        box([1.2, .6, 2.4], [-1.2, -.6, 0]),
        box([1.2, 1.2, 2.4], [0, -.3, 0]),
        box([1.2, 1.8, 2.4], [1.2, 0, 0])
      ]
    },

    { name: 'unit 01', halfHeight: .6, position: [-12.8, .64, -7], shapes: [box([1.2, 1.2, 1.2])] },
    { name: 'unit 02', halfHeight: .6, position: [-12.8, .64, -4.6], shapes: [box([1.2, 1.2, 1.2])] },
    { name: 'column 01', halfHeight: 1.8, position: [-12.8, 1.84, -1.5], shapes: [box([.6, 3.6, .6])] },
    { name: 'column 02', halfHeight: 1.8, position: [-12.8, 1.84, 1.5], shapes: [box([.6, 3.6, .6])] },
    { name: 'core 01', halfHeight: 1.8, position: [-12.8, 1.84, 5.5], shapes: [box([1.2, 3.6, 1.2])] },

    { name: 'core 02', halfHeight: 1.8, position: [12.8, 1.84, -7.2], shapes: [box([1.2, 3.6, 1.2])] },
    { name: 'round tower', halfHeight: 1.8, position: [12.8, 1.84, -3.6], shapes: [cylinder(1.2, 3.6)] },
    { name: 'quarter curve', halfHeight: .6, position: [12.8, .64, 0], shapes: [profile('sector', [2.4, 1.2, 2.4])] },
    { name: 'gable roof', halfHeight: .9, position: [12.8, .94, 3.6], shapes: [profile('gable', [3.6, 1.8, 2.4])] },
    { name: 'mono pitch', halfHeight: .9, position: [12.8, .94, 7.2], shapes: [profile('ramp', [3.6, 1.8, 2.4])] }
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
  let orbitMinRadius = 19;
  let orbitMaxRadius = 42;
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
  let clusterSettle = null;
  let hovered = null;
  let last = performance.now();
  let accumulator = 0;
  let animationFrame = 0;
  let destroyed = false;

  const faceMaterial = new THREE.MeshBasicMaterial({
    color: 0xf3f1ea,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .72 });
  const hoverMaterial = new THREE.LineBasicMaterial({ color: 0x171613, transparent: true, opacity: 1 });
  const selectedMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: 1 });
  const snapMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: .72, depthTest: false });
  const ghostMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .12 });
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf3f1ea });

  const floorGeometry = new THREE.BoxGeometry(44, .08, 40);
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.position.set(0, -.08, -1.5);
  scene.add(floorMesh);

  const grid = new THREE.GridHelper(14.4, 24, 0x24231f, 0x24231f);
  grid.position.set(0, -.032, 0);
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
    orbitMinRadius = phone ? 21 : tablet ? 20 : 19;
    orbitMaxRadius = phone ? 40 : tablet ? 41 : 42;

    if (!cameraConfigured) {
      orbitRadius = phone ? 29 : tablet ? 30 : MODEL_RADIUS;
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
    bounds.centreY = (bounds.minY + bounds.maxY) / 2;
    bounds.centreZ = (bounds.minZ + bounds.maxZ) / 2;
    bounds.width = bounds.maxX - bounds.minX;
    bounds.height = bounds.maxY - bounds.minY;
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

  const AXES = {
    x: { min: 'minX', centre: 'centreX', max: 'maxX', size: 'width', perpendicular: ['y', 'z'] },
    y: { min: 'minY', centre: 'centreY', max: 'maxY', size: 'height', perpendicular: ['x', 'z'] },
    z: { min: 'minZ', centre: 'centreZ', max: 'maxZ', size: 'depth', perpendicular: ['x', 'y'] }
  };

  function axisOverlap(boundsA, boundsB, axis) {
    const keys = AXES[axis];
    return overlap(boundsA[keys.min], boundsA[keys.max], boundsB[keys.min], boundsB[keys.max]);
  }

  function contactRelation(pieceA, pieceB) {
    const boundsA = getWorldBounds(pieceA.shapes, bodyPosition(pieceA), bodyRotation(pieceA));
    const boundsB = getWorldBounds(pieceB.shapes, bodyPosition(pieceB), bodyRotation(pieceB));
    let best = null;

    for (const [axis, keys] of Object.entries(AXES)) {
      const perpendicularEnough = keys.perpendicular.every(perpendicular => {
        const amount = axisOverlap(boundsA, boundsB, perpendicular);
        const minimumSize = Math.min(boundsA[AXES[perpendicular].size], boundsB[AXES[perpendicular].size]);
        return amount >= Math.min(CONTACT_OVERLAP, minimumSize * .24);
      });
      if (!perpendicularEnough) continue;

      const positiveGap = Math.abs(boundsB[keys.min] - boundsA[keys.max]);
      const negativeGap = Math.abs(boundsA[keys.min] - boundsB[keys.max]);
      const direction = positiveGap <= negativeGap ? 1 : -1;
      const gap = Math.min(positiveGap, negativeGap);
      if (gap > CONTACT_CAPTURE) continue;
      if (!best || gap < best.gap) best = { axis, direction, gap };
    }

    return best;
  }

  function nearestAlignmentShift(referenceBounds, movingBounds, axis) {
    const keys = AXES[axis];
    const shifts = [
      referenceBounds[keys.min] - movingBounds[keys.min],
      referenceBounds[keys.centre] - movingBounds[keys.centre],
      referenceBounds[keys.max] - movingBounds[keys.max]
    ];
    return shifts.reduce((best, shift) => Math.abs(shift) < Math.abs(best) ? shift : best, shifts[0]);
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
    setInstruction(DEFAULT_INSTRUCTION);
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

  function findTouchingCluster(root) {
    const order = [root];
    const parents = new Map([[root, null]]);

    for (let index = 0; index < order.length; index += 1) {
      const parent = order[index];
      for (const candidate of pieces) {
        if (parents.has(candidate)) continue;
        const relation = contactRelation(parent, candidate);
        if (!relation) continue;
        parents.set(candidate, { parent, relation });
        order.push(candidate);
      }
    }

    return { order, parents };
  }

  function alignedAnchorPlan(piece) {
    const rotation = uprightRotation(piece);
    const position = bodyPosition(piece);
    position.x = Math.round(position.x / GRID) * GRID;
    position.z = Math.round(position.z / GRID) * GRID;
    const bounds = getWorldBounds(piece.shapes, position, rotation);
    const level = .04 + Math.round((bounds.minY - .04) / GRID) * GRID;
    position.y += level - bounds.minY;
    return { position, rotation };
  }

  function alignedChildPlan(piece, parentPlan, relation) {
    const rotation = uprightRotation(piece);
    const position = bodyPosition(piece);
    const parentBounds = getWorldBounds(parentPlan.piece.shapes, parentPlan.position, parentPlan.rotation);
    const movingBounds = getWorldBounds(piece.shapes, position, rotation);
    const axis = AXES[relation.axis];
    const contactShift = relation.direction > 0
      ? parentBounds[axis.max] + ALIGN_GAP - movingBounds[axis.min]
      : parentBounds[axis.min] - ALIGN_GAP - movingBounds[axis.max];
    position[relation.axis] += contactShift;

    for (const perpendicular of axis.perpendicular) {
      const shift = nearestAlignmentShift(parentBounds, movingBounds, perpendicular);
      if (Math.abs(shift) <= ALIGN_CAPTURE) position[perpendicular] += shift;
    }

    return { position, rotation };
  }

  function finishClusterSettle() {
    if (!clusterSettle) return;
    const completed = clusterSettle;
    clusterSettle = null;

    for (const item of completed.items) {
      item.piece.body.setTranslation(item.targetPosition, true);
      item.piece.body.setRotation(item.targetRotation, true);
      item.piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      item.piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      item.piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      item.piece.body.sleep();
      item.piece.group.position.copy(item.targetPosition);
      item.piece.group.quaternion.copy(item.targetRotation);
      setPieceEdges(item.piece, item.piece === hovered ? hoverMaterial : edgeMaterial);
    }

    setInstruction(DEFAULT_INSTRUCTION);
  }

  function alignTouchingCluster(root) {
    if (!root || clusterSettle) return;
    if (selected) releaseSelected(false);
    setHover(null);

    const cluster = findTouchingCluster(root);
    const plans = new Map();
    const items = [];

    for (const piece of cluster.order) {
      const connection = cluster.parents.get(piece);
      const plan = connection
        ? alignedChildPlan(piece, { piece: connection.parent, ...plans.get(connection.parent) }, connection.relation)
        : alignedAnchorPlan(piece);
      plans.set(piece, plan);

      const startPosition = bodyPosition(piece);
      const startRotation = bodyRotation(piece);
      piece.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      setPieceEdges(piece, selectedMaterial);
      items.push({
        piece,
        startPosition,
        startRotation,
        targetPosition: plan.position,
        targetRotation: plan.rotation,
        displayPosition: startPosition.clone(),
        displayRotation: startRotation.clone()
      });
    }

    clusterSettle = { elapsed: 0, duration: reducedMotion ? .01 : ALIGN_DURATION, items };
    setInstruction(cluster.order.length > 1 ? 'soft-aligning joined blocks' : 'soft-aligning block');
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

  function createProfileData(shape) {
    const [width, height, depth] = shape.size;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfDepth = depth / 2;

    if (shape.kind === 'gable') {
      return {
        vertices: [
          -halfWidth, -halfHeight, -halfDepth,
          halfWidth, -halfHeight, -halfDepth,
          -halfWidth, -halfHeight, halfDepth,
          halfWidth, -halfHeight, halfDepth,
          -halfWidth, halfHeight, 0,
          halfWidth, halfHeight, 0
        ],
        indices: [
          0, 2, 3, 0, 3, 1,
          0, 1, 5, 0, 5, 4,
          2, 4, 5, 2, 5, 3,
          0, 4, 2,
          1, 3, 5
        ]
      };
    }

    if (shape.kind === 'ramp') {
      return {
        vertices: [
          -halfWidth, -halfHeight, -halfDepth,
          halfWidth, -halfHeight, -halfDepth,
          -halfWidth, -halfHeight, halfDepth,
          halfWidth, -halfHeight, halfDepth,
          -halfWidth, halfHeight, -halfDepth,
          -halfWidth, halfHeight, halfDepth
        ],
        indices: [
          0, 2, 3, 0, 3, 1,
          0, 1, 4,
          2, 5, 3,
          0, 4, 5, 0, 5, 2,
          1, 3, 5, 1, 5, 4
        ]
      };
    }

    const segments = 10;
    const radius = Math.min(width, depth);
    const centreX = -width / 2;
    const centreZ = -depth / 2;
    const plan = [[centreX, centreZ]];
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI / 2;
      plan.push([
        centreX + Math.cos(angle) * radius,
        centreZ + Math.sin(angle) * radius
      ]);
    }

    const vertices = [];
    for (const y of [-halfHeight, halfHeight]) {
      for (const [x, z] of plan) vertices.push(x, y, z);
    }
    const layer = plan.length;
    const indices = [];
    for (let index = 1; index < layer - 1; index += 1) {
      indices.push(0, index + 1, index);
      indices.push(layer, layer + index, layer + index + 1);
    }
    for (let index = 1; index < layer - 1; index += 1) {
      indices.push(index, index + 1, layer + index + 1, index, layer + index + 1, layer + index);
    }
    indices.push(0, 1, layer + 1, 0, layer + 1, layer);
    indices.push(layer - 1, 0, layer, layer - 1, layer, layer * 2 - 1);
    return { vertices, indices };
  }

  function createShapeGeometry(shape) {
    if (shape.kind === 'cylinder') {
      return new THREE.CylinderGeometry(shape.radius, shape.radius, shape.height, 32);
    }
    if (shape.kind === 'gable' || shape.kind === 'ramp' || shape.kind === 'sector') {
      const data = createProfileData(shape);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices, 3));
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      geometry.userData.hull = new Float32Array(data.vertices);
      return geometry;
    }
    return new THREE.BoxGeometry(...shape.size);
  }

  function createShapeCollider(shape, geometry) {
    let collider;
    if (shape.kind === 'cylinder') {
      collider = RAPIER.ColliderDesc.cylinder(shape.height / 2, shape.radius);
    } else if (shape.kind === 'gable' || shape.kind === 'ramp' || shape.kind === 'sector') {
      collider = RAPIER.ColliderDesc.convexHull(geometry.userData.hull);
      if (!collider) throw new Error(`Unable to build ${shape.kind} collider.`);
    } else {
      const [width, height, depth] = shape.size;
      collider = RAPIER.ColliderDesc.roundCuboid(
        width / 2 - EDGE_RADIUS,
        height / 2 - EDGE_RADIUS,
        depth / 2 - EDGE_RADIUS,
        EDGE_RADIUS
      );
    }

    return collider
      .setTranslation(...shape.at)
      .setDensity(1.1)
      .setFriction(.82)
      .setRestitution(0);
  }

  function rebuild() {
    clusterSettle = null;
    releaseSelected(false);
    disposePieces();
    setHover(null);
    accumulator = 0;
    last = performance.now();
    topView = false;
    orbitTargetElevation = MODEL_ELEVATION;
    orbitTargetRadius = innerWidth < 641 ? 29 : innerWidth < 980 ? 30 : MODEL_RADIUS;
    if (viewButton) viewButton.textContent = 'top';

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -.12, -1.5));
    world.createCollider(RAPIER.ColliderDesc.cuboid(22, .08, 20).setFriction(.86), ground);

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
        const [x, y, z] = shape.at;
        const geometry = createShapeGeometry(shape);
        const collider = createShapeCollider(shape, geometry);
        world.createCollider(collider, body);

        const outlineGeometry = new THREE.EdgesGeometry(geometry, 18);
        geometries.push(geometry, outlineGeometry);
        shapes.push({
          at: [x, y, z],
          size: [...shape.size],
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
    setInstruction(DEFAULT_INSTRUCTION);
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
    if (active || orbitGesture || clusterSettle) return;
    const delta = THREE.MathUtils.clamp(event.deltaY, -120, 120);
    orbitTargetRadius = THREE.MathUtils.clamp(orbitTargetRadius + delta * .018, orbitMinRadius, orbitMaxRadius);
  }, { passive: false });

  renderer.domElement.addEventListener('pointermove', event => {
    if (clusterSettle) return;
    if (active && event.pointerId === active.pointerId) {
      event.preventDefault();
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= DRAG_THRESHOLD) {
        active.moved = true;
      }
      setRay(event.clientX, event.clientY);
      if (raycaster.ray.intersectPlane(carryPlane, carryPoint)) {
        const desired = active.carryOrigin.clone().add(carryPoint.clone().sub(active.carryGrabPoint));
        desired.x = THREE.MathUtils.clamp(snapNear(desired.x), -19, 19);
        desired.z = THREE.MathUtils.clamp(snapNear(desired.z), -18, 17);
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
    if (clusterSettle) return;
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

  renderer.domElement.addEventListener('dblclick', event => {
    if (event.button !== 0 || clusterSettle) return;
    const info = hitPiece(event);
    if (!info) return;
    event.preventDefault();
    alignTouchingCluster(info.piece);
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
    selected.controlPosition.x = THREE.MathUtils.clamp(selected.controlPosition.x + x * GRID, -19, 19);
    selected.controlPosition.z = THREE.MathUtils.clamp(selected.controlPosition.z + z * GRID, -18, 17);
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
    const response = THREE.MathUtils.clamp(distance / CARRY_ACCEL_DISTANCE, 0, 1);
    const easedResponse = response * response * (3 - 2 * response);
    const carrySpeed = THREE.MathUtils.lerp(MIN_CARRY_SPEED, MAX_CARRY_SPEED, easedResponse);
    const maxStep = carrySpeed * Math.max(delta, 1 / 240);
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

  function updateClusterSettle(delta) {
    if (!clusterSettle) return;
    clusterSettle.elapsed += delta;
    const progress = THREE.MathUtils.clamp(clusterSettle.elapsed / clusterSettle.duration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);

    for (const item of clusterSettle.items) {
      item.displayPosition.lerpVectors(item.startPosition, item.targetPosition, eased);
      item.displayRotation.copy(item.startRotation).slerp(item.targetRotation, eased);
      item.piece.body.setNextKinematicTranslation(item.displayPosition);
      item.piece.body.setNextKinematicRotation(item.displayRotation);
    }

    if (progress >= 1) finishClusterSettle();
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
    updateClusterSettle(delta);

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
