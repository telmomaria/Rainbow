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
 * S04 — loja de roupa coberta com montra e cabine de prova (não quiosque).
 * Paga → entra na cabine (cortina) → veste → sai → «Que … tão giro!»
 */

export const CLOTHES_COST = 10;
const FIT_DUR = 2.4;

/** Mini dress/jacket/shorts for the shop window (not worn — Character uses buildShopOutfit). */
function previewOutfit(kind: 'srv-vestido' | 'srv-casaco' | 'srv-calcoes'): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'srv-vestido') {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 12), mat(0xff6b9d));
    skirt.position.y = 0.15;
    g.add(skirt);
    box(g, mat(0xffffff), 0.22, 0.06, 0.22, 0, 0.4, 0);
  } else if (kind === 'srv-casaco') {
    box(g, mat(0x4dabf7), 0.4, 0.45, 0.22, 0, 0.25, 0);
    box(g, mat(0x364fc7), 0.32, 0.28, 0.2, 0, -0.05, 0);
  } else {
    box(g, mat(0x51cf66), 0.36, 0.28, 0.2, 0, 0.28, 0);
    box(g, mat(0xff922b), 0.34, 0.22, 0.2, 0, 0.02, 0);
  }
  return g;
}

export const CLOTHES: { id: 'srv-vestido' | 'srv-casaco' | 'srv-calcoes'; name: string }[] = [
  { id: 'srv-vestido', name: 'vestido cor-de-rosa' },
  { id: 'srv-casaco', name: 'casaco azul' },
  { id: 'srv-calcoes', name: 't-shirt e calções' },
];
CLOTHES.forEach((c) =>
  registerWearable(c.id, { name: c.name, slot: 'body', build: () => previewOutfit(c.id) }),
);

interface ClothesJob {
  t: number;
  phase: 'curtain' | 'wear' | 'done';
  stand: THREE.Vector3;
  boothAt: THREE.Vector3;
  heading: number;
  kind: (typeof CLOTHES)[number]['id'];
  name: string;
  curtain: THREE.Mesh;
  clerk: Folk;
  clerkHome: THREE.Vector3;
}

export function buildClothesCabin(
  g: THREE.Group,
  hw: number,
  depth: number,
): { booth: { lx: number; ly: number; lz: number; face: number }; curtain: THREE.Mesh } {
  const wall = mat(0xe7f5ff);
  const trim = mat(0x228be6);
  const floor = mat(0xf1f3f5);
  box(g, floor, hw * 2, 0.14, depth, 0, 0.07, -depth / 2);
  box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);
  box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
  for (const s of [-1, 1]) {
    box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
    box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
  }
  const doorW = 1.6;
  box(g, wall, hw - doorW / 2, 2.7, 0.2, -(hw + doorW / 2) / 2, 1.4, -0.1);
  box(g, wall, hw - doorW / 2, 2.7, 0.2, (hw + doorW / 2) / 2, 1.4, -0.1);
  for (const s of [-1, 1]) box(g, trim, 0.12, 2.4, 0.22, s * (doorW / 2 + 0.04), 1.25, -0.05);
  box(g, trim, doorW + 0.3, 0.4, 0.24, 0, 2.5, -0.05);
  // montra glass (left)
  const glass = new THREE.MeshStandardMaterial({
    color: 0xe7f5ff,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const winX = -1.4;
  box(g, mat(0xffffff), 1.8, 1.55, 0.08, winX, 1.45, -0.02);
  box(g, glass, 1.65, 1.4, 0.06, winX, 1.45, 0.02);
  // pitched roof
  const roof = mat(0xff922b);
  const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.0, -depth / 2);
  rL.rotation.z = 0.16;
  const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.0, -depth / 2);
  rR.rotation.z = -0.16;
  box(g, wall, 0.3, 0.3, depth + 0.55, 0, 3.18, -depth / 2);
  // montra shelf + outfit previews
  box(g, mat(0xffe066), 1.6, 0.08, 0.45, winX, 0.85, -0.55);
  CLOTHES.forEach((c, i) => {
    const stick = box(g, mat(0xadb5bd), 0.04, 0.4, 0.04, winX - 0.45 + i * 0.45, 1.1, -0.5);
    void stick;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffdbac));
    head.position.set(winX - 0.45 + i * 0.45, 1.35, -0.5);
    g.add(head);
    const item = previewOutfit(c.id);
    item.scale.setScalar(0.55);
    item.position.set(winX - 0.45 + i * 0.45, 0.95, -0.5);
    g.add(item);
  });
  // fitting booth (right back corner) with curtain
  const bx = 1.15;
  const bz = -2.4;
  box(g, mat(0xdee2e6), 1.5, 2.2, 0.08, bx, 1.15, bz - 0.7);
  box(g, mat(0xdee2e6), 0.08, 2.2, 1.3, bx - 0.7, 1.15, bz);
  box(g, mat(0xdee2e6), 0.08, 2.2, 1.3, bx + 0.7, 1.15, bz);
  box(g, mat(0xadb5bd), 1.5, 0.06, 0.06, bx, 2.2, bz + 0.55);
  const curtainMat = new THREE.MeshStandardMaterial({
    color: 0xff6b9d,
    roughness: 0.7,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 2.0), curtainMat);
  curtain.position.set(bx, 1.15, bz + 0.55);
  curtain.visible = false;
  g.add(curtain);
  // counter
  box(g, mat(0xfff3d6), 1.4, 0.12, 0.65, -0.2, 1.0, -1.5);
  box(g, wall, 1.4, 0.9, 0.5, -0.2, 0.5, -1.5);
  box(g, mat(0xadb5bd), doorW + 0.2, 0.08, 0.35, 0, 0.04, 0.2);
  return { booth: { lx: bx, ly: 0, lz: bz, face: Math.PI }, curtain };
}

