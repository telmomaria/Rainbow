import * as THREE from 'three';
import { tone } from './audio';
import { Fireworks, FIREWORK_COLORS } from './fireworks';
import type { GameCtx } from './gamectx';
import { clearCityLamps, gemMesh, mat } from './places';
import { towerClimb } from './landmarks';
import { setGroundHeight } from './spawn';
import type { Interactable, Obstacle, World } from './world';

/**
 * Estados Unidos landmarks (original names — never ship real brand names):
 *  - Estátua da Liberdade — pedestal + figura verde com coroa e tocha (US1)
 *  - Ponte do Pacífico — ponte suspensa laranja sobre um rio, entre dois montes; passa-se a pé ou de carro (US2)
 *  - Parque Arco-Íris — castelo de contos + fogo de artifício à noite (US3)
 *  - Hotel das Fontes — lago + fontes dançantes + fachada de hotel (US4)
 *    Inspired by Bellagio fountains (Las Vegas) but original IP — not Caesars / Bellagio brands.
 *
 * Fixed spots so a child (and QA) can find them; clearArea removes placeholder buildings.
 */

/** World centres of each attraction (meters). */
/** Off the road grid (roads at x∈{-80,0}, z∈{-70,0,75}) so silhouettes aren't buried in asphalt. */
export const USA_SPOTS = {
  statue: { x: 50, z: -115 },
  bridge: { x: -115, z: 36 },
  castle: { x: 115, z: -105 },
  palace: { x: -45, z: -120 },
} as const;

/**
 * Valley of the Ponte do Pacífico (Telmo 2026-11-28): the river runs west along z = riverZ from a spring pond at
 * x = springX to the map edge; two hills face each other across it and the deck (top at deckY) joins their tops.
 * The road up each hill is the bridge axis x (half-width BRIDGE.half, rails just outside), joining the z = 0 / z = 75 roads.
 */
export const BRIDGE = { x: -115, riverZ: 36, deckY: 4, half: 3.75, springX: -98 } as const;
/** Hill profile (m): water half-width, top of the bank, plateau end, foot (distances from the river centre line);
 *  plateau half-width and foot half-width across the road. */
const VALLEY = { river: 6.5, bankTop: 11, ridge: 19, foot: 32, plateauHalf: 9, footHalf: 27 } as const;

const smooth01 = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** Height of the two hills at (x, z) — 0 in the river and off the hills. */
function hillHeight(x: number, z: number): number {
  const ax = Math.abs(x - BRIDGE.x);
  const d = Math.abs(z - BRIDGE.riverZ);
  if (ax >= VALLEY.footHalf || d >= VALLEY.foot || d <= VALLEY.river) return 0;
  const a = ax <= VALLEY.plateauHalf ? 1 : smooth01(1 - (ax - VALLEY.plateauHalf) / (VALLEY.footHalf - VALLEY.plateauHalf));
  let b: number;
  if (d < VALLEY.bankTop) b = smooth01((d - VALLEY.river) / (VALLEY.bankTop - VALLEY.river)); // steep bank (behind the blockers)
  else if (d <= VALLEY.ridge) b = 1; // flat hilltop
  else {
    // the road ramp: mostly straight (gentle, ~26 %), eased at both ends
    const t = (VALLEY.foot - d) / (VALLEY.foot - VALLEY.ridge);
    b = 0.5 * t + 0.5 * smooth01(t);
  }
  // rounder hills: a crown rises on both sides of the road (the road runs through the saddle between them)
  const crown = 1.8 * smooth01((ax - 4.5) / 5) * (1 - smooth01((ax - 11) / (VALLEY.footHalf - 11)));
  return (BRIDGE.deckY * a + crown) * b;
}

/** Walking / driving height in the valley (hills + bridge deck); null = outside it (flat city ground). */
export function valleyHeight(x: number, z: number): number | null {
  const ax = Math.abs(x - BRIDGE.x);
  const d = Math.abs(z - BRIDGE.riverZ);
  if (ax >= VALLEY.footHalf || d >= VALLEY.foot) return null;
  if (ax < BRIDGE.half + 0.3 && d < VALLEY.bankTop + 0.5) return BRIDGE.deckY; // on the deck
  return hillHeight(x, z);
}

