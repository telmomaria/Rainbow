import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { GameCtx } from './gamectx';
import { registerItem, registerWearable } from './items';
import {
  Flyers,
  GEM_COLORS,
  box,
  coinMesh,
  cyl,
  gemMesh,
  mat,
  openSpot,
  roadsideSite,
  siteBox,
  siteGroup,
  siteToWorld,
} from './places';
import { buildFolk, pick, HAIRS, SKINS, type Folk } from './venue';
import type { Interactable, Obstacle } from './world';

/**
 * Uses for the jewels (rule R18: they are a second currency — picked up in the street, kept, and spent here).
 *
 *  - Banco (J1 / G30): a jewel for 8 coins — covered bank building (not a fair kiosk).
 *  - Joalheiro (J3): three jewels make a necklace, then a ring, then a crown — covered jeweller with montra.
 *  - Baú do tesouro (J4 / G09): in the most out-of-the-way spot of each city; a jewel is the key; 15 coins inside.
 *  - Escudo (J6): tapping the jewel in her bag holds it up — for one minute the creatures run from its shine.
 *
 * Landmark diamonds are never spent here (rule FIM3): `ctx.jewels()` only counts street jewels.
 */

interface JewelShop {
  group: THREE.Group;
  clerk: Folk;
  stand: THREE.Vector3;
  counter: THREE.Vector3;
  no(): void;
  yes(): void;
  update(dt: number): void;
}

export const BANK_COINS = 8;
export const JEWELLER_COST = 3;
export const CHEST_COINS = 15;
export const SHIELD_S = 60;
/** The bag entry for her jewels (tap = shield). Its count comes from save.jewels, not from save.bag. */
export const JEWEL_ITEM = 'joia';

/* ------------------------------------------------------------------ what the jeweller makes */

function gold(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.6, roughness: 0.3, emissive: 0xa87400, emissiveIntensity: 0.25 });
}

function buildNecklace(): THREE.Object3D {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 24), gold());
  chain.rotation.x = Math.PI / 2 - 0.5;
  chain.position.set(0, -0.06, -0.03);
  g.add(chain);
  GEM_COLORS.slice(0, 3).forEach((c, i) => {
    const gem = gemMesh(c, 0.3);
    gem.position.set((i - 1) * 0.09, -0.15 - (i === 1 ? 0.03 : 0), -0.2);
    g.add(gem);
  });
  return g;
}

function buildCrown(): THREE.Object3D {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 20, 1, true), gold());
  (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  band.position.y = 0.04;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), gold());
    spike.position.set(Math.sin(a) * 0.2, 0.16, -Math.cos(a) * 0.2);
    g.add(spike);
    const gem = gemMesh(GEM_COLORS[i % GEM_COLORS.length], 0.22);
    gem.position.set(Math.sin(a) * 0.21, 0.05, -Math.cos(a) * 0.21);
    g.add(gem);
  }
  return g;
}

function buildRing(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 20), gold());
  ring.position.y = 0.1;
  g.add(ring);
  const gem = gemMesh(0x3bc9ff, 0.42);
  gem.position.y = 0.23;
  g.add(gem);
  return g;
}

function buildHeldGem(): THREE.Group {
  const g = new THREE.Group();
  const gem = gemMesh(0xff3b7f, 0.9);
  gem.position.y = 0.2;
  g.add(gem);
  return g;
}

registerWearable('joalheiro-colar', { name: 'colar de joias', slot: 'neck', build: buildNecklace });
registerWearable('joalheiro-coroa', { name: 'coroa de joias', slot: 'head', build: buildCrown });
registerItem('anel', { name: 'anel', icon: '💍', build: buildRing, edible: false });
registerItem(JEWEL_ITEM, { name: 'joia', icon: '💎', build: buildHeldGem, edible: false });

/** What the jeweller makes, in order; `made` counts how many she already has (it wraps round). */
const JEWELLERY: { wear?: ['neck' | 'head', string]; item?: string }[] = [
  { wear: ['neck', 'joalheiro-colar'] },
  { item: 'anel' },
  { wear: ['head', 'joalheiro-coroa'] },
];

/* ------------------------------------------------------------------ shield (one for the whole game) */

/** The jewel shield: a soft glowing bubble and three little gems circling her; creatures keep away for a minute. */
export class JewelShield {
  private left = 0;
  private readonly root = new THREE.Group();
  private readonly bubble: THREE.Mesh;
  private readonly gems: THREE.Mesh[] = [];
  private time = 0;

