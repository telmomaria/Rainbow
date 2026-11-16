import * as THREE from 'three';
import { ball, box, buildFolk, cyl, mat, pick, HAIRS, PANTS, SHIRTS, SKINS, type Folk } from '../venue';
import { PERSON_BODY_HALF, type Interactable } from '../world';
import type { FolkCtx } from './types';

export { PERSON_CLEAR, PERSON_BODY_HALF, PERSON_PUSH } from '../world';

/**
 * Building blocks shared by the characters: a person with simple moods (wave, hop, nod, talk, bow…), costume
 * pieces, and the two kinds of things she can use (touch = walk up to it; click = tap it / Enter beside it).
 * Meshes: use box / cyl / ball / mat from venue.ts (re-exported here) or plain THREE.
 */
export { ball, box, cyl, mat, pick, HAIRS, PANTS, SHIRTS, SKINS };
export type { Folk };

export interface Look {
  shirt?: number;
  pants?: number;
  skin?: number;
  hair?: number;
  dress?: boolean;
  longHair?: boolean;
  cap?: number;
}

/**
 * A friendly person on the stage. Heights: feet y 0, hands ≈ 0.95 (arms down), shoulders 1.55, head centre 1.95
 * (radius 0.3), top of the head ≈ 2.27. `folk.head` / `folk.armL` / `folk.armR` / `folk.body` are groups: add
 * hats to `head` (y = 0 is the head centre), tools to an arm (the hand is at y ≈ -0.62 of the arm group).
 */
export class Puppet {
  readonly folk: Folk;
  /** The whole person (move / turn this). */
  readonly group: THREE.Group;
  private time = Math.random() * 10;
  private mood: 'idle' | 'wave' | 'hop' | 'nod' | 'shake' | 'talk' | 'bow' | 'cheer' | 'work' = 'idle';
  private t = 0;
  private dur = 0;
  private faceY: number;
  private wantY: number;
  /** While 'work': arms hammer / stir / massage (set by `work()`). */
  private workKind: 'hammer' | 'stir' | 'reach' | 'massage' = 'hammer';

  /** `face` = local heading (0 = looks at local -Z, π = looks at the front). */
  constructor(ctx: FolkCtx, look: Look, lx: number, lz: number, face = Math.PI) {
    const rng = ctx.rng;
    this.folk = buildFolk({
      shirt: look.shirt ?? pick(rng, SHIRTS),
      pants: look.pants ?? pick(rng, PANTS),
      skin: look.skin ?? pick(rng, SKINS),
      hair: look.hair ?? pick(rng, HAIRS),
      dress: look.dress,
      longHair: look.longHair ?? look.dress,
      cap: look.cap,
    });
    this.group = this.folk.group;
    this.group.position.set(lx, 0, lz);
    this.group.rotation.y = face;
    this.faceY = this.wantY = face;
    ctx.root.add(this.group);
    // Solid body so she cannot walk through them (arrow keys / click-to-walk).
    const h = PERSON_BODY_HALF;
    ctx.block(lx - h, lx + h, lz - h, lz + h, 1.9);
  }

  /** World position of the person (live). */
  world(): THREE.Vector3 {
    return this.group.getWorldPosition(new THREE.Vector3());
  }
  /** World position of the right hand (roughly), e.g. where something is handed over from. */
  hand(): THREE.Vector3 {
    return this.folk.armR.localToWorld(new THREE.Vector3(0, -0.62, 0));
  }
  get busy(): boolean {
    return this.mood !== 'idle';
  }

