import * as THREE from 'three';
import { tone } from './audio';
import type { Character } from './character';
import type { GameCtx } from './gamectx';
import {
  box,
  buildFolk,
  cyl,
  mat,
  pick,
  HAIRS,
  SKINS,
  type Folk,
} from './venue';
import {
  roadsideSite,
  siteBox,
  siteGroup,
  siteToWorld,
} from './places';
import { PERSON_BODY_HALF, PERSON_CLEAR, type Interactable, type Obstacle } from './world';

/** Seconds before he asks again after a “não” / “já chega” (no spam when she walks past again). */
const COOLDOWN_NO = 15;
/** Each photo costs 1 coin; she can take as many as she likes in a row (Telmo, 2026-11-19). */
const PHOTO_PRICE = 1;

/**
 * Street photographer: recognisable mesh (hat + camera on a strap), asks permission,
 * then flashes and shows a real maximised portrait of the character.
 */
export class Photographer {
  readonly things: Interactable[] = [];
  private group: THREE.Group | null = null;
  private folk: Folk | null = null;
  private stand: THREE.Vector3 | null = null;
  private busy = false;
  private coolUntil = 0;
  private armLift = 0;
  private waveT = 0;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    rng: () => number,
    private readonly ctx: GameCtx,
    private readonly hero: Character,
    siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
  ) {
    const hw = 1.6;
    const depth = 2.2;
    const site = roadsideSite(obstacles, rng, hw, depth, { minD: 40, maxD: 130, ...siteOpts });
    if (!site) return;

    const g = siteGroup(scene, site);
    this.group = g;
    // little coloured backdrop so the “studio” reads from the street
    box(g, mat(0xffe066), 2.4, 2.6, 0.12, 0, 1.35, -depth + 0.05);
    box(g, mat(0xff6b9d), 2.55, 0.12, 0.18, 0, 2.7, -depth + 0.05);
    box(g, mat(0x4dabf7), 0.12, 2.6, 0.12, -1.2, 1.35, -depth + 0.05);
    box(g, mat(0x4dabf7), 0.12, 2.6, 0.12, 1.2, 1.35, -depth + 0.05);
    // tripod + spare camera on a stand
    const trip = new THREE.Group();
    trip.position.set(1.05, 0, -0.55);
    for (const a of [-0.55, 0.55, 1.8]) {
      const leg = cyl(trip, mat(0x495057), 0.03, 1.15, Math.sin(a) * 0.28, 0.55, Math.cos(a) * 0.2);
      leg.rotation.x = 0.18;
    }
    box(trip, mat(0x212529), 0.22, 0.14, 0.28, 0, 1.2, 0);
    cyl(trip, mat(0x868e96), 0.08, 0.16, 0, 1.2, -0.2);
    g.add(trip);

    obstacles.push(siteBox(site, -hw, hw, -depth, 0));

    const folk = buildFolk({
      shirt: 0x343a40,
      pants: 0x212529,
      skin: pick(rng, SKINS),
      hair: pick(rng, HAIRS),
      cap: 0x5c3d2e, // brown hat
    });
    folk.group.position.set(0, 0, -0.9);
    folk.group.rotation.y = Math.PI; // faces the road / apron
    g.add(folk.group);
    this.folk = folk;
    dressPhotographer(folk);

    const stand = siteToWorld(site, 0, 1.2);
    this.stand = stand.clone();
    // solid body at the photographer (not the apron stand point)
    const bodyAt = siteToWorld(site, 0, -0.9);
    const h = PERSON_BODY_HALF;
    obstacles.push({
      minX: bodyAt.x - h,
      maxX: bodyAt.x + h,
      minZ: bodyAt.z - h,
      maxZ: bodyAt.z + h,
      height: 1.9,
    });

    this.things.push({
      object: folk.group,
      position: stand,
      radius: 2.4,
      keepClear: PERSON_CLEAR,
      interact: () => {
        void this.meet();
      },
      update: (dt) => this.tick(dt),
    });
  }

  private tick(dt: number): void {
    if (!this.folk) return;
    const t = performance.now() * 0.001;
    // idle sway
    if (!this.busy) {
      this.folk.armR.rotation.x = -0.15 + Math.sin(t * 1.4) * 0.08;
      this.folk.head.rotation.y = Math.sin(t * 0.7) * 0.12;
    }
    if (this.armLift > 0) {
      this.armLift = Math.max(0, this.armLift - dt);
      this.folk.armR.rotation.x = -1.35;
      this.folk.armR.rotation.z = -0.2;
    }
    if (this.waveT > 0) {
      this.waveT = Math.max(0, this.waveT - dt);
      this.folk.armL.rotation.z = 0.6 + Math.sin(t * 10) * 0.35;
    } else if (!this.busy) {
      this.folk.armL.rotation.z = 0.05;
    }
  }

  private async meet(): Promise<void> {
    if (this.busy || !this.folk) return;
    if (performance.now() < this.coolUntil) {
      this.waveT = 1.2;
      return;
    }
    if (this.ctx.isPaused() || this.ctx.isDriving()) return;

    this.busy = true;
    this.folk.head.rotation.y = 0;
    let first = true;
    try {
      // as many photos as she wants, one coin each
      for (;;) {
        const choice = await this.ctx.choose(first ? 'Queres uma foto? Custa uma moeda.' : 'Tiramos mais uma? Custa uma moeda.', [
          first ? 'Sim!' : 'Mais uma!',
          first ? 'Não, obrigada' : 'Já chega',
        ]);
        if (choice !== 0) {
          this.waveT = 1.4;
          this.ctx.say([first ? 'Está bem! Quando quiseres, eu estou aqui.' : 'Gostei muito! Adeus!']);
          this.coolUntil = performance.now() + COOLDOWN_NO * 1000;
          return;
        }
        if (this.ctx.coins() < PHOTO_PRICE) {
          this.waveT = 1.2;
          this.ctx.say(['Cada foto custa uma moeda. Volta quando tiveres!']);
          this.coolUntil = performance.now() + COOLDOWN_NO * 1000;
          return;
        }
        this.ctx.addCoins(-PHOTO_PRICE);
        first = false;
        this.ctx.hold(true);
        try {
          this.ctx.say(['Olha para mim… um, dois…']);
          this.armLift = 1.1;
          await wait(900);
          shutterSound();
          this.ctx.flash();
          const url = snapPortrait(this.hero.root);
          await wait(280);
          if (url) await this.ctx.showPhoto(url);
          this.waveT = 1.0;
        } finally {
          this.ctx.hold(false);
        }
        if (!this.folk) return; // city changed while the photo was open
      }
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    if (this.busy) {
      this.ctx.hold(false);
      this.busy = false;
    }
    this.group?.removeFromParent();
    this.group = null;
    this.folk = null;
  }

  debug(): Record<string, unknown> {
    return {
      stand: this.stand ? [+this.stand.x.toFixed(1), +this.stand.z.toFixed(1)] : null,
      busy: this.busy,
      cool: Math.max(0, Math.round((this.coolUntil - performance.now()) / 1000)),
    };
  }
}

