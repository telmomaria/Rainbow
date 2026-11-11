import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { ROADS, SPAWN, type Obstacle } from './world';

/**
 * The town hospital: white building with red crosses, an entrance, an ambulance parked in front and an
 * open-air ward on its side (bed, drip stand, big friendly wall clock) that the camera can look into.
 * No text anywhere — the clock is a pie that fills up as `setClock(0..1)` goes from 0 to 1.
 */
export interface Hospital {
  group: THREE.Group;
  /** Where the character's root (feet origin) goes when lying in bed: mattress top, at the foot end.
   *  `heading` points from the foot end to the pillow (character convention: 0 = facing -Z). */
  bed: { pos: THREE.Vector3; heading: number };
  /** Free spot outside the entrance where she reappears. */
  exit: THREE.Vector3;
  ambulance: THREE.Group;
  /** 0..1: the clock's pie fills and its hand sweeps one full turn. */
  setClock(fraction: number): void;
  setAmbulanceLights(on: boolean): void;
}

/* Layout in local space: local +Z faces the road, x runs along it.
   Main block x[-8,4] z[-5,5] · ward x[4,11.3] z[-5,3.5] · ambulance around (-5, 8.3) · road centre at z = 15. */
const SETBACK = 15;
const MAIN = { minX: -8, maxX: 4, minZ: -5, maxZ: 5, h: 7.5 };
const WARD = { minX: 4, maxX: 11.3, minZ: -5, maxZ: 3.5, h: 3.6 };
const AMB = { x: -5, z: 8.3, hl: 2.6, hw: 1.1 };
const ENTRANCE_X = -1;
const BED = { x: 7.6, z: -3.2, len: 2.5, wid: 1.2, top: 0.72 };
const CLOCK = { x: 7.6, y: 2.25, z: -4.55, r: 1.15 };
const PIE_SEGMENTS = 64;

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
    mats.set(key, m);
  }
  return m;
}

function box(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A red cross on a white plate; built in the XY plane, facing +Z. */
function cross(parent: THREE.Object3D, size: number, x: number, y: number, z: number, plate = true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const red = mat(0xe63946, { roughness: 0.45 });
  if (plate) box(g, mat(0xffffff), size * 1.25, size * 1.25, 0.08, 0, 0, 0);
  box(g, red, size, size * 0.32, 0.14, 0, 0, 0.04);
  box(g, red, size * 0.32, size, 0.14, 0, 0, 0.04);
  parent.add(g);
  return g;
}

/** Local (x, z) → world, for a rotation that is a multiple of 90°. */
function toWorld(ox: number, oz: number, rot: number, x: number, z: number): { x: number; z: number } {
  const c = Math.round(Math.cos(rot));
  const s = Math.round(Math.sin(rot));
  return { x: ox + x * c + z * s, z: oz - x * s + z * c };
}

function worldBox(ox: number, oz: number, rot: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }, pad = 0): Obstacle {
  const a = toWorld(ox, oz, rot, b.minX - pad, b.minZ - pad);
  const c = toWorld(ox, oz, rot, b.maxX + pad, b.maxZ + pad);
  return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z) };
}

