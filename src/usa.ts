import * as THREE from 'three';
import { tone } from './audio';
import { Fireworks, FIREWORK_COLORS } from './fireworks';
import type { GameCtx } from './gamectx';
import { gemMesh, mat } from './places';
import type { Interactable, Obstacle, World } from './world';

/**
 * Estados Unidos landmarks (original names — no Disney / Caesars brands):
 *  - Estátua da Liberdade — pedestal + figura verde com coroa e tocha (US1)
 *  - Ponte do Pacífico — ponte suspensa laranja atravessável (US2)
 *  - Parque Arco-Íris — castelo de contos + fogo de artifício à noite (US3)
 *  - Palácio das Luzes — palácio romano com fontes que dançam (US4)
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
      ctx.say(['Uma joia especial! Guarda-a para a Lua!']);
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

  /** Estátua da Liberdade: pedestal em degraus, figura verde com coroa de 7 raios e tocha. */
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

    // brighter / taller copper figure — readable from aerial
    const copper = mat(0x40c057);
    const copperDark = mat(0x2f9e44);
    addCyl(g, copper, 1.45, 2.1, 7.0, 0, 9.2, 0, 14);
    addBox(g, copperDark, 0.5, 4.2, 1.2, -1.15, 8.6, 0.3);
    addBox(g, copperDark, 0.5, 3.6, 1.0, 1.1, 8.4, -0.15);
    const tablet = addBox(g, mat(0xe9fac8), 0.2, 2.1, 1.35, -2.0, 9.6, 0.45);
    tablet.rotation.z = 0.18;
    const arm = addCyl(g, copper, 0.3, 0.36, 4.2, 2.0, 11.8, 0, 8);
    arm.rotation.z = -1.05;
    addCyl(g, copper, 0.45, 0.5, 0.7, 3.6, 14.0, 0, 8);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xff922b, emissiveIntensity: 1.7 }),
    );
    flame.position.set(3.6, 15.1, 0);
    g.add(flame);
    addCyl(g, copper, 0.85, 1.05, 1.4, 0, 13.2, 0, 12);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), copper);
    head.position.y = 14.15;
    g.add(head);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const spike = addCone(g, mat(0xffe066), 0.16, 1.4, Math.cos(a) * 0.7, 15.2, Math.sin(a) * 0.7, 6);
      spike.rotation.x = Math.sin(a) * 0.45;
      spike.rotation.z = -Math.cos(a) * 0.45;
    }

    // diamond on the terrace
    const gem = gemMesh(0x3bc9ff, 1.4);
    gem.position.set(0, 5.7, 2.0);
    g.add(gem);
    this.things.push(diamondPickup(this.ctx, 'gem:usa:liberdade', new THREE.Vector3(at.x, 0, at.z + 2), gem));

    // climb the pedestal stairs to the crown platform (walk cycle — not a Y teleport)
    const ctx = this.ctx;
    const foot = new THREE.Vector3(at.x, 0, at.z + 6);
    const top = new THREE.Vector3(at.x, 14.2, at.z);
    const path: THREE.Vector3[] = [foot.clone()];
    for (let i = 1; i <= 8; i++) path.push(new THREE.Vector3(at.x, (i / 8) * 14.2, at.z + 6 - i * 0.7));
    path.push(top.clone());
    // visible steps up the pedestal face
    for (let i = 0; i < 8; i++) {
      const y = ((i + 1) / 8) * 14.2;
      const z = 5.5 - i * 0.55;
      addBox(g, mat(0xced4da), 2.2, 0.35, 0.55, 0, y - 0.2, z);
    }
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

  /** Palácio das Luzes: colunas, frontão triangular, fontes que sobem e descem. */
  private buildPalace(scene: THREE.Scene, world: World): void {
    const at = USA_SPOTS.palace;
    claim(world, at, 14, 12);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.userData.landmark = 'palace';
    scene.add(g);

    const cream = mat(0xfff4e6);
    const marble = mat(0xffffff);
    const gold = mat(0xffd43b);
    const water = mat(0x74c0fc);

    // podium
    addBox(g, cream, 18, 0.6, 12, 0, 0.3, 0);
    // main hall
    addBox(g, cream, 14, 6, 8, 0, 3.5, -1);
    // side wings
    addBox(g, cream, 4, 4.5, 6, -9, 2.5, -1);
    addBox(g, cream, 4, 4.5, 6, 9, 2.5, -1);
    // entablature + triangular pediment (reads as a classical temple front)
    addBox(g, cream, 15, 0.5, 2.5, 0, 6.8, 3.5);
    const pedShape = new THREE.Shape();
    pedShape.moveTo(-7.4, 0);
    pedShape.lineTo(7.4, 0);
    pedShape.lineTo(0, 2.6);
    pedShape.closePath();
    const pedGeo = new THREE.ExtrudeGeometry(pedShape, { depth: 0.5, bevelEnabled: false });
    const pediment = new THREE.Mesh(pedGeo, cream);
    pediment.position.set(0, 7.05, 3.25);
    pediment.castShadow = true;
    g.add(pediment);
    // columns with bases + capitals
    for (let i = 0; i < 8; i++) {
      const x = -7 + i * 2;
      addCyl(g, marble, 0.45, 0.5, 0.35, x, 0.75, 4.0, 10);
      addCyl(g, marble, 0.32, 0.38, 5.0, x, 3.3, 4.0, 10);
      addCyl(g, gold, 0.48, 0.42, 0.35, x, 5.9, 4.0, 10);
    }
    // dome on the centre
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    dome.position.set(0, 6.6, -1);
    g.add(dome);
    addCyl(g, gold, 0.15, 0.15, 1.2, 0, 10.3, -1, 6);

    // dancing fountain pools in front
    addCyl(g, water, 3.2, 3.2, 0.35, 0, 0.55, 7.5, 20);
    addCyl(g, marble, 3.5, 3.5, 0.4, 0, 0.25, 7.5, 20);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const jet = addCyl(g, mat(0xa5d8ff), 0.12, 0.18, 1.2, Math.cos(a) * 1.6, 1.2, 7.5 + Math.sin(a) * 1.6, 8);
      this.fountainJets.push(jet);
    }
    const centreJet = addCyl(g, mat(0xe7f5ff), 0.2, 0.28, 2.2, 0, 1.8, 7.5, 8);
    this.fountainJets.push(centreJet);

    const gem = gemMesh(0xffd43b, 1.5);
    gem.position.set(0, 1.4, 5.5);
    g.add(gem);
    this.things.push(diamondPickup(this.ctx, 'gem:usa:palace', new THREE.Vector3(at.x, 0, at.z + 5.5), gem));

    this.things.push({
      object: g,
      position: new THREE.Vector3(at.x, 0, at.z + 8),
      radius: 5,
      interact: () => {
        [523, 659, 784, 880].forEach((f, i) => tone(f, i * 0.18, 0.25, 'sine', 0.05));
        this.ctx.say(['As fontes dançam!']);
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
    // fountain dance
    for (let i = 0; i < this.fountainJets.length; i++) {
      const jet = this.fountainJets[i];
      const wave = 0.7 + Math.sin(this.time * 2.4 + i * 0.7) * 0.55;
      jet.scale.y = wave;
      jet.position.y = 0.6 + wave * (i === this.fountainJets.length - 1 ? 1.1 : 0.7);
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
