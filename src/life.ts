import { speak, tone } from './audio';
import { onFeel, type LifeEvent } from './bus';
import type { SaveData } from './save';

/**
 * Energy and mood (rules R01–R05 of the 2026-11-15 brief).
 *
 * - Energy: 5 levels. Drops one level every 10 minutes of play; at zero she walks slowly (she never falls).
 *   Up with: eating or drinking (+1), the fountain (+1), sitting down (+1), sleeping in the bed at home (full),
 *   massage (+3), doctor (+3), hospital (full, free).
 * - Mood: five faces (muito triste, triste, normal, feliz, muito feliz). Drops one level every 20 minutes of play.
 *   Up with: hairdresser, shopping, eating, a meal, playing, giving a flower, saving the kitten (+1 each); SPA (+2).
 * - "Muito feliz" gives one more coin for each right answer. "Muito triste" only shows in the face and in her walk.
 *
 * Gameplay modules never call this class: they call `feel(...)` from bus.ts.
 */
export const ENERGY_MAX = 5;
export const MOOD_MAX = 4;
const ENERGY_EVERY_S = 10 * 60;
const MOOD_EVERY_S = 20 * 60;

/** What each event does: energy / mood change ('full' = fill up) and a cool-down (s of play) so it can't be farmed. */
const EFFECTS: Record<LifeEvent, { energy?: number | 'full'; mood?: number; every: number }> = {
  eat: { energy: 1, mood: 1, every: 20 },
  drink: { energy: 1, every: 90 },
  rest: { energy: 1, every: 90 },
  sleep: { energy: 'full', every: 5 },
  play: { mood: 1, every: 120 },
  kind: { mood: 1, every: 20 },
  groom: { mood: 1, every: 0 },
  shop: { mood: 1, every: 60 },
  meal: { energy: 1, mood: 1, every: 0 },
  massage: { energy: 3, mood: 1, every: 0 },
  doctor: { energy: 3, every: 0 },
  spa: { energy: 2, mood: 2, every: 0 },
  hospital: { energy: 'full', every: 0 },
  rescue: { mood: 1, every: 0 },
  capsule: { energy: 'full', every: 0 },
};

const MOOD_NAMES = ['Muito triste', 'Triste', 'Normal', 'Feliz', 'Muito feliz'];

const style = document.createElement('style');
style.textContent = `
  .hud { flex-wrap: wrap; max-width: calc(100vw - 250px); }
  .life { display: flex; align-items: center; gap: 10px; padding: 8px 14px 8px 10px; border-radius: 999px;
    background: rgba(255,255,255,.85); box-shadow: 0 4px 12px rgba(0,0,0,.15); user-select: none; pointer-events: none;
    transition: transform .15s; }
  .life.bump { transform: scale(1.18); }
  .life-bolt { width: 30px; height: 38px; }
  .life-pips { display: flex; gap: 4px; }
  .life-pip { width: 13px; height: 30px; border-radius: 5px; background: #e4def2; transition: background .4s; }
  .life-pips[data-level="5"] .life-pip.on, .life-pips[data-level="4"] .life-pip.on, .life-pips[data-level="3"] .life-pip.on { background: #37c871; }
  .life-pips[data-level="2"] .life-pip.on { background: #ffb020; }
  .life-pips[data-level="1"] .life-pip.on { background: #f0483e; }
  .life-face { width: 44px; height: 44px; display: block; }
  .life.mood { padding: 5px 8px; }
`;
document.head.appendChild(style);

/** The mood face, drawn as a small SVG (no text). 0 = muito triste … 4 = muito feliz. */
function faceSvg(mood: number): string {
  const skin = ['#9ec5ff', '#c9dcf5', '#ffe066', '#ffd43b', '#ffc21a'][mood];
  const mouth = [
    '<path d="M14 33 Q22 24 30 33" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M15 31 Q22 26 29 31" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M15 30 H29" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M14 27 Q22 35 30 27" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M12 25 Q22 40 32 25 Z" fill="#3b2a5a"/><path d="M17 31 Q22 36 27 31 Z" fill="#ff6f91"/>',
  ][mood];
  const eyes =
    mood === 4
      ? '<path d="M12 18 Q15.5 13 19 18 M25 18 Q28.5 13 32 18" fill="none" stroke="#3b2a5a" stroke-width="3" stroke-linecap="round"/>'
      : '<circle cx="15.5" cy="17" r="2.8" fill="#3b2a5a"/><circle cx="28.5" cy="17" r="2.8" fill="#3b2a5a"/>';
  const brows =
    mood <= 1
      ? '<path d="M11 12 L18 10 M33 12 L26 10" fill="none" stroke="#3b2a5a" stroke-width="2.2" stroke-linecap="round"/>'
      : '';
  const tear = mood === 0 ? '<path d="M31 21 q3 5 0 7 q-3 -2 0 -7 Z" fill="#4dabf7"/>' : '';
  const cheeks = mood >= 3 ? '<circle cx="10" cy="24" r="3" fill="#ff9fb5" opacity=".8"/><circle cx="34" cy="24" r="3" fill="#ff9fb5" opacity=".8"/>' : '';
  return `<svg class="life-face" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="${skin}" stroke="#e0a800" stroke-width="2"/>${cheeks}${brows}${eyes}${tear}${mouth}</svg>`;
}

