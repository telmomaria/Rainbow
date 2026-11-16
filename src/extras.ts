import * as THREE from 'three';
import { tone } from './audio';
import { feel } from './bus';
import type { Character } from './character';
import { FolkTown } from './folk';
import type { GameCtx } from './gamectx';
import { GIFT_COINS, GIVE_DIST, giftDef, receivers, type Receiver } from './gifts';
import { itemDef } from './items';
import { JEWEL_ITEM, JewelPlaces, JewelShield } from './jewels';
import { Life } from './life';
import type { Monsters } from './monsters';
import type { Npcs } from './npcs';
import { Flyers, coinMesh } from './places';
import type { SaveData } from './save';
import { mulberry32, type Interactable, type World } from './world';

/**
 * Everything added with the 2026-11-15 brief ("brief didático") plugs into the game through this one class, so
 * main.ts only needs a handful of one-line hooks:
 *
 *   new Extras(host) · buildCity(seed) · disposeCity() · update(dt, playing) · tap(raycaster, x, y) · enter()
 *   · useBagItem(kind) · bagView(bag) · collected(kinds) · reset() · debug()
 *
 * Fase 1: energy and mood (life.ts), banknotes (collectibles.ts), jewels with a use (jewels.ts), double click to
 * pick and giving things to people (gifts.ts).
 */
export interface ExtrasHost {
  scene: THREE.Scene;
  save: SaveData;
  ctx: GameCtx;
  /** The player's character (the shield bubble is attached to its root; scripted moments move her). */
  player: Character;
  /** City local hour (0–24) and daylight (0–1). May throw if called before the weather exists. */
  hour(): number;
  daylight(): number;
  world(): World;
  npcs(): Npcs;
  monsters(): Monsters;
  /** On foot and free to act: not paused, driving, flying, on the bus, on a ride, swimming, sunbathing. */
  free(): boolean;
  walkTo(p: THREE.Vector3): void;
  stop(): void;
  /** Cars and buses within `radius` of a point brake and wait `seconds` (the traffic officer). */
  stopTraffic(at: THREE.Vector3, radius: number, seconds: number): void;
}

const DOUBLE_MS = 380;
const DOUBLE_PX = 60;

export class Extras {
  readonly life: Life;
  readonly shield: JewelShield;
  private jewelPlaces: JewelPlaces | null = null;
  /** Fase 2: the characters to meet in this city (src/folk/). */
  private folk: FolkTown | null = null;
  private flyers: Flyers;
  private lastTap = { t: -1e9, x: 0, y: 0 };
  /** Something she double-clicked and is walking to (picked on arrival). */
  private pickTarget: Interactable | null = null;
  private pickAge = 0;
  /** Someone she is walking to with a gift in her hand. */
  private giveTarget: Receiver | null = null;
  private giveAge = 0;
  /** Passers-by who already got their first gift (people with an id use a save flag instead). */
  private gifted = new WeakSet<THREE.Object3D>();

  constructor(private readonly host: ExtrasHost) {
    this.life = new Life(host.save);
    this.shield = new JewelShield(host.player.root);
    this.flyers = new Flyers(host.scene);
    if (new URLSearchParams(location.search).has('debug')) {
      // QA: set energy / mood, or let play time pass: dispatch 'rainbow-life' with { energy?, mood?, pass? }
      window.addEventListener('rainbow-life', (e) => this.life.debugSet((e as CustomEvent<{ energy?: number; mood?: number; pass?: number }>).detail));
    }
  }

  /* ---------------------------------------------------------------- city */

  /** After every building of the city exists (and the no-spawn zones are set), before coins/characters/creatures. */
  buildCity(seed: number): void {
    const { scene, ctx } = this.host;
    const world = this.host.world();
    this.flyers = new Flyers(scene);
    this.jewelPlaces = new JewelPlaces(scene, world.obstacles, mulberry32(seed * 71 + 23), ctx);
    world.interactables.push(...this.jewelPlaces.things);
    const { host } = this;
    this.folk = new FolkTown(
      { scene, game: ctx, player: host.player, obstacles: world.obstacles, hour: host.hour, daylight: host.daylight, free: host.free, stopTraffic: host.stopTraffic },
      seed,
      ctx.level(),
      ctx.city(),
    );
    world.interactables.push(...this.folk.things);
  }

