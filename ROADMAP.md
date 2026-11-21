# ROADMAP — Rainbow

**Legend:** ✅ done · ⬜ to do · 🔄 in progress · ⛔ blocked / won't do

**Visual rule:** quando TODOS os items de uma secção (`##`/`###`/`####`) estão ✅ (zero ⬜),
envolver o título em `<span style="color:#4ade80">...</span>` para scan rápido.
Aplicar no Session End Protocol.

---

## 🎯 NEXT (max 5 actions · owner + blocker columns)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 1 | Commit + push do último lote (escorregas, rei só em Londres, Reiquiavique sem bar + pescador) | Telmo aprova | none |
| 2 | Telmo joga o que mudou (⚙ → Cidade): Varsóvia, Moscovo, parque, aurora, carta, macaca, folk; lista o que afinar | Telmo | none |
| 3 | Ex-líbris para Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk | Telmo decide | "depois" |
| 4 | Medir fps num tablet médio (espelhos, visitantes, parque, aurora) | Telmo + agent | tablet |
| 5 | Alinhar o ROADMAP com o código (brief 2026-11-15 com ⬜ já feitos) | agent | none |

---

## 📋 Planned

### 🔴 Critical
- ⛔ Mundo OSM estilizado por cidade — o Telmo decidiu a 2026-11-15 não usar mapas reais (grandes demais para as crianças); o mundo gerado fica
- ⛔ Morada de início nas Definições — cancelada (Telmo: spawn/arranque fica como está; sem address settings)
- ⬜ **Brief de 2026-11-15** (decidido pelo Telmo; os números propostos estão por aprovar no canvas, regras R01–R18):
  - ⬜ Indicadores de energia e de humor (5 caras; o humor desce um nível a cada 20 min de jogo); hospital grátis, serviços pagos
  - ⬜ Notas de 20 moedas (1 por cada 100 moedas) · joias com uso (banco e outros) · uma joia em cada ex-líbris
  - ⬜ Polícia que aparece raramente e faz uma pergunta simples (em inglês em Londres, 1.º ano) · perguntas do dia a dia
  - ⬜ Personagens com quem falar (elfo, fada, rei, feiticeiro, aviador, corredor, futebolista) e profissões — I04 heróis, I05 astronauta e I08 guardião removidos (pedido Telmo)
  - ⬜ Interações: pintar parede, carta nos correios, escorrega, bola, beber na fonte, praia, animais com som, pássaros, duplo clique apanha flor, dar flor
  - ⬜ Serviços pagos: cabeleireiro (escolher penteado), sapatos, roupa, acessórios, massagem, SPA
  - ⬜ Escadas em edifícios onde os monstros não sobem · gatinho na árvore com escada (o unicórnio voa) · palco para cantar e ganhar moedas
  - 🔄 Cidades com ex-líbris (2026-11-17): Porto Clérigos · Roma Trevi · Londres relógio+roda · Paris torre · Varsóvia×6 · Pequim muralha (~128 m, 7 torres) · Tóquio templo · Rio teleférico · Moscovo São Basílio · EUA×4. **Sem ex-líbris:** Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk. Área a dobrar: por confirmar (Lua / Nuuk / não). Traçados de rua ainda partilhados
  - 🔄 **Final do jogo (código existe):** Nuuk → EUA (Estátua, Ponte, Parque Arco-Íris, Hotel das Fontes; foguetão Cabo Canaveral) → Lua (altar + joias). Joias: as que tem + 10 (2026-11-19). Área a dobrar: ignorada. Morada/arranque: cancelada
  - ⬜ Casa mais alta e maior, vista também com a câmara normal (não só de cima)
- ✅ Seleção de personagem: 12 originais (Lia · Estrela · Bia, Nina, Inês · Zuca · Leonor · Rita · Clara · Tomás · Vega · Alice)
- 🔄 Personagens-NPC com perguntas — 227 perguntas (2026-11-19: ~65 por disciplina + 2–3 por cidade; polícia de Londres com 8 em inglês), voz, 3 opções; errar → volta em ~3 min sem revelar; falta voz pt-PT garantida
- ✅ Bichos maus: spawn em função das moedas, falam, atrapalham, batem (perde moedas)
- 🔄 Subida de nível aos 100 moedas → próxima cidade — viagem feita; 16 níveis até à Lua; cidades ainda partilham grelha (faltam traçados próprios). Ordem: Porto → … → Nuuk → Estados Unidos → Lua
- ⛔ Atribuição "© OpenStreetMap contributors" — sem dados OSM, não se aplica
- ⬜ Saves anteriores a Tóquio: o índice 9 recua uma cidade entre Rio e Nuuk (sem migração)

