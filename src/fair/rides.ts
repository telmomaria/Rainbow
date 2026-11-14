import * as THREE from 'three';
import { ball, box, cyl, mat, type Folk } from '../venue';
import { registerAttraction } from './fair';
import {
  bake,
  Bulbs,
  circlePts,
  near,
  operator,
  pillars,
  rideThing,
  seatedFolk,
  sweep,
  Track,
  worldHeading,
  worldPitch,
  type Pose,
} from './ridekit';
import type { FairAttraction, FairCtx } from './types';

/**
 * The four big fairground rides: carrossel, carrinhos de choque, montanha-russa, river ride.
 * Each costs 2 coins at the operator's podium (front of the slot, +Z). No text or icons: tapping the ride walks her
 * to the entrance and she gets on; arrows / a tap get her off; timed rides put her off by themselves at the end.
 */

const RAINBOW = [0xff6b6b, 0xff922b, 0xfcc419, 0x51cf66, 0x4dabf7, 0x845ef7, 0xf783ac];
const v3 = () => new THREE.Vector3();

/** Midi note → Hz. */
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/* ================================================================== carrossel */

const SADDLE_Z = 0.26;

/** A carousel animal (horse, giraffe or pig), facing -Z; returns the group and its saddle height. */
function animal(kind: number, color: number, mane: number): THREE.Group {
  const g = new THREE.Group();
  const body = mat(color);
  const dark = mat(0x161616);
  const b = ball(g, body, 1, 0, 0, 0);
  b.scale.set(0.3, 0.3, kind === 2 ? 0.5 : 0.6);
  // legs (galloping)
  for (const [x, z, r] of [[-0.14, -0.35, -0.6], [0.14, -0.35, -0.6], [-0.14, 0.35, 0.6], [0.14, 0.35, 0.6]] as const) {
    const l = box(g, body, 0.09, kind === 2 ? 0.32 : 0.5, 0.09, x, -0.3, z);
    l.rotation.x = r;
  }
  if (kind === 2) {
    // pig: round head with a pink snout, little ears, curly tail
    ball(g, body, 0.24, 0, 0.1, -0.5);
    cyl(g, mat(0xff8fab), 0.1, 0.08, 0, 0.06, -0.73).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      ball(g, dark, 0.035, s * 0.09, 0.18, -0.7);
      const ear = box(g, body, 0.12, 0.12, 0.03, s * 0.14, 0.32, -0.45);
      ear.rotation.z = s * 0.5;
    }
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 10), body);
    tail.position.set(0, 0.1, 0.5);
    g.add(tail);
  } else {
    // horse / giraffe: neck up and forward, head, mane, tail
    const long = kind === 1;
    const neckLen = long ? 0.9 : 0.5;
    const neck = box(g, body, 0.16, neckLen, 0.18, 0, 0.15 + neckLen * 0.4, -0.45 - neckLen * 0.12);
    neck.rotation.x = -0.35;
    const hy = 0.15 + neckLen * 0.85;
    const hz2 = -0.6 - neckLen * 0.28;
    const head = box(g, body, 0.18, 0.2, 0.42, 0, hy, hz2);
    head.rotation.x = 0.25;
    for (const s of [-1, 1]) {
      ball(g, dark, 0.035, s * 0.09, hy + 0.06, hz2 - 0.05);
      box(g, body, 0.05, 0.14, 0.05, s * 0.06, hy + 0.15, hz2 + 0.12);
    }
    box(g, mat(mane), 0.06, neckLen * 0.9, 0.08, 0, 0.2 + neckLen * 0.45, -0.38 - neckLen * 0.05).rotation.x = -0.35;
    const tail = box(g, mat(mane), 0.07, 0.4, 0.07, 0, 0.0, 0.62);
    tail.rotation.x = 0.6;
    if (long) for (const [x, y, z] of [[0.24, 0.1, 0.1], [-0.25, 0.05, -0.2], [0.2, -0.05, 0.3], [-0.22, 0.15, 0.25]] as const) ball(g, mat(0xa0522d), 0.07, x, y, z);
  }
  // saddle (behind the pole, which goes through the animal's middle)
  box(g, mat(0xe03131), 0.34, 0.06, 0.34, 0, 0.29, 0.24);
  box(g, mat(0xfcc419), 0.36, 0.03, 0.06, 0, 0.3, 0.06);
  bake(g);
  return g;
}

