import type * as THREE from 'three';
import type { GameCtx } from '../gamectx';
import type { WearSlot } from '../items';
import type { Interactable } from '../world';

/**
 * Contract between the fair (fair.ts: grounds, layout, which attractions each city gets) and the attraction
 * builders (rides.ts, games.ts, stalls.ts).
 *
 * Each attraction gets its own slot group, already placed and rotated. In the slot's LOCAL frame:
 *  - origin = slot centre on the ground; the usable area is x ∈ [-hw, hw], z ∈ [-hd, hd];
 *  - **+Z points at the visitors' path** (the front: counters, entrances and stand spots go at z ≈ +hd);
 *  - everything faces the player like the rest of the game (characters look at -Z by default, so a seller standing
 *    behind a counter and facing the path needs rotation.y = Math.PI).
 * Build meshes as children of `ctx.group`. Register solid parts with `ctx.solid` (local boxes) so she can't walk
 * through them; keep ≥ 1.2 m free in front of every stand spot. No text, icons or UI in the world.
 */
export interface FairCtx {
  game: GameCtx;
  scene: THREE.Scene;
  /** Slot group (add your meshes here). */
  group: THREE.Group;
  /** Half extents of the slot (local x and z). */
  hw: number;
  hd: number;
  /** Deterministic per-city randomness (colours, variations). */
  rng: () => number;
  /** A solid local box [x0,x1]×[z0,z1] (optional height h in metres: low things let the camera pass over). */
  solid(x0: number, x1: number, z0: number, z1: number, h?: number): void;
  /** Local (x, z) → world position on the ground (stand spots for Interactables). */
  at(x: number, z: number): THREE.Vector3;
  /** Local point (x, y, z) → world (seat poses of rides…). */
  toWorld(x: number, y: number, z: number): THREE.Vector3;
  /** World heading of a local heading (0 = facing local -Z). */
  heading(local: number): number;
  /**
   * Charge n coins: coins fly from her to the local point `to` with clinks; false (and a low "hmm") if she can't pay.
   * Call it from interact(); it never pays twice for the same tap.
   */
  pay(n: number, to: THREE.Vector3): boolean;
  /** Item into her bag + hand (registerItem in items.ts first). */
  give(kind: string): void;
  /** Accessory on/off (registerWearable in items.ts first). */
  wear(slot: WearSlot, kind: string | null): void;
  worn(): Record<string, string>;
  /** Short spoken line(s) by the narrator (use sparingly). */
  speak(lines: string[]): void;
  /** One synthesized note. */
  tone(freq: number, start: number, dur: number, type?: OscillatorType, gain?: number): void;
  /** Filtered noise burst (splashes, whooshes, applause, sizzle…). */
  noise(dur: number, gain: number, type: BiquadFilterType, freq: number, delay?: number): void;
  /** Distance (m) from her to the slot centre. */
  dist(): number;
}

export interface FairAttraction {
  /** Things to touch / click (seats with `seat` for rides — see SwingSeat in props.ts). */
  things: Interactable[];
  /** Per frame (only called while she is within ~70 m and the game isn't paused). */
  update(dt: number): void;
  dispose?(): void;
}

export type FairBuilder = (ctx: FairCtx) => FairAttraction;

/** All attractions, in the order cities unlock them (city 1 gets the first 5, city 2 the first 6, …). */
export const FAIR_ORDER = [
  'carrossel',
  'pipocas',
  'bolas', // atirar bolas para ganhar peluches
  'trampolim',
  'baloes',
  'choque', // carrinhos de choque
  'cachorros', // cachorros-quentes
  'arco', // arco e flecha
  'insuflavel',
  'pinturas', // pinturas faciais
  'montanha', // montanha-russa
  'bijuteria',
  'river', // river ride (barcos-tronco num rio)
  'artesanato',
  'roupa',
] as const;
export type AttractionId = (typeof FAIR_ORDER)[number];
