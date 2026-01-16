import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

/* DOM refs */
const canvas = document.getElementById("c");
const errorOverlay = document.getElementById("errorOverlay");
const errorText = document.getElementById("errorText");
const toast = document.getElementById("toast");

const selectionName = document.getElementById("selectionName");
const btnFocus = document.getElementById("btnFocus");
const btnClear = document.getElementById("btnClear");

const modeRotate = document.getElementById("modeRotate");
const modeMove = document.getElementById("modeMove");
const modeOrbit = document.getElementById("modeOrbit");

const axisX = document.getElementById("axisX");
const axisY = document.getElementById("axisY");
const axisZ = document.getElementById("axisZ");
const rotateSnap = document.getElementById("rotateSnap");

const togGrid = document.getElementById("togGrid");
const togAxes = document.getElementById("togAxes");
const togOutline = document.getElementById("togOutline");

const btnResetPose = document.getElementById("btnResetPose");
const btnRandomPose = document.getElementById("btnRandomPose");
const btnSavePose = document.getElementById("btnSavePose");
const btnLoadPose = document.getElementById("btnLoadPose");
const filePose = document.getElementById("filePose");
const poseNotes = document.getElementById("poseNotes");

const btnAddCube = document.getElementById("btnAddCube");
const btnAddSphere = document.getElementById("btnAddSphere");
const btnDelProp = document.getElementById("btnDelProp");
const btnScatter = document.getElementById("btnScatter");
const bgTone = document.getElementById("bgTone");

const btnExport = document.getElementById("btnExport");
const btnHelp = document.getElementById("btnHelp");
const helpModal = document.getElementById("helpModal");
const btnCloseHelp = document.getElementById("btnCloseHelp");
const btnHelpOk = document.getElementById("btnHelpOk");
const btnPerf = document.getElementById("btnPerf");

/* New: Pose Gallery DOM */
const btnSaveGallery = document.getElementById("btnSaveGallery");
const poseGallery = document.getElementById("poseGallery");
const btnRenamePose = document.getElementById("btnRenamePose");
const btnDeletePose = document.getElementById("btnDeletePose");
const btnClearGallery = document.getElementById("btnClearGallery");

/* ✅ NEW: Preset Poses DOM (added, not replacing anything) */
const presetGallery = document.getElementById("presetGallery");
const btnPresetApply = document.getElementById("btnPresetApply");
const btnPresetSave = document.getElementById("btnPresetSave");

/* Helpers */
function showToast(msg, ms = 1400) {
  toast.textContent = msg;
  toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => toast.classList.remove("show"), ms);
}

function fatal(err) {
  errorText.textContent = String(err?.stack || err);
  errorOverlay.classList.remove("hidden");
  console.error(err);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function nowISO() {
  return new Date().toISOString();
}

function niceTime(iso) {
  // no libs: cheap readable timestamp
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/* Three globals */
let renderer, scene, camera, orbit, gizmo, axesHelper, gridHelper, outline;
let raycaster, pointer;

let selected = null;
let perfEnabled = false;

let lastFrameTime = performance.now();
let fpsSmoothed = 60;

const STATE = {
  mode: "rotate",                 // "rotate" | "move" | "orbit"
  axis: { x: true, y: true, z: true },
  snapDeg: 10,
  showGrid: true,
  showAxes: false,
  showOutline: true
};

const world = {
  root: new THREE.Group(),
  joints: [],
  props: []
};

/* ---------------------------- Pose Gallery ---------------------------- */
const GALLERY = {
  key: "pose_sandbox_gallery_v1",
  maxItems: 30
};

let galleryItems = [];     // array of {id,name,createdAt,notes,pose,thumb}
let gallerySelectedId = null;

function loadGalleryFromStorage() {
  const raw = localStorage.getItem(GALLERY.key);
  galleryItems = safeJsonParse(raw, []);
  if (!Array.isArray(galleryItems)) galleryItems = [];
  galleryItems = galleryItems.filter(it => it && typeof it === "object" && it.id && it.pose && it.thumb);
  if (galleryItems.length > GALLERY.maxItems) galleryItems = galleryItems.slice(0, GALLERY.maxItems);
}

function saveGalleryToStorage() {
  try {
    localStorage.setItem(GALLERY.key, JSON.stringify(galleryItems));
  } catch (e) {
    // If storage fails (quota), keep working without crashing
    console.warn("Gallery save failed:", e);
    showToast("Gallery save failed (storage full?)", 1800);
  }
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function ensureGallerySelectionValid() {
  if (!gallerySelectedId) return;
  const exists = galleryItems.some(it => it.id === gallerySelectedId);
  if (!exists) gallerySelectedId = null;
}

function renderGallery() {
  if (!poseGallery) return;

  ensureGallerySelectionValid();
  poseGallery.innerHTML = "";

  if (!galleryItems.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No poses saved yet. Use “Save JSON” or “Save to Gallery”.";
    poseGallery.appendChild(empty);
    return;
  }

  galleryItems.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "poseItem" + (it.id === gallerySelectedId ? " poseItem--active" : "");
    card.title = "Click to load this pose";

    const badge = document.createElement("div");
    badge.className = "poseBadge";
    badge.textContent = String(idx + 1);

    const img = document.createElement("img");
    img.className = "poseThumb";
    img.alt = it.name || "Pose";
    img.loading = "lazy";
    img.src = it.thumb;

    const meta = document.createElement("div");
    meta.className = "poseMeta";

    const name = document.createElement("div");
    name.className = "poseName";
    name.textContent = it.name || "Untitled pose";

    const time = document.createElement("div");
    time.className = "poseTime";
    time.textContent = niceTime(it.createdAt || "");

    meta.appendChild(name);
    meta.appendChild(time);

    card.appendChild(img);
    card.appendChild(badge);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      gallerySelectedId = it.id;
      renderGallery();
      applyPose(it.pose);
      if (typeof it.notes === "string") poseNotes.value = it.notes;
      showToast(`Loaded: ${it.name || "pose"}`);
    });

    poseGallery.appendChild(card);
  });
}

