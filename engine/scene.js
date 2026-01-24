// engine/scene.js
// Builds the THREE.Scene + camera + orbit + gizmo + helpers.
// ✅ Exposes lights + small helpers for lighting presets + key direction.
// ✅ Background tones expanded.
// ✅ Reference image overlay (camera-pinned, non-pickable).
// ✅ Smooth wheel zoom (custom dolly with easing) while keeping OrbitControls for rotate/pan/touch.

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

  /* ===================== Distance bounds (your working part) ===================== */
  orbit.minDistance = 2.0;
  orbit.maxDistance = 18.0;

  /* ===================== ✅ Smooth wheel zoom (custom) ===================== */
  // OrbitControls wheel zoom is step-based (mouse wheels feel jumpy).
  // We intercept wheel early (capture phase), stop OrbitControls' wheel handler,
  // then ease camera distance toward a target distance.

  // Tuning knobs (safe defaults)
  const WHEEL_SENSITIVITY = 0.00135; // lower = slower zoom per wheel tick
  const ZOOM_EASE = 0.18;            // higher = snappier, lower = smoother
  const ZOOM_STOP_EPS = 0.0015;      // how close before we stop animating

  const _vDir = new THREE.Vector3();
  const _vDesiredPos = new THREE.Vector3();

  let _desiredDistance = camera.position.distanceTo(orbit.target);
  let _zoomRaf = 0;

  function _clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function _getHardMaxDistance() {
    // Never allow distance beyond far plane margin (prevents "blank screen").
    const far = Number.isFinite(camera.far) ? camera.far : 200;
    const hardMax = Math.max(orbit.minDistance + 0.5, far * 0.85);
    const maxD = Number.isFinite(orbit.maxDistance) ? orbit.maxDistance : hardMax;
    return Math.min(maxD, hardMax);
  }

  function _ensureDesiredDistanceInRange() {
    const hardMax = _getHardMaxDistance();
    _desiredDistance = _clamp(_desiredDistance, orbit.minDistance, hardMax);
  }

  function _animateZoom() {
    _zoomRaf = 0;

    _ensureDesiredDistanceInRange();

    const currentDistance = camera.position.distanceTo(orbit.target);
    const hardMax = _getHardMaxDistance();
    const targetDistance = _clamp(_desiredDistance, orbit.minDistance, hardMax);

    // If already close enough, stop.
    if (Math.abs(currentDistance - targetDistance) <= Math.max(ZOOM_STOP_EPS, targetDistance * 0.0008)) {
      return;
    }

    // Move camera along its view line to orbit.target
    _vDir.copy(camera.position).sub(orbit.target).normalize();
    _vDesiredPos.copy(orbit.target).add(_vDir.multiplyScalar(targetDistance));

    // Ease position (smooth)
    camera.position.lerp(_vDesiredPos, ZOOM_EASE);

    // Keep OrbitControls coherent
    orbit.update();

    // Continue animating until we converge
    _zoomRaf = requestAnimationFrame(_animateZoom);
  }

  function _onWheelCapture(ev) {
    // Only zoom when NOT in orbit mode? (your app uses mode "orbit" to enable orbit movement)
    // But wheel zoom is useful in any mode; keep it always.
    if (!orbit || !camera) return;

    // Stop OrbitControls wheel handler (must happen in capture phase)
    try { ev.preventDefault(); } catch {}
    try { ev.stopImmediatePropagation(); } catch {}

    // Normalize delta across devices (mouse vs trackpad)
    // deltaMode: 0=pixels, 1=lines, 2=pages
    const dm = ev.deltaMode || 0;
    const delta = ev.deltaY * (dm === 1 ? 16 : dm === 2 ? 200 : 1);

    // Exponential zoom factor feels more natural than linear
    const currentDistance = camera.position.distanceTo(orbit.target);
    const hardMax = _getHardMaxDistance();

    // factor < 1 => zoom in, factor > 1 => zoom out
    // Positive deltaY typically means zoom out
    const factor = Math.exp(delta * WHEEL_SENSITIVITY);

    _desiredDistance = _clamp(currentDistance * factor, orbit.minDistance, hardMax);

    if (!_zoomRaf) _zoomRaf = requestAnimationFrame(_animateZoom);
  }

  // IMPORTANT: capture:true so we run before OrbitControls' own listener.
  renderer.domElement.addEventListener("wheel", _onWheelCapture, { passive: false, capture: true });

  // If something changes maxDistance/minDistance later, keep desiredDistance sane
  orbit.addEventListener("change", () => {
    _ensureDesiredDistanceInRange();
  });
  /* ===================================================================== */

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

  /* ===================== Additive: create & return reference overlay ===================== */
  let referenceOverlay = null;
  try {
    referenceOverlay = createReferenceOverlay(scene, camera);
  } catch {
    referenceOverlay = null;
  }
  /* ====================================================================================== */

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
