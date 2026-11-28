import * as THREE from 'three';
import { audioContext } from './audio';
import { feel } from './bus';
import { flagTexture } from './flags';
import type { GameCtx } from './gamectx';
import type { SwingSeat } from './props';
import type { Interactable, Obstacle } from './world';
import { GATE_HW, PANTS, SHIRTS, SKINS, TicketGate, ball, box, buildFence, buildFolk, cyl, findPlot, mat, pick, toWorld, worldBox, type Folk, type Plot } from './venue';

/**
 * Rodeo — only in the USA level, in the place of the children's concert (Telmo, 2026-11-28; CITY_WITHOUT in cities.ts).
 * Same fenced-venue kit as the concert / pool (venue.ts): ticket booth (5 coins, tap / Enter), gate and doorman
 * (no ticket = he shakes his head and points at the booth; the ticket is taken at the gate; leaving is free).
 *
 * Inside: an oval sand arena with a wooden fence, two wooden grandstands full of spectators in cowboy hats who
 * clap, cheer and wave their hats. Tap a stand (or Enter at its foot) = she sits on the nearest free seat; any
 * key / tap = she gets up (the usual SwingSeat ride in main.ts). The show loops on the wall clock (a reload lands
 * on the same moment), child-friendly and with no animal harm:
 *   1. a cowgirl on a gently bucking horse; at the end she hops off onto the hay, laughs, waves and gets back on;
 *   2. a cowboy cantering round with a spinning lasso, then he throws it over the wooden post in the middle;
 *   3. a clown rolls a barrel, hides inside it and pops out with confetti;
 *   then everyone waves goodbye and the crowd claps. Country-style music (synthesised: banjo, fiddle, boom-chick
 *   bass — "Oh! Susanna", 1848, public domain), clear inside, muffled outside. No text, no UI.
 */

export const RODEO_PRICE = 5;

/* ---- venue layout, local frame: x across, +Z points at the road, the front fence is z = 0 ---- */
const HW = 12.5;
const BACK = -25;
const AR = { cz: -15.5, rx: 6.3, rz: 7.4 }; // the oval arena (centre x = 0)
const PATH = { a: 3.8, b: 5.0 }; // the riders' oval (relative to the arena centre)
const ST = { x0: 9.2, d: 1.0, tiers: 3, z0: -22.4, n: 17, pitch: 0.8, step: 0.55 }; // grandstands (mirrored)
const SPECTATORS_PER_SIDE = 28;

/* ---- the show (seconds in the cycle) ---- */
const CYCLE = 74;
const ACT1 = 3; // bucking horse
const ACT2 = 25; // lasso
const ACT3 = 47; // clown
const FINALE = 67;

const HOME1 = { x: -4.2, z: -4.6 }; // where the actors wait (relative to the arena centre)
const HOME2 = { x: 4.2, z: -4.6 };
const CLOWN_HOME = { x: 0, z: 2.7 };
const HAY = { x: -2.2, z: -5.9 };

const HAT_COLORS = [0x8d5524, 0x5c3d2e, 0x111111, 0xf1e3c6, 0xd9a066, 0xe03131, 0xf783ac, 0x4dabf7, 0xffffff];

/* ------------------------------------------------------------------ small helpers */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Point on the riders' oval (arena-centre relative). */
const onPath = (th: number) => ({ x: PATH.a * Math.cos(th), z: PATH.b * Math.sin(th) });
/** Yaw that faces the direction (dx, dz) (everybody's forward is −Z). */
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** Shortest turn from a to b. */
const angLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** A western hat (brim + crown + band), sitting on y = 0. */
function cowboyHat(color: number, scale = 1): THREE.Group {
  const h = new THREE.Group();
  const brim = cyl(h, mat(color), 0.5, 0.04, 0, 0.02, 0);
  brim.scale.z = 0.42; // oval brim
  brim.scale.x = 0.5;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.3, 14), mat(color));
  crown.position.y = 0.17;
  crown.castShadow = true;
  h.add(crown);
  cyl(h, mat(0x3b2a1a), 0.272, 0.06, 0, 0.07, 0);
  h.scale.setScalar(scale);
  return h;
}

interface Horse {
  group: THREE.Group;
  body: THREE.Group; // pitch pivot
  legs: THREE.Group[]; // FL FR BL BR
  head: THREE.Group;
  saddleY: number;
}

/** A friendly low-poly horse, facing −Z. */
function buildHorse(coat: number, mane: number, spots = 0): Horse {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.15;
  group.add(body);
  const m = mat(coat);
  const b = ball(body, m, 1, 0, 0.1, 0);
  b.scale.set(0.42, 0.46, 0.95);
  if (spots) for (const [x, y, z] of [[0.33, 0.2, 0.3], [-0.3, 0.05, -0.25], [0.28, -0.05, -0.45], [-0.25, 0.25, 0.5]] as const) ball(body, mat(spots), 0.17, x, y, z).scale.z = 0.5;
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.22, -0.6], [0.22, -0.6], [-0.22, 0.6], [0.22, 0.6]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.05, z);
    box(pivot, m, 0.17, 1.0, 0.17, 0, -0.5, 0);
    box(pivot, mat(0x2b2b2b), 0.2, 0.14, 0.22, 0, -1.02, 0);
    body.add(pivot);
    legs.push(pivot);
  }
  const neck = box(body, m, 0.3, 0.95, 0.38, 0, 0.62, -0.88);
  neck.rotation.x = -0.55;
  const head = new THREE.Group();
  head.position.set(0, 1.05, -1.15);
  body.add(head);
  const skull = box(head, m, 0.3, 0.32, 0.66, 0, 0, -0.18);
  skull.rotation.x = -0.4;
  box(head, mat(0xf1f3f5), 0.08, 0.2, 0.3, 0, 0.02, -0.42).rotation.x = -0.4; // blaze
  const dark = mat(0x161616);
  for (const s of [-1, 1]) {
    ball(head, dark, 0.045, s * 0.155, 0.1, -0.08);
    const ear = box(head, m, 0.07, 0.2, 0.07, s * 0.09, 0.26, 0.08);
    ear.rotation.z = s * 0.2;
  }
  const maneM = mat(mane);
  const mn = box(body, maneM, 0.1, 0.95, 0.14, 0, 0.75, -0.72);
  mn.rotation.x = -0.55;
  box(head, maneM, 0.1, 0.12, 0.18, 0, 0.22, -0.05); // forelock
  const tail = box(body, maneM, 0.12, 0.75, 0.12, 0, -0.15, 1.0);
  tail.rotation.x = -0.35;
  // saddle + blanket
  box(body, mat(0x1971c2), 0.9, 0.06, 0.75, 0, 0.53, -0.05);
  box(body, mat(0x8b4513), 0.62, 0.14, 0.58, 0, 0.6, -0.05);
  box(body, mat(0x8b4513), 0.1, 0.22, 0.1, 0, 0.72, -0.32); // horn
  return { group, body, legs, head, saddleY: 1.15 + 0.68 };
}

/** A rider / clown from the shared folk builder, with a hat in a group (so it can be waved). */
function buildRider(o: { shirt: number; pants: number; hair: number; longHair?: boolean; hat: number; rng: () => number }) {
  const folk = buildFolk({ shirt: o.shirt, pants: o.pants, skin: pick(o.rng, SKINS), hair: o.hair, longHair: o.longHair });
  const hat = cowboyHat(o.hat, 1.05);
  hat.position.y = 0.22;
  folk.head.add(hat);
  // a red neckerchief and boots
  box(folk.body, mat(0xe03131), 0.5, 0.12, 0.45, 0, 1.58, 0);
  for (const leg of [folk.legL, folk.legR]) box(leg, mat(0x5c3d2e), 0.28, 0.24, 0.32, 0, -0.3, -0.04);
  return { folk, hat };
}

/* ------------------------------------------------------------------ music (Oh! Susanna, public domain) */

