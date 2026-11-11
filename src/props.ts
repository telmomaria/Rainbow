import * as THREE from 'three';
import { SPAWN, onRoad, type Interactable, type Obstacle } from './world';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';

/**
 * Playful props scattered around the placeholder world (swing, fountain, floor xylophone, cat, dog…).
 * Nothing marks them as interactive: the child walks into them and the world reacts with animation,
 * sound and little particles only (see CLAUDE.md "Interatividade sem UI").
 */

const TAU = Math.PI * 2;

interface Spot {
  x: number;
  z: number;
  /** Rotation about Y; props are modelled with their "front" facing +Z. */
  rot: number;
}

interface Kit {
  scene: THREE.Scene;
  sparks: Sparks;
  mat(color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  group(at: Spot): THREE.Group;
  /** Solid footprint: local box (centre lx,lz; half-sizes hx,hz) turned into a world AABB. */
  block(at: Spot, lx: number, lz: number, hx: number, hz: number): void;
}

/** Visible mesh helper: positioned, casting shadows, added to parent. */
function mk(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Damped spring step, substepped so it feels the same at any frame rate. */
function spring(s: { x: number; v: number }, target: number, k: number, c: number, dt: number): void {
  let left = Math.min(dt, 0.1);
  while (left > 0) {
    const h = Math.min(left, 1 / 120);
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
}

/* ------------------------------------------------------------------ particles */

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  size: number;
}

/** Small pool of tumbling bits (droplets, sparkles, leaves, confetti). Shrinks out instead of fading. */
class Sparks {
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
      this.items.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, gravity: 0, size: 0.1 });
    }
  }

  emit(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life: number, size: number, gravity = 9): void {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.mesh.material = this.mat(color);
    p.mesh.position.copy(pos);
    p.mesh.rotation.set(Math.random() * TAU, Math.random() * TAU, 0);
    p.mesh.visible = true;
    p.vel.copy(vel);
    p.life = p.max = life;
    p.gravity = gravity;
    p.size = size;
  }

  /** Burst of n bits around a world point. */
  burst(pos: THREE.Vector3, n: number, colors: number[], speed: number, up: number, life: number, size: number, gravity = 9): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.tmp.set(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s);
      this.emit(pos, this.tmp, colors[i % colors.length], life * (0.7 + Math.random() * 0.5), size, gravity);
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
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.04) {
        p.mesh.position.y = 0.04;
        p.vel.y = Math.abs(p.vel.y) * 0.25;
        p.vel.x *= 0.5;
        p.vel.z *= 0.5;
      }
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      p.mesh.scale.setScalar(p.size * Math.min(1, p.life / (p.max * 0.35)));
    }
  }
}

/* ------------------------------------------------------------------ main entry */

/**
 * Places the props in free spots of the placeholder world and returns their Interactables.
 * `obstacles` must already contain the buildings; the props' own solid footprints are appended.
 * `rng` drives placement only, so every city keeps a stable layout.
 * NOTE: the shared particle pool is advanced by the first returned Interactable's update().
 */
