// engine/scene.js
// Builds the THREE.Scene + camera + orbit + gizmo + helpers exactly like your current app.js,
// but packaged as a module.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export function setBackgroundTone(scene, mode) {
  if (!scene) return;
  if (mode === "studio") scene.background = new THREE.Color(0x10131a);
  else if (mode === "graphite") scene.background = new THREE.Color(0x0b0b10);
  else scene.background = new THREE.Color(0x0b0f17); // midnight default
}

export function createScene({
  canvas,
  renderer,
  STATE,
  showToast,
  onPointerDown,
  onKeyDown
} = {}) {
  if (!canvas) throw new Error("createScene: canvas is required");
  if (!renderer) throw new Error("createScene: renderer is required");

  const scene = new THREE.Scene();
  setBackgroundTone(scene, "midnight");

  // Camera (same as app.js)
  const camera = new THREE.PerspectiveCamera(
    55,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    200
  );
  camera.position.set(4.6, 3.7, 6.2);
  camera.lookAt(0, 1.1, 0);

  // Orbit controls (same settings)
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.target.set(0, 1.05, 0);

  // Lighting (same as app.js)
  scene.add(new THREE.HemisphereLight(0x9bb2ff, 0x151a22, 0.35));

  const ambient = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.92);
  key.position.set(6, 10, 3);
  key.castShadow = true;

  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.02;

  scene.add(key);

  const fill = new THREE.DirectionalLight(0x88bbff, 0.30);
  fill.position.set(-7, 4, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xaad9ff, 0.18);
  rim.position.set(-2, 3, 8);
  scene.add(rim);

  // Floor + grid + axes (same)
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x131826,
    metalness: 0.05,
    roughness: 0.95
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(50, 50, 0x2a3550, 0x1c2436);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(2.2);
  axesHelper.visible = false;
  scene.add(axesHelper);

  // Raycaster + pointer (same)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Transform controls (gizmo) (same)
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.size = 0.85;

  gizmo.addEventListener("dragging-changed", (e) => {
    // Orbit ONLY when Orbit mode is active, never during gizmo drag
    if (orbit) orbit.enabled = !e.value && (STATE?.mode === "orbit");
    if (e.value && typeof showToast === "function") {
      showToast(STATE?.mode === "move" ? "Moving…" : "Rotating…");
    }
  });

  scene.add(gizmo);

  // Outline helper (same)
  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
  outline.visible = false;
  scene.add(outline);

  // Hook events (keep same behavior as your monolith)
  if (typeof onPointerDown === "function") window.addEventListener("pointerdown", onPointerDown);
  if (typeof onKeyDown === "function") window.addEventListener("keydown", onKeyDown);

  // Initial visibility derived from STATE if provided
  if (STATE) {
    gridHelper.visible = !!STATE.showGrid;
    axesHelper.visible = !!STATE.showAxes;
  }

  return {
    scene,
    camera,
    orbit,
    gizmo,
    axesHelper,
    gridHelper,
    outline,
    raycaster,
    pointer,
    floor
  };
}
