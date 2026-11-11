import * as THREE from 'three';
import { PARK_X, RUNWAY_START_X, RUNWAY_Z, type Airport } from './airport';
import type { Character } from './character';

/** Camera pose the cutscene wants this frame. */
export interface CameraShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

interface Step {
  dur: number;
  /** t in [0,1] within this step */
  run(t: number, dt: number): CameraShot;
  /** called once when the step starts */
  enter?(): void;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = THREE.MathUtils.lerp;

/**
 * The whole trip as one scripted sequence:
 * walk up the stairs → door closes → take-off → (city switch, behind a white fade) →
 * cruise above the clouds → landing → taxi to the gate → walk down the stairs.
 */
export class Flight {
  done = false;
  private steps: Step[] = [];
  private i = 0;
  private t = 0;
  private airport: Airport;

  constructor(
    airport: Airport,
    private readonly player: Character,
    /** Swap the world to the destination city; must return the new city's airport. */
    private readonly switchCity: () => Airport,
    private readonly fade: (opaque: boolean) => void,
    private readonly onCruise: () => void,
  ) {
    this.airport = airport;
    this.build();
  }

  private build(): void {
    const p = this.player;
    const from = p.position.clone();
    let a = this.airport;

    const sideShot = (): CameraShot => ({
      // between the terminal (maxZ 21) and the stairs, slightly to the nose side, high enough to clear everything
      pos: new THREE.Vector3(PARK_X + 14, 6, RUNWAY_Z - 12),
      look: new THREE.Vector3(PARK_X + 4, 2, RUNWAY_Z - 2),
    });
    const chase = (back: number, up: number, side: number): CameraShot => {
      const pl = this.airport.plane.position;
      return {
        pos: new THREE.Vector3(pl.x - back, pl.y + up, pl.z - side),
        look: new THREE.Vector3(pl.x + 4, pl.y + 2, pl.z),
      };
    };

    // 1. walk to the bottom of the stairs, then up to the door, then inside
    this.steps.push({
      dur: 1.6,
      run: (t) => {
        const target = a.boardPoint;
        p.position.set(lerp(from.x, target.x, t), 0, lerp(from.z, target.z, t));
        p.heading = Math.atan2(-(target.x - from.x), -(target.z - from.z) || -1e-6);
        p.update(1 / 60, 5);
        return sideShot();
      },
    });
    this.steps.push({
      dur: 1.6,
      enter: () => {
        p.heading = Math.PI; // facing +Z, towards the plane
      },
      run: (t) => {
        const b = a.boardPoint;
        const d = a.doorPoint;
        p.position.set(b.x, lerp(0, d.y, t), lerp(b.z, d.z, t));
        p.update(1 / 60, 4);
        return sideShot();
      },
    });
    this.steps.push({
      dur: 0.8,
      run: (t) => {
        const d = a.doorPoint;
        const c = a.cabinPoint;
        p.position.set(d.x, d.y, lerp(d.z, c.z, t));
        p.update(1 / 60, 3);
        if (t >= 1) p.root.visible = false;
        return sideShot();
      },
    });
    // 2. door closes, stairs roll away
    this.steps.push({
      dur: 1.4,
      enter: () => {
        p.root.visible = false;
        a.setDoorOpen(false);
      },
      run: (t) => {
        a.setStairsAway(ease(t));
        return sideShot();
      },
    });
    // 3. take-off roll and climb
    this.steps.push({
      dur: 8,
      run: (t) => {
        const s = t * 8;
        const pl = a.plane;
        pl.position.x = PARK_X + 1.6 * s * s;
        const lift = Math.max(0, s - 4.5);
        pl.position.y = lift * lift * 1.4;
        pl.rotation.z = Math.min(0.22, lift * 0.12); // nose up (nose points +X)
        return chase(22, 6 + lift, 16);
      },
    });
    // 4. fade to white and switch city
    this.steps.push({
      dur: 0.9,
      enter: () => this.fade(true),
      run: () => chase(22, 9, 16),
    });
    this.steps.push({
      dur: 0.1,
      enter: () => {
        a = this.airport = this.switchCity();
        a.setDoorOpen(false);
        a.setStairsAway(1);
        a.plane.position.set(-110, 55, RUNWAY_Z);
        a.plane.rotation.z = 0;
        this.fade(false);
        this.onCruise();
      },
      run: () => chase(16, 5, 14),
    });
    // 5. cruise above the clouds
    this.steps.push({
      dur: 3.5,
      run: (t) => {
        a.plane.position.set(-110 + 14 * 3.5 * t, 55 + Math.sin(t * 6) * 0.4, RUNWAY_Z);
        return chase(16, 4, 14);
      },
    });
    // 6. descent to the runway threshold
    const descentFromX = -110 + 14 * 3.5;
    const touchX = RUNWAY_START_X + 4;
    this.steps.push({
      dur: 6.5,
      run: (t) => {
        a.plane.position.x = lerp(descentFromX, touchX, t);
        const flare = t > 0.85 ? (t - 0.85) / 0.15 : 0;
        a.plane.position.y = 55 * (1 - t) * (1 - t * 0.15);
        a.plane.rotation.z = lerp(-0.08, 0.1, flare);
        return chase(lerp(16, 24, t), lerp(4, 6, t), lerp(14, 18, t));
      },
    });
    // 7. roll out and stop at the gate
    this.steps.push({
      dur: ((PARK_X - touchX) * 2) / 14, // decelerate from the 14 m/s touchdown speed to a stop at the gate
      run: (t) => {
        const v0 = (PARK_X - touchX) * 2; // so the integral over 1 unit of t covers the distance
        a.plane.position.x = touchX + v0 * (t - (t * t) / 2) / 1;
        a.plane.position.y = 0;
        a.plane.rotation.z = lerp(0.1, 0, Math.min(1, t * 3));
        return chase(24, 6, 18);
      },
    });
    // 8. stairs come back, door opens
    this.steps.push({
      dur: 1.4,
      enter: () => {
        a.plane.position.set(PARK_X, 0, RUNWAY_Z);
        a.plane.rotation.z = 0;
      },
      run: (t) => {
        a.setStairsAway(1 - ease(t));
        if (t >= 1) a.setDoorOpen(true);
        return sideShot();
      },
    });
    // 9. character steps out and walks down
    this.steps.push({
      dur: 0.6,
      enter: () => {
        a.setDoorOpen(true);
        p.root.visible = true;
        p.heading = 0; // facing -Z, away from the plane
      },
      run: (t) => {
        const c = a.cabinPoint;
        const d = a.doorPoint;
        p.position.set(d.x, d.y, lerp(c.z, d.z, t));
        p.update(1 / 60, 3);
        return sideShot();
      },
    });
    this.steps.push({
      dur: 2.6,
      run: (t) => {
        const d = a.doorPoint;
        const b = a.boardPoint;
        // down the stairs, then a few steps away so the follow camera ends up clear of the plane
        const z = t < 0.6 ? lerp(d.z, b.z, t / 0.6) : lerp(b.z, b.z - 5, (t - 0.6) / 0.4);
        p.position.set(d.x, t < 0.6 ? lerp(d.y, 0, t / 0.6) : 0, z);
        p.update(1 / 60, 4);
        return sideShot();
      },
    });
  }

  /** Advance the sequence; returns the camera shot for this frame. */
  update(dt: number): CameraShot {
    const step = this.steps[this.i];
    if (this.t === 0) step.enter?.();
    this.t += dt;
    const shot = step.run(Math.min(1, this.t / step.dur), dt);
    if (this.t >= step.dur) {
      this.i += 1;
      this.t = 0;
      if (this.i >= this.steps.length) {
        this.done = true;
        this.player.position.y = 0;
        this.player.update(dt, 0);
      }
    }
    return shot;
  }
}
