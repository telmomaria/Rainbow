import * as THREE from 'three';
import { CHARACTER_RADIUS, Character } from './character';
import { Input } from './input';
import { PERSON_CLEAR, PERSON_PUSH, SPAWN, createWorld, mulberry32, type Interactable, type Obstacle } from './world';
import { createProps } from './props';
import { Collectibles } from './collectibles';
import { Npcs, type QuestionNpc } from './npcs';
import { loadSave, writeSave } from './save';
import { Hud, askChoice, askQuestion, cameraFlash, createHomeButton, setCompass, setFade, showArrival, showBanner, showCityName, showPhoto, showTravel } from './ui';
import { speak, sfx, spokenLog, taunt, tone, voiceInfo } from './audio';
import { CITIES, COINS_PER_LEVEL, cityAt, cityHas } from './cities';
import { Monsters } from './monsters';
import { Airport, setRunwayActive } from './airport';
import { Flight } from './flight';
import { Launch } from './launch';
import { Spaceport } from './spaceport';
import { UsaLandmarks } from './usa';
import { LANDER, createMoonWorld, inDeepCrater, moonHeight, seedMoonLoot } from './moon';
import { Comets, DizzyStars, HopDust, LanderFood, TimeMachine } from './moonplay';
import { ENERGY_MAX } from './life';
import { Car } from './car';
import { createScooter, noScooter, type Scooter } from './scooter';
import { createBeggar } from './beggar';
import { chooseCharacter, createAvatarButton } from './select';
import { CAT_REWARD, CatTree } from './cattree';
import { bakeryZone, buildItem, createShops } from './shops';
import { Trouble } from './trouble';
import { Traffic } from './traffic';
import { createBusStops } from './busstops';
import { createHospital, type Hospital } from './hospital';
import { Weather } from './weather';
import { StreetLights } from './streetlights';
import type { GameCtx } from './gamectx';
import { DIFFICULTY_FACTOR, RAIN_SOUND_FACTOR, createBag, showIdlePause, type RainSound } from './ui';
import { WanderCat } from './wandercat';
import { Butterflies, noButterflies } from './butterflies';
import { createRabbit, noRabbit, type WanderRabbit } from './rabbit';
import { createParrot, noParrot, type RioParrot } from './parrot';
import { createStreetSinger, noStreetSinger, type StreetSinger } from './streetsinger';
import { createPostman, noPostman, type Postman } from './postman';
import { createLivingStatue, noLivingStatue, type LivingStatue } from './livingstatue';
import { isFree, setNoSpawnZones } from './spawn';
import { Concert } from './concert';
import { Rodeo, asRodeo } from './rodeo';
import { SUNGLASSES_KIND, itemDef } from './items';
import { Pool } from './pool';
import { House, houseColors } from './house';
import { Fair } from './fair';
import { Extras } from './extras';
import { feel } from './bus';
import { createPlaygrounds } from './play';
import { buildPlayground } from './playground';
import { createServices, type ServiceTown } from './services';
import { createLandmarks, landmarksDebug } from './landmarks';
import { setCityLampClearer } from './places';
import { Aurora } from './aurora';
import { SnowPlay } from './snowplay';

// Regista a visita (IP) na Vercel — api/visit.js. Em dev quem regista é o vite.config.js.
if (!import.meta.env.DEV) fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => {});

const WALK_SPEED = 6.5; // m/s
/** On the Moon she walks slower, in big slow hops (Telmo 2026-11-21); martians chase at 2.6 (monsters.ts). */
const MOON_WALK_SPEED = 3.5; // m/s
/** No energy in a city: a touch faster than the creatures (CHASE_SPEED 4.6) so she can still get away (Telmo, 2026-11-22). */
const TIRED_WALK_SPEED = 4.7; // m/s
/** No energy on the Moon: a touch faster than the martians (MARTIAN_CHASE_SPEED 2.6) — Telmo, 2026-11-22. */
const TIRED_MOON_SPEED = 2.7; // m/s
const MOON_HOP_S = 1.0; // one hop (= one step) lasts this long
const MOON_HOP_H = 1.0; // m, top of each hop
const TURN_SPEED = 2.6; // rad/s (arrow keys)
const ARRIVE_DIST = 0.6;
/** `?debug` exposes state on <body data-debug> and accepts teleports, for automated browser checks. */
const DEBUG = new URLSearchParams(location.search).has('debug');
/** Soft aerial camera (tower lookouts + debug). null = normal third-person.
 *  Optional `fromX`/`fromZ`/`lookY` = put the camera at (fromX,h,fromZ) looking at (x,lookY,z). */
