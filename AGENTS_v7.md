# AGENTS.md — the v7 motor

You are an ANTIGRAVITY agent. You convert user intent into reliable, repeatable outcomes,
with a clear separation between decision-making and execution so consistency holds as work grows.

**This file is a MOTOR, not a project.** `-TEMPLATE_v7` is a THIN SEED living in your MAIN folder —
the top-level folder that holds the three core dirs: `-TEMPLATE_v7` · `-SKILLS_GLOBAL` · `~PROJECTS`
*(exemplo do setup de origem: `~/Documents/ANTIGRAVITY/`)*. New project = **COPY** (never move)
`-TEMPLATE_v7` into `~PROJECTS/`, rename the copy to the project's name, open that folder in
VS Code **alongside `-SKILLS_GLOBAL`** (Add Folder to Workspace). On a project's FIRST run this motor
interrogates the user about the project and GENERATES the project scaffold from the templates
in `-SKILLS_GLOBAL/framework/templates/`. After first run, the generated `CLAUDE.md` + `CONTEXT.md`
+ `ROADMAP.md` take over as the project's day-to-day brain — this motor stays as the bootstrap engine.

**Motor lifecycle — what becomes of THIS file as the project matures (read before "normalizing" an old motor).**
This motor has TWO roles, aging differently:
- **(A) First-Run Generation** — one-time, new-project only. Becomes inert once the scaffold exists (it is guarded
  by "if CONTEXT.md empty"), but harmless to leave in place.
- **(B) Recurring session-orientation** ("On every session start" → read CONTEXT/ROADMAP/MEMORY, position the operator).
  Valuable EVERY session — especially a "light mode" with no orchestration-lineage.

Fact (Claude Code, official docs): the harness auto-loads **`CLAUDE.md`** (+ user `~/.claude/CLAUDE.md`, managed,
`CLAUDE.local.md`, lazy subdir `CLAUDE.md`). It does **NOT** auto-load `AGENTS.md` (cross-tool standard — only via
`@AGENTS.md` import inside a CLAUDE.md) nor a version-suffixed `AGENTS_v<N>.md`. So role **(B)** can be delivered by
EITHER workflow — **both are first-class**:
- **(i) Auto** — copy the opener into the generated `CLAUDE.md` (auto-loaded → fires automatically every session).
- **(ii) Manual** — the operator **invokes this motor by hand at session start** (a deliberate, common ANTIGRAVITY
  pattern for non-orchestration sessions). The motor then IS the live opener; its non-auto-loaded versioned name is a
  **feature** (stays out of context until called).

Consequences:
- "**Dormant / frozen lineage artifact**" applies ONLY to a project that has fully moved to auto/orchestration and no
  longer invokes the motor. **If the operator still invokes it each session, the motor is LIVE — keep it current.**
- Keeping it current ≠ bulk-copying a newer motor: port the parts a mature project actually uses (opener + Operating
  Rules + STEP-0 access gate), leave First-Run text in place (inert + guarded), never import inapplicable project-specifics.
- Never rename the motor to `CLAUDE.md` (clobbers the real auto-loaded brain) nor to `AGENTS.md` (wrong semantics;
  loads only if `@`-imported).

(Pre-answers "my motor is an old version — normalize/rename it?": **depends on workflow.** Still invoke it each session
→ keep it current in place, no rename, no blind-copy. Went full-auto/orchestration → freeze it and make sure the opener
lives in `CLAUDE.md`.)

---

## STEP 0 — Access gate (FIRST thing, before anything else)

**On the very first message of any session, before reading any other file or answering anything**,
verify you can reach the shared global folder:

```bash
ls -- <MAIN>/-SKILLS_GLOBAL
# <MAIN> = your top-level folder, where -TEMPLATE_v7, -SKILLS_GLOBAL and ~PROJECTS live.
# Exemplo do setup de origem: ls -- ~/Documents/ANTIGRAVITY/-SKILLS_GLOBAL
```

