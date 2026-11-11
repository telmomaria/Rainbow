import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS, SPAWN, onRoad, type Obstacle } from './world';
import { AIRPORT_ZONE } from './airport';
import { isFree } from './spawn';

/**
 * Classic street lamps along the street grid. They switch on by themselves when it gets dark
 * (weather.daylight < ON_BELOW), one by one in a quick staggered wave with a little start-up flicker,
 * and off again when it gets light.
 *
 * Cheap on a tablet: posts, bulbs, glows and ground pools are 4 InstancedMeshes (4 draw calls for 100+ lamps);
 * the glow/pool are additive fakes. Only POINT_LIGHTS real PointLights exist; every frame they jump to the lit
 * lamps nearest the camera (and are hidden in daytime so lit materials don't pay for them).
 */

const SPACING = 11; // along each road, alternating sides → one lamp every 22 m on each side
const OFFSET = 5.5; // from the road centre line (on the pavement)
const CROSS_CLEAR = 7; // skip ± this around intersections
const AIRPORT_MARGIN = 3;
const SPAWN_CLEAR = 8;
const MAP_LIMIT = ROADS.extent - 8;
const POST_R = 0.45; // free radius needed for a post
const FOOT = 0.22; // obstacle half-size pushed for each post

const HEAD_X = 1.0; // the lantern hangs this far out over the road side (local +X)
const HEAD_Y = 4.35;
const BULB_Y = HEAD_Y - 0.22;
const GLOW_SIZE = 3.4;
const POOL_R = 4.6;

const ON_BELOW = 0.45; // daylight under this → lamps on
const OFF_ABOVE = 0.5; // … over this → off (hysteresis)
const WAVE_S = 2.4; // longest random delay of the switching wave
const FLICKER_S = 0.55;

const POINT_LIGHTS = 6;
const LIGHT_INTENSITY = 22;
const LIGHT_DIST = 14;

const WARM = new THREE.Color(0xffc970);
const BULB_OFF = new THREE.Color(0xd8d3c2);
const BULB_ON = new THREE.Color(0xfff4c2);
const BLACK = new THREE.Color(0x000000);

interface Lamp {
  x: number; // post position
  z: number;
  hx: number; // lantern (head) position, xz
  hz: number;
  rotY: number;
  on: boolean; // where it is heading
  delay: number; // seconds until it follows the global switch
  level: number; // 0..1 shown brightness
  flicker: number; // seconds of start-up flicker left
  shown: number; // last level written to the GPU (-1 = never)
}

/** Radial white→transparent texture used by the glow and the ground pool. */
function radialTexture(size: number, stops: [number, number][]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Additive material that fades into the fog (instead of adding the fog colour, which would show a square). */
function additiveMaterial(map: THREE.Texture, fogKeep: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor.rgb *= 1.0 - fogFactor * ${(1 - fogKeep).toFixed(2)};
      #endif`,
    );
  };
  m.customProgramCacheKey = () => `streetlight-additive-${fogKeep}`;
  return m;
}

export class StreetLights {
  private root = new THREE.Group();
  private lamps: Lamp[] = [];
  private frame: THREE.InstancedMesh;
  private bulbs: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private lights: THREE.PointLight[] = [];
  private want = false;
  private started = false;
  private time = 0;

  private tmpM = new THREE.Matrix4();
  private tmpP = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private camQ = new THREE.Quaternion();
  private camP = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private nearest: number[] = [];
  private nearestD: number[] = [];

