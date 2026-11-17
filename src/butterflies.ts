import * as THREE from 'three';
import { inNoSpawn, isFree } from './spawn';
import { parkSite, siteBox, siteGroup, siteToWorld } from './places';
import { mulberry32, onRoad, type Obstacle, type World } from './world';

/** First city with butterflies (Roma = index 1). Porto has none. */
export const BUTTERFLIES_FROM_CITY = 1;
/** She is this close → they flee. */
const FLEE_R = 2.5;
/** She must go this far before they dare land again. */
const SAFE_R = 5.5;
const COUNT_MIN = 5;
const COUNT_MAX = 8;
const GARDEN_HW = 3.6;
const GARDEN_DEPTH = 5.5;

type Mode = 'fly' | 'approach' | 'land' | 'flee';

interface Bug {
  root: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  mode: Mode;
  /** Seconds left resting on a perch, or delay before next approach. */
  wait: number;
  flap: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  perch: number;
  phase: number;
}

const bodyGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.32, 5);
const headGeo = new THREE.SphereGeometry(0.055, 6, 5);
const wingShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.2, 0.14, 0.38, 0.04);
  s.quadraticCurveTo(0.48, -0.1, 0.24, -0.24);
  s.quadraticCurveTo(0.07, -0.16, 0, 0);
  return new THREE.ShapeGeometry(s);
})();

const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x212529, roughness: 0.55 });
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.5 });
const WING_COLORS = [0xff922b, 0xffe066, 0x74c0fc, 0xff6b9d, 0xffffff, 0xb197fc, 0x51cf66, 0xff8787];
const wingMats = WING_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide, flatShading: true }),
);

/**
 * Park garden with real low-poly butterflies: soft curved flight, perch on flowers/bush/grass,
 * scatter when she walks up. No UI, no speech. From the 2nd city (Roma) onward.
 */
