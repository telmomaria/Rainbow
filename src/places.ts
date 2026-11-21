import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import { inNoSpawn } from './spawn';
import { ball, box, buildFolk, cyl, mat, pick, HAIRS, PANTS, SHIRTS, SKINS, type Folk } from './venue';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';

/**
 * Shared helpers for the small places added with the 2026-11-15 brief (bank, jeweller, services, workshops…):
 *  - finding a free plot beside a road or a free spot of open ground (never glued to buildings, never on a road,
 *    never inside the airport or a ticketed venue);
 *  - a small open-front kiosk with a counter and a clerk who can nod or shake his head;
 *  - things that fly between her and a counter (coins, jewels).
 *
 * Site-local frame (same as shops.ts / venue.ts): x across, **+Z points at the road** (the front), the building is
 * at z < 0. Rotations are multiples of 90°, so local boxes are exact world AABBs.
 */

export interface Site {
  x: number;
  z: number;
  rot: number;
}

/** Local (x, z) of a site → world position (y as given). */
export function siteToWorld(s: Site, lx: number, lz: number, y = 0): THREE.Vector3 {
  const c = Math.round(Math.cos(s.rot));
  const si = Math.round(Math.sin(s.rot));
  return new THREE.Vector3(s.x + lx * c + lz * si, y, s.z - lx * si + lz * c);
}

/** World AABB of a local box of a site (optional height = low obstacle the camera may pass over). */
export function siteBox(s: Site, x0: number, x1: number, z0: number, z1: number, height?: number): Obstacle {
  const a = siteToWorld(s, x0, z0);
  const b = siteToWorld(s, x1, z1);
  const o: Obstacle = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  if (height !== undefined) o.height = height;
  return o;
}

/** A group placed and turned like the site (add your meshes in the site-local frame). */
export function siteGroup(scene: THREE.Object3D, s: Site): THREE.Group {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.rot;
  scene.add(g);
  g.updateMatrixWorld(true);
  return g;
}

/** World heading (0 = facing -Z) of someone who looks along the site's local direction `local` (0 = local -Z). */
export function siteHeading(s: Site, local: number): number {
  return s.rot + local;
}

const overlaps = (a: Obstacle, b: Obstacle, m = 0): boolean => a.maxX + m > b.minX && a.minX - m < b.maxX && a.maxZ + m > b.minZ && a.minZ - m < b.maxZ;
const isPost = (o: Obstacle): boolean => o.maxX - o.minX < 0.9 && o.maxZ - o.minZ < 0.9;
const ROOM_STEPS = [3, 2.2, 1.5] as const;

/**
 * Walkable ground that later plots must keep a gap from (a hopscotch chalked on the grass…): it is NOT an
 * obstacle — she walks on it — but nothing placed afterwards by roadsideSite / openSpot / parkSite may come within
 * `gap` metres of it. Kept per city (keyed by that city's obstacle list), so nothing needs resetting.
 */
const reservedGround = new WeakMap<Obstacle[], Obstacle[]>();
export function reserveGround(obstacles: Obstacle[], area: Obstacle, gap = 4): void {
  const list = reservedGround.get(obstacles) ?? [];
  list.push({ minX: area.minX - gap, maxX: area.maxX + gap, minZ: area.minZ - gap, maxZ: area.maxZ + gap });
  reservedGround.set(obstacles, list);
}
/** Does this box come within the gap of reserved walkable ground? */
export function onReservedGround(obstacles: Obstacle[], b: Obstacle): boolean {
  const list = reservedGround.get(obstacles);
  return !!list && list.some((r) => overlaps(b, r));
}

export interface SiteOpts {
  /** Distance of the plot centre from the start point (default 30–135 m). */
  minD?: number;
  maxD?: number;
  /**
   * Front line (door), metres from the road centre line.
   * Default 12.5 ≈ 8.5 m past the kerb (road half 4) — behind the street-lamp line (5.5) with room to walk up.
   */
  front?: number;
  /** Free room (m) kept in front of the door — no lamps/posts (default 4). */
  apron?: number;
  /**
   * Optional: hide street lamps whose posts sit in the façade apron and drop their obstacles.
   * Used when a lamp was already planted on a plot we still want (crowded maps).
   */
  clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void;
}

/** ≥ this many metres past the road edge before a kiosk/shop body may begin. */
const ROAD_EDGE_GAP = 7;

/** City-wide lamp clearer (StreetLights.clearIn), set from main after lamps are planted. */
let cityLampClearer: ((area: Obstacle, obstacles: Obstacle[]) => void) | null = null;
export function setCityLampClearer(fn: ((area: Obstacle, obstacles: Obstacle[]) => void) | null): void {
  cityLampClearer = fn;
}

