import * as THREE from 'three';
import { tone } from './audio';

/**
 * Light shows made of glowing points, used where the world celebrates: fireworks over the fairy-tale castle
 * (usa.ts) and at the end of the game on the Moon (moon.ts); smoke and dust for the rocket (spaceport.ts).
 * No UI: only light, movement and a pop. Call update() every frame.
 */

let dot: THREE.CanvasTexture | null = null;
function dotTexture(): THREE.CanvasTexture {
  if (dot) return dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

interface Burst {
  pts: THREE.Points;
  vel: Float32Array;
  t: number;
  life: number;
  gravity: number;
  drag: number;
}

export const FIREWORK_COLORS = [0xff4d6d, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xff922b, 0xffffff];

export class Fireworks {
  private bursts: Burst[] = [];

  constructor(private readonly scene: THREE.Object3D) {}

  get active(): boolean {
    return this.bursts.length > 0;
  }

  /** One firework: a ball of sparks opening at `at`. `size` scales reach and spark size; `quiet` = no pop. */
  burst(at: THREE.Vector3, color: number, size = 1, quiet = false): void {
    const n = 80;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // even-ish directions on a sphere
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = (5 + Math.random() * 4) * size;
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      vel[i * 3] = Math.cos(a) * r * speed;
      vel[i * 3 + 1] = u * speed;
      vel[i * 3 + 2] = Math.sin(a) * r * speed;
    }
    this.add(pos, vel, color, 0.75 * size, 1.7, 3.2, 1.6, THREE.AdditiveBlending);
    if (!quiet) {
      tone(95, 0, 0.35, 'sine', 0.12);
      tone(1100 + Math.random() * 700, 0.04, 0.3, 'triangle', 0.03);
    }
  }

  /** A puff of smoke or dust rolling out sideways from `at` (rocket engine, Moon landing). */
  puff(at: THREE.Vector3, color: number, n = 14, spread = 5): void {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = spread * (0.4 + Math.random() * 0.8);
      pos[i * 3] = at.x + Math.cos(a) * 0.8;
      pos[i * 3 + 1] = at.y + Math.random() * 0.6;
      pos[i * 3 + 2] = at.z + Math.sin(a) * 0.8;
      vel[i * 3] = Math.cos(a) * speed;
      vel[i * 3 + 1] = 0.6 + Math.random() * 1.6;
      vel[i * 3 + 2] = Math.sin(a) * speed;
    }
    this.add(pos, vel, color, 3.4, 2.2, -0.3, 1.4, THREE.NormalBlending, 0.5);
  }

  private add(pos: Float32Array, vel: Float32Array, color: number, size: number, life: number, gravity: number, drag: number, blending: THREE.Blending, opacity = 1): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false, blending, fog: false });
    mat.userData.opacity = opacity;
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.bursts.push({ pts, vel, t: 0, life, gravity, drag });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const attr = b.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const p = attr.array as Float32Array;
      const k = Math.exp(-b.drag * dt);
      for (let j = 0; j < p.length; j += 3) {
        b.vel[j] *= k;
        b.vel[j + 1] = b.vel[j + 1] * k - b.gravity * dt;
        b.vel[j + 2] *= k;
        p[j] += b.vel[j] * dt;
        p[j + 1] += b.vel[j + 1] * dt;
        p[j + 2] += b.vel[j + 2] * dt;
      }
      attr.needsUpdate = true;
      const m = b.pts.material as THREE.PointsMaterial;
      const f = Math.min(1, b.t / b.life);
      m.opacity = (m.userData.opacity as number) * (1 - f * f);
      if (b.t >= b.life) this.drop(i);
    }
  }

  private drop(i: number): void {
    const b = this.bursts[i];
    b.pts.removeFromParent();
    b.pts.geometry.dispose();
    (b.pts.material as THREE.Material).dispose();
    this.bursts.splice(i, 1);
  }

  clear(): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) this.drop(i);
  }
}
