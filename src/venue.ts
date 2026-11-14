import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { speak, tone } from './audio';
import type { GameCtx } from './gamectx';
import { isFree } from './spawn';
import { ROADS, SPAWN, type Interactable, type Obstacle } from './world';

/**
 * Shared pieces of the ticketed venues (concert, swimming pool):
 * plot finding beside a road, simple friendly people, a colourful fence, and the ticket booth + gate + doorman.
 *
 * Venue-local frame: x across, +Z points at the road, the front fence is z = 0, the venue is at z < 0.
 * The gate is the gap |x| < GATE_HW in the front fence; the booth sits right of it, the doorman left of it, inside.
 */

export const GATE_HW = 1.5;
export const FENCE_H = 2.4;
export const BOOTH = { x0: 2.2, x1: 5.2, z0: -2, z1: 0.3 };
export const STAND = { x: 3.7, z: 1.5 }; // where the customer stands, outside the booth
export const DOORMAN = { x: -2.4, z: -1.3 };
/** Front fence, metres from the road centre line: a ~10 m forecourt between the road and the gate, so nobody
 * steps out of a venue straight into the traffic. */
const SETBACK = 16;
/** Free space kept all around a venue (nothing glued to buildings or other objects). */
const CLEARANCE = 3;

export interface Plot {
  x: number;
  z: number;
  rot: number;
}

/* ------------------------------------------------------------------ meshes */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}_${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      emissive: emissive ? color : 0x000000,
      emissiveIntensity: emissive,
    });
    matCache.set(key, m);
  }
  return m;
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
const sphereGeo = new THREE.SphereGeometry(1, 14, 10);

