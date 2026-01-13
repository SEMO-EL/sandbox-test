/* ==========================================================================
   Pose Sandbox — app.js (ES Modules, no bundler)
   - Three.js scene, lights, floor, grid
   - Simple character with joints (groups)
   - OrbitControls + TransformControls for rotation posing
   - Props creation + selection
   - Save/Load JSON pose + Export PNG
   ========================================================================== */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

/* ----------------------------- DOM refs --------------------------------- */
const canvas = document.getElementById("c");
const errorOverlay = document.getElementById("errorOverlay");
const errorText = document.getElementById("errorText");
const toast = document.getElementById("toast");

const selectionName = document.getElementById("selectionName");
const btnFocus = document.getElementById("btnFocus");
const btnClear = document.getElementById("btnClear");

const modeRotate = document.getElementById("modeRotate");
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

/* ----------------------------- Helpers ---------------------------------- */
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

/* --------------------------- Three setup -------------------------------- */
let renderer, scene, camera, orbit, gizmo, axesHelper, gridHelper;
let raycaster, pointer;

let selected = null;         // selected Object3D
let selectedRoot = null;     // root type (joint / prop)
let outline = null;          // selection outline (BoxHelper)

let perfEnabled = false;
let lastFrameTime = performance.now();
let fpsSmoothed = 60;

const STATE = {
  mode: "rotate",           // "rotate" | "orbit"
  axis: { x: true, y: true, z: true },
  snapDeg: 10,
  showGrid: true,
  showAxes: false,
  showOutline: true
};

/* --------------------------- Scene creation ----------------------------- */
function createRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true // needed for Export PNG without flicker
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
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

  // Lights (pleasant)
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(6, 10, 3);
  key.castShadow = false;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x88bbff, 0.35);
  fill.position.set(-7, 4, -6);
  scene.add(fill);

  // Floor
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x131826,
    metalness: 0.05,
    roughness: 0.95
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // Grid + axes
  gridHelper = new THREE.GridHelper(50, 50, 0x2a3550, 0x1c2436);
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(2.2);
  axesHelper.visible = false;
  scene.add(axesHelper);

  // Raycasting
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Transform controls (rotate posing)
  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode("rotate");
  gizmo.setSpace("local");
  gizmo.size = 0.85;
  gizmo.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value && STATE.mode === "orbit";
    if (e.value) showToast("Rotating…");
  });
  scene.add(gizmo);

  // selection outline
  outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
  outline.visible = false;
  scene.add(outline);

  // Input
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
}

/* ----------------------- Character + props system ----------------------- */
const world = {
  root: new THREE.Group(),
  joints: [],  // array of joint groups
  props: []    // array of prop meshes
};

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
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMaterial(color));
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.userData.pickable = true;
  parent.add(mesh);
  return mesh;
}