### 🟡 Important
- ✅ Interatividade sem UI: botão→luz, entrar/conduzir carro, dar moeda a um pobre, + 12 adereços por cidade
- ⬜ Roupas para encontrar e trocar fora da feira. A feira já grava acessórios (`save.wear`); chapéus, capa e arco por decidir
- ⬜ Áudio: músicas/sons originais por personagem e cidade
- ⬜ Desempenho ≥30 fps em tablet médio (LOD, instancing, culling)

### 🟢 Nice-to-have
- ⬜ Mais bancos de perguntas / dificuldade adaptativa
- ⬜ Deploy estático (GitHub Pages)
- ⬜ Limites conhecidos, sem data: autocarro não usa as pontas das ruas; bilhete do concerto não fica preso à sessão; espectadores atravessam-se

---

## <span style="color:#4ade80">✅ Completed (compressed)</span>

- ✅ #NP — scaffold v7 gerado, stack decidida, repo ligado (2026-11-11)
- ✅ Bootstrap Vite 8 + Three.js 0.187 + TS, porta 1234; mundo placeholder; personagem placeholder (2026-11-11)
- ✅ Controlos setas + rato/toque (clicar-para-andar, arrastar câmara, roda/pinça zoom), colisões; candeeiro que acende ao tocar — verificado no browser (2026-11-11)
- ✅ Velocidade +30% (6,5 m/s); moedas (1) em rastos de 5 + joias (5) com respawn; contador; localStorage (2026-11-11)
- ✅ Perguntas faladas: 5 personagens com pergunta, 3 opções (clique · 1/2/3 · ←↑→), certo = +10, errado mostra a certa e a pergunta nunca se repete (2026-11-11)
- ✅ Contadores no ecrã: moedas · joias apanhadas · respostas certas (ícone ?), gravados em localStorage; áudio desbloqueado no 1.º gesto (2026-11-11)
- ✅ Errar não revela a resposta e a pergunta volta ~3 min depois; moedas mais espalhadas (36, rastos de 3); posição gravada (reload não volta ao início); THREE.Timer + PCFShadowMap (2026-11-11)
- ✅ Viagem aos 100 moedas (ecrã + chegada falada, 13 cidades, nome da cidade no canto) e bichos maus (perseguem, provocam, empurram, -3 moedas) (2026-11-11)
- ✅ Aeroporto + voo animado entre cidades; voz masculina p/ monstros quando existe; ícone (estrela arco-íris) + manifest; botão Casa (2026-11-11)
- ✅ 10 personagens originais + ecrã de escolha; carro conduzível; pobre; 12 adereços interativos (2026-11-11)
- ✅ Gato na árvore, carro com porta/condutor visível, padaria+pombos, doces, adeptos, bar, trânsito+hospital, tempo real, ecrã inicial, definições, pausa por inatividade (2026-11-11)
- ✅ Compras só com clique/Enter, inventário lateral, definições no ecrã inicial, luz pela hora local + candeeiros de rua (2026-11-11)
- ✅ Casa com 5 divisões e objetos interativos (cores da bandeira), Tóquio, feira popular com 15 diversões e acessórios gravados (2026-11-14)
- ✅ Concerto de 20 em 20 min (contagem, público e artistas entram/saem), piscina (cabines, 3 estilos, espreguiçadeiras), autocarro com paragens e linhas, baloiço montável, Vega e Alice, trânsito sem bloqueios, primeira cidade = Porto (2026-11-14)
- ✅ Página principal acessível em jogo (também no hospital), ⚙ Definições com Zero/Fácil/Médio/Difícil, Novo jogo com confirmação (2026-11-12)
- ✅ Perguntas lidas devagar (0,75), pernas para a frente ao sentar, som da chuva nas Definições (Sem som/Médio/Normal), aterragem vista do lado de lá da pista, gato a passear, ninguém parado na rua (2026-11-15)
- ✅ Serviços cobertos + salão `replacesHair` + atrações por cidade + folk fracos removidos (`d10eb65`, 2026-11-17)
- ✅ Ex-líbris polish (`ca1913c`, 2026-11-19)
- ✅ Lua: máquina do tempo → Rainbow 2, joias +10, cápsula na nave, cometas; 227 perguntas (`192551c`, 2026-11-19)
- ✅ Parque infantil, lojas com provador, massagem, SPA, feira 0–12 visitantes, fotógrafo, bandeiras reais, trotinete (`52ab1b0`, 2026-11-19)
- ✅ WIP de `cd46b39` terminado e testado (2026-11-21): carta/caixa de correio/caixotes, macaca + borboletas, avião de papel/ponte/penso/sopa, padaria + Muralha + gongo, Moscovo (São Basílio + baú), estádios nas cores da bandeira, moedas dentro do chão
- ✅ Cidade (testes) nas Definições; Varsóvia (castelo, joias, escadaria do Palácio, `activeClimb`); parque 20×19 com escadas acessíveis; SPA 13×11; rei fora de Moscovo; `CITY_WITHOUT` (5 cidades); aurora boreal em Reiquiavique; joias sem spoiler da Lua (2026-11-21, `2dcf258`)
- ✅ Escorregas do parque a sério (subir, sentar, deslizar, câmara de lado); rei só em Londres; Reiquiavique sem bar + pescador (2026-11-21, por commitar)

