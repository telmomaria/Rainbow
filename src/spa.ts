import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
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
import { PERSON_CLEAR, type Interactable, type Obstacle } from './world';

/**
 * Spa real (não só fala):
 *  - Nuuk → spa no gelo (exterior ártico: blocos de gelo, vapor, banco de gelo)
 *  - Vilnius / Moscovo → cabina coberta de vapor (parede, porta, telhado, luz suave)
 * Só nestas 3 cidades.
 */

export const SPA_COST = 5;
/** Short ice / steam ritual (seconds). */
export const SPA_DUR = 8;

export const SPA_ICE_CITY = 'Nuuk';
export const SPA_BUILDING_CITIES = ['Vilnius', 'Moscovo'] as const;

export type SpaKind = 'ice' | 'building';

function spaKindFor(city: string): SpaKind | null {
  if (city === SPA_ICE_CITY) return 'ice';
  if ((SPA_BUILDING_CITIES as readonly string[]).includes(city)) return 'building';
  return null;
}

type Seat = { lx: number; ly: number; lz: number; face: number };

type Job = {
  t: number;
  dur: number;
  stand: THREE.Vector3;
  seatAt: THREE.Vector3;
  seatY: number;
  heading: number;
  siteRot: number;
  kind: SpaKind;
  clerk: Folk | null;
  clerkHome: THREE.Vector3 | null;
  vapor: THREE.Group;
  glow: THREE.PointLight;
};

/**
 * City spa: ice outdoor (Nuuk) or covered steam cabin (Vilnius / Moscovo).
 * Pay → sit/lie → vapor ritual → feel('spa') + short line → stand dressed.
 */
export class Spa {
  readonly things: Interactable[] = [];
  private fly: Flyers;
  private kind: SpaKind | null = null;
  private stand: THREE.Vector3 | null = null;
  private job: Job | null = null;
  private busyFlag = false;
  private vapor: THREE.Group | null = null;
  private glow: THREE.PointLight | null = null;
  private group: THREE.Group | null = null;
  private clerk: Folk | null = null;
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
    const kind = spaKindFor(ctx.city());
    if (!kind) return;
    this.kind = kind;

