import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
import { Flyers, box, coinMesh, cyl, mat, roadsideSite, siteBox, siteGroup, siteToWorld, type Site } from './places';
import { StaySession } from './stay';
import { buildFolk, pick, HAIRS, SKINS, type Folk } from './venue';
import type { Interactable, Obstacle } from './world';

/**
 * SPA (termas) — Nuuk (ice walls), Vilnius and Moscovo (wooden walls). Open-air walled courtyard (13 × 11 m, walkways ≥ 2.5 m round
 * the tub, cabins and desk) she walks into:
 *  - pay once at the entrance (click / Enter at the door): the sliding doors open;
 *  - changing cabins on the left: walk into one → the curtain closes → she comes out in a bathrobe (in again = clothes);
 *  - the round hot tub (steam, bubbles, two bathers): tap the water / Enter next to it in the robe = she leaves the robe
 *    on the hook and sits in the warm water as long as she wants (energy +1 every SPA_TICK_S s, mood +2 once a visit);
 *    any key / tap = she gets out and puts the robe back on. In and out as often as she likes while paid in.
 *  - without the robe the attendant points at the cabins; walking out in the robe = it stays in the SPA (never in the
 *    street in a robe). Leaving = the visit ends (pay again to come back).
 *
 * Local frame: body x∈[-HW,HW], z∈[-DEPTH,0], +Z = front (road). No roof (the camera sees in over the low walls).
 */

export const SPA_COST = 5;
/** In the hot water: one more energy level every this many seconds (until full). */
export const SPA_TICK_S = 10;

export const SPA_ICE_CITY = 'Nuuk';
export const SPA_BUILDING_CITIES = ['Vilnius', 'Moscovo'] as const;

export type SpaKind = 'ice' | 'building';

function spaKindFor(city: string): SpaKind | null {
  if (city === SPA_ICE_CITY) return 'ice';
  if ((SPA_BUILDING_CITIES as readonly string[]).includes(city)) return 'building';
  return null;
}

// 13 × 11 m (was 10 × 8 until 2026-11-21: Telmo wanted more room to move around)
const HW = 6.5;
const DEPTH = 11;
const WALL_H = 1.7;
const DOOR_HW = 1.05;
const TUB = { x: 1.0, z: -6.0, r: 2.0, inner: 1.75, rim: 0.7, water: 0.6 };
/** Seat circle radius inside the tub; she sits with her hips at SEAT_Y (under water). */
const SEAT_R = 1.2;
const SEAT_Y = 0.3;
/** Seats as directions from the tub centre: 0 front, 1 left are hers; 2 back, 3 right have bathers. */
const SEATS: [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];
const HER_SEATS = [0, 1];
const CABIN_Z = [-3.2, -5.8];
const CABIN_X0 = -HW + 0.3; // inner face of the left wall
const CABIN_X1 = -HW + 1.6; // curtain line
const DESK = { x: HW - 1.6, z: -1.5 };

const THEMES: Record<SpaKind, { wall: number; trim: number; floor: number; rim: number; deck: number }> = {
  ice: { wall: 0x74c0fc, trim: 0xa5d8ff, floor: 0xe9ecef, rim: 0xd0ebff, deck: 0xc5f6fa },
  building: { wall: 0xb5734a, trim: 0x0ca678, floor: 0xffe8cc, rim: 0xf8f9fa, deck: 0xe9c79c },
};

export class Spa {
  readonly things: Interactable[] = [];
  private readonly fly: Flyers;
  private kind: SpaKind | null = null;
  private site: Site | null = null;
  private group: THREE.Group | null = null;
  private stand: THREE.Vector3 | null = null;
  private zoneBox: Obstacle | null = null;
  /** The door gap's obstacle (collapsed far away while the door is open) and its closed shape. */
  private door: Obstacle | null = null;
  private doorShut: Obstacle | null = null;
  private doorLeaves: THREE.Mesh[] = [];
  private doorK = 0;
  private curtains: THREE.Mesh[] = [];
  private curtainK = [0, 0];
  private clerk: Folk | null = null;
  private pointT = 0;
  private shakeT = 0;
  private bathers: Folk[] = [];
  private steam: THREE.Mesh[] = [];
  private bubbles: THREE.Mesh[] = [];
  private hookRobe: THREE.Object3D | null = null;
  private time = 0;

