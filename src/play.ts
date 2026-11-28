import * as THREE from 'three';
import { speak, tone } from './audio';
import { feel } from './bus';
import { cityHas } from './cities';
import type { GameCtx } from './gamectx';
import { parkSite, reserveGround, roadsideSite, siteBox, siteGroup, siteToWorld } from './places';
import { groundHeight } from './spawn';
import type { SwingSeat } from './props';
import { mulberry32, onRoad, SPAWN, type Interactable, type Obstacle, type World } from './world';

/**
 * Fase 3 — brincar / criar / natureza / escadas (I31–I42, I46, I58, I63, I69–I76…).
 * No UI marks: walk up, touch, click. Existing props already cover I33 (baloiço), I53 (fonte),
 * I56 (cão), I65–I67 (flores/maçãs).
 */

const mat = (c: number, extra?: THREE.MeshStandardMaterialParameters) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, ...extra });

function box(parent: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * I31 — Escorrega de parque infantil.
 * Torre sólida colorida (nunca stilts + patamar) + tubo fechado + rede + barras.
 */
function buildSlide(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = parkSite(obstacles, rng, 3.0, 7.0, { minD: 22, maxD: 105, roadGap: 5 })
    ?? roadsideSite(obstacles, rng, 3.0, 7.0, { minD: 25, maxD: 110 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  g.userData.playSlide = true;
  const yellow = mat(0xffd43b);
  const red = mat(0xfa5252);
  const green = mat(0x51cf66);
  const cyan = mat(0x22b8cf);
  const cyanDeep = mat(0x0c8599);
  const rope = mat(0xff922b);
  const dark = mat(0x343a40);

  // rubber pad + sand corner
  box(g, dark, 5.6, 0.08, 7.4, 0.2, 0.04, -1.1);
  box(g, mat(0xffe066), 2.2, 0.12, 2.2, -2.0, 0.08, 1.2);

  const tz = -3.2;
  // SOLID cabin tower from the ground (kills the “4 posts in the grass” silhouette)
  box(g, yellow, 2.4, 2.9, 2.2, 0, 1.45, tz);
  box(g, red, 2.6, 0.2, 2.4, 0, 3.0, tz); // flat roof lip
  box(g, red, 1.6, 0.35, 1.6, 0, 3.25, tz); // roof cap
  // windows / door marks
  box(g, cyanDeep, 0.7, 0.55, 0.08, -0.55, 2.1, tz + 1.12);
  box(g, cyanDeep, 0.7, 0.55, 0.08, 0.55, 2.1, tz + 1.12);
  box(g, dark, 0.7, 1.2, 0.08, 0, 0.7, tz - 1.12); // door on ladder side
  // interior deck (she stands here before sliding)
  box(g, mat(0xffe8cc), 1.8, 0.12, 1.6, 0, 2.55, tz);

  // ladder on −Z
  box(g, green, 0.14, 2.7, 0.14, -0.45, 1.35, tz - 1.35);
  box(g, green, 0.14, 2.7, 0.14, 0.45, 1.35, tz - 1.35);
  for (let i = 0; i < 8; i++) box(g, yellow, 1.0, 0.08, 0.1, 0, 0.3 + i * 0.32, tz - 1.35);

  // climbing net (−X)
  box(g, green, 0.14, 2.6, 0.14, -1.55, 1.3, tz - 0.6);
  box(g, green, 0.14, 2.6, 0.14, -1.55, 1.3, tz + 0.7);
  for (let i = 0; i < 6; i++) box(g, rope, 0.07, 0.07, 1.4, -1.55, 0.45 + i * 0.4, tz + 0.05);
  for (let i = 0; i < 5; i++) box(g, rope, 0.07, 2.3, 0.07, -1.55, 1.35, tz - 0.5 + i * 0.3);

  // monkey bars (+X)
  box(g, green, 0.14, 2.3, 0.14, 1.6, 1.15, tz);
  box(g, green, 0.14, 2.3, 0.14, 2.7, 1.15, tz);
  box(g, yellow, 1.25, 0.1, 0.1, 2.15, 2.25, tz);
  for (let i = 0; i < 5; i++) box(g, yellow, 0.08, 0.4, 0.08, 1.7 + i * 0.25, 2.0, tz);

  // CLOSED tube slide (cyan) — unmistakable playground tube, not stairs
  const chute = new THREE.Group();
  chute.position.set(0, 1.5, -0.35);
  chute.rotation.x = 0.5; // high end at the tower (−Z), low end at the exit (+Z) — was upside down before 2026-11-19
  g.add(chute);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.6, 5.4, 16, 1, true),
    cyan,
  );
  tube.rotation.x = Math.PI / 2; // length along local Z
  tube.castShadow = true;
  chute.add(tube);
  // entry / exit rings
  for (const z of [-2.65, 2.65] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 8, 16), cyanDeep);
    ring.position.set(0, 0, z);
    chute.add(ring);
  }
  // short supports under the lower half of the tube
  box(g, green, 0.16, 0.9, 0.16, -0.5, 0.45, 0.6);
  box(g, green, 0.16, 0.9, 0.16, 0.5, 0.45, 0.6);
  box(g, green, 0.16, 0.45, 0.16, -0.5, 0.22, 1.7);
  box(g, green, 0.16, 0.45, 0.16, 0.5, 0.22, 1.7);
  box(g, cyanDeep, 1.3, 0.1, 0.7, 0, 0.1, 2.0);

  obstacles.push(siteBox(site, -2.9, 2.9, -4.7, 2.4, 3.4));
  let riding = false;
  let t = 0;
  const top = siteToWorld(site, 0, -2.9, 2.7);
  const bottom = siteToWorld(site, 0, 2.0, 0.15);
  return {
    object: g,
    position: siteToWorld(site, 0, -2.2),
    radius: 3.5,
    requiresClick: true,
    interact() {
      if (riding || ctx.isPaused() || ctx.isDriving()) return false;
      riding = true;
      t = 0;
      ctx.hold(true);
      ctx.say(['Wiiii!']);
      feel('play');
      return true;
    },
    update(dt) {
      if (!riding) return;
      t += dt;
      const k = Math.min(1, t / 1.6);
      const p = top.clone().lerp(bottom, k * k);
      p.y = THREE.MathUtils.lerp(2.7, 0.15, k);
      ctx.player.set(p.x, p.y, p.z);
      if (k >= 1) {
        riding = false;
        ctx.player.y = 0;
        ctx.hold(false);
        tone(880, 0, 0.1, 'triangle', 0.05);
      }
    },
  };
}

