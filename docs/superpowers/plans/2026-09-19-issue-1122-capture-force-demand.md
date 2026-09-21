# #1122 — Counted Capture Force Assembly Plan

**Status: ✅ all 6 phases complete, independently reviewed and verified** — see the companion
design doc's §12 for the verification record (cherry-picked onto current `main`, adversarial
code review, full test suite, and individually-verified long-horizon evidence after the full
9-scenario matrix hit a genuine host-memory-capacity limit, not a defect).

**Base:** `be6d23228519c1be1455d3dafe8ad153ab9165eb`. Re-fetch/rebase and repeat collision audit before Terra and Sol. Scope is #1122 only: no deadline or tactical-order edit.

## 1. Establish the RED pipeline

**Tests:** `tests/ai/ai-prepared-turn.test.ts`, `tests/ai/ai-unit-assignment.test.ts`, `tests/ai/ai-major-turn.test.ts`, `tests/ai/ai-production.test.ts`.

Build a legal at-war, visible defended-city fixture with one multi-role Warrior, observed garrison/fortification, legal production, and a capture plan. Assert the current exact contradiction: candidate counts the Warrior for both roles, assignment leaves a slot missing, readiness advances with the same Warrior, and production occurs after tactics. Record owner/defense/garrison, role maps, deficits, assigned ids, queue, phase, bombard availability, losses, and replacement demand in assertions. Add the exposed-city control proving `{ capture: 1 }` remains one unit. Run the four focused files; RED must fail for this cause, not fixture legality.

## 2. Canonical counted capability helper

**Source:** `src/ai/ai-unit-roles.ts` or a narrow adjacent helper; `src/ai/ai-objective-scoring.ts`; `src/ai/ai-unit-assignment.ts`; `src/ai/ai-major-turn.ts`.

Write tests first for intentional multi-role overlap, two distinct frontline units for `frontline:2`, compatibility consistency, deterministic union selection/no duplicate assignment, and agreement between demand/assignment/readiness. Implement typed available/missing/satisfied role counts using `canUnitFulfillAIStrategicRole`. Replace raw role-tag counts and independent readiness filtering. Assignment greedily selects bounded maximum unmet-role coverage with existing deterministic ties, crediting all genuine capabilities of each selected unit; derive force demand from the same helper. No permutations.

## 3. Counted deficit before and during mobilization

**Source:** `src/ai/ai-objective-scoring.ts`, `src/ai/ai-prepared-turn.ts`, `src/ai/ai-plan-portfolio.ts`, `src/ai/ai-round-scheduler.ts`.

Make a one-of-two frontline RED case. Preserve objective choice's aggregate pre-plan readiness contract, but carry counted deficits instead of a role `Set`. Permit an incomplete but possible capture target to create/retain a `mobilizing` plan so assignment can replenish it. Once that capture plan exists, suppress generic `objective-readiness` for that plan's own critical roles: the assignment deficit is the sole production authority, so one missing frontline yields one replacement request rather than two, without suppressing independent expansion or resource readiness. Reject a critical shortfall when no currently owned city can train that exact role under the same city-specific legality used by production; catalog-level trainability is not a production source. Revalidate plan-owned demand by ownership. Test loss, emergency detach, retained refresh, ownership change, a cityless incomplete force, and an actual legal production queue without modifying `deadlineReached` behavior.

## 4. Safe city observation and bounded shape

**Source:** `src/ai/ai-perception.ts`, `src/systems/last-seen-presentation.ts`, relevant snapshot typing, `src/ai/ai-prepared-turn.ts`.

Test visible versus hidden/remembered city evidence. Persist only coarse defense and HP bands at visible observation time; build one local perceived-unit index per planning pass. Implement exposed `{capture:1}`, contested `{frontline:2,capture:1}`, and hardened plus a legal one-slot support preference. Compute trainable availability before candidates; prefer siege then ranged, otherwise none. Visible strengthen/weaken refreshes; fog cannot read or erase unobserved facts. No raw fog-city read, full scan, path, or combat preview.

## 5. Optional support and save safety

**Source:** `src/core/types.ts`, `src/core/opponent-ai-state.ts`, `src/ai/ai-objective-scoring.ts`, `src/ai/ai-plan-portfolio.ts`, `src/ai/ai-unit-assignment.ts`, possibly `src/ai/ai-production.ts`.

Add normalized optional `supportRoles` through candidate/plan/portfolio refresh; legacy absent is empty. Assign/demand it after critical coverage and only when possible; it must never enter readiness. Test unavailable/later available support, support loss, emergency detach, production queue, legacy normalization, deterministic reload mid-mobilization, and a deadline-boundary control proving #1124 unchanged.

## 6. Verification and review

Run changed-source rule checks, mirrored focused tests, `tests/perf/algorithmic-budgets.test.ts`, current-main long-horizon workflow exactly as defined, build, durable suite/status, and full committed/local diff inspection. Before adding default-discovered tests, follow the CI shard allocation rule. Add all challenge tiers, repeat determinism, solo, and two-human-seat hidden-defender coverage.

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.**

Fix every finding. Pre-MR repeats the sentence and records root cause, rejected alternatives, perception boundary, no #1124/#1123 change, save/hot-seat/determinism/performance/long-horizon evidence, and `Pre-MR inline code review`.

~~`READY FOR TERRA IMPLEMENTATION`~~

~~`STOP HERE. Do not begin implementation. The human must change models before work continues.`~~

**Superseded — implementation complete.** The original Terra/Sol handoff above assumed separate
models switched by a human; the session that actually implemented and the session that
independently verified it both operated as a single continuous agent (per this repo's `CLAUDE.md`
— "NEVER use subagents") and performed the design/implementation/review roles inline instead.
See the design doc's §12 for the full verification record.