export class ClothesShop {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private group: THREE.Group | null = null;
  private job: ClothesJob | null = null;
  private busyFlag = false;
  private clothesIdx = 0;
  private stand: THREE.Vector3 | null = null;

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
    const hw = 2.6;
    const depth = 4.2;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    const cabin = buildClothesCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, 0.4, 1.9, -3.1, -1.7, 2.2)); // fitting booth
    obstacles.push(siteBox(site, -0.9, 0.5, -1.85, -1.15, 1.05)); // counter

    const clerkHome = { x: -0.2, z: -2.2 };
    const clerk = buildFolk({
      shirt: 0x228be6,
      pants: 0xffffff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    clerk.group.position.set(clerkHome.x, 0, clerkHome.z);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);

    const stand = siteToWorld(site, 0, 1.2);
    this.stand = stand.clone();
    const payTo = siteToWorld(site, clerkHome.x, clerkHome.z, 1.1);

    this.things.push({
      object: g,
      position: stand,
      radius: 2.4,
      requiresClick: true,
      interact: () => {
        if (this.fly.busy || this.busyFlag || this.job) return false;
        if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
        if (this.ctx.coins() < CLOTHES_COST) {
          clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say([`A roupa são ${CLOTHES_COST} moedas.`]);
          tone(196, 0, 0.3, 'sine', 0.13);
          return false;
        }
        this.ctx.addCoins(-CLOTHES_COST);
        for (let i = 0; i < Math.min(CLOTHES_COST, 4); i++) {
          this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
        }
        const pick = CLOTHES[this.clothesIdx++ % CLOTHES.length];
        this.beginFit(site, cabin.booth, cabin.curtain, clerk, clerkHome, stand, pick);
        return true;
      },
      update: (dt) => this.tick(dt),
    });
  }

  private hand = () => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  private beginFit(
    site: { x: number; z: number; rot: number },
    booth: { lx: number; ly: number; lz: number; face: number },
    curtain: THREE.Mesh,
    clerk: Folk,
    clerkHome: { x: number; z: number },
    stand: THREE.Vector3,
    pick: (typeof CLOTHES)[number],
  ): void {
    this.busyFlag = true;
    this.ctx.hold(true);
    this.ctx.say(['É a loja de roupa!', 'Experimenta na cabine!']);
    const boothAt = siteToWorld(site, booth.lx, booth.lz);
    const p = this.hero;
    p.position.set(boothAt.x, 0, boothAt.z);
    p.heading = siteHeading(site, booth.face);
    curtain.visible = true;
    curtain.scale.x = 0.15;
    clerk.group.position.set(booth.lx - 0.9, 0, booth.lz + 0.3);
    clerk.group.rotation.y = Math.PI * 0.4;
    this.job = {
      t: 0,
      phase: 'curtain',
      stand: stand.clone(),
      boothAt,
      heading: site.rot,
      kind: pick.id,
      name: pick.name,
      curtain,
      clerk,
      clerkHome: new THREE.Vector3(clerkHome.x, 0, clerkHome.z),
    };
    tone(392, 0, 0.12, 'sine', 0.04);
  }

  private tick(dt: number): void {
    this.fly.update(dt);
    const job = this.job;
    if (!job) return;
    job.t += dt;
    const p = this.hero;
    p.position.set(job.boothAt.x, 0, job.boothAt.z);

    if (job.phase === 'curtain') {
      job.curtain.scale.x = Math.min(1, 0.15 + job.t * 2.2);
      if (job.t >= 0.7) {
        job.phase = 'wear';
        job.t = 0;
        this.ctx.wear('body', job.kind);
        feel('shop');
        tone(660, 0, 0.1, 'sine', 0.05);
      }
    } else if (job.phase === 'wear') {
      // hold curtain closed while changing
      job.curtain.scale.x = 1;
      if (job.t >= FIT_DUR - 0.7) {
        job.curtain.scale.x = Math.max(0.15, 1 - (job.t - (FIT_DUR - 0.7)) * 2);
      }
      if (job.t >= FIT_DUR) {
        job.phase = 'done';
        job.curtain.visible = false;
        this.ctx.say([`Que ${job.name} tão giro!`]);
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.16, 'sine', 0.05));
        this.endJob();
      }
    }
  }

  private endJob(): void {
    const job = this.job;
    if (!job) return;
    const p = this.hero;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.heading;
    job.curtain.visible = false;
    job.curtain.scale.x = 1;
    job.clerk.group.position.copy(job.clerkHome);
    job.clerk.group.rotation.y = Math.PI;
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

  debug(): Record<string, unknown> {
    return {
      stand: this.stand ? [+this.stand.x.toFixed(1), +this.stand.z.toFixed(1)] : null,
      busy: this.busyFlag,
      job: this.job ? { t: +this.job.t.toFixed(2), phase: this.job.phase, kind: this.job.kind } : null,
      cost: CLOTHES_COST,
    };
  }
}

export function createClothesShop(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
): ClothesShop {
  return new ClothesShop(scene, obstacles, rng, ctx, hero, siteOpts);
}