/** Child friend sitting on one end of the seesaw (parented to the plank — never floats free). */
function makeSeesawBuddy(): THREE.Group {
  const f = new THREE.Group();
  const skin = mat(0xf1c27d);
  const shirt = mat(0x4dabf7);
  const pants = mat(0x364fc7);
  const hairM = mat(0x5c3a21);
  const shoe = mat(0x212529);
  // hips on the plank; legs stick forward along local −Z
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.22), pants);
  hips.position.set(0, 0.1, 0);
  hips.castShadow = true;
  f.add(hips);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.2), shirt);
  torso.position.set(0, 0.36, 0.02);
  torso.castShadow = true;
  f.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
  head.position.set(0, 0.68, 0);
  head.castShadow = true;
  f.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.05), hairM);
  hair.position.set(0, 0.7, 0.02);
  f.add(hair);
  const dark = mat(0x161616);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), dark);
    eye.position.set(s * 0.06, 0.7, -0.15);
    f.add(eye);
  }
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.28, 3, 6), pants);
    thigh.position.set(s * 0.1, 0.08, -0.28);
    thigh.rotation.x = Math.PI / 2;
    thigh.castShadow = true;
    f.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.14), shoe);
    foot.position.set(s * 0.1, 0.05, -0.52);
    f.add(foot);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), shirt);
    arm.position.set(s * 0.22, 0.4, -0.08);
    arm.rotation.z = s * 1.05;
    arm.rotation.x = 0.85;
    arm.castShadow = true;
    f.add(arm);
  }
  return f;
}

/** I34 — Balancé: sit on one end (SwingSeat); buddy on the other rides with the plank. */
function buildSeesaw(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = roadsideSite(obstacles, rng, 2.0, 3.5, { minD: 22, maxD: 100 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  const wood = mat(0xd9480f);
  const woodDark = mat(0xa3490f);
  // fulcrum stays fixed; plank + buddy swing together on a pivot
  cyl(g, mat(0x868e96), 0.32, 0.7, 0, 0.35, -1.8);
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.72, -1.8);
  g.add(pivot);
  box(pivot, wood, 3.6, 0.16, 0.5, 0, 0, 0);
  // grab handles at each end
  for (const x of [1.65, -1.65]) {
    box(pivot, woodDark, 0.1, 0.45, 0.1, x, 0.28, -0.18);
    box(pivot, woodDark, 0.1, 0.45, 0.1, x, 0.28, 0.18);
    box(pivot, woodDark, 0.1, 0.1, 0.46, x, 0.48, 0);
  }
  const buddy = makeSeesawBuddy();
  buddy.position.set(-1.35, 0.08, 0);
  buddy.rotation.y = Math.PI / 2; // faces her (+X)
  buddy.scale.setScalar(1.15);
  pivot.add(buddy);
  obstacles.push(siteBox(site, -2.0, 2.0, -2.6, -1.0, 1.2));

  const SEAT_X = 1.3;
  // seat top — main.ts places her at pos.y − 0.7 while sitting (thighs on the plank)
  const seatLocal = new THREE.Vector3(SEAT_X, 0.26, 0);
  let rider: number | null = null;
  let ang = 0.22; // idle tip toward the buddy
  let vel = 0;
  let lastSign = 1;
  let rewarded = ctx.flag('seesaw:coin') > 0;

  const seat: SwingSeat = {
    take() {
      rider = 0;
      vel = -4.0; // her weight: +X end goes down
      feel('play');
      feel('rest');
      tone(320, 0, 0.16, 'sawtooth', 0.03);
      tone(260, 0.08, 0.14, 'sawtooth', 0.02);
      if (!rewarded) {
        rewarded = true;
        ctx.setFlag('seesaw:coin', 1);
        ctx.addCoins(1);
      }
      ctx.say(['Sobe e desce!']);
      return 0;
    },
    pose() {
      pivot.updateMatrixWorld(true);
      const pos = pivot.localToWorld(seatLocal.clone());
      // face buddy along local −X (character faces (sin h, −cos h) in xz)
      const c = Math.cos(site.rot);
      const si = Math.sin(site.rot);
      const heading = Math.atan2(-c, -si);
      // soft tilt — full plank angle buries her in the wood
      return { pos, heading, tilt: ang * 0.4 };
    },
    leave() {
      rider = null;
    },
    getOff() {
      return siteToWorld(site, SEAT_X + 0.5, -0.4);
    },
  };

  return {
    object: g,
    position: siteToWorld(site, 1.0, -1.5),
    radius: 2.45,
    requiresClick: true,
    seat,
    interact() {
      if (ctx.isPaused() || ctx.isDriving()) return false;
      if (rider === null) {
        vel += -1.5;
        tone(340, 0, 0.1, 'sawtooth', 0.02);
      }
      return true;
    },
    update(dt) {
      if (rider !== null) {
        // spring + her weight (−X buddy is lighter) → clear up/down oscillation
        vel += (-ang * 6.5 - vel * 0.1) * dt;
        vel += -2.6 * dt;
        vel += Math.sin(performance.now() * 0.005) * 1.2 * dt; // pump
      } else {
        vel += ((0.2 - ang) * 5 - vel * 1.8) * dt;
      }
      ang += vel * dt;
      if (ang > 0.55) {
        ang = 0.55;
        vel *= -0.72;
      } else if (ang < -0.55) {
        ang = -0.55;
        vel *= -0.72;
      }
      pivot.rotation.z = ang;
      const sign = vel >= 0 ? 1 : -1;
      if (sign !== lastSign && Math.abs(vel) > 1.0 && (rider !== null || Math.abs(ang) > 0.15)) {
        tone(280 + Math.random() * 70, 0, 0.12, 'sawtooth', 0.018); // wood creak
      }
      lastSign = sign;
    },
  };
}

// I35 caixa de areia REMOVED from spawn (2026-11-16 review): wooden box + yellow sand +
// block+2-cylinders "castelo" on tap — Telmo: "remove este castelo" (ridículo).

/** Number decal for hopscotch (CanvasTexture on a flat plane facing up). */
function hopNumPlane(n: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const cx = c.getContext('2d')!;
  cx.clearRect(0, 0, 64, 64);
  cx.fillStyle = '#ffffff';
  cx.font = 'bold 44px system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.strokeStyle = '#212529';
  cx.lineWidth = 5;
  cx.strokeText(String(n), 32, 34);
  cx.fillText(String(n), 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Arrow presses / taps (fresh, not key-repeat) — any of them stops a macaca run. */
let hopStopAt = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && e.key.startsWith('Arrow')) hopStopAt = performance.now();
  });
  window.addEventListener('pointerdown', () => {
    hopStopAt = performance.now();
  });
}

