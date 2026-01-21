// app.js
// PoseSandbox modular entrypoint — uses EVERY module in your tree.
// ✅ Scale mode (props scale normally; body joints scale only their visible mesh).
// ✅ Symmetry toggle for BODY (mirrors L ↔ R on rotate + scale).
// ✅ True reset (move + rotate + scale) using rest snapshot.
// ✅ Import 3D (.glb/.gltf) + selectable like a prop.
// ✅ Lighting controls (intensity/color/direction + presets).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { Character } from "./character/character.js";

import { InputManager, bindPropButtons } from "./controls/inputs.js";
import { ModesController } from "./controls/modes.js";
import { SelectionController } from "./controls/selection.js";

import { clamp, makeToast, niceTime } from "./core/helpers.js";
import { createState, setShowAxes, setShowGrid, setShowOutline, setPerfEnabled } from "./core/state.js";
import {
  createWorld,
  addProp as addPropWorld,
  removeProp as removePropWorld,
  PROP_TYPES
} from "./core/world.js";

import { createRenderer } from "./engine/renderer.js";
import { createScene, setBackgroundTone, applyLightingPreset, setKeyDirectionByName } from "./engine/scene.js";
import { createLoop } from "./engine/loop.js";

import { Gallery } from "./gallery/gallery.js";

import { serializePose, applyPose, applyPoseJointsOnly } from "./poses/pose-io.js";
import { createPresets, PresetsUI } from "./poses/presets.js";

/* ---------------------------- DOM refs ---------------------------- */
const canvas = document.getElementById("c");
const errorOverlay = document.getElementById("errorOverlay");
const errorText = document.getElementById("errorText");
const toastEl = document.getElementById("toast");

const selectionName = document.getElementById("selectionName");
const btnFocus = document.getElementById("btnFocus");
const btnClear = document.getElementById("btnClear");
const btnSymmetry = document.getElementById("btnSymmetry");

const modeRotate = document.getElementById("modeRotate");
const modeMove = document.getElementById("modeMove");
const modeOrbit = document.getElementById("modeOrbit");
const modeScale = document.getElementById("modeScale");

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

const btnDelProp = document.getElementById("btnDelProp");
const btnScatter = document.getElementById("btnScatter");
const bgTone = document.getElementById("bgTone");

const btnExport = document.getElementById("btnExport");
const btnHelp = document.getElementById("btnHelp");
const helpModal = document.getElementById("helpModal");
const btnCloseHelp = document.getElementById("btnCloseHelp");
const btnHelpOk = document.getElementById("btnHelpOk");
const btnPerf = document.getElementById("btnPerf");

/* Import 3D */
const btnImport3D = document.getElementById("btnImport3D");
const fileModel = document.getElementById("fileModel");

/* Lighting UI */
const lightPreset = document.getElementById("lightPreset");
const keyDir = document.getElementById("keyDir");
const keyIntensity = document.getElementById("keyIntensity");
const keyColor = document.getElementById("keyColor");
const fillIntensity = document.getElementById("fillIntensity");
const fillColor = document.getElementById("fillColor");
const rimIntensity = document.getElementById("rimIntensity");
const rimColor = document.getElementById("rimColor");
const ambIntensity = document.getElementById("ambIntensity");
const ambColor = document.getElementById("ambColor");
const hemiIntensity = document.getElementById("hemiIntensity");
const hemiSky = document.getElementById("hemiSky");
const hemiGround = document.getElementById("hemiGround");
const btnResetLights = document.getElementById("btnResetLights");

/* Gallery DOM */
const btnSaveGallery = document.getElementById("btnSaveGallery");
const poseGallery = document.getElementById("poseGallery");
const btnRenamePose = document.getElementById("btnRenamePose");
const btnDeletePose = document.getElementById("btnDeletePose");
const btnClearGallery = document.getElementById("btnClearGallery");

/* Presets DOM */
const presetGallery = document.getElementById("presetGallery");
const btnPresetApply = document.getElementById("btnPresetApply");
const btnPresetSave = document.getElementById("btnPresetSave");

/* ---------------------------- Helpers ---------------------------- */
const showToast = makeToast(toastEl);

function fatal(err) {
  if (errorText) errorText.textContent = String(err?.stack || err);
  if (errorOverlay) errorOverlay.classList.remove("hidden");
  console.error(err);
}

