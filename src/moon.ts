import * as THREE from 'three';
import { mat } from './places';
import type { Obstacle, World } from './world';

/** Half-extent of the walkable Moon (m). */
export const MOON_HALF = 90;
/** Lander / "Casa" point (LUA2: the home button brings her back here). */
export const LANDER = { x: -8, z: -6, h: -Math.PI / 2 } as const;
/** Altar centre. */
export const ALTAR = { x: 35, z: 5 } as const;

/** Craters: [cx, cz, radius, depth]. */
const CRATERS: [number, number, number, number][] = [
  [25, -20, 15, 3.6],
  [-35, 30, 12, 3.0],
  [50, 40, 17, 4.0],
  [-20, -45, 11, 2.8],
  [5, 55, 13, 3.2],
  [-55, -15, 10, 2.4],
  [42, -48, 9, 2.2],
  [-48, 55, 8, 2.0],
];

/** Soft hill centres: [cx, cz, radius, height]. */
const HILLS: [number, number, number, number][] = [
  [-60, -55, 32, 7.5],
  [65, -30, 26, 6.2],
  [-15, 70, 30, 7.0],
  [70, 55, 24, 5.8],
  [-70, 10, 22, 5.2],
  [10, -70, 28, 6.4],
  [20, 25, 18, 3.8],
];

/** Interesting loot spots (crater rims, hilltops, altar approach). */
export const MOON_LOOT: { x: number; z: number; kind: 'coin' | 'jewel' }[] = [
  // trail from lander toward the altar
  { x: 0, z: -4, kind: 'coin' },
  { x: 8, z: -1, kind: 'coin' },
  { x: 16, z: 1, kind: 'coin' },
  { x: 24, z: 3, kind: 'coin' },
  { x: 30, z: 4, kind: 'jewel' },
  // crater rims
  { x: 25 + 12, z: -20, kind: 'coin' },
  { x: 25 - 10, z: -20 + 8, kind: 'coin' },
  { x: -35 + 9, z: 30, kind: 'jewel' },
  { x: 50, z: 40 + 13, kind: 'coin' },
  { x: -20, z: -45 + 8, kind: 'coin' },
  { x: 5 + 9, z: 55, kind: 'coin' },
  // hilltops
  { x: -60, z: -55, kind: 'jewel' },
  { x: 65, z: -30, kind: 'coin' },
  { x: -15, z: 70, kind: 'coin' },
];

const ROCK_COLORS = [0x6c7078, 0x868e96, 0x5c5f66, 0x9a9080, 0x7a756c, 0xa8a29a, 0x4a4d54];

function moonRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * The last level: grey rolling ground with craters, a lander near spawn, and a stone circle (altar)
 * where she places her diamonds to finish the game. Martians reuse Monsters with a martian look.
 */
export function moonHeight(x: number, z: number): number {
  // rolling regolito — a few octaves so the ground is never a flat sheet
  let h =
    Math.sin(x * 0.032) * 2.4 +
    Math.cos(z * 0.028) * 2.0 +
    Math.sin((x + z) * 0.016) * 1.6 +
    Math.cos(x * 0.065 - z * 0.05) * 0.85 +
    Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.55;

  for (const [cx, cz, r, height] of HILLS) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r) {
      const t = 1 - d / r;
      h += height * t * t * (3 - 2 * t);
    }
  }

  for (const [cx, cz, r, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r) {
      const t = d / r;
      // bowl
      h -= depth * (1 - t) * (1 - t);
      // raised rim
      if (t > 0.62 && t < 1) {
        const rim = 1 - Math.abs(t - 0.82) / 0.18;
        h += depth * 0.55 * Math.max(0, rim);
      }
    }
  }

  // flatten landing pad + altar plaza
  if (Math.hypot(x, z) < 10) h *= Math.hypot(x, z) / 10;
  if (Math.hypot(x - ALTAR.x, z - ALTAR.z) < 8) {
    const t = Math.hypot(x - ALTAR.x, z - ALTAR.z) / 8;
    h *= t * t;
  }
  if (Math.hypot(x - LANDER.x, z - LANDER.z) < 6) {
    const t = Math.hypot(x - LANDER.x, z - LANDER.z) / 6;
    h *= t * t;
  }
  return h;
}

