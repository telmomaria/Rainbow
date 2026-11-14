import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { taunt, tone } from './audio';
import type { GameCtx } from './gamectx';
import { isFree } from './spawn';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';

/**
 * Two grumpy situations per city, all in-world (movement, animation, sound — never text/UI):
 * - a football stadium whose fans pour out now and then, chant, roam the nearby streets and chase her;
 * - two men squabbling in front of a little bar, who lunge after her if she comes too close.
 * Everyone is slower than the character (6.5 m/s) so she can always get away.
 */

const PERSON_R = 0.45;
const HIT_DIST = 1.15;

// --- fans ---
const STADIUM_R = 16;
const FAN_SEE = 15;
const FAN_CHASE_SPEED = 5.2;
const FAN_WALK = 1.7;
const FAN_LEASH = 70; // max distance from the gate while chasing
const FAN_ROAM = 50; // the group's anchor stays this close to the gate
const FAN_COST = 20;
const FIRST_LOOK_DIST = 50;

// --- bar ---
const BAR_SEE = 7;
const BAR_LEASH = 12;
const BAR_CHASE_SPEED = 5.5;
const BAR_COST = 10;
const SQUABBLE_CYCLE = 4.2;

const FAN_SHOUTS = ['Ganhámos!', 'Sai da frente!', 'Somos os maiores!', 'Campeões! Campeões!', 'Olé, olé!'];
const FAN_CHASE_SHOUTS = ['Sai da frente!', 'Ó miúda, abre alas!', 'Ninguém nos para!'];
const FAN_WIN_SHOUTS = ['Ganhámos!', 'Golo! Golo!', 'Olé!'];
const BAR_LINES = ['Foste tu!', 'Não fui nada!', 'Foste sim!', 'Ó pá, chega para lá!', 'Hmpf!'];
const BAR_LUNGE = ['Ó pá, sai daqui!', 'Isto não é contigo!', 'Vai-te embora!'];

/** Shirt colour + scarf colour of the city's team (rng-picked). */
const TEAMS: [number, number][] = [
  [0xd62828, 0xffffff],
  [0x1d4ed8, 0xffffff],
  [0x15803d, 0xffffff],
  [0xf59e0b, 0x1f2937],
  [0x7c3aed, 0xfacc15],
  [0x0ea5e9, 0x1e3a8a],
];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIRS = [0x2b1d14, 0x5a3825, 0x111111, 0xb5651d, 0x9e9e9e];

// ---------------------------------------------------------------- shared resources

const matCache = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number): THREE.MeshStandardMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
    matCache.set(color, m);
  }
  return m;
}

function makeGeo() {
  return {
    leg: new THREE.CapsuleGeometry(0.12, 0.5, 4, 8),
    arm: new THREE.CapsuleGeometry(0.09, 0.5, 4, 8),
    torso: new THREE.CapsuleGeometry(0.34, 0.55, 4, 12),
    head: new THREE.SphereGeometry(0.3, 16, 12),
    hair: new THREE.SphereGeometry(0.315, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2),
    eye: new THREE.SphereGeometry(0.05, 8, 6),
    brow: new THREE.BoxGeometry(0.16, 0.045, 0.045),
    mouth: new THREE.TorusGeometry(0.09, 0.024, 6, 10, Math.PI),
    moustache: new THREE.BoxGeometry(0.22, 0.06, 0.06),
    scarf: new THREE.TorusGeometry(0.25, 0.08, 6, 14),
    pole: new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6),
    cloth: new THREE.BoxGeometry(0.9, 0.55, 0.03),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
    cone: new THREE.ConeGeometry(1, 1, 12),
    sphere: new THREE.SphereGeometry(1, 16, 12),
  };
}
let G: ReturnType<typeof makeGeo> | null = null;
const geo = () => (G ??= makeGeo());

function add(
  parent: THREE.Object3D,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- people

interface Person {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  flag: THREE.Group | null;
}

function buildPerson(o: {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  scarf?: number;
  flag?: [number, number];
  belly?: boolean;
  moustache?: boolean;
}): Person {
  const g = geo();
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.78, 0);
    add(pivot, g.leg, mat(o.pants), 0, -0.38, 0);
    group.add(pivot);
    return pivot;
  });
  const bw = o.belly ? 1.18 : 1;
  add(body, g.torso, mat(o.shirt), 0, 1.22, 0, bw, 1, bw * 1.05);

  const head = new THREE.Group();
  head.position.y = 1.95;
  body.add(head);
  add(head, g.head, mat(o.skin), 0, 0, 0);
  add(head, g.hair, mat(o.hair), 0, 0.03, 0.02);
  const dark = mat(0x161616);
  for (const side of [-1, 1]) {
    add(head, g.eye, dark, side * 0.11, 0.03, -0.27);
    // angry eyebrows: the inner ends point down
    const brow = add(head, g.brow, dark, side * 0.11, 0.13, -0.27);
    brow.rotation.z = side * 0.45;
  }
  add(head, g.mouth, dark, 0, -0.14, -0.26); // upper half-ring = a frown
  if (o.moustache) add(head, g.moustache, mat(o.hair), 0, -0.06, -0.29);
  if (o.scarf !== undefined) {
    const s = add(body, g.scarf, mat(o.scarf), 0, 1.68, 0);
    s.rotation.x = Math.PI / 2;
  }

  const [armL, armR] = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (0.42 * bw), 1.55, 0);
    add(pivot, g.arm, mat(o.shirt), 0, -0.33, 0);
    body.add(pivot);
    return pivot;
  });

  let flag: THREE.Group | null = null;
  if (o.flag) {
    add(armR, g.pole, mat(0x6b4f2a), 0, -1.15, 0);
    flag = new THREE.Group();
    flag.position.set(0, -1.75, 0);
    armR.add(flag);
    const c1 = add(flag, g.cloth, mat(o.flag[0]), 0.47, 0.1, 0);
    c1.scale.y = 0.5;
    c1.position.y = 0.14;
    const c2 = add(flag, g.cloth, mat(o.flag[1]), 0.47, -0.14, 0);
    c2.scale.y = 0.5;
  }
  return { group, body, head, armL, armR, legL: legs[0], legR: legs[1], flag };
}

