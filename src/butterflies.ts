import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inNoSpawn, isFree } from './spawn';
import { parkSite, siteBox, siteGroup, siteToWorld } from './places';
import { mulberry32, onRoad, type Obstacle, type World } from './world';

/** First city with butterflies (Roma = index 1). Porto has none. */
export const BUTTERFLIES_FROM_CITY = 1;
/** She is this close → they flee. */
const FLEE_R = 2.5;
/** She must go this far before they dare land again. */
const SAFE_R = 5.5;
const COUNT_MIN = 5;
const COUNT_MAX = 8;
const GARDEN_HW = 3.6;
const GARDEN_DEPTH = 5.5;

type Mode = 'fly' | 'approach' | 'land' | 'flee';

interface Bug {
  root: THREE.Group;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
  mode: Mode;
  /** Seconds left resting on a perch, or delay before next approach. */
  wait: number;
  flap: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  perch: number;
  phase: number;
  /** Seconds left gliding with wings held open (butterflies flap–flap–glide). */
  glide: number;
  /** Seconds until the next glide. */
  glideIn: number;
  /** Last point of the smooth flight path (before the flutter wobble). */
  path: THREE.Vector3;
}

/* ---- the butterfly: two pairs of big rounded wings (fore larger, hind smaller), slim body, knobbed antennae ---- */

/** Wing outlines of the RIGHT side in shape units: x = outwards from the body, y = forwards (towards the head). */
type Pen = { moveTo(x: number, y: number): unknown; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): unknown };
const drawFore = (p: Pen): void => {
  p.moveTo(0.012, 0.035);
  p.bezierCurveTo(0.07, 0.2, 0.24, 0.31, 0.4, 0.27);
  p.bezierCurveTo(0.47, 0.24, 0.46, 0.09, 0.37, 0.02);
  p.bezierCurveTo(0.27, -0.04, 0.1, -0.03, 0.012, -0.01);
};
const drawHind = (p: Pen): void => {
  p.moveTo(0.012, 0.0);
  p.bezierCurveTo(0.13, 0.01, 0.31, -0.01, 0.33, -0.12);
  p.bezierCurveTo(0.35, -0.24, 0.21, -0.31, 0.12, -0.29);
  p.bezierCurveTo(0.05, -0.26, 0.012, -0.15, 0.012, -0.06);
};
/** Shape-space box mapped onto the wing texture. */
const WX = 0.48;
const WY0 = -0.32;
const WY1 = 0.32;

let wingGeoCache: THREE.BufferGeometry | null = null;
function wingGeo(): THREE.BufferGeometry {
  if (wingGeoCache) return wingGeoCache;
  const fore = new THREE.Shape();
  drawFore(fore);
  const hind = new THREE.Shape();
  drawHind(hind);
  const geo = new THREE.ShapeGeometry([hind, fore], 10);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / WX, (pos.getY(i) - WY0) / (WY1 - WY0));
  geo.rotateX(-Math.PI / 2); // lie flat: shape +y → −Z (forwards, the head side)
  wingGeoCache = geo;
  return geo;
}

interface WingLook {
  base: string;
  edge: string;
  dots: string;
  /** Patch on the forewing. */
  band: string;
  /** Eye-spot on the hindwing. */
  eye: string;
}
const LOOKS: WingLook[] = [
  { base: '#ff8a1c', edge: '#1d1d1d', dots: '#ffffff', band: '#ffc94d', eye: '#ff8a1c' }, // orange, black rims
  { base: '#3fa9ff', edge: '#13306b', dots: '#ffffff', band: '#9fe0ff', eye: '#ffe066' }, // bright blue
  { base: '#ffe14d', edge: '#2b2b2b', dots: '#ffffff', band: '#fff3a8', eye: '#ff6b3d' }, // lemon yellow
  { base: '#ff8fc8', edge: '#7b2fbe', dots: '#ffffff', band: '#ffd1ea', eye: '#4dabf7' }, // pink & purple
  { base: '#ff5a5f', edge: '#262626', dots: '#ffffff', band: '#ffe066', eye: '#ffffff' }, // red with a yellow band
  { base: '#b794ff', edge: '#3b1f6e', dots: '#ffffff', band: '#ffd6f5', eye: '#ffe066' }, // lilac
];

