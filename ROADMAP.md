# ROADMAP — Rainbow

**Legend:** ✅ done · ⬜ to do · 🔄 in progress · ⛔ blocked / won't do

**Visual rule:** quando TODOS os items de uma secção (`##`/`###`/`####`) estão ✅ (zero ⬜),
envolver o título em `<span style="color:#4ade80">...</span>` para scan rápido.
Aplicar no Session End Protocol.

---

## 🎯 NEXT (max 5 actions · owner + blocker columns)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 1 | Telmo aprova as propostas de 2026-11-15 (90 interações · 30 ganhar · 50 gastar · joias · ex-líbris · 18 regras · EUA e Lua com 3 escolhas) na página `rainbow-propostas.canvas.tsx` (pasta `canvases` do projeto no Cursor; as escolhas ficam em `rainbow-propostas.canvas.data.json`) | Telmo | none |
| 2 | Telmo joga e valida as 6 correções de 2026-11-15 (por commitar) e as sessões 2–3 (`68e30da`) | Telmo | none |
| 3 | Fase 1 do brief: energia, humor, notas, joias com uso, duplo clique e dar | agent | #1 |
| 4 | Fases 2–6 do brief, por esta ordem: personagens/profissões/polícia/perguntas do dia a dia → brincar/criar/natureza/escadas → serviços e lojas → cidades diferentes com ex-líbris, casa maior → EUA com Cabo Canaveral, Lua e final com os diamantes | agent | #1 |
| 5 | Medir fps em tablet (feira, concerto, piscina, casa, autocarros); afinar chapéus, capa e gesto do arco | agent | none |

---

## 📋 Planned

### 🔴 Critical
- ⛔ Mundo OSM estilizado por cidade — o Telmo decidiu a 2026-11-15 não usar mapas reais (grandes demais para as crianças); o mundo gerado fica
- ⛔ Morada de início nas Definições — dependia do mapa real; parada até o Telmo dizer se ainda a quer noutra forma
- ⬜ **Brief de 2026-11-15** (decidido pelo Telmo; os números propostos estão por aprovar no canvas, regras R01–R18):
  - ⬜ Indicadores de energia e de humor (5 caras; o humor desce um nível a cada 20 min de jogo); hospital grátis, serviços pagos
  - ⬜ Notas de 20 moedas (1 por cada 100 moedas) · joias com uso (banco e outros) · uma joia em cada ex-líbris
  - ⬜ Polícia que aparece raramente e faz uma pergunta simples (em inglês em Londres, 1.º ano) · perguntas do dia a dia
  - ⬜ Personagens com quem falar (elfo, fada, rei, feiticeiro, aviador, corredor, futebolista) e profissões — I04 heróis, I05 astronauta e I08 guardião removidos (pedido Telmo)
  - ⬜ Interações: pintar parede, carta nos correios, escorrega, bola, beber na fonte, praia, animais com som, pássaros, duplo clique apanha flor, dar flor
  - ⬜ Serviços pagos: cabeleireiro (escolher penteado), sapatos, roupa, acessórios, massagem, SPA
  - ⬜ Escadas em edifícios onde os monstros não sobem · gatinho na árvore com escada (o unicórnio voa) · palco para cantar e ganhar moedas
  - ⬜ Cidades diferentes entre si, cada uma com os seus ex-líbris e algo para fazer em cada um · último nível com o dobro da área (pedido para Nuuk; por confirmar se passa para a Lua)
  - ⬜ **Final do jogo:** penúltimo nível = Estados Unidos (Estátua da Liberdade, ponte de São Francisco, parque de diversões; sem aeroporto, foguetão em Cabo Canaveral) → último nível = Lua (crateras, moedas, subidas e descidas, areia, rochas, marcianos que tiram moedas) → colocar os diamantes num local específico termina o jogo. Por decidir: posição de Nuuk, onde fica o palácio, quantos diamantes, nomes originais para o parque e o palácio (canvas, separador "EUA e Lua")
  - ⬜ Casa mais alta e maior, vista também com a câmara normal (não só de cima)
- ✅ Seleção de personagem: 12 originais (Lia · Estrela · Bia, Nina, Inês · Zuca · Leonor · Rita · Clara · Tomás · Vega · Alice)
- 🔄 Personagens-NPC com perguntas — base feita (36 perguntas, voz, 3 opções, sem repetição); errar → volta em ~3 min sem revelar; falta banco maior e voz pt-PT garantida
- ✅ Bichos maus: spawn em função das moedas, falam, atrapalham, batem (perde moedas)
- 🔄 Subida de nível aos 100 moedas → próxima cidade — viagem feita; as cidades ainda só diferem na palete (faltam traçados próprios e ex-líbris). Porto → Roma → Madrid → Londres → Paris → Varsóvia → Vilnius → Moscovo → Pequim → Tóquio → Rio de Janeiro → Cidade do México → Reiquiavique → Nuuk
- ⛔ Atribuição "© OpenStreetMap contributors" — sem dados OSM, não se aplica
- ⬜ Saves anteriores a Tóquio: o índice 9 recua uma cidade entre Rio e Nuuk (sem migração)

### 🟡 Important
- ✅ Interatividade sem UI: botão→luz, entrar/conduzir carro, dar moeda a um pobre, + 12 adereços por cidade
- ⬜ Roupas para encontrar e trocar fora da feira. A feira já grava acessórios (`save.wear`); chapéus, capa e arco ficam no NEXT #4
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
- ✅ Perguntas lidas devagar (0,75), pernas para a frente ao sentar, som da chuva nas Definições (Sem som/Médio/Normal), aterragem vista do lado de lá da pista, gato a passear, ninguém parado na rua — verificado no browser, por commitar (2026-11-15)

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
| v2.4 | 2026-11-15 | Final do jogo definido pelo Telmo: EUA (Cabo Canaveral) → Lua → entregar os diamantes; propostas US/LUA/FIM no canvas |
| v2.3 | 2026-11-15 | Brief didático do Telmo: sem mapas reais; 6 correções feitas; propostas (90/30/50, joias, ex-líbris, regras) à espera de aprovação |
| v2.2 | 2026-11-15 | #SEP: `68e30da` já em origin/main; NEXT duplicado (Lisboa) removido; 14 cidades e 12 personagens alinhados com o código |
| v2.1 | 2026-11-14 | Sessão 3: casa, Tóquio, feira popular (15 diversões), acessórios (#SEP) |
| v2.0 | 2026-11-14 | Sessão 2: concerto, piscina, autocarro, baloiço, 12 personagens, trânsito corrigido, Porto (#SEP) |
| v1.9 | 2026-11-12 | Menu principal em jogo, Definições (Zero…Difícil), confirmação de Novo jogo — fecho da sessão 1 (#SEP) |
