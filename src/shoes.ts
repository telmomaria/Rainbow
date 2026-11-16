import * as THREE from 'three';
import { registerWearable } from './items';
import { box, cyl, mat } from './venue';

/**
 * S03 — sapataria coberta: montra com sapatos reconhecíveis + calçar nos pés (slot `feet`).
 * Local frame (cabina): x ∈ [-hw,hw], z ∈ [-depth,0], +Z = frente (rua).
 */

export const SHOE_COST = 6;

/** Local Y of a biped shoe on a leg pivot (HIP=0.74 in characters.ts). */
export const SHOE_FOOT_Y = -0.685;
export const SHOE_FOOT_Z = -0.04;

export type ShoeKind = 'srv-tenis' | 'srv-botas' | 'srv-sapatilha';

export const SHOES: { id: ShoeKind; name: string; color: number; sole: number }[] = [
  { id: 'srv-tenis', name: 'ténis vermelhos', color: 0xe03131, sole: 0xffffff },
  { id: 'srv-botas', name: 'botas azuis', color: 0x228be6, sole: 0x212529 },
  { id: 'srv-sapatilha', name: 'sapatilhas amarelas', color: 0xffe066, sole: 0xffffff },
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

/** Preview for registerWearable (single shoe at origin). */
function previewShoe(kind: ShoeKind): THREE.Object3D {
  const g = buildShoeMesh(kind, 1.4);
  g.rotation.y = Math.PI * 0.15;
  return g;
}

for (const s of SHOES) {
  registerWearable(s.id, { name: s.name, slot: 'feet', build: () => previewShoe(s.id) });
}

/**
 * Covered shoe shop: walls, pitched roof, glass shop window with shelves of shoes, door + stool.
 * Returns stool sit pose (local) for the fitting ritual.
 */
export function buildShoeCabin(
  g: THREE.Group,
  hw: number,
  depth: number,
): { stool: { lx: number; ly: number; lz: number; face: number }; windowShoes: THREE.Object3D[] } {
  const wall = mat(0xfff4e6);
  const trim = mat(0xe8590c);
  const floor = mat(0xe9ecef);
  const wood = mat(0xa0522d);
  // raised floor — indoor shop, not a pavement stall
  box(g, floor, hw * 2, 0.16, depth, 0, 0.08, -depth / 2);
  box(g, trim, hw * 2 + 0.1, 0.1, depth + 0.1, 0, 0.03, -depth / 2);
  // back + sides
  box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
  box(g, trim, hw * 2, 0.32, 0.22, 0, 0.28, -depth + 0.11);
  for (const s of [-1, 1]) {
    box(g, wall, 0.2, 2.7, depth, s * (hw - 0.1), 1.4, -depth / 2);
    box(g, trim, 0.22, 0.32, depth, s * (hw - 0.1), 0.28, -depth / 2);
  }
  // Front: door (left) + OPEN montra (right) — no opaque glass hiding the shoes
  const doorW = 1.45;
  const doorMid = -1.35;
  const winX = 1.05;
  const winW = 2.35;
  // wall piers around door + montra opening
  box(g, wall, 0.45, 2.7, 0.2, -hw + 0.22, 1.4, -0.1); // far left
  box(g, wall, 0.35, 2.7, 0.2, (doorMid + doorW / 2 + winX - winW / 2) / 2, 1.4, -0.1); // between door & window
  box(g, wall, 0.4, 2.7, 0.2, hw - 0.2, 1.4, -0.1); // far right
  // lintel above door+window
  box(g, wall, hw * 2, 0.55, 0.2, 0, 2.45, -0.1);
  box(g, wall, winW, 0.45, 0.2, winX, 0.35, -0.1); // sill under montra
  // doorframe + leaf
  for (const s of [-1, 1]) box(g, trim, 0.12, 2.2, 0.22, doorMid + s * (doorW / 2 + 0.04), 1.15, -0.05);
  box(g, trim, doorW + 0.28, 0.26, 0.24, doorMid, 2.28, -0.05);
  box(g, mat(0xd9480f), doorW - 0.1, 2.05, 0.08, doorMid, 1.1, -0.02);
  box(g, mat(0xffe066), 0.06, 0.18, 0.08, doorMid + doorW / 2 - 0.18, 1.1, 0.05);
  // montra frame (open recess — shoes must read from the street)
  box(g, trim, winW + 0.18, 0.14, 0.16, winX, 2.22, 0.02);
  box(g, trim, winW + 0.18, 0.14, 0.16, winX, 0.58, 0.02);
  for (const s of [-1, 1]) box(g, trim, 0.12, 1.75, 0.16, winX + s * (winW / 2 + 0.06), 1.4, 0.02);
  // shallow display box behind the opening
  box(g, mat(0xffe8cc), winW - 0.1, 1.55, 0.08, winX, 1.4, -0.7);
  box(g, wood, winW - 0.15, 0.1, 0.55, winX, 0.85, -0.35);
  box(g, wood, winW - 0.15, 0.1, 0.55, winX, 1.4, -0.35);
  box(g, wood, winW - 0.15, 0.1, 0.55, winX, 1.95, -0.35);
  const windowShoes: THREE.Object3D[] = [];
  const kinds: ShoeKind[] = ['srv-tenis', 'srv-botas', 'srv-sapatilha'];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const kind = kinds[(row + col) % kinds.length];
      // pair per shelf cell — side profile, slightly oversized for kids to read
      for (const pair of [-1, 1]) {
        const shoe = buildShoeMesh(kind, 1.7);
        shoe.position.set(winX - 0.78 + col * 0.78 + pair * 0.12, 0.98 + row * 0.55, -0.05);
        shoe.rotation.y = Math.PI / 2;
        shoe.rotation.z = -0.05;
        g.add(shoe);
        windowShoes.push(shoe);
      }
    }
  }
  // solid roof (gentle pitch — steep slabs looked like a black spike from the apron)
  const roof = mat(0xe8590c);
  box(g, roof, hw * 2 + 0.7, 0.22, depth + 0.55, 0, 2.95, -depth / 2);
  const rL = box(g, roof, hw + 0.2, 0.14, depth + 0.4, -hw / 2 + 0.1, 3.08, -depth / 2);
  rL.rotation.z = 0.1;
  const rR = box(g, roof, hw + 0.2, 0.14, depth + 0.4, hw / 2 - 0.1, 3.08, -depth / 2);
  rR.rotation.z = -0.1;
  // shoe silhouette above the door (flat against the lintel — no floating mesh spike)
  box(g, mat(0xe03131), 0.55, 0.22, 0.08, doorMid, 2.55, 0.12);
  box(g, mat(0xffffff), 0.5, 0.08, 0.06, doorMid, 2.42, 0.14);
  box(g, mat(0xe03131), 0.22, 0.28, 0.08, doorMid + 0.12, 2.68, 0.12); // heel-up L = boot mark
  // interior: back shelves with more shoes
  box(g, wood, hw * 1.6, 0.08, 0.4, 0, 1.2, -depth + 0.45);
  box(g, wood, hw * 1.6, 0.08, 0.4, 0, 1.85, -depth + 0.45);
  for (let i = 0; i < 4; i++) {
    const shoe = buildShoeMesh(kinds[i % 3], 1.0);
    shoe.position.set(-1.0 + i * 0.7, 1.3, -depth + 0.5);
    shoe.rotation.y = Math.PI * 0.5;
    g.add(shoe);
  }
  // fitting stool (sit here to put shoes on)
  const stoolX = -0.85;
  const stoolZ = -2.0;
  cyl(g, wood, 0.22, 0.08, stoolX, 0.52, stoolZ);
  for (const [sx, sz] of [
    [-0.14, -0.14],
    [0.14, -0.14],
    [-0.14, 0.14],
    [0.14, 0.14],
  ] as const) {
    cyl(g, mat(0x868e96), 0.03, 0.5, stoolX + sx, 0.25, stoolZ + sz);
  }
  // counter bit for coins (beside clerk)
  box(g, wood, 1.1, 0.9, 0.55, 1.2, 0.45, -1.4);
  box(g, mat(0xfff3d6), 1.15, 0.08, 0.6, 1.2, 0.92, -1.4);
  // doorstep
  box(g, mat(0xadb5bd), doorW + 0.3, 0.08, 0.4, doorMid, 0.04, 0.22);
  box(g, mat(0xe8590c), 1.0, 0.03, 0.5, doorMid, 0.06, 0.5);
  // warm lamp
  const glow = new THREE.PointLight(0xffc078, 1.2, 8, 1.8);
  glow.position.set(0, 2.3, -depth / 2);
  g.add(glow);

  return { stool: { lx: stoolX, ly: 0.52, lz: stoolZ, face: Math.PI }, windowShoes };
}
