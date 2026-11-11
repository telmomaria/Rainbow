import * as THREE from 'three';
import type { Obstacle } from './world';

export const CHARACTER_RADIUS = 0.45;

/** Placeholder character built from primitives (replaced by the 10 original characters later). */
export class Character {
  readonly root = new THREE.Group();
  /** Heading in radians; 0 = facing -Z. */
  heading = 0;
  private walkPhase = 0;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly body: THREE.Group;

  constructor() {
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color });
    this.body = new THREE.Group();
    this.root.add(this.body);

    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 16), mat(0xff6fb5));
    dress.position.y = 1.05;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 12), mat(0xff6fb5));
    torso.position.y = 1.65;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat(0xffd7b5));
    head.position.y = 2.15;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.33, 20, 16, 0, Math.PI * 2, 0, Math.PI / 1.8),
      mat(0x7b3fe4),
    );
    hair.position.y = 2.2;
    hair.rotation.x = 0.25;
    // small nose so the facing direction is readable
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xffb48a));
    nose.position.set(0, 2.12, -0.3);

    this.legL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), mat(0xffd7b5));
    this.legR = this.legL.clone();
    this.legL.position.set(-0.15, 0.3, 0);
    this.legR.position.set(0.15, 0.3, 0);

    for (const m of [dress, torso, head, hair, nose, this.legL, this.legR]) {
      m.castShadow = true;
      this.body.add(m);
    }
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Move by (dx, dz) in world space, sliding along obstacles. */
  move(dx: number, dz: number, obstacles: Obstacle[]): void {
    const p = this.root.position;
    // resolve each axis separately so the character slides along walls
    if (!collides(p.x + dx, p.z, obstacles)) p.x += dx;
    if (!collides(p.x, p.z + dz, obstacles)) p.z += dz;
  }

  /** Turn smoothly towards a target heading. */
  turnTowards(target: number, maxStep: number): void {
    let diff = target - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.max(-maxStep, Math.min(maxStep, diff));
  }

  update(dt: number, speed: number): void {
    this.root.rotation.y = this.heading;
    if (speed > 0.01) {
      this.walkPhase += dt * speed * 3;
      const swing = Math.sin(this.walkPhase) * 0.6;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.08;
    } else {
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
      this.body.position.y *= 0.8;
    }
  }
}

function collides(x: number, z: number, obstacles: Obstacle[]): boolean {
  const r = CHARACTER_RADIUS;
  for (const o of obstacles) {
    const cx = Math.max(o.minX, Math.min(x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  }
  return false;
}
