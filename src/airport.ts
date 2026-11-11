import * as THREE from 'three';
import type { Obstacle } from './world';

/**
 * Every city has the same small airport (until OSM worlds place it at the real one):
 * runway along +X, terminal and control tower beside it, and a plane parked at the start
 * of the runway with boarding stairs on its -Z side.
 */
export const RUNWAY_Z = 34;
export const RUNWAY_START_X = 20;
export const RUNWAY_END_X = 148;
export const PARK_X = 45;

/** Area kept free of buildings by the world generator. */
export const AIRPORT_ZONE: Obstacle = { minX: 12, maxX: 150, minZ: 13, maxZ: 50 };

const FUSELAGE_R = 1.5;
const FUSELAGE_Y = 2.6; // centre height above the wheels
const DOOR_LOCAL_X = 4;
const DOOR_SILL_Y = 1.7;
const STAIRS_LEN = 3.6;

export class Airport {
  /** Plane root: origin on the ground under the fuselage centre, nose towards +X. */
  readonly plane = new THREE.Group();
  /** Closed-door panel (hidden while the door is open). */
  readonly door: THREE.Mesh;
  readonly stairs = new THREE.Group();
  /** Where the character stands to board (bottom of the stairs). */
  readonly boardPoint: THREE.Vector3;
  /** Top of the stairs, at the open door. */
  readonly doorPoint: THREE.Vector3;
  readonly parkPos = new THREE.Vector3(PARK_X, 0, RUNWAY_Z);
  private readonly towerLight: THREE.Mesh;
  private readonly stairsHome: THREE.Vector3;
  private time = 0;

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    scene.add(buildRunway());

    const terminal = buildTerminal();
    terminal.position.set(42, 0, 18);
    scene.add(terminal);
    obstacles.push({ minX: 30, maxX: 54, minZ: 15, maxZ: 21 });

    const { tower, light } = buildTower();
    tower.position.set(70, 0, 18);
    scene.add(tower);
    this.towerLight = light;
    obstacles.push({ minX: 68.6, maxX: 71.4, minZ: 16.6, maxZ: 19.4 });

    const { plane, door } = buildPlane();
    this.plane.add(plane);
    this.door = door;
    this.plane.position.copy(this.parkPos);
    scene.add(this.plane);
    // fuselage + wings while parked
    obstacles.push({ minX: PARK_X - 8.5, maxX: PARK_X + 8.5, minZ: RUNWAY_Z - FUSELAGE_R, maxZ: RUNWAY_Z + FUSELAGE_R });
    obstacles.push({ minX: PARK_X - 1.5, maxX: PARK_X + 1.5, minZ: RUNWAY_Z - 8, maxZ: RUNWAY_Z + 8 });

    buildStairs(this.stairs);
    this.stairsHome = new THREE.Vector3(PARK_X + DOOR_LOCAL_X, 0, RUNWAY_Z - FUSELAGE_R - 0.15);
    this.stairs.position.copy(this.stairsHome);
    scene.add(this.stairs);

    this.doorPoint = new THREE.Vector3(PARK_X + DOOR_LOCAL_X, DOOR_SILL_Y, RUNWAY_Z - FUSELAGE_R - 0.3);
    this.boardPoint = new THREE.Vector3(PARK_X + DOOR_LOCAL_X, 0, RUNWAY_Z - FUSELAGE_R - STAIRS_LEN - 1.2);
    this.setDoorOpen(true);
  }

  setDoorOpen(open: boolean): void {
    this.door.visible = !open;
  }

  /** 0 = stairs at the door, 1 = pulled away from the plane. */
  setStairsAway(t: number): void {
    this.stairs.position.copy(this.stairsHome).add(new THREE.Vector3(0, 0, -4 * t));
  }

  /** Point inside the cabin, just past the door (for the character to disappear into). */
  get cabinPoint(): THREE.Vector3 {
    return new THREE.Vector3(PARK_X + DOOR_LOCAL_X, DOOR_SILL_Y, RUNWAY_Z);
  }

  update(dt: number): void {
    this.time += dt;
    (this.towerLight.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(this.time * 4) > 0 ? 2 : 0.1;
  }
}

function buildRunway(): THREE.Group {
  const g = new THREE.Group();
  const len = RUNWAY_END_X - RUNWAY_START_X;
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(len, 14), new THREE.MeshStandardMaterial({ color: 0x4a4e5a }));
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(RUNWAY_START_X + len / 2, 0.02, RUNWAY_Z);
  runway.receiveShadow = true;
  g.add(runway);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let x = RUNWAY_START_X + 18; x < RUNWAY_END_X - 4; x += 10) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.03, RUNWAY_Z);
    g.add(dash);
  }
  // threshold stripes
  for (let i = -5; i <= 5; i += 2) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), dashMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(RUNWAY_START_X + 4, 0.03, RUNWAY_Z + i);
    g.add(s);
  }
  // apron between the road and the runway
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshStandardMaterial({ color: 0x9a9eaa }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(42, 0.015, 25);
  apron.receiveShadow = true;
  g.add(apron);
  return g;
}