type AerialCam = { x: number; z: number; h: number; fromX?: number; fromZ?: number; lookY?: number; turn?: boolean };
let aerial: AerialCam | null = null;
/** `turn` lookouts (tower tops): drag / ←→ turn the shot. camYaw when the shot started (NaN = not started yet). */
let aerialYaw0 = NaN;
/** camYaw before a `turn` lookout took over: given back when it ends (walking down looks as it did walking up). */
let yawBeforeAerial = NaN;
window.addEventListener('rainbow-aerial', (e) => {
  const was = aerial;
  aerial = (e as CustomEvent<AerialCam | null>).detail;
  if (was?.turn && !Number.isNaN(aerialYaw0) && !Number.isNaN(yawBeforeAerial)) camYaw = yawBeforeAerial;
  aerialYaw0 = NaN;
  yawBeforeAerial = NaN;
});
if (DEBUG) {
  window.addEventListener('rainbow-teleport', (e) => {
    const { x, z, h } = (e as CustomEvent<{ x: number; z: number; h: number }>).detail;
    player.position.set(x, 0, z);
    player.heading = h;
    camYaw = h; // keep the third-person camera behind her after a debug teleport
  });
  // QA: park the car at {x, z, h} (e.g. at the foot of the USA bridge road)
  window.addEventListener('rainbow-car', (e) => {
    const { x, z, h } = (e as CustomEvent<{ x: number; z: number; h: number }>).detail;
    if (!driving) car.place(x, z, h);
  });
  // QA: drop a comet on her now (Moon only)
  window.addEventListener('rainbow-comet', () => moonPlay?.comets.dropNow());
  window.addEventListener('rainbow-hospital-end', () => {
    save.hospitalUntil = Date.now();
  });
  window.addEventListener('rainbow-wear', (e) => {
    const d = (e as CustomEvent<{ slot?: string; kind?: string | null; clear?: boolean }>).detail || {};
    if (d.clear) {
      save.wear = {};
      player.setWear(save.wear);
      writeSave(save);
      return;
    }
    if (!d.slot) return;
    if (d.kind) save.wear[d.slot] = d.kind;
    else delete save.wear[d.slot];
    if (save.wear.face === SUNGLASSES_KIND) save.bag[SUNGLASSES_KIND] = 1;
    player.setWear(save.wear);
    writeSave(save);
    refreshBag?.();
  });
  window.addEventListener('rainbow-coins', (e) => {
    save.coins = (e as CustomEvent<number>).detail;
    hud.set('coins', save.coins);
  });
  window.addEventListener('rainbow-jewels', (e) => {
    save.jewels = (e as CustomEvent<number>).detail;
    hud.set('jewels', save.jewels + save.diamonds);
    refreshBag();
  });
  window.addEventListener('rainbow-diamonds', (e) => {
    save.diamonds = (e as CustomEvent<number>).detail;
    hud.set('jewels', save.jewels + save.diamonds);
    writeSave(save);
  });
  // world point → screen pixels, written to <html data-proj> (so automated checks can click on things)
  window.addEventListener('rainbow-project', (e) => {
    const { x, y, z } = (e as CustomEvent<{ x: number; y: number; z: number }>).detail;
    const v = new THREE.Vector3(x, y, z).project(camera);
    document.documentElement.dataset.proj = JSON.stringify([Math.round(((v.x + 1) / 2) * window.innerWidth), Math.round(((1 - v.y) / 2) * window.innerHeight), +v.z.toFixed(3)]);
  });
  window.addEventListener('rainbow-note', (e) => {
    const { x, z } = (e as CustomEvent<{ x: number; z: number }>).detail;
    collectibles.debugNote(x, z);
  });
  // jump to a city by level index (0 = Porto … 14 = EUA · 15 = Lua)
  window.addEventListener('rainbow-level', (e) => {
    const level = (e as CustomEvent<number>).detail;
    if (typeof level !== 'number' || level < 0 || level >= CITIES.length) return;
    try {
      jumpToCity(level);
      showArrival(city.arrival);
    } catch (err) {
      console.error('rainbow-level failed', level, err);
      document.body.dataset.debug = JSON.stringify({ level: save.level, city: city?.name, loadError: String(err) });
    }
  });
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
const save = loadSave();
let city = cityAt(save.level);
let world = city.kind === 'moon' ? createMoonWorld(scene, city) : createWorld(scene, city);
const player = new Character(save.character ?? 'princesa');
// drop broken stub cape (blue flat plate on the back) from older saves
if (save.wear.back === 'srv-capa' || save.wear.body === 'srv-capa') {
  delete save.wear.back;
  delete save.wear.body;
}
if (save.wear.neck === 'srv-colar-sapato') {
  delete save.wear.neck; // old fake "shoe charm" — sapataria now puts real shoes on feet
  writeSave(save);
}
if (save.wear.face === SUNGLASSES_KIND) save.bag[SUNGLASSES_KIND] = 1;
player.setWear(save.wear);
player.setSpacesuit(city.kind === 'moon'); // the spacesuit is worn the whole time on the Moon (also after a reload)
scene.add(player.root);
const input = new Input(canvas);
canvas.focus();
const cityPill = showCityName(city.name);

const QUESTION_REWARD = 10;
const HIT_COST = 3; // coins lost when a creature catches the character
const RETRY_DELAY_MS = 3 * 60 * 1000; // a missed question comes back after ~3 minutes
const solved = new Set(save.solved);
const hud = new Hud(save);
const questionAvailable = (id: string) => !solved.has(id) && (save.retryAt[id] ?? 0) <= Date.now();
/** Solved questions come back as a review once nothing unsolved is left (so question-givers never vanish). */
const questionRecyclable = (id: string) => solved.has(id) && (save.retryAt[id] ?? 0) <= Date.now();
// created after the city extras (see below) so they never spawn inside the hospital, shops, stadium...
let collectibles!: Collectibles;
let npcs!: Npcs;
let monsters!: Monsters;
setRunwayActive(city.kind !== 'moon'); // first city of this page load (buildCity sets it on every switch)
let airport: Airport =
  city.kind === 'moon'
    ? ({ update() {}, setDoorOpen() {}, boardPoint: new THREE.Vector3(999, 0, 999), plane: new THREE.Group() } as unknown as Airport)
    : new Airport(scene, world.obstacles, city.name);
/** Cabo Canaveral pad (only on the USA level). */
let spaceport: Spaceport | null = null;
let usaLandmarks: UsaLandmarks | null = null;
let aurora: Aurora | null = null; // northern lights — Reiquiavique only (aurora.ts)
let snowPlay: SnowPlay | null = null; // snow field with children — Nuuk only (snowplay.ts)
/** Moon level: time machine (the end), food capsule at the lander, comets (moonplay.ts). */
let moonPlay: { machine: TimeMachine; food: LanderFood; comets: Comets; dizzy: DizzyStars; dust: HopDust } | null = null;
/** Progress 0..1 through her current Moon hop (−1 = feet on the ground) and the camera's smoothed height. */
let hopU = -1;
let camHopY: number | null = null;
/** Seconds she still lies dizzy after a comet hit (Moon only; also kept in the save as flag moon:down). */
let knocked = 0;
let catTree: CatTree; // assigned by addCityExtras()
let wanderCat!: WanderCat; // assigned by spawnActors()
let butterflies: Butterflies = noButterflies();
/** I58 rabbit — only Vilnius (pavement hop / freeze when near). */
let rabbit: WanderRabbit = noRabbit();
/** I38 parrot — only Rio de Janeiro (tree perch; says Olá + name). */
let parrot: RioParrot = noParrot();
/** Street singer — only Londres (guitar + tip hat; proximity song). */
let streetSinger: StreetSinger = noStreetSinger();
/** Carteiro — Paris (index 4) onward; pavement walk + postal once/day. */
let postman: Postman = noPostman();
/** Homem-estátua — Vilnius (index 6) onward; freeze / surprise. */
let livingStatue: LivingStatue = noLivingStatue();
/** Kick scooter from Londres onward (null-ish stub before then / on the Moon). */
let scooter: Scooter = noScooter();
/** The kick scooter she is riding (null = on foot). Declared early: addCityExtras clears it. */
let scooting: Scooter | null = null;
let trouble: Trouble;
let streetLights: StreetLights;
let traffic: Traffic;
let hospital: Hospital;
let concert: Concert;
let pool: Pool;
let house: House;
let fair: Fair;
let services: ServiceTown | null = null;
const HIT_FLASH = 1.5;
const RUN_OVER_COST = 30;
const HOSPITAL_MS = 5 * 60 * 1000;

/** Item in her hand (bread, ice cream...), attached to the character in the world. */
let carriedObj: THREE.Object3D | null = null;
let carriedKind: string | null = null;

/** A line waiting for the voice to be free (gameCtx.say). */
let sayTimer = 0;
/** What gameplay modules may ask of the game (see gamectx.ts). */
const gameCtx: GameCtx = {
  get player() {
    return player.position;
  },
  heading: () => player.heading,
  coins: () => save.coins,
  addCoins: (n) => addCoins(n),
  hurt: (from, cost) => hurt(from, cost),
  sinceHurt: () => (performance.now() - lastHurtAt) / 1000,
  // A shop handing over an item = it goes into the bag (and into her hand). null = the item in her hand was used up.
  setCarried(item, kind) {
    if (item && kind) {
      save.bag[kind] = (save.bag[kind] ?? 0) + 1;
      holdItem(kind, item);
    } else if (!item && carriedKind) {
      save.bag[carriedKind] = Math.max(0, (save.bag[carriedKind] ?? 0) - 1);
      holdItem(null);
    }
    writeSave(save);
    refreshBag();
  },
  carried: () => carriedKind,
  stowCarried: () => holdItem(null),
  isDriving: () => !!driving || !!scooting || onBus(),
  isPaused: () => paused,
  give(kind) {
    const m = buildItem(kind);
    if (m) gameCtx.setCarried(m, kind);
  },
  wear(slot, kind) {
    if (kind) save.wear[slot] = kind;
    else delete save.wear[slot];
    if (kind === SUNGLASSES_KIND) save.bag[SUNGLASSES_KIND] = 1;
    player.setWear(save.wear);
    writeSave(save);
    refreshBag?.();
  },
  worn: () => ({ ...save.wear }),
  owns: (kind) => (save.bag[kind] ?? 0) > 0 || Object.values(save.wear).includes(kind),
  // --- brief didático (2026-11-15): jewels as a second currency, module flags, small helpers ---
  jewels: () => save.jewels,
  spendJewels(n) {
    if (save.jewels < n) return false;
    save.jewels -= n;
    hud.set('jewels', save.jewels + save.diamonds);
    writeSave(save);
    refreshBag();
    return true;
  },
  addDiamond() {
    save.diamonds += 1;
    hud.set('jewels', save.jewels + save.diamonds);
    writeSave(save);
  },
  flag: (key) => save.flags[key] ?? 0,
  setFlag(key, value) {
    save.flags[key] = value;
    writeSave(save);
  },
  text: (key) => save.texts[key] ?? '',
  setText(key, value) {
    save.texts[key] = value;
    writeSave(save);
  },
  city: () => city.name,
  level: () => save.level,
  isBoy: () => save.character === 'karateca',
  say(lines) {
    // never interrupts: waits a little for the line being said to end (only the newest waiting line is kept)
    clearTimeout(sayTimer);
    const attempt = (tries: number): void => {
      if (document.querySelector('.quiz')) return;
      if (!speechSynthesis.speaking) void speak(lines);
      else if (tries > 0) sayTimer = window.setTimeout(() => attempt(tries - 1), 500);
    };
    attempt(8);
  },
  hold(on) {
    paused = on;
    if (!on) scriptedWalk = 0;
    clearTarget();
    input.releaseAll();
    lastActivity = performance.now();
  },
  walkAnim(speed, faceX, faceZ) {
    scriptedWalk = speed;
    if (faceX !== undefined && faceZ !== undefined) {
      const dx = faceX - player.position.x;
      const dz = faceZ - player.position.z;
      if (dx * dx + dz * dz > 0.002) player.heading = Math.atan2(-dx, -dz);
    }
  },
  shielded: () => extras.shield.on,
  async ask(q, reward, lang) {
    if (paused || driving || flight || onBus() || document.querySelector('.quiz') || document.querySelector('.photo-view')) return false;
    paused = true;
    clearTarget();
    input.releaseAll();
    const pay = reward + extras.life.answerBonus();
    const ok = await askQuestion(q, pay, lang);
    if (ok) addCoins(pay);
    paused = false;
    lastActivity = performance.now();
    canvas.focus();
    return ok;
  },
  async choose(text, options) {
    if (paused || driving || flight || onBus() || document.querySelector('.quiz') || document.querySelector('.photo-view')) return null;
    paused = true;
    clearTarget();
    input.releaseAll();
    const i = await askChoice(text, options);
    paused = false;
    lastActivity = performance.now();
    canvas.focus();
    return i;
  },
  async showPhoto(dataUrl) {
    // keep the game paused while the portrait is on screen (caller may already have paused)
    const was = paused;
    paused = true;
    clearTarget();
    input.releaseAll();
    await showPhoto(dataUrl);
    paused = was;
    lastActivity = performance.now();
    canvas.focus();
  },
  flash() {
    cameraFlash();
  },
};

/** Everything from the 2026-11-15 brief (energy, mood, jewels with a use, picking and giving…): see extras.ts. */
const extras = new Extras({
  scene,
  save,
  ctx: gameCtx,
  player,
  hour: () => weather.localHour,
  daylight: () => weather.daylight,
  world: () => world,
  npcs: () => npcs,
  monsters: () => monsters,
  free: () => !paused && !driving && !scooting && !flight && !onBus() && !riding && !pool.swimming && !pool.lounging,
  walkTo(p) {
    buyTarget = null;
    setTarget(p);
  },
  stop: () => clearTarget(),
  stopTraffic: (at, radius, seconds) => traffic.haltNear(at, radius, seconds),
});
if (save.diamonds > 0) hud.set('jewels', save.jewels + save.diamonds);

/** Show an item in her hand (display only — the bag counts are in save.bag). */
function holdItem(kind: string | null, mesh?: THREE.Object3D): void {
  if (carriedObj) carriedObj.parent?.remove(carriedObj);
  carriedObj = null;
  carriedKind = null;
  eating = null;
  if (kind) {
    const m = mesh ?? buildItem(kind);
    if (m) {
      m.position.set(0.42, 1.0, -0.32); // in front of her right hand
      player.root.add(m);
      carriedObj = m;
    }
    carriedKind = kind;
  }
  refreshBag?.();
}

/** Eating a sweet from the bag: four bites, then it's gone. */
let eating: { kind: string; t: number; bites: number } | null = null;
function useBagItem(kind: string): void {
  if (kind === SUNGLASSES_KIND) {
    if (paused || driving || flight || onBus()) return;
    save.bag[SUNGLASSES_KIND] = 1;
    const on = save.wear.face === SUNGLASSES_KIND;
    gameCtx.wear('face', on ? null : SUNGLASSES_KIND);
    void speak(on ? ['Tirei os óculos.'] : ['Pus os óculos.']);
    return;
  }
  if (extras.useBagItem(kind)) return; // her jewels: holding one up = shield
  if (paused || driving || flight || (save.bag[kind] ?? 0) <= 0) return;
  holdItem(kind);
  if (kind !== 'pao' && (itemDef(kind)?.edible ?? true)) eating = { kind, t: 0, bites: 0 };
}
function updateEating(dt: number): void {
  if (!eating || !carriedObj) return;
  eating.t += dt;
  if (eating.t < 0.5 + eating.bites * 0.6) return;
  eating.bites++;
  if (eating.kind === 'chocolate') tone(300, 0, 0.06, 'square', 0.05);
  else tone(900, 0, 0.1, 'sine', 0.04);
  const edible = (carriedObj.userData as { edible?: THREE.Object3D }).edible ?? carriedObj;
  edible.scale.setScalar(Math.max(0, 1 - eating.bites * 0.27));
  if (eating.bites >= 4) {
    const k = eating.kind;
    eating = null;
    save.bag[k] = Math.max(0, (save.bag[k] ?? 0) - 1);
    writeSave(save);
    holdItem(null);
    feel('eat');
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.15, 'triangle', 0.05)); // yum
  }
}

/** performance.now() of the last hurt() (folk nurse: gameCtx.sinceHurt). */
let lastHurtAt = -Infinity;
/** Knock her away from `from`, flash, lose `cost` coins. False if she can't be hurt right now. */
function hurt(from: THREE.Vector3, cost: number): boolean {
  if (paused || driving || scooting || flight || onBus() || invulnerable > 0) return false;
  lastHurtAt = performance.now();
  const lost = Math.min(cost, save.coins);
  if (lost > 0) addCoins(-lost);
  sfx.bonk();
  knock.set(player.position.x - from.x, 0, player.position.z - from.z);
  if (knock.lengthSq() < 1e-4) knock.set(1, 0, 0);
  knock.setLength(11);
  invulnerable = HIT_FLASH;
  clearTarget();
  return true;
}
let car = addCityExtras();
spawnActors();

/** Coins, question characters and creatures — always after every building/object exists. */
function spawnActors(): void {
  collectibles = new Collectibles(scene, world.obstacles);
  if (city.kind === 'moon') {
    // LUA2/LUA4: no question characters or street cat — only coins and martians
    collectibles.heightAt = moonHeight;
    collectibles.floatAmp = 0.35; // LUA5: coins float a little more
    seedMoonLoot(collectibles, world.obstacles); // crater rims, hilltops, path to the altar
    npcs = { list: [], update: () => null, dismiss() {} } as unknown as Npcs;
    monsters = new Monsters(scene, world.obstacles, { martian: true, heightAt: moonHeight, blocked: inDeepCrater });
    monsters.difficulty = DIFFICULTY_FACTOR[save.difficulty];
    wanderCat = { update() {}, debug: () => ({}) } as unknown as WanderCat;
    return;
  }
  npcs = new Npcs(scene, world.obstacles, questionAvailable, player.position, questionRecyclable, city.name);
  // USA: creatures and coins follow the hills / bridge deck; a few coins wait along the deck
  const usaGround = city.kind === 'usa' && world.heightAt ? (x: number, z: number) => world.heightAt?.(x, z) ?? 0 : undefined;
  if (usaGround) {
    collectibles.heightAt = usaGround;
    for (const p of usaLandmarks?.deckCoins ?? []) collectibles.placeAt('coin', p.x, p.z);
  }
  monsters = new Monsters(scene, world.obstacles, usaGround ? { heightAt: usaGround } : undefined);
  monsters.difficulty = DIFFICULTY_FACTOR[save.difficulty];
  wanderCat = new WanderCat(scene, world.obstacles, player.position);
}
// restore after every obstacle (incl. the airport) exists, so she can never reappear inside something
player.position.set(SPAWN.x, 0, SPAWN.z);
player.heading = SPAWN.h;
if (save.pos && isFree(save.pos.x, save.pos.z, CHARACTER_RADIUS, world.obstacles)) {
  player.position.set(save.pos.x, 0, save.pos.z);
  player.heading = save.pos.h;
}

/** Silent stand-ins for a venue a city doesn't have (Moon, or CITY_WITHOUT): the frame loop never hits null. */
function quietVenue() {
  return {
    update() {},
    dispose() {},
    isInside: () => false,
    interior: null,
    things: [] as Interactable[],
    debug: () => ({ none: true }),
  };
}
function quietPool(): Pool {
  return {
    ...quietVenue(),
    swimming: false,
    lounging: false,
    swimSpeed: 0,
    waterWalls: [] as never[],
    booth: null,
    cabins: [],
    release() {},
    getUp() {},
    nextStroke() {},
  } as unknown as Pool;
}
// a function declaration (hoisted): addCityExtras() runs at boot above this line, and on a Moon boot it needs this
// (a `const` here crashed "Continuar" on the Moon: "Cannot access 'quietTrouble' before initialization")
function quietTrouble(): Trouble {
  return { update() {}, positions: () => [], sites: () => [], clearance: null } as unknown as Trouble;
}

