import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import { buildBeachLife } from './beachlife';
import type { GameCtx } from './gamectx';
import { gemMesh, mat } from './places';
import { inNoSpawn } from './spawn';
import { buildFolk } from './venue';
import { ROADS, SPAWN, type Interactable, type Obstacle, type World } from './world';

/**
 * Rio de Janeiro — Pão de Açúcar + bondinho (teleférico) + Cristo Redentor no Corcovado.
 *
 * Pão de Açúcar (plot facing the nearest road, front = +Z local):
 *  - Morro da Urca: lower, wide, rounded, green (a few granite faces).
 *  - Pão de Açúcar: much taller granite «bullet» (pinkish grey with darker streaks, green band at the base),
 *    separated from the Urca by a small valley.
 *  - Bondinho: ground station (Praia Vermelha) → Urca station → summit station, two cabins on parallel tracks
 *    (one goes up while the other comes down).
 *
 * How to ride (no UI): walk into the yellow cabin waiting in the ground station (or tap it / Enter next to it).
 * Going up costs 2 coins; without them the operator shakes his head. At the top she can walk on the deck
 * (jewel on a pedestal) and tap the cabin (or Enter) to come down — walking into it up there does nothing (the deck
 * is small: she would go down by accident). Coming down is free and the tap/Enter reaches the cabin from the whole
 * deck (TOP_TAP_R), so she can never be stuck up there.
 *
 * Cristo Redentor: white-grey statue with open arms on a tall green hill (Corcovado), on another plot of the
 * map (≥ 75 m from the Pão de Açúcar), seen from much of the city. Touching the hill = the narrator names it.
 *
 * Beach (Telmo 2026-11-28): beach.ts (sand, calçadão, sea — built with the world) + beachlife.ts (people, built
 * here last, after both landmarks have picked their plots: it drops the guard that kept them off the sand).
 *
 * Lives in its own file (landmarks.ts is shared); landmarks.ts passes in its private helpers.
 */

export interface RioKit {
  diamondAt(ctx: GameCtx, key: string, at: THREE.Vector3, mesh: THREE.Object3D): Interactable;
  setDebug(d: Record<string, unknown>): void;
  /** Called on city rebuild mid-ride (drops the hold). */
  setRideDispose(fn: () => void): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ layout (Pão plot, local frame) */

/** Half sizes of the Pão de Açúcar plot. */
const PHW = 22;
const PHD = 16;
/** Morro da Urca. */
const URCA = { x: -10, z: -6, r: 9.5, h: 13.2 };
/** Pão de Açúcar (base radius; x stretched a little). */
const PAO = { x: 12, z: -7, r: 8.2, sx: 1.05 };
/** Summit deck top (feet height on the Pão). */
const TOP_Y = 27.4;
/** Walkable hole on the summit (half size, around PAO centre). */
const HOLE = 2.4;
/** Cabin floor heights at the three stations. */
const G_Y = 0.12;
const U_Y = 16.5;
/** Cable above the cabin floor. */
const CABLE_UP = 3.6;
/** Cabin size: length (along travel), width, inside height. */
const CAB_L = 2.6;
const CAB_W = 1.7;
const CAB_H = 2.9;
/** Track A (the one she rides) and B (the counterweight cabin). */
const TRACK_A = [new THREE.Vector3(-11, G_Y, 12.5), new THREE.Vector3(-11, U_Y, -7), new THREE.Vector3(10.4, TOP_Y, -8)];
const TRACK_B = [new THREE.Vector3(-9, G_Y, 12.5), new THREE.Vector3(-9, U_Y, -5), new THREE.Vector3(10.4, TOP_Y, -6)];
/** Where she stands after the ride (outside the boarding radius). */
const EXIT_GROUND = new THREE.Vector3(-11, 0, 15.7);
const EXIT_TOP = new THREE.Vector3(13.3, TOP_Y, -7.6);
const BOARD_R = 1.25;
/** On the summit: tap the cabin / Enter from anywhere on the deck (hole corners are ≤ 5.3 m from the cabin). */
const TOP_TAP_R = 6;
const PRICE = 2;
/** Seconds: leg ground→Urca, stop at Urca, leg Urca→summit. */
const LEG0 = 5.2;
const STOP = 1.4;
const LEG1 = 5.6;

/* ------------------------------------------------------------------ helpers */

const hash3 = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Low-poly mountain from a lathe profile ([radius, height] bottom → top), faceted, per-face vertex colours.
 * `jitter` = radial roughness (0..0.15); `calm` = height above which the shape is left smooth (stations sit there).
 */
function mountain(
  profile: [number, number][],
  segs: number,
  jitter: number,
  calm: number,
  colour: (y: number, ang: number, steep: number, rnd: number) => THREE.Color,
): THREE.Mesh {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y >= calm || (x === 0 && z === 0)) continue;
    // same position → same offset (the lathe seam and the apex stay closed)
    const k = 1 + (hash3(Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100) - 0.5) * 2 * jitter;
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  const pos = flat.getAttribute('position') as THREE.BufferAttribute;
  const nrm = flat.getAttribute('normal') as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const steep = 1 - Math.abs(nrm.getY(i));
    const c = colour(cy, Math.atan2(cz, cx), steep, hash3(cx, cy, cz));
    for (let v = 0; v < 3; v++) {
      cols[(i + v) * 3] = c.r;
      cols[(i + v) * 3 + 1] = c.g;
      cols[(i + v) * 3 + 2] = c.b;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const C = (hex: number, k = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(k);

function addBox(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPost(parent: THREE.Object3D, m: THREE.Material, r: number, x: number, y0: number, y1: number, z: number): void {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 8), m);
  c.position.set(x, (y0 + y1) / 2, z);
  c.castShadow = true;
  parent.add(c);
}

/** Straight steel rod between two local points. */
function rod(parent: THREE.Object3D, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
  const len = a.distanceTo(b);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), m);
  c.position.copy(a).add(b).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  parent.add(c);
}

