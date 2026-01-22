// core/state.js
// Central mutable state for the PoseSandbox app (UI + runtime toggles).
// Keep it simple: a plain object + small helpers, no Three.js imports.

/**
 * @typedef {Object} AxisState
 * @property {boolean} x
 * @property {boolean} y
 * @property {boolean} z
 */

/**
 * @typedef {Object} ReferenceState
 * @property {boolean} enabled
 * @property {number} opacity
 * @property {number} size
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {boolean} flipX
 */

/**
 * @typedef {Object} AppState
 * @property {"rotate"|"move"|"orbit"|"scale"} mode
 * @property {AxisState} axis
 * @property {number} snapDeg
 * @property {boolean} showGrid
 * @property {boolean} showAxes
 * @property {boolean} showOutline
 * @property {boolean} perfEnabled
 * @property {ReferenceState} reference
 */

export function createState() {
  /** @type {AppState} */
  const STATE = {
    mode: "rotate",
    axis: { x: true, y: true, z: true },
    snapDeg: 10,
    showGrid: true,
    showAxes: false,
    showOutline: true,
    perfEnabled: false,

    // ✅ Reference image overlay defaults
    reference: {
      enabled: false,
      opacity: 0.65,
      size: 3.2,
      offsetX: 0,
      offsetY: 0,
      flipX: false
    }
  };

  return STATE;
}

export function setMode(state, mode) {
  state.mode = mode;
  return state.mode;
}

export function toggleAxis(state, key) {
  state.axis[key] = !state.axis[key];
  return state.axis[key];
}

export function setSnapDeg(state, deg) {
  const n = Number(deg);
  state.snapDeg = Number.isFinite(n) ? n : state.snapDeg;
  return state.snapDeg;
}

export function setShowGrid(state, on) {
  state.showGrid = !!on;
  return state.showGrid;
}

export function setShowAxes(state, on) {
  state.showAxes = !!on;
  return state.showAxes;
}

export function setShowOutline(state, on) {
  state.showOutline = !!on;
  return state.showOutline;
}

export function setPerfEnabled(state, on) {
  state.perfEnabled = !!on;
  return state.perfEnabled;
}
