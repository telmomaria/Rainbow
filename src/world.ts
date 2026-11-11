import * as THREE from 'three';
import type { City } from './cities';

/** Axis-aligned obstacle on the XZ plane (used for simple circle-vs-box collision). */
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something the player can walk up to and use. No UI marks it — discovery is by touching it. */
export interface Interactable {
  object: THREE.Object3D;
  /** World position the character walks to before interacting. */
  position: THREE.Vector3;
  /** How close (metres) the character must be for the interaction to fire. */
  radius: number;
  interact(): void;
}

export interface World {
  ground: THREE.Mesh;
  obstacles: Obstacle[];
  interactables: Interactable[];
  update(dt: number): void;
}

/**
 * Placeholder world: a park with coloured blocks standing in for buildings.
 * It gets replaced by the OSM-generated city in the next milestone.
 */
export function createWorld(scene: THREE.Scene, city: City): World {
  scene.background = new THREE.Color(city.sky);
  scene.fog = new THREE.Fog(city.sky, 60, 160);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x7fbf6a, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 60;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 150 });
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: city.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  // A cross of streets so walking has a sense of direction.
  const roadMat = new THREE.MeshStandardMaterial({ color: city.road });
  for (const [w, d] of [[300, 8], [8, 300]] as const) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);
  }

  const obstacles: Obstacle[] = [];
  const rng = mulberry32(city.seed);
  for (let i = 0; i < 40; i++) {
    const w = 4 + rng() * 6;
    const d = 4 + rng() * 6;
    const h = 3 + rng() * 10;
    let x = (rng() - 0.5) * 140;
    let z = (rng() - 0.5) * 140;
    // keep the streets and the spawn area clear
    if (Math.abs(x) < 10 + w / 2) x += Math.sign(x || 1) * 14;
    if (Math.abs(z) < 10 + d / 2) z += Math.sign(z || 1) * 14;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: city.buildings[i % city.buildings.length] }),
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  const interactables: Interactable[] = [createLamp(scene, new THREE.Vector3(6, 0, -8), obstacles)];

  return { ground, obstacles, interactables, update: () => {} };
}

/** Street lamp with a button on its post: touch it and the light switches on/off. */
function createLamp(scene: THREE.Scene, at: THREE.Vector3, obstacles: Obstacle[]): Interactable {
  const group = new THREE.Group();
  group.position.copy(at);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 4, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4e69 }),
  );
  post.position.y = 2;
  post.castShadow = true;
  group.add(post);

  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0x000000 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), bulbMat);
  bulb.position.y = 4.2;
  group.add(bulb);

  const button = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.25, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xff4d6d }),
  );
  button.position.set(0, 1.1, 0.16);
  group.add(button);

  const light = new THREE.PointLight(0xffd36e, 0, 14, 1.5);
  light.position.y = 4.2;
  group.add(light);

  scene.add(group);
  obstacles.push({ minX: at.x - 0.2, maxX: at.x + 0.2, minZ: at.z - 0.2, maxZ: at.z + 0.2 });

  let on = false;
  return {
    object: group,
    position: at.clone(),
    radius: 1.6,
    interact() {
      on = !on;
      light.intensity = on ? 25 : 0;
      bulbMat.emissive.setHex(on ? 0xffc94d : 0x000000);
      button.position.z = on ? 0.12 : 0.16; // button visibly pressed in
    },
  };
}

/** Small deterministic PRNG so the placeholder layout is stable between reloads. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
