import * as THREE from 'three';
import { tone } from './audio';
import { BEACH, PALM_XS, releaseBeachGuard } from './beach';
import type { GameCtx } from './gamectx';
import { HAIRS, SKINS, buildFolk, box, mat, pick, type Folk } from './venue';
import { PERSON_BODY_HALF, PERSON_CLEAR, mulberry32, type Interactable, type Obstacle } from './world';

/**
 * Rio de Janeiro — life on the long beach (beach.ts draws the sand, the promenade and the sea):
 *  - sunbathers lying on towels under colourful umbrellas (umbrellas + towels instanced);
 *  - a beach-volleyball game: net + 4 players batting the ball back and forth over the net, in a loop;
 *    when she walks up to the side of the court (or taps the court / the ball) the next pass comes to her and
 *    bounces back into the game;
 *  - people walking up and down the promenade and the wet sand (never on a road: the roads end at the promenade);
 *  - people in the sea, out past where she may go (heads and shoulders above the water, two on rubber rings,
 *    one splashing).
 * She may paddle at the water's edge (splashes at her feet); a bit further it is deep: an invisible wall
 * (beach.ts) holds her back and a wave splashes at her (the narrator says it once in a while).
 * The first time she reaches the beach the narrator says "Que praia tão comprida! É como Copacabana!" (flag).
 * No UI anywhere: people wave, the ball comes, the water splashes.
 *
 * Built at the end of the Rio landmarks (landmarks-rio.ts): it also drops the placement guard of beach.ts.
 */

const COURT = { x: 35, z: 127, hw: 8, hd: 4 };
/** Where she stands to join the game (beside the court, sea side, on team A's half). */
const BALL_SPOT = new THREE.Vector3(COURT.x - 3, 0, COURT.z + COURT.hd + 2.2);
/** Umbrellas (pole x), clear of the volleyball court. */
const UMBRELLA_XS = [-132, -116, -98, -81, -63, -44, -27, -9, 9, 58, 75, 93, 111, 128];
/** Which towels have someone lying on them. */
const SUNBATHER_TOWELS = [0, 3, 6, 9, 13, 16];
const WATER_Y = 0.1;
/** Lines the walkers keep to: the promenade and the wet sand. */
const WALK_LINES = [BEACH.prom0 + 2.0, BEACH.prom0 + 4.0, BEACH.shore - 1.4, BEACH.shore - 2.4];

const SUITS = [0xe03131, 0x1971c2, 0xf08c00, 0x9c36b5, 0x2f9e44, 0xf06595, 0x15aabf, 0xfab005];

type Walker = { folk: Folk; z: number; x: number; dir: number; speed: number; phase: number; waveT: number; body: Obstacle; spot: THREE.Vector3 };
type Swimmer = { folk: Folk; kind: 'swim' | 'ring' | 'splash'; x: number; z: number; x0: number; x1: number; dir: number; phase: number; waveT: number; ring?: THREE.Mesh };
type Sunbather = { folk: Folk; holder: THREE.Group; waveT: number; x: number; z: number };
type Splash = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };

/** Lying on the back on a towel, head towards the city (the umbrella side). */
function layDown(f: Folk, holder: THREE.Group, x: number, z: number): void {
  holder.rotation.order = 'YXZ';
  holder.rotation.set(Math.PI / 2, Math.PI, 0);
  holder.position.set(x, 0.3, z + 1.05); // feet towards the sea, head on the towel's far end
  f.armL.rotation.set(0, 0, -0.25);
  f.armR.rotation.set(0, 0, 0.25);
}

