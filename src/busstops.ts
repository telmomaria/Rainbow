import * as THREE from 'three';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';
import { inNoSpawn, isFree } from './spawn';

/**
 * Bus lines + bus stops. Each bus (traffic.ts) follows a fixed route: a closed list of crossings of the street grid,
 * turning left/right/straight at each one to head for the next. The routes cover every inner road segment (both
 * directions) of ROADS.xs × ROADS.zs. Each city gets 2–3 stops (on different roads, on the door side = the right
 * of the lane): a small shelter with a roof and a bench, and a pole with a round coloured sign — no text.
 */

export type Axis = 'x' | 'z';

export interface BusLane {
  axis: Axis;
  road: number;
  dir: 1 | -1;
  /** Along-axis range of this road segment (crossing centre to crossing centre). */
  lo: number;
  hi: number;
}

export interface Crossing {
  x: number;
  z: number;
}

// crossings of the grid: A B (south row) · C D (middle) · E F (north) — x ∈ xs, z ∈ zs
const [X0, X1] = ROADS.xs;
const [Z0, Z1, Z2] = ROADS.zs;
const A = { x: X0, z: Z0 }, B = { x: X1, z: Z0 };
const C = { x: X0, z: Z1 }, D = { x: X1, z: Z1 };
const E = { x: X0, z: Z2 }, F = { x: X1, z: Z2 };

/**
 * Bus routes (closed, no U-turns). [0] the "big figure": all 7 inner road segments in both directions;
 * [1] the outer ring, clockwise. Stops are only on the ring's clockwise lanes (door side = inside the ring),
 * so every bus of both lines stops at every stop and there is always a next stop to get off at.
 */
export const BUS_ROUTES: Crossing[][] = [
  [A, B, D, C, E, F, D, B, A, C, D, F, E, C],
  [A, B, D, F, E, C],
];

/** Directed road segments of a route: segment i goes from route[i] to route[i+1]. */
export function routeLanes(route: Crossing[]): BusLane[] {
  return route.map((p, i) => {
    const q = route[(i + 1) % route.length];
    if (p.z === q.z) return { axis: 'x' as const, road: p.z, dir: (q.x > p.x ? 1 : -1) as 1 | -1, lo: Math.min(p.x, q.x), hi: Math.max(p.x, q.x) };
    return { axis: 'z' as const, road: p.x, dir: (q.z > p.z ? 1 : -1) as 1 | -1, lo: Math.min(p.z, q.z), hi: Math.max(p.z, q.z) };
  });
}

/** Where stops may go: the outer ring, clockwise lanes (served by both lines). */
const STOP_LANES: BusLane[] = routeLanes(BUS_ROUTES[1]);

/** The bus's front door is this far ahead of its centre (bus local z = -DOOR_FWD). */
export const DOOR_FWD = 3.4;
/** Bus centre must stay this far from a crossing centre at a stop (clear of the right-of-way logic). */
const CROSS_CLEAR = 30;
const SPAWN_CLEAR = 25;
const ROAD_EDGE = ROADS.width / 2;

export interface BusStop {
  axis: Axis;
  road: number;
  dir: 1 | -1;
  /** Bus centre coordinate (along the axis) when it is stopped here. */
  s: number;
  /** Pavement point next to the bus's front door (board here). */
  door: THREE.Vector3;
  /** Where she steps down to (pavement, beside the shelter, a few metres from the door). */
  off: { x: number; z: number; h: number };
  group: THREE.Group;
}

const SIGN_COLORS = [0xffc300, 0x3a86ff, 0xff5d8f];

/** Forward and right unit vectors of a lane. */
export function laneFrame(axis: Axis, dir: number): { fx: number; fz: number; rx: number; rz: number } {
  const fx = axis === 'x' ? dir : 0;
  const fz = axis === 'z' ? dir : 0;
  // right of (fx, fz) is (-fz, fx)
  return { fx, fz, rx: -fz, rz: fx };
}

/** Pick and build the stops (call early, right after the street lamps, so later things avoid them). */
export function createBusStops(scene: THREE.Scene, obstacles: Obstacle[], rand: () => number): BusStop[] {
  const stops: BusStop[] = [];
  const sides = STOP_LANES.map((l, i) => ({ l, i, k: rand() })).sort((a, b) => a.k - b.k);
  const want = 3;
  for (const margin of [2, 1]) {
    for (const { l } of sides) {
      if (stops.length >= want) break;
      // one per road, and spread out (different parts of town)
      if (stops.some((s) => s.axis === l.axis && s.road === l.road)) continue;
      if (stops.some((s) => Math.hypot(s.door.x - (l.axis === 'x' ? (l.lo + l.hi) / 2 : l.road), s.door.z - (l.axis === 'x' ? l.road : (l.lo + l.hi) / 2)) < 50)) continue;
      const cands: number[] = [];
      for (let s = l.lo + CROSS_CLEAR; s <= l.hi - CROSS_CLEAR; s += 1.5) cands.push(s);
      for (let i = cands.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [cands[i], cands[j]] = [cands[j], cands[i]];
      }
      for (const s of cands) {
        const st = tryStop(l, s, obstacles, margin, stops.length);
        if (!st) continue;
        scene.add(st.stop.group);
        obstacles.push(...st.boxes);
        stops.push(st.stop);
        break;
      }
    }
    if (stops.length >= 2) break;
  }
  return stops;
}

