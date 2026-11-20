import * as THREE from 'three';
import { inNoSpawn, inPlayArea, isFree, playAreaHalf, randomFreeSpot } from './spawn';
import { SPAWN, type Obstacle } from './world';

export const COIN_VALUE = 1;
export const JEWEL_VALUE = 5;
/** A banknote: rare (about one in every hundred coins that appear) and worth 20 coins. */
export const NOTE_VALUE = 20;
const NOTE_CHANCE = 0.01;
const PICKUP_RADIUS = 1.1;
const TARGET_COINS = 36;
const TRAIL = 3; // coins are laid out in short trails, easy to follow and satisfying to collect
const TARGET_JEWELS = 3;
const ITEM_R = 0.6;
/** `?debug`: publish how many coins/jewels lie outside the play area on <body data-coins-outside>. */
const DEBUG = new URLSearchParams(location.search).has('debug');
/** QA (?debug): the live Collectibles, for the `rainbow-coins-stress` event (n respawn rounds around x, z). */
let live: Collectibles | null = null;
if (DEBUG) {
  window.addEventListener('rainbow-coins-stress', (e) => {
    const d = (e as CustomEvent<{ x: number; z: number; n?: number; jewels?: boolean }>).detail;
    live?.debugStress(d.x, d.z, d.n ?? 20, !!d.jewels);
  });
}

interface Item {
  mesh: THREE.Mesh;
  kind: 'coin' | 'jewel' | 'note';
  /** 0..1 pickup animation progress; null while lying in the world. */
  taken: number | null;
}

const JEWEL_COLORS = [0xff3b7f, 0x3bc9ff, 0x7dff6b, 0xb06bff, 0xffe14d];

