import * as THREE from 'three';
import { buildSwimsuit, characterById, type CharacterModel } from './characters';
import { wearableDef } from './items';
import type { Obstacle } from './world';

export const CHARACTER_RADIUS = 0.45;
/** Height of the pool's water surface (the pool is a raised basin). */
export const WATER_Y = 0.45;
/** Swimming styles: crawl (livre), costas (backstroke), bruços (breaststroke). */
export type Stroke = 'crawl' | 'costas' | 'brucos';
export const STROKES: Stroke[] = ['crawl', 'costas', 'brucos'];

/** The player's character: one of the 10 original models from characters.ts, plus movement/collision. */
export class Character {
  readonly root = new THREE.Group();
  /** Heading in radians; 0 = facing -Z. */
  heading = 0;
  private walkPhase = 0;
  private model: CharacterModel;
  private bodyBaseY = 0;
  private id: string;
  /** Wearing the swimsuit (changed in the pool's beach cabins). */
  swimwear = false;
  /** In the water: lies on the water and swims (or floats upright with a ring). */
  swimming = false;
  /** Jumping in/out of the water: someone else animates position.y. */
  airborne = false;
  /** Swimming style (double tap / Space in the water cycles it). */
  stroke: Stroke = 'crawl';
  /** Lying on a pool lounger: on her back at this height (null = not lying). */
  lyingY: number | null = null;
  /** Sitting on a swing: legs forward (main.ts places her and sets the tilt). */
  sitting = false;
  private swimPhase = 0;

  constructor(id: string) {
    this.id = id;
    this.model = characterById(id).build();
    this.attach();
  }

  /** Swap the look (keeps position/heading and the swimsuit). */
  setCharacter(id: string): void {
    this.id = id;
    this.rebuild();
  }

  /** Put the swimsuit on / back to normal clothes. */
  setSwimwear(on: boolean): void {
    if (on === this.swimwear) return;
    this.swimwear = on;
    this.rebuild();
  }

  private rebuild(): void {
    this.root.remove(this.model.model);
    this.model = this.swimwear ? buildSwimsuit(this.id) : characterById(this.id).build();
    this.attach();
  }

  private attach(): void {
    this.root.add(this.model.model);
    this.bodyBaseY = this.model.body.position.y;
    this.applyWear();
  }