const HOP_WORDS = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez'];

/**
 * I36 — Macaca: colourful numbered squares (classic 1–10, single/double, round "céu").
 * Tap it (or Enter beside it, or just step onto square 1): she throws a pebble onto a square (2–9), then hops
 * 1 → 10 counting aloud, skipping the pebble's square (one foot on singles, two feet on doubles), each landed number
 * lights up; the céu ends it with a jingle and sparkles (+2 coins the first time in each city). Any arrow / tap stops it.
 */
function buildHopscotch(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = roadsideSite(obstacles, rng, 1.6, 6.5, { minD: 18, maxD: 95, front: 6.5 });
  if (!site) return null;
  // walkable chalk on the ground, not an obstacle — but nothing placed later (butterfly garden…) may come within 4 m
  const area = siteBox(site, -1.3, 1.3, -5.6, 1.4);
  reserveGround(obstacles, area, 4);
  const g = siteGroup(scene, site);
  g.userData.playHopscotch = true;
  // classic macaca: single, double, single… ending in a round “céu”
  const COLORS = [0xfa5252, 0xff922b, 0xffd43b, 0x51cf66, 0x22b8cf, 0x4dabf7, 0x845ef7, 0xcc5de8, 0xf06595, 0xe03131];
  const layout: { n: number; x: number; z: number; round?: boolean }[] = [
    { n: 1, x: 0, z: -0.4 },
    { n: 2, x: -0.4, z: -1.15 },
    { n: 3, x: 0.4, z: -1.15 },
    { n: 4, x: 0, z: -1.9 },
    { n: 5, x: -0.4, z: -2.65 },
    { n: 6, x: 0.4, z: -2.65 },
    { n: 7, x: 0, z: -3.4 },
    { n: 8, x: -0.4, z: -4.15 },
    { n: 9, x: 0.4, z: -4.15 },
    { n: 10, x: 0, z: -4.95, round: true },
  ];
  /** What she lands on, in order: singles, doubles (two feet) and the céu. */
  const LANDINGS = [[0], [1, 2], [3], [4, 5], [6], [7, 8], [9]];
  const cells: THREE.Mesh[] = [];
  const rim = mat(0xffffff);
  for (const cell of layout) {
    const col = COLORS[cell.n - 1];
    const bodyMat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.45,
      emissive: new THREE.Color(col),
      emissiveIntensity: 0.15,
    });
    const geo = cell.round
      ? new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20)
      : new THREE.BoxGeometry(0.78, 0.08, 0.78);
    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.position.set(cell.x, 0.05, cell.z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    g.add(mesh);
    // white chalk rim
    if (!cell.round) {
      box(g, rim, 0.86, 0.02, 0.07, cell.x, 0.04, cell.z - 0.4);
      box(g, rim, 0.86, 0.02, 0.07, cell.x, 0.04, cell.z + 0.4);
      box(g, rim, 0.07, 0.02, 0.86, cell.x - 0.4, 0.04, cell.z);
      box(g, rim, 0.07, 0.02, 0.86, cell.x + 0.4, 0.04, cell.z);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 24), rim);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cell.x, 0.1, cell.z);
      g.add(ring);
    }
    const num = hopNumPlane(cell.n);
    num.position.set(cell.x, 0.13, cell.z); // above the lit square (it pops up 0.02)
    g.add(num);
    cells.push(mesh);
  }

  // the pebble (a flat grey stone) waits beside square 1 — the classic "malha"
  const PEBBLE_REST = new THREE.Vector3(0.62, 0.07, 0.15);
  const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0x868e96, { roughness: 0.9, flatShading: true }));
  pebble.scale.set(1, 0.5, 0.85);
  pebble.position.copy(PEBBLE_REST);
  pebble.castShadow = true;
  g.add(pebble);

  // sparkles over the céu (hidden until she gets there)
  const SPARK_COLS = [0xffe066, 0xff8cc6, 0x74c0fc, 0x8ce99a, 0xffffff];
  const sparkGeo = new THREE.OctahedronGeometry(0.1, 0);
  const sparks: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: SPARK_COLS[i % SPARK_COLS.length] }));
    m.visible = false;
    g.add(m);
    sparks.push({ m, v: new THREE.Vector3() });
  }
  let sparkT = -1;

  const glow = cells.map(() => 0);
  const WHITE = new THREE.Color(0xffffff);
  const cellWorld = (i: number, y = 0): THREE.Vector3 => siteToWorld(site, layout[i].x, layout[i].z, y);
  const sq1 = cellWorld(0);
  const stand = siteToWorld(site, 0, 0.5);
  g.userData.hopAt = [stand.x, stand.z];

  type Phase = 'idle' | 'throw' | 'hop' | 'land' | 'cheer';
  let phase: Phase = 'idle';
  let t = 0;
  let leg = 0; // index into LANDINGS
  let pebbleCell = -1;
  let startedAt = 0;
  let armed = false; // stepping onto square 1 starts a game only after she has been away from it
  const lit = new Set<number>();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const pebbleFrom = new THREE.Vector3();
  const pebbleTo = new THREE.Vector3();
  const lastSet = new THREE.Vector3();
  let oneFoot = false;
  let clacked = false;
  const HOP = 0.48;
  const LAND = 0.42;
  const debug = new URLSearchParams(location.search).has('debug');
  const report = (): void => {
    if (!debug) return;
    document.body.dataset.hop = JSON.stringify({
      at: [+stand.x.toFixed(1), +stand.z.toFixed(1)],
      box: [area.minX, area.maxX, area.minZ, area.maxZ].map((v) => +v.toFixed(1)),
      phase,
      leg,
      pebble: pebbleCell + 1,
      lit: [...lit].map((i) => i + 1),
    });
  };
  report();

  const landing = (k: number): number[] => LANDINGS[k].filter((i) => i !== pebbleCell);
  const setPlayer = (p: THREE.Vector3): void => {
    ctx.player.set(p.x, p.y, p.z);
    lastSet.copy(p);
  };

  const finish = (): void => {
    phase = 'idle';
    armed = false;
    ctx.player.y = 0;
    ctx.walkAnim(0);
    ctx.hold(false);
    // the pebble flies back to its spot beside square 1
    pebbleFrom.copy(pebble.position);
    pebbleTo.copy(PEBBLE_REST);
    t = 0;
    report();
  };

  const stop = (): void => {
    // stopped half-way: lights fade, she stays where she is
    lit.clear();
    tone(330, 0, 0.12, 'sine', 0.05);
    finish();
  };

  const start = (): boolean => {
    if (phase !== 'idle' || ctx.isPaused() || ctx.isDriving()) return false;
    ctx.hold(true);
    phase = 'throw';
    clacked = false;
    t = 0;
    leg = 0;
    lit.clear();
    startedAt = performance.now();
    pebbleCell = 1 + Math.floor(Math.random() * 8); // squares 2–9
    // from her hand to the square
    const w = new THREE.Vector3(ctx.player.x, 1.0, ctx.player.z);
    g.worldToLocal(w);
    pebbleFrom.copy(w);
    pebbleTo.set(layout[pebbleCell].x + 0.12, 0.13, layout[pebbleCell].z + 0.1);
    lastSet.copy(ctx.player);
    ctx.walkAnim(0, cellWorld(9).x, cellWorld(9).z); // look down the squares
    report();
    return true;
  };

  const beginHop = (): void => {
    // classic rule: the pebble's square is hopped over (on a single one that means a longer jump to the next)
    while (leg < LANDINGS.length - 1 && landing(leg).length === 0) leg++;
    const cs = landing(leg);
    to.set(0, 0, 0);
    for (const i of cs) to.add(cellWorld(i));
    to.multiplyScalar(1 / cs.length);
    from.copy(ctx.player);
    from.y = 0;
    oneFoot = cs.length === 1 && cs[0] !== 9;
    // singles: one foot (legs keep swinging); doubles and the céu: two feet together
    ctx.walkAnim(oneFoot ? 2.4 : 0, to.x, to.z);
    phase = 'hop';
    t = 0;
  };

  return {
    object: g,
    position: stand,
    radius: 3.2,
    requiresClick: true,
    interact() {
      return start();
    },
    update(dt) {
      // pebble flying home after a game
      if (phase === 'idle' && pebble.position.distanceToSquared(PEBBLE_REST) > 1e-4) {
        t = Math.min(1, t + dt / 0.6);
        pebble.position.lerpVectors(pebbleFrom, pebbleTo, t);
        pebble.position.y += Math.sin(t * Math.PI) * 0.8;
        if (t >= 1) pebble.position.copy(PEBBLE_REST);
      }
      // sparkles
      if (sparkT >= 0) {
        sparkT += dt;
        for (const s of sparks) {
          s.v.y -= 3.5 * dt;
          s.m.position.addScaledVector(s.v, dt);
          s.m.rotation.y += dt * 6;
          s.m.scale.setScalar(Math.max(0.01, 1 - sparkT / 1.6));
          s.m.visible = sparkT < 1.6;
        }
        if (sparkT >= 1.6) sparkT = -1;
      }
      // landed squares glow (colour washed towards white) and pop up a touch
      cells.forEach((c, i) => {
        const m = c.material as THREE.MeshStandardMaterial;
        glow[i] += ((lit.has(i) ? 1 : 0) - glow[i]) * Math.min(1, dt * 8);
        m.emissive.copy(m.color).lerp(WHITE, glow[i] * 0.3);
        m.emissiveIntensity = 0.15 + glow[i] * 0.75;
        c.position.y = 0.05 + glow[i] * 0.02;
      });

      if (phase === 'idle') {
        if (ctx.isPaused() || ctx.isDriving()) return;
        const d1 = Math.hypot(ctx.player.x - sq1.x, ctx.player.z - sq1.z);
        if (d1 > 1.6) armed = true;
        else if (armed && d1 < 0.45) start();
        return;
      }

      // stopped by an arrow / a tap, or moved away by the game (Casa, new city…)
      if (hopStopAt > startedAt + 350 || Math.hypot(ctx.player.x - lastSet.x, ctx.player.z - lastSet.z) > 1) {
        stop();
        return;
      }

      t += dt;
      if (phase === 'throw') {
        const k = Math.min(1, t / 0.75);
        pebble.position.lerpVectors(pebbleFrom, pebbleTo, k);
        pebble.position.y += Math.sin(k * Math.PI) * 1.1;
        if (k >= 1) {
          if (!clacked) tone(180, 0, 0.06, 'square', 0.05); // clack on the ground (once)
          clacked = true;
          if (t > 1.05) beginHop();
        }
      } else if (phase === 'hop') {
        const k = Math.min(1, t / HOP);
        const p = from.clone().lerp(to, k);
        p.y = Math.sin(k * Math.PI) * (leg === LANDINGS.length - 1 ? 0.5 : 0.38);
        setPlayer(p);
        if (k >= 1) {
          to.y = 0;
          setPlayer(to);
          const cs = landing(leg);
          for (const i of cs) lit.add(i);
          ctx.walkAnim(0, cellWorld(9).x, cellWorld(9).z);
          const top = cs[cs.length - 1];
          tone(392 + top * 55, 0, 0.1, 'triangle', 0.07);
          if (top === 9) {
            void speak(['Dez! Céu!']);
            phase = 'cheer';
            t = 0;
            sparkT = 0;
            const c = layout[9];
            for (const s of sparks) {
              s.m.position.set(c.x, 0.9, c.z);
              const a = Math.random() * Math.PI * 2;
              s.v.set(Math.cos(a) * (0.6 + Math.random()), 2 + Math.random() * 1.8, Math.sin(a) * (0.6 + Math.random()));
              s.m.visible = true;
            }
            [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, i === 3 ? 0.4 : 0.15, 'triangle', 0.08));
            feel('play');
            const key = `macaca:${ctx.city()}`;
            if (ctx.flag(key) === 0) {
              ctx.setFlag(key, 1);
              ctx.addCoins(2);
            }
          } else {
            void speak([cs.map((i) => HOP_WORDS[i]).join(', ') + '!'], 1.15);
            phase = 'land';
            t = 0;
          }
          report();
        }
      } else if (phase === 'land') {
        if (t >= LAND) {
          leg++;
          beginHop();
        }
      } else if (phase === 'cheer') {
        // two happy little jumps in the céu
        const k = t / 0.45;
        const p = to.clone();
        p.y = k < 2 ? Math.abs(Math.sin(k * Math.PI)) * 0.3 : 0;
        setPlayer(p);
        if (t >= 1.8) {
          lit.clear();
          finish();
        }
      }
    },
  };
}

