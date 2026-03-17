import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const STATUS_COLORS = { available: 0x42d9c8, reserved: 0xffa62b, occupied: 0x5f91ff, blocked: 0xff5d6a };
const STATUS_LABEL_BACKGROUNDS = { available: "#42d9c8", reserved: "#ffa62b", occupied: "#5f91ff", blocked: "#ff5d6a" };
const STATUS_LABEL_FOREGROUNDS = { available: "#081019", reserved: "#2b1b03", occupied: "#f4f8ff", blocked: "#fff4f5" };
const LAYOUT = {
  background: 0xe7edf1, fog: 0xe7edf1, floor: 0xd7e0e6, floorEdge: 0x9aaab5, gridMajor: 0xb9c7d1,
  gridMinor: 0xd3dde4, wall: 0xe4ebf0, wallEdge: 0x9cabba, drive: 0xe44f57, driveStripe: 0xffe9ea,
  driveEdge: 0xffb8be, walk: 0xfafbfd, walkEdge: 0x7d93a6, pillar: 0x97a3a5, pillarCap: 0xdfe5e8,
  shadow: 0x7a8893, route: 0x2b5679, labelBackground: "#f7fafc", labelForeground: "#0f2434", entry: 0x1d7a48,
};
const NAV = {
  background: 0x01040a, fog: 0x01040a, ground: 0x020710, boundary: 0x4cc7ff, pillar: 0x56ef76,
  pillarRing: 0x0d4a1c, grid: 0x173244, gridGlow: 0x69d8ff, drive: 0xff4b5c, driveEdge: 0xffc4cc,
  walk: 0xd8e3ee, walkEdge: 0x7be4ff, stars: 0xb7ebff,
};
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function createBumpInMap({ mount, parking, onSpotSelect, mode = "layout" }) {
  if (!mount) throw new Error("Bump-in map mount point is missing.");
  if (!parking?.spots?.length) throw new Error("Bump-in map requires at least one parking spot.");

  const viewMode = mode === "navigator" ? "navigator" : "layout";
  const layout = createLayout(parking);
  const maxDimension = Math.max(layout.width, layout.depth);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = viewMode === "layout";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(viewMode === "navigator" ? NAV.background : LAYOUT.background, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  mount.querySelectorAll("canvas").forEach((canvas) => canvas.remove());
  mount.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(viewMode === "navigator" ? NAV.fog : LAYOUT.fog, maxDimension * (viewMode === "navigator" ? 0.6 : 0.7), maxDimension * (viewMode === "navigator" ? 2.2 : 2.5));
  const camera = new THREE.PerspectiveCamera(viewMode === "navigator" ? 38 : 42, 1, 0.1, 420);
  if (viewMode === "navigator") {
    camera.position.set(layout.centerX - layout.width * 0.72, maxDimension * 0.36, layout.centerZ + layout.depth * 0.46);
  } else {
    camera.position.set(layout.centerX - layout.width * 0.78, maxDimension * 0.55, layout.centerZ + layout.depth * 0.74);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.panSpeed = 1.25;
  controls.rotateSpeed = 0.95;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  controls.keyPanSpeed = 14;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.listenToKeyEvents(window);
  controls.zoomSpeed = 0.72;
  if (viewMode === "navigator") {
    controls.minDistance = 42; controls.maxDistance = 180; controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.52;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    controls.target.set(layout.centerX + layout.width * 0.08, 7, layout.centerZ + layout.depth * 0.02);
  } else {
    controls.minDistance = 34; controls.maxDistance = 220; controls.minPolarAngle = 0.38; controls.maxPolarAngle = 1.52;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    controls.target.set(layout.centerX + layout.width * 0.04, 3.5, layout.centerZ + layout.depth * 0.04);
  }
  controls.update();
  const initialCameraPosition = camera.position.clone();
  const initialTarget = controls.target.clone();

  buildEnvironment(scene, layout, parking, viewMode);
  const spotRecords = createSpotRecords(scene, parking.spots, viewMode);
  const spotMap = new Map(spotRecords.map((record) => [record.spot.id, record]));
  const interactiveMeshes = spotRecords.map((record) => record.pickable);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const scratchPosition = new THREE.Vector3();
  let pointerDown = null;
  let selectedSpotId = "";
  let visible = false;
  let flight = null;

  const resize = () => {
    const width = Math.max(mount.clientWidth, 1);
    const height = Math.max(Math.round(mount.getBoundingClientRect().height), 320);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const updateSelectionPulse = (now) => {
    const pulse = 1 + Math.sin(now * 0.008) * 0.05;
    spotRecords.forEach((record) => {
      const selected = record.spot.id === selectedSpotId;
      record.group.scale.set(selected ? pulse : 1, selected ? 1.04 : 1, selected ? pulse : 1);
      setMaterialEmissiveIntensity(record.surface.material, selected ? record.surfaceSelectedGlow : record.surfaceIdleGlow);
      setMaterialEmissiveIntensity(record.beacon.material, selected ? record.beaconSelectedGlow : record.beaconIdleGlow);
      record.outline.material.opacity = selected ? 0.98 : record.outlineIdleOpacity;
      record.baseRing.material.opacity = selected ? 0.95 : record.baseRingIdleOpacity;
      record.label.material.opacity = selected ? 1 : 0.92;
      if (record.routeTube) record.routeTube.material.opacity = selected ? record.routeSelectedOpacity : record.routeIdleOpacity;
      record.routeNodes.forEach((node) => { node.material.opacity = selected ? 0.95 : record.nodeIdleOpacity; node.scale.setScalar(selected ? pulse : 1); });
      if (record.flowMarker) record.flowMarker.material.opacity = selected ? 0.98 : 0;
    });
  };

  const updateRouteFlows = (now) => {
    spotRecords.forEach((record, index) => {
      if (!record.routeCurve || !record.flowMarker) return;
      const selected = record.spot.id === selectedSpotId;
      record.flowMarker.visible = selected;
      if (!selected) return;
      record.flowMarker.position.copy(record.routeCurve.getPointAt((now * record.flowSpeed + index * 0.14) % 1));
    });
  };

  const updateFlight = (now) => {
    if (!flight) return;
    const progress = Math.min((now - flight.startTime) / flight.duration, 1);
    const eased = easeInOutCubic(progress);
    if (flight.positionCurve && flight.targetCurve) {
      camera.position.copy(flight.positionCurve.getPointAt(eased));
      controls.target.copy(flight.targetCurve.getPointAt(Math.min(eased + 0.02, 1)));
    } else {
      scratchPosition.lerpVectors(flight.fromPosition, flight.toPosition, eased);
      scratchPosition.y += Math.sin(Math.PI * eased) * flight.arcHeight;
      camera.position.copy(scratchPosition);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    }
    if (progress >= 1) flight = null;
  };

  const render = (now = 0) => {
    updateFlight(now);
    updateSelectionPulse(now);
    updateRouteFlows(now);
    controls.update();
    renderer.render(scene, camera);
  };

  const setSelectedSpot = (spotId) => {
    if (!spotMap.has(spotId)) return false;
    selectedSpotId = spotId;
    if (!visible) render();
    return true;
  };

  const focusSpot = (spotId) => {
    const record = spotMap.get(spotId);
    if (!record) return false;
    selectedSpotId = spotId;
    const approachVector = viewMode === "navigator"
      ? new THREE.Vector3(-record.spot.width * 0.92 - 14, 0, record.spot.depth * 0.7 + 11)
      : new THREE.Vector3(-record.spot.width * 1.18 - 20, 0, record.spot.depth * 1.36 + 22);
    approachVector.applyAxisAngle(Y_AXIS, record.spot.rotation);
    const toPosition = record.anchor.clone().add(approachVector);
    toPosition.y = viewMode === "navigator" ? 11.2 : 18.5;
    const toTarget = record.anchor.clone();
    toTarget.y = viewMode === "navigator" ? 1.6 : 0.8;
    if (!visible) {
      if (record.spot.route?.length) {
        const immediate = buildSpotFlight(record, camera.position, controls.target, toPosition, toTarget, viewMode);
        camera.position.copy(immediate.positionCurve.getPointAt(1));
        controls.target.copy(immediate.targetCurve.getPointAt(1));
      } else {
        camera.position.copy(toPosition);
        controls.target.copy(toTarget);
      }
      controls.update();
      render();
      return true;
    }
    flight = buildSpotFlight(record, camera.position, controls.target, toPosition, toTarget, viewMode);
    return true;
  };

  const setVisible = (nextVisible) => {
    visible = Boolean(nextVisible);
    if (visible) { resize(); renderer.setAnimationLoop(render); return; }
    renderer.setAnimationLoop(null);
  };

  const nudgeView = (sideways, forward) => {
    flight = null;
    const forwardVector = new THREE.Vector3().subVectors(controls.target, camera.position);
    forwardVector.y = 0;
    if (forwardVector.lengthSq() < 0.0001) forwardVector.set(0, 0, -1);
    forwardVector.normalize();
    const rightVector = new THREE.Vector3(forwardVector.z, 0, -forwardVector.x).normalize();
    const delta = rightVector.multiplyScalar(sideways).add(forwardVector.multiplyScalar(forward));
    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
    if (!visible) render();
    return true;
  };

  const orbitBy = (angle) => {
    flight = null;
    const offset = camera.position.clone().sub(controls.target).applyAxisAngle(Y_AXIS, angle);
    camera.position.copy(controls.target.clone().add(offset));
    controls.update();
    if (!visible) render();
    return true;
  };

  const zoomBy = (step) => {
    flight = null;
    const offset = camera.position.clone().sub(controls.target);
    const currentDistance = offset.length();
    if (currentDistance <= 0.001) return false;
    const nextDistance = THREE.MathUtils.clamp(currentDistance * (1 + step), controls.minDistance, controls.maxDistance);
    offset.setLength(nextDistance);
    camera.position.copy(controls.target.clone().add(offset));
    controls.update();
    if (!visible) render();
    return true;
  };

  const resetView = () => {
    flight = null;
    camera.position.copy(initialCameraPosition);
    controls.target.copy(initialTarget);
    controls.update();
    if (!visible) render();
    return true;
  };

  const handlePick = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObjects(interactiveMeshes, false);
    const spotId = hit?.object?.userData?.spotId;
    if (spotId) onSpotSelect?.(spotId);
  };

  const onPointerDown = (event) => { pointerDown = { x: event.clientX, y: event.clientY, button: event.button }; };
  const clearPointer = () => { pointerDown = null; };
  const onPointerUp = (event) => {
    if (!pointerDown) return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    const wasPrimaryButton = pointerDown.button === 0;
    pointerDown = null;
    if (wasPrimaryButton && distance <= 6) handlePick(event);
  };
  const preventContextMenu = (event) => event.preventDefault();

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointerleave", clearPointer);
  renderer.domElement.addEventListener("pointercancel", clearPointer);
  renderer.domElement.addEventListener("contextmenu", preventContextMenu);
  const onControlsStart = () => { mount.classList.add("is-dragging"); flight = null; };
  const onControlsEnd = () => { mount.classList.remove("is-dragging"); };
  controls.addEventListener("start", onControlsStart);
  controls.addEventListener("end", onControlsEnd);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(mount);
  const onWindowResize = () => resize();
  window.addEventListener("resize", onWindowResize);
  resize();
  render();

  return {
    destroy() {
      renderer.setAnimationLoop(null);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", clearPointer);
      renderer.domElement.removeEventListener("pointercancel", clearPointer);
      renderer.domElement.removeEventListener("contextmenu", preventContextMenu);
      controls.removeEventListener("start", onControlsStart);
      controls.removeEventListener("end", onControlsEnd);
      controls.stopListenToKeyEvents();
      controls.dispose();
      mount.classList.remove("is-dragging");
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
    focusSpot,
    nudgeView,
    orbitBy,
    resetView,
    setSelectedSpot,
    setVisible,
    zoomBy,
  };
}

function buildSpotFlight(record, fromPosition, fromTarget, toPosition, toTarget, viewMode) {
  if (!record.spot.route?.length) {
    return { startTime: performance.now(), duration: viewMode === "navigator" ? 1900 : 1700, fromPosition: fromPosition.clone(), toPosition, fromTarget: fromTarget.clone(), toTarget, arcHeight: viewMode === "navigator" ? 6 : 4 };
  }
  const routePositions = record.spot.route.map((point, index) => new THREE.Vector3(point.x, viewMode === "navigator" ? Math.max(point.y - 2.2, 4.4) : 11 + index * 0.25, point.z));
  const routeTargets = record.spot.route.map((point) => new THREE.Vector3(point.x, viewMode === "navigator" ? 0.8 : 0.5, point.z));
  return {
    duration: viewMode === "navigator" ? 2500 : 2200,
    positionCurve: new THREE.CatmullRomCurve3(dedupeCurvePoints([fromPosition.clone(), ...routePositions, toPosition.clone()]), false, "catmullrom", 0.12),
    startTime: performance.now(),
    targetCurve: new THREE.CatmullRomCurve3(dedupeCurvePoints([fromTarget.clone(), ...routeTargets, toTarget.clone()]), false, "catmullrom", 0.12),
  };
}

function dedupeCurvePoints(points) {
  return points.filter((point, index) => index === 0 || point.distanceTo(points[index - 1]) > 0.01);
}

function createLayout(parking) {
  const items = [...(parking.driveZones || []), ...(parking.walkZones || []), ...(parking.pillars || []), ...(parking.landmarks || []), ...(parking.spots || [])];
  const bounds = items.reduce((accumulator, item) => extendBounds(accumulator, item), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const minX = Number.isFinite(bounds.minX) ? bounds.minX - 16 : -60;
  const maxX = Number.isFinite(bounds.maxX) ? bounds.maxX + 16 : 60;
  const minZ = Number.isFinite(bounds.minZ) ? bounds.minZ - 16 : -60;
  const maxZ = Number.isFinite(bounds.maxZ) ? bounds.maxZ + 16 : 60;
  return { centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2, depth: maxZ - minZ, maxX, maxZ, minX, minZ, width: maxX - minX };
}

function extendBounds(bounds, item) {
  const radius = item.radius || Math.sqrt(Math.pow(item.width || 0, 2) + Math.pow(item.depth || 0, 2)) / 2;
  return { minX: Math.min(bounds.minX, (item.x || 0) - radius), maxX: Math.max(bounds.maxX, (item.x || 0) + radius), minZ: Math.min(bounds.minZ, (item.z || 0) - radius), maxZ: Math.max(bounds.maxZ, (item.z || 0) + radius) };
}

function buildEnvironment(scene, layout, parking, viewMode) {
  if (viewMode === "navigator") {
    buildNavigatorEnvironment(scene, layout, parking);
    return;
  }
  buildLayoutEnvironment(scene, layout, parking);
}

function buildLayoutEnvironment(scene, layout, parking) {
  scene.add(new THREE.HemisphereLight(0xf9fcff, 0xbdc6cd, 1.15));
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(-88, 120, 54);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 260;
  keyLight.shadow.camera.left = -140;
  keyLight.shadow.camera.right = 140;
  keyLight.shadow.camera.top = 140;
  keyLight.shadow.camera.bottom = -140;
  scene.add(keyLight);
  const warmFill = new THREE.PointLight(0xffd2a8, 20, 220, 2);
  warmFill.position.set(layout.centerX + 28, 28, layout.centerZ - 24);
  scene.add(warmFill);
  const coolFill = new THREE.PointLight(0x8fc8f0, 18, 220, 2);
  coolFill.position.set(layout.centerX - 38, 26, layout.centerZ + 24);
  scene.add(coolFill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(layout.width + 12, layout.depth + 12), new THREE.MeshStandardMaterial({ color: LAYOUT.floor, roughness: 0.92, metalness: 0.02 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(layout.centerX, 0, layout.centerZ);
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(Math.max(layout.width, layout.depth) + 12, Math.round((Math.max(layout.width, layout.depth) + 12) / 6), LAYOUT.gridMajor, LAYOUT.gridMinor);
  grid.position.set(layout.centerX, 0.04, layout.centerZ);
  scene.add(grid);

  const perimeter = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(layout.width + 4, 0.32, layout.depth + 4)),
    new THREE.LineBasicMaterial({ color: LAYOUT.floorEdge, transparent: true, opacity: 0.8 }),
  );
  perimeter.position.set(layout.centerX, 0.16, layout.centerZ);
  scene.add(perimeter);

  addLayoutWalls(scene, layout);
  addEntryMarker(scene, parking);
  (parking.walkZones || []).forEach((zone) => addLayoutZone(scene, zone, { topColor: LAYOUT.walk, edgeColor: LAYOUT.walkEdge, height: 0.62, opacity: 0.94, stripeColor: 0xe4ebf0, stripeOpacity: 0.78, stripeInset: 2.2, stripeSize: 0.35, emissive: 0.02 }));
  (parking.driveZones || []).forEach((zone) => addLayoutZone(scene, zone, { topColor: LAYOUT.drive, edgeColor: LAYOUT.driveEdge, height: 0.44, opacity: 0.96, stripeColor: LAYOUT.driveStripe, stripeOpacity: 0.88, stripeInset: 2.4, stripeSize: 0.55, emissive: 0.18 }));
  (parking.pillars || []).forEach((pillar) => addLayoutPillar(scene, pillar));
}

function addLayoutWalls(scene, layout) {
  const curbMaterial = new THREE.MeshStandardMaterial({ color: LAYOUT.wall, roughness: 0.86, metalness: 0.04 });
  [
    { width: layout.width + 3, depth: 1.2, x: layout.centerX, z: layout.minZ - 1.5 },
    { width: layout.width + 3, depth: 1.2, x: layout.centerX, z: layout.maxZ + 1.5 },
    { width: 1.2, depth: layout.depth + 3, x: layout.minX - 1.5, z: layout.centerZ },
    { width: 1.2, depth: layout.depth + 3, x: layout.maxX + 1.5, z: layout.centerZ },
  ].forEach((segment) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(segment.width, 0.65, segment.depth), curbMaterial);
    curb.position.set(segment.x, 0.325, segment.z);
    curb.castShadow = true;
    curb.receiveShadow = true;
    scene.add(curb);
  });

  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(layout.width + 3, 8, 0.8),
    new THREE.MeshStandardMaterial({ color: LAYOUT.wall, transparent: true, opacity: 0.76, roughness: 0.8, metalness: 0.02 }),
  );
  northWall.position.set(layout.centerX, 4.3, layout.minZ - 1.8);
  northWall.receiveShadow = true;
  scene.add(northWall);

  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 8, layout.depth + 3),
    new THREE.MeshStandardMaterial({ color: 0xe9eef2, transparent: true, opacity: 0.72, roughness: 0.8, metalness: 0.02 }),
  );
  westWall.position.set(layout.minX - 1.8, 4.3, layout.centerZ);
  westWall.receiveShadow = true;
  scene.add(westWall);

  const wallOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(layout.width + 3, 8, 0.8)),
    new THREE.LineBasicMaterial({ color: LAYOUT.wallEdge, transparent: true, opacity: 0.58 }),
  );
  wallOutline.position.copy(northWall.position);
  scene.add(wallOutline);
}

