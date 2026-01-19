// engine/loop.js
// Small render loop utility with optional FPS smoothing hook.
// Keeps your app.js logic but makes it reusable.

export function createLoop({
  orbit,                 // OrbitControls-like (has update())
  renderer,              // THREE.WebGLRenderer
  scene,                 // THREE.Scene
  camera,                // THREE.Camera
  getSelected,           // ()=>THREE.Object3D|null
  getShowOutline,        // ()=>boolean
  outline,               // THREE.BoxHelper (or null)
  perf = { enabled: () => false, onFps: () => {} } // optional
} = {}) {
  if (!renderer || !scene || !camera) {
    throw new Error("createLoop: renderer/scene/camera are required");
  }

  let raf = 0;
  let running = false;

  let lastFrameTime = performance.now();
  let fpsSmoothed = 60;

  function frame() {
    if (!running) return;

    raf = requestAnimationFrame(frame);

    // Controls update
    try { orbit?.update?.(); } catch {}

    // Render
    renderer.render(scene, camera);

    // Outline refresh (mirrors your app.js behavior)
    const selected = getSelected ? getSelected() : null;
    const showOutline = getShowOutline ? !!getShowOutline() : false;

    if (outline && selected && showOutline) {
      try { outline.setFromObject(selected); } catch {}
    }

    // FPS smoothing (same logic as your file)
    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    const fps = 1000 / Math.max(1, dt);
    fpsSmoothed = fpsSmoothed * 0.92 + fps * 0.08;

    // Optional perf hook (so you can toast in the main file)
    try {
      if (perf?.enabled?.()) perf.onFps?.(fpsSmoothed, fps, dt);
    } catch {}
  }

  function start() {
    if (running) return;
    running = true;
    lastFrameTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function isRunning() {
    return running;
  }

  function getFpsSmoothed() {
    return fpsSmoothed;
  }

  return { start, stop, isRunning, getFpsSmoothed };
}
