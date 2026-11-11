# SESSION LOG — Rainbow (append-only)

## 2026-11-11 — #NP
- Interrogatório first-run; stack Three.js + Vite + TS; mapa OSM estilizado; porta 1234; PT-PT; uma só janela; sem MCP.
- Scaffold gerado a partir de -SKILLS_GLOBAL/framework/templates/.
- Regra acrescentada: navegação por setas e rato.

## 2026-11-11 — bootstrap
- Vite 8 + Three.js 0.187 + TS; controlos setas + rato/toque; colisões; candeeiro interativo por contacto. QA no browser OK (0 erros consola).

## 2026-11-11 — moedas + perguntas
- Velocidade 6,5 m/s. Moedas em rastos, joias, contador, localStorage. Perguntas faladas (36, 2.º ano) com 3 opções; QA no browser: pergunta aparece, personagem para, errado = 0 moedas e pergunta retirada (persiste após reload). Caminho 'resposta certa' não exercitado no browser.

## 2026-11-11 — contadores
- HUD com 3 contadores (moedas · joias · respostas certas com ícone ?). QA no browser: joia +1/+5 moedas, resposta certa +1/+10, persistência após reload, 0 avisos.

## 2026-11-11 — feedback do Telmo
- Errar já não revela a certa; pergunta volta após ~3 min (save.retryAt). Moedas: 36 em rastos de 3, mais longe. Posição gravada.
- "Voltou à posição inicial" = reloads do Vite durante as minhas edições (confirmado no log do dev server); agora a posição persiste.
- "Ganhaste 10 moedas" repetido: não reproduzido — QA mostra 1 só chamada à voz; fica em observação.
- QA browser: errado sem revelar + retry gravado; certo +10, posição igual, elogio 1×; reload mantém posição. 0 erros.

## 2026-11-11 — cidades + bichos maus
- 13 cidades (palete/seed por cidade no mundo provisório), ecrã de viagem aos 100 moedas, chegada falada, nome da cidade no canto; troca em-ecrã (sem reload).
- Bichos maus: 1 + moedas/15 (máx. 8), perseguem a 4,6 m/s, provocam, empurram, -3 moedas, 1,5 s invulnerável.
- QA browser: 1 bicho a 0 moedas → 4 a 45; apanhada → -3 moedas + "Toma lá!"; 104 moedas → ecrã → Roma com 4 moedas; persiste após reload. 0 erros.

## 2026-11-11 — aeroporto, personagens, interatividade (#SUB)
- Subagentes: characters.ts (10 personagens originais) e props.ts (12 adereços); master: aeroporto/voo, voz dos monstros, ícone, Casa, carro, pobre, ecrã de escolha, integração.
- Bug apanhado no QA: bloco do ecrã de escolha inserido dentro de tick() (criava ecrãs a cada frame) — corrigido.
- Bug apanhado no QA: posição gravada a meio do voo e reposta dentro do avião — corrigido.
- QA browser: escolha por setas/Enter, carro (entrar/conduzir/sair), pobre (-1 moeda + agradece), 22 interativos na cidade, Casa → (0,0), voo Portugal → Roma completo. 0 erros.
- Voz masculina pt-PT: não existe no Windows (só Helia); funciona no Edge (Duarte).

## 2026-11-11 — cidade viva (lojas, adeptos, trânsito, hospital, tempo real) + ajustes
- Subagentes (lojas, adeptos/bar, trânsito/hospital, tempo) pararam no limite de 5 h a meio da verificação; os módulos compilavam → integrados e verificados pelo master.
- Um subagente tinha deixado SPAWN alterado em world.ts (fora do âmbito) — reposto.
- Novo: gato na árvore (+5), carro com porta e condutor visível, padaria (pão 2) → pombos, gelado 3/chocolate 2/chupa 1, adeptos (-20), bar (-10), trânsito com atropelamento (-30 + hospital 5 min, persiste em reload), tempo real Open-Meteo por cidade, ecrã inicial Continuar/Novo jogo, definições (monstros ×0.5/×1/×2), pergunta com repetir + hover, pausa aos 30 s parado, mesmo monstro máx. 2 hits seguidos, câmara não entra em edifícios, nunca fica presa.