// I39 bolas de sabão REMOVED from spawn (2026-11-16 hunt): thin grey pole that emits spheres —
// no wand, no child, no soap bottle. Looks like a stray post.

/** I46 — Piano de rua: coloured keys play notes. */
function buildStreetPiano(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = roadsideSite(obstacles, rng, 2.5, 2.2, { minD: 25, maxD: 100 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  const notes = [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9, 523.2];
  const colors = [0xff6b6b, 0xff922b, 0xffe066, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac, 0xffffff];
  const keys: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const k = box(g, mat(colors[i]), 0.45, 0.12, 1.4, -1.6 + i * 0.45, 0.08, -1.0);
    keys.push(k);
  }
  obstacles.push(siteBox(site, -2.0, 2.0, -2.0, -0.2, 0.3));
  let last = -1;
  let cool = 0;
  return {
    object: g,
    position: siteToWorld(site, 0, 0.2),
    radius: 3.0,
    update(dt) {
      cool = Math.max(0, cool - dt);
      if (cool > 0 || ctx.isPaused()) return;
      for (let i = 0; i < keys.length; i++) {
        const w = siteToWorld(site, -1.6 + i * 0.45, -1.0);
        if (Math.hypot(ctx.player.x - w.x, ctx.player.z - w.z) < 0.4) {
          if (i !== last) {
            last = i;
            cool = 0.12;
            tone(notes[i], 0, 0.25, 'triangle', 0.07);
            keys[i].position.y = 0.02;
            feel('play');
          }
          return;
        }
      }
      last = -1;
      keys.forEach((k) => {
        k.position.y = 0.08;
      });
    },
    interact() {},
  };
}

/** Thin post (street lamp…): ignore for “roomy face” scoring; remove from the stair footprint. */
const isPost = (o: Obstacle): boolean => o.maxX - o.minX < 0.9 && o.maxZ - o.minZ < 0.9;

const overlapsBox = (a: Obstacle, b: Obstacle, m = 0): boolean =>
  a.maxX + m > b.minX && a.minX - m < b.maxX && a.maxZ + m > b.minZ && a.minZ - m < b.maxZ;

/**
 * I69 — Escadas exteriores encostadas a um edifício real, até ao terraço no telhado.
 * Sobe/desce degrau a degrau (nunca teleporta Y); no topo os bichos não a apanham (player.y alto).
 */
function buildTerraceStairs(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
): Interactable | null {
  type Cand = {
    b: Obstacle;
    roof: number;
    fx: number;
    fz: number;
    yaw: number;
    stairW: number;
    steps: number;
    rise: number;
    run: number;
    stairLen: number;
    score: number;
  };

  const cands: Cand[] = [];
  const buildings = [...world.buildings];
  // shuffle a little so cities don't all pick the same corner
  for (let i = buildings.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [buildings[i], buildings[j]] = [buildings[j], buildings[i]];
  }

  for (const b of buildings) {
    const roof = b.roof;
    if (roof === undefined || roof < 3.2 || roof > 9.5) continue;
    const bw = b.maxX - b.minX;
    const bd = b.maxZ - b.minZ;
    if (bw < 3.4 || bd < 3.4) continue;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const dSpawn = Math.hypot(cx - SPAWN.x, cz - SPAWN.z);
    if (dSpawn < 28 || dSpawn > 130) continue;

    const rise = 0.28;
    const run = 0.4;
    const steps = Math.max(8, Math.round(roof / rise));
    const stairLen = steps * run;
    const faces: { fx: number; fz: number; yaw: number; faceW: number }[] = [
      { fx: cx, fz: b.maxZ, yaw: 0, faceW: bw },
      { fx: cx, fz: b.minZ, yaw: Math.PI, faceW: bw },
      { fx: b.maxX, fz: cz, yaw: Math.PI / 2, faceW: bd },
      { fx: b.minX, fz: cz, yaw: -Math.PI / 2, faceW: bd },
    ];

    for (const f of faces) {
      if (f.faceW < 3.4) continue;
      const stairW = Math.min(2.4, f.faceW - 0.6);
      // stair footprint in world (axis-aligned bound of the rotated slab)
      const c = Math.round(Math.cos(f.yaw));
      const s = Math.round(Math.sin(f.yaw));
      // local x ∈ [-stairW/2, stairW/2], z ∈ [0, stairLen] with +Z outward
      const corners = [
        [-stairW / 2, 0.15],
        [stairW / 2, 0.15],
        [-stairW / 2, stairLen],
        [stairW / 2, stairLen],
      ].map(([lx, lz]) => ({ x: f.fx + lx * c + lz * s, z: f.fz - lx * s + lz * c }));
      const stairBox: Obstacle = {
        minX: Math.min(...corners.map((p) => p.x)),
        maxX: Math.max(...corners.map((p) => p.x)),
        minZ: Math.min(...corners.map((p) => p.z)),
        maxZ: Math.max(...corners.map((p) => p.z)),
      };
      // bottom of stairs must not sit on the road (local +Z = outward)
      const footWx = f.fx + stairLen * Math.sin(f.yaw);
      const footWz = f.fz + stairLen * Math.cos(f.yaw);
      if (onRoad(footWx, footWz, 1.2)) continue;
      if (onRoad((stairBox.minX + stairBox.maxX) / 2, (stairBox.minZ + stairBox.maxZ) / 2, 0.8)) continue;

      let posts = 0;
      let blocked = false;
      for (const o of obstacles) {
        if (o === b) continue;
        if (!overlapsBox(stairBox, o, isPost(o) ? 0.15 : 0.35)) continue;
        if (isPost(o)) {
          posts++;
          continue;
        }
        // another building / solid overlapping the stair run
        blocked = true;
        break;
      }
      if (blocked || posts > 1) continue;

      // prefer faces away from roads and with no lamp posts
      let roadNear = 0;
      for (const rx of [ -80, 0 ]) if (Math.abs(footWx - rx) < 14) roadNear++;
      for (const rz of [ -70, 0, 75 ]) if (Math.abs(footWz - rz) < 14) roadNear++;
      const score = dSpawn * 0.02 - posts * 4 - roadNear * 2 + (roof < 7 ? 1 : 0);
      cands.push({ b, roof, fx: f.fx, fz: f.fz, yaw: f.yaw, stairW, steps, rise: roof / steps, run, stairLen, score });
    }
  }

  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  const pick = cands[Math.min(Math.floor(rng() * Math.min(4, cands.length)), cands.length - 1)];

  // clear lamp-post obstacles that would sit inside the stairs
  {
    const c = Math.sin(pick.yaw);
    const co = Math.cos(pick.yaw);
    const corners = [
      [-pick.stairW / 2 - 0.3, 0],
      [pick.stairW / 2 + 0.3, 0],
      [-pick.stairW / 2 - 0.3, pick.stairLen + 0.4],
      [pick.stairW / 2 + 0.3, pick.stairLen + 0.4],
    ].map(([lx, lz]) => ({ x: pick.fx + lx * co + lz * c, z: pick.fz - lx * c + lz * co }));
    const zone: Obstacle = {
      minX: Math.min(...corners.map((p) => p.x)),
      maxX: Math.max(...corners.map((p) => p.x)),
      minZ: Math.min(...corners.map((p) => p.z)),
      maxZ: Math.max(...corners.map((p) => p.z)),
    };
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      if (isPost(o) && overlapsBox(zone, o, 0.05)) obstacles.splice(i, 1);
    }
  }

  const g = new THREE.Group();
  g.position.set(pick.fx, 0, pick.fz);
  g.rotation.y = pick.yaw;
  g.userData.stairs = true;
  scene.add(g);

  const stone = mat(0xadb5bd);
  const rail = mat(0x868e96);
  const { steps, rise, run, stairW, stairLen, roof } = pick;

  // steps: i=0 at the top (flush with the wall), i=steps-1 at the ground (outward +Z)
  for (let i = 0; i < steps; i++) {
    const yTop = roof - i * rise;
    const y = yTop - rise * 0.5;
    const z = i * run + run * 0.5;
    box(g, stone, stairW, rise * 0.95, run * 0.98, 0, y, z);
    // stepped side walls from the ground up to this tread
    const sideH = Math.max(0.4, yTop + 0.4);
    box(g, rail, 0.14, sideH, run * 0.95, -stairW / 2 - 0.1, sideH / 2, z);
    box(g, rail, 0.14, sideH, run * 0.95, stairW / 2 + 0.1, sideH / 2, z);
  }

  // thin landing flush against the wall (does not recolour the whole roof)
  box(g, stone, stairW + 0.25, 0.16, 0.9, 0, roof + 0.08, -0.35);
  // door mark on the façade under the landing
  box(g, mat(0x495057), stairW * 0.5, Math.min(2.0, roof * 0.4), 0.06, 0, Math.min(1.1, roof * 0.22), 0.03);

  // railings on the real building roof (no grey slab — the coloured box IS the terrace)
  const bldg = pick.b;
  const hw = (bldg.maxX - bldg.minX) / 2;
  const hd = (bldg.maxZ - bldg.minZ) / 2;
  const bcx = (bldg.minX + bldg.maxX) / 2;
  const bcz = (bldg.minZ + bldg.maxZ) / 2;
  const dx = bcx - pick.fx;
  const dz = bcz - pick.fz;
  const lx = dx * Math.cos(pick.yaw) - dz * Math.sin(pick.yaw);
  const lz = dx * Math.sin(pick.yaw) + dz * Math.cos(pick.yaw);
  const ry = roof + 0.5;
  box(g, rail, 0.14, 0.85, hd * 2 + 0.15, lx - hw - 0.05, ry, lz);
  box(g, rail, 0.14, 0.85, hd * 2 + 0.15, lx + hw + 0.05, ry, lz);
  box(g, rail, hw * 2 + 0.15, 0.85, 0.14, lx, ry, lz - hd - 0.05);
  const mouth = Math.max(0.35, hw - stairW / 2 - 0.1);
  box(g, rail, mouth, 0.85, 0.14, -stairW / 2 - mouth / 2 - 0.05, ry, 0.02);
  box(g, rail, mouth, 0.85, 0.14, stairW / 2 + mouth / 2 + 0.05, ry, 0.02);

  // world helpers for climb path (top on the landing, foot at bottom)
  const localToWorld = (lx0: number, lz0: number, y: number) => {
    const c = Math.cos(pick.yaw);
    const s = Math.sin(pick.yaw);
    return new THREE.Vector3(pick.fx + lx0 * c + lz0 * s, y, pick.fz - lx0 * s + lz0 * c);
  };
  // stand on the landing just inside the roof — not the far centre (avoids “floating in the sky”)
  const topPos = localToWorld(0, -0.9, roof + 0.18);
  const footPos = localToWorld(0, stairLen + 0.7, 0);
  const climbPath: THREE.Vector3[] = [footPos.clone()];
  for (let i = steps - 1; i >= 0; i--) {
    const y = roof - i * rise;
    const z = (i + 0.5) * run;
    climbPath.push(localToWorld(0, z, y));
  }
  climbPath.push(topPos.clone());

  type Phase = 'idle' | 'up' | 'top' | 'down';
  let phase: Phase = 'idle';
  let t = 0;
  const STEP_T = 0.28; // seconds per step — slow enough to see the legs swing
  const WALK = 3.2;
  const prox = localToWorld(0, stairLen * 0.4, 0);
  const finishGround = () => {
    phase = 'idle';
    t = 0;
    prox.copy(localToWorld(0, stairLen * 0.4, 0));
    ctx.walkAnim(0);
    ctx.player.set(footPos.x, 0, footPos.z);
    ctx.hold(false);
  };

  const placeAlongWalk = (path: THREE.Vector3[], u: number) => {
    const max = path.length - 1;
    const f = THREE.MathUtils.clamp(u, 0, max);
    const i = Math.min(max - 1, Math.floor(f));
    const k = f - i;
    const a = path[i];
    const b = path[i + 1];
    ctx.player.set(
      THREE.MathUtils.lerp(a.x, b.x, k),
      THREE.MathUtils.lerp(a.y, b.y, k),
      THREE.MathUtils.lerp(a.z, b.z, k),
    );
    ctx.walkAnim(WALK, b.x, b.z);
  };

  return {
    object: g,
    position: prox,
    radius: Math.max(4.5, stairLen * 0.75 + 2),
    requiresClick: true,
    interact() {
      if (ctx.isDriving()) return false;
      if (phase === 'up' || phase === 'down') return false;
      if (phase === 'idle') {
        if (ctx.isPaused()) return false;
        phase = 'up';
        t = 0;
        ctx.hold(true);
        ctx.walkAnim(WALK, climbPath[1].x, climbPath[1].z);
        feel('play');
        return true;
      }
      // on the terrace: start down (hold is off so a second click works)
      phase = 'down';
      t = 0;
      prox.copy(localToWorld(0, stairLen * 0.4, 0));
      ctx.hold(true);
      const down = climbPath.slice().reverse();
      ctx.walkAnim(WALK, down[1].x, down[1].z);
      return true;
    },
    update(dt) {
      if (phase === 'idle') {
        // safety: never leave her floating if something interrupted a climb
        const ground = groundHeight(ctx.player.x, ctx.player.z); // USA hills / bridge deck
        if (ctx.player.y > ground + 0.35) {
          const d = Math.hypot(ctx.player.x - topPos.x, ctx.player.z - topPos.z);
          const dFoot = Math.hypot(ctx.player.x - footPos.x, ctx.player.z - footPos.z);
          if (d > 6 && dFoot > 4) ctx.player.y = ground;
        }
        return;
      }
      if (phase === 'top') {
        prox.set(topPos.x, 0, topPos.z);
        ctx.player.set(topPos.x, topPos.y, topPos.z);
        ctx.walkAnim(0);
        return;
      }
      t += dt;
      const path = phase === 'up' ? climbPath : climbPath.slice().reverse();
      const dur = (path.length - 1) * STEP_T;
      placeAlongWalk(path, t / STEP_T);
      if (t >= dur) {
        if (phase === 'up') {
          phase = 'top';
          prox.set(topPos.x, 0, topPos.z);
          ctx.player.set(topPos.x, topPos.y, topPos.z);
          ctx.walkAnim(0);
          ctx.hold(false);
          ctx.say(['Chegaste ao telhado!']);
          feel('rest');
          tone(660, 0, 0.12, 'triangle', 0.05);
        } else {
          finishGround();
          tone(440, 0, 0.1, 'triangle', 0.04);
        }
      }
    },
  };
}

