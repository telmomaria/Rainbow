import * as THREE from 'three';
import { Fireworks } from './fireworks';
import type { Obstacle } from './world';

/**
 * Cabo Canaveral (Estados Unidos, the level before the Moon): there is no flight out of this level — a rocket
 * stands on its launch pad beside the runway, with a launch tower, a lift and an access arm to the hatch.
 * Original design, no agency logos. The launch itself is the cutscene in launch.ts.
 */

/** Height of the capsule hatch's floor above the rocket's feet. */
export const HATCH_Y = 8.2;
const BODY_R = 1.5;
const RAINBOW = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x007aff, 0xaf52de];

/** Launch pad centre: inside the strip every city keeps free for the airport, between the apron and the runway. */
export const PAD = { x: 104, z: 20.5 } as const;
const TOWER_DX = -4.6; // launch tower centre, relative to the pad centre
const TOWER_H = 13;

export interface Rocket {
  /** Origin on the ground under the rocket; the hatch is on its local -X side. */
  group: THREE.Group;
  flame: THREE.Group;
  /** Closed-hatch panel (hidden while the hatch is open). */
  hatch: THREE.Mesh;
}

/** The rocket: white body with the game's rainbow rings, red nose, purple fins, round windows. ~14 m tall. */
export function buildRocket(): Rocket {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.3, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8a909c, metalness: 0.4, roughness: 0.4 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  add(new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, 9, 28), white), 0, 6.1, 0);
  add(new THREE.Mesh(new THREE.ConeGeometry(BODY_R, 3.6, 28), new THREE.MeshStandardMaterial({ color: 0xe03131, roughness: 0.4 })), 0, 12.4, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd43b, metalness: 0.5, roughness: 0.3 })), 0, 14.25, 0);
  RAINBOW.forEach((c, i) => add(new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.03, BODY_R + 0.03, 0.24, 28), new THREE.MeshStandardMaterial({ color: c })), 0, 3.6 + i * 0.24, 0));
  // engine
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 1.3, 20), grey), 0, 0.95, 0);
  // round windows (not on the hatch side)
  for (const a of [0, Math.PI / 2, -Math.PI / 2]) {
    const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 20), dark), Math.cos(a) * BODY_R, 9.4, Math.sin(a) * BODY_R);
    w.rotation.z = Math.PI / 2;
    w.rotation.y = -a;
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 8, 24), grey), Math.cos(a) * (BODY_R + 0.04), 9.4, Math.sin(a) * (BODY_R + 0.04));
    ring.rotation.y = Math.PI / 2 - a;
  }
  // four fins, between the hatch side and the windows; the rocket stands on them
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0.9);
  finShape.lineTo(1.9, 0);
  finShape.lineTo(2.3, 0);
  finShape.lineTo(2.3, 0.7);
  finShape.lineTo(0, 4.6);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.24, bevelEnabled: false });
  finGeo.translate(0, 0, -0.12);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.x = BODY_R - 0.1;
    fin.castShadow = true;
    pivot.add(fin);
    g.add(pivot);
  }
  // hatch on the -X side: dark frame always, white panel when closed; rungs below it
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 1.2), dark), -BODY_R + 0.03, HATCH_Y + 1.0, 0);
  const hatch = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.95, 1.15), white), -BODY_R - 0.03, HATCH_Y + 1.0, 0);
  for (let y = 2.4; y < HATCH_Y - 0.2; y += 0.55) add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.7), grey), -BODY_R - 0.07, y, 0);

  // engine flame (shown while the engine burns)
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(1.0, 5, 16), new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9, fog: false }));
  outer.rotation.x = Math.PI;
  outer.position.y = -2.5;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 16), new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false }));
  inner.rotation.x = Math.PI;
  inner.position.y = -1.6;
  flame.add(outer, inner);
  flame.position.y = 0.4;
  flame.visible = false;
  g.add(flame);
  return { group: g, flame, hatch };
}

/** Flicker the flame of a burning engine. */
export function flicker(r: Rocket, time: number): void {
  r.flame.scale.set(1 + Math.sin(time * 37) * 0.08, 1 + Math.sin(time * 53) * 0.18, 1 + Math.cos(time * 41) * 0.08);
}

