// app.js
// PoseSandbox modular entrypoint — uses EVERY module in your tree.
// Keeps behavior identical to your working monolithic app.js (selection, gizmo, gallery, presets, props, export, help, perf).

import * as THREE from "three";

import { Character } from "./character/character.js";

import { InputManager, bindPropButtons } from "./controls/inputs.js";
import { ModesController } from "./controls/modes.js";
import { SelectionController } from "./controls/selection.js";

import { clamp, degToRad, makeToast, niceTime } from "./core/helpers.js";
import { createState, setShowAxes, setShowGrid, setShowOutline, setPerfEnabled } from "./core/state.js";
import {
  createWorld,
  resetAllJointRotations as resetAllJointRotationsWorld,
  addProp as addPropWorld,
  removeProp as removePropWorld,
  clearProps as clearPropsWorld,
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
    // we won’t use window listeners from engine/scene.js; Selection/Input handle events.
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
    outline: engineOutline
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

  /* Selection controller (we’ll route events via InputManager) */
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

  // SelectionController adds its own outline; we remove engine outline so it’s not duplicated.
  try {
    if (engineOutline) scene.remove(engineOutline);
  } catch {}

  // IMPORTANT: we do NOT want SelectionController to bind window events (we use InputManager)
  selection.destroy();

  /* Modes controller (UI + gizmo/orbit + snap/axis) */
  const modes = new ModesController({
    modeRotateBtn: modeRotate,
    modeMoveBtn: modeMove,
    modeOrbitBtn: modeOrbit,
    axisXBtn: axisX,
    axisYBtn: axisY,
    axisZBtn: axisZ,
    rotateSnapSelect: rotateSnap,
    orbit,
    gizmo,
    toast: showToast
  });

  // Sync ModesController state -> core STATE (so other modules read consistent values)
  const _setMode = modes.setMode.bind(modes);
  modes.setMode = (m) => {
    _setMode(m);
    STATE.mode = modes.state.mode;
    return STATE.mode;
  };

  const _toggleAxis = modes.toggleAxis.bind(modes);
  modes.toggleAxis = (k) => {
    const v = _toggleAxis(k);
    STATE.axis.x = !!modes.state.axis.x;
    STATE.axis.y = !!modes.state.axis.y;
    STATE.axis.z = !!modes.state.axis.z;
    return v;
  };

  const _setSnapDeg = modes.setSnapDeg.bind(modes);
  modes.setSnapDeg = (deg) => {
    const v = _setSnapDeg(deg);
    STATE.snapDeg = modes.state.snapDeg;
    return v;
  };

  // Initialize state from UI
  STATE.mode = modes.state.mode;
  STATE.axis = { ...modes.state.axis };
  STATE.snapDeg = modes.state.snapDeg;

  /* ---------------------------- Props ---------------------------- */

  function applyPropShadowsAndPickable(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o && o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // pickable is set on mesh in core/world.js already, but keep it bulletproof:
        if (!o.userData) o.userData = {};
        o.userData.pickable = true;
      }
    });
  }

  function defaultPropColor(type) {
    // small, consistent palette (not required, but helps visually)
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
        // double-side for flat shapes (ring/disc/plane)
        if (type === "ring" || type === "disc" || type === "plane") {
          o.material.side = THREE.DoubleSide;
        }
      }
    });
  }

  function spawnProp(type) {
    const t = String(type || "cube").toLowerCase();

    // core/world creates + registers
    const prop = addPropWorld(world, scene, t, {
      name: `prop_${t}_${world.props.length + 1}`
    });

    // place it similar to your monolith
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

  /* Hook prop UI (cube/sphere and any future buttons that exist in HTML) */
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
    // use Character method if available (bulletproof reset); fallback to world helper
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

    try {
      return thumb.toDataURL("image/png");
    } catch {
      return null;
    }
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

  btnHelp?.addEventListener("click", (e) => {
    e.preventDefault();
    openHelp();
  });

  btnCloseHelp?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeHelp();
  });

  btnHelpOk?.addEventListener("click", (e) => {
    e.preventDefault();
    closeHelp();
  });

  helpModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeHelp();
  });

  /* ---------------------------- UI wiring ---------------------------- */

  // visual toggles
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

  // pose buttons
  btnResetPose?.addEventListener("click", resetPose);
  btnRandomPose?.addEventListener("click", randomPose);

  // save json (download) + save thumbnail to gallery
  btnSavePose?.addEventListener("click", () => {
    const data = serializePoseForGallery();
    downloadJson("pose.json", data);

    // save to gallery too (no extra toast)
    gallery.saveCurrentPoseToGallery({ name: "", withToast: false });
    showToast("Saved pose.json + gallery");
  });

  // load json (single)
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

  // export
  btnExport?.addEventListener("click", () => exportPNG(renderer, scene, camera));

  // props
  btnDelProp?.addEventListener("click", deleteSelectedProp);

  btnScatter?.addEventListener("click", () => {
    // Scatter a few random props; if you want only cube/sphere, replace list with ["cube","sphere"]
    const types = PROP_TYPES.length ? PROP_TYPES : ["cube", "sphere"];
    for (let i = 0; i < 5; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      spawnProp(t);
    }
    showToast("Scattered props");
  });

  // background tone
  bgTone?.addEventListener("change", () => {
    setBackgroundTone(scene, bgTone.value);
  });

  // perf toggle
  btnPerf?.addEventListener("click", () => {
    setPerfEnabled(STATE, !STATE.perfEnabled);
    showToast(STATE.perfEnabled ? "Perf: ON" : "Perf: OFF");
  });

  // gallery buttons
  btnSaveGallery?.addEventListener("click", () => gallery.saveCurrentPoseToGallery({ withToast: true }));
  btnRenamePose?.addEventListener("click", () => gallery.renameSelected());
  btnDeletePose?.addEventListener("click", () => gallery.deleteSelected());
  btnClearGallery?.addEventListener("click", () => gallery.clearAll());

  /* ---------------------------- Keyboard + pointer via InputManager ---------------------------- */

  input.on("pointerdown", (evt) => {
    // SelectionController expects the real PointerEvent
    selection.onPointerDown(evt.originalEvent);
  });

  input.on("keydown", (evt) => {
    const e = evt.originalEvent;
    const k = String(evt.keyLower || "").toLowerCase();

    // Escape: close help first, else clear selection (match your old behavior)
    if (e.key === "Escape") {
      if (helpModal && !helpModal.classList.contains("hidden")) {
        closeHelp();
        return;
      }
      selection.clearSelection();
      return;
    }

    // Shortcuts: modes
    if (k === "1" || k === "2" || k === "3") {
      modes.handleShortcut(k);
      // ensure STATE is synced (wrappers already sync)
      return;
    }

    // Focus
    if (k === "f") {
      selection.focusSelection();
      return;
    }

    // Delete prop
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelectedProp();
      return;
    }

    // Ctrl/Cmd + S => save to gallery (no download)
    if ((e.ctrlKey || e.metaKey) && k === "s") {
      e.preventDefault();
      gallery.saveCurrentPoseToGallery({ withToast: true });
      return;
    }

    // Let SelectionController keep its own small shortcuts (like F)
    selection.onKeyDown(e);
  });

  /* ---------------------------- Resize ---------------------------- */
  function onResize() {
    resizeToCanvas({
      camera,
      onAfterResize: () => selection.updateOutline()
    });
  }

  // ResizeObserver for canvas
  let ro = null;
  if ("ResizeObserver" in window) {
    ro = new ResizeObserver(() => onResize());
    ro.observe(canvas);
  }
  window.addEventListener("resize", onResize);
  onResize();

  /* ---------------------------- Render loop ---------------------------- */
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
        // same “occasional toast” idea as your monolith
        if (Math.random() < 0.02) showToast(`FPS ~ ${Number(fpsSmoothed).toFixed(0)}`, 900);
      }
    }
  });

  // Apply initial visibility from STATE
  if (gridHelper) gridHelper.visible = !!STATE.showGrid;
  if (axesHelper) axesHelper.visible = !!STATE.showAxes;

  showToast("Ready. Click a joint or prop to pose.");
  loop.start();
} catch (err) {
  fatal(err);
}