/** Coins and jewels lying around; collected by walking into them, respawned to keep the world full. */
export class Collectibles {
  private readonly items: Item[] = [];
  /** Positions of jewels still lying in the world (debug/QA). */
  jewelPositions(): { x: number; z: number }[] {
    return this.items
      .filter((i) => i.kind === 'jewel' && i.taken === null)
      .map((i) => ({ x: +i.mesh.position.x.toFixed(1), z: +i.mesh.position.z.toFixed(1) }));
  }
  private readonly coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
  private readonly coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    metalness: 0.1,
    roughness: 0.35,
    emissive: 0xffa800,
    emissiveIntensity: 0.45,
  });
  private readonly jewelGeo = new THREE.OctahedronGeometry(0.4);
  private readonly noteGeo = new THREE.BoxGeometry(0.8, 0.42, 0.03);
  private readonly noteMat = new THREE.MeshStandardMaterial({ color: 0x4fd18b, roughness: 0.6, emissive: 0x1f9d55, emissiveIntensity: 0.4 });
  private readonly noteInkMat = new THREE.MeshStandardMaterial({ color: 0xf4fff7, roughness: 0.6 });

  /** QA: put a banknote at a given spot. */
  debugNote(x: number, z: number): void {
    this.place('note', new THREE.Vector3(x, 0, z));
  }

  /** Place a coin or jewel at an exact spot (Moon crater rims / altar path). */
  placeAt(kind: 'coin' | 'jewel', x: number, z: number): void {
    this.place(kind, new THREE.Vector3(x, 0, z));
  }
  private time = 0;
  private respawnTimer = 0;

  /** Optional ground height (Moon hills) and a little extra float (low gravity — LUA5). */
  heightAt: ((x: number, z: number) => number) | null = null;
  floatAmp = 0.15;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
  ) {
    // a first trail straight ahead of the spawn point, so the goal is obvious from second one
    for (let i = 0; i < TRAIL; i++) this.place('coin', new THREE.Vector3(SPAWN.x + 4 + i * 2, 0, SPAWN.z));
    for (let i = 1; i < TARGET_COINS / TRAIL; i++) this.spawnTrail();
    for (let i = 0; i < TARGET_JEWELS; i++) this.spawn('jewel');
    live = this;
  }

  /** QA: run `n` respawn rounds as if she stood at (x, z) — trails (and jewels) appear around that spot. */
  debugStress(x: number, z: number, n: number, jewels: boolean): void {
    const at = new THREE.Vector3(x, 0, z);
    for (let i = 0; i < n; i++) {
      this.spawnTrail(at);
      if (jewels) this.spawn('jewel', at);
    }
    document.body.dataset.coinsOutside = JSON.stringify(this.outsideStats());
  }

  /** Fair spot for a coin: inside the play area (≥3 m from its border), not in a building or a no-spawn venue. */
  private ok(x: number, z: number): boolean {
    return inPlayArea(x, z, ITEM_R) && isFree(x, z, ITEM_R, this.obstacles) && !inNoSpawn(x, z, ITEM_R);
  }

  /**
   * A short straight line of coins starting at a free spot. Every coin of the trail is checked (not only the
   * first); the trail is laid in whichever direction fits all 3, else it stops early at walls / the border.
   */
  private spawnTrail(avoid?: THREE.Vector3): void {
    const minDist = avoid ? 25 : 8;
    const start = randomFreeSpot(this.obstacles, { radius: 0.8, avoid, minDist, center: avoid, range: avoid ? 70 : 110 });
    // randomFreeSpot falls back to its centre (= her feet) when it finds nothing: then just try again in 2 s
    if (!this.ok(start.x, start.z) || (avoid && Math.hypot(start.x - avoid.x, start.z - avoid.z) < minDist)) return;
    const a0 = Math.random() * Math.PI * 2;
    let best: THREE.Vector3[] = [];
    for (let k = 0; k < 6 && best.length < TRAIL; k++) {
      const a = a0 + (k * Math.PI) / 3;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < TRAIL; i++) {
        const p = start.clone().add(new THREE.Vector3(Math.cos(a) * i * 2, 0, Math.sin(a) * i * 2));
        if (!this.ok(p.x, p.z)) break;
        pts.push(p);
      }
      if (pts.length > best.length) best = pts;
    }
    for (const p of best) this.place(Math.random() < NOTE_CHANCE ? 'note' : 'coin', p);
  }

  private spawn(kind: Item['kind'], avoid?: THREE.Vector3): void {
    const minDist = avoid ? 30 : 15;
    const p = randomFreeSpot(this.obstacles, { radius: 0.8, avoid, minDist, range: 110 });
    if (!this.ok(p.x, p.z) || (avoid && Math.hypot(p.x - avoid.x, p.z - avoid.z) < minDist)) return; // retry later
    this.place(kind, p);
  }

  /** QA (?debug): items lying outside the play area / inside a building or venue, now and ever placed. */
  private placedOutside = 0;
  private placedBlocked = 0;
  private placedTotal = 0;
  outsideStats(): { outside: number; blocked: number; lying: number; placedOutside: number; placedBlocked: number; placed: number; half: number } {
    let outside = 0;
    let blocked = 0;
    let lying = 0;
    for (const it of this.items) {
      if (it.taken !== null) continue;
      lying++;
      const { x, z } = it.mesh.position;
      if (!inPlayArea(x, z)) outside++;
      else if (!isFree(x, z, 0.3, this.obstacles) || inNoSpawn(x, z)) blocked++;
    }
    return { outside, blocked, lying, placedOutside: this.placedOutside, placedBlocked: this.placedBlocked, placed: this.placedTotal, half: playAreaHalf() };
  }

  private place(kind: Item['kind'], p: THREE.Vector3): void {
    if (DEBUG) {
      this.placedTotal++;
      if (!inPlayArea(p.x, p.z)) this.placedOutside++;
      else if (!isFree(p.x, p.z, 0.3, this.obstacles) || inNoSpawn(p.x, p.z)) this.placedBlocked++;
    }
    let mesh: THREE.Mesh;
    if (kind === 'coin') {
      mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
      mesh.rotation.x = Math.PI / 2;
    } else if (kind === 'note') {
      // a green banknote standing on its long edge, with a pale oval in the middle on both faces
      mesh = new THREE.Mesh(this.noteGeo, this.noteMat);
      for (const side of [-1, 1]) {
        const oval = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), this.noteInkMat);
        oval.position.z = side * 0.017;
        oval.rotation.y = side < 0 ? Math.PI : 0;
        oval.scale.x = 1.3;
        mesh.add(oval);
      }
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
        const ground = this.heightAt?.(m.position.x, m.position.z) ?? 0;
        m.position.y = ground + 0.8 + Math.sin(this.time * 2.5 + phase) * this.floatAmp;
        if (it.kind === 'coin') m.rotation.z = this.time * 3 + phase;
        else m.rotation.y = this.time * 1.5 + phase;
        if (Math.hypot(m.position.x - player.x, m.position.z - player.z) < PICKUP_RADIUS) {
          it.taken = 0;
          value += it.kind === 'coin' ? COIN_VALUE : it.kind === 'note' ? NOTE_VALUE : JEWEL_VALUE;
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
      const coins = this.items.filter((i) => i.kind !== 'jewel' && i.taken === null).length;
      const jewels = this.items.filter((i) => i.kind === 'jewel' && i.taken === null).length;
      if (coins <= TARGET_COINS - TRAIL) this.spawnTrail(player);
      if (jewels < TARGET_JEWELS && Math.random() < 0.1) this.spawn('jewel', player);
      if (DEBUG) document.body.dataset.coinsOutside = JSON.stringify(this.outsideStats());
    }
    return { value, kinds };
  }
}
