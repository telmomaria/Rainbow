import * as THREE from 'three';
import { inNoSpawn, isFree, randomFreeSpot } from './spawn';
import { onRoad, type Obstacle, type World } from './world';

/** Só em Vilnius (cities.ts). */
export const RABBIT_CITY = 'Vilnius';

const SPEED = 1.9; // m/s while hopping forward
const BODY_R = 0.4;
/** She is close enough for the rabbit to freeze and look. */
const NEAR = 2.6;
/** She must leave this far before it greets her again. */
const FORGET = 7.5;
/** Clear buildings around the spawn pad. */
const CLEAR = 2.4;

/**
 * One low-poly rabbit in Vilnius: wanders pavements / garden grass (never the road),
 * hops periodically, and freezes to look when she comes close. Movement only — no UI.
 */
export class WanderRabbit {
  private readonly root: THREE.Group;
  private readonly ears: THREE.Object3D[] = [];
  private readonly hind: THREE.Object3D[] = [];
  private target: THREE.Vector3 | null = null;
  private wait = 0.8;
  private hop = 0;
  private hopCooldown = 0.4;
  private greeted = false;
  private time = 0;
  private alive = true;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    world: World,
    avoid: THREE.Vector3,
  ) {
    const { rabbit, ears, hind } = buildRabbit();
    this.root = rabbit;
    this.ears = ears;
    this.hind = hind;
    rabbit.scale.setScalar(1.45);

    const at = this.pavementSpot(new THREE.Vector3(), 70, avoid) ?? new THREE.Vector3(8, 0, -10);
    // give the bunny a little open patch so it is not glued to a building
    const pad: Obstacle = {
      minX: at.x - CLEAR,
      maxX: at.x + CLEAR,
      minZ: at.z - CLEAR,
      maxZ: at.z + CLEAR,
    };
    world.clearArea(pad, 1.2);

    rabbit.position.copy(at);
    rabbit.rotation.y = Math.random() * Math.PI * 2;
    scene.add(rabbit);
  }

  private pavementSpot(center: THREE.Vector3, range: number, avoid?: THREE.Vector3): THREE.Vector3 | null {
    for (let i = 0; i < 16; i++) {
      const p = randomFreeSpot(this.obstacles, { center, range, radius: 0.9, avoid, minDist: avoid ? 12 : 0 });
      if (!onRoad(p.x, p.z, 1.1) && !inNoSpawn(p.x, p.z, 1)) return p;
    }
    return null;
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive) return;
    this.time += dt;
    const g = this.root;
    const d = Math.hypot(player.x - g.position.x, player.z - g.position.z);

    if (!paused && d < NEAR && !this.greeted) {
      this.greeted = true;
      this.wait = 2.8;
      this.hop = 0.001; // tiny notice hop
      this.target = null;
    }
    if (d > FORGET) this.greeted = false;

    let hopping = false;
    if (!paused) {
      if (this.wait > 0) {
        this.wait -= dt;
        if (d < NEAR + 1.2) turnTo(g, player.x - g.position.x, player.z - g.position.z, dt * 5);
      } else hopping = this.hopWalk(dt);
    }

    // hop arc (also the greet hop)
    let y = 0;
    if (this.hop > 0) {
      this.hop += dt * 3.4;
      if (this.hop >= 1) this.hop = 0;
      else y = Math.sin(this.hop * Math.PI) * 0.42;
    }
    g.position.y = y;

    // ears flop a little; perk when she is near
    const perk = d < NEAR + 0.5 ? 0.18 : 0;
    for (let i = 0; i < this.ears.length; i++) {
      const s = i === 0 ? -1 : 1;
      const base = -s * 0.12;
      const flop = Math.sin(this.time * (hopping ? 9 : 2.4) + i) * (hopping ? 0.22 : 0.08);
      this.ears[i].rotation.z = base + flop - s * perk;
      this.ears[i].rotation.x = perk * 0.35 + (this.hop > 0 ? Math.sin(this.hop * Math.PI) * -0.25 : 0);
    }
    // hind legs tuck on hop
    for (const leg of this.hind) {
      leg.rotation.x = this.hop > 0 ? -Math.sin(this.hop * Math.PI) * 0.7 : 0;
    }
  }

  /** Hop-hop toward a pavement target; never steps onto the road. */
  private hopWalk(dt: number): boolean {
    const g = this.root;
    if (!this.target) {
      const t = this.pavementSpot(g.position, 26);
      if (!t || t.distanceTo(g.position) < 2.5) {
        this.wait = 0.4 + Math.random() * 0.8;
        return false;
      }
      this.target = t;
    }
    const dx = this.target.x - g.position.x;
    const dz = this.target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      this.target = null;
      this.wait = 0.7 + Math.random() * 1.4; // sniff the grass
      return false;
    }

    // between hops: brief pause on the ground
    if (this.hop <= 0) {
      this.hopCooldown -= dt;
      if (this.hopCooldown > 0) {
        turnTo(g, dx, dz, dt * 6);
        return false;
      }
      this.hop = 0.001;
      this.hopCooldown = 0.18 + Math.random() * 0.22;
    }

    const s = Math.min(SPEED * dt, dist);
    const nx = g.position.x + (dx / dist) * s;
    const nz = g.position.z + (dz / dist) * s;
    const leavesPavement = onRoad(nx, nz, 0.45) && !onRoad(g.position.x, g.position.z, 0.45);
    if (!isFree(nx, nz, BODY_R, this.obstacles) || leavesPavement || inNoSpawn(nx, nz, BODY_R)) {
      this.target = null;
      this.wait = 0.25;
      this.hop = 0;
      return false;
    }
    g.position.x = nx;
    g.position.z = nz;
    turnTo(g, dx, dz, dt * 8);
    return true;
  }

  dispose(): void {
    if (!this.alive) return;
    this.root.parent?.remove(this.root);
    this.alive = false;
  }

  debug(): { on: boolean; at: [number, number] | null; hopping: boolean; greeted: boolean } {
    if (!this.alive) return { on: false, at: null, hopping: false, greeted: false };
    return {
      on: true,
      at: [+this.root.position.x.toFixed(1), +this.root.position.z.toFixed(1)],
      hopping: this.hop > 0,
      greeted: this.greeted,
    };
  }
}

