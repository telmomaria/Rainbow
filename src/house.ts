import * as THREE from 'three';
import { audioContext, tone } from './audio';
import type { GameCtx } from './gamectx';
import type { SwingSeat } from './props';
import type { Interactable, Obstacle } from './world';
import { ball, box, cyl, findPlot, mat, toWorld, worldBox, type Plot } from './venue';

/**
 * A house in every city that she can walk into: hall, kitchen, living + dining room, bathroom, bedroom.
 * Everything inside reacts to touch (no text/UI): doorbell, coat rack, light switch, fridge, stove, taps, TV, radio,
 * lamps, shower, toilet, wardrobe, toy box… Sofa, dining chairs and the bed are clicked (or Enter next to them)
 * to sit / lie down; any key or tap gets up again. The roof disappears while she's inside so the camera sees in.
 *
 * Local frame (venue.ts convention): front wall z = 0 facing the road (+Z), house spans x ∈ [-8, 8], z ∈ [-14, 0].
 * Rooms: kitchen (x -8..-2, z -6..0) · hall (-2..2, -6..0) · living + dining (2..8, -14..0) ·
 *        bathroom (-8..-3.5, -14..-6) · bedroom (-3.5..2, -14..-6).
 */

const HW = 8;
const BACK = -14;
const WALL_H = 2.6;
const T = 0.2;

/** Outside colours of the house = the colours of the country's flag (walls · trims and door · roof). */
export interface HouseColors {
  wall: number;
  trim: number;
  roof: number;
}
const FLAG_COLORS: Record<string, HouseColors> = {
  Porto: { wall: 0x2b9348, trim: 0xffd60a, roof: 0xda291c }, // Portugal: verde, vermelho, amarelo
  Roma: { wall: 0xffffff, trim: 0x009246, roof: 0xce2b37 }, // Itália
  Madrid: { wall: 0xf1bf00, trim: 0xaa151b, roof: 0xaa151b }, // Espanha
  Londres: { wall: 0xffffff, trim: 0x012169, roof: 0xc8102e }, // Reino Unido
  Paris: { wall: 0xffffff, trim: 0x0055a4, roof: 0xef4135 }, // França
  'Varsóvia': { wall: 0xffffff, trim: 0xdc143c, roof: 0xdc143c }, // Polónia
  Vilnius: { wall: 0xfdb913, trim: 0x006a44, roof: 0xc1272d }, // Lituânia
  Moscovo: { wall: 0xffffff, trim: 0x0039a6, roof: 0xd52b1e }, // Rússia
  Pequim: { wall: 0xee1c25, trim: 0xffde00, roof: 0xffde00 }, // China
  'Tóquio': { wall: 0xffffff, trim: 0xbc002d, roof: 0xbc002d }, // Japão
  'Rio de Janeiro': { wall: 0xfedf00, trim: 0x009c3b, roof: 0x002776 }, // Brasil
  'Cidade do México': { wall: 0xffffff, trim: 0x006847, roof: 0xce1126 }, // México
  Reiquiavique: { wall: 0x02529c, trim: 0xffffff, roof: 0xdc1e35 }, // Islândia
  Nuuk: { wall: 0xd00c33, trim: 0xffffff, roof: 0xffffff }, // Gronelândia
};
export function houseColors(city: string): HouseColors {
  return FLAG_COLORS[city] ?? { wall: 0xffe8cc, trim: 0xffffff, roof: 0xc92a2a };
}

interface Toggle {
  on: boolean;
  t: number;
}