    if (kind === 'ice') this.buildIce(scene, obstacles, rng, siteOpts);
    else this.buildBuilding(scene, obstacles, rng, siteOpts);
  }

  private hand = () => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  private buildIce(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
  ): void {
    const hw = 2.8;
    const depth = 4.2;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    const built = buildIceSpa(g, hw, depth);
    this.vapor = built.vapor;
    this.glow = built.glow;
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, -0.7, 0.7, built.seat.lz - 0.55, built.seat.lz + 0.55, 0.55));

    // optional arctic guide (parkas) — waves if no coins
    const clerkHome = { x: 1.5, z: -3.4 };
    const clerk = buildFolk({
      shirt: 0x1971c2,
      pants: 0xe7f5ff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
      cap: 0xffffff,
    });
    clerk.group.position.set(clerkHome.x, 0, clerkHome.z);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);
    this.clerk = clerk;

    const stand = siteToWorld(site, 0, 1.2);
    this.stand = stand.clone();
    const payTo = siteToWorld(site, clerkHome.x, clerkHome.z, 1.1);

    this.things.push({
      object: g,
      position: stand,
      radius: 2.6,
      requiresClick: true,
      keepClear: PERSON_CLEAR,
      interact: () => {
        this.tryStart(site, built.seat, clerk, clerkHome, stand, payTo, 'ice');
      },
      update: (dt) => this.tick(dt),
    });
  }

  private buildBuilding(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
  ): void {
    const hw = 2.6;
    const depth = 4.4;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    const built = buildSteamCabin(g, hw, depth);
    this.vapor = built.vapor;
    this.glow = built.glow;
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, -0.75, 0.75, built.seat.lz - 1.0, built.seat.lz + 1.0, 0.9));

    const clerkHome = { x: 1.35, z: -3.3 };
    const clerk = buildFolk({
      shirt: 0x96f2d7,
      pants: 0xffffff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    clerk.group.position.set(clerkHome.x, 0, clerkHome.z);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);
    this.clerk = clerk;

    const stand = siteToWorld(site, 0, 1.25);
    this.stand = stand.clone();
    const payTo = siteToWorld(site, clerkHome.x, clerkHome.z, 1.1);

    this.things.push({
      object: g,
      position: stand,
      radius: 2.6,
      requiresClick: true,
      keepClear: PERSON_CLEAR,
      interact: () => {
        this.tryStart(site, built.seat, clerk, clerkHome, stand, payTo, 'building');
      },
      update: (dt) => this.tick(dt),
    });
  }

  private tryStart(
    site: { x: number; z: number; rot: number },
    seat: Seat,
    clerk: Folk,
    clerkHome: { x: number; z: number },
    stand: THREE.Vector3,
    payTo: THREE.Vector3,
    kind: SpaKind,
  ): void {
    if (this.busyFlag || this.job) return;
    if (this.ctx.isPaused() || this.ctx.isDriving()) return;
    if (this.fly.busy) return;

    if (this.ctx.coins() < SPA_COST) {
      this.waveT = 1.2;
      clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.45;
      this.ctx.say([`O spa são ${SPA_COST} moedas.`]);
      tone(196, 0, 0.3, 'sine', 0.13);
      return;
    }

    this.ctx.addCoins(-SPA_COST);
    for (let i = 0; i < Math.min(SPA_COST, 4); i++) {
      this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
    }

    this.busyFlag = true;
    this.ctx.hold(true);
    if (kind === 'ice') this.ctx.say(['Deita-te no gelo…', 'Um banho friozinho!']);
    else this.ctx.say(['Entra — vapor quentinho!', 'Deita-te e descansa.']);

    const seatAt = siteToWorld(site, seat.lx, seat.lz);
    const p = this.hero;
    p.position.set(seatAt.x, 0, seatAt.z);
    p.heading = siteHeading(site, seat.face);
    if (kind === 'ice') {
      // sit then ease into a short lie on the ice bench
      p.sitting = true;
      p.root.position.y = seat.ly;
    } else {
      // same readable on-table pose as the massage marquesa
      p.applyProneLie(seat.ly);
    }

    // attendant steps beside the bench
    clerk.group.position.set(seat.lx + (kind === 'ice' ? 0.95 : -0.95), 0, seat.lz);
    clerk.group.rotation.y = kind === 'ice' ? -Math.PI / 2 : Math.PI / 2;

    const vapor = this.vapor!;
    const glow = this.glow!;
    this.job = {
      t: 0,
      dur: SPA_DUR,
      stand: stand.clone(),
      seatAt,
      seatY: seat.ly,
      heading: siteHeading(site, seat.face),
      siteRot: site.rot,
      kind,
      clerk,
      clerkHome: new THREE.Vector3(clerkHome.x, 0, clerkHome.z),
      vapor,
      glow,
    };
    tone(kind === 'ice' ? 523 : 330, 0, 0.18, 'sine', 0.05);
  }

  private endJob(): void {
    const job = this.job;
    if (!job) return;
    const p = this.hero;
    p.sitting = false;
    p.lyingY = null;
    p.prone = false;
    p.airborne = false;
    p.root.rotation.x = 0;
    p.root.rotation.z = 0;
    p.root.position.y = 0;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.siteRot;

    if (job.clerk && job.clerkHome) {
      job.clerk.group.position.copy(job.clerkHome);
      job.clerk.group.rotation.y = Math.PI;
      job.clerk.armR.rotation.x = 0;
      job.clerk.armL.rotation.x = 0;
      job.clerk.body.rotation.x = 0;
    }

    // calm vapor / glow back to idle
    job.glow.intensity = job.kind === 'ice' ? 0.9 : 1.2;
    for (const c of job.vapor.children) {
      c.scale.setScalar(1);
      (c as THREE.Mesh).visible = true;
    }

    this.job = null;
    this.busyFlag = false;
    feel('spa');
    if (job.kind === 'ice') this.ctx.say(['Que friozinho bom!']);
    else this.ctx.say(['Que descanso!', 'Sais vestida e quentinha.']);
    const notes = job.kind === 'ice' ? [659, 784, 988] : [392, 523, 659];
    notes.forEach((f, i) => tone(f, i * 0.1, 0.18, 'sine', 0.05));
    this.ctx.hold(false);
  }

  private tick(dt: number): void {
    this.fly.update(dt);
    // idle vapor drift
    if (this.vapor && !this.job) {
      const t = performance.now() * 0.001;
      for (let i = 0; i < this.vapor.children.length; i++) {
        const c = this.vapor.children[i];
        const base = (c.userData.baseY as number) ?? 0.6;
        c.position.y = base + Math.sin(t * 1.4 + i) * 0.12 + ((t * 0.25 + i * 0.2) % 0.9);
        const s = 0.7 + Math.sin(t * 2 + i * 0.7) * 0.2;
        c.scale.setScalar(s);
      }
    }
    if (this.clerk && !this.job) {
      const t = performance.now() * 0.001;
      this.clerk.head.rotation.y = Math.sin(t * 0.6) * 0.12;
      if (this.waveT > 0) {
        this.waveT = Math.max(0, this.waveT - dt);
        this.clerk.armL.rotation.z = 0.55 + Math.sin(t * 10) * 0.3;
      } else {
        this.clerk.armL.rotation.z = 0.05;
      }
    }
    this.updateJob(dt);
  }

  private updateJob(dt: number): void {
    const job = this.job;
    if (!job) return;
    job.t += dt;
    const p = this.hero;
    const u = Math.min(1, job.t / job.dur);
    const ph = job.t * 4.2;

    // vapor intensifies mid-ritual
    const boost = 0.4 + Math.sin(Math.PI * u) * 1.4;
    job.glow.intensity = (job.kind === 'ice' ? 0.9 : 1.2) + boost * 1.6;
    for (let i = 0; i < job.vapor.children.length; i++) {
      const c = job.vapor.children[i];
      const base = (c.userData.baseY as number) ?? 0.6;
      c.position.y = base + ((job.t * 0.55 + i * 0.18) % 1.4) * (1 + boost * 0.4);
      c.scale.setScalar(0.9 + boost * 0.55 + Math.sin(ph + i) * 0.15);
      const mat0 = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mat0.opacity !== undefined) mat0.opacity = Math.min(0.55, 0.18 + boost * 0.25);
    }

    if (job.kind === 'ice') {
      // sit 1.2 s → lie on ice for the rest (cold shimmer)
      if (job.t < 1.2) {
        p.sitting = true;
        p.lyingY = null;
        p.position.set(job.seatAt.x, 0, job.seatAt.z);
        p.root.position.y = job.seatY;
      } else {
        p.sitting = false;
        p.root.position.y = 0;
        p.position.set(job.seatAt.x, 0, job.seatAt.z);
        p.lyingY = job.seatY + 0.12;
        p.airborne = true;
        // soft blue shimmer via glow pulse (visible in world)
      }
      if (job.clerk) {
        job.clerk.armR.rotation.x = -0.6 - Math.sin(ph) * 0.15;
        job.clerk.armL.rotation.x = -0.5 - Math.sin(ph + 1) * 0.12;
      }
    } else {
      p.position.set(job.seatAt.x, 0, job.seatAt.z);
      p.applyProneLie(job.seatY);
      if (job.clerk) {
        // attendant drapes a towel gesture
        job.clerk.armR.rotation.x = -1.0 - Math.abs(Math.sin(ph)) * 0.25;
        job.clerk.armL.rotation.x = -0.9 - Math.abs(Math.sin(ph + 0.8)) * 0.2;
        job.clerk.body.rotation.x = -0.25;
      }
    }

    if (job.t >= job.dur) this.endJob();
  }

  dispose(): void {
    if (this.job) this.endJob();
    this.fly.clear();
    if (this.group) {
      this.group.parent?.remove(this.group);
      this.group = null;
    }
  }

  debug(): Record<string, unknown> {
    return {
      on: !!this.kind,
      kind: this.kind,
      stand: this.stand ? [+this.stand.x.toFixed(1), +this.stand.z.toFixed(1)] : null,
      busy: this.busyFlag,
      job: this.job ? { t: +this.job.t.toFixed(2), kind: this.job.kind } : null,
      cost: SPA_COST,
    };
  }
}

