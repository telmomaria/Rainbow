import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import type { GameCtx } from './gamectx';
import type { towerClimb } from './landmarks';
import { gemMesh, openSpot } from './places';
import { inNoSpawn } from './spawn';
import { buildFolk } from './venue';
import { onRoad, ROADS, SPAWN, type Interactable, type Obstacle, type World } from './world';

/**
 * Cidade do México — ex-líbris e ambiente (Telmo, 2026-11-28). Tudo só nesta cidade (BY_CITY em landmarks.ts).
 *
 *  - Teotihuacán: grande pirâmide em degraus (estilo Pirâmide do Sol, 5 patamares, ~18,5 m), escadaria central à frente
 *    com balaustradas e um templozinho no cimo. Sobe-se pelas escadas (towerClimb: clicar/Enter), no terraço há a joia
 *    num pedestal ao lado dela, a vista roda (arrastar / ←→) e andar = descer.
 *  - Guerreiros de Tula: 4 «atlantes» de pedra numa plataforma baixa com escadas, pilares quadrados atrás. Chegar à
 *    frente das escadas = tambor de pedra, os olhos brilham, a narradora diz quem são.
 *  - Casa Azul: casa de paredes azul-cobalto com frisos vermelhos e janelas verdes, pátio com árvores, catos, agaves,
 *    vasos de flores e uma pequena pirâmide de jardim. Entrar no pátio = pássaros levantam voo, as flores saltitam e a
 *    narradora diz de quem era a casa.
 *  - Bandeirinhas (papel picado) vermelhas, brancas e verdes em fios entre pares de edifícios próximos, acima da
 *    cabeça, nunca por cima das ruas; abanam com o vento (um InstancedMesh para todas).
 *  - Crianças com máscaras de caveirinha do Dia dos Mortos (coloridas, com flores, nada assustadoras) a brincar à
 *    apanhada num relvado. Ficam aqui (e não em src/folk/) porque correm por um círculo largo e não são sólidas —
 *    o palco fixo e o corpo sólido do Puppet não servem — e porque assim os ex-líbris já as evitam ao escolher sítio.
 *    Quando ela chega perto param, viram-se para ela, saltam, acenam e riem-se.
 *
 * Sem UI: nada de ícones, setas ou texto no mundo; feedback = som, movimento, luz e a voz da narradora.
 * Desempenho: cada construção é uma só malha com cores por vértice (mergeGeometries), materiais partilhados.
 */

export interface MexicoKit {
  setDebug(d: Record<string, unknown>): void;
  climb: typeof towerClimb;
}

const UP = new THREE.Vector3(0, 1, 0);
const RED = 0xce1126;
const WHITE = 0xffffff;
const GREEN = 0x006847;

/* ------------------------------------------------------------------ merged, vertex-coloured geometry */

const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

/** Collects coloured parts and merges them into ONE mesh (one draw call). */
class Painter {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();

  add(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    g.applyMatrix4(this.m);
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(color);
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.parts.push(g);
  }
  box(color: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
    this.add(new THREE.BoxGeometry(sx, sy, sz), color, x, y, z, ry, rx, rz);
  }
  cyl(color: number, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 8, ry = 0, rx = 0, rz = 0): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y, z, ry, rx, rz);
  }
  /** Square frustum (pyramid tier): half sides at the bottom / top, centred on (x, y0..y1, z). */
  frustum(color: number, halfBot: number, halfTop: number, y0: number, y1: number, x = 0, z = 0): void {
    this.add(new THREE.CylinderGeometry(halfTop * Math.SQRT2, halfBot * Math.SQRT2, y1 - y0, 4, 1), color, x, (y0 + y1) / 2, z, Math.PI / 4);
  }
  ball(color: number, r: number, x: number, y: number, z: number, sy = 1): void {
    this.add(new THREE.IcosahedronGeometry(r, 0), color, x, y, z, 0, 0, 0, 1, sy, 1);
  }
  mesh(material: THREE.Material = vcMat): THREE.Mesh {
    const geo = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** A side profile (z, y) extruded `width` m across X, centred on x = 0. */
function profileGeo(pts: [number, number][], width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); // shape x → local +Z, extrusion → -X
  geo.translate(width / 2, 0, 0);
  return geo;
}

/* ------------------------------------------------------------------ placement */

const rectHitsRoad = (minX: number, maxX: number, minZ: number, maxZ: number, m: number): boolean =>
  ROADS.xs.some((rx) => maxX > rx - ROADS.width / 2 - m && minX < rx + ROADS.width / 2 + m) ||
  ROADS.zs.some((rz) => maxZ > rz - ROADS.width / 2 - m && minZ < rz + ROADS.width / 2 + m);

interface Plot {
  x: number;
  z: number;
  yaw: number;
  removed: number;
}

/**
 * A plot of half sizes hw × hd (local frame: front = +Z, turned to face the nearest road), off roads, venues,
 * airport and the start point; only placeholder buildings may be in the way (cleared). Fewer removed is better.
 */
