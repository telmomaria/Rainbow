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
