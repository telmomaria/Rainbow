import * as THREE from 'three';
import { audioContext } from './audio';

/**
 * Real weather per city (Open-Meteo, free, no key, CORS) rendered in a child-friendly way:
 * sky/fog/light colours, low drifting clouds, rain/drizzle/snow around the camera, storm flashes,
 * night (deep blue sky, stars, moon) and a quiet rain/wind ambience. No DOM/UI.
 *
 * Time of day follows the city's REAL local clock (UTC offset + sunrise/sunset from Open-Meteo, with an
 * astronomical fallback when offline): `daylight` goes smoothly 0 (night) → 1 (day) with ~1 h twilight
 * ramps around sunrise/sunset (warm orange-pink tints), recomputed every 30 s while the game runs.
 *
 * Testing: `?weather=<kind>` forces a weather state (source 'forced'); `?hour=21.5` forces the local clock
 * (fractional hour, frozen). Legacy `&night=1` / `&night=0` = hour 23 / 13 when `?hour` is absent.
 */

export type WeatherKind = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface WeatherState {
  kind: WeatherKind;
  night: boolean;
  tempC: number;
  /** Wind speed at 10 m, km/h. */
  wind: number;
  source: 'live' | 'cache' | 'default' | 'forced';
}

export interface WeatherLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

