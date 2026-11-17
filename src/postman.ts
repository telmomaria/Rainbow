import * as THREE from 'three';
import { tone } from './audio';
import type { GameCtx } from './gamectx';
import { registerItem } from './items';
import { inNoSpawn, isFree, randomFreeSpot } from './spawn';
import { ball, box, buildFolk, mat, pick, HAIRS, SKINS, type Folk } from './venue';
import { mulberry32, onRoad, PERSON_CLEAR, type Interactable, type Obstacle, type World } from './world';

/** Paris = index 4 — carteiro a partir da 5.ª cidade. */
export const POSTMAN_FROM_CITY = 4;

const SPEED = 1.55;
const BODY_R = 0.45;
const NEAR = 2.8;
const FORGET = 8;
const CLEAR = 2.2;
/** Anti-spam entre falas (s). */
const SPEAK_COOL = 7;
const LETTER_KIND = 'postal';

const NOTES = [
  'Diz a carta: Continua a explorar — és muito especial!',
  'Diz a carta: Um abraço grande de alguém que gosta de ti!',
  'Diz a carta: Hoje é um dia para descobrir coisas novas!',
  'Diz a carta: Guarda este postal e lembra-te de sorrir!',
];

registerItem(LETTER_KIND, {
  name: 'postal',
  icon: '✉️',
  edible: false,
  build: buildPostcard,
});

/**
 * Carteiro low-poly (uniforme azul, saco, chapéu): anda pelo passeio (nunca na estrada),
 * para perto dela e entrega um postal + 1–2 moedas (uma vez por cidade/dia).
 */
