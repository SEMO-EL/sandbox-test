const canvas = document.getElementById("scene");

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// CAMERA
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(4, 4, 6);

// RENDERER
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

// CONTROLS
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// LIGHTS
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const light = new THREE.DirectionalLight(0xffffff, 0.6);
light.position.set(5, 10, 5);
scene.add(light);

// FLOOR
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// MATERIAL
const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });

// CHARACTER
const character = new THREE.Group();
scene.add(character);

// TORSO
const torso = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1.5, 0.6),
  mat
);
character.add(torso);

// HEAD
const head = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  mat
);
head.position.y = 1.1;
torso.add(head);

// ARM
function createArm(x) {
  const shoulder = new THREE.Group();
  shoulder.position.set(x, 0.6, 0);

  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.8, 0.3),
    mat
  );
  upper.position.y = -0.4;
  shoulder.add(upper);

  return shoulder;
}

torso.add(createArm(-0.65));
torso.add(createArm(0.65));

// RAYCAST ROTATION
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selected = null;

window.addEventListener("mousedown", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects(character.children, true);
  if (hits.length > 0) {
    selected = hits[0].object.parent;
  }
});

window.addEventListener("mousemove", (e) => {
  if (!selected) return;
  selected.rotation.z += e.movementX * 0.005;
});

window.addEventListener("mouseup", () => {
  selected = null;
});

// SAVE / LOAD POSE
function serialize(group) {
  return {
    r: group.rotation.toArray(),
    c: group.children.map(serialize),
  };
}

function apply(group, data) {
  group.rotation.fromArray(data.r);
  group.children.forEach((child, i) => {
    apply(child, data.c[i]);
  });
}

document.getElementById("savePose").onclick = () => {
  const data = serialize(character);
  const blob = new Blob([JSON.stringify(data)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pose.json";
  a.click();
};

document.getElementById("loadPose").onclick = () => {
  document.getElementById("poseFile").click();
};

document.getElementById("poseFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  file.text().then((text) => {
    apply(character, JSON.parse(text));
  });
};

// EXPORT IMAGE
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
