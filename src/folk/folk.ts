import * as THREE from 'three';
import { tone } from '../audio';
import type { Character } from '../character';
import type { GameCtx } from '../gamectx';
import { receivers } from '../gifts';
import { Flyers, coinMesh, parkSite, roadsideSite, siteBox, siteGroup, siteHeading, siteToWorld, type Site } from '../places';
import { mulberry32, type Interactable, type Obstacle } from '../world';
import type { FolkActor, FolkCtx, FolkDef, FolkGroup } from './types';

/** Registry: every character file calls registerFolk() at import time (see index.ts). */
const defs = new Map<string, FolkDef>();
export function registerFolk(def: FolkDef): void {
  defs.set(def.id, def);
}
export function folkIds(): string[] {
  return [...defs.keys()];
}

/** How many of each group a city gets (cities are not all the same: the selection rotates with the level). */
const PER_CITY: Record<FolkGroup, number> = { fantasia: 3, profissao: 7 };

export interface FolkHost {
  scene: THREE.Scene;
  game: GameCtx;
  player: Character;
  obstacles: Obstacle[];
  hour(): number;
  daylight(): number;
  free(): boolean;
  stopTraffic(at: THREE.Vector3, radius: number, seconds: number): void;
}

/** Which characters live in the city of this level. `?folk=a,b` (or `?folk=all`) overrides it, for testing. */
export function folkForLevel(level: number): string[] {
  const forced = new URLSearchParams(location.search).get('folk');
  if (forced === 'all') return folkIds();
  if (forced) return forced.split(',').filter((id) => defs.has(id));
  const out: string[] = [];
  for (const group of ['fantasia', 'profissao'] as const) {
    const ids = [...defs.values()].filter((d) => d.group === group).map((d) => d.id);
    const n = Math.min(PER_CITY[group], ids.length);
    for (let k = 0; k < n; k++) out.push(ids[(level * PER_CITY[group] + k) % ids.length]);
  }
  return out;
}

interface Placed {
  def: FolkDef;
  site: Site;
  actor: FolkActor;
  root: THREE.Group;
}

/** The characters of one city. */
export class FolkTown {
  readonly things: Interactable[] = [];
  private readonly placed: Placed[] = [];
  private readonly missing: string[] = [];
  private readonly fly: Flyers;
  /** Seconds of play (for the reward cool-downs). */
  private clock = 0;
  private readonly lastReward = new Map<string, number>();

  constructor(private readonly host: FolkHost, seed: number, level: number, city: string) {
    this.fly = new Flyers(host.scene);
    const rng = mulberry32(seed * 73 + 29);
    for (const id of folkForLevel(level)) {
      const def = defs.get(id);
      if (!def) continue;
      const site = this.findSite(def, rng);
      if (!site) {
        this.missing.push(id);
        continue;
      }
      const root = siteGroup(host.scene, site);
      const ctx = this.makeCtx(def, site, root, mulberry32(seed * 101 + hash(id)), city, level);
      let actor: FolkActor;
      try {
        actor = def.build(ctx);
      } catch (e) {
        // one broken character must never stop the city from loading
        console.error(`folk "${id}" failed to build`, e);
        root.removeFromParent();
        this.missing.push(id);
        continue;
      }
      this.placed.push({ def, site, actor, root });
      this.things.push(...actor.things);
      for (const p of actor.people ?? []) {
        receivers.add({ object: p.object, position: p.position, id: `${city}:${id}`, thank: () => p.thank() });
      }
    }
  }

  /** Stages must stay ≥ FOLK_MIN_DIST apart (and from the player) so people never spawn on top of each other. */
  private static readonly FOLK_MIN_DIST = 8;

  private findSite(def: FolkDef, rng: () => number): Site | null {
    for (let attempt = 0; attempt < 48; attempt++) {
      const site = this.pickSite(def, rng);
      if (!site) return null;
      const px = this.host.game.player.x;
      const pz = this.host.game.player.z;
      if (Math.hypot(site.x - px, site.z - pz) < FolkTown.FOLK_MIN_DIST) continue;
      if (this.placed.some((p) => Math.hypot(p.site.x - site.x, p.site.z - site.z) < FolkTown.FOLK_MIN_DIST)) continue;
      return site;
    }
    return null;
  }