function tryStop(
  l: BusLane,
  s: number,
  obstacles: Obstacle[],
  margin: number,
  n: number,
): { stop: BusStop; boxes: Obstacle[] } | null {
  const { fx, fz, rx, rz } = laneFrame(l.axis, l.dir);
  const doorS = s + l.dir * DOOR_FWD;
  // road-edge point next to the door: origin of the stop's local frame (local x = forward, local z = away from road)
  const ox = (l.axis === 'x' ? doorS : l.road) + rx * ROAD_EDGE;
  const oz = (l.axis === 'x' ? l.road : doorS) + rz * ROAD_EDGE;
  const W = (lx: number, lz: number) => ({ x: ox + fx * lx + rx * lz, z: oz + fz * lx + rz * lz });
  const aabb = (x0: number, x1: number, z0: number, z1: number): Obstacle => {
    const a = W(x0, z0);
    const b = W(x1, z1);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  };
  if (Math.hypot(ox - SPAWN.x, oz - SPAWN.z) < SPAWN_CLEAR) return null;
  // clear area: the whole stop + the waiting/step-down strip in front + `margin` m behind (walk-past room)
  const clear = aabb(-5, 2.4, 0.15, 2.3 + margin);
  if (obstacles.some((o) => o.maxX > clear.minX && o.minX < clear.maxX && o.maxZ > clear.minZ && o.minZ < clear.maxZ)) return null;
  const door = W(0, 0.75);
  const off = W(-3.6, 0.75);
  for (const p of [door, off]) {
    if (onRoad(p.x, p.z, 0.3) || !isFree(p.x, p.z, 0.6, obstacles) || inNoSpawn(p.x, p.z, 0.6)) return null;
  }
  const centre = W(-1.5, 1.7);
  if (onRoad(centre.x, centre.z, 0.5) || inNoSpawn(centre.x, centre.z, 3)) return null;

  const group = new THREE.Group();
  group.position.set(ox, 0, oz);
  group.rotation.y = Math.atan2(-fz, fx); // local +X → forward, local +Z → away from the road
  buildShelter(group, SIGN_COLORS[n % SIGN_COLORS.length]);
  const heading = Math.atan2(fx, fz); // facing back along the road (towards the coming bus) — she turns anyway
  return {
    stop: {
      axis: l.axis,
      road: l.road,
      dir: l.dir,
      s,
      door: new THREE.Vector3(door.x, 0, door.z),
      off: { x: off.x, z: off.z, h: heading },
      group,
    },
    boxes: [
      aabb(-2.95, -0.25, 1.25, 2.25), // shelter + bench
      aabb(1.25, 1.55, 0.3, 0.6), // pole
    ],
  };
}

const mats = new Map<number, THREE.MeshStandardMaterial>();
function m(color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const key = color * 7 + (extra ? 1 : 0);
  let r = mats.get(key);
  if (!r) {
    r = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
    mats.set(key, r);
  }
  return r;
}
const BOXG = new THREE.BoxGeometry(1, 1, 1);
function part(parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(BOXG, mat);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildShelter(g: THREE.Group, color: number): void {
  const frame = m(0x5c677d);
  const glass = m(0xbfe6ff, { transparent: true, opacity: 0.45, roughness: 0.1 });
  const roof = m(color);
  // shelter: x ∈ [-2.9, -0.3], back wall at z ≈ 2.2
  for (const x of [-2.85, -0.35]) for (const z of [1.3, 2.15]) part(g, frame, 0.08, 2.3, 0.08, x, 1.15, z);
  part(g, glass, 2.5, 1.7, 0.05, -1.6, 1.25, 2.17); // back
  part(g, glass, 0.05, 1.7, 0.8, -2.85, 1.25, 1.72); // side
  part(g, roof, 2.9, 0.12, 1.3, -1.6, 2.36, 1.7); // roof
  part(g, m(0xffffff), 2.9, 0.06, 1.32, -1.6, 2.44, 1.7); // roof trim
  // bench
  part(g, m(0xc77d3a), 2.1, 0.08, 0.42, -1.6, 0.48, 1.88);
  part(g, m(0xc77d3a), 2.1, 0.32, 0.06, -1.6, 0.78, 2.1);
  for (const x of [-2.5, -0.7]) part(g, frame, 0.07, 0.44, 0.36, x, 0.24, 1.88);
  // pole with a round sign (two coloured discs and a white ring; no text)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), frame);
  pole.position.set(1.4, 1.35, 0.45);
  pole.castShadow = true;
  g.add(pole);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 20), m(0xffffff));
  disc.rotation.z = Math.PI / 2; // disc faces along the road (seen by whoever walks or drives along it)
  disc.position.set(1.4, 2.55, 0.45);
  g.add(disc);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20), m(color));
  inner.rotation.z = Math.PI / 2;
  inner.position.copy(disc.position);
  g.add(inner);
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14), m(0x2b2d42));
  dot.rotation.z = Math.PI / 2;
  dot.position.copy(disc.position);
  g.add(dot);
  // kerb-side yellow box marking on the road edge (where the bus pulls in)
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.15), m(0xffd60a));
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(-1.6, 0.025, -0.1);
  g.add(mark);
}
