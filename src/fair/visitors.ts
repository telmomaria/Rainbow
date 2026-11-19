import * as THREE from 'three';
import { isFree } from '../spawn';
import { type Folk } from '../venue';
import { onRoad, type Obstacle } from '../world';
import { randomFolk } from './ridekit';

/**
 * Fair visitors (Telmo, 2026-11-19: "não há pessoas a ir e sair da Feira Popular?").
 * 0–12 simple people (drawn per city) walk from the pavement in front of the fair, in through the arch, stroll along the paths to one
 * to three attractions (stopping a little at each), then walk back out and away along the pavement.
 * They are children of the fair root, so everything here is in FAIR-LOCAL coordinates (entrance at z = 0, the road
 * at +z). They are not obstacles (never trap her): they just step aside when she is right in front of them.
 * Routes are checked against the world obstacles and the roads the first time they are needed (after the whole
 * city is built). They only appear / vanish where she can't see it (far away or behind her).
 */

export interface VisitSpot {
  /** Waypoints from the main lane to the spot (the first one is ON the main lane: x is replaced by the visitor's lane). */
  via: [number, number][];
  /** Where to stand (before the per-visitor jitter) and the direction to look at (local heading of the attraction). */
  x: number;
  z: number;
  /** Jitter along the front (± metres) and which axis it runs on. */
  jx: number;
  jz: number;
  lookX: number;
  lookZ: number;
}

interface Waypoint {
  x: number;
  z: number;
  /** Seconds to stay here (0 = walk on). */
  wait: number;
  lookX: number;
  lookZ: number;
  spot?: VisitSpot;
}

type State = 'off' | 'walk' | 'stop' | 'leave';

interface Visitor {
  folk: Folk;
  state: State;
  timer: number;
  /** Starts the game already strolling inside. */
  fresh: boolean;
  route: Waypoint[];
  i: number;
  lane: number;
  speed: number;
  phase: number;
  side: number;
  heading: number;
}

const SPEED_MIN = 1.2;
const SPEED_MAX = 1.4;
/** Up to this many visitors; each fair draws 0…MAX_VISITORS (Telmo, 2026-11-19: "deverá ser de 0 a 12"). */
const MAX_VISITORS = 12;

export class FairVisitors {
  private readonly people: Visitor[] = [];
  private spots: VisitSpot[] = [];
  /** Outside approach: pavement points (both sides) + the forecourt point in front of the arch. Null = no free way in. */
  private outside: { far: [number, number][]; near: [number, number][]; arch: [number, number] } | null = null;
  private checked = false;
  private spawns = 0;
  private readonly lp = new THREE.Vector3();