/** I73 — Banco de jardim: sit = rest energy. */
function buildBench(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = roadsideSite(obstacles, rng, 1.5, 2.0, { minD: 15, maxD: 90, front: 7 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  const wood = mat(0x8d5a3b);
  box(g, wood, 1.8, 0.12, 0.5, 0, 0.45, -1.0);
  box(g, wood, 1.8, 0.5, 0.1, 0, 0.75, -1.2);
  box(g, wood, 0.1, 0.45, 0.5, -0.85, 0.22, -1.0);
  box(g, wood, 0.1, 0.45, 0.5, 0.85, 0.22, -1.0);
  obstacles.push(siteBox(site, -1.0, 1.0, -1.4, -0.6, 0.9));
  let sitting = false;
  return {
    object: g,
    position: siteToWorld(site, 0, -0.6),
    radius: 2.0,
    requiresClick: true,
    interact() {
      if (ctx.isPaused() || ctx.isDriving()) return false;
      sitting = !sitting;
      if (sitting) {
        const p = siteToWorld(site, 0, -1.0, 0.5);
        ctx.player.set(p.x, 0.5, p.z);
        ctx.hold(true);
        feel('rest');
        ctx.say(['Que bem que se está aqui.']);
      } else {
        ctx.hold(false);
        ctx.player.y = 0;
      }
      return true;
    },
    update() {
      if (sitting) {
        const p = siteToWorld(site, 0, -1.0, 0.5);
        ctx.player.set(p.x, 0.5, p.z);
      }
    },
  };
}

/** I32 — Bola + baliza: kick rolls the ball. Interior do quarteirão, longe da rua. */
function buildBallGoal(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = parkSite(obstacles, rng, 3.5, 5, { minD: 35, maxD: 115, roadGap: 8 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  const post = mat(0xffffff);
  box(g, post, 0.12, 1.6, 0.12, -1.4, 0.8, -3.5);
  box(g, post, 0.12, 1.6, 0.12, 1.4, 0.8, -3.5);
  box(g, post, 2.9, 0.1, 0.1, 0, 1.55, -3.5);
  const ballM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), mat(0xf8f9fa));
  ballM.position.set(0, 0.28, -1.2);
  g.add(ballM);
  obstacles.push(siteBox(site, -1.7, 1.7, -3.8, -3.2, 1.7));
  let vx = 0;
  let vz = 0;
  let lx = 0;
  let lz = -1.2;
  let scored = false;
  return {
    object: g,
    position: siteToWorld(site, 0, -1.0),
    radius: 2.4,
    interact() {
      const h = ctx.heading();
      vx = Math.sin(h) * 6;
      vz = Math.cos(h) * 6;
      scored = false;
      feel('play');
      tone(220, 0, 0.08, 'triangle', 0.05);
    },
    update(dt) {
      lx += vx * dt;
      lz += vz * dt;
      vx *= Math.exp(-1.8 * dt);
      vz *= Math.exp(-1.8 * dt);
      if (lx < -2.5 || lx > 2.5) { vx *= -0.7; lx = THREE.MathUtils.clamp(lx, -2.5, 2.5); }
      if (lz < -4.5 || lz > 0.5) { vz *= -0.7; lz = THREE.MathUtils.clamp(lz, -4.5, 0.5); }
      // Golo só quando a bola atravessa a linha entre os postes (z≈-3.5, |x|<1.3)
      if (!scored && lz <= -3.35 && Math.abs(lx) < 1.3) {
        scored = true;
        ctx.say(['Golo!']);
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.07));
      }
      ballM.position.set(lx, 0.28, lz);
      ballM.rotation.x += vz * dt * 2;
      ballM.rotation.z -= vx * dt * 2;
    },
  };
}

