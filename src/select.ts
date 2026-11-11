import * as THREE from 'three';
import { CHARACTERS, characterById } from './characters';
import { speak, stopSpeaking } from './audio';
import { openSettings } from './ui';

const style = document.createElement('style');
style.textContent = `
  .select {
    position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; overflow: auto;
    background: linear-gradient(160deg, #ffe3f3, #e6dcff 45%, #d8f1ff); font-family: system-ui, sans-serif;
    animation: fadein .3s;
  }
  .select h1 { margin: 12px 0 10px; font: 900 40px/1.1 system-ui, sans-serif; color: #7c3aed; text-align: center; }
  .select-grid { display: grid; grid-template-columns: repeat(5, minmax(110px, min(150px, 17vh))); gap: 12px; padding: 0 16px 14px; justify-content: center; }
  @media (max-width: 760px) { .select-grid { grid-template-columns: repeat(3, minmax(100px, 150px)); } }
  .select-card {
    border: 0; border-radius: 22px; background: #fff; padding: 8px 8px 12px; cursor: pointer;
    box-shadow: 0 6px 0 rgba(124,58,237,.18), 0 8px 18px rgba(0,0,0,.08); transition: transform .12s;
    font-family: inherit; outline: none;
  }
  .select-card:hover, .select-card:focus-visible, .select-card.focus { transform: translateY(-4px) scale(1.04); box-shadow: 0 0 0 5px #a78bfa, 0 10px 20px rgba(0,0,0,.12); }
  .select-card.chosen { box-shadow: 0 0 0 6px #22c55e, 0 10px 20px rgba(0,0,0,.12); }
  .select-card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; object-position: 50% 30%; display: block; border-radius: 16px; background: linear-gradient(#bfe6ff, #e8f7ff); }
  .select-card b { display: block; margin-top: 8px; font: 900 22px/1 system-ui, sans-serif; color: #3b2a5a; }
  .select-card span { display: block; margin-top: 4px; font: 700 15px/1 system-ui, sans-serif; color: #7c6c99; }
  .select-settings { display: flex; gap: 10px; justify-content: center; align-items: center; padding: 0 16px 16px; }
  .select-settings b { font: 900 22px/1 system-ui, sans-serif; color: #3b2a5a; margin-right: 6px; }
  .select-diff {
    border: 0; border-radius: 16px; padding: 10px 16px; cursor: pointer; background: #fff; color: #3b2a5a;
    font: 800 20px/1 system-ui, sans-serif; box-shadow: 0 4px 0 rgba(124,58,237,.18);
  }
  .select-diff.on { background: #7c3aed; color: #fff; }
  .select-actions { display: flex; gap: 16px; justify-content: center; padding: 0 16px 24px; margin-top: 28px; }
  .select-go {
    border: 0; border-radius: 999px; padding: 16px 36px; cursor: pointer; color: #fff;
    font: 900 28px/1 system-ui, sans-serif; box-shadow: 0 6px 0 rgba(0,0,0,.15);
  }
  .select-go span { margin-right: 6px; }
  .select-go.continue { background: #22c55e; }
  .select-go.new { background: #7c3aed; }
  .select-go.cfg { background: #fff; color: #7c3aed; }
  .select-go:active { transform: translateY(3px); }
  .avatar-btn {
    position: fixed; top: 150px; right: 16px; width: 64px; height: 64px; border: 0; border-radius: 50%; padding: 0;
    background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.15); cursor: pointer; overflow: hidden;
  }
  .avatar-btn img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 12%; transform: scale(1.5) translateY(14%); }
`;
document.head.appendChild(style);

/** Render a portrait of every character once (offscreen), as data URLs. */
let thumbs: Map<string, string> | null = null;
function renderThumbs(): Map<string, string> {
  if (thumbs) return thumbs;
  const W = 240;
  const H = 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a0d0, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, -5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  thumbs = new Map();
  for (const def of CHARACTERS) {
    const { model } = def.build();
    // 3/4 front view (faces are on -Z)
    model.rotation.y = 0.45;
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const dist = (Math.max(size.y, size.x * 1.1) / 2 / Math.tan((cam.fov * Math.PI) / 360)) * 1.18;
    cam.position.set(centre.x, centre.y + size.y * 0.08, centre.z - dist);
    cam.lookAt(centre);
    renderer.render(scene, cam);
    thumbs.set(def.id, renderer.domElement.toDataURL('image/png'));
    scene.remove(model);
  }
  renderer.dispose();
  return thumbs;
}

export type StartMode = 'pick' | 'continue' | 'new';

/**
 * Full-screen character picker. Move with the arrows or click/tap a card.
 * - In-game (no `start`): choosing a card closes it right away → mode 'pick'.
 * - Start screen (`start` given): cards only select; then "Continuar" (keep everything, if a saved game exists)
 *   or "Novo jogo" (start from zero). Enter = Continuar when possible, else Novo jogo.
 */
