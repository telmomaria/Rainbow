/** Speech (pt-PT) and tiny synthesized sound effects — no audio files needed. */

let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): void {
  const voices = speechSynthesis.getVoices();
  voice =
    voices.find((v) => v.lang.toLowerCase() === 'pt-pt') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
    null;
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

/** Speak a sequence of sentences; resolves when finished (or immediately if speech is unavailable). */
export function speak(lines: string[]): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
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

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15): void {
  ctx ??= new AudioContext();
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
  wrong: () => {
    tone(392, 0, 0.25, 'sine');
    tone(330, 0.2, 0.35, 'sine');
  },
};
