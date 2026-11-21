import type * as THREE from 'three';
import type { Character } from '../character';
import type { GameCtx } from '../gamectx';
import type { Flyers, Site } from '../places';
import type { Interactable, Obstacle } from '../world';

/**
 * "Gente para conhecer": the characters of the 2026-11-15 brief (I01–I30) — fantasy characters and professions.
 * Each one stands on a small stage with its props, says good morning when she comes close and shows what it
 * knows; most of them also have a small thing to do together.
 *
 * A character = one `FolkDef` registered with `registerFolk()` (see folk.ts). The manager picks which ones each
 * city has (cities are not all the same), finds a free spot for each stage and calls `build(ctx)`.
 *
 * Project rules that every character must follow:
 *  - No UI marks in the world: no icons, arrows, outlines, labels or prompts. No text at all. She finds out by
 *    walking up, touching, clicking. Feedback = movement, sound (tone()), light, and the spoken voice (ctx.say).
 *  - Spoken lines: PT-PT, short, simple, for a 7–8-year-old. Kind tone, never scary.
 *  - Only original characters: no names, looks or catchphrases of existing IP (no Disney, Marvel, DC, etc.).
 *  - Keep everything inside the stage (|x| ≤ hw, -depth ≤ z ≤ 0); she stands in front of it (z > 0).
 *  - Paid-out coins go through `ctx.pay()`; guard repeatable rewards with `ctx.ready(key, seconds)`.
 */

export type FolkGroup = 'fantasia' | 'profissao';

export interface FolkDef {
  /** Stable id, lower case, no spaces: 'elfo', 'padeiro'… (also used in `?folk=elfo,padeiro` for testing). */
  id: string;
  /** Proposal id in the brief, e.g. 'I01' (for the reports). */
  ref: string;
  group: FolkGroup;
  /** Stage size (m): half width and depth. Typical: hw 2.5, depth 4. Keep it small: cities are crowded. */
  hw: number;
  depth: number;
  /** 'street' = beside a road, front to the pavement (shops, stands). 'green' = open ground away from the roads. */
  where: 'street' | 'green';
  /** Cities (CITIES names) where this character never appears (e.g. no king where there is no king). */
  notIn?: string[];
  /**
   * Cities (CITIES names) where this character ONLY appears (e.g. the king only in Londres). Skipped everywhere
   * else; in these cities he is always there (added on top if the rotation did not bring him).
   */
  onlyIn?: string[];
  /** true = outside the rotation: only added in its `onlyIn` cities, on top of the usual line-up (the fisherman). */
  extra?: boolean;
  /** 'green' stages only: true = the free spot farthest from the start, out on one side of the city. */
  edge?: boolean;
  /** Free metres kept in front of the door (street lamps / posts). Default 2. Cabins with a door: ~2.2. */
  apron?: number;
  build(ctx: FolkCtx): FolkActor;
}

export interface FolkActor {
  /** What she can touch / click here. The manager adds them to the world. */
  things: Interactable[];
  /**
   * The people of this stage who can be given a flower or an apple (gifts.ts). The manager registers them:
   * the person hops and waves when thanked. Optional.
   */
  people?: { object: THREE.Object3D; position: THREE.Vector3; thank(): void }[];
  /** Every frame (also while the game is paused: check `ctx.game.isPaused()` if something must freeze). */
  update(dt: number): void;
  /** Remove anything added outside `ctx.root` (to the scene, to the DOM, listeners…). */
  dispose?(): void;
  /** Extra state for automated checks (`?debug`). */
  debug?(): Record<string, unknown>;
}

export interface FolkCtx {
  readonly scene: THREE.Scene;
  readonly game: GameCtx;
  /** Seeded per city and character: use it for looks, so the same city always looks the same. */
  readonly rng: () => number;
  /**
   * The stage, already placed and turned. Local frame: x across (|x| ≤ hw), **+Z = the front** (where she comes
   * from; the road, for 'street' stages), z = 0 is the front line, the stage goes back to z = -depth. y up.
   * People face -Z by default: turn them by π so they face the front.
   */
  readonly root: THREE.Group;
  readonly site: Site;
  /** The player's character, for scripted moments. Only move her while `game.hold(true)` or through a seat. */
  readonly player: Character;
  /** City name and level (0 = Porto). */
  readonly city: string;
  readonly level: number;

  /** Stage-local (x, z[, y]) → world. */
  at(lx: number, lz: number, y?: number): THREE.Vector3;
  /** World heading for someone who looks along local heading `a` (0 = towards local -Z, π = towards the front). */
  heading(a: number): number;
  /** Make a local box solid (she can't walk through; pass `height` for low things the camera may look over). */
  block(x0: number, x1: number, z0: number, z1: number, height?: number): void;

  /** Speak as this character: narrator voice, skipped if a question or another line is being said. */
  say(lines: string[]): void;
  /** 'Bom dia!' / 'Boa tarde!' / 'Boa noite!' by the city's local time. */
  greeting(): string;
  /** City local hour (0–24) and daylight (0 = night … 1 = day). Do not call while building. */
  hour(): number;
  daylight(): number;

  /** `n` coins fly from a world point to her, one by one (+1 each as it lands). */
  pay(n: number, from: THREE.Vector3): void;
  /**
   * Cool-down for repeatable rewards: true the first time and then again only after `seconds` of play
   * (default 180). Example: `if (ctx.ready('bread')) ctx.pay(3, oven)`.
   */
  ready(key: string, seconds?: number): boolean;
  /** Things flying in an arc (see places.ts: coinMesh(), gemMesh(), or any mesh). */
  readonly fly: Flyers;
  /** Her distance (m) to a stage-local point. */
  herDist(lx: number, lz: number): number;
  /** True when she may act: on foot, not paused, not driving / flying / riding. */
  free(): boolean;
  /** Everything solid in the city (world boxes) — read only, e.g. to check that a path is clear (spawn.ts isFree). */
  readonly obstacles: readonly Obstacle[];
  /** Every car and bus within `radius` m of a world point brakes and waits `seconds` (the traffic officer). */
  stopTraffic(at: THREE.Vector3, radius: number, seconds: number): void;
}
