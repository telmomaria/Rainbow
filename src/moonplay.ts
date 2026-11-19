import * as THREE from 'three';
import { audioContext, speak, tone } from './audio';
import { feel } from './bus';
import { MOON_EXTRA_JEWELS } from './cities';
import { Fireworks, FIREWORK_COLORS } from './fireworks';
import type { GameCtx } from './gamectx';
import { gemMesh, mat } from './places';
import { ALTAR, LANDER, moonHeight } from './moon';
import type { Interactable, Obstacle } from './world';

/**
 * What happens on the Moon (Telmo, 2026-11-19):
 *  - TimeMachine — the end of the game. Buried in the sand where the goal is (ALTAR); only its antenna light pokes
 *    out. When she comes near, the wind blows the sand away and the machine rises. It needs her jewels (what she
 *    brought + MOON_EXTRA_JEWELS) to work; then it takes her away… to "Rainbow 2".
 *  - LanderFood — touching her spaceship gives a space-food capsule = full energy (the only food on the Moon).
 *  - Comets — one every 5 minutes, aimed near her with a glowing warning ring; if it hits she lies dizzy for 1 minute.
 */

const REVEAL_DIST = 14;
const REVEAL_S = 5;
/** How deep the machine sits while buried (its antenna bulb still shows above the sand). */
const BURIED_Y = -3.6;

/** Wind: filtered noise that swells and fades (no audio file). */
function windSound(seconds: number): void {
  const ac = audioContext();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  const t = ac.currentTime;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.linearRampToValueAtTime(900, t + seconds * 0.5);
  filter.frequency.linearRampToValueAtTime(350, t + seconds);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.22, t + seconds * 0.35);
  gain.gain.linearRampToValueAtTime(0.0001, t + seconds);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

/** Sand grains blown away by the wind. */
class SandBlow {
  readonly points: THREE.Points;
  private readonly vel: Float32Array;
  private life = 0;

  constructor(scene: THREE.Scene, at: THREE.Vector3, n = 520) {
    const pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 3.8;
      pos[i * 3] = at.x + Math.cos(a) * r;
      pos[i * 3 + 1] = at.y + Math.random() * 1.4;
      pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      // the wind blows towards +X (away from the lander side she arrives from) and lifts the sand
      this.vel[i * 3] = 4 + Math.random() * 7;
      this.vel[i * 3 + 1] = 0.6 + Math.random() * 2.4;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xcfc7b4, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    scene.add(this.points);
  }

  /** False once it has faded out (then it removes itself). */
  update(dt: number, spawning: boolean): boolean {
    this.life += dt;
    const p = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += this.vel[i] * dt;
      arr[i + 1] += this.vel[i + 1] * dt;
      arr[i + 2] += this.vel[i + 2] * dt;
      this.vel[i + 1] -= 0.9 * dt; // low Moon gravity: they drift down slowly
    }
    p.needsUpdate = true;
    const m = this.points.material as THREE.PointsMaterial;
    if (!spawning) m.opacity = Math.max(0, m.opacity - dt * 0.45);
    if (m.opacity <= 0) {
      this.points.removeFromParent();
      this.points.geometry.dispose();
      return false;
    }
    return true;
  }
}

/** The time machine (original design: brass pod, glass dome, big clock face, rainbow gyro rings). */
export class TimeMachine {
  readonly things: Interactable[] = [];
  private readonly fireworks: Fireworks;
  private readonly root = new THREE.Group();
  private readonly machine = new THREE.Group();
  private readonly mound: THREE.Mesh;
  private readonly rings: THREE.Mesh[] = [];
  private readonly lights: THREE.Mesh[] = [];
  private readonly hands: THREE.Object3D[] = [];
  private readonly bulb: THREE.Mesh;
  private readonly flying: { mesh: THREE.Mesh; from: THREE.Vector3; t: number; delay: number }[] = [];
  private sand: SandBlow | null = null;
  private state: 'buried' | 'revealing' | 'ready' | 'leaving' | 'done' = 'buried';
  private t = 0;
  private time = 0;
  private sputter = 0;
  private touchedEarly = false;
  private readonly groundY: number;

