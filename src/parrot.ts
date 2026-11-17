import * as THREE from 'three';
import { chirp } from './audio';
import { parkSite, siteBox, siteGroup, siteToWorld } from './places';
import { mulberry32, type Interactable, type Obstacle, type World } from './world';

/** Só no Rio de Janeiro (cities.ts — name exacto). */
export const PARROT_CITY = 'Rio de Janeiro';
/** Nome infantil original PT-PT (sem IP). */
export const PARROT_NAME = 'Cacau';

const NEAR = 3.2;
const COOLDOWN = 22;
const TREE_HW = 2.4;
const TREE_DEPTH = 2.6;
/** Perch height (m) — below the crown so the bird stays readable. */
const PERCH_Y = 2.35;
/** Local X of the bird on the branch (away from the trunk). */
const BIRD_LX = 1.35;

/**
 * Papagaio verde low-poly num poleiro/árvore — só no Rio.
 * Ao aproximar: «Olá!» + o nome (voz aguda). Sem UI.
 */
export class RioParrot {
  readonly things: Interactable[] = [];
  private readonly root: THREE.Group | null = null;
  private readonly bird: THREE.Group | null = null;
  private readonly head: THREE.Object3D | null = null;
  private readonly wingL: THREE.Object3D | null = null;
  private readonly wingR: THREE.Object3D | null = null;
  private readonly at = new THREE.Vector3();
  private coolUntil = 0;
  private time = 0;
  private flapBurst = 0;
  private alive = false;

  constructor(
    scene: THREE.Scene,
    obstacles: Obstacle[],
    world: World,
    seed: number,
    cityName: string,
  ) {
    if (cityName !== PARROT_CITY) return;
    const rng = mulberry32(seed * 173 + 29);
    const site =
      parkSite(obstacles, rng, TREE_HW, TREE_DEPTH, { minD: 42, maxD: 118, roadGap: 6 }) ??
      parkSite(obstacles, rng, TREE_HW, TREE_DEPTH, { minD: 32, maxD: 130, roadGap: 5 });
    if (!site) return;

    const area = siteBox(site, -TREE_HW, TREE_HW, -TREE_DEPTH, 0.6);
    world.clearArea(area, 2);
    obstacles.push({ ...area, height: 0.4 });
    // trunk solid
    const trunkBox = siteBox(site, -0.45, 0.45, -TREE_DEPTH / 2 - 0.4, -TREE_DEPTH / 2 + 0.4);
    obstacles.push({ ...trunkBox, height: 2.4 });

    this.root = siteGroup(scene, site);
    this.buildTree(this.root);
    const built = buildParrot();
    this.bird = built.bird;
    this.head = built.head;
    this.wingL = built.wingL;
    this.wingR = built.wingR;
    // perch tip (local): out from the trunk, clear of the crown
    const perchZ = -TREE_DEPTH / 2;
    this.bird.position.set(BIRD_LX, PERCH_Y, perchZ + 0.05);
    this.bird.rotation.y = Math.PI * 0.65; // faces roughly toward the approach apron
    this.root.add(this.bird);
    this.root.updateMatrixWorld(true);

    this.at.copy(siteToWorld(site, BIRD_LX * 0.55, perchZ + 1.1));
    this.alive = true;

    this.things.push({
      object: this.bird,
      position: this.at.clone(),
      radius: NEAR,
      interact: () => {
        this.greet();
      },
      update: (dt) => this.tick(dt),
    });
  }

