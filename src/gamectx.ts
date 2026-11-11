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
}
