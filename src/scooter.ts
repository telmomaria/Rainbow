import * as THREE from 'three';
import { tone } from './audio';
import { parkSite, roadsideSite, siteBox, siteToWorld } from './places';
import { isFree } from './spawn';
import { mulberry32, type Interactable, type Obstacle, type World } from './world';

/** First city with a scooter (Londres = index 3). Porto / Roma / Madrid have none. */
export const SCOOTER_FROM_CITY = 3;

const HALF_LEN = 0.55;
const HALF_WID = 0.18;
/** A touch above walking (6.5 m/s) — still easy to steer for a 7–8 year old. */
const MAX_SPEED = 9;
const MAX_REVERSE = 2.5;
const ACCEL = 11;
const BRAKE = 16;
const STEER = 2.4; // rad/s at full lock
/** Feet on the deck (a little toward the stem so hands reach the bar). */
const STAND = new THREE.Vector3(0, 0, -0.05);

type Phase = 'parked' | 'mounting' | 'riding' | 'dismounting';

/**
 * Kick scooter on a pavement / park pad (from Londres onward). Touch to hop on standing;
 * drive with arrows or a ground tap; Space / Enter / tap again to hop off. Collision uses
 * the shared world obstacles (same idea as the car).
 */
export class Scooter {
  readonly group = new THREE.Group();
  readonly interactable: Interactable;
  heading: number;
  speed = 0;
  phase: Phase = 'parked';
  private readonly box: Obstacle;
  get obstacleBox(): Obstacle {
    return this.box;
  }
  private readonly wheels: THREE.Mesh[] = [];
  private readonly bars: THREE.Group;
  private steerVis = 0;
  private bumpCooldown = 0;
  private phaseT = 0;
  private rider: THREE.Object3D | null = null;
  private riderFrom = new THREE.Vector3();
  private exitTo = new THREE.Vector3();
  private onDone: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    at: THREE.Vector3,
    heading: number,
    onMount: () => void,
  ) {
    this.heading = heading;
    this.bars = buildScooter(this.group, this.wheels);
    this.group.position.copy(at);
    this.group.rotation.y = heading;
    scene.add(this.group);
    this.box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    this.updateBox();
    obstacles.push(this.box);

    const self = this;
    this.interactable = {
      object: this.group,
      get position() {
        return self.group.position;
      },
      radius: 1.6,
      interact: () => {
        if (this.phase === 'parked') onMount();
      },
    };
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get riding(): boolean {
    return this.phase === 'riding';
  }

  get busy(): boolean {
    return this.phase === 'mounting' || this.phase === 'dismounting';
  }

  /** World point beside the deck (preferred get-off side). */
  exitPoint(): THREE.Vector3 {
    const others = this.obstacles.filter((o) => o !== this.box);
    for (const local of [
      new THREE.Vector3(-0.85, 0, 0.1),
      new THREE.Vector3(0.85, 0, 0.1),
      new THREE.Vector3(0, 0, HALF_LEN + 0.9),
      new THREE.Vector3(0, 0, -HALF_LEN - 0.9),
    ]) {
      const p = this.group.localToWorld(local.clone());
      if (isFree(p.x, p.z, 0.45, others)) return p.setY(0);
    }
    return this.group.localToWorld(new THREE.Vector3(-0.9, 0, 0.2)).setY(0);
  }

  mount(rider: THREE.Object3D): void {
    if (this.phase !== 'parked') return;
    this.rider = rider;
    this.riderFrom.copy(rider.position);
    this.phase = 'mounting';
    this.phaseT = 0;
    this.speed = 0;
    tone(520, 0, 0.07, 'triangle', 0.05);
  }

  /** Hop off; `done` runs when she's standing beside it. */
  dismount(done: () => void): void {
    if (this.phase !== 'riding') return;
    this.phase = 'dismounting';
    this.phaseT = 0;
    this.speed = 0;
    this.exitTo.copy(this.exitPoint());
    this.onDone = done;
    tone(440, 0, 0.07, 'triangle', 0.04);
  }

  /** Instant park (Casa / nova cidade / novo jogo) — no animation. */
  forcePark(): void {
    this.phase = 'parked';
    this.phaseT = 0;
    this.speed = 0;
    this.rider = null;
    this.onDone = null;
    this.bars.rotation.y = 0;
  }

  update(dt: number): void {
    this.group.rotation.y = this.heading;
    const r = this.rider;
    if (this.phase === 'mounting' && r) {
      this.phaseT += dt;
      const t = this.phaseT;
      const stand = this.standWorld();
      if (t < 0.35) {
        const k = smooth(t / 0.35);
        r.position.lerpVectors(this.riderFrom, stand, k);
        r.position.y = Math.sin(k * Math.PI) * 0.35; // little hop onto the deck
      } else {
        this.placeRider();
      }
      if (t >= 0.45) {
        this.phase = 'riding';
        [180, 240].forEach((f, i) => tone(f, i * 0.06, 0.12, 'sawtooth', 0.04));
      }
    } else if (this.phase === 'riding') {
      this.placeRider();
    } else if (this.phase === 'dismounting' && r) {
      this.phaseT += dt;
      const t = this.phaseT;
      const stand = this.standWorld();
      if (t < 0.35) {
        const k = smooth(t / 0.35);
        r.position.lerpVectors(stand, this.exitTo, k);
        r.position.y = Math.sin(k * Math.PI) * 0.28;
      } else {
        r.position.copy(this.exitTo);
      }
      if (t >= 0.45) {
        this.phase = 'parked';
        this.rider = null;
        const done = this.onDone;
        this.onDone = null;
        done?.();
      }
    }
  }

  private standWorld(): THREE.Vector3 {
    return this.group.localToWorld(STAND.clone());
  }

  private placeRider(): void {
    if (!this.rider) return;
    this.rider.position.copy(this.standWorld());
    this.rider.scale.setScalar(1);
  }

  /**
   * Drive one frame. `throttle` -1..1, `steer` -1..1 (positive = left).
   * Returns true if it bumped into something this frame.
   */
  drive(dt: number, throttle: number, steer: number): boolean {
    if (this.phase !== 'riding') return false;
    if (throttle > 0) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * throttle * dt);
    else if (throttle < 0) {
      this.speed = this.speed > 0 ? Math.max(0, this.speed - BRAKE * dt) : Math.max(-MAX_REVERSE, this.speed - ACCEL * 0.45 * dt);
    } else {
      const s = Math.sign(this.speed);
      this.speed = s * Math.max(0, Math.abs(this.speed) - 6 * dt);
    }
    // kick scooters turn easily even at low speed
    const turnFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 2.2, 0.35, 1) * Math.sign(this.speed || 1);
    this.heading += steer * STEER * turnFactor * dt;

    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const nx = this.position.x + fx * this.speed * dt;
    const nz = this.position.z + fz * this.speed * dt;
    const others = this.obstacles.filter((o) => o !== this.box);
    let bumped = false;
    if (this.footprintFree(nx, nz, others)) {
      this.position.x = nx;
      this.position.z = nz;
    } else {
      bumped = Math.abs(this.speed) > 1.5;
      this.speed = 0;
    }
    this.bumpCooldown -= dt;
    if (bumped && this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.5;
      tone(100, 0, 0.14, 'square', 0.08);
    }
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 10);
    this.group.rotation.y = this.heading;
    this.bars.rotation.y = this.steerVis * 0.35;
    for (const w of this.wheels) w.rotation.x -= (this.speed * dt) / 0.18;
    this.updateBox();
    return bumped;
  }

  private footprintFree(x: number, z: number, others: Obstacle[]): boolean {
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const r = HALF_WID + 0.12;
    const off = HALF_LEN - r;
    return isFree(x + fx * off, z + fz * off, r, others) && isFree(x - fx * off, z - fz * off, r, others);
  }

  private updateBox(): void {
    const c = Math.abs(Math.cos(this.heading));
    const s = Math.abs(Math.sin(this.heading));
    const hx = HALF_WID * c + HALF_LEN * s;
    const hz = HALF_WID * s + HALF_LEN * c;
    const p = this.position;
    Object.assign(this.box, { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz });
  }

  debug(): { on: boolean; at: [number, number] | null; riding: boolean; speed: number } {
    return {
      on: true,
      at: [+this.position.x.toFixed(1), +this.position.z.toFixed(1)],
      riding: this.phase === 'riding' || this.phase === 'mounting',
      speed: +this.speed.toFixed(1),
    };
  }
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};

