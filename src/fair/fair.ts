import * as THREE from 'three';
import { audioContext, speak, tone } from '../audio';
import type { GameCtx } from '../gamectx';
import type { Interactable, Obstacle } from '../world';
import { ball, box, cyl, findPlot, mat, toWorld, worldBox, type Plot } from '../venue';
import { FAIR_ORDER, type AttractionId, type FairAttraction, type FairBuilder, type FairCtx } from './types';

/**
 * Feira popular: a big open fairground in every city, set back from a street (free entry through a lit arch).
 * City n (0-based level) gets the first 5 + n attractions of FAIR_ORDER (max 15). Each attraction has a fixed slot
 * so the layout grows city by city. Builders register themselves (rides.ts, games.ts, stalls.ts).
 *
 * Local frame (venue.ts convention): entrance at z = 0 facing the road (+Z), grounds x ∈ [-HW, HW], z ∈ [BACK, 0].
 * Main path x ∈ [-2, 2] from the arch to the back; cross path z ∈ [-17, -15].
 */

const HW = 22.5;
const BACK = -40;

const builders = new Map<string, FairBuilder>();
export function registerAttraction(id: AttractionId, b: FairBuilder): void {
  builders.set(id, b);
}

/** Slot of each attraction: centre (fair-local), rotation (local +Z of the slot → points at the path), half sizes. */
const SLOTS: Record<AttractionId, { x: number; z: number; rot: number; hw: number; hd: number }> = {
  // stalls along the main path (left side faces +x, right side faces -x)
  pipocas: { x: -4.6, z: -3.5, rot: Math.PI / 2, hw: 1.6, hd: 1.4 },
  cachorros: { x: 4.6, z: -3.5, rot: -Math.PI / 2, hw: 1.6, hd: 1.4 },
  pinturas: { x: -4.6, z: -7.5, rot: Math.PI / 2, hw: 1.6, hd: 1.4 },
  bijuteria: { x: 4.6, z: -7.5, rot: -Math.PI / 2, hw: 1.6, hd: 1.4 },
  artesanato: { x: -4.6, z: -11.5, rot: Math.PI / 2, hw: 1.6, hd: 1.4 },
  roupa: { x: 4.6, z: -11.5, rot: -Math.PI / 2, hw: 1.6, hd: 1.4 },
  // big rides in the front corners (facing the main path)
  choque: { x: -14.5, z: -7.5, rot: Math.PI / 2, hw: 6.3, hd: 6.3 },
  carrossel: { x: 14.5, z: -7.5, rot: -Math.PI / 2, hw: 6.3, hd: 6.3 },
  // games in the middle band, facing the cross path (+z)
  bolas: { x: -7.2, z: -21.5, rot: 0, hw: 2.9, hd: 3.3 },
  trampolim: { x: 7.2, z: -21.5, rot: 0, hw: 2.9, hd: 3.3 },
  baloes: { x: -13.4, z: -21.5, rot: 0, hw: 2.9, hd: 3.3 },
  arco: { x: 13.4, z: -21.5, rot: 0, hw: 2.9, hd: 3.3 },
  insuflavel: { x: -19.4, z: -21.5, rot: 0, hw: 2.7, hd: 3.3 },
  // the two biggest rides at the back, facing the middle (+z)
  montanha: { x: -12, z: -33, rot: 0, hw: 9.6, hd: 6.2 },
  river: { x: 12, z: -33, rot: 0, hw: 9.6, hd: 6.2 },
};

/** How many attractions a city has (level 0 = first city → 5). */
export function fairCount(level: number): number {
  return Math.min(FAIR_ORDER.length, 5 + Math.max(0, level));
}

export class Fair {
  readonly things: Interactable[] = [];
  readonly interior: Obstacle | null = null;
  readonly ids: AttractionId[];
  private readonly root = new THREE.Group();
  private plot: Plot | null = null;
  private readonly center = new THREE.Vector3();
  private attractions: { id: AttractionId; a: FairAttraction }[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private time = 0;
  private bulbs: THREE.Mesh[] = [];
  private inside = false;
  private musicT = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    avoid: THREE.Vector3[],
    level: number,
    room?: { buildings: Set<Obstacle>; clearArea(area: Obstacle, margin: number): void },
  ) {
    this.ids = FAIR_ORDER.slice(0, fairCount(level));
    let plot = findPlot(HW, BACK, obstacles, rng, avoid);
    if (!plot && room) {
      // crowded placeholder city: pretend the buildings aren't there, then clear the ones in the way
      plot = findPlot(HW, BACK, obstacles.filter((o) => !room.buildings.has(o)), rng, avoid);
      if (plot) room.clearArea(worldBox(plot, -HW, HW, BACK, 10), 3);
    }
    if (!plot) return;
    this.plot = plot;
    this.root.position.set(plot.x, 0, plot.z);
    this.root.rotation.y = plot.rot;
    scene.add(this.root);
    this.root.updateMatrixWorld(true);
    const c = toWorld(plot.x, plot.z, plot.rot, 0, BACK / 2);
    this.center.set(c.x, 0, c.z);
    this.interior = worldBox(plot, -HW, HW, BACK, 0.3);
    this.buildGrounds();
    for (const id of this.ids) this.buildAttraction(id, rng);
  }

