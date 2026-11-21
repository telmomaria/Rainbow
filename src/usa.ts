import * as THREE from 'three';
import { tone } from './audio';
import { Fireworks, FIREWORK_COLORS } from './fireworks';
import type { GameCtx } from './gamectx';
import { gemMesh, mat } from './places';
import type { Interactable, Obstacle, World } from './world';

/**
 * Estados Unidos landmarks (original names — never ship real brand names):
 *  - Estátua da Liberdade — pedestal + figura verde com coroa e tocha (US1)
 *  - Ponte do Pacífico — ponte suspensa laranja atravessável (US2)
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
  bridge: { x: -115, z: 35 },
  castle: { x: 115, z: -105 },
  palace: { x: -45, z: -120 },
} as const;

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
    claim(world, at, 10, 12, 5);
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
    // front stairs with side walls (reads as a stairway, not a floating plank)
    for (let i = 0; i < 6; i++) {
      const y = 0.22 + i * 0.38;
      const z = 4.1 + i * 0.75;
      addBox(g, stone, 3.5 - i * 0.1, 0.38, 1.2, 0, y, z);
      addBox(g, stoneDark, 0.2, 0.55 + i * 0.08, 1.15, -1.7, y + 0.3, z);
      addBox(g, stoneDark, 0.2, 0.55 + i * 0.08, 1.15, 1.7, y + 0.3, z);
    }
    // terrace railing
    for (const dx of [-2.3, 2.3]) addBox(g, stoneDark, 0.18, 0.75, 4.4, dx, 5.7, 0);
    for (const dz of [-2.3, 2.3]) addBox(g, stoneDark, 4.4, 0.75, 0.18, 0, 5.7, dz);

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

    // right arm raised — torch is a continuous child of the arm
    const rightArm = new THREE.Group();
    rightArm.position.set(1.1, 6.6, 0.1);
    rightArm.rotation.z = -1.1;
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

    // diamond on the terrace
    const gem = gemMesh(0x3bc9ff, 1.4);
    gem.position.set(0, 5.7, 2.0);
    g.add(gem);
    this.things.push(diamondPickup(this.ctx, 'gem:usa:liberdade', new THREE.Vector3(at.x, 0, at.z + 2), gem));

    // climb the pedestal stairs to the crown platform (walk cycle — not a Y teleport)
    const ctx = this.ctx;
    const crownY = 5.25 + 8.05 + 0.55; // terrace + head + crown band ≈ 13.85
    const foot = new THREE.Vector3(at.x, 0, at.z + 6);
    const top = new THREE.Vector3(at.x, crownY, at.z);
    const path: THREE.Vector3[] = [foot.clone()];
    for (let i = 1; i <= 8; i++) path.push(new THREE.Vector3(at.x, (i / 8) * crownY, at.z + 6 - i * 0.7));
    path.push(top.clone());
    // (climb is animated on click — no floating step planks on the figure)
    type Phase = 'idle' | 'up' | 'top' | 'down';
    let phase: Phase = 'idle';
    let t = 0;
    const STEP_T = 0.3;
    const WALK = 3.2;
    const prox = foot.clone();
    const place = (pts: THREE.Vector3[], u: number) => {
      const max = pts.length - 1;
      const f = THREE.MathUtils.clamp(u, 0, max);
      const i = Math.min(max - 1, Math.floor(f));
      const k = f - i;
      const a = pts[i];
      const b = pts[i + 1];
      ctx.player.set(
        THREE.MathUtils.lerp(a.x, b.x, k),
        THREE.MathUtils.lerp(a.y, b.y, k),
        THREE.MathUtils.lerp(a.z, b.z, k),
      );
      ctx.walkAnim(WALK, b.x, b.z);
    };
    this.things.push({
      object: g,
      position: prox,
      radius: 4.5,
      requiresClick: true,
      interact() {
        if (ctx.isDriving()) return false;
        if (phase === 'up' || phase === 'down') return false;
        if (phase === 'idle') {
          if (ctx.isPaused()) return false;
          phase = 'up';
          t = 0;
          ctx.hold(true);
          ctx.walkAnim(WALK, path[1].x, path[1].z);
          return true;
        }
        phase = 'down';
        t = 0;
        prox.copy(foot);
        ctx.hold(true);
        ctx.walkAnim(WALK, path[path.length - 2].x, path[path.length - 2].z);
        return true;
      },
      update(dt) {
        if (phase === 'idle') {
          prox.copy(foot);
          if (ctx.player.y > 0.4 && Math.hypot(ctx.player.x - top.x, ctx.player.z - top.z) > 5) ctx.player.y = 0;
          return;
        }
        if (phase === 'top') {
          prox.set(top.x, 0, top.z);
          ctx.player.set(top.x, top.y, top.z);
          ctx.walkAnim(0);
          return;
        }
        t += dt;
        const pts = phase === 'up' ? path : path.slice().reverse();
        const dur = (pts.length - 1) * STEP_T;
        place(pts, t / STEP_T);
        if (t < dur) return;
        if (phase === 'up') {
          phase = 'top';
          prox.set(top.x, 0, top.z);
          ctx.player.set(top.x, top.y, top.z);
          ctx.walkAnim(0);
          ctx.hold(false);
          ctx.say(['Na coroa da estátua!']);
          tone(660, 0, 0.12, 'triangle', 0.05);
        } else {
          phase = 'idle';
          t = 0;
          prox.copy(foot);
          ctx.walkAnim(0);
          ctx.player.set(foot.x, 0, foot.z);
          ctx.hold(false);
        }
      },
    });
  }

  /** Ponte do Pacífico: torres em A laranja, cabos em catenária, tabuleiro atravessável. */
  private buildBridge(scene: THREE.Scene, world: World): void {
    const at = USA_SPOTS.bridge;
    claim(world, at, 22, 12, 0.6);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    // axis-aligned so the bay/deck read clearly from aerial (not a crooked blue slab)
    g.rotation.y = 0;
    g.userData.landmark = 'bridge';
    scene.add(g);
    this.bridgeGroup = g;

    const rust = mat(0xe8590c);
    const rustDark = mat(0xd9480f);
    const steel = mat(0x868e96);
    const water = mat(0x4dabf7);

    // water under the span only (local X along the bridge; stays under the deck after Y-rotation)
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(38, 14), water);
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(0, 0.03, 0);
    g.add(bay);
    // stone abutments at each end so the deck doesn't look like it floats
    for (const x of [-17.5, 17.5]) {
      addBox(g, mat(0x868e96), 2.5, 3.8, 5.5, x, 1.9, 0);
    }
    // towers (Art-Deco / Golden-Gate-like A frame)
    for (const tx of [-11, 11]) {
      const tower = new THREE.Group();
      tower.position.set(tx, 0, 0);
      g.add(tower);
      for (const z of [-1.7, 1.7]) {
        addBox(tower, rust, 0.9, 14, 0.9, 0, 7.2, z);
      }
      // cross braces
      for (let i = 0; i < 5; i++) {
        const y = 2.5 + i * 2.2;
        addBox(tower, rustDark, 0.25, 0.25, 3.6, 0, y, 0);
        const xBrace = addBox(tower, rustDark, 0.2, 2.4, 0.2, 0, y + 0.9, 0);
        xBrace.rotation.x = 0.7;
        const xBrace2 = addBox(tower, rustDark, 0.2, 2.4, 0.2, 0, y + 0.9, 0);
        xBrace2.rotation.x = -0.7;
      }
      // tower top
      addBox(tower, rust, 1.4, 1.2, 4.2, 0, 14.5, 0);
    }

    // deck + rails
    const deck = addBox(g, steel, 34, 0.45, 4.2, 0, 4.0, 0);
    for (const z of [-2.0, 2.0]) addBox(g, rust, 34, 0.55, 0.18, 0, 4.5, z);
    // roadway stripes
    for (let i = -7; i <= 7; i++) addBox(g, mat(0xffe066), 1.2, 0.02, 0.25, i * 2.2, 4.24, 0);

    // main cables: segments that actually follow the catenary (not upright sticks)
    const cableY = (x: number): number => {
      const dL = Math.abs(x + 11);
      const dR = Math.abs(x - 11);
      const dTower = Math.min(dL, dR);
      return 13.8 - Math.min(dTower, 11) * 0.58;
    };
    for (const z of [-1.6, 1.6]) {
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= 28; i++) {
        const x = -16 + (i / 28) * 32;
        const y = cableY(x);
        const cur = new THREE.Vector3(x, y, z);
        if (prev) {
          const mid = prev.clone().add(cur).multiplyScalar(0.5);
          const len = prev.distanceTo(cur);
          const seg = addCyl(g, rust, 0.06, 0.06, len, mid.x, mid.y, mid.z, 5);
          seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cur.clone().sub(prev).normalize());
        }
        if (i % 2 === 0 && Math.abs(x) < 15.5) {
          const hangH = y - 4.3;
          if (hangH > 0.5) addCyl(g, rustDark, 0.03, 0.03, hangH, x, 4.3 + hangH / 2, z, 5);
        }
        prev = cur;
      }
    }

    // soft fog banks that thin when she is on the bridge (US2)
    this.fogSheets = [];
    for (const [x, z] of [
      [-8, -7],
      [8, 7],
    ] as const) {
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 3.5),
        new THREE.MeshBasicMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      );
      fog.position.set(x, 3.2, z);
      fog.rotation.x = -0.4;
      g.add(fog);
      this.fogSheets.push(fog);
    }

    world.walkable = world.walkable ?? [];
    world.walkable.push(deck);
    const h0 = world.heightAt;
    world.heightAt = (x, z) => {
      const local = g.worldToLocal(new THREE.Vector3(x, 0, z));
      if (Math.abs(local.x) < 16 && Math.abs(local.z) < 2.0) return 4.25;
      return h0?.(x, z) ?? 0;
    };

    this.things.push({
      object: g,
      position: new THREE.Vector3(at.x, 0, at.z),
      radius: 18,
      interact: () => {
        this.ctx.say(['Atravessa a ponte! Olha o nevoeiro…']);
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
    claim(world, at, 30, 28);
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
  }
}