export function box(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function cyl(parent: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(cylGeo, m);
  mesh.scale.set(r, h, r);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
export function ball(parent: THREE.Object3D, m: THREE.Material, r: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(sphereGeo, m);
  mesh.scale.setScalar(r);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export const pick = <T,>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const HAIRS = [0x2b1d14, 0x5a3825, 0x111111, 0xb5651d, 0xe8c547, 0xd9480f];
export const SHIRTS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419, 0xcc5de8, 0xff922b, 0x20c997, 0xf783ac, 0x748ffc, 0xffffff];
export const PANTS = [0x364fc7, 0x5c3d2e, 0x495057, 0x1b1b1b, 0x862e9c, 0x2b8a3e];

/* ------------------------------------------------------------------ placement */

/** Local (x, z) → world for a rotation that is a multiple of 90°. */
export function toWorld(ox: number, oz: number, rot: number, x: number, z: number): { x: number; z: number } {
  const c = Math.round(Math.cos(rot));
  const s = Math.round(Math.sin(rot));
  return { x: ox + x * c + z * s, z: oz - x * s + z * c };
}
export function worldBox(p: Plot, x0: number, x1: number, z0: number, z1: number, height?: number): Obstacle {
  const a = toWorld(p.x, p.z, p.rot, x0, z0);
  const b = toWorld(p.x, p.z, p.rot, x1, z1);
  const o: Obstacle = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  if (height !== undefined) o.height = height;
  return o;
}
const overlaps = (a: Obstacle, b: Obstacle): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

/**
 * A free plot (half width `hw`, depth `-back`) set back from a road, 50–130 m from the spawn, clear of everything
 * (with CLEARANCE all round, and an empty forecourt up to the pavement). Busy maps relax the margins a little.
 */
export function findPlot(hw: number, back: number, obstacles: Obstacle[], rng: () => number, avoid: THREE.Vector3[]): Plot | null {
  for (const [setback, pad] of [[SETBACK, CLEARANCE], [SETBACK, 2], [13, 2], [11, 1.5]] as const) {
    const p = findPlotWith(hw, back, obstacles, rng, avoid, setback, pad);
    if (p) return p;
  }
  return null;
}

function findPlotWith(
  hw: number,
  back: number,
  obstacles: Obstacle[],
  rng: () => number,
  avoid: THREE.Vector3[],
  setback: number,
  pad: number,
): Plot | null {
  const half = ROADS.width / 2;
  const roads: Obstacle[] = [
    ...ROADS.xs.map((x) => ({ minX: x - half - 1, maxX: x + half + 1, minZ: -999, maxZ: 999 })),
    ...ROADS.zs.map((z) => ({ minX: -999, maxX: 999, minZ: z - half - 1, maxZ: z + half + 1 })),
  ];
  const a = AIRPORT_ZONE;
  const airport: Obstacle = { minX: a.minX - 4, maxX: a.maxX + 4, minZ: a.minZ - 4, maxZ: a.maxZ + 4 };
  const found: Plot[] = [];
  const tryAt = (x: number, z: number, rot: number): void => {
    const p = { x, z, rot };
    // venue + margin, and the forecourt in front of it up to the pavement
    const fp = worldBox(p, -hw - pad, hw + pad, back - pad, setback - ROADS.width / 2 - 2.5); // stops before the street-lamp line (5.5 m from the centre)
    const c = toWorld(x, z, rot, 0, back / 2);
    const d = Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z);
    if (d < 50 || d > 130) return;
    if (Math.max(Math.abs(fp.minX), Math.abs(fp.maxX), Math.abs(fp.minZ), Math.abs(fp.maxZ)) > ROADS.extent - 10) return;
    const body = worldBox(p, -hw - pad, hw + pad, back - pad, 0.5); // the part that must not touch other roads
    if (overlaps(fp, airport) || roads.some((r) => overlaps(body, r)) || obstacles.some((o) => overlaps(fp, o))) return;
    const st = toWorld(x, z, rot, STAND.x, STAND.z);
    if (!isFree(st.x, st.z, 2, obstacles)) return; // room to walk up to the booth (no lamp post in the way)
    if (avoid.some((q) => q.x > fp.minX - 1 && q.x < fp.maxX + 1 && q.z > fp.minZ - 1 && q.z < fp.maxZ + 1)) return;
    found.push(p);
  };
  for (let t = -ROADS.extent + 20; t <= ROADS.extent - 20; t += 3) {
    for (const side of [-1, 1]) {
      for (const rz of ROADS.zs) tryAt(t, rz + side * setback, side < 0 ? 0 : Math.PI);
      for (const rx of ROADS.xs) tryAt(rx + side * setback, t, -side * (Math.PI / 2));
    }
  }
  return found.length ? found[Math.floor(rng() * found.length)] : null;
}

/* ------------------------------------------------------------------ people */

export interface Folk {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
}

/** A friendly, smiling person (faces -Z like everyone in the game). */
export function buildFolk(o: {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  dress?: boolean;
  longHair?: boolean;
  cap?: number;
  /** swimsuit look: arms and legs are skin */
  bare?: boolean;
}): Folk {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 8);
  const [legL, legR] = [-1, 1].map((side) => {
    const leg = new THREE.Mesh(legGeo, mat(o.dress || o.bare ? o.skin : o.pants));
    leg.position.set(side * 0.15, 0.4, 0);
    leg.castShadow = true;
    group.add(leg);
    return leg;
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 12), mat(o.shirt));
  torso.position.y = 1.22;
  torso.castShadow = true;
  body.add(torso);
  if (o.dress) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 18), mat(o.shirt));
    skirt.position.y = 0.88;
    skirt.castShadow = true;
    body.add(skirt);
  }
  const head = new THREE.Group();
  head.position.y = 1.95;
  body.add(head);
  ball(head, mat(o.skin), 0.3, 0, 0, 0);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.315, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), mat(o.hair));
  hair.position.set(0, 0.03, 0.03);
  head.add(hair);
  if (o.longHair) box(head, mat(o.hair), 0.56, 0.6, 0.18, 0, -0.25, 0.2);
  if (o.cap !== undefined) {
    cyl(head, mat(o.cap), 0.3, 0.14, 0, 0.22, 0);
    box(head, mat(o.cap), 0.4, 0.04, 0.28, 0, 0.17, -0.3);
  }
  const dark = mat(0x161616);
  for (const side of [-1, 1]) ball(head, dark, 0.05, side * 0.11, 0.04, -0.27);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.024, 6, 10, Math.PI), dark);
  smile.position.set(0, -0.1, -0.27);
  smile.rotation.z = Math.PI; // lower half-ring = a smile
  head.add(smile);
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.5, 4, 8);
  const [armL, armR] = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.42, 1.55, 0);
    const arm = new THREE.Mesh(armGeo, mat(o.bare ? o.skin : o.shirt));
    arm.position.y = -0.33;
    arm.castShadow = true;
    pivot.add(arm);
    body.add(pivot);
    return pivot;
  });
  return { group, body, head, armL, armR, legL, legR };
}

/* ------------------------------------------------------------------ fence */

