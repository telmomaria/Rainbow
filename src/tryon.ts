import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
import type { WearSlot } from './items';
import {
  Flyers,
  box,
  coinMesh,
  cyl,
  mat,
  reserveGround,
  roadsideSite,
  siteBox,
  siteGroup,
  siteToWorld,
  type Site,
  type SiteOpts,
} from './places';
import { buildFolk, pick, HAIRS, SKINS, type Folk } from './venue';
import type { Interactable, Obstacle } from './world';

/**
 * Shared "try-on" shop (sapataria, chapelaria): a big covered shop with an open front she walks into,
 * items on stands along the walls, a full-length mirror (real reflection) and a counter with a shopkeeper.
 *
 *  - tap / Enter at a stand → she tries the item on (only on her, not saved); the stand shows it is gone;
 *    tapping another one swaps (the first goes back), tapping the same one takes it off.
 *  - tap / Enter at the counter (or on the shopkeeper) while trying → pay and keep it (ctx.wear = saved).
 *  - walking out while trying → it goes back on its stand, the shopkeeper shakes the head.
 *  - things she already bought are free to put on again (flag `own:<id>`).
 * No UI at all: feedback is the stand, her look, the mirror, the clerk's head and the narrator's short lines.
 *
 * Local frame (places.ts): x across, +Z = street, the shop is at z ∈ [-DEPTH, 0].
 */

export const TRYON_HW = 3.5;
export const TRYON_DEPTH = 6;

export interface TryOnItem {
  id: string;
  /** Spoken name with no article, e.g. "ténis vermelhos", "chapéu de palha". */
  name: string;
  slot: WearSlot;
  price: number;
  /** "Os ténis…" / "O chapéu…" agreement. */
  plural?: boolean;
  /** Shop display, built at the size of a real worn item (head radius ~0.34 for head things). */
  display: () => THREE.Object3D;
}

export interface TryOnLook {
  /** 'shelf' = wall cubby with the pair on top (shoes) · 'head' = mannequin head on a pole (hats, glasses…). */
  stand: 'shelf' | 'head' | 'mannequin';
  wall: number;
  trim: number;
  floor: number;
  roof: number;
  awning: [number, number];
  /** Big pictogram on the sign above the door (a boot, a hat…), in sign-local space (about 1.6 m wide). */
  sign: () => THREE.Object3D;
  clerk: { shirt: number; pants: number; dress?: boolean; longHair?: boolean; cap?: number };
  /** Extra non-interactive dressing (rails, hangers…) in the shop's local frame. */
  decor?: (g: THREE.Group) => void;
}

interface Slot {
  /** Stand base (local) and the direction it faces (local unit vector into the room). */
  x: number;
  z: number;
  fx: number;
  fz: number;
  /** Where she stands to use it (local). */
  px: number;
  pz: number;
}

/** Up to 8 stands: 4 on the left wall, 2 on the right wall (back), 2 back to back on an island. */
const SLOTS: Slot[] = [
  { x: -2.95, z: -1.5, fx: 1, fz: 0, px: -2.0, pz: -1.5 },
  { x: -2.95, z: -2.7, fx: 1, fz: 0, px: -2.0, pz: -2.7 },
  { x: -2.95, z: -3.9, fx: 1, fz: 0, px: -2.0, pz: -3.9 },
  { x: -2.95, z: -5.1, fx: 1, fz: 0, px: -2.0, pz: -5.0 },
  { x: 2.95, z: -3.9, fx: -1, fz: 0, px: 2.0, pz: -3.9 },
  { x: 2.95, z: -5.1, fx: -1, fz: 0, px: 2.0, pz: -5.0 },
  { x: -0.2, z: -2.35, fx: 0, fz: 1, px: -0.2, pz: -1.45 },
  { x: -0.2, z: -3.05, fx: 0, fz: -1, px: -0.2, pz: -3.95 },
];
const STAND_R = 0.6;
/** Counter (along the right wall, near the door) and the clerk behind it. */
const COUNTER = { x0: 1.9, x1: 2.5, z0: -2.8, z1: -1.0 };
const CLERK = { x: 2.95, z: -1.9 };
const PAY = { x: 1.25, z: -1.9, r: 0.75 };
/** Mirror on the back wall (centre). */
const MIRROR = { x: 0.9, w: 1.3, h: 2.15 };

/** Rotation that turns a −Z-facing model to look along (fx, fz). */
const faceY = (fx: number, fz: number): number => Math.atan2(-fx, -fz);

