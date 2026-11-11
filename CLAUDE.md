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
  Errou → **não se revela a resposta certa**; a pergunta volta mais tarde (~3 min) para nova tentativa.
  Acertou → moedas e a pergunta fica resolvida para sempre. (Regra revista pelo Telmo a 2026-11-11.)
- **Valores:** moeda = 1 · joia = 5 (e conta no contador de joias) · resposta certa = 10 (e conta no contador ?). Moedas em rastos de 3, espalhadas (~36 no mundo) para não se chegar aos 100 depressa demais. Ao mostrar a pergunta já fica em espera de 3 min (recarregar a página não dá tentativa imediata).
- **Posição da personagem é gravada** (a cada 2 s e ao sair): recarregar a página continua no mesmo sítio.
- **Bichos maus:** quantidade = 1 + moedas/15 (máx. 8); perseguem a 4,6 m/s (sempre mais lentos que a personagem,
  6,5 m/s, para se poder fugir); provocam com voz grave; tocar = empurrão + perde 3 moedas + 1,5 s a piscar sem
  poder ser apanhada. Nunca "morte" violenta — tom infantil. Ficam parados durante perguntas e viagens.
- **Viagem:** 100 moedas → aviso falado + bússola ✈️ → ir ao aeroporto → tocar nas escadas do avião → cena animada
  (sobe, porta fecha, descola, nuvens, aterra na cidade seguinte, sai). Gastam-se 100 moedas, o resto passa. Sem
  moedas, o avião diz quantas faltam. Troca de cidade sem recarregar a página. Última cidade (Nuuk) → ecrã final.
- **Personagens (src/characters.ts):** Lia (princesa) · Estrela (unicórnio) · Bia, Nina, Inês (cantoras K-pop) ·
  Zuca (extraterrestre) · Leonor (guerreira) · Rita (voleibolista) · Clara (bailarina) · Tomás (karateca).
  Escolha no 1.º arranque e no botão com o retrato (canto superior direito).
- **Objetos/situações por cidade:** candeeiro, carro (entra ao tocar; conduz com setas ou tocando no chão; sai com
  Espaço/Enter ou tocando no carro), pobre (aceita 1 moeda por cidade, agradece), e 12 adereços em src/props.ts
  (baloiço, fonte, xilofone de chão, gato, balões, flores, caixa de correio, árvore, espanta-espíritos, cão,
  cogumelo, semáforo). Todos só reagem ao toque, sem UI.
- **Botões fixos:** Casa (ponto de partida), retrato (mudar de personagem). **Definições** (monstros Fácil ×0.5 / Médio / Difícil ×2) estão no ecrã inicial.
- **Arranque:** ecrã de escolha com "Continuar" (tudo como estava) e "Novo jogo" (tudo a zero, mantém personagem e definições).
- **Situações por cidade (só movimento, sem texto):** gato na árvore (+5), padaria (pão = 2) → pombos, gelado 3 / chocolate 2 / chupa 1,
  adeptos do estádio (-20), dois homens à porta do bar (-10), trânsito (atropelada = -30 + hospital 5 min; o tempo persiste em reload).
  Tudo espalhado pela cidade, nunca no centro nem no ponto de partida (SPAWN em world.ts).
- **Tempo real + hora local:** Open-Meteo (sem chave), por cidade, cache 15 min; luz segue a hora local real (nascer/pôr do sol); candeeiros de rua (src/streetlights.ts) acendem um a um quando escurece. Testes: `?weather=rain`, `?hour=21.5`.
- **Compras:** só com clique/toque na loja (ou Enter junto ao balcão); itens vão para o inventário (lateral esquerda); tocar num doce = comer; tocar no pão = segurá-lo para os pombos.
- **Pausa:** 30 s sem tocar em nada → pausa (ecrã com ▶). O mesmo monstro só tira moedas 2 vezes seguidas.
- **Vozes:** narradora = voz feminina pt-PT (Helia no Windows); monstros = voz masculina pt-PT se existir (Duarte
  no Edge), senão a mesma voz com tom muito grave. O Windows não instala vozes masculinas pt-PT.
- **Ordem das cidades:** Portugal (morada nas Definições) → Roma → Madrid → Londres →
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
