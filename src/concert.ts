import * as THREE from 'three';
import { audioContext, speak } from './audio';
import type { GameCtx } from './gamectx';
import { type Interactable, type Obstacle } from './world';
import { GATE_HW, PANTS, SHIRTS, SKINS, HAIRS, TicketGate, ball, box, buildFence, buildFolk, cyl, findPlot, mat, pick, toWorld, worldBox, type Folk, type Plot } from './venue';

/**
 * A children's concert in every city: a fenced, colourful open-air venue beside a street (ticket booth,
 * gate and doorman from venue.ts). Shows follow the device's wall clock: one starts at :00, :20 and :40 of every
 * hour (local time). A singer (woman or man) or a whole band plays SHOW_SONGS traditional (public-domain)
 * children's tunes, synthesised on the fly, while ~50 people dance and clap; then a big final applause, the
 * performers wave goodbye, and the audience walks out through the gate. The venue stays empty and dark until,
 * ~3 min before the next show, the audience walks back in. The booth only sells from "doors open" (~4 min before)
 * until the finale. Everything is a function of the clock, so a reload mid-show lands on the right song and beat.
 * Inside the music is clear, outside muffled.
 */

export const TICKET_PRICE = 5;
const AUDIENCE = 50;
const SHOW_SONGS = 5;

/* ---- the 20-minute cycle (seconds; c = 0 is the show start) ---- */
const CYCLE = 20 * 60;
const DOORS_OPEN = CYCLE - 4 * 60; // the booth starts selling
const ARRIVE = CYCLE - 3 * 60; // the audience starts walking in
const STAGGER = 0.7; // seconds between people leaving / arriving
const FADE = 1.2; // metres over which a person shrinks away (or grows in) at the end of the path
const OUT_Z = 4; // how far into the forecourt people walk before disappearing

/* ---- venue layout, local frame: x across, +Z points at the road, the front fence is z = 0 ---- */
const HW = 12.5; // half width
const BACK = -25; // back fence
const STAGE = { x0: -7.5, x1: 7.5, z0: -24.6, z1: -18.5, h: 1.2 };
const CROWD = { x0: 1.5, x1: 10.6, z0: -16.6, z1: -7.4 }; // one block; mirrored on the other side of the aisle

/* ------------------------------------------------------------------ songs */

/** Traditional children's tunes (public domain). Melody: "C4 D4:2 r ..." (beats, default 1). Chords: one root per half bar. */
interface SongSpec {
  title: string;
  bpm: number;
  melody: string;
  chords: string;
}
const SONGS: SongSpec[] = [
  {
    title: 'Todos os patinhos',
    bpm: 112,
    melody: 'C4 D4 E4 F4 G4:2 G4:2 A4 A4 A4 A4 G4:4 A4 A4 A4 A4 G4:4 F4 F4 F4 F4 E4:2 E4:2 D4 D4 D4 D4 C4:4',
    chords: 'C C C C F F C C F F C C F F C C G G C C',
  },
  {
    title: 'Brilha, brilha, estrelinha',
    bpm: 100,
    melody:
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
    chords: 'C C F C F C G C C F C G C F C G C C F C F C G C',
  },
  {
    title: 'Frei João',
    bpm: 120,
    melody:
      'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2',
    chords: 'C C C C C C C C C C C C G C G C',
  },
  {
    title: 'O cordeirinho',
    bpm: 110,
    melody: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4',
    chords: 'C C C C G G C C C C C C G G C C',
  },
  {
    title: 'A quinta dos animais',
    bpm: 120,
    melody:
      'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2 r:2 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2 r:2 ' +
      'D4:0.5 D4:0.5 G4 G4:2 D4:0.5 D4:0.5 G4 G4:2 G4:0.5 G4:0.5 G4 G4:0.5 G4:0.5 G4 G4:0.5 G4:0.5 G4:0.5 G4:0.5 G4 G4 ' +
      'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:2 r:2',
    chords: 'G G C G G D G G G G C G G D G G G G G G G G G G G G C G G D G G',
  },
];

