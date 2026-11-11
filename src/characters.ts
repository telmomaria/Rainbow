import * as THREE from 'three';

/**
 * The 10 original playable characters, built only from Three.js primitives.
 * All designs and names are original (no Disney / "KPop Demon Hunters" / other IP).
 */

export interface CharacterModel {
  /** Whole model. Origin at the feet (y = 0), facing -Z, total height ≈ 2.0–2.4 m (unicorn may be ≈ 1.8 m tall, ≈ 2 m long along Z). */
  model: THREE.Group;
  /** The part that bobs up/down while walking (usually everything above the legs). Must be a child of model. */
  body: THREE.Object3D;
  /** Legs that swing with rotation.x around their top (hip pivot). phase 0 and 1 swing in opposition. */
  legs: { pivot: THREE.Object3D; phase: 0 | 1 }[];
}

export interface CharacterDef {
  id: string;
  name: string;
  label: string;
  build(): CharacterModel;
}

type V3 = [number, number, number];

/** Per-character material + geometry cache, plus a helper to place shadow-casting meshes. */
class Kit {
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geos = new Map<string, THREE.BufferGeometry>();

  mat(color: number, glow = 0, rough = 0.75, metal = 0): THREE.MeshStandardMaterial {
    const key = `${color}|${glow}|${rough}|${metal}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: rough,
        metalness: metal,
        emissive: glow > 0 ? color : 0x000000,
        emissiveIntensity: glow,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  private geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g as T;
  }

  sph(r: number, w = 18, h = 14): THREE.SphereGeometry {
    return this.geo(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
  }
  cyl(rt: number, rb: number, h: number, seg = 14): THREE.CylinderGeometry {
    return this.geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  }
  cone(r: number, h: number, seg = 12): THREE.ConeGeometry {
    return this.geo(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  }
  box(x: number, y: number, z: number): THREE.BoxGeometry {
    return this.geo(`b${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z));
  }
  torus(r: number, t: number, arc = Math.PI * 2): THREE.TorusGeometry {
    return this.geo(`t${r}|${t}|${arc}`, () => new THREE.TorusGeometry(r, t, 8, 24, arc));
  }
  /** Sphere cap (top part), for hair. */
  cap(r: number, theta: number): THREE.SphereGeometry {
    return this.geo(`h${r}|${theta}`, () => new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, theta));
  }

  put(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material | number,
    pos: V3 = [0, 0, 0],
    rot?: V3,
    scale?: V3,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, typeof mat === 'number' ? this.mat(mat) : mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
}

// ---------------------------------------------------------------------------
// Shared chibi biped
// ---------------------------------------------------------------------------

const HIP = 0.74;
const SHOULDER_Y = 1.28;
const NECK_Y = 1.36;

interface BipedOpts {
  skin: number;
  top: number;
  legs: number;
  shoes: number;
  hips?: number;
  /** Arm colour (full sleeve). Defaults to skin. */
  sleeve?: number;
  /** Only a short sleeve at the shoulder, the rest of the arm is skin. */
  shortSleeve?: boolean;
  headR?: number;
  eye?: number;
  eyeSize?: number;
  legR?: number;
  boots?: { color: number; h: number };
  /** Arm spread (radians outwards). */
  armSpread?: number;
}

interface Biped extends CharacterModel {
  kit: Kit;
  head: THREE.Group;
  headR: number;
  armL: THREE.Group;
  armR: THREE.Group;
}

/** Hand position inside an arm group. */
const HAND: V3 = [0, -0.55, 0];

