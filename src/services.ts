import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import {
  CLINIC_COST,
  HeartCheck,
  attachStethoscope,
  buildClinicCabin,
  buildExamBed,
} from './clinic';
import type { GameCtx } from './gamectx';
import { SUNGLASSES_KIND, registerWearable, wearableDef } from './items';
import {
  MASSAGE_COST,
  MASSAGE_DUR,
  buildMassageCabin,
  buildMassageTable,
} from './massage';
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
import {
  SHOE_COST,
  SHOES,
  buildShoeCabin,
  type ShoeKind,
} from './shoes';
import { createSalon, type Salon } from './salon';
import { createClothesShop, type ClothesShop } from './clothes';
import { createManicure, type Manicure } from './manicure';
import { createPhotographer, type Photographer } from './photographer';
import { createSpa, type Spa } from './spa';
import { buildFolk, pick, HAIRS, SKINS, type Folk } from './venue';
import { mulberry32, type Interactable, type Obstacle } from './world';

/**
 * Fase 4 — serviços pagos: salão (corte+tintura), sapataria, roupa com cabine, acessórios,
 * massagem, médico, manicure coberta (desde Madrid), fotógrafo, spa (Nuuk/Vilnius/Moscovo).
 */

/** Kids-readable sunglasses: chunky frame + bright blue lenses + temples. */
function buildSunglasses(): THREE.Group {
  const g = new THREE.Group();
  const frame = mat(0x212529);
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x1c7ed6,
    roughness: 0.12,
    metalness: 0.4,
    emissive: 0x1864ab,
    emissiveIntensity: 0.35,
  });
  for (const s of [-1, 1]) {
    // thick oval frames
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 18), frame);
    rim.position.set(s * 0.14, 0.02, 0);
    rim.scale.set(1.15, 1, 1);
    g.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 16), lensMat);
    lens.position.set(s * 0.14, 0.02, 0.01);
    lens.scale.set(1.15, 1, 1);
    g.add(lens);
    const arm = box(g, frame, 0.025, 0.025, 0.28, s * 0.26, 0.04, 0.12);
    arm.rotation.y = s * 0.4;
  }
  box(g, frame, 0.08, 0.025, 0.025, 0, 0.02, 0); // bridge
  return g;
}

/** Classic hair bow: two ribbon loops + knot + hanging tails. */
function buildBow(): THREE.Group {
  const g = new THREE.Group();
  const pink = mat(0xff5aa8);
  const deep = mat(0xe64980);
  g.position.set(0.24, 0.14, -0.02);
  for (const s of [-1, 1]) {
    // flat ribbon loop (torus segment reads as a laço, not a cube)
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 8, 14, Math.PI * 1.6), pink);
    loop.position.set(s * 0.1, 0.03, 0);
    loop.rotation.set(s * 0.5, Math.PI / 2, s * 0.6);
    g.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), deep);
  knot.scale.set(0.85, 0.9, 0.7);
  g.add(knot);
  for (const s of [-1, 1]) {
    const tail = box(g, pink, 0.06, 0.22, 0.025, s * 0.04, -0.15, 0.02);
    tail.rotation.z = s * 0.45;
  }
  return g;
}

/** Bright sun hat with brim, crown and flower. */
function buildSunHat(): THREE.Group {
  const g = new THREE.Group();
  const straw = mat(0xffd43b);
  const band = mat(0xff5aa8);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.03, 24), straw);
  brim.position.y = -0.02;
  brim.castShadow = true;
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.2, 18), straw);
  crown.position.y = 0.1;
  g.add(crown);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 18), straw);
  top.position.y = 0.21;
  g.add(top);
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 18, 1, true), band);
  ribbon.position.y = 0.02;
  g.add(ribbon);
  const f = new THREE.Group();
  f.position.set(0.22, 0.04, -0.2);
  g.add(f);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0xffffff));
    p.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0);
    p.scale.z = 0.45;
    f.add(p);
  }
  f.add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(0xff922b)));
  return g;
}