function captureThumbnail(size = 256) {
  // Must render before capture for accuracy
  renderer.render(scene, camera);

  // Draw from renderer DOM canvas into a square thumbnail
  const src = renderer.domElement;
  const thumb = document.createElement("canvas");
  thumb.width = size;
  thumb.height = size;

  const ctx = thumb.getContext("2d", { willReadFrequently: false });
  if (!ctx) return null;

  // Center-crop to square from source canvas
  const sw = src.width;
  const sh = src.height;
  const s = Math.min(sw, sh);
  const sx = Math.floor((sw - s) / 2);
  const sy = Math.floor((sh - s) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, s, s, 0, 0, size, size);

  try {
    return thumb.toDataURL("image/png");
  } catch {
    return null;
  }
}

function savePoseToGallery({ name = "", withToast = true } = {}) {
  const pose = serializePose();
  const thumb = captureThumbnail(256);

  if (!thumb) {
    showToast("Thumbnail capture failed", 1600);
    return;
  }

  const item = {
    id: uid(),
    name: (name || "").trim() || `Pose ${galleryItems.length + 1}`,
    createdAt: nowISO(),
    notes: String(poseNotes.value || ""),
    pose,
    thumb
  };

  galleryItems.unshift(item);
  if (galleryItems.length > GALLERY.maxItems) galleryItems.length = GALLERY.maxItems;

  gallerySelectedId = item.id;
  saveGalleryToStorage();
  renderGallery();

  if (withToast) showToast("Saved to gallery");
}

function renameSelectedGalleryPose() {
  if (!gallerySelectedId) {
    showToast("Select a pose thumbnail first");
    return;
  }
  const it = galleryItems.find(x => x.id === gallerySelectedId);
  if (!it) return;

  const next = prompt("Rename pose:", it.name || "");
  if (next === null) return; // cancelled
  const trimmed = String(next).trim();
  it.name = trimmed || it.name || "Untitled pose";

  saveGalleryToStorage();
  renderGallery();
  showToast("Pose renamed");
}

function deleteSelectedGalleryPose() {
  if (!gallerySelectedId) {
    showToast("Select a pose thumbnail first");
    return;
  }
  const before = galleryItems.length;
  galleryItems = galleryItems.filter(x => x.id !== gallerySelectedId);
  gallerySelectedId = null;

  if (galleryItems.length === before) return;

  saveGalleryToStorage();
  renderGallery();
  showToast("Pose deleted");
}

function clearGalleryAll() {
  if (!galleryItems.length) {
    showToast("Gallery is already empty");
    return;
  }
  const ok = confirm("Clear ALL saved poses from gallery? (This cannot be undone)");
  if (!ok) return;

  galleryItems = [];
  gallerySelectedId = null;
  saveGalleryToStorage();
  renderGallery();
  showToast("Gallery cleared");
}