function biped(o: BipedOpts): Biped {
  const kit = new Kit();
  const model = new THREE.Group();
  const body = new THREE.Group();
  model.add(body);

  const legR = o.legR ?? 0.085;
  const legs: CharacterModel['legs'] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * 0.12, HIP, 0);
    model.add(pivot);
    kit.put(pivot, kit.cyl(legR, legR, 0.66), o.legs, [0, -0.33, 0]);
    if (o.boots) {
      const r = legR + 0.018;
      kit.put(pivot, kit.cyl(r, r, o.boots.h), o.boots.color, [0, -HIP + 0.06 + o.boots.h / 2, 0]);
    }
    kit.put(pivot, kit.box(0.17, 0.11, 0.27), o.shoes, [0, -HIP + 0.055, -0.04]);
    legs.push({ pivot, phase: side < 0 ? 0 : 1 });
  }

  // hips + torso
  kit.put(body, kit.cyl(0.24, 0.23, 0.18), o.hips ?? o.legs, [0, 0.78, 0]);
  kit.put(body, kit.cyl(0.2, 0.25, 0.58), o.top, [0, 1.06, 0]);

  // arms (pivot at the shoulder)
  const spread = o.armSpread ?? 0.18;
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, SHOULDER_Y, 0);
    arm.rotation.z = side * spread;
    body.add(arm);
    const armColor = o.shortSleeve ? o.skin : o.sleeve ?? o.skin;
    kit.put(arm, kit.cyl(0.065, 0.06, 0.5), armColor, [0, -0.25, 0]);
    if (o.shortSleeve && o.sleeve !== undefined) {
      kit.put(arm, kit.cyl(0.09, 0.085, 0.2), o.sleeve, [0, -0.07, 0]);
    }
    kit.put(arm, kit.sph(0.08), o.skin, HAND);
    arms.push(arm);
  }

  // head
  const headR = o.headR ?? 0.34;
  const head = new THREE.Group();
  head.position.set(0, NECK_Y + headR - 0.03, 0);
  body.add(head);
  kit.put(head, kit.sph(headR, 24, 18), o.skin);

  // face (on -Z)
  const k = headR / 0.34;
  const es = (o.eyeSize ?? 1) * 0.055 * k;
  const ex = 0.12 * k;
  const ez = -Math.sqrt(headR * headR - ex * ex) + 0.03;
  const eyeMat = kit.mat(o.eye ?? 0x2b1d3d, 0, 0.3);
  const shine = kit.mat(0xffffff, 0.6, 0.3);
  const cheek = kit.mat(0xff8fa8, 0, 0.9);
  for (const side of [-1, 1]) {
    kit.put(head, kit.sph(es, 12, 10), eyeMat, [side * ex, 0.01, ez], undefined, [1, 1.3, 0.7]);
    kit.put(head, kit.sph(es * 0.35, 8, 6), shine, [side * ex + es * 0.35, 0.01 + es * 0.5, ez - es * 0.5]);
    kit.put(head, kit.sph(0.05 * k, 10, 8), cheek, [side * 0.2 * k, -0.08 * k, ez + 0.05], undefined, [1, 0.6, 0.5]);
  }
  kit.put(
    head,
    kit.torus(0.045 * k, 0.013 * k, Math.PI),
    kit.mat(0xb03a5a, 0, 0.6),
    [0, -0.1 * k, -Math.sqrt(headR * headR - (0.12 * k) ** 2) + 0.004],
    [0, 0, Math.PI],
  );

  return { model, body, legs, kit, head, headR, armL: arms[0], armR: arms[1] };
}

/** Point an arm (shoulder pivot) along a direction given in body space. */
function aim(arm: THREE.Object3D, x: number, y: number, z: number): void {
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x, y, z).normalize());
}

/** Hand position of an arm, in its parent's (body) space. */
function handPos(arm: THREE.Object3D): THREE.Vector3 {
  arm.updateMatrix();
  return new THREE.Vector3(...HAND).applyMatrix4(arm.matrix);
}

