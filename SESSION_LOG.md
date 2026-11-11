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
