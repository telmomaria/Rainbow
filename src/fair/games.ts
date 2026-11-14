import * as THREE from 'three';
import { registerItem } from '../items';
import type { SwingSeat } from '../props';
import type { Interactable } from '../world';
import { animateStaff, ball, box, buildFolk, cyl, HAIRS, mat, PANTS, pick, SHIRTS, SKINS, type Folk } from '../venue';
import { registerAttraction } from './fair';
import type { FairCtx } from './types';

/**
 * Fairground games (feira popular): bolas (knock the cans down → peluche), arco (archery → medal / peluche),
 * trampolim and insuflavel (standing rides: she bounces for ~20 s). No text or icons: feedback by animation and sound.
 *
 * The two throwing games hold her at the stand spot with a standing "seat" (SwingSeat with stand: true) while the
 * round plays, so she faces the targets; arrows / a tap get her off at any time (the round finishes by itself).
 */

type Mood = Parameters<typeof animateStaff>[1];

/* ------------------------------------------------------------------ prizes (bag items) */

const PLUSHES = ['peluche-urso', 'peluche-coelho', 'peluche-dino', 'peluche-unicornio'] as const;
type Plush = (typeof PLUSHES)[number];

/** A small soft toy, ~0.35 m tall, origin at the bottom (where her hand holds it). */
function buildPlush(kind: Plush): THREE.Group {
  const g = new THREE.Group();
  const P = (c: number, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = ball(g, mat(c), r, x, y, z);
    m.scale.set(r * sx, r * sy, r * sz);
    m.castShadow = false;
    return m;
  };
  const dark = 0x161616;
  const eyes = (y: number, z: number, dx = 0.03) => {
    P(dark, 0.013, -dx, y, z);
    P(dark, 0.013, dx, y, z);
  };
  if (kind === 'peluche-urso') {
    const c = 0xb5651d;
    P(c, 0.11, 0, 0.13, 0, 1, 1.15, 0.9);
    P(0xf1d1a5, 0.06, 0, 0.12, -0.07, 1, 1.2, 0.5);
    P(c, 0.085, 0, 0.29, 0);
    for (const s of [-1, 1]) {
      P(c, 0.035, s * 0.065, 0.36, 0);
      P(c, 0.04, s * 0.11, 0.16, -0.02, 1, 1.6, 1);
      P(c, 0.045, s * 0.06, 0.03, -0.04);
    }
    P(0xf1d1a5, 0.035, 0, 0.27, -0.07);
    P(dark, 0.012, 0, 0.28, -0.1);
    eyes(0.31, -0.07);
    const bow = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), mat(0xff4d8d));
    bow.scale.set(1.6, 0.8, 0.6);
    bow.position.set(0, 0.215, -0.06);
    g.add(bow);
  } else if (kind === 'peluche-coelho') {
    const c = 0xfff0f6;
    P(c, 0.1, 0, 0.12, 0, 1, 1.15, 0.9);
    P(c, 0.08, 0, 0.27, 0);
    for (const s of [-1, 1]) {
      const ear = P(c, 0.03, s * 0.035, 0.41, 0, 1, 3.2, 0.8);
      ear.rotation.z = -s * 0.15;
      P(0xfcc2d7, 0.018, s * 0.035, 0.41, -0.015, 1, 3.6, 0.5).rotation.z = -s * 0.15;
      P(c, 0.035, s * 0.1, 0.14, -0.02, 1, 1.6, 1);
      P(c, 0.045, s * 0.06, 0.03, -0.05, 1, 0.8, 1.3);
    }
    P(0xff8fab, 0.015, 0, 0.26, -0.08);
    P(0xffffff, 0.04, 0, 0.08, 0.1);
    eyes(0.29, -0.065);
  } else if (kind === 'peluche-dino') {
    const c = 0x51cf66;
    P(c, 0.1, 0, 0.13, 0, 1, 1.2, 1.1);
    P(0xd8f5a2, 0.06, 0, 0.12, -0.07, 1, 1.3, 0.5);
    P(c, 0.075, 0, 0.29, -0.03, 1, 0.9, 1.3);
    for (const s of [-1, 1]) {
      P(c, 0.035, s * 0.1, 0.16, -0.04, 1, 1.4, 1);
      P(c, 0.045, s * 0.06, 0.03, -0.04);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 8), mat(c));
    tail.rotation.x = -Math.PI / 2 - 0.5;
    tail.position.set(0, 0.07, 0.15);
    g.add(tail);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), mat(0xff922b));
      sp.position.set(0, 0.34 - i * 0.07, 0.03 + i * 0.03);
      sp.rotation.x = 0.4 + i * 0.25;
      g.add(sp);
    }
    eyes(0.32, -0.08, 0.035);
  } else {
    const c = 0xffffff;
    P(c, 0.1, 0, 0.13, 0, 1, 1.15, 0.9);
    P(c, 0.08, 0, 0.28, -0.01);
    P(c, 0.04, 0, 0.26, -0.08, 1, 0.8, 1);
    for (const s of [-1, 1]) {
      P(c, 0.035, s * 0.1, 0.15, -0.02, 1, 1.6, 1);
      P(c, 0.045, s * 0.06, 0.03, -0.04);
      P(c, 0.022, s * 0.045, 0.36, 0.01, 1, 1.6, 0.7);
    }
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 8), mat(0xffd43b, 0.2));
    horn.position.set(0, 0.38, -0.04);
    horn.rotation.x = -0.35;
    g.add(horn);
    [0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7, 0xcc5de8].forEach((col, i) => P(col, 0.03, 0, 0.35 - i * 0.045, 0.06 + i * 0.006));
    eyes(0.3, -0.07, 0.035);
  }
  return g;
}

/** A gold medal on a ribbon, origin at the top of the ribbon (in her hand). */
function buildMedal(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const r = box(g, mat(s < 0 ? 0x4dabf7 : 0xff6b6b), 0.05, 0.2, 0.01, s * 0.03, -0.09, 0);
    r.rotation.z = s * 0.25;
    r.castShadow = false;
  }
  const disc = cyl(g, mat(0xffd43b, 0.25), 0.07, 0.02, 0, -0.24, 0);
  disc.rotation.x = Math.PI / 2;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), mat(0xfff3bf, 0.3));
  star.scale.z = 0.4;
  star.position.set(0, -0.24, -0.012);
  g.add(star);
  return g;
}