export class Spaceport {
  readonly rocket: Rocket;
  /** Where she steps onto the lift (at the foot of the launch tower). */
  readonly boardPoint: THREE.Vector3;
  /** On the lift platform (ground level; the lift carries her up to HATCH_Y). */
  readonly liftPoint: THREE.Vector3;
  /** Inside the capsule, just past the hatch. */
  readonly cabinPoint: THREE.Vector3;
  readonly padPos = new THREE.Vector3(PAD.x, 0, PAD.z);
  private readonly lift = new THREE.Group();
  private readonly arm = new THREE.Group();
  private readonly beacon: THREE.MeshStandardMaterial;
  private readonly smoke: Fireworks;
  private ready = false;
  private smoking = false;
  private smokeT = 0;
  private time = 0;

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    const g = new THREE.Group();
    scene.add(g);
    this.smoke = new Fireworks(scene);
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
    const box = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D = g): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // launch pad: a concrete disc with a yellow ring
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.08, 40), mat(0xb9bcc4));
    pad.position.set(PAD.x, 0.04, PAD.z);
    pad.receiveShadow = true;
    g.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 6.1, 48), new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(PAD.x, 0.09, PAD.z);
    g.add(ring);

    this.rocket = buildRocket();
    this.rocket.group.position.copy(this.padPos);
    scene.add(this.rocket.group);
    obstacles.push({ minX: PAD.x - 2.6, maxX: PAD.x + 2.6, minZ: PAD.z - 2.6, maxZ: PAD.z + 2.6 });

    // launch tower: four posts with braces, a floor at hatch height, a beacon on top
    const tx = PAD.x + TOWER_DX;
    const red = mat(0xd9480f);
    const steel = mat(0x868e96);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(red, 0.25, TOWER_H, 0.25, tx + sx, TOWER_H / 2, PAD.z + sz);
    for (let y = 2.6; y <= TOWER_H; y += 2.6) {
      for (const s of [-1, 1]) {
        box(steel, 2.25, 0.14, 0.14, tx, y, PAD.z + s);
        box(steel, 0.14, 0.14, 2.25, tx + s, y, PAD.z);
      }
    }
    box(steel, 2.3, 0.15, 2.3, tx, HATCH_Y - 0.08, PAD.z);
    box(steel, 2.6, 0.2, 2.6, tx, TOWER_H + 0.1, PAD.z);
    this.beacon = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), this.beacon);
    lamp.position.set(tx, TOWER_H + 0.6, PAD.z);
    g.add(lamp);
    obstacles.push({ minX: tx - 1.2, maxX: tx + 1.2, minZ: PAD.z - 1.2, maxZ: PAD.z + 1.2 });

    // lift: a platform with a rail on the tower's outer face
    const yellow = mat(0xffcc00);
    box(yellow, 1.8, 0.15, 1.8, 0, 0.02, 0, this.lift);
    for (const s of [-1, 1]) box(steel, 1.8, 0.08, 0.08, 0, 1.0, s * 0.86, this.lift);
    for (const s of [-1, 1]) for (const e of [-1, 1]) box(steel, 0.08, 1.0, 0.08, e * 0.86, 0.5, s * 0.86, this.lift);
    this.lift.position.set(tx - 2.05, 0, PAD.z);
    g.add(this.lift);
    for (const s of [-1, 1]) box(steel, 0.12, HATCH_Y + 1.2, 0.12, tx - 1.12, (HATCH_Y + 1.2) / 2, PAD.z + s * 0.6);

    // access arm from the tower to the hatch (swings away before the launch)
    box(steel, 2.0, 0.15, 1.2, 1.0, -0.08, 0, this.arm);
    for (const s of [-1, 1]) box(yellow, 2.0, 0.08, 0.06, 1.0, 0.95, s * 0.6, this.arm);
    this.arm.position.set(tx + 1.1, HATCH_Y, PAD.z);
    g.add(this.arm);

    // two round fuel tanks on legs, beyond the pad
    for (const x of [PAD.x + 10.5, PAD.x + 16]) {
      const tank = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), mat(0xf1f3f5));
      tank.position.set(x, 3.1, PAD.z - 3.4);
      tank.castShadow = true;
      g.add(tank);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(steel, 0.18, 1.8, 0.18, x + sx * 1.2, 0.9, PAD.z - 3.4 + sz * 1.2);
      obstacles.push({ minX: x - 2.1, maxX: x + 2.1, minZ: PAD.z - 5.5, maxZ: PAD.z - 1.3 });
    }

    this.liftPoint = new THREE.Vector3(tx - 2.05, 0, PAD.z);
    this.boardPoint = new THREE.Vector3(tx - 3.9, 0, PAD.z);
    this.cabinPoint = new THREE.Vector3(PAD.x - 0.5, HATCH_Y, PAD.z);
    this.setHatchOpen(false);
  }

  /** She has the coins for the trip: the beacon turns green and the hatch opens. */
  setReady(on: boolean): void {
    if (on === this.ready) return;
    this.ready = on;
    this.beacon.color.setHex(on ? 0x2fe06a : 0xff2020);
    this.beacon.emissive.setHex(on ? 0x18c24e : 0xff0000);
    this.setHatchOpen(on);
  }

  setHatchOpen(open: boolean): void {
    this.rocket.hatch.visible = !open;
  }

  /** 0 = lift on the ground, 1 = at the hatch. Returns the platform's height. */
  setLift(t: number): number {
    this.lift.position.y = HATCH_Y * t;
    return this.lift.position.y;
  }

  /** 0 = arm at the hatch, 1 = swung away from the rocket. */
  setArmAway(t: number): void {
    this.arm.rotation.y = t * 1.45;
  }

  /** Smoke rolling over the pad (the last seconds of the countdown and the lift-off). */
  setSmoke(on: boolean): void {
    this.smoking = on;
  }

  setFlame(on: boolean): void {
    this.rocket.flame.visible = on;
  }

  update(dt: number): void {
    this.time += dt;
    this.beacon.emissiveIntensity = this.ready ? 1.6 : Math.sin(this.time * 4) > 0 ? 2 : 0.15;
    if (this.rocket.flame.visible) flicker(this.rocket, this.time);
    if (this.smoking) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.12;
        this.smoke.puff(this.padPos, 0xf1f3f5, 10, 7);
      }
    }
    this.smoke.update(dt);
  }

  dispose(): void {
    this.smoke.clear();
  }
}
