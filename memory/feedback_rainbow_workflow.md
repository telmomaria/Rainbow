---
name: feedback-rainbow-workflow
description: Como o Telmo trabalha no Rainbow — pedidos curtos em PT-PT, #SUB, tudo verificado no browser, sem texto no jogo
metadata:
  type: feedback
---

O Telmo dá pedidos curtos (por vezes vários num só) em PT-PT, muitas vezes com #SUB, e testa o jogo ele próprio enquanto
o agente trabalha. Quer interações descobertas por movimento (sem pop-ups/texto para a criança), espalhadas pela cidade.

**Why:** o jogo é para crianças de 7–8 anos; o Telmo valida jogando, e edições do agente recarregam o Vite no browser dele
(daí gravar posição/progresso). Na sessão 1 aceitou commit + push após cada passo verificado.

**How to apply:** com #SUB, delegar só trabalho disjunto (ficheiro novo por subagente) e fazer master-direct o que é pequeno
ou acoplado — dizendo porquê numa frase; verificar sempre no browser (skill browser-automation, script em .tmp/qa*.mjs,
`?debug`) antes de declarar feito; dizer explicitamente o que NÃO foi verificado. Ver [[project-rainbow-stack]].

Não alterar o que ele não pediu: na sessão 2 reduzi o concerto de 5 para 3 canções ao corrigir "nunca acaba" e ele
respondeu "5 canções estava bem, não me queixei da quantidade". Corrigir só o sintoma reportado.
Ele também ajusta regras depois de jogar (ex.: sair da piscina passou de "livre" a "tem de se vestir") — aplicar a última
versão e atualizar o CLAUDE.md, sem discutir a anterior.

Para pedidos grandes com #SUB (ex.: feira com 15 diversões), o que resultou: o master cria primeiro o contrato
(types.ts, slots, helpers partilhados, stubs de ficheiro) e só depois lança 1 subagente por ficheiro; no fim o master
corrige os problemas de contrato que eles reportam. Zero conflitos com 3 agentes em paralelo.

O commit das sessões 2 e 3 já está em `main` e em `origin/main`: `68e30da` (2026-11-14). O SESSION_LOG desse dia foi escrito antes do commit e diz "ainda sem commit"; a entrada de 2026-11-15 corrige isso. No fecho, confirmar com `git rev-parse HEAD` e `git rev-parse origin/main`, não só com o log.

Sessão 2026-11-19/20: o Telmo manda listas de 5–10 queixas de uma vez (muitas vezes "X não faz nada" ou "X está mal") e
quer que cada interação faça algo visível e com sentido — senão retirar. Lançar 1 agente por grupo de ficheiros resultou,
mas **7 agentes em paralelo esgotaram o limite mensal da API** e pararam todos a meio, sem testes (commit `cd46b39` WIP).
**How to apply:** com crédito incerto, no máximo 3–4 agentes de cada vez; pedir-lhes que façam primeiro a correção e o
`tsc`, e só depois as capturas, para o trabalho ficar utilizável se pararem. Ele pediu commit+push mesmo com WIP: marcar
a mensagem como `wip:` e dizer o que não foi testado.

Sessão 2026-11-21: 3 agentes de cada vez (lançando o seguinte quando um acabava) fez 12 tarefas sem esgotar crédito.
Para retomar agentes interrompidos, os briefs originais estão nos transcripts `.jsonl` do projeto (input dos `Agent`).
Ele quer **a documentação coerente** (CLAUDE.md, CONTEXT, ROADMAP, SESSION_LOG) depois de cada lote de alterações — não
só no #SEP. Nos briefs de QA, exigir capturas da câmara do jogo em vários momentos (início/meio/fim) — um agente
deu os escorregas como feitos só pelos números do `?debug` e o Telmo viu que ela nem saía do chão. E guarda segredos de jogo (ex.: a Lua ser o último nível): nunca os pôr em falas antes do tempo.

Sessão 2026-11-21/22 (2.º lote, 7 agentes em ondas de 3–4, sem esgotar crédito): quando um agente diz "talvez seja a
máquina lenta" e não prova, verificar logo — era um erro real escondido (a Lua não arrancava com "Continuar").
**How to apply:** para apanhar erros que a consola do patchright não mostra, gravar `window.onerror`/`unhandledrejection`
num `dataset` do DOM com `addInitScript` (o `page.evaluate` corre num mundo isolado). Com o ficheiro grande ocupado por
um agente, dar ao outro um ficheiro novo (Rio → `landmarks-rio.ts`). Ele responde às perguntas de decisão em poucas
palavras ("sim, substitui", "4,7 m/s") — aplicar à letra e não estender a outros casos sem perguntar (ex.: 4,7 só nas cidades).
Som em headless: intercetar `speechSynthesis.speak` e `AudioContext.createOscillator/createBufferSource` com `addInitScript`
e gravar num `dataset` do DOM — prova que o jogo fala/toca, mas o Telmo é quem confirma volume e voz a ouvir.

2026-11-26: o workspace do VS Code tem vários projetos (ex.: Bolsex); o Telmo colou um token no `.env` do Bolsex e disse
"gravei". Verificar no disco (`grep -c VAR .env`, tamanho) e, se estiver noutro projeto, pedir-lhe para mover a linha —
não mexer no `.env` de outro projeto. Comandos para ele correr devem mostrar o resultado no ecrã (ele não abre o ficheiro).
