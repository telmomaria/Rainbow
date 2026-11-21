import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { GameCtx } from './gamectx';
import { parkSite, siteBox, siteGroup, type Site } from './places';
import type { SwingSeat } from './props';
import type { Interactable, Obstacle, World } from './world';

/**
 * Parque infantil (Telmo, 2026-11-19: "escorrega ao contrário, demasiado pequeno, poucas diversões").
 * One fenced park with a soft floor and, all together:
 *  - a big play structure: tall tower + tube slide, low tower + wavy open slide, a bridge, ladder, net;
 *  - a swing set (2 seats), a roundabout, two spring riders (horse + ladybird).
 * Everything is ridden SITTING (SwingSeat): tap / Enter next to it; any key or tap gets her off; slides end by
 * themselves (`done`). No UI, feedback only in the world.
 *
 * Site frame: origin at the front edge centre, the park spans x ∈ [−W, W], z ∈ [−D, 0].
 */

const mat = (c: number, extra?: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });

function box(p: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  p.add(mesh);
  return mesh;
}
function cyl(p: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  p.add(mesh);
  return mesh;
}

/** World heading for someone facing the group's local direction (dx, dz). */
function headingOf(g: THREE.Object3D, dx: number, dz: number): number {
  const d = new THREE.Vector3(dx, 0, dz).transformDirection(g.matrixWorld);
  return Math.atan2(-d.x, -d.z);
}

const W = 10;
const QA = new URLSearchParams(location.search).has('debug');
const D = 19; // deep enough for a ≥2.5 m walkway behind the ladder/net (Telmo 2026-11-21: "a cerca está muito próxima das escadas")

/**
 * A slide ridden sitting: she climbs up (ladder / net, standing), crosses the deck, sits at the top, slides down the
 * path (facing down the slide, leaning with it) and gets off at the bottom by herself.
 * While she's on it the camera is the ride's own (`rainbow-aerial` with fromX/fromZ): first behind the ladder, then
 * gliding to a three-quarter front view of the slide so she's seen going down; cleared when she gets off.
 */
