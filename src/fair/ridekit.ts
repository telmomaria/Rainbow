import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { audioContext } from '../audio';
import type { SwingSeat } from '../props';
import { box, buildFolk, cyl, ball, HAIRS, mat, PANTS, pick, SKINS, SHIRTS, type Folk } from '../venue';
import type { Interactable } from '../world';
import type { FairCtx } from './types';

/** Shared bits of the fair rides: the operator at the entrance, the paid seat wrapper, sounds. */

export const RIDE_PRICE = 2;

export type Pose = ReturnType<SwingSeat['pose']>;

/** World heading of an object's local -Z (the game's "forward"). */
const _d = new THREE.Vector3();
export function worldHeading(o: THREE.Object3D): number {
  o.getWorldDirection(_d); // world +Z of the object
  return Math.atan2(_d.x, _d.z);
}
/** Pitch of an object's local -Z (nose up = positive), the `tilt` main.ts applies to her. */
export function worldPitch(o: THREE.Object3D): number {
  o.getWorldDirection(_d);
  return Math.asin(THREE.MathUtils.clamp(-_d.y, -1, 1));
}

/** Loudness 0..1 by distance from her (riding = full). */
export function near(ctx: FairCtx, max = 30): number {
  return Math.max(0, 1 - ctx.dist() / max);
}