/**
 * A free plot beside a road: body x ∈ [-hw, hw], z ∈ [-depth, 0], front (z = 0) facing the road.
 * Never on the carriageway; door apron kept clear of lamps/posts. Null if the city is full.
 */
export function roadsideSite(obstacles: Obstacle[], rng: () => number, hw: number, depth: number, opts: SiteOpts = {}): Site | null {
  const { minD = 30, maxD = 135 } = opts;
  const half = ROADS.width / 2;
  // Front of the building ≥ 7 m past the kerb; door apron never under 4 m.
  const front = Math.max(opts.front ?? 12.5, half + ROAD_EDGE_GAP);
  const apron = Math.max(4, opts.apron ?? 4);
  const clearLamps = opts.clearLamps ?? cityLampClearer ?? undefined;
  // Body must stay ≥ ROAD_EDGE_GAP past the kerb (never “on the street”).
  const roads: Obstacle[] = [
    ...ROADS.xs.map((x) => ({ minX: x - half - ROAD_EDGE_GAP, maxX: x + half + ROAD_EDGE_GAP, minZ: -999, maxZ: 999 })),
    ...ROADS.zs.map((z) => ({ minX: -999, maxX: 999, minZ: z - half - ROAD_EDGE_GAP, maxZ: z + half + ROAD_EDGE_GAP })),
  ];
  // Prefer plots with a clean apron; fall back to ones that only need lamps cleared.
  for (const room of ROOM_STEPS) {
    const clean: Site[] = [];
    const needsClear: Site[] = [];
    const tryAt = (x: number, z: number, rot: number): void => {
      const s = { x, z, rot };
      const c = siteToWorld(s, 0, -depth / 2);
      const d = Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z);
      if (d < minD || d > maxD) return;
      const body = siteBox(s, -hw, hw, -depth, 0);
      if (Math.max(Math.abs(body.minX), Math.abs(body.maxX), Math.abs(body.minZ), Math.abs(body.maxZ)) > ROADS.extent - 12) return;
      if (overlaps(body, AIRPORT_ZONE, 3) || roads.some((r) => overlaps(body, r))) return;
      // Body: posts only need ~1 m beside the walls; big solids keep full room.
      for (const o of obstacles) if (overlaps(body, o, isPost(o) ? Math.min(room, 1) : room)) return;
      if (onReservedGround(obstacles, body)) return;
      // Door apron (+Z): no buildings; lamps/posts → prefer another plot, else clearLamps.
      const apronBox = siteBox(s, -hw, hw, 0, apron);
      let postsInApron = false;
      for (const o of obstacles) {
        if (!overlaps(apronBox, o, room)) continue;
        if (isPost(o)) {
          postsInApron = true;
          continue;
        }
        return;
      }
      for (const [lx, lz] of [[0, -depth / 2], [-hw, 0], [hw, 0], [-hw, -depth], [hw, -depth], [0, apron]]) {
        const p = siteToWorld(s, lx, lz);
        if (inNoSpawn(p.x, p.z, 1.5)) return;
      }
      (postsInApron ? needsClear : clean).push(s);
    };
    for (let t = -ROADS.extent + 16; t <= ROADS.extent - 16; t += 2.5) {
      for (const side of [-1, 1]) {
        for (const rz of ROADS.zs) tryAt(t, rz + side * front, side < 0 ? 0 : Math.PI);
        for (const rx of ROADS.xs) tryAt(rx + side * front, t, -side * (Math.PI / 2));
      }
    }
    const pool = clean.length ? clean : clearLamps ? needsClear : [];
    if (!pool.length) continue;
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!clean.includes(pick) && clearLamps) {
      clearLamps(siteBox(pick, -hw - 0.4, hw + 0.4, -0.2, apron + 0.6), obstacles);
    }
    return pick;
  }
  return null;
}

export interface SpotOpts {
  minD?: number;
  maxD?: number;
  /** Distance kept from the road edge (default 3 m). */
  roadGap?: number;
  /** Of the free spots found, take the one farthest from the start point (treasure…). */
  farthest?: boolean;
}

