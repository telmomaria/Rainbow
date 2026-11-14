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
  Zuca (extraterrestre) · Leonor (guerreira) · Rita (voleibolista) · Clara (bailarina) · Tomás (karateca) ·
  Vega (astronauta, sem logótipos de agências) · Alice (País das Maravilhas — livro de 1865 / cores de Tenniel 1890,
  domínio público: vestido amarelo, avental branco, laço azul; nunca o visual da Disney).
  Escolha no 1.º arranque e no botão com o retrato (canto superior direito).
- **Objetos/situações por cidade:** candeeiro, carro (entra ao tocar; conduz com setas ou tocando no chão; sai com
  Espaço/Enter ou tocando no carro), pobre (aceita 1 moeda por cidade, agradece), e 12 adereços em src/props.ts
  (baloiço, fonte, xilofone de chão, gato, balões, flores, caixa de correio, árvore, espanta-espíritos, cão,
  cogumelo, semáforo). Todos só reagem ao toque, sem UI.
- **Autocarro (src/busstops.ts + traffic.ts):** 4 autocarros em 2 linhas (a "figura grande", que passa em todas as ruas
  interiores nos dois sentidos, e o anel exterior); 3 paragens (abrigo, banco, poste com sinal redondo) em ruas diferentes
  do anel, servidas por todas as linhas; os autocarros param ~5 s de portas abertas. Entrar = tocar no autocarro / ir à porta / Enter (paga 1 moeda; sem moedas o
  motorista abana a cabeça). Vai sentada à janela; sair = Espaço/Enter/toque/setas com as portas abertas (a meio da viagem toca a campainha e sai na paragem seguinte). Casa/menu/nova cidade tiram-na do autocarro.
- **Botões fixos:** Casa (ponto de partida) e retrato → abre a página principal (Continuar · Novo jogo · ⚙ Definições), em qualquer momento exceto a meio do voo ou de uma pergunta (também no hospital). Definições: monstros Zero (sem monstros) / Fácil ×0.5 / Médio / Difícil ×2.
- **Ordem de construção da cidade:** mundo → aeroporto → extras (candeeiros, carro, pobre, adereços, gato, hospital, lojas, estádio/bar, trânsito) → só depois moedas, personagens das perguntas e monstros (nunca nascem dentro de edifícios).
- **Arranque:** ecrã de escolha com "Continuar" (tudo como estava) e "Novo jogo" (tudo a zero, mantém personagem e definições).
- **Situações por cidade (só movimento, sem texto):** gato na árvore (+5), padaria (pão = 2) → pombos, gelado 3 / chocolate 2 / chupa 1,
  adeptos do estádio (-20), dois homens à porta do bar (-10), trânsito (atropelada = -30 + hospital 5 min; o tempo persiste em reload).
  Tudo espalhado pela cidade, nunca no centro nem no ponto de partida (SPAWN em world.ts).
- **Concerto (src/concert.ts):** recinto vedado em cada cidade; bilhete = 5 moedas na bilheteira (clique/Enter), o porteiro
  abana a cabeça e aponta para a bilheteira sem bilhete; com bilhete o portão abre e o bilhete é recolhido à entrada (sair é
  livre, voltar a entrar pede novo bilhete). **Um concerto a cada 20 min** pelo relógio do dispositivo (:00, :20, :40):
  cantora, cantor ou banda (sorteado por cidade) toca 5 canções infantis tradicionais (domínio público, sintetizadas,
  ~5 min), aplauso final + despedida falada, depois **o público sai** a pé pelo portão; recinto vazio e às escuras; ~3 min
  antes do seguinte o público volta a entrar. Bilheteira aberta desde ~4 min antes até ao fim (fechada = estore em baixo,
  vendedor abana a cabeça). Recarregar a meio continua na canção certa. 50 pessoas dançam/batem palmas. Música nítida
  dentro, abafada fora; pausa = só silêncio. Lá dentro não há pausa por inatividade; nada nasce lá dentro (setNoSpawnZones).
  Último minuto antes do concerto: contagem decrescente em números luminosos no fundo do palco (sem texto) + narradora
  ("Falta um minuto…", "Faltam trinta segundos!", 10…1) quando ela está a < 40 m.
  QA: `?debug` + evento `rainbow-concert-time` (segundos no ciclo).
