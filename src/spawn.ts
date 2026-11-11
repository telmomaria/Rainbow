import * as THREE from 'three';
import type { Obstacle } from './world';

/** True if a circle of radius r at (x, z) does not overlap any obstacle. */
export function isFree(x: number, z: number, r: number, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) {
    const cx = Math.max(o.minX, Math.min(x, o.maxX));
    const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  return true;
}

/**
 * Random free spot inside a square of half-size `range` around `center`,
 * at least `minDist` away from `avoid` (usually the player).
 */
export function randomFreeSpot(
  obstacles: Obstacle[],
  opts: { center?: THREE.Vector3; range?: number; radius?: number; avoid?: THREE.Vector3; minDist?: number } = {},
): THREE.Vector3 {
  const { center = new THREE.Vector3(), range = 70, radius = 1, avoid, minDist = 0 } = opts;
  for (let tries = 0; tries < 200; tries++) {
    const x = center.x + (Math.random() * 2 - 1) * range;
    const z = center.z + (Math.random() * 2 - 1) * range;
    if (!isFree(x, z, radius, obstacles)) continue;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return center.clone();
}
