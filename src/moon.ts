import * as THREE from 'three';
import { tone } from './audio';
import { DIAMONDS_TO_FINISH } from './cities';
import { Fireworks, FIREWORK_COLORS } from './fireworks';
import type { GameCtx } from './gamectx';
import { gemMesh, mat } from './places';
import type { Interactable, Obstacle, World } from './world';

/** Half-extent of the walkable Moon (m). */
export const MOON_HALF = 90;
/** Lander / "Casa" point (LUA2: the home button brings her back here). */
export const LANDER = { x: -8, z: -6, h: -Math.PI / 2 } as const;
/** Altar centre. */
export const ALTAR = { x: 35, z: 5 } as const;

const CRATERS: [number, number, number, number][] = [
  [25, -20, 12, 2.2],
  [-35, 30, 10, 1.8],
  [50, 40, 14, 2.5],
  [-20, -45, 9, 1.6],
  [5, 55, 11, 2.0],
];

/**
 * The last level: grey rolling ground with craters, a lander near spawn, and a stone circle (altar)
 * where she places her diamonds to finish the game. Martians reuse Monsters with a martian look.
 */
export function moonHeight(x: number, z: number): number {
  let h = Math.sin(x * 0.04) * 1.2 + Math.cos(z * 0.035) * 1.0 + Math.sin((x + z) * 0.02) * 0.8;
  for (const [cx, cz, r, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < r) {
      const t = d / r;
      h -= depth * (1 - t) * (1 - t);
      if (d > r * 0.7) h += depth * 0.35 * (1 - Math.abs(t - 0.85) / 0.15);
    }
  }
  if (Math.hypot(x, z) < 8) h *= Math.hypot(x, z) / 8;
  if (Math.hypot(x - ALTAR.x, z - ALTAR.z) < 7) h = 0;
  if (Math.hypot(x - LANDER.x, z - LANDER.z) < 5) h = 0;
  return h;
}

/** True inside a deep crater bowl (LUA6: martians stay out). */
export function inDeepCrater(x: number, z: number): boolean {
  for (const [cx, cz, r] of CRATERS) {
    if (Math.hypot(x - cx, z - cz) < r * 0.65) return true;
  }
  return false;
}

export function buildMoonGround(scene: THREE.Scene): THREE.Mesh {
  const seg = 80;
  const geo = new THREE.PlaneGeometry(MOON_HALF * 2.4, MOON_HALF * 2.4, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, moonHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a9da6, roughness: 0.95, flatShading: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export class MoonAltar {
  readonly things: Interactable[] = [];
  private readonly fireworks: Fireworks;
  private readonly beam: THREE.Mesh;
  private readonly gems: THREE.Mesh[] = [];
  private done = false;
  private celebration = 0;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    private readonly ctx: GameCtx,
    private readonly offer: () => number,
    private readonly onFinish: (n: number) => void,
  ) {
    this.fireworks = new Fireworks(scene);
    const at = new THREE.Vector3(ALTAR.x, 0, ALTAR.z);
    const g = new THREE.Group();
    g.position.copy(at);
    scene.add(g);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6 + (i % 2) * 0.4, 0.5), mat(0x6c7078));
      s.position.set(Math.cos(a) * 4.2, 0.9, Math.sin(a) * 4.2);
      s.lookAt(0, 0.9, 0);
      s.castShadow = true;
      g.add(s);
    }
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.35, 24), mat(0x868e96));
    dais.position.y = 0.18;
    g.add(dais);
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.8, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.0 }),
    );
    this.beam.position.y = 7;
    g.add(this.beam);
    obstacles.push({ minX: at.x - 5, maxX: at.x + 5, minZ: at.z - 5, maxZ: at.z + 5, height: 0.4 });
    this.things.push({
      object: g,
      position: at.clone(),
      radius: 4.5,
      interact: () => this.place(),
    });
    if (ctx.flag('moon:done') > 0) {
      this.done = true;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.35;
    }
  }

  private place(): void {
    if (this.done) return;
    const total = this.offer();
    if (total < DIAMONDS_TO_FINISH) {
      this.ctx.say(['Traz as joias especiais para este círculo de pedras!']);
      tone(220, 0, 0.2, 'sine', 0.05);
      return;
    }
    this.done = true;
    this.ctx.setFlag('moon:done', 1);
    this.celebration = 8;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.45;
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.07));
    this.ctx.say(['As joias brilham na Lua! Completaste a viagem!']);
    for (let i = 0; i < Math.min(total, 6); i++) {
      const gem = gemMesh(FIREWORK_COLORS[i % FIREWORK_COLORS.length], 1.2);
      gem.position.set((i - 2.5) * 0.5, 1.2, 0);
      this.beam.parent?.add(gem);
      this.gems.push(gem);
    }
    this.onFinish(total);
  }

  update(dt: number): void {
    this.fireworks.update(dt);
    if (this.celebration > 0) {
      this.celebration -= dt;
      if (Math.random() < dt * 2) {
        const p = new THREE.Vector3(ALTAR.x + (Math.random() - 0.5) * 10, 6 + Math.random() * 8, ALTAR.z + (Math.random() - 0.5) * 10);
        this.fireworks.burst(p, FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)], 1.1);
      }
    }
    const m = this.beam.material as THREE.MeshBasicMaterial;
    if (this.done) m.opacity = 0.3 + Math.sin(performance.now() * 0.003) * 0.1;
  }

  dispose(): void {
    this.fireworks.clear();
  }
}

