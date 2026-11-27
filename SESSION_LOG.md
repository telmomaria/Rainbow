# SESSION LOG — Rainbow (append-only)

## 2026-11-15 — I08 guardião removido (pedido do Telmo)
- Screenshot: NPC de chapéu/fato azul com massa enorme de esferas verdes-oliva colada à cabeça; falava «Boa tarde» + estrelas do céu — Telmo: «aberração… remove isto».
- Removido `registerFolk` I08 (`id: 'guardiao'`) em `src/folk/fantasia.ts` (builder, constelação, falas). Deixada nota para não repor. ROADMAP: tirado «guardião» da lista.

## 2026-11-11 — #NP
- Interrogatório first-run; stack Three.js + Vite + TS; mapa OSM estilizado; porta 1234; PT-PT; uma só janela; sem MCP.
- Scaffold gerado a partir de -SKILLS_GLOBAL/framework/templates/.
- Regra acrescentada: navegação por setas e rato.

## 2026-11-11 — bootstrap
- Vite 8 + Three.js 0.187 + TS; controlos setas + rato/toque; colisões; candeeiro interativo por contacto. QA no browser OK (0 erros consola).

## 2026-11-11 — moedas + perguntas
- Velocidade 6,5 m/s. Moedas em rastos, joias, contador, localStorage. Perguntas faladas (36, 2.º ano) com 3 opções; QA no browser: pergunta aparece, personagem para, errado = 0 moedas e pergunta retirada (persiste após reload). Caminho 'resposta certa' não exercitado no browser.

## 2026-11-11 — contadores
- HUD com 3 contadores (moedas · joias · respostas certas com ícone ?). QA no browser: joia +1/+5 moedas, resposta certa +1/+10, persistência após reload, 0 avisos.

## 2026-11-11 — feedback do Telmo
- Errar já não revela a certa; pergunta volta após ~3 min (save.retryAt). Moedas: 36 em rastos de 3, mais longe. Posição gravada.
- "Voltou à posição inicial" = reloads do Vite durante as minhas edições (confirmado no log do dev server); agora a posição persiste.
- "Ganhaste 10 moedas" repetido: não reproduzido — QA mostra 1 só chamada à voz; fica em observação.
- QA browser: errado sem revelar + retry gravado; certo +10, posição igual, elogio 1×; reload mantém posição. 0 erros.

## 2026-11-11 — cidades + bichos maus
- 13 cidades (palete/seed por cidade no mundo provisório), ecrã de viagem aos 100 moedas, chegada falada, nome da cidade no canto; troca em-ecrã (sem reload).
- Bichos maus: 1 + moedas/15 (máx. 8), perseguem a 4,6 m/s, provocam, empurram, -3 moedas, 1,5 s invulnerável.
- QA browser: 1 bicho a 0 moedas → 4 a 45; apanhada → -3 moedas + "Toma lá!"; 104 moedas → ecrã → Roma com 4 moedas; persiste após reload. 0 erros.

## 2026-11-11 — aeroporto, personagens, interatividade (#SUB)
- Subagentes: characters.ts (10 personagens originais) e props.ts (12 adereços); master: aeroporto/voo, voz dos monstros, ícone, Casa, carro, pobre, ecrã de escolha, integração.
- Bug apanhado no QA: bloco do ecrã de escolha inserido dentro de tick() (criava ecrãs a cada frame) — corrigido.
- Bug apanhado no QA: posição gravada a meio do voo e reposta dentro do avião — corrigido.
- QA browser: escolha por setas/Enter, carro (entrar/conduzir/sair), pobre (-1 moeda + agradece), 22 interativos na cidade, Casa → (0,0), voo Portugal → Roma completo. 0 erros.
- Voz masculina pt-PT: não existe no Windows (só Helia); funciona no Edge (Duarte).

## 2026-11-11 — cidade viva (lojas, adeptos, trânsito, hospital, tempo real) + ajustes
- Subagentes (lojas, adeptos/bar, trânsito/hospital, tempo) pararam no limite de 5 h a meio da verificação; os módulos compilavam → integrados e verificados pelo master.
- Um subagente tinha deixado SPAWN alterado em world.ts (fora do âmbito) — reposto.
- Novo: gato na árvore (+5), carro com porta e condutor visível, padaria (pão 2) → pombos, gelado 3/chocolate 2/chupa 1, adeptos (-20), bar (-10), trânsito com atropelamento (-30 + hospital 5 min, persiste em reload), tempo real Open-Meteo por cidade, ecrã inicial Continuar/Novo jogo, definições (monstros ×0.5/×1/×2), pergunta com repetir + hover, pausa aos 30 s parado, mesmo monstro máx. 2 hits seguidos, câmara não entra em edifícios, nunca fica presa.