  /** Before the scene is cleared for the next city. */
  disposeCity(): void {
    this.jewelPlaces?.dispose();
    this.jewelPlaces = null;
    this.folk?.dispose();
    this.folk = null;
    this.flyers.clear();
    receivers.clear();
    this.pickTarget = null;
    this.giveTarget = null;
    this.shield.stop();
  }

  /** "Novo jogo": energy full, mood normal, no diamonds, no module flags. */
  reset(): void {
    Object.assign(this.host.save, { diamonds: 0, energy: 5, mood: 3, lifeT: [0, 0], flags: {}, texts: {} });
    this.shield.stop();
    this.life.draw();
  }

  /* ---------------------------------------------------------------- input */

  /**
   * A tap on the world (before the game's own handling). True = handled here.
   * Double tap on something that can be picked = go and pick it; a tap on a person with a gift in hand = give it.
   */
  tap(raycaster: THREE.Raycaster, x: number, y: number): boolean {
    const now = performance.now();
    const double = now - this.lastTap.t < DOUBLE_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < DOUBLE_PX;
    this.lastTap = double ? { t: -1e9, x, y } : { t: now, x, y };
    this.pickTarget = null;
    this.giveTarget = null;
    if (!this.host.free()) return false;
    if (double) {
      const pickables = this.host.world().interactables.filter((i) => i.pick);
      const hit = raycaster.intersectObjects(pickables.map((i) => i.object), true)[0];
      const it = hit && pickables.find((i) => isInside(hit.object, i.object));
      if (it) {
        if (this.near(it)) this.doPick(it);
        else {
          this.pickTarget = it;
          this.pickAge = 0;
          this.host.walkTo(it.position);
        }
        return true;
      }
    }
    if (giftDef(this.host.ctx.carried())) {
      const people = this.people();
      const hit = raycaster.intersectObjects(people.map((p) => p.object), true)[0];
      const who = hit && people.find((p) => isInside(hit.object, p.object));
      if (who) {
        this.giveTarget = who;
        this.giveAge = 0;
        this.host.walkTo(who.position);
        return true;
      }
    }
    return false;
  }

  /** Enter next to something that can be picked = pick it. True = handled. */
  enter(): boolean {
    if (!this.host.free()) return false;
    const it = this.host.world().interactables.find((i) => i.pick && this.near(i));
    if (!it) return false;
    this.doPick(it);
    return true;
  }

  /** A tap on a bag item (before the game's own handling). True = handled here (the jewel = shield). */
  useBagItem(kind: string): boolean {
    if (kind !== JEWEL_ITEM) return false;
    if (!this.host.free()) return true;
    const monsters = this.host.monsters();
    if (this.shield.on || monsters.difficulty <= 0) {
      // already shining / no creatures in this game: nothing to pay for
      tone(1568, 0, 0.12, 'sine', 0.05);
      return true;
    }
    if (this.host.ctx.spendJewels(1)) this.shield.start();
    return true;
  }

  /** The bag as shown on screen: the real bag plus her street jewels. */
  bagView(bag: Record<string, number>): Record<string, number> {
    return this.host.save.jewels > 0 ? { ...bag, [JEWEL_ITEM]: this.host.save.jewels } : bag;
  }

