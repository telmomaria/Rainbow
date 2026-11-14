import * as THREE from 'three';
import { audioContext, tone } from './audio';
import { CHARACTER_RADIUS, STROKES, WATER_Y, type Character, type Stroke } from './character';
import type { GameCtx } from './gamectx';
import { isFree } from './spawn';
import type { Interactable, Obstacle } from './world';
import { HAIRS, SKINS, TicketGate, animateStaff, box, buildFence, buildFolk, cyl, findPlot, mat, pick, toWorld, worldBox, type Folk, type Plot } from './venue';

/**
 * A swimming pool in every city (fenced, set back from the street; ticket booth, gate and doorman from venue.ts).
 * - Beach cabins along the left fence are the changing room: walk into one → the door closes, rustle rustle,
 *   the door opens and she comes out in her swimsuit (and back to her clothes the same way).
 * - Touching the pool edge in a swimsuit = she jumps in and swims (same controls); pushing against the edge = she
 *   climbs out. Double tap / Space in the water cycles crawl → costas → bruços. In her clothes the lifeguard
 *   whistles and points at the cabins instead.
 * - Loungers on the right: touch a free one to lie down and sunbathe (any key/tap = get up). The other visitors
 *   (random, up to 8) sunbathe, get up, jump in, swim, climb out and lie down again on a free lounger.
 * - She can always leave; if she walks out in her swimsuit she is back in her clothes outside.
 * No text, icons or UI — all in the world.
 */

export const POOL_PRICE = 5;
const SPEED: Record<Stroke, number> = { crawl: 3.2, costas: 2.8, brucos: 2.5 };
const MAX_PEOPLE = 8;

/* ---- layout, venue-local frame (see venue.ts): front fence z = 0, +Z points at the road ---- */
const HW = 13;
const BACK = -28;
const WATER = { x0: -7, x1: 5, z0: -24.5, z1: -12 };
const RIM = 0.45; // width of the white rim around the water
const RIM_H = WATER_Y + 0.1;
const CABINS = [-4.2, -6.6, -9.0]; // cabin centres along z, against the left fence (x = -HW)
const CABIN = { depth: 2.0, width: 2.1, h: 2.5 };
const LIFEGUARD = { x: -1, z: -26.6 }; // behind the far end of the pool, facing the water
/** Loungers along the right fence, with a wide walkway between them and the pool. */
const LOUNGER_X = 11.4;
const LOUNGERS = [-13.5, -16.6, -19.7, -22.8];
const LOUNGER_STAND_X = 9.6; // where you stand to lie down / get up
const LOUNGE_Y = 0.6;

export interface PoolHooks {
  player: Character;
  /** Freeze/unfreeze the controls (jumping in/out, changing clothes). */
  hold(on: boolean): void;
  /** Called when she changes clothes (e.g. to put away what she was holding). */
  changed(): void;
}

type BatherMode = 'lounge' | 'walk' | 'hop' | 'swim' | 'float';
interface Bather {
  holder: THREE.Group;
  folk: Folk;
  mode: BatherMode;
  /** lounger index while lounging (or walking to one) */
  lounger: number | null;
  /** venue-local position (x, z) */
  pos: THREE.Vector2;
  path: THREE.Vector2[];
  /** what to do at the end of the walk */
  then: 'hopIn' | 'lieDown' | null;
  hop: { from: THREE.Vector3; to: THREE.Vector3; t: number; intoWater: boolean } | null;
  target: THREE.Vector2 | null;
  timer: number;
  heading: number;
  phase: number;
  stroke: Stroke;
  ring: THREE.Mesh | null;
}

interface Hop {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  intoWater: boolean;
}

export class Pool {
  readonly booth: Interactable | null = null;
  /** Beach cabins (touch one to change clothes) and loungers (touch a free one to lie down). */
  readonly cabins: Interactable[] = [];
  readonly interior: Obstacle | null = null;
  /** While swimming, these are the only walls (the edges of the water). */
  readonly waterWalls: Obstacle[] = [];

