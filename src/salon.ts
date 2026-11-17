import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
import { registerWearable } from './items';
import {
  Flyers,
  box,
  coinMesh,
  cyl,
  mat,
  roadsideSite,
  siteBox,
  siteGroup,
  siteHeading,
  siteToWorld,
} from './places';
import { buildFolk, pick, HAIRS, SKINS, type Folk } from './venue';
import { type Interactable, type Obstacle } from './world';

/**
 * S01 + S02 — salão de cabeleireiro coberto (não quiosque):
 * porta, espelho, cadeira; paga → escolhe cortar ou pintar → senta → resultado no cabelo.
 */

export const SALON_CUT_COST = 8;
export const SALON_DYE_COST = 5;

const HAIR = 0x5c3d2e;
/** Base cap that covers the scalp when stock hair is hidden. */
function hairBase(g: THREE.Group, color = HAIR): void {
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), mat(color));
  cap.position.set(0, 0.02, 0.02);
  cap.rotation.x = 0.35;
  g.add(cap);
}

export const STYLES: { id: string; name: string; build: () => THREE.Object3D }[] = [
  {
    id: 'srv-curto',
    name: 'curto',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(HAIR));
      fringe.scale.set(1.3, 0.45, 0.7);
      fringe.position.set(0, 0.12, -0.22);
      g.add(fringe);
      return g;
    },
  },
  {
    id: 'srv-trancas',
    name: 'tranças',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8), mat(HAIR));
        t.position.set(s * 0.28, -0.15, 0.08);
        g.add(t);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xffe066));
        tip.position.set(s * 0.28, -0.55, 0.08);
        g.add(tip);
      }
      return g;
    },
  },
  {
    id: 'srv-moinho',
    name: 'moinho',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(HAIR));
      bun.position.set(0, 0.32, 0.05);
      g.add(bun);
      return g;
    },
  },
  {
    id: 'srv-ondulado',
    name: 'ondulado',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.55, 12), mat(HAIR));
      back.position.set(0, -0.15, 0.12);
      back.scale.z = 0.75;
      g.add(back);
      return g;
    },
  },
  {
    id: 'srv-rabo',
    name: 'rabo de cavalo',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(HAIR));
      bun.position.set(0, 0.18, 0.28);
      g.add(bun);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 8), mat(HAIR));
      t.position.set(0, -0.2, 0.32);
      t.rotation.x = 0.45;
      g.add(t);
      return g;
    },
  },
  {
    id: 'srv-dois',
    name: 'dois moinhos',
    build: () => {
      const g = new THREE.Group();
      hairBase(g);
      for (const s of [-1, 1]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(HAIR));
        bun.position.set(s * 0.26, 0.28, 0.02);
        g.add(bun);
      }
      return g;
    },
  },
];
STYLES.forEach((s) =>
  registerWearable(s.id, { name: `penteado ${s.name}`, slot: 'head', build: s.build, replacesHair: true }),
);

export const DYE: { id: string; name: string; color: number }[] = [
  { id: 'srv-dye-rosa', name: 'rosa', color: 0xff6b9d },
  { id: 'srv-dye-azul', name: 'azul', color: 0x4dabf7 },
  { id: 'srv-dye-louro', name: 'louro', color: 0xffe066 },
  { id: 'srv-dye-branco', name: 'branco', color: 0xf8f9fa },
];
DYE.forEach((d) =>
  registerWearable(d.id, {
    name: `cabelo ${d.name}`,
    slot: 'head',
    replacesHair: true,
    build: () => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat(d.color));
      m.scale.set(1.05, 0.95, 0.9);
      m.position.y = 0.08;
      g.add(m);
      return g;
    },
  }),
);

const CUT_DUR = 2.8;
const DYE_DUR = 3.0;

interface SalonJob {
  t: number;
  phase: 'work' | 'done';
  kind: 'cut' | 'dye';
  wearId: string;
  label: string;
  stand: THREE.Vector3;
  chairAt: THREE.Vector3;
  chairY: number;
  heading: number;
  tech: Folk;
  techHome: THREE.Vector3;
}

