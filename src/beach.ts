import * as THREE from 'three';
import type { Obstacle } from './world';

/**
 * Rio de Janeiro — the long beach (Telmo, 2026-11-28): along the whole +Z side of the map (the side furthest from
 * the airport, which sits on +X), a Copacabana-style promenade (black-and-white wave pavement), a wide strip of sand
 * and then the ocean, out to the horizon (the fog melts it into the sky).
 *
 *   z < 110          city (the north–south roads stop here: world.ts ROAD_ENDS, traffic.ts)
 *   110 … 116        calçadão (wave pavement) with palm trees on the sand side
 *   116 … 138        sand (wet, darker sand near the water)
 *   138 … 141.5      shallow water: she may paddle here (splashes, beachlife.ts)
 *   > 141.5          deep water: a long invisible wall (SEA_WALL) stops her — the swimmers are out there
 *
 * This file only draws the static scenery and the waves (built by world.ts createWorld, before anything else is
 * placed, so a placement guard keeps the fair / venues / props / landmarks off the sand). The people, the sounds
 * and the narrator are in beachlife.ts (built at the end of the Rio landmarks, which also drops the guard).
 * Only three.js and types are imported here (world.ts imports this file).
 */

export const BEACH_CITY = 'Rio de Janeiro';

export const BEACH = {
  /** Promenade: city side / sand side (z). */
  prom0: 110,
  prom1: 116,
  /** Waterline (z). */
  shore: 138,
  /** Furthest z her centre can reach (ankle-deep water). */
  wade: 141.5,
  /** Half length along x (the whole side of the map). */
  half: 150,
} as const;

/** Character radius (character.ts CHARACTER_RADIUS) — the sea wall sits this far past BEACH.wade. */
const HER_R = 0.45;

/** Deep water: nothing walks / drives / spawns past here. */
const SEA_WALL: Obstacle = { minX: -2000, maxX: 2000, minZ: BEACH.wade + HER_R, maxZ: 3000, height: 0.2 };

/** Placement guard while the city is being built (dropped by releaseBeachGuard at the end of the Rio landmarks). */
let guard: Obstacle | null = null;
let guardList: Obstacle[] | null = null;

/** Drop the placement guard (the sand becomes walkable ground again). Safe to call twice. */
export function releaseBeachGuard(): void {
  if (guard && guardList) {
    const i = guardList.indexOf(guard);
    if (i >= 0) guardList.splice(i, 1);
  }
  guard = null;
  guardList = null;
}

/** Palm trees along the promenade (x positions), shared with beachlife.ts so nothing is put on top of them. */
export const PALM_XS: number[] = [];
for (let x = -141; x <= 141; x += 15) PALM_XS.push(x);
export const PALM_Z = BEACH.prom1 + 1.2;

/** Black-and-white wave pavement (the Copacabana calçadão): waves run along the beach. */
function waveTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#26262b';
  // three dark bands per tile, each a sine wave (one full wave across the tile, so it repeats seamlessly)
  for (let b = 0; b < 3; b++) {
    const y0 = 10 + b * 43;
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = y0 + Math.sin((x / W) * Math.PI * 2) * 11;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let x = W; x >= 0; x -= 4) g.lineTo(x, y0 + 16 + Math.sin((x / W) * Math.PI * 2) * 11);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Flat strip lying on the ground: x ∈ [x0, x1], z ∈ [z0, z1], at height y. */
function strip(x0: number, x1: number, z0: number, z1: number, y: number, m: THREE.Material, sx = 1, sz = 1): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const m2 = new THREE.Mesh(geo, m);
  m2.receiveShadow = true;
  return m2;
}

/** Wave height + slope used by the sea shader (GLSL). World x/z; amplitude grows away from the shore. */
const WAVE_GLSL = /* glsl */ `
uniform float uTime;
float waveAmp(float z) { return 0.03 + 0.11 * smoothstep(${BEACH.shore.toFixed(1)}, ${(BEACH.shore + 18).toFixed(1)}, z); }
float waveH(vec2 p) {
  float a = waveAmp(p.y);
  return a * (sin(p.y * 0.55 - uTime * 1.5 + sin(p.x * 0.045) * 2.0) + 0.55 * sin(p.y * 0.23 + p.x * 0.17 - uTime * 0.9));
}
`;

export interface BeachScenery {
  update(dt: number): void;
}