/** Leg/arm swing for walking (amp 0 = standing). */
function walkPose(p: Person, phase: number, amp: number): void {
  const s = Math.sin(phase) * amp;
  p.legL.rotation.x = s;
  p.legR.rotation.x = -s;
  p.body.position.y = Math.abs(Math.cos(phase)) * 0.07 * Math.min(1, amp * 2);
}

function relaxArms(p: Person): void {
  p.armL.rotation.set(0, 0, 0);
  p.armR.rotation.set(0, 0, 0);
  p.body.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
}

/** Turn a group smoothly to face the direction (vx, vz). */
function face(g: THREE.Object3D, vx: number, vz: number, dt: number, rate = 10): void {
  const target = Math.atan2(-vx, -vz);
  let diff = target - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  g.rotation.y += diff * Math.min(1, dt * rate);
}

// ---------------------------------------------------------------- placement

/** A spot beside a road. Local frame: origin on the road edge, local +Z points at the road centre. */
interface Site {
  ox: number;
  oz: number;
  rot: number;
  /** the road this site faces */
  vertical: boolean;
  roadAt: number;
}

function toWorld(s: Site, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(s.rot);
  const n = Math.sin(s.rot);
  return { x: s.ox + lx * c + lz * n, z: s.oz - lx * n + lz * c };
}

