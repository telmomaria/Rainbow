# CONTEXT — Rainbow

> Substituído a 2026-11-15, depois do #SEP e do brief didático do Telmo no mesmo dia. Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) (🎯 NEXT), [CLAUDE.md](CLAUDE.md) (regras) e [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT), com objetivo didático: raciocínio, aventura, curiosidade, criatividade. 12 personagens originais, moedas e joias, perguntas faladas, situações só por movimento. Aos 100 moedas, voo para a cidade seguinte. 14 cidades em `src/cities.ts`: Porto → Roma → Madrid → Londres → Paris → Varsóvia → Vilnius → Moscovo → Pequim → Tóquio → Rio de Janeiro → Cidade do México → Reiquiavique → Nuuk.

**O mundo é gerado e assim fica: sem mapas reais** (decisão do Telmo, 2026-11-15; o OpenStreetMap saiu do plano).

**Final do jogo (decisão do Telmo, 2026-11-15, por construir):** penúltimo nível = Estados Unidos, com atrações de várias cidades e Cabo Canaveral em vez de aeroporto → foguetão → Lua, o último nível (crateras, moedas, rochas, marcianos que tiram moedas). O jogo acaba quando ela coloca os diamantes (as joias) num local específico. Hoje o código acaba em Nuuk com um ecrã final.

## What works

`main` = `origin/main` = `68e30da` (2026-11-14). Por cima disso há trabalho de 2026-11-15 **por commitar**.

- **Stack:** Three.js 0.187 + Vite 8 + TypeScript strict · Web Speech (pt-PT) · `localStorage` `rainbow.save.v1` · Open-Meteo · porta 1234.
- **Em `68e30da`:** perguntas, monstros, voo, lojas, adeptos/bar, trânsito/hospital, tempo real, candeeiros, menu e Definições; Vega e Alice; concerto; piscina; recintos; autocarro; baloiço; casa; Tóquio; feira (5 + nível, máx. 15, `save.wear`).
- **Feito a 2026-11-15** (`npx tsc --noEmit` e `npm run build` OK; verificado no browser headless, 0 erros de consola):
  - Perguntas e respostas lidas a 0,75 (`QUESTION_RATE` em `src/audio.ts`); o resto da narração continua a 0,95.
  - Sentada, as pernas ficam para a frente (`src/character.ts`; estavam viradas para as costas em todos os assentos).
  - Definições com "Som da chuva": Sem som / Médio / Normal (`save.rainSound`, `weather.rainVolume`).
  - Aterragem filmada do lado de lá da pista: terminal e torre atrás, avião da esquerda para a direita (`src/flight.ts`). O avião voa no mesmo sentido; mudou a câmara.
  - Gato cinzento a passear pelos passeios (`src/wandercat.ts`): para, mia e dá um saltinho quando ela chega perto.
  - Todas as personagens das perguntas passeiam (`src/npcs.ts`); só param quando ela está a menos de 8 m.
- **QA:** `?debug`, `?weather=`, `?hour=`; scripts em `.tmp/` (gitignored): `qa44-sit.mjs`, `qa45-misc.mjs`, `qa46-landing.mjs`. O debug expõe agora `walkCat` e `rainSound`.

## What's broken / blocked / not verified

- **À espera do Telmo:** as propostas do brief (90 interações, 30 formas de ganhar, 50 de gastar, usos das joias, ex-líbris de 5 cidades + Tóquio, 18 regras com números). Nada disto está construído.
- **Três decisões só dele:** super-heróis originais em vez de Super-Homem, Batman, Mulher-Maravilha, Homem-Aranha e Guardiões da Galáxia (marcas registadas; a regra do projeto já pede originais); cantar no palco com microfone; joias como segunda moeda.
- **Por decidir nos EUA e na Lua** (separador "EUA e Lua" do canvas, chave `choices` no `.canvas.data.json`): se Nuuk fica antes dos EUA (16 níveis) ou sai (15); onde fica o palácio ("o Caesars Palace é na Lua" lê-se de duas maneiras); quantos diamantes são precisos para acabar. "Walt Disney World" e "Caesars Palace" são marcas: a proposta é um parque e um palácio originais (US3, US4). Se o fim pede diamantes, os dos ex-líbris não se podem gastar (FIM3), o que mexe com R18 e J1–J8.
- **Não ouvido:** o browser de teste não tem som. A velocidade da voz e o volume da chuva estão confirmados nos valores (0,75; ganho ×0 / ×0,4 / ×1), falta o ouvido do Telmo.
- **Continuam parados no sítio**, de propósito: porteiros, vendedores, o pobre, os adeptos e os homens do bar.
- **O gato não atravessa ruas**, como as personagens: passeia dentro do quarteirão onde nasce.
- **Morada de início** deixou de ter base (dependia do mapa real): ⛔ no ROADMAP até o Telmo dizer.
- **De antes:** fps em tablet por medir; chapéus tapam coroa/laço; capa atravessa a mochila da Vega; arco sem gesto; saves anteriores a Tóquio recuam uma cidade.

## Top pending (ROADMAP §🎯 NEXT)

1. Telmo aprova as propostas no canvas. Telmo · none.
2. Telmo joga e valida as 6 correções e as sessões 2–3. Telmo · none.
3. Fase 1: energia, humor, notas, joias com uso, duplo clique e dar. agent · M · #1.
4. Fases 2–6 pela ordem do ROADMAP (a 6 é EUA, Lua e final). agent · L · #1.
5. Medir fps em tablet; afinar acessórios da feira. agent · M · none.

## Quick references

- **Dev:** `npm run dev` → http://localhost:1234. 3333 é o Bolsex; 8787 é o Bus·Porto.
- **Propostas:** `C:\Users\TelmoSilva\.cursor\projects\c-Users-TelmoSilva-Documents-PROJETOS-AI-PROJECTS-Rainbow\canvases\rainbow-propostas.canvas.tsx`. As escolhas do Telmo ficam ao lado, em `rainbow-propostas.canvas.data.json` (chave `rejected` = IDs recusados, `notes` = notas, `choices` = as três escolhas dos EUA e da Lua; chave ausente = vale a primeira opção, que é a recomendada, mas ele ainda não a confirmou). Ler esse ficheiro antes de construir; se não existir, ele ainda não mexeu.
- **Working tree:** `src/` (10 ficheiros + `wandercat.ts` novo), `CLAUDE.md`, `CONTEXT.md`, `ROADMAP.md`, `SESSION_LOG.md`, `memory/`. `Rainbow.code-workspace` fica de fora do commit.
- **Primeiro passo da próxima janela:** `git status` e `git log -1`; depois ler o `.canvas.data.json`. Sem aprovação do Telmo, não construir as fases do brief.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md) · [AGENTS_v7.md](AGENTS_v7.md)
- `src/main.ts` orquestra · `src/cities.ts` (14) · `src/characters.ts` (12) · `src/venue.ts` bilheteira partilhada.