/** Lander wreck near spawn (visual only). */
export function buildLander(scene: THREE.Scene, obstacles: Obstacle[]): void {
  const g = new THREE.Group();
  g.position.set(LANDER.x, 0, LANDER.z);
  scene.add(g);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.2, 12), mat(0xf1f3f5));
  body.position.y = 1.8;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 12), mat(0xe03131));
  nose.position.y = 3.8;
  g.add(nose);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), mat(0x868e96));
    leg.position.set(Math.cos(a) * 1.6, 1.0, Math.sin(a) * 1.6);
    leg.rotation.z = Math.cos(a) * 0.4;
    leg.rotation.x = Math.sin(a) * 0.4;
    g.add(leg);
  }
  obstacles.push({ minX: LANDER.x - 3, maxX: LANDER.x + 3, minZ: LANDER.z - 3, maxZ: LANDER.z + 3 });
}

/** Bare Moon world: no city grid — grey ground, stars, Earth in the sky, lander. */
export function createMoonWorld(scene: THREE.Scene, city: import('./cities').City): World {
  scene.background = new THREE.Color(city.sky);
  scene.fog = new THREE.FogExp2(0x05060f, 0.012);
  const hemi = new THREE.HemisphereLight(0xb0b8c8, 0x2a2c32, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  scene.add(sun);
  const ground = buildMoonGround(scene);
  ground.name = 'ground';

  // stars
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * 0.9;
    starPos[i * 3] = Math.cos(a) * Math.cos(b) * 180;
    starPos[i * 3 + 1] = 20 + Math.sin(b) * 120;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * 180;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6 })));

  // Earth in the sky (LUA1)
  const earth = new THREE.Group();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 18), new THREE.MeshStandardMaterial({ color: 0x4dabf7, emissive: 0x1864ab, emissiveIntensity: 0.35 }));
  earth.add(globe);
  const land = new THREE.Mesh(new THREE.SphereGeometry(8.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2f9e44, transparent: true, opacity: 0.7 }));
  land.scale.set(1, 0.85, 0.7);
  earth.add(land);
  earth.position.set(-40, 55, -70);
  scene.add(earth);

  // scattered rocks
  const obstacles: Obstacle[] = [];
  buildLander(scene, obstacles);
  const rockMat = mat(0x6c7078);
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * MOON_HALF * 1.6;
    const z = (Math.random() - 0.5) * MOON_HALF * 1.6;
    if (Math.hypot(x, z) < 12 || Math.hypot(x - ALTAR.x, z - ALTAR.z) < 10 || Math.hypot(x - LANDER.x, z - LANDER.z) < 8) continue;
    const r = 0.4 + Math.random() * 1.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, moonHeight(x, z) + r * 0.4, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
    if (r > 0.9) obstacles.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, height: r * 1.2 });
  }

  const e = MOON_HALF;
  obstacles.push({ minX: -e - 20, maxX: -e, minZ: -e - 20, maxZ: e + 20 });
  obstacles.push({ minX: e, maxX: e + 20, minZ: -e - 20, maxZ: e + 20 });
  obstacles.push({ minX: -e - 20, maxX: e + 20, minZ: -e - 20, maxZ: -e });
  obstacles.push({ minX: -e - 20, maxX: e + 20, minZ: e, maxZ: e + 20 });
  return {
    ground,
    hemi,
    sun,
    obstacles,
    interactables: [],
    buildings: new Set(),
    clearArea() {},
    heightAt: moonHeight,
    update() {},
  };
}