/* ✅ NEW: Built-in Preset Poses (added on top, no removals) */
const PRESETS = [
  {
    id: "preset_1",
    name: "Relaxed",
    pose: {
      version: 1,
      joints: {
        char_root: [0, 0, 0, 1],
        hips: [0, 0, 0, 1],
        chest: [0, 0, 0, 1],
        neck: [0.04759456129688851, 0.009576663708617747, -0.0011707300285879193, 0.9988219873408878],
        l_shoulder: [0.1301891507925539, -0.014738540977259416, 0.06476785232531384, 0.9892318078826294],
        r_shoulder: [0.27634560178163494, 0.023726365746203576, -0.05370027624805413, 0.9594457106931408],
        l_elbow: [0.2798218193432752, -0.015308195708092299, 0.005570112325944717, 0.9599184290881037],
        r_elbow: [-0.25674698223356186, 0.044025624238825105, 0.009168335615828587, 0.9653147901372876],
        l_hip: [0, 0, 0, 1],
        r_hip: [0, 0, 0, 1],
        l_knee: [0, 0, 0, 1],
        r_knee: [0, 0, 0, 1]
      }
    }
  },
  {
    id: "preset_2",
    name: "Twist",
    pose: {
      version: 1,
      joints: {
        char_root: [0, 0, 0, 1],
        hips: [0, 0, 0, 1],
        chest: [-0.0412301888451669, -0.09008326951266773, 0.011304799006101974, 0.9950523256689931],
        neck: [0.011843014537166162, 0.09089017694972191, 0.01458125197845934, 0.9956935354441061],
        l_shoulder: [-0.24879708961614975, 0.17826989264992213, -0.08584833223081493, 0.9488140767071036],
        r_shoulder: [0.2693851900799168, 0.0763242258244725, -0.04510161367512071, 0.9593685825853303],
        l_elbow: [0.027456907101200325, -0.09064209837284216, -0.006572594857644518, 0.9954963982432548],
        r_elbow: [-0.06377397266884179, -0.07643826082925264, 0.07551536447123127, 0.9917972867002502],
        l_hip: [0, 0, 0, 1],
        r_hip: [0, 0, 0, 1],
        l_knee: [0, 0, 0, 1],
        r_knee: [0, 0, 0, 1]
      }
    }
  },
  {
    id: "preset_3",
    name: "Lean",
    pose: {
      version: 1,
      joints: {
        char_root: [0, 0, 0, 1],
        hips: [0, 0, 0, 1],
        chest: [0, 0, 0, 1],
        neck: [-0.0695813342862614, -0.003531484504259168, 0.00024687510544474267, 0.9975698339834392],
        l_shoulder: [-0.14442983749440642, 0.004657484022909194, 0.05844950058128813, 0.9877638600057579],
        r_shoulder: [0.10974141605108569, 0.002131681788122489, -0.046677418804861634, 0.9928655247166642],
        l_elbow: [0.10797061771640441, 0.01707166371519849, 0.0019790442372586692, 0.9939991145935999],
        r_elbow: [-0.06265532258425938, 0.0033037113797317633, 0.006816360112734738, 0.998007833867271],
        l_hip: [0, 0, 0, 1],
        r_hip: [0, 0, 0, 1],
        l_knee: [0, 0, 0, 1],
        r_knee: [0, 0, 0, 1]
      }
    }
  },
  {
    id: "preset_4",
    name: "Action",
    pose: {
      version: 1,
      joints: {
        char_root: [0, 0, 0, 1],
        hips: [0.10401420271711828, 0, 0, 0.9945758279564117],
        chest: [0, 0, 0, 1],
        neck: [-0.2181436004131093, 0.010097416045732415, 0.002247558353562821, 0.9758545511217754],
        l_shoulder: [0.3639398774390935, -0.08207106038298768, 0.15769049586896034, 0.9144209096683541],
        r_shoulder: [0.17925513125200985, -0.24157575955084774, 0.04978436443866611, 0.9529072882483355],
        l_elbow: [0.25842624693713956, 0.013639980803026312, -0.06635545370746994, 0.9637428503213337],
        r_elbow: [-0.19305822233059853, -0.011266331092281362, 0.07551100424672397, 0.9781708271941326],
        l_hip: [0, 0, 0, 1],
        r_hip: [0, 0, 0, 1],
        l_knee: [0, 0, 0, 1],
        r_knee: [0, 0, 0, 1]
      }
    }
  },
  {
    id: "preset_5",
    name: "Neutral",
    pose: {
      version: 1,
      joints: {
        char_root: [0, 0, 0, 1],
        hips: [0, 0, 0, 1],
        chest: [0, 0, 0, 1],
        neck: [0, 0, 0, 1],
        l_shoulder: [0, 0, 0, 1],
        r_shoulder: [0, 0, 0, 1],
        l_elbow: [0, 0, 0, 1],
        r_elbow: [0, 0, 0, 1],
        l_hip: [0, 0, 0, 1],
        r_hip: [0, 0, 0, 1],
        l_knee: [0, 0, 0, 1],
        r_knee: [0, 0, 0, 1]
      }
    }
  }
];