  /** Things just picked up from the ground (kinds from collectibles.ts). */
  collected(kinds: readonly string[]): void {
    if (kinds.includes('note')) {
      // a banknote: a paper rustle and a happy little fanfare
      for (let i = 0; i < 4; i++) tone(2600 + Math.random() * 1400, i * 0.03, 0.03, 'square', 0.025);
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1 + i * 0.08, 0.2, 'triangle', 0.08));
    }
  }

  /* ---------------------------------------------------------------- frame */

  /** Every frame. `playing` = the game is running (no question, menu, flight, hospital…). */
  update(dt: number, playing: boolean): void {
    const { ctx } = this.host;
    this.life.update(dt, playing);
    this.shield.update(dt, playing);
    this.host.monsters().scared = this.shield.on;
    this.jewelPlaces?.update(dt);
    this.folk?.update(dt, playing);
    this.flyers.update(dt);

    if (this.pickTarget) {
      this.pickAge += dt;
      if (!this.host.free() || this.pickAge > 15) this.pickTarget = null;
      else if (this.near(this.pickTarget)) {
        const it = this.pickTarget;
        this.pickTarget = null;
        this.host.stop();
        this.doPick(it);
      }
    }
    if (this.giveTarget) {
      const r = this.giveTarget;
      this.giveAge += dt;
      const kind = ctx.carried();
      if (!this.host.free() || !giftDef(kind) || r.free?.() === false || this.giveAge > 20) this.giveTarget = null;
      else if (Math.hypot(r.position.x - ctx.player.x, r.position.z - ctx.player.z) < GIVE_DIST) {
        this.giveTarget = null;
        this.host.stop();
        this.doGive(r, kind!);
      } else if (Math.floor(this.giveAge * 2) !== Math.floor((this.giveAge - dt) * 2)) this.host.walkTo(r.position); // the person may be strolling
    }
  }

  /* ---------------------------------------------------------------- helpers */

  private near(it: Interactable): boolean {
    const p = this.host.ctx.player;
    return Math.hypot(it.position.x - p.x, it.position.z - p.z) < it.radius + 0.5;
  }

  /** Everyone who can be given something right now: registered people + the question characters. */
  private people(): Receiver[] {
    const list: Receiver[] = receivers.all().filter((r) => r.free?.() !== false);
    for (const n of this.host.npcs().list) {
      if (n.leaving !== null) continue;
      list.push({ object: n.group, position: n.group.position, free: () => n.leaving === null, thank: () => (n.cheer = 1.4) });
    }
    return list;
  }

  private doPick(it: Interactable): void {
    const kind = it.pick?.() ?? null;
    if (!kind) {
      tone(220, 0, 0.12, 'sine', 0.05); // nothing left to pick right now
      return;
    }
    this.host.ctx.give(kind);
    tone(660, 0, 0.07, 'triangle', 0.07);
    tone(990, 0.07, 0.14, 'triangle', 0.07);
  }

  private doGive(r: Receiver, kind: string): void {
    const { ctx } = this.host;
    const def = giftDef(kind)!;
    const from = new THREE.Vector3(ctx.player.x, 1.2, ctx.player.z);
    const to = () => new THREE.Vector3(r.position.x, 1.3, r.position.z);
    ctx.setCarried(null); // out of her hand and out of the bag
    const mesh = itemDef(kind)?.build() ?? coinMesh();
    this.flyers.send(mesh, from, to, 0.5, 0, () => {
      r.thank(kind);
      [784, 988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.07));
      ctx.say([`Obrigado! ${def.thanks}`, ctx.isBoy() ? 'És muito simpático!' : 'És muito simpática!']);
      feel('kind');
      // the first gift to each person is worth two coins
      const key = r.id ? `gift:${r.id}` : null;
      const first = key ? ctx.flag(key) === 0 : !this.gifted.has(r.object);
      if (!first) return;
      if (key) ctx.setFlag(key, 1);
      else this.gifted.add(r.object);
      for (let i = 0; i < GIFT_COINS; i++) {
        this.flyers.send(coinMesh(), to(), () => new THREE.Vector3(ctx.player.x, 1.2, ctx.player.z), 0.45, 0.5 + i * 0.15, () => {
          ctx.addCoins(1);
          tone(1568, 0, 0.06, 'square', 0.05);
          tone(2349, 0.04, 0.14, 'triangle', 0.06);
        });
      }
    });
  }

  /** For the ?debug bridge. */
  debug(): Record<string, unknown> {
    const s = this.host.save;
    return {
      energy: s.energy,
      mood: s.mood,
      lifeT: s.lifeT.map((v) => Math.round(v)),
      diamonds: s.diamonds,
      shield: +this.shield.secondsLeft.toFixed(1),
      jewelPlaces: this.jewelPlaces?.debug() ?? null,
      folk: this.folk?.debug() ?? null,
      pickables: this.host.world().interactables.filter((i) => i.pick).map((i) => [+i.position.x.toFixed(1), +i.position.z.toFixed(1), i.radius]),
      picking: !!this.pickTarget,
      giving: !!this.giveTarget,
      flags: s.flags,
    };
  }
}

function isInside(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o === root) return true;
  return false;
}