export class Postman {
  readonly things: Interactable[] = [];
  private readonly root: THREE.Group | null = null;
  private folk: Folk | null = null;
  private bag: THREE.Object3D | null = null;
  private target: THREE.Vector3 | null = null;
  private wait = 0.6;
  private step = 0;
  private time = 0;
  private greeted = false;
  private waveT = 0;
  private speakCool = 0;
  private alive = false;
  private readonly cityKey: string;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    world: World,
    seed: number,
    cityName: string,
    avoid: THREE.Vector3,
    private readonly ctx: GameCtx,
  ) {
    this.cityKey = cityName;
    const rng = mulberry32(seed * 307 + 11);
    const { folk, bag } = buildPostman(rng);
    this.folk = folk;
    this.bag = bag;
    this.root = folk.group;

    const at = this.pavementSpot(new THREE.Vector3(), 75, avoid) ?? new THREE.Vector3(10, 0, -12);
    const pad: Obstacle = {
      minX: at.x - CLEAR,
      maxX: at.x + CLEAR,
      minZ: at.z - CLEAR,
      maxZ: at.z + CLEAR,
    };
    world.clearArea(pad, 1.2);

    folk.group.position.copy(at);
    folk.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(folk.group);
    this.alive = true;

    const self = this;
    this.things.push({
      object: folk.group,
      get position() {
        return folk.group.position;
      },
      radius: 2.2,
      keepClear: PERSON_CLEAR,
      interact: () => self.deliver(),
      update: (dt) => self.tickAnim(dt),
    });
  }

  private pavementSpot(center: THREE.Vector3, range: number, avoid?: THREE.Vector3): THREE.Vector3 | null {
    for (let i = 0; i < 16; i++) {
      const p = randomFreeSpot(this.obstacles, {
        center,
        range,
        radius: 0.95,
        avoid,
        minDist: avoid ? 12 : 0,
      });
      if (!onRoad(p.x, p.z, 1.1) && !inNoSpawn(p.x, p.z, 1)) return p;
    }
    return null;
  }

  private dayFlag(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    return `postman:${this.cityKey}:${ymd}`;
  }

  private alreadyDelivered(): boolean {
    return this.ctx.flag(this.dayFlag()) > 0;
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive || !this.folk) return;
    this.time += dt;
    if (this.speakCool > 0) this.speakCool = Math.max(0, this.speakCool - dt);
    if (this.waveT > 0) this.waveT = Math.max(0, this.waveT - dt);

    const g = this.folk.group;
    const d = Math.hypot(player.x - g.position.x, player.z - g.position.z);

    if (!paused && d < NEAR && !this.greeted) {
      this.greeted = true;
      this.wait = 2.6;
      this.target = null;
      this.waveT = 1.4;
    }
    if (d > FORGET) this.greeted = false;

    let walking = false;
    if (!paused && !this.ctx.isDriving()) {
      if (this.wait > 0) {
        this.wait -= dt;
        if (d < NEAR + 1.2) turnTo(g, player.x - g.position.x, player.z - g.position.z, dt * 5);
      } else walking = this.walk(dt);
    }

    this.step = walking ? this.step + dt * 9 : this.step * 0.9;
    this.applyWalkPose(walking, d < NEAR + 0.8);
  }

  private tickAnim(_dt: number): void {
    // walk / wave driven from update(); keep Interactable.update as a no-op hook
  }

  private walk(dt: number): boolean {
    if (!this.folk) return false;
    const g = this.folk.group;
    if (!this.target) {
      const t = this.pavementSpot(g.position, 26);
      if (!t || t.distanceTo(g.position) < 2.5) {
        this.wait = 0.5 + Math.random() * 1.1;
        return false;
      }
      this.target = t;
    }
    const dx = this.target.x - g.position.x;
    const dz = this.target.z - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      this.target = null;
      this.wait = 0.7 + Math.random() * 1.3;
      return false;
    }
    const s = Math.min(SPEED * dt, dist);
    const nx = g.position.x + (dx / dist) * s;
    const nz = g.position.z + (dz / dist) * s;
    const leavesPavement = onRoad(nx, nz, 0.45) && !onRoad(g.position.x, g.position.z, 0.45);
    if (!isFree(nx, nz, BODY_R, this.obstacles) || leavesPavement || inNoSpawn(nx, nz, BODY_R)) {
      this.target = null;
      this.wait = 0.25;
      return false;
    }
    g.position.x = nx;
    g.position.z = nz;
    turnTo(g, dx, dz, dt * 7);
    return true;
  }

  private applyWalkPose(walking: boolean, near: boolean): void {
    if (!this.folk) return;
    const f = this.folk;
    const swing = walking ? Math.sin(this.step) : 0;
    f.legL.rotation.x = swing * 0.55;
    f.legR.rotation.x = -swing * 0.55;
    f.armL.rotation.x = -swing * 0.35;
    // right arm holds the mail bag
    f.armR.rotation.set(-0.55, 0.1, -0.35);
    f.body.position.y = walking ? Math.abs(Math.sin(this.step)) * 0.03 : 0;
    f.head.rotation.y = near ? Math.sin(this.time * 2) * 0.08 : Math.sin(this.time * 0.6) * 0.1;
    if (this.waveT > 0) {
      f.armL.rotation.z = 0.55 + Math.sin((1.4 - this.waveT) * 12) * 0.4;
      f.armL.rotation.x = -0.4;
    } else if (!walking) {
      f.armL.rotation.z = 0.08;
      f.armL.rotation.x = -0.1;
    }
    if (this.bag) this.bag.rotation.z = walking ? Math.sin(this.step) * 0.08 : Math.sin(this.time * 1.2) * 0.04;
  }

  private deliver(): void {
    if (!this.alive || this.ctx.isPaused() || this.ctx.isDriving()) return;
    if (this.speakCool > 0) return;
    this.speakCool = SPEAK_COOL;
    this.wait = 2.8;
    this.target = null;
    this.waveT = 1.6;

    if (this.alreadyDelivered()) {
      this.ctx.say(['Hoje já não há mais cartas.', 'Até amanhã!']);
      tone(330, 0, 0.1, 'sine', 0.05);
      return;
    }

    this.ctx.setFlag(this.dayFlag(), 1);
    const coins = 1 + (Math.random() < 0.45 ? 1 : 0);
    this.ctx.addCoins(coins);
    this.ctx.give(LETTER_KIND);
    tone(880, 0, 0.08, 'square', 0.06);
    tone(1175, 0.09, 0.12, 'triangle', 0.07);
    const note = NOTES[Math.floor(Math.random() * NOTES.length)];
    this.ctx.say(['Olá! Tenho uma carta para ti!', note]);
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.root?.parent?.remove(this.root);
    this.folk = null;
    this.bag = null;
    this.things.length = 0;
  }

  debug(): Record<string, unknown> {
    if (!this.alive || !this.folk) {
      return { on: false, from: POSTMAN_FROM_CITY, at: null, delivered: false };
    }
    const p = this.folk.group.position;
    return {
      on: true,
      from: POSTMAN_FROM_CITY,
      at: [+p.x.toFixed(1), +p.z.toFixed(1)],
      delivered: this.alreadyDelivered(),
      city: this.cityKey,
    };
  }
}