let wingMatsCache: THREE.MeshStandardMaterial[] | null = null;
function wingMats(): THREE.MeshStandardMaterial[] {
  if (wingMatsCache) return wingMatsCache;
  wingMatsCache = LOOKS.map((L) => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    // canvas in shape units (texture flipY: canvas top = shape top)
    g.setTransform(S / WX, 0, 0, -S / (WY1 - WY0), 0, (S * WY1) / (WY1 - WY0));
    const wing = (draw: (p: Pen) => void, paint: () => void): void => {
      g.save();
      g.beginPath();
      draw(g);
      g.closePath();
      g.clip();
      paint();
      g.restore();
    };
    const dot = (x: number, y: number, r: number, col: string): void => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    const veins = (pts: [number, number][]): void => {
      g.strokeStyle = L.edge;
      g.globalAlpha = 0.35;
      g.lineWidth = 0.008;
      for (const [x, y] of pts) {
        g.beginPath();
        g.moveTo(0.01, 0);
        g.lineTo(x, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const rim = (draw: (p: Pen) => void): void => {
      g.strokeStyle = L.edge;
      g.lineWidth = 0.075;
      g.beginPath();
      draw(g);
      g.closePath();
      g.stroke();
    };
    // forewing: base, light patch, veins, dark rim with a row of white dots
    wing(drawFore, () => {
      g.fillStyle = L.base;
      g.fillRect(0, -0.1, WX, 0.5);
      dot(0.26, 0.15, 0.055, L.band);
      veins([[0.38, 0.25], [0.42, 0.13], [0.36, 0.03], [0.22, 0.24]]);
      rim(drawFore);
      dot(0.0, 0.0, 0.06, L.edge); // dark wing root
      for (const [x, y] of [[0.39, 0.25], [0.43, 0.17], [0.42, 0.09], [0.37, 0.04], [0.31, 0.27]] as const) dot(x, y, 0.012, L.dots);
    });
    // hindwing: base, eye-spot, veins, dark rim with dots
    wing(drawHind, () => {
      g.fillStyle = L.base;
      g.fillRect(0, -0.32, WX, 0.36);
      veins([[0.3, -0.1], [0.25, -0.24], [0.13, -0.28]]);
      dot(0.2, -0.15, 0.045, L.eye);
      dot(0.2, -0.15, 0.02, L.edge);
      rim(drawHind);
      dot(0.0, 0.0, 0.05, L.edge);
      for (const [x, y] of [[0.31, -0.05], [0.31, -0.16], [0.24, -0.26], [0.14, -0.28]] as const) dot(x, y, 0.011, L.dots);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.22, // stays bright and readable in shade / at dusk
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
  });
  return wingMatsCache;
}

/** Slim body + head + two thin antennae with little knobs — one merged mesh. Head at −Z. */
let bodyGeoCache: THREE.BufferGeometry | null = null;
function bodyGeo(): THREE.BufferGeometry {
  if (bodyGeoCache) return bodyGeoCache;
  const parts: THREE.BufferGeometry[] = [];
  const abdomen = new THREE.CapsuleGeometry(0.02, 0.15, 3, 6);
  abdomen.rotateX(Math.PI / 2);
  abdomen.translate(0, 0, 0.09);
  parts.push(abdomen);
  parts.push(new THREE.SphereGeometry(0.032, 7, 5).scale(1, 0.9, 1.3).translate(0, 0, -0.02)); // thorax
  parts.push(new THREE.SphereGeometry(0.026, 7, 5).translate(0, 0.004, -0.075)); // head
  for (const s of [-1, 1]) {
    const ant = new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 4);
    ant.translate(0, 0.07, 0);
    ant.rotateX(-1.0); // lean forwards…
    ant.rotateZ(-s * 0.35); // …and outwards
    ant.translate(s * 0.01, 0.012, -0.085);
    parts.push(ant);
    const tip = new THREE.Vector3(0, 0.14, 0)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), -1.0)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), -s * 0.35);
    parts.push(new THREE.SphereGeometry(0.014, 6, 4).translate(tip.x + s * 0.01, tip.y + 0.012, tip.z - 0.085));
  }
  bodyGeoCache = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return bodyGeoCache;
}