export function createProps(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): Interactable[] {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: number, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
    const key = color + (extra ? JSON.stringify(extra) : '');
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra });
      mats.set(key, m);
    }
    return m;
  };

  const kit: Kit = {
    scene,
    sparks: new Sparks(scene, 90, (c) => mat(c, { emissive: c, emissiveIntensity: 0.35 })),
    mat,
    group(at) {
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      g.rotation.y = at.rot;
      scene.add(g);
      return g;
    },
    block(at, lx, lz, hx, hz) {
      const c = Math.cos(at.rot);
      const s = Math.sin(at.rot);
      const wx = at.x + lx * c + lz * s;
      const wz = at.z - lx * s + lz * c;
      const ex = Math.abs(c) * hx + Math.abs(s) * hz;
      const ez = Math.abs(s) * hx + Math.abs(c) * hz;
      obstacles.push({ minX: wx - ex, maxX: wx + ex, minZ: wz - ez, maxZ: wz + ez });
    },
  };

  /* ---- placement ---- */
  const taken: { x: number; z: number; r: number }[] = [
    { x: SPAWN.x, z: SPAWN.z, r: 7 }, // spawn: never build on/around the start point
    { x: 6, z: -8, r: 1.5 }, // the street lamp from world.ts
  ];
  const circleHitsBox = (x: number, z: number, r: number, o: Obstacle): boolean => {
    const cx = Math.max(o.minX, Math.min(x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
    return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
  };
  const isFree = (x: number, z: number, r: number, offRoad = true): boolean => {
    if (offRoad && onRoad(x, z, 0.6 + r)) return false; // roads + kerb
    const a = AIRPORT_ZONE;
    if (x + r + 2 > a.minX && x - r - 2 < a.maxX && z + r + 2 > a.minZ && z - r - 2 < a.maxZ) return false;
    if (Math.abs(x) + r > 140 || Math.abs(z) + r > 140) return false;
    for (const o of obstacles) if (circleHitsBox(x, z, r + 1.2, o)) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < r + t.r + 1.5) return false;
    return true;
  };
  const faceOrigin = (x: number, z: number): number => Math.atan2(-x, -z);
  /** Free spot of footprint radius r, preferably near `angle`, between minD and maxD from the crossroads. */
  const place = (r: number, minD: number, maxD: number, angle: number): Spot => {
    let x = 0;
    let z = 0;
    for (let i = 0; i < 600; i++) {
      const a = i < 80 ? angle + (rng() - 0.5) * 1.0 : rng() * TAU;
      const d = minD + rng() * (maxD - minD) + Math.floor(i / 100) * 5; // widen the ring if crowded
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
      if (isFree(x, z, r)) break;
    }
    taken.push({ x, z, r });
    return { x, z, rot: faceOrigin(x, z) };
  };

  const props: Interactable[] = [];
  const q = TAU / 4;
  const spin = rng() * TAU; // rotates the whole arrangement per city

  // Near the crossroads (seen from the start), one sector each.
  const near: [number, (at: Spot) => Interactable][] = [
    [1.7, (at) => createFountain(kit, at)],
    [1.9, (at) => createSwing(kit, at)],
    [1.2, (at) => createMushroom(kit, at)],
    [1.2, (at) => createCatBench(kit, at)],
    [0.8, (at) => createDog(kit, at)],
    [0.8, (at) => createBalloons(kit, at)],
  ];
  // spread over the whole city (client: interactions must not be concentrated in the centre)
  near.forEach(([r, build], i) => props.push(build(place(r, 18, 120, spin + (i / near.length) * TAU))));

  // Traffic light with a button on one kerb corner of the crossroads.
  {
    const corners = [
      [5.3, 5.3],
      [-5.3, 5.3],
      [-5.3, -5.3],
      [5.3, -5.3],
    ];
    const first = Math.floor(rng() * 4);
    let at: Spot = { x: -5.3, z: 5.3, rot: 0 };
    for (let k = 0; k < 4; k++) {
      const [x, z] = corners[(first + k) % 4];
      if (isFree(x, z, 0.3, false)) {
        at = { x, z, rot: faceOrigin(x, z) };
        break;
      }
    }
    taken.push({ x: at.x, z: at.z, r: 0.5 });
    props.push(createTrafficLight(kit, at));
  }

  // Floor xylophone: a row of tiles alongside a road, so walking along the kerb plays a scale.
  {
    const n = 8;
    const gap = 1.2;
    let placed: { x: number; z: number; dx: number; dz: number } | null = null;
    for (let i = 0; i < 300 && !placed; i++) {
      const alongX = rng() < 0.5;
      const s1 = rng() < 0.5 ? -1 : 1; // which side of the road
      const s2 = rng() < 0.5 ? -1 : 1; // which direction along it
      const off = 6 + rng() * 2; // distance from the road centre line
      const start = 25 + rng() * (i < 150 ? 60 : 100);
      const x0 = alongX ? s2 * start : s1 * off;
      const z0 = alongX ? s1 * off : s2 * start;
      const dx = alongX ? s2 * gap : 0;
      const dz = alongX ? 0 : s2 * gap;
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = isFree(x0 + dx * k, z0 + dz * k, 0.7, false) && Math.abs(alongX ? z0 : x0) > 5.2;
      if (ok) placed = { x: x0, z: z0, dx, dz };
    }
    const p = placed ?? { x: -7, z: 20, dx: 0, dz: gap };
    for (let k = 0; k < n; k++) {
      const x = p.x + p.dx * k;
      const z = p.z + p.dz * k;
      taken.push({ x, z, r: 0.7 });
      props.push(createXyloTile(kit, { x, z, rot: Math.atan2(p.dx, p.dz) }, k));
    }
  }

  // A little further out: worth a short walk.
  const far: [number, (at: Spot) => Interactable][] = [
    [1.5, (at) => createAppleTree(kit, at)],
    [1.8, (at) => createFlowerBed(kit, at)],
    [0.6, (at) => createMailbox(kit, at)],
    [1.0, (at) => createWindChimes(kit, at)],
  ];
  far.forEach(([r, build], i) => props.push(build(place(r, 30, 130, spin + q / 2 + (i / far.length) * TAU))));

  // The first prop also drives the shared particle pool.
  const first = props[0];
  const firstUpdate = first.update?.bind(first);
  first.update = (dt: number) => {
    kit.sparks.update(dt);
    firstUpdate?.(dt);
  };
  return props;
}

/* ------------------------------------------------------------------ props */

/** Baloiço: two swings that sway when touched, slowly settling, with a happy creak. */
function createSwing(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const wood = k.mat(0xff8c42);
  const ropeM = k.mat(0xf1f3f5);
  const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 2.58, 8);
  const tilt = Math.atan(0.6 / 2.5);
  for (const sx of [-1.6, 1.6])
    for (const sz of [-1, 1]) {
      const leg = mk(legGeo, wood, g, sx, 1.25, sz * 0.3);
      leg.rotation.x = -sz * tilt;
      k.block(at, sx, sz * 0.6, 0.12, 0.12);
    }
  const bar = mk(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 8), wood, g, 0, 2.5, 0);
  bar.rotation.z = Math.PI / 2;

  const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5);
  const seatGeo = new THREE.BoxGeometry(0.75, 0.08, 0.38);
  const pivots = [-0.75, 0.75].map((x, i) => {
    const p = new THREE.Group();
    p.position.set(x, 2.5, 0);
    g.add(p);
    mk(ropeGeo, ropeM, p, -0.3, -0.95, 0);
    mk(ropeGeo, ropeM, p, 0.3, -0.95, 0);
    mk(seatGeo, k.mat(i ? 0x4dabf7 : 0xff4d6d), p, 0, -1.9, 0);
    return p;
  });

  let amp = 0.05;
  let t = 0;
  let lastSign = 1;
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.9,
    interact() {
      amp = Math.min(1.0, amp + 0.75);
      [523, 659, 784].forEach((f, i) => tone(f, 0.05 + i * 0.08, 0.18, 'triangle', 0.08));
      tone(330, 0, 0.18, 'sawtooth', 0.025);
    },
    update(dt) {
      t += dt;
      amp = Math.max(0.03, amp * Math.exp(-0.4 * dt));
      const s = Math.sin(t * 2.6);
      pivots[0].rotation.x = amp * s;
      pivots[1].rotation.x = amp * 0.8 * Math.sin(t * 2.6 + 1.4);
      const sign = s >= 0 ? 1 : -1;
      if (sign !== lastSign && amp > 0.3) tone(360 + Math.random() * 80, 0, 0.12, 'sawtooth', 0.015); // soft creak
      lastSign = sign;
    },
  };
}

