import * as THREE from 'three';
import { isFree, randomFreeSpot } from './spawn';
import type { Obstacle } from './world';

export const COIN_VALUE = 1;
export const JEWEL_VALUE = 5;
const PICKUP_RADIUS = 1.1;
const TARGET_COINS = 120;
const TRAIL = 5; // coins are laid out in short trails, easy to follow and satisfying to collect
const TARGET_JEWELS = 5;

interface Item {
  mesh: THREE.Mesh;
  kind: 'coin' | 'jewel';
  /** 0..1 pickup animation progress; null while lying in the world. */
  taken: number | null;
}

const JEWEL_COLORS = [0xff3b7f, 0x3bc9ff, 0x7dff6b, 0xb06bff, 0xffe14d];

/** Coins and jewels lying around; collected by walking into them, respawned to keep the world full. */
export class Collectibles {
  private readonly items: Item[] = [];
  private readonly coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
  private readonly coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    metalness: 0.1,
    roughness: 0.35,
    emissive: 0xffa800,
    emissiveIntensity: 0.45,
  });
  private readonly jewelGeo = new THREE.OctahedronGeometry(0.4);
  private time = 0;
  private respawnTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
  ) {
    // a first trail straight ahead of the spawn point, so the goal is obvious from second one
    for (let i = 0; i < TRAIL; i++) this.place('coin', new THREE.Vector3(0, 0, -4 - i * 1.6));
    for (let i = 1; i < TARGET_COINS / TRAIL; i++) this.spawnTrail();
    for (let i = 0; i < TARGET_JEWELS; i++) this.spawn('jewel');
  }

  /** A short straight line of coins starting at a free spot (stops early at walls). */
  private spawnTrail(avoid?: THREE.Vector3): void {
    const start = randomFreeSpot(this.obstacles, { radius: 0.8, avoid, minDist: avoid ? 12 : 3, center: avoid, range: avoid ? 45 : 70 });
    const a = Math.random() * Math.PI * 2;
    for (let i = 0; i < TRAIL; i++) {
      const p = start.clone().add(new THREE.Vector3(Math.cos(a) * i * 1.6, 0, Math.sin(a) * i * 1.6));
      if (!isFree(p.x, p.z, 0.6, this.obstacles)) break;
      this.place('coin', p);
    }
  }

  private spawn(kind: Item['kind'], avoid?: THREE.Vector3): void {
    this.place(kind, randomFreeSpot(this.obstacles, { radius: 0.8, avoid, minDist: avoid ? 15 : 3 }));
  }

  private place(kind: Item['kind'], p: THREE.Vector3): void {
    let mesh: THREE.Mesh;
    if (kind === 'coin') {
      mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.rotation.x = Math.PI / 2;
    } else {
      const color = JEWEL_COLORS[Math.floor(Math.random() * JEWEL_COLORS.length)];
      mesh = new THREE.Mesh(
        this.jewelGeo,
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.1 }),
      );
    }
    mesh.position.set(p.x, 0.8, p.z);
    mesh.castShadow = true;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.items.push({ mesh, kind, taken: null });
  }

  /** Advance animations; returns the coin value collected this frame (and which kinds, for sounds). */
  update(dt: number, player: THREE.Vector3): { value: number; kinds: Item['kind'][] } {
    this.time += dt;
    let value = 0;
    const kinds: Item['kind'][] = [];

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const m = it.mesh;
      if (it.taken === null) {
        const phase = m.userData.phase as number;
        m.position.y = 0.8 + Math.sin(this.time * 2.5 + phase) * 0.15;
        if (it.kind === 'coin') m.rotation.z = this.time * 3 + phase;
        else m.rotation.y = this.time * 1.5 + phase;
        if (Math.hypot(m.position.x - player.x, m.position.z - player.z) < PICKUP_RADIUS) {
          it.taken = 0;
          value += it.kind === 'coin' ? COIN_VALUE : JEWEL_VALUE;
          kinds.push(it.kind);
        }
      } else {
        // fly up towards the character's head and shrink
        it.taken += dt * 3;
        m.position.lerp(new THREE.Vector3(player.x, 2.6, player.z), Math.min(1, dt * 10));
        m.scale.setScalar(Math.max(0.01, 1 - it.taken));
        if (it.taken >= 1) {
          this.scene.remove(m);
          this.items.splice(i, 1);
        }
      }
    }

    // keep the world stocked, spawning away from the player so things don't pop in under her feet
    this.respawnTimer += dt;
    if (this.respawnTimer > 2) {
      this.respawnTimer = 0;
      const coins = this.items.filter((i) => i.kind === 'coin' && i.taken === null).length;
      const jewels = this.items.filter((i) => i.kind === 'jewel' && i.taken === null).length;
      if (coins <= TARGET_COINS - TRAIL) this.spawnTrail(player);
      if (jewels < TARGET_JEWELS && Math.random() < 0.25) this.spawn('jewel', player);
    }
    return { value, kinds };
  }
}
