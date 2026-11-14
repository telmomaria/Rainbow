# CONTEXT — Rainbow

> Substituído a 2026-11-14 pelo #SEP da sessão 3 (v2.0 → v2.1). Projeto de **uma só janela** (sem LINEAGE).
> Ler com [ROADMAP.md](ROADMAP.md) (🎯 NEXT canónico), [CLAUDE.md](CLAUDE.md) (regras de jogo — fonte de verdade) e [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D de exploração no browser para crianças de 7–8 anos (PT-PT). A criança escolhe uma de 12 personagens originais,
explora uma cidade (mundo provisório gerado — o OSM real ainda não está feito), apanha moedas e joias, responde a perguntas
faladas, vive situações só por movimento (sem texto/pop-ups) e aos 100 moedas voa para a cidade seguinte (14 cidades, Porto → … → Tóquio → … → Nuuk).

## What works (verificado no browser via `browser-automation`, 0 erros de consola; `npm run build` OK)

- **Stack:** Three.js 0.187 + Vite 8 + TypeScript strict · Web Speech API (pt-PT) · localStorage `rainbow.save.v1` · Open-Meteo · porta 1234.
- **Tudo da sessão 1** (personagens, perguntas, monstros, voo, lojas, adeptos/bar, trânsito/hospital, tempo real, candeeiros, menu/Definições).
- **Novo na sessão 2:**
  - **12 personagens:** + Vega (astronauta) e Alice (cores de Tenniel 1890, domínio público — nunca o visual Disney). Grelha 6×2.
  - **Perguntas:** ~metade das personagens passeia; depois de responder acenam e vão-se embora a pé; quando acabam as por resolver, as resolvidas voltam como revisão.
  - **Concerto** (concert.ts): a cada 20 min pelo relógio (:00/:20/:40), 5 canções de domínio público sintetizadas, contagem decrescente no último minuto (números luminosos + voz), público entra/sai a pé, artistas só em palco durante o espetáculo, bilheteira com horário.
  - **Piscina** (pool.ts): bilhete, cabines para trocar de roupa (sair exige vestir-se), nadar (crawl/costas/bruços com duplo toque/Espaço), espreguiçadeiras, 1–8 visitantes que circulam.
  - **Recintos** (venue.ts): bilheteira+portão+porteiro partilhados; recuados ~10 m da rua; ≥3 m livres à volta.
  - **Autocarro** (busstops.ts + traffic.ts): 3 paragens, 4 autocarros em 2 linhas pela cidade toda, 1 moeda, viagem à janela, sair na paragem.
  - **Trânsito:** bloqueio nos cruzamentos corrigido (caminho real, prioridade por chegada, watchdog).
  - **Baloiço** montável (clique); adereços de brincar a ≥4 m da rua; nada colado a edifícios (≥2,3 m medidos nas 13 cidades).
  - **Casa** funciona no hospital (sai do hospital). Primeira cidade = **Porto**.
- **Novo na sessão 3:**
  - **Casa** (house.ts): hall, cozinha, sala de estar/jantar, casa de banho, quarto; ~20 objetos ao toque; sofá/cadeiras/cama; pintada com as cores da bandeira do país.
  - **Tóquio** entre Pequim e Rio (14 cidades).
  - **Feira popular** (src/fair/): 5 + nível diversões (máx. 15): carrossel, choque, montanha-russa, river ride, bolas→peluches, arco, trampolim, insuflável, pipocas, cachorros, pinturas faciais, bijuteria, artesanato, roupa, balões. Base partilhada: items.ts (itens/acessórios registáveis), save.wear, SwingSeat com stand/steer/done, interact() pode recusar.
- **QA hooks (`?debug`):** `body[data-debug]` (+ `concert`, `pool`, `riding`, bus), `body[data-traffic]`; eventos `rainbow-teleport`, `rainbow-coins`,
  `rainbow-hospital-end`, `rainbow-aerial`, `rainbow-concert-time`; `?weather=`, `?hour=`. Scripts em `.tmp/qa*.mjs` (gitignored) — desligar o HMR do Vite no browser de teste (stub de WebSocket, ver `.tmp/qa32.mjs`).

## What's broken / blocked / not verified

- **Mapa real OSM não existe** — fonte de dados por decidir (Overpass vs pré-processado).
- **Não reproduzido:** Telmo ouviu "Vamos explorar Portugal" estando em Paris — só acontece em "Novo jogo" ou ao aterrar; pedir os passos se voltar.
- **Não verificado:** som real (música, voz) num browser com áudio; fps num tablet (agora há 4 autocarros, 50+ pessoas no concerto, piscina); personagens a ir-se embora e artistas a sair (lógica feita, sem confirmação visual).
- **Decisões em aberto:** Casa no hospital encurta o castigo de 5 min (pedido pelo Telmo); carros esperam/buzinam atrás do carro dela parado na estrada enquanto ela está a <25–40 m.
- **Feira por afinar:** chapéus tapam coroa/laço; capa atravessa a mochila da astronauta; sem gesto de atirar/puxar o arco.
- **Mudança de saves:** Tóquio entrou no índice 9 — saves entre Rio e Nuuk recuam uma cidade.
- **Limitações conhecidas:** autocarros não usam as pontas das ruas; bilhete do concerto não fica preso a uma sessão; espectadores atravessam-se uns aos outros.

## Top pending (per ROADMAP §🎯 NEXT)

1. **Telmo testa as sessões 2 e 3** (+ casa, Tóquio, feira) e aprova o commit — Telmo · S · none.
2. **Medir fps em tablet** (feira com 15 diversões + concerto + piscina + casa + 4 autocarros) e otimizar — agent · M · none.
3. **Spike OSM (Porto)** — agent · L · decidir fonte de dados.
4. **Roupas e acessórios** para encontrar e trocar — agent · M · none.
5. **Morada de início nas Definições** — agent · M · spike OSM.

## Quick references

- **Dev server:** `npm run dev` → http://localhost:1234. 3333 = "Bolsex", 8787 = "Bus·Porto" (outros projetos, não mexer).
- **Typecheck:** `npx tsc --noEmit` · **Build:** `npm run build`.
- **Repo:** https://github.com/telmomaria/Rainbow.git (branch `main`). **Sessões 2 e 3 ainda sem commit** (ver mensagem sugerida no SESSION_LOG).
- **Capacity rule:** ≤70% strict close.
- **Subagentes:** briefar com âmbito de ficheiros explícito; o limite semanal da conta pode cortá-los — retomar com SendMessage depois do reset.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md) (append-only) · [AGENTS_v7.md](AGENTS_v7.md) (motor)
- `src/main.ts` — orquestra tudo (GameCtx, ordem de construção, câmara, hospital, inventário, baloiço, autocarro); `src/venue.ts` — recintos com bilhete.