function pickPlot(
  world: World,
  obstacles: Obstacle[],
  rng: () => number,
  hw: number,
  hd: number,
  o: { ideal: number; away: { x: number; z: number; d: number }[]; margin?: number },
): Plot | null {
  const margin = o.margin ?? 3;
  let best: (Plot & { score: number }) | null = null;
  const lim = ROADS.extent - 10;
  const off = rng() * 4;
  for (let cx = -lim + off; cx <= lim; cx += 3) {
    for (let cz = -lim + off; cz <= lim; cz += 3) {
      if (o.away.some((a) => Math.hypot(cx - a.x, cz - a.z) < a.d)) continue;
      let gap = Infinity;
      let yaw = 0;
      for (const rz of ROADS.zs) {
        const d = Math.abs(rz - cz);
        if (d < gap) {
          gap = d;
          yaw = rz > cz ? 0 : Math.PI;
        }
      }
      for (const rx of ROADS.xs) {
        const d = Math.abs(rx - cx);
        if (d < gap) {
          gap = d;
          yaw = rx > cx ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      const side = Math.abs(Math.sin(yaw)) > 0.5;
      const ehw = side ? hd : hw;
      const ehd = side ? hw : hd;
      const minX = cx - ehw;
      const maxX = cx + ehw;
      const minZ = cz - ehd;
      const maxZ = cz + ehd;
      if (Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) > lim) continue;
      if (rectHitsRoad(minX, maxX, minZ, maxZ, 2.5)) continue;
      const a = AIRPORT_ZONE;
      if (maxX + 4 > a.minX && minX - 4 < a.maxX && maxZ + 4 > a.minZ && minZ - 4 < a.maxZ) continue;
      const sx = Math.max(minX, Math.min(SPAWN.x, maxX));
      const sz = Math.max(minZ, Math.min(SPAWN.z, maxZ));
      if (Math.hypot(sx - SPAWN.x, sz - SPAWN.z) < 25) continue;
      let bad = false;
      for (let x = minX; x <= maxX + 0.01 && !bad; x += (maxX - minX) / 8) {
        for (let z = minZ; z <= maxZ + 0.01; z += (maxZ - minZ) / 8) {
          if (inNoSpawn(x, z, 3)) {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      let removed = 0;
      for (const ob of obstacles) {
        if (ob.maxX + margin > minX && ob.minX - margin < maxX && ob.maxZ + margin > minZ && ob.minZ - margin < maxZ) {
          if (world.buildings.has(ob)) removed++;
          else {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      const frontGap = gap - ehd - ROADS.width / 2;
      const dist = Math.hypot(cx - SPAWN.x, cz - SPAWN.z);
      const score = removed * 10 + Math.abs(frontGap - 3) + Math.abs(dist - o.ideal) * 0.25;
      if (!best || score < best.score) best = { x: cx, z: cz, yaw, removed, score };
    }
  }
  return best;
}

/** Plot frame: local (front = +Z) → world, local boxes → world obstacles. */
function frame(plot: Plot, obstacles: Obstacle[]) {
  const c = new THREE.Vector3(plot.x, 0, plot.z);
  const W = (lx: number, lz: number, ly = 0): THREE.Vector3 => new THREE.Vector3(lx, ly, lz).applyAxisAngle(UP, plot.yaw).add(c);
  const box = (minX: number, maxX: number, minZ: number, maxZ: number): Obstacle => {
    const a = W(minX, minZ);
    const b = W(maxX, maxZ);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  };
  const solid = (minX: number, maxX: number, minZ: number, maxZ: number, height?: number): void => {
    const o = box(minX, maxX, minZ, maxZ);
    if (height !== undefined) o.height = height;
    obstacles.push(o);
  };
  return { W, box, solid };
}

function plotRoot(scene: THREE.Scene, plot: Plot): THREE.Group {
  const g = new THREE.Group();
  g.position.set(plot.x, 0, plot.z);
  g.rotation.y = plot.yaw;
  scene.add(g);
  return g;
}

function paving(root: THREE.Object3D, w: number, d: number, color: number, z = 0): void {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  p.rotation.x = -Math.PI / 2;
  p.position.set(0, 0.02, z);
  p.receiveShadow = true;
  root.add(p);
}

/* ------------------------------------------------------------------ Teotihuacán */

/** Plot half sizes; the pyramid centre sits at local z = PY_CZ (stairs come forward to +Z). */
const PY_HW = 19;
const PY_HD = 23;
const PY_CZ = -4;
/** Tiers: [y0, y1, half side at the bottom, half side at the top]. */
const TIERS: [number, number, number, number][] = [
  [0, 5, 16, 14],
  [5, 9.5, 13, 11],
  [9.5, 13.5, 10, 8.2],
  [13.5, 16.5, 7.4, 6],
  [16.5, 18.5, 5.4, 4.6],
];
const PY_TOP = 18.5;
const STAIR_W = 5;
const RISE = 0.5;
const TREAD = 0.5;
const STAIR_N = Math.round(PY_TOP / RISE); // 37
/** Stair top edge (pyramid-local z) and its foot. */
const STAIR_ZT = 4.6;
const STAIR_ZF = STAIR_ZT + STAIR_N * TREAD;

function buildTeotihuacan(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  plot: Plot,
  ctx: GameCtx,
  kit: MexicoKit,
): { things: Interactable[]; debug: Record<string, unknown> } {
  const root = plotRoot(scene, plot);
  const F = frame(plot, obstacles);
  paving(root, PY_HW * 2, PY_HD * 2, 0xd8c29a);

  const g = new THREE.Group(); // the pyramid, centred at local z = PY_CZ
  g.position.z = PY_CZ;
  root.add(g);
  const p = new Painter();
  const shades = [0x9c8468, 0x8c7459, 0xa38b6e, 0x8f785d, 0x9a8366];
  TIERS.forEach(([y0, y1, hb, ht], i) => {
    p.frustum(shades[i], hb, ht, y0, y1);
    // a slightly darker skirt where each terrace meets the next tier (reads as layered stone)
    if (i > 0) p.frustum(0x7a654d, hb + 0.25, hb + 0.25, y0, y0 + 0.3);
  });
  // the staircase: real steps (stepped profile extruded), stone balustrades either side
  const prof: [number, number][] = [[STAIR_ZF, 0]];
  for (let i = 1; i <= STAIR_N; i++) {
    prof.push([STAIR_ZF - (i - 1) * TREAD, i * RISE]);
    prof.push([STAIR_ZF - i * TREAD, i * RISE]);
  }
  prof.push([STAIR_ZT, PY_TOP - 0.3], [0, 0]);
  p.add(profileGeo(prof, STAIR_W), 0xb9a386, 0, 0, 0);
  const railTop = (z: number) => 0.5 + (STAIR_ZF - z) + 0.65;
  for (const s of [-1, 1]) {
    const rail: [number, number][] = [
      [STAIR_ZF + 0.4, 0],
      [STAIR_ZF + 0.4, 0.75],
      [STAIR_ZT + 0.5, railTop(STAIR_ZT + 0.5)],
      [STAIR_ZT, railTop(STAIR_ZT + 0.5)],
      [STAIR_ZT, PY_TOP - 0.3],
      [0, 0],
    ];
    p.add(profileGeo(rail, 0.7), 0x7e6850, s * (STAIR_W / 2 + 0.35), 0, 0);
  }
  // little temple on the top (at the back of the terrace: the front stays free for her and the jewel)
  p.box(0xc4a27a, 5.2, 2.6, 3.0, 0, PY_TOP + 1.3, -2.4);
  p.box(0x9b3d2e, 5.8, 0.35, 3.6, 0, PY_TOP + 2.75, -2.4);
  p.box(0x9b3d2e, 4.6, 0.3, 2.8, 0, PY_TOP + 3.05, -2.4);
  p.box(0x3b2f2a, 1.3, 1.8, 0.1, 0, PY_TOP + 0.9, -0.88);
  for (const sx of [-1.8, 1.8]) p.box(0xe0c08a, 0.5, 0.5, 0.12, sx, PY_TOP + 1.8, -0.86);
  // pedestal for the jewel, beside where she stands
  p.box(0xd9c3a0, 0.8, 0.9, 0.8, 1.9, PY_TOP + 0.45, 3.1);
  // a few stones around the plaza
  for (const [x, z] of [[-17, 14], [17, 16], [-16, -21], [16, -21]] as const) p.ball(0x8f8a80, 0.6, x, 0.35, z - PY_CZ, 0.6);
  const pyramid = p.mesh();
  g.add(pyramid);

  // solids: pyramid base, the stair block
  F.solid(-16, 16, PY_CZ - 16, PY_CZ + 16);
  F.solid(-(STAIR_W / 2 + 0.7), STAIR_W / 2 + 0.7, PY_CZ + 14, PY_CZ + STAIR_ZF + 0.4);

  const gem = gemMesh(0xffa94d, 1.4);
  gem.position.set(1.9, PY_TOP + 1.45, 3.1);
  g.add(gem);

  // climb path (world): foot → one waypoint every 2 steps → the terrace
  const foot = F.W(0, PY_CZ + STAIR_ZF + 1.5);
  const steps: THREE.Vector3[] = [];
  for (let i = 1; i <= STAIR_N; i += 2) steps.push(F.W(0, PY_CZ + STAIR_ZF - (i - 0.5) * TREAD, i * RISE + 0.02));
  const top = F.W(0, PY_CZ + STAIR_ZT - 1.2, PY_TOP);
  // the view from the top: just above the terrace, looking out over the city (towards the centre)
  const toC = Math.hypot(top.x, top.z) > 1 ? new THREE.Vector2(-top.x, -top.z).normalize() : new THREE.Vector2(0, 1);
  const vista = {
    fromX: top.x + toC.x * 1.6,
    fromZ: top.z + toC.y * 1.6,
    h: PY_TOP + 2.6,
    x: top.x + toC.x * 80,
    z: top.z + toC.y * 80,
    lookY: 2,
  };
  const climb = kit.climb({
    ctx,
    object: g,
    foot,
    top,
    steps,
    gem,
    gemKey: `gem:${ctx.city()}:teotihuacan`,
    sayTop: ['No cimo da pirâmide de Teotihuacán! Que alta!'],
    sayGem: ['Uma joia do ex-líbris! Guarda-a bem!'],
    interactAt: foot,
    radius: 5,
    vista,
  });
  const r = (v: THREE.Vector3) => [+v.x.toFixed(1), +v.z.toFixed(1)];
  return {
    things: [climb],
    debug: { at: [plot.x, plot.z], yaw: +plot.yaw.toFixed(2), foot: r(foot), top: [...r(top), PY_TOP], removed: plot.removed },
  };
}

/* ------------------------------------------------------------------ Tula */

const TU_HW = 8.5;
const TU_HD = 7.5;

/** One stylised Atlante (feet at y 0, faces +Z) into the painter; eyes into `eyes`. */
function atlante(p: Painter, eyes: Painter, x: number, y: number, z: number): void {
  const stone = 0xb8ad9c;
  const light = 0xd3c8b4;
  const dark = 0x968b7a;
  p.box(dark, 1.05, 0.35, 0.95, x, y + 0.175, z + 0.05); // sandals
  for (const s of [-1, 1]) p.box(stone, 0.4, 1.35, 0.48, x + s * 0.25, y + 1.0, z); // legs
  p.box(light, 0.95, 0.7, 0.62, x, y + 1.85, z + 0.03); // loincloth / apron
  p.box(dark, 1.15, 0.22, 0.78, x, y + 2.05, z); // belt
  p.cyl(light, 0.22, 0.22, 0.08, x, y + 2.05, z - 0.42, 10, 0, Math.PI / 2); // disc at the back of the belt
  p.box(stone, 1.08, 1.25, 0.72, x, y + 2.78, z); // torso
  for (const s of [-1, 1]) p.box(light, 0.42, 0.34, 0.1, x + s * 0.22, y + 2.95, z + 0.38, 0, 0, s * 0.45); // butterfly breastplate
  p.box(light, 0.16, 0.3, 0.12, x, y + 2.8, z + 0.39);
  for (const s of [-1, 1]) {
    p.box(stone, 0.3, 1.25, 0.38, x + s * 0.7, y + 2.6, z); // arms down the sides
    p.box(light, 0.36, 0.14, 0.44, x + s * 0.7, y + 2.15, z); // bracelets
  }
  p.cyl(dark, 0.06, 0.06, 1.5, x + 0.92, y + 2.2, z + 0.15, 6); // spear-thrower held at the side
  p.box(stone, 0.72, 0.78, 0.68, x, y + 3.8, z); // head
  p.box(dark, 0.14, 0.26, 0.1, x, y + 3.75, z + 0.37); // nose
  p.box(dark, 0.34, 0.07, 0.06, x, y + 3.56, z + 0.36); // mouth
  for (const s of [-1, 1]) p.box(light, 0.12, 0.32, 0.3, x + s * 0.41, y + 3.75, z); // ear plugs
  eyes.box(0x2b2622, 0.16, 0.1, 0.06, x - 0.16, y + 3.92, z + 0.36);
  eyes.box(0x2b2622, 0.16, 0.1, 0.06, x + 0.16, y + 3.92, z + 0.36);
  p.cyl(light, 0.46, 0.42, 0.42, x, y + 4.38, z, 10); // headband
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.box(i % 2 ? stone : light, 0.16, 0.7, 0.07, x + Math.sin(a) * 0.42, y + 4.85, z + Math.cos(a) * 0.42, a); // feathers
  }
}

function buildTula(scene: THREE.Scene, obstacles: Obstacle[], plot: Plot, ctx: GameCtx): { things: Interactable[]; debug: Record<string, unknown> } {
  const root = plotRoot(scene, plot);
  const F = frame(plot, obstacles);
  paving(root, TU_HW * 2, TU_HD * 2, 0xd6c6a5);
  const PH = 1.4; // platform height
  const p = new Painter();
  const eyes = new Painter();
  // platform (talud with a frieze), front stairs
  p.box(0xa89a84, 13.4, PH, 5.8, 0, PH / 2, -3.4);
  p.box(0x8f826e, 13.6, 0.35, 6.0, 0, PH - 0.35, -3.4);
  for (let i = 0; i < 9; i++) p.box(0xc9b99c, 0.6, 0.22, 0.06, -5.6 + i * 1.4, PH - 0.35, -0.38); // little frieze blocks
  for (let i = 0; i < 4; i++) p.box(0xb9ab94, 4.8, (i + 1) * 0.35, 0.45, 0, ((i + 1) * 0.35) / 2, -0.5 + (4 - i) * 0.45 - 0.22);
  // warriors in a row, square pillars behind them
  const xs = [-4.5, -1.5, 1.5, 4.5];
  for (const x of xs) {
    atlante(p, eyes, x, PH, -2.7);
    p.box(0xa59985, 0.85, 4.6, 0.85, x, PH + 2.3, -5.2);
    for (const y of [1.2, 2.6, 3.9]) p.box(0xc4b59c, 0.9, 0.25, 0.9, x, PH + y, -5.2);
  }
  const statues = p.mesh();
  root.add(statues);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2b2622, emissive: 0xffc94d, emissiveIntensity: 0, flatShading: true });
  root.add(eyes.mesh(eyeMat));
  F.solid(-6.8, 6.8, -6.3, -0.4);
  F.solid(-2.5, 2.5, -0.4, 1.4, PH);

  let glow = 0;
  let said = 0;
  const lines = ['Os guerreiros de Tula! São gigantes de pedra muito antigos.', 'Bum, bum! Os guerreiros de pedra guardam o templo.'];
  const spot = F.W(0, 2.6);
  return {
    things: [
      {
        object: statues,
        position: spot,
        radius: 2.4,
        interact() {
          if (glow > 0.5) return;
          glow = 3.2;
          // soft stone drum: low thumps, then a quick double beat
          [0, 0.45, 0.9, 1.15].forEach((t, i) => tone(i === 3 ? 98 : 82, t, 0.4, 'sine', 0.16));
          [0, 0.45, 0.9, 1.15].forEach((t) => tone(196, t, 0.06, 'triangle', 0.03));
          ctx.say([lines[said % lines.length]]);
          said++;
        },
        update(dt) {
          if (glow <= 0) return;
          glow = Math.max(0, glow - dt);
          eyeMat.emissiveIntensity = Math.min(1, glow) * (0.7 + Math.sin(glow * 8) * 0.3);
        },
      },
    ],
    debug: { at: [plot.x, plot.z], yaw: +plot.yaw.toFixed(2), spot: [+spot.x.toFixed(1), +spot.z.toFixed(1)], removed: plot.removed },
  };
}

/* ------------------------------------------------------------------ Casa Azul */

const CA_HW = 10;
const CA_HD = 9.5;
const COBALT = 0x1f5fd6;
const TRIM = 0xc92a2a;
const SHUTTER = 0x2b8a3e;

function buildCasaAzul(scene: THREE.Scene, obstacles: Obstacle[], plot: Plot, ctx: GameCtx): { things: Interactable[]; debug: Record<string, unknown> } {
  const root = plotRoot(scene, plot);
  const F = frame(plot, obstacles);
  paving(root, CA_HW * 2, CA_HD * 2, 0xcfc4b0);
  const p = new Painter();
  const H = 4.4; // house height
  const WALL = 3.0; // garden wall height
  // front wing (street façade) with the gate passage in the middle; left wing; garden walls (back, right)
  const block = (x0: number, x1: number, z0: number, z1: number, h: number) => {
    p.box(COBALT, x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    p.box(TRIM, x1 - x0 + 0.08, 0.55, z1 - z0 + 0.08, (x0 + x1) / 2, 0.27, (z0 + z1) / 2); // red skirting
    p.box(TRIM, x1 - x0 + 0.24, 0.3, z1 - z0 + 0.24, (x0 + x1) / 2, h + 0.05, (z0 + z1) / 2); // red cornice
    p.box(0xd9d2c3, x1 - x0 - 0.4, 0.04, z1 - z0 - 0.4, (x0 + x1) / 2, h + 0.21, (z0 + z1) / 2); // flat roof (only a red rim shows)
  };
  block(-9.5, -1.4, 4.5, 8.5, H);
  block(1.4, 9.5, 4.5, 8.5, H);
  p.box(COBALT, 2.8, H - 2.9, 4, 0, 2.9 + (H - 2.9) / 2, 6.5); // over the gate
  p.box(TRIM, 3.0, 0.3, 4.24, 0, H + 0.05, 6.5);
  p.box(0xd9d2c3, 3.0, 0.04, 3.6, 0, H + 0.21, 6.5);
  p.box(TRIM, 3.0, 0.22, 0.2, 0, 2.95, 8.55); // red lintel
  for (const s of [-1, 1]) p.box(TRIM, 0.22, 2.9, 0.2, s * 1.5, 1.45, 8.55); // red jambs
  for (const s of [-1, 1]) p.box(SHUTTER, 0.12, 2.6, 1.25, s * 1.32, 1.3, 7.85, s * 0.35); // gate doors, open inwards
  block(-9.5, -5.5, -8.5, 4.5, H);
  block(-5.5, 9.5, -8.5, -7.9, WALL);
  block(8.9, 9.5, -7.9, 4.5, WALL);
  // tall green windows framed in red: street façade, the inner faces of both wings
  const windowAt = (x: number, z: number, ry: number) => {
    p.box(TRIM, 1.3, 2.3, 0.1, x, 2.25, z, ry);
    p.box(SHUTTER, 1.0, 2.0, 0.12, x, 2.25, z, ry);
    p.box(0x1b3a5c, 0.5, 1.6, 0.14, x, 2.3, z, ry);
  };
  for (const x of [-7.4, -3.8, 3.8, 7.4]) {
    windowAt(x, 8.55, 0);
    windowAt(x, 4.45, 0);
  }
  for (const z of [-5.5, -1.5, 2.2]) windowAt(-5.45, z, Math.PI / 2);
  // street façade: flowerpots on the sills are skipped (nothing glued to the walls on the street side)
  // —— the garden (courtyard x -5.5..8.9, z -7.9..4.5)
  p.box(0x8a6b4a, 14.4, 0.04, 12.4, 1.7, 0.03, -1.7); // earth
  // small stepped garden pyramid (red-ochre), in the back-right corner, with room all round
  for (let i = 0; i < 4; i++) p.box(i % 2 ? 0xb5533c : 0xc4654a, 2.6 - i * 0.6, 0.45, 2.6 - i * 0.6, 5.0, 0.225 + i * 0.45, -4.6);
  // trees (round canopies), cacti, agaves, flower pots
  const tree = (x: number, z: number, c: number) => {
    p.cyl(0x7a5534, 0.18, 0.26, 3.2, x, 1.6, z, 7);
    p.ball(c, 1.5, x, 3.6, z, 0.8);
    p.ball(c, 1.1, x + 0.9, 3.3, z + 0.4, 0.8);
    p.ball(c, 1.0, x - 0.8, 3.4, z - 0.5, 0.8);
  };
  tree(-2.6, -5.4, 0x2f9e44);
  tree(6.7, 1.9, 0x37b24d);
  const cactus = (x: number, z: number, h: number) => {
    p.cyl(0x2b8a3e, 0.22, 0.25, h, x, h / 2, z, 8);
    p.cyl(0x2b8a3e, 0.13, 0.13, 0.7, x + 0.35, h * 0.55 + 0.3, z, 7);
    p.cyl(0x2b8a3e, 0.13, 0.13, 0.4, x + 0.25, h * 0.55, z, 7, 0, 0, Math.PI / 2);
    p.cyl(0x2b8a3e, 0.12, 0.12, 0.55, x - 0.32, h * 0.45 + 0.25, z, 7);
    p.cyl(0x2b8a3e, 0.12, 0.12, 0.35, x - 0.22, h * 0.45, z, 7, 0, 0, Math.PI / 2);
  };
  cactus(-3.8, 2.4, 2.2);
  cactus(2.0, -6.2, 1.8);
  const agave = (x: number, z: number) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      p.add(new THREE.ConeGeometry(0.12, 1.1, 4), 0x5c9e8a, x + Math.sin(a) * 0.25, 0.5, z + Math.cos(a) * 0.25, a, 0.5);
    }
  };
  agave(0.2, -6.4);
  agave(7.6, -1.6);
  const flowers = new Painter();
  const potSpots: [number, number][] = [[-4.1, -0.4], [-4.1, -2.4], [-4.1, -4.0], [3.0, 3.4], [-1.2, 3.4]];
  const potCols = [0xff4d8d, 0xffd43b, 0xe8590c, 0xcc5de8, 0xff6b6b];
  potSpots.forEach(([x, z], i) => {
    p.cyl(0xd9480f, 0.32, 0.24, 0.5, x, 0.25, z, 8);
    flowers.ball(0x2f9e44, 0.3, x, 0.62, z);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      flowers.ball(potCols[(i + k) % potCols.length], 0.11, x + Math.cos(a) * 0.22, 0.78 + (k % 2) * 0.08, z + Math.sin(a) * 0.22);
    }
  });
  const house = p.mesh();
  root.add(house);
  const bloom = flowers.mesh();
  root.add(bloom);

  // solids
  F.solid(-9.5, -1.4, 4.5, 8.5);
  F.solid(1.4, 9.5, 4.5, 8.5);
  F.solid(-9.5, -5.5, -8.5, 4.5);
  F.solid(-5.5, 9.5, -8.5, -7.9);
  F.solid(8.9, 9.5, -7.9, 4.5);
  F.solid(3.7, 6.3, -5.9, -3.3, 1.8); // garden pyramid
  F.solid(-2.9, -2.3, -5.7, -5.1); // tree trunks
  F.solid(6.4, 7.0, 1.6, 2.2);
  F.solid(-4.15, -3.45, 2.05, 2.75, 2.2); // cacti
  F.solid(1.65, 2.35, -6.55, -5.85, 1.8);

  // birds in the trees: when she walks into the garden they fly up in circles and come back
  const birds: { g: THREE.Group; home: THREE.Vector3; ph: number; wings: THREE.Mesh[] }[] = [];
  const birdCols = [0xffd43b, 0xff6b6b, 0x4dabf7, 0xffa94d];
  const homes: [number, number, number][] = [[-2.6, 4.7, -5.4], [-1.8, 4.3, -5.0], [6.7, 4.7, 1.9], [7.4, 4.3, 2.2]];
  homes.forEach(([x, y, z], i) => {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: birdCols[i] }));
    body.scale.set(1, 0.9, 1.4);
    b.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), new THREE.MeshStandardMaterial({ color: 0xf08c00 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.02, 0.24);
    b.add(beak);
    const wings: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.16), body.material);
      w.position.set(s * 0.18, 0.04, 0);
      b.add(w);
      wings.push(w);
    }
    root.add(b);
    birds.push({ g: b, home: new THREE.Vector3(x, y, z), ph: i * 1.7, wings });
  });

  let fly = 0;
  let t = 0;
  let lastSay = -999;
  const centre = F.W(1.6, -1.2);
  const FLY_S = 6;
  return {
    things: [
      {
        object: house,
        position: centre,
        radius: 3.2,
        interact() {
          if (fly > 0.5) return;
          fly = FLY_S;
          [784, 988, 1175, 988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.08, 'triangle', 0.035));
          if (t - lastSay > 20) {
            lastSay = t;
            ctx.say(['Esta é a Casa Azul, onde vivia a pintora Frida Kahlo.']);
          } else ctx.say(['Os passarinhos voam no jardim!']);
        },
        update(dt) {
          t += dt;
          const k = fly > 0 ? Math.min(1, (FLY_S - fly) / 0.6, fly / 1.2) : 0;
          if (fly > 0) fly = Math.max(0, fly - dt);
          for (const b of birds) {
            const a = t * 1.6 + b.ph;
            b.g.position.set(
              b.home.x + (Math.cos(a) * 2.5 + 1.6 - b.home.x) * k * 0.6,
              b.home.y + k * (1.6 + Math.sin(a * 1.3) * 0.5),
              b.home.z + (Math.sin(a) * 2.5 - 1.2 - b.home.z) * k * 0.6,
            );
            b.g.rotation.y = k > 0.05 ? -a : b.ph;
            const flap = k > 0.05 ? Math.sin(t * 22 + b.ph) * 0.9 : Math.sin(t * 3 + b.ph) * 0.1;
            b.wings[0].rotation.z = flap;
            b.wings[1].rotation.z = -flap;
          }
          // the flowers bounce while the birds fly
          const bob = fly > 0 ? 1 + Math.abs(Math.sin(t * 9)) * 0.12 * Math.min(1, fly) : 1;
          bloom.scale.set(1, bob, 1);
        },
      },
    ],
    debug: { at: [plot.x, plot.z], yaw: +plot.yaw.toFixed(2), garden: [+centre.x.toFixed(1), +centre.z.toFixed(1)], removed: plot.removed },
  };
}