const KINDS: WeatherKind[] = ['clear', 'partly', 'overcast', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

/** Coordinates for the city names in cities.ts. 'Portugal' = Lisboa for now. */
const COORDS: Record<string, [number, number]> = {
  Portugal: [38.72, -9.14],
  Lisboa: [38.72, -9.14],
  Roma: [41.9, 12.5],
  Madrid: [40.42, -3.7],
  Londres: [51.51, -0.13],
  Paris: [48.86, 2.35],
  'Varsóvia': [52.23, 21.01],
  Vilnius: [54.69, 25.28],
  Moscovo: [55.76, 37.62],
  Pequim: [39.9, 116.4],
  'Rio de Janeiro': [-22.91, -43.17],
  'Cidade do México': [19.43, -99.13],
  Reiquiavique: [64.15, -21.94],
  Nuuk: [64.18, -51.72],
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const TRANSITION_S = 2;

/** Raw values we keep from Open-Meteo (also what goes into the localStorage cache). */
interface Reading {
  code: number;
  isDay: boolean;
  tempC: number;
  cloud: number; // %
  wind: number; // km/h
  windDir: number; // degrees, meteorological (where it blows FROM)
  precip: number; // mm
  /** City clock: seconds east of UTC (from Open-Meteo, DST-aware). Missing in old caches. */
  utcOffset?: number;
  /** Local sunrise/sunset as fractional hours (0..24). Missing in old caches. */
  sunrise?: number;
  sunset?: number;
}

const DEFAULT_READING: Reading = { code: 0, isDay: true, tempC: 18, cloud: 10, wind: 8, windDir: 250, precip: 0 };

/** Fallback standard UTC offsets (hours) until live data arrives. Live data (DST-aware) wins. */
const TZ_FALLBACK: Record<string, number> = {
  Portugal: 0, Lisboa: 0, Roma: 1, Madrid: 1, Londres: 0, Paris: 1, 'Varsóvia': 1, Vilnius: 2, Moscovo: 3,
  Pequim: 8, 'Rio de Janeiro': -3, 'Cidade do México': -6, Reiquiavique: 0, Nuuk: -2,
};

/** "2026-11-11T07:14" → 7.233 (local hours). */
function isoHour(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const m = /T(\d{1,2}):(\d{2})/.exec(s);
  return m ? Number(m[1]) + Number(m[2]) / 60 : undefined;
}

/** Approximate local sunrise/sunset (hours) from latitude/longitude/UTC offset (±15 min is plenty here). */
function solarTimes(lat: number, lon: number, offsetH: number, nowMs: number): [number, number] {
  const start = Date.UTC(new Date(nowMs).getUTCFullYear(), 0, 0);
  const day = (nowMs - start) / 86400000;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const phi = (lat * Math.PI) / 180;
  const cosW = (Math.sin((-0.833 * Math.PI) / 180) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  const noon = 12 - lon / 15 + offsetH;
  if (cosW >= 1) return [noon, noon]; // polar night
  if (cosW <= -1) return [noon - 11.99, noon + 11.99]; // midnight sun
  const half = (Math.acos(cosW) * 180) / Math.PI / 15;
  return [noon - half, noon + half];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const mod24 = (h: number) => ((h % 24) + 24) % 24;

/**
 * 0 at night → 1 in full day. Ramps from 45 min before sunrise to 1 h after it (mirrored at sunset),
 * so at the sunrise/sunset moment itself daylight ≈ 0.4.
 */
export function daylightAt(hour: number, sunrise: number, sunset: number): number {
  const len = sunset - sunrise;
  if (len < 0.05) return 0;
  if (len > 23.9) return 1;
  let h = mod24(hour - sunrise); // hours since sunrise, 0..24
  if (h > 12 + len / 2) h -= 24; // the hours just before sunrise count as negative
  const up = smooth(-0.75, 1, h);
  const down = 1 - smooth(len - 1, len + 0.75, h);
  return Math.max(0, Math.min(up, down));
}

/** WMO weather code → our kinds. */
export function kindFromCode(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'partly';
}

// ---------------------------------------------------------------- fetching + cache

const cacheKey = (city: string) => `rainbow.weather.${city}`;

function readCache(city: string): { t: number; r: Reading } | null {
  try {
    const raw = localStorage.getItem(cacheKey(city));
    if (!raw) return null;
    const v = JSON.parse(raw) as { t: number; r: Reading };
    return typeof v?.t === 'number' && typeof v.r?.code === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeCache(city: string, r: Reading): void {
  try {
    localStorage.setItem(cacheKey(city), JSON.stringify({ t: Date.now(), r }));
  } catch {
    /* storage full/blocked: no cache, no problem */
  }
}

async function fetchReading(lat: number, lon: number): Promise<Reading> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation' +
    '&daily=sunrise,sunset&forecast_days=1&timezone=auto';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = (await res.json()) as {
      current?: Record<string, number>;
      utc_offset_seconds?: number;
      daily?: { sunrise?: string[]; sunset?: string[] };
    };
    const c = json.current;
    if (!c || typeof c.weather_code !== 'number') throw new Error('open-meteo: no current data');
    return {
      code: c.weather_code,
      isDay: c.is_day !== 0,
      tempC: c.temperature_2m ?? DEFAULT_READING.tempC,
      cloud: c.cloud_cover ?? 50,
      wind: c.wind_speed_10m ?? 0,
      windDir: c.wind_direction_10m ?? DEFAULT_READING.windDir,
      precip: c.precipitation ?? 0,
      utcOffset: typeof json.utc_offset_seconds === 'number' ? json.utc_offset_seconds : undefined,
      sunrise: isoHour(json.daily?.sunrise?.[0]),
      sunset: isoHour(json.daily?.sunset?.[0]),
    };
  } finally {
    clearTimeout(timer);
  }
}

function forcedFromUrl(): { kind: WeatherKind } | null {
  try {
    const k = new URLSearchParams(window.location.search).get('weather') as WeatherKind | null;
    return k && KINDS.includes(k) ? { kind: k } : null;
  } catch {
    return null;
  }
}

/** `?hour=21.5` (or legacy `?night=1|0`) → frozen local hour; null = follow the real clock. */
function forcedHourFromUrl(): number | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const h = q.get('hour');
    if (h !== null && h.trim() !== '' && Number.isFinite(Number(h))) return mod24(Number(h));
    const n = q.get('night');
    if (n === '1' || n === 'true') return 23;
    if (n === '0' || n === 'false') return 13;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the look (what gets interpolated)

interface Look {
  sky: THREE.Color;
  fog: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sunColor: THREE.Color;
  cloudColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiI: number;
  sunI: number;
  night: number;
  clouds: number; // 0..1 share of the cloud pool shown
  cloudScale: number;
  rain: number; // 0..1 share of the rain pool
  snow: number; // 0..1 share of the snow pool
  stars: number;
  moon: number;
}

const NUM_KEYS = ['fogNear', 'fogFar', 'hemiI', 'sunI', 'night', 'clouds', 'cloudScale', 'rain', 'snow', 'stars', 'moon'] as const;
const COL_KEYS = ['sky', 'fog', 'hemiSky', 'hemiGround', 'sunColor', 'cloudColor'] as const;

function newLook(): Look {
  return {
    sky: new THREE.Color(), fog: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
    sunColor: new THREE.Color(), cloudColor: new THREE.Color(),
    fogNear: 60, fogFar: 160, hemiI: 1.6, sunI: 2.2, night: 0, clouds: 0, cloudScale: 1, rain: 0, snow: 0, stars: 0, moon: 0,
  };
}

function copyLook(dst: Look, src: Look): void {
  for (const k of NUM_KEYS) dst[k] = src[k];
  for (const k of COL_KEYS) dst[k].copy(src[k]);
}

function lerpLook(dst: Look, a: Look, b: Look, t: number): void {
  for (const k of NUM_KEYS) dst[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of COL_KEYS) dst[k].lerpColors(a[k], b[k], t);
}

/** Per-kind daytime settings. `sky: null` = use the city's own sky colour. */
const DAY: Record<WeatherKind, {
  sky: number | null; skyMix?: number; fog?: number; near: number; far: number; hemi: number; hemiCol: number;
  sun: number; clouds: number; cloudScale: number; cloudCol: number; rain: number; snow: number;
}> = {
  clear: { sky: null, near: 60, far: 160, hemi: 1.6, hemiCol: 0xffffff, sun: 2.2, clouds: 0.2, cloudScale: 1, cloudCol: 0xffffff, rain: 0, snow: 0 },
  partly: { sky: 0xe4edf5, skyMix: 0.2, near: 55, far: 150, hemi: 1.55, hemiCol: 0xffffff, sun: 1.8, clouds: 0.6, cloudScale: 1.1, cloudCol: 0xffffff, rain: 0, snow: 0 },
  overcast: { sky: 0xaeb8c4, near: 40, far: 135, hemi: 1.6, hemiCol: 0xeef2f8, sun: 0.6, clouds: 1, cloudScale: 1.5, cloudCol: 0xd0d5dc, rain: 0, snow: 0 },
  fog: { sky: 0xcfd5db, near: 3, far: 55, hemi: 1.55, hemiCol: 0xf2f4f6, sun: 0.5, clouds: 0.3, cloudScale: 1.3, cloudCol: 0xe2e6ea, rain: 0, snow: 0 },
  drizzle: { sky: 0xa3aebb, near: 30, far: 120, hemi: 1.45, hemiCol: 0xe8edf5, sun: 0.5, clouds: 0.9, cloudScale: 1.4, cloudCol: 0xb8bfc9, rain: 0.35, snow: 0 },
  rain: { sky: 0x8d99a9, near: 25, far: 105, hemi: 1.35, hemiCol: 0xe2e8f2, sun: 0.35, clouds: 1, cloudScale: 1.6, cloudCol: 0x9fa8b4, rain: 0.8, snow: 0 },
  snow: { sky: 0xd5dde7, near: 22, far: 110, hemi: 1.65, hemiCol: 0xf4f7ff, sun: 0.6, clouds: 0.9, cloudScale: 1.5, cloudCol: 0xeef1f5, rain: 0, snow: 1 },
  storm: { sky: 0x5f6a7e, fog: 0x646f82, near: 20, far: 95, hemi: 1.1, hemiCol: 0xd8deea, sun: 0.25, clouds: 1, cloudScale: 1.8, cloudCol: 0x707889, rain: 1, snow: 0 },
};

const NIGHT_SKY = new THREE.Color(0x1f2f6b);
// twilight tints (dawn a bit pinker, dusk a bit more orange)
const DAWN_SKY = new THREE.Color(0xff9db0);
const DUSK_SKY = new THREE.Color(0xff8a45);
const TWILIGHT_FOG = new THREE.Color(0xffa877);
const TWILIGHT_SUN = new THREE.Color(0xff9447);
const TWILIGHT_HEMI = new THREE.Color(0xffc7a6);
const TWILIGHT_CLOUD = new THREE.Color(0xffb59a);
/** How much of the warm twilight tint shows through each kind of weather. */
const WARMTH: Record<WeatherKind, number> = {
  clear: 1, partly: 0.85, overcast: 0.35, fog: 0.3, drizzle: 0.3, rain: 0.22, snow: 0.4, storm: 0.12,
};
const NIGHT_FOG = new THREE.Color(0x283b75);
const NIGHT_HEMI = new THREE.Color(0xa3b5ff);
const NIGHT_GROUND = new THREE.Color(0x34406a);
const MOON_COLOR = new THREE.Color(0xc9d6ff);
const WHITE = new THREE.Color(0xffffff);
const FLASH_COLOR = new THREE.Color(0xeef2ff);

// ---------------------------------------------------------------- ambient audio (one shared graph per AudioContext)

interface Ambient {
  ctx: AudioContext;
  noise: AudioBuffer;
  rain: GainNode;
  wind: GainNode;
  windFilter: BiquadFilterNode;
  rainTarget: number;
  windTarget: number;
}
let ambient: Ambient | null = null;
let tabHidden = typeof document !== 'undefined' && document.hidden;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    tabHidden = document.hidden;
  });
}

function ensureAmbient(): Ambient | null {
  const ctx = audioContext();
  if (!ctx) return null;
  if (ambient && ambient.ctx === ctx) return ambient;
  const len = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  // rain: hissy band of noise
  const rainSrc = ctx.createBufferSource();
  rainSrc.buffer = noise;
  rainSrc.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 700;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  const rain = ctx.createGain();
  rain.gain.value = 0;
  rainSrc.connect(hp).connect(lp).connect(rain).connect(ctx.destination);
  rainSrc.start();

  // wind: low band of noise whose centre slowly wanders (whoosh)
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = noise;
  windSrc.loop = true;
  windSrc.playbackRate.value = 0.7;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 380;
  windFilter.Q.value = 1.2;
  const wind = ctx.createGain();
  wind.gain.value = 0;
  windSrc.connect(windFilter).connect(wind).connect(ctx.destination);
  windSrc.start(0, 0.9);

  ambient = { ctx, noise, rain, wind, windFilter, rainTarget: -1, windTarget: -1 };
  return ambient;
}

function thunder(delay: number, strength: number): void {
  const a = ensureAmbient();
  if (!a || tabHidden) return;
  const { ctx } = a;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = a.noise;
  src.playbackRate.value = 0.35;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35 * strength, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.12 * strength, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t, Math.random());
  src.stop(t + 3.1);
}

