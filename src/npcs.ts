import * as THREE from 'three';
import { entersRunway, onRunway } from './airport';
import { nextQuestion, type Question } from './questions';
import { inNoSpawn, randomFreeSpot } from './spawn';
import { PERSON_BODY_HALF, PERSON_CLEAR, onRoad, type Obstacle } from './world';

/** Meet when she is within this (must be > PERSON_CLEAR so click-to-walk still triggers the question). */
const MEET_RADIUS = PERSON_CLEAR + 0.35;
const MAX_NPCS = 5;
const RESPAWN_DELAY = 12; // seconds after one leaves
// Nobody stands around in the street: every question-giver strolls, and only stops to wait for her when she is near.
const WALK_SPEED = 1.3; // m/s — a slow stroll, easy to catch up with (she walks at 6.5)
const WANDER_RANGE = 14; // they stay this close to where they appeared
/** A walker stops and turns to the child when she comes this close. */
const STOP_DIST = 8;
const BODY_R = 0.6;
/** Minimum distance between two question NPCs at spawn. */
const NPC_MIN_DIST = 3;

/** A friendly character somewhere in the world, holding one question. */
export interface QuestionNpc {
  group: THREE.Group;
  question: Question;
  /** fade-out progress once its question has been asked; null while waiting */
  leaving: number | null;
  home: THREE.Vector3;
  target: THREE.Vector3 | null;
  /** seconds to pause before picking the next stroll target */
  wait: number;
  /** leg-swing phase */
  step: number;
  /** seconds of happy hopping left (she was given a present — src/gifts.ts) */
  cheer?: number;
  /** Live solid body in `obstacles` — updated as they stroll so she cannot walk through them. */
  body: Obstacle;
}

const OUTFITS = [0x4dabf7, 0xff922b, 0x51cf66, 0xcc5de8, 0xffd43b, 0x20c997];
const HATS = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00];
const PANTS = [0x364fc7, 0x5c3d2e, 0x495057, 0x862e9c];