/* ------------------------------------------------------------------ papel picado (bandeirinhas) */

let picadoGeo: THREE.BufferGeometry | null = null;
/** One little cut-paper flag: hangs down from y = 0, scalloped bottom, a few cut-out holes. */
function papelPicadoGeo(): THREE.BufferGeometry {
  if (picadoGeo) return picadoGeo;
  const w = 0.42;
  const h = 0.52;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, -h + 0.06);
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const x0 = w / 2 - (i * w) / teeth;
    s.lineTo(x0 - w / teeth / 2, -h);
    s.lineTo(x0 - w / teeth, -h + 0.06);
  }
  s.lineTo(-w / 2, 0);
  const hole = (cx: number, cy: number, r: number) => {
    const p = new THREE.Path();
    p.moveTo(cx, cy + r);
    p.lineTo(cx + r, cy);
    p.lineTo(cx, cy - r);
    p.lineTo(cx - r, cy);
    p.lineTo(cx, cy + r);
    s.holes.push(p);
  };
  hole(0, -0.22, 0.07);
  hole(-0.12, -0.12, 0.035);
  hole(0.12, -0.12, 0.035);
  hole(-0.12, -0.33, 0.035);
  hole(0.12, -0.33, 0.035);
  picadoGeo = new THREE.ShapeGeometry(s);
  return picadoGeo;
}

