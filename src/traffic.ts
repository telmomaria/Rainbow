import * as THREE from 'three';
import { tone } from './audio';
import type { GameCtx } from './gamectx';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';

/**
 * Town traffic: little cars driving the ROADS grid on the right (Portugal), lanes at ±2 m from each centre line.
 * They queue behind each other and behind any obstacle box in their lane, take turns at crossings
 * (one lane-flow at a time), turn left/right on smooth curves, and wrap around at the map edge.
 * They do NOT stop for the pedestrian: they honk and slow a little; touching a moving car = onRunOver.
 * No UI — feedback is horn, screech and movement only.
 */

const LANE = 2; // lane centre offset from the road centre line
const ACCEL = 3.5; // m/s²
const BRAKE = 10; // m/s², normal braking
const HARD_BRAKE = 16; // run-over screech
const PLAN_DEC = 5; // deceleration used to plan smooth stops
const TURN_SPEED = 5.5;
const FOLLOW_GAP = 2.5; // bumper-to-bumper gap when queuing
const STOP_LINE = 5; // stop line distance (front bumper) from the crossing centre
const PLAYER_R = 0.45;

type Axis = 'x' | 'z';
type Kind = 'hatch' | 'van' | 'taxi' | 'bus';

interface Plan {
  /** Crossing coordinate along the car's axis. */
  c: number;
  /** 0 straight, 1 right, -1 left. */
  turn: 0 | 1 | -1;
  stopS: number;
  startS: number;
  locked: boolean;
  ix: number;
  iz: number;
  // turn geometry (when turn != 0)
  p0: { x: number; z: number };
  p1: { x: number; z: number };
  p2: { x: number; z: number };
  len: number;
  nextAxis: Axis;
  nextRoad: number;
  nextDir: 1 | -1;
}

interface Hold {
  key: string;
  ix: number;
  iz: number;
  passed: boolean;
  laneKey: string;
  axis: Axis;
  turn: 0 | 1 | -1;
  car: TCar;
}

interface TCar {
  group: THREE.Group;
  body: THREE.Group;
  wheels: { mesh: THREE.Mesh; r: number }[];
  kind: Kind;
  hl: number;
  hw: number;
  cruise: number;
  speed: number;
  mode: 'straight' | 'turn' | 'hidden';
  axis: Axis;
  road: number;
  dir: 1 | -1;
  s: number;
  t: number;
  plan: Plan | null;
  hold: Hold | null;
  x: number;
  z: number;
  heading: number;
  stopTimer: number;
  honkCd: number;
  blocked: number;
  bounce: number;
}

/* ---------- shared geometry / materials ---------- */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14);
WHEEL.rotateZ(Math.PI / 2);
const LAMP = new THREE.SphereGeometry(1, 10, 8);
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.08, ...extra });
    matCache.set(key, m);
  }
  return m;
}
const GLASS = (): THREE.MeshStandardMaterial => mat(0x9fdcff, { roughness: 0.1, metalness: 0.3 });
const DARK = (): THREE.MeshStandardMaterial => mat(0x222831, { roughness: 0.8 });
const WHITE = (): THREE.MeshStandardMaterial => mat(0xf4f4f4);
const HEAD = (): THREE.MeshStandardMaterial => mat(0xfff6c0, { emissive: 0xfff0a0, emissiveIntensity: 0.6 });
const TAIL = (): THREE.MeshStandardMaterial => mat(0xff3030, { emissive: 0x800000 });

