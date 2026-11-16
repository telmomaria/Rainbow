import * as THREE from 'three';
import type { Character } from './character';
import type { CameraShot } from './flight';
import { HATCH_Y, PAD, Spaceport, flicker } from './spaceport';

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;

interface Step {
  dur: number;
  run(t: number, dt: number): CameraShot;
  enter?(): void;
}

/**
 * Cabo Canaveral → Lua cutscene: lift up → hatch → countdown → launch → fade → land on the Moon.
 * Mirrors Flight's contract so main.ts can swap them.
 */
export class Launch {
  done = false;
  private steps: Step[] = [];
  private i = 0;
  private t = 0;

  constructor(
    private readonly port: Spaceport,
    private readonly player: Character,
    /** Swap the world to the Moon; return the new spaceport (unused) or null. */
    private readonly switchCity: () => void,
    private readonly fade: (opaque: boolean) => void,
    private readonly onCruise: () => void,
  ) {
    this.build();
  }

  private build(): void {
    const p = this.player;
    const port = this.port;
    const from = p.position.clone();
    const board = port.boardPoint.clone();
    const lift = port.liftPoint.clone();
    const cabin = port.cabinPoint.clone();

    this.steps = [
      {
        dur: 2.2,
        enter: () => {
          p.root.visible = true;
        },
        run: (t) => {
          const k = ease(t);
          p.position.lerpVectors(from, board, k);
          p.heading = Math.atan2(board.x - from.x, board.z - from.z);
          p.position.y = 0;
          return cam(board.x - 6, 4, board.z + 8, board.x, 2, board.z);
        },
      },
      {
        dur: 2.5,
        run: (t) => {
          const k = ease(t);
          p.position.lerpVectors(board, lift, k);
          const y = port.setLift(k);
          p.position.y = y;
          p.heading = Math.PI / 2;
          return cam(lift.x - 5, y + 3, lift.z + 6, PAD.x, y + 2, PAD.z);
        },
      },
      {
        dur: 1.8,
        enter: () => port.setHatchOpen(true),
        run: (t) => {
          const k = ease(t);
          p.position.lerpVectors(lift.clone().setY(HATCH_Y), cabin, k);
          p.position.y = HATCH_Y;
          if (t > 0.7) p.root.visible = false;
          return cam(PAD.x - 8, HATCH_Y + 2, PAD.z + 6, PAD.x, HATCH_Y, PAD.z);
        },
      },
      {
        dur: 1.2,
        enter: () => {
          port.setHatchOpen(false);
          port.setArmAway(0);
        },
        run: (t) => {
          port.setArmAway(ease(t));
          return cam(PAD.x - 12, 8, PAD.z + 14, PAD.x, 6, PAD.z);
        },
      },
      {
        dur: 3.5,
        enter: () => {
          port.setSmoke(true);
          port.setFlame(true);
          this.onCruise();
        },
        run: (t, dt) => {
          void dt;
          const k = ease(Math.max(0, (t - 0.25) / 0.75));
          port.rocket.group.position.y = k * 40;
          flicker(port.rocket, t * 10);
          if (t > 0.85) this.fade(true);
          return cam(PAD.x - 18, 10 + k * 20, PAD.z + 22, PAD.x, 8 + k * 30, PAD.z);
        },
      },
      {
        dur: 1.2,
        enter: () => {
          this.switchCity();
          port.setSmoke(false);
          port.setFlame(false);
          p.position.set(0, 0, 0);
          p.heading = -Math.PI / 2;
          p.root.visible = false;
        },
        run: () => cam(0, 30, 40, 0, 0, 0),
      },
      {
        dur: 2.5,
        enter: () => this.fade(false),
        run: (t) => {
          const k = ease(t);
          p.root.visible = true;
          p.position.set(lerp(0, 2, k), 0, lerp(-4, 2, k));
          return cam(-8, 6, 10, 2, 1, 2);
        },
      },
    ];
  }

  update(dt: number): CameraShot {
    if (this.done) return cam(0, 10, 10, 0, 0, 0);
    const step = this.steps[this.i];
    if (this.t === 0) step.enter?.();
    this.t += dt;
    const u = Math.min(1, this.t / step.dur);
    const shot = step.run(u, dt);
    if (u >= 1) {
      this.i++;
      this.t = 0;
      if (this.i >= this.steps.length) this.done = true;
    }
    return shot;
  }
}

function cam(x: number, y: number, z: number, lx: number, ly: number, lz: number): CameraShot {
  return { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz) };
}
