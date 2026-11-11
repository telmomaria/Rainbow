# ROADMAP — Rainbow

**Legend:** ✅ done · ⬜ to do · 🔄 in progress · ⛔ blocked / won't do

**Visual rule:** quando TODOS os items de uma secção (`##`/`###`/`####`) estão ✅ (zero ⬜),
envolver o título em `<span style="color:#4ade80">...</span>` para scan rápido.
Aplicar no Session End Protocol.

---

## 🎯 NEXT (max 5 actions · owner + blocker columns)

| # | Action | Owner | Blocker |
|---|---|---|---|
| 1 | Bootstrap Vite + Three.js + TS na porta 1234 (cena vazia, câmara 3.ª pessoa) | agent | none |
| 2 | Controlos: setas + rato (clicar-para-andar, arrastar câmara) com uma personagem placeholder | agent | #1 |
| 3 | Spike OSM: carregar um quarteirão real (Lisboa) → ruas + edifícios low-poly com colisões | agent | #1 · decidir fonte de dados (Overpass vs tiles vetoriais pré-processados) |
| 4 | Moedas/joias no mapa + contador + gravação em localStorage | agent | #2 |
| 5 | Perguntas faladas (Web Speech pt-PT) com 3 opções; banco inicial ~30 perguntas 2.º ano | agent + Telmo (validar perguntas) | #2 |

---

## 📋 Planned

### 🔴 Critical
- ⬜ Mundo OSM estilizado por cidade (13 cidades) com cache local dos dados
- ⬜ Morada de início nas Definições (geocoding com cache; respeitar política Nominatim)
- ⬜ Seleção de personagem: 10 personagens originais (princesa · unicórnio · 3 caçadoras-cantoras K-pop · extraterrestre · guerreira ~1500 d.C. · voleibolista · bailarina · karateca)
- ⬜ Personagens-NPC aleatórias com perguntas (matemática · estudo do meio · português); erro = não repete; acerto = moedas
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

---

## v-Log

| v | Date | Summary |
|---|---|---|
| v1 | 2026-11-11 | #NP: scaffold, stack Three.js+Vite+TS, mapa OSM estilizado, regras de jogo e controlos (setas + rato) |
