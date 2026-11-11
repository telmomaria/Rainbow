import { speak, sfx, stopSpeaking } from './audio';
import type { Question } from './questions';

const style = document.createElement('style');
style.textContent = `
  .hud { position: fixed; top: 16px; left: 16px; display: flex; gap: 12px; pointer-events: none; }
  .hud-coins {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 18px 8px 10px; border-radius: 999px; background: rgba(255,255,255,.85);
    font: 800 32px/1 system-ui, sans-serif; color: #7a4b00; box-shadow: 0 4px 12px rgba(0,0,0,.15);
    user-select: none; pointer-events: none; transition: transform .15s;
  }
  .hud-coins.bump { transform: scale(1.18); }
  .hud-coin { width: 38px; height: 38px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff3a8, #ffc81e 45%, #d99a00);
    box-shadow: inset 0 0 0 4px #e0a800; }
  .hud-jewel { width: 30px; height: 30px; margin: 4px; transform: rotate(45deg); border-radius: 6px;
    background: linear-gradient(135deg, #ffd1e8, #ff3b7f 45%, #b0005a); box-shadow: inset 0 0 0 3px rgba(255,255,255,.5); }
  .hud-question { width: 38px; height: 38px; border-radius: 50%; background: #7c6cff; color: #fff;
    display: grid; place-items: center; font: 900 28px/1 system-ui, sans-serif; }
  .quiz {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); width: min(92vw, 760px);
    background: rgba(255,255,255,.95); border-radius: 28px; padding: 22px 22px 26px; text-align: center;
    box-shadow: 0 10px 30px rgba(0,0,0,.25); font-family: system-ui, sans-serif; animation: pop .25s ease-out;
  }
  @keyframes pop { from { transform: translateX(-50%) scale(.8); opacity: 0; } }
  .quiz-text { font: 700 28px/1.3 system-ui, sans-serif; color: #3b2a5a; margin: 0 52px 18px; }
  .quiz-repeat {
    position: absolute; top: 14px; right: 14px; width: 52px; height: 52px; border: 0; border-radius: 50%;
    background: #ede9fe; cursor: pointer; display: grid; place-items: center; padding: 0;
  }
  .quiz-repeat:hover { background: #ddd6fe; }
  .quiz-repeat svg { width: 30px; height: 30px; }
  .quiz-opts { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
  .quiz-opt {
    flex: 1 1 0; min-width: 150px; min-height: 84px; border: 0; border-radius: 22px; cursor: pointer;
    font: 800 28px/1.15 system-ui, sans-serif; color: #fff; padding: 10px 14px;
    box-shadow: 0 6px 0 rgba(0,0,0,.18); transition: transform .1s, filter .2s;
  }
  .quiz-opt:hover { transform: translateY(-2px); }
  .quiz-opt:active { transform: translateY(3px); box-shadow: 0 3px 0 rgba(0,0,0,.18); }
  .quiz-opt:nth-child(1) { background: #ff6fb5; }
  .quiz-opt:nth-child(2) { background: #7c6cff; }
  .quiz-opt:nth-child(3) { background: #23b5d3; }
  .quiz-opt.right { background: #2fb344 !important; transform: scale(1.06); }
  .quiz-opt.wrong { background: #e03131 !important; }
  .quiz-opt.dim { filter: grayscale(.8) opacity(.5); }
  .quiz.done .quiz-opt { pointer-events: none; }
`;
document.head.appendChild(style);

type HudCounter = 'coins' | 'jewels' | 'correct';

/** Top-left counters: coins · jewels · right answers (question-mark icon). */
export class Hud {
  private readonly nums = {} as Record<HudCounter, HTMLSpanElement>;
  private readonly pills = {} as Record<HudCounter, HTMLDivElement>;

