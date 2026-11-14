import * as THREE from 'three';
import { tone } from './audio';
import { isFree } from './spawn';
import { AIRPORT_ZONE } from './airport';
import { SPAWN, onRoad, type Interactable, type Obstacle } from './world';

const BRANCH_Y = 4.6;
/** Coins for rescuing the kitten. */
export const CAT_REWARD = 5;

/** A meow made of two quick pitch slides. */
function meow(gain = 0.07): void {
  tone(700, 0, 0.12, 'triangle', gain);
  tone(950, 0.08, 0.16, 'triangle', gain);
  tone(620, 0.22, 0.22, 'triangle', gain * 0.8);
}

/**
 * A kitten stuck on a branch of a tall tree, meowing. Walk into the trunk: the character climbs up,
 * takes the kitten, climbs down with it, puts it on the ground; the kitten purrs, rubs against her
 * legs (hearts), she gets a few coins, and the kitten trots off. Once per city.
 * Everything is shown by movement — no text or UI.
 */
export class CatTree {
  readonly interactable: Interactable;
  readonly group = new THREE.Group();
  /** True while the rescue is playing (the game freezes normal control). */
  active = false;
  private rescued = false;
  private t = 0;
  private meowTimer = 2;
  private readonly cat: THREE.Group;
  private readonly tail: THREE.Object3D;
  private readonly trunkPos: THREE.Vector3;
  private readonly branchCatPos: THREE.Vector3;
  private rider: THREE.Object3D | null = null;
  private start = new THREE.Vector3();
  private readonly hearts: THREE.Mesh[] = [];
  private onReward: (() => void) | null = null;
  private playerRef: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number) {
    // spot: 45–110 m from spawn, off the roads, not in the airport, clear of buildings
    // (4.5 m from the trunk centre = ~4 m of walking room around it; relaxed to 3 m only on a crowded map)
    let at = new THREE.Vector3(-60, 0, -45);
    for (let i = 0; i < 600; i++) {
      const a = rng() * Math.PI * 2;
      const r = 45 + rng() * 65;
      const x = SPAWN.x + Math.cos(a) * r;
      const z = SPAWN.z + Math.sin(a) * r;
      const z0 = AIRPORT_ZONE;
      if (Math.abs(x) > 140 || Math.abs(z) > 140) continue;
      if (onRoad(x, z, 4)) continue;
      if (x > z0.minX - 6 && x < z0.maxX + 6 && z > z0.minZ - 6 && z < z0.maxZ + 6) continue;
      if (!isFree(x, z, i < 300 ? 4.5 : 3, obstacles)) continue;
      at = new THREE.Vector3(x, 0, z);
      break;
    }
    this.group.position.copy(at);
    scene.add(this.group);
    this.trunkPos = at.clone();

    const bark = new THREE.MeshStandardMaterial({ color: 0x7a5233, roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3fae4a, roughness: 0.8 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 6.5, 12), bark);
    trunk.position.y = 3.25;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 8), bark);
    branch.rotation.z = Math.PI / 2 - 0.15;
    branch.position.set(1.2, BRANCH_Y - 0.2, 0);
    this.group.add(trunk, branch);
    for (const [x, y, z, s] of [[0, 7, 0, 2.6], [1.6, 6.3, 0.6, 1.8], [-1.4, 6.1, -0.5, 1.9], [0.4, 6.0, -1.5, 1.7], [-0.6, 6.5, 1.4, 1.7]] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaf);
      crown.position.set(x, y, z);
      this.group.add(crown);
    }
    // a few rungs nailed to the trunk make the climb believable
    for (let i = 0; i < 5; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), bark);
      rung.position.set(0, 0.8 + i * 0.85, -0.45);
      this.group.add(rung);
    }
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    obstacles.push({ minX: at.x - 0.5, maxX: at.x + 0.5, minZ: at.z - 0.5, maxZ: at.z + 0.5 });

    const { cat, tail } = buildKitten();
    this.cat = cat;
    this.tail = tail;
    this.branchCatPos = at.clone().add(new THREE.Vector3(1.5, BRANCH_Y, 0));
    this.cat.position.copy(this.branchCatPos);
    scene.add(this.cat);

    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, -0.2);
    heartShape.bezierCurveTo(-0.36, 0.04, -0.16, 0.28, 0, 0.12);
    heartShape.bezierCurveTo(0.16, 0.28, 0.36, 0.04, 0, -0.2);
    const hg = new THREE.ShapeGeometry(heartShape);
    for (let i = 0; i < 5; i++) {
      const h = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0xff5c9a, transparent: true, side: THREE.DoubleSide }));
      h.visible = false;
      scene.add(h);
      this.hearts.push(h);
    }

    this.interactable = {
      object: this.group,
      position: at.clone(),
      radius: 1.6,
      interact: (ctx) => {
        this.playerRef = ctx.player;
      },
    };
  }

  /** Can a rescue start now (she touched the trunk and the kitten is still up there)? */
  get waiting(): boolean {
    return !this.rescued && !this.active;
  }

  /** Begin the climb. `rider` = character root (moved directly), `reward` called when the kitten is safe. */
  begin(rider: THREE.Object3D, reward: () => void): void {
    if (!this.waiting) return;
    this.active = true;
    this.t = 0;
    this.rider = rider;
    this.start.copy(rider.position);
    this.onReward = reward;
    meow(0.09);
  }

  /** Heading the character should face during the climb (towards the trunk). */
  get climbHeading(): number {
    return 0; // the rungs are on the trunk's -Z side: she stands at -Z facing +Z... see begin positions
  }

  update(dt: number, player?: THREE.Vector3): void {
    if (player) this.playerRef = player;
    this.t += this.active ? dt : 0;
    // idle: kitten on the branch, meowing (louder when someone is near), tail swishing
    const time = performance.now() / 1000;
    this.tail.rotation.z = Math.sin(time * 4) * 0.5;
    if (!this.active && !this.rescued) {
      this.meowTimer -= dt;
      const near = this.playerRef ? this.playerRef.distanceTo(this.trunkPos) < 25 : false;
      if (this.meowTimer <= 0) {
        this.meowTimer = near ? 2.5 + Math.random() * 1.5 : 5 + Math.random() * 3;
        if (near) meow(0.08);
        this.cat.position.y = this.branchCatPos.y + 0.12; // little startled hop
      }
      this.cat.position.y += (this.branchCatPos.y - this.cat.position.y) * Math.min(1, dt * 8);
      this.cat.rotation.y = Math.sin(time * 0.7) * 0.6;
    }
    if (this.active && this.rider) this.runRescue();
    // hearts float up
    for (const h of this.hearts) {
      if (!h.visible) continue;
      h.position.y += dt * 0.9;
      const m = h.material as THREE.MeshBasicMaterial;
      m.opacity -= dt * 0.45;
      if (m.opacity <= 0) h.visible = false;
    }
  }

  private runRescue(): void {
    const r = this.rider!;
    const t = this.t;
    const base = this.trunkPos.clone().add(new THREE.Vector3(0, 0, -0.95)); // in front of the rungs
    const top = base.clone().setY(BRANCH_Y - 2.0); // feet level when her hands reach the branch
    const lerp = THREE.MathUtils.lerp;
    const s = (k: number) => Math.min(1, Math.max(0, k));
    if (t < 0.7) {
      // step to the trunk
      r.position.lerpVectors(this.start, base, s(t / 0.7));
    } else if (t < 2.6) {
      // climb up (little wobble)
      const k = s((t - 0.7) / 1.9);
      r.position.set(base.x + Math.sin(t * 14) * 0.04, lerp(0, top.y, k), base.z);
    } else if (t < 3.3) {
      // the kitten hops into her arms
      const k = s((t - 2.6) / 0.7);
      const arms = r.position.clone().add(new THREE.Vector3(0, 1.3, 0.35));
      this.cat.position.lerpVectors(this.branchCatPos, arms, k);
      this.cat.position.y += Math.sin(k * Math.PI) * 0.5;
      if (t - 0 > 2.6 && t < 2.65) meow(0.09);
    } else if (t < 5.1) {
      // climb down holding the kitten
      const k = s((t - 3.3) / 1.8);
      r.position.set(base.x + Math.sin(t * 14) * 0.04, lerp(top.y, 0, k), base.z);
      this.cat.position.copy(r.position).add(new THREE.Vector3(0, 1.3, 0.35));
    } else if (t < 5.8) {
      // put it down beside her
      const k = s((t - 5.1) / 0.7);
      const ground = base.clone().add(new THREE.Vector3(0.9, 0, -0.6));
      this.cat.position.lerpVectors(r.position.clone().add(new THREE.Vector3(0, 1.3, 0.35)), ground, k);
      this.cat.rotation.y = Math.PI;
    } else if (t < 8.5) {
      // purr + rub against her legs, hearts, reward once
      if (!this.rescued) {
        this.rescued = true;
        this.onReward?.();
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.22, 'triangle', 0.07));
        this.hearts.forEach((h, i) => {
          h.visible = true;
          h.position.copy(base).add(new THREE.Vector3((i - 2) * 0.3, 1.2 + i * 0.1, -0.4));
          (h.material as THREE.MeshBasicMaterial).opacity = 1;
        });
      }
      const wob = Math.sin((t - 5.8) * 6);
      this.cat.position.copy(base).add(new THREE.Vector3(0.6 + wob * 0.25, 0, -0.7));
      this.cat.rotation.y = Math.PI + wob * 0.4;
      if (Math.floor(t * 4) !== Math.floor((t - 1 / 60) * 4)) tone(90 + Math.random() * 20, 0, 0.2, 'sine', 0.03); // purr
    } else if (t < 11) {
      // trot away happily; she's free to go from here
      this.active = false;
      const k = s((t - 8.5) / 2.5);
      const from = base.clone().add(new THREE.Vector3(0.6, 0, -0.7));
      this.cat.position.lerpVectors(from, from.clone().add(new THREE.Vector3(6, 0, -6)), k);
      this.cat.position.y = Math.abs(Math.sin(k * 30)) * 0.08;
      this.cat.rotation.y = Math.PI * 0.75;
    }
    if (t >= 8.5) {
      this.active = false;
      this.rider = null;
      this.cat.position.copy(base).add(new THREE.Vector3(0.6, 0, -0.7));
      this.trotAway = 0;
    }
  }

  /** After the rescue the kitten trots off (advanced by the game while not active). */
  private trotAway = -1;

  /** Keep the kitten trotting away after control returns to the player. */
  idleAfter(dt: number): void {
    if (this.trotAway < 0) return;
    this.trotAway += dt;
    const k = Math.min(1, this.trotAway / 2.5);
    const from = this.trunkPos.clone().add(new THREE.Vector3(0.6, 0, -1.65));
    this.cat.position.lerpVectors(from, from.clone().add(new THREE.Vector3(6, 0, -6)), k);
    this.cat.position.y = Math.abs(Math.sin(k * 30)) * 0.08;
    this.cat.rotation.y = Math.PI * 0.75;
    if (k >= 1) this.trotAway = -1;
  }
}

function buildKitten(): { cat: THREE.Group; tail: THREE.Object3D } {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), fur);
  body.scale.set(0.9, 0.8, 1.3);
  body.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), fur);
  head.position.set(0, 0.52, -0.32);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), white);
  muzzle.position.set(0, 0.47, -0.49);
  g.add(body, head, muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 8), fur);
    ear.position.set(s * 0.11, 0.7, -0.3);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    eye.position.set(s * 0.08, 0.56, -0.5);
    g.add(ear, eye);
    for (const z of [-0.18, 0.2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6), fur);
      leg.position.set(s * 0.13, 0.11, z);
      g.add(leg);
    }
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.38, 0.33);
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.45, 6), fur);
  tailMesh.position.y = 0.2;
  tailMesh.rotation.x = 0.3;
  tail.add(tailMesh);
  g.add(tail);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { cat: g, tail };
}