/** Spawns question-givers, keeps them strolling, detects when the player walks up to one. */
export class Npcs {
  readonly list: QuestionNpc[] = [];
  private readonly reserved = new Set<string>();
  private spawnTimer = 0;
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    private readonly available: (id: string) => boolean,
    player: THREE.Vector3,
    /** solved questions that may come back as a review when nothing else is left */
    private readonly recyclable: (id: string) => boolean = () => false,
    /** current city name: its own questions (Question.city) are only asked here */
    private readonly city?: string,
  ) {
    for (let i = 0; i < MAX_NPCS; i++) this.spawn(player, 8);
  }

  private spawn(player: THREE.Vector3, minDist: number): void {
    const q = nextQuestion(this.available, this.reserved, this.recyclable, this.city);
    if (!q) return; // nothing available right now (all solved or cooling down) - retried by the timer
    this.reserved.add(q.id);
    let p = randomFreeSpot(this.obstacles, { radius: 1.2, avoid: player, minDist, range: 60 });
    for (let tries = 0; tries < 40; tries++) {
      const farEnough = this.list.every((n) => Math.hypot(n.group.position.x - p.x, n.group.position.z - p.z) >= NPC_MIN_DIST);
      if (farEnough && !onRunway(p.x, p.z, 2)) break;
      p = randomFreeSpot(this.obstacles, { radius: 1.2, avoid: player, minDist, range: 60 });
    }
    const group = buildNpc();
    group.position.copy(p);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    const body: Obstacle = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, height: 1.9 };
    const npc: QuestionNpc = {
      group,
      question: q,
      leaving: null,
      home: p.clone(),
      target: null,
      wait: Math.random(),
      step: 0,
      body,
    };
    syncBody(npc);
    this.obstacles.push(body);
    this.list.push(npc);
  }

  /** Returns the NPC the player just bumped into (if any). `paused` freezes the strollers. */
  update(dt: number, player: THREE.Vector3, paused = false): QuestionNpc | null {
    this.time += dt;
    let met: QuestionNpc | null = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const g = n.group;
      if (n.leaving !== null) {
        // walks away normally (waving goodbye at first), and is only removed once far from her / out of sight
        n.leaving += dt;
        if (!paused) {
          const awayX = g.position.x - player.x;
          const awayZ = g.position.z - player.z;
          if (!n.target || n.target.distanceTo(g.position) < 1) {
            const len = Math.hypot(awayX, awayZ) || 1;
            const a = Math.atan2(awayZ / len, awayX / len) + (Math.random() - 0.5) * 1.2;
            n.target = new THREE.Vector3(g.position.x + Math.cos(a) * 25, 0, g.position.z + Math.sin(a) * 25);
          }
          const dx = n.target.x - g.position.x;
          const dz = n.target.z - g.position.z;
          const d = Math.hypot(dx, dz) || 1;
          const step = 1.6 * dt;
          const nx = g.position.x + (dx / d) * step;
          const nz = g.position.z + (dz / d) * step;
          if (
            isFreeIgnoring(nx, nz, BODY_R, this.obstacles, n.body) &&
            !inNoSpawn(nx, nz, BODY_R) &&
            !(onRoad(nx, nz, 0.5) && !onRoad(g.position.x, g.position.z, 0.5)) &&
            !entersRunway(g.position.x, g.position.z, nx, nz)
          ) {
            g.position.x = nx;
            g.position.z = nz;
          } else n.target = null; // blocked: pick another way
          turnTo(g, dx, dz, dt * 6);
          n.step += dt * 7;
          const swing = Math.sin(n.step) * 0.6;
          const legL = g.getObjectByName('legL');
          const legR = g.getObjectByName('legR');
          if (legL) legL.rotation.x = swing;
          if (legR) legR.rotation.x = -swing;
          const arm = g.getObjectByName('arm');
          if (arm) arm.rotation.z = n.leaving < 1.5 ? 2.4 + Math.sin(this.time * 8) * 0.4 : swing * 0.5; // bye-bye
          syncBody(n);
        }
        const far = Math.hypot(g.position.x - player.x, g.position.z - player.z);
        if (far > 45 || n.leaving > 40) {
          this.removeBody(n);
          this.scene.remove(g);
          this.list.splice(i, 1);
        }
        continue;
      }
      const d = Math.hypot(g.position.x - player.x, g.position.z - player.z);
      const walking = !paused && d >= STOP_DIST && this.stroll(n, dt);
      // legs swing while walking, settle when standing
      n.step = walking ? n.step + dt * 7 : 0;
      const swing = walking ? Math.sin(n.step) * 0.6 : 0;
      const legL = g.getObjectByName('legL');
      const legR = g.getObjectByName('legR');
      if (legL) legL.rotation.x += (swing - legL.rotation.x) * Math.min(1, dt * 12);
      if (legR) legR.rotation.x += (-swing - legR.rotation.x) * Math.min(1, dt * 12);
      g.position.y = walking ? Math.abs(Math.sin(n.step)) * 0.06 : 0;
      if (n.cheer) {
        n.cheer = Math.max(0, n.cheer - dt);
        g.position.y = Math.abs(Math.sin(n.cheer * 9)) * 0.35; // happy hops: thank you for the present!
      }
      syncBody(n);
      // idle: wave, turning towards the player when near
      const arm = g.getObjectByName('arm');
      if (arm) arm.rotation.z = walking ? Math.sin(n.step) * 0.3 : 2.4 + Math.sin(this.time * 6 + i) * 0.4 * (d < 12 ? 1 : 0.2);
      if (!walking && d < 12) turnTo(g, player.x - g.position.x, player.z - g.position.z, dt * 4);
      if (!met && d < MEET_RADIUS) met = n;
    }

    const active = this.list.filter((n) => n.leaving === null).length;
    if (active < MAX_NPCS) {
      this.spawnTimer += dt;
      if (this.spawnTimer > RESPAWN_DELAY) {
        this.spawnTimer = 0;
        this.spawn(player, 20);
      }
    }
    return met;
  }

  /** One step of a stroll near home: pick a spot off the road, walk there, stand a bit, repeat. True while moving. */
  private stroll(n: QuestionNpc, dt: number): boolean {
    const g = n.group;
    if (n.wait > 0) {
      n.wait -= dt;
      return false;
    }
    if (!n.target) {
      const t = randomFreeSpot(this.obstacles, { center: n.home, range: WANDER_RANGE, radius: 1 });
      if (onRoad(t.x, t.z, 1) || t.distanceTo(g.position) < 2) {
        n.wait = 0.5; // try again shortly
        return false;
      }
      n.target = t;
    }
    const dx = n.target.x - g.position.x;
    const dz = n.target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      n.target = null;
      n.wait = 0.4 + Math.random() * 0.8; // a short breath, then off again
      return false;
    }
    const s = Math.min(WALK_SPEED * dt, dist);
    const nx = g.position.x + (dx / dist) * s;
    const nz = g.position.z + (dz / dist) * s;
    const leavesPavement = onRoad(nx, nz, 0.5) && !onRoad(g.position.x, g.position.z, 0.5);
    // Skip own body when testing free space (otherwise they never move).
    if (!isFreeIgnoring(nx, nz, BODY_R, this.obstacles, n.body) || leavesPavement || entersRunway(g.position.x, g.position.z, nx, nz) || inNoSpawn(nx, nz, BODY_R)) {
      n.target = null; // blocked (wall, road, concert fence): pick another way straight away
      n.wait = 0.3;
      return false;
    }
    g.position.x = nx;
    g.position.z = nz;
    turnTo(g, dx, dz, dt * 6);
    return true;
  }

  /** The question was asked (right or wrong): this NPC leaves; the save decides if it comes back. */
  dismiss(n: QuestionNpc): void {
    n.leaving = 0;
    n.target = null;
    this.reserved.delete(n.question.id);
  }

  private removeBody(n: QuestionNpc): void {
    const i = this.obstacles.indexOf(n.body);
    if (i >= 0) this.obstacles.splice(i, 1);
  }
}