  private play(m: Puppet['mood'], dur: number): void {
    this.mood = m;
    this.t = 0;
    this.dur = dur;
  }
  /** Waves the right arm. */
  wave(sec = 1.6): void {
    this.play('wave', sec);
  }
  /** Little happy hops, both arms up. */
  hop(sec = 1.2): void {
    this.play('hop', sec);
  }
  /** Yes / no with the head. */
  nod(sec = 1.1): void {
    this.play('nod', sec);
  }
  shake(sec = 1.3): void {
    this.play('shake', sec);
  }
  /** Talking: the head bobs and a hand moves, for `sec` seconds. */
  talk(sec = 2.5): void {
    this.play('talk', sec);
  }
  /** A deep bow. */
  bow(sec = 1.6): void {
    this.play('bow', sec);
  }
  /** Both arms up, swaying (applause, victory). */
  cheer(sec = 1.8): void {
    this.play('cheer', sec);
  }
  /** Working with the arms: 'hammer' (up-down), 'stir' (circles), 'reach' (arm forward) or 'massage' (both hands kneading). */
  work(kind: 'hammer' | 'stir' | 'reach' | 'massage', sec = 2): void {
    this.workKind = kind;
    this.play('work', sec);
  }
  stop(): void {
    this.mood = 'idle';
  }

  /** Turn (smoothly) to look at a world point; null = back to the default facing. */
  lookAt(p: THREE.Vector3 | null): void {
    if (!p) {
      this.wantY = this.faceY;
      return;
    }
    const me = this.world();
    const parentY = this.group.parent ? worldYaw(this.group.parent) : 0;
    this.wantY = Math.atan2(p.x - me.x, p.z - me.z) + Math.PI - parentY;
  }
  /** Change the default facing (local heading). */
  face(a: number): void {
    this.faceY = this.wantY = a;
  }

  update(dt: number): void {
    this.time += dt;
    this.t += dt;
    const f = this.folk;
    let d = this.wantY - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, dt * 6);
    const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 1;
    const ease = Math.sin(Math.min(1, k) * Math.PI); // 0 → 1 → 0 over the move
    // rest pose
    let armR = 0;
    let armL = 0;
    let armRx = 0;
    let armLx = 0;
    let headX = 0;
    let headY = 0;
    let bodyX = 0;
    let y = 0;
    const m = this.mood;
    if (m === 'wave') armR = 2.4 * Math.min(1, ease * 3) + Math.sin(this.t * 10) * 0.35 * Math.min(1, ease * 3);
    else if (m === 'hop') {
      y = Math.abs(Math.sin(this.t * 9)) * 0.3 * Math.min(1, ease * 3);
      armR = 2.6 * Math.min(1, ease * 3);
      armL = -2.6 * Math.min(1, ease * 3);
    } else if (m === 'nod') headX = Math.sin(this.t * 11) * 0.32 * (1 - k);
    else if (m === 'shake') headY = Math.sin(this.t * 11) * 0.55 * (1 - k);
    else if (m === 'talk') {
      headX = Math.sin(this.t * 7) * 0.1;
      armRx = -0.9 * Math.min(1, ease * 4) + Math.sin(this.t * 5) * 0.2;
    } else if (m === 'bow') {
      bodyX = -0.7 * Math.min(1, ease * 2);
      headX = -0.3 * Math.min(1, ease * 2);
    } else if (m === 'cheer') {
      armR = 2.7 + Math.sin(this.t * 8) * 0.3;
      armL = -2.7 - Math.sin(this.t * 8) * 0.3;
      y = Math.abs(Math.sin(this.t * 6)) * 0.08;
    } else if (m === 'work') {
      if (this.workKind === 'hammer') armRx = -1.2 - Math.abs(Math.sin(this.t * 9)) * 0.9;
      else if (this.workKind === 'stir') {
        armRx = -1.1 + Math.sin(this.t * 6) * 0.25;
        armR = Math.cos(this.t * 6) * 0.25;
      } else if (this.workKind === 'massage') {
        // lean in, both hands press down on her back (readable kneading, not arms in the air)
        const pump = Math.abs(Math.sin(this.t * 5.2));
        armRx = -1.05 - pump * 0.4;
        armLx = -1.05 - Math.abs(Math.sin(this.t * 5.2 + 1.05)) * 0.4;
        armR = 0.55 + Math.sin(this.t * 3.5) * 0.15;
        armL = -0.55 - Math.sin(this.t * 3.5 + 0.5) * 0.15;
        bodyX = -0.45 - pump * 0.1;
      } else armRx = -1.4 * Math.min(1, ease * 3);
    }
    if (m !== 'idle' && this.t >= this.dur) this.mood = 'idle';
    const s = Math.min(1, dt * 14);
    f.armR.rotation.z += (armR - f.armR.rotation.z) * s;
    f.armL.rotation.z += (armL - f.armL.rotation.z) * s;
    f.armR.rotation.x += (armRx - f.armR.rotation.x) * s;
    f.armL.rotation.x += (armLx - f.armL.rotation.x) * s;
    f.head.rotation.x += (headX - f.head.rotation.x) * s;
    f.head.rotation.y += (headY - f.head.rotation.y) * s;
    f.body.rotation.x += (bodyX - f.body.rotation.x) * s;
    f.group.position.y = y;
    f.body.position.y = Math.sin(this.time * 1.7) * 0.012; // breathing
  }
}

