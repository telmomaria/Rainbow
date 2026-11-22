import * as THREE from 'three';
import { chirp, sfx, tone } from './audio';
import type { GameCtx } from './gamectx';
import { Flyers, coinMesh, roadsideSite, siteBox, siteGroup, siteToWorld, type Site } from './places';
import { ball, box, buildFolk, cyl, mat, type Folk } from './venue';
import type { Interactable, Obstacle, World } from './world';

/**
 * Brincar na neve (Nuuk only — Telmo, 2026-11-21: "remove o parque de diversões, coloca bonecos de neve, buracos no
 * gelo, crianças a brincar e a atirar bolas. A personagem também pode atirar.").
 *
 * One open snow field beside a road (set back like a shop plot, never at the start point), all discovered by touch:
 *  - 3 snowmen (carrot nose, hat + scarf): touching one = the hat jumps and spins, it wobbles, waves its stick arms,
 *    a puff of snow;
 *  - a frozen lake with 3 round ice holes (dark water, she can't step in): touching one = a fish leaps out and dives
 *    back; the first time at each hole (per city) she fishes a coin (+1). Fish also leap by themselves now and then;
 *  - children in winter clothes: two pairs throwing snowballs at each other (arc, *puf*, laughter), one sledging
 *    down a snow ramp, one putting the head on a snowman (it falls off, she laughs, again);
 *  - two snow piles: tapping one (or Enter beside it) = she picks up a snowball (in her hand); then a tap anywhere
 *    throws it there (a child, the ground…); with the keys Enter throws it straight ahead. Hitting a child = the child
 *    laughs and throws one back at her (a harmless puf, nothing lost).
 * No UI, no text. Site frame (places.ts): x across, +Z = the road side, the field is z ∈ [−D, 0].
 */

const HW = 13;
const D = 20;
const QA = new URLSearchParams(location.search).has('debug');
const HAND = new THREE.Vector3(0.42, 1.0, -0.32); // same spot as items held in her hand (main.ts holdItem)

const snowMat = mat(0xffffff);
const snowGeo = new THREE.SphereGeometry(1, 12, 10);
const ballGeo = new THREE.SphereGeometry(0.17, 10, 8);
const flakeGeo = new THREE.SphereGeometry(0.09, 6, 5);

function snowball(): THREE.Mesh {
  const m = new THREE.Mesh(ballGeo, snowMat);
  m.castShadow = true;
  return m;
}

/** Heading (0 = facing −Z) of someone at (x, z) looking at (tx, tz), all in the same frame. */
const look = (x: number, z: number, tx: number, tz: number): number => Math.atan2(-(tx - x), -(tz - z));

/* ------------------------------------------------------------------ puffs */

interface Flake {
  m: THREE.Mesh;
  v: THREE.Vector3;
  t: number;
  life: number;
}

class Puffs {
  private list: Flake[] = [];
  constructor(private readonly root: THREE.Object3D) {}
  /** A little burst of snow (or water) at p (root frame). */
  burst(p: THREE.Vector3, n = 12, color = 0xffffff, up = 2.2): void {
    const m = color === 0xffffff ? snowMat : mat(color);
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(flakeGeo, m);
      f.position.copy(p);
      const a = Math.random() * Math.PI * 2;
      const s = 0.8 + Math.random() * 1.6;
      this.root.add(f);
      this.list.push({ m: f, v: new THREE.Vector3(Math.cos(a) * s, up * (0.5 + Math.random()), Math.sin(a) * s), t: 0, life: 0.55 + Math.random() * 0.3 });
    }
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      f.v.y -= 7 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.m.position.y < 0.03) f.m.position.y = 0.03;
      f.m.scale.setScalar(Math.max(0.05, 1 - f.t / f.life));
      if (f.t >= f.life) {
        f.m.removeFromParent();
        this.list.splice(i, 1);
      }
    }
  }
}

const pufSound = (): void => {
  tone(240, 0, 0.07, 'triangle', 0.07);
  tone(150, 0.03, 0.12, 'sine', 0.06);
};

/* ------------------------------------------------------------------ children */

interface Kid {
  f: Folk;
  home: THREE.Vector3;
  role: 'throw' | 'sled' | 'build';
  partner?: Kid;
  /** seconds until the next throw (throwers) */
  next: number;
  /** wind-up timer (>0 = arm going back) */
  wind: number;
  /** who the wind-up is aimed at: a kid or 'her' */
  aim: Kid | 'her' | null;
  laugh: number;
  t: number;
}

function buildKid(jacket: number, pants: number, skin: number, hair: number, hat: number, scarf: number, girl: boolean): Folk {
  const f = buildFolk({ shirt: jacket, pants, skin, hair, longHair: girl });
  // beanie with a pompom
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.335, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat));
  beanie.position.y = 0.06;
  f.head.add(beanie);
  cyl(f.head, mat(0xffffff), 0.34, 0.1, 0, 0.07, 0);
  ball(f.head, mat(0xffffff), 0.11, 0, 0.42, 0);
  // scarf round the neck + a loose end
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.08, 8, 16), mat(scarf));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.68;
  f.body.add(ring);
  box(f.body, mat(scarf), 0.14, 0.4, 0.06, 0.14, 1.45, -0.3);
  f.group.scale.setScalar(0.62);
  return f;
}

/* ------------------------------------------------------------------ snowmen */