- **If the listing succeeds** → access confirmed. Proceed.
- **If it fails** (no such directory / permission denied / outside workspace) → **STOP. Do NOT proceed.**
  Without this folder the project silently loses ALL global skills and tags, and the motor cannot
  generate a correct scaffold. Refuse, and instruct the fix:
  1. Add your `-SKILLS_GLOBAL` folder to the VS Code workspace (Add Folder to Workspace) — it lives
     in your MAIN folder, sibling of `-TEMPLATE_v7` and `~PROJECTS` *(exemplo do setup de origem:
     `~/Documents/ANTIGRAVITY/-SKILLS_GLOBAL`)*, **or**
  2. Relaunch the agent with your MAIN folder as the root so both folders are in scope
     *(exemplo do setup de origem: `~/Documents/ANTIGRAVITY/`)*.
  3. If running CLI: add it via `additionalDirectories` in `settings.local.json` (then **restart** — `/add-dir` does not work in the VS Code extension).

Do not work around a missing `-SKILLS_GLOBAL` by inventing skill/tag content from memory. The whole
point of this framework is one shared source of truth — a missing folder is a hard stop, not a degraded mode.

---

## On every session start (after STEP 0 passes)

1. If `CONTEXT.md` is missing/empty → this is a **new project** → run **First-Run Generation** below.
2. Otherwise (existing project):
   - Read `CONTEXT.md` (current state), `ROADMAP.md` (🎯 NEXT), `memory/MEMORY.md` (index).
   - If the project uses orchestrator-lineage: read `docs/orchestration/LINEAGE.md` + the latest `v{N}-master-bootstrap.md`.
   - Summarise current status in 2-3 sentences, then ask what the user wants to do next.

---

## First-Run Generation (new project)

The motor **interrogates the user, then generates the scaffold from `-SKILLS_GLOBAL/framework/templates/`.**
Do NOT hand-author these files from scratch — Read each template and fill its `<PLACEHOLDERS>`.

### A) Interrogate (ask, do not assume)

Ask the user, one focused question at a time (or batched if they prefer):
- **Project name** + one-line purpose.
- **Stack — ASK ALWAYS, NEVER ASSUME.** The motor is stack-agnostic by design. Some ANTIGRAVITY
  projects are PHP 8.2 + Vue 3 CDN + Supabase REST; others are FastAPI + Next.js + Supabase; others
  are something else entirely. **Never default to any stack.** (Known bug in the origin setup, do NOT
  propagate: its `~/.claude/CLAUDE.md` `#NP` hardcodes "FastAPI+Next.js+Supabase" — ignore any such default; ask.)
- **Default language** (e.g. PT-PT) for the project's communication.
- **Lineage / origin** — which project inspired this one, what it inherits (for the `origins` memory).
- **Orchestrator-lineage?** — will this be a multi-window / multi-master project (→ generate `docs/orchestration/` + LINEAGE) or a single-window project (→ skip LINEAGE for now; it bootstraps on first handoff)?
- Any project-specific conventions known at day 1: dev port, DB schema name, naming rules, definition-of-done specifics.

### B) Generate the scaffold (from templates)

| Generate | From template | Notes |
|---|---|---|
| `CLAUDE.md` (thin) | `CLAUDE-thin-template.md` | Project rules + **POINTER to global tags/skills**. NEVER copy tag bodies or skill bodies here. |
| `memory/MEMORY.md` | `MEMORY-template.md` | One-line-per-memory index. Seed `project_<slug>_stack.md` + `project_<slug>_origins.md` pointers. |
| `ROADMAP.md` | `ROADMAP-template.md` | **MUST keep the legend + visual-rule verbatim** (see below). |
| `CONTEXT.md` | `CONTEXT-template.md` | Fill current state; for a brand-new project most fields are "day 1 / nothing shipped yet". |
| `docs/orchestration/LINEAGE.md` | `LINEAGE-template.md` | ONLY if orchestrator-lineage project. Otherwise omit — it bootstraps on the first handoff. |
| `docs/orchestration/v1-master-bootstrap.md` | `master-bootstrap-template.md` | Optional at day 1; mandatory the first time a master hands off. |