/* ------------------------------------------------------------------ builds */

/** Outdoor arctic ice spa: ice blocks, open igloo arch, vapor, ice bench. */
function buildIceSpa(
  g: THREE.Group,
  hw: number,
  depth: number,
): { seat: Seat; vapor: THREE.Group; glow: THREE.PointLight } {
  // Strong cyan so kids read “gelo” on Nuuk’s pale ground (not washed-out white).
  const ice = mat(0x74c0fc, 0.22);
  const deep = mat(0x1c7ed6, 0.12);
  const bright = mat(0xa5d8ff, 0.3);
  const snow = mat(0xe9ecef);
  // snow/ice pad with blue rim
  box(g, snow, hw * 2 + 0.5, 0.12, depth + 0.4, 0, 0.06, -depth / 2);
  box(g, deep, hw * 2 + 0.55, 0.08, depth + 0.45, 0, 0.02, -depth / 2);
  box(g, ice, hw * 2, 0.2, depth, 0, 0.14, -depth / 2);

  // ice-block walls (back + sides) — open front arch
  box(g, bright, hw * 2, 2.0, 0.5, 0, 1.1, -depth + 0.25);
  box(g, deep, hw * 2, 0.25, 0.55, 0, 0.25, -depth + 0.28);
  for (const s of [-1, 1]) {
    box(g, ice, 0.65, 2.1, depth * 0.85, s * (hw - 0.35), 1.15, -depth / 2 - 0.15);
    // stacked ice cubes for kids to read “gelo”
    for (let i = 0; i < 3; i++) {
      const col = i % 2 === 0 ? ice : bright;
      box(g, col, 0.62, 0.5, 0.55, s * (hw - 0.12), 0.4 + i * 0.52, -0.4 - i * 0.12);
      box(g, deep, 0.66, 0.08, 0.58, s * (hw - 0.12), 0.18 + i * 0.52, -0.4 - i * 0.12);
    }
  }
  // igloo arch over the entrance
  for (const s of [-1, 1]) {
    const pillar = cyl(g, bright, 0.32, 1.85, s * 1.2, 0.95, -0.12);
    void pillar;
    cyl(g, deep, 0.34, 0.12, s * 1.2, 0.08, -0.12);
  }
  const arch = cyl(g, ice, 1.4, 0.4, 0, 1.95, -0.08);
  arch.rotation.z = Math.PI / 2;
  arch.scale.set(1, 0.55, 1);

  // crystalline roof shard (not a warm pitched cabin)
  const shard = box(g, bright, hw * 1.7, 0.16, depth * 0.75, 0, 2.45, -depth / 2);
  shard.rotation.x = 0.08;
  box(g, deep, hw * 1.75, 0.06, depth * 0.78, 0, 2.35, -depth / 2);

  // ice bench (lie along local Z)
  const seatZ = -2.0;
  box(g, deep, 1.25, 0.12, 1.8, 0, 0.28, seatZ);
  box(g, ice, 1.2, 0.22, 1.75, 0, 0.42, seatZ);
  box(g, bright, 1.1, 0.1, 1.6, 0, 0.56, seatZ);
  for (const [lx, lz] of [
    [-0.45, -0.65],
    [0.45, -0.65],
    [-0.45, 0.65],
    [0.45, 0.65],
  ] as const) {
    cyl(g, deep, 0.09, 0.38, lx, 0.22, seatZ + lz);
  }
  // little icicles
  for (let i = 0; i < 5; i++) {
    cyl(g, bright, 0.045, 0.32, -0.85 + i * 0.42, 1.7, -depth + 0.4);
  }

  const vapor = makeVapor(g, 0, 0.75, seatZ, 12, 0xd0ebff);
  const glow = new THREE.PointLight(0x4dabf7, 1.35, 11, 1.6);
  glow.position.set(0, 1.9, seatZ);
  g.add(glow);

  // northern sparkles on the snow
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4dabf7, emissiveIntensity: 0.85, metalness: 0.4 }),
    );
    sp.position.set((i - 3.5) * 0.5, 0.3, -0.55 - (i % 3) * 0.35);
    g.add(sp);
  }

  return {
    seat: { lx: 0, ly: 0.56, lz: seatZ + 0.15, face: Math.PI },
    vapor,
    glow,
  };
}