  constructor(private readonly host: THREE.Object3D) {
    this.bubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.bubble.position.y = 1.1;
    this.root.add(this.bubble);
    for (let i = 0; i < 3; i++) {
      const g = gemMesh(GEM_COLORS[i], 0.7);
      this.root.add(g);
      this.gems.push(g);
    }
    this.root.visible = false;
  }

  get on(): boolean {
    return this.left > 0;
  }
  get secondsLeft(): number {
    return Math.max(0, this.left);
  }

  /** Start (or restart) the minute of protection. */
  start(): void {
    this.left = SHIELD_S;
    if (this.root.parent !== this.host) this.host.add(this.root);
    this.root.visible = true;
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, i * 0.07, 0.35, 'sine', 0.07));
  }

  stop(): void {
    this.left = 0;
    this.root.visible = false;
  }

  update(dt: number, running: boolean): void {
    if (this.left <= 0) return;
    this.time += dt;
    if (running) this.left -= dt;
    if (this.left <= 0) {
      this.root.visible = false;
      tone(660, 0, 0.2, 'sine', 0.05);
      tone(440, 0.15, 0.3, 'sine', 0.05);
      return;
    }
    // the last seconds it blinks, so she knows it is about to end
    const ending = this.left < 6 ? 0.5 + 0.5 * Math.sin(this.time * 14) : 1;
    (this.bubble.material as THREE.MeshBasicMaterial).opacity = 0.16 * ending + Math.sin(this.time * 3) * 0.03;
    this.bubble.scale.setScalar(1 + Math.sin(this.time * 2.2) * 0.04);
    this.gems.forEach((g, i) => {
      const a = this.time * 2.4 + (i / 3) * Math.PI * 2;
      g.position.set(Math.cos(a) * 1.25, 1.2 + Math.sin(this.time * 3 + i) * 0.25, Math.sin(a) * 1.25);
      g.rotation.y = this.time * 4;
      g.visible = ending > 0.3;
    });
  }
}

/* ------------------------------------------------------------------ bank, jeweller and treasure chest (per city) */