/** Thin cylinder between two points (parent space). */
function rod(
  kit: Kit,
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  mat: THREE.Material | number,
): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = kit.put(parent, kit.cyl(r, r, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Hair cap over the head, tilted back so the face stays clear. */
function hairCap(b: Biped, color: number, tilt = 0.35, theta = Math.PI * 0.56, grow = 1.07): THREE.Mesh {
  return b.kit.put(b.head, b.kit.cap(b.headR * grow, theta), color, [0, 0.01, 0.0], [tilt, 0, 0]);
}

/** Long hair falling down the back. */
function hairBack(b: Biped, color: number, len = 0.6, width = 0.32): THREE.Mesh {
  return b.kit.put(
    b.head,
    b.kit.cyl(width, width * 0.85, len, 16),
    color,
    [0, -len / 2 + 0.08, 0.12],
    undefined,
    [1, 1, 0.7],
  );
}

// ---------------------------------------------------------------------------
// 1. Princesa
// ---------------------------------------------------------------------------

function buildPrincesa(): CharacterModel {
  const dress = 0xb68cf0;
  const pink = 0xff7fbf;
  const b = biped({ skin: 0xffd9bf, top: dress, legs: 0xffd9bf, shoes: 0xff7fbf, hips: dress });
  const { kit, body, head } = b;
  // long skirt (bell shape) + pink sash
  kit.put(body, kit.cyl(0.22, 0.44, 0.72, 20), dress, [0, 0.44, 0]);
  kit.put(body, kit.cyl(0.43, 0.46, 0.06, 20), pink, [0, 0.1, 0]);
  kit.put(body, kit.torus(0.235, 0.04), pink, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.sph(0.06), pink, [0, 0.86, -0.25]);
  // puffy sleeves
  for (const side of [-1, 1]) kit.put(body, kit.sph(0.12), 0xd9bfff, [side * 0.27, 1.28, 0]);
  // hair: dark curly with side curls
  const hair = 0x5a2e1a;
  hairCap(b, hair);
  hairBack(b, hair, 0.75, 0.3);
  for (const side of [-1, 1]) kit.put(head, kit.sph(0.11), hair, [side * 0.3, -0.2, 0.04]);
  // tiara: gold band + three points + pink gem
  const gold = kit.mat(0xffd34d, 0.15, 0.3, 0.6);
  kit.put(head, kit.torus(0.24, 0.025), gold, [0, 0.27, 0.03], [Math.PI / 2 + 0.3, 0, 0]);
  for (const [x, h] of [[-0.1, 0.09], [0, 0.14], [0.1, 0.09]] as const) {
    kit.put(head, kit.cone(0.035, h, 6), gold, [x, 0.27 + h / 2 + 0.01, -0.21 + Math.abs(x) * 0.3]);
  }
  kit.put(head, kit.sph(0.045), kit.mat(0xff3d9a, 0.4, 0.2), [0, 0.3, -0.24]);
  return b;
}

// ---------------------------------------------------------------------------
// 2. Unicórnio
// ---------------------------------------------------------------------------

const RAINBOW = [0xff5a5a, 0xffa53d, 0xffe14d, 0x6bd96b, 0x4db8ff, 0xa77bff];

function buildUnicornio(): CharacterModel {
  const kit = new Kit();
  const model = new THREE.Group();
  const body = new THREE.Group();
  model.add(body);
  const white = 0xfdf8ff;
  const hoof = 0xc8a8ff;

  const legs: CharacterModel['legs'] = [];
  const LEG_TOP = 0.72;
  for (const [x, z, phase] of [
    [-0.17, -0.38, 0], // front-left
    [0.17, -0.38, 1], // front-right
    [-0.17, 0.38, 1], // back-left
    [0.17, 0.38, 0], // back-right
  ] as const) {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, LEG_TOP, z);
    model.add(pivot);
    kit.put(pivot, kit.cyl(0.085, 0.075, 0.64), white, [0, -0.32, 0]);
    kit.put(pivot, kit.cyl(0.095, 0.1, 0.12), hoof, [0, -LEG_TOP + 0.06, 0]);
    legs.push({ pivot, phase });
  }

  // barrel body
  kit.put(body, kit.sph(0.4, 24, 18), white, [0, 0.95, 0], undefined, [0.95, 0.85, 1.35]);
  // neck + head
  kit.put(body, kit.cyl(0.15, 0.2, 0.55), white, [0, 1.3, -0.45], [-0.55, 0, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.55, -0.68);
  body.add(head);
  kit.put(head, kit.sph(0.28, 22, 16), white, [0, 0, 0], undefined, [0.95, 1, 1.05]);
  kit.put(head, kit.sph(0.19, 18, 14), 0xffe4f0, [0, -0.1, -0.22], undefined, [1, 0.85, 1]);
  // nostrils
  for (const side of [-1, 1]) kit.put(head, kit.sph(0.025, 8, 6), 0xd98aa8, [side * 0.07, -0.08, -0.39]);
  // eyes on the front
  const eyeMat = kit.mat(0x2b1d3d, 0, 0.3);
  const shine = kit.mat(0xffffff, 0.6, 0.3);
  for (const side of [-1, 1]) {
    kit.put(head, kit.sph(0.055, 12, 10), eyeMat, [side * 0.13, 0.07, -0.22], undefined, [1, 1.3, 0.7]);
    kit.put(head, kit.sph(0.02, 8, 6), shine, [side * 0.13 + 0.02, 0.1, -0.26]);
    kit.put(head, kit.sph(0.045, 10, 8), 0xff9fc0, [side * 0.2, -0.04, -0.17], undefined, [1, 0.6, 0.5]);
    // ears
    kit.put(head, kit.cone(0.06, 0.16, 8), white, [side * 0.14, 0.27, 0.04], [0, 0, -side * 0.3]);
  }
  // golden spiral-ish horn
  const gold = kit.mat(0xffd34d, 0.2, 0.3, 0.5);
  kit.put(head, kit.cone(0.06, 0.38, 10), gold, [0, 0.36, -0.1], [-0.45, 0, 0]);
  kit.put(head, kit.torus(0.05, 0.015), gold, [0, 0.24, -0.05], [Math.PI / 2 - 0.45, 0, 0]);

  // rainbow mane down the neck
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    kit.put(
      body,
      kit.sph(0.12 - t * 0.02, 12, 10),
      RAINBOW[i],
      [0, 1.82 - t * 0.55, -0.62 + t * 0.42],
    );
  }
  // rainbow tail
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    kit.put(body, kit.sph(0.11 - t * 0.03, 12, 10), RAINBOW[i], [0, 1.1 - t * 0.5, 0.6 + Math.sin(t * 2.2) * 0.22]);
  }
  return { model, body, legs };
}

