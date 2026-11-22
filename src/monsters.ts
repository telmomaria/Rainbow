import * as THREE from 'three';
import { isFree, randomFreeSpot } from './spawn';
import type { Obstacle } from './world';

const RADIUS = 0.6;
const HIT_DIST = 1.15;
const SEE_DIST = 14;
const WANDER_SPEED = 1.8;
export const CHASE_SPEED = 4.6; // slower than the character (6.5) so she can always run away
/** Martians: she walks slower on the Moon (3.5 m/s, in big hops — main.ts MOON_WALK_SPEED), so they are slower too. */
export const MARTIAN_CHASE_SPEED = 2.6;
const MAX_MONSTERS = 8; // before the difficulty factor (hard doubles it)

const TAUNTS = [
  'Essas moedas são minhas!',
  'Uuuh! Vou apanhar-te!',
  'Não me escapas!',
  'Dá-me uma moeda!',
  'Eh eh eh eh!',
  'Hoje estou mesmo mau!',
];
const HIT_TAUNTS = ['Ah ah! Apanhei-te!', 'Toma lá!', 'Ui, que moedinhas tão boas!'];
const MARTIAN_TAUNTS = [
  'Blip blop! As moedas!',
  'Marciano quer brilhar!',
  'Não fujas, terráqueo!',
  'Ziip! Moedinhas!',
];
const MARTIAN_HITS = ['Blip! Apanhei-te!', 'Toma, terráqueo!', 'Ziip ziip!'];

/** How many creatures roam, given the coins the character carries: few at first, more as she gets richer. */
export function monstersFor(coins: number): number {
  return Math.min(MAX_MONSTERS, 1 + Math.floor(coins / 15));
}

type State = 'wander' | 'chase' | 'retreat';

interface Monster {
  group: THREE.Group;
  body: THREE.Mesh;
  state: State;
  stateTime: number;
  wanderTo: THREE.Vector3;
  phase: number;
  /** 0..1 while appearing / disappearing */
  scale: number;
  leaving: boolean;
}

export interface MonsterEvents {
  /** A creature reached the character (position of the creature, for knockback direction). */
  hit: THREE.Vector3 | null;
  /** Something a creature says, if any this frame. */
  say: string | null;
}

const COLORS = [0x8e44ad, 0x27ae60, 0x2c3e50, 0xc0392b, 0x16a085];

export interface MonsterOpts {
  /** Moon look + taunts (LUA4). */
  martian?: boolean;
  /** Keep feet on uneven ground (Moon hills). */
  heightAt?: (x: number, z: number) => number;
  /** Places they must not enter (deep craters — LUA6). */
  blocked?: (x: number, z: number) => boolean;
}

