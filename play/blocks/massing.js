const stage = document.querySelector('#massing-stage');
const loading = stage?.querySelector('.massing-loading');
const instruction = document.querySelector('.massing-instruction');
const selectionLabel = document.querySelector('#massing-selection');
const turnButton = document.querySelector('#massing-turn');
const upButton = document.querySelector('#massing-up');
const downButton = document.querySelector('#massing-down');
const returnButton = document.querySelector('#massing-return');
const undoButton = document.querySelector('#massing-undo');
const viewButton = document.querySelector('#massing-view');
const again = document.querySelector('#again');
const challengeLedger = document.querySelector('#challenge-ledger');
const challengePreview = document.querySelector('#challenge-preview');
const challengeButtons = [...document.querySelectorAll('[data-challenge]')];
const challengeFree = document.querySelector('#challenge-free');
const challengeIndex = document.querySelector('#challenge-index');
const challengeLevel = document.querySelector('#challenge-level');
const challengeTitle = document.querySelector('#challenge-title');
const challengeCue = document.querySelector('#challenge-cue');
const challengeSpin = document.querySelector('#challenge-spin');
const challengeGuide = document.querySelector('#challenge-guide');
const challengeReset = document.querySelector('#challenge-reset');
const challengeDone = document.querySelector('#challenge-done');
const challengeStatus = document.querySelector('#challenge-status');
const challengeScore = document.querySelector('#challenge-score');
const challengeSuccess = document.querySelector('#challenge-success');
const challengeSuccessNext = document.querySelector('#challenge-success-next');
const partsTray = document.querySelector('#parts-tray');
const partsRail = document.querySelector('#parts-rail');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_INSTRUCTION = 'drag · scroll lifts · double-tap aligns 10s';

if (!stage || !loading) throw new Error('MASSING stage is unavailable.');