  private readonly root = new THREE.Group();
  private plot: Plot | null = null;
  private gate: TicketGate | null = null;
  private readonly center = new THREE.Vector3();
  private bathers: Bather[] = [];
  /** who is on each lounger: 'player', a bather, or nobody */
  private loungerUsedBy: (Bather | 'player' | null)[] = LOUNGERS.map(() => null);
  private playerLounger: number | null = null;
  private lifeguard: Folk | null = null;
  private lifeguardMood: 'idle' | 'no' | 'yes' | 'wave' = 'idle';
  private lifeguardT = 9;
  private water: THREE.Mesh | null = null;
  private doors: THREE.Group[] = [];
  private doorOpen: number[] = [];
  private doorWant: number[] = [];
  private changing: { cabin: number; t: number; swapped: boolean } | null = null;
  private changeCd = 0;
  private lieCd = 0;
  private hop: Hop | null = null;
  private edgeT = 0;
  private time = 0;
  private splashes: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private ambientCd = 3;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    avoid: THREE.Vector3[],
    private readonly hooks: PoolHooks,
  ) {
    const plot = findPlot(HW, BACK, obstacles, rng, avoid);
    if (!plot) return;
    this.plot = plot;
    this.root.position.set(plot.x, 0, plot.z);
    this.root.rotation.y = plot.rot;
    scene.add(this.root);
    const c = toWorld(plot.x, plot.z, plot.rot, 0, BACK / 2);
    this.center.set(c.x, 0, c.z);

    buildFence(this.root, plot, HW, BACK, obstacles, [0x4dabf7, 0xffffff, 0x3bc9db, 0xffffff, 0x74c0fc, 0xffffff]);
    this.buildDeck();
    this.buildPoolBasin();
    this.buildCabins();
    this.buildLifeguard(rng);
    this.buildLoungers();
    this.buildBathers(rng);
    this.gate = new TicketGate(this.root, scene, ctx, plot, obstacles, rng, {
      price: POOL_PRICE,
      hw: HW,
      back: BACK,
      boothColor: 0x74c0fc,
      roofColor: 0x1c7ed6,
      greeting: 'Bem-vindos à piscina!',
      // to leave she must put her clothes back on in a cabin (the doorman points at the cabins and says so)
      canLeave: () => !this.hooks.player.swimwear,
      refuseSide: 1,
      refuseLine: 'Primeiro veste a tua roupa na cabina!',
    });
    this.booth = this.gate.booth;

    const W = (x0: number, x1: number, z0: number, z1: number, h?: number) => obstacles.push(worldBox(plot, x0, x1, z0, z1, h));
    W(WATER.x0 - RIM, WATER.x1 + RIM, WATER.z0 - RIM, WATER.z1 + RIM, RIM_H); // the whole pool, while on foot
    for (const cz of CABINS) W(-HW, -HW + CABIN.depth, cz - CABIN.width / 2, cz + CABIN.width / 2, CABIN.h);
    W(LIFEGUARD.x - 0.6, LIFEGUARD.x + 0.6, LIFEGUARD.z - 0.6, LIFEGUARD.z + 0.6, 2.6);
    for (const lz of LOUNGERS) W(LOUNGER_X - 0.55, LOUNGER_X + 0.55, lz - 1.15, lz + 1.15, 0.9);
    const t = 1;
    const ww = (x0: number, x1: number, z0: number, z1: number) => this.waterWalls.push(worldBox(plot, x0, x1, z0, z1));
    ww(WATER.x0 - t, WATER.x0, WATER.z0 - t, WATER.z1 + t);
    ww(WATER.x1, WATER.x1 + t, WATER.z0 - t, WATER.z1 + t);
    ww(WATER.x0 - t, WATER.x1 + t, WATER.z0 - t, WATER.z0);
    ww(WATER.x0 - t, WATER.x1 + t, WATER.z1, WATER.z1 + t);
    this.interior = worldBox(plot, -HW, HW, BACK, 0.2);
  }

  /* ------------------------------------------------------------ building */

  private buildDeck(): void {
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -BACK), mat(0xf1f3f5));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.02, BACK / 2);
    deck.receiveShadow = true;
    this.root.add(deck);
    // palm-ish plants in big pots in the corners (away from the walkways)
    for (const [x, z] of [[11.6, -2.2], [11.6, -26.4], [-11.6, -26.4]] as const) {
      cyl(this.root, mat(0xe8590c), 0.5, 0.7, x, 0.35, z);
      cyl(this.root, mat(0x8d6e63), 0.12, 2.2, x, 1.8, z);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const leaf = box(this.root, mat(0x2f9e44), 1.4, 0.06, 0.4, x + Math.cos(a) * 0.55, 2.9, z - Math.sin(a) * 0.55);
        leaf.rotation.set(0, a, -0.35);
      }
    }
  }

  private buildPoolBasin(): void {
    const g = this.root;
    const W = WATER;
    const w = W.x1 - W.x0;
    const d = W.z1 - W.z0;
    const cx = (W.x0 + W.x1) / 2;
    const cz = (W.z0 + W.z1) / 2;
    const white = mat(0xffffff);
    box(g, white, w + RIM * 2, RIM_H, RIM, cx, RIM_H / 2, W.z0 - RIM / 2);
    box(g, white, w + RIM * 2, RIM_H, RIM, cx, RIM_H / 2, W.z1 + RIM / 2);
    box(g, white, RIM, RIM_H, d, W.x0 - RIM / 2, RIM_H / 2, cz);
    box(g, white, RIM, RIM_H, d, W.x1 + RIM / 2, RIM_H / 2, cz);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x99e9f2));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.03, cz);
    g.add(floor);
    for (let i = 1; i < 5; i++) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(w - 2, 0.25), mat(0x1971c2));
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(cx, 0.04, W.z0 + (d / 5) * i);
      g.add(lane);
    }
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x22b8cf, transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.1, emissive: 0x0b7285, emissiveIntensity: 0.25 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, WATER_Y, cz);
    g.add(water);
    this.water = water;
    const ballGeo = new THREE.SphereGeometry(0.09, 8, 6);
    for (let i = 1; i < 5; i++) {
      for (let k = 0; k < 13; k++) {
        const b = new THREE.Mesh(ballGeo, mat(k % 2 ? 0xffffff : 0xe03131));
        b.position.set(W.x0 + 0.5 + k * ((w - 1) / 12), WATER_Y, W.z0 + (d / 5) * i);
        g.add(b);
      }
    }
    for (const lx of [-4, 2]) {
      for (const s of [-0.3, 0.3]) {
        const rail = cyl(g, mat(0xced4da), 0.04, 1.2, lx + s, 0.85, W.z1 + 0.1);
        rail.rotation.x = 0.4;
      }
    }
  }

  private buildCabins(): void {
    const colors = [0xff6b6b, 0xfcc419, 0x51cf66];
    const plot = this.plot!;
    CABINS.forEach((cz, i) => {
      const g = new THREE.Group();
      g.position.set(-HW + CABIN.depth / 2, 0, cz);
      this.root.add(g);
      const c = mat(colors[i % colors.length]);
      const stripe = mat(0xffffff);
      const { depth, width, h } = CABIN;
      box(g, c, 0.15, h, width, -depth / 2 + 0.08, h / 2, 0);
      for (const s of [-1, 1]) {
        box(g, c, depth, h, 0.15, 0, h / 2, s * (width / 2 - 0.08));
        for (let k = 0; k < 3; k++) box(g, stripe, depth + 0.01, 0.18, 0.16, 0, 0.5 + k * 0.7, s * (width / 2 - 0.08));
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(depth, width) / 2 + 0.2, 1.0, 4), c);
      roof.position.y = h + 0.5;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      const hinge = new THREE.Group();
      hinge.position.set(depth / 2, 0, -width / 2 + 0.12);
      g.add(hinge);
      box(hinge, stripe, 0.08, h - 0.3, width - 0.25, 0, (h - 0.3) / 2, (width - 0.25) / 2);
      box(hinge, c, 0.1, 0.25, 0.25, 0.02, 1.7, (width - 0.25) / 2);
      this.doors.push(hinge);
      this.doorOpen.push(1);
      this.doorWant.push(1);
      const st = toWorld(plot.x, plot.z, plot.rot, -HW + depth + 0.9, cz);
      this.cabins.push({ object: g, position: new THREE.Vector3(st.x, 0, st.z), radius: 0.9, interact: () => this.startChange(i) });
    });
  }

  private buildLifeguard(rng: () => number): void {
    const g = this.root;
    const { x, z } = LIFEGUARD;
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) cyl(g, mat(0xffffff), 0.06, 1.8, x + dx, 0.9, z + dz);
    box(g, mat(0xffffff), 1.0, 0.1, 1.0, x, 1.8, z);
    cyl(g, mat(0xadb5bd), 0.04, 2.2, x + 0.4, 2.9, z - 0.3);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 8), mat(0xe03131));
    umb.position.set(x + 0.4, 4.1, z - 0.3);
    g.add(umb);
    const lg = buildFolk({ shirt: 0xe03131, pants: 0xe03131, skin: pick(rng, SKINS), hair: pick(rng, HAIRS), bare: true, cap: 0xffd43b });
    lg.group.position.set(x, 1.85 - 0.6, z); // sitting
    lg.group.rotation.y = Math.PI; // facing the water (+z)
    g.add(lg.group);
    this.lifeguard = lg;
  }

  private buildLoungers(): void {
    const colors = [0xff922b, 0x4dabf7, 0xf06595, 0x51cf66];
    const plot = this.plot!;
    LOUNGERS.forEach((lz, i) => {
      const g = new THREE.Group();
      g.position.set(LOUNGER_X, 0, lz);
      this.root.add(g);
      box(g, mat(0xffffff), 1.0, 0.35, 2.2, 0, 0.3, 0);
      const back = box(g, mat(colors[i]), 0.9, 0.1, 0.9, 0, 0.75, -0.95);
      back.rotation.x = 0.7;
      box(g, mat(colors[i]), 0.9, 0.06, 1.4, 0, 0.5, 0.25);
      const st = toWorld(plot.x, plot.z, plot.rot, LOUNGER_STAND_X, lz);
      // tap a lounger anywhere in the pool area = she goes and lies on it
      this.cabins.push({ object: g, position: new THREE.Vector3(st.x, 0, st.z), radius: 0.8, requiresClick: true, reach: 40, interact: () => this.lieDown(i) });
    });
    // umbrellas between the loungers, against the fence
    for (const uz of [-15.05, -21.25]) {
      cyl(this.root, mat(0xadb5bd), 0.05, 2.6, 12.5, 1.3, uz);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 10), mat(0xfcc419));
      umb.position.set(12.5, 2.8, uz);
      this.root.add(umb);
    }
  }

  /** Random visitors (1–8): some sunbathing (always leaving a lounger free), the rest in the water. */
  private buildBathers(rng: () => number): void {
    const suits = [0xe03131, 0x1971c2, 0xf08c00, 0x9c36b5, 0x2f9e44, 0xf06595];
    const caps = [0xffffff, 0xffd43b, 0xff8787, 0x74c0fc];
    const n = 1 + Math.floor(rng() * MAX_PEOPLE);
    let lounging = Math.min(LOUNGERS.length - 1, Math.floor(rng() * (n + 1)));
    for (let i = 0; i < n; i++) {
      const float = i >= lounging && rng() < 0.3;
      const folk = buildFolk({
        shirt: pick(rng, suits),
        pants: 0,
        skin: pick(rng, SKINS),
        hair: pick(rng, HAIRS),
        bare: true,
        longHair: rng() < 0.4,
        cap: !float && rng() < 0.5 ? pick(rng, caps) : undefined,
      });
      const holder = new THREE.Group();
      holder.rotation.order = 'YXZ';
      holder.add(folk.group);
      this.root.add(holder);
      const b: Bather = {
        holder,
        folk,
        mode: 'swim',
        lounger: null,
        pos: new THREE.Vector2(WATER.x0 + 1 + rng() * (WATER.x1 - WATER.x0 - 2), WATER.z0 + 1 + rng() * (WATER.z1 - WATER.z0 - 2)),
        path: [],
        then: null,
        hop: null,
        target: null,
        timer: 20 + rng() * 60,
        heading: rng() * Math.PI * 2,
        phase: rng() * 10,
        stroke: pick(rng, STROKES),
        ring: null,
      };
      if (lounging > 0 && i < lounging) {
        const li = this.loungerUsedBy.indexOf(null);
        this.loungerUsedBy[li] = b;
        b.lounger = li;
        b.mode = 'lounge';
        b.timer = 15 + rng() * 60;
        box(folk.head, mat(0x111111), 0.4, 0.09, 0.05, 0, 0.05, -0.29); // sunglasses
      } else if (float) {
        b.mode = 'float';
        b.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 10, 24), mat(pick(rng, [0xff6b6b, 0xfcc419, 0x51cf66, 0xcc5de8])));
        b.ring.rotation.x = Math.PI / 2;
        b.ring.position.y = 1.32;
        folk.group.add(b.ring);
      }
      this.bathers.push(b);
    }
    lounging = 0;
  }

  /* ------------------------------------------------------------ changing room */

  private startChange(i: number): void {
    const p = this.hooks.player;
    if (this.ctx.isPaused() || this.changing || this.changeCd > 0 || p.swimming || p.lyingY !== null) return;
    const plot = this.plot!;
    this.changing = { cabin: i, t: 0, swapped: false };
    this.hooks.hold(true);
    const inside = toWorld(plot.x, plot.z, plot.rot, -HW + CABIN.depth / 2, CABINS[i]);
    p.position.set(inside.x, 0, inside.z);
    this.doorWant[i] = 0;
    tone(330, 0.25, 0.1, 'triangle', 0.05);
  }

  private updateChange(dt: number): void {
    const ch = this.changing;
    if (!ch) return;
    ch.t += dt;
    const p = this.hooks.player;
    if (ch.t > 0.6 && ch.t < 1.6 && Math.random() < dt * 14) this.noise(0.05, 0.04, 'bandpass', 2500 + Math.random() * 1500); // rustle
    if (ch.t > 1.1 && !ch.swapped) {
      ch.swapped = true;
      p.setSwimwear(!p.swimwear);
      this.hooks.changed();
    }
    if (ch.t > 1.7) this.doorWant[ch.cabin] = 1;
    if (ch.t > 2.1) {
      const plot = this.plot!;
      const out = toWorld(plot.x, plot.z, plot.rot, -HW + CABIN.depth + 0.9, CABINS[ch.cabin]);
      p.position.set(out.x, 0, out.z);
      p.heading = plot.rot - Math.PI / 2;
      if (p.swimwear) [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.15, 'triangle', 0.06));
      this.changing = null;
      this.changeCd = 2.5;
      this.hooks.hold(false);
    }
  }

  /* ------------------------------------------------------------ loungers */

  private lieDown(i: number): void {
    const p = this.hooks.player;
    if (this.ctx.isPaused() || p.swimming || p.lyingY !== null || this.changing || this.hop || this.lieCd > 0) return;
    const who = this.loungerUsedBy[i];
    if (who !== null) {
      // taken: the person on it waves hello
      if (who !== 'player') who.folk.armR.rotation.z = 2.6;
      return;
    }
    const plot = this.plot!;
    this.loungerUsedBy[i] = 'player';
    this.playerLounger = i;
    const feet = toWorld(plot.x, plot.z, plot.rot, LOUNGER_X, LOUNGERS[i] + 1.0);
    p.position.set(feet.x, 0, feet.z);
    p.heading = plot.rot + Math.PI; // head towards the backrest
    p.lyingY = LOUNGE_Y;
    tone(392, 0, 0.2, 'sine', 0.05);
    tone(523, 0.15, 0.3, 'sine', 0.05);
  }

  /** True while she lies on a lounger (main: any key / tap makes her get up). */
  get lounging(): boolean {
    return this.playerLounger !== null;
  }

  /** Off the lounger, standing beside it facing the pool. */
  getUp(): void {
    const i = this.playerLounger;
    if (i === null) return;
    const plot = this.plot!;
    const p = this.hooks.player;
    this.playerLounger = null;
    this.loungerUsedBy[i] = null;
    p.lyingY = null;
    const st = toWorld(plot.x, plot.z, plot.rot, LOUNGER_STAND_X - 1.4, LOUNGERS[i]); // clear of the touch spot
    p.position.set(st.x, 0, st.z);
    p.heading = plot.rot + Math.PI / 2;
    this.lieCd = 0.4;
  }

  /** Casa / new city: forget her lounger without moving her. */
  release(): void {
    if (this.playerLounger !== null) this.loungerUsedBy[this.playerLounger] = null;
    this.playerLounger = null;
    this.hooks.player.lyingY = null;
  }

  /* ------------------------------------------------------------ water (player) */

  private localPlayer(): THREE.Vector3 {
    return this.root.worldToLocal(this.hooks.player.position.clone().setY(0));
  }

  private startHop(intoWater: boolean, toLocal: THREE.Vector3): void {
    const p = this.hooks.player;
    const to = this.root.localToWorld(toLocal.clone());
    this.hop = { from: p.position.clone(), to: new THREE.Vector3(to.x, intoWater ? WATER_Y - 0.08 : 0, to.z), t: 0, dur: intoWater ? 0.6 : 0.55, intoWater };
    this.hooks.hold(true);
    p.airborne = true;
    p.swimming = intoWater;
    const dx = to.x - p.position.x;
    const dz = to.z - p.position.z;
    p.heading = Math.atan2(-dx, -dz);
  }

  private updateHop(dt: number): void {
    const h = this.hop;
    if (!h) return;
    h.t += dt;
    const k = Math.min(1, h.t / h.dur);
    const p = this.hooks.player;
    p.position.lerpVectors(h.from, h.to, k);
    p.position.y += Math.sin(k * Math.PI) * 0.9;
    if (k >= 1) {
      p.position.copy(h.to);
      p.airborne = false;
      this.hop = null;
      this.hooks.hold(false);
      if (h.intoWater) this.splash(this.hooks.player.position, 1);
      else tone(500, 0, 0.08, 'triangle', 0.05);
    }
  }

  /** Double tap / Space while swimming: crawl → costas → bruços → crawl. */
  nextStroke(): void {
    const p = this.hooks.player;
    if (!p.swimming || p.airborne) return;
    p.stroke = STROKES[(STROKES.indexOf(p.stroke) + 1) % STROKES.length];
    this.noise(0.35, 0.08, 'lowpass', 1100);
    tone(p.stroke === 'crawl' ? 660 : p.stroke === 'costas' ? 550 : 440, 0.05, 0.15, 'triangle', 0.05);
  }

  /** Swimming speed of the current stroke. */
  get swimSpeed(): number {
    return SPEED[this.hooks.player.stroke];
  }

  private splash(at: THREE.Vector3, size: number): void {
    this.noise(0.5 * size, 0.18 * size, 'lowpass', 1200);
    this.noise(0.25 * size, 0.08 * size, 'highpass', 3000);
    for (let i = 0; i < 12 * size; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(0xe7f5ff));
      m.position.set(at.x, WATER_Y + 0.1, at.z);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 1.6, 2.5 + Math.random() * 2, Math.sin(a) * 1.6);
      this.scene.add(m);
      this.splashes.push({ mesh: m, vel: v, life: 0.9 });
    }
  }

  private noise(d: number, gain: number, type: BiquadFilterType, freq: number): void {
    const ac = audioContext();
    if (!ac) return;
    if (!this.noiseBuf) {
      const len = Math.floor(ac.sampleRate * 0.6);
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t, Math.random() * 0.05);
    src.stop(t + d + 0.02);
  }

  /** Nearest free spot on the deck just outside the rim, from a local point in/near the water. */
  private deckSpot(lp: THREE.Vector3): THREE.Vector3 {
    const plot = this.plot!;
    const out = 0.9 + RIM + CHARACTER_RADIUS;
    const cands = [
      new THREE.Vector3(WATER.x0 - out, 0, THREE.MathUtils.clamp(lp.z, WATER.z0, WATER.z1)),
      new THREE.Vector3(WATER.x1 + out, 0, THREE.MathUtils.clamp(lp.z, WATER.z0, WATER.z1)),
      new THREE.Vector3(THREE.MathUtils.clamp(lp.x, WATER.x0, WATER.x1), 0, WATER.z0 - out),
      new THREE.Vector3(THREE.MathUtils.clamp(lp.x, WATER.x0, WATER.x1), 0, WATER.z1 + out),
    ].sort((a, b) => a.distanceToSquared(lp) - b.distanceToSquared(lp));
    for (const c of cands) {
      const w = toWorld(plot.x, plot.z, plot.rot, c.x, c.z);
      if (isFree(w.x, w.z, CHARACTER_RADIUS + 0.05, this.obstacles)) return c;
    }
    return new THREE.Vector3(0, 0, WATER.z1 + out); // the near side is always clear
  }

  isInside(): boolean {
    return this.gate?.inside ?? false;
  }

  /** Is she in the water (or diving in)? Movement uses `waterWalls` and `swimSpeed` then. */
  get swimming(): boolean {
    return this.hooks.player.swimming;
  }

  /**
   * Per frame. `pushing` = the child is trying to move (arrow keys held or a tap target),
   * used to climb out when she pushes against the edge.
   */
  update(dt: number, pushing: boolean, tapTarget: THREE.Vector3 | null = null): void {
    if (!this.plot || !this.gate) return;
    this.time += dt;
    this.changeCd = Math.max(0, this.changeCd - dt);
    this.lieCd = Math.max(0, this.lieCd - dt);
    this.gate.update(dt);
    this.updateChange(dt);
    this.updateHop(dt);
    const p = this.hooks.player;
    const paused = this.ctx.isPaused();

    this.doors.forEach((d, i) => {
      this.doorOpen[i] += (this.doorWant[i] - this.doorOpen[i]) * Math.min(1, dt * 8);
      d.rotation.y = this.doorOpen[i] * 1.6;
    });

    if (!paused && !this.hop && !this.changing && !this.ctx.isDriving() && p.lyingY === null) {
      const lp = this.localPlayer();
      if (!p.swimming) {
        const cx = THREE.MathUtils.clamp(lp.x, WATER.x0 - RIM, WATER.x1 + RIM);
        const cz = THREE.MathUtils.clamp(lp.z, WATER.z0 - RIM, WATER.z1 + RIM);
        const d = Math.hypot(lp.x - cx, lp.z - cz);
        // walking by tap only jumps in when the tap was on the water (walking around the pool never does)
        const tl = tapTarget ? this.root.worldToLocal(tapTarget.clone().setY(0)) : null;
        const wantsWater = !tl || (tl.x > WATER.x0 - RIM && tl.x < WATER.x1 + RIM && tl.z > WATER.z0 - RIM && tl.z < WATER.z1 + RIM);
        if (d < CHARACTER_RADIUS + 0.2 && wantsWater) {
          if (p.swimwear) {
            const into = new THREE.Vector3(
              THREE.MathUtils.clamp(lp.x, WATER.x0 + 1.2, WATER.x1 - 1.2),
              0,
              THREE.MathUtils.clamp(lp.z, WATER.z0 + 1.2, WATER.z1 - 1.2),
            );
            this.startHop(true, into);
          } else if (this.lifeguardT > 3) {
            // in clothes: whistle and point at the cabins
            this.lifeguardMood = 'no';
            this.lifeguardT = 0;
            [0, 0.2].forEach((t) => {
              tone(2900, t, 0.14, 'square', 0.04);
              tone(3200, t + 0.05, 0.1, 'square', 0.03);
            });
          }
        }
      } else {
        const m = 0.62;
        const atEdge = lp.x < WATER.x0 + m || lp.x > WATER.x1 - m || lp.z < WATER.z0 + m || lp.z > WATER.z1 - m;
        this.edgeT = atEdge && pushing ? this.edgeT + dt : 0;
        if (this.edgeT > 0.35) {
          this.edgeT = 0;
          this.startHop(false, this.deckSpot(lp));
        }
        if (Math.random() < dt * 0.8 && pushing) this.noise(0.2, 0.025, 'lowpass', 900);
      }
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.life -= dt;
      s.vel.y -= 12 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.life <= 0 || s.mesh.position.y < WATER_Y - 0.1) {
        this.scene.remove(s.mesh);
        this.splashes.splice(i, 1);
      }
    }

    const dist = Math.hypot(p.position.x - this.center.x, p.position.z - this.center.z);
    if (dist > 90 || paused) return;
    for (const b of this.bathers) this.updateBather(b, dt);
    if (this.lifeguard) {
      this.lifeguardT += dt;
      // he faces the water (+z); the cabins are towards the front-left: his right arm points that way
      this.lifeguardMood = animateStaff(this.lifeguard, this.lifeguardMood, this.lifeguardT, 1);
    }
    if (this.water) {
      const m = this.water.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.22 + Math.sin(this.time * 1.7) * 0.05;
    }
    this.ambientCd -= dt;
    if (dist < 35 && this.ambientCd <= 0 && this.bathers.some((b) => b.mode === 'swim' || b.mode === 'float')) {
      this.ambientCd = 2 + Math.random() * 4;
      this.noise(0.3, 0.03, 'lowpass', 1500);
    }
  }

  /* ------------------------------------------------------------ the other visitors */

  private freeLounger(): number | null {
    const free = this.loungerUsedBy.map((u, i) => (u === null ? i : -1)).filter((i) => i >= 0);
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  private updateBather(b: Bather, dt: number): void {
    const f = b.folk;
    const h = b.holder;
    b.phase += dt * 3;
    b.timer -= dt;
    const W = WATER;
    switch (b.mode) {
      case 'lounge': {
        const lz = LOUNGERS[b.lounger!];
        h.position.set(LOUNGER_X, LOUNGE_Y, lz + 0.05);
        h.rotation.set(Math.PI / 2 - 0.3, Math.PI, 0); // on the back, head towards the backrest
        f.group.position.y = -1.0;
        f.armL.rotation.set(0, 0, -0.3 - Math.max(0, Math.sin(this.time * 0.4 + lz)) * 0.2);
        f.armR.rotation.z += (2.6 - f.armR.rotation.z) * Math.min(1, dt * 2); // hand behind the head
        if (b.timer <= 0) {
          // get up and go for a swim
          this.loungerUsedBy[b.lounger!] = null;
          b.lounger = null;
          b.pos.set(LOUNGER_STAND_X, lz);
          const rimZ = THREE.MathUtils.clamp(lz, W.z0 + 0.5, W.z1 - 0.5);
          b.path = [new THREE.Vector2(W.x1 + RIM + 0.8, rimZ)];
          b.then = 'hopIn';
          b.mode = 'walk';
          f.armR.rotation.set(0, 0, 0.08);
          f.armL.rotation.set(0, 0, -0.08);
        }
        break;
      }
      case 'walk': {
        const tgt = b.path[0];
        const dx = tgt.x - b.pos.x;
        const dz = tgt.y - b.pos.y;
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, 1.4 * dt);
        if (d > 0.01) {
          b.pos.x += (dx / d) * step;
          b.pos.y += (dz / d) * step;
          b.heading = Math.atan2(-dx, -dz);
        }
        h.position.set(b.pos.x, 0, b.pos.y);
        h.rotation.set(0, b.heading, 0);
        f.group.position.y = Math.abs(Math.sin(b.phase * 1.4)) * 0.05;
        f.legL.rotation.x = Math.sin(b.phase * 1.4) * 0.5;
        f.legR.rotation.x = -Math.sin(b.phase * 1.4) * 0.5;
        if (d < 0.05) {
          b.path.shift();
          if (b.path.length) break;
          f.legL.rotation.x = f.legR.rotation.x = 0;
          if (b.then === 'hopIn') {
            const to = new THREE.Vector3(W.x1 - 1.2, WATER_Y - 0.08, THREE.MathUtils.clamp(b.pos.y, W.z0 + 1, W.z1 - 1));
            b.hop = { from: new THREE.Vector3(b.pos.x, 0, b.pos.y), to, t: 0, intoWater: true };
            b.mode = 'hop';
          } else if (b.then === 'lieDown' && b.lounger !== null) {
            b.mode = 'lounge';
            b.timer = 30 + Math.random() * 60;
          }
          b.then = null;
        }
        break;
      }
      case 'hop': {
        const hp = b.hop!;
        hp.t += dt / 0.6;
        const k = Math.min(1, hp.t);
        const pos = new THREE.Vector3().lerpVectors(hp.from, hp.to, k);
        pos.y += Math.sin(k * Math.PI) * 0.8;
        h.position.copy(pos);
        b.heading = Math.atan2(-(hp.to.x - hp.from.x), -(hp.to.z - hp.from.z));
        if (hp.intoWater) {
          h.rotation.set(-1.42 * k, b.heading, 0);
          f.group.position.y = -1.0 * k;
        } else {
          h.rotation.set(-1.42 * (1 - k), b.heading, 0);
          f.group.position.y = -1.0 * (1 - k);
        }
        if (k >= 1) {
          b.hop = null;
          b.pos.set(hp.to.x, hp.to.z);
          if (hp.intoWater) {
            this.splash(this.root.localToWorld(hp.to.clone()), 0.6);
            b.mode = 'swim';
            b.timer = 25 + Math.random() * 60;
            b.target = null;
          } else {
            f.group.position.y = 0;
            b.mode = 'walk';
          }
        }
        break;
      }
      case 'swim': {
        // pick spots in the water; when it's time to rest, swim to the edge by a free lounger and climb out
        if (b.timer <= 0 && b.lounger === null) {
          const li = this.freeLounger();
          if (li !== null) {
            this.loungerUsedBy[li] = b; // reserved
            b.lounger = li;
            b.target = new THREE.Vector2(W.x1 - 0.7, THREE.MathUtils.clamp(LOUNGERS[li], W.z0 + 0.7, W.z1 - 0.7));
          } else b.timer = 10;
        }
        if (!b.target) b.target = new THREE.Vector2(W.x0 + 1 + Math.random() * (W.x1 - W.x0 - 2), W.z0 + 1 + Math.random() * (W.z1 - W.z0 - 2));
        const dx = b.target.x - b.pos.x;
        const dz = b.target.y - b.pos.y;
        const d = Math.hypot(dx, dz);
        const sp = b.stroke === 'crawl' ? 1.3 : 1.0;
        if (d > 0.05) {
          b.pos.x += (dx / d) * Math.min(d, sp * dt);
          b.pos.y += (dz / d) * Math.min(d, sp * dt);
          const want = Math.atan2(-dx, -dz);
          let diff = want - b.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          b.heading += diff * Math.min(1, dt * 3);
        }
        h.position.set(b.pos.x, WATER_Y - 0.08 + Math.sin(b.phase * 2) * 0.03, b.pos.y);
        h.rotation.set(-1.42, b.heading, 0);
        f.group.position.y = -1.0;
        f.group.rotation.y = b.stroke === 'costas' ? Math.PI : 0;
        poseFolkSwim(f, b.stroke, b.phase);
        if (d < 0.1) {
          if (b.lounger !== null) {
            // climb out towards the loungers and walk to the reserved one
            const lz = LOUNGERS[b.lounger];
            f.group.rotation.y = 0;
            resetFolk(f);
            b.hop = {
              from: new THREE.Vector3(b.pos.x, WATER_Y - 0.08, b.pos.y),
              to: new THREE.Vector3(W.x1 + RIM + 0.8, 0, b.pos.y),
              t: 0,
              intoWater: false,
            };
            b.path = [new THREE.Vector2(LOUNGER_STAND_X, lz), new THREE.Vector2(LOUNGER_X, lz + 0.05)];
            b.then = 'lieDown';
            b.mode = 'hop';
          } else b.target = null;
        }
        break;
      }
      case 'float': {
        b.pos.x = THREE.MathUtils.clamp(b.pos.x + Math.cos(b.phase * 0.1) * 0.25 * dt, W.x0 + 1, W.x1 - 1);
        b.pos.y = THREE.MathUtils.clamp(b.pos.y + Math.sin(b.phase * 0.1) * 0.25 * dt, W.z0 + 1, W.z1 - 1);
        h.position.set(b.pos.x, Math.sin(b.phase * 0.7) * 0.04, b.pos.y);
        h.rotation.set(0, b.phase * 0.07, 0);
        f.group.position.y = WATER_Y - 1.32; // chest at the water line, legs hidden under the deck
        f.armL.rotation.z = -1.2;
        f.armR.rotation.z = 1.2 + Math.sin(b.phase) * 0.3;
        break;
      }
    }
  }

  dispose(): void {
    this.gate?.dispose();
    for (const s of this.splashes) this.scene.remove(s.mesh);
  }

  debug(): Record<string, unknown> | null {
    if (!this.plot || !this.booth || !this.gate) return null;
    const r = (v: number) => +v.toFixed(1);
    const w = (x: number, z: number) => {
      const v = toWorld(this.plot!.x, this.plot!.z, this.plot!.rot, x, z);
      return [r(v.x), r(v.z)];
    };
    const p = this.hooks.player;
    return {
      booth: [r(this.booth.position.x), r(this.booth.position.z)],
      gateOut: w(0, 2.5),
      insideAt: w(0, -4),
      cabin: [r(this.cabins[0].position.x), r(this.cabins[0].position.z)],
      loungers: LOUNGERS.map((lz) => w(LOUNGER_STAND_X, lz)),
      loungerUse: this.loungerUsedBy.map((u) => (u === null ? null : u === 'player' ? 'player' : u.mode)),
      people: this.bathers.map((b) => b.mode),
      rimNear: w(-1, WATER.z1 + RIM + 1.2),
      waterMid: w((WATER.x0 + WATER.x1) / 2, (WATER.z0 + WATER.z1) / 2),
      rot: +this.plot.rot.toFixed(2),
      ...this.gate.debug(),
      swimwear: p.swimwear,
      swimming: p.swimming,
      stroke: p.stroke,
      lying: p.lyingY !== null,
      changing: !!this.changing,
      hop: !!this.hop,
    };
  }
}

