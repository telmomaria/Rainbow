import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import { FIREWORK_COLORS, Fireworks } from './fireworks';
import type { GameCtx } from './gamectx';
import { gemMesh, mat, openSpot } from './places';
import { inNoSpawn } from './spawn';
import { onRoad, ROADS, type Interactable, type Obstacle, type World } from './world';

/**
 * Fase 5 — ex-líbris por cidade (I81–I90 style): landmark diamonds (never spent — for the Moon).
 * Most cities have one; Varsóvia has six. Original stylised takes, not trademarked names where avoidable.
 *
 * Placement runs AFTER venues (pool, concert, fair, house…) with setNoSpawnZones already set — never on top of
 * those, nor hospital / airport. Fixed Warsaw preferences are soft: rejected if they intersect anything.
 *
 * Tower climbs (Castelo Real, Palácio da Cultura…): visible step-up, vista + jewel at the top, same click to
 * come back down — never a dry teleport onto a grey block.
 */

/** Last build's QA/debug payload (spots for Warsaw, etc.). */
let landmarkDebug: Record<string, unknown> | null = null;
export function landmarksDebug(): Record<string, unknown> | null {
  return landmarkDebug;
}

function diamondAt(ctx: GameCtx, key: string, at: THREE.Vector3, mesh: THREE.Object3D): Interactable {
  const taken = () => ctx.flag(key) > 0;
  if (taken()) mesh.visible = false;
  return {
    object: mesh,
    position: at.clone(),
    radius: 2.6,
    interact() {
      if (taken()) return;
      ctx.setFlag(key, 1);
      mesh.visible = false;
      ctx.addDiamond();
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.07));
      ctx.say(['Uma joia do ex-líbris! Guarda-a para a Lua!']);
    },
  };
}

const overlaps = (a: Obstacle, b: Obstacle, m = 0): boolean =>
  a.maxX + m > b.minX && a.minX - m < b.maxX && a.maxZ + m > b.minZ && a.minZ - m < b.maxZ;

/** True if the landmark footprint is clear of roads, airport, no-spawn venues and existing obstacles. */
function footprintFree(obstacles: Obstacle[], at: { x: number; z: number }, hw: number, hd: number, margin = 4): boolean {
  const me: Obstacle = { minX: at.x - hw, maxX: at.x + hw, minZ: at.z - hd, maxZ: at.z + hd };
  if (Math.max(Math.abs(me.minX), Math.abs(me.maxX), Math.abs(me.minZ), Math.abs(me.maxZ)) > ROADS.extent - 10) return false;
  const samples: [number, number][] = [
    [at.x, at.z],
    [at.x - hw, at.z - hd],
    [at.x + hw, at.z - hd],
    [at.x - hw, at.z + hd],
    [at.x + hw, at.z + hd],
    [at.x - hw, at.z],
    [at.x + hw, at.z],
    [at.x, at.z - hd],
    [at.x, at.z + hd],
  ];
  for (const [x, z] of samples) {
    if (onRoad(x, z, 2.5)) return false;
    if (inNoSpawn(x, z, margin)) return false;
  }
  if (overlaps(me, AIRPORT_ZONE, 4)) return false;
  for (const o of obstacles) if (overlaps(me, o, margin)) return false;
  return true;
}

/**
 * Prefer `want` when free; otherwise spiral nearby, then openSpot.
 * Used by Varsóvia (soft fixed prefs) and as a safety net for every city.
 */
function resolveSpot(
  obstacles: Obstacle[],
  rng: () => number,
  hw: number,
  hd: number,
  want?: { x: number; z: number } | null,
): { x: number; z: number } {
  if (want && footprintFree(obstacles, want, hw, hd)) return { x: want.x, z: want.z };
  if (want) {
    for (const dist of [22, 36, 50, 68, 88]) {
      for (let i = 0; i < 20; i++) {
        const a = ((i + rng()) / 20) * Math.PI * 2;
        const cand = { x: want.x + Math.cos(a) * dist, z: want.z + Math.sin(a) * dist };
        if (footprintFree(obstacles, cand, hw, hd)) return cand;
      }
    }
  }
  const r = Math.max(hw, hd) + 0.5;
  const found =
    openSpot(obstacles, rng, r, { minD: 40, maxD: 140 }) ??
    openSpot(obstacles, rng, r, { minD: 28, maxD: 155 }) ??
    openSpot(obstacles, rng, Math.max(2.5, r - 1.5), { minD: 22, maxD: 165 });
  if (found) return { x: found.x, z: found.z };
  // last safe-ish corner (never a random mid-block that could land on a venue)
  for (const cand of [
    { x: 110, z: -110 },
    { x: -110, z: -110 },
    { x: 110, z: 110 },
    { x: -110, z: 110 },
  ]) {
    if (footprintFree(obstacles, cand, hw, hd, 2)) return cand;
  }
  return want ? { x: want.x, z: want.z } : { x: 110, z: -110 };
}

function place(obstacles: Obstacle[], rng: () => number, r: number): THREE.Vector3 {
  const at = resolveSpot(obstacles, rng, r, r);
  return new THREE.Vector3(at.x, 0, at.z);
}

/**
 * Soft preferences for Varsóvia (off roads x∈{-80,0}, z∈{-70,0,75}; away from SPAWN and airport).
 * Castelo/mercado sit on the outer corners — not on the roadside strip where pool/concert like to park.
 */
const WARSAW_PREFS = {
  barbaca: { x: -55, z: -115 },
  cultura: { x: 55, z: -115 },
  catedral: { x: -115, z: 40 },
  /** East of the west-side fair so the pavilion is not swallowed by stalls. */
  lazienki: { x: 110, z: -55 },
  mercado: { x: 120, z: 120 },
  /** Far NW corner — old (−55, 110) sat on the roadside strip where the pool parks. */
  castelo: { x: -120, z: 125 },
} as const;

function claimSpot(world: World, at: { x: number; z: number }, hw: number, hd: number, height?: number): Obstacle {
  const ob: Obstacle = { minX: at.x - hw, maxX: at.x + hw, minZ: at.z - hd, maxZ: at.z + hd };
  if (height !== undefined) ob.height = height;
  world.clearArea(ob, 4);
  world.obstacles.push(ob);
  return ob;
}

/** Resolve a free footprint, claim it (clear placeholders), return the centre used. */
function takeSpot(
  world: World,
  obstacles: Obstacle[],
  rng: () => number,
  hw: number,
  hd: number,
  want: { x: number; z: number } | null,
  height?: number,
): { x: number; z: number } {
  const at = resolveSpot(obstacles, rng, hw, hd, want);
  claimSpot(world, at, hw, hd, height);
  return at;
}

