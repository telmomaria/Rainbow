import * as THREE from 'three';
import { tone } from './audio';
import { isFree } from './spawn';
import type { Interactable, Obstacle } from './world';

const HALF_LEN = 2.1;
const HALF_WID = 1.0;
const MAX_SPEED = 13;
const MAX_REVERSE = 4;
const ACCEL = 9;
const BRAKE = 14;
const STEER = 1.9; // rad/s at full lock
const BODY_Y = 0.55;
/** Driver's seat in car-local coordinates (feet origin of the seated, scaled-down character). */
const SEAT = new THREE.Vector3(-0.42, BODY_Y - 0.12, 0.3);
const RIDER_SCALE = 0.64;
/** Driver door hinge (front edge of the left front door), car-local. */
const HINGE = new THREE.Vector3(-HALF_WID - 0.02, BODY_Y, -0.75);
const DOOR_LEN = 1.15;

type Phase = 'parked' | 'entering' | 'driving' | 'exiting';

/**
 * A little car parked by the pavement. Walk into it: the driver's door swings open, the character climbs in
 * and stays visible at the wheel through the windows, the door closes. Drive with the arrows or by tapping
 * the ground; get out with Space/Enter or by tapping the car (the door opens again and she steps out).
 */
export class Car {
  readonly group = new THREE.Group();
  readonly interactable: Interactable;
  heading: number; // 0 = facing -Z (same convention as the character)
  speed = 0;
  phase: Phase = 'parked';
  /** Obstacle box kept in the shared list; follows the car (axis-aligned bound of the rotated car). */
  private readonly box: Obstacle;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly frontWheels: THREE.Group[] = [];
  private readonly door: THREE.Group;
  private readonly body: THREE.Group;
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
    color: number,
    onEnter: () => void,
  ) {
    this.heading = heading;
    const built = buildCar(this.group, color, this.wheels, this.frontWheels);
    this.door = built.door;
    this.body = built.body;
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
      radius: 2.9,
      interact: () => {
        if (this.phase === 'parked') onEnter();
      },
    };
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** True once she's seated and the door is shut — the car can be driven. */
  get driving(): boolean {
    return this.phase === 'driving';
  }

  /** True while getting in or out (no driving, no walking). */
  get busy(): boolean {
    return this.phase === 'entering' || this.phase === 'exiting';
  }

  /** World point just outside the driver's door. */
  private doorSide(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(-HALF_WID - 0.9, 0, -0.2));
  }

  /** Where the character ends up when getting out (driver side if free). */
  exitPoint(): THREE.Vector3 {
    const others = this.obstacles.filter((o) => o !== this.box);
    for (const local of [
      new THREE.Vector3(-HALF_WID - 1.0, 0, -0.2),
      new THREE.Vector3(-HALF_WID - 1.6, 0, 0.3),
      new THREE.Vector3(HALF_WID + 1.0, 0, -0.2),
      new THREE.Vector3(0, 0, HALF_LEN + 1.2),
    ]) {
      const p = this.group.localToWorld(local.clone());
      if (isFree(p.x, p.z, 0.5, others)) return p.setY(0);
    }
    return this.group.localToWorld(new THREE.Vector3(0, 0, HALF_LEN + 1.6)).setY(0);
  }

  /** Start the get-in animation; `rider` is the character's root (it stays visible inside the car). */
  enter(rider: THREE.Object3D): void {
    if (this.phase !== 'parked') return;
    this.rider = rider;
    this.riderFrom.copy(rider.position);
    this.phase = 'entering';
    this.phaseT = 0;
    this.speed = 0;
    tone(660, 0, 0.08, 'square', 0.04); // door click
  }

  /** Start the get-out animation; `done` runs when she's standing outside and the door is shut. */
  exit(done: () => void): void {
    if (this.phase !== 'driving') return;
    this.phase = 'exiting';
    this.phaseT = 0;
    this.speed = 0;
    this.exitTo.copy(this.exitPoint());
    this.onDone = done;
    tone(660, 0, 0.08, 'square', 0.04);
  }

  honk(): void {
    tone(440, 0, 0.18, 'square', 0.07);
    tone(554, 0, 0.18, 'square', 0.05);
  }

  /** Per-frame: door + rider animation (call every frame, driving or not). */
  update(dt: number): void {
    this.group.rotation.y = this.heading;
    const r = this.rider;
    if (this.phase === 'entering' && r) {
      this.phaseT += dt;
      const t = this.phaseT;
      this.setDoor(smooth(Math.min(1, t / 0.35)) * (1 - smooth(clamp01((t - 1.35) / 0.3))));
      const side = this.doorSide();
      if (t < 0.35) {
        // door opening, she waits
      } else if (t < 0.85) {
        // walk to the open door
        r.position.lerpVectors(this.riderFrom, side, smooth((t - 0.35) / 0.5));
        r.scale.setScalar(1);
      } else if (t < 1.35) {
        // climb in: slide to the seat while shrinking into the sitting size
        const k = smooth((t - 0.85) / 0.5);
        r.position.lerpVectors(side, this.seatWorld(), k);
        r.scale.setScalar(THREE.MathUtils.lerp(1, RIDER_SCALE, k));
      } else {
        this.placeRider();
      }
      if (t >= 1.35 && t - dt < 1.35) tone(180, 0, 0.12, 'sine', 0.06); // door thud
      if (t >= 1.7) {
        this.phase = 'driving';
        [110, 140, 180, 230].forEach((f, i) => tone(f, i * 0.09, 0.18, 'sawtooth', 0.06)); // vroom
      }
    } else if (this.phase === 'driving') {
      this.placeRider();
    } else if (this.phase === 'exiting' && r) {
      this.phaseT += dt;
      const t = this.phaseT;
      this.setDoor(smooth(Math.min(1, t / 0.3)) * (1 - smooth(clamp01((t - 1.3) / 0.3))));
      const side = this.doorSide();
      if (t < 0.3) {
        this.placeRider();
      } else if (t < 0.8) {
        const k = smooth((t - 0.3) / 0.5);
        r.position.lerpVectors(this.seatWorld(), side, k);
        r.scale.setScalar(THREE.MathUtils.lerp(RIDER_SCALE, 1, k));
      } else if (t < 1.3) {
        r.position.lerpVectors(side, this.exitTo, smooth((t - 0.8) / 0.5));
        r.scale.setScalar(1);
      }
      if (t >= 1.6) {
        r.position.copy(this.exitTo);
        r.scale.setScalar(1);
        this.phase = 'parked';
        this.rider = null;
        tone(180, 0, 0.12, 'sine', 0.06);
        const done = this.onDone;
        this.onDone = null;
        done?.();
      }
    }
  }

  private seatWorld(): THREE.Vector3 {
    return this.group.localToWorld(SEAT.clone());
  }

  private placeRider(): void {
    if (!this.rider) return;
    this.rider.position.copy(this.seatWorld());
    this.rider.scale.setScalar(RIDER_SCALE);
  }

  /** 0 = shut, 1 = wide open. */
  private setDoor(open: number): void {
    this.door.rotation.y = -1.15 * open;
  }

  /**
   * Drive one frame. `throttle` -1..1, `steer` -1..1 (positive = left).
   * Returns true if it bumped into something this frame.
   */
  drive(dt: number, throttle: number, steer: number): boolean {
    if (this.phase !== 'driving') return false;
    if (throttle > 0) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * throttle * dt);
    else if (throttle < 0) {
      this.speed = this.speed > 0 ? Math.max(0, this.speed - BRAKE * dt) : Math.max(-MAX_REVERSE, this.speed - ACCEL * 0.5 * dt);
    } else {
      const s = Math.sign(this.speed);
      this.speed = s * Math.max(0, Math.abs(this.speed) - 5 * dt);
    }
    // steering only bites while moving; reversing turns the other way like a real car
    const turnFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 4, 0, 1) * Math.sign(this.speed || 1);
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
      bumped = Math.abs(this.speed) > 2;
      this.speed = 0;
    }
    this.bumpCooldown -= dt;
    if (bumped && this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.6;
      tone(90, 0, 0.2, 'square', 0.1);
    }
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 8);
    this.group.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x -= (this.speed * dt) / 0.4;
    for (const fw of this.frontWheels) fw.rotation.y = this.steerVis * 0.5;
    this.body.position.y = BODY_Y + Math.sin(performance.now() / 60) * 0.015 * Math.min(1, Math.abs(this.speed) / 6);
    this.updateBox();
    return bumped;
  }

  /** Two circles (front and back) approximate the car. */
  private footprintFree(x: number, z: number, others: Obstacle[]): boolean {
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const r = HALF_WID + 0.05;
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
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};

