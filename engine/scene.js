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
  const pos = new THREE.Vector3(6, 10, 3); // default

  switch (n) {
    case "front_left":
      pos.set(-6, 10, 3);
      break;
    case "front":
      pos.set(0, 10, 7);
      break;
    case "top":
      pos.set(0, 14, 0);
      break;
    case "back_right":
      pos.set(6, 8, -7);
      break;
    case "back_left":
      pos.set(-6, 8, -7);
      break;
    case "front_right":
    default:
      pos.set(6, 10, 3);
      break;
  }

  lights.key.position.copy(pos);
}

export function applyLightingPreset(lights, presetName) {
  if (!lights) return;

  const name = String(presetName || "studio").toLowerCase();

  // Defaults = "studio" (matches your original scene.js rig)
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

/* ===================== Reference Overlay (camera pinned) ===================== */

export function createReferenceOverlay(scene, camera) {
  if (!scene || !camera) throw new Error("createReferenceOverlay: scene + camera required");

  // Ensure camera is part of scene graph so its children update reliably
  // (safe; doesn't change rendering logic)
  try {
    if (!camera.parent) scene.add(camera);
  } catch {}

  const group = new THREE.Group();
  group.name = "reference_overlay_group";
  group.renderOrder = 9999;

  const material = new THREE.SpriteMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    depthTest: false,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = "reference_sprite";
  sprite.visible = false;

  // Make 100% non-pickable (your picker requires userData.pickable === true)
  sprite.userData.nonPickable = true;
  sprite.userData.pickable = false;

  // Position in front of camera (camera local space)
  sprite.position.set(0, 0, -6);

  group.add(sprite);
  camera.add(group);

  let _tex = null;
  let _url = null;
  let _aspect = 1; // width/height
  let _size = 3.2; // base height in world units (camera space)
  let _offsetX = 0;
  let _offsetY = 0;
  let _opacity = 0.65;
  let _flipX = false;

  function _applyScaleAndOffset() {
    // Sprite scale is in world units; keep height = _size, width = _size * aspect
    const h = Math.max(0.2, _size);
    const w = Math.max(0.2, _size * (_aspect || 1));
    sprite.scale.set(w, h, 1);

    sprite.position.x = _offsetX;
    sprite.position.y = _offsetY;
  }

  function _applyOpacity() {
    material.opacity = Math.max(0, Math.min(1, _opacity));
    material.transparent = material.opacity < 1 || !!material.map;
    material.needsUpdate = true;
  }

  function _applyFlip() {
    const map = material.map;
    if (!map) return;

    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;

    if (_flipX) {
      map.repeat.x = -1;
      map.offset.x = 1;
    } else {
      map.repeat.x = 1;
      map.offset.x = 0;
    }
    map.needsUpdate = true;
  }

  function clear() {
    sprite.visible = false;

    if (_url) {
      try { URL.revokeObjectURL(_url); } catch {}
      _url = null;
    }

    if (_tex) {
      try { _tex.dispose(); } catch {}
      _tex = null;
    }

    material.map = null;
    material.needsUpdate = true;
  }

  function setVisible(v) {
    sprite.visible = !!v && !!material.map;
  }

  function setOpacity(v) {
    const n = Number(v);
    if (Number.isFinite(n)) _opacity = n;
    _applyOpacity();
  }

  function setSize(v) {
    const n = Number(v);
    if (Number.isFinite(n)) _size = n;
    _applyScaleAndOffset();
  }

  function setOffset(x, y) {
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx)) _offsetX = nx;
    if (Number.isFinite(ny)) _offsetY = ny;
    _applyScaleAndOffset();
  }

  function setFlipX(v) {
    _flipX = !!v;
    _applyFlip();
  }

  async function setImageFile(file) {
    if (!file) return;

    clear();

    _url = URL.createObjectURL(file);

    // Load as HTMLImageElement (fast + compatible)
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = _url;
    });

    _aspect = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);

    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    _tex = tex;
    material.map = tex;

    _applyFlip();
    _applyOpacity();
    _applyScaleAndOffset();

    sprite.visible = true;
    material.needsUpdate = true;
  }

  // init
  _applyOpacity();
  _applyScaleAndOffset();

  return {
    sprite,
    clear,
    setVisible,
    setOpacity,
    setSize,
    setOffset,
    setFlipX,
    setImageFile,
    hasImage: () => !!material.map
  };
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

  // Orbit controls
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.target.set(0, 1.05, 0);

  /* ===================== ✅ FIX: Prevent zooming into blank screen ===================== */
  // Without bounds, users can zoom far enough that everything is clipped by camera.far.
  // Keep values sane for a character posing scene (still far enough for props).
  orbit.minDistance = 1.2;
  orbit.maxDistance = 40;

  // Extra guard: if maxDistance ever changes elsewhere, never let distance exceed camera.far
  // This prevents "blank screen" even if someone later sets maxDistance too high.
  let _clampGuard = false;
  orbit.addEventListener("change", () => {
    if (_clampGuard) return;
    _clampGuard = true;
    try {
      const d = camera.position.distanceTo(orbit.target);
      const hardMax = Math.max(2, (camera.far || 200) * 0.92);

      // Prefer orbit.maxDistance if defined; still never exceed camera.far safety range.
      const targetMax = Math.min(
        Number.isFinite(orbit.maxDistance) ? orbit.maxDistance : Infinity,
        hardMax
      );

      if (d > targetMax) {
        const dir = camera.position.clone().sub(orbit.target).normalize();
        camera.position.copy(orbit.target.clone().add(dir.multiplyScalar(targetMax)));
        // no orbit.update() here (avoid recursion); the next frame will settle.
      }
    } catch {
      // ignore
    } finally {
      _clampGuard = false;
    }
  });
  /* ================================================================================ */

  // Lighting (store refs for UI)
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

  // Floor + grid + axes
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

  // Raycaster + pointer
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Transform controls (gizmo)
  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.size = 0.85;

  gizmo.addEventListener("dragging-changed", (e) => {
    if (orbit) orbit.enabled = !e.value && (STATE?.mode === "orbit");
    if (e.value && typeof showToast === "function") {
      const m = STATE?.mode;
      showToast(m === "move" ? "Moving…" : m === "scale" ? "Scaling…" : "Rotating…");
    }
  });

  scene.add(gizmo);

  // Outline helper
  const outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
  outline.visible = false;
  scene.add(outline);

  // Hook events (optional)
  if (typeof onPointerDown === "function") window.addEventListener("pointerdown", onPointerDown);
  if (typeof onKeyDown === "function") window.addEventListener("keydown", onKeyDown);

  // Initial visibility derived from STATE if provided
  if (STATE) {
    gridHelper.visible = !!STATE.showGrid;
    axesHelper.visible = !!STATE.showAxes;
  }

  /* ===================== ✅ Additive feature: create & return reference overlay ===================== */
  // This does NOT break anything:
  // - The sprite starts hidden until an image is set
  // - It is non-pickable
  // - Returning extra fields is safe for existing callers
  let referenceOverlay = null;
  try {
    referenceOverlay = createReferenceOverlay(scene, camera);
  } catch {
    referenceOverlay = null;
  }
  /* =============================================================================================== */

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
    floor,
    lights,
    referenceOverlay
  };
}