/** Soft aerial / lookout camera (main.ts listens for `rainbow-aerial`). Cleared on descend / city change. */
type VistaCam = { x: number; z: number; h: number; fromX?: number; fromZ?: number; lookY?: number };
function setVista(vista: VistaCam | null): void {
  window.dispatchEvent(new CustomEvent('rainbow-aerial', { detail: vista }));
}

/**
 * Climb real stairs to a real landing (roof / torreão terrace). Legs walk via ctx.walkAnim —
 * never a Y-only elevator. Top reward is honest: jewel + flags/fireworks; «vista» only when
 * `vista` is set (soft aerial over the city — sayTop is spoken after the camera switches).
 */
function towerClimb(opts: {
  ctx: GameCtx;
  object: THREE.Object3D;
  foot: THREE.Vector3;
  top: THREE.Vector3;
  /** Waypoints between foot and top (world space) — must match the stair meshes. */
  steps?: THREE.Vector3[];
  gem?: THREE.Object3D;
  gemKey?: string;
  fireworks?: Fireworks;
  flags?: THREE.Object3D[];
  /** Honest line on arrival (no «vista» unless the camera really shows the city). */
  sayTop: string[];
  sayGem: string[];
  interactAt?: THREE.Vector3;
  radius?: number;
  /** Walk-cycle speed while climbing (m/s). */
  walkSpeed?: number;
  /** Soft aerial / lookout over the city while she stands on the landing (cleared on the way down). */
  vista?: VistaCam;
}): Interactable {
  const { ctx, object, foot, top, gem, gemKey, fireworks, flags } = opts;
  const climbPath = [foot.clone(), ...(opts.steps ?? []), top.clone()];
  const downPath = climbPath.slice().reverse();
  type Phase = 'idle' | 'up' | 'top' | 'down';
  let phase: Phase = 'idle';
  let t = 0;
  let topT = 0;
  let gemHint = false;
  const STEP_T = 0.32; // one tread — slow enough to see the legs swing
  const WALK = opts.walkSpeed ?? 3.2;
  const gemTaken = () => (gemKey ? ctx.flag(gemKey) > 0 : true);

  const placeAlong = (path: THREE.Vector3[], u: number) => {
    const max = path.length - 1;
    const f = THREE.MathUtils.clamp(u, 0, max);
    const i = Math.min(max - 1, Math.floor(f));
    const k = f - i;
    const a = path[i];
    const b = path[i + 1];
    const x = THREE.MathUtils.lerp(a.x, b.x, k);
    const y = THREE.MathUtils.lerp(a.y, b.y, k);
    const z = THREE.MathUtils.lerp(a.z, b.z, k);
    ctx.player.set(x, y, z);
    // face the next tread so the walk cycle reads as climbing, not sliding
    ctx.walkAnim(WALK, b.x, b.z);
  };

  const finishGround = () => {
    phase = 'idle';
    t = 0;
    topT = 0;
    gemHint = false;
    if (opts.vista) setVista(null);
    ctx.walkAnim(0);
    ctx.player.set(foot.x, 0, foot.z);
    ctx.hold(false);
  };

  const takeGem = () => {
    if (!gem || !gemKey || gemTaken()) return false;
    ctx.setFlag(gemKey, 1);
    gem.visible = false;
    ctx.addDiamond();
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.22, 'triangle', 0.07));
    ctx.say(opts.sayGem);
    return true;
  };

  if (gem && gemKey && gemTaken()) gem.visible = false;

  // proximity point moves with her: foot on the ground, terrace while she's up (or Enter/click can't reach her)
  const prox = (opts.interactAt ?? foot).clone();

  return {
    object,
    position: prox,
    radius: opts.radius ?? 4.5,
    requiresClick: true,
    interact() {
      if (ctx.isDriving()) return false;
      if (phase === 'up' || phase === 'down') return false;
      if (phase === 'idle') {
        if (ctx.isPaused()) return false;
        phase = 'up';
        t = 0;
        ctx.hold(true);
        ctx.walkAnim(WALK, climbPath[1]?.x ?? top.x, climbPath[1]?.z ?? top.z);
        tone(523, 0, 0.1, 'triangle', 0.04);
        return true;
      }
      // on the landing: first tap takes the jewel; next tap walks down
      if (!gemTaken() && takeGem()) return true;
      phase = 'down';
      t = 0;
      if (opts.vista) setVista(null);
      prox.set(foot.x, 0, foot.z);
      ctx.hold(true);
      ctx.walkAnim(WALK, downPath[1]?.x ?? foot.x, downPath[1]?.z ?? foot.z);
      tone(392, 0, 0.1, 'triangle', 0.04);
      return true;
    },
    update(dt) {
      fireworks?.update(dt);
      if (flags) {
        for (let i = 0; i < flags.length; i++) {
          flags[i].rotation.z = Math.sin(performance.now() * 0.004 + i) * 0.35;
        }
      }
      if (gem && !gemTaken() && gem.visible) {
        gem.rotation.y += dt * 1.8;
        const matl = (gem as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (matl?.emissiveIntensity !== undefined) {
          matl.emissiveIntensity = 0.45 + Math.sin(performance.now() * 0.008) * 0.35;
        }
      }
      if (phase === 'idle') {
        prox.set(foot.x, 0, foot.z);
        if (ctx.player.y > 0.4) {
          const dTop = Math.hypot(ctx.player.x - top.x, ctx.player.z - top.z);
          const dFoot = Math.hypot(ctx.player.x - foot.x, ctx.player.z - foot.z);
          if (dTop > 5 && dFoot > 4) ctx.player.y = 0;
        }
        return;
      }
      if (phase === 'top') {
        prox.set(top.x, 0, top.z);
        ctx.player.set(top.x, top.y, top.z);
        ctx.walkAnim(0);
        topT += dt;
        if (!gemHint && topT > 0.8 && !gemTaken()) {
          gemHint = true;
          ctx.say(['Apanha a joia!']);
        }
        return;
      }
      t += dt;
      const path = phase === 'up' ? climbPath : downPath;
      const dur = (path.length - 1) * STEP_T;
      placeAlong(path, t / STEP_T);
      if (t < dur) return;
      if (phase === 'up') {
        phase = 'top';
        topT = 0;
        gemHint = false;
        prox.set(top.x, 0, top.z);
        ctx.player.set(top.x, top.y, top.z);
        ctx.walkAnim(0);
        ctx.hold(false);
        // vista first so sayTop is honest («vista» only when the camera shows the city)
        if (opts.vista) setVista(opts.vista);
        ctx.say(opts.sayTop);
        tone(660, 0, 0.14, 'triangle', 0.055);
        tone(880, 0.12, 0.16, 'triangle', 0.04);
        if (fireworks) {
          const c = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
          const p = top.clone();
          p.y += 3;
          fireworks.burst(p, c, 0.85);
          setTimeout(() => {
            const c2 = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
            const p2 = top.clone();
            p2.x += 2;
            p2.y += 4;
            fireworks.burst(p2, c2, 0.7);
          }, 400);
        }
      } else {
        finishGround();
      }
    },
  };
}

