import * as THREE from 'three';
import type { Character } from './character';
import { buildOutfitMannequin, type ShopOutfitId } from './characters';
import type { GameCtx } from './gamectx';
import { registerWearable } from './items';
import { box, mat, type SiteOpts } from './places';
import { TryOnShop, type TryOnItem } from './tryon';
import type { Obstacle } from './world';

/**
 * S04 — loja de roupa: a big open-front shop with dressed mannequins, a clothes rail, a full-length mirror and a counter.
 * Tap a mannequin = she wears that outfit (try-on, slot `body`) · mirror shows her · counter = pay and keep (tryon.ts).
 */

export const CLOTHES: { id: ShopOutfitId; name: string; price: number; plural?: boolean; color: number }[] = [
  { id: 'srv-vestido', name: 'vestido cor-de-rosa', price: 10, color: 0xff6b9d },
  { id: 'srv-casaco', name: 'casaco azul', price: 10, color: 0x4dabf7 },
  { id: 'srv-calcoes', name: 't-shirt e calções', price: 8, plural: true, color: 0x51cf66 },
  { id: 'srv-jardineiras', name: 'jardineiras amarelas', price: 9, plural: true, color: 0xfab005 },
  { id: 'srv-arcoiris', name: 'camisola arco-íris', price: 9, color: 0xff922b },
  { id: 'srv-noite', name: 'vestido de estrelas', price: 10, color: 0x364fc7 },
];

/** Small shirt shape for registerWearable previews (Character renders the real outfit via buildShopOutfit). */
function previewOutfit(color: number): THREE.Object3D {
  const g = new THREE.Group();
  box(g, mat(color), 0.4, 0.45, 0.2, 0, 0.25, 0);
  for (const s of [-1, 1]) box(g, mat(color), 0.16, 0.14, 0.18, s * 0.27, 0.4, 0);
  return g;
}

for (const c of CLOTHES) registerWearable(c.id, { name: c.name, slot: 'body', build: () => previewOutfit(c.color) });

/** Clothes rail with hangers on the back wall (left of the mirror) — dressing only. */
function clothesRail(g: THREE.Group): void {
  const metal = mat(0xadb5bd);
  const z = -5.45;
  box(g, metal, 2.0, 0.04, 0.04, -1.25, 1.75, z);
  for (const x of [-2.2, -0.3]) box(g, metal, 0.05, 1.75, 0.05, x, 0.875, z);
  CLOTHES.forEach((c, i) => {
    const x = -2.0 + i * 0.3;
    box(g, metal, 0.02, 0.1, 0.02, x, 1.68, z);
    box(g, mat(c.color), 0.05, 0.55, 0.42, x, 1.33, z); // shirt seen edge-on, like on a real rail
    box(g, mat(c.color), 0.05, 0.12, 0.62, x, 1.55, z); // shoulders
  });
}

export function createClothesShop(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts: SiteOpts = {},
): TryOnShop {
  const items: TryOnItem[] = CLOTHES.map((c) => ({
    id: c.id,
    name: c.name,
    slot: 'body',
    price: c.price,
    plural: c.plural,
    display: () => buildOutfitMannequin(c.id),
  }));
  return new TryOnShop(
    scene,
    obstacles,
    rng,
    ctx,
    hero,
    items,
    {
      stand: 'mannequin',
      wall: 0xe7f5ff,
      trim: 0x228be6,
      floor: 0xd0ebff,
      roof: 0x1971c2,
      awning: [0x228be6, 0xffffff],
      sign: clothesSign,
      clerk: { shirt: 0x228be6, pants: 0xffffff, dress: true, longHair: true },
      decor: clothesRail,
    },
    siteOpts,
  );
}

/** Sign pictogram: a big pink dress on a hanger. */
function clothesSign(): THREE.Object3D {
  const g = new THREE.Group();
  const pink = mat(0xff6b9d);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI * 1.4), mat(0x868e96));
  hook.position.set(0, 0.48, 0);
  g.add(hook);
  const bar = box(g, mat(0x868e96), 0.8, 0.04, 0.04, 0, 0.36, 0);
  void bar;
  box(g, pink, 0.36, 0.3, 0.06, 0, 0.18, 0); // bodice
  for (const s of [-1, 1]) box(g, pink, 0.14, 0.12, 0.06, s * 0.24, 0.27, 0); // sleeves
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 4), pink);
  skirt.rotation.y = Math.PI / 4;
  skirt.scale.z = 0.15;
  skirt.position.y = -0.27;
  g.add(skirt);
  box(g, mat(0xffffff), 0.38, 0.05, 0.08, 0, 0.04, 0); // sash
  return g;
}