let presetSelectedId = null;

function ensurePresetSelectionValid() {
  if (!presetSelectedId) return;
  const exists = PRESETS.some(p => p.id === presetSelectedId);
  if (!exists) presetSelectedId = null;
}

function renderPresets() {
  if (!presetGallery) return;

  ensurePresetSelectionValid();
  presetGallery.innerHTML = "";

  // If empty (shouldn't happen), still show something
  if (!PRESETS.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No presets available.";
    presetGallery.appendChild(empty);
    return;
  }

  PRESETS.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "poseItem" + (p.id === presetSelectedId ? " poseItem--active" : "");
    card.title = "Click to select this preset";

    // Use a lightweight "thumbnail" card (consistent with your CSS)
    const faux = document.createElement("div");
    faux.className = "poseThumb";
    faux.style.display = "grid";
    faux.style.placeItems = "center";
    faux.style.fontWeight = "900";
    faux.style.color = "rgba(255,255,255,0.85)";
    faux.style.userSelect = "none";
    faux.textContent = "★";

    const badge = document.createElement("div");
    badge.className = "poseBadge";
    badge.textContent = String(idx + 1);

    const meta = document.createElement("div");
    meta.className = "poseMeta";

    const name = document.createElement("div");
    name.className = "poseName";
    name.textContent = p.name;

    const time = document.createElement("div");
    time.className = "poseTime";
    time.textContent = "Built-in preset";

    meta.appendChild(name);
    meta.appendChild(time);

    card.appendChild(faux);
    card.appendChild(badge);
    card.appendChild(meta);

    card.addEventListener("click", () => {
      presetSelectedId = p.id;
      renderPresets();
      showToast(`Selected preset: ${p.name}`);
    });

    presetGallery.appendChild(card);
  });
}

function getSelectedPreset() {
  if (!presetSelectedId) return null;
  return PRESETS.find(p => p.id === presetSelectedId) || null;
}

function applyPoseJointsOnly(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid preset");
  if (!data.joints || typeof data.joints !== "object") throw new Error("Preset missing joints");

  world.joints.forEach(j => {
    const q = data.joints[j.name];
    if (Array.isArray(q) && q.length === 4) j.quaternion.fromArray(q);
  });

  updateOutline();
  showToast("Preset applied");
}

function applySelectedPreset() {
  const p = getSelectedPreset();
  if (!p) {
    showToast("Select a preset first");
    return;
  }
  applyPoseJointsOnly(p.pose);
}

function saveSelectedPresetToGallery() {
  const p = getSelectedPreset();
  if (!p) {
    showToast("Select a preset first");
    return;
  }

  // Apply first so the thumbnail matches the preset pose
  applyPoseJointsOnly(p.pose);

  // Save with preset name into gallery (creates a REAL thumbnail)
  savePoseToGallery({ name: p.name, withToast: true });
}

/* Scene */
function createRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ✅ Shadows (quality upgrade)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
}

function setBackgroundTone(mode) {
  if (!scene) return;
  if (mode === "studio") scene.background = new THREE.Color(0x10131a);
  else if (mode === "graphite") scene.background = new THREE.Color(0x0b0b10);
  else scene.background = new THREE.Color(0x0b0f17);
}

