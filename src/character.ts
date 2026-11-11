import * as THREE from 'three';
import { characterById, type CharacterModel } from './characters';
import type { Obstacle } from './world';

export const CHARACTER_RADIUS = 0.45;

/** The player's character: one of the 10 original models from characters.ts, plus movement/collision. */
export class Character {
  readonly root = new THREE.Group();
  /** Heading in radians; 0 = facing -Z. */
  heading = 0;
  private walkPhase = 0;
  private model: CharacterModel;
  private bodyBaseY = 0;

  constructor(id: string) {
    this.model = characterById(id).build();
    this.attach();
  }

  /** Swap the look (keeps position/heading). */
  setCharacter(id: string): void {
    this.root.remove(this.model.model);
    this.model = characterById(id).build();
    this.attach();
  }

  private attach(): void {
    this.root.add(this.model.model);
    this.bodyBaseY = this.model.body.position.y;
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
    const { body, legs } = this.model;
    if (speed > 0.01) {
      this.walkPhase += dt * speed * 3;
      const swing = Math.sin(this.walkPhase) * 0.6;
      for (const l of legs) l.pivot.rotation.x = l.phase === 0 ? swing : -swing;
      body.position.y = this.bodyBaseY + Math.abs(Math.sin(this.walkPhase)) * 0.08;
    } else {
      for (const l of legs) l.pivot.rotation.x *= 0.8;
      body.position.y = this.bodyBaseY + (body.position.y - this.bodyBaseY) * 0.8;
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