function addEntryMarker(scene, parking) {
  const entryPoint = parking.spots.find((spot) => spot.route?.length)?.route?.[0];
  if (!entryPoint) return;
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.08, 28), new THREE.MeshBasicMaterial({ color: LAYOUT.entry, transparent: true, opacity: 0.28 }));
  halo.position.set(entryPoint.x, 0.06, entryPoint.z);
  scene.add(halo);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.8, 18), new THREE.MeshStandardMaterial({ color: LAYOUT.entry, roughness: 0.36, metalness: 0.06 }));
  arrow.position.set(entryPoint.x, 2.1, entryPoint.z);
  arrow.rotation.x = Math.PI;
  arrow.castShadow = true;
  scene.add(arrow);
  const label = createTextSprite("ENTRY", { background: "#1d7a48", color: "#f4fffa", width: 180, height: 72 });
  label.position.set(entryPoint.x, 4.4, entryPoint.z);
  scene.add(label);
}

function addLayoutZone(scene, zone, { topColor, edgeColor, height, opacity, stripeColor, stripeOpacity, stripeInset, stripeSize, emissive }) {
  const group = new THREE.Group();
  group.position.set(zone.x, 0, zone.z);
  group.rotation.y = zone.rotation;
  scene.add(group);
  const surface = new THREE.Mesh(
    new THREE.BoxGeometry(zone.width, height, zone.depth),
    new THREE.MeshStandardMaterial({ color: topColor, emissive: new THREE.Color(topColor).multiplyScalar(emissive), emissiveIntensity: 1, roughness: 0.72, metalness: 0.04, transparent: opacity < 1, opacity }),
  );
  surface.position.y = height / 2;
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(surface);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width + 0.18, height + 0.04, zone.depth + 0.18)),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.82 }),
  );
  outline.position.copy(surface.position);
  group.add(outline);
  const stripeLength = zone.width >= zone.depth ? Math.max(zone.width - stripeInset, 2.2) : Math.min(zone.width * 0.16, 0.9);
  const stripeDepth = zone.width >= zone.depth ? Math.min(zone.depth * 0.14, stripeSize) : Math.max(zone.depth - stripeInset, 2.2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeLength, 0.04, stripeDepth), new THREE.MeshBasicMaterial({ color: stripeColor, transparent: true, opacity: stripeOpacity }));
  stripe.position.y = height + 0.05;
  group.add(stripe);
}