/** Hand-made interactive situations in every city: a car to drive and someone to give a coin to. */
function addCityExtras(): Car {
  usaLandmarks?.dispose();
  usaLandmarks = null;
  disposeMoonPlay();
  spaceport?.dispose();
  spaceport = null;
  butterflies.dispose();
  butterflies = noButterflies();
  rabbit.dispose();
  rabbit = noRabbit();
  parrot.dispose();
  parrot = noParrot();
  streetSinger.dispose();
  streetSinger = noStreetSinger();
  postman.dispose();
  postman = noPostman();
  livingStatue.dispose();
  livingStatue = noLivingStatue();
  snowPlay?.dispose();
  snowPlay = null;
  // --- aurora boreal (Reiquiavique only; disposed on every city change)
  aurora?.dispose();
  aurora =
    city.name === 'Reiquiavique'
      ? new Aurora(scene, camera, {
          daylight: () => weather.daylight,
          kind: () => weather.state.kind,
          say: (lines) => {
            gameCtx.say(lines);
            skyGazeT = 7; // "Olha para o céu!" — the camera looks up at it for a few seconds
          },
          canSpeak: () => !flight && !paused,
        })
      : null;
  scooting = null;
  player.scooterRiding = false;
  scooter = noScooter();

  // LUA2: bare Moon — lander + altar only (no fair, traffic, shops, venues, street lamps…)
  if (city.kind === 'moon') {
    services?.dispose();
    services = null;
    setNoSpawnZones([]);
    const machine = new TimeMachine(scene, world.obstacles, gameCtx, () => save.diamonds + save.jewels, {
      setPlayerVisible: (v) => (player.root.visible = v),
      onFinish: (n) => {
        save.delivered = n;
        save.diamonds = 0;
        save.jewels = 0;
        save.finished = true;
        hud.set('jewels', 0);
        writeSave(save);
        refreshBag();
        void showTravel(null, 'timemachine');
      },
    });
    const food = new LanderFood(scene, gameCtx, () => save.energy >= ENERGY_MAX);
    const comets = new Comets(scene, gameCtx, knockDown);
    moonPlay = { machine, food, comets, dizzy: new DizzyStars(scene), dust: new HopDust(scene) };
    world.interactables.push(...machine.things, ...food.things);
    // a comet hit survives a reload (she keeps lying for what is left of the minute)
    const downLeft = gameCtx.flag('moon:down') - Date.now() / 1000;
    if (downLeft > 0) knocked = Math.min(60, downLeft); // the frame loop lays her down (main.ts may still be loading here)
    // silent stubs so the frame loop never hits null (nothing is drawn)
    const quiet = quietVenue();
    streetLights = { update() {}, litCount: () => 0, count: () => 0, clearIn: () => 0, positions: () => [] } as unknown as StreetLights;
    setCityLampClearer(null);
    fair = quiet as unknown as Fair;
    concert = quiet as unknown as Concert;
    pool = quietPool();
    house = quiet as unknown as House;
    hospital = {
      bed: { pos: new THREE.Vector3(), heading: 0 },
      exit: new THREE.Vector3(),
      exterior: new THREE.Vector3(),
      group: new THREE.Group(),
      setAmbulanceLights() {},
      setClock() {},
    } as unknown as Hospital;
    trouble = quietTrouble();
    traffic = {
      update() {},
      haltNear() {},
      tryBoard: () => 'no',
      dropRider: () => null,
      alight: () => null,
      riderCanAlight: () => false,
      hasRider: () => false,
      ringBell() {},
      kickRider: false,
      riderSeat: () => null,
      openDoorNear: () => null,
      tappedBus: () => null,
      positions: () => [],
      busDebug: () => null,
    } as unknown as Traffic;
    catTree = {
      update() {},
      idleAfter() {},
      waiting: false,
      active: false,
      interactable: { position: new THREE.Vector3(), object: new THREE.Group(), radius: 0, interact() {} },
      begin() {},
    } as unknown as CatTree;
    if (!save.visited.includes(city.name)) save.visited.push(city.name);
    const c = new Car(scene, world.obstacles, new THREE.Vector3(2000, 0, 2000), 0, 0x888888, () => false);
    c.group.visible = false;
    return c;
  }

  // street lamps first (along the roads) so everything placed after avoids them
  streetLights = new StreetLights(scene, world.obstacles);
  // shops/kiosks may clear a lamp that still sits in their door apron
  setCityLampClearer((area, obs) => streetLights.clearIn(area, obs));
  const clearLamps = (area: Obstacle, obs: Obstacle[]) => streetLights.clearIn(area, obs);
  /** Soft keep-out ring around a venue footprint (m) — props / stops / lamps must stay outside. */
  const VENUE_PAD = 8;
  const padZone = (z: Obstacle, m = VENUE_PAD): Obstacle => ({
    minX: z.minX - m,
    maxX: z.maxX + m,
    minZ: z.minZ - m,
    maxZ: z.maxZ + m,
  });
  // USA landmarks early (fixed spots + clearArea) so the fair / playgrounds / shops keep clear of them
  if (city.kind === 'usa') {
    usaLandmarks = new UsaLandmarks(scene, world.obstacles, world, gameCtx, () => weather.daylight);
    world.interactables.push(...usaLandmarks.things);
  }
  // Big venues FIRST (fair → stadium → concert → pool → house): their padded footprints stay in
  // obstacles while bus stops / props / shops / services pick spots, so nothing glues to a wall.
  fair = cityHas(city, 'fair')
    ? new Fair(scene, world.obstacles, mulberry32(city.seed * 67 + 19), gameCtx, [], save.level, world)
    : (quietVenue() as unknown as Fair);
  world.interactables.push(...fair.things);
  const fairBlock = fair.interior ? padZone(fair.interior) : null;
  if (fairBlock) {
    world.obstacles.push(fairBlock);
    clearLamps(fairBlock, world.obstacles);
  }
  // no stadium in some cities (CITY_WITHOUT) — the bar and its two men stay
  trouble = new Trouble(scene, world.obstacles, mulberry32(city.seed * 17 + 3), gameCtx, cityHas(city, 'stadium'), cityHas(city, 'bar'));
  const stadiumBlock = trouble.clearance ? { ...trouble.clearance } : null;
  if (stadiumBlock) {
    world.obstacles.push(stadiumBlock);
    clearLamps(stadiumBlock, world.obstacles);
  }
  // children's concert: ticket booth + fenced venue (nothing spawns inside / beside it)
  concert = cityHas(city, 'concert')
    ? new Concert(scene, world.obstacles, mulberry32(city.seed * 53 + 11), gameCtx, [
        ...world.interactables.map((i) => i.position),
      ])
    : city.kind === 'usa' // USA: a rodeo in the concert's place (rodeo.ts — same slot: booth, no-spawn zone, update, dispose)
      ? (new Rodeo(scene, world.obstacles, mulberry32(city.seed * 53 + 11), gameCtx, [...world.interactables.map((i) => i.position)]) as unknown as Concert)
      : (quietVenue() as unknown as Concert);
  if (concert.booth) world.interactables.push(concert.booth);
  world.interactables.push(...(asRodeo(concert)?.seats ?? [])); // USA: tap a grandstand = sit
  const concertBlock = concert.interior ? padZone(concert.interior) : null;
  if (concertBlock) {
    world.obstacles.push(concertBlock);
    clearLamps(concertBlock, world.obstacles);
  }
  // swimming pool: ticket, beach cabins to change, swim among other swimmers
  pool = cityHas(city, 'pool')
    ? new Pool(scene, world.obstacles, mulberry32(city.seed * 59 + 13), gameCtx, [
        ...world.interactables.map((i) => i.position),
      ], {
        player,
        hold(on) {
          paused = on;
          clearTarget();
          input.releaseAll();
        },
        changed: () => holdItem(null),
      })
    : quietPool();
  if (pool.booth) world.interactables.push(pool.booth, ...pool.cabins);
  const poolBlock = pool.interior ? padZone(pool.interior) : null;
  if (poolBlock) {
    world.obstacles.push(poolBlock);
    clearLamps(poolBlock, world.obstacles);
  }
  // a house to walk into (hall, kitchen, living/dining room, bathroom, bedroom) — everything inside reacts to touch
  house = new House(scene, world.obstacles, mulberry32(city.seed * 61 + 17), gameCtx, [
    ...world.interactables.map((i) => i.position),
  ], houseColors(city.name));
  world.interactables.push(...house.things);
  const houseBlock = house.interior ? padZone(house.interior, 4) : null;
  if (houseBlock) {
    world.obstacles.push(houseBlock);
    clearLamps(houseBlock, world.obstacles);
  }
  // Nuuk: snow field (snowmen, ice holes, children throwing snowballs) instead of the fair
  if (city.name === 'Nuuk') {
    snowPlay = SnowPlay.create(scene, world.obstacles, mulberry32(city.seed * 71 + 23), gameCtx, player, world);
    if (snowPlay) world.interactables.push(...snowPlay.things);
  }
  // bus stops along the bus lines — after venues so they keep clear of stadium / fair / pool walls
  const busStops = createBusStops(scene, world.obstacles, mulberry32(city.seed * 67 + 19));
  const c = new Car(scene, world.obstacles, new THREE.Vector3(-16, 0, 7), Math.PI / 2, city.buildings[0], () => enterCar());
  if (city.kind === 'usa') c.heightAt = (x, z) => world.heightAt?.(x, z) ?? 0; // up the hills and over the bridge (usa.ts)
  world.interactables.push(c.interactable);
  // I42 kick scooter (real vehicle) — Londres (index 3) onward; park/pavement pad with setback
  scooter = (cityHas(city, 'scooter') ? createScooter(scene, world.obstacles, world, city.seed, save.level, () => enterScooter()) : null) ?? noScooter();
  if (scooter.debug().on) world.interactables.push(scooter.interactable);
  world.interactables.push(
    createBeggar(scene, world.obstacles, new THREE.Vector3(-8, 0, -8), {
      coins: () => save.coins,
      giveCoin: () => addCoins(-1),
    }),
  );
  // the big fenced playground first (it needs the most room), then the small props around the city
  const park = buildPlayground(scene, world.obstacles, mulberry32(city.seed * 89 + 7), gameCtx, world);
  if (park) world.interactables.push(...park);
  // playground props (swing, fountain, xylophone, cat, dog...) — placed after venues so they avoid walls
  world.interactables.push(...createProps(scene, world.obstacles, mulberry32(city.seed * 97 + 1)));
  // Fase 3: escorrega, balancé, macaca, bolas de sabão, piano, banco, baliza…
  world.interactables.push(...createPlaygrounds(scene, world.obstacles, city.seed, gameCtx, !!park));
  // I63 real butterflies (fly / perch / flee) — Roma onward; park garden with clearArea
  butterflies = new Butterflies(scene, world.obstacles, world, city.seed, save.level);
  // I58 rabbit (real hop/wander) — only Vilnius; clearArea at spawn; never on the road
  rabbit = createRabbit(scene, world.obstacles, world, city.name, player.position);
  // I38 parrot (real mesh on perch) — only Rio de Janeiro; says Olá + name
  parrot = createParrot(scene, world.obstacles, world, city.seed, city.name);
  world.interactables.push(...parrot.things);
  // Street singer — only Londres; guitar + tip hat; sings when near
  streetSinger = createStreetSinger(
    scene,
    world.obstacles,
    world,
    city.seed,
    city.name,
    () => save.coins,
    () => addCoins(-1),
  );
  world.interactables.push(...streetSinger.things);
  // Carteiro — Paris+; postal no inventário (uma vez por cidade/dia)
  postman = createPostman(
    scene,
    world.obstacles,
    world,
    city.seed,
    save.level,
    city.name,
    player.position,
    gameCtx,
  );
  world.interactables.push(...postman.things);
  // Homem-estátua — Vilnius+; pedestal + surpresa ao ficar quieta / tocar
  livingStatue = createLivingStatue(scene, world.obstacles, world, city.seed, save.level, gameCtx);
  world.interactables.push(...livingStatue.things);
  catTree = new CatTree(scene, world.obstacles, mulberry32(city.seed * 31 + 5));
  hospital = createHospital(scene, world.obstacles, mulberry32(city.seed * 41 + 9));
  world.interactables.push(...createShops(scene, world.obstacles, mulberry32(city.seed * 13 + 7), gameCtx, clearLamps, world.interactables));
  // Fase 4: cabeleireiro, sapataria, roupa, SPA, médico… (S01–S10)
  services?.dispose();
  services = createServices(scene, world.obstacles, city.seed, gameCtx, player, clearLamps);
  world.interactables.push(...services.things);
  // Drop soft placement pads (real fences / stadium solids stay). Keep padded zones for no-spawn + landmarks.
  for (const b of [fairBlock, stadiumBlock, concertBlock, poolBlock, houseBlock]) {
    if (!b) continue;
    const i = world.obstacles.indexOf(b);
    if (i >= 0) world.obstacles.splice(i, 1);
  }
  // padded keep-outs: coins / NPCs / monsters also stay off the free ring around each big venue
  const venueZones = [
    concert.interior && padZone(concert.interior),
    pool.interior && padZone(pool.interior),
    house.interior && padZone(house.interior, 4),
    fair.interior && padZone(fair.interior),
    snowPlay?.zone ?? null,
    trouble.clearance,
    ...(services?.zones() ?? []), // walk-in try-on shops (tryon.ts)
    bakeryZone(), // walk-in bakery (shops.ts)
    usaLandmarks?.zone ?? null, // USA: hills + river of the Ponte do Pacífico (usa.ts)
  ].filter((z): z is Obstacle => !!z);
  setNoSpawnZones(venueZones);
  // Keep venue footprints in obstacles while landmarks pick plots (soft pads were only temporary earlier).
  const landmarkGuards = venueZones.map((z) => ({ ...z }));
  world.obstacles.push(...landmarkGuards);
  traffic = new Traffic(scene, world.obstacles, gameCtx, (carPos) => runOver(carPos), busStops);
  extras.buildCity(city.seed); // bank, jeweller, treasure chest… (extras.ts)
  // Fase 5: ex-líbris por cidade + joia (I81–I90); USA tem usa.ts — after venues so openSpot / resolveSpot never land on them
  world.interactables.push(...createLandmarks(scene, world.obstacles, city.seed, gameCtx, world));
  for (const g of landmarkGuards) {
    const i = world.obstacles.indexOf(g);
    if (i >= 0) world.obstacles.splice(i, 1);
  }
  world.interactables.push(catTree.interactable);
  if (city.kind === 'usa') {
    spaceport = new Spaceport(scene, world.obstacles);
    // the valley of the bridge was kept free while the city was built: she walks / drives on it from now on
    const gi = usaLandmarks ? world.obstacles.indexOf(usaLandmarks.guard) : -1;
    if (gi >= 0) world.obstacles.splice(gi, 1);
  }
  if (!save.visited.includes(city.name)) save.visited.push(city.name);
  return c;
}

