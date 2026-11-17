import * as THREE from 'three';
import { audioContext, speak, tone } from './audio';
import {
  roadsideSite,
  siteBox,
  siteGroup,
  siteToWorld,
} from './places';
import {
  ball,
  box,
  buildFolk,
  cyl,
  mat,
  pick,
  HAIRS,
  SKINS,
  type Folk,
} from './venue';
import { mulberry32, PERSON_BODY_HALF, PERSON_CLEAR, type Interactable, type Obstacle, type World } from './world';

/** Só em Londres (cities.ts — name exacto; índice 3). */
export const SINGER_CITY = 'Londres';

const HW = 1.4;
const DEPTH = 2.0;
/** Canta forte quando ela está dentro desta distância. */
const NEAR = 9;
/** Para de agendar notas para lá disto. */
const FAR = 18;
/** Volume relativo à distância (0..1). */
const VOL_NEAR = 0.22;

/**
 * «Todos os patinhos» — domínio público infantil (mesma família do concerto).
 * Uma volta curta, só melodia + leve baixo, para o cantor de rua.
 */
const MELODY =
  'C4 D4 E4 F4 G4:2 G4:2 A4 A4 A4 A4 G4:4 A4 A4 A4 A4 G4:4 F4 F4 F4 F4 E4:2 E4:2 D4 D4 D4 D4 C4:4';
const BPM = 108;
const SONG_TITLE = 'Todos os patinhos';

const NOTE_IDX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function hz(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = NOTE_IDX[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

interface NoteEv {
  t: number;
  f: number;
  d: number;
}

function buildLoop(): { events: NoteEv[]; length: number } {
  const spb = 60 / BPM;
  const notes = MELODY.trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { f: n === 'r' ? 0 : hz(n), beats: d ? Number(d) : 1 };
    });
  const ev: NoteEv[] = [];
  let beat = 0;
  for (const n of notes) {
    if (n.f) ev.push({ t: beat * spb, f: n.f, d: n.beats * spb * 0.9 });
    beat += n.beats;
  }
  return { events: ev, length: beat * spb + 0.4 };
}

/**
 * Cantor de rua low-poly só em Londres: chapéu + guitarra + chapéu de moedas no chão.
 * Canta (Web Audio) enquanto ela está perto; tocar no chapéu = 1 moeda (uma vez) + obrigado.
 */
export class StreetSinger {
  readonly things: Interactable[] = [];
  private readonly root: THREE.Group | null = null;
  private folk: Folk | null = null;
  private mouth: THREE.Mesh | null = null;
  private tipHat: THREE.Object3D | null = null;
  private readonly at = new THREE.Vector3();
  private readonly tipAt = new THREE.Vector3();
  private alive = false;
  private tipped = false;
  private nodT = 0; // >0 head shake / thank nod
  private noddingYes = false;
  private time = 0;
  private singing = false;
  private vol = 0;
  private targetVol = 0;