---

## v-Log

| v | Date | Summary |
|---|---|---|
| v1 | 2026-11-11 | #NP: scaffold, stack Three.js+Vite+TS, mapa OSM estilizado, regras de jogo e controlos (setas + rato) |
| v1.1 | 2026-11-11 | Bootstrap jogável: cena, personagem placeholder, setas + rato, colisões, 1.º objeto interativo |
| v1.2 | 2026-11-11 | Moedas, joias, contador, gravação; perguntas faladas com 3 opções |
| v1.3 | 2026-11-11 | Contadores de joias e respostas certas |
| v1.4 | 2026-11-11 | Repetir perguntas erradas mais tarde, moedas espalhadas, posição gravada |
| v1.5 | 2026-11-11 | Viagem entre cidades aos 100 moedas; bichos maus |
| v1.6 | 2026-11-11 | Aeroporto e voo, ícone, Casa, 10 personagens, carro, pobre, 12 adereços |
| v1.7 | 2026-11-11 | Cidade viva: lojas, pombos, adeptos, bar, trânsito, hospital, tempo real, gato na árvore; ecrã inicial e definições |
| v1.8 | 2026-11-11 | Compra por clique, inventário, definições no início, dia/noite real com candeeiros |
| v2.7 | 2026-11-21 | WIP terminado e testado; botão Cidade (testes); Varsóvia corrigida; parque, SPA, rei; cidades sem estádio/piscina/feira/concerto/trotinete; aurora boreal |
| v2.6 | 2026-11-20 | #SEP: Lua (máquina do tempo), 227 perguntas, parque, lojas com provador, SPA, feira, bandeiras; WIP interrompido pelo limite da API |
| v2.5 | 2026-11-17 | #SEP: polish ex-líbris (Londres/Paris/Pequim/Roma/Cultura/Rio/Estátua); Hotel das Fontes; obeliscos removidos; salão `replacesHair` já em `d10eb65` |
| v2.4 | 2026-11-15 | Final do jogo definido pelo Telmo: EUA (Cabo Canaveral) → Lua → entregar os diamantes; propostas US/LUA/FIM no canvas |
| v2.3 | 2026-11-15 | Brief didático do Telmo: sem mapas reais; 6 correções feitas; propostas (90/30/50, joias, ex-líbris, regras) à espera de aprovação |
| v2.2 | 2026-11-15 | #SEP: `68e30da` já em origin/main; NEXT duplicado (Lisboa) removido; 14 cidades e 12 personagens alinhados com o código |
| v2.1 | 2026-11-14 | Sessão 3: casa, Tóquio, feira popular (15 diversões), acessórios (#SEP) |
| v2.0 | 2026-11-14 | Sessão 2: concerto, piscina, autocarro, baloiço, 12 personagens, trânsito corrigido, Porto (#SEP) |
| v1.9 | 2026-11-12 | Menu principal em jogo, Definições (Zero…Difícil), confirmação de Novo jogo — fecho da sessão 1 (#SEP) |