function addLayoutPillar(scene, pillar) {
  const shaftHeight = Math.max(pillar.height * 3.3, 7.4);
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius * 1.9, pillar.radius * 1.9, 0.08, 28), new THREE.MeshBasicMaterial({ color: LAYOUT.shadow, transparent: true, opacity: 0.2 }));
  baseRing.position.set(pillar.x, 0.05, pillar.z);
  scene.add(baseRing);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius, pillar.radius * 1.06, shaftHeight, 20), new THREE.MeshStandardMaterial({ color: LAYOUT.pillar, roughness: 0.82, metalness: 0.02 }));
  shaft.position.set(pillar.x, shaftHeight / 2, pillar.z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  scene.add(shaft);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius * 1.12, pillar.radius * 1.12, 0.24, 20), new THREE.MeshStandardMaterial({ color: LAYOUT.pillarCap, roughness: 0.72, metalness: 0.04 }));
  cap.position.set(pillar.x, shaftHeight + 0.12, pillar.z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  scene.add(cap);
}

function addLayoutLandmark(scene, landmark) {
  const group = new THREE.Group();
  group.position.set(landmark.x, 0, landmark.z);
  group.rotation.y = landmark.rotation;
  scene.add(group);
  const landmarkColor = new THREE.Color(landmark.color);
  const blockHeight = Math.max(landmark.height * 2.5, 4.2);
  const block = new THREE.Mesh(new THREE.BoxGeometry(landmark.width, blockHeight, landmark.depth), new THREE.MeshStandardMaterial({ color: landmarkColor, emissive: landmarkColor.clone().multiplyScalar(0.06), emissiveIntensity: 1, roughness: 0.6, metalness: 0.05 }));
  block.position.y = blockHeight / 2;
  block.castShadow = true;
  block.receiveShadow = true;
  group.add(block);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(Math.max(landmark.width - 1.4, 2.4), 0.2, Math.max(landmark.depth - 1.4, 2.4)), new THREE.MeshStandardMaterial({ color: 0xf8fbfd, roughness: 0.72, metalness: 0.04 }));
  roof.position.set(0, blockHeight + 0.12, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(landmark.width + 0.16, blockHeight + 0.04, landmark.depth + 0.16)),
    new THREE.LineBasicMaterial({ color: 0xf9fcff, transparent: true, opacity: 0.7 }),
  );
  outline.position.copy(block.position);
  group.add(outline);
  const label = createTextSprite(landmark.label, { background: LAYOUT.labelBackground, color: LAYOUT.labelForeground, width: Math.max(220, Math.round(landmark.label.length * 15)), height: 78 });
  label.position.set(0, blockHeight + 2.2, 0);
  group.add(label);
}