// ---------------------------------------------------------------------------
// 3–5. Trio de cantoras K-pop caçadoras de monstros
// ---------------------------------------------------------------------------

interface IdolStyle {
  hair: number;
  neon: number;
  skin: number;
}

/** Shared stage outfit: white cropped jacket with neon trim, neon skirt and tall boots. */
function idolBase(s: IdolStyle): Biped {
  const jacket = 0xf7f4ff;
  const b = biped({
    skin: s.skin,
    top: jacket,
    sleeve: jacket,
    legs: s.skin,
    shoes: 0x2a2440,
    hips: s.neon,
    boots: { color: 0x2a2440, h: 0.36 },
  });
  const { kit, body } = b;
  // pleated stage skirt
  kit.put(body, kit.cyl(0.25, 0.36, 0.26, 16), s.neon, [0, 0.66, 0]);
  // neon trim (belt + collar) and a gold star badge
  const glow = kit.mat(s.neon, 0.5, 0.4);
  kit.put(body, kit.torus(0.235, 0.025), glow, [0, 0.85, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.torus(0.19, 0.03), glow, [0, 1.33, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.cone(0.05, 0.08, 5), kit.mat(0xffd34d, 0.3, 0.3, 0.5), [0.1, 1.15, -0.235], [Math.PI / 2, 0, 0]);
  return b;
}

/** Bia: pink twin buns, glowing headset microphone. */
function buildBia(): CharacterModel {
  const s = { hair: 0xff6fb8, neon: 0xff3d9a, skin: 0xffe0c7 };
  const b = idolBase(s);
  const { kit, head } = b;
  hairCap(b, s.hair, 0.3);
  hairBack(b, s.hair, 0.35, 0.3);
  for (const side of [-1, 1]) {
    kit.put(head, kit.sph(0.13), s.hair, [side * 0.24, 0.27, 0.06]);
    kit.put(head, kit.torus(0.08, 0.02), kit.mat(0xffffff, 0.3), [side * 0.22, 0.2, 0.06], [Math.PI / 2, 0, 0]);
  }
  // headset: band over the head, arm to the mouth, glowing mic tip
  const dark = kit.mat(0x2a2440, 0, 0.4);
  kit.put(head, kit.sph(0.07, 10, 8), dark, [0.35, -0.02, 0], undefined, [0.6, 1, 1]);
  const tip = new THREE.Vector3(0.1, -0.15, -0.36);
  rod(kit, head, new THREE.Vector3(0.36, -0.04, -0.03), tip, 0.014, dark);
  kit.put(head, kit.sph(0.04, 10, 8), kit.mat(s.neon, 0.9), [tip.x, tip.y, tip.z]);
  return b;
}

/** Nina: aqua high ponytail, glowing ribbon wand. */
function buildNina(): CharacterModel {
  const s = { hair: 0x2ad4d4, neon: 0x16b8ff, skin: 0xf1c7a3 };
  const b = idolBase(s);
  const { kit, body, head, armR } = b;
  hairCap(b, s.hair, 0.3);
  // fringe
  kit.put(head, kit.sph(0.12), s.hair, [-0.12, 0.22, -0.24], undefined, [1.2, 0.6, 0.8]);
  // high ponytail
  kit.put(head, kit.torus(0.06, 0.025), kit.mat(0xffffff, 0.3), [0, 0.3, 0.22], [0.5, 0, 0]);
  kit.put(head, kit.sph(0.13), s.hair, [0, 0.25, 0.36], undefined, [0.9, 1, 1]);
  kit.put(head, kit.cone(0.13, 0.65, 12), s.hair, [0, -0.1, 0.42], [Math.PI - 0.15, 0, 0]);
  // glowing ribbon wand in the right hand
  aim(armR, 0.35, -0.75, -0.55);
  const hand = handPos(armR);
  const top = hand.clone().add(new THREE.Vector3(0.05, 0.3, -0.12));
  rod(kit, body, hand.clone().add(new THREE.Vector3(0, -0.04, 0)), top, 0.018, 0xe8e8ff);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.1, 0.018, 64, 6, 2, 3), kit.mat(s.neon, 1.0, 0.3));
  knot.position.copy(top).add(new THREE.Vector3(0, 0.08, 0));
  knot.castShadow = true;
  body.add(knot);
  return b;
}

