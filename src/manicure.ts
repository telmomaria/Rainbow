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
import { PERSON_CLEAR, type Interactable, type Obstacle } from './world';

/**
 * S09 — manicure real: salãozinho coberto com mesa, luz e esmaltes; paga → senta → escolhe cor →
 * pinta (animação) → unhas visíveis no slot `hands` (save.wear). Só a partir da 3.ª cidade (nível ≥ 2).
 */

export const MANICURE_COST = 4;
/** First city index where the manicure appears (0 = Porto, 1 = Roma, 2 = Madrid). */
export const MANICURE_MIN_LEVEL = 2;
const PAINT_DUR = 2.6;

export type NailKind = 'srv-unhas-rosa' | 'srv-unhas-vermelho' | 'srv-unhas-azul';

export const NAILS: { id: NailKind; name: string; color: number; label: string }[] = [
  { id: 'srv-unhas-rosa', name: 'rosa', color: 0xff6b9d, label: 'Rosa!' },
  { id: 'srv-unhas-vermelho', name: 'vermelho', color: 0xe03131, label: 'Vermelho!' },
  { id: 'srv-unhas-azul', name: 'azul', color: 0x4dabf7, label: 'Azul!' },
];

/** One hand’s nail tips (origin at the palm centre; −Z = fingertips). */
export function buildNailTips(color: number): THREE.Group {
  const g = new THREE.Group();
  const gloss = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.35,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.22,
  });
  for (let i = 0; i < 4; i++) {
    const nail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), gloss);
    nail.scale.set(0.028, 0.012, 0.045);
    nail.position.set((i - 1.5) * 0.038, 0.02, -0.09);
    g.add(nail);
  }
  // tiny sparkle so kids spot the colour from a few metres
  const spark = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.35 }),
  );
  spark.position.set(0, 0.04, -0.05);
  g.add(spark);
  return g;
}

for (const n of NAILS) {
  registerWearable(n.id, {
    name: `unhas ${n.name}`,
    slot: 'hands',
    build: () => buildNailTips(n.color),
  });
}

type Job = {
  t: number;
  phase: 'paint' | 'done';
  stand: THREE.Vector3;
  chairAt: THREE.Vector3;
  chairY: number;
  heading: number;
  kind: NailKind;
  tech: Folk;
  techHome: THREE.Vector3;
  brush: THREE.Object3D;
};

/**
 * Street manicure booth: recognisable chair + table + lamp + polish bottles.
 * Spawns only when `ctx.level() >= MANICURE_MIN_LEVEL`.
 */
export class Manicure {
  readonly things: Interactable[] = [];
  private fly: Flyers;
  private tech: Folk | null = null;
  private stand: THREE.Vector3 | null = null;
  private job: Job | null = null;
  private busyFlag = false;
  private waveT = 0;
  private brush: THREE.Object3D | null = null;
  private group: THREE.Group | null = null;

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
    if (ctx.level() < MANICURE_MIN_LEVEL) return;

    const hw = 2.3;
    const depth = 3.6;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    buildManicureBooth(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    // table + chair solids
    obstacles.push(siteBox(site, -0.15, 1.55, -2.35, -1.35, 0.85));
    obstacles.push(siteBox(site, -1.35, -0.35, -1.85, -0.95, 0.55));

    const techHome = { x: 1.05, z: -2.55 };
    const tech = buildFolk({
      shirt: 0xffc9c9,
      pants: 0x868e96,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
    });
    tech.group.position.set(techHome.x, 0, techHome.z);
    tech.group.rotation.y = Math.PI;
    g.add(tech.group);
    this.tech = tech;
    dressManicurist(tech);
    this.brush = tech.armR.children.find((c) => c.userData?.isBrush) ?? null;

    const stand = siteToWorld(site, 0, 1.15);
    this.stand = stand.clone();
    const payTo = siteToWorld(site, techHome.x, techHome.z, 1.1);
    const chairLocal = { lx: -0.85, ly: 0.42, lz: -1.4, face: 0 }; // face local −Z (toward table / tech)

    this.things.push({
      object: g,
      position: stand,
      radius: 2.4,
      requiresClick: true,
      keepClear: PERSON_CLEAR,
      interact: () => {
        void this.meet(site, chairLocal, tech, techHome, stand, payTo);
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

    if (this.ctx.coins() < MANICURE_COST) {
      this.waveT = 1.2;
      tech.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.45;
      this.ctx.say([`A manicure são ${MANICURE_COST} moedas.`]);
      tone(196, 0, 0.3, 'sine', 0.13);
      return;
    }

    this.busyFlag = true;
    // choose BEFORE hold — ctx.choose refuses while paused
    const choice = await this.ctx.choose('Que cor queres nas unhas?', NAILS.map((n) => n.label));
    if (choice === null || choice < 0 || choice >= NAILS.length) {
      this.busyFlag = false;
      return;
    }

    this.ctx.addCoins(-MANICURE_COST);
    for (let i = 0; i < Math.min(MANICURE_COST, 4); i++) {
      this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
    }

    const nail = NAILS[choice];
    this.ctx.hold(true);
    this.ctx.say(['Senta-te — vamos pintar!']);
    const chairAt = siteToWorld(site, chair.lx, chair.lz);
    const p = this.hero;
    p.position.set(chairAt.x, 0, chairAt.z);
    p.heading = siteHeading(site, chair.face);
    p.sitting = true;
    p.root.position.y = chair.ly;
    // tech leans over the table toward her hands
    tech.group.position.set(0.55, 0, -2.0);
    tech.group.rotation.y = -Math.PI * 0.65;
    // tint brush tip to the chosen colour
    if (this.brush) {
      this.brush.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData?.isTip) {
          ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setHex(nail.color);
        }
      });
    }

    this.job = {
      t: 0,
      phase: 'paint',
      stand: stand.clone(),
      chairAt,
      chairY: chair.ly,
      heading: site.rot,
      kind: nail.id,
      tech,
      techHome: new THREE.Vector3(techHome.x, 0, techHome.z),
      brush: this.brush ?? tech.armR,
    };
    tone(523, 0, 0.1, 'sine', 0.04);
    tone(659, 0.08, 0.12, 'sine', 0.04);
  }