export function chooseCharacter(
  current?: string,
  start?: { canContinue: boolean; difficulty: 'facil' | 'medio' | 'dificil'; onDifficulty: (d: 'facil' | 'medio' | 'dificil') => void },
): Promise<{ id: string; mode: StartMode }> {
  const pics = renderThumbs();
  const box = document.createElement('div');
  box.className = 'select';
  const wrap = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Escolhe a tua personagem!';
  const grid = document.createElement('div');
  grid.className = 'select-grid';
  const cards = CHARACTERS.map((def) => {
    const b = document.createElement('button');
    b.className = 'select-card';
    b.innerHTML = `<img alt=""><b></b><span></span>`;
    b.querySelector('img')!.src = pics.get(def.id)!;
    b.querySelector('b')!.textContent = def.name;
    b.querySelector('span')!.textContent = def.label;
    b.setAttribute('aria-label', `${def.name}, ${def.label}`);
    if (def.id === current) b.classList.add('chosen');
    grid.appendChild(b);
    return b;
  });
  wrap.append(title, grid);
  let continueBtn: HTMLButtonElement | null = null;
  let newBtn: HTMLButtonElement | null = null;
  if (start) {
    const row = document.createElement('div');
    row.className = 'select-actions';
    if (start.canContinue) {
      continueBtn = document.createElement('button');
      continueBtn.className = 'select-go continue';
      continueBtn.innerHTML = '<span>▶</span> Continuar';
      row.appendChild(continueBtn);
    }
    newBtn = document.createElement('button');
    newBtn.className = 'select-go new';
    newBtn.innerHTML = start.canContinue ? '<span>★</span> Novo jogo' : '<span>▶</span> Jogar';
    row.appendChild(newBtn);
    // settings (monster difficulty...) behind their own button on the main page
    const setBtn = document.createElement('button');
    setBtn.className = 'select-go cfg';
    setBtn.innerHTML = '<span>⚙</span> Definições';
    setBtn.addEventListener('click', () => void openSettings(() => start.difficulty, (d) => {
      start.difficulty = d;
      start.onDifficulty(d);
    }));
    row.appendChild(setBtn);
    wrap.appendChild(row);
  }
  box.appendChild(wrap);
  document.body.appendChild(box);
  void speak(['Escolhe a tua personagem!']);

  let focus = Math.max(0, CHARACTERS.findIndex((d) => d.id === current));
  let selected = focus;
  const setFocus = (i: number) => {
    cards[focus].classList.remove('focus');
    focus = (i + cards.length) % cards.length;
    cards[focus].classList.add('focus');
    void speak([`${CHARACTERS[focus].name}. ${CHARACTERS[focus].label}.`]);
    if (start) select(focus, false);
  };
  const select = (i: number, say: boolean) => {
    selected = i;
    cards.forEach((c) => c.classList.remove('chosen'));
    cards[i].classList.add('chosen');
    if (say) void speak([`${CHARACTERS[i].name}!`]);
  };
  cards[focus].classList.add('focus');
  if (start) select(focus, false);

  return new Promise((resolve) => {
    let done = false;
    const finish = (mode: StartMode) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      const def = CHARACTERS[selected];
      cards[selected].classList.add('chosen');
      stopSpeaking();
      void speak([`Vamos lá, ${def.name}!`]);
      setTimeout(() => {
        box.remove();
        resolve({ id: def.id, mode });
      }, 700);
    };
    const cols = () => (window.innerWidth <= 760 ? 3 : 5);
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.settings')) return;
      const k = e.key;
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols(), ArrowDown: cols() };
      if (k in moves) setFocus(focus + moves[k]);
      else if (k === 'Enter' || k === ' ') {
        if (!start) {
          selected = focus;
          finish('pick');
        } else finish(start.canContinue ? 'continue' : 'new');
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation(); // the game must not move behind the picker
    };
    window.addEventListener('keydown', onKey, true);
    cards.forEach((c, i) =>
      c.addEventListener('click', () => {
        if (!start) {
          selected = i;
          finish('pick');
        } else {
          cards[focus].classList.remove('focus');
          focus = i;
          c.classList.add('focus');
          select(i, true);
        }
      }),
    );
    continueBtn?.addEventListener('click', () => finish('continue'));
    newBtn?.addEventListener('click', () => finish('new'));
  });
}

/** Round portrait button (under the Casa button) that reopens the picker. */
export function createAvatarButton(id: string, onClick: () => void): (id: string) => void {
  const btn = document.createElement('button');
  btn.className = 'avatar-btn';
  btn.setAttribute('aria-label', 'Mudar de personagem');
  const img = document.createElement('img');
  img.alt = '';
  btn.appendChild(img);
  document.body.appendChild(btn);
  const set = (newId: string) => {
    img.src = renderThumbs().get(characterById(newId).id) ?? '';
  };
  set(id);
  btn.addEventListener('click', () => {
    btn.blur();
    onClick();
  });
  return set;
}