function createScene() {
  scene = new THREE.Scene();
  setBackgroundTone("midnight");

  camera = new THREE.PerspectiveCamera(
    55,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    200
  );
  camera.position.set(4.6, 3.7, 6.2);
  camera.lookAt(0, 1.1, 0);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.target.set(0, 1.05, 0);

  // ✅ Better lighting (quality upgrade)
  scene.add(new THREE.HemisphereLight(0x9bb2ff, 0x151a22, 0.35));

  const ambient = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.92);
  key.position.set(6, 10, 3);
  key.castShadow = true;

  // shadow tuning (no acne / decent softness)
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

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x131826,
    metalness: 0.05,
    roughness: 0.95
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true; // ✅ receive shadows
  scene.add(floor);

  gridHelper = new THREE.GridHelper(50, 50, 0x2a3550, 0x1c2436);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(2.2);
  axesHelper.visible = false;
  scene.add(axesHelper);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.size = 0.85;

  gizmo.addEventListener("dragging-changed", (e) => {
    // Orbit ONLY when Orbit mode is active, never during gizmo drag
    orbit.enabled = !e.value && (STATE.mode === "orbit");
    if (e.value) showToast(STATE.mode === "move" ? "Moving…" : "Rotating…");
  });

  scene.add(gizmo);

  outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
  outline.visible = false;
  scene.add(outline);

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
}

/* Character */
function makeMaterial(colorHex) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    metalness: 0.08,
    roughness: 0.75
  });
}

function namedGroup(name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.userData.isJoint = true;
  world.joints.push(g);
  return g;
}

function addBox(parent, name, w, h, d, x, y, z, color = 0xb4b8c8) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makeMaterial(color)
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.userData.pickable = true;

  // ✅ cast / receive shadows
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  parent.add(mesh);
  return mesh;
}

function buildCharacter() {
  world.root.clear();
  world.joints.length = 0;

  const root = namedGroup("char_root", 0, 0, 0);
  world.root.add(root);

  /* ===================== HIPS ===================== */
  const hips = namedGroup("hips", 0, 0.9, 0);
  root.add(hips);

  /* ===================== TORSO (shorter, tighter) ===================== */
  addBox(
    hips,
    "torso_mesh",
    1.0,    // width
    1.15,   // height (shorter)
    0.55,
    0,
    0.6,    // center
    0,
    0xaab0c2
  );

  /* ===================== CHEST ===================== */
  const chest = namedGroup("chest", 0, 1.15, 0);
  hips.add(chest);

  /* ===================== NECK (lower & closer) ===================== */
  const neck = namedGroup("neck", 0, 0.1, 0);
  chest.add(neck);

  /* ===================== HEAD (closer & slightly smaller) ===================== */
  addBox(
    neck,
    "head_mesh",
    0.55,
    0.58,
    0.55,
    0,
    0.32,
    0,
    0xc3c8d8
  );

  /* ===================== SHOULDERS (lower, relaxed) ===================== */
  const shoulderY = 0.05;
  const shoulderX = 0.68;

  const lShoulder = namedGroup("l_shoulder", -shoulderX, shoulderY, 0);
  const rShoulder = namedGroup("r_shoulder",  shoulderX, shoulderY, 0);
  chest.add(lShoulder);
  chest.add(rShoulder);

  /* ===================== UPPER ARMS ===================== */
  addBox(
    lShoulder,
    "l_upperarm_mesh",
    0.26,
    0.78,
    0.26,
    0,
    -0.45,
    0,
    0x9aa2b8
  );

  addBox(
    rShoulder,
    "r_upperarm_mesh",
    0.26,
    0.78,
    0.26,
    0,
    -0.45,
    0,
    0x9aa2b8
  );

  /* ===================== ELBOWS ===================== */
  const lElbow = namedGroup("l_elbow", 0, -0.85, 0);
  const rElbow = namedGroup("r_elbow", 0, -0.85, 0);
  lShoulder.add(lElbow);
  rShoulder.add(rElbow);

  /* ===================== FOREARMS ===================== */
  addBox(
    lElbow,
    "l_forearm_mesh",
    0.24,
    0.72,
    0.24,
    0,
    -0.38,
    0,
    0x8c95ab
  );

  addBox(
    rElbow,
    "r_forearm_mesh",
    0.24,
    0.72,
    0.24,
    0,
    -0.38,
    0,
    0x8c95ab
  );

  /* ===================== HIPS / LEGS ===================== */
  const hipX = 0.28;

  const lHip = namedGroup("l_hip", -hipX, 0.02, 0);
  const rHip = namedGroup("r_hip",  hipX, 0.02, 0);
  hips.add(lHip);
  hips.add(rHip);

  addBox(
    lHip,
    "l_thigh_mesh",
    0.34,
    0.95,
    0.34,
    0,
    -0.48,
    0,
    0x8792aa
  );

  addBox(
    rHip,
    "r_thigh_mesh",
    0.34,
    0.95,
    0.34,
    0,
    -0.48,
    0,
    0x8792aa
  );

  /* ===================== KNEES ===================== */
  const lKnee = namedGroup("l_knee", 0, -0.95, 0);
  const rKnee = namedGroup("r_knee", 0, -0.95, 0);
  lHip.add(lKnee);
  rHip.add(rKnee);

  /* ===================== SHINS ===================== */
  addBox(
    lKnee,
    "l_shin_mesh",
    0.30,
    0.85,
    0.30,
    0,
    -0.42,
    0,
    0x7b86a0
  );

  addBox(
    rKnee,
    "r_shin_mesh",
    0.30,
    0.85,
    0.30,
    0,
    -0.42,
    0,
    0x7b86a0
  );

  root.position.y = 1;
  scene.add(world.root);
}