  private bus: GainNode | null = null;
  private loopOrigin = 0;
  private noteIndex = 0;
  private readonly loop = buildLoop();
  private wasSinging = false;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    world: World,
    seed: number,
    cityName: string,
    private readonly coins: () => number,
    private readonly giveCoin: () => void,
  ) {
    if (cityName !== SINGER_CITY) return;
    const rng = mulberry32(seed * 211 + 41);
    const site =
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 38, maxD: 120, apron: 4.5, front: 13 }) ??
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 28, maxD: 130, apron: 3.5, front: 12 });
    if (!site) return;

    const area = siteBox(site, -HW, HW, -DEPTH, 0.4);
    world.clearArea(area, 1.6);
    obstacles.push({ ...area, height: 0.15 });

    this.root = siteGroup(scene, site);
    const folk = buildFolk({
      shirt: 0x1c7ed6,
      pants: 0x343a40,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      cap: 0x5c3d2e, // chapéu castanho (buildFolk)
    });
    folk.group.position.set(0, 0, -0.85);
    folk.group.rotation.y = Math.PI; // faces the road / apron
    this.root.add(folk.group);
    this.folk = folk;
    this.mouth = dressSinger(folk);

    // chapéu no chão para moedas (à frente, no passeio)
    const tip = buildTipHat();
    tip.position.set(0.55, 0.02, -0.15);
    this.root.add(tip);
    this.tipHat = tip;

    const bodyAt = siteToWorld(site, 0, -0.85);
    const h = PERSON_BODY_HALF;
    obstacles.push({
      minX: bodyAt.x - h,
      maxX: bodyAt.x + h,
      minZ: bodyAt.z - h,
      maxZ: bodyAt.z + h,
      height: 1.9,
    });

    this.at.copy(siteToWorld(site, 0, -0.85));
    this.tipAt.copy(siteToWorld(site, 0.55, -0.15));
    this.alive = true;

    // tip hat: touch to give a coin
    this.things.push({
      object: tip,
      position: this.tipAt.clone(),
      radius: 1.5,
      keepClear: PERSON_CLEAR * 0.85,
      interact: () => this.tip(),
    });
    // person body: approach stop short (music is proximity; tip is the hat)
    this.things.push({
      object: folk.group,
      position: this.at.clone(),
      radius: 2.2,
      keepClear: PERSON_CLEAR,
      interact: () => this.tip(),
    });
  }

  /** Proximity singing + body motion. Call each frame from main. */
  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive || !this.folk) return;
    this.time += dt;
    if (paused) {
      this.targetVol = 0;
      this.smoothVol(dt);
      this.applyAnim(false);
      return;
    }

    const d = Math.hypot(player.x - this.at.x, player.z - this.at.z);
    if (d <= NEAR) this.targetVol = 1;
    else if (d >= FAR) this.targetVol = 0;
    else this.targetVol = 1 - (d - NEAR) / (FAR - NEAR);

    this.smoothVol(dt);
    if (this.nodT > 0) this.nodT = Math.max(0, this.nodT - dt);
    const singing = this.vol > 0.04;
    this.singing = singing;
    this.applyAnim(singing);
    if (singing) this.scheduleAudio();
    else this.wasSinging = false;
  }

  private smoothVol(dt: number): void {
    const k = Math.min(1, dt * 3.5);
    this.vol += (this.targetVol - this.vol) * k;
    if (this.bus) {
      const g = Math.max(0.0001, this.vol * VOL_NEAR);
      this.bus.gain.setTargetAtTime(g, audioContext()?.currentTime ?? 0, 0.08);
    }
  }

  private ensureBus(): GainNode | null {
    const ac = audioContext();
    if (!ac) return null;
    if (!this.bus) {
      this.bus = ac.createGain();
      this.bus.gain.value = 0.0001;
      this.bus.connect(ac.destination);
    }
    return this.bus;
  }

  private scheduleAudio(): void {
    const ac = audioContext();
    const bus = this.ensureBus();
    if (!ac || !bus) return;
    const now = ac.currentTime;
    if (!this.wasSinging) {
      this.loopOrigin = now;
      this.noteIndex = 0;
      this.wasSinging = true;
    }
    const horizon = now + 1.25;
    let guard = 0;
    while (guard++ < 80) {
      const n = this.loop.events.length;
      const loops = Math.floor(this.noteIndex / n);
      const e = this.loop.events[this.noteIndex % n];
      const at = this.loopOrigin + loops * this.loop.length + e.t;
      if (at > horizon) break;
      if (at >= now - 0.03) this.playNote(ac, bus, e.f, Math.max(at, now), e.d);
      this.noteIndex++;
    }
  }

  private playNote(ac: AudioContext, bus: GainNode, f: number, t: number, d: number): void {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + d + 0.04);
    // soft octave sparkle
    const o2 = ac.createOscillator();
    const g2 = ac.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f * 2, t);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.7);
    o2.connect(g2).connect(bus);
    o2.start(t);
    o2.stop(t + d * 0.7 + 0.03);
  }

  private applyAnim(singing: boolean): void {
    if (!this.folk) return;
    const t = this.time;
    const f = this.folk;

    // guitar strum arm (left) + fretting (right held on neck)
    if (singing) {
      f.body.position.y = Math.abs(Math.sin(t * 4.2)) * 0.04;
      f.armL.rotation.set(-0.35 + Math.sin(t * 7) * 0.35, 0, 0.55);
      f.armR.rotation.set(-0.55, 0.15, -0.35);
      f.head.rotation.x = Math.sin(t * 2.2) * 0.06;
      f.head.rotation.y = Math.sin(t * 1.4) * 0.1;
      if (this.mouth) {
        const open = 0.55 + Math.sin(t * 9.5) * 0.45;
        this.mouth.scale.set(1, open, 1);
        this.mouth.position.y = -0.1 - (1 - open) * 0.02;
      }
    } else {
      f.body.position.y = Math.sin(t * 1.6) * 0.012;
      f.armL.rotation.set(-0.2, 0, 0.45);
      f.armR.rotation.set(-0.45, 0.1, -0.25);
      f.head.rotation.x = 0;
      f.head.rotation.y = Math.sin(t * 0.7) * 0.08;
      if (this.mouth) {
        this.mouth.scale.set(1, 0.35, 1);
        this.mouth.position.y = -0.1;
      }
    }

    // thank / refuse nod (overrides head a bit)
    if (this.nodT > 0) {
      const ph = (1.4 - this.nodT) * 10;
      if (this.noddingYes) {
        f.head.rotation.x = Math.sin(ph) * 0.25;
      } else {
        f.head.rotation.y = Math.sin(ph) * 0.45;
      }
    }
  }

  private tip(): void {
    if (!this.alive) return;
    if (this.tipped) {
      this.noddingYes = true;
      this.nodT = 1.2;
      void speak(['Obrigado outra vez!', 'Já tenho o suficiente.']);
      return;
    }
    if (this.coins() <= 0) {
      this.noddingYes = false;
      this.nodT = 1.4;
      tone(220, 0, 0.12, 'sine', 0.05);
      // keeps singing — no speech spam; head shake is the feedback
      return;
    }
    this.tipped = true;
    this.giveCoin();
    this.noddingYes = true;
    this.nodT = 1.6;
    tone(988, 0, 0.08, 'square', 0.06);
    tone(1319, 0.08, 0.14, 'triangle', 0.07);
    // coin flash in tip hat
    if (this.tipHat) {
      const coin = box(this.tipHat, mat(0xffd23f), 0.12, 0.04, 0.12, 0, 0.08, 0);
      coin.material = new THREE.MeshStandardMaterial({
        color: 0xffd23f,
        emissive: 0xffa800,
        emissiveIntensity: 0.55,
      });
    }
    void speak(['Obrigado!', 'Que linda moeda!']);
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.targetVol = 0;
    this.vol = 0;
    if (this.bus) {
      try {
        this.bus.disconnect();
      } catch {
        /* already gone */
      }
      this.bus = null;
    }
    this.root?.parent?.remove(this.root);
    this.folk = null;
    this.mouth = null;
    this.tipHat = null;
    this.things.length = 0;
  }

  debug(): Record<string, unknown> {
    return {
      on: this.alive,
      city: SINGER_CITY,
      song: SONG_TITLE,
      at: this.alive ? [+this.at.x.toFixed(1), +this.at.z.toFixed(1)] : null,
      tip: this.alive ? [+this.tipAt.x.toFixed(1), +this.tipAt.z.toFixed(1)] : null,
      singing: this.singing,
      vol: +this.vol.toFixed(2),
      tipped: this.tipped,
    };
  }
}