const PLUSH_NAMES: Record<Plush, string> = {
  'peluche-urso': 'ursinho de peluche',
  'peluche-coelho': 'coelhinho de peluche',
  'peluche-dino': 'dinossauro de peluche',
  'peluche-unicornio': 'unicórnio de peluche',
};
const PLUSH_ICONS: Record<Plush, string> = {
  'peluche-urso': '🧸',
  'peluche-coelho': '🐰',
  'peluche-dino': '🦖',
  'peluche-unicornio': '🦄',
};
for (const k of PLUSHES) registerItem(k, { name: PLUSH_NAMES[k], icon: PLUSH_ICONS[k], build: () => buildPlush(k), edible: false });
registerItem('medalha', { name: 'medalha', icon: '🏅', build: buildMedal, edible: false });

/* ------------------------------------------------------------------ shared bits */

function noShadow(o: THREE.Object3D): void {
  o.traverse((c) => (c.castShadow = false));
}

/** Friendly operator: idle, shakes the head (can't pay), cheers (win), waves (hello / "try again"). */
class Operator {
  readonly folk: Folk;
  private mood: Mood = 'idle';
  private t = 0;
  private near = false;
  constructor(
    private readonly ctx: FairCtx,
    x: number,
    z: number,
    face = Math.PI,
    private readonly pointSide = 0,
  ) {
    const r = ctx.rng;
    this.folk = buildFolk({ shirt: pick(r, SHIRTS), pants: pick(r, PANTS), skin: pick(r, SKINS), hair: pick(r, HAIRS), cap: r() < 0.5 ? pick(r, SHIRTS) : undefined });
    this.folk.group.position.set(x, 0, z);
    this.folk.group.rotation.y = face;
    ctx.group.add(this.folk.group);
  }
  set(m: Mood): void {
    this.mood = m;
    this.t = 0;
  }
  update(dt: number): void {
    // a wave when she comes close
    const near = this.ctx.dist() < 6;
    if (near && !this.near && this.mood === 'idle') this.set('wave');
    this.near = near;
    this.t += dt;
    const before = this.mood;
    this.mood = animateStaff(this.folk, this.mood, this.t, this.pointSide);
    if (this.mood !== before) this.t = 0;
    if (this.mood === 'idle') this.folk.body.position.y = Math.sin(this.t * 2) * 0.015;
  }
}

/** Holds her standing at a local spot facing the game (local -Z) while `active()`. */
function standSeat(ctx: FairCtx, lx: number, lz: number, active: () => boolean): SwingSeat {
  return {
    take: () => 0,
    pose: () => ({ pos: ctx.at(lx, lz), heading: ctx.heading(0), tilt: 0, stand: true }),
    done: () => !active(),
    leave: () => {},
    getOff: () => ctx.at(lx, lz),
  };
}

const bells = (ctx: FairCtx) =>
  [1318.5, 1568, 2093, 1568, 2093, 2637].forEach((f, i) => ctx.tone(f, i * 0.11, 0.35, 'triangle', 0.07));
const ohh = (ctx: FairCtx) => {
  ctx.tone(392, 0, 0.28, 'sine', 0.1);
  ctx.tone(329.6, 0.25, 0.5, 'sine', 0.09);
};
const fanfare = (ctx: FairCtx) =>
  [523.3, 659.3, 784, 1046.5].forEach((f, i) => ctx.tone(f, i * 0.09, i === 3 ? 0.5 : 0.12, 'square', 0.04));
const boing = (ctx: FairCtx, base = 170, gain = 0.07) =>
  [1, 1.35, 1.8, 2.3].forEach((m, i) => ctx.tone(base * m, i * 0.03, 0.09, 'sine', gain));
const squeak = (ctx: FairCtx) => {
  const f = 650 + Math.random() * 350;
  ctx.tone(f, 0, 0.06, 'triangle', 0.05);
  ctx.tone(f * 1.25, 0.05, 0.08, 'triangle', 0.04);
};

/** A prize flying (local space) from a point to her hands, then into her bag. */
class PrizeFlight {
  private mesh: THREE.Group | null = null;
  private from = new THREE.Vector3();
  private t = 0;
  private kind = '';
  constructor(private readonly ctx: FairCtx) {}
  start(kind: string, model: THREE.Group, from: THREE.Vector3, scale = 1): void {
    this.end();
    this.kind = kind;
    this.mesh = model;
    model.scale.setScalar(scale);
    noShadow(model);
    model.position.copy(from);
    this.from.copy(from);
    this.t = 0;
    this.ctx.group.add(model);
  }
  update(dt: number): void {
    if (!this.mesh) return;
    this.t = Math.min(1, this.t + dt / 0.9);
    const to = this.ctx.group.worldToLocal(this.ctx.game.player.clone()).setY(1.0);
    this.mesh.position.lerpVectors(this.from, to, this.t);
    this.mesh.position.y += Math.sin(this.t * Math.PI) * 0.9;
    this.mesh.rotation.y += dt * 6;
    if (this.t >= 1) {
      this.ctx.give(this.kind);
      this.ctx.tone(1760, 0, 0.12, 'triangle', 0.06);
      this.end();
    }
  }
  end(): void {
    if (this.mesh) this.ctx.group.remove(this.mesh);
    this.mesh = null;
  }
}

/** Simple falling-object physics in the slot's local frame. */
interface Body {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  floor: number;
  zMin: number;
}
function stepBody(b: Body, dt: number): void {
  b.vel.y -= 9.8 * dt;
  b.mesh.position.addScaledVector(b.vel, dt);
  b.mesh.rotation.x += b.spin.x * dt;
  b.mesh.rotation.z += b.spin.z * dt;
  if (b.mesh.position.z < b.zMin) {
    b.mesh.position.z = b.zMin;
    b.vel.z = Math.abs(b.vel.z) * 0.3;
  }
  if (b.mesh.position.y < b.floor) {
    b.mesh.position.y = b.floor;
    b.vel.y = Math.abs(b.vel.y) * 0.3 < 0.4 ? 0 : Math.abs(b.vel.y) * 0.3;
    b.vel.x *= 0.6;
    b.vel.z *= 0.6;
    b.spin.multiplyScalar(0.5);
  }
}

