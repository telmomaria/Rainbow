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

/** Areas where nothing may be spawned (e.g. inside the concert venue, which needs a ticket). Set per city. */
const noSpawn: Obstacle[] = [];
export function setNoSpawnZones(zones: Obstacle[]): void {
  noSpawn.length = 0;
  noSpawn.push(...zones);
}
/** True if (x, z) is inside a no-spawn area (with margin r). */
export function inNoSpawn(x: number, z: number, r = 0): boolean {
  return noSpawn.some((o) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
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
    if (!isFree(x, z, radius, obstacles) || inNoSpawn(x, z, radius)) continue;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minDist) continue;
    return new THREE.Vector3(x, 0, z);
  }
  return center.clone();
}