function buildNavigatorEnvironment(scene, layout, parking) {
  scene.add(new THREE.HemisphereLight(0x8ee8ff, 0x01040a, 0.62));
  const keyLight = new THREE.DirectionalLight(0xb8f6ff, 1.18);
  keyLight.position.set(-70, 84, 34);
  scene.add(keyLight);
  const driveGlow = new THREE.PointLight(0xff5873, 38, 220, 2);
  driveGlow.position.set(layout.centerX + 12, 20, layout.centerZ + 18);
  scene.add(driveGlow);
  const coolFill = new THREE.PointLight(0x69d8ff, 30, 220, 2);
  coolFill.position.set(layout.centerX - 42, 18, layout.centerZ - 28);
  scene.add(coolFill);
  const magentaFill = new THREE.PointLight(0xff49c2, 24, 180, 2);
  magentaFill.position.set(layout.centerX + 28, 16, layout.centerZ - 24);
  scene.add(magentaFill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(layout.width, layout.depth),
    new THREE.MeshStandardMaterial({ color: NAV.ground, emissive: new THREE.Color(0x07131f), emissiveIntensity: 0.8, roughness: 0.94, metalness: 0.22 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(layout.centerX, 0, layout.centerZ);
  scene.add(ground);

  const baseGrid = new THREE.GridHelper(Math.max(layout.width, layout.depth), Math.round(Math.max(layout.width, layout.depth) / 6), NAV.gridGlow, NAV.grid);
  baseGrid.position.set(layout.centerX, 0.02, layout.centerZ);
  scene.add(baseGrid);
  const fineGrid = new THREE.GridHelper(Math.max(layout.width, layout.depth), Math.round(Math.max(layout.width, layout.depth) / 3), 0x0b1622, 0x0b1622);
  fineGrid.position.set(layout.centerX, 0.01, layout.centerZ);
  scene.add(fineGrid);

  const hallOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(layout.width - 8, 0.4, layout.depth - 8)),
    new THREE.LineBasicMaterial({ color: NAV.boundary, transparent: true, opacity: 0.78 }),
  );
  hallOutline.position.set(layout.centerX, 0.2, layout.centerZ);
  scene.add(hallOutline);

  const starPositions = [];
  for (let index = 0; index < 260; index += 1) {
    starPositions.push(
      THREE.MathUtils.lerp(layout.minX - 90, layout.maxX + 90, Math.random()),
      THREE.MathUtils.lerp(26, 110, Math.random()),
      THREE.MathUtils.lerp(layout.minZ - 90, layout.maxZ + 90, Math.random()),
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: NAV.stars, size: 0.9, transparent: true, opacity: 0.78, sizeAttenuation: true })));

  buildNavigatorWall(scene, { color: NAV.gridGlow, depth: 0.2, height: 36, opacity: 0.14, segments: 12, width: layout.width - 10, x: layout.centerX, y: 18, z: layout.minZ + 4 });
  buildNavigatorWall(scene, { color: NAV.gridGlow, depth: layout.depth - 10, height: 36, opacity: 0.12, rotateY: Math.PI / 2, segments: 12, width: 0.2, x: layout.minX + 4, y: 18, z: layout.centerZ });

  [
    [layout.minX + 8, layout.minZ + 8],
    [layout.maxX - 8, layout.minZ + 8],
    [layout.maxX - 8, layout.maxZ - 8],
    [layout.minX + 8, layout.maxZ - 8],
  ].forEach(([x, z]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 26, 10), new THREE.MeshBasicMaterial({ color: 0x13384c, transparent: true, opacity: 0.5 }));
    tower.position.set(x, 13, z);
    scene.add(tower);
  });

  (parking.driveZones || []).forEach((zone) => {
    const group = new THREE.Group();
    group.position.set(zone.x, 0.4, zone.z);
    group.rotation.y = zone.rotation;
    scene.add(group);
    const slabHeight = 1.2;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(zone.width, slabHeight, zone.depth), new THREE.MeshStandardMaterial({ color: NAV.drive, emissive: new THREE.Color(NAV.drive).multiplyScalar(0.34), emissiveIntensity: 0.95, metalness: 0.24, roughness: 0.18 }));
    surface.position.y = slabHeight / 2;
    group.add(surface);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width + 0.25, slabHeight + 0.02, zone.depth + 0.25)), new THREE.LineBasicMaterial({ color: NAV.driveEdge, transparent: true, opacity: 0.9 }));
    outline.position.copy(surface.position);
    group.add(outline);
    const centerRail = new THREE.Mesh(new THREE.BoxGeometry(zone.width >= zone.depth ? Math.max(zone.width - 3.6, 2) : Math.min(zone.width * 0.14, 1.1), 0.08, zone.width >= zone.depth ? Math.min(zone.depth * 0.12, 1.3) : Math.max(zone.depth - 3.6, 2)), new THREE.MeshBasicMaterial({ color: 0xffdfe6, transparent: true, opacity: 0.78 }));
    centerRail.position.y = slabHeight + 0.1;
    group.add(centerRail);
  });

  (parking.walkZones || []).forEach((zone) => {
    const group = new THREE.Group();
    group.position.set(zone.x, 0.5, zone.z);
    group.rotation.y = zone.rotation;
    scene.add(group);
    const blockHeight = 2.8;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(zone.width, blockHeight, zone.depth), new THREE.MeshStandardMaterial({ color: NAV.walk, emissive: new THREE.Color(0x61d7ff).multiplyScalar(0.05), emissiveIntensity: 0.85, metalness: 0.12, roughness: 0.34, transparent: true, opacity: 0.82 }));
    surface.position.y = blockHeight / 2;
    group.add(surface);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width + 0.22, blockHeight + 0.04, zone.depth + 0.22)), new THREE.LineBasicMaterial({ color: NAV.walkEdge, transparent: true, opacity: 0.92 }));
    outline.position.copy(surface.position);
    group.add(outline);
  });

  (parking.pillars || []).forEach((pillar) => {
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius * 1.7, pillar.radius * 1.7, 0.06, 28), new THREE.MeshBasicMaterial({ color: NAV.pillarRing, transparent: true, opacity: 0.34 }));
    baseRing.position.set(pillar.x, 0.04, pillar.z);
    scene.add(baseRing);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius, pillar.radius * 1.08, pillar.height, 20), new THREE.MeshStandardMaterial({ color: NAV.pillar, emissive: new THREE.Color(NAV.pillar).multiplyScalar(0.28), emissiveIntensity: 0.88, roughness: 0.22, metalness: 0.08 }));
    shaft.position.set(pillar.x, pillar.height / 2, pillar.z);
    scene.add(shaft);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(pillar.radius * 1.08, pillar.radius * 1.08, 0.18, 20), new THREE.MeshStandardMaterial({ color: 0xeefbf0, roughness: 0.3, metalness: 0.06 }));
    cap.position.set(pillar.x, pillar.height + 0.09, pillar.z);
    scene.add(cap);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 18, 8), new THREE.MeshBasicMaterial({ color: NAV.pillar, transparent: true, opacity: 0.26 }));
    beam.position.set(pillar.x, pillar.height + 9, pillar.z);
    scene.add(beam);
  });

  (parking.landmarks || []).forEach((landmark) => {
    const group = new THREE.Group();
    group.position.set(landmark.x, 0, landmark.z);
    group.rotation.y = landmark.rotation;
    scene.add(group);
    const towerHeight = Math.max(landmark.height * 3.4, 6.4);
    const podium = new THREE.Mesh(new THREE.BoxGeometry(landmark.width, towerHeight, landmark.depth), new THREE.MeshStandardMaterial({ color: landmark.color, emissive: new THREE.Color(landmark.color).multiplyScalar(0.18), emissiveIntensity: 0.85, metalness: 0.34, roughness: 0.18, transparent: true, opacity: 0.86 }));
    podium.position.y = towerHeight / 2;
    group.add(podium);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(landmark.width + 0.2, towerHeight + 0.04, landmark.depth + 0.2)), new THREE.LineBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.82 }));
    outline.position.copy(podium.position);
    group.add(outline);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(Math.max(landmark.width - 1.4, 2), 0.18, Math.max(landmark.depth - 1.4, 2)), new THREE.MeshBasicMaterial({ color: 0xe7fcff, transparent: true, opacity: 0.9 }));
    crown.position.set(0, towerHeight + 0.2, 0);
    group.add(crown);
    const label = createTextSprite(landmark.label, { background: "#02111d", color: "#dcfbff", width: Math.max(240, Math.round(landmark.label.length * 18)), height: 88 });
    label.position.set(0, towerHeight + 3.1, 0);
    scene.add(label);
  });
}

