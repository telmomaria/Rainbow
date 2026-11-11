# ROADMAP — Rainbow

**Legend:** ✅ done · ⬜ to do · 🔄 in progress · ⛔ blocked / won't do

**Visual rule:** quando TODOS os items de uma secção (`##`/`###`/`####`) estão ✅ (zero ⬜),
envolver o título em `<span style="color:#4ade80">...</span>` para scan rápido.
Aplicar no Session End Protocol.

---

## 🎯 NEXT (max 5 actions · owner + blocker columns)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 1 | Telmo testa moedas + perguntas (voz, dificuldade, recompensas) e valida o banco de 36 perguntas em src/questions.ts | Telmo | none |
| 2 | Subida de nível aos 100 moedas → ecrã de viagem para a cidade seguinte | agent | none |
| 3 | Bichos maus (spawn em função das moedas, falam, empurram e fazem perder moedas) | agent | none |
| 4 | Spike OSM: carregar um quarteirão real (Lisboa) → ruas + edifícios low-poly com colisões | agent | decidir fonte de dados (Overpass vs pré-processado) |
| 5 | Seleção de personagem (1.ª personagem original modelada) | agent | none |

---

## 📋 Planned

### 🔴 Critical
- ⬜ Mundo OSM estilizado por cidade (13 cidades) com cache local dos dados
- ⬜ Morada de início nas Definições (geocoding com cache; respeitar política Nominatim)
- ⬜ Seleção de personagem: 10 personagens originais (princesa · unicórnio · 3 caçadoras-cantoras K-pop · extraterrestre · guerreira ~1500 d.C. · voleibolista · bailarina · karateca)
- 🔄 Personagens-NPC com perguntas — base feita (36 perguntas, voz, 3 opções, sem repetição); errar → volta em ~3 min sem revelar; falta banco maior e voz pt-PT garantida
- ⬜ Bichos maus: spawn em função das moedas, falam, atrapalham, batem (perde moedas)
- ⬜ Subida de nível aos 100 moedas → próxima cidade (Portugal → Roma → Madrid → Londres → Paris → Varsóvia → Vilnius → Moscovo → Pequim → Rio → Cidade do México → Reiquiavique → Nuuk)
- ⬜ Atribuição "© OpenStreetMap contributors" visível

### 🟡 Important
- ⬜ Interatividade sem UI: botão→luz, entrar/conduzir carro, dar moeda a um pobre, + outros objetos por cidade
- ⬜ Roupas e acessórios (óculos, chapéus) para encontrar e trocar
- ⬜ Áudio: músicas/sons originais por personagem e cidade
- ⬜ Desempenho ≥30 fps em tablet médio (LOD, instancing, culling)

### 🟢 Nice-to-have
- ⬜ Monumentos icónicos low-poly por cidade (Coliseu, Torre Eiffel, Big Ben…)
- ⬜ Mais bancos de perguntas / dificuldade adaptativa
- ⬜ Deploy estático (GitHub Pages)

---

## ✅ Completed (compressed)

- ✅ #NP — scaffold v7 gerado, stack decidida, repo ligado (2026-11-11)
- ✅ Bootstrap Vite 8 + Three.js 0.187 + TS, porta 1234; mundo placeholder; personagem placeholder (2026-11-11)
- ✅ Controlos setas + rato/toque (clicar-para-andar, arrastar câmara, roda/pinça zoom), colisões; candeeiro que acende ao tocar — verificado no browser (2026-11-11)
- ✅ Velocidade +30% (6,5 m/s); moedas (1) em rastos de 5 + joias (5) com respawn; contador; localStorage (2026-11-11)
- ✅ Perguntas faladas: 5 personagens com pergunta, 3 opções (clique · 1/2/3 · ←↑→), certo = +10, errado mostra a certa e a pergunta nunca se repete (2026-11-11)
- ✅ Contadores no ecrã: moedas · joias apanhadas · respostas certas (ícone ?), gravados em localStorage; áudio desbloqueado no 1.º gesto (2026-11-11)
- ✅ Errar não revela a resposta e a pergunta volta ~3 min depois; moedas mais espalhadas (36, rastos de 3); posição gravada (reload não volta ao início); THREE.Timer + PCFShadowMap (2026-11-11)

---

## v-Log

| v | Date | Summary |
|---|---|---|
| v1 | 2026-11-11 | #NP: scaffold, stack Three.js+Vite+TS, mapa OSM estilizado, regras de jogo e controlos (setas + rato) |
| v1.1 | 2026-11-11 | Bootstrap jogável: cena, personagem placeholder, setas + rato, colisões, 1.º objeto interativo |
| v1.2 | 2026-11-11 | Moedas, joias, contador, gravação; perguntas faladas com 3 opções |
| v1.3 | 2026-11-11 | Contadores de joias e respostas certas |
| v1.4 | 2026-11-11 | Repetir perguntas erradas mais tarde, moedas espalhadas, posição gravada |