  constructor(
    private readonly scene: THREE.Scene,
    obstacles: Obstacle[],
    private readonly ctx: GameCtx,
    private readonly offer: () => number,
    private readonly hooks: { setPlayerVisible: (v: boolean) => void; onFinish: (n: number) => void },
  ) {
    this.fireworks = new Fireworks(scene);
    this.groundY = moonHeight(ALTAR.x, ALTAR.z);
    this.root.position.set(ALTAR.x, this.groundY, ALTAR.z);
    scene.add(this.root);
    this.root.add(this.machine);

    const brass = new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.15, roughness: 0.35, emissive: 0x8a5a00, emissiveIntensity: 0.25 });
    const purple = mat(0x6741d9, 0.4);
    // base platform with a gold rim
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.45, 28), purple);
    base.position.y = 0.22;
    base.castShadow = true;
    this.machine.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.08, 8, 40), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.46;
    this.machine.add(rim);
    // pod
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 2.1, 24), brass);
    pod.position.y = 1.5;
    pod.castShadow = true;
    this.machine.add(pod);
    // glass dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x99e9f2, transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, emissive: 0x3bc9db, emissiveIntensity: 0.25 }),
    );
    dome.position.y = 2.55;
    this.machine.add(dome);
    // big clock face, turned towards the lander side (−X), so she sees it when she arrives
    const clock = new THREE.Group();
    clock.position.set(-1.33, 1.55, 0);
    clock.rotation.y = -Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32), new THREE.MeshStandardMaterial({ color: 0xfff9db, emissive: 0xffec99, emissiveIntensity: 0.35 }));
    clock.add(face);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.07, 8, 32), brass);
    clock.add(bezel);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, i % 3 === 0 ? 0.16 : 0.09, 0.02), mat(0x343a40));
      tick.position.set(Math.sin(a) * 0.6, Math.cos(a) * 0.6, 0.02);
      tick.rotation.z = -a;
      clock.add(tick);
    }
    for (const [len, w] of [
      [0.5, 0.06],
      [0.36, 0.08],
    ] as const) {
      const pivot = new THREE.Group();
      pivot.position.z = 0.04;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.02), mat(0xc92a2a));
      hand.position.y = len / 2;
      pivot.add(hand);
      clock.add(pivot);
      this.hands.push(pivot);
    }
    this.machine.add(clock);
    // rainbow gyro rings around the pod
    [0xff6b6b, 0xffd43b, 0x4dabf7].forEach((c, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.85 + i * 0.12, 0.07, 8, 48),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, metalness: 0.3, roughness: 0.4 }),
      );
      ring.position.y = 1.6;
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.5, 0, i * 0.7);
      this.machine.add(ring);
      this.rings.push(ring);
    });
    // little lights around the base
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = FIREWORK_COLORS[i % FIREWORK_COLORS.length];
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.2 }));
      l.position.set(Math.cos(a) * 1.75, 0.55, Math.sin(a) * 1.75);
      this.machine.add(l);
      this.lights.push(l);
    }
    // antenna + bulb: the only thing showing while it is buried
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), brass);
    mast.position.y = 3.6;
    this.machine.add(mast);
    this.bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xff8fab, emissive: 0xf06595, emissiveIntensity: 1.2 }),
    );
    this.bulb.position.y = 4.5;
    this.machine.add(this.bulb);

    // sand mound covering it
    this.mound = new THREE.Mesh(
      new THREE.SphereGeometry(3.6, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 1, flatShading: true }),
    );
    this.mound.scale.y = 0.32;
    this.mound.receiveShadow = true;
    this.root.add(this.mound);

    obstacles.push({ minX: ALTAR.x - 2.2, maxX: ALTAR.x + 2.2, minZ: ALTAR.z - 2.2, maxZ: ALTAR.z + 2.2, height: 0.5 });
    this.things.push({
      object: this.root,
      position: new THREE.Vector3(ALTAR.x, 0, ALTAR.z),
      // the 2.2 m box stops her ~2.7 m out (~3.6 m at its corners)
      radius: 4.2,
      interact: () => this.touch(),
    });

    // the goal is fixed once, on her first arrival: what she brought + MOON_EXTRA_JEWELS (persists across reloads)
    if (ctx.flag('moon:need') <= 0) ctx.setFlag('moon:need', offer() + MOON_EXTRA_JEWELS);
    if (ctx.flag('moon:done') > 0) this.state = 'done';
    else if (ctx.flag('moon:revealed') > 0) this.state = 'ready';
    this.pose();
  }

  /** Static pose for the current state (buried / up). */
  private pose(): void {
    const up = this.state !== 'buried';
    this.machine.position.y = up ? 0 : BURIED_Y;
    this.mound.visible = !up;
    this.mound.scale.set(1, 0.32, 1);
  }

  private touch(): void {
    if (this.state === 'buried' || this.state === 'revealing') {
      this.touchedEarly = true;
      return;
    }
    if (this.state !== 'ready') return;
    const total = this.offer();
    const missing = this.ctx.flag('moon:need') - total;
    if (missing > 0) {
      this.sputter = 1.2;
      tone(140, 0, 0.25, 'square', 0.05);
      tone(110, 0.25, 0.35, 'square', 0.05);
      void speak([
        missing === 1
          ? 'A máquina do tempo precisa de mais uma joia para funcionar!'
          : `A máquina do tempo precisa de mais ${missing} joias para funcionar!`,
        'Procura nas crateras.',
      ]);
      return;
    }
    this.leave(total);
  }

  /** The jewels fly in, the machine lights up, she steps in and it vanishes in a flash. */
  private leave(total: number): void {
    this.state = 'leaving';
    this.t = 0;
    this.ctx.hold(true);
    this.ctx.setFlag('moon:done', 1);
    const from = this.ctx.player.clone().setY(this.ctx.player.y + 1.2);
    for (let i = 0; i < Math.min(total, 12); i++) {
      const gem = gemMesh(FIREWORK_COLORS[i % FIREWORK_COLORS.length], 0.7);
      gem.position.copy(from);
      this.scene.add(gem);
      this.flying.push({ mesh: gem, from: from.clone(), t: 0, delay: i * 0.12 });
    }
    this.ctx.say(['As joias dão energia à máquina do tempo!']);
    this.leaveTotal = total;
  }
  private leaveTotal = 0;

  update(dt: number): void {
    this.time += dt;
    this.fireworks.update(dt);
    const p = this.ctx.player;
    const d = Math.hypot(p.x - ALTAR.x, p.z - ALTAR.z);

    // blinking antenna bulb (the clue in the sand)
    (this.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + Math.max(0, Math.sin(this.time * 4)) * 1.4;

    if (this.state === 'buried' && d < REVEAL_DIST && !this.ctx.isPaused()) {
      this.state = 'revealing';
      this.t = 0;
      windSound(REVEAL_S + 1);
      this.sand = new SandBlow(this.scene, new THREE.Vector3(ALTAR.x, this.groundY, ALTAR.z));
      this.ctx.say(['Que vento! A areia está a voar…']);
    }
    if (this.state === 'revealing') {
      this.t += dt;
      const k = Math.min(1, this.t / REVEAL_S);
      const e = k * k * (3 - 2 * k);
      this.mound.scale.set(1 - e * 0.6, 0.32 * (1 - e), 1 - e * 0.6);
      this.machine.position.y = BURIED_Y * (1 - e);
      this.machine.rotation.y = Math.sin(this.t * 6) * 0.02 * (1 - k);
      if (k >= 1) {
        this.state = 'ready';
        this.mound.visible = false;
        this.ctx.setFlag('moon:revealed', 1);
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.07));
        this.ctx.say(['Uma máquina do tempo! Traz-lhe as joias.']);
        if (this.touchedEarly && d < 4.6) this.touch();
      }
    }
    if (this.sand && !this.sand.update(dt, this.state === 'revealing')) this.sand = null;
    if (d > 5) this.touchedEarly = false;

    // clock hands run backwards (it is a time machine); faster when it works
    const fast = this.state === 'leaving' ? 14 : this.state === 'done' ? 3 : 1;
    this.hands[0].rotation.z += dt * 1.2 * fast;
    this.hands[1].rotation.z += dt * 0.1 * fast;
    const spin = this.state === 'leaving' ? 1 + this.t * 3 : this.state === 'buried' ? 0 : 0.6;
    this.rings.forEach((r, i) => {
      r.rotation.z += dt * spin * (i % 2 ? -1 : 1);
      r.rotation.x += dt * spin * 0.4;
    });
    this.lights.forEach((l, i) => {
      const on = this.state === 'leaving' || Math.floor(this.time * 3 + i) % 8 === i % 8 || this.state === 'done';
      const flicker = this.sputter > 0 ? (Math.random() < 0.5 ? 0 : 1) : 1;
      (l.material as THREE.MeshStandardMaterial).emissiveIntensity = (on ? 1.4 : 0.2) * flicker;
    });
    if (this.sputter > 0) this.sputter -= dt;

    if (this.state === 'leaving') this.updateLeaving(dt);
  }

  private updateLeaving(dt: number): void {
    this.t += dt;
    const target = new THREE.Vector3(ALTAR.x, this.groundY + 2.2, ALTAR.z);
    for (const f of this.flying) {
      f.t += dt;
      const k = Math.min(1, Math.max(0, (f.t - f.delay) / 0.9));
      f.mesh.position.lerpVectors(f.from, target, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 1.5;
      f.mesh.rotation.y += dt * 6;
      if (k >= 1 && f.mesh.parent) {
        f.mesh.removeFromParent();
        tone(1047 + Math.random() * 600, 0, 0.12, 'triangle', 0.05);
      }
    }
    // 2.5 s: she walks into the machine (fades out next to it)
    if (this.t > 2.5 && this.t - dt <= 2.5) {
      this.hooks.setPlayerVisible(false);
      this.ctx.say(['Vamos viajar no tempo!']);
      [262, 330, 392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.15, 0.4, 'sine', 0.06));
    }
    // 3–6 s: it hums, lifts a little and spins, fireworks
    if (this.t > 3) {
      const k = Math.min(1, (this.t - 3) / 3);
      this.machine.position.y = k * 1.2 + Math.sin(this.t * 30) * 0.03 * k;
      this.machine.rotation.y += dt * (2 + k * 14);
      if (Math.random() < dt * 4) {
        const at = new THREE.Vector3(ALTAR.x + (Math.random() - 0.5) * 10, this.groundY + 6 + Math.random() * 6, ALTAR.z + (Math.random() - 0.5) * 10);
        this.fireworks.burst(at, FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)], 1);
      }
    }
    // 6 s: flash — it is gone
    if (this.t > 6 && this.machine.visible) {
      this.machine.visible = false;
      this.fireworks.burst(new THREE.Vector3(ALTAR.x, this.groundY + 2, ALTAR.z), 0xffffff, 2.2);
      tone(1568, 0, 0.6, 'triangle', 0.08);
    }
    if (this.t > 7.5) {
      this.state = 'done';
      this.machine.visible = true;
      this.machine.position.y = 0;
      this.machine.rotation.y = 0;
      this.ctx.hold(false);
      this.hooks.setPlayerVisible(true);
      this.hooks.onFinish(this.leaveTotal);
    }
  }

  debug(): Record<string, unknown> {
    return { state: this.state, need: this.ctx.flag('moon:need'), have: this.offer() };
  }

  dispose(): void {
    this.fireworks.clear();
    this.sand?.points.removeFromParent();
    for (const f of this.flying) f.mesh.removeFromParent();
  }
}