## 2026-11-11 — compras por clique, inventário, dia/noite
- Lojas só vendem com clique/Enter; inventário lateral (doces comem-se ao tocar; pão para os pombos); definições no ecrã inicial.
- Subagente: luz pela hora local real (Open-Meteo sunrise/sunset) + 114 candeeiros de rua (instanced, 6 PointLights). QA 13h/17h36/22h OK.

## 2026-11-11 — menu principal acessível + definições
- Retrato abre a página principal completa (Continuar/Novo jogo/Definições), também no hospital. Dificuldade dentro de "⚙ Definições".
- Personagem de pergunta dentro do hospital: atores passaram a nascer depois de todos os edifícios (npcsInside = 0 verificado).
- Bug: classe CSS "settings" do botão colidia com o overlay das definições — renomeada.

## 2026-11-12 — fecho da sessão 1 (#SEP)
- Últimos polimentos: espaço na página principal; opção "Zero" (sem monstros) nas Definições; "Novo jogo" pede confirmação (Enter/Esc = não).
- Estado: v1.8 + polimentos, 20 commits em `main` (enviados). Mundo continua provisório (OSM por fazer).
- Lições da sessão: (1) subagentes podem alterar ficheiros fora do âmbito durante testes — rever `git diff` no fim; (2) o limite de 5 h da conta pode cortar subagentes a meio — o trabalho fica no disco e o master pode integrar; (3) edições minhas recarregam o Vite e reiniciam o jogo do Telmo — por isso a posição é gravada; (4) nomes de classes CSS genéricos ("settings") colidem entre módulos.
- Step 8 (bootstrap v{N+1}) não aplicável: projeto de uma só janela.