/** Inês: violet bob with fringe, star clip, handheld microphone. */
function buildInes(): CharacterModel {
  const s = { hair: 0x8a4dff, neon: 0xb14dff, skin: 0xc98e64 };
  const b = idolBase(s);
  const { kit, body, head, armR } = b;
  // bob: cap + rounded volume at the back and sides (face stays clear)
  hairCap(b, s.hair, 0.4, Math.PI * 0.58, 1.08);
  kit.put(head, kit.sph(0.36, 20, 14), s.hair, [0, -0.06, 0.12], undefined, [1.08, 0.8, 0.8]);
  // straight fringe
  kit.put(head, kit.cyl(0.3, 0.3, 0.1, 20), s.hair, [0, 0.2, -0.06], [0.35, 0, 0], [1, 1, 0.95]);
  // star clip
  kit.put(head, kit.cone(0.07, 0.06, 5), kit.mat(0xffd34d, 0.4, 0.3, 0.5), [-0.24, 0.2, -0.24], [Math.PI / 2, 0, 0.3]);
  // microphone held up in front of the chin
  aim(armR, -0.25, -0.35, -0.7);
  const hand = handPos(armR);
  const micTop = hand.clone().add(new THREE.Vector3(-0.02, 0.2, -0.04));
  rod(kit, body, hand.clone().add(new THREE.Vector3(0, -0.05, 0)), micTop, 0.03, 0x2a2440);
  kit.put(body, kit.sph(0.065, 12, 10), kit.mat(s.neon, 0.8, 0.3), [micTop.x, micTop.y + 0.03, micTop.z]);
  return b;
}

// ---------------------------------------------------------------------------
// 6. Extraterrestre
// ---------------------------------------------------------------------------