export class House {
  /** Interactables (touch or click) — main pushes them into world.interactables. */
  readonly things: Interactable[] = [];
  readonly interior: Obstacle | null = null;
  private readonly root = new THREE.Group();
  private plot: Plot | null = null;
  private roof: THREE.Group | null = null;
  private frontDoor: THREE.Group | null = null;
  private doorOpen = 0;
  private inside = false;
  private time = 0;
  private lightsOn = true;
  private readonly ceiling: THREE.MeshStandardMaterial;
  private updaters: ((dt: number) => void)[] = [];
  private noiseBuf: AudioBuffer | null = null;
  private drops: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    avoid: THREE.Vector3[],
    private readonly colors: HouseColors = houseColors(''),
  ) {
    this.ceiling = new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xffe066, emissiveIntensity: 1 });
    const plot = findPlot(HW + 0.5, BACK - 0.5, obstacles, rng, avoid);
    if (!plot) return;
    this.plot = plot;
    this.root.position.set(plot.x, 0, plot.z);
    this.root.rotation.y = plot.rot;
    scene.add(this.root);
    this.interior = worldBox(plot, -HW, HW, BACK, 0.3);
    this.buildShell();
    this.buildHall();
    this.buildKitchen();
    this.buildLiving();
    this.buildBathroom();
    this.buildBedroom();
  }

  /* ------------------------------------------------------------ helpers */

  /** Venue-local point → world. */
  private w(x: number, z: number): THREE.Vector3 {
    const p = toWorld(this.plot!.x, this.plot!.z, this.plot!.rot, x, z);
    return new THREE.Vector3(p.x, 0, p.z);
  }
  private solid(x0: number, x1: number, z0: number, z1: number, h?: number): void {
    this.obstacles.push(worldBox(this.plot!, x0, x1, z0, z1, h));
  }
  /** A wall from (x0,z0) to (x1,z1) (axis-aligned) with doorway gaps [a, b] along it. */
  private wall(x0: number, z0: number, x1: number, z1: number, gaps: [number, number][], color: number, outside = false): void {
    const alongX = z0 === z1;
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
    let s = a0;
    const seg = (from: number, to: number) => {
      if (to - from < 0.05) return;
      const mid = (from + to) / 2;
      const len = to - from;
      const m = mat(color);
      if (alongX) {
        box(this.root, m, len, WALL_H, T, mid, WALL_H / 2, z0);
        this.solid(from, to, z0 - T / 2, z0 + T / 2, WALL_H);
      } else {
        box(this.root, m, T, WALL_H, len, x0, WALL_H / 2, mid);
        this.solid(x0 - T / 2, x0 + T / 2, from, to, WALL_H);
      }
      if (outside) {
        // a white skirting + top trim outside
        if (alongX) box(this.root, mat(this.colors.trim), len, 0.15, T + 0.06, mid, WALL_H - 0.07, z0);
        else box(this.root, mat(this.colors.trim), T + 0.06, 0.15, len, x0, WALL_H - 0.07, mid);
      }
    };
    for (const [g0, g1] of cuts) {
      seg(s, g0);
      // lintel over the doorway
      const mid = (g0 + g1) / 2;
      if (alongX) box(this.root, mat(color), g1 - g0, 0.45, T, mid, WALL_H - 0.225, z0);
      else box(this.root, mat(color), T, 0.45, g1 - g0, x0, WALL_H - 0.225, mid);
      s = g1;
    }
    seg(s, a1);
  }
  private floor(x0: number, x1: number, z0: number, z1: number, color: number): void {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(color));
    f.rotation.x = -Math.PI / 2;
    f.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    f.receiveShadow = true;
    this.root.add(f);
  }
  private lamp(x: number, z: number): void {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), this.ceiling);
    b.position.set(x, WALL_H - 0.3, z);
    this.root.add(b);
    cyl(this.root, mat(0x868e96), 0.02, 0.3, x, WALL_H - 0.12, z);
  }
  /** Add an interactable whose stand spot is the local point (sx, sz). */
  private thing(object: THREE.Object3D, sx: number, sz: number, radius: number, interact: () => void, extra: Partial<Interactable> = {}): void {
    this.things.push({ object, position: this.w(sx, sz), radius, interact, ...extra });
  }
  private noise(d: number, gain: number, type: BiquadFilterType, freq: number, delay = 0): void {
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
    g.gain.linearRampToValueAtTime(gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t, Math.random() * 0.3);
    src.stop(t + d + 0.05);
  }
  /** Water drops falling from a local point (tap, shower). */
  private water(lx: number, ly: number, lz: number, n: number, spread: number): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), mat(0x74c0fc, 0.3));
      m.position.copy(this.root.localToWorld(new THREE.Vector3(lx + (Math.random() - 0.5) * spread, ly, lz + (Math.random() - 0.5) * spread)));
      this.scene.add(m);
      this.drops.push({ mesh: m, vel: new THREE.Vector3(0, -1 - Math.random(), 0), life: 1.2 });
    }
  }
  /** A clickable seat (sofa, chair, bed): she sits (or lies) at a local point facing `face` (local heading). */
  private seat(lx: number, ly: number, lz: number, face: number, offX: number, offZ: number, lying = false): SwingSeat {
    const plot = this.plot!;
    return {
      take: () => 0,
      pose: () => {
        const p = this.root.localToWorld(new THREE.Vector3(lx, ly, lz));
        return { pos: p, heading: plot.rot + face, tilt: 0, lying };
      },
      leave: () => {},
      getOff: () => this.w(offX, offZ),
    };
  }

  /* ------------------------------------------------------------ shell */

  private buildShell(): void {
    const g = this.root;
    const outer = this.colors.wall;
    const inner = 0xfff9f0;
    // exterior walls (front door gap x -0.9..0.9)
    this.wall(-HW, 0, HW, 0, [[-0.9, 0.9]], outer, true);
    this.wall(-HW, BACK, HW, BACK, [], outer, true);
    this.wall(-HW, BACK, -HW, 0, [], outer, true);
    this.wall(HW, BACK, HW, 0, [], outer, true);
    // interior walls with doorways
    this.wall(-2, -6, -2, 0, [[-4.3, -2.7]], inner); // kitchen | hall
    this.wall(2, -6, 2, 0, [[-4.3, -2.7]], inner); // hall | dining
    this.wall(2, BACK, 2, -6, [], inner); // bedroom | living
    this.wall(-HW, -6, 2, -6, [[-1.3, 0.3]], inner); // front rooms | bathroom + bedroom
    this.wall(-3.5, BACK, -3.5, -6, [[-9.6, -8.0]], inner); // bathroom | bedroom
    // floors: wood in hall/living/bedroom, tiles in kitchen and bathroom
    this.floor(-2, 2, -6, 0, 0xc8a27a);
    this.floor(-HW, -2, -6, 0, 0xe9ecef);
    this.floor(2, HW, BACK, 0, 0xd4a373);
    this.floor(-HW, -3.5, BACK, -6, 0xa5d8ff);
    this.floor(-3.5, 2, BACK, -6, 0xffd8e6);
    // ceiling lamps (switched together from the hall)
    for (const [x, z] of [[0, -3], [-5, -3], [5, -3], [5, -10], [-5.7, -10], [-0.7, -10]] as const) this.lamp(x, z);
    // windows on the outside (glass panes with white frames)
    const glass = mat(0x99e9f2, 0.15);
    const win = (x: number, z: number, alongX: boolean, sign: number) => {
      const fx = alongX ? 1.4 : 0.06;
      const fz = alongX ? 0.06 : 1.4;
      box(g, mat(0xffffff), alongX ? 1.6 : 0.08, 1.2, alongX ? 0.08 : 1.6, x + (alongX ? 0 : sign * 0.13), 1.45, z + (alongX ? sign * 0.13 : 0));
      box(g, glass, fx, 1.0, fz, x + (alongX ? 0 : sign * 0.16), 1.45, z + (alongX ? sign * 0.16 : 0));
    };
    win(-5, 0, true, 1);
    win(5, 0, true, 1);
    win(-5.7, BACK, true, -1);
    win(-0.7, BACK, true, -1);
    win(5, BACK, true, -1);
    win(-HW, -3, false, -1);
    win(-HW, -10, false, -1);
    win(HW, -3, false, 1);
    win(HW, -10, false, 1);
    // gable roof (hidden while she's inside)
    const roof = new THREE.Group();
    g.add(roof);
    const tiles = mat(this.colors.roof);
    const slope = Math.atan(2.4 / (-BACK / 2));
    const len = Math.hypot(2.4, -BACK / 2) + 0.4;
    for (const s of [-1, 1]) {
      const r = box(roof, tiles, HW * 2 + 0.8, 0.18, len, 0, WALL_H + 1.2, BACK / 2 + (s * -BACK) / 4);
      r.rotation.x = s * slope;
    }
    for (const x of [-HW, HW]) {
      const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, (-BACK / 2) * 1.0, 2.4, 3, 1), mat(outer));
      gable.rotation.set(0, 0, 0);
      gable.scale.set(1, 1, 1);
      gable.position.set(x, WALL_H + 1.2, BACK / 2);
      gable.rotation.x = Math.PI / 2;
      gable.rotation.z = Math.PI / 2;
      gable.visible = false; // the slopes overhang enough; keep the triangle off to avoid z-fighting
      roof.add(gable);
    }
    box(roof, mat(0x868e96), 0.8, 1.6, 0.8, 4.5, WALL_H + 2.2, BACK + 3.5); // chimney
    this.roof = roof;
    // front door (swings in when she comes near) + doorstep + path to the pavement
    const door = new THREE.Group();
    door.position.set(-0.9, 0, 0);
    g.add(door);
    box(door, mat(this.colors.trim), 1.8, 2.2, 0.08, 0.9, 1.1, 0);
    ball(door, mat(0xfcc419, 0.3), 0.07, 1.55, 1.05, 0.08);
    this.frontDoor = door;
    box(g, mat(0xced4da), 2.2, 0.08, 1.2, 0, 0.04, 0.7);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 8), mat(0xdee2e6));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.025, 5);
    g.add(path);
    // flower boxes under the front windows
    for (const x of [-5, 5]) {
      box(g, mat(0x8d6e63), 1.6, 0.3, 0.3, x, 0.75, 0.32);
      for (let i = 0; i < 5; i++) ball(g, mat([0xff6b6b, 0xfcc419, 0xcc5de8, 0xff922b, 0xf06595][i]), 0.1, x - 0.6 + i * 0.3, 0.98, 0.32);
    }
    // doorbell beside the door: ding-dong
    const bell = new THREE.Group();
    box(bell, mat(0xffffff), 0.14, 0.2, 0.05, 1.25, 1.3, 0.14);
    ball(bell, mat(0xfcc419, 0.4), 0.04, 1.25, 1.3, 0.17);
    g.add(bell);
    this.thing(bell, 1.3, 0.9, 0.6, () => {
      tone(659.3, 0, 0.6, 'sine', 0.12);
      tone(523.3, 0.45, 0.9, 'sine', 0.12);
    });
  }

  /* ------------------------------------------------------------ rooms */

  private buildHall(): void {
    const g = this.root;
    box(g, mat(0x2f9e44), 1.6, 0.03, 0.9, 0, 0.05, -0.8); // doormat
    // coat rack: coats sway when touched
    const rack = new THREE.Group();
    rack.position.set(-1.55, 0, -1.4);
    g.add(rack);
    cyl(rack, mat(0x8d6e63), 0.05, 1.9, 0, 0.95, 0);
    const coats: THREE.Group[] = [];
    [0xe03131, 0x1c7ed6, 0xfab005].forEach((c, i) => {
      const hook = new THREE.Group();
      hook.position.set(0, 1.75, 0);
      hook.rotation.y = (i / 3) * Math.PI * 2;
      rack.add(hook);
      box(hook, mat(c), 0.4, 0.8, 0.15, 0.18, -0.4, 0);
      coats.push(hook);
    });
    this.solid(-1.8, -1.3, -1.65, -1.15, 2);
    let sway = 0;
    this.thing(rack, -1.0, -1.4, 0.7, () => {
      sway = 1;
      this.noise(0.4, 0.04, 'bandpass', 1800);
    });
    this.updaters.push((dt) => {
      sway = Math.max(0, sway - dt * 0.6);
      coats.forEach((c, i) => (c.rotation.z = Math.sin(this.time * 6 + i) * 0.25 * sway));
    });
    // light switch on the right wall: all the house lights on/off
    const sw = new THREE.Group();
    box(sw, mat(0xffffff), 0.06, 0.22, 0.14, 1.86, 1.2, -1.0);
    const lever = box(sw, mat(0xfab005), 0.05, 0.08, 0.05, 1.82, 1.24, -1.0);
    g.add(sw);
    this.thing(sw, 1.3, -1.0, 0.6, () => {
      this.lightsOn = !this.lightsOn;
      this.ceiling.emissiveIntensity = this.lightsOn ? 1 : 0;
      lever.position.y = this.lightsOn ? 1.24 : 1.16;
      tone(1800, 0, 0.03, 'square', 0.05);
    });
    // a little shoe rack with shoes
    box(g, mat(0x8d6e63), 1.0, 0.4, 0.35, 1.3, 0.2, -5.4);
    for (let i = 0; i < 3; i++) box(g, mat([0xff6b6b, 0x4dabf7, 0x51cf66][i]), 0.2, 0.12, 0.3, 0.95 + i * 0.35, 0.46, -5.4);
    this.solid(0.8, 1.8, -5.6, -5.2, 0.6);
  }

  private buildKitchen(): void {
    const g = this.root;
    const counterX = -7.55;
    // counter along the left wall
    box(g, mat(0xffffff), 0.7, 0.9, 4.0, counterX + 0.1, 0.45, -2.6);
    box(g, mat(0x495057), 0.75, 0.05, 4.05, counterX + 0.1, 0.92, -2.6);
    this.solid(-HW, -7.1, -4.6, -0.6, 1);
    // fridge in the back corner: door opens, light inside, hum
    const fridge = new THREE.Group();
    g.add(fridge);
    box(fridge, mat(0xe9ecef), 0.8, 1.9, 0.8, -7.5, 0.95, -5.4);
    box(fridge, mat(0xfff3bf, 0.8), 0.6, 1.6, 0.05, -7.5, 0.95, -5.0);
    for (let i = 0; i < 3; i++) box(fridge, mat([0xff6b6b, 0x51cf66, 0xfcc419][i]), 0.15, 0.2, 0.15, -7.65 + i * 0.15, 0.6 + i * 0.45, -5.15);
    const fdoor = new THREE.Group();
    fdoor.position.set(-7.1, 0, -5.0);
    fridge.add(fdoor);
    box(fdoor, mat(0xdee2e6), 0.8, 1.85, 0.06, -0.4, 0.95, 0);
    box(fdoor, mat(0x868e96), 0.04, 0.4, 0.05, -0.72, 1.2, 0.05);
    this.solid(-7.95, -7.05, -5.85, -4.95, 2);
    const fr: Toggle = { on: false, t: 0 };
    this.thing(fridge, -6.7, -4.6, 0.7, () => {
      fr.on = true;
      fr.t = 4;
      tone(110, 0, 1.5, 'sawtooth', 0.02);
      this.noise(0.3, 0.05, 'lowpass', 600);
    });
    this.updaters.push((dt) => {
      fr.t = Math.max(0, fr.t - dt);
      const want = fr.t > 0 ? -1.7 : 0;
      fdoor.rotation.y += (want - fdoor.rotation.y) * Math.min(1, dt * 6);
    });
    // stove: burners glow and the pan sizzles
    const stove = new THREE.Group();
    g.add(stove);
    const burners: THREE.Mesh[] = [];
    for (const [dx, dz] of [[-0.15, -0.2], [-0.15, 0.2]] as const) {
      const b = cyl(stove, mat(0x343a40), 0.13, 0.02, counterX + 0.1 + dx, 0.96, -3.4 + dz);
      burners.push(b);
    }
    const pan = new THREE.Group();
    pan.position.set(counterX + 0.0, 0.99, -3.6);
    stove.add(pan);
    cyl(pan, mat(0x212529), 0.18, 0.06, 0, 0.03, 0);
    box(pan, mat(0x212529), 0.04, 0.03, 0.35, 0.0, 0.05, 0.3);
    const egg = ball(pan, mat(0xffffff), 0.08, 0, 0.07, 0);
    egg.scale.y = 0.3;
    ball(pan, mat(0xfcc419), 0.035, 0, 0.08, 0);
    const st: Toggle = { on: false, t: 0 };
    this.thing(stove, -6.6, -3.4, 0.7, () => {
      st.t = 6;
      [0, 0.4, 0.8, 1.2, 1.6, 2.0].forEach((d) => this.noise(0.5, 0.05, 'highpass', 3500, d)); // sizzle
    });
    this.updaters.push((dt) => {
      st.t = Math.max(0, st.t - dt);
      const hot = st.t > 0;
      for (const b of burners) {
        b.material = hot ? mat(0xff4d00, 0.9) : mat(0x343a40);
      }
      pan.position.y = 0.99 + (hot ? Math.abs(Math.sin(this.time * 18)) * 0.01 : 0);
    });
    // sink with a tap: water runs
    const sink = new THREE.Group();
    g.add(sink);
    box(sink, mat(0xadb5bd), 0.45, 0.06, 0.6, counterX + 0.1, 0.93, -1.4);
    const tap = cyl(sink, mat(0xced4da), 0.03, 0.35, counterX - 0.1, 1.12, -1.4);
    tap.rotation.z = 0.0;
    box(sink, mat(0xced4da), 0.25, 0.04, 0.04, counterX + 0.02, 1.28, -1.4);
    const sk: Toggle = { on: false, t: 0 };
    this.thing(sink, -6.6, -1.4, 0.7, () => {
      sk.t = 3;
      this.noise(3, 0.05, 'lowpass', 2200);
    });
    this.updaters.push((dt) => {
      sk.t = Math.max(0, sk.t - dt);
      if (sk.t > 0 && Math.random() < dt * 30) this.water(counterX + 0.12, 1.25, -1.4, 1, 0.03);
    });
    // kitchen table with a fruit bowl, and a cookie jar (lid pops)
    cyl(g, mat(0xffffff), 0.6, 0.05, -4.3, 0.75, -2.8);
    cyl(g, mat(0x8d6e63), 0.06, 0.75, -4.3, 0.37, -2.8);
    cyl(g, mat(0x74c0fc), 0.22, 0.08, -4.3, 0.81, -2.8);
    for (let i = 0; i < 3; i++) ball(g, mat([0xe03131, 0xfcc419, 0x51cf66][i]), 0.08, -4.4 + i * 0.1, 0.88, -2.8 + (i - 1) * 0.08);
    this.solid(-4.9, -3.7, -3.4, -2.2, 0.8);
    const jar = new THREE.Group();
    g.add(jar);
    cyl(jar, mat(0xffc9c9), 0.15, 0.25, counterX + 0.1, 1.07, -0.9);
    const lid = cyl(jar, mat(0xf06595), 0.16, 0.05, counterX + 0.1, 1.22, -0.9);
    let lidT = 0;
    this.thing(jar, -6.6, -0.9, 0.6, () => {
      lidT = 1.5;
      tone(880, 0, 0.1, 'triangle', 0.06);
      tone(1175, 0.1, 0.15, 'triangle', 0.06);
    });
    this.updaters.push((dt) => {
      lidT = Math.max(0, lidT - dt);
      lid.position.y = 1.22 + (lidT > 0 ? 0.25 + Math.sin(this.time * 12) * 0.03 : 0);
    });
  }

  private buildLiving(): void {
    const g = this.root;
    const plot = this.plot!;
    // --- dining (front half): table + 4 chairs to sit on
    box(g, mat(0x8d6e63), 2.4, 0.08, 1.2, 5, 0.76, -3);
    for (const [x, z] of [[4, -2.5], [6, -2.5], [4, -3.5], [6, -3.5]] as const) cyl(g, mat(0x6d4c41), 0.05, 0.75, x, 0.37, z);
    for (let i = 0; i < 4; i++) {
      cyl(g, mat(0xffffff), 0.14, 0.02, 4.1 + i * 0.6, 0.81, -3 + (i % 2 ? 0.35 : -0.35)); // plates
    }
    this.solid(3.8, 6.2, -3.6, -2.4, 0.85);
    const chairs: [number, number, number][] = [
      [4.3, -1.9, 0], // front side, facing -z (the table)
      [5.7, -1.9, 0],
      [4.3, -4.1, Math.PI], // back side, facing +z
      [5.7, -4.1, Math.PI],
    ];
    for (const [x, z, face] of chairs) {
      const c = new THREE.Group();
      c.position.set(x, 0, z);
      c.rotation.y = face;
      g.add(c);
      box(c, mat(0xe67700), 0.5, 0.06, 0.5, 0, 0.47, 0);
      box(c, mat(0xe67700), 0.5, 0.6, 0.06, 0, 0.8, 0.23);
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) cyl(c, mat(0x6d4c41), 0.025, 0.45, lx, 0.23, lz);
      const off = face === 0 ? 0.9 : -0.9;
      this.thing(c, x, z + off, 0.7, () => tone(330, 0, 0.12, 'triangle', 0.04), {
        requiresClick: true,
        seat: this.seat(x, 0.5, z, face, x, z + off),
      });
    }
    // --- living (back half): sofa facing the TV on the back wall
    const sofa = new THREE.Group();
    sofa.position.set(5, 0, -9.3);
    g.add(sofa);
    const fabric = mat(0x5c7cfa);
    box(sofa, fabric, 2.6, 0.45, 0.9, 0, 0.3, 0);
    box(sofa, fabric, 2.6, 0.7, 0.25, 0, 0.75, 0.35);
    for (const s of [-1, 1]) box(sofa, fabric, 0.25, 0.65, 0.9, s * 1.3, 0.45, 0);
    for (const s of [-1, 1]) box(sofa, mat(0xffd43b), 0.4, 0.35, 0.12, s * 0.7, 0.68, 0.2); // cushions
    this.solid(3.6, 6.4, -9.8, -8.8, 1.1);
    for (const sx of [4.4, 5.6]) {
      this.thing(sofa, sx, -10.4, 0.6, () => this.noise(0.25, 0.04, 'lowpass', 500), {
        requiresClick: true,
        seat: this.seat(sx, 0.5, -9.4, 0, sx, -10.4),
      });
    }
    box(g, mat(0x8d6e63), 1.2, 0.4, 0.6, 5, 0.2, -11.4); // coffee table
    this.solid(4.4, 5.6, -11.7, -11.1, 0.5);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), mat(0xf783ac));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(5, 0.04, -11);
    g.add(rug);
    // TV on a low cabinet: touch = on (colourful show + jingle), touch again = off
    const tv = new THREE.Group();
    g.add(tv);
    box(tv, mat(0x6d4c41), 2.2, 0.5, 0.45, 5, 0.25, -13.55);
    box(tv, mat(0x212529), 1.9, 1.1, 0.08, 5, 1.2, -13.65);
    const screen = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.95), screen);
    scr.position.set(5, 1.2, -13.6);
    tv.add(scr);
    const blobs: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: [0xff6b6b, 0xfcc419, 0x51cf66, 0x4dabf7][i] }));
      b.position.set(5, 1.2, -13.59);
      b.visible = false;
      tv.add(b);
      blobs.push(b);
    }
    this.solid(3.9, 6.1, -13.9, -13.3, 1.8);
    const tvState: Toggle = { on: false, t: 0 };
    this.thing(tv, 5, -12.6, 0.7, () => {
      tvState.on = !tvState.on;
      tvState.t = 0;
      tone(tvState.on ? 880 : 440, 0, 0.1, 'square', 0.04);
    });
    const tvTune = [523, 659, 784, 659, 523, 587, 659, 523];
    this.updaters.push((dt) => {
      screen.color.setHex(tvState.on ? 0x1c7ed6 : 0x111111);
      blobs.forEach((b, i) => {
        b.visible = tvState.on;
        b.position.x = 5 + Math.sin(this.time * (1 + i * 0.3) + i) * 0.7;
        b.position.y = 1.2 + Math.cos(this.time * (1.3 + i * 0.2) + i * 2) * 0.33;
      });
      if (tvState.on && this.inside) {
        tvState.t += dt;
        if (tvState.t > 0.35) {
          tvState.t = 0;
          const n = tvTune[Math.floor(this.time / 0.35) % tvTune.length];
          tone(n, 0, 0.25, 'triangle', 0.03);
        }
      }
    });
    // radio on a sideboard: plays a little tune
    box(g, mat(0x6d4c41), 0.5, 0.9, 1.6, 7.6, 0.45, -6.8);
    this.solid(7.3, 8, -7.6, -6.0, 1);
    const radio = new THREE.Group();
    g.add(radio);
    box(radio, mat(0xe03131), 0.3, 0.3, 0.5, 7.6, 1.05, -6.8);
    cyl(radio, mat(0x212529), 0.09, 0.02, 7.44, 1.05, -6.9).rotation.z = Math.PI / 2;
    this.thing(radio, 6.8, -6.8, 0.6, () => {
      [392, 392, 440, 392, 523, 494, 392, 392, 440, 392, 587, 523].forEach((f, i) => tone(f, i * 0.28, 0.25, 'triangle', 0.06));
    });
    // floor lamp in the corner: on / off
    const fl = new THREE.Group();
    g.add(fl);
    cyl(fl, mat(0x868e96), 0.04, 1.6, 7.3, 0.8, -12.8);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.4, 16, 1, true), mat(0xfff3bf, 0.9));
    shade.position.set(7.3, 1.75, -12.8);
    fl.add(shade);
    this.solid(7.0, 7.6, -13.1, -12.5, 1.9);
    let flOn = true;
    this.thing(fl, 6.6, -12.4, 0.6, () => {
      flOn = !flOn;
      shade.material = flOn ? mat(0xfff3bf, 0.9) : mat(0xfff3bf);
      tone(1500, 0, 0.03, 'square', 0.04);
    });
    // a big plant
    cyl(g, mat(0xe8590c), 0.3, 0.5, 2.6, 0.25, -13.4);
    ball(g, mat(0x2f9e44), 0.55, 2.6, 0.95, -13.4);
    this.solid(2.25, 2.95, -13.75, -13.05, 1.5);
    void plot;
  }

  private buildBathroom(): void {
    const g = this.root;
    // bathtub with a shower: touch = shower rain
    const tub = new THREE.Group();
    g.add(tub);
    box(tub, mat(0xffffff), 2.4, 0.55, 1.0, -6.6, 0.28, -13.35);
    box(tub, mat(0x74c0fc, 0.2), 2.1, 0.05, 0.75, -6.6, 0.5, -13.35);
    cyl(tub, mat(0xced4da), 0.03, 1.6, -7.75, 1.4, -13.75);
    const head = cyl(tub, mat(0xced4da), 0.12, 0.05, -7.55, 2.15, -13.6);
    head.rotation.z = 0.5;
    // a rubber duck
    const duck = new THREE.Group();
    duck.position.set(-6.0, 0.55, -13.3);
    tub.add(duck);
    ball(duck, mat(0xfcc419), 0.1, 0, 0.05, 0);
    ball(duck, mat(0xfcc419), 0.06, 0, 0.14, -0.06);
    ball(duck, mat(0xff922b), 0.03, 0, 0.13, -0.12);
    this.solid(-HW, -5.35, -14, -12.8, 0.6);
    const sh: Toggle = { on: false, t: 0 };
    this.thing(tub, -6.6, -12.3, 0.7, () => {
      sh.t = 4;
      this.noise(4, 0.06, 'lowpass', 3000);
    });
    this.updaters.push((dt) => {
      sh.t = Math.max(0, sh.t - dt);
      if (sh.t > 0 && Math.random() < dt * 60) this.water(-7.45, 2.1, -13.55, 1, 0.5);
      duck.position.y = 0.55 + Math.sin(this.time * 2) * 0.02;
      duck.rotation.y = Math.sin(this.time * 0.7) * 0.4;
    });
    // toilet: flush
    const wc = new THREE.Group();
    g.add(wc);
    cyl(wc, mat(0xffffff), 0.25, 0.42, -4.3, 0.21, -13.3);
    box(wc, mat(0xffffff), 0.5, 0.55, 0.22, -4.3, 0.65, -13.7);
    const lidWc = box(wc, mat(0xf1f3f5), 0.48, 0.04, 0.5, -4.3, 0.44, -13.3);
    box(wc, mat(0xced4da), 0.1, 0.05, 0.05, -4.1, 0.95, -13.6);
    this.solid(-4.6, -4.0, -13.9, -13.0, 0.9);
    let flush = 0;
    this.thing(wc, -4.3, -12.4, 0.6, () => {
      flush = 1.8;
      this.noise(1.6, 0.09, 'lowpass', 900);
      this.noise(1.2, 0.04, 'bandpass', 2400, 0.3);
    });
    this.updaters.push((dt) => {
      flush = Math.max(0, flush - dt);
      lidWc.rotation.x = flush > 0 ? -0.0 : 0;
      lidWc.position.y = 0.44 + (flush > 0 ? Math.abs(Math.sin(this.time * 20)) * 0.01 : 0);
    });
    // washbasin with a mirror
    const basin = new THREE.Group();
    g.add(basin);
    cyl(basin, mat(0xffffff), 0.08, 0.8, -7.7, 0.4, -7.6);
    box(basin, mat(0xffffff), 0.5, 0.15, 0.6, -7.65, 0.85, -7.6);
    cyl(basin, mat(0xced4da), 0.025, 0.25, -7.82, 1.0, -7.6);
    box(basin, mat(0xd0ebff, 0.25), 0.04, 0.8, 0.7, -7.88, 1.6, -7.6); // mirror
    this.solid(-HW, -7.35, -7.95, -7.25, 1);
    const bs: Toggle = { on: false, t: 0 };
    this.thing(basin, -6.9, -7.6, 0.6, () => {
      bs.t = 2.5;
      this.noise(2.5, 0.05, 'lowpass', 2200);
    });
    this.updaters.push((dt) => {
      bs.t = Math.max(0, bs.t - dt);
      if (bs.t > 0 && Math.random() < dt * 30) this.water(-7.7, 1.08, -7.6, 1, 0.03);
    });
    // towel rail
    box(g, mat(0x51cf66), 0.08, 0.7, 0.5, -3.65, 1.2, -11);
  }

  private buildBedroom(): void {
    const g = this.root;
    // bed (click = lie down)
    const bed = new THREE.Group();
    g.add(bed);
    box(bed, mat(0x8d6e63), 1.7, 0.35, 2.3, -0.7, 0.18, -12.65);
    box(bed, mat(0xffffff), 1.6, 0.18, 2.2, -0.7, 0.44, -12.65);
    box(bed, mat(0xcc5de8), 1.62, 0.06, 1.4, -0.7, 0.55, -12.2); // duvet
    box(bed, mat(0xffffff), 0.8, 0.15, 0.4, -0.7, 0.6, -13.5); // pillow
    box(bed, mat(0x8d6e63), 1.7, 1.1, 0.12, -0.7, 0.55, -13.85); // headboard
    this.solid(-1.55, 0.15, -13.95, -11.5, 0.7);
    this.thing(bed, 0.6, -12.3, 0.6, () => tone(392, 0, 0.3, 'sine', 0.05), {
      requiresClick: true,
      // lies on her back, head on the pillow (towards -z)
      seat: this.seat(-0.7, 0.62, -11.7, Math.PI, 0.7, -11.6, true),
    });
    // bedside lamp: on / off
    const bl = new THREE.Group();
    g.add(bl);
    box(bl, mat(0xffffff), 0.5, 0.5, 0.45, 0.6, 0.25, -13.6);
    const bshade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.25, 12, 1, true), mat(0xffd8a8, 0.9));
    bshade.position.set(0.6, 0.8, -13.6);
    bl.add(bshade);
    cyl(bl, mat(0x868e96), 0.02, 0.2, 0.6, 0.6, -13.6);
    this.solid(0.35, 0.85, -13.85, -13.35, 0.9);
    let blOn = true;
    this.thing(bl, 1.2, -13.0, 0.5, () => {
      blOn = !blOn;
      bshade.material = blOn ? mat(0xffd8a8, 0.9) : mat(0xffd8a8);
      tone(1500, 0, 0.03, 'square', 0.04);
    });
    // wardrobe: doors open to show the clothes
    const wd = new THREE.Group();
    g.add(wd);
    box(wd, mat(0xfff0f6), 0.6, 2.1, 1.6, 1.55, 1.05, -8.5);
    for (let i = 0; i < 4; i++) box(wd, mat([0xff6b6b, 0x4dabf7, 0xfcc419, 0x51cf66][i]), 0.3, 0.8, 0.12, 1.5, 1.3, -9.1 + i * 0.38);
    const doors: THREE.Group[] = [];
    for (const s of [-1, 1]) {
      const d = new THREE.Group();
      d.position.set(1.25, 0, -8.5 + s * 0.8);
      wd.add(d);
      box(d, mat(0xf783ac), 0.05, 2.0, 0.8, 0, 1.05, -s * 0.4);
      ball(d, mat(0xfcc419), 0.04, -0.05, 1.1, -s * 0.72);
      doors.push(d);
    }
    this.solid(1.2, 1.9, -9.35, -7.65, 2.2);
    let wdT = 0;
    this.thing(wd, 0.4, -8.5, 0.7, () => {
      wdT = 4;
      tone(300, 0, 0.2, 'sawtooth', 0.02);
    });
    this.updaters.push((dt) => {
      wdT = Math.max(0, wdT - dt);
      doors.forEach((d, i) => {
        const want = wdT > 0 ? (i === 0 ? 1.6 : -1.6) : 0;
        d.rotation.y += (want - d.rotation.y) * Math.min(1, dt * 6);
      });
    });
    // toy box: the lid opens and a teddy bear pops up
    const tb = new THREE.Group();
    g.add(tb);
    box(tb, mat(0x4dabf7), 0.9, 0.5, 0.6, -2.7, 0.25, -6.7);
    const tlid = new THREE.Group();
    tlid.position.set(-2.7, 0.5, -7.0);
    tb.add(tlid);
    box(tlid, mat(0xfcc419), 0.92, 0.06, 0.62, 0, 0.03, 0.31);
    const teddy = new THREE.Group();
    teddy.position.set(-2.7, 0.2, -6.7);
    tb.add(teddy);
    ball(teddy, mat(0xb08968), 0.16, 0, 0, 0);
    ball(teddy, mat(0xb08968), 0.12, 0, 0.22, 0);
    for (const s of [-1, 1]) ball(teddy, mat(0xb08968), 0.05, s * 0.09, 0.32, 0);
    ball(teddy, mat(0x212529), 0.02, 0, 0.22, 0.11);
    this.solid(-3.2, -2.2, -7.05, -6.35, 0.6);
    let tbT = 0;
    this.thing(tb, -2.7, -7.7, 0.6, () => {
      tbT = 3;
      tone(1200, 0, 0.1, 'sine', 0.06);
      tone(1600, 0.12, 0.15, 'sine', 0.06);
    });
    this.updaters.push((dt) => {
      tbT = Math.max(0, tbT - dt);
      const open = tbT > 0;
      tlid.rotation.x += ((open ? -1.6 : 0) - tlid.rotation.x) * Math.min(1, dt * 8);
      const up = open ? 0.55 + Math.sin(this.time * 10) * 0.04 : 0.2;
      teddy.position.y += (up - teddy.position.y) * Math.min(1, dt * 8);
    });
    // a soft rug and a star night-light on the wall
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), mat(0xffec99));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-1.4, 0.04, -10.2);
    g.add(rug);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat(0xffe066, 0.8));
    star.position.set(-3.38, 1.9, -11.5);
    g.add(star);
  }

  /* ------------------------------------------------------------ per frame */

  /** True while she's inside the house (main: camera looks down from above; no idle pause). */
  isInside(): boolean {
    return this.inside;
  }

  update(dt: number): void {
    if (!this.plot) return;
    this.time += dt;
    const lp = this.root.worldToLocal(this.ctx.player.clone().setY(0));
    const driving = this.ctx.isDriving();
    this.inside = !driving && Math.abs(lp.x) < HW && lp.z < 0.1 && lp.z > BACK;
    if (this.roof) this.roof.visible = !this.inside;
    // the front door swings open when she's near it (inside or outside)
    const near = !driving && Math.abs(lp.x) < 2 && lp.z > -2.5 && lp.z < 2.5;
    const prev = this.doorOpen;
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    if (this.frontDoor) this.frontDoor.rotation.y = this.doorOpen * 1.5;
    if (prev < 0.05 && this.doorOpen >= 0.05) tone(260, 0, 0.15, 'triangle', 0.04);
    const far = Math.hypot(lp.x, lp.z - BACK / 2) > 60;
    if (far) return;
    for (const u of this.updaters) u(dt);
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.vel.y -= 9 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.life <= 0 || d.mesh.position.y < 0.05) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
  }

  debug(): Record<string, unknown> | null {
    if (!this.plot) return null;
    const r = (v: number) => +v.toFixed(1);
    const at = (x: number, z: number) => {
      const p = this.w(x, z);
      return [r(p.x), r(p.z)];
    };
    return {
      door: at(0, 2.5),
      hall: at(0, -3),
      kitchen: at(-5, -3),
      living: at(5, -7),
      bathroom: at(-5.7, -10),
      bedroom: at(-0.7, -9),
      rot: +this.plot.rot.toFixed(2),
      inside: this.inside,
      lights: this.lightsOn,
      things: this.things.length,
    };
  }
}