function slideSeat(
  g: THREE.Group,
  path: THREE.Vector3[],
  climb: THREE.Vector3[],
  cams: { climb: THREE.Vector3; slide: THREE.Vector3 },
  sound: 'tube' | 'wave',
  ctx: GameCtx,
  speed = 3,
): { seat: SwingSeat; update: (dt: number) => void } {
  const curve = new THREE.CatmullRomCurve3(path);
  const len = curve.getLength();
  // climbing: polyline at walking-up speed
  const CLIMB_V = 1.9;
  const legT: number[] = [];
  let climbT = 0;
  for (let i = 0; i < climb.length - 1; i++) {
    climbT += climb[i].distanceTo(climb[i + 1]) / CLIMB_V;
    legT.push(climbT);
  }
  const SIT = 0.6; // sitting at the top before letting go
  const slideT = len / speed;
  const total = climbT + SIT + slideT;
  let t = -1; // −1 = nobody on it
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const local = (): { p: THREE.Vector3; dir: THREE.Vector3; sit: boolean; tilt: number } => {
    if (t < climbT) {
      let i = 0;
      while (i < legT.length - 1 && t > legT[i]) i++;
      const t0 = i === 0 ? 0 : legT[i - 1];
      const k = Math.min(1, Math.max(0, (t - t0) / (legT[i] - t0)));
      const a = climb[i];
      const b = climb[i + 1];
      const d = b.clone().sub(a).setY(0);
      // on the ladder (vertical leg) she faces the tower = the direction of the next level leg
      const dir = d.lengthSq() > 0.01 ? d : (climb[i + 2] ?? path[0]).clone().sub(b).setY(0);
      return { p: a.clone().lerp(b, k), dir, sit: false, tilt: 0 };
    }
    const k = Math.min(1, Math.max(0, (t - climbT - SIT) / slideT));
    const e = k * k * (1.6 - 0.6 * k); // speeds up, eases out a little at the bottom
    const p = curve.getPointAt(Math.min(1, e));
    const tan = curve.getTangentAt(Math.min(0.999, Math.max(0.001, e)));
    const tilt = k > 0 ? Math.atan2(tan.y, Math.hypot(tan.x, tan.z)) * 0.7 : 0;
    return { p: p.clone().setY(p.y + 0.12), dir: tan.clone().setY(0), sit: true, tilt };
  };
  const aerial = (on: boolean) => {
    if (!on) {
      window.dispatchEvent(new CustomEvent('rainbow-aerial', { detail: null }));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('rainbow-aerial', { detail: { x: camLook.x, z: camLook.z, h: camPos.y, fromX: camPos.x, fromZ: camPos.z, lookY: camLook.y } }),
    );
  };
  const seat: SwingSeat = {
    take() {
      t = 0;
      feel('play');
      g.updateMatrixWorld(true);
      camPos.copy(g.localToWorld(cams.climb.clone()));
      camLook.copy(g.localToWorld(climb[0].clone().setY(1.2)));
      aerial(true);
      return 0;
    },
    pose() {
      g.updateMatrixWorld(true);
      const s = local();
      const pos = g.localToWorld(s.p.clone());
      const heading = headingOf(g, s.dir.x, s.dir.z);
      if (QA) document.body.dataset.slide = JSON.stringify([+pos.y.toFixed(2), s.sit, +t.toFixed(2)]); // QA (?debug): height, sitting, ride time
      return s.sit ? { pos, heading, tilt: s.tilt } : { pos, heading, tilt: 0, stand: true };
    },
    done: () => t >= total,
    leave() {
      t = -1;
      aerial(false);
    },
    getOff() {
      const end = path[path.length - 1];
      const before = path[path.length - 2];
      const dir = end.clone().sub(before).setY(0).normalize();
      return g.localToWorld(end.clone().addScaledVector(dir, 1.0).setY(0));
    },
  };
  return {
    seat,
    update(dt) {
      if (t < 0) return;
      const was = t;
      t += dt;
      const go = climbT + SIT;
      if (was < climbT && t >= climbT) ctx.say(['Wiiii!']);
      if (was < go && t >= go) {
        if (sound === 'tube') [700, 600, 500, 420, 360].forEach((f, i) => tone(f, i * 0.12, 0.14, 'sine', 0.05));
        else [523, 659, 523, 659, 784].forEach((f, i) => tone(f, i * 0.13, 0.12, 'triangle', 0.05));
      }
      // camera: behind the ladder while she climbs, then glides round to watch the slide from the side-front
      g.updateMatrixWorld(true);
      const s = local();
      const want = g.localToWorld((t < climbT * 0.4 ? cams.climb : cams.slide).clone());
      const r = Math.min(1, dt * 1.8);
      camPos.lerp(want, r);
      camLook.lerp(g.localToWorld(s.p.clone().setY(s.p.y + 0.8)), Math.min(1, dt * 4));
      aerial(true);
    },
  };
}