export class TryOnShop {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private group: THREE.Group | null = null;
  private roof: THREE.Group | null = null;
  private mirror: Reflector | null = null;
  private site: Site | null = null;
  private clerk: Folk | null = null;
  private displays: THREE.Object3D[] = [];
  private trying: number | null = null;
  private toldMirror = false;
  private anim: { kind: 'shake' | 'nod' | 'point'; t: number } | null = null;
  private zoneBox: Obstacle | null = null;
  private payAt: THREE.Vector3 | null = null;
  private lastLine = '';

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    private readonly hero: Character,
    private readonly items: TryOnItem[],
    private readonly look: TryOnLook,
    siteOpts: SiteOpts,
  ) {
    this.fly = new Flyers(scene);
    const hw = TRYON_HW;
    const depth = TRYON_DEPTH;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;
    this.site = site;
    const g = siteGroup(scene, site);
    this.group = g;
    this.buildShell(g);
    this.look.decor?.(g);
    this.zoneBox = siteBox(site, -hw, hw, -depth, 0);
    // the floor inside is walkable, not an obstacle: reserve it so nothing placed later (massage cabin, clinic…) lands in the shop
    reserveGround(obstacles, this.zoneBox, 3);

    // walls only (she walks in through the open front); stands / counter are their own solids
    obstacles.push(siteBox(site, -hw, hw, -depth, -depth + 0.25)); // back
    obstacles.push(siteBox(site, -hw, -hw + 0.25, -depth, 0)); // left
    obstacles.push(siteBox(site, hw - 0.25, hw, -depth, 0)); // right
    obstacles.push(siteBox(site, COUNTER.x0, hw, COUNTER.z0 - 0.15, COUNTER.z1 + 0.15, 1.1)); // counter + clerk
    obstacles.push(siteBox(site, -hw, -hw + 0.45, -0.25, 0.1)); // front pillars
    obstacles.push(siteBox(site, hw - 0.45, hw, -0.25, 0.1));

    // clerk behind the counter, looking into the shop (−X)
    const c = this.look.clerk;
    const clerk = buildFolk({ ...c, skin: pick(rng, SKINS), hair: pick(rng, HAIRS) });
    clerk.group.position.set(CLERK.x, 0, CLERK.z);
    clerk.group.rotation.y = faceY(-1, 0);
    this.clerk = clerk;

    // counter (clickable together with the clerk)
    const counter = new THREE.Group();
    g.add(counter);
    counter.add(clerk.group);
    const cw = COUNTER.x1 - COUNTER.x0;
    const cd = COUNTER.z1 - COUNTER.z0;
    const cx = (COUNTER.x0 + COUNTER.x1) / 2;
    const cz = (COUNTER.z0 + COUNTER.z1) / 2;
    box(counter, mat(this.look.trim), cw, 0.95, cd, cx, 0.475, cz);
    box(counter, mat(0xfff3d6), cw + 0.12, 0.08, cd + 0.12, cx, 0.99, cz);
    // a cash drawer box + a little bell on the counter (no text)
    box(counter, mat(0x495057), 0.32, 0.18, 0.4, cx + 0.05, 1.12, cz + 0.35);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffd43b, 0.2));
    bell.position.set(cx - 0.05, 1.03, cz - 0.4);
    counter.add(bell);
    this.payAt = siteToWorld(site, cx, cz, 1.1);
    this.things.push({
      object: counter,
      position: siteToWorld(site, PAY.x, PAY.z),
      radius: PAY.r,
      requiresClick: true,
      interact: () => this.pay(),
    });

    // stands with the items
    items.slice(0, SLOTS.length).forEach((it, i) => {
      const s = SLOTS[i];
      const stand = new THREE.Group();
      stand.position.set(s.x, 0, s.z);
      stand.rotation.y = faceY(s.fx, s.fz);
      g.add(stand);
      const top = this.buildStand(stand);
      const d = this.look.stand === 'head' ? this.headDisplay(it) : it.display();
      d.position.y = top;
      stand.add(d);
      this.displays.push(d);
      const r = this.look.stand === 'shelf' ? 0.48 : this.look.stand === 'mannequin' ? 0.38 : 0.3;
      const b = siteToWorld(site, s.x, s.z);
      obstacles.push({ minX: b.x - r, maxX: b.x + r, minZ: b.z - r, maxZ: b.z + r, height: 1.5 });
      this.things.push({
        object: stand,
        position: siteToWorld(site, s.px, s.pz),
        radius: STAND_R,
        requiresClick: true,
        interact: () => this.tryOn(i),
      });
    });
    // island table between the two middle stands
    if (items.length > 6) {
      cyl(g, mat(this.look.trim), 0.5, 0.5, -0.2, 0.25, -2.7);
      cyl(g, mat(0xfff3d6), 0.55, 0.05, -0.2, 0.52, -2.7);
      const b = siteToWorld(site, -0.2, -2.7);
      obstacles.push({ minX: b.x - 0.55, maxX: b.x + 0.55, minZ: b.z - 0.55, maxZ: b.z + 0.55, height: 1.5 });
    }
  }

  /** Floor, walls, open front with awning + sign, roof (hidden while she is inside), mirror, lamp. */
  private buildShell(g: THREE.Group): void {
    const hw = TRYON_HW;
    const depth = TRYON_DEPTH;
    const L = this.look;
    const wall = mat(L.wall);
    const trim = mat(L.trim);
    const H = 2.9;
    box(g, mat(L.floor), hw * 2, 0.06, depth, 0, 0.03, -depth / 2);
    // checker tiles on the floor (reads "inside a shop", not pavement)
    const tile = mat(0xffffff);
    for (let ix = 0; ix < 6; ix++) {
      for (let iz = 0; iz < 5; iz++) {
        if ((ix + iz) % 2) continue;
        box(g, tile, 1.0, 0.012, 1.0, -hw + 0.6 + ix * 1.15, 0.066, -0.6 - iz * 1.12);
      }
    }
    box(g, wall, hw * 2, H, 0.25, 0, H / 2, -depth + 0.125);
    for (const s of [-1, 1]) {
      box(g, wall, 0.25, H, depth, s * (hw - 0.125), H / 2, -depth / 2);
      box(g, trim, 0.27, 0.25, depth, s * (hw - 0.125), 0.125, -depth / 2); // skirting
      box(g, trim, 0.45, H, 0.3, s * (hw - 0.2), H / 2, -0.05); // front pillars
    }
    box(g, trim, hw * 2, 0.25, 0.27, 0, 0.125, -depth + 0.13);
    // everything above the opening (lintel, awning, sign, roof) hides while she is inside, so the camera sees her
    const top = new THREE.Group();
    g.add(top);
    this.roof = top;
    box(top, trim, hw * 2 + 0.1, 0.4, 0.35, 0, H - 0.1, -0.05); // lintel over the wide opening
    // striped awning over the front
    const n = 10;
    const stripeW = (hw * 2 + 0.6) / n;
    for (let i = 0; i < n; i++) {
      const st = box(top, mat(L.awning[i % 2]), stripeW, 0.06, 1.2, -hw - 0.3 + stripeW * (i + 0.5), H - 0.2, 0.55);
      st.rotation.x = 0.32;
      // scalloped edge
      const sc = new THREE.Mesh(new THREE.SphereGeometry(stripeW / 2, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(L.awning[i % 2]));
      sc.position.set(-hw - 0.3 + stripeW * (i + 0.5), H - 0.4, 1.12);
      top.add(sc);
    }
    // roof
    box(top, mat(L.roof), hw * 2 + 0.5, 0.22, depth + 0.4, 0, H + 0.11, -depth / 2 - 0.1);
    box(top, trim, hw * 2 + 0.6, 0.12, depth + 0.5, 0, H + 0.26, -depth / 2 - 0.1);
    // big sign board on the roof edge, with a pictogram (no text)
    const sign = new THREE.Group();
    sign.position.set(0, H + 1.15, 0.1);
    top.add(sign);
    box(sign, mat(0xffffff), 3.4, 1.6, 0.14, 0, 0, 0);
    box(sign, trim, 3.6, 0.16, 0.2, 0, 0.86, 0);
    box(sign, trim, 3.6, 0.16, 0.2, 0, -0.86, 0);
    for (const sx of [-1, 1]) box(sign, trim, 0.16, 1.88, 0.2, sx * 1.72, 0, 0);
    const pic = L.sign();
    pic.scale.multiplyScalar(1.3);
    pic.position.multiplyScalar(1.3);
    pic.position.z = 0.14;
    sign.add(pic);
    // full-length mirror on the back wall (frame + real reflection)
    const mz = -depth + 0.26;
    box(g, trim, MIRROR.w + 0.24, MIRROR.h + 0.24, 0.06, MIRROR.x, 0.12 + MIRROR.h / 2, mz);
    const mirror = new Reflector(new THREE.PlaneGeometry(MIRROR.w, MIRROR.h), {
      textureWidth: 320,
      textureHeight: 528,
      color: 0xe9ecef,
      clipBias: 0.003,
    });
    mirror.position.set(MIRROR.x, 0.12 + MIRROR.h / 2, mz + 0.04);
    mirror.visible = false;
    g.add(mirror);
    this.mirror = mirror;
    // a little rug in front of the mirror
    box(g, mat(L.awning[0]), 1.6, 0.015, 1.1, MIRROR.x, 0.075, mz + 1.1);
    // warm lamp
    const glow = new THREE.PointLight(0xfff0d0, 1.4, 10, 1.6);
    glow.position.set(0, H - 0.4, -depth / 2);
    g.add(glow);
  }

  /** Builds a stand facing −Z in `stand`; returns the height where the item sits. */
  private buildStand(stand: THREE.Group): number {
    const trim = mat(this.look.trim);
    if (this.look.stand === 'shelf') {
      // wooden cubby with a coloured back board: the pair sits on top at ~1 m
      const wood = mat(0xc08a5a);
      box(stand, wood, 0.95, 0.9, 0.6, 0, 0.45, 0.05);
      box(stand, trim, 1.0, 0.06, 0.66, 0, 0.92, 0.05);
      box(stand, mat(this.look.awning[1]), 1.0, 1.2, 0.06, 0, 1.5, 0.34);
      box(stand, wood, 0.75, 0.04, 0.5, 0, 0.45, 0.02); // inner shelf line
      return 0.95;
    }
    if (this.look.stand === 'mannequin') {
      // low round podium: a full-size dressed mannequin stands on it
      cyl(stand, trim, 0.4, 0.1, 0, 0.05, 0);
      cyl(stand, mat(0xffffff), 0.36, 0.02, 0, 0.11, 0);
      return 0.12;
    }
    // pole + round base + mannequin head (hats sit on it at real size)
    cyl(stand, mat(0xadb5bd), 0.035, 1.25, 0, 0.62, 0);
    cyl(stand, trim, 0.26, 0.06, 0, 0.03, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat(0xf8e3cf));
    head.position.y = 1.45;
    head.castShadow = true;
    stand.add(head);
    box(stand, mat(0xf8e3cf), 0.16, 0.18, 0.16, 0, 1.15, 0); // neck
    return 1.45;
  }

  /** Head stands: the display is the real wearable at real size, placed like Character does. */
  private headDisplay(it: TryOnItem): THREE.Object3D {
    const o = it.display();
    const holder = new THREE.Group();
    holder.add(o);
    const r = 0.34;
    if (it.slot === 'face') o.position.set(0, 0, -r * 0.97);
    else if (it.slot === 'neck') o.position.set(0, -r - 0.02, 0);
    else o.position.set(0, r * 0.92, 0);
    return holder;
  }

  private say(lines: string[]): void {
    this.lastLine = lines.join(' ');
    this.ctx.say(lines);
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private owned(it: TryOnItem): boolean {
    return this.ctx.owns(it.id) || this.ctx.flag(`own:${it.id}`) > 0;
  }

  /** Put back what she is trying (stand shows it again, her look = what she owns). */
  private putBack(): void {
    if (this.trying === null) return;
    const d = this.displays[this.trying];
    if (d) d.visible = true;
    this.trying = null;
    this.hero.setWear(this.ctx.worn());
  }

  private tryOn(i: number): boolean {
    if (this.ctx.isPaused() || this.ctx.isDriving() || this.hero.swimwear) return false;
    const it = this.items[i];
    if (this.trying === i) {
      // same stand again = take it off, back on the stand
      this.putBack();
      tone(330, 0, 0.12, 'sine', 0.05);
      return true;
    }
    this.putBack();
    if (this.owned(it)) {
      // already hers: put it on for free (saved)
      if (this.ctx.worn()[it.slot] !== it.id) this.ctx.wear(it.slot, it.id);
      this.say([it.plural ? 'Estes já são teus!' : 'Este já é teu!']);
      [523, 659].forEach((f, k) => tone(f, k * 0.08, 0.14, 'sine', 0.05));
      return true;
    }
    this.trying = i;
    this.displays[i].visible = false;
    this.hero.setWear({ ...this.ctx.worn(), [it.slot]: it.id });
    tone(587, 0, 0.1, 'triangle', 0.05);
    tone(784, 0.08, 0.14, 'triangle', 0.05);
    const lines = [`${this.cap(it.name)}! ${it.price} moedas.`];
    if (!this.toldMirror) {
      lines.push('Vê-te ao espelho!');
      this.toldMirror = true;
    }
    this.say(lines);
    return true;
  }

  private pay(): boolean {
    if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
    if (this.trying === null) {
      this.anim = { kind: 'point', t: 0 };
      this.say(['Escolhe e experimenta!']);
      return false;
    }
    const it = this.items[this.trying];
    if (this.ctx.coins() < it.price) {
      this.anim = { kind: 'shake', t: 0 };
      this.say([`${it.plural ? 'Custam' : 'Custa'} ${it.price} moedas.`]);
      tone(196, 0, 0.3, 'sine', 0.13);
      return false;
    }
    this.ctx.addCoins(-it.price);
    const hand = new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);
    for (let k = 0; k < Math.min(it.price, 5); k++) {
      this.fly.send(coinMesh(), hand, this.payAt!, 0.4, k * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
    }
    const d = this.displays[this.trying];
    this.trying = null;
    this.ctx.setFlag(`own:${it.id}`, 1);
    this.ctx.wear(it.slot, it.id); // saved: hers now
    // the shop has more of them: the stand fills up again after a moment
    setTimeout(() => {
      if (d) d.visible = true;
    }, 1500);
    this.anim = { kind: 'nod', t: 0 };
    feel('shop');
    this.say([it.plural ? 'São teus!' : 'É teu!', 'Que giro!']);
    [659, 784, 988].forEach((f, k) => tone(f, k * 0.08, 0.16, 'sine', 0.05));
    return true;
  }

  /** Local position of a world point. */
  private local(x: number, z: number): { x: number; z: number } {
    const s = this.site!;
    const c = Math.round(Math.cos(s.rot));
    const si = Math.round(Math.sin(s.rot));
    const dx = x - s.x;
    const dz = z - s.z;
    return { x: dx * c - dz * si, z: dx * si + dz * c };
  }

  update(dt: number): void {
    this.fly.update(dt);
    if (!this.site || !this.group) return;
    const p = this.ctx.player;
    const l = this.local(p.x, p.z);
    const inside = Math.abs(l.x) < TRYON_HW + 0.1 && l.z < 0.5 && l.z > -TRYON_DEPTH - 0.1;
    if (this.roof) this.roof.visible = !inside;
    // the mirror only renders when she is close (one small extra render)
    const near = Math.abs(l.x) < TRYON_HW + 6 && l.z < 9 && l.z > -TRYON_DEPTH - 1;
    if (this.mirror) this.mirror.visible = near;
    if (this.trying !== null) {
      const it = this.items[this.trying];
      if (this.hero.wornNow()[it.slot] !== it.id) {
        // something else changed her look (bag, menu…): the item is back on its stand
        this.displays[this.trying].visible = true;
        this.trying = null;
      } else if (!(Math.abs(l.x) < TRYON_HW + 0.8 && l.z < 1.6)) {
        // walked out without paying
        const name = it.name;
        const plural = !!it.plural;
        this.putBack();
        this.anim = { kind: 'shake', t: 0 };
        this.say([`${this.cap(name)} ${plural ? 'ficam' : 'fica'} na loja.`]);
        tone(262, 0, 0.18, 'sine', 0.06);
      }
    }
    // clerk gestures
    const c = this.clerk;
    if (c) {
      const a = this.anim;
      c.head.rotation.set(0, 0, 0);
      c.armR.rotation.set(0, 0, 0);
      if (a) {
        a.t += dt;
        if (a.kind === 'shake') c.head.rotation.y = Math.sin(a.t * 14) * 0.45 * Math.max(0, 1 - a.t / 1.2);
        else if (a.kind === 'nod') c.head.rotation.x = Math.abs(Math.sin(a.t * 9)) * 0.35;
        else {
          // point at the stands across the shop
          c.armR.rotation.x = -1.4;
          c.armR.rotation.z = 0.5;
        }
        if (a.t > 1.3) this.anim = null;
      }
    }
  }

  /** Inside of the shop (no coins / NPCs / monsters spawn here). */
  /** Never blocks other services (try-on is not a scripted moment). */
  get busy(): boolean {
    return false;
  }

  zone(): Obstacle | null {
    return this.zoneBox;
  }

  dispose(): void {
    this.putBack();
    this.fly.clear();
    this.mirror?.dispose();
    this.mirror = null;
    this.group?.removeFromParent();
    this.group = null;
  }

  debug(): Record<string, unknown> {
    if (!this.site) return { placed: false };
    const st = this.things.map((t) => [+t.position.x.toFixed(1), +t.position.z.toFixed(1)]);
    return {
      site: [+this.site.x.toFixed(1), +this.site.z.toFixed(1), +this.site.rot.toFixed(2)],
      pay: st[0],
      stands: st.slice(1),
      trying: this.trying === null ? null : this.items[this.trying].id,
      said: this.lastLine,
    };
  }
}