  /** Paid in (from paying at the door until she walks out). */
  private paid = false;
  private wasInside = false;
  private moodGiven = false;
  private greeted = false;
  private changing: { cabin: number; t: number; swapped: boolean } | null = null;
  private changeReady = 0;
  private seat = -1;
  private readonly water = new StaySession(() => this.getOut(), { tickS: SPA_TICK_S, tick: 'spaTick' });

  get busy(): boolean {
    return !!this.changing || this.water.active;
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
    const site =
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 40, maxD: 130, ...siteOpts }) ??
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 25, maxD: 145, ...siteOpts });
    if (!site) return;
    this.site = site;
    this.build(scene, obstacles, rng, site, kind);
  }

  /* ------------------------------------------------------------ frame helpers */

  private at(lx: number, lz: number, y = 0): THREE.Vector3 {
    return siteToWorld(this.site!, lx, lz, y);
  }
  /** World → site-local (x, z). */
  private local(x: number, z: number): { x: number; z: number } {
    const s = this.site!;
    const c = Math.round(Math.cos(s.rot));
    const si = Math.round(Math.sin(s.rot));
    const dx = x - s.x;
    const dz = z - s.z;
    return { x: dx * c - dz * si, z: dx * si + dz * c };
  }
  private isInside(): boolean {
    if (!this.site) return false;
    const l = this.local(this.hero.position.x, this.hero.position.z);
    return Math.abs(l.x) < HW && l.z < -0.05 && l.z > -DEPTH;
  }
  /** World heading looking along the local direction (dx, dz). */
  private headingAlong(dx: number, dz: number): number {
    return Math.atan2(-dx, -dz) + this.site!.rot;
  }
  private hand = () => new THREE.Vector3(this.ctx.player.x, 1.2, this.ctx.player.z);

  /* ------------------------------------------------------------ build */

  private build(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, site: Site, kind: SpaKind): void {
    const th = THEMES[kind];
    const g = siteGroup(scene, site);
    this.group = g;
    const wall = mat(th.wall, kind === 'ice' ? 0.15 : 0);
    const trim = mat(th.trim);
    const W = (x0: number, x1: number, z0: number, z1: number, h = WALL_H) => obstacles.push(siteBox(site, x0, x1, z0, z1, h));

    // floor (warm deck) + border
    box(g, mat(th.floor), HW * 2, 0.12, DEPTH, 0, 0.06, -DEPTH / 2);
    box(g, mat(th.deck), HW * 2 - 1.2, 0.02, DEPTH - 1.2, 0, 0.13, -DEPTH / 2);

    // low walls (the camera sees in over them) with a coloured top trim
    box(g, wall, HW * 2, WALL_H, 0.3, 0, WALL_H / 2, -DEPTH + 0.15);
    box(g, trim, HW * 2 + 0.1, 0.12, 0.4, 0, WALL_H + 0.06, -DEPTH + 0.15);
    W(-HW, HW, -DEPTH, -DEPTH + 0.3);
    for (const s of [-1, 1]) {
      box(g, wall, 0.3, WALL_H, DEPTH, s * (HW - 0.15), WALL_H / 2, -DEPTH / 2);
      box(g, trim, 0.4, 0.12, DEPTH + 0.1, s * (HW - 0.15), WALL_H + 0.06, -DEPTH / 2);
      W(s < 0 ? -HW : HW - 0.3, s < 0 ? -HW + 0.3 : HW, -DEPTH, 0);
    }
    if (kind === 'ice') {
      // ice-block joints on the walls (reads “gelo”)
      const joint = mat(0x1c7ed6, 0.1);
      for (let i = 1; i < 4; i++) box(g, joint, HW * 2, 0.04, 0.32, 0, i * (WALL_H / 4), -DEPTH + 0.15);
      for (const s of [-1, 1]) for (let i = 1; i < 4; i++) box(g, joint, 0.32, 0.04, DEPTH, s * (HW - 0.15), i * (WALL_H / 4), -DEPTH / 2);
    } else {
      // wooden planks
      const plank = mat(0x8a4b2a);
      for (let i = 1; i < 5; i++) box(g, plank, HW * 2, 0.03, 0.32, 0, i * (WALL_H / 5), -DEPTH + 0.15);
      for (const s of [-1, 1]) for (let i = 1; i < 5; i++) box(g, plank, 0.32, 0.03, DEPTH, s * (HW - 0.15), i * (WALL_H / 5), -DEPTH / 2);
    }

    // entrance: front wall with a door gap, tall arch with a warm steam-drop badge, sliding doors
    const entrance = new THREE.Group();
    g.add(entrance);
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -HW : DOOR_HW;
      const x1 = s < 0 ? -DOOR_HW : HW;
      box(entrance, wall, x1 - x0, WALL_H, 0.3, (x0 + x1) / 2, WALL_H / 2, -0.15);
      box(entrance, trim, x1 - x0 + 0.05, 0.12, 0.4, (x0 + x1) / 2, WALL_H + 0.06, -0.15);
      W(x0, x1, -0.3, 0);
      box(entrance, trim, 0.25, 2.3, 0.4, s * (DOOR_HW + 0.12), 1.15, -0.15);
    }
    box(entrance, trim, DOOR_HW * 2 + 0.6, 0.3, 0.45, 0, 2.3, -0.15);
    const badge = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0x99e9f2, emissive: 0x15aabf, emissiveIntensity: 0.7, roughness: 0.25 }),
    );
    badge.position.set(0, 2.62, -0.1);
    badge.scale.set(1, 1.3, 0.7);
    entrance.add(badge);
    for (const s of [-1, 1]) {
      const leaf = box(entrance, mat(0xe3fafc, 0.1), DOOR_HW, 1.6, 0.08, s * (DOOR_HW / 2), 0.85, -0.05);
      this.doorLeaves.push(leaf);
    }
    this.doorShut = siteBox(site, -DOOR_HW, DOOR_HW, -0.3, 0, WALL_H);
    this.door = { ...this.doorShut };
    obstacles.push(this.door);
    box(g, mat(0x12b886), 1.6, 0.03, 0.7, 0, 0.03, 0.6); // doormat

    // reception desk + attendant (inside, right of the door)
    box(g, mat(0xffffff), 1.5, 0.95, 0.6, DESK.x, 0.48, DESK.z);
    box(g, trim, 1.6, 0.08, 0.7, DESK.x, 0.99, DESK.z);
    W(DESK.x - 0.75, DESK.x + 0.75, DESK.z - 0.3, DESK.z + 0.3, 1.0);
    const clerk = buildFolk({
      shirt: 0x96f2d7,
      pants: 0xffffff,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      dress: true,
      longHair: true,
    });
    clerk.group.position.set(DESK.x, 0, DESK.z - 0.75);
    clerk.group.rotation.y = Math.PI; // faces the door
    g.add(clerk.group);
    this.clerk = clerk;
    W(DESK.x - 0.4, DESK.x + 0.4, DESK.z - 1.15, DESK.z - 0.35, 1.9);

    // changing cabins against the left wall (curtain on the +X side)
    CABIN_Z.forEach((cz, i) => {
      const cab = new THREE.Group();
      g.add(cab);
      for (const s of [-1, 1]) {
        box(cab, mat(0xffffff), CABIN_X1 - CABIN_X0, 2.1, 0.1, (CABIN_X0 + CABIN_X1) / 2, 1.05, cz + s * 0.75);
        W(CABIN_X0, CABIN_X1, cz + s * 0.75 - 0.05, cz + s * 0.75 + 0.05, 2.1);
      }
      box(cab, mat(i === 0 ? 0xf783ac : 0x4dabf7), CABIN_X1 - CABIN_X0 + 0.1, 0.1, 1.6, (CABIN_X0 + CABIN_X1) / 2, 2.15, cz);
      // curtain hinged on the cabin's front-left post: scale.z 0.15 = open (bunched), 1 = closed
      const geo = new THREE.BoxGeometry(0.05, 1.75, 1.45);
      geo.translate(0, 0, 0.725);
      const curtain = new THREE.Mesh(geo, mat(i === 0 ? 0xffc9de : 0xa5d8ff));
      curtain.position.set(CABIN_X1, 1.0, cz - 0.725);
      curtain.scale.z = 0.15;
      cab.add(curtain);
      this.curtains.push(curtain);
      cyl(cab, mat(0xadb5bd), 0.03, 1.5, CABIN_X1, 1.95, cz).rotation.x = Math.PI / 2;
      this.things.push({
        object: cab,
        position: this.at(CABIN_X1 + 0.5, cz),
        radius: 0.8,
        interact: () => this.startChange(i),
      });
    });
    // towel shelf on the back wall + plants
    box(g, mat(0xe9ecef), 2.0, 0.08, 0.35, -2.2, 1.1, -DEPTH + 0.5);
    for (let i = 0; i < 4; i++) box(g, mat([0xffffff, 0xffc9de, 0x99e9f2, 0xffffff][i]), 0.4, 0.22, 0.3, -2.9 + i * 0.47, 1.26, -DEPTH + 0.5);
    for (const [px, pz] of [
      [HW - 0.7, -DEPTH + 0.7],
      [-HW + 0.7, -DEPTH + 0.7],
    ] as const) {
      cyl(g, mat(0x868e96), 0.22, 0.4, px, 0.2, pz);
      cyl(g, mat(kind === 'ice' ? 0x96f2d7 : 0x2f9e44), 0.32, 0.6, px, 0.7, pz);
    }

    // the hot tub: open rim (outer + inner wall + top ring), warm glowing water, steam and bubbles
    const tubG = new THREE.Group();
    tubG.position.set(TUB.x, 0, TUB.z);
    g.add(tubG);
    const rimMat = new THREE.MeshStandardMaterial({ color: th.rim, roughness: 0.6, side: THREE.DoubleSide });
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(TUB.r, TUB.r, TUB.rim, 40, 1, true), rimMat);
    outer.position.y = TUB.rim / 2;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(TUB.inner, TUB.inner, TUB.rim, 40, 1, true), rimMat);
    inner.position.y = TUB.rim / 2;
    const top = new THREE.Mesh(new THREE.RingGeometry(TUB.inner, TUB.r, 40), rimMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = TUB.rim;
    const waterMesh = new THREE.Mesh(
      new THREE.CircleGeometry(TUB.inner, 40),
      new THREE.MeshStandardMaterial({
        color: 0x3bc9db,
        emissive: 0x1098ad,
        emissiveIntensity: 0.45,
        roughness: 0.15,
        transparent: true,
        opacity: 0.9,
      }),
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = TUB.water;
    tubG.add(outer, inner, top, waterMesh);
    // mosaic band on the outside of the rim
    const band = new THREE.Mesh(new THREE.CylinderGeometry(TUB.r + 0.01, TUB.r + 0.01, 0.12, 40, 1, true), mat(th.trim));
    band.position.y = TUB.rim - 0.15;
    tubG.add(band);
    obstacles.push(siteBox(site, TUB.x - TUB.r, TUB.x + TUB.r, TUB.z - TUB.r, TUB.z + TUB.r, TUB.rim));
    const steamMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.28,
      roughness: 1,
      depthWrite: false,
      emissive: 0xffffff,
      emissiveIntensity: 0.15,
    });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 + (i % 3) * 0.07, 8, 6), steamMat);
      const a = (i / 14) * Math.PI * 2;
      const r = 0.4 + (i % 4) * 0.35;
      m.position.set(Math.cos(a) * r, TUB.water + 0.2, Math.sin(a) * r);
      m.userData.phase = i * 0.37;
      tubG.add(m);
      this.steam.push(m);
    }
    const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe3fafc, emissiveIntensity: 0.4, roughness: 0.2 });
    for (let i = 0; i < 22; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + (i % 3) * 0.015, 6, 5), bubbleMat);
      const a = i * 2.4;
      const r = 0.2 + ((i * 0.37) % 1.4);
      b.position.set(Math.cos(a) * r, TUB.water - 0.1, Math.sin(a) * r);
      b.userData.phase = (i * 0.29) % 1;
      tubG.add(b);
      this.bubbles.push(b);
    }
    const glow = new THREE.PointLight(0xffd8a8, 1.4, 12, 1.6);
    glow.position.set(0, 2.4, 0);
    tubG.add(glow);
    // two bathers relaxing in the water (back and right seats), facing the middle
    for (const si of [2, 3]) {
      const [dx, dz] = SEATS[si];
      const f = buildFolk({
        shirt: pick(rng, [0xe03131, 0x1971c2, 0xf08c00, 0x9c36b5]),
        pants: 0x1971c2,
        skin: pick(rng, SKINS),
        hair: pick(rng, HAIRS),
        bare: true,
      });
      f.group.position.set(dx * SEAT_R, -0.75, dz * SEAT_R);
      f.group.rotation.y = Math.atan2(dx, dz); // faces −Z by default → turn to look at the centre
      f.armL.rotation.z = -0.9; // arms resting on the rim
      f.armR.rotation.z = 0.9;
      tubG.add(f.group);
      this.bathers.push(f);
    }
    // robe hook by the front of the tub (her robe hangs here while she is in the water)
    const hookX = TUB.x - 1.6;
    const hookZ = TUB.z + TUB.r + 0.7;
    cyl(g, mat(0xadb5bd), 0.05, 1.8, hookX, 0.9, hookZ);
    cyl(g, mat(0xadb5bd), 0.03, 0.3, hookX, 1.75, hookZ + 0.12).rotation.x = Math.PI / 2;
    const robe = new THREE.Group();
    box(robe, mat(0xfff0f6), 0.5, 0.95, 0.18, 0, -0.5, 0);
    box(robe, mat(0xf783ac), 0.52, 0.07, 0.2, 0, -0.45, 0);
    robe.position.set(hookX, 1.72, hookZ + 0.25);
    robe.visible = false;
    g.add(robe);
    this.hookRobe = robe;
    W(hookX - 0.1, hookX + 0.1, hookZ - 0.1, hookZ + 0.1, 1.8);

    // corner lanterns (warm at night, cosy by day)
    const lantern = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xff922b, emissiveIntensity: 1.1 });
    for (const [lx, lz] of [
      [-HW + 0.3, -0.3],
      [HW - 0.3, -0.3],
      [-HW + 0.3, -DEPTH + 0.3],
      [HW - 0.3, -DEPTH + 0.3],
    ] as const) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lantern);
      l.position.set(lx, WALL_H + 0.35, lz);
      g.add(l);
    }

    // entrance (pay) — click / Enter at the door
    const stand = this.at(0, 1.3);
    this.stand = stand.clone();
    const payTo = this.at(DESK.x, DESK.z - 0.75, 1.1);
    this.things.push({
      object: entrance,
      position: stand,
      radius: 2.6,
      requiresClick: true,
      interact: () => this.pay(payTo),
      update: (dt) => this.tick(dt),
    });
    // the hot water — tap it (from anywhere inside) or Enter next to it
    this.things.push({
      object: tubG,
      position: this.at(TUB.x, TUB.z),
      radius: TUB.r + 0.9,
      requiresClick: true,
      reach: 14,
      keepClear: TUB.r + 0.4,
      interact: () => this.getIn(),
    });
    this.zoneBox = siteBox(site, -HW, HW, -DEPTH, 0);
  }

  /* ------------------------------------------------------------ actions */

  private pay(payTo: THREE.Vector3): boolean {
    if (this.paid || this.isInside() || this.busy || this.fly.busy) return false;
    if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
    if (this.ctx.coins() < SPA_COST) {
      this.shakeT = 1.2;
      this.ctx.say([`O spa são ${SPA_COST} moedas.`]);
      tone(196, 0, 0.3, 'sine', 0.13);
      return false;
    }
    this.ctx.addCoins(-SPA_COST);
    for (let i = 0; i < Math.min(SPA_COST, 4); i++) {
      this.fly.send(coinMesh(), this.hand(), payTo, 0.4, i * 0.1, () => tone(800, 0, 0.05, 'square', 0.04));
    }
    this.paid = true;
    this.wasInside = false;
    this.moodGiven = false;
    this.greeted = false;
    this.ctx.say(['Entra!', 'Primeiro veste o roupão na cabina.']);
    [523, 659].forEach((f, i) => tone(f, 0.3 + i * 0.12, 0.2, 'sine', 0.05));
    return true;
  }

  private startChange(i: number): boolean {
    if (this.busy || performance.now() < this.changeReady || !this.isInside()) return false;
    if (!this.paid) {
      this.ctx.say(['Primeiro paga à entrada!']);
      return false;
    }
    this.changing = { cabin: i, t: 0, swapped: false };
    this.ctx.hold(true);
    const p = this.hero;
    const inCab = this.at((CABIN_X0 + CABIN_X1) / 2, CABIN_Z[i]);
    p.position.set(inCab.x, 0, inCab.z);
    p.heading = this.headingAlong(1, 0); // facing the curtain
    return true;
  }

  private updateChange(dt: number): void {
    const ch = this.changing;
    if (!ch) return;
    ch.t += dt;
    const k = ch.t < 0.4 ? ch.t / 0.4 : ch.t < 1.6 ? 1 : Math.max(0, 1 - (ch.t - 1.6) / 0.4);
    this.curtainK[ch.cabin] = k;
    if (!ch.swapped && ch.t >= 0.9) {
      ch.swapped = true;
      this.hero.setRobe(!this.hero.robe);
      // rustle rustle
      for (let j = 0; j < 4; j++) tone(180 + j * 40, j * 0.08, 0.06, 'triangle', 0.04);
    }
    if (ch.t >= 2.0) {
      const out = this.at(CABIN_X1 + 1.5, CABIN_Z[ch.cabin]);
      this.hero.position.set(out.x, 0, out.z);
      this.hero.heading = this.headingAlong(1, 0);
      this.changing = null;
      this.changeReady = performance.now() + 1500;
      this.ctx.hold(false);
      if (this.hero.robe) {
        this.ctx.say(['Que roupão fofinho!']);
        [659, 784].forEach((f, j) => tone(f, j * 0.1, 0.18, 'sine', 0.05));
      }
    }
  }

  private getIn(): boolean {
    if (!this.isInside() || this.busy || !this.water.ready) return false;
    if (this.ctx.isPaused()) return false;
    if (!this.paid) {
      this.ctx.say(['Primeiro paga à entrada!']);
      return false;
    }
    if (!this.hero.robe) {
      this.pointT = 2.2;
      this.ctx.say(['Primeiro veste o roupão na cabina!']);
      tone(330, 0, 0.2, 'sine', 0.06);
      return false;
    }
    // nearest of her seats
    const l = this.local(this.hero.position.x, this.hero.position.z);
    let best = HER_SEATS[0];
    let bestD = Infinity;
    for (const si of HER_SEATS) {
      const [dx, dz] = SEATS[si];
      const d = Math.hypot(TUB.x + dx * SEAT_R - l.x, TUB.z + dz * SEAT_R - l.z);
      if (d < bestD) {
        bestD = d;
        best = si;
      }
    }
    this.seat = best;
    this.ctx.hold(true);
    // the robe goes on the hook; in the water she's in her swimsuit (robe flag stays: it comes back when she gets out)
    this.hero.setSwimwear(true);
    if (this.hookRobe) this.hookRobe.visible = true;
    this.placeInWater();
    this.water.start();
    // splash + warm chord
    tone(220, 0, 0.25, 'triangle', 0.05);
    [392, 494, 587].forEach((f, i) => tone(f, 0.15 + i * 0.1, 0.3, 'sine', 0.04));
    if (!this.moodGiven) {
      this.moodGiven = true;
      feel('spa');
    }
    if (!this.greeted) {
      this.greeted = true;
      this.ctx.say(['Que água quentinha!']);
    }
    return true;
  }

  private placeInWater(): void {
    const [dx, dz] = SEATS[this.seat];
    const at = this.at(TUB.x + dx * SEAT_R, TUB.z + dz * SEAT_R);
    const p = this.hero;
    p.sitting = true;
    p.airborne = true;
    p.lyingY = null;
    p.position.set(at.x, SEAT_Y - 0.7, at.z);
    p.heading = this.headingAlong(-dx, -dz); // looking at the middle of the tub
  }

  /** Any key / tap (StaySession, next frame): out of the water, robe back on, standing by the tub. */
  private getOut(): void {
    const p = this.hero;
    p.sitting = false;
    p.airborne = false;
    p.root.rotation.x = 0;
    p.root.rotation.z = 0;
    p.setSwimwear(false); // robe is back (robe flag still set)
    if (this.hookRobe) this.hookRobe.visible = false;
    const [dx, dz] = SEATS[this.seat];
    const out = this.at(TUB.x + dx * (TUB.r + 0.6), TUB.z + dz * (TUB.r + 0.6));
    p.position.set(out.x, 0, out.z);
    p.heading = this.headingAlong(dx, dz); // back to the tub
    this.seat = -1;
    tone(294, 0, 0.2, 'triangle', 0.04);
    this.ctx.hold(false);
  }

  /** The visit ends when she walks out: the robe stays here (never in the street in a robe). */
  private leave(): void {
    this.paid = false;
    this.wasInside = false;
    if (this.hero.robe) {
      this.hero.setRobe(false);
      this.ctx.say(['O roupão fica no spa. Até breve!']);
      tone(523, 0, 0.15, 'sine', 0.04);
    }
  }

  /* ------------------------------------------------------------ per frame */

  private tick(dt: number): void {
    this.fly.update(dt);
    this.time += dt;
    if (!this.site) return;
    const t = this.time;
    const inside = this.isInside();
    if (inside) this.wasInside = true;
    if (!this.busy) {
      if (this.paid && this.wasInside && !inside) this.leave();
      else if (!inside && this.hero.robe) this.hero.setRobe(false); // teleported out (Casa, menu…)
    }

    // sliding doors + the door gap: open while paid, or while she's inside (she can always walk out)
    const l = this.local(this.hero.position.x, this.hero.position.z);
    const open = this.paid || l.z < 0.3; // closed she can't get nearer than ~0.45 m from outside
    this.doorK += ((open ? 1 : 0) - this.doorK) * Math.min(1, dt * 4);
    this.doorLeaves.forEach((leaf, i) => {
      const s = i === 0 ? -1 : 1;
      leaf.position.x = s * (DOOR_HW / 2 + this.doorK * DOOR_HW * 0.95);
    });
    if (this.door && this.doorShut) {
      if (open) {
        this.door.minX = this.door.maxX = 1e6;
        this.door.minZ = this.door.maxZ = 1e6;
      } else Object.assign(this.door, this.doorShut);
    }

    this.updateChange(dt);
    this.curtains.forEach((c, i) => {
      if (!this.changing || this.changing.cabin !== i) this.curtainK[i] = Math.max(0, this.curtainK[i] - dt * 3);
      c.scale.z = 0.15 + this.curtainK[i] * 0.85;
    });

    if (this.water.active && this.water.update(dt)) this.placeInWater();

    // steam drifting up, bubbles rising (more when she is in)
    const boost = this.water.active ? 1.4 : 1;
    for (const m of this.steam) {
      const ph = (t * 0.25 * boost + (m.userData.phase as number)) % 1;
      m.position.y = TUB.water + 0.15 + ph * 1.6;
      m.scale.setScalar((0.6 + ph * 1.1) * (0.9 + 0.1 * Math.sin(t * 2 + (m.userData.phase as number) * 9)));
    }
    for (const b of this.bubbles) {
      const ph = (t * 0.9 * boost + (b.userData.phase as number)) % 1;
      b.position.y = TUB.water - 0.12 + ph * 0.16;
      b.visible = ph < 0.92;
    }
    // bathers bob gently
    this.bathers.forEach((f, i) => {
      f.group.position.y = -0.75 + Math.sin(t * 1.3 + i * 2) * 0.03;
      f.head.rotation.z = Math.sin(t * 0.7 + i) * 0.12;
    });
    // attendant: idle look, shake (no coins), point at the cabins (no robe)
    const c = this.clerk;
    if (c) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      this.pointT = Math.max(0, this.pointT - dt);
      c.head.rotation.y = this.shakeT > 0 ? Math.sin(t * 14) * 0.45 : Math.sin(t * 0.6) * 0.12;
      // she faces the door (+Z): her right arm is on the cabins' side (−X); lift it sideways to point
      c.armR.rotation.z = this.pointT > 0 ? 1.45 : 0;
    }
  }

  dispose(): void {
    if (this.water.active) {
      this.water.stop();
      this.hero.sitting = false;
      this.hero.airborne = false;
      this.hero.setSwimwear(false);
      this.ctx.hold(false);
    }
    if (this.changing) {
      this.changing = null;
      this.ctx.hold(false);
    }
    this.hero.setRobe(false);
    this.fly.clear();
    if (this.group) {
      this.group.parent?.remove(this.group);
      this.group = null;
    }
  }

  /** Nothing may spawn inside the SPA. */
  zone(): Obstacle | null {
    return this.zoneBox;
  }

  debug(): Record<string, unknown> {
    const r = (v: THREE.Vector3) => [+v.x.toFixed(1), +v.z.toFixed(1)];
    return {
      on: !!this.site,
      kind: this.kind,
      stand: this.stand ? r(this.stand) : null,
      rot: this.site ? +this.site.rot.toFixed(2) : null,
      paid: this.paid,
      inside: this.isInside(),
      robe: this.hero.robe,
      swim: this.hero.swimwear,
      inWater: this.water.active,
      t: +this.water.t.toFixed(1),
      ticks: this.water.ticks,
      changing: !!this.changing,
      tub: this.site ? r(this.at(TUB.x, TUB.z)) : null,
      cabins: this.site ? CABIN_Z.map((cz) => r(this.at(CABIN_X1 + 0.5, cz))) : null,
      cost: SPA_COST,
    };
  }
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