/** Stub outside Vilnius / on the Moon. */
export function noRabbit(): WanderRabbit {
  return {
    update() {},
    dispose() {},
    debug: () => ({ on: false, at: null, hopping: false, greeted: false }),
  } as unknown as WanderRabbit;
}

/** One rabbit only in Vilnius; elsewhere a no-op stub. */
export function createRabbit(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  cityName: string,
  avoid: THREE.Vector3,
): WanderRabbit {
  if (cityName !== RABBIT_CITY) return noRabbit();
  return new WanderRabbit(scene, obstacles, world, avoid);
}

/**
 * Recognisable low-poly bunny: long ears with pink inners, oval body, four paws, cotton tail.
 * Face looks toward local −Z (same convention as the wander cat).
 */
function buildRabbit(): { rabbit: THREE.Group; ears: THREE.Object3D[]; hind: THREE.Object3D[] } {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.92, flatShading: true });
  const soft = new THREE.MeshStandardMaterial({ color: 0xffd6e0, roughness: 0.85, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const cotton = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), fur);
  body.scale.set(0.95, 0.85, 1.35);
  body.position.set(0, 0.32, 0.06);
  g.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fur);
  chest.scale.set(1, 0.95, 1.1);
  chest.position.set(0, 0.34, -0.22);
  g.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), fur);
  head.position.set(0, 0.48, -0.42);
  g.add(head);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), soft);
  muzzle.scale.set(1.1, 0.85, 1.2);
  muzzle.position.set(0, 0.42, -0.56);
  g.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), soft);
  nose.position.set(0, 0.44, -0.62);
  g.add(nose);

  const ears: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.09, 0.64, -0.38);
    ear.rotation.z = -s * 0.16;
    // long floppy-up ears (outer + pink inner facing camera side)
    const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.48, 4, 8), fur);
    outer.position.y = 0.28;
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.4, 3, 6), soft);
    inner.position.set(0, 0.28, -0.03);
    ear.add(outer, inner);
    g.add(ear);
    ears.push(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), dark);
    eye.position.set(s * 0.075, 0.52, -0.56);
    g.add(eye);

    // front paws
    const front = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.12, 3, 6), fur);
    front.position.set(s * 0.13, 0.13, -0.2);
    g.add(front);
  }

  const hind: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.15, 0.24);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 3, 6), fur);
    thigh.rotation.x = 0.4;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), fur);
    foot.scale.set(1.1, 0.5, 1.55);
    foot.position.set(0, -0.13, -0.05);
    leg.add(thigh, foot);
    g.add(leg);
    hind.push(leg);
  }

  // cotton-ball rump
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), cotton);
  tail.position.set(0, 0.36, 0.46);
  g.add(tail);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { rabbit: g, ears, hind };
}

/** Smooth yaw toward (dx, dz); face of the group looks at −Z. */
function turnTo(g: THREE.Object3D, dx: number, dz: number, k: number): void {
  const target = Math.atan2(dx, dz) + Math.PI;
  let diff = target - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  g.rotation.y += diff * Math.min(1, k);
}