- **Piscina (src/pool.ts):** recinto vedado com a mesma bilheteira/portão/porteiro (src/venue.ts), bilhete = 5 moedas.
  Vestiário = cabines de praia: entrar numa = porta fecha, troca para fato de banho (mesma cabeça/cabelo; Tomás de calções;
  unicórnio com boia), entrar outra vez = volta à roupa. Tocar na borda em fato de banho = salta e nada (setas/toque);
  duplo toque / Espaço na água = crawl → costas → bruços; empurrar contra a borda = sai. Vestida, o nadador-salvador apita
  e aponta para as cabines. Para sair tem de se vestir outra vez na cabine (o porteiro aponta para as cabines e a narradora diz "Primeiro veste a tua roupa na cabina!"). Com o rato só salta para a água se tocar na água. Espreguiçadeiras do lado
  direito, com corredor largo até à piscina: clicar/tocar numa livre (de qualquer ponto do recinto) = deita-se ao sol; qualquer tecla/toque = levanta-se.
  Visitantes aleatórios (1–8): apanham sol, levantam-se, saltam, nadam, saem e deitam-se numa espreguiçadeira livre;
  outros boiam em boias. Casa/nova cidade/novo jogo = volta vestida.
- **Recintos (src/venue.ts):** concerto e piscina ficam recuados da rua (~10 m de largo à frente, para não se sair
  diretamente para o trânsito) e com ≥3 m livres à volta; a bilheteira tem espaço livre à frente (sem candeeiros).
- **Espaço livre:** nenhum objeto colado a edifícios — deixar sempre espaço para passar à volta. Adereços de brincar (baloiço, fonte, xilofone…) a ≥4 m da rua; o xilofone nunca atravessa ruas.
- **Casa (src/house.ts):** uma por cidade, recuada da rua, pintada por fora com as cores da bandeira do país (paredes · portas/frisos · telhado, tabela FLAG_COLORS); hall, cozinha, sala de estar + jantar, casa de banho e quarto.
  O telhado desaparece e a câmara olha de cima quando ela entra. Tocar: campainha, cabide, interruptor (luzes da casa),
  frigorífico, fogão, torneiras, frasco de bolachas, TV, rádio, candeeiros, chuveiro, sanita, roupeiro, caixa de brinquedos.
  Clicar/Enter: sofá e cadeiras = sentar; cama = deitar; qualquer tecla/toque = levantar.
- **Feira popular (src/fair/):** recinto grande em cada cidade, entrada livre por um arco iluminado; 1.ª cidade 5 diversões,
  2.ª 6, 3.ª 7… (máx. 15, ordem em FAIR_ORDER): carrossel, pipocas, bolas→peluches, trampolim, balões, carrinhos de choque,
  cachorros-quentes, arco e flecha, insuflável, pinturas faciais, montanha-russa, bijuteria, river ride, artesanato, roupa.
  Diversões = clicar/Enter e pagar (2 moedas; trampolim/insuflável/balão 1; bancas de bijuteria/artesanato/roupa 3).
  Andar nas diversões usa os assentos (SwingSeat: sentada, de pé a saltar, ou a conduzir); comida vai para o inventário;
  acessórios (pinturas, colares, chapéus) ficam na personagem e são gravados (save.wear). Se a cidade estiver cheia, a
  feira retira os edifícios provisórios do caminho.
- **Baloiço:** clicar/tocar (ou Enter ao lado) = senta-se no assento mais próximo e baloiça; qualquer tecla/toque = sai.
- **Depois de uma pergunta** a personagem acena e vai-se embora a pé (só desaparece longe/fora de vista).
- **Artistas do concerto** só estão no palco durante o espetáculo: saem a pé pelo lado depois do final e voltam ~10 s antes do seguinte.
- **Personagens das perguntas:** ~metade passeia devagar (1,3 m/s, nunca na estrada); param e viram-se quando ela está a < 8 m.
  Quando já não há perguntas por resolver disponíveis, as resolvidas voltam como revisão (dão moedas, não contam no "?").
- **Tempo real + hora local:** Open-Meteo (sem chave), por cidade, cache 15 min; luz segue a hora local real (nascer/pôr do sol); candeeiros de rua (src/streetlights.ts) acendem um a um quando escurece. Testes: `?weather=rain`, `?hour=21.5`.
- **Compras:** só com clique/toque na loja (ou Enter junto ao balcão); itens vão para o inventário (lateral esquerda); tocar num doce = comer; tocar no pão = segurá-lo para os pombos.
- **Pausa:** 30 s sem tocar em nada → pausa (ecrã com ▶). O mesmo monstro só tira moedas 2 vezes seguidas.
- **Vozes:** narradora = voz feminina pt-PT (Helia no Windows); monstros = voz masculina pt-PT se existir (Duarte
  no Edge), senão a mesma voz com tom muito grave. O Windows não instala vozes masculinas pt-PT.
- **Ordem das cidades:** Porto (futuro: morada nas Definições) → Roma → Madrid → Londres →
  Paris → Varsóvia → Vilnius → Moscovo → Pequim → Tóquio → Rio de Janeiro → Cidade do México → Reiquiavique → Nuuk.
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
