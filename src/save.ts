/** Progress persisted in localStorage. No personal data, no accounts. */
export interface SaveData {
  coins: number;
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
  return { coins: 0, character: null, level: 0, finished: false, jewels: 0, correct: 0, solved: [], retryAt: {}, pos: null };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: game keeps working, just without persistence
  }
}
