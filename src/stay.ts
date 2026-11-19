import { tone } from './audio';
import { feel, type LifeEvent } from './bus';

/**
 * "Stay as long as you want" rest spots (massage table, SPA hot water): while she stays, energy goes up one step every
 * `tickS` seconds (feel(tick) + a soft sound), optionally a one-off event when she settles in. Any arrow key / Space /
 * Enter / tap gets her up (same rule as sofa, bed and lounger). The owner calls `start()`, `update(dt)` every frame,
 * and gets `onUp()` on the next frame — while the game is still hold()'d, so the key that got her up is swallowed and
 * can't re-trigger the spot (plus `ready` keeps a 1.5 s gap before it can be used again).
 */
export class StaySession {
  active = false;
  /** Seconds since she settled in (animation + QA). */
  t = 0;
  /** Energy steps given this time (QA). */
  ticks = 0;
  private next = 0;
  private wantUp = false;
  private endedAt = -1e9;
  private off: (() => void) | null = null;

  constructor(
    private readonly onUp: () => void,
    private readonly opts: { tickS: number; tick: LifeEvent; start?: LifeEvent },
  ) {}

  /** Not in use and not just left (a held Enter must not use it again at once). */
  get ready(): boolean {
    return !this.active && performance.now() - this.endedAt > 1500;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.t = 0;
    this.ticks = 0;
    this.next = this.opts.tickS;
    this.wantUp = false;
    if (this.opts.start) feel(this.opts.start);
    const GET_UP = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'Enter']);
    const key = (e: KeyboardEvent): void => {
      if (!e.repeat && GET_UP.has(e.key) && this.t > 0.8) this.wantUp = true;
    };
    const tap = (): void => {
      if (this.t > 0.8) this.wantUp = true;
    };
    window.addEventListener('keydown', key, { capture: true });
    window.addEventListener('pointerdown', tap, { capture: true });
    this.off = () => {
      window.removeEventListener('keydown', key, { capture: true });
      window.removeEventListener('pointerdown', tap, { capture: true });
    };
  }

  /** Per frame. Returns true while she is still there. */
  update(dt: number): boolean {
    if (!this.active) return false;
    this.t += dt;
    if (this.t >= this.next) {
      this.next += this.opts.tickS;
      this.ticks++;
      feel(this.opts.tick);
      // soft, warm "aaah": two quiet low notes
      tone(294, 0, 0.5, 'sine', 0.035);
      tone(370, 0.18, 0.6, 'sine', 0.03);
    }
    if (this.wantUp) {
      this.stop();
      this.onUp();
      return false;
    }
    return true;
  }

  /** End without the callback (city change / dispose). */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.wantUp = false;
    this.endedAt = performance.now();
    this.off?.();
    this.off = null;
  }
}
