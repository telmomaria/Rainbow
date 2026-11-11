import * as THREE from 'three';
import type { GameCtx } from './gamectx';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import { ROADS, SPAWN, onRoad, type Interactable, type Obstacle } from './world';

/**
 * Shops spread around the city: a bakery (Padaria), a pigeon square (Pombos) a short walk from it,
 * and three sweet stands (gelado · chocolate · chupa-chupa) somewhere else.
 * No prices, text or UI: coins visibly fly from the character to the counter, the seller hands the
 * item over (it appears in her hand) or shakes his head when she can't pay. Bread can be thrown to
 * the pigeons; sweets get eaten a few seconds later, bite by bite.
 */

const TAU = Math.PI * 2;
/** Counter front line, metres from the road centre line (road half-width 4 + pavement). */
const FRONT_OFF = 7;
/** Distance from the counter front to the spot where the customer stands. */
const STAND_OFF = 1.1;

interface Spot {
  x: number;
  z: number;
  /** Rotation about Y; shops are modelled with their counter facing +Z. */
  rot: number;
}

function toWorld(s: Spot, lx: number, lz: number): THREE.Vector3 {
  const c = Math.cos(s.rot);
  const si = Math.sin(s.rot);
  return new THREE.Vector3(s.x + lx * c + lz * si, 0, s.z - lx * si + lz * c);
}

/** World AABB of a local box (rotations are multiples of 90°, so it's exact). */
function footprint(s: Spot, x0: number, x1: number, z0: number, z1: number): Obstacle {
  const a = toWorld(s, x0, z0);
  const b = toWorld(s, x1, z1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

function boxesOverlap(a: Obstacle, b: Obstacle, m: number): boolean {
  return a.maxX + m > b.minX && a.minX - m < b.maxX && a.maxZ + m > b.minZ && a.minZ - m < b.maxZ;
}

function circleHitsBox(x: number, z: number, r: number, o: Obstacle): boolean {
  const cx = Math.max(o.minX, Math.min(x, o.maxX));
  const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

function mk(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/* ------------------------------------------------------------------ sounds */

const snd = {
  clink: () => {
    tone(1568 + Math.random() * 120, 0, 0.06, 'square', 0.05);
    tone(2349, 0.04, 0.14, 'triangle', 0.06);
  },
  hmm: () => {
    tone(196, 0, 0.3, 'sine', 0.13);
    tone(174.6, 0.28, 0.45, 'sine', 0.11);
  },
  happy: () => [659.3, 784, 987.8, 1318.5].forEach((f, i) => tone(f, i * 0.07, 0.18, 'triangle', 0.08)),
  crunch: () => {
    for (let i = 0; i < 5; i++) tone(90 + Math.random() * 140, i * 0.035, 0.05, 'square', 0.05);
  },
  lick: () => {
    tone(620, 0, 0.09, 'sine', 0.08);
    tone(820, 0.07, 0.12, 'sine', 0.07);
  },
  coo: () => {
    for (let i = 0; i < 5; i++) tone(i % 2 ? 330 : 300, i * 0.035, 0.05, 'triangle', 0.05); // "rrr"
    tone(262, 0.2, 0.28, 'sine', 0.09); // "u-"
    tone(220, 0.42, 0.3, 'sine', 0.07); // "-u"
  },
  flutter: () => {
    for (let i = 0; i < 9; i++) tone(140 + Math.random() * 260, i * 0.028, 0.035, 'sawtooth', 0.018);
  },
  toss: () => tone(500, 0, 0.06, 'triangle', 0.05),
};

/* ------------------------------------------------------------------ particles */

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

/** Small pool of bits (crumbs, sparkles). They settle on the ground and shrink out at the end of their life. */
class Bits {
  private items: Particle[] = [];
  private next = 0;
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    count: number,
    private mat: (c: number) => THREE.MeshStandardMaterial,
  ) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat(0xffffff));
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, size: 0.05 });
    }
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life: number, size: number): void {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.mesh.material = this.mat(color);
    p.mesh.position.copy(pos);
    p.mesh.rotation.set(Math.random() * TAU, Math.random() * TAU, 0);
    p.mesh.scale.setScalar(size);
    p.mesh.visible = true;
    p.vel.copy(vel);
    p.life = p.max = life;
    p.size = size;
  }

  burst(pos: THREE.Vector3, n: number, colors: number[], speed: number, up: number, life: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.tmp.set(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s);
      this.emit(pos, this.tmp, colors[i % colors.length], life * (0.7 + Math.random() * 0.5), size);
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const m = p.mesh;
      if (m.position.y > 0.025 || p.vel.y > 0) {
        p.vel.y -= 9 * dt;
        m.position.addScaledVector(p.vel, dt);
        m.rotation.x += dt * 6;
        if (m.position.y <= 0.025) {
          m.position.y = 0.025; // land and stay (crumbs on the pavement)
          p.vel.set(0, 0, 0);
        }
      }
      m.scale.setScalar(p.size * Math.min(1, p.life / Math.min(1.2, p.max * 0.35)));
    }
  }
}

/* ------------------------------------------------------------------ sellers */

type Mood = 'idle' | 'no' | 'happy' | 'give' | 'wave';

interface Seller {
  root: THREE.Group;
  hand: THREE.Object3D;
  play(m: Mood): void;
  update(dt: number): void;
}

type HatKind = 'chef' | 'cap' | 'beret' | 'bow';

/* ------------------------------------------------------------------ main entry */

/**
 * Builds the bakery, the pigeon square and the sweet stands in free spots beside the roads and returns
 * their Interactables. `obstacles` must already contain the buildings; the shops' solid footprints are
 * appended. `rng` drives placement only (stable per city). The first returned Interactable's update()
 * also drives the shared effects (flying coins, handed items, crumbs, eating).
 */
