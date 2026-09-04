import { blockTilt, createCollapseMonitor } from './game-state.js?v=72i';
import { createTutorial } from './tutorial3d.js?v=74a';

const stage = document.querySelector('#stack-stage');
const loading = stage.querySelector('.stack-loading');
const moveLabel = document.querySelector('#move-count');
const again = document.querySelector('#again');
const instruction = document.querySelector('.stack-instruction');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

Promise.all([
  import('/stack/vendor/three-shim.js?v=72k'),
  import('/stack/vendor/rapier-shim.js')
]).then(async ([THREE, RAPIER]) => {
  await RAPIER.init();

  const INITIAL_COURSES = 24;
  const COURSE_STEP = .385;
  const BASE_Y = .19;
  const PHYSICS_STEP = 1 / 120;
  const GROUND_HALF_EXTENT = 120;
  const MAX_CARRY_SPEED = 3.2;
  const EDGE_RADIUS = .018;
  const SUPPORT_HALF_EXTENT = 1.50;
  const MAX_PULL_ERROR = .62;
  const MAX_SIDE_ERROR = .30;
  const MAX_TOP_ERROR = .18;
  const REGRAB_CLEARANCE_MARGIN = .24;
  const PLACEMENT_CAPTURE_RADIUS = 2.8;
  const PLACEMENT_RELEASE_RADIUS = 3.05;
  const CONTACT_GAP = .006;

  // Grip authority is intentionally asymmetric: END grips own axial extraction,
  // SIDE grips own lateral nudging, and TOP grips own bounded vertical effort.
  // Secondary directions are real physics, but deliberately weaker.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ea);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);

  const requestedLens = Number(new URLSearchParams(location.search).get('lens'));
  const focalLength = [16, 18, 22].includes(requestedLens) ? requestedLens : 18;
  const verticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * focalLength)));
  const camera = new THREE.PerspectiveCamera(verticalFov, 1, .1, 100);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragPoint = new THREE.Vector3();
  const carryPlane = new THREE.Plane();
  const carryPoint = new THREE.Vector3();
  const meshes = [];

  const orbitTarget = new THREE.Vector3(0, 4.45, 0);
  const minElevation = THREE.MathUtils.degToRad(2);
  const maxElevation = THREE.MathUtils.degToRad(84);
  let orbitAzimuth = THREE.MathUtils.degToRad(40);
  let orbitElevation = THREE.MathUtils.degToRad(28);
  let orbitTargetAzimuth = orbitAzimuth;
  let orbitTargetElevation = orbitElevation;
  let orbitRadius = 15.2;
  let orbitTargetRadius = orbitRadius;
  let orbitMinRadius = 11.2;
  let orbitMaxRadius = 19.4;
  let cameraConfigured = false;
  let orbitGesture = null;
  let orbitVelocityAzimuth = 0;
  let orbitVelocityElevation = 0;

  let world;
  let blocks = [];
  let active = null;
  let hovered = null;
  let moves = 0;
  let placedCount = 0;
  let last = performance.now();
  let accumulator = 0;
  let collapsed = false;
  let tutorial;
  let frameId = 0;
  let disposed = false;
  const collapseMonitor = createCollapseMonitor();
  const listeners = new AbortController();
  function listen(target, event, handler, options = {}) {
    target.addEventListener(event, handler, { ...options, signal: listeners.signal });
  }
  function emit(type, detail = {}) {
    window.dispatchEvent(new CustomEvent(`stack:${type}`, { detail }));
  }

  const boxGeometry = new THREE.BoxGeometry(3, .36, .92);
  const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xf3f1ea, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const edgeGeometry = new THREE.EdgesGeometry(boxGeometry, 18);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .82 });
  const hoverMaterial = new THREE.LineBasicMaterial({ color: 0x171613, transparent: true, opacity: 1 });
  const ghostMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .15 });
  const placementMaterial = new THREE.LineBasicMaterial({ color: 0x24231f, transparent: true, opacity: .18, depthTest: false });
  const placementGuide = new THREE.LineSegments(edgeGeometry, placementMaterial);
  placementGuide.visible = false;
  placementGuide.renderOrder = 10;
  placementGuide.scale.setScalar(1.015);
  scene.add(placementGuide);

  function setInstruction(text) {
    if (instruction) instruction.textContent = text;
  }

  function noise(seed) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
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
    const defaultRadius = phone ? 13.5 : tablet ? 14.4 : 15.2;
    orbitMinRadius = phone ? 10.6 : tablet ? 10.9 : 11.2;
    orbitMaxRadius = phone ? 17.6 : tablet ? 18.6 : 19.4;
    orbitTarget.set(phone ? .05 : -.18, phone ? 4.55 : 4.45, 0);

    if (!cameraConfigured) {
      orbitRadius = defaultRadius;
      orbitTargetRadius = defaultRadius;
      cameraConfigured = true;
    } else {
      orbitRadius = THREE.MathUtils.clamp(orbitRadius, orbitMinRadius, orbitMaxRadius);
      orbitTargetRadius = THREE.MathUtils.clamp(orbitTargetRadius, orbitMinRadius, orbitMaxRadius);
    }
    updateCamera();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    configureCamera();
  }

  function nextPlacementPose() {
    const course = INITIAL_COURSES + Math.floor(placedCount / 3);
    const slot = placedCount % 3;
    const turn = course % 2 === 1;
    const cross = (slot - 1) * .98;
    const angle = turn ? Math.PI / 2 : 0;
    // Build on the physical top surface, not the original construction spacing.
    // The initial gaps close under gravity; reusing their nominal height made
    // every placed block drop through a growing air gap onto the tower.
    const supports = blocks.filter(block => block.course === course - 1 && !block.free && block !== active?.block);
    let top = BASE_Y + (course - 1) * .36 + .18;
    if (supports.length) {
      top = Math.max(...supports.map(block => {
        const { x, y, z, w } = block.body.rotation();
        const halfHeight = Math.abs(2 * (x * y + w * z)) * block.length / 2
          + Math.abs(1 - 2 * (x * x + z * z)) * block.height / 2
          + Math.abs(2 * (y * z - w * x)) * block.width / 2;
        return block.body.translation().y + halfHeight;
      }));
    }
    const heldHalfHeight = (active?.block.height ?? .36) / 2;
    const position = new THREE.Vector3(turn ? cross : 0, top + heldHalfHeight + CONTACT_GAP, turn ? 0 : cross);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    return { course, slot, position, rotation };
  }

  function updatePlacementGuide() {
    if (collapsed) {
      placementGuide.visible = false;
      return;
    }
    const hasLoosePiece = blocks.some(block => block.free || block.carryable);
    const carrying = active && active.mode === 'carry';
    if (!carrying && !hasLoosePiece) {
      placementGuide.visible = false;
      return;
    }

    const pose = nextPlacementPose();
    placementGuide.position.copy(pose.position);
    placementGuide.quaternion.copy(pose.rotation);
    placementGuide.visible = true;

    if (carrying) {
      const desiredDistance = active.carryDesired.distanceTo(pose.position);
      const candidate = active.placementCandidate || desiredDistance < PLACEMENT_CAPTURE_RADIUS;
      placementMaterial.opacity = candidate ? .58 : .24;
    } else {
      placementMaterial.opacity = .16;
    }
  }

  function releaseCapture(pointerId) {
    if (pointerId == null) return;
    if (renderer.domElement.hasPointerCapture?.(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
  }

  function clearInteraction(dropCarry = true) {
    const pointerId = active?.pointerId ?? orbitGesture?.pointerId;
    if (active) {
      if (dropCarry && active.mode === 'carry') {
        const body = active.block.body;
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.wakeUp();
        active.block.free = true;
        active.block.carryable = true;
      }
    }
    active = null;
    orbitGesture = null;
    releaseCapture(pointerId);
    orbitVelocityAzimuth = 0;
    orbitVelocityElevation = 0;
    orbitTargetAzimuth = orbitAzimuth;
    orbitTargetElevation = orbitElevation;
    orbitTargetRadius = orbitRadius;
    stage.classList.remove('is-dragging', 'is-orbiting');
    updatePlacementGuide();
  }

  function rebuild() {
    tutorial?.stop();
    clearInteraction(false);
    world?.free();
    accumulator = 0;
    last = performance.now();
    collapseMonitor.reset();
    for (const item of blocks) scene.remove(item.group);
    blocks = [];
    meshes.length = 0;
    hovered = null;
    moves = 0;
    placedCount = 0;
    collapsed = false;
    moveLabel.textContent = '';
    placementGuide.visible = false;
    setInstruction('pull clear · keep holding');
    stage.classList.remove('is-hovering');

    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Tall stacks need firmer, better-converged contacts than Rapier's general
    // game defaults. Keep restitution at zero: wood can slide and tip, not flex.
    world.timestep = PHYSICS_STEP;
    world.numSolverIterations = 12;
    world.numInternalPgsIterations = 2;
    world.integrationParameters.contact_natural_frequency = 120;
    world.integrationParameters.normalizedAllowedLinearError = .0001;
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -.20, 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(GROUND_HALF_EXTENT, .18, GROUND_HALF_EXTENT).setFriction(.72).setRestitution(0),
      ground
    );

    for (let course = 0; course < INITIAL_COURSES; course++) {
      for (let slot = 0; slot < 3; slot++) {
        const turn = course % 2 === 1;
        const seed = course * 17 + slot * 31;
        const length = 3 * (.994 + noise(seed + 1) * .012);
        const height = .36 * (.988 + noise(seed + 2) * .024);
        const width = .92 * (.990 + noise(seed + 3) * .020);
        const density = .95 + noise(seed + 4) * .18;
        const frictionRoll = noise(seed + 5);

        let friction;
        let fit;
        // Difficulty should come primarily from real loading and imperfect contact,
        // not from an artificially sticky material model.
        if (frictionRoll < .30) {
          friction = .08 + (frictionRoll / .30) * .12;
          fit = 'loose';
        } else if (frictionRoll < .90) {
          friction = .22 + ((frictionRoll - .30) / .60) * .20;
          fit = 'normal';
        } else {
          friction = .44 + ((frictionRoll - .90) / .10) * .14;
          fit = 'tight';
        }

        const cross = (slot - 1) * .98 + (noise(seed + 8) - .5) * .044;
        const along = (noise(seed + 9) - .5) * .064;
        const angle = turn ? Math.PI / 2 : 0;
        const yawError = (noise(seed + 10) - .5) * .013;
        const x = turn ? cross : along;
        const z = turn ? along : cross;
        const y = BASE_Y + course * COURSE_STEP + (noise(seed + 11) - .5) * .006;
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + yawError);
        const homeAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).setY(0).normalize();

        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y, z)
            .setRotation(rotation)
            .setLinearDamping(.22 + noise(seed + 6) * .05)
            .setAngularDamping(.45 + noise(seed + 7) * .08)
            .setCcdEnabled(true)
        );

        world.createCollider(
          RAPIER.ColliderDesc.roundCuboid(
            length / 2 - EDGE_RADIUS,
            height / 2 - EDGE_RADIUS,
            width / 2 - EDGE_RADIUS,
            EDGE_RADIUS
          )
            .setDensity(density)
            .setFriction(friction)
            .setRestitution(0),
          body
        );

        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.quaternion.copy(rotation);
        group.scale.set(length / 3, height / .36, width / .92);

        const face = new THREE.Mesh(boxGeometry, faceMaterial);
        face.userData.blockIndex = blocks.length;
        group.add(face);

        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        group.add(edges);

        const ghost = new THREE.LineSegments(edgeGeometry, ghostMaterial);
        ghost.position.set((noise(seed + 12) - .5) * .016, (noise(seed + 13) - .5) * .010, (noise(seed + 14) - .5) * .014);
        ghost.scale.setScalar(1.0015);
        group.add(ghost);

        scene.add(group);
        meshes.push(face);
        blocks.push({
          body,
          group,
          edges,
          ghost,
          startY: y,
          friction,
          density,
          fit,
          free: false,
          carryable: false,
          course,
          length,
          height,
          width,
          homePosition: new THREE.Vector3(x, y, z),
          homeAxis,
          clearanceDistance: length / 2 + SUPPORT_HALF_EXTENT
        });
      }
    }
    // Assemble into real contact before showing the tower, avoiding a visible
    // concertina as all 24 construction gaps close at the start of each game.
    for (let step = 0; step < 240; step++) world.step();
    for (const item of blocks) {
      const p = item.body.translation();
      const q = item.body.rotation();
      item.group.position.set(p.x, p.y, p.z);
      item.group.quaternion.set(q.x, q.y, q.z, q.w);
      item.homePosition.copy(item.group.position);
      item.homeAxis.set(1, 0, 0).applyQuaternion(item.group.quaternion).setY(0).normalize();
      item.startY = p.y;
    }
    last = performance.now();
    emit('reset');
  }

  function setRay(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
  }

  function gripProfile(local) {
    const ex = THREE.MathUtils.clamp(Math.abs(local.x) / 1.5, 0, 1);
    const ey = THREE.MathUtils.clamp(Math.abs(local.y) / .18, 0, 1);
    const ez = THREE.MathUtils.clamp(Math.abs(local.z) / .46, 0, 1);

    let end = Math.pow(THREE.MathUtils.smoothstep(ex, .70, 1), 2.4);
    let top = Math.pow(THREE.MathUtils.smoothstep(ey, .70, 1), 2.4);
    let side = Math.pow(THREE.MathUtils.smoothstep(ez, .70, 1), 2.4);
    let sum = end + top + side;

    if (sum < .001) {
      if (ex >= ey && ex >= ez) end = 1;
      else if (ey >= ex && ey >= ez) top = 1;
      else side = 1;
      sum = 1;
    }

    return { end: end / sum, side: side / sum, top: top / sum };
  }

  function hitBlockInfo(event) {
    setRay(event.clientX, event.clientY);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const block = blocks[hit.object.userData.blockIndex];
    hit.object.updateMatrixWorld(true);
    const local = hit.object.worldToLocal(hit.point.clone());
    const profile = gripProfile(local);
    const localGrip = new THREE.Vector3(
      local.x * (block.length / 3),
      local.y * (block.height / .36),
      local.z * (block.width / .92)
    );
    return { block, hit, local, localGrip, profile };
  }

  function setHover(block) {
    if (hovered === block) return;
    if (hovered) hovered.edges.material = edgeMaterial;
    hovered = block;
    if (hovered) hovered.edges.material = hoverMaterial;
    stage.classList.toggle('is-hovering', !!hovered);
  }

  function blockPose(block) {
    const p = block.body.translation();
    const q = block.body.rotation();
    return {
      position: new THREE.Vector3(p.x, p.y, p.z),
      rotation: new THREE.Quaternion(q.x, q.y, q.z, q.w)
    };
  }

  function blockAxes(body) {
    const q = body.rotation();
    const rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    return {
      long: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).normalize(),
      side: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize(),
      up: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).normalize(),
      rotation
    };
  }

  function worldGripPoint(body, localGrip, rotation) {
    const p = body.translation();
    return localGrip.clone().applyQuaternion(rotation).add(new THREE.Vector3(p.x, p.y, p.z));
  }

  function pointVelocity(body, point) {
    const linear = body.linvel();
    const angular = body.angvel();
    const centre = body.translation();
    const r = new THREE.Vector3(point.x - centre.x, point.y - centre.y, point.z - centre.z);
    const omega = new THREE.Vector3(angular.x, angular.y, angular.z);
    return new THREE.Vector3(linear.x, linear.y, linear.z)
      .add(new THREE.Vector3().crossVectors(omega, r));
  }

  function applyImpulseAtGrip(body, impulse, point) {
    const i = { x: impulse.x, y: impulse.y, z: impulse.z };
    const p = { x: point.x, y: point.y, z: point.z };
    if (typeof body.applyImpulseAtPoint === 'function') {
      body.applyImpulseAtPoint(i, p, true);
      return;
    }

    body.applyImpulse(i, true);
    if (typeof body.applyTorqueImpulse === 'function') {
      const centre = body.translation();
      const r = new THREE.Vector3(point.x - centre.x, point.y - centre.y, point.z - centre.z);
      const torque = new THREE.Vector3().crossVectors(r, impulse);
      body.applyTorqueImpulse({ x: torque.x, y: torque.y, z: torque.z }, true);
    }
  }

  function isDetached(block) {
    if (block.free || block.carryable) return true;
    const { position, rotation } = blockPose(block);
    const fromHome = position.clone().sub(block.homePosition);
    const axial = Math.abs(fromHome.dot(block.homeAxis));
    const horizontal = Math.hypot(fromHome.x, fromHome.z);
    const tilt = blockTilt(rotation);
    const dropped = position.y < block.homePosition.y - .50;
    const onFloorAwayFromHome = position.y < .55 && horizontal > .75;
    const clearlyExtracted = axial > block.clearanceDistance - REGRAB_CLEARANCE_MARGIN;
    const clearlyFallen = (dropped || tilt > .52) && horizontal > .55;
    return clearlyExtracted || onFloorAwayFromHome || clearlyFallen;
  }

  function beginCarry(block, pointerId, clientX, clientY) {
    const p = block.body.translation();
    const q = block.body.rotation();
    block.free = true;
    block.carryable = true;
    block.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    block.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    block.body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    const origin = new THREE.Vector3(p.x, p.y, p.z);
    carryPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), origin);
    setRay(clientX, clientY);
    const grabPoint = raycaster.ray.intersectPlane(carryPlane, carryPoint) ? carryPoint.clone() : origin.clone();

    active = {
      mode: 'carry',
      block,
      pointerId,
      carryOrigin: origin,
      carryGrabPoint: grabPoint,
      carryDesired: origin.clone(),
      carryPosition: origin.clone(),
      carryPrevious: origin.clone(),
      carryVelocity: new THREE.Vector3(),
      carryRotation: new THREE.Quaternion(q.x, q.y, q.z, q.w),
      placementCandidate: false,
      lastClientX: clientX,
      lastClientY: clientY
    };
    setInstruction('lift above tower · release');
    updatePlacementGuide();
    stage.classList.add('is-dragging');
  }

  listen(renderer.domElement, 'contextmenu', event => event.preventDefault());

  listen(renderer.domElement, 'wheel', event => {
    event.preventDefault();
    if (active || orbitGesture) return;
    const delta = THREE.MathUtils.clamp(event.deltaY, -120, 120);
    orbitTargetRadius = THREE.MathUtils.clamp(
      orbitTargetRadius + delta * .012,
      orbitMinRadius,
      orbitMaxRadius
    );
  }, { passive: false });

  listen(renderer.domElement, 'pointermove', event => {
    if (active && event.pointerId === active.pointerId) {
      active.lastClientX = event.clientX;
      active.lastClientY = event.clientY;
      setRay(event.clientX, event.clientY);

      if (active.mode === 'grip') {
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) active.targetPoint.copy(dragPoint);
      } else if (active.mode === 'carry' && raycaster.ray.intersectPlane(carryPlane, carryPoint)) {
        active.carryDesired.copy(active.carryOrigin).add(carryPoint.clone().sub(active.carryGrabPoint));
        const pose = nextPlacementPose();
        const distance = active.carryDesired.distanceTo(pose.position);
        const snap = 1 - THREE.MathUtils.smoothstep(distance, .55, PLACEMENT_CAPTURE_RADIUS);

        // The user only needs to bring a loose piece into the top capture volume.
        // From there STACK handles the fussy 3D alignment, while release still
        // returns the block to real dynamics for a short physical settle.
        if (snap > 0) {
          active.carryDesired.lerp(pose.position, snap * .94);
          active.carryRotation.slerp(pose.rotation, .20 + snap * .48);
        }
        if (distance < PLACEMENT_CAPTURE_RADIUS) active.placementCandidate = true;
        else if (distance > PLACEMENT_CAPTURE_RADIUS + .65) active.placementCandidate = false;

        const orient = active.carryDesired.y > pose.position.y - 2.0
          ? THREE.MathUtils.clamp((active.carryDesired.y - (pose.position.y - 2.0)) / 2.0, 0, 1)
          : 0;
        active.carryRotation.slerp(pose.rotation, orient * .30);
        updatePlacementGuide();
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
      orbitTargetElevation = THREE.MathUtils.clamp(
        orbitTargetElevation + deltaElevation,
        minElevation,
        maxElevation
      );
      orbitVelocityAzimuth = THREE.MathUtils.lerp(
        orbitVelocityAzimuth,
        THREE.MathUtils.clamp(deltaAzimuth, -.025, .025),
        .20
      );
      orbitVelocityElevation = THREE.MathUtils.lerp(
        orbitVelocityElevation,
        THREE.MathUtils.clamp(deltaElevation, -.018, .018),
        .20
      );
      return;
    }

    if (event.pointerType === 'mouse') setHover(hitBlockInfo(event)?.block || null);
  });

  listen(renderer.domElement, 'pointerdown', event => {
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && ![0, 2].includes(event.button)) return;
    // A second mouse button must not replace an existing hand or orphan a carry.
    if (active || orbitGesture) return;

    const forceOrbit = event.pointerType === 'mouse' && event.button === 2;
    const info = forceOrbit ? null : hitBlockInfo(event);
    event.preventDefault();
    renderer.domElement.setPointerCapture(event.pointerId);

    if (info) {
      // Stop residual camera easing before fixing the world-space grip plane.
      orbitVelocityAzimuth = 0;
      orbitVelocityElevation = 0;
      orbitTargetAzimuth = orbitAzimuth;
      orbitTargetElevation = orbitElevation;
      orbitTargetRadius = orbitRadius;
      if (collapseMonitor.arm(blocks)) {
        // The initial construction gaps settle under gravity before the first
        // hand arrives. Measure later drops from that settled height.
        for (const item of blocks) item.homePosition.y = item.body.translation().y;
      }
      if (!collapsed) emit('turnstart');
      const block = info.block;
      if (block.free || block.carryable || isDetached(block)) {
        block.carryable = true;
        beginCarry(block, event.pointerId, event.clientX, event.clientY);
        return;
      }

      block.body.wakeUp();
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()),
        info.hit.point
      );

      active = {
        mode: 'grip',
        block,
        localGrip: info.localGrip,
        profile: info.profile,
        grabPoint: info.hit.point.clone(),
        targetPoint: info.hit.point.clone(),
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY
      };

      orbitVelocityAzimuth = 0;
      orbitVelocityElevation = 0;
      stage.classList.add('is-dragging');
      return;
    }

    setHover(null);
    orbitVelocityAzimuth = 0;
    orbitVelocityElevation = 0;
    orbitTargetAzimuth = orbitAzimuth;
    orbitTargetElevation = orbitElevation;
    orbitGesture = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY
    };
    stage.classList.add('is-orbiting');
  });

  function finishPointer(event, cancelled = false) {
    if (active && event.pointerId === active.pointerId) {
      const held = active;
      const body = held.block.body;

      if (held.mode === 'grip' && isDetached(held.block)) {
        held.block.carryable = true;
        held.block.free = true;
        setInstruction('click free block · lift above tower');
      }

      if (held.mode === 'carry') {
        const pose = nextPlacementPose();
        const p = body.translation();
        const current = new THREE.Vector3(p.x, p.y, p.z);
        const currentDistance = current.distanceTo(pose.position);
        const desiredDistance = held.carryDesired.distanceTo(pose.position);
        const canPlace = !cancelled && !collapsed && (
          currentDistance < 2.10 ||
          (held.placementCandidate && desiredDistance < PLACEMENT_CAPTURE_RADIUS && currentDistance < PLACEMENT_RELEASE_RADIUS)
        );

        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);

        if (canPlace) {
          body.setTranslation(pose.position, true);
          body.setRotation(pose.rotation, true);
          // The assisted hand has placed the block on its support. Releasing
          // that hand must not add a flick, upward kick or another drop.
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.wakeUp();

          held.block.free = false;
          held.block.carryable = false;
          held.block.course = pose.course;
          held.block.startY = pose.position.y;
          held.block.homePosition.copy(pose.position);
          held.block.homeAxis.set(1, 0, 0).applyQuaternion(pose.rotation).setY(0).normalize();
          collapseMonitor.placed(held.block, pose.position.y);
          placedCount++;
          moves++;
          moveLabel.textContent = `${moves} ${moves === 1 ? 'move' : 'moves'}`;
          emit('placed', { moves, blockIndex: blocks.indexOf(held.block) });
          setInstruction('pull clear · keep holding');
        } else {
          const releaseVelocity = held.carryVelocity.clone();
          if (releaseVelocity.length() > 1.8) releaseVelocity.setLength(1.8);
          body.setLinvel({ x: releaseVelocity.x, y: releaseVelocity.y, z: releaseVelocity.z }, true);
          body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          body.wakeUp();
          held.block.free = true;
          held.block.carryable = true;
          setInstruction('click free block · lift above tower');
        }
      }

      active = null;
      stage.classList.remove('is-dragging');
      releaseCapture(event.pointerId);
      updatePlacementGuide();
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

  listen(renderer.domElement, 'pointerup', event => finishPointer(event, false));
  listen(renderer.domElement, 'pointercancel', event => finishPointer(event, true));
  listen(renderer.domElement, 'lostpointercapture', event => finishPointer(event, true));
  listen(renderer.domElement, 'pointerleave', () => {
    if (!active && !orbitGesture) setHover(null);
  });

  listen(again, 'click', rebuild);

  function forceComponent(error, speed, stiffness, damping, cap, errorCap) {
    const boundedError = THREE.MathUtils.clamp(error, -errorCap, errorCap);
    return THREE.MathUtils.clamp(boundedError * stiffness - speed * damping, -cap, cap);
  }

  function applyGripImpulse() {
    if (!active || active.mode !== 'grip') return;

    const body = active.block.body;
    const axes = blockAxes(body);
    const gripWorld = worldGripPoint(body, active.localGrip, axes.rotation);
    const velocity = pointVelocity(body, gripWorld);
    const error = active.targetPoint.clone().sub(gripWorld);
    const p = active.profile;

    const longError = error.dot(axes.long);
    const sideError = error.dot(axes.side);
    const upError = error.dot(axes.up);
    const longSpeed = velocity.dot(axes.long);
    const sideSpeed = velocity.dot(axes.side);
    const upSpeed = velocity.dot(axes.up);

    const weight = body.mass() * 9.81;
    const longCap = 72 * p.end + 10 * p.side;
    const sideCap = 9 * p.end + 30 * p.side;
    // Enough upward effort to lift one unloaded block. Contacts and the
    // weight above still resist a trapped block; downward effort is gentler.
    const upCap = 1.0 * p.end + 1.0 * p.side + weight * (upError >= 0 ? 1.6 : .65) * p.top;

    const longStiffness = 100 * p.end + 25 * p.side;
    const sideStiffness = 28 * p.end + 65 * p.side;
    const upStiffness = 8 * p.end + 8 * p.side + weight * 14 * p.top;

    const longDamping = 22 * p.end + 12 * p.side + 16 * p.top;
    const sideDamping = 12 * p.end + 20 * p.side + 16 * p.top;
    const upDamping = 6 * (p.end + p.side) + body.mass() * 14 * p.top;

    const longForce = forceComponent(longError, longSpeed, longStiffness, longDamping, longCap, MAX_PULL_ERROR);
    const sideForce = forceComponent(sideError, sideSpeed, sideStiffness, sideDamping, sideCap, MAX_SIDE_ERROR);
    const upForce = forceComponent(upError, upSpeed, upStiffness, upDamping, upCap, MAX_TOP_ERROR);

    const impulse = axes.long.clone().multiplyScalar(longForce)
      .addScaledVector(axes.side, sideForce)
      .addScaledVector(axes.up, upForce)
      .multiplyScalar(PHYSICS_STEP);

    applyImpulseAtGrip(body, impulse, gripWorld);

    const current = body.translation();
    const currentPosition = new THREE.Vector3(current.x, current.y, current.z);
    const displacementFromHome = currentPosition.clone().sub(active.block.homePosition).dot(active.block.homeAxis);

    if (Math.abs(displacementFromHome) > active.block.clearanceDistance) {
      active.block.carryable = true;
      // Automatic handoff only makes intuitive sense when the user actually grabbed an end.
      if (p.end >= .55) beginCarry(active.block, active.pointerId, active.lastClientX, active.lastClientY);
    }
  }

  function updateCarry(delta) {
    if (!active || active.mode !== 'carry') return;

    const travel = active.carryDesired.clone().sub(active.carryPosition);
    const distance = travel.length();
    const maxStep = MAX_CARRY_SPEED * Math.max(delta, 1 / 240);
    if (distance > maxStep) travel.setLength(maxStep);

    active.carryPrevious.copy(active.carryPosition);
    active.carryPosition.add(travel);
    if (delta > 0) {
      active.carryVelocity.copy(active.carryPosition).sub(active.carryPrevious).divideScalar(delta);
      if (active.carryVelocity.length() > MAX_CARRY_SPEED) active.carryVelocity.setLength(MAX_CARRY_SPEED);
    }

    active.block.body.setNextKinematicTranslation(active.carryPosition);
    active.block.body.setNextKinematicRotation(active.carryRotation);
  }

  function updateOrbit(delta) {
    if (!orbitGesture && !reducedMotion) {
      const frameScale = Math.min(1.5, delta * 60);
      orbitTargetAzimuth += orbitVelocityAzimuth * frameScale * .18;
      orbitTargetElevation = THREE.MathUtils.clamp(
        orbitTargetElevation + orbitVelocityElevation * frameScale * .18,
        minElevation,
        maxElevation
      );
      const velocityDamping = Math.exp(-13 * delta);
      orbitVelocityAzimuth *= velocityDamping;
      orbitVelocityElevation *= velocityDamping;
    }

    const follow = reducedMotion ? 1 : 1 - Math.exp(-5.5 * delta);
    orbitAzimuth += (orbitTargetAzimuth - orbitAzimuth) * follow;
    orbitElevation += (orbitTargetElevation - orbitElevation) * follow;
    orbitElevation = THREE.MathUtils.clamp(orbitElevation, minElevation, maxElevation);

    const zoomFollow = reducedMotion ? 1 : 1 - Math.exp(-6.5 * delta);
    orbitRadius += (orbitTargetRadius - orbitRadius) * zoomFollow;
    orbitRadius = THREE.MathUtils.clamp(orbitRadius, orbitMinRadius, orbitMaxRadius);

    if (orbitElevation === minElevation || orbitElevation === maxElevation) {
      orbitVelocityElevation = 0;
      orbitTargetElevation = orbitElevation;
    }

    updateCamera();
  }

  function frame(now) {
    if (disposed) return;
    frameId = requestAnimationFrame(frame);
    if (document.hidden) {
      last = now;
      return;
    }

    const delta = Math.min((now - last) / 1000, .05);
    last = now;
    accumulator += delta;

    updateOrbit(delta);
    updatePlacementGuide();

    while (accumulator >= PHYSICS_STEP) {
      applyGripImpulse();
      // One bounded carry target per physics step, at every display refresh rate.
      updateCarry(PHYSICS_STEP);
      world.timestep = PHYSICS_STEP;
      world.step();
      const failure = collapseMonitor.step(blocks, active?.block, PHYSICS_STEP);
      if (!collapsed && failure) {
        collapsed = true;
        tutorial?.stop();
        emit('gamecollapse', failure);
      }
      accumulator -= PHYSICS_STEP;
    }

    for (const item of blocks) {
      const p = item.body.translation();
      const q = item.body.rotation();
      item.group.position.set(p.x, p.y, p.z);
      item.group.quaternion.set(q.x, q.y, q.z, q.w);

      if (!item.free && !item.carryable && isDetached(item)) item.carryable = true;

    }
    tutorial?.update(now);
    renderer.render(scene, camera);
  }

  listen(window, 'resize', () => {
    if (active || orbitGesture) clearInteraction(true);
    resize();
  }, { passive: true });

  function pauseInteraction() {
    tutorial?.stop();
    clearInteraction(true);
    accumulator = 0;
    last = performance.now();
  }

  listen(window, 'blur', pauseInteraction);
  listen(document, 'visibilitychange', () => {
    if (document.hidden) clearInteraction(true);
    accumulator = 0;
    last = performance.now();
  });

  listen(window, 'pagehide', event => {
    pauseInteraction();
    if (event.persisted) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    listeners.abort();
    tutorial?.dispose();
    world.free();
    boxGeometry.dispose();
    edgeGeometry.dispose();
    [faceMaterial, edgeMaterial, hoverMaterial, ghostMaterial, placementMaterial].forEach(material => material.dispose());
    renderer.dispose();
  });
  listen(window, 'pageshow', () => { last = performance.now(); });

  resize();
  rebuild();
  tutorial = createTutorial(THREE, { stage, getBlocks: () => blocks, camera,
    isGameOver: () => collapsed, isInteracting: () => !!(active || orbitGesture), reducedMotion });
  loading.remove();
  frameId = requestAnimationFrame(frame);
}).catch(error => {
  console.error(error);
  loading.textContent = 'unable to assemble';
  if (!loading.isConnected) stage.append(loading);
});