/** Fonte: water jet that spurts up high with a shower of droplets when touched. */
function createFountain(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const stone = k.mat(0xc9d3e3);
  const water = k.mat(0x6ec6ff, { transparent: true, opacity: 0.8, emissive: 0x2a7fd4, emissiveIntensity: 0.25 });
  mk(new THREE.CylinderGeometry(1.6, 1.75, 0.55, 24), stone, g, 0, 0.275, 0).receiveShadow = true;
  mk(new THREE.CylinderGeometry(1.45, 1.45, 0.06, 24), water, g, 0, 0.5, 0).receiveShadow = true;
  mk(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 12), stone, g, 0, 1.0, 0);
  mk(new THREE.CylinderGeometry(0.75, 0.35, 0.25, 18), stone, g, 0, 1.6, 0);
  mk(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 18), water, g, 0, 1.71, 0);
  const jet = mk(new THREE.CylinderGeometry(0.07, 0.13, 1, 8), water, g, 0, 2, 0);
  const cap = mk(new THREE.SphereGeometry(0.16, 10, 8), water, g, 0, 2.5, 0);
  k.block(at, 0, 0, 1.45, 1.45);

  const base = new THREE.Vector3(at.x, 0, at.z);
  const top = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let boost = 0;
  let t = 0;
  let acc = 0;
  return {
    object: g,
    position: base.clone(),
    radius: 2.6,
    interact() {
      boost = 1;
      for (let i = 0; i < 10; i++) tone(1200 + Math.random() * 1600, i * 0.03, 0.07, 'sine', 0.04);
      tone(260, 0, 0.25, 'triangle', 0.06);
      top.set(at.x, 3.5, at.z);
      k.sparks.burst(top, 24, [0x8fd3ff, 0xffffff, 0x4dabf7], 3, 5, 1.4, 0.09);
    },
    update(dt) {
      t += dt;
      boost *= Math.exp(-0.6 * dt);
      const h = 0.45 + boost * 3.4 + Math.sin(t * 7) * 0.05;
      jet.scale.y = h;
      jet.position.y = 1.72 + h / 2;
      cap.position.y = 1.72 + h;
      cap.scale.setScalar(1 + boost * 0.8 + Math.sin(t * 11) * 0.1);
      // continuous trickle of droplets from the top of the jet, a shower while boosted
      acc += dt * (4 + boost * 25);
      while (acc >= 1) {
        acc -= 1;
        const a = Math.random() * TAU;
        const s = 0.4 + boost * 1.6 * Math.random();
        top.set(at.x, 1.72 + h, at.z);
        vel.set(Math.cos(a) * s, 0.6 + boost * 1.5, Math.sin(a) * s);
        k.sparks.emit(top, vel, Math.random() < 0.7 ? 0x8fd3ff : 0xffffff, 0.6 + boost * 0.6, 0.06);
      }
    },
  };
}

const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
const RAINBOW = [0xff4d6d, 0xff922b, 0xffd43b, 0x69db7c, 0x38d9a9, 0x4dabf7, 0x845ef7, 0xf783ac];

/** Xilofone de chão: one coloured floor tile; stepping on it plays its note and makes it bounce and glow. */
function createXyloTile(k: Kit, at: Spot, i: number): Interactable {
  const g = k.group(at);
  const color = RAINBOW[i % RAINBOW.length];
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.05 });
  const tile = mk(new THREE.BoxGeometry(1.0, 0.12, 0.95), m, g, 0, 0.06, 0);
  tile.receiveShadow = true;
  const press = { x: 0, v: 0 };
  let flash = 0;
  const pos = new THREE.Vector3(at.x, 0.3, at.z);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 0.75,
    interact() {
      const f = SCALE[i % SCALE.length];
      tone(f, 0, 0.45, 'triangle', 0.14);
      tone(f * 2, 0, 0.25, 'sine', 0.04);
      press.v = -2.2;
      flash = 1;
      k.sparks.burst(pos, 4, [color, 0xffffff], 1, 3, 0.8, 0.07);
    },
    update(dt) {
      spring(press, 0, 180, 9, dt);
      flash = Math.max(0, flash - dt * 1.6);
      tile.position.y = 0.06 + press.x * 0.1;
      tile.scale.set(1 - press.x * 0.15, 1 + press.x * 0.6, 1 - press.x * 0.15);
      m.emissiveIntensity = 0.05 + flash * 0.9;
    },
  };
}

