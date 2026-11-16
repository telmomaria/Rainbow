import * as THREE from 'three';
import { registerItem } from './items';

/**
 * Picking things up and giving them away (rules R09 / G23 of the 2026-11-15 brief).
 *
 *  - Double click / double tap on something that can be picked (a flower in a flower bed, an apple in the apple
 *    tree…) = she walks there and picks it; it goes to the bag and to her hand. The thing itself decides
 *    (`Interactable.pick`).
 *  - With a gift in her hand, tapping a person = she walks up and gives it. The person thanks her (a hop, a wave,
 *    a spoken "thank you"); her mood goes up; the first gift to each person is worth 2 coins.
 *
 * Only the kinds registered here with `registerGift` can be given away (never food she bought, never the bread).
 * People who can receive gifts register themselves in `receivers` (the question characters are added by extras.ts).
 */

/** Coins for the first gift to each person. */
export const GIFT_COINS = 2;
/** She hands the gift over from this far (m): before she bumps into the person. */
export const GIVE_DIST = 2.4;

export interface GiftDef {
  /** What the person says, e.g. "Que flor tão bonita!" (after "Obrigado!"). */
  thanks: string;
}
const gifts = new Map<string, GiftDef>();
export function registerGift(kind: string, def: GiftDef): void {
  gifts.set(kind, def);
}
export function giftDef(kind: string | null): GiftDef | undefined {
  return kind ? gifts.get(kind) : undefined;
}

/** Someone who can be given things. */
export interface Receiver {
  /** The person's model (what the child taps). */
  object: THREE.Object3D;
  /** Where the person stands now (live). */
  position: THREE.Vector3;
  /** Stable name for "first gift = 2 coins" across reloads (e.g. `Porto:padeiro`). Omit for passers-by. */
  id?: string;
  /** False while the person can't take anything (walking away, busy…). */
  free?(): boolean;
  /** In-world reaction (a hop, a wave…). The spoken thanks are handled by the game. */
  thank(kind: string): void;
}

const list: Receiver[] = [];
/** Per-city registry: modules add their people; extras.ts empties it when the city changes. */
export const receivers = {
  add(r: Receiver): void {
    list.push(r);
  },
  remove(r: Receiver): void {
    const i = list.indexOf(r);
    if (i >= 0) list.splice(i, 1);
  },
  clear(): void {
    list.length = 0;
  },
  all(): readonly Receiver[] {
    return list;
  },
};

/* ------------------------------------------------------------------ the things she can pick */

const stemMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44 });

function buildFlower(): THREE.Group {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), stemMat);
  stem.position.y = 0.21;
  g.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stemMat);
  leaf.scale.set(1, 0.35, 0.5);
  leaf.position.set(0.06, 0.18, 0);
  g.add(leaf);
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xff6fb5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), petalMat);
    p.scale.set(1, 0.5, 1);
    p.position.set(Math.cos(a) * 0.075, 0.44, Math.sin(a) * 0.075);
    g.add(p);
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd43b }));
  heart.position.y = 0.46;
  g.add(heart);
  return g;
}

function buildApple(): THREE.Group {
  const g = new THREE.Group();
  const apple = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe03131, roughness: 0.4 }));
  apple.scale.y = 0.92;
  apple.position.y = 0.16;
  g.add(apple);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 5), new THREE.MeshStandardMaterial({ color: 0x5c3d2e }));
  stalk.position.y = 0.3;
  g.add(stalk);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), stemMat);
  leaf.scale.set(1.3, 0.3, 0.7);
  leaf.position.set(0.05, 0.31, 0);
  g.add(leaf);
  g.userData.edible = apple;
  return g;
}

registerItem('flor', { name: 'flor', icon: '🌸', build: buildFlower, edible: false });
registerItem('maca', { name: 'maçã', icon: '🍎', build: buildApple, edible: true });
registerGift('flor', { thanks: 'Que flor tão bonita!' });
registerGift('maca', { thanks: 'Que maçã tão boa!' });