function buildAlien(): CharacterModel {
  const skin = 0x7fe0b8;
  const suit = 0xc9c3ff;
  const b = biped({
    skin,
    top: suit,
    sleeve: suit,
    legs: suit,
    shoes: 0x6a5acd,
    headR: 0.42,
    eye: 0x10131f,
    eyeSize: 1.8,
  });
  const { kit, body, head, headR } = b;
  // shiny belt + star
  kit.put(body, kit.torus(0.235, 0.03), kit.mat(0xb0b8c8, 0, 0.3, 0.7), [0, 0.86, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.cone(0.06, 0.06, 5), kit.mat(0xffd34d, 0.4, 0.3, 0.5), [0, 1.12, -0.235], [Math.PI / 2, 0, 0]);
  // antennae with glowing tips
  const glow = kit.mat(0xfff06b, 0.9, 0.3);
  for (const side of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(side * 0.16, headR - 0.04, 0);
    a.rotation.z = -side * 0.35;
    head.add(a);
    kit.put(a, kit.cyl(0.02, 0.025, 0.3, 6), skin, [0, 0.15, 0]);
    kit.put(a, kit.sph(0.06, 12, 10), glow, [0, 0.32, 0]);
    // little pointed ears
    kit.put(head, kit.cone(0.07, 0.18, 8), skin, [side * 0.42, 0.02, 0], [0, 0, -side * 1.3]);
  }
  // freckle spots on top of the head
  for (const [x, y, z] of [[0.1, 0.36, 0.12], [-0.15, 0.33, 0.18], [0.02, 0.3, 0.28]] as const) {
    kit.put(head, kit.sph(0.04, 8, 6), 0x4fc49a, [x, y, z]);
  }
  return b;
}

// ---------------------------------------------------------------------------
// 7. Guerreira (~1500 d.C.)
// ---------------------------------------------------------------------------

function buildGuerreira(): CharacterModel {
  const tunic = 0xc0392b;
  const leather = 0x7a4a26;
  const steel = 0xb8c2cc;
  const b = biped({
    skin: 0xf2c9a0,
    top: tunic,
    sleeve: 0xe8dcc0,
    legs: 0x4a5a3a,
    shoes: leather,
    hips: tunic,
    boots: { color: leather, h: 0.3 },
  });
  const { kit, body, head, armR } = b;
  // tunic skirt + leather belt with buckle
  kit.put(body, kit.cyl(0.25, 0.34, 0.3, 16), tunic, [0, 0.64, 0]);
  kit.put(body, kit.torus(0.24, 0.035), leather, [0, 0.84, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.box(0.08, 0.07, 0.03), kit.mat(0xffd34d, 0, 0.3, 0.6), [0, 0.84, -0.27]);
  // golden diamond emblem + laced collar
  kit.put(body, kit.box(0.13, 0.13, 0.02), 0xf4d35e, [0, 1.12, -0.225], [0, 0, Math.PI / 4]);
  kit.put(body, kit.torus(0.19, 0.03), 0xe8dcc0, [0, 1.33, 0], [Math.PI / 2, 0, 0]);
  // brown braid at the back + simple steel cap with brim
  const hair = 0x6b3a1e;
  hairCap(b, hair, 0.35);
  kit.put(head, kit.cyl(0.07, 0.04, 0.55, 8), hair, [0, -0.35, 0.3], [0.25, 0, 0]);
  kit.put(head, kit.sph(0.05, 8, 6), 0xffd34d, [0, -0.63, 0.37]);
  const metal = kit.mat(steel, 0, 0.35, 0.6);
  kit.put(head, kit.cap(0.37, Math.PI * 0.42), metal, [0, 0.06, 0.02], [0.2, 0, 0]);
  kit.put(head, kit.torus(0.3, 0.03), metal, [0, 0.13, 0.02], [Math.PI / 2 + 0.2, 0, 0]);
  kit.put(head, kit.cone(0.035, 0.12, 6), metal, [0, 0.45, 0]);
  // round wooden shield on the back
  const wood = 0xa86a3a;
  kit.put(body, kit.cyl(0.3, 0.3, 0.05, 20), wood, [0, 1.05, 0.29], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.torus(0.3, 0.025), metal, [0, 1.05, 0.31]);
  kit.put(body, kit.sph(0.07, 12, 8), metal, [0, 1.05, 0.33], undefined, [1, 1, 0.6]);
  // small wooden practice sword held up
  aim(armR, 0.3, -0.85, -0.45);
  const sword = new THREE.Group();
  sword.position.copy(handPos(armR));
  sword.rotation.x = -0.35;
  body.add(sword);
  kit.put(sword, kit.box(0.07, 0.48, 0.03), 0xd9b380, [0, 0.3, 0]);
  kit.put(sword, kit.cone(0.035, 0.06, 4), 0xd9b380, [0, 0.57, 0], [0, Math.PI / 4, 0]);
  kit.put(sword, kit.box(0.2, 0.045, 0.06), leather, [0, 0.06, 0]);
  return b;
}

// ---------------------------------------------------------------------------
// 8. Voleibolista
// ---------------------------------------------------------------------------

function buildVoleibol(): CharacterModel {
  const shirt = 0xff8a1f;
  const navy = 0x1f3a7a;
  const b = biped({
    skin: 0xe0ac7e,
    top: shirt,
    sleeve: shirt,
    shortSleeve: true,
    legs: 0xe0ac7e,
    shoes: 0xffffff,
    hips: navy,
  });
  const { kit, body, head, armL } = b;
  // shorts
  kit.put(body, kit.cyl(0.25, 0.27, 0.16, 16), navy, [0, 0.66, 0]);
  // number 7 on the chest (white bars) + side stripe
  const white = kit.mat(0xffffff, 0.1);
  kit.put(body, kit.box(0.16, 0.045, 0.02), white, [0, 1.2, -0.226]);
  kit.put(body, kit.box(0.045, 0.24, 0.02), white, [-0.02, 1.07, -0.232], [0, 0, 0.35]);
  // knee pads
  for (const leg of b.legs) kit.put(leg.pivot, kit.cyl(0.1, 0.1, 0.1, 12), 0xffffff, [0, -0.34, 0]);
  // hair: dark ponytail + yellow headband
  const hair = 0x2a1a12;
  hairCap(b, hair, 0.3);
  kit.put(head, kit.torus(0.335, 0.03), 0xffe14d, [0, 0.12, 0.02], [Math.PI / 2 + 0.3, 0, 0]);
  kit.put(head, kit.sph(0.1), hair, [0, 0.18, 0.36]);
  kit.put(head, kit.cone(0.1, 0.45, 10), hair, [0, -0.08, 0.42], [Math.PI - 0.25, 0, 0]);
  // ball held in the left hand
  aim(armL, -0.2, -0.7, -0.55);
  const bp = handPos(armL).add(new THREE.Vector3(0.06, 0.02, -0.12));
  const ball = kit.put(body, kit.sph(0.15, 18, 14), 0xffffff, [bp.x, bp.y, bp.z]);
  kit.put(ball, kit.torus(0.15, 0.018), 0x2b7bff, [0, 0, 0]);
  kit.put(ball, kit.torus(0.15, 0.018), 0xffd400, [0, 0, 0], [0, Math.PI / 2, 0]);
  return b;
}

// ---------------------------------------------------------------------------
// 9. Bailarina
// ---------------------------------------------------------------------------

function buildBailarina(): CharacterModel {
  const leo = 0xff9ecf;
  const tights = 0xffe3ef;
  const b = biped({
    skin: 0xffdcc4,
    top: leo,
    legs: tights,
    shoes: 0xff7fbf,
    hips: leo,
    legR: 0.075,
    armSpread: 0.3,
  });
  const { kit, body, head, armL } = b;
  // layered tutu
  kit.put(body, kit.cyl(0.43, 0.45, 0.06, 24), 0xffc4e1, [0, 0.74, 0]);
  kit.put(body, kit.cyl(0.38, 0.41, 0.06, 24), 0xffd9eb, [0, 0.8, 0]);
  kit.put(body, kit.cyl(0.32, 0.34, 0.05, 24), 0xffc4e1, [0, 0.85, 0]);
  // little bow on the chest
  for (const side of [-1, 1]) {
    kit.put(body, kit.cone(0.05, 0.1, 8), 0xff5aa8, [side * 0.05, 1.2, -0.215], [0, 0, side * Math.PI / 2], [1, 1, 0.4]);
  }
  // one arm up in a graceful curve
  armL.rotation.z = -2.6;
  // hair: golden-brown with a bun and a ribbon
  const hair = 0xb87333;
  hairCap(b, hair, 0.4, Math.PI * 0.58);
  kit.put(head, kit.sph(0.13), hair, [0, 0.33, 0.12]);
  kit.put(head, kit.torus(0.11, 0.025), kit.mat(0xff5aa8), [0, 0.28, 0.1], [Math.PI / 2 - 0.4, 0, 0]);
  return b;
}

// ---------------------------------------------------------------------------
// 10. Karateca
// ---------------------------------------------------------------------------

function buildKarateca(): CharacterModel {
  const gi = 0xfbfbf7;
  const skin = 0xf0c39a;
  const b = biped({
    skin,
    top: gi,
    sleeve: gi,
    legs: gi,
    shoes: skin,
    hips: gi,
    legR: 0.1,
  });
  const { kit, body, head } = b;
  // gi jacket lower half + crossed lapels
  kit.put(body, kit.cyl(0.26, 0.29, 0.22, 16), gi, [0, 0.74, 0]);
  const lapel = kit.mat(0xd8d8d0);
  kit.put(body, kit.box(0.05, 0.38, 0.02), lapel, [-0.07, 1.16, -0.222], [0, 0, 0.42]);
  kit.put(body, kit.box(0.05, 0.38, 0.02), lapel, [0.07, 1.16, -0.222], [0, 0, -0.42]);
  kit.put(body, kit.cone(0.1, 0.22, 3), skin, [0, 1.25, -0.2], [Math.PI, 0, 0], [1, 1, 0.25]);
  // orange belt with knot and tails
  const belt = 0xff8c1a;
  kit.put(body, kit.torus(0.27, 0.04), belt, [0, 0.88, 0], [Math.PI / 2, 0, 0]);
  kit.put(body, kit.box(0.09, 0.08, 0.06), belt, [0, 0.88, -0.28]);
  kit.put(body, kit.box(0.05, 0.2, 0.025), belt, [-0.04, 0.76, -0.29], [0, 0, 0.2]);
  kit.put(body, kit.box(0.05, 0.2, 0.025), belt, [0.04, 0.76, -0.29], [0, 0, -0.2]);
  // spiky black hair + red headband
  const hair = 0x1a1a22;
  hairCap(b, hair, 0.4);
  for (const [x, z, rx, rz] of [
    [0, -0.12, -0.6, 0],
    [-0.15, -0.05, -0.3, 0.5],
    [0.15, -0.05, -0.3, -0.5],
    [0, 0.12, 0.3, 0],
  ] as const) {
    kit.put(head, kit.cone(0.1, 0.22, 6), hair, [x, 0.33, z], [rx, 0, rz]);
  }
  kit.put(head, kit.torus(0.345, 0.03), 0xe23b3b, [0, 0.1, 0], [Math.PI / 2 + 0.15, 0, 0]);
  return b;
}

// ---------------------------------------------------------------------------

export const CHARACTERS: CharacterDef[] = [
  { id: 'princesa', name: 'Lia', label: 'Princesa', build: buildPrincesa },
  { id: 'unicornio', name: 'Estrela', label: 'Unicórnio', build: buildUnicornio },
  { id: 'cantora-bia', name: 'Bia', label: 'Cantora K-pop', build: buildBia },
  { id: 'cantora-nina', name: 'Nina', label: 'Cantora K-pop', build: buildNina },
  { id: 'cantora-ines', name: 'Inês', label: 'Cantora K-pop', build: buildInes },
  { id: 'extraterrestre', name: 'Zuca', label: 'Extraterrestre', build: buildAlien },
  { id: 'guerreira', name: 'Leonor', label: 'Guerreira', build: buildGuerreira },
  { id: 'voleibolista', name: 'Rita', label: 'Voleibolista', build: buildVoleibol },
  { id: 'bailarina', name: 'Clara', label: 'Bailarina', build: buildBailarina },
  { id: 'karateca', name: 'Tomás', label: 'Karateca', build: buildKarateca },
];

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