/** True inside a deep crater bowl (LUA6: martians stay out). */
export function inDeepCrater(x: number, z: number): boolean {
  for (const [cx, cz, r] of CRATERS) {
    if (Math.hypot(x - cx, z - cz) < r * 0.62) return true;
  }
  return false;
}

/** Regolith shade: darker in bowls, paler on rims/hills. */
function regolithColor(x: number, z: number, h: number): THREE.Color {
  const c = new THREE.Color();
  // base dusty grey-beige (warmer than cool city greys)
  let r = 0.72;
  let g = 0.68;
  let b = 0.58;
  // height tint — high ground is paler (sun-bleached)
  const bleach = THREE.MathUtils.clamp(h / 6, -0.3, 0.55);
  r += bleach * 0.22;
  g += bleach * 0.2;
  b += bleach * 0.14;
  // crater floors go charcoal
  for (const [cx, cz, rad] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < rad * 0.7) {
      const t = 1 - d / (rad * 0.7);
      r -= 0.22 * t;
      g -= 0.2 * t;
      b -= 0.16 * t;
    } else if (d < rad * 1.05) {
      // rim: slightly warmer / brighter
      r += 0.08;
      g += 0.06;
      b += 0.02;
    }
  }
  // soft mottling so it isn't a flat wash
  const mott = Math.sin(x * 0.31) * Math.cos(z * 0.27) * 0.04;
  c.setRGB(r + mott, g + mott * 0.8, b + mott * 0.5);
  return c;
}

export function buildMoonGround(scene: THREE.Scene): THREE.Mesh {
  const seg = 140;
  const geo = new THREE.PlaneGeometry(MOON_HALF * 2.5, MOON_HALF * 2.5, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = moonHeight(x, z);
    pos.setY(i, h);
    const col = regolithColor(x, z, h);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.97,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** Lander near spawn — visual landmark so "Casa" has somewhere to point at. */
export function buildLander(scene: THREE.Scene, obstacles: Obstacle[]): void {
  const g = new THREE.Group();
  const y0 = moonHeight(LANDER.x, LANDER.z);
  g.position.set(LANDER.x, y0, LANDER.z);
  scene.add(g);

  const foil = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, metalness: 0.55, roughness: 0.35, emissive: 0xadb5bd, emissiveIntensity: 0.08 });
  const red = mat(0xe03131, 0.35);
  const dark = mat(0x495057);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.75, 2.4, 14), foil);
  body.position.y = 2.0;
  body.castShadow = true;
  g.add(body);
  // gold-foil band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.35, 14), mat(0xffd43b, 0.4));
  band.position.y = 1.55;
  g.add(band);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.7, 14), red);
  nose.position.y = 3.95;
  nose.castShadow = true;
  g.add(nose);
  // porthole
  const port = new THREE.Mesh(
    new THREE.CircleGeometry(0.28, 16),
    new THREE.MeshStandardMaterial({ color: 0x74c0fc, emissive: 0x1c7ed6, emissiveIntensity: 0.5 }),
  );
  port.position.set(0, 2.2, -1.55);
  g.add(port);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), dark);
    leg.position.set(Math.cos(a) * 1.7, 1.1, Math.sin(a) * 1.7);
    leg.rotation.z = Math.cos(a) * 0.42;
    leg.rotation.x = Math.sin(a) * 0.42;
    leg.castShadow = true;
    g.add(leg);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.12, 10), dark);
    pad.position.set(Math.cos(a) * 2.35, 0.06, Math.sin(a) * 2.35);
    g.add(pad);
  }

  // ladder on the front
  const ladder = new THREE.Group();
  ladder.position.set(0, 0.2, -1.7);
  for (let i = 0; i < 6; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), dark);
    rung.position.y = 0.35 + i * 0.35;
    ladder.add(rung);
  }
  for (const s of [-0.28, 0.28]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.05), dark);
    rail.position.set(s, 1.2, 0);
    ladder.add(rail);
  }
  g.add(ladder);

  // dish antenna
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), dark);
  mast.position.set(0.9, 3.5, 0.4);
  g.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), foil);
  dish.position.set(0.9, 4.2, 0.4);
  dish.rotation.x = 0.6;
  g.add(dish);

  // small flag
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), dark);
  pole.position.set(-2.8, 1.1, 0.5);
  g.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x4dabf7, emissive: 0x1864ab, emissiveIntensity: 0.25, side: THREE.DoubleSide }),
  );
  flag.position.set(-2.25, 1.9, 0.5);
  g.add(flag);

  obstacles.push({ minX: LANDER.x - 3.2, maxX: LANDER.x + 3.2, minZ: LANDER.z - 3.2, maxZ: LANDER.z + 3.2 });
}