export class Butterflies {
  private garden: THREE.Group | null = null;
  /** World-space parent for flying bugs (not under the rotated garden). */
  private readonly flock = new THREE.Group();
  private readonly bugs: Bug[] = [];
  private readonly landings: THREE.Vector3[] = [];
  private readonly centre = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private alive = false;
  private fleeHold = false;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    world: World,
    seed: number,
    cityIndex: number,
  ) {
    if (cityIndex < BUTTERFLIES_FROM_CITY) return;
    const rng = mulberry32(seed * 131 + 17);
    const site =
      parkSite(obstacles, rng, GARDEN_HW, GARDEN_DEPTH, { minD: 38, maxD: 115, roadGap: 5 }) ??
      parkSite(obstacles, rng, GARDEN_HW, GARDEN_DEPTH, { minD: 28, maxD: 130, roadGap: 4 });
    if (!site) return;

    const area = siteBox(site, -GARDEN_HW, GARDEN_HW, -GARDEN_DEPTH, 0.8);
    world.clearArea(area, 2.2);
    obstacles.push({ ...area, height: 0.45 });

    this.garden = siteGroup(scene, site);
    this.centre.copy(siteToWorld(site, 0, -GARDEN_DEPTH / 2));
    this.plantGarden(this.garden, site, rng);

    scene.add(this.flock);
    const n = COUNT_MIN + Math.floor(rng() * (COUNT_MAX - COUNT_MIN + 1));
    for (let i = 0; i < n; i++) this.bugs.push(this.makeBug(rng, i));
    this.alive = true;
  }

  private plantGarden(g: THREE.Group, site: { x: number; z: number; rot: number }, rng: () => number): void {
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(GARDEN_HW * 2, 0.06, GARDEN_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 0.9 }),
    );
    grass.position.set(0, 0.03, -GARDEN_DEPTH / 2);
    grass.receiveShadow = true;
    g.add(grass);

    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.2, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 }),
    );
    soil.position.set(-0.4, 0.12, -2.2);
    g.add(soil);

    const stemGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5);
    const petalGeo = new THREE.CircleGeometry(0.16, 5);
    const coreGeo = new THREE.SphereGeometry(0.05, 6, 5);
    const stemM = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.7 });
    const coreM = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.5 });
    const petalCols = [0xff6b9d, 0xffffff, 0xcc5de8, 0xff922b, 0x4dabf7, 0xfa5252];

    for (let i = 0; i < 6; i++) {
      const stem = new THREE.Group();
      const lx = -1.1 + i * 0.4;
      const lz = -2.2 + (i % 2 ? 0.28 : -0.28);
      stem.position.set(lx, 0.22, lz);
      g.add(stem);
      const s = new THREE.Mesh(stemGeo, stemM);
      s.position.y = 0.28;
      stem.add(s);
      const head = new THREE.Group();
      head.position.y = 0.58;
      head.rotation.x = -0.5;
      stem.add(head);
      head.add(
        new THREE.Mesh(
          petalGeo,
          new THREE.MeshStandardMaterial({ color: petalCols[i], side: THREE.DoubleSide, roughness: 0.55 }),
        ),
      );
      const core = new THREE.Mesh(coreGeo, coreM);
      core.position.z = 0.02;
      head.add(core);
      this.landings.push(siteToWorld(site, lx, lz, 0.85));
    }

    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshStandardMaterial({ color: 0x37b24d, roughness: 0.75, flatShading: true }),
    );
    bush.position.set(1.6, 0.5, -3.8);
    bush.scale.set(1.1, 0.85, 1.1);
    bush.castShadow = true;
    g.add(bush);
    this.landings.push(siteToWorld(site, 1.6, -3.8, 1.05));

    for (let i = 0; i < 3; i++) {
      const lx = (rng() * 2 - 1) * 2.4;
      const lz = -1.2 - rng() * 3.5;
      this.landings.push(siteToWorld(site, lx, lz, 0.12 + rng() * 0.08));
    }
  }

  private makeBug(rng: () => number, i: number): Bug {
    const root = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, BODY_MAT);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    root.add(body);
    const head = new THREE.Mesh(headGeo, HEAD_MAT);
    head.position.z = -0.18;
    root.add(head);

    const wingM = wingMats[i % wingMats.length];
    const wingL = new THREE.Group();
    const wingR = new THREE.Group();
    wingL.position.set(0, 0.02, -0.02);
    wingR.position.set(0, 0.02, -0.02);
    root.add(wingL, wingR);
    const wl = new THREE.Mesh(wingShape, wingM);
    const wr = new THREE.Mesh(wingShape, wingM);
    wr.scale.x = -1;
    wl.rotation.x = -0.2;
    wr.rotation.x = -0.2;
    wingL.add(wl);
    wingR.add(wr);
    root.scale.setScalar(1.35);

    const start = this.landings[i % this.landings.length].clone();
    start.y = 1.2 + rng() * 0.8;
    root.position.copy(start);
    this.flock.add(root);

    return {
      root,
      wingL,
      wingR,
      mode: 'fly',
      wait: 0.5 + rng() * 2.5,
      flap: rng() * Math.PI * 2,
      from: start.clone(),
      to: this.pickAir(rng, start),
      t: 0,
      dur: 2.5 + rng() * 2,
      perch: -1,
      phase: rng() * Math.PI * 2,
    };
  }

  private pickAir(rng: () => number, near: THREE.Vector3): THREE.Vector3 {
    for (let k = 0; k < 16; k++) {
      const a = rng() * Math.PI * 2;
      const d = 1.2 + rng() * 4.5;
      const x = this.centre.x + Math.cos(a) * d + (near.x - this.centre.x) * 0.25;
      const z = this.centre.z + Math.sin(a) * d + (near.z - this.centre.z) * 0.25;
      if (onRoad(x, z, 1.2) || inNoSpawn(x, z, 0.6)) continue;
      if (!isFree(x, z, 0.4, this.obstacles) && Math.hypot(x - this.centre.x, z - this.centre.z) > 6) continue;
      return new THREE.Vector3(x, 0.9 + rng() * 1.4, z);
    }
    return new THREE.Vector3(this.centre.x + (rng() - 0.5) * 3, 1.2 + rng(), this.centre.z + (rng() - 0.5) * 3);
  }

  private pickPerch(occupied: Set<number>): number {
    const free = this.landings.map((_, i) => i).filter((i) => !occupied.has(i));
    const pool = free.length ? free : this.landings.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private startFlee(b: Bug, player: THREE.Vector3): void {
    b.mode = 'flee';
    b.perch = -1;
    b.from.copy(b.root.position);
    const dx = b.root.position.x - player.x;
    const dz = b.root.position.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    let tx = b.root.position.x + (dx / len) * (4 + Math.random() * 3);
    let tz = b.root.position.z + (dz / len) * (4 + Math.random() * 3);
    if (onRoad(tx, tz, 1.2)) {
      tx = this.centre.x + (Math.random() - 0.5) * 2;
      tz = this.centre.z + (Math.random() - 0.5) * 2;
    }
    b.to.set(tx, 2.4 + Math.random() * 1.2, tz);
    b.t = 0;
    b.dur = 0.7 + Math.random() * 0.4;
  }

  private startFly(b: Bug, high = false): void {
    b.mode = 'fly';
    b.perch = -1;
    b.from.copy(b.root.position);
    b.to.copy(this.pickAir(() => Math.random(), b.root.position));
    if (high) b.to.y = Math.max(b.to.y, 2.2);
    b.t = 0;
    b.dur = high ? 1.2 + Math.random() * 0.8 : 2 + Math.random() * 2.2;
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive || paused) return;
    const gardenD = Math.hypot(player.x - this.centre.x, player.z - this.centre.z);
    if (gardenD < FLEE_R + 1.5) this.fleeHold = true;
    if (gardenD > SAFE_R) this.fleeHold = false;

    const occupied = new Set<number>();
    for (const b of this.bugs) if ((b.mode === 'land' || b.mode === 'approach') && b.perch >= 0) occupied.add(b.perch);

    for (const b of this.bugs) {
      const d = Math.hypot(player.x - b.root.position.x, player.z - b.root.position.z);
      if ((d < FLEE_R || this.fleeHold) && b.mode !== 'flee') this.startFlee(b, player);

      if (b.mode === 'flee') {
        this.flyArc(b, dt, 1.6);
        this.beat(b, dt, 22);
        if (b.t < 1) continue;
        if (!this.fleeHold && d > SAFE_R) {
          this.startFly(b);
          b.wait = 1 + Math.random() * 2;
        } else {
          this.startFly(b, true);
          b.mode = 'flee';
        }
        continue;
      }

      if (b.mode === 'land') {
        b.wait -= dt;
        this.beat(b, dt, 3.5);
        const perch = this.landings[b.perch];
        if (perch) b.root.position.y = perch.y;
        b.root.rotation.z = Math.sin(b.flap * 0.4 + b.phase) * 0.05;
        b.root.rotation.x = 0;
        if (b.wait <= 0) {
          this.startFly(b);
          b.wait = 0.8 + Math.random() * 1.5;
        }
        continue;
      }

      if (b.mode === 'approach') {
        this.flyArc(b, dt, 1);
        this.beat(b, dt, 12);
        if (b.t >= 1 && b.perch >= 0) {
          b.mode = 'land';
          b.wait = 2.5 + Math.random() * 3.5;
          b.root.position.copy(this.landings[b.perch]);
          b.root.rotation.x = 0;
        }
        continue;
      }

      // cruise
      if (b.wait > 0) b.wait -= dt;
      this.flyArc(b, dt, 1);
      this.beat(b, dt, 14);
      if (b.t < 1) continue;
      if (b.wait <= 0 && !this.fleeHold) {
        const pi = this.pickPerch(occupied);
        occupied.add(pi);
        b.mode = 'approach';
        b.perch = pi;
        b.from.copy(b.root.position);
        b.to.copy(this.landings[pi]);
        b.t = 0;
        b.dur = 1.4 + Math.random() * 0.8;
      } else {
        this.startFly(b);
      }
    }
  }

  private flyArc(b: Bug, dt: number, speedMul: number): void {
    b.t = Math.min(1, b.t + (dt * speedMul) / Math.max(0.35, b.dur));
    const t = b.t;
    const omt = 1 - t;
    this.mid.set(
      (b.from.x + b.to.x) * 0.5 + Math.sin(b.phase) * 0.9,
      Math.max(b.from.y, b.to.y) + 0.55 + Math.sin(b.phase * 1.7) * 0.25,
      (b.from.z + b.to.z) * 0.5 + Math.cos(b.phase) * 0.9,
    );
    this.tmp.set(
      omt * omt * b.from.x + 2 * omt * t * this.mid.x + t * t * b.to.x,
      omt * omt * b.from.y + 2 * omt * t * this.mid.y + t * t * b.to.y,
      omt * omt * b.from.z + 2 * omt * t * this.mid.z + t * t * b.to.z,
    );
    if (onRoad(this.tmp.x, this.tmp.z, 0.8)) {
      this.tmp.x = b.root.position.x;
      this.tmp.z = b.root.position.z;
      this.tmp.y = Math.max(this.tmp.y, 1.6);
    }
    const dx = this.tmp.x - b.root.position.x;
    const dz = this.tmp.z - b.root.position.z;
    b.root.position.copy(this.tmp);
    if (dx * dx + dz * dz > 1e-6) {
      const target = Math.atan2(dx, dz) + Math.PI;
      let diff = target - b.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      b.root.rotation.y += diff * Math.min(1, dt * 8);
    }
    b.root.rotation.z = Math.sin(b.flap * 0.5) * 0.08;
    b.root.rotation.x = Math.sin(b.flap * 0.35 + b.phase) * 0.1;
  }

  private beat(b: Bug, dt: number, rate: number): void {
    b.flap += dt * rate;
    const a = Math.sin(b.flap) * (rate > 10 ? 0.85 : 0.25);
    b.wingL.rotation.y = a;
    b.wingR.rotation.y = -a;
  }

  dispose(): void {
    if (!this.alive) return;
    this.garden?.parent?.remove(this.garden);
    this.flock.parent?.remove(this.flock);
    this.garden = null;
    this.bugs.length = 0;
    this.alive = false;
  }

  debug(): {
    on: boolean;
    n: number;
    at: [number, number] | null;
    modes: string[];
    fleeR: number;
    bugs: [number, number, number][];
  } {
    if (!this.alive) return { on: false, n: 0, at: null, modes: [], fleeR: FLEE_R, bugs: [] };
    return {
      on: true,
      n: this.bugs.length,
      at: [+this.centre.x.toFixed(1), +this.centre.z.toFixed(1)],
      modes: this.bugs.map((b) => b.mode),
      fleeR: FLEE_R,
      bugs: this.bugs.map((b) => [+b.root.position.x.toFixed(1), +b.root.position.y.toFixed(1), +b.root.position.z.toFixed(1)]),
    };
  }
}

/** Stub when Porto / Moon / placement failed. */
export function noButterflies(): Butterflies {
  return {
    update() {},
    dispose() {},
    debug: () => ({ on: false, n: 0, at: null, modes: [], fleeR: FLEE_R, bugs: [] }),
  } as unknown as Butterflies;
}