/* ================================================================== bolas */

registerAttraction('bolas', (ctx) => {
  const g = ctx.group;
  const W = 2.5;
  const BACK_Z = -2.9;
  const FRONT_Z = 1.3;
  const STAND_Z = ctx.hd - 0.6;
  const booth = new THREE.Group();
  g.add(booth);
  const [cA, cB] = ctx.rng() < 0.5 ? [0xff6b6b, 0xffffff] : [0x4dabf7, 0xfff3bf];
  box(booth, mat(0xc8a165), W * 2, 0.1, FRONT_Z - BACK_Z, 0, 0.05, (FRONT_Z + BACK_Z) / 2);
  // striped back wall and sides
  for (let i = 0; i < 8; i++) box(booth, mat(i % 2 ? cA : cB), (W * 2) / 8, 2.6, 0.12, -W + (i + 0.5) * ((W * 2) / 8), 1.3, BACK_Z);
  for (const s of [-1, 1]) {
    box(booth, mat(cA), 0.12, 2.6, FRONT_Z - BACK_Z, s * W, 1.3, (FRONT_Z + BACK_Z) / 2);
    cyl(booth, mat(0xfcc419), 0.08, 2.75, s * W, 1.375, FRONT_Z);
  }
  // striped roof + scalloped valance
  for (let i = 0; i < 10; i++) box(booth, mat(i % 2 ? cA : cB), (W * 2.1) / 10, 0.1, FRONT_Z - BACK_Z + 0.5, -W * 1.05 + (i + 0.5) * ((W * 2.1) / 10), 2.75, (FRONT_Z + BACK_Z) / 2 + 0.25);
  const flapGeo = new THREE.ConeGeometry(0.17, 0.3, 3);
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(flapGeo, mat(i % 2 ? cA : 0xfcc419));
    f.rotation.x = Math.PI;
    f.position.set(-W + (i + 0.5) * ((W * 2) / 14), 2.55, FRONT_Z + 0.5);
    booth.add(f);
  }
  // counter
  box(booth, mat(0x7048e8), W * 2, 0.95, 0.45, 0, 0.475, FRONT_Z - 0.1);
  box(booth, mat(0xfcc419), W * 2 + 0.1, 0.06, 0.55, 0, 0.98, FRONT_Z - 0.1);
  // shelves of plush toys at the back
  const shelfPlush: THREE.Vector3[] = [];
  for (const y of [1.35, 1.9]) {
    box(booth, mat(0xffffff), W * 2 - 0.3, 0.06, 0.4, 0, y, BACK_Z + 0.26);
    for (let i = 0; i < 4; i++) {
      const p = buildPlush(PLUSHES[(i + (y > 1.6 ? 2 : 0)) % PLUSHES.length]);
      p.scale.setScalar(1.5);
      p.position.set(-1.8 + i * 1.2, y + 0.03, BACK_Z + 0.26);
      noShadow(p);
      booth.add(p);
      shelfPlush.push(p.position.clone());
    }
  }
  // three little tables with a pyramid of cans each
  const TABLE_Z = -0.9;
  const TABLE_Y = 1.1;
  const tablesX = [-1.45, 0, 1.45];
  const canColors = [0xff6b6b, 0x51cf66, 0x4dabf7, 0xfcc419, 0xcc5de8, 0xff922b];
  const canGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.28, 12);
  const cans: { mesh: THREE.Mesh; home: THREE.Vector3; table: number; body: Body | null }[] = [];
  tablesX.forEach((tx, ti) => {
    box(booth, mat(0x5c3d2e), 0.7, TABLE_Y, 0.45, tx, TABLE_Y / 2, TABLE_Z);
    const spots = [[-0.14, 0], [0.14, 0], [0, 1]];
    spots.forEach(([dx, row], k) => {
      const m = new THREE.Mesh(canGeo, mat(canColors[(ti * 3 + k) % canColors.length], 0.05));
      m.castShadow = true;
      const home = new THREE.Vector3(tx + dx, TABLE_Y + 0.14 + row * 0.28, TABLE_Z);
      m.position.copy(home);
      booth.add(m);
      cans.push({ mesh: m, home, table: ti, body: null });
    });
  });
  ctx.solid(-W - 0.1, W + 0.1, BACK_Z - 0.1, FRONT_Z + 0.15, 2.8);
  const op = new Operator(ctx, 1.95, 0.35);

  // the 3 balls
  const ballGeo = new THREE.SphereGeometry(0.08, 10, 8);
  const balls = [0xffffff, 0xff8787, 0xffe066].map((c) => {
    const m = new THREE.Mesh(ballGeo, mat(c));
    m.visible = false;
    g.add(m);
    return { mesh: m, from: new THREE.Vector3(), to: new THREE.Vector3(), t: -1, hit: false, body: null as Body | null };
  });

  let playing = false;
  let t = 0;
  let hits: boolean[] = [];
  let resolved = false;
  let losses = 0;
  let resetIn = 0;
  const prize = new PrizeFlight(ctx);

  const reset = () => {
    for (const c of cans) {
      c.body = null;
      c.mesh.position.copy(c.home);
      c.mesh.rotation.set(0, 0, 0);
    }
    for (const b of balls) {
      b.mesh.visible = false;
      b.t = -1;
      b.body = null;
    }
  };

  const THROW0 = 0.7;
  const GAP = 1.3;
  const thing: Interactable = {
    object: booth,
    position: ctx.at(0, STAND_Z),
    radius: 1.6,
    requiresClick: true,
    interact() {
      if (playing) return;
      if (!ctx.pay(2, ctx.toWorld(op.folk.group.position.x, 1.2, op.folk.group.position.z))) {
        op.set('no');
        return;
      }
      reset();
      prize.end();
      playing = true;
      resolved = false;
      t = 0;
      // wins often but not always: each ball hits ~70 %; a win = 2 of 3 (after 2 losses in a row, a sure win)
      hits = [0, 1, 2].map(() => Math.random() < 0.7);
      if (losses >= 2) hits = [true, Math.random() < 0.5, true];
    },
    seat: standSeat(ctx, 0, STAND_Z, () => playing),
  };

  return {
    things: [thing],
    update(dt) {
      op.update(dt);
      prize.update(dt);
      if (resetIn > 0) {
        resetIn -= dt;
        if (resetIn <= 0 && !playing) {
          reset();
          ctx.tone(880, 0, 0.08, 'triangle', 0.03);
        }
      }
      for (const c of cans) if (c.body) stepBody(c.body, dt);
      for (const b of balls) if (b.body) stepBody(b.body, dt);
      if (!playing) return;
      t += dt;
      balls.forEach((b, i) => {
        const start = THROW0 + i * GAP;
        if (b.t < 0 && t >= start) {
          // thrown from her right hand towards table i
          const her = g.worldToLocal(ctx.game.player.clone());
          b.from.set(her.x + 0.25, 1.25, her.z - 0.3);
          const tx = tablesX[i];
          b.hit = hits[i];
          if (b.hit) b.to.set(tx, TABLE_Y + 0.35, TABLE_Z + 0.1);
          else b.to.set(tx + (Math.random() < 0.5 ? -0.55 : 0.55), 1.7 + Math.random() * 0.3, BACK_Z + 0.2);
          b.t = 0;
          b.mesh.visible = true;
          ctx.noise(0.2, 0.06, 'highpass', 2000);
        }
        if (b.t >= 0 && !b.body) {
          b.t = Math.min(1, b.t + dt / 0.55);
          b.mesh.position.lerpVectors(b.from, b.to, b.t);
          b.mesh.position.y += Math.sin(b.t * Math.PI) * 0.6;
          if (b.t >= 1) {
            const dir = b.to.clone().sub(b.from).normalize();
            b.body = { mesh: b.mesh, vel: dir.multiplyScalar(1.2), spin: new THREE.Vector3(), floor: 0.18, zMin: BACK_Z + 0.15 };
            if (b.hit) {
              // cans tumble back off the table
              ctx.tone(110, 0, 0.12, 'sine', 0.15);
              for (let k = 0; k < 5; k++) ctx.tone(1100 + Math.random() * 900, 0.03 + k * 0.07 + Math.random() * 0.04, 0.06, 'square', 0.03);
              ctx.noise(0.35, 0.12, 'bandpass', 2600);
              for (const c of cans)
                if (c.table === i)
                  c.body = {
                    mesh: c.mesh,
                    vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.2, -1.2 - Math.random() * 1.2),
                    spin: new THREE.Vector3((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 12),
                    floor: 0.2,
                    zMin: BACK_Z + 0.15,
                  };
            } else {
              ctx.noise(0.15, 0.15, 'lowpass', 300); // soft thump on the curtain
            }
          }
        }
      });
      if (!resolved && t > THROW0 + 2 * GAP + 1.2) {
        resolved = true;
        const n = hits.filter(Boolean).length;
        if (n >= 2) {
          losses = 0;
          bells(ctx);
          op.set('yes');
          const kind = PLUSHES[Math.floor(Math.random() * PLUSHES.length)];
          const from = shelfPlush[Math.floor(Math.random() * shelfPlush.length)].clone();
          prize.start(kind, buildPlush(kind), from, 1.5);
          ctx.speak(['Boa! Um peluche para ti!']);
        } else {
          losses++;
          ohh(ctx);
          op.set('wave');
          ctx.speak(['Quase! Tenta outra vez.']);
        }
      }
      if (resolved && t > THROW0 + 2 * GAP + 2.3) {
        playing = false;
        resetIn = 2.5;
      }
    },
    dispose() {
      prize.end();
    },
  };
});