/** Soft ripples for the river (scrolled every frame so the water flows). */
function waterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(150,200,255,0.9)';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const y = 6 + i * 13;
    g.beginPath();
    for (let x = 0; x <= 64; x += 4) g.lineTo(x, y + Math.sin((x / 64) * Math.PI * 2 + i) * 3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Round soft-edged white blob (alpha falls off to 0 at the rim) — fog patches without hard edges. */
function softBlobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function addBox(
  g: THREE.Object3D,
  m: THREE.Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function addCyl(
  g: THREE.Object3D,
  m: THREE.Material,
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  seg = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function addCone(g: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function claim(world: World, at: { x: number; z: number }, hw: number, hd: number, height?: number): Obstacle {
  const ob: Obstacle = { minX: at.x - hw, maxX: at.x + hw, minZ: at.z - hd, maxZ: at.z + hd };
  if (height !== undefined) ob.height = height;
  world.clearArea(ob, 2.5);
  world.obstacles.push(ob);
  return ob;
}

function diamondPickup(ctx: GameCtx, key: string, at: THREE.Vector3, mesh: THREE.Object3D): Interactable {
  const taken = () => ctx.flag(key) > 0;
  if (taken()) mesh.visible = false;
  return {
    object: mesh,
    position: at.clone(),
    radius: 2.4,
    interact() {
      if (taken()) return;
      ctx.setFlag(key, 1);
      mesh.visible = false;
      ctx.addDiamond();
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.07));
      ctx.say(['Uma joia especial! Guarda-a bem!']);
    },
  };
}

export class UsaLandmarks {
  readonly things: Interactable[] = [];
  readonly spots = { ...USA_SPOTS };
  private readonly fireworks: Fireworks;
  private time = 0;
  private readonly castleTop = new THREE.Vector3();
  private readonly fountainJets: THREE.Mesh[] = [];
  private fogSheets: THREE.Mesh[] = [];
  private bridgeGroup: THREE.Group | null = null;
  private waterTex: THREE.Texture | null = null;
  private pondTex: THREE.Texture | null = null;
  /** Keeps every later plot (fair, shops, props, stops…) off the valley while the city is built; main drops it after. */
  readonly guard: Obstacle = { minX: -152, maxX: -86, minZ: 4.5, maxZ: 70.5 };
  /** No-spawn zone: no coins / question people / cats walk on the hills or the river (only the deck coins). */
  readonly zone: Obstacle = { minX: -152, maxX: -86, minZ: 4, maxZ: 68 };
  /** A few coins along the bridge deck (placed by main once the coins exist). */
  readonly deckCoins = [-6, -3, 0, 3, 6].map((dz) => ({ x: BRIDGE.x, z: BRIDGE.riverZ + dz }));

  constructor(
    scene: THREE.Scene,
    _obstacles: Obstacle[],
    world: World,
    private readonly ctx: GameCtx,
    private readonly daylight: () => number,
  ) {
    this.fireworks = new Fireworks(scene);
    this.buildStatue(scene, world);
    this.buildBridge(scene, world);
    this.buildCastle(scene, world);
    this.buildPalace(scene, world);
  }

  /** Estátua da Liberdade: pedestal em degraus + figura verde coerente (coroa, tocha e tábua ligadas). */
  private buildStatue(scene: THREE.Scene, world: World): void {
    const at = USA_SPOTS.statue;
    // clear the whole island, but only the pedestal + the stairs block her (the foot of the stairs must be reachable)
    world.clearArea({ minX: at.x - 10, maxX: at.x + 10, minZ: at.z - 12, maxZ: at.z + 12 }, 2.5);
    world.obstacles.push({ minX: at.x - 4.1, maxX: at.x + 4.1, minZ: at.z - 4.1, maxZ: at.z + 4.1, height: 5.3 });
    world.obstacles.push({ minX: at.x - 1.9, maxX: at.x + 1.9, minZ: at.z + 4, maxZ: at.z + 10.5, height: 5.3 });
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.userData.landmark = 'statue';
    scene.add(g);

    const stone = mat(0xd0d4dc);
    const stoneDark = mat(0xa8aeb8);
    // island (water ring + grass) — flat discs, not a slanted ramp
    addCyl(g, mat(0x4dabf7), 10.5, 10.5, 0.2, 0, 0.08, 0, 28);
    addCyl(g, mat(0x8ce99a), 9.2, 9.2, 0.22, 0, 0.22, 0, 28);
    // stepped pedestal
    addBox(g, stoneDark, 8.0, 1.0, 8.0, 0, 0.75, 0);
    addBox(g, stone, 6.6, 2.2, 6.6, 0, 2.35, 0);
    addBox(g, stoneDark, 5.2, 1.8, 5.2, 0, 4.35, 0);
    // front stairs: lowest tread out on the grass (+z, the side she arrives from), top tread level with the terrace
    // (y 5.25) at the pedestal's edge. Solid treads from the ground + stepped side walls.
    const TERRACE_Y = 5.25;
    const STEPS = 12;
    const RUN = 0.65;
    const STAIR_OUT = 10.4; // outer edge of the lowest tread
    const climbSteps: THREE.Vector3[] = [];
    for (let i = 0; i < STEPS; i++) {
      const yTop = ((i + 1) / STEPS) * TERRACE_Y;
      const zc = STAIR_OUT - i * RUN - RUN / 2;
      addBox(g, stone, 3.2, yTop, RUN, 0, yTop / 2, zc);
      addBox(g, stoneDark, 0.25, yTop + 0.55, RUN, -1.72, (yTop + 0.55) / 2, zc);
      addBox(g, stoneDark, 0.25, yTop + 0.55, RUN, 1.72, (yTop + 0.55) / 2, zc);
      climbSteps.push(new THREE.Vector3(at.x, yTop, at.z + zc));
    }
    // terrace railing (gap in the front rail where the stairs arrive)
    for (const dx of [-2.3, 2.3]) addBox(g, stoneDark, 0.18, 0.75, 4.4, dx, 5.7, 0);
    addBox(g, stoneDark, 4.4, 0.75, 0.18, 0, 5.7, -2.3);
    for (const dx of [-1.95, 1.95]) addBox(g, stoneDark, 0.7, 0.75, 0.18, dx, 5.7, 2.3);

    // —— figura verde (hierarquia: corpo → braços → tocha/tábua → cabeça → coroa) ——
    const copper = mat(0x40c057);
    const copperDark = mat(0x2f9e44);
    const copperLight = mat(0x51cf66);
    const gold = mat(0xffe066);
    const figure = new THREE.Group();
    figure.position.set(0, 5.25, 0); // feet on terrace
    g.add(figure);

    // robe hem + draped body (reads as a person, not a lone cylinder)
    addCyl(figure, copperDark, 1.55, 1.85, 0.55, 0, 0.28, 0.08, 14);
    addCyl(figure, copper, 1.05, 1.65, 4.8, 0, 2.85, 0.05, 14);
    for (const [fx, fz] of [
      [-0.55, 0.55],
      [0.55, 0.5],
      [-0.35, -0.55],
      [0.4, -0.5],
    ] as const) {
      addBox(figure, copperDark, 0.35, 3.6, 0.22, fx, 2.6, fz);
    }
    // torso / shoulders
    addCyl(figure, copperLight, 0.9, 1.1, 1.7, 0, 5.85, 0, 12);
    addBox(figure, copper, 2.35, 0.55, 1.05, 0, 6.65, 0);

    // left arm cradles tablet against the front of the torso
    const leftArm = new THREE.Group();
    leftArm.position.set(-1.15, 6.45, 0.35);
    figure.add(leftArm);
    addCyl(leftArm, copper, 0.3, 0.36, 1.5, 0, -0.55, 0.1, 8); // upper arm down
    const leftFore = addCyl(leftArm, copper, 0.26, 0.3, 1.4, 0.15, -1.5, 0.55, 8);
    leftFore.rotation.x = 1.05;
    addCyl(leftArm, copper, 0.34, 0.36, 0.42, 0.2, -1.85, 1.15, 8); // hand
    const tablet = addBox(leftArm, mat(0xe9fac8), 0.2, 1.95, 1.3, 0.45, -1.55, 1.25);
    tablet.rotation.y = 0.25;
    for (const ly of [-0.5, -0.15, 0.2, 0.5] as const) {
      addBox(tablet, mat(0x82c91e), 0.05, 0.08, 0.95, 0.11, ly, 0);
    }

    // right arm raised high (almost vertical, a little out to the side) — torch is a continuous child of the arm
    const rightArm = new THREE.Group();
    rightArm.position.set(1.1, 6.6, 0.1);
    rightArm.rotation.z = -0.28;
    figure.add(rightArm);
    addCyl(rightArm, copper, 0.28, 0.34, 3.8, 0, 1.9, 0, 8);
    addCyl(rightArm, copper, 0.4, 0.42, 0.55, 0, 3.9, 0, 8); // fist
    // torch: handle → cup → flame (no gaps)
    addCyl(rightArm, copperDark, 0.14, 0.14, 0.5, 0, 4.3, 0, 6);
    addCyl(rightArm, copper, 0.58, 0.42, 0.6, 0, 4.8, 0, 8);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xff922b, emissiveIntensity: 1.7 }),
    );
    flame.position.set(0, 5.55, 0);
    flame.castShadow = true;
    rightArm.add(flame);

    // neck + head + 7-ray crown seated on the head (band overlaps the skull)
    addCyl(figure, copper, 0.42, 0.52, 0.65, 0, 7.2, 0, 10);
    const head = new THREE.Group();
    head.position.set(0, 8.05, 0);
    figure.add(head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 12), copper);
    headMesh.castShadow = true;
    head.add(headMesh);
    addCyl(head, copperDark, 0.65, 0.7, 0.4, 0, 0.1, -0.3, 10); // hair bun
    addCone(head, copperDark, 0.12, 0.28, 0, 0.05, 0.72, 6).rotation.x = Math.PI / 2;
    for (const ex of [-0.22, 0.22] as const) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x212529));
      eye.position.set(ex, 0.12, 0.68);
      head.add(eye);
    }
    const crown = new THREE.Group();
    crown.position.set(0, 0.38, 0); // band sits into the top of the head
    head.add(crown);
    addCyl(crown, gold, 0.78, 0.85, 0.28, 0, 0, 0, 14);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const spike = addCone(crown, gold, 0.14, 1.35, Math.cos(a) * 0.78, 0.75, Math.sin(a) * 0.78, 6);
      spike.rotation.x = Math.sin(a) * 0.35;
      spike.rotation.z = -Math.cos(a) * 0.35;
    }

    // jewel on a little pedestal on the terrace, beside where she stands
    addBox(g, stone, 0.6, 0.5, 0.6, 1.4, TERRACE_Y + 0.25, 1.9);
    const gem = gemMesh(0x3bc9ff, 1.4);
    gem.position.set(1.4, TERRACE_Y + 0.95, 1.9);
    g.add(gem);

    // climb the front stairs to the terrace at the statue's feet (same as the other ex-líbris: towerClimb —
    // on the terrace drag / ←→ turns the view, trying to walk = jewel first, then down the stairs)
    const foot = new THREE.Vector3(at.x, 0, at.z + STAIR_OUT + 0.9);
    const top = new THREE.Vector3(at.x - 1.4, TERRACE_Y, at.z + 1.9);
    climbSteps.push(new THREE.Vector3(at.x, TERRACE_Y, at.z + 2.1));
    this.things.push(
      towerClimb({
        ctx: this.ctx,
        object: g,
        foot,
        top,
        steps: climbSteps,
        gem,
        gemKey: 'gem:usa:liberdade',
        sayTop: ['Aos pés da Estátua da Liberdade!'],
        sayGem: ['Uma joia especial! Guarda-a bem!'],
        interactAt: foot,
        radius: 5,
        vista: { fromX: top.x, fromZ: top.z + 0.6, h: TERRACE_Y + 2.6, x: at.x, z: at.z + 75, lookY: 2 },
      }),
    );
  }

  /**
   * Ponte do Pacífico (Telmo 2026-11-28): dois montes relvados frente a frente, um rio a correr entre eles e a ponte
   * suspensa laranja de cimo a cimo. Uma estrada sobe cada monte desde as ruas z = 0 e z = 75, por isso ela passa a
   * pé ou de carro. O rio não se pode pisar (blocos baixos nas margens); só se atravessa pela ponte.
   */
  private buildBridge(scene: THREE.Scene, world: World): void {
    const B = BRIDGE;
    const H = B.deckY;
    // the whole block west of the x = -80 road, between the z = 0 and z = 75 roads, becomes the valley
    world.clearArea({ minX: -152, maxX: -86, minZ: 4, maxZ: 71 }, 1);
    clearCityLamps({ minX: B.x - 11, maxX: B.x + 11, minZ: 3, maxZ: 72 }, world.obstacles);
    world.obstacles.push(this.guard);

    // --- the two hills (one displaced grid each), coloured from the city grass up to a greener top + earthy banks ---
    const groundCol = ((world.ground.material as THREE.MeshStandardMaterial).color ?? new THREE.Color(0x86cf6a)).clone();
    const green = new THREE.Color(0x5fb84f);
    const earth = new THREE.Color(0xa8865a);
    const hillMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const walk: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const len = VALLEY.foot;
      const geo = new THREE.PlaneGeometry(VALLEY.footHalf * 2, len, 36, 32);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const cols = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = B.x + pos.getX(i);
        const z = B.riverZ + side * (len / 2 + pos.getZ(i));
        const h = hillHeight(x, z);
        pos.setXYZ(i, x, h + 0.05, z);
        const d = Math.abs(z - B.riverZ);
        c.copy(groundCol).lerp(green, Math.min(1, (h / H) * 1.4));
        if (d < VALLEY.bankTop) c.lerp(earth, THREE.MathUtils.clamp((VALLEY.bankTop - d) / 3, 0, 0.85));
        cols.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      // the S grid is mirrored in z: flip its winding so it faces up
      if (side < 0) {
        const idx = geo.index!;
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i + 1);
          idx.setX(i + 1, idx.getX(i + 2));
          idx.setX(i + 2, a);
        }
      }
      geo.computeVertexNormals();
      const hill = new THREE.Mesh(geo, hillMat);
      hill.receiveShadow = true;
      scene.add(hill);
      walk.push(hill);

      // road up the hill: from the street kerb to the deck, following the slope (+ a dashed centre line)
      const z0 = side < 0 ? 4 : B.riverZ + VALLEY.bankTop - 0.5;
      const z1 = side < 0 ? B.riverZ - VALLEY.bankTop + 0.5 : 71;
      const road = new THREE.PlaneGeometry(B.half * 2 - 0.2, z1 - z0, 1, 40);
      road.rotateX(-Math.PI / 2);
      const rp = road.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rp.count; i++) {
        const x = B.x + rp.getX(i);
        const z = (z0 + z1) / 2 + rp.getZ(i);
        rp.setXYZ(i, x, hillHeight(B.x, z) + 0.09, z);
      }
      road.computeVertexNormals();
      const roadMesh = new THREE.Mesh(road, new THREE.MeshStandardMaterial({ color: 0x6c6f78 }));
      roadMesh.receiveShadow = true;
      scene.add(roadMesh);
      walk.push(roadMesh);
      const dash = mat(0xffe066);
      for (let z = z0 + 1.5; z < z1 - 2; z += 4) {
        const zc = z + 0.75;
        const slope = (hillHeight(B.x, z + 1.5) - hillHeight(B.x, z)) / 1.5;
        const m = addBox(scene, dash, 0.22, 0.02, 1.5, B.x, hillHeight(B.x, zc) + 0.11, zc);
        m.rotation.x = -Math.atan(slope);
        m.castShadow = false;
      }
      // a few round trees on the slopes (off the road), each a small solid
      for (const [dx, dd] of [
        [-15, 22],
        [13, 25],
        [-19, 15],
        [18, 17],
      ] as const) {
        const x = B.x + dx * (side < 0 ? 1 : -1);
        const z = B.riverZ + side * dd;
        const y = hillHeight(x, z);
        addCyl(scene, mat(0x8b5a2b), 0.22, 0.3, 1.6, x, y + 0.8, z, 7);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), mat(0x3f9a3a));
        crown.position.set(x, y + 2.6, z);
        crown.castShadow = true;
        scene.add(crown);
        world.obstacles.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
      }
    }

    // --- the river: flowing water from a little spring pond (east) to the edge of the map (west) ---
    const riverLen = B.springX + 160;
    const tex = waterTexture();
    tex.repeat.set(riverLen / 7, 2);
    this.waterTex = tex;
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(riverLen, VALLEY.river * 2 + 1),
      new THREE.MeshStandardMaterial({ color: 0x4dabf7, map: tex, roughness: 0.35, metalness: 0.1 }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(-160 + riverLen / 2, 0.12, B.riverZ);
    scene.add(river);
    const pondTex = tex.clone();
    pondTex.repeat.set(2, 2);
    this.pondTex = pondTex;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(7.5, 28), new THREE.MeshStandardMaterial({ color: 0x4dabf7, map: pondTex, roughness: 0.35 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(B.springX, 0.13, B.riverZ);
    scene.add(pond);
    // stones round the spring, sandy edges along the flat banks west of the hills
    const stone = mat(0xb7b2a8);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      if (Math.cos(a) < -0.8) continue; // the river leaves the pond westwards
      const rr = 7.6 + (i % 3) * 0.3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + (i % 4) * 0.15, 0), stone);
      rock.position.set(B.springX + Math.cos(a) * rr, 0.2, B.riverZ + Math.sin(a) * rr);
      rock.rotation.set(i, i * 2, 0);
      scene.add(rock);
    }
    for (const zs of [-1, 1]) {
      const x0 = -160;
      const x1 = B.x - VALLEY.footHalf + 2;
      addBox(scene, mat(0xd8c49a), x1 - x0, 0.22, 1.1, (x0 + x1) / 2, 0.11, B.riverZ + zs * (VALLEY.river + 0.4)).castShadow = false;
    }

    // the river can't be entered: low blocks along both banks (the camera passes over them); the deck is the gap
    const r = VALLEY.river + 0.6;
    const bank = VALLEY.bankTop - 1;
    const low = 0.3;
    world.obstacles.push(
      { minX: -170, maxX: B.x - VALLEY.footHalf, minZ: B.riverZ - r, maxZ: B.riverZ + r, height: low },
      { minX: B.x - VALLEY.footHalf, maxX: B.x - B.half, minZ: B.riverZ - bank, maxZ: B.riverZ + bank, height: low },
      { minX: B.x + B.half, maxX: B.springX + 8, minZ: B.riverZ - bank, maxZ: B.riverZ + bank, height: low },
    );

    // --- the bridge itself (built along local X, turned so it runs north–south over the river) ---
    const g = new THREE.Group();
    g.position.set(B.x, 0, B.riverZ);
    g.rotation.y = -Math.PI / 2; // local +X → world +Z
    g.userData.landmark = 'bridge';
    scene.add(g);
    this.bridgeGroup = g;
    const rust = mat(0xe8590c);
    const rustDark = mat(0xd9480f);
    const steel = mat(0x868e96);
    const span = VALLEY.bankTop + 0.5; // half-length of the deck: it rests on both hilltops
    const deck = addBox(g, steel, span * 2, 0.5, B.half * 2 + 0.7, 0, H - 0.23, 0);
    addBox(g, mat(0x5c5f66), span * 2, 0.04, B.half * 2 - 0.2, 0, H + 0.03, 0).castShadow = false; // asphalt
    walk.push(deck);
    for (let i = -Math.floor(span / 2); i <= Math.floor(span / 2); i++) addBox(g, mat(0xffe066), 1.2, 0.02, 0.22, i * 2, H + 0.06, 0).castShadow = false;
    for (const z of [-1, 1]) addBox(g, rust, span * 2, 1.0, 0.2, 0, H + 0.5, z * (B.half + 0.2));
    // piers in the water and the two Art-Deco towers on them
    const towerX = VALLEY.river + 0.5;
    const legZ = B.half + 0.9;
    const topY = H + 12;
    let firstTower: THREE.Object3D | null = null;
    for (const tx of [-towerX, towerX]) {
      addBox(g, mat(0x9aa0a8), 2.6, H + 0.3, legZ * 2 + 2, tx, (H - 0.3) / 2, 0);
      const tower = new THREE.Group();
      tower.position.set(tx, 0, 0);
      g.add(tower);
      firstTower ??= tower;
      for (const z of [-legZ, legZ]) addBox(tower, rust, 1.0, topY - H + 0.6, 1.0, 0, (topY + H - 0.6) / 2, z);
      for (const y of [H + 9.3, topY]) addBox(tower, rustDark, 0.9, 0.8, legZ * 2 + 0.8, 0, y, 0);
      addBox(tower, rust, 1.3, 0.9, legZ * 2 + 1.2, 0, topY + 0.8, 0);
    }
    // main cables: anchor on the hilltop → tower top → sag to the middle → tower top → anchor (one tube each)
    const anchorX = span + 4;
    const cableY = (x: number): number => {
      const ax = Math.abs(x);
      if (ax >= towerX) return topY - ((ax - towerX) / (anchorX - towerX)) * (topY - (H + 0.8));
      return H + 1.6 + (topY - H - 1.6) * (ax / towerX) ** 2;
    };
    for (const z of [-legZ, legZ]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const x = -anchorX + (i / 40) * anchorX * 2;
        pts.push(new THREE.Vector3(x, cableY(x), z));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.11, 5), rust));
      for (let x = -span + 1; x <= span - 1; x += 1.5) {
        const hh = cableY(x) - (H + 1.0);
        if (hh > 0.3) addCyl(g, rustDark, 0.035, 0.035, hh, x, H + 1.0 + hh / 2, z, 4).castShadow = false;
      }
      for (const x of [-anchorX, anchorX]) addBox(g, mat(0x9aa0a8), 1.8, 1.6, 1.4, x, H + 0.6, z);
    }
    // anchor blocks are solid (beside the road, on the hilltops)
    for (const lx of [-anchorX, anchorX]) {
      for (const lz of [-legZ, legZ]) {
        const wx = B.x - lz;
        const wz = B.riverZ + lx;
        world.obstacles.push({ minX: wx - 0.8, maxX: wx + 0.8, minZ: wz - 1, maxZ: wz + 1, height: H + 1.4 });
      }
    }

    // soft fog banks over the water that thin when she is on the bridge (US2)
    this.fogSheets = [];
    const fogTex = softBlobTexture();
    for (const [x, z] of [
      [-3, -9],
      [3, 9],
    ] as const) {
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 3.5),
        new THREE.MeshBasicMaterial({ color: 0xf1f3f5, map: fogTex, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      );
      fog.position.set(x, H - 1.2, z);
      fog.rotation.x = -0.4;
      g.add(fog);
      this.fogSheets.push(fog);
    }

    // her feet / the car / coins / creatures follow the hills and the deck (only here; flat elsewhere)
    const h0 = world.heightAt;
    world.heightAt = (x, z) => valleyHeight(x, z) ?? h0?.(x, z) ?? 0;
    setGroundHeight((x, z) => valleyHeight(x, z) ?? 0);
    world.walkable = world.walkable ?? [];
    world.walkable.push(...walk);

    this.things.push({
      object: firstTower ?? g,
      position: new THREE.Vector3(B.x, 0, B.riverZ),
      radius: 4,
      interact: () => {
        this.ctx.say(['Estás em cima da ponte! Lá em baixo passa o rio.']);
      },
    });
  }

  /** Parque Arco-Íris: castelo de contos (rosa + torres pontiagudas + bandeiras) — grande, legível de longe. */
  private buildCastle(scene: THREE.Scene, world: World): void {
    const at = USA_SPOTS.castle;
    claim(world, at, 18, 18);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.userData.landmark = 'castle';
    scene.add(g);

    const pink = mat(0xffa8e8);
    const pinkDeep = mat(0xf783ac);
    const roof = mat(0x9775fa);
    const gold = mat(0xffd43b);
    const cream = mat(0xfff0f6);

    // forecourt
    addCyl(g, mat(0xffdeeb), 16, 16, 0.25, 0, 0.1, 0, 24);
    // main keep
    addBox(g, pink, 14, 11, 12, 0, 5.6, -1.5);
    addBox(g, cream, 14.6, 0.6, 12.6, 0, 11.3, -1.5);
    // central taller keep
    addBox(g, pinkDeep, 6.5, 9, 6.5, 0, 15.5, -1.5);
    addCone(g, roof, 4.8, 6.5, 0, 23.2, -1.5, 10);
    addCyl(g, gold, 0.15, 0.15, 1.8, 0, 26.8, -1.5, 6);
    addBox(g, mat(0xff6b6b), 1.2, 0.7, 0.08, 0.7, 27.2, -1.5);

    // four corner turrets with bright roofs
    const turrets: [number, number, number][] = [
      [-7.5, -7, 0xffa94d],
      [7.5, -7, 0x74c0fc],
      [-7.5, 4.5, 0x69db7c],
      [7.5, 4.5, 0xffd43b],
    ];
    for (const [x, z, tip] of turrets) {
      addCyl(g, pink, 2.1, 2.4, 14, x, 7.2, z, 12);
      addCone(g, mat(tip), 2.9, 4.5, x, 16.5, z, 10);
      addCyl(g, gold, 0.12, 0.12, 1.3, x, 19.0, z, 6);
    }
    // gate + rainbow arch
    addBox(g, pinkDeep, 4.5, 5.5, 0.8, 0, 2.9, 6.0);
    const rainbow = [0xe03131, 0xfd7e14, 0xfcc419, 0x40c057, 0x228be6, 0x7950f2];
    rainbow.forEach((c, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 + i * 0.22, 0.14, 6, 20, Math.PI),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3 }),
      );
      ring.position.set(0, 5.4, 6.5);
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = Math.PI;
      g.add(ring);
    });
    // windows
    for (const [x, y] of [
      [-3.5, 6],
      [3.5, 6],
      [-3.5, 9],
      [3.5, 9],
      [0, 14],
      [0, 17],
    ] as const) {
      addBox(g, mat(0xffe066), 1.0, 1.4, 0.15, x, y, 4.6);
    }

    this.castleTop.set(at.x, 26, at.z);

    this.things.push({
      object: g,
      position: new THREE.Vector3(at.x, 0, at.z + 9),
      radius: 8,
      requiresClick: true,
      interact: () => {
        if (this.ctx.isPaused()) return false;
        const c = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
        const p = this.castleTop.clone();
        p.x += (Math.random() - 0.5) * 8;
        this.fireworks.burst(p, c, 1.2);
        tone(880, 0, 0.15, 'triangle', 0.06);
        this.ctx.say(['Fogo de artifício no Parque Arco-Íris!']);
        return true;
      },
    });
  }

  /**
   * Hotel das Fontes: torre larga em curva + lago grande + fontes em arcos/filas.
   * Inspired by Bellagio fountains (Las Vegas) but original IP — not a real brand.
   * Kids only look / walk / splash-feel — no casino gambling.
   * Deliberately NOT a Roman temple (no colonnade / pediment / dome).
   */
  private buildPalace(scene: THREE.Scene, world: World): void {
    const at = USA_SPOTS.palace;
    // clear the whole site, but only the hotel, the lobby and the lake block her — the plaza and the wide
    // promenade in front of the lake stay walkable (one big block used to wall the lake off)
    world.clearArea({ minX: at.x - 30, maxX: at.x + 30, minZ: at.z - 28, maxZ: at.z + 28 }, 2.5);
    const block = (minX: number, maxX: number, minZ: number, maxZ: number) =>
      world.obstacles.push({ minX: at.x + minX, maxX: at.x + maxX, minZ: at.z + minZ, maxZ: at.z + maxZ });
    block(-12, 12, -15.5, -5); // curved tower
    block(-4.8, 4.8, -3.6, 1.6); // lobby + canopy posts
    block(-16.8, 16.8, 4.3, 19.7); // lake + rim
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.userData.landmark = 'hotel-das-fontes';
    scene.add(g);

    const cream = mat(0xf3e8d8);
    const creamDeep = mat(0xe8d5b8);
    const trim = mat(0xc9a227);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x7ec8ff,
      metalness: 0.45,
      roughness: 0.25,
      emissive: 0x3b82c4,
      emissiveIntensity: 0.22,
    });
    const glassBright = new THREE.MeshStandardMaterial({
      color: 0xbde0fe,
      metalness: 0.35,
      roughness: 0.2,
      emissive: 0x74c0fc,
      emissiveIntensity: 0.35,
    });
    const gold = mat(0xffd43b);
    const stone = mat(0xe9ecef);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x339af0,
      metalness: 0.4,
      roughness: 0.12,
      transparent: true,
      opacity: 0.88,
    });
    const jetMat = mat(0xf8f9fa);
    const jetSoft = mat(0xa5d8ff);

    // plaza (walkway between lobby and lake)
    addBox(g, stone, 36, 0.22, 8, 0, 0.1, 1.5);

    // ——— Wide curved hotel tower (low-poly arc of facade segments) ———
    // Bellagio silhouette: long horizontal curve facing the lake, dense window grid.
    const SEG = 7;
    const ARC = 0.72; // radians — readable low-poly curve wrapping the lake
    const RADIUS = 24;
    const HEIGHT = 16;
    const SEG_W = 5.4;
    const SEG_D = 7.5;
    for (let i = 0; i < SEG; i++) {
      const t = (i / (SEG - 1)) * 2 - 1; // -1 … +1
      const ang = t * (ARC / 2);
      const x = Math.sin(ang) * RADIUS;
      // centre farthest back; wings step forward around the lake (Bellagio wrap)
      const z = -Math.cos(ang) * RADIUS + RADIUS - 11;
      const h = HEIGHT - Math.abs(t) * 1.8; // slight step-down at wings
      const body = addBox(g, i % 2 === 0 ? cream : creamDeep, SEG_W, h, SEG_D, x, h / 2 + 0.2, z);
      body.rotation.y = -ang;
      // cornice
      const corn = addBox(g, trim, SEG_W + 0.3, 0.4, SEG_D + 0.35, x, h + 0.35, z);
      corn.rotation.y = -ang;
      // dense window grid on the lake-facing side of each segment
      const rows = Math.floor((h - 2.5) / 1.55);
      const cols = 3;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const lx = (col - 1) * 1.5;
          const ly = 2.0 + row * 1.55;
          const lz = SEG_D / 2 + 0.08;
          // local (lx,lz) with rot.y = -ang → world offset
          const wx = x + Math.cos(ang) * lx - Math.sin(ang) * lz;
          const wz = z - Math.sin(ang) * lx + Math.cos(ang) * lz;
          const win = addBox(g, row % 2 === 0 ? glass : glassBright, 1.2, 1.2, 0.1, wx, ly, wz);
          win.rotation.y = -ang;
          win.castShadow = false;
        }
      }
    }
    // soft roof lanterns along the curve (Italianate, not a dome)
    for (const t of [-0.7, -0.35, 0, 0.35, 0.7]) {
      const ang = t * (ARC / 2);
      const x = Math.sin(ang) * RADIUS;
      const z = -Math.cos(ang) * RADIUS + RADIUS - 10;
      const y = HEIGHT - Math.abs(t) * 1.8 + 0.6;
      addBox(g, trim, 1.4, 0.9, 1.4, x, y, z);
      addCyl(g, gold, 0.1, 0.1, 0.9, x, y + 0.7, z, 6);
    }

    // glass lobby / porte-cochère (NO classical columns — canopy + glass doors)
    addBox(g, cream, 9, 4.0, 4.5, 0, 2.1, -1.2);
    addBox(g, glassBright, 8.2, 2.6, 0.12, 0, 2.0, 1.05);
    addBox(g, trim, 9.4, 0.28, 5.0, 0, 4.2, -0.9); // canopy slab
    addBox(g, trim, 0.25, 1.6, 0.25, -4.2, 3.3, 1.4);
    addBox(g, trim, 0.25, 1.6, 0.25, 4.2, 3.3, 1.4);
    addBox(g, glass, 2.0, 2.6, 0.12, -1.2, 1.5, 1.1);
    addBox(g, glass, 2.0, 2.6, 0.12, 1.2, 1.5, 1.1);
    addBox(g, trim, 0.18, 2.6, 0.15, 0, 1.5, 1.12);

    // ——— Large lake in front of the curved facade ———
    const lakeZ = 12;
    const lakeW = 32;
    const lakeD = 14;
    const lakeRim = addBox(g, stone, lakeW + 1.6, 0.32, lakeD + 1.4, 0, 0.22, lakeZ);
    lakeRim.receiveShadow = true;
    const lake = new THREE.Mesh(new THREE.BoxGeometry(lakeW, 0.2, lakeD), waterMat);
    lake.position.set(0, 0.38, lakeZ);
    lake.receiveShadow = true;
    g.add(lake);
    // rim walks
    addBox(g, stone, lakeW + 1.6, 0.4, 0.7, 0, 0.35, lakeZ - lakeD / 2 - 0.2);
    addBox(g, stone, lakeW + 1.6, 0.4, 0.7, 0, 0.35, lakeZ + lakeD / 2 + 0.2);
    // promenade in front of the lake (flat, ~5 m wide): she walks along it to watch the fountains
    addBox(g, stone, lakeW + 6, 0.06, 5, 0, 0.03, lakeZ + lakeD / 2 + 0.7 + 2.5);

    // dancing fountain jets — rows + outward arcs (choreographed in update)
    type JetSpec = { x: number; z: number; h: number; tiltX?: number; tiltZ?: number; soft?: boolean };
    const jets: JetSpec[] = [];
    // 4 long rows across the lake
    for (let row = 0; row < 4; row++) {
      const z = lakeZ - 5.2 + row * 2.6;
      const count = row === 1 || row === 2 ? 11 : 9;
      for (let i = 0; i < count; i++) {
        const x = -((count - 1) * 2.2) / 2 + i * 2.2;
        const tall = row === 1 && i === Math.floor(count / 2);
        jets.push({ x, z, h: tall ? 4.2 : 1.8 + (row % 2) * 0.4, soft: !tall });
      }
    }
    // side arcs — tilted jets that read as water fans
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const x = side * (8 + k * 1.6);
        const z = lakeZ - 1.5 + k * 0.35;
        jets.push({
          x,
          z,
          h: 2.4 + k * 0.35,
          tiltZ: side * (0.55 + k * 0.08),
          soft: true,
        });
      }
    }
    // centre fan arcs (lean left/right)
    for (let k = 0; k < 4; k++) {
      const spread = 0.35 + k * 0.12;
      jets.push({ x: -1.2 - k * 0.4, z: lakeZ + 0.5, h: 3.2, tiltZ: -spread });
      jets.push({ x: 1.2 + k * 0.4, z: lakeZ + 0.5, h: 3.2, tiltZ: spread });
    }
    for (const j of jets) {
      const jet = addCyl(
        g,
        j.soft ? jetSoft : jetMat,
        j.soft ? 0.09 : 0.14,
        j.soft ? 0.13 : 0.2,
        j.h,
        j.x,
        0.5 + j.h / 2,
        j.z,
        7,
      );
      if (j.tiltX) jet.rotation.x = j.tiltX;
      if (j.tiltZ) jet.rotation.z = j.tiltZ;
      jet.castShadow = false;
      this.fountainJets.push(jet);
    }

    // diamond on the plaza between lobby and lake
    const gem = gemMesh(0xffd43b, 1.5);
    gem.position.set(0, 1.2, 4.5);
    g.add(gem);
    this.things.push(diamondPickup(this.ctx, 'gem:usa:palace', new THREE.Vector3(at.x, 0, at.z + 4.5), gem));

    this.things.push({
      object: g,
      position: new THREE.Vector3(at.x, 0, at.z + lakeZ),
      radius: 12,
      interact: () => {
        [523, 659, 784, 880, 988].forEach((f, i) => tone(f, i * 0.16, 0.25, 'sine', 0.05));
        this.ctx.say(['Hotel das Fontes! As fontes dançam no lago!']);
      },
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.fireworks.update(dt);
    // night fireworks over the castle
    if (this.daylight() < 0.25 && Math.random() < dt * 0.35) {
      const c = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      const p = this.castleTop.clone();
      p.x += (Math.random() - 0.5) * 10;
      p.z += (Math.random() - 0.5) * 10;
      p.y = 14 + Math.random() * 8;
      this.fireworks.burst(p, c, 0.9 + Math.random() * 0.4);
    }
    // fountain dance — wave across the lake (Hotel das Fontes)
    for (let i = 0; i < this.fountainJets.length; i++) {
      const jet = this.fountainJets[i];
      const phase = this.time * 2.2 + i * 0.55;
      const wave = 0.55 + Math.sin(phase) * 0.5 + Math.sin(phase * 0.5 + 1.1) * 0.2;
      jet.scale.y = wave;
      // keep base near the water surface while the jet stretches up
      jet.position.y = 0.55 + wave * (jet.geometry as THREE.CylinderGeometry).parameters.height * 0.5;
    }
    // the river flows west (the spring pond just ripples)
    if (this.waterTex) this.waterTex.offset.x = (this.time * 0.18) % 1;
    if (this.pondTex) this.pondTex.offset.y = (this.time * 0.05) % 1;
    // fog thins when she is near the bridge
    if (this.bridgeGroup && this.fogSheets.length) {
      const p = this.ctx.player;
      const d = Math.hypot(p.x - USA_SPOTS.bridge.x, p.z - USA_SPOTS.bridge.z);
      const op = THREE.MathUtils.clamp(0.15 + (d - 8) * 0.02, 0.08, 0.5);
      for (const fog of this.fogSheets) {
        const m = fog.material as THREE.MeshBasicMaterial;
        m.opacity = op;
      }
    }
  }

  debug(): Record<string, unknown> {
    return { spots: this.spots };
  }

  dispose(): void {
    this.fireworks.clear();
    setGroundHeight(null);
  }
}
