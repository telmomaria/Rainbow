/**
 * Tiny event bus between gameplay modules and the energy/mood system (life.ts), so a module only has to say what
 * happened to her ("she drank", "she played") and never needs to know about indicators or the save.
 *
 *   import { feel } from './bus';
 *   feel('drink');
 */
export type LifeEvent =
  | 'eat' // ate something from the bag
  | 'drink' // water (fountain, glass, bottle)
  | 'rest' // sat down for a moment (bench, sofa, chair)
  | 'sleep' // lay down in the bed at home
  | 'play' // swing, slide, ball, fair ride, games…
  | 'kind' // gave something / helped someone
  | 'groom' // hairdresser, manicure…
  | 'shop' // bought something
  | 'meal' // lunch / dinner / breakfast
  | 'massage'
  | 'doctor'
  | 'spa'
  | 'hospital' // left the hospital
  | 'rescue'; // saved the kitten

type Handler = (e: LifeEvent) => void;
const handlers = new Set<Handler>();

/** Tell the game something happened to her. Safe to call any time (rate limits live in life.ts). */
export function feel(e: LifeEvent): void {
  for (const h of handlers) h(e);
}

export function onFeel(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}
