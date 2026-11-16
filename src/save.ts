/** Progress persisted in localStorage. No personal data, no accounts. */
export interface SaveData {
  coins: number;
  /** Accessories she is wearing (slot → wearable kind from items.ts). */
  wear: Record<string, string>;
  /** Items bought and not used yet (kind → count). */
  bag: Record<string, number>;
  /** Epoch ms until which she must stay in hospital (0 = not in hospital). */
  hospitalUntil: number;
  /** Monster difficulty from the settings. */
  difficulty: 'zero' | 'facil' | 'medio' | 'dificil';
  /** How loud the rain sounds, from the settings. */
  rainSound: 'off' | 'medio' | 'normal';
  /** Cities already visited (names), in order. */
  visited: string[];
  /** Chosen character id (characters.ts); null until the first pick. */
  character: string | null;
  /** Index into CITIES (0 = Portugal). */
  level: number;
  /** The whole journey (last city) is done. */
  finished: boolean;
  /**
   * Street jewels she is carrying now (each was also worth coins when picked up). Since 2026-11-15 they are a second
   * currency: they can be SPENT (bank, jeweller, treasure chest, shield — src/jewels.ts), so this number goes down.
   */
  jewels: number;
  /**
   * Diamonds picked up at the cities' landmarks (one per landmark, never respawns). They can NOT be spent: they are
   * kept for the end of the game on the Moon (rule FIM3). The jewel counter on screen shows jewels + diamonds.
   * NOTE for the Moon ending: what she has to deliver = `diamonds` (+ whatever street `jewels` she still carries).
   */
  diamonds: number;
  /** Diamonds and jewels already placed on the Moon's stone circle (moon.ts). More than 0 = the game was finished. */
  delivered: number;
  /** Energy 0..5 and mood 0..4 (muito triste … muito feliz) — src/life.ts. */
  energy: number;
  mood: number;
  /** Seconds of play since the energy / the mood last dropped one level. */
  lifeT: [number, number];
  /**
   * Small persistent facts for gameplay modules, so they don't each need a field here (key → number),
   * e.g. `chest:Porto` = 1 (treasure chest opened), `gem:Porto:clerigos` = 1 (landmark diamond taken).
   */
  flags: Record<string, number>;
  /** Small persistent texts for gameplay modules (key → string), e.g. a wall painting or the hairstyle. */
  texts: Record<string, string>;
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
        wear: d.wear && typeof d.wear === 'object' ? d.wear : {},
        bag: d.bag && typeof d.bag === 'object' ? d.bag : {},
        hospitalUntil: d.hospitalUntil ?? 0,
        difficulty: d.difficulty ?? 'medio',
        rainSound: d.rainSound ?? 'normal',
        visited: Array.isArray(d.visited) ? d.visited : [],
        character: d.character ?? null,
        level: d.level ?? 0,
        finished: d.finished ?? false,
        jewels: d.jewels ?? 0,
        delivered: d.delivered ?? 0,
        correct: d.correct ?? 0,
        solved: Array.isArray(d.solved) ? d.solved : Array.isArray(d.asked) ? d.asked : [],
        retryAt: d.retryAt && typeof d.retryAt === 'object' ? d.retryAt : {},
        pos: d.pos ?? null,
        ...lifeDefaults(d),
      };
    }
  } catch {
    // corrupted or blocked storage: start fresh
  }
  return { coins: 0, wear: {}, bag: {}, hospitalUntil: 0, difficulty: 'medio', rainSound: 'normal', visited: [], character: null, level: 0, finished: false, jewels: 0, delivered: 0, correct: 0, solved: [], retryAt: {}, pos: null, ...lifeDefaults({}) };
}

/** Fields added on 2026-11-15 (energy, mood, diamonds, module flags): older saves load with the defaults. */
export function lifeDefaults(d: Partial<SaveData>): Pick<SaveData, 'diamonds' | 'energy' | 'mood' | 'lifeT' | 'flags' | 'texts'> {
  const num = (v: unknown, def: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : def);
  return {
    diamonds: num(d.diamonds, 0, 9999),
    energy: num(d.energy, 5, 5),
    mood: num(d.mood, 3, 4),
    lifeT: Array.isArray(d.lifeT) && d.lifeT.length === 2 ? [+d.lifeT[0] || 0, +d.lifeT[1] || 0] : [0, 0],
    flags: d.flags && typeof d.flags === 'object' ? d.flags : {},
    texts: d.texts && typeof d.texts === 'object' ? d.texts : {},
  };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: game keeps working, just without persistence
  }
}
