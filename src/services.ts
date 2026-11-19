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
import { SUNGLASSES_KIND, registerWearable } from './items';
import {
  MASSAGE_COST,
  MASSEUSE_SPOT,
  MassageSession,
  buildMassageCabin,
  buildMassageTable,
  kneadPose,
  restPose,
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
import { createShoeShop } from './shoes';
import { TryOnShop, type TryOnItem } from './tryon';
import { createSalon, type Salon } from './salon';
import { createClothesShop } from './clothes';
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

/** Knitted beanie with stripes and a big pompom (sits low over the crown). */
function buildBeanie(): THREE.Group {
  const g = new THREE.Group();
  const knit = mat(0x15aabf);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), knit);
  dome.position.y = -0.24;
  dome.castShadow = true;
  g.add(dome);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.1, 18), mat(0xffffff));
  band.position.y = -0.22;
  g.add(band);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 18), mat(0xffffff));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = -0.04;
  g.add(stripe);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0xff6b6b));
  pom.position.y = 0.16;
  g.add(pom);
  return g;
}

/** Soft red beret, tilted, with a little stalk on top. */
function buildBeret(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xe03131);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 10), red);
  cap.scale.set(1.05, 0.32, 1.05);
  cap.position.set(0.05, -0.02, 0.02);
  cap.rotation.z = -0.18;
  cap.castShadow = true;
  g.add(cap);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 6), red);
  stalk.position.set(0.04, 0.1, 0.02);
  g.add(stalk);
  return g;
}

/** Tall purple magic top hat with a golden star on the band. */
function buildTopHat(): THREE.Group {
  const g = new THREE.Group();
  const felt = mat(0x7048e8);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 22), felt);
  brim.position.y = -0.01;
  brim.castShadow = true;
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.23, 0.44, 18), felt);
  crown.position.y = 0.22;
  crown.castShadow = true;
  g.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.24, 0.08, 18), mat(0xffd43b));
  band.position.y = 0.06;
  g.add(band);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mat(0xffd43b, 0.5));
  star.scale.set(1, 1, 0.35);
  star.position.set(0, 0.07, -0.25);
  g.add(star);
  return g;
}

/** Ring of colourful flowers with green leaves around the crown. */
function buildFlowerCrown(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xff6b9d, 0xffd43b, 0xffffff, 0x9775fa, 0xff922b, 0x4dabf7];
  const n = 9;
  const R = 0.27;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = new THREE.Group();
    f.position.set(Math.sin(a) * R, -0.08, Math.cos(a) * R);
    g.add(f);
    for (let k = 0; k < 5; k++) {
      const b = (k / 5) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(colors[i % colors.length]));
      p.position.set(Math.cos(b) * 0.04, Math.sin(b) * 0.04, 0);
      f.add(p);
    }
    f.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), mat(0xffa94d)));
    f.lookAt(Math.sin(a) * 2, -0.08, Math.cos(a) * 2);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), mat(0x51cf66));
    leaf.scale.set(1.6, 0.5, 0.6);
    leaf.position.set(Math.sin(a + 0.35) * R, -0.1, Math.cos(a + 0.35) * R);
    g.add(leaf);
  }
  return g;
}

/** Sign pictogram: a big magic top hat. */
function hatSign(): THREE.Object3D {
  const g = buildTopHat();
  g.scale.setScalar(1.9);
  g.position.y = -0.45;
  return g;
}

registerWearable(SUNGLASSES_KIND, { name: 'óculos de sol', slot: 'face', build: buildSunglasses });
registerWearable('srv-laco', { name: 'laço', slot: 'head', build: buildBow });
registerWearable('srv-chapeu', { name: 'chapéu', slot: 'head', build: buildSunHat });
registerWearable('srv-colar', { name: 'colar', slot: 'neck', build: buildBeadNecklace });
registerWearable('srv-gorro', { name: 'gorro', slot: 'head', build: buildBeanie });
registerWearable('srv-boina', { name: 'boina', slot: 'head', build: buildBeret });
registerWearable('srv-cartola', { name: 'cartola', slot: 'head', build: buildTopHat });
registerWearable('srv-coroa-flores', { name: 'coroa de flores', slot: 'head', build: buildFlowerCrown });