/** Low-poly kick scooter: deck, stem, T-bar, two wheels. */
function buildScooter(g: THREE.Group, wheels: THREE.Mesh[]): THREE.Group {
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x212529, roughness: 0.55, metalness: 0.15 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x339af0, roughness: 0.4, metalness: 0.35 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0xf03e3e, roughness: 0.65 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xced4da, metalness: 0.5, roughness: 0.4 });

  // deck (standing board)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 1.0), deckMat);
  deck.position.set(0, 0.2, 0.05);
  g.add(deck);
  // rear brake lip
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.12), frameMat);
  brake.position.set(0, 0.26, 0.52);
  g.add(brake);

  // neck / stem (leans toward the front wheel)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 8), frameMat);
  stem.position.set(0, 0.62, -0.38);
  stem.rotation.x = 0.28;
  g.add(stem);

  // handlebar assembly (steers visually)
  const bars = new THREE.Group();
  bars.position.set(0, 1.05, -0.48);
  g.add(bars);
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.7, 8), frameMat);
  cross.rotation.z = Math.PI / 2;
  bars.add(cross);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 8), gripMat);
    grip.rotation.z = Math.PI / 2;
    grip.position.x = side * 0.38;
    bars.add(grip);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [z, y] of [
    [-0.48, 0.14],
    [0.48, 0.14],
  ] as const) {
    const hub = new THREE.Group();
    hub.position.set(0, y, z);
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 10), hubMat);
    disc.rotation.z = Math.PI / 2;
    hub.add(tyre, disc);
    g.add(hub);
    wheels.push(tyre);
  }

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return bars;
}