/** Bigger brim hat on the head + acoustic guitar on the body. Returns mouth mesh for lip sync. */
function dressSinger(folk: Folk): THREE.Mesh {
  // taller top-hat silhouette so kids read “singer” from afar (brim already from cap)
  box(folk.head, mat(0x5c3d2e), 0.22, 0.28, 0.22, 0, 0.42, 0);
  box(folk.head, mat(0xc92a2a), 0.24, 0.04, 0.24, 0, 0.28, 0); // ribbon

  // acoustic guitar on the torso (flat face toward the road so kids read “guitarra”)
  const gtr = new THREE.Group();
  gtr.position.set(0.05, 1.12, -0.42);
  gtr.rotation.set(0.05, 0.2, 0.65);
  // figure-8 body (lower bout + upper bout)
  const lower = cyl(gtr, mat(0xd9480f), 0.28, 0.1, 0, -0.08, 0);
  lower.rotation.x = Math.PI / 2;
  const upper = cyl(gtr, mat(0xe8590c), 0.2, 0.09, 0, 0.22, 0);
  upper.rotation.x = Math.PI / 2;
  box(gtr, mat(0x5c3d2e), 0.08, 0.78, 0.05, 0, 0.62, 0); // neck
  box(gtr, mat(0xffe066), 0.16, 0.05, 0.07, 0, 1.0, 0); // headstock
  ball(gtr, mat(0x212529), 0.08, 0, -0.05, -0.06); // sound hole
  // thin bridge
  box(gtr, mat(0x5c3d2e), 0.14, 0.03, 0.04, 0, -0.22, -0.05);
  folk.body.add(gtr);
  // left arm strums across the body; right rests on the neck
  folk.armL.rotation.set(-0.25, 0, 0.55);
  folk.armR.rotation.set(-0.5, 0.1, -0.3);

  // openable mouth (replace smile scale)
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3b1f1a, roughness: 0.7 }),
  );
  mouth.scale.set(1, 0.35, 0.7);
  mouth.position.set(0, -0.1, -0.28);
  folk.head.add(mouth);
  return mouth;
}

function buildTipHat(): THREE.Group {
  const g = new THREE.Group();
  // upside-down bowler / tip jar
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), mat(0x5c3d2e));
  brim.position.y = 0.02;
  g.add(brim);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5c3d2e));
  bowl.rotation.x = Math.PI;
  bowl.position.y = 0.12;
  g.add(bowl);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), mat(0xc92a2a));
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = 0.1;
  g.add(ribbon);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function noStreetSinger(): StreetSinger {
  return {
    things: [],
    update() {},
    dispose() {},
    debug: () => ({ on: false, city: SINGER_CITY, song: SONG_TITLE, at: null, tip: null, singing: false, vol: 0, tipped: false }),
  } as unknown as StreetSinger;
}

/** One street singer only in London; elsewhere a no-op stub. */
export function createStreetSinger(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  seed: number,
  cityName: string,
  coins: () => number,
  giveCoin: () => void,
): StreetSinger {
  if (cityName !== SINGER_CITY) return noStreetSinger();
  return new StreetSinger(scene, obstacles, world, seed, cityName, coins, giveCoin);
}