function createSpotRecords(scene, spots, viewMode) {
  return spots.map((spot) => (viewMode === "navigator" ? createNavigatorSpotRecord(scene, spot) : createLayoutSpotRecord(scene, spot)));
}

function createLayoutSpotRecord(scene, spot) {
  const group = new THREE.Group();
  const color = STATUS_COLORS[spot.status] ?? STATUS_COLORS.available;
  const colorValue = new THREE.Color(color);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation;
  scene.add(group);
  const routeVisual = createLayoutRoute(scene, spot, color);
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(spot.width, spot.depth) * 0.62, Math.max(spot.width, spot.depth) * 0.62, 0.06, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 }));
  baseRing.position.y = 0.05;
  group.add(baseRing);
  const padHeight = 1;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(spot.width, padHeight, spot.depth), new THREE.MeshStandardMaterial({ color, emissive: colorValue.clone().multiplyScalar(0.08), emissiveIntensity: 1, metalness: 0.06, roughness: 0.46 }));
  surface.position.y = padHeight / 2;
  surface.userData.spotId = spot.id;
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(surface);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(spot.width + 0.2, padHeight + 0.04, spot.depth + 0.2)), new THREE.LineBasicMaterial({ color: 0xfafcff, transparent: true, opacity: 0.58 }));
  outline.position.copy(surface.position);
  group.add(outline);
  const stripeA = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width - 2.6, 2.4), 0.04, 0.3), new THREE.MeshBasicMaterial({ color: 0xf8fbfd, transparent: true, opacity: 0.92 }));
  stripeA.position.set(0, padHeight + 0.05, -spot.depth * 0.22);
  group.add(stripeA);
  const stripeB = stripeA.clone();
  stripeB.position.z = spot.depth * 0.22;
  group.add(stripeB);
  const beaconStem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0xf5f7f9, roughness: 0.52, metalness: 0.08 }));
  beaconStem.position.set(spot.width * 0.34, 1.4, -spot.depth * 0.28);
  beaconStem.castShadow = true;
  group.add(beaconStem);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), new THREE.MeshStandardMaterial({ color, emissive: colorValue.clone().multiplyScalar(0.3), emissiveIntensity: 1, roughness: 0.28, metalness: 0.05 }));
  beacon.position.set(spot.width * 0.34, 2.5, -spot.depth * 0.28);
  beacon.castShadow = true;
  group.add(beacon);
  const dataBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.8, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }));
  dataBeam.position.set(0, 2.2, 0);
  group.add(dataBeam);
  if (spot.status === "occupied") {
    const vehicle = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.62, 4.6), 1.2, Math.max(spot.depth * 0.48, 3.4)), new THREE.MeshStandardMaterial({ color: 0x5d6872, roughness: 0.54, metalness: 0.05 }));
    vehicle.position.set(-0.2, 1.18, 0);
    vehicle.castShadow = true;
    vehicle.receiveShadow = true;
    group.add(vehicle);
  }
  if (spot.status === "reserved") {
    const reservedShell = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.66, 4.8), 1.05, Math.max(spot.depth * 0.52, 3.4)), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.28, roughness: 0.48, metalness: 0.04 }));
    reservedShell.position.set(-0.2, 1.04, 0);
    group.add(reservedShell);
  }
  if (spot.status === "blocked") {
    const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xe34f57, roughness: 0.42, metalness: 0.04 });
    const barrierA = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.72, 6), 0.34, 0.5), barrierMaterial);
    barrierA.position.set(0, 1.2, 0);
    barrierA.rotation.y = Math.PI / 4;
    barrierA.castShadow = true;
    group.add(barrierA);
    const barrierB = barrierA.clone();
    barrierB.rotation.y = -Math.PI / 4;
    group.add(barrierB);
  }
  const label = createTextSprite(spot.id, { background: STATUS_LABEL_BACKGROUNDS[spot.status] ?? STATUS_LABEL_BACKGROUNDS.available, color: STATUS_LABEL_FOREGROUNDS[spot.status] ?? STATUS_LABEL_FOREGROUNDS.available, width: 172, height: 76 });
  label.position.set(0, 3.35, 0);
  group.add(label);
  return { anchor: new THREE.Vector3(spot.x, 0.65, spot.z), baseRing, baseRingIdleOpacity: 0.28, beacon, beaconIdleGlow: 1, beaconSelectedGlow: 1.5, flowMarker: routeVisual.flowMarker, flowSpeed: 0.00015, group, label, nodeIdleOpacity: 0.3, outline, outlineIdleOpacity: 0.58, pickable: surface, routeCurve: routeVisual.curve, routeIdleOpacity: 0.18, routeNodes: routeVisual.nodes, routeSelectedOpacity: 0.86, routeTube: routeVisual.tube, spot, surface, surfaceIdleGlow: 1, surfaceSelectedGlow: 1.5 };
}