/**
 * One scooter per eligible city, on a park/pavement pad with setback from traffic roads.
 * Null before Londres, or if the city has no free pad.
 */
export function createScooter(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  seed: number,
  cityIndex: number,
  onMount: () => void,
): Scooter | null {
  if (cityIndex < SCOOTER_FROM_CITY) return null;
  const rng = mulberry32(seed * 101 + 7);
  const hw = 0.9;
  const depth = 1.6;
  const site =
    parkSite(obstacles, rng, hw, depth, { minD: 28, maxD: 115, roadGap: 5 }) ??
    roadsideSite(obstacles, rng, hw, depth, { minD: 30, maxD: 120, front: 9 });
  if (!site) return null;

  const area = siteBox(site, -hw, hw, -depth, 0.4);
  world.clearArea(area, 1.5);
  // soft keep-out while parking so props don't glue to it; the scooter box replaces this
  const pad: Obstacle = { ...area };
  obstacles.push(pad);

  const at = siteToWorld(site, 0, -depth / 2);
  // face roughly along the pad (local −Z = forward)
  const heading = site.rot + Math.PI;
  const scooter = new Scooter(scene, obstacles, at, heading, onMount);

  const i = obstacles.indexOf(pad);
  if (i >= 0) obstacles.splice(i, 1);

  return scooter;
}

/** Stub when the city has no scooter (or Moon). */
export function noScooter(): Scooter {
  return {
    group: new THREE.Group(),
    interactable: {
      object: new THREE.Group(),
      position: new THREE.Vector3(2000, 0, 2000),
      radius: 0,
      interact() {},
    },
    heading: 0,
    speed: 0,
    phase: 'parked',
    obstacleBox: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    position: new THREE.Vector3(2000, 0, 2000),
    riding: false,
    busy: false,
    exitPoint: () => new THREE.Vector3(),
    mount() {},
    dismount(done: () => void) {
      done();
    },
    forcePark() {},
    update() {},
    drive: () => false,
    debug: () => ({ on: false, at: null, riding: false, speed: 0 }),
  } as unknown as Scooter;
}