/* Props */
function addProp(type) {
  const base = new THREE.Group();
  base.userData.isProp = true;

  let mesh;
  if (type === "cube") {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), makeMaterial(0x24d2ff));
    base.name = `prop_cube_${world.props.length + 1}`;
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 24), makeMaterial(0x7c5cff));
    base.name = `prop_sphere_${world.props.length + 1}`;
  }

  mesh.userData.pickable = true;

  // ✅ cast / receive shadows
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  base.add(mesh);

  base.position.set((Math.random() - 0.5) * 2.0, 0.28, (Math.random() - 0.5) * 2.0);
  world.props.push(base);
  scene.add(base);

  showToast(`Added ${type}`);
}

function deleteSelectedProp() {
  if (!selected || !selected.userData.isProp) {
    showToast("Select a prop to delete");
    return;
  }
  scene.remove(selected);
  world.props = world.props.filter(p => p !== selected);
  clearSelection();
  showToast("Prop deleted");
}

/* Selection */
function pickFromPointer(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  const pickables = [];

  world.root.traverse(obj => {
    if (obj.userData.pickable) pickables.push(obj);
  });
  world.props.forEach(p => p.traverse(obj => {
    if (obj.userData.pickable) pickables.push(obj);
  }));

  const hits = raycaster.intersectObjects(pickables, true);
  if (!hits.length) return null;

  let o = hits[0].object;
  while (o && o.parent) {
    if (o.parent.userData.isJoint) return o.parent;
    if (o.userData.isProp) return o;
    o = o.parent;
  }
  return hits[0].object;
}

function setSelection(obj) {
  selected = obj;

  if (!selected) {
    selectionName.value = "None";
    gizmo.detach();
    outline.visible = false;
    return;
  }

  selectionName.value = selected.name || "(unnamed)";
  gizmo.attach(selected);
  updateGizmoAxis();
  updateOutline();
}

function clearSelection() {
  selected = null;
  selectionName.value = "None";
  gizmo.detach();
  outline.visible = false;
}

function updateOutline() {
  if (!STATE.showOutline || !selected) {
    outline.visible = false;
    return;
  }
  outline.setFromObject(selected);
  outline.visible = true;
}

function focusSelection() {
  if (!selected) return;

  const box = new THREE.Box3().setFromObject(selected);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());

  const dist = clamp(size * 1.6, 1.8, 12);
  const dir = new THREE.Vector3(1, 0.7, 1).normalize();

  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  orbit.target.copy(center);
  orbit.update();
  showToast("Focused");
}

/* Controls */
function setMode(mode) {
  STATE.mode = mode;

  const rotOn = mode === "rotate";
  const movOn = mode === "move";
  const orbOn = mode === "orbit";

  modeRotate.classList.toggle("btn--active", rotOn);
  modeMove.classList.toggle("btn--active", movOn);
  modeOrbit.classList.toggle("btn--active", orbOn);

  // Gizmo is active in rotate + move
  gizmo.enabled = !orbOn;
  orbit.enabled = orbOn;

  // Switch TransformControls mode
  gizmo.setMode(movOn ? "translate" : "rotate");

  // Snap only for rotate
  updateGizmoAxis();

  showToast(rotOn ? "Rotate mode" : movOn ? "Move mode" : "Orbit mode");
}

function toggleAxis(btn, key) {
  STATE.axis[key] = !STATE.axis[key];
  btn.classList.toggle("chip--active", STATE.axis[key]);
  updateGizmoAxis();
}

