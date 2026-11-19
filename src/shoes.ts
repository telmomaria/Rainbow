import * as THREE from 'three';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
import { registerWearable } from './items';
import type { SiteOpts } from './places';
import { TryOnShop, type TryOnItem } from './tryon';
import { box, mat } from './venue';
import type { Obstacle } from './world';

/**
 * S03 — sapataria: a big open-front shop with pairs of shoes on wall shelves, a full-length mirror and a counter.
 * Tap a pair = she tries it on (on her feet, slot `feet`) · mirror shows her · counter = pay and keep (tryon.ts).
 */

/** Local Y of a biped shoe on a leg pivot (HIP=0.74 in characters.ts). */
export const SHOE_FOOT_Y = -0.685;
export const SHOE_FOOT_Z = -0.04;

export type ShoeKind = 'srv-tenis' | 'srv-botas' | 'srv-sapatilha' | 'srv-galochas' | 'srv-sandalias' | 'srv-estrelas';

export const SHOES: { id: ShoeKind; name: string; color: number; sole: number; price: number }[] = [
  { id: 'srv-tenis', name: 'ténis vermelhos', color: 0xe03131, sole: 0xffffff, price: 6 },
  { id: 'srv-botas', name: 'botas azuis', color: 0x228be6, sole: 0x212529, price: 7 },
  { id: 'srv-sapatilha', name: 'sapatilhas amarelas', color: 0xffe066, sole: 0xffffff, price: 5 },
  { id: 'srv-galochas', name: 'galochas de sapo', color: 0x40c057, sole: 0x2b8a3e, price: 6 },
  { id: 'srv-sandalias', name: 'sandálias cor-de-rosa', color: 0xff6bb5, sole: 0xfff0f6, price: 5 },
  { id: 'srv-estrelas', name: 'sapatos de estrelas', color: 0x9c36b5, sole: 0xffffff, price: 7 },
];

/**
 * One shoe facing −Z (toe toward −Z), origin at sole centre.
 * Built as a clear side-view silhouette (sole + heel + toe) so kids read “sapato” at a few metres.
 */
