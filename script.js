import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

// SETUP
const canvas = document.getElementById("scene");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(4, 4, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// CONTROLS
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// LIGHTS
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// FLOOR
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// MATERIAL
const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });

// CHARACTER GROUP
const character = new THREE.Group();
scene.add(character);

// TORSO
const torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.6), mat);
character.add(torso);

// HEAD
const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat);
head.position.y = 1.1;
torso.add(head);

// ARM
function createArm(x) {
  const shoulder = new THREE.Group();
  shoulder.position.set(x, 0.6, 0);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), mat);
  upper.position.y = -0.4;
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.8;
  upper.add(elbow);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), mat);
  lower.position.y = -0.35;
  elbow.add(lower);

  return shoulder;
}

torso.add(createArm(-0.65));
torso.add(createArm(0.65));

// LEGS
function createLeg(x) {
  const hip = new THREE.Group();
  hip.position.set(x, -0.75, 0);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), mat);
  upper.position.y = -0.45;
  hip.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -0.9;
  upper.add(knee);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.35), mat);
  lower.position.y = -0.4;
  knee.add(lower);

  return hip;
}

torso.add(createLeg(-0.3));
torso.add(createLeg(0.3));

// INTERACTION
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selected = null;

window.addEventListener("mousedown", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(character.children, true);
  if (hits.length) selected = hits[0].object.parent;
});

window.addEventListener("mousemove", (e) => {
  if (selected) selected.rotation.z += e.movementX * 0.005;
});

window.addEventListener("mouseup", () => {
  selected = null;
});

// SAVE / LOAD
function serialize(g) {
  return {
    r: g.rotation.toArray(),
    c: g.children.map(serialize),
  };
}

function apply(g, d) {
  g.rotation.fromArray(d.r);
  g.children.forEach((c, i) => apply(c, d.c[i]));
}

document.getElementById("savePose").onclick = () => {
  const blob = new Blob([JSON.stringify(serialize(character))], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pose.json";
  a.click();
};

document.getElementById("loadPose").onclick = () =>
  document.getElementById("poseFile").click();

document.getElementById("poseFile").onchange = (e) => {
  e.target.files[0]?.text().then(t => apply(character, JSON.parse(t)));
};

// EXPORT PNG
document.getElementById("exportImage").onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/png");
  a.download = "pose.png";
  a.click();
};

// RESIZE
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// LOOP
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