  /* ------------------------------------------------------------ grounds */

  private buildGrounds(): void {
    const g = this.root;
    const plot = this.plot!;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -BACK), mat(0xe9d8a6));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.02, BACK / 2);
    ground.receiveShadow = true;
    g.add(ground);
    for (const [x0, x1, z0, z1] of [[-2, 2, BACK, 0], [-HW, HW, -17, -15]] as const) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(0xd9c39a));
      p.rotation.x = -Math.PI / 2;
      p.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
      g.add(p);
    }
    // low striped fence with bunting on top; 6 m wide entrance in the front
    const colors = [0xff6b6b, 0xffffff, 0x4dabf7, 0xffffff, 0xfcc419, 0xffffff];
    let k = 0;
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const alongX = z0 === z1;
      const len = Math.abs(alongX ? x1 - x0 : z1 - z0);
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        box(g, mat(colors[k++ % colors.length]), alongX ? len / n - 0.05 : 0.2, 1.2, alongX ? 0.2 : len / n - 0.05, x, 0.6, z);
      }
      const W = (a0: number, a1: number, b0: number, b1: number) => this.obstacles.push(worldBox(plot, a0, a1, b0, b1, 1.3));
      if (alongX) W(Math.min(x0, x1), Math.max(x0, x1), z0 - 0.12, z0 + 0.12);
      else W(x0 - 0.12, x0 + 0.12, Math.min(z0, z1), Math.max(z0, z1));
    };
    fence(-HW, 0, -3, 0);
    fence(3, 0, HW, 0);
    fence(-HW, BACK, HW, BACK);
    fence(-HW, BACK, -HW, 0);
    fence(HW, BACK, HW, 0);
    // entrance arch with light bulbs and flags
    for (const s of [-1, 1]) {
      cyl(g, mat(0xd6336c), 0.25, 5, s * 3.2, 2.5, 0);
      ball(g, mat(0xfcc419, 0.4), 0.35, s * 3.2, 5.2, 0);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.25, 8, 32, Math.PI), mat(0x7048e8));
    arch.position.set(0, 4.6, 0);
    g.add(arch);
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const b = ball(g, mat(0xfff3bf, 0.9), 0.09, Math.cos(a) * 3.2, 4.6 + Math.sin(a) * 3.2, 0.3);
      this.bulbs.push(b);
    }
    // bunting strings over the main path
    for (let z = -4; z > BACK + 2; z -= 6) {
      for (let i = 0; i < 9; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 3), mat([0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7, 0xcc5de8][i % 5]));
        f.position.set(-2 + i * 0.5, 3.6 - Math.sin((i / 8) * Math.PI) * 0.4, z);
        f.rotation.x = Math.PI;
        g.add(f);
      }
      for (const s of [-1, 1]) {
        cyl(g, mat(0xadb5bd), 0.05, 3.8, s * 2.3, 1.9, z);
        this.obstacles.push(worldBox(plot, s * 2.3 - 0.1, s * 2.3 + 0.1, z - 0.1, z + 0.1, 3.8));
      }
    }
  }

  /* ------------------------------------------------------------ attractions */

  private buildAttraction(id: AttractionId, rng: () => number): void {
    const slot = SLOTS[id];
    const plot = this.plot!;
    const group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    group.rotation.y = slot.rot;
    this.root.add(group);
    group.updateMatrixWorld(true);
    const local = (x: number, y: number, z: number) => group.localToWorld(new THREE.Vector3(x, y, z));
    const fctx: FairCtx = {
      game: this.ctx,
      scene: this.scene,
      group,
      hw: slot.hw,
      hd: slot.hd,
      rng,
      solid: (x0, x1, z0, z1, h) => {
        const a = local(x0, 0, z0);
        const b = local(x1, 0, z1);
        const o: Obstacle = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
        if (h !== undefined) o.height = h;
        this.obstacles.push(o);
      },
      at: (x, z) => local(x, 0, z).setY(0),
      toWorld: local,
      heading: (h) => plot.rot + slot.rot + h,
      pay: (n, to) => this.pay(n, to),
      give: (kind) => this.ctx.give(kind),
      wear: (s, kind) => this.ctx.wear(s, kind),
      worn: () => this.ctx.worn(),
      speak: (lines) => {
        if (!speechSynthesis.speaking) void speak(lines);
      },
      tone: (f, s, d, type, gain) => tone(f, s, d, type, gain),
      noise: (d, g, type, f, delay) => this.noise(d, g, type, f, delay ?? 0),
      dist: () => {
        const c = local(0, 0, 0);
        return Math.hypot(this.ctx.player.x - c.x, this.ctx.player.z - c.z);
      },
    };
    const b = builders.get(id);
    if (!b) {
      this.placeholder(group, slot.hw, slot.hd);
      fctx.solid(-slot.hw + 0.5, slot.hw - 0.5, -slot.hd + 0.5, slot.hd - 0.5, 2.5);
      return;
    }
    const a = b(fctx);
    this.attractions.push({ id, a });
    this.things.push(...a.things);
  }

  /** A striped tent where an attraction isn't built yet. */
  private placeholder(g: THREE.Group, hw: number, hd: number): void {
    const r = Math.min(hw, hd) - 0.5;
    cyl(g, mat(0xff8787), r, 2.2, 0, 1.1, 0);
    const top = new THREE.Mesh(new THREE.ConeGeometry(r + 0.2, 1.6, 12), mat(0xffffff));
    top.position.y = 3;
    g.add(top);
  }

  private flying: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; delay: number }[] = [];
  private pay(n: number, to: THREE.Vector3): boolean {
    if (this.ctx.isPaused() || this.ctx.isDriving()) return false;
    if (this.ctx.coins() < n) {
      tone(196, 0, 0.3, 'sine', 0.12);
      tone(174.6, 0.28, 0.45, 'sine', 0.1);
      return false;
    }
    this.ctx.addCoins(-n);
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat(0xffd43b, 0.3));
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.flying.push({ mesh: m, from: this.ctx.player.clone().setY(1.1), to: to.clone(), t: 0, delay: i * 0.1 });
    }
    return true;
  }

  private noise(d: number, gain: number, type: BiquadFilterType, freq: number, delay: number): void {
    const ac = audioContext();
    if (!ac) return;
    if (!this.noiseBuf) {
      const len = Math.floor(ac.sampleRate * 1.5);
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    const t = ac.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t, Math.random() * 0.3);
    src.stop(t + d + 0.05);
  }

  /* ------------------------------------------------------------ per frame */

  isInside(): boolean {
    return this.inside;
  }

  update(dt: number): void {
    if (!this.plot) return;
    this.time += dt;
    const p = this.ctx.player;
    const lp = this.root.worldToLocal(p.clone().setY(0));
    this.inside = Math.abs(lp.x) < HW && lp.z < 0 && lp.z > BACK;
    // coins flying to the counters
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i];
      c.delay -= dt;
      if (c.delay > 0) continue;
      c.mesh.visible = true;
      c.t = Math.min(1, c.t + dt / 0.45);
      c.mesh.position.lerpVectors(c.from, c.to, c.t);
      c.mesh.position.y += Math.sin(c.t * Math.PI) * 0.8;
      c.mesh.rotation.z += 0.3;
      if (c.t >= 1) {
        this.scene.remove(c.mesh);
        this.flying.splice(i, 1);
        tone(1568 + Math.random() * 120, 0, 0.06, 'square', 0.05);
        tone(2349, 0.04, 0.14, 'triangle', 0.06);
      }
    }
    const dist = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    if (dist > 75 || this.ctx.isPaused()) return;
    // the arch lights chase round
    this.bulbs.forEach((b, i) => (b.visible = Math.floor(this.time * 6 + i) % 3 !== 0));
    // a cheerful fairground organ tune while she's inside (quiet)
    if (this.inside) {
      this.musicT -= dt;
      if (this.musicT <= 0) {
        this.musicT = 6;
        [523, 659, 784, 659, 698, 880, 784, 659, 587, 523].forEach((f, i) => tone(f, i * 0.3, 0.26, 'square', 0.012));
      }
    }
    for (const { a } of this.attractions) a.update(dt);
  }

  dispose(): void {
    for (const { a } of this.attractions) a.dispose?.();
    for (const c of this.flying) this.scene.remove(c.mesh);
    this.flying = [];
  }

  debug(): Record<string, unknown> | null {
    if (!this.plot) return null;
    const r = (v: number) => +v.toFixed(1);
    const at = (x: number, z: number) => {
      const v = toWorld(this.plot!.x, this.plot!.z, this.plot!.rot, x, z);
      return [r(v.x), r(v.z)];
    };
    return {
      entrance: at(0, 2.5),
      center: at(0, -16),
      rot: +this.plot.rot.toFixed(2),
      inside: this.inside,
      ids: this.ids,
      built: this.attractions.map((x) => x.id),
      slots: Object.fromEntries(this.ids.map((id) => [id, at(SLOTS[id].x, SLOTS[id].z)])),
    };
  }
}