/** Rebuild everything for the current level's city (in place, no page reload). */
/** Out of the water and back in her clothes (Casa, new city, new game). */
function leavePool(): void {
  getOffSwing();
  pool?.release();
  player.swimming = false;
  player.stroke = 'crawl';
  player.airborne = false;
  player.setSwimwear(false);
  player.position.y = 0;
  player.root.rotation.x = 0;
}

function loadCity(): void {
  leaveBus(true);
  forceOffScooter();
  concert?.dispose();
  pool?.dispose();
  house?.dispose();
  fair?.dispose();
  services?.dispose();
  services = null;
  usaLandmarks?.dispose();
  usaLandmarks = null;
  disposeMoonPlay();
  spaceport?.dispose();
  spaceport = null;
  extras.disposeCity();
  leavePool();
  aerial = null; // clear tower lookout camera if she left mid-climb
  scene.clear();
  city = cityAt(save.level);
  player.setSpacesuit(city.kind === 'moon'); // on for the Moon, back to her clothes anywhere else (Novo jogo, ⚙ Cidade)
  world = city.kind === 'moon' ? createMoonWorld(scene, city) : createWorld(scene, city);
  scene.add(player.root, marker);
  player.position.set(SPAWN.x, 0, SPAWN.z);
  player.heading = SPAWN.h;
  camYaw = SPAWN.h;
  insideInteractable.clear();
  // The Moon has no airport; the USA keeps one for arrivals but leaves by rocket (spaceport).
  setRunwayActive(city.kind !== 'moon'); // people / cat / rabbit never walk onto the runway (airport.ts onRunway)
  airport = city.kind === 'moon' ? (null as unknown as Airport) : new Airport(scene, world.obstacles, city.name);
  if (city.kind === 'moon') {
    // placeholder airport object so Flight typing isn't needed; boarding is disabled on the Moon
    airport = {
      update() {},
      setDoorOpen() {},
      boardPoint: new THREE.Vector3(999, 0, 999),
      plane: new THREE.Group(),
    } as unknown as Airport;
  }
  car = addCityExtras();
  spawnActors();
  cityPill.textContent = city.name;
  weather.setLights({ hemi: world.hemi, sun: world.sun });
  weather.setSpace(city.kind === 'moon');
  void weather.setCity(city.name);
  holdItem(null);
}

/** Travel = walk to the airport (or Cabo Canaveral rocket), board, fly/launch, land in the next city. */
let flight: Flight | Launch | null = null;
let travelHintGiven = false;
let notEnoughCooldown = 0;
const lastLevel = () => city.kind === 'moon' || save.level >= CITIES.length - 1;
const readyToTravel = () => save.coins >= COINS_PER_LEVEL && !lastLevel();
/** USA leaves by rocket; every earlier city leaves by plane. */
const leavesByRocket = () => city.kind === 'usa';

function startFlight(): void {
  paused = true;
  clearTarget();
  input.releaseAll();
  sfx.travel();
  const next = cityAt(save.level + 1);
  const payAndLoad = (): void => {
    save.coins -= COINS_PER_LEVEL;
    save.level += 1;
    save.pos = null;
    writeSave(save);
    hud.set('coins', save.coins);
    loadCity();
    player.root.visible = false;
  };
  if (leavesByRocket() && spaceport) {
    flight = new Launch(
      spaceport,
      player,
      () => {
        payAndLoad();
      },
      setFade,
      () => showBanner(`A caminho da ${next.name}  🚀`, 4000),
    );
    return;
  }
  flight = new Flight(
    airport,
    player,
    () => {
      payAndLoad();
      return airport;
    },
    setFade,
    () => showBanner(`A voar para ${next.dest ?? next.name}  ✈️`, 4000),
  );
}

function endFlight(): void {
  flight = null;
  paused = false;
  travelHintGiven = false;
  // face the city (towards -X), camera behind her, clear of the plane and the terminal
  player.heading = Math.PI / 2;
  camYaw = Math.PI / 2;
  savePosition();
  showArrival(city.arrival);
  canvas.focus();
}

/** Casa: back to the city's starting point (quick white blink so the jump isn't confusing). */
createHomeButton(() => {
  if (paused || flight || driving) return; // not during a question, a flight or a drive
  setFade(true);
  setTimeout(() => {
    clearTarget();
    input.releaseAll();
    knock.set(0, 0, 0);
    leaveBus(true);
    forceOffScooter();
    leavePool();
    // LUA2: on the Moon, Casa brings her back to the lander
    if (city.kind === 'moon') {
      // beside the lander, not on its centre (that is inside its 3.2 m obstacle box: she sank in it, camera in the hull)
      const hx = LANDER.x + 5.5;
      player.position.set(hx, moonHeight(hx, LANDER.z), LANDER.z);
      player.heading = LANDER.h + Math.PI; // facing the lander, so the camera behind her is in the open (not inside the hull)
      camYaw = LANDER.h + Math.PI;
    } else {
      player.position.set(SPAWN.x, 0, SPAWN.z);
      player.heading = SPAWN.h;
      camYaw = SPAWN.h;
    }
    savePosition();
    setFade(false);
    canvas.focus();
  }, 600);
});

let rescuing = false;
/** Shop the child tapped and is walking to (buys on arrival). */
let buyTarget: Interactable | null = null;
/** Swing she is sitting on (null = not swinging). */
let riding: { seat: NonNullable<Interactable['seat']>; i: number } | null = null;
/** Height the ride put her at this frame (re-applied after the interactables' updates). */
let rideY = 0;
function useClickable(it: Interactable): void {
  if (riding) return; // already on a ride: taps steer / get off, they never buy another
  const ok = it.interact({ player: player.position }) !== false;
  if (ok && it.seat && !riding && !paused && !driving && !scooting && !pool.swimming) {
    clearTarget();
    input.releaseAll();
    riding = { seat: it.seat, i: it.seat.take(player.position) };
    player.sitting = true;
    player.airborne = true;
  }
}
function getOffSwing(): void {
  if (!riding) return;
  const off = riding.seat.getOff();
  const rideCam = aerial; // a ride that owned the camera (playground slides): keep looking from that side afterwards
  riding.seat.leave();
  if (rideCam?.fromX !== undefined && rideCam.fromZ !== undefined) camYaw = Math.atan2(rideCam.fromX - off.x, rideCam.fromZ - off.z);
  riding = null;
  player.sitting = false;
  player.lyingY = null;
  player.prone = false;
  player.airborne = false;
  player.root.rotation.x = 0;
  player.position.set(off.x, 0, off.z);
}
// Enter next to a shop counter buys too (keyboard players)
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || paused || driving || scooting || flight || onBus() || riding) return;
  if (snowPlay?.enter()) {
    e.preventDefault(); // snowball in her hand: Enter throws it straight ahead
    e.stopImmediatePropagation();
    return;
  }
  if (extras.enter()) {
    e.preventDefault(); // Enter next to a flower bed / fruit tree = pick
    return;
  }
  const shop = world.interactables.find(
    (i) => i.requiresClick && Math.hypot(i.position.x - player.position.x, i.position.z - player.position.z) < i.radius,
  );
  if (shop) {
    e.preventDefault();
    useClickable(shop);
    e.stopImmediatePropagation(); // the same Enter must not also get her off the ride she just boarded
  }
});
const refreshBag = (() => {
  const draw = createBag((kind) => useBagItem(kind));
  return () => {
    const view = extras.bagView(save.bag);
    if ((save.bag[SUNGLASSES_KIND] ?? 0) > 0 || save.wear.face === SUNGLASSES_KIND) view[SUNGLASSES_KIND] = 1;
    draw(view, carriedKind, save.wear.face === SUNGLASSES_KIND ? SUNGLASSES_KIND : null);
  };
})();
refreshBag();

/** Real weather of the current city (Open-Meteo), re-applied on every city change. */
const weather = new Weather(scene, { hemi: world.hemi, sun: world.sun }, camera);
weather.rainVolume = RAIN_SOUND_FACTOR[save.rainSound];
weather.setSpace(city.kind === 'moon');
void weather.setCity(city.name);

