// controls/Selection.js
// Owns: picking + selection state, outline, focus camera, selection name UI, clear.
// Fix: imported models remain selectable after Esc (scene-wide pickables + importRoot promotion).

import * as THREE from "three";

export class SelectionController {
  /**
   * @param {{
   *  canvas: HTMLCanvasElement,
   *  camera: THREE.Camera,
   *  scene: THREE.Scene,
   *  orbit: any, // OrbitControls
   *  gizmo: any, // TransformControls
   *  world: { root: THREE.Object3D, joints: THREE.Object3D[], props: THREE.Object3D[] },
   *  selectionNameInput?: HTMLInputElement,
   *  btnFocus?: HTMLElement,
   *  btnClear?: HTMLElement,
   *  helpModal?: HTMLElement,
   *  // state read
   *  getMode?: ()=>string, // returns "rotate"|"move"|"orbit"|"scale"
   *  getShowOutline?: ()=>boolean,
   *  // hooks
   *  toast?: (msg:string, ms?:number)=>void,
   * }} opts
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.camera = opts.camera;
    this.scene = opts.scene;
    this.orbit = opts.orbit;
    this.gizmo = opts.gizmo;
    this.world = opts.world;

    this.ui = {
      selectionName: opts.selectionNameInput || null,
      btnFocus: opts.btnFocus || null,
      btnClear: opts.btnClear || null,
      helpModal: opts.helpModal || null
    };

    this.getMode = typeof opts.getMode === "function" ? opts.getMode : () => "rotate";
    this.getShowOutline = typeof opts.getShowOutline === "function" ? opts.getShowOutline : () => true;

    this.toast = typeof opts.toast === "function" ? opts.toast : null;

    this.selected = null;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // outline helper (same look as your current app.js)
    this.outline = new THREE.BoxHelper(new THREE.Object3D(), 0x24d2ff);
    this.outline.visible = false;
    this.scene.add(this.outline);

    this._onPointerDown = (e) => this.onPointerDown(e);
    this._onKeyDown = (e) => this.onKeyDown(e);

    window.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("keydown", this._onKeyDown);

    this.ui.btnFocus?.addEventListener("click", () => this.focusSelection());
    this.ui.btnClear?.addEventListener("click", () => this.clearSelection());

    this._syncUI();
  }

  destroy() {
    window.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("keydown", this._onKeyDown);
    // outline stays in scene unless you want to remove it
  }

  getSelected() {
    return this.selected;
  }

  setSelection(obj) {
    this.selected = obj || null;

    if (!this.selected) {
      this._syncUI();
      this.gizmo?.detach?.();
      this.outline.visible = false;
      return;
    }

    this._syncUI();
    this.gizmo?.attach?.(this.selected);
    this.updateOutline();
  }

  clearSelection() {
    this.selected = null;
    this._syncUI();
    this.gizmo?.detach?.();
    this.outline.visible = false;
    this._toast("Selection cleared");
  }

  updateOutline() {
    if (!this.getShowOutline() || !this.selected) {
      this.outline.visible = false;
      return;
    }
    this.outline.setFromObject(this.selected);
    this.outline.visible = true;
  }

  tick() {
    if (this.selected && this.getShowOutline()) {
      this.outline.setFromObject(this.selected);
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }
  }

  focusSelection() {
    if (!this.selected) return;

    const box = new THREE.Box3().setFromObject(this.selected);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());

    const dist = this._clamp(size * 1.6, 1.8, 12);
    const dir = new THREE.Vector3(1, 0.7, 1).normalize();

    this.camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    this.orbit?.target?.copy?.(center);
    this.orbit?.update?.();

    this._toast("Focused");
  }

  onPointerDown(ev) {
    // block selection when orbit mode is active
    if (this.getMode() === "orbit") return;
    // block selection if help modal is open
    if (this.ui.helpModal && !this.ui.helpModal.classList.contains("hidden")) return;

    const obj = this.pickFromPointer(ev);
    if (obj) {
      this.setSelection(obj);
      this._toast(`Selected: ${obj.name || "object"}`);
    }
  }

  onKeyDown(ev) {
    if (ev.key === "Escape") {
      if (this.ui.helpModal && !this.ui.helpModal.classList.contains("hidden")) return;
      this.clearSelection();
      return;
    }

    if (ev.key.toLowerCase() === "f") {
      this.focusSelection();
    }
  }

  /* ---------------- picking ---------------- */

  _isPickable(obj) {
    if (!obj) return false;
    if (!obj.userData || !obj.userData.pickable) return false;

    // avoid accidentally selecting helpers/gizmo internals if they ever get marked
    if (obj.userData.nonPickable) return false;
    if (obj.userData.isGizmo) return false;
    if (obj.type === "TransformControlsPlane" || obj.type === "TransformControlsGizmo") return false;

    return true;
  }

  _collectPickablesInto(arr, root) {
    if (!root || !root.traverse) return;
    root.traverse((obj) => {
      if (this._isPickable(obj)) arr.push(obj);
    });
  }

  _resolveSelectionFromHit(hitObj) {
    if (!hitObj) return null;

    // If a mesh belongs to an imported root, always promote to that root
    if (hitObj.userData?.importRoot) return hitObj.userData.importRoot;

    // climb to joint group or prop root
    let o = hitObj;
    while (o) {
      // imported model mesh can store importRoot on itself (common)
      if (o.userData?.importRoot) return o.userData.importRoot;

      // joints: return joint group (parent marked isJoint)
      if (o.parent?.userData?.isJoint) return o.parent;

      // props: if this object itself is the prop root
      if (o.userData?.isImportedRoot) return o;
      if (o.userData?.isProp && o.userData?.isImportedModel && o.userData?.importRoot) return o.userData.importRoot;
      if (o.userData?.isProp) return o;

      o = o.parent || null;
    }

    return hitObj;
  }

  pickFromPointer(ev) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pickables = [];

    // 1) character pickables
    this._collectPickablesInto(pickables, this.world.root);

    // 2) registered props pickables
    (this.world.props || []).forEach((p) => this._collectPickablesInto(pickables, p));

    // 3) IMPORTANT: scene-wide pickables (covers imported models not registered in world.props)
    this._collectPickablesInto(pickables, this.scene);

    if (!pickables.length) return null;

    const hits = this.raycaster.intersectObjects(pickables, true);
    if (!hits.length) return null;

    return this._resolveSelectionFromHit(hits[0].object);
  }

  /* ---------------- ui/helpers ---------------- */

  _syncUI() {
    if (!this.ui.selectionName) return;
    this.ui.selectionName.value = this.selected ? (this.selected.name || "(unnamed)") : "None";
  }

  _toast(msg, ms = 1200) {
    if (this.toast) this.toast(msg, ms);
  }

  _clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
}