  constructor(values: Record<HudCounter, number>) {
    const bar = document.createElement('div');
    bar.className = 'hud';
    const icons: Record<HudCounter, () => HTMLElement> = {
      coins: () => el('div', 'hud-coin'),
      jewels: () => el('div', 'hud-jewel'),
      correct: () => {
        const q = el('div', 'hud-question');
        q.textContent = '?';
        return q;
      },
    };
    for (const key of ['coins', 'jewels', 'correct'] as const) {
      const pill = el('div', 'hud-coins') as HTMLDivElement;
      pill.dataset.counter = key;
      const num = el('span', '') as HTMLSpanElement;
      num.textContent = String(values[key]);
      pill.append(icons[key](), num);
      bar.appendChild(pill);
      this.nums[key] = num;
      this.pills[key] = pill;
    }
    document.body.appendChild(bar);
  }

  set(key: HudCounter, value: number): void {
    this.nums[key].textContent = String(value);
    const pill = this.pills[key];
    pill.classList.add('bump');
    setTimeout(() => pill.classList.remove('bump'), 150);
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/**
 * Show a spoken question with three big options.
 * Answer by click/tap, by keys 1/2/3, or by arrows ← ↑ → (left / middle / right).
 * Resolves true if the answer was right. One try per meeting; a wrong answer is not corrected.
 */
export function askQuestion(q: Question, reward: number): Promise<boolean> {
  const options = shuffle([...q.answers]);
  const correct = q.answers[0];

  const box = document.createElement('div');
  box.className = 'quiz';
  const text = document.createElement('p');
  text.className = 'quiz-text';
  text.textContent = q.text;
  const opts = document.createElement('div');
  opts.className = 'quiz-opts';
  const buttons = options.map((label) => {
    const b = document.createElement('button');
    b.className = 'quiz-opt';
    b.textContent = label;
    b.addEventListener('mouseenter', () => void speak([label])); // hovering an answer reads it out
    opts.appendChild(b);
    return b;
  });
  const again = document.createElement('button');
  again.className = 'quiz-repeat';
  again.setAttribute('aria-label', 'Repetir a pergunta');
  again.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="#7c3aed" stroke-width="2.6" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="#7c3aed" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  again.addEventListener('click', () => void speak([q.text, `${options[0]}? ${options[1]}? Ou ${options[2]}?`]));
  box.append(again, text, opts);
  document.body.appendChild(box);

  speak(['Olá!', q.text, `${options[0]}? ${options[1]}? Ou ${options[2]}?`]);

  return new Promise((resolve) => {
    let answered = false;
    const choose = async (i: number) => {
      if (answered) return;
      answered = true;
      window.removeEventListener('keydown', onKey, true);
      box.classList.add('done');
      const ok = options[i] === correct;
      buttons.forEach((b, j) => {
        // a wrong answer never reveals the right one: the question comes back later for another try
        if (j === i) b.classList.add(ok ? 'right' : 'wrong');
        else b.classList.add('dim');
      });
      if (ok) {
        sfx.right();
        await Promise.all([speak([`Muito bem! Ganhaste ${reward} moedas!`]), wait(1800)]);
      } else {
        sfx.wrong();
        await Promise.all([speak(['Oh! Não é essa. Mais tarde voltas a tentar!']), wait(2200)]);
      }
      stopSpeaking();
      box.remove();
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2 };
      if (e.key in map) {
        e.preventDefault();
        e.stopImmediatePropagation(); // don't let the arrows move the character
        void choose(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    buttons.forEach((b, i) => b.addEventListener('click', () => void choose(i)));
  });
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const travelStyle = document.createElement('style');
travelStyle.textContent = `
  .city-pill {
    position: fixed; top: 16px; right: 16px; padding: 10px 20px; border-radius: 999px;
    background: rgba(255,255,255,.85); font: 800 26px/1 system-ui, sans-serif; color: #3b2a5a;
    box-shadow: 0 4px 12px rgba(0,0,0,.15); pointer-events: none; user-select: none;
  }
  .arrival {
    position: fixed; top: 18%; left: 50%; transform: translateX(-50%); padding: 18px 36px; border-radius: 28px;
    background: rgba(255,255,255,.92); font: 900 44px/1.1 system-ui, sans-serif; color: #7c3aed; text-align: center;
    box-shadow: 0 10px 30px rgba(0,0,0,.2); pointer-events: none; animation: arrive 3.5s ease-in-out forwards;
  }
  @keyframes arrive { 0% { opacity: 0; transform: translateX(-50%) scale(.6); } 12%, 80% { opacity: 1; transform: translateX(-50%) scale(1); } 100% { opacity: 0; } }
  .travel {
    position: fixed; inset: 0; display: grid; place-items: center; z-index: 10;
    background: linear-gradient(160deg, #ff8fd0, #a78bfa 45%, #60c5fa); animation: fadein .4s;
    font-family: system-ui, sans-serif; color: #fff; text-align: center;
  }
  @keyframes fadein { from { opacity: 0; } }
  .travel h1 { font: 900 56px/1.1 system-ui, sans-serif; margin: 0 0 8px; text-shadow: 0 4px 0 rgba(0,0,0,.15); }
  .travel p { font: 700 34px/1.3 system-ui, sans-serif; margin: 0 0 28px; }
  .travel .plane { font-size: 90px; display: inline-block; animation: fly 2s ease-in-out infinite; }
  @keyframes fly { 50% { transform: translate(18px, -14px) rotate(-6deg); } }
  .travel button {
    border: 0; border-radius: 999px; padding: 18px 56px; background: #fff; color: #7c3aed; cursor: pointer;
    font: 900 40px/1 system-ui, sans-serif; box-shadow: 0 8px 0 rgba(0,0,0,.18);
  }
  .travel button:active { transform: translateY(4px); box-shadow: 0 4px 0 rgba(0,0,0,.18); }
`;
document.head.appendChild(travelStyle);

/** City name, top-right. */
export function showCityName(name: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'city-pill';
  el.textContent = name;
  document.body.appendChild(el);
  return el;
}

/** Big banner + spoken line when arriving in a city. */
export function showArrival(text: string): void {
  const el = document.createElement('div');
  el.className = 'arrival';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3600);
  void speak([text]);
}

/**
 * Full-screen "100 coins — let's travel!" moment. `next` null = the whole journey is done.
 * Resolves when the child presses the button (click/tap, Enter, Space or any arrow).
 */
export function showTravel(next: string | null): Promise<void> {
  const box = document.createElement('div');
  box.className = 'travel';
  const title = next ? 'Juntaste 100 moedas!' : 'Fizeste a viagem toda!';
  const line = next ? `Próxima paragem: ${next}` : 'Visitaste todas as cidades. És incrível!';
  box.innerHTML = `<div><div class="plane">✈️</div><h1></h1><p></p><button></button></div>`;
  box.querySelector('h1')!.textContent = title;
  box.querySelector('p')!.textContent = line;
  const btn = box.querySelector('button')!;
  btn.textContent = next ? 'Vamos!' : 'Continuar';
  document.body.appendChild(box);
  void speak(next ? ['Boa! Juntaste cem moedas!', `Vamos viajar para ${next}!`] : [title, line]);

  return new Promise((resolve) => {
    const go = () => {
      window.removeEventListener('keydown', onKey, true);
      stopSpeaking();
      box.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        go();
      }
    };
    // small delay so a key held while walking doesn't skip the screen instantly
    setTimeout(() => window.addEventListener('keydown', onKey, true), 1200);
    btn.addEventListener('click', go);
  });
}

const extraStyle = document.createElement('style');
extraStyle.textContent = `
  .compass {
    position: fixed; top: 90px; left: 16px; width: 76px; height: 76px; border-radius: 50%;
    background: rgba(255,255,255,.9); box-shadow: 0 4px 12px rgba(0,0,0,.15); display: none;
    place-items: center; pointer-events: none; font-size: 30px;
  }
  .compass .arrow {
    position: absolute; inset: 6px; display: grid; justify-items: center; align-items: start;
    font: 900 26px/1 system-ui, sans-serif; color: #7c3aed;
  }
  .fade { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; transition: opacity .8s; z-index: 5; }
  .fade.on { opacity: 1; }
`;
document.head.appendChild(extraStyle);

const compass = document.createElement('div');
compass.className = 'compass';
compass.innerHTML = '<span>✈️</span><div class="arrow">▲</div>';
document.body.appendChild(compass);
const compassArrow = compass.querySelector('.arrow') as HTMLElement;

/**
 * Airport direction, relative to the camera (radians, 0 = straight ahead into the screen), or null to hide.
 * This is navigation help, not an interaction hint.
 */
export function setCompass(angle: number | null): void {
  if (angle === null) {
    compass.style.display = 'none';
    return;
  }
  compass.style.display = 'grid';
  // world angle measured from +Z; the camera looks towards -Z when camYaw = 0, so flip by PI
  compassArrow.style.transform = `rotate(${Math.PI - angle}rad)`;
}

const fadeEl = document.createElement('div');
fadeEl.className = 'fade';
document.body.appendChild(fadeEl);
export function setFade(opaque: boolean): void {
  fadeEl.classList.toggle('on', opaque);
}

/** Short banner without speech (speech is handled by the caller). */
export function showBanner(text: string, ms = 3500): void {
  const el = document.createElement('div');
  el.className = 'arrival';
  el.style.animationDuration = `${ms}ms`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms + 100);
}

const homeStyle = document.createElement('style');
homeStyle.textContent = `
  .home-btn {
    position: fixed; top: 76px; right: 16px; width: 64px; height: 64px; border: 0; border-radius: 50%;
    background: rgba(255,255,255,.9); box-shadow: 0 4px 12px rgba(0,0,0,.15); cursor: pointer;
    display: grid; place-items: center; padding: 0; touch-action: manipulation;
  }
  .home-btn:active { transform: scale(.92); }
  .home-btn svg { width: 38px; height: 38px; }
`;
document.head.appendChild(homeStyle);

/** "Casa" button (top-right, under the city name): takes the character back to the starting point. */
export function createHomeButton(onHome: () => void): void {
  const btn = document.createElement('button');
  btn.className = 'home-btn';
  btn.setAttribute('aria-label', 'Casa');
  btn.title = 'Casa';
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11.2 12 3.5l9 7.7" fill="none" stroke="#7c3aed" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.5 10v10h13V10" fill="#ff8fc8" stroke="#7c3aed" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="10" y="14" width="4" height="6" rx="1" fill="#7c3aed"/>
  </svg>`;
  btn.addEventListener('click', () => {
    btn.blur(); // keep arrow keys going to the game
    onHome();
  });
  document.body.appendChild(btn);
}


const pauseStyle = document.createElement('style');
pauseStyle.textContent = `
  .idle {
    position: fixed; inset: 0; z-index: 15; display: grid; place-items: center; cursor: pointer;
    background: rgba(59, 42, 90, .45); backdrop-filter: blur(3px); animation: fadein .4s;
  }
  .idle-play {
    width: 150px; height: 150px; border-radius: 50%; background: #fff; display: grid; place-items: center;
    box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: breathe 1.6s ease-in-out infinite;
  }
  .idle-play svg { width: 70px; height: 70px; margin-left: 10px; }
  @keyframes breathe { 50% { transform: scale(1.08); } }
  .gear-btn {
    position: fixed; top: 224px; right: 16px; width: 64px; height: 64px; border: 0; border-radius: 50%; padding: 0;
    background: rgba(255,255,255,.9); box-shadow: 0 4px 12px rgba(0,0,0,.15); cursor: pointer; display: grid; place-items: center;
  }
  .gear-btn svg { width: 36px; height: 36px; }
  .settings {
    position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(59,42,90,.35);
    font-family: system-ui, sans-serif; animation: fadein .25s;
  }
  .settings-box { background: #fff; border-radius: 28px; padding: 24px 28px; box-shadow: 0 10px 30px rgba(0,0,0,.25); text-align: center; }
  .settings-box h2 { margin: 0 0 6px; font: 900 30px/1.1 system-ui, sans-serif; color: #7c3aed; }
  .settings-box p { margin: 0 0 16px; font: 700 18px/1.2 system-ui, sans-serif; color: #7c6c99; }
  .settings-opts { display: flex; gap: 12px; }
  .settings-opts button {
    border: 0; border-radius: 20px; padding: 14px 18px; min-width: 130px; cursor: pointer; background: #f3f0ff;
    font: 900 22px/1.1 system-ui, sans-serif; color: #3b2a5a; box-shadow: 0 5px 0 rgba(124,58,237,.18);
  }
  .settings-opts button span { display: block; font-size: 34px; margin-bottom: 6px; }
  .settings-opts button.on { background: #7c3aed; color: #fff; }
  .settings-close { margin-top: 18px; border: 0; border-radius: 999px; padding: 12px 40px; background: #22c55e; color: #fff;
    font: 900 22px/1 system-ui, sans-serif; cursor: pointer; }
`;
document.head.appendChild(pauseStyle);

/** Idle pause: dimmed screen with a big play button (no text). Resolves on any key, click or tap. */
export function showIdlePause(): Promise<void> {
  const el = document.createElement('div');
  el.className = 'idle';
  el.innerHTML = '<div class="idle-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="#7c3aed"/></svg></div>';
  document.body.appendChild(el);
  return new Promise((resolve) => {
    const go = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', go, true);
      el.remove();
      resolve();
    };
    window.addEventListener('keydown', go, true);
    el.addEventListener('pointerdown', go);
  });
}

export type Difficulty = 'zero' | 'facil' | 'medio' | 'dificil';
export const DIFFICULTY_FACTOR: Record<Difficulty, number> = { zero: 0, facil: 0.5, medio: 1, dificil: 2 };

/** Settings window (monster difficulty). Resolves when closed. */
export function openSettings(get: () => Difficulty, set: (d: Difficulty) => void): Promise<void> {
  const ov = document.createElement('div');
  ov.className = 'settings';
  const opts: [Difficulty, string, string][] = [
    ['zero', '🌈', 'Zero'],
    ['facil', '🐢', 'Fácil'],
    ['medio', '🙂', 'Médio'],
    ['dificil', '🔥', 'Difícil'],
  ];
  ov.innerHTML = '<div class="settings-box"><h2>Definições</h2><p>Monstros</p><div class="settings-opts"></div><button class="settings-close">OK</button></div>';
  const row = ov.querySelector('.settings-opts')!;
  const buttons = opts.map(([d, icon, label]) => {
    const b = document.createElement('button');
    b.innerHTML = `<span>${icon}</span>${label}`;
    if (get() === d) b.classList.add('on');
    b.addEventListener('click', () => {
      set(d);
      buttons.forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      void speak([label]);
    });
    row.appendChild(b);
    return b;
  });
  document.body.appendChild(ov);
  return new Promise((resolve) => {
    const close = () => {
      ov.remove();
      resolve();
    };
    ov.querySelector('.settings-close')!.addEventListener('click', close);
    ov.addEventListener('pointerdown', (e) => {
      if (e.target === ov) close();
    });
  });
}

/** Gear button (under the portrait) opening the settings: monster difficulty. */
export function createSettingsButton(get: () => Difficulty, set: (d: Difficulty) => void, canOpen: () => boolean, onOpen: (open: boolean) => void): void {
  const btn = document.createElement('button');
  btn.className = 'gear-btn';
  btn.setAttribute('aria-label', 'Definições');
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#7c3aed" d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => {
    btn.blur();
    if (!canOpen()) return;
    onOpen(true);
    const ov = document.createElement('div');
    ov.className = 'settings';
    const opts: [Difficulty, string, string][] = [
      ['zero', '🌈', 'Zero'],
    ['facil', '🐢', 'Fácil'],
      ['medio', '🙂', 'Médio'],
      ['dificil', '🔥', 'Difícil'],
    ];
    ov.innerHTML = '<div class="settings-box"><h2>Definições</h2><p>Monstros</p><div class="settings-opts"></div><button class="settings-close">OK</button></div>';
    const row = ov.querySelector('.settings-opts')!;
    const buttons = opts.map(([d, icon, label]) => {
      const b = document.createElement('button');
      b.innerHTML = `<span>${icon}</span>${label}`;
      if (get() === d) b.classList.add('on');
      b.addEventListener('click', () => {
        set(d);
        buttons.forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        void speak([label]);
      });
      row.appendChild(b);
      return b;
    });
    const close = () => {
      ov.remove();
      onOpen(false);
    };
    ov.querySelector('.settings-close')!.addEventListener('click', close);
    ov.addEventListener('pointerdown', (e) => {
      if (e.target === ov) close();
    });
    document.body.appendChild(ov);
  });
}

const bagStyle = document.createElement('style');
bagStyle.textContent = `
  .bag { position: fixed; left: 16px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; gap: 10px; }
  .bag-item {
    position: relative; width: 70px; height: 70px; border: 0; border-radius: 22px; padding: 0; cursor: pointer;
    background: rgba(255,255,255,.92); box-shadow: 0 4px 12px rgba(0,0,0,.15); font-size: 38px; line-height: 70px;
    animation: pop .25s ease-out; touch-action: manipulation;
  }
  .bag-item:hover { transform: scale(1.06); }
  .bag-item:active { transform: scale(.94); }
  .bag-item.in-hand { box-shadow: 0 0 0 4px #22c55e, 0 4px 12px rgba(0,0,0,.15); }
  .bag-count {
    position: absolute; right: -6px; bottom: -6px; min-width: 28px; height: 28px; border-radius: 14px; padding: 0 6px;
    background: #7c3aed; color: #fff; font: 900 17px/28px system-ui, sans-serif; text-align: center;
  }
`;
document.head.appendChild(bagStyle);

/** Emoji per bag item kind (bought in the shops). */
export const BAG_ICONS: Record<string, string> = { pao: '🥖', gelado: '🍦', chocolate: '🍫', chupa: '🍭' };
const BAG_NAMES: Record<string, string> = { pao: 'Pão', gelado: 'Gelado', chocolate: 'Chocolate', chupa: 'Chupa-chupa' };

/**
 * Side bar (left) with what she has bought, and how many. Tap an item to use it
 * (sweets: she eats it; bread: she holds it, ready for the pigeons). Returns a refresh function.
 */
export function createBag(onUse: (kind: string) => void): (bag: Record<string, number>, inHand: string | null) => void {
  const bar = document.createElement('div');
  bar.className = 'bag';
  document.body.appendChild(bar);
  const buttons = new Map<string, HTMLButtonElement>();
  return (bag, inHand) => {
    for (const kind of Object.keys(BAG_ICONS)) {
      const n = bag[kind] ?? 0;
      let b = buttons.get(kind);
      if (n <= 0) {
        b?.remove();
        buttons.delete(kind);
        continue;
      }
      if (!b) {
        b = document.createElement('button');
        b.className = 'bag-item';
        b.setAttribute('aria-label', BAG_NAMES[kind]);
        b.innerHTML = `${BAG_ICONS[kind]}<span class="bag-count"></span>`;
        b.addEventListener('mouseenter', () => void speak([BAG_NAMES[kind]]));
        b.addEventListener('click', () => {
          b!.blur();
          onUse(kind);
        });
        // keep the order stable: pão, gelado, chocolate, chupa
        const order = Object.keys(BAG_ICONS);
        const next = [...buttons.entries()].find(([k]) => order.indexOf(k) > order.indexOf(kind));
        bar.insertBefore(b, next ? next[1] : null);
        buttons.set(kind, b);
      }
      b.querySelector('.bag-count')!.textContent = String(n);
      b.classList.toggle('in-hand', inHand === kind);
    }
  };
}