function updateGizmoAxis() {
  gizmo.showX = STATE.axis.x;
  gizmo.showY = STATE.axis.y;
  gizmo.showZ = STATE.axis.z;

  const snap = Number(rotateSnap.value || STATE.snapDeg);
  STATE.snapDeg = snap;

  // Apply rotation snap ONLY in rotate mode
  if (STATE.mode === "rotate" && snap > 0) gizmo.setRotationSnap(degToRad(snap));
  else gizmo.setRotationSnap(null);
}

/* Pose I/O */
function serializePose() {
  const joints = {};
  world.joints.forEach(j => {
    joints[j.name] = j.quaternion.toArray();
  });

  const props = world.props.map(p => ({
    name: p.name,
    position: p.position.toArray(),
    quaternion: p.quaternion.toArray(),
    scale: p.scale.toArray()
  }));

  return {
    version: 1,
    notes: String(poseNotes.value || ""),
    joints,
    props,
    savedAt: nowISO()
  };
}

function applyPose(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid pose JSON");

  if (data.joints) {
    world.joints.forEach(j => {
      const q = data.joints[j.name];
      if (Array.isArray(q) && q.length === 4) j.quaternion.fromArray(q);
    });
  }

  if (Array.isArray(data.props)) {
    world.props.forEach(p => scene.remove(p));
    world.props = [];

    data.props.forEach(pd => {
      const isCube = String(pd.name || "").includes("cube");
      addProp(isCube ? "cube" : "sphere");

      const p = world.props[world.props.length - 1];
      if (pd.position) p.position.fromArray(pd.position);
      if (pd.quaternion) p.quaternion.fromArray(pd.quaternion);
      if (pd.scale) p.scale.fromArray(pd.scale);
      if (pd.name) p.name = pd.name;
    });
  }

  if (typeof data.notes === "string") poseNotes.value = data.notes;

  updateOutline();
  showToast("Pose loaded");
}

function resetPose() {
  world.joints.forEach(j => j.rotation.set(0, 0, 0));
  updateOutline();
  showToast("Pose reset");
}

function randomPose() {
  const names = new Set(["l_shoulder","r_shoulder","l_elbow","r_elbow","neck","chest"]);
  world.joints.forEach(j => {
    if (!names.has(j.name)) return;
    j.rotation.x = (Math.random() - 0.5) * 0.9;
    j.rotation.y = (Math.random() - 0.5) * 0.9;
    j.rotation.z = (Math.random() - 0.5) * 0.9;
  });
  updateOutline();
  showToast("Random pose");
}

/* Export PNG */
function exportPNG() {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "pose.png";
  a.click();
  showToast("Exported PNG");
}

/* Events */
function onPointerDown(ev) {
  // ✅ allow selection in rotate OR move (not orbit)
  if (STATE.mode === "orbit") return;
  if (helpModal && !helpModal.classList.contains("hidden")) return;

  const obj = pickFromPointer(ev);
  if (obj) {
    setSelection(obj);
    showToast(`Selected: ${obj.name || "object"}`);
  }
}

function onKeyDown(ev) {
  // modal close stays priority
  if (ev.key === "Escape") {
    if (helpModal && !helpModal.classList.contains("hidden")) {
      helpModal.classList.add("hidden");
      showToast("Help closed");
      return;
    }
    clearSelection();
    showToast("Selection cleared");
    return;
  }

  // shortcuts
  const k = ev.key.toLowerCase();

  if (k === "f") {
    focusSelection();
    return;
  }

  if (k === "1") {
    setMode("rotate");
    return;
  }

  if (k === "2") {
    setMode("move");
    return;
  }

  if (k === "3") {
    setMode("orbit");
    return;
  }

  // delete prop
  if (ev.key === "Delete" || ev.key === "Backspace") {
    if (selected && selected.userData.isProp) deleteSelectedProp();
    return;
  }

  // Ctrl+S / Cmd+S -> save to gallery without download
  if ((ev.ctrlKey || ev.metaKey) && k === "s") {
    ev.preventDefault();
    savePoseToGallery({ withToast: true });
    return;
  }
}