function ball(parent: THREE.Object3D, m: THREE.Material, r: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// I37 saltar à corda REMOVED from spawn (2026-11-16 hunt): "crianças" = cylinder + sphere.
// I38 papagaio stub REMOVED (2026-11-16): ConeGeometry vermelho. Real parrot: src/parrot.ts (Rio only).
// I42 trotinete: real vehicle in src/scooter.ts (Londres+), wired from main.ts — not this list.
// I58 coelho REMOVED from spawn (2026-11-16 hunt): white SphereGeometry + 2 pink cylinders
// ("ears") + brown circle hole — same class of generic spheres Telmo called ridículo.
// I63 borboletas stub REMOVED (2026-11-16 hunt): 4 flat blue spheres + cones. Real butterflies:
// src/butterflies.ts (Roma+, fly/perch/flee) — wired from main.ts, not this playground list.
// I74 ecopontos REMOVED from spawn (2026-11-16): contentores sem lixo/escolha — só fala.

/** I75 — Biblioteca: casinha de livros; toque = história curta completa (PT-PT, 7–8 anos). */
function buildLibrary(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable | null {
  const site = roadsideSite(obstacles, rng, 2.5, 3.5, { minD: 35, maxD: 120 });
  if (!site) return null;
  const g = siteGroup(scene, site);
  // warm brick cottage + pitched roof + open doorway (reads as a little library)
  box(g, mat(0xf3d9b1), 4.5, 3.2, 3.5, 0, 1.6, -2.0);
  box(g, mat(0xc92a2a), 5.0, 0.2, 4.0, 0, 3.35, -2.0);
  const roofL = box(g, mat(0xa61e4d), 5.1, 0.12, 2.4, 0, 3.7, -2.9);
  roofL.rotation.x = 0.35;
  const roofR = box(g, mat(0xa61e4d), 5.1, 0.12, 2.4, 0, 3.7, -1.1);
  roofR.rotation.x = -0.35;
  box(g, mat(0x5c3d2e), 1.5, 2.3, 0.08, 0, 1.15, -0.22); // door
  ball(g, mat(0xffd43b), 0.07, 0.55, 1.15, -0.15);
  // window with colourful books behind glass
  box(g, mat(0x74c0fc), 1.4, 1.1, 0.06, -1.5, 1.7, -0.22);
  for (let i = 0; i < 5; i++) {
    box(g, mat([0xe03131, 0x1971c2, 0x2f9e44, 0xffe066, 0x7950f2][i]), 0.18, 0.7, 0.12, -2.0 + i * 0.28, 1.55, -0.35);
  }
  // hanging sign: open book
  box(g, mat(0x8d5a3b), 0.08, 0.7, 0.08, 1.8, 2.6, 0.2);
  box(g, mat(0xfff4e6), 0.55, 0.08, 0.4, 1.55, 2.85, 0.35);
  box(g, mat(0xfff4e6), 0.55, 0.08, 0.4, 2.05, 2.85, 0.35);
  obstacles.push(siteBox(site, -2.4, 2.4, -3.8, -0.2, 3.4));
  const tales = [
    'Era uma vez uma menina que viajou pelo mundo. Em cada cidade fez um amigo novo. E foi feliz!',
    'Numa cidade longe, um gato subiu a uma torre. Lá em cima viu tudo e miaou de alegria!',
    'As estrelas contaram um segredo à Lua. A Lua sorriu e iluminou o caminho da noite.',
  ];
  let i = 0;
  return {
    object: g,
    position: siteToWorld(site, 0, -0.3),
    radius: 2.5,
    requiresClick: true,
    interact() {
      ctx.say(['É a biblioteca!', tales[i++ % tales.length]]);
      feel('rest');
      return true;
    },
  };
}

// I76 estátua viva REMOVED from spawn (2026-11-16 hunt): grey cylinder + sphere head +
// box arms — spins 2 s and says "A estátua mexeu-se!". Pedestal silhouette, ridículo.

export function createPlaygrounds(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  seed: number,
  ctx: GameCtx,
  /** the big fenced playground (playground.ts) was placed: then the old single slide tower is not needed */
  hasPark: boolean,
): Interactable[] {
  const rng = mulberry32(seed * 89 + 41);
  const out: Interactable[] = [];
  const builders: Array<(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx) => Interactable | null> = [
    ...(hasPark ? [] : [buildSlide]),
    ...(cityHas(ctx.city(), 'goal') ? [buildBallGoal] : []), // no ball + goal in the USA (CITY_WITHOUT)
    buildSeesaw,
    buildHopscotch,
    buildStreetPiano,
    buildBench,
    buildLibrary,
  ];
  for (const b of builders) {
    const it = b(scene, obstacles, rng, ctx);
    if (it) out.push(it);
  }
  // I69 terrace stairs REMOVED from spawn (2026-11-15 review): grey steps onto a flat roof box,
  // "Chegaste ao telhado!" with nothing to see — a child just sees escadas a lado nenhum.
  // Landmark tower climbs (Clérigos, castelo, cultura…) stay in landmarks.ts.
  //
  // Quantity→quality cull (2026-11-16 hunt): kept out of spawn —
  // I35 sandbox, I37 jump-rope (cyl kids), I38 kite, I39 bubbles (bare pole),
  // I58 rabbit, I74 bins, I76 living statue. (I42 → scooter.ts · I63 → butterflies.ts)
  void buildTerraceStairs;
  return out;
}