export class Monsters {
  private readonly list: Monster[] = [];
  private tauntCooldown = 3;
  /** Settings difficulty: 0.5 = easy (half the creatures), 1 = medium, 2 = hard (double). */
  difficulty = 1;
  /** Jewel shield (jewels.ts): while true the creatures run away from her shine and can't take coins. */
  scared = false;
  /** The same creature may take coins at most twice in a row. */
  private lastHitter: Monster | null = null;
  private streak = 0;
  private readonly martian: boolean;
  private readonly heightAt?: (x: number, z: number) => number;
  private readonly blocked?: (x: number, z: number) => boolean;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    opts: MonsterOpts = {},
  ) {
    this.martian = !!opts.martian;
    this.heightAt = opts.heightAt;
    this.blocked = opts.blocked;
  }

  get count(): number {
    return this.list.filter((m) => !m.leaving).length;
  }

  /** Positions (debug/QA). */
  positions(): { x: number; z: number; state: State }[] {
    return this.list.map((m) => ({ x: +m.group.position.x.toFixed(1), z: +m.group.position.z.toFixed(1), state: m.state }));
  }

  update(dt: number, player: THREE.Vector3, coins: number, frozen: boolean): MonsterEvents {
    const ev: MonsterEvents = { hit: null, say: null };
    this.tauntCooldown -= dt;

    // keep the population in line with the coins
    // difficulty 0 = "Zero": no creatures at all; otherwise at least one
    const want = this.difficulty === 0 ? 0 : Math.max(1, Math.round(monstersFor(coins) * this.difficulty));
    if (this.count < want) this.spawn(player);
    else if (this.count > want) {
      // the farthest one wanders off
      const far = this.list
        .filter((m) => !m.leaving)
        .sort((a, b) => b.group.position.distanceTo(player) - a.group.position.distanceTo(player))[0];
      if (far) far.leaving = true;
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const g = m.group;
      m.phase += dt;
      m.stateTime += dt;

      // appear / disappear
      m.scale = THREE.MathUtils.clamp(m.scale + (m.leaving ? -dt : dt) * 2, 0, 1);
      g.scale.setScalar(Math.max(0.01, m.scale));
      if (m.leaving && m.scale <= 0) {
        this.scene.remove(g);
        this.list.splice(i, 1);
        continue;
      }
      if (frozen || m.leaving) continue;

      const dx = player.x - g.position.x;
      const dz = player.z - g.position.z;
      const dist = Math.hypot(dx, dz);

      // jewel shield: anyone who sees her backs off, and keeps backing off while she is near
      // martians see a bit farther on the open mare so the chase is obvious
      const see = this.martian ? SEE_DIST * 1.35 : SEE_DIST;
      if (this.scared && dist < see && (m.state !== 'retreat' || m.stateTime > 2)) this.setState(m, 'retreat');
      if (m.state === 'retreat' && m.stateTime > 3) this.setState(m, 'wander');
      if (m.state === 'wander' && dist < see) {
        this.setState(m, 'chase');
        if (this.tauntCooldown <= 0) {
          const bag = this.martian ? MARTIAN_TAUNTS : TAUNTS;
          ev.say = bag[Math.floor(Math.random() * bag.length)];
          this.tauntCooldown = 7;
        }
      }
      if (m.state === 'chase' && (dist > see * 1.6 || m.stateTime > 12)) this.setState(m, 'wander');

      let vx = 0;
      let vz = 0;
      let speed = 0;
      if (m.state === 'chase') {
        vx = dx / dist;
        vz = dz / dist;
        speed = this.martian ? MARTIAN_CHASE_SPEED : CHASE_SPEED;
      } else if (m.state === 'retreat') {
        vx = -dx / dist;
        vz = -dz / dist;
        speed = WANDER_SPEED * 1.5;
      } else {
        const wx = m.wanderTo.x - g.position.x;
        const wz = m.wanderTo.z - g.position.z;
        const wd = Math.hypot(wx, wz);
        if (wd < 1 || m.stateTime > 8) {
          m.wanderTo = this.freeSpot(g.position, 15);
          m.stateTime = 0;
        } else {
          vx = wx / wd;
          vz = wz / wd;
          speed = WANDER_SPEED;
        }
      }

      if (speed > 0) {
        const nx = g.position.x + vx * speed * dt;
        const nz = g.position.z + vz * speed * dt;
        if (this.canStand(nx, g.position.z)) g.position.x = nx;
        if (this.canStand(g.position.x, nz)) g.position.z = nz;
        g.rotation.y = Math.atan2(-vx, -vz);
      }
      // bouncy walk (feet follow the ground on the Moon)
      const hop = Math.abs(Math.sin(m.phase * (m.state === 'chase' ? 12 : 6)));
      const ground = this.heightAt?.(g.position.x, g.position.z) ?? 0;
      g.position.y = ground;
      m.body.position.y = 0.7 + hop * 0.25;
      m.body.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.08, 1 + (1 - hop) * 0.08);

      // rooftops / stairs: she is above them — they don't climb (I69)
      // (measured from the ground under her: Moon hills, and her low-gravity hops ~1 m, still count as the ground)
      const feetUp = player.y - (this.heightAt?.(player.x, player.z) ?? 0);
      if (m.state === 'chase' && dist < HIT_DIST && !ev.hit && feetUp < 1.5) {
        this.setState(m, 'retreat');
        if (m === this.lastHitter && this.streak >= 2) continue; // third time in a row: it just backs off
        this.streak = m === this.lastHitter ? this.streak + 1 : 1;
        this.lastHitter = m;
        ev.hit = g.position.clone();
        const hits = this.martian ? MARTIAN_HITS : HIT_TAUNTS;
        ev.say = hits[Math.floor(Math.random() * hits.length)];
        this.tauntCooldown = 5;
      }
    }
    return ev;
  }

  private canStand(x: number, z: number): boolean {
    if (!isFree(x, z, RADIUS, this.obstacles)) return false;
    if (this.blocked?.(x, z)) return false;
    return true;
  }

  private freeSpot(center: THREE.Vector3, range: number): THREE.Vector3 {
    for (let i = 0; i < 12; i++) {
      const p = randomFreeSpot(this.obstacles, { center, range, radius: RADIUS });
      if (!this.blocked?.(p.x, p.z)) return p;
    }
    return center.clone();
  }

  private setState(m: Monster, s: State): void {
    m.state = s;
    m.stateTime = 0;
  }

  private spawn(player: THREE.Vector3): void {
    // on the open mare, spawn nearer so the green chase is easy to notice
    const near = this.martian ? 14 : 25;
    const range = this.martian ? 30 : 60; // the Moon is ±60 m since 2026-11-21
    let p = randomFreeSpot(this.obstacles, { center: player, range, radius: RADIUS, avoid: player, minDist: near });
    for (let i = 0; i < 10 && this.blocked?.(p.x, p.z); i++) {
      p = randomFreeSpot(this.obstacles, { center: player, range, radius: RADIUS, avoid: player, minDist: Math.max(10, near - 5) });
    }
    if (this.blocked?.(p.x, p.z)) return;
    const { group, body } = this.martian ? buildMartian() : buildMonster();
    group.position.copy(p);
    group.position.y = this.heightAt?.(p.x, p.z) ?? 0;
    group.scale.setScalar(0.01);
    this.scene.add(group);
    this.list.push({ group, body, state: 'wander', stateTime: 0, wanderTo: p.clone(), phase: Math.random() * 10, scale: 0, leaving: false });
  }
}