interface Bunting {
  /** Per string: [ax, az, bx, bz, height] (QA). */
  lines: number[][];
  mesh: THREE.InstancedMesh;
  /** Per flag: anchor point, yaw, phase. */
  flags: { p: THREE.Vector3; yaw: number; ph: number }[];
  strings: number;
}

/**
 * Strings of papel picado between pairs of nearby placeholder buildings (gap 3–24 m, facing walls), above head height,
 * never over a road, never through another building. Long facing walls get two parallel strings. Up to 40 strings
 * (Telmo, 2026-11-28: "mais bandeirinhas").
 */
function buildBunting(scene: THREE.Scene, world: World, obstacles: Obstacle[]): Bunting | null {
  const bs = [...world.buildings].filter((b) => (b.roof ?? 0) >= 4.2);
  type Cand = { a: THREE.Vector3; b: THREE.Vector3; ia: Obstacle; ib: Obstacle; len: number };
  const cands: Cand[] = [];
  const clearPath = (a: THREE.Vector3, b: THREE.Vector3, h: number, ia: Obstacle, ib: Obstacle): boolean => {
    for (let k = 0; k <= 10; k++) {
      const x = a.x + ((b.x - a.x) * k) / 10;
      const z = a.z + ((b.z - a.z) * k) / 10;
      if (onRoad(x, z, 1.5)) return false;
      const A = AIRPORT_ZONE;
      if (x > A.minX && x < A.maxX && z > A.minZ && z < A.maxZ) return false;
      if (k === 0 || k === 10) continue;
      for (const o of obstacles) {
        if (o === ia || o === ib) continue;
        if (x > o.minX - 0.3 && x < o.maxX + 0.3 && z > o.minZ - 0.3 && z < o.maxZ + 0.3 && (o.height === undefined || o.height > h - 1.2)) return false;
      }
    }
    return true;
  };
  /** Where along the shared wall a string hangs: one in the middle, two when the walls face each other ≥ 5 m. */
  const along = (overlap: number): number[] => (overlap >= 5 ? [0.25, 0.75] : [0.5]);
  for (let i = 0; i < bs.length; i++) {
    for (let j = 0; j < bs.length; j++) {
      if (i === j) continue;
      const A = bs[i];
      const B = bs[j];
      const h = Math.min(A.roof ?? 0, B.roof ?? 0, 6.5) - 0.6;
      if (h < 3.4) continue;
      // B to the +X of A, overlapping in Z
      const gx = B.minX - A.maxX;
      const oz0 = Math.max(A.minZ, B.minZ);
      const oz1 = Math.min(A.maxZ, B.maxZ);
      if (gx >= 3 && gx <= 24 && oz1 - oz0 >= 1.2) {
        for (const u of along(oz1 - oz0)) {
          const z = oz0 + (oz1 - oz0) * u;
          const a = new THREE.Vector3(A.maxX, h, z);
          const b = new THREE.Vector3(B.minX, h, z);
          if (clearPath(a, b, h, A, B)) cands.push({ a, b, ia: A, ib: B, len: gx });
        }
      }
      // B to the +Z of A, overlapping in X
      const gz = B.minZ - A.maxZ;
      const ox0 = Math.max(A.minX, B.minX);
      const ox1 = Math.min(A.maxX, B.maxX);
      if (gz >= 3 && gz <= 24 && ox1 - ox0 >= 1.2) {
        for (const u of along(ox1 - ox0)) {
          const x = ox0 + (ox1 - ox0) * u;
          const a = new THREE.Vector3(x, h, A.maxZ);
          const b = new THREE.Vector3(x, h, B.minZ);
          if (clearPath(a, b, h, A, B)) cands.push({ a, b, ia: A, ib: B, len: gz });
        }
      }
    }
  }
  cands.sort((p, q) => p.len - q.len);
  const used = new Map<Obstacle, number>();
  const chosen: Cand[] = [];
  for (const c of cands) {
    if (chosen.length >= 40) break;
    if ((used.get(c.ia) ?? 0) >= 4 || (used.get(c.ib) ?? 0) >= 4) continue;
    const mid = c.a.clone().add(c.b).multiplyScalar(0.5);
    if (chosen.some((o) => o.a.clone().add(o.b).multiplyScalar(0.5).distanceTo(mid) < 2.2)) continue;
    chosen.push(c);
    used.set(c.ia, (used.get(c.ia) ?? 0) + 1);
    used.set(c.ib, (used.get(c.ib) ?? 0) + 1);
  }
  if (!chosen.length) return null;

  const flags: Bunting['flags'] = [];
  const linePts: number[] = [];
  const cols: number[] = [];
  const palette = [RED, WHITE, GREEN];
  chosen.forEach((c, si) => {
    const len = c.a.distanceTo(c.b);
    const sag = 0.25 + len * 0.05;
    const at = (u: number) => new THREE.Vector3().lerpVectors(c.a, c.b, u).setY(c.a.y - sag * 4 * u * (1 - u));
    const SEG = 10;
    for (let k = 0; k < SEG; k++) {
      const p0 = at(k / SEG);
      const p1 = at((k + 1) / SEG);
      linePts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
    const d = c.b.clone().sub(c.a);
    const yaw = Math.atan2(-d.z, d.x);
    const n = Math.max(3, Math.floor((len - 0.5) / 0.55));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.75) / (n + 0.5);
      flags.push({ p: at(u), yaw, ph: si * 1.3 + k * 0.45 });
      cols.push(palette[(k + si) % 3]);
    }
  });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x5c4a3a }));
  scene.add(lines);
  const mesh = new THREE.InstancedMesh(
    papelPicadoGeo(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }),
    flags.length,
  );
  const c = new THREE.Color();
  cols.forEach((hex, i) => mesh.setColorAt(i, c.set(hex)));
  mesh.frustumCulled = false; // instances span the whole city
  scene.add(mesh);
  return { mesh, flags, strings: chosen.length, lines: chosen.map((c) => [c.a.x, c.a.z, c.b.x, c.b.z, c.a.y].map((v) => +v.toFixed(1))) };
}