/** Touch the spaceship = a space-food capsule pops out of a hatch and fills her energy. */
export class LanderFood {
  readonly things: Interactable[] = [];
  private readonly hatch: THREE.Mesh;
  private capsule: { mesh: THREE.Mesh; t: number } | null = null;
  private born = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ctx: GameCtx,
    private readonly energyFull: () => boolean,
  ) {
    const y0 = moonHeight(LANDER.x, LANDER.z);
    // little orange hatch on the front of the lander, above the ladder
    this.hatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.4, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xff922b, emissive: 0xe8590c, emissiveIntensity: 0.3 }),
    );
    this.hatch.position.set(LANDER.x, y0 + 2.75, LANDER.z - 1.42);
    scene.add(this.hatch);
    this.things.push({
      object: this.hatch,
      position: new THREE.Vector3(LANDER.x, 0, LANDER.z),
      // the lander box is ±3.2 m: she touches it from ~3.7 m (≈5 m at its corners)
      radius: 5.2,
      interact: () => this.serve(),
    });
  }

  private serve(): void {
    if (this.born < 3 || this.capsule) return; // not on arrival / Casa teleport, one at a time
    if (this.energyFull()) {
      tone(660, 0, 0.1, 'triangle', 0.04);
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.3, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xffa94d, emissiveIntensity: 0.5 }),
    );
    mesh.position.copy(this.hatch.position);
    this.scene.add(mesh);
    this.capsule = { mesh, t: 0 };
    tone(880, 0, 0.08, 'square', 0.05);
    tone(1175, 0.08, 0.12, 'square', 0.05);
  }

  update(dt: number): void {
    this.born += dt;
    const m = this.hatch.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 0.3 + (this.energyFull() ? 0 : Math.max(0, Math.sin(this.born * 3)) * 0.8);
    if (!this.capsule) return;
    const c = this.capsule;
    c.t += dt;
    const k = Math.min(1, c.t / 0.9);
    const to = this.ctx.player.clone().setY(this.ctx.player.y + 1.5);
    c.mesh.position.lerpVectors(this.hatch.position, to, k);
    c.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
    c.mesh.rotation.z += dt * 8;
    if (k >= 1) {
      // eaten
      c.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (c.t > 1.25) {
        c.mesh.removeFromParent();
        this.capsule = null;
        [523, 587, 523, 784].forEach((f, i) => tone(f, i * 0.1, 0.12, 'triangle', 0.05));
        feel('capsule');
        this.ctx.say(['Cápsula de comida espacial! Energia cheia!']);
      }
    }
  }

  dispose(): void {
    this.hatch.removeFromParent();
    this.capsule?.mesh.removeFromParent();
  }
}