function buildStructure(g: THREE.Group, obstacles: Obstacle[], site: Site, ctx: GameCtx): Interactable[] {
  const yellow = mat(0xffd43b);
  const red = mat(0xfa5252);
  const green = mat(0x40c057);
  const blue = mat(0x339af0);
  // see-through tube (coloured plastic): she can be seen sliding inside it
  const cyan = mat(0x22b8cf, { side: THREE.DoubleSide, transparent: true, opacity: 0.42, depthWrite: false });
  const cyanDeep = mat(0x0c8599);
  const orange = mat(0xff922b);
  const purple = mat(0x9775fa);

  // tall tower (deck 3.3 m) on the left, low tower (deck 2.0 m) to its right, bridge between them
  // (x/z keep ≥2.5 m of free floor between the fence and the ladder, the net, the tower sides and both slide exits)
  const T1 = { x: -5.8, z: -14.0, deck: 3.3 };
  const T2 = { x: -0.8, z: -14.0, deck: 2.0 };
  for (const [T, wall, roof] of [
    [T1, yellow, red],
    [T2, blue, purple],
  ] as const) {
    // corner posts + deck + half walls (open so she can be seen up there)
    for (const sx of [-1.25, 1.25]) for (const sz of [-1.25, 1.25]) cyl(g, green, 0.12, T.deck + 1.6, T.x + sx, (T.deck + 1.6) / 2, T.z + sz, 8);
    box(g, mat(0xffe8cc), 2.6, 0.16, 2.6, T.x, T.deck, T.z);
    // back half wall with a gap in the middle: that's where the ladder / net arrives
    for (const sx of [-0.95, 0.95]) box(g, wall, 0.7, 0.9, 0.1, T.x + sx, T.deck + 0.55, T.z - 1.3);
    box(g, wall, 0.1, 0.9, 2.6, T.x - 1.3, T.deck + 0.55, T.z);
    // pointed roof
    const r = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.3, 4), roof);
    r.position.set(T.x, T.deck + 2.25, T.z);
    r.rotation.y = Math.PI / 4;
    r.castShadow = true;
    g.add(r);
    // solid base under the deck so it reads as a play house, with a round window
    box(g, wall, 2.4, T.deck - 0.2, 2.4, T.x, (T.deck - 0.2) / 2, T.z);
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), mat(0x1c7ed6, { emissive: 0x1864ab, emissiveIntensity: 0.3 }));
    win.position.set(T.x, T.deck * 0.5, T.z + 1.21);
    g.add(win);
  }
  // bridge with rope rails
  box(g, mat(0xc08552), 2.6, 0.12, 1.1, (T1.x + T2.x) / 2, (T1.deck + T2.deck) / 2, T1.z);
  for (const s of [-0.55, 0.55]) box(g, orange, 2.6, 0.08, 0.08, (T1.x + T2.x) / 2, (T1.deck + T2.deck) / 2 + 0.8, T1.z + s);
  // ladder at the back of the tall tower, climbing net at the back of the low one
  // (own groups: tapping the ladder / net = climb up and slide down)
  const ladderG = new THREE.Group();
  const netG = new THREE.Group();
  g.add(ladderG, netG);
  for (const sx of [-0.45, 0.45]) box(ladderG, green, 0.14, T1.deck + 0.4, 0.14, T1.x + sx, (T1.deck + 0.4) / 2, T1.z - 1.55);
  for (let i = 0; i < 10; i++) box(ladderG, yellow, 1.0, 0.08, 0.1, T1.x, 0.3 + i * 0.33, T1.z - 1.55);
  for (let i = 0; i < 5; i++) box(netG, orange, 2.2, 0.06, 0.06, T2.x, 0.4 + i * 0.38, T2.z - 1.6 - i * 0.12);
  for (let i = 0; i < 6; i++) box(netG, orange, 0.06, 2.1, 0.06, T2.x - 1.0 + i * 0.4, 1.1, T2.z - 1.85);
  // rungs and ropes are thin: an unseen box over each makes the whole ladder / net easy to tap
  const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const [p, sx, sy, x, y, z] of [
    [ladderG, 1.2, T1.deck + 0.4, T1.x, (T1.deck + 0.4) / 2, T1.z - 1.6],
    [netG, 2.4, 2.2, T2.x, 1.1, T2.z - 1.85],
  ] as const) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.6), hitMat);
    hit.position.set(x, y, z);
    p.add(hit);
  }

  // TUBE slide from the tall tower, going FORWARD (+Z) and DOWN: high end at the deck, low end on the ground
  const tubeTop = new THREE.Vector3(T1.x, T1.deck + 0.05, T1.z + 1.3);
  const tubeBot = new THREE.Vector3(T1.x, 0.35, T1.z + 7.2);
  const mid = tubeTop.clone().lerp(tubeBot, 0.5);
  const tubeLen = tubeTop.distanceTo(tubeBot);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, tubeLen, 18, 1, true), cyan);
  tube.position.copy(mid);
  // cylinder axis (local Y) along top→bottom
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tubeTop.clone().sub(tubeBot).normalize());
  tube.position.y += 0.35;
  tube.castShadow = true;
  g.add(tube);
  for (const [p, y] of [
    [tubeTop, 0.35],
    [tubeBot, 0.35],
  ] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.1, 8, 20), cyanDeep);
    ring.position.copy(p).setY(p.y + y);
    ring.quaternion.copy(tube.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    g.add(ring);
  }
  // legs under the tube
  for (const k of [0.35, 0.65]) {
    const p = tubeTop.clone().lerp(tubeBot, k);
    cyl(g, green, 0.1, p.y, p.x, p.y / 2, p.z, 8);
  }
  box(g, cyanDeep, 1.4, 0.1, 1.0, tubeBot.x, 0.05, tubeBot.z + 0.6); // landing mat

  // WAVY open slide from the low tower, forward and down, with side rails
  const wave: THREE.Vector3[] = [];
  const wLen = 5.6;
  for (let i = 0; i <= 14; i++) {
    const k = i / 14;
    const z = T2.z + 1.3 + k * wLen;
    const y = T2.deck * (1 - k) + 0.3 * k + Math.sin(k * Math.PI * 3) * 0.28 * (1 - k * 0.6);
    wave.push(new THREE.Vector3(T2.x, Math.max(0.3, y), z));
  }
  const slideMat = mat(0xff6b6b, { metalness: 0.2, roughness: 0.35 });
  const waveG = new THREE.Group(); // its own group: tapping it = slide (never the whole park)
  g.add(waveG);
  for (let i = 0; i < wave.length - 1; i++) {
    const a = wave[i];
    const b = wave[i + 1];
    const seg = box(waveG, slideMat, 1.1, 0.08, a.distanceTo(b) + 0.03, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    seg.rotation.x = Math.atan2(a.y - b.y, b.z - a.z);
    for (const s of [-0.58, 0.58]) {
      const rail = box(waveG, mat(0xffd43b), 0.08, 0.28, a.distanceTo(b) + 0.03, a.x + s, (a.y + b.y) / 2 + 0.14, (a.z + b.z) / 2);
      rail.rotation.x = seg.rotation.x;
    }
  }
  for (const k of [4, 9]) cyl(waveG, green, 0.08, wave[k].y, wave[k].x + 0.45, wave[k].y / 2, wave[k].z, 8);

  // solid parts: both towers + bridge + ladder/net (the slides stay walk-around)
  obstacles.push(siteBox(site, T1.x - 1.4, T2.x + 1.4, T1.z - 2.1, T1.z + 1.4, 3));

  // climb: ladder / net foot → up → over the deck → the top of the slide (feet heights, she's standing)
  const up = (T: { x: number; z: number; deck: number }, back: number, slideTop: THREE.Vector3) => [
    new THREE.Vector3(T.x, 0, T.z - back),
    new THREE.Vector3(T.x, T.deck + 0.08, T.z - 1.75),
    new THREE.Vector3(T.x, T.deck + 0.08, T.z - 0.6),
    new THREE.Vector3(slideTop.x, T.deck + 0.08, slideTop.z - 0.4),
  ];
  // cameras (site frame, kept inside the fence): behind the ladder / net, then three-quarter front of the slide
  const tubeRide = slideSeat(
    g,
    [tubeTop.clone().setY(tubeTop.y + 0.1), tubeTop.clone().lerp(tubeBot, 0.5), tubeBot.clone().setY(0.25)],
    up(T1, 2.1, tubeTop),
    { climb: new THREE.Vector3(-9.2, 5.2, T1.z - 4.3), slide: new THREE.Vector3(-9.2, 4.6, -1.4) },
    'tube',
    ctx,
    3.4,
  );
  const waveRide = slideSeat(
    g,
    [wave[0].clone().setY(wave[0].y + 0.1), ...wave.slice(1)],
    up(T2, 2.3, wave[0]),
    { climb: new THREE.Vector3(T2.x + 3.4, 5.0, T2.z - 4.4), slide: new THREE.Vector3(8.4, 5.0, -1.8) },
    'wave',
    ctx,
    3.0,
  );
  const at = (x: number, z: number) => g.localToWorld(new THREE.Vector3(x, 0, z));
  return [
    {
      object: tube,
      position: at(T1.x + 1.6, T1.z + 2.2),
      radius: 2.6,
      requiresClick: true,
      seat: tubeRide.seat,
      interact: () => !ctx.isPaused() && !ctx.isDriving(),
      update: tubeRide.update,
    },
    {
      object: waveG,
      position: at(T2.x + 1.4, T2.z + 2.4),
      radius: 2.4,
      requiresClick: true,
      seat: waveRide.seat,
      interact: () => !ctx.isPaused() && !ctx.isDriving(),
      update: waveRide.update,
    },
    // the ladder foot (tube) and the net foot (wavy slide): tap it / Enter there = up she goes and down the slide
    {
      object: ladderG,
      position: at(T1.x, T1.z - 2.6),
      radius: 1.8,
      requiresClick: true,
      seat: tubeRide.seat,
      interact: () => !ctx.isPaused() && !ctx.isDriving(),
    },
    {
      object: netG,
      position: at(T2.x, T2.z - 2.7),
      radius: 1.9,
      requiresClick: true,
      seat: waveRide.seat,
      interact: () => !ctx.isPaused() && !ctx.isDriving(),
    },
  ];
}

