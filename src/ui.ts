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
 * Resolves true if the answer was right. The question can only be answered once.
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
        if (options[j] === correct) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      if (ok) {
        sfx.right();
        await Promise.all([speak([`Muito bem! Ganhaste ${reward} moedas!`]), wait(1800)]);
      } else {
        sfx.wrong();
        await Promise.all([speak([`Oh! Não faz mal. A resposta certa era: ${correct}.`]), wait(2500)]);
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