export function buildBeachLife(scene: THREE.Scene, obstacles: Obstacle[], ctx: GameCtx, seed: number, dbg: Record<string, unknown>): Interactable[] {
  releaseBeachGuard(); // the city is built: the sand is walkable ground again
  const rng = mulberry32(seed * 101 + 29);
  const root = new THREE.Group();
  root.name = 'beach-life';
  scene.add(root);
  const things: Interactable[] = [];

  /* —— umbrellas (pole + two-tone canopy) and towels, instanced —— */
  const n = UMBRELLA_XS.length;
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6);
  poleGeo.translate(0, 1.25, 0);
  const poles = new THREE.InstancedMesh(poleGeo, mat(0xf8f9fa), n);
  const canopyGeo = new THREE.ConeGeometry(1.7, 0.6, 10, 1, true).toNonIndexed();
  canopyGeo.translate(0, 2.55, 0);
  // white stripes: every other segment of the same cone, a hair bigger
  const stripeGeo = (() => {
    const p = canopyGeo.getAttribute('position') as THREE.BufferAttribute;
    const keep: number[] = [];
    const tris = p.count / 3;
    for (let t = 0; t < tris; t++) {
      const cx = (p.getX(t * 3) + p.getX(t * 3 + 1) + p.getX(t * 3 + 2)) / 3;
      const cz = (p.getZ(t * 3) + p.getZ(t * 3 + 1) + p.getZ(t * 3 + 2)) / 3;
      const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 10) % 10;
      if (seg % 2 === 0) for (let k = 0; k < 3; k++) keep.push(p.getX(t * 3 + k) * 1.01, p.getY(t * 3 + k) + 0.005, p.getZ(t * 3 + k) * 1.01);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
    g.computeVertexNormals();
    return g;
  })();
  canopyGeo.computeVertexNormals();
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, n);
  const stripes = new THREE.InstancedMesh(stripeGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), n);
  const towelSpots: { x: number; z: number }[] = [];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const UMB_COLS = [0xff6b6b, 0x4dabf7, 0xfcc419, 0x51cf66, 0xf783ac, 0xff922b, 0x9775fa, 0x20c997];
  UMBRELLA_XS.forEach((x, i) => {
    const z = i % 2 === 0 ? 122.5 : 128.5;
    m4.makeRotationZ((rng() - 0.5) * 0.12).setPosition(x, 0, z);
    poles.setMatrixAt(i, m4);
    canopies.setMatrixAt(i, m4);
    stripes.setMatrixAt(i, m4);
    canopies.setColorAt(i, col.setHex(UMB_COLS[i % UMB_COLS.length]));
    obstacles.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 });
    towelSpots.push({ x: x + 1.0, z: z + 0.2 });
    if (i % 3 !== 1) towelSpots.push({ x: x - 1.0, z: z + 0.2 });
  });
  poles.castShadow = canopies.castShadow = true;
  root.add(poles, canopies, stripes);

  const towelGeo = new THREE.BoxGeometry(0.95, 0.03, 2.2);
  towelGeo.translate(0, 0.045, 0);
  const towels = new THREE.InstancedMesh(towelGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), towelSpots.length);
  const TOWEL_COLS = [0xffd43b, 0x74c0fc, 0xff8787, 0x8ce99a, 0xe599f7, 0xffa94d, 0xffffff];
  towelSpots.forEach((t, i) => {
    m4.makeRotationY((rng() - 0.5) * 0.15).setPosition(t.x, 0, t.z);
    towels.setMatrixAt(i, m4);
    towels.setColorAt(i, col.setHex(TOWEL_COLS[i % TOWEL_COLS.length]));
    obstacles.push({ minX: t.x - 0.5, maxX: t.x + 0.5, minZ: t.z - 1.15, maxZ: t.z + 1.15, height: 0.5 });
  });
  towels.receiveShadow = true;
  root.add(towels);

  /* —— sunbathers —— */
  const sunbathers: Sunbather[] = [];
  for (const ti of SUNBATHER_TOWELS) {
    const t = towelSpots[ti];
    if (!t) continue;
    const f = buildFolk({ shirt: pick(rng, SUITS), pants: 0, skin: pick(rng, SKINS), hair: pick(rng, HAIRS), bare: true, longHair: rng() < 0.5 });
    box(f.head, mat(0x111111), 0.4, 0.09, 0.05, 0, 0.05, -0.29); // sunglasses
    const holder = new THREE.Group();
    holder.add(f.group);
    layDown(f, holder, t.x, t.z);
    root.add(holder);
    const s: Sunbather = { folk: f, holder, waveT: 0, x: t.x, z: t.z };
    sunbathers.push(s);
    things.push({
      object: holder,
      position: new THREE.Vector3(t.x + 1.4, 0, t.z),
      radius: 1.3,
      requiresClick: true,
      interact() {
        s.waveT = 2.5;
        [660, 880].forEach((fq, i) => tone(fq, i * 0.12, 0.12, 'triangle', 0.04));
      },
    });
  }

  /* —— splashes (one small shared pool) —— */
  const splashGeo = new THREE.IcosahedronGeometry(0.09, 0);
  const splashMat = new THREE.MeshBasicMaterial({ color: 0xf1fbff });
  const splashes: Splash[] = [];
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(splashGeo, splashMat);
    m.visible = false;
    root.add(m);
    splashes.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
  }
  let splashNext = 0;
  const splash = (x: number, y: number, z: number, count: number, power: number): void => {
    for (let i = 0; i < count; i++) {
      const s = splashes[splashNext++ % splashes.length];
      s.mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2;
      s.vel.set(Math.cos(a) * power * 0.6, power * (1.2 + Math.random()), Math.sin(a) * power * 0.6);
      s.life = 0.9;
      s.mesh.visible = true;
      s.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
    }
  };

  /* —— volleyball —— */
  const court = new THREE.Group();
  court.name = 'volleyball';
  root.add(court);
  const white = mat(0xffffff);
  for (const [sx, sz, x, z] of [
    [COURT.hw * 2, 0.1, COURT.x, COURT.z - COURT.hd],
    [COURT.hw * 2, 0.1, COURT.x, COURT.z + COURT.hd],
    [0.1, COURT.hd * 2, COURT.x - COURT.hw, COURT.z],
    [0.1, COURT.hd * 2, COURT.x + COURT.hw, COURT.z],
  ] as const)
    box(court, white, sx, 0.02, sz, x, 0.04, z);
  const netZ0 = COURT.z - COURT.hd - 0.6;
  const netZ1 = COURT.z + COURT.hd + 0.6;
  for (const z of [netZ0, netZ1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.55, 8), mat(0x495057));
    p.position.set(COURT.x, 1.275, z);
    p.castShadow = true;
    court.add(p);
    obstacles.push({ minX: COURT.x - 0.15, maxX: COURT.x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 });
  }
  const net = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.95, netZ1 - netZ0),
    new THREE.MeshStandardMaterial({ color: 0x212529, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  net.position.set(COURT.x, 1.95, COURT.z);
  court.add(net);
  box(court, white, 0.05, 0.08, netZ1 - netZ0, COURT.x, 2.43, COURT.z);
  obstacles.push({ minX: COURT.x - 0.08, maxX: COURT.x + 0.08, minZ: netZ0, maxZ: netZ1, height: 2.5 });

  const TEAM = [
    { shirt: 0xfcc419, cap: 0x2b8a3e }, // yellow & green
    { shirt: 0x1c7ed6, cap: 0xffffff }, // blue & white
  ];
  const playerSpots = [
    { x: COURT.x - 3, z: COURT.z - 1.8, team: 0 },
    { x: COURT.x + 3, z: COURT.z + 1.8, team: 1 },
    { x: COURT.x - 5.5, z: COURT.z + 2.0, team: 0 },
    { x: COURT.x + 5.5, z: COURT.z - 2.0, team: 1 },
  ];
  const players = playerSpots.map((p) => {
    const f = buildFolk({ shirt: TEAM[p.team].shirt, pants: 0, skin: pick(rng, SKINS), hair: pick(rng, HAIRS), bare: true, cap: TEAM[p.team].cap, longHair: rng() < 0.5 });
    f.group.position.set(p.x, 0, p.z);
    f.group.rotation.y = p.team === 0 ? -Math.PI / 2 : Math.PI / 2; // face the net
    court.add(f.group);
    obstacles.push({ minX: p.x - PERSON_BODY_HALF * 0.6, maxX: p.x + PERSON_BODY_HALF * 0.6, minZ: p.z - PERSON_BODY_HALF * 0.6, maxZ: p.z + PERSON_BODY_HALF * 0.6 });
    return { folk: f, x: p.x, z: p.z, team: p.team, hopT: 0 };
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat(0xfff3bf));
  const ballBand = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 16), mat(0x1c7ed6));
  ballMesh.add(ballBand);
  ballMesh.castShadow = true;
  court.add(ballMesh);
  /** -1 = her. */
  let hitter = 0;
  let receiver = 1;
  let passT = 0;
  let herRequested = false;
  let herPasses = 0;
  const from = new THREE.Vector3(players[0].x, 2.3, players[0].z);
  const to = new THREE.Vector3();
  const PASS = 1.55;
  const ORDER = [0, 1, 2, 3];
  const targetOf = (who: number, out: THREE.Vector3): THREE.Vector3 =>
    who < 0 ? out.set(ctx.player.x, ctx.player.y + 1.9, ctx.player.z) : out.set(players[who].x, 2.35, players[who].z);
  const nextAfter = (who: number): number => {
    if (who < 0) return 1; // from her: over the net to team B
    if (herRequested && players[who].team === 1) return -1; // across the net to her (she is on team A's side)
    return ORDER[(ORDER.indexOf(who) + 1) % ORDER.length];
  };
  const courtThing: Interactable = {
    object: court,
    position: BALL_SPOT.clone(),
    radius: 1.8,
    interact() {
      herRequested = true;
      tone(784, 0, 0.1, 'triangle', 0.04);
    },
  };
  things.push(courtThing);

  /* —— walkers —— */
  const walkers: Walker[] = WALK_LINES.map((z, i) => {
    const f = buildFolk({
      shirt: pick(rng, SUITS),
      pants: pick(rng, [0x1864ab, 0xf8f9fa, 0x2b8a3e, 0xe8590c]),
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      bare: i >= 2, // on the wet sand: swimsuits; on the promenade: shirts and shorts
      longHair: rng() < 0.5,
      cap: rng() < 0.4 ? pick(rng, [0xffffff, 0xffd43b, 0xff8787]) : undefined,
    });
    const x = -120 + rng() * 240;
    f.group.position.set(x, 0, z);
    root.add(f.group);
    const bh = PERSON_BODY_HALF * 0.75;
    const body: Obstacle = { minX: x - bh, maxX: x + bh, minZ: z - bh, maxZ: z + bh };
    obstacles.push(body);
    return { folk: f, z, x, dir: rng() < 0.5 ? 1 : -1, speed: 1.0 + rng() * 0.35, phase: rng() * 6, waveT: 0, body, spot: new THREE.Vector3(x, 0, z) };
  });
  for (const w of walkers) {
    things.push({
      object: w.folk.group,
      position: w.spot,
      radius: 2.3,
      keepClear: PERSON_CLEAR,
      interact() {
        w.waveT = 2.5;
        [523, 659, 784].forEach((fq, i) => tone(fq, i * 0.1, 0.12, 'triangle', 0.04));
      },
    });
  }

  /* —— people in the sea (past the deep line, so she never reaches them) —— */
  const seaKinds: Swimmer['kind'][] = ['swim', 'swim', 'splash', 'ring', 'ring'];
  const swimmers: Swimmer[] = seaKinds.map((kind, i) => {
    const f = buildFolk({ shirt: pick(rng, SUITS), pants: 0, skin: pick(rng, SKINS), hair: pick(rng, HAIRS), bare: true, longHair: rng() < 0.5 });
    const xc = [-70, 20, 52, -20, 95][i];
    const z = BEACH.wade + [7, 11, 5.5, 8.5, 6.5][i];
    const s: Swimmer = { folk: f, kind, x: xc, z, x0: xc - 18, x1: xc + 18, dir: i % 2 ? 1 : -1, phase: rng() * 6, waveT: 0 };
    if (kind === 'ring') {
      s.ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.17, 8, 18), mat(pick(rng, [0xff6b6b, 0xfcc419, 0x51cf66, 0xcc5de8])));
      s.ring.rotation.x = Math.PI / 2;
      s.ring.position.y = 1.3;
      f.group.add(s.ring);
    }
    root.add(f.group);
    return s;
  });

  /* —— she paddles; the narrator —— */
  const prev = new THREE.Vector3().copy(ctx.player);
  let stepT = 0;
  let wasDeep = false;
  let deepSaidAt = -Infinity;
  let time = 0;
  const live: Record<string, unknown> = {};
  const spots = (dbg.spots as Record<string, unknown>) ?? {};
  spots.promenade = { x: -20, z: BEACH.prom0 + 3 };
  spots.sand = { x: -20, z: 125 };
  spots.water = { x: -20, z: BEACH.shore + 1.5 };
  spots.ballSpot = { x: BALL_SPOT.x, z: BALL_SPOT.z };
  spots.court = { x: COURT.x, z: COURT.z };
  dbg.spots = spots;
  dbg.beach = live;
  Object.assign(live, {
    side: '+z',
    promenade: [BEACH.prom0, BEACH.prom1],
    sand: [BEACH.prom1, BEACH.shore],
    shore: BEACH.shore,
    wadeMax: BEACH.wade,
    umbrellas: n,
    towels: towelSpots.length,
    palms: PALM_XS.length,
    people: { sea: swimmers.length, sun: sunbathers.length, volley: players.length, walkers: walkers.length },
  });

  const setWalkPose = (f: Folk, ph: number, amt: number): void => {
    const s = Math.sin(ph) * 0.55 * amt;
    f.legL.rotation.x = s;
    f.legR.rotation.x = -s;
    f.armL.rotation.x = -s * 0.8;
    f.armR.rotation.x = s * 0.8;
  };
  const waveArm = (f: Folk, t: number): void => {
    f.armR.rotation.set(0, 0, 2.6 + Math.sin(t * 12) * 0.35);
  };

  const lifeThing: Interactable = {
    object: new THREE.Group(), // never in the scene: this one only animates
    position: new THREE.Vector3(0, -999, 0),
    radius: 0,
    interact() {},
    update(dt) {
      time += dt;
      const p = ctx.player;
      const onBeach = p.z > BEACH.prom0 + 0.5 && Math.abs(p.x) < BEACH.half;

      /* first visit: the narrator + the nearest walker waves */
      if (onBeach && ctx.flag('rio:praia') <= 0 && !ctx.isPaused()) {
        ctx.setFlag('rio:praia', 1);
        ctx.say(['Que praia tão comprida! É como Copacabana!']);
        let best: Walker | null = null;
        for (const w of walkers) if (!best || Math.abs(w.x - p.x) + Math.abs(w.z - p.z) < Math.abs(best.x - p.x) + Math.abs(best.z - p.z)) best = w;
        if (best) best.waveT = 3;
      }

      /* paddling */
      const moved = Math.hypot(p.x - prev.x, p.z - prev.z);
      prev.copy(p);
      const inWater = p.z > BEACH.shore - 0.2 && Math.abs(p.x) < BEACH.half + 20 && p.y < 1;
      if (inWater && moved > 0.005 && moved < 2) {
        stepT -= dt;
        if (stepT <= 0) {
          stepT = 0.32;
          splash(p.x, WATER_Y + 0.05, p.z, 3, 1.1);
          tone(700 + Math.random() * 500, 0, 0.06, 'sine', 0.025);
          tone(320 + Math.random() * 200, 0.03, 0.09, 'triangle', 0.018);
        }
      }
      const deep = inWater && p.z > BEACH.wade - 0.08;
      if (deep && !wasDeep) {
        // a little wave splashes at her: no further than this
        splash(p.x, WATER_Y + 0.1, p.z + 0.6, 8, 1.8);
        tone(260, 0, 0.25, 'sine', 0.05);
        tone(520, 0.05, 0.2, 'triangle', 0.03);
        if (time - deepSaidAt > 45) {
          deepSaidAt = time;
          ctx.say(['Mais para lá é fundo! Brinca aqui, à beira da água.']);
        }
      }
      wasDeep = deep;

      /* splashes fly and fall */
      for (const s of splashes) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0 || s.mesh.position.y < WATER_Y - 0.1) {
          s.life = 0;
          s.mesh.visible = false;
        }
      }

      /* walkers */
      for (const w of walkers) {
        const f = w.folk;
        const dx = p.x - w.x;
        const dz = p.z - w.z;
        const near = dx * dx + dz * dz < 2.6 * 2.6;
        if (near || w.waveT > 0) {
          // stop, look at her and wave
          w.waveT = Math.max(0, w.waveT - dt);
          const want = Math.atan2(-dx, -dz);
          f.group.rotation.y += Math.atan2(Math.sin(want - f.group.rotation.y), Math.cos(want - f.group.rotation.y)) * Math.min(1, dt * 6);
          setWalkPose(f, 0, 0);
          if (near || w.waveT > 0) waveArm(f, time + w.phase);
        } else {
          let nx = w.x + w.dir * w.speed * dt;
          if (nx > BEACH.half - 8 || nx < -BEACH.half + 8) {
            w.dir = -w.dir;
            nx = w.x;
          }
                    w.x = nx;
          w.phase += dt * w.speed * 4.2;
          f.group.rotation.y = w.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          f.armR.rotation.z = 0;
          setWalkPose(f, w.phase, 1);
        }
        f.group.position.set(w.x, Math.abs(Math.sin(w.phase)) * 0.04, w.z);
        w.spot.set(w.x, 0, w.z);
        const h = PERSON_BODY_HALF * 0.75;
        w.body.minX = w.x - h;
        w.body.maxX = w.x + h;
        w.body.minZ = w.z - h;
        w.body.maxZ = w.z + h;
      }

      /* sunbathers: the one nearest to her (< 3.5 m) waves; the others now and then lift a hand */
      for (const s of sunbathers) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < 3.5) s.waveT = Math.max(s.waveT, 0.3);
        const f = s.folk;
        if (s.waveT > 0) {
          s.waveT -= dt;
          f.armR.rotation.set(-Math.PI / 2, 0, Math.sin(time * 10) * 0.45);
        } else {
          f.armR.rotation.x += (0 - f.armR.rotation.x) * Math.min(1, dt * 4);
          f.armR.rotation.z = 0.25;
          f.legL.rotation.x = Math.max(0, Math.sin(time * 0.5 + s.x)) * -0.5; // a knee up now and then
        }
      }

      /* swimmers */
      const playerSwimNear = inWater;
      for (const s of swimmers) {
        const f = s.folk;
        s.phase += dt;
        const bob = Math.sin(s.phase * 1.4) * 0.07;
        const lookAtHer = playerSwimNear && Math.hypot(p.x - s.x, p.z - s.z) < 25;
        if (s.kind === 'swim') {
          s.x += s.dir * 0.65 * dt;
          if (s.x > s.x1 || s.x < s.x0) s.dir = -s.dir;
          f.group.rotation.y = s.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          const sweep = Math.max(0, Math.sin(s.phase * 2.4));
          f.armL.rotation.set(-1.45 + sweep * 0.3, 0, -sweep * 0.9);
          f.armR.rotation.set(-1.45 + sweep * 0.3, 0, sweep * 0.9);
          if (Math.sin(s.phase * 2.4) > 0.97 && Math.random() < 0.3) splash(s.x - Math.sin(f.group.rotation.y) * 0.6, WATER_Y, s.z, 2, 0.7);
        } else if (s.kind === 'splash') {
          // slaps the water with both hands, laughing splashes
          const k = (s.phase % 3.2) / 3.2;
          const up = k < 0.25 ? k / 0.25 : k < 0.32 ? 1 - (k - 0.25) / 0.07 : 0;
          f.armL.rotation.set(0, 0, -0.4 - up * 2.2);
          f.armR.rotation.set(0, 0, 0.4 + up * 2.2);
          if (k > 0.31 && k < 0.31 + dt / 3.2 + 0.005) {
            splash(s.x - 0.5, WATER_Y, s.z, 5, 1.6);
            splash(s.x + 0.5, WATER_Y, s.z, 5, 1.6);
          }
          f.group.rotation.y = Math.atan2(-(p.x - s.x), -(p.z - s.z)); // plays facing the beach
        } else {
          // on the ring: drift, arms resting on it
          s.x += Math.sin(s.phase * 0.12) * 0.15 * dt;
          f.group.rotation.y = s.phase * 0.08;
          f.armL.rotation.set(0, 0, -1.25);
          f.armR.rotation.set(0, 0, 1.25);
        }
        if (lookAtHer && s.kind !== 'splash') {
          s.waveT = 1;
        }
        if (s.waveT > 0) {
          s.waveT -= dt * 0.25;
          waveArm(f, s.phase * 1.3);
        }
        f.group.position.set(s.x, WATER_Y - 1.3 + bob + (s.kind === 'ring' ? 0.08 : 0), s.z);
      }

      /* volleyball loop */
      passT += dt / PASS;
      const herAway = Math.hypot(p.x - BALL_SPOT.x, p.z - BALL_SPOT.z) > 6;
      if (receiver < 0 && herAway && passT < 0.5) {
        // she walked away before the ball got there: it goes to team A instead
        receiver = 0;
      }
      targetOf(receiver, to);
      const k = Math.min(1, passT);
      ballMesh.position.lerpVectors(from, to, k);
      ballMesh.position.y += Math.sin(k * Math.PI) * (receiver < 0 || hitter < 0 ? 3.2 : 4.2);
      ballMesh.rotation.x += dt * 6;
      ballMesh.rotation.z += dt * 3;
      // the receiver gets ready (arms up), then bumps it
      for (let i = 0; i < players.length; i++) {
        const pl = players[i];
        const f = pl.folk;
        const ready = i === receiver && passT > 0.6;
        pl.hopT = Math.max(0, pl.hopT - dt);
        const hop = Math.sin((pl.hopT / 0.45) * Math.PI) * 0.35;
        f.group.position.y = pl.hopT > 0 ? hop : 0;
        const armUp = ready || pl.hopT > 0 ? -2.7 : -0.25 + Math.sin(time * 2 + i) * 0.08;
        f.armL.rotation.x += (armUp - f.armL.rotation.x) * Math.min(1, dt * 10);
        f.armR.rotation.x = f.armL.rotation.x;
        // shuffle a little towards the ball's landing spot
        if (i === receiver) {
          const lx = pl.x + Math.sin(time * 1.7 + i) * 0.25;
          f.group.position.x = lx;
        }
      }
      if (passT >= 1) {
        passT = 0;
        from.copy(to);
        if (receiver < 0) {
          herPasses++;
          herRequested = false;
          [523, 784].forEach((fq, i) => tone(fq, i * 0.08, 0.1, 'square', 0.035));
          splash(p.x, 0.1, p.z, 3, 0.6); // a puff of sand at her feet
        } else {
          players[receiver].hopT = 0.45;
          tone(330 + receiver * 30, 0, 0.07, 'square', 0.03);
        }
        hitter = receiver;
        receiver = nextAfter(hitter);
        if (receiver < 0 && Math.hypot(p.x - BALL_SPOT.x, p.z - BALL_SPOT.z) > 6) {
          herRequested = false;
          receiver = ORDER[(ORDER.indexOf(hitter) + 1) % ORDER.length];
        }
      }
      courtThing.position.copy(BALL_SPOT);

      live.inWater = inWater;
      live.deep = deep;
      live.herPasses = herPasses;
      live.ball = { hitter, receiver, t: +passT.toFixed(2) };
      live.player = { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
      live.said = ctx.flag('rio:praia') > 0;
    },
  };
  things.push(lifeThing);
  return things;
}
