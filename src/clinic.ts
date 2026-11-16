import * as THREE from 'three';
import { tone } from './audio';
import { box, cyl, mat, type Folk } from './venue';

/**
 * Small street clinic (consulta rápida) — white/green consultório with exam bed, medical cross and
 * stethoscope. Distinct from the hospital ward (atropelamento). Shared by S08 services and folk I19.
 */

/** Paid consult at the service clinic (S08). */
export const CLINIC_COST = 3;

/** Red cross on a white plate (XY plane, faces +Z of parent). */
export function medicalCross(parent: THREE.Object3D, size: number, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const red = mat(0xe63946, 0.15);
  box(g, mat(0xffffff), size * 1.3, size * 1.3, 0.06, 0, 0, 0);
  box(g, red, size, size * 0.28, 0.1, 0, 0, 0.04);
  box(g, red, size * 0.28, size, 0.1, 0, 0, 0.04);
  parent.add(g);
  return g;
}

/**
 * Small white/green street clinic with a door (not a fair stall / open booth).
 * Local frame: body x∈[-hw,hw], z∈[-depth,0], +Z = front (road).
 */
export function buildClinicCabin(g: THREE.Group, hw: number, depth: number): void {
  const wall = mat(0xffffff);
  const trim = mat(0x2f9e44);
  const floor = mat(0xe9ecef);
  // raised floor (clinic, not a pavement stall)
  box(g, floor, hw * 2, 0.18, depth, 0, 0.09, -depth / 2);
  box(g, trim, hw * 2 + 0.1, 0.12, depth + 0.1, 0, 0.04, -depth / 2);
  // back + sides
  box(g, wall, hw * 2, 2.7, 0.2, 0, 1.4, -depth + 0.1);
  box(g, trim, hw * 2, 0.4, 0.22, 0, 0.3, -depth + 0.11);
  for (const s of [-1, 1]) {
    box(g, wall, 0.22, 2.7, depth, s * (hw - 0.11), 1.4, -depth / 2);
    box(g, trim, 0.24, 0.4, depth, s * (hw - 0.11), 0.3, -depth / 2);
    box(g, trim, 0.24, 0.2, depth, s * (hw - 0.11), 1.85, -depth / 2);
  }
  // Front wall with a wide door (clinic entrance — not an open booth / not a counter)
  const doorW = 2.2;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -hw : doorW / 2;
    const x1 = s < 0 ? -doorW / 2 : hw;
    const mid = (x0 + x1) / 2;
    const w = x1 - x0;
    box(g, wall, w, 2.7, 0.2, mid, 1.4, -0.1);
    box(g, trim, w, 0.4, 0.22, mid, 0.3, -0.09);
  }
  // doorframe + lintel with cross
  for (const s of [-1, 1]) box(g, trim, 0.16, 2.5, 0.22, s * (doorW / 2 + 0.05), 1.3, -0.05);
  box(g, trim, doorW + 0.4, 0.45, 0.28, 0, 2.55, -0.05);
  medicalCross(g, 0.65, 0, 2.55, 0.2);
  // pitched-ish roof (two slabs) — not a flat kiosk canopy
  const roof = mat(0x2f9e44);
  const rL = box(g, roof, hw + 0.35, 0.12, depth + 0.5, -hw / 2, 3.05, -depth / 2);
  rL.rotation.z = 0.18;
  const rR = box(g, roof, hw + 0.35, 0.12, depth + 0.5, hw / 2, 3.05, -depth / 2);
  rR.rotation.z = -0.18;
  box(g, mat(0xffffff), 0.35, 0.35, depth + 0.55, 0, 3.25, -depth / 2); // ridge
  cyl(g, trim, 0.09, 1.15, 0, 3.85, -depth / 2);
  medicalCross(g, 1.0, 0, 4.55, -depth / 2);
  // windows on the sides (white frame + cyan glass + tiny cross)
  for (const s of [-1, 1]) {
    box(g, mat(0x74c0fc, 0.2), 0.08, 0.7, 0.9, s * (hw - 0.02), 1.55, -depth / 2);
    box(g, mat(0xffffff), 0.1, 0.78, 0.08, s * (hw - 0.02), 1.55, -depth / 2 - 0.45);
    box(g, mat(0xffffff), 0.1, 0.78, 0.08, s * (hw - 0.02), 1.55, -depth / 2 + 0.45);
  }
  // back cabinet + bottles
  box(g, mat(0xdee2e6), 1.6, 1.4, 0.35, 0, 1.25, -depth + 0.45);
  for (let i = 0; i < 4; i++) {
    const col = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffe066][i];
    cyl(g, mat(col), 0.07, 0.28, -0.5 + i * 0.35, 1.7, -depth + 0.55);
  }
  // poster on the left wall
  const poster = new THREE.Group();
  poster.position.set(-hw + 0.24, 1.75, -depth / 2);
  poster.rotation.y = Math.PI / 2;
  box(poster, mat(0xffffff), 0.7, 0.9, 0.04, 0, 0, 0);
  cyl(poster, mat(0x2f9e44, 0.25), 0.22, 0.05, 0, 0.05, 0.04);
  box(poster, mat(0xffffff), 0.28, 0.08, 0.06, 0, 0.05, 0.07);
  box(poster, mat(0xffffff), 0.08, 0.28, 0.06, 0, 0.05, 0.07);
  g.add(poster);
  // little step at the door
  box(g, mat(0xadb5bd), doorW + 0.3, 0.1, 0.45, 0, 0.05, 0.25);
}

