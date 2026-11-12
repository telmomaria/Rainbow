# CONTEXT — Rainbow

> Substituído a 2026-11-12 pelo #SEP da sessão 1 (#NP → v1.8 + polimentos). Projeto de **uma só janela** (sem LINEAGE).
> Ler com [ROADMAP.md](ROADMAP.md) (🎯 NEXT canónico), [CLAUDE.md](CLAUDE.md) (regras de jogo) e [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D de exploração no browser para crianças de 7–8 anos (PT-PT). A criança escolhe uma de 10 personagens originais,
explora uma cidade (por agora um mundo provisório gerado, com grelha de ruas e prédios coloridos — o OSM real ainda não
está feito), apanha moedas e joias, responde a perguntas faladas, vive situações só por movimento (sem texto/pop-ups), e
aos 100 moedas vai ao aeroporto e voa para a cidade seguinte (13 cidades, Portugal → … → Nuuk).

## What works (verificado no browser via skill `browser-automation`, 0 erros de consola)

- **Stack:** Three.js 0.187 + Vite 8 + TypeScript strict · Web Speech API (pt-PT) · localStorage `rainbow.save.v1` · Open-Meteo · porta 1234.
- **Página principal** (select.ts): 10 personagens originais (characters.ts) · ▶ Continuar · ★ Novo jogo (pede confirmação) · ⚙ Definições
  (monstros Zero/Fácil/Médio/Difícil = ×0/×0.5/×1/×2). Abre no arranque e pelo botão-retrato em jogo (também no hospital; não durante voo/pergunta).
- **Controlos:** setas + rato/toque (clicar-para-andar, arrastar câmara, zoom); câmara não entra em edifícios; personagem nunca fica presa.
- **Economia/HUD:** moedas · joias · respostas certas; inventário lateral (pão, gelado, chocolate, chupa) — tocar num doce = comer, no pão = segurar.
- **Perguntas** (npcs.ts · questions.ts, 36 perguntas 2.º ano): faladas, 3 opções, botão repetir, hover lê a opção; errar não revela e volta ~3 min depois.
- **Monstros** (monsters.ts): quantidade = f(moedas) × dificuldade; o mesmo só tira moedas 2× seguidas; voz grave (masculina pt-PT se existir — Duarte no Edge).
- **Viagem** (airport.ts · flight.ts): porta do avião fechada até 100 moedas; bússola; cena: sobe, descola, nuvens, aterra, sai.
- **Situações por cidade (só movimento):** candeeiro, carro conduzível (porta abre, condutor visível; sair = Espaço/Enter/tocar), pobre (1 moeda),
  12 adereços (props.ts), gato na árvore (+5, cattree.ts), padaria (pão 2) → pombos, doces 3/2/1 (shops.ts — compra só com clique/Enter),
  adeptos do estádio (-20) e bar (-10) (trouble.ts), trânsito (traffic.ts) → atropelada -30 + hospital 5 min persistente (hospital.ts).
- **Tempo e luz:** tempo real por cidade + hora local (sunrise/sunset) via Open-Meteo (weather.ts); 114 candeeiros de rua acendem ao escurecer (streetlights.ts).
- **Outros:** botão Casa; pausa ao fim de 30 s parado; ícone estrela arco-íris + manifest (public/); posição/progresso gravados.
- **QA hooks (`?debug`):** `body[data-debug]` com estado; eventos `rainbow-teleport`, `rainbow-coins`, `rainbow-hospital-end`, `rainbow-aerial`;
  `?weather=<kind>`, `?hour=<h>`. Scripts de QA em `.tmp/qa*.mjs` (gitignored).

## What's broken / blocked / not verified

- **Mapa real OSM não existe** — as 13 cidades são o mundo provisório com seed/palete próprios. Fonte de dados por decidir (Overpass vs pré-processado).
- **Voz:** Windows só tem Helia (pt-PT feminina); voz masculina pt-PT só no Edge (Duarte). Opção futura: falas pré-gravadas em ficheiros.
- **Não verificado em jogo:** perseguição dos adeptos/empurrões no bar; chuva/neve/trovoada visualmente; viragens do trânsito nos cruzamentos; fps num tablet real.
- **Por afinar (reportado):** unicórnio a trepar a árvore fica estranho; bancas de doces muito encostadas à rua junto ao aeroporto; nuvens altas escuras à noite; sapato da princesa por baixo do vestido.

## Top pending (per ROADMAP §🎯 NEXT)

1. **Telmo testa a sessão toda no browser** (voz, dificuldade, situações, compras) — Telmo · S · none.
2. **Roupas e acessórios** para encontrar e trocar — agent · M · none.
3. **Spike OSM Lisboa** (ruas + edifícios low-poly com colisões) — agent · L · decidir fonte de dados.
4. **Morada de início nas Definições** — agent · M · spike OSM.
5. **Verificar o não-verificado** (adeptos, bar, tempo extremo, trânsito, fps tablet) — agent · S · none.

## Quick references

- **Dev server:** `npm run dev` → http://localhost:1234 (em 2026-11-12 estava a correr em background). 3333 = "Bolsex" e 8787 = "Bus·Porto" (outros projetos, não mexer).
- **Typecheck:** `npx tsc --noEmit` · **Build:** `npm run build`.
- **Repo:** https://github.com/telmomaria/Rainbow.git (branch `main`).
- **Capacity rule:** ≤70% strict close · 60% gate se polimento UX iterativo.
- **Subagentes:** briefar com âmbito de ficheiros explícito; no fim verificar `git diff` de ficheiros fora do âmbito (um alterou `SPAWN` fora do âmbito).

## File pointers

- [ROADMAP.md](ROADMAP.md) — 🎯 NEXT canónico · [CLAUDE.md](CLAUDE.md) — regras de jogo (fonte de verdade das mecânicas)
- [SESSION_LOG.md](SESSION_LOG.md) — histórico (append-only) · [AGENTS_v7.md](AGENTS_v7.md) — motor (first-run inerte)
- `src/main.ts` — orquestra tudo (GameCtx, ordem de construção da cidade, câmara, hospital, inventário); `src/gamectx.ts` — API para módulos.