/** A pitch sweep (boing, whistle). */
export function sweep(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, start = 0): void {
  const ac = audioContext();
  if (!ac || ac.state !== 'running' || gain <= 0.001) return;
  const t = ac.currentTime + start;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A random friendly person (kids are scaled down by the caller). */
export function randomFolk(rng: () => number = Math.random): Folk {
  const dress = rng() < 0.4;
  return buildFolk({
    shirt: pick(rng, SHIRTS),
    pants: pick(rng, PANTS),
    skin: pick(rng, SKINS),
    hair: pick(rng, HAIRS),
    dress,
    longHair: dress || rng() < 0.3,
  });
}

/** A seated rider (kid size): legs hidden (inside a car / log) or astride (carousel animal). */
export function seatedFolk(parent: THREE.Object3D, seatY: number, astride: boolean, rng: () => number): Folk {
  const f = randomFolk(rng);
  const s = 0.68;
  f.group.scale.setScalar(s);
  if (astride) {
    f.legL.rotation.z = -0.5;
    f.legR.rotation.z = 0.5;
    f.group.position.y = seatY - 0.78 * s;
  } else {
    f.legL.visible = f.legR.visible = false;
    f.group.position.y = seatY - 0.62 * s;
  }
  // hands forward on the bar
  f.armL.rotation.x = f.armR.rotation.x = 0.9;
  f.group.visible = false;
  parent.add(f.group);
  return f;
}

export interface Operator {
  /** World point where the coins fly to (top of the podium). */
  counter: THREE.Vector3;
  react(m: 'yes' | 'no'): void;
  /** Cheering both arms up (while her ride goes round). */
  cheer(on: boolean): void;
  update(dt: number): void;
}

/** The ride's operator, standing behind a little podium with a big lever, facing the path (+Z). */
export function operator(ctx: FairCtx, x: number, z: number, cap: number): Operator {
  const f = buildFolk({ shirt: 0xffffff, pants: 0x364fc7, skin: pick(ctx.rng, SKINS), hair: pick(ctx.rng, HAIRS), cap });
  f.group.position.set(x, 0, z);
  f.group.rotation.y = Math.PI;
  ctx.group.add(f.group);
  box(ctx.group, mat(cap), 0.75, 1.0, 0.45, x, 0.5, z + 0.62);
  box(ctx.group, mat(0xffffff), 0.8, 0.06, 0.5, x, 1.03, z + 0.62);
  const lever = new THREE.Group();
  lever.position.set(x + 0.2, 1.05, z + 0.62);
  ctx.group.add(lever);
  cyl(lever, mat(0xadb5bd), 0.03, 0.4, 0, 0.2, 0);
  ball(lever, mat(0xff4d6d, 0.3), 0.07, 0, 0.42, 0);
  ctx.solid(x - 0.45, x + 0.45, z - 0.35, z + 0.9, 1.2);
  let mood: 'idle' | 'yes' | 'no' = 'idle';
  let t = 0;
  let cheering = false;
  let time = 0;
  return {
    counter: ctx.toWorld(x, 1.1, z + 0.62),
    react(m) {
      mood = m;
      t = m === 'yes' ? 1.6 : 1.3;
      if (m === 'yes') lever.rotation.x = -0.8;
    },
    cheer(on) {
      cheering = on;
    },
    update(dt) {
      time += dt;
      t = Math.max(0, t - dt);
      if (t === 0) mood = 'idle';
      lever.rotation.x *= Math.exp(-1.5 * dt);
      f.head.rotation.y = mood === 'no' ? Math.sin(time * 14) * 0.5 : Math.sin(time * 0.5) * 0.25;
      f.body.position.y = Math.sin(time * 2) * 0.015;
      if (mood === 'yes') {
        f.armR.rotation.z = 2.4 + Math.sin(time * 10) * 0.35;
        f.armL.rotation.z = 0;
      } else if (mood === 'no') {
        f.armR.rotation.z = 0;
        f.armL.rotation.z = 0;
      } else if (cheering) {
        f.armR.rotation.z = 2.7 + Math.sin(time * 6) * 0.2;
        f.armL.rotation.z = -2.7 - Math.sin(time * 6 + 1) * 0.2;
      } else {
        f.armR.rotation.z *= Math.exp(-4 * dt);
        f.armL.rotation.z *= Math.exp(-4 * dt);
      }
    },
  };
}

/** What a ride implements; rideThing() wraps it with paying, refusing and the Interactable plumbing. */
export interface RideImpl {
  /** Tapping any of this walks her to the entrance (stand spot) and boards. */
  object: THREE.Object3D;
  /** While she rides: the clickable part (bumper cars: only the booth, so taps on the rink steer). */
  ridingObject?: THREE.Object3D;
  stand: [number, number];
  off: [number, number];
  radius?: number;
  op: Operator;
  board(p: THREE.Vector3): number;
  pose(i: number): Pose;
  done(): boolean;
  leave(): void;
  steer?(dt: number, throttle: number, turn: number): void;
}

/** Ride state as seen by the attraction (is she on it?). */
export interface RideHandle {
  thing: Interactable;
  riding(): boolean;
}

export function rideThing(ctx: FairCtx, r: RideImpl): RideHandle {
  let riding = false;
  let refused = false;
  let paid = false;
  let takenAt = 0;
  const offW = ctx.at(r.off[0], r.off[1]);
  /** Refused (no coins): she stays exactly where she was standing. */
  const stay = new THREE.Vector3();
  let stayH = 0;
  const seat: SwingSeat = {
    take(p) {
      riding = true;
      takenAt = performance.now();
      if (!paid) {
        refused = true;
        stay.set(p.x, 0, p.z);
        const c = ctx.at(0, 0); // facing the ride
        stayH = Math.atan2(-(c.x - p.x), -(c.z - p.z));
        return 0;
      }
      paid = false;
      refused = false;
      return r.board(p);
    },
    pose(i) {
      if (refused) return { pos: stay.clone(), heading: stayH, tilt: 0, stand: true };
      return r.pose(i);
    },
    done() {
      return refused || r.done();
    },
    leave() {
      if (!refused) r.leave();
      riding = false;
      refused = false;
      paid = false;
    },
    getOff: () => (refused ? stay.clone() : offW.clone()),
  };
  if (r.steer) {
    // Driven rides: main.ts gets her off a driven ride on Space/Enter — and the same Enter keydown that just seated
    // her would reach that handler too. Hide `steer` for a moment after boarding so that Enter only gets her on.
    const drive = (dt: number, th: number, tu: number) => (refused ? undefined : r.steer!(dt, th, tu));
    Object.defineProperty(seat, 'steer', { get: () => (performance.now() - takenAt > 300 ? drive : undefined) });
  }
  const thing: Interactable = {
    get object() {
      return riding && r.ridingObject ? r.ridingObject : r.object;
    },
    position: ctx.at(r.stand[0], r.stand[1]),
    radius: r.radius ?? 1.8,
    requiresClick: true,
    seat,
    interact() {
      if (riding) return; // Enter / taps while already on it never charge again
      paid = ctx.pay(RIDE_PRICE, r.op.counter);
      r.op.react(paid ? 'yes' : 'no');
    },
  };
  return { thing, riding: () => riding && !refused };
}

/**
 * Sampled closed track (roller coaster rails, river channel): arc-length samples of a smooth closed curve.
 */
export class Track {
  readonly n: number;
  readonly length: number;
  readonly pts: THREE.Vector3[] = [];
  readonly tan: THREE.Vector3[] = [];
  readonly side: THREE.Vector3[] = [];
  readonly step: number;
  constructor(points: [number, number, number][], n: number) {
    const curve = new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      'centripetal',
    );
    this.n = n;
    this.length = curve.getLength();
    this.step = this.length / n;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      this.pts.push(curve.getPointAt(u));
      const t = curve.getTangentAt(u).normalize();
      this.tan.push(t);
      this.side.push(new THREE.Vector3().crossVectors(t, up).normalize());
    }
  }
  wrap(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }
  /** Interpolated point and tangent at arc length s. */
  at(s: number, pos: THREE.Vector3, tan?: THREE.Vector3): void {
    const f = this.wrap(s) / this.step;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const k = f - Math.floor(f);
    pos.lerpVectors(this.pts[i], this.pts[j], k);
    if (tan) tan.lerpVectors(this.tan[i], this.tan[j], k).normalize();
  }
  index(s: number): number {
    return Math.floor(this.wrap(s) / this.step) % this.n;
  }
  /** Place an object on the track at s (its -Z along the track, upright), lifted by `lift`. */
  place(o: THREE.Object3D, s: number, lift = 0): void {
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    this.at(s, p, t);
    o.position.copy(p);
    o.position.y += lift;
    orient(o, t);
  }
  /**
   * Strips along the track (closed), each between two offsets [side, up] → one BufferGeometry.
   * v texture coordinate = arc length / vScale.
   */
  strips(pairs: [[number, number], [number, number]][], vScale = 1): THREE.BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3();
    for (const [p0, p1] of pairs) {
      const base = pos.length / 3;
      for (let i = 0; i <= this.n; i++) {
        const k = i % this.n;
        for (const [o, u] of [[p0, 0], [p1, 1]] as const) {
          a.copy(this.pts[k]).addScaledVector(this.side[k], o[0]).addScaledVector(up, o[1]);
          pos.push(a.x, a.y, a.z);
          uv.push(u, (i * this.step) / vScale);
        }
      }
      for (let i = 0; i < this.n; i++) {
        const q = base + i * 2;
        idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Instanced vertical pillars under a track (from the ground up to `top(i)`), rainbow coloured. */
export function pillars(parent: THREE.Object3D, spots: { x: number; z: number; top: number }[], r: number, colors: number[]): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(r, r * 1.2, 1, 8);
  geo.translate(0, 0.5, 0);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), spots.length);
  const mtx = new THREE.Matrix4();
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    mtx.makeScale(1, Math.max(0.05, s.top), 1).setPosition(s.x, 0, s.z);
    m.setMatrixAt(i, mtx);
    m.setColorAt(i, c.setHex(colors[i % colors.length]));
  });
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A ring of chasing bulbs (unlit material, cheap — no lights). */
export class Bulbs {
  readonly mesh: THREE.InstancedMesh;
  private t = 0;
  private step = -1;
  private readonly on = new THREE.Color();
  private readonly off = new THREE.Color();
  constructor(parent: THREE.Object3D, spots: THREE.Vector3[], r: number, color = 0xfff3bf) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial(), spots.length);
    const mtx = new THREE.Matrix4();
    spots.forEach((p, i) => {
      mtx.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, mtx);
    });
    this.on.setHex(color);
    this.off.setHex(color).multiplyScalar(0.45);
    parent.add(this.mesh);
    this.update(0);
  }
  update(dt: number, rate = 5): void {
    this.t += dt * rate;
    const s = Math.floor(this.t);
    if (s === this.step) return;
    this.step = s;
    for (let i = 0; i < this.mesh.count; i++) this.mesh.setColorAt(i, (i + s) % 3 === 0 ? this.off : this.on);
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

const _m = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Turn an object (in its parent's frame) so its -Z points along `dir` and it stays upright. */
export function orient(o: THREE.Object3D, dir: THREE.Vector3): void {
  _m.lookAt(_o.set(0, 0, 0), dir, _up); // +Z = -dir
  o.quaternion.setFromRotationMatrix(_m);
}

/** Little helper: `n` evenly spaced points on a horizontal circle. */
export function circlePts(n: number, r: number, y: number, cx = 0, cz = 0): THREE.Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  });
}

const bakedMats = new Map<string, THREE.MeshStandardMaterial>();
/**
 * Merge the plain coloured meshes directly under `g` into one vertex-coloured mesh (one draw call instead of ~15).
 * Glowing (emissive) and non-standard materials are left as they are.
 */
export function bake(g: THREE.Object3D): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  const done: THREE.Mesh[] = [];
  const c = new THREE.Color();
  for (const o of g.children) {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) continue;
    const m = o.material;
    if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) continue;
    if (m.transparent || m.vertexColors || m.side !== THREE.FrontSide) continue;
    o.updateMatrix();
    let geo = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrix);
    if (!geo.index) continue;
    geo = new THREE.BufferGeometry()
      .setIndex(geo.index)
      .setAttribute('position', geo.getAttribute('position'))
      .setAttribute('normal', geo.getAttribute('normal'));
    c.copy(m.color);
    const n = geo.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
    done.push(o);
  }
  if (parts.length < 2) return null;
  const merged = mergeGeometries(parts);
  if (!merged) return null;
  for (const o of done) g.remove(o);
  let mt = bakedMats.get('v');
  if (!mt) bakedMats.set('v', (mt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 })));
  const mesh = new THREE.Mesh(merged, mt);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