  private pickSite(def: FolkDef, rng: () => number): Site | null {
    const { obstacles } = this.host;
    if (def.where === 'street') {
      return roadsideSite(obstacles, rng, def.hw, def.depth, {
        minD: 18,
        maxD: 140,
        apron: def.apron,
      });
    }
    // open grass inside the block — never roadside (baliza / brincar no meio da rua)
    return parkSite(obstacles, rng, def.hw, def.depth, { minD: 28, maxD: 140, roadGap: 7 });
  }

  private makeCtx(def: FolkDef, site: Site, root: THREE.Group, rng: () => number, city: string, level: number): FolkCtx {
    const { host } = this;
    const fly = this.fly;
    const key = (k: string) => `${def.id}:${k}`;
    return {
      scene: host.scene,
      game: host.game,
      rng,
      root,
      site,
      player: host.player,
      city,
      level,
      at: (lx, lz, y = 0) => siteToWorld(site, lx, lz, y),
      heading: (a) => siteHeading(site, a),
      block: (x0, x1, z0, z1, height) => {
        host.obstacles.push(siteBox(site, x0, x1, z0, z1, height));
      },
      say: (lines) => host.game.say(lines),
      greeting: () => {
        const h = safe(host.hour, 12);
        return h < 5 || h >= 20 ? 'Boa noite!' : h < 13 ? 'Bom dia!' : 'Boa tarde!';
      },
      hour: () => safe(host.hour, 12),
      daylight: () => safe(host.daylight, 1),
      pay: (n, from) => {
        const p = host.game.player;
        for (let i = 0; i < n; i++) {
          fly.send(coinMesh(), from, () => new THREE.Vector3(p.x, 1.2, p.z), 0.5, i * 0.14, () => {
            host.game.addCoins(1);
            tone(1568 + Math.random() * 150, 0, 0.06, 'square', 0.05);
            tone(2349, 0.04, 0.14, 'triangle', 0.06);
          });
        }
      },
      ready: (k, seconds = 180) => {
        const last = this.lastReward.get(key(k));
        if (last !== undefined && this.clock - last < seconds) return false;
        this.lastReward.set(key(k), this.clock);
        return true;
      },
      fly,
      herDist: (lx, lz) => {
        const w = siteToWorld(site, lx, lz);
        return Math.hypot(w.x - host.game.player.x, w.z - host.game.player.z);
      },
      free: () => host.free(),
      obstacles: host.obstacles,
      stopTraffic: (at, radius, seconds) => host.stopTraffic(at, radius, seconds),
    };
  }

  update(dt: number, playing: boolean): void {
    if (playing) this.clock += dt;
    this.fly.update(dt);
    for (const p of this.placed) p.actor.update(dt);
  }

  dispose(): void {
    this.fly.clear();
    for (const p of this.placed) p.actor.dispose?.();
  }

  debug(): Record<string, unknown> {
    return {
      missing: this.missing,
      placed: this.placed.map((p) => {
        const stand = siteToWorld(p.site, 0, 1.5);
        return {
          id: p.def.id,
          at: [+p.site.x.toFixed(1), +p.site.z.toFixed(1)],
          rot: +p.site.rot.toFixed(2),
          stand: [+stand.x.toFixed(1), +stand.z.toFixed(1)],
          things: p.actor.things.map((t) => [+t.position.x.toFixed(1), +t.position.z.toFixed(1), t.radius, t.requiresClick ? 1 : 0]),
          ...(p.actor.debug?.() ?? {}),
        };
      }),
    };
  }
}

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 9973;
}

/** The weather is created after the first city: a call that is too early gets the default. */
function safe(fn: () => number, def: number): number {
  try {
    const v = fn();
    return Number.isFinite(v) ? v : def;
  } catch {
    return def;
  }
}