/** Colourful fence around the venue (gap for the gate and the booth in the front) + its obstacles. */
export function buildFence(root: THREE.Object3D, plot: Plot, hw: number, back: number, obstacles: Obstacle[], colors: number[]): void {
  let k = 0;
  const panel = (x0: number, x1: number, z0: number, z1: number) => {
    const along = x1 - x0 > z1 - z0;
    const len = Math.max(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i < n; i++) {
      const mid = (along ? x0 : z0) + (len / n) * (i + 0.5);
      box(root, mat(colors[k++ % colors.length]), along ? len / n - 0.05 : 0.3, FENCE_H, along ? 0.3 : len / n - 0.05, along ? mid : x0, FENCE_H / 2, along ? z0 : mid);
    }
    box(root, mat(0xffffff), x1 - x0 + 0.3, 0.12, z1 - z0 + 0.3, (x0 + x1) / 2, FENCE_H + 0.06, (z0 + z1) / 2);
  };
  panel(-hw, -GATE_HW - 0.2, 0, 0);
  panel(GATE_HW + 0.2, BOOTH.x0, 0, 0);
  panel(BOOTH.x1, hw, 0, 0);
  panel(-hw, -hw, back, 0);
  panel(hw, hw, back, 0);
  panel(-hw, hw, back, back);
  const T = 0.15;
  const W = (x0: number, x1: number, z0: number, z1: number, h?: number) => obstacles.push(worldBox(plot, x0, x1, z0, z1, h));
  W(-hw - T, -GATE_HW, -T, T, FENCE_H);
  W(GATE_HW, hw + T, -T, T, FENCE_H);
  W(-hw - T, -hw + T, back, 0, FENCE_H);
  W(hw - T, hw + T, back, 0, FENCE_H);
  W(-hw - T, hw + T, back - T, back + T, FENCE_H);
}

/* ------------------------------------------------------------------ ticket booth + gate + doorman */

type Mood = 'idle' | 'no' | 'yes' | 'wave';

export interface TicketGateOpts {
  price: number;
  hw: number;
  back: number;
  boothColor: number;
  roofColor: number;
  /** Is the booth selling now? (concert: only around show time). Closed = shutter down, the seller shakes his head. */
  salesOpen?: () => boolean;
  /** Keep the gate open (e.g. the audience walking in/out). */
  forceOpen?: () => boolean;
  /** Called when she walks out of the venue. */
  onExit?: () => void;
  /** May she walk out now? (pool: not in a swimsuit). When false the doorman shakes his head and points. */
  canLeave?: () => boolean;
  /** Arm the doorman points with when refusing (towards the cabins). */
  refuseSide?: -1 | 1;
  /** Spoken (once in a while) when refusing to let her out. */
  refuseLine?: string;
  /** Spoken the first time she walks in. */
  greeting?: string;
  /** Called when she walks in with a ticket (the ticket is taken). */
  onEnter?: () => void;
}

/**
 * Ticket booth by the gate (tap / Enter to buy: coins fly to the window, a ticket flies back into her left hand),
 * a two-door gate in the front fence and a doorman just inside. No prices, text or icons anywhere.
 * Without a ticket the doorman shakes his head and points at the booth; with one the gate swings open and he
 * takes it as she walks in. Leaving is free (unless `canLeave` says no); coming back needs a new ticket.
 */
export class TicketGate {
  readonly booth: Interactable;
  private readonly gateBox: Obstacle;
  private readonly gateClosed: Obstacle;
  private readonly doors: THREE.Group[] = [];
  private gateOpen = 0;
  private gateWanted = false;
  hasTicket = false;
  private ticketMesh: THREE.Group | null = null;
  private wasAtGate = false;
  private sinceInside = 99;
  private exitPending = false;
  private lastRefuseLine = 0;
  private welcomed = false;
  private _inside = false;
  private readonly doorman: Folk;
  private doormanMood: Mood = 'idle';
  private doormanT = 0;
  private refusing = 1; // arm the doorman points with
  private readonly seller: Folk;
  private readonly shutter: THREE.Mesh;
  private sellerMood: Mood = 'idle';
  private sellerT = 0;
  private busy = false;
  private tweens: { t: number; dur: number; step(k: number): void; done?(): void }[] = [];