type Ev = { t: number; kind: 'fiddle' | 'banjo' | 'bass' | 'chick'; f: number; d: number };
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (n: string) => {
  const m = /^([A-G])(\d)$/.exec(n);
  return m ? 440 * 2 ** ((NOTE[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12) : 0;
};
const TUNE =
  'E4 G4 G4:0.75 A4:0.25 G4 E4 C4:0.75 D4:0.25 E4 E4 D4 C4 D4:3 C4:0.5 D4:0.5 ' +
  'E4 G4 G4:0.75 A4:0.25 G4 E4 C4:0.75 D4:0.25 E4 E4 D4 D4 C4:3 C4:0.5 D4:0.5 ' +
  'F4:2 F4:2 A4 A4:2 A4 G4 G4 E4 C4 D4:3 C4:0.5 D4:0.5 ' +
  'E4 G4 G4:0.75 A4:0.25 G4 E4 C4:0.75 D4:0.25 E4 E4 D4 D4 C4:3 r:1';
const BARS = 'C C C G C C G C F F C G C C G C';
const BPM = 132;
let song: { events: Ev[]; length: number } | null = null;
function buildSong(): { events: Ev[]; length: number } {
  const spb = 60 / BPM;
  const ev: Ev[] = [];
  let beat = 0;
  for (const tok of TUNE.trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    const beats = d ? Number(d) : 1;
    if (n !== 'r') ev.push({ t: beat * spb, kind: 'fiddle', f: hz(n), d: beats * spb * 0.95 });
    beat += beats;
  }
  const bars = BARS.split(' ');
  bars.forEach((c, i) => {
    const root = hz(`${c}3`) / 2;
    const t0 = i * 4 * spb;
    for (let q = 0; q < 4; q++) {
      // boom-chick bass (root / fifth on the beat, a short chord on the off-beat)
      ev.push({ t: t0 + q * spb, kind: 'bass', f: q % 2 ? root * 1.5 : root, d: spb * 0.6 });
      ev.push({ t: t0 + (q + 0.5) * spb, kind: 'chick', f: root * 4, d: 0.12 });
      // banjo roll: chord tones in eighth notes
      for (let e = 0; e < 2; e++) {
        const st = [0, 4, 7, 12][(q * 2 + e) % 4];
        ev.push({ t: t0 + (q + e * 0.5) * spb, kind: 'banjo', f: root * 4 * 2 ** (st / 12), d: 0.18 });
      }
    }
  });
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, length: bars.length * 4 * spb };
}

/* ------------------------------------------------------------------ the rodeo */

interface Fan {
  x: number;
  y: number; // seat height
  z: number;
  yaw: number;
  s: number;
  ph: number;
  style: number; // 0 clap · 1 wave the hat · 2 arms up
}

interface Side {
  side: -1 | 1;
  group: THREE.Group;
  fans: Fan[];
  torsos: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  brims: THREE.InstancedMesh;
  crowns: THREE.InstancedMesh;
  arms: THREE.InstancedMesh;
  thighs: THREE.InstancedMesh;
  shins: THREE.InstancedMesh;
  free: { x: number; y: number; z: number }[]; // empty seats (local)
}

type Mood = 'idle' | 'clap' | 'cheer';

export class Rodeo {
  readonly booth: Interactable | null = null;
  readonly interior: Obstacle | null = null;
  /** Tap a stand (or Enter at its foot) = sit (main.ts SwingSeat). */
  readonly seats: Interactable[] = [];

  private readonly root = new THREE.Group();
  private plot: Plot | null = null;
  private gate: TicketGate | null = null;
  private readonly center = new THREE.Vector3();
  private sides: Side[] = [];
  private seated: { side: Side; seat: { x: number; y: number; z: number } } | null = null;

  // actors
  private horse1!: Horse;
  private horse2!: Horse;
  private rider1!: ReturnType<typeof buildRider>;
  private rider2!: ReturnType<typeof buildRider>;
  private clown!: Folk;
  private barrel = new THREE.Group();
  private barrelBody = new THREE.Group();
  private lasso = new THREE.Group();
  private confetti: THREE.InstancedMesh | null = null;
  private confettiV: THREE.Vector3[] = [];
  private confettiP: THREE.Vector3[] = [];
  private confettiT = -1;

  // clock
  private debugOffset = 0;
  private onDebugTime: ((e: Event) => void) | null = null;
  private c = 0;
  private lastC = -1;
  private cue = '';
  private mood: Mood = 'idle';

  // sound
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicT0 = -1;
  private loopN = 0;
  private evIdx = 0;
  private vol = 0;
  private lastVol = -1;
  private lastCut = -1;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    avoid: THREE.Vector3[] = [],
  ) {
    const plot = findPlot(HW, BACK, obstacles, rng, avoid);
    if (!plot) return;
    this.plot = plot;
    this.root.position.set(plot.x, 0, plot.z);
    this.root.rotation.y = plot.rot;
    scene.add(this.root);
    const c = toWorld(plot.x, plot.z, plot.rot, 0, BACK / 2);
    this.center.set(c.x, 0, c.z);

    // wooden fence all round (same gate gap and booth as the other venues)
    buildFence(this.root, plot, HW, BACK, obstacles, [0x8b5a2b, 0xa0522d, 0x7a4a24]);
    this.buildGrounds();
    this.buildArena();
    for (const s of [-1, 1] as const) this.buildStand(s, rng);
    this.buildActors(rng);
    this.gate = new TicketGate(this.root, scene, ctx, plot, obstacles, rng, {
      price: RODEO_PRICE,
      hw: HW,
      back: BACK,
      boothColor: 0xb5651d,
      roofColor: 0xc92a2a,
      greeting: 'Bem-vindos ao rodeio!',
    });
    this.booth = this.gate.booth;

    const W = (x0: number, x1: number, z0: number, z1: number, h?: number) => obstacles.push(worldBox(plot, x0, x1, z0, z1, h));
    W(-AR.rx - 0.15, AR.rx + 0.15, AR.cz - AR.rz - 0.15, AR.cz + AR.rz + 0.15, 1.4); // the arena (low: the camera sees over it)
    for (const s of [-1, 1]) {
      const x0 = ST.x0 - 0.05;
      const x1 = ST.x0 + ST.tiers * ST.d + 0.1;
      W(s < 0 ? -x1 : x0, s < 0 ? -x0 : x1, ST.z0 - 0.6, ST.z0 + (ST.n - 1) * ST.pitch + 0.9, 2.2);
    }
    this.interior = worldBox(plot, -HW, HW, BACK, 0.2);

    if (location.search.includes('debug')) {
      // QA: jump the show to detail = seconds in the cycle
      this.onDebugTime = (e: Event) => {
        const want = Number((e as CustomEvent).detail);
        if (!Number.isFinite(want)) return;
        this.debugOffset += (((want % CYCLE) + CYCLE) % CYCLE) - this.cycle();
      };
      window.addEventListener('rainbow-rodeo-time', this.onDebugTime);
    }
  }

  /* ------------------------------------------------------------ building */

  private buildGrounds(): void {
    const g = this.root;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -BACK), mat(0xd9c49a));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.02, BACK / 2);
    floor.receiveShadow = true;
    g.add(floor);
    // tall wooden arch over the gate with a golden horseshoe and a star
    const wood = mat(0x7a4a24);
    for (const s of [-1, 1]) box(g, wood, 0.32, 5.0, 0.32, s * (GATE_HW + 0.25), 2.5, 0.05);
    box(g, wood, GATE_HW * 2 + 1.4, 0.7, 0.25, 0, 4.7, 0.05);
    const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 18, Math.PI * 1.5), mat(0xfcc419, 0.35));
    shoe.position.set(-0.9, 5.55, 0.08);
    shoe.rotation.z = -Math.PI * 0.25 + Math.PI;
    g.add(shoe);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), mat(0xfcc419, 0.4));
    star.position.set(0.9, 5.55, 0.08);
    star.scale.z = 0.3;
    g.add(star);
    // the country's flag on two poles at the back corners
    const tex = flagTexture('Estados Unidos');
    for (const s of [-1, 1]) {
      cyl(g, mat(0xdee2e6), 0.07, 7, s * (HW - 0.8), 3.5, BACK + 0.8);
      if (tex) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
        f.position.set(s * (HW - 0.8) - s * 0.95, 6.3, BACK + 0.8);
        g.add(f);
      }
    }
  }

  private buildArena(): void {
    const g = this.root;
    const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(0xc9a066));
    sand.rotation.x = -Math.PI / 2;
    sand.scale.set(AR.rx, AR.rz, 1);
    sand.position.set(0, 0.04, AR.cz);
    sand.receiveShadow = true;
    g.add(sand);
    // wooden fence: posts + two rails (instanced: 2 draw calls)
    const N = 44;
    const wood = new THREE.MeshStandardMaterial({ color: 0x9c6b3c, roughness: 0.8 });
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.4, 0.16), wood, N);
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.08), wood, N * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pt = (k: number) => new THREE.Vector3(AR.rx * Math.cos((k / N) * Math.PI * 2), 0, AR.cz + AR.rz * Math.sin((k / N) * Math.PI * 2));
    for (let k = 0; k < N; k++) {
      const a = pt(k);
      const b = pt(k + 1);
      m.makeTranslation(a.x, 0.7, a.z);
      posts.setMatrixAt(k, m);
      const len = a.distanceTo(b);
      q.setFromAxisAngle(up, -Math.atan2(b.z - a.z, b.x - a.x));
      for (let r = 0; r < 2; r++) {
        m.compose(new THREE.Vector3((a.x + b.x) / 2, r ? 1.25 : 0.7, (a.z + b.z) / 2), q, new THREE.Vector3(len + 0.05, 1, 1));
        rails.setMatrixAt(k * 2 + r, m);
      }
    }
    for (const im of [posts, rails]) {
      im.castShadow = true;
      g.add(im);
    }
    // the lasso post in the middle (with a star on top)
    cyl(g, mat(0x7a4a24), 0.14, 1.6, 0, 0.8, AR.cz);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(0xfcc419, 0.4));
    star.position.set(0, 1.75, AR.cz);
    g.add(star);
    // hay bales by the first horse's corner (the soft landing)
    const hay = mat(0xe9c46a);
    const strap = mat(0xb08d3c);
    for (const [x, z, y] of [[HAY.x, HAY.z, 0.3], [HAY.x + 1.05, HAY.z + 0.1, 0.3], [HAY.x + 0.5, HAY.z, 0.9]] as const) {
      box(g, hay, 1.0, 0.6, 0.7, x, y, AR.cz + z);
      box(g, strap, 0.06, 0.62, 0.72, x - 0.25, y, AR.cz + z);
      box(g, strap, 0.06, 0.62, 0.72, x + 0.25, y, AR.cz + z);
    }
  }

  /** One wooden grandstand (side −1 = left, +1 = right), spectators facing the arena. */
  private buildStand(side: -1 | 1, rng: () => number): void {
    const g = new THREE.Group();
    this.root.add(g);
    const wood = mat(0xa9744f);
    const plank = mat(0xd9a066);
    const len = (ST.n - 1) * ST.pitch + 1.2;
    const zc = ST.z0 + ((ST.n - 1) * ST.pitch) / 2;
    const X = (x: number) => side * x;
    for (let i = 0; i < ST.tiers; i++) {
      const fx = ST.x0 + i * ST.d; // front edge of this tier
      const floor = i * ST.step;
      if (floor > 0) box(g, wood, ST.d, floor, len, X(fx + ST.d / 2), floor / 2, zc);
      box(g, plank, ST.d * 0.45, 0.45, len, X(fx + ST.d * 0.75), floor + 0.225, zc); // the bench
    }
    // back rail with red-white-blue bunting
    const top = (ST.tiers - 1) * ST.step + 0.45;
    const bx = ST.x0 + ST.tiers * ST.d + 0.02;
    for (const z of [zc - len / 2, zc, zc + len / 2]) box(g, wood, 0.12, top + 1.6, 0.12, X(bx), (top + 1.6) / 2, z);
    box(g, wood, 0.1, 0.1, len, X(bx), top + 0.95, zc);
    box(g, wood, 0.1, 0.1, len, X(bx), top + 1.6, zc);
    const flags = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.34, 3), new THREE.MeshStandardMaterial({ color: 0xffffff }), 22);
    const col = new THREE.Color();
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 22; k++) {
      m4.compose(new THREE.Vector3(X(bx), top + 1.4, zc - len / 2 + 0.3 + (k * (len - 0.6)) / 21), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), new THREE.Vector3(1, 1, 1));
      flags.setMatrixAt(k, m4);
      flags.setColorAt(k, col.setHex([0xe03131, 0xffffff, 0x1c4fbf][k % 3]));
    }
    g.add(flags);
    // steps up at the front end
    for (let i = 1; i < ST.tiers; i++) box(g, wood, ST.d * 0.9, i * ST.step, 0.5, X(ST.x0 + (i - 0.5) * ST.d), (i * ST.step) / 2, zc + len / 2 + 0.25);

    // seats: (tier, k) — spectators take a random part, the rest stay free for her
    const all: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < ST.tiers; i++) for (let k = 0; k < ST.n; k++) all.push({ x: X(ST.x0 + i * ST.d + ST.d * 0.75), y: i * ST.step + 0.45, z: ST.z0 + k * ST.pitch });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const taken = all.slice(0, SPECTATORS_PER_SIDE);
    const free = all.slice(SPECTATORS_PER_SIDE);
    const yaw = side < 0 ? -Math.PI / 2 : Math.PI / 2; // facing the arena
    const fans: Fan[] = taken.map((s) => {
      const kid = rng() < 0.35;
      return { x: s.x, y: s.y, z: s.z + (rng() - 0.5) * 0.12, yaw: yaw + (rng() - 0.5) * 0.4, s: kid ? 0.62 + rng() * 0.1 : 0.82 + rng() * 0.1, ph: rng() * Math.PI * 2, style: Math.floor(rng() * 3) };
    });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const n = fans.length;
    const mk = (geo: THREE.BufferGeometry, count: number) => {
      const im = new THREE.InstancedMesh(geo, white, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      g.add(im);
      return im;
    };
    const sd: Side = {
      side,
      group: g,
      fans,
      free,
      torsos: mk(new THREE.CapsuleGeometry(0.32, 0.45, 4, 10), n),
      heads: mk(new THREE.SphereGeometry(0.28, 12, 10), n),
      brims: mk(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 14), n),
      crowns: mk(new THREE.CylinderGeometry(0.2, 0.25, 0.28, 12), n),
      arms: mk(new THREE.CapsuleGeometry(0.085, 0.45, 4, 8), n * 2),
      thighs: mk(new THREE.CapsuleGeometry(0.11, 0.32, 4, 8), n * 2),
      shins: mk(new THREE.CapsuleGeometry(0.1, 0.25, 4, 8), n * 2),
    };
    fans.forEach((_, i) => {
      const shirt = pick(rng, [...SHIRTS, 0xc92a2a, 0x1c7ed6]);
      sd.torsos.setColorAt(i, col.setHex(shirt));
      sd.arms.setColorAt(i * 2, col);
      sd.arms.setColorAt(i * 2 + 1, col);
      const pants = pick(rng, [...PANTS, 0x364fc7, 0x364fc7]);
      for (const k of [i * 2, i * 2 + 1]) {
        sd.thighs.setColorAt(k, col.setHex(pants));
        sd.shins.setColorAt(k, col);
      }
      sd.heads.setColorAt(i, col.setHex(pick(rng, SKINS)));
      const hat = pick(rng, HAT_COLORS);
      sd.brims.setColorAt(i, col.setHex(hat));
      sd.crowns.setColorAt(i, col);
    });
    this.sides.push(sd);
    this.poseSide(sd, 0, 'idle');

    // the interactable: tap the stand (from anywhere inside) or Enter at its foot / beside it
    const foot = this.w(X(ST.x0 - 1.3), zc);
    const seatApi: SwingSeat = {
      take: (p) => {
        const lp = this.root.worldToLocal(p.clone());
        let best = 0;
        let bd = Infinity;
        sd.free.forEach((s, k) => {
          const d = Math.abs(s.z - lp.z) - s.y * 6; // the top row first (nobody in front of the camera), then the nearest
          if (d < bd) {
            bd = d;
            best = k;
          }
        });
        const seat = sd.free.splice(best, 1)[0];
        this.seated = { side: sd, seat };
        feel('rest');
        // the camera behind and above her, looking at the arena (drag / ←→ turn it, like on a tower top)
        const from = this.root.localToWorld(new THREE.Vector3(seat.x + side * 2.6, 0, seat.z));
        const look = this.root.localToWorld(new THREE.Vector3(0, 0, AR.cz));
        window.dispatchEvent(new CustomEvent('rainbow-aerial', { detail: { x: look.x, z: look.z, h: seat.y + 3.4, fromX: from.x, fromZ: from.z, lookY: 0.8, turn: true } }));
        return 0;
      },
      pose: () => {
        const s = this.seated?.seat ?? sd.free[0];
        return { pos: this.root.localToWorld(new THREE.Vector3(s.x, s.y, s.z)), heading: this.plot!.rot + yaw, tilt: 0 };
      },
      leave: () => {
        if (this.seated) {
          sd.free.push(this.seated.seat);
          window.dispatchEvent(new CustomEvent('rainbow-aerial', { detail: null }));
        }
        this.seated = null;
      },
      getOff: () => {
        const s = this.seated?.seat;
        return this.w(X(ST.x0 - 1.3), s ? s.z : zc);
      },
    };
    this.seats.push({
      object: g,
      position: foot,
      radius: 3.2,
      reach: 26,
      requiresClick: true,
      seat: seatApi,
      // only with a ticket (inside the fence) and while there is a free seat
      interact: () => !this.ctx.isDriving() && this.isInside() && !this.seated && sd.free.length > 0,
    });
  }

  private w(x: number, z: number): THREE.Vector3 {
    const p = toWorld(this.plot!.x, this.plot!.z, this.plot!.rot, x, z);
    return new THREE.Vector3(p.x, 0, p.z);
  }

  private buildActors(rng: () => number): void {
    const g = this.root;
    this.horse1 = buildHorse(0x8b5a2b, 0x2b1d14);
    this.horse2 = buildHorse(0xf1f3f5, 0x868e96, 0x495057);
    g.add(this.horse1.group, this.horse2.group);
    this.rider1 = buildRider({ shirt: 0xf06595, pants: 0x364fc7, hair: 0xb5651d, longHair: true, hat: 0xffffff, rng });
    this.rider2 = buildRider({ shirt: 0x1c7ed6, pants: 0x5c3d2e, hair: 0x2b1d14, hat: 0x5c3d2e, rng });
    for (const r of [this.rider1, this.rider2]) {
      r.folk.group.scale.setScalar(0.85);
      g.add(r.folk.group);
    }
    // lasso: a rope loop (spins over his head, then flies to the post)
    const rope = mat(0xe0c08a);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 28), rope);
    loop.rotation.x = Math.PI / 2;
    this.lasso.add(loop);
    g.add(this.lasso);
    // the clown: yellow shirt, red trousers, orange hair, red nose, big shoes and a tiny hat
    this.clown = buildFolk({ shirt: 0xffd43b, pants: 0xe03131, skin: pick(rng, SKINS), hair: 0xff922b });
    ball(this.clown.head, mat(0xff2d2d, 0.2), 0.08, 0, -0.02, -0.3);
    for (const [x, y, c] of [[0.15, 1.35, 0x4dabf7], [-0.12, 1.1, 0x51cf66], [0.05, 0.95, 0xcc5de8]] as const) ball(this.clown.body, mat(c), 0.08, x, y, -0.32);
    for (const leg of [this.clown.legL, this.clown.legR]) box(leg, mat(0x4dabf7), 0.3, 0.16, 0.6, 0, -0.38, -0.15);
    const tiny = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 12), mat(0x7048e8));
    tiny.position.set(0.1, 0.4, 0);
    tiny.rotation.z = -0.3;
    this.clown.head.add(tiny);
    this.clown.group.scale.setScalar(0.85);
    g.add(this.clown.group);
    // barrel: lies down to roll (barrelBody), stands up to hide in
    const wood = mat(0xa0522d);
    const ring = mat(0x495057);
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16, 1, true), wood);
    bm.castShadow = true;
    this.barrelBody.add(bm);
    for (const y of [-0.42, 0.42]) cyl(this.barrelBody, ring, 0.52, 0.07, 0, y, 0);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), wood);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -0.54;
    this.barrelBody.add(bottom);
    this.barrel.add(this.barrelBody);
    g.add(this.barrel);
    // confetti burst (one instanced mesh)
    const cn = 40;
    this.confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.02, 0.09), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 }), cn);
    const col = new THREE.Color();
    for (let i = 0; i < cn; i++) {
      this.confetti.setColorAt(i, col.setHex([0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7, 0xcc5de8, 0xff922b][i % 6]));
      this.confettiV.push(new THREE.Vector3());
      this.confettiP.push(new THREE.Vector3());
    }
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    g.add(this.confetti);
  }

  /* ------------------------------------------------------------ the show */

  /** True while she is inside the venue (no idle pause while she watches). */
  isInside(): boolean {
    return this.gate?.inside ?? false;
  }

  private cycle(extra = this.debugOffset): number {
    const t = Date.now() / 1000 + extra;
    return ((t % CYCLE) + CYCLE) % CYCLE;
  }

  /** Place a horse (arena-centre relative x/z), with yaw, hop, pitch and a leg phase (amp 0 = standing). */
  private placeHorse(h: Horse, x: number, z: number, yaw: number, y: number, pitch: number, legPh: number, amp: number, nod = 0): void {
    h.group.position.set(x, y, AR.cz + z);
    h.group.rotation.y = yaw;
    h.body.rotation.x = pitch;
    const off = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
    h.legs.forEach((l, i) => (l.rotation.x = Math.sin(legPh + off[i]) * amp));
    h.head.rotation.x = nod;
  }

  /** Sit a rider on a horse's saddle (follows the horse's yaw / pitch / hop). */
  private mount(r: ReturnType<typeof buildRider>, h: Horse, extraY = 0): void {
    h.group.updateMatrixWorld(true);
    const p = h.body.localToWorld(new THREE.Vector3(0, 0.66, -0.05));
    this.root.worldToLocal(p);
    const f = r.folk;
    f.group.position.set(p.x, p.y - 0.8 * 0.85 + extraY, p.z);
    f.group.rotation.set(h.body.rotation.x, h.group.rotation.y, 0, 'YXZ');
    // straddling legs
    f.legL.position.set(-0.3, 0.5, 0);
    f.legR.position.set(0.3, 0.5, 0);
    f.legL.rotation.set(0.3, 0, -0.6);
    f.legR.rotation.set(0.3, 0, 0.6);
  }

  /** Back on her / his feet (legs straight). */
  private stand(r: ReturnType<typeof buildRider>, x: number, y: number, z: number, yaw: number): void {
    const f = r.folk;
    f.group.position.set(x, y, AR.cz + z);
    f.group.rotation.set(0, yaw, 0, 'YXZ');
    f.legL.position.set(-0.15, 0.4, 0);
    f.legR.position.set(0.15, 0.4, 0);
    f.legL.rotation.set(0, 0, 0);
    f.legR.rotation.set(0, 0, 0);
  }

  /** Arms: 'down', 'wave' (right arm up, hat in hand), 'reins', 'laugh', 'spin' (lasso over the head). */
  private arms(r: ReturnType<typeof buildRider> | { folk: Folk; hat: null }, pose: string, t: number): void {
    const f = r.folk;
    f.armL.rotation.set(0, 0, -0.1);
    f.armR.rotation.set(0, 0, 0.1);
    f.body.rotation.set(0, 0, 0);
    const hat = r.hat;
    const hatOnHead = () => {
      if (hat && hat.parent !== f.head) {
        f.head.add(hat);
        hat.position.set(0, 0.22, 0);
        hat.rotation.set(0, 0, 0);
      }
    };
    if (pose === 'reins') {
      f.armL.rotation.set(-0.9, 0, -0.15);
      f.armR.rotation.set(-0.9, 0, 0.15);
      hatOnHead();
    } else if (pose === 'wave') {
      f.armL.rotation.set(-0.6, 0, -0.2);
      f.armR.rotation.set(0, 0, 2.7 + Math.sin(t * 9) * 0.35);
      if (hat && hat.parent !== f.armR) {
        f.armR.add(hat);
        hat.position.set(0, -0.75, 0);
        hat.rotation.set(Math.PI, 0, 0);
      }
    } else if (pose === 'laugh') {
      f.armL.rotation.set(-1.0, 0, -0.5);
      f.armR.rotation.set(-1.0, 0, 0.5);
      f.body.rotation.x = 0.15 + Math.sin(t * 22) * 0.06;
      hatOnHead();
    } else if (pose === 'spin') {
      f.armL.rotation.set(-0.9, 0, -0.15);
      f.armR.rotation.set(0, 0, 2.9);
      hatOnHead();
    } else if (pose === 'cheer') {
      f.armL.rotation.set(0, 0, -2.6 + Math.sin(t * 8) * 0.3);
      f.armR.rotation.set(0, 0, 2.6 - Math.sin(t * 8) * 0.3);
      hatOnHead();
    } else hatOnHead();
  }

  private actors(c: number, now: number): void {
    const H1 = this.horse1;
    const H2 = this.horse2;
    const R1 = this.rider1;
    const R2 = this.rider2;

    /* ---- act 1: the bucking horse ---- */
    const t1 = c - ACT1;
    const th1 = Math.atan2(HOME1.z / PATH.b, HOME1.x / PATH.a);
    const start1 = onPath(th1);
    const restYaw1 = yawTo(-PATH.a * Math.sin(th1), PATH.b * Math.cos(th1)); // parallel to the riders' oval
    const out1 = yawTo(start1.x - HOME1.x, start1.z - HOME1.z);
    const in1 = yawTo(HOME1.x - start1.x, HOME1.z - start1.z);
    let riderOn1 = true;
    if (t1 >= 0 && t1 < 22) {
      if (t1 < 1.5) {
        const k = smooth(t1 / 1.5);
        const x = lerp(HOME1.x, start1.x, k);
        const z = lerp(HOME1.z, start1.z, k);
        const yaw = k < 0.5 ? angLerp(restYaw1, out1, k * 2) : angLerp(out1, restYaw1, (k - 0.5) * 2);
        this.placeHorse(H1, x, z, yaw, 0, 0, t1 * 9, 0.4);
        this.mount(R1, H1);
        this.arms(R1, 'reins', now);
      } else if (t1 < 14) {
        // gentle bucks while going round once (anticlockwise)
        const u = (t1 - 1.5) / 12.5;
        const th = th1 + u * Math.PI * 2;
        const p = onPath(th);
        const dir = { x: -PATH.a * Math.sin(th), z: PATH.b * Math.cos(th) };
        const ph = (t1 - 1.5) * Math.PI * 2 * 1.3;
        const hop = Math.max(0, Math.sin(ph)) * 0.32;
        const pitch = Math.sin(ph) * 0.26;
        this.placeHorse(H1, p.x, p.z, yawTo(dir.x, dir.z), hop, pitch, ph, 0.5, Math.sin(ph) * 0.2);
        this.mount(R1, H1, Math.max(0, Math.sin(ph - 0.7)) * 0.1);
        this.arms(R1, 'wave', now);
      } else {
        // the horse stops and walks back home; she hops onto the hay, laughs, waves, and climbs back on
        const back = clamp01((t1 - 15.5) / 1.6);
        const k = smooth(back);
        const x = lerp(start1.x, HOME1.x, k);
        const z = lerp(start1.z, HOME1.z, k);
        const walking = back > 0 && back < 1;
        let yaw = restYaw1; // the lap ends where it started, along the oval
        if (t1 >= 15.5) yaw = angLerp(restYaw1, in1, clamp01((t1 - 15.5) * 3));
        if (t1 >= 17.1) yaw = angLerp(in1, restYaw1, clamp01((t1 - 17.1) * 2));
        this.placeHorse(H1, x, z, yaw, 0, 0, t1 * 8, walking ? 0.4 : 0, Math.sin(now * 2) * 0.08);
        riderOn1 = false;
        const hay = { x: HAY.x + 0.5, z: HAY.z + 0.2 }; // on the front of the bottom bales
        if (t1 < 15.5) {
          // slide from the saddle onto the hay in a soft arc
          const k2 = smooth((t1 - 14) / 1.5);
          H1.group.updateMatrixWorld(true);
          const sp = this.root.worldToLocal(H1.body.localToWorld(new THREE.Vector3(0, 0.66, -0.05)));
          const x2 = lerp(sp.x, hay.x, k2);
          const z2 = lerp(sp.z - AR.cz, hay.z, k2);
          const y2 = lerp(sp.y - 0.68, 0.05, k2) + Math.sin(k2 * Math.PI) * 0.9;
          this.stand(R1, x2, y2, z2, angLerp(H1.group.rotation.y, yawTo(-hay.x, -hay.z), k2));
          this.arms(R1, 'cheer', now);
        } else if (t1 < 19) {
          this.stand(R1, hay.x, 0.05, hay.z, yawTo(-hay.x, -hay.z));
          // sitting on the bale: legs forward over its edge
          R1.folk.legL.rotation.set(1.4, 0, 0);
          R1.folk.legR.rotation.set(1.4, 0, 0);
          R1.folk.legL.position.set(-0.15, 0.62, -0.3);
          R1.folk.legR.position.set(0.15, 0.62, -0.3);
          this.arms(R1, 'laugh', now);
        } else if (t1 < 20.5) {
          this.stand(R1, hay.x, 0, hay.z + 0.6, yawTo(-hay.x, -hay.z));
          this.arms(R1, 'wave', now);
        } else {
          // a hop back into the saddle
          const k3 = smooth((t1 - 20.5) / 1.3);
          H1.group.updateMatrixWorld(true);
          const sp = this.root.worldToLocal(H1.body.localToWorld(new THREE.Vector3(0, 0.66, -0.05)));
          if (k3 >= 1) riderOn1 = true;
          else {
            const x3 = lerp(hay.x, sp.x, k3);
            const z3 = lerp(hay.z + 0.6, sp.z - AR.cz, k3);
            const y3 = lerp(0, sp.y - 0.68, k3) + Math.sin(k3 * Math.PI) * 0.8;
            this.stand(R1, x3, y3, z3, angLerp(yawTo(-hay.x, -hay.z), H1.group.rotation.y, k3));
            this.arms(R1, 'reins', now);
          }
        }
      }
    } else {
      this.placeHorse(H1, HOME1.x, HOME1.z, restYaw1, 0, 0, 0, 0, Math.sin(now * 1.3) * 0.06);
    }
    if (riderOn1) {
      this.mount(R1, H1);
      const fin = c >= FINALE;
      this.arms(R1, fin ? 'wave' : t1 >= 0 && t1 < 14 ? (t1 < 1.5 ? 'reins' : 'wave') : 'reins', now);
    }

    /* ---- act 2: the lasso ---- */
    const t2 = c - ACT2;
    const th2 = Math.atan2(HOME2.z / PATH.b, HOME2.x / PATH.a);
    const start2 = onPath(th2);
    const restYaw2 = yawTo(PATH.a * Math.sin(th2), -PATH.b * Math.cos(th2)); // parallel to the oval (clockwise)
    const out2 = yawTo(start2.x - HOME2.x, start2.z - HOME2.z);
    let lassoMode: 'none' | 'spin' | 'fly' | 'post' | 'back' = 'none';
    let lassoK = 0;
    if (t2 >= 0 && t2 < 22) {
      if (t2 < 1.5) {
        const k = smooth(t2 / 1.5);
        const yaw = k < 0.5 ? angLerp(restYaw2, out2, k * 2) : angLerp(out2, restYaw2, (k - 0.5) * 2);
        this.placeHorse(H2, lerp(HOME2.x, start2.x, k), lerp(HOME2.z, start2.z, k), yaw, 0, 0, t2 * 9, 0.4);
        this.mount(R2, H2);
        this.arms(R2, 'reins', now);
      } else if (t2 < 13.5) {
        // canter round twice (clockwise), the lasso spinning over his head
        const u = (t2 - 1.5) / 12;
        const th = th2 - u * Math.PI * 4;
        const p = onPath(th);
        const dir = { x: PATH.a * Math.sin(th), z: -PATH.b * Math.cos(th) };
        const ph = t2 * 11;
        this.placeHorse(H2, p.x, p.z, yawTo(dir.x, dir.z), Math.abs(Math.sin(ph / 2)) * 0.12, Math.sin(ph) * 0.06, ph, 0.7);
        this.mount(R2, H2, Math.abs(Math.sin(ph / 2)) * 0.06);
        this.arms(R2, 'spin', now);
        lassoMode = 'spin';
      } else {
        // stop, face the post, throw; wave; pull it back; walk home
        const end = onPath(th2 - Math.PI * 4);
        const toPost = yawTo(-end.x, -end.z);
        const back = clamp01((t2 - 19.5) / 1.5);
        const x = lerp(end.x, HOME2.x, smooth(back));
        const z = lerp(end.z, HOME2.z, smooth(back));
        const yaw = back > 0 ? angLerp(toPost, restYaw2, smooth(back)) : angLerp(H2.group.rotation.y, toPost, Math.min(1, (t2 - 13.5) * 3));
        this.placeHorse(H2, x, z, yaw, 0, 0, t2 * 8, back > 0 && back < 1 ? 0.4 : 0);
        this.mount(R2, H2);
        if (t2 < 15) {
          lassoMode = 'fly';
          lassoK = (t2 - 13.5) / 1.5;
          this.arms(R2, 'spin', now);
        } else if (t2 < 18) {
          lassoMode = 'post';
          lassoK = clamp01((t2 - 15) / 0.6);
          this.arms(R2, t2 > 15.6 ? 'wave' : 'reins', now);
        } else if (t2 < 19.5) {
          lassoMode = 'back';
          lassoK = (t2 - 18) / 1.5;
          this.arms(R2, 'reins', now);
        } else this.arms(R2, 'reins', now);
      }
    } else {
      this.placeHorse(H2, HOME2.x, HOME2.z, restYaw2, 0, 0, 0, 0, Math.sin(now * 1.1 + 1) * 0.06);
      this.mount(R2, H2);
      this.arms(R2, c >= FINALE ? 'wave' : 'reins', now);
    }
    // the lasso
    R2.folk.group.updateMatrixWorld(true);
    const hand = this.root.worldToLocal(R2.folk.head.localToWorld(new THREE.Vector3(0, 0.9, 0)));
    const postTop = new THREE.Vector3(0, 1.75, AR.cz);
    const postRing = new THREE.Vector3(0, 0.9, AR.cz);
    this.lasso.visible = lassoMode !== 'none';
    this.lasso.rotation.set(0, 0, 0);
    this.lasso.scale.setScalar(1);
    if (lassoMode === 'spin') {
      this.lasso.position.copy(hand);
      this.lasso.rotation.y = now * 9;
      this.lasso.rotation.z = Math.sin(now * 9) * 0.15;
    } else if (lassoMode === 'fly' || lassoMode === 'back') {
      const k = smooth(lassoMode === 'fly' ? lassoK : 1 - lassoK);
      this.lasso.position.lerpVectors(hand, postTop, k);
      this.lasso.position.y += Math.sin(k * Math.PI) * 1.4;
      this.lasso.rotation.y = now * 7;
      this.lasso.scale.setScalar(lerp(1, 0.55, k));
    } else if (lassoMode === 'post') {
      this.lasso.position.lerpVectors(postTop, postRing, lassoK);
      this.lasso.scale.setScalar(lerp(0.55, 0.4, lassoK));
    }

    /* ---- act 3: the clown and the barrel ---- */
    const t3 = c - ACT3;
    const C = this.clown;
    const homeYaw = Math.PI; // facing the front (the plaza)
    const bHome = { x: CLOWN_HOME.x + 0.9, z: CLOWN_HOME.z };
    let bx = bHome.x;
    let lying = 0;
    let roll = 0;
    let wob = 0;
    let cx = CLOWN_HOME.x;
    let cz = CLOWN_HOME.z;
    let cy = 0;
    let cyaw = homeYaw;
    let cpose = 'down';
    let hidden = false;
    let walkPh = -1;
    if (t3 >= 0 && t3 < 20) {
      if (t3 < 1.5) {
        lying = smooth(t3 / 1.5); // tips the barrel over
        cpose = 'cheer';
      } else if (t3 < 10) {
        lying = 1;
        // roll it left, then right, then back home
        const legs: [number, number, number][] = [[1.5, 4.5, -2.6], [4.5, 8.5, 2.6], [8.5, 10, bHome.x]];
        let from = bHome.x;
        for (const [a, b, to] of legs) {
          if (t3 < b) {
            bx = lerp(from, to, smooth((t3 - a) / (b - a)));
            const dir = Math.sign(to - from);
            cx = bx - dir * 0.95;
            cyaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
            break;
          }
          from = to;
        }
        roll = -(bx - bHome.x) / 0.5;
        walkPh = t3 * 9;
        if (t3 > 9.5) lying = 1 - smooth((t3 - 9.5) / 0.5);
      } else if (t3 < 11) {
        // hop into the barrel
        const k = smooth(t3 - 10);
        cx = lerp(bHome.x - 0.95, bHome.x, k);
        cy = Math.sin(k * Math.PI) * 1.3 + lerp(0, 0.2, k);
        cyaw = homeYaw;
        cpose = 'cheer';
        hidden = k > 0.85;
      } else if (t3 < 13.5) {
        hidden = true;
        cx = bHome.x;
        wob = Math.sin(t3 * 18) * 0.12 * Math.min(1, (t3 - 11) * 2);
      } else if (t3 < 15) {
        // pop!
        const k = (t3 - 13.5) / 1.5;
        cx = bHome.x + k * -0.95;
        cy = Math.sin(Math.min(1, k) * Math.PI) * 1.8;
        cpose = 'cheer';
      } else if (t3 < 18) {
        cx = bHome.x - 0.95;
        cpose = 'wave';
      } else {
        const k = smooth((t3 - 18) / 2);
        cx = lerp(bHome.x - 0.95, CLOWN_HOME.x, k);
        walkPh = t3 * 8;
      }
    } else if (c >= FINALE) cpose = 'wave';
    if (!(t3 >= 0 && t3 < 20) && c < FINALE) cpose = 'down';
    // place the barrel
    this.barrel.position.set(bx, 0.55 - lying * 0.05, AR.cz + bHome.z);
    this.barrelBody.rotation.set(0, 0, 0);
    if (lying > 0) {
      this.barrel.rotation.set(lying * (Math.PI / 2), 0, 0);
      this.barrel.position.y = lerp(0.55, 0.5, lying);
      this.barrelBody.rotation.y = roll; // rolls about its own axis
    } else this.barrel.rotation.set(0, 0, wob);
    // place the clown
    C.group.visible = !hidden;
    C.group.position.set(cx, cy, AR.cz + cz);
    C.group.rotation.y = cyaw;
    const step = walkPh >= 0 ? Math.sin(walkPh) : 0;
    C.legL.rotation.x = step * 0.5;
    C.legR.rotation.x = -step * 0.5;
    this.arms({ folk: C, hat: null }, cpose, now);
    if (walkPh >= 0 && cpose === 'down') {
      C.armL.rotation.set(-1.2, 0, -0.2); // pushing the barrel
      C.armR.rotation.set(-1.2, 0, 0.2);
    }
    // confetti
    if (t3 >= 13.5 && t3 < 16.5) {
      if (this.confettiT < 0) {
        this.confettiT = 0;
        this.confettiP.forEach((p, i) => {
          p.set(bHome.x, 1.2, AR.cz + bHome.z);
          const a = (i / this.confettiP.length) * Math.PI * 2;
          this.confettiV[i].set(Math.cos(a) * (1 + (i % 3) * 0.6), 4 + (i % 5) * 0.6, Math.sin(a) * (1 + (i % 4) * 0.5));
        });
      }
    } else this.confettiT = -1;
  }

  private updateConfetti(dt: number): void {
    const m = this.confetti;
    if (!m) return;
    m.visible = this.confettiT >= 0;
    if (this.confettiT < 0) return;
    this.confettiT += dt;
    const mm = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    this.confettiP.forEach((p, i) => {
      const v = this.confettiV[i];
      v.y -= 6 * dt;
      v.multiplyScalar(1 - dt * 0.8);
      p.addScaledVector(v, dt);
      if (p.y < 0.05) {
        p.y = 0.05;
        v.set(0, 0, 0);
      }
      mm.compose(p, q.setFromEuler(e.set(this.confettiT * 7 + i, i, this.confettiT * 5)), one);
      m.setMatrixAt(i, mm);
    });
    m.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------ the crowd */

  private readonly mP = new THREE.Matrix4();
  private readonly mT = new THREE.Matrix4();
  private readonly mR = new THREE.Matrix4();
  private readonly mO = new THREE.Matrix4();
  private readonly qv = new THREE.Quaternion();
  private readonly ev = new THREE.Euler();
  private readonly vv = new THREE.Vector3();
  private readonly sv = new THREE.Vector3();
  private readonly armDown = new THREE.Matrix4().makeTranslation(0, -0.3, 0);

  private poseSide(sd: Side, t: number, mood: Mood): void {
    const { mP, mT, mR, mO, qv, ev, vv, sv } = this;
    sd.fans.forEach((f, i) => {
      const ph = t * (mood === 'idle' ? 1.2 : 7) + f.ph;
      const bounce = mood === 'cheer' ? Math.abs(Math.sin(ph)) * 0.1 : 0;
      const sway = mood === 'idle' ? Math.sin(ph) * 0.04 : 0;
      mP.compose(vv.set(f.x, f.y + bounce, f.z), qv.setFromEuler(ev.set(0, f.yaw, sway)), sv.setScalar(f.s));
      // seated legs: thighs forward, shins down to the step
      for (const s of [-1, 1]) {
        const k = i * 2 + (s > 0 ? 1 : 0);
        mR.makeRotationX(Math.PI / 2);
        sd.thighs.setMatrixAt(k, mO.multiplyMatrices(mP, mT.makeTranslation(s * 0.14, 0.1, -0.22)).multiply(mR));
        sd.shins.setMatrixAt(k, mO.multiplyMatrices(mP, mT.makeTranslation(s * 0.14, -0.2, -0.45)));
      }
      sd.torsos.setMatrixAt(i, mO.multiplyMatrices(mP, mT.makeTranslation(0, 0.5, 0)));
      sd.heads.setMatrixAt(i, mO.multiplyMatrices(mP, mT.makeTranslation(0, 1.08, 0)));
      let hatInHand = false;
      for (const s of [-1, 1]) {
        let ax = 0;
        let az = s * 0.12;
        if (mood === 'clap' || (mood === 'cheer' && f.style === 0)) {
          ax = 1.2;
          az = -s * (0.1 + Math.abs(Math.sin(ph * 1.5)) * 0.35);
        } else if (mood === 'cheer' && f.style === 1) {
          if (s > 0) {
            az = 2.6 + Math.sin(ph) * 0.4; // waving the hat
            hatInHand = true;
          } else az = -0.15;
        } else if (mood === 'cheer') {
          az = s * (2.5 + Math.sin(ph + s) * 0.3);
        } else {
          ax = 0.5; // hands on the knees
        }
        mR.makeRotationFromEuler(ev.set(ax, 0, az));
        const k = i * 2 + (s > 0 ? 1 : 0);
        mO.multiplyMatrices(mP, mT.makeTranslation(s * 0.38, 0.85, 0)).multiply(mR);
        if (s > 0 && hatInHand) {
          // the hat in the raised hand
          const hm = this.mO.clone().multiply(mT.makeTranslation(0, -0.66, 0)).multiply(mR.makeRotationX(Math.PI));
          sd.brims.setMatrixAt(i, hm);
          sd.crowns.setMatrixAt(i, hm.clone().multiply(mT.makeTranslation(0, 0.16, 0)));
        }
        sd.arms.setMatrixAt(k, mO.multiply(this.armDown));
      }
      if (!hatInHand) {
        sd.brims.setMatrixAt(i, mO.multiplyMatrices(mP, mT.makeTranslation(0, 1.3, 0)));
        sd.crowns.setMatrixAt(i, mO.multiplyMatrices(mP, mT.makeTranslation(0, 1.45, 0)));
      }
    });
    for (const m of [sd.torsos, sd.heads, sd.brims, sd.crowns, sd.arms, sd.thighs, sd.shins]) m.instanceMatrix.needsUpdate = true;
  }

  /** What the crowd is doing at cycle second c. */
  private crowdMood(c: number): Mood {
    const t1 = c - ACT1;
    const t2 = c - ACT2;
    const t3 = c - ACT3;
    if (c >= FINALE) return c - FINALE < 4 ? 'cheer' : 'clap';
    if (t1 >= 1.5 && t1 < 14) return 'cheer';
    if (t1 >= 14 && t1 < 21) return 'clap';
    if (t2 >= 1.5 && t2 < 13.5) return 'clap';
    if (t2 >= 15 && t2 < 18.5) return 'cheer';
    if (t3 >= 13.5 && t3 < 17) return 'cheer';
    if (t3 >= 1.5 && t3 < 10) return 'clap';
    return 'idle';
  }

  /* ------------------------------------------------------------ sound */

  private ensureAudio(): AudioContext | null {
    const ac = audioContext();
    if (!ac) return null;
    if (!this.bus) {
      this.filter = ac.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 800;
      this.bus = ac.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(this.filter).connect(ac.destination);
      const len = Math.floor(ac.sampleRate * 0.5);
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  private osc(ac: AudioContext, f: number, t: number, d: number, type: OscillatorType, gain: number, vib = 0): void {
    if (!this.bus) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (vib) {
      // fiddle vibrato
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = f * vib;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + d + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + (vib ? 0.04 : 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  private noise(ac: AudioContext, t: number, d: number, gain: number, type: BiquadFilterType, freq: number, attack = 0): void {
    if (!this.bus || !this.noiseBuf) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = d > 0.45;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(attack ? 0.0001 : gain, t);
    if (attack) g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.3);
    src.stop(t + d + 0.02);
  }

  private play(ac: AudioContext, e: Ev, at: number): void {
    switch (e.kind) {
      case 'fiddle':
        this.osc(ac, e.f * 2, at, e.d, 'sawtooth', 0.035, 0.012);
        this.osc(ac, e.f * 2, at, e.d, 'triangle', 0.06);
        break;
      case 'banjo':
        this.osc(ac, e.f, at, e.d, 'square', 0.018);
        this.osc(ac, e.f * 2, at, e.d * 0.6, 'triangle', 0.02);
        break;
      case 'bass':
        this.osc(ac, e.f, at, e.d, 'triangle', 0.16);
        break;
      case 'chick':
        this.noise(ac, at, 0.08, 0.05, 'bandpass', 2500);
        break;
    }
  }

  /** The crowd: a swelling "yay" + a few whistles (cheer) or applause (clap). */
  private crowdSound(ac: AudioContext, kind: 'cheer' | 'clap' | 'laugh' | 'honk' | 'fanfare'): void {
    const at = ac.currentTime + 0.03;
    if (kind === 'cheer') {
      this.noise(ac, at, 2.4, 0.09, 'bandpass', 900, 0.35);
      for (let i = 0; i < 3; i++) {
        const t = at + 0.2 + i * 0.45;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.setValueAtTime(1400, t);
        o.frequency.exponentialRampToValueAtTime(2300, t + 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(this.bus!);
        o.start(t);
        o.stop(t + 0.4);
      }
    }
    if (kind === 'cheer' || kind === 'clap') {
      const secs = kind === 'clap' ? 3 : 2;
      for (let i = 0; i < secs * 24; i++) {
        const t = at + Math.random() * secs * Math.random() ** 0.3;
        this.noise(ac, t, 0.035, 0.05 + Math.random() * 0.05, 'bandpass', 1100 + Math.random() * 1400);
      }
    }
    if (kind === 'laugh') [0, 0.18, 0.36, 0.54].forEach((d, i) => this.osc(ac, 520 - i * 30, at + d, 0.14, 'triangle', 0.07));
    if (kind === 'honk') {
      this.osc(ac, 330, at, 0.25, 'square', 0.06);
      this.osc(ac, 262, at + 0.28, 0.35, 'square', 0.06);
    }
    if (kind === 'fanfare') [392, 523, 659, 784].forEach((f, i) => this.osc(ac, f, at + i * 0.14, i === 3 ? 0.6 : 0.16, 'sawtooth', 0.05));
  }

  /** Spoken + crowd sound cues, each once when its moment is reached (not after a reload / QA jump into it). */
  private cues(c: number, ac: AudioContext | null, inside: boolean, paused: boolean): void {
    const list: [number, string, (() => void) | null, string | null][] = [
      [0.3, 'open', () => ac && this.crowdSound(ac, 'fanfare'), 'Vai começar o rodeio!'],
      [ACT1 + 1.5, 'buck', () => ac && this.crowdSound(ac, 'cheer'), 'Olha o cavalo aos pulos!'],
      [ACT1 + 14.6, 'hay', () => ac && this.crowdSound(ac, 'laugh'), 'Saltou para a palha! Está a rir-se!'],
      [ACT1 + 19, 'bow1', () => ac && this.crowdSound(ac, 'clap'), null],
      [ACT2 + 1.5, 'lasso', null, 'Agora o laço!'],
      [ACT2 + 15, 'caught', () => ac && this.crowdSound(ac, 'cheer'), 'Apanhou o poste! Bravo!'],
      [ACT3 + 0.5, 'clown', () => ac && this.crowdSound(ac, 'honk'), 'Olha o palhaço com o barril!'],
      [ACT3 + 13.5, 'pop', () => ac && (this.crowdSound(ac, 'honk'), this.crowdSound(ac, 'cheer')), 'Surpresa!'],
      [FINALE, 'bye', () => ac && (this.crowdSound(ac, 'cheer'), this.crowdSound(ac, 'clap')), 'Bravo! Batam palmas!'],
    ];
    const jumped = this.lastC < 0 || (c - this.lastC + CYCLE) % CYCLE > 2;
    let now = '';
    for (const [at, id] of list) if (c >= at) now = id;
    if (now !== this.cue) {
      this.cue = now;
      const hit = list.find((l) => l[1] === now);
      if (hit && !jumped && c - hit[0] < 1.5) {
        if (this.vol > 0.01) hit[2]?.();
        if (hit[3] && inside && !paused) this.ctx.say([hit[3]]);
      }
    }
    this.lastC = c;
  }

  private music(ac: AudioContext): void {
    song ??= buildSong();
    if (this.musicT0 < 0 || ac.currentTime - this.musicT0 > song.length * (this.loopN + 2)) {
      this.musicT0 = ac.currentTime + 0.1;
      this.loopN = 0;
      this.evIdx = 0;
    }
    const ahead = ac.currentTime + 0.25;
    for (let guard = 0; guard < 400; guard++) {
      if (this.evIdx >= song.events.length) {
        this.evIdx = 0;
        this.loopN++;
      }
      const e = song.events[this.evIdx];
      const at = this.musicT0 + this.loopN * song.length + e.t;
      if (at > ahead) break;
      this.evIdx++;
      if (at >= ac.currentTime - 0.02) this.play(ac, e, at);
    }
  }

  /* ------------------------------------------------------------ frame */

  update(dt: number): void {
    if (!this.plot || !this.gate) return;
    const ac = this.ensureAudio();
    this.c = this.cycle();
    const c = this.c;
    this.gate.update(dt);
    const inside = this.gate.inside;
    const paused = this.ctx.isPaused();
    const p = this.ctx.player;
    const dist = Math.hypot(p.x - this.center.x, p.z - this.center.z);

    // volume: clear inside, muffled outside, silent far away or while the game is paused (the show goes on)
    const target = paused ? 0 : inside ? 0.9 : Math.max(0, 1 - dist / 55) * 0.3;
    const cut = inside ? 12000 : 700;
    if (ac && this.bus && this.filter) {
      if (Math.abs(target - this.lastVol) > 0.01) {
        this.bus.gain.setTargetAtTime(target, ac.currentTime, paused ? 0.02 : 0.25);
        this.lastVol = target;
      }
      if (cut !== this.lastCut) {
        this.filter.frequency.setTargetAtTime(cut, ac.currentTime, 0.3);
        this.lastCut = cut;
      }
      if (target > 0.005) this.music(ac);
      else this.musicT0 = -1;
    }
    this.vol = target;
    this.cues(c, ac, inside, paused);

    if (dist > 90 || paused) return; // nobody watching: skip the animation
    const now = performance.now() / 1000;
    this.actors(c, now);
    this.updateConfetti(dt);
    this.mood = this.crowdMood(c);
    for (const sd of this.sides) this.poseSide(sd, now, this.mood);
  }

  /** Stop the music (city change / new game). */
  dispose(): void {
    if (this.bus) {
      const ac = audioContext();
      if (ac) this.bus.gain.setValueAtTime(0, ac.currentTime);
      this.bus.disconnect();
    }
    this.bus = null;
    this.gate?.dispose();
    this.root.parent?.remove(this.root);
    if (this.onDebugTime) window.removeEventListener('rainbow-rodeo-time', this.onDebugTime);
    this.onDebugTime = null;
  }

  /** Debug/QA state. */
  debug(): Record<string, unknown> | null {
    if (!this.plot || !this.booth || !this.gate) return null;
    const r = (v: number) => +v.toFixed(1);
    const gate = this.root.localToWorld(new THREE.Vector3(0, 0, 2.5));
    const inside = this.root.localToWorld(new THREE.Vector3(0, 0, -4));
    const act = this.c >= FINALE ? 'finale' : this.c >= ACT3 ? 'clown' : this.c >= ACT2 ? 'lasso' : this.c >= ACT1 ? 'bucking' : 'intro';
    return {
      booth: [r(this.booth.position.x), r(this.booth.position.z)],
      gateOut: [r(gate.x), r(gate.z)],
      insideAt: [r(inside.x), r(inside.z)],
      stands: this.seats.map((s) => [r(s.position.x), r(s.position.z)]),
      rot: +this.plot.rot.toFixed(2),
      ...this.gate.debug(),
      t: r(this.c),
      act,
      crowd: this.mood,
      spectators: this.sides.reduce((n, s) => n + s.fans.length, 0),
      freeSeats: this.sides.map((s) => s.free.length),
      seated: !!this.seated,
      vol: +this.vol.toFixed(2),
    };
  }
}

/** The rodeo sits in main.ts's concert slot (USA): this finds it there. */
export const asRodeo = (v: unknown): Rodeo | null => (v instanceof Rodeo ? v : null);