export const COMET_EVERY_S = 5 * 60;
const COMET_FALL_S = 4;
const COMET_HIT_R = 2.5;

/** A comet every 5 minutes of play, aimed close to her: a glowing ring on the ground shows where it will land. */
export class Comets {
  private timer = COMET_EVERY_S;
  private comet: { head: THREE.Group; ring: THREE.Mesh; target: THREE.Vector3; from: THREE.Vector3; t: number } | null = null;
  private readonly scars: { mesh: THREE.Mesh; life: number }[] = [];
  private readonly dust: SandBlow[] = [];
  private readonly fireworks: Fireworks;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly ctx: GameCtx,
    private readonly onHit: () => void,
  ) {
    this.fireworks = new Fireworks(scene);
  }

  /** QA (`?debug`): drop one now. */
  dropNow(): void {
    this.timer = 0;
  }

  update(dt: number, active: boolean): void {
    this.fireworks.update(dt);
    for (let i = this.dust.length - 1; i >= 0; i--) if (!this.dust[i].update(dt, false)) this.dust.splice(i, 1);
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const s = this.scars[i];
      s.life -= dt;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.55, s.life / 10);
      if (s.life <= 0) {
        s.mesh.removeFromParent();
        this.scars.splice(i, 1);
      }
    }
    if (this.comet) {
      this.fall(dt);
      return;
    }
    if (!active) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = COMET_EVERY_S;
      this.launch();
    }
  }

  private launch(): void {
    const p = this.ctx.player;
    const a = Math.random() * Math.PI * 2;
    const off = Math.random() * 2;
    const tx = p.x + Math.cos(a) * off;
    const tz = p.z + Math.sin(a) * off;
    const target = new THREE.Vector3(tx, moonHeight(tx, tz), tz);
    const from = target.clone().add(new THREE.Vector3(28, 46, -18));

    const head = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: 0xfff4e6 }));
    head.add(core);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff922b, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    head.add(glow);
    // tail: a long cone pointing back along the path
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 12, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc078, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    tail.position.y = -6; // cone tip at the head, opening backwards (group is oriented below)
    tail.rotation.x = Math.PI;
    const tailPivot = new THREE.Group();
    tailPivot.add(tail);
    head.add(tailPivot);
    // orient: tail pivot's −Y towards the sky (back along the path)
    const back = from.clone().sub(target).normalize();
    tailPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), back.clone().negate());
    head.position.copy(from);
    this.scene.add(head);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(COMET_HIT_R - 0.35, COMET_HIT_R, 40),
      new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(tx, target.y + 0.08, tz);
    this.scene.add(ring);
    this.comet = { head, ring, target, from, t: 0 };
    void speak(['Cuidado! Vem aí um cometa! Foge do círculo vermelho!']);
  }

  private fall(dt: number): void {
    const c = this.comet!;
    c.t += dt;
    const k = Math.min(1, c.t / COMET_FALL_S);
    c.head.position.lerpVectors(c.from, c.target, k * k);
    const rm = c.ring.material as THREE.MeshBasicMaterial;
    rm.opacity = 0.35 + Math.abs(Math.sin(c.t * 8)) * 0.5;
    c.ring.scale.setScalar(0.6 + k * 0.4);
    // rising whistle
    if (Math.floor((c.t - dt) * 6) !== Math.floor(c.t * 6)) tone(500 + k * 900, 0, 0.12, 'sine', 0.03);
    if (k < 1) return;

    // impact
    c.head.removeFromParent();
    c.ring.removeFromParent();
    this.comet = null;
    tone(90, 0, 0.6, 'sawtooth', 0.12);
    tone(60, 0.05, 0.8, 'sine', 0.15);
    this.fireworks.burst(c.target.clone().setY(c.target.y + 1), 0xffa94d, 1.4, true);
    this.dust.push(new SandBlow(this.scene, c.target, 260));
    const scar = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 24),
      new THREE.MeshBasicMaterial({ color: 0x343a40, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(c.target.x, c.target.y + 0.06, c.target.z);
    this.scene.add(scar);
    this.scars.push({ mesh: scar, life: 30 });
    const p = this.ctx.player;
    if (Math.hypot(p.x - c.target.x, p.z - c.target.z) < COMET_HIT_R && !this.ctx.isPaused()) this.onHit();
  }

  dispose(): void {
    this.fireworks.clear();
    if (this.comet) {
      this.comet.head.removeFromParent();
      this.comet.ring.removeFromParent();
    }
    for (const s of this.scars) s.mesh.removeFromParent();
    for (const d of this.dust) d.points.removeFromParent();
  }
}

/** Little gold stars circling over her head while she lies dizzy. */
export class DizzyStars {
  private readonly group = new THREE.Group();
  private time = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        new THREE.MeshStandardMaterial({ color: 0xffd43b, emissive: 0xfab005, emissiveIntensity: 0.9 }),
      );
      this.group.add(s);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number, on: boolean, at: THREE.Vector3): void {
    this.group.visible = on;
    if (!on) return;
    this.time += dt;
    this.group.position.set(at.x, at.y + 0.9, at.z);
    this.group.children.forEach((s, i) => {
      const a = this.time * 2.5 + (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.55, Math.sin(this.time * 3 + i) * 0.08, Math.sin(a) * 0.55);
      s.rotation.y = this.time * 4;
    });
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
