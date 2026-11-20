# CONTEXT — Rainbow

> Substituído a 2026-11-20 (#SEP). Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT). Personagens originais, moedas/joias, perguntas faladas, situações
por movimento. Aos 100 moedas → cidade seguinte. **Mundo gerado** (sem OSM). **16 níveis** em `src/cities.ts`:
Porto → … → Nuuk → Estados Unidos → Lua. Fim: máquina do tempo na Lua (joias trazidas + 10) → "Rainbow 2".

## What works (HEAD `cd46b39` = `origin/main`)

- **Testado no browser nesta sessão** (`ca1913c`, `192551c`, `52ab1b0`):
  - Lua: máquina do tempo enterrada (o vento revela-a), cápsula de comida na nave, cometa a cada 5 min (1 min caída), montanhas fora da zona jogável.
  - 227 perguntas (~65 por disciplina + 2–3 por cidade, `city`); polícia de Londres com 8 em inglês.
  - Parque infantil vedado (`playground.ts`): 2 escorregas (tubo corrigido), baloiço, carrossel, 2 molas.
  - Lojas com provador (`tryon.ts`): sapataria, chapelaria, roupa — experimentar, espelho, pagar.
  - Massagem (fica o tempo que quiser, energia aos poucos); SPA com roupão e água quente (`spa.ts`, `stay.ts`).
  - Feira 56×51 m, 4 mastros, 0–12 visitantes (`fair/visitors.ts`); câmara sem zoom nas diversões.
  - Fotógrafo 1 moeda/foto, quantas quiser; bandeiras reais (`flags.ts`); trotinete (braços, perguntas, reposição).
  - Página inicial com mais espaço entre personagens e botões.
- Stack: Three.js + Vite + TS · porta **1234** · `localStorage` · Web Speech pt-PT · Open-Meteo.

## What's broken / blocked

- **`cd46b39` é WIP por testar.** 6 agentes pararam a meio pelo limite mensal de gastos da API. O código compila; nada
  disto foi verificado no browser até ao fim:
  - carta lida ao tocar (`letters.ts`), lixo, caixa de correio — `postman.ts`, `props.ts`, `ui.ts`
  - macaca 1–10 como jogo + afastada das borboletas; borboletas novas — `play.ts`, `butterflies.ts`
  - avião de papel, ponte, penso, sopa — `folk/fantasia.ts`, `oficios1.ts`, `oficios2.ts`
  - padaria ("está mal", causa por confirmar) e Grande Muralha (sinal "ubom" + mais comprida) — `shops.ts`, `landmarks.ts`
  - Moscovo: baú + basílica (`landmarks-moscovo.ts`)
  - estádio com cores da bandeira + moedas fora do terreno — `trouble.ts`, `collectibles.ts`, `spawn.ts`, `world.ts`
- Sem ex-líbris: Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk (Moscovo em WIP).
- Som real e fps em tablet nunca validados (espelhos, visitantes e parque somam carga).

## Top pending

1. Retomar/terminar os 6 trabalhos WIP acima e testar cada um no browser (quando houver crédito na API).
2. Telmo joga a Lua, as lojas, o SPA e o parque com som e diz o que afinar.
3. Ex-líbris das cidades vazias (Telmo: "depois").
4. Medir fps num tablet médio.
5. Alinhar o ROADMAP com o código (o brief de 2026-11-15 ainda aparece como ⬜ em coisas já feitas).

## Quick references

- **Dev:** `npm run dev` → http://localhost:1234 · QA: `?debug`, `?hour=12`, `?weather=clear`
- QA events: `rainbow-teleport`, `rainbow-aerial`, `rainbow-comet`, `rainbow-life`, `rainbow-jewels`.
- Estado em `document.body.dataset.debug` (o `page.evaluate` do patchright corre num mundo isolado).
- `Rainbow.code-workspace` untracked — não commitar.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md)
- `src/moonplay.ts` · `src/playground.ts` · `src/tryon.ts` · `src/spa.ts` · `src/stay.ts` · `src/flags.ts` · `src/fair/visitors.ts`
