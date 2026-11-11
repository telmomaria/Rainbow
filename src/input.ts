/**
 * Arrow keys + mouse/touch input.
 * - Arrows: ↑ forward · ↓ back · ←/→ turn.
 * - Pointer click/tap (little movement): emits a "tap" at screen coords (walk there / use object).
 * - Pointer drag: rotates the camera (yaw/pitch deltas).
 * - Wheel / pinch: zoom.
 */
export class Input {
  readonly keys = { up: false, down: false, left: false, right: false };
  /** Accumulated drag since last consume, in pixels. */
  dragX = 0;
  dragY = 0;
  /** Accumulated zoom since last consume (positive = zoom out). */
  zoom = 0;
  private taps: { x: number; y: number }[] = [];

  private downAt: { x: number; y: number } | null = null;
  private last: { x: number; y: number } | null = null;
  private dragging = false;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(el: HTMLElement) {
    const keyMap: Record<string, keyof Input['keys']> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = keyMap[e.key];
      if (!k) return;
      e.preventDefault();
      this.keys[k] = down;
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      el.focus();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.downAt = this.last = { x: e.clientX, y: e.clientY };
        this.dragging = false;
      } else {
        this.downAt = null; // second finger: pinch, never a tap
        this.pinchDist = this.currentPinch();
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const d = this.currentPinch();
        this.zoom += (this.pinchDist - d) * 0.02;
        this.pinchDist = d;
        return;
      }
      if (!this.last) return;
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) {
        this.dragging = true;
      }
      if (this.dragging) {
        this.dragX += e.clientX - this.last.x;
        this.dragY += e.clientY - this.last.y;
      }
      this.last = { x: e.clientX, y: e.clientY };
    });
    const end = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        if (this.downAt && !this.dragging && e.type === 'pointerup') {
          this.taps.push({ x: e.clientX, y: e.clientY });
        }
        this.downAt = this.last = null;
        this.dragging = false;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom += Math.sign(e.deltaY) * 0.8;
      },
      { passive: false },
    );
  }

  consumeTaps(): { x: number; y: number }[] {
    const t = this.taps;
    this.taps = [];
    return t;
  }

  consumeDrag(): { dx: number; dy: number; zoom: number } {
    const r = { dx: this.dragX, dy: this.dragY, zoom: this.zoom };
    this.dragX = this.dragY = this.zoom = 0;
    return r;
  }

  private currentPinch(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