export class JewelPlaces {
  readonly things: Interactable[] = [];
  private readonly flyers: Flyers;
  private readonly shops: JewelShop[] = [];
  private bank: JewelShop | null = null;
  private jeweller: JewelShop | null = null;
  private chest: {
    at: THREE.Vector3;
    lid: THREE.Group;
    open: boolean;
    t: number;
    rattle: number;
    glow: THREE.Mesh;
    /** the gem-shaped keyhole: it twinkles when she touches the locked chest ("a jewel goes here") */
    lock: THREE.Mesh;
    hint: number;
    /** narrator lines are not repeated on every bump (game time of the last line) */
    saidAt: number;
  } | null = null;
  private ornaments: THREE.Object3D[] = [];
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
  ) {
    this.flyers = new Flyers(scene);
    this.buildBank(obstacles, rng);
    this.buildJeweller(obstacles, rng);
    this.buildChest(obstacles, rng);
  }

  /** Her hands, roughly (where coins and jewels leave from / arrive at). */
  private hand = (): THREE.Vector3 => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  private makeClerkShop(
    site: { x: number; z: number; rot: number },
    g: THREE.Group,
    rng: () => number,
    look: { shirt: number; dress?: boolean },
    counterLocal: { x: number; z: number },
  ): JewelShop {
    const clerk = buildFolk({
      shirt: look.shirt,
      pants: pick(rng, [0x343a40, 0x212529]),
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: look.dress,
      longHair: look.dress,
    });
    clerk.group.position.set(0, 0, -2.0);
    clerk.group.rotation.y = Math.PI;
    g.add(clerk.group);
    let mood: 'idle' | 'no' | 'yes' = 'idle';
    let t = 0;
    return {
      group: g,
      clerk,
      stand: siteToWorld(site, 0, 1.2),
      counter: siteToWorld(site, counterLocal.x, counterLocal.z, 1.1),
      no() {
        mood = 'no';
        t = 0;
        tone(196, 0, 0.3, 'sine', 0.13);
        tone(174.6, 0.28, 0.45, 'sine', 0.11);
      },
      yes() {
        mood = 'yes';
        t = 0;
      },
      update(dt) {
        t += dt;
        clerk.head.rotation.y = mood === 'no' ? Math.sin(t * 11) * 0.55 * Math.max(0, 1 - t / 1.4) : 0;
        clerk.head.rotation.x = mood === 'yes' ? Math.sin(t * 12) * 0.3 * Math.max(0, 1 - t / 1.2) : 0;
        clerk.armR.rotation.z =
          mood === 'yes'
            ? Math.min(1, t * 4) * 2.4 * Math.max(0, 1 - Math.max(0, t - 1.2)) +
              Math.sin(t * 10) * 0.2 * (t < 1.4 ? 1 : 0)
            : 0;
        if (t > 1.6) mood = 'idle';
      },
    };
  }

  private buildCoveredShop(
    obstacles: Obstacle[],
    rng: () => number,
    colors: { wall: number; trim: number; roof: number; floor: number },
  ): { site: { x: number; z: number; rot: number }; g: THREE.Group; hw: number; depth: number } | null {
    const hw = 2.4;
    const depth = 3.6;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 35, maxD: 125, apron: 4 });
    if (!site) return null;
    const g = siteGroup(this.scene, site);
    const wall = mat(colors.wall);
    const trim = mat(colors.trim);
    box(g, mat(colors.floor), hw * 2, 0.14, depth, 0, 0.07, -depth / 2);
    box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);
    box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
    for (const s of [-1, 1]) {
      box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
      box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
    }
    const doorW = 1.7;
    box(g, wall, hw - doorW / 2, 2.7, 0.2, -(hw + doorW / 2) / 2, 1.4, -0.1);
    box(g, wall, hw - doorW / 2, 2.7, 0.2, (hw + doorW / 2) / 2, 1.4, -0.1);
    for (const s of [-1, 1]) box(g, trim, 0.12, 2.4, 0.22, s * (doorW / 2 + 0.04), 1.25, -0.05);
    box(g, trim, doorW + 0.3, 0.4, 0.24, 0, 2.5, -0.05);
    const roof = mat(colors.roof);
    const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.0, -depth / 2);
    rL.rotation.z = 0.16;
    const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.0, -depth / 2);
    rR.rotation.z = -0.16;
    box(g, wall, 0.3, 0.3, depth + 0.55, 0, 3.18, -depth / 2);
    // indoor counter
    box(g, mat(0xfff3d6), 2.2, 0.12, 0.7, 0, 1.0, -1.2);
    box(g, wall, 2.2, 0.9, 0.55, 0, 0.5, -1.2);
    box(g, mat(0xadb5bd), doorW + 0.2, 0.08, 0.35, 0, 0.04, 0.2);
    obstacles.push(siteBox(site, -hw, hw, -depth, 0));
    obstacles.push(siteBox(site, -1.1, 1.1, -1.55, -0.85, 1.05));
    return { site, g, hw, depth };
  }

  private buildBank(obstacles: Obstacle[], rng: () => number): void {
    const built = this.buildCoveredShop(obstacles, rng, {
      wall: 0xf1f3f5,
      trim: 0x5c7cfa,
      roof: 0x364fc7,
      floor: 0xe9ecef,
    });
    if (!built) return;
    const { site, g } = built;
    // columns + big gold coin on the ridge
    for (const s of [-1, 1]) cyl(g, mat(0xffffff), 0.14, 2.5, s * 1.7, 1.3, -0.05);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 28), mat(0xffd23f, 0.45));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, 3.55, -1.6);
    coin.castShadow = true;
    g.add(coin);
    this.ornaments.push(coin);
    for (let i = 0; i < 3; i++) cyl(g, mat(0xffd23f, 0.3), 0.1, 0.05 + i * 0.03, 0.5 + i * 0.22, 1.08 + i * 0.015, -1.2);
    const shop = this.makeClerkShop(site, g, rng, { shirt: 0x364fc7 }, { x: 0, z: -1.2 });
    this.bank = shop;
    this.shops.push(shop);
    this.things.push({
      object: g,
      position: shop.stand,
      radius: 2.3,
      requiresClick: true,
      interact: () => this.useBank(),
    });
  }

  private useBank(): boolean {
    const k = this.bank!;
    if (this.flyers.busy) return false;
    if (!this.ctx.spendJewels(1)) {
      k.no();
      return false;
    }
    k.yes();
    tone(1568, 0, 0.25, 'triangle', 0.07);
    this.flyers.send(gemMesh(undefined, 1), this.hand(), k.counter, 0.55, 0, () => {
      for (let i = 0; i < BANK_COINS; i++) {
        this.flyers.send(coinMesh(), k.counter, this.hand, 0.45, 0.25 + i * 0.13, () => {
          this.ctx.addCoins(1);
          tone(1568 + Math.random() * 120, 0, 0.06, 'square', 0.05);
          tone(2349, 0.04, 0.14, 'triangle', 0.06);
        });
      }
    });
    return true;
  }

  private buildJeweller(obstacles: Obstacle[], rng: () => number): void {
    const built = this.buildCoveredShop(obstacles, rng, {
      wall: 0xfff0f6,
      trim: 0xcc5de8,
      roof: 0x9c36b5,
      floor: 0xf3d9fa,
    });
    if (!built) return;
    const { site, g } = built;
    const gem = gemMesh(0x3bc9ff, 2.8);
    gem.position.set(0, 3.55, -1.6);
    gem.castShadow = true;
    g.add(gem);
    this.ornaments.push(gem);
    // montra gems on the counter
    GEM_COLORS.forEach((c, i) => {
      const piece = gemMesh(c, 0.45);
      piece.position.set(-0.8 + i * 0.4, 1.16, -1.2);
      g.add(piece);
    });
    const shop = this.makeClerkShop(site, g, rng, { shirt: 0x9c36b5, dress: true }, { x: 0, z: -1.2 });
    this.jeweller = shop;
    this.shops.push(shop);
    this.things.push({
      object: g,
      position: shop.stand,
      radius: 2.3,
      requiresClick: true,
      interact: () => this.useJeweller(),
    });
  }

  private useJeweller(): boolean {
    const k = this.jeweller!;
    if (this.flyers.busy) return false;
    if (!this.ctx.spendJewels(JEWELLER_COST)) {
      k.no();
      return false;
    }
    k.yes();
    const made = this.ctx.flag('joalheiro');
    this.ctx.setFlag('joalheiro', made + 1);
    const piece = JEWELLERY[made % JEWELLERY.length];
    for (let i = 0; i < JEWELLER_COST; i++) {
      this.flyers.send(gemMesh(GEM_COLORS[i], 1), this.hand(), k.counter, 0.5, i * 0.18, () =>
        tone(1175 + i * 200, 0, 0.12, 'triangle', 0.06),
      );
    }
    for (let i = 0; i < 5; i++) tone(2093, 1.0 + i * 0.16, 0.05, 'square', 0.04);
    const show = gemMesh(0xffe14d, 1.2);
    this.flyers.send(show, k.counter, this.hand, 0.6, 2.0, () => {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.07));
      if (piece.wear) this.ctx.wear(piece.wear[0], piece.wear[1]);
      else if (piece.item) this.ctx.give(piece.item);
      feel('shop');
    });
    return true;
  }

  private buildChest(obstacles: Obstacle[], rng: () => number): void {
    // the most out-of-the-way free corner of the city
    const at = openSpot(obstacles, rng, 1.4, { minD: 90, maxD: 190, farthest: true }) ?? openSpot(obstacles, rng, 1.4, { minD: 50, maxD: 190, farthest: true });
    if (!at) return;
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = Math.atan2(-at.x, -at.z) + Math.PI; // its front (+Z) looks back at the city centre
    this.scene.add(g);
    const wood = mat(0x8d5a3b);
    const band = mat(0xffd34d, 0.25);
    box(g, wood, 1.5, 0.7, 1.0, 0, 0.35, 0);
    for (const x of [-0.6, 0, 0.6]) box(g, band, 0.12, 0.72, 1.02, x, 0.36, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.7, -0.5); // hinge at the back
    g.add(lid);
    // rounded lid: half a cylinder lying along the chest (the x ≥ 0 half of the cylinder, turned to point up)
    const lidWood = new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.65, side: THREE.DoubleSide });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16, 1, false, 0, Math.PI), lidWood);
    top.rotation.z = Math.PI / 2;
    top.scale.x = 0.7; // flatter than a full half-circle
    top.position.set(0, 0, 0.5);
    top.castShadow = true;
    lid.add(top);
    for (const x of [-0.6, 0, 0.6]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.515, 0.515, 0.12, 16, 1, false, 0, Math.PI), band);
      b.rotation.z = Math.PI / 2;
      b.scale.x = 0.7;
      b.position.set(x, 0, 0.5);
      lid.add(b);
    }
    // the lock: a gem-shaped hole
    const lock = gemMesh(0x24324a, 0.6);
    lock.position.set(0, 0.52, 0.53);
    g.add(lock);
    // gold shining inside (seen once the lid is up)
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.8), mat(0xffd23f, 0.9));
    glow.position.set(0, 0.62, 0);
    glow.visible = false;
    g.add(glow);
    obstacles.push({ minX: at.x - 0.8, maxX: at.x + 0.8, minZ: at.z - 0.8, maxZ: at.z + 0.8, height: 1.3 });
    const open = this.ctx.flag(`chest:${this.ctx.city()}`) > 0;
    this.chest = { at, lid, open, t: open ? 1 : 0, rattle: 0, glow, lock, hint: 0, saidAt: -99 };
    if (open) lid.rotation.x = -1.9; // opened before: lid up, nothing inside
    this.things.push({
      object: g,
      position: at.clone(),
      radius: 2.2,
      interact: () => this.touchChest(),
    });
  }

  private touchChest(): void {
    const c = this.chest!;
    // Telmo (Moscovo, 2026-11-19): "há um baú que não faz nada" — before, a locked chest only gave a tiny rattle and an
    // opened one did nothing at all. Now every touch answers: a short spoken line + keyhole twinkle / hollow knock.
    const talk = (line: string): void => {
      if (this.time - c.saidAt < 6) return;
      c.saidAt = this.time;
      this.ctx.say([line]);
    };
    if (c.open) {
      // already opened in this city: hollow knock, the lid wobbles, nothing inside
      c.rattle = 0.6;
      tone(220, 0, 0.12, 'sine', 0.07);
      tone(165, 0.14, 0.2, 'sine', 0.06);
      talk('O baú já está vazio. Há outro na próxima cidade!');
      return;
    }
    if (!this.ctx.spendJewels(1)) {
      // locked: it rattles and the gem-shaped keyhole twinkles — a jewel is the key
      c.rattle = 1;
      c.hint = 1;
      for (let i = 0; i < 4; i++) tone(140 + Math.random() * 60, i * 0.07, 0.06, 'square', 0.07);
      tone(1568, 0.35, 0.12, 'triangle', 0.05);
      tone(2093, 0.47, 0.18, 'triangle', 0.05);
      talk('Um baú fechado! A chave é uma joia. Apanha uma joia e volta!');
      return;
    }
    c.open = true;
    this.ctx.setFlag(`chest:${this.ctx.city()}`, 1);
    const top = c.at.clone().setY(0.9);
    // the jewel flies into the lock, the lid swings up (creak), the coins jump out to her
    this.flyers.send(gemMesh(undefined, 1), this.hand(), top, 0.5, 0, () => {
      tone(880, 0, 0.1, 'square', 0.06);
      tone(1320, 0.1, 0.3, 'triangle', 0.07);
      for (let i = 0; i < 5; i++) tone(300 - i * 25, 0.05 + i * 0.05, 0.06, 'sawtooth', 0.025); // creak
      c.glow.visible = true;
      this.ctx.say(['A joia abriu o baú! Um tesouro de moedas!']);
      for (let i = 0; i < CHEST_COINS; i++) {
        this.flyers.send(coinMesh(), top, this.hand, 0.5, 0.5 + i * 0.1, () => {
          this.ctx.addCoins(1);
          tone(1568 + Math.random() * 200, 0, 0.06, 'square', 0.05);
          if (i === CHEST_COINS - 1) c.glow.visible = false; // all the gold is out: empty now
        });
      }
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.flyers.update(dt);
    for (const k of this.shops) k.update(dt);
    for (const o of this.ornaments) o.rotation.y += dt * 0.9;
    const c = this.chest;
    if (c) {
      if (c.open && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 1.6);
        c.lid.rotation.x = -1.9 * (c.t * c.t * (3 - 2 * c.t));
      }
      if (c.rattle > 0) {
        c.rattle = Math.max(0, c.rattle - dt * 2.2);
        const base = c.open ? -1.9 * (c.t * c.t * (3 - 2 * c.t)) : 0;
        c.lid.rotation.x = base - Math.abs(Math.sin(this.time * 40)) * 0.08 * c.rattle;
      }
      if (c.hint > 0) {
        // keyhole twinkle (~1.5 s): it grows and spins — "a jewel goes here"
        c.hint = Math.max(0, c.hint - dt * 0.7);
        c.lock.scale.setScalar(1 + Math.sin(c.hint * Math.PI) * 0.7);
        c.lock.rotation.z = c.hint * Math.PI * 2;
      }
    }
  }

  dispose(): void {
    this.flyers.clear();
  }

  /** For the ?debug bridge. */
  debug(): Record<string, unknown> {
    const p = (v: THREE.Vector3 | undefined) => (v ? [+v.x.toFixed(1), +v.z.toFixed(1)] : null);
    return { bank: p(this.bank?.stand), jeweller: p(this.jeweller?.stand), chest: p(this.chest?.at), chestOpen: this.chest?.open ?? null };
  }
}
