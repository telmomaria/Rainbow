import * as THREE from 'three';
import { box, cyl, mat } from './venue';

/**
 * Small covered SPA / massage cabin — walls + pitched roof + door, warm towels and lamp.
 * Shared by S06 (services) and folk I18. The marquesa stays indoors (never on the apron in the rain).
 *
 * Local frame: body x∈[-hw,hw], z∈[-depth,0], +Z = front (road).
 */

export const MASSAGE_COST = 6;
/** How long she stays on the table while the masseuse kneads (seconds). */
export const MASSAGE_DUR = 10;

/** Cream/peach SPA cabin with a door, warm roof, hanging lamp and towel rack. */
export function buildMassageCabin(g: THREE.Group, hw: number, depth: number): void {
  const wall = mat(0xffe8d6);
  const trim = mat(0xe8590c);
  const floor = mat(0xf5d0a9);
  // raised warm floor (indoor SPA, not a pavement stall)
  box(g, floor, hw * 2, 0.16, depth, 0, 0.08, -depth / 2);
  box(g, trim, hw * 2 + 0.08, 0.1, depth + 0.08, 0, 0.03, -depth / 2);
  // back + sides
  box(g, wall, hw * 2, 2.65, 0.2, 0, 1.4, -depth + 0.1);
  box(g, trim, hw * 2, 0.28, 0.22, 0, 0.28, -depth + 0.11);
  for (const s of [-1, 1]) {
    box(g, wall, 0.2, 2.65, depth, s * (hw - 0.1), 1.4, -depth / 2);
    box(g, trim, 0.22, 0.28, depth, s * (hw - 0.1), 0.28, -depth / 2);
    box(g, trim, 0.22, 0.16, depth, s * (hw - 0.1), 1.9, -depth / 2);
  }
  // Front wall with a wide door (SPA entrance — not an open booth)
  const doorW = 2.0;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : doorW / 2;
    const x1 = s < 0 ? -doorW / 2 : hw;
    const mid = (x0 + x1) / 2;
    const w = x1 - x0;
    box(g, wall, w, 2.65, 0.2, mid, 1.4, -0.1);
    box(g, trim, w, 0.28, 0.22, mid, 0.28, -0.09);
  }
  // doorframe + warm lintel (lotus-ish disc — no text)
  for (const s of [-1, 1]) box(g, trim, 0.14, 2.4, 0.22, s * (doorW / 2 + 0.04), 1.25, -0.05);
  box(g, trim, doorW + 0.35, 0.4, 0.26, 0, 2.5, -0.05);
  const badge = box(g, mat(0xffd8a8, 0.35), 0.55, 0.55, 0.08, 0, 2.5, 0.12);
  badge.rotation.z = Math.PI / 4;
  // pitched roof (two slabs) — covered SPA, not a fair awning
  const roof = mat(0xfa5252);
  const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.0, -depth / 2);
  rL.rotation.z = 0.16;
  const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.0, -depth / 2);
  rR.rotation.z = -0.16;
  box(g, mat(0xffe8d6), 0.32, 0.32, depth + 0.55, 0, 3.18, -depth / 2);
  // warm hanging lamp (emissive — kids read “cozinha / SPA quentinho”)
  cyl(g, mat(0x868e96), 0.03, 0.45, 0, 2.7, -depth / 2);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe066,
    emissive: 0xff922b,
    emissiveIntensity: 1.35,
    roughness: 0.35,
  });
  box(g, lampMat, 0.62, 0.2, 0.62, 0, 2.45, -depth / 2);
  const glow = new THREE.PointLight(0xffb067, 1.6, 9, 1.6);
  glow.position.set(0, 2.2, -depth / 2 + 0.2);
  g.add(glow);
  // second soft lamp near the table so the marquesa reads warm indoors
  const glow2 = new THREE.PointLight(0xffc078, 0.9, 6, 2);
  glow2.position.set(0, 2.1, -depth * 0.55);
  g.add(glow2);
  // side windows (frosted warm glass)
  for (const s of [-1, 1]) {
    box(g, mat(0xffd8a8, 0.25), 0.08, 0.75, 0.95, s * (hw - 0.02), 1.55, -depth / 2);
    box(g, mat(0xffffff), 0.1, 0.82, 0.08, s * (hw - 0.02), 1.55, -depth / 2 - 0.48);
    box(g, mat(0xffffff), 0.1, 0.82, 0.08, s * (hw - 0.02), 1.55, -depth / 2 + 0.48);
  }
  // towel rack on the left wall (folded towels — SPA, not a fair stall)
  box(g, mat(0xadb5bd), 0.06, 0.06, 1.1, -hw + 0.35, 1.55, -depth / 2);
  for (let i = 0; i < 3; i++) {
    const col = [0xffc9c9, 0xffe3e3, 0x96f2d7][i];
    box(g, mat(col), 0.22, 0.55, 0.08, -hw + 0.48, 1.25, -depth / 2 - 0.35 + i * 0.35);
  }
  // shelf + oil bottles on the back wall (recognisable cylinders — not on the table / face)
  box(g, mat(0xe9ecef), 1.4, 0.08, 0.28, 0, 1.35, -depth + 0.4);
  for (let i = 0; i < 3; i++) {
    const col = [0xffd43b, 0xff8787, 0x69db7c][i];
    cyl(g, mat(col), 0.07, 0.26, -0.4 + i * 0.4, 1.55, -depth + 0.45);
    cyl(g, mat(0xffffff), 0.05, 0.06, -0.4 + i * 0.4, 1.7, -depth + 0.45); // little cap
  }
  // plant in the corner
  cyl(g, mat(0x868e96), 0.14, 0.28, hw - 0.55, 0.28, -depth + 0.55);
  cyl(g, mat(0x2f9e44), 0.22, 0.45, hw - 0.55, 0.7, -depth + 0.55);
  // doorstep + soft doormat
  box(g, mat(0xadb5bd), doorW + 0.25, 0.08, 0.4, 0, 0.04, 0.22);
  box(g, mat(0x12b886), 1.2, 0.03, 0.55, 0, 0.06, 0.55);
}

/**
 * Marquesa (massage table) indoors: pad top at y≈0.84. Length along local Z.
 * Lie pose: feet toward +Z / door, head toward −Z; face-down (prone) with face visible.
 * No pillow / hand blocks on the pad — those looked like boxes covering her face.
 */
export function buildMassageTable(
  g: THREE.Group,
  x: number,
  z: number,
): { lx: number; ly: number; lz: number; face: number } {
  for (const [lx, lz] of [
    [x - 0.5, z - 0.75],
    [x + 0.5, z - 0.75],
    [x - 0.5, z + 0.75],
    [x + 0.5, z + 0.75],
  ] as const) {
    cyl(g, mat(0x868e96), 0.055, 0.7, lx, 0.35, lz);
  }
  box(g, mat(0xffffff), 1.35, 0.12, 1.9, x, 0.72, z);
  box(g, mat(0xffc9c9), 1.25, 0.1, 1.75, x, 0.84, z);
  // Pad kept clear — towels live on the wall rack; boxes on the pad read as “paralelipípedos”.
  // On her back: head tips toward local +Z of heading → face=π so head lies at −Z (back wall).
  // Feet toward the door (+Z).
  return { lx: x, ly: 0.84, lz: z + 0.4, face: Math.PI };
}