export class Life {
  private readonly energyEl: HTMLDivElement;
  private readonly pipsEl: HTMLDivElement;
  private readonly moodEl: HTMLDivElement;
  /** Play-time clock (s) and, per event, when it last counted. */
  private clock = 0;
  private readonly last = new Map<LifeEvent, number>();
  private tiredSaid = false;

  constructor(private readonly save: SaveData) {
    const bar = document.querySelector('.hud') ?? document.body;
    this.energyEl = document.createElement('div');
    this.energyEl.className = 'life energy';
    this.energyEl.dataset.counter = 'energy';
    this.energyEl.innerHTML =
      '<svg class="life-bolt" viewBox="0 0 24 30" aria-hidden="true"><path d="M14 1 3 17h7l-2 12L21 12h-8z" fill="#ffc81e" stroke="#d99a00" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    this.pipsEl = document.createElement('div');
    this.pipsEl.className = 'life-pips';
    for (let i = 0; i < ENERGY_MAX; i++) {
      const p = document.createElement('div');
      p.className = 'life-pip';
      this.pipsEl.appendChild(p);
    }
    this.energyEl.appendChild(this.pipsEl);
    this.moodEl = document.createElement('div');
    this.moodEl.className = 'life mood';
    this.moodEl.dataset.counter = 'mood';
    bar.append(this.energyEl, this.moodEl);
    onFeel((e) => this.feel(e));
    this.draw();
  }

  get energy(): number {
    return this.save.energy;
  }
  get mood(): number {
    return this.save.mood;
  }

  /** Walking speed factor: out of energy she walks slowly (she never falls). */
  speedFactor(): number {
    return this.save.energy <= 0 ? 0.55 : 1;
  }
  /** Leg-swing factor: very sad or very tired, she drags her feet. */
  stepFactor(): number {
    return this.save.mood <= 0 || this.save.energy <= 0 ? 0.6 : 1;
  }
  /** Extra coins for a right answer while "muito feliz". */
  answerBonus(): number {
    return this.save.mood >= MOOD_MAX ? 1 : 0;
  }

  /** Per frame; `playing` = the game is running (not paused, not on a menu, not in a cutscene). */
  update(dt: number, playing: boolean): void {
    if (!playing) return;
    this.clock += dt;
    const t = this.save.lifeT;
    t[0] += dt;
    t[1] += dt;
    if (t[0] >= ENERGY_EVERY_S) {
      t[0] -= ENERGY_EVERY_S;
      this.change(-1, 0);
    }
    if (t[1] >= MOOD_EVERY_S) {
      t[1] -= MOOD_EVERY_S;
      this.change(0, -1);
    }
  }

  private feel(e: LifeEvent): void {
    const fx = EFFECTS[e];
    const last = this.last.get(e);
    if (last !== undefined && this.clock - last < fx.every) return;
    this.last.set(e, this.clock);
    const de = fx.energy === 'full' ? ENERGY_MAX : (fx.energy ?? 0);
    this.change(de, fx.mood ?? 0);
  }

  /** Apply a change, clamp, redraw and give a small sound cue when a level actually moved. */
  private change(de: number, dm: number): void {
    const s = this.save;
    const e0 = s.energy;
    const m0 = s.mood;
    s.energy = Math.min(ENERGY_MAX, Math.max(0, s.energy + de));
    s.mood = Math.min(MOOD_MAX, Math.max(0, s.mood + dm));
    if (s.energy > e0) {
      s.lifeT[0] = 0;
      this.tiredSaid = false;
      [392, 523, 659].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.06));
      this.bump(this.energyEl);
    } else if (s.energy < e0) {
      tone(330, 0, 0.25, 'sine', 0.06);
      tone(262, 0.2, 0.4, 'sine', 0.05);
      this.bump(this.energyEl);
      if (s.energy === 0 && !this.tiredSaid) {
        this.tiredSaid = true;
        if (!speechSynthesis.speaking) void speak(['Que cansaço! Preciso de comer ou de descansar.']);
      }
    }
    if (s.mood > m0) {
      s.lifeT[1] = 0;
      [659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.18, 'sine', 0.06));
      this.bump(this.moodEl);
    } else if (s.mood < m0) {
      tone(294, 0, 0.35, 'sine', 0.05);
      this.bump(this.moodEl);
    }
    if (s.energy !== e0 || s.mood !== m0) this.draw();
  }

  private bump(el: HTMLElement): void {
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 180);
  }

  /** Redraw from the save (also after "Novo jogo"). */
  draw(): void {
    const e = this.save.energy;
    this.pipsEl.dataset.level = String(e);
    [...this.pipsEl.children].forEach((p, i) => p.classList.toggle('on', i < e));
    this.energyEl.setAttribute('aria-label', `Energia ${e} de ${ENERGY_MAX}`);
    this.moodEl.innerHTML = faceSvg(this.save.mood);
    this.moodEl.setAttribute('aria-label', `Humor: ${MOOD_NAMES[this.save.mood]}`);
  }

  /** QA (`?debug`): set levels directly, or let play time pass. */
  debugSet(v: { energy?: number; mood?: number; pass?: number }): void {
    if (typeof v.energy === 'number') this.save.energy = Math.min(ENERGY_MAX, Math.max(0, Math.round(v.energy)));
    if (typeof v.mood === 'number') this.save.mood = Math.min(MOOD_MAX, Math.max(0, Math.round(v.mood)));
    this.draw();
    if (typeof v.pass === 'number') {
      // let `pass` seconds of play go by, in steps so several levels can drop
      for (let left = v.pass; left > 0; left -= 30) this.update(Math.min(30, left), true);
    }
  }
}