/** S05 — chapelaria: hats on mannequin heads along the walls, glasses + necklace on the island (tryon.ts). */
const HAT_SHOP: TryOnItem[] = [
  { id: 'srv-chapeu', name: 'chapéu de palha', slot: 'head', price: 4, display: buildSunHat },
  { id: 'srv-gorro', name: 'gorro com pompom', slot: 'head', price: 4, display: buildBeanie },
  { id: 'srv-boina', name: 'boina vermelha', slot: 'head', price: 4, display: buildBeret },
  { id: 'srv-cartola', name: 'cartola mágica', slot: 'head', price: 5, display: buildTopHat },
  { id: 'srv-coroa-flores', name: 'coroa de flores', slot: 'head', price: 5, display: buildFlowerCrown },
  { id: 'srv-laco', name: 'laço', slot: 'head', price: 3, display: buildBow },
  { id: SUNGLASSES_KIND, name: 'óculos de sol', slot: 'face', price: 4, plural: true, display: buildSunglasses },
  { id: 'srv-colar', name: 'colar', slot: 'neck', price: 4, display: buildBeadNecklace },
];

/** S06 massage: she lies on the table as long as she wants while the masseuse kneads (energy +1 every few s). */
interface MassageJob {
  session: MassageSession;
  stand: THREE.Vector3;
  tableAt: THREE.Vector3;
  tableY: number;
  clerk: Folk;
  clerkHome: THREE.Vector3;
  heading: number;
  site: { x: number; z: number; rot: number };
}

export class ServiceTown {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private shoeShop: TryOnShop | null = null;
  private hatShop: TryOnShop | null = null;
  private massage: MassageJob | null = null;
  /** The S06 table's session (one cabin per city); `ready` blocks a re-buy right after getting up. */
  private readonly massageSession = new MassageSession(() => this.endMassage());
  /** World stand of the S06 massage cabin (for QA / debug). */
  private massageStand: THREE.Vector3 | null = null;
  private massageRot = 0;
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
  private clothes: TryOnShop | null = null;
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
    this.shoeShop = createShoeShop(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.shoeShop.things);

    // S04 — walk-in clothes shop: dressed mannequins, try on, mirror, pay at the counter (tryon.ts)
    this.clothes = createClothesShop(scene, obstacles, rng, ctx, hero, this.siteOpts);
    this.things.push(...this.clothes.things);

    // S05 — covered accessories boutique with montra (hat / sunglasses / necklace / bow)
    this.hatShop = new TryOnShop(scene, obstacles, rng, ctx, hero, HAT_SHOP, {
      stand: 'head',
      wall: 0xfff0f6,
      trim: 0xcc5de8,
      floor: 0xf3d9fa,
      roof: 0x9c36b5,
      awning: [0xcc5de8, 0xffffff],
      sign: hatSign,
      clerk: { shirt: 0xcc5de8, pants: 0xffffff, dress: true, longHair: true },
    }, this.siteOpts);
    this.things.push(...this.hatShop.things);

    // S06 massage — covered SPA cabin; marquesa indoors, masseuse kneads her back
    this.massageBooth(scene, obstacles, rng);

