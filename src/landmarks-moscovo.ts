import * as THREE from 'three';
import { AIRPORT_ZONE } from './airport';
import { tone } from './audio';
import type { GameCtx } from './gamectx';
import { gemMesh } from './places';
import { inNoSpawn } from './spawn';
import { mat } from './venue';
import { ROADS, SPAWN, type Interactable, type Obstacle, type World } from './world';

/**
 * Moscovo — Catedral de São Basílio (estilizada, low-poly) na sua «Praça Vermelha» de tijolo.
 *
 * Silhueta clássica: torre central com telhado em tenda e cebolinha dourada, rodeada de 4 torres grandes (nos eixos)
 * e 4 pequenas (nas diagonais), cada uma com a sua cúpula em cebola de padrão diferente (riscas, espiral, ziguezague,
 * xadrez, escamas) em vermelho, verde, azul, amarelo e branco. Base de tijolo vermelho com frisos brancos e arcos.
 *
 * Toque (sem UI): chegar à porta = os sinos tocam, as cúpulas «dançam» como gelatina e a narradora fala.
 * Joia do ex-líbris na praça (diamondAt, flag `gem:Moscovo:basilica`).
 *
 * Lives in its own file (landmarks.ts is shared); landmarks.ts passes in its private helpers.
 */

export interface MoscowKit {
  diamondAt(ctx: GameCtx, key: string, at: THREE.Vector3, mesh: THREE.Object3D): Interactable;
  setDebug(d: Record<string, unknown>): void;
}

/** Half sizes (m) of the whole plot (plaza + cathedral), local frame: front = +Z. */
const HW = 16;
const HD = 15;
/** Cathedral centre in the local frame (pushed to the back of the plaza). */
const CZ = -4.5;
/** Half size of the cathedral's solid base. */
const BASE = 7.5;
const BASE_H = 4;

const RED = 0xe03131;
const GREEN = 0x2f9e44;
const BLUE = 0x1c7ed6;
const YELLOW = 0xfcc419;
const WHITE = 0xf8f9fa;
const BRICK = 0xb5432f;
const GOLD = 0xffc533;

/* ------------------------------------------------------------------ textures (made once) */

type Pattern = 'stripes' | 'spiral' | 'zigzag' | 'checker' | 'scales' | 'tent' | 'bricks';
const texCache = new Map<string, THREE.CanvasTexture>();

const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** u = around the dome (0..1), v = bottom→top (0..1). Returns true for colour A. */
function patternA(p: Pattern, u: number, v: number): boolean {
  switch (p) {
    case 'stripes':
      return Math.floor(u * 16) % 2 === 0;
    case 'spiral':
      return Math.floor(u * 12 + v * 3) % 2 === 0;
    case 'zigzag': {
      const tri = Math.abs(((u * 16) % 2) - 1); // 0..1 triangle wave around the dome
      return Math.floor(v * 7 + tri * 0.6) % 2 === 0;
    }
    case 'checker':
      return (Math.floor(u * 12) + Math.floor(v * 6)) % 2 === 0;
    case 'scales': {
      const row = Math.floor(v * 7);
      const cu = (u * 12 + (row % 2) * 0.5) % 1;
      const cv = (v * 7) % 1;
      return (cu - 0.5) ** 2 + (cv - 0.35) ** 2 > 0.11;
    }
    case 'tent': {
      // white diamonds on the tent roof, in rows
      const cu = (u * 16) % 1;
      const cv = (v * 8) % 1;
      return Math.abs(cu - 0.5) + Math.abs(cv - 0.5) > 0.32;
    }
    case 'bricks': {
      const row = Math.floor(v * 32);
      const cu = (u * 16 + (row % 2) * 0.5) % 1;
      const cv = (v * 32) % 1;
      return cu > 0.06 && cv > 0.12;
    }
  }
}

