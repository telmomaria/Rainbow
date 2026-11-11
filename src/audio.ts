/** Speech (pt-PT) and tiny synthesized sound effects — no audio files needed. */

/** Narrator (questions, travel): a friendly female pt-PT voice. */
let voice: SpeechSynthesisVoice | null = null;
/** Creatures: a male pt-PT voice when the system has one, else the narrator voice pitched way down. */
let monsterVoice: SpeechSynthesisVoice | null = null;
let monsterIsMale = false;

// Browsers don't expose a voice's gender, so go by known voice names.
// pt-PT: Edge ships "Microsoft Duarte Online (Natural)" (male) and Raquel/Fernanda (female);
// Windows itself only installs "Microsoft Helia" (female).
const MALE_PT_PT = /duarte|cristiano|joaquim|tiago/i;
const MALE_PT = /duarte|cristiano|antonio|antónio|daniel|fabio|fábio|julio|júlio|donato|humberto|nicolau|valerio|valério/i;
const FEMALE = /helia|raquel|fernanda|francisca|luciana|maria|joana|female|feminin/i;

function pickVoice(): void {
  const voices = speechSynthesis.getVoices();
  const ptPT = voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === 'pt-pt');
  const pt = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
  voice =
    ptPT.find((v) => FEMALE.test(v.name)) ??
    ptPT.find((v) => !MALE_PT.test(v.name)) ??
    ptPT[0] ??
    pt.find((v) => !MALE_PT.test(v.name)) ??
    pt[0] ??
    null;
  const male = ptPT.find((v) => MALE_PT_PT.test(v.name)) ?? ptPT.find((v) => MALE_PT.test(v.name)) ?? null;
  monsterIsMale = male !== null;
  monsterVoice = male ?? voice;
}

/** Which voices were chosen (for the ?debug bridge). */
export function voiceInfo(): { narrator: string | null; monster: string | null; monsterIsMale: boolean } {
  return { narrator: voice?.name ?? null, monster: monsterVoice?.name ?? null, monsterIsMale };
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

/** A creature's taunt: low funny voice; skipped if anything is already being said. */
export function taunt(text: string): void {
  if (!('speechSynthesis' in window) || speechSynthesis.speaking || speechSynthesis.pending) return;
  spokenLog.push(text);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-PT';
  if (monsterVoice) u.voice = monsterVoice;
  // a real male voice only needs a little growl; a female fallback needs the lowest pitch to sound like a big creature
  u.rate = monsterIsMale ? 1.05 : 0.9;
  u.pitch = monsterIsMale ? 0.6 : 0;
  speechSynthesis.speak(u);
}

/** Every line handed to speech, in order (read by the ?debug QA bridge). */
export const spokenLog: string[] = [];

/** Speak a sequence of sentences; resolves when finished (or immediately if speech is unavailable). */
export function speak(lines: string[]): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  spokenLog.push(...lines);
  return new Promise((resolve) => {
    // Safety net: some browsers never fire onend (missing voice, Chrome quirks) — never block the game on it.
    const chars = lines.reduce((n, l) => n + l.length, 0);
    setTimeout(resolve, 2500 + chars * 110);
    lines.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-PT';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1.1;
      if (i === lines.length - 1) {
        u.onend = () => resolve();
        u.onerror = () => resolve();
      }
      speechSynthesis.speak(u);
    });
  });
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

let ctx: AudioContext | null = null;

/** Browsers only allow audio after a user gesture: create/resume the context on the first one. */
function unlockAudio(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, unlockAudio, { capture: true });

/** Play one synthesized note (silent until the first user gesture). start/dur in seconds. */
export function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15): void {
  if (!ctx || ctx.state !== 'running') return; // not unlocked yet: stay silent rather than warn
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  coin: () => {
    tone(988, 0, 0.08, 'square', 0.08);
    tone(1319, 0.07, 0.15, 'square', 0.08);
  },
  jewel: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.2, 'triangle')),
  right: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.25, 'triangle')),
  bonk: () => {
    tone(180, 0, 0.15, 'square', 0.12);
    tone(120, 0.08, 0.25, 'sawtooth', 0.08);
  },
  travel: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle')),
  wrong: () => {
    tone(392, 0, 0.25, 'sine');
    tone(330, 0.2, 0.35, 'sine');
  },
};

/** The shared AudioContext once the first user gesture unlocked it (null before) — for ambient sounds. */
export function audioContext(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}