## 2026-11-13/14 — sessão 2: concerto, piscina, autocarro, novas personagens (#SS → #SEP)
- Novo: concerto (20 em 20 min pelo relógio, 5 canções de domínio público, contagem final, público e artistas entram/saem), piscina (bilhete, cabines, 3 estilos de natação, espreguiçadeiras, visitantes), venue.ts partilhado, autocarro com paragens e 2 linhas, baloiço montável, Vega e Alice, perguntas a passear e a ir embora a pé, Portugal → Porto, Casa no hospital.
- Bugs corrigidos: personagens das perguntas desapareciam (banco esgotado → revisão das resolvidas); carros parados (bloqueio nos cruzamentos, depois outro com autocarros a virar); espreguiçadeira não deixava levantar/voltar a deitar (o toque acertava na própria espreguiçadeira); andar com o rato saltava para a piscina; xilofone a atravessar ruas; baloiço junto à rua; recintos colados à rua (candeeiro à frente da bilheteira).
- Subagentes (#SUB): personagens, concerto, espaço livre, trânsito, autocarro. Dois cortados pelo limite semanal — retomados com SendMessage depois do reset.
- Lições: (1) o HMR do Vite recarrega o browser de teste quando outros editam — desligar com stub de WebSocket no addInitScript; (2) heredocs com aspas partem no Git Bash — escrever partes com Write e montar com node; (3) o Telmo muda de ideias com o uso (sair da piscina: livre → obrigado a vestir) — perguntar pouco, ajustar depressa; (4) "não mexas no que não pedi" (reduzi 5→3 canções sem pedido).
- Commit sugerido (não feito — aguarda aprovação): `feat: concerto, piscina, autocarro, baloiço, Vega e Alice; trânsito sem bloqueios; Porto`.
- Step 8 (bootstrap) não aplicável: projeto de uma só janela.

## 2026-11-14 — sessão 3: casa, Tóquio, feira popular (#SS → #SEP)
- Novo: casa (house.ts) com 5 divisões e ~20 objetos ao toque, sofá/cadeiras/cama, cores da bandeira por país; Tóquio; feira popular (src/fair/) com 15 diversões desbloqueadas cidade a cidade (5 + nível).
- Base partilhada criada pelo master antes de delegar: items.ts (itens e acessórios), save.wear + Character.setWear, SwingSeat com stand/steer/done/lying, interact() pode recusar, world.clearArea (feira retira edifícios provisórios em cidades cheias).
- Subagentes (#SUB): rides.ts+ridekit.ts, games.ts, stalls.ts — todos testados; o master corrigiu os problemas de contrato que reportaram (Enter duplo nos carrinhos, buyTarget, compra durante uma diversão, unicórnio sem cabeça exposta).
- Lição: definir o contrato (types.ts + slots + helpers) ANTES de lançar subagentes paralelos funcionou bem — 3 agentes, 0 conflitos de ficheiros.
- Commit sugerido (não feito): "feat: casa, Tóquio, feira popular com 15 diversões e acessórios" (inclui o trabalho da sessão 2, ainda sem commit).

## 2026-11-15 — #SEP (reality-check, sem código novo)

- Esta janela só fechou. Zero alterações em `src/`. O jogo não foi aberto.
- Reality-check: `HEAD` = `origin/main` = `68e30da` (2026-11-14 09:03 UTC, Telmo Pereira da Silva). O commit já contém as sessões 2 e 3 (concerto, piscina, autocarro, casa, Tóquio, feira, +9942/−214 em 40 ficheiros) e os docs do #SEP de 2026-11-14. A frase "commit sugerido (não feito)" acima ficou velha no instante em que entrou nesse commit. O passado do log não se edita; a correção é esta entrada.
- ROADMAP: apagada a segunda tabela 🎯 NEXT (resto da sessão 1, com Lisboa e "testar a sessão toda"). Critical passou a 14 cidades e 12 personagens, como em `src/cities.ts` e `src/characters.ts`. NEXT #1 deixou de ser "aprovar o commit" e passou a "jogar e validar".
- Débitos que estavam só no CONTEXT entraram no plano: saves antigos (índice 9) e três limites sem data (pontas das ruas, bilhete do concerto, espectadores).
- `.tmp/`: ~378 capturas e scripts de QA, gitignored, zero `.md`. Nada a promover; ficam como debug. `Rainbow.code-workspace` continua untracked (atalho local para `-SKILLS_GLOBAL`).
- Passos 3 e 8 não aplicam: não há `docs/orchestration/LINEAGE.md`, e a sessão não entregou jogo (bootstrap fantasma).
- Lição: confirmar `git rev-parse HEAD` contra `origin/main` no fecho. O SESSION_LOG pode dizer "ainda sem commit" depois de esse texto já ter sido commitado.
- Capacity desta janela: baixa (só o fecho).

## 2026-11-15 — brief didático do Telmo (depois do #SEP, mesma janela)

- O Telmo reabriu a janela com um brief grande: objetivo didático, personagens e profissões com quem falar, energia e humor, notas, polícia, joias com uso, serviços pagos, escadas contra monstros, ex-líbris por cidade, cidades diferentes, casa maior, Nuuk a dobrar. Pediu 90 interações, 30 formas de ganhar e 50 de gastar para aprovar.
- **Decisão que inverte o plano:** sem mapas reais (grandes demais para as crianças). OSM, atribuição e morada de início passaram a ⛔ no ROADMAP; CLAUDE.md e a memória da stack foram corrigidos.
- Feito e verificado no browser (0 erros; `tsc` e `build` OK), por commitar: perguntas a 0,75; pernas para a frente ao sentar (era `-1,45` rad em vez de `+1,45`, em todos os assentos); som da chuva nas Definições; aterragem vista do lado de lá da pista; gato a passear (`wandercat.ts`); todas as personagens das perguntas passeiam.
- A aterragem foi resolvida com a câmara: o avião continua a voar para +X; a câmara passou para +Z, onde o ecrã-direita é +X, e fica dentro da faixa sem edifícios (z < 50).
- Propostas entregues num canvas com caixas de aceitar/recusar (`rainbow-propostas.canvas.tsx`); as escolhas ficam no `.canvas.data.json` ao lado. Nada do brief grande foi construído: espera aprovação.
- Assinalado ao Telmo: Super-Homem, Batman, Mulher-Maravilha, Homem-Aranha e Guardiões da Galáxia são marcas registadas; a proposta usa heróis originais, como a regra do projeto já pede.
- Não verificado: som real (voz mais lenta, volume da chuva) — o browser de teste não tem áudio.
- Mais tarde, na mesma janela, o Telmo definiu o final: penúltimo nível nos Estados Unidos (Estátua da Liberdade, ponte de São Francisco, Walt Disney World), sem aeroporto, com foguetão em Cabo Canaveral; último nível na Lua (crateras, moedas, subidas e descidas, areia, terra, rochas, pedras, marcianos que tiram moedas); o jogo acaba ao colocar os diamantes num local específico. Registado em CLAUDE.md, ROADMAP (v2.4) e CONTEXT; propostas US1–US9, LUA1–LUA6 e FIM1–FIM4 no canvas, mais três escolhas (posição de Nuuk, onde fica o palácio, quantos diamantes). Sem código. Assinalado: "Walt Disney World" e "Caesars Palace" são marcas; a frase "o Ceasars Pallace é na Lua" não ficou clara.
- Lição: no patchright, `page.evaluate` corre num mundo isolado; o que um `addInitScript` guarda em `window` não se lê de lá. Passar os dados por `document.documentElement.dataset`. E não reescrever scripts com `Get-Content`/`Set-Content` do PowerShell 5: estraga os acentos.

## 2026-11-17 — #SEP (ex-líbris + salão + folk)

- **Commit em main:** `d10eb65` — serviços cobertos, atrações por cidade, `replacesHair` no salão, folk fracos fora (sapateiro, juiz, contabilista, político, criadora, empregada). Cabeleireira folk mantida.
- **Decisões do Telmo:** arranque/morada fica; hotel EUA = réplica tipo Bellagio com nome original **Hotel das Fontes** (não Caesars / não Palácio das Luzes); Nuuk antes dos EUA (já no código, 16 níveis).
- **Working tree por commitar:** polish visual de landmarks + Estátua.
  - Melhorados: Londres (relógio∥roda ~38 m), Paris (torre de ferro), Pequim (muralha), Roma (Trevi), Varsóvia (Palácio da Cultura), Rio (Pão de Açúcar + teleférico 2 moedas), EUA (Estátua + Hotel das Fontes).
  - Removidos: obeliscos em Madrid/Vilnius/Moscovo/Cidade do México/Reiquiavique; trenó de Nuuk. Seis cidades sem ex-líbris.
- **Auditoria 3D:** bem = Clérigos, torii, barbacã, cultura (após polish), ponte/hotel/estátua EUA, torre Paris, Trevi, muralha, Rio. Fraco ainda = mercado/sereia/castelo/Łazienki Varsóvia. Genérico = (removido).
- **Parque Arco-Íris** = castelo de contos nos EUA (IP original, não Disney).
- Lições: (1) `takeSpot` com preference fraca (0.6) colapsa distância — usar strength alta + retry; (2) fotos «both-wide» enganam se a câmara empilha objetos — medir hypot no debug; (3) ROADMAP/CONTEXT estavam desatualizados (EUA→Lua já no código).
- `.tmp/`: dezenas de `qa-*-landmarks/paris/roma/...` png + mjs — debug, gitignored, nada a promover.
- Passos 3 e 8: N/A (sem LINEAGE).
- Capacity: alta (muitas ondas de polish visual + subagentes).

## 2026-11-19/20 — #SEP (Lua, perguntas, parque, lojas, SPA, feira; WIP por testar)

- **Commits em main = origin/main:** `ca1913c` (polish ex-líbris), `192551c` (Lua + 227 perguntas), `52ab1b0` (parque, lojas, massagem, SPA, feira, fotógrafo, bandeiras, trotinete), `cd46b39` (WIP: carta, macaca, borboletas, folk, padaria, muralha, Moscovo, estádio/moedas).
- **Decisões do Telmo:** joias para acabar = as trazidas + 10; área a dobrar ignorada; ex-líbris das cidades vazias "depois"; fim = máquina do tempo enterrada na Lua → Rainbow 2; energia na Lua só na nave; cometa a cada 5 min (1 min caída); visitantes da feira 0–12; fotos 1 moeda, quantas quiser.
- **Bugs encontrados e corrigidos:** altar da Lua impossível de tocar (raio 5 < vedação 5,5); escorrega do parque ao contrário (`rotation.x` −0,5→+0,5); braços da trotinete para trás (+X = para a frente, como as pernas ao sentar) e presos depois de sair; perguntas ignoradas de trotinete (`!scooting`); todas as bandeiras usavam o desenho da portuguesa; reload com a personagem caída bloqueava (TDZ ao chamar `knockDown` no arranque); falas importantes perdidas (`say` não interrompe → `speak`).
- **Não funcionou / lições:** (1) no patchright, `window.*` da página não se lê no `evaluate` — usar `document.body.dataset`; perdi tempo a achar que o parque não existia; (2) recintos grandes têm de ser colocados antes dos adereços espalhados, senão não há espaço (o parque só coube assim + `clearArea`); (3) 7 agentes em paralelo esgotaram o limite mensal da API e pararam todos a meio — o trabalho ficou nos ficheiros, sem testes. Lançar menos de cada vez quando o crédito é incerto.
- **Por testar:** tudo o que está no commit `cd46b39` (ver CONTEXT). Som e fps em tablet nunca validados.
- `.tmp/`: só capturas/scripts de QA, zero `.md` a promover. Passos 3 e 8 N/A (sem LINEAGE).
- Capacity: muito alta (muitas ondas + 10 subagentes); fecho a pedido do Telmo.

## 2026-11-21 — WIP terminado, Varsóvia, cidades diferentes, aurora (por commitar)

- **Feito e testado no browser:**
  - Botão **Cidade (testes)** nas ⚙ Definições (só dev/`?debug`); `jumpToCity`/`newGameAt` em main.ts.
  - Os 6 trabalhos WIP de `cd46b39` (carta, macaca/borboletas, folk, padaria/Muralha, Moscovo, estádio/moedas) — quase tudo já estava feito; corrigidos: macaca encravava com a pedra na casa 4/7, números escondidos, penso invisível (joelho → braço), baguetes, moeda inicial dentro de um objeto.
  - Varsóvia: castelo rodado 180°; joias do Castelo/Barbican/Palácio visíveis; escadas soltas do Palácio substituídas por escadaria; causa da cabeça cortada = a subida parada do Castelo puxava-a para o chão enquanto subia o Palácio (`activeClimb` em `towerClimb`). Clérigos re-testado.
  - Parque infantil 16 → 19 m de fundo (cerca a 3,45 m das escadas); SPA 10×8 → 13×11 m; rei com `notIn: ['Moscovo']`.
  - `CITY_WITHOUT` em cities.ts (Reiquiavique estádio — o bar fica —, Moscovo piscina, Tóquio feira, Vilnius concerto, Rio trotinete).
  - Aurora boreal em Reiquiavique (`src/aurora.ts`) + olhar para o céu ~7 s ao anunciá-la.
  - "Guarda-a para a Lua!" → "Guarda-a bem!" (a Lua é segredo).
- **Decisões do Telmo:** Lua é segredo até lá chegar; cidades diferentes entre si (lista acima).
- **Perguntas em aberto:** rei só em Londres? · tirar o bar de Reiquiavique? · commit + push?
- **Lições:** (1) os briefs dos agentes interrompidos estão nos transcripts `.jsonl` (input dos `Agent`) — deu para retomar sem perguntar; (2) 3 agentes de cada vez + "código e tsc primeiro, browser depois" chegou sem esgotar crédito; (3) no Git Bash, o node lê `/tmp` como `C:/tmp`.
- Clérigos: a vista do topo era uma câmara aérea que mostrava a própria torre; agora a câmara fica no varandim a olhar para o centro da cidade (testado).
- Não verificado: som, animações em movimento, toque, fps em tablet.

## 2026-11-21 — #SEP (fecho)

- **Commit em origin/main:** `2dcf258` (wip: tudo o que está na entrada anterior + rei/bar/pescador e escorregas a meio).
- **Depois do commit, testado e por commitar:**
  - Escorregas do parque: ela nunca saía do chão — as subidas paradas de outros sítios (`landmarks.ts`, `play.ts`, `usa.ts`) a puxavam para y=0 a cada frame; main.ts agora repõe a altura da diversão depois do ciclo dos interactables. Câmara própria de lado (`rainbow-aerial`), tubo transparente, buracos nas meias-paredes para a escada/rede.
  - Rei só em Londres (`onlyIn`); Reiquiavique sem estádio nem bar (`CITY_WITHOUT` + `withBar`); pescador em Reiquiavique (`src/folk/pescador.ts`, `extra` + `edge`).
- **Decisões do Telmo:** rei só em Londres; sem bar em Reiquiavique; um pescador num lado de Reiquiavique; Lua é segredo; commit + push mesmo com trabalho a meio (marcado `wip:`).
- **Lições:** (1) um agente deu os escorregas como "a funcionar" só pelos números do debug — o ecrã mostrava outra coisa; exigir sempre capturas da câmara do jogo em vários momentos; (2) várias "redes de segurança" por frame (puxar para o chão) lutam entre si — Varsóvia e o parque partiram pelo mesmo padrão; (3) commit com agentes a trabalhar mistura trabalho a meio — evitar ou marcar `wip:`.
- `.tmp/`: só capturas/scripts de QA, zero `.md` a promover. Passos 3 e 8 N/A (sem LINEAGE).
- Capacity: alta (≈14 agentes em ondas de 2–3; nenhum parou por crédito).

## 2026-11-21/22 — 2.º lote: Clérigos, Rio, aviador, Nuuk, tanque, EUA, Lua (por commitar)

- **Feito e testado no browser (capturas vistas):**
  - Torres (`towerClimb`, agora exportada): no topo arrastar/←→ roda a vista (`rainbow-aerial` com `turn`); tentar andar = descer (1.º passo apanha a joia). Causa: a câmara do topo era fixa e só o Enter descia.
  - Rio passou para `src/landmarks-rio.ts`: Urca baixa + Pão de Açúcar alto em "bala"; bondinho (entrar a andar / tocar / Enter; sobe 2 moedas, desce grátis); Cristo Redentor no Corcovado.
  - Aviador: é ela que lança o avião (o greetSpot apanhava o clique antes do aviador; o avião estava dentro do anel de afastamento).
  - Nuuk: sem feira (`CITY_WITHOUT`) + zona de neve `src/snowplay.ts` (bonecos, buracos no gelo com peixe, 6 crianças, ela atira bolas; a bola substitui o que tem na mão — `stowCarried` no GameCtx).
  - Moscovo: tanque em exibição (`landmarks-moscovo.ts`). EUA (`usa.ts`): escadas da Estátua certas + subida por `towerClimb` + tocha para cima; Hotel das Fontes com passeio em frente ao lago (o recinto era um único obstáculo).
  - Lua: fato espacial desde o foguetão (`launch.ts`, `characters.ts`, `character.ts`), Lua ±60 m (`MOON_HALF`), andar aos saltos 3,5 m/s, marcianos 2,6 m/s.
  - **Bug antigo corrigido:** "Continuar" com o jogo gravado na Lua deixava o ecrã azul — `quietTrouble` era `const` usada por `addCityExtras()` antes de existir (TDZ). Agora é `function`.
  - Sem energia: 4,7 m/s nas cidades (bichos 4,6), 2,6 m/s na Lua (`TIRED_WALK_SPEED`).
  - Bandeiras verificadas uma a uma (Reino Unido: diagonais desencontradas). `docs/matriz-cidades.md` criada (ex-líbris · atividades · objetos por cidade).
- **Decisões do Telmo:** Nuuk sem feira, com neve; a bola de neve substitui o que tem na mão; zona de neve fica onde está; sem energia = 4,7 m/s nas cidades; atualizar o CLAUDE.md.
- **Perguntas em aberto:** Lua sem energia 2,6 = marcianos (subir para 2,7?) · cimo do Pão de Açúcar: encostar na cabine já desce · Clérigos perto da borda do mapa · massagem/médico possivelmente duplicados · commit + push.
- **Lições:** (1) o `page.evaluate` do patchright corre num mundo isolado — para apanhar erros escondidos, gravar `window.onerror` num `dataset` do DOM via `addInitScript`; assim se encontrou o erro da Lua que não aparecia na consola; (2) um agente que diz "talvez seja a máquina lenta" sem prova — verificar logo (a página normal carregava em 8 s); (3) 3–4 agentes de cada vez, um ficheiro novo por agente quando o ficheiro grande está ocupado (Rio → `landmarks-rio.ts`), sem conflitos.
- Não verificado: unicórnio de fato, botão Casa na Lua, toque em tablet, som, fps.
- `.tmp/`: só capturas/scripts de QA (121 MB, ignorado pelo git), zero `.md` a promover. Passos 3 e 8 N/A (sem LINEAGE).

## 2026-11-22 — #SEP (fecho, depois das respostas do Telmo)

- **Feito e testado no browser:**
  - Lua sem energia 2,7 m/s (marcianos 2,6) — `TIRED_MOON_SPEED`; cidades 4,7 (bichos 4,6).
  - Pão de Açúcar: no cimo só desce com toque na cabine / Enter (até 6 m); encostar já não desce (`landmarks-rio.ts`, `TOP_TAP_R`).
  - Unicórnio de fato na Lua: capacete-bolha, mochila, manta (captura vista).
  - **Bug antigo corrigido:** botão Casa na Lua punha-a no centro da nave (dentro do obstáculo; câmara no casco). Agora fica 5,5 m ao lado, virada para a nave.
  - Som: verificado por intercetar `speechSynthesis.speak` e osciladores (o browser de testes não tem áudio) — narradora Helia pt-PT, som dos saltos, sons da UI. Volume/voz real só o Telmo confirma.
- **Em curso no fecho:** Torre dos Clérigos mais ao centro do Porto (agente a trabalhar em `src/landmarks.ts`; por verificar).
- **Decisões do Telmo:** Lua sem energia 2,7; Pão de Açúcar só desce com toque/Enter; Clérigos mais ao centro.
- **Lição:** o "som" testa-se em headless intercetando as chamadas (speech + AudioContext) num `dataset` do DOM; não substitui ouvir.

## 2026-11-26 — registo de IPs (#SS → #SEP)

- **Abertura:** o commit + push pendente já estava feito (`637812e`); o CONTEXT ainda o dava como pendente.
- **Pedido do Telmo:** guardar num `ip.txt` os IPs de quem joga ("para saber quem joga"; o jogo ainda não está divulgado, por isso a privacidade não se coloca, disse ele).
- **Feito e testado:**
  - `vite.config.js`: middleware no dev/preview que escreve no `ip.txt` cada abertura de página (só HTML, não cada ficheiro). Commit `eba7653`.
  - O jogo afinal está publicado na **Vercel** (https://rainbow-alpha-liard.vercel.app/, deploy a partir do GitHub), não no GitHub Pages. `api/visit.js` (função Node) grava um blob **privado** por visita em `visitas/` (data · IP · país · cidade · browser); `src/main.ts` chama-a só fora do dev; `scripts/ips.mjs` (`npm run ips`) junta tudo no `ip.txt` e mostra no terminal. `npm run dev` com `--host`. Commit `209289f`.
  - Testado em produção: deploy em ~30 s, função responde 204, `npm run ips` trouxe 3 visitas (o meu curl + 2 robôs da Vercel em San Jose).
- **Decisões do Telmo:** registar IPs também na versão publicada; dev aberto à rede.
- **Lições:** (1) perguntar onde está publicado antes de assumir — o ROADMAP dizia GitHub Pages; (2) o workspace tem vários projetos e o token foi parar ao `.env` do Bolsex — verificar o ficheiro no disco (tamanho/`grep -c`) em vez de confiar em "gravei"; (3) não mexer no `.env` de outro projeto: pedir ao Telmo para mover a linha; (4) um comando para o Telmo deve mostrar o resultado no ecrã, não só escrever num ficheiro.
- `.tmp/`: só capturas/scripts de QA, nada a promover. Passos LINEAGE/bootstrap N/A.

## 2026-11-27 — nomes das personagens (#SS → #SEP)

- **Pedido do Telmo:** Lia → Emma, Rita → Maria, Leonor → Íris.
- **Feito e testado:** só o campo `name` em `src/characters.ts` (os `id` — princesa, guerreira, voleibolista — ficam, por isso os saves continuam válidos); CLAUDE.md e ROADMAP atualizados. Ecrã de escolha visto no browser (`.tmp/qa-nomes.mjs`, `.tmp/nomes.png`), 0 erros na consola. A narradora lê o mesmo `name`.
- **Não verificado:** como soa "Emma" na voz pt-PT (o browser de testes não tem som).
- **Lição:** o QA local também escreve no `ip.txt` (HeadlessChrome em `::1`) — apagar essa linha depois do teste.