type Builder = (scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx, world: World) => Interactable[];

/** Soft preference for Porto Clérigos — far SW corner, off SPAWN / airport / roadside venues. */
const PORTO_CLERIGOS = { x: -110, z: -115 } as const;

const BY_CITY: Record<string, Builder> = {
  /**
   * Torre dos Clérigos — tall baroque granite silhouette (church + slender tower + cupola),
   * visible stairs hugging the shaft, lookout vista + jewel. Not a generic cylinder.
   */
  Porto(scene, obstacles, rng, ctx, world) {
    // footprint hugs the tower (stairs wrap close); margin ≥4 m via takeSpot/clearArea
    const at = takeSpot(world, obstacles, rng, 7, 8, PORTO_CLERIGOS, 30);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    scene.add(g);

    const granite = mat(0xd8d4cc); // light Porto granite
    const graniteDark = mat(0xb8b2a8);
    const trim = mat(0xe8e4dc);
    const roof = mat(0x6d6358);
    const clockFace = mat(0xfff4d6);
    const hand = mat(0x343a40);
    const tz = 0.8; // tower centre local Z (slightly forward of the church)

    // —— igreja baixa atrás (dá escala; a torre é o ex-líbris) ——
    const nave = new THREE.Mesh(new THREE.BoxGeometry(8.2, 4.6, 6.0), granite);
    nave.position.set(0, 2.3, -3.6);
    nave.castShadow = true;
    g.add(nave);
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.8, 4), roof);
    pediment.rotation.y = Math.PI / 4;
    pediment.position.set(0, 5.5, -3.6);
    g.add(pediment);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.18), mat(0x5c4033));
    door.position.set(0, 1.2, -0.5);
    g.add(door);
    for (const px of [-2.4, 2.4]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), trim);
      pil.position.set(px, 2.2, -0.55);
      g.add(pil);
    }

    // —— torre alta em três corpos (base → meio → miradouro) — silhueta Clérigos ——
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 8.2, 4.2), granite);
    base.position.set(0, 4.1, tz);
    base.castShadow = true;
    g.add(base);
    // corner buttresses (baroque feel, readable from afar)
    for (const [bx, bz] of [
      [-2.0, -2.0],
      [2.0, -2.0],
      [-2.0, 2.0],
      [2.0, 2.0],
    ] as const) {
      const butt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.0, 0.7), graniteDark);
      butt.position.set(bx, 4.0, tz + bz);
      g.add(butt);
    }
    const baseCornice = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.4, 4.8), trim);
    baseCornice.position.set(0, 8.3, tz);
    g.add(baseCornice);

    // mid octagonal (the classic Clérigos taper)
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.05, 7.8, 8), granite);
    mid.position.set(0, 12.3, tz);
    mid.castShadow = true;
    g.add(mid);
    const midBand = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.35, 8), trim);
    midBand.position.set(0, 16.25, tz);
    g.add(midBand);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), clockFace);
      dial.position.set(Math.sin(a) * 1.95, 12.5, tz + Math.cos(a) * 1.95);
      dial.rotation.y = a;
      g.add(dial);
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.04), hand);
      hr.position.set(0, 0.1, 0.02);
      dial.add(hr);
    }
    // windows as dark niches on mid faces (reads as tower, not cylinder)
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const niche = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.12), mat(0x495057));
      niche.position.set(Math.sin(a) * 1.85, 14.2, tz + Math.cos(a) * 1.85);
      niche.rotation.y = a;
      g.add(niche);
    }

    // upper slender shaft
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 4.8, 8), graniteDark);
    upper.position.set(0, 18.8, tz);
    upper.castShadow = true;
    g.add(upper);

    // lookout balcony (landing) — terrace the stairs reach
    const balconyY = 21.0;
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.28, 12), trim);
    balcony.position.set(0, balconyY, tz);
    g.add(balcony);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), trim);
      post.position.set(Math.cos(a) * 2.0, balconyY + 0.52, tz + Math.sin(a) * 2.0);
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.05, 6, 24), trim);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(0, balconyY + 0.9, tz);
    g.add(rail);
    // little urns on the balcony (Clérigos ornament kids notice)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const urn = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), graniteDark);
      urn.position.set(Math.cos(a) * 2.05, balconyY + 1.15, tz + Math.sin(a) * 2.05);
      g.add(urn);
    }

    // cupola / coruchéu (the tip that makes it Clérigos, not a lighthouse)
    const cupola = new THREE.Mesh(new THREE.SphereGeometry(1.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), graniteDark);
    cupola.position.set(0, balconyY + 1.0, tz);
    g.add(cupola);
    // ribs on the cupola
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), trim);
      rib.position.set(Math.cos(a) * 1.35, balconyY + 1.7, tz + Math.sin(a) * 1.35);
      rib.rotation.z = Math.cos(a) * 0.35;
      rib.rotation.x = -Math.sin(a) * 0.35;
      g.add(rib);
    }
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.7, 8), granite);
    lantern.position.set(0, balconyY + 2.7, tz);
    g.add(lantern);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 8), roof);
    finial.position.set(0, balconyY + 4.0, tz);
    g.add(finial);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), mat(0xffd43b));
    ball.position.set(0, balconyY + 5.1, tz);
    g.add(ball);

    // —— escadas visíveis à volta do fuste (abraçam a torre — silhueta limpa de longe) ——
    const stairN = 16;
    const climbSteps: THREE.Vector3[] = [];
    const stairR = 2.55;
    for (let i = 0; i < stairN; i++) {
      const t = (i + 0.5) / stairN;
      const a = Math.PI / 2 + t * Math.PI * 1.75; // start on +Z, wrap ~315°
      const y = ((i + 1) / stairN) * balconyY;
      const sx = Math.cos(a) * stairR;
      const sz = tz + Math.sin(a) * stairR;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 0.7), trim);
      step.position.set(sx, y, sz);
      step.rotation.y = -a + Math.PI / 2;
      step.castShadow = true;
      g.add(step);
      // short riser wall so each tread reads as a real step
      const riser = new THREE.Mesh(new THREE.BoxGeometry(1.15, Math.max(0.35, balconyY / stairN), 0.14), graniteDark);
      riser.position.set(sx * 0.92, y - balconyY / stairN / 2, tz + Math.sin(a) * stairR * 0.92);
      riser.rotation.y = -a + Math.PI / 2;
      g.add(riser);
      climbSteps.push(new THREE.Vector3(at.x + sx, y + 0.16, at.z + sz));
    }
    climbSteps.push(new THREE.Vector3(at.x, balconyY + 0.2, at.z + tz + 1.5));

    const gem = gemMesh(0x3bc9ff, 1.5);
    gem.position.set(0, balconyY + 0.9, tz);
    g.add(gem);

    const footA = Math.PI / 2;
    const foot = new THREE.Vector3(
      at.x + Math.cos(footA) * (stairR + 0.9),
      0,
      at.z + tz + Math.sin(footA) * (stairR + 0.9),
    );
    const lookout = new THREE.Vector3(at.x, balconyY + 0.2, at.z + tz);
    // soft aerial over Porto with the tower still in frame (below cloud layer)
    const vista: VistaCam = {
      x: at.x + 6,
      z: at.z + 22,
      h: 36,
    };

    landmarkDebug = { spots: { clerigos: at }, prefs: { clerigos: { ...PORTO_CLERIGOS } }, count: 1, foot: { x: foot.x, z: foot.z } };

    return [
      towerClimb({
        ctx,
        object: g,
        foot,
        top: lookout,
        steps: climbSteps,
        gem,
        gemKey: `gem:${ctx.city()}:clerigos`,
        sayTop: ['No cimo da Torre dos Clérigos!'],
        sayGem: ['Uma joia do ex-líbris! Guarda-a para a Lua!'],
        interactAt: foot,
        radius: 5,
        vista,
      }),
    ];
  },

  Roma(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 6);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // Fontana-inspired basin
    const water = mat(0x74c0fc);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.6, 24), mat(0xc5c8ce));
    basin.position.y = 0.3;
    g.add(basin);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.2, 24), water);
    pool.position.y = 0.55;
    g.add(pool);
    const statue = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.5, 10), mat(0xe9ecef));
    statue.position.y = 2.0;
    g.add(statue);
    obstacles.push({ minX: at.x - 5, maxX: at.x + 5, minZ: at.z - 5, maxZ: at.z + 5, height: 0.8 });
    const gem = gemMesh(0xffe14d, 1.2);
    gem.position.set(1.5, 1.0, 2.5);
    g.add(gem);
    const things = [diamondAt(ctx, `gem:${ctx.city()}:trevi`, new THREE.Vector3(at.x + 1.5, 0, at.z + 2.5), gem)];
    things.push({
      object: g,
      position: at.clone(),
      radius: 4,
      interact() {
        if (ctx.coins() < 1) {
          ctx.say(['Precisas de uma moeda para o desejo!']);
          return;
        }
        ctx.addCoins(-1);
        tone(1200, 0, 0.15, 'sine', 0.05);
        ctx.say(['Faz um desejo!']);
      },
    });
    return things;
  },

  Paris(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 6);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    const iron = mat(0x495057);
    const ironLite = mat(0x868e96);
    // Eiffel-like: wide base tapering to a needle, with two platforms
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 7, 0.55), iron);
      leg.position.set(x, 3.5, z);
      leg.rotation.x = z > 0 ? 0.18 : -0.18;
      leg.rotation.z = x > 0 ? -0.18 : 0.18;
      g.add(leg);
    }
    // first floor platform (wide)
    const mid1 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 5.2), ironLite);
    mid1.position.y = 6.2;
    g.add(mid1);
    // arched opening feel under first floor
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 14, Math.PI), iron);
      arch.position.set(Math.sin(a) * 0.2, 4.2, Math.cos(a) * 0.2);
      arch.rotation.y = a;
      arch.rotation.z = Math.PI;
      g.add(arch);
    }
    // second floor
    const mid2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), ironLite);
    mid2.position.y = 10.5;
    g.add(mid2);
    // upper taper
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.5, 0.28), iron);
      leg.position.set(x, 13.2, z);
      leg.rotation.x = z > 0 ? 0.12 : -0.12;
      leg.rotation.z = x > 0 ? -0.12 : 0.12;
      g.add(leg);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.35, 5, 8), iron);
    tip.position.y = 18.5;
    g.add(tip);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xff922b, emissiveIntensity: 0.9 }),
    );
    lamp.position.y = 21.2;
    g.add(lamp);
    obstacles.push({ minX: at.x - 3.2, maxX: at.x + 3.2, minZ: at.z - 3.2, maxZ: at.z + 3.2 });
    const gem = gemMesh(0xff3b7f, 1.3);
    gem.position.set(0, 6.8, 0);
    g.add(gem);
    return [diamondAt(ctx, `gem:${ctx.city()}:torre`, new THREE.Vector3(at.x, 0, at.z + 3), gem)];
  },

  Londres(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 5);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // big clock tower (I85)
    const stone = mat(0xb8b2c4);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.5, 12, 2.5), stone);
    tower.position.y = 6;
    g.add(tower);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), mat(0xffe066));
    clock.position.set(0, 9, 1.3);
    g.add(clock);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.05), mat(0x212529));
    hand.position.set(0, 0.2, 0.05);
    clock.add(hand);
    // Ferris wheel beside it
    const wheel = new THREE.Group();
    wheel.position.set(6, 5, 0);
    g.add(wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.12, 8, 32), mat(0x868e96));
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0xff6b9d));
      cabin.position.set(0, Math.cos(a) * 4, Math.sin(a) * 4);
      wheel.add(cabin);
    }
    obstacles.push({ minX: at.x - 2, maxX: at.x + 2, minZ: at.z - 2, maxZ: at.z + 2 });
    obstacles.push({ minX: at.x + 3, maxX: at.x + 9, minZ: at.z - 2, maxZ: at.z + 2, height: 0.5 });
    const gem = gemMesh(0xb06bff, 1.2);
    gem.position.set(0, 12.5, 0);
    g.add(gem);
    const things = [diamondAt(ctx, `gem:${ctx.city()}:relogio`, new THREE.Vector3(at.x, 0, at.z + 2.5), gem)];
    things.push({
      object: g,
      position: at.clone(),
      radius: 3,
      interact() {
        const h = new Date().getHours() % 12 || 12;
        for (let i = 0; i < Math.min(h, 8); i++) tone(200, i * 0.35, 0.3, 'sine', 0.08);
        ctx.say(['O relógio dá as horas!']);
      },
    });
    things.push({
      object: wheel,
      position: new THREE.Vector3(at.x + 6, 0, at.z),
      radius: 4,
      requiresClick: true,
      interact() {
        if (ctx.isPaused()) return false;
        ctx.hold(true);
        ctx.say(['Uma volta na roda!']);
        let t = 0;
        const spin = setInterval(() => {
          t += 0.05;
          wheel.rotation.x = t;
          const a = t;
          ctx.player.set(at.x + 6, 5 + Math.cos(a) * 3.5, at.z + Math.sin(a) * 3.5);
          if (t > Math.PI * 2) {
            clearInterval(spin);
            ctx.player.set(at.x + 6, 0, at.z + 4);
            ctx.hold(false);
          }
        }, 50);
        return true;
      },
    });
    return things;
  },

  'Varsóvia'(scene, obstacles, rng, ctx, world) {
    const things: Interactable[] = [];
    const city = ctx.city();
    const used: Record<string, { x: number; z: number }> = {};

    // 1) Barbacã — round brick fort with gate + courtyard
    {
      const at = takeSpot(world, obstacles, rng, 8, 8, WARSAW_PREFS.barbaca, 4);
      used.barbaca = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const brick = mat(0xb5654a);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.2, 3.2, 24, 1, true), brick);
      wall.position.y = 1.6;
      wall.castShadow = true;
      g.add(wall);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 5, 10), brick);
        tower.position.set(Math.cos(a) * 6.5, 2.5, Math.sin(a) * 6.5);
        tower.castShadow = true;
        g.add(tower);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 8), mat(0x8b4513));
        tip.position.set(tower.position.x, 5.7, tower.position.z);
        g.add(tip);
      }
      const gateL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), brick);
      gateL.position.set(-2.2, 1.75, 6.8);
      g.add(gateL);
      const gateR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), brick);
      gateR.position.set(2.2, 1.75, 6.8);
      g.add(gateR);
      const arch = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, 1.2), brick);
      arch.position.set(0, 3.8, 6.8);
      g.add(arch);
      const gem = gemMesh(0xffe14d, 1.3);
      gem.position.set(0, 1.2, 0);
      g.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:barbaca`, new THREE.Vector3(at.x, 0, at.z), gem));
      things.push({
        object: g,
        position: new THREE.Vector3(at.x, 0, at.z + 8),
        radius: 3.5,
        interact() {
          [220, 277, 330, 392].forEach((f, i) => tone(f, i * 0.2, 0.35, 'triangle', 0.07));
          ctx.say(['Que forte tão giro!']);
        },
      });
    }

    // 2) Palácio da Cultura — tall skyscraper with spire
    {
      const at = takeSpot(world, obstacles, rng, 6, 6, WARSAW_PREFS.cultura, 8);
      used.cultura = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const stone = mat(0xd0c8b8);
      const base = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10), stone);
      base.position.y = 2;
      base.castShadow = true;
      g.add(base);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), stone);
      mid.position.y = 11;
      mid.castShadow = true;
      g.add(mid);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 8, 3.5), stone);
      top.position.y = 22;
      g.add(top);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 6, 8), mat(0xc5c8ce));
      spire.position.y = 29;
      g.add(spire);
      const clock = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), mat(0xffe066));
      clock.position.set(0, 18, 3.05);
      g.add(clock);
      // real terrace on the mid block + solid stair (landing = roof of the mid section)
      const terraceY = 18.1;
      const terrace = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 6.4), mat(0xc5c8ce));
      terrace.position.y = terraceY;
      g.add(terrace);
      for (const [rx, rz] of [
        [-3.0, 0],
        [3.0, 0],
        [0, -3.0],
        [0, 3.0],
      ] as const) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(rx === 0 ? 6.4 : 0.18, 0.7, rz === 0 ? 6.4 : 0.18), mat(0xadb5bd));
        rail.position.set(rx, terraceY + 0.5, rz);
        g.add(rail);
      }
      const stairN = 12;
      const rise = terraceY / stairN;
      const run = 0.55;
      const climbSteps: THREE.Vector3[] = [];
      for (let i = 0; i < stairN; i++) {
        const y = (i + 1) * rise;
        const z = 5.2 + (stairN - 1 - i) * run;
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, rise * 0.92, run * 0.95), mat(0xb0a090));
        step.position.set(0, y - rise * 0.5, z);
        g.add(step);
        // side walls so it reads as a real staircase into the building
        const sideH = y + 0.3;
        for (const sx of [-1.25, 1.25]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.18, sideH, run * 0.95), mat(0x9a8b7a));
          side.position.set(sx, sideH / 2, z);
          g.add(side);
        }
        climbSteps.push(new THREE.Vector3(at.x, y, at.z + z));
      }
      const gem = gemMesh(0xb06bff, 1.4);
      gem.position.set(0, terraceY + 0.9, 0);
      g.add(gem);
      const foot = new THREE.Vector3(at.x, 0, at.z + 5.2 + stairN * run + 0.4);
      const lookout = new THREE.Vector3(at.x, terraceY + 0.2, at.z);
      things.push(
        towerClimb({
          ctx,
          object: g,
          foot,
          top: lookout,
          steps: climbSteps,
          gem,
          gemKey: `gem:${city}:cultura`,
          sayTop: ['No terraço do Palácio!'],
          sayGem: ['Uma joia do ex-líbris! Guarda-a para a Lua!'],
          interactAt: foot,
          radius: 5,
        }),
      );
    }

    // 3) Catedral de São Miguel e São Floriano — twin red-brick towers
    {
      const at = takeSpot(world, obstacles, rng, 7, 5, WARSAW_PREFS.catedral, 6);
      used.catedral = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const brick = mat(0xc0392b);
      const nave = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 12), brick);
      nave.position.y = 2.5;
      nave.castShadow = true;
      g.add(nave);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.2, 12.4), mat(0x4a3728));
      roof.position.y = 5.6;
      g.add(roof);
      for (const x of [-2.8, 2.8]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 2.4), brick);
        tower.position.set(x, 6, 5.5);
        tower.castShadow = true;
        g.add(tower);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 4), mat(0x2b2118));
        tip.position.set(x, 13.5, 5.5);
        g.add(tip);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.2), mat(0x5c4033));
      door.position.set(0, 1.2, 6.1);
      g.add(door);
      const gem = gemMesh(0xff3b7f, 1.3);
      gem.position.set(0, 1.0, 7.2);
      g.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:catedral`, new THREE.Vector3(at.x, 0, at.z + 7.5), gem));
      things.push({
        object: g,
        position: new THREE.Vector3(at.x, 0, at.z + 7),
        radius: 3.5,
        interact() {
          [180, 220, 180, 147].forEach((f, i) => tone(f, i * 0.55, 0.7, 'sine', 0.1));
          ctx.say(['Ding-dong! Os sinos!']);
        },
      });
    }

    // 4) Parque Łazienki — palace pavilion + peacocks + pond
    {
      const at = takeSpot(world, obstacles, rng, 10, 8, WARSAW_PREFS.lazienki, 3);
      used.lazienki = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const cream = mat(0xf5e6c8);
      const palace = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 5), cream);
      palace.position.set(0, 1.75, -3);
      palace.castShadow = true;
      g.add(palace);
      const colon = mat(0xe9ecef);
      for (let i = -3; i <= 3; i++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.2, 8), colon);
        col.position.set(i * 1.3, 1.6, -0.3);
        g.add(col);
      }
      const ped = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.4, 1.2), cream);
      ped.position.set(0, 3.4, -0.3);
      g.add(ped);
      const pond = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.15, 20), mat(0x74c0fc));
      pond.position.set(0, 0.08, 3.5);
      g.add(pond);
      for (const [px, pz, yaw] of [[-4, 2, 0.4], [4, 1.5, -0.6], [1, 5, 0.1]] as const) {
        g.add(peacockAt(px, pz, yaw));
      }
      const gem = gemMesh(0x7dff6b, 1.3);
      gem.position.set(0, 0.6, 3.5);
      g.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:lazienki`, new THREE.Vector3(at.x, 0, at.z + 4), gem));
      things.push({
        object: g,
        position: new THREE.Vector3(at.x, 0, at.z + 3),
        radius: 4,
        interact() {
          [880, 990, 1100].forEach((f, i) => tone(f, i * 0.25, 0.3, 'sine', 0.05));
          ctx.say(['Os pavões do parque!']);
        },
      });
    }

    // 5) Praça do Mercado + sereia — façades + mermaid with sword
    {
      const at = takeSpot(world, obstacles, rng, 9, 9, WARSAW_PREFS.mercado, 4);
      used.mercado = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const colors = [0xe57373, 0xffb74d, 0x81c784, 0x64b5f6, 0xf7c873];
      for (let i = 0; i < 5; i++) {
        const h = 4 + (i % 3);
        const facade = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 2.2), mat(colors[i]));
        facade.position.set(-6 + i * 3.2, h / 2, -6);
        facade.castShadow = true;
        g.add(facade);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 2.4), mat(0x8d6e63));
        roof.position.set(facade.position.x, h + 0.25, -6);
        g.add(roof);
      }
      for (let i = 0; i < 4; i++) {
        const h = 3.5 + (i % 2);
        const facade = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 3.2), mat(colors[(i + 2) % 5]));
        facade.position.set(-7, h / 2, -3 + i * 3.2);
        facade.castShadow = true;
        g.add(facade);
      }
      const bronze = mat(0x8d8f6a);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.8, 12), mat(0xadb5bd));
      plinth.position.y = 0.4;
      g.add(plinth);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 10), bronze);
      body.position.y = 1.6;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), bronze);
      head.position.y = 2.6;
      g.add(head);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), bronze);
      tail.position.set(0, 0.7, 0.45);
      tail.rotation.x = 1.1;
      g.add(tail);
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), mat(0xc5c8ce));
      sword.position.set(0.45, 2.2, 0);
      g.add(sword);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), mat(0xe03131));
      shield.position.set(-0.4, 1.7, 0.1);
      g.add(shield);
      const gem = gemMesh(0x3bc9ff, 1.3);
      gem.position.set(0, 3.3, 0);
      g.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:sereia`, new THREE.Vector3(at.x, 0, at.z + 2.5), gem));
      things.push({
        object: g,
        position: new THREE.Vector3(at.x, 0, at.z),
        radius: 3,
        interact() {
          [392, 494, 587, 659].forEach((f, i) => tone(f, i * 0.35, 0.4, 'sine', 0.06));
          ctx.say(['A sereia canta na praça!']);
        },
      });
    }

    // 6) Castelo Real — silhueta reconhecível + torreão com subida divertida
    {
      const at = takeSpot(world, obstacles, rng, 11, 9, WARSAW_PREFS.castelo, 6);
      used.castelo = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      scene.add(g);
      const fw = new Fireworks(scene);
      const red = mat(0xc92a2a);
      const cream = mat(0xf8f9fa);
      const roofDark = mat(0x343a40);
      const gold = mat(0xffd43b);

      // forecourt plaza (reads as a castle grounds, not a pool deck)
      const yard = new THREE.Mesh(new THREE.BoxGeometry(20, 0.08, 14), mat(0xe9ecef));
      yard.position.set(0, 0.04, 2);
      g.add(yard);

      // main keep — wider, with white cornice and windows (Royal Castle feel)
      const keep = new THREE.Mesh(new THREE.BoxGeometry(14, 6.2, 9), red);
      keep.position.y = 3.1;
      keep.castShadow = true;
      g.add(keep);
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.45, 9.6), cream);
      cornice.position.y = 6.4;
      g.add(cornice);
      for (const [wx, wy] of [
        [-4, 3.5],
        [0, 3.5],
        [4, 3.5],
        [-4, 5.2],
        [0, 5.2],
        [4, 5.2],
      ] as const) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.12), mat(0xffe066));
        win.position.set(wx, wy, 4.55);
        g.add(win);
      }
      // battlements along the front
      for (let i = -6; i <= 6; i += 2) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.5), red);
        merlon.position.set(i, 7.0, 4.3);
        g.add(merlon);
      }

      // corner towers
      const flags: THREE.Object3D[] = [];
      for (const [tx, tz] of [
        [-6.2, -3.8],
        [6.2, -3.8],
        [-6.2, 3.8],
        [6.2, 3.8],
      ] as const) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 9, 12), red);
        tower.position.set(tx, 4.5, tz);
        tower.castShadow = true;
        g.add(tower);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.35, 12), cream);
        band.position.set(tx, 7.2, tz);
        g.add(band);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.6, 10), roofDark);
        tip.position.set(tx, 10.2, tz);
        g.add(tip);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), cream);
        pole.position.set(tx, 11.7, tz);
        g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          emissive: 0xdc143c,
          emissiveIntensity: 0.25,
        }));
        flag.position.set(tx + 0.55, 11.9, tz);
        flag.userData.baseX = tx + 0.55;
        g.add(flag);
        flags.push(flag);
      }

      // taller climbable torreão (front-right): balcony IS the landing the stairs reach
      const tx = 5.2;
      const tz = 3.6;
      const balconyY = 7.15; // flush with keep cornice / battlement walk — a real roof terrace
      const keepTower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, balconyY + 1.2, 14), red);
      keepTower.position.set(tx, (balconyY + 1.2) / 2, tz);
      keepTower.castShadow = true;
      g.add(keepTower);
      // square terrace on the keep roof, fused with the torreão (not a floating disc)
      const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.28, 4.2), cream);
      roofDeck.position.set(tx - 1.2, balconyY, tz - 0.2);
      g.add(roofDeck);
      const balcony = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.28, 14), cream);
      balcony.position.set(tx, balconyY, tz);
      g.add(balcony);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), cream);
        post.position.set(tx + Math.cos(a) * 2.3, balconyY + 0.5, tz + Math.sin(a) * 2.3);
        g.add(post);
      }
      // rail along the keep roof edge
      for (const [rx, rz, sx, sz] of [
        [tx - 3.8, tz - 0.2, 0.14, 4.0],
        [tx - 1.2, tz - 2.2, 5.3, 0.14],
      ] as const) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.7, sz), cream);
        rail.position.set(rx, balconyY + 0.45, rz);
        g.add(rail);
      }
      const keepTip = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.0, 10), roofDark);
      keepTip.position.set(tx, balconyY + 2.8, tz);
      g.add(keepTip);
      const tipPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), gold);
      tipPole.position.set(tx, balconyY + 4.6, tz);
      g.add(tipPole);
      const tipFlag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.85),
        new THREE.MeshStandardMaterial({ color: 0xdc143c, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.15 }),
      );
      tipFlag.position.set(tx + 0.7, balconyY + 4.8, tz);
      g.add(tipFlag);
      flags.push(tipFlag);

      // solid straight stair from the yard up onto the torreão terrace (meshes === climb path)
      const stairN = 10;
      const rise = balconyY / stairN;
      const run = 0.62;
      const climbSteps: THREE.Vector3[] = [];
      for (let i = 0; i < stairN; i++) {
        const y = (i + 1) * rise;
        const zLocal = tz + 2.6 + (stairN - 1 - i) * run;
        const xLocal = tx;
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, rise * 0.92, run * 0.95), cream);
        step.position.set(xLocal, y - rise * 0.5, zLocal);
        g.add(step);
        const sideH = Math.max(0.5, y + 0.35);
        for (const sx of [-1.35, 1.35]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, sideH, run * 0.95), mat(0xa61e1e));
          side.position.set(xLocal + sx, sideH / 2, zLocal);
          g.add(side);
        }
        climbSteps.push(new THREE.Vector3(at.x + xLocal, y, at.z + zLocal));
      }
      // last tread onto the balcony centre
      climbSteps.push(new THREE.Vector3(at.x + tx, balconyY + 0.2, at.z + tz + 1.2));

      // gate with crest
      const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.35), mat(0x5c4033));
      gate.position.set(0, 1.8, 4.6);
      g.add(gate);
      const crest = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), gold);
      crest.position.set(0, 4.2, 4.85);
      g.add(crest);

      const gem = gemMesh(0xffe14d, 1.55);
      gem.position.set(tx, balconyY + 0.85, tz);
      g.add(gem);

      const foot = new THREE.Vector3(at.x + tx, 0, at.z + tz + 2.6 + stairN * run + 0.5);
      const lookout = new THREE.Vector3(at.x + tx, balconyY + 0.2, at.z + tz);
      things.push(
        towerClimb({
          ctx,
          object: g,
          foot,
          top: lookout,
          steps: climbSteps,
          gem,
          gemKey: `gem:${city}:castelo`,
          fireworks: fw,
          flags,
          sayTop: ['No torreão do castelo!'],
          sayGem: ['Uma joia do ex-líbris! Guarda-a para a Lua!'],
          interactAt: foot,
          radius: 5.5,
        }),
      );
    }

    landmarkDebug = { spots: used, prefs: { ...WARSAW_PREFS }, count: 6 };
    return things;
  },

  Pequim(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 8);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // stylised wall walkway (I87)
    const stone = mat(0xc2a07a);
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.6), stone);
      seg.position.set(i * 2.0 - 7, 0.6 + Math.sin(i * 0.6) * 0.4, Math.sin(i * 0.4) * 1.5);
      g.add(seg);
      const batt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), stone);
      batt.position.set(seg.position.x, seg.position.y + 0.85, seg.position.z - 0.5);
      g.add(batt);
    }
    const gong = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 20), mat(0xffd43b));
    gong.rotation.x = Math.PI / 2;
    gong.position.set(0, 2.2, 2);
    g.add(gong);
    obstacles.push({ minX: at.x - 9, maxX: at.x + 9, minZ: at.z - 3, maxZ: at.z + 3, height: 1.8 });
    const gem = gemMesh(0xffe14d, 1.3);
    gem.position.set(0, 2.8, 0);
    g.add(gem);
    const things = [diamondAt(ctx, `gem:${ctx.city()}:muralha`, new THREE.Vector3(at.x, 0, at.z + 3), gem)];
    things.push({
      object: gong,
      position: new THREE.Vector3(at.x, 0, at.z + 2),
      radius: 2.5,
      interact() {
        tone(120, 0, 1.5, 'sine', 0.12);
        tone(90, 0.2, 1.2, 'sine', 0.08);
        ctx.say(['O gongo!']);
      },
    });
    return things;
  },

  'Rio de Janeiro'(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 5);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // cable-car peak + street musicians (I88)
    const rock = mat(0x868e96);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), rock);
    peak.position.y = 3;
    g.add(peak);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9), mat(0xffe066));
    cabin.position.set(-4, 4, 0);
    g.add(cabin);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 6), mat(0x495057));
    cable.rotation.z = Math.PI / 2;
    cable.position.set(-2, 5, 0);
    g.add(cable);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.0, 10), mat(0xe03131));
      m.position.set(-1 + i * 0.9, 0.5, 2.5);
      g.add(m);
    }
    obstacles.push({ minX: at.x - 4, maxX: at.x + 3, minZ: at.z - 3, maxZ: at.z + 3, height: 2 });
    const gem = gemMesh(0xff3b7f, 1.3);
    gem.position.set(0, 6.5, 0);
    g.add(gem);
    const things = [diamondAt(ctx, `gem:${ctx.city()}:pao`, new THREE.Vector3(at.x, 0, at.z + 3), gem)];
    things.push({
      object: g,
      position: new THREE.Vector3(at.x, 0, at.z + 2.5),
      radius: 3,
      interact() {
        [262, 294, 330, 349, 392].forEach((f, i) => tone(f, i * 0.18, 0.2, 'triangle', 0.05));
        ctx.say(['Samba! Dança com os músicos!']);
      },
    });
    return things;
  },

  Tóquio(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 4);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // temple gate + bell
    const red = mat(0xe03131);
    boxish(g, red, 0.4, 4, 0.4, -2, 2, 0);
    boxish(g, red, 0.4, 4, 0.4, 2, 2, 0);
    boxish(g, red, 5, 0.4, 0.6, 0, 4.2, 0);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(0xffd43b));
    bell.position.set(0, 3.2, 0);
    g.add(bell);
    // cherry petals
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), mat(0xffc9c9));
      p.position.set((rng() - 0.5) * 8, 1 + rng() * 4, (rng() - 0.5) * 8);
      p.rotation.x = -Math.PI / 2;
      g.add(p);
    }
    obstacles.push({ minX: at.x - 2.5, maxX: at.x + 2.5, minZ: at.z - 1.5, maxZ: at.z + 1.5 });
    const gem = gemMesh(0xffc9c9, 1.2);
    gem.position.set(0, 4.8, 0);
    g.add(gem);
    const things = [diamondAt(ctx, `gem:${ctx.city()}:templo`, new THREE.Vector3(at.x, 0, at.z + 2), gem)];
    things.push({
      object: bell,
      position: at.clone(),
      radius: 2.5,
      interact() {
        tone(180, 0, 1.2, 'sine', 0.1);
        tone(220, 0.3, 1.0, 'sine', 0.08);
        ctx.say(['O sino do templo!']);
      },
    });
    return things;
  },

  Nuuk(scene, obstacles, rng, ctx, world) {
    const at = place(obstacles, rng, 5);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    // sled + dogs
    const sled = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.7), mat(0x8d5a3b));
    sled.position.y = 0.25;
    g.add(sled);
    for (let i = 0; i < 3; i++) {
      const dog = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), mat(0xf8f9fa));
      dog.position.set(-1.5 - i * 0.9, 0.35, (i % 2) * 0.4 - 0.2);
      g.add(dog);
    }
    obstacles.push({ minX: at.x - 4, maxX: at.x + 2, minZ: at.z - 1.5, maxZ: at.z + 1.5, height: 0.8 });
    const gem = gemMesh(0x74c0fc, 1.2);
    gem.position.set(0, 1.2, 0);
    g.add(gem);
    // aurora ribbons (night glow)
    const aurora = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 6),
      new THREE.MeshBasicMaterial({ color: 0x69db7c, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    aurora.position.set(0, 18, -10);
    aurora.rotation.x = -0.3;
    g.add(aurora);
    void world;
    return [diamondAt(ctx, `gem:${ctx.city()}:aurora`, at.clone(), gem)];
  },
};

