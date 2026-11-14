import * as THREE from 'three';
import { sfx, speak, tone } from './audio';
import type { GameCtx } from './gamectx';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';
import { BUS_ROUTES, DOOR_FWD, routeLanes, type BusStop, type Crossing } from './busstops';
import { isFree } from './spawn';

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
const PROBE = 30; // how far ahead (m, along the car's own future path) it looks for cars and obstacles
const PROBE_STEP = 0.6;
/** Standing still this long while holding a crossing it hasn't entered yet → give the right of way back. */
const HOLD_PATIENCE = 3;
/** Watchdog: a car stuck this long is quietly re-entered at a far map edge (only where she can't see it). */
const STUCK_FAR = 20; // ... when it is more than FAR_AWAY m from her
const STUCK_OBSTACLE = 8; // ... same, but blocked by something that won't move (e.g. her car left on the road)
const FAR_AWAY = 40;
const STUCK_ANY = 35; // ... when it is at least NOT_NEAR m from her
const NOT_NEAR = 25;
/** Bus: seconds standing at a stop with the doors open. */
const DWELL = 5.5;
/** Doors start closing this long before the bus leaves. */
const DOOR_CLOSE = 0.7;
/** Bus stopped this long away from a stop (queue, jam) with her inside → she may get off onto the pavement. */
const RIDER_OFF_STUCK = 15;
/** ...and after this long the game gets her off by itself (the watchdog never moves a bus she is in). */
const RIDER_KICK = 30;
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

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

/** A point on a car's future path: position, distance along the path and unit tangent. */
interface PathPt {
  x: number;
  z: number;
  d: number;
  tx: number;
  tz: number;
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
  /** Seconds the holder has been standing still since it got the right of way. */
  still: number;
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
  /** Seconds waiting for the right of way at the next crossing (first come, first served). */
  wait: number;
  /** Seconds standing still (not counting a run-over stop or a pause). */
  stuck: number;
  /** Debug: what limited the speed last frame. */
  why: string;
  /* ---- buses only ---- */
  /** Seconds left standing at a stop (doors open). */
  dwell: number;
  dwellStop: BusStop | null;
  /** Last stop served on the current lane (so it doesn't stop there twice). */
  lastStop: BusStop | null;
  /** Doors 0 (shut) … 1 (open). */
  doors: number;
  door: THREE.Object3D | null;
  driver: THREE.Object3D | null;
  /** Driver shaking his head (no coin). */
  shake: number;
  /** Bus line: closed list of crossings, and the index of the one it is driving to. */
  route: Crossing[] | null;
  ri: number;
}