function buildMonster(): { group: THREE.Group; body: THREE.Mesh } {
  const group = new THREE.Group();
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 20, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const horn = new THREE.MeshStandardMaterial({ color: 0xffe082 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), white);
    eye.position.set(side * 0.22, 0.15, -0.48);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), black);
    pupil.position.set(0, 0, -0.12);
    eye.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), black);
    brow.position.set(side * 0.22, 0.36, -0.52);
    brow.rotation.z = side * -0.45;
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 10), horn);
    h.position.set(side * 0.3, 0.6, -0.05);
    h.rotation.z = side * -0.35;
    body.add(eye, brow, h);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI), black);
  mouth.position.set(0, -0.12, -0.55);
  body.add(mouth);
  return { group, body };
}

/** Friendly green martian: antennae, big eyes, three fingers — same chase rules as the city creatures. */
function buildMartian(): { group: THREE.Group; body: THREE.Mesh } {
  const group = new THREE.Group();
  // everything hangs off `body` so the hop animation in update() keeps the silhouette together
  const skin = new THREE.MeshStandardMaterial({ color: 0x40c057, roughness: 0.5, emissive: 0x2b8a3e, emissiveIntensity: 0.28 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14), skin);
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), skin);
  head.scale.set(1.05, 1.2, 0.95);
  head.position.y = 0.78;
  head.castShadow = true;
  body.add(head);

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), white);
    eye.position.set(side * 0.2, 0.06, -0.38);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), black);
    pupil.position.set(0, 0, -0.14);
    eye.add(pupil);
    head.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), skin);
    ant.position.set(side * 0.22, 0.62, 0);
    ant.rotation.z = side * -0.4;
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6b9d, emissive: 0xff6b9d, emissiveIntensity: 0.7 }),
    );
    tip.position.y = 0.32;
    ant.add(tip);
    head.add(ant);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI), black);
  smile.position.set(0, -0.14, -0.4);
  smile.rotation.x = Math.PI;
  head.add(smile);

  // stubby arms that reach forward while chasing (readable silhouette)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.55, 8), skin);
    arm.position.set(side * 0.55, 0.05, -0.15);
    arm.rotation.z = side * 0.85;
    arm.rotation.x = -0.6;
    arm.castShadow = true;
    body.add(arm);
    const hand = new THREE.Group();
    hand.position.set(0, -0.32, 0);
    arm.add(hand);
    for (let f = 0; f < 3; f++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.18, 5), skin);
      finger.position.set((f - 1) * 0.07, -0.08, 0);
      finger.rotation.x = 0.4;
      hand.add(finger);
    }
  }

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), skin);
    leg.position.set(side * 0.26, -0.55, 0.05);
    leg.castShadow = true;
    body.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), skin);
    foot.scale.set(1.1, 0.55, 1.3);
    foot.position.set(0, -0.28, -0.05);
    leg.add(foot);
  }
  return { group, body };
}