/** Covered pink salon: door, mirror wall, salon chair, scissors / dye bottles. */
export function buildSalonCabin(g: THREE.Group, hw: number, depth: number): { chair: { lx: number; ly: number; lz: number; face: number } } {
  const wall = mat(0xfff0f6);
  const trim = mat(0xe64980);
  const floor = mat(0xffe3ec);
  box(g, floor, hw * 2, 0.14, depth, 0, 0.07, -depth / 2);
  box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);
  box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
  for (const s of [-1, 1]) {
    box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
    box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
  }
  // front wall + door
  const doorW = 1.7;
  box(g, wall, hw - doorW / 2, 2.7, 0.2, -(hw + doorW / 2) / 2, 1.4, -0.1);
  box(g, wall, hw - doorW / 2, 2.7, 0.2, (hw + doorW / 2) / 2, 1.4, -0.1);
  for (const s of [-1, 1]) box(g, trim, 0.12, 2.4, 0.22, s * (doorW / 2 + 0.04), 1.25, -0.05);
  box(g, trim, doorW + 0.3, 0.4, 0.24, 0, 2.5, -0.05);
  // scissors badge on lintel (no text)
  box(g, mat(0xdee2e6), 0.55, 0.08, 0.08, 0, 2.5, 0.12);
  box(g, mat(0xadb5bd), 0.08, 0.08, 0.35, -0.12, 2.5, 0.12);
  box(g, mat(0xadb5bd), 0.08, 0.08, 0.35, 0.12, 2.5, 0.12);
  // pitched pink roof (reads as a house, not a flat kiosk canopy)
  const roof = mat(0xff5c8a);
  const rL = box(g, roof, hw + 0.55, 0.14, depth + 0.7, -hw / 2 - 0.05, 3.05, -depth / 2);
  rL.rotation.z = 0.22;
  const rR = box(g, roof, hw + 0.55, 0.14, depth + 0.7, hw / 2 + 0.05, 3.05, -depth / 2);
  rR.rotation.z = -0.22;
  box(g, mat(0xffc9c9), 0.35, 0.35, depth + 0.75, 0, 3.28, -depth / 2);
  // striped pole + scissors silhouette on the ridge (kids' salon cue)
  cyl(g, mat(0xffffff), 0.05, 0.9, 0, 3.85, -depth / 2);
  for (let i = 0; i < 4; i++) {
    const stripe = box(g, mat(i % 2 ? 0xff6b9d : 0x4dabf7), 0.12, 0.16, 0.12, 0, 3.55 + i * 0.16, -depth / 2);
    void stripe;
  }
  // big mirror on back wall
  box(g, mat(0xffffff), 2.2, 1.6, 0.06, 0, 1.7, -depth + 0.22);
  box(g, mat(0x74c0fc, 0.15), 2.0, 1.4, 0.05, 0, 1.7, -depth + 0.28);
  // shelf + dye bottles (colour story from the door)
  box(g, mat(0xe9ecef), 1.6, 0.08, 0.28, 0.9, 1.15, -depth + 0.45);
  DYE.forEach((d, i) => {
    cyl(g, mat(d.color), 0.07, 0.22, 0.35 + i * 0.28, 1.32, -depth + 0.48);
    cyl(g, mat(0xffffff), 0.05, 0.05, 0.35 + i * 0.28, 1.46, -depth + 0.48);
  });
  // salon chair
  const lx = -0.55;
  const lz = -1.7;
  const ly = 0.48;
  box(g, mat(0xffa8c8), 0.75, 0.12, 0.7, lx, ly, lz);
  box(g, mat(0xff8ec5), 0.75, 0.85, 0.12, lx, ly + 0.5, lz + 0.32);
  for (const s of [-1, 1]) box(g, mat(0xffc9de), 0.08, 0.14, 0.55, lx + s * 0.36, ly + 0.14, lz);
  cyl(g, mat(0xadb5bd), 0.09, 0.42, lx, 0.22, lz);
  cyl(g, mat(0x868e96), 0.32, 0.06, lx, 0.04, lz);
  // side window
  for (const s of [-1, 1]) {
    box(g, mat(0xffc9c9, 0.2), 0.08, 0.7, 0.9, s * (hw - 0.02), 1.55, -depth / 2);
  }
  box(g, mat(0xadb5bd), doorW + 0.2, 0.08, 0.35, 0, 0.04, 0.2);
  return { chair: { lx, ly, lz, face: Math.PI } }; // face local −Z = mirror
}