/** Exam bed (maca): mattress top at y≈0.72. Length along local X. Returns lie pose in local coords. */
export function buildExamBed(g: THREE.Group, x: number, z: number): { lx: number; ly: number; lz: number; face: number } {
  const bed = new THREE.Group();
  bed.position.set(x, 0, z);
  g.add(bed);
  // metal frame + legs
  box(bed, mat(0x868e96), 2.05, 0.1, 0.85, 0, 0.48, 0);
  for (const sx of [-0.88, 0.88])
    for (const sz of [-0.32, 0.32]) box(bed, mat(0x495057), 0.08, 0.48, 0.08, sx, 0.24, sz);
  // white mattress + raised headrest (pillow toward local −X)
  box(bed, mat(0xffffff), 2.0, 0.16, 0.8, 0, 0.62, 0);
  box(bed, mat(0xe7f5ff), 0.42, 0.18, 0.62, -0.72, 0.8, 0);
  // light-green clinical sheet
  box(bed, mat(0x8ce99a), 1.55, 0.03, 0.78, 0.2, 0.72, 0);
  // side rails (maca)
  for (const sz of [-0.42, 0.42]) box(bed, mat(0xadb5bd), 1.6, 0.06, 0.05, 0.15, 0.85, sz);
  // headboard
  box(bed, mat(0xced4da), 0.08, 0.55, 0.85, -1.0, 0.85, 0);
  // small instrument tray on a stand (not a shop counter)
  box(g, mat(0xadb5bd), 0.06, 1.0, 0.06, x + 1.15, 0.5, z + 0.55);
  box(g, mat(0xffffff), 0.45, 0.04, 0.35, x + 1.15, 1.05, z + 0.55);
  box(g, mat(0x74c0fc), 0.12, 0.08, 0.12, x + 1.05, 1.12, z + 0.55);
  box(g, mat(0xff6b6b), 0.1, 0.06, 0.1, x + 1.25, 1.12, z + 0.5);
  // Pillow at local −X; character head → local +Z of heading → face = −π/2 (site-local).
  return { lx: x, ly: 0.72, lz: z, face: -Math.PI / 2 };
}

/**
 * Stethoscope: loop on the chest + tube to the right hand. Returns the chest-piece so a HeartCheck can move it.
 * Add to `folk.body` (y=0 is feet of the body group… body origin is at pelvis; chest ≈ y 1.35).
 */
export function attachStethoscope(folk: Folk): THREE.Group {
  const tip = new THREE.Group();
  // resting on the doctor's own chest
  tip.position.set(0.12, 1.35, -0.32);
  folk.body.add(tip);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 14), mat(0x212529, 0.1));
  disc.rotation.x = Math.PI / 2;
  tip.add(disc);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), mat(0x212529));
  loop.position.set(-0.12, 0.08, 0.02);
  tip.add(loop);
  // ear tubes up toward the neck (decorative)
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), mat(0x212529));
    t.position.set(s * 0.1, 0.28, 0.05);
    t.rotation.z = s * 0.35;
    tip.add(t);
  }
  return tip;
}

/** Scripted heart-check: doctor steps to the bed, reaches, scope to her chest, tum-tum, then steps back. */
export class HeartCheck {
  private phase: 'idle' | 'walk' | 'listen' | 'finish' = 'idle';
  private t = 0;
  private home = new THREE.Vector3();
  private beside = new THREE.Vector3();
  private chest = new THREE.Vector3();
  private tipHome = new THREE.Vector3();
  private onSaid: (() => void) | null = null;
  private said = false;
  finished = false;