/* ================================================================== arco */

/** A straw target facing +Z, centre at (x, y, z) (the face). */
function buildTarget(parent: THREE.Object3D, x: number, y: number, z: number): THREE.MeshStandardMaterial {
  const t = new THREE.Group();
  t.position.set(x, y, z);
  parent.add(t);
  for (const s of [-1, 1]) {
    const leg = box(t, mat(0x8b5a2b), 0.07, 1.6, 0.07, s * 0.35, -0.55, -0.12);
    leg.rotation.z = s * 0.12;
  }
  box(t, mat(0x8b5a2b), 0.07, 1.4, 0.07, 0, -0.6, -0.45).rotation.x = -0.35;
  const bull = new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.6, emissive: 0xffd43b, emissiveIntensity: 0 });
  const rings: [number, THREE.Material][] = [
    [0.55, mat(0xe9c46a)],
    [0.47, mat(0xffffff)],
    [0.36, mat(0xff4040)],
    [0.25, mat(0xffffff)],
    [0.13, bull],
  ];
  rings.forEach(([r, m], i) => {
    const d = cyl(t, m, r, 0.16 + i * 0.012, 0, 0, -0.08);
    d.rotation.x = Math.PI / 2;
  });
  return bull;
}

/** An arrow with its tip at the origin, pointing +Z. */
function buildArrow(): THREE.Group {
  const a = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 6), mat(0xffd43b));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.38;
  a.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), mat(0x868e96));
  tip.rotation.x = Math.PI / 2;
  tip.position.z = -0.035;
  a.add(tip);
  for (const r of [0, Math.PI / 2]) {
    const f = box(a, mat(0xff4d8d), 0.01, 0.12, 0.16, 0, 0, -0.64);
    f.rotation.z = r;
    f.castShadow = false;
  }
  return a;
}

