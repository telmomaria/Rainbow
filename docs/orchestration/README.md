# `docs/orchestration/` — Orchestration meta-files

> Esta directoria contém ficheiros que coordenam a passagem entre orquestradores (masters) e agentes executores em workflows multi-window. Distinção clara entre orchestration-meta vs research/audit deliverables.

## Convenção (NORMATIVA)

**Orchestration-meta files VÃO aqui.** Inclui:

- **Master bootstrap prompts** — `v{N}-master-bootstrap-prompt.md` (handoff para spawn próximo orquestrador em janela fresh)
- **Agent prompts** — `{milestone-id}-agent-{X}-prompt.md` (mandate para spawn agent executor em janela fresh; recomenda-se §−1 role-assertion preamble pattern)
- **Agent closure narratives** — `{milestone-id}-agent-{X}-closure.md` (post-execution summary para handoff)
- **Cumulative handoff log** — `orchestrator-handoff.md` (single live document com §1-§N appended por cada master closure)

**Research/audit deliverables NÃO vão aqui.** Esses ficam em directorias topic-specific (e.g., `docs/{topic}-investigation/`, `docs/audits/`, `docs/indicadores/`).

## Razão da separação

Orchestration-meta files têm lifecycle **discrete handoff** (criar → usar uma vez para spawn → arquivar).
Research deliverables têm lifecycle **persistent reference** (criar → consultar repetidamente em decisões futuras).

Misturá-los degrada navigability — quando próximo orquestrador procura "Agent X prompt" não quer scanning A/B test reports.

## Naming convention

- Master bootstrap: `v{N}-master-bootstrap-prompt.md` (e.g., `v3-master-bootstrap-prompt.md`, `v7-master-bootstrap-prompt.md`)
- Agent prompt: `{milestone-id}-agent-{letter}-prompt.md` (e.g., `3c.5.7-agent-h-prompt.md`)
- Agent closure: `{milestone-id}-agent-{letter}-closure.md`
- Cumulative handoff: `orchestrator-handoff.md` (live, single file)

Letter-indexed agents (A, B, C, ..., H, ...) preservam continuity across milestones e evitam ambiguity em paralelismo (multiple agents simultaneous).

## Recommended pattern — §−1 ARRANQUE

Agent prompts pasted to fresh Claude windows beneficiam de role-assertion preamble explícita no início do file (§−1 ARRANQUE ROLE ASSERTION). Sem isto, fresh windows com `AGENTS.md` + `CLAUDE.md` no contexto bootstram como master por default ("On First Message" protocol), causando role-poisoning. Ver primeira instantiação documentada num projecto-específico via lineage doc se existir.

## Subagent dispatcher pattern

Para research/audit/doc-generation tasks one-shot, masters podem usar Agent tool (Subagent) em vez de fresh window paste. Decision tree + mandate template + anti-patterns + cost considerations + examples documentados em [`SUBAGENT-PATTERN.md`](SUBAGENT-PATTERN.md). Template-generic; coexists com fresh window pattern.

## Project-specific history

Cada projecto que use esta directoria mantém um **`LINEAGE.md`** (opcional) com:
- Lista actual de orchestration files
- History v1 → v{N} masters
- Project-specific naming variants
- Lessons learned
- Future-work notes

`LINEAGE.md` é project-specific — NÃO faz parte do template genérico.