function buildTerminal(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(24, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.2, roughness: 0.2 }),
  );
  body.position.y = 3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(25, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  roof.position.y = 6.3;
  for (const m of [body, roof]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(body, roof);
  // big plane icon on both long sides, readable for kids who can't read yet
  const tex = makeSignTexture();
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(0, 7.8, side * 0.2);
    sign.rotation.y = side < 0 ? Math.PI : 0;
    g.add(sign);
  }
  return g;
}

function makeSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.roundRect(4, 4, 504, 120, 40);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✈ AEROPORTO', 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildTower(): { tower: THREE.Group; light: THREE.Mesh } {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 14, 16), new THREE.MeshStandardMaterial({ color: 0xf1f1f1 }));
  shaft.position.y = 7;
  const cabin = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 1.8, 3, 16),
    new THREE.MeshStandardMaterial({ color: 0x5ec8f0, metalness: 0.3, roughness: 0.15 }),
  );
  cabin.position.y = 15.5;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cap.position.y = 17.6;
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 }),
  );
  light.position.y = 18.5;
  for (const m of [shaft, cabin, cap]) m.castShadow = true;
  g.add(shaft, cabin, cap, light);
  return { tower: g, light };
}

function buildPlane(): { plane: THREE.Group; door: THREE.Mesh } {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24324a });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8bfcc });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(FUSELAGE_R, FUSELAGE_R, 13, 24), white);
  body.rotation.z = Math.PI / 2;
  body.position.set(0.5, FUSELAGE_Y, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(FUSELAGE_R, 24, 16), white);
  nose.scale.set(1.6, 1, 1);
  nose.position.set(7, FUSELAGE_Y, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(FUSELAGE_R, 4, 24), white);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-8, FUSELAGE_Y + 0.3, 0);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.8), dark);
  cockpit.position.set(8.4, FUSELAGE_Y + 0.6, 0);
  cockpit.rotation.z = -0.5;

  // rainbow stripe along both sides
  const stripeColors = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x007aff, 0xaf52de];
  stripeColors.forEach((c, i) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(12, 0.16, FUSELAGE_R * 2 + 0.04), new THREE.MeshStandardMaterial({ color: c }));
    s.position.set(0.3, FUSELAGE_Y - 0.25 - i * 0.16, 0);
    g.add(s);
  });

  const wing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 16), white);
  wing.position.set(0, FUSELAGE_Y - 0.6, 0);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 6), white);
  tailWing.position.set(-8.5, FUSELAGE_Y + 0.6, 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 0.25), new THREE.MeshStandardMaterial({ color: 0x7c3aed }));
  fin.position.set(-8.6, FUSELAGE_Y + 2, 0);
  fin.rotation.z = -0.35;
  g.add(body, nose, tail, cockpit, wing, tailWing, fin);

  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 16), grey);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(0.6, FUSELAGE_Y - 1.3, side * 4);
    g.add(engine);
    // windows
    for (let x = -6; x <= 6; x += 1.3) {
      if (side < 0 && Math.abs(x - DOOR_LOCAL_X) < 1) continue;
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.1), dark);
      w.position.set(x, FUSELAGE_Y + 0.45, side * (FUSELAGE_R - 0.02));
      g.add(w);
    }
  }
  // landing gear
  for (const [x, z] of [[6.5, 0], [-0.5, 1.4], [-0.5, -1.4]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), grey);
    leg.position.set(x, 0.9, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.35, z);
    g.add(leg, wheel);
  }
  // door frame (always) + closable door panel on the -Z side
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), dark);
  frame.position.set(DOOR_LOCAL_X, DOOR_SILL_Y + 1.05, -FUSELAGE_R + 0.02);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.05, 0.14), white);
  door.position.set(DOOR_LOCAL_X, DOOR_SILL_Y + 1.05, -FUSELAGE_R - 0.03);
  g.add(frame, door);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { plane: g, door };
}

/** Boarding stairs: origin at the top step's outer edge under the door, descending towards -Z. */
function buildStairs(g: THREE.Group): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffcc00 });
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const y = DOOR_SILL_Y - (i * DOOR_SILL_Y) / steps;
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, STAIRS_LEN / steps + 0.05), mat);
    step.position.set(0, y - 0.08, -(i + 0.5) * (STAIRS_LEN / steps));
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, Math.hypot(STAIRS_LEN, DOOR_SILL_Y)), railMat);
    rail.position.set(side * 0.7, DOOR_SILL_Y / 2 + 1, -STAIRS_LEN / 2);
    rail.rotation.x = -Math.atan2(DOOR_SILL_Y, STAIRS_LEN);
    g.add(rail);
    // wheels/base
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, STAIRS_LEN), railMat);
    base.position.set(side * 0.7, 0.15, -STAIRS_LEN / 2);
    g.add(base);
  }
}