export function createShops(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable[] {
  /* ---- shared materials / geometries ---- */
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: number, emissive = 0): THREE.MeshStandardMaterial => {
    const key = `${color}_${emissive}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive });
      mats.set(key, m);
    }
    return m;
  };
  const geos = new Map<string, THREE.BufferGeometry>();
  const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
    let g = geos.get(key);
    if (!g) {
      g = make();
      geos.set(key, g);
    }
    return g as T;
  };
  const box = (w: number, h: number, d: number) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cyl = (rt: number, rb: number, h: number, seg = 14) =>
    geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const sphere = geo('sphere', () => new THREE.SphereGeometry(1, 16, 12));
  const ball = (parent: THREE.Object3D, color: number, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
    const m = mk(sphere, mat(color), parent, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };

  const GOLD = mat(0xffc533, 0.35);
  const coinGeo = cyl(0.09, 0.09, 0.025, 18);
  const bits = new Bits(scene, 30, (c) => mat(c, 0.15));

  /* ---- placement ---- */
  const taken: Obstacle[] = [];
  const LIMIT = 140;
  const boxFree = (fp: Obstacle, margin: number): boolean => {
    if (fp.minX < -LIMIT || fp.maxX > LIMIT || fp.minZ < -LIMIT || fp.maxZ > LIMIT) return false;
    const road =
      ROADS.xs.some((rx) => fp.maxX > rx - 5.5 && fp.minX < rx + 5.5) || ROADS.zs.some((rz) => fp.maxZ > rz - 5.5 && fp.minZ < rz + 5.5);
    if (road) return false;
    if (boxesOverlap(fp, AIRPORT_ZONE, 3)) return false;
    if (circleHitsBox(SPAWN.x, SPAWN.z, 10, fp)) return false;
    for (const o of obstacles) if (boxesOverlap(fp, o, margin)) return false;
    for (const t of taken) if (boxesOverlap(fp, t, 3)) return false;
    return true;
  };
  const pointFree = (x: number, z: number, r: number): boolean => {
    if (onRoad(x, z, 0.5)) return false;
    if (circleHitsBox(x, z, r + 3, AIRPORT_ZONE)) return false;
    for (const o of obstacles) if (circleHitsBox(x, z, r, o)) return false;
    for (const t of taken) if (circleHitsBox(x, z, r, t)) return false;
    return true;
  };

  /**
   * A spot beside a road: the footprint (local x ∈ ±hw, z ∈ [back, front]) has its front at FRONT_OFF
   * from the road centre line, facing the road. `accept` filters by the customer's standing point.
   */
  const roadSpot = (hw: number, back: number, front: number, accept: (x: number, z: number) => boolean): Spot | null => {
    const nRoads = ROADS.xs.length + ROADS.zs.length;
    for (let i = 0; i < 500; i++) {
      const ri = Math.floor(rng() * nRoads);
      const vertical = ri < ROADS.xs.length;
      const at = vertical ? ROADS.xs[ri] : ROADS.zs[ri - ROADS.xs.length];
      const side = rng() < 0.5 ? -1 : 1;
      const t = (rng() - 0.5) * 2 * (LIMIT - hw - 2);
      const d = FRONT_OFF + front;
      const spot: Spot = vertical
        ? { x: at + side * d, z: t, rot: Math.atan2(-side, 0) }
        : { x: t, z: at + side * d, rot: Math.atan2(0, -side) };
      const stand = toWorld(spot, 0, front + STAND_OFF);
      if (!accept(stand.x, stand.z)) continue;
      if (!boxFree(footprint(spot, -hw, hw, back, front), 1.2)) continue;
      if (!pointFree(stand.x, stand.z, 1.2)) continue;
      return spot;
    }
    return null;
  };
  const quadOf = (x: number, z: number): number => (x > SPAWN.x ? 1 : 0) + (z > SPAWN.z ? 2 : 0);
  const spawnDist = (x: number, z: number): number => Math.hypot(x - SPAWN.x, z - SPAWN.z);

  // Different quadrants (around the start point) for the bakery and the sweets.
  const quads = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [quads[i], quads[j]] = [quads[j], quads[i]];
  }

  /* ---- shared effects: tweens, coins flying, items handed over, eating ---- */
  interface Tween {
    delay: number;
    t: number;
    dur: number;
    step(k: number): void;
    done?(): void;
  }
  const tweens: Tween[] = [];
  const tween = (delay: number, dur: number, step: (k: number) => void, done?: () => void) =>
    tweens.push({ delay, t: 0, dur, step, done });

  const handPos = (out: THREE.Vector3): THREE.Vector3 => {
    const h = ctx.heading();
    return out.set(ctx.player.x - Math.sin(h) * 0.35, 1.0, ctx.player.z - Math.cos(h) * 0.35);
  };

  /** n coins arc from her hand onto the counter (clink each), then slip into the till. */
  const payCoins = (n: number, top: THREE.Vector3, done: () => void): void => {
    for (let i = 0; i < n; i++) {
      const coin = new THREE.Mesh(coinGeo, GOLD);
      coin.castShadow = true;
      coin.visible = false;
      scene.add(coin);
      let from: THREE.Vector3 | null = null;
      const to = top.clone().add(new THREE.Vector3((i - (n - 1) / 2) * 0.2, 0.015, 0));
      tween(
        i * 0.28,
        0.6,
        (k) => {
          if (!from) {
            from = handPos(new THREE.Vector3());
            coin.visible = true;
            snd.toss();
          }
          coin.position.lerpVectors(from, to, k);
          coin.position.y += Math.sin(k * Math.PI) * 0.9;
          coin.rotation.x = k < 1 ? k * TAU * 2 : 0;
        },
        () => {
          coin.rotation.set(0, 0, 0);
          snd.clink();
          bits.burst(to, 3, [0xffe066, 0xffffff], 0.6, 1.5, 0.4, 0.03);
          tween(0.6, 0.3, (k) => coin.scale.setScalar(1 - k), () => scene.remove(coin));
        },
      );
    }
    tween((n - 1) * 0.28 + 0.6 + 0.25, 0, () => {}, done);
  };

  type Eat = { item: THREE.Object3D; edible: THREE.Object3D; kind: string; t: number; bites: number; crumbs: number[] };
  let eating: Eat | null = null;
  let lastBread: THREE.Object3D | null = null;

  /** The seller's hand passes the item to hers; then it's really hers (setCarried). */
  const handOver = (seller: Seller, build: () => THREE.Group, kind: string, done: () => void): void => {
    const copy = build();
    scene.add(copy);
    const from = seller.hand.getWorldPosition(new THREE.Vector3());
    const to = new THREE.Vector3();
    tween(
      0,
      0.55,
      (k) => {
        handPos(to);
        copy.position.lerpVectors(from, to, k);
        copy.position.y += Math.sin(k * Math.PI) * 0.35;
        copy.rotation.y = k * TAU;
      },
      () => {
        scene.remove(copy);
        const item = build();
        ctx.setCarried(item, kind);
        snd.happy();
        bits.burst(handPos(to).setY(1.2), 8, [0xffffff, 0xffd43b, 0xff8fab], 1.2, 2.5, 0.6, 0.04);
        if (kind === 'pao') lastBread = item;
        else {
          const ud = item.userData as { edible?: THREE.Object3D; crumbs?: number[] };
          eating = { item, edible: ud.edible ?? item, kind, t: 0, bites: 0, crumbs: ud.crumbs ?? [0xffffff] };
        }
        done();
      },
    );
  };

  const tmpV = new THREE.Vector3();
  const updateFx = (dt: number): void => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt;
      const k = tw.dur <= 0 ? 1 : Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.done?.();
      }
    }
    bits.update(dt);
    // eating: ~4 s after getting it, 4 bites, then gone (only if she still holds that very item)
    const e = eating;
    if (e) {
      if (ctx.carried() !== e.kind || !e.item.parent) {
        eating = null;
      } else {
        e.t += dt;
        if (e.t >= 4 + e.bites * 0.75) {
          e.bites++;
          if (e.kind === 'chocolate') snd.crunch();
          else snd.lick();
          e.edible.getWorldPosition(tmpV);
          bits.burst(tmpV, 4, e.crumbs, 0.7, 1.2, 0.7, 0.035);
          e.edible.scale.setScalar(Math.max(0, 1 - e.bites * 0.27));
          if (e.bites >= 4) {
            ctx.setCarried(null);
            eating = null;
          }
        }
      }
    }
  };

  /* ---- sellers ---- */
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac];
  const makeSeller = (parent: THREE.Object3D, x: number, z: number, shirt: number, hat: HatKind, hatColor: number): Seller => {
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    parent.add(root);
    const skin = mat(SKIN[Math.floor(rng() * SKIN.length)]);
    const torso = mk(cyl(0.27, 0.34, 0.95, 14), mat(shirt), root, 0, 0.98, 0);
    const head = new THREE.Group();
    head.position.set(0, 1.66, 0);
    root.add(head);
    mk(sphere, skin, head).scale.setScalar(0.25);
    const eyeM = mat(0x222222);
    ball(head, 0x222222, 0.035, 0.045, 0.035, -0.085, 0.03, 0.22).material = eyeM;
    ball(head, 0x222222, 0.035, 0.045, 0.035, 0.085, 0.03, 0.22).material = eyeM;
    ball(head, 0xf08c8c, 0.05, 0.045, 0.05, 0, -0.03, 0.245);
    if (hat === 'chef') {
      mk(cyl(0.2, 0.2, 0.22), mat(0xffffff), head, 0, 0.27, 0);
      ball(head, 0xffffff, 0.27, 0.17, 0.27, 0, 0.42, 0);
      mk(box(0.2, 0.045, 0.04), mat(0x6b4226), head, 0, -0.1, 0.225); // moustache
    } else if (hat === 'cap') {
      ball(head, hatColor, 0.26, 0.15, 0.26, 0, 0.13, 0);
      mk(box(0.3, 0.03, 0.2), mat(hatColor), head, 0, 0.13, 0.22);
    } else if (hat === 'beret') {
      ball(head, hatColor, 0.29, 0.09, 0.29, 0.04, 0.2, -0.02);
    } else {
      ball(head, hatColor, 0.12, 0.09, 0.07, -0.11, 0.24, 0);
      ball(head, hatColor, 0.12, 0.09, 0.07, 0.11, 0.24, 0);
    }
    const arms = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.33, 1.38, 0);
      root.add(p);
      mk(cyl(0.07, 0.07, 0.55, 8), mat(shirt), p, 0, -0.27, 0);
      const hand = mk(sphere, skin, p, 0, -0.56, 0);
      hand.scale.setScalar(0.085);
      return { p, s, hand };
    });

    let mood: Mood = 'idle';
    let t = 0;
    const DUR: Record<Mood, number> = { idle: 0, no: 1.5, happy: 0.7, give: 0.9, wave: 1.2 };
    const phase = rng() * TAU;
    let clock = 0;
    return {
      root,
      hand: arms[1].hand,
      play(m) {
        mood = m;
        t = 0;
      },
      update(dt) {
        clock += dt;
        t += dt;
        if (mood !== 'idle' && t > DUR[mood]) mood = 'idle';
        const env = mood === 'idle' ? 0 : Math.sin(Math.min(1, t / DUR[mood]) * Math.PI);
        // defaults: gentle idle sway
        let headY = Math.sin(clock * 0.8 + phase) * 0.15;
        let headZ = 0;
        let lift = 0;
        let armZ = 0.12;
        let armXL = 0;
        let armXR = 0;
        let armZR = 0.12;
        torso.position.y = 0.98;
        if (mood === 'no') {
          headY = Math.sin(t * 13) * 0.5 * env; // shakes the head
          headZ = 0.12 * env;
          armZ = 0.12 + 1.0 * env; // shrug: arms out, palms up
          armZR = armZ;
          armXL = armXR = -0.7 * env;
          lift = 0.05 * env;
        } else if (mood === 'happy') {
          lift = Math.abs(Math.sin(t * 9)) * 0.13;
          armZ = armZR = 0.12 + 0.6 * env;
        } else if (mood === 'give') {
          armXR = -1.45 * env; // reaches over the counter
          armZR = 0.05;
          lift = 0.03 * env;
        } else if (mood === 'wave') {
          armXR = 0;
          armZR = 0.12 + 2.4 * env + Math.sin(t * 14) * 0.35 * env;
          headZ = -0.1 * env;
        }
        head.rotation.set(0, headY, headZ);
        root.position.y = lift;
        arms[0].p.rotation.set(armXL, 0, -armZ);
        arms[1].p.rotation.set(armXR, 0, armZR);
      },
    };
  };

  /* ---- carried items (fresh per purchase; origin at the grip, +Y up) ---- */
  const loafGeo = sphere;
  const buildBread = (): THREE.Group => {
    const g = new THREE.Group();
    ball(g, 0xd98e3f, 0.19, 0.095, 0.1, 0, 0.02, 0);
    for (const x of [-0.09, 0, 0.09]) {
      const cut = mk(box(0.02, 0.014, 0.13), mat(0xf6d6a0), g, x, 0.108, 0);
      cut.rotation.y = 0.45;
    }
    return g;
  };
  const buildGelado = (): THREE.Group => {
    const g = new THREE.Group();
    const cone = mk(geo('cone', () => new THREE.ConeGeometry(0.075, 0.24, 12)), mat(0xe2a35c), g, 0, -0.03, 0);
    cone.rotation.x = Math.PI;
    const top = new THREE.Group();
    top.position.y = 0.1;
    g.add(top);
    ball(top, 0xff8fab, 0.09, 0.085, 0.09, 0, 0.02, 0);
    ball(top, 0x8ce99a, 0.08, 0.075, 0.08, 0, 0.13, 0);
    ball(top, 0xe03131, 0.028, 0.028, 0.028, 0, 0.215, 0);
    g.userData = { edible: top, crumbs: [0xff8fab, 0x8ce99a, 0xffffff] };
    return g;
  };
  const buildChocolate = (): THREE.Group => {
    const g = new THREE.Group();
    mk(box(0.19, 0.17, 0.05), mat(0xe03131), g, 0, -0.02, 0);
    mk(box(0.195, 0.025, 0.055), GOLD, g, 0, 0.065, 0);
    const top = new THREE.Group();
    top.position.y = 0.075;
    g.add(top);
    mk(box(0.17, 0.17, 0.035), mat(0x5c3317), top, 0, 0.085, 0);
    for (const [x, y] of [[-0.042, 0.05], [0.042, 0.05], [-0.042, 0.125], [0.042, 0.125]])
      mk(box(0.07, 0.06, 0.012), mat(0x6f4220), top, x, y, 0.022);
    g.userData = { edible: top, crumbs: [0x5c3317, 0x7b4a2a] };
    return g;
  };
  const buildChupa = (): THREE.Group => {
    const g = new THREE.Group();
    mk(cyl(0.012, 0.012, 0.3, 6), mat(0xffffff), g, 0, 0.03, 0);
    const top = new THREE.Group();
    top.position.y = 0.27;
    g.add(top);
    const disc = mk(cyl(0.13, 0.13, 0.045, 20), mat(0xff4d8d), top);
    disc.rotation.x = Math.PI / 2;
    const swirlGeo = geo('swirl', () => new THREE.TorusGeometry(0.08, 0.018, 8, 22));
    mk(swirlGeo, mat(0xffffff), top, 0, 0, 0.024);
    mk(swirlGeo, mat(0xffffff), top, 0, 0, -0.024);
    ball(top, 0xffd43b, 0.035, 0.035, 0.03, 0, 0, 0.022);
    g.userData = { edible: top, crumbs: [0xff4d8d, 0xffffff] };
    return g;
  };

  /* ---- a stall = something to stand in front of + a seller + a price ---- */
  const stall = (
    group: THREE.Object3D,
    seller: Seller,
    stand: THREE.Vector3,
    radius: number,
    counterLocal: THREE.Vector3,
    price: number,
    kind: string,
    build: () => THREE.Group,
  ): Interactable => {
    let busy = false;
    return {
      object: group,
      position: stand,
      radius,
      interact() {
        if (ctx.isPaused() || ctx.isDriving() || busy) return;
        if (kind === 'pao' && ctx.carried() === 'pao') {
          seller.play('wave'); // already has bread: just a friendly wave
          return;
        }
        if (ctx.coins() < price) {
          seller.play('no');
          snd.hmm();
          return;
        }
        busy = true;
        ctx.addCoins(-price);
        group.updateWorldMatrix(true, false);
        const top = group.localToWorld(counterLocal.clone());
        payCoins(price, top, () => {
          seller.play('happy');
          tween(0.35, 0, () => seller.play('give'));
          tween(0.65, 0, () => {}, () => handOver(seller, build, kind, () => (busy = false)));
        });
      },
      update(dt) {
        if (ctx.isPaused()) return;
        seller.update(dt);
      },
    };
  };

  const out: Interactable[] = [];

  /* ================================================================ Padaria */
  const BK = { hw: 2.5, back: -2, front: 1.9 };
  const bakerySpot =
    roadSpot(BK.hw, BK.back, BK.front, (x, z) => quadOf(x, z) === quads[0] && spawnDist(x, z) > 40 && spawnDist(x, z) < 110) ??
    roadSpot(BK.hw, BK.back, BK.front, (x, z) => spawnDist(x, z) > 30 && spawnDist(x, z) < 130) ??
    roadSpot(BK.hw, BK.back, BK.front, (x, z) => spawnDist(x, z) > 15);
  let bakeryStand: THREE.Vector3 | null = null;
  if (bakerySpot) {
    const s = bakerySpot;
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rot;
    scene.add(g);
    const wall = mat(0xfff1d6);
    const wood = mat(0xc08552);
    mk(box(5, 3.2, 0.3), wall, g, 0, 1.6, -1.85).receiveShadow = true;
    mk(box(0.3, 3.2, 3.8), wall, g, -2.35, 1.6, -0.05).receiveShadow = true;
    mk(box(0.3, 3.2, 3.8), wall, g, 2.35, 1.6, -0.05).receiveShadow = true;
    mk(box(5.4, 0.35, 4.2), mat(0xd9480f), g, 0, 3.37, 0);
    mk(box(4.4, 0.6, 0.25), wall, g, 0, 2.9, 1.75);
    mk(box(4.4, 0.04, 3.5), mat(0xf3d9b1), g, 0, 0.02, -0.05).receiveShadow = true;
    // striped awning sloping out over the pavement
    for (let i = 0; i < 5; i++) {
      const st = mk(box(1.0, 0.06, 1.5), mat(i % 2 ? 0xffffff : 0xff6b6b), g, -2 + i, 2.62, 2.5);
      st.rotation.x = 0.38;
    }
    // counter
    mk(box(4.4, 1.0, 0.6), wood, g, 0, 0.5, 1.6);
    mk(box(4.6, 0.08, 0.75), mat(0xf3d9b1), g, 0, 1.04, 1.6);
    // shelf with breads on the back wall
    mk(box(4, 0.08, 0.45), wood, g, 0, 1.75, -1.5);
    const crust = mat(0xd98e3f);
    for (const x of [-1.4, -0.5, 0.4]) {
      const l = mk(loafGeo, crust, g, x, 1.9, -1.5);
      l.scale.set(0.3, 0.14, 0.17);
    }
    const bag = mk(loafGeo, mat(0xe9b872), g, 1.35, 1.88, -1.5); // baguette
    bag.scale.set(0.55, 0.07, 0.08);
    // basket of loaves on the counter
    mk(cyl(0.32, 0.25, 0.2, 14), mat(0xa0522d), g, -1.6, 1.18, 1.55);
    ball(g, 0xd98e3f, 0.2, 0.11, 0.12, -1.65, 1.3, 1.55).rotation.y = 0.5;
    // giant loaf on the roof: the "sign" — no letters needed
    const sign = new THREE.Group();
    sign.position.set(0, 3.95, 0.9);
    g.add(sign);
    ball(sign, 0xd98e3f, 1.3, 0.5, 0.62);
    for (const x of [-0.6, 0, 0.6]) mk(box(0.12, 0.08, 0.95), mat(0xf6d6a0), sign, x, 0.47, 0).rotation.y = 0.45;

    const baker = makeSeller(g, 0.2, 0.55, 0xffffff, 'chef', 0xffffff);
    obstacles.push(footprint(s, -BK.hw, BK.hw, BK.back, BK.front));
    taken.push(footprint(s, -BK.hw, BK.hw, BK.back, BK.front));
    bakeryStand = toWorld(s, 0, BK.front + STAND_OFF);
    out.push(stall(g, baker, bakeryStand, 1.8, new THREE.Vector3(0.3, 1.09, 1.6), 2, 'pao', buildBread));
  }

  /* ================================================================ Pombos */
  const PR = 5.8; // plaza radius
  let plaza: THREE.Vector3 | null = null;
  if (bakeryStand) {
    const b = bakeryStand;
    for (let i = 0; i < 1500 && !plaza; i++) {
      const a = rng() * TAU;
      const d = i < 900 ? 25 + rng() * 15 : 18 + rng() * 40;
      const x = b.x + Math.cos(a) * d;
      const z = b.z + Math.sin(a) * d;
      if (Math.abs(x) + PR > LIMIT || Math.abs(z) + PR > LIMIT) continue;
      if (onRoad(x, z, PR + 0.3) || spawnDist(x, z) < 20) continue;
      if (!pointFree(x, z, PR + 1.2)) continue;
      plaza = new THREE.Vector3(x, 0, z);
    }
  }
  if (plaza) out.push(createPigeons(plaza));

  /* ================================================================ Doces */
  const SW = { hw: 4.5, back: -1.6, front: 0.6 };
  const far = (x: number, z: number) =>
    (!bakeryStand || Math.hypot(x - bakeryStand.x, z - bakeryStand.z) > 60) && (!plaza || Math.hypot(x - plaza.x, z - plaza.z) > 50);
  const sweetsSpot =
    roadSpot(SW.hw, SW.back, SW.front, (x, z) => quadOf(x, z) === quads[1] && spawnDist(x, z) > 35 && spawnDist(x, z) < 120 && far(x, z)) ??
    roadSpot(SW.hw, SW.back, SW.front, (x, z) => quadOf(x, z) !== quads[0] && spawnDist(x, z) > 30 && spawnDist(x, z) < 130 && far(x, z)) ??
    roadSpot(SW.hw, SW.back, SW.front, (x, z) => spawnDist(x, z) > 30 && spawnDist(x, z) < 130) ??
    roadSpot(SW.hw, SW.back, SW.front, (x, z) => spawnDist(x, z) > 15);
  if (sweetsSpot) {
    const s = sweetsSpot;
    const offs = [-3.3, 0, 3.3];
    const kinds: [string, number, () => THREE.Group, (g: THREE.Group) => Seller][] = [
      ['gelado', 3, buildGelado, buildIceCart],
      ['chocolate', 2, buildChocolate, buildChocoStand],
      ['chupa', 1, buildChupa, buildLolliStand],
    ];
    // shuffle the order along the street per city
    if (rng() < 0.5) kinds.reverse();
    kinds.forEach(([kind, price, build, make], i) => {
      const at: Spot = { ...toWorld(s, offs[i], 0), rot: s.rot };
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      g.rotation.y = at.rot;
      scene.add(g);
      const seller = make(g);
      obstacles.push(footprint(at, -1.05, 1.05, SW.back, SW.front));
      taken.push(footprint(at, -1.05, 1.05, SW.back, SW.front));
      out.push(stall(g, seller, toWorld(at, 0, SW.front + 1.0), 1.4, new THREE.Vector3(0.15, 1.1, 0.25), price, kind, build));
    });
  }

  // The first Interactable also drives the shared effects.
  if (out.length > 0) {
    const first = out[0];
    const firstUpdate = first.update?.bind(first);
    first.update = (dt: number) => {
      if (!ctx.isPaused()) updateFx(Math.min(dt, 0.1));
      firstUpdate?.(dt);
    };
  }
  return out;

  /* ---------------------------------------------------------------- stall models (local, counter faces +Z) */

  function posts(g: THREE.Group, roof: number, trim: number): void {
    for (const x of [-0.95, 0.95]) mk(cyl(0.05, 0.05, 2.5, 8), mat(0xffffff), g, x, 1.25, -1.5);
    const r = mk(box(2.3, 0.12, 2.4), mat(roof), g, 0, 2.55, -0.45);
    r.rotation.x = 0.12;
    mk(box(2.32, 0.18, 0.06), mat(trim), g, 0, 2.47, 0.74);
  }

  function buildIceCart(g: THREE.Group): Seller {
    mk(box(1.9, 0.85, 1.0), mat(0xa5d8ff), g, 0, 0.6, 0.05);
    mk(box(1.95, 0.08, 1.05), mat(0xffffff), g, 0, 1.06, 0.05);
    for (const x of [-0.98, 0.98]) {
      const w = mk(cyl(0.3, 0.3, 0.08, 16), mat(0xff6b6b), g, x, 0.3, 0.05);
      w.rotation.z = Math.PI / 2;
    }
    // parasol
    mk(cyl(0.035, 0.035, 2.3, 8), mat(0xffffff), g, -0.75, 1.15, -0.45);
    mk(geo('parasol', () => new THREE.ConeGeometry(1.25, 0.55, 12)), mat(0xff8fab), g, -0.75, 2.5, -0.45);
    ball(g, 0xffffff, 0.08, 0.08, 0.08, -0.75, 2.8, -0.45);
    // three cones on the lid
    [0xff8fab, 0x8ce99a, 0xffe066].forEach((c, i) => {
      const cone = mk(geo('dcone', () => new THREE.ConeGeometry(0.08, 0.26, 10)), mat(0xe2a35c), g, -0.55 + i * 0.32, 1.23, 0.3);
      cone.rotation.x = Math.PI;
      ball(g, c, 0.1, 0.09, 0.1, -0.55 + i * 0.32, 1.39, 0.3);
    });
    return makeSeller(g, 0.25, -1.0, 0x74c0fc, 'cap', 0xffffff);
  }

  function buildChocoStand(g: THREE.Group): Seller {
    mk(box(2.0, 1.0, 0.9), mat(0x8d5a3b), g, 0, 0.5, 0.15);
    mk(box(2.05, 0.08, 0.95), mat(0xffe8cc), g, 0, 1.04, 0.15);
    posts(g, 0x6f4220, 0xffe8cc);
    // little pyramid of bars: brown ones and wrapped ones
    const bar = box(0.36, 0.06, 0.17);
    const cols = [0x5c3317, 0xe03131, 0x5c3317, 0x4dabf7, 0xffc533];
    const spots = [[-0.6, 0], [-0.2, 0], [0.2, 0], [-0.4, 1], [0, 1]];
    spots.forEach(([x, row], i) => mk(bar, mat(cols[i]), g, x - 0.1, 1.11 + row * 0.065, 0.3).rotation.y = row ? 0.15 : -0.05);
    // giant bar on the roof, half unwrapped
    mk(box(1.1, 0.6, 0.12), mat(0x5c3317), g, 0, 2.95, 0.3);
    mk(box(1.14, 0.62, 0.14), mat(0xe03131), g, -0.3, 2.95, 0.3).scale.x = 0.5;
    return makeSeller(g, 0.25, -0.9, 0xf8f0e3, 'beret', 0x6f4220);
  }

  function buildLolliStand(g: THREE.Group): Seller {
    mk(box(2.0, 1.0, 0.9), mat(0xffc9de), g, 0, 0.5, 0.15);
    mk(box(2.05, 0.08, 0.95), mat(0xffffff), g, 0, 1.04, 0.15);
    posts(g, 0xf06595, 0xffffff);
    const lolly = (x: number, y: number, z: number, r: number, c: number, c2: number) => {
      mk(cyl(0.025 * r * 3, 0.025 * r * 3, y - 1.0, 6), mat(0xffffff), g, x, (y + 1.0) / 2, z);
      const top = new THREE.Group();
      top.position.set(x, y, z);
      top.scale.setScalar(r);
      g.add(top);
      const d = mk(cyl(1, 1, 0.16, 22), mat(c), top);
      d.rotation.x = Math.PI / 2;
      mk(geo('lswirl', () => new THREE.TorusGeometry(0.6, 0.13, 8, 24)), mat(c2), top, 0, 0, 0.085);
      ball(top, c2, 0.22, 0.22, 0.1, 0, 0, 0.085);
      return top;
    };
    lolly(-0.75, 1.6, 0.35, 0.28, 0xff4d8d, 0xffffff);
    lolly(0.75, 1.55, 0.35, 0.26, 0x4dabf7, 0xffe066);
    lolly(0, 3.15, 0.3, 0.5, 0x9775fa, 0xffffff).position.y = 3.3; // big one on the roof
    return makeSeller(g, 0.15, -0.9, 0xfcc2d7, 'bow', 0xf06595);
  }

  /* ---------------------------------------------------------------- pigeons */

  function createPigeons(c: THREE.Vector3): Interactable {
    const g = new THREE.Group();
    g.position.copy(c);
    scene.add(g);
    mk(cyl(PR, PR, 0.06, 40), mat(0xe9dcc9), g, 0, 0.03, 0).receiveShadow = true;
    mk(cyl(3.2, 3.2, 0.065, 32), mat(0xd6c3a5), g, 0, 0.033, 0).receiveShadow = true;
    // planter in the middle
    mk(cyl(0.7, 0.75, 0.5, 16), mat(0xbfc7d5), g, 0, 0.25, 0);
    ball(g, 0x69db7c, 0.7, 0.55, 0.7, 0, 0.75, 0);
    obstacles.push({ minX: c.x - 0.75, maxX: c.x + 0.75, minZ: c.z - 0.75, maxZ: c.z + 0.75 });
    // two benches facing the middle
    const benchA = rng() * TAU;
    for (const a of [benchA, benchA + Math.PI]) {
      const b = new THREE.Group();
      b.position.set(Math.sin(a) * 5.1, 0, Math.cos(a) * 5.1);
      b.rotation.y = a + Math.PI;
      g.add(b);
      mk(box(1.8, 0.4, 0.35), mat(0x6c757d), b, 0, 0.2, 0);
      mk(box(1.9, 0.1, 0.55), mat(0xc08552), b, 0, 0.45, 0);
      mk(box(1.9, 0.45, 0.08), mat(0xc08552), b, 0, 0.78, -0.25);
      const ex = Math.abs(Math.cos(a)) * 0.95 + Math.abs(Math.sin(a)) * 0.3;
      const ez = Math.abs(Math.sin(a)) * 0.95 + Math.abs(Math.cos(a)) * 0.3;
      const wx = c.x + b.position.x;
      const wz = c.z + b.position.z;
      obstacles.push({ minX: wx - ex, maxX: wx + ex, minZ: wz - ez, maxZ: wz + ez });
    }
    taken.push({ minX: c.x - PR, maxX: c.x + PR, minZ: c.z - PR, maxZ: c.z + PR });

    interface Pigeon {
      g: THREE.Group;
      head: THREE.Group;
      wl: THREE.Group;
      wr: THREE.Group;
      mode: 'walk' | 'fly' | 'feed';
      from: THREE.Vector3;
      to: THREE.Vector3;
      t: number;
      dur: number;
      h: number;
      wait: number;
      phase: number;
      peck: number;
      feeding: boolean;
    }
    const BODY = [0x9aa5b8, 0x8c96a8, 0xb0b8c6, 0xf1f3f5, 0xa38f80, 0x9aa5b8, 0x7f8a9e, 0xb0b8c6];
    const headM = mat(0x5c6e91);
    const wingM = mat(0x77829a);
    const beakM = mat(0xf4a259);
    const beakG = geo('beak', () => new THREE.ConeGeometry(0.022, 0.07, 6));
    const wingG = box(0.2, 0.025, 0.15);
    const tailG = box(0.09, 0.02, 0.13);
    const ring = (min: number, max: number): THREE.Vector3 => {
      const a = rng() * TAU;
      const r = Math.sqrt(min * min + rng() * (max * max - min * min));
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    };
    const randRing = (min: number, max: number): THREE.Vector3 => {
      const a = Math.random() * TAU;
      const r = Math.sqrt(min * min + Math.random() * (max * max - min * min));
      return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    };
    const birds: Pigeon[] = BODY.map((col) => {
      const pg = new THREE.Group();
      pg.position.copy(ring(1.4, 4.4));
      pg.rotation.y = rng() * TAU;
      pg.scale.setScalar(1.35);
      g.add(pg);
      ball(pg, col, 0.12, 0.11, 0.19, 0, 0.14, 0);
      const head = new THREE.Group();
      head.position.set(0, 0.2, 0.1);
      pg.add(head);
      const hm = mk(sphere, headM, head, 0, 0.07, 0.04);
      hm.scale.setScalar(0.075);
      const bk = mk(beakG, beakM, head, 0, 0.06, 0.13);
      bk.rotation.x = Math.PI / 2;
      const tail = mk(tailG, wingM, pg, 0, 0.17, -0.22);
      tail.rotation.x = -0.35;
      const wing = (s: number) => {
        const p = new THREE.Group();
        p.position.set(s * 0.08, 0.21, -0.03);
        pg.add(p);
        mk(wingG, wingM, p, s * 0.1, 0, 0);
        return p;
      };
      return {
        g: pg,
        head,
        wl: wing(-1),
        wr: wing(1),
        mode: 'walk',
        from: new THREE.Vector3(),
        to: pg.position.clone(),
        t: 0,
        dur: 1,
        h: 1,
        wait: rng() * 2,
        phase: rng() * TAU,
        peck: rng() * 10,
        feeding: false,
      };
    });

    const pl = new THREE.Vector3(); // player in plaza-local coordinates
    const crumbsAt = new THREE.Vector3();
    let feedT = -1;
    let tame = false;
    let cooT = 0;
    let flutterT = 0;
    let throwAcc = 0;
    let breadGone = false;

    const flyTo = (p: Pigeon, to: THREE.Vector3, h: number, delay: number): void => {
      p.mode = 'fly';
      p.from.copy(p.g.position);
      p.to.copy(to);
      p.h = h;
      p.dur = 0.7 + p.from.distanceTo(to) * 0.18;
      p.t = -delay;
    };
    const scatter = (p: Pigeon): void => {
      let best = randRing(1.4, 4.5);
      let bestD = -1;
      for (let k = 0; k < 7; k++) {
        const cand = randRing(1.4, 4.6);
        if (cand.distanceTo(p.g.position) < 2) continue;
        const d = Math.hypot(cand.x - pl.x, cand.z - pl.z);
        if (d > bestD) {
          bestD = d;
          best = cand;
        }
      }
      p.feeding = false;
      flyTo(p, best, 1.3 + Math.random() * 1.2, Math.random() * 0.15);
      if (flutterT <= 0) {
        snd.flutter();
        flutterT = 0.25;
      }
    };
    const startFeed = (): void => {
      feedT = 0;
      throwAcc = 0;
      breadGone = false;
      const h = ctx.heading();
      crumbsAt.set(pl.x - Math.sin(h) * 1.6, 0, pl.z - Math.cos(h) * 1.6);
      if (crumbsAt.length() < 1.3) crumbsAt.setLength(1.3); // not in the planter
      birds.forEach((p, i) => {
        const a = (i / birds.length) * TAU + Math.random() * 0.5;
        const r = 0.45 + Math.random() * 0.55;
        p.feeding = true;
        flyTo(p, new THREE.Vector3(crumbsAt.x + Math.cos(a) * r, 0, crumbsAt.z + Math.sin(a) * r), 0.6 + Math.random() * 0.6, 0.2 + Math.random() * 0.6);
      });
      snd.coo();
    };

    const throwFrom = new THREE.Vector3();
    const throwVel = new THREE.Vector3();
    return {
      object: g,
      position: c.clone(),
      radius: PR - 0.3,
      interact() {
        if (ctx.isPaused()) return;
        pl.set(ctx.player.x - c.x, 0, ctx.player.z - c.z);
        if (ctx.carried() === 'pao' && !ctx.isDriving()) {
          if (feedT < 0) startFeed();
          return;
        }
        if (feedT >= 0 || tame) return;
        for (const p of birds) if (p.mode !== 'fly' && p.g.position.distanceTo(pl) < 4) scatter(p);
      },
      update(dt) {
        if (ctx.isPaused()) return;
        dt = Math.min(dt, 0.1);
        pl.set(ctx.player.x - c.x, 0, ctx.player.z - c.z);
        const near = pl.length() < PR - 0.3;
        if (feedT < 0 && near && ctx.carried() === 'pao' && !ctx.isDriving()) startFeed();
        if (tame && pl.length() > PR + 1.5) tame = false;
        flutterT -= dt;

        if (feedT >= 0) {
          feedT += dt;
          // crumbs tossed from her hand onto the ground in front of her
          if (feedT < 1.8) {
            throwAcc += dt * 10;
            while (throwAcc >= 1) {
              throwAcc -= 1;
              handPos(throwFrom);
              const T = 0.55;
              const tx = c.x + crumbsAt.x + (Math.random() - 0.5) * 0.9;
              const tz = c.z + crumbsAt.z + (Math.random() - 0.5) * 0.9;
              throwVel.set((tx - throwFrom.x) / T, (0 - throwFrom.y) / T + 4.5 * T, (tz - throwFrom.z) / T);
              bits.emit(throwFrom, throwVel, Math.random() < 0.6 ? 0xe9b872 : 0xf6d6a0, 6.5 + Math.random(), 0.035);
            }
            if (lastBread && ctx.carried() === 'pao') lastBread.scale.setScalar(Math.max(0.25, 1 - feedT / 2));
          }
          if (!breadGone && feedT >= 2) {
            breadGone = true;
            if (ctx.carried() === 'pao') ctx.setCarried(null);
            lastBread = null;
          }
          cooT -= dt;
          if (cooT <= 0 && feedT > 0.8 && feedT < 7.5) {
            snd.coo();
            cooT = 0.9 + Math.random() * 0.8;
          }
          if (feedT > 8.5) {
            feedT = -1;
            tame = true; // they got used to her: no scattering until she walks off
            for (const p of birds) {
              p.feeding = false;
              if (p.mode === 'feed') {
                p.mode = 'walk';
                p.wait = Math.random() * 1.5;
                p.to.copy(p.g.position);
              }
            }
          }
        }

        for (const p of birds) {
          const pos = p.g.position;
          p.phase += dt;
          let peckAmt = 0;
          let flap = 0;
          if (p.mode === 'fly') {
            p.t += dt;
            if (p.t < 0) {
              flap = 0.4; // getting ready
            } else {
              const k = Math.min(1, p.t / p.dur);
              pos.lerpVectors(p.from, p.to, k);
              pos.y = Math.sin(k * Math.PI) * p.h;
              const dx = p.to.x - p.from.x;
              const dz = p.to.z - p.from.z;
              if (dx * dx + dz * dz > 0.01) p.g.rotation.y = Math.atan2(dx, dz);
              flap = 1;
              if (k >= 1) {
                pos.y = 0;
                p.mode = p.feeding ? 'feed' : 'walk';
                p.wait = 0.8 + Math.random() * 1.5;
                p.to.copy(pos);
              }
            }
          } else if (p.mode === 'feed') {
            // face the crumbs and peck fast, with a happy little hop now and then
            p.g.rotation.y = Math.atan2(crumbsAt.x - pos.x, crumbsAt.z - pos.z);
            p.peck += dt * 9;
            peckAmt = Math.max(0, Math.sin(p.peck)) * 1.1;
            pos.y = Math.max(0, Math.sin(p.phase * 2.3)) ** 8 * 0.12;
            flap = pos.y > 0.03 ? 0.5 : 0;
          } else {
            if (!tame && feedT < 0 && Math.hypot(pos.x - pl.x, pos.z - pl.z) < 1.7) {
              scatter(p);
              continue;
            }
            const dx = p.to.x - pos.x;
            const dz = p.to.z - pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.05) {
              const step = Math.min(d, 0.45 * dt);
              pos.x += (dx / d) * step;
              pos.z += (dz / d) * step;
              p.g.rotation.y = Math.atan2(dx, dz);
              pos.y = Math.abs(Math.sin(p.phase * 9)) * 0.035; // little hops
              p.head.position.z = 0.1 + Math.sin(p.phase * 18) * 0.03; // head bob
            } else {
              pos.y = 0;
              p.peck += dt * 4;
              peckAmt = Math.max(0, Math.sin(p.peck) - 0.3) * 1.4;
              p.wait -= dt;
              if (p.wait <= 0) {
                const n = randRing(1.4, 4.4);
                n.lerp(pos, 0.6); // short wander
                if (n.length() < 1.4) n.setLength(1.4);
                p.to.copy(n);
                p.wait = 1 + Math.random() * 3;
              }
            }
          }
          p.head.rotation.x = peckAmt;
          const w = flap > 0 ? -0.3 + Math.sin(p.phase * 32) * 0.9 * flap : 1.35;
          p.wl.rotation.z = w;
          p.wr.rotation.z = -w;
        }
      },
    };
  }
}