function syncBody(n: QuestionNpc): void {
  const h = PERSON_BODY_HALF;
  const x = n.group.position.x;
  const z = n.group.position.z;
  n.body.minX = x - h;
  n.body.maxX = x + h;
  n.body.minZ = z - h;
  n.body.maxZ = z + h;
  n.body.height = 1.9;
}

function isFreeIgnoring(x: number, z: number, r: number, obstacles: Obstacle[], ignore: Obstacle): boolean {
  for (const o of obstacles) {
    if (o === ignore) continue;
    if (x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ) return false;
  }
  return true;
}

/** Turn a group (whose face looks at -Z) smoothly towards the direction (dx, dz). */
function turnTo(g: THREE.Object3D, dx: number, dz: number, k: number): void {
  const target = Math.atan2(dx, dz) + Math.PI;
  let diff = target - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  g.rotation.y += diff * Math.min(1, k);
}

function buildNpc(): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c });
  const outfit = OUTFITS[Math.floor(Math.random() * OUTFITS.length)];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.8, 4, 12), mat(outfit));
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), mat(0xf1c27d));
  head.position.y = 1.95;
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.55, 16),
    mat(HATS[Math.floor(Math.random() * HATS.length)]),
  );
  hat.position.y = 2.4;
  const eyeMat = mat(0x222222);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.11, 2.0, -0.28);
  eyeR.position.set(0.11, 2.0, -0.28);
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.set(0.4, 1.4, 0);
  const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 8), mat(outfit));
  armMesh.position.y = -0.3;
  arm.add(armMesh);
  // short legs under the body (they swing when the character strolls)
  const pantsMat = mat(PANTS[Math.floor(Math.random() * PANTS.length)]);
  const legGeo = new THREE.CapsuleGeometry(0.11, 0.3, 4, 8);
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? 'legL' : 'legR';
    pivot.position.set(side * 0.16, 0.5, 0);
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.y = -0.27;
    leg.castShadow = true;
    pivot.add(leg);
    return pivot;
  });
  for (const m of [body, head, hat, eyeL, eyeR, armMesh]) m.castShadow = true;
  g.add(body, head, hat, eyeL, eyeR, arm, ...legs);
  return g;
}