registerAttraction('carrossel', (ctx: FairCtx): FairAttraction => {
  const root = new THREE.Group();
  ctx.group.add(root);
  const CZ = -1.0;
  const R = 4.2;
  // fixed base
  cyl(root, mat(0x845ef7), R + 0.3, 0.3, 0, 0.15, CZ).receiveShadow = true;
  // rotating part
  const spin = new THREE.Group();
  spin.position.set(0, 0, CZ);
  root.add(spin);
  cyl(spin, mat(0xffe3ec), R, 0.16, 0, 0.38, 0).receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 6, 40), mat(0xfcc419, 0.2));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.46;
  spin.add(rim);
  cyl(spin, mat(0x99e9f2, 0.35), 0.75, 3.3, 0, 2.1, 0); // mirrored centre column
  cyl(spin, mat(0xff6b6b), 0.85, 0.3, 0, 0.6, 0);
  // striped canopy
  const coneGeo = new THREE.ConeGeometry(R + 0.5, 1.6, 16, 1, true).toNonIndexed();
  const cols: number[] = [];
  const cA = new THREE.Color(0xff6b6b);
  const cB = new THREE.Color(0xffffff);
  const triCount = coneGeo.getAttribute('position').count / 3;
  for (let i = 0; i < triCount; i++) {
    const c = Math.floor(i / 2) % 2 ? cA : cB;
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const canopy = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  canopy.position.y = 4.45;
  canopy.castShadow = true;
  spin.add(canopy);
  const valance = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 0.5, 0.45, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x4dabf7, side: THREE.DoubleSide }));
  valance.position.y = 3.55;
  spin.add(valance);
  ball(spin, mat(0xfcc419, 0.3), 0.25, 0, 5.35, 0);
  const flag = box(spin, mat(0xff6b6b), 0.02, 0.3, 0.45, 0, 5.75, 0.22);
  cyl(spin, mat(0xadb5bd), 0.025, 0.7, 0, 5.6, 0);
  const bulbs = new Bulbs(spin, circlePts(28, R + 0.53, 3.35), 0.07);
  // poles and animals
  const N = 8;
  const RA = 3.1;
  const animals: { a: THREE.Group; phase: number; rider: Folk }[] = [];
  const brass = mat(0xfcc419, 0.15);
  for (let k = 0; k < N; k++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (k / N) * Math.PI * 2;
    spin.add(pivot);
    cyl(pivot, brass, 0.045, 3.2, 0, 1.95, -RA);
    const kind = k % 4 === 1 ? 1 : k % 4 === 3 ? 2 : 0;
    const color = kind === 2 ? 0xffc9d6 : kind === 1 ? 0xffd43b : [0xffffff, 0x9775fa, 0x74c0fc, 0xffa8a8][(k / 2 + Math.floor(ctx.rng() * 4)) % 4];
    const a = animal(kind, color, RAINBOW[(k * 3) % RAINBOW.length]);
    a.position.set(0, 1.2, -RA);
    a.rotation.y = Math.PI / 2; // facing the way it goes round
    pivot.add(a);
    const rider = seatedFolk(a, 0.32, true, ctx.rng);
    rider.group.position.z = SADDLE_Z;
    animals.push({ a, phase: k * 1.3, rider });
  }
  const op = operator(ctx, 2.7, 4.3, 0x845ef7);
  ctx.solid(-R - 0.4, R + 0.4, CZ - R - 0.4, CZ + R + 0.4);

  let speed = 0; // rad/s
  let running = true;
  let cycleT = 0;
  let mine = -1; // animal she sits on
  let rideT = 0;
  let musicT = 0;
  let bar = 0;
  const MAX = 0.5;

  const shuffleRiders = () => animals.forEach((x, i) => (x.rider.group.visible = i !== mine && Math.random() < 0.3));
  shuffleRiders();

  /** A waltz phrase on the organ (original tune), oom-pah-pah underneath. */
  const MELODY = [
    [76, 79, 84], [83, 79, 76], [77, 81, 86], [84, 81, 77],
    [79, 83, 86], [84, 83, 81], [79, 76, 72], [74, 71, 72],
  ];
  const BASS = [48, 48, 53, 53, 43, 43, 48, 43];
  const playBar = (vol: number) => {
    const beat = 0.24;
    const m = MELODY[bar % 8];
    const bs = BASS[bar % 8];
    m.forEach((n, i) => {
      ctx.tone(hz(n), i * beat, beat * 0.9, 'square', 0.022 * vol);
      ctx.tone(hz(n + 12), i * beat, beat * 0.5, 'sine', 0.012 * vol);
    });
    ctx.tone(hz(bs), 0, beat * 0.9, 'triangle', 0.05 * vol);
    for (const i of [1, 2]) ctx.tone(hz(bs + 16), i * beat, beat * 0.4, 'triangle', 0.02 * vol);
    bar++;
    return beat * 3;
  };

  const ride = rideThing(ctx, {
    object: root,
    stand: [0, 5.0],
    off: [-1.6, 5.3],
    radius: 2,
    op,
    board(p) {
      // the free animal nearest to her
      let best = 0;
      let bd = Infinity;
      animals.forEach((x, i) => {
        if (x.rider.group.visible) return;
        x.a.updateWorldMatrix(true, false);
        const w = x.a.getWorldPosition(v3());
        const d = Math.hypot(w.x - p.x, w.z - p.z);
        if (d < bd) [bd, best] = [d, i];
      });
      mine = best;
      animals[best].rider.group.visible = false;
      rideT = 0;
      running = true;
      return best;
    },
    pose(i) {
      const a = animals[i].a;
      a.updateWorldMatrix(true, false);
      return { pos: a.localToWorld(new THREE.Vector3(0, 0.33, SADDLE_Z)), heading: worldHeading(a), tilt: 0 };
    },
    done: () => rideT > 38 && speed < 0.03,
    leave() {
      mine = -1;
      running = false;
      cycleT = 0;
      op.cheer(false);
    },
  });

  return {
    things: [ride.thing],
    update(dt) {
      op.update(dt);
      const on = ride.riding();
      if (on) {
        rideT += dt;
        running = rideT < 34;
        op.cheer(running);
      } else {
        // empty: turns 25 s, rests 6 s (other kids get on and off)
        cycleT += dt;
        if (running && cycleT > 25) [running, cycleT] = [false, 0];
        else if (!running && cycleT > 6) {
          [running, cycleT] = [true, 0];
          shuffleRiders();
        }
      }
      const target = running ? MAX : 0;
      speed += THREE.MathUtils.clamp(target - speed, -0.12 * dt, 0.15 * dt);
      spin.rotation.y += speed * dt;
      const k = speed / MAX;
      for (const x of animals) {
        x.phase += dt * 2.2 * k;
        x.a.position.y = 1.2 + Math.sin(x.phase) * 0.28 * Math.min(1, k * 1.5);
      }
      flag.rotation.y = Math.sin(spin.rotation.y * 3) * 0.2;
      bulbs.update(dt, 2 + 6 * k);
      // organ while turning
      musicT -= dt;
      const vol = on ? 1 : near(ctx, 32);
      if (musicT <= 0 && k > 0.4 && vol > 0) musicT = playBar(vol);
      else if (k <= 0.4) musicT = 0;
    },
  };
});

/* ================================================================== carrinhos de choque */