interface Snowman {
  root: THREE.Group;
  hat: THREE.Object3D;
  arms: THREE.Object3D[];
  t: number; // reaction time (−1 = idle)
}

function buildSnowman(g: THREE.Group, x: number, z: number, h: number, hatColor: number, scarfColor: number, topHat: boolean, scale = 1): Snowman {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = h;
  root.scale.setScalar(scale);
  g.add(root);
  const sizes: [number, number][] = [
    [0.62, 0.55],
    [0.45, 1.38],
    [0.32, 2.0],
  ];
  for (const [r, y] of sizes) {
    const s = new THREE.Mesh(snowGeo, snowMat);
    s.scale.setScalar(r);
    s.position.y = y;
    s.castShadow = true;
    s.receiveShadow = true;
    root.add(s);
  }
  const dark = mat(0x1b1b1b);
  for (const sx of [-0.11, 0.11]) ball(root, dark, 0.045, sx, 2.08, -0.28);
  for (let i = 0; i < 3; i++) ball(root, dark, 0.05, 0, 1.2 + i * 0.17, -0.43 + Math.abs(i - 1) * 0.02);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 8), mat(0xff7a1a));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 2.0, -0.44);
  root.add(nose);
  // smile of little coal stones
  for (let i = -2; i <= 2; i++) ball(root, dark, 0.025, i * 0.06, 1.89 + Math.abs(i) * 0.02, -0.29);
  // scarf
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 8, 18), mat(scarfColor));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.72;
  root.add(ring);
  box(root, mat(scarfColor), 0.15, 0.45, 0.07, 0.2, 1.5, -0.36);
  // hat
  const hat = new THREE.Group();
  hat.position.y = 2.24;
  root.add(hat);
  if (topHat) {
    cyl(hat, mat(hatColor), 0.34, 0.04, 0, 0.02, 0);
    cyl(hat, mat(hatColor), 0.22, 0.38, 0, 0.21, 0);
    cyl(hat, mat(0xfa5252), 0.225, 0.07, 0, 0.08, 0);
  } else {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hatColor));
    hat.add(b);
    ball(hat, mat(0xffffff), 0.1, 0, 0.32, 0);
  }
  // stick arms (pivot at the shoulder)
  const wood = mat(0x6b4226);
  const arms = [-1, 1].map((side) => {
    const p = new THREE.Group();
    p.position.set(side * 0.4, 1.45, 0);
    p.rotation.z = side * -0.9;
    const stick = cyl(p, wood, 0.03, 0.8, 0, 0.4, 0);
    stick.castShadow = true;
    cyl(p, wood, 0.02, 0.25, side * -0.08, 0.7, 0).rotation.z = side * 0.6;
    root.add(p);
    return p;
  });
  return { root, hat, arms, t: -1 };
}

/* ------------------------------------------------------------------ projectiles */

interface Shot {
  m: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  by: Kid | 'her';
  /** the kid aimed at (kid throws), or 'her' */
  at: Kid | 'her' | null;
}

export interface SnowPlayHost {
  /** her model root (the snowball sits in her hand on it) */
  root: THREE.Object3D;
  /** her heading (read + turned toward a throw) */
  heading: number;
}

export class SnowPlay {
  private g: THREE.Group;
  private site: Site;
  readonly things: Interactable[] = [];
  /** No-spawn / keep-out rectangle (world). */
  readonly zone: Obstacle;
  private puffs: Puffs;
  private flyers: Flyers;
  private kids: Kid[] = [];
  private shots: Shot[] = [];
  private snowmen: Snowman[] = [];
  private holes: { p: THREE.Vector3; fish: THREE.Object3D; t: number; auto: number }[] = [];
  private held: THREE.Mesh | null = null;
  private greeted = false;
  private time = 0;
  private lastLaugh = -9;
  private stats = { thrown: 0, hits: 0, back: 0, fish: 0, snowman: 0, kidThrows: 0 };
  // sledder / builder
  private sled: { kid: Kid; sled: THREE.Object3D; t: number } | null = null;
  private build: { kid: Kid; head: THREE.Object3D; t: number } | null = null;
  private onQa?: (e: Event) => void;

  private constructor(
    scene: THREE.Scene,
    site: Site,
    obstacles: Obstacle[],
    private readonly ctx: GameCtx,
    private readonly host: SnowPlayHost,
  ) {
    this.site = site;
    this.g = siteGroup(scene, site);
    this.zone = siteBox(site, -HW, HW, -D, 0);
    this.puffs = new Puffs(this.g);
    this.flyers = new Flyers(scene);
    this.buildGround();
    this.buildLake(obstacles);
    this.buildSnowmen(obstacles);
    this.buildPiles(obstacles);
    this.buildRamp(obstacles);
    this.buildKids(obstacles);
    if (QA) {
      document.body.dataset.snow = JSON.stringify(site);
      this.onQa = (e) => this.qa((e as CustomEvent).detail);
      window.addEventListener('rainbow-snow', this.onQa);
    }
  }

  /** The snow field, or null if the city has no room (a crowded city clears placeholder buildings). */
  static create(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx, host: SnowPlayHost, world?: World): SnowPlay | null {
    const opts = { minD: 28, maxD: 85 };
    let site = roadsideSite(obstacles, rng, HW, D, opts);
    if (!site && world) {
      site = roadsideSite(obstacles.filter((o) => !world.buildings.has(o)), rng, HW, D, opts);
      if (site) world.clearArea(siteBox(site, -HW, HW, -D, 0), 2);
    }
    if (!site) return null;
    return new SnowPlay(scene, site, obstacles, ctx, host);
  }