  constructor(
    private readonly doctor: Folk,
    private readonly tip: THREE.Group,
    /** Local/home standing spot of the doctor (same space as doctor.group.position). */
    home: { x: number; z: number },
    /** Where the doctor stands while listening (beside the bed). */
    beside: { x: number; z: number },
  ) {
    this.home.set(home.x, 0, home.z);
    this.beside.set(beside.x, 0, beside.z);
    this.tipHome.copy(this.tip.position);
    this.doctor.group.position.copy(this.home);
  }

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /**
   * Begin a consult. `chestWorld` = where the scope tip should go (world).
   * `onSaid` fires once when the listen ends (~3 s of listening) — say "Estás bem!" / feel('doctor') there.
   */
  start(chestWorld: THREE.Vector3, onSaid: () => void): void {
    this.phase = 'walk';
    this.t = 0;
    this.said = false;
    this.finished = false;
    this.onSaid = onSaid;
    this.chest.copy(chestWorld);
    this.doctor.group.position.copy(this.home);
  }

  /** Abort / reset (get off early, city change…). */
  reset(): void {
    this.phase = 'idle';
    this.t = 0;
    this.said = false;
    this.finished = false;
    this.onSaid = null;
    this.doctor.group.position.copy(this.home);
    this.tip.position.copy(this.tipHome);
    this.doctor.armR.rotation.set(0, 0, 0.08);
    this.doctor.head.rotation.set(0, 0, 0);
  }

  update(dt: number): void {
    if (this.phase === 'idle') {
      this.doctor.body.position.y = Math.sin(performance.now() * 0.0017) * 0.012;
      return;
    }
    this.t += dt;
    const d = this.doctor;
    // Face the bedside target (local: look along -Z of group → rotation.y = atan2(dx,dz)+π toward point)
    const faceToward = (x: number, z: number) => {
      const dx = x - d.group.position.x;
      const dz = z - d.group.position.z;
      d.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    };
    const bedX = (this.home.x + this.beside.x) * 0.5;
    const bedZ = this.beside.z - 0.6;
    if (this.phase === 'walk') {
      const k = Math.min(1, this.t / 0.7);
      d.group.position.lerpVectors(this.home, this.beside, k);
      faceToward(bedX, bedZ);
      d.armR.rotation.x = -0.4 * k;
      if (k >= 1) {
        this.phase = 'listen';
        this.t = 0;
      }
    } else if (this.phase === 'listen') {
      d.group.position.copy(this.beside);
      faceToward(bedX, bedZ);
      d.armR.rotation.x = -1.35;
      d.armR.rotation.z = 0.15;
      d.head.rotation.x = 0.15;
      d.body.updateWorldMatrix(true, false);
      const local = d.body.worldToLocal(this.chest.clone());
      const u = Math.min(1, this.t / 0.45);
      this.tip.position.lerpVectors(this.tipHome, local, u);
      if (this.t > 0.6 && this.t - dt <= 0.6) tone(90, 0, 0.14, 'sine', 0.1);
      if (this.t > 0.95 && this.t - dt <= 0.95) tone(90, 0, 0.14, 'sine', 0.1);
      if (this.t > 1.8 && this.t - dt <= 1.8) tone(90, 0, 0.14, 'sine', 0.1);
      if (this.t > 2.15 && this.t - dt <= 2.15) tone(90, 0, 0.14, 'sine', 0.1);
      if (this.t >= 3.0 && !this.said) {
        this.said = true;
        this.onSaid?.();
        d.head.rotation.x = 0;
      }
      if (this.t >= 3.4) {
        this.phase = 'finish';
        this.t = 0;
      }
    } else if (this.phase === 'finish') {
      const k = Math.min(1, this.t / 0.55);
      d.group.position.lerpVectors(this.beside, this.home, k);
      this.tip.position.lerp(this.tipHome, Math.min(1, dt * 6));
      d.armR.rotation.x *= 1 - k;
      d.armR.rotation.z *= 1 - k;
      d.head.rotation.x = Math.sin(this.t * 10) * 0.25 * (1 - k);
      if (k >= 1) {
        this.finished = true;
        this.phase = 'idle';
        this.resetPose();
      }
    }
  }

  private resetPose(): void {
    this.doctor.group.position.copy(this.home);
    this.tip.position.copy(this.tipHome);
    this.doctor.armR.rotation.set(0, 0, 0.08);
    this.doctor.head.rotation.set(0, 0, 0);
  }
}