/** Hospital: run over → fall → white fade → lying in the hospital bed while the clock fills (5 min). */
let hospitalPhase: 'none' | 'fall' | 'bed' = 'none';
let hospitalT = 0;
function runOver(carPos: THREE.Vector3): void {
  if (paused || driving || flight || onBus() || hospitalPhase !== 'none') return;
  addCoins(-RUN_OVER_COST);
  sfx.bonk();
  paused = true;
  clearTarget();
  input.releaseAll();
  holdItem(null);
  hospitalPhase = 'fall';
  hospitalT = 0;
  knock.set(player.position.x - carPos.x, 0, player.position.z - carPos.z).setLength(6);
  save.hospitalUntil = Date.now() + HOSPITAL_MS;
  writeSave(save);
}
function enterBed(): void {
  hospitalPhase = 'bed';
  player.root.rotation.order = 'YXZ';
  player.position.copy(hospital.bed.pos);
  player.heading = hospital.bed.heading + Math.PI; // lying on her back, head towards the pillow
  player.root.rotation.x = Math.PI / 2;
  hospital.setAmbulanceLights(true);
}
function leaveHospital(): void {
  hospitalPhase = 'none';
  save.hospitalUntil = 0;
  player.root.rotation.x = 0;
  player.position.copy(hospital.exit);
  player.position.y = 0;
  hospital.setClock(0);
  hospital.setAmbulanceLights(false);
  feel('hospital'); // she leaves rested: energy full
  paused = false;
  lastActivity = performance.now();
  savePosition();
  canvas.focus();
}
function updateHospital(dt: number): void {
  if (hospitalPhase === 'fall') {
    hospitalT += dt;
    player.root.rotation.order = 'YXZ';
    player.root.rotation.x = -Math.min(1, hospitalT * 3) * (Math.PI / 2) * 0.9; // tips over
    player.move(knock.x * dt, knock.z * dt, world.obstacles);
    knock.multiplyScalar(Math.exp(-6 * dt));
    if (hospitalT > 0.9 && hospitalT - dt <= 0.9) setFade(true);
    if (hospitalT > 1.8) {
      setFade(false);
      enterBed();
    }
  } else if (hospitalPhase === 'bed') {
    const left = save.hospitalUntil - Date.now();
    hospital.setClock(1 - Math.max(0, left) / HOSPITAL_MS);
    player.root.rotation.x = Math.PI / 2;
    if (left <= 0) leaveHospital();
  }
}
/** Camera for the hospital: from the open side of the ward, looking at the bed and the clock. */
function hospitalShot(): { pos: THREE.Vector3; look: THREE.Vector3 } {
  return {
    pos: hospital.group.localToWorld(new THREE.Vector3(7.6, 4.2, 10.5)),
    look: hospital.group.localToWorld(new THREE.Vector3(7.6, 1.4, -2)),
  };
}

/** Idle detection: any key, click, tap or mouse move counts as activity. */
const IDLE_MS = 30_000;
let lastActivity = performance.now();
for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const) {
  window.addEventListener(ev, () => (lastActivity = performance.now()), { capture: true, passive: true });
}
async function idlePause(): Promise<void> {
  paused = true;
  clearTarget();
  input.releaseAll();
  await showIdlePause();
  lastActivity = performance.now();
  paused = false;
  canvas.focus();
}

/** The car the character is driving (null = on foot). */
let driving: Car | null = null;

function enterCar(): void {
  if (paused || flight || driving || scooting || onBus() || riding) return;
  driving = car;
  car.enter(player.root); // door opens, she climbs in and stays visible at the wheel
  clearTarget();
  input.releaseAll();
}

function exitCar(): void {
  if (!driving || !driving.driving) return;
  clearTarget();
  driving.exit(() => {
    driving = null;
    savePosition();
  });
}

function enterScooter(): void {
  if (paused || flight || driving || scooting || onBus() || riding || pool?.swimming) return;
  scooting = scooter;
  player.scooterRiding = true;
  player.sitting = false;
  scooter.mount(player.root);
  clearTarget();
  input.releaseAll();
}

function exitScooter(): void {
  if (!scooting || !scooting.riding) return;
  clearTarget();
  scooting.dismount(() => {
    player.scooterRiding = false;
    player.root.rotation.x = 0;
    scooting = null;
    savePosition();
  });
}

/** Instant hop-off (Casa / nova cidade / novo jogo). */
function forceOffScooter(): void {
  if (!scooting && !player.scooterRiding) {
    scooter.forcePark();
    return;
  }
  scooter.forcePark();
  player.scooterRiding = false;
  player.root.rotation.x = 0;
  player.root.scale.setScalar(1);
  scooting = null;
}

/* ---------- bus (traffic.ts + busstops.ts) ---------- */
/** Touch distance to an open bus door to get on. */
const BUS_DOOR_R = 1.5;
/** Far from everything: coins can't be picked up through the bus windows. */
const NOWHERE = new THREE.Vector3(1e5, 0, 1e5);
/** She was at an open bus door last frame (getting on by touch is edge-triggered). */
let busNearDoor = false;
/** She asked to get off while the bus was moving: off at the next stop. */
let busWantOff = false;
/** Her camera pitch before getting on (the ride camera is lower, to see her at the window). */
let busPitch: number | null = null;
function onBus(): boolean {
  return traffic?.hasRider() ?? false;
}
function boardBus(): void {
  if (paused || driving || scooting || flight || onBus() || riding || pool?.swimming) return;
  if (traffic.tryBoard(player.position, 3) !== 'ok') return;
  clearTarget();
  input.releaseAll();
  buyTarget = null;
  busWantOff = false;
  busPitch = camPitch;
  player.sitting = true;
  player.airborne = true;
}
/** Off the bus onto the pavement by the door. forced (Casa, menu, new city): wherever the bus is. */
function leaveBus(forced = false): void {
  if (!onBus()) return;
  const off = forced ? traffic.dropRider() : traffic.alight();
  if (!off && !forced) return;
  player.sitting = false;
  player.airborne = false;
  player.root.rotation.x = 0;
  const spot = off ?? { x: SPAWN.x, z: SPAWN.z, h: SPAWN.h };
  player.position.set(spot.x, 0, spot.z);
  player.heading = spot.h;
  camYaw = spot.h;
  busNearDoor = true; // no instant re-boarding
  busWantOff = false;
  if (busPitch !== null) camPitch = busPitch;
  busPitch = null;
  clearTarget();
  if (!forced) savePosition();
}
function requestOffBus(): void {
  if (traffic.riderCanAlight()) leaveBus();
  else if (!busWantOff) {
    busWantOff = true;
    traffic.ringBell();
  }
}
/** Every frame, after traffic.update(): sit her in the bus / get on by touching an open door. */
function updateBus(dt: number): void {
  if (onBus()) {
    if (traffic.kickRider || (busWantOff && traffic.riderCanAlight())) {
      leaveBus(traffic.kickRider);
      return;
    }
    const seat = traffic.riderSeat();
    if (!seat) return;
    player.position.copy(seat.pos);
    player.heading = seat.heading;
    player.root.rotation.y = seat.heading;
    // camera behind-right of the bus and fairly low: she is seen at her window (door side)
    if (elapsed - lastDragTime > 1.5) {
      const want = seat.heading + 0.75;
      const diff = Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw));
      camYaw += diff * Math.min(1, dt * 2);
      camPitch += (0.2 - camPitch) * Math.min(1, dt * 2);
    }
    return;
  }
  if (paused || driving || flight) return;
  const near = traffic.openDoorNear(player.position, BUS_DOOR_R);
  if (near && !busNearDoor) boardBus();
  busNearDoor = near;
}

// Space / Enter gets out of the car (tapping the car does too); Space in the water changes swimming style
window.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !paused && onBus()) {
    e.preventDefault();
    requestOffBus();
    return;
  }
  if (e.key === 'Enter' && !paused && !driving && !flight && traffic.openDoorNear(player.position, 3)) {
    e.preventDefault();
    boardBus();
    return;
  }
  if ((e.key === ' ' || e.key === 'Enter') && riding?.seat.steer) {
    e.preventDefault();
    getOffSwing();
    return;
  }
  if (e.key === ' ' && !paused && pool?.swimming) {
    e.preventDefault();
    pool.nextStroke();
    return;
  }
  if (driving && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    exitCar();
    return;
  }
  if (scooting && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    exitScooter();
  }
});

// creature hits: brief knockback + blinking, during which she can't be hit again
const knock = new THREE.Vector3();
let invulnerable = 0;

/** Remember where the character is, so a reload continues from the same spot. */
function savePosition(): void {
  if (flight) return; // mid-flight positions (stairs, cabin) are not places to resume from
  if (onBus()) {
    // on the bus: a reload continues at the stop she got on at / last stopped at (never on the road)
    const spot = traffic.riderSafeSpot();
    if (spot) {
      save.pos = { x: +spot.x.toFixed(2), z: +spot.z.toFixed(2), h: +spot.h.toFixed(3) };
      writeSave(save);
    }
    return;
  }
  save.pos = { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2), h: +player.heading.toFixed(3) };
  writeSave(save);
}
setInterval(savePosition, 2000);
window.addEventListener('pagehide', savePosition);
/** True while a question is on screen: the character stands still. */
let paused = false;
/** Leg-cycle speed while hold()'d on stairs (landmarks / I69). 0 = idle. */
let scriptedWalk = 0;

function addCoins(n: number): void {
  save.coins = Math.max(0, save.coins + n);
  hud.set('coins', save.coins);
  writeSave(save);
}

async function meet(npc: QuestionNpc): Promise<void> {
  paused = true;
  clearTarget();
  input.releaseAll();
  if (scooting) {
    // on the scooter: just stop (she stays on it, facing where she rides; no shove off the deck)
    scooting.speed = 0;
  } else {
    // Never stand inside the question-giver: push out before freezing for the question.
    keepAway(npc.group.position.x, npc.group.position.z, PERSON_CLEAR);
    // face each other
    const dx = npc.group.position.x - player.position.x;
    const dz = npc.group.position.z - player.position.z;
    player.heading = Math.atan2(-dx, -dz);
  }
  const id = npc.question.id;
  save.retryAt[id] = Date.now() + RETRY_DELAY_MS; // set now: reloading mid-question can't give an instant retry
  writeSave(save);
  const reward = QUESTION_REWARD + extras.life.answerBonus(); // "muito feliz" = one more coin
  const ok = await askQuestion(npc.question, reward);
  if (ok && solved.has(id)) {
    // a review of an already-solved question: coins again, but it doesn't count twice (and waits ~3 min to come back)
    addCoins(reward);
  } else if (ok) {
    solved.add(id);
    save.solved = [...solved];
    delete save.retryAt[id];
    save.correct += 1;
    hud.set('correct', save.correct);
    addCoins(reward);
  }
  npcs.dismiss(npc);
  paused = false;
  canvas.focus();
}

// Tap target marker: a soft ring on the ground where the character is heading.
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.5, 24),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.03;
marker.visible = false;
scene.add(marker);

// --- camera rig (third person, orbit by dragging) ---
let camYaw = player.heading; // set after the spawn/restore above
let camPitch = 0.45;
/** Seconds left of a gentle look up at the sky (aurora boreal); skyGaze eases 0 → 1 → 0. */
let skyGazeT = 0;
let skyGaze = 0;
let camDist = 9;
let camDistSmooth = 9;
let lastDragTime = -Infinity;

let walkTarget: THREE.Vector3 | null = null;
let stuckTime = 0;
const insideInteractable = new Set<Interactable>();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/** Last tap (for double taps in the water = change swimming style). */
let lastTap = { t: -1, x: 0, y: 0 };
function handleTap(x: number, y: number): void {
  // lying on a lounger / sitting on a swing: any tap (on anything) = get up first
  if (pool.lounging) {
    pool.getUp();
    return;
  }
  if (riding && !riding.seat.steer) {
    getOffSwing();
    return;
  }
  if (pool.swimming) {
    const now = performance.now();
    if (now - lastTap.t < 380 && Math.hypot(x - lastTap.x, y - lastTap.y) < 60) {
      pool.nextStroke();
      lastTap.t = -1;
      return;
    }
    lastTap = { t: now, x, y };
  }
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (driving && raycaster.intersectObject(driving.group, true).length > 0) {
    exitCar();
    return;
  }
  if (scooting && raycaster.intersectObject(scooting.group, true).length > 0) {
    exitScooter();
    return;
  }
  // on the bus: any tap = "I want to get off" (now if the doors are open, else at the next stop)
  if (onBus()) {
    requestOffBus();
    return;
  }
  // tapping a bus standing at a stop with its doors open: walk to the door (touching it gets her on)
  const bus = !driving && !scooting ? traffic.tappedBus(raycaster) : null;
  if (bus?.open && bus.door) {
    buyTarget = null;
    if (Math.hypot(bus.door.x - player.position.x, bus.door.z - player.position.z) < BUS_DOOR_R) boardBus();
    else {
      setTarget(bus.door);
      busNearDoor = false;
    }
    return;
  }
  // double tap = pick (flower, fruit); tap on a person with a present in her hand = give it (extras.ts)
  if (!driving && !scooting && snowPlay?.tap(raycaster)) return; // snowball in her hand: the tap throws it
  if (!driving && extras.tap(raycaster, x, y)) return;
  // Objects and characters first: tapping one walks the character up to it (touching it uses it).
  const targets: { object: THREE.Object3D; position: THREE.Vector3; it?: Interactable; person?: boolean }[] = [
    ...world.interactables.map((i) => ({ object: i.object as THREE.Object3D, position: i.position, it: i })),
    ...npcs.list
      .filter((n) => n.leaving === null)
      .map((n) => ({ object: n.group as THREE.Object3D, position: n.group.position, person: true })),
  ];
  const objHits = raycaster.intersectObjects(
    targets.map((t) => t.object),
    true,
  );
  if (objHits.length > 0) {
    const hit = targets.find((t) => isDescendant(objHits[0].object, t.object));
    if (hit) {
      if (hit.it?.requiresClick) {
        // shops: tapping = "I want to buy": walk there and buy on arrival (or right away if already there)
        const d = Math.hypot(hit.it.position.x - player.position.x, hit.it.position.z - player.position.z);
        if (d < Math.max(hit.it.radius, hit.it.reach ?? 0)) {
          if (hit.it.keepClear) keepAway(hit.it.position.x, hit.it.position.z, hit.it.keepClear);
          useClickable(hit.it);
          return;
        }
        buyTarget = hit.it;
      }
      // People: ALWAYS stop ≥ PERSON_CLEAR short — never walk to group.position.
      if (hit.it) setTarget(approachPoint(hit.it));
      else setTarget(approachToward(hit.position.x, hit.position.z, PERSON_CLEAR));
      return;
    }
  }
  // the ground, or something she walks on above it (USA hills, road up them, bridge deck)
  const groundHit = (world.walkable?.length ? raycaster.intersectObjects([world.ground, ...world.walkable], false) : raycaster.intersectObject(world.ground))[0];
  if (groundHit) {
    buyTarget = null; // changed her mind: walking somewhere else
    setTarget(groundHit.point);
  }
}

