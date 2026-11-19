import * as THREE from 'three';
import {
  buildRobe,
  buildShopOutfit,
  buildSwimsuit,
  characterById,
  isShopOutfit,
  type CharacterModel,
} from './characters';
import { wearableDef } from './items';
import { SHOE_FOOT_Y, SHOE_FOOT_Z, buildShoeMesh, type ShoeKind } from './shoes';
import type { Obstacle } from './world';

/** Broken stub cape (blue flat box stuck to the head) — never re-apply. */
const BROKEN_WEAR = new Set(['srv-capa']);

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
  /** On the massage table (on her back, face clear / turned toward the masseuse). */
  prone = false;
  /** Sitting on a swing: legs forward (main.ts places her and sets the tilt). */
  sitting = false;
  /** Standing on a kick scooter: hands on the bars (main.ts places her on the deck). */
  scooterRiding = false;
  /** Limbs are still in the scooter pose: put them back on the first normal frame after getting off. */
  private scooterPosed = false;
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

  /** SPA bathrobe on / off (spa.ts). The swimsuit wins while both are set (in the hot water). */
  robe = false;
  setRobe(on: boolean): void {
    if (on === this.robe) return;
    this.robe = on;
    this.rebuild();
  }

  private rebuild(): void {
    this.root.remove(this.model.model);
    if (this.swimwear) this.model = buildSwimsuit(this.id);
    else if (this.robe) this.model = buildRobe(this.id);
    else {
      const bodyKind = this.wearing.body;
      this.model =
        bodyKind && isShopOutfit(bodyKind) ? buildShopOutfit(this.id, bodyKind) : characterById(this.id).build();
    }
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
  private bodyOutfit: string | null = null;
  setWear(w: Record<string, string>): void {
    // strip broken kinds from the caller's object too (save.wear is passed by reference)
    for (const [slot, kind] of Object.entries(w)) {
      if (BROKEN_WEAR.has(kind)) delete w[slot];
    }
    const clean = { ...w };
    const nextBody = clean.body ?? null;
    const bodyChanged = nextBody !== this.bodyOutfit;
    this.wearing = clean;
    this.bodyOutfit = nextBody;
    if (bodyChanged && !this.swimwear) this.rebuild();
    else this.applyWear();
  }
  /** What is on her right now (slot → kind), including a shop try-on that is not saved. */
  wornNow(): Record<string, string> {
    return { ...this.wearing };
  }
  private applyWear(): void {
    for (const o of this.wornObjs) o.removeFromParent();
    this.wornObjs = [];
    // restore default biped shoes (hidden while a shop pair is on)
    for (const leg of this.model.legs) {
      for (const ch of leg.pivot.children) {
        if ((ch as THREE.Object3D).userData?.isShoe) ch.visible = true;
      }
    }
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
    // Salon cut/dye: hide stock hair meshes so the new style replaces them (not stacked on top).
    const headWear = this.wearing.head ? wearableDef(this.wearing.head) : undefined;
    const hideStockHair = !!headWear?.replacesHair;
    if (head) {
      head.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData?.isHair) o.visible = !hideStockHair;
      });
    }
    for (const [slot, kind] of Object.entries(this.wearing)) {
      if (slot === 'body') continue; // baked into the rebuilt torso
      const def = wearableDef(kind);
      if (!def || def.slot !== slot) continue;
      if (slot === 'feet') {
        if (this.swimwear) continue; // bare feet in the pool
        this.applyShoes(kind);
        continue;
      }
      if (slot === 'hands') {
        this.applyNails(kind);
        continue;
      }
      const o = def.build();
      o.scale.multiplyScalar(k);
      if (slot === 'head') {
        // full hair replacement sits centred on the crown; hats/bows stay on top
        o.position.set(0, def.replacesHair ? r * 0.15 : r * 0.92, def.replacesHair ? 0.02 : 0);
      } else if (slot === 'face') o.position.set(0, 0, -r * 0.97);
      else if (slot === 'neck') o.position.set(0, -r - 0.02, 0);
      else o.position.set(0, -r - 0.35, r * 0.6); // back
      head.add(o);
      this.wornObjs.push(o);
    }
  }

  /** Paint both hands (or unicorn front “paws”) with the registered nail mesh. */
  private applyNails(kind: string): void {
    const def = wearableDef(kind);
    if (!def) return;
    const arms = this.model.arms;
    if (arms && arms.length >= 2) {
      for (const arm of arms) {
        const nails = def.build();
        // HAND in characters.ts is [0, -0.55, 0]; tips sit on the palm, slightly forward (−Z)
        nails.position.set(0, -0.55, -0.06);
        arm.add(nails);
        this.wornObjs.push(nails);
      }
      return;
    }
    // unicorn / non-biped: little polished tips near the front
    const pair = new THREE.Group();
    for (const s of [-1, 1]) {
      const nails = def.build();
      nails.position.set(s * 0.2, 0.52, -0.55);
      pair.add(nails);
    }
    this.model.body.add(pair);
    this.wornObjs.push(pair);
  }

  /** Hide stock biped shoes and put a pair of shop shoes on both leg pivots. */
  private applyShoes(kind: string): void {
    const shoeKind = kind as ShoeKind;
    const legs = this.model.legs;
    if (!legs.length) {
      // unicorn / non-biped: little booties near the front hooves
      const pair = new THREE.Group();
      for (const s of [-1, 1]) {
        const sh = buildShoeMesh(shoeKind, 0.9);
        sh.position.set(s * 0.18, 0.08, -0.55);
        pair.add(sh);
      }
      this.model.body.add(pair);
      this.wornObjs.push(pair);
      return;
    }
    for (const leg of legs) {
      for (const ch of leg.pivot.children) {
        if ((ch as THREE.Object3D).userData?.isShoe) ch.visible = false;
      }
      const sh = buildShoeMesh(shoeKind, 1);
      sh.position.set(0, SHOE_FOOT_Y, SHOE_FOOT_Z);
      leg.pivot.add(sh);
      this.wornObjs.push(sh);
    }
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Move by (dx, dz) in world space, sliding along obstacles. */
  move(dx: number, dz: number, obstacles: Obstacle[]): void {
    const p = this.root.position;
    // Already overlapping (spawned inside a new prop, etc.): only accept steps that leave the solid —
    // never walk freely through people/walls (that caused visual clipping with folk/NPCs).
    if (collides(p.x, p.z, obstacles)) {
      const tries: [number, number][] = [
        [dx, dz],
        [dx, 0],
        [0, dz],
        [-dx, -dz],
        [-dx, 0],
        [0, -dz],
      ];
      for (const [cx, cz] of tries) {
        if (!collides(p.x + cx, p.z + cz, obstacles)) {
          p.x += cx;
          p.z += cz;
          return;
        }
      }
      escapeObstacles(p, obstacles);
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

  /** Hip pitch of each leg (for QA: prove the walk cycle is swinging, not an elevator slide). */
  legPitches(): number[] {
    return this.model.legs.map((l) => l.pivot.rotation.x);
  }

  /**
   * Massage lie: on her back on the pad (same readable pose as the lounger), face clear
   * and turned a little toward the masseuse. No face-down — that buried the head in the pad.
   * Call each frame while hold()’d — player.update runs earlier in the tick.
   */
  applyProneLie(padY: number): void {
    this.lyingY = padY;
    this.prone = true;
    this.airborne = true;
    this.root.rotation.order = 'YXZ';
    this.root.rotation.x = Math.PI / 2 - 0.22;
    this.root.rotation.z = 0;
    this.root.position.y = padY;
    const head = (this.model as CharacterModel & { head?: THREE.Object3D }).head;
    // look toward the masseuse (local −X) so the face reads in a side/door shot
    if (head) head.rotation.set(-0.2, -0.85, 0);
    const arms = this.model.arms ?? [];
    for (const a of arms) {
      const z0 = (a.userData.z0 ??= a.rotation.z) as number;
      a.rotation.set(-0.15, 0, z0 * 0.4);
    }
    for (const l of this.model.legs) l.pivot.rotation.set(0.25, 0, 0);
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
      // her face looks at -Z: a positive turn about X swings the feet forward (negative folded them behind her back)
      for (const l of legs) l.pivot.rotation.set(1.45, 0, 0);
      return;
    }
    if (this.scooterRiding) {
      this.scooterPosed = true;
      this.root.rotation.order = 'YXZ';
      this.root.rotation.x = 0.12; // slight lean over the stem
      this.root.rotation.z = 0;
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      poseScooter(this.model.arms ?? [], legs, speed);
      body.position.y = this.bodyBaseY;
      return;
    }
    if (this.scooterPosed) {
      // just got off the scooter: arms down again, legs straight (main.ts already levelled the body)
      this.scooterPosed = false;
      resetLimbs(this.model.arms ?? [], legs);
      for (const l of legs) l.pivot.rotation.x = 0;
    }
    if (this.lyingY !== null) {
      this.root.rotation.order = 'YXZ';
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      const head = (this.model as CharacterModel & { head?: THREE.Object3D }).head;
      if (this.prone) {
        this.applyProneLie(this.lyingY);
        return;
      }
      // lounger: on her back (head towards +Z of her heading), back slightly raised
      this.root.rotation.x = Math.PI / 2 - 0.3;
      this.root.rotation.z = 0;
      this.root.position.y = this.lyingY;
      if (head) head.rotation.set(0, 0, 0);
      resetLimbs(this.model.arms ?? [], legs);
      return;
    }
    if (this.root.rotation.x !== 0 || this.root.rotation.z !== 0 || inner.position.y !== 0 || inner.rotation.y !== 0 || this.prone) {
      // out of the water / off the lounger / off the massage table
      if (!this.airborne && this.root.position.y < 0.01) {
        this.root.rotation.x = 0;
        this.root.rotation.z = 0;
      }
      inner.position.set(0, 0, 0);
      inner.rotation.y = 0;
      const head = (this.model as CharacterModel & { head?: THREE.Object3D }).head;
      if (head) head.rotation.set(0, 0, 0);
      this.prone = false;
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

/** Hands on the T-bar; one foot slightly forward on the deck. */
function poseScooter(arms: THREE.Object3D[], legs: CharacterModel['legs'], speed: number): void {
  arms.forEach((a, i) => {
    const z0 = (a.userData.z0 ??= a.rotation.z) as number;
    const side = i === 0 ? -1 : 1;
    // rest z-spread, then reach forward to the handlebar. Arms hang along −Y and she faces −Z: a POSITIVE turn
    // about X swings them forward (same as the legs when sitting). It was −1.35 (arms behind her) until 2026-11-19.
    a.rotation.set(0, 0, z0);
    a.rotateX(1.35);
    a.rotateY(side * 0.2);
    a.rotateZ(side * -0.15);
  });
  const bob = Math.min(1, Math.abs(speed) / 6) * 0.08;
  for (const l of legs) {
    const forward = l.phase === 0 ? 0.4 : 0.15;
    l.pivot.rotation.set(forward + bob * Math.sin(performance.now() / 90), 0, 0);
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

/** Nudge out of the nearest overlapping obstacle centre (last resort when stuck inside a solid). */
function escapeObstacles(p: THREE.Vector3, obstacles: Obstacle[]): void {
  let best: Obstacle | null = null;
  let bestD = Infinity;
  for (const o of obstacles) {
    const ox = (o.minX + o.maxX) / 2;
    const oz = (o.minZ + o.maxZ) / 2;
    const d = Math.hypot(p.x - ox, p.z - oz);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return;
  const ox = (best.minX + best.maxX) / 2;
  const oz = (best.minZ + best.maxZ) / 2;
  let dx = p.x - ox;
  let dz = p.z - oz;
  const len = Math.hypot(dx, dz) || 1;
  const need = Math.max(best.maxX - best.minX, best.maxZ - best.minZ) / 2 + CHARACTER_RADIUS + 0.05;
  p.x = ox + (dx / len) * need;
  p.z = oz + (dz / len) * need;
}