registerAttraction('choque', (ctx: FairCtx): FairAttraction => {
  const root = new THREE.Group();
  ctx.group.add(root);
  const X0 = -5.6;
  const X1 = 5.6;
  const Z0 = -5.9;
  const Z1 = 2.8;
  const CR = 0.85; // car radius
  // floor and rubber edge
  const floor = box(root, mat(0x5c677d), X1 - X0, 0.12, Z1 - Z0, 0, 0.06, (Z0 + Z1) / 2);
  floor.castShadow = false;
  const edge = (x0: number, x1: number, z0: number, z1: number, i: number) =>
    box(root, mat(i % 2 ? 0xfcc419 : 0xff6b6b), x1 - x0, 0.5, z1 - z0, (x0 + x1) / 2, 0.25, (z0 + z1) / 2);
  const T = 0.3;
  let e = 0;
  for (let x = X0; x < X1 - 0.01; x += (X1 - X0) / 6) edge(x, x + (X1 - X0) / 6, Z0 - T, Z0, e++);
  // front: the exit gate in the middle (driving into it = getting off), an arch with bulbs over it
  const GX = 1.2;
  for (const [a, b] of [[X0, (X0 - GX) / 2], [(X0 - GX) / 2, -GX], [GX, (X1 + GX) / 2], [(X1 + GX) / 2, X1]] as const) edge(a, b, Z1, Z1 + T, e++);
  box(root, mat(0x51cf66), GX * 2, 0.35, T, 0, 0.175, Z1 + T / 2);
  for (const s of [-1, 1]) cyl(root, mat(0x51cf66), 0.1, 2.6, s * (GX + 0.1), 1.3, Z1 + T / 2);
  const gateArch = new THREE.Mesh(new THREE.TorusGeometry(GX + 0.1, 0.1, 6, 16, Math.PI), mat(0x51cf66, 0.2));
  gateArch.position.set(0, 2.6, Z1 + T / 2);
  root.add(gateArch);
  const gateBulbs = new Bulbs(root, Array.from({ length: 7 }, (_, i) => {
    const a = (i / 6) * Math.PI;
    return new THREE.Vector3(Math.cos(a) * (GX + 0.1), 2.6 + Math.sin(a) * (GX + 0.1), Z1 + T / 2 + 0.12);
  }), 0.07, 0xb2f2bb);
  for (let z = Z0; z < Z1 - 0.01; z += (Z1 - Z0) / 5) {
    edge(X0 - T, X0, z, z + (Z1 - Z0) / 5, e);
    edge(X1, X1 + T, z, z + (Z1 - Z0) / 5, e++);
  }
  // corner posts, top frame (open at the front so the camera sees her) and the wire net the cars' poles touch
  const H = 4;
  for (const [x, z] of [[X0 - T, Z0 - T], [X1 + T, Z0 - T], [X0 - T, Z1 + T], [X1 + T, Z1 + T]] as const) cyl(root, mat(0x4dabf7), 0.14, H, x, H / 2, z);
  const frame = mat(0x845ef7);
  box(root, frame, X1 - X0 + 2 * T, 0.3, 0.2, 0, H, Z0 - T);
  box(root, frame, 0.2, 0.3, Z1 - Z0 + 2 * T, X0 - T, H, (Z0 + Z1) / 2);
  box(root, frame, 0.2, 0.3, Z1 - Z0 + 2 * T, X1 + T, H, (Z0 + Z1) / 2);
  const net: number[] = [];
  for (let x = X0; x <= X1 + 0.01; x += (X1 - X0) / 8) net.push(x, H - 0.05, Z0, x, H - 0.05, Z1);
  for (let z = Z0; z <= Z1 + 0.01; z += (Z1 - Z0) / 6) net.push(X0, H - 0.05, z, X1, H - 0.05, z);
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(net, 3));
  root.add(new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0x868e96 })));
  const bulbs = new Bulbs(
    root,
    Array.from({ length: 18 }, (_, i) => new THREE.Vector3(X0 + ((X1 - X0) * (i + 0.5)) / 18, H - 0.2, Z0 - T - 0.12)),
    0.08,
    0xffec99,
  );
  // while she drives nothing of the ride is clickable (taps anywhere steer her car: tapping outside past the gate
  // drives her out)
  const booth = new THREE.Group();
  ctx.group.add(booth);
  const op = operator(ctx, 2.7, 4.3, 0xff6b6b);
  ctx.solid(X0 - T - 0.1, X1 + T + 0.1, Z0 - T - 0.1, Z1 + T + 0.1, 0.6);

  // cars
  const COLORS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xfcc419, 0xcc5de8];
  interface Car {
    g: THREE.Group;
    body: THREE.Group;
    spark: THREE.Mesh;
    x: number;
    z: number;
    h: number;
    vx: number;
    vz: number;
    th: number;
    tu: number;
    ai: number; // time to the next AI decision
    bounce: number;
    cool: number;
    driver: Folk | null;
  }
  const PARK = { x: 0, z: Z1 - 1.2, h: 0 };
  const cars: Car[] = COLORS.map((c, i) => {
    const g = new THREE.Group();
    root.add(g);
    const body = new THREE.Group();
    g.add(body);
    const skirt = cyl(body, mat(0x212529), CR, 0.26, 0, 0.27, 0);
    skirt.castShadow = false;
    box(body, mat(c), 1.2, 0.36, 1.45, 0, 0.55, 0);
    ball(body, mat(c), 0.42, 0, 0.5, -0.62).scale.set(0.6, 0.3, 0.32);
    box(body, mat(c), 1.05, 0.55, 0.22, 0, 0.88, 0.6);
    box(body, mat(0xffffff), 0.7, 0.18, 0.5, 0, 0.75, 0.15); // seat
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14), mat(0x343a40));
    wheel.position.set(0, 0.95, -0.35);
    wheel.rotation.x = -1.0;
    body.add(wheel);
    cyl(body, mat(0xadb5bd), 0.035, H - 1.05, 0, 0.9 + (H - 1.05) / 2, 0.66);
    const spark = ball(body, new THREE.MeshBasicMaterial({ color: 0xfff3bf }), 0.09, 0, H - 0.12, 0.66);
    bake(body);
    const parked = i === 0;
    const car: Car = {
      g,
      body,
      spark,
      x: parked ? PARK.x : -3.5 + (i - 1) * 2.3,
      z: parked ? PARK.z : -2.5 + (i % 2) * 1.6,
      h: parked ? 0 : Math.random() * 6,
      vx: 0,
      vz: 0,
      th: 0,
      tu: 0,
      ai: 0,
      bounce: 0,
      cool: 0,
      driver: parked ? null : seatedFolk(body, 0.84, false, ctx.rng),
    };
    if (car.driver) car.driver.group.visible = true;
    g.position.set(car.x, 0.12, car.z);
    g.rotation.y = car.h;
    return car;
  });
  let mine: Car | null = null;
  let sessionT = 0;
  let inTh = 0;
  let inTu = 0;
  let hornT = 0;
  let exitT = 0; // pushing her car into the exit gate

  const boing = (vol: number) => {
    if (vol <= 0.01) return;
    sweep(520, 190, 0.32, 'sine', 0.16 * vol);
    sweep(780, 300, 0.18, 'triangle', 0.05 * vol, 0.02);
  };

  const ride = rideThing(ctx, {
    object: root,
    ridingObject: booth,
    stand: [0, 4.5],
    off: [0, 3.9], // just outside the exit gate
    radius: 2,
    op,
    board() {
      mine = cars[0];
      sessionT = 0;
      inTh = inTu = exitT = 0;
      sweep(300, 900, 0.25, 'square', 0.04); // power on
      return 0;
    },
    pose() {
      const c = cars[0];
      c.body.updateWorldMatrix(true, false);
      return {
        pos: c.body.localToWorld(new THREE.Vector3(0, 0.84, 0.15)),
        heading: worldHeading(c.g),
        tilt: c.body.rotation.x,
      };
    },
    steer(_dt, th, tu) {
      inTh = th;
      inTu = tu;
    },
    done: () => sessionT > 60 || exitT > 0.5,
    leave() {
      mine = null;
      sweep(700, 200, 0.4, 'square', 0.03); // power off
      op.cheer(false);
    },
  });

  const xMin = X0 + CR;
  const xMax = X1 - CR;
  const zMin = Z0 + CR;
  const zMax = Z1 - CR;
  const fwd = (h: number) => [-Math.sin(h), -Math.cos(h)] as const;

  return {
    things: [ride.thing],
    update(dt) {
      op.update(dt);
      const on = ride.riding() && mine !== null;
      if (on) {
        sessionT += dt;
        op.cheer(true);
        const c = cars[0];
        const out = -Math.cos(c.h) > 0.3 && inTh > 0 && Math.abs(c.x) < GX + 0.2 && c.z > zMax - 0.1;
        exitT = out ? exitT + dt : Math.max(0, exitT - dt * 0.5);
      }
      bulbs.update(dt, 4);
      gateBulbs.update(dt, on ? 8 : 2);
      for (const c of cars) {
        c.cool -= dt;
        if (c === mine && on) {
          c.th = inTh;
          c.tu = inTu;
        } else if (c === cars[0]) {
          // the empty car drives itself back to its parking spot by the entrance
          const dx = PARK.x - c.x;
          const dz = PARK.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            let diff = Math.atan2(-dx, -dz) - c.h;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            c.tu = THREE.MathUtils.clamp(diff * 2, -1, 1);
            c.th = Math.abs(diff) < 1.2 ? Math.min(0.6, d) : 0.1;
          } else {
            c.th = 0;
            let diff = PARK.h - c.h;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            c.tu = THREE.MathUtils.clamp(diff * 2, -1, 1) * 0.5;
          }
        } else {
          // AI: wander, and turn away from the edges
          c.ai -= dt;
          if (c.ai <= 0) {
            c.ai = 0.8 + Math.random() * 2;
            c.tu = (Math.random() - 0.5) * 1.6;
            c.th = 0.6 + Math.random() * 0.4;
          }
          const [fx, fz] = fwd(c.h);
          const ax = c.x + fx * 1.8;
          const az = c.z + fz * 1.8;
          if (ax < xMin || ax > xMax || az < zMin || az > zMax) {
            let diff = Math.atan2(c.x, c.z - (Z0 + Z1) / 2) - c.h; // heading towards the centre
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            c.tu = diff > 0 ? 1 : -1;
          }
        }
        // drive: forward push, strong sideways grip, gentle friction
        const [fx, fz] = fwd(c.h);
        const acc = (c === mine ? 5 : 3.6) * c.th;
        c.vx += fx * acc * dt;
        c.vz += fz * acc * dt;
        const along = c.vx * fx + c.vz * fz;
        const sx = c.vx - along * fx;
        const sz = c.vz - along * fz;
        const grip = Math.exp(-4 * dt);
        c.vx = along * fx + sx * grip;
        c.vz = along * fz + sz * grip;
        const fr = Math.exp(-1.3 * dt);
        c.vx *= fr;
        c.vz *= fr;
        const sp = Math.hypot(c.vx, c.vz);
        const max = c === mine ? 3.4 : 2.8;
        if (sp > max) {
          c.vx *= max / sp;
          c.vz *= max / sp;
        }
        c.h += c.tu * 2.2 * dt;
        c.x += c.vx * dt;
        c.z += c.vz * dt;
        // rubber edge
        let hit = 0;
        if (c.x < xMin) [c.x, c.vx, hit] = [xMin, Math.abs(c.vx) * 0.6, Math.abs(c.vx)];
        if (c.x > xMax) [c.x, c.vx, hit] = [xMax, -Math.abs(c.vx) * 0.6, Math.abs(c.vx)];
        if (c.z < zMin) [c.z, c.vz, hit] = [zMin, Math.abs(c.vz) * 0.6, Math.abs(c.vz)];
        if (c.z > zMax) [c.z, c.vz, hit] = [zMax, -Math.abs(c.vz) * 0.6, Math.abs(c.vz)];
        if (hit > 0.8) bump(c, null, hit);
      }
      // car against car (circles): push apart, bounce off each other
      for (let i = 0; i < cars.length; i++)
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i];
          const b = cars[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d >= CR * 2 || d < 1e-4) continue;
          const nx = dx / d;
          const nz = dz / d;
          const push = (CR * 2 - d) / 2;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rv < 0) {
            const j2 = (-(1 + 0.9) * rv) / 2;
            a.vx -= j2 * nx;
            a.vz -= j2 * nz;
            b.vx += j2 * nx;
            b.vz += j2 * nz;
            if (-rv > 0.5) bump(a, b, -rv);
          }
        }
      hornT -= dt;
      for (const c of cars) {
        c.x = THREE.MathUtils.clamp(c.x, xMin, xMax);
        c.z = THREE.MathUtils.clamp(c.z, zMin, zMax);
        c.g.position.set(c.x, 0.12, c.z);
        c.g.rotation.y = c.h;
        c.bounce *= Math.exp(-5 * dt);
        c.body.position.y = Math.abs(Math.sin(c.bounce * 25)) * 0.12 * c.bounce;
        c.body.rotation.x = Math.sin(c.bounce * 18) * 0.1 * c.bounce;
        c.spark.visible = Math.hypot(c.vx, c.vz) > 0.5 && Math.random() < 0.3;
      }
    },
  };

  function bump(a: Car, b: Car | null, strength: number): void {
    const s = Math.min(1, strength / 2.5);
    a.bounce = Math.max(a.bounce, s);
    if (b) b.bounce = Math.max(b.bounce, s);
    const hers = mine !== null && (a === mine || b === mine);
    if (a.cool > 0 && !hers) return;
    a.cool = 0.4;
    if (b) b.cool = 0.4;
    boing(hers ? 0.4 + s * 0.6 : near(ctx, 25) * 0.35 * s);
    if (hers && hornT <= 0 && Math.random() < 0.3) {
      hornT = 3;
      // a friendly "honk-honk" from the other car
      ctx.tone(392, 0.15, 0.12, 'square', 0.03);
      ctx.tone(392, 0.32, 0.16, 'square', 0.03);
    }
  }
});