/** A cylinder between two points (bow string). */
function setSegment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = b.clone().sub(a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, d.length(), 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

registerAttraction('arco', (ctx) => {
  const g = ctx.group;
  const W = 2.6;
  const COUNTER_Z = 1.5;
  const STAND_Z = ctx.hd - 0.6;
  const TARGET_Z = -2.55;
  const TARGET_Y = 1.3;
  const lane = new THREE.Group();
  g.add(lane);
  // grass lane, side fences, a back wall of hay bales and a canvas
  box(lane, mat(0x8ce99a), W * 2, 0.04, COUNTER_Z + 3.2, 0, 0.03, (COUNTER_Z - 3.2) / 2);
  const [cA, cB] = ctx.rng() < 0.5 ? [0x2b8a3e, 0xffffff] : [0x1864ab, 0xfff3bf];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) box(lane, mat(i % 2 ? cA : cB), 0.1, 1.4, 1.17, s * W, 0.7, -3.2 + (i + 0.5) * 1.175);
    cyl(lane, mat(0xfcc419), 0.08, 2.9, s * W, 1.45, COUNTER_Z);
  }
  for (let i = 0; i < 8; i++) box(lane, mat(i % 2 ? cA : cB), (W * 2) / 8, 2.4, 0.1, -W + (i + 0.5) * ((W * 2) / 8), 1.2, -3.2);
  for (let i = 0; i < 4; i++) box(lane, mat(0xe9c46a), 1.2, 0.5, 0.45, -1.95 + i * 1.3, 0.25, -2.95);
  // front beam with pennants
  box(lane, mat(0xfcc419), W * 2 + 0.2, 0.15, 0.15, 0, 2.85, COUNTER_Z);
  const flagGeo = new THREE.ConeGeometry(0.15, 0.32, 3);
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Mesh(flagGeo, mat([0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7, 0xcc5de8][i % 5]));
    f.rotation.x = Math.PI;
    f.position.set(-W + (i + 0.5) * ((W * 2) / 12), 2.62, COUNTER_Z);
    lane.add(f);
  }
  // shooting counter (low: she shoots over it)
  box(lane, mat(0x8b5a2b), W * 2, 0.75, 0.3, 0, 0.375, COUNTER_Z);
  box(lane, mat(0xc8a165), W * 2 + 0.1, 0.05, 0.4, 0, 0.77, COUNTER_Z);
  const targetsX = [-1.6, 0, 1.6];
  const bulls = targetsX.map((x) => buildTarget(lane, x, TARGET_Y, TARGET_Z));
  ctx.solid(-W - 0.1, W + 0.1, -3.3, COUNTER_Z + 0.2, 1.4);
  const op = new Operator(ctx, -2.25, 2.35, Math.PI, 1);
  ctx.solid(-2.6, -1.9, 2.0, 2.7, 2);

  // the bow (rests on the counter; in use it is held in front of her, facing the targets)
  const bow = new THREE.Group();
  const limbs = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.024, 6, 18, Math.PI), mat(0xa0522d));
  limbs.scale.y = 0.45; // before rotation: flattens the bulge
  limbs.rotation.set(0, 0, -Math.PI / 2);
  const limbsHolder = new THREE.Group();
  limbsHolder.rotation.y = Math.PI / 2; // bulge towards -Z (the targets)
  limbsHolder.add(limbs);
  bow.add(limbsHolder);
  const grip = box(bow, mat(0x5c3d2e), 0.05, 0.14, 0.05, 0, 0, -0.19);
  grip.castShadow = false;
  const strGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 4);
  const strA = new THREE.Mesh(strGeo, mat(0xf1f3f5));
  const strB = new THREE.Mesh(strGeo, mat(0xf1f3f5));
  bow.add(strA, strB);
  const nocked = buildArrow();
  nocked.rotation.y = Math.PI; // tip towards -Z
  nocked.visible = false;
  bow.add(nocked);
  g.add(bow);
  const TOP = new THREE.Vector3(0, 0.42, 0);
  const BOT = new THREE.Vector3(0, -0.42, 0);
  const setPull = (p: number) => {
    const n = new THREE.Vector3(0, 0, p);
    setSegment(strA, TOP, n);
    setSegment(strB, BOT, n);
    nocked.position.set(0, 0, p - 0.7);
  };
  setPull(0);
  const REST = { pos: new THREE.Vector3(1.4, 0.82, COUNTER_Z), rot: new THREE.Euler(Math.PI / 2, 0, Math.PI / 2) };
  const held = () => {
    const her = g.worldToLocal(ctx.game.player.clone());
    return new THREE.Vector3(her.x - 0.3, 1.15, her.z - 0.5);
  };
  const putToRest = () => {
    bow.position.copy(REST.pos);
    bow.rotation.copy(REST.rot);
    setPull(0);
    nocked.visible = false;
  };
  putToRest();

  type Shot = { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number; ring: number; wobble: number; target: number; q0: THREE.Quaternion };
  const WOBBLE = new THREE.Quaternion();
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  let shots: Shot[] = [];
  let rings: number[] = [];
  let playing = false;
  let t = 0;
  let resolved = false;
  let losses = 0;
  let clearIn = 0;
  const flash = [0, 0, 0];
  const prize = new PrizeFlight(ctx);
  const BANDS: [number, number][] = [
    [0, 0.1],
    [0.15, 0.23],
    [0.27, 0.34],
    [0.38, 0.45],
  ];
  const clearArrows = () => {
    for (const s of shots) g.remove(s.mesh);
    shots = [];
  };

  const SHOT0 = 0.7;
  const GAP = 1.5;
  const DRAW = 0.6;
  const thing: Interactable = {
    object: lane,
    position: ctx.at(0, STAND_Z),
    radius: 1.6,
    requiresClick: true,
    interact() {
      if (playing) return;
      if (!ctx.pay(2, ctx.toWorld(op.folk.group.position.x, 1.2, op.folk.group.position.z))) {
        op.set('no');
        return;
      }
      clearArrows();
      prize.end();
      playing = true;
      resolved = false;
      t = 0;
      // ring per arrow (0 = the yellow centre); never a complete miss
      const roll = () => {
        const r = Math.random();
        return r < 0.4 ? 0 : r < 0.72 ? 1 : r < 0.92 ? 2 : 3;
      };
      rings = [roll(), roll(), roll()];
      if (losses >= 2 && !rings.includes(0)) rings[2] = 0;
    },
    seat: standSeat(ctx, 0, STAND_Z, () => playing),
  };

  return {
    things: [thing],
    update(dt) {
      op.update(dt);
      prize.update(dt);
      bulls.forEach((m, i) => {
        flash[i] = Math.max(0, flash[i] - dt);
        m.emissiveIntensity = flash[i] > 0 ? 0.4 + 0.5 * Math.abs(Math.sin(flash[i] * 14)) : 0;
      });
      for (const s of shots) {
        if (s.t < 1) {
          s.t = Math.min(1, s.t + dt / 0.35);
          s.mesh.position.lerpVectors(s.from, s.to, s.t);
          s.mesh.position.y += Math.sin(s.t * Math.PI) * 0.12;
          if (s.t >= 1) {
            // thwack!
            ctx.noise(0.12, 0.3, 'lowpass', 500);
            ctx.tone(140, 0, 0.1, 'square', 0.04);
            s.wobble = 0.6;
            if (s.ring === 0) {
              fanfare(ctx);
              flash[s.target] = 1.6;
            }
          }
        } else if (s.wobble > 0) {
          s.wobble = Math.max(0, s.wobble - dt);
          s.mesh.quaternion.copy(s.q0).multiply(WOBBLE.setFromAxisAngle(X_AXIS, Math.sin(s.wobble * 40) * s.wobble * 0.08));
        }
      }
      if (clearIn > 0) {
        clearIn -= dt;
        if (clearIn <= 0 && !playing) {
          clearArrows();
          ctx.tone(660, 0, 0.08, 'triangle', 0.03);
        }
      }
      if (!playing) return;
      t += dt;
      // bow in her hands
      bow.position.copy(held());
      bow.rotation.set(0, 0, 0);
      for (let i = 0; i < 3; i++) {
        const t0 = SHOT0 + i * GAP;
        if (t >= t0 && t < t0 + DRAW) {
          nocked.visible = true;
          setPull(0.25 * ((t - t0) / DRAW));
        } else if (t >= t0 + DRAW && shots.length === i) {
          // release
          nocked.visible = false;
          setPull(0);
          ctx.tone(185, 0, 0.12, 'triangle', 0.08);
          ctx.noise(0.3, 0.08, 'highpass', 1800);
          const band = BANDS[rings[i]];
          const a = Math.random() * Math.PI * 2;
          const rr = band[0] + Math.random() * (band[1] - band[0]);
          const to = new THREE.Vector3(targetsX[i] + Math.cos(a) * rr, TARGET_Y + Math.sin(a) * rr, TARGET_Z + 0.02);
          const from = bow.position.clone().add(new THREE.Vector3(0, 0, -0.45));
          const mesh = buildArrow();
          noShadow(mesh);
          mesh.position.copy(from);
          mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
          g.add(mesh);
          shots.push({ mesh, from, to, t: 0, ring: rings[i], wobble: 0, target: i, q0: mesh.quaternion.clone() });
        }
      }
      if (!resolved && t > SHOT0 + 2 * GAP + DRAW + 1.0) {
        resolved = true;
        putToRest();
        const bullseyes = rings.filter((r) => r === 0).length;
        const from = new THREE.Vector3(op.folk.group.position.x, 1.4, op.folk.group.position.z);
        if (bullseyes >= 2) {
          losses = 0;
          bells(ctx);
          op.set('yes');
          const kind = PLUSHES[Math.floor(Math.random() * PLUSHES.length)];
          prize.start(kind, buildPlush(kind), from, 1.3);
          ctx.speak(['Mesmo no centro! Um peluche para ti!']);
        } else if (bullseyes === 1) {
          losses = 0;
          bells(ctx);
          op.set('yes');
          prize.start('medalha', buildMedal(), from, 1.6);
          ctx.speak(['Mesmo no centro! Uma medalha para ti!']);
        } else {
          losses++;
          ohh(ctx);
          op.set('wave');
          ctx.speak(['Quase! Tenta outra vez.']);
        }
      }
      if (resolved && t > SHOT0 + 2 * GAP + DRAW + 2.0) {
        playing = false;
        clearIn = 3;
      }
    },
    dispose() {
      prize.end();
    },
  };
});