export class Salon {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private group: THREE.Group | null = null;
  private tech: Folk | null = null;
  private job: SalonJob | null = null;
  private busyFlag = false;
  private styleIdx = 0;
  private stand: THREE.Vector3 | null = null;
  private waveT = 0;

  get busy(): boolean {
    return this.busyFlag;
  }

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    private readonly hero: Character,
    siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
  ) {
    this.fly = new Flyers(scene);
    const hw = 2.5;
    const depth = 4.0;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    const cabin = buildSalonCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(
      siteBox(site, cabin.chair.lx - 0.4, cabin.chair.lx + 0.4, cabin.chair.lz - 0.4, cabin.chair.lz + 0.4, 0.6),
    );

    const techHome = { x: 1.1, z: -2.6 };
    const tech = buildFolk({
      shirt: 0xff6b9d,
      pants: 0x495057,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    tech.group.position.set(techHome.x, 0, techHome.z);
    tech.group.rotation.y = Math.PI;
    g.add(tech.group);
    this.tech = tech;
    // comb in hand
    const comb = box(tech.armR, mat(0xffd43b), 0.04, 0.22, 0.02, 0, -0.55, 0);
    void comb;

    const stand = siteToWorld(site, 0, 1.2);
    this.stand = stand.clone();
    const payTo = siteToWorld(site, techHome.x, techHome.z, 1.1);

    this.things.push({
      object: g,
      position: stand,
      radius: 2.4,
      requiresClick: true,
      interact: () => {
        void this.meet(site, cabin.chair, tech, techHome, stand, payTo);
      },
      update: (dt) => this.tick(dt),
    });
  }

  private hand = () => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  private async meet(
    site: { x: number; z: number; rot: number },
    chair: { lx: number; ly: number; lz: number; face: number },
    tech: Folk,
    techHome: { x: number; z: number },
    stand: THREE.Vector3,
    payTo: THREE.Vector3,
  ): Promise<void> {
    if (this.busyFlag || this.job) return;
    if (this.ctx.isPaused() || this.ctx.isDriving()) return;
    if (this.fly.busy) return;

    // lock immediately so a second click cannot open two quizzes
    this.busyFlag = true;

    const choice = await this.ctx.choose('O que queres no cabelo?', ['Cortar!', 'Pintar!', 'Agora não']);
    if (choice === null || choice === 2) {
      this.busyFlag = false;
      if (choice === 2) this.ctx.say(['Quando quiseres, o salão está aberto!']);
      return;
    }

    const kind: 'cut' | 'dye' = choice === 0 ? 'cut' : 'dye';
    const cost = kind === 'cut' ? SALON_CUT_COST : SALON_DYE_COST;

    let wearId: string;
    let label: string;
    if (kind === 'cut') {
      const s = STYLES[this.styleIdx++ % STYLES.length];
      wearId = s.id;
      label = s.name;
    } else {
      // choose colour BEFORE paying (same pattern as manicure)
      const dyeChoice = await this.ctx.choose(
        'Que cor queres?',
        DYE.map((d) => d.name.charAt(0).toUpperCase() + d.name.slice(1) + '!'),
      );
      if (dyeChoice === null || dyeChoice < 0 || dyeChoice >= DYE.length) {
        this.busyFlag = false;
        return;
      }
      const d = DYE[dyeChoice];
      wearId = d.id;
      label = d.name;
    }

    if (this.ctx.coins() < cost) {
      this.busyFlag = false;
      this.waveT = 1.2;
      tech.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.45;
      this.ctx.say([`Isso são ${cost} moedas.`]);
      tone(196, 0, 0.3, 'sine', 0.13);
      return;
    }

    this.ctx.addCoins(-cost);
    for (let i = 0; i < Math.min(cost, 4); i++) {
      this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
    }
    this.ctx.say(kind === 'cut' ? ['Senta-te — vou cortar!'] : ['Senta-te — vamos pintar!']);

    this.ctx.hold(true);
    const chairAt = siteToWorld(site, chair.lx, chair.lz);
    const p = this.hero;
    p.position.set(chairAt.x, 0, chairAt.z);
    p.heading = siteHeading(site, chair.face);
    p.sitting = true;
    p.root.position.y = chair.ly;
    tech.group.position.set(chair.lx + 0.75, 0, chair.lz - 0.1);
    tech.group.rotation.y = -Math.PI * 0.55;

    this.job = {
      t: 0,
      phase: 'work',
      kind,
      wearId,
      label,
      stand: stand.clone(),
      chairAt,
      chairY: chair.ly,
      heading: site.rot,
      tech,
      techHome: new THREE.Vector3(techHome.x, 0, techHome.z),
    };
    tone(523, 0, 0.1, 'sine', 0.04);
  }

  private tick(dt: number): void {
    this.fly.update(dt);
    const t = performance.now() * 0.001;
    if (this.tech && !this.job) {
      this.tech.armR.rotation.x = -0.15 + Math.sin(t * 1.4) * 0.08;
      this.tech.head.rotation.y = Math.sin(t * 0.6) * 0.1;
      if (this.waveT > 0) {
        this.waveT = Math.max(0, this.waveT - dt);
        this.tech.armL.rotation.z = 0.55 + Math.sin(t * 10) * 0.3;
      } else {
        this.tech.armL.rotation.z = 0.05;
      }
    }

    const job = this.job;
    if (!job) return;
    job.t += dt;
    const p = this.hero;
    p.sitting = true;
    p.position.set(job.chairAt.x, 0, job.chairAt.z);
    p.root.position.y = job.chairY;

    const ph = job.t * 7;
    job.tech.armR.rotation.x = -0.9 - Math.abs(Math.sin(ph)) * 0.45;
    job.tech.armR.rotation.z = 0.2 + Math.sin(ph * 0.7) * 0.25;
    job.tech.body.rotation.x = -0.12;
    if (Math.floor(job.t * 5) !== Math.floor((job.t - dt) * 5)) {
      tone(job.kind === 'cut' ? 900 + Math.random() * 200 : 700 + Math.random() * 150, 0, 0.04, 'triangle', 0.03);
    }

    const dur = job.kind === 'cut' ? CUT_DUR : DYE_DUR;
    if (job.phase === 'work' && job.t >= dur) {
      job.phase = 'done';
      this.ctx.wear('head', job.wearId);
      feel('groom');
      if (job.kind === 'cut') this.ctx.say(['É o cabeleireiro!', `Ficaste com o cabelo ${job.label}!`]);
      else this.ctx.say(['É a tintura!', `Cabelo ${job.label}!`]);
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.16, 'sine', 0.05));
      this.endJob();
    }
  }

  private endJob(): void {
    const job = this.job;
    if (!job) return;
    const p = this.hero;
    p.sitting = false;
    p.root.position.y = 0;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.heading;
    job.tech.group.position.copy(job.techHome);
    job.tech.group.rotation.y = Math.PI;
    job.tech.armR.rotation.x = 0;
    job.tech.armR.rotation.z = 0;
    job.tech.body.rotation.x = 0;
    this.job = null;
    this.busyFlag = false;
    this.ctx.hold(false);
  }

  dispose(): void {
    if (this.job) this.endJob();
    this.fly.clear();
    this.group?.removeFromParent();
    this.group = null;
  }

  update(dt: number): void {
    // tick runs via interactable.update; keep fly if no thing yet
    if (!this.things.length) this.fly.update(dt);
  }

  debug(): Record<string, unknown> {
    return {
      stand: this.stand ? [+this.stand.x.toFixed(1), +this.stand.z.toFixed(1)] : null,
      busy: this.busyFlag,
      job: this.job ? { t: +this.job.t.toFixed(2), kind: this.job.kind, wear: this.job.wearId } : null,
      cutCost: SALON_CUT_COST,
      dyeCost: SALON_DYE_COST,
    };
  }
}

export function createSalon(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
): Salon {
  return new Salon(scene, obstacles, rng, ctx, hero, siteOpts);
}
