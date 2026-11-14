import * as THREE from 'three';
import type { City } from './cities';
import { AIRPORT_ZONE } from './airport';

/** Axis-aligned obstacle on the XZ plane (used for simple circle-vs-box collision). */
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height (m) of a low obstacle (fence, crowd, stage): the camera may pass above it. Omitted = tall. */
  height?: number;
}

/** Something the player can walk up to and use. No UI marks it — discovery is by touching it. */
export interface Interactable {
  object: THREE.Object3D;
  /** World position the character walks to before interacting. */
  position: THREE.Vector3;
  /** How close (metres) the character must be for the interaction to fire. */
  radius: number;
  /** Fired once each time the character comes within radius (edge-triggered). */
  /** Return false to refuse (e.g. she can't pay): a seat is then not taken. */
  interact(ctx: InteractCtx): void | boolean;
  /** Optional per-frame animation. */
  update?(dt: number): void;
  /** Shops etc.: don't fire on mere contact — only when the child clicks/taps it (or presses Enter next to it). */
  requiresClick?: boolean;
  /** Swing: tapping it seats her on it (see props.ts SwingSeat). */
  seat?: import('./props').SwingSeat;
  /** Tapping it from up to this far away uses it straight away (loungers: she walks/lies down directly). */
  reach?: number;
}

export interface InteractCtx {
  /** Character position (read-only use). */
  player: THREE.Vector3;
}

/**
 * Street grid of the placeholder world. Roads are straight, 8 m wide, two lanes (±2 m from the centre line),
 * running the whole map (±150). Vertical roads at x ∈ xs, horizontal at z ∈ zs. Kept clear of the airport.
 */
export const ROADS = { width: 8, xs: [-80, 0], zs: [-70, 0, 75], extent: 150 } as const;

/** Start point of every city: on the pavement (not on the road), facing +X towards the airport. */
export const SPAWN = { x: 7, z: 7, h: -Math.PI / 2 } as const;

/** True if (x, z) is on a road surface, with an optional margin (m). */
export function onRoad(x: number, z: number, margin = 0): boolean {
  const half = ROADS.width / 2 + margin;
  return ROADS.xs.some((rx) => Math.abs(x - rx) < half) || ROADS.zs.some((rz) => Math.abs(z - rz) < half);
}

export interface World {
  ground: THREE.Mesh;
  /** Scene lights (the weather system adjusts them). */
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  obstacles: Obstacle[];
  interactables: Interactable[];
  update(dt: number): void;
  /** Placeholder buildings' obstacle boxes (so a big venue may clear room when the city is too crowded). */
  buildings: Set<Obstacle>;
  /** Remove every placeholder building overlapping `area` (plus margin m): meshes and obstacles. */
  clearArea(area: Obstacle, margin: number): void;
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

  // Street grid (see ROADS) with dashed centre lines.
  const roadMat = new THREE.MeshStandardMaterial({ color: city.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const L = ROADS.extent * 2;
  const addRoad = (vertical: boolean, at: number) => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? ROADS.width : L, vertical ? L : ROADS.width), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(vertical ? at : 0, 0.01, vertical ? 0 : at);
    road.receiveShadow = true;
    scene.add(road);
    for (let t = -ROADS.extent + 3; t < ROADS.extent; t += 8) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.25 : 3, vertical ? 3 : 0.25), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(vertical ? at : t, 0.015, vertical ? t : at);
      scene.add(dash);
    }
  };
  for (const x of ROADS.xs) addRoad(true, x);
  for (const z of ROADS.zs) addRoad(false, z);

  const obstacles: Obstacle[] = [];
  const buildingMeshes = new Map<Obstacle, THREE.Mesh>();
  const rng = mulberry32(city.seed);
  for (let i = 0; i < 70; i++) {
    const w = 4 + rng() * 6;
    const d = 4 + rng() * 6;
    const h = 3 + rng() * 10;
    const x = (rng() - 0.5) * 270;
    const z = (rng() - 0.5) * 270;
    // keep the streets (+ pavement), the spawn area and the airport clear
    const corners = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]];
    const hitsRoad =
      ROADS.xs.some((rx) => x + w / 2 > rx - 6 && x - w / 2 < rx + 6) || ROADS.zs.some((rz) => z + d / 2 > rz - 6 && z - d / 2 < rz + 6);
    if (hitsRoad || corners.some(([cx, cz]) => Math.hypot(cx - SPAWN.x, cz - SPAWN.z) < 9)) continue;
    const z0 = AIRPORT_ZONE;
    if (x + w / 2 > z0.minX && x - w / 2 < z0.maxX && z + d / 2 > z0.minZ && z - d / 2 < z0.maxZ) continue; // airport
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: city.buildings[i % city.buildings.length] }),
    );
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const ob = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    obstacles.push(ob);
    buildingMeshes.set(ob, mesh);
  }

  // fluffy clouds high up (seen when flying between cities)
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const puff = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < 30; i++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(puff, cloudMat);
      s.scale.setScalar(3 + rng() * 3);
      s.position.set((k - 2) * 3.2, rng() * 1.5, (rng() - 0.5) * 3);
      cloud.add(s);
    }
    cloud.position.set((rng() - 0.5) * 300, 42 + rng() * 6, (rng() - 0.5) * 300);
    scene.add(cloud);
  }

  const interactables: Interactable[] = [createLamp(scene, new THREE.Vector3(6, 0, -8), obstacles)];

  const buildings = new Set(buildingMeshes.keys());
  const clearArea = (a: Obstacle, m: number): void => {
    for (const [ob, mesh] of buildingMeshes) {
      if (ob.maxX + m > a.minX && ob.minX - m < a.maxX && ob.maxZ + m > a.minZ && ob.minZ - m < a.maxZ) {
        scene.remove(mesh);
        const i = obstacles.indexOf(ob);
        if (i >= 0) obstacles.splice(i, 1);
        buildingMeshes.delete(ob);
        buildings.delete(ob);
      }
    }
  };
  return { ground, hemi, sun, obstacles, interactables, update: () => {}, buildings, clearArea };
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
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