export function buildShoeMesh(kind: ShoeKind, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const def = SHOES.find((s) => s.id === kind) ?? SHOES[0];
  const body = mat(def.color);
  const sole = mat(def.sole);
  const white = mat(0xffffff);
  if (kind === 'srv-sandalias') {
    // flat sole + two straps + a flower on the toe strap
    box(g, sole, 0.2, 0.05, 0.48, 0, 0.025, 0);
    box(g, body, 0.21, 0.06, 0.05, 0, 0.08, -0.12);
    box(g, body, 0.21, 0.06, 0.05, 0, 0.08, 0.1);
    box(g, body, 0.04, 0.12, 0.04, 0.1, 0.1, 0.18);
    box(g, body, 0.04, 0.12, 0.04, -0.1, 0.1, 0.18);
    box(g, body, 0.2, 0.04, 0.04, 0, 0.16, 0.18);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0xffd43b));
    f.position.set(0, 0.12, -0.12);
    g.add(f);
    g.scale.setScalar(scale);
    return g;
  }
  // shared sole plate: long, thick, heel raised — the “shoe” outline kids know from drawings
  box(g, sole, 0.2, 0.06, 0.5, 0, 0.03, 0);
  box(g, sole, 0.18, 0.1, 0.12, 0, 0.08, 0.18); // heel block
  if (kind === 'srv-tenis') {
    box(g, body, 0.18, 0.18, 0.28, 0, 0.16, 0.04); // upper
    box(g, body, 0.17, 0.14, 0.16, 0, 0.14, -0.16); // toe box
    box(g, white, 0.12, 0.12, 0.1, 0, 0.26, 0); // tongue
    box(g, white, 0.2, 0.04, 0.08, 0, 0.12, -0.02); // stripe
    for (const z of [-0.05, 0.02, 0.08]) box(g, white, 0.05, 0.04, 0.04, 0, 0.26, z);
  } else if (kind === 'srv-botas') {
    box(g, body, 0.18, 0.16, 0.3, 0, 0.15, 0.02);
    box(g, body, 0.16, 0.14, 0.14, 0, 0.14, -0.16);
    // tall shaft — L silhouette = boot
    box(g, body, 0.17, 0.42, 0.2, 0, 0.42, 0.1);
    box(g, white, 0.05, 0.05, 0.05, 0.09, 0.35, 0.12);
  } else if (kind === 'srv-galochas') {
    // rain boots: rounded toe with two frog eyes, tall shaft with a yellow top band
    box(g, body, 0.19, 0.17, 0.32, 0, 0.15, 0.03);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), body);
    toe.scale.set(1, 0.85, 1.2);
    toe.position.set(0, 0.12, -0.15);
    g.add(toe);
    box(g, body, 0.19, 0.4, 0.22, 0, 0.42, 0.09);
    box(g, mat(0xffd43b), 0.2, 0.06, 0.23, 0, 0.6, 0.09);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), white);
      eye.position.set(s * 0.05, 0.22, -0.18);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), mat(0x212529));
      pupil.position.set(s * 0.05, 0.23, -0.215);
      g.add(pupil);
    }
  } else if (kind === 'srv-estrelas') {
    // sparkly party shoes: low upper, small heel, big golden star buckle
    box(g, body, 0.17, 0.12, 0.24, 0, 0.12, -0.08);
    box(g, body, 0.16, 0.1, 0.18, 0, 0.11, 0.1);
    box(g, mat(0xcc5de8, 0.25), 0.03, 0.05, 0.2, 0, 0.19, 0.02); // strap
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), mat(0xffd43b, 0.5));
    star.scale.set(1, 1, 0.4);
    star.position.set(0, 0.18, -0.17);
    g.add(star);
  } else {
    box(g, body, 0.17, 0.12, 0.22, 0, 0.12, -0.1);
    box(g, body, 0.15, 0.1, 0.18, 0, 0.11, 0.08);
    // ankle strap across the opening
    box(g, white, 0.03, 0.05, 0.2, 0, 0.18, 0.02);
    box(g, white, 0.16, 0.03, 0.03, 0, 0.18, 0.02);
  }
  g.scale.setScalar(scale);
  return g;
}

/** A pair on a shelf: toes toward the viewer (−Z of the stand), turned a bit so the side shows. */
function shoePair(kind: ShoeKind): THREE.Object3D {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const sh = buildShoeMesh(kind, 1.15);
    sh.position.set(s * 0.2, 0, -0.02);
    sh.rotation.y = s * 0.55;
    g.add(sh);
  }
  return g;
}

/** Preview for registerWearable (single shoe at origin). */
function previewShoe(kind: ShoeKind): THREE.Object3D {
  const g = buildShoeMesh(kind, 1.4);
  g.rotation.y = Math.PI * 0.15;
  return g;
}

for (const s of SHOES) {
  registerWearable(s.id, { name: s.name, slot: 'feet', build: () => previewShoe(s.id) });
}

/** Sign pictogram: a big red trainer seen from the side. */
function shoeSign(): THREE.Object3D {
  const g = new THREE.Group();
  const big = buildShoeMesh('srv-tenis', 2.6);
  big.rotation.y = Math.PI / 2;
  big.position.set(0.05, -0.42, 0);
  g.add(big);
  return g;
}

export function createShoeShop(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts: SiteOpts,
): TryOnShop {
  const items: TryOnItem[] = SHOES.map((s) => ({
    id: s.id,
    name: s.name,
    slot: 'feet',
    price: s.price,
    plural: true,
    display: () => shoePair(s.id),
  }));
  return new TryOnShop(scene, obstacles, rng, ctx, hero, items, {
    stand: 'shelf',
    wall: 0xfff4e6,
    trim: 0xe8590c,
    floor: 0xffd8a8,
    roof: 0xd9480f,
    awning: [0xe8590c, 0xfff4e6],
    sign: shoeSign,
    clerk: { shirt: 0xe8590c, pants: 0x343a40, cap: 0x862e9c },
  }, siteOpts);
}
