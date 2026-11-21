# CONTEXT — Rainbow

> Atualizado a 2026-11-21. Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT). Personagens originais, moedas/joias, perguntas faladas, situações
por movimento. Aos 100 moedas → cidade seguinte. **Mundo gerado** (sem OSM). **16 níveis** em `src/cities.ts`:
Porto → … → Nuuk → Estados Unidos → Lua. Fim: máquina do tempo na Lua (joias trazidas + 10) → "Rainbow 2".
**Segredo:** nada no jogo diz que o último nível é a Lua antes de lá chegar.

## What works (HEAD `cd46b39` + alterações de 2026-11-21 por commitar)

- **Testado no browser a 2026-11-21:**
  - WIP de `cd46b39` terminado: carta lida + caixa de correio + caixotes azuis; macaca 1–10 + borboletas novas;
    avião de papel, ponte, penso (no braço), sopa; padaria nova + Muralha ~128 m com 7 torres + gongo; Moscovo com
    Catedral de São Basílio + baú (chave = joia, +15); estádios nas cores da bandeira; moedas sempre dentro do chão.
  - **Cidade (testes)** nas ⚙ Definições (só dev/`?debug`): salta para qualquer nível.
  - Varsóvia: castelo virado para a rua; joias visíveis no Castelo, Barbican (agora com porta) e Palácio da Cultura;
    o Palácio tem escadaria a sério; bug de duas subidas na mesma cidade corrigido (`activeClimb`). Clérigos re-testado.
  - Parque infantil 20×19 m: escadas e rede acessíveis (≥2,7 m da cerca), sobe-se tocando na escada/rede.
  - SPA 13×11 m (Vilnius, Moscovo, Nuuk); rei fora de Moscovo.
  - `CITY_WITHOUT`: Reiquiavique sem estádio (bar fica), Moscovo sem piscina, Tóquio sem feira, Vilnius sem concerto, Rio sem trotinete.
  - Aurora boreal em Reiquiavique (`src/aurora.ts`), à noite; a câmara olha para o céu ~7 s quando a narradora a anuncia.
  - Joias dizem "Guarda-a bem!" (antes "Guarda-a para a Lua!").
- Antes (2026-11-19/20): Lua, 227 perguntas, lojas com provador, SPA, massagem, feira com visitantes, fotógrafo, bandeiras, trotinete.
- Stack: Three.js + Vite + TS · porta **1234** · `localStorage` · Web Speech pt-PT · Open-Meteo.

## What's broken / blocked

- **Por commitar:** todo o trabalho de 2026-11-21 (o Telmo ainda não pediu commit).
- Sem ex-líbris: Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk.
- Nas cidades nada impede a personagem de sair do chão a andar (não há parede na borda).
- Som real, animações em movimento, toque e fps em tablet nunca validados.

## Top pending

1. ⏳ **Perguntas ao Telmo:** (a) o rei ainda aparece no Porto, Varsóvia, Rio, Reiquiavique e EUA — fica só em Londres?
   (b) em Reiquiavique tirar também o bar com os dois homens? (c) commit + push do trabalho de 2026-11-21?
2. Telmo joga o que mudou (usar ⚙ → Cidade) e diz o que afinar.
3. Ex-líbris das cidades vazias (Telmo: "depois").
4. Medir fps num tablet médio.
5. Alinhar o resto do ROADMAP com o código (brief de 2026-11-15).

## Quick references

- **Dev:** `npm run dev` → http://localhost:1234 · QA: `?debug`, `?hour=12`, `?weather=clear`
- QA events: `rainbow-level` (N), `rainbow-teleport`, `rainbow-aerial`, `rainbow-comet`, `rainbow-life`, `rainbow-jewels`, `rainbow-coins-stress`.
- Estado em `document.body.dataset.debug` (o `page.evaluate` do patchright corre num mundo isolado).
- No Git Bash, o node lê `/tmp/x` como `C:/tmp/x` — dar caminhos Windows absolutos aos scripts de QA.
- `Rainbow.code-workspace` untracked — não commitar.

## File pointers

- [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [SESSION_LOG.md](SESSION_LOG.md)
- `src/cities.ts` (`CITY_WITHOUT`) · `src/aurora.ts` · `src/landmarks.ts` (Varsóvia, `towerClimb`) · `src/landmarks-moscovo.ts`
- `src/letters.ts` · `src/playground.ts` · `src/spa.ts` · `src/folk/` · `src/trouble.ts` · `src/collectibles.ts`