function createNavigatorSpotRecord(scene, spot) {
  const group = new THREE.Group();
  const color = STATUS_COLORS[spot.status] ?? STATUS_COLORS.available;
  const colorValue = new THREE.Color(color);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.rotation;
  scene.add(group);
  const routeVisual = createNavigatorRoute(scene, spot, color);
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(spot.width, spot.depth) * 0.62, Math.max(spot.width, spot.depth) * 0.62, 0.08, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42 }));
  baseRing.position.y = 0.05;
  group.add(baseRing);
  const padHeight = spot.status === "occupied" ? 6 : spot.status === "reserved" ? 5 : spot.status === "blocked" ? 3.8 : 4.8;
  const surface = new THREE.Mesh(new THREE.BoxGeometry(spot.width, padHeight, spot.depth), new THREE.MeshStandardMaterial({ color, emissive: colorValue.clone(), emissiveIntensity: 0.4, metalness: 0.38, roughness: 0.16 }));
  surface.position.y = padHeight / 2;
  surface.userData.spotId = spot.id;
  group.add(surface);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(spot.width + 0.3, padHeight + 0.04, spot.depth + 0.3)), new THREE.LineBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.64 }));
  outline.position.copy(surface.position);
  group.add(outline);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width - 1.4, 2), 0.14, Math.max(spot.depth - 1.4, 2)), new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.72 }));
  canopy.position.set(0, padHeight + 0.1, 0);
  group.add(canopy);
  const beaconStem = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 2.2, 12), new THREE.MeshStandardMaterial({ color: 0xe4edf5, roughness: 0.28, metalness: 0.42 }));
  beaconStem.position.set(spot.width * 0.32, 1.85, -spot.depth * 0.28);
  group.add(beaconStem);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: colorValue.clone(), emissiveIntensity: 0.54, roughness: 0.2, metalness: 0.12 }));
  beacon.position.set(spot.width * 0.32, 2.95, -spot.depth * 0.28);
  group.add(beacon);
  const dataBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
  dataBeam.position.set(0, 4.4, 0);
  group.add(dataBeam);
  if (spot.status === "occupied") {
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.55, 4), 1.45, Math.max(spot.depth * 0.42, 3)), new THREE.MeshStandardMaterial({ color: 0x324a64, emissive: colorValue.clone().multiplyScalar(0.12), emissiveIntensity: 0.35, roughness: 0.46, metalness: 0.12 }));
    cargo.position.set(-0.1, 1.2, 0);
    group.add(cargo);
  }
  if (spot.status === "reserved") {
    const reservedShell = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.58, 4.8), 1.05, Math.max(spot.depth * 0.46, 3.2)), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.3, roughness: 0.4, metalness: 0.08 }));
    reservedShell.position.set(-0.2, 1.02, 0);
    group.add(reservedShell);
  }
  if (spot.status === "blocked") {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(Math.max(spot.width * 0.72, 6), 0.4, 0.55), new THREE.MeshStandardMaterial({ color: 0xff5d6a, roughness: 0.36, metalness: 0.08 }));
    barrier.position.set(0, 1.2, 0);
    barrier.rotation.y = Math.PI / 6;
    group.add(barrier);
  }
  const label = createTextSprite(spot.id, { background: STATUS_LABEL_BACKGROUNDS[spot.status] ?? STATUS_LABEL_BACKGROUNDS.available, color: STATUS_LABEL_FOREGROUNDS[spot.status] ?? STATUS_LABEL_FOREGROUNDS.available, width: 188, height: 84 });
  label.position.set(0, padHeight + 1.9, 0);
  group.add(label);
  return { anchor: new THREE.Vector3(spot.x, Math.max(padHeight * 0.55, 1.4), spot.z), baseRing, baseRingIdleOpacity: 0.42, beacon, beaconIdleGlow: 0.54, beaconSelectedGlow: 1.22, flowMarker: routeVisual.flowMarker, flowSpeed: 0.00018, group, label, nodeIdleOpacity: 0.28, outline, outlineIdleOpacity: 0.64, pickable: surface, routeCurve: routeVisual.curve, routeIdleOpacity: 0.18, routeNodes: routeVisual.nodes, routeSelectedOpacity: 0.9, routeTube: routeVisual.tube, spot, surface, surfaceIdleGlow: 0.4, surfaceSelectedGlow: 0.86 };
}

