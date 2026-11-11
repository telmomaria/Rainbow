import * as THREE from 'three';
import { nextQuestion, type Question } from './questions';
import { randomFreeSpot } from './spawn';
import type { Obstacle } from './world';

const MEET_RADIUS = 1.6;
const MAX_NPCS = 5;
const RESPAWN_DELAY = 12; // seconds after one leaves

/** A friendly character standing somewhere in the world, holding one question. */
export interface QuestionNpc {
  group: THREE.Group;
  question: Question;
  /** fade-out progress once its question has been asked; null while waiting */
  leaving: number | null;
}

const OUTFITS = [0x4dabf7, 0xff922b, 0x51cf66, 0xcc5de8, 0xffd43b, 0x20c997];
const HATS = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00];

/** Spawns question-givers, detects when the player walks up to one. */
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
  ) {
    for (let i = 0; i < MAX_NPCS; i++) this.spawn(player, 8);
  }

  private spawn(player: THREE.Vector3, minDist: number): void {
    const q = nextQuestion(this.available, this.reserved);
    if (!q) return; // nothing available right now (all solved or cooling down) - retried by the timer
    this.reserved.add(q.id);
    const p = randomFreeSpot(this.obstacles, { radius: 1.2, avoid: player, minDist, range: 60 });
    const group = buildNpc();
    group.position.copy(p);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);
    this.list.push({ group, question: q, leaving: null });
  }

  /** Returns the NPC the player just bumped into (if any). */
  update(dt: number, player: THREE.Vector3): QuestionNpc | null {
    this.time += dt;
    let met: QuestionNpc | null = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const g = n.group;
      if (n.leaving !== null) {
        n.leaving += dt;
        g.position.y = n.leaving * 3; // floats away
        g.scale.setScalar(Math.max(0.01, 1 - n.leaving));
        if (n.leaving >= 1) {
          this.scene.remove(g);
          this.list.splice(i, 1);
        }
        continue;
      }
      // idle: little hop + wave, turning towards the player when near
      const d = Math.hypot(g.position.x - player.x, g.position.z - player.z);
      const arm = g.getObjectByName('arm');
      if (arm) arm.rotation.z = 2.4 + Math.sin(this.time * 6 + i) * 0.4 * (d < 12 ? 1 : 0.2);
      if (d < 12) {
        const target = Math.atan2(player.x - g.position.x, player.z - g.position.z) + Math.PI;
        let diff = target - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * Math.min(1, dt * 4);
      }
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

  /** The question was asked (right or wrong): this NPC leaves; the save decides if it comes back. */
  dismiss(n: QuestionNpc): void {
    n.leaving = 0;
    this.reserved.delete(n.question.id);
  }
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
  for (const m of [body, head, hat, eyeL, eyeR, armMesh]) m.castShadow = true;
  g.add(body, head, hat, eyeL, eyeR, arm);
  return g;
}
