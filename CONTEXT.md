# CONTEXT — Rainbow

> Substituído a 2026-11-22 (#SEP). Uma só janela: sem LINEAGE.
> Ler com [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [memory/MEMORY.md](memory/MEMORY.md).

## O que é

Jogo 3D no browser para crianças de 7–8 anos (PT-PT). Personagens originais, moedas/joias, perguntas faladas, situações
por movimento. Aos 100 moedas → cidade seguinte. **Mundo gerado** (sem OSM). **16 níveis** em `src/cities.ts`:
Porto → … → Nuuk → Estados Unidos → Lua. Fim: máquina do tempo na Lua (joias trazidas + 10) → "Rainbow 2".
**Segredo:** nada no jogo diz que o último nível é a Lua antes de lá chegar.

## What works (HEAD `705615f` = `origin/main`; o lote abaixo ainda não tem commit)

- **2.º lote de 2026-11-21/22 (testado no browser com capturas, sem commit):**
  - Sem energia: 4,7 m/s nas cidades (bichos 4,6), 2,7 m/s na Lua (marcianos 2,6). Casa na Lua: ao lado da nave (antes ficava dentro). Pão de Açúcar: no cimo só desce com toque/Enter.
  - Torres (`towerClimb`, exportada): no topo arrastar/←→ roda a vista; tentar andar = descer (1.º passo apanha a joia).
  - Rio em `src/landmarks-rio.ts`: Urca + Pão de Açúcar em "bala", bondinho (entrar a andar/tocar/Enter; sobe 2, desce grátis), Cristo Redentor no Corcovado.
  - Aviador: é ela que lança o avião de papel (tocar no avião/aviador ou Enter), sem espera para repetir.
  - Nuuk sem feira + zona de neve (`src/snowplay.ts`): bonecos, buracos no gelo com peixe, 6 crianças, ela atira bolas (a bola substitui o que tem na mão; `stowCarried` no GameCtx).
  - Moscovo: tanque em exibição (tocar = torre roda + pomba). EUA: Estátua com escadas certas, subida e tocha para cima; passeio em frente ao lago do Hotel das Fontes.
  - Bandeiras verificadas (Reino Unido corrigido). Matriz por cidade: [docs/matriz-cidades.md](docs/matriz-cidades.md).
  - Lua: fato de astronauta desde o foguetão, Lua ±60 m, andar aos saltos (3,5 m/s; marcianos 2,6). Corrigido: "Continuar" na Lua deixava o ecrã vazio (`quietTrouble` usado antes de existir — bug antigo).
- **Testado no browser a 2026-11-21 (1.º lote):**
  - WIP de `cd46b39` terminado: carta lida + caixa de correio + caixotes azuis; macaca 1–10 + borboletas novas;
    avião de papel, ponte, penso (no braço), sopa; padaria nova + Muralha ~128 m com 7 torres + gongo; Moscovo com
    Catedral de São Basílio + baú (chave = joia, +15); estádios nas cores da bandeira; moedas sempre dentro do chão.
  - **Cidade (testes)** nas ⚙ Definições (só dev/`?debug`): salta para qualquer nível.
  - Varsóvia: castelo virado para a rua; joias visíveis no Castelo, Barbican (agora com porta) e Palácio da Cultura;
    o Palácio tem escadaria a sério; bug de duas subidas na mesma cidade corrigido (`activeClimb`). Clérigos re-testado.
  - Parque infantil 20×19 m: escadas e rede acessíveis; ela sobe, senta-se e desce os 2 escorregas a deslizar, com câmara própria de lado; tubo transparente.
  - SPA 13×11 m (Vilnius, Moscovo, Nuuk); rei só em Londres (`onlyIn`).
  - Reiquiavique: sem estádio nem bar; pescador num lago com pontão (`src/folk/pescador.ts`) — pesca sozinho, mostra o peixe, ela pode tentar (+1).
  - `CITY_WITHOUT`: Reiquiavique sem estádio nem bar, Moscovo sem piscina, Tóquio e Nuuk sem feira, Vilnius sem concerto, Rio sem trotinete.
  - Aurora boreal em Reiquiavique (`src/aurora.ts`), à noite; a câmara olha para o céu ~7 s quando a narradora a anuncia.
  - Joias dizem "Guarda-a bem!" (antes "Guarda-a para a Lua!").
- Antes (2026-11-19/20): Lua, 227 perguntas, lojas com provador, SPA, massagem, feira com visitantes, fotógrafo, bandeiras, trotinete.
- Stack: Three.js + Vite + TS · porta **1234** · `localStorage` · Web Speech pt-PT · Open-Meteo.

## What's broken / blocked

- Sem ex-líbris: Madrid · Vilnius · Cidade do México · Reiquiavique · Nuuk.
- Nas cidades nada impede a personagem de sair do chão a andar (não há parede na borda).
- Som real, animações em movimento, toque e fps em tablet nunca validados.

## Top pending

0. Commit + push de tudo desde `705615f` (aguarda o Telmo). Antes: confirmar o resultado da Torre dos Clérigos mais ao centro (agente em curso no fecho).
1. Telmo joga o que mudou (usar ⚙ → Cidade) e diz o que afinar. Ouvir o som a sério (volume, voz).
   Possível duplicado: massagem/médico de `services.ts` + massagista/médico folk na mesma cidade (por confirmar).
2. Medir fps num tablet médio (parque, aurora, espelhos, visitantes).
3. Ex-líbris das cidades vazias (Telmo: "depois").
4. Alinhar o resto do ROADMAP com o código (brief de 2026-11-15).

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