/* ================================================================== bouncing rides (trampolim, insuflavel) */

/** A child bouncing on the spot (folk scaled down), arms up in the air. */
interface Kid {
  folk: Folk;
  x: number;
  z: number;
  phase: number;
  period: number;
  height: number;
}
function buildKid(ctx: FairCtx, x: number, z: number, floorY: number): Kid {
  const r = ctx.rng;
  const folk = buildFolk({
    shirt: pick(r, SHIRTS),
    pants: pick(r, PANTS),
    skin: pick(r, SKINS),
    hair: pick(r, HAIRS),
    dress: r() < 0.4,
    longHair: r() < 0.5,
  });
  folk.group.scale.setScalar(0.55);
  folk.group.position.set(x, floorY, z);
  folk.group.rotation.y = Math.PI + (r() - 0.5) * 1.5;
  ctx.group.add(folk.group);
  return { folk, x, z, phase: r(), period: 0.8 + r() * 0.3, height: 0.6 + r() * 0.3 };
}
/** Jump arc: height at fraction u ∈ [0, 1) of a hop. */
const hop = (u: number, h: number) => 4 * h * u * (1 - u);

/**
 * Standing ride where she bounces in place for `SESSION` seconds after paying `price`.
 * `inside(t)` = her local (x, z) while bouncing; floorY = local height of the bouncy surface.
 */
class BounceRide {
  /** seconds of paid bouncing left */
  left = 0;
  riding = false;
  private rideT = 0;
  private exitT = -1;
  private phase = 0;
  private hopH = 0.9;
  private refused = false;
  landed = false;
  constructor(
    private readonly ctx: FairCtx,
    private readonly stand: { x: number; z: number },
    private readonly floorY: number,
    private readonly inside: (t: number) => { x: number; z: number },
    private readonly period: number,
    private readonly heights: [number, number],
  ) {}
  /** Fraction of the current hop (for the surface dip). */
  get u(): number {
    return this.riding && this.rideT > 0.7 ? this.phase % 1 : 0.5;
  }
  start(): void {
    this.left = 20;
    this.exitT = -1;
  }
  seat(): SwingSeat {
    return {
      take: () => {
        this.refused = this.left <= 0; // couldn't pay: off again straight away
        this.riding = true;
        this.rideT = 0;
        this.exitT = -1;
        return 0;
      },
      pose: () => this.pose(),
      done: () => this.refused || (this.left <= 0 && this.exitT >= 0.7),
      leave: () => {
        this.riding = false;
      },
      getOff: () => this.ctx.at(this.stand.x, this.stand.z),
    };
  }
  private pose(): ReturnType<SwingSeat['pose']> {
    const ctx = this.ctx;
    const heading = ctx.heading(Math.PI); // facing the visitors' path
    const standP = { x: this.stand.x, y: 0, z: this.stand.z };
    const inP = this.inside(this.rideT);
    if (this.exitT >= 0) {
      // hop back out to the stand spot
      const k = Math.min(1, this.exitT / 0.7);
      const p = ctx.toWorld(inP.x + (standP.x - inP.x) * k, this.floorY * (1 - k) + Math.sin(k * Math.PI) * 0.8, inP.z + (standP.z - inP.z) * k);
      return { pos: p, heading, tilt: 0, stand: true };
    }
    if (this.rideT < 0.7) {
      // hop in
      const k = this.rideT / 0.7;
      const p = ctx.toWorld(standP.x + (inP.x - standP.x) * k, this.floorY * k + Math.sin(k * Math.PI) * 0.8, standP.z + (inP.z - standP.z) * k);
      return { pos: p, heading: ctx.heading(0), tilt: 0, stand: true };
    }
    const y = this.floorY + hop(this.phase % 1, this.hopH);
    return { pos: ctx.toWorld(inP.x, y, inP.z), heading, tilt: 0, stand: true };
  }
  /** Returns true on the frame she lands on the surface. */
  update(dt: number): boolean {
    if (this.left > 0) this.left -= dt;
    if (!this.riding || this.refused) return false;
    if (this.left <= 0 && this.exitT < 0) this.exitT = 0;
    if (this.exitT >= 0) {
      this.exitT += dt;
      return false;
    }
    this.rideT += dt;
    if (this.rideT < 0.7) return false;
    const before = Math.floor(this.phase);
    this.phase += dt / this.period;
    if (Math.floor(this.phase) !== before) {
      this.hopH = this.heights[0] + Math.random() * (this.heights[1] - this.heights[0]);
      return true;
    }
    return false;
  }
}