/** Gato num banco: miaus, jumps up and lands with a squash, tail flicking. */
function createCatBench(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const wood = k.mat(0x9c6644);
  mk(new THREE.BoxGeometry(2.0, 0.1, 0.55), wood, g, 0, 0.5, 0);
  mk(new THREE.BoxGeometry(2.0, 0.45, 0.08), wood, g, 0, 0.85, -0.25);
  const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.5);
  mk(legGeo, k.mat(0x495057), g, -0.85, 0.25, 0);
  mk(legGeo, k.mat(0x495057), g, 0.85, 0.25, 0);
  k.block(at, 0, 0, 1.0, 0.3);

  const fur = k.mat(0xffa94d);
  const dark = k.mat(0x212529);
  const cat = new THREE.Group();
  cat.position.set(0.4, 0.55, 0.02);
  g.add(cat);
  const body = new THREE.Group();
  cat.add(body);
  mk(new THREE.SphereGeometry(0.22, 14, 10), fur, body, 0, 0.22, 0).scale.set(1, 1.15, 0.9);
  const head = mk(new THREE.SphereGeometry(0.17, 14, 10), fur, body, 0, 0.52, 0.06);
  const earGeo = new THREE.ConeGeometry(0.07, 0.15, 4);
  mk(earGeo, fur, head, -0.09, 0.15, 0);
  mk(earGeo, fur, head, 0.09, 0.15, 0);
  const eyeGeo = new THREE.SphereGeometry(0.028, 6, 6);
  mk(eyeGeo, dark, head, -0.06, 0.03, 0.15);
  mk(eyeGeo, dark, head, 0.06, 0.03, 0.15);
  mk(new THREE.SphereGeometry(0.025, 6, 6), k.mat(0xff8fab), head, 0, -0.02, 0.17);
  const tail = new THREE.Group();
  tail.position.set(0, 0.08, -0.2);
  body.add(tail);
  const tailMesh = mk(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 6), fur, tail, 0, 0.2, -0.06);
  tailMesh.rotation.x = -0.3;

  let t = 0;
  let jump = -1; // seconds into the jump, -1 = resting
  let flick = 0;
  const land = { x: 1, v: 0 };
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 2.0,
    interact() {
      // "miau": a quick rising-then-falling glide built from short overlapping notes
      [620, 760, 900, 860, 760, 640, 560].forEach((f, i) => tone(f, i * 0.04, 0.09, 'triangle', 0.07));
      if (jump < 0) jump = 0;
      flick = 2;
    },
    update(dt) {
      t += dt;
      flick = Math.max(0, flick - dt);
      if (jump >= 0) {
        jump += dt;
        const p = Math.min(1, jump / 0.6);
        cat.position.y = 0.55 + 4 * 0.75 * p * (1 - p);
        cat.rotation.y = p * TAU;
        if (p >= 1) {
          jump = -1;
          cat.rotation.y = 0;
          land.x = 0.7; // squash on landing
        }
      }
      spring(land, 1, 220, 12, dt);
      body.scale.set(1 / Math.sqrt(land.x), land.x, 1 / Math.sqrt(land.x));
      tail.rotation.z = Math.sin(t * (flick > 0 ? 14 : 1.5)) * (flick > 0 ? 0.7 : 0.25);
      head.rotation.z = Math.sin(t * 0.7) * 0.12;
    },
  };
}

/** Balões presos a um poste: each touch lets one balloon float away; they come back after a while. */
function createBalloons(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  mk(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8), k.mat(0xadb5bd), g, 0, 1.1, 0);
  mk(new THREE.SphereGeometry(0.09, 8, 6), k.mat(0xffd43b), g, 0, 2.22, 0);
  k.block(at, 0, 0, 0.15, 0.15);

  const balloonGeo = new THREE.SphereGeometry(0.32, 16, 12);
  const knotGeo = new THREE.ConeGeometry(0.06, 0.1, 6);
  const stringGeo = new THREE.CylinderGeometry(0.008, 0.008, 1.3, 4);
  const stringM = k.mat(0xffffff);
  const colors = [0xff4d6d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xcc5de8];
  const balloons = colors.map((c, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 2.2, 0);
    g.add(pivot);
    const b = mk(balloonGeo, k.mat(c, { roughness: 0.3 }), pivot, 0, 1.65, 0);
    b.scale.set(1, 1.2, 1);
    mk(knotGeo, k.mat(c), pivot, 0, 1.25, 0).rotation.x = Math.PI;
    mk(stringGeo, stringM, pivot, 0, 0.65, 0);
    const a = (i / colors.length) * TAU;
    return { pivot, a, lean: 0.28 + (i % 2) * 0.12, state: 'tied' as 'tied' | 'flying' | 'gone', t: 1, drift: new THREE.Vector2() };
  });

  let t = 0;
  let wobble = 0;
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.5,
    interact() {
      wobble = 1;
      const b = balloons.find((x) => x.state === 'tied');
      if (!b) {
        tone(440, 0, 0.12, 'sine', 0.06);
        return;
      }
      b.state = 'flying';
      b.t = 0;
      b.drift.set(Math.cos(b.a), Math.sin(b.a)).multiplyScalar(0.5);
      [392, 523, 659, 880].forEach((f, i) => tone(f, i * 0.06, 0.16, 'sine', 0.09));
    },
    update(dt) {
      t += dt;
      wobble *= Math.exp(-2 * dt);
      for (const b of balloons) {
        b.t += dt;
        if (b.state === 'tied') {
          const sway = Math.sin(t * 1.3 + b.a * 2) * 0.06 + Math.sin(t * 18) * 0.15 * wobble;
          b.pivot.rotation.set(Math.sin(b.a) * (b.lean + sway), 0, -Math.cos(b.a) * (b.lean + sway));
          const grow = Math.min(1, b.t / 0.8); // refilled balloons pop back in
          b.pivot.scale.setScalar(grow);
        } else if (b.state === 'flying') {
          b.pivot.position.y += dt * (1.2 + b.t * 0.4);
          b.pivot.position.x += dt * (b.drift.x + Math.sin(b.t * 1.7) * 0.4);
          b.pivot.position.z += dt * b.drift.y;
          b.pivot.rotation.x *= Math.exp(-2 * dt);
          b.pivot.rotation.z = b.pivot.rotation.z * Math.exp(-2 * dt) + Math.sin(b.t * 2) * 0.01;
          if (b.pivot.position.y > 40) {
            b.state = 'gone';
            b.t = 0;
            b.pivot.visible = false;
          }
        } else if (b.t > 7) {
          b.state = 'tied';
          b.t = 0;
          b.pivot.visible = true;
          b.pivot.position.set(0, 2.2, 0);
          b.pivot.scale.setScalar(0);
        }
      }
    },
  };
}