/** Palm tree (Rio touch on the plaza). */
function palm(parent: THREE.Object3D, x: number, z: number, lean: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = lean * 7;
  parent.add(g);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 5.2, 7), mat(0x9c7a54));
  trunk.position.set(0.35, 2.6, 0);
  trunk.rotation.z = -0.13;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = mat(0x2f9e44);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4), leaf);
    l.scale.set(1, 1, 0.25);
    l.position.set(0.7 + Math.cos(a) * 1.0, 5.0, Math.sin(a) * 1.0);
    l.rotation.order = 'YXZ';
    l.rotation.y = -a;
    l.rotation.z = -Math.PI / 2 - 0.35;
    l.castShadow = true;
    g.add(l);
  }
}

const rectHitsRoad = (minX: number, maxX: number, minZ: number, maxZ: number, m: number): boolean =>
  ROADS.xs.some((rx) => maxX > rx - ROADS.width / 2 - m && minX < rx + ROADS.width / 2 + m) ||
  ROADS.zs.some((rz) => maxZ > rz - ROADS.width / 2 - m && minZ < rz + ROADS.width / 2 + m);

/**
 * Pick a plot (off roads, venues, airport, start point; only placeholder buildings may be removed).
 * `facing`: the front (+Z local) looks at the nearest road. `away`: keep the centre ≥ d from that point.
 */
function pickPlot(
  world: World,
  obstacles: Obstacle[],
  rng: () => number,
  hw: number,
  hd: number,
  o: { facing: boolean; ideal: number; away?: { x: number; z: number; d: number }; margin: number; distW?: number },
): { x: number; z: number; yaw: number } | null {
  let best: { x: number; z: number; yaw: number; score: number } | null = null;
  const lim = ROADS.extent - 10;
  const off = rng() * 4;
  for (let cx = -lim + off; cx <= lim; cx += 4) {
    for (let cz = -lim + off; cz <= lim; cz += 4) {
      if (o.away && Math.hypot(cx - o.away.x, cz - o.away.z) < o.away.d) continue;
      let gap = Infinity;
      let yaw = 0;
      if (o.facing) {
        for (const rz of ROADS.zs) {
          const d = Math.abs(rz - cz);
          if (d < gap) {
            gap = d;
            yaw = rz > cz ? 0 : Math.PI;
          }
        }
        for (const rx of ROADS.xs) {
          const d = Math.abs(rx - cx);
          if (d < gap) {
            gap = d;
            yaw = rx > cx ? Math.PI / 2 : -Math.PI / 2;
          }
        }
      }
      const side = Math.abs(Math.sin(yaw)) > 0.5;
      const ehw = side ? hd : hw;
      const ehd = side ? hw : hd;
      const minX = cx - ehw;
      const maxX = cx + ehw;
      const minZ = cz - ehd;
      const maxZ = cz + ehd;
      if (Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) > lim) continue;
      if (rectHitsRoad(minX, maxX, minZ, maxZ, 2.5)) continue;
      if (maxX + 4 > AIRPORT_ZONE.minX && minX - 4 < AIRPORT_ZONE.maxX && maxZ + 4 > AIRPORT_ZONE.minZ && minZ - 4 < AIRPORT_ZONE.maxZ) continue;
      const sx = Math.max(minX, Math.min(SPAWN.x, maxX));
      const sz = Math.max(minZ, Math.min(SPAWN.z, maxZ));
      if (Math.hypot(sx - SPAWN.x, sz - SPAWN.z) < 25) continue;
      let bad = false;
      for (let x = minX; x <= maxX + 0.01 && !bad; x += (maxX - minX) / 8) {
        for (let z = minZ; z <= maxZ + 0.01; z += (maxZ - minZ) / 8) {
          if (inNoSpawn(x, z, 3)) {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      let removed = 0;
      for (const ob of obstacles) {
        if (ob.maxX + o.margin > minX && ob.minX - o.margin < maxX && ob.maxZ + o.margin > minZ && ob.minZ - o.margin < maxZ) {
          if (world.buildings.has(ob)) removed++;
          else {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      const dist = Math.hypot(cx - SPAWN.x, cz - SPAWN.z);
      const front = o.facing ? Math.abs(gap - ehd - ROADS.width / 2 - 3) : 0;
      const score = removed * 6 + front + Math.abs(dist - o.ideal) * (o.distW ?? 0.3);
      if (!best || score < best.score) best = { x: cx, z: cz, yaw, score };
    }
  }
  return best ? { x: best.x, z: best.z, yaw: best.yaw } : null;
}

/** Plot frame helpers (yaw is a multiple of 90°). */
function frame(x: number, z: number, yaw: number, obstacles: Obstacle[]) {
  const c = new THREE.Vector3(x, 0, z);
  const W = (lx: number, ly: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, ly, lz).applyAxisAngle(UP, yaw).add(c);
  const box = (minX: number, maxX: number, minZ: number, maxZ: number): Obstacle => {
    const a = W(minX, 0, minZ);
    const b = W(maxX, 0, maxZ);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  };
  const solid = (minX: number, maxX: number, minZ: number, maxZ: number, height?: number): Obstacle => {
    const o = box(minX, maxX, minZ, maxZ);
    if (height !== undefined) o.height = height;
    obstacles.push(o);
    return o;
  };
  /** Round footprint (ellipse rx × rz) as 3 overlapping boxes. */
  const round = (cx: number, cz: number, rx: number, rz: number, height: number): void => {
    solid(cx - rx * 0.95, cx + rx * 0.95, cz - rz * 0.4, cz + rz * 0.4, height);
    solid(cx - rx * 0.4, cx + rx * 0.4, cz - rz * 0.95, cz + rz * 0.95, height);
    solid(cx - rx * 0.72, cx + rx * 0.72, cz - rz * 0.72, cz + rz * 0.72, height);
  };
  return { W, box, solid, round };
}

/* ------------------------------------------------------------------ the cabin */

const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, depthWrite: false });

/** Bondinho cabin: origin = floor centre; local +Z = along the cable. Glass sides so she is seen inside. */
function makeCabin(): THREE.Group {
  const c = new THREE.Group();
  const yellow = mat(0xffc21a);
  const orange = mat(0xf76707);
  const steel = mat(0x343a40);
  addBox(c, steel, CAB_W, 0.14, CAB_L, 0, 0.0, 0); // floor
  addBox(c, yellow, CAB_W + 0.06, 0.55, CAB_L + 0.06, 0, 0.3, 0); // lower skirt (solid band)
  addBox(c, orange, CAB_W + 0.12, 0.22, CAB_L + 0.12, 0, CAB_H + 0.02, 0); // roof rim
  addBox(c, yellow, CAB_W - 0.2, 0.18, CAB_L - 0.3, 0, CAB_H + 0.2, 0); // roof cap
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) addBox(c, orange, 0.09, CAB_H, 0.09, sx * (CAB_W / 2), CAB_H / 2, sz * (CAB_L / 2));
  // glass: four panes above the skirt
  const gh = CAB_H - 0.62;
  const gy = 0.58 + gh / 2;
  for (const sx of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.04, gh, CAB_L - 0.1), glassMat);
    g.position.set(sx * (CAB_W / 2), gy, 0);
    c.add(g);
  }
  for (const sz of [-1, 1]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(CAB_W - 0.1, gh, 0.04), glassMat);
    g.position.set(0, gy, sz * (CAB_L / 2));
    c.add(g);
  }
  // window bar
  for (const sx of [-1, 1]) addBox(c, orange, 0.06, 0.07, CAB_L, sx * (CAB_W / 2 + 0.02), 1.55, 0);
  // hanger + trolley on the cable
  addPost(c, steel, 0.07, 0, CAB_H + 0.25, CABLE_UP - 0.08, 0);
  addBox(c, steel, 0.3, 0.22, 0.9, 0, CABLE_UP, 0);
  for (const sz of [-0.32, 0.32]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10), steel);
    w.rotation.z = Math.PI / 2;
    w.position.set(0, CABLE_UP + 0.08, sz);
    c.add(w);
  }
  return c;
}