/* ================================================================== trampolim */

registerAttraction('trampolim', (ctx) => {
  const g = ctx.group;
  const CZ = -0.5;
  const R = 2.0;
  const MAT_Y = 0.6;
  const STAND_Z = ctx.hd - 0.7;
  const tramp = new THREE.Group();
  tramp.position.z = CZ;
  g.add(tramp);
  const padColor = pick(ctx.rng, [0x4dabf7, 0xff6b6b, 0x51cf66, 0xcc5de8]);
  // legs, padded rim, jumping mat
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cyl(tramp, mat(0x868e96), 0.05, MAT_Y, Math.sin(a) * (R - 0.1), MAT_Y / 2, Math.cos(a) * (R - 0.1));
  }
  const pad = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.14, 8, 32), mat(padColor));
  pad.rotation.x = Math.PI / 2;
  pad.position.y = MAT_Y;
  tramp.add(pad);
  const matDisc = cyl(tramp, mat(0x212529), R - 0.15, 0.04, 0, MAT_Y - 0.02, 0);
  // safety net: padded posts + a netting cylinder with an opening at the front (+Z)
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    cyl(tramp, mat(i % 2 ? padColor : 0xfcc419), 0.06, 2.0, Math.sin(a) * R, MAT_Y + 1.0, Math.cos(a) * R);
  }
  const netMat = new THREE.MeshBasicMaterial({ color: 0x343a40, wireframe: true, transparent: true, opacity: 0.55 });
  const gap = 0.42;
  const net = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.8, 40, 7, true, gap, Math.PI * 2 - gap * 2), netMat);
  net.position.y = MAT_Y + 1.0;
  tramp.add(net);
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 6, 32), mat(padColor));
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = MAT_Y + 1.95;
  tramp.add(topRing);
  // steps up to the opening
  box(g, mat(0xfcc419), 0.9, 0.3, 0.35, 0, 0.15, CZ + R + 0.5);
  box(g, mat(0xff922b), 0.9, 0.55, 0.3, 0, 0.275, CZ + R + 0.2);
  ctx.solid(-R - 0.1, R + 0.1, CZ - R - 0.1, CZ + R + 0.1, 2.6);
  const op = new Operator(ctx, -2.2, 2.2, Math.PI, 0);
  ctx.solid(-2.55, -1.85, 1.85, 2.55, 2);
  const kids = [buildKid(ctx, -1.0, CZ - 0.6, MAT_Y), buildKid(ctx, 0.95, CZ - 0.9, MAT_Y)];

  const ride = new BounceRide(ctx, { x: 0, z: STAND_Z }, MAT_Y, () => ({ x: 0, z: CZ + 0.6 }), 0.95, [0.8, 1.15]);
  const thing: Interactable = {
    object: tramp,
    position: ctx.at(0, STAND_Z),
    radius: 1.6,
    requiresClick: true,
    interact() {
      if (ride.left > 0) return; // still has paid time: just back on
      if (!ctx.pay(1, ctx.toWorld(op.folk.group.position.x, 1.2, op.folk.group.position.z))) {
        op.set('no');
        return;
      }
      ride.start();
      op.set('wave');
    },
    seat: ride.seat(),
  };
  let time = 0;
  return {
    things: [thing],
    update(dt) {
      time += dt;
      op.update(dt);
      if (ride.update(dt)) boing(ctx, 160 + Math.random() * 30, 0.08);
      let dip = 0;
      const dipOf = (u: number) => Math.max(0, 1 - Math.min(u, 1 - u) / 0.12) * 0.14;
      if (ride.riding) dip = dipOf(ride.u);
      for (const k of kids) {
        const before = Math.floor(k.phase);
        k.phase += dt / k.period;
        const u = k.phase % 1;
        const y = hop(u, k.height);
        k.folk.group.position.y = MAT_Y + y;
        const up = Math.min(1, y / 0.3);
        k.folk.armL.rotation.z = -0.1 - up * 2.4;
        k.folk.armR.rotation.z = 0.1 + up * 2.4;
        k.folk.legL.rotation.x = up * 0.3;
        k.folk.legR.rotation.x = -up * 0.3;
        dip = Math.max(dip, dipOf(u) * 0.7);
        // the kids' boings, quieter, only when she's close
        if (Math.floor(k.phase) !== before && ctx.dist() < 12) boing(ctx, 210 + Math.random() * 40, 0.025);
      }
      matDisc.position.y = MAT_Y - 0.02 - dip;
      net.rotation.y = Math.sin(time * 5) * 0.004;
    },
  };
});

/* ================================================================== insuflavel */