  /** Local (site) point → world. */
  private w(p: THREE.Vector3): THREE.Vector3 {
    return siteToWorld(this.site, p.x, p.z, p.y);
  }
  /** Her position in the site frame. */
  private herLocal(): THREE.Vector3 {
    return this.g.worldToLocal(this.ctx.player.clone());
  }

  /* ---------------------------------------------------------------- building */

  private buildGround(): void {
    // a bright fresh-snow field (a touch whiter and bumpier than the street snow)
    const field = new THREE.Mesh(new THREE.BoxGeometry(2 * HW, 0.05, D), mat(0xffffff));
    field.position.set(0, 0.025, -D / 2);
    field.receiveShadow = true;
    this.g.add(field);
    const drift = mat(0xf4f9ff);
    for (const [x, z, r] of [
      [-12, -1.5, 1.2],
      [12, -2, 1.4],
      [-12.2, -19, 1.5],
      [12.3, -19.2, 1.2],
      [0, -19.5, 1.0],
      [6, -0.8, 0.8],
    ]) {
      const d = new THREE.Mesh(snowGeo, drift);
      d.scale.set(r, r * 0.35, r);
      d.position.set(x, 0, z);
      d.receiveShadow = true;
      this.g.add(d);
    }
    // little pine trees with snow on the corners (decor, off the paths)
    for (const [x, z] of [
      [-12.3, -7],
      [12.4, -5],
      [-4.5, -19.3],
    ]) {
      cyl(this.g, mat(0x6b4226), 0.12, 0.6, x, 0.3, z);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.9 - i * 0.22, 0.9, 10), mat(i === 2 ? 0xffffff : 0x2f7d4f));
        c.position.set(x, 0.8 + i * 0.55, z);
        c.castShadow = true;
        this.g.add(c);
      }
    }
  }

  private buildLake(obstacles: Obstacle[]): void {
    const C = new THREE.Vector3(-7, 0, -12);
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(4.6, 40),
      new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.15, metalness: 0.15 }),
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(C.x, 0.06, C.z);
    ice.receiveShadow = true;
    this.g.add(ice);
    // snowy rim + a few cracks/scratches
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.65, 0.22, 6, 40), snowMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(C.x, 0.05, C.z);
    this.g.add(rim);
    const scratch = mat(0xe7f5ff);
    for (const [x, z, r] of [
      [-6, -10, 0.4],
      [-8.2, -12.6, -0.7],
      [-5.6, -14.2, 1.1],
    ]) {
      const s = box(this.g, scratch, 1.4, 0.01, 0.05, x, 0.07, z);
      s.rotation.y = r;
      s.castShadow = false;
    }
    const water = new THREE.MeshStandardMaterial({ color: 0x0b2a4a, roughness: 0.05, metalness: 0.3 });
    const holes: [number, number][] = [
      [-8.8, -10.4],
      [-5.2, -11.2],
      [-7.4, -14.4],
    ];
    for (const [x, z] of holes) {
      const hg = new THREE.Group();
      hg.position.set(x, 0, z);
      this.g.add(hg);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), water);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.075;
      hg.add(hole);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 24), snowMat);
      lip.rotation.x = -Math.PI / 2;
      lip.position.y = 0.09;
      hg.add(lip);
      // she can stand at the edge but never step into the hole
      obstacles.push(siteBox(this.site, x - 0.62, x + 0.62, z - 0.62, z + 0.62, 0.3));
      const fish = this.buildFish();
      fish.visible = false;
      fish.position.set(x, 0, z);
      this.g.add(fish);
      const p = new THREE.Vector3(x, 0, z);
      const i = this.holes.length;
      this.holes.push({ p, fish, t: -1, auto: 3 + i * 4 + Math.random() * 3 });
      this.things.push({
        object: hg,
        position: this.w(p),
        radius: 1.55,
        interact: () => {
          if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
          this.leap(i, true);
        },
      });
    }
  }

  private buildFish(): THREE.Group {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat(0xff922b));
    body.scale.set(1, 0.7, 2);
    f.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), mat(0xff6b00));
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = 0.4;
    f.add(tail);
    for (const s of [-1, 1]) ball(f, mat(0x111111), 0.03, s * 0.09, 0.04, -0.24);
    return f;
  }

  /** A fish jumps out of hole i (and, the first time she touches each hole, she fishes a coin). */
  private leap(i: number, byHer: boolean): void {
    const h = this.holes[i];
    if (h.t >= 0 && !byHer) return;
    if (h.t < 0 || h.t > 0.6) {
      h.t = 0;
      this.puffs.burst(h.p.clone().setY(0.12), 8, 0x9fd8ff, 1.6);
      tone(520, 0, 0.08, 'sine', 0.05);
      tone(780, 0.06, 0.1, 'sine', 0.04);
    }
    if (!byHer) return;
    const key = `snow:fish:${this.ctx.city()}:${i}`;
    if (this.ctx.flag(key)) return;
    this.ctx.setFlag(key, 1);
    this.stats.fish++;
    const from = this.w(h.p.clone().setY(0.5));
    this.flyers.send(coinMesh(), from, () => this.ctx.player.clone().setY(1.2), 0.7, 0.45, () => {
      this.ctx.addCoins(1);
      sfx.coin();
    });
  }

  private buildSnowmen(obstacles: Obstacle[]): void {
    const spots: [number, number, number, number, number, boolean][] = [
      // x, z, heading, hat, scarf, top hat
      [-10.5, -3.5, 0.5, 0x212529, 0xfa5252, true],
      [9.5, -3.2, -0.4, 0x4dabf7, 0xfcc419, false],
      [6.8, -18.8, 0.1, 0xcc5de8, 0x51cf66, false],
    ];
    for (const [x, z, h, hat, scarf, top] of spots) {
      const s = buildSnowman(this.g, x, z, h, hat, scarf, top);
      const i = this.snowmen.length;
      this.snowmen.push(s);
      obstacles.push(siteBox(this.site, x - 0.65, x + 0.65, z - 0.65, z + 0.65, 1.6));
      this.things.push({
        object: s.root,
        position: this.w(new THREE.Vector3(x, 0, z)),
        radius: 1.7,
        interact: () => {
          if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
          this.poke(i);
        },
      });
    }
  }

  private poke(i: number): void {
    const s = this.snowmen[i];
    if (s.t >= 0 && s.t < 1.6) return;
    s.t = 0;
    this.stats.snowman++;
    this.puffs.burst(s.root.position.clone().setY(2.3), 14, 0xffffff, 2.6);
    [392, 523, 659, 784].forEach((f, k) => tone(f, k * 0.07, 0.12, 'triangle', 0.05));
    tone(220, 0.35, 0.18, 'sine', 0.05);
  }

  private piles: THREE.Vector3[] = [];
  private buildPiles(obstacles: Obstacle[]): void {
    for (const [x, z] of [
      [-1.5, -4.5],
      [5.5, -11.5],
    ]) {
      const pile = new THREE.Group();
      pile.position.set(x, 0, z);
      this.g.add(pile);
      for (const [dx, dz, r] of [
        [0, 0, 0.75],
        [0.5, 0.3, 0.45],
        [-0.45, 0.2, 0.5],
        [0.1, -0.45, 0.45],
      ]) {
        const m = new THREE.Mesh(snowGeo, snowMat);
        m.scale.set(r, r * 0.7, r);
        m.position.set(dx, 0.05, dz);
        m.castShadow = true;
        m.receiveShadow = true;
        pile.add(m);
      }
      // a few ready snowballs on top
      for (const [dx, dz] of [
        [0.15, 0.1],
        [-0.2, 0.15],
        [0.05, -0.2],
      ]) {
        const b = snowball();
        b.position.set(dx, 0.62, dz);
        pile.add(b);
      }
      const p = new THREE.Vector3(x, 0, z);
      this.piles.push(p);
      obstacles.push(siteBox(this.site, x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0.6));
      this.things.push({
        object: pile,
        position: this.w(p),
        radius: 1.9,
        requiresClick: true,
        interact: () => {
          if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
          this.pickUp(p);
        },
      });
    }
  }

  private buildRamp(obstacles: Obstacle[]): void {
    // a snow ramp: platform at z −17.5…−16 (2 m high) sloping down to z −8, x 8.8…11.2; steps behind
    const shape = new THREE.Shape();
    shape.moveTo(18.5, 0);
    shape.lineTo(18.5, 2);
    shape.lineTo(16, 2);
    shape.lineTo(8, 0);
    shape.lineTo(18.5, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false });
    geo.rotateY(Math.PI / 2); // shape x → −z, extrusion → +x
    const ramp = new THREE.Mesh(geo, mat(0xf8fbff));
    ramp.position.set(8.8, 0, 0);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.g.add(ramp);
    // blue slide track on the slope
    const track = box(this.g, mat(0x74c0fc), 1.2, 0.04, Math.hypot(8, 2), 10, 1.02, -12);
    track.rotation.x = Math.atan2(2, 8);
    // side snow steps on the back
    for (let i = 0; i < 4; i++) box(this.g, mat(0xe9f3fb), 1.2, 0.5 * (i + 1), 0.6, 11.8, 0.25 * (i + 1), -14.9 - i * 0.6);
    obstacles.push(siteBox(this.site, 8.6, 12.5, -18.7, -9.5, 2));
  }

  private buildKids(obstacles: Obstacle[]): void {
    const looks: [number, number, number, number, number, number, boolean][] = [
      // jacket, pants, skin, hair, beanie, scarf, girl
      [0xff6b6b, 0x364fc7, 0xf1c27d, 0x2b1d14, 0x4dabf7, 0xfcc419, true],
      [0x4dabf7, 0x495057, 0xc68642, 0x111111, 0xff6b6b, 0x51cf66, false],
      [0xfcc419, 0x862e9c, 0xffdbac, 0xe8c547, 0xcc5de8, 0xff922b, true],
      [0x51cf66, 0x1b1b1b, 0x8d5524, 0x111111, 0xfcc419, 0x4dabf7, false],
      [0xcc5de8, 0x364fc7, 0xe0ac69, 0x5a3825, 0x20c997, 0xf783ac, true],
      [0xff922b, 0x2b8a3e, 0xf1c27d, 0xb5651d, 0x748ffc, 0xff6b6b, false],
    ];
    const homes: [number, number, Kid['role']][] = [
      [-1.5, -8.5, 'throw'],
      [4.0, -7.0, 'throw'],
      [0.5, -15.0, 'throw'],
      [5.5, -15.5, 'throw'],
      [10, -7, 'sled'],
      [1.6, -18.2, 'build'],
    ];
    homes.forEach(([x, z, role], i) => {
      const [j, p, s, h, b, sc, girl] = looks[i];
      const f = buildKid(j, p, s, h, b, sc, girl);
      f.group.position.set(x, 0, z);
      this.g.add(f.group);
      const kid: Kid = { f, home: new THREE.Vector3(x, 0, z), role, next: 1 + i * 0.9, wind: 0, aim: null, laugh: 0, t: Math.random() * 5 };
      this.kids.push(kid);
      if (role !== 'sled') obstacles.push(siteBox(this.site, x - 0.45, x + 0.45, z - 0.45, z + 0.45, 1.4));
    });
    const [a, b, c, d] = this.kids;
    a.partner = b;
    b.partner = a;
    c.partner = d;
    d.partner = c;
    for (const k of [a, b, c, d]) k.f.group.rotation.y = look(k.home.x, k.home.z, k.partner!.home.x, k.partner!.home.z);
    // sledger: a red sled that rides with her
    const sled = new THREE.Group();
    box(sled, mat(0xe03131), 0.9, 0.1, 1.5, 0, 0.18, 0);
    for (const sx of [-0.4, 0.4]) {
      box(sled, mat(0x868e96), 0.06, 0.06, 1.6, sx, 0.05, 0.05);
      box(sled, mat(0x868e96), 0.06, 0.16, 0.06, sx, 0.11, -0.5);
      box(sled, mat(0x868e96), 0.06, 0.16, 0.06, sx, 0.11, 0.5);
    }
    this.g.add(sled);
    this.sled = { kid: this.kids[4], sled, t: 0 };
    // builder: a small snowman next to her; she carries its head and puts it on
    const sm = buildSnowman(this.g, 2.8, -18.6, -0.6, 0xfa5252, 0x4dabf7, false, 0.55);
    sm.root.children.filter((o) => o.position.y > 1.85).forEach((o) => o.removeFromParent()); // no head parts yet
    sm.hat.removeFromParent();
    const head = new THREE.Group();
    const hb = new THREE.Mesh(snowGeo, snowMat);
    hb.scale.setScalar(0.32 * 0.55);
    hb.castShadow = true;
    head.add(hb);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 8), mat(0xff7a1a));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -0.24);
    head.add(nose);
    for (const sx of [-0.06, 0.06]) ball(head, mat(0x1b1b1b), 0.025, sx, 0.05, -0.15);
    this.g.add(head);
    this.build = { kid: this.kids[5], head, t: 0 };
    obstacles.push(siteBox(this.site, 2.4, 3.2, -19, -18.2, 1.2));
  }

  /* ---------------------------------------------------------------- her snowball */

  get holding(): boolean {
    return !!this.held;
  }

  private pickUp(pileLocal: THREE.Vector3): void {
    if (this.held) return;
    if (this.ctx.carried()) this.ctx.stowCarried(); // bread / ice cream… back to the bag; the snowball takes its place (Telmo, 2026-11-21)
    this.held = snowball();
    this.held.position.copy(HAND);
    this.host.root.add(this.held);
    this.puffs.burst(pileLocal.clone().setY(0.6), 6, 0xffffff, 1.4);
    tone(330, 0, 0.06, 'triangle', 0.05);
    tone(440, 0.05, 0.08, 'triangle', 0.05);
  }

  private drop(): void {
    this.held?.removeFromParent();
    this.held = null;
  }

  /** Throw her snowball at a world point (range capped). */
  private throwAt(target: THREE.Vector3): void {
    if (!this.held) return;
    this.host.root.updateMatrixWorld(true);
    const fromW = this.host.root.localToWorld(HAND.clone());
    const dx = target.x - this.ctx.player.x;
    const dz = target.z - this.ctx.player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) return;
    this.host.heading = Math.atan2(-dx, -dz);
    // recompute the hand after turning
    this.host.root.rotation.y = this.host.heading;
    this.host.root.updateMatrixWorld(true);
    fromW.copy(this.host.root.localToWorld(HAND.clone()));
    const range = Math.min(dist, 16);
    const toW = new THREE.Vector3(this.ctx.player.x + (dx / dist) * range, Math.min(target.y, 1.0), this.ctx.player.z + (dz / dist) * range);
    if (range < dist) toW.y = 0;
    this.drop();
    const from = this.g.worldToLocal(fromW);
    const to = this.g.worldToLocal(toW);
    const m = snowball();
    m.position.copy(from);
    this.g.add(m);
    this.shots.push({ m, from, to, t: 0, dur: 0.25 + range / 14, arc: 0.6 + range * 0.12, by: 'her', at: null });
    this.stats.thrown++;
    tone(600, 0, 0.06, 'sine', 0.04);
  }

  /**
   * A tap while she holds a snowball: throw it where the tap points (a child, the ground…). True = the tap is used.
   * main.ts calls it before the usual tap handling.
   */
  tap(ray: THREE.Raycaster): boolean {
    if (!this.held || this.ctx.isPaused() || this.ctx.isDriving()) return false;
    const kidHit = ray.intersectObjects(
      this.kids.map((k) => k.f.group),
      true,
    )[0];
    if (kidHit) {
      const k = this.kids.find((kk) => {
        let o: THREE.Object3D | null = kidHit.object;
        while (o) {
          if (o === kk.f.group) return true;
          o = o.parent;
        }
        return false;
      });
      if (k) {
        this.throwAt(k.f.group.getWorldPosition(new THREE.Vector3()).setY(0.9));
        return true;
      }
    }
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) {
      this.throwAt(p.setY(0.6));
      return true;
    }
    // tapping the sky: straight on, in the direction of the tap
    const d = ray.ray.direction;
    this.throwAt(this.ctx.player.clone().add(new THREE.Vector3(d.x, 0, d.z).normalize().multiplyScalar(12)).setY(0.5));
    return true;
  }

  /** Enter (keyboard): throw the snowball straight ahead. True = the key is used. */
  enter(): boolean {
    if (!this.held || this.ctx.isPaused() || this.ctx.isDriving()) return false;
    const h = this.host.heading;
    this.throwAt(this.ctx.player.clone().add(new THREE.Vector3(-Math.sin(h) * 10, 0.6, -Math.cos(h) * 10)));
    return true;
  }

  /* ---------------------------------------------------------------- per frame */

  private kidThrow(k: Kid, at: Kid | 'her'): void {
    const tgt = at === 'her' ? this.herLocal() : at.f.group.position.clone();
    const from = k.f.group.position.clone();
    from.y = 1.1;
    const dx = tgt.x - from.x;
    const dz = tgt.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    // kids hit about 2 times in 3 (always when throwing back at her: a gentle puf)
    const miss = at !== 'her' && Math.random() < 0.35;
    const to = new THREE.Vector3(tgt.x, miss ? 0.05 : 1.0, tgt.z);
    if (miss) {
      to.x += (Math.random() - 0.5) * 2.2;
      to.z += (Math.random() - 0.5) * 2.2;
    }
    from.x += (dx / dist) * 0.3;
    from.z += (dz / dist) * 0.3;
    const m = snowball();
    m.position.copy(from);
    this.g.add(m);
    this.shots.push({ m, from, to, t: 0, dur: 0.35 + dist / 10, arc: 0.8 + dist * 0.12, by: k, at: miss ? null : at });
    this.stats.kidThrows++;
    if (at === 'her') this.stats.back++;
  }

  private laugh(k: Kid, near: boolean): void {
    k.laugh = 1.2;
    if (near && this.time - this.lastLaugh > 3.5) {
      this.lastLaugh = this.time;
      chirp(['Hi hi hi!', 'Ha ha!', 'Apanhaste-me!', 'Hi hi!'][Math.floor(Math.random() * 4)], 1.9);
    }
  }

  update(dt: number): void {
    this.flyers.update(dt);
    if (this.ctx.isPaused()) return;
    this.time += dt;
    const her = this.herLocal();
    const herD = Math.hypot(her.x, her.z + D / 2);
    const near = herD < 26;
    // first time she comes close this visit
    if (!this.greeted && herD < 17) {
      this.greeted = true;
      this.ctx.say(['Vamos brincar na neve!']);
    }
    // her snowball melts if she walks far away, drives or takes something else in her hand
    if (this.held && (herD > 34 || this.ctx.isDriving() || this.ctx.carried())) this.drop();
    if (QA)
      document.body.dataset.snowplay = JSON.stringify({ ...this.stats, holding: !!this.held, flying: this.shots.length });
    this.puffs.update(dt);
    if (herD > 90) return; // nobody to watch: keep the frame cheap

    // snowmen reactions
    for (const s of this.snowmen) {
      if (s.t < 0) continue;
      s.t += dt;
      const t = s.t;
      const k = Math.min(1, t / 1.3);
      s.hat.position.y = 2.24 + Math.sin(k * Math.PI) * 1.5;
      s.hat.rotation.y = k * Math.PI * 4;
      s.root.rotation.z = Math.sin(t * 14) * 0.12 * Math.exp(-t * 2.5);
      s.arms.forEach((a, i) => (a.rotation.z = (i === 0 ? 0.9 : -0.9) + (i === 0 ? -1 : 1) * Math.max(0, Math.sin(t * 10)) * 0.9 * Math.max(0, 1 - t / 2.2)));
      if (t > 2.4) {
        s.t = -1;
        s.hat.position.y = 2.24;
        s.hat.rotation.y = 0;
        s.root.rotation.z = 0;
      }
    }

    // fish
    this.holes.forEach((h, i) => {
      h.auto -= dt;
      if (h.auto <= 0) {
        h.auto = 7 + Math.random() * 7;
        if (near) this.leap(i, false);
      }
      if (h.t < 0) return;
      h.t += dt;
      const k = h.t / 1.0;
      h.fish.visible = k < 1;
      h.fish.position.set(h.p.x + (k - 0.5) * 0.6, 0.1 + Math.sin(Math.min(1, k) * Math.PI) * 1.3, h.p.z);
      h.fish.rotation.set(0, Math.PI / 2, 0);
      h.fish.rotateX((k - 0.5) * 2.4);
      h.fish.children[1].rotation.y = Math.sin(h.t * 30) * 0.4;
      if (k >= 1) {
        h.t = -1;
        this.puffs.burst(h.p.clone().setY(0.12), 8, 0x9fd8ff, 1.4);
        tone(300, 0, 0.1, 'sine', 0.05);
      }
    });

    // throwers
    for (const k of this.kids) {
      k.t += dt;
      const f = k.f;
      if (k.laugh > 0) k.laugh -= dt;
      const hop = k.laugh > 0 ? Math.abs(Math.sin(k.laugh * 9)) * 0.25 : 0;
      if (k.role !== 'throw') continue;
      f.group.position.y = hop;
      f.body.rotation.z = k.laugh > 0 ? Math.sin(k.laugh * 18) * 0.12 : 0;
      if (k.wind > 0) {
        k.wind -= dt;
        const tgt = k.aim === 'her' ? her : (k.aim ?? k.partner!).f.group.position;
        f.group.rotation.y = look(f.group.position.x, f.group.position.z, tgt.x, tgt.z);
        f.armR.rotation.x = -2.6 * Math.max(0, Math.min(1, (0.5 - k.wind) / 0.35));
        if (k.wind <= 0) {
          f.armR.rotation.x = 1.0;
          this.kidThrow(k, k.aim ?? k.partner!);
          k.aim = null;
          k.next = 2.2 + Math.random() * 2.2;
        }
        continue;
      }
      f.armR.rotation.x *= Math.exp(-6 * dt);
      // idle: little crouch to pack snow, arms down
      f.armL.rotation.x = Math.sin(k.t * 2) * 0.15;
      k.next -= dt;
      if (k.next <= 0 && k.laugh <= 0) {
        k.aim = k.partner!;
        k.wind = 0.5;
      }
    }

    // flying snowballs
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.m.position.lerpVectors(s.from, s.to, k);
      s.m.position.y += Math.sin(k * Math.PI) * s.arc;
      // her ball can hit any child on the way
      let hitKid: Kid | null = null;
      if (s.by === 'her' && k > 0.15) {
        for (const kid of this.kids) {
          const p = kid.f.group.position;
          if (Math.hypot(p.x - s.m.position.x, p.z - s.m.position.z) < 0.6 && s.m.position.y < 1.6) {
            hitKid = kid;
            break;
          }
        }
      }
      if (!hitKid && k < 1) continue;
      s.m.removeFromParent();
      this.shots.splice(i, 1);
      const at = s.m.position.clone();
      this.puffs.burst(at, hitKid ? 14 : 10);
      pufSound();
      if (hitKid) {
        this.stats.hits++;
        this.laugh(hitKid, true);
        // …and throws one back at her (sledger / builder too: they just laugh)
        if (hitKid.role === 'throw') {
          hitKid.aim = 'her';
          hitKid.wind = 0.5 + 0.6; // a little laugh first
          hitKid.laugh = 0.6;
        }
        continue;
      }
      if (s.at === 'her') {
        const h2 = this.herLocal();
        if (Math.hypot(h2.x - at.x, h2.z - at.z) < 1.3) {
          this.puffs.burst(h2.setY(1.3), 16, 0xffffff, 2.4);
          tone(880, 0.05, 0.08, 'triangle', 0.04);
        }
      } else if (s.at && s.by !== 'her') {
        this.laugh(s.at, near);
      }
    }

    this.updateSled(dt);
    this.updateBuilder(dt);
  }

  /** Sledger: walk round to the steps, climb, sit on the sled, whoosh down, walk back. One loop ≈ 13 s. */
  private updateSled(dt: number): void {
    if (!this.sled) return;
    const s = this.sled;
    s.t = (s.t + dt) % 13;
    const f = s.kid.f;
    const t = s.t;
    // waypoints (x, y, z) — walk legs at ~1.5 m/s
    const walk: [number, number, number][] = [
      [10, 0, -6.2],
      [12.9, 0, -8],
      [12.9, 0, -14.6],
      [11.8, 0, -15.2],
      [11.8, 2, -17.2],
      [10, 2, -17.0],
    ];
    let pos = new THREE.Vector3();
    let heading = 0;
    let sitting = false;
    if (t < 8) {
      // walking path
      const segT = 8 / (walk.length - 1);
      const i = Math.min(walk.length - 2, Math.floor(t / segT));
      const k = (t - i * segT) / segT;
      const a = new THREE.Vector3(...walk[i]);
      const b = new THREE.Vector3(...walk[i + 1]);
      pos = a.clone().lerp(b, k);
      heading = Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 0.01 ? look(a.x, a.z, b.x, b.z) : f.group.rotation.y;
      f.legL.rotation.x = Math.sin(t * 9) * 0.5;
      f.legR.rotation.x = -Math.sin(t * 9) * 0.5;
      // sled is pulled behind on the way back, ready at the top afterwards
      s.sled.position.set(10, 2.0, -16.6);
      s.sled.rotation.set(0, 0, 0);
    } else if (t < 8.8) {
      pos.set(10, 2, -16.6);
      heading = Math.PI;
      sitting = true;
      s.sled.position.set(10, 2.0, -16.6);
      s.sled.rotation.set(0, Math.PI, 0);
    } else {
      // whoosh down the slope (z −16 → −8, y 2 → 0) and glide on to −6
      const k = Math.min(1, (t - 8.8) / 2.4);
      const e = k * k;
      const z = -16.6 + e * 10.4;
      const y = z < -16 ? 2 : z < -8 ? 2 * (1 - (z + 16) / 8) : 0;
      pos.set(10, y, z);
      heading = Math.PI; // facing down the slope (+z)
      sitting = true;
      s.sled.position.set(10, y + 0.02, z);
      s.sled.rotation.set(z > -16 && z < -8 ? Math.atan2(2, 8) : 0, Math.PI, 0);
      if (t - dt < 9.0 && t >= 9.0 && this.near()) tone(660, 0, 0.3, 'sine', 0.04);
    }
    f.group.position.copy(pos);
    if (sitting) {
      f.group.position.y += 0.05;
      f.legL.rotation.x = f.legR.rotation.x = Math.PI / 2;
      f.legL.position.z = f.legR.position.z = -0.3;
      f.legL.position.y = f.legR.position.y = 0.42;
      f.body.position.y = -0.45;
      f.armL.rotation.x = f.armR.rotation.x = t > 8.8 ? -2.6 : 0.4; // arms up while whooshing
      f.group.rotation.x = s.sled.rotation.x;
    } else {
      f.legL.position.z = f.legR.position.z = 0;
      f.legL.position.y = f.legR.position.y = 0.4;
      f.body.position.y = 0;
      f.armL.rotation.x = f.armR.rotation.x = 0;
      f.group.rotation.x = 0;
    }
    f.group.rotation.y = heading;
  }

  private near(): boolean {
    const h = this.herLocal();
    return Math.hypot(h.x, h.z + D / 2) < 26;
  }

  /** Builder: picks the head up, puts it on the little snowman, pats it… it falls off, she laughs, again. ~9 s. */
  private updateBuilder(dt: number): void {
    if (!this.build) return;
    const b = this.build;
    b.t = (b.t + dt) % 9;
    const t = b.t;
    const f = b.kid.f;
    const top = new THREE.Vector3(2.8, 1.12, -18.6);
    const ground = new THREE.Vector3(2.1, 0.12, -17.6);
    f.group.rotation.y = look(f.group.position.x, f.group.position.z, 2.8, -18.6);
    if (t < 1.2) {
      // bend down, pick the head up from the snow
      const k = t / 1.2;
      f.body.rotation.x = Math.sin(k * Math.PI) * 0.5;
      f.armL.rotation.x = f.armR.rotation.x = Math.sin(k * Math.PI) * 1.2;
      b.head.position.copy(ground).lerp(new THREE.Vector3(1.9, 0.75, -18.0), Math.max(0, (k - 0.5) * 2));
    } else if (t < 2.2) {
      // lift it onto the body
      const k = t - 1.2;
      f.body.rotation.x = 0;
      f.armL.rotation.x = f.armR.rotation.x = 1.2 + k * 0.9;
      b.head.position.copy(new THREE.Vector3(1.9, 0.75, -18.0)).lerp(top, k);
      b.head.position.y += Math.sin(k * Math.PI) * 0.3;
    } else if (t < 6.5) {
      // pat pat (arms alternate)
      b.head.position.copy(top);
      f.armL.rotation.x = 1.6 + Math.sin(t * 10) * 0.35;
      f.armR.rotation.x = 1.6 - Math.sin(t * 10) * 0.35;
      if (t - dt < 2.2 && this.near()) tone(523, 0, 0.1, 'triangle', 0.04);
    } else {
      // plop! it rolls off; she laughs and hops
      const k = Math.min(1, (t - 6.5) / 0.6);
      b.head.position.copy(top).lerp(ground, k);
      b.head.position.y = top.y * (1 - k * k) + ground.y * k * k;
      b.head.rotation.z = k * 2;
      f.armL.rotation.x = f.armR.rotation.x = 0.3;
      if (t - dt < 6.5) {
        this.puffs.burst(ground.clone(), 6);
        this.laugh(b.kid, this.near());
      }
      f.group.position.y = b.kid.laugh > 0 ? Math.abs(Math.sin(b.kid.laugh * 9)) * 0.2 : 0;
    }
    if (t < 6.5) {
      b.head.rotation.z = 0;
      f.group.position.y = 0;
    }
  }

  /* ---------------------------------------------------------------- QA (?debug) */

  private qa(d: { pick?: boolean; throwAt?: [number, number]; throwKid?: number; snowman?: number; hole?: number; enter?: boolean } | null): void {
    if (!d) return;
    if (d.pick) this.pickUp(this.piles[0]);
    if (d.throwAt) this.throwAt(new THREE.Vector3(d.throwAt[0], 0.6, d.throwAt[1]));
    if (d.throwKid !== undefined) this.throwAt(this.kids[d.throwKid].f.group.getWorldPosition(new THREE.Vector3()).setY(0.9));
    if (d.snowman !== undefined) this.poke(d.snowman);
    if (d.hole !== undefined) this.leap(d.hole, true);
    if (d.enter) this.enter();
  }
  /** World positions of interesting things (QA). */
  debug(): Record<string, unknown> {
    return {
      site: this.site,
      kids: this.kids.map((k) => this.w(k.f.group.position.clone()).toArray().map((v) => +v.toFixed(1))),
      snowmen: this.snowmen.map((s) => this.w(s.root.position.clone()).toArray().map((v) => +v.toFixed(1))),
      holes: this.holes.map((h) => this.w(h.p.clone()).toArray().map((v) => +v.toFixed(1))),
      piles: this.piles.map((p) => this.w(p.clone()).toArray().map((v) => +v.toFixed(1))),
      ...this.stats,
      holding: !!this.held,
    };
  }

  dispose(): void {
    this.drop();
    this.flyers.clear();
    this.g.removeFromParent();
    if (this.onQa) window.removeEventListener('rainbow-snow', this.onQa);
    if (QA) delete document.body.dataset.snow;
  }
}
