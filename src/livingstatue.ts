import * as THREE from 'three';
import { tone } from './audio';
import type { GameCtx } from './gamectx';
import {
  roadsideSite,
  siteBox,
  siteGroup,
  siteToWorld,
} from './places';
import { ball, box, buildFolk, cyl, mat, pick, type Folk } from './venue';
import { mulberry32, PERSON_BODY_HALF, PERSON_CLEAR, type Interactable, type Obstacle, type World } from './world';

/** Vilnius = index 6 — homem-estátua a partir da 7.ª cidade. */
export const STATUE_FROM_CITY = 6;

const HW = 1.1;
const DEPTH = 1.6;
/** Distância para começar a “sentir” a presença dela. */
const NEAR = 3.2;
/** Segundos quieta perto dele antes de acordar. */
const STILL_NEED = 2.4;
/** Quão pouco se pode mexer (m/s) para contar como quieta. */
const STILL_SPEED = 0.35;
/** Cooldown entre surpresas (s). */
const COOL_MIN = 35;
const COOL_MAX = 55;

const LINES = ['Surpresa!', 'A estátua mexeu-se!', 'Ui! Apanhei-te!'];

type Phase = 'frozen' | 'awake' | 'refreeze';

/**
 * Homem-estátua de rua (silhueta humana, chapéu de feltro, maquilhagem prateada) num pedestal.
 * Fica imóvel; se ela se aproxima e fica quieta ~2–3 s (ou toca), acorda, faz uma pose engraçada e congela outra vez.
 */