  /** Accessories (slot → kind), re-applied whenever the model is rebuilt (character change, swimsuit…). */
  private wearing: Record<string, string> = {};
  private wornObjs: THREE.Object3D[] = [];
  setWear(w: Record<string, string>): void {
    this.wearing = { ...w };
    this.applyWear();
  }
  private applyWear(): void {
    for (const o of this.wornObjs) o.removeFromParent();
    this.wornObjs = [];
    const m = this.model as CharacterModel & { head?: THREE.Object3D; headR?: number };
    const model = this.model.model;
    let head = m.head;
    let r = m.headR ?? 0.34;
    if (!head) {
      // non-human shapes (unicorn): an anchor at the top-front of the model
      model.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(model);
      const a = new THREE.Group();
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
      const top = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y - 0.3, bb.min.z + 0.35).applyMatrix4(inv);
      a.position.copy(top);
      this.model.body.add(a);
      this.wornObjs.push(a);
      head = a;
      r = 0.3;
    }
    const k = r / 0.34;
    for (const [slot, kind] of Object.entries(this.wearing)) {
      const def = wearableDef(kind);
      if (!def || def.slot !== slot) continue;
      const o = def.build();
      o.scale.multiplyScalar(k);
      if (slot === 'head') o.position.set(0, r * 0.92, 0);
      else if (slot === 'face') o.position.set(0, 0, -r * 0.97);
      else if (slot === 'neck') o.position.set(0, -r - 0.02, 0);
      else o.position.set(0, -r - 0.35, r * 0.6); // back
      head.add(o);
      this.wornObjs.push(o);
    }
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Move by (dx, dz) in world space, sliding along obstacles. */
  move(dx: number, dz: number, obstacles: Obstacle[]): void {
    const p = this.root.position;
    // already overlapping something (e.g. an object built where she stood)? let her walk out freely
    if (collides(p.x, p.z, obstacles)) {
      p.x += dx;
      p.z += dz;
      return;
    }
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
    const inner = this.model.model;
    if (this.swimming) {
      this.root.rotation.order = 'YXZ';
      this.swimPhase += dt * (2.2 + speed * 1.3);
      const ph = this.swimPhase;
      if (this.model.floatUpright) {
        // bobbing in a float ring, legs paddling under water
        this.root.rotation.x = 0;
        inner.position.set(0, WATER_Y - 1.0 + Math.sin(ph * 1.5) * 0.05, 0);
        for (const l of legs) l.pivot.rotation.x = Math.sin(ph * 2 + l.phase * Math.PI) * 0.5;
      } else {
        // lying on the water, pivoting at the waist
        this.root.rotation.x = -1.42;
        inner.position.set(0, -1.0, 0);
        inner.rotation.y = this.stroke === 'costas' ? Math.PI : 0; // backstroke: turned face up
        if (!this.airborne) this.root.position.y = WATER_Y - 0.08 + Math.sin(ph * 2) * 0.03;
        poseSwim(this.stroke, ph, this.model.arms ?? [], legs);
      }
      return;
    }
    if (this.sitting) {
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      for (const l of legs) l.pivot.rotation.set(-1.45, 0, 0);
      return;
    }
    if (this.lyingY !== null) {
      // on a lounger, on her back (head towards +Z of her heading), back slightly raised
      this.root.rotation.order = 'YXZ';
      this.root.rotation.x = Math.PI / 2 - 0.3;
      this.root.position.y = this.lyingY;
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      resetLimbs(this.model.arms ?? [], legs);
      return;
    }
    if (this.root.rotation.x !== 0 || inner.position.y !== 0 || inner.rotation.y !== 0) {
      // out of the water / off the lounger: stand up again (the hospital sets rotation.x itself while she lies in bed)
      if (!this.airborne && this.root.position.y < 0.01) this.root.rotation.x = 0;
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      resetLimbs(this.model.arms ?? [], legs);
    }
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

/** Arm (shoulder pivot) / leg (hip pivot) motion for each swimming style. `ph` grows with time and speed. */
function poseSwim(stroke: Stroke, ph: number, arms: THREE.Object3D[], legs: CharacterModel['legs']): void {
  arms.forEach((a, i) => {
    const z0 = (a.userData.z0 ??= a.rotation.z) as number;
    const side = i === 0 ? -1 : 1;
    if (stroke === 'crawl') {
      a.rotation.set(-(ph + i * Math.PI), 0, z0); // alternate windmill, face down
    } else if (stroke === 'costas') {
      a.rotation.set(ph + i * Math.PI, 0, z0); // alternate windmill backwards, face up
    } else {
      // bruços: both arms reach forward together, then sweep out and back
      const sweep = Math.max(0, Math.sin(ph));
      a.rotation.set(-Math.PI * 0.85 + sweep * 0.9, 0, z0 + side * sweep * 0.9);
    }
  });
  for (const l of legs) {
    const side = l.phase === 0 ? -1 : 1;
    if (stroke === 'brucos') {
      const kick = Math.max(0, Math.sin(ph + Math.PI)); // frog kick, both legs together
      l.pivot.rotation.set(kick * 0.7, 0, side * kick * 0.45);
    } else {
      l.pivot.rotation.set(Math.sin(ph * 4 + l.phase * Math.PI) * 0.35, 0, 0); // flutter kick
    }
  }
}

function resetLimbs(arms: THREE.Object3D[], legs: CharacterModel['legs']): void {
  for (const a of arms) {
    const z0 = a.userData.z0 as number | undefined;
    if (z0 === undefined) continue; // never swum with these arms: keep the character's own pose (held props)
    a.rotation.set(0, 0, z0);
  }
  for (const l of legs) l.pivot.rotation.z = 0;
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