  private buildTree(g: THREE.Group): void {
    const bark = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9, flatShading: true });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.85, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8d6e4c, roughness: 0.88, flatShading: true });

    const trunkZ = -TREE_DEPTH / 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 8), bark);
    trunk.position.set(0, 1.6, trunkZ);
    trunk.castShadow = true;
    g.add(trunk);

    // long horizontal perch sticking out so the bird is not inside the leaves
    const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), wood);
    perch.rotation.z = Math.PI / 2;
    perch.position.set(BIRD_LX * 0.5, PERCH_Y - 0.1, trunkZ);
    perch.castShadow = true;
    g.add(perch);

    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.24, 6), wood);
    peg.position.set(BIRD_LX, PERCH_Y - 0.2, trunkZ + 0.02);
    g.add(peg);

    // crown kept high / behind the perch so Cacau stays readable from the front
    for (const [x, y, z, s] of [
      [0.05, 4.0, trunkZ - 0.15, 1.35],
      [-0.75, 3.65, trunkZ - 0.35, 1.05],
      [0.55, 3.75, trunkZ - 0.55, 1.0],
      [-0.15, 3.55, trunkZ + 0.55, 0.95],
      [0.2, 4.25, trunkZ + 0.2, 1.1],
    ] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leaf);
      crown.position.set(x, y, z);
      crown.castShadow = true;
      g.add(crown);
    }
  }

  private greet(): void {
    if (!this.alive) return;
    const now = performance.now() / 1000;
    if (now < this.coolUntil) {
      this.flapBurst = 0.6;
      return;
    }
    // don't burn the cooldown while the narrator is still talking (arrival, etc.)
    if (typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending)) {
      this.flapBurst = 0.5;
      return;
    }
    this.coolUntil = now + COOLDOWN;
    this.flapBurst = 1.4;
    chirp(['Olá!', `Eu sou o ${PARROT_NAME}!`], 1.7);
  }

  private tick(dt: number): void {
    if (!this.alive || !this.bird || !this.head || !this.wingL || !this.wingR) return;
    this.time += dt;
    const t = this.time;
    // idle: soft head bob + slow wing tuck
    this.head.rotation.y = Math.sin(t * 1.3) * 0.22;
    this.head.rotation.x = Math.sin(t * 0.9) * 0.08;
    let flap = Math.sin(t * 2.2) * 0.08;
    if (this.flapBurst > 0) {
      this.flapBurst = Math.max(0, this.flapBurst - dt);
      flap = Math.sin(t * 18) * 0.55;
    }
    this.wingL.rotation.z = 0.35 + flap;
    this.wingR.rotation.z = -0.35 - flap;
    this.bird.position.y = PERCH_Y + Math.sin(t * 1.6) * 0.02;
  }

  dispose(): void {
    if (!this.alive) return;
    this.root?.parent?.remove(this.root);
    this.things.length = 0;
    this.alive = false;
  }

  debug(): {
    on: boolean;
    name: string;
    at: [number, number] | null;
    bird: [number, number, number] | null;
    coolLeft: number;
  } {
    if (!this.alive) return { on: false, name: PARROT_NAME, at: null, bird: null, coolLeft: 0 };
    const left = Math.max(0, this.coolUntil - performance.now() / 1000);
    let bird: [number, number, number] | null = null;
    if (this.bird) {
      const p = new THREE.Vector3();
      this.bird.getWorldPosition(p);
      bird = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
    }
    return {
      on: true,
      name: PARROT_NAME,
      at: [+this.at.x.toFixed(1), +this.at.z.toFixed(1)],
      bird,
      coolLeft: +left.toFixed(1),
    };
  }
}

/**
 * Recognisable low-poly parrot: green body, yellow belly, red face, hooked beak, wings, eyes, tail.
 * Face toward local −Z.
 */