Promise.all([
  import('/play/blocks/three-shim.js'),
  import('/play/blocks/rapier-shim.js')
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
  const HOLD_DURATION = 10000;
  const DOUBLE_TAP_WINDOW = 340;
  const DOUBLE_TAP_DISTANCE = 28;
  const MOBILE_SELECTION_RELEASE = 1400;
  const FLOOR_LEVEL = .04;
  const BLOCK_FRICTION = .72;
  const GROUND_FRICTION = .78;
  const CARRY_FRICTION = .025;
  const LINEAR_DAMPING = .72;
  const ANGULAR_DAMPING = .95;
  const SOLVER_ITERATIONS = 6;
  const SOFT_CCD_PREDICTION = .12;
  const CARRY_CLEARANCE = .38;
  const CARRY_LOOKAHEAD = .22;
  const CARRY_PASS_GAP = .06;
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
  const MOBILE_MODEL_RADIUS = 21;
  const MOBILE_TOP_RADIUS = 20;
  const MOBILE_BREAKPOINT = 640;
  const SPAWN_DURATION = .56;
  const CHALLENGE_BASE_SCORE = 1000;
  const HINT_COSTS = [0, 100, 180];

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

  const challengeTarget = (family, position, rotation = 0) => ({ family, position, rotation });
  const CHALLENGES = [
    {
      title: 'plinth',
      level: 'foundation',
      cue: 'Centre three diminishing masses into one stable stack.',
      targets: [
        challengeTarget('long mass', [0, .64, 0]),
        challengeTarget('double unit', [0, 1.84, 0]),
        challengeTarget('unit', [0, 3.04, 0])
      ]
    },
    {
      title: 'bay',
      level: 'support',
      cue: 'Bridge a clear opening with one thin roof plate.',
      targets: [
        challengeTarget('double unit', [-1.5, .64, 0]),
        challengeTarget('double unit', [1.5, .64, 0]),
        challengeTarget('slab', [0, 1.39, 0])
      ]
    },
    {
      title: 'court',
      level: 'void',
      cue: 'Close the open mass to make one calm central void.',
      targets: [
        challengeTarget('U mass', [0, .64, -.6]),
        challengeTarget('long mass', [0, .64, 1.8])
      ]
    },
    {
      title: 'portico',
      level: 'span',
      cue: 'Raise a broad plate on two slender supports.',
      targets: [
        challengeTarget('column', [-2.1, 1.84, 0]),
        challengeTarget('column', [2.1, 1.84, 0]),
        challengeTarget('beam', [0, 3.94, 0]),
        challengeTarget('slab', [0, 4.39, 0])
      ]
    },
    {
      title: 'house',
      level: 'section',
      cue: 'Join a tall room and a low wing beneath two roofs.',
      targets: [
        challengeTarget('room mass', [0, 1.24, 0]),
        challengeTarget('gable roof', [0, 3.34, 0]),
        challengeTarget('long mass', [-4.2, .64, 0]),
        challengeTarget('slab', [-4.2, 1.39, 0])
      ]
    },
    {
      title: 'bridge',
      level: 'load path',
      cue: 'Carry a platform cleanly across two upright cores.',
      targets: [
        challengeTarget('core', [-2.1, 1.84, 0]),
        challengeTarget('core', [2.1, 1.84, 0]),
        challengeTarget('long mass', [0, 4.24, 0]),
        challengeTarget('slab', [0, 4.99, 0])
      ]
    },
    {
      title: 'cantilever',
      level: 'balance',
      cue: 'Offset the beam, then counterbalance it before the hold releases.',
      targets: [
        challengeTarget('core', [0, 1.84, 0]),
        challengeTarget('long mass', [1.2, 4.24, 0]),
        challengeTarget('room mass', [-.6, 6.04, 0])
      ]
    },
    {
      title: 'rotunda',
      level: 'alignment',
      cue: 'Centre four unlike profiles into one vertical composition.',
      targets: [
        challengeTarget('round tower', [0, 1.84, 0]),
        challengeTarget('slab', [0, 3.79, 0]),
        challengeTarget('room mass', [0, 5.14, 0]),
        challengeTarget('gable roof', [0, 7.24, 0])
      ]
    },
    {
      title: 'court gate',
      level: 'order',
      cue: 'Bind a low court to a tall threshold and canopy.',
      targets: [
        challengeTarget('U mass', [0, .64, -1.2]),
        challengeTarget('column', [-2.1, 1.84, .9]),
        challengeTarget('column', [2.1, 1.84, .9]),
        challengeTarget('beam', [0, 3.94, .9]),
        challengeTarget('slab', [0, 4.39, .9])
      ]
    },
    {
      title: 'habitat',
      level: 'synthesis',
      cue: 'Build the asymmetrical tower from its counterweight outward.',
      targets: [
        challengeTarget('core', [0, 1.84, 0]),
        challengeTarget('long mass', [1.2, 4.24, 0]),
        challengeTarget('room mass', [0, 6.04, 0]),
        challengeTarget('slab', [.6, 7.39, 0]),
        challengeTarget('frame', [.6, 9.34, 0]),
        challengeTarget('mono pitch', [.6, 12.04, 0])
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
  let holds = [];
  let hovered = null;
  let last = performance.now();
  let accumulator = 0;
  let animationFrame = 0;
  let destroyed = false;
  let activeChallengeIndex = 0;
  let challengeGuideEnabled = false;
  let challengeHintLevel = 0;
  let challengeHintUsedLevel = 0;
  let challengePreviewRenderer = null;
  let challengePreviewScene = null;
  let challengePreviewCamera = null;
  let challengePreviewVisual = null;
  let challengeGuideVisual = null;
  let challengeSpinState = null;
  let challengePreviewHideAt = 0;
  let challengeCheckAt = 0;
  let challengeAdvanceAt = 0;
  let challengeAdvanceIndex = -1;
  let challengeComplete = false;
  let challengeStatusText = 'build the model';
  let challengeStartedAt = performance.now();
  let challengeFinalScore = null;
  let challengeLastScorePaint = -1;
  let mobilePartsMode = innerWidth <= MOBILE_BREAKPOINT;
  let spawnMotion = null;
  let lastTouchTap = null;
  let mobileSelectionReleaseAt = 0;
  let undoStack = [];

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
  const heldMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: .56 });
  const snapMaterial = new THREE.LineBasicMaterial({ color: 0xef5b2a, transparent: true, opacity: .72, depthTest: false });
  const ghostMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .12 });
  const challengeGuideMaterial = new THREE.LineBasicMaterial({
    color: 0xef5b2a,
    transparent: true,
    opacity: .18,
    depthTest: false
  });
  const challengePreviewEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x11110f,
    transparent: true,
    opacity: .24
  });
  const challengePreviewFaceMaterial = new THREE.MeshBasicMaterial({
    color: 0x11110f,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf3f1ea });

  const floorGeometry = new THREE.BoxGeometry(44, .08, 40);
  const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
  floorMesh.position.set(0, FLOOR_LEVEL - .04, -1.5);
  scene.add(floorMesh);

  const grid = new THREE.GridHelper(14.4, 24, 0x24231f, 0x24231f);
  grid.position.set(0, FLOOR_LEVEL + .008, 0);
  grid.material.transparent = true;
  grid.material.opacity = .075;
  scene.add(grid);

  const snapGuide = new THREE.Group();
  snapGuide.visible = false;
  snapGuide.renderOrder = 8;
  scene.add(snapGuide);

  const challengeGuideGroup = new THREE.Group();
  challengeGuideGroup.visible = false;
  challengeGuideGroup.renderOrder = 7;
  scene.add(challengeGuideGroup);

  if (challengePreview) {
    challengePreviewScene = new THREE.Scene();
    challengePreviewCamera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    challengePreviewRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power'
    });
    challengePreviewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    challengePreviewRenderer.setClearColor(0x000000, 0);
    challengePreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    challengePreview.append(challengePreviewRenderer.domElement);
  }

  function pieceFamily(name) {
    return name.replace(/ \d{2}$/, '');
  }

  function definitionForFamily(family) {
    return BLOCKS.find(definition => pieceFamily(definition.name) === family);
  }

  const PART_FAMILIES = [...new Set(BLOCKS.map(definition => pieceFamily(definition.name)))];

  function iconShapeVertices(shape) {
    const vertices = [];
    if (shape.kind === 'cylinder') {
      for (const y of [-shape.height / 2, shape.height / 2]) {
        for (let index = 0; index < 16; index += 1) {
          const angle = index / 16 * Math.PI * 2;
          vertices.push([
            Math.cos(angle) * shape.radius + shape.at[0],
            y + shape.at[1],
            Math.sin(angle) * shape.radius + shape.at[2]
          ]);
        }
      }
      return vertices;
    }

    if (shape.kind === 'gable' || shape.kind === 'ramp' || shape.kind === 'sector') {
      const data = createProfileData(shape);
      for (let index = 0; index < data.vertices.length; index += 3) {
        vertices.push([
          data.vertices[index] + shape.at[0],
          data.vertices[index + 1] + shape.at[1],
          data.vertices[index + 2] + shape.at[2]
        ]);
      }
      return vertices;
    }

    const [width, height, depth] = shape.size;
    for (const x of [-width / 2, width / 2]) {
      for (const y of [-height / 2, height / 2]) {
        for (const z of [-depth / 2, depth / 2]) {
          vertices.push([x + shape.at[0], y + shape.at[1], z + shape.at[2]]);
        }
      }
    }
    return vertices;
  }

  function iconProjection(vertex) {
    const [x, y, z] = vertex;
    return { x: (x - z) * .86, y: (x + z) * .3 - y * 1.05 };
  }

  function convexHull(points) {
    if (points.length < 3) return points;
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y)
      - (a.y - origin.y) * (b.x - origin.x);
    const lower = [];
    for (const point of sorted) {
      while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (const point of sorted.reverse()) {
      while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function drawPartIcon(canvas, definition) {
    const width = canvas.width;
    const height = canvas.height;
    const projectedShapes = definition.shapes.map(shape => iconShapeVertices(shape).map(iconProjection));
    const points = projectedShapes.flat();
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const scale = Math.min((width - 18) / Math.max(maxX - minX, .1), (height - 14) / Math.max(maxY - minY, .1));
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;

    for (const pointsForShape of projectedShapes) {
      const hull = convexHull(pointsForShape);
      if (!hull.length) continue;
      ctx.beginPath();
      hull.forEach((point, index) => {
        const x = width / 2 + (point.x - centreX) * scale;
        const y = height / 2 + (point.y - centreY) * scale;
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = '#171613';
      ctx.fill();
      ctx.strokeStyle = 'rgba(243,241,234,.74)';
      ctx.stroke();
    }
  }

  function updatePartsTray() {
    if (!partsRail) return;
    for (const button of partsRail.querySelectorAll('[data-part-family]')) {
      const family = button.dataset.partFamily;
      const total = BLOCKS.filter(definition => pieceFamily(definition.name) === family).length;
      const remaining = pieces.length
        ? pieces.filter(piece => pieceFamily(piece.name) === family && piece.inTray).length
        : total;
      button.disabled = remaining === 0 || !mobilePartsMode || !!spawnMotion;
      button.setAttribute('aria-label', `Insert ${family}, ${remaining} remaining`);
      const count = button.querySelector('.parts-tray__count');
      if (count) count.textContent = String(remaining);
    }
  }

  function setupPartsTray() {
    if (!partsRail) return;
    partsRail.replaceChildren();
    for (const family of PART_FAMILIES) {
      const definition = definitionForFamily(family);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'parts-tray__part';
      button.dataset.partFamily = family;

      const canvas = document.createElement('canvas');
      canvas.className = 'parts-tray__icon';
      canvas.width = 128;
      canvas.height = 72;
      canvas.setAttribute('aria-hidden', 'true');
      drawPartIcon(canvas, definition);

      const name = document.createElement('span');
      name.className = 'parts-tray__name';
      name.textContent = family;
      const count = document.createElement('span');
      count.className = 'parts-tray__count';

      button.append(canvas, name, count);
      partsRail.append(button);
    }
    updatePartsTray();
  }

  function disposeChallengeVisual(visual) {
    if (!visual) return null;
    visual.group.removeFromParent();
    for (const geometry of visual.geometries) geometry.dispose();
    return null;
  }

  function createChallengeVisual(challenge, edge, face = null) {
    const group = new THREE.Group();
    const geometries = [];

    for (const target of challenge.targets) {
      const definition = definitionForFamily(target.family);
      if (!definition) continue;
      const pieceGroup = new THREE.Group();
      pieceGroup.position.set(...target.position);
      pieceGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), target.rotation);

      for (const shape of definition.shapes) {
        const geometry = createShapeGeometry(shape);
        const outlineGeometry = new THREE.EdgesGeometry(geometry, 18);
        geometries.push(geometry, outlineGeometry);

        if (face) {
          const surface = new THREE.Mesh(geometry, face);
          surface.position.set(...shape.at);
          pieceGroup.add(surface);
        }

        const outline = new THREE.LineSegments(outlineGeometry, edge);
        outline.position.set(...shape.at);
        outline.renderOrder = 7;
        pieceGroup.add(outline);
      }

      group.add(pieceGroup);
    }

    return { group, geometries };
  }

  function getChallengeBounds(challenge) {
    const rotation = new THREE.Quaternion();
    let bounds = null;

    for (const target of challenge.targets) {
      const definition = definitionForFamily(target.family);
      if (!definition) continue;
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), target.rotation);
      const targetBounds = getWorldBounds(
        definition.shapes,
        new THREE.Vector3(...target.position),
        rotation
      );
      if (!bounds) {
        bounds = { ...targetBounds };
        continue;
      }
      bounds.minX = Math.min(bounds.minX, targetBounds.minX);
      bounds.maxX = Math.max(bounds.maxX, targetBounds.maxX);
      bounds.minY = Math.min(bounds.minY, targetBounds.minY);
      bounds.maxY = Math.max(bounds.maxY, targetBounds.maxY);
      bounds.minZ = Math.min(bounds.minZ, targetBounds.minZ);
      bounds.maxZ = Math.max(bounds.maxZ, targetBounds.maxZ);
    }

    if (!bounds) return null;
    bounds.centreX = (bounds.minX + bounds.maxX) / 2;
    bounds.centreY = (bounds.minY + bounds.maxY) / 2;
    bounds.centreZ = (bounds.minZ + bounds.maxZ) / 2;
    bounds.width = bounds.maxX - bounds.minX;
    bounds.height = bounds.maxY - bounds.minY;
    bounds.depth = bounds.maxZ - bounds.minZ;
    return bounds;
  }

  function resizeChallengePreview() {
    if (!challengePreviewRenderer || !challengePreviewCamera || !challengePreview) return;
    const width = Math.max(1, challengePreview.clientWidth);
    const height = Math.max(1, challengePreview.clientHeight);
    challengePreviewRenderer.setSize(width, height, false);
    challengePreviewCamera.aspect = width / height;
    challengePreviewCamera.updateProjectionMatrix();
  }

  function setChallengeStatus(text, complete = false) {
    if (challengeStatusText === text && challengeStatus?.classList.contains('is-complete') === complete) return;
    challengeStatusText = text;
    if (challengeStatus) {
      challengeStatus.textContent = text;
      challengeStatus.classList.toggle('is-complete', complete);
    }
  }

  function currentChallengeScore(now = performance.now()) {
    if (challengeFinalScore != null) return challengeFinalScore;
    const elapsed = Math.max(0, Math.floor((now - challengeStartedAt) / 1000) - 12);
    const timePenalty = Math.min(620, elapsed * 2);
    return Math.max(100, CHALLENGE_BASE_SCORE - HINT_COSTS[challengeHintUsedLevel] - timePenalty);
  }

  function paintChallengeScore(now = performance.now(), force = false) {
    if (!challengeScore) return;
    const score = activeChallengeIndex < 0 ? null : currentChallengeScore(now);
    if (!force && score === challengeLastScorePaint) return;
    challengeLastScorePaint = score;
    challengeScore.hidden = score == null;
    if (score == null) return;
    challengeScore.textContent = String(score);
    challengeScore.setAttribute('aria-label', `Current score ${score}`);
  }

  function resetChallengeAttempt() {
    challengeHintLevel = 0;
    challengeHintUsedLevel = 0;
    challengeGuideEnabled = false;
    challengeStartedAt = performance.now();
    challengeFinalScore = null;
    challengeLastScorePaint = -1;
    challengeCheckAt = 0;
  }

  function updateUndoUI() {
    if (undoButton) undoButton.disabled = undoStack.length === 0;
  }

  function captureBoardState() {
    return pieces.map(piece => {
      const position = piece.body.translation();
      const rotation = piece.body.rotation();
      return {
        name: piece.name,
        inTray: piece.inTray,
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w]
      };
    });
  }

  function pushUndoState(snapshot = captureBoardState()) {
    undoStack.push(snapshot);
    if (undoStack.length > 30) undoStack.shift();
    updateUndoUI();
  }

  function restoreBoardState(snapshot) {
    if (!snapshot?.length) return;
    if (selected) releaseSelected(false);
    active = null;
    clusterSettle = null;
    spawnMotion = null;
    mobileSelectionReleaseAt = 0;
    lastTouchTap = null;
    for (const hold of [...holds]) releaseHold(hold);

    for (const saved of snapshot) {
      const piece = pieces.find(candidate => candidate.name === saved.name);
      if (!piece) continue;
      setPieceInTray(piece, saved.inTray);
      if (saved.inTray) continue;
      piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      piece.body.recomputeMassPropertiesFromColliders();
      piece.body.setTranslation({ x: saved.position[0], y: saved.position[1], z: saved.position[2] }, true);
      piece.body.setRotation({ x: saved.rotation[0], y: saved.rotation[1], z: saved.rotation[2], w: saved.rotation[3] }, true);
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.wakeUp();
      piece.targetPosition.set(...saved.position);
      piece.controlPosition.set(...saved.position);
      piece.targetRotation.set(...saved.rotation);
      piece.controlRotation.set(...saved.rotation);
      setPieceCarryFriction(piece, false);
      setPieceEdges(piece, restingEdgeMaterial(piece));
    }

    clearSnapGuide();
    clearChallengeMarks(true);
    updateSelectionUI();
    updatePartsTray();
    setInstruction('undone');
  }

  function undoLastAction() {
    const snapshot = undoStack.pop();
    if (!snapshot) return;
    restoreBoardState(snapshot);
    updateUndoUI();
  }

  function hideChallengeSuccess() {
    challengeAdvanceAt = 0;
    challengeAdvanceIndex = -1;
    if (!challengeSuccess) return;
    challengeSuccess.classList.remove('is-visible');
    challengeSuccess.setAttribute('aria-hidden', 'true');
  }

  function showChallengeSuccess(index) {
    if (!challengeSuccess) return;
    const nextIndex = index + 1;
    challengeSuccessNext.textContent = nextIndex < CHALLENGES.length
      ? `next · ${String(nextIndex + 1).padStart(2, '0')}`
      : 'all ten complete';
    challengeSuccess.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => challengeSuccess.classList.add('is-visible'));
  }

  function saveChallengeScore() {
    if (activeChallengeIndex < 0) return;
    const score = currentChallengeScore();
    challengeFinalScore = score;
    try {
      const key = `sudu-blocks-best-${activeChallengeIndex + 1}`;
      const previous = Number(localStorage.getItem(key) || 0);
      if (score > previous) localStorage.setItem(key, String(score));
      localStorage.setItem(`sudu-blocks-complete-${activeChallengeIndex + 1}`, '1');
      if (challengeScore) challengeScore.title = `Best ${Math.max(previous, score)}`;
    } catch (error) {}
    challengeButtons[activeChallengeIndex]?.classList.add('is-complete');
    paintChallengeScore(performance.now(), true);
  }

  function restoreChallengeCompletions() {
    try {
      challengeButtons.forEach((button, index) => {
        const complete = localStorage.getItem(`sudu-blocks-complete-${index + 1}`) === '1';
        button.classList.toggle('is-complete', complete);
        if (complete) button.setAttribute('aria-label', `Challenge ${index + 1}, complete`);
      });
    } catch (error) {}
  }

  function updateChallengePanel() {
    const challenge = CHALLENGES[activeChallengeIndex] || null;
    challengeButtons.forEach((button, index) => {
      button.setAttribute('aria-selected', String(index === activeChallengeIndex));
    });
    challengeFree?.setAttribute('aria-pressed', String(!challenge));
    if (challengeLedger) challengeLedger.classList.toggle('is-free', !challenge);

    if (!challenge) {
      if (challengeIndex) challengeIndex.textContent = 'free';
      if (challengeLevel) challengeLevel.textContent = 'open study';
      if (challengeTitle) challengeTitle.textContent = 'free build';
      if (challengeCue) challengeCue.textContent = 'Use the full kit without a target.';
      if (challengeGuide) {
        challengeGuide.disabled = true;
        challengeGuide.textContent = 'hint';
        challengeGuide.setAttribute('aria-pressed', 'false');
      }
      if (challengeDone) challengeDone.disabled = true;
      paintChallengeScore(performance.now(), true);
      setChallengeStatus('arrange freely');
      return;
    }

    if (challengeIndex) challengeIndex.textContent = String(activeChallengeIndex + 1).padStart(2, '0') + ' / 10';
    if (challengeLevel) challengeLevel.textContent = challenge.level;
    if (challengeTitle) challengeTitle.textContent = challenge.title;
    if (challengeCue) {
      const families = [...new Set(challenge.targets.map(target => target.family))].join(', ');
      if (challengeHintLevel === 1) challengeCue.textContent = `${challenge.cue} Pieces: ${families}.`;
      else if (challengeHintLevel === 2) challengeCue.textContent = `${challenge.cue} The light model marks exact positions.`;
      else challengeCue.textContent = challenge.cue;
    }
    if (challengeGuide) {
      challengeGuide.disabled = false;
      challengeGuide.textContent = challengeHintLevel === 0 ? 'hint' : challengeHintLevel === 1 ? 'hint +' : 'hide hint';
      challengeGuide.setAttribute('aria-pressed', String(challengeGuideEnabled));
    }
    if (challengeDone) challengeDone.disabled = challengeComplete;
    paintChallengeScore(performance.now(), true);
    setChallengeStatus(challengeComplete ? 'complete · choose the next' : 'build the model', challengeComplete);
  }

  function refreshChallengeVisuals() {
    challengePreviewVisual = disposeChallengeVisual(challengePreviewVisual);
    challengeGuideVisual = disposeChallengeVisual(challengeGuideVisual);
    challengeGuideGroup.clear();

    const challenge = CHALLENGES[activeChallengeIndex] || null;
    if (!challenge) {
      challengeGuideGroup.visible = false;
      challengeLedger?.classList.remove('is-preview-open');
      challengePreviewHideAt = 0;
      updateChallengePanel();
      return;
    }

    if (challengePreviewScene) {
      challengePreviewVisual = createChallengeVisual(
        challenge,
        challengePreviewEdgeMaterial,
        challengePreviewFaceMaterial
      );
      challengePreviewScene.add(challengePreviewVisual.group);
      const bounds = getChallengeBounds(challenge);
      if (bounds && challengePreviewCamera) {
        const centre = new THREE.Vector3(bounds.centreX, bounds.centreY, bounds.centreZ);
        const span = Math.max(bounds.width, bounds.height, bounds.depth, 3);
        const direction = new THREE.Vector3(1, .72, 1).normalize().multiplyScalar(span * 2.85);
        challengePreviewCamera.position.copy(centre).add(direction);
        challengePreviewCamera.lookAt(centre);
      }
    }

    if (challengeGuideEnabled) {
      challengeGuideMaterial.opacity = challengeHintLevel === 1 ? .1 : .22;
      challengeGuideVisual = createChallengeVisual(challenge, challengeGuideMaterial);
      challengeGuideGroup.add(challengeGuideVisual.group);
      challengeGuideGroup.visible = true;
    } else {
      challengeGuideGroup.visible = false;
    }

    resizeChallengePreview();
    updateChallengePanel();
  }

  function startChallengeSpin() {
    if (!challengePreviewVisual) return;
    if (mobilePartsMode && challengeLedger) {
      challengeLedger.classList.add('is-preview-open');
      challengePreviewHideAt = performance.now() + (reducedMotion ? 2200 : 4200);
    }
    if (reducedMotion) {
      challengePreviewVisual.group.rotation.y += Math.PI / 2;
      challengeSpinState = null;
      return;
    }
    challengeSpinState = {
      start: performance.now(),
      duration: 3600,
      from: challengePreviewVisual.group.rotation.y
    };
  }

  function updateChallengePreview(now) {
    if (!challengePreviewRenderer || !challengePreviewScene || !challengePreviewCamera) return;

    if (challengeSpinState && challengePreviewVisual) {
      const progress = THREE.MathUtils.clamp(
        (now - challengeSpinState.start) / challengeSpinState.duration,
        0,
        1
      );
      const eased = progress * progress * (3 - 2 * progress);
      challengePreviewVisual.group.rotation.y = challengeSpinState.from + eased * Math.PI * 2;
      if (progress >= 1) challengeSpinState = null;
    }

    if (mobilePartsMode && challengePreviewHideAt && now >= challengePreviewHideAt) {
      challengeLedger?.classList.remove('is-preview-open');
      challengePreviewHideAt = 0;
    }

    challengePreviewRenderer.render(challengePreviewScene, challengePreviewCamera);
  }

  function chooseChallenge(index) {
    hideChallengeSuccess();
    activeChallengeIndex = index;
    challengeComplete = false;
    resetChallengeAttempt();
    rebuild();
    startChallengeSpin();
  }

  function toggleChallengeGuide() {
    if (activeChallengeIndex < 0) return;
    challengeHintLevel = (challengeHintLevel + 1) % 3;
    challengeHintUsedLevel = Math.max(challengeHintUsedLevel, challengeHintLevel);
    challengeGuideEnabled = challengeHintLevel > 0;
    refreshChallengeVisuals();
  }

  function yawFromQuaternion(rotation) {
    const longAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    return Math.atan2(-longAxis.z, longAxis.x);
  }

  function angleDistance(a, b) {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  const ORIENTATION_FREE_FAMILIES = new Set(['unit', 'column', 'core', 'round tower']);

  function matchChallengeAtTransform(challenge, quarterTurn, translation, requireStable) {
    const unused = new Set(pieces);
    const matched = [];
    const axis = new THREE.Vector3(0, 1, 0);

    for (const target of challenge.targets) {
      const expected = new THREE.Vector3(...target.position).applyAxisAngle(axis, quarterTurn).add(translation);
      const expectedYaw = target.rotation + quarterTurn;
      let best = null;

      for (const piece of unused) {
        if (piece.inTray || piece.spawning) continue;
        if (pieceFamily(piece.name) !== target.family) continue;
        const position = bodyPosition(piece);
        const distance = position.distanceTo(expected);
        if (distance > .36) continue;

        const rotation = bodyRotation(piece);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
        if (up.y < .965) continue;
        if (!ORIENTATION_FREE_FAMILIES.has(target.family)
          && angleDistance(yawFromQuaternion(rotation), expectedYaw) > .18) continue;

        if (requireStable) {
          if (piece.hold || !piece.body.isDynamic()) continue;
          const velocity = piece.body.linvel();
          const angularVelocity = piece.body.angvel();
          if (Math.hypot(velocity.x, velocity.y, velocity.z) > .12) continue;
          if (Math.hypot(angularVelocity.x, angularVelocity.y, angularVelocity.z) > .18) continue;
        }

        if (!best || distance < best.distance) best = { piece, distance };
      }

      if (!best) return null;
      unused.delete(best.piece);
      matched.push(best.piece);
    }

    return matched;
  }

  function matchChallenge(challenge, requireStable = false) {
    if (!challenge?.targets.length) return null;
    const anchor = challenge.targets[0];
    const anchorPieces = pieces.filter(piece => !piece.inTray && !piece.spawning && pieceFamily(piece.name) === anchor.family);
    const axis = new THREE.Vector3(0, 1, 0);

    for (const anchorPiece of anchorPieces) {
      for (let turn = 0; turn < 4; turn += 1) {
        const quarterTurn = turn * Math.PI / 2;
        const rotatedAnchor = new THREE.Vector3(...anchor.position).applyAxisAngle(axis, quarterTurn);
        const translation = bodyPosition(anchorPiece).sub(rotatedAnchor);
        if (Math.abs(translation.y) > .26) continue;
        const match = matchChallengeAtTransform(challenge, quarterTurn, translation, requireStable);
        if (match) return match;
      }
    }

    return null;
  }

  function partialChallengeMatchAtTransform(challenge, quarterTurn, translation) {
    const unused = new Set(pieces.filter(piece => !piece.inTray && !piece.spawning));
    const matched = [];
    const axis = new THREE.Vector3(0, 1, 0);
    let error = 0;

    for (const target of challenge.targets) {
      const expected = new THREE.Vector3(...target.position).applyAxisAngle(axis, quarterTurn).add(translation);
      const expectedYaw = target.rotation + quarterTurn;
      let best = null;

      for (const piece of unused) {
        if (pieceFamily(piece.name) !== target.family) continue;
        const position = bodyPosition(piece);
        const distance = position.distanceTo(expected);
        if (distance > .42) continue;
        const rotation = bodyRotation(piece);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
        if (up.y < .955) continue;
        if (!ORIENTATION_FREE_FAMILIES.has(target.family)
          && angleDistance(yawFromQuaternion(rotation), expectedYaw) > .22) continue;
        if (!best || distance < best.distance) best = { piece, distance };
      }

      if (!best) continue;
      unused.delete(best.piece);
      matched.push(best.piece);
      error += best.distance;
    }

    return { matched, error };
  }

  function partialChallengeMatch(challenge) {
    const axis = new THREE.Vector3(0, 1, 0);
    const available = pieces.filter(piece => !piece.inTray && !piece.spawning);
    let best = { matched: [], error: Infinity };

    for (const target of challenge.targets) {
      for (const piece of available) {
        if (pieceFamily(piece.name) !== target.family) continue;
        for (let turn = 0; turn < 4; turn += 1) {
          const quarterTurn = turn * Math.PI / 2;
          const rotatedTarget = new THREE.Vector3(...target.position).applyAxisAngle(axis, quarterTurn);
          const translation = bodyPosition(piece).sub(rotatedTarget);
          const candidate = partialChallengeMatchAtTransform(challenge, quarterTurn, translation);
          if (candidate.matched.length > best.matched.length
            || (candidate.matched.length === best.matched.length && candidate.error < best.error)) {
            best = candidate;
          }
        }
      }
    }

    return best;
  }

  function clearChallengeMarks(resetStatus = false) {
    for (const piece of pieces) {
      if (!piece.checkedCorrect) continue;
      piece.checkedCorrect = false;
      if (piece !== selected && piece !== hovered) setPieceEdges(piece, restingEdgeMaterial(piece));
    }
    if (resetStatus && activeChallengeIndex >= 0 && !challengeComplete) setChallengeStatus('build the model');
  }

  function performChallengeCheck() {
    const challenge = CHALLENGES[activeChallengeIndex];
    if (!challenge || challengeComplete) return;
    clearChallengeMarks();
    const result = partialChallengeMatch(challenge);
    for (const piece of result.matched) {
      piece.checkedCorrect = true;
      if (piece !== hovered) setPieceEdges(piece, selectedMaterial);
    }

    if (result.matched.length < challenge.targets.length) {
      setChallengeStatus(`${result.matched.length} / ${challenge.targets.length} right`);
      return;
    }

    if (!matchChallenge(challenge, true)) {
      setChallengeStatus('shape right · settle and press done');
      return;
    }

    challengeComplete = true;
    saveChallengeScore();
    if (challengeDone) challengeDone.disabled = true;
    setChallengeStatus('correct', true);
    showChallengeSuccess(activeChallengeIndex);
    challengeAdvanceIndex = activeChallengeIndex + 1 < CHALLENGES.length
      ? activeChallengeIndex + 1
      : -1;
    challengeAdvanceAt = performance.now() + (reducedMotion ? 700 : 1650);
  }

  function requestChallengeCheck() {
    if (activeChallengeIndex < 0 || challengeComplete) return;
    if (selected) releaseSelected();
    clearChallengeMarks();
    challengeCheckAt = performance.now() + (reducedMotion ? 20 : 760);
    setChallengeStatus('checking');
  }

  function updateChallengeProgress() {
    if (challengeAdvanceAt && performance.now() >= challengeAdvanceAt) {
      const nextIndex = challengeAdvanceIndex;
      hideChallengeSuccess();
      if (nextIndex >= 0) chooseChallenge(nextIndex);
      else setChallengeStatus('all ten complete', true);
      return;
    }
    if (!challengeCheckAt || performance.now() < challengeCheckAt) return;
    if (active || selected || clusterSettle || spawnMotion) return;
    challengeCheckAt = 0;
    performChallengeCheck();
  }

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
    const phone = innerWidth <= MOBILE_BREAKPOINT;
    const tablet = innerWidth < 980;
    orbitMinRadius = phone ? 21 : tablet ? 20 : 19;
    orbitMaxRadius = phone ? 40 : tablet ? 41 : 42;

    if (!cameraConfigured) {
      orbitRadius = phone ? MOBILE_MODEL_RADIUS : tablet ? 30 : MODEL_RADIUS;
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
    resizeChallengePreview();
  }

  function setPieceEdges(piece, material) {
    for (const edge of piece.edges) edge.material = material;
  }

  function restingEdgeMaterial(piece) {
    if (piece.checkedCorrect) return selectedMaterial;
    return piece.hold ? heldMaterial : edgeMaterial;
  }

  function setHover(piece) {
    if (hovered === piece) return;
    if (hovered && hovered !== selected) setPieceEdges(hovered, restingEdgeMaterial(hovered));
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
    if (returnButton) returnButton.disabled = !enabled;
  }

  function setPieceCarryFriction(piece, carrying) {
    const friction = carrying ? CARRY_FRICTION : BLOCK_FRICTION;
    for (const collider of piece.colliders) collider.setFriction(friction);
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
      if (target === piece || target.inTray || target.spawning) continue;
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
    setPieceCarryFriction(selected, false);
    selected.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    selected.body.recomputeMassPropertiesFromColliders();
    selected.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    selected.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const released = selected;
    setPieceEdges(selected, selected === hovered ? hoverMaterial : restingEdgeMaterial(selected));
    selected = null;
    active = null;
    clearSnapGuide();
    stage.classList.remove('is-dragging');
    setInstruction(DEFAULT_INSTRUCTION);
    updateSelectionUI();
    wakeTouchingCluster(released);
  }

  function wakeTouchingCluster(root) {
    if (!root) return;
    for (const piece of findTouchingCluster(root).order) {
      if (piece.body.isDynamic()) piece.body.wakeUp();
    }
  }

  function releaseHold(hold) {
    if (!hold) return;
    holds = holds.filter(candidate => candidate !== hold);
    const released = [];

    for (const piece of hold.pieces) {
      if (piece.hold !== hold) continue;
      piece.hold = null;
      piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      piece.body.recomputeMassPropertiesFromColliders();
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      setPieceEdges(piece, piece === hovered ? hoverMaterial : restingEdgeMaterial(piece));
      released.push(piece);
    }

    for (const piece of released) wakeTouchingCluster(piece);
  }

  function selectPiece(piece) {
    if (selected && selected !== piece) releaseSelected();
    if (!challengeComplete) {
      challengeCheckAt = 0;
      clearChallengeMarks(true);
    }
    if (piece.inTray) setPieceInTray(piece, false);
    for (const collider of piece.colliders) collider.setEnabled(true);
    if (piece.hold) releaseHold(piece.hold);
    wakeTouchingCluster(piece);
    selected = piece;
    const position = bodyPosition(piece);
    const rotation = uprightRotation(piece);
    piece.targetPosition.copy(position);
    piece.targetPosition.y = Math.max(piece.halfHeight + FLOOR_LEVEL, piece.targetPosition.y);
    piece.targetRotation.copy(rotation);
    piece.controlPosition.copy(piece.targetPosition);
    piece.controlRotation.copy(piece.targetRotation);
    setPieceCarryFriction(piece, true);
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
        if (parents.has(candidate) || candidate.inTray || candidate.spawning) continue;
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
    const level = FLOOR_LEVEL + Math.round((bounds.minY - FLOOR_LEVEL) / GRID) * GRID;
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
    const hold = {
      pieces: new Set(completed.items.map(item => item.piece)),
      releaseAt: performance.now() + HOLD_DURATION
    };
    holds.push(hold);

    for (const item of completed.items) {
      item.piece.body.setTranslation(item.targetPosition, true);
      item.piece.body.setRotation(item.targetRotation, true);
      setPieceCarryFriction(item.piece, false);
      item.piece.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      item.piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      item.piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      item.piece.hold = hold;
      item.piece.group.position.copy(item.targetPosition);
      item.piece.group.quaternion.copy(item.targetRotation);
      setPieceEdges(item.piece, item.piece === hovered ? hoverMaterial : heldMaterial);
    }

    setInstruction('held 10s · add a counterbalance');
  }

  function updateHolds(now) {
    let longestRemaining = 0;

    for (const hold of [...holds]) {
      const remaining = hold.releaseAt - now;
      if (remaining > 0) {
        longestRemaining = Math.max(longestRemaining, remaining);
        continue;
      }

      releaseHold(hold);
    }

    if (!active && !selected && !clusterSettle) {
      if (longestRemaining > 0) {
        setInstruction(`held ${Math.ceil(longestRemaining / 1000)}s · add a counterbalance`);
      } else {
        setInstruction(DEFAULT_INSTRUCTION);
      }
    }
  }

  function alignTouchingCluster(root) {
    if (!root || clusterSettle) return;
    pushUndoState();
    if (selected) releaseSelected(false);
    setHover(null);

    const cluster = findTouchingCluster(root);
    const existingHolds = new Set(cluster.order.map(piece => piece.hold).filter(Boolean));
    for (const hold of existingHolds) releaseHold(hold);
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
      .setFriction(BLOCK_FRICTION)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0);
  }

  function setPieceInTray(piece, inTray) {
    piece.inTray = inTray;
    piece.spawning = false;
    piece.group.visible = !inTray;
    for (const collider of piece.colliders) collider.setEnabled(!inTray);
    if (inTray) {
      if (piece.hold) releaseHold(piece.hold);
      piece.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  function findMobileStagingPosition(piece) {
    const candidates = [
      [0, -.6], [2.4, -.6], [-2.4, -.6], [0, 1.8], [0, -3],
      [4.8, -.6], [-4.8, -.6], [2.4, 1.8], [-2.4, 1.8]
    ];
    const rotation = piece.homeRotation;

    for (const [x, z] of candidates) {
      const position = new THREE.Vector3(x, piece.halfHeight + FLOOR_LEVEL, z);
      const bounds = getWorldBounds(piece.shapes, position, rotation);
      const occupied = pieces.some(target => {
        if (target === piece || target.inTray || target.spawning) return false;
        const targetBounds = getWorldBounds(target.shapes, bodyPosition(target), bodyRotation(target));
        return overlap(bounds.minX, bounds.maxX, targetBounds.minX, targetBounds.maxX) > .16
          && overlap(bounds.minZ, bounds.maxZ, targetBounds.minZ, targetBounds.maxZ) > .16;
      });
      if (!occupied) return position;
    }

    return new THREE.Vector3(0, piece.halfHeight + FLOOR_LEVEL, -.6);
  }

  function finishSpawnMotion() {
    if (!spawnMotion) return;
    const { piece, target } = spawnMotion;
    piece.body.setTranslation(target, true);
    piece.targetPosition.copy(target);
    piece.controlPosition.copy(target);
    piece.spawning = false;
    for (const collider of piece.colliders) collider.setEnabled(true);
    setPieceCarryFriction(piece, false);
    piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    // Tray colliders were disabled: Dynamic alone leaves Rapier with zero mass.
    piece.body.recomputeMassPropertiesFromColliders();
    piece.body.setLinvel({ x: 0, y: -.2, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.wakeUp();
    setPieceEdges(piece, restingEdgeMaterial(piece));
    spawnMotion = null;
    setInstruction('tap and drag · double-tap holds 10s');
    updateSelectionUI();
    updatePartsTray();
  }

  function updateSpawnMotion(now) {
    if (!spawnMotion) return;
    const progress = THREE.MathUtils.clamp(
      (now - spawnMotion.startedAt) / (spawnMotion.duration * 1000),
      0,
      1
    );
    const eased = reducedMotion ? 1 : 1 - Math.pow(1 - progress, 3);
    const position = spawnMotion.start.clone().lerp(spawnMotion.target, eased);
    spawnMotion.piece.body.setNextKinematicTranslation(position);
    spawnMotion.piece.body.setNextKinematicRotation(spawnMotion.piece.homeRotation);
    if (progress >= 1) finishSpawnMotion();
  }

  function spawnPieceFromTray(family) {
    if (!mobilePartsMode || spawnMotion || clusterSettle) return;
    const piece = pieces.find(candidate => candidate.inTray && pieceFamily(candidate.name) === family);
    if (!piece) return;
    if (selected) releaseSelected();
    pushUndoState();

    const target = findMobileStagingPosition(piece);
    target.y = suggestedCarryHeight(piece, target.x, target.z, target.y) + .9;
    const start = target.clone();
    start.y += 3.3;
    setPieceInTray(piece, false);
    piece.spawning = true;
    piece.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    piece.body.setTranslation(start, true);
    piece.body.setRotation(piece.homeRotation, true);
    piece.targetRotation.copy(piece.homeRotation);
    piece.controlRotation.copy(piece.homeRotation);
    for (const collider of piece.colliders) collider.setEnabled(false);
    spawnMotion = {
      piece,
      start,
      target,
      startedAt: performance.now(),
      duration: SPAWN_DURATION
    };
    setInstruction(`${family} · placing`);
    updatePartsTray();
  }

  function rebuild() {
    resetChallengeAttempt();
    clusterSettle = null;
    spawnMotion = null;
    challengeComplete = false;
    undoStack = [];
    holds = [];
    releaseSelected(false);
    disposePieces();
    setHover(null);
    accumulator = 0;
    last = performance.now();
    topView = false;
    orbitTargetElevation = MODEL_ELEVATION;
    orbitTargetRadius = mobilePartsMode ? MOBILE_MODEL_RADIUS : innerWidth < 980 ? 30 : MODEL_RADIUS;
    if (viewButton) viewButton.textContent = 'top';

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.integrationParameters.numSolverIterations = 8;
    world.integrationParameters.numInternalPgsIterations = 2;
    world.integrationParameters.maxCcdSubsteps = 2;
    const ground = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, FLOOR_LEVEL - .08, -1.5)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(22, .08, 20)
        .setFriction(GROUND_FRICTION)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
      ground
    );

    for (const definition of BLOCKS) {
      const yaw = definition.rotation || 0;
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(...definition.position)
          .setRotation(rotation)
          .setLinearDamping(LINEAR_DAMPING)
          .setAngularDamping(ANGULAR_DAMPING)
          .setAdditionalSolverIterations(SOLVER_ITERATIONS)
          .setCcdEnabled(true)
          .setSoftCcdPrediction(SOFT_CCD_PREDICTION)
      );

      const group = new THREE.Group();
      group.position.set(...definition.position);
      group.quaternion.copy(rotation);
      const edges = [];
      const geometries = [];
      const shapes = [];
      const colliders = [];
      const pieceIndex = pieces.length;

      for (const shape of definition.shapes) {
        const [x, y, z] = shape.at;
        const geometry = createShapeGeometry(shape);
        const collider = world.createCollider(createShapeCollider(shape, geometry), body);
        colliders.push(collider);

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
      const piece = {
        name: definition.name,
        halfHeight: definition.halfHeight,
        body,
        group,
        edges,
        shapes,
        colliders,
        geometries,
        targetPosition: new THREE.Vector3(...definition.position),
        targetRotation: rotation.clone(),
        controlPosition: new THREE.Vector3(...definition.position),
        controlRotation: rotation.clone(),
        homePosition: new THREE.Vector3(...definition.position),
        homeRotation: rotation.clone(),
        hold: null,
        inTray: false,
        spawning: false,
        checkedCorrect: false
      };
      pieces.push(piece);
      if (mobilePartsMode) setPieceInTray(piece, true);
    }

    updateSelectionUI();
    updateUndoUI();
    updatePartsTray();
    setInstruction(DEFAULT_INSTRUCTION);
    refreshChallengeVisuals();
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
    const hit = raycaster.intersectObjects(meshes, false).find(candidate => {
      const piece = pieces[candidate.object.userData.pieceIndex];
      return piece && !piece.inTray && !piece.spawning && piece.group.visible;
    });
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

  function carriedSupports(piece, position) {
    const movingBounds = getWorldBounds(piece.shapes, position, piece.targetRotation);
    const supports = new Set();

    for (const target of pieces) {
      if (target === piece || target.inTray || target.spawning) continue;
      const targetBounds = getWorldBounds(target.shapes, bodyPosition(target), bodyRotation(target));
      const overlapX = overlap(movingBounds.minX, movingBounds.maxX, targetBounds.minX, targetBounds.maxX);
      const overlapZ = overlap(movingBounds.minZ, movingBounds.maxZ, targetBounds.minZ, targetBounds.maxZ);
      const restsAbove = targetBounds.centreY > movingBounds.centreY
        && Math.abs(targetBounds.minY - movingBounds.maxY) <= CONTACT_CAPTURE;
      if (restsAbove && overlapX >= CONTACT_OVERLAP && overlapZ >= CONTACT_OVERLAP) supports.add(target);
    }

    return supports;
  }

  function updateCarriedSupports(carried, x, z) {
    const movingBounds = getWorldBounds(
      carried.piece.shapes,
      new THREE.Vector3(x, 0, z),
      carried.piece.targetRotation
    );

    for (const support of [...carried.carryIgnore]) {
      const targetBounds = getWorldBounds(support.shapes, bodyPosition(support), bodyRotation(support));
      const separatedX = movingBounds.minX - CARRY_LOOKAHEAD > targetBounds.maxX
        || movingBounds.maxX + CARRY_LOOKAHEAD < targetBounds.minX;
      const separatedZ = movingBounds.minZ - CARRY_LOOKAHEAD > targetBounds.maxZ
        || movingBounds.maxZ + CARRY_LOOKAHEAD < targetBounds.minZ;
      if (separatedX || separatedZ) carried.carryIgnore.delete(support);
    }
  }

  function suggestedCarryHeight(piece, x, z, baseY, levelOffset = 0, ignored = new Set()) {
    const planPosition = new THREE.Vector3(x, 0, z);
    const movingBounds = getWorldBounds(piece.shapes, planPosition, piece.targetRotation);
    let height = Math.max(baseY + levelOffset, FLOOR_LEVEL - movingBounds.minY);

    for (let pass = 0; pass < pieces.length; pass += 1) {
      let raised = false;
      for (const target of pieces) {
        if (target === piece || target.inTray || target.spawning || ignored.has(target)) continue;
        const targetBounds = getWorldBounds(target.shapes, bodyPosition(target), bodyRotation(target));
        const overlapsX = movingBounds.maxX + CARRY_LOOKAHEAD >= targetBounds.minX
          && movingBounds.minX - CARRY_LOOKAHEAD <= targetBounds.maxX;
        const overlapsZ = movingBounds.maxZ + CARRY_LOOKAHEAD >= targetBounds.minZ
          && movingBounds.minZ - CARRY_LOOKAHEAD <= targetBounds.maxZ;
        if (!overlapsX || !overlapsZ) continue;

        const movingMinY = movingBounds.minY + height;
        const movingMaxY = movingBounds.maxY + height;
        const passesBelow = movingMaxY <= targetBounds.minY - CARRY_PASS_GAP;
        const passesAbove = movingMinY >= targetBounds.maxY + CARRY_CLEARANCE;
        if (passesBelow || passesAbove) continue;

        const raisedHeight = targetBounds.maxY + CARRY_CLEARANCE - movingBounds.minY;
        if (raisedHeight > height + .001) {
          height = raisedHeight;
          raised = true;
        }
      }
      if (!raised) break;
    }

    return height;
  }

  function refreshActiveCarryHeight() {
    if (!active) return;
    active.carryDesired.y = suggestedCarryHeight(
      active.piece,
      active.carryDesired.x,
      active.carryDesired.z,
      active.baseY,
      active.levelOffset,
      active.carryIgnore
    );
  }

  function beginCarry(piece, event) {
    mobileSelectionReleaseAt = 0;
    selectPiece(piece);
    const origin = piece.targetPosition.clone();
    carryPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), origin);
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
      carryPosition: origin.clone(),
      baseY: origin.y,
      levelOffset: 0,
      wheelAccumulator: 0,
      carryIgnore: carriedSupports(piece, origin),
      undoSnapshot: captureBoardState()
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
      if (cancelled || carried.moved) {
        lastTouchTap = null;
        mobileSelectionReleaseAt = 0;
        if (!cancelled && carried.moved) pushUndoState(carried.undoSnapshot);
        releaseSelected(!cancelled);
      } else if (event.pointerType !== 'mouse') {
        const now = performance.now();
        const isDoubleTap = lastTouchTap
          && lastTouchTap.piece === carried.piece
          && now - lastTouchTap.at <= DOUBLE_TAP_WINDOW
          && Math.hypot(event.clientX - lastTouchTap.x, event.clientY - lastTouchTap.y) <= DOUBLE_TAP_DISTANCE;
        if (isDoubleTap) {
          lastTouchTap = null;
          mobileSelectionReleaseAt = 0;
          alignTouchingCluster(carried.piece);
        } else {
          lastTouchTap = { piece: carried.piece, at: now, x: event.clientX, y: event.clientY };
          mobileSelectionReleaseAt = now + MOBILE_SELECTION_RELEASE;
          setInstruction('selected · drag, rotate or lift');
        }
      } else if (snapCandidate) setInstruction('drag to place · release on the outline');
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
    if (clusterSettle) return;
    if (active) {
      active.wheelAccumulator += event.deltaY;
      const steps = Math.trunc(Math.abs(active.wheelAccumulator) / 45);
      if (steps) {
        const direction = Math.sign(active.wheelAccumulator);
        active.levelOffset = THREE.MathUtils.clamp(
          active.levelOffset - direction * steps * GRID,
          -12,
          12
        );
        active.wheelAccumulator -= direction * steps * 45;
        refreshActiveCarryHeight();
        setInstruction('scroll lifts · release on the outline');
      }
      return;
    }
    if (orbitGesture) return;
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
        updateCarriedSupports(active, desired.x, desired.z);
        desired.y = suggestedCarryHeight(
          active.piece,
          desired.x,
          desired.z,
          active.baseY,
          active.levelOffset,
          active.carryIgnore
        );
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
    pushUndoState();
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    turn.multiply(selected.controlRotation).normalize();
    selected.controlRotation.copy(turn);
    if (mobilePartsMode) mobileSelectionReleaseAt = performance.now() + 900;
  }

  function liftSelected(direction) {
    if (!selected) return;
    pushUndoState();
    if (active) {
      active.levelOffset = THREE.MathUtils.clamp(active.levelOffset + direction * GRID, -12, 12);
      refreshActiveCarryHeight();
      return;
    }
    selected.controlPosition.y = Math.max(
      selected.halfHeight + FLOOR_LEVEL,
      selected.controlPosition.y + direction * GRID
    );
    if (mobilePartsMode) mobileSelectionReleaseAt = performance.now() + 900;
  }

  function updateMobileSelectionRelease(now) {
    if (!mobileSelectionReleaseAt || now < mobileSelectionReleaseAt) return;
    if (!mobilePartsMode || !selected || active || clusterSettle || spawnMotion) return;
    mobileSelectionReleaseAt = 0;
    releaseSelected();
  }

  function moveSelected(x, z) {
    if (!selected) return;
    pushUndoState();
    selected.controlPosition.x = THREE.MathUtils.clamp(selected.controlPosition.x + x * GRID, -19, 19);
    selected.controlPosition.z = THREE.MathUtils.clamp(selected.controlPosition.z + z * GRID, -18, 17);
  }

  function returnSelected() {
    if (!selected) return;
    pushUndoState();
    const piece = selected;
    selected = null;
    active = null;
    mobileSelectionReleaseAt = 0;
    clearSnapGuide();
    stage.classList.remove('is-dragging');

    if (mobilePartsMode) {
      setPieceInTray(piece, true);
    } else {
      if (piece.hold) releaseHold(piece.hold);
      setPieceCarryFriction(piece, false);
      piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      piece.body.recomputeMassPropertiesFromColliders();
      piece.body.setTranslation(piece.homePosition, true);
      piece.body.setRotation(piece.homeRotation, true);
      piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      piece.body.wakeUp();
      piece.targetPosition.copy(piece.homePosition);
      piece.controlPosition.copy(piece.homePosition);
      piece.targetRotation.copy(piece.homeRotation);
      piece.controlRotation.copy(piece.homeRotation);
      setPieceEdges(piece, restingEdgeMaterial(piece));
    }

    clearChallengeMarks(true);
    updateSelectionUI();
    updatePartsTray();
    setInstruction(`${pieceFamily(piece.name)} returned`);
  }

  function toggleView() {
    topView = !topView;
    orbitVelocityAzimuth = 0;
    orbitVelocityElevation = 0;
    orbitTargetElevation = topView ? TOP_ELEVATION : MODEL_ELEVATION;
    const modelRadius = mobilePartsMode ? MOBILE_MODEL_RADIUS : MODEL_RADIUS;
    const topRadius = mobilePartsMode ? MOBILE_TOP_RADIUS : TOP_RADIUS;
    orbitTargetRadius = THREE.MathUtils.clamp(topView ? topRadius : modelRadius, orbitMinRadius, orbitMaxRadius);
    if (viewButton) viewButton.textContent = topView ? 'model' : 'top';
  }

  turnButton?.addEventListener('click', rotateSelected);
  upButton?.addEventListener('click', () => liftSelected(1));
  downButton?.addEventListener('click', () => liftSelected(-1));
  returnButton?.addEventListener('click', returnSelected);
  undoButton?.addEventListener('click', undoLastAction);
  viewButton?.addEventListener('click', toggleView);
  again?.addEventListener('click', rebuild);
  challengeButtons.forEach(button => {
    button.addEventListener('click', () => chooseChallenge(Number(button.dataset.challenge)));
  });
  challengeFree?.addEventListener('click', () => chooseChallenge(-1));
  challengeSpin?.addEventListener('click', startChallengeSpin);
  challengeGuide?.addEventListener('click', toggleChallengeGuide);
  challengeReset?.addEventListener('click', rebuild);
  challengeDone?.addEventListener('click', requestChallengeCheck);
  partsRail?.addEventListener('click', event => {
    const button = event.target.closest('[data-part-family]');
    if (!button || button.disabled) return;
    spawnPieceFromTray(button.dataset.partFamily);
  });

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
    for (const support of active.carryIgnore) {
      if (support.body.isDynamic()) support.body.wakeUp();
    }
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
    if (travel.lengthSq() > 0 || selected.targetRotation.angleTo(selected.controlRotation) > .0001) {
      wakeTouchingCluster(selected);
    }
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
    if (piece === selected || piece.inTray || piece.spawning) return;

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

  function recoverFallenPiece(piece) {
    if (mobilePartsMode) {
      setPieceInTray(piece, true);
      updatePartsTray();
      return;
    }
    if (piece.hold) releaseHold(piece.hold);
    const position = piece.homePosition.clone();
    position.y = suggestedCarryHeight(piece, position.x, position.z, position.y);
    setPieceCarryFriction(piece, false);
    piece.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    piece.body.recomputeMassPropertiesFromColliders();
    piece.body.setTranslation(position, true);
    piece.body.setRotation(piece.homeRotation, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.wakeUp();
    piece.targetPosition.copy(position);
    piece.targetRotation.copy(piece.homeRotation);
    piece.controlPosition.copy(position);
    piece.controlRotation.copy(piece.homeRotation);
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
    updateSpawnMotion(now);
    updateMobileSelectionRelease(now);
    updateCarry(delta);
    updateSelectedControls(delta);
    updateClusterSettle(delta);
    updateHolds(now);

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
        recoverFallenPiece(piece);
      }
    }

    updateChallengeProgress(delta);
    paintChallengeScore(now);
    renderer.render(scene, camera);
    updateChallengePreview(now);
  }

  function clearInteraction() {
    const interruptedCarry = !!active && selected === active.piece;
    if (active) releaseCapture(active.pointerId);
    if (orbitGesture) releaseCapture(orbitGesture.pointerId);
    active = null;
    orbitGesture = null;
    stage.classList.remove('is-dragging', 'is-orbiting');
    if (interruptedCarry) releaseSelected();
  }

  function handleResize() {
    clearInteraction();
    const nextMobilePartsMode = innerWidth <= MOBILE_BREAKPOINT;
    if (nextMobilePartsMode !== mobilePartsMode) {
      mobilePartsMode = nextMobilePartsMode;
      if (partsTray) partsTray.setAttribute('aria-hidden', String(!mobilePartsMode));
      rebuild();
    }
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
    challengePreviewVisual = disposeChallengeVisual(challengePreviewVisual);
    challengeGuideVisual = disposeChallengeVisual(challengeGuideVisual);
    challengePreviewRenderer?.dispose();
    challengePreviewRenderer?.domElement.remove();
    challengeGuideMaterial.dispose();
    challengePreviewEdgeMaterial.dispose();
    challengePreviewFaceMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  addEventListener('resize', handleResize, { passive: true });
  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('turbo:before-cache', destroy, { once: true });
  addEventListener('pagehide', destroy, { once: true });

  setupPartsTray();
  restoreChallengeCompletions();
  if (partsTray) partsTray.setAttribute('aria-hidden', String(!mobilePartsMode));
  resize();
  rebuild();
  startChallengeSpin();
  animationFrame = requestAnimationFrame(frame);
}).catch(error => {
  console.error(error);
  loading.textContent = 'unable to arrange';
});
