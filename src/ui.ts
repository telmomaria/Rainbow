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
  .quiz-text { font: 700 28px/1.3 system-ui, sans-serif; color: #3b2a5a; margin: 0 0 18px; }
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
    opts.appendChild(b);
    return b;
  });
  box.append(text, opts);
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
