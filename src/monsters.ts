import * as THREE from 'three';
import { isFree, randomFreeSpot } from './spawn';
import type { Obstacle } from './world';

const RADIUS = 0.6;
const HIT_DIST = 1.15;
const SEE_DIST = 14;
const WANDER_SPEED = 1.8;
const CHASE_SPEED = 4.6; // slower than the character (6.5) so she can always run away
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

export class Monsters {
  private readonly list: Monster[] = [];
  private tauntCooldown = 3;
  /** Settings difficulty: 0.5 = easy (half the creatures), 1 = medium, 2 = hard (double). */
  difficulty = 1;
  /** The same creature may take coins at most twice in a row. */
  private lastHitter: Monster | null = null;
  private streak = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
  ) {}

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

      if (m.state === 'retreat' && m.stateTime > 3) this.setState(m, 'wander');
      if (m.state === 'wander' && dist < SEE_DIST) {
        this.setState(m, 'chase');
        if (this.tauntCooldown <= 0) {
          ev.say = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
          this.tauntCooldown = 7;
        }
      }
      if (m.state === 'chase' && (dist > SEE_DIST * 1.6 || m.stateTime > 12)) this.setState(m, 'wander');

      let vx = 0;
      let vz = 0;
      let speed = 0;
      if (m.state === 'chase') {
        vx = dx / dist;
        vz = dz / dist;
        speed = CHASE_SPEED;
      } else if (m.state === 'retreat') {
        vx = -dx / dist;
        vz = -dz / dist;
        speed = WANDER_SPEED * 1.5;
      } else {
        const wx = m.wanderTo.x - g.position.x;
        const wz = m.wanderTo.z - g.position.z;
        const wd = Math.hypot(wx, wz);
        if (wd < 1 || m.stateTime > 8) {
          m.wanderTo = randomFreeSpot(this.obstacles, { center: g.position, range: 15, radius: RADIUS });
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
        if (isFree(nx, g.position.z, RADIUS, this.obstacles)) g.position.x = nx;
        if (isFree(g.position.x, nz, RADIUS, this.obstacles)) g.position.z = nz;
        g.rotation.y = Math.atan2(-vx, -vz);
      }
      // bouncy walk
      const hop = Math.abs(Math.sin(m.phase * (m.state === 'chase' ? 12 : 6)));
      m.body.position.y = 0.7 + hop * 0.25;
      m.body.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.08, 1 + (1 - hop) * 0.08);

      if (m.state === 'chase' && dist < HIT_DIST && !ev.hit) {
        this.setState(m, 'retreat');
        if (m === this.lastHitter && this.streak >= 2) continue; // third time in a row: it just backs off
        this.streak = m === this.lastHitter ? this.streak + 1 : 1;
        this.lastHitter = m;
        ev.hit = g.position.clone();
        ev.say = HIT_TAUNTS[Math.floor(Math.random() * HIT_TAUNTS.length)];
        this.tauntCooldown = 5;
      }
    }
    return ev;
  }

  private setState(m: Monster, s: State): void {
    m.state = s;
    m.stateTime = 0;
  }

  private spawn(player: THREE.Vector3): void {
    const p = randomFreeSpot(this.obstacles, { center: player, range: 60, radius: RADIUS, avoid: player, minDist: 25 });
    const { group, body } = buildMonster();
    group.position.copy(p);
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
    // angry eyebrow, tilted down towards the middle
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), black);
    brow.position.set(side * 0.22, 0.36, -0.52);
    brow.rotation.z = side * -0.45;
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 10), horn);
    h.position.set(side * 0.3, 0.6, -0.05);
    h.rotation.z = side * -0.35;
    body.add(eye, brow, h);
  }
  // grumpy mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12, Math.PI), black);
  mouth.position.set(0, -0.12, -0.55);
  body.add(mouth);
  return { group, body };
}