function patternTex(p: Pattern, a: number, b: number): THREE.CanvasTexture {
  const key = `${p}_${a}_${b}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const ca = hex(a);
  const cb = hex(b);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = patternA(p, (x + 0.5) / N, 1 - (y + 0.5) / N) ? ca : cb;
      const i = (y * N + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t);
  return t;
}

const texMat = (p: Pattern, a: number, b: number, repeat?: [number, number]): THREE.MeshStandardMaterial => {
  const t = patternTex(p, a, b);
  if (repeat) {
    const r = t.clone();
    r.repeat.set(repeat[0], repeat[1]);
    r.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: r, roughness: 0.75 });
  }
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.05 });
};

/* ------------------------------------------------------------------ shapes */

/** Onion dome profile, radius 1 (height ≈ 2.1). */
const ONION: THREE.Vector2[] = [
  [0, 0],
  [0.72, 0.02],
  [0.95, 0.25],
  [1.05, 0.55],
  [1.0, 0.88],
  [0.82, 1.18],
  [0.55, 1.45],
  [0.3, 1.68],
  [0.12, 1.9],
  [0.03, 2.1],
].map(([x, y]) => new THREE.Vector2(x, y));
const onionGeo = new THREE.LatheGeometry(ONION, 20);

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** Ring of little white «kokoshnik» half-discs around a drum (the scalloped crown under each dome). */
function kokoshniks(g: THREE.Object3D, r: number, y: number, n: number, size: number): void {
  const geo = new THREE.CircleGeometry(size, 10, 0, Math.PI);
  const m = new THREE.MeshStandardMaterial({ color: WHITE, side: THREE.DoubleSide, roughness: 0.8 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = new THREE.Mesh(geo, m);
    k.position.set(Math.sin(a) * (r + 0.02), y, Math.cos(a) * (r + 0.02));
    k.rotation.y = a;
    g.add(k);
  }
}

interface Dome {
  mesh: THREE.Object3D;
  phase: number;
}

/**
 * One tower: octagonal brick drum, white trim rings, arched windows, kokoshnik crown, a neck and the onion dome.
 * Returns the dome group (it «dances» when the bells ring).
 */
function tower(
  g: THREE.Object3D,
  x: number,
  z: number,
  r: number,
  drumTop: number,
  dome: { p: Pattern; a: number; b: number },
  brick: THREE.Material,
  white: THREE.Material,
  gold: THREE.Material,
  dark: THREE.Material,
): THREE.Group {
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  g.add(t);
  add(t, new THREE.CylinderGeometry(r, r * 1.05, drumTop, 8), brick, 0, drumTop / 2, 0);
  for (const y of [BASE_H + 0.15, drumTop * 0.72, drumTop - 0.1]) {
    add(t, new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.25, 8), white, 0, y, 0);
  }
  // arched windows on 4 of the 8 faces (above the base)
  const wy = (BASE_H + drumTop * 0.72) / 2 + 0.4;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const wx = Math.sin(a) * r * 0.93;
    const wz = Math.cos(a) * r * 0.93;
    const w = new THREE.Mesh(new THREE.BoxGeometry(r * 0.38, r * 0.8, 0.12), dark);
    w.position.set(wx, wy, wz);
    w.rotation.y = a;
    t.add(w);
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.19, 10, 0, Math.PI), dark);
    top.rotation.y = a;
    top.position.set(Math.sin(a) * (r * 0.93 + 0.07), wy + r * 0.4, Math.cos(a) * (r * 0.93 + 0.07));
    t.add(top);
  }
  kokoshniks(t, r * 1.02, drumTop + 0.05, 8, r * 0.36);
  const neckH = r * 0.7;
  add(t, new THREE.CylinderGeometry(r * 0.62, r * 0.66, neckH, 8), white, 0, drumTop + neckH / 2, 0);
  const domeG = new THREE.Group();
  domeG.position.set(0, drumTop + neckH, 0);
  t.add(domeG);
  const onion = new THREE.Mesh(onionGeo, texMat(dome.p, dome.a, dome.b));
  onion.scale.set(r * 1.15, r * 1.2, r * 1.15);
  onion.castShadow = true;
  domeG.add(onion);
  // gold finial: ball + spike
  const top = r * 1.2 * 2.1;
  add(domeG, new THREE.SphereGeometry(r * 0.13, 8, 6), gold, 0, top + r * 0.05, 0);
  add(domeG, new THREE.ConeGeometry(r * 0.08, r * 0.75, 6), gold, 0, top + r * 0.45, 0);
  return domeG;
}

/* ------------------------------------------------------------------ museum tank (exhibit) */

/**
 * Plaza-frame placement of the exhibit tank: front-left corner of the plaza, clear of the cathedral (front face at
 * z = CZ + BASE = 3), the steps (|x| < 3), the jewel (x = 0) and the plaza edges. fw/fd = half size of the fenced bed.
 */
const TANK = { x: -10, z: 9, fw: 3.8, fd: 2.6 };

/**
 * A parked, historic-looking tank as a peaceful open-air museum piece: olive hull, tracks with road wheels, round
 * turret and a long barrel tilted up to the sky, on a low stone plinth inside a flower bed with a low chain fence.
 * No markings, no stars, no text. Touch = the turret turns slowly once and a white dove lands on the barrel.
 */
function buildExhibitTank(): { group: THREE.Group; touch(): void; update(dt: number): void } {
  const group = new THREE.Group();
  const olive = mat(0x5b6b3a);
  const oliveDark = mat(0x47552d);
  const trackM = mat(0x34352f);
  const wheelM = mat(0x55583f);
  const stone = mat(0xbdb5a6);
  const stoneTop = mat(0xd3ccbf);
  const box = (w: number, h: number, d: number, m: THREE.Material, px: number, py: number, pz: number, parent: THREE.Object3D = group): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // flower bed (grass) inside the fence + low stone plinth
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(TANK.fw * 2, TANK.fd * 2), mat(0x5c9e3c));
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.035;
  bed.receiveShadow = true;
  group.add(bed);
  const PH = 0.55; // plinth height
  box(6.0, PH, 3.4, stone, 0, PH / 2, 0);
  box(6.2, 0.1, 3.6, stoneTop, 0, PH + 0.05, 0);
  const y0 = PH + 0.1;

  // tracks (one each side) with road wheels and mudguards
  for (const s of [-1, 1]) {
    box(4.8, 0.75, 0.55, trackM, 0, y0 + 0.4, s * 1.2);
    for (let i = 0; i < 5; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), wheelM);
      w.rotation.x = Math.PI / 2;
      w.position.set(-1.8 + i * 0.9, y0 + 0.36, s * 1.5);
      w.castShadow = true;
      group.add(w);
    }
    // front/back sprockets (smaller, a bit higher)
    for (const ex of [-2.35, 2.35]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.13, 10), wheelM);
      sp.rotation.x = Math.PI / 2;
      sp.position.set(ex, y0 + 0.5, s * 1.5);
      group.add(sp);
    }
    box(4.9, 0.08, 0.7, oliveDark, 0, y0 + 0.82, s * 1.22);
  }
  // hull: body between the tracks, sloped front plate, deck
  box(4.4, 0.6, 1.9, olive, 0, y0 + 0.55, 0);
  box(4.6, 0.32, 2.5, olive, 0.1, y0 + 1.0, 0);
  const glacis = box(0.9, 0.08, 2.5, oliveDark, -2.55, y0 + 0.82, 0);
  glacis.rotation.z = 0.55;
  // little details: headlights, toolbox, spare track links (kept chunky and toy-like)
  for (const s of [-0.75, 0.75]) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8), mat(0xe8e2c8));
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(-2.32, y0 + 1.12, s);
    group.add(lamp);
  }
  box(0.9, 0.22, 0.35, oliveDark, 1.6, y0 + 1.27, 0.9);
  box(0.5, 0.18, 0.5, oliveDark, 2.1, y0 + 1.25, -0.6);

  // turret (turns) + barrel tilted up to the sky (points along −X)
  const turret = new THREE.Group();
  turret.position.set(0.35, y0 + 1.16, 0);
  group.add(turret);
  const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.62, 10), olive);
  tBody.position.y = 0.31;
  tBody.castShadow = true;
  turret.add(tBody);
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 10), oliveDark);
  hatch.position.set(0.3, 0.69, 0.2);
  turret.add(hatch);
  box(0.4, 0.42, 0.62, oliveDark, -0.95, 0.3, 0, turret); // mantlet
  const ELEV = 0.2;
  const BL = 2.9;
  const barrel = new THREE.Group();
  barrel.position.set(-1.1, 0.32, 0);
  barrel.rotation.z = -ELEV; // −X points slightly up
  turret.add(barrel);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, BL, 10), oliveDark);
  tube.rotation.z = Math.PI / 2;
  tube.position.x = -BL / 2;
  tube.castShadow = true;
  barrel.add(tube);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 10), oliveDark);
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.x = -BL + 0.1;
  barrel.add(muzzle);

  // low chain fence: short stone posts + sagging dark chains
  const postM = mat(0xcfc7b8);
  const chainM = mat(0x2f2f2f);
  const corners: [number, number][] = [
    [-TANK.fw, -TANK.fd],
    [TANK.fw, -TANK.fd],
    [TANK.fw, TANK.fd],
    [-TANK.fw, TANK.fd],
  ];
  for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c];
    const [bx, bz] = corners[(c + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 1.9));
    for (let i = 0; i < n; i++) {
      const px = ax + ((bx - ax) * i) / n;
      const pz = az + ((bz - az) * i) / n;
      box(0.16, 0.6, 0.16, postM, px, 0.3, pz);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), postM);
      cap.position.set(px, 0.64, pz);
      group.add(cap);
      // chain to the next post: two straight pieces that dip in the middle
      const qx = ax + ((bx - ax) * (i + 1)) / n;
      const qz = az + ((bz - az) * (i + 1)) / n;
      const mx = (px + qx) / 2;
      const mz = (pz + qz) / 2;
      for (const [sx, sz, ex, ez] of [
        [px, pz, mx, mz],
        [mx, mz, qx, qz],
      ] as const) {
        const seg = Math.hypot(ex - sx, ez - sz);
        const sy = sx === px && sz === pz ? 0.52 : 0.4;
        const eyy = sx === px && sz === pz ? 0.4 : 0.52;
        const link = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(seg, eyy - sy), 0.035, 0.035), chainM);
        link.position.set((sx + ex) / 2, (sy + eyy) / 2, (sz + ez) / 2);
        link.rotation.order = 'YZX';
        link.rotation.y = -Math.atan2(ez - sz, ex - sx);
        link.rotation.z = Math.atan2(eyy - sy, seg);
        group.add(link);
      }
    }
  }

  // flowers all round the plinth (between the plinth and the fence)
  const petals = [0xff6b9a, 0xffd43b, 0xffffff, 0xff8787, 0xb197fc].map((c) => mat(c));
  const stemM = mat(0x2b8a3e);
  const flowerGeo = new THREE.SphereGeometry(0.12, 7, 5);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4);
  let fi = 0;
  const flower = (fx: number, fz: number): void => {
    const st = new THREE.Mesh(stemGeo, stemM);
    st.position.set(fx, 0.14, fz);
    group.add(st);
    const f = new THREE.Mesh(flowerGeo, petals[fi++ % petals.length]);
    f.position.set(fx, 0.3, fz);
    f.scale.y = 0.7;
    group.add(f);
  };
  for (let fx = -3.35; fx <= 3.36; fx += 0.42) {
    flower(fx, -2.15 + (fi % 2) * 0.12);
    flower(fx + 0.2, 2.15 - (fi % 2) * 0.12);
  }
  for (let fz = -1.6; fz <= 1.61; fz += 0.42) {
    flower(-3.4 + (fi % 2) * 0.1, fz);
    flower(3.4 - (fi % 2) * 0.1, fz);
  }

  // the dove (hidden until the tank is touched)
  const dove = new THREE.Group();
  const doveM = mat(0xf4f4f4);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), doveM);
  body.scale.set(1.5, 0.9, 0.9);
  dove.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), doveM);
  head.position.set(-0.17, 0.1, 0);
  dove.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), mat(0xf59f00));
  beak.rotation.z = Math.PI / 2;
  beak.position.set(-0.27, 0.09, 0);
  dove.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 5, 4), mat(0x111111));
    eye.position.set(-0.21, 0.13, s * 0.05);
    dove.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), doveM);
  tail.position.set(0.22, 0.03, 0);
  dove.add(tail);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const wp = new THREE.Group();
    wp.position.set(0, 0.06, s * 0.08);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.26), doveM);
    wing.position.z = s * 0.13;
    wp.add(wing);
    dove.add(wp);
    wings.push(wp);
  }
  dove.visible = false;
  group.add(dove);
  // perch: ~2/3 along the barrel (turret back at yaw 0 by then), in the tank frame
  const perchD = 2.0;
  const perch = new THREE.Vector3(
    turret.position.x + barrel.position.x - Math.cos(ELEV) * perchD,
    turret.position.y + barrel.position.y + Math.sin(ELEV) * perchD + 0.15,
    0,
  );
  const skyFrom = new THREE.Vector3(-9, 9, 5);
  const skyTo = new THREE.Vector3(-8, 10, -7);

  const TURN = 7; // s for one slow full turn
  const LAND_AT = 5; // dove starts gliding in
  const GLIDE = 2.6;
  const STAY = 6;
  let clock = -1; // < 0 = idle
  let flap = 0;
  return {
    group,
    touch() {
      if (clock >= 0) return;
      clock = 0;
      tone(220, 0, 0.5, 'sine', 0.035); // soft «hmm» of the old motor, nothing warlike
    },
    update(dt) {
      if (clock < 0) return;
      clock += dt;
      flap += dt;
      // turret: ease-in-out, one full turn
      const k = Math.min(1, clock / TURN);
      turret.rotation.y = (k * k * (3 - 2 * k)) * Math.PI * 2;
      // dove: glide in → perch → fly away
      const tIn = clock - LAND_AT;
      const tOut = tIn - GLIDE - STAY;
      if (tIn < 0) return;
      dove.visible = true;
      if (tIn < GLIDE) {
        const u = tIn / GLIDE;
        const e = 1 - (1 - u) * (1 - u);
        dove.position.lerpVectors(skyFrom, perch, e);
        dove.position.y += Math.sin(u * Math.PI) * 1.2;
        dove.rotation.y = Math.atan2(skyFrom.z - perch.z, perch.x - skyFrom.x) + Math.PI;
        wings.forEach((w, i) => {
          w.scale.z = 1;
          w.rotation.x = Math.sin(flap * 22) * 0.9 * (i ? 1 : -1);
        });
      } else if (tOut < 0) {
        dove.position.copy(perch);
        dove.rotation.y = 0;
        head.rotation.z = Math.sin(flap * 2.5) * 0.25;
        wings.forEach((w) => {
          w.rotation.x = 0;
          w.scale.z = 0.35; // folded
        });
        if (tIn - dt < GLIDE) {
          // landed: two little coos/chirps
          [1800, 2200, 1900].forEach((f, i) => tone(f, i * 0.12, 0.09, 'sine', 0.03));
        }
      } else if (tOut < 3) {
        const u = tOut / 3;
        dove.position.lerpVectors(perch, skyTo, u * u);
        dove.rotation.y = Math.atan2(perch.z - skyTo.z, skyTo.x - perch.x) + Math.PI;
        wings.forEach((w, i) => {
          w.scale.z = 1;
          w.rotation.x = Math.sin(flap * 22) * 0.9 * (i ? 1 : -1);
        });
      } else {
        dove.visible = false;
        clock = -1;
        turret.rotation.y = 0;
      }
    },
  };
}

/* ------------------------------------------------------------------ placement */

const rectHitsRoad = (minX: number, maxX: number, minZ: number, maxZ: number, m: number): boolean =>
  ROADS.xs.some((rx) => maxX > rx - ROADS.width / 2 - m && minX < rx + ROADS.width / 2 + m) ||
  ROADS.zs.some((rz) => maxZ > rz - ROADS.width / 2 - m && minZ < rz + ROADS.width / 2 + m);

/**
 * Pick the plot: off roads (≥2.5 m), off venues / airport / the start point, never on a non-placeholder obstacle
 * (shops, chest, bank…). Placeholder buildings in the way are cleared (fewer is better). Front faces the nearest road.
 */
function pickPlot(world: World, obstacles: Obstacle[], rng: () => number): { x: number; z: number; yaw: number; removed: number } | null {
  let best: { x: number; z: number; yaw: number; removed: number; score: number } | null = null;
  const lim = ROADS.extent - 10;
  const off = rng() * 4;
  for (let cx = -lim + off; cx <= lim; cx += 4) {
    for (let cz = -lim + off; cz <= lim; cz += 4) {
      // nearest road decides where the front looks (yaw: 0 = front +Z, π/2 = front +X …)
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
      const hw = side ? HD : HW;
      const hd = side ? HW : HD;
      const minX = cx - hw;
      const maxX = cx + hw;
      const minZ = cz - hd;
      const maxZ = cz + hd;
      if (Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) > lim) continue;
      if (rectHitsRoad(minX, maxX, minZ, maxZ, 2.5)) continue;
      if (maxX + 4 > AIRPORT_ZONE.minX && minX - 4 < AIRPORT_ZONE.maxX && maxZ + 4 > AIRPORT_ZONE.minZ && minZ - 4 < AIRPORT_ZONE.maxZ) continue;
      const sx = Math.max(minX, Math.min(SPAWN.x, maxX));
      const sz = Math.max(minZ, Math.min(SPAWN.z, maxZ));
      if (Math.hypot(sx - SPAWN.x, sz - SPAWN.z) < 25) continue;
      let bad = false;
      for (let x = minX; x <= maxX + 0.01 && !bad; x += (maxX - minX) / 8) {
        for (let z = minZ; z <= maxZ + 0.01; z += (maxZ - minZ) / 8) {
          if (inNoSpawn(x, z, 4)) {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      let removed = 0;
      for (const o of obstacles) {
        if (o.maxX + 3 > minX && o.minX - 3 < maxX && o.maxZ + 3 > minZ && o.minZ - 3 < maxZ) {
          if (world.buildings.has(o)) removed++;
          else {
            bad = true;
            break;
          }
        }
      }
      if (bad) continue;
      // front edge close to the street (seen from the road), few buildings removed, not too far out
      const frontGap = gap - (side ? HW : HD) - ROADS.width / 2; // metres of pavement between road and plaza
      const dist = Math.hypot(cx - SPAWN.x, cz - SPAWN.z);
      const score = removed * 12 + Math.abs(frontGap - 3) + Math.max(0, dist - 110) * 0.3 + Math.max(0, 45 - dist) * 0.3;
      if (!best || score < best.score) best = { x: cx, z: cz, yaw, removed, score };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ builder */

export function buildMoscovo(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  world: World,
  kit: MoscowKit,
): Interactable[] {
  const plot = pickPlot(world, obstacles, rng);
  if (!plot) {
    kit.setDebug({ spots: {}, count: 0, failed: 'basilica' });
    return [];
  }
  const { x, z, yaw } = plot;
  const side = Math.abs(Math.sin(yaw)) > 0.5;
  const area: Obstacle = side
    ? { minX: x - HD, maxX: x + HD, minZ: z - HW, maxZ: z + HW }
    : { minX: x - HW, maxX: x + HW, minZ: z - HD, maxZ: z + HD };
  world.clearArea(area, 3); // placeholder buildings only

  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  scene.add(root);
  /** local (plot frame) → world */
  const W = (lx: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, 0, z));
  /** local AABB → world obstacle (yaw is a multiple of 90°) */
  const solid = (minX: number, maxX: number, minZ: number, maxZ: number, height?: number): void => {
    const a = W(minX, minZ);
    const b = W(maxX, maxZ);
    const o: Obstacle = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
    if (height !== undefined) o.height = height;
    obstacles.push(o);
  };

  // «Praça Vermelha»: red-brick paving + a light kerb
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), texMat('bricks', 0xa8382a, 0x7a2a20, [3, 3]));
  paving.rotation.x = -Math.PI / 2;
  paving.position.y = 0.025;
  paving.receiveShadow = true;
  root.add(paving);
  const kerbM = mat(0xd8cfc4);
  for (const [w, d, px, pz] of [
    [HW * 2, 0.4, 0, -HD],
    [HW * 2, 0.4, 0, HD],
    [0.4, HD * 2, -HW, 0],
    [0.4, HD * 2, HW, 0],
  ] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), kerbM);
    k.position.set(px, 0.06, pz);
    root.add(k);
  }

  const g = new THREE.Group(); // the cathedral itself
  g.position.set(0, 0, CZ);
  root.add(g);
  const brick = texMat('bricks', BRICK, 0x8e3424, [4, 1.2]);
  const brickTower = texMat('bricks', BRICK, 0x8e3424, [3, 3]);
  const white = mat(WHITE);
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.7, roughness: 0.3, emissive: 0x7a5200, emissiveIntensity: 0.3 });
  const dark = mat(0x3b2a26);

  // base (gallery) with white cornice + scalloped top
  const base = new THREE.Mesh(new THREE.BoxGeometry(BASE * 2, BASE_H, BASE * 2), brick);
  base.position.y = BASE_H / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  add(g, new THREE.BoxGeometry(BASE * 2 + 0.4, 0.35, BASE * 2 + 0.4), white, 0, BASE_H, 0);
  add(g, new THREE.BoxGeometry(BASE * 2 + 0.3, 0.3, BASE * 2 + 0.3), white, 0, 0.15, 0);
  const halfDisc = new THREE.CircleGeometry(0.55, 10, 0, Math.PI);
  const kokM = new THREE.MeshStandardMaterial({ color: WHITE, side: THREE.DoubleSide, roughness: 0.8 });
  for (let face = 0; face < 4; face++) {
    const a = (face * Math.PI) / 2;
    for (let i = -5; i <= 5; i++) {
      const k = new THREE.Mesh(halfDisc, kokM);
      const along = i * 1.3;
      k.position.set(Math.sin(a) * (BASE + 0.21) + Math.cos(a) * along, BASE_H + 0.15, Math.cos(a) * (BASE + 0.21) - Math.sin(a) * along);
      k.rotation.y = a;
      g.add(k);
    }
  }
  // arched entrances: big one in front (bells hang in it), small ones on every face
  const arch = (face: number, along: number, w: number, h: number, framed: boolean): void => {
    const a = (face * Math.PI) / 2;
    const ox = Math.sin(a) * (BASE + 0.06) + Math.cos(a) * along;
    const oz = Math.cos(a) * (BASE + 0.06) - Math.sin(a) * along;
    const parts = new THREE.Group();
    parts.position.set(ox, 0, oz);
    parts.rotation.y = a;
    g.add(parts);
    if (framed) {
      add(parts, new THREE.BoxGeometry(w + 0.6, h + 0.3, 0.1), white, 0, (h + 0.3) / 2, -0.02);
      const ft = new THREE.Mesh(new THREE.CircleGeometry(w / 2 + 0.3, 14, 0, Math.PI), kokM);
      ft.position.set(0, h + 0.3, 0.0);
      parts.add(ft);
    }
    add(parts, new THREE.BoxGeometry(w, h, 0.14), dark, 0, h / 2, 0.03);
    const at = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 14, 0, Math.PI), dark);
    at.position.set(0, h, 0.105);
    parts.add(at);
  };
  arch(0, 0, 2.6, 2.4, true);
  for (const s of [-4.4, 4.4]) arch(0, s, 1.4, 1.5, true);
  for (const f of [1, 2, 3]) for (const s of [-3.5, 0, 3.5]) arch(f, s, 1.3, 1.5, true);
  // front steps (flat, walkable)
  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(6 - i * 1.2, 0.1, 0.8), mat(0xe9e2d6));
    st.position.set(0, 0.05 + i * 0.1, BASE + 0.4 + (2 - i) * 0.7);
    st.receiveShadow = true;
    g.add(st);
  }

  // towers
  const domes: Dome[] = [];
  // central tent tower
  {
    const r = 2.6;
    const drumTop = 14;
    add(g, new THREE.CylinderGeometry(r, r * 1.05, drumTop, 8), brickTower, 0, drumTop / 2, 0);
    for (const y of [BASE_H + 0.2, 9, 11.5, drumTop]) add(g, new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.3, 8), white, 0, y, 0);
    kokoshniks(g, r * 1.03, drumTop + 0.1, 8, 0.9);
    kokoshniks(g, r * 1.03, 10.0, 8, 0.6);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(r * 0.98, 9, 8, 1, true), texMat('tent', RED, WHITE));
    tent.material.side = THREE.DoubleSide;
    tent.position.y = drumTop + 4.5;
    tent.castShadow = true;
    g.add(tent);
    add(g, new THREE.CylinderGeometry(0.42, 0.5, 1.4, 8), white, 0, drumTop + 8.4, 0);
    const cap = new THREE.Group();
    cap.position.y = drumTop + 9.1;
    g.add(cap);
    const onion = new THREE.Mesh(onionGeo, gold);
    onion.scale.setScalar(0.85);
    onion.castShadow = true;
    cap.add(onion);
    add(cap, new THREE.SphereGeometry(0.16, 8, 6), gold, 0, 1.95, 0);
    add(cap, new THREE.ConeGeometry(0.1, 1.1, 6), gold, 0, 2.5, 0);
    domes.push({ mesh: cap, phase: 0 });
  }
  const big: { x: number; z: number; d: { p: Pattern; a: number; b: number } }[] = [
    { x: 0, z: 5.4, d: { p: 'spiral', a: RED, b: GREEN } }, // front
    { x: 5.4, z: 0, d: { p: 'zigzag', a: BLUE, b: WHITE } },
    { x: 0, z: -5.4, d: { p: 'stripes', a: YELLOW, b: GREEN } },
    { x: -5.4, z: 0, d: { p: 'checker', a: GREEN, b: WHITE } },
  ];
  big.forEach((t, i) => domes.push({ mesh: tower(g, t.x, t.z, 1.7, 10.5, t.d, brickTower, white, gold, dark), phase: 1 + i * 1.3 }));
  const small: { x: number; z: number; d: { p: Pattern; a: number; b: number } }[] = [
    { x: 4.1, z: 4.1, d: { p: 'scales', a: YELLOW, b: BLUE } },
    { x: -4.1, z: 4.1, d: { p: 'spiral', a: BLUE, b: YELLOW } },
    { x: 4.1, z: -4.1, d: { p: 'stripes', a: RED, b: WHITE } },
    { x: -4.1, z: -4.1, d: { p: 'zigzag', a: GREEN, b: YELLOW } },
  ];
  small.forEach((t, i) => domes.push({ mesh: tower(g, t.x, t.z, 1.15, 8, t.d, brickTower, white, gold, dark), phase: 2 + i * 1.7 }));

  // three bells in the big front arch (they swing when she reaches the door)
  const bellM = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.6, roughness: 0.35 });
  const bells: THREE.Group[] = [];
  for (const [bx, s] of [
    [-0.75, 0.35],
    [0, 0.48],
    [0.75, 0.35],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(bx, 3.35, BASE + 0.35);
    g.add(pivot);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.45, s, s * 1.3, 10, 1, true), bellM);
    bell.material.side = THREE.DoubleSide;
    bell.position.y = -s * 0.75;
    pivot.add(bell);
    add(pivot, new THREE.SphereGeometry(s * 0.45, 8, 6), bellM, 0, -s * 0.15, 0);
    bells.push(pivot);
  }
  add(g, new THREE.BoxGeometry(2.4, 0.12, 0.12), dark, 0, 3.4, BASE + 0.35);

  // solids: the base (towers stand inside it); the bells' little beam sits above head height
  solid(-BASE - 0.2, BASE + 0.2, CZ - BASE - 0.2, CZ + BASE + 0.2);

  // museum tank on the plaza (front-left corner): a parked exhibit on a stone plinth, chain fence + flowers
  const tank = buildExhibitTank();
  tank.group.position.set(TANK.x, 0, TANK.z);
  root.add(tank.group);
  solid(TANK.x - TANK.fw, TANK.x + TANK.fw, TANK.z - TANK.fd, TANK.z + TANK.fd);

  // the landmark jewel: on the plaza, in front of the door
  const gem = gemMesh(0xff5c8a, 1.3);
  const gemLocal = { x: 0, z: HD - 4.5 };
  gem.position.set(gemLocal.x, 1.1, gemLocal.z);
  root.add(gem);
  const things: Interactable[] = [kit.diamondAt(ctx, `gem:${ctx.city()}:basilica`, W(gemLocal.x, gemLocal.z), gem)];

  let ring = 0; // seconds of bell ringing left
  let t = 0;
  const RING_S = 3.2;
  const lines = ['A Catedral de São Basílio! Parece feita de doces!', 'Ding-dong! As cúpulas parecem gelados!', 'Cada torre tem um chapéu diferente!'];
  let said = 0;
  things.push({
    object: g,
    position: W(0, CZ + BASE + 1.6),
    radius: 2.6,
    interact() {
      if (ring > 0.8) return;
      ring = RING_S;
      // a little Russian-style peal: high, quick bells over a deep one
      tone(147, 0, 1.6, 'sine', 0.11);
      [784, 659, 587, 523, 784, 659, 587, 523].forEach((f, i) => tone(f, 0.15 + i * 0.18, 0.35, 'triangle', 0.05));
      tone(147, 1.6, 1.6, 'sine', 0.1);
      ctx.say([lines[said % lines.length]]);
      said++;
    },
    update(dt) {
      t += dt;
      gem.rotation.y += dt * 1.2;
      gem.position.y = 1.1 + Math.sin(t * 2) * 0.12;
      const k = ring > 0 ? Math.min(1, ring / 1.2) : 0;
      if (ring > 0) ring = Math.max(0, ring - dt);
      for (const d of domes) {
        const w = Math.sin(t * 9 + d.phase) * 0.09 * k;
        d.mesh.scale.set(1 - w * 0.5, 1 + w, 1 - w * 0.5);
        d.mesh.rotation.z = Math.sin(t * 6 + d.phase) * 0.05 * k;
      }
      bells.forEach((b, i) => {
        b.rotation.x = Math.sin(t * 7 + i * 1.1) * 0.6 * k;
      });
    },
  });

  // touch the tank (fence front) = the turret turns slowly once and a dove lands on the barrel
  things.push({
    object: tank.group,
    position: W(TANK.x, TANK.z + TANK.fd + 0.7),
    radius: 1.6,
    interact() {
      tank.touch();
    },
    update(dt) {
      tank.update(dt);
    },
  });

  kit.setDebug({
    tank: (() => {
      const d = W(TANK.x, TANK.z);
      return [+d.x.toFixed(1), +d.z.toFixed(1)];
    })(),
    spots: { basilica: { x: +x.toFixed(1), z: +z.toFixed(1) }, main: { x: +x.toFixed(1), z: +z.toFixed(1) } },
    yaw: +yaw.toFixed(2),
    removedBuildings: plot.removed,
    door: (() => {
      const d = W(0, CZ + BASE + 1.6);
      return [+d.x.toFixed(1), +d.z.toFixed(1)];
    })(),
    gem: (() => {
      const d = W(gemLocal.x, gemLocal.z);
      return [+d.x.toFixed(1), +d.z.toFixed(1)];
    })(),
    count: 1,
  });
  return things;
}