function rockMesh(rng: () => number, scale: number): THREE.Mesh {
  const roll = rng();
  let geo: THREE.BufferGeometry;
  if (roll < 0.28) geo = new THREE.DodecahedronGeometry(1, 0);
  else if (roll < 0.5) geo = new THREE.IcosahedronGeometry(1, 0);
  else if (roll < 0.68) geo = new THREE.TetrahedronGeometry(1.15, 0);
  else if (roll < 0.85) geo = new THREE.OctahedronGeometry(1, 0);
  else geo = new THREE.BoxGeometry(1.1, 0.7 + rng() * 0.8, 0.9);
  const color = ROCK_COLORS[Math.floor(rng() * ROCK_COLORS.length)];
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.scale.set(scale * (0.7 + rng() * 0.7), scale * (0.55 + rng() * 0.9), scale * (0.7 + rng() * 0.7));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Jagged upright spires (the "flagelos" / rock spikes along ridges). */
function buildSpire(rng: () => number, h: number): THREE.Group {
  const g = new THREE.Group();
  const color = ROCK_COLORS[Math.floor(rng() * ROCK_COLORS.length)];
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35 + rng() * 0.25, 0.55 + rng() * 0.3, h * 0.35, 6), mat(color));
  base.position.y = h * 0.18;
  base.castShadow = true;
  g.add(base);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28 + rng() * 0.15, h * 0.75, 6), mat(color));
  tip.position.y = h * 0.55;
  tip.rotation.z = (rng() - 0.5) * 0.25;
  tip.castShadow = true;
  g.add(tip);
  return g;
}