const overlaps = (a: Obstacle, b: Obstacle): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/** Find a free plot beside a road, 50–120 m from the spawn, away from the airport and anything built. */
function choosePlot(obstacles: Obstacle[], rng: () => number): { x: number; z: number; rot: number } {
  const plot = { minX: MAIN.minX, maxX: WARD.maxX, minZ: MAIN.minZ, maxZ: AMB.z + AMB.hw };
  const found: { x: number; z: number; rot: number }[] = [];
  const half = ROADS.width / 2;
  const roads: Obstacle[] = [
    ...ROADS.xs.map((x) => ({ minX: x - half, maxX: x + half, minZ: -999, maxZ: 999 })),
    ...ROADS.zs.map((z) => ({ minX: -999, maxX: 999, minZ: z - half, maxZ: z + half })),
  ];
  const tryAt = (x: number, z: number, rot: number): void => {
    const fp = worldBox(x, z, rot, plot, 1.5);
    const centre = toWorld(x, z, rot, 1.6, 0);
    const d = Math.hypot(centre.x - SPAWN.x, centre.z - SPAWN.z);
    if (d < 55 || d > 115) return;
    if (Math.max(Math.abs(fp.minX), Math.abs(fp.maxX), Math.abs(fp.minZ), Math.abs(fp.maxZ)) > ROADS.extent - 15) return;
    if (overlaps(fp, AIRPORT_ZONE) || roads.some((r) => overlaps(fp, r)) || obstacles.some((o) => overlaps(fp, o))) return;
    found.push({ x, z, rot });
  };
  for (let t = -ROADS.extent + 20; t <= ROADS.extent - 20; t += 3) {
    for (const side of [-1, 1]) {
      // horizontal roads: building north (side -1, faces +Z, rot 0) or south (faces -Z, rot π)
      for (const rz of ROADS.zs) tryAt(t, rz + side * SETBACK, side < 0 ? 0 : Math.PI);
      // vertical roads: building west/east, local +Z pointing at the road
      for (const rx of ROADS.xs) tryAt(rx + side * SETBACK, t, -side * (Math.PI / 2));
    }
  }
  if (found.length) return found[Math.floor(rng() * found.length)];
  return { x: -40, z: -SETBACK, rot: 0 }; // fallback: beside the z = 0 road, west of the spawn
}