function box(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Build a car facing -Z (same convention as the player's car). Returns half sizes. */
function buildCar(kind: Kind, color: number, group: THREE.Group, body: THREE.Group, wheels: TCar['wheels']): { hl: number; hw: number } {
  const paint = mat(color, { roughness: 0.35 });
  let hl: number, hw: number, wr: number, wheelZ: number;
  group.add(body);
  if (kind === 'bus') {
    hl = 5;
    hw = 1.25;
    wr = 0.55;
    wheelZ = 3.4;
    box(body, paint, hw * 2, 1.4, hl * 2, 0, 0.95, 0);
    box(body, GLASS(), hw * 2 + 0.04, 0.9, hl * 2 - 1.4, 0, 2.1, 0.5);
    box(body, GLASS(), hw * 2 - 0.3, 1.2, 0.06, 0, 2.0, -hl - 0.01); // big windscreen
    box(body, WHITE(), hw * 2, 0.35, hl * 2, 0, 2.72, 0); // roof
    box(body, paint, hw * 2 + 0.02, 0.9, 1.0, 0, 2.1, -hl + 0.5 + 0.2); // front pillar band
    box(body, mat(0x2b2d42), 1.4, 0.3, 0.06, 0, 2.7, -hl - 0.02); // destination board (blank)
  } else if (kind === 'van') {
    hl = 2.4;
    hw = 1.05;
    wr = 0.42;
    wheelZ = 1.55;
    box(body, paint, hw * 2, 1.9, hl * 2 - 0.6, 0, 1.55, 0.3);
    box(body, paint, hw * 2, 0.8, 0.8, 0, 0.95, -hl + 0.4); // bonnet
    box(body, GLASS(), hw * 2 - 0.2, 0.8, 0.06, 0, 1.95, -hl + 0.78); // windscreen
    box(body, GLASS(), hw * 2 + 0.04, 0.55, 0.9, 0, 2.0, -hl + 1.3); // cab side windows
    box(body, WHITE(), hw * 2 + 0.04, 0.18, hl * 2 - 1.6, 0, 1.2, 0.7); // side stripe
  } else {
    // hatchback / taxi
    hl = 1.9;
    hw = 0.95;
    wr = 0.38;
    wheelZ = 1.2;
    const roofMat = kind === 'taxi' ? mat(0x2ec27e) : paint;
    box(body, paint, hw * 2, 0.65, hl * 2, 0, 0.72, 0);
    box(body, GLASS(), hw * 2 - 0.2, 0.5, 2.0, 0, 1.3, 0.35);
    box(body, roofMat, hw * 2 - 0.12, 0.13, 2.2, 0, 1.61, 0.35);
    if (kind === 'taxi') box(body, mat(0xfff3a0, { emissive: 0xffe066, emissiveIntensity: 0.5 }), 0.7, 0.22, 0.32, 0, 1.79, 0.3);
  }
  // lamps and bumpers
  const lampY = kind === 'bus' ? 0.75 : kind === 'van' ? 0.95 : 0.78;
  for (const side of [-1, 1]) {
    const hlMesh = new THREE.Mesh(LAMP, HEAD());
    hlMesh.scale.setScalar(0.15);
    hlMesh.position.set(side * (hw - 0.3), lampY, -hl - 0.02);
    body.add(hlMesh);
    box(body, TAIL(), 0.3, 0.15, 0.05, side * (hw - 0.3), lampY + 0.05, hl + 0.01);
  }
  box(body, WHITE(), hw * 2 + 0.05, 0.18, 0.16, 0, 0.42, -hl - 0.05);
  box(body, WHITE(), hw * 2 + 0.05, 0.18, 0.16, 0, 0.42, hl + 0.05);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const w = new THREE.Mesh(WHEEL, DARK());
    w.scale.set(0.3, wr, wr);
    w.position.set(sx * (hw - 0.08), wr, sz * wheelZ);
    w.castShadow = true;
    group.add(w);
    wheels.push({ mesh: w, r: wr });
  }
  return { hl, hw };
}

const FLEET: { kind: Kind; color: number }[] = [
  { kind: 'hatch', color: 0xff7eb6 },
  { kind: 'hatch', color: 0x4cc9f0 },
  { kind: 'van', color: 0xf8f9fa },
  { kind: 'hatch', color: 0xffd166 },
  { kind: 'taxi', color: 0x1d1d1f },
  { kind: 'hatch', color: 0x06d6a0 },
  { kind: 'bus', color: 0xffc300 },
  { kind: 'hatch', color: 0xff9f1c },
  { kind: 'van', color: 0x3a86ff },
  { kind: 'hatch', color: 0x9b5de5 },
  { kind: 'taxi', color: 0x1d1d1f },
  { kind: 'hatch', color: 0xef476f },
];

/** All (axis, road, dir) lanes. Axis 'x' = horizontal road at z = road; 'z' = vertical road at x = road. */
const LANES: { axis: Axis; road: number; dir: 1 | -1 }[] = [];
for (const z of ROADS.zs) for (const dir of [1, -1] as const) LANES.push({ axis: 'x', road: z, dir });
for (const x of ROADS.xs) for (const dir of [1, -1] as const) LANES.push({ axis: 'z', road: x, dir });

/** Lane centre coordinate (right-hand traffic: the lane on the right of the driving direction). */
function laneOf(axis: Axis, road: number, dir: number): number {
  // moving +X: right = +Z  ·  moving +Z: right = -X
  return axis === 'x' ? road + LANE * dir : road - LANE * dir;
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function circleHitsBox(x: number, z: number, r: number, o: Obstacle): boolean {
  const cx = Math.max(o.minX, Math.min(x, o.maxX));
  const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

export class Traffic {
  private readonly cars: TCar[] = [];
  private readonly locks = new Map<string, Hold[]>();
  private runCd = 0;
  private hornCd = 0;
  /** She was touching a car last frame (debounce: one run-over per incident). */
  private contact = false;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    private readonly ctx: GameCtx,
    private readonly onRunOver: (carPos: THREE.Vector3) => void,
  ) {
    FLEET.forEach((spec, i) => {
      const group = new THREE.Group();
      const body = new THREE.Group();
      const wheels: TCar['wheels'] = [];
      const { hl, hw } = buildCar(spec.kind, spec.color, group, body, wheels);
      scene.add(group);
      const car: TCar = {
        group, body, wheels, kind: spec.kind, hl, hw,
        cruise: spec.kind === 'bus' ? 8 : 8.5 + Math.random() * 2.5,
        speed: 0, mode: 'hidden', axis: 'x', road: 0, dir: 1, s: 0, t: 0, plan: null, hold: null,
        x: 0, z: 0, heading: 0, stopTimer: 0, honkCd: 0, blocked: 0, bounce: Math.random() * 10,
      };
      this.cars.push(car);
      this.placeInitial(car, i);
    });
  }

  /** Where the cars are (for minimaps / other modules). */
  positions(): { x: number; z: number; speed: number }[] {
    return this.cars.filter((c) => c.mode !== 'hidden').map((c) => ({ x: c.x, z: c.z, speed: c.speed }));
  }

  update(dt: number): void {
    if (this.ctx.isPaused()) return;
    dt = Math.min(dt, 0.1);
    this.runCd -= dt;
    this.hornCd -= dt;
    for (const car of this.cars) {
      if (car.mode === 'hidden') {
        this.respawn(car);
        continue;
      }
      car.honkCd -= dt;
      const target = this.targetSpeed(car, dt);
      const brake = car.stopTimer > 0 ? HARD_BRAKE : BRAKE;
      if (car.speed < target) car.speed = Math.min(target, car.speed + ACCEL * dt);
      else car.speed = Math.max(target, car.speed - brake * dt);
      if (car.stopTimer > 0 && car.speed === 0) car.stopTimer -= dt;
      this.advance(car, car.speed * dt);
      this.releaseHold(car);
      this.animate(car, dt);
    }
    this.checkRunOver();
  }

  /* ---------- placement ---------- */

  private placeInitial(car: TCar, i: number): void {
    for (let tries = 0; tries < 80; tries++) {
      const lane = LANES[(i + Math.floor(tries / 8)) % LANES.length];
      const s = (Math.random() * 2 - 1) * (ROADS.extent - 12);
      const crosses = lane.axis === 'x' ? ROADS.xs : ROADS.zs;
      if (crosses.some((c) => Math.abs(c - s) < 16)) continue;
      const l = laneOf(lane.axis, lane.road, lane.dir);
      const x = lane.axis === 'x' ? s : l;
      const z = lane.axis === 'x' ? l : s;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 18) continue;
      if (!this.spotFree(car, x, z, 22)) continue;
      this.putOnLane(car, lane.axis, lane.road, lane.dir, s);
      car.speed = car.cruise * 0.7;
      return;
    }
    car.mode = 'hidden';
    car.group.visible = false;
  }

  /** No other car within `gap` m and no obstacle on the footprint. */
  private spotFree(car: TCar, x: number, z: number, gap: number): boolean {
    for (const o of this.cars) {
      if (o === car || o.mode === 'hidden') continue;
      if (Math.hypot(o.x - x, o.z - z) < gap) return false;
    }
    return !this.obstacles.some((o) => circleHitsBox(x, z, car.hl + 0.5, o));
  }

  private putOnLane(car: TCar, axis: Axis, road: number, dir: 1 | -1, s: number): void {
    car.mode = 'straight';
    car.axis = axis;
    car.road = road;
    car.dir = dir;
    car.s = s;
    car.group.visible = true;
    car.stopTimer = 0;
    this.syncStraight(car);
    car.plan = this.makePlan(car);
  }

  /** Wrap-around: reappear at the far end of some road (fog hides the pop). */
  private respawn(car: TCar): void {
    this.dropHold(car);
    const p = this.ctx.player;
    const options = shuffle(LANES.slice());
    // prefer entry points far from the character
    options.sort((a, b) => entryDist(b, p) - entryDist(a, p));
    for (const lane of options.slice(0, 6)) {
      const s = -lane.dir * (ROADS.extent - 3);
      const l = laneOf(lane.axis, lane.road, lane.dir);
      const x = lane.axis === 'x' ? s : l;
      const z = lane.axis === 'x' ? l : s;
      if (!this.spotFree(car, x, z, 18)) continue;
      this.putOnLane(car, lane.axis, lane.road, lane.dir, s);
      car.speed = car.cruise * 0.8;
      return;
    }
    car.mode = 'hidden';
    car.group.visible = false;
  }

  /* ---------- route planning ---------- */

  private makePlan(car: TCar): Plan | null {
    const crosses = car.axis === 'x' ? ROADS.xs : ROADS.zs;
    let best: number | null = null;
    for (const c of crosses) {
      const ahead = (c - car.s) * car.dir;
      if (ahead > STOP_LINE + car.hl && (best === null || ahead < (best - car.s) * car.dir)) best = c;
    }
    if (best === null) return null;
    const c = best;
    const r = Math.random();
    const turn: 0 | 1 | -1 = car.kind === 'bus' || r < 0.5 ? 0 : r < 0.75 ? 1 : -1;
    const ix = car.axis === 'x' ? c : car.road;
    const iz = car.axis === 'x' ? car.road : c;
    const plan: Plan = {
      c, turn, locked: false, ix, iz,
      stopS: c - car.dir * (STOP_LINE + car.hl),
      startS: c,
      p0: { x: 0, z: 0 }, p1: { x: 0, z: 0 }, p2: { x: 0, z: 0 }, len: 0,
      nextAxis: car.axis, nextRoad: car.road, nextDir: car.dir,
    };
    if (turn !== 0) {
      const dx = car.axis === 'x' ? car.dir : 0;
      const dz = car.axis === 'z' ? car.dir : 0;
      // right of (dx, dz) is (-dz, dx); left is (dz, -dx)
      const nx = turn === 1 ? -dz : dz;
      const nz = turn === 1 ? dx : -dx;
      plan.nextAxis = car.axis === 'x' ? 'z' : 'x';
      plan.nextRoad = c;
      plan.nextDir = (plan.nextAxis === 'x' ? nx : nz) as 1 | -1;
      // corner where the current lane line meets the new lane line
      const P =
        car.axis === 'x'
          ? { x: laneOf('z', c, plan.nextDir), z: laneOf('x', car.road, car.dir) }
          : { x: laneOf('z', car.road, car.dir), z: laneOf('x', c, plan.nextDir) };
      const R = turn === 1 ? 4 : 6;
      plan.p0 = { x: P.x - dx * R, z: P.z - dz * R };
      plan.p1 = P;
      plan.p2 = { x: P.x + nx * R, z: P.z + nz * R };
      plan.startS = car.axis === 'x' ? plan.p0.x : plan.p0.z;
      let len = 0;
      let prev = plan.p0;
      for (let k = 1; k <= 12; k++) {
        const q = bezier(plan, k / 12);
        len += Math.hypot(q.x - prev.x, q.z - prev.z);
        prev = q;
      }
      plan.len = len;
    }
    return plan;
  }

  private laneKey(car: TCar): string {
    return `${car.axis}${car.road}:${car.dir}`;
  }

  /** Crossing rule: one flow at a time — same lane, or the same road's straight/right-turn movements. */
  private tryLock(car: TCar, plan: Plan): boolean {
    const key = `${plan.ix},${plan.iz}`;
    const holders = this.locks.get(key) ?? [];
    const lk = this.laneKey(car);
    const ok = holders.every(
      (h) => h.car === car || h.laneKey === lk || (h.axis === car.axis && h.turn !== -1 && plan.turn !== -1),
    );
    if (!ok) return false;
    this.dropHold(car);
    const hold: Hold = { key, ix: plan.ix, iz: plan.iz, passed: false, laneKey: lk, axis: car.axis, turn: plan.turn, car };
    holders.push(hold);
    this.locks.set(key, holders);
    car.hold = hold;
    plan.locked = true;
    return true;
  }

  private dropHold(car: TCar): void {
    if (!car.hold) return;
    const list = this.locks.get(car.hold.key);
    if (list) {
      const i = list.indexOf(car.hold);
      if (i >= 0) list.splice(i, 1);
    }
    car.hold = null;
  }

  private releaseHold(car: TCar): void {
    const h = car.hold;
    if (!h || !h.passed) return;
    if (Math.max(Math.abs(car.x - h.ix), Math.abs(car.z - h.iz)) > ROADS.width / 2 + car.hl + 0.5) this.dropHold(car);
  }

  /* ---------- speed choice ---------- */

  private targetSpeed(car: TCar, dt: number): number {
    if (car.stopTimer > 0) return 0;
    let v = car.cruise;
    const cap = (dist: number, endSpeed = 0): void => {
      v = Math.min(v, Math.sqrt(endSpeed * endSpeed + 2 * PLAN_DEC * Math.max(0, dist)));
    };
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    const rx = -fz;
    const rz = fx;

    // crossing ahead: slow for the turn, wait at the stop line without the right of way
    const plan = car.plan;
    if (car.mode === 'straight' && plan) {
      if (plan.turn !== 0) cap((plan.startS - car.s) * car.dir, TURN_SPEED);
      if (!plan.locked) {
        const d = (plan.stopS - car.s) * car.dir;
        if (d < 16) this.tryLock(car, plan);
        if (!plan.locked) cap(d - 0.3);
      }
    } else if (car.mode === 'turn') v = Math.min(v, TURN_SPEED);

    // queue behind the car ahead (same lane / same path)
    for (const o of this.cars) {
      if (o === car || o.mode === 'hidden') continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 30) continue;
      if (Math.abs(dx * rx + dz * rz) > car.hw + o.hw - 0.3) continue;
      // only cars actually moving our way (or stopped) count — not a crossing car merely passing through
      const ofx = -Math.sin(o.heading);
      const ofz = -Math.cos(o.heading);
      const sameWay = ofx * fx + ofz * fz > 0.3;
      const gap = along - car.hl - o.hl;
      cap(gap - FOLLOW_GAP, sameWay ? Math.max(0, o.speed) : 0);
    }

    // obstacle boxes in the lane ahead (incl. the player's car)
    const reach = car.mode === 'turn' ? 4 : 12;
    const r = car.hw + 0.25;
    let blockedAt = Infinity;
    for (let k = 0.4; k <= reach && blockedAt === Infinity; k += 1.2) {
      const px = car.x + fx * (car.hl + k);
      const pz = car.z + fz * (car.hl + k);
      for (const o of this.obstacles) {
        if (circleHitsBox(px, pz, r, o)) {
          blockedAt = k;
          break;
        }
      }
    }
    if (blockedAt !== Infinity) {
      cap(blockedAt - r - 1.0);
      car.blocked += dt;
      // stuck behind something for a while: a polite toot (only if she can hear it)
      if (car.blocked > 3 && car.honkCd <= 0 && this.near(car, 40)) this.honk(car, 6);
    } else car.blocked = 0;

    // pedestrian on the road in our lane ahead: honk and ease off a little (but don't stop!)
    const p = this.ctx.player;
    if (!this.ctx.isDriving() && onRoad(p.x, p.z)) {
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > car.hl && along < car.hl + 15 && Math.abs(dx * rx + dz * rz) < 1.8) {
        if (car.honkCd <= 0) this.honk(car, 2.5);
        v = Math.min(v, Math.max(5.5, car.cruise * 0.65));
      }
    }
    return Math.max(0, v);
  }

  private near(car: TCar, d: number): boolean {
    return Math.hypot(car.x - this.ctx.player.x, car.z - this.ctx.player.z) < d;
  }

  private honk(car: TCar, cd: number): void {
    car.honkCd = cd;
    if (this.hornCd > 0) return;
    this.hornCd = 0.7;
    const low = car.kind === 'bus' || car.kind === 'van';
    const f = low ? 330 : 440 + Math.random() * 60;
    tone(f, 0, 0.16, 'square', 0.06);
    tone(f * 1.26, 0, 0.16, 'square', 0.045);
    tone(f, 0.22, 0.22, 'square', 0.06);
    tone(f * 1.26, 0.22, 0.22, 'square', 0.045);
  }

  /* ---------- motion ---------- */

  private advance(car: TCar, step: number): void {
    if (car.mode === 'straight') {
      car.s += car.dir * step;
      const plan = car.plan;
      if (plan) {
        if (plan.turn === 0 && (car.s - plan.c) * car.dir > 0) {
          // went straight over the crossing
          if (car.hold) car.hold.passed = true;
          car.plan = this.makePlan(car);
        } else if (plan.turn !== 0 && (car.s - plan.startS) * car.dir >= 0) {
          const over = (car.s - plan.startS) * car.dir;
          car.mode = 'turn';
          car.t = Math.min(1, over / plan.len);
          this.syncTurn(car, plan);
          return;
        }
      }
      if (car.s * car.dir > ROADS.extent - 1) {
        this.respawn(car);
        return;
      }
      this.syncStraight(car);
    } else if (car.mode === 'turn' && car.plan) {
      const plan = car.plan;
      car.t += step / plan.len;
      if (car.t >= 1) {
        const leftover = (car.t - 1) * plan.len;
        if (car.hold) car.hold.passed = true;
        car.mode = 'straight';
        car.axis = plan.nextAxis;
        car.road = plan.nextRoad;
        car.dir = plan.nextDir;
        car.s = (car.axis === 'x' ? plan.p2.x : plan.p2.z) + car.dir * leftover;
        this.syncStraight(car);
        car.plan = this.makePlan(car);
      } else this.syncTurn(car, plan);
    }
  }

  private syncStraight(car: TCar): void {
    const l = laneOf(car.axis, car.road, car.dir);
    car.x = car.axis === 'x' ? car.s : l;
    car.z = car.axis === 'x' ? l : car.s;
    const dx = car.axis === 'x' ? car.dir : 0;
    const dz = car.axis === 'z' ? car.dir : 0;
    car.heading = Math.atan2(-dx, -dz);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
  }

  private syncTurn(car: TCar, plan: Plan): void {
    const q = bezier(plan, car.t);
    const u = 1 - car.t;
    // derivative of the quadratic Bézier
    const tx = 2 * u * (plan.p1.x - plan.p0.x) + 2 * car.t * (plan.p2.x - plan.p1.x);
    const tz = 2 * u * (plan.p1.z - plan.p0.z) + 2 * car.t * (plan.p2.z - plan.p1.z);
    car.x = q.x;
    car.z = q.z;
    car.heading = Math.atan2(-tx, -tz);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
  }

  private animate(car: TCar, dt: number): void {
    for (const w of car.wheels) w.mesh.rotation.x -= (car.speed * dt) / w.r;
    car.bounce += dt * (4 + car.speed);
    car.body.position.y = Math.sin(car.bounce) * 0.02 * Math.min(1, car.speed / 5);
    // nose dips when braking hard
    car.body.rotation.x = car.stopTimer > 0 && car.speed > 0 ? -0.05 : 0;
  }

  /* ---------- run-over ---------- */

  private checkRunOver(): void {
    if (this.ctx.isDriving()) {
      this.contact = false;
      return;
    }
    const p = this.ctx.player;
    let touching: TCar | null = null;
    for (const car of this.cars) {
      if (car.mode === 'hidden') continue;
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const along = THREE.MathUtils.clamp(dx * fx + dz * fz, -car.hl, car.hl);
      const lat = THREE.MathUtils.clamp(dx * -fz + dz * fx, -car.hw, car.hw);
      const ex = dx - (fx * along + -fz * lat);
      const ez = dz - (fz * along + fx * lat);
      if (ex * ex + ez * ez < PLAYER_R * PLAYER_R) {
        touching = car;
        if (car.speed > 2) break;
      }
    }
    // once per incident: contact must be broken (and 3 s gone by) before the next one counts
    const fresh = !this.contact;
    this.contact = touching !== null;
    if (!touching || touching.speed <= 2 || !fresh || this.runCd > 0) return;
    this.runCd = 3;
    touching.stopTimer = 2;
    screech();
    this.onRunOver(touching.group.position.clone());
  }
}

function entryDist(lane: { axis: Axis; road: number; dir: number }, p: THREE.Vector3): number {
  const s = -lane.dir * (ROADS.extent - 3);
  const l = laneOf(lane.axis, lane.road, lane.dir);
  return lane.axis === 'x' ? Math.hypot(s - p.x, l - p.z) : Math.hypot(l - p.x, s - p.z);
}

function bezier(plan: Plan, t: number): { x: number; z: number } {
  const u = 1 - t;
  return {
    x: u * u * plan.p0.x + 2 * u * t * plan.p1.x + t * t * plan.p2.x,
    z: u * u * plan.p0.z + 2 * u * t * plan.p1.z + t * t * plan.p2.z,
  };
}

/** Tyre screech: a quick falling squeal. */
function screech(): void {
  for (let i = 0; i < 9; i++) tone(1500 - i * 110, i * 0.045, 0.07, 'sawtooth', 0.045);
  tone(90, 0.42, 0.18, 'square', 0.08);
}