function buildSwings(g: THREE.Group, obstacles: Obstacle[], site: Site, ctx: GameCtx, cx: number, cz: number): Interactable {
  const frame = mat(0xe8590c);
  const ropeM = mat(0xf1f3f5);
  const sw = new THREE.Group();
  sw.position.set(cx, 0, cz);
  g.add(sw);
  const H = 2.9;
  for (const sx of [-2.1, 2.1])
    for (const sz of [-1, 1]) {
      const leg = cyl(sw, frame, 0.09, H + 0.1, sx, H / 2, sz * 0.38, 8);
      leg.rotation.x = -sz * 0.26;
    }
  const bar = cyl(sw, frame, 0.1, 4.5, 0, H, 0, 8);
  bar.rotation.z = Math.PI / 2;
  const colors = [0xff4d6d, 0x4dabf7];
  const pivots = [-0.95, 0.95].map((x, i) => {
    const p = new THREE.Group();
    p.position.set(x, H, 0);
    sw.add(p);
    for (const rx of [-0.32, 0.32]) cyl(p, ropeM, 0.022, H - 0.5, rx, -(H - 0.5) / 2, 0, 5);
    box(p, mat(colors[i]), 0.8, 0.09, 0.42, 0, -(H - 0.45), 0);
    return p;
  });
  for (const sx of [-2.1, 2.1]) obstacles.push(siteBox(site, cx + sx - 0.2, cx + sx + 0.2, cz - 0.9, cz + 0.9, 3));

  let rider: number | null = null;
  let amp = 0.05;
  let t = 0;
  const seat: SwingSeat = {
    take(p) {
      const local = sw.worldToLocal(p.clone());
      rider = local.x < 0 ? 0 : 1;
      amp = Math.max(amp, 0.35);
      feel('play');
      return rider;
    },
    pose(i) {
      sw.updateMatrixWorld(true);
      const pos = pivots[i].localToWorld(new THREE.Vector3(0, -(H - 0.5), 0));
      return { pos, heading: headingOf(sw, 0, 1), tilt: -pivots[i].rotation.x }; // faces into the park (+Z)
    },
    leave() {
      rider = null;
    },
    getOff: () => sw.localToWorld(new THREE.Vector3(0, 0, 1.9)),
  };
  return {
    object: sw,
    position: sw.localToWorld(new THREE.Vector3(0, 0, 1.2)),
    radius: 3.0,
    requiresClick: true,
    seat,
    interact: () => !ctx.isPaused() && !ctx.isDriving(),
    update(dt) {
      t += dt;
      amp = rider !== null ? Math.min(0.8, amp + dt * 0.15) : Math.max(0.03, amp * Math.exp(-0.4 * dt));
      pivots[0].rotation.x = amp * Math.sin(t * 2.3) * (rider === 1 ? 0.3 : 1);
      pivots[1].rotation.x = amp * Math.sin(t * 2.3 + 1.3) * (rider === 0 ? 0.3 : 1);
    },
  };
}