  constructor(scene: THREE.Scene, obstacles: Obstacle[]) {
    this.root.name = 'streetlights';
    this.place(obstacles);
    const n = this.lamps.length;

    // --- post + base + arm + lantern cap, merged into one geometry (local +X = towards the road)
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.CylinderGeometry(0.2, 0.27, 0.5, 10);
    base.translate(0, 0.25, 0);
    const post = new THREE.CylinderGeometry(0.075, 0.11, 4.3, 8);
    post.translate(0, 2.4, 0);
    const top = new THREE.SphereGeometry(0.13, 8, 6);
    top.translate(0, 4.6, 0);
    const arm = new THREE.BoxGeometry(HEAD_X + 0.1, 0.08, 0.08);
    arm.translate((HEAD_X + 0.1) / 2, 4.6, 0);
    const hook = new THREE.BoxGeometry(0.05, 0.16, 0.05);
    hook.translate(HEAD_X, 4.5, 0);
    const cap = new THREE.CylinderGeometry(0.06, 0.4, 0.26, 6);
    cap.translate(HEAD_X, HEAD_Y + 0.05, 0);
    parts.push(base, post, top, arm, hook, cap);
    const frameGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    for (const g of parts) g.dispose();
    this.frame = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0x3d4466, roughness: 0.6 }), n);
    this.frame.castShadow = true;

    // --- bulbs (colour per instance: dim cream when off, bright warm when on)
    const bulbGeo = new THREE.SphereGeometry(0.22, 10, 8);
    bulbGeo.translate(HEAD_X, BULB_Y, 0);
    this.bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);

    for (let i = 0; i < n; i++) {
      const l = this.lamps[i];
      this.tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, l.rotY);
      this.tmpM.compose(this.tmpP.set(l.x, 0, l.z), this.tmpQ, this.tmpS.set(1, 1, 1));
      this.frame.setMatrixAt(i, this.tmpM);
      this.bulbs.setMatrixAt(i, this.tmpM);
      this.bulbs.setColorAt(i, BULB_OFF);
    }

    // --- soft glow around each bulb (camera-facing quads, additive)
    const glowMat = additiveMaterial(radialTexture(64, [[0, 1], [0.18, 0.75], [0.45, 0.22], [1, 0]]), 0.55);
    this.glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, n);
    this.glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glows.frustumCulled = false;
    this.glows.renderOrder = 2;

    // --- pool of light on the ground under each lantern (additive disc)
    const poolGeo = new THREE.CircleGeometry(POOL_R, 24);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = additiveMaterial(radialTexture(64, [[0, 0.9], [0.35, 0.55], [0.7, 0.18], [1, 0]]), 0);
    poolMat.polygonOffset = true;
    poolMat.polygonOffsetFactor = -2;
    poolMat.polygonOffsetUnits = -2;
    this.pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
    this.pools.renderOrder = 1;
    for (let i = 0; i < n; i++) {
      const l = this.lamps[i];
      this.tmpM.makeTranslation(l.hx, 0.04, l.hz);
      this.pools.setMatrixAt(i, this.tmpM);
      this.pools.setColorAt(i, BLACK);
      this.glows.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
      this.glows.setColorAt(i, BLACK);
    }
    this.glows.visible = this.pools.visible = false;

    // --- the few real lights, re-assigned every frame to the nearest lit lamps
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const pl = new THREE.PointLight(WARM, 0, LIGHT_DIST, 1.5);
      pl.visible = false;
      this.lights.push(pl);
      this.root.add(pl);
    }

    for (const m of [this.frame, this.bulbs, this.glows, this.pools]) {
      m.computeBoundingSphere();
      this.root.add(m);
    }
    scene.add(this.root);
  }

  /** Number of lamp posts placed. */
  count(): number {
    return this.lamps.length;
  }

  /** Number of lamps currently shining (any brightness). */
  litCount(): number {
    let k = 0;
    for (const l of this.lamps) if (l.level > 0.01) k++;
    return k;
  }

  /** Call every frame with the weather's daylight (0 night … 1 day). */
  update(dt: number, daylight: number, camera: THREE.Camera): void {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    if (this.root.parent === null) return;

    const want = this.want ? daylight < OFF_ABOVE : daylight < ON_BELOW;
    if (!this.started) {
      // first frame (new city): no wave, just be in the right state
      this.started = true;
      this.want = want;
      for (const l of this.lamps) {
        l.on = want;
        l.level = want ? 1 : 0;
        l.delay = 0;
      }
    } else if (want !== this.want) {
      this.want = want;
      for (const l of this.lamps) l.delay = Math.random() * WAVE_S;
    }

    // --- per-lamp switching, flicker and fade
    let colorsDirty = false;
    let anyLit = false;
    for (const l of this.lamps) {
      if (l.on !== this.want) {
        l.delay -= dt;
        if (l.delay <= 0) {
          l.on = this.want;
          if (l.on) l.flicker = FLICKER_S * (0.6 + Math.random() * 0.7);
        }
      }
      let shown: number;
      if (l.on) {
        l.level = Math.min(1, l.level + dt * 3);
        if (l.flicker > 0) {
          l.flicker -= dt;
          // quick on/off stutter, more "on" as it settles
          const settle = 1 - Math.max(l.flicker, 0) / FLICKER_S;
          shown = Math.random() < 0.35 + settle * 0.5 ? l.level : l.level * 0.12;
        } else shown = l.level;
      } else {
        l.level = Math.max(0, l.level - dt * 2.5);
        shown = l.level;
      }
      if (Math.abs(shown - l.shown) > 0.004) {
        l.shown = shown;
        colorsDirty = true;
      }
      if (l.shown > 0.01) anyLit = true;
    }

    const n = this.lamps.length;
    if (colorsDirty) {
      for (let i = 0; i < n; i++) {
        const s = Math.max(0, this.lamps[i].shown);
        this.bulbs.setColorAt(i, this.tmpC.copy(BULB_OFF).lerp(BULB_ON, s));
        this.glows.setColorAt(i, this.tmpC.copy(WARM).multiplyScalar(s * 0.85));
        this.pools.setColorAt(i, this.tmpC.copy(WARM).multiplyScalar(s * 0.42));
      }
      this.bulbs.instanceColor!.needsUpdate = true;
      this.glows.instanceColor!.needsUpdate = true;
      this.pools.instanceColor!.needsUpdate = true;
    }
    this.glows.visible = this.pools.visible = anyLit;

    camera.getWorldPosition(this.camP);
    camera.getWorldQuaternion(this.camQ);

    // --- camera-facing glows (only lit lamps get a size)
    if (anyLit) {
      for (let i = 0; i < n; i++) {
        const l = this.lamps[i];
        const s = l.shown > 0.01 ? GLOW_SIZE * (0.75 + 0.25 * l.shown) : 0;
        this.tmpM.compose(this.tmpP.set(l.hx, BULB_Y, l.hz), this.camQ, this.tmpS.set(s, s, s));
        this.glows.setMatrixAt(i, this.tmpM);
      }
      this.glows.instanceMatrix.needsUpdate = true;
    }

    this.assignLights(anyLit);
  }

  /** Remove everything from the scene and free GPU memory (optional: scene.clear() also drops it). */
  dispose(): void {
    this.root.removeFromParent();
    for (const m of [this.frame, this.bulbs, this.glows, this.pools]) {
      m.geometry.dispose();
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      m.dispose();
    }
    for (const l of this.lights) l.dispose();
  }

  // ------------------------------------------------------------ internals

  /** The real PointLights go to the POINT_LIGHTS lit lamps nearest the camera, fading at the edge of the set. */
  private assignLights(anyLit: boolean): void {
    for (const pl of this.lights) pl.visible = anyLit; // constant light count while lit → no shader recompiles
    if (!anyLit) return;
    const near = this.nearest;
    const nd = this.nearestD;
    near.length = nd.length = 0;
    const K = POINT_LIGHTS + 1; // one extra to know how close the next candidate is
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      if (l.shown <= 0.01) continue;
      const d = Math.hypot(l.hx - this.camP.x, l.hz - this.camP.z);
      if (near.length === K && d >= nd[K - 1]) continue;
      let j = Math.min(near.length, K - 1);
      if (near.length < K) {
        near.push(i);
        nd.push(d);
      }
      while (j > 0 && nd[j - 1] > d) {
        near[j] = near[j - 1];
        nd[j] = nd[j - 1];
        j--;
      }
      near[j] = i;
      nd[j] = d;
    }
    const next = near.length > POINT_LIGHTS ? nd[POINT_LIGHTS] : Infinity;
    for (let k = 0; k < POINT_LIGHTS; k++) {
      const pl = this.lights[k];
      if (k >= near.length) {
        pl.intensity = 0;
        continue;
      }
      const l = this.lamps[near[k]];
      pl.position.set(l.hx, BULB_Y - 0.3, l.hz);
      const handover = Math.min(1, Math.max(0, (next - nd[k]) / 6)); // fades out as another lamp gets as close
      pl.intensity = LIGHT_INTENSITY * l.shown * handover;
    }
  }

  private place(obstacles: Obstacle[]): void {
    const z0 = AIRPORT_ZONE;
    const ok = (x: number, z: number): boolean => {
      if (Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) return false;
      if (onRoad(x, z, 0.4)) return false;
      if (ROADS.xs.some((rx) => Math.abs(x - rx) < CROSS_CLEAR) && ROADS.zs.some((rz) => Math.abs(z - rz) < CROSS_CLEAR)) return false;
      if (
        x > z0.minX - AIRPORT_MARGIN && x < z0.maxX + AIRPORT_MARGIN &&
        z > z0.minZ - AIRPORT_MARGIN && z < z0.maxZ + AIRPORT_MARGIN
      ) return false;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < SPAWN_CLEAR) return false;
      return isFree(x, z, POST_R, obstacles);
    };
    const add = (x: number, z: number, armX: number, armZ: number) => {
      if (!ok(x, z)) return;
      this.lamps.push({
        x, z, hx: x + armX * HEAD_X, hz: z + armZ * HEAD_X,
        rotY: Math.atan2(-armZ, armX), // local +X → (armX, armZ)
        on: false, delay: 0, level: 0, flicker: 0, shown: -1,
      });
      obstacles.push({ minX: x - FOOT, maxX: x + FOOT, minZ: z - FOOT, maxZ: z + FOOT });
    };
    const start = -ROADS.extent + 6;
    for (const rx of ROADS.xs) {
      let i = 0;
      for (let t = start; t <= ROADS.extent - 6; t += SPACING, i++) {
        const side = i % 2 === 0 ? 1 : -1;
        add(rx + side * OFFSET, t, -side, 0);
      }
    }
    for (const rz of ROADS.zs) {
      let i = 0;
      for (let t = start + SPACING / 2; t <= ROADS.extent - 6; t += SPACING, i++) {
        const side = i % 2 === 0 ? 1 : -1;
        add(t, rz + side * OFFSET, 0, -side);
      }
    }
  }
}
