// character/Character.js
// Builds the simple box-based character + exposes joints list for posing.
// Mannequin-style proportions tuned for clear posing & silhouette reading.

/**
 * @typedef {import("three")} THREE
 */

export class Character {
  constructor(THREERef, scene, makeMaterialFn) {
    this.THREE = THREERef;
    this.scene = scene;
    this.makeMaterial = makeMaterialFn;

    this.root = new this.THREE.Group();
    this.joints = [];
    this._built = false;
  }

  clear() {
    try {
      if (this.root && this.root.parent) this.root.parent.remove(this.root);
    } catch {}
    this.root.clear();
    this.joints.length = 0;
    this._built = false;
  }

  _namedGroup(name, x = 0, y = 0, z = 0) {
    const g = new this.THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.userData.isJoint = true;
    this.joints.push(g);
    return g;
  }

  _addBox(parent, name, w, h, d, x, y, z, color = 0xb4b8c8) {
    const mesh = new this.THREE.Mesh(
      new this.THREE.BoxGeometry(w, h, d),
      this.makeMaterial(color)
    );
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.userData.pickable = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  build() {
    this.clear();

    const root = this._namedGroup("char_root");
    this.root.add(root);

    /* ===================== HIPS ===================== */
    const hips = this._namedGroup("hips", 0, 0.9, 0);
    root.add(hips);

    this._addBox(hips, "torso_mesh", 1.0, 1.15, 0.55, 0, 0.6, 0, 0xaab0c2);

    /* ===================== CHEST / HEAD ===================== */
    const chest = this._namedGroup("chest", 0, 1.15, 0);
    hips.add(chest);

    const neck = this._namedGroup("neck", 0, 0.1, 0);
    chest.add(neck);

    this._addBox(neck, "head_mesh", 0.55, 0.58, 0.55, 0, 0.32, 0, 0xc3c8d8);

    /* ===================== SHOULDERS ===================== */
    const shoulderX = 0.68;
    const shoulderY = 0.05;

    const lShoulder = this._namedGroup("l_shoulder", -shoulderX, shoulderY, 0);
    const rShoulder = this._namedGroup("r_shoulder",  shoulderX, shoulderY, 0);
    chest.add(lShoulder, rShoulder);

    this._addBox(lShoulder, "l_upperarm_mesh", 0.28, 0.78, 0.28, 0, -0.45, 0, 0x9aa2b8);
    this._addBox(rShoulder, "r_upperarm_mesh", 0.28, 0.78, 0.28, 0, -0.45, 0, 0x9aa2b8);

    /* ===================== ELBOWS ===================== */
    const lElbow = this._namedGroup("l_elbow", 0, -0.85, 0);
    const rElbow = this._namedGroup("r_elbow", 0, -0.85, 0);
    lShoulder.add(lElbow);
    rShoulder.add(rElbow);

    this._addBox(lElbow, "l_forearm_mesh", 0.24, 0.72, 0.24, 0, -0.38, 0, 0x8c95ab);
    this._addBox(rElbow, "r_forearm_mesh", 0.24, 0.72, 0.24, 0, -0.38, 0, 0x8c95ab);

    /* ===================== WRISTS / HANDS ===================== */
    const lWrist = this._namedGroup("l_wrist", 0, -0.78, 0);
    const rWrist = this._namedGroup("r_wrist", 0, -0.78, 0);
    lElbow.add(lWrist);
    rElbow.add(rWrist);

    this._addBox(
      lWrist,
      "l_hand_mesh",
      0.32, 0.22, 0.18,   // wider + deeper palm
      0, -0.11, 0.10,     // lowered + forward
      0x6f7b96
    );

    this._addBox(
      rWrist,
      "r_hand_mesh",
      0.32, 0.22, 0.18,
      0, -0.11, 0.10,
      0x6f7b96
    );

    /* ===================== LEGS ===================== */
    const hipX = 0.28;
    const lHip = this._namedGroup("l_hip", -hipX, 0.02, 0);
    const rHip = this._namedGroup("r_hip",  hipX, 0.02, 0);
    hips.add(lHip, rHip);

    this._addBox(lHip, "l_thigh_mesh", 0.36, 0.95, 0.36, 0, -0.48, 0, 0x8792aa);
    this._addBox(rHip, "r_thigh_mesh", 0.36, 0.95, 0.36, 0, -0.48, 0, 0x8792aa);

    /* ===================== KNEES ===================== */
    const lKnee = this._namedGroup("l_knee", 0, -0.95, 0);
    const rKnee = this._namedGroup("r_knee", 0, -0.95, 0);
    lHip.add(lKnee);
    rHip.add(rKnee);

    this._addBox(lKnee, "l_shin_mesh", 0.30, 0.85, 0.30, 0, -0.42, 0, 0x7b86a0);
    this._addBox(rKnee, "r_shin_mesh", 0.30, 0.85, 0.30, 0, -0.42, 0, 0x7b86a0);

    /* ===================== ANKLES / FEET ===================== */
    const lAnkle = this._namedGroup("l_ankle", 0, -0.92, 0);
    const rAnkle = this._namedGroup("r_ankle", 0, -0.92, 0);
    lKnee.add(lAnkle);
    rKnee.add(rAnkle);

    this._addBox(
      lAnkle,
      "l_foot_mesh",
      0.38, 0.18, 0.65,   // longer foot
      0, -0.09, 0.28,     // strong forward projection
      0x5f6a86
    );

    this._addBox(
      rAnkle,
      "r_foot_mesh",
      0.38, 0.18, 0.65,
      0, -0.09, 0.28,
      0x5f6a86
    );

    root.position.y = 1;
    this.scene.add(this.root);

    this._built = true;
    return { root: this.root, joints: this.joints };
  }

  resetAllJointRotations() {
    this.joints.forEach(j => {
      j.rotation.set(0, 0, 0);
      j.quaternion.identity();
    });
  }
}