/** Walk-to point short of (tx,tz) by `clear` metres along the approach from the player. */
function approachToward(tx: number, tz: number, clear: number): THREE.Vector3 {
  const px = player.position.x;
  const pz = player.position.z;
  const dx = tx - px;
  const dz = tz - pz;
  const dist = Math.hypot(dx, dz);
  if (dist <= clear + 0.05) return new THREE.Vector3(px, 0, pz);
  const t = (dist - clear) / dist;
  return new THREE.Vector3(px + dx * t, 0, pz + dz * t);
}

/** A comet hit her (Moon): she lies dizzy for a minute (or what is left of it after a reload), nothing moves. */
function knockDown(seconds = 60): void {
  const fresh = knocked <= 0 && seconds >= 60;
  knocked = seconds;
  paused = true;
  clearTarget();
  input.releaseAll();
  player.prone = false;
  player.lyingY = moonHeight(player.position.x, player.position.z) + 0.15;
  if (fresh) {
    gameCtx.setFlag('moon:down', Date.now() / 1000 + seconds);
    sfx.bonk();
    void speak([gameCtx.isBoy() ? 'Ai! O cometa acertou-te! Ficas tonto um minuto.' : 'Ai! O cometa acertou-te! Ficas tonta um minuto.']);
  }
}
function getUpFromComet(quiet = false): void {
  knocked = 0;
  paused = false;
  player.lyingY = null;
  player.root.rotation.x = 0;
  player.root.rotation.z = 0;
  gameCtx.setFlag('moon:down', 0);
  lastActivity = performance.now();
  if (!quiet) gameCtx.say(['Pronto, já passou! Cuidado com os cometas.']);
}
function disposeMoonPlay(): void {
  if (knocked > 0) getUpFromComet(true);
  if (!moonPlay) return;
  moonPlay.machine.dispose();
  moonPlay.food.dispose();
  moonPlay.comets.dispose();
  moonPlay.dizzy.dispose();
  moonPlay.dust.dispose();
  moonPlay = null;
}

/** Walk-to point for an interactable: people (`keepClear`) stop ≥ PERSON_CLEAR short. */
function approachPoint(it: Interactable): THREE.Vector3 {
  const clear = it.keepClear;
  if (!clear) return new THREE.Vector3(it.position.x, 0, it.position.z);
  return approachToward(it.position.x, it.position.z, Math.max(clear, PERSON_CLEAR));
}

/** If she is closer than `clear` to (tx,tz), shove her out immediately (y = 0). */
function keepAway(tx: number, tz: number, clear = PERSON_CLEAR): void {
  // scripted lie-downs (massage table, clinic bed, pool lounger) must not be shoved / flattened
  if (player.lyingY !== null || player.airborne) return;
  const px = player.position.x;
  const pz = player.position.z;
  let dx = px - tx;
  let dz = pz - tz;
  let dist = Math.hypot(dx, dz);
  if (dist >= clear) {
    player.position.y = 0;
    return;
  }
  if (dist < 0.05) {
    dx = Math.sin(player.heading);
    dz = Math.cos(player.heading);
    dist = 1;
  }
  const s = clear / dist;
  player.position.set(tx + dx * s, 0, tz + dz * s);
  clearTarget();
}

function setTarget(p: THREE.Vector3): void {
  walkTarget = new THREE.Vector3(p.x, 0, p.z);
  marker.position.set(p.x, 0.03, p.z);
  marker.visible = true;
  stuckTime = 0;
}

function clearTarget(): void {
  walkTarget = null;
  marker.visible = false;
}

function isDescendant(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o === root) return true;
  return false;
}

/** Swimming is slower and only the pool edges stop her. */
const moveSpeed = (): number => {
  if (pool?.swimming) return pool.swimSpeed * extras.life.speedFactor();
  const moon = city.kind === 'moon';
  // no energy = slow, but always a touch faster than the creatures (cities 4.7 vs 4.6; Moon 2.7 vs 2.6)
  if (extras.life.speedFactor() < 1) return moon ? TIRED_MOON_SPEED : TIRED_WALK_SPEED;
  return moon ? MOON_WALK_SPEED : WALK_SPEED;
};
const moveObstacles = () => (pool?.swimming ? pool.waterWalls : world.obstacles);

const timer = new THREE.Timer();
timer.connect(document); // pauses the clock while the tab is hidden
let elapsed = 0;

