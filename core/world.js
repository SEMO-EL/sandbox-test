// core/world.js
// Owns the scene graph objects that represent the "world":
// - root: character rig root group
// - joints: array of joint Groups (named, selectable)
// - props: array of prop Groups (selectable)
//
// This module intentionally keeps state + helpers together.
// It does NOT create a Three.Scene; it only creates/returns objects you add to a scene.

import * as THREE from "three";

/**
 * @typedef {Object} World
 * @property {THREE.Group} root
 * @property {THREE.Group[]} joints
 * @property {THREE.Group[]} props
 */

export function createWorld() {
  /** @type {World} */
  const world = {
    root: new THREE.Group(),
    joints: [],
    props: []
  };

  // For safety: name the root group (nice in devtools)
  world.root.name = "world_root";

  return world;
}

export function resetWorld(world) {
  // Clear character root + reset arrays
  world.root.clear();
  world.joints.length = 0;
  // props are not children of world.root in your current code; they live in the scene directly.
  // We still clear the array here so callers can rebuild safely.
  world.props.length = 0;
}

export function resetAllJointRotations(world) {
  // Bulletproof reset (rotation + quaternion)
  world.joints.forEach(j => {
    j.rotation.set(0, 0, 0);
    j.quaternion.identity();
  });
}

/**
 * Create a joint group and register it.
 * @param {World} world
 * @param {string} name
 * @param {number} [x=0]
 * @param {number} [y=0]
 * @param {number} [z=0]
 * @returns {THREE.Group}
 */
export function namedJoint(world, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.userData.isJoint = true;
  world.joints.push(g);
  return g;
}

/**
 * Traverse all pickable meshes from character + props.
 * Caller can use this for raycasting.
 * @param {World} world
 * @returns {THREE.Object3D[]}
 */
export function collectPickables(world) {
  const pickables = [];

  world.root.traverse(obj => {
    if (obj && obj.userData && obj.userData.pickable) pickables.push(obj);
  });

  world.props.forEach(p => {
    p.traverse(obj => {
      if (obj && obj.userData && obj.userData.pickable) pickables.push(obj);
    });
  });

  return pickables;
}

/* ---------------- PROPS (ADDITIVE) ---------------- */

/**
 * List of supported prop types.
 * (All geometries used below exist in core Three.js build—no addons required.)
 */
export const PROP_TYPES = [
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "torus",
  "ring",
  "disc",
  "icosa",
  "octa",
  "dodeca",
  "tetra",
  "plane"
];

/**
 * Create a pickable mesh (standard material).
 * Keep it minimal (color can be changed elsewhere).
 * @param {THREE.BufferGeometry} geo
 * @returns {THREE.Mesh}
 */
export function createPickableMesh(geo) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b2,
    roughness: 0.85,
    metalness: 0.05
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.pickable = true;
  return mesh;
}

/**
 * Create a prop Group by type.
 * IMPORTANT: This function does NOT add to scene or world; use registerProp().
 *
 * @param {string} type
 * @param {{name?:string}} [opts]
 * @returns {THREE.Group}
 */
export function createPropGroup(type, opts = {}) {
  const t = String(type || "cube").toLowerCase();

  /** @type {THREE.BufferGeometry} */
  let geo;

  // sizes are chosen to feel similar to your existing cube/sphere
  switch (t) {
    case "cube":
      geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(0.3, 24, 16);
      break;
    case "cylinder":
      geo = new THREE.CylinderGeometry(0.25, 0.25, 0.9, 20);
      break;
    case "cone":
      geo = new THREE.ConeGeometry(0.32, 0.9, 20);
      break;
    case "pyramid":
      // cone with 4 radial segments looks like a pyramid
      geo = new THREE.ConeGeometry(0.38, 0.9, 4);
      break;
    case "torus":
      geo = new THREE.TorusGeometry(0.35, 0.12, 12, 24);
      break;
    case "ring":
      geo = new THREE.RingGeometry(0.18, 0.38, 32);
      break;
    case "disc":
      geo = new THREE.CircleGeometry(0.4, 32);
      break;
    case "icosa":
      geo = new THREE.IcosahedronGeometry(0.35, 0);
      break;
    case "octa":
      geo = new THREE.OctahedronGeometry(0.35, 0);
      break;
    case "dodeca":
      geo = new THREE.DodecahedronGeometry(0.35, 0);
      break;
    case "tetra":
      geo = new THREE.TetrahedronGeometry(0.42, 0);
      break;
    case "plane":
      geo = new THREE.PlaneGeometry(1, 1, 1, 1);
      break;
    default:
      // safe fallback
      geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      break;
  }

  const g = new THREE.Group();
  g.userData.isProp = true;
  g.userData.type = t;

  const mesh = createPickableMesh(geo);
  g.add(mesh);

  // Type-specific defaults (purely visual; keeps pickability intact)
  if (t === "plane") {
    // Make plane visible from both sides
    mesh.material.side = THREE.DoubleSide;
    // Slight tilt so it's visible if users add it at origin
    g.rotation.x = -Math.PI * 0.5;
  }
  if (t === "ring" || t === "disc") {
    // same note: make these visible from both sides
    mesh.material.side = THREE.DoubleSide;
    g.rotation.x = -Math.PI * 0.5;
  }

  g.name = opts.name || t;

  return g;
}

/**
 * Register a prop Group into world + scene.
 * Props live in the scene directly.
 *
 * @param {World} world
 * @param {THREE.Scene} scene
 * @param {THREE.Group} prop
 * @returns {THREE.Group}
 */
export function registerProp(world, scene, prop) {
  if (!prop) return prop;
  world.props.push(prop);
  if (scene) scene.add(prop);
  return prop;
}

/**
 * Convenience: create + register in one call.
 * @param {World} world
 * @param {THREE.Scene} scene
 * @param {string} type
 * @param {{name?:string}} [opts]
 * @returns {THREE.Group}
 */
export function addProp(world, scene, type, opts = {}) {
  const g = createPropGroup(type, opts);
  return registerProp(world, scene, g);
}

/**
 * Remove a prop from world + scene.
 * @param {World} world
 * @param {THREE.Scene} scene
 * @param {THREE.Group} prop
 */
export function removeProp(world, scene, prop) {
  if (!prop) return;
  const idx = world.props.indexOf(prop);
  if (idx >= 0) world.props.splice(idx, 1);
  if (scene) scene.remove(prop);
}

/**
 * Remove all props from scene and clear world.props.
 * @param {World} world
 * @param {THREE.Scene} scene
 */
export function clearProps(world, scene) {
  if (!world || !world.props) return;
  world.props.forEach(p => {
    if (scene) scene.remove(p);
  });
  world.props.length = 0;
}