/** A free circle of open ground (radius r), off the roads, with walking room round it. Null if none. */
export function openSpot(obstacles: Obstacle[], rng: () => number, r: number, opts: SpotOpts = {}): THREE.Vector3 | null {
  const { minD = 20, maxD = 135, roadGap = 3, farthest = false } = opts;
  const a = AIRPORT_ZONE;
  let best: THREE.Vector3 | null = null;
  let bestD = -1;
  for (const room of ROOM_STEPS) {
    for (let i = 0; i < 400; i++) {
      const x = (rng() * 2 - 1) * (ROADS.extent - 14);
      const z = (rng() * 2 - 1) * (ROADS.extent - 14);
      const d = Math.hypot(x - SPAWN.x, z - SPAWN.z);
      if (d < minD || d > maxD || onRoad(x, z, roadGap + r) || inNoSpawn(x, z, r + 1.5)) continue;
      if (x + r + 3 > a.minX && x - r - 3 < a.maxX && z + r + 3 > a.minZ && z - r - 3 < a.maxZ) continue;
      const me: Obstacle = { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
      if (obstacles.some((o) => overlaps(me, o, isPost(o) ? Math.min(room, 1) : room))) continue;
      if (onReservedGround(obstacles, me)) continue;
      if (!farthest) return new THREE.Vector3(x, 0, z);
      if (d > bestD) {
        bestD = d;
        best = new THREE.Vector3(x, 0, z);
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Site rotation so local +Z (the front / mouth) points away from the nearest road —
 * into the block or park, never toward the street.
 */
export function faceAwayFromRoad(x: number, z: number): number {
  let best = Infinity;
  let ax = 0;
  let az = 1;
  const half = ROADS.width / 2;
  for (const rx of ROADS.xs) {
    const d = Math.abs(x - rx) - half;
    if (d < best) {
      best = d;
      ax = x >= rx ? 1 : -1;
      az = 0;
    }
  }
  for (const rz of ROADS.zs) {
    const d = Math.abs(z - rz) - half;
    if (d < best) {
      best = d;
      ax = 0;
      az = z >= rz ? 1 : -1;
    }
  }
  return Math.atan2(ax, az);
}

/**
 * Free plot in open grass (not roadside): centred on an openSpot, mouth (+Z) facing the field.
 * Default roadGap 7 m so goals / play areas never sit on the kerb. Null if the city is full.
 */
export function parkSite(obstacles: Obstacle[], rng: () => number, hw: number, depth: number, opts: SpotOpts = {}): Site | null {
  const { minD = 30, maxD = 135, roadGap = 7, farthest = false } = opts;
  const r = Math.hypot(hw, depth / 2);
  const spot = openSpot(obstacles, rng, r, { minD, maxD, roadGap, farthest });
  if (!spot) return null;
  const rot = faceAwayFromRoad(spot.x, spot.z);
  const centred = { x: spot.x, z: spot.z, rot };
  const front = siteToWorld(centred, 0, depth / 2);
  return { x: front.x, z: front.z, rot };
}

/* ------------------------------------------------------------------ kiosk */

export interface KioskLook {
  wall: number;
  roof: number;
  awning: number;
  /** Half width and depth of the booth (default 2.2 × 3). */
  hw?: number;
  depth?: number;
  /** The clerk's look (defaults: random friendly person). */
  shirt?: number;
  dress?: boolean;
  cap?: number;
}

export interface Kiosk {
  site: Site;
  /** Site-local group: add a roof ornament, goods on the counter… */
  group: THREE.Group;
  clerk: Folk;
  /** Where the customer stands (world, on the ground) and the middle of the counter top (world). */
  stand: THREE.Vector3;
  counter: THREE.Vector3;
  /** The clerk shakes his head (with a low "hmm") / nods happily. */
  no(): void;
  yes(): void;
  update(dt: number): void;
}

export const KIOSK_HW = 2.2;
export const KIOSK_DEPTH = 3;

/**
 * Small open-front booth with a counter and a clerk behind it, looking at the road. Solid (pushed to `obstacles`).
 * No sign and no text: say what it is with an ornament on the roof (a big coin, a gem, scissors…).
 */
export function buildKiosk(scene: THREE.Object3D, obstacles: Obstacle[], site: Site, look: KioskLook, rng: () => number): Kiosk {
  const hw = look.hw ?? KIOSK_HW;
  const depth = look.depth ?? KIOSK_DEPTH;
  const g = siteGroup(scene, site);
  const wall = mat(look.wall);
  // floor, back wall, side walls, roof
  box(g, mat(0xd9c39a), hw * 2, 0.08, depth, 0, 0.04, -depth / 2);
  box(g, wall, hw * 2, 2.8, 0.2, 0, 1.4, -depth + 0.1);
  for (const s of [-1, 1]) box(g, wall, 0.2, 2.8, depth, s * (hw - 0.1), 1.4, -depth / 2);
  box(g, mat(look.roof), hw * 2 + 0.6, 0.25, depth + 0.6, 0, 2.92, -depth / 2);
  // striped awning over the counter
  for (let i = 0; i < 6; i++) {
    const w = (hw * 2) / 6;
    const a = box(g, mat(i % 2 ? 0xffffff : look.awning), w, 0.08, 1.2, -hw + w * (i + 0.5), 2.62, 0.45);
    a.rotation.x = 0.28;
  }
  // counter
  box(g, mat(0xfff3d6), hw * 2 - 0.4, 0.12, 0.8, 0, 1.0, -0.4);
  box(g, wall, hw * 2 - 0.4, 0.94, 0.6, 0, 0.47, -0.4);
  obstacles.push(siteBox(site, -hw, hw, -depth, 0));

  const clerk = buildFolk({
    shirt: look.shirt ?? pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    skin: pick(rng, SKINS),
    hair: pick(rng, HAIRS),
    dress: look.dress,
    longHair: look.dress,
    cap: look.cap,
  });
  clerk.group.position.set(0, 0, -1.5);
  clerk.group.rotation.y = Math.PI; // faces the road
  g.add(clerk.group);

  let mood: 'idle' | 'no' | 'yes' = 'idle';
  let t = 0;
  let time = 0;
  return {
    site,
    group: g,
    clerk,
    stand: siteToWorld(site, 0, 1.1),
    counter: siteToWorld(site, 0, -0.4, 1.1),
    no() {
      mood = 'no';
      t = 0;
      tone(196, 0, 0.3, 'sine', 0.13);
      tone(174.6, 0.28, 0.45, 'sine', 0.11);
    },
    yes() {
      mood = 'yes';
      t = 0;
    },
    update(dt) {
      time += dt;
      t += dt;
      clerk.head.rotation.y = mood === 'no' ? Math.sin(t * 11) * 0.55 * Math.max(0, 1 - t / 1.4) : 0;
      clerk.head.rotation.x = mood === 'yes' ? Math.sin(t * 12) * 0.3 * Math.max(0, 1 - t / 1.2) : 0;
      clerk.armR.rotation.z = mood === 'yes' ? Math.min(1, t * 4) * 2.4 * Math.max(0, 1 - Math.max(0, t - 1.2)) + Math.sin(t * 10) * 0.2 * (t < 1.4 ? 1 : 0) : 0;
      clerk.body.position.y = Math.sin(time * 1.6) * 0.015;
      if (t > 2.4) mood = 'idle';
    },
  };
}

/* ------------------------------------------------------------------ flying bits (coins, jewels) */

interface Flyer {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3 | (() => THREE.Vector3);
  t: number;
  dur: number;
  done?: () => void;
}

const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14);
const gemGeo = new THREE.OctahedronGeometry(0.2);
export const GEM_COLORS = [0xff3b7f, 0x3bc9ff, 0x7dff6b, 0xb06bff, 0xffe14d];

export function coinMesh(): THREE.Mesh {
  const m = new THREE.Mesh(coinGeo, mat(0xffd23f, 0.5));
  m.rotation.x = Math.PI / 2;
  return m;
}
export function gemMesh(color = GEM_COLORS[Math.floor(Math.random() * GEM_COLORS.length)], size = 1): THREE.Mesh {
  const m = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.1 }));
  m.scale.setScalar(size);
  return m;
}

/** Things flying in an arc from one point to another (the target may move: pass a function). */
export class Flyers {
  private list: Flyer[] = [];
  constructor(private readonly scene: THREE.Object3D) {}

  /** `delay` seconds before take-off; `done` runs on arrival (the mesh is removed). */
  send(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3 | (() => THREE.Vector3), dur = 0.5, delay = 0, done?: () => void): void {
    mesh.visible = false;
    this.scene.add(mesh);
    this.list.push({ mesh, from: from.clone(), to, t: -delay, dur, done });
  }

  get busy(): boolean {
    return this.list.length > 0;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      const to = typeof f.to === 'function' ? f.to() : f.to;
      f.mesh.visible = true;
      f.mesh.position.lerpVectors(f.from, to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 1.1;
      f.mesh.rotation.y += dt * 9;
      if (k >= 1) {
        f.mesh.removeFromParent();
        this.list.splice(i, 1);
        f.done?.();
      }
    }
  }

  clear(): void {
    for (const f of this.list) f.mesh.removeFromParent();
    this.list = [];
  }
}

export { ball, box, cyl, mat };