/**
 * Covered steam cabin (Vilnius / Moscovo): teal wood walls, door, pitched roof,
 * soft lamp, towel rack, marquesa — visually warm/indoor, not arctic ice.
 */
function buildSteamCabin(
  g: THREE.Group,
  hw: number,
  depth: number,
): { seat: Seat; vapor: THREE.Group; glow: THREE.PointLight } {
  const wall = mat(0xe3fafc);
  const trim = mat(0x0ca678);
  const wood = mat(0xd9480f);
  const floor = mat(0xffe8cc);
  box(g, floor, hw * 2, 0.16, depth, 0, 0.08, -depth / 2);
  box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);

  box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
  box(g, trim, hw * 2, 0.28, 0.22, 0, 0.28, -depth + 0.11);
  for (const s of [-1, 1]) {
    box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
    box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
    box(g, trim, 0.22, 0.16, depth, s * (hw - 0.1), 1.95, -depth / 2);
  }

  const doorW = 1.9;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : doorW / 2;
    const x1 = s < 0 ? -doorW / 2 : hw;
    const mid = (x0 + x1) / 2;
    const w = x1 - x0;
    box(g, wall, w, 2.7, 0.2, mid, 1.4, -0.1);
    box(g, trim, w, 0.28, 0.22, mid, 0.28, -0.09);
  }
  for (const s of [-1, 1]) box(g, trim, 0.14, 2.4, 0.22, s * (doorW / 2 + 0.04), 1.25, -0.05);
  box(g, trim, doorW + 0.35, 0.4, 0.26, 0, 2.55, -0.05);
  // steam-drop badge (no text)
  const badge = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x99e9f2, emissive: 0x15aabf, emissiveIntensity: 0.55, roughness: 0.25 }),
  );
  badge.position.set(0, 2.55, 0.14);
  badge.scale.set(1, 1.25, 0.7);
  g.add(badge);

  // pitched teal roof (distinct from massage red / clinic green)
  const roof = mat(0x0b7285);
  const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.05, -depth / 2);
  rL.rotation.z = 0.16;
  const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.05, -depth / 2);
  rR.rotation.z = -0.16;
  box(g, wall, 0.3, 0.3, depth + 0.55, 0, 3.22, -depth / 2);

  // soft hanging lamp
  cyl(g, mat(0x868e96), 0.03, 0.4, 0, 2.75, -depth / 2);
  box(g, mat(0xffe066, 0.45), 0.55, 0.18, 0.55, 0, 2.5, -depth / 2);
  const glow = new THREE.PointLight(0xffe8a3, 1.2, 9, 1.6);
  glow.position.set(0, 2.2, -depth / 2 + 0.2);
  g.add(glow);
  const glow2 = new THREE.PointLight(0x99e9f2, 0.7, 6, 2);
  glow2.position.set(0, 1.8, -depth * 0.55);
  g.add(glow2);

  // frosted side windows
  for (const s of [-1, 1]) {
    box(g, mat(0xc5f6fa, 0.2), 0.08, 0.75, 0.95, s * (hw - 0.02), 1.55, -depth / 2);
    box(g, mat(0xffffff), 0.1, 0.82, 0.08, s * (hw - 0.02), 1.55, -depth / 2 - 0.48);
    box(g, mat(0xffffff), 0.1, 0.82, 0.08, s * (hw - 0.02), 1.55, -depth / 2 + 0.48);
  }

  // towel rack
  box(g, mat(0xadb5bd), 0.06, 0.06, 1.15, -hw + 0.35, 1.55, -depth / 2);
  for (let i = 0; i < 3; i++) {
    const col = [0xffffff, 0x99e9f2, 0xffc9c9][i];
    box(g, mat(col), 0.22, 0.55, 0.08, -hw + 0.48, 1.25, -depth / 2 - 0.35 + i * 0.35);
  }

  // wooden steam bench / marquesa indoors
  const seatZ = -2.2;
  for (const [lx, lz] of [
    [-0.5, -0.75],
    [0.5, -0.75],
    [-0.5, 0.75],
    [0.5, 0.75],
  ] as const) {
    cyl(g, mat(0x868e96), 0.055, 0.65, lx, 0.32, seatZ + lz);
  }
  box(g, wood, 1.35, 0.12, 1.9, 0, 0.68, seatZ);
  box(g, mat(0xffe3e3), 1.25, 0.1, 1.75, 0, 0.8, seatZ);
  // folded towel on the pad
  box(g, mat(0xffffff), 0.55, 0.08, 0.4, 0.15, 0.9, seatZ - 0.55);

  // little steam bowls
  for (const s of [-1, 1]) {
    cyl(g, mat(0x868e96), 0.16, 0.12, s * 0.85, 0.95, -depth + 0.7);
    cyl(g, mat(0x99e9f2, 0.2), 0.1, 0.08, s * 0.85, 1.05, -depth + 0.7);
  }

  box(g, mat(0xadb5bd), doorW + 0.25, 0.08, 0.4, 0, 0.04, 0.22);
  box(g, mat(0x12b886), 1.15, 0.03, 0.5, 0, 0.06, 0.55);

  const vapor = makeVapor(g, 0, 0.95, seatZ, 12, 0xe3fafc);

  return {
    seat: { lx: 0, ly: 0.8, lz: seatZ + 0.35, face: Math.PI },
    vapor,
    glow,
  };
}

function makeVapor(parent: THREE.Object3D, x: number, y: number, z: number, n: number, color: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 + (i % 3) * 0.04, 8, 6),
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        roughness: 1,
        depthWrite: false,
        emissive: color,
        emissiveIntensity: 0.15,
      }),
    );
    const a = (i / n) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.35, y + (i % 4) * 0.12, Math.sin(a) * 0.25);
    m.userData.baseY = m.position.y;
    g.add(m);
  }
  return g;
}

export function createSpa(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
): Spa {
  return new Spa(scene, obstacles, rng, ctx, hero, siteOpts);
}
