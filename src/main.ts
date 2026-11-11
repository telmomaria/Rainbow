import * as THREE from 'three';
import { CHARACTER_RADIUS, Character } from './character';
import { Input } from './input';
import { createWorld, type Interactable } from './world';
import { Collectibles } from './collectibles';
import { Npcs, type QuestionNpc } from './npcs';
import { loadSave, writeSave } from './save';
import { Hud, askQuestion, createHomeButton, setCompass, setFade, showArrival, showBanner, showCityName, showTravel } from './ui';
import { speak, sfx, spokenLog, taunt, voiceInfo } from './audio';
import { CITIES, COINS_PER_LEVEL, cityAt } from './cities';
import { Monsters } from './monsters';
import { Airport } from './airport';
import { Flight } from './flight';
import { isFree } from './spawn';

const WALK_SPEED = 6.5; // m/s
const TURN_SPEED = 2.6; // rad/s (arrow keys)
const ARRIVE_DIST = 0.6;
/** `?debug` exposes state on <body data-debug> and accepts teleports, for automated browser checks. */
const DEBUG = new URLSearchParams(location.search).has('debug');
if (DEBUG) {
  window.addEventListener('rainbow-teleport', (e) => {
    const { x, z, h } = (e as CustomEvent<{ x: number; z: number; h: number }>).detail;
    player.position.set(x, 0, z);
    player.heading = h;
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
const player = new Character();
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
let airport = new Airport(scene, world.obstacles);
// restore after every obstacle (incl. the airport) exists, so she can never reappear inside something
if (save.pos && isFree(save.pos.x, save.pos.z, CHARACTER_RADIUS, world.obstacles)) {
  player.position.set(save.pos.x, 0, save.pos.z);
  player.heading = save.pos.h;
}
if (!save.pos) showArrival(city.arrival); // very first start

/** Rebuild everything for the current level's city (in place, no page reload). */
function loadCity(): void {
  scene.clear();
  city = cityAt(save.level);
  world = createWorld(scene, city);
  scene.add(player.root, marker);
  player.position.set(0, 0, 0);
  player.heading = 0;
  camYaw = 0;
  insideInteractable.clear();
  collectibles = new Collectibles(scene, world.obstacles);
  npcs = new Npcs(scene, world.obstacles, questionAvailable, player.position);
  monsters = new Monsters(scene, world.obstacles);
  airport = new Airport(scene, world.obstacles);
  cityPill.textContent = city.name;
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
  if (paused || flight) return; // not during a question or a flight
  setFade(true);
  setTimeout(() => {
    clearTarget();
    input.releaseAll();
    knock.set(0, 0, 0);
    player.position.set(0, 0, 0);
    player.heading = 0;
    camYaw = 0;
    savePosition();
    setFade(false);
    canvas.focus();
  }, 600);
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
  save.coins += n;
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
let camYaw = player.heading;
let camPitch = 0.45;
let camDist = 9;
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
  if (!flight) player.update(dt, speed);

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
  if (ev.hit && invulnerable <= 0 && !paused) {
    const lost = Math.min(HIT_COST, save.coins);
    if (lost > 0) addCoins(-lost);
    sfx.bonk();
    knock.set(player.position.x - ev.hit.x, 0, player.position.z - ev.hit.z).setLength(11);
    invulnerable = 1.5;
    clearTarget();
  }
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
  notEnoughCooldown -= dt;
  if (!paused && readyToTravel() && !travelHintGiven) {
    travelHintGiven = true;
    const next = cityAt(save.level + 1).name;
    showBanner('Vai ao aeroporto!  ✈️', 4000);
    void speak(['Boa! Juntaste cem moedas!', `Vai ao aeroporto e apanha o avião para ${next}!`]);
  }
  if (!paused && lastLevel() && save.coins >= COINS_PER_LEVEL && !save.finished) void finishJourney();
  if (!paused && !flight) {
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
  if (met && !paused) void meet(met);

  // --- camera follows behind the character, unless the player is looking around ---
  const turning = k.left || k.right;
  if ((speed > 0 || turning) && elapsed - lastDragTime > 1.5) {
    let diff = player.heading - camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    camYaw += diff * Math.min(1, dt * 2.5);
  }
  if (flight) {
    const shot = flight.update(dt);
    camera.position.lerp(shot.pos, Math.min(1, dt * 4));
    camera.lookAt(shot.look);
    if (flight.done) endFlight();
  } else {
  const target = player.position.clone().add(new THREE.Vector3(0, 1.6, 0));
  camera.position.set(
    target.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    target.y + Math.sin(camPitch) * camDist,
    target.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist,
  );
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
      flying: !!flight,
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