function scatterRocks(scene: THREE.Scene, obstacles: Obstacle[]): void {
  const rng = moonRng(67 * 1009);
  // landmark boulder clusters near crater rims + a few ridge spires
  const landmarks: { x: number; z: number; n: number; spire?: boolean }[] = [
    { x: 25 + 11, z: -20 + 2, n: 4 },
    { x: -35 - 8, z: 30 + 4, n: 3 },
    { x: 50 - 12, z: 40 - 3, n: 5 },
    { x: -20 + 7, z: -45 - 5, n: 3 },
    { x: -60 + 6, z: -55 + 4, n: 2, spire: true },
    { x: 65 - 5, z: -30 + 6, n: 3, spire: true },
    { x: 12, z: 18, n: 2 }, // between lander and altar
    { x: -48, z: -8, n: 3, spire: true },
  ];

  for (const spot of landmarks) {
    for (let i = 0; i < spot.n; i++) {
      const ox = spot.x + (rng() - 0.5) * 5;
      const oz = spot.z + (rng() - 0.5) * 5;
      if (Math.hypot(ox - ALTAR.x, oz - ALTAR.z) < 9 || Math.hypot(ox - LANDER.x, oz - LANDER.z) < 7) continue;
      const hy = moonHeight(ox, oz);
      if (spot.spire && i === 0) {
        const h = 2.2 + rng() * 2.4;
        const sp = buildSpire(rng, h);
        sp.position.set(ox, hy, oz);
        scene.add(sp);
        obstacles.push({ minX: ox - 0.7, maxX: ox + 0.7, minZ: oz - 0.7, maxZ: oz + 0.7, height: h });
      } else {
        const r = 0.7 + rng() * 1.6;
        const rock = rockMesh(rng, r);
        rock.position.set(ox, hy + r * 0.35, oz);
        rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        scene.add(rock);
        if (r > 0.95) obstacles.push({ minX: ox - r * 0.7, maxX: ox + r * 0.7, minZ: oz - r * 0.7, maxZ: oz + r * 0.7, height: r });
      }
    }
  }

  // scatter of medium + small rocks across the mare
  for (let i = 0; i < 55; i++) {
    const x = (rng() - 0.5) * MOON_HALF * 1.7;
    const z = (rng() - 0.5) * MOON_HALF * 1.7;
    if (Math.hypot(x, z) < 14) continue;
    if (Math.hypot(x - ALTAR.x, z - ALTAR.z) < 11) continue;
    if (Math.hypot(x - LANDER.x, z - LANDER.z) < 9) continue;
    if (inDeepCrater(x, z)) continue;
    const r = 0.25 + rng() * 1.1;
    const rock = rockMesh(rng, r);
    const hy = moonHeight(x, z);
    rock.position.set(x, hy + r * 0.32, z);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    scene.add(rock);
    if (r > 0.85) obstacles.push({ minX: x - r * 0.65, maxX: x + r * 0.65, minZ: z - r * 0.65, maxZ: z + r * 0.65, height: r });
  }

  // pebble fields near the lander — scale of dust underfoot
  for (let i = 0; i < 28; i++) {
    const a = rng() * Math.PI * 2;
    const d = 4 + rng() * 14;
    const x = LANDER.x + Math.cos(a) * d;
    const z = LANDER.z + Math.sin(a) * d;
    if (Math.hypot(x - LANDER.x, z - LANDER.z) < 3.5) continue;
    const r = 0.12 + rng() * 0.28;
    const pebble = rockMesh(rng, r);
    const hy = moonHeight(x, z);
    pebble.position.set(x, hy + r * 0.25, z);
    pebble.rotation.set(rng(), rng(), rng());
    scene.add(pebble);
  }
}

function buildEarth(scene: THREE.Scene): void {
  const earth = new THREE.Group();
  // soft atmospheric halo (fog:false so it stays bright in the black sky)
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(12.5, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x74c0fc, transparent: true, opacity: 0.22, depthWrite: false, fog: false }),
  );
  earth.add(halo);
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x1c7ed6, emissive: 0x1864ab, emissiveIntensity: 0.55, roughness: 0.55, fog: false }),
  );
  earth.add(globe);
  // continents — a few stretched blobs, not a texture atlas
  const landMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, emissive: 0x1b5e20, emissiveIntensity: 0.25, roughness: 0.9, fog: false });
  for (const [lon, lat, sx, sy] of [
    [0.4, 0.2, 1.15, 0.7],
    [-0.8, -0.15, 0.9, 0.85],
    [1.5, 0.35, 0.7, 0.55],
    [2.4, -0.4, 1.0, 0.6],
  ] as const) {
    const land = new THREE.Mesh(new THREE.SphereGeometry(10.08, 16, 12), landMat);
    land.scale.set(sx, sy, 0.55);
    land.rotation.y = lon;
    land.rotation.x = lat;
    earth.add(land);
  }
  // cloud band
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(10.25, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf8f9fa, transparent: true, opacity: 0.32, roughness: 1, fog: false }),
  );
  clouds.scale.set(1.02, 0.75, 0.9);
  earth.add(clouds);
  // high in the sky, readable from the walkable mare
  earth.position.set(-40, 48, -55);
  scene.add(earth);
}