/** Low-poly peacock: blue body + neck, fan of eye-spotted tail — readable for 7–8. */
function peacockAt(x: number, z: number, yaw: number): THREE.Group {
  const bird = new THREE.Group();
  bird.position.set(x, 0, z);
  bird.rotation.y = yaw;
  const teal = mat(0x0c8599);
  const blue = mat(0x1864ab);
  const green = mat(0x2f9e44);
  const gold = mat(0xffd43b);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), teal);
  body.scale.set(1, 0.85, 1.35);
  body.position.set(0, 0.55, 0);
  body.castShadow = true;
  bird.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.55, 8), blue);
  neck.position.set(0, 0.95, 0.22);
  neck.rotation.x = -0.55;
  bird.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), blue);
  head.position.set(0, 1.22, 0.38);
  bird.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), gold);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.2, 0.5);
  bird.add(beak);
  for (const sx of [-0.04, 0.04] as const) {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 5), mat(0x37b24d));
    crest.position.set(sx, 1.34, 0.38);
    bird.add(crest);
  }
  for (const sx of [-0.08, 0.08] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6), mat(0xf08c00));
    leg.position.set(sx, 0.2, 0.05);
    bird.add(leg);
  }
  // fan of 7 feathers with eye spots
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.28;
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 1.1), green);
    feather.position.set(Math.sin(a) * 0.35, 0.75 + Math.abs(i) * 0.04, -0.55);
    feather.rotation.y = a;
    feather.rotation.x = -0.55;
    bird.add(feather);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), i % 2 === 0 ? gold : blue);
    eye.position.set(Math.sin(a) * 0.55, 0.95 + Math.abs(i) * 0.05, -1.0);
    bird.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), mat(0x212529));
    pupil.position.copy(eye.position);
    pupil.position.z -= 0.02;
    bird.add(pupil);
  }
  return bird;
}