/** Sand, promenade, palms and the animated sea. Pushes the sea wall, the palm trunks and the placement guard. */
export function buildBeachScenery(scene: THREE.Scene, obstacles: Obstacle[]): BeachScenery {
  const { prom0, prom1, shore, half } = BEACH;
  const root = new THREE.Group();
  root.name = 'beach';
  scene.add(root);

  /* —— calçadão —— */
  const tex = waveTexture();
  tex.repeat.set((half * 2) / 6, 1);
  root.add(strip(-half, half, prom0, prom1, 0.03, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })));
  // low kerb between the promenade and the sand
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0xe9ecef }));
  kerb.position.set(0, 0.06, prom1);
  root.add(kerb);

  /* —— sand (speckled with vertex colours) + wet sand at the water —— */
  const sandGeo = new THREE.PlaneGeometry(half * 2, shore + 0.6 - prom1, 120, 10);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(0, 0.025, (prom1 + shore + 0.6) / 2);
  const sp = sandGeo.getAttribute('position') as THREE.BufferAttribute;
  const sc = new Float32Array(sp.count * 3);
  const dry = new THREE.Color(0xf3dca5);
  const wet = new THREE.Color(0xcfae74);
  const tmpC = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    const r = n - Math.floor(n);
    const wetK = THREE.MathUtils.smoothstep(z, shore - 4, shore - 0.5);
    tmpC.copy(dry).lerp(wet, wetK).multiplyScalar(0.94 + r * 0.1);
    sc.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  sandGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  sand.receiveShadow = true;
  sand.name = 'sand';
  root.add(sand);

  /* —— the sea: a finely divided strip near the beach (waves) + a big flat sheet out to the horizon —— */
  const seaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05 });
  const uTime = { value: 0 };
  seaMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${WAVE_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 wp0 = position.xz;
        float e = 0.4;
        float hx = waveH(wp0 + vec2(e, 0.0)) - waveH(wp0 - vec2(e, 0.0));
        float hz = waveH(wp0 + vec2(0.0, e)) - waveH(wp0 - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);\ntransformed.y += waveH(position.xz);`);
  };
  const seaColours = (geo: THREE.BufferGeometry): void => {
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const near = new THREE.Color(0x3fd0c9);
    const mid = new THREE.Color(0x1c9ad6);
    const far = new THREE.Color(0x1462b8);
    for (let i = 0; i < p.count; i++) {
      const d = p.getZ(i) - shore;
      if (d < 14) tmpC.copy(near).lerp(mid, THREE.MathUtils.clamp(d / 14, 0, 1));
      else tmpC.copy(mid).lerp(far, THREE.MathUtils.clamp((d - 14) / 60, 0, 1));
      col.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  const NEAR_END = shore + 70;
  const seaNear = strip(-230, 230, shore - 0.4, NEAR_END, 0.1, seaMat, 92, 70);
  seaColours(seaNear.geometry);
  seaNear.receiveShadow = false;
  seaNear.name = 'sea';
  root.add(seaNear);
  // the rest of the ocean (flat, coarse; the fog turns it into the horizon). Slightly lower so the strips never fight.
  const farGeo = new THREE.PlaneGeometry(4000, 3000, 8, 6);
  farGeo.rotateX(-Math.PI / 2);
  farGeo.translate(0, 0.04, shore + 1500);
  seaColours(farGeo);
  const seaFar = new THREE.Mesh(farGeo, seaMat);
  seaFar.name = 'sea-far';
  root.add(seaFar);

  /* —— foam: the wash line at the shore + a few breaking crests rolling in —— */
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const wash = strip(-half, half, -0.6, 0.6, 0, foamMat);
  wash.position.set(0, 0.17, shore);
  root.add(wash);
  // short broken crests (not long straight lines): 12 pieces, each with its own timing and place along the beach
  const crests: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; x: number; speed: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const len = 22 + ((i * 53) % 30);
    const c = strip(-len / 2, len / 2, -0.18, 0.18, 0, m);
    root.add(c);
    crests.push({ mesh: c, mat: m, t: ((i * 7) % 12) / 12, x: -half + ((i * 97) % 12) * (half / 6) + 12, speed: 1 / (6.5 + (i % 4)) });
  }

  /* —— palm trees on the sand side of the promenade (instanced: trunk + 7 leaves each) —— */
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.6, 7);
  trunkGeo.translate(0, 2.8, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x9c7a54, flatShading: true }), PALM_XS.length);
  const leafGeo = new THREE.ConeGeometry(0.4, 2.8, 4);
  leafGeo.scale(1, 1, 0.25);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2f9e44, flatShading: true }), PALM_XS.length * 7);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  PALM_XS.forEach((x, i) => {
    const lean = ((i * 37) % 7) / 7 - 0.5;
    e.set(0, 0, lean * 0.12);
    m4.compose(v.set(x, 0, PALM_Z), q.setFromEuler(e), one);
    trunks.setMatrixAt(i, m4);
    const topX = x - Math.sin(lean * 0.12) * 5.6;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + i;
      e.set(0, -a, -Math.PI / 2 - 0.4);
      m4.compose(v.set(topX + Math.cos(a) * 1.1, 5.4, PALM_Z + Math.sin(a) * 1.1), q.setFromEuler(e), one);
      leaves.setMatrixAt(i * 7 + k, m4);
    }
    obstacles.push({ minX: x - 0.3, maxX: x + 0.3, minZ: PALM_Z - 0.3, maxZ: PALM_Z + 0.3 });
  });
  trunks.castShadow = leaves.castShadow = true;
  root.add(trunks, leaves);

  /* —— collision: the deep sea; and the placement guard over the whole strip until the city is built —— */
  obstacles.push({ ...SEA_WALL });
  releaseBeachGuard();
  guard = { minX: -half - 10, maxX: half + 10, minZ: prom0 - 2, maxZ: BEACH.wade + 1 };
  guardList = obstacles;
  obstacles.push(guard);

  let t = 0;
  return {
    update(dt) {
      t += dt;
      uTime.value = t;
      // the wash runs up the sand and back
      const k = Math.sin(t * 0.75);
      wash.position.z = shore - 0.15 + k * 0.55;
      wash.scale.z = 1 + Math.max(0, -k) * 0.8;
      foamMat.opacity = 0.65 + 0.25 * Math.max(0, k);
      // crests roll in from 14 m out, fade in, break at the shore and vanish
      for (const c of crests) {
        c.t = (c.t + dt * c.speed) % 1;
        const z = shore + 12 * (1 - c.t);
        c.mesh.position.set(c.x, 0.16 + 0.2 * (1 - c.t), z);
        c.mat.opacity = Math.min(1, c.t * 2.5) * (c.t > 0.8 ? (1 - c.t) / 0.2 : 1) * 0.55;
        c.mesh.scale.set(0.6 + c.t * 0.6, 1, 1 + c.t * 2);
      }
    },
  };
}
