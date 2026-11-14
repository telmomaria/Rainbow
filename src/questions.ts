/**
 * Question bank — 2.º ano do 1.º ciclo (7–8 anos), PT-PT.
 * `answers[0]` is always the correct one; options are shuffled when shown.
 * Ids are stable: they are stored in the save (solved ones retire; wrong ones come back later).
 */
export type Subject = 'matematica' | 'estudo-do-meio' | 'portugues';

export interface Question {
  id: string;
  subject: Subject;
  text: string;
  answers: [string, string, string];
}

export const QUESTIONS: Question[] = [
  // --- Matemática ---
  { id: 'm01', subject: 'matematica', text: 'Quanto é sete mais cinco?', answers: ['12', '11', '13'] },
  { id: 'm02', subject: 'matematica', text: 'Quanto é quinze menos seis?', answers: ['9', '8', '11'] },
  { id: 'm03', subject: 'matematica', text: 'Quanto é duas vezes quatro?', answers: ['8', '6', '10'] },
  { id: 'm04', subject: 'matematica', text: 'Qual é o dobro de seis?', answers: ['12', '8', '16'] },
  { id: 'm05', subject: 'matematica', text: 'Qual é a metade de dez?', answers: ['5', '2', '20'] },
  { id: 'm06', subject: 'matematica', text: 'Quantos lados tem um triângulo?', answers: ['3', '4', '5'] },
  { id: 'm07', subject: 'matematica', text: 'Que número vem a seguir ao trinta e nove?', answers: ['40', '30', '49'] },
  { id: 'm08', subject: 'matematica', text: 'Quantos dias tem uma semana?', answers: ['7', '5', '10'] },
  { id: 'm09', subject: 'matematica', text: 'Quanto é vinte mais trinta?', answers: ['50', '40', '60'] },
  { id: 'm10', subject: 'matematica', text: 'Quanto é três vezes cinco?', answers: ['15', '8', '35'] },
  { id: 'm11', subject: 'matematica', text: 'Quantas dezenas há no número quarenta?', answers: ['4', '40', '10'] },
  { id: 'm12', subject: 'matematica', text: 'Qual é o número maior?', answers: ['71', '17', '57'] },

  // --- Estudo do Meio ---
  { id: 'e01', subject: 'estudo-do-meio', text: 'Qual é a capital de Portugal?', answers: ['Lisboa', 'Porto', 'Coimbra'] },
  { id: 'e02', subject: 'estudo-do-meio', text: 'Quantas estações tem o ano?', answers: ['4', '2', '12'] },
  { id: 'e03', subject: 'estudo-do-meio', text: 'Em que estação do ano caem as folhas das árvores?', answers: ['Outono', 'Verão', 'Primavera'] },
  { id: 'e04', subject: 'estudo-do-meio', text: 'Qual destes animais é um mamífero?', answers: ['Golfinho', 'Tubarão', 'Galinha'] },
  { id: 'e05', subject: 'estudo-do-meio', text: 'Com que sentido sentimos os cheiros?', answers: ['Olfato', 'Tato', 'Audição'] },
  { id: 'e06', subject: 'estudo-do-meio', text: 'Quantos meses tem um ano?', answers: ['12', '10', '7'] },
  { id: 'e07', subject: 'estudo-do-meio', text: 'Onde devemos pôr uma garrafa de plástico vazia?', answers: ['No ecoponto amarelo', 'No ecoponto verde', 'No ecoponto azul'] },
  { id: 'e08', subject: 'estudo-do-meio', text: 'De que precisam as plantas para crescer?', answers: ['Água e luz do Sol', 'Só de terra', 'Só de vento'] },
  { id: 'e09', subject: 'estudo-do-meio', text: 'Que oceano banha a costa de Portugal?', answers: ['Atlântico', 'Pacífico', 'Índico'] },
  { id: 'e10', subject: 'estudo-do-meio', text: 'Quando o semáforo dos peões está vermelho, o que fazemos?', answers: ['Esperamos', 'Atravessamos a correr', 'Atravessamos a andar'] },
  { id: 'e11', subject: 'estudo-do-meio', text: 'Que animal põe ovos?', answers: ['Galinha', 'Vaca', 'Cão'] },
  { id: 'e12', subject: 'estudo-do-meio', text: 'Que órgão bombeia o sangue pelo corpo?', answers: ['Coração', 'Estômago', 'Pulmão'] },

  // --- Português ---
  { id: 'p01', subject: 'portugues', text: 'Qual destas palavras é o contrário de alto?', answers: ['Baixo', 'Grande', 'Largo'] },
  { id: 'p02', subject: 'portugues', text: 'Qual é o plural de flor?', answers: ['Flores', 'Flors', 'Floris'] },
  { id: 'p03', subject: 'portugues', text: 'Qual destas palavras é um nome de animal?', answers: ['Gato', 'Correr', 'Bonito'] },
  { id: 'p04', subject: 'portugues', text: 'Quantas sílabas tem a palavra borboleta?', answers: ['4', '3', '5'] },
  { id: 'p05', subject: 'portugues', text: 'Qual destas palavras rima com janela?', answers: ['Panela', 'Jardim', 'Porta'] },
  { id: 'p06', subject: 'portugues', text: 'Qual é o feminino de leão?', answers: ['Leoa', 'Leona', 'Leãozinha'] },
  { id: 'p07', subject: 'portugues', text: 'Qual destas palavras é uma ação?', answers: ['Saltar', 'Mesa', 'Azul'] },
  { id: 'p08', subject: 'portugues', text: 'Qual é a primeira letra do alfabeto?', answers: ['A', 'B', 'Z'] },
  { id: 'p09', subject: 'portugues', text: 'Qual é o diminutivo de casa?', answers: ['Casinha', 'Casão', 'Casas'] },
  { id: 'p10', subject: 'portugues', text: 'Qual destas palavras quer dizer o mesmo que contente?', answers: ['Feliz', 'Triste', 'Zangado'] },
  { id: 'p11', subject: 'portugues', text: 'Qual destas palavras começa por uma vogal?', answers: ['Ovo', 'Pato', 'Sapo'] },
  { id: 'p12', subject: 'portugues', text: 'Qual é o plural de pão?', answers: ['Pães', 'Pãos', 'Pões'] },
];

/** Pick a random available question not already held by a character; null if none right now. */
/**
 * A question nobody is holding yet: unsolved ones first; once those run out (all solved or waiting to be retried),
 * already-solved ones come back as a review (`recyclable`), so the world never runs out of question-givers.
 */
export function nextQuestion(
  available: (id: string) => boolean,
  reserved: Set<string>,
  recyclable: (id: string) => boolean = () => false,
): Question | null {
  let pool = QUESTIONS.filter((q) => available(q.id) && !reserved.has(q.id));
  if (pool.length === 0) pool = QUESTIONS.filter((q) => recyclable(q.id) && !reserved.has(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