function worldYaw(o: THREE.Object3D): number {
  const q = o.getWorldQuaternion(new THREE.Quaternion());
  return new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
}

/* ------------------------------------------------------------------ costume pieces (add to folk.head / folk.body) */

/** Pointed hat (elf, wizard, fairy…): add to `folk.head`. */
export function pointedHat(head: THREE.Object3D, color: number, height = 0.6, brim = false): THREE.Mesh {
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.29, height, 16), mat(color));
  hat.position.y = 0.2 + height / 2;
  hat.castShadow = true;
  head.add(hat);
  if (brim) cyl(head, mat(color), 0.48, 0.04, 0, 0.22, 0);
  return hat;
}

/** Crown with five points (king, queen): add to `folk.head`. */
export function crown(head: THREE.Object3D, color = 0xffd34d): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.15 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 18, 1, true), m);
  m.side = THREE.DoubleSide;
  band.position.y = 0.3;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), m);
    p.position.set(Math.sin(a) * 0.27, 0.44, Math.cos(a) * 0.27);
    g.add(p);
  }
  head.add(g);
  return g;
}

/** Tall white chef's hat: add to `folk.head`. */
export function chefHat(head: THREE.Object3D): void {
  cyl(head, mat(0xffffff), 0.24, 0.3, 0, 0.36, 0);
  ball(head, mat(0xffffff), 0.3, 0, 0.56, 0);
}

/** Hard hat / helmet (builder, fire fighter, astronaut without visor…): add to `folk.head`. */
export function helmet(head: THREE.Object3D, color: number, brim = true): void {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  dome.position.y = 0.05;
  dome.castShadow = true;
  head.add(dome);
  if (brim) cyl(head, mat(color), 0.4, 0.04, 0, 0.07, 0);
}

/** A cape hanging from the shoulders: add to `folk.body`. */
export function cape(body: THREE.Object3D, color: number, length = 1.1): THREE.Mesh {
  const c = box(body, mat(color), 0.78, length, 0.06, 0, 1.6 - length / 2, 0.3);
  c.rotation.x = 0.12;
  return c;
}

/** An apron over the clothes: add to `folk.body`. */
export function apron(body: THREE.Object3D, color = 0xffffff): void {
  box(body, mat(color), 0.5, 0.75, 0.05, 0, 1.1, -0.34);
}

/** A beard under the face: add to `folk.head`. */
export function beard(head: THREE.Object3D, color = 0xf1f3f5, length = 0.35): void {
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.2, length, 10), mat(color));
  b.rotation.x = Math.PI;
  b.position.set(0, -0.2 - length / 2 + 0.1, -0.2);
  head.add(b);
}