/** Canteiro de flores: touching makes the flowers shoot up, bloom and spin with sparkles. */
function createFlowerBed(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  mk(new THREE.BoxGeometry(3.0, 0.25, 1.6), k.mat(0xb07d4f), g, 0, 0.125, 0).receiveShadow = true;
  mk(new THREE.BoxGeometry(2.8, 0.06, 1.4), k.mat(0x6b4226), g, 0, 0.26, 0).receiveShadow = true;

  const stemGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.6, 5);
  const petalGeo = new THREE.IcosahedronGeometry(0.22, 0);
  const coreGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const stemM = k.mat(0x40c057);
  const coreM = k.mat(0xffd43b);
  const petals = [0xff6b9d, 0xffffff, 0xcc5de8, 0xff922b, 0x4dabf7, 0xff4d6d, 0xf783ac];
  const flowers = petals.map((c, i) => {
    const stem = new THREE.Group();
    const row = i % 2;
    stem.position.set(-1.1 + i * 0.37, 0.28, row ? 0.32 : -0.3);
    g.add(stem);
    mk(stemGeo, stemM, stem, 0, 0.3, 0);
    const head = new THREE.Group();
    head.position.y = 0.62;
    head.rotation.x = 0.35;
    stem.add(head);
    mk(petalGeo, k.mat(c), head, 0, 0, 0).scale.set(1, 0.3, 1);
    mk(coreGeo, coreM, head, 0, 0.05, 0);
    return { stem, head, phase: i * 0.9 };
  });

  const grow = { x: 0, v: 0 };
  let bloom = 0;
  let spinV = 0;
  let t = 0;
  const top = new THREE.Vector3(at.x, 1.2, at.z);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 2.2,
    interact() {
      bloom = 1;
      grow.v += 4;
      spinV = 9;
      [1568, 1976, 2349, 2637, 3136].forEach((f, i) => tone(f, i * 0.07, 0.3, 'sine', 0.06));
      k.sparks.burst(top, 18, [0xffe066, 0xffffff, 0xff8fab, 0xb197fc], 1.6, 3, 1.6, 0.07, 2.5);
    },
    update(dt) {
      t += dt;
      bloom = Math.max(0, bloom - dt / 6);
      spinV *= Math.exp(-1.2 * dt);
      spring(grow, bloom, 60, 5, dt);
      for (const f of flowers) {
        f.stem.scale.y = 1 + grow.x * 0.8;
        const hs = 0.75 + grow.x * 0.7;
        f.head.scale.set(hs, hs / f.stem.scale.y, hs); // undo the stem's vertical stretch
        f.head.rotation.y += dt * (0.3 + spinV);
        f.stem.rotation.z = Math.sin(t * 1.4 + f.phase) * 0.06;
      }
    },
  };
}

