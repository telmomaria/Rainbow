import * as THREE from 'three';
import { flagTexture } from './flags';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import { FIREWORK_COLORS, Fireworks } from './fireworks';
import type { GameCtx } from './gamectx';
import { buildMexico } from './landmarks-mexico';
import { buildMoscovo } from './landmarks-moscovo';
import { buildRio } from './landmarks-rio';
import { gemMesh, mat, openSpot } from './places';
import { inNoSpawn } from './spawn';
import { onRoad, ROADS, SPAWN, type Interactable, type Obstacle, type World } from './world';

/**
 * Fase 5 — ex-líbris por cidade (I81–I90 style): landmark diamonds (never spent — for the Moon).
 * Cities with builders: Porto, Roma, Londres, Paris, Varsóvia (six), Pequim, Tóquio, Rio de Janeiro (landmarks-rio.ts), Moscovo (landmarks-moscovo.ts).
 * Cidade do México: landmarks-mexico.ts (Teotihuacán, Tula, Casa Azul, bandeirinhas, crianças).
 * No landmark (empty builders — no fake obelisk): Madrid, Vilnius, Reiquiavique, Nuuk.
 * EUA / Lua: handled elsewhere (usa.ts / none). Missing BY_CITY keys return [] (no default monument).
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

/** Mid-ride cleanup (e.g. Rio teleférico hold) — cleared when landmarks rebuild / city changes. */
let landmarkRideDispose: (() => void) | null = null;
function clearLandmarkRide(): void {
  landmarkRideDispose?.();
  landmarkRideDispose = null;
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
      ctx.say(['Uma joia do ex-líbris! Guarda-a bem!']);
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

/** Last `place()` centre — used so ?debug can find single-attraction cities (Roma, Paris…). */
let lastPlaceSpot: { x: number; z: number } | null = null;
function readLastPlaceSpot(): { x: number; z: number } | null {
  return lastPlaceSpot;
}

function place(obstacles: Obstacle[], rng: () => number, r: number): THREE.Vector3 {
  const at = resolveSpot(obstacles, rng, r, r);
  lastPlaceSpot = { x: at.x, z: at.z };
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
/** `turn` = drag / ←→ turn the shot (tower tops; main.ts). */
type VistaCam = { x: number; z: number; h: number; fromX?: number; fromZ?: number; lookY?: number; turn?: boolean };
function setVista(vista: VistaCam | null): void {
  window.dispatchEvent(new CustomEvent('rainbow-aerial', { detail: vista }));
}

/**
 * Climb real stairs to a real landing (roof / torreão terrace). Legs walk via ctx.walkAnim —
 * never a Y-only elevator. Top reward is honest: jewel + flags/fireworks; «vista» only when
 * `vista` is set (soft aerial over the city — sayTop is spoken after the camera switches).
 */
/** The climb she is on right now. With two climbs in one city (Varsóvia), the idle one's
 *  "stray height → back to the ground" safety net must not pull her off the other one's landing. */
let activeClimb: object | null = null;

export function towerClimb(opts: {
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
  let stepArmed = false; // on the landing: she stood still since arriving / taking the jewel
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

  const me = {};
  const finishGround = () => {
    if (activeClimb === me) activeClimb = null;
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

  const startDown = () => {
    phase = 'down';
    t = 0;
    if (opts.vista) setVista(null);
    prox.set(foot.x, 0, foot.z);
    ctx.hold(true);
    ctx.walkAnim(WALK, downPath[1]?.x ?? foot.x, downPath[1]?.z ?? foot.z);
    tone(392, 0, 0.1, 'triangle', 0.04);
  };

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
        activeClimb = me;
        t = 0;
        ctx.hold(true);
        ctx.walkAnim(WALK, climbPath[1]?.x ?? top.x, climbPath[1]?.z ?? top.z);
        tone(523, 0, 0.1, 'triangle', 0.04);
        return true;
      }
      // on the landing: first tap takes the jewel; next tap walks down
      if (!gemTaken() && takeGem()) return true;
      startDown();
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
        if (ctx.player.y > 0.4 && activeClimb === null) {
          const dTop = Math.hypot(ctx.player.x - top.x, ctx.player.z - top.z);
          const dFoot = Math.hypot(ctx.player.x - foot.x, ctx.player.z - foot.z);
          if (dTop > 5 && dFoot > 4) ctx.player.y = 0;
        }
        return;
      }
      if (phase === 'top') {
        prox.set(top.x, 0, top.z);
        // she tried to walk off the landing (↑/↓, or a tap on the ground below): first the jewel beside her,
        // then down the stairs (Telmo, 2026-11-21: "sem descer"). ←/→ only turn her/the view — no step.
        // A step counts once she has stood still for a frame since arriving / taking the jewel (so a key still held
        // doesn't do both at once), or after 1.2 s of trying (a tap on the ground keeps her "walking").
        const moved = Math.hypot(ctx.player.x - top.x, ctx.player.z - top.z) > 0.02;
        if (!moved) stepArmed = true;
        else if ((stepArmed || topT > 1.2) && !ctx.isPaused()) {
          ctx.player.set(top.x, top.y, top.z);
          stepArmed = false;
          if (!gemTaken() && takeGem()) {
            topT = 0;
            return;
          }
          startDown();
          return;
        }
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
        stepArmed = false;
        topT = 0;
        gemHint = false;
        prox.set(top.x, 0, top.z);
        ctx.player.set(top.x, top.y, top.z);
        ctx.walkAnim(0);
        ctx.hold(false);
        // vista first so sayTop is honest («vista» only when the camera shows the city)
        if (opts.vista) setVista({ ...opts.vista, turn: true });
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

/**
 * Porto Clérigos — near the city centre (Telmo, 2026-11-22: from the old far-SW corner the top showed the
 * edge of the ground). Fallback preference only; pickClerigosSpot() chooses the real plot.
 */
const PORTO_CLERIGOS = { x: -32, z: -19 } as const;

/**
 * Plot ≤ 55 m from the centre for the Clérigos (closest first, a street nearby), stair side facing that street
 * (f = 1: plot south of the street, stairs on +Z; f = −1: plot north of it, tower turned 180°).
 * Placeholder buildings don't count (claimSpot clears them); every real thing (venues, shops, props,
 * lamps…) does. Kept ≥ 24 m from SPAWN so it never covers the start.
 */
function pickClerigosSpot(
  world: World,
  obstacles: Obstacle[],
  hw: number,
  hd: number,
): { x: number; z: number; f: 1 | -1 } | null {
  const solid = obstacles.filter((o) => !world.buildings.has(o));
  const cands: { x: number; z: number; f: 1 | -1; score: number }[] = [];
  for (let x = -54; x <= 54; x += 2) {
    for (let z = -54; z <= 54; z += 1.5) {
      const d = Math.hypot(x, z);
      if (d > 55) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 24) continue;
      // the nearest street along X: the stairs (+Z when f = 1) turn towards it
      let best = Infinity;
      let f: 1 | -1 = 1;
      for (const rz of ROADS.zs) {
        const gap = Math.abs(rz - z) - hd - ROADS.width / 2; // free strip between footprint and road edge
        if (gap < 0) continue;
        if (gap < best) {
          best = gap;
          f = rz > z ? 1 : -1;
        }
      }
      if (best > 30) continue;
      cands.push({ x, z, f, score: d + best * 0.8 });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  for (const c of cands) if (footprintFree(solid, c, hw, hd)) return { x: c.x, z: c.z, f: c.f };
  return null;
}

const BY_CITY: Record<string, Builder> = {
  /**
   * Torre dos Clérigos — tall baroque granite silhouette (church + slender tower + cupola),
   * visible stairs hugging the shaft, lookout vista + jewel. Not a generic cylinder.
   */
  Porto(scene, obstacles, rng, ctx, world) {
    // footprint hugs the tower (stairs wrap close); margin ≥4 m via takeSpot/clearArea
    const near = pickClerigosSpot(world, obstacles, 7, 8);
    const at = near ?? { ...resolveSpot(obstacles, rng, 7, 8, PORTO_CLERIGOS), f: 1 as const };
    claimSpot(world, at, 7, 8, 30);
    const f = at.f; // 1 = stairs on +Z; −1 = tower turned 180° (stairs on −Z)
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z);
    g.rotation.y = f === 1 ? 0 : Math.PI;
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
      climbSteps.push(new THREE.Vector3(at.x + f * sx, y + 0.16, at.z + f * sz));
    }
    climbSteps.push(new THREE.Vector3(at.x, balconyY + 0.2, at.z + f * (tz + 1.5)));

    const gem = gemMesh(0x3bc9ff, 1.5);
    gem.position.set(0, balconyY + 0.9, tz);
    g.add(gem);

    const footA = Math.PI / 2;
    const foot = new THREE.Vector3(
      at.x + f * Math.cos(footA) * (stairR + 0.9),
      0,
      at.z + f * (tz + Math.sin(footA) * (stairR + 0.9)),
    );
    const lookout = new THREE.Vector3(at.x, balconyY + 0.2, at.z + f * tz);
    // the view FROM the top (Telmo, 2026-11-21: the old aerial looked down with the tower itself in the picture):
    // camera just above the balcony, on the side facing the city centre, looking out over the rooftops
    const tx = at.x;
    const tzW = at.z + f * tz;
    const toC = Math.hypot(tx, tzW) > 1 ? new THREE.Vector2(-tx, -tzW).normalize() : new THREE.Vector2(0, 1);
    const vista: VistaCam = {
      fromX: tx + toC.x * 1.6,
      fromZ: tzW + toC.y * 1.6,
      h: balconyY + 2.4,
      x: tx + toC.x * 75,
      z: tzW + toC.y * 75,
      lookY: 2,
    };

    landmarkDebug = { spots: { clerigos: { x: at.x, z: at.z } }, facing: f, prefs: { clerigos: { ...PORTO_CLERIGOS } }, count: 1, foot: { x: foot.x, z: foot.z } };

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
        sayGem: ['Uma joia do ex-líbris! Guarda-a bem!'],
        interactAt: foot,
        radius: 5,
        vista,
      }),
    ];
  },

  /**
   * Roma — Fonte de Trevi (estilizada, original / low-poly):
   * fachada de palácio com colunas e frontão, rochas + estátua central + cavalos,
   * cascata em degraus e bacia semicircular à frente. Praça aberta: só a fachada/rochas
   * bloqueiam; dá para chegar à beira da água. Moeda = desejo; joia no rebordo.
   */
  Roma(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 9);
    const g = new THREE.Group();
    g.position.copy(at);
    g.userData.landmark = 'trevi';
    scene.add(g);

    const stone = mat(0xe9e4da);
    const stoneDeep = mat(0xc8bfb0);
    const stoneWarm = mat(0xd8d0c4);
    const marble = mat(0xf8f5ef);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x339af0,
      metalness: 0.45,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92,
    });
    const cascadeMat = new THREE.MeshStandardMaterial({
      color: 0x74c0fc,
      metalness: 0.35,
      roughness: 0.25,
      emissive: 0x1c7ed6,
      emissiveIntensity: 0.18,
    });
    const foam = mat(0xe7f5ff);

    const add = (mesh: THREE.Mesh, x: number, y: number, z: number, cast = true) => {
      mesh.position.set(x, y, z);
      if (cast) mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };

    // —— Palace facade (behind, faces +Z) ——
    const facadeZ = -5.4;
    add(new THREE.Mesh(new THREE.BoxGeometry(16.5, 9.0, 1.8), stone), 0, 4.5, facadeZ);
    // attic / cornice bands
    add(new THREE.Mesh(new THREE.BoxGeometry(17.2, 0.45, 2.2), stoneDeep), 0, 8.9, facadeZ);
    add(new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.35, 2.0), stoneWarm), 0, 9.3, facadeZ);
    // triangular pediment (stacked slabs → kid-readable triangle)
    add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 1.6), stoneWarm), 0, 9.75, facadeZ - 0.05);
    add(new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 1.5), stoneWarm), 0, 10.25, facadeZ - 0.05);
    add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.4), stoneWarm), 0, 10.75, facadeZ - 0.05);
    // side wings forward
    for (const sx of [-7.0, 7.0]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 7.2, 1.4), stoneDeep), sx, 3.6, facadeZ + 0.7);
      // tiny balcony ledge
      add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.7), stoneWarm), sx, 5.2, facadeZ + 1.35, false);
    }
    // columns + capitals (skip centre for niche)
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const x = i * 1.95;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.2, 8), marble), x, 3.7, facadeZ + 1.05);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 0.78), stoneDeep), x, 6.9, facadeZ + 1.05, false);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.24, 0.82), stoneDeep), x, 0.55, facadeZ + 1.05, false);
    }
    // central niche recess + arched top (half-cylinder along X)
    add(new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.8, 1.0), stoneDeep), 0, 3.7, facadeZ + 0.4, false);
    const arch = add(
      new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 1.0, 14, 1, false, 0, Math.PI), stoneDeep),
      0,
      6.6,
      facadeZ + 0.4,
      false,
    );
    arch.rotation.z = Math.PI / 2;
    // side niches with small statues
    for (const sx of [-5.0, 5.0]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 0.55), stoneWarm), sx, 3.5, facadeZ + 0.85, false);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.6, 7), marble), sx, 2.9, facadeZ + 1.1);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), marble), sx, 4.35, facadeZ + 1.1, false);
    }
    // window panels between columns (palace read)
    for (const x of [-2.9, 2.9, -4.9, 4.9]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.12), mat(0xadb5bd)), x, 5.4, facadeZ + 0.95, false);
    }

    // —— Rocky cliff shelf in front of facade ——
    for (const [rx, ry, rz, sx, sy, sz] of [
      [0, 1.35, -3.3, 11.5, 2.7, 3.6],
      [-3.8, 2.0, -2.3, 3.8, 2.2, 2.8],
      [3.8, 1.9, -2.4, 3.6, 2.0, 2.6],
      [-1.4, 2.7, -3.7, 2.8, 1.7, 2.0],
      [1.5, 2.55, -3.6, 2.6, 1.5, 1.9],
      [0, 0.7, -1.2, 9.5, 1.4, 2.4],
      [-5.5, 1.3, -2.8, 2.2, 1.5, 2.0],
      [5.5, 1.25, -2.8, 2.2, 1.4, 2.0],
    ] as const) {
      add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), stoneDeep), rx, ry, rz);
    }

    // —— Cascading water steps (bright blue sheets + thin foam lips) ——
    for (let i = 0; i < 5; i++) {
      const z = -1.8 + i * 0.75;
      const y = 1.7 - i * 0.32;
      const w = 8.2 - i * 0.55;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, 0.85), cascadeMat), 0, y, z, false);
      add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.1, 0.22), foam), 0, y + 0.2, z + 0.35, false);
    }
    // vertical falls from rock face
    for (const fx of [-1.6, 0, 1.6]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.2), cascadeMat), fx, 2.4, -2.55, false);
    }

    // —— Central figure (statue-ish) ——
    const figure = new THREE.Group();
    figure.position.set(0, 3.05, -2.65);
    g.add(figure);
    const figBody = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 2.6, 10), marble);
    figBody.position.y = 1.4;
    figBody.castShadow = true;
    figure.add(figBody);
    const figShoulder = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.55), marble);
    figShoulder.position.y = 2.55;
    figure.add(figShoulder);
    const figHead = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), marble);
    figHead.position.y = 3.2;
    figHead.castShadow = true;
    figure.add(figHead);
    const cloak = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 0.22), stoneWarm);
    cloak.position.set(0, 1.6, -0.4);
    figure.add(cloak);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.55, 6), marble);
    arm.position.set(0.9, 2.4, 0.2);
    arm.rotation.z = -0.75;
    figure.add(arm);
    // staff / trident feel
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), marble);
    staff.position.set(1.35, 3.0, 0.35);
    staff.rotation.z = -0.25;
    figure.add(staff);

    // —— Flanking horses (larger, clearer silhouettes) ——
    const horse = (x: number, z: number, face: 1 | -1) => {
      const h = new THREE.Group();
      h.position.set(x, 2.55, z);
      h.scale.set(face * 1.35, 1.35, 1.35);
      g.add(h);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.55), marble);
      body.position.set(0, 0.65, 0);
      body.castShadow = true;
      h.add(body);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.95, 0.38), marble);
      neck.position.set(0.65, 1.3, 0);
      neck.rotation.z = -0.5;
      h.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.36, 0.32), marble);
      head.position.set(1.15, 1.65, 0);
      h.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.24), marble);
      snout.position.set(1.55, 1.55, 0);
      h.add(snout);
      for (const [lx, lz] of [
        [-0.5, 0.2],
        [-0.5, -0.2],
        [0.45, 0.2],
        [0.45, -0.2],
      ] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.85, 5), marble);
        leg.position.set(lx, 0.05, lz);
        h.add(leg);
      }
      const mane = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.28), stoneWarm);
      mane.position.set(0.5, 1.4, -0.22);
      h.add(mane);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.18), stoneWarm);
      tail.position.set(-0.95, 0.75, -0.05);
      tail.rotation.z = 0.4;
      h.add(tail);
    };
    horse(-3.6, -2.0, 1);
    horse(3.6, -2.0, -1);

    // —— Wide semicircular basin in front (plaza stays open) ——
    const basinZ = 2.8;
    add(new THREE.Mesh(new THREE.BoxGeometry(14.2, 0.4, 6.6), stoneDeep), 0, 0.2, basinZ, false);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.28, 28, 1, false, -Math.PI / 2, Math.PI), waterMat);
    pool.position.set(0, 0.48, basinZ - 0.35);
    pool.receiveShadow = true;
    g.add(pool);
    add(new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.26, 3.5), waterMat), 0, 0.48, 0.7, false);
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI;
      const rx = Math.sin(a) * 6.9;
      const rz = basinZ - 0.35 + Math.cos(a) * 6.9;
      const rim = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.5), stone), rx, 0.5, rz, false);
      rim.rotation.y = -a;
    }
    for (const sx of [-6.8, 6.8]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 5.8), stone), sx, 0.5, 1.5, false);
    }

    // —— Fountain jets (pulse in update) ——
    const jets: THREE.Mesh[] = [];
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0xe7f5ff,
      emissive: 0x4dabf7,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.9,
    });
    for (const [jx, jz, h, phase] of [
      [0, -1.1, 2.2, 0],
      [-2.4, -0.3, 1.5, 1.1],
      [2.4, -0.3, 1.5, 2.2],
      [-1.2, 1.9, 1.15, 0.5],
      [1.2, 1.9, 1.15, 1.7],
      [0, 3.8, 1.4, 0.9],
      [-3.5, 1.0, 0.95, 2.8],
      [3.5, 1.0, 0.95, 3.4],
    ] as const) {
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1, 6), jetMat);
      jet.position.set(jx, 0.6 + h / 2, jz);
      jet.scale.y = h;
      jet.userData.baseH = h;
      jet.userData.phase = phase;
      g.add(jet);
      jets.push(jet);
      const splash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), foam);
      splash.position.set(jx, 0.6 + h + 0.08, jz);
      g.add(splash);
      jet.userData.splash = splash;
    }

    // Collision hugs what is built: facade (+ wings/columns), then rocks + side walls + front pool,
    // then the semicircular basin as thin slices up to the rim. Water stays unenterable; the plaza
    // around the rim and the sides of the facade stay walkable.
    const block = (minX: number, maxX: number, minZ: number, maxZ: number, height: number) =>
      obstacles.push({ minX: at.x + minX, maxX: at.x + maxX, minZ: at.z + minZ, maxZ: at.z + maxZ, height });
    block(-8.3, 8.3, facadeZ - 0.9, -3.95, 11); // facade, wings, column bases
    const poolC = basinZ - 0.35; // centre of the semicircle
    block(-7.1, 7.1, -3.95, poolC, 7); // rocks, statue, horses, side walls, front pool
    const RIM = 7.0; // rim boxes sit at r 6.9 (water r 6.6)
    const SLICES = 10;
    for (let i = 0; i < SLICES; i++) {
      const z0 = (i / SLICES) * RIM;
      const z1 = ((i + 1) / SLICES) * RIM;
      const zm = (z0 + z1) / 2;
      const hw = Math.sqrt(RIM * RIM - zm * zm);
      block(-hw, hw, poolC + z0, poolC + z1, 0.8);
    }

    const gem = gemMesh(0xffe14d, 1.3);
    gem.position.set(5.95, 1.05, 5.95); // on the rim (not in the water — the basin is blocked)
    g.add(gem);

    let jetT = 0;
    const things: Interactable[] = [
      diamondAt(ctx, `gem:${ctx.city()}:trevi`, new THREE.Vector3(at.x + 5.95, 0, at.z + 5.95), gem),
      {
        object: g,
        position: new THREE.Vector3(at.x, 0, at.z + 5.6),
        radius: 5.8,
        interact() {
          if (ctx.coins() < 1) {
            ctx.say(['A fonte!', 'Precisas de uma moeda para o desejo!']);
            return;
          }
          ctx.addCoins(-1);
          tone(1200, 0, 0.15, 'sine', 0.05);
          ctx.say(['Fonte de Trevi!', 'Faz um desejo!']);
        },
        update(dt) {
          jetT += dt;
          for (const jet of jets) {
            const base = jet.userData.baseH as number;
            const pulse = 0.88 + Math.sin(jetT * 5 + (jet.userData.phase as number)) * 0.14;
            jet.scale.y = base * pulse;
            jet.position.y = 0.55 + (base * pulse) / 2;
            const splash = jet.userData.splash as THREE.Mesh | undefined;
            if (splash) splash.position.y = 0.55 + base * pulse + 0.08;
          }
        },
      },
    ];
    landmarkDebug = { spots: { trevi: { x: at.x, z: at.z }, main: { x: at.x, z: at.z } }, count: 1 };
    return things;
  },

  /**
   * Paris — torre de ferro (estilo Eiffel, original / sem marca):
   * base bem larga + 4 arcos abertos, 1.º e 2.º andar, treliça em X, agulha com farol.
   * Obstáculos só nas pernas → dá para passar por baixo / à volta.
   */
  Paris(scene, obstacles, rng, ctx) {
    const at = place(obstacles, rng, 11);
    const g = new THREE.Group();
    g.position.copy(at);
    g.userData.landmark = 'torre';
    scene.add(g);

    const iron = mat(0x495057);
    const ironLite = mat(0x868e96);
    const ironDark = mat(0x343a40);

    /** Barra entre dois pontos (caixa orientada ao longo de Z local). */
    const zAxis = new THREE.Vector3(0, 0, 1);
    const barDir = new THREE.Vector3();
    const bar = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      thick: number,
      m: THREE.Material = iron,
    ) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz) || 0.01;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      barDir.set(dx, dy, dz).normalize();
      mesh.quaternion.setFromUnitVectors(zAxis, barDir);
      mesh.castShadow = true;
      g.add(mesh);
    };

    const xBrace = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      cx: number,
      cy: number,
      cz: number,
      dx: number,
      dy: number,
      dz: number,
      thick = 0.12,
    ) => {
      bar(ax, ay, az, cx, cy, cz, thick, ironLite);
      bar(bx, by, bz, dx, dy, dz, thick, ironLite);
    };

    // Kid-readable A-frame: wide feet → open arch voids → platforms → needle (~26 m)
    const y1 = 8.2;
    const y2 = 14.0;
    const yNeedle = 22.5;
    const yTip = 26.8;
    const baseOut = 8.6; // half-span at ground — wide A silhouette
    const mid1 = 3.1;
    const mid2 = 1.35;
    const tipIn = 0.25;

    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];

    /** Radius along lower leg: stays wide longer, then tapers (concave Eiffel curve). */
    const legR = (t: number) => baseOut + (mid1 - baseOut) * Math.pow(Math.min(1, Math.max(0, t)), 0.55);

    // —— 4 curved spreading legs (segmented) + feet ——
    const LEG_SEGS = 5;
    for (const [sx, sz] of corners) {
      for (let i = 0; i < LEG_SEGS; i++) {
        const t0 = i / LEG_SEGS;
        const t1 = (i + 1) / LEG_SEGS;
        const thick = 0.78 - i * 0.05;
        bar(sx * legR(t0), 0.2 + y1 * t0, sz * legR(t0), sx * legR(t1), 0.2 + y1 * t1, sz * legR(t1), thick, iron);
      }
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.7), ironDark);
      foot.position.set(sx * baseOut, 0.22, sz * baseOut);
      foot.castShadow = true;
      g.add(foot);
    }

    // Face ties: lintel under 1.º + spring beam (open arch voids between legs)
    for (let i = 0; i < 4; i++) {
      const [sx0, sz0] = corners[i];
      const [sx1, sz1] = corners[(i + 1) % 4];
      bar(sx0 * mid1, y1, sz0 * mid1, sx1 * mid1, y1, sz1 * mid1, 0.26, ironDark);
      const tSpring = 0.48;
      const rSpring = legR(tSpring);
      const hy = y1 * tSpring;
      bar(sx0 * rSpring, hy, sz0 * rSpring, sx1 * rSpring, hy, sz1 * rSpring, 0.22, iron);
    }

    // Decorative arch accents (thin — the void under the spring beam is the main arch)
    for (const [nx, nz, rotY] of [
      [0, 1, 0],
      [1, 0, Math.PI / 2],
      [0, -1, Math.PI],
      [-1, 0, -Math.PI / 2],
    ] as const) {
      const archR = y1 * 0.42;
      const out = legR(0.35);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(archR, 0.18, 5, 20, Math.PI), ironLite);
      arch.position.set(nx * out * 0.55, y1 * 0.48 - archR * 0.08, nz * out * 0.55);
      arch.rotation.y = rotY;
      g.add(arch);
    }

    // Lattice X on each lower face (readable silhouette)
    for (let i = 0; i < 4; i++) {
      const [sx0, sz0] = corners[i];
      const [sx1, sz1] = corners[(i + 1) % 4];
      for (const [tLo, tHi] of [
        [0.1, 0.42],
        [0.52, 0.92],
      ] as const) {
        const rLo = legR(tLo);
        const rHi = legR(tHi);
        const yLo = y1 * tLo;
        const yHi = y1 * tHi;
        xBrace(
          sx0 * rLo,
          yLo,
          sz0 * rLo,
          sx1 * rLo,
          yLo,
          sz1 * rLo,
          sx1 * rHi,
          yHi,
          sz1 * rHi,
          sx0 * rHi,
          yHi,
          sz0 * rHi,
          0.16,
        );
      }
    }

    // 1.º andar (wide deck + corner posts)
    const plat1 = new THREE.Mesh(new THREE.BoxGeometry(mid1 * 2 + 0.7, 0.38, mid1 * 2 + 0.7), ironLite);
    plat1.position.y = y1;
    plat1.castShadow = true;
    g.add(plat1);
    const skirt1 = new THREE.Mesh(new THREE.BoxGeometry(mid1 * 2 + 1.1, 0.18, mid1 * 2 + 1.1), ironDark);
    skirt1.position.y = y1 - 0.22;
    g.add(skirt1);
    for (const [sx, sz] of corners) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), ironDark);
      post.position.set(sx * (mid1 + 0.15), y1 + 0.45, sz * (mid1 + 0.15));
      g.add(post);
    }

    // —— Mid section: 1.º → 2.º ——
    for (const [sx, sz] of corners) {
      bar(sx * mid1, y1, sz * mid1, sx * mid2, y2, sz * mid2, 0.32, iron);
    }
    for (let i = 0; i < 4; i++) {
      const [sx0, sz0] = corners[i];
      const [sx1, sz1] = corners[(i + 1) % 4];
      bar(sx0 * mid2, y2, sz0 * mid2, sx1 * mid2, y2, sz1 * mid2, 0.18, ironDark);
      const tLo = 0.12;
      const tHi = 0.88;
      const rLo = mid1 * (1 - tLo) + mid2 * tLo;
      const rHi = mid1 * (1 - tHi) + mid2 * tHi;
      const yLo = y1 + (y2 - y1) * tLo;
      const yHi = y1 + (y2 - y1) * tHi;
      xBrace(
        sx0 * rLo,
        yLo,
        sz0 * rLo,
        sx1 * rLo,
        yLo,
        sz1 * rLo,
        sx1 * rHi,
        yHi,
        sz1 * rHi,
        sx0 * rHi,
        yHi,
        sz0 * rHi,
        0.1,
      );
    }

    // 2.º andar (clear step in the silhouette)
    const plat2 = new THREE.Mesh(new THREE.BoxGeometry(mid2 * 2 + 0.75, 0.34, mid2 * 2 + 0.75), ironLite);
    plat2.position.y = y2;
    plat2.castShadow = true;
    g.add(plat2);
    const skirt2 = new THREE.Mesh(new THREE.BoxGeometry(mid2 * 2 + 1.05, 0.16, mid2 * 2 + 1.05), ironDark);
    skirt2.position.y = y2 - 0.2;
    g.add(skirt2);
    for (const [sx, sz] of corners) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), ironDark);
      post.position.set(sx * (mid2 + 0.12), y2 + 0.4, sz * (mid2 + 0.12));
      g.add(post);
    }

    // —— Tall tapering needle ——
    for (const [sx, sz] of corners) {
      bar(sx * mid2, y2, sz * mid2, sx * tipIn, yNeedle, sz * tipIn, 0.18, iron);
    }
    for (let i = 0; i < 4; i++) {
      const [sx0, sz0] = corners[i];
      const [sx1, sz1] = corners[(i + 1) % 4];
      for (const [tLo, tHi] of [
        [0.05, 0.35],
        [0.4, 0.7],
      ] as const) {
        const rLo = mid2 * (1 - tLo) + tipIn * tLo;
        const rHi = mid2 * (1 - tHi) + tipIn * tHi;
        const yLo = y2 + (yNeedle - y2) * tLo;
        const yHi = y2 + (yNeedle - y2) * tHi;
        xBrace(
          sx0 * rLo,
          yLo,
          sz0 * rLo,
          sx1 * rLo,
          yLo,
          sz1 * rLo,
          sx1 * rHi,
          yHi,
          sz1 * rHi,
          sx0 * rHi,
          yHi,
          sz0 * rHi,
          0.08,
        );
      }
    }
    // solid tip + beacon
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 8), ironDark);
    tip.position.y = yNeedle + 1.4;
    tip.castShadow = true;
    g.add(tip);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), iron);
    mast.position.y = yTip - 0.2;
    g.add(mast);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xff922b, emissiveIntensity: 1.0 }),
    );
    lamp.position.y = yTip + 0.55;
    g.add(lamp);

    // Collide only with the four feet — walk under the arches
    const footR = 0.95;
    for (const [sx, sz] of corners) {
      const fx = at.x + sx * baseOut;
      const fz = at.z + sz * baseOut;
      obstacles.push({
        minX: fx - footR,
        maxX: fx + footR,
        minZ: fz - footR,
        maxZ: fz + footR,
        height: y1,
      });
    }

    const gem = gemMesh(0xff3b7f, 1.3);
    gem.position.set(0, y1 + 0.55, 0);
    g.add(gem);

    const things: Interactable[] = [
      diamondAt(ctx, `gem:${ctx.city()}:torre`, new THREE.Vector3(at.x, 0, at.z + 4), gem),
    ];
    things.push({
      object: g,
      position: at.clone(),
      radius: 6.5,
      interact() {
        ctx.say(['A torre de ferro!']);
      },
    });
    return things;
  },

  /**
   * Londres — two separate attractions (≥25–40 m apart):
   *  1) Torre do Relógio (Elizabeth Tower style, original speech: «relógio»)
   *  2) Roda gigante (spokes, A-frame, hanging cabins + ride)
   */
  Londres(scene, obstacles, rng, ctx, world) {
    const things: Interactable[] = [];
    const city = ctx.city();
    const used: Record<string, { x: number; z: number }> = {};

    // Soft prefs far from SPAWN / airport; wheel ~34 m east of clock when free.
    const CLOCK_PREF = { x: -95, z: -105 };
    const clockAt = takeSpot(world, obstacles, rng, 3.2, 3.2, CLOCK_PREF, 28);
    used.clock = clockAt;

    // —— 1) Clock tower ——
    {
      const g = new THREE.Group();
      g.position.set(clockAt.x, 0, clockAt.z);
      g.userData.landmark = 'clock';
      scene.add(g);

      const stone = mat(0xc5bec9);
      const stoneDeep = mat(0x9a93a3);
      const cream = mat(0xfff4d6);
      const gold = mat(0xffd43b);
      const dark = mat(0x212529);
      const roof = mat(0x5c5470);

      // plinth + shaft (tall proportions)
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 4.2), stoneDeep);
      plinth.position.y = 0.55;
      plinth.castShadow = true;
      g.add(plinth);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 3.4), stone);
      base.position.y = 2.7;
      base.castShadow = true;
      g.add(base);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.7, 10.5, 2.7), stone);
      shaft.position.y = 9.5;
      shaft.castShadow = true;
      g.add(shaft);
      // thin corner pilasters
      for (const [sx, sz] of [
        [-1.25, -1.25],
        [1.25, -1.25],
        [-1.25, 1.25],
        [1.25, 1.25],
      ] as const) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.28, 10.5, 0.28), stoneDeep);
        pil.position.set(sx, 9.5, sz);
        g.add(pil);
      }

      // clock stage (slightly wider) + 4 faces
      const stage = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 3.2), stone);
      stage.position.y = 16.4;
      stage.castShadow = true;
      g.add(stage);
      const faceY = 16.5;
      const faceR = 1.05;
      const faceOut = 1.64;
      for (const [fx, fz, ry] of [
        [0, faceOut, 0],
        [0, -faceOut, Math.PI],
        [faceOut, 0, Math.PI / 2],
        [-faceOut, 0, -Math.PI / 2],
      ] as const) {
        const dial = new THREE.Mesh(new THREE.CircleGeometry(faceR, 20), cream);
        dial.position.set(fx, faceY, fz);
        dial.rotation.y = ry;
        g.add(dial);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(faceR, 0.06, 6, 24), gold);
        rim.position.copy(dial.position);
        rim.rotation.y = ry;
        g.add(rim);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), dark);
        hub.position.set(fx, faceY, fz);
        hub.rotation.y = ry;
        hub.position.x += Math.sin(ry) * 0.02;
        hub.position.z += Math.cos(ry) * 0.02;
        g.add(hub);
        const hour = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.04), dark);
        hour.position.set(fx, faceY + 0.18, fz);
        hour.rotation.y = ry;
        hour.position.x += Math.sin(ry) * 0.04;
        hour.position.z += Math.cos(ry) * 0.04;
        g.add(hour);
        const minute = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.035), dark);
        minute.position.set(fx, faceY + 0.05, fz);
        minute.rotation.y = ry;
        minute.rotation.z = 0.9;
        minute.position.x += Math.sin(ry) * 0.045;
        minute.position.z += Math.cos(ry) * 0.045;
        g.add(minute);
      }

      // gothic-ish belfry + pyramid roof / spire
      const belfry = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), stoneDeep);
      belfry.position.y = 19.2;
      g.add(belfry);
      for (const [bx, bz] of [
        [-0.85, -0.85],
        [0.85, -0.85],
        [-0.85, 0.85],
        [0.85, 0.85],
      ] as const) {
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), stone);
        pin.position.set(bx, 20.6, bz);
        g.add(pin);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), roof);
        tip.position.set(bx, 21.35, bz);
        tip.rotation.y = Math.PI / 4;
        g.add(tip);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.55, 4.2, 4), roof);
      spire.position.y = 22.5;
      spire.rotation.y = Math.PI / 4;
      g.add(spire);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), gold);
      finial.position.y = 24.7;
      g.add(finial);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), gold);
      pole.position.y = 25.3;
      g.add(pole);

      const gem = gemMesh(0xb06bff, 1.25);
      gem.position.set(0, 14.2, 0);
      g.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:relogio`, new THREE.Vector3(clockAt.x, 0, clockAt.z + 2.8), gem));
      things.push({
        object: g,
        position: new THREE.Vector3(clockAt.x, 0, clockAt.z + 2.6),
        radius: 3.2,
        interact() {
          const h = new Date().getHours() % 12 || 12;
          for (let i = 0; i < Math.min(h, 8); i++) tone(200, i * 0.35, 0.3, 'sine', 0.08);
          ctx.say(['O relógio dá as horas!']);
        },
      });
    }

    // —— 2) Ferris wheel (own spot, ≥30 m from the clock — walkable gap) ——
    {
      const WHEEL_HW = 6;
      const WHEEL_HD = 3.5;
      /** Tall claim so resolveSpot / clearArea treat the wheel as a real attraction. */
      const WHEEL_H = 20;
      const MIN_SEP = 30;
      /** Prefer 35–45 m; extras for crowded maps (Warsaw/Porto-style angle sweep). */
      const TRY_DISTS = [38, 42, 35, 45, 40, 48, 50, 55];

      const farEnough = (p: { x: number; z: number }) =>
        Math.hypot(p.x - clockAt.x, p.z - clockAt.z) >= MIN_SEP;

      /** Terrain OK (roads / airport / venues / map edge) even if buildings sit there. */
      const terrainOk = (at: { x: number; z: number }): boolean => {
        const me: Obstacle = {
          minX: at.x - WHEEL_HW,
          maxX: at.x + WHEEL_HW,
          minZ: at.z - WHEEL_HD,
          maxZ: at.z + WHEEL_HD,
        };
        if (Math.max(Math.abs(me.minX), Math.abs(me.maxX), Math.abs(me.minZ), Math.abs(me.maxZ)) > ROADS.extent - 10)
          return false;
        const samples: [number, number][] = [
          [at.x, at.z],
          [at.x - WHEEL_HW, at.z - WHEEL_HD],
          [at.x + WHEEL_HW, at.z - WHEEL_HD],
          [at.x - WHEEL_HW, at.z + WHEEL_HD],
          [at.x + WHEEL_HW, at.z + WHEEL_HD],
        ];
        for (const [x, z] of samples) {
          if (onRoad(x, z, 2.5)) return false;
          if (inNoSpawn(x, z, 4)) return false;
        }
        if (overlaps(me, AIRPORT_ZONE, 4)) return false;
        return true;
      };

      let wheelWant: { x: number; z: number } | null = null;
      for (const dist of TRY_DISTS) {
        for (let i = 0; i < 16; i++) {
          const a = ((i + rng()) / 16) * Math.PI * 2;
          const cand = { x: clockAt.x + Math.cos(a) * dist, z: clockAt.z + Math.sin(a) * dist };
          if (footprintFree(obstacles, cand, WHEEL_HW, WHEEL_HD) && farEnough(cand)) {
            wheelWant = cand;
            break;
          }
        }
        if (wheelWant) break;
      }

      // Strong preferred centre (≥35 m when possible). Height 20 = solid claim (was 0.6 → weak footprint).
      let wheelAt = takeSpot(
        world,
        obstacles,
        rng,
        WHEEL_HW,
        WHEEL_HD,
        wheelWant ?? { x: clockAt.x + 40, z: clockAt.z },
        WHEEL_H,
      );

      // If resolveSpot still collapsed near the clock, retry other rings or clearArea-force a grass cell.
      if (!farEnough(wheelAt)) {
        const bad = obstacles.find(
          (o) =>
            Math.abs((o.minX + o.maxX) / 2 - wheelAt.x) < 0.2 &&
            Math.abs((o.minZ + o.maxZ) / 2 - wheelAt.z) < 0.2,
        );
        if (bad) {
          const i = obstacles.indexOf(bad);
          if (i >= 0) obstacles.splice(i, 1);
        }
        let forced: { x: number; z: number } | null = null;
        for (const dist of [42, 45, 50, 55, 38, 60]) {
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const cand = { x: clockAt.x + Math.cos(a) * dist, z: clockAt.z + Math.sin(a) * dist };
            if (!terrainOk(cand)) continue;
            if (footprintFree(obstacles, cand, WHEEL_HW, WHEEL_HD)) {
              forced = cand;
              break;
            }
            // Buildings in the way — clear placeholders and claim the grass cell.
            claimSpot(world, cand, WHEEL_HW, WHEEL_HD, WHEEL_H);
            forced = cand;
            break;
          }
          if (forced) break;
        }
        if (forced) {
          if (!obstacles.some((o) => Math.abs((o.minX + o.maxX) / 2 - forced!.x) < 0.2)) {
            claimSpot(world, forced, WHEEL_HW, WHEEL_HD, WHEEL_H);
          }
          wheelAt = forced;
        } else {
          // Absolute last resort: due east of the clock, clear whatever is there.
          const last = { x: clockAt.x + 42, z: clockAt.z };
          claimSpot(world, last, WHEEL_HW, WHEEL_HD, WHEEL_H);
          wheelAt = last;
        }
      }
      used.wheel = wheelAt;

      const root = new THREE.Group();
      root.position.set(wheelAt.x, 0, wheelAt.z);
      root.userData.landmark = 'wheel';
      scene.add(root);

      const steel = mat(0x868e96);
      const steelLite = mat(0xadb5bd);
      const red = mat(0xe03131);
      const cabinCols = [0xff6b9d, 0x4dabf7, 0xffd43b, 0x69db7c, 0xcc5de8, 0xff922b];

      const hubY = 5.4;
      const R = 4.6;

      // ground pad + A-frame legs
      const pad = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.25, 3.2), mat(0x495057));
      pad.position.y = 0.12;
      root.add(pad);
      for (const side of [-1, 1] as const) {
        for (const lean of [-1, 1] as const) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, hubY + 0.4, 0.22), steel);
          leg.position.set(side * 0.55, hubY / 2, lean * 1.6);
          leg.rotation.z = side * 0.18;
          leg.rotation.x = -lean * 0.42;
          root.add(leg);
        }
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.4), steelLite);
        cross.position.set(side * 0.9, 1.4, 0);
        root.add(cross);
      }
      // axle + hub
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 10), steelLite);
      axle.rotation.z = Math.PI / 2;
      axle.position.y = hubY;
      root.add(axle);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), red);
      hub.rotation.z = Math.PI / 2;
      hub.position.y = hubY;
      root.add(hub);

      // spinning rim + spokes; cabins hang and stay upright via counter-rotation
      const spinner = new THREE.Group();
      spinner.position.y = hubY;
      root.add(spinner);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.11, 8, 40), steel);
      rim.rotation.y = Math.PI / 2;
      spinner.add(rim);
      const rimIn = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.07, 6, 32), steelLite);
      rimIn.rotation.y = Math.PI / 2;
      spinner.add(rimIn);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.07, R * 2, 0.07), steelLite);
        spoke.rotation.x = a;
        spinner.add(spoke);
      }

      const cabinPivots: THREE.Group[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const pivot = new THREE.Group();
        pivot.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
        spinner.add(pivot);
        cabinPivots.push(pivot);
        const col = mat(cabinCols[i % cabinCols.length]);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), col);
        cabin.position.y = -0.45;
        cabin.castShadow = true;
        pivot.add(cabin);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.62), steel);
        roof.position.y = -0.14;
        pivot.add(roof);
        const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6), steelLite);
        hang.position.y = -0.05;
        pivot.add(hang);
      }

      const gem = gemMesh(0x4dabf7, 1.2);
      gem.position.set(0, 1.1, 2.2);
      root.add(gem);
      things.push(diamondAt(ctx, `gem:${city}:roda`, new THREE.Vector3(wheelAt.x, 0, wheelAt.z + 2.5), gem));
      things.push({
        object: root,
        position: new THREE.Vector3(wheelAt.x, 0, wheelAt.z + 2.2),
        radius: 4.5,
        requiresClick: true,
        interact() {
          if (ctx.isPaused()) return false;
          ctx.hold(true);
          ctx.say(['Uma volta na roda!']);
          let t = 0;
          const rideR = R * 0.78;
          const spin = setInterval(() => {
            t += 0.05;
            spinner.rotation.x = t;
            for (const p of cabinPivots) p.rotation.x = -t;
            ctx.player.set(wheelAt.x, hubY + Math.cos(t) * rideR, wheelAt.z + Math.sin(t) * rideR);
            if (t > Math.PI * 2) {
              clearInterval(spin);
              ctx.player.set(wheelAt.x, 0, wheelAt.z + 3.5);
              ctx.hold(false);
            }
          }, 50);
          return true;
        },
      });
    }

    const dist = Math.hypot(used.wheel.x - used.clock.x, used.wheel.z - used.clock.z);
    landmarkDebug = { spots: used, count: 2, distance: Math.round(dist * 10) / 10 };
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
      // Walk-in fort: ring wall with a real opening at the gate (+Z), so she can go into the courtyard
      // and see/take the jewel. (Before: closed ring + one big solid box → the jewel was unreachable
      // and hidden behind the wall.) Wall is double-sided so it also reads from inside.
      const GATE_HALF = 0.34; // rad either side of +Z (≈ 2.4 m opening)
      const brickIn = new THREE.MeshStandardMaterial({ color: 0xb5654a, side: THREE.DoubleSide });
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 7.2, 3.2, 28, 1, true, GATE_HALF, Math.PI * 2 - GATE_HALF * 2),
        brickIn,
      );
      wall.position.y = 1.6;
      wall.castShadow = true;
      g.add(wall);
      const yardFloor = new THREE.Mesh(new THREE.CircleGeometry(6.9, 28), mat(0xd8c3a5));
      yardFloor.rotation.x = -Math.PI / 2;
      yardFloor.position.y = 0.03;
      g.add(yardFloor);
      // swap the solid footprint for a ring of small boxes (gate left open)
      const solid = world.obstacles.findIndex(
        (o) => Math.abs(o.minX - (at.x - 8)) < 1e-6 && Math.abs(o.maxZ - (at.z + 8)) < 1e-6,
      );
      if (solid >= 0) world.obstacles.splice(solid, 1);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2; // angle from +Z, like CylinderGeometry's theta
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue; // the gate
        const cx = at.x + Math.sin(a) * 6.9;
        const cz = at.z + Math.cos(a) * 6.9;
        world.obstacles.push({ minX: cx - 1.35, maxX: cx + 1.35, minZ: cz - 1.35, maxZ: cz + 1.35, height: 4 });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2; // 0°,60°…: no tower in the gate (+Z = 90°)
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 5, 10), brick);
        tower.position.set(Math.cos(a) * 6.5, 2.5, Math.sin(a) * 6.5);
        tower.castShadow = true;
        g.add(tower);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 8), mat(0x8b4513));
        tip.position.set(tower.position.x, 5.7, tower.position.z);
        g.add(tip);
        const ox = at.x + tower.position.x;
        const oz = at.z + tower.position.z;
        world.obstacles.push({ minX: ox - 1.35, maxX: ox + 1.35, minZ: oz - 1.35, maxZ: oz + 1.35, height: 6 });
      }
      for (const px of [-2.2, 2.2]) {
        world.obstacles.push({ minX: at.x + px - 0.65, maxX: at.x + px + 0.65, minZ: at.z + 6.15, maxZ: at.z + 7.45, height: 4 });
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
      // jewel on a stone plinth in the middle of the courtyard — big enough to spot from the gate
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 12), mat(0xadb5bd));
      plinth.position.y = 0.45;
      g.add(plinth);
      const gem = gemMesh(0xffe14d, 2.4);
      gem.position.set(0, 1.55, 0);
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

    // 2) Palácio da Cultura — Stalinist wedding-cake tower (kid-readable PKiN silhouette)
    {
      // Soft prefer needs ≤~9.5 half-extent here; mesh wings may overhang slightly.
      const at = takeSpot(world, obstacles, rng, 9.5, 9.5, WARSAW_PREFS.cultura, 10);
      used.cultura = at;
      const g = new THREE.Group();
      g.position.set(at.x, 0, at.z);
      g.userData.landmark = 'cultura';
      scene.add(g);

      const stone = mat(0xe8dfd0); // warm limestone
      const stoneDeep = mat(0xcfc4b4);
      const stoneLite = mat(0xf3ebe0);
      const trim = mat(0xb8a990);
      const win = mat(0x3a5078); // blue-dark window panes
      const cream = mat(0xfff4d6);
      const gold = mat(0xe0b040);
      const metal = mat(0xa8b0ba);

      const add = (mesh: THREE.Mesh, x: number, y: number, z: number, shadow = true) => {
        mesh.position.set(x, y, z);
        if (shadow) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
        g.add(mesh);
        return mesh;
      };

      /** Simple window grid on the four faces of an axis-aligned mass. */
      const glaze = (
        halfW: number,
        halfD: number,
        yBot: number,
        yTop: number,
        cols: number,
        rows: number,
      ) => {
        const spanY = yTop - yBot;
        if (spanY < 1.2 || cols < 1 || rows < 1) return;
        const ww = Math.min(0.55, (halfW * 1.5) / cols);
        const wh = Math.min(0.7, (spanY * 0.7) / rows);
        const gapX = (halfW * 1.7) / cols;
        const gapZ = (halfD * 1.7) / cols;
        const gapY = (spanY * 0.78) / rows;
        const y0 = yBot + spanY * 0.14 + wh * 0.5;
        for (let r = 0; r < rows; r++) {
          const wy = y0 + r * gapY;
          for (let c = 0; c < cols; c++) {
            const ox = -((cols - 1) * gapX) / 2 + c * gapX;
            const oz = -((cols - 1) * gapZ) / 2 + c * gapZ;
            add(new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.08), win), ox, wy, halfD + 0.04, false);
            add(new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.08), win), ox, wy, -(halfD + 0.04), false);
            add(new THREE.Mesh(new THREE.BoxGeometry(0.08, wh, ww), win), halfW + 0.04, wy, oz, false);
            add(new THREE.Mesh(new THREE.BoxGeometry(0.08, wh, ww), win), -(halfW + 0.04), wy, oz, false);
          }
        }
      };

      // —— podium + cross wings (wide lower massing) ——
      add(new THREE.Mesh(new THREE.BoxGeometry(17.5, 1.5, 17.5), stoneDeep), 0, 0.75, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(13.2, 5.0, 13.2), stone), 0, 4.0, 0);
      // E–W arms longer / taller so the “cake” reads from afar
      add(new THREE.Mesh(new THREE.BoxGeometry(20.5, 4.0, 8.0), stoneLite), 0, 3.5, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(8.0, 4.0, 18.0), stoneLite), 0, 3.5, 0);
      // second step on the arms (setback shelf)
      add(new THREE.Mesh(new THREE.BoxGeometry(16.5, 1.6, 6.2), stone), 0, 6.3, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.6, 14.5), stone), 0, 6.3, 0);
      // cornice belts
      add(new THREE.Mesh(new THREE.BoxGeometry(20.9, 0.28, 8.4), trim), 0, 5.55, 0, false);
      add(new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.28, 18.4), trim), 0, 5.55, 0, false);
      add(new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.32, 13.6), trim), 0, 6.55, 0, false);
      glaze(6.4, 6.4, 1.7, 6.3, 5, 3);
      glaze(10.0, 3.8, 1.8, 5.3, 7, 2);
      glaze(3.8, 8.8, 1.8, 5.3, 2, 2);

      // corner pinnacles on the wing tips (wedding-cake read from afar)
      for (const [px, pz] of [
        [9.6, 0],
        [-9.6, 0],
        [0, 8.4],
        [0, -8.4],
      ] as const) {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 5.6, 1.5), stoneDeep), px, 4.2, pz);
        add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 1.7), trim), px, 7.1, pz, false);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.7, 4), metal), px, 8.15, pz, false).rotation.y =
          Math.PI / 4;
      }

      // —— stepped mid + tall central shaft ——
      add(new THREE.Mesh(new THREE.BoxGeometry(9.6, 3.0, 9.6), stone), 0, 8.6, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.28, 10.0), trim), 0, 10.15, 0, false);
      glaze(4.6, 4.6, 7.2, 10.0, 4, 2);

      const shaftH = 10.6;
      const shaftHalf = 3.05;
      const shaftBot = 10.2;
      add(new THREE.Mesh(new THREE.BoxGeometry(shaftHalf * 2, shaftH, shaftHalf * 2), stone), 0, shaftBot + shaftH / 2, 0);
      // vertical corner ribs
      for (const [sx, sz] of [
        [-shaftHalf + 0.12, -shaftHalf + 0.12],
        [shaftHalf - 0.12, -shaftHalf + 0.12],
        [-shaftHalf + 0.12, shaftHalf - 0.12],
        [shaftHalf - 0.12, shaftHalf - 0.12],
      ] as const) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.28, shaftH, 0.28), stoneDeep), sx, shaftBot + shaftH / 2, sz, false);
      }
      glaze(shaftHalf, shaftHalf, shaftBot + 0.3, shaftBot + shaftH - 0.2, 3, 7);

      // terrace landing = roof of the tall shaft (climb target)
      const terraceY = 20.7;
      add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.28, 6.6), stoneLite), 0, terraceY, 0, false);
      for (const [rx, rz] of [
        [-3.15, 0],
        [3.15, 0],
        [0, -3.15],
        [0, 3.15],
      ] as const) {
        add(
          new THREE.Mesh(new THREE.BoxGeometry(rx === 0 ? 6.6 : 0.16, 0.72, rz === 0 ? 6.6 : 0.16), trim),
          rx,
          terraceY + 0.5,
          rz,
          false,
        );
      }

      // —— clock / decorative belt above the lookout ——
      add(new THREE.Mesh(new THREE.BoxGeometry(7.0, 2.9, 7.0), stoneDeep), 0, terraceY + 1.7, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.22, 7.4), trim), 0, terraceY + 0.35, 0, false);
      add(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.22, 7.4), trim), 0, terraceY + 3.15, 0, false);
      const faceR = 0.95;
      const faceOut = 3.55;
      const faceY = terraceY + 1.7;
      for (const [fx, fz, ry] of [
        [0, faceOut, 0],
        [0, -faceOut, Math.PI],
        [faceOut, 0, Math.PI / 2],
        [-faceOut, 0, -Math.PI / 2],
      ] as const) {
        const dial = new THREE.Mesh(new THREE.CircleGeometry(faceR, 18), cream);
        dial.position.set(fx, faceY, fz);
        dial.rotation.y = ry;
        g.add(dial);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(faceR, 0.055, 6, 20), gold);
        rim.position.copy(dial.position);
        rim.rotation.y = ry;
        g.add(rim);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), mat(0x212529));
        hub.position.set(fx, faceY, fz);
        hub.rotation.y = ry;
        hub.position.x += Math.sin(ry) * 0.02;
        hub.position.z += Math.cos(ry) * 0.02;
        g.add(hub);
        const hour = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.035), mat(0x212529));
        hour.position.set(fx, faceY + 0.14, fz);
        hour.rotation.y = ry;
        hour.position.x += Math.sin(ry) * 0.04;
        hour.position.z += Math.cos(ry) * 0.04;
        g.add(hour);
      }

      // crown + distinctive needle / spire
      add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.4, 4.2), stone), 0, terraceY + 4.95, 0);
      glaze(2.0, 2.0, terraceY + 3.4, terraceY + 6.4, 2, 2);
      add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 4.6), trim), 0, terraceY + 6.7, 0, false);
      add(new THREE.Mesh(new THREE.ConeGeometry(2.15, 2.4, 4), metal), 0, terraceY + 8.0, 0).rotation.y = Math.PI / 4;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 4.8, 8), metal), 0, terraceY + 11.2, 0, false);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 8), metal), 0, terraceY + 14.0, 0, false);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), gold), 0, terraceY + 14.85, 0, false);

      // Open lookout terrace on the +Z setback shelf (y 7.1, in front of the mid block) — nothing above
      // her head there. (The old target sat inside the clock belt at the top of the shaft: a slab cut
      // through her head and the jewel was hidden inside it.)
      const deckY = 7.1; // top of the +Z arm's setback shelf (z 4.8 → 7.25, x ±3.1)
      const armTopY = 5.69; // top of the +Z arm (cornice belt), z ≤ 9
      add(new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.12, 2.6), stoneLite), 0, deckY + 0.04, 6.0, false); // pale floor
      // low balustrade round the open sides (front edge has a gap where the stair arrives, x 1.5 → 3.1)
      add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.6, 0.16), trim), -0.9, deckY + 0.4, 7.2, false);
      for (const sx of [-3.1, 3.1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 2.5), trim), sx, deckY + 0.4, 6.0, false);
      }

      // Monumental stair up the front of the +Z wing: ground → wing roof → three steps onto the terrace.
      // Solid treads down to their base (no floating blocks); the meshes ARE the climb path.
      const stairX = 2.3;
      const stairW = 1.6;
      const climbSteps: THREE.Vector3[] = [];
      const n1 = 10;
      const run1 = 0.75;
      const rise1 = armTopY / n1;
      for (let i = 0; i < n1; i++) {
        const y = (i + 1) * rise1;
        const z = 9.0 + (n1 - 1 - i) * run1 + run1 * 0.5;
        add(new THREE.Mesh(new THREE.BoxGeometry(stairW, y, run1 * 0.98), stoneLite), stairX, y / 2, z);
        // side parapet along the outer edge
        add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, run1 * 0.98), trim), stairX + stairW / 2 + 0.08, y + 0.27, z, false);
        climbSteps.push(new THREE.Vector3(at.x + stairX, y, at.z + z));
      }
      climbSteps.push(new THREE.Vector3(at.x + stairX, armTopY, at.z + 8.6));
      const n2 = 3;
      const rise2 = (deckY - armTopY) / n2;
      for (let i = 0; i < n2; i++) {
        const y = armTopY + (i + 1) * rise2;
        const z = 8.25 - i * 0.45;
        add(new THREE.Mesh(new THREE.BoxGeometry(stairW, y - armTopY, 0.44), stoneLite), stairX, armTopY + (y - armTopY) / 2, z);
        climbSteps.push(new THREE.Vector3(at.x + stairX, y, at.z + z));
      }
      climbSteps.push(new THREE.Vector3(at.x + stairX, deckY, at.z + 6.7));

      // jewel on a little plinth to her left, in front of the camera — never inside her or a wall
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 10), trim), -1.6, deckY + 0.35, 6.0);
      const gem = gemMesh(0xb06bff, 2.6);
      gem.position.set(-1.6, deckY + 1.25, 6.0);
      g.add(gem);
      const foot = new THREE.Vector3(at.x + stairX, 0, at.z + 9.0 + n1 * run1 + 0.6);
      const lookout = new THREE.Vector3(at.x + 0.6, deckY, at.z + 6.0);
      // over-the-shoulder shot from the front: she, the jewel and the tower all in frame
      const vista: VistaCam = { x: at.x, z: at.z + 6.0, h: deckY + 7, fromX: at.x + 1.5, fromZ: at.z + 19, lookY: deckY + 1.4 };
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
          sayGem: ['Uma joia do ex-líbris! Guarda-a bem!'],
          interactAt: foot,
          radius: 5.5,
          vista,
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
      // Front (gate, clock-tower stair, forecourt) is built on local +Z. Turn it to face the town
      // centre / the street she arrives from: at the preferred NW-corner spot (z > 0) that is −Z,
      // i.e. a 180° turn (Telmo 2026-11-21: "está virado para trás").
      const flip = at.z > 0;
      g.rotation.y = flip ? Math.PI : 0;
      /** local (lx, y, lz) → world, matching the group's rotation (footprint is symmetric: 11 × 9). */
      const W = (lx: number, y: number, lz: number) =>
        new THREE.Vector3(at.x + (flip ? -lx : lx), y, at.z + (flip ? -lz : lz));
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
        if (Math.hypot(i - 5.2, 4.3 - 3.6) < 2.7) continue; // keep the torreão terrace clear
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
        // front-right corner = the climbable torreão below (an extra tower here stood right on her terrace)
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
          map: flagTexture('Varsóvia'), // Polish flag: white over red
          side: THREE.DoubleSide,
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
      // body stops under the balcony floor (it used to rise 1.2 m above it and swallow her legs)
      const keepTower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, balconyY - 0.1, 14), red);
      keepTower.position.set(tx, (balconyY - 0.1) / 2, tz);
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
      // open-air terrace (no cone roof over it — its rim sat at head height); tall flagpole at the back edge
      const poleZ = tz - 2.25;
      const tipPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 6), gold);
      tipPole.position.set(tx, balconyY + 2.2, poleZ);
      g.add(tipPole);
      const tipFlag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.85),
        new THREE.MeshStandardMaterial({ map: flagTexture('Varsóvia'), side: THREE.DoubleSide }), // Polish flag
      );
      tipFlag.position.set(tx + 0.7, balconyY + 4.0, poleZ);
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
        climbSteps.push(W(xLocal, y, zLocal));
      }
      // last tread onto the balcony
      climbSteps.push(W(tx, balconyY, tz + 1.4));

      // gate with crest
      const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.35), mat(0x5c4033));
      gate.position.set(0, 1.8, 4.6);
      g.add(gate);
      const crest = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), gold);
      crest.position.set(0, 4.2, 4.85);
      g.add(crest);

      // jewel on the keep-roof terrace beside her (it used to sit exactly where she stands → hidden inside her)
      const gemPlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.6, 10), gold);
      gemPlinth.position.set(tx - 2.6, balconyY + 0.3, tz - 0.2);
      g.add(gemPlinth);
      const gem = gemMesh(0xffe14d, 2.5);
      gem.position.set(tx - 2.6, balconyY + 1.15, tz - 0.2);
      g.add(gem);

      const foot = W(tx, 0, tz + 2.6 + stairN * run + 0.5);
      const lookout = W(tx, balconyY, tz + 0.3);
      // front three-quarter shot of the terrace: she, the jewel and the flags in frame
      const topFront = W(tx - 1.2, 0, tz + 12);
      const topAt = W(tx - 1.2, 0, tz);
      const vista: VistaCam = { x: topAt.x, z: topAt.z, h: balconyY + 6.5, fromX: topFront.x, fromZ: topFront.z, lookY: balconyY + 1.2 };
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
          sayGem: ['Uma joia do ex-líbris! Guarda-a bem!'],
          interactAt: foot,
          radius: 5.5,
          vista,
        }),
      );
    }

    landmarkDebug = { spots: used, prefs: { ...WARSAW_PREFS }, count: 6 };
    return things;
  },

  /**
   * Pequim — muralha (estilo Grande Muralha, original / «muralha»):
   * uma serpente comprida (~100 m de caminho quando há espaço) com altura variável, caminho no cimo,
   * merlões e várias torres de vigia. Procura uma faixa livre de estradas, recintos e outras coisas;
   * só os edifícios provisórios no caminho são retirados (world.clearArea). Obstáculos só sob cada
   * segmento/torre — a cidade continua a poder ser atravessada à volta da muralha.
   * Ao lado da 1.ª torre há um gongo chinês (pórtico vermelho) — tocar = «bong» e balança.
   */
  Pequim(scene, obstacles, rng, ctx, world) {
    const WALL_W = 2.45;
    const DECK_W = 1.9;
    const PAD = WALL_W * 0.55;

    type Shape = { cx: number; cz: number; alongX: boolean; span: number; amp: number; waves: number; flip: number };
    /** Ridge path in world space: snakes across the axis, climbs and dips so the silhouette is never a flat bar. */
    const ridgeOf = (s: Shape) => (t: number) => {
      const u = (t - 0.5) * s.span;
      const v = s.flip * (Math.sin(t * Math.PI * s.waves) * s.amp + Math.sin(t * Math.PI * 0.7) * 1.6);
      const h = 3.35 + Math.sin(t * Math.PI * 1.05 * (s.waves / 1.85)) * 1.65 + Math.sin(t * Math.PI * 2.2 * (s.waves / 1.85)) * 0.45;
      return s.alongX ? { x: s.cx + u, z: s.cz + v, h } : { x: s.cx + v, z: s.cz + u, h };
    };
    const segsOf = (s: Shape) => Math.max(22, Math.round(s.span / 2));
    const pathLen = (s: Shape): number => {
      const r = ridgeOf(s);
      let len = 0;
      let p = r(0);
      for (let i = 1; i <= 80; i++) {
        const q = r(i / 80);
        len += Math.hypot(q.x - p.x, q.z - p.z);
        p = q;
      }
      return len;
    };
    const isBuilding = (o: Obstacle) => world.buildings.has(o);
    const LIM = ROADS.extent - 10;
    /** Every sample along the path (and the tower squares) clear of roads, venues, the airport and solid things. */
    const shapeFree = (s: Shape): boolean => {
      const r = ridgeOf(s);
      const n = segsOf(s);
      const boxes: Obstacle[] = [];
      for (let i = 0; i <= n * 2; i++) {
        const p = r(i / (n * 2));
        if (Math.abs(p.x) > LIM || Math.abs(p.z) > LIM) return false;
        if (onRoad(p.x, p.z, 5)) return false; // ≥ 9 m from the road centre line
        if (inNoSpawn(p.x, p.z, 4)) return false;
        if (Math.hypot(p.x - 7, p.z - 7) < 30) return false; // never at the start point
        boxes.push({ minX: p.x - 2.2, maxX: p.x + 2.2, minZ: p.z - 2.2, maxZ: p.z + 2.2 });
      }
      for (const b of boxes) {
        if (overlaps(b, AIRPORT_ZONE, 4)) return false;
        for (const o of obstacles) if (!isBuilding(o) && overlaps(b, o, 3)) return false;
      }
      return true;
    };

    // Longest snake that fits: try long spans first (several wiggles), then shorter ones.
    const tries: Omit<Shape, 'cx' | 'cz' | 'alongX' | 'flip'>[] = [
      { span: 110, amp: 9, waves: 3.2 },
      { span: 96, amp: 9, waves: 3 },
      { span: 82, amp: 10, waves: 3 },
      { span: 68, amp: 11, waves: 3 },
      { span: 56, amp: 10, waves: 2.6 },
      { span: 46, amp: 8, waves: 2.2 },
      { span: 38, amp: 7.2, waves: 1.85 },
    ];
    let shape: Shape | null = null;
    for (const t of tries) {
      for (let i = 0; i < 260 && !shape; i++) {
        const alongX = rng() < 0.5;
        const half = t.span / 2 + 2;
        const cand: Shape = {
          ...t,
          alongX,
          flip: rng() < 0.5 ? -1 : 1,
          cx: alongX ? (rng() * 2 - 1) * (LIM - half) : (rng() * 2 - 1) * (LIM - t.amp - 4),
          cz: alongX ? (rng() * 2 - 1) * (LIM - t.amp - 4) : (rng() * 2 - 1) * (LIM - half),
        };
        if (shapeFree(cand)) shape = cand;
      }
      if (shape) break;
    }
    if (!shape) {
      // crowded map: the old compact snake on a free square
      const c = place(obstacles, rng, 20);
      shape = { cx: c.x, cz: c.z, alongX: true, span: 38, amp: 7.2, waves: 1.85, flip: 1 };
    }
    const S = shape;
    const ridgeW = ridgeOf(S);
    const at = new THREE.Vector3(S.cx, 0, S.cz);
    lastPlaceSpot = { x: at.x, z: at.z };
    /** Ridge in the group's local frame (group sits at `at`). */
    const ridge = (t: number) => {
      const p = ridgeW(t);
      return { x: p.x - at.x, z: p.z - at.z, h: p.h };
    };

    const g = new THREE.Group();
    g.position.copy(at);
    g.userData.landmark = 'muralha';
    scene.add(g);

    const stone = mat(0x9a8f7e); // grey-brown — reads as stone from afar
    const stoneLite = mat(0xb5a894);
    const stoneDeep = mat(0x7a7164);
    const roof = mat(0x5c4033);
    const roofDark = mat(0x3d2b1f);

    const SEGS = segsOf(S);
    const pts: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i <= SEGS; i++) pts.push(ridge(i / SEGS));

    /** Orient a box along the segment (local Z → tangent). */
    const zAxis = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();
    const placeSeg = (mesh: THREE.Mesh, x0: number, z0: number, x1: number, z1: number, y: number) => {
      mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      dir.set(x1 - x0, 0, z1 - z0).normalize();
      mesh.quaternion.setFromUnitVectors(zAxis, dir);
      g.add(mesh);
    };
    const merlonGeo = new THREE.BoxGeometry(0.42, 0.78, 0.8);

    // —— Wall body + walkway deck + merlons along the ridge ——
    for (let i = 0; i < SEGS; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 0.01;
      const hBody = (a.h + b.h) * 0.5;
      const yTop = hBody;

      const body = new THREE.Mesh(new THREE.BoxGeometry(WALL_W, hBody, len + 0.3), i % 2 === 0 ? stone : stoneDeep);
      body.castShadow = true;
      body.receiveShadow = true;
      placeSeg(body, a.x, a.z, b.x, b.z, hBody * 0.5);

      // Walkway deck on top (lighter stone strip) — tilted to follow height change
      const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK_W, 0.18, len + 0.3), stoneLite);
      placeSeg(deck, a.x, a.z, b.x, b.z, yTop + 0.09);
      deck.rotateX(-Math.atan2(b.h - a.h, len));

      // Merlons (crenellations) on both long sides — several per segment so they read as battlements
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const nx = -dz / len;
      const nz = dx / len;
      const nM = Math.max(1, Math.round(len / 1.5));
      for (let k = 0; k < nM; k++) {
        const f = (k + 0.5) / nM;
        const px = a.x + dx * f;
        const pz = a.z + dz * f;
        const py = a.h + (b.h - a.h) * f;
        for (const side of [-1, 1] as const) {
          const merlon = new THREE.Mesh(merlonGeo, stone);
          merlon.position.set(px + nx * side * (WALL_W * 0.48), Math.min(py, yTop) + 0.48, pz + nz * side * (WALL_W * 0.48));
          merlon.quaternion.setFromUnitVectors(zAxis, dir.set(dx, 0, dz).normalize());
          g.add(merlon);
        }
      }

      // Obstacle only under this segment (tight AABB — city stays walkable around the snake)
      obstacles.push({
        minX: at.x + Math.min(a.x, b.x) - PAD,
        maxX: at.x + Math.max(a.x, b.x) + PAD,
        minZ: at.z + Math.min(a.z, b.z) - PAD,
        maxZ: at.z + Math.max(a.z, b.z) + PAD,
        height: hBody + 0.9,
      });
    }

    /** Square watchtower with small pitched roof + top merlons. */
    const watchTower = (t: number) => {
      const p = ridge(t);
      const tw = 3.35;
      const th = p.h + 2.9;
      const base = new THREE.Mesh(new THREE.BoxGeometry(tw, th, tw), stoneDeep);
      base.position.set(p.x, th * 0.5, p.z);
      base.castShadow = true;
      g.add(base);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.25, 0.28, tw + 0.25), stone);
      belt.position.set(p.x, th - 0.35, p.z);
      g.add(belt);
      const eaves = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.85, 0.16, tw + 0.85), roof);
      eaves.position.set(p.x, th + 0.2, p.z);
      g.add(eaves);
      const pyramid = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.72, 1.25, 4), roofDark);
      pyramid.position.set(p.x, th + 0.95, p.z);
      pyramid.rotation.y = Math.PI / 4;
      pyramid.castShadow = true;
      g.add(pyramid);
      const roofY = th + 1.55;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.7, 0.45), stoneLite);
        m.position.set(p.x + sx * (tw * 0.42), th + 0.35, p.z + sz * (tw * 0.42));
        g.add(m);
      }
      // Narrow arrow-slit windows (dark recesses)
      for (const [sx, sz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(sx === 0 ? 0.35 : 0.12, 0.7, sz === 0 ? 0.35 : 0.12), mat(0x343a40));
        slit.position.set(p.x + sx * (tw * 0.51), th * 0.55, p.z + sz * (tw * 0.51));
        g.add(slit);
      }
      const half = tw * 0.55;
      obstacles.push({
        minX: at.x + p.x - half,
        maxX: at.x + p.x + half,
        minZ: at.z + p.z - half,
        maxZ: at.z + p.z + half,
        height: th + 1.2,
      });
      // unit normal of the ridge here (to put things beside the wall, never on it)
      const q = ridge(Math.min(1, t + 0.01));
      const o = ridge(Math.max(0, t - 0.01));
      const l = Math.hypot(q.x - o.x, q.z - o.z) || 1;
      return { x: p.x, z: p.z, h: th, roofY, nx: -(q.z - o.z) / l, nz: (q.x - o.x) / l };
    };

    // a watchtower every ~18 m of path (2 on the short fallback snake)
    const len = pathLen(S);
    const nT = Math.max(2, Math.min(7, Math.round(len / 18)));
    const towers = Array.from({ length: nT }, (_, i) => watchTower(nT === 2 ? [0.22, 0.72][i] : 0.06 + (0.88 * i) / (nT - 1)));
    const towerA = towers[0];
    const towerB = towers[Math.min(towers.length - 1, Math.max(1, Math.round(towers.length * 0.6)))];

    // the wall's ends: solid end blocks so the snake doesn't stop in a cut-off slice
    for (const t of [0, 1]) {
      const p = ridge(t);
      const end = new THREE.Mesh(new THREE.BoxGeometry(WALL_W + 0.5, p.h + 0.6, WALL_W + 0.5), stoneDeep);
      end.position.set(p.x, (p.h + 0.6) / 2, p.z);
      end.castShadow = true;
      g.add(end);
      obstacles.push({
        minX: at.x + p.x - 1.6,
        maxX: at.x + p.x + 1.6,
        minZ: at.z + p.z - 1.6,
        maxZ: at.z + p.z + 1.6,
        height: p.h + 0.6,
      });
    }

    // Placeholder buildings in the snake's way go (venues/shops were never in the way — shapeFree).
    for (let i = 0; i < SEGS; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      world.clearArea(
        { minX: at.x + Math.min(a.x, b.x) - PAD, maxX: at.x + Math.max(a.x, b.x) + PAD, minZ: at.z + Math.min(a.z, b.z) - PAD, maxZ: at.z + Math.max(a.z, b.z) + PAD },
        3,
      );
    }
    for (const t of towers) {
      world.clearArea({ minX: at.x + t.x - 1.9, maxX: at.x + t.x + 1.9, minZ: at.z + t.z - 1.9, maxZ: at.z + t.z + 1.9 }, 3);
    }

    // Side of towerA that is clear (the snake bends — pick the side away from the next stretch of wall)
    const sideOf = (tw: { x: number; z: number; nx: number; nz: number }) => {
      const probe = (s: number) => {
        const px = tw.x + tw.nx * s * 5;
        const pz = tw.z + tw.nz * s * 5;
        let d = Infinity;
        for (const p of pts) d = Math.min(d, Math.hypot(p.x - px, p.z - pz));
        return d;
      };
      return probe(1) >= probe(-1) ? 1 : -1;
    };
    const sA = sideOf(towerA);
    // tangent at towerA (along the wall)
    const tax = towerA.nz;
    const taz = -towerA.nx;

    // Steps up to the first tower's side — walkable-path feel (visual climb beside the wall)
    {
      const nSteps = 5;
      const rise = towerA.h * 0.5;
      for (let i = 0; i < nSteps; i++) {
        const hgt = 0.28 + rise * (i / nSteps);
        const d = 2.2 + (nSteps - 1 - i) * 0.7; // the tallest step is the one against the tower
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.0, hgt, 0.7), stoneLite);
        step.position.set(towerA.x + towerA.nx * sA * d, hgt / 2, towerA.z + towerA.nz * sA * d);
        step.rotation.y = Math.atan2(towerA.nx * sA, towerA.nz * sA);
        g.add(step);
      }
      const sx = at.x + towerA.x + towerA.nx * sA * 3.6;
      const sz = at.z + towerA.z + towerA.nz * sA * 3.6;
      world.clearArea({ minX: sx - 1.6, maxX: sx + 1.6, minZ: sz - 1.6, maxZ: sz + 1.6 }, 1);
    }

    // Chinese gong in a red lacquered frame beside the first tower (along the wall, away from the steps):
    // two red posts, a curved dark beam with upturned ends, a bronze gong with a raised boss, a mallet.
    const gongAt = {
      x: towerA.x + towerA.nx * sA * 3.2 + tax * 4.2,
      z: towerA.z + towerA.nz * sA * 3.2 + taz * 4.2,
    };
    const gongFrame = new THREE.Group();
    gongFrame.position.set(gongAt.x, 0, gongAt.z);
    // face the gong outwards (its disc faces along the wall's normal, to where she comes from)
    gongFrame.rotation.y = Math.atan2(towerA.nx * sA, towerA.nz * sA);
    g.add(gongFrame);
    const lacquer = mat(0xc92a2a);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 10), lacquer);
      post.position.set(sx * 0.95, 1.4, 0);
      post.castShadow = true;
      gongFrame.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.7), stoneDeep);
      foot.position.set(sx * 0.95, 0.09, 0);
      gongFrame.add(foot);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.18), roofDark);
      tip.position.set(sx * 1.32, 2.95, 0);
      tip.rotation.z = sx * 0.45; // upturned ends, like a little pagoda roof
      gongFrame.add(tip);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.2), roofDark);
    beam.position.set(0, 2.85, 0);
    gongFrame.add(beam);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.12), lacquer);
    bar.position.set(0, 2.55, 0);
    gongFrame.add(bar);
    const gongPivot = new THREE.Group(); // swings from the bar when struck
    gongPivot.position.set(0, 2.5, 0);
    gongFrame.add(gongPivot);
    for (const sx of [-0.3, 0.3]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), mat(0x343a40));
      cord.position.set(sx, -0.2, 0);
      gongPivot.add(cord);
    }
    const bronze = new THREE.MeshStandardMaterial({ color: 0xc9902a, metalness: 0.6, roughness: 0.35, emissive: 0x3a2400 });
    const gong = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 28), bronze);
    gong.rotation.x = Math.PI / 2;
    gong.position.set(0, -1.12, 0);
    gong.castShadow = true;
    gongPivot.add(gong);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 28), mat(0x8a5a12));
    rim.position.set(0, -1.12, 0);
    gongPivot.add(rim);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(0, -1.12, 0.05);
    gongPivot.add(boss);
    // mallet leaning on the right post
    const mallet = new THREE.Group();
    mallet.position.set(1.2, 0, 0.2);
    mallet.rotation.z = 0.25;
    gongFrame.add(mallet);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), mat(0x8a5a2b));
    handle.position.y = 0.55;
    mallet.add(handle);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xfff3d6));
    head.position.y = 1.1;
    mallet.add(head);
    const gw = { x: at.x + gongAt.x, z: at.z + gongAt.z };
    const gongBox: Obstacle = { minX: gw.x - 1.1, maxX: gw.x + 1.1, minZ: gw.z - 1.1, maxZ: gw.z + 1.1, height: 3 };
    world.clearArea(gongBox, 1.5);
    obstacles.push(gongBox);

    const gem = gemMesh(0xffe14d, 1.3);
    gem.position.set(towerB.x, towerB.roofY + 1.15, towerB.z);
    g.add(gem);
    const sB = sideOf(towerB);
    const gemFoot = new THREE.Vector3(at.x + towerB.x + towerB.nx * sB * 3.2, 0, at.z + towerB.z + towerB.nz * sB * 3.2);

    landmarkDebug = {
      spots: {
        muralha: { x: at.x, z: at.z },
        main: { x: at.x, z: at.z },
        towerA: { x: at.x + towerA.x, z: at.z + towerA.z },
        towerB: { x: at.x + towerB.x, z: at.z + towerB.z },
        gong: gw,
        gemFoot: { x: gemFoot.x, z: gemFoot.z },
      },
      wall: {
        span: S.span,
        alongX: S.alongX,
        length: Math.round(len),
        towers: towers.map((t) => ({ x: +(at.x + t.x).toFixed(1), z: +(at.z + t.z).toFixed(1) })),
        ends: [0, 1].map((t) => ridgeW(t)).map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1) })),
      },
      count: 1,
    };

    const things: Interactable[] = [diamondAt(ctx, `gem:${ctx.city()}:muralha`, gemFoot, gem)];
    let swing = 0;
    let swingT = 0;
    let toldGong = false;
    things.push({
      object: gongFrame,
      position: new THREE.Vector3(gw.x + towerA.nx * sA * 1.6, 0, gw.z + towerA.nz * sA * 1.6),
      radius: 2.6,
      interact() {
        // deep bronze "bong" with a long shimmer
        tone(98, 0, 2.6, 'sine', 0.14);
        tone(147, 0, 2.0, 'sine', 0.07);
        tone(196.5, 0.02, 1.6, 'triangle', 0.04);
        tone(523, 0.02, 0.9, 'sine', 0.02);
        swing = 1;
        swingT = 0;
        if (!toldGong) {
          toldGong = true;
          ctx.say(['É um gongo chinês!']);
        }
      },
      update(dt) {
        if (swing <= 0) return;
        swingT += dt;
        swing = Math.max(0, 1 - swingT / 2.5);
        gongPivot.rotation.x = Math.sin(swingT * 7) * 0.22 * swing;
      },
    });
    const mid = ridgeW(0.5);
    things.push({
      object: g,
      position: new THREE.Vector3(mid.x, 0, mid.z),
      radius: 4,
      interact() {
        ctx.say(['A muralha!']);
      },
    });
    return things;
  },

  /** Pão de Açúcar + bondinho + Cristo Redentor no Corcovado — src/landmarks-rio.ts. */
  'Rio de Janeiro'(scene, obstacles, rng, ctx, world) {
    return buildRio(scene, obstacles, rng, ctx, world, {
      diamondAt,
      setDebug: (d) => (landmarkDebug = d),
      setRideDispose: (fn) => {
        clearLandmarkRide();
        landmarkRideDispose = fn;
      },
    });
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

  /** No ex-líbris yet — intentional empty (was sled+dogs; removed). */
  Nuuk() {
    return [];
  },

  /** No fake grey obelisk — intentional empty until a real Madrid attraction is built. */
  Madrid() {
    return [];
  },
  Vilnius() {
    return [];
  },
  /** Catedral de São Basílio + Praça Vermelha — src/landmarks-moscovo.ts. */
  Moscovo(scene, obstacles, rng, ctx, world) {
    return buildMoscovo(scene, obstacles, rng, ctx, world, { diamondAt, setDebug: (d) => (landmarkDebug = d) });
  },
  /** Teotihuacán (sobe-se) + guerreiros de Tula + Casa Azul + bandeirinhas + crianças com máscaras — src/landmarks-mexico.ts. */
  'Cidade do México'(scene, obstacles, rng, ctx, world) {
    return buildMexico(scene, obstacles, rng, ctx, world, { setDebug: (d) => (landmarkDebug = d), climb: towerClimb });
  },
  Reiquiavique() {
    return [];
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

/**
 * No defaultLandmark / grey-obelisk fallback: cities without a BY_CITY builder (or with an empty one)
 * simply get no ex-líbris and no landmark gem. EUA uses usa.ts; Lua has none.
 */
export function createLandmarks(scene: THREE.Scene, obstacles: Obstacle[], seed: number, ctx: GameCtx, world: World): Interactable[] {
  clearLandmarkRide(); // drop mid-ride hold if city rebuilds
  activeClimb = null;
  landmarkDebug = null;
  lastPlaceSpot = null;
  if (ctx.city() === 'Estados Unidos' || ctx.city() === 'Lua') return []; // USA has usa.ts; Moon has none
  let s = (seed * 61 + 7) >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const build = BY_CITY[ctx.city()];
  const things = build ? build(scene, obstacles, rng, ctx, world) : [];
  // Ensure ?debug always has a spot for QA (Porto/Varsóvia/Londres already set their own).
  const placed = readLastPlaceSpot();
  if (!landmarkDebug && placed) {
    landmarkDebug = {
      spots: { main: { x: placed.x, z: placed.z } },
      count: 1,
      generic: false,
    };
  }
  return things;
}