export class LivingStatue {
  readonly things: Interactable[] = [];
  private readonly root: THREE.Group | null = null;
  private folk: Folk | null = null;
  private readonly at = new THREE.Vector3();
  private alive = false;
  private phase: Phase = 'frozen';
  private phaseT = 0;
  private stillT = 0;
  private cool = 0;
  private time = 0;
  private readonly lastPlayer = new THREE.Vector3();
  private haveLast = false;
  private pose: 'wave' | 'bow' | 'step' = 'wave';
  private baseY = 0;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    world: World,
    seed: number,
    private readonly ctx: GameCtx,
  ) {
    const rng = mulberry32(seed * 419 + 23);
    const site =
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 36, maxD: 125, apron: 4, front: 12 }) ??
      roadsideSite(obstacles, rng, HW, DEPTH, { minD: 28, maxD: 135, apron: 3.5, front: 11 });
    if (!site) return;

    const area = siteBox(site, -HW, HW, -DEPTH, 0.35);
    world.clearArea(area, 1.5);
    obstacles.push({ ...area, height: 0.2 });

    this.root = siteGroup(scene, site);

    // small stone pedestal
    const ped = new THREE.Group();
    ped.position.set(0, 0, -0.85);
    box(ped, mat(0x868e96), 0.95, 0.18, 0.95, 0, 0.09, 0);
    cyl(ped, mat(0xadb5bd), 0.38, 0.35, 0, 0.35, 0);
    box(ped, mat(0x495057), 0.72, 0.06, 0.72, 0, 0.55, 0);
    this.root.add(ped);

    const folk = buildStatueFolk(rng);
    folk.group.position.set(0, 0.58, -0.85);
    folk.group.rotation.y = Math.PI; // faces the road
    this.root.add(folk.group);
    this.folk = folk;
    this.baseY = folk.group.position.y;
    this.freezePose();

    const bodyAt = siteToWorld(site, 0, -0.85);
    const h = PERSON_BODY_HALF;
    obstacles.push({
      minX: bodyAt.x - h,
      maxX: bodyAt.x + h,
      minZ: bodyAt.z - h,
      maxZ: bodyAt.z + h,
      height: 2.2,
    });

    this.at.copy(bodyAt);
    this.alive = true;
    this.cool = 2; // brief settle after spawn

    const self = this;
    this.things.push({
      object: folk.group,
      position: this.at.clone(),
      radius: 2.3,
      keepClear: PERSON_CLEAR,
      interact: () => self.nudge(),
    });
  }

  update(dt: number, player: THREE.Vector3, paused = false): void {
    if (!this.alive || !this.folk) return;
    this.time += dt;
    if (this.cool > 0) this.cool = Math.max(0, this.cool - dt);

    if (paused || this.ctx.isDriving()) {
      this.stillT = 0;
      if (this.phase === 'frozen') this.freezePose();
      return;
    }

    const d = Math.hypot(player.x - this.at.x, player.z - this.at.z);
    let speed = 0;
    if (this.haveLast) {
      speed = Math.hypot(player.x - this.lastPlayer.x, player.z - this.lastPlayer.z) / Math.max(dt, 0.001);
    }
    this.lastPlayer.copy(player);
    this.haveLast = true;

    if (this.phase === 'frozen') {
      this.freezePose();
      // tiny “breathing” so it doesn’t look like a dead mesh — almost imperceptible
      this.folk.body.position.y = Math.sin(this.time * 0.7) * 0.004;

      if (this.cool <= 0 && d <= NEAR) {
        if (speed <= STILL_SPEED) this.stillT += dt;
        else this.stillT = 0;
        if (this.stillT >= STILL_NEED) this.wake();
      } else {
        this.stillT = 0;
      }
      return;
    }

    this.phaseT += dt;
    if (this.phase === 'awake') {
      this.playAwake();
      if (this.phaseT >= 2.6) {
        this.phase = 'refreeze';
        this.phaseT = 0;
      }
      return;
    }

    // refreeze: ease back to the classic pose
    this.easeToFreeze(Math.min(1, this.phaseT / 0.7));
    if (this.phaseT >= 0.7) {
      this.phase = 'frozen';
      this.phaseT = 0;
      this.stillT = 0;
      this.cool = COOL_MIN + Math.random() * (COOL_MAX - COOL_MIN);
      this.freezePose();
    }
  }

  private nudge(): void {
    if (!this.alive || this.ctx.isPaused() || this.ctx.isDriving()) return;
    if (this.phase !== 'frozen') return;
    if (this.cool > 0) {
      // soft acknowledgment without a full surprise
      return;
    }
    this.wake();
  }

  private wake(): void {
    if (!this.folk || this.phase !== 'frozen') return;
    this.phase = 'awake';
    this.phaseT = 0;
    this.stillT = 0;
    this.pose = (['wave', 'bow', 'step'] as const)[Math.floor(Math.random() * 3)];
    tone(523, 0, 0.08, 'triangle', 0.07);
    tone(784, 0.1, 0.14, 'sine', 0.06);
    this.ctx.say([LINES[Math.floor(Math.random() * LINES.length)]]);
  }

  private freezePose(): void {
    if (!this.folk) return;
    const f = this.folk;
    f.group.position.y = this.baseY;
    f.group.position.x = 0;
    f.group.position.z = -0.85;
    f.body.rotation.set(0, 0, 0);
    f.body.position.y = 0;
    f.head.rotation.set(0.05, 0, 0);
    // classic living-statue: one arm up, one across
    f.armL.rotation.set(-1.15, 0.15, 0.55);
    f.armR.rotation.set(-0.35, -0.2, -0.85);
    f.legL.rotation.x = 0.08;
    f.legR.rotation.x = -0.05;
  }

  private playAwake(): void {
    if (!this.folk) return;
    const f = this.folk;
    const t = this.phaseT;
    f.head.rotation.y = Math.sin(t * 8) * 0.35;
    f.head.rotation.x = Math.sin(t * 5) * 0.12;
    f.body.position.y = Math.abs(Math.sin(t * 10)) * 0.04;

    if (this.pose === 'wave') {
      f.armL.rotation.set(-1.4, 0, 0.4 + Math.sin(t * 14) * 0.55);
      f.armR.rotation.set(-0.5, 0, -0.4);
      f.legL.rotation.x = Math.sin(t * 6) * 0.2;
      f.legR.rotation.x = -Math.sin(t * 6) * 0.2;
    } else if (this.pose === 'bow') {
      f.body.rotation.x = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.55;
      f.armL.rotation.set(-0.2, 0, 0.9);
      f.armR.rotation.set(-0.2, 0, -0.9);
      f.head.rotation.x = 0.4;
    } else {
      // one funny step off the pedestal centre, then back
      const step = Math.sin(Math.min(1, t / 1.2) * Math.PI);
      f.group.position.z = -0.85 + step * 0.45;
      f.armL.rotation.set(-1.6, 0, 0.3);
      f.armR.rotation.set(-0.8, 0, -0.5);
      f.legL.rotation.x = step * 0.7;
      f.legR.rotation.x = -step * 0.35;
    }
  }

  private easeToFreeze(u: number): void {
    if (!this.folk) return;
    // snap toward frozen pose
    const f = this.folk;
    f.group.position.z += (-0.85 - f.group.position.z) * u;
    f.group.position.y = this.baseY;
    f.body.rotation.x *= 1 - u;
    f.armL.rotation.x += (-1.15 - f.armL.rotation.x) * u;
    f.armL.rotation.z += (0.55 - f.armL.rotation.z) * u;
    f.armR.rotation.x += (-0.35 - f.armR.rotation.x) * u;
    f.armR.rotation.z += (-0.85 - f.armR.rotation.z) * u;
    f.legL.rotation.x += (0.08 - f.legL.rotation.x) * u;
    f.legR.rotation.x += (-0.05 - f.legR.rotation.x) * u;
    f.head.rotation.set(0.05 * u, f.head.rotation.y * (1 - u), 0);
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    this.root?.parent?.remove(this.root);
    this.folk = null;
    this.things.length = 0;
  }

  debug(): Record<string, unknown> {
    return {
      on: this.alive,
      from: STATUE_FROM_CITY,
      at: this.alive ? [+this.at.x.toFixed(1), +this.at.z.toFixed(1)] : null,
      phase: this.phase,
      cool: +this.cool.toFixed(1),
      still: +this.stillT.toFixed(2),
    };
  }
}