function buildRoundabout(g: THREE.Group, obstacles: Obstacle[], site: Site, ctx: GameCtx, cx: number, cz: number): Interactable {
  const base = new THREE.Group();
  base.position.set(cx, 0, cz);
  g.add(base);
  cyl(base, mat(0x868e96), 0.25, 0.3, 0, 0.15, 0, 10);
  const spin = new THREE.Group();
  spin.position.y = 0.32;
  base.add(spin);
  // disc in coloured slices
  const cols = [0xff6b6b, 0xffd43b, 0x51cf66, 0x4dabf7, 0x9775fa, 0xff922b];
  cols.forEach((c, i) => {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.14, 8, 1, false, (i / 6) * Math.PI * 2, Math.PI / 3), mat(c));
    slice.castShadow = true;
    slice.receiveShadow = true;
    spin.add(slice);
  });
  // centre post + hand bars
  cyl(spin, mat(0xadb5bd, { metalness: 0.5 }), 0.08, 1.1, 0, 0.6, 0, 8);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const b = cyl(spin, mat(0xadb5bd, { metalness: 0.5 }), 0.04, 1.5, Math.cos(a) * 0.75, 1.1, Math.sin(a) * 0.75, 6);
    b.rotation.z = Math.PI / 2;
    b.rotation.y = -a;
  }
  obstacles.push(siteBox(site, cx - 1.4, cx + 1.4, cz - 1.4, cz + 1.4, 0.6));

  let rider = false;
  let vel = 0;
  let creak = 0;
  const seatLocal = new THREE.Vector3(1.3, 0.1, 0);
  const seat: SwingSeat = {
    take() {
      rider = true;
      vel = Math.max(vel, 2.2);
      feel('play');
      ctx.say(['A rodar, a rodar!']);
      return 0;
    },
    pose() {
      spin.updateMatrixWorld(true);
      const pos = spin.localToWorld(seatLocal.clone());
      const c = spin.localToWorld(new THREE.Vector3(0, 0.1, 0));
      return { pos, heading: Math.atan2(-(c.x - pos.x), -(c.z - pos.z)), tilt: 0 };
    },
    leave() {
      rider = false;
    },
    getOff() {
      spin.updateMatrixWorld(true);
      const p = spin.localToWorld(seatLocal.clone().multiplyScalar(1.7));
      return p.setY(0);
    },
  };
  return {
    object: base,
    position: base.localToWorld(new THREE.Vector3(0, 0, 0)),
    radius: 3.2, // the disc blocks her ~1.9 m out
    requiresClick: true,
    seat,
    interact() {
      if (ctx.isPaused() || ctx.isDriving()) return false;
      vel = Math.min(3, vel + 1.5);
      return true;
    },
    update(dt) {
      // she pushes with a foot now and then; it slows down on its own
      if (rider && vel < 1.6) vel += dt * 1.2;
      vel *= Math.exp(-0.35 * dt);
      spin.rotation.y += vel * dt;
      creak += vel * dt;
      if (creak > Math.PI) {
        creak = 0;
        tone(300 + Math.random() * 40, 0, 0.1, 'sawtooth', 0.015);
      }
    },
  };
}