function createLayoutRoute(scene, spot, color) {
  if (!spot.route?.length) return { curve: null, flowMarker: null, nodes: [], tube: null };
  const routePoints = [...spot.route.map((point) => new THREE.Vector3(point.x, 0.18, point.z)), new THREE.Vector3(spot.x, 0.18, spot.z)];
  const curve = new THREE.CatmullRomCurve3(routePoints, false, "catmullrom", 0.08);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(routePoints.length * 16, 56), 0.14, 8, false), new THREE.MeshStandardMaterial({ color: LAYOUT.route, emissive: new THREE.Color(color).multiplyScalar(0.12), emissiveIntensity: 1, roughness: 0.54, metalness: 0.06, transparent: true, opacity: 0.18 }));
  scene.add(tube);
  const nodes = routePoints.map((point) => {
    const node = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 }));
    node.position.set(point.x, 0.1, point.z);
    scene.add(node);
    return node;
  });
  const flowMarker = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: 0.5, roughness: 0.24, metalness: 0.04, transparent: true, opacity: 0 }));
  flowMarker.visible = false;
  flowMarker.position.copy(routePoints[0]);
  scene.add(flowMarker);
  return { curve, flowMarker, nodes, tube };
}

function createNavigatorRoute(scene, spot, color) {
  if (!spot.route?.length) return { curve: null, flowMarker: null, nodes: [], tube: null };
  const routePoints = [...spot.route.map((point) => new THREE.Vector3(point.x, Math.max(point.y - 2.2, 4.4), point.z)), new THREE.Vector3(spot.x, 4.6, spot.z)];
  const curve = new THREE.CatmullRomCurve3(routePoints, false, "catmullrom", 0.08);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(routePoints.length * 12, 40), 0.22, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }));
  scene.add(tube);
  const nodes = routePoints.map((point) => {
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28 }));
    node.position.copy(point);
    scene.add(node);
    return node;
  });
  const flowMarker = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf5fbff, transparent: true, opacity: 0 }));
  flowMarker.visible = false;
  flowMarker.position.copy(routePoints[0]);
  scene.add(flowMarker);
  return { curve, flowMarker, nodes, tube };
}

