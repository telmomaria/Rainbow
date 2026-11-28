/**
 * Aurora boreal (Reiquiavique only — Telmo, 2026-11-21).
 *
 * A few big curved ribbons far away in the sky, drawn with one tiny shader each: green curtains with
 * slowly moving folds and vertical rays, a touch of pink/violet at the top edge. Additive, no depth
 * write, no fog, no post-processing. The group follows the camera (like the stars) so it always sits
 * on the sky. It fades in when it gets dark (weather daylight) and out at dawn; a bit dimmer under clouds/rain,
 * never hidden. The narrator says once per visit "Olha para o céu! É a aurora boreal!".
 * No UI. `dispose()` on city change.
 */
import * as THREE from 'three';
import type { WeatherKind } from './weather';

/** How much of the aurora each kind of weather lets through — never hidden (Telmo, 2026-11-28: it must appear at night whatever the real weather). */
const SKY_CLEAR: Record<WeatherKind, number> = {
  clear: 1, partly: 0.9, overcast: 0.8, fog: 0.75, drizzle: 0.8, rain: 0.75, snow: 0.8, storm: 0.7,
};

/** Ribbons: start azimuth, span (rad), radius, bottom/top elevation (rad), phase. A gap stays in the south. */
const RIBBONS: [number, number, number, number, number, number][] = [
  [-2.45, 1.75, 255, -0.03, 0.5, 0.0],
  [-1.2, 1.9, 280, 0.0, 0.58, 1.7],
  [0.25, 1.6, 240, -0.02, 0.45, 3.1],
  [1.3, 1.5, 265, 0.01, 0.52, 4.6],
];

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uA0;
  uniform float uSpan;
  uniform float uR;
  uniform float uBot;
  uniform float uTop;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float u = uv.x;
    float t = uTime;
    // slow folds: the radius wobbles along the ribbon (big + small waves), drifting sideways
    float fold = sin(u * 7.0 + t * 0.11 + uPhase) * 0.075 + sin(u * 19.0 - t * 0.23 + uPhase * 2.0) * 0.03;
    float a = uA0 + u * uSpan + sin(u * 4.0 + t * 0.07 + uPhase) * 0.04;
    float r = uR * (1.0 + fold);
    // the lower edge waves gently up and down; the top edge a little more
    float bot = uBot + sin(u * 5.0 + t * 0.15 + uPhase) * 0.025;
    float top = uTop + sin(u * 3.0 - t * 0.09 + uPhase * 1.3) * 0.08;
    float el = mix(bot, top, uv.y);
    vec3 p = vec3(cos(a) * r * cos(el), r * sin(el), sin(a) * r * cos(el));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    float u = vUv.x;
    float v = vUv.y;
    float t = uTime;
    // vertical rays that slide slowly along the curtain
    float w = u * 55.0 + sin(u * 13.0 + t * 0.2 + uPhase) * 4.0;
    float r1 = 0.5 + 0.5 * sin(w + t * 0.35);
    float r2 = 0.5 + 0.5 * sin(w * 2.3 - t * 0.5 + uPhase);
    float rays = 0.15 + 0.65 * r1 * r1 + 0.2 * r2;
    // brightness: sharp bright lower edge, long soft fade upwards, nothing left at the top edge
    float lower = smoothstep(0.0, 0.06, v);
    float glow = lower * (0.3 + 0.9 * exp(-v * 2.4)) * smoothstep(1.0, 0.45, v) * 1.3;
    // ends of the ribbon fade out; a slow "breathing" pulse moves along it
    float ends = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
    float pulse = 0.75 + 0.25 * sin(u * 6.0 - t * 0.4 + uPhase);
    vec3 green = vec3(0.22, 1.0, 0.55);
    vec3 teal = vec3(0.15, 0.85, 0.75);
    vec3 pink = vec3(0.95, 0.35, 0.75);
    vec3 violet = vec3(0.55, 0.3, 1.0);
    vec3 col = mix(green, teal, 0.5 + 0.5 * sin(u * 5.0 + t * 0.1 + uPhase));
    vec3 topCol = mix(pink, violet, 0.5 + 0.5 * sin(u * 8.0 - t * 0.13));
    col = mix(col, topCol, smoothstep(0.3, 0.7, v));
    float k = glow * rays * ends * pulse * uOpacity;
    gl_FragColor = vec4(col * k, 1.0);
  }
`;

export interface AuroraOpts {
  /** 0 night … 1 day (Weather.daylight). */
  daylight: () => number;
  /** Current weather kind. */
  kind: () => WeatherKind;
  /** Narrator (gameCtx.say). */
  say: (lines: string[]) => void;
  /** False while flying / in a question / paused — the narrator waits. */
  canSpeak: () => boolean;
}

export class Aurora {
  private group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  private geo: THREE.PlaneGeometry;
  private time = Math.random() * 100;
  private opacity = 0;
  private seen = 0; // seconds it has been clearly visible (for the narrator line)
  private told = false;
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private opts: AuroraOpts,
  ) {
    this.group.name = 'aurora';
    // u along the ribbon (many segments for the folds), v up (the gradient is in the shader)
    this.geo = new THREE.PlaneGeometry(1, 1, 96, 1);
    for (const [a0, span, r, bot, top, phase] of RIBBONS) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uA0: { value: a0 },
          uSpan: { value: span },
          uR: { value: r },
          uBot: { value: bot },
          uTop: { value: top },
          uPhase: { value: phase },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.frustumCulled = false; // vertices are placed by the shader
      mesh.renderOrder = -1; // with the sky, before the transparent world stuff
      this.mats.push(mat);
      this.group.add(mesh);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  update(dt: number): void {
    const day = this.opts.daylight();
    const dark = THREE.MathUtils.clamp((0.38 - day) / 0.3, 0, 1);
    const target = dark * dark * (3 - 2 * dark) * SKY_CLEAR[this.opts.kind()];
    this.opacity += (target - this.opacity) * Math.min(1, dt * 0.4);
    if (this.group.parent !== this.scene) this.scene.add(this.group);
    this.group.visible = this.opacity > 0.01;
    if (!this.group.visible) {
      this.seen = 0;
      return;
    }
    this.time += dt;
    this.camera.getWorldPosition(this.tmp);
    this.group.position.copy(this.tmp);
    const breathe = 0.85 + 0.15 * Math.sin(this.time * 0.05);
    for (const m of this.mats) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uOpacity.value = this.opacity * breathe;
    }
    if (!this.told && this.opacity > 0.6) {
      this.seen += dt;
      if (this.seen > 4 && this.opts.canSpeak()) {
        this.told = true;
        this.opts.say(['Olha para o céu! É a aurora boreal!']);
      }
    }
  }

  /** QA under ?debug. */
  debug(): { opacity: number; visible: boolean; told: boolean } {
    return { opacity: +this.opacity.toFixed(2), visible: this.group.visible, told: this.told };
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    for (const m of this.mats) m.dispose();
    this.mats = [];
  }
}