const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2233, roughness: 0.6 });

/**
 * Park garden with real low-poly butterflies: soft curved flight, perch on flowers/bush/grass,
 * scatter when she walks up. No UI, no speech. From the 2nd city (Roma) onward.
 */
export class Butterflies {
  private garden: THREE.Group | null = null;
  /** World-space parent for flying bugs (not under the rotated garden). */
  private readonly flock = new THREE.Group();
  private readonly bugs: Bug[] = [];
  private readonly landings: THREE.Vector3[] = [];
  private readonly centre = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private alive = false;
  private fleeHold = false;
  /** Which wing looks this city starts from (so cities differ). */
  private lookShift = 0;
  private area: Obstacle | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    world: World,
    seed: number,
    cityIndex: number,
  ) {
    if (cityIndex < BUTTERFLIES_FROM_CITY) return;
    const rng = mulberry32(seed * 131 + 17);
    const site =
      parkSite(obstacles, rng, GARDEN_HW, GARDEN_DEPTH, { minD: 38, maxD: 115, roadGap: 5 }) ??
      parkSite(obstacles, rng, GARDEN_HW, GARDEN_DEPTH, { minD: 28, maxD: 130, roadGap: 4 });
    if (!site) return;

    const area = siteBox(site, -GARDEN_HW, GARDEN_HW, -GARDEN_DEPTH, 0.8);
    this.area = area;
    this.lookShift = Math.floor(rng() * 6);
    world.clearArea(area, 2.2);
    obstacles.push({ ...area, height: 0.45 });

    this.garden = siteGroup(scene, site);
    this.centre.copy(siteToWorld(site, 0, -GARDEN_DEPTH / 2));
    this.plantGarden(this.garden, site, rng);

    scene.add(this.flock);
    const n = COUNT_MIN + Math.floor(rng() * (COUNT_MAX - COUNT_MIN + 1));
    for (let i = 0; i < n; i++) this.bugs.push(this.makeBug(rng, i));
    this.alive = true;
  }

  private plantGarden(g: THREE.Group, site: { x: number; z: number; rot: number }, rng: () => number): void {
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(GARDEN_HW * 2, 0.06, GARDEN_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 0.9 }),
    );
    grass.position.set(0, 0.03, -GARDEN_DEPTH / 2);
    grass.receiveShadow = true;
    g.add(grass);

    const soil = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.2, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 }),
    );
    soil.position.set(-0.4, 0.12, -2.2);
    g.add(soil);

    const stemGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.55, 5);
    const petalGeo = new THREE.CircleGeometry(0.16, 5);
    const coreGeo = new THREE.SphereGeometry(0.05, 6, 5);
    const stemM = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.7 });
    const coreM = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.5 });
    const petalCols = [0xff6b9d, 0xffffff, 0xcc5de8, 0xff922b, 0x4dabf7, 0xfa5252];

    for (let i = 0; i < 6; i++) {
      const stem = new THREE.Group();
      const lx = -1.1 + i * 0.4;
      const lz = -2.2 + (i % 2 ? 0.28 : -0.28);
      stem.position.set(lx, 0.22, lz);
      g.add(stem);
      const s = new THREE.Mesh(stemGeo, stemM);
      s.position.y = 0.28;
      stem.add(s);
      const head = new THREE.Group();
      head.position.y = 0.58;
      head.rotation.x = -0.5;
      stem.add(head);
      head.add(
        new THREE.Mesh(
          petalGeo,
          new THREE.MeshStandardMaterial({ color: petalCols[i], side: THREE.DoubleSide, roughness: 0.55 }),
        ),
      );
      const core = new THREE.Mesh(coreGeo, coreM);
      core.position.z = 0.02;
      head.add(core);
      this.landings.push(siteToWorld(site, lx, lz, 0.85));
    }

    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshStandardMaterial({ color: 0x37b24d, roughness: 0.75, flatShading: true }),
    );
    bush.position.set(1.6, 0.5, -3.8);
    bush.scale.set(1.1, 0.85, 1.1);
    bush.castShadow = true;
    g.add(bush);
    this.landings.push(siteToWorld(site, 1.6, -3.8, 1.05));

    for (let i = 0; i < 3; i++) {
      const lx = (rng() * 2 - 1) * 2.4;
      const lz = -1.2 - rng() * 3.5;
      this.landings.push(siteToWorld(site, lx, lz, 0.12 + rng() * 0.08));
    }
  }

  private makeBug(rng: () => number, i: number): Bug {
    const root = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo(), BODY_MAT);
    body.castShadow = true;
    root.add(body);

    // one pair of wing meshes per side (fore + hind in one geometry); the left side is the mirror image
    const mats = wingMats();
    const wingM = mats[(i + this.lookShift) % mats.length];
    const wingL = new THREE.Group();
    const wingR = new THREE.Group();
    wingL.position.set(-0.012, 0.012, -0.015);
    wingR.position.set(0.012, 0.012, -0.015);
    root.add(wingL, wingR);
    const wl = new THREE.Mesh(wingGeo(), wingM);
    const wr = new THREE.Mesh(wingGeo(), wingM);
    wl.scale.x = -1;
    wl.castShadow = wr.castShadow = true;
    wingL.add(wl);
    wingR.add(wr);
    root.scale.setScalar(0.9); // ~0.8 m wingspan: big and readable from the follow camera

    const start = this.landings[i % this.landings.length].clone();
    start.y = 1.2 + rng() * 0.8;
    root.position.copy(start);
    this.flock.add(root);

    return {
      root,
      wingL,
      wingR,
      mode: 'fly',
      wait: 0.5 + rng() * 2.5,
      flap: rng() * Math.PI * 2,
      from: start.clone(),
      to: this.pickAir(rng, start),
      t: 0,
      dur: 2.5 + rng() * 2,
      perch: -1,
      phase: rng() * Math.PI * 2,
      glide: 0,
      glideIn: 1 + rng() * 2,
      path: start.clone(),
    };
  }

  private pickAir(rng: () => number, near: THREE.Vector3): THREE.Vector3 {
    for (let k = 0; k < 16; k++) {
      const a = rng() * Math.PI * 2;
      const d = 1.2 + rng() * 4.5;
      const x = this.centre.x + Math.cos(a) * d + (near.x - this.centre.x) * 0.25;
      const z = this.centre.z + Math.sin(a) * d + (near.z - this.centre.z) * 0.25;
      if (onRoad(x, z, 1.2) || inNoSpawn(x, z, 0.6)) continue;
      if (!isFree(x, z, 0.4, this.obstacles) && Math.hypot(x - this.centre.x, z - this.centre.z) > 6) continue;
      return new THREE.Vector3(x, 0.9 + rng() * 1.4, z);
    }
    return new THREE.Vector3(this.centre.x + (rng() - 0.5) * 3, 1.2 + rng(), this.centre.z + (rng() - 0.5) * 3);
  }

  private pickPerch(occupied: Set<number>): number {
    const free = this.landings.map((_, i) => i).filter((i) => !occupied.has(i));
    const pool = free.length ? free : this.landings.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private startFlee(b: Bug, player: THREE.Vector3): void {
    b.mode = 'flee';
    b.perch = -1;
    b.from.copy(b.root.position);
    const dx = b.root.position.x - player.x;
    const dz = b.root.position.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    let tx = b.root.position.x + (dx / len) * (4 + Math.random() * 3);
    let tz = b.root.position.z + (dz / len) * (4 + Math.random() * 3);
    if (onRoad(tx, tz, 1.2)) {
      tx = this.centre.x + (Math.random() - 0.5) * 2;
      tz = this.centre.z + (Math.random() - 0.5) * 2;
    }
    b.to.set(tx, 2.4 + Math.random() * 1.2, tz);
    b.t = 0;
    b.dur = 0.7 + Math.random() * 0.4;
  }

  private startFly(b: Bug, high = false): void {
    b.mode = 'fly';
    b.perch = -1;
    b.from.copy(b.root.position);
    b.to.copy(this.pickAir(() => Math.random(), b.root.position));
    if (high) b.to.y = Math.max(b.to.y, 2.2);
    b.t = 0;
    b.dur = high ? 1.2 + Math.random() * 0.8 : 2 + Math.random() * 2.2;
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive || paused) return;
    const gardenD = Math.hypot(player.x - this.centre.x, player.z - this.centre.z);
    if (gardenD < FLEE_R + 1.5) this.fleeHold = true;
    if (gardenD > SAFE_R) this.fleeHold = false;

    const occupied = new Set<number>();
    for (const b of this.bugs) if ((b.mode === 'land' || b.mode === 'approach') && b.perch >= 0) occupied.add(b.perch);

    for (const b of this.bugs) {
      const d = Math.hypot(player.x - b.root.position.x, player.z - b.root.position.z);
      if ((d < FLEE_R || this.fleeHold) && b.mode !== 'flee') this.startFlee(b, player);

      if (b.mode === 'flee') {
        this.flyArc(b, dt, 1.6);
        this.beat(b, dt, 22);
        if (b.t < 1) continue;
        if (!this.fleeHold && d > SAFE_R) {
          this.startFly(b);
          b.wait = 1 + Math.random() * 2;
        } else {
          this.startFly(b, true);
          b.mode = 'flee';
        }
        continue;
      }

      if (b.mode === 'land') {
        b.wait -= dt;
        this.beat(b, dt, 3.5);
        const perch = this.landings[b.perch];
        if (perch) b.root.position.y = perch.y;
        b.root.rotation.z = Math.sin(b.flap * 0.4 + b.phase) * 0.05;
        b.root.rotation.x = 0;
        if (b.wait <= 0) {
          this.startFly(b);
          b.wait = 0.8 + Math.random() * 1.5;
        }
        continue;
      }

      if (b.mode === 'approach') {
        this.flyArc(b, dt, 1);
        this.beat(b, dt, 12);
        if (b.t >= 1 && b.perch >= 0) {
          b.mode = 'land';
          b.wait = 2.5 + Math.random() * 3.5;
          b.root.position.copy(this.landings[b.perch]);
          b.path.copy(b.root.position);
          b.root.rotation.x = 0;
        }
        continue;
      }

      // cruise
      if (b.wait > 0) b.wait -= dt;
      this.flyArc(b, dt, 1);
      this.beat(b, dt, 14);
      if (b.t < 1) continue;
      if (b.wait <= 0 && !this.fleeHold) {
        const pi = this.pickPerch(occupied);
        occupied.add(pi);
        b.mode = 'approach';
        b.perch = pi;
        b.from.copy(b.root.position);
        b.to.copy(this.landings[pi]);
        b.t = 0;
        b.dur = 1.4 + Math.random() * 0.8;
      } else {
        this.startFly(b);
      }
    }
  }

  private flyArc(b: Bug, dt: number, speedMul: number): void {
    b.t = Math.min(1, b.t + (dt * speedMul) / Math.max(0.35, b.dur));
    const t = b.t;
    const omt = 1 - t;
    this.mid.set(
      (b.from.x + b.to.x) * 0.5 + Math.sin(b.phase) * 0.9,
      Math.max(b.from.y, b.to.y) + 0.55 + Math.sin(b.phase * 1.7) * 0.25,
      (b.from.z + b.to.z) * 0.5 + Math.cos(b.phase) * 0.9,
    );
    this.tmp.set(
      omt * omt * b.from.x + 2 * omt * t * this.mid.x + t * t * b.to.x,
      omt * omt * b.from.y + 2 * omt * t * this.mid.y + t * t * b.to.y,
      omt * omt * b.from.z + 2 * omt * t * this.mid.z + t * t * b.to.z,
    );
    if (onRoad(this.tmp.x, this.tmp.z, 0.8)) {
      this.tmp.x = b.root.position.x;
      this.tmp.z = b.root.position.z;
      this.tmp.y = Math.max(this.tmp.y, 1.6);
    }
    // heading from the smooth path (b.path keeps last frame's path point, without the flutter)
    const dx = this.tmp.x - b.path.x;
    const dz = this.tmp.z - b.path.z;
    b.path.copy(this.tmp);
    // fluttery: each down-stroke lifts her a little, and she wobbles a touch sideways
    b.root.position.set(
      this.tmp.x + Math.sin(b.flap * 0.5 + b.phase) * 0.05,
      this.tmp.y + Math.cos(b.flap) * 0.07,
      this.tmp.z + Math.cos(b.flap * 0.5 + b.phase) * 0.05,
    );
    if (dx * dx + dz * dz > 1e-6) {
      const target = Math.atan2(dx, dz) + Math.PI;
      let diff = target - b.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      b.root.rotation.y += diff * Math.min(1, dt * 8);
    }
    b.root.rotation.z = Math.sin(b.flap * 0.5) * 0.12;
    b.root.rotation.x = -0.12 + Math.sin(b.flap * 0.35 + b.phase) * 0.08; // nose a little up, like a real one
  }