/* ---------- shared geometry / materials ---------- */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14);
WHEEL.rotateZ(Math.PI / 2);
const LAMP = new THREE.SphereGeometry(1, 10, 8);
const COIN = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16);
const UP = new THREE.Vector3(0, 1, 0);
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
    // see-through windows: whoever rides it is seen at the window
    const busGlass = mat(0xbfe9ff, { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
    box(body, busGlass, hw * 2 + 0.04, 0.9, hl * 2 - 1.4, 0, 2.1, 0.5).castShadow = false;
    box(body, busGlass, hw * 2 - 0.3, 1.2, 0.06, 0, 2.0, -hl - 0.01).castShadow = false; // big windscreen
    // seat backs (a row on each side), seen through the glass
    for (let z = -2.2; z <= 4; z += 1.4) for (const x of [-0.75, 0.75]) box(body, mat(0x3d5a80), 0.8, 0.5, 0.12, x, 1.85, z);
    // front door on the right (the pavement side), slides back to open
    const door = box(body, mat(0x2b2d42, { roughness: 0.3 }), 0.06, 2.1, 1.1, hw + 0.02, 1.35, -DOOR_FWD);
    door.userData.baseZ = -DOOR_FWD;
    body.userData.door = door;
    // the driver (front left): body + head, so he can shake his head
    box(body, mat(0x1f6feb), 0.55, 0.5, 0.4, -hw + 0.6, 1.85, -hl + 1.5);
    const head = new THREE.Group();
    head.position.set(-hw + 0.6, 2.28, -hl + 1.5);
    const face = new THREE.Mesh(LAMP, mat(0xf1c27d));
    face.scale.setScalar(0.2);
    head.add(face);
    const cap = new THREE.Mesh(BOX, mat(0x1f3b73));
    cap.scale.set(0.38, 0.1, 0.42);
    cap.position.set(0, 0.17, -0.03);
    head.add(cap);
    body.add(head);
    body.userData.driver = head;
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
  { kind: 'bus', color: 0xff5d8f },
  { kind: 'bus', color: 0x2ec4b6 },
  { kind: 'hatch', color: 0x8ecae6 },
  { kind: 'bus', color: 0xff8c42 },
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
  private dumpAt = 0;
  /** Debug: how many stuck cars the watchdog had to re-enter. */
  private rescues = 0;
  private readonly rescueLog: string[] = [];
  /** The bus she is riding (null = not on a bus). */
  private rider: TCar | null = null;
  /** Stop where she got on, or the last one the bus served since (safe place to save / put her down). */
  private riderStop: BusStop | null = null;
  /** Set when the bus she is in has been stuck far too long: main.ts gets her off. */
  kickRider = false;
  private noCoinCd = 0;
  private readonly fx: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Object3D; t: number }[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    private readonly ctx: GameCtx,
    private readonly onRunOver: (carPos: THREE.Vector3) => void,
    private readonly stops: BusStop[] = [],
  ) {
    let busN = 0;
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
        x: 0, z: 0, heading: 0, stopTimer: 0, honkCd: 0, blocked: 0, bounce: Math.random() * 10, stuck: 0, wait: 0, why: '',
        dwell: 0, dwellStop: null, lastStop: null, doors: 0, shake: 0,
        // bus lines: the big figure and the outer ring, two buses each
        route: spec.kind === 'bus' ? BUS_ROUTES[busN++ % 2] : null, ri: 0,
        door: (body.userData.door as THREE.Object3D | undefined) ?? null,
        driver: (body.userData.driver as THREE.Object3D | undefined) ?? null,
      };
      this.cars.push(car);
      this.placeInitial(car, i);
    });
  }

  /** `?debug`: every car's state on <body data-traffic> (for the automated soak test). */
  private debugDump(): void {
    if (!DEBUG) return;
    const now = performance.now();
    if (now - this.dumpAt < 400) return;
    this.dumpAt = now;
    document.body.dataset.traffic = JSON.stringify({
      paused: this.ctx.isPaused(),
      rescues: this.rescues,
      rescueLog: this.rescueLog.slice(-12),
      cars: this.cars.map((c) => ({
        x: +c.x.toFixed(1), z: +c.z.toFixed(1), v: +c.speed.toFixed(2), mode: c.mode, why: c.why, k: c.kind, st: +c.stuck.toFixed(1), turn: c.plan?.turn ?? null,
        lock: c.plan?.locked ?? null, hold: c.hold ? c.hold.key : null,
      })),
    });
  }

  /** Where the cars are (for minimaps / other modules). */
  positions(): { x: number; z: number; speed: number }[] {
    return this.cars.filter((c) => c.mode !== 'hidden').map((c) => ({ x: c.x, z: c.z, speed: c.speed }));
  }

  update(dt: number): void {
    this.debugDump();
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
      if (car.dwell > 0) {
        car.dwell = Math.max(0, car.dwell - dt);
        if (car.dwell === 0) car.dwellStop = null;
      }
      const target = this.targetSpeed(car, dt);
      const brake = car.stopTimer > 0 ? HARD_BRAKE : BRAKE;
      if (car.speed < target) car.speed = Math.min(target, car.speed + ACCEL * dt);
      else car.speed = Math.max(target, car.speed - brake * dt);
      if (car.stopTimer > 0 && car.speed === 0) car.stopTimer -= dt;
      if (car.speed < 0.3 && car.stopTimer <= 0 && car.dwell <= 0) car.stuck += dt;
      else if (car.speed > 1 || car.dwell > 0) car.stuck = 0;
      if (car.hold) car.hold.still = car.speed < 0.3 ? car.hold.still + dt : 0;
      // the bus she is in is never moved by the watchdog: after a long jam she is simply let off first
      if (car === this.rider) {
        if (car.stuck > RIDER_KICK) this.kickRider = true;
      } else if (car.stuck > STUCK_FAR || (car.stuck > STUCK_OBSTACLE && car.blocked > STUCK_OBSTACLE)) {
        // watchdog: whatever went wrong (gridlock, her car left on the road...), traffic must keep flowing
        const d = Math.hypot(car.x - this.ctx.player.x, car.z - this.ctx.player.z);
        // (near her it waits and honks instead: she can see why — and move her car)
        if (d > FAR_AWAY || (car.stuck > STUCK_ANY && d > NOT_NEAR)) {
          this.rescues++;
          if (DEBUG) this.rescueLog.push(this.cars.filter((o) => Math.hypot(o.x - car.x, o.z - car.z) < 30).map((o) => `${o === car ? "*" : ""}${this.cars.indexOf(o)}${o.kind[0]}@${o.x.toFixed(0)},${o.z.toFixed(0)} v${o.speed.toFixed(1)} ${o.why} L${o.plan?.locked ? 1 : 0}T${o.plan?.turn ?? "-"} H${o.hold?.key ?? ""} st${o.stuck.toFixed(0)}`).join(" | "));
          this.respawn(car);
          continue;
        }
      }
      this.advance(car, car.speed * dt);
      this.releaseHold(car);
      if (car.kind === 'bus') this.busArrive(car);
      this.animate(car, dt);
    }
    this.updateFx(dt);
    this.noCoinCd -= dt;
    this.checkRunOver();
  }

  /* ---------- placement ---------- */

  private placeInitial(car: TCar, i: number): void {
    if (car.kind === 'bus') {
      if (!this.placeBus(car, false)) {
        car.mode = 'hidden';
        car.group.visible = false;
      }
      return;
    }
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
    car.stuck = 0;
    car.wait = 0;
    car.lastStop = null;
    this.syncStraight(car);
    car.plan = this.makePlan(car);
  }

  /** Buses are put on a segment of their own route, clear of crossings (far from her if `far`). */
  private placeBus(car: TCar, far: boolean): boolean {
    const p = this.ctx.player;
    const route = car.route ?? BUS_ROUTES[0];
    const lanes = routeLanes(route);
    let best: { l: (typeof lanes)[number]; j: number; s: number; d: number } | null = null;
    for (let tries = 0; tries < 40; tries++) {
      const j = Math.floor(Math.random() * lanes.length);
      const l = lanes[j];
      const s = l.lo + 16 + Math.random() * (l.hi - l.lo - 32);
      const lane = laneOf(l.axis, l.road, l.dir);
      const x = l.axis === 'x' ? s : lane;
      const z = l.axis === 'x' ? lane : s;
      if (!this.spotFree(car, x, z, 18)) continue;
      if (!far && Math.hypot(x - SPAWN.x, z - SPAWN.z) < 18) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (!best || d > best.d) best = { l, j, s, d };
      if (!far) break;
    }
    if (!best || (far && best.d < 30)) return false;
    car.ri = (best.j + 1) % route.length; // heading for the end of that segment
    this.putOnLane(car, best.l.axis, best.l.road, best.l.dir, best.s);
    car.dwell = 0;
    car.dwellStop = null;
    car.speed = car.cruise * (far ? 0.8 : 0.7);
    return true;
  }

  /** Wrap-around: reappear at the far end of some road (fog hides the pop). */
  private respawn(car: TCar): void {
    if (car === this.rider) return; // never jumps away with her inside
    this.dropHold(car);
    if (car.kind === 'bus') {
      if (!this.placeBus(car, true)) {
        car.mode = 'hidden';
        car.group.visible = false;
      }
      return;
    }
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

  /** Bus: which way to go at crossing (ix, iz) to head for the next crossing of its line. */
  private routeTurn(car: TCar, ix: number, iz: number): 0 | 1 | -1 {
    const route = car.route!;
    const n = route.length;
    const dx = car.axis === 'x' ? car.dir : 0;
    const dz = car.axis === 'z' ? car.dir : 0;
    const at = (j: number) => route[((j % n) + n) % n];
    // the crossing it drives to, coming from the previous one along its own direction (crossings repeat in a figure)
    const matches = (j: number) => {
      const p = at(j - 1);
      const q = at(j);
      return q.x === ix && q.z === iz && Math.sign(q.x - p.x) === dx && Math.sign(q.z - p.z) === dz;
    };
    if (!matches(car.ri)) {
      let found = -1;
      for (let j = 0; j < n; j++) if (matches(j)) found = j;
      if (found < 0) return 0; // off its line (shouldn't happen): straight on; the map edge puts it back on the line
      car.ri = found;
    }
    const q = at(car.ri);
    const nx = Math.sign(at(car.ri + 1).x - q.x);
    const nz = Math.sign(at(car.ri + 1).z - q.z);
    if (nx === dx && nz === dz) return 0;
    return nx === -dz && nz === dx ? 1 : -1; // right of (dx, dz) is (-dz, dx)
  }

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
    const ix = car.axis === 'x' ? c : car.road;
    const iz = car.axis === 'x' ? car.road : c;
    // buses follow their line (busstops.ts BUS_ROUTES); other cars pick a way at random
    const turn: 0 | 1 | -1 = car.route ? this.routeTurn(car, ix, iz) : r < 0.5 ? 0 : r < 0.75 ? 1 : -1;
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
      const R = car.kind === 'bus' ? 6 : turn === 1 ? 4 : 6;
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
    this.purgeStale(holders, plan);
    const lk = this.laneKey(car);
    const compatible = (laneKey: string, axis: Axis, turn: number): boolean =>
      laneKey === lk || (axis === car.axis && turn !== -1 && plan.turn !== -1);
    if (!holders.every((h) => h.car === car || compatible(h.laneKey, h.axis, h.turn))) return false;
    // first come, first served: a flow that keeps arriving must not starve a car waiting on the other road
    for (const o of this.cars) {
      const op = o.plan;
      if (o === car || o.mode !== 'straight' || !op || op.locked || op.ix !== plan.ix || op.iz !== plan.iz) continue;
      if (o.wait > 0.5 && o.wait > car.wait && !compatible(this.laneKey(o), o.axis, op.turn)) return false;
    }
    this.dropHold(car);
    const hold: Hold = { key, ix: plan.ix, iz: plan.iz, passed: false, laneKey: lk, axis: car.axis, turn: plan.turn, car, still: 0 };
    holders.push(hold);
    this.locks.set(key, holders);
    car.hold = hold;
    plan.locked = true;
    return true;
  }

  /**
   * Holds that block a crossing for nothing: orphans, hidden cars, and cars that took the right of way but are
   * standing still before the crossing (queued behind someone) — they hand it back and ask again later.
   */
  private purgeStale(holders: Hold[], plan: Plan): void {
    for (let i = holders.length - 1; i >= 0; i--) {
      const h = holders[i];
      const c = h.car;
      const orphan = c.hold !== h || c.mode === 'hidden';
      const before =
        !h.passed && c.mode === 'straight' &&
        Math.max(Math.abs(c.x - plan.ix), Math.abs(c.z - plan.iz)) > ROADS.width / 2 + c.hl + 0.3;
      if (!orphan && !(before && h.still > HOLD_PATIENCE)) continue;
      holders.splice(i, 1);
      if (c.hold === h) {
        c.hold = null;
        if (c.plan && c.plan.ix === h.ix && c.plan.iz === h.iz) c.plan.locked = false;
      }
    }
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

  /** Points every PROBE_STEP m along where this car will drive next (centre line), up to PROBE m. */
  private futurePath(car: TCar): PathPt[] {
    const pts: PathPt[] = [];
    const plan = car.plan;
    let d = 0;
    let t0 = 0;
    if (car.mode === 'straight') {
      const fx = car.axis === 'x' ? car.dir : 0;
      const fz = car.axis === 'z' ? car.dir : 0;
      const lim = plan && plan.turn !== 0 ? Math.max(0, (plan.startS - car.s) * car.dir) : Infinity;
      for (d = PROBE_STEP; d <= Math.min(PROBE, lim); d += PROBE_STEP) pts.push({ x: car.x + fx * d, z: car.z + fz * d, d, tx: fx, tz: fz });
      if (!plan || plan.turn === 0 || lim >= PROBE) return pts;
      d = lim;
    } else if (car.mode === 'turn' && plan) t0 = car.t;
    else return pts;
    // through the curve
    const dt = PROBE_STEP / plan.len;
    let prev = bezier(plan, t0);
    for (let t = t0 + dt; d < PROBE; t += dt) {
      const tt = Math.min(1, t);
      const q = bezier(plan, tt);
      d += Math.hypot(q.x - prev.x, q.z - prev.z);
      prev = q;
      const u = 1 - tt;
      const tx = 2 * u * (plan.p1.x - plan.p0.x) + 2 * tt * (plan.p2.x - plan.p1.x);
      const tz = 2 * u * (plan.p1.z - plan.p0.z) + 2 * tt * (plan.p2.z - plan.p1.z);
      const n = Math.hypot(tx, tz) || 1;
      pts.push({ x: q.x, z: q.z, d, tx: tx / n, tz: tz / n });
      if (tt >= 1) break;
    }
    // ...then along the next lane
    const ex = plan.nextAxis === 'x' ? plan.nextDir : 0;
    const ez = plan.nextAxis === 'z' ? plan.nextDir : 0;
    for (let k = PROBE_STEP; d + k <= PROBE; k += PROBE_STEP) pts.push({ x: plan.p2.x + ex * k, z: plan.p2.z + ez * k, d: d + k, tx: ex, tz: ez });
    return pts;
  }

  private targetSpeed(car: TCar, dt: number): number {
    car.why = '';
    if (car.stopTimer > 0) {
      car.why = 'stopTimer';
      return 0;
    }
    if (car.dwell > 0) {
      car.why = 'dwell';
      return 0;
    }
    let v = car.cruise;
    const cap = (dist: number, endSpeed = 0, why = ''): void => {
      const w = Math.sqrt(endSpeed * endSpeed + 2 * PLAN_DEC * Math.max(0, dist));
      if (w < v) {
        v = w;
        car.why = why;
      }
    };
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    const rx = -fz;
    const rz = fx;

    // crossing ahead: slow for the turn, wait at the stop line without the right of way
    const plan = car.plan;
    if (car.mode === 'straight' && plan) {
      if (plan.turn !== 0) cap((plan.startS - car.s) * car.dir, TURN_SPEED, 'turn');
      if (!plan.locked) {
        const d = (plan.stopS - car.s) * car.dir;
        if (d < 16) this.tryLock(car, plan);
        if (!plan.locked) cap(d - 0.3, 0, 'lock');
        car.wait = !plan.locked && d < 3 ? car.wait + dt : 0;
      } else car.wait = 0;
    } else if (car.mode === 'turn') v = Math.min(v, TURN_SPEED);
    // bus stop ahead on this lane: pull in and stop with the front door at the stop
    if (car.kind === 'bus' && car.mode === 'straight') {
      const st = this.nextStop(car);
      if (st) cap((st.s - car.s) * car.dir, 0, 'stop');
    }

    // Look ahead along the car's OWN future path (lane → curve through the crossing → next lane), not along a
    // straight ray: a ray from a car mid-turn points diagonally across the crossing and used to "see" a car
    // waiting at its stop line, stop for it while holding the crossing, and that car waited for the crossing
    // forever → gridlock that spread over the whole grid.
    const path = this.futurePath(car);

    // queue behind the car ahead on our path (sampled points inside its footprint)
    for (const o of this.cars) {
      if (o === car || o.mode === 'hidden') continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      if (dx * dx + dz * dz > (PROBE + o.hl + car.hl) ** 2) continue;
      // only what is in front of us (never a car beside or behind: two cars must not wait on each other)
      if (dx * fx + dz * fz <= 0) continue;
      const ofx = -Math.sin(o.heading);
      const ofz = -Math.cos(o.heading);
      for (const q of path) {
        const px = q.x - o.x;
        const pz = q.z - o.z;
        // our footprint at q, projected on the other car's axes (so a perpendicular car is not "as long as us")
        const c = Math.abs(q.tx * ofx + q.tz * ofz);
        const sn = Math.abs(q.tx * ofz - q.tz * ofx);
        const reachA = o.hl + car.hl * c + car.hw * sn;
        const reachL = o.hw + car.hl * sn + car.hw * c - 0.3;
        if (Math.abs(px * ofx + pz * ofz) >= reachA || Math.abs(px * -ofz + pz * ofx) >= reachL) continue;
        // only cars actually moving our way (or stopped) count — not a crossing car merely passing through
        const sameWay = ofx * q.tx + ofz * q.tz > 0.3;
        // a car crossing our way but waiting at its stop line without the right of way won't enter the crossing:
        // not in our way. (A long bus sweeping through a turn used to "see" it, stop mid-crossing holding the
        // right of way, and the other one waited for that right of way forever → gridlock.)
        const op = o.plan;
        if (!sameWay && o.mode === 'straight' && op && !op.locked && (op.stopS - o.s) * o.dir > -0.5) break;
        cap(q.d - FOLLOW_GAP, sameWay ? Math.max(0, o.speed) : 0, (sameWay ? 'follow#' : 'cross#') + this.cars.indexOf(o));
        break;
      }
    }

    // obstacle boxes on the path ahead (incl. the player's car): front bumper up to 12 m ahead
    const r = car.hw + 0.25;
    let blockedAt = Infinity;
    const near = this.obstacles.filter(
      (o) => car.x > o.minX - 20 && car.x < o.maxX + 20 && car.z > o.minZ - 20 && car.z < o.maxZ + 20,
    );
    if (near.length) {
      for (let i = 0; i < path.length && blockedAt === Infinity; i += 2) {
        const q = path[i];
        const k = q.d - car.hl;
        if (k < 0.4) continue;
        if (k > 12) break;
        if (near.some((o) => circleHitsBox(q.x, q.z, r, o))) blockedAt = k;
      }
    }
    if (blockedAt !== Infinity) {
      cap(blockedAt - r - 1.0, 0, 'obstacle');
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
          if (car.route) car.ri = (car.ri + 1) % car.route.length;
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
        car.lastStop = null;
        if (car.route) car.ri = (car.ri + 1) % car.route.length;
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
    if (car.door) {
      const open = car.dwell > DOOR_CLOSE ? 1 : 0;
      const before = car.doors;
      car.doors += THREE.MathUtils.clamp(open - car.doors, -dt * 2.5, dt * 2.5);
      car.door.position.z = (car.door.userData.baseZ as number) + car.doors * 1.08;
      car.door.position.x = car.hw + 0.02 + car.doors * 0.08;
      // door hiss when it starts to open / close (only if she's around)
      if (((before === 0 && car.doors > 0) || (before === 1 && car.doors < 1)) && (car === this.rider || this.near(car, 25))) {
        for (let i = 0; i < 5; i++) tone(2400 - i * 250, i * 0.05, 0.06, 'sawtooth', 0.012);
      }
    }
    if (car.driver) {
      car.shake = Math.max(0, car.shake - dt);
      car.driver.rotation.y = car.shake > 0 ? Math.sin(car.shake * 22) * 0.55 : 0;
    }
  }

  /* ---------- buses: stops, boarding, riding ---------- */

  /** Next stop ahead on the bus's current lane (not the one it has just served). */
  private nextStop(car: TCar): BusStop | null {
    let best: BusStop | null = null;
    let bestD = Infinity;
    for (const st of this.stops) {
      if (st === car.lastStop || st.axis !== car.axis || st.road !== car.road || st.dir !== car.dir) continue;
      const d = (st.s - car.s) * car.dir;
      if (car.plan && car.plan.turn !== 0 && (st.s - car.plan.c) * car.dir > 0) continue; // it turns off before
      if (d > -0.5 && d < bestD) {
        best = st;
        bestD = d;
      }
    }
    return best;
  }

  /** At the stop (or just short of it, nearly stopped): open the doors and wait. */
  private busArrive(car: TCar): void {
    if (car.mode !== 'straight' || car.dwell > 0) return;
    const st = this.nextStop(car);
    if (!st) return;
    const d = (st.s - car.s) * car.dir;
    if (d < 0.8 && car.speed < 1.5) {
      car.speed = 0;
      car.dwell = DWELL;
      car.dwellStop = st;
      car.lastStop = st;
      if (car === this.rider) this.riderStop = st;
    }
  }

  /** A bus standing at a stop with its doors open whose door is within r m of p. */
  private openBusNear(p: THREE.Vector3, r: number): TCar | null {
    for (const car of this.cars) {
      const st = car.dwellStop;
      if (car.kind !== 'bus' || car === this.rider || !st || car.dwell <= DOOR_CLOSE + 0.2 || car.doors < 0.6) continue;
      if (Math.hypot(p.x - st.door.x, p.z - st.door.z) < r) return car;
    }
    return null;
  }

  /** True if a bus with open doors is waiting with its door within r m of p (she could get on). */
  openDoorNear(p: THREE.Vector3, r: number): boolean {
    return this.openBusNear(p, r) !== null;
  }

  /**
   * Get on the bus whose open door is next to p: pay 1 coin (it flies to the driver) and sit at a window.
   * No coin → the driver shakes his head, a low "hmm" and she stays outside.
   */
  tryBoard(p: THREE.Vector3, r: number): 'ok' | 'nocoin' | null {
    const car = this.openBusNear(p, r);
    if (!car) return null;
    if (this.ctx.coins() < 1) {
      car.shake = 1.1;
      if (this.noCoinCd <= 0) {
        this.noCoinCd = 6;
        tone(150, 0, 0.35, 'sine', 0.12);
        tone(130, 0.38, 0.45, 'sine', 0.12);
        void speak(['Para andar de autocarro precisas de uma moeda.']);
      }
      return 'nocoin';
    }
    this.ctx.addCoins(-1);
    sfx.coin();
    this.coinFx(p, car);
    this.rider = car;
    this.riderStop = car.dwellStop;
    this.kickRider = false;
    car.dwell = Math.max(car.dwell, 2.2); // time to sit down before the doors close
    [660, 880].forEach((f, i) => tone(f, 0.25 + i * 0.12, 0.12, 'triangle', 0.05)); // "ding-ding"
    return 'ok';
  }

  /** A tap that hit a bus: where its door is and whether it is open right now. */
  tappedBus(ray: THREE.Raycaster): { door: THREE.Vector3 | null; open: boolean } | null {
    for (const car of this.cars) {
      if (car.kind !== 'bus' || car.mode === 'hidden' || car === this.rider) continue;
      if (ray.intersectObject(car.group, true).length === 0) continue;
      const open = !!car.dwellStop && car.dwell > DOOR_CLOSE + 0.2;
      return { door: open && car.dwellStop ? car.dwellStop.door : null, open };
    }
    return null;
  }

  hasRider(): boolean {
    return this.rider !== null;
  }

  /** Her seat at a window on the pavement side (world position of her feet while sitting) and the bus heading. */
  riderSeat(): { pos: THREE.Vector3; heading: number; speed: number } | null {
    const car = this.rider;
    if (!car) return null;
    const pos = new THREE.Vector3(car.hw - 0.62, 0.95 + car.body.position.y, -1.5).applyAxisAngle(UP, car.heading);
    pos.x += car.x;
    pos.z += car.z;
    return { pos, heading: car.heading, speed: car.speed };
  }

  /** She may get off now: doors open at a stop, or the bus has been stuck a while with free pavement beside it. */
  riderCanAlight(): boolean {
    const car = this.rider;
    if (!car) return false;
    if (car.dwellStop && car.dwell > DOOR_CLOSE && car.doors > 0.6) return true;
    return car.speed < 0.3 && car.stuck > RIDER_OFF_STUCK && this.besideBus(car) !== null;
  }

  /** Get off (only when riderCanAlight()): returns where she stands, on the pavement by the door. */
  alight(): { x: number; z: number; h: number } | null {
    const car = this.rider;
    if (!car || !this.riderCanAlight()) return null;
    const spot = car.dwellStop && car.dwell > 0 ? car.dwellStop.off : this.besideBus(car);
    if (!spot) return null;
    if (car.dwell > 0) car.dwell = Math.max(car.dwell, 1.6);
    this.rider = null;
    this.kickRider = false;
    return spot;
  }

  /** Forced off (Casa, menu, new city, long jam): the best pavement spot, or null if none (main uses SPAWN). */
  dropRider(): { x: number; z: number; h: number } | null {
    const car = this.rider;
    if (!car) return null;
    this.rider = null;
    this.kickRider = false;
    return (car.dwellStop && car.dwell > 0 ? car.dwellStop.off : null) ?? this.besideBus(car) ?? this.riderStop?.off ?? null;
  }

  /** Where a reload should put her while she rides: the stop she got on at / last stopped at. */
  riderSafeSpot(): { x: number; z: number; h: number } | null {
    return this.rider ? (this.riderStop?.off ?? null) : null;
  }

  /** Stop-request bell (she asked to get off while the bus is moving). */
  ringBell(): void {
    tone(1320, 0, 0.12, 'triangle', 0.06);
    tone(1046, 0.14, 0.2, 'triangle', 0.06);
  }

  /** Free pavement beside the bus's door (never on a road), or null. */
  private besideBus(car: TCar): { x: number; z: number; h: number } | null {
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    const rx = -fz;
    const rz = fx;
    for (const along of [DOOR_FWD - 0.5, 0, DOOR_FWD + 2, -3]) {
      const x = car.x + rx * 3.0 + fx * along;
      const z = car.z + rz * 3.0 + fz * along;
      if (!onRoad(x, z, 0.4) && isFree(x, z, 0.5, this.obstacles)) return { x, z, h: car.heading };
    }
    return null;
  }

  /** A coin flying from her hand to the driver. */
  private coinFx(p: THREE.Vector3, car: TCar): void {
    if (!car.driver) return;
    const mesh = new THREE.Mesh(COIN, mat(0xffd23f, { emissive: 0x7a5a00, metalness: 0.6 }));
    mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);
    this.fx.push({ mesh, from: new THREE.Vector3(p.x, 1.1, p.z), to: car.driver, t: 0 });
  }

  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt / 0.7;
      const to = f.to.getWorldPosition(new THREE.Vector3());
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.2;
      f.mesh.rotation.z += dt * 14;
      if (f.t >= 1) {
        f.mesh.removeFromParent();
        this.fx.splice(i, 1);
        tone(1568, 0, 0.08, 'triangle', 0.04);
      }
    }
  }

  /** `?debug`: stops, buses and the rider. */
  busDebug(): unknown {
    return {
      stops: this.stops.map((s) => [+s.door.x.toFixed(1), +s.door.z.toFixed(1), s.axis, s.road, s.dir, +s.s.toFixed(1)]),
      buses: this.cars
        .filter((c) => c.kind === 'bus')
        .map((c) => ({
          x: +c.x.toFixed(1), z: +c.z.toFixed(1), v: +c.speed.toFixed(1), mode: c.mode, why: c.why,
          dwell: +c.dwell.toFixed(1), doors: +c.doors.toFixed(2), at: c.dwellStop ? this.stops.indexOf(c.dwellStop) : -1, stuck: +c.stuck.toFixed(1),
          line: c.route ? BUS_ROUTES.indexOf(c.route) : -1, ri: c.ri, turn: c.plan?.turn ?? null,
        })),
      rider: this.rider ? this.cars.filter((c) => c.kind === 'bus').indexOf(this.rider) : null,
      canOff: this.riderCanAlight(),
      rescues: this.rescues,
    };
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
      if (car.mode === 'hidden' || car === this.rider) continue;
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