/** Bead necklace with a heart pendant — never a bare red torus. */
function buildBeadNecklace(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff3b3b, 0xff922b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8];
  const ring = new THREE.Group();
  ring.rotation.x = -0.4;
  ring.position.set(0, -0.04, -0.02);
  g.add(ring);
  const n = 16;
  const R = 0.22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), mat(colors[i % colors.length]));
    bead.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    ring.add(bead);
  }
  const heart = new THREE.Group();
  heart.position.set(0, -0.06, -R - 0.02);
  ring.add(heart);
  const pink = mat(0xff5aa8);
  for (const s of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), pink);
    lobe.position.set(s * 0.03, 0.02, 0);
    heart.add(lobe);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.08, 8), pink);
  tip.position.set(0, -0.04, 0);
  tip.rotation.x = Math.PI;
  heart.add(tip);
  return g;
}

registerWearable(SUNGLASSES_KIND, { name: 'óculos de sol', slot: 'face', build: buildSunglasses });
registerWearable('srv-laco', { name: 'laço', slot: 'head', build: buildBow });
registerWearable('srv-chapeu', { name: 'chapéu', slot: 'head', build: buildSunHat });
registerWearable('srv-colar', { name: 'colar', slot: 'neck', build: buildBeadNecklace });

const ACCESSORIES: { id: string; name: string; slot: 'head' | 'face' | 'neck' }[] = [
  { id: 'srv-chapeu', name: 'chapéu', slot: 'head' },
  { id: SUNGLASSES_KIND, name: 'óculos de sol', slot: 'face' },
  { id: 'srv-colar', name: 'colar', slot: 'neck' },
  { id: 'srv-laco', name: 'laço', slot: 'head' },
];

/** S06 scripted massage: she lies face-down while the masseuse kneads her back (~10 s). */
interface MassageJob {
  t: number;
  dur: number;
  stand: THREE.Vector3;
  tableAt: THREE.Vector3;
  tableY: number;
  clerk: Folk;
  clerkHome: THREE.Vector3;
  heading: number;
  site: { x: number; z: number; rot: number };
}

/** S03 fitting: sit on the stool → new shoes appear on her feet → short show-off walk. */
interface ShoeJob {
  t: number;
  phase: 'sit' | 'wear' | 'show' | 'done';
  stand: THREE.Vector3;
  stoolAt: THREE.Vector3;
  stoolY: number;
  heading: number;
  site: { x: number; z: number; rot: number };
  kind: ShoeKind;
  name: string;
  clerk: Folk;
  clerkHome: THREE.Vector3;
}

