import * as THREE from 'three';
import { registerItem, registerWearable, type WearSlot } from '../items';
import { animateStaff, box, buildFolk, cyl, HAIRS, mat, PANTS, pick, SHIRTS, SKINS, type Folk } from '../venue';
import type { Interactable } from '../world';
import { registerAttraction } from './fair';
import type { FairCtx } from './types';

/**
 * Feira popular — the stalls: pipocas, cachorros-quentes, pinturas faciais, bijuteria, artesanato, roupa e balões.
 * Each one = a striped stand with an awning, a seller behind the counter (facing the path, +Z), the goods on show and
 * a click/Enter spot in front of the counter. Pay → the seller cheers, reaches over and the item flies to her hand
 * (or the accessory appears on her). No text or icons in the world: feedback is animation, sparkles and sound.
 */

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
type Mood = 'idle' | 'no' | 'yes' | 'wave';

/* ================================================================== shared bits */

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}
const shinyCache = new Map<number, THREE.MeshStandardMaterial>();
function shiny(color: number): THREE.MeshStandardMaterial {
  let m = shinyCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
    shinyCache.set(color, m);
  }
  return m;
}
/** A mesh without shadows (small decorations). */
function mk(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
const sph = (r: number, w = 10, h = 8) => geo(`s${r}_${w}_${h}`, () => new THREE.SphereGeometry(r, w, h));
const cy = (rt: number, rb: number, h: number, n = 12, open = false) =>
  geo(`c${rt}_${rb}_${h}_${n}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, n, 1, open));
const bx = (x: number, y: number, z: number) => geo(`b${x}_${y}_${z}`, () => new THREE.BoxGeometry(x, y, z));
const tor = (r: number, t: number, arc = TAU, n = 20) => geo(`t${r}_${t}_${arc}_${n}`, () => new THREE.TorusGeometry(r, t, 6, n, arc));

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * TAU;
    const r = i % 2 ? inner : outer;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
function heartShape(size: number): THREE.Shape {
  const k = size;
  const s = new THREE.Shape();
  s.moveTo(0, -1 * k);
  s.bezierCurveTo(-0.6 * k, -0.45 * k, -1.1 * k, -0.05 * k, -1 * k, 0.4 * k);
  s.bezierCurveTo(-0.9 * k, 0.95 * k, -0.15 * k, 1.0 * k, 0, 0.5 * k);
  s.bezierCurveTo(0.15 * k, 1.0 * k, 0.9 * k, 0.95 * k, 1 * k, 0.4 * k);
  s.bezierCurveTo(1.1 * k, -0.05 * k, 0.6 * k, -0.45 * k, 0, -1 * k);
  return s;
}
const starFlat = (r: number) => geo(`sf${r}`, () => new THREE.ShapeGeometry(starShape(r, r * 0.45)));
const starPuffy = (r: number, d: number) =>
  geo(`sp${r}_${d}`, () => {
    const g = new THREE.ExtrudeGeometry(starShape(r, r * 0.5), { depth: d, bevelEnabled: true, bevelThickness: d * 0.6, bevelSize: r * 0.12, bevelSegments: 2 });
    g.center();
    return g;
  });
const heartPuffy = (r: number, d: number) =>
  geo(`hp${r}_${d}`, () => {
    const g = new THREE.ExtrudeGeometry(heartShape(r), { depth: d, bevelEnabled: true, bevelThickness: d * 0.7, bevelSize: r * 0.15, bevelSegments: 3, curveSegments: 10 });
    g.center();
    return g;
  });

/** Small coloured sparkles and simple timed animations, shared by one stall. */
class Fx {
  private bits: { m: THREE.Mesh; v: V3; life: number }[] = [];
  /** Objects added to the scene for an animation (removed on dispose). */
  readonly temp = new Set<THREE.Object3D>();
  private tweens: { delay: number; t: number; dur: number; step?: (k: number) => void; done?: () => void }[] = [];
  constructor(private readonly scene: THREE.Scene) {}
  burst(at: V3, n: number, colors: number[], speed = 1.6): void {
    const g = geo('spark', () => new THREE.OctahedronGeometry(0.035, 0));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, mat(colors[i % colors.length], 0.7));
      m.position.copy(at);
      this.scene.add(m);
      const a = Math.random() * TAU;
      const v = V(Math.cos(a) * speed * (0.4 + Math.random() * 0.6), 0.6 + Math.random() * speed, Math.sin(a) * speed * (0.4 + Math.random() * 0.6));
      this.bits.push({ m, v, life: 0.6 + Math.random() * 0.4 });
    }
  }
  tween(delay: number, dur: number, step?: (k: number) => void, done?: () => void): void {
    this.tweens.push({ delay, t: 0, dur, step, done });
  }
  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.delay > 0) {
        tw.delay -= dt;
        continue;
      }
      tw.t += dt;
      const k = tw.dur <= 0 ? 1 : Math.min(1, tw.t / tw.dur);
      tw.step?.(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      b.v.y -= 3.5 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.y += dt * 8;
      b.m.scale.setScalar(Math.max(0.05, Math.min(1, b.life * 2)));
      if (b.life <= 0) {
        this.scene.remove(b.m);
        this.bits.splice(i, 1);
      }
    }
  }
  dispose(): void {
    for (const o of this.temp) this.scene.remove(o);
    this.temp.clear();
    for (const b of this.bits) this.scene.remove(b.m);
    this.bits = [];
    this.tweens = [];
  }
}

/** Her right hand in world space (where carried items sit, see main.ts holdItem). */
function herHand(ctx: FairCtx): V3 {
  return V(0.42, 1.0, -0.32).applyAxisAngle(V(0, 1, 0), ctx.game.heading()).add(ctx.game.player);
}
/** Roughly her face (for the painter's sparkles). */
function herFace(ctx: FairCtx): V3 {
  return V(0, 1.68, -0.4).applyAxisAngle(V(0, 1, 0), ctx.game.heading()).add(ctx.game.player);
}

const happyChime = (ctx: FairCtx) => [784, 988, 1175, 1568].forEach((f, i) => ctx.tone(f, i * 0.07, 0.18, 'triangle', 0.05));

/* ================================================================== seller */

class Seller {
  readonly folk: Folk;
  mood: Mood = 'idle';
  private t = 0;
  private time = Math.random() * 10;
  /** 0..1 how far the right arm reaches over the counter. */
  reach = 0;
  reachTarget = 0;
  /** Extra per-frame pose after the standard moods (painter's brush, balloon seller's raised arm…). */
  pose?: (f: Folk, time: number) => void;
  private near = false;

  constructor(parent: THREE.Object3D, rng: () => number, x: number, z: number, opts: { dress?: boolean; cap?: number; shirt?: number } = {}) {
    const dress = opts.dress ?? rng() < 0.5;
    this.folk = buildFolk({
      shirt: opts.shirt ?? pick(rng, SHIRTS),
      pants: pick(rng, PANTS),
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress,
      longHair: dress && rng() < 0.7,
      cap: opts.cap,
    });
    this.folk.group.position.set(x, 0, z);
    this.folk.group.rotation.y = Math.PI; // face the path (+Z)
    parent.add(this.folk.group);
  }

  play(m: Mood): void {
    this.mood = m;
    this.t = 0;
  }

  /** World position of the right hand. */
  hand(): V3 {
    this.folk.group.updateWorldMatrix(true, true);
    return this.folk.armR.localToWorld(V(0, -0.72, 0));
  }

  update(dt: number, dist: number): void {
    this.time += dt;
    this.t += dt;
    // a friendly wave when she comes close
    if (!this.near && dist < 4.5) {
      this.near = true;
      if (this.mood === 'idle') this.play('wave');
    } else if (this.near && dist > 7) this.near = false;
    this.mood = animateStaff(this.folk, this.mood, this.t, 0);
    this.reach += (this.reachTarget - this.reach) * Math.min(1, dt * 8);
    if (this.reach > 0.01) {
      this.folk.armR.rotation.x = this.reach * 1.35;
      this.folk.armR.rotation.z = 0.08 * (1 - this.reach);
      this.folk.body.rotation.x = this.reach * 0.12;
    } else this.folk.body.rotation.x = 0;
    this.folk.body.position.y = Math.sin(this.time * 2.2) * 0.012;
    this.pose?.(this.folk, this.time);
  }
}

/* ================================================================== the stand */

interface StandOpts {
  awning: [number, number];
  body: number;
  trim: number;
  /** Back panel colour. */
  back?: number;
}
const STAND_Z = 2.1; // where she stands (local z), 1.1 m in front of the counter
const COUNTER_Z = 0.7;
const COUNTER_TOP = 1.0;

/** Counter, back panel, four posts and a striped scalloped awning. Returns the counter-top centre (local). */
function buildStand(ctx: FairCtx, o: StandOpts): V3 {
  const g = ctx.group;
  const body = mat(o.body);
  const trim = mat(o.trim);
  // counter
  box(g, body, 2.7, 0.95, 0.55, 0, 0.475, COUNTER_Z);
  box(g, trim, 2.85, 0.06, 0.66, 0, COUNTER_TOP - 0.02, COUNTER_Z);
  box(g, trim, 2.72, 0.12, 0.04, 0, 0.18, COUNTER_Z + 0.28);
  // polka dots on the counter front
  const dotM = mat(o.awning[1]);
  for (let i = 0; i < 5; i++) {
    const d = mk(g, cy(0.07, 0.07, 0.02, 12), dotM, -1.0 + i * 0.5, 0.58, COUNTER_Z + 0.285);
    d.rotation.x = Math.PI / 2;
  }
  // back panel and side half-walls
  box(g, mat(o.back ?? o.body), 2.9, 2.3, 0.1, 0, 1.15, -1.2);
  for (const s of [-1, 1]) box(g, body, 0.08, 0.95, 1.85, s * 1.4, 0.475, -0.25);
  // posts
  const post = mat(o.trim);
  for (const s of [-1, 1]) {
    cyl(g, post, 0.05, 2.55, s * 1.4, 1.275, 0.95);
    cyl(g, post, 0.05, 2.55, s * 1.4, 1.275, -1.15);
  }
  // awning: stripes running front-back, slanted down to the front, scallops on the front edge
  const aw = new THREE.Group();
  aw.position.set(0, 2.62, -0.1);
  aw.rotation.x = 0.2;
  g.add(aw);
  const N = 6;
  const w = 3.1 / N;
  for (let i = 0; i < N; i++) {
    const m = mat(o.awning[i % 2]);
    const s = box(aw, m, w, 0.05, 2.75, -1.55 + w * (i + 0.5), 0, 0);
    s.receiveShadow = false;
    const sc = mk(aw, cy(w / 2, w / 2, 0.04, 12), m, -1.55 + w * (i + 0.5), -0.02, 1.375);
    sc.rotation.x = Math.PI / 2;
    sc.scale.set(1, 1, 0.7);
  }
  // little pennant on top
  cyl(g, post, 0.025, 0.5, 0, 3.05, -1.2);
  const flag = mk(g, geo('flag', () => new THREE.ConeGeometry(0.12, 0.3, 3)), mat(o.awning[0]), 0.13, 3.18, -1.2);
  flag.rotation.z = -Math.PI / 2;
  ctx.solid(-1.5, 1.5, -1.3, COUNTER_Z + 0.33, 2.7);
  return V(0, COUNTER_TOP, COUNTER_Z);
}

/**
 * The click/Enter spot in front of the counter. `onPaid` runs after the coins are taken (busy until `done()`).
 * Refusal (not enough coins): ctx.pay already plays the low "hmm"; the seller shakes the head.
 */
function sellSpot(
  ctx: FairCtx,
  seller: Seller,
  standX: number,
  price: number,
  payTo: V3,
  onPaid: (done: () => void) => void,
): Interactable {
  let busy = false;
  return {
    object: ctx.group,
    position: ctx.at(standX, STAND_Z),
    radius: 1.2,
    requiresClick: true,
    interact() {
      if (busy || ctx.game.isPaused() || ctx.game.isDriving()) return;
      if (!ctx.pay(price, ctx.group.localToWorld(payTo.clone()))) {
        seller.play('no');
        return;
      }
      busy = true;
      seller.play('yes');
      onPaid(() => (busy = false));
    },
  };
}

/** Seller reaches over the counter; a copy of the item flies from their hand to hers; then it's really hers. */
function handOver(ctx: FairCtx, fx: Fx, seller: Seller, kind: string, build: () => THREE.Object3D, done: () => void): void {
  fx.tween(0.55, 0, undefined, () => {
    seller.reachTarget = 1;
    const copy = build();
    ctx.scene.add(copy);
    fx.temp.add(copy);
    const from = V();
    const to = V();
    fx.tween(0.25, 0.6, (k) => {
      from.copy(seller.hand());
      to.copy(herHand(ctx));
      copy.position.lerpVectors(from, to, k);
      copy.position.y += Math.sin(k * Math.PI) * 0.35;
      copy.rotation.y = ctx.game.heading() + (1 - k) * TAU;
    }, () => {
      ctx.scene.remove(copy);
      fx.temp.delete(copy);
      seller.reachTarget = 0;
      ctx.give(kind);
      happyChime(ctx);
      fx.burst(herHand(ctx), 8, [0xffffff, 0xffd43b, 0xff8fab]);
      done();
    });
  });
}

/** Seller cheers, then the accessory appears on her with sparkles. */
function dressUp(ctx: FairCtx, fx: Fx, seller: Seller, slot: WearSlot, kind: string, done: () => void): void {
  fx.tween(0.55, 0, undefined, () => (seller.reachTarget = 1));
  fx.tween(1.1, 0, undefined, () => {
    seller.reachTarget = 0;
    ctx.wear(slot, kind);
    happyChime(ctx);
    const at = slot === 'head' ? herFace(ctx).setY(2.0) : slot === 'neck' ? herFace(ctx).setY(1.35) : slot === 'back' ? ctx.game.player.clone().setY(1.2) : herFace(ctx);
    fx.burst(at, 12, [0xffffff, 0xffd43b, 0xff8fab, 0x74c0fc]);
    done();
  });
}

/** Next design in a rotation, skipping the one she already wears in that slot. */
function rotation(ctx: FairCtx, list: readonly { kind: string; slot: WearSlot }[]): () => { kind: string; slot: WearSlot } {
  let i = Math.floor(ctx.rng() * list.length);
  return () => {
    const worn = ctx.worn();
    for (let n = 0; n < list.length; n++) {
      const d = list[i++ % list.length];
      if (worn[d.slot] !== d.kind) return d;
    }
    return list[i++ % list.length];
  };
}

/** A display mannequin head (skin ball, two eyes, smile) on a stick, facing +Z; returns the head group. */
function mannequin(parent: THREE.Object3D, x: number, y: number, z: number, r: number, skin: number, stick = 0.3): THREE.Group {
  if (stick > 0) cyl(parent, mat(0x8d6e63), 0.025, stick, x, y - r - stick / 2 + 0.02, z);
  const h = new THREE.Group();
  h.position.set(x, y, z);
  h.rotation.y = Math.PI;
  parent.add(h);
  mk(h, sph(r, 14, 10), mat(skin));
  const dark = mat(0x222222);
  for (const s of [-1, 1]) mk(h, sph(r * 0.12, 6, 5), dark, s * r * 0.35, r * 0.05, -r * 0.92);
  const smile = mk(h, tor(r * 0.22, r * 0.05, Math.PI, 8), mat(0xb03a5a), 0, -r * 0.3, -r * 0.94);
  smile.rotation.z = Math.PI;
  return h;
}
/** Put a wearable (built for a 0.34 m head) on a display head of radius r. */
function dressHead(head: THREE.Group, r: number, slot: WearSlot, o: THREE.Object3D): void {
  o.scale.multiplyScalar(r / 0.34);
  if (slot === 'head') o.position.set(0, r * 0.92, 0);
  else if (slot === 'face') o.position.set(0, 0, -r * 0.97);
  else if (slot === 'neck') o.position.set(0, -r - 0.02 * (r / 0.34), 0);
  head.add(o);
}

/* ================================================================== items: food */

/** Popcorn: a red-and-white striped paper tub, heaped with popcorn (the heap is eaten). */
function buildPipocas(): THREE.Group {
  const g = new THREE.Group();
  const tub = mk(g, cy(0.1, 0.075, 0.2, 12), mat(0xffffff), 0, 0, 0);
  tub.castShadow = true;
  const red = mat(0xe03131);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const s = mk(g, bx(0.035, 0.2, 0.012), red, Math.sin(a) * 0.089, 0, Math.cos(a) * 0.089);
    s.rotation.y = a;
  }
  const top = new THREE.Group();
  top.position.y = 0.1;
  g.add(top);
  const kernel = sph(0.03, 6, 5);
  const ms = [mat(0xfff9db), mat(0xffec99), mat(0xfff3bf)];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 0.02 + (i % 4) * 0.022;
    mk(top, kernel, ms[i % 3], Math.cos(a) * r, 0.01 + (3 - (i % 4)) * 0.018 + Math.random() * 0.01, Math.sin(a) * r);
  }
  g.userData = { edible: top };
  return g;
}

/** Hot dog: bun, sausage, a mustard zigzag (the whole thing shrinks bite by bite). */
function buildCachorro(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Group();
  top.rotation.y = Math.PI / 2;
  top.rotation.z = 0.15;
  top.position.y = 0.04;
  g.add(top);
  const bun = mat(0xe8a85c);
  for (const s of [-1, 1]) {
    const half = mk(top, geo('bun', () => new THREE.CapsuleGeometry(0.045, 0.16, 4, 8)), bun, 0, 0, s * 0.035);
    half.rotation.z = Math.PI / 2;
    half.scale.set(1, 1, 0.8);
  }
  const sausage = mk(top, geo('saus', () => new THREE.CapsuleGeometry(0.032, 0.2, 4, 8)), mat(0xb5462b), 0, 0.03, 0);
  sausage.rotation.z = Math.PI / 2;
  const mus = mat(0xffd43b, 0.1);
  for (let i = 0; i < 5; i++) {
    const z = mk(top, bx(0.05, 0.012, 0.012), mus, -0.09 + i * 0.045, 0.064, 0);
    z.rotation.y = i % 2 ? 0.7 : -0.7;
  }
  g.userData = { edible: top };
  return g;
}

/* ================================================================== items: crafts */

const potGeo = () =>
  geo('pot', () => {
    const pts = [
      [0.0, -0.09], [0.06, -0.09], [0.085, -0.05], [0.095, 0.0], [0.08, 0.05], [0.05, 0.08], [0.055, 0.1], [0.065, 0.11],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 14);
  });
/** Little clay pot with a painted band (held by its neck). */
function buildVaso(): THREE.Group {
  const g = new THREE.Group();
  const p = mk(g, potGeo(), mat(0xc8643b), 0, -0.04, 0);
  p.castShadow = true;
  const band = mk(g, tor(0.094, 0.008, TAU, 16), mat(0x1c7ed6), 0, -0.04, 0);
  band.rotation.x = Math.PI / 2;
  const band2 = mk(g, tor(0.085, 0.006, TAU, 16), mat(0xfab005), 0, -0.0, 0);
  band2.rotation.x = Math.PI / 2;
  return g;
}
/** Woven basket hanging from her hand by the handle. */
function buildCesto(): THREE.Group {
  const g = new THREE.Group();
  const wov = mat(0xc49a6c);
  const dark = mat(0x8b5e34);
  mk(g, cy(0.12, 0.09, 0.12, 12), wov, 0, -0.26, 0);
  for (const y of [-0.3, -0.26, -0.22]) {
    const r = mk(g, tor(0.105 + (y + 0.3) * 0.35, 0.008, TAU, 16), dark, 0, y, 0);
    r.rotation.x = Math.PI / 2;
  }
  mk(g, tor(0.12, 0.01, TAU, 16), dark, 0, -0.2, 0).rotation.x = Math.PI / 2;
  mk(g, tor(0.115, 0.012, Math.PI, 12), dark, 0, -0.2, 0);
  // a few apples inside
  for (const [x, z, c] of [[-0.04, 0, 0xe03131], [0.04, 0.02, 0x74b816], [0, -0.04, 0xe03131]] as const) mk(g, sph(0.04, 8, 6), mat(c), x, -0.19, z);
  return g;
}
/** Wooden rocking-horse toy, held by its back. */
function buildCavalinho(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0xd9a066);
  const red = mat(0xe03131);
  const blue = mat(0x1c7ed6);
  const h = new THREE.Group();
  h.position.y = -0.1;
  h.rotation.y = Math.PI / 2;
  g.add(h);
  mk(h, bx(0.18, 0.08, 0.06), wood, 0, 0, 0);
  const neck = mk(h, bx(0.05, 0.11, 0.05), wood, -0.09, 0.07, 0);
  neck.rotation.z = -0.4;
  mk(h, bx(0.09, 0.05, 0.05), wood, -0.13, 0.12, 0);
  mk(h, bx(0.03, 0.08, 0.065), red, -0.07, 0.09, 0); // mane
  for (const x of [-0.065, 0.065]) for (const z of [-0.02, 0.02]) mk(h, bx(0.025, 0.08, 0.02), wood, x, -0.07, z);
  for (const z of [-0.035, 0.035]) {
    const r = mk(h, tor(0.26, 0.01, 0.8, 8), blue, 0, 0.16, z);
    r.rotation.z = -Math.PI / 2 - 0.4;
  }
  mk(h, bx(0.04, 0.03, 0.065), blue, 0.1, 0.05, 0); // tail
  return g;
}

/* ================================================================== items: balloons */

const BALLOONS = [
  { kind: 'balao', name: 'balão', icon: '🎈', shape: 'round', color: 0xff3b5c },
  { kind: 'balao-coracao', name: 'balão coração', icon: '💗', shape: 'heart', color: 0xff66b3 },
  { kind: 'balao-estrela', name: 'balão estrela', icon: '🌟', shape: 'star', color: 0xffc61a },
] as const;
type BalloonShape = (typeof BALLOONS)[number]['shape'];

function balloonHead(shape: BalloonShape, color: number, size = 1): THREE.Object3D {
  const m = shiny(color);
  let o: THREE.Mesh;
  if (shape === 'round') {
    o = new THREE.Mesh(sph(0.17, 16, 12), m);
    o.scale.set(size, size * 1.18, size);
  } else if (shape === 'heart') {
    o = new THREE.Mesh(heartPuffy(0.16, 0.06), m);
    o.scale.setScalar(size);
  } else {
    o = new THREE.Mesh(starPuffy(0.2, 0.05), m);
    o.scale.setScalar(size);
  }
  o.castShadow = true;
  return o;
}
/** Balloon on a string; origin = where her hand holds the string; sways gently by itself. */
function buildBalloon(shape: BalloonShape, color: number): THREE.Group {
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  mk(pivot, cy(0.004, 0.004, 1.35, 4), mat(0xf8f9fa), 0, 0.675, 0);
  const knot = mk(pivot, geo('knot', () => new THREE.ConeGeometry(0.025, 0.04, 6)), shiny(color), 0, 1.37, 0);
  knot.rotation.x = Math.PI;
  const head = balloonHead(shape, color);
  head.position.y = 1.37 + (shape === 'round' ? 0.2 : 0.17);
  pivot.add(head);
  const phase = Math.random() * 10;
  head.onBeforeRender = () => {
    const t = performance.now() / 1000 + phase;
    pivot.rotation.z = -0.18 + Math.sin(t * 1.3) * 0.1;
    pivot.rotation.x = Math.sin(t * 0.9) * 0.08;
    head.rotation.y = Math.sin(t * 0.7) * 0.4;
  };
  return g;
}

/* ================================================================== wearables: face paint */

const FACE_R = 0.345;
const FACE_CZ = 0.33; // sphere centre seen from the face anchor
const PAINT_K = 1.25; // shapes a bit bigger than life so they read from the game camera
const flatMats = new Map<number, THREE.MeshStandardMaterial>();
function paint(color: number): THREE.MeshStandardMaterial {
  let m = flatMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: color, emissiveIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2 });
    flatMats.set(color, m);
  }
  return m;
}
/** A flat shape lying on the face sphere at (x, y) (anchor frame), rotated `rot` in its plane. */
function decal(parent: THREE.Object3D, g: THREE.BufferGeometry, color: number, x: number, y: number, sx: number, sy: number, rot = 0, lift = 0.004): THREE.Mesh {
  const zz = Math.sqrt(Math.max(0.001, FACE_R * FACE_R - x * x - y * y));
  const p = V(x, y, FACE_CZ - zz);
  const n = p.clone().sub(V(0, 0, FACE_CZ)).normalize();
  const m = new THREE.Mesh(g, paint(color));
  m.position.copy(p).addScaledVector(n, lift);
  m.lookAt(m.position.clone().add(n));
  m.rotateZ(rot);
  m.scale.set(sx * PAINT_K, sy * PAINT_K, 1);
  parent.add(m);
  return m;
}
const disc = () => geo('disc', () => new THREE.CircleGeometry(1, 14));
const tri = () => geo('tri', () => new THREE.CircleGeometry(1, 3));

function faceButterfly(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const cx = s * 0.17;
    const cy0 = -0.065;
    const [a, b] = s < 0 ? [0xcc5de8, 0xff8fab] : [0x4dabf7, 0x63e6be];
    for (const w of [-1, 1]) {
      decal(g, disc(), a, cx + w * 0.032, cy0 + 0.022, 0.032, 0.026, w * 0.5);
      decal(g, disc(), b, cx + w * 0.026, cy0 - 0.022, 0.022, 0.018, -w * 0.5);
      decal(g, disc(), 0xffffff, cx + w * 0.036, cy0 + 0.026, 0.008, 0.008, 0, 0.006);
    }
    decal(g, disc(), 0x343a40, cx, cy0, 0.007, 0.036, 0, 0.007);
  }
  return g;
}
function faceCat(): THREE.Group {
  const g = new THREE.Group();
  decal(g, tri(), 0x212529, 0, -0.045, 0.03, 0.026, -Math.PI / 2);
  decal(g, disc(), 0xffc9de, 0, -0.04, 0.012, 0.01, 0, 0.007);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = -0.055 - i * 0.022;
      decal(g, disc(), 0x212529, s * 0.18, y + i * 0.004, 0.07, 0.0045, s * (i - 1) * 0.22);
    }
    for (let i = 0; i < 3; i++) decal(g, disc(), 0x212529, s * (0.075 + i * 0.02), -0.075 - (i % 2) * 0.012, 0.006, 0.006, 0, 0.005);
  }
  return g;
}
function faceRainbow(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff3b3b, 0xff922b, 0xffd43b, 0x51cf66, 0x4dabf7, 0x9775fa];
  const ring = (i: number) => geo(`rb${i}`, () => new THREE.RingGeometry(0.075 - i * 0.009 - 0.009, 0.075 - i * 0.009, 18, 1, 0, Math.PI));
  colors.forEach((c, i) => decal(g, ring(i), c, 0.17, -0.07, 1, 1, 0, 0.006));
  for (const dx of [-0.07, 0.07]) {
    decal(g, disc(), 0xffffff, 0.17 + dx, -0.075, 0.022, 0.016, 0, 0.007);
    decal(g, disc(), 0xffffff, 0.17 + dx * 1.25, -0.07, 0.014, 0.012, 0, 0.008);
  }
  decal(g, starFlat(0.05), 0xfcc419, -0.17, -0.06, 1, 1, 0.2, 0.006);
  decal(g, starFlat(0.022), 0xcc5de8, -0.12, 0.08, 1, 1, -0.3, 0.006);
  decal(g, starFlat(0.016), 0x4dabf7, -0.22, 0.03, 1, 1, 0.1, 0.006);
  return g;
}
function faceTiger(): THREE.Group {
  const g = new THREE.Group();
  const orange = 0xff922b;
  for (const s of [-1, 1]) {
    decal(g, disc(), orange, s * 0.2, -0.05, 0.075, 0.06, 0, 0.003);
    for (let i = 0; i < 3; i++) {
      // stripes from the edge of the face pointing inwards
      decal(g, tri(), 0x212529, s * (0.235 - (i === 1 ? 0.01 : 0)), -0.005 - i * 0.042, 0.055, 0.014, s < 0 ? 0 : Math.PI, 0.006);
    }
  }
  decal(g, disc(), orange, 0, 0.17, 0.09, 0.05, 0, 0.003);
  for (const dx of [-0.05, 0, 0.05]) decal(g, tri(), 0x212529, dx, 0.2 - (dx === 0 ? 0 : 0.01), 0.045, 0.011, -Math.PI / 2 + dx * 3, 0.006);
  decal(g, tri(), 0x212529, 0, -0.045, 0.028, 0.024, -Math.PI / 2, 0.006);
  return g;
}
const FACE_DESIGNS = [
  { kind: 'pintura-borboleta', name: 'borboletas', build: faceButterfly },
  { kind: 'pintura-gato', name: 'gatinho', build: faceCat },
  { kind: 'pintura-arcoiris', name: 'arco-íris', build: faceRainbow },
  { kind: 'pintura-tigre', name: 'tigre', build: faceTiger },
] as const;

/* ================================================================== wearables: jewellery */

function necklace(beads: number[], pendant: 'heart' | 'star' | 'none', pendantColor: number, beadR = 0.028): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Group();
  ring.rotation.x = -0.35; // the front (-Z) hangs lower
  g.add(ring);
  const n = 18;
  const R = 0.235;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    mk(ring, sph(beadR, 8, 6), shiny(beads[i % beads.length]), Math.sin(a) * R, 0, Math.cos(a) * R);
  }
  if (pendant !== 'none') {
    const p = new THREE.Mesh(pendant === 'heart' ? heartPuffy(0.04, 0.015) : starPuffy(0.05, 0.012), shiny(pendantColor));
    p.position.set(0, -0.05, -R - 0.02);
    ring.add(p);
  }
  return g;
}
function buildTiara(): THREE.Group {
  const g = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.2, metalness: 0.8, emissive: 0x888888, emissiveIntensity: 0.15 });
  const t = new THREE.Group();
  t.position.y = -0.07;
  t.rotation.x = -0.25;
  g.add(t);
  const band = mk(t, tor(0.29, 0.013, Math.PI, 16), silver);
  band.rotation.x = -Math.PI / 2;
  const peaks = [-0.75, -0.38, 0, 0.38, 0.75];
  peaks.forEach((p, i) => {
    const h = i === 2 ? 0.12 : i % 2 ? 0.08 : 0.06;
    const c = mk(t, geo(`tp${h}`, () => new THREE.ConeGeometry(0.025, h, 6)), silver, Math.sin(p) * 0.29, h / 2, -Math.cos(p) * 0.29);
    mk(t, sph(0.018, 8, 6), shiny([0xff4d8d, 0x4dabf7, 0xcc5de8, 0x4dabf7, 0xff4d8d][i]), c.position.x, h + 0.008, c.position.z);
  });
  const gem = mk(t, geo('gem', () => new THREE.OctahedronGeometry(0.035, 0)), shiny(0xff4d8d), 0, 0.04, -0.3);
  gem.scale.z = 0.5;
  return g;
}
function buildClip(): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Group();
  c.position.set(0.31, -0.08, -0.1);
  c.rotation.set(0, -1.15, 0.35);
  c.scale.setScalar(1.3);
  g.add(c);
  const petal = shiny(0xffffff);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const p = mk(c, sph(0.04, 8, 6), petal, Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0);
    p.scale.set(1, 1, 0.45);
  }
  mk(c, sph(0.03, 8, 6), shiny(0xffd43b), 0, 0, -0.012);
  for (const s of [-1, 1]) {
    const l = mk(c, sph(0.035, 8, 6), shiny(0x51cf66), s * 0.075, -0.06, 0.01);
    l.scale.set(1, 0.45, 0.4);
    l.rotation.z = s * 0.6;
  }
  return g;
}
const JEWELS = [
  { kind: 'colar-arcoiris', name: 'colar arco-íris', slot: 'neck', build: () => necklace([0xff3b3b, 0xff922b, 0xffd43b, 0x51cf66, 0x4dabf7, 0x9775fa], 'heart', 0xff4d8d) },
  { kind: 'tiara', name: 'tiara', slot: 'head', build: buildTiara },
  { kind: 'colar-perolas', name: 'colar de pérolas', slot: 'neck', build: () => necklace([0xfff8f0, 0xf8f0e3], 'star', 0xfcc419, 0.024) },
  { kind: 'gancho-flor', name: 'gancho de flor', slot: 'head', build: buildClip },
] as const;

/* ================================================================== wearables: clothes */

function buildStrawHat(): THREE.Group {
  const g = new THREE.Group();
  const straw = mat(0xf2d27a);
  const brim = mk(g, cy(0.5, 0.5, 0.025, 24), straw, 0, -0.06, 0);
  brim.castShadow = true;
  mk(g, cy(0.27, 0.31, 0.2, 18), straw, 0, 0.05, 0);
  mk(g, cy(0.27, 0.27, 0.02, 18), straw, 0, 0.155, 0);
  mk(g, cy(0.312, 0.312, 0.06, 18, true), mat(0xff4d8d), 0, -0.02, 0);
  // a flower on the band
  const f = new THREE.Group();
  f.position.set(-0.22, 0.0, -0.22);
  f.rotation.y = Math.PI / 4 + Math.PI;
  g.add(f);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    mk(f, sph(0.04, 8, 6), mat(0xffffff), Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0).scale.z = 0.5;
  }
  mk(f, sph(0.03, 8, 6), mat(0xffd43b), 0, 0, -0.015);
  return g;
}
function buildCap(): THREE.Group {
  const g = new THREE.Group();
  const blue = mat(0x1c7ed6);
  const dome = mk(g, geo('capdome', () => new THREE.SphereGeometry(0.37, 18, 8, 0, TAU, 0, Math.PI / 2)), blue, 0, -0.2, 0);
  dome.castShadow = true;
  const brim = mk(g, geo('capbrim', () => new THREE.CylinderGeometry(0.25, 0.25, 0.022, 18, 1, false, Math.PI / 2, Math.PI)), mat(0xfcc419), 0, -0.19, -0.3);
  brim.rotation.x = -0.12;
  brim.scale.set(1.2, 1, 1);
  mk(g, sph(0.035, 8, 6), mat(0xfcc419), 0, 0.17, 0);
  // a star on the front
  const s = mk(g, starFlat(0.07), mat(0xffffff), 0, -0.04, -0.33);
  s.rotation.set(-0.45, Math.PI, 0);
  return g;
}
function buildBeanie(): THREE.Group {
  const g = new THREE.Group();
  const pink = mat(0xf783ac);
  mk(g, geo('beanie', () => new THREE.SphereGeometry(0.365, 18, 8, 0, TAU, 0, Math.PI / 2)), pink, 0, -0.17, 0).castShadow = true;
  mk(g, cy(0.375, 0.375, 0.1, 18), mat(0xffffff), 0, -0.15, 0);
  mk(g, sph(0.09, 10, 8), mat(0xffffff), 0, 0.2, 0);
  for (let i = 0; i < 3; i++) {
    const r = mk(g, tor(0.33 - i * 0.07, 0.012, TAU, 20), mat(0xcc5de8), 0, -0.07 + i * 0.09, 0);
    r.rotation.x = Math.PI / 2;
  }
  return g;
}
function buildCape(): THREE.Group {
  const g = new THREE.Group();
  // open cone segment wrapping her back, from the shoulders down to the knees (purple outside, gold lining)
  const R0 = 0.25;
  const R1 = 0.56;
  const H = 0.82;
  const TOP = 0.34;
  const c = mk(g, geo('cape', () => new THREE.CylinderGeometry(R0, R1, H, 16, 1, true, -1.45, 2.9)), mat(0x9c36b5), 0, TOP - H / 2, -0.2);
  c.castShadow = true;
  const lining = mk(g, geo('capeIn', () => new THREE.CylinderGeometry(R0 - 0.005, R1 - 0.005, H, 16, 1, true, -1.45, 2.9)), new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.7, side: THREE.BackSide }), 0, TOP - H / 2, -0.2);
  lining.castShadow = false;
  const collar = mk(g, tor(0.23, 0.035, Math.PI, 12), mat(0xffd43b), 0, TOP, -0.2);
  collar.rotation.x = Math.PI / 2;
  // gold stars on the back, lying on the cape
  for (const [x, y] of [[0, 0.02], [-0.2, -0.28], [0.2, -0.28]] as const) {
    const r = R0 + ((TOP - y) / H) * (R1 - R0);
    const z = -0.2 + Math.sqrt(r * r - x * x) + 0.008;
    const st = mk(g, starFlat(0.065), mat(0xffd43b, 0.2), x, y, z);
    st.rotation.set(Math.atan((R1 - R0) / H), Math.asin(x / r), 0, "YXZ");
  }
  return g;
}
function buildScarf(): THREE.Group {
  const g = new THREE.Group();
  const r = mat(0xe03131);
  const w = mat(0xffffff);
  const loop = mk(g, geo('scarf', () => new THREE.TorusGeometry(0.22, 0.055, 8, 20)), r, 0, -0.01, 0);
  loop.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const st = mk(g, geo('scarfStripe', () => new THREE.TorusGeometry(0.22, 0.058, 8, 3, 0.16)), w, 0, -0.01, 0);
    st.rotation.set(Math.PI / 2, 0, a);
  }
  // two ends hanging at the front
  for (const [x, len, tilt] of [[0.1, 0.3, 0.12], [0.16, 0.24, -0.1]] as const) {
    const e = new THREE.Group();
    e.position.set(x, -0.04, -0.24);
    e.rotation.z = tilt;
    e.rotation.x = -0.15;
    g.add(e);
    mk(e, bx(0.09, len, 0.03), r, 0, -len / 2, 0);
    mk(e, bx(0.092, 0.03, 0.032), w, 0, -len + 0.05, 0);
    for (const fx of [-0.03, 0, 0.03]) mk(e, bx(0.012, 0.04, 0.012), w, fx, -len - 0.02, 0);
  }
  return g;
}
const CLOTHES = [
  { kind: 'chapeu-palha', name: 'chapéu de palha', slot: 'head', build: buildStrawHat },
  { kind: 'capa', name: 'capa', slot: 'back', build: buildCape },
  { kind: 'bone', name: 'boné', slot: 'head', build: buildCap },
  { kind: 'cachecol', name: 'cachecol', slot: 'neck', build: buildScarf },
  { kind: 'gorro', name: 'gorro', slot: 'head', build: buildBeanie },
] as const;

/* ================================================================== registration */

registerItem('pipocas', { name: 'pipocas', icon: '🍿', build: buildPipocas, edible: true });
registerItem('cachorro', { name: 'cachorro-quente', icon: '🌭', build: buildCachorro, edible: true });
registerItem('vaso', { name: 'vaso de barro', icon: '🏺', build: buildVaso, edible: false });
registerItem('cesto', { name: 'cesto', icon: '🧺', build: buildCesto, edible: false });
registerItem('cavalinho', { name: 'cavalinho de madeira', icon: '🐴', build: buildCavalinho, edible: false });
for (const b of BALLOONS) registerItem(b.kind, { name: b.name, icon: b.icon, build: () => buildBalloon(b.shape, b.color), edible: false });
for (const d of FACE_DESIGNS) registerWearable(d.kind, { name: d.name, slot: 'face', build: d.build });
for (const d of [...JEWELS, ...CLOTHES]) registerWearable(d.kind, { name: d.name, slot: d.slot, build: d.build });

/* ================================================================== 1. pipocas */

registerAttraction('pipocas', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0xe03131, 0xffffff], body: 0xff6b6b, trim: 0xfcc419, back: 0xfff3bf });
  const seller = new Seller(g, ctx.rng, 0.35, -0.3, { cap: 0xe03131, shirt: 0xffffff });
  // popcorn machine on the counter: red frame, glass box, kettle, a heap of popcorn
  const M = new THREE.Group();
  M.position.set(-0.7, COUNTER_TOP + 0.02, COUNTER_Z);
  g.add(M);
  const red = mat(0xe03131);
  box(M, red, 0.7, 0.12, 0.5, 0, 0.06, 0);
  box(M, red, 0.72, 0.08, 0.52, 0, 0.72, 0);
  const roof = mk(M, geo('pcroof', () => new THREE.ConeGeometry(0.45, 0.22, 4)), mat(0xfcc419), 0, 0.87, 0);
  roof.rotation.y = Math.PI / 4;
  for (const [x, z] of [[-0.33, -0.23], [0.33, -0.23], [-0.33, 0.23], [0.33, 0.23]]) mk(M, bx(0.04, 0.6, 0.04), red, x, 0.42, z);
  const glass = new THREE.MeshStandardMaterial({ color: 0xe7f5ff, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
  mk(M, bx(0.64, 0.58, 0.46), glass, 0, 0.42, 0);
  const kettle = new THREE.Group();
  kettle.position.set(0, 0.6, 0);
  M.add(kettle);
  mk(kettle, cy(0.11, 0.08, 0.1, 12), mat(0xadb5bd), 0, 0, 0);
  mk(kettle, cy(0.002, 0.002, 0.12, 4), mat(0x868e96), 0, 0.08, 0);
  // the heap (instanced) and the flying kernels
  const kGeo = sph(0.025, 6, 5);
  const heap = new THREE.InstancedMesh(kGeo, mat(0xfff3bf), 70);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 70; i++) {
    const x = (Math.random() - 0.5) * 0.58;
    const z = (Math.random() - 0.5) * 0.4;
    const y = 0.14 + Math.random() * 0.08 * (1 - Math.abs(x) * 1.5);
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.8 + Math.random() * 0.5);
    dummy.updateMatrix();
    heap.setMatrixAt(i, dummy.matrix);
  }
  M.add(heap);
  const POPS = 12;
  const flying = new THREE.InstancedMesh(kGeo, mat(0xffffff, 0.1), POPS);
  M.add(flying);
  const kern = Array.from({ length: POPS }, () => ({ p: V(0, -1, 0), v: V(), wait: Math.random() * 1.5 }));
  // popcorn tubs on display
  for (const [x, z] of [[0.95, 0.75], [1.15, 0.6], [0.75, 0.6]] as const) {
    const t = buildPipocas();
    t.position.set(x, COUNTER_TOP + 0.13, z);
    g.add(t);
  }
  let popT = 0;
  const thing = sellSpot(ctx, seller, -0.5, 2, top, (done) => handOver(ctx, fx, seller, 'pipocas', buildPipocas, done));
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      const d = ctx.dist();
      seller.update(dt, d);
      kettle.rotation.z = Math.sin(performance.now() / 300) * 0.12;
      for (let i = 0; i < POPS; i++) {
        const k = kern[i];
        if (k.wait > 0) {
          k.wait -= dt;
          if (k.wait <= 0) {
            k.p.set((Math.random() - 0.5) * 0.12, 0.56, (Math.random() - 0.5) * 0.12);
            k.v.set((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8);
            if (d < 12 && popT <= 0) {
              popT = 0.08;
              ctx.noise(0.035, 0.07 * (1 - d / 12), 'bandpass', 1400 + Math.random() * 1800);
            }
          }
          dummy.position.set(0, -10, 0);
        } else {
          k.v.y -= 4.5 * dt;
          k.p.addScaledVector(k.v, dt);
          if (Math.abs(k.p.x) > 0.29) k.v.x = -k.v.x * 0.5;
          if (Math.abs(k.p.z) > 0.2) k.v.z = -k.v.z * 0.5;
          k.p.x = THREE.MathUtils.clamp(k.p.x, -0.29, 0.29);
          k.p.z = THREE.MathUtils.clamp(k.p.z, -0.2, 0.2);
          if (k.p.y < 0.17) k.wait = 0.2 + Math.random() * 1.2;
          dummy.position.copy(k.p);
        }
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        flying.setMatrixAt(i, dummy.matrix);
      }
      flying.instanceMatrix.needsUpdate = true;
      popT -= dt;
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 2. cachorros */

registerAttraction('cachorros', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0xfcc419, 0xe03131], body: 0xffa94d, trim: 0x7048e8, back: 0xfff9db });
  const seller = new Seller(g, ctx.rng, -0.3, -0.3, { dress: false, cap: 0xffffff, shirt: 0xffffff });
  // grill: dark box with bars, sausages rolling, little smoke puffs
  const G = new THREE.Group();
  G.position.set(0.6, COUNTER_TOP + 0.02, COUNTER_Z - 0.02);
  g.add(G);
  box(G, mat(0x343a40), 0.9, 0.14, 0.45, 0, 0.07, 0);
  const coal = mk(G, bx(0.84, 0.01, 0.4), mat(0xff6b00, 0.6), 0, 0.142, 0);
  coal.receiveShadow = false;
  for (let i = 0; i < 7; i++) mk(G, bx(0.012, 0.012, 0.42), mat(0xadb5bd), -0.39 + i * 0.13, 0.16, 0);
  const sausages: THREE.Mesh[] = [];
  const sGeo = geo('saus2', () => new THREE.CapsuleGeometry(0.035, 0.24, 4, 8));
  for (let i = 0; i < 5; i++) {
    const s = mk(G, sGeo, mat(0xb5462b), -0.32 + i * 0.16, 0.2, 0);
    s.rotation.x = Math.PI / 2;
    sausages.push(s);
  }
  const puffs: { m: THREE.Mesh; t: number; mat: THREE.MeshStandardMaterial }[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.5, depthWrite: false });
    puffs.push({ m: mk(G, sph(0.08, 8, 6), m), t: i / 4, mat: m });
  }
  // buns, ketchup and mustard
  const bunM = mat(0xe8a85c);
  for (let i = 0; i < 4; i++) {
    const b = mk(g, geo('bun2', () => new THREE.CapsuleGeometry(0.05, 0.18, 4, 8)), bunM, -1.05 + (i % 2) * 0.12, COUNTER_TOP + 0.06 + Math.floor(i / 2) * 0.09, COUNTER_Z - 0.05);
    b.rotation.x = Math.PI / 2;
  }
  for (const [x, c] of [[-0.6, 0xe03131], [-0.45, 0xfcc419]] as const) {
    mk(g, cy(0.045, 0.05, 0.2, 10), mat(c), x, COUNTER_TOP + 0.1, COUNTER_Z + 0.1);
    mk(g, geo('nozzle', () => new THREE.ConeGeometry(0.03, 0.08, 8)), mat(c), x, COUNTER_TOP + 0.24, COUNTER_Z + 0.1);
  }
  const dog = buildCachorro();
  dog.position.set(-0.3, COUNTER_TOP + 0.03, COUNTER_Z + 0.15);
  dog.scale.setScalar(1.3);
  g.add(dog);
  let time = 0;
  let sizzle = 0;
  const thing = sellSpot(ctx, seller, 0.5, 2, top, (done) => handOver(ctx, fx, seller, 'cachorro', buildCachorro, done));
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      time += dt;
      const d = ctx.dist();
      seller.update(dt, d);
      sausages.forEach((s, i) => {
        s.rotation.y = time * (0.8 + i * 0.1);
        s.position.x = -0.32 + i * 0.16 + Math.sin(time * 1.3 + i) * 0.01;
      });
      for (const p of puffs) {
        p.t = (p.t + dt * 0.45) % 1;
        p.m.position.set(-0.3 + ((puffs.indexOf(p) * 0.21) % 0.6) + Math.sin(p.t * 6) * 0.05, 0.25 + p.t * 0.9, 0);
        p.m.scale.setScalar(0.6 + p.t * 1.4);
        p.mat.opacity = 0.45 * (1 - p.t);
      }
      sizzle -= dt;
      if (d < 10 && sizzle <= 0) {
        sizzle = 0.35;
        ctx.noise(0.5, 0.025 * (1 - d / 10), 'highpass', 3500 + Math.random() * 2500);
      }
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 3. pinturas faciais */

registerAttraction('pinturas', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0xcc5de8, 0xffffff], body: 0x9775fa, trim: 0x63e6be, back: 0xf3f0ff });
  const seller = new Seller(g, ctx.rng, -0.35, -0.35, { dress: true, shirt: 0x63e6be });
  // the painter holds a brush
  const brush = new THREE.Group();
  brush.position.set(0, -0.72, 0);
  brush.rotation.x = -Math.PI / 2;
  seller.folk.armR.add(brush);
  mk(brush, cy(0.012, 0.012, 0.3, 6), mat(0xc08552), 0, 0.12, 0);
  const tip = mk(brush, geo('btip', () => new THREE.ConeGeometry(0.02, 0.06, 6)), mat(0xff4d8d), 0, 0.3, 0);
  // the customers' stool and the board with the four designs on display faces
  const stool = new THREE.Group();
  stool.position.set(0.85, 0, 0.0);
  g.add(stool);
  cyl(stool, mat(0xff8787), 0.22, 0.06, 0, 0.55, 0);
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) mk(stool, cy(0.02, 0.025, 0.55, 6), mat(0x495057), x, 0.27, z);
  const skins = [SKINS[4], SKINS[1], SKINS[0], SKINS[2]];
  FACE_DESIGNS.forEach((d, i) => {
    const h = mannequin(g, -1.05 + i * 0.7, 2.0, -1.03, 0.17, skins[i], 0);
    dressHead(h, 0.17, 'face', d.build());
    const frame = mk(g, tor(0.21, 0.025, TAU, 20), mat(0xfcc419), -1.05 + i * 0.7, 2.0, -1.13);
    frame.rotation.y = 0;
  });
  // paint pots and a jar of brushes on the counter
  const pots = [0xff3b3b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8, 0x212529];
  pots.forEach((c, i) => {
    mk(g, cy(0.06, 0.06, 0.06, 10), mat(0xffffff), -1.1 + (i % 3) * 0.16, COUNTER_TOP + 0.04, COUNTER_Z + (i < 3 ? 0.12 : -0.08));
    mk(g, cy(0.052, 0.052, 0.01, 10), mat(c, 0.15), -1.1 + (i % 3) * 0.16, COUNTER_TOP + 0.075, COUNTER_Z + (i < 3 ? 0.12 : -0.08));
  });
  mk(g, cy(0.06, 0.05, 0.14, 10), mat(0x74c0fc), 0.35, COUNTER_TOP + 0.08, COUNTER_Z);
  for (let i = 0; i < 3; i++) {
    const b = mk(g, cy(0.01, 0.01, 0.28, 5), mat(0xc08552), 0.35 + (i - 1) * 0.02, COUNTER_TOP + 0.2, COUNTER_Z);
    b.rotation.z = (i - 1) * 0.25;
  }
  const next = rotation(ctx, FACE_DESIGNS.map((d) => ({ kind: d.kind, slot: 'face' as WearSlot })));
  let painting = 0;
  const thing = sellSpot(ctx, seller, 0, 2, top, (done) => {
    const d = next();
    fx.tween(0.5, 0, undefined, () => {
      painting = 2.4;
      seller.reachTarget = 1;
    });
    fx.tween(2.9, 0, undefined, () => {
      painting = 0;
      seller.reachTarget = 0;
      ctx.wear('face', d.kind);
      happyChime(ctx);
      fx.burst(herFace(ctx), 14, [0xffffff, 0xffd43b, 0xff8fab, 0xb197fc]);
      ctx.speak(['Ficou espetacular!']);
      done();
    });
  });
  let strokeT = 0;
  seller.pose = (f, t) => {
    if (painting > 0) {
      f.armR.rotation.x = 1.25 + Math.sin(t * 9) * 0.12;
      f.armR.rotation.z = Math.sin(t * 6) * 0.25;
    }
  };
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      seller.update(dt, ctx.dist());
      tip.material = mat(pots[Math.floor(performance.now() / 700) % 5]);
      if (painting > 0) {
        painting -= dt;
        strokeT -= dt;
        if (strokeT <= 0) {
          strokeT = 0.3;
          ctx.noise(0.18, 0.05, 'bandpass', 2200 + Math.random() * 800);
          fx.burst(herFace(ctx), 2, [0xffd43b, 0xff8fab, 0x74c0fc, 0xffffff], 0.6);
        }
      }
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 4. bijuteria */

registerAttraction('bijuteria', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0xff4d8d, 0xfff0f6], body: 0xf783ac, trim: 0xffd43b, back: 0x5f3dc4 });
  const seller = new Seller(g, ctx.rng, 0, -0.35, { dress: true, shirt: 0xcc5de8 });
  // necklaces hanging on the (velvet) back panel
  JEWELS.filter((j) => j.slot === 'neck').forEach((j, i) => {
    for (const k of [0, 1]) {
      const n = j.build();
      n.rotation.x = Math.PI / 2 - 0.1;
      n.scale.setScalar(0.85);
      n.position.set(-0.95 + (i * 2 + k) * 0.63, 1.85, -1.08);
      g.add(n);
    }
  });
  // a velvet bust wearing a necklace, the tiara on a cushion, bracelets, a clip
  const bust = new THREE.Group();
  bust.position.set(-0.85, COUNTER_TOP, COUNTER_Z - 0.05);
  bust.rotation.y = Math.PI;
  g.add(bust);
  const velvet = mat(0x3b2a6b);
  mk(bust, cy(0.13, 0.2, 0.3, 12), velvet, 0, 0.15, 0);
  mk(bust, cy(0.07, 0.08, 0.15, 10), velvet, 0, 0.36, 0);
  const n0 = JEWELS[0].build();
  n0.scale.setScalar(0.55);
  n0.position.y = 0.32;
  bust.add(n0);
  const cushion = mk(g, bx(0.36, 0.08, 0.3), mat(0xe64980), 0.75, COUNTER_TOP + 0.04, COUNTER_Z);
  cushion.castShadow = true;
  const tiara = buildTiara();
  tiara.scale.setScalar(0.7);
  tiara.position.set(0.75, COUNTER_TOP + 0.13, COUNTER_Z + 0.02);
  tiara.rotation.y = Math.PI;
  g.add(tiara);
  const bc = [0xff922b, 0x51cf66, 0x4dabf7, 0xcc5de8];
  bc.forEach((c, i) => {
    const b = mk(g, tor(0.06, 0.015, TAU, 14), shiny(c), -0.3 + i * 0.14, COUNTER_TOP + 0.02, COUNTER_Z + 0.15);
    b.rotation.x = Math.PI / 2;
  });
  const clip = buildClip();
  clip.position.set(0.25, COUNTER_TOP + 0.12, COUNTER_Z + 0.05);
  clip.rotation.y = Math.PI;
  g.add(clip);
  // a glint that travels over the jewels
  const glint = new THREE.Mesh(geo('glint', () => new THREE.OctahedronGeometry(0.03, 0)), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.scale.set(1, 2.2, 1);
  g.add(glint);
  const glintSpots = [V(0.75, COUNTER_TOP + 0.25, COUNTER_Z + 0.05), V(-0.85, COUNTER_TOP + 0.35, COUNTER_Z - 0.2), V(-0.32, 1.7, -1.0), V(0.95, 1.7, -1.0)];
  let time = 0;
  const next = rotation(ctx, JEWELS);
  const thing = sellSpot(ctx, seller, 0.5, 3, top, (done) => {
    const d = next();
    dressUp(ctx, fx, seller, d.slot, d.kind, done);
  });
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      time += dt;
      seller.update(dt, ctx.dist());
      const i = Math.floor(time / 1.2) % glintSpots.length;
      const k = (time / 1.2) % 1;
      glint.position.copy(glintSpots[i]);
      glint.scale.setScalar(Math.sin(k * Math.PI) * 1.2);
      glint.scale.y *= 2.2;
      glint.rotation.z = k * 2;
      tiara.rotation.y = Math.PI + Math.sin(time * 0.8) * 0.4;
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 5. artesanato */

registerAttraction('artesanato', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0x2f9e44, 0xfff3bf], body: 0xc08552, trim: 0x8b5e34, back: 0xffe8cc });
  const seller = new Seller(g, ctx.rng, 0.4, -0.35);
  // two shelves on the back with pots and toys
  const wood = mat(0x8b5e34);
  for (const y of [1.45, 1.95]) box(g, wood, 2.6, 0.05, 0.3, 0, y, -1.0);
  const potColors = [0xc8643b, 0xa64b2a, 0xe8590c];
  for (let i = 0; i < 6; i++) {
    const p = buildVaso();
    (p.children[0] as THREE.Mesh).material = mat(potColors[i % 3]);
    p.scale.setScalar(i % 2 ? 1.3 : 1.0);
    p.position.set(-1.1 + i * 0.44, 1.48 + 0.13 * p.scale.y, -1.0);
    g.add(p);
  }
  for (let i = 0; i < 4; i++) {
    const h = buildCavalinho();
    h.position.set(-0.9 + i * 0.6, 2.1, -1.0);
    h.rotation.y = i % 2 ? Math.PI / 2 : -Math.PI / 2;
    g.add(h);
  }
  // baskets and a horse on the counter
  for (const [x, s] of [[-1.0, 1.2], [-0.62, 1.0]] as const) {
    const b = buildCesto();
    b.scale.setScalar(s);
    b.position.set(x, COUNTER_TOP + 0.31 * s, COUNTER_Z);
    g.add(b);
  }
  const horse = buildCavalinho();
  horse.scale.setScalar(1.4);
  horse.position.set(0.9, COUNTER_TOP + 0.29, COUNTER_Z);
  g.add(horse);
  const big = buildVaso();
  big.scale.setScalar(1.6);
  big.position.set(0.45, COUNTER_TOP + 0.2, COUNTER_Z + 0.05);
  g.add(big);
  let time = 0;
  const CRAFTS = [
    { kind: 'vaso', build: buildVaso },
    { kind: 'cavalinho', build: buildCavalinho },
    { kind: 'cesto', build: buildCesto },
  ];
  let ci = Math.floor(ctx.rng() * CRAFTS.length);
  const thing = sellSpot(ctx, seller, -0.4, 3, top, (done) => {
    const c = CRAFTS[ci++ % CRAFTS.length];
    handOver(ctx, fx, seller, c.kind, c.build, done);
  });
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      time += dt;
      seller.update(dt, ctx.dist());
      horse.rotation.z = Math.sin(time * 2.5) * 0.15; // the rocking horse rocks
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 6. roupa */

registerAttraction('roupa', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  const top = buildStand(ctx, { awning: [0x1c7ed6, 0xffffff], body: 0x74c0fc, trim: 0xff922b, back: 0xe7f5ff });
  const seller = new Seller(g, ctx.rng, -0.4, -0.35);
  // a rail with scarves and a cape on hangers
  const metal = mat(0xadb5bd);
  const rail = mk(g, cy(0.02, 0.02, 2.5, 6), metal, 0, 2.15, -0.95);
  rail.rotation.z = Math.PI / 2;
  const cloth = [0xe03131, 0xfcc419, 0x51cf66, 0xcc5de8, 0x4dabf7, 0xff922b];
  cloth.forEach((c, i) => {
    const x = -1.1 + i * 0.44;
    const hook = mk(g, tor(0.04, 0.008, Math.PI * 1.5, 8), metal, x, 2.18, -0.95);
    hook.rotation.y = Math.PI / 2;
    const hanger = mk(g, bx(0.32, 0.02, 0.02), mat(0x8b5e34), x, 2.08, -0.95);
    hanger.castShadow = false;
    if (i === 3) {
      // a small cape
      const cp = mk(g, geo('capeD', () => new THREE.CylinderGeometry(0.15, 0.3, 0.75, 10, 1, true, -1.3, 2.6)), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }), x, 1.7, -1.05);
      cp.rotation.y = Math.PI;
    } else {
      box(g, mat(c), 0.16, 0.65, 0.03, x - 0.04, 1.75, -0.95);
      box(g, mat(c), 0.16, 0.55, 0.03, x + 0.06, 1.8, -0.93);
      box(g, mat(0xffffff), 0.165, 0.04, 0.035, x - 0.04, 1.47, -0.95);
    }
  });
  // three mannequin heads on the counter wearing the hats
  const heads = CLOTHES.filter((c) => c.slot === 'head');
  heads.forEach((c, i) => {
    const h = mannequin(g, -1.05 + i * 0.55, COUNTER_TOP + 0.48, COUNTER_Z, 0.15, SKINS[[4, 0, 1][i]], 0.3);
    dressHead(h, 0.15, 'head', c.build());
  });
  const neckM = mannequin(g, 0.95, COUNTER_TOP + 0.48, COUNTER_Z, 0.15, SKINS[3], 0.3);
  dressHead(neckM, 0.15, 'neck', buildScarf());
  let time = 0;
  const next = rotation(ctx, CLOTHES);
  const thing = sellSpot(ctx, seller, 0.4, 3, top, (done) => {
    const d = next();
    dressUp(ctx, fx, seller, d.slot, d.kind, done);
  });
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      time += dt;
      seller.update(dt, ctx.dist());
      rail.rotation.x = Math.sin(time * 0.8) * 0.01;
    },
    dispose: () => fx.dispose(),
  };
});

/* ================================================================== 7. balões */

registerAttraction('baloes', (ctx) => {
  const fx = new Fx(ctx.scene);
  const g = ctx.group;
  // a little cart with a striped umbrella and a helium tank, the seller in front of it
  const cart = new THREE.Group();
  cart.position.set(0, 0, -1.4);
  g.add(cart);
  box(cart, mat(0x4dabf7), 2.0, 0.8, 0.9, 0, 0.6, 0);
  box(cart, mat(0xffffff), 2.06, 0.08, 0.96, 0, 1.02, 0);
  box(cart, mat(0xfcc419), 2.02, 0.12, 0.92, 0, 0.3, 0);
  for (const x of [-0.7, 0.7]) {
    const w = mk(cart, cy(0.22, 0.22, 0.08, 16), mat(0x343a40), x, 0.22, 0.47);
    w.rotation.x = Math.PI / 2;
    w.castShadow = true;
  }
  cyl(cart, mat(0xadb5bd), 0.035, 2.3, 0.85, 2.2, -0.3);
  const umb = new THREE.Group();
  umb.position.set(0.85, 3.25, -0.3);
  cart.add(umb);
  for (let i = 0; i < 8; i++) {
    const seg = mk(umb, geo('umb', () => new THREE.ConeGeometry(1.1, 0.5, 8, 1, true, 0, TAU / 8)), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xff4d8d, side: THREE.DoubleSide, roughness: 0.7 }));
    seg.rotation.y = (i / 8) * TAU;
    seg.castShadow = true;
  }
  const tank = mk(cart, cy(0.16, 0.16, 0.7, 12), mat(0x9ad7ff), -0.6, 1.4, -0.1);
  tank.castShadow = true;
  mk(cart, sph(0.16, 10, 8), mat(0x9ad7ff), -0.6, 1.75, -0.1);
  mk(cart, cy(0.03, 0.03, 0.12, 6), mat(0x868e96), -0.6, 1.95, -0.1);
  ctx.solid(-1.1, 1.1, -1.95, -0.85, 1.2);
  // a few balloons tied to the cart
  const tied: THREE.Group[] = [];
  for (const [x, i] of [[-0.95, 0], [0.95, 1], [-0.25, 2]] as const) {
    const b = BALLOONS[i];
    const bl = buildBalloon(b.shape, [0x51cf66, 0xcc5de8, 0x4dabf7][i]);
    bl.position.set(x, 1.05, -1.4 + 0.3);
    bl.scale.setScalar(1.3);
    g.add(bl);
    tied.push(bl);
  }

  const seller = new Seller(g, ctx.rng, 0, 0.2, { dress: false, shirt: 0xff922b, cap: 0xcc5de8 });
  ctx.solid(-0.4, 0.4, -0.15, 0.6, 2.2);
  // the bunch: held up in the seller's left hand
  seller.pose = (f) => {
    f.armL.rotation.set(0, 0, -2.55);
  };
  seller.folk.armL.rotation.set(0, 0, -2.55);
  g.updateMatrixWorld(true);
  const handW = seller.folk.armL.localToWorld(V(0, -0.72, 0));
  const handL = g.worldToLocal(handW.clone());
  const bunch = new THREE.Group();
  bunch.position.copy(handL);
  g.add(bunch);
  const colors = [0xff3b5c, 0xffc61a, 0x4dabf7, 0x51cf66, 0xcc5de8, 0xff922b, 0xff66b3, 0x20c997, 0xffffff, 0x748ffc, 0xff3b5c, 0xffc61a, 0xff66b3];
  const shapes: BalloonShape[] = ['round', 'heart', 'round', 'star', 'round', 'heart', 'round', 'star', 'round', 'heart', 'round', 'round', 'star'];
  const linePts: number[] = [];
  const heads: { o: THREE.Object3D; base: V3; ph: number }[] = [];
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const ring = i < 5 ? 0.3 : 0.62;
    const p = V(Math.cos(a) * ring, 1.25 + (i < 5 ? 0.5 : 0) + (i % 3) * 0.12, Math.sin(a) * ring * 0.8);
    const o = balloonHead(shapes[i], colors[i], 1.15);
    o.position.copy(p);
    bunch.add(o);
    heads.push({ o, base: p.clone(), ph: i * 1.7 });
    linePts.push(0, 0, 0, p.x, p.y - 0.18, p.z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  bunch.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf8f9fa })));
  let time = 0;
  let bi = Math.floor(ctx.rng() * BALLOONS.length);
  const payTo = V(-0.4, 1.6, 0.6);
  const thing: Interactable = (() => {
    let busy = false;
    return {
      object: g,
      position: ctx.at(0, 2.0),
      radius: 1.2,
      requiresClick: true,
      interact() {
        if (busy || ctx.game.isPaused() || ctx.game.isDriving()) return;
        if (!ctx.pay(1, g.localToWorld(payTo.clone()))) {
          seller.play('no');
          return;
        }
        busy = true;
        seller.play('yes');
        const b = BALLOONS[bi++ % BALLOONS.length];
        ctx.tone(660, 0.1, 0.12, 'sine', 0.04);
        ctx.tone(990, 0.2, 0.18, 'sine', 0.04);
        handOver(ctx, fx, seller, b.kind, () => buildBalloon(b.shape, b.color), () => (busy = false));
      },
    };
  })();
  return {
    things: [thing],
    update(dt) {
      fx.update(dt);
      time += dt;
      seller.update(dt, ctx.dist());
      bunch.rotation.z = Math.sin(time * 0.9) * 0.08;
      bunch.rotation.x = Math.sin(time * 0.7 + 1) * 0.06;
      for (const h of heads) {
        h.o.position.set(h.base.x + Math.sin(time * 1.1 + h.ph) * 0.03, h.base.y + Math.sin(time * 1.5 + h.ph) * 0.04, h.base.z);
        h.o.rotation.y = Math.sin(time * 0.6 + h.ph) * 0.5;
      }
      tied.forEach((t, i) => (t.rotation.y = Math.sin(time * 0.5 + i) * 0.3));
    },
    dispose: () => fx.dispose(),
  };
});