/* ================================================================== montanha-russa */

registerAttraction('montanha', (ctx: FairCtx): FairAttraction => {
  const root = new THREE.Group();
  ctx.group.add(root);
  const SY = 0.9; // station rail height
  const track = new Track(
    [
      [3, SY, 3.4],
      [-3, SY, 3.4],
      [-6.6, 1.2, 2.5],
      [-8.2, 2.4, 0.2],
      [-8.2, 4.4, -2.6],
      [-7.0, 5.9, -4.6],
      [-4.8, 5.8, -5.3],
      [-1.2, 1.5, -5.2],
      [2.4, 3.3, -5.0],
      [6.4, 2.4, -4.7],
      [8.3, 1.7, -2.2],
      [8.2, 2.6, 0.6],
      [6.6, 1.3, 2.8],
    ],
    420,
  );
  const L = track.length;
  // the lift: climbing on the left side before the top
  const yTop = Math.max(...track.pts.map((p) => p.y));
  const isLift = track.pts.map((p, i) => p.x < -5 && (track.tan[i].y > 0.04 || p.y > yTop - 0.4) && p.z < 1.5);
  const sStation = (() => {
    let best = 0;
    let bd = Infinity;
    track.pts.forEach((p, i) => {
      const d = Math.hypot(p.x + 1.6, p.z - 3.4);
      if (d < bd) [bd, best] = [d, i];
    });
    return best * track.step;
  })();
  // drop: first point after the lift where the track points down steeply
  let sDrop = 0;
  const iTop = track.pts.findIndex((p) => p.y === yTop);
  const dTop = track.wrap(iTop * track.step - sStation);
  {
    for (let k = 0; k < track.n; k++) {
      const i = (iTop + k) % track.n;
      if (track.tan[i].y < -0.25) {
        sDrop = i * track.step;
        break;
      }
    }
  }

  // rails (two tubes + a coloured spine), ties and rainbow supports
  const rails: THREE.Vector3[][] = [[], [], []];
  for (let i = 0; i < track.n; i++) {
    const p = track.pts[i];
    const s = track.side[i];
    rails[0].push(p.clone().addScaledVector(s, 0.38));
    rails[1].push(p.clone().addScaledVector(s, -0.38));
    rails[2].push(p.clone().setY(p.y - 0.18));
  }
  rails.forEach((pts, k) => {
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), track.n, k === 2 ? 0.12 : 0.06, 6, true);
    const m = new THREE.Mesh(tube, mat(k === 2 ? 0xff6b6b : 0xdee2e6));
    m.castShadow = true;
    root.add(m);
  });
  const tieN = Math.floor(L / 0.7);
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.95, 0.07, 0.16), mat(0x845ef7), tieN);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tieN; i++) {
    track.place(dummy, (i / tieN) * L, -0.05);
    dummy.updateMatrix();
    ties.setMatrixAt(i, dummy.matrix);
  }
  root.add(ties);
  const sup: { x: number; z: number; top: number }[] = [];
  for (let s = 0; s < L; s += 1.6) {
    const i = track.index(s);
    const p = track.pts[i];
    if (p.y < 1.0) continue;
    sup.push({ x: p.x, z: p.z, top: p.y - 0.25 });
  }
  pillars(root, sup, 0.09, RAINBOW);
  // station: a deck by the track, a striped roof on thin posts, bulbs
  box(root, mat(0xffd8a8), 7.2, 0.55, 1.0, 0, 0.275, 4.5).receiveShadow = true;
  box(root, mat(0xffc078), 7.2, 0.28, 0.4, 0, 0.14, 5.15);
  for (const x of [-3.5, 3.5]) {
    cyl(root, mat(0xffffff), 0.07, 2.6, x, 1.85, 4.9);
    ball(root, mat(0xfcc419, 0.4), 0.14, x, 3.2, 4.9);
  }
  box(root, mat(0x4dabf7), 7.4, 0.12, 0.25, 0, 3.15, 4.9);
  const bulbs = new Bulbs(root, Array.from({ length: 14 }, (_, i) => new THREE.Vector3(-3.25 + i * 0.5, 3.0, 4.9)), 0.07);

  // the train: 3 cars, the first one has a smiley caterpillar face
  const GAP = 1.75;
  const cars = [0, 1, 2].map((k) => {
    const c = new THREE.Group();
    root.add(c);
    const col = [0xff6b6b, 0xfcc419, 0x4dabf7][k];
    box(c, mat(col), 1.05, 0.5, 1.45, 0, 0.42, 0);
    box(c, mat(0xffffff), 0.8, 0.12, 0.7, 0, 0.62, 0.15); // seat
    box(c, mat(col), 0.95, 0.45, 0.15, 0, 0.82, 0.55); // backrest
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 12, Math.PI), mat(0xadb5bd));
    bar.position.set(0, 0.72, -0.25);
    c.add(bar);
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.5, 0.5]) cyl(c, mat(0x343a40), 0.1, 0.12, sx, 0.1, sz).rotation.z = Math.PI / 2;
    if (k === 0) {
      const head = ball(c, mat(0x51cf66), 0.42, 0, 0.62, -0.85);
      head.castShadow = true;
      for (const s of [-1, 1]) {
        ball(c, mat(0xffffff), 0.11, s * 0.17, 0.75, -1.18);
        ball(c, mat(0x161616), 0.055, s * 0.17, 0.76, -1.27);
        cyl(c, mat(0x161616), 0.02, 0.35, s * 0.15, 1.15, -0.85);
        ball(c, mat(0xff6b6b, 0.3), 0.06, s * 0.15, 1.33, -0.85);
      }
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 10, Math.PI), mat(0x161616));
      smile.position.set(0, 0.55, -1.22);
      smile.rotation.z = Math.PI;
      c.add(smile);
    }
    bake(c);
    return { g: c, rider: seatedFolk(c, 0.68, false, ctx.rng) };
  });
  const op = operator(ctx, -4.6, 5.2, 0x51cf66);
  ctx.solid(-9.5, 9.5, -6.1, 4.0);
  ctx.solid(-3.6, 3.6, 4.0, 5.35, 0.6);

  let s = sStation; // arc length of the front car
  let v = 0;
  let state: 'dwell' | 'run' = 'dwell';
  let stateT = 4;
  let her: 'none' | 'wait' | 'seated' | 'lap' | 'end' = 'none';
  let lapGone = 0;
  let clackT = 0;
  let saidUii = false;
  const WAIT = ctx.toWorld(0, 0.55, 4.5);

  const placeTrain = () => cars.forEach((c, k) => track.place(c.g, s - k * GAP, 0.05));
  placeTrain();

  const ride = rideThing(ctx, {
    object: root,
    stand: [0, 5.75],
    off: [2.2, 5.85],
    radius: 1.9,
    op,
    board() {
      cars[0].rider.group.visible = false;
      her = state === 'dwell' ? 'seated' : 'wait';
      if (state === 'dwell') stateT = 3;
      saidUii = false;
      return 0;
    },
    pose(): Pose {
      if (her === 'wait') return { pos: WAIT.clone(), heading: ctx.heading(Math.PI / 2), tilt: 0, stand: true };
      const c = cars[0].g;
      c.updateWorldMatrix(true, false);
      return { pos: c.localToWorld(new THREE.Vector3(0, 0.7, 0.12)), heading: worldHeading(c), tilt: worldPitch(c) };
    },
    done: () => her === 'end',
    leave() {
      her = 'none';
      op.cheer(false);
    },
  });

  return {
    things: [ride.thing],
    update(dt) {
      op.update(dt);
      bulbs.update(dt, 4);
      const on = ride.riding();
      const vol = on && her !== 'wait' ? 1 : near(ctx, 35);
      if (state === 'dwell') {
        v = 0;
        stateT -= dt;
        if (on && her === 'wait') {
          her = 'seated';
          stateT = 3;
        }
        if (stateT <= 0) {
          state = 'run';
          lapGone = 0;
          if (on && her === 'seated') {
            her = 'lap';
            op.cheer(true);
          }
          ctx.tone(880, 0, 0.12, 'square', 0.04 * vol); // departure bell
          ctx.tone(880, 0.18, 0.12, 'square', 0.04 * vol);
        }
      } else {
        const i = track.index(s);
        const p = track.pts[i];
        // out of the station and up the lift slowly; from the top on, speed comes from the height (energy)
        const want0 = lapGone < dTop ? (isLift[i] ? 1.1 : 1.8) : Math.max(2.2, Math.sqrt(1.1 * 1.1 + 2 * 6.5 * Math.max(0, yTop - p.y)) * 0.85);
        let want = want0;
        if (isLift[i] && lapGone < dTop) {
          clackT -= dt;
          if (clackT <= 0 && vol > 0) {
            clackT = 0.22;
            ctx.tone(95, 0, 0.04, 'square', 0.05 * vol);
            ctx.tone(1300, 0, 0.02, 'square', 0.012 * vol);
          }
        }
        // brake into the station
        const toStop = L - lapGone;
        if (toStop < 10) want = Math.min(want, 0.6 + toStop * 0.35);
        v += THREE.MathUtils.clamp(want - v, -6 * dt, 4 * dt);
        const prev = s;
        const ds = Math.min(v * dt, toStop);
        s = track.wrap(s + ds);
        lapGone += ds;
        // passing the top of the drop: whoosh (and a happy scream when she is on it)
        if (track.wrap(sDrop - prev) < ds) {
          ctx.noise(1.6, 0.18 * vol, 'bandpass', 700);
          if (on && her === 'lap' && !saidUii) {
            saidUii = true;
            ctx.speak(['Uiii!']);
          }
        }
        if (lapGone >= L - 0.01) {
          s = sStation;
          state = 'dwell';
          stateT = 9;
          ctx.noise(0.6, 0.06 * vol, 'highpass', 2500); // brakes hiss
          if (her === 'lap') her = 'end';
          // other riders change while it's in the station
          cars.forEach((c, k) => (c.rider.group.visible = !(k === 0 && on) && Math.random() < 0.35));
        }
      }
      placeTrain();
    },
  };
});