/** Caixa de correio: the flag pops up and an envelope flies out and flutters down. Ding! */
function createMailbox(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  g.scale.setScalar(1.3);
  mk(new THREE.BoxGeometry(0.12, 1.0, 0.12), k.mat(0x8d6e63), g, 0, 0.5, 0);
  const red = k.mat(0x4dabf7);
  mk(new THREE.BoxGeometry(0.42, 0.35, 0.6), red, g, 0, 1.15, 0);
  const roof = mk(new THREE.CylinderGeometry(0.21, 0.21, 0.6, 14), red, g, 0, 1.32, 0);
  roof.rotation.x = Math.PI / 2;
  mk(new THREE.BoxGeometry(0.3, 0.04, 0.02), k.mat(0x212529), g, 0, 1.2, 0.305); // letter slot
  k.block(at, 0, 0, 0.38, 0.45);

  const flag = new THREE.Group();
  flag.position.set(0.23, 1.05, -0.15);
  g.add(flag);
  const flagM = k.mat(0xff4d6d);
  mk(new THREE.BoxGeometry(0.03, 0.4, 0.03), flagM, flag, 0, 0.2, 0);
  mk(new THREE.BoxGeometry(0.02, 0.14, 0.18), flagM, flag, 0, 0.33, 0.09);

  const env = mk(new THREE.BoxGeometry(0.34, 0.02, 0.24), k.mat(0xfffdf5), g, 0, 1.2, 0.3);
  const seal = mk(new THREE.SphereGeometry(0.035, 6, 4), k.mat(0xff4d6d), env, 0, 0.015, 0);
  seal.scale.y = 0.4;
  env.visible = false;

  const up = { x: Math.PI / 2, v: 0 };
  let upFor = 0;
  let envT = -1;
  const envVel = new THREE.Vector3();
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.5,
    interact() {
      upFor = 4;
      up.v -= 6;
      envT = 0;
      env.visible = true;
      env.position.set(0, 1.2, 0.35);
      env.scale.setScalar(1);
      envVel.set((Math.random() - 0.5) * 0.8, 2.8, 1.4);
      tone(1568, 0, 0.6, 'sine', 0.12);
      tone(2093, 0.12, 0.8, 'sine', 0.1);
    },
    update(dt) {
      upFor = Math.max(0, upFor - dt);
      spring(up, upFor > 0 ? 0 : Math.PI / 2, 90, 7, dt);
      flag.rotation.x = up.x;
      if (envT >= 0) {
        envT += dt;
        if (env.position.y > 0.03) {
          envVel.y = Math.max(envVel.y - 4 * dt, -0.9); // floaty paper fall
          env.position.addScaledVector(envVel, dt);
          env.position.x += Math.sin(envT * 5) * dt * 0.8;
          env.rotation.z = Math.sin(envT * 8) * 0.5;
          env.rotation.x = Math.cos(envT * 6) * 0.3;
        } else {
          env.position.y = 0.03;
          env.rotation.set(0, env.rotation.y, 0);
          envVel.set(0, 0, 0);
        }
        if (envT > 4) env.scale.setScalar(Math.max(0, 1 - (envT - 4) * 2));
        if (envT > 4.5) {
          envT = -1;
          env.visible = false;
        }
      }
    },
  };
}

/** Árvore de fruta: it shakes and a few apples drop, bounce, then vanish (and grow back). */
function createAppleTree(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  mk(new THREE.CylinderGeometry(0.22, 0.32, 2.2, 10), k.mat(0x8d5a3b), g, 0, 1.1, 0);
  const crown = new THREE.Group();
  crown.position.y = 2.1;
  g.add(crown);
  const leaf = k.mat(0x51cf66);
  const leaf2 = k.mat(0x40c057);
  mk(new THREE.IcosahedronGeometry(1.35, 1), leaf, crown, 0, 1.1, 0);
  mk(new THREE.IcosahedronGeometry(0.95, 1), leaf2, crown, 0.85, 0.7, 0.3);
  mk(new THREE.IcosahedronGeometry(0.95, 1), leaf2, crown, -0.75, 0.8, -0.25);
  k.block(at, 0, 0, 0.35, 0.35);

  const appleGeo = new THREE.SphereGeometry(0.17, 10, 8);
  const appleM = k.mat(0xe03131, { roughness: 0.35 });
  const apples = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * TAU + 0.4;
    const y = 2.55 + (i % 2) * 0.3; // crown sphere: centre y 3.2, r 1.35 -> sit just outside it
    const rr = Math.sqrt(Math.max(0, 1.35 ** 2 - (y - 3.2) ** 2)) + 0.08;
    const home = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const m = mk(appleGeo, appleM, g, home.x, home.y, home.z);
    return { m, home, state: 'hang' as 'hang' | 'fall' | 'gone', t: 1, vel: new THREE.Vector3() };
  });

  let shake = 0;
  let t = 0;
  const leafPos = new THREE.Vector3(at.x, 3.2, at.z);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.9,
    interact() {
      shake = 1;
      for (let i = 0; i < 7; i++) tone(180 + Math.random() * 260, i * 0.04, 0.08, 'triangle', 0.035);
      k.sparks.burst(leafPos, 10, [0x69db7c, 0x40c057], 1.5, 0.5, 2.2, 0.09, 1.2);
      let dropped = 0;
      for (const a of apples) {
        if (a.state !== 'hang' || a.t < 0.8 || dropped >= 3) continue;
        a.state = 'fall';
        a.t = -0.15 * dropped; // slight stagger
        a.vel.set(a.home.x * 0.5, 0, a.home.z * 0.5);
        dropped++;
      }
    },
    update(dt) {
      t += dt;
      shake *= Math.exp(-2.2 * dt);
      crown.rotation.z = Math.sin(t * 24) * 0.08 * shake;
      crown.rotation.x = Math.cos(t * 19) * 0.06 * shake;
      for (const a of apples) {
        a.t += dt;
        if (a.state === 'hang') {
          a.m.position.set(a.home.x + Math.sin(t * 24) * 0.12 * shake, a.home.y, a.home.z);
          a.m.scale.setScalar(Math.min(1, a.t / 0.8)); // regrowing apples swell back in
        } else if (a.state === 'fall') {
          if (a.t < 0) continue;
          a.vel.y -= 9.8 * dt;
          a.m.position.addScaledVector(a.vel, dt);
          if (a.m.position.y < 0.15) {
            a.m.position.y = 0.15;
            if (Math.abs(a.vel.y) > 1.2) tone(300 + Math.random() * 60, 0, 0.06, 'sine', 0.08); // "toc"
            a.vel.y = Math.abs(a.vel.y) * 0.45;
            a.vel.x *= 0.7;
            a.vel.z *= 0.7;
          }
          a.m.rotation.x += dt * a.vel.length() * 4;
          if (a.t > 3) a.m.scale.setScalar(Math.max(0, 1 - (a.t - 3) * 2));
          if (a.t > 3.5) {
            a.state = 'gone';
            a.t = 0;
            a.m.visible = false;
          }
        } else if (a.t > 5) {
          a.state = 'hang';
          a.t = 0;
          a.m.visible = true;
          a.m.rotation.set(0, 0, 0);
        }
      }
    },
  };
}