const NOTE_IDX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function hz(name: string): number {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 0;
  const midi = NOTE_IDX[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

type EvKind = 'lead' | 'bass' | 'pad' | 'kick' | 'snare' | 'hat' | 'click';
interface Ev {
  t: number; // seconds from the song start
  kind: EvKind;
  f: number;
  d: number;
}
interface Song {
  spec: SongSpec;
  events: Ev[];
  length: number; // seconds
  spb: number;
  intro: number; // seconds of count-in
}

const INTRO_BEATS = 4;
const REPEATS = 2;

function buildSong(spec: SongSpec): Song {
  const spb = 60 / spec.bpm;
  const notes = spec.melody
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return { f: n === 'r' ? 0 : hz(n), beats: d ? Number(d) : 1 };
    });
  const tuneBeats = notes.reduce((s, n) => s + n.beats, 0);
  const halves = spec.chords.trim().split(/\s+/);
  const ev: Ev[] = [];
  for (let b = 0; b < INTRO_BEATS; b++) ev.push({ t: b * spb, kind: 'click', f: 0, d: 0.05 });
  for (let r = 0; r < REPEATS; r++) {
    const off = (INTRO_BEATS + r * tuneBeats) * spb;
    let beat = 0;
    for (const n of notes) {
      if (n.f) ev.push({ t: off + beat * spb, kind: 'lead', f: n.f, d: n.beats * spb * 0.92 });
      beat += n.beats;
    }
    for (let h = 0; h * 2 < tuneBeats; h++) {
      const root = hz(`${halves[h % halves.length]}3`);
      const t = off + h * 2 * spb;
      for (const st of [0, 4, 7]) ev.push({ t, kind: 'pad', f: root * 2 ** (st / 12), d: spb * 1.9 });
      ev.push({ t, kind: 'bass', f: root / 2, d: spb * 0.9 });
      ev.push({ t: t + spb, kind: 'bass', f: (root / 2) * 1.5, d: spb * 0.9 });
    }
    for (let b = 0; b < tuneBeats; b++) {
      const t = off + b * spb;
      ev.push({ t, kind: b % 2 === 0 ? 'kick' : 'snare', f: 0, d: 0.2 });
      ev.push({ t, kind: 'hat', f: 0, d: 0.04 });
      ev.push({ t: t + spb / 2, kind: 'hat', f: 0, d: 0.03 });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { spec, events: ev, length: (INTRO_BEATS + REPEATS * tuneBeats) * spb + 0.8, spb, intro: INTRO_BEATS * spb };
}

/* ------------------------------------------------------------------ show plan (deterministic per show) */

interface Seg {
  kind: 'break' | 'song' | 'finale';
  start: number; // cycle seconds
  end: number;
  song: Song | null;
  bank: number; // index in SONGS (songs only)
  songStart: number; // cycle seconds of the song's first event (songs only)
  clap: boolean; // starts with applause (breaks after a song, finale)
  n: number; // 1-based song number in the show (breaks: the song just played)
}
interface Plan {
  segs: Seg[];
  finaleStart: number;
  end: number; // finale end: the audience starts leaving
}

let builtSongs: Song[] | null = null;
const allSongs = (): Song[] => (builtSongs ??= SONGS.map(buildSong));
const plans = new Map<number, Plan>();

/** Show number `k` (= minutes since the epoch / 20, local time): the song bank rotated by k, with the usual breaks. */
function showPlan(k: number): Plan {
  const cached = plans.get(k);
  if (cached) return cached;
  const songs = allSongs();
  const segs: Seg[] = [{ kind: 'break', start: 0, end: 2.5, song: null, bank: -1, songStart: 0, clap: false, n: 0 }];
  let t = 2.5;
  for (let j = 0; j < SHOW_SONGS; j++) {
    const bank = (((k + j) % songs.length) + songs.length) % songs.length;
    const song = songs[bank];
    const songStart = t + 0.2;
    segs.push({ kind: 'song', start: t, end: songStart + song.length, song, bank, songStart, clap: false, n: j + 1 });
    t = songStart + song.length;
    if (j < SHOW_SONGS - 1) {
      segs.push({ kind: 'break', start: t, end: t + 7, song: null, bank: -1, songStart: 0, clap: true, n: j + 1 });
      t += 7;
    }
  }
  const finaleStart = t;
  segs.push({ kind: 'finale', start: t, end: t + 7, song: null, bank: -1, songStart: 0, clap: true, n: SHOW_SONGS });
  const plan: Plan = { segs, finaleStart, end: t + 7 };
  if (plans.size > 6) plans.clear();
  plans.set(k, plan);
  return plan;
}


function performerLook(rng: () => number, woman: boolean) {
  return {
    shirt: pick(rng, [0xf06595, 0xae3ec9, 0x15aabf, 0xfab005, 0xff6b6b]),
    pants: pick(rng, PANTS),
    skin: pick(rng, SKINS),
    hair: pick(rng, HAIRS),
    dress: woman,
    longHair: woman,
  };
}


/* ------------------------------------------------------------------ the concert */

type Lineup = 'cantora' | 'cantor' | 'banda';
type Mode = 'dance' | 'clap' | 'idle' | 'bye';

/** One audience member: spot, look, and the walk out (spot → aisle → gate → forecourt; walking in = reversed). */
interface Fan {
  x: number;
  z: number;
  s: number;
  ph: number;
  style: number;
  rot: number;
  path: number[]; // x0 z0 x1 z1 x2 z2 x3 z3 (local)
  len: number;
  speed: number;
  leaveDelay: number;
  arriveDelay: number;
}
const frac = (v: number): number => v - Math.floor(v);

interface Performer {
  folk: Folk;
  role: 'singer' | 'guitar' | 'drums' | 'keys';
}

export class Concert {
  /** The ticket booth (tap / Enter to buy). Null if the city had no room for the venue. */
  readonly booth: Interactable | null = null;
  /** World box of the inside of the venue (nothing spawns there). */
  readonly interior: Obstacle | null = null;
  readonly lineup: Lineup;

  private readonly root = new THREE.Group();
  private plot: Plot | null = null;
  private gate: TicketGate | null = null;
  private readonly center = new THREE.Vector3();

  private performers: Performer[] = [];
  private beams: THREE.Mesh[] = [];
  private arcs: THREE.Mesh[] = [];

  // audience (instanced: legs, torsos, heads, hair, arms)
  private fans: Fan[] = [];
  private legs: THREE.InstancedMesh | null = null;
  private torsos: THREE.InstancedMesh | null = null;
  private heads: THREE.InstancedMesh | null = null;
  private hairs: THREE.InstancedMesh | null = null;
  private arms: THREE.InstancedMesh | null = null;

  private leaveDur = 0; // seconds from the finale end until the last person is out
  private arriveDur = 0; // seconds from ARRIVE until the last person is in place
  private readonly where = { x: 0, z: 0, yaw: 0, scale: 1, walk: -1 };

  // the two crowd blocks (obstacles): only solid while the audience stands there
  private blocks: Obstacle[] = [];
  private blocksClosed: Obstacle[] = [];
  private blocksOn = true;

  // wall-clock timeline: show (break ⇄ song × SHOW_SONGS, finale) → leaving → empty → arriving → waiting → show
  private debugOffset = 0;
  private audioOffset: number | null = null; // absolute (local) seconds − audio clock
  private k = 0; // show number
  private c = 0; // seconds into the cycle
  private plan: Plan = showPlan(0);
  private seg: Seg | null = null;
  private segKey = '';
  private lastC = -1;
  private state: 'break' | 'song' | 'finale' | 'leaving' | 'empty' | 'arriving' | 'waiting' = 'empty';
  private audience: 'in place' | 'leaving' | 'gone' | 'arriving' = 'gone';
  private evIdx = 0;
  private onDebugTime: ((e: Event) => void) | null = null;
  private posedAs = ''; // audience phase of the last pose (far away: re-posed only when it changes)

  // sound
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private vol = 0;
  private lastVol = -1;
  private lastCut = -1;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    avoid: THREE.Vector3[] = [],
  ) {
    this.lineup = pick(rng, ['cantora', 'cantor', 'banda'] as const);
    rng(); // (was the first song; kept so the rest of the venue looks the same as before)
    const plot = findPlot(HW, BACK, obstacles, rng, avoid);
    if (!plot) return;
    this.plot = plot;
    this.root.position.set(plot.x, 0, plot.z);
    this.root.rotation.y = plot.rot;
    scene.add(this.root);
    const c = toWorld(plot.x, plot.z, plot.rot, 0, BACK / 2);
    this.center.set(c.x, 0, c.z);

    buildFence(this.root, plot, HW, BACK, obstacles, [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa]);
    this.buildGrounds();
    this.buildStage();
    this.buildPerformers(rng);
    this.buildAudience(rng);
    this.gate = new TicketGate(this.root, scene, ctx, plot, obstacles, rng, {
      price: TICKET_PRICE,
      hw: HW,
      back: BACK,
      boothColor: 0xff8cc6,
      roofColor: 0x7048e8,
      greeting: 'Bem-vindos ao concerto!',
      salesOpen: () => this.salesOpen(),
      forceOpen: () => this.audience === 'leaving' || this.audience === 'arriving',
    });
    this.booth = this.gate.booth;

    const W = (x0: number, x1: number, z0: number, z1: number, h?: number) => obstacles.push(worldBox(plot, x0, x1, z0, z1, h));
    W(STAGE.x0, STAGE.x1, STAGE.z0, STAGE.z1, STAGE.h); // the stage itself (performers stand on it)
    W(STAGE.x0, STAGE.x1, BACK, STAGE.z0); // backdrop (tall)
    W(-8.9, -7.7, -20.2, -18.8, 2.3); // speakers
    W(7.7, 8.9, -20.2, -18.8, 2.3);
    // the crowd (two blocks with an aisle between): solid only while the audience stands there
    this.blocks = [worldBox(plot, -CROWD.x1, -CROWD.x0, CROWD.z0, CROWD.z1, 2.1), worldBox(plot, CROWD.x0, CROWD.x1, CROWD.z0, CROWD.z1, 2.1)];
    this.blocksClosed = this.blocks.map((o) => ({ ...o }));
    obstacles.push(...this.blocks);
    this.interior = worldBox(plot, -HW, HW, BACK, 0.2);

    if (location.search.includes('debug')) {
      // QA: jump the cycle to detail = seconds after the show start
      this.onDebugTime = (e: Event) => {
        const want = Number((e as CustomEvent).detail);
        if (!Number.isFinite(want)) return;
        const c = ((this.wall() % CYCLE) + CYCLE) % CYCLE;
        this.debugOffset += (((want % CYCLE) + CYCLE) % CYCLE) - c;
        this.audioOffset = null;
      };
      window.addEventListener('rainbow-concert-time', this.onDebugTime);
    }
  }

  /* ------------------------------------------------------------ building */

  private buildGrounds(): void {
    const g = this.root;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, -BACK), mat(0xd0bfff));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.02, BACK / 2);
    floor.receiveShadow = true;
    g.add(floor);
    // balloons and a rainbow over the gate
    const colors = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa];
    for (const s of [-1, 1]) {
      box(g, mat(0xffffff), 0.3, 1.2, 0.3, s * (GATE_HW + 0.2), 3.7, 0);
      for (let i = 0; i < 3; i++) {
        const b = ball(g, mat(pick(Math.random, colors), 0.15), 0.32, s * (GATE_HW + 0.5 + i * 0.25), 4.4 + i * 0.35, 0.2);
        b.scale.y = 0.4;
      }
    }
    const rainbow = [0xe03131, 0xfd7e14, 0xfcc419, 0x40c057, 0x228be6, 0x7950f2];
    rainbow.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(2.2 - i * 0.13, 0.075, 6, 28, Math.PI), mat(c, 0.35));
      arc.position.set(0, 3.0, 0);
      g.add(arc);
      this.arcs.push(arc);
    });
  }


  private buildStage(): void {
    const g = this.root;
    const S = STAGE;
    const cx = (S.x0 + S.x1) / 2;
    const cz = (S.z0 + S.z1) / 2;
    box(g, mat(0x3b2f63), S.x1 - S.x0, S.h, S.z1 - S.z0, cx, S.h / 2, cz);
    box(g, mat(0xffd43b, 0.3), S.x1 - S.x0 + 0.05, 0.12, 0.08, cx, S.h - 0.05, S.z1); // golden edge
    // backdrop with a big rainbow and stars
    box(g, mat(0x2b2350), S.x1 - S.x0 + 1, 6.5, 0.3, cx, 3.25, S.z0 - 0.15);
    const rainbow = [0xe03131, 0xfd7e14, 0xfcc419, 0x40c057, 0x228be6, 0x7950f2];
    rainbow.forEach((c, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(4.6 - i * 0.32, 0.16, 6, 36, Math.PI), mat(c, 0.5));
      arc.position.set(0, S.h + 0.6, S.z0 + 0.05);
      g.add(arc);
      this.arcs.push(arc);
    });
    for (let i = 0; i < 9; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), mat(0xfff3bf, 0.8));
      star.position.set(-6.5 + i * 1.6, 5.3 + Math.sin(i * 1.7) * 0.5, S.z0 + 0.1);
      g.add(star);
      this.arcs.push(star);
    }
    // roof frame (truss) with coloured lights
    const truss = mat(0x868e96);
    for (const px of [S.x0 + 0.2, S.x1 - 0.2]) for (const pz of [S.z0 + 0.2, S.z1 - 0.2]) box(g, truss, 0.25, 6.8, 0.25, px, 3.4, pz);
    box(g, truss, S.x1 - S.x0, 0.3, 0.3, cx, 6.7, S.z1 - 0.2);
    box(g, truss, S.x1 - S.x0, 0.3, 0.3, cx, 6.7, S.z0 + 0.2);
    const beamGeo = new THREE.ConeGeometry(1.3, 5.4, 18, 1, true);
    const beamCols = [0xff6b6b, 0x4dabf7, 0xffd43b, 0xda77f2];
    [-5, -1.7, 1.7, 5].forEach((bx, i) => {
      box(g, mat(0x212529), 0.4, 0.4, 0.4, bx, 6.35, S.z1 - 0.2);
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({ color: beamCols[i], transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const pivot = new THREE.Group();
      pivot.position.set(bx, 6.2, S.z1 - 0.2);
      beam.position.y = -2.7;
      pivot.add(beam);
      g.add(pivot);
      this.beams.push(beam);
    });
    // speakers on the floor at both sides of the stage
    for (const s of [-1, 1]) {
      const sp = box(g, mat(0x212529), 1.2, 2.3, 1.2, s * 8.3, 1.15, -19.5);
      for (const [y, r] of [[1.6, 0.3], [0.7, 0.42]] as const) {
        const cone = cyl(this.root, mat(0x495057), r, 0.06, s * 8.3, y, -18.88);
        cone.rotation.x = Math.PI / 2;
      }
      sp.receiveShadow = true;
    }
  }

  private buildPerformers(rng: () => number): void {
    const top = STAGE.h;
    const place = (folk: Folk, x: number, y: number, z: number) => {
      folk.group.position.set(x, y, z);
      folk.group.rotation.y = Math.PI; // facing the audience (+Z)
      this.root.add(folk.group);
    };
    const woman = this.lineup === 'cantora' || (this.lineup === 'banda' && rng() < 0.5);
    const singer = buildFolk(performerLook(rng, woman));
    // hand-held microphone in the right hand
    const mic = new THREE.Group();
    mic.position.set(0, -0.68, 0);
    cyl(mic, mat(0x343a40), 0.035, 0.22, 0, 0, 0);
    ball(mic, mat(0xadb5bd), 0.07, 0, -0.13, 0);
    singer.armR.add(mic);
    place(singer, 0, top, -19.6);
    this.performers.push({ folk: singer, role: 'singer' });
    if (this.lineup !== 'banda') {
      // a solo show still has a microphone stand and a little keyboard on a stand, unattended
      return;
    }
    // guitarist (stage left)
    const gtr = buildFolk({ ...performerLook(rng, rng() < 0.5), dress: false, longHair: rng() < 0.4 });
    const guitar = new THREE.Group();
    guitar.position.set(0, 1.15, -0.38);
    guitar.rotation.z = 0.5;
    const body = cyl(guitar, mat(0xd9480f), 0.28, 0.1, 0, 0, 0);
    body.rotation.x = Math.PI / 2;
    box(guitar, mat(0x5c3d2e), 0.08, 0.75, 0.05, 0, 0.5, 0);
    gtr.body.add(guitar);
    place(gtr, -4.2, top, -20.6);
    this.performers.push({ folk: gtr, role: 'guitar' });
    // keyboard player (stage right)
    const keys = buildFolk({ ...performerLook(rng, rng() < 0.5), dress: false });
    place(keys, 4.2, top, -20.9);
    const kb = new THREE.Group();
    kb.position.set(4.2, top, -20.25);
    box(kb, mat(0x212529), 1.4, 0.9, 0.1, 0, 0.45, 0);
    box(kb, mat(0x212529), 1.6, 0.12, 0.5, 0, 0.95, 0);
    box(kb, mat(0xffffff), 1.45, 0.04, 0.22, 0, 1.03, 0.1);
    for (let i = 0; i < 7; i++) box(kb, mat(0x111111), 0.06, 0.04, 0.12, -0.6 + i * 0.2, 1.05, 0.06);
    this.root.add(kb);
    this.performers.push({ folk: keys, role: 'keys' });
    // drummer on a riser at the back
    const riser = new THREE.Group();
    riser.position.set(0, top, -22.9);
    box(riser, mat(0x5f3dc4), 3.4, 0.4, 2.2, 0, 0.2, 0);
    const kick = cyl(riser, mat(0xe03131), 0.45, 0.4, 0, 0.85, 0.75);
    kick.rotation.x = Math.PI / 2;
    cyl(riser, mat(0xf1f3f5), 0.25, 0.22, -0.65, 1.05, 0.55);
    cyl(riser, mat(0xf1f3f5), 0.22, 0.2, 0.6, 1.1, 0.6);
    cyl(riser, mat(0xfab005, 0.2), 0.35, 0.02, -1.05, 1.6, 0.4);
    cyl(riser, mat(0xfab005, 0.2), 0.32, 0.02, 1.0, 1.55, 0.35);
    this.root.add(riser);
    const drummer = buildFolk({ ...performerLook(rng, rng() < 0.5), dress: false });
    place(drummer, 0, top + 0.4 - 0.35, -23.4); // sitting: a little lower
    this.performers.push({ folk: drummer, role: 'drums' });
  }

  private buildAudience(rng: () => number): void {
    const n = AUDIENCE;
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const mk = (geo: THREE.BufferGeometry, count: number) => {
      const m = new THREE.InstancedMesh(geo, white, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false; // instances are spread wider than the base geometry's bounds
      this.root.add(m);
      return m;
    };
    this.legs = mk(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), n * 2);
    this.torsos = mk(new THREE.CapsuleGeometry(0.34, 0.55, 4, 10), n);
    this.heads = mk(new THREE.SphereGeometry(0.3, 12, 10), n);
    this.hairs = mk(new THREE.SphereGeometry(0.315, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), n);
    this.arms = mk(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), n * 2);
    const col = new THREE.Color();
    const perSide = n / 2;
    const cols = 5;
    const rows = Math.ceil(perSide / cols);
    let i = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < perSide; k++) {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const ax = CROWD.x0 + 0.7 + ((CROWD.x1 - CROWD.x0 - 1.2) * c) / (cols - 1) + (rng() - 0.5) * 0.4;
        const az = CROWD.z0 + 0.7 + ((CROWD.z1 - CROWD.z0 - 1.4) * r) / Math.max(1, rows - 1) + (rng() - 0.5) * 0.4;
        const x = side * ax;
        const kid = rng() < 0.45;
        const sc = kid ? 0.62 + rng() * 0.12 : 0.88 + rng() * 0.14;
        const ph = rng() * Math.PI * 2;
        // walking lane in the aisle (own side) and pace, derived from ph so the random sequence stays the same
        const lx = side * (0.3 + frac(ph * 7.13) * 0.6);
        const path = [x, az, lx, az, lx, 0, lx * 0.6, OUT_Z];
        this.fans.push({
          x,
          z: az,
          s: sc,
          ph,
          style: Math.floor(rng() * 3),
          rot: Math.atan2(x, -(STAGE.z1 - 2) + az) * 0.6 + (rng() - 0.5) * 0.3,
          path,
          len: Math.abs(x - lx) + Math.abs(az) + Math.hypot(lx * 0.4, OUT_Z),
          speed: (kid ? 1.15 : 1.3) + frac(ph * 3.71) * 0.3,
          leaveDelay: 0,
          arriveDelay: 0,
        });
        const shirt = pick(rng, SHIRTS);
        const pants = pick(rng, PANTS);
        this.torsos.setColorAt(i, col.setHex(shirt));
        this.arms.setColorAt(i * 2, col);
        this.arms.setColorAt(i * 2 + 1, col);
        this.legs.setColorAt(i * 2, col.setHex(pants));
        this.legs.setColorAt(i * 2 + 1, col);
        this.heads.setColorAt(i, col.setHex(pick(rng, SKINS)));
        this.hairs.setColorAt(i, col.setHex(pick(rng, HAIRS)));
        i++;
      }
    }
    // leaving: nearest the gate first (so nobody walks through someone still standing); arriving: farthest first
    const byLen = this.fans.map((_, k) => k).sort((p, q) => this.fans[p].len - this.fans[q].len);
    byLen.forEach((k, rank) => {
      const f = this.fans[k];
      f.leaveDelay = rank * STAGGER;
      f.arriveDelay = (byLen.length - 1 - rank) * STAGGER;
      this.leaveDur = Math.max(this.leaveDur, f.leaveDelay + f.len / f.speed);
      this.arriveDur = Math.max(this.arriveDur, f.arriveDelay + f.len / f.speed);
    });
    this.poseAudience(0, 'idle');
  }


  /** True while she is inside the venue (the idle pause doesn't kick in while she watches). */
  isInside(): boolean {
    return this.gate?.inside ?? false;
  }


  private ensureAudio(): AudioContext | null {
    const ac = audioContext();
    if (!ac) return null;
    if (!this.bus) {
      this.filter = ac.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 800;
      this.bus = ac.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(this.filter).connect(ac.destination);
      const len = Math.floor(ac.sampleRate * 0.5);
      this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return ac;
  }

  private osc(ac: AudioContext, f: number, t: number, d: number, type: OscillatorType, gain: number): void {
    if (!this.bus) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + d + 0.03);
  }

  private noise(ac: AudioContext, t: number, d: number, gain: number, type: BiquadFilterType, freq: number): void {
    if (!this.bus || !this.noiseBuf) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.3);
    src.stop(t + d + 0.02);
  }

  private play(ac: AudioContext, e: Ev, at: number): void {
    switch (e.kind) {
      case 'lead':
        this.osc(ac, e.f, at, e.d, 'triangle', 0.16);
        this.osc(ac, e.f * 2, at, e.d * 0.6, 'sine', 0.035);
        break;
      case 'pad':
        this.osc(ac, e.f, at, e.d, 'sine', 0.03);
        break;
      case 'bass':
        this.osc(ac, e.f, at, e.d, 'triangle', 0.14);
        break;
      case 'kick': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.setValueAtTime(150, at);
        o.frequency.exponentialRampToValueAtTime(45, at + 0.15);
        g.gain.setValueAtTime(0.35, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        o.connect(g).connect(this.bus!);
        o.start(at);
        o.stop(at + 0.22);
        break;
      }
      case 'snare':
        this.noise(ac, at, 0.14, 0.12, 'bandpass', 1800);
        break;
      case 'hat':
        this.noise(ac, at, e.d, 0.04, 'highpass', 7000);
        break;
      case 'click':
        this.noise(ac, at, 0.04, 0.12, 'highpass', 3000);
        break;
    }
  }

  private applause(ac: AudioContext, at: number, secs: number): void {
    for (let i = 0; i < secs * 24; i++) {
      const t = at + Math.random() * secs * Math.random() ** 0.3;
      this.noise(ac, t, 0.035, 0.05 + Math.random() * 0.05, 'bandpass', 1100 + Math.random() * 1400);
    }
  }

  /** Local wall-clock seconds (+ the QA offset): shows start at :00, :20 and :40 of the device's local time. */
  private wall(): number {
    const ms = Date.now();
    return ms / 1000 - new Date(ms).getTimezoneOffset() * 60 + this.debugOffset;
  }

  /** The audio clock mapped onto the wall clock (keeps notes and dancing in step); the wall clock without audio. */
  private clock(ac: AudioContext | null): number {
    const wall = this.wall();
    if (ac && ac.state === 'running') {
      if (this.audioOffset === null || Math.abs(ac.currentTime + this.audioOffset - wall) > 0.25) this.audioOffset = wall - ac.currentTime;
      return ac.currentTime + this.audioOffset;
    }
    this.audioOffset = null;
    return wall;
  }

  /** Where in the cycle are we: show segment, or leaving / empty / arriving / waiting. */
  private tick(now: number): void {
    this.k = Math.floor(now / CYCLE);
    this.c = now - this.k * CYCLE;
    this.plan = showPlan(this.k);
    const c = this.c;
    const P = this.plan;
    this.seg = c < P.end ? (P.segs.find((s) => c >= s.start && c < s.end) ?? null) : null;
    if (this.seg) {
      this.state = this.seg.kind;
      this.audience = 'in place';
    } else if (c < P.end + this.leaveDur) {
      this.state = 'leaving';
      this.audience = 'leaving';
    } else if (c < ARRIVE) {
      this.state = 'empty';
      this.audience = 'gone';
    } else if (c < ARRIVE + this.arriveDur) {
      this.state = 'arriving';
      this.audience = 'arriving';
    } else {
      this.state = 'waiting';
      this.audience = 'in place';
    }
  }

  /** The booth sells from doors open until the finale. */
  private salesOpen(): boolean {
    return this.c >= DOORS_OPEN || this.c < this.plan.finaleStart;
  }

  /** The crowd blocks are solid only while the audience stands there (never closed on top of her). */
  private updateBlocks(): void {
    const want = this.audience === 'in place';
    if (want === this.blocksOn) return;
    const p = this.ctx.player;
    if (want && this.blocksClosed.some((b) => p.x > b.minX - 0.5 && p.x < b.maxX + 0.5 && p.z > b.minZ - 0.5 && p.z < b.maxZ + 0.5)) return;
    this.blocks.forEach((b, i) => Object.assign(b, want ? this.blocksClosed[i] : { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6 }));
    this.blocksOn = want;
  }

  /** Per frame: clock, gate, ticket, music scheduling, animation. */
  update(dt: number): void {
    if (!this.plot || !this.gate) return;
    const ac = this.ensureAudio();
    this.tick(this.clock(ac));
    this.gate.update(dt);
    this.updateBlocks();
    const inside = this.gate.inside;

    const paused = this.ctx.isPaused();
    const p = this.ctx.player;
    const dist = Math.hypot(p.x - this.center.x, p.z - this.center.z);

    // volume: clear inside, muffled outside, silent far away or while the game is paused (the show goes on)
    const target = paused ? 0 : inside ? 1 : Math.max(0, 1 - dist / 55) * 0.3;
    const cut = inside ? 12000 : 700;
    if (ac && this.bus && this.filter) {
      if (Math.abs(target - this.lastVol) > 0.01) {
        this.bus.gain.setTargetAtTime(target, ac.currentTime, paused ? 0.02 : 0.25);
        this.lastVol = target;
      }
      if (cut !== this.lastCut) {
        this.filter.frequency.setTargetAtTime(cut, ac.currentTime, 0.3);
        this.lastCut = cut;
      }
    }
    this.vol = target;

    // entering a new part of the show: announce the song, applause, goodbye (only when reached naturally)
    const c = this.c;
    const seg = this.seg;
    const key = seg ? `${this.k}:${this.plan.segs.indexOf(seg)}` : this.state;
    const jumped = this.lastC < 0 || (c - this.lastC + CYCLE) % CYCLE > 2; // reload, QA jump, tab asleep
    if (key !== this.segKey || jumped) {
      const fresh = key !== this.segKey && !jumped && !!seg && c - seg.start < 1.5;
      this.segKey = key;
      if (seg?.song) {
        // join mid-song: skip everything already past
        const ev = seg.song.events;
        this.evIdx = 0;
        while (this.evIdx < ev.length && seg.songStart + ev[this.evIdx].t < c - 0.05) this.evIdx++;
      }
      if (fresh && seg) {
        if (seg.song && inside && !paused && !speechSynthesis.speaking) void speak([`Agora vamos cantar: ${seg.song.spec.title}!`]);
        if (seg.clap && ac && this.vol > 0) this.applause(ac, ac.currentTime + 0.05, seg.kind === 'finale' ? 5.5 : 3);
        if (seg.kind === 'finale' && inside && !paused) void speak(['Obrigado, meninos!', 'O concerto acabou. Até à próxima!']);
      }
    }
    this.lastC = c;

    // music: schedule the next notes a little ahead on the audio clock
    if (seg?.song) {
      const s = seg.song;
      const ahead = c + 0.25;
      const base = this.k * CYCLE;
      while (this.evIdx < s.events.length && seg.songStart + s.events[this.evIdx].t <= ahead) {
        const e = s.events[this.evIdx++];
        const at = seg.songStart + e.t;
        if (ac && this.vol > 0 && this.audioOffset !== null && at >= c - 0.05) this.play(ac, e, Math.max(ac.currentTime, base + at - this.audioOffset));
      }
    }

    this.stagePresence(c);
    this.countdown(c, dist, paused);
    if (dist > 90 || paused) {
      // nobody to watch it: skip the animation (but don't leave a stale crowd behind when the phase changes)
      if (this.posedAs !== this.audience) this.poseAudience(c * 2.2, 'idle');
      return;
    }
    let beat = -1;
    if (seg?.song) {
      const t = c - seg.songStart - seg.song.intro;
      if (t >= 0) beat = t / seg.song.spb;
    }
    const mode: Mode = beat >= 0 ? 'dance' : seg?.kind === 'finale' ? 'bye' : seg?.clap && c - seg.start < 3.5 ? 'clap' : 'idle';
    this.animateStage(c, beat, mode, !seg && this.audience !== 'in place');
    this.poseAudience(beat >= 0 ? beat : c * 2.2, mode === 'bye' ? 'clap' : mode);
  }


  /* ---- countdown: the last minute before a show, big glowing digits on the stage backdrop + the narrator ---- */
  private digits: THREE.Mesh[][] | null = null;
  private lastCount = -1;
  private buildDigits(): void {
    // two 7-segment digits (segments a b c d e f g), lit segments glow yellow
    const W = 0.9;
    const H = 1.6;
    const T = 0.18;
    const segs: [number, number, number, number][] = [
      [0, H, W, T], [W / 2, H * 0.75, T, H / 2], [W / 2, H * 0.25, T, H / 2], [0, 0, W, T],
      [-W / 2, H * 0.25, T, H / 2], [-W / 2, H * 0.75, T, H / 2], [0, H / 2, W, T],
    ];
    const on = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.digits = [-0.75, 0.75].map((dx) =>
      segs.map(([x, y, w, h]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), on);
        m.position.set(dx + x, STAGE.h + 2.1 + y, STAGE.z0 + 0.25);
        m.visible = false;
        this.root.add(m);
        return m;
      }),
    );
  }
  private countdown(c: number, dist: number, paused: boolean): void {
    if (!this.digits) this.buildDigits();
    const left = Math.ceil(CYCLE - c);
    const showing = left >= 1 && left <= 60;
    const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f]; // bits a..g
    const val = showing ? left : -1;
    if (val !== this.lastCount) {
      const prev = this.lastCount;
      this.lastCount = val;
      const tens = Math.floor(val / 10);
      const ones = val % 10;
      this.digits!.forEach((d, k) => {
        const n = k === 0 ? tens : ones;
        const bits = val < 0 || (k === 0 && tens === 0) ? 0 : SEG[n];
        d.forEach((m, i) => (m.visible = (bits >> i) & 1 ? true : false));
      });
      // the narrator, only when she's around (inside or near the venue) and the game isn't paused
      const near = dist < 40 && !paused;
      if (near && val === 60) void speak(['Falta um minuto para o concerto!']);
      else if (near && prev !== -1 && val === 30) void speak(['Faltam trinta segundos!']);
      else if (near && prev !== -1 && val >= 1 && val <= 10) {
        const W = ['', 'Um!', 'Dois!', 'Três!', 'Quatro!', 'Cinco!', 'Seis!', 'Sete!', 'Oito!', 'Nove!', 'Dez!'];
        void speak([W[val]]);
      }
    }
  }

  private homes: THREE.Vector3[] | null = null;
  /**
   * The performers are only on stage for the show: they walk on from the side ~10 s before it starts and walk off
   * the side after the finale (then they're gone until the next show).
   */
  private stagePresence(c: number): void {
    if (!this.homes) this.homes = this.performers.map((p) => p.folk.group.position.clone());
    const WALK = 9; // seconds to walk on/off
    const off = this.plan.end; // finale over
    let k: number; // 0 = at home on stage, 1 = gone at the side
    if (c < off) k = 0;
    else if (c < off + WALK) k = (c - off) / WALK;
    else if (c > CYCLE - WALK) k = (CYCLE - c) / WALK;
    else k = 1;
    this.performers.forEach((p, i) => {
      const home = this.homes![i];
      const side = home.x <= 0 ? -1 : 1;
      const g = p.folk.group;
      g.visible = k < 1;
      g.position.x = home.x + (side * 8.2 - home.x) * k;
      g.position.z = home.z;
      if (k > 0 && k < 1) {
        const leavingNow = c >= off && c < off + WALK;
        g.rotation.y = (leavingNow ? side : -side) > 0 ? Math.PI / 2 : -Math.PI / 2;
        const ph = c * 7;
        p.folk.body.position.y = Math.abs(Math.sin(ph)) * 0.05;
        p.folk.armL.rotation.set(Math.sin(ph) * 0.5, 0, -0.08);
        p.folk.armR.rotation.set(-Math.sin(ph) * 0.5, 0, 0.08);
      } else {
        g.rotation.y = Math.PI; // facing the audience
        p.folk.body.position.y = 0;
      }
    });
  }

  private animateStage(now: number, beat: number, mode: Mode, dark: boolean): void {
    const playing = beat >= 0;
    const pulse = playing ? 1 - (beat % 1) : 0;
    for (const p of this.performers) {
      const f = p.folk;
      const b = playing ? beat : now * 0.8;
      if (p.role === 'singer') {
        f.body.rotation.z = Math.sin(b * Math.PI) * (playing ? 0.12 : 0.03);
        f.group.position.y = STAGE.h + (playing ? Math.abs(Math.sin(b * Math.PI)) * 0.08 : 0);
        f.armR.rotation.set(2.5, 0, 0.3); // microphone at the mouth
        f.armL.rotation.set(0, 0, playing ? -(1.6 + Math.sin(b * Math.PI) * 0.8) : mode === 'clap' ? -2.6 : -0.2);
        f.body.rotation.x = mode === 'clap' ? -0.5 : 0; // a bow while everybody claps
      }
      if (mode === 'bye') {
        // goodbye: everybody on stage waves with the free arm
        const wave = 2.5 + Math.sin(now * 9) * 0.4;
        if (p.role === 'singer') f.armL.rotation.set(0, 0, -wave);
        else f.armR.rotation.set(0, 0, wave);
        f.head.rotation.x = 0;
      } else if (p.role === 'guitar') {
        f.armR.rotation.set(1.0 + Math.sin(b * Math.PI * 2) * (playing ? 0.35 : 0), 0, -0.5);
        f.armL.rotation.set(1.1, 0, 0.6);
        f.head.rotation.x = playing ? Math.sin(b * Math.PI * 2) * 0.12 : 0;
      } else if (p.role === 'keys') {
        const k = playing ? Math.abs(Math.sin(b * Math.PI * 2)) * 0.2 : 0;
        f.armL.rotation.set(1.2 + k, 0, 0.2);
        f.armR.rotation.set(1.2 + (playing ? 0.2 - k : 0), 0, -0.2);
        f.body.rotation.z = playing ? Math.sin(b * Math.PI) * 0.06 : 0;
      } else {
        const hit = playing ? Math.abs(Math.sin(b * Math.PI)) : 0;
        f.armL.rotation.set(1.0 + hit * 0.6, 0, 0.3);
        f.armR.rotation.set(1.0 + (playing ? Math.abs(Math.cos(b * Math.PI)) * 0.6 : 0), 0, -0.3);
      }
    }
    this.beams.forEach((beam, i) => {
      const piv = beam.parent!;
      piv.rotation.z = Math.sin(now * 0.9 + i * 1.3) * 0.45;
      piv.rotation.x = 0.25 + Math.cos(now * 0.7 + i) * 0.2;
      const m = beam.material as THREE.MeshBasicMaterial;
      m.opacity = dark ? 0 : playing ? 0.12 + pulse * 0.14 : 0.08;
      beam.visible = !dark;
      if (playing && beat % 4 < 0.05) m.color.setHSL(((Math.floor(beat / 4) + i) * 0.23) % 1, 0.9, 0.6);
    });
    for (const a of this.arcs) {
      const m = a.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = dark ? 0.05 : 0.3 + pulse * 0.6;
    }
  }

  private readonly mP = new THREE.Matrix4();
  private readonly mT = new THREE.Matrix4();
  private readonly mR = new THREE.Matrix4();
  private readonly mOut = new THREE.Matrix4();
  private readonly qv = new THREE.Quaternion();
  private readonly ev = new THREE.Euler();
  private readonly vv = new THREE.Vector3();
  private readonly sv = new THREE.Vector3();
  private readonly armDown = new THREE.Matrix4().makeTranslation(0, -0.33, 0);
  private readonly legDown = new THREE.Matrix4().makeTranslation(0, -0.37, 0);
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Where fan `f` is now (local): standing at the spot, walking out / in along the path, or gone (scale 0). */
  private fanAt(f: Fan): void {
    const w = this.where;
    w.x = f.x;
    w.z = f.z;
    w.yaw = f.rot;
    w.scale = f.s;
    w.walk = -1;
    if (this.audience === 'in place') return;
    if (this.audience === 'gone') {
      w.scale = 0;
      return;
    }
    let s: number; // metres from the spot along the path
    const back = this.audience === 'arriving';
    if (!back) {
      const t = this.c - (this.plan.end + f.leaveDelay);
      if (t <= 0) return; // still waiting for her turn to leave
      s = t * f.speed;
      w.walk = s;
    } else {
      const t = this.c - (ARRIVE + f.arriveDelay);
      if (t <= 0) {
        w.scale = 0; // not here yet
        return;
      }
      s = f.len - t * f.speed;
      if (s <= 0) return; // arrived
      w.walk = t * f.speed;
    }
    if (s >= f.len) {
      w.scale = 0;
      return;
    }
    const P = f.path;
    let rem = s;
    for (let j = 0; j < 3; j++) {
      const ax = P[j * 2];
      const az = P[j * 2 + 1];
      const dx = P[j * 2 + 2] - ax;
      const dz = P[j * 2 + 3] - az;
      const L = Math.hypot(dx, dz);
      if (rem <= L || j === 2) {
        const u = L > 0 ? Math.min(1, rem / L) : 0;
        w.x = ax + dx * u;
        w.z = az + dz * u;
        w.yaw = back ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz); // people face -Z
        break;
      }
      rem -= L;
    }
    w.scale = f.s * Math.min(1, (f.len - s) / FADE); // shrink away at the end of the path (grow in when arriving)
  }

  /** Place every audience member's parts. `b` = beat (dancing) or a running clock. Walkers swing arms and legs. */
  private poseAudience(b: number, mode: 'dance' | 'clap' | 'idle'): void {
    if (!this.legs || !this.torsos || !this.heads || !this.hairs || !this.arms) return;
    const parts = [this.legs, this.torsos, this.heads, this.hairs, this.arms];
    const gone = this.audience === 'gone';
    for (const m of parts) m.visible = !gone;
    if (gone) return;
    const { mP, mT, mR, mOut, qv, ev, vv, sv, where } = this;
    this.fans.forEach((f, i) => {
      this.fanAt(f);
      if (where.scale <= 0.001) {
        for (const k of [i * 2, i * 2 + 1]) {
          this.legs!.setMatrixAt(k, this.zero);
          this.arms!.setMatrixAt(k, this.zero);
        }
        for (const m of [this.torsos!, this.heads!, this.hairs!]) m.setMatrixAt(i, this.zero);
        return;
      }
      const walking = where.walk >= 0;
      const fm = walking ? 'idle' : mode;
      const step = walking ? Math.sin(where.walk * 2.6) : 0;
      const ph = b * Math.PI + f.ph * (fm === 'dance' ? 0.15 : 1);
      const bounce = walking
        ? Math.abs(step) * 0.05
        : fm === 'dance' ? Math.abs(Math.sin(ph)) * 0.16 : fm === 'clap' ? Math.abs(Math.sin(ph * 2)) * 0.04 : 0;
      const sway = fm === 'dance' && f.style === 2 ? Math.sin(ph) * 0.12 : 0;
      mP.compose(vv.set(where.x, bounce, where.z), qv.setFromEuler(ev.set(0, where.yaw, sway)), sv.setScalar(where.scale));
      for (const side of [-1, 1]) {
        mOut.multiplyMatrices(mP, mT.makeTranslation(side * 0.15, 0.77, 0)).multiply(mR.makeRotationX(step * side * 0.5)).multiply(this.legDown);
        this.legs!.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), mOut);
      }
      this.torsos!.setMatrixAt(i, mOut.multiplyMatrices(mP, mT.makeTranslation(0, 1.22, 0)));
      const nod = fm === 'dance' ? Math.sin(ph * 2) * 0.05 : 0;
      this.heads!.setMatrixAt(i, mOut.multiplyMatrices(mP, mT.makeTranslation(0, 1.95 + nod, 0)));
      this.hairs!.setMatrixAt(i, mOut.multiplyMatrices(mP, mT.makeTranslation(0, 1.98 + nod, 0.03)));
      for (const side of [-1, 1]) {
        let ax = 0;
        let az = side * 0.08;
        if (walking) {
          ax = -step * side * 0.45; // arms swing against the legs
        } else if (fm === 'clap' || (fm === 'dance' && f.style === 0)) {
          ax = 1.25;
          az = -side * (0.12 + Math.abs(Math.sin(ph * (fm === 'clap' ? 3 : 1))) * 0.35);
        } else if (fm === 'dance' && f.style === 1) {
          az = side * (2.5 + Math.sin(ph + side) * 0.35); // both arms up, waving
        } else if (fm === 'dance') {
          az = side > 0 ? 2.7 + Math.sin(ph) * 0.3 : 0.15; // one arm up
        } else {
          az = side * (0.08 + Math.sin(b * 0.3 + f.ph) * 0.03);
        }
        mR.makeRotationFromEuler(ev.set(ax, 0, az));
        mOut.multiplyMatrices(mP, mT.makeTranslation(side * 0.42, 1.55, 0)).multiply(mR).multiply(this.armDown);
        this.arms!.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), mOut);
      }
    });
    for (const m of parts) m.instanceMatrix.needsUpdate = true;
    this.posedAs = this.audience;
  }

  /** Stop the music (city change / new game). */
  dispose(): void {
    if (this.bus) {
      const ac = audioContext();
      if (ac) this.bus.gain.setValueAtTime(0, ac.currentTime);
      this.bus.disconnect();
    }
    this.bus = null;
    this.gate?.dispose();
    if (this.onDebugTime) window.removeEventListener('rainbow-concert-time', this.onDebugTime);
    this.onDebugTime = null;
  }

  /** Debug/QA state. */
  debug(): Record<string, unknown> | null {
    if (!this.plot || !this.booth || !this.gate) return null;
    const r = (v: number) => +v.toFixed(1);
    const gate = this.root.localToWorld(new THREE.Vector3(0, 0, 2.5));
    const inside = this.root.localToWorld(new THREE.Vector3(0, 0, -4));
    const seg = this.seg;
    const front = this.root.localToWorld(new THREE.Vector3(6, 0, -5)); // in front of the right crowd block
    return {
      lineup: this.lineup,
      booth: [r(this.booth.position.x), r(this.booth.position.z)],
      gateOut: [r(gate.x), r(gate.z)],
      insideAt: [r(inside.x), r(inside.z)],
      rot: +this.plot.rot.toFixed(2),
      ...this.gate.debug(),
      cycleT: r(this.c),
      state: this.state,
      songN: seg ? seg.n : null,
      songIdx: seg?.song ? seg.bank : null,
      song: seg?.song?.spec.title ?? null,
      audience: this.audience,
      salesOpen: this.salesOpen(),
      blocksOn: this.blocksOn,
      showEnd: r(this.plan.end),
      plan: this.plan.segs.map((g) => g.kind[0] + g.n + '@' + Math.round(g.start)).join(' '),
      crowdFront: [r(front.x), r(front.z)],
      leaveDur: r(this.leaveDur),
      arriveDur: r(this.arriveDur),
      vol: +this.vol.toFixed(2),
    };
  }
}