  constructor(
    private readonly root: THREE.Group,
    private readonly toWorldXZ: (x: number, z: number) => { x: number; z: number },
    private readonly obstacles: Obstacle[],
    private readonly rawSpots: VisitSpot[],
    private readonly hw: number,
    rng: () => number,
  ) {
    const count = Math.floor(rng() * (MAX_VISITORS + 1)); // 0…12, fixed per city (seeded)
    for (let k = 0; k < count; k++) {
      const folk = randomFolk(rng);
      const kid = rng() < 0.3;
      if (kid) folk.group.scale.setScalar(0.72);
      folk.group.visible = false;
      root.add(folk.group);
      this.people.push({
        folk,
        state: 'off',
        timer: k < 5 ? 0 : 2 + k * 3 + rng() * 4, // the first 5 start already inside, the rest come in one by one
        fresh: k < 5,
        route: [],
        i: 0,
        lane: (rng() * 2 - 1) * 1.2,
        speed: SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN),
        phase: rng() * 10,
        side: rng() < 0.5 ? -1 : 1,
        heading: 0,
      });
    }
  }

  /* ------------------------------------------------------------ route checks (once, after the city is built) */

  private segFree(ax: number, az: number, bx: number, bz: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = this.toWorldXZ(ax + (bx - ax) * t, az + (bz - az) * t);
      if (onRoad(w.x, w.z, 0.5) || !isFree(w.x, w.z, 0.35, this.obstacles)) return false;
    }
    return true;
  }

  private check(): void {
    this.checked = true;
    // inside: keep only spots whose whole way from the main lane is clear (lane offsets −1.2…1.2 included)
    this.spots = this.rawSpots.filter((s) => {
      const pts: [number, number][] = [...s.via, [s.x, s.z]];
      for (const lane of [-1.2, 1.2]) {
        let [px, pz] = [lane, -1.5];
        for (let k = 0; k < pts.length; k++) {
          const [x, z] = k === 0 ? [lane, pts[0][1]] : pts[k];
          if (!this.segFree(px, pz, x, z)) return false;
          [px, pz] = [x, z];
        }
      }
      return true;
    });
    if (!this.spots.length) return;
    // outside: find where the road starts in front of the arch, walk on the forecourt just short of the pavement
    let edge = 30;
    for (let d = 1; d < 30; d += 0.5) {
      const w = this.toWorldXZ(0, d);
      if (onRoad(w.x, w.z)) {
        edge = d;
        break;
      }
    }
    const zp = Math.max(4, edge - 3);
    let arch: [number, number] | null = null;
    for (const ax of [0, -1.2, 1.2, -2, 2]) {
      if (this.segFree(ax, 2.5, 0, -1.5) && this.segFree(ax, zp, ax, 2.5)) {
        arch = [ax, 2.5];
        break;
      }
    }
    if (!arch) return;
    const near: [number, number][] = [];
    const far: [number, number][] = [];
    for (const s of [-1, 1]) {
      // a point on the forecourt a little to the side, then as far along the pavement line as it is clear
      let best: [number, number] | null = null;
      for (const x of [8, 5, 3]) {
        if (this.segFree(s * x, zp, arch[0], zp) && this.segFree(arch[0], zp, arch[0], 2.5)) {
          best = [s * x, zp];
          break;
        }
      }
      if (!best) continue;
      near.push(best);
      let reach = Math.abs(best[0]);
      for (let x = reach + 2; x <= this.hw + 14; x += 2) {
        if (!this.segFree(s * (x - 2), zp, s * x, zp)) break;
        reach = x;
      }
      far.push([s * reach, zp]);
    }
    if (!near.length) return;
    this.outside = { far, near, arch };
  }

  /* ------------------------------------------------------------ routes */

  private pickSpot(exclude: VisitSpot | null): Waypoint {
    let s = this.spots[Math.floor(Math.random() * this.spots.length)];
    if (s === exclude && this.spots.length > 1) s = this.spots[(this.spots.indexOf(s) + 1) % this.spots.length];
    const j = Math.random() * 2 - 1;
    const x = s.x + j * s.jx;
    const z = s.z + j * s.jz;
    return { x, z, wait: 4 + Math.random() * 6, lookX: s.lookX + j * s.jx, lookZ: s.lookZ + j * s.jz, spot: s };
  }

  private wp(x: number, z: number): Waypoint {
    return { x, z, wait: 0, lookX: 0, lookZ: 0 };
  }

  /** Main lane → spot (via its access waypoints). */
  private into(v: Visitor, s: VisitSpot, stop: Waypoint, out: Waypoint[]): void {
    out.push(this.wp(v.lane, s.via[0][1]));
    for (let k = 1; k < s.via.length; k++) out.push(this.wp(s.via[k][0], s.via[k][1]));
    out.push(stop);
  }
  /** Spot → back onto the main lane. */
  private outOf(v: Visitor, s: VisitSpot, out: Waypoint[]): void {
    for (let k = s.via.length - 1; k >= 1; k--) out.push(this.wp(s.via[k][0], s.via[k][1]));
    out.push(this.wp(v.lane, s.via[0][1]));
  }

  /** Visits (1–3) then out through the arch and away. `startInside` = begin standing at the first spot. */
  private buildRoute(v: Visitor, startInside: boolean, sideIn: number): void {
    const o = this.outside!;
    const route: Waypoint[] = [];
    if (!startInside) {
      route.push(this.wp(o.far[sideIn][0], o.far[sideIn][1]));
      route.push(this.wp(o.near[sideIn][0], o.near[sideIn][1]));
      route.push(this.wp(o.arch[0], o.near[sideIn][1]));
      route.push(this.wp(o.arch[0], o.arch[1]));
      route.push(this.wp(v.lane * 0.5, -1.5));
    }
    const visits = 1 + Math.floor(Math.random() * 3);
    let prev: VisitSpot | null = null;
    for (let k = 0; k < visits; k++) {
      const stop = this.pickSpot(prev);
      const spot = stop.spot!;
      if (startInside && k === 0) {
        route.push(stop);
        stop.wait *= Math.random();
      } else this.into(v, spot, stop, route);
      this.outOf(v, spot, route);
      prev = spot;
    }
    const sideOut = Math.floor(Math.random() * o.near.length);
    route.push(this.wp(v.lane * 0.5, -1.5));
    route.push(this.wp(o.arch[0], o.arch[1]));
    route.push(this.wp(o.arch[0], o.near[sideOut][1]));
    route.push(this.wp(o.near[sideOut][0], o.near[sideOut][1]));
    route.push(this.wp(o.far[sideOut][0], o.far[sideOut][1]));
    v.route = route;
    v.i = 0;
    const p = route[0];
    v.folk.group.position.set(p.x, 0, p.z);
    v.folk.group.visible = true;
    if (p.wait > 0) {
      v.state = 'stop';
      v.timer = p.wait;
    } else v.state = 'walk';
  }

  /** May someone pop in / out at local (x, z) now? Only far from her or behind her (out of the camera). */
  private unseen(x: number, z: number, heading: number): boolean {
    const dx = x - this.lp.x;
    const dz = z - this.lp.z;
    const d = Math.hypot(dx, dz);
    if (d > 32) return true;
    // her facing in fair-local: world heading minus the fair's rotation
    const h = heading - this.root.rotation.y;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    return d > 10 && (dx * fx + dz * fz) / d < -0.3;
  }

  /* ------------------------------------------------------------ per frame */

  update(dt: number, time: number, player: THREE.Vector3, heading: number): void {
    if (!this.checked) this.check();
    if (!this.outside) return;
    this.lp.copy(player);
    this.root.worldToLocal(this.lp);
    for (const v of this.people) {
      const f = v.folk;
      if (v.state === 'off') {
        v.timer -= dt;
        if (v.timer > 0) continue;
        if (v.fresh) {
          // first frame: the early ones are already strolling inside
          v.fresh = false;
          this.buildRoute(v, true, 0);
          continue;
        }
        const o = this.outside;
        const side = Math.floor(Math.random() * o.far.length);
        if (!this.unseen(o.far[side][0], o.far[side][1], heading)) {
          v.timer = 1;
          continue;
        }
        this.buildRoute(v, false, side);
        this.spawns++;
        continue;
      }
      if (v.state === 'stop') {
        v.timer -= dt;
        const p = v.route[v.i];
        this.face(v, p.lookX - f.group.position.x, p.lookZ - f.group.position.z, dt);
        this.pose(v, time, 0);
        if (v.timer <= 0) {
          v.i++;
          v.state = 'walk';
        }
        continue;
      }
      if (v.state === 'leave') {
        // at the far pavement point: vanish when she can't see it
        this.pose(v, time, 0);
        v.timer -= dt;
        if (v.timer <= 0) {
          v.timer = 0.5;
          if (this.unseen(f.group.position.x, f.group.position.z, heading)) {
            f.group.visible = false;
            v.state = 'off';
            v.timer = 4 + Math.random() * 10;
          }
        }
        continue;
      }
      // walk
      const p = v.route[v.i];
      const pos = f.group.position;
      let dx = p.x - pos.x;
      let dz = p.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < (p.wait > 0 ? 0.15 : 0.4)) {
        this.arrive(v, p);
        continue;
      }
      dx /= d;
      dz /= d;
      // she (or someone else) is right in front: steer round, slow down a little — never block her
      let slow = 1;
      let side = 0;
      const px = this.lp.x - pos.x;
      const pz = this.lp.z - pos.z;
      const pd = Math.hypot(px, pz);
      if (pd < 2.6 && px * dx + pz * dz > -0.2) {
        const across = px * -dz + pz * dx; // > 0: she is on the visitor's left
        side += (across > 0 ? -1 : 1) * (2.6 - pd) * 0.8;
        if (pd < 1.0) slow = 0.5;
        // her standing on the visitor's spot: stop next to her instead of circling
        if (d < 1.6 && Math.hypot(this.lp.x - p.x, this.lp.z - p.z) < 1.2) {
          pos.x = p.x - dx * 1.0;
          pos.z = p.z - dz * 1.0;
          this.arrive(v, p);
          continue;
        }
      }
      for (const o of this.people) {
        if (o === v || !o.folk.group.visible) continue;
        const ox = o.folk.group.position.x - pos.x;
        const oz = o.folk.group.position.z - pos.z;
        const od = ox * ox + oz * oz;
        if (od > 1.44 || ox * dx + oz * dz < 0.1) continue;
        // someone close ahead: slow down and drift to the side a little
        slow = Math.min(slow, o.state === 'walk' ? 0.75 : 0.85);
        side += (ox * -dz + oz * dx > 0 ? -1 : 1) * 0.6;
      }
      let mx = dx + -dz * side;
      let mz = dz + dx * side;
      const ml = Math.hypot(mx, mz);
      mx /= ml;
      mz /= ml;
      const step = Math.min(d, v.speed * slow * dt);
      pos.x += mx * step;
      pos.z += mz * step;
      this.face(v, mx, mz, dt);
      this.pose(v, time, slow);
    }
  }

  private arrive(v: Visitor, p: Waypoint): void {
    if (p.wait > 0) {
      v.state = 'stop';
      v.timer = p.wait;
    } else if (v.i >= v.route.length - 1) {
      v.state = 'leave';
      v.timer = 0;
    } else v.i++;
  }

  private face(v: Visitor, dx: number, dz: number, dt: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    const target = Math.atan2(-dx, -dz);
    let diff = target - v.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    v.heading += diff * Math.min(1, dt * 6);
    v.folk.group.rotation.y = v.heading;
  }

  /** Walk cycle (speed factor > 0) or a relaxed idle look-around (0). */
  private pose(v: Visitor, time: number, walking: number): void {
    const f = v.folk;
    const t = time + v.phase;
    if (walking > 0) {
      const s = Math.sin(t * 7.5) * 0.4 * walking;
      f.legL.rotation.x = s;
      f.legR.rotation.x = -s;
      f.armL.rotation.set(-s * 0.8, 0, -0.08);
      f.armR.rotation.set(s * 0.8, 0, 0.08);
      f.body.position.y = Math.abs(Math.cos(t * 7.5)) * 0.04 * walking;
      f.head.rotation.y = 0;
    } else {
      f.legL.rotation.x = f.legR.rotation.x = 0;
      f.body.position.y = 0;
      // now and then a little clap / wave at the attraction
      const clap = Math.sin(t * 0.7) > 0.85;
      if (clap) {
        const c = Math.sin(t * 14) * 0.25;
        f.armL.rotation.set(-1.2, 0, -0.35 - c);
        f.armR.rotation.set(-1.2, 0, 0.35 + c);
      } else {
        f.armL.rotation.set(0, 0, -0.08);
        f.armR.rotation.set(0, 0, 0.08);
      }
      f.head.rotation.y = Math.sin(t * 0.5) * 0.35;
    }
  }

  debug(): Record<string, number | boolean> {
    let visible = 0;
    let gone = 0;
    let inside = 0;
    let walking = 0;
    let stopped = 0;
    for (const v of this.people) {
      if (!v.folk.group.visible) {
        gone += v.route.length ? 1 : 0;
        continue;
      }
      visible++;
      if (v.folk.group.position.z < 0) inside++;
      if (v.state === 'walk') walking++;
      if (v.state === 'stop') stopped++;
    }
    return { visible, inside, walking, stopped, gone, spawns: this.spawns, spots: this.spots.length, ok: !!this.outside };
  }

  dispose(): void {
    for (const v of this.people) {
      this.root.remove(v.folk.group); // geometries are shared (venue.ts) or tiny: nothing else to free
    }
    this.people.length = 0;
  }
}