/* ------------------------------------------------------------------ Pão de Açúcar */

function buildPao(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
  kit: RioKit,
  dbg: Record<string, unknown>,
): { things: Interactable[]; centre: { x: number; z: number } | null } {
  const plot =
    pickPlot(world, obstacles, rng, PHW, PHD, { facing: true, ideal: 85, margin: 3 }) ??
    pickPlot(world, obstacles, rng, PHW, PHD, { facing: true, ideal: 85, margin: 1 });
  if (!plot) return { things: [], centre: null };
  const { x, z, yaw } = plot;
  const F = frame(x, z, yaw, obstacles);
  world.clearArea(F.box(-PHW, PHW, -PHD, PHD), 3); // placeholder buildings only

  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  root.userData.landmark = 'pao';
  scene.add(root);

  /* —— Morro da Urca: low, wide, rounded, green with some bare granite faces —— */
  const urca = mountain(
    [
      [URCA.r, 0],
      [URCA.r - 0.2, 1.5],
      [URCA.r - 0.8, 4],
      [URCA.r - 1.9, 6.8],
      [URCA.r - 3.4, 9.3],
      [URCA.r - 5.1, 11.3],
      [URCA.r - 6.9, 12.6],
      [1, URCA.h - 0.1],
      [0, URCA.h],
    ],
    16,
    0.08,
    URCA.h - 0.8,
    (y, ang, steep, rnd) => {
      // bare rock on the steep faces looking at the sea (towards −Z/−X) — mostly forest green
      const rocky = steep > 0.55 && Math.cos(ang - 2.4) > 0.1 && rnd < 0.6 && y > 1.5;
      if (rocky) return C(0x9c8f88, 0.85 + rnd * 0.25);
      return C(rnd < 0.5 ? 0x3f8f3a : 0x2f7d32, 0.85 + rnd * 0.3);
    },
  );
  urca.position.set(URCA.x, 0, URCA.z);
  urca.scale.set(1.08, 1, 1);
  root.add(urca);

  /* —— Pão de Açúcar: steep granite bullet, green band at the base —— */
  const pao = mountain(
    [
      [PAO.r, 0],
      [PAO.r - 0.1, 2.5],
      [PAO.r - 0.4, 6],
      [PAO.r - 0.8, 10],
      [PAO.r - 1.3, 14],
      [PAO.r - 2.0, 18],
      [PAO.r - 2.9, 21.5],
      [PAO.r - 3.9, 24],
      [3.2, 26.0],
      [2.4, 26.7],
      [1.2, 27.05],
      [0, 27.15],
    ],
    18,
    0.06,
    23.5,
    (y, ang, _steep, rnd) => {
      const band = 3.2 + Math.sin(ang * 3 + 1) * 1.3 + Math.sin(ang * 7) * 0.6;
      if (y < band) return C(rnd < 0.5 ? 0x3f8f3a : 0x2b7a2f, 0.85 + rnd * 0.3);
      // thin green streaks climbing the lower flanks
      if (y < band + 5 && Math.sin(ang * 9 + 0.5) > 0.82) return C(0x3a8a38, 0.9 + rnd * 0.2);
      // granite: pinkish grey, with darker vertical streaks
      const streak = Math.sin(ang * 11 + y * 0.08) > 0.55;
      return C(streak ? 0x8a7c76 : 0xb4a59d, 0.9 + rnd * 0.18 + (y / 27) * 0.08);
    },
  );
  pao.position.set(PAO.x, 0, PAO.z);
  pao.scale.set(PAO.sx, 1, 1);
  root.add(pao);

  // a few round trees on the flanks / valley (soft green, not clutter)
  const treeM = [mat(0x2f9e44), mat(0x37b24d), mat(0x2b8a3e)];
  for (const [tx, tz, s] of [
    [1.2, -1.5, 1.4],
    [1.8, -9.5, 1.6],
    [0.6, -5.8, 1.2],
    [-2.4, 2.4, 1.3],
    [4.6, 0.9, 1.2],
    [-15.5, 4.2, 1.3],
    [19.2, -1.2, 1.1],
  ] as const) {
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), treeM[Math.floor(rng() * 3)]);
    t.position.set(tx, s * 0.8, tz);
    t.castShadow = true;
    root.add(t);
  }

  const cream = mat(0xfff3d6);
  const red = mat(0xe8590c);
  const steel = mat(0x343a40);
  const stone = mat(0xced4da);

  /* —— ground station (Praia Vermelha): tall open hall, cabins inside, open front and back —— */
  const SX = -10;
  const SZ = 12.5;
  addBox(root, stone, 6.8, 0.12, 4.6, SX, 0.06, SZ); // floor
  for (const sx of [-1, 1]) {
    addBox(root, cream, 0.3, 6.6, 4.6, SX + sx * 3.4, 3.3, SZ);
    addBox(root, red, 0.36, 0.4, 4.7, SX + sx * 3.4, 5.6, SZ);
  }
  addBox(root, red, 7.4, 0.3, 5.2, SX, 6.75, SZ); // roof
  addBox(root, cream, 7.0, 0.5, 0.3, SX, 6.35, SZ + 2.3); // front lintel
  // bull wheels at the back of the hall
  for (const tx of [TRACK_A[0].x, TRACK_B[0].x]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 14), steel);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(tx, G_Y + CABLE_UP + 0.05, SZ + 1.6);
    root.add(wheel);
  }
  F.solid(SX - 3.55, SX - 3.25, SZ - 2.3, SZ + 2.3, 6.6);
  F.solid(SX + 3.25, SX + 3.55, SZ - 2.3, SZ + 2.3, 6.6);
  // small paved plaza in front
  addBox(root, stone, 10, 0.06, 1.6, SX, 0.03, SZ + 3.1);

  // operator by the door (shakes his head when she has no coins)
  const op = buildFolk({ shirt: 0x1864ab, pants: 0x212529, skin: 0xc68642, hair: 0x2b1d0e, cap: 0x1864ab });
  op.group.position.set(SX + 2.35, 0.12, SZ + 1.7);
  op.group.rotation.y = Math.PI; // faces +Z (towards her as she walks in)
  root.add(op.group);
  F.solid(SX + 2.0, SX + 2.7, SZ + 1.35, SZ + 2.05);

  /* —— Urca station: house in the outer corner + canopy over both docks —— */
  addBox(root, cream, 3.4, 16, 2.8, -14.4, 11, -10.2);
  addBox(root, red, 3.7, 0.3, 3.1, -14.4, 19.1, -10.2);
  addBox(root, cream, 1.2, 0.2, 4.8, -13.2, U_Y - 0.1, -6.2); // walkway beside dock A
  addBox(root, red, 6.2, 0.3, 6.4, -10.2, 20.85, -6.2); // canopy
  for (const [px, pz] of [
    [-7.4, -3.2],
    [-7.4, -9.2],
    [-13.1, -3.2],
  ] as const) {
    addPost(root, steel, 0.12, px, 10.5, 20.7, pz);
  }

  /* —— summit station + deck (on top of the Pão) —— */
  const hx = PAO.x;
  const hz = PAO.z;
  addBox(root, stone, 3.0, 0.5, 5.6, hx + 1.35, TOP_Y - 0.25, hz); // walkable deck (east of the cabin slot)
  addBox(root, stone, 2.9, 0.4, 0.6, hx - 1.6, TOP_Y - 0.2, hz - 2.6); // slot rims
  addBox(root, stone, 2.9, 0.4, 0.6, hx - 1.6, TOP_Y - 0.2, hz + 2.6);
  addBox(root, red, 3.4, 0.3, 6.2, hx - 1.6, TOP_Y + 4.3, hz); // roof over the cabin slot
  for (const [px, pz] of [
    [hx - 3.2, hz - 2.9],
    [hx - 3.2, hz + 2.9],
    [hx, hz - 2.9],
    [hx, hz + 2.9],
  ] as const) {
    addPost(root, steel, 0.1, px, 19.5, TOP_Y + 4.2, pz);
  }
  // railing around the deck
  const rail = mat(0xf8f9fa);
  addBox(root, rail, 0.08, 0.9, 5.6, hx + 2.85, TOP_Y + 0.45, hz);
  addBox(root, rail, 3.0, 0.9, 0.08, hx + 1.35, TOP_Y + 0.45, hz - 2.8);
  addBox(root, rail, 3.0, 0.9, 0.08, hx + 1.35, TOP_Y + 0.45, hz + 2.8);
  for (const [px, pz] of [
    [hx + 2.85, hz - 2.8],
    [hx + 2.85, hz + 2.8],
    [hx + 2.85, hz],
  ] as const) {
    addPost(root, rail, 0.05, px, TOP_Y, TOP_Y + 0.9, pz);
  }
  // jewel on a pedestal by the railing
  addPost(root, stone, 0.35, hx + 2.0, TOP_Y, TOP_Y + 0.9, hz + 1.6);
  const gem = gemMesh(0xff3b7f, 1.1);
  gem.position.set(hx + 2.0, TOP_Y + 1.6, hz + 1.6);
  root.add(gem);

  /* —— cables (two per track, straight spans) —— */
  for (const tr of [TRACK_A, TRACK_B]) {
    for (const side of [-0.18, 0.18]) {
      for (let i = 0; i < 2; i++) {
        const a = tr[i].clone();
        const b = tr[i + 1].clone();
        const d = b.clone().sub(a).setY(0).normalize();
        const perp = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(side);
        a.add(perp).y += CABLE_UP + 0.2;
        b.add(perp).y += CABLE_UP + 0.2;
        // extend a little into the stations (bull wheels)
        rod(root, steel, a.clone().addScaledVector(d, -1.4), b.clone().addScaledVector(d, i === 1 ? 1.2 : 0), 0.035);
      }
    }
  }

  /* —— the two cabins —— */
  const cabA = makeCabin();
  const cabB = makeCabin();
  root.add(cabA, cabB);

  /* —— palms + samba musicians on the open ground in front of the valley —— */
  palm(root, -16.5, 14.5, 0.2);
  palm(root, -3.6, 14.6, -0.3);
  palm(root, 6.5, 12.5, 0.5);
  F.solid(-16.4, -15.8, 14.2, 14.8);
  F.solid(-3.5, -2.9, 14.3, 14.9);
  F.solid(6.6, 7.2, 12.2, 12.8);
  const musicians = [
    buildFolk({ shirt: 0xfcc419, pants: 0x2b8a3e, skin: 0x8d5524, hair: 0x1b1b1b }),
    buildFolk({ shirt: 0x2b8a3e, pants: 0x1864ab, skin: 0xe0ac69, hair: 0x5a3825, longHair: true, dress: true }),
  ];
  musicians.forEach((m, i) => {
    m.group.position.set(1.4 + i * 1.6, 0, 11.5);
    m.group.rotation.y = Math.PI;
    root.add(m.group);
  });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 12), mat(0xf8f9fa));
  drum.position.set(1.4, 1.05, 11.95);
  drum.rotation.x = 0.5;
  root.add(drum);
  F.solid(0.9, 4.5, 11.1, 11.9);

  /* —— collision —— */
  F.round(URCA.x, URCA.z, URCA.r * 1.08, URCA.r, URCA.h);
  // Pão: ring of boxes around the summit hole (the hole is the walkable deck; plugged while she is down here)
  const rx = PAO.r * PAO.sx;
  const rz = PAO.r;
  F.solid(hx - rx, hx - HOLE, hz - rz * 0.4, hz + rz * 0.4, 27);
  F.solid(hx + HOLE, hx + rx, hz - rz * 0.4, hz + rz * 0.4, 27);
  F.solid(hx - rx * 0.4, hx + rx * 0.4, hz - rz, hz - HOLE, 27);
  F.solid(hx - rx * 0.4, hx + rx * 0.4, hz + HOLE, hz + rz, 27);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const ax = hx + sx * HOLE;
      const bx = hx + sx * rx * 0.72;
      const az = hz + sz * HOLE;
      const bz = hz + sz * rz * 0.72;
      F.solid(Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), 27);
    }
  const holeBox = F.box(hx - HOLE, hx + HOLE, hz - HOLE, hz + HOLE);
  const plug: Obstacle = { ...holeBox, height: 27 };
  const inHole = (px: number, pz: number): boolean => px > holeBox.minX && px < holeBox.maxX && pz > holeBox.minZ && pz < holeBox.maxZ;
  let plugged = false;
  const setPlug = (on: boolean): void => {
    if (on === plugged) return;
    plugged = on;
    if (on) obstacles.push(plug);
    else {
      const i = obstacles.indexOf(plug);
      if (i >= 0) obstacles.splice(i, 1);
    }
  };
  setPlug(!inHole(ctx.player.x, ctx.player.z));

  // feet height on the summit deck
  const h0 = world.heightAt;
  world.heightAt = (px, pz) => (inHole(px, pz) ? TOP_Y : (h0?.(px, pz) ?? 0));

  /* —— ride logic —— */
  const legDir = (tr: THREE.Vector3[], i: number) => tr[i + 1].clone().sub(tr[i]).setY(0).normalize();
  const yaw0 = Math.atan2(legDir(TRACK_A, 0).x, legDir(TRACK_A, 0).z);
  const yaw1 = Math.atan2(legDir(TRACK_A, 1).x, legDir(TRACK_A, 1).z);
  const along = (tr: THREE.Vector3[], s: number, out: THREE.Vector3): THREE.Vector3 => {
    const k = THREE.MathUtils.clamp(s, 0, 2);
    return k <= 1 ? out.lerpVectors(tr[0], tr[1], k) : out.lerpVectors(tr[1], tr[2], k - 1);
  };
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  /** s of cabin A: 0 = ground station, 1 = Urca, 2 = summit (cabin B is at 2 − s). */
  let sA = 0;
  let cabYaw = yaw0;
  type Trip = { up: boolean; t: number; rider: boolean };
  let trip: Trip | null = null;
  let pendingBoard = false;
  let shakeT = 0;
  let swayT = 0;
  const lastSet = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  const tripLen = LEG0 + STOP + LEG1;
  const tripPose = (tr: Trip): { s: number; yaw: number } => {
    const first = tr.up ? LEG0 : LEG1;
    const second = tr.up ? LEG1 : LEG0;
    if (tr.t < first) {
      const e = ease(tr.t / first);
      return { s: tr.up ? e : 2 - e, yaw: tr.up ? yaw0 : yaw1 };
    }
    if (tr.t < first + STOP) {
      const k = ease((tr.t - first) / STOP);
      return { s: 1, yaw: tr.up ? lerpAngle(yaw0, yaw1, k) : lerpAngle(yaw1, yaw0, k) };
    }
    const e = ease(Math.min(1, (tr.t - first - STOP) / second));
    return { s: tr.up ? 1 + e : 1 - e, yaw: tr.up ? yaw1 : yaw0 };
  };

  const placeCabins = (): void => {
    along(TRACK_A, sA, cabA.position);
    along(TRACK_B, 2 - sA, cabB.position);
    cabA.rotation.y = cabYaw;
    cabB.rotation.y = cabYaw;
  };
  placeCabins();

  /** World position of her feet in cabin A. */
  const seatWorld = (out: THREE.Vector3): THREE.Vector3 => {
    along(TRACK_A, sA, tmp);
    return out.copy(F.W(tmp.x, tmp.y + 0.08, tmp.z));
  };

  const atTop = (): boolean => ctx.player.y > 20 && inHole(ctx.player.x, ctx.player.z);
  const boardW = (top: boolean) => F.W(TRACK_A[top ? 2 : 0].x, 0, TRACK_A[top ? 2 : 0].z);
  const prox = boardW(false);

  const refuse = (): void => {
    shakeT = 1.3;
    tone(150, 0, 0.3, 'sine', 0.1);
    tone(130, 0.32, 0.4, 'sine', 0.1);
    ctx.say([`Precisas de ${PRICE} moedas!`]);
  };

  const start = (): boolean => {
    if (ctx.isDriving() || ctx.isPaused() || trip?.rider) return false;
    const top = atTop();
    const want = top ? 2 : 0;
    if (trip || Math.abs(sA - want) > 0.001) {
      // the cabin is on its way: she gets in as soon as it arrives
      pendingBoard = true;
      return false;
    }
    if (!top) {
      if (ctx.coins() < PRICE) {
        refuse();
        return false;
      }
      ctx.addCoins(-PRICE);
    }
    pendingBoard = false;
    tone(1047, 0, 0.1, 'triangle', 0.06);
    tone(784, 0.14, 0.16, 'triangle', 0.06);
    trip = { up: !top, t: 0, rider: true };
    swayT = 0;
    ctx.hold(true);
    ctx.say(top ? ['Vamos descer de bondinho!'] : ['Bondinho! Vamos ao cimo do Pão de Açúcar!']);
    seatWorld(lastSet);
    ctx.player.copy(lastSet);
    return true;
  };

  const finish = (): void => {
    if (!trip) return;
    const { up, rider } = trip;
    trip = null;
    sA = up ? 2 : 0;
    cabYaw = up ? yaw1 : yaw0;
    placeCabins();
    if (!rider) return;
    ctx.walkAnim(0);
    if (up) {
      setPlug(false);
      const e = F.W(EXIT_TOP.x, TOP_Y, EXIT_TOP.z);
      ctx.player.set(e.x, TOP_Y, e.z);
      ctx.say(['Chegámos ao cimo do Pão de Açúcar! Que vista!']);
    } else {
      const e = F.W(EXIT_GROUND.x, 0, EXIT_GROUND.z);
      ctx.player.set(e.x, 0, e.z);
      setPlug(true);
      ctx.say(['De volta à estação!']);
    }
    ctx.hold(false);
    tone(660, 0, 0.12, 'triangle', 0.05);
    tone(880, 0.1, 0.14, 'triangle', 0.04);
  };

  kit.setRideDispose(() => {
    if (trip?.rider) {
      trip = null;
      ctx.walkAnim(0);
      ctx.hold(false);
    }
  });

  const spots = {
    main: { x, z },
    pao: { x, z },
    station: (() => {
      const p = boardW(false);
      return { x: p.x, z: p.z };
    })(),
    summit: (() => {
      const p = F.W(EXIT_TOP.x, 0, EXIT_TOP.z);
      return { x: p.x, z: p.z, y: TOP_Y };
    })(),
    summitBoard: (() => {
      const p = boardW(true);
      return { x: p.x, z: p.z };
    })(),
    urca: (() => {
      const p = F.W(URCA.x, 0, URCA.z);
      return { x: p.x, z: p.z };
    })(),
    paoPeak: (() => {
      const p = F.W(PAO.x, 0, PAO.z);
      return { x: p.x, z: p.z };
    })(),
    yaw,
  };
  dbg.spots = { ...((dbg.spots as object) ?? {}), ...spots };
  dbg.price = PRICE;
  const live = { s: 0, trip: 'none' as string, rider: false, plugged: true };
  dbg.ride = live;

  const clickables = new THREE.Group(); // tapping a cabin or a station = walk into the cabin
  const touchRide: Interactable = {
    object: root,
    position: prox,
    radius: BOARD_R,
    interact() {
      // on the summit walking into the cabin does nothing: down only with a tap on the cabin or Enter (tapCab/enterRide)
      if (atTop()) return false;
      return start();
    },
    update(dt) {
      // operator head shake / jewel spin
      if (shakeT > 0) {
        shakeT = Math.max(0, shakeT - dt);
        op.head.rotation.y = Math.sin(shakeT * 16) * 0.55 * Math.min(1, shakeT * 2);
      } else op.head.rotation.y = 0;
      if (gem.visible) gem.rotation.y += dt * 1.6;
      // samba bounce
      const tt = performance.now() * 0.001;
      musicians.forEach((m, i) => (m.body.position.y = Math.abs(Math.sin(tt * 4 + i)) * 0.06));
      musicians[0].armR.rotation.x = Math.sin(tt * 8) * 0.5;

      // keep the touch point at the station she is at
      const top = atTop();
      prox.copy(boardW(top));
      tapCab.radius = top ? TOP_TAP_R : BOARD_R;
      tapCab.reach = top ? TOP_TAP_R : undefined;
      enterRide.radius = top ? TOP_TAP_R : 3.2;
      if (!trip) setPlug(!inHole(ctx.player.x, ctx.player.z));
      live.s = +sA.toFixed(3);
      live.trip = trip ? (trip.up ? 'up' : 'down') : 'none';
      live.rider = !!trip?.rider;
      live.plugged = plugged;

      if (!trip) {
        // send the empty cabin to the station she is at (e.g. after a reload on the summit)
        const want = top ? 2 : 0;
        if (Math.abs(sA - want) > 0.001) trip = { up: want === 2, t: 0, rider: false };
        else if (pendingBoard) {
          const d = Math.hypot(ctx.player.x - prox.x, ctx.player.z - prox.z);
          if (d < (top ? TOP_TAP_R : BOARD_R) + 0.4) start();
          else pendingBoard = false;
        }
        cabA.rotation.z = 0;
        return;
      }
      // a ride in progress (paused game = stand still, e.g. a question cannot appear: hold is on)
      if (trip.rider) {
        // Casa / menu moved her somewhere else: let her go, the cabin finishes empty (xz only: main resets y each frame)
        if (Math.hypot(ctx.player.x - lastSet.x, ctx.player.z - lastSet.z) > 4) {
          trip.rider = false;
          ctx.walkAnim(0);
          ctx.hold(false);
        }
      }
      trip.t += dt;
      swayT += dt;
      const pose = tripPose(trip);
      sA = pose.s;
      cabYaw = pose.yaw;
      placeCabins();
      // gentle sway on the long spans
      const sway = Math.sin(swayT * 2.2) * 0.035 * Math.min(1, swayT);
      cabA.rotation.z = sway;
      cabB.rotation.z = -sway;
      if (trip.rider) {
        seatWorld(lastSet);
        ctx.player.copy(lastSet);
        // look out of the window, the way the cabin is going
        const k = trip.up ? 10 : -10;
        tmpB.copy(F.W(tmp.x + Math.sin(cabYaw) * k, 0, tmp.z + Math.cos(cabYaw) * k));
        ctx.walkAnim(0, tmpB.x, tmpB.z);
      }
      if (trip.t >= tripLen) finish();
    },
  };
  // Enter next to the cabin (keyboard): same ride. Its object is never in the scene (taps go to touchRide).
  const enterRide: Interactable = {
    object: clickables,
    position: prox,
    radius: 3.2,
    requiresClick: true,
    interact() {
      return start();
    },
  };
  // Tap on cabin A: on the summit = come down right away (from anywhere on the deck); at the ground station it does
  // nothing itself (she walks to the cabin and touchRide boards her on contact, as before).
  const tapCab: Interactable = {
    object: cabA,
    position: prox,
    radius: BOARD_R,
    requiresClick: true,
    interact() {
      if (!atTop()) return false;
      return start();
    },
  };

  const things: Interactable[] = [
    kit.diamondAt(ctx, `gem:${ctx.city()}:pao`, F.W(hx + 2.0, 0, hz + 1.6), gem),
    {
      object: musicians[0].group,
      position: F.W(2.2, 0, 13.3),
      radius: 2.2,
      interact() {
        [262, 330, 392, 330, 440, 392].forEach((f, i) => tone(f, i * 0.16, 0.18, 'triangle', 0.05));
        ctx.say(['Samba! Dança com os músicos!']);
      },
    },
    enterRide, // before tapCab: Enter takes the first clickable in range (tapCab refuses at the ground station)
    tapCab, // before touchRide: a tap on cabin A is tapCab's
    touchRide, // after the musicians: a tap on them is theirs, a tap anywhere else on the plot = the bondinho
  ];
  return { things, centre: { x, z } };
}