/**
   * Butterfly wing-beat: both wing pairs swing about the body axis — big slow strokes from a little below flat to
   * almost touching over the back, with short glides (wings held open). Resting: folded up, opening slowly to bask.
   */
  private beat(b: Bug, dt: number, rate: number): void {
    let a: number;
    if (rate < 5) {
      b.flap += dt * 1.4;
      a = 1.0 + 0.45 * Math.sin(b.flap); // 0.55 … 1.45 rad
    } else {
      if (rate <= 14) {
        b.glideIn -= dt;
        if (b.glideIn <= 0 && b.glide <= 0) {
          b.glide = 0.45 + Math.random() * 0.5;
          b.glideIn = 1.6 + Math.random() * 2.4;
        }
      }
      if (b.glide > 0) {
        b.glide -= dt;
        a = b.wingR.rotation.z + (0.15 - b.wingR.rotation.z) * Math.min(1, dt * 10);
        if (b.glide <= 0) b.flap = Math.asin((0.15 - 0.5) / 0.9); // carry on from the glide pose, no jump
      } else {
        b.flap += dt * rate;
        a = 0.5 + 0.9 * Math.sin(b.flap); // −0.4 … 1.4 rad
      }
    }
    b.wingR.rotation.z = a;
    b.wingL.rotation.z = -a;
  }

  dispose(): void {
    if (!this.alive) return;
    this.garden?.parent?.remove(this.garden);
    this.flock.parent?.remove(this.flock);
    this.garden = null;
    this.bugs.length = 0;
    this.alive = false;
  }

  debug(): {
    on: boolean;
    n: number;
    at: [number, number] | null;
    modes: string[];
    fleeR: number;
    bugs: [number, number, number][];
    area?: number[];
  } {
    if (!this.alive) return { on: false, n: 0, at: null, modes: [], fleeR: FLEE_R, bugs: [] };
    return {
      on: true,
      n: this.bugs.length,
      at: [+this.centre.x.toFixed(1), +this.centre.z.toFixed(1)],
      modes: this.bugs.map((b) => b.mode),
      fleeR: FLEE_R,
      bugs: this.bugs.map((b) => [+b.root.position.x.toFixed(1), +b.root.position.y.toFixed(1), +b.root.position.z.toFixed(1)]),
      area: this.area ? [this.area.minX, this.area.maxX, this.area.minZ, this.area.maxZ].map((v) => +v.toFixed(1)) : undefined,
    };
  }
}

/** Stub when Porto / Moon / placement failed. */
export function noButterflies(): Butterflies {
  return {
    update() {},
    dispose() {},
    debug: () => ({ on: false, n: 0, at: null, modes: [], fleeR: FLEE_R, bugs: [] }),
  } as unknown as Butterflies;
}