    // S07 spa (termas) — Nuuk (gelo) · Vilnius / Moscovo (madeira): roupão + água quente; noutras cidades não spawna
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
      !!this.manicure?.busy ||
      !!this.spa?.busy ||
      !!this.salon?.busy ||
      !!this.clothes?.busy
    );
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
        if (this.fly.busy || this.busy || !this.massageSession.ready) return false;
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
        this.beginMassage(site, table, clerk, clerkHome, stand);
        return true;
      },
    });
  }

  private beginMassage(
    site: { x: number; z: number; rot: number },
    table: { lx: number; ly: number; lz: number; face: number },
    clerk: Folk,
    clerkHome: { x: number; z: number },
    stand: THREE.Vector3,
  ): void {
    if (this.massage) return;
    const tableAt = siteToWorld(site, table.lx, table.lz);
    this.ctx.hold(true);
    this.ctx.say(['Deita-te e descansa!']);
    const p = this.hero;
    p.position.x = tableAt.x;
    p.position.z = tableAt.z;
    p.heading = siteHeading(site, table.face);
    p.applyProneLie(table.ly);
    // masseuse at the head end of the table, facing the door: her smiling face toward the camera
    clerk.group.position.set(MASSEUSE_SPOT.x, 0, MASSEUSE_SPOT.z);
    clerk.group.rotation.y = MASSEUSE_SPOT.face;
    this.massageSession.start(); // mood +1 now; energy +1 every few seconds while she stays
    this.massage = {
      session: this.massageSession,
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
    job.session.stop();
    const p = this.hero;
    p.lyingY = null;
    p.prone = false;
    p.airborne = false;
    p.root.rotation.x = 0;
    p.root.rotation.z = 0;
    p.root.position.y = 0;
    // stand up at the cabin door (unless something else already took her away, e.g. Casa)
    if (Math.hypot(p.position.x - job.tableAt.x, p.position.z - job.tableAt.z) < 1.5) {
      p.position.set(job.stand.x, 0, job.stand.z);
      p.heading = job.heading + Math.PI; // back to the cabin, facing the street: ready to walk away
    }
    job.clerk.group.position.copy(job.clerkHome);
    job.clerk.group.rotation.y = Math.PI;
    restPose(job.clerk);
    this.massage = null;
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
    this.shoeShop?.update(dt);
    this.clothes?.update(dt);
    this.hatShop?.update(dt);
    const job = this.massage;
    if (!job) return;
    // as long as she wants: energy ticks; any key / tap ends it (endMassage via the session callback)
    if (!job.session.update(dt)) return;
    // kneading: leaning in at the head end, both hands pressing her shoulders in turn
    kneadPose(job.clerk, job.session.t);
    // keep her lying on the pad (after player.update — hold() pauses earlier in the frame)
    const p = this.hero;
    p.position.x = job.tableAt.x;
    p.position.z = job.tableAt.z;
    p.applyProneLie(job.tableY);
  }

  dispose(): void {
    if (this.massage) this.endMassage();
    if (this.clinic) this.endClinic();
    this.shoeShop?.dispose();
    this.shoeShop = null;
    this.hatShop?.dispose();
    this.hatShop = null;
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

  /** Walk-in shop interiors (sapataria, chapelaria, loja de roupa): nothing may spawn inside them. */
  zones(): Obstacle[] {
    return [this.shoeShop?.zone(), this.hatShop?.zone(), this.clothes?.zone(), this.spa?.zone()].filter((z): z is Obstacle => !!z);
  }

  debug(): Record<string, unknown> {
    return {
      busy: this.busy,
      massage: this.massage
        ? { t: +this.massage.session.t.toFixed(2), ticks: this.massage.session.ticks, stand: this.massageStand ? [+this.massageStand.x.toFixed(1), +this.massageStand.z.toFixed(1)] : null }
        : null,
      stand: this.massageStand ? [+this.massageStand.x.toFixed(1), +this.massageStand.z.toFixed(1)] : null,
      table: this.massage ? [+this.massage.tableAt.x.toFixed(1), +this.massage.tableAt.z.toFixed(1)] : null,
      massageRot: +this.massageRot.toFixed(2),
      clinic: this.clinicStand ? [+this.clinicStand.x.toFixed(1), +this.clinicStand.z.toFixed(1)] : null,
      clinicRot: +this.clinicRot.toFixed(2),
      consulting: !!this.clinic,
      shoes: this.shoeShop?.debug() ?? null,
      hats: this.hatShop?.debug() ?? null,
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
