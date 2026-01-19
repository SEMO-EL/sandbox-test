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
