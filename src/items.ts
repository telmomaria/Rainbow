import type * as THREE from 'three';

/**
 * Registry of things she can carry (bag items) and wear (accessories), so new modules (the fair stalls…) can add
 * their own without touching shops.ts / ui.ts / character.ts.
 */

export interface ItemDef {
  /** Spoken name (PT-PT, short). */
  name: string;
  /** Emoji shown in the bag on the left. */
  icon: string;
  /** Model held in her right hand (origin at the grip). */
  build: () => THREE.Group;
  /** Eaten bite by bite when tapped in the bag (false = just held: balloon, plush toy…). */
  edible: boolean;
}
const items = new Map<string, ItemDef>();
export function registerItem(kind: string, def: ItemDef): void {
  items.set(kind, def);
}
export function itemDef(kind: string): ItemDef | undefined {
  return items.get(kind);
}
export function itemKinds(): string[] {
  return [...items.keys()];
}

/** Where an accessory sits on the character. */
export type WearSlot = 'head' | 'face' | 'neck' | 'back';
export interface WearableDef {
  name: string;
  slot: WearSlot;
  /**
   * The accessory, built around its anchor: head = top of the head (y = 0 at the crown), face = surface of the face
   * (z = 0 at the face, -Z points forward), neck = base of the head, back = between the shoulders (+Z = behind her).
   * Sizes are for a head radius of ~0.34 m; the game scales it to each character.
   */
  build: () => THREE.Object3D;
}
const wearables = new Map<string, WearableDef>();
export function registerWearable(kind: string, def: WearableDef): void {
  wearables.set(kind, def);
}
export function wearableDef(kind: string): WearableDef | undefined {
  return wearables.get(kind);
}