export function createHospital(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): Hospital {
  const at = choosePlot(obstacles, rng);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = at.rot;
  scene.add(group);

  const white = mat(0xfbfbf8);
  const trim = mat(0xdfe7ef);
  const red = mat(0xe63946, { roughness: 0.45 });
  const glass = mat(0x9fdcff, { roughness: 0.1, metalness: 0.3 });
  const floorMat = mat(0xcfe8d8);

  /* ---- main block ---- */
  const mw = MAIN.maxX - MAIN.minX;
  const md = MAIN.maxZ - MAIN.minZ;
  const mcx = (MAIN.minX + MAIN.maxX) / 2;
  box(group, white, mw, MAIN.h, md, mcx, MAIN.h / 2, 0);
  box(group, trim, mw + 0.4, 0.4, md + 0.4, mcx, MAIN.h + 0.2, 0); // roof edge
  box(group, red, mw + 0.05, 0.35, md + 0.05, mcx, 3.6, 0); // red band between floors
  // windows: two rows on the front
  for (const wy of [2.0, 5.4]) {
    for (const wx of [-6.5, -4.4, 2.4]) box(group, glass, 1.4, 1.3, 0.1, wx, wy, MAIN.maxZ + 0.02);
  }
  for (const wx of [ENTRANCE_X - 1.2, ENTRANCE_X + 1.2]) box(group, glass, 1.4, 1.3, 0.1, wx, 5.4, MAIN.maxZ + 0.02);
  // side windows (west)
  for (const wz of [-2.5, 2.5]) for (const wy of [2.0, 5.4]) box(group, glass, 0.1, 1.3, 1.6, MAIN.minX - 0.02, wy, wz);
  // entrance: glass doors, canopy on posts, step
  box(group, glass, 2.6, 2.6, 0.12, ENTRANCE_X, 1.3, MAIN.maxZ + 0.04);
  box(group, trim, 0.12, 2.6, 0.14, ENTRANCE_X, 1.3, MAIN.maxZ + 0.08); // door split
  box(group, white, 4.2, 0.25, 2.6, ENTRANCE_X, 3.0, MAIN.maxZ + 1.3);
  box(group, red, 4.25, 0.12, 2.65, ENTRANCE_X, 2.85, MAIN.maxZ + 1.3);
  for (const px of [-1.9, 1.9]) box(group, trim, 0.18, 2.9, 0.18, ENTRANCE_X + px, 1.45, MAIN.maxZ + 2.45);
  box(group, mat(0xb8c0c8), 4.4, 0.12, 2.8, ENTRANCE_X, 0.06, MAIN.maxZ + 1.4);
  // red crosses: above the entrance, on the roof sign (both faces) and on the west side
  cross(group, 1.6, ENTRANCE_X, 5.4, MAIN.maxZ + 0.06).visible = false; // (window there instead — keep facade calm)
  cross(group, 2.2, mcx - 2.5, 4.6 + 0.0, MAIN.maxZ + 0.06);
  const sign = new THREE.Group();
  sign.position.set(mcx, MAIN.h + 1.9, 0);
  group.add(sign);
  box(sign, white, 3.4, 3.4, 0.3, 0, 0, 0);
  cross(sign, 2.6, 0, 0, 0.16, false);
  const back = cross(sign, 2.6, 0, 0, -0.16, false);
  back.rotation.y = Math.PI;
  box(sign, trim, 0.3, 0.6, 0.3, 0, -1.9, 0);
  const west = cross(group, 2.4, MAIN.minX - 0.06, 4.6, 0);
  west.rotation.y = -Math.PI / 2;

  /* ---- open ward on the east side ---- */
  const ww = WARD.maxX - WARD.minX;
  const wd = WARD.maxZ - WARD.minZ;
  const wcx = (WARD.minX + WARD.maxX) / 2;
  const wcz = (WARD.minZ + WARD.maxZ) / 2;
  const floor = box(group, floorMat, ww, 0.18, wd, wcx, 0.09, wcz);
  floor.castShadow = false;
  box(group, mat(0xfff4e0), ww, WARD.h, 0.3, wcx, WARD.h / 2, WARD.minZ + 0.15); // back wall (warm)
  box(group, white, ww + 0.3, 0.3, wd + 0.3, wcx + 0.15, WARD.h + 0.15, wcz); // roof
  box(group, red, ww + 0.35, 0.14, wd + 0.35, wcx + 0.15, WARD.h - 0.02, wcz); // red trim under the roof
  box(group, trim, 0.25, WARD.h, 0.25, WARD.maxX, WARD.h / 2, WARD.maxZ); // corner post
  box(group, trim, 0.25, WARD.h, 0.25, WARD.maxX, WARD.h / 2, WARD.minZ + 0.3);
  // a low planter rail along the open side so it reads as a terrace
  box(group, mat(0x8ac926), 0.4, 0.5, wd - 1.2, WARD.maxX - 0.1, 0.4, wcz + 0.2);

  // bed (head towards +X), against the back wall
  const bedG = new THREE.Group();
  bedG.position.set(BED.x, 0, BED.z);
  group.add(bedG);
  const metal = mat(0xb0bec5, { metalness: 0.4, roughness: 0.4 });
  box(bedG, metal, BED.len, 0.12, BED.wid, 0, 0.5, 0); // frame
  box(bedG, mat(0xffffff), BED.len - 0.1, 0.16, BED.wid - 0.1, 0, BED.top - 0.08, 0); // mattress
  box(bedG, mat(0x7ec8e3), BED.len * 0.55, 0.06, BED.wid - 0.04, -BED.len * 0.2, BED.top + 0.01, 0); // blanket
  box(bedG, mat(0xfff8e7), 0.45, 0.14, 0.75, BED.len / 2 - 0.35, BED.top + 0.06, 0); // pillow
  box(bedG, metal, 0.08, 1.0, BED.wid, BED.len / 2, 0.75, 0); // headboard
  box(bedG, metal, 0.08, 0.7, BED.wid, -BED.len / 2, 0.6, 0); // footboard
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(bedG, metal, 0.08, 0.45, 0.08, lx * (BED.len / 2 - 0.1), 0.25, lz * (BED.wid / 2 - 0.1));
  }

  // drip stand at the head of the bed, on the open side
  const drip = new THREE.Group();
  drip.position.set(BED.x + BED.len / 2 + 0.45, 0, BED.z + BED.wid / 2 + 0.2);
  group.add(drip);
  box(drip, metal, 0.05, 1.9, 0.05, 0, 1.0, 0);
  box(drip, metal, 0.6, 0.05, 0.06, 0, 0.08, 0);
  box(drip, metal, 0.06, 0.05, 0.6, 0, 0.08, 0);
  box(drip, metal, 0.5, 0.04, 0.04, 0, 1.92, 0);
  box(drip, mat(0xbde0fe, { transparent: true, opacity: 0.85 }), 0.22, 0.34, 0.08, 0.2, 1.68, 0);
  box(drip, mat(0xbde0fe), 0.02, 0.6, 0.02, 0.2, 1.2, 0);

  // a cheerful bedside table with a flower
  box(group, mat(0xffb4a2), 0.5, 0.55, 0.5, BED.x - BED.len / 2 - 0.5, 0.28, BED.z - 0.2);
  box(group, mat(0xff006e), 0.18, 0.18, 0.18, BED.x - BED.len / 2 - 0.5, 0.68, BED.z - 0.2);

  /* ---- big friendly clock (pie fills up, hand sweeps) ---- */
  const clock = new THREE.Group();
  clock.position.set(CLOCK.x, CLOCK.y, CLOCK.z);
  group.add(clock);
  const rimGeo = new THREE.CylinderGeometry(CLOCK.r + 0.18, CLOCK.r + 0.18, 0.16, 48);
  rimGeo.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, mat(0x4cc9f0, { roughness: 0.4 }));
  rim.castShadow = true;
  clock.add(rim);
  const faceGeo = new THREE.CircleGeometry(CLOCK.r, 48);
  const face = new THREE.Mesh(faceGeo, mat(0xffffff, { roughness: 0.8 }));
  face.position.z = 0.085;
  clock.add(face);
  // the pie: triangles ordered clockwise from 12 o'clock, revealed with drawRange
  const pos: number[] = [];
  const pr = CLOCK.r * 0.92;
  for (let i = 0; i < PIE_SEGMENTS; i++) {
    const a0 = Math.PI / 2 - (i / PIE_SEGMENTS) * Math.PI * 2;
    const a1 = Math.PI / 2 - ((i + 1) / PIE_SEGMENTS) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a1) * pr, Math.sin(a1) * pr, 0, Math.cos(a0) * pr, Math.sin(a0) * pr, 0);
  }
  const pieGeo = new THREE.BufferGeometry();
  pieGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pieGeo.computeVertexNormals();
  pieGeo.setDrawRange(0, 0);
  const pie = new THREE.Mesh(pieGeo, mat(0xffbe0b, { roughness: 0.6, emissive: 0x332200 }));
  pie.position.z = 0.095;
  clock.add(pie);
  // 12 friendly dots (no numbers), the 12 o'clock one bigger and red: "start / finish"
  const dotGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 12; i++) {
    const a = Math.PI / 2 - (i / 12) * Math.PI * 2;
    const dot = new THREE.Mesh(dotGeo, i === 0 ? red : mat(0x3a86ff));
    dot.scale.set(i === 0 ? 0.13 : 0.08, i === 0 ? 0.13 : 0.08, 0.04);
    dot.position.set(Math.cos(a) * CLOCK.r * 0.98, Math.sin(a) * CLOCK.r * 0.98, 0.12);
    clock.add(dot);
  }
  const hand = new THREE.Group();
  hand.position.z = 0.13;
  clock.add(hand);
  const handMesh = box(hand, mat(0x22223b), 0.12, CLOCK.r * 0.88, 0.04, 0, (CLOCK.r * 0.88) / 2, 0);
  handMesh.castShadow = false;
  const cap = new THREE.Mesh(dotGeo, mat(0xe63946));
  cap.scale.set(0.14, 0.14, 0.06);
  cap.position.z = 0.16;
  clock.add(cap);

  /* ---- ambulance ---- */
  const ambulance = new THREE.Group();
  ambulance.position.set(AMB.x, 0, AMB.z);
  ambulance.rotation.y = Math.PI / 2; // nose towards -X (along the road)
  group.add(ambulance);
  const ambWhite = mat(0xffffff, { roughness: 0.35 });
  box(ambulance, ambWhite, AMB.hw * 2, 2.0, AMB.hl * 2 - 1.1, 0, 1.55, 0.55); // box body
  box(ambulance, ambWhite, AMB.hw * 2, 1.0, 1.2, 0, 1.0, -AMB.hl + 0.6); // bonnet
  box(ambulance, ambWhite, AMB.hw * 2 - 0.1, 0.9, 0.9, 0, 1.75, -AMB.hl + 1.45); // cab
  box(ambulance, glass, AMB.hw * 2 - 0.3, 0.6, 0.06, 0, 1.85, -AMB.hl + 1.0); // windscreen
  box(ambulance, glass, AMB.hw * 2 + 0.04, 0.5, 0.7, 0, 1.85, -AMB.hl + 1.45); // cab side windows
  box(ambulance, red, AMB.hw * 2 + 0.04, 0.28, AMB.hl * 2 - 0.4, 0, 1.15, 0.2); // red stripe
  box(ambulance, mat(0xffd60a), AMB.hw * 2 + 0.05, 0.1, AMB.hl * 2 - 0.4, 0, 0.95, 0.2); // yellow pinstripe
  for (const side of [-1, 1]) {
    const c = cross(ambulance, 0.8, side * (AMB.hw + 0.03), 2.0, 1.0, false);
    c.rotation.y = side * (Math.PI / 2);
  }
  const rearCross = cross(ambulance, 0.7, 0, 1.9, AMB.hl + 0.03, false);
  rearCross.rotation.y = 0;
  // blue roof lights
  const blueOff = mat(0x1d3557, { emissive: 0x000000 });
  const blueOn = mat(0x4895ef, { emissive: 0x3a86ff, emissiveIntensity: 2.2 });
  const beacons: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const b = box(ambulance, blueOff, 0.5, 0.22, 0.3, side * 0.45, 2.33, -AMB.hl + 1.45);
    beacons.push(b);
  }
  box(ambulance, mat(0x222831), 1.6, 0.06, 0.3, 0, 2.21, -AMB.hl + 1.45);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyre = mat(0x222831, { roughness: 0.8 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(sx * (AMB.hw - 0.1), 0.42, sz * (AMB.hl - 0.85));
    w.castShadow = true;
    ambulance.add(w);
  }
  let lightsOn = false;
  // flashing is driven by the render loop itself, so it needs no update() call
  beacons[0].onBeforeRender = () => {
    if (!lightsOn) return;
    const phase = Math.floor(performance.now() / 180) % 2;
    beacons[0].material = phase === 0 ? blueOn : blueOff;
    beacons[1].material = phase === 0 ? blueOff : blueOn;
  };

  /* ---- obstacles ---- */
  obstacles.push(worldBox(at.x, at.z, at.rot, MAIN));
  obstacles.push(worldBox(at.x, at.z, at.rot, WARD));
  obstacles.push(worldBox(at.x, at.z, at.rot, { minX: AMB.x - AMB.hl, maxX: AMB.x + AMB.hl, minZ: AMB.z - AMB.hw, maxZ: AMB.z + AMB.hw }));

  /* ---- API points ---- */
  group.updateMatrixWorld(true);
  const footLocal = new THREE.Vector3(BED.x - BED.len / 2 + 0.25, BED.top, BED.z);
  const bedPos = group.localToWorld(footLocal.clone());
  // local +X (towards the pillow) is heading -π/2 in local space; add the group's rotation
  const bedHeading = -Math.PI / 2 + at.rot;
  const exitW = toWorld(at.x, at.z, at.rot, ENTRANCE_X, MAIN.maxZ + 3.4);

  return {
    group,
    bed: { pos: bedPos, heading: bedHeading },
    exit: new THREE.Vector3(exitW.x, 0, exitW.z),
    ambulance,
    setClock(fraction: number) {
      const f = THREE.MathUtils.clamp(fraction, 0, 1);
      pieGeo.setDrawRange(0, Math.round(f * PIE_SEGMENTS) * 3);
      hand.rotation.z = -f * Math.PI * 2;
    },
    setAmbulanceLights(on: boolean) {
      lightsOn = on;
      if (!on) for (const b of beacons) b.material = blueOff;
    },
  };
}