registerAttraction('insuflavel', (ctx) => {
  const g = ctx.group;
  const HW = 2.3;
  const BACK = -2.75;
  const FRONT = 1.25;
  const BASE_H = 0.55;
  const STAND_Z = ctx.hd - 0.6;
  const castle = new THREE.Group();
  g.add(castle);
  const pal = [0xff6b6b, 0xfcc419, 0x4dabf7, 0x51cf66, 0xcc5de8];
  const c1 = pick(ctx.rng, pal);
  const c2 = pal[(pal.indexOf(c1) + 1 + Math.floor(ctx.rng() * 3)) % pal.length];
  const base = box(castle, mat(c1), HW * 2, BASE_H, FRONT - BACK, 0, BASE_H / 2, (FRONT + BACK) / 2);
  box(castle, mat(0x74c0fc), HW * 2 - 0.5, 0.02, FRONT - BACK - 0.5, 0, BASE_H + 0.01, (FRONT + BACK) / 2 + 0.1);
  const walls = new THREE.Group();
  castle.add(walls);
  // back wall + side walls with puffy rolls on top
  box(walls, mat(c2), HW * 2, 1.7, 0.4, 0, BASE_H + 0.85, BACK + 0.2);
  const roll = (len: number, x: number, y: number, z: number, alongX: boolean, c: number) => {
    const m = cyl(walls, mat(c), 0.24, len, x, y, z);
    if (alongX) m.rotation.z = Math.PI / 2;
    else m.rotation.x = Math.PI / 2;
  };
  roll(HW * 2, 0, BASE_H + 1.75, BACK + 0.2, true, c1);
  for (const s of [-1, 1]) {
    box(walls, mat(c2), 0.4, 1.1, FRONT - BACK - 0.6, s * (HW - 0.2), BASE_H + 0.55, (FRONT + BACK) / 2 - 0.1);
    roll(FRONT - BACK - 0.6, s * (HW - 0.2), BASE_H + 1.15, (FRONT + BACK) / 2 - 0.1, false, 0xfcc419);
    // low front lip either side of the entrance
    box(walls, mat(c2), 1.4, 0.4, 0.35, s * (HW - 0.95), BASE_H + 0.2, FRONT - 0.18);
  }
  // four turrets with cone roofs and balls on top
  const turrets: THREE.Group[] = [];
  for (const [x, z] of [[-HW, BACK + 0.2], [HW, BACK + 0.2], [-HW, FRONT - 0.2], [HW, FRONT - 0.2]] as const) {
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    castle.add(t);
    cyl(t, mat(c2), 0.42, 2.6, 0, 1.3, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.8, 12), mat(c1));
    roof.position.y = 3.0;
    t.add(roof);
    ball(t, mat(0xfcc419), 0.14, 0, 3.45, 0);
    turrets.push(t);
  }
  // puffy arch over the entrance
  const arch = new THREE.Mesh(new THREE.TorusGeometry(HW, 0.22, 8, 24, Math.PI), mat(0xfcc419));
  arch.scale.y = 0.35;
  arch.position.set(0, 2.2, FRONT - 0.2);
  walls.add(arch);
  // entrance ramp and the air blower on the side
  const ramp = box(g, mat(c1), 1.5, 0.12, 0.9, 0, 0.25, FRONT + 0.4);
  ramp.rotation.x = 0.45;
  box(g, mat(0x495057), 0.5, 0.45, 0.5, -HW - 0.05, 0.22, FRONT + 0.75);
  cyl(g, mat(0x868e96), 0.12, 0.6, -HW + 0.25, 0.3, FRONT + 0.4).rotation.z = Math.PI / 2;
  ctx.solid(-HW - 0.35, HW + 0.35, BACK - 0.1, FRONT + 0.05, 1.2); // low: the camera passes over the soft walls
  const op = new Operator(ctx, 1.95, 2.25, Math.PI, 0);
  ctx.solid(1.6, 2.3, 1.9, 2.6, 2);
  const MID_Z = (FRONT + BACK) / 2;
  const kids = [buildKid(ctx, -1.45, BACK + 0.9, BASE_H), buildKid(ctx, 1.4, BACK + 1.0, BASE_H), buildKid(ctx, 1.3, FRONT - 0.85, BASE_H)];

  const ride = new BounceRide(
    ctx,
    { x: 0, z: STAND_Z },
    BASE_H,
    (t) => ({ x: Math.sin(t * 0.7) * 0.6, z: MID_Z + 0.2 + Math.sin(t * 0.45) * 0.35 }),
    0.75,
    [0.45, 0.8],
  );
  const thing: Interactable = {
    object: castle,
    position: ctx.at(0, STAND_Z),
    radius: 1.6,
    requiresClick: true,
    interact() {
      if (ride.left > 0) return;
      if (!ctx.pay(1, ctx.toWorld(op.folk.group.position.x, 1.2, op.folk.group.position.z))) {
        op.set('no');
        return;
      }
      ride.start();
      op.set('wave');
    },
    seat: ride.seat(),
  };
  let time = 0;
  let squash = 0;
  return {
    things: [thing],
    update(dt) {
      time += dt;
      op.update(dt);
      if (ride.update(dt)) {
        squeak(ctx);
        squash = 1;
      }
      for (const k of kids) {
        const before = Math.floor(k.phase);
        k.phase += dt / (k.period * 0.85);
        const u = k.phase % 1;
        const y = hop(u, k.height * 0.7);
        k.folk.group.position.y = BASE_H + y;
        k.folk.group.position.x = k.x + Math.sin(time * 0.9 + k.phase) * 0.15;
        const up = Math.min(1, y / 0.25);
        k.folk.armL.rotation.z = -0.3 - up * 2;
        k.folk.armR.rotation.z = 0.3 + up * 2;
        k.folk.body.rotation.z = Math.sin(time * 3 + k.x) * 0.12;
        if (Math.floor(k.phase) !== before) {
          squash = Math.max(squash, 0.5);
          if (ctx.dist() < 12 && Math.random() < 0.5) squeak(ctx);
        }
      }
      // the whole inflatable wobbles; the floor squashes when someone lands
      squash = Math.max(0, squash - dt * 4);
      base.scale.y = BASE_H * (1 - squash * 0.08);
      base.position.y = base.scale.y / 2;
      walls.scale.y = 1 + Math.sin(time * 6) * 0.012 - squash * 0.02;
      walls.rotation.z = Math.sin(time * 2.3) * 0.008;
      turrets.forEach((tu, i) => {
        tu.rotation.z = Math.sin(time * 2.6 + i * 1.3) * 0.035;
        tu.rotation.x = Math.cos(time * 2.1 + i) * 0.025;
      });
    },
  };
});