/** Car with a see-through cabin (roof on pillars + glass) so the driver is visible from outside. */
function buildCar(
  g: THREE.Group,
  color: number,
  wheels: THREE.Mesh[],
  frontWheels: THREE.Group[],
): { door: THREE.Group; body: THREE.Group } {
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222831 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x4a3b6b });

  const body = new THREE.Group();
  body.position.y = BODY_Y;
  g.add(body);
  // lower body: floor + side walls up to the window line (so the open door leaves a real gap)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2, 0.25, HALF_LEN * 2), paint);
  floor.position.y = -0.03;
  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2, 0.45, 1.25), paint);
  bonnet.position.set(0, 0.32, -HALF_LEN + 0.62);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2, 0.45, 0.75), paint);
  boot.position.set(0, 0.32, HALF_LEN - 0.37);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 2.1), paint);
  rightWall.position.set(HALF_WID - 0.04, 0.32, 0.25);
  const rearLeftWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.95), paint);
  rearLeftWall.position.set(-HALF_WID + 0.04, 0.32, 0.82);
  body.add(floor, bonnet, boot, rightWall, rearLeftWall);

  // cabin: roof on four pillars, transparent glass all round
  // glass roof inside a painted frame: the follow camera looks down, so the driver must show from above too
  const roofGlass = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WID * 1.75, 1.8), glass);
  roofGlass.rotation.x = -Math.PI / 2;
  roofGlass.position.set(0, 1.32, 0.3);
  body.add(roofGlass);
  for (const [w, d, x, z] of [[HALF_WID * 1.85, 0.12, 0, -0.62], [HALF_WID * 1.85, 0.12, 0, 1.22], [0.1, 1.9, -0.88, 0.3], [0.1, 1.9, 0.88, 0.3]] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), paint);
    rail.position.set(x, 1.3, z);
    body.add(rail);
  }
  for (const [x, z] of [[-0.86, -0.62], [0.86, -0.62], [-0.86, 1.22], [0.86, 1.22]] as const) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), paint);
    pillar.position.set(x, 0.92, z);
    body.add(pillar);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.75), glass);
  front.position.set(0, 0.93, -0.64);
  front.rotation.x = -0.25;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.72), glass);
  back.position.set(0, 0.93, 1.24);
  const rightGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.72), glass);
  rightGlass.position.set(0.88, 0.93, 0.3);
  rightGlass.rotation.y = Math.PI / 2;
  body.add(front, back, rightGlass);

  // seats + steering wheel
  for (const x of [-0.42, 0.42]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.6), seatMat);
    seat.position.set(x, 0.2, 0.4);
    // low seat backs so the driver's head and shoulders show through the rear window
    const back2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.12), seatMat);
    back2.position.set(x, 0.42, 0.72);
    body.add(seat, back2);
  }
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 18), dark);
  wheelRing.position.set(-0.42, 0.72, -0.35);
  wheelRing.rotation.x = -0.9;
  body.add(wheelRing);

  // driver's door: hinged at its front edge, swings outwards (rotation.y negative)
  const door = new THREE.Group();
  door.position.copy(HINGE).setY(0);
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.45, DOOR_LEN), paint);
  doorPanel.position.set(0, BODY_Y + 0.32, DOOR_LEN / 2);
  const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_LEN - 0.1, 0.62), glass);
  doorGlass.rotation.y = -Math.PI / 2;
  doorGlass.position.set(0, BODY_Y + 0.88, DOOR_LEN / 2);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.2), white);
  handle.position.set(-0.05, BODY_Y + 0.45, DOOR_LEN - 0.25);
  door.add(doorPanel, doorGlass, handle);
  g.add(door);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff0a0, emissiveIntensity: 0.6 }),
    );
    lamp.position.set(side * 0.6, 0.35, -HALF_LEN - 0.02);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0x800000 }));
    tail.position.set(side * 0.65, 0.4, HALF_LEN + 0.01);
    body.add(lamp, tail);
  }
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2.05, 0.18, 0.15), white);
  bumperF.position.set(0, 0.0, -HALF_LEN - 0.05);
  const bumperB = bumperF.clone();
  bumperB.position.z = HALF_LEN + 0.05;
  body.add(bumperF, bumperB);

  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const holder = new THREE.Group();
    holder.position.set(x * (HALF_WID - 0.05), 0.4, z * (HALF_LEN - 0.75));
    const wheel = new THREE.Mesh(wheelGeo, dark);
    holder.add(wheel);
    g.add(holder);
    wheels.push(wheel);
    if (z < 0) frontWheels.push(holder);
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material !== glass) m.castShadow = true;
  });
  return { door, body };
}