  private tick(dt: number): void {
    this.fly.update(dt);
    const t = performance.now() * 0.001;
    if (this.tech && !this.job) {
      this.tech.armR.rotation.x = -0.2 + Math.sin(t * 1.5) * 0.08;
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

    // brush strokes: tech arm pumps over the table
    const ph = job.t * 6.5;
    const tech = job.tech;
    tech.armR.rotation.x = -1.15 - Math.abs(Math.sin(ph)) * 0.35;
    tech.armR.rotation.z = 0.25 + Math.sin(ph * 0.8) * 0.2;
    tech.armL.rotation.x = -0.85;
    tech.body.rotation.x = -0.25;
    if (Math.floor(job.t * 4) !== Math.floor((job.t - dt) * 4)) {
      tone(900 + (Math.sin(ph) * 80), 0, 0.04, 'triangle', 0.03);
    }

    if (job.phase === 'paint' && job.t >= PAINT_DUR) {
      job.phase = 'done';
      this.ctx.wear('hands', job.kind);
      feel('groom');
      this.ctx.say(['Unhas bonitas!']);
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
    job.tech.armL.rotation.x = 0;
    job.tech.body.rotation.x = 0;
    this.job = null;
    this.busyFlag = false;
    this.ctx.hold(false);
  }

  dispose(): void {
    if (this.job) this.endJob();
    this.fly.clear();
    if (this.group) {
      this.group.removeFromParent();
      this.group = null;
    }
  }

  debug(): Record<string, unknown> {
    return {
      stand: this.stand ? [+this.stand.x.toFixed(1), +this.stand.z.toFixed(1)] : null,
      busy: this.busyFlag,
      job: this.job ? { t: +this.job.t.toFixed(2), phase: this.job.phase, kind: this.job.kind } : null,
      minLevel: MANICURE_MIN_LEVEL,
      cost: MANICURE_COST,
    };
  }
}

/** Covered pink salonette: door, chair, manicure table, desk lamp, polish bottles — not an open kiosk. */
function buildManicureBooth(g: THREE.Group, hw: number, depth: number): void {
  const wall = mat(0xfff0f6);
  const trim = mat(0xf06595);
  const floor = mat(0xffe3ec);
  box(g, floor, hw * 2, 0.12, depth, 0, 0.06, -depth / 2);
  box(g, trim, hw * 2 + 0.08, 0.08, depth + 0.08, 0, 0.02, -depth / 2);
  // back + sides
  box(g, wall, hw * 2, 2.55, 0.18, 0, 1.3, -depth + 0.09);
  for (const s of [-1, 1]) {
    box(g, wall, 0.18, 2.55, depth, s * (hw - 0.09), 1.3, -depth / 2);
    box(g, trim, 0.2, 0.22, depth, s * (hw - 0.09), 0.22, -depth / 2);
  }
  // front wall with door (closed cabin, not fair awning)
  const doorW = 1.55;
  box(g, wall, hw - doorW / 2, 2.55, 0.18, -(hw + doorW / 2) / 2, 1.3, -0.09);
  box(g, wall, hw - doorW / 2, 2.55, 0.18, (hw + doorW / 2) / 2, 1.3, -0.09);
  for (const s of [-1, 1]) box(g, trim, 0.12, 2.25, 0.2, s * (doorW / 2 + 0.04), 1.15, -0.04);
  box(g, trim, doorW + 0.28, 0.35, 0.22, 0, 2.4, -0.04);
  // pitched roof
  const roof = mat(0xe64980);
  const rL = box(g, roof, hw + 0.3, 0.1, depth + 0.45, -hw / 2, 2.85, -depth / 2);
  rL.rotation.z = 0.15;
  const rR = box(g, roof, hw + 0.3, 0.1, depth + 0.45, hw / 2, 2.85, -depth / 2);
  rR.rotation.z = -0.15;
  box(g, wall, 0.28, 0.28, depth + 0.5, 0, 3.0, -depth / 2);
  box(g, mat(0xadb5bd), doorW + 0.2, 0.08, 0.32, 0, 0.04, 0.18);

  // salon chair (left): seat, back, armrests, chrome base
  const seatX = -0.85;
  const seatZ = -1.4;
  box(g, mat(0xffa8c8), 0.7, 0.12, 0.65, seatX, 0.42, seatZ);
  box(g, mat(0xff8ec5), 0.7, 0.7, 0.12, seatX, 0.85, seatZ + 0.28);
  for (const s of [-1, 1]) box(g, mat(0xffc9de), 0.08, 0.12, 0.5, seatX + s * 0.34, 0.55, seatZ - 0.05);
  cyl(g, mat(0xadb5bd), 0.08, 0.4, seatX, 0.2, seatZ);
  cyl(g, mat(0x868e96), 0.28, 0.06, seatX, 0.04, seatZ);

  // manicure table (right of chair, pad on top)
  const tx = 0.7;
  const tz = -1.85;
  box(g, mat(0xffffff), 1.5, 0.08, 0.7, tx, 0.78, tz);
  for (const s of [-1, 1]) {
    cyl(g, mat(0xced4da), 0.05, 0.72, tx + s * 0.55, 0.36, tz + 0.22);
    cyl(g, mat(0xced4da), 0.05, 0.72, tx + s * 0.55, 0.36, tz - 0.22);
  }
  box(g, mat(0xffc9c9), 0.9, 0.04, 0.45, tx - 0.15, 0.84, tz); // soft hand pad

  // desk lamp (emissive head)
  cyl(g, mat(0x495057), 0.03, 0.55, tx + 0.55, 1.1, tz - 0.15);
  const lampArm = box(g, mat(0x495057), 0.35, 0.04, 0.04, tx + 0.38, 1.38, tz - 0.15);
  void lampArm;
  const lampHead = new THREE.MeshStandardMaterial({
    color: 0xffe066,
    emissive: 0xffc078,
    emissiveIntensity: 1.4,
    roughness: 0.35,
  });
  box(g, lampHead, 0.28, 0.14, 0.28, tx + 0.2, 1.32, tz - 0.15);
  const glow = new THREE.PointLight(0xffe066, 1.4, 6, 1.8);
  glow.position.set(tx + 0.2, 1.25, tz);
  g.add(glow);

  // polish bottles on a tray — the colour story kids read from the street
  box(g, mat(0xe9ecef), 0.7, 0.04, 0.28, tx + 0.25, 0.86, tz + 0.22);
  NAILS.forEach((n, i) => {
    const x = tx - 0.05 + i * 0.22;
    cyl(g, mat(n.color), 0.055, 0.16, x, 0.96, tz + 0.22);
    cyl(g, mat(0xffffff), 0.045, 0.05, x, 1.07, tz + 0.22);
    // glossy blob on the bottle so the colour pops
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshStandardMaterial({
        color: n.color,
        roughness: 0.2,
        metalness: 0.4,
        emissive: new THREE.Color(n.color),
        emissiveIntensity: 0.35,
      }),
    );
    blob.position.set(x, 0.96, tz + 0.22);
    g.add(blob);
  });

  // mirror / sign disc on the back wall (no text — colour only)
  cyl(g, mat(0xffe066), 0.35, 0.06, 0, 1.85, -depth + 0.22);
  box(g, mat(0xff6b9d), 0.5, 0.08, 0.08, 0, 2.15, -depth + 0.2);

  // little plant
  cyl(g, mat(0x868e96), 0.1, 0.2, -hw + 0.45, 0.2, -depth + 0.5);
  cyl(g, mat(0x2f9e44), 0.16, 0.35, -hw + 0.45, 0.5, -depth + 0.5);
}

function dressManicurist(folk: Folk): void {
  // apron
  box(folk.body, mat(0xffffff), 0.42, 0.55, 0.04, 0, 1.15, -0.28);
  box(folk.body, mat(0xff6b9d), 0.42, 0.08, 0.05, 0, 1.4, -0.28);
  // brush in the right hand
  const brush = new THREE.Group();
  brush.userData.isBrush = true;
  brush.position.set(0, -0.58, 0);
  const handle = box(brush, mat(0xf8f0e3), 0.04, 0.22, 0.04, 0, 0, 0);
  void handle;
  const tip = box(brush, mat(0xff6b9d), 0.05, 0.08, 0.05, 0, -0.14, 0);
  tip.userData.isTip = true;
  folk.armR.add(brush);
}

export function createManicure(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
): Manicure {
  return new Manicure(scene, obstacles, rng, ctx, hero, siteOpts);
}
