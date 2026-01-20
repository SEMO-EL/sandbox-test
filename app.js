// app.js
// PoseSandbox modular entrypoint — uses EVERY module in your tree.
// Adds: ✅ Scale mode (props scale normally; body joints scale only their visible mesh).

import * as THREE from "three";

import { Character } from "./character/character.js";

import { InputManager, bindPropButtons } from "./controls/inputs.js";
import { ModesController } from "./controls/modes.js";
import { SelectionController } from "./controls/selection.js";

import { clamp, makeToast, niceTime } from "./core/helpers.js";
import { createState, setShowAxes, setShowGrid, setShowOutline, setPerfEnabled } from "./core/state.js";
import {
  createWorld,
  resetAllJointRotations as resetAllJointRotationsWorld,
  addProp as addPropWorld,
  removeProp as removePropWorld,
  PROP_TYPES
} from "./core/world.js";

import { createRenderer } from "./engine/renderer.js";
import { createScene, setBackgroundTone } from "./engine/scene.js";
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

const modeRotate = document.getElementById("modeRotate");
const modeMove = document.getElementById("modeMove");
const modeOrbit = document.getElementById("modeOrbit");
const modeScale = document.getElementById("modeScale"); // ✅ NEW

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

/* ---------------------------- Boot ---------------------------- */
try {
  /* Core state + world */
  const STATE = createState();
  const world = createWorld();

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

  const { scene, camera, orbit, gizmo, axesHelper, gridHelper, outline: engineOutline } = sceneBundle;

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
    modeScaleBtn: modeScale, // ✅ NEW
    axisXBtn: axisX,
    axisYBtn: axisY,
    axisZBtn: axisZ,
    rotateSnapSelect: rotateSnap,
    orbit,
    gizmo,
    toast: showToast
  });

  // Sync ModesController -> STATE (single source of truth for other modules)
  const _setMode = modes.setMode.bind(modes);
  modes.setMode = (m) => {
    _setMode(m);
    STATE.mode = modes.state.mode;
    // When mode changes, re-attach gizmo appropriately (scale target differs)
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

  function getGizmoTargetForSelection(sel) {
    if (!sel) return null;

    // Orbit mode: no gizmo
    if (STATE.mode === "orbit") return null;

    // Scale mode: special rule
    if (STATE.mode === "scale") {
      // Props: scale the whole group (keeps rotations/position coherent)
      if (sel.userData?.isProp) return sel;

      // Joints: scale ONLY the visible mesh under that joint (rig stays stable)
      if (sel.userData?.isJoint) {
        const mesh = findFirstPickableMesh(sel);
        return mesh || sel;
      }
    }

    // Rotate/Move: attach to the selected group itself (same as before)
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

  // Wrap selection.setSelection so gizmo attachment always follows our targeting rules
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

  function deleteSelectedProp() {
    const sel = selection.getSelected();
    if (!sel || !sel.userData?.isProp) {
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

  /* ---------------------------- Pose I/O ---------------------------- */

  function serializePoseForGallery() {
    return serializePose({ world, poseNotesEl: poseNotes });
  }

  function resetAllJointRotations() {
    if (character?.resetAllJointRotations) character.resetAllJointRotations();
    else resetAllJointRotationsWorld(world);
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

  function resetPose() {
    resetAllJointRotations();
    selection.updateOutline();
    showToast("Pose reset");
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
    // if something got selected, ensure gizmo target respects scale mode
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

    if ((e.ctrlKey || e.metaKey) && k === "s") {
      e.preventDefault();
      gallery.saveCurrentPoseToGallery({ withToast: true });
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

  showToast("Ready. Click a joint or prop to pose.");
  attachGizmoForCurrentMode();
  loop.start();
} catch (err) {
  fatal(err);
}