/** Espanta-espíritos: tubes swing and ring a soft pentatonic shimmer. */
function createWindChimes(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const wood = k.mat(0x9c6644);
  mk(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 8), wood, g, 0, 1.5, 0);
  mk(new THREE.BoxGeometry(1.0, 0.08, 0.08), wood, g, 0.45, 2.92, 0);
  mk(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), k.mat(0xffffff), g, 0.8, 2.75, 0);
  k.block(at, 0, 0, 0.2, 0.2);

  const hanger = new THREE.Group();
  hanger.position.set(0.8, 2.6, 0);
  g.add(hanger);
  mk(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16), k.mat(0xff922b), hanger, 0, 0, 0);
  const colors = [0xffc9c9, 0xffec99, 0xb2f2bb, 0xa5d8ff, 0xd0bfff];
  const tubes = colors.map((c, i) => {
    const a = (i / colors.length) * TAU;
    const p = new THREE.Group();
    p.position.set(Math.cos(a) * 0.23, -0.03, Math.sin(a) * 0.23);
    hanger.add(p);
    const len = 1.0 - i * 0.1;
    mk(new THREE.CylinderGeometry(0.045, 0.045, len, 8), k.mat(c, { metalness: 0.7, roughness: 0.25 }), p, 0, -len / 2 - 0.04, 0);
    return { p, ph: Math.random() * TAU, a };
  });

  const notes = [1046.5, 1174.7, 1318.5, 1568, 1760];
  let energy = 0.05;
  let t = 0;
  return {
    object: g,
    position: new THREE.Vector3(at.x + Math.cos(at.rot) * 0.35, 0, at.z - Math.sin(at.rot) * 0.35),
    radius: 1.7,
    interact() {
      energy = 1;
      for (let i = 0; i < 7; i++) tone(notes[Math.floor(Math.random() * notes.length)], i * 0.12 + Math.random() * 0.05, 1.3, 'sine', 0.05);
      for (const tb of tubes) tb.ph = Math.random() * TAU;
    },
    update(dt) {
      t += dt;
      energy = Math.max(0.05, energy * Math.exp(-0.7 * dt));
      hanger.rotation.y += dt * energy * 3;
      hanger.rotation.z = Math.sin(t * 5) * 0.15 * energy;
      for (const tb of tubes) {
        const s = Math.sin(t * 7 + tb.ph) * 0.5 * energy;
        tb.p.rotation.set(Math.sin(tb.a) * s, 0, -Math.cos(tb.a) * s);
      }
    },
  };
}

/** Cão: barks happily, wags like crazy and spins round in a circle. */
function createDog(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const pup = new THREE.Group();
  g.add(pup);
  const fur = k.mat(0xd9a066);
  const darkFur = k.mat(0x7f5539);
  const black = k.mat(0x212529);
  const body = mk(new THREE.CapsuleGeometry(0.2, 0.4, 4, 10), fur, pup, 0, 0.45, 0);
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.36);
  pup.add(head);
  mk(new THREE.SphereGeometry(0.2, 14, 10), fur, head, 0, 0, 0);
  mk(new THREE.BoxGeometry(0.15, 0.11, 0.16), fur, head, 0, -0.05, 0.2);
  mk(new THREE.SphereGeometry(0.04, 8, 6), black, head, 0, -0.01, 0.29);
  const earGeo = new THREE.BoxGeometry(0.07, 0.22, 0.12);
  const earL = mk(earGeo, darkFur, head, -0.18, 0, 0);
  const earR = mk(earGeo, darkFur, head, 0.18, 0, 0);
  const eyeGeo = new THREE.SphereGeometry(0.03, 6, 6);
  mk(eyeGeo, black, head, -0.08, 0.06, 0.17);
  mk(eyeGeo, black, head, 0.08, 0.06, 0.17);
  const legGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.32, 6);
  for (const lx of [-0.11, 0.11]) for (const lz of [-0.2, 0.2]) mk(legGeo, fur, pup, lx, 0.16, lz);
  const tail = new THREE.Group();
  tail.position.set(0, 0.55, -0.38);
  pup.add(tail);
  mk(new THREE.CylinderGeometry(0.025, 0.04, 0.3, 6), darkFur, tail, 0, 0.13, -0.05).rotation.x = -0.4;
  k.block(at, 0, 0, 0.45, 0.45);

  let t = 0;
  let happy = 0;
  let spinT = -1;
  const hearts = new THREE.Vector3(at.x, 1.1, at.z);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.6,
    interact() {
      happy = 3;
      if (spinT < 0) spinT = 0;
      for (const s of [0, 0.25]) {
        tone(420, s, 0.06, 'square', 0.06);
        tone(320, s + 0.03, 0.09, 'sawtooth', 0.06);
        tone(260, s + 0.07, 0.07, 'square', 0.04);
      }
      k.sparks.burst(hearts, 6, [0xff8fab, 0xff4d6d], 0.8, 2, 1.2, 0.08, 1.5);
    },
    update(dt) {
      t += dt;
      happy = Math.max(0, happy - dt);
      const wag = happy > 0 ? 18 : 3;
      tail.rotation.z = Math.sin(t * wag) * (happy > 0 ? 0.8 : 0.35);
      earL.rotation.z = 0.25 + Math.sin(t * wag) * 0.15 * Math.min(1, happy);
      earR.rotation.z = -0.25 - Math.sin(t * wag) * 0.15 * Math.min(1, happy);
      body.scale.set(1, 1 + Math.sin(t * 3) * 0.03, 1); // breathing
      head.rotation.z = Math.sin(t * 0.9) * 0.15;
      if (spinT >= 0) {
        spinT += dt;
        const p = Math.min(1, spinT / 1.1);
        const e = p * p * (3 - 2 * p);
        pup.rotation.y = e * TAU;
        pup.position.y = Math.abs(Math.sin(p * Math.PI * 3)) * 0.18;
        if (p >= 1) {
          spinT = -1;
          pup.rotation.y = 0;
          pup.position.y = 0;
        }
      }
    },
  };
}

