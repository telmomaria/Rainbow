import * as THREE from 'three';
import { entersRunway, onRunway } from './airport';
import { buildKitten, meow } from './cattree';
import { inNoSpawn, isFree, randomFreeSpot } from './spawn';
import { onRoad, type Obstacle } from './world';

const SPEED = 1.7; // m/s — a relaxed trot; she walks at 6.5
const BODY_R = 0.35;
/** She is close enough for the cat to notice her. */
const NEAR = 2.4;
/** She has to go this far away before the cat greets her again. */
const FORGET = 7;

/**
 * A grey cat out for a walk: it trots along the pavements all over town (never onto the road),
 * and when she comes close it stops, looks at her, meows and gives a little hop — then carries on.
 * Shown by movement and sound only, no UI. One per city.
 */
export class WanderCat {
  private readonly cat: THREE.Group;
  private readonly tail: THREE.Object3D;
  private target: THREE.Vector3 | null = null;
  /** seconds to stay put before the next stretch */
  private wait = 1;
  private step = 0;
  private time = 0;
  private greeted = false;
  private hop = 0;

  constructor(scene: THREE.Scene, private readonly obstacles: Obstacle[], avoid: THREE.Vector3) {
    const { cat, tail } = buildKitten(0x8a8f9c);
    this.cat = cat;
    this.tail = tail;
    cat.scale.setScalar(1.25);
    cat.position.copy(this.pavementSpot(new THREE.Vector3(), 60, avoid) ?? new THREE.Vector3(6, 0, 6));
    cat.rotation.y = Math.random() * Math.PI * 2;
    scene.add(cat);
  }

  /** A free spot that is not on a road, inside a ticketed venue or (optionally) right next to `avoid`. */
  private pavementSpot(center: THREE.Vector3, range: number, avoid?: THREE.Vector3): THREE.Vector3 | null {
    for (let i = 0; i < 12; i++) {
      const p = randomFreeSpot(this.obstacles, { center, range, radius: 0.8, avoid, minDist: avoid ? 10 : 0 });
      if (!onRoad(p.x, p.z, 1) && !onRunway(p.x, p.z, 2) && !inNoSpawn(p.x, p.z, 1)) return p;
    }
    return null;
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    this.time += dt;
    const g = this.cat;
    const d = Math.hypot(player.x - g.position.x, player.z - g.position.z);
    // she came close: stop, look up at her and meow (once per visit)
    if (!paused && d < NEAR && !this.greeted) {
      this.greeted = true;
      this.wait = 2.5;
      this.hop = 0.001;
      meow(0.08);
    }
    if (d > FORGET) this.greeted = false;

    let walking = false;
    if (!paused) {
      if (this.wait > 0) {
        this.wait -= dt;
        if (d < NEAR + 1) turnTo(g, player.x - g.position.x, player.z - g.position.z, dt * 5);
      } else walking = this.walk(dt);
    }

    // trot: quick bob and a little body roll; standing: settle
    this.step = walking ? this.step + dt * 12 : 0;
    let y = walking ? Math.abs(Math.sin(this.step)) * 0.05 : 0;
    if (this.hop > 0) {
      this.hop += dt * 2.2;
      if (this.hop >= 1) this.hop = 0;
      else y += Math.sin(this.hop * Math.PI) * 0.35;
    }
    g.position.y = y;
    g.rotation.z = walking ? Math.sin(this.step) * 0.06 : 0;
    this.tail.rotation.z = Math.sin(this.time * (walking ? 5 : 2.2)) * (walking ? 0.35 : 0.6);
  }

  /** One step towards the current target; picks a new one (anywhere in town) when it arrives or is blocked. */
  private walk(dt: number): boolean {
    const g = this.cat;
    if (!this.target) {
      const t = this.pavementSpot(g.position, 28);
      if (!t || t.distanceTo(g.position) < 3) {
        this.wait = 0.3;
        return false;
      }
      this.target = t;
    }
    const dx = this.target.x - g.position.x;
    const dz = this.target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      this.target = null;
      this.wait = 0.6 + Math.random() * 1.2; // a sniff, then off again
      return false;
    }
    const s = Math.min(SPEED * dt, dist);
    const nx = g.position.x + (dx / dist) * s;
    const nz = g.position.z + (dz / dist) * s;
    const leavesPavement = onRoad(nx, nz, 0.4) && !onRoad(g.position.x, g.position.z, 0.4);
    if (!isFree(nx, nz, BODY_R, this.obstacles) || leavesPavement || entersRunway(g.position.x, g.position.z, nx, nz) || inNoSpawn(nx, nz, BODY_R)) {
      this.target = null; // wall, road or fence in the way: go somewhere else
      this.wait = 0.2;
      return false;
    }
    g.position.x = nx;
    g.position.z = nz;
    turnTo(g, dx, dz, dt * 7);
    return true;
  }

  /** For the ?debug bridge. */
  debug(): { at: [number, number]; walking: boolean; greeted: boolean } {
    return { at: [+this.cat.position.x.toFixed(1), +this.cat.position.z.toFixed(1)], walking: this.step > 0, greeted: this.greeted };
  }
}

/** Turn a group (whose face looks at -Z) smoothly towards the direction (dx, dz). */
function turnTo(g: THREE.Object3D, dx: number, dz: number, k: number): void {
  const target = Math.atan2(dx, dz) + Math.PI;
  let diff = target - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  g.rotation.y += diff * Math.min(1, k);
}
