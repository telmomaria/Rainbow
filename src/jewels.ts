import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { GameCtx } from './gamectx';
import { registerItem, registerWearable } from './items';
import { Flyers, GEM_COLORS, box, buildKiosk, coinMesh, cyl, gemMesh, mat, openSpot, roadsideSite, type Kiosk } from './places';
import type { Interactable, Obstacle } from './world';

/**
 * Uses for the jewels (rule R18: they are a second currency — picked up in the street, kept, and spent here).
 *
 *  - Banco (J1 / G30): a jewel for 8 coins.
 *  - Joalheiro (J3): three jewels make a necklace, then a ring, then a crown — she wears / carries them.
 *  - Baú do tesouro (J4 / G09): in the most out-of-the-way spot of each city; a jewel is the key; 15 coins inside.
 *  - Escudo (J6): tapping the jewel in her bag holds it up — for one minute the creatures run from its shine.
 *
 * Landmark diamonds are never spent here (rule FIM3): `ctx.jewels()` only counts street jewels.
 * No text or icons in the world: a big coin on the bank's roof, a big gem on the jeweller's; coins and jewels
 * visibly fly between her and the counter, and the clerk nods or shakes his head.
 */

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
  private readonly kiosks: Kiosk[] = [];
  private bank: Kiosk | null = null;
  private jeweller: Kiosk | null = null;
  private chest: { at: THREE.Vector3; lid: THREE.Group; open: boolean; t: number; rattle: number; glow: THREE.Mesh } | null = null;
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

  private buildBank(obstacles: Obstacle[], rng: () => number): void {
    const site = roadsideSite(obstacles, rng, 2.2, 3, { minD: 35, maxD: 120 });
    if (!site) return;
    const k = buildKiosk(this.scene, obstacles, site, { wall: 0xf1f3f5, roof: 0x5c7cfa, awning: 0x5c7cfa, shirt: 0x364fc7 }, rng);
    // classic bank front: two white columns, and a big gold coin standing on the roof
    for (const s of [-1, 1]) cyl(k.group, mat(0xffffff), 0.16, 2.6, s * 1.95, 1.3, 0.15);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 28), mat(0xffd23f, 0.45));
    coin.rotation.x = Math.PI / 2;
    coin.position.set(0, 3.95, -1.5);
    coin.castShadow = true;
    k.group.add(coin);
    this.ornaments.push(coin);
    // a little tray of coins on the counter
    for (let i = 0; i < 3; i++) cyl(k.group, mat(0xffd23f, 0.3), 0.1, 0.05 + i * 0.03, 0.9 + i * 0.18, 1.08 + i * 0.015, -0.4);
    this.bank = k;
    this.kiosks.push(k);
    this.things.push({
      object: k.group,
      position: k.stand,
      radius: 2.2,
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
    // the jewel flies to the counter, then eight coins fly back to her one by one
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
    const site = roadsideSite(obstacles, rng, 2.2, 3, { minD: 35, maxD: 125 });
    if (!site) return;
    const k = buildKiosk(this.scene, obstacles, site, { wall: 0xfff0f6, roof: 0xcc5de8, awning: 0xcc5de8, dress: true, shirt: 0x9c36b5 }, rng);
    // a big gem turning on the roof, and small jewellery on the counter
    const gem = gemMesh(0x3bc9ff, 3.4);
    gem.position.set(0, 3.95, -1.5);
    gem.castShadow = true;
    k.group.add(gem);
    this.ornaments.push(gem);
    GEM_COLORS.forEach((c, i) => {
      const g = gemMesh(c, 0.45);
      g.position.set(-0.8 + i * 0.4, 1.16, -0.4);
      k.group.add(g);
    });
    this.jeweller = k;
    this.kiosks.push(k);
    this.things.push({
      object: k.group,
      position: k.stand,
      radius: 2.2,
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
      this.flyers.send(gemMesh(GEM_COLORS[i], 1), this.hand(), k.counter, 0.5, i * 0.18, () => tone(1175 + i * 200, 0, 0.12, 'triangle', 0.06));
    }
    // tap-tap-tap of the little hammer, then the new piece comes to her in a sparkle
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
    this.chest = { at, lid, open, t: open ? 1 : 0, rattle: 0, glow };
    if (open) lid.rotation.x = -1.9;
    this.things.push({
      object: g,
      position: at.clone(),
      radius: 2.2,
      interact: () => this.touchChest(),
    });
  }

  private touchChest(): void {
    const c = this.chest!;
    if (c.open) return;
    if (!this.ctx.spendJewels(1)) {
      // locked: it rattles
      c.rattle = 1;
      for (let i = 0; i < 4; i++) tone(140 + Math.random() * 60, i * 0.07, 0.06, 'square', 0.07);
      return;
    }
    c.open = true;
    this.ctx.setFlag(`chest:${this.ctx.city()}`, 1);
    const top = c.at.clone().setY(0.9);
    // the jewel flies into the lock, the lid swings up, the coins jump out to her
    this.flyers.send(gemMesh(undefined, 1), this.hand(), top, 0.5, 0, () => {
      tone(880, 0, 0.1, 'square', 0.06);
      tone(1320, 0.1, 0.3, 'triangle', 0.07);
      c.glow.visible = true;
      for (let i = 0; i < CHEST_COINS; i++) {
        this.flyers.send(coinMesh(), top, this.hand, 0.5, 0.5 + i * 0.1, () => {
          this.ctx.addCoins(1);
          tone(1568 + Math.random() * 200, 0, 0.06, 'square', 0.05);
        });
      }
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.flyers.update(dt);
    for (const k of this.kiosks) k.update(dt);
    for (const o of this.ornaments) o.rotation.y += dt * 0.9;
    const c = this.chest;
    if (c) {
      if (c.open && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 1.6);
        c.lid.rotation.x = -1.9 * (c.t * c.t * (3 - 2 * c.t));
      }
      if (c.rattle > 0) {
        c.rattle = Math.max(0, c.rattle - dt * 2.2);
        c.lid.rotation.x = c.open ? c.lid.rotation.x : -Math.abs(Math.sin(this.time * 40)) * 0.08 * c.rattle;
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