/* ------------------------------------------------------------------ Cristo Redentor (Corcovado) */

const HILL_R = 14;
const HILL_SX = 1.12;
const HILL_TOP = 25.6;

function statue(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e7e0, roughness: 0.75, flatShading: true, emissive: 0x2a2a28, fog: false });
  // fog: false — the statue stays crisp over the hazy hill, so it reads from far across the city (the hill keeps the fog)
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, white);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // robe: long, slightly flared at the feet, narrow waist, broad chest
  const robe = add(
    new THREE.LatheGeometry(
      [
        [1.05, 0],
        [0.98, 0.6],
        [0.84, 2.4],
        [0.74, 4.0],
        [0.78, 5.0],
        [0.92, 5.9],
        [1.02, 6.5],
        [0.95, 6.85],
        [0.55, 7.15],
        [0, 7.2],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      10,
    ),
    0,
    0,
    0,
  );
  robe.scale.set(1, 1, 0.62);
  // open arms: straight out, with hanging sleeves
  const span = 8.2;
  add(new THREE.BoxGeometry(span, 0.5, 0.55), 0, 6.55, 0);
  for (const sx of [-1, 1]) {
    // sleeve drape under each arm (wider near the body)
    const drape = add(new THREE.CylinderGeometry(0.05, 0.55, 2.6, 4), sx * 1.9, 5.95, 0);
    drape.rotation.z = sx * (Math.PI / 2 - 0.25);
    drape.scale.set(1, 1, 0.45);
    // hands
    add(new THREE.BoxGeometry(0.42, 0.6, 0.3), sx * (span / 2 + 0.1), 6.45, 0);
  }
  // neck + head (slightly bowed)
  add(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 8), 0, 7.3, 0);
  const head = add(new THREE.SphereGeometry(0.42, 10, 8), 0, 7.82, 0.05);
  head.scale.set(0.92, 1.1, 0.95);
  // pedestal (stepped, light stone)
  const ped = new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 0.9, flatShading: true, fog: false });
  for (const [w, y0, y1] of [
    [3.2, -3.4, -2.8],
    [2.4, -2.8, -0.35],
    [2.9, -0.35, 0.02],
  ] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, w), ped);
    b.position.y = (y0 + y1) / 2;
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function buildCristo(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
  pao: { x: number; z: number } | null,
  dbg: Record<string, unknown>,
): Interactable[] {
  const hw = HILL_R * HILL_SX + 1.5;
  const hd = HILL_R + 1.5;
  const away = pao ? { x: pao.x, z: pao.z, d: 80 } : undefined;
  const plot =
    pickPlot(world, obstacles, rng, hw, hd, { facing: false, ideal: 70, distW: 1.5, away, margin: 3 }) ??
    pickPlot(world, obstacles, rng, hw, hd, { facing: false, ideal: 70, distW: 1.5, away: pao ? { ...away!, d: 60 } : undefined, margin: 1 });
  if (!plot) return [];
  const { x, z } = plot;
  const F = frame(x, z, 0, obstacles);
  world.clearArea(F.box(-hw, hw, -hd, hd), 3);

  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.userData.landmark = 'cristo';
  scene.add(root);

  // Corcovado: tall, steep, forested hill with a rocky face; small flat summit for the statue
  const hill = mountain(
    [
      [HILL_R, 0],
      [HILL_R - 0.4, 2],
      [HILL_R - 1.6, 5.5],
      [HILL_R - 3.4, 9.5],
      [HILL_R - 5.6, 13.5],
      [HILL_R - 7.8, 17.5],
      [HILL_R - 9.6, 21],
      [3.0, 23.6],
      [2.4, HILL_TOP - 0.6],
      [2.2, HILL_TOP],
      [0, HILL_TOP],
    ],
    16,
    0.11,
    HILL_TOP - 1.2,
    (y, ang, steep, rnd) => {
      if (y > HILL_TOP - 0.3) return C(0xb5aea4, 0.95); // summit terrace
      const rocky = steep > 0.6 && Math.cos(ang + 0.8) > 0.35 && y > 6 && rnd < 0.7;
      if (rocky) return C(0x8f857e, 0.85 + rnd * 0.25);
      return C(rnd < 0.45 ? 0x2b8a3e : rnd < 0.8 ? 0x237032 : 0x3f9a45, 0.85 + rnd * 0.25);
    },
  );
  hill.scale.set(HILL_SX, 1, 1);
  root.add(hill);

  const cristo = statue();
  const STATUE_K = 1.35; // a bit bigger than life-size proportions so it reads from across the city
  cristo.scale.setScalar(STATUE_K);
  cristo.position.set(0, HILL_TOP + 3.4 * STATUE_K - 0.1, 0);
  // arms open to the city: face the start point / middle of the map
  cristo.rotation.y = Math.atan2(SPAWN.x - x, SPAWN.z - z);
  root.add(cristo);

  F.round(0, 0, HILL_R * HILL_SX, HILL_R, HILL_TOP);

  // touching the hill anywhere (or tapping it / the statue) = the narrator names it
  const prox = new THREE.Vector3(x, 0, z + HILL_R + 0.7);
  let lastSaid = -Infinity;
  const top = new THREE.Vector3(x, HILL_TOP + 3.4 * STATUE_K + 8 * STATUE_K, z);
  const spots = (dbg.spots as Record<string, unknown>) ?? {};
  spots.corcovado = { x, z };
  spots.cristo = { x: top.x, y: top.y, z: top.z };
  dbg.spots = spots;
  return [
    {
      object: root,
      position: prox,
      radius: 1.7,
      interact() {
        const now = performance.now();
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.5, 'sine', 0.045));
        if (now - lastSaid < 25000) return;
        lastSaid = now;
        ctx.say(['O Cristo Redentor, de braços abertos sobre o Rio de Janeiro!']);
      },
      update() {
        // nearest point of the hill's foot to her
        const dx = (ctx.player.x - x) / HILL_SX;
        const dz = ctx.player.z - z;
        const d = Math.hypot(dx, dz) || 1;
        prox.set(x + (dx / d) * (HILL_R + 0.7) * HILL_SX, 0, z + (dz / d) * (HILL_R + 0.7));
      },
    },
  ];
}

/* ------------------------------------------------------------------ entry point */

export function buildRio(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
  kit: RioKit,
): Interactable[] {
  const dbg: Record<string, unknown> = { spots: {}, count: 0 };
  kit.setDebug(dbg);
  const pao = buildPao(scene, obstacles, rng, ctx, world, kit, dbg);
  const cristo = buildCristo(scene, obstacles, rng, ctx, world, pao.centre, dbg);
  dbg.count = (pao.centre ? 1 : 0) + (cristo.length ? 1 : 0);
  if (!pao.centre) dbg.failed = 'pao';
  if (!cristo.length) dbg.failed = ((dbg.failed as string) ?? '') + ' cristo';
  // the long beach along the +Z side (people, splashes, volleyball) — last: it releases the sand for walking/spawning
  const beach = buildBeachLife(scene, obstacles, ctx, Math.floor(rng() * 1e6), dbg);
  return [...pao.things, ...cristo, ...beach];
}
