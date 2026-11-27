# CONTEXT — Rainbow

> Substituído a 2026-11-27 (#SEP). Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT). Personagens originais, moedas/joias, perguntas faladas, situações
por movimento. Aos 100 moedas → cidade seguinte. **Mundo gerado** (sem OSM). **16 níveis** em `src/cities.ts`:
Porto → … → Nuuk → Estados Unidos → Lua. Fim: máquina do tempo na Lua (joias trazidas + 10) → "Rainbow 2".
**Segredo:** nada no jogo diz que o último nível é a Lua antes de lá chegar.

## Publicado

- **https://rainbow-alpha-liard.vercel.app/** (Vercel, plano Hobby, deploy automático a cada push para `main`; também
  `rainbow-git-main-telmosilva-6923s-projects.vercel.app`). Partilhado com 2 pais; ainda não divulgado.
- **Registo de visitas (2026-11-26, testado em produção):** o jogo chama `api/visit.js` → um blob privado por visita em
  `visitas/` (Vercel Blob store ligado ao projeto, token `BLOB_READ_WRITE_TOKEN` na Vercel e no `.env` local).
  `npm run ips` traz tudo para `ip.txt` (no .gitignore) e mostra no terminal (hora de Lisboa · IP · cidade · aparelho).
  Em dev, `vite.config.js` escreve no mesmo `ip.txt`. As linhas "robô" de San Jose são a Vercel a abrir o site após deploy.

## What works (HEAD = `origin/main`, commit de 2026-11-27)

- **2026-11-27:** personagens renomeadas — Lia → **Emma**, Leonor → **Íris**, Rita → **Maria**, Nina → **Valentina** (só `name` em `src/characters.ts`; os `id` e os saves ficam iguais). Visto no ecrã de escolha; a pronúncia de "Emma" na voz pt-PT não foi ouvida.
- **2026-11-26:** registo de IPs (acima); `npm run dev` agora com `--host` (aberto à rede de casa, ex.: tablet).
- **Lote de 2026-11-21/22 (commit `637812e`, testado no browser):** Clérigos (vista + descer), Rio (`src/landmarks-rio.ts`:
  Urca, Pão de Açúcar, bondinho, Cristo), aviador, Nuuk com neve (`src/snowplay.ts`), tanque em Moscovo, Estátua +
  Hotel das Fontes, Lua (fato, ±60 m, saltos), sem energia 4,7/2,7 m/s, bandeiras verificadas, matriz por cidade.
- Antes: feira, parque, SPA, lojas com provador, concerto, piscina, casa, 227 perguntas, aurora, `CITY_WITHOUT`, etc. (ver CLAUDE.md).
- Stack: Three.js + Vite + TS · porta **1234** · `localStorage` · Web Speech pt-PT · Open-Meteo · `@vercel/blob` (só registo).

## What's broken / blocked

- Sem ex-líbris: Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk.
- Nas cidades nada impede a personagem de sair do chão a andar (não há parede na borda).
- Som real, animações em movimento, toque e fps em tablet nunca validados.
- Por confirmar: Torre dos Clérigos "mais ao centro" (agente em curso no fecho de 2026-11-22; resultado nunca verificado).

## Top pending

1. Telmo joga o que mudou (⚙ → Cidade) e diz o que afinar; ouvir o som a sério. Possível duplicado massagem/médico (`services.ts` vs folk).
2. Ver quem jogou: `npm run ips` (as visitas dos 2 pais só contam a partir de 2026-11-26 ~10:17).
3. Medir fps num tablet médio (agora dá para abrir o dev pela rede: `npm run dev` → IP do portátil:1234).
4. Ex-líbris das cidades vazias (Telmo: "depois") · alinhar o resto do ROADMAP com o código.
5. Antes de divulgar o jogo: rever o registo de IPs (dados pessoais de crianças; regra "sem dados pessoais").

## Quick references

- **Dev:** `npm run dev` → http://localhost:1234 (e pela rede) · QA: `?debug`, `?hour=12`, `?weather=clear`
- **Visitas:** `npm run ips` · painel Vercel → Storage → Blob store → `visitas/`
- QA events: `rainbow-level` (N), `rainbow-teleport`, `rainbow-aerial`, `rainbow-comet`, `rainbow-life`, `rainbow-jewels`, `rainbow-coins-stress`.
- Estado em `document.body.dataset.debug` (o `page.evaluate` do patchright corre num mundo isolado).
- No Git Bash, o node lê `/tmp/x` como `C:/tmp/x` — dar caminhos Windows absolutos aos scripts de QA.
- `Rainbow.code-workspace` untracked — não commitar. O workspace tem outros projetos abertos (ex.: Bolsex): cuidado com o `.env` certo.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md)
- `api/visit.js` · `scripts/ips.mjs` · `vite.config.js` (registo de visitas)
- `src/cities.ts` (`CITY_WITHOUT`) · `src/landmarks.ts` (`towerClimb`) · `src/landmarks-rio.ts` · `src/snowplay.ts` · `src/folk/` · `src/trouble.ts`
