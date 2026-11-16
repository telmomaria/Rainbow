import type * as THREE from 'three';

/**
 * What gameplay modules (shops, trouble-makers, traffic, ...) may ask of the game.
 * main.ts implements it. Modules must not touch the DOM or show any text/UI: all feedback is in-world.
 */
export interface GameCtx {
  /** Character position (read-only — never mutate it). */
  readonly player: THREE.Vector3;
  /** Character heading in radians (0 = facing -Z). */
  heading(): number;
  coins(): number;
  /** Add (or, negative, spend) coins. The game clamps at 0, updates the counter and the save. */
  addCoins(n: number): void;
  /**
   * Hurt the character: knock her away from `from`, flash, and lose `cost` coins.
   * Returns false (and does nothing) if she can't be hurt right now (just hurt, driving, in a question, flying...).
   */
  hurt(from: THREE.Vector3, cost: number): boolean;
  /** Something the character holds in her hand, shown in the world (null = empty hands). */
  setCarried(item: THREE.Object3D | null, kind?: string): void;
  carried(): string | null;
  /** True while she's in the car (most pedestrian situations should ignore her then). */
  isDriving(): boolean;
  /** True while the game is paused (question on screen, flying, hospital...): freeze your actors. */
  isPaused(): boolean;
  /** Put an item (registered in items.ts or sold in shops.ts) into her bag and her hand. */
  give(kind: string): void;
  /** Wear an accessory (items.ts registerWearable) in its slot, or take the slot off (null). Saved. */
  wear(slot: import('./items').WearSlot, kind: string | null): void;
  /** What she wears now (slot → kind). */
  worn(): Record<string, string>;

  /* ---- added 2026-11-15 (brief didático): jewels as a second currency, module flags, small helpers ---- */

  /** Street jewels she carries and may spend (landmark diamonds are not included: they are kept for the Moon). */
  jewels(): number;
  /** Spend n street jewels. False (and nothing happens) if she doesn't have them. Updates the counter and the save. */
  spendJewels(n: number): boolean;
  /** A landmark diamond (never spent, kept for the Moon): counter + save. */
  addDiamond(): void;
  /** Persistent number for a module, e.g. flag('chest:Porto'). 0 when never set. "Novo jogo" clears them all. */
  flag(key: string): number;
  setFlag(key: string, value: number): void;
  /** Persistent short text for a module (hairstyle, a wall painting…). '' when never set. */
  text(key: string): string;
  setText(key: string, value: string): void;
  /** Name of the city she is in (as in cities.ts) and its level (0 = Porto). */
  city(): string;
  level(): number;
  /** True if the chosen character is a boy (Tomás): spoken lines agree ("simpático" / "simpática"). */
  isBoy(): boolean;
  /** Narrator line(s), only if nothing is being said already (never interrupts a question). */
  say(lines: string[]): void;
  /**
   * Freeze her for a short scripted moment (a mini-game, a ride, a chat): she can't walk, creatures stand still,
   * the idle pause is held off. Always call it again with false. Do not use it for questions (main does that).
   */
  hold(on: boolean): void;
  /**
   * While hold()'d on stairs: keep the walk cycle running at `speed` m/s (legs swing). Pass the next point
   * `(faceX, faceZ)` so she faces the step she's walking to. Call with 0 when the climb ends (hold(false) also clears it).
   */
  walkAnim(speed: number, faceX?: number, faceZ?: number): void;
  /** Is a monster-free moment/place active? (jewel shield on) */
  shielded(): boolean;
  /**
   * Ask a spoken question with three big options on screen (`answers[0]` is the right one; they are shuffled).
   * The game pauses while it is shown. Right = `reward` coins (paid here). Wrong costs nothing and the right
   * answer is not revealed. Resolves true if she got it right. `lang` 'en' = asked in English.
   * Resolves false straight away if a question can't be shown now (already paused, driving, flying…).
   */
  ask(q: { text: string; answers: [string, string, string] }, reward: number, lang?: 'pt' | 'en'): Promise<boolean>;
  /**
   * Spoken choice with big on-screen options (not a scored quiz). Game pauses while shown.
   * Resolves the chosen index, or `null` if a choice can't be shown now.
   */
  choose(text: string, options: string[]): Promise<number | null>;
  /**
   * Show a maximised photo overlay (camera portrait). Resolves when the child closes it.
   * Caller should keep the game paused around this call.
   */
  showPhoto(dataUrl: string): Promise<void>;
  /** Brief white screen flash (camera shutter). */
  flash(): void;
}