function buildStars(scene: THREE.Scene): void {
  // Extra near-field sparkle; Weather.setSpace also keeps its own star dome.
  const starGeo = new THREE.BufferGeometry();
  const n = 500;
  const starPos = new Float32Array(n * 3);
  const starCol = new Float32Array(n * 3);
  const rng = moonRng(4242);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const b = 0.15 + rng() * 1.0;
    const rad = 120 + rng() * 100;
    starPos[i * 3] = Math.cos(a) * Math.cos(b) * rad;
    starPos[i * 3 + 1] = 20 + Math.sin(b) * rad * 0.9;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * rad;
    const bright = 0.7 + rng() * 0.3;
    starCol[i * 3] = bright;
    starCol[i * 3 + 1] = bright;
    starCol[i * 3 + 2] = bright;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 1.4, vertexColors: true, sizeAttenuation: true, fog: false, depthWrite: false }),
    ),
  );
}

/**
 * Distant mountains so the horizon isn't a hard cut. Always OUTSIDE the walkable square (±MOON_HALF): before
 * 2026-11-19 their bases reached ~84 m from the centre and she could walk inside the dark cones ("black pyramids").
 * Grey like the Moon rocks, rounder (9 sides) so they read as mountains, not pyramids.
 */
function buildHorizonRidges(scene: THREE.Scene): void {
  const matRidge = new THREE.MeshStandardMaterial({ color: 0x6a6d74, roughness: 1, flatShading: true });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r = 8 + (i % 4) * 2.2;
    const h = 7 + (i % 5) * 2.5;
    // distance from the centre to the square's wall in this direction, then clear of it by the mountain's radius
    const wall = MOON_HALF / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const dist = wall + r + 3 + (i % 3) * 4;
    // a small range: one main peak and two lower ones beside it (along the wall), so it reads as mountains
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    const sx = -Math.sin(a);
    const sz = Math.cos(a);
    for (const [off, k] of [
      [0, 1],
      [r * 0.9, 0.62],
      [-r * 0.8, 0.5],
    ] as const) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r * (0.6 + k * 0.4), h * k, 9), matRidge);
      peak.position.set(cx + sx * off, (h * k) / 2 - 0.6, cz + sz * off);
      peak.rotation.y = a + off;
      scene.add(peak);
    }
  }
}

/** Bare Moon world: no city grid — grey ground, stars, Earth in the sky, lander. */
export function createMoonWorld(scene: THREE.Scene, city: import('./cities').City): World {
  scene.background = new THREE.Color(city.sky);
  // lighter fog than before — stars and Earth stay readable, horizon still softens
  scene.fog = new THREE.FogExp2(0x05060f, 0.0075);

  // hard lunar lighting: bright sun, dim fill
  const hemi = new THREE.HemisphereLight(0xd0d5de, 0x1a1c22, 0.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5e6, 2.05);
  sun.position.set(55, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  scene.add(sun);
  // cool bounce from Earthshine
  const earthShine = new THREE.DirectionalLight(0x74c0fc, 0.28);
  earthShine.position.set(-40, 30, -50);
  scene.add(earthShine);

  const ground = buildMoonGround(scene);
  ground.name = 'ground';

  buildStars(scene);
  buildEarth(scene);
  buildHorizonRidges(scene);

  const obstacles: Obstacle[] = [];
  buildLander(scene, obstacles);
  scatterRocks(scene, obstacles);

  const e = MOON_HALF;
  obstacles.push({ minX: -e - 20, maxX: -e, minZ: -e - 20, maxZ: e + 20 });
  obstacles.push({ minX: e, maxX: e + 20, minZ: -e - 20, maxZ: e + 20 });
  obstacles.push({ minX: -e - 20, maxX: e + 20, minZ: -e - 20, maxZ: -e });
  obstacles.push({ minX: -e - 20, maxX: e + 20, minZ: e, maxZ: e + 20 });
  return {
    ground,
    hemi,
    sun,
    obstacles,
    interactables: [],
    buildings: new Set(),
    clearArea() {},
    heightAt: moonHeight,
    update() {},
  };
}

/** Drop extra coins/jewels on crater rims and the path to the altar (after Collectibles is created). */
export function seedMoonLoot(collectibles: { placeAt: (kind: 'coin' | 'jewel', x: number, z: number) => void }): void {
  for (const spot of MOON_LOOT) collectibles.placeAt(spot.kind, spot.x, spot.z);
}
