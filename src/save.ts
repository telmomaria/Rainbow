/** Progress persisted in localStorage. No personal data, no accounts. */
export interface SaveData {
  coins: number;
  /** Question ids already asked (right or wrong) — a question is never repeated. */
  asked: string[];
}

const KEY = 'rainbow.save.v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      return { coins: d.coins ?? 0, asked: Array.isArray(d.asked) ? d.asked : [] };
    }
  } catch {
    // corrupted or blocked storage: start fresh
  }
  return { coins: 0, asked: [] };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: game keeps working, just without persistence
  }
}
