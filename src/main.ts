import * as THREE from 'three';
import { CHARACTER_RADIUS, Character } from './character';
import { Input } from './input';
import { SPAWN, createWorld, mulberry32, type Interactable } from './world';
import { createProps } from './props';
import { Collectibles } from './collectibles';
import { Npcs, type QuestionNpc } from './npcs';
import { loadSave, writeSave } from './save';
import { Hud, askQuestion, createHomeButton, setCompass, setFade, showArrival, showBanner, showCityName, showTravel } from './ui';
import { speak, sfx, spokenLog, taunt, voiceInfo } from './audio';
import { CITIES, COINS_PER_LEVEL, cityAt } from './cities';
import { Monsters } from './monsters';
import { Airport } from './airport';
import { Flight } from './flight';
import { Car } from './car';
import { createBeggar } from './beggar';
import { chooseCharacter, createAvatarButton } from './select';
import { CAT_REWARD, CatTree } from './cattree';
import { createShops } from './shops';
import { Trouble } from './trouble';
import { Traffic } from './traffic';
import { createHospital, type Hospital } from './hospital';
import { Weather } from './weather';
import type { GameCtx } from './gamectx';
import { DIFFICULTY_FACTOR, createSettingsButton, showIdlePause } from './ui';
import { isFree } from './spawn';