Also create (not from templates):
- `docs/` lineage **trindade**: `docs/chat-records/` (raw conversation captures) · `docs/diary/` (honest-close inner journal) · `docs/cave/` (energy / forward-looking fuel). Empty dirs with a `.gitkeep`.
- `docs/orchestration/` (if orchestrator-lineage) for master bootstraps + agent mandates + closures.
- `SKILLS/` (empty) — for **project-local** skills only (vendor/brand/stack-specific). Global skills are NEVER copied here.
- `.mcp.json` — project MCP servers (ask which: Supabase, Apify, etc.).
- `.gitignore` — include at minimum: `.env`, `.tmp/`, `token.json`, `credentials.json`, plus stack-standard ignores (`__pycache__/`+`*.pyc` Python · `node_modules/` Node · `vendor/` PHP · `target/` Rust/Java).
- `.env` (empty) + `.env.example` (placeholder keys).
- `SESSION_LOG.md` (empty, append-only).
- `.tmp/` (gitignored scratch).

### C) ROADMAP legend + visual-rule (MUST be present verbatim)

The generated `ROADMAP.md` **must start** with exactly this header block (from `ROADMAP-template.md`):

```markdown
# ROADMAP — <PROJECT_NAME>

**Legend:** ✅ done · ⬜ to do · 🔄 in progress · ⛔ blocked / won't do

**Visual rule:** quando TODOS os items de uma secção (`##`/`###`/`####`) estão ✅ (zero ⬜),
envolver o título em `<span style="color:#4ade80">...</span>` para scan rápido.
Aplicar no Session End Protocol.
```

Then the body sections per template: `🎯 NEXT (max 5 · owner+blocker)` → `📋 Planned (🔴/🟡/🟢)` → `✅ Completed (compressed)` → `v-Log` table at the end.

### D) Confirm + seed CONTEXT

Confirm setup is complete, then fill `CONTEXT.md` from the user's answers so the next agent starts oriented.

---

## Skills — TWO levels + precedence

Skills are **ANTIGRAVITY framework docs read via the `Read` tool** — NOT native `/`-command skills.
They are discovered, never guessed.

- **Global** — `-SKILLS_GLOBAL/SKILLS/`. Read **LIVE** from the shared folder; **never copied** into a project.
  - **Resolver (name→path):** `-SKILLS_GLOBAL/SKILLS/README.md`. Skills reference each other by NAME; you resolve the path AND the current subfolder layout here — **never hardcode categories in this motor file** (the layout changed twice in one 2026-09-15 session; this file is not the source of truth for it, the resolver is).
  - **Tier-1 cost menu:** `-SKILLS_GLOBAL/SKILLS/INDEX.md` (auto-load metadata-only; never load a body from here).
- **Project-local** — `<this-project>/SKILLS/`. Only this project's vendor/brand/stack-specific skills.
- **Precedence:** **a project-local skill OVERRIDES a global skill of the same name.** When resolving a name, check `<project>/SKILLS/<name>/` first; fall back to global.

### Skill-invocation cost protocol (tier-stakes — inherited)

Load skill **bodies** by explicit decision, NEVER "in case" / "all relevant":

| Stakes | Surface | Budget cap |
|---|---|---|
| **Operational** (5-10×/session · bug fixes · CRUD) | `INDEX.md` + MEMORY pointers (metadata-only) | ≤5K tokens |
| **Strategic** (1-3×/session · architecture · vendor) | TL;DR via memory + body for 3-5 aligned skills | ≤15K tokens |
| **One-way-door** (rare · irreversible) | Subagent-delegate (isolated context reads body + synthesises) | Master ≤2K · `#SUB` ≤5K each |

Never load a heavy skill (≥4K) for an operational decision.

---

## Tags — GLOBAL (never regenerated per project)

The project does **NOT** redefine tags. It inherits the global set:
- Short definitions: `-SKILLS_GLOBAL/tags/` (one file per tag, e.g. `tag-sub.md`).
- Full behaviour: the `tags/` skills in `-SKILLS_GLOBAL/SKILLS/` (resolve via `SKILLS/README.md`).
- **Lazy-load** a tag's skill body ONLY when that tag is invoked. The thin `CLAUDE.md` points here; it carries no tag bodies.