function tick(time: number): void {
  try {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;

  const taps = input.consumeTaps();
  if (!paused) for (const t of taps) handleTap(t.x, t.y);

  const drag = input.consumeDrag();
  if (drag.dx || drag.dy) {
    camYaw -= drag.dx * 0.006;
    camPitch = THREE.MathUtils.clamp(camPitch + drag.dy * 0.004, 0.12, 1.2);
    lastDragTime = elapsed;
  }
  camDist = THREE.MathUtils.clamp(camDist + drag.zoom, 4, 20);

  // --- movement ---
  const k = input.keys;
  let speed = 0;
  const before = player.position.clone();
  // lying on a pool lounger: any arrow key or tap gets her up
  if (!paused && pool.lounging && (k.up || k.down || k.left || k.right || walkTarget)) pool.getUp();
  if (paused) {
    // standing still while talking / flying
  } else if (pool.lounging) {
    // sunbathing
  } else if (riding) {
    const sv = riding.seat;
    if (sv.steer) {
      // a ride she drives (bumper car): arrows, or steer towards a tapped spot
      let throttle = (k.up ? 1 : 0) - (k.down ? 1 : 0);
      let turn = (k.left ? 1 : 0) - (k.right ? 1 : 0);
      if (!throttle && !turn && walkTarget) {
        const pz = sv.pose(riding.i);
        const dx = walkTarget.x - pz.pos.x;
        const dz = walkTarget.z - pz.pos.z;
        let diff = Math.atan2(-dx, -dz) - pz.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        turn = THREE.MathUtils.clamp(diff * 2, -1, 1);
        throttle = Math.hypot(dx, dz) > 1.2 ? 1 : 0;
        if (!throttle) clearTarget();
      }
      sv.steer(dt, throttle, turn);
    } else if (k.up || k.down || k.left || k.right || walkTarget) {
      clearTarget();
      getOffSwing();
    }
    if (riding && sv.done?.()) getOffSwing();
  } else if (onBus()) {
    if ((k.up || k.down || k.left || k.right) && traffic.riderCanAlight()) leaveBus();
    clearTarget();
  } else if (driving) {
    let throttle = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    let steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    if (throttle || steer) clearTarget();
    else if (walkTarget) {
      // tap-to-drive: steer towards the tapped spot, slow down and stop near it
      const dx = walkTarget.x - driving.position.x;
      const dz = walkTarget.z - driving.position.z;
      const dist = Math.hypot(dx, dz);
      let diff = Math.atan2(-dx, -dz) - driving.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      steer = THREE.MathUtils.clamp(diff * 2, -1, 1);
      throttle = dist > 4 ? (Math.abs(diff) > 1.6 ? 0.3 : 0.8) : -1;
      if (dist < 4 && Math.abs(driving.speed) < 0.5) clearTarget();
    }
    if (driving.busy) {
      throttle = 0;
      steer = 0;
    }
    if (driving.drive(dt, throttle, steer)) clearTarget();
    player.heading = driving.heading; // her position is placed by the car (seat / door animation)
    speed = Math.abs(driving.speed);
  } else if (scooting) {
    let throttle = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    let steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
    if (throttle || steer) clearTarget();
    else if (walkTarget) {
      const dx = walkTarget.x - scooting.position.x;
      const dz = walkTarget.z - scooting.position.z;
      const dist = Math.hypot(dx, dz);
      let diff = Math.atan2(-dx, -dz) - scooting.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      steer = THREE.MathUtils.clamp(diff * 2, -1, 1);
      throttle = dist > 3 ? (Math.abs(diff) > 1.6 ? 0.35 : 0.9) : -1;
      if (dist < 3 && Math.abs(scooting.speed) < 0.5) clearTarget();
    }
    if (scooting.busy) {
      throttle = 0;
      steer = 0;
    }
    if (scooting.drive(dt, throttle, steer)) clearTarget();
    player.heading = scooting.heading;
    speed = Math.abs(scooting.speed);
  } else if (k.up || k.down || k.left || k.right) {
    clearTarget(); // keyboard always takes over from click-to-walk
    buyTarget = null;
    if (k.left) player.heading += TURN_SPEED * dt;
    if (k.right) player.heading -= TURN_SPEED * dt;
    const dir = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    if (dir !== 0) {
      const s = dir > 0 ? moveSpeed() : moveSpeed() * 0.6;
      speed = s;
      player.move(
        -Math.sin(player.heading) * s * dir * dt,
        -Math.cos(player.heading) * s * dir * dt,
        moveObstacles(),
      );
    }
  } else if (walkTarget) {
    const dx = walkTarget.x - player.position.x;
    const dz = walkTarget.z - player.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST) {
      clearTarget();
    } else {
      player.turnTowards(Math.atan2(-dx, -dz), 8 * dt);
      const step = Math.min(moveSpeed() * dt, dist);
      speed = moveSpeed();
      player.move((dx / dist) * step, (dz / dist) * step, moveObstacles());
      // Give up if blocked (e.g. tapped inside a building or behind a wall).
      const moved = player.position.distanceTo(before);
      stuckTime = moved < step * 0.2 ? stuckTime + dt : 0;
      if (stuckTime > 0.4) clearTarget();
    }
  }
  // normal walk cycle here; stair climbs animate after interactable.update (walkAnim is set there)
  if (!flight && scriptedWalk <= 0) {
    const animSpeed = driving ? 0 : scooting ? speed : speed * extras.life.stepFactor();
    player.update(dt, animSpeed);
  }
  // Moon hills / bridge deck: keep her feet on the surface (not during a scripted stair climb)
  if (!flight && !riding && !scooting && !pool.swimming && player.lyingY === null && scriptedWalk <= 0 && world.heightAt) {
    player.position.y = world.heightAt(player.position.x, player.position.z);
  }
  // Moon: every step is a big slow hop (low gravity); she lands with a puff of dust. Standing still = feet down.
  if (city.kind === 'moon' && !paused && !flight && player.lyingY === null && scriptedWalk <= 0) {
    if (hopU < 0 && speed > 0.01) {
      hopU = 0;
      player.hopSide = player.hopSide === 1 ? -1 : 1;
    }
    if (hopU >= 0) {
      hopU += dt / MOON_HOP_S;
      if (hopU >= 1) {
        moonPlay?.dust.puff(player.position);
        tone(70 + Math.random() * 20, 0, 0.14, 'sine', 0.05); // soft thud
        hopU = speed > 0.01 ? hopU - 1 : -1;
        player.hopSide = player.hopSide === 1 ? -1 : 1;
      }
    }
  } else hopU = -1;
  player.hop = hopU >= 0 ? hopU : null;
  if (hopU >= 0) player.position.y += MOON_HOP_H * 4 * hopU * (1 - hopU);
  moonPlay?.dust.update(dt);
  if (riding) {
    const p = riding.seat.pose(riding.i);
    player.heading = p.heading;
    if (p.stand) {
      // standing ride (trampoline, bouncy castle): upright, feet at pos.y
      player.sitting = false;
      player.lyingY = null;
      player.root.rotation.x = 0;
      player.position.set(p.pos.x, p.pos.y, p.pos.z);
    } else if (p.lying) {
      // in bed: Character.update lays her on her back at this height
      player.sitting = false;
      player.lyingY = p.pos.y;
      player.position.set(p.pos.x, p.pos.y, p.pos.z);
    } else {
      player.sitting = true; // (a ride can switch from standing to sitting: playground slide climb → slide)
      player.root.rotation.order = 'YXZ';
      player.root.rotation.y = p.heading;
      player.root.rotation.x = p.tilt;
      player.position.set(p.pos.x, p.pos.y - 0.7, p.pos.z);
    }
    rideY = player.position.y;
  }

  // --- touch-to-interact (edge triggered: fires once when the character reaches the object) ---
  for (const it of world.interactables) {
    if (onBus() || scooting) break; // riding past things doesn't touch them
    const d = Math.hypot(it.position.x - player.position.x, it.position.z - player.position.z);
    if (it.requiresClick) {
      // only when the child asked for it (tap, or Enter next to it)
      if (buyTarget === it && d < it.radius) {
        buyTarget = null;
        clearTarget();
        if (it.keepClear && d < PERSON_PUSH) keepAway(it.position.x, it.position.z, it.keepClear);
        useClickable(it);
      }
      continue;
    }
    if (d < it.radius) {
      // People: if already too close (teleport, escape bug, etc.), shove out before greeting.
      if (it.keepClear && d < PERSON_PUSH) keepAway(it.position.x, it.position.z, Math.max(it.keepClear, PERSON_CLEAR));
      if (!insideInteractable.has(it)) {
        insideInteractable.add(it);
        it.interact({ player: player.position });
      }
    } else if (d > it.radius + 0.5) {
      insideInteractable.delete(it);
    }
  }
  // Hard separation every frame: teleports, rides, escape bugs and strolling NPCs must never leave her inside a person.
  if (!driving && !scooting && !onBus() && !flight && !riding && !pool?.swimming) {
    for (const it of world.interactables) {
      if (!it.keepClear) continue;
      const d = Math.hypot(it.position.x - player.position.x, it.position.z - player.position.z);
      if (d < it.keepClear) keepAway(it.position.x, it.position.z, it.keepClear);
    }
    for (const n of npcs.list) {
      if (n.leaving !== null) continue;
      const d = Math.hypot(n.group.position.x - player.position.x, n.group.position.z - player.position.z);
      if (d < PERSON_CLEAR) keepAway(n.group.position.x, n.group.position.z, PERSON_CLEAR);
    }
  }
  world.update(dt);
  updateEating(dt);

  // --- kitten stuck in a tree: touch the trunk to climb up and rescue it ---
  catTree.update(dt, player.position);
  catTree.idleAfter(dt);
  if (!paused && !driving && !scooting && !flight && !onBus() && catTree.waiting) {
    const tp = catTree.interactable.position;
    if (Math.hypot(player.position.x - tp.x, player.position.z - tp.z) < 1.75) {
      paused = true;
      rescuing = true;
      clearTarget();
      input.releaseAll();
      catTree.begin(player.root, () => {
        addCoins(CAT_REWARD);
        feel('rescue');
      });
    }
  }
  if (rescuing) {
    player.heading = Math.PI; // facing the trunk (rungs on its -Z side)
    player.update(dt, catTree.active ? 3 : 0);
    if (!catTree.active) {
      rescuing = false;
      paused = false;
      player.position.y = 0;
      canvas.focus();
    }
  }

  // --- idle for 30 s → pause (so the creatures don't eat all the coins) ---
  // (not while she's watching the concert — standing still is the whole point there)
  if (!paused && !flight && !onBus() && hospitalPhase === 'none' && !concert.isInside() && !pool.isInside() && !house.isInside() && !fair.isInside() && performance.now() - lastActivity > IDLE_MS) void idlePause();
  for (const it of world.interactables) it.update?.(dt);
  // the tower climbs' "never leave her floating" safety (landmarks / play / usa) drops anyone high up to y = 0:
  // a ride (slide, roller coaster…) keeps the height it set this frame
  if (riding) player.position.y = rideY;
  // climb updates set walkAnim after the early player.update — refresh the walk cycle same frame
  if (scriptedWalk > 0 && !flight && !rescuing) player.update(dt, scriptedWalk);

  // --- coins & jewels ---
  const got = collectibles.update(dt, onBus() ? NOWHERE : player.position);
  if (got.value > 0) {
    const jewels = got.kinds.filter((k) => k === 'jewel').length;
    if (jewels > 0) {
      save.jewels += jewels;
      hud.set('jewels', save.jewels + save.diamonds);
      refreshBag();
    }
    addCoins(got.value);
    extras.collected(got.kinds);
    if (got.kinds.includes('jewel')) sfx.jewel();
    else sfx.coin();
  }

  extras.update(dt, !paused && !flight);

  // --- creatures ---
  const ev = monsters.update(dt, player.position, save.coins, paused || onBus());
  if (ev.say && !paused) taunt(ev.say);
  if (ev.hit) hurt(ev.hit, HIT_COST);

  // --- street trouble (football fans, bar scuffle) and traffic ---
  trouble.update(dt);
  traffic.update(dt);
  updateBus(dt);
  concert.update(dt);
  pool.update(dt, k.up || k.down || walkTarget !== null, walkTarget);
  house.update(dt);
  fair.update(dt);
  services?.update(dt);
  updateHospital(dt);
  weather.update(dt);
  aurora?.update(dt);
  snowPlay?.update(dt);
  streetLights.update(dt, weather.daylight, camera);
  if (knock.lengthSq() > 0.05) {
    player.move(knock.x * dt, knock.z * dt, world.obstacles);
    knock.multiplyScalar(Math.exp(-7 * dt));
  }
  if (invulnerable > 0) {
    invulnerable -= dt;
    player.root.visible = invulnerable <= 0 || Math.floor(invulnerable * 10) % 2 === 0;
  }

  // --- travel: 100 coins -> airport (or Cabo Canaveral rocket on the USA level) ---
  airport.update(dt);
  spaceport?.update(dt);
  usaLandmarks?.update(dt);
  if (moonPlay) {
    moonPlay.machine.update(dt);
    moonPlay.food.update(dt);
    moonPlay.comets.update(dt, !paused && !save.finished);
    if (knocked > 0) {
      knocked -= dt;
      paused = true; // menus may un-pause; she stays down until the minute is over
      clearTarget();
      player.lyingY = moonHeight(player.position.x, player.position.z) + 0.15;
      if (knocked <= 0) getUpFromComet();
    }
    moonPlay.dizzy.update(dt, knocked > 0, player.position);
  }
  car.update(dt);
  scooter.update(dt);
  if (!flight && !leavesByRocket()) airport.setDoorOpen(readyToTravel());
  if (!flight && spaceport) spaceport.setReady(readyToTravel());
  notEnoughCooldown -= dt;
  if (!paused && readyToTravel() && !travelHintGiven) {
    travelHintGiven = true;
    const next = cityAt(save.level + 1);
    if (leavesByRocket()) {
      showBanner('Vai ao foguetão!  🚀', 4000);
      void speak(['Boa! Juntaste cem moedas!', `Vai a Cabo Canaveral e sobe no foguetão para ${next.dest ?? next.name}!`]);
    } else {
      showBanner('Vai ao aeroporto!  ✈️', 4000);
      void speak(['Boa! Juntaste cem moedas!', `Vai ao aeroporto e apanha o avião para ${next.dest ?? next.name}!`]);
    }
  }
  if (!paused && !flight && !driving && !scooting && !onBus() && city.kind !== 'moon') {
    const b = leavesByRocket() && spaceport ? spaceport.boardPoint : airport.boardPoint;
    if (Math.hypot(player.position.x - b.x, player.position.z - b.z) < 1.6) {
      if (readyToTravel()) startFlight();
      else if (!lastLevel() && notEnoughCooldown <= 0) {
        notEnoughCooldown = 8;
        void speak([`Para viajar precisas de ${COINS_PER_LEVEL} moedas. Tens ${save.coins}!`]);
      }
    }
  }
  const board = leavesByRocket() && spaceport ? spaceport.boardPoint : airport.boardPoint;
  setCompass(readyToTravel() && !flight ? Math.atan2(board.x - player.position.x, board.z - player.position.z) - camYaw : null);

  // --- question characters ---
  const met = npcs.update(dt, player.position, paused || onBus());
  if (met && !paused && !driving && !onBus()) void meet(met); // also on the scooter (Telmo, 2026-11-19)
  wanderCat.update(dt, player.position, paused);
  butterflies.update(dt, player.position, paused);
  rabbit.update(dt, player.position, paused);
  streetSinger.update(dt, player.position, paused);
  postman.update(dt, player.position, paused);
  livingStatue.update(dt, player.position, paused);

  // --- camera follows behind the character, unless the player is looking around ---
  const turning = k.left || k.right;
  if ((speed > 0 || turning) && elapsed - lastDragTime > 1.5) {
    let diff = player.heading - camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    camYaw += diff * Math.min(1, dt * 2.5);
  }
  if (aerial) {
    if (aerial.turn && aerial.fromX !== undefined && aerial.fromZ !== undefined) {
      // tower-top lookout: dragging / ←→ turn the shot (Telmo, 2026-11-21: "não posso girar a vista").
      // The shot starts as authored; camYaw (drag + arrows, as on the ground) then rotates it about a pivot:
      // her own spot when the camera stands beside her (view from the top), else the point it looks at (orbit).
      if (Number.isNaN(aerialYaw0)) {
        yawBeforeAerial = camYaw;
        camYaw = Math.atan2(aerial.fromX - aerial.x, aerial.fromZ - aerial.z);
        player.heading = camYaw; // face the view, so the follow-behind doesn't swing it back
        aerialYaw0 = camYaw;
      }
      const dFrom = Math.hypot(aerial.fromX - player.position.x, aerial.fromZ - player.position.z);
      const dLook = Math.hypot(aerial.x - player.position.x, aerial.z - player.position.z);
      const px = dFrom < dLook ? player.position.x : aerial.x;
      const pz = dFrom < dLook ? player.position.z : aerial.z;
      const d = camYaw - aerialYaw0;
      const c = Math.cos(d);
      const s = Math.sin(d);
      const rot = (x: number, z: number): [number, number] => [px + (x - px) * c + (z - pz) * s, pz - (x - px) * s + (z - pz) * c];
      const [cx, cz] = rot(aerial.fromX, aerial.fromZ);
      const [lx, lz] = rot(aerial.x, aerial.z);
      camera.position.set(cx, aerial.h, cz);
      camera.lookAt(lx, aerial.lookY ?? 1.0, lz);
    } else if (aerial.fromX !== undefined && aerial.fromZ !== undefined) {
      camera.position.set(aerial.fromX, aerial.h, aerial.fromZ);
      camera.lookAt(aerial.x, aerial.lookY ?? 1.0, aerial.z);
    } else {
      camera.position.set(aerial.x, aerial.h, aerial.z + aerial.h * 0.35);
      camera.lookAt(aerial.x, aerial.lookY ?? 0, aerial.z);
    }
  } else if (hospitalPhase === 'bed') {
    const shot = hospitalShot();
    camera.position.lerp(shot.pos, Math.min(1, dt * 3));
    camera.lookAt(shot.look);
  } else if (flight) {
    const shot = flight.update(dt);
    camera.position.lerp(shot.pos, Math.min(1, dt * 4));
    camera.lookAt(shot.look);
    if (flight.done) endFlight();
  } else {
  const target = player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
  // Moon hops: the camera rises only a quarter of each hop and glides (no shaking)
  if (city.kind === 'moon') {
    const want = target.y - (hopU >= 0 ? MOON_HOP_H * 4 * hopU * (1 - hopU) * 0.75 : 0);
    camHopY = camHopY === null ? want : camHopY + (want - camHopY) * Math.min(1, dt * 4);
    target.y = camHopY;
  } else camHopY = null;
  // on a ride (fair, playground, swing…) keep a wide shot: no zoom-in (Telmo, 2026-11-19)
  const wanted = driving || scooting || onBus() ? Math.max(camDist, 12) : riding ? Math.max(camDist, 10) : camDist;
  // don't let the camera end up inside a building: walk out from her towards the camera and stop before a wall
  // inside the house the roof is hidden; camera stays normal (third-person), walls don't block while she's indoors
  skyGazeT = Math.max(0, skyGazeT - dt);
  skyGaze += ((skyGazeT > 0 && !riding ? 1 : 0) - skyGaze) * Math.min(1, dt * 1.2);
  const pitch = THREE.MathUtils.lerp(camPitch, 0.14, skyGaze);
  const dir = new THREE.Vector3(Math.sin(camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(camYaw) * Math.cos(pitch));
  let dist = wanted;
  const indoors = house.isInside();
  for (let d = 1.2; !riding && d <= wanted; d += 0.4) {
    const px = target.x + dir.x * d;
    const pz = target.z + dir.z * d;
    const py = target.y + dir.y * d;
    if (py > 7) break; // above most rooftops
    // low things (fences, the concert crowd, the stage) only block the camera below their height
    // house walls are skipped while she's inside so the normal camera still works
    if (world.obstacles.some((o) => {
      if (o === driving?.obstacleBox || o === scooting?.obstacleBox) return false;
      if (indoors && o === house.interior) return false;
      if (indoors && house.interior && px > house.interior.minX - 0.5 && px < house.interior.maxX + 0.5 && pz > house.interior.minZ - 0.5 && pz < house.interior.maxZ + 0.5) return false;
      if (o.height !== undefined && py > o.height + 0.4) return false;
      return px > o.minX - 0.3 && px < o.maxX + 0.3 && pz > o.minZ - 0.3 && pz < o.maxZ + 0.3;
    })) {
      dist = Math.max(1.5, d - 0.6);
      break;
    }
  }
  camDistSmooth += (dist - camDistSmooth) * Math.min(1, dt * (dist < camDistSmooth ? 12 : 3));
  camera.position.copy(target).addScaledVector(dir, camDistSmooth);
  if (skyGaze > 0.01) camera.lookAt(target.x - dir.x * 20 * skyGaze, target.y + 11 * skyGaze, target.z - dir.z * 20 * skyGaze);
  else camera.lookAt(target);
  }

  if (DEBUG) {
    try {
      const first = world.interactables[0];
      const lamp = first?.object?.children?.find((c) => c instanceof THREE.PointLight);
      document.body.dataset.debug = JSON.stringify({
        x: +player.position.x.toFixed(2),
        y: +player.position.y.toFixed(2),
        z: +player.position.z.toFixed(2),
        lyingY: player.lyingY,
        prone: player.prone,
        h: +player.heading.toFixed(2),
        suit: player.spacesuit,
        hop: +hopU.toFixed(2),
        moonItems: city.kind === 'moon' ? collectibles.outsideStats() : null,
        legs: player.legPitches().map((v) => +v.toFixed(3)),
        walkAnim: +scriptedWalk.toFixed(2),
        camYaw: +camYaw.toFixed(2),
        lamp: (lamp as THREE.PointLight | undefined)?.intensity ?? null,
        coins: save.coins,
        jewels: save.jewels,
        correct: save.correct,
        jewelAt: collectibles.jewelPositions(),
        solved: save.solved.length,
        level: save.level,
        city: city.name,
        kind: city.kind ?? null,
        finished: save.finished,
        diamonds: save.diamonds,
        difficulty: save.difficulty,
        monsterCount: monsters.positions().length,
        npcsInside: npcs.list.filter((n) => !isFree(n.group.position.x, n.group.position.z, 0.6, world.obstacles)).length,
        npcPos: npcs.list.map((n) => [+n.group.position.x.toFixed(1), +n.group.position.z.toFixed(1)]),
        rescuing,
        hospital: hospitalPhase,
        hospitalLeft: Math.max(0, save.hospitalUntil - Date.now()),
        carried: carriedKind,
        bag: save.bag,
        weather: weather.state,
        daylight: +weather.daylight.toFixed(2),
        hour: +weather.localHour.toFixed(2),
        lamps: [streetLights.litCount(), streetLights.count()],
        lampPosts: streetLights.positions(),
        traffic: traffic.positions().slice(0, 3),
        trouble: trouble.positions(),
        sites: trouble.sites(),
        concert: concert.debug(),
        rodeo: asRodeo(concert)?.debug() ?? null,
        riding: riding ? riding.i : null,
        house: house.debug(),
        fair: fair.debug(),
        services: services?.debug() ?? null,
        extras: extras.debug(),
        usa: usaLandmarks?.debug() ?? null,
        aurora: aurora?.debug() ?? null,
        snow: snowPlay?.debug() ?? null,
        landmarks: landmarksDebug(),
        wear: save.wear,
        onBus: onBus(),
        bus: traffic.busDebug(),
        buy: buyTarget ? [+buyTarget.position.x.toFixed(1), +buyTarget.position.z.toFixed(1)] : null,
        pool: pool.debug(),
        catAt: [+catTree.interactable.position.x.toFixed(1), +catTree.interactable.position.z.toFixed(1)],
        walkCat: wanderCat.debug(),
        butterflies: butterflies.debug(),
        rabbit: rabbit.debug(),
        parrot: parrot.debug(),
        singer: streetSinger.debug(),
        postman: postman.debug(),
        statue: livingStatue.debug(),
        rainSound: save.rainSound,
        flying: !!flight,
        character: save.character,
        things: world.interactables.map((i) => [+i.position.x.toFixed(1), +i.position.z.toFixed(1), i.radius]),
        moon: moonPlay ? { ...moonPlay.machine.debug(), knocked: +knocked.toFixed(1), energy: save.energy } : null,
        driving: !!driving,
        car: [+car.position.x.toFixed(1), +car.position.z.toFixed(1), +car.speed.toFixed(1)],
        scooter: scooter.debug(),
        scooting: !!scooting,
        visible: player.root.visible,
        board: [airport.boardPoint.x, airport.boardPoint.z],
        plane: [+airport.plane.position.x.toFixed(1), +airport.plane.position.y.toFixed(1)],
        voices: voiceInfo(),
        monsters: monsters.positions(),
        invulnerable: +invulnerable.toFixed(2),
        retry: Object.keys(save.retryAt),
        spoken: spokenLog,
        paused,
        npcs: npcs.list
          .filter((n) => n.leaving === null)
          .map((n) => ({ x: +n.group.position.x.toFixed(1), z: +n.group.position.z.toFixed(1), q: n.question.id })),
      });
    } catch (err) {
      document.body.dataset.debug = JSON.stringify({
        level: save.level,
        city: city.name,
        kind: city.kind ?? null,
        debugError: String(err),
      });
    }
  }

  marker.rotation.z += dt * 2;
  renderer.render(scene, camera);
  } catch (err) {
    if (DEBUG) {
      console.error('tick', err);
      document.body.dataset.debug = JSON.stringify({
        level: save.level,
        city: city?.name,
        kind: city?.kind ?? null,
        tickError: String(err),
      });
    }
  }
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);