function buildCharacter() {
  world.root.clear();
  world.joints.length = 0;

  const root = namedGroup("char_root", 0, 0, 0);
  world.root.add(root);

  const hips = namedGroup("hips", 0, 0.95, 0);
  root.add(hips);

  // torso
  addBox(hips, "torso_mesh", 1.05, 1.35, 0.55, 0, 0.7, 0, 0xaab0c2);

  const chest = namedGroup("chest", 0, 1.4, 0);
  hips.add(chest);

  const neck = namedGroup("neck", 0, 0.55, 0);
  chest.add(neck);

  addBox(neck, "head_mesh", 0.6, 0.62, 0.6, 0, 0.45, 0, 0xc3c8d8);

  // left arm
  const lShoulder = namedGroup("l_shoulder", -0.62, 0.35, 0);
  chest.add(lShoulder);
  addBox(lShoulder, "l_upperarm_mesh", 0.28, 0.75, 0.28, 0, -0.38, 0, 0x9aa2b8);

  const lElbow = namedGroup("l_elbow", 0, -0.78, 0);
  lShoulder.add(lElbow);
  addBox(lElbow, "l_forearm_mesh", 0.25, 0.68, 0.25, 0, -0.34, 0, 0x8c95ab);

  // right arm
  const rShoulder = namedGroup("r_shoulder", 0.62, 0.35, 0);
  chest.add(rShoulder);
  addBox(rShoulder, "r_upperarm_mesh", 0.28, 0.75, 0.28, 0, -0.38, 0, 0x9aa2b8);

  const rElbow = namedGroup("r_elbow", 0, -0.78, 0);
  rShoulder.add(rElbow);
  addBox(rElbow, "r_forearm_mesh", 0.25, 0.68, 0.25, 0, -0.34, 0, 0x8c95ab);

  // legs
  const lHip = namedGroup("l_hip", -0.30, 0.05, 0);
  hips.add(lHip);
  addBox(lHip, "l_thigh_mesh", 0.35, 0.92, 0.35, 0, -0.46, 0, 0x8792aa);

  const lKnee = namedGroup("l_knee", 0, -0.92, 0);
  lHip.add(lKnee);
  addBox(lKnee, "l_shin_mesh", 0.32, 0.82, 0.32, 0, -0.41, 0, 0x7b86a0);

  const rHip = namedGroup("r_hip", 0.30, 0.05, 0);
  hips.add(rHip);
  addBox(rHip, "r_thigh_mesh", 0.35, 0.92, 0.35, 0, -0.46, 0, 0x8792aa);

  const rKnee = namedGroup("r_knee", 0, -0.92, 0);
  rHip.add(rKnee);
  addBox(rKnee, "r_shin_mesh", 0.32, 0.82, 0.32, 0, -0.41, 0, 0x7b86a0);

  // slightly lift character above floor
  root.position.y = 0.01;

  scene.add(world.root);
}

function addProp(type) {
  const base = new THREE.Group();
  base.userData.isProp = true;
  base.userData.pickable = true;

  let mesh;
  if (type === "cube") {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), makeMaterial(0x24d2ff));
    base.name = `prop_cube_${world.props.length + 1}`;
  } else {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 24), makeMaterial(0x7c5cff));
    base.name = `prop_sphere_${world.props.length + 1}`;
  }

  mesh.userData.pickable = true;
  base.add(mesh);

  base.position.set(
    (Math.random() - 0.5) * 2.0,
    0.28,
    (Math.random() - 0.5) * 2.0
  );

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

/* ------------------------------ Selection ------------------------------- */
function pickFromPointer(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointer, camera);

  // Collect pickables: meshes inside joints + props
  const pickables = [];

  world.root.traverse(obj => {
    if (obj.userData.pickable) pickables.push(obj);
  });
  world.props.forEach(p => p.traverse(obj => {
    if (obj.userData.pickable) pickables.push(obj);
  }));

  const hits = raycaster.intersectObjects(pickables, true);
  if (!hits.length) return null;

  // if mesh inside joint, select its parent joint group
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

  const name = selected.name || "(unnamed)";
  selectionName.value = name;

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

/* ------------------------------ Controls -------------------------------- */
function setMode(mode) {
  STATE.mode = mode;

  const rotOn = mode === "rotate";
  modeRotate.classList.toggle("btn--active", rotOn);
  modeOrbit.classList.toggle("btn--active", !rotOn);

  gizmo.enabled = rotOn;
  orbit.enabled = !rotOn;
  showToast(rotOn ? "Rotate mode" : "Orbit mode");
}

function toggleAxis(btn, key) {
  STATE.axis[key] = !STATE.axis[key];
  btn.classList.toggle("chip--active", STATE.axis[key]);
  updateGizmoAxis();
}

function updateGizmoAxis() {
  // TransformControls doesn't directly "lock axes" in rotate mode,
  // but we can hide axes by setting showX/showY/showZ.
  gizmo.showX = STATE.axis.x;
  gizmo.showY = STATE.axis.y;
  gizmo.showZ = STATE.axis.z;

  const snap = Number(rotateSnap.value || STATE.snapDeg);
  STATE.snapDeg = snap;
  gizmo.setRotationSnap(snap > 0 ? degToRad(snap) : null);
}