/** Arm/leg motion of a visitor for a swimming style (Folk arms pivot at the shoulder, legs are plain meshes). */
function poseFolkSwim(f: Folk, stroke: Stroke, ph: number): void {
  if (stroke === 'brucos') {
    const sweep = Math.max(0, Math.sin(ph));
    f.armL.rotation.set(-Math.PI * 0.85 + sweep * 0.9, 0, -sweep * 0.9);
    f.armR.rotation.set(-Math.PI * 0.85 + sweep * 0.9, 0, sweep * 0.9);
    const kick = Math.max(0, Math.sin(ph + Math.PI)) * 0.5;
    f.legL.rotation.set(kick, 0, -kick * 0.6);
    f.legR.rotation.set(kick, 0, kick * 0.6);
  } else {
    const dir = stroke === 'crawl' ? -1 : 1;
    f.armL.rotation.set(dir * ph, 0, 0);
    f.armR.rotation.set(dir * (ph + Math.PI), 0, 0);
    f.legL.rotation.set(Math.sin(ph * 4) * 0.3, 0, 0);
    f.legR.rotation.set(-Math.sin(ph * 4) * 0.3, 0, 0);
  }
}

function resetFolk(f: Folk): void {
  f.armL.rotation.set(0, 0, -0.08);
  f.armR.rotation.set(0, 0, 0.08);
  f.legL.rotation.set(0, 0, 0);
  f.legR.rotation.set(0, 0, 0);
}