function buildSpringRider(
  g: THREE.Group,
  obstacles: Obstacle[],
  site: Site,
  ctx: GameCtx,
  cx: number,
  cz: number,
  kind: 'horse' | 'ladybird',
): Interactable {
  const base = new THREE.Group();
  base.position.set(cx, 0, cz);
  g.add(base);
  box(base, mat(0x495057), 0.7, 0.08, 0.7, 0, 0.04, 0);
  // spring coil
  for (let i = 0; i < 6; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14), mat(0xadb5bd, { metalness: 0.6 }));
    coil.rotation.x = Math.PI / 2;
    coil.position.y = 0.12 + i * 0.07;
    base.add(coil);
  }
  const rock = new THREE.Group();
  rock.position.y = 0.5;
  base.add(rock);
  if (kind === 'horse') {
    const body = mat(0xf783ac);
    box(rock, body, 0.42, 0.42, 1.0, 0, 0.2, 0);
    box(rock, body, 0.3, 0.55, 0.32, 0, 0.55, -0.48); // neck
    box(rock, body, 0.3, 0.3, 0.5, 0, 0.8, -0.68); // head
    box(rock, mat(0x7048e8), 0.08, 0.35, 0.5, 0, 0.75, -0.35); // mane
    box(rock, mat(0x7048e8), 0.1, 0.4, 0.1, 0, 0.25, 0.55); // tail
    for (const s of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x212529));
      eye.position.set(s * 1.3, 0.88, -0.86);
      rock.add(eye);
    }
    box(rock, mat(0xffd43b), 0.5, 0.05, 0.05, 0, 0.75, -0.45); // handles
  } else {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe03131));
    shell.scale.set(1, 0.8, 1.2);
    shell.position.y = 0.05;
    rock.add(shell);
    for (const [x, z] of [
      [0.22, 0.1],
      [-0.22, 0.1],
      [0.18, 0.35],
      [-0.18, 0.35],
      [0, -0.2],
    ])
      box(rock, mat(0x212529), 0.12, 0.05, 0.12, x, 0.38 - Math.abs(z) * 0.2, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat(0x212529));
    head.position.set(0, 0.25, -0.62);
    rock.add(head);
    for (const s of [-0.08, 0.08]) cyl(rock, mat(0x212529), 0.02, 0.3, s, 0.5, -0.66, 5);
    box(rock, mat(0xffd43b), 0.5, 0.05, 0.05, 0, 0.5, -0.35);
  }
  obstacles.push(siteBox(site, cx - 0.4, cx + 0.4, cz - 0.6, cz + 0.6, 1));

  let rider = false;
  let t = 0;
  let amp = 0;
  const seat: SwingSeat = {
    take() {
      rider = true;
      feel('play');
      tone(kind === 'horse' ? 660 : 880, 0, 0.12, 'triangle', 0.05);
      return 0;
    },
    pose() {
      rock.updateMatrixWorld(true);
      return { pos: rock.localToWorld(new THREE.Vector3(0, 0.45, 0.05)), heading: headingOf(base, 0, -1), tilt: rock.rotation.x * 0.8 };
    },
    leave() {
      rider = false;
    },
    getOff: () => base.localToWorld(new THREE.Vector3(0.9, 0, 0)),
  };
  return {
    object: base,
    position: base.localToWorld(new THREE.Vector3(0, 0, 0)),
    radius: 2.0,
    requiresClick: true,
    seat,
    interact() {
      if (ctx.isPaused() || ctx.isDriving()) return false;
      amp = Math.max(amp, 0.2);
      return true;
    },
    update(dt) {
      t += dt;
      amp = rider ? Math.min(0.32, amp + dt * 0.3) : amp * Math.exp(-1.2 * dt);
      rock.rotation.x = Math.sin(t * 4) * amp;
      rock.position.z = Math.sin(t * 4) * amp * 0.3;
      if (rider && Math.floor((t - dt) * 4 / Math.PI) !== Math.floor((t * 4) / Math.PI)) tone(kind === 'horse' ? 520 : 700, 0, 0.06, 'sine', 0.02);
    },
  };
}