function swayBunting(b: Bunting, t: number): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const X = new THREE.Vector3(1, 0, 0);
  b.flags.forEach((f, i) => {
    q.setFromAxisAngle(UP, f.yaw);
    qx.setFromAxisAngle(X, Math.sin(t * 2.2 + f.ph) * 0.28 + Math.sin(t * 3.7 + f.ph * 1.7) * 0.1);
    q.multiply(qx);
    m.compose(f.p, q, one);
    b.mesh.setMatrixAt(i, m);
  });
  b.mesh.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------------ children with Day of the Dead masks */

const maskTex = new Map<number, THREE.CanvasTexture>();
/** Cute sugar-skull mask (calavera): white face, big flowery coloured eyes, heart nose, smile. Palette by variant. */
function calaveraTexture(v: number): THREE.CanvasTexture {
  const hit = maskTex.get(v);
  if (hit) return hit;
  const P = [
    { eye: '#ff5fa2', petal: '#ffd43b', top: '#4dabf7' },
    { eye: '#4dabf7', petal: '#ff922b', top: '#ff5fa2' },
    { eye: '#51cf66', petal: '#cc5de8', top: '#ffd43b' },
    { eye: '#ff922b', petal: '#20c997', top: '#cc5de8' },
  ][v % 4];
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  // face: round skull + rounded jaw
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.ellipse(64, 56, 56, 50, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.roundRect(30, 60, 68, 60, 22);
  g.fill();
  const dot = (x: number, y: number, r: number, c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  // flowery eyes: petals round a coloured ring, a big friendly dark pupil with a shine
  for (const ex of [42, 86]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      dot(ex + Math.cos(a) * 19, 60 + Math.sin(a) * 19, 6, P.petal);
    }
    dot(ex, 60, 16, P.eye);
    dot(ex, 61, 9, '#3b2b5c');
    dot(ex - 3, 57, 3, '#ffffff');
  }
  // heart nose
  g.fillStyle = '#3b2b5c';
  g.beginPath();
  g.moveTo(64, 92);
  g.bezierCurveTo(56, 86, 56, 79, 60, 79);
  g.bezierCurveTo(63, 79, 64, 82, 64, 83);
  g.bezierCurveTo(64, 82, 65, 79, 68, 79);
  g.bezierCurveTo(72, 79, 72, 86, 64, 92);
  g.fill();
  // smile with little stitches
  g.strokeStyle = '#3b2b5c';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 92, 20, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  g.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const a = (0.24 + k * 0.105) * Math.PI;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 16, 92 + Math.sin(a) * 16);
    g.lineTo(64 + Math.cos(a) * 24, 92 + Math.sin(a) * 24);
    g.stroke();
  }
  // forehead flower + little dots on the cheeks
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    dot(64 + Math.cos(a) * 8, 22 + Math.sin(a) * 8, 6, P.top);
  }
  dot(64, 22, 5, '#ffd43b');
  for (const [x, y] of [[22, 84], [106, 84], [28, 96], [100, 96]] as const) dot(x, y, 3.5, P.eye);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  maskTex.set(v, tex);
  return tex;
}

