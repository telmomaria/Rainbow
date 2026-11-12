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
