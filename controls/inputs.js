// controls/InputManager.js
// Centralizes pointer + keyboard input, and emits events.
// This file is NEW and does NOT duplicate your other files.

export class InputManager {
  /**
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   windowTarget?: Window,
   *   helpModal?: HTMLElement|null
   * }} opts
   */
  constructor(opts) {
    this.canvas = opts.canvas;
    this.win = opts.windowTarget || window;
    this.helpModal = opts.helpModal || null;

    // listeners registry
    this._handlers = {
      pointerdown: [],
      pointermove: [],
      pointerup: [],
      keydown: [],
      keyup: [],
      resize: []
    };

    this._bound = {
      pointerdown: (e) => this._onPointerDown(e),
      pointermove: (e) => this._onPointerMove(e),
      pointerup: (e) => this._onPointerUp(e),
      keydown: (e) => this._onKeyDown(e),
      keyup: (e) => this._onKeyUp(e),
      resize: () => this._emit("resize", { type: "resize" })
    };

    // state
    this.pointer = {
      clientX: 0,
      clientY: 0,
      isDown: false,
      button: 0,
      pointerId: null
    };

    this.keys = new Set();

    // attach
    this.canvas.addEventListener("pointerdown", this._bound.pointerdown, { passive: true });
    this.canvas.addEventListener("pointermove", this._bound.pointermove, { passive: true });
    this.canvas.addEventListener("pointerup", this._bound.pointerup, { passive: true });

    this.win.addEventListener("keydown", this._bound.keydown);
    this.win.addEventListener("keyup", this._bound.keyup);
    this.win.addEventListener("resize", this._bound.resize);
  }

  /**
   * Subscribe to an event.
   * @param {"pointerdown"|"pointermove"|"pointerup"|"keydown"|"keyup"|"resize"} type
   * @param {(evt:any)=>void} fn
   */
  on(type, fn) {
    if (!this._handlers[type]) return () => {};
    this._handlers[type].push(fn);
    return () => this.off(type, fn);
  }

  /**
   * Unsubscribe.
   * @param {string} type
   * @param {(evt:any)=>void} fn
   */
  off(type, fn) {
    const arr = this._handlers[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  /** Remove all listeners (useful if you ever rebuild app) */
  destroy() {
    this.canvas.removeEventListener("pointerdown", this._bound.pointerdown);
    this.canvas.removeEventListener("pointermove", this._bound.pointermove);
    this.canvas.removeEventListener("pointerup", this._bound.pointerup);

    this.win.removeEventListener("keydown", this._bound.keydown);
    this.win.removeEventListener("keyup", this._bound.keyup);
    this.win.removeEventListener("resize", this._bound.resize);

    Object.keys(this._handlers).forEach(k => (this._handlers[k] = []));
    this.keys.clear();
  }

  /** @private */
  _emit(type, evt) {
    const arr = this._handlers[type];
    if (!arr || !arr.length) return;
    for (const fn of arr) {
      try { fn(evt); } catch (e) { console.error(e); }
    }
  }

  /** @private */
  _isHelpOpen() {
    // mirror your app.js rule: if help modal is open, block interactions
    if (!this.helpModal) return false;
    return !this.helpModal.classList.contains("hidden");
  }

  /** @private */
  _onPointerDown(e) {
    if (this._isHelpOpen()) return;

    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;
    this.pointer.isDown = true;
    this.pointer.button = e.button;
    this.pointer.pointerId = e.pointerId;

    this._emit("pointerdown", {
      type: "pointerdown",
      originalEvent: e,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      pointerId: e.pointerId
    });
  }

  /** @private */
  _onPointerMove(e) {
    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;

    this._emit("pointermove", {
      type: "pointermove",
      originalEvent: e,
      clientX: e.clientX,
      clientY: e.clientY,
      isDown: this.pointer.isDown,
      pointerId: e.pointerId
    });
  }

  /** @private */
  _onPointerUp(e) {
    this.pointer.clientX = e.clientX;
    this.pointer.clientY = e.clientY;
    this.pointer.isDown = false;

    this._emit("pointerup", {
      type: "pointerup",
      originalEvent: e,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      pointerId: e.pointerId
    });
  }

  /** @private */
  _onKeyDown(e) {
    // keep Escape always deliverable (even when help is open)
    const k = String(e.key || "");
    const keyLower = k.toLowerCase();

    this.keys.add(k);
    this.keys.add(keyLower);

    this._emit("keydown", {
      type: "keydown",
      originalEvent: e,
      key: k,
      keyLower,
      code: e.code,
      ctrlKey: !!e.ctrlKey,
      metaKey: !!e.metaKey,
      shiftKey: !!e.shiftKey,
      altKey: !!e.altKey
    });
  }

  /** @private */
  _onKeyUp(e) {
    const k = String(e.key || "");
    const keyLower = k.toLowerCase();
    this.keys.delete(k);
    this.keys.delete(keyLower);

    this._emit("keyup", {
      type: "keyup",
      originalEvent: e,
      key: k,
      keyLower,
      code: e.code,
      ctrlKey: !!e.ctrlKey,
      metaKey: !!e.metaKey,
      shiftKey: !!e.shiftKey,
      altKey: !!e.altKey
    });
  }
}