/* UI wiring */
function hookUI() {
  btnFocus.addEventListener("click", focusSelection);
  btnClear.addEventListener("click", clearSelection);

  modeRotate.addEventListener("click", () => setMode("rotate"));
  modeMove.addEventListener("click", () => setMode("move"));
  modeOrbit.addEventListener("click", () => setMode("orbit"));

  axisX.addEventListener("click", () => toggleAxis(axisX, "x"));
  axisY.addEventListener("click", () => toggleAxis(axisY, "y"));
  axisZ.addEventListener("click", () => toggleAxis(axisZ, "z"));

  rotateSnap.addEventListener("change", updateGizmoAxis);

  togGrid.addEventListener("change", () => {
    STATE.showGrid = togGrid.checked;
    gridHelper.visible = STATE.showGrid;
  });

  togAxes.addEventListener("change", () => {
    STATE.showAxes = togAxes.checked;
    axesHelper.visible = STATE.showAxes;
  });

  togOutline.addEventListener("change", () => {
    STATE.showOutline = togOutline.checked;
    updateOutline();
  });

  btnResetPose.addEventListener("click", resetPose);
  btnRandomPose.addEventListener("click", randomPose);

  // Save JSON (download) + ALSO save thumbnail to gallery (best UX)
  btnSavePose.addEventListener("click", () => {
    const data = serializePose();

    // download pose.json (unchanged behavior)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pose.json";
    a.click();

    // store in gallery too
    savePoseToGallery({ name: "", withToast: false });
    showToast("Saved pose.json + gallery");
  });

  btnLoadPose.addEventListener("click", () => filePose.click());
  filePose.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    applyPose(JSON.parse(text));
    filePose.value = "";
  });

  btnExport.addEventListener("click", exportPNG);

  btnAddCube.addEventListener("click", () => addProp("cube"));
  btnAddSphere.addEventListener("click", () => addProp("sphere"));
  btnDelProp.addEventListener("click", deleteSelectedProp);

  btnScatter.addEventListener("click", () => {
    for (let i = 0; i < 5; i++) addProp(Math.random() > 0.5 ? "cube" : "sphere");
  });

  bgTone.addEventListener("change", () => setBackgroundTone(bgTone.value));

  /* Help modal — robust close */
  function openHelp() {
    helpModal.classList.remove("hidden");
    showToast("Help opened");
    btnCloseHelp?.focus?.();
  }

  function closeHelp() {
    helpModal.classList.add("hidden");
    showToast("Help closed");
  }

  btnHelp.addEventListener("click", (e) => {
    e.preventDefault();
    openHelp();
  });

  btnCloseHelp.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeHelp();
  });

  btnHelpOk.addEventListener("click", (e) => {
    e.preventDefault();
    closeHelp();
  });

  helpModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeHelp();
  });

  btnPerf.addEventListener("click", () => {
    perfEnabled = !perfEnabled;
    showToast(perfEnabled ? "Perf: ON" : "Perf: OFF");
  });

  /* Pose Gallery UI */
  btnSaveGallery?.addEventListener("click", () => savePoseToGallery({ withToast: true }));
  btnRenamePose?.addEventListener("click", renameSelectedGalleryPose);
  btnDeletePose?.addEventListener("click", deleteSelectedGalleryPose);
  btnClearGallery?.addEventListener("click", clearGalleryAll);

  /* ✅ NEW: Preset Poses UI wiring (added on top, not replacing anything) */
  btnPresetApply?.addEventListener("click", applySelectedPreset);
  btnPresetSave?.addEventListener("click", saveSelectedPresetToGallery);
}

/* Resize (use ResizeObserver for 100% reliability) */
function resizeToCanvas() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  updateOutline();
}

let ro = null;
function setupResizeObserver() {
  if (ro) ro.disconnect();
  ro = new ResizeObserver(() => resizeToCanvas());
  ro.observe(canvas);
  window.addEventListener("resize", resizeToCanvas);
}

/* Render loop */
function tick() {
  requestAnimationFrame(tick);

  orbit.update();
  renderer.render(scene, camera);

  if (selected && STATE.showOutline) outline.setFromObject(selected);

  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  const fps = 1000 / Math.max(1, dt);
  fpsSmoothed = fpsSmoothed * 0.92 + fps * 0.08;

  if (perfEnabled && Math.random() < 0.02) {
    showToast(`FPS ~ ${fpsSmoothed.toFixed(0)}`, 900);
  }
}

/* Boot */
try {
  createRenderer();
  createScene();
  buildCharacter();
  hookUI();

  // Gallery boot
  loadGalleryFromStorage();
  renderGallery();

  // ✅ NEW: Presets boot (added)
  renderPresets();

  setMode("rotate");
  updateGizmoAxis();

  setupResizeObserver();
  resizeToCanvas();

  showToast("Ready. Click a joint or prop to pose.");
  tick();
} catch (err) {
  fatal(err);
}
