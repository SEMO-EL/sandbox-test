// controls/Selection.js
// Owns: picking + selection state, outline, focus camera, selection name UI, clear.
// Does NOT duplicate other modules. Use from your main app/engine glue.

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
   *  getMode?: ()=>string, // returns "rotate"|"move"|"orbit"
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
    // call per frame from render loop if you want outline to follow transforms
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
    // Escape is handled by your Help system too, but we keep selection behavior consistent:
    if (ev.key === "Escape") {
      // if modal open, don't fight it (caller likely closes it)
      if (this.ui.helpModal && !this.ui.helpModal.classList.contains("hidden")) return;
      this.clearSelection();
      return;
    }

    // F to focus
    if (ev.key.toLowerCase() === "f") {
      this.focusSelection();
    }
  }

  pickFromPointer(ev) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const pickables = [];

    // character pickables
    this.world.root?.traverse?.((obj) => {
      if (obj?.userData?.pickable) pickables.push(obj);
    });

    // props pickables
    (this.world.props || []).forEach((p) => {
      p?.traverse?.((obj) => {
        if (obj?.userData?.pickable) pickables.push(obj);
      });
    });

    const hits = this.raycaster.intersectObjects(pickables, true);
    if (!hits.length) return null;

    // climb to joint group or prop group (same logic as your app.js)
    let o = hits[0].object;
    while (o && o.parent) {
      if (o.parent?.userData?.isJoint) return o.parent;
      if (o.userData?.isProp) return o;
      o = o.parent;
    }
    return hits[0].object;
  }

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
