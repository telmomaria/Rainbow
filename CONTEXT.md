# CONTEXT — Rainbow

> Gerado a 2026-11-11 pelo #NP (motor `AGENTS_v7.md`, first-run). Projeto de uma só janela. Ler com [ROADMAP.md](ROADMAP.md) e [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D de exploração no browser para crianças de 7–8 anos. A criança escolhe uma de 10 personagens originais e
caminha por cidades reais (dados OpenStreetMap, estilo cartoon), começando numa morada em Portugal definida nas
Definições. Apanha moedas e joias, encontra personagens com perguntas faladas (matemática, estudo do meio,
português; 3 opções; erro não repete; acerto dá moedas), foge de bichos maus que aumentam com as moedas, e
descobre objetos interativos sem qualquer UI indicadora. Aos 100 moedas passa para a cidade seguinte (13 no total).
Pelo caminho encontra roupas e acessórios para trocar.

## What works

- **Stack:** Three.js + Vite + TypeScript · mapa OSM estilizado · Web Speech API pt-PT · localStorage · porta 1234.
- **Scaffold v7** gerado (CLAUDE.md, ROADMAP, memory/, docs trindade, SKILLS/, .gitignore, .env.example, .mcp.json vazio).
- **Bootstrap jogável:** cena placeholder, personagem placeholder, setas + rato/toque, colisões, candeeiro interativo (src/main.ts · input.ts · character.ts · world.ts). `?debug` expõe estado em `body[data-debug]` para QA no browser.

## What's broken / blocked

- **Fonte de dados OSM** por decidir (Overpass ao vivo vs dados pré-processados por cidade) — decide-se no spike (ROADMAP #3).

## Top pending (per ROADMAP §🎯 NEXT)

1. **Telmo testa moedas + perguntas** — Telmo · S · none.
2. **Subida de nível + bichos maus** — agent · M · none.
3. **Spike OSM Lisboa** — agent · M · fonte de dados.

## Quick references

- **Dev server:** `npm run dev` → http://localhost:1234 
- **Repo:** https://github.com/telmomaria/Rainbow.git
- **Capacity rule:** ≤70% strict close · 60% gate se polimento UX iterativo
- Regras de jogo, controlos e IP das personagens: [CLAUDE.md](CLAUDE.md) §Project-specific conventions

## File pointers

- [ROADMAP.md](ROADMAP.md) — 🎯 NEXT canónico
- [CLAUDE.md](CLAUDE.md) — regras do projeto
- [AGENTS_v7.md](AGENTS_v7.md) — motor (bootstrap; first-run agora inerte)
- [SESSION_LOG.md](SESSION_LOG.md) — histórico de sessões (append-only)

## Session log

| Date | What was done |
|---|---|
| 2026-11-11 | #NP: interrogatório, stack escolhida, scaffold gerado, repo ligado |
