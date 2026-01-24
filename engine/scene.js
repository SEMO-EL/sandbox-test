// engine/scene.js
// Builds the THREE.Scene + camera + orbit + gizmo + helpers.
// ✅ Exposes lights + small helpers for lighting presets + key direction.
// ✅ Background tones expanded.
// ✅ Reference image overlay (camera-pinned, non-pickable).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

export function setBackgroundTone(scene, mode) {
  if (!scene) return;

  const m = String(mode || "midnight").toLowerCase();

  if (m === "studio") scene.background = new THREE.Color(0x10131a);
  else if (m === "graphite") scene.background = new THREE.Color(0x0b0b10);
  else if (m === "dawn") scene.background = new THREE.Color(0x111a2b);
  else if (m === "mint") scene.background = new THREE.Color(0x0b1a18);
  else if (m === "sunset") scene.background = new THREE.Color(0x1a0f17);
  else if (m === "white") scene.background = new THREE.Color(0xf2f4f8);
  else if (m === "black") scene.background = new THREE.Color(0x000000);
  else scene.background = new THREE.Color(0x0b0f17); // midnight default
}

export function setKeyDirectionByName(lights, name) {
  if (!lights?.key) return;

  const n = String(name || "front_right");
  const pos = new THREE.Vector3(6, 10, 3);

  switch (n) {
    case "front_left": pos.set(-6, 10, 3); break;
    case "front": pos.set(0, 10, 7); break;
    case "top": pos.set(0, 14, 0); break;
    case "back_right": pos.set(6, 8, -7); break;
    case "back_left": pos.set(-6, 8, -7); break;
    default: pos.set(6, 10, 3); break;
  }

  lights.key.position.copy(pos);
}

export function applyLightingPreset(lights, presetName) {
  if (!lights) return;

  const name = String(presetName || "studio").toLowerCase();

  const studio = () => {
    lights.hemi.color.setHex(0x9bb2ff);
    lights.hemi.groundColor.setHex(0x151a22);
    lights.hemi.intensity = 0.35;

    lights.ambient.color.setHex(0xffffff);
    lights.ambient.intensity = 0.22;

    lights.key.color.setHex(0xffffff);
    lights.key.intensity = 0.92;
    setKeyDirectionByName(lights, "front_right");

    lights.fill.color.setHex(0x88bbff);
    lights.fill.intensity = 0.30;

    lights.rim.color.setHex(0xaad9ff);
    lights.rim.intensity = 0.18;
  };

  const flat = () => {
    lights.hemi.color.setHex(0xffffff);
    lights.hemi.groundColor.setHex(0xffffff);
    lights.hemi.intensity = 0.10;

    lights.ambient.color.setHex(0xffffff);
    lights.ambient.intensity = 0.65;

    lights.key.color.setHex(0xffffff);
    lights.key.intensity = 0.35;
    setKeyDirectionByName(lights, "front");

    lights.fill.color.setHex(0xffffff);
    lights.fill.intensity = 0.35;

    lights.rim.color.setHex(0xffffff);
    lights.rim.intensity = 0.05;
  };

  const moody = () => {
    lights.hemi.color.setHex(0x6a7cff);
    lights.hemi.groundColor.setHex(0x0b0f17);
    lights.hemi.intensity = 0.15;

    lights.ambient.color.setHex(0xffffff);
    lights.ambient.intensity = 0.08;

    lights.key.color.setHex(0xfff1dd);
    lights.key.intensity = 1.15;
    setKeyDirectionByName(lights, "front_left");

    lights.fill.color.setHex(0x5aa0ff);
    lights.fill.intensity = 0.14;

    lights.rim.color.setHex(0x9fd7ff);
    lights.rim.intensity = 0.30;
  };

  const rim = () => {
    lights.hemi.color.setHex(0x9bb2ff);
    lights.hemi.groundColor.setHex(0x151a22);
    lights.hemi.intensity = 0.10;

    lights.ambient.color.setHex(0xffffff);
    lights.ambient.intensity = 0.05;

    lights.key.color.setHex(0xffffff);
    lights.key.intensity = 0.45;
    setKeyDirectionByName(lights, "back_right");

    lights.fill.color.setHex(0x88bbff);
    lights.fill.intensity = 0.10;

    lights.rim.color.setHex(0xe6f6ff);
    lights.rim.intensity = 0.95;
  };

  if (name === "flat") flat();
  else if (name === "moody") moody();
  else if (name === "rim") rim();
  else studio();
}

/* ===================== createScene ===================== */

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

  // Camera
  const camera = new THREE.PerspectiveCamera(
    55,
    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
    0.1,
    200
  );
  camera.position.set(4.6, 3.7, 6.2);
  camera.lookAt(0, 1.1, 0);

  // Orbit controls ✅ FIX HERE
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.target.set(0, 1.05, 0);

  // 🔒 Prevent zooming into the void
  orbit.minDistance = 1.5;
  orbit.maxDistance = 20;

  // Lighting
  const hemi = new THREE.HemisphereLight(0x9bb2ff, 0x151a22, 0.35);
  scene.add(hemi);

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

  const lights = { hemi, ambient, key, fill, rim };

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: 0x131826,
      metalness: 0.05,
      roughness: 0.95
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(50, 50, 0x2a3550, 0x1c2436);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(2.2);
  axesHelper.visible = false;
  scene.add(axesHelper);

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.size = 0.85;

  gizmo.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value;
    if (e.value && showToast) showToast("Transforming…");
  });

  scene.add(gizmo);

  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
  outline.visible = false;
  scene.add(outline);

  if (onPointerDown) window.addEventListener("pointerdown", onPointerDown);
  if (onKeyDown) window.addEventListener("keydown", onKeyDown);

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
    floor,
    lights
  };
}