/** Two small translucent wings on the back (fairy): add to `folk.body`. Returns them so they can flutter. */
export function wings(body: THREE.Object3D, color = 0xbfe9ff): THREE.Mesh[] {
  const m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.2 });
  return [-1, 1].map((s) => {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), m);
    w.scale.set(0.6, 1, 1);
    w.position.set(s * 0.32, 1.5, 0.3);
    w.rotation.y = s * 0.5;
    body.add(w);
    return w;
  });
}

/* ------------------------------------------------------------------ things she can use */

/**
 * Something that reacts when she WALKS UP to it (edge-triggered: fires once each time she comes within `radius`
 * of the stage-local point). Use it for the greeting.
 * `keepClear` = stop this many metres short when click-walking (people: PERSON_CLEAR).
 */
export function touchSpot(
  ctx: FolkCtx,
  object: THREE.Object3D,
  lx: number,
  lz: number,
  radius: number,
  onTouch: () => void,
  update?: (dt: number) => void,
  keepClear?: number,
): Interactable {
  return { object, position: ctx.at(lx, lz), radius, interact: () => onTouch(), update, keepClear };
}

/**
 * Something she CLICKS / TAPS (or presses Enter beside). Tapping it from afar walks her there first; `reach`
 * lets a tap work from further away than `radius` (e.g. choosing one of three cups from where she stands).
 * `onUse` may return false = "nothing happened".
 */
export function clickSpot(
  ctx: FolkCtx,
  object: THREE.Object3D,
  lx: number,
  lz: number,
  radius: number,
  onUse: () => void | boolean,
  reach?: number,
  keepClear?: number,
): Interactable {
  return { object, position: ctx.at(lx, lz), radius, reach, requiresClick: true, interact: () => onUse(), keepClear };
}

/** A simple timeline for scripted moments: `seq.after(0.5, () => …)`; call `seq.update(dt)` every frame. */
export class Seq {
  private items: { at: number; fn: () => void }[] = [];
  private t = 0;
  /** Run `fn` `delay` seconds from now. */
  after(delay: number, fn: () => void): void {
    this.items.push({ at: this.t + delay, fn });
  }
  get busy(): boolean {
    return this.items.length > 0;
  }
  clear(): void {
    this.items = [];
  }
  update(dt: number): void {
    this.t += dt;
    if (!this.items.length) return;
    const due = this.items.filter((i) => i.at <= this.t);
    if (!due.length) return;
    this.items = this.items.filter((i) => i.at > this.t);
    for (const i of due.sort((a, b) => a.at - b.at)) i.fn();
  }
}

/** Little sparkles bursting from a world point (stars / confetti). Call `update(dt)` every frame. */
export class Sparkles {
  private bits: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private static geo = new THREE.OctahedronGeometry(0.07);
  constructor(private readonly scene: THREE.Object3D) {}
  burst(at: THREE.Vector3, n = 10, colors: number[] = [0xffffff, 0xffe14d, 0xff8fab, 0x8ce99a, 0x74c0fc], speed = 2.2): void {
    for (let i = 0; i < n; i++) {
      const c = colors[Math.floor(Math.random() * colors.length)];
      const m = new THREE.Mesh(Sparkles.geo, new THREE.MeshBasicMaterial({ color: c, transparent: true }));
      m.position.copy(at);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      this.bits.push({ m, v: new THREE.Vector3(Math.cos(a) * speed * Math.random(), speed * (0.6 + Math.random()), Math.sin(a) * speed * Math.random()), life: 0.9 + Math.random() * 0.5 });
    }
  }
  update(dt: number): void {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      b.v.y -= 4 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.y += dt * 8;
      (b.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, b.life * 2));
      if (b.life <= 0) {
        b.m.removeFromParent();
        this.bits.splice(i, 1);
      }
    }
  }
  clear(): void {
    for (const b of this.bits) b.m.removeFromParent();
    this.bits = [];
  }
}