function applyCharacter(id: string): void {
  save.character = id;
  writeSave(save);
  player.setCharacter(id);
  setAvatar(id);
}

/** "Novo jogo": everything back to zero (keeps the chosen character and the settings). */
function newGame(announce = true): void {
  hospitalPhase = 'none';
  player.root.rotation.x = 0;
  hospital?.setAmbulanceLights(false);
  driving = null; // the old car is thrown away with the city
  forceOffScooter();
  player.root.scale.setScalar(1);
  player.root.visible = true;
  rescuing = false;
  buyTarget = null;
  holdItem(null);
  Object.assign(save, { wear: {}, bag: {}, hospitalUntil: 0, coins: 0, level: 0, finished: false, jewels: 0, correct: 0, solved: [], retryAt: {}, pos: null, visited: [] });
  extras.reset(); // energy, mood, diamonds, module flags
  solved.clear();
  player.setWear(save.wear);
  hud.set('coins', 0);
  hud.set('jewels', 0);
  hud.set('correct', 0);
  loadCity();
  refreshBag();
  writeSave(save);
  if (announce) showArrival(city.arrival);
}

/** City picker in the settings: only on the dev server (localhost) or with `?debug` — never in the published game. */
const CITY_PICKER = import.meta.env.DEV || DEBUG;

/** City picked in the settings on this visit to the main page: "Novo jogo" then starts there (testing). */
let pickedLevel: number | null = null;
/** "Novo jogo", but in the city picked for testing (if any). */
function newGameAt(): void {
  newGame(pickedLevel === null);
  if (pickedLevel !== null) {
    jumpToCity(pickedLevel);
    showArrival(city.arrival);
  }
}

/** Testing: go straight to a level (coins, jewels and answers stay as they are). */
function jumpToCity(level: number): void {
  if (level === save.level) return;
  hospitalPhase = 'none';
  save.hospitalUntil = 0;
  player.root.rotation.x = 0;
  hospital?.setAmbulanceLights(false);
  driving = null; // the old car is thrown away with the city
  forceOffScooter();
  player.root.scale.setScalar(1);
  player.root.visible = true;
  rescuing = false;
  buyTarget = null;
  holdItem(null);
  save.level = level;
  save.pos = null;
  writeSave(save);
  loadCity();
}

/** Start screen on every launch: pick a character, then continue where you were or start from zero. */
async function startScreen(): Promise<void> {
  paused = true;
  const canContinue = save.character !== null;
  pickedLevel = null;
  const { id, mode } = await chooseCharacter(save.character ?? undefined, mainPageOptions(canContinue));
  applyCharacter(id);
  if (mode === 'new') newGameAt();
  lastActivity = performance.now();
  paused = false;
  canvas.focus();
}

let menuOpen = false;
const setAvatar = createAvatarButton(save.character ?? 'princesa', () => {
  // the main page is reachable from anywhere (also from the hospital bed) — except mid-flight or mid-question
  if (menuOpen || flight || document.querySelector('.quiz')) return;
  void openMainPage();
});

/** In-game: back to the main page. "Continuar" resumes exactly where she was; "Novo jogo" restarts. */
async function openMainPage(): Promise<void> {
  menuOpen = true;
  leaveBus(true);
  forceOffScooter();
  const wasPaused = paused;
  paused = true;
  clearTarget();
  input.releaseAll();
  pickedLevel = null;
  const { id, mode } = await chooseCharacter(save.character ?? undefined, mainPageOptions(true));
  applyCharacter(id);
  if (mode === 'new') {
    newGameAt();
    paused = false;
  } else {
    paused = wasPaused || hospitalPhase === 'bed';
  }
  menuOpen = false;
  lastActivity = performance.now();
  canvas.focus();
}

function mainPageOptions(canContinue: boolean) {
  return {
    canContinue,
    difficulty: save.difficulty,
    onDifficulty: (d: 'zero' | 'facil' | 'medio' | 'dificil') => {
      save.difficulty = d;
      monsters.difficulty = DIFFICULTY_FACTOR[d];
      writeSave(save);
    },
    rainSound: save.rainSound,
    onRainSound: (r: RainSound) => {
      save.rainSound = r;
      weather.rainVolume = RAIN_SOUND_FACTOR[r];
      writeSave(save);
    },
    cities: CITY_PICKER
      ? { names: CITIES.map((c) => c.name), get: () => save.level, set: (level: number) => {
            pickedLevel = level;
            jumpToCity(level);
          } }
      : undefined,
  };
}
// settings (monster difficulty) live on the start page
void startScreen().then(() => {
  if (save.hospitalUntil > Date.now()) {
    paused = true;
    enterBed();
  }
});