/** World AABB of a local rectangle (exact: sites are rotated by multiples of 90°). */
function localBox(s: Site, x0: number, x1: number, z0: number, z1: number): Obstacle {
  const a = toWorld(s, x0, z0);
  const b = toWorld(s, x1, z1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

function allSites(rng: () => number): Site[] {
  const out: Site[] = [];
  const half = ROADS.width / 2;
  for (const vertical of [true, false]) {
    for (const at of vertical ? ROADS.xs : ROADS.zs) {
      for (const side of [-1, 1]) {
        for (let t = -136; t <= 136; t += 4) {
          // direction from the site towards the road centre
          const dx = vertical ? -side : 0;
          const dz = vertical ? 0 : -side;
          out.push({
            ox: vertical ? at + side * half : t,
            oz: vertical ? t : at + side * half,
            rot: Math.atan2(dx, dz),
            vertical,
            roadAt: at,
          });
        }
      }
    }
  }
  // deterministic shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A thin post (street lamp, pole): ~1 m beside it is plenty to walk past. */
const isPost = (o: Obstacle): boolean => o.maxX - o.minX < 0.9 && o.maxZ - o.minZ < 0.9;

/** Walking room (m) kept around the stadium/bar plot: full first, relaxed only on crowded maps. */
const ROOM_STEPS = [2, 1.2] as const;

/**
 * How many sample points of a local rectangle collide with roads, obstacles (within `room` m), the airport or the
 * map edge. Stops counting at `limit`. The samples include the rectangle's edges, so the room is kept all round.
 */
function conflicts(
  s: Site,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  obstacles: Obstacle[],
  room: number,
  limit = Infinity,
): number {
  let bad = 0;
  const a = AIRPORT_ZONE;
  const big = obstacles.filter((o) => !isPost(o));
  const posts = obstacles.filter(isPost);
  const nx = Math.max(1, Math.ceil((x1 - x0) / 1.5));
  const nz = Math.max(1, Math.ceil((z1 - z0) / 1.5));
  for (let i = 0; i <= nx; i++) {
    const lx = x0 + ((x1 - x0) * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const lz = z0 + ((z1 - z0) * j) / nz;
      const { x, z } = toWorld(s, lx, lz);
      if (
        Math.abs(x) > 140 ||
        Math.abs(z) > 140 ||
        onRoad(x, z, 0.5) ||
        (x > a.minX - 3 && x < a.maxX + 3 && z > a.minZ - 3 && z < a.maxZ + 3) ||
        Math.hypot(x - SPAWN.x, z - SPAWN.z) < 14 ||
        !isFree(x, z, room, big) ||
        !isFree(x, z, Math.min(room, 0.6), posts)
      ) {
        bad++;
        if (bad >= limit) return bad;
      }
    }
  }
  return bad;
}

function quadrant(x: number, z: number): number {
  return (x > SPAWN.x ? 1 : 0) + (z > SPAWN.z ? 2 : 0);
}

/**
 * First conflict-free site that passes `ok` with full walking room around it, then with less room;
 * else the least-bad one (busy maps still get the feature).
 */
function pickSite(
  sites: Site[],
  rect: [number, number, number, number],
  obstacles: Obstacle[],
  ok: (s: Site) => boolean,
): Site | null {
  const okSites = sites.filter(ok);
  for (const room of ROOM_STEPS) {
    for (const s of okSites) if (conflicts(s, rect[0], rect[1], rect[2], rect[3], obstacles, room, 1) === 0) return s;
  }
  let best: Site | null = null;
  let bestScore = Infinity;
  for (const s of okSites) {
    const score = conflicts(s, rect[0], rect[1], rect[2], rect[3], obstacles, 0.9, bestScore);
    if (score === 0) return s;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------- actors

type FanState = 'roam' | 'chase' | 'cheer' | 'back' | 'enter' | 'gone';
interface Fan {
  p: Person;
  state: FanState;
  t: number;
  phase: number;
  scale: number;
  ox: number;
  oz: number;
  hitCd: number;
  dodge: number;
  dvx: number;
  dvz: number;
  /** seconds until it pops out of the gate (staggered release) */
  delay: number;
}

type FighterState = 'squabble' | 'chase' | 'return';
interface Fighter {
  p: Person;
  home: THREE.Vector3;
  /** +1 for the first man, -1 for the second (direction along the squabble axis towards the other) */
  sign: number;
  state: FighterState;
  t: number;
  phase: number;
  dodge: number;
  dvx: number;
  dvz: number;
}

function moveSlide(pos: THREE.Vector3, vx: number, vz: number, dist: number, obstacles: Obstacle[]): void {
  const nx = pos.x + vx * dist;
  const nz = pos.z + vz * dist;
  if (isFree(nx, pos.z, PERSON_R, obstacles)) pos.x = nx;
  if (isFree(pos.x, nz, PERSON_R, obstacles)) pos.z = nz;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Rhythmic "o-lé, o-lé, o-lé-o-lé, o-lééé" — volume falls off with distance. */
function chant(gain: number): void {
  if (gain < 0.01) return;
  const notes: [number, number, number][] = [
    [523, 0, 0.18], [659, 0.22, 0.35],
    [523, 0.62, 0.18], [659, 0.84, 0.35],
    [523, 1.24, 0.14], [659, 1.4, 0.14], [784, 1.56, 0.14], [659, 1.72, 0.55],
  ];
  for (const [f, s, d] of notes) {
    tone(f, s, d, 'triangle', gain);
    tone(f / 2, s, d, 'sawtooth', gain * 0.25); // a rough "crowd" undertone
  }
}

function grumble(gain: number): void {
  if (gain < 0.01) return;
  const f = 120 + Math.random() * 40;
  tone(f, 0, 0.16, 'sawtooth', gain);
  tone(f * 0.8, 0.14, 0.24, 'sawtooth', gain * 0.8);
}

const falloff = (d: number, max: number) => THREE.MathUtils.clamp(1 - d / max, 0, 1);

// ---------------------------------------------------------------- Trouble

export class Trouble {
  // stadium
  private readonly stadium: Site | null;
  private readonly stadiumC = new THREE.Vector3();
  private readonly gateOut = new THREE.Vector3(); // just outside the gate
  private readonly team: [number, number];
  private crowd: THREE.InstancedMesh | null = null;
  private readonly crowdBase: { x: number; y: number; z: number; ph: number }[] = [];
  private fans: Fan[] = [];
  private mode: 'inside' | 'out' | 'returning' = 'inside';
  private nextRelease = 60 + Math.random() * 30;
  private outTimer = 0;
  private approached = false;
  private chantTimer = 2;
  private shoutCd = 4;
  private anchorVertical = true;
  private anchorAt = 0;
  private anchorT = 0;
  private anchorTimer = 0;

  // bar
  private readonly bar: Site | null;
  private readonly barSpot = new THREE.Vector3();
  private readonly axis = new THREE.Vector2(1, 0);
  private fighters: Fighter[] = [];
  private barClock = 0;
  private barCd = 0;
  private barLineCd = 3;

  private time = 0;
  private readonly lastPlayer = new THREE.Vector3();
  private readonly carVel = new THREE.Vector2();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
  ) {
    this.team = TEAMS[Math.floor(rng() * TEAMS.length)];
    const sites = allSites(rng);
    const R = STADIUM_R;

    // stadium: 60-130 m from the spawn (measured at its centre)
    // rect = stand + 1 m all round (the gate front is at -2.9; the pavement strip by the road keeps its lamps)
    this.stadium = pickSite(sites, [-R - 1, R + 1, -2 * R - 5, -3], obstacles, (s) => {
      const c = toWorld(s, 0, -(R + 4));
      const d = Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z);
      return d >= 60 && d <= 130;
    });
    if (this.stadium) this.buildStadium(this.stadium);

    // bar: 40-130 m from the spawn, in another quadrant than the stadium
    const sq = this.stadium ? quadrant(this.stadiumC.x, this.stadiumC.z) : -1;
    this.bar = pickSite(sites, [-6, 6, -13.5, -2.5], obstacles, (s) => {
      const c = toWorld(s, 2.6, -3.2);
      const d = Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z);
      return d >= 40 && d <= 130 && quadrant(c.x, c.z) !== sq;
    });
    if (this.bar) this.buildBar(this.bar);
    this.lastPlayer.copy(ctx.player);
  }

  /** Debug/QA: where the trouble-makers are. */
  positions(): { kind: 'fan' | 'fighter'; x: number; z: number; state: string }[] {
    const r = (v: number) => +v.toFixed(1);
    return [
      ...this.fans.map((f) => ({ kind: 'fan' as const, x: r(f.p.group.position.x), z: r(f.p.group.position.z), state: f.state })),
      ...this.fighters.map((f) => ({ kind: 'fighter' as const, x: r(f.p.group.position.x), z: r(f.p.group.position.z), state: f.state })),
    ];
  }

  /** Where the stadium and bar ended up (debug/QA). */
  sites(): { stadium: { x: number; z: number } | null; bar: { x: number; z: number } | null; gate: { x: number; z: number } | null } {
    return {
      stadium: this.stadium ? { x: this.stadiumC.x, z: this.stadiumC.z } : null,
      bar: this.bar ? { x: this.barSpot.x, z: this.barSpot.z } : null,
      gate: this.stadium ? { x: this.gateOut.x, z: this.gateOut.z } : null,
    };
  }

  /** Send the fans out right now (if they're inside). */
  releaseFans(): void {
    if (!this.stadium || this.mode !== 'inside') return;
    this.mode = 'out';
    this.outTimer = 40 + Math.random() * 20;
    this.chantTimer = 0.5;
    const n = 5 + Math.floor(Math.random() * 3);
    const [shirt, scarf] = this.team;
    for (let i = 0; i < n; i++) {
      const p = buildPerson({
        shirt,
        pants: pick([0x1f2937, 0x334155, 0x1e3a8a, 0x3f3f46]),
        skin: pick(SKINS),
        hair: pick(HAIRS),
        scarf,
        flag: i === 0 ? [shirt, scarf] : undefined,
        belly: Math.random() < 0.35,
      });
      const lx = (Math.random() - 0.5) * 2;
      const w = toWorld(this.stadium, lx, -3.4);
      p.group.position.set(w.x, 0, w.z);
      p.group.rotation.y = this.stadium.rot + Math.PI; // facing the road
      p.group.scale.setScalar(0.01);
      p.group.visible = false;
      this.scene.add(p.group);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.8;
      this.fans.push({
        p, state: 'roam', t: 0, phase: Math.random() * 10, scale: 0, ox: Math.cos(a) * r, oz: Math.sin(a) * r,
        hitCd: 0, dodge: 0, dvx: 0, dvz: 0, delay: i * 0.45,
      });
    }
    // the group starts on the road in front of the gate
    this.anchorVertical = this.stadium.vertical;
    this.anchorAt = this.stadium.roadAt;
    this.anchorT = this.stadium.vertical ? this.gateOut.z : this.gateOut.x;
    this.anchorTimer = 0;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const player = ctx.player;
    if (dt > 0) this.carVel.set((player.x - this.lastPlayer.x) / dt, (player.z - this.lastPlayer.z) / dt);
    this.lastPlayer.copy(player);
    if (ctx.isPaused() || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.stadium) this.updateStadium(dt);
    if (this.bar) this.updateBar(dt);
  }

  /** If the car is coming at (x, z), the sideways direction to jump to (else null). */
  private carThreat(x: number, z: number): { vx: number; vz: number } | null {
    if (!this.ctx.isDriving()) return null;
    const p = this.ctx.player;
    const speed = this.carVel.length();
    const dx = x - p.x;
    const dz = z - p.z;
    if (speed < 2 || Math.hypot(dx, dz) > 7) return null;
    const ux = this.carVel.x / speed;
    const uz = this.carVel.y / speed;
    if (dx * ux + dz * uz < 0) return null; // behind the car
    let px = -uz;
    let pz = ux;
    if (px * dx + pz * dz < 0) {
      px = -px;
      pz = -pz;
    }
    return { vx: px, vz: pz };
  }

  // ------------------------------------------------------------ stadium

  private anchor(): { x: number; z: number } {
    return this.anchorVertical ? { x: this.anchorAt, z: this.anchorT } : { x: this.anchorT, z: this.anchorAt };
  }

  /** Walk the group along the streets near the stadium (switching streets at crossings). */
  private nextAnchor(): void {
    this.anchorTimer = 0;
    const crossings = (this.anchorVertical ? ROADS.zs : ROADS.xs).filter((c) => {
      const d = Math.abs(c - this.anchorT);
      const pt = this.anchorVertical ? { x: this.anchorAt, z: c } : { x: c, z: this.anchorAt };
      return d > 3 && d < 30 && Math.hypot(pt.x - this.gateOut.x, pt.z - this.gateOut.z) < FAN_ROAM;
    });
    if (crossings.length && Math.random() < 0.4) {
      const c = pick(crossings);
      const oldAt = this.anchorAt;
      this.anchorVertical = !this.anchorVertical;
      this.anchorAt = c;
      this.anchorT = oldAt;
    } else {
      let step = (10 + Math.random() * 12) * (Math.random() < 0.5 ? -1 : 1);
      const t = this.anchorT + step;
      const pt = this.anchorVertical ? { x: this.anchorAt, z: t } : { x: t, z: this.anchorAt };
      if (Math.abs(t) > 135 || Math.hypot(pt.x - this.gateOut.x, pt.z - this.gateOut.z) > FAN_ROAM) step = -step;
      this.anchorT = THREE.MathUtils.clamp(this.anchorT + step, -135, 135);
    }
    for (const f of this.fans) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 2.8;
      f.ox = Math.cos(a) * r;
      f.oz = Math.sin(a) * r;
    }
  }

  private updateStadium(dt: number): void {
    const ctx = this.ctx;
    const player = ctx.player;
    const gateDist = Math.hypot(player.x - this.gateOut.x, player.z - this.gateOut.z);

    // the crowd inside bobs up and down (only worth animating when she's around)
    if (this.crowd && gateDist < 110) {
      const m = new THREE.Matrix4();
      const hype = this.mode === 'inside' ? 0.12 : 0.3;
      this.crowdBase.forEach((c, i) => {
        m.makeTranslation(c.x, c.y + Math.max(0, Math.sin(this.time * 7 + c.ph)) * hype, c.z);
        this.crowd!.setMatrixAt(i, m);
      });
      this.crowd.instanceMatrix.needsUpdate = true;
    }

    if (this.mode === 'inside') {
      if (!this.approached && gateDist < FIRST_LOOK_DIST) {
        this.approached = true;
        this.nextRelease = Math.min(this.nextRelease, 20);
      }
      this.nextRelease -= dt;
      if (this.nextRelease <= 0) this.releaseFans();
      return;
    }

    this.outTimer -= dt;
    this.shoutCd -= dt;
    if (this.mode === 'out' && this.outTimer <= 0) {
      this.mode = 'returning';
      for (const f of this.fans) if (f.state !== 'enter' && f.state !== 'gone') this.setFan(f, 'back');
    }

    // chanting, louder when she's near the group
    const centre = new THREE.Vector3();
    let shown = 0;
    for (const f of this.fans) {
      if (f.delay > 0) continue;
      centre.add(f.p.group.position);
      shown++;
    }
    if (shown) centre.divideScalar(shown);
    else centre.copy(this.gateOut);
    const groupDist = Math.hypot(player.x - centre.x, player.z - centre.z);
    this.chantTimer -= dt;
    if (this.chantTimer <= 0) {
      this.chantTimer = 5 + Math.random() * 3;
      chant(0.12 * falloff(groupDist, 70));
    }
    if (this.mode === 'out' && this.shoutCd <= 0 && groupDist < 25 && !ctx.isDriving()) {
      taunt(pick(FAN_SHOUTS));
      this.shoutCd = 9 + Math.random() * 6;
    }

    // the group's meeting point moves along the streets
    this.anchorTimer += dt;
    const anc = this.anchor();
    if (this.mode === 'out' && (Math.hypot(centre.x - anc.x, centre.z - anc.z) < 3 || this.anchorTimer > 14)) this.nextAnchor();
    const a = this.anchor();

    for (let i = this.fans.length - 1; i >= 0; i--) {
      const f = this.fans[i];
      const g = f.p.group;
      const pos = g.position;
      if (f.delay > 0) {
        f.delay -= dt;
        if (f.delay > 0) continue;
        g.visible = true;
      }
      f.t += dt;
      f.hitCd -= dt;
      f.scale = THREE.MathUtils.clamp(f.scale + (f.state === 'enter' || f.state === 'gone' ? -dt * 1.2 : dt * 2.5), 0, 1);
      g.scale.setScalar(Math.max(0.01, f.scale));
      if ((f.state === 'enter' || f.state === 'gone') && f.scale <= 0) {
        this.scene.remove(g);
        this.fans.splice(i, 1);
        continue;
      }

      const dx = player.x - pos.x;
      const dz = player.z - pos.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const fromGate = Math.hypot(pos.x - this.gateOut.x, pos.z - this.gateOut.z);
      const driving = ctx.isDriving();

      // jump out of the car's way
      const threat = f.dodge <= 0 && f.state !== 'enter' && f.state !== 'gone' ? this.carThreat(pos.x, pos.z) : null;
      if (threat) {
        f.dodge = 0.7;
        f.dvx = threat.vx;
        f.dvz = threat.vz;
      }

      let vx = 0;
      let vz = 0;
      let speed = 0;
      relaxArms(f.p);
      if (f.dodge > 0) {
        f.dodge -= dt;
        vx = f.dvx;
        vz = f.dvz;
        speed = 5;
        f.p.armL.rotation.z = -2.6;
        f.p.armR.rotation.z = 2.6;
        f.p.body.position.y = Math.sin((1 - f.dodge / 0.7) * Math.PI) * 0.6;
        moveSlide(pos, vx, vz, speed * dt, this.obstacles);
        continue;
      }

      if (f.state === 'roam') {
        if (this.mode === 'out' && !driving && d < FAN_SEE && f.hitCd <= 0 && fromGate < FAN_LEASH) {
          this.setFan(f, 'chase');
          if (this.shoutCd <= 0) {
            taunt(pick(FAN_CHASE_SHOUTS));
            this.shoutCd = 8 + Math.random() * 5;
          }
        } else {
          const tx = a.x + f.ox - pos.x;
          const tz = a.z + f.oz - pos.z;
          const td = Math.hypot(tx, tz);
          if (td > 0.6) {
            vx = tx / td;
            vz = tz / td;
            speed = td > 6 ? 3 : FAN_WALK;
          }
        }
      }
      if (f.state === 'chase') {
        if (driving || d > FAN_SEE * 1.5 || f.t > 10 || fromGate > FAN_LEASH + 5) this.setFan(f, 'roam');
        else {
          vx = dx / d;
          vz = dz / d;
          speed = FAN_CHASE_SPEED;
          if (d < HIT_DIST && f.hitCd <= 0) {
            if (ctx.hurt(pos.clone(), FAN_COST)) this.cheer();
            else f.hitCd = 1;
          }
        }
      }
      if (f.state === 'cheer') {
        if (f.t > 1.3) {
          // back off, still celebrating
          vx = -dx / d;
          vz = -dz / d;
          speed = 2.4;
        }
        if (f.t > 4.2) this.setFan(f, this.mode === 'out' ? 'roam' : 'back');
      }
      if (f.state === 'back') {
        const tx = this.gateOut.x - pos.x;
        const tz = this.gateOut.z - pos.z;
        const td = Math.hypot(tx, tz);
        if (td < 1.3) this.setFan(f, 'enter');
        else if (f.t > 30) this.setFan(f, 'gone'); // stuck somewhere: just fade away
        else {
          vx = tx / td;
          vz = tz / td;
          speed = td > 8 ? 2.6 : FAN_WALK;
        }
      }
      if (f.state === 'enter') {
        // walk through the gate into the stadium (no collision: they go inside)
        const tx = this.stadiumC.x - pos.x;
        const tz = this.stadiumC.z - pos.z;
        const td = Math.hypot(tx, tz) || 1;
        pos.x += (tx / td) * FAN_WALK * dt;
        pos.z += (tz / td) * FAN_WALK * dt;
        face(g, tx, tz, dt);
        walkPose(f.p, (f.phase += dt * 8), 0.5);
        continue;
      }

      if (speed > 0) {
        moveSlide(pos, vx, vz, speed * dt, this.obstacles);
        face(g, vx, vz, dt);
      } else if (d < 25 && !driving) face(g, dx, dz, dt, 4);

      // poses
      const p = f.p;
      const t = this.time + f.phase;
      if (f.state === 'cheer') {
        p.body.position.y = Math.abs(Math.sin(t * 9)) * 0.45;
        p.legL.rotation.x = p.legR.rotation.x = 0;
        p.armL.rotation.z = -2.7 + Math.sin(t * 14) * 0.2;
        p.armR.rotation.z = 2.7 - Math.sin(t * 14) * 0.2;
      } else {
        f.phase += dt * (speed > 3 ? 11 : 7);
        walkPose(p, f.phase, speed > 0 ? (speed > 3 ? 0.8 : 0.5) : 0);
        if (f.state === 'chase') {
          // shaking fists forward-up, angry lean
          p.armL.rotation.x = 2.3 + Math.sin(t * 15) * 0.35;
          p.armR.rotation.x = 2.3 + Math.cos(t * 15) * 0.35;
          p.body.rotation.x = -0.15;
        } else if (p.flag) {
          p.armR.rotation.x = Math.PI - 0.15; // flag held high
        } else {
          // chanting: one fist pumping in the rhythm, the other arm swinging
          p.armR.rotation.x = 2.6 + Math.max(0, Math.sin(t * 6)) * 0.5;
          p.armL.rotation.x = Math.sin(f.phase) * 0.5;
        }
      }
      if (p.flag) {
        if (f.state !== 'chase') p.armR.rotation.x = Math.PI - 0.15;
        p.flag.rotation.y = Math.sin(t * 5) * 0.6;
      }
      p.head.rotation.z = Math.sin(t * 6) * 0.08;
    }

    if (this.mode === 'returning' && this.fans.length === 0) {
      this.mode = 'inside';
      this.nextRelease = 60 + Math.random() * 30;
    }
  }

  /** Someone caught her: the whole group celebrates and backs off. */
  private cheer(): void {
    for (const f of this.fans) if (f.state === 'roam' || f.state === 'chase') this.setFan(f, 'cheer');
    for (const f of this.fans) f.hitCd = 6;
    taunt(pick(FAN_WIN_SHOUTS));
    this.shoutCd = 8;
    chant(0.12);
    this.chantTimer = 6;
  }

  private setFan(f: Fan, s: FanState): void {
    f.state = s;
    f.t = 0;
  }

  // ------------------------------------------------------------ bar

  private updateBar(dt: number): void {
    const ctx = this.ctx;
    const player = ctx.player;
    const driving = ctx.isDriving();
    const spotDist = Math.hypot(player.x - this.barSpot.x, player.z - this.barSpot.z);
    this.barCd -= dt;
    this.barLineCd -= dt;

    const both = this.fighters.every((f) => f.state === 'squabble');
    const prevClock = this.barClock;
    this.barClock = (this.barClock + dt) % SQUABBLE_CYCLE;
    // pushes: A pushes B at the start of the cycle, B pushes A halfway
    const pulse = (c: number, a: number, b: number) => (c >= a && c <= b ? Math.sin((Math.PI * (c - a)) / (b - a)) : 0);
    const pushA = pulse(this.barClock, 0, 0.6);
    const pushB = pulse(this.barClock, SQUABBLE_CYCLE / 2, SQUABBLE_CYCLE / 2 + 0.6);
    const crossed = (at: number) => prevClock < at && this.barClock >= at;
    if (both && (crossed(0.05) || crossed(SQUABBLE_CYCLE / 2 + 0.05) || this.barClock < prevClock)) {
      grumble(0.1 * falloff(spotDist, 35));
    }
    if (both && this.barLineCd <= 0 && spotDist < 18 && !driving) {
      taunt(pick(BAR_LINES));
      this.barLineCd = 10 + Math.random() * 6;
    }

    // she came too close: one or both lunge
    if (both && this.barCd <= 0 && !driving && spotDist < BAR_SEE) {
      const nearer = [...this.fighters].sort((p, q) => p.p.group.position.distanceTo(player) - q.p.group.position.distanceTo(player));
      const who = Math.random() < 0.5 ? nearer : nearer.slice(0, 1);
      for (const f of who) this.setFighter(f, 'chase');
      taunt(pick(BAR_LUNGE));
      this.barLineCd = 6;
    }

    for (const f of this.fighters) {
      const g = f.p.group;
      const pos = g.position;
      f.t += dt;
      const p = f.p;
      relaxArms(p);
      const dx = player.x - pos.x;
      const dz = player.z - pos.z;
      const d = Math.hypot(dx, dz) || 0.001;

      const threat = f.dodge <= 0 ? this.carThreat(pos.x, pos.z) : null;
      if (threat) {
        f.dodge = 0.7;
        f.dvx = threat.vx;
        f.dvz = threat.vz;
        if (f.state === 'squabble') this.setFighter(f, 'return');
      }
      if (f.dodge > 0) {
        f.dodge -= dt;
        moveSlide(pos, f.dvx, f.dvz, 5 * dt, this.obstacles);
        p.armL.rotation.z = -2.6;
        p.armR.rotation.z = 2.6;
        p.body.position.y = Math.sin((1 - Math.max(0, f.dodge) / 0.7) * Math.PI) * 0.6;
        continue;
      }

      if (f.state === 'chase') {
        const fromBar = Math.hypot(pos.x - this.barSpot.x, pos.z - this.barSpot.z);
        if (driving || fromBar > BAR_LEASH || f.t > 5) this.setFighter(f, 'return');
        else {
          const vx = dx / d;
          const vz = dz / d;
          moveSlide(pos, vx, vz, BAR_CHASE_SPEED * dt, this.obstacles);
          face(g, vx, vz, dt);
          f.phase += dt * 12;
          walkPose(p, f.phase, 0.8);
          p.armL.rotation.x = 1.4 + Math.sin(this.time * 16) * 0.4; // arms out in front, flailing
          p.armR.rotation.x = 1.4 - Math.sin(this.time * 16) * 0.4;
          p.body.rotation.x = -0.2;
          if (d < HIT_DIST) {
            if (ctx.hurt(pos.clone(), BAR_COST)) grumble(0.12);
            for (const o of this.fighters) if (o.state === 'chase') this.setFighter(o, 'return');
          }
        }
        continue;
      }
      if (f.state === 'return') {
        const tx = f.home.x - pos.x;
        const tz = f.home.z - pos.z;
        const td = Math.hypot(tx, tz);
        if (td < 0.3) {
          pos.copy(f.home);
          this.setFighter(f, 'squabble');
          this.barCd = 3;
        } else {
          moveSlide(pos, tx / td, tz / td, Math.min(td, 3 * dt), this.obstacles);
          face(g, tx, tz, dt);
          f.phase += dt * 8;
          walkPose(p, f.phase, 0.5);
          p.armR.rotation.x = 2.5 + Math.sin(this.time * 12) * 0.3; // still shaking a fist
          if (f.t > 12) pos.copy(f.home); // got stuck: snap home
        }
        continue;
      }

      // squabble
      walkPose(p, 0, 0);
      const t = this.time * 1.0 + f.sign;
      if (both) {
        const mine = f.sign > 0 ? pushA : pushB;
        const got = f.sign > 0 ? pushB : pushA;
        const off = f.sign * (mine * 0.35 - got * 0.45);
        pos.set(f.home.x + this.axis.x * off, 0, f.home.z + this.axis.y * off);
        g.rotation.y = Math.atan2(-this.axis.x * f.sign, -this.axis.y * f.sign);
        // between pushes: fists up and shaking, head wagging, little angry hops
        const calm = 1 - Math.max(mine, got);
        p.armR.rotation.x = 2.5 * calm + 1.5 * mine + Math.sin(t * 14) * 0.3 * calm;
        p.armL.rotation.x = 1.5 * mine;
        p.armL.rotation.z = -(1.6 + Math.sin(t * 9) * 0.5) * calm - 1.3 * got;
        p.armR.rotation.z = 1.3 * got;
        p.body.rotation.x = -0.25 * mine + 0.3 * got;
        p.head.rotation.y = Math.sin(t * 10) * 0.25 * calm;
        p.body.position.y = Math.abs(Math.sin(t * 5)) * 0.12 * calm;
      } else {
        // the other one is away: shake fists at her
        face(g, dx, dz, dt, 5);
        p.armL.rotation.x = 2.5 + Math.sin(t * 14) * 0.3;
        p.armR.rotation.x = 2.5 + Math.cos(t * 14) * 0.3;
        p.body.position.y = Math.abs(Math.sin(t * 6)) * 0.15;
      }
    }
  }

  private setFighter(f: Fighter, s: FighterState): void {
    f.state = s;
    f.t = 0;
  }

  // ------------------------------------------------------------ building

  private buildStadium(s: Site): void {
    const R = STADIUM_R;
    const cz = -(R + 4);
    const c = toWorld(s, 0, cz);
    this.stadiumC.set(c.x, 0, c.z);
    const go = toWorld(s, 0, -1.8);
    this.gateOut.set(go.x, 0, go.z);
    const g = geo();
    const [c1, c2] = this.team;

    const root = new THREE.Group();
    root.position.set(c.x, 0, c.z);
    root.rotation.y = s.rot;
    this.scene.add(root);

    const wallMat = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.8, side: THREE.DoubleSide });
    const whiteDS = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, side: THREE.DoubleSide });
    const standMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.9, side: THREE.DoubleSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 7, 48, 1, true), wallMat);
    wall.position.y = 3.5;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 0.9, 48, 1, true), whiteDS);
    band.position.y = 7.2;
    const stands = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.4, R - 7, 6.5, 48, 1, true), standMat);
    stands.position.y = 0.3 + 3.25;
    const roof = new THREE.Mesh(new THREE.RingGeometry(R - 3.2, R + 0.3, 48), whiteDS);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = 7.7;
    for (const m of [wall, band, stands, roof]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }

    // the pitch
    const grass = new THREE.Mesh(new THREE.CircleGeometry(R - 6.8, 40), mat(0x3f9b3a));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.05;
    grass.receiveShadow = true;
    root.add(grass);
    const white = mat(0xffffff);
    const L = 7;
    const W = 4.6;
    add(root, g.box, white, 0, 0.07, -W, 2 * L, 0.02, 0.15);
    add(root, g.box, white, 0, 0.07, W, 2 * L, 0.02, 0.15);
    add(root, g.box, white, -L, 0.07, 0, 0.15, 0.02, 2 * W);
    add(root, g.box, white, L, 0.07, 0, 0.15, 0.02, 2 * W);
    add(root, g.box, white, 0, 0.07, 0, 0.15, 0.02, 2 * W);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.45, 28), white);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    root.add(ring);
    for (const side of [-1, 1]) {
      add(root, g.box, white, side * L, 0.7, -1, 0.12, 1.4, 0.12);
      add(root, g.box, white, side * L, 0.7, 1, 0.12, 1.4, 0.12);
      add(root, g.box, white, side * L, 1.4, 0, 0.12, 0.12, 2.1);
    }

    // the crowd on the stands: one instanced mesh, coloured in the team's colours
    const rows = 4;
    const perRow = [34, 40, 46, 52];
    let count = 0;
    for (const n of perRow) count += n;
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), count);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const f = 0.15 + (r / (rows - 1)) * 0.6;
      const rad = R - 7 + f * 6.6;
      const y = 0.3 + f * 6.5 + 0.35;
      for (let i = 0; i < perRow[r]; i++) {
        const a = (i / perRow[r]) * Math.PI * 2 + r * 0.2;
        const x = Math.cos(a) * rad;
        const z = Math.sin(a) * rad;
        m4.makeTranslation(x, y, z);
        crowd.setMatrixAt(k, m4);
        col.setHex(Math.random() < 0.7 ? (Math.random() < 0.6 ? c1 : c2) : pick(SKINS));
        crowd.setColorAt(k, col);
        this.crowdBase.push({ x, y, z, ph: Math.random() * Math.PI * 2 });
        k++;
      }
    }
    crowd.castShadow = true;
    root.add(crowd);
    this.crowd = crowd;

    // floodlight towers on the four diagonals
    const steel = mat(0x6b7280);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfffbe6, emissive: 0xfff3b0, emissiveIntensity: 0.9 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const x = Math.cos(a) * (R + 1.2);
      const z = Math.sin(a) * (R + 1.2);
      add(root, g.cyl, steel, x, 8, z, 0.3, 16, 0.3);
      const head = add(root, g.box, lampMat, x, 16.3, z, 3.2, 1.8, 0.4);
      head.rotation.y = Math.atan2(x, z);
      head.rotation.x = 0.35;
      const w = toWorld(s, x, cz + z);
      this.obstacles.push({ minX: w.x - 0.5, maxX: w.x + 0.5, minZ: w.z - 0.5, maxZ: w.z + 0.5 });
    }

    // the gate, facing the road: two tall pillars, a lintel with a big ball, flags, and a dark tunnel
    const gz = R - 0.2 + 0.5; // local to the stadium centre (+z = towards the road)
    add(root, g.box, mat(c2), -2.6, 4.2, gz, 1.2, 8.4, 1.6);
    add(root, g.box, mat(c2), 2.6, 4.2, gz, 1.2, 8.4, 1.6);
    add(root, g.box, mat(c1), 0, 8.4, gz, 6.6, 1.4, 1.7);
    add(root, g.box, mat(0x1f2328), 0, 2.9, R + 0.06, 4, 5.8, 0.1);
    add(root, g.sphere, white, 0, 10.1, gz, 1, 1, 1);
    for (const side of [-1, 1]) {
      add(root, g.cyl, steel, side * 2.6, 9.6, gz, 0.06, 2.4, 0.06);
      add(root, g.box, mat(side < 0 ? c1 : c2), side * 2.6 + 0.6, 10.3, gz, 1.1, 0.7, 0.04);
    }
    // pennants around the rim
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * (R + 0.3);
      const z = Math.sin(a) * (R + 0.3);
      add(root, g.cyl, steel, x, 8.6, z, 0.05, 2, 0.05);
      const fl = add(root, g.box, mat(i % 2 ? c1 : c2), x, 9.3, z, 0.9, 0.55, 0.04);
      fl.rotation.y = a;
    }

    // collision: the round stand as a few overlapping boxes, plus the gate pillars
    const box = (x0: number, x1: number, z0: number, z1: number) => this.obstacles.push(localBox(s, x0, x1, cz + z0, cz + z1));
    box(-R, R, -0.6 * R, 0.6 * R);
    box(-0.6 * R, 0.6 * R, -R, R);
    box(-0.8 * R, 0.8 * R, -0.8 * R, 0.8 * R);
    box(-3.2, -2.0, gz - 0.8, gz + 0.8);
    box(2.0, 3.2, gz - 0.8, gz + 0.8);
  }

  private buildBar(s: Site): void {
    const g = geo();
    const root = new THREE.Group();
    root.position.set(s.ox, 0, s.oz);
    root.rotation.y = s.rot;
    this.scene.add(root);

    // the building (front wall at local z = -7, facing the road)
    add(root, g.box, mat(0xf3e1c0), 0, 2.1, -9.75, 9, 4.2, 5.5);
    add(root, g.box, mat(0x9b2c2c), 0, 4.4, -9.75, 9.6, 0.4, 6.1);
    add(root, g.box, mat(0x6b3e1f), 2.6, 1.2, -6.96, 1.4, 2.4, 0.1); // door
    add(root, g.box, mat(0x9fd3f0), -2.8, 2.0, -6.96, 1.9, 1.3, 0.1); // windows
    add(root, g.box, mat(0x9fd3f0), -0.3, 2.0, -6.96, 1.6, 1.3, 0.1);
    // striped awning
    const awning = new THREE.Group();
    awning.position.set(0, 3.25, -6.1);
    awning.rotation.x = 0.4;
    root.add(awning);
    for (let i = 0; i < 6; i++) add(awning, g.box, mat(i % 2 ? 0xffffff : 0x2f855a), -3.83 + i * 1.53, 0, 0, 1.53, 0.1, 2);
    // the sign: a big mug of something foamy on the roof
    add(root, g.cyl, mat(0xf2a516), 0, 5.4, -7.6, 0.65, 1.3, 0.65);
    add(root, g.cyl, mat(0xffffff), 0, 6.15, -7.6, 0.72, 0.3, 0.72);
    add(root, g.sphere, mat(0xffffff), 0.25, 6.35, -7.6, 0.35, 0.3, 0.35);
    add(root, g.cyl, mat(0xf2a516), 0.95, 5.4, -7.6, 0.12, 0.8, 0.12); // handle
    add(root, g.box, mat(0xf2a516), 0.75, 5.85, -7.6, 0.45, 0.12, 0.12);
    add(root, g.box, mat(0xf2a516), 0.75, 4.95, -7.6, 0.45, 0.12, 0.12);
    // terrace: deck, two tables with parasols and chairs
    add(root, g.box, mat(0xb08158), -2.4, 0.03, -4.2, 5.6, 0.06, 5.4);
    const tables: [number, number, number][] = [
      [-3.5, -4.6, 0xe53e3e],
      [-1.2, -2.6, 0x3182ce],
    ];
    for (const [tx, tz, pc] of tables) {
      add(root, g.cyl, mat(0xffffff), tx, 0.9, tz, 0.55, 0.06, 0.55);
      add(root, g.cyl, mat(0x4a5568), tx, 0.45, tz, 0.06, 0.9, 0.06);
      add(root, g.cyl, mat(0xdddddd), tx, 1.5, tz, 0.04, 2.2, 0.04);
      add(root, g.cone, mat(pc), tx, 2.75, tz, 1.4, 0.55, 1.4);
      add(root, g.box, mat(0x7c5a3c), tx - 0.85, 0.45, tz, 0.45, 0.08, 0.45);
      add(root, g.box, mat(0x7c5a3c), tx + 0.85, 0.45, tz, 0.45, 0.08, 0.45);
      this.obstacles.push(localBox(s, tx - 0.6, tx + 0.6, tz - 0.6, tz + 0.6));
    }
    this.obstacles.push(localBox(s, -4.5, 4.5, -12.5, -7));

    // the two grumpy men, facing each other
    const homeA = toWorld(s, 1.7, -3.2);
    const homeB = toWorld(s, 3.5, -3.2);
    this.axis.set(homeB.x - homeA.x, homeB.z - homeA.z).normalize();
    const spot = toWorld(s, 2.6, -3.2);
    this.barSpot.set(spot.x, 0, spot.z);
    const looks = [
      { shirt: 0xf7fafc, pants: 0x2b6cb0, skin: pick(SKINS), hair: 0x2b1d14, belly: true, moustache: true },
      { shirt: 0x38a169, pants: 0x4a5568, skin: pick(SKINS), hair: 0x9e9e9e, belly: true, moustache: Math.random() < 0.5 },
    ];
    [homeA, homeB].forEach((h, i) => {
      const p = buildPerson(looks[i]);
      p.group.position.set(h.x, 0, h.z);
      this.scene.add(p.group);
      this.fighters.push({
        p, home: new THREE.Vector3(h.x, 0, h.z), sign: i === 0 ? 1 : -1, state: 'squabble', t: 0, phase: 0, dodge: 0, dvx: 0, dvz: 0,
      });
    });
  }
}