function buildParrot(): {
  bird: THREE.Group;
  head: THREE.Object3D;
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
} {
  const bird = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x37b24d, roughness: 0.65, flatShading: true });
  const darkGreen = new THREE.MeshStandardMaterial({ color: 0x2b8a3e, roughness: 0.7, flatShading: true });
  const belly = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.75, flatShading: true });
  const red = new THREE.MeshStandardMaterial({ color: 0xfa5252, roughness: 0.55, flatShading: true });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.45, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1c7ed6, roughness: 0.65, flatShading: true });

  // elongated body (reads as bird, not a ball)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), green);
  body.scale.set(0.75, 1.15, 1.55);
  body.position.set(0, 0.28, 0.06);
  bird.add(body);

  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), belly);
  tummy.scale.set(0.65, 1.0, 0.7);
  tummy.position.set(0, 0.2, -0.12);
  bird.add(tummy);

  const head = new THREE.Group();
  head.position.set(0, 0.52, -0.22);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), green);
  skull.scale.set(1, 0.95, 1.05);
  head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), red);
  face.scale.set(0.9, 0.8, 0.55);
  face.position.set(0, -0.01, -0.1);
  head.add(face);

  // big hooked beak
  const beak = new THREE.Group();
  beak.position.set(0, -0.02, -0.2);
  const upper = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 7), beakMat);
  upper.rotation.x = Math.PI / 2 + 0.55;
  upper.position.set(0, 0.03, -0.04);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 6), beakMat);
  lower.rotation.x = Math.PI / 2 - 0.2;
  lower.position.set(0, -0.03, -0.03);
  beak.add(upper, lower);
  head.add(beak);

  for (const s of [-1, 1] as const) {
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), white);
    ring.position.set(s * 0.085, 0.025, -0.11);
    head.add(ring);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), black);
    pupil.position.set(s * 0.085, 0.025, -0.14);
    head.add(pupil);
  }
  bird.add(head);

  // flat folded wings sticking out to the sides
  const wingL = new THREE.Group();
  wingL.position.set(-0.14, 0.32, 0.02);
  const wl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.38), darkGreen);
  wl.rotation.z = 0.35;
  wl.rotation.x = 0.15;
  wl.position.set(-0.06, -0.02, 0.04);
  wingL.add(wl);
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), blue);
  tipL.position.set(-0.07, -0.12, 0.2);
  tipL.rotation.z = 0.2;
  wingL.add(tipL);
  bird.add(wingL);

  const wingR = new THREE.Group();
  wingR.position.set(0.14, 0.32, 0.02);
  const wr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.38), darkGreen);
  wr.rotation.z = -0.35;
  wr.rotation.x = 0.15;
  wr.position.set(0.06, -0.02, 0.04);
  wingR.add(wr);
  const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.16), blue);
  tipR.position.set(0.07, -0.12, 0.2);
  tipR.rotation.z = -0.2;
  wingR.add(tipR);
  bird.add(wingR);

  // long colourful tail fan
  const tail = new THREE.Group();
  tail.position.set(0, 0.16, 0.34);
  for (const [dx, col, len, tilt] of [
    [-0.07, 0x2f9e44, 0.42, -0.2],
    [0, 0xffe066, 0.48, 0],
    [0.07, 0x1c7ed6, 0.4, 0.2],
  ] as const) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, len, 5),
      new THREE.MeshStandardMaterial({ color: col, flatShading: true }),
    );
    f.rotation.x = Math.PI / 2 + 0.35;
    f.rotation.z = tilt;
    f.position.set(dx, -0.04, len * 0.32);
    tail.add(f);
  }
  bird.add(tail);

  for (const s of [-1, 1] as const) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), beakMat);
    foot.scale.set(1.3, 0.45, 1.7);
    foot.position.set(s * 0.07, 0.02, -0.04);
    bird.add(foot);
  }

  bird.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  bird.scale.setScalar(1.7);
  return { bird, head, wingL, wingR };
}

export function noParrot(): RioParrot {
  return {
    things: [],
    update() {},
    dispose() {},
    debug: () => ({ on: false, name: PARROT_NAME, at: null, bird: null, coolLeft: 0 }),
  } as unknown as RioParrot;
}

/** One parrot only in Rio de Janeiro; elsewhere a no-op stub. */
export function createParrot(
  scene: THREE.Scene,
  obstacles: Obstacle[],
  world: World,
  seed: number,
  cityName: string,
): RioParrot {
  if (cityName !== PARROT_CITY) return noParrot();
  return new RioParrot(scene, obstacles, world, seed, cityName);
}