  constructor(
    private readonly root: THREE.Group,
    private readonly scene: THREE.Scene,
    private readonly ctx: GameCtx,
    plot: Plot,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly o: TicketGateOpts,
  ) {
    // gate doors: white frame with coloured bars
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * GATE_HW, 0, 0);
      box(pivot, mat(0xffffff), GATE_HW, 0.12, 0.1, -s * (GATE_HW / 2), 1.8, 0);
      box(pivot, mat(0xffffff), GATE_HW, 0.12, 0.1, -s * (GATE_HW / 2), 0.25, 0);
      for (let i = 0; i < 4; i++) box(pivot, mat([0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7][i]), 0.08, 1.6, 0.08, -s * (0.2 + i * 0.36), 1.0, 0);
      root.add(pivot);
      this.doors.push(pivot);
    }
    for (const s of [-1, 1]) box(root, mat(0xffffff), 0.35, 3.2, 0.35, s * (GATE_HW + 0.2), 1.6, 0);
    // doorman just inside, beside the gate, facing out
    this.doorman = buildFolk({ shirt: 0x1c7ed6, pants: 0x212529, skin: pick(rng, SKINS), hair: 0x2b1d14, cap: 0xe03131 });
    this.doorman.group.position.set(DOORMAN.x, 0, DOORMAN.z);
    this.doorman.group.rotation.y = Math.PI;
    root.add(this.doorman.group);

    // booth
    const g = new THREE.Group();
    root.add(g);
    const B = BOOTH;
    const cx = (B.x0 + B.x1) / 2;
    const w = B.x1 - B.x0;
    const d = B.z1 - B.z0;
    const wall = mat(o.boothColor);
    box(g, wall, w, 3, 0.2, cx, 1.5, B.z0 + 0.1);
    box(g, wall, 0.2, 3, d, B.x0 + 0.1, 1.5, (B.z0 + B.z1) / 2);
    box(g, wall, 0.2, 3, d, B.x1 - 0.1, 1.5, (B.z0 + B.z1) / 2);
    box(g, wall, w, 1.1, 0.2, cx, 0.55, B.z1 - 0.1);
    box(g, mat(0xffffff), w + 0.2, 0.1, 0.55, cx, 1.15, B.z1 + 0.05);
    box(g, wall, w, 0.75, 0.2, cx, 2.62, B.z1 - 0.1);
    box(g, mat(o.roofColor), w + 0.5, 0.2, d + 0.6, cx, 3.05, (B.z0 + B.z1) / 2 + 0.1);
    const sign = makeTicket(3.2); // a giant ticket on the roof: the shape tells what's sold here
    sign.position.set(cx, 3.75, B.z1 - 0.3);
    g.add(sign);
    this.seller = buildFolk({ shirt: 0xfab005, pants: 0x495057, skin: pick(rng, SKINS), hair: pick(rng, HAIRS), longHair: rng() < 0.5 });
    this.seller.group.position.set(cx, 0, B.z0 + 0.75);
    this.seller.group.rotation.y = Math.PI;
    g.add(this.seller.group);
    // roll-down shutter over the window (closed hours)
    this.shutter = box(g, mat(0xadb5bd), w - 0.3, 0.95, 0.06, cx, 1.67, B.z1 + 0.02);
    this.shutter.visible = false;

    const T = 0.15;
    obstacles.push(worldBox(plot, B.x0, B.x1, B.z0, B.z1, 2.9));
    obstacles.push(worldBox(plot, DOORMAN.x - 0.4, DOORMAN.x + 0.4, DOORMAN.z - 0.4, DOORMAN.z + 0.4, 2.2));
    this.gateBox = worldBox(plot, -GATE_HW, GATE_HW, -T, T, FENCE_H);
    this.gateClosed = { ...this.gateBox };
    obstacles.push(this.gateBox);

    const st = toWorld(plot.x, plot.z, plot.rot, STAND.x, STAND.z);
    this.booth = { object: g, position: new THREE.Vector3(st.x, 0, st.z), radius: 1.7, requiresClick: true, interact: () => this.buy() };
  }

  /** She is inside the fence (on foot). */
  get inside(): boolean {
    return this._inside;
  }

  private buy(): void {
    if (this.ctx.isPaused() || this.ctx.isDriving() || this.busy) return;
    if (this.hasTicket) {
      this.mood('seller', 'wave');
      return;
    }
    if (this.o.salesOpen && !this.o.salesOpen()) {
      this.mood('seller', 'no'); // closed now
      hmm();
      return;
    }
    if (this.ctx.coins() < this.o.price) {
      this.mood('seller', 'no');
      hmm();
      return;
    }
    this.busy = true;
    this.ctx.addCoins(-this.o.price);
    const win = this.root.localToWorld(new THREE.Vector3(3.7, 1.4, BOOTH.z1));
    const coinGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14);
    for (let i = 0; i < this.o.price; i++) {
      const coin = new THREE.Mesh(coinGeo, mat(0xffd43b, 0.3));
      coin.rotation.x = Math.PI / 2;
      this.scene.add(coin);
      const from = this.ctx.player.clone().setY(1.1);
      this.tween(0.45, i * 0.1, (k) => {
        coin.position.lerpVectors(from, win, k);
        coin.position.y += Math.sin(k * Math.PI) * 0.8;
        coin.rotation.z += 0.3;
      }, () => {
        this.scene.remove(coin);
        tone(1568 + Math.random() * 120, 0, 0.06, 'square', 0.05);
        tone(2349, 0.04, 0.14, 'triangle', 0.06);
      });
    }
    this.tween(0.01, (this.o.price - 1) * 0.1 + 0.55, () => {}, () => {
      this.mood('seller', 'yes');
      const ticket = makeTicket(1.4);
      this.scene.add(ticket);
      this.tween(0.5, 0, (k) => {
        ticket.position.lerpVectors(win, this.handPos(), k);
        ticket.position.y += Math.sin(k * Math.PI) * 0.6;
        ticket.rotation.y = this.ctx.heading();
      }, () => {
        this.ticketMesh = ticket;
        this.hasTicket = true;
        this.busy = false;
        [659.3, 784, 987.8, 1318.5].forEach((f, i) => tone(f, i * 0.07, 0.18, 'triangle', 0.08));
      });
    });
  }

  private mood(who: 'seller' | 'doorman', m: Mood): void {
    if (who === 'seller') {
      this.sellerMood = m;
      this.sellerT = 0;
    } else {
      this.doormanMood = m;
      this.doormanT = 0;
    }
  }

  /** Her left hand (the right one holds shop items). */
  private handPos(): THREE.Vector3 {
    const h = this.ctx.heading();
    const p = this.ctx.player;
    const lx = -0.42;
    const lz = -0.32;
    return new THREE.Vector3(p.x + lx * Math.cos(h) + lz * Math.sin(h), 1.0, p.z - lx * Math.sin(h) + lz * Math.cos(h));
  }

  private tween(dur: number, delay: number, step: (k: number) => void, done?: () => void): void {
    this.tweens.push({ t: -delay, dur, step, done });
  }

  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
    const { hw, back } = this.o;
    const lp = this.root.worldToLocal(this.ctx.player.clone());
    const driving = this.ctx.isDriving();
    this._inside = !driving && Math.abs(lp.x) < hw - 0.15 && lp.z < -0.15 && lp.z > back + 0.15;
    const outsideNear = !driving && lp.z >= 0 && lp.z < 5 && Math.abs(lp.x) < 5;
    const atGateOutside = !driving && lp.z >= 0 && lp.z < 2.2 && Math.abs(lp.x) < 2;
    const insideNear = this._inside && lp.z > -4 && Math.abs(lp.x) < 3;
    const inGateway = Math.abs(lp.x) < GATE_HW + 0.5 && Math.abs(lp.z) < 0.9;

    // she walked in with her ticket: the doorman takes it
    if (this.hasTicket && this._inside && lp.z < -1) {
      this.hasTicket = false;
      const t = this.ticketMesh;
      this.ticketMesh = null;
      this.mood('doorman', 'yes');
      if (t) {
        const from = t.position.clone();
        const to = this.root.localToWorld(new THREE.Vector3(DOORMAN.x, 1.3, DOORMAN.z));
        this.tween(0.4, 0, (k) => t.position.lerpVectors(from, to, k), () => this.scene.remove(t));
      }
      tone(880, 0, 0.08, 'triangle', 0.06);
      this.o.onEnter?.();
      if (this.o.greeting && !this.welcomed && !speechSynthesis.speaking) {
        this.welcomed = true;
        void speak([this.o.greeting]);
      }
    }
    // no ticket: the doorman shakes his head and points at the booth (not right after she walked out)
    if (atGateOutside && !this.hasTicket && !this.busy && !this.wasAtGate) {
      this.refusing = -1;
      this.mood('doorman', 'no');
      hmm();
    }
    this.wasAtGate = atGateOutside || this.sinceInside < 3;
    // walked out (leaving is always allowed)
    if (this._inside) this.exitPending = true;
    else if (this.exitPending && lp.z > 0.2) {
      this.exitPending = false;
      this.o.onExit?.();
    }
    this.sinceInside = this._inside ? 0 : this.sinceInside + dt;
    if (this.shutter) this.shutter.visible = !!this.o.salesOpen && !this.o.salesOpen();

    // the gate lets HER through only with a ticket (or on the way out); when the crowd walks in/out the doors stand
    // open but the doorway still blocks her without a ticket (the crowd doesn't collide with obstacles)
    const mayLeave = this.o.canLeave?.() ?? true;
    const atGateInside = this._inside && lp.z > -2.6 && Math.abs(lp.x) < 2.2;
    if (atGateInside && !mayLeave && this.doormanMood === 'idle' && this.doormanT > 2) {
      this.refusing = this.o.refuseSide ?? 1;
      this.mood('doorman', 'no');
      hmm();
      if (this.o.refuseLine && performance.now() - this.lastRefuseLine > 8000 && !speechSynthesis.speaking) {
        this.lastRefuseLine = performance.now();
        void speak([this.o.refuseLine]);
      }
    }
    const want = (insideNear && mayLeave) || (outsideNear && this.hasTicket) || (this.gateWanted && inGateway);
    const crowd = !!this.o.forceOpen?.();
    if (want !== this.gateWanted) {
      this.gateWanted = want;
      if (want) Object.assign(this.gateBox, { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 });
      else Object.assign(this.gateBox, this.gateClosed);
      if (!crowd) tone(want ? 520 : 390, 0, 0.12, 'triangle', 0.05);
    }
    this.gateOpen += ((want || crowd ? 1 : 0) - this.gateOpen) * Math.min(1, dt * 5);
    this.doors[0].rotation.y = this.gateOpen * 1.5;
    this.doors[1].rotation.y = -this.gateOpen * 1.5;

    if (this.ticketMesh) {
      this.ticketMesh.position.copy(this.handPos());
      this.ticketMesh.rotation.set(0, this.ctx.heading(), 0);
    }
    this.doormanT += dt;
    this.sellerT += dt;
    this.doormanMood = animateStaff(this.doorman, this.doormanMood, this.doormanT, this.refusing);
    this.sellerMood = animateStaff(this.seller, this.sellerMood, this.sellerT, 0);
  }

  dispose(): void {
    if (this.ticketMesh) this.scene.remove(this.ticketMesh);
  }

  debug(): { ticket: boolean; inside: boolean; gateOpen: number } {
    return { ticket: this.hasTicket, inside: this._inside, gateOpen: +this.gateOpen.toFixed(2) };
  }
}