/** Hat brim already from buildFolk cap; add neck-strap camera + jacket pocket detail. */
function dressPhotographer(folk: Folk): void {
  // camera hanging on a chest strap (body group origin = feet)
  const cam = new THREE.Group();
  cam.position.set(0.18, 1.28, -0.42);
  cam.rotation.x = 0.2;
  box(cam, mat(0x212529), 0.32, 0.22, 0.2, 0, 0, 0);
  cyl(cam, mat(0x495057), 0.1, 0.16, 0, 0, -0.16);
  box(cam, mat(0xffd43b), 0.07, 0.05, 0.05, 0.12, 0.08, -0.02); // shutter button
  // red strap up to the neck
  box(folk.body, mat(0xc92a2a), 0.05, 0.42, 0.03, 0.05, 1.55, -0.28);
  folk.body.add(cam);
  // second camera in the raised hand (held up when shooting)
  const handCam = new THREE.Group();
  handCam.position.set(0, -0.62, -0.05);
  box(handCam, mat(0x212529), 0.2, 0.14, 0.16, 0, 0, 0);
  cyl(handCam, mat(0x868e96), 0.07, 0.12, 0, 0, -0.12);
  folk.armR.add(handCam);
  // scarf / press pass hint
  box(folk.body, mat(0xe03131), 0.22, 0.28, 0.04, -0.22, 1.35, -0.32);
}

/** Offscreen portrait of the live character mesh (clothes + accessories). */
function snapPortrait(root: THREE.Object3D): string | null {
  try {
    const W = 480;
    const H = 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xf3e8ff, 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a0d8, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(2.2, 4.5, -5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffd6ea, 0.55);
    fill.position.set(-3, 2, 2);
    scene.add(fill);

    const clone = root.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0.42, 0);
    scene.add(clone);

    const box3 = new THREE.Box3().setFromObject(clone);
    const size = box3.getSize(new THREE.Vector3());
    const centre = box3.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 40);
    const dist = (Math.max(size.y, size.x * 1.15) / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.22;
    cam.position.set(centre.x, centre.y + size.y * 0.06, centre.z - dist);
    cam.lookAt(centre.x, centre.y + size.y * 0.02, centre.z);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.dispose();
    scene.clear();
    return url;
  } catch {
    return null;
  }
}

function shutterSound(): void {
  tone(1800, 0, 0.04, 'square', 0.07);
  tone(900, 0.05, 0.08, 'triangle', 0.05);
  tone(400, 0.1, 0.12, 'sine', 0.04);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPhotographer(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  rng: () => number,
  ctx: GameCtx,
  hero: Character,
  siteOpts?: { apron?: number; clearLamps?: (area: Obstacle, obstacles: Obstacle[]) => void },
): Photographer {
  return new Photographer(scene, obstacles, rng, ctx, hero, siteOpts);
}
