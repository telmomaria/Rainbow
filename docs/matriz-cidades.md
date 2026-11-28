# Matriz das cidades — o que existe em cada nível

- **Data:** 2026-11-21
- **Commit:** `705615f` + alterações de 2026-11-21 (Clérigos, Rio, aviador, Nuuk, tanque, Estátua da Liberdade, Hotel das Fontes) + 2026-11-28 (Cidade do México: Teotihuacán, Tula, Casa Azul, bandeirinhas, crianças; praia do Rio)
- **Fonte:** o código (`src/`), não o CLAUDE.md. As diferenças estão na última secção.

**Legenda:** ✅ existe · — não existe · número = quantidade.
Colunas (ordem dos níveis, `src/cities.ts`):

| Sigla | POR | ROM | MAD | LON | PAR | VAR | VIL | MOS | PEQ | TÓQ | RIO | MÉX | REI | NUU | EUA | LUA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cidade | Porto | Roma | Madrid | Londres | Paris | Varsóvia | Vilnius | Moscovo | Pequim | Tóquio | Rio de Janeiro | Cidade do México | Reiquiavique | Nuuk | Estados Unidos | Lua |
| Nível (índice) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |

A Lua (`kind: 'moon'`) tem um ramo próprio em `addCityExtras()` (`src/main.ts`): **não tem nenhuma** das coisas de
cidade (feira, trânsito, lojas, casa, adereços, folk, perguntas…). Os Estados Unidos (`kind: 'usa'`) têm **tudo** o que
as cidades normais têm, mais os ex-líbris de `src/usa.ts` e o foguetão.

---

## 1. Atrações turísticas / ex-líbris

Fontes: `src/landmarks.ts` (`BY_CITY`), `src/landmarks-moscovo.ts`, `src/usa.ts`. O `src/landmarks-rio.ts` **ainda não
existia** quando isto foi escrito; o Rio está em `landmarks.ts`. `createLandmarks()` devolve `[]` para EUA e Lua (os EUA
usam o `usa.ts`).

### 1a. Resumo por cidade

| Elemento | POR | ROM | MAD | LON | PAR | VAR | VIL | MOS | PEQ | TÓQ | RIO | MÉX | REI | NUU | EUA | LUA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nº de ex-líbris | 1 | 1 | **0** | 2 | 1 | 6 | **0** | 2 | 1 | 1 | 2 + praia | 3 | **0** | **0** | 4 | — |
| Nº onde se sobe / se anda | 1 | — | — | 1 | — | 2 | — | — | — | — | 1 | 1 | — | — | 2 | — |
| Nº de joias de ex-líbris | 1 | 1 | — | 2 | 1 | 6 | — | 1 | 1 | 1 | 1 | 1 | — | — | 2 | — |
| Custa moedas | — | 1 (desejo) | — | — | — | — | — | — | — | — | 2 (teleférico) | — | — | — | — | — |

### 1b. Detalhe