export class ServiceTown {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private shoeIdx = 0;
  private accIdx = 0;
  private accStand: THREE.Vector3 | null = null;
  private massage: MassageJob | null = null;
  private shoeFit: ShoeJob | null = null;
  /** World stand of the S06 massage cabin (for QA / debug). */
  private massageStand: THREE.Vector3 | null = null;
  private massageRot = 0;
  private shoeStand: THREE.Vector3 | null = null;
  private shoeSite: { x: number; z: number } | null = null;
  private shoeRot = 0;
  private clinic: {
    check: HeartCheck;
    stand: THREE.Vector3;
    bedAt: THREE.Vector3;
    heading: number;
    site: { x: number; z: number; rot: number };
  } | null = null;
  private clinicStand: THREE.Vector3 | null = null;
  private clinicRot = 0; // used in debug()
  private photographer: Photographer | null = null;
  private manicure: Manicure | null = null;
  private spa: Spa | null = null;
  private salon: Salon | null = null;
  private clothes: ClothesShop | null = null;
  private readonly siteOpts: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void };

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    private readonly hero: Character,
    clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void,
  ) {
    this.siteOpts = { apron: 4, clearLamps };
    this.fly = new Flyers(scene);

    // S01+S02 — covered hair salon (cut + dye)
    this.salon = createSalon(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.salon.things);

    // S03 — covered shoe shop (montra + fitting stool); shoes appear on her feet
    this.addShoeShop(scene, obstacles, rng);

    // S04 — covered clothes shop with fitting curtain
    this.clothes = createClothesShop(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.clothes.things);

    // S05 — covered accessories boutique with montra (hat / sunglasses / necklace / bow)
    this.addAccessoryShop(scene, obstacles, rng);

    // S06 massage — covered SPA cabin; marquesa indoors, masseuse kneads her back
    this.massageBooth(scene, obstacles, rng);

    // S07 spa real — Nuuk (gelo) · Vilnius / Moscovo (cabina de vapor); noutras cidades não spawna
    this.spa = createSpa(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.spa.things);
    // S08 médico — consultório com maca (não quiosque/barraca)
    this.addClinic(scene, obstacles, rng);
    // S09 manicure — covered salonette (only from 3rd city / level ≥ 2)
    this.manicure = createManicure(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.manicure.things);
    // S10 — real photographer: asks permission → flash → maximised portrait
    this.photographer = createPhotographer(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.photographer.things);
  }

  private hand = () => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  private get busy(): boolean {
    return (
      !!this.massage ||
      !!this.clinic ||
      !!this.shoeFit ||
      !!this.manicure?.busy ||
      !!this.spa?.busy ||
      !!this.salon?.busy ||
      !!this.clothes?.busy
    );
  }

  /** Covered lilac boutique: glass montra with hat / glasses / necklace / bow on stands. */
  private buildAccessoryCabin(g: THREE.Group, hw: number, depth: number): void {
    const wall = mat(0xfff0f6);
    const trim = mat(0xcc5de8);
    const floor = mat(0xf3d9fa);
    box(g, floor, hw * 2, 0.14, depth, 0, 0.07, -depth / 2);
    box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);
    box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
    for (const s of [-1, 1]) {
      box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
      box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
    }
    // front wall with door + big glass montra to the left
    const doorW = 1.6;
    box(g, wall, hw - doorW / 2, 2.7, 0.2, -(hw + doorW / 2) / 2, 1.4, -0.1);
    box(g, wall, hw - doorW / 2, 2.7, 0.2, (hw + doorW / 2) / 2, 1.4, -0.1);
    for (const s of [-1, 1]) box(g, trim, 0.12, 2.35, 0.22, s * (doorW / 2 + 0.04), 1.2, -0.05);
    box(g, trim, doorW + 0.3, 0.35, 0.24, 0, 2.45, -0.05);
    // glass shop window (left of door) — accessories visible from the street
    const glass = new THREE.MeshStandardMaterial({
      color: 0xe7f5ff,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const winX = -1.35;
    box(g, mat(0xffffff), 1.7, 1.55, 0.08, winX, 1.45, -0.02);
    box(g, glass, 1.55, 1.4, 0.06, winX, 1.45, 0.02);
    // pitched purple roof
    const roof = mat(0x9c36b5);
    const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.0, -depth / 2);
    rL.rotation.z = 0.16;
    const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.0, -depth / 2);
    rR.rotation.z = -0.16;
    box(g, mat(0xfff0f6), 0.3, 0.3, depth + 0.55, 0, 3.18, -depth / 2);
    // sparkling badge on the lintel (no text)
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), mat(0xffd43b, 0.4));
    star.position.set(0, 2.48, 0.14);
    g.add(star);
    // montra shelf + four accessories on little stands (behind the glass)
    box(g, mat(0xe599f7), 1.5, 0.08, 0.45, winX, 0.85, -0.55);
    const display = [
      { build: buildSunHat, x: -1.9 },
      { build: buildSunglasses, x: -1.5 },
      { build: buildBeadNecklace, x: -1.15 },
      { build: buildBow, x: -0.8 },
    ];
    for (const d of display) {
      const stick = box(g, mat(0xadb5bd), 0.04, 0.35, 0.04, d.x, 1.05, -0.5);
      void stick;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(0xffdbac));
      head.position.set(d.x, 1.28, -0.5);
      g.add(head);
      const item = d.build();
      item.scale.setScalar(0.45);
      item.position.set(d.x, 1.38, -0.5);
      g.add(item);
    }
    // counter inside
    box(g, mat(0xfff3d6), 1.6, 0.12, 0.7, 1.1, 1.0, -1.5);
    box(g, wall, 1.6, 0.9, 0.55, 1.1, 0.5, -1.5);
    box(g, mat(0xadb5bd), doorW + 0.2, 0.08, 0.35, 0, 0.04, 0.2);
  }

  /** S05 — covered accessories shop; pay → item flies onto her + "Que giro!". */
  private addAccessoryShop(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): void {
    const hw = 2.5;
    const depth = 3.8;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...this.siteOpts });
    if (!site) return;
    const g = siteGroup(scene, site);
    this.buildAccessoryCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, 0.3, 1.9, -1.9, -1.15, 1.05));

    const clerk = buildFolk({
      shirt: 0xcc5de8,
      pants: 0xffffff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    clerk.group.position.set(1.1, 0, -2.4);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);

    const cost = 4;
    const stand = siteToWorld(site, -0.6, 1.15);
    const payTo = siteToWorld(site, 1.1, -1.5, 1.1);
    this.accStand = stand.clone();

    this.things.push({
      object: g,
      position: stand,
      radius: 2.4,
      requiresClick: true,
      interact: () => {
        if (this.fly.busy || this.busy) return false;
        // cycle accessories; skip one already worn in that slot when another is free.
        // Sunglasses stay in the bag: do not sell a second pair.
        const worn = this.ctx.worn();
        let pickAcc = ACCESSORIES[this.accIdx % ACCESSORIES.length];
        let pickN = 0;
        let found = false;
        for (let n = 0; n < ACCESSORIES.length; n++) {
          const a = ACCESSORIES[(this.accIdx + n) % ACCESSORIES.length];
          if (a.id === SUNGLASSES_KIND && this.ctx.owns(SUNGLASSES_KIND)) continue;
          if (worn[a.slot] !== a.id) {
            pickAcc = a;
            pickN = n;
            found = true;
            break;
          }
        }
        if (!found) {
          clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say(['Já tens estes adereços.']);
          return false;
        }
        if (this.ctx.coins() < cost) {
          clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say([`Precisas de ${cost} moedas.`]);
          tone(196, 0, 0.3, 'sine', 0.13);
          return false;
        }
        this.accIdx = this.accIdx + pickN + 1;
        this.ctx.addCoins(-cost);
        clerk.head.rotation.x = 0.25;
        for (let i = 0; i < Math.min(cost, 4); i++) {
          this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
        }
        const def = wearableDef(pickAcc.id);
        const preview = def ? def.build() : new THREE.Group();
        preview.scale.setScalar(0.55);
        const slotY = pickAcc.slot === 'neck' ? 1.35 : pickAcc.slot === 'face' ? 1.55 : 1.85;
        const headAt = () => new THREE.Vector3(this.ctx.player.x, slotY, this.ctx.player.z);
        this.fly.send(preview, payTo.clone().setY(1.3), headAt, 0.6, 0.2, () => {
          this.ctx.wear(pickAcc.slot, pickAcc.id);
          feel('shop');
          this.ctx.say(['Que giro!', `Um ${pickAcc.name}!`]);
          [659, 784, 988].forEach((f, i) => tone(f, i * 0.08, 0.16, 'sine', 0.05));
        });
        return true;
      },
    });
  }

  /** S03 — covered sapataria with glass montra of recognisable shoes; pay → sit → wear feet → show walk. */
  private addShoeShop(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): void {
    const hw = 2.6;
    const depth = 4.2;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...this.siteOpts });
    if (!site) return;
    const g = siteGroup(scene, site);
    const cabin = buildShoeCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, 0.6, 1.8, -1.75, -1.05, 0.95)); // counter
    obstacles.push(siteBox(site, cabin.stool.lx - 0.35, cabin.stool.lx + 0.35, cabin.stool.lz - 0.35, cabin.stool.lz + 0.35, 0.55));

    const clerkHome = { x: 1.25, z: -2.4 };
    const clerk = buildFolk({
      shirt: 0xe8590c,
      pants: 0x343a40,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      cap: 0x862e9c,
    });
    clerk.group.position.set(clerkHome.x, 0, clerkHome.z);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);

    const stand = siteToWorld(site, -0.9, 1.2);
    const payTo = siteToWorld(site, 1.2, -1.4, 1.0);
    this.shoeStand = stand.clone();
    this.shoeSite = { x: site.x, z: site.z };
    this.shoeRot = site.rot;

    this.things.push({
      object: g,
      position: stand,
      radius: 2.5,
      requiresClick: true,
      interact: () => {
        if (this.fly.busy || this.busy) return false;
        if (this.ctx.coins() < SHOE_COST) {
          clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say([`Os sapatos são ${SHOE_COST} moedas.`]);
          tone(196, 0, 0.3, 'sine', 0.13);
          return false;
        }
        this.ctx.addCoins(-SHOE_COST);
        for (let i = 0; i < Math.min(SHOE_COST, 4); i++) {
          this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
        }
        const pickShoe = SHOES[this.shoeIdx++ % SHOES.length];
        this.beginShoeFit(site, cabin.stool, clerk, clerkHome, stand, pickShoe.id, pickShoe.name);
        return true;
      },
    });
  }

  private beginShoeFit(
    site: { x: number; z: number; rot: number },
    stool: { lx: number; ly: number; lz: number; face: number },
    clerk: Folk,
    clerkHome: { x: number; z: number },
    stand: THREE.Vector3,
    kind: ShoeKind,
    name: string,
  ): void {
    if (this.shoeFit) return;
    const stoolAt = siteToWorld(site, stool.lx, stool.lz);
    this.ctx.hold(true);
    this.ctx.say(['Senta-te — vamos calçar!']);
    const p = this.hero;
    p.position.set(stoolAt.x, 0, stoolAt.z);
    p.heading = siteHeading(site, stool.face);
    p.sitting = true;
    p.root.position.y = stool.ly;
    clerk.group.position.set(stool.lx + 0.7, 0, stool.lz - 0.15);
    clerk.group.rotation.y = -Math.PI / 2;
    this.shoeFit = {
      t: 0,
      phase: 'sit',
      stand: stand.clone(),
      stoolAt,
      stoolY: stool.ly,
      heading: site.rot,
      site,
      kind,
      name,
      clerk,
      clerkHome: new THREE.Vector3(clerkHome.x, 0, clerkHome.z),
    };
    tone(392, 0, 0.12, 'sine', 0.04);
  }

  private endShoeFit(): void {
    const job = this.shoeFit;
    if (!job) return;
    const p = this.hero;
    p.sitting = false;
    p.root.position.y = 0;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.heading;
    job.clerk.group.position.copy(job.clerkHome);
    job.clerk.group.rotation.y = Math.PI;
    job.clerk.armR.rotation.x = 0;
    job.clerk.armL.rotation.x = 0;
    this.shoeFit = null;
    this.ctx.hold(false);
  }

  /** S08 — white/green consultório with maca; she lies down, doctor listens (~3 s), then "Estás bem!". */
  private addClinic(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): void {
    const hw = 2.6;
    const depth = 4.2;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...this.siteOpts });
    if (!site) return;
    const g = siteGroup(scene, site);
    buildClinicCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));

    const bed = buildExamBed(g, 0, -2.0);
    obstacles.push(siteBox(site, -1.0, 1.0, -2.5, -1.5, 0.75));

    const docHome = { x: 1.45, z: -3.1 };
    const docBeside = { x: 0.1, z: -1.25 };
    const doctor = buildFolk({
      shirt: 0xffffff,
      pants: 0x343a40,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      cap: 0x2f9e44,
    });
    doctor.group.position.set(docHome.x, 0, docHome.z);
    doctor.group.rotation.y = Math.PI;
    g.add(doctor.group);
    const tip = attachStethoscope(doctor);
    const check = new HeartCheck(doctor, tip, docHome, docBeside);

    const stand = siteToWorld(site, 0, 1.25);
    const payTo = siteToWorld(site, docHome.x, docHome.z, 1.1);
    this.clinicStand = stand.clone();
    this.clinicRot = site.rot;

    this.things.push({
      object: g,
      position: stand,
      radius: 2.4,
      requiresClick: true,
      interact: () => {
        if (this.fly.busy || this.busy) return false;
        if (this.ctx.coins() < CLINIC_COST) {
          doctor.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say([`A consulta são ${CLINIC_COST} moedas.`]);
          tone(196, 0, 0.3, 'sine', 0.13);
          return false;
        }
        this.ctx.addCoins(-CLINIC_COST);
        for (let i = 0; i < Math.min(CLINIC_COST, 3); i++) {
          this.fly.send(coinMesh(), this.hand(), payTo, 0.45, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
        }
        this.beginClinic(check, site, bed, stand);
        return true;
      },
    });

    // keep a live updater even when idle (breathing) — stored via check ref on first consult;
    // also run idle updates by holding the check on a stub slot
    this._clinicIdle = check;
  }

  private _clinicIdle: HeartCheck | null = null;

  private beginClinic(
    check: HeartCheck,
    site: { x: number; z: number; rot: number },
    bed: { lx: number; ly: number; lz: number; face: number },
    stand: THREE.Vector3,
  ): void {
    if (this.clinic) return;
    const bedAt = siteToWorld(site, bed.lx, bed.lz);
    const heading = siteHeading(site, bed.face);
    this.ctx.hold(true);
    this.ctx.say(['Deita-te na maca…', 'Vou ouvir o teu coração.']);
    const p = this.hero;
    p.position.set(bedAt.x, 0, bedAt.z);
    p.heading = heading;
    p.lyingY = bed.ly;
    p.airborne = true;
    const chest = siteToWorld(site, bed.lx, bed.lz, bed.ly + 0.35);
    check.start(chest, () => {
      feel('doctor');
      this.ctx.say(['Estás bem!']);
    });
    this.clinic = { check, stand: stand.clone(), bedAt, heading, site };
  }

  private endClinic(): void {
    const job = this.clinic;
    if (!job) return;
    const p = this.hero;
    p.lyingY = null;
    p.airborne = false;
    p.root.rotation.x = 0;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.site.rot; // face the clinic front
    job.check.reset();
    this.clinic = null;
    this.ctx.hold(false);
  }

  /** Covered SPA cabin: marquesa indoors under the roof (apron kept clear of street lamps). */
  private massageBooth(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number): void {
    const hw = 2.6;
    const depth = 4.4;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...this.siteOpts });
    if (!site) return;
    const g = siteGroup(scene, site);
    buildMassageCabin(g, hw, depth);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));

    const table = buildMassageTable(g, 0, -2.15);
    obstacles.push(siteBox(site, -0.75, 0.75, -2.15 - 1.05, -2.15 + 1.05, 0.9));

    const clerkHome = { x: 1.4, z: -3.2 };
    const clerkBeside = { x: -0.95, z: -2.35 };
    const clerk = buildFolk({
      shirt: 0x69db7c,
      pants: 0xffffff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    clerk.group.position.set(clerkHome.x, 0, clerkHome.z);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);

    const stand = siteToWorld(site, 0, 1.25);
    const payTo = siteToWorld(site, clerkHome.x, clerkHome.z, 1.1);
    this.massageStand = stand.clone();
    this.massageRot = site.rot;

    this.things.push({
      object: g,
      position: stand,
      radius: 2.6,
      requiresClick: true,
      interact: () => {
        if (this.fly.busy || this.busy) return false;
        if (this.ctx.coins() < MASSAGE_COST) {
          clerk.head.rotation.y = Math.sin(performance.now() * 0.02) * 0.5;
          this.ctx.say([`Precisas de ${MASSAGE_COST} moedas.`]);
          tone(196, 0, 0.3, 'sine', 0.13);
          return false;
        }
        this.ctx.addCoins(-MASSAGE_COST);
        for (let i = 0; i < Math.min(MASSAGE_COST, 4); i++) {
          this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
        }
        this.beginMassage(site, table, clerk, clerkHome, clerkBeside, stand);
        return true;
      },
    });
  }

  private beginMassage(
    site: { x: number; z: number; rot: number },
    table: { lx: number; ly: number; lz: number; face: number },
    clerk: Folk,
    clerkHome: { x: number; z: number },
    clerkBeside: { x: number; z: number },
    stand: THREE.Vector3,
  ): void {
    if (this.massage) return;
    const tableAt = siteToWorld(site, table.lx, table.lz);
    this.ctx.hold(true);
    this.ctx.say(['Deita-te — massagem nas costas!']);
    const p = this.hero;
    p.position.x = tableAt.x;
    p.position.z = tableAt.z;
    p.heading = siteHeading(site, table.face);
    p.applyProneLie(table.ly);
    // masseuse stands beside the table, leaning over her back
    clerk.group.position.set(clerkBeside.x, 0, clerkBeside.z);
    clerk.group.rotation.y = Math.PI / 2;
    this.massage = {
      t: 0,
      dur: MASSAGE_DUR,
      stand: stand.clone(),
      tableAt,
      tableY: table.ly,
      clerk,
      clerkHome: new THREE.Vector3(clerkHome.x, 0, clerkHome.z),
      heading: site.rot,
      site,
    };
    tone(330, 0, 0.15, 'sine', 0.04);
  }

  private endMassage(): void {
    const job = this.massage;
    if (!job) return;
    const p = this.hero;
    p.lyingY = null;
    p.prone = false;
    p.airborne = false;
    p.root.rotation.x = 0;
    p.root.rotation.z = 0;
    p.position.set(job.stand.x, 0, job.stand.z);
    p.heading = job.heading; // face the cabin door
    job.clerk.group.position.copy(job.clerkHome);
    job.clerk.group.rotation.y = Math.PI;
    job.clerk.armR.rotation.x = 0;
    job.clerk.armL.rotation.x = 0;
    job.clerk.armR.rotation.z = 0;
    job.clerk.armL.rotation.z = 0;
    job.clerk.body.rotation.x = 0;
    this.massage = null;
    feel('massage');
    this.ctx.say(['Que bem!']);
    [392, 523, 659].forEach((f, i) => tone(f, i * 0.1, 0.18, 'sine', 0.05));
    this.ctx.hold(false);
  }

  update(dt: number): void {
    this.fly.update(dt);
    this.salon?.update(dt);
    const consult = this.clinic;
    if (consult) {
      consult.check.update(dt);
      this.hero.position.set(consult.bedAt.x, 0.72, consult.bedAt.z);
      this.hero.lyingY = 0.72;
      if (consult.check.finished) this.endClinic();
    } else {
      this._clinicIdle?.update(dt);
    }
    this.updateShoeFit(dt);
    const job = this.massage;
    if (!job) return;
    job.t += dt;
    // kneading: lean over the table, both hands press down on her back (not arms in the air)
    const ph = job.t * 5.2;
    const pump = Math.abs(Math.sin(ph));
    const pump2 = Math.abs(Math.sin(ph + 1.05));
    const c = job.clerk;
    c.armR.rotation.x = -1.05 - pump * 0.4;
    c.armL.rotation.x = -1.05 - pump2 * 0.4;
    c.armR.rotation.z = 0.55 + Math.sin(ph * 0.7) * 0.15;
    c.armL.rotation.z = -0.55 - Math.sin(ph * 0.7 + 0.5) * 0.15;
    c.body.rotation.x = -0.45 - pump * 0.1;
    // keep her face-down on the pad (after player.update — hold() pauses earlier in the frame)
    const p = this.hero;
    p.position.x = job.tableAt.x;
    p.position.z = job.tableAt.z;
    p.applyProneLie(job.tableY);
    if (job.t >= job.dur) this.endMassage();
  }

  private updateShoeFit(dt: number): void {
    const job = this.shoeFit;
    if (!job) return;
    job.t += dt;
    const p = this.hero;
    const c = job.clerk;
    if (job.phase === 'sit') {
      // keep her on the stool; clerk leans in to lace
      p.sitting = true;
      p.position.set(job.stoolAt.x, 0, job.stoolAt.z);
      p.root.position.y = job.stoolY;
      c.armR.rotation.x = -1.1 + Math.sin(job.t * 8) * 0.25;
      c.armL.rotation.x = -1.0 + Math.sin(job.t * 8 + 1) * 0.2;
      if (job.t >= 1.4) {
        job.phase = 'wear';
        job.t = 0;
        this.ctx.wear('feet', job.kind);
        feel('shop');
        // say here (not at show) so the speech queue is free — "Sapatos novos!" must be heard
        this.ctx.say(['Sapatos novos!']);
        tone(659, 0, 0.12, 'triangle', 0.06);
        tone(880, 0.1, 0.15, 'triangle', 0.05);
      }
      return;
    }
    if (job.phase === 'wear') {
      p.sitting = true;
      p.position.set(job.stoolAt.x, 0, job.stoolAt.z);
      p.root.position.y = job.stoolY;
      if (job.t >= 0.7) {
        job.phase = 'show';
        job.t = 0;
        p.sitting = false;
        p.root.position.y = 0;
        // step to the door apron and show the new shoes with a short walk
        p.position.set(job.stand.x, 0, job.stand.z);
        p.heading = job.heading;
        this.ctx.walkAnim(2.8);
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.16, 'sine', 0.05));
      }
      return;
    }
    if (job.phase === 'show') {
      // brief strut on the apron
      this.ctx.walkAnim(2.6);
      if (job.t >= 1.6) {
        job.phase = 'done';
        this.ctx.walkAnim(0);
        this.endShoeFit();
      }
    }
  }

  dispose(): void {
    if (this.massage) this.endMassage();
    if (this.clinic) this.endClinic();
    if (this.shoeFit) this.endShoeFit();
    this.salon?.dispose();
    this.salon = null;
    this.clothes?.dispose();
    this.clothes = null;
    this.manicure?.dispose();
    this.manicure = null;
    this.spa?.dispose();
    this.spa = null;
    this.photographer?.dispose();
    this.photographer = null;
    this.fly.clear();
  }

  debug(): Record<string, unknown> {
    return {
      busy: this.busy,
      massage: this.massage
        ? { t: +this.massage.t.toFixed(2), stand: this.massageStand ? [+this.massageStand.x.toFixed(1), +this.massageStand.z.toFixed(1)] : null }
        : null,
      stand: this.massageStand ? [+this.massageStand.x.toFixed(1), +this.massageStand.z.toFixed(1)] : null,
      table: this.massage ? [+this.massage.tableAt.x.toFixed(1), +this.massage.tableAt.z.toFixed(1)] : null,
      massageRot: +this.massageRot.toFixed(2),
      clinic: this.clinicStand ? [+this.clinicStand.x.toFixed(1), +this.clinicStand.z.toFixed(1)] : null,
      clinicRot: +this.clinicRot.toFixed(2),
      consulting: !!this.clinic,
      shoe: this.shoeStand ? [+this.shoeStand.x.toFixed(1), +this.shoeStand.z.toFixed(1)] : null,
      shoeSite: this.shoeSite ? [+this.shoeSite.x.toFixed(1), +this.shoeSite.z.toFixed(1)] : null,
      shoeRot: +this.shoeRot.toFixed(2),
      shoeFit: this.shoeFit ? { t: +this.shoeFit.t.toFixed(2), phase: this.shoeFit.phase, kind: this.shoeFit.kind } : null,
      accessories: this.accStand ? [+this.accStand.x.toFixed(1), +this.accStand.z.toFixed(1)] : null,
      salon: this.salon?.debug() ?? null,
      clothes: this.clothes?.debug() ?? null,
      manicure: this.manicure?.debug() ?? null,
      photographer: this.photographer?.debug() ?? null,
      spa: this.spa?.debug() ?? null,
    };
  }
}

export function createServices(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  seed: number,
  ctx: GameCtx,
  hero: Character,
  clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void,
): ServiceTown {
  return new ServiceTown(scene, obstacles, mulberry32(seed * 97 + 13), ctx, hero, clearLamps);
}