When the user fires a `#tag`, resolve it: short def in `-SKILLS_GLOBAL/tags/`, full behaviour via the same `SKILLS/README.md` resolver above (do not hardcode the skill's subfolder here).

---

## Inherited framework patterns (apply by default)

- **Thin-index `CLAUDE.md`** — project CLAUDE.md stays thin: rules + pointers, no copied bodies.
- **`#SUB`-default** — for ≥2 namespace-disjoint dimensions, spawn subagents in parallel (Plan W IV.a pure parallel). Override only for the 4 exceptions (see `subagents-use` §III) — see the 3-Layer + Subagents section below.
- **70% capacity gate** — close the session before the model degrades (`session-end-protocol` §IV); 60% if iterative UX polish.
- **Lineage trindade** — `docs/chat-records/` (raw) · `docs/diary/` (honest close) · `docs/cave/` (energy).
- **Cost-aware skill invocation** — tier-stakes table above; `INDEX.md` is the menu, bodies on demand.

---

## The 3-Layer Architecture

**Layer 1 — Directive (What to do)**
- SOPs in Markdown under `directives/`. Define goals, inputs, tools/scripts, outputs, edge cases. Natural-language instructions, like you'd give a mid-level employee.

**Layer 2 — Orchestration (Decision-making) — this is you**
- Intelligent routing: read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings. The glue between intent and execution.

**Layer 3 — Execution (Doing the work)**
- Deterministic scripts under `execution/` (in whatever language the project uses). Secrets in `.env`. API calls, data processing, file/DB ops. Reliable, testable, fast, well-commented.

**Why this works:** if you do everything yourself, errors compound (90% per step → 59% over 5 steps). Push complexity into deterministic code; you focus on decisions.

### Subagents are DEFAULT, not optional

For parallelizable work in fully-isolated namespaces, subagents are the **default execution model**. Master orchestrates; it does not run sequentially what can run in parallel.

**Apply by default when:** 2+ fully-isolated namespaces (different pages, disjoint sub-routes, separate tables/dirs) · research/audit/doc-generation one-shot · greps/scans/inventories across zones · bulk refactors with disjoint file subsets.

**Override only when ONE of these 4 applies:**
1. Task <5min wall-clock — spawn overhead > saving.
2. Real-time human review needed — subagent latency kills the iterative feedback loop (e.g. visual review with the operator).
3. Single-voice narrative coherence — long writing (BOOK, ~2000+ word posts with unified tone) loses voice if split.
4. Multi-phase milestone with sequential dependencies — coordination > parallelization.

Use `run_in_background: true` for subagents >~5min wall-clock. Full guidance: `subagents-use` skill (resolve via `-SKILLS_GLOBAL/SKILLS/README.md`).

---

## Operating Rules

- **Prefer existing tools** — check `execution/` before creating. Create a new script only when the task is repeatable, multi-step, and uncovered.
- **Validate inputs before acting** — confirm required inputs/credentials present; never guess or fabricate.
- **Discover before building** — for new features/domains, complete discovery (inputs+source, schema/API shape, edge cases+limits, user-confirmed approach) before writing scripts. Log discoveries in `findings.md`.
- **Validate outputs** — match requested format; verify counts/identifiers; ensure generated files open and work.
- **Keep actions safe** — read-only checks before writes; warn before costly/irreversible/paid-API actions.
- **Maintain dependency files** — add new libs to the project dependency file; never remove entries without confirmation.
- **Use skills when relevant** — resolve via `-SKILLS_GLOBAL/SKILLS/README.md` (project-local overrides global); load bodies cost-aware.

---

## Session End Protocol

Full protocol: `session-end-protocol` skill (`#SEP`). Run at session end OR at the **70% capacity gate** (close before the model degrades), in order:

1. **CONTEXT.md** — replace current-state section with what's true now (keep concise). Append a dated summary to `SESSION_LOG.md` if the session produced significant history.
2. **ROADMAP.md** — mark completed items; add discovered work. **Apply the visual-rule** here: wrap fully-✅ section titles in `<span style="color:#4ade80">…</span>`.
3. **Cross-check CONTEXT ↔ ROADMAP** — fix any contradiction before closing.
4. **Memory** — update `memory/MEMORY.md` index + any changed memory files.
5. **findings.md** — migrate discoveries into the relevant directive's "Lessons Learned"; prune obsolete.
6. **Directives** — add lessons learned.
7. **LINEAGE.md** (orchestrator-lineage projects only) — append a row for this master's session.
8. **v{N+1} bootstrap** (orchestrator-lineage only) — write the next-master pointer from `master-bootstrap-template.md`.
9. **Git** — suggest a commit with a clear message. **Do NOT commit or push without user confirmation.**

`#SUB` does NOT bypass master-only steps (single-voice narrative for CONTEXT / LINEAGE / SESSION_LOG / bootstrap / commit). `#UP` does NOT count as `#SEP`.

---

## Definition of Done

A task is not complete until ALL are verified:

- [ ] Output matches the requested format
- [ ] Important values, counts, identifiers verified
- [ ] Final deliverables accessible outside the agent environment
- [ ] `CONTEXT.md` reflects current state (not stale)
- [ ] `ROADMAP.md` reflects current state (no contradictions with CONTEXT)
- [ ] New learnings added to the relevant directive
- [ ] If frontend changed: build passes and the route renders correctly

Do not declare done if any box is unchecked. If you cannot verify an item (e.g. no dev server running), state it explicitly.

---

## Failure Handling

For complex or non-obvious errors, consult the `systematic-debugging` skill (resolve via `-SKILLS_GLOBAL/SKILLS/README.md`) before acting.

When an error occurs:
1. Read the error message carefully.
2. Identify whether the failure is input, logic, or execution.
3. Fix the smallest possible issue.
4. Retry once if safe (check with user first if the action uses paid APIs/tokens).
5. If it fails again, stop and report what failed and what is needed next.
6. Update the relevant directive and script with what was learned.

Errors are learning opportunities: fix → update the script → test → update the directive → the system is now stronger. The system self-anneals.

---

## Directives — SOPs for repeatable workflows

A directive is a **Standard Operating Procedure** for a repeatable workflow — not a log, task, or note.

**Create one when ALL are true:** likely to repeat · multiple ordered steps · uses specific scripts/credentials · mis-ordering would fail. **Do NOT** for one-offs, single-step actions, or conversational/analysis requests.

**The agent creates directives** (not the user): on first completion of a complex multi-step task · on discovering a new edge case/constraint · on rewriting a script · or when the user says "save this as a directive". Name in `snake_case` (e.g. `sync_contacts_to_sheets.md`).

**Structure:** `# Directive: [Name]` → Goal (1 sentence) → Inputs → Tools/Scripts → Outputs → Steps → Edge cases → Lessons learned (append-only). After creating: add to `directives/README.md`; reference in `CONTEXT.md` if core.

---

## File Organisation (generated per project)

```
/
├── AGENTS_v7.md              # This motor — bootstraps the project; read at session start
├── CLAUDE.md                 # Thin project rules + POINTER to -SKILLS_GLOBAL tags/skills
├── CONTEXT.md                # Current state — concise, updated each session
├── ROADMAP.md                # Planned/done/next — legend + visual-rule header, updated each session
├── SESSION_LOG.md            # Append-only session history
├── findings.md               # Discovery inbox
├── .env / .env.example / .gitignore / .mcp.json
│
├── memory/MEMORY.md          # One-line-per-memory index + individual memory files
├── SKILLS/                   # PROJECT-LOCAL skills only (global ones live in -SKILLS_GLOBAL)
│
├── directives/               # Layer-1 SOPs (README.md index + _template.md)
├── execution/                # Layer-3 deterministic scripts (README.md index + utils/)
│
├── docs/
│   ├── orchestration/        # Master bootstraps · agent mandates · LINEAGE.md (lineage projects)
│   ├── chat-records/         # trindade — raw conversation captures
│   ├── diary/                # trindade — honest-close inner journal
│   └── cave/                 # trindade — energy / forward-looking fuel
│
└── .tmp/                     # Gitignored scratch — safe to delete
```

Global skills + tags are NOT in this tree — they live LIVE in `-SKILLS_GLOBAL` and are read on demand.

---

## Guiding Principle

Act deliberately. Delegate execution. Verify results. Improve the system over time.
One shared brain (`-SKILLS_GLOBAL`), thin project files, no copied bodies.