| Cidade | Ex-líbris | O que acontece ao tocar | Sobe / usa | Joia (flag) |
|---|---|---|---|---|
| Porto | Torre dos Clérigos (igreja + torre + cúpula, escadas à volta) | sobe as escadas (`towerClimb`), vista a partir do varandim | ✅ sobe | ✅ `gem:Porto:clerigos` (no topo) |
| Roma | Fonte de Trevi (fachada, cascata, cavalos, jatos) | paga 1 moeda = "Faz um desejo!"; sem moedas avisa | — (usa: desejo) | ✅ `trevi` |
| Paris | Torre de ferro (estilo Eiffel, ~26 m) | narradora "A torre de ferro!"; passa-se por baixo dos arcos | — | ✅ `torre` |
| Londres | Torre do Relógio | dá as horas (badaladas = hora, máx. 8) | — | ✅ `relogio` |
| Londres | Roda gigante | dá uma volta completa na roda (grátis) | ✅ anda | ✅ `roda` |
| Varsóvia | Barbacã (forte redondo) | "Que forte tão giro!" | — | ✅ `barbaca` |
| Varsóvia | Palácio da Cultura | sobe (`towerClimb`) | ✅ sobe | ✅ `cultura` (no topo) |
| Varsóvia | Catedral de São Miguel e São Floriano | sinos | — | ✅ `catedral` |
| Varsóvia | Parque Łazienki (pavilhão, pavões, lago) | "Os pavões do parque!" | — | ✅ `lazienki` |
| Varsóvia | Praça do Mercado + sereia | "A sereia canta na praça!" | — | ✅ `sereia` |
| Varsóvia | Castelo Real (torreão) | sobe (`towerClimb`) | ✅ sobe | ✅ `castelo` (no topo) |
| Moscovo | Catedral de São Basílio + Praça Vermelha | sinos, cúpulas "dançam", narradora | — | ✅ `basilica` |
| Moscovo | Tanque antigo em exibição (Praça Vermelha) | tocar = torre roda, pomba pousa no canhão | — | — |
| Pequim | Muralha em serpentina com torres + gongo | gongo toca; "A muralha!" (degraus só decorativos) | — | ✅ `muralha` |
| Tóquio | Templo (portão, sino, pétalas de cerejeira) | "O sino do templo!" | — | ✅ `templo` |
| Rio de Janeiro | Pão de Açúcar (Urca baixa + Pão alto, 3 estações, bondinho) + músicos de samba | bondinho: entrar a andar / tocar / Enter; sobe 2 moedas, desce grátis | ✅ anda (bondinho) | ✅ `pao` (no cimo) |
| Rio de Janeiro | Cristo Redentor no Corcovado | tocar no morro = carrilhão + narradora | — | — |
| Rio de Janeiro | Praia comprida em todo o lado +Z (`beach.ts` + `beachlife.ts`, 2026-11-28): calçadão de ondas pretas e brancas (z 110–116), palmeiras, areia (116–138), mar animado até ao horizonte; 14 chapéus de sol + toalhas, 6 a apanhar sol, vólei de praia (rede + 4 jogadores), 4 a passear (calçadão e areia molhada), 5 no mar (2 em boias, 1 a chapinhar) | 1.ª vez na praia: "Que praia tão comprida! É como Copacabana!"; molha os pés à beira da água (salpicos); mais fundo não passa (onda + aviso falado); chegar ao lado do campo / tocar no campo = a bola vem até ela e volta ao jogo; quem passeia/está deitado acena quando ela chega perto | ✅ anda (areia, beira-mar) | — |
| EUA | Estátua da Liberdade | sobe as escadas até ao terraço (`towerClimb`) | ✅ sobe | ✅ `gem:usa:liberdade` |
| EUA | Ponte do Pacífico (suspensa, laranja) sobre um rio, entre dois montes (`usa.ts` `BRIDGE`) | sobe o monte pela estrada, atravessa a pé ou de carro, desce o outro; o rio não se pisa; 5 moedas no tabuleiro; a meio: "Estás em cima da ponte!…" | ✅ atravessa | — |
| EUA | Parque Arco-Íris (castelo) | fogo de artifício à noite | — | — |
| EUA | Hotel das Fontes (lago + fontes dançantes) | "As fontes dançam no lago!" | — | ✅ `gem:usa:palace` |
| Cidade do México | Teotihuacán (pirâmide em 5 patamares, ~18,5 m, escadaria central, templo no cimo) — `src/landmarks-mexico.ts` | sobe as escadas (`towerClimb`: clicar/Enter), vista no terraço, andar = descer | ✅ sobe | ✅ `gem:Cidade do México:teotihuacan` (no topo, pedestal ao lado dela) |
| Cidade do México | Guerreiros de Tula (4 atlantes de pedra numa plataforma com escadas, pilares atrás) | chegar à frente das escadas = tambor de pedra, olhos brilham, narradora | — | — |
| Cidade do México | Casa Azul (paredes azul-cobalto, frisos vermelhos, janelas verdes, pátio com árvores, catos, agaves, vasos, pirâmide de jardim) | entrar no pátio = pássaros voam, flores saltitam, "Esta é a Casa Azul, onde vivia a pintora Frida Kahlo." | anda-se no pátio | — |
| Cidade do México | Ambiente: bandeirinhas (papel picado vermelho/branco/verde) em fios entre pares de edifícios (até 12, nunca sobre a rua) · 4 crianças com máscaras de caveirinha do Dia dos Mortos a brincar à apanhada num relvado (ao chegar perto param, saltam, acenam e riem) | — | — | — |
| Madrid · Vilnius · Reiquiavique · Nuuk (Nuuk tem a zona de neve, ver atividades) | **nenhum** (funções vazias em `BY_CITY`) | — | — | — |
| Lua | (sem ex-líbris; o objetivo é a máquina do tempo, ver matriz 2) | — | — | — |

---

## 2. Interatividades / atividades

Fontes: `addCityExtras()` e `spawnActors()` em `src/main.ts`, `CITY_WITHOUT`/`cityHas` em `src/cities.ts`,
`fairCount()` em `src/fair/fair.ts`, `src/services.ts`, `src/spa.ts`, `src/manicure.ts`, `src/scooter.ts`,
`src/aurora.ts`, `src/moonplay.ts`, `src/questions.ts`.

### 2a. Iguais em todas as cidades (todas exceto a Lua, EUA incluídos)

