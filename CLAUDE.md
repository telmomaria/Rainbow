# Rainbow — Project Rules

Jogo 3D de exploração no browser para crianças de 7–8 anos. A criança escolhe uma personagem, caminha
por cidades reais (estilizadas), apanha moedas e joias, responde a perguntas faladas e sobe de nível
de cidade em cidade. Ver [CONTEXT.md](CONTEXT.md) e [ROADMAP.md](ROADMAP.md).

## Stack
- **Three.js + Vite + TypeScript** — jogo web 3D, sem servidor (deploy estático).
- **Mapa:** dados reais do **OpenStreetMap** (ruas, edifícios) renderizados em estilo cartoon/low-poly.
  Nunca Google 3D Tiles (custo, sem colisões, pesado em tablet).
- **Voz:** Web Speech API (`speechSynthesis`, voz `pt-PT`). Fallback a definir se a voz pt-PT faltar no dispositivo.
- **Persistência:** `localStorage` (progresso, moedas, roupa, morada de início). Sem contas, sem dados pessoais.

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
- **Perguntas:** matemática · estudo do meio · português, nível 2.º ano (programa PT). Sempre 3 opções.
  Errou → aquela pergunta/personagem não se repete. Acertou → moedas.
- **Valores:** moeda = 1 · joia = 5 (e conta no contador de joias) · resposta certa = 10 (e conta no contador ?). Moedas aparecem em rastos de 5. Pergunta é retirada no momento em que é feita (recarregar a página não dá 2.ª tentativa).
- **Bichos maus:** quantidade/frequência escala com as moedas da personagem; falam e atrapalham; podem bater
  (perder moedas, nunca "morte" violenta — tom infantil).
- **Nível:** 100 moedas → próxima cidade. Ordem: Portugal (morada nas Definições) → Roma → Madrid → Londres →
  Paris → Varsóvia → Vilnius → Moscovo → Pequim → Rio de Janeiro → Cidade do México → Reiquiavique → Nuuk.
- **Personagens: só originais.** Arquétipos pedidos (princesa, unicórnio, 3 caçadoras-cantoras K-pop,
  extraterrestre fofo, guerreira de ~1500 d.C., jogadora de vólei, bailarina, karateca) com nomes, visual e
  música próprios — **nunca** personagens, nomes ou arte da Disney, de "KPop Demon Hunters" ou outra IP existente.
- **Atribuição OSM obrigatória** ("© OpenStreetMap contributors") visível no jogo (ex.: ecrã de créditos/definições).
- **Definition of done:** corre em `localhost:1234` sem erros na consola, testado no browser (skill `browser-automation`)
  e a ≥30 fps num tablet médio; validado pelo Telmo.

## Orchestration
- Projeto de **uma só janela** (sem orchestrator-lineage; `docs/orchestration/LINEAGE.md` só nasce na 1.ª passagem).
- `#SUB`-default para trabalho paralelo disjunto; 70% capacity gate (`session-end-protocol`).
- Lineage trindade: `docs/chat-records/` · `docs/diary/` · `docs/cave/`.

## Behaviour
- PT-PT por defeito.
- Pensar antes de sugerir; validar depois de alterações grandes; nunca declarar feito sem confirmação.