/** Bronze / silver street-performer: human silhouette + felt hat + metallic face paint. */
function buildStatueFolk(rng: () => number): Folk {
  const bronze = 0x8d7b68;
  const silver = 0xc0c4c8;
  const dark = 0x5c5346;
  const skins = [0xb0b4b8, 0xa8a29e, 0x9a9590];
  const folk = buildFolk({
    shirt: bronze,
    pants: dark,
    skin: pick(rng, skins),
    hair: 0x3d3a36,
    cap: 0x2b2118, // felt hat base from buildFolk
  });

  // taller felt bowler / trilby silhouette
  box(folk.head, mat(0x2b2118), 0.22, 0.22, 0.22, 0, 0.4, 0);
  box(folk.head, mat(0x2b2118), 0.55, 0.04, 0.55, 0, 0.28, 0); // brim
  box(folk.head, mat(0x495057), 0.34, 0.035, 0.34, 0, 0.3, 0); // band

  // silver face paint patches (street mime / statue look)
  ball(folk.head, mat(silver), 0.12, -0.12, 0.02, -0.22);
  ball(folk.head, mat(silver), 0.12, 0.12, 0.02, -0.22);
  ball(folk.head, mat(silver), 0.08, 0, -0.06, -0.26);

  // metallic sheen on torso — thin overlay plate so it reads “statue” from afar
  const plate = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.36, 0.5, 4, 10),
    new THREE.MeshStandardMaterial({
      color: bronze,
      metalness: 0.55,
      roughness: 0.35,
      flatShading: true,
    }),
  );
  plate.position.y = 1.22;
  plate.scale.set(1.02, 1.02, 1.02);
  folk.body.add(plate);

  return folk;
}

export function noLivingStatue(): LivingStatue {
  return {
    things: [],
    update() {},
    dispose() {},
    debug: () => ({ on: false, from: STATUE_FROM_CITY, at: null, phase: 'frozen', cool: 0, still: 0 }),
  } as unknown as LivingStatue;
}

export function createLivingStatue(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  seed: number,
  cityIndex: number,
  ctx: GameCtx,
): LivingStatue {
  if (cityIndex < STATUE_FROM_CITY) return noLivingStatue();
  return new LivingStatue(scene, obstacles, world, seed, ctx);
}
