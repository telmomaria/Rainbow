# CONTEXT — Rainbow

> Substituído a 2026-11-17 (#SEP). Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT). Personagens originais, moedas/joias, perguntas faladas, situações por movimento. Aos 100 moedas → cidade seguinte. **Mundo gerado** (sem OSM). **16 níveis** em `src/cities.ts`: Porto → … → Nuuk → **Estados Unidos** → **Lua**. O jogo acaba no altar lunar ao entregar as joias que tinha ao chegar à Lua + 10 (`MOON_EXTRA_JEWELS`, decisão 2026-11-19).

## What works

- **HEAD commitado:** `d10eb65` em `origin/main` — serviços cobertos (salão/roupa/…), atrações por cidade (fotógrafo, manicure, spa, scooter, papagaio, coelho, cantor, carteiro, estátua viva…), cabelo do salão com `replacesHair`, folk fracos removidos.
- **`ca1913c` (2026-11-19):** polish de ex-líbris em `src/landmarks.ts` + `src/usa.ts` + docs.
  - Londres: relógio + roda separados (~38 m), modelos melhores.
  - Paris: torre de ferro legível; Pequim: muralha com torres; Roma: Fonte de Trevi; Varsóvia: Palácio da Cultura; Rio: Pão de Açúcar + teleférico pago (2 moedas).
  - EUA: Hotel das Fontes (inspirado Bellagio, IP original); Estátua da Liberdade coerente; Parque Arco-Íris = castelo de contos (não Disney).
  - Removidos obeliscos genéricos: Madrid, Vilnius, Moscovo, Cidade do México, Reiquiavique; Nuuk sem trenó (sem ex-líbris).
- Stack: Three.js + Vite + TS · porta **1234** · `localStorage` · Web Speech pt-PT · Open-Meteo.

## What's broken / blocked

- **Sem ex-líbris:** Madrid · Vilnius · Moscovo · Cidade do México · Reiquiavique · Nuuk.
- **Decidido 2026-11-19:** joias para acabar = as que tem + 10; área a dobrar: ignorada. Arranque/morada: **fica** (cancelada).
- **Varsóvia fraca ainda:** mercado+sereia, castelo, Łazienki, catedral (só cultura/barbacã fortes).
- Docs ROADMAP ainda marcam muito do brief como ⬜ embora grande parte já exista no código (energia/humor, joias, folk, serviços, EUA/Lua).
- Som real e fps tablet: por validar no dispositivo do Telmo.
- Saves pré-Tóquio (índice 9); chapéus/capa/arco; deploy.

## Top pending

1. ✅ Polish de landmarks/usa commitado (`ca1913c`).
2. Ex-líbris novos para as 6 cidades vazias (ou aceitar vazio) — Telmo decide.
3. ✅ Joias da Lua (+10) feito e testado; altar passou a reagir ao toque (raio 9 m — antes era impossível tocar-lhe).
4. Alinhar ROADMAP/CLAUDE com o código (EUA/Lua já existem).
5. Validar no browser com som (Telmo).

## Quick references

- **Dev:** `npm run dev` → http://localhost:1234
- **Atrações:** ver lista no #SEP 2026-11-17 / SESSION_LOG.
- **Primeiro passo da próxima janela:** ex-líbris das 6 cidades vazias (Telmo: "depois").
- `Rainbow.code-workspace` untracked — não commit.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md)
- `src/landmarks.ts` · `src/usa.ts` · `src/cities.ts` (16) · `src/salon.ts` · `src/moon.ts`