function downloadJson(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPNG(renderer, scene, camera) {
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "pose.png";
  a.click();
  showToast("Exported PNG");
}

function hexToColorInput(c) {
  const col = new THREE.Color(c);
  return `#${col.getHexString()}`;
}

function colorInputToHex(v) {
  try {
    const col = new THREE.Color(v);
    return col.getHex();
  } catch {
    return 0xffffff;
  }
}

/* ---------------------------- Boot ---------------------------- */
try {
  /* Core state + world */
  const STATE = createState();
  const world = createWorld();

  // Symmetry state (kept here to avoid touching other modules)
  const SYM = { enabled: false };

  /* Input */
  const input = new InputManager({ canvas, helpModal });

  /* Renderer */
  const { renderer, resizeToCanvas } = createRenderer(canvas, {
    powerPreference: "high-performance",
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    maxPixelRatio: 2,
    toneMappingExposure: 1.05
  });

  /* Scene */
  const sceneBundle = createScene({
    canvas,
    renderer,
    STATE,
    showToast,
    onPointerDown: null,
    onKeyDown: null
  });

  const {
    scene,
    camera,
    orbit,
    gizmo,
    axesHelper,
    gridHelper,
    outline: engineOutline,
    lights
  } = sceneBundle;

  // Background selector initial
  setBackgroundTone(scene, bgTone?.value || "midnight");

  /* Character */
  function makeMaterial(colorHex) {
    return new THREE.MeshStandardMaterial({
      color: colorHex,
      metalness: 0.08,
      roughness: 0.75
    });
  }

  const character = new Character(THREE, scene, makeMaterial);
  const built = character.build();

  // Connect world to character
  world.root = built.root;
  world.joints = built.joints;

  /* ---------------------------- Scale targeting ---------------------------- */

  function findFirstPickableMesh(obj) {
    if (!obj) return null;
    let found = null;
    obj.traverse?.((o) => {
      if (found) return;
      if (o && o.isMesh && o.userData && o.userData.pickable) found = o;
    });
    return found;
  }

  // ---------------- REST POSE SNAPSHOT (for true reset) ----------------
  const REST = new Map(); // key: joint.name => { pos, quat, scale, meshScale? }

  function snapshotRestPose() {
    REST.clear();
    (world.joints || []).forEach((j) => {
      const mesh = findFirstPickableMesh(j);
      REST.set(j.name, {
        pos: j.position.clone(),
        quat: j.quaternion.clone(),
        scale: j.scale.clone(),
        meshScale: mesh ? mesh.scale.clone() : null
      });
    });
  }
  snapshotRestPose();

  /* Selection controller (we route events via InputManager) */
  const selection = new SelectionController({
    canvas,
    camera,
    scene,
    orbit,
    gizmo,
    world,
    selectionNameInput: selectionName,
    btnFocus,
    btnClear,
    helpModal,
    getMode: () => STATE.mode,
    getShowOutline: () => STATE.showOutline,
    toast: showToast
  });

  // SelectionController adds its own outline; remove engine outline to avoid duplicates.
  try { if (engineOutline) scene.remove(engineOutline); } catch {}

  // We do NOT want SelectionController to bind window events (InputManager does), so kill its listeners.
  selection.destroy();

  /* Modes controller */
  const modes = new ModesController({
    modeRotateBtn: modeRotate,
    modeMoveBtn: modeMove,
    modeOrbitBtn: modeOrbit,
    modeScaleBtn: modeScale,
    axisXBtn: axisX,
    axisYBtn: axisY,
    axisZBtn: axisZ,
    rotateSnapSelect: rotateSnap,
    orbit,
    gizmo,
    toast: showToast
  });

  // Sync ModesController -> STATE
  const _setMode = modes.setMode.bind(modes);
  modes.setMode = (m) => {
    _setMode(m);
    STATE.mode = modes.state.mode;
    attachGizmoForCurrentMode();
    return STATE.mode;
  };

  const _toggleAxis = modes.toggleAxis.bind(modes);
  modes.toggleAxis = (k) => {
    const v = _toggleAxis(k);
    STATE.axis = { ...modes.state.axis };
    return v;
  };

  const _setSnapDeg = modes.setSnapDeg.bind(modes);
  modes.setSnapDeg = (deg) => {
    const v = _setSnapDeg(deg);
    STATE.snapDeg = modes.state.snapDeg;
    return v;
  };

  STATE.mode = modes.state.mode;
  STATE.axis = { ...modes.state.axis };
  STATE.snapDeg = modes.state.snapDeg;

  function getGizmoTargetForSelection(sel) {
    if (!sel) return null;
    if (STATE.mode === "orbit") return null;

    if (STATE.mode === "scale") {
      if (sel.userData?.isProp) return sel;
      if (sel.userData?.isJoint) {
        const mesh = findFirstPickableMesh(sel);
        return mesh || sel;
      }
      // Imported model: scale its root (we store importRoot)
      if (sel.userData?.isImportedModel && sel.userData.importRoot) return sel.userData.importRoot;
    }

    // Rotate/Move:
    if (sel.userData?.isImportedModel && sel.userData.importRoot) return sel.userData.importRoot;
    return sel;
  }

  function attachGizmoForCurrentMode() {
    const sel = selection.getSelected();
    const target = getGizmoTargetForSelection(sel);

    if (!target) {
      gizmo.detach();
      selection.updateOutline();
      return;
    }

    gizmo.attach(target);
    selection.updateOutline();
  }

  // Wrap selection.setSelection so gizmo follows our targeting rules
  const _selSet = selection.setSelection.bind(selection);
  selection.setSelection = (obj) => {
    _selSet(obj);
    attachGizmoForCurrentMode();
  };

  const _selClear = selection.clearSelection.bind(selection);
  selection.clearSelection = () => {
    _selClear();
    gizmo.detach();
  };

  /* ---------------------------- BODY SYMMETRY ---------------------------- */

  function counterpartName(name) {
    const n = String(name || "");
    if (n.startsWith("l_")) return "r_" + n.slice(2);
    if (n.startsWith("r_")) return "l_" + n.slice(2);
    return null;
  }

  function getJointByName(name) {
    if (!name) return null;
    return (world.joints || []).find((j) => j && j.name === name) || null;
  }

  // Mirror rotation across X axis: R' = M R M with M = diag(-1, 1, 1)
  const _M = new THREE.Matrix4().makeScale(-1, 1, 1);
  const _R = new THREE.Matrix4();
  const _TMP = new THREE.Matrix4();
  const _Q = new THREE.Quaternion();

  function mirrorQuaternionAcrossX(srcQuat, outQuat) {
    _R.makeRotationFromQuaternion(srcQuat);
    _TMP.copy(_M).multiply(_R).multiply(_M);
    outQuat.setFromRotationMatrix(_TMP);
    outQuat.normalize();
    return outQuat;
  }

  function mirrorScaleToCounterpartIfPossible() {
    const sel = selection.getSelected();
    if (!sel || !sel.userData?.isJoint) return;

    const cn = counterpartName(sel.name);
    if (!cn) return;

    const otherJoint = getJointByName(cn);
    if (!otherJoint) return;

    const otherMesh = findFirstPickableMesh(otherJoint);
    const thisTarget = getGizmoTargetForSelection(sel);

    if (thisTarget && thisTarget.isMesh && otherMesh && otherMesh.isMesh) {
      otherMesh.scale.copy(thisTarget.scale);
    }
  }

  function mirrorRotationToCounterpartIfPossible() {
    const sel = selection.getSelected();
    if (!sel || !sel.userData?.isJoint) return;

    const cn = counterpartName(sel.name);
    if (!cn) return;

    const other = getJointByName(cn);
    if (!other) return;

    mirrorQuaternionAcrossX(sel.quaternion, _Q);
    other.quaternion.copy(_Q);
  }

  function updateSymmetryButtonUI() {
    if (!btnSymmetry) return;
    btnSymmetry.textContent = SYM.enabled ? "Symmetry: On" : "Symmetry: Off";
    btnSymmetry.classList.toggle("btn--active", !!SYM.enabled);
  }

  btnSymmetry?.addEventListener("click", () => {
    SYM.enabled = !SYM.enabled;
    updateSymmetryButtonUI();
    showToast(SYM.enabled ? "Symmetry ON (body)" : "Symmetry OFF");
  });

  updateSymmetryButtonUI();

  // Listen to gizmo edits; mirror when enabled
  gizmo.addEventListener("objectChange", () => {
    if (!SYM.enabled) return;

    const sel = selection.getSelected();
    if (!sel || !sel.userData?.isJoint) return;

    if (STATE.mode === "rotate") {
      mirrorRotationToCounterpartIfPossible();
      selection.updateOutline();
    } else if (STATE.mode === "scale") {
      mirrorScaleToCounterpartIfPossible();
      selection.updateOutline();
    }
  });

  /* ---------------------------- Props ---------------------------- */

  function applyPropShadowsAndPickable(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o && o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (!o.userData) o.userData = {};
        o.userData.pickable = true;
      }
    });
  }

  function defaultPropColor(type) {
    const t = String(type || "").toLowerCase();
    if (t === "cube") return 0x24d2ff;
    if (t === "sphere") return 0x7c5cff;
    if (t === "cylinder") return 0x42f5b0;
    if (t === "cone" || t === "pyramid") return 0xffc04a;
    if (t === "torus" || t === "ring" || t === "disc") return 0xff5c8a;
    return 0x9aa4b2;
  }

  function tintProp(group, type) {
    const color = defaultPropColor(type);
    group?.traverse?.((o) => {
      if (o && o.isMesh && o.material) {
        o.material.color?.setHex?.(color);
        if (type === "ring" || type === "disc" || type === "plane") o.material.side = THREE.DoubleSide;
      }
    });
  }

  function spawnProp(type) {
    const t = String(type || "cube").toLowerCase();
    const prop = addPropWorld(world, scene, t, { name: `prop_${t}_${world.props.length + 1}` });

    prop.position.set((Math.random() - 0.5) * 2.0, 0.28, (Math.random() - 0.5) * 2.0);

    applyPropShadowsAndPickable(prop);
    tintProp(prop, t);

    return prop;
  }

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse?.((o) => {
      if (o?.geometry) o.geometry.dispose?.();
      if (o?.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m?.dispose?.());
        else o.material.dispose?.();
      }
    });
  }

  function deleteSelectedProp() {
    const sel = selection.getSelected();
    if (!sel) return showToast("Select a prop to delete");

    // Imported model deletion
    if (sel.userData?.isImportedModel) {
      const root = sel.userData.importRoot || sel;
      scene.remove(root);
      disposeObject3D(root);
      selection.clearSelection();
      showToast("Imported model deleted");
      return;
    }

    if (!sel.userData?.isProp) {
      showToast("Select a prop to delete");
      return;
    }

    removePropWorld(world, scene, sel);
    selection.clearSelection();
    showToast("Prop deleted");
  }

  bindPropButtons({
    addProp: (type) => spawnProp(type),
    selectObject: (obj) => selection.setSelection(obj),
    showToast
  });

  /* ---------------------------- Import 3D (.glb/.gltf) ---------------------------- */

  const importedRoots = [];

  function computeBounds(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { box, size, center };
  }

  function normalizeImportedModel(root) {
    // center to origin and scale to sane size
    const { size, center } = computeBounds(root);

    if (Number.isFinite(center.x)) root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const target = 2.2; // roughly character-sized
    const s = target / maxDim;
    root.scale.setScalar(s);

    // put it on the floor (y=0)
    const box2 = new THREE.Box3().setFromObject(root);
    const minY = box2.min.y;
    if (Number.isFinite(minY)) root.position.y -= minY;

    // move near character
    root.position.x += 1.6;
    root.position.z += 0.0;
  }

  function markImportedPickable(root) {
    root.userData.isProp = true; // so gizmo + selection UI feels consistent
    root.userData.isImportedRoot = true;

    root.traverse((o) => {
      if (!o.userData) o.userData = {};
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.pickable = true;

        // Selection hits meshes, so mark them as imported + store root for delete/transform targeting
        o.userData.isImportedModel = true;
        o.userData.importRoot = root;
        o.userData.isProp = true;
      }
    });
  }

  async function importGLTFFile(file) {
    if (!file) return;

    const url = URL.createObjectURL(file);
    try {
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

      const root = gltf.scene || gltf.scenes?.[0];
      if (!root) throw new Error("No scene in GLTF");

      root.name = file.name || "ImportedModel";
      normalizeImportedModel(root);
      markImportedPickable(root);

      scene.add(root);
      importedRoots.push(root);

      selection.setSelection(root);
      selection.focusSelection?.();
      showToast(`Imported: ${root.name}`);
    } catch (e) {
      console.warn(e);
      showToast("Import failed (invalid .glb/.gltf)", 1800);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  btnImport3D?.addEventListener("click", () => fileModel?.click?.());
  fileModel?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    await importGLTFFile(file);
    fileModel.value = "";
  });

  /* ---------------------------- Pose I/O ---------------------------- */

  function serializePoseForGallery() {
    return serializePose({ world, poseNotesEl: poseNotes });
  }

  function resetAllJointRotations() {
    (world.joints || []).forEach((j) => {
      const r = REST.get(j.name);
      if (r?.quat) j.quaternion.copy(r.quat);
      else j.rotation.set(0, 0, 0);
    });
  }

  function resetAllJointTransforms() {
    (world.joints || []).forEach((j) => {
      const r = REST.get(j.name);
      if (!r) return;

      j.position.copy(r.pos);
      j.quaternion.copy(r.quat);
      j.scale.copy(r.scale);

      const mesh = findFirstPickableMesh(j);
      if (mesh && r.meshScale) mesh.scale.copy(r.meshScale);
    });
  }

  function resetPose() {
    resetAllJointTransforms();
    selection.updateOutline();
    attachGizmoForCurrentMode();
    showToast("Pose reset (move + rotate + scale)");
  }

  function forceRenderOnce() {
    renderer.render(scene, camera);
  }

  function applyPoseToScene(data) {
    return applyPose(data, {
      world,
      scene,
      poseNotesEl: poseNotes,
      addProp: (type) => spawnProp(type),
      showToast,
      updateOutline: () => selection.updateOutline(),
      forceRenderOnce
    });
  }

  function applyPoseJointsOnlyToScene(data) {
    return applyPoseJointsOnly(data, {
      world,
      resetAllJointRotations,
      showToast,
      updateOutline: () => selection.updateOutline(),
      forceRenderOnce
    });
  }

  function randomPose() {
    const names = new Set(["l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "neck", "chest"]);
    world.joints.forEach((j) => {
      if (!names.has(j.name)) return;
      j.rotation.x = (Math.random() - 0.5) * 0.9;
      j.rotation.y = (Math.random() - 0.5) * 0.9;
      j.rotation.z = (Math.random() - 0.5) * 0.9;
    });
    selection.updateOutline();
    showToast("Random pose");
  }

  /* ---------------------------- Gallery ---------------------------- */

  function captureThumbnail(size = 256) {
    renderer.render(scene, camera);

    const src = renderer.domElement;
    const thumb = document.createElement("canvas");
    thumb.width = size;
    thumb.height = size;

    const ctx = thumb.getContext("2d", { willReadFrequently: false });
    if (!ctx) return null;

    const sw = src.width;
    const sh = src.height;
    const s = Math.min(sw, sh);
    const sx = Math.floor((sw - s) / 2);
    const sy = Math.floor((sh - s) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, sx, sy, s, s, 0, 0, size, size);

    try { return thumb.toDataURL("image/png"); } catch { return null; }
  }

  const gallery = new Gallery({
    key: "pose_sandbox_gallery_v1",
    maxItems: 30,
    serializePose: serializePoseForGallery,
    applyPose: (poseObj) => applyPoseToScene(poseObj),
    captureThumbnail,
    showToast,
    niceTime,
    poseNotesEl: poseNotes,
    containerEl: poseGallery
  });

  gallery.loadFromStorage();
  gallery.render();

  /* ---------------------------- Presets ---------------------------- */
  const presetsUI = new PresetsUI({
    containerEl: presetGallery,
    btnApplyEl: btnPresetApply,
    btnSaveEl: btnPresetSave,
    presets: createPresets(),
    applyPoseJointsOnly: (poseObj) => applyPoseJointsOnlyToScene(poseObj),
    saveToGallery: ({ name = "", withToast = true } = {}) => gallery.saveCurrentPoseToGallery({ name, withToast }),
    showToast,
    applyOnClick: true
  });
  presetsUI.init();

  /* ---------------------------- Help modal ---------------------------- */
  function openHelp() {
    helpModal?.classList?.remove?.("hidden");
    showToast("Help opened");
    btnCloseHelp?.focus?.();
  }

  function closeHelp() {
    helpModal?.classList?.add?.("hidden");
    showToast("Help closed");
  }

  btnHelp?.addEventListener("click", (e) => { e.preventDefault(); openHelp(); });
  btnCloseHelp?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeHelp(); });
  btnHelpOk?.addEventListener("click", (e) => { e.preventDefault(); closeHelp(); });
  helpModal?.addEventListener("click", (e) => { if (e.target?.dataset?.close === "true") closeHelp(); });

  /* ---------------------------- Lighting wiring ---------------------------- */

  function syncLightingUIFromLights() {
    if (!lights) return;

    keyIntensity && (keyIntensity.value = String(lights.key.intensity ?? 0));
    fillIntensity && (fillIntensity.value = String(lights.fill.intensity ?? 0));
    rimIntensity && (rimIntensity.value = String(lights.rim.intensity ?? 0));
    ambIntensity && (ambIntensity.value = String(lights.ambient.intensity ?? 0));
    hemiIntensity && (hemiIntensity.value = String(lights.hemi.intensity ?? 0));

    keyColor && (keyColor.value = hexToColorInput(lights.key.color));
    fillColor && (fillColor.value = hexToColorInput(lights.fill.color));
    rimColor && (rimColor.value = hexToColorInput(lights.rim.color));
    ambColor && (ambColor.value = hexToColorInput(lights.ambient.color));

    hemiSky && (hemiSky.value = hexToColorInput(lights.hemi.color));
    hemiGround && (hemiGround.value = hexToColorInput(lights.hemi.groundColor));
  }

  function applyLightingUIToLights() {
    if (!lights) return;

    lights.key.intensity = Number(keyIntensity?.value ?? lights.key.intensity);
    lights.fill.intensity = Number(fillIntensity?.value ?? lights.fill.intensity);
    lights.rim.intensity = Number(rimIntensity?.value ?? lights.rim.intensity);
    lights.ambient.intensity = Number(ambIntensity?.value ?? lights.ambient.intensity);
    lights.hemi.intensity = Number(hemiIntensity?.value ?? lights.hemi.intensity);

    if (keyColor) lights.key.color.setHex(colorInputToHex(keyColor.value));
    if (fillColor) lights.fill.color.setHex(colorInputToHex(fillColor.value));
    if (rimColor) lights.rim.color.setHex(colorInputToHex(rimColor.value));
    if (ambColor) lights.ambient.color.setHex(colorInputToHex(ambColor.value));

    if (hemiSky) lights.hemi.color.setHex(colorInputToHex(hemiSky.value));
    if (hemiGround) lights.hemi.groundColor.setHex(colorInputToHex(hemiGround.value));

    // key direction dropdown
    if (keyDir) setKeyDirectionByName(lights, keyDir.value);

    renderer.render(scene, camera);
  }

  function setLightingPreset(name) {
    if (!lights) return;
    const preset = String(name || "studio");
    applyLightingPreset(lights, preset);

    // keep direction dropdown coherent for "studio"
    if (keyDir && preset === "studio") keyDir.value = "front_right";

    syncLightingUIFromLights();
    renderer.render(scene, camera);
    showToast(`Lighting: ${preset}`);
  }

  lightPreset?.addEventListener("change", () => setLightingPreset(lightPreset.value));
  keyDir?.addEventListener("change", () => applyLightingUIToLights());

  [
    keyIntensity, keyColor,
    fillIntensity, fillColor,
    rimIntensity, rimColor,
    ambIntensity, ambColor,
    hemiIntensity, hemiSky, hemiGround
  ].forEach((el) => el?.addEventListener("input", applyLightingUIToLights));

  btnResetLights?.addEventListener("click", () => {
    const preset = lightPreset?.value || "studio";
    setLightingPreset(preset);
  });

  // init lighting UI from current scene defaults
  syncLightingUIFromLights();

  /* ---------------------------- UI wiring ---------------------------- */

  togGrid?.addEventListener("change", () => {
    setShowGrid(STATE, !!togGrid.checked);
    if (gridHelper) gridHelper.visible = !!STATE.showGrid;
  });

  togAxes?.addEventListener("change", () => {
    setShowAxes(STATE, !!togAxes.checked);
    if (axesHelper) axesHelper.visible = !!STATE.showAxes;
  });

  togOutline?.addEventListener("change", () => {
    setShowOutline(STATE, !!togOutline.checked);
    selection.updateOutline();
  });

  btnResetPose?.addEventListener("click", resetPose);
  btnRandomPose?.addEventListener("click", randomPose);

  btnSavePose?.addEventListener("click", () => {
    const data = serializePoseForGallery();
    downloadJson("pose.json", data);
    gallery.saveCurrentPoseToGallery({ name: "", withToast: false });
    showToast("Saved pose.json + gallery");
  });

  btnLoadPose?.addEventListener("click", () => filePose?.click?.());
  filePose?.addEventListener("change", async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      applyPoseToScene(data);
    } catch (err) {
      console.warn(err);
      showToast("Load failed (invalid json)", 1800);
    }
    filePose.value = "";
  });

  btnExport?.addEventListener("click", () => exportPNG(renderer, scene, camera));

  btnDelProp?.addEventListener("click", deleteSelectedProp);

  btnScatter?.addEventListener("click", () => {
    const types = PROP_TYPES.length ? PROP_TYPES : ["cube", "sphere"];
    for (let i = 0; i < 5; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      spawnProp(t);
    }
    showToast("Scattered props");
  });

  bgTone?.addEventListener("change", () => setBackgroundTone(scene, bgTone.value));

  btnPerf?.addEventListener("click", () => {
    setPerfEnabled(STATE, !STATE.perfEnabled);
    showToast(STATE.perfEnabled ? "Perf: ON" : "Perf: OFF");
  });

  btnSaveGallery?.addEventListener("click", () => gallery.saveCurrentPoseToGallery({ withToast: true }));
  btnRenamePose?.addEventListener("click", () => gallery.renameSelected());
  btnDeletePose?.addEventListener("click", () => gallery.deleteSelected());
  btnClearGallery?.addEventListener("click", () => gallery.clearAll());

  /* ---------------------------- Input routing ---------------------------- */

 input.on("pointerdown", (evt) => {
  selection.onPointerDown(evt.originalEvent);

  // ✅ If you clicked an imported mesh, promote selection to its root
  const sel = selection.getSelected?.();
  if (sel?.userData?.isImportedModel && sel.userData.importRoot) {
    selection.setSelection(sel.userData.importRoot);
  }

  attachGizmoForCurrentMode();
});


  input.on("keydown", (evt) => {
    const e = evt.originalEvent;
    const k = String(evt.keyLower || "").toLowerCase();

    if (e.key === "Escape") {
      if (helpModal && !helpModal.classList.contains("hidden")) {
        closeHelp();
        return;
      }
      selection.clearSelection();
      return;
    }

    // modes
    if (k === "1" || k === "2" || k === "3" || k === "4") {
      modes.handleShortcut(k);
      return;
    }

    if (k === "f") {
      selection.focusSelection();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelectedProp();
      return;
    }

    // Ctrl/Cmd + S => save to gallery
    if ((e.ctrlKey || e.metaKey) && k === "s") {
      e.preventDefault();
      gallery.saveCurrentPoseToGallery({ withToast: true });
      return;
    }

    // Ctrl/Cmd + M => toggle symmetry quickly
    if ((e.ctrlKey || e.metaKey) && k === "m") {
      e.preventDefault();
      SYM.enabled = !SYM.enabled;
      updateSymmetryButtonUI();
      showToast(SYM.enabled ? "Symmetry ON (body)" : "Symmetry OFF");
      return;
    }

    selection.onKeyDown(e);
  });

  /* ---------------------------- Resize ---------------------------- */
  function onResize() {
    resizeToCanvas({
      camera,
      onAfterResize: () => selection.updateOutline()
    });
  }

  let ro = null;
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => onResize());
    ro.observe(canvas);
  }
  window.addEventListener("resize", onResize);
  onResize();

  /* ---------------------------- Loop ---------------------------- */
  const loop = createLoop({
    orbit,
    renderer,
    scene,
    camera,
    getSelected: () => selection.getSelected(),
    getShowOutline: () => STATE.showOutline,
    outline: selection.outline,
    perf: {
      enabled: () => !!STATE.perfEnabled,
      onFps: (fpsSmoothed) => {
        if (Math.random() < 0.02) showToast(`FPS ~ ${Number(fpsSmoothed).toFixed(0)}`, 900);
      }
    }
  });

  if (gridHelper) gridHelper.visible = !!STATE.showGrid;
  if (axesHelper) axesHelper.visible = !!STATE.showAxes;

  // Init lighting preset from dropdown (keeps UI + scene in sync)
  setLightingPreset(lightPreset?.value || "studio");

  showToast("Ready. Click a joint or prop to pose.");
  attachGizmoForCurrentMode();
  loop.start();
} catch (err) {
  fatal(err);
}