// ---------------------------------------------------------------- textures

function softDot(size: number, inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moonTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
  glow.addColorStop(0, 'rgba(255,248,220,0.55)');
  glow.addColorStop(1, 'rgba(255,248,220,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#fff6d6';
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(220,210,180,0.6)'; // a couple of friendly craters
  for (const [x, y, r] of [[-0.06, -0.05, 0.045], [0.07, 0.04, 0.03], [-0.02, 0.09, 0.025]]) {
    g.beginPath();
    g.arc(s / 2 + x * s, s / 2 + y * s, r * s, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- the system

const CLOUDS = 26;
const PUFFS = 6;
const CLOUD_AREA = 130; // half-size of the square of sky (around the camera) clouds wrap in
const RAIN_MAX = 1400;
const SNOW_MAX = 1000;
const PART_HALF = 20; // half-size (x/z) of the particle box around the camera
const PART_BELOW = 8;
const PART_HEIGHT = 24;
const STARS = 260;
const SKY_R = 300; // stars/moon distance (camera far plane is 400)
const NIGHT_SUN_DIR = new THREE.Vector3(-0.62, 0.42, -0.66).normalize();
const CLOCK_EVERY_S = 30;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const DOWN = new THREE.Vector3(0, -1, 0);
const ORIGIN = new THREE.Vector3();
const wrap = (v: number, h: number) => ((((v + h) % (2 * h)) + 2 * h) % (2 * h)) - h;

export class Weather {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private baseSky = new THREE.Color(0x8fd3ff);
  private baseGround = new THREE.Color(0x7fbf6a);
  private daySunDir = new THREE.Vector3(30, 50, 20).normalize();
  private sunDist = 62;
  private bg = new THREE.Color();
  private fog = new THREE.Fog(0xffffff, 60, 160);

  private st: WeatherState = { kind: 'clear', night: false, tempC: DEFAULT_READING.tempC, wind: DEFAULT_READING.wind, source: 'default' };
  private reading: Reading = { ...DEFAULT_READING };
  private readonly forced = forcedFromUrl();
  private readonly forcedHour = forcedHourFromUrl();
  private token = 0;

  // --- local clock / time of day
  private cityName = 'Portugal';
  private utcOffset = 0; // seconds east of UTC
  private sunriseH = 7;
  private sunsetH = 19;
  private hourNow = 12;
  private day = 1; // daylight 0..1
  private clockT = 0;
  private dayLook = newLook();
  private nightLook = newLook();
  private skyMixCol = new THREE.Color();
  private sunPathDir = new THREE.Vector3();

  private from = newLook();
  private to = newLook();
  private cur = newLook();
  private t = 1; // transition progress 0..1

  private time = 0;
  private flash = 0;
  private flashQueue: number[] = []; // seconds until extra flicker(s)
  private nextStrike = 6;

  private root = new THREE.Group();
  private cloudMesh: THREE.InstancedMesh;
  private cloudMat: THREE.MeshLambertMaterial;
  private cloudPos: Float32Array; // x, y, z per cloud
  private cloudVar: Float32Array; // scale variation per cloud
  private puffs: Float32Array; // dx, dy, dz, s per puff
  private rainMesh: THREE.InstancedMesh;
  private rainMat: THREE.MeshBasicMaterial;
  private rainPos: Float32Array;
  private snowPts: THREE.Points;
  private snowMat: THREE.PointsMaterial;
  private snowBase: Float32Array;
  private snowAttr: THREE.BufferAttribute;
  private starPts: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private moon: THREE.Sprite;
  private moonMat: THREE.SpriteMaterial;

  private tmpM = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private tmpF = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private center = new THREE.Vector3();

  constructor(scene: THREE.Scene, lights: WeatherLights, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.root.name = 'weather';

    // --- low clouds: one instanced mesh of puffs
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.cloudMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.cloudMat, CLOUDS * PUFFS);
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cloudPos = new Float32Array(CLOUDS * 3);
    this.cloudVar = new Float32Array(CLOUDS);
    this.puffs = new Float32Array(CLOUDS * PUFFS * 4);
    for (let i = 0; i < CLOUDS; i++) {
      this.cloudPos[i * 3] = (Math.random() - 0.5) * 2 * CLOUD_AREA;
      this.cloudPos[i * 3 + 1] = 25 + Math.random() * 10;
      this.cloudPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * CLOUD_AREA;
      this.cloudVar[i] = 0.75 + Math.random() * 0.6;
      for (let k = 0; k < PUFFS; k++) {
        const p = (i * PUFFS + k) * 4;
        this.puffs[p] = (k - (PUFFS - 1) / 2) * 3.4 + (Math.random() - 0.5) * 1.5;
        this.puffs[p + 1] = Math.random() * 1.6 - (Math.abs(k - (PUFFS - 1) / 2) > 1.5 ? 0.8 : 0);
        this.puffs[p + 2] = (Math.random() - 0.5) * 4;
        this.puffs[p + 3] = (k === 2 || k === 3 ? 4.6 : 3.2) + Math.random() * 1.4;
      }
    }
    this.root.add(this.cloudMesh);

    // --- rain streaks
    this.rainMat = new THREE.MeshBasicMaterial({ color: 0xd4e4ff, transparent: true, opacity: 0.55, depthWrite: false });
    this.rainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1, 0.035), this.rainMat, RAIN_MAX);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.count = 0;
    this.rainPos = new Float32Array(RAIN_MAX * 3);
    for (let i = 0; i < RAIN_MAX; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 2 * PART_HALF;
      this.rainPos[i * 3 + 1] = Math.random() * PART_HEIGHT - PART_BELOW;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * PART_HALF;
    }
    this.root.add(this.rainMesh);

    // --- snow flakes (x, y, z, phase per flake)
    this.snowBase = new Float32Array(SNOW_MAX * 4);
    for (let i = 0; i < SNOW_MAX; i++) {
      this.snowBase[i * 4] = (Math.random() - 0.5) * 2 * PART_HALF;
      this.snowBase[i * 4 + 1] = Math.random() * PART_HEIGHT - PART_BELOW;
      this.snowBase[i * 4 + 2] = (Math.random() - 0.5) * 2 * PART_HALF;
      this.snowBase[i * 4 + 3] = Math.random() * Math.PI * 2;
    }
    const snowGeo = new THREE.BufferGeometry();
    this.snowAttr = new THREE.BufferAttribute(new Float32Array(SNOW_MAX * 3), 3);
    this.snowAttr.setUsage(THREE.DynamicDrawUsage);
    snowGeo.setAttribute('position', this.snowAttr);
    snowGeo.setDrawRange(0, 0);
    this.snowMat = new THREE.PointsMaterial({
      size: 0.28, map: softDot(32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      transparent: true, depthWrite: false, color: 0xffffff,
    });
    this.snowPts = new THREE.Points(snowGeo, this.snowMat);
    this.snowPts.frustumCulled = false;
    this.root.add(this.snowPts);

    // --- stars on the upper sky dome (positions relative to the camera)
    const starArr = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const az = Math.random() * Math.PI * 2;
      const el = 0.12 + Math.asin(Math.random()) * 0.9; // more stars low-ish, none at the horizon line
      starArr[i * 3] = Math.cos(el) * Math.cos(az) * SKY_R;
      starArr[i * 3 + 1] = Math.sin(el) * SKY_R;
      starArr[i * 3 + 2] = Math.cos(el) * Math.sin(az) * SKY_R;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starArr, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 3, sizeAttenuation: false, map: softDot(16, 'rgba(255,255,240,1)', 'rgba(255,255,240,0)'),
      transparent: true, depthWrite: false, fog: false, opacity: 0,
    });
    this.starPts = new THREE.Points(starGeo, this.starMat);
    this.starPts.frustumCulled = false;
    this.starPts.renderOrder = -2;
    this.root.add(this.starPts);

    // --- moon (a friendly glowing disc)
    this.moonMat = new THREE.SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.setScalar(70);
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -1;
    this.root.add(this.moon);

    this.updateClock();
    this.setLights(lights);
    if (this.forced) this.setState({ ...this.forcedReading() }, 'forced', true);
    else this.setState({ ...DEFAULT_READING }, 'default', true);
  }

  /** Current weather (read-only snapshot). */
  get state(): Readonly<WeatherState> {
    return this.st;
  }

  /** 0 = night … 1 = full day, following the city's local clock (smooth twilight ramps). */
  get daylight(): number {
    return this.day;
  }

  /** The city's local time, fractional hours 0..24 (frozen when `?hour=` is set). */
  get localHour(): number {
    return this.hourNow;
  }

  /** Call again after the world was rebuilt (new lights, new city sky). */
  setLights(lights: WeatherLights): void {
    // only read the "base" values from lights we haven't already tinted
    if (lights.hemi !== this.hemi) this.baseGround.copy(lights.hemi.groundColor);
    if (lights.sun !== this.sun) {
      const d = this.tmpV.copy(lights.sun.position).sub(lights.sun.target.position);
      if (d.lengthSq() > 1e-6) {
        this.sunDist = d.length();
        this.daySunDir.copy(d).normalize();
      }
    }
    this.hemi = lights.hemi;
    this.sun = lights.sun;
    this.updateSunPath();
    this.captureSceneBase();
    this.computeTarget();
    this.ensureAttached();
  }

  /** Fetch (or reuse) the real weather of a city and transition to it. */
  async setCity(cityName: string): Promise<void> {
    const my = ++this.token;
    this.cityName = cityName;
    this.captureSceneBase();
    if (this.forced) {
      this.setState(this.forcedReading(), 'forced', true);
      return;
    }
    const cached = readCache(cityName);
    if (cached && Date.now() - cached.t < CACHE_TTL_MS) {
      this.setState(cached.r, 'cache', true);
      return;
    }
    // quick default right away (stale cache beats "clear day"), then fade to the live state
    if (cached) this.setState(cached.r, 'cache', true);
    else this.setState({ ...DEFAULT_READING }, 'default', true);

    const coords = COORDS[cityName];
    if (!coords) return;
    try {
      const r = await fetchReading(coords[0], coords[1]);
      writeCache(cityName, r);
      if (my !== this.token) return; // another city was requested meanwhile
      this.setState(r, 'live', false);
    } catch {
      /* offline/timeout: keep the cached/default state */
    }
  }

  update(dt: number): void {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    this.ensureAttached();
    this.captureSceneBase();
    this.clockT += dt;
    if (this.clockT >= CLOCK_EVERY_S) {
      this.clockT = 0;
      if (this.updateClock()) this.computeTarget();
    }

    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / TRANSITION_S);
      const e = this.t * this.t * (3 - 2 * this.t);
      lerpLook(this.cur, this.from, this.to, e);
    } else {
      copyLook(this.cur, this.to);
    }
    const L = this.cur;

    // --- lightning
    if (this.st.kind === 'storm' && this.t > 0.5) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 5 + Math.random() * 8;
        this.flash = 1;
        this.flashQueue = Math.random() < 0.6 ? [0.12 + Math.random() * 0.1] : [];
        const strength = 0.6 + Math.random() * 0.4;
        thunder(0.5 + Math.random() * 1.5, strength);
      }
    }
    for (let i = 0; i < this.flashQueue.length; i++) {
      this.flashQueue[i] -= dt;
      if (this.flashQueue[i] <= 0) {
        this.flash = Math.max(this.flash, 0.75);
        this.flashQueue.splice(i--, 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    const f = this.flash;

    // --- sky, fog, lights
    this.bg.copy(L.sky).lerp(FLASH_COLOR, f * 0.55);
    this.scene.background = this.bg;
    this.fog.color.copy(L.fog).lerp(FLASH_COLOR, f * 0.35);
    this.fog.near = L.fogNear;
    this.fog.far = L.fogFar;
    this.scene.fog = this.fog;

    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI + f * 2.2;
    this.sun.color.copy(L.sunColor);
    this.sun.intensity = L.sunI + f * 1.5;
    const dir = this.tmpV.copy(this.sunPathDir).lerp(NIGHT_SUN_DIR, L.night).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, this.sunDist);

    // --- where the particles live: a box around a point a bit ahead of the camera
    this.camera.getWorldPosition(this.center);
    const camY = this.center.y;
    this.camera.getWorldDirection(this.tmpF);
    this.tmpF.y = 0;
    if (this.tmpF.lengthSq() > 1e-4) this.center.addScaledVector(this.tmpF.normalize(), 10);

    // wind vector (where it blows TO), m/s
    const toRad = ((this.reading.windDir + 180) * Math.PI) / 180;
    const windMs = this.st.wind / 3.6;
    const wx = Math.sin(toRad) * windMs;
    const wz = -Math.cos(toRad) * windMs;

    this.updateClouds(dt, L, wx, wz);
    this.updateRain(dt, L, camY, wx, wz);
    this.updateSnow(dt, L, camY, wx, wz);

    // --- night sky
    this.starPts.position.copy(this.center);
    this.starMat.opacity = L.stars;
    this.starPts.visible = L.stars > 0.01;
    this.moon.position.copy(this.center).addScaledVector(NIGHT_SUN_DIR, SKY_R * 0.9);
    this.moonMat.opacity = L.moon;
    this.moon.visible = L.moon > 0.01;

    this.updateAudio(L);
  }

  /** Remove everything this system added and silence its sounds. */
  dispose(): void {
    this.root.removeFromParent();
    if (ambient) {
      const now = ambient.ctx.currentTime;
      ambient.rain.gain.setTargetAtTime(0, now, 0.3);
      ambient.wind.gain.setTargetAtTime(0, now, 0.3);
      ambient.rainTarget = ambient.windTarget = 0;
    }
  }

  // ------------------------------------------------------------ internals

  private forcedReading(): Reading {
    const k = this.forced!.kind;
    const code = { clear: 0, partly: 2, overcast: 3, fog: 45, drizzle: 53, rain: 63, snow: 73, storm: 95 }[k];
    return {
      code,
      isDay: true,
      tempC: k === 'snow' ? -2 : k === 'clear' ? 22 : 12,
      cloud: { clear: 5, partly: 45, overcast: 100, fog: 100, drizzle: 90, rain: 100, snow: 95, storm: 100 }[k],
      wind: k === 'storm' ? 45 : k === 'rain' ? 22 : 10,
      windDir: 250,
      precip: k === 'rain' ? 2 : k === 'storm' ? 6 : k === 'drizzle' ? 0.2 : k === 'snow' ? 1 : 0,
    };
  }

  private setState(r: Reading, source: WeatherState['source'], snap: boolean): void {
    this.reading = { ...r };
    this.st = { kind: kindFromCode(r.code), night: false, tempC: r.tempC, wind: r.wind, source };
    this.updateClock();
    if (!snap) copyLook(this.from, this.cur);
    this.computeTarget();
    if (snap) {
      copyLook(this.from, this.to);
      copyLook(this.cur, this.to);
      this.t = 1;
    } else {
      this.t = 0;
    }
  }

  /**
   * Recomputes the city's local hour and `daylight` from the real clock (or `?hour=`).
   * Returns true when daylight changed (→ rebuild the target look).
   */
  private updateClock(): boolean {
    const r = this.reading;
    const coords = COORDS[this.cityName] ?? COORDS.Portugal;
    const fallbackOffsetH = TZ_FALLBACK[this.cityName] ?? Math.round(coords[1] / 15);
    this.utcOffset = typeof r.utcOffset === 'number' ? r.utcOffset : fallbackOffsetH * 3600;
    const now = Date.now();
    if (typeof r.sunrise === 'number' && typeof r.sunset === 'number' && r.sunset > r.sunrise) {
      this.sunriseH = r.sunrise;
      this.sunsetH = r.sunset;
    } else {
      [this.sunriseH, this.sunsetH] = solarTimes(coords[0], coords[1], this.utcOffset / 3600, now);
    }
    this.hourNow = this.forcedHour ?? mod24((now / 1000 + this.utcOffset) / 3600);
    const prev = this.day;
    this.day = daylightAt(this.hourNow, this.sunriseH, this.sunsetH);
    this.st.night = this.day < 0.3;
    this.updateSunPath();
    return Math.abs(this.day - prev) > 1e-5;
  }

  /** Sun direction over the day: low on one side after sunrise, the world's own sun at solar noon, low again at sunset. */
  private updateSunPath(): void {
    const len = Math.max(0.5, this.sunsetH - this.sunriseH);
    const p = Math.min(Math.max((this.hourNow - this.sunriseH) / len, 0), 1); // 0 sunrise … 1 sunset
    const d = this.sunPathDir.copy(this.daySunDir).applyAxisAngle(Y_AXIS, (p - 0.5) * 1.9); // ±~55° azimuth swing
    const noonEl = Math.asin(Math.min(1, Math.max(0, this.daySunDir.y)));
    const el = Math.max(0.32, noonEl * Math.sin(Math.PI * p)); // never below ~18° (shadows stay sane)
    const horiz = Math.hypot(d.x, d.z) || 1;
    d.set((d.x / horiz) * Math.cos(el), Math.sin(el), (d.z / horiz) * Math.cos(el));
  }

  /** Builds `to` from the current weather, the time of day and the city's base colours. */
  private computeTarget(): void {
    this.buildLook(this.dayLook, false);
    this.buildLook(this.nightLook, true);
    const d = this.day;
    const L = this.to;
    lerpLook(L, this.nightLook, this.dayLook, d);
    // stars and moon fade out faster than the sky brightens
    const nd = (1 - d) * (1 - d);
    L.stars = this.nightLook.stars * nd;
    L.moon = this.nightLook.moon * nd;
    L.night = 1 - d;
    // warm twilight tint, strongest around daylight ≈ 0.45 (the sunrise/sunset moment)
    const w = Math.pow(Math.max(0, 1 - Math.abs(d - 0.45) / 0.45), 1.3) * WARMTH[this.st.kind];
    if (w > 0.001) {
      L.sky.lerp(this.hourNow < 12 ? DAWN_SKY : DUSK_SKY, Math.min(1, Math.sqrt(w) * 0.8));
      L.fog.lerp(TWILIGHT_FOG, w * 0.8);
      L.sunColor.lerp(TWILIGHT_SUN, Math.min(1, w * 1.1));
      L.hemiSky.lerp(TWILIGHT_HEMI, w * 0.5);
      L.cloudColor.lerp(TWILIGHT_CLOUD, w * 0.45);
    }
  }

  /** One weather look for full day (`night` false) or full night (true). */
  private buildLook(L: Look, night: boolean): void {
    const { kind } = this.st;
    const p = DAY[kind];
    const r = this.reading;

    if (p.sky === null) L.sky.copy(this.baseSky);
    else if (p.skyMix !== undefined) L.sky.copy(this.baseSky).lerp(this.skyMixCol.setHex(p.sky), p.skyMix);
    else L.sky.setHex(p.sky);
    if (p.fog !== undefined) L.fog.setHex(p.fog);
    else L.fog.copy(L.sky);
    L.fogNear = p.near;
    L.fogFar = p.far;
    L.hemiSky.setHex(p.hemiCol);
    L.hemiGround.copy(this.baseGround);
    L.hemiI = p.hemi;
    L.sunColor.copy(WHITE);
    L.sunI = p.sun;
    L.cloudColor.setHex(p.cloudCol);
    L.cloudScale = p.cloudScale;
    // cloud amount follows the real cloud cover when it is meaningful
    const cover = Math.min(Math.max(r.cloud / 100, 0), 1);
    L.clouds =
      kind === 'clear' ? Math.min(0.25, cover) : kind === 'partly' ? 0.3 + cover * 0.6 : Math.max(p.clouds * 0.8, cover * p.clouds);
    // rain amount follows precipitation a little
    L.rain = p.rain === 0 ? 0 : kind === 'drizzle' ? p.rain : Math.min(1, p.rain * (0.75 + Math.min(r.precip, 5) / 10));
    L.snow = p.snow === 0 ? 0 : Math.min(1, 0.6 + Math.min(r.precip, 4) / 10);
    L.night = night ? 1 : 0;
    L.stars = 0;
    L.moon = 0;

    if (night) {
      const clearish = kind === 'clear' ? 1 : kind === 'partly' ? 0.65 : 0;
      L.sky.lerp(NIGHT_SKY, kind === 'snow' || kind === 'fog' ? 0.72 : 0.82);
      L.fog.lerp(NIGHT_FOG, kind === 'snow' || kind === 'fog' ? 0.7 : 0.8);
      L.fogFar *= 0.92;
      L.hemiSky.copy(NIGHT_HEMI);
      L.hemiGround.lerp(NIGHT_GROUND, 0.7);
      L.hemiI = Math.max(0.85, p.hemi * 0.62);
      L.sunColor.copy(MOON_COLOR);
      L.sunI = 0.35 + 0.5 * clearish;
      L.cloudColor.multiplyScalar(0.42).lerp(NIGHT_FOG, 0.25);
      L.stars = clearish;
      L.moon = clearish;
    }
  }

  /** Remember the city's own sky colour whenever the world (re)set the scene background. */
  private captureSceneBase(): void {
    const bg = this.scene.background;
    if (bg instanceof THREE.Color && bg !== this.bg) {
      this.baseSky.copy(bg);
      this.computeTarget();
      if (this.t >= 1) copyLook(this.cur, this.to);
    }
  }

  private ensureAttached(): void {
    if (this.root.parent !== this.scene) this.scene.add(this.root);
  }

  private updateClouds(dt: number, L: Look, wx: number, wz: number): void {
    this.cloudMat.color.copy(L.cloudColor);
    const drift = 0.5; // clouds drift slower than the real wind so it reads as gentle movement
    const dx = (wx * drift + 0.4) * dt;
    const dz = wz * drift * dt;
    const arr = this.cloudMesh.instanceMatrix.array as Float32Array;
    const shown = L.clouds * CLOUDS;
    const m = this.tmpM;
    for (let i = 0; i < CLOUDS; i++) {
      const ci = i * 3;
      this.cloudPos[ci] += dx;
      this.cloudPos[ci + 2] += dz;
      const cx = this.center.x + wrap(this.cloudPos[ci] - this.center.x, CLOUD_AREA);
      const cz = this.center.z + wrap(this.cloudPos[ci + 2] - this.center.z, CLOUD_AREA);
      this.cloudPos[ci] = cx;
      this.cloudPos[ci + 2] = cz;
      // fade in/out by scale; also shrink near the wrap edge so clouds never pop
      const edge = Math.min(1, (CLOUD_AREA - Math.max(Math.abs(cx - this.center.x), Math.abs(cz - this.center.z))) / 25);
      const vis = Math.min(Math.max(shown - i, 0), 1) * Math.max(edge, 0);
      const s = this.cloudVar[i] * L.cloudScale * vis;
      for (let k = 0; k < PUFFS; k++) {
        const pi = i * PUFFS + k;
        const p = pi * 4;
        const ps = this.puffs[p + 3] * s;
        m.makeScale(ps, ps * 0.62, ps);
        m.setPosition(cx + this.puffs[p] * s, this.cloudPos[ci + 1] + this.puffs[p + 1] * s, cz + this.puffs[p + 2] * s);
        m.toArray(arr, pi * 16);
      }
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    this.cloudMesh.visible = shown > 0.01;
  }

  private updateRain(dt: number, L: Look, camY: number, wx: number, wz: number): void {
    const n = Math.round(L.rain * RAIN_MAX);
    this.rainMesh.count = n;
    this.rainMesh.visible = n > 0;
    if (n === 0) return;
    const kind = this.st.kind;
    const speed = kind === 'drizzle' ? 8 : kind === 'storm' ? 20 : 15;
    const len = kind === 'drizzle' ? 0.45 : kind === 'storm' ? 1.25 : 0.95;
    this.rainMat.opacity = kind === 'drizzle' ? 0.45 : 0.55;
    this.rainMat.color.setHex(this.st.night ? 0x9fb2dd : 0xd4e4ff);
    // drops are blown sideways a bit; streaks tilt to match their velocity
    const [hx, hz] = sideways(wx, wz, 0.35, 6);
    const v = this.tmpV.set(hx, -speed, hz);
    this.tmpQ.setFromUnitVectors(DOWN, this.tmpF.copy(v).normalize());
    const e = this.tmpM.compose(ORIGIN, this.tmpQ, this.tmpS.set(1, len, 1)).elements;
    const arr = this.rainMesh.instanceMatrix.array as Float32Array;
    const top = camY + PART_HEIGHT - PART_BELOW;
    const bottom = camY - PART_BELOW;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let x = this.rainPos[j] + hx * dt;
      let y = this.rainPos[j + 1] + v.y * dt;
      let z = this.rainPos[j + 2] + hz * dt;
      if (y < bottom || y > top + 2) {
        y = top - Math.random() * 2;
        x = this.center.x + (Math.random() - 0.5) * 2 * PART_HALF;
        z = this.center.z + (Math.random() - 0.5) * 2 * PART_HALF;
      }
      x = this.center.x + wrap(x - this.center.x, PART_HALF);
      z = this.center.z + wrap(z - this.center.z, PART_HALF);
      this.rainPos[j] = x;
      this.rainPos[j + 1] = y;
      this.rainPos[j + 2] = z;
      const o = i * 16;
      for (let c = 0; c < 12; c++) arr[o + c] = e[c];
      arr[o + 12] = x;
      arr[o + 13] = y;
      arr[o + 14] = z;
      arr[o + 15] = 1;
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;
  }

  private updateSnow(dt: number, L: Look, camY: number, wx: number, wz: number): void {
    const n = Math.round(L.snow * SNOW_MAX);
    this.snowPts.geometry.setDrawRange(0, n);
    this.snowPts.visible = n > 0;
    if (n === 0) return;
    this.snowMat.color.setHex(this.st.night ? 0xdfe6ff : 0xffffff);
    const fall = 1.3;
    const [hx, hz] = sideways(wx, wz, 0.25, 3);
    const b = this.snowBase;
    const out = this.snowAttr.array as Float32Array;
    const top = camY + PART_HEIGHT - PART_BELOW;
    const bottom = camY - PART_BELOW;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      let x = b[j] + hx * dt;
      let y = b[j + 1] - fall * dt * (0.8 + (b[j + 3] % 1) * 0.4);
      let z = b[j + 2] + hz * dt;
      if (y < bottom || y > top + 2) {
        y = top - Math.random() * 2;
        x = this.center.x + (Math.random() - 0.5) * 2 * PART_HALF;
        z = this.center.z + (Math.random() - 0.5) * 2 * PART_HALF;
      }
      x = this.center.x + wrap(x - this.center.x, PART_HALF);
      z = this.center.z + wrap(z - this.center.z, PART_HALF);
      b[j] = x;
      b[j + 1] = y;
      b[j + 2] = z;
      const ph = b[j + 3];
      out[i * 3] = x + Math.sin(this.time * 0.9 + ph) * 0.45;
      out[i * 3 + 1] = y;
      out[i * 3 + 2] = z + Math.cos(this.time * 0.7 + ph * 1.3) * 0.45;
    }
    this.snowAttr.needsUpdate = true;
  }

  private updateAudio(L: Look): void {
    const a = ensureAmbient();
    if (!a) return;
    const kind = this.st.kind;
    const rainLevel = kind === 'storm' ? 0.07 : kind === 'rain' ? 0.05 : kind === 'drizzle' ? 0.025 : 0.05;
    const rain = tabHidden ? 0 : Math.min(1, L.rain / 0.8) * rainLevel;
    const wind = tabHidden ? 0 : Math.min(0.045, Math.max(0, (this.st.wind - 22) / 40) * 0.045);
    const now = a.ctx.currentTime;
    if (Math.abs(rain - a.rainTarget) > 0.002) {
      a.rain.gain.setTargetAtTime(rain, now, 0.6);
      a.rainTarget = rain;
    }
    if (Math.abs(wind - a.windTarget) > 0.002) {
      a.wind.gain.setTargetAtTime(wind, now, 0.8);
      a.windTarget = wind;
    }
    if (wind > 0) a.windFilter.frequency.setTargetAtTime(330 + Math.sin(this.time * 0.37) * 120 + Math.sin(this.time * 1.3) * 40, now, 0.3);
  }
}

/** Horizontal particle drift from the wind: `factor` of it, capped at `max` m/s. */
function sideways(wx: number, wz: number, factor: number, max: number): [number, number] {
  const len = Math.hypot(wx, wz) * factor;
  const k = len > max ? max / len : 1;
  return [wx * factor * k, wz * factor * k];
}
