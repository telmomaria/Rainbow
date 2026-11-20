import type { GameCtx } from './gamectx';

/**
 * Cartas da Mãe / do Pai (o carteiro entrega-as a partir de Paris).
 * Cada carta no saco tem um texto guardado em ctx.text(LIST_KEY): "variante@cidade" separados por "|",
 * pela ordem em que chegaram (a última é a que se lê / se deita fora / se põe no correio primeiro).
 * Cartas antigas sem texto guardado (saves de antes) recebem um texto feito na hora.
 */

export const LETTER_KIND = 'postal';
const LIST_KEY = 'letters';

/** Short PT-PT lines about the city the letter arrived in. */
const CITY_LINES: Record<string, string> = {
  Paris: 'Já viste a torre grandona de Paris? Acena-lhe por mim!',
  Varsóvia: 'Em Varsóvia, bom dia diz-se «dzień dobry». Experimenta!',
  Vilnius: 'Dizem que em Vilnius há coelhos. Conta-me se vires um!',
  Moscovo: 'Em Moscovo faz muito frio. Põe o cachecol!',
  Pequim: 'Em Pequim há uma muralha enorme. É maior que a nossa rua?',
  Tóquio: 'Em Tóquio come-se com pauzinhos. Consegues apanhar um bago de arroz?',
  'Rio de Janeiro': 'No Rio há praias lindas. Não te esqueças do chapéu!',
  'Cidade do México': 'No México há tacos deliciosos. Guarda um para mim!',
  Reiquiavique: 'Na Islândia há vulcões e gelo. Que terra tão engraçada!',
  Nuuk: 'Na Gronelândia há icebergues. Acena às baleias por mim!',
  'Estados Unidos': 'Que país tão grande! Vê se encontras a estátua com a tocha.',
  Lua: 'Na Lua salta-se muito alto. Não vás parar às estrelas!',
};

const GREETINGS = ['Olá, minha estrela!', 'Olá, meu raio de sol!', 'Olá, tesouro!', 'Olá, meu coração!'];

const EXTRAS = [
  'Come a fruta toda, está bem? Até a pera!',
  'Adivinha: o que disse o zero ao oito? Que cinto tão giro!',
  'O gato cá de casa tem saudades tuas. Disse miau duas vezes!',
  'Lava os dentes antes de dormir. Os dentes gostam de brilhar!',
  'Fiz bolo de chocolate. Guardei-te a fatia maior!',
  'Sabes porque é que o livro de matemática anda triste? Tem muitos problemas!',
  'Bebe água e dorme bem. Amanhã há mais aventuras!',
  'Hoje vi uma nuvem com a forma de um coelho. Lembrei-me logo de ti!',
];

const MOM_ENDS = ['Um abraço do tamanho do mundo,', 'Mil beijinhos,'];
const DAD_ENDS = ['Um abraço de urso,', 'Beijinhos e cócegas,'];

export interface Letter {
  /** 'Mãe' or 'Pai'. */
  from: string;
  /** Lines of the letter body (greeting first, signature last). */
  lines: string[];
}

/** The letter for variant `v` that arrived in `city`. */
export function letterText(v: number, city: string): Letter {
  const mom = v % 2 === 0;
  const k = Math.floor(v / 2);
  const cityLine = CITY_LINES[city] ?? `Como está ${city}? Conta-me tudo quando voltares!`;
  const end = (mom ? MOM_ENDS : DAD_ENDS)[k % 2];
  const from = mom ? 'Mãe' : 'Pai';
  return {
    from,
    lines: [GREETINGS[k % GREETINGS.length], cityLine, EXTRAS[k % EXTRAS.length], `${end} ${from}`],
  };
}

function readList(ctx: GameCtx): string[] {
  const s = ctx.text(LIST_KEY);
  return s ? s.split('|').filter(Boolean) : [];
}

/** A new letter has just arrived (the postman): remember its text. Returns it (for the spoken hint). */
export function newLetter(ctx: GameCtx): Letter {
  const v = Math.floor(Math.random() * 1000);
  const city = ctx.city();
  const list = readList(ctx);
  list.push(`${v}@${city}`);
  ctx.setText(LIST_KEY, list.slice(-20).join('|'));
  return letterText(v, city);
}

/** The letter on top (the newest one). `count` = letters in the bag; extra texts are dropped, missing ones invented. */
export function topLetter(ctx: GameCtx, count: number): Letter {
  const list = readList(ctx).slice(-Math.max(1, count));
  const top = list[list.length - 1];
  if (!top) return letterText(Math.floor(Math.random() * 1000), ctx.city());
  const at = top.indexOf('@');
  return letterText(Number(top.slice(0, at)) || 0, top.slice(at + 1));
}

/** The top letter left the bag (posted / thrown away): forget its text; keep the list as long as the bag count. */
export function dropLetter(ctx: GameCtx, countAfter: number): void {
  const list = readList(ctx);
  list.pop();
  ctx.setText(LIST_KEY, countAfter > 0 ? list.slice(-countAfter).join('|') : '');
}

/**
 * Hooks for the street props (mailbox, paper bins in props.ts), which are built without the game context.
 * Extras (extras.ts) fills them in once the game exists.
 */
export const letterHooks = {
  /** She has a letter (in her hand when `inHand`, else anywhere in the bag) and is free to use it. */
  has: (_inHand: boolean): boolean => false,
  /** The letter leaves her (hand first, else the bag). Returns false if she has none. */
  take: (_inHand: boolean): boolean => false,
  /** Narrator line, only if nothing else is being said. */
  say: (_lines: string[]): void => {},
};

/** Where the mailbox and the paper bins of this city stand (for the ?debug bridge). */
export const letterPlaces = { mailbox: null as [number, number] | null, bins: [] as [number, number][] };