/** Fence + soft floor around the park, with two open gates (front and back). */
function buildGround(g: THREE.Group, obstacles: Obstacle[], site: Site): void {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.06, D), mat(0x63e6be, { roughness: 0.95 }));
  floor.position.set(0, 0.03, -D / 2);
  floor.receiveShadow = true;
  g.add(floor);
  // a few coloured play circles on the floor
  [
    [2.5, -10.5, 0xffd43b],
    [-1, -3.5, 0xff8787],
    [7.5, -11, 0x74c0fc],
  ].forEach(([x, z, c]) => {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), mat(c));
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(x, 0.065, z);
    g.add(dot);
  });
  const rail = mat(0xf8f9fa);
  const post = mat(0x7950f2);
  const GATE = 1.8; // half width of each gate
  const runs: [number, number, number, number][] = [
    // x0, z0, x1, z1 (straight runs, gates left as gaps)
    [-W, 0, -GATE, 0],
    [GATE, 0, W, 0],
    [-W, -D, -GATE, -D],
    [GATE, -D, W, -D],
    [-W, 0, -W, -D],
    [W, 0, W, -D],
  ];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      cyl(g, post, 0.06, 0.95, x0 + (x1 - x0) * k, 0.475, z0 + (z1 - z0) * k, 6);
    }
    for (const y of [0.45, 0.85]) {
      const r = box(g, rail, x0 === x1 ? 0.06 : len, 0.07, x0 === x1 ? len : 0.06, (x0 + x1) / 2, y, (z0 + z1) / 2);
      r.castShadow = false;
    }
    const pad = 0.15;
    obstacles.push(siteBox(site, Math.min(x0, x1) - pad, Math.max(x0, x1) + pad, Math.min(z0, z1) - pad, Math.max(z0, z1) + pad, 1));
  }
}