function hmm(): void {
  tone(196, 0, 0.3, 'sine', 0.12);
  tone(174.6, 0.28, 0.45, 'sine', 0.1);
}

/** Shake head (and point with `pointSide` arm) / nod and cheer / wave; returns the mood to keep. */
export function animateStaff(f: Folk, mood: Mood, t: number, pointSide: number): Mood {
  f.head.rotation.y = 0;
  f.head.rotation.x = 0;
  f.armL.rotation.set(0, 0, -0.08);
  f.armR.rotation.set(0, 0, 0.08);
  if (mood === 'no') {
    f.head.rotation.y = Math.sin(t * 16) * 0.45;
    if (pointSide < 0) f.armL.rotation.set(0, 0, -1.45);
    else if (pointSide > 0) f.armR.rotation.set(0, 0, 1.45);
    return t > 1.3 ? 'idle' : mood;
  }
  if (mood === 'yes') {
    f.head.rotation.x = Math.sin(t * 12) * 0.25;
    f.armR.rotation.set(0, 0, 2.6 + Math.sin(t * 10) * 0.3);
    return t > 1.2 ? 'idle' : mood;
  }
  if (mood === 'wave') {
    f.armR.rotation.set(0, 0, 2.5 + Math.sin(t * 9) * 0.4);
    return t > 1.2 ? 'idle' : mood;
  }
  return 'idle';
}

/** A paper ticket (pink, with a star and a tear line), `size` = scale. */
export function makeTicket(size: number): THREE.Group {
  const t = new THREE.Group();
  box(t, mat(0xff4d8d, 0.15), 0.3, 0.16, 0.012, 0, 0, 0);
  box(t, mat(0xffffff), 0.012, 0.13, 0.016, 0.07, 0, 0);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), mat(0xffd43b, 0.4));
  star.position.set(-0.04, 0, 0.012);
  star.scale.z = 0.3;
  t.add(star);
  t.scale.setScalar(size);
  return t;
}