interface Kid {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  off: number;
}

function buildChildren(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): { things: Interactable[]; debug: Record<string, unknown> } | null {
  const RX = 5;
  const RZ = 3.4;
  const spot = openSpot(obstacles, rng, 7.5, { minD: 28, maxD: 125, roadGap: 6 });
  if (!spot) return null;
  const C = new THREE.Vector3(spot.x, 0, spot.z);
  const rot = rng() * Math.PI;
  const group = new THREE.Group();
  group.position.copy(C);
  group.rotation.y = rot;
  scene.add(group);

  // a worn earth track where they always run, and marigolds (cempasúchil) round the edge
  const track = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.12, 40), new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 1 }));
  track.rotation.x = -Math.PI / 2;
  track.scale.set(RX, RZ, 1);
  track.position.y = 0.02;
  track.receiveShadow = true;
  group.add(track);
  const fl = new Painter();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * (RX + 1.8);
    const z = Math.sin(a) * (RZ + 1.8);
    fl.ball(0x2f9e44, 0.28, x, 0.18, z, 0.6);
    for (let k = 0; k < 4; k++) fl.ball(k % 2 ? 0xff922b : 0xfab005, 0.14, x + Math.cos(k * 1.6) * 0.2, 0.36, z + Math.sin(k * 1.6) * 0.2);
  }
  group.add(fl.mesh());

  const shirts = [0xff6b6b, 0x4dabf7, 0xcc5de8, 0x20c997, 0xfcc419];
  const skins = [0xe0ac69, 0xc68642, 0xf1c27d, 0x8d5524, 0xe0ac69];
  const kids: Kid[] = [];
  const N = 4;
  for (let i = 0; i < N; i++) {
    const f = buildFolk({ shirt: shirts[i], pants: 0x364fc7, skin: skins[i], hair: 0x2b1d14, dress: i % 2 === 1, longHair: i % 2 === 1 });
    // hips as pivots so the legs swing from the top
    const legs = [f.legL, f.legR].map((leg) => {
      const hip = new THREE.Group();
      hip.position.set(leg.position.x, 0.75, 0);
      leg.position.set(0, -0.35, 0);
      hip.add(leg);
      f.group.add(hip);
      return hip;
    });
    const mask = new THREE.Mesh(
      new THREE.SphereGeometry(0.335, 16, 12, Math.PI, Math.PI, 0.22, 2.2),
      new THREE.MeshStandardMaterial({ map: calaveraTexture(i), alphaTest: 0.5, roughness: 0.6 }),
    );
    f.head.add(mask);
    const root = new THREE.Group();
    root.scale.setScalar(0.6);
    root.add(f.group);
    group.add(root);
    kids.push({ root, legL: legs[0], legR: legs[1], armL: f.armL, armR: f.armR, off: (i / N) * Math.PI * 2 * 0.78 });
  }

  let s = 0; // where the group is on the loop (radians)
  let w = 0.75; // angular speed (rad/s); sign = direction
  let dir = 1;
  let flip = 7 + rng() * 4;
  let it = 0; // who is "it" (the chaser)
  let t = 0;
  let greet = 0; // 0..1: stopped to look at her
  let said = 0;
  const lines = ['Olha! Crianças com máscaras do Dia dos Mortos!', 'Estão a brincar à apanhada!', 'Que máscaras tão coloridas!'];
  const R = Math.max(RX, RZ) + 3.5;
  const local = new THREE.Vector3();
  const laugh = () => {
    [0, 0.12, 0.24, 0.4, 0.52].forEach((d, k) => tone(880 + (k % 2) * 220 + k * 40, d, 0.08, 'triangle', 0.035));
  };
  return {
    things: [
      {
        object: group,
        position: C,
        radius: R,
        interact() {
          laugh();
          ctx.say([lines[said % lines.length]]);
          said++;
        },
        update(dt) {
          if (ctx.isPaused()) return;
          t += dt;
          const her = ctx.player;
          const near = Math.hypot(her.x - C.x, her.z - C.z) < R && !ctx.isDriving();
          greet = THREE.MathUtils.clamp(greet + (near ? dt * 2 : -dt * 1.2), 0, 1);
          // tag: every few seconds the chaser catches someone and everyone turns round
          flip -= dt;
          if (flip <= 0 && greet === 0) {
            flip = 7 + Math.random() * 5;
            dir = -dir;
            it = (it + (dir > 0 ? 1 : N - 1)) % N;
            if (Math.hypot(her.x - C.x, her.z - C.z) < 25) laugh();
          }
          w += (dir * 0.75 - w) * Math.min(1, dt * 2.5);
          const run = Math.abs(w) / 0.75 * (1 - greet);
          s += w * dt * (1 - greet);
          local.set(her.x - C.x, 0, her.z - C.z).applyAxisAngle(UP, -rot);
          kids.forEach((k, i) => {
            // the chaser closes in on the one ahead, then drops back a little
            const lag = i === it ? Math.sin(t * 1.3) * 0.35 : 0;
            const a = s + k.off - dir * lag;
            const x = Math.cos(a) * RX;
            const z = Math.sin(a) * RZ;
            k.root.position.set(x, 0, z);
            // facing: along the loop while running, at her while greeting (people face -Z)
            const tx = -Math.sin(a) * RX * Math.sign(w || 1);
            const tz = Math.cos(a) * RZ * Math.sign(w || 1);
            const runYaw = Math.atan2(tx, tz) + Math.PI;
            const herYaw = Math.atan2(local.x - x, local.z - z) + Math.PI;
            let d = (greet > 0.5 ? herYaw : runYaw) - k.root.rotation.y;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            k.root.rotation.y += d * Math.min(1, dt * 8);
            const ph = t * 11 + i * 1.3;
            const sw = Math.sin(ph) * 0.9 * run;
            k.legL.rotation.x = sw;
            k.legR.rotation.x = -sw;
            k.armL.rotation.x = -sw * 0.9;
            k.armR.rotation.x = i === it && greet < 0.5 ? -1.4 : sw * 0.9; // the chaser reaches out
            // greeting: hop and wave
            const hop = greet > 0.5 ? Math.abs(Math.sin(t * 7 + i)) * 0.35 : Math.abs(Math.sin(ph)) * 0.08 * run;
            k.root.position.y = hop;
            k.armR.rotation.z = greet * (2.4 + Math.sin(t * 10 + i) * 0.35);
            k.armL.rotation.z = greet > 0.5 && i % 2 ? -2.4 : 0;
          });
        },
      },
    ],
    debug: { at: [+C.x.toFixed(1), +C.z.toFixed(1)], n: N },
  };
}