/** The whole park, or null if the city has no free space that big. */
export function buildPlayground(scene: THREE.Scene, obstacles: Obstacle[], rng: () => number, ctx: GameCtx, world?: World): Interactable[] | null {
  const opts = { minD: 24, maxD: 120, roadGap: 5 };
  let site = parkSite(obstacles, rng, W + 1, D + 2, opts);
  if (!site && world) {
    // crowded placeholder city (like the fair): ignore the generic buildings, then clear the ones in the way
    site = parkSite(obstacles.filter((o) => !world.buildings.has(o)), rng, W + 1, D + 2, opts);
    if (site) world.clearArea(siteBox(site, -W - 1, W + 1, -D - 1, 1), 2);
  }
  if (!site) return null;
  const g = siteGroup(scene, site);
  g.userData.playSlide = true;
  // QA (?debug): where the park is, so a test can walk her there
  if (new URLSearchParams(location.search).has('debug')) document.body.dataset.park = JSON.stringify(site);
  buildGround(g, obstacles, site);
  const things = buildStructure(g, obstacles, site, ctx);
  things.push(buildSwings(g, obstacles, site, ctx, 5.5, -14.5));
  things.push(buildRoundabout(g, obstacles, site, ctx, 5.5, -7));
  things.push(buildSpringRider(g, obstacles, site, ctx, 3.0, -2.4, 'horse'));
  things.push(buildSpringRider(g, obstacles, site, ctx, -4.0, -2.4, 'ladybird'));
  return things;
}