/** Cogumelo saltitão: a giant bouncy mushroom that squashes and boings (only the mushroom moves). */
function createMushroom(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  const squash = new THREE.Group();
  g.add(squash);
  const cream = k.mat(0xfff4e0);
  mk(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 14), cream, squash, 0, 0.55, 0);
  mk(new THREE.CylinderGeometry(1.05, 1.05, 0.05, 24), cream, squash, 0, 1.06, 0);
  const cap = new THREE.Group();
  cap.position.y = 1.05;
  squash.add(cap);
  const capMesh = mk(new THREE.SphereGeometry(1.1, 24, 12, 0, TAU, 0, Math.PI / 2), k.mat(0xff6b6b, { roughness: 0.4 }), cap);
  capMesh.scale.y = 0.7;
  const spotGeo = new THREE.SphereGeometry(0.17, 10, 6);
  const white = k.mat(0xffffff);
  for (let i = 0; i < 7; i++) {
    const lat = i === 6 ? Math.PI / 2 : 0.45 + (i % 2) * 0.4;
    const lon = (i / 6) * TAU;
    const r = 1.06; // children of the flattened cap, so they follow its curve
    mk(spotGeo, white, capMesh, Math.cos(lon) * Math.cos(lat) * r, Math.sin(lat) * r, Math.sin(lon) * Math.cos(lat) * r);
  }
  k.block(at, 0, 0, 0.85, 0.85);

  const sq = { x: 1, v: 0 };
  const top = new THREE.Vector3(at.x, 1.9, at.z);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.9,
    interact() {
      sq.x = 0.6;
      sq.v = 0;
      [196, 294, 440, 392].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.16));
      k.sparks.burst(top, 12, [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xcc5de8], 2.2, 4, 1.4, 0.08);
    },
    update(dt) {
      spring(sq, 1, 140, 4, dt);
      const s = Math.max(0.4, sq.x);
      squash.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    },
  };
}

/** Semáforo com botão: pressing makes it go red → yellow → green with beeps and a little jingle. */
function createTrafficLight(k: Kit, at: Spot): Interactable {
  const g = k.group(at);
  mk(new THREE.CylinderGeometry(0.07, 0.08, 3, 10), k.mat(0x495057), g, 0, 1.5, 0);
  mk(new THREE.BoxGeometry(0.42, 1.1, 0.3), k.mat(0x343a40), g, 0, 3.0, 0);
  const lampGeo = new THREE.SphereGeometry(0.13, 14, 10);
  const lampCols = [0xff3b3b, 0xffd43b, 0x40c057];
  const lamps = lampCols.map((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
    m.color.multiplyScalar(0.3); // unlit glass: dark until its turn
    mk(lampGeo, m, g, 0, 3.33 - i * 0.33, 0.13);
    return m;
  });
  mk(new THREE.BoxGeometry(0.2, 0.28, 0.12), k.mat(0xffd43b), g, 0, 1.1, 0.1);
  const btnM = k.mat(0xff4d6d);
  const btn = mk(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 12), btnM, g, 0, 1.12, 0.17);
  btn.rotation.x = Math.PI / 2;
  k.block(at, 0, 0, 0.2, 0.2);

  let t = -1;
  let phase = -1;
  const sparkAt = new THREE.Vector3();
  const lampWorld = (i: number): THREE.Vector3 =>
    sparkAt.set(at.x + Math.sin(at.rot) * 0.2, 3.33 - i * 0.33, at.z + Math.cos(at.rot) * 0.2);
  return {
    object: g,
    position: new THREE.Vector3(at.x, 0, at.z),
    radius: 1.4,
    interact() {
      t = 0;
      phase = -1;
      tone(1200, 0, 0.05, 'square', 0.05); // click
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      btn.position.z = t < 0.3 ? 0.13 : 0.17;
      const p = t < 0.8 ? 0 : t < 1.6 ? 1 : t < 3.8 ? 2 : 3;
      if (p !== phase) {
        phase = p;
        if (p === 0) tone(660, 0, 0.18, 'square', 0.05);
        if (p === 1) tone(880, 0, 0.18, 'square', 0.05);
        if (p === 2) {
          [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.09));
          k.sparks.burst(lampWorld(2), 8, [0x69db7c, 0xffffff], 1.2, 2, 1, 0.07, 3);
        }
        if (p === 3) t = -1;
        lamps.forEach((m, i) => {
          m.color.setHex(lampCols[i]).multiplyScalar(i === p ? 1 : 0.3);
          m.emissiveIntensity = i === p ? 1.4 : 0;
        });
      }
    },
  };
}