/* ------------------------------------------------------------------ builder */

export function buildMexico(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
  kit: MexicoKit,
): Interactable[] {
  const things: Interactable[] = [];
  const debug: Record<string, unknown> = {};
  const spots: Record<string, { x: number; z: number }> = {};
  /** Temporary keep-outs (whole plots, plazas included) so the next plot doesn't land on them; removed at the end. */
  const guards: Obstacle[] = [];
  const guard = (plot: Plot, hw: number, hd: number) => {
    const side = Math.abs(Math.sin(plot.yaw)) > 0.5;
    const o: Obstacle = side
      ? { minX: plot.x - hd, maxX: plot.x + hd, minZ: plot.z - hw, maxZ: plot.z + hw }
      : { minX: plot.x - hw, maxX: plot.x + hw, minZ: plot.z - hd, maxZ: plot.z + hd };
    world.clearArea(o, 2); // placeholder buildings only
    guards.push(o);
    obstacles.push(o);
  };
  const away: { x: number; z: number; d: number }[] = [];

  // 1. Teotihuacán — the big one first (it needs the most room)
  const py = pickPlot(world, obstacles, rng, PY_HW, PY_HD, { ideal: 70, away }) ?? pickPlot(world, obstacles, rng, PY_HW, PY_HD, { ideal: 70, away, margin: 1.5 });
  if (py) {
    guard(py, PY_HW, PY_HD);
    const r = buildTeotihuacan(scene, obstacles, py, ctx, kit);
    things.push(...r.things);
    debug.teotihuacan = r.debug;
    spots.teotihuacan = spots.main = { x: py.x, z: py.z };
    away.push({ x: py.x, z: py.z, d: 50 });
  } else debug.failed = ['teotihuacan'];

  // 2. Casa Azul
  const ca = pickPlot(world, obstacles, rng, CA_HW, CA_HD, { ideal: 55, away });
  if (ca) {
    guard(ca, CA_HW, CA_HD);
    const r = buildCasaAzul(scene, obstacles, ca, ctx);
    things.push(...r.things);
    debug.casaAzul = r.debug;
    spots.casaAzul = { x: ca.x, z: ca.z };
    away.push({ x: ca.x, z: ca.z, d: 40 });
  } else (debug.failed = [...((debug.failed as string[]) ?? []), 'casaAzul']);

  // 3. Tula
  const tu = pickPlot(world, obstacles, rng, TU_HW, TU_HD, { ideal: 60, away });
  if (tu) {
    guard(tu, TU_HW, TU_HD);
    const r = buildTula(scene, obstacles, tu, ctx);
    things.push(...r.things);
    debug.tula = r.debug;
    spots.tula = { x: tu.x, z: tu.z };
  } else (debug.failed = [...((debug.failed as string[]) ?? []), 'tula']);

  // 4. children playing (open grass, not on any plot)
  const kids = buildChildren(scene, obstacles, rng, ctx);
  if (kids) {
    things.push(...kids.things);
    debug.kids = kids.debug;
  }

  for (const gd of guards) {
    const i = obstacles.indexOf(gd);
    if (i >= 0) obstacles.splice(i, 1);
  }

  // 5. papel picado between the remaining buildings
  const bunting = buildBunting(scene, world, obstacles);
  if (bunting) {
    let tt = 0;
    let frameN = 0;
    swayBunting(bunting, 0);
    things.push({
      // animation only: a detached empty object (nothing to tap) far outside the map (never reached)
      object: new THREE.Object3D(),
      position: new THREE.Vector3(1e5, 0, 1e5),
      radius: 0,
      interact() {},
      update(dt) {
        tt += dt;
        if (++frameN % 2 === 0) swayBunting(bunting, tt);
      },
    });
    debug.bunting = { strings: bunting.strings, flags: bunting.flags.length, lines: bunting.lines };
  } else debug.bunting = { strings: 0 };

  kit.setDebug({ ...debug, spots, count: Object.keys(spots).filter((k) => k !== 'main').length });
  return things;
}