const WALK_SPEED = 6.5; // m/s
const TURN_SPEED = 2.6; // rad/s (arrow keys)
const ARRIVE_DIST = 0.6;
/** `?debug` exposes state on <body data-debug> and accepts teleports, for automated browser checks. */
const DEBUG = new URLSearchParams(location.search).has('debug');
/** Debug-only aerial camera (null = normal camera). */
let aerial: { x: number; z: number; h: number } | null = null;
if (DEBUG) {
  window.addEventListener('rainbow-teleport', (e) => {
    const { x, z, h } = (e as CustomEvent<{ x: number; z: number; h: number }>).detail;
    player.position.set(x, 0, z);
    player.heading = h;
  });
  window.addEventListener('rainbow-aerial', (e) => {
    aerial = (e as CustomEvent<null | { x: number; z: number; h: number }>).detail;
  });
  window.addEventListener('rainbow-hospital-end', () => {
    save.hospitalUntil = Date.now();
  });
  window.addEventListener('rainbow-coins', (e) => {
    save.coins = (e as CustomEvent<number>).detail;
    hud.set('coins', save.coins);
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
let world = createWorld(scene, city);
const player = new Character(save.character ?? 'princesa');
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
let collectibles = new Collectibles(scene, world.obstacles);
let npcs = new Npcs(scene, world.obstacles, questionAvailable, player.position);
let monsters = new Monsters(scene, world.obstacles);
monsters.difficulty = DIFFICULTY_FACTOR[save.difficulty];
let airport = new Airport(scene, world.obstacles);
let catTree: CatTree; // assigned by addCityExtras()
let trouble: Trouble;
let traffic: Traffic;
let hospital: Hospital;
const HIT_FLASH = 1.5;
const RUN_OVER_COST = 30;
const HOSPITAL_MS = 5 * 60 * 1000;

/** Item in her hand (bread, ice cream...), attached to the character in the world. */
let carriedObj: THREE.Object3D | null = null;
let carriedKind: string | null = null;

/** What gameplay modules may ask of the game (see gamectx.ts). */
const gameCtx: GameCtx = {
  get player() {
    return player.position;
  },
  heading: () => player.heading,
  coins: () => save.coins,
  addCoins: (n) => addCoins(n),
  hurt: (from, cost) => hurt(from, cost),
  setCarried(item, kind) {
    if (carriedObj) carriedObj.parent?.remove(carriedObj);
    carriedObj = item;
    carriedKind = item ? (kind ?? 'item') : null;
    if (item) {
      item.position.set(0.42, 1.0, -0.32); // in front of her right hand
      player.root.add(item);
    }
  },
  carried: () => carriedKind,
  isDriving: () => !!driving,
  isPaused: () => paused,
};

/** Knock her away from `from`, flash, lose `cost` coins. False if she can't be hurt right now. */
function hurt(from: THREE.Vector3, cost: number): boolean {
  if (paused || driving || flight || invulnerable > 0) return false;
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
// restore after every obstacle (incl. the airport) exists, so she can never reappear inside something
player.position.set(SPAWN.x, 0, SPAWN.z);
player.heading = SPAWN.h;
if (save.pos && isFree(save.pos.x, save.pos.z, CHARACTER_RADIUS, world.obstacles)) {
  player.position.set(save.pos.x, 0, save.pos.z);
  player.heading = save.pos.h;
}

/** Hand-made interactive situations in every city: a car to drive and someone to give a coin to. */
function addCityExtras(): Car {
  const c = new Car(scene, world.obstacles, new THREE.Vector3(-16, 0, 7), Math.PI / 2, city.buildings[0], () => enterCar());
  world.interactables.push(c.interactable);
  world.interactables.push(
    createBeggar(scene, world.obstacles, new THREE.Vector3(-8, 0, -8), {
      coins: () => save.coins,
      giveCoin: () => addCoins(-1),
    }),
  );
  // playground props (swing, fountain, xylophone, cat, dog...) — placed last so they avoid everything else
  world.interactables.push(...createProps(scene, world.obstacles, mulberry32(city.seed * 97 + 1)));
  catTree = new CatTree(scene, world.obstacles, mulberry32(city.seed * 31 + 5));
  hospital = createHospital(scene, world.obstacles, mulberry32(city.seed * 41 + 9));
  world.interactables.push(...createShops(scene, world.obstacles, mulberry32(city.seed * 13 + 7), gameCtx));
  trouble = new Trouble(scene, world.obstacles, mulberry32(city.seed * 17 + 3), gameCtx);
  traffic = new Traffic(scene, world.obstacles, gameCtx, (carPos) => runOver(carPos));
  world.interactables.push(catTree.interactable);
  if (!save.visited.includes(city.name)) save.visited.push(city.name);
  return c;
}

/** Rebuild everything for the current level's city (in place, no page reload). */
function loadCity(): void {
  scene.clear();
  city = cityAt(save.level);
  world = createWorld(scene, city);
  scene.add(player.root, marker);
  player.position.set(SPAWN.x, 0, SPAWN.z);
  player.heading = SPAWN.h;
  camYaw = SPAWN.h;
  insideInteractable.clear();
  collectibles = new Collectibles(scene, world.obstacles);
  npcs = new Npcs(scene, world.obstacles, questionAvailable, player.position);
  monsters = new Monsters(scene, world.obstacles);
  monsters.difficulty = DIFFICULTY_FACTOR[save.difficulty];
  airport = new Airport(scene, world.obstacles);
  car = addCityExtras();
  cityPill.textContent = city.name;
  weather.setLights({ hemi: world.hemi, sun: world.sun });
  void weather.setCity(city.name);
  gameCtx.setCarried(null);
}

/** Travel = walk to the airport, board the plane, fly, land in the next city. */
let flight: Flight | null = null;
let travelHintGiven = false;
let notEnoughCooldown = 0;
const lastLevel = () => save.level >= CITIES.length - 1;
const readyToTravel = () => save.coins >= COINS_PER_LEVEL && !lastLevel();

function startFlight(): void {
  paused = true;
  clearTarget();
  input.releaseAll();
  sfx.travel();
  const next = cityAt(save.level + 1);
  flight = new Flight(
    airport,
    player,
    () => {
      save.coins -= COINS_PER_LEVEL;
      save.level += 1;
      save.pos = null;
      writeSave(save);
      hud.set('coins', save.coins);
      loadCity();
      player.root.visible = false;
      return airport;
    },
    setFade,
    () => showBanner(`A voar para ${next.name}  ✈️`, 4000),
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

/** Last city: the whole journey is done. */
async function finishJourney(): Promise<void> {
  paused = true;
  input.releaseAll();
  sfx.travel();
  await showTravel(null);
  save.finished = true;
  writeSave(save);
  paused = false;
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
    player.position.set(SPAWN.x, 0, SPAWN.z);
    player.heading = SPAWN.h;
    camYaw = SPAWN.h;
    savePosition();
    setFade(false);
    canvas.focus();
  }, 600);
});

let rescuing = false;

/** Real weather of the current city (Open-Meteo), re-applied on every city change. */
const weather = new Weather(scene, { hemi: world.hemi, sun: world.sun }, camera);
void weather.setCity(city.name);

/** Hospital: run over → fall → white fade → lying in the hospital bed while the clock fills (5 min). */
let hospitalPhase: 'none' | 'fall' | 'bed' = 'none';
let hospitalT = 0;
function runOver(carPos: THREE.Vector3): void {
  if (paused || driving || flight || hospitalPhase !== 'none') return;
  addCoins(-RUN_OVER_COST);
  sfx.bonk();
  paused = true;
  clearTarget();
  input.releaseAll();
  gameCtx.setCarried(null);
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
  if (paused || flight || driving) return;
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

// Space / Enter gets out of the car (tapping the car does too)
window.addEventListener('keydown', (e) => {
  if (driving && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault();
    exitCar();
  }
});

// creature hits: brief knockback + blinking, during which she can't be hit again
const knock = new THREE.Vector3();
let invulnerable = 0;

/** Remember where the character is, so a reload continues from the same spot. */
function savePosition(): void {
  if (flight) return; // mid-flight positions (stairs, cabin) are not places to resume from
  save.pos = { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2), h: +player.heading.toFixed(3) };
  writeSave(save);
}
setInterval(savePosition, 2000);
window.addEventListener('pagehide', savePosition);
/** True while a question is on screen: the character stands still. */
let paused = false;

function addCoins(n: number): void {
  save.coins = Math.max(0, save.coins + n);
  hud.set('coins', save.coins);
  writeSave(save);
}

async function meet(npc: QuestionNpc): Promise<void> {
  paused = true;
  clearTarget();
  input.releaseAll();
  // face each other
  const dx = npc.group.position.x - player.position.x;
  const dz = npc.group.position.z - player.position.z;
  player.heading = Math.atan2(-dx, -dz);
  const id = npc.question.id;
  save.retryAt[id] = Date.now() + RETRY_DELAY_MS; // set now: reloading mid-question can't give an instant retry
  writeSave(save);
  const ok = await askQuestion(npc.question, QUESTION_REWARD);
  if (ok) {
    solved.add(id);
    save.solved = [...solved];
    delete save.retryAt[id];
    save.correct += 1;
    hud.set('correct', save.correct);
    addCoins(QUESTION_REWARD);
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

function handleTap(x: number, y: number): void {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (driving && raycaster.intersectObject(driving.group, true).length > 0) {
    exitCar();
    return;
  }
  // Objects and characters first: tapping one walks the character up to it (touching it uses it).
  const targets = [
    ...world.interactables.map((i) => ({ object: i.object as THREE.Object3D, position: i.position })),
    ...npcs.list
      .filter((n) => n.leaving === null)
      .map((n) => ({ object: n.group as THREE.Object3D, position: n.group.position })),
  ];
  const objHits = raycaster.intersectObjects(
    targets.map((t) => t.object),
    true,
  );
  if (objHits.length > 0) {
    const hit = targets.find((t) => isDescendant(objHits[0].object, t.object));
    if (hit) {
      setTarget(hit.position);
      return;
    }
  }
  const groundHit = raycaster.intersectObject(world.ground)[0];
  if (groundHit) setTarget(groundHit.point);
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

const timer = new THREE.Timer();
timer.connect(document); // pauses the clock while the tab is hidden
let elapsed = 0;

function tick(time: number): void {
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
  if (paused) {
    // standing still while talking / flying
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
  } else if (k.up || k.down || k.left || k.right) {
    clearTarget(); // keyboard always takes over from click-to-walk
    if (k.left) player.heading += TURN_SPEED * dt;
    if (k.right) player.heading -= TURN_SPEED * dt;
    const dir = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    if (dir !== 0) {
      const s = dir > 0 ? WALK_SPEED : WALK_SPEED * 0.6;
      speed = s;
      player.move(
        -Math.sin(player.heading) * s * dir * dt,
        -Math.cos(player.heading) * s * dir * dt,
        world.obstacles,
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
      const step = Math.min(WALK_SPEED * dt, dist);
      speed = WALK_SPEED;
      player.move((dx / dist) * step, (dz / dist) * step, world.obstacles);
      // Give up if blocked (e.g. tapped inside a building or behind a wall).
      const moved = player.position.distanceTo(before);
      stuckTime = moved < step * 0.2 ? stuckTime + dt : 0;
      if (stuckTime > 0.4) clearTarget();
    }
  }
  if (!flight) player.update(dt, driving ? 0 : speed);

  // --- touch-to-interact (edge triggered: fires once when the character reaches the object) ---
  for (const it of world.interactables) {
    const d = Math.hypot(it.position.x - player.position.x, it.position.z - player.position.z);
    if (d < it.radius) {
      if (!insideInteractable.has(it)) {
        insideInteractable.add(it);
        it.interact({ player: player.position });
      }
    } else if (d > it.radius + 0.5) {
      insideInteractable.delete(it);
    }
  }
  world.update(dt);

  // --- kitten stuck in a tree: touch the trunk to climb up and rescue it ---
  catTree.update(dt, player.position);
  catTree.idleAfter(dt);
  if (!paused && !driving && !flight && catTree.waiting) {
    const tp = catTree.interactable.position;
    if (Math.hypot(player.position.x - tp.x, player.position.z - tp.z) < 1.75) {
      paused = true;
      rescuing = true;
      clearTarget();
      input.releaseAll();
      catTree.begin(player.root, () => addCoins(CAT_REWARD));
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
  if (!paused && !flight && hospitalPhase === 'none' && performance.now() - lastActivity > IDLE_MS) void idlePause();
  for (const it of world.interactables) it.update?.(dt);

  // --- coins & jewels ---
  const got = collectibles.update(dt, player.position);
  if (got.value > 0) {
    const jewels = got.kinds.filter((k) => k === 'jewel').length;
    if (jewels > 0) {
      save.jewels += jewels;
      hud.set('jewels', save.jewels);
    }
    addCoins(got.value);
    if (got.kinds.includes('jewel')) sfx.jewel();
    else sfx.coin();
  }

  // --- creatures ---
  const ev = monsters.update(dt, player.position, save.coins, paused);
  if (ev.say && !paused) taunt(ev.say);
  if (ev.hit) hurt(ev.hit, HIT_COST);

  // --- street trouble (football fans, bar scuffle) and traffic ---
  trouble.update(dt);
  traffic.update(dt);
  updateHospital(dt);
  weather.update(dt);
  if (knock.lengthSq() > 0.05) {
    player.move(knock.x * dt, knock.z * dt, world.obstacles);
    knock.multiplyScalar(Math.exp(-7 * dt));
  }
  if (invulnerable > 0) {
    invulnerable -= dt;
    player.root.visible = invulnerable <= 0 || Math.floor(invulnerable * 10) % 2 === 0;
  }

  // --- travel: 100 coins -> go to the airport and board the plane ---
  airport.update(dt);
  car.update(dt);
  if (!flight) airport.setDoorOpen(readyToTravel()); // door shut until she has 100 coins
  notEnoughCooldown -= dt;
  if (!paused && readyToTravel() && !travelHintGiven) {
    travelHintGiven = true;
    const next = cityAt(save.level + 1).name;
    showBanner('Vai ao aeroporto!  ✈️', 4000);
    void speak(['Boa! Juntaste cem moedas!', `Vai ao aeroporto e apanha o avião para ${next}!`]);
  }
  if (!paused && lastLevel() && save.coins >= COINS_PER_LEVEL && !save.finished) void finishJourney();
  if (!paused && !flight && !driving) {
    const b = airport.boardPoint;
    if (Math.hypot(player.position.x - b.x, player.position.z - b.z) < 1.4) {
      if (readyToTravel()) startFlight();
      else if (!lastLevel() && notEnoughCooldown <= 0) {
        notEnoughCooldown = 8;
        void speak([`Para viajar precisas de ${COINS_PER_LEVEL} moedas. Tens ${save.coins}!`]);
      }
    }
  }
  setCompass(
    readyToTravel() && !flight
      ? Math.atan2(airport.boardPoint.x - player.position.x, airport.boardPoint.z - player.position.z) - camYaw
      : null,
  );

  // --- question characters ---
  const met = npcs.update(dt, player.position);
  if (met && !paused && !driving) void meet(met);

  // --- camera follows behind the character, unless the player is looking around ---
  const turning = k.left || k.right;
  if ((speed > 0 || turning) && elapsed - lastDragTime > 1.5) {
    let diff = player.heading - camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    camYaw += diff * Math.min(1, dt * 2.5);
  }
  if (aerial) {
    camera.position.set(aerial.x, aerial.h, aerial.z + aerial.h * 0.35);
    camera.lookAt(aerial.x, 0, aerial.z);
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
  const wanted = driving ? Math.max(camDist, 12) : camDist;
  // don't let the camera end up inside a building: walk out from her towards the camera and stop before a wall
  const dir = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  let dist = wanted;
  for (let d = 1.2; d <= wanted; d += 0.4) {
    const px = target.x + dir.x * d;
    const pz = target.z + dir.z * d;
    if (target.y + dir.y * d > 7) break; // above most rooftops
    if (world.obstacles.some((o) => o !== driving?.obstacleBox && px > o.minX - 0.3 && px < o.maxX + 0.3 && pz > o.minZ - 0.3 && pz < o.maxZ + 0.3)) {
      dist = Math.max(1.5, d - 0.6);
      break;
    }
  }
  camDistSmooth += (dist - camDistSmooth) * Math.min(1, dt * (dist < camDistSmooth ? 12 : 3));
  camera.position.copy(target).addScaledVector(dir, camDistSmooth);
  camera.lookAt(target);
  }

  if (DEBUG) {
    const lamp = world.interactables[0].object.children.find((c) => c instanceof THREE.PointLight);
    document.body.dataset.debug = JSON.stringify({
      x: +player.position.x.toFixed(2),
      z: +player.position.z.toFixed(2),
      h: +player.heading.toFixed(2),
      camYaw: +camYaw.toFixed(2),
      lamp: (lamp as THREE.PointLight | undefined)?.intensity ?? null,
      coins: save.coins,
      jewels: save.jewels,
      correct: save.correct,
      jewelAt: collectibles.jewelPositions(),
      solved: save.solved.length,
      level: save.level,
      difficulty: save.difficulty,
      monsterCount: monsters.positions().length,
      rescuing,
      hospital: hospitalPhase,
      hospitalLeft: Math.max(0, save.hospitalUntil - Date.now()),
      carried: carriedKind,
      weather: weather.state,
      traffic: traffic.positions().slice(0, 3),
      trouble: trouble.positions(),
      sites: trouble.sites(),
      catAt: [+catTree.interactable.position.x.toFixed(1), +catTree.interactable.position.z.toFixed(1)],
      flying: !!flight,
      character: save.character,
      things: world.interactables.map((i) => [+i.position.x.toFixed(1), +i.position.z.toFixed(1), i.radius]),
      driving: !!driving,
      car: [+car.position.x.toFixed(1), +car.position.z.toFixed(1), +car.speed.toFixed(1)],
      visible: player.root.visible,
      board: [airport.boardPoint.x, airport.boardPoint.z],
      plane: [+airport.plane.position.x.toFixed(1), +airport.plane.position.y.toFixed(1)],
      voices: voiceInfo(),
      city: city.name,
      monsters: monsters.positions(),
      invulnerable: +invulnerable.toFixed(2),
      retry: Object.keys(save.retryAt),
      spoken: spokenLog,
      paused,
      npcs: npcs.list
        .filter((n) => n.leaving === null)
        .map((n) => ({ x: +n.group.position.x.toFixed(1), z: +n.group.position.z.toFixed(1), q: n.question.id })),
    });
  }

  marker.rotation.z += dt * 2;
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);


async function pickCharacter(): Promise<void> {
  paused = true;
  clearTarget();
  input.releaseAll();
  const { id } = await chooseCharacter(save.character ?? undefined);
  applyCharacter(id);
  paused = false;
  canvas.focus();
}

function applyCharacter(id: string): void {
  save.character = id;
  writeSave(save);
  player.setCharacter(id);
  setAvatar(id);
}

/** "Novo jogo": everything back to zero (keeps the chosen character and the settings). */
function newGame(): void {
  hospitalPhase = 'none';
  player.root.rotation.x = 0;
  Object.assign(save, { hospitalUntil: 0, coins: 0, level: 0, finished: false, jewels: 0, correct: 0, solved: [], retryAt: {}, pos: null, visited: [] });
  solved.clear();
  hud.set('coins', 0);
  hud.set('jewels', 0);
  hud.set('correct', 0);
  loadCity();
  writeSave(save);
  showArrival(city.arrival);
}

/** Start screen on every launch: pick a character, then continue where you were or start from zero. */
async function startScreen(): Promise<void> {
  paused = true;
  const canContinue = save.character !== null;
  const { id, mode } = await chooseCharacter(save.character ?? undefined, { canContinue });
  applyCharacter(id);
  if (mode === 'new') newGame();
  lastActivity = performance.now();
  paused = false;
  canvas.focus();
}

const setAvatar = createAvatarButton(save.character ?? 'princesa', () => {
  if (!paused && !flight && !driving) void pickCharacter();
});
createSettingsButton(
  () => save.difficulty,
  (d) => {
    save.difficulty = d;
    monsters.difficulty = DIFFICULTY_FACTOR[d];
    writeSave(save);
  },
  () => !paused && !flight,
  (open) => {
    paused = open;
    if (!open) canvas.focus();
  },
);
void startScreen().then(() => {
  if (save.hospitalUntil > Date.now()) {
    paused = true;
    enterBed();
  }
});