Casa com as cores da bandeira · parque infantil vedado · brincadeiras de rua (`play.ts`: baliza, balancé, macaca, piano
de rua, banco, biblioteca; o escorrega antigo só se não houver parque) · padaria + pombos · bancas de gelado, chocolate e
chupa · sapataria, chapelaria/acessórios e loja de roupa com provador · cabeleireiro (corte + pintar) · cabina de
massagem · consultório do médico · fotógrafo · banco, joalheiro e baú do tesouro · hospital · trânsito + 4 autocarros
com 3 paragens · carro para conduzir · candeeiros de rua · gato na árvore · personagens das perguntas · bichos maus ·
tempo real e hora local.

### 2b. O que muda de cidade para cidade

| Elemento | POR | ROM | MAD | LON | PAR | VAR | VIL | MOS | PEQ | TÓQ | RIO | MÉX | REI | NUU | EUA | LUA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Aeroporto (avião) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (só chegada) | — |
| Foguetão (Cabo Canaveral) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — |
| Feira popular (nº diversões) | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | **—** | 15 | 15 | 15 | **—** | 15 | — |
| Concerto | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **—** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Piscina | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **—** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Estádio + adeptos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **—** | ✅ | ✅ | — |
| Bar (dois homens) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **—** | ✅ | ✅ | — |
| SPA (termas) | — | — | — | — | — | — | ✅ madeira | ✅ madeira | — | — | — | — | — | ✅ gelo | — | — |
| Manicure (nível ≥ 2) | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Trotinete (nível ≥ 3) | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **—** | ✅ | ✅ | ✅ | ✅ | — |
| Bondinho (teleférico) | — | — | — | — | — | — | — | — | — | — | ✅ (sobe 2, desce grátis) | — | — | — | — | — |
| Roda gigante (ex-líbris) | — | — | — | ✅ | — | — | — | — | — | — | — | — | — | — | — | — |
| Fonte dos desejos | — | ✅ | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Aurora boreal | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — |
| Zona de neve (bonecos, buracos no gelo, crianças, bolas) | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — |
| Bandeirinhas (papel picado) entre edifícios | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | — |
| Crianças com máscaras do Dia dos Mortos (apanhada) | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | — |
| Perguntas em inglês (polícia) | — | — | — | ✅ | — | — | — | — | — | — | — | — | — | — | — | — |
| Perguntas próprias da cidade | 3 | 3 | 2 | 3 | 3 | 2 | 2 | 2 | 3 | 2 | 3 | 2 | 2 | 3 | 3 | — |
| Personagens das perguntas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Monstros | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | bichos | marcianos |
| Máquina do tempo (fim) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ |
| Comida da nave (energia) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ |
| Cometa (a cada 5 min) | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ |

Notas: a feira em Tóquio teria 14 diversões se existisse. Os visitantes da feira são 0–12 (sorteados por cidade).
Os recintos (feira, parque, serviços) só aparecem se `roadsideSite`/espaço livre encontrar lugar; em mapas muito cheios
um serviço pode falhar sem aviso (isto só se confirma no browser).

---

## 3. Objetos e personagens de rua

Fontes: `src/props.ts`, `src/folk/` (rotação em `folkForLevel()`), `src/wandercat.ts`, `src/beggar.ts`,
`src/butterflies.ts`, `src/postman.ts`, `src/livingstatue.ts`, `src/rabbit.ts`, `src/parrot.ts`, `src/streetsinger.ts`.

### 3a. Iguais em todas as cidades (todas exceto a Lua)

Adereços de `props.ts` (12 + caixotes): fonte, baloiço, cogumelo, gato no banco, cão, balões, xilofone de chão,
semáforo com botão, macieira, canteiro de flores, caixa de correio, espanta-espíritos, e 4 caixotes azuis do papel ·
gato a passear (`wandercat.ts`) · pobre (`beggar.ts`) · gato na árvore (`cattree.ts`).

### 3b. Personagens e animais que mudam

| Elemento | POR | ROM | MAD | LON | PAR | VAR | VIL | MOS | PEQ | TÓQ | RIO | MÉX | REI | NUU | EUA | LUA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Borboletas (nível ≥ 1) | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Carteiro + cartas (nível ≥ 4) | — | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Homem-estátua (nível ≥ 6) | — | — | — | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Coelho | — | — | — | — | — | — | ✅ | — | — | — | — | — | — | — | — | — |
| Papagaio | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | — | — |
| Cantor de rua (guitarra) | — | — | — | ✅ | — | — | — | — | — | — | — | — | — | — | — | — |
| Músicos de samba (no Pão de Açúcar) | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | — | — |
| Pavões (Łazienki) | — | — | — | — | — | ✅ | — | — | — | — | — | — | — | — | — | — |

### 3c. Personagens folk (`src/folk/`) — rotação calculada a partir de `folkForLevel()`

Cada cidade recebe 3 de "fantasia" + 7 de "profissão", a rodar com o nível (`start = nível × 3` / `nível × 7`). O rei
só existe em Londres (`onlyIn`); o pescador é extra só em Reiquiavique. Os EUA também têm folk; a Lua não.