/* ------------------------------ Pose I/O -------------------------------- */
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
    notes: poseNotes.value || "",
    joints,
    props,
    savedAt: new Date().toISOString()
  };
}

function applyPose(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid pose JSON");

  // joints
  if (data.joints) {
    world.joints.forEach(j => {
      const q = data.joints[j.name];
      if (Array.isArray(q) && q.length === 4) j.quaternion.fromArray(q);
    });
  }

  // props: wipe and recreate minimal
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

  poseNotes.value = data.notes || "";
  updateOutline();
  showToast("Pose loaded");
}

function resetPose() {
  world.joints.forEach(j => j.rotation.set(0, 0, 0));
  updateOutline();
  showToast("Pose reset");
}

function randomPose() {
  // Mild randomization: shoulders + elbows + head only
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

/* ------------------------------ Export PNG ------------------------------ */
function exportPNG() {
  // Ensure one clean render before export
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "pose.png";
  a.click();
  showToast("Exported PNG");
}

/* --------------------------- Background tone ---------------------------- */
function setBackgroundTone(mode) {
  if (!scene) return;
  if (mode === "studio") scene.background = new THREE.Color(0x10131a);
  else if (mode === "graphite") scene.background = new THREE.Color(0x0b0b10);
  else scene.background = new THREE.Color(0x0b0f17);
}

/* ------------------------------- Events -------------------------------- */
function onPointerDown(ev) {
  if (STATE.mode !== "rotate") return; // orbit mode uses default behavior

  // If clicking gizmo itself, ignore (TransformControls handles)
  // We'll still attempt pick if not dragging.
  const obj = pickFromPointer(ev);
  if (obj) {
    setSelection(obj);
    showToast(`Selected: ${obj.name || "object"}`);
  }
}

function onKeyDown(ev) {
  if (ev.key === "Escape") {
    clearSelection();
    showToast("Selection cleared");
  }
  if (ev.key.toLowerCase() === "f") {
    focusSelection();
  }
}

function hookUI() {
  btnFocus.addEventListener("click", focusSelection);
  btnClear.addEventListener("click", clearSelection);

  modeRotate.addEventListener("click", () => setMode("rotate"));
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

  btnSavePose.addEventListener("click", () => {
    const data = serializePose();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pose.json";
    a.click();
    showToast("Saved pose.json");
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

  // Help modal
  function openHelp() { helpModal.classList.remove("hidden"); }
  function closeHelp() { helpModal.classList.add("hidden"); }
  btnHelp.addEventListener("click", openHelp);
  btnCloseHelp.addEventListener("click", closeHelp);
  btnHelpOk.addEventListener("click", closeHelp);
  helpModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeHelp();
  });

  // Perf toggle (simple FPS toast)
  btnPerf.addEventListener("click", () => {
    perfEnabled = !perfEnabled;
    showToast(perfEnabled ? "Perf: ON" : "Perf: OFF");
  });
}

/* ------------------------------ Resize --------------------------------- */
function onResize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  updateOutline();
}

window.addEventListener("resize", onResize);

/* ------------------------------ Render loop ----------------------------- */
function tick() {
  requestAnimationFrame(tick);

  orbit.update();
  renderer.render(scene, camera);

  if (selected && STATE.showOutline) {
    outline.setFromObject(selected);
  }

  // tiny perf overlay using toast (not spammy)
  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  const fps = 1000 / Math.max(1, dt);
  fpsSmoothed = fpsSmoothed * 0.92 + fps * 0.08;

  if (perfEnabled && Math.random() < 0.02) {
    showToast(`FPS ~ ${fpsSmoothed.toFixed(0)}`, 900);
  }
}

/* ------------------------------ Boot ----------------------------------- */
try {
  createRenderer();
  createScene();
  buildCharacter();
  hookUI();
  setMode("rotate");
  updateGizmoAxis();

  // ensure initial layout correct
  onResize();
  showToast("Ready. Click a joint to pose.");

  tick();
} catch (err) {
  fatal(err);
}
