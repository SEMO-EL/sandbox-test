// character/Character.js
// Builds the simple box-based character + exposes joints list for posing.
// Extracted from your current working app.js buildCharacter()/namedGroup()/addBox() logic.

/**
 * @typedef {import("three")} THREE
 */

export class Character {
  /**
   * @param {typeof import("three")} THREERef
   * @param {import("three").Scene} scene
   * @param {(colorHex:number)=>import("three").MeshStandardMaterial} makeMaterialFn
   */
  constructor(THREERef, scene, makeMaterialFn) {
    this.THREE = THREERef;
    this.scene = scene;
    this.makeMaterial = makeMaterialFn;

    /** @type {import("three").Group} */
    this.root = new this.THREE.Group();

    /** @type {import("three").Group[]} */
    this.joints = [];

    // built flag
    this._built = false;
  }

  /** Clear from scene + reset local data */
  clear() {
    try {
      if (this.root && this.root.parent) this.root.parent.remove(this.root);
    } catch (e) {
      // ignore
    }
    this.root.clear();
    this.joints.length = 0;
    this._built = false;
  }

  /**
   * Create a joint group, register it, set position.
   * Mirrors namedGroup() from app.js.
   */
  _namedGroup(name, x = 0, y = 0, z = 0) {
    const g = new this.THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.userData.isJoint = true;
    this.joints.push(g);
    return g;
  }

  /**
   * Add a pickable box mesh (casts/receives shadows).
   * Mirrors addBox() from app.js.
   */
  _addBox(parent, name, w, h, d, x, y, z, color = 0xb4b8c8) {
    const mesh = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(w, h, d),
      this.makeMaterial(color)
    );
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.userData.pickable = true;

    // shadows (same behavior as your app.js)
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);
    return mesh;
  }

  /**
   * Build/attach the character to the scene.
   * Mirrors buildCharacter() from app.js.
   * @returns {{ root: import("three").Group, joints: import("three").Group[] }}
   */
  build() {
    this.clear();

    const root = this._namedGroup("char_root", 0, 0, 0);
    this.root.add(root);

    /* ===================== HIPS ===================== */
    const hips = this._namedGroup("hips", 0, 0.9, 0);
    root.add(hips);

    /* ===================== TORSO (shorter, tighter) ===================== */
    this._addBox(
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
    const chest = this._namedGroup("chest", 0, 1.15, 0);
    hips.add(chest);

    /* ===================== NECK (lower & closer) ===================== */
    const neck = this._namedGroup("neck", 0, 0.1, 0);
    chest.add(neck);

    /* ===================== HEAD (closer & slightly smaller) ===================== */
    this._addBox(
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

    const lShoulder = this._namedGroup("l_shoulder", -shoulderX, shoulderY, 0);
    const rShoulder = this._namedGroup("r_shoulder",  shoulderX, shoulderY, 0);
    chest.add(lShoulder);
    chest.add(rShoulder);

    /* ===================== UPPER ARMS ===================== */
    this._addBox(
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

    this._addBox(
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
    const lElbow = this._namedGroup("l_elbow", 0, -0.85, 0);
    const rElbow = this._namedGroup("r_elbow", 0, -0.85, 0);
    lShoulder.add(lElbow);
    rShoulder.add(rElbow);

    /* ===================== FOREARMS ===================== */
    this._addBox(
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

    this._addBox(
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

    const lHip = this._namedGroup("l_hip", -hipX, 0.02, 0);
    const rHip = this._namedGroup("r_hip",  hipX, 0.02, 0);
    hips.add(lHip);
    hips.add(rHip);

    this._addBox(
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

    this._addBox(
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
    const lKnee = this._namedGroup("l_knee", 0, -0.95, 0);
    const rKnee = this._namedGroup("r_knee", 0, -0.95, 0);
    lHip.add(lKnee);
    rHip.add(rKnee);

    /* ===================== SHINS ===================== */
    this._addBox(
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

    this._addBox(
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

    // match your app.js behavior
    root.position.y = 1;

    // attach to scene
    this.scene.add(this.root);

    this._built = true;
    return { root: this.root, joints: this.joints };
  }

  /** Bulletproof reset (rotation + quaternion) */
  resetAllJointRotations() {
    this.joints.forEach(j => {
      j.rotation.set(0, 0, 0);
      j.quaternion.identity();
    });
  }
}