| Personagem (o que faz) | POR | ROM | MAD | LON | PAR | VAR | VIL | MOS | PEQ | TÓQ | RIO | MÉX | REI | NUU | EUA | LUA | Nº |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Elfo (rima, aponta moeda escondida) | ✅ | — | ✅ | — | ✅ | — | — | ✅ | — | ✅ | — | ✅ | — | — | ✅ | — | 7 |
| Fada (varinha abre flores) | ✅ | — | ✅ | — | — | ✅ | — | ✅ | — | ✅ | — | — | ✅ | — | ✅ | — | 7 |
| Rei (vénia + curiosidade da cidade) | — | — | — | ✅ | — | — | — | — | — | — | — | — | — | — | — | — | 1 |
| Feiticeiro (3 copos, achar a bola) | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | — | 9 |
| Aviador (avião de papel) | — | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | — | — | 8 |
| Corredor (corrida até ao candeeiro) | — | ✅ | — | — | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ | — | ✅ | — | — | 7 |
| Futebolista (passa a bola) | — | — | ✅ | — | ✅ | — | ✅ | — | — | ✅ | — | ✅ | — | ✅ | — | — | 6 |
| Padeiro (pão no forno) | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | — | 11 |
| Pedreiro (constrói muro) | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | 11 |
| Cozinheiro (sopa) | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | 11 |
| Cabeleireira (penteia à porta) | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | 11 |
| Massagista (cabina, marquesa) | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | 11 |
| Médico (maca, estetoscópio) | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | — | 10 |
| Enfermeira (penso / lavar as mãos) | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | — | 10 |
| Polícia de trânsito (inglês em Londres) | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — | 10 |
| Engenheiro (ponte com tábuas) | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | — | 10 |
| Bombeiro (mangueira no alvo) | — | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ | — | ✅ | — | 10 |
| Pescador (extra) | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — | — | 1 |

`?folk=all` ou `?folk=a,b` no URL substitui esta rotação (testes).

---

## Diferenças entre o CLAUDE.md e o código

1. **Bar em Reiquiavique.** O CLAUDE.md diz "Reiquiavique sem estádio (o bar fica)" e o comentário em `main.ts` diz o
   mesmo. Mas `CITY_WITHOUT` tem `Reiquiavique: ['stadium', 'bar']` e `Trouble` respeita `withBar`: **em Reiquiavique
   também não há bar**.
2. **Rei.** O CLAUDE.md diz "O rei (folk) não aparece em Moscovo (`notIn`)". No código o rei tem `onlyIn: ['Londres']`:
   aparece **só em Londres** e nenhum folk usa `notIn`.
3. **Aeroporto nos EUA.** O CLAUDE.md diz que os EUA ficam "sem aeroporto". O código mantém o aeroporto nos EUA para a
   chegada (`main.ts`: "the USA keeps one for arrivals but leaves by rocket"); só a saída é de foguetão.
4. **Número de cidades.** O CLAUDE.md diz "Estas 14 são as que existem no código", mas `CITIES` tem 16 entradas (com EUA
   e Lua), como ele próprio diz noutro sítio ("16 níveis").
5. **Coisas no código que o CLAUDE.md não refere:** pescador (Reiquiavique), coelho (Vilnius), papagaio (Rio), cantor de
   rua (Londres), homem-estátua (Vilnius em diante), borboletas (Roma em diante), manicure (Madrid em diante),
   trotinete só a partir de Londres, banco e joalheiro, cabeleireiro, médico, músicos de samba no Pão de Açúcar, roda
   gigante de Londres, fonte dos desejos em Roma (1 moeda) e o teleférico do Rio (2 moedas).
6. **Duplicados prováveis:** a cabina de massagem e o consultório do médico de `services.ts` existem em todas as
   cidades, e o folk "massagista" (11 cidades) e "médico" (10 cidades) também constroem cabina/maca próprias. Nessas
   cidades deve haver duas massagens e dois médicos. Confirmar no browser se é intencional.
7. **Comentário interno desatualizado (não é do CLAUDE.md):** `play.ts` diz que o coelho (I58) e a estátua viva (I76)
   foram tirados do jogo, mas hoje voltaram como `rabbit.ts` (Vilnius) e `livingstatue.ts` (nível ≥ 6).
8. Bate certo com o código: `CITY_WITHOUT` para Moscovo, Tóquio, Vilnius e Rio; SPA em Vilnius, Moscovo e Nuuk; cidades
   sem ex-líbris (Madrid, Vilnius, Reiquiavique, Nuuk; a Cidade do México passou a tê-los a 2026-11-28); carteiro a partir de Paris; Varsóvia com
   duas subidas; aurora só em Reiquiavique; cometa e máquina do tempo só na Lua.
