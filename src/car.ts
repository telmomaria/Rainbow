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

/**
 * A little car parked by the road. Walk into it to get in (no UI: it just happens),
 * drive with the arrows or by tapping the ground; get out with Space/Enter or by tapping the car.
 */
export class Car {
  readonly group = new THREE.Group();
  readonly interactable: Interactable;
  heading: number; // 0 = facing -Z (same convention as the character)
  speed = 0;
  driving = false;
  /** Obstacle box kept in the shared list; follows the car (axis-aligned bound of the rotated car). */
  private readonly box: Obstacle;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly frontWheels: THREE.Group[] = [];
  private steerVis = 0;
  private bumpCooldown = 0;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    at: THREE.Vector3,
    heading: number,
    color: number,
    onEnter: () => void,
  ) {
    this.heading = heading;
    buildCar(this.group, color, this.wheels, this.frontWheels);
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
        if (!this.driving) onEnter();
      },
    };
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** Where the character stands when getting out (driver side, i.e. the car's left). */
  exitPoint(): THREE.Vector3 {
    const left = new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading));
    for (const d of [2.0, 2.6, -2.0, -2.6]) {
      const p = this.position.clone().addScaledVector(left, d);
      if (isFree(p.x, p.z, 0.5, this.obstacles.filter((o) => o !== this.box))) return p;
    }
    // behind the car as a last resort
    return this.position.clone().add(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(3.2));
  }

  enter(): void {
    this.driving = true;
    this.speed = 0;
    // "vroom": rising growl
    [110, 140, 180, 230].forEach((f, i) => tone(f, i * 0.09, 0.18, 'sawtooth', 0.06));
  }

  exit(): void {
    this.driving = false;
    this.speed = 0;
    tone(523, 0, 0.12, 'square', 0.05);
    tone(392, 0.1, 0.15, 'square', 0.05);
  }

  honk(): void {
    tone(440, 0, 0.18, 'square', 0.07);
    tone(554, 0, 0.18, 'square', 0.05);
  }

  /**
   * Drive one frame. `throttle` -1..1, `steer` -1..1 (positive = left).
   * Returns true if it bumped into something this frame.
   */
  drive(dt: number, throttle: number, steer: number): boolean {
    if (throttle > 0) this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * throttle * dt);
    else if (throttle < 0) {
      this.speed = this.speed > 0 ? Math.max(0, this.speed - BRAKE * dt) : Math.max(-MAX_REVERSE, this.speed - ACCEL * 0.5 * dt);
    } else {
      // roll to a stop
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
    this.animate(dt);
    this.updateBox();
    return bumped;
  }

  /** Idle animation while parked (keeps wheels still). */
  update(): void {
    this.group.rotation.y = this.heading;
  }

  private animate(dt: number): void {
    this.group.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x -= (this.speed * dt) / 0.4;
    for (const fw of this.frontWheels) fw.rotation.y = this.steerVis * 0.5;
    // little body bounce at speed
    this.group.children[0].position.y = 0.55 + Math.sin(performance.now() / 60) * 0.015 * Math.min(1, Math.abs(this.speed) / 6);
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

function buildCar(g: THREE.Group, color: number, wheels: THREE.Mesh[], frontWheels: THREE.Group[]): void {
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.1, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222831 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const body = new THREE.Group();
  body.position.y = 0.55;
  g.add(body);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2, 0.7, HALF_LEN * 2), paint);
  chassis.position.y = 0.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 1.8, 0.75, 2.2), paint);
  cabin.position.set(0, 0.9, 0.25);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 1.65, 0.6, 0.06), glass);
  windshield.position.set(0, 0.92, -0.87);
  const rear = windshield.clone();
  rear.position.z = 1.37;
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.8), glass);
  sideL.position.set(-HALF_WID * 0.91, 0.95, 0.25);
  const sideR = sideL.clone();
  sideR.position.x = HALF_WID * 0.91;
  body.add(chassis, cabin, windshield, rear, sideL, sideR);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff0a0, emissiveIntensity: 0.6 }));
    lamp.position.set(side * 0.6, 0.3, -HALF_LEN - 0.02);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0x800000 }));
    tail.position.set(side * 0.65, 0.35, HALF_LEN + 0.01);
    body.add(lamp, tail);
  }
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(HALF_WID * 2.05, 0.18, 0.15), white);
  bumperF.position.set(0, -0.05, -HALF_LEN - 0.05);
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
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
}