function buildPostman(rng: () => number): { folk: Folk; bag: THREE.Object3D } {
  const folk = buildFolk({
    shirt: 0x1c7ed6,
    pants: 0x1864ab,
    skin: pick(rng, SKINS),
    hair: pick(rng, HAIRS),
    cap: 0x1c7ed6,
  });
  // peaked cap brim + badge
  box(folk.head, mat(0x1864ab), 0.42, 0.05, 0.32, 0, 0.16, -0.28);
  ball(folk.head, mat(0xffd43b), 0.04, 0, 0.26, -0.22);

  // mail satchel on the right hip
  const bag = new THREE.Group();
  bag.position.set(0.38, 1.05, 0.05);
  bag.rotation.z = -0.25;
  box(bag, mat(0x5c3d2e), 0.38, 0.32, 0.18, 0, 0, 0);
  box(bag, mat(0x8b6914), 0.34, 0.04, 0.16, 0, 0.14, 0.02); // flap
  // a couple of letters peeking out
  box(bag, mat(0xfff9db), 0.18, 0.02, 0.12, -0.05, 0.2, -0.02);
  box(bag, mat(0xffe8a3), 0.14, 0.02, 0.1, 0.08, 0.18, 0.01);
  // strap
  box(bag, mat(0x5c3d2e), 0.06, 0.55, 0.03, -0.05, 0.4, 0);
  folk.body.add(bag);

  return { folk, bag };
}

function buildPostcard(): THREE.Group {
  const g = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.02, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xfff4cc, roughness: 0.85 }),
  );
  card.position.y = 0.12;
  g.add(card);
  const stamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.005, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xe03131 }),
  );
  stamp.position.set(0.08, 0.135, -0.05);
  g.add(stamp);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.004, 0.015),
    new THREE.MeshStandardMaterial({ color: 0x1c7ed6 }),
  );
  stripe.position.set(-0.02, 0.132, 0.04);
  g.add(stripe);
  return g;
}

function turnTo(g: THREE.Object3D, dx: number, dz: number, k: number): void {
  const target = Math.atan2(dx, dz) + Math.PI;
  let diff = target - g.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  g.rotation.y += diff * Math.min(1, k);
}

export function noPostman(): Postman {
  return {
    things: [],
    update() {},
    dispose() {},
    debug: () => ({ on: false, from: POSTMAN_FROM_CITY, at: null, delivered: false }),
  } as unknown as Postman;
}

export function createPostman(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  seed: number,
  cityIndex: number,
  cityName: string,
  avoid: THREE.Vector3,
  ctx: GameCtx,
): Postman {
  if (cityIndex < POSTMAN_FROM_CITY) return noPostman();
  return new Postman(scene, obstacles, world, seed, cityName, avoid, ctx);
}
