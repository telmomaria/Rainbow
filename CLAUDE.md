# Rainbow — Project Rules

Jogo 3D de exploração no browser para crianças de 7–8 anos. A criança escolhe uma personagem, caminha
por cidades reais (estilizadas), apanha moedas e joias, responde a perguntas faladas e sobe de nível
de cidade em cidade. Ver [CONTEXT.md](CONTEXT.md) e [ROADMAP.md](ROADMAP.md).

## Stack
- **Three.js + Vite + TypeScript** — jogo web 3D, sem servidor (deploy estático).
- **Mapa:** mundo **gerado** por cidade (grelha de ruas + edifícios low-poly), como está. **Sem mapas reais** (nem
  OpenStreetMap nem Google 3D Tiles): seriam demasiado grandes para as crianças. (Decisão do Telmo a 2026-11-15, que
  substitui a de 2026-11-11.) Cada cidade distingue-se pelos seus ex-líbris e pelo que lá se pode fazer; as cidades não
  devem ser iguais nem ter todas as mesmas coisas. Área a dobrar: abandonada (Telmo, 2026-11-19). Sem ex-líbris ainda: Madrid · Vilnius · Reiquiavique · Nuuk (ver ROADMAP).
- **Voz:** Web Speech API (`speechSynthesis`, voz `pt-PT`). Fallback a definir se a voz pt-PT faltar no dispositivo.
- **Persistência:** `localStorage` (progresso, moedas, roupa, posição). Sem contas, sem dados pessoais. Sem morada de início.
- **Registo de IPs (Telmo, 2026-11-26):** só para saber quem joga enquanto o jogo não é divulgado (rever antes de divulgar).
  Local: `vite.config.js` escreve em `ip.txt` cada abertura da página no `npm run dev` (agora com `--host`, aberto à rede) e no `preview`.
  Publicado (https://rainbow-alpha-liard.vercel.app/): o jogo chama `api/visit.js`, que guarda cada visita (data · IP · país · cidade · browser) como blob privado em `visitas/` no Vercel Blob;
  `npm run ips` junta-as no `ip.txt` (precisa de `BLOB_READ_WRITE_TOKEN` no `.env`). `ip.txt` está no .gitignore.

## Tags — global
Tag definitions live ONCE in `-SKILLS_GLOBAL/tags/` (short defs) + the skills in `-SKILLS_GLOBAL/SKILLS/`
(full behaviour, path resolved via `SKILLS/README.md`). This project does NOT redefine them.
- Resolver: `-SKILLS_GLOBAL/SKILLS/README.md` · Tier-1 cost menu: `-SKILLS_GLOBAL/SKILLS/INDEX.md`.

## Skills — two levels
- **Global** (`-SKILLS_GLOBAL/SKILLS/`) — read live, never copied; categories resolve via `SKILLS/README.md`.
- **Project-local** (`SKILLS/`) — only Rainbow-specific skills. Project-local overrides global of the same name.

## Project-specific conventions
- **Dev port: 1234** (`vite --port 1234 --strictPort`).
- **Controlos:** teclas de **setas** (↑ andar · ↓ recuar · ←/→ rodar) **e rato** (clicar no chão = caminhar até lá;
  arrastar = rodar a câmara; clicar num objeto = aproximar-se e interagir). Ambos funcionam sempre, em simultâneo.
  Toque (tablet) segue o mesmo modelo do rato.
- **Público: 7–8 anos.** Textos curtos, PT-PT simples, tudo o que é pergunta é **falado**; nada de leitura obrigatória longa.
- **Interatividade sem UI:** objetos interativos (botão→luz, carro→conduzir, moeda→pobre…) NÃO têm ícones,
  setas, contornos nem "prima E". Descobre-se por movimento/contacto (aproximar, tocar, entrar). Feedback só
  no mundo (som, animação, luz).
- **Perguntas:** matemática · estudo do meio · português, nível 2.º ano (programa PT). Sempre 3 opções. Banco em src/questions.ts (227 desde 2026-11-19): ~65 por disciplina + 2–3 por cidade (`city`, só lá e com prioridade ~40%: país, língua, ex-líbris); o polícia de Londres sorteia de `ENGLISH_QUESTIONS`. Nada de ortografia/acentos (tudo é falado).
  Errou → **não se revela a resposta certa**; a pergunta volta mais tarde (~3 min) para nova tentativa.
  Acertou → moedas e a pergunta fica resolvida para sempre. (Regra revista pelo Telmo a 2026-11-11.)
- **Valores:** moeda = 1 · joia = 5 (e conta no contador de joias) · resposta certa = 10 (e conta no contador ?). Moedas em rastos de 3, espalhadas (~36 no mundo) para não se chegar aos 100 depressa demais. Ao mostrar a pergunta já fica em espera de 3 min (recarregar a página não dá tentativa imediata).
- **Posição da personagem é gravada** (a cada 2 s e ao sair): recarregar a página continua no mesmo sítio.
- **Bichos maus:** quantidade = 1 + moedas/15 (máx. 8); perseguem a 4,6 m/s (sempre mais lentos que a personagem,
  6,5 m/s, para se poder fugir; sem energia ela anda a 4,7 m/s nas cidades e a 2,7 m/s na Lua (marcianos 2,6) — Telmo 2026-11-22); provocam com voz grave; tocar = empurrão + perde 3 moedas + 1,5 s a piscar sem
  poder ser apanhada. Nunca "morte" violenta — tom infantil. Ficam parados durante perguntas e viagens.
- **Viagem:** 100 moedas → aviso falado + bússola ✈️ → ir ao aeroporto → tocar nas escadas do avião → cena animada
  (sobe, porta fecha, descola, nuvens, aterra na cidade seguinte, sai). Gastam-se 100 moedas, o resto passa. Sem
  moedas, o avião diz quantas faltam. Troca de cidade sem recarregar a página. Depois de Nuuk: EUA (foguetão em Cabo Canaveral) → Lua → máquina do tempo → ecrã final "Rainbow 2".
- **Personagens (src/characters.ts):** Emma (princesa) · Estrela (unicórnio) · Bia, Valentina, Inês (cantoras K-pop) ·
  Zuca (extraterrestre) · Íris (guerreira) · Maria (voleibolista) · Clara (bailarina) · Tomás (karateca) ·
  Vega (astronauta, sem logótipos de agências) · Alice (País das Maravilhas — livro de 1865 / cores de Tenniel 1890,
  domínio público: vestido amarelo, avental branco, laço azul; nunca o visual da Disney).
  Escolha no 1.º arranque e no botão com o retrato (canto superior direito).
- **Objetos/situações por cidade:** candeeiro, carro (entra ao tocar; conduz com setas ou tocando no chão; sai com
  Espaço/Enter ou tocando no carro), pobre (aceita 1 moeda por cidade, agradece), e 12 adereços em src/props.ts
  (baloiço, fonte, xilofone de chão, gato, balões, flores, caixa de correio, árvore, espanta-espíritos, cão,
  cogumelo, semáforo). Todos só reagem ao toque, sem UI.
- **Autocarro (src/busstops.ts + traffic.ts):** 4 autocarros em 2 linhas (a "figura grande", que passa em todas as ruas
  interiores nos dois sentidos, e o anel exterior); 3 paragens (abrigo, banco, poste com sinal redondo) em ruas diferentes
  do anel, servidas por todas as linhas; os autocarros param ~5 s de portas abertas. Entrar = tocar no autocarro / ir à porta / Enter (paga 1 moeda; sem moedas o
  motorista abana a cabeça). Vai sentada à janela; sair = Espaço/Enter/toque/setas com as portas abertas (a meio da viagem toca a campainha e sai na paragem seguinte). Casa/menu/nova cidade tiram-na do autocarro.
- **Botões fixos:** Casa (ponto de partida) e retrato → abre a página principal (Continuar · Novo jogo · ⚙ Definições), em qualquer momento exceto a meio do voo ou de uma pergunta (também no hospital). Definições: monstros Zero (sem monstros) / Fácil ×0.5 / Médio / Difícil ×2; som da chuva Sem som / Médio (×0,4) / Normal (a chuva continua a ver-se).
  **Cidade (testes)** nas Definições: salta para qualquer um dos 16 níveis (moedas/joias ficam; "Novo jogo" começa na cidade escolhida). Só aparece em `npm run dev` (localhost) ou com `?debug` — nunca na versão publicada.
- **Cidades sem certas coisas (src/cities.ts `CITY_WITHOUT`, Telmo 2026-11-21):** Reiquiavique sem estádio nem bar ·
  Moscovo sem piscina · Tóquio e Nuuk sem feira · Vilnius sem concerto · Rio de Janeiro sem trotinete · Estados Unidos sem concerto (rodeo no lugar, src/rodeo.ts: bilhete 5, bancadas cheias onde se senta, cavalo aos pulos / laço / palhaço com barril em ciclo de 74 s; QA `?debug` + `rainbow-rodeo-time`) e sem baliza. O rei (folk) só existe em Londres
  (`onlyIn`). Reiquiavique tem um pescador (src/folk/pescador.ts, `onlyIn` + `extra`): lago com pontão num lado da cidade, pesca
  sozinho; ao chegar perto mostra um peixe; tocar nele = a vez dela (toca quando a boia afunda → peixinho, +1 moeda uma vez).
- **Matriz por cidade:** [docs/matriz-cidades.md](docs/matriz-cidades.md) (ex-líbris · atividades · objetos/personagens), tirada do código — atualizar quando se acrescenta/tira algo a uma cidade.
- **Neve em Nuuk (src/snowplay.ts, Telmo 2026-11-21):** campo de neve recuado da rua (~80 m do SPAWN, ao lado do parque infantil),
  em vez da feira. 3 bonecos de neve (tocar = chapéu salta, cai neve) · lago gelado com 3 buracos (chegar à beira = peixe salta;
  1.ª vez em cada buraco +1 moeda; nunca cai lá dentro) · 6 crianças (2 pares atiram bolas, 1 trenó na rampa, 1 faz um boneco).
  Ela atira: tocar num monte de neve / Enter ao lado = bola na mão (o que tinha na mão volta para o inventário, sem se gastar);
  tocar numa criança ou no chão = atira (Enter = para a frente); acertar = a criança ri e atira uma de volta (só *puf*, sem
  perder moedas). A bola derrete se ela se afastar >34 m. 1.ª aproximação: "Vamos brincar na neve!". QA: `?debug` + `rainbow-snow`.
- **Rio (src/landmarks-rio.ts, 2026-11-21):** Morro da Urca baixo e verde + Pão de Açúcar alto em "bala"; bondinho Praia
  Vermelha → Urca → cimo: entrar na cabine a andar / tocar na cabine ou estação / Enter (no cimo só com toque na cabine / Enter: encostar não desce); subir = 2 moedas (sem moedas o
  operador abana a cabeça), descer grátis; joia no miradouro. Cristo Redentor de braços abertos no Corcovado, noutra zona,
  visível de longe; tocar no morro = carrilhão + narradora (sem subida nem joia).
  **Praia (src/beach.ts + src/beachlife.ts, 2026-11-28):** ao longo de todo o lado +Z (longe do aeroporto): calçadão de ondas pretas/brancas (z 110–116, as ruas N–S acabam aí e os carros voltam para trás), areia até z 138, mar animado até ao horizonte; molha os pés até z 141,5 (salpicos), mais fundo há uma parede invisível (onda + "Mais para lá é fundo!"). Chapéus de sol + toalhas (instanciados), 6 a apanhar sol, vólei de praia (4 jogadores; ir ao lado do campo/tocar no campo = a bola vem até ela), 4 a passear (acenam), 5 no mar. 1.ª vez: "Que praia tão comprida! É como Copacabana!" (flag `rio:praia`). A areia fica reservada durante a construção da cidade (guarda tirada no fim do landmarks-rio). QA: `?debug`, `landmarks.beach`.
- **Cidade do México (src/landmarks-mexico.ts, 2026-11-28):** pirâmide de Teotihuacán (5 patamares, ~18,5 m; sobe-se a escadaria com `towerClimb`, joia no cimo) · guerreiros de Tula (tocar = tambor de pedra + narradora) · Casa Azul de Frida Kahlo (pátio: pássaros voam + narradora) · bandeirinhas vermelhas/brancas/verdes (papel picado) em fios entre edifícios · 4 crianças com máscaras de caveirinha (fofas) a brincar à apanhada; param e acenam quando ela chega.
- **Moscovo:** tanque antigo em exibição na Praça Vermelha (plinto, flores, correntes; sem marcas nem sons de guerra);
  tocar = a torre roda devagar e uma pomba pousa no canhão.
- **Aurora boreal (src/aurora.ts):** só em Reiquiavique, sempre que é de noite, com qualquer tempo (mais fraca com nuvens/chuva — Telmo 2026-11-28); da 1.ª vez a narradora diz "Olha para o céu! É a aurora boreal!" e a câmara olha para o céu ~7 s.
- **Segredo:** ninguém diz que o último nível é a Lua antes de lá chegar (as joias dizem "Guarda-a bem!").
- **Ordem de construção da cidade:** mundo → aeroporto → extras (candeeiros, carro, pobre, adereços, gato, hospital, lojas, estádio/bar, trânsito) → só depois moedas, personagens das perguntas e monstros (nunca nascem dentro de edifícios).
- **Arranque:** ecrã de escolha com "Continuar" (tudo como estava) e "Novo jogo" (tudo a zero, mantém personagem e definições).
- **Situações por cidade (só movimento, sem texto):** gato na árvore (+5), padaria (pão = 2) → pombos, gelado 3 / chocolate 2 / chupa 1,
  adeptos do estádio (-20; estádio e adeptos nas cores da bandeira do país), dois homens à porta do bar (-10), trânsito (atropelada = -30 + hospital 5 min; o tempo persiste em reload).
  Tudo espalhado pela cidade, nunca no centro nem no ponto de partida (SPAWN em world.ts). Moedas e joias nascem sempre ≥3 m dentro da borda do chão (±140 nas cidades, ±60 na Lua).
- **Carta (src/letters.ts):** o carteiro (Paris+) traz cartas da mãe/do pai; tocar na carta no inventário = abre e a narradora lê-a. Pô-la na caixa de correio (encostar) = vai para os avós; caixotes azuis (tocar/Enter) = deita-a fora.
- **Macaca (src/play.ts):** jogo 1–10 com pedrinha, contagem falada, "Céu!" = +2 moedas uma vez por cidade; ≥4 m do jardim de borboletas.
- **Baú (src/jewels.ts):** um por cidade; a chave é uma joia → abre e dá +15 moedas; depois fica vazio.
- **Concerto (src/concert.ts):** recinto vedado em cada cidade; bilhete = 5 moedas na bilheteira (clique/Enter), o porteiro
  abana a cabeça e aponta para a bilheteira sem bilhete; com bilhete o portão abre e o bilhete é recolhido à entrada (sair é
  livre, voltar a entrar pede novo bilhete). **Um concerto a cada 20 min** pelo relógio do dispositivo (:00, :20, :40):
  cantora, cantor ou banda (sorteado por cidade) toca 5 canções infantis tradicionais (domínio público, sintetizadas,
  ~5 min), aplauso final + despedida falada, depois **o público sai** a pé pelo portão; recinto vazio e às escuras; ~3 min
  antes do seguinte o público volta a entrar. Bilheteira aberta desde ~4 min antes até ao fim (fechada = estore em baixo,
  vendedor abana a cabeça). Recarregar a meio continua na canção certa. 50 pessoas dançam/batem palmas. Música nítida
  dentro, abafada fora; pausa = só silêncio. Lá dentro não há pausa por inatividade; nada nasce lá dentro (setNoSpawnZones).
  Último minuto antes do concerto: contagem decrescente em números luminosos no fundo do palco (sem texto) + narradora
  ("Falta um minuto…", "Faltam trinta segundos!", 10…1) quando ela está a < 40 m.
  QA: `?debug` + evento `rainbow-concert-time` (segundos no ciclo).
- **Piscina (src/pool.ts):** recinto vedado com a mesma bilheteira/portão/porteiro (src/venue.ts), bilhete = 5 moedas.
  Vestiário = cabines de praia: entrar numa = porta fecha, troca para fato de banho (mesma cabeça/cabelo; Tomás de calções;
  unicórnio com boia), entrar outra vez = volta à roupa. Tocar na borda em fato de banho = salta e nada (setas/toque);
  duplo toque / Espaço na água = crawl → costas → bruços; empurrar contra a borda = sai. Vestida, o nadador-salvador apita
  e aponta para as cabines. Para sair tem de se vestir outra vez na cabine (o porteiro aponta para as cabines e a narradora diz "Primeiro veste a tua roupa na cabina!"). Com o rato só salta para a água se tocar na água. Espreguiçadeiras do lado
  direito, com corredor largo até à piscina: clicar/tocar numa livre (de qualquer ponto do recinto) = deita-se ao sol; qualquer tecla/toque = levanta-se.
  Visitantes aleatórios (1–8): apanham sol, levantam-se, saltam, nadam, saem e deitam-se numa espreguiçadeira livre;
  outros boiam em boias. Casa/nova cidade/novo jogo = volta vestida.
- **Recintos (src/venue.ts):** concerto e piscina ficam recuados da rua (~10 m de largo à frente, para não se sair
  diretamente para o trânsito) e com ≥3 m livres à volta; a bilheteira tem espaço livre à frente (sem candeeiros).
- **Espaço livre:** nenhum objeto colado a edifícios — deixar sempre espaço para passar à volta. Adereços de brincar (baloiço, fonte, xilofone…) a ≥4 m da rua; o xilofone nunca atravessa ruas.
- **Casa (src/house.ts):** uma por cidade, recuada da rua, pintada por fora com as cores da bandeira do país (paredes · portas/frisos · telhado, tabela FLAG_COLORS); hall, cozinha, sala de estar + jantar, casa de banho e quarto.
  O telhado desaparece e a câmara olha de cima quando ela entra. Tocar: campainha, cabide, interruptor (luzes da casa),
  frigorífico, fogão, torneiras, frasco de bolachas, TV, rádio, candeeiros, chuveiro, sanita, roupeiro, caixa de brinquedos.
  Clicar/Enter: sofá e cadeiras = sentar; cama = deitar; qualquer tecla/toque = levantar.
- **Feira popular (src/fair/):** recinto grande em cada cidade, entrada livre por um arco iluminado; 1.ª cidade 5 diversões,
  2.ª 6, 3.ª 7… (máx. 15, ordem em FAIR_ORDER): carrossel, pipocas, bolas→peluches, trampolim, balões, carrinhos de choque,
  cachorros-quentes, arco e flecha, insuflável, pinturas faciais, montanha-russa, bijuteria, river ride, artesanato, roupa.
  Diversões = clicar/Enter e pagar (2 moedas; trampolim/insuflável/balão 1; bancas de bijuteria/artesanato/roupa 3).
  Andar nas diversões usa os assentos (SwingSeat: sentada, de pé a saltar, ou a conduzir); comida vai para o inventário;
  acessórios (pinturas, colares, chapéus) ficam na personagem e são gravados (save.wear). Se a cidade estiver cheia, a
  feira retira os edifícios provisórios do caminho.
- **Parque infantil (src/playground.ts, 2026-11-19):** um por cidade, vedado (portões à frente e atrás), chão macio; estrutura
  grande com 2 torres + ponte, escorrega em tubo e escorrega ondulado (descem SENTADA e saem sozinhas no fim), baloiço de 2
  lugares, carrossel de rodar, cavalinho e joaninha de mola. Clicar/Enter = sentar; tecla/toque = sair. Tocar na escada ou na rede = sobe, senta-se e desce o escorrega a deslizar (tubo transparente; câmara de lado durante a descida); ≥2,7 m livres entre a cerca e as escadas. É colocado antes
  dos adereços (recinto 20×19 m, precisa de ~22×21 m; se a cidade estiver cheia tira os edifícios provisórios do caminho). Sem caixa de areia.
- **Sapataria, chapelaria e loja de roupa (src/tryon.ts, 2026-11-19):** lojas grandes onde se entra; tocar num artigo = experimentar (fica
  nela), espelho verdadeiro ao fundo, pagar no balcão/vendedor; sair sem pagar = volta à prateleira. 6 pares de calçado, 6 chapéus, 6 roupas em manequins.
- **SPA (src/spa.ts, 2026-11-19):** só em Vilnius, Moscovo e Nuuk; pátio 13×11 m (corredores ≥2,7 m), paga 5 à porta, veste o roupão na cabina, entra/sai da água quente quando
  quiser (energia +1 a cada 10 s, humor +2 por visita); o roupão fica no SPA ao sair. Sem marquesas de massagem.
- **Fotógrafo:** 1 moeda por foto, quantas quiser seguidas ("Tiramos mais uma?").
- **Ex-líbris onde se sobe (src/landmarks.ts `towerClimb`, exportada; também a Estátua da Liberdade em src/usa.ts):** só uma subida ativa de cada vez (Varsóvia tem duas); no topo, terraço aberto com a joia num pedestal ao lado dela.
  No topo arrastar / ←→ roda a vista (`rainbow-aerial` com `turn`); tentar andar (↑/↓ ou tocar no chão) = descer — o 1.º passo apanha a joia se ainda lá estiver. Clique na torre / Enter também descem.
  Estátua da Liberdade: escadas do lado por onde se chega, braço direito erguido com a tocha para cima. Hotel das Fontes: passeio de ~5 m em frente ao lago (só o lago, a torre e o lobby são obstáculo). Moscovo: Catedral de São Basílio (src/landmarks-moscovo.ts). Pequim: muralha longa com torres + gongo.
- **Personagens de rua (src/folk/):** cada uma faz algo visível (avião de papel — é ela que o lança: tocar no avião/aviador ou Enter = ele dá-lho, ela atira-o, vai buscá-lo e devolve-o, pode repetir logo; ponte com tábuas, enfermeira: penso só se se magoou há < 3 min, senão lavar as mãos; sopa); "Bom dia/Boa tarde/Boa noite" segue a hora local.
- **Bandeiras (src/flags.ts):** as bandeiras reais de cada país (aeroporto, casa, estádio, castelos de Varsóvia), desenhadas em canvas; verificadas uma a uma a 2026-11-21 (Reino Unido com as diagonais desencontradas, como a real; brasões de Portugal/Espanha/México simplificados).
- **Trotinete:** braços para a frente no guiador; as perguntas também aparecem de trotinete (ela para, não sai).
- **Massagem (2026-11-19):** fica deitada o tempo que quiser (tecla/toque = levantar); energia +1 a cada 8 s, humor +1 uma vez;
  a massagista está à cabeceira, de cara para a porta.
- **Feira (2026-11-19):** recinto maior (56×51 m), ≥3 m livres à volta de cada diversão, só 4 mastros (nos cantos);
  0 a 12 visitantes (por cidade) entram pelo arco, param a ver as diversões e voltam a sair. Nas diversões a câmara não faz zoom.
- **Baloiço:** clicar/tocar (ou Enter ao lado) = senta-se no assento mais próximo e baloiça; qualquer tecla/toque = sai.
- **Depois de uma pergunta** a personagem acena e vai-se embora a pé (só desaparece longe/fora de vista).
- **Artistas do concerto** só estão no palco durante o espetáculo: saem a pé pelo lado depois do final e voltam ~10 s antes do seguinte.
- **Personagens das perguntas:** ninguém fica parado na rua — todas passeiam devagar (1,3 m/s, nunca na estrada); só param e se viram quando ela está a < 8 m.
  As perguntas e as respostas são lidas devagar (`QUESTION_RATE` 0,75 em src/audio.ts; o resto da narração fica a 0,95).
  Quando já não há perguntas por resolver disponíveis, as resolvidas voltam como revisão (dão moedas, não contam no "?").
- **Tempo real + hora local:** Open-Meteo (sem chave), por cidade, cache 15 min; luz segue a hora local real (nascer/pôr do sol); candeeiros de rua (src/streetlights.ts) acendem um a um quando escurece. Testes: `?weather=rain`, `?hour=21.5`.
- **Compras:** só com clique/toque na loja (ou Enter junto ao balcão); itens vão para o inventário (lateral esquerda); tocar num doce = comer; tocar no pão = segurá-lo para os pombos.
- **Pausa:** 30 s sem tocar em nada → pausa (ecrã com ▶). O mesmo monstro só tira moedas 2 vezes seguidas.
- **Vozes:** narradora = voz feminina pt-PT (Helia no Windows); monstros = voz masculina pt-PT se existir (Duarte
  no Edge), senão a mesma voz com tom muito grave. O Windows não instala vozes masculinas pt-PT.
- **Ordem das cidades:** Porto → Roma → Madrid → Londres →
  Paris → Varsóvia → Vilnius → Moscovo → Pequim → Tóquio → Rio de Janeiro → Cidade do México → Reiquiavique → Nuuk.
  → Estados Unidos → Lua (16 níveis em src/cities.ts). **Sem morada de início / address settings** (decisão do Telmo: spawn/arranque fica como está).
- **Final do jogo (decisão do Telmo a 2026-11-15, por construir):** o penúltimo nível é os **Estados Unidos**, com
  atrações de várias cidades (Estátua da Liberdade, ponte de São Francisco — sobre um rio entre dois montes, atravessa-se a pé ou de carro, parque de diversões, **Hotel das Fontes**)
  e **sem partida de avião** (chega-se de avião; o aeroporto só serve a chegada): de **Cabo Canaveral** lança-se um foguetão para a **Lua**, o último nível. Na Lua há pouca coisa:
  crateras, moedas espalhadas, subidas e descidas, areia, terra, rochas, pedras e **marcianos que tiram moedas**.
  **O objetivo do jogo é colocar os diamantes (as joias) num local específico; aí o jogo termina.** Joias precisas
  (Telmo, 2026-11-19): **as que tem ao chegar à Lua + 10** (`MOON_EXTRA_JEWELS`, alvo fixado na 1.ª chegada, flag
  `moon:need`); a máquina do tempo diz quantas faltam. O hotel-casino de Las Vegas no nível EUA é o
  **Hotel das Fontes** (lago + fontes dançantes; inspirado nas fontes do Bellagio, IP original — nunca nomes de marca).
- **Lua — fato e saltos (Telmo 2026-11-21):** ao fechar a porta do foguetão (src/launch.ts) ela veste o fato espacial (src/characters.ts: branco, mochila, capacete de vidro com a cabeça dela lá dentro, sem logótipos; a Vega fica com o fato dela, o unicórnio leva capacete-bolha); na Lua usa-o sempre (também depois de recarregar), noutra cidade volta à roupa. Lua de ±60 m (`MOON_HALF`, src/moon.ts). Na Lua anda a 3,5 m/s aos saltos lentos (~1 s, ~1 m de altura, pó ao pousar; a câmara só sobe 1/4 do salto); marcianos a 2,6 m/s.
- **Lua (src/moonplay.ts, Telmo 2026-11-19):** o fim é uma **máquina do tempo** enterrada na areia (só se vê a antena a
  piscar); a < 14 m o vento levanta a areia e ela aparece. Com as joias todas: as joias voam para ela, a personagem entra,
  gira e desaparece → ecrã ⏳ "A máquina do tempo leva-te para o Rainbow 2". Energia na Lua = tocar na nave (cápsula de
  comida espacial, energia cheia). **Cometa a cada 5 min** de jogo, apontado perto dela, com círculo vermelho de aviso
  (4 s); se acertar fica deitada e tonta 1 min sem se mexer (persiste no reload; monstros parados). Montanhas do horizonte
  sempre fora da zona onde se anda. QA: `?debug` + evento `rainbow-comet`.
- **Personagens: só originais.** Arquétipos pedidos (princesa, unicórnio, 3 caçadoras-cantoras K-pop,
  extraterrestre fofo, guerreira de ~1500 d.C., jogadora de vólei, bailarina, karateca) com nomes, visual e
  música próprios — **nunca** personagens, nomes ou arte da Disney, de "KPop Demon Hunters" ou outra IP existente.
- **Marcas / trademarks:** nunca enviar nomes reais de marca no jogo (Disney, Caesars Palace, Bellagio, etc.); usar
  nomes originais em PT-PT amigáveis para crianças (ex.: Parque Arco-Íris, Hotel das Fontes).
- **Gato a passear (src/wandercat.ts):** um gato cinzento por cidade anda pelos passeios (nunca na estrada); quando ela chega
  perto, para, olha para ela, mia e dá um saltinho, e depois segue caminho.
- **Sentada** (baloiço, sofá, cadeiras, autocarro, diversões): as pernas ficam para a frente, do lado da cara.
- **Aterragem:** filmada do lado de lá da pista — o terminal e a torre ficam atrás da pista e o avião entra pela esquerda
  e para à direita. A descolagem mantém a câmara antiga.
- **Atribuição OSM:** só passa a ser obrigatória se algum dia se voltarem a usar dados do OpenStreetMap (hoje não se usam).
- **Definition of done:** corre em `localhost:1234` sem erros na consola, testado no browser (skill `browser-automation`)
  e a ≥30 fps num tablet médio; validado pelo Telmo.

## Orchestration
- Projeto de **uma só janela** (sem orchestrator-lineage; `docs/orchestration/LINEAGE.md` só nasce na 1.ª passagem).
- `#SUB`-default para trabalho paralelo disjunto; 70% capacity gate (`session-end-protocol`).
- Lineage trindade: `docs/chat-records/` · `docs/diary/` · `docs/cave/`.

## Behaviour
- PT-PT por defeito.
- Pensar antes de sugerir; validar depois de alterações grandes; nunca declarar feito sem confirmação.