function boxish(g: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
}

/** Default landmark: an obelisk monument with a diamond, for cities without a custom builder yet. */
function defaultLandmark(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx): Interactable[] {
  const at = place(obstacles, rng, 3);
  const g = new THREE.Group();
  g.position.copy(at);
  scene.add(g);
  const stone = mat(0xadb5bd);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.4), stone);
  plinth.position.y = 0.35;
  g.add(plinth);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), mat(0xe9ecef));
  shaft.position.y = 2.8;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.1, 4), mat(0xffd43b));
  tip.position.y = 5.5;
  tip.rotation.y = Math.PI / 4;
  g.add(tip);
  obstacles.push({ minX: at.x - 1.4, maxX: at.x + 1.4, minZ: at.z - 1.4, maxZ: at.z + 1.4 });
  const gem = gemMesh(undefined, 1.2);
  gem.position.set(0, 6.3, 0);
  g.add(gem);
  return [diamondAt(ctx, `gem:${ctx.city()}:exlibris`, new THREE.Vector3(at.x, 0, at.z + 2), gem)];
}

export function createLandmarks(scene: THREE.Scene, obstacles: Obstacle[], seed: number, ctx: GameCtx, world: World): Interactable[] {
  landmarkDebug = null;
  if (ctx.city() === 'Estados Unidos' || ctx.city() === 'Lua') return []; // USA has usa.ts; Moon has none
  let s = (seed * 61 + 7) >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const build = BY_CITY[ctx.city()];
  return build ? build(scene, obstacles, rng, ctx, world) : defaultLandmark(scene, obstacles, rng, ctx);
}