function createTextSprite(text, { background, color, width, height }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available for bump-in labels.");
  drawRoundedRect(context, 6, 6, width - 12, height - 12, 18);
  context.fillStyle = background;
  context.fill();
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${Math.round(height * 0.36)}px "Space Grotesk", sans-serif`;
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 28, height / 28, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function buildNavigatorWall(scene, { color, depth, height, opacity, rotateY = 0, segments, width, x, y, z }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotateY;
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  const positions = [];
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const faceZ = depth / 2 + 0.02;
  for (let index = 1; index < segments; index += 1) {
    const xLine = -halfWidth + (width / segments) * index;
    positions.push(xLine, -halfHeight, faceZ, xLine, halfHeight, faceZ);
  }
  for (let index = 1; index < segments; index += 1) {
    const yLine = -halfHeight + (height / segments) * index;
    positions.push(-halfWidth, yLine, faceZ, halfWidth, yLine, faceZ);
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.65 })));
  scene.add(group);
}

function drawRoundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function setMaterialEmissiveIntensity(material, value) {
  if (material && "emissiveIntensity" in material) material.emissiveIntensity = value;
}

function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function disposeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (!object.material) return;
    if (Array.isArray(object.material)) {
      object.material.forEach(disposeMaterial);
      return;
    }
    disposeMaterial(object.material);
  });
}

function disposeMaterial(material) {
  if (material.map) material.map.dispose();
  material.dispose();
}
