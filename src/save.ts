/** Progress persisted in localStorage. No personal data, no accounts. */
export interface SaveData {
  coins: number;
  /** Items bought and not used yet (kind → count). */
  bag: Record<string, number>;
  /** Epoch ms until which she must stay in hospital (0 = not in hospital). */
  hospitalUntil: number;
  /** Monster difficulty from the settings. */
  difficulty: 'zero' | 'facil' | 'medio' | 'dificil';
  /** Cities already visited (names), in order. */
  visited: string[];
  /** Chosen character id (characters.ts); null until the first pick. */
  character: string | null;
  /** Index into CITIES (0 = Portugal). */
  level: number;
  /** The whole journey (last city) is done. */
  finished: boolean;
  /** Jewels picked up (each is also worth coins). */
  jewels: number;
  /** Questions answered correctly. */
  correct: number;
  /** Question ids answered correctly — retired for good. */
  solved: string[];
  /**
   * Question id -> timestamp (ms) before which it may not be asked again.
   * Set when a question is shown (so reloading mid-question doesn't give an instant retry)
   * and kept when the answer is wrong, so the question comes back later.
   */
  retryAt: Record<string, number>;
  /** Where the character was, so a page reload continues from the same spot. */
  pos: { x: number; z: number; h: number } | null;
}

const KEY = 'rainbow.save.v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData> & { asked?: string[] };
      return {
        coins: d.coins ?? 0,
        bag: d.bag && typeof d.bag === 'object' ? d.bag : {},
        hospitalUntil: d.hospitalUntil ?? 0,
        difficulty: d.difficulty ?? 'medio',
        visited: Array.isArray(d.visited) ? d.visited : [],
        character: d.character ?? null,
        level: d.level ?? 0,
        finished: d.finished ?? false,
        jewels: d.jewels ?? 0,
        correct: d.correct ?? 0,
        solved: Array.isArray(d.solved) ? d.solved : Array.isArray(d.asked) ? d.asked : [],
        retryAt: d.retryAt && typeof d.retryAt === 'object' ? d.retryAt : {},
        pos: d.pos ?? null,
      };
    }
  } catch {
    // corrupted or blocked storage: start fresh
  }
  return { coins: 0, bag: {}, hospitalUntil: 0, difficulty: 'medio', visited: [], character: null, level: 0, finished: false, jewels: 0, correct: 0, solved: [], retryAt: {}, pos: null };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: game keeps working, just without persistence
  }
}