/* ================================================================== river ride */

/** A rippled water texture (scrolled along the channel). */
function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3d9be9';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let x = 0; x <= 64; x += 4) {
      const y = 10 + k * 21 + Math.sin((x / 64) * Math.PI * 2 + k) * 4;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

registerAttraction('river', (ctx: FairCtx): FairAttraction => {
  const root = new THREE.Group();
  ctx.group.add(root);
  const WY = 0.45; // water level on the ground
  const track = new Track(
    [
      [3, WY, 3.6],
      [-3, WY, 3.6],
      [-7.0, WY, 2.8],
      [-8.4, WY, 0.0],
      [-7.6, 1.0, -3.4],
      [-5.0, 2.3, -5.0],
      [-1.8, 3.4, -5.1],
      [1.2, 3.45, -5.1],
      [4.4, 0.55, -4.7],
      [6.4, WY, -3.9],
      [8.3, WY, -1.4],
      [8.0, WY, 1.9],
      [6.2, WY, 3.4],
    ],
    360,
  );
  const L = track.length;
  const slope = track.tan.map((t) => t.y);
  const inStation = track.pts.map((p) => Math.abs(p.z - 3.6) < 0.35 && Math.abs(p.x) < 3.2);
  // splash point: where the chute flattens out at the bottom
  let sSplash = 0;
  {
    const iSteep = slope.findIndex((y) => y < -0.4);
    for (let k = 0; k < track.n; k++) {
      const i = (iSteep + k) % track.n;
      if (slope[i] > -0.12) {
        sSplash = i * track.step;
        break;
      }
    }
  }

  // channel: water surface (scrolling ripples) + trough walls and floor
  const tex = waterTexture();
  tex.repeat.set(1, 1);
  const water = new THREE.Mesh(
    track.strips([[[-0.78, 0], [0.78, 0]]], 1.6),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, emissive: 0x1c6fc0, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
  );
  water.receiveShadow = true;
  root.add(water);
  const trough = new THREE.Mesh(
    track.strips(
      [
        [[-0.85, -0.45], [-0.85, 0.28]],
        [[0.85, -0.45], [0.85, 0.28]],
        [[-0.85, -0.45], [0.85, -0.45]],
        [[-0.85, 0.28], [-1.05, 0.28]],
        [[0.85, 0.28], [1.05, 0.28]],
        [[-1.05, 0.28], [-1.05, -0.45]],
        [[1.05, 0.28], [1.05, -0.45]],
      ],
      2,
    ),
    new THREE.MeshStandardMaterial({ color: 0xc08552, roughness: 0.8, side: THREE.DoubleSide }),
  );
  trough.castShadow = true;
  root.add(trough);
  const sup: { x: number; z: number; top: number }[] = [];
  for (let s = 0; s < L; s += 1.3) {
    const p = track.pts[track.index(s)];
    if (p.y < 0.8) continue;
    for (const o of [-0.8, 0.8]) {
      const sd = track.side[track.index(s)];
      sup.push({ x: p.x + sd.x * o, z: p.z + sd.z * o, top: p.y - 0.45 });
    }
  }
  pillars(root, sup, 0.1, [0x8d5524, 0xa0522d]);
  // a little rock-and-palm island in the middle, and the dock
  ball(root, mat(0x868e96), 1.4, 0.5, 0, -1).scale.set(1.6, 0.7, 1.1);
  ball(root, mat(0xadb5bd), 0.8, -1.5, 0, -0.3).scale.set(1, 0.8, 1);
  for (const [x, z] of [[1.2, -1.2], [-1.6, -0.2]] as const) {
    const trunk = cyl(root, mat(0x8d5524), 0.1, 2.6, x, 1.6, z);
    trunk.rotation.z = 0.12;
    for (let k = 0; k < 5; k++) {
      const leaf = box(root, mat(0x40c057), 0.25, 0.05, 1.2, x + 0.15, 2.95, z);
      leaf.rotation.y = (k / 5) * Math.PI * 2;
      leaf.rotation.x = 0.35;
      leaf.translateZ(0.5);
    }
  }
  box(root, mat(0xd4a373), 7.2, 0.45, 0.8, 0, 0.225, 4.95).receiveShadow = true;
  for (const x of [-3.4, 3.4]) {
    cyl(root, mat(0x4dabf7), 0.07, 2.4, x, 1.2, 5.25);
    ball(root, mat(0xfcc419, 0.4), 0.14, x, 2.45, 5.25);
  }
  const bulbs = new Bulbs(root, Array.from({ length: 14 }, (_, i) => new THREE.Vector3(-3.25 + i * 0.5, 2.3, 5.25)), 0.07, 0x99e9f2);
  box(root, mat(0x4dabf7), 7.0, 0.1, 0.12, 0, 2.38, 5.25);

  // splash particles (one instanced mesh)
  const NP = 48;
  const drops = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0xd0ebff, transparent: true, opacity: 0.85, emissive: 0x4dabf7, emissiveIntensity: 0.3 }),
    NP,
  );
  drops.frustumCulled = false;
  root.add(drops);
  const parts = Array.from({ length: NP }, () => ({ p: v3(), v: v3(), life: 0 }));
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NP; i++) drops.setMatrixAt(i, hide);
  const mtx = new THREE.Matrix4();
  const splash = (at: THREE.Vector3, big: boolean) => {
    let n = big ? NP : 24;
    for (const q of parts) {
      if (n <= 0) break;
      if (q.life > 0) continue;
      n--;
      q.p.copy(at);
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 2.5;
      q.v.set(Math.cos(a) * r, 3 + Math.random() * 3.5, Math.sin(a) * r);
      q.life = 1.2;
    }
  };

  // log boats
  interface Log {
    g: THREE.Group;
    s: number;
    v: number;
    gone: number;
    rider: Folk;
  }
  const logs: Log[] = [0, 1, 2, 3].map((k) => {
    const g = new THREE.Group();
    root.add(g);
    const wood = mat(0x9c6644);
    const body = cyl(g, wood, 0.45, 1.9, 0, 0.12, 0);
    body.rotation.x = Math.PI / 2;
    body.scale.set(0.5, 1.9, 0.38);
    box(g, mat(0x5c3d2e), 0.62, 0.08, 1.2, 0, 0.3, 0.05); // hollow inside
    for (const z of [-0.95, 0.95]) {
      const cap = cyl(g, mat(0xe6b980), 0.42, 0.04, 0, 0.12, z);
      cap.rotation.x = Math.PI / 2;
      cap.scale.set(0.48, 0.04, 0.36);
    }
    ball(g, mat(0x40c057), 0.12, 0.15, 0.48, -0.8); // a little leaf sprout on the nose
    bake(g);
    const l = { g, s: track.wrap(k * (L / 4) + 2), v: 1.5, gone: 0, rider: seatedFolk(g, 0.42, false, ctx.rng) };
    track.place(g, l.s, 0.02);
    return l;
  });
  const op = operator(ctx, -4.6, 5.3, 0x4dabf7);
  ctx.solid(-9.6, 9.6, -6.1, 4.55);
  ctx.solid(-3.6, 3.6, 4.55, 5.35, 0.5);

  let mine: Log | null = null;
  let her: 'none' | 'wait' | 'ride' | 'end' = 'none';
  let flowT = 0;
  const WAIT = ctx.toWorld(0, 0.45, 4.95);
  const pos = v3();

  const ride = rideThing(ctx, {
    object: root,
    stand: [0, 5.85],
    off: [2.2, 5.9],
    radius: 1.9,
    op,
    board() {
      her = 'wait';
      mine = null;
      return 0;
    },
    pose(): Pose {
      if (!mine) return { pos: WAIT.clone(), heading: ctx.heading(Math.PI / 2), tilt: 0, stand: true };
      mine.g.updateWorldMatrix(true, false);
      return { pos: mine.g.localToWorld(new THREE.Vector3(0, 0.42, 0.05)), heading: worldHeading(mine.g), tilt: worldPitch(mine.g) };
    },
    done: () => her === 'end',
    leave() {
      her = 'none';
      mine = null;
      op.cheer(false);
    },
  });

  return {
    things: [ride.thing],
    update(dt) {
      op.update(dt);
      bulbs.update(dt, 3);
      flowT += dt;
      tex.offset.y = -flowT * 1.3;
      const on = ride.riding();
      // she boards the first log in the station
      if (on && her === 'wait') {
        const l = logs.find((x) => inStation[track.index(x.s)] && !x.rider.group.visible);
        if (l) {
          mine = l;
          l.gone = 0;
          her = 'ride';
          op.cheer(true);
          ctx.noise(0.4, 0.08, 'lowpass', 600); // a little slosh as she steps in
        }
      }
      // logs flow; on the ramp a conveyor pulls them up, the chute is fast, the station slow
      const order = [...logs].sort((a, b) => a.s - b.s);
      for (let k = 0; k < order.length; k++) {
        const l = order[k];
        const ahead = order[(k + 1) % order.length];
        const gap = track.wrap(ahead.s - l.s);
        const i = track.index(l.s);
        let want = inStation[i] ? 0.8 : 1.4;
        if (slope[i] > 0.08) want = 1.1;
        if (slope[i] < -0.15) l.v = Math.min(7, l.v + 9 * -slope[i] * dt);
        else l.v += THREE.MathUtils.clamp(want - l.v, -3.5 * dt, 1.5 * dt);
        if (gap < 3.2) l.v = Math.min(l.v, Math.max(0, gap - 2.4) * 1.2);
        const prev = l.s;
        const ds = l.v * dt;
        l.s = track.wrap(l.s + ds);
        l.gone += ds;
        track.place(l.g, l.s, 0.02 + Math.sin(flowT * 2 + k) * 0.03);
        l.g.rotateZ(Math.sin(flowT * 1.6 + k * 2) * 0.05); // rocking
        if (track.wrap(sSplash - prev) < ds) {
          track.at(sSplash, pos);
          const hers = l === mine;
          const vol = hers ? 1 : near(ctx, 35);
          splash(pos.clone().setY(pos.y + 0.2), hers || vol > 0.3);
          if (vol > 0) {
            ctx.noise(1.0, 0.32 * vol, 'lowpass', 900);
            ctx.noise(0.7, 0.12 * vol, 'highpass', 3000, 0.05);
          }
        }
        if (l === mine && her === 'ride' && l.gone > L * 0.8 && inStation[track.index(l.s)]) her = 'end';
        // other riders hop on and off in the station
        if (l !== mine && inStation[i] && !inStation[track.index(prev - 0.5)]) l.rider.group.visible = Math.random() < 0.4;
      }
      // splash drops
      let any = false;
      for (let i = 0; i < NP; i++) {
        const q = parts[i];
        if (q.life <= 0) continue;
        any = true;
        q.life -= dt;
        q.v.y -= 9.8 * dt;
        q.p.addScaledVector(q.v, dt);
        if (q.life <= 0 || q.p.y < 0) {
          q.life = 0;
          drops.setMatrixAt(i, hide);
        } else drops.setMatrixAt(i, mtx.makeTranslation(q.p.x, q.p.y, q.p.z));
      }
      if (any || drops.userData.dirty) drops.instanceMatrix.needsUpdate = true;
      drops.userData.dirty = any;
    },
  };
});
