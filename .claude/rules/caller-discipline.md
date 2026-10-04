---
paths:
  - "src/**"
---

# Caller Discipline → Structure (#1014)

A rule that says "the caller must remember X" is a **bug report against the API**, not a
solution. Every contract of that shape has either already failed (movement legality four times,
the production-cost option bag twice, one-sided war, the beast slay on every non-player executor)
or is waiting for the next caller. The categorised inventory is
[`docs/caller-discipline-inventory.md`](../../docs/caller-discipline-inventory.md); this file is
the working policy.

## Decision procedure for a new contract

Before writing "callers must…" anywhere (a comment, a rules file, a PR body), pick the strongest
row that fits and build that instead:

| If the contract is… | Build | Working example |
|---|---|---|
| **An ordering** ("A before B") | One function that runs B as a callback after doing A, and stop exporting A | `withSettlementSigned` (war-history): the settlement event can only be written by the function that then runs the peace transition |
| **A paired cost/consequence** ("also deduct/record X") | One command that validates, applies and pays; make the unpaid primitive private | `applyUnitUpgradeToState` owns the gold; `applyUpgrade` is no longer exported |
| **A consequence of a fact every executor shares** ("must be called from every path that…") | Move it into the function every path already funnels through; return a payload for the caller | Beast slay lives in `applyCombatOutcomeToState` (`beastsSlain`), announced there when a bus is given |
| **A single legal entry point** ("UI must never call the inner step") | A source rule (`scripts/check-src-rule-violations.sh` + the hook mirror + both smoke tests) **and** an importer pin (an `only-imported-by` rule in `tests/app/architecture/rules.ts`, or for older blocks `architecture-boundaries.test.ts`) | `resolveStrategicStrike` has one caller; the low-level unit movers; the single-side diplomacy writers |
| **A relationship between two parts of state** ("index A must agree with index B") | A `SAVE_STATE_INVARIANTS` assert, with an earned-control test per violation, wired into the AI-playability fixture | `beast-lair-integrity`, `cargo-reciprocity`, `air-base-integrity`, `bilateral-war` |
| **A table the AI/UI must consult** ("new X must add a row") | A data table read generically, plus a completeness test | `UNREST_RELIEF_SOURCES`, `NP_PRODUCTION_DISCOUNTS` |
| **Two same-representation primitives in different roles** ("this string is the actor, that string the target") | Make the roles structural: a required-field options object, or a brand built only by one boundary helper | `EspionageModifierQuery` / `TurnCapturedSpyCommand` / `SensedUnits` (#1022) |
| **A note about a fact** ("both sides' notifications were already logged") | Leave it. Say why it is safe. | — |

Do not convert a contract whose enforcement would cost more than the bug it prevents, and say so
in the inventory rather than leaving it unclassified.

## Import-direction constraints are declarative (#1241)

A constraint of the form "A must not import B", "A takes exactly this binding from B", "this group has
no cycle" or "only these modules import X" is **a rule entry, not a new regex test**. Add it to
`ARCHITECTURE_RULES` in `tests/app/architecture/rules.ts` (kinds and semantics: `rule-engine.ts`; the
graph: `import-graph.ts`, TypeScript-parser based, `@/` aliases resolved, runtime vs type-only edges).
Every rule has a stable `id`, an explicit edge scope (`runtime` | `all`) and a `why`; a failure prints
all three plus the offending edge. A matcher that matches no module, an exception whose edge is gone,
and an allowed importer that imports nothing all **fail** — a rule cannot rot silently after a rename.
Prove a new rule bites with a fixture graph in `rules.test.ts`. Barrel/export-surface and other
runtime-semantic checks stay in `architecture-boundaries.test.ts`; blocks there migrate one at a time
(#1012 first).

**Reducing a runtime import cycle (#1248).** `bash scripts/run-with-mise.sh yarn architecture:scc`
(`scripts/report-runtime-scc.ts`, same graph, type-only edges excluded like the #1013 baseline) prints each runtime
SCC, its internal edges with the bindings each carries, the single edges whose removal shrinks it, and a greedy cut
sequence. The cheap wins have been *barrel-mediated* edges (import the leaf that defines the binding, not the module
that re-exports it) and *tiny predicates stranded in a heavy module* (move them to a leaf); an edge carrying a real
command or state transition is an ownership problem and needs its own slice. Each cut ships with a declarative rule
that pins it and a regenerated `docs/maintainability-audit-baseline.json` (never regenerated to admit a larger SCC or a
module that was not in it before — the `#1013` check reports membership, so a gained module is visible).

## Ambiguous primitives (#1022)

When an exported API takes several values with the same runtime representation but different
meanings, name the roles — but only when misuse is plausible. The ranked audit and the
"leave as-is" list live in [`docs/type-safety-inventory.md`](../../docs/type-safety-inventory.md).

- **Prefer named roles over positional ones** when two-or-more same-typed arguments sit next to
  each other and swapping them compiles:
  `getEspionageModifierBreakdown(state, { actingCivId, targetCivId, targetCityId })`. Use
  **required** fields — an options object with optional fields is *less* safe than positional
  parameters (see the `ProductionCostContext` history).
- **Prefer a brand confined to one constructor** when the value is a capability that must come
  from exactly one place: `SensedUnits` can only be built by `campSensedUnits(...)`, so passing a
  global unit scan is a compile error.
- **Do not brand** a primitive whose casts would outnumber the mistakes it prevents (`UnitId`,
  `HexKey`, a vague `TurnNumber`), and do not brand a concept already covered by a canonical
  query or classifier (`getCivilizationLiveness`, `classifyOwner`, `WorldAge`/`CivilizationEra`).
  Classify it in the inventory instead.
- Prefer compile-time-only types: making a mistake unrepresentable must not change runtime
  representation, save format or require a migration.
- Ship a compile-time negative fixture (`@ts-expect-error`) per adopted change; `tsc` in
  `yarn build` enforces it.

## Rules

- **Write the mechanism into the rules text.** A `.claude/rules/` sentence that names a discipline
  is replaced by a sentence naming the thing that enforces it (and the test that pins it). If
  there is no enforcer yet, the sentence links the open issue instead of pretending.
- **A new source rule extends the two existing mechanisms** (`check-src-rule-violations.sh` and its
  `check-src-edit.sh` mirror). It ships with a script test and a hook smoke test, exempts comment
  lines, and names the sanctioned files in a `case` block.
- **A unit is removed by one function, not by `delete`.** `removeUnits` / `removeUnitsFromSlice`
  (`src/systems/unit-removal-system.ts`, #1198) owns the whole cascade: unit table, major and minor
  rosters, cargo of a removed transport, a surviving transport's manifest, a removed carrier's air
  wing (to any depth), a dead spy's record, a removed caravan's trade route. Pick a `reason`
  (`destroyed`/`disbanded`/`eliminated`/`consumed`/`trips-exhausted`); only two things vary by it —
  `consumed` keeps a spy's record, and the route-ended reason. It does **not** reconcile civilization
  liveness (the orchestrator that owns the whole transition does) and does not touch the Great General
  ledger (`generalHistory` outlives its unit). A hand-rolled `delete`/rest-destructure/filter-rebuild of
  `units` is blocked by the source rule and swept by `architecture-boundaries.test.ts` "#1198".
- **A combat executor applies a fight through `applyCombatOutcomeToState`.** Everything that is a
  *consequence of the kill* belongs inside it (#1200): the kill's unit removal (#1198), the route of a
  *captured* caravan, the camp under a defeated unit (`campDestroyed` fact; only a major killer is paid),
  the beast slay, and the combat record (`lastCombatTurnByLandmass`) for **every major civ in the fight**.
  Everything that is a *presentation of the fight* — toasts, advisor, animation, `combat:resolved`,
  `combat:reward-earned`, quest-transition emission, city-assault follow-ups — is the executor's, driven
  from the returned payload. A `bus` means a real execution; no bus (AI lookahead) stays silent. The
  executor list is pinned in `architecture-boundaries.test.ts` "#1200": a new executor must be added there,
  and no executor may name `recordCombatForCiv`/`removeRouteForUnit` itself. Occupying an *empty* camp is a
  move, not a fight result, and is still the mover's (player, AI turn, AI tactics).

## What is enforced, and where

| Contract | Mechanism | Pinned by |
|---|---|---|
| Settlement is logged before peace | `withSettlementSigned` owns the order; `recordSettlementSigned` no longer exists | `war-history-system.test.ts`, `architecture-boundaries.test.ts` "#1014" |
| Camp, route-on-capture and combat record apply for every executor | folded into `applyCombatOutcomeToState` (`campDestroyed`, `releaseCapturedUnitsFromRoutes`, `recordCombatForCiv`) | `combat-reward-system.test.ts` "consequences of a kill belong to the shared outcome (#1200)", architecture pin "#1200" |
| Beast slay applies for every executor | folded into `applyCombatOutcomeToState`; event owned there | `combat-reward-system.test.ts` "beast slay is a consequence of the kill", architecture pin, source rule, `beast-lair-integrity` |
| An upgrade takes its gold | `applyUpgrade` private | `unit-upgrade.test.ts`, architecture pin |
| Strategic strike consequences | `resolveStrategicStrike` has one caller | source rule, architecture pin |
| Single-side vassalage mutators | importable only by `diplomacy-vassalage.ts` | architecture pin |
| Any unit removal takes cargo/air wing/manifest entry/spy record/trade route with it | `removeUnits` is the only transition; raw `units` deletes are a source-rule violation | `unit-removal-system.test.ts`, source rule + hook mirror, architecture pin "#1198", `SAVE_STATE_INVARIANTS` |
| Disband confirmation names the extra units | `removePlayerUnitFromState` = `removeUnits` + liveness; the dialog previews it | `unit-lifecycle-system.test.ts`, `unit-turn-flow.test.ts` |
| A finished unit gets every completion side effect, on both entry points | `completeUnitProduction` is the only completion (turn path + rush-buy) | `unit-production-completion.test.ts` matrix + footprint guard, architecture pin "#1202" |
| Publication after a state write | `commit`/`batch`; no silent write | `session-publication.md` |

## Open follow-ups (evidence in each issue)

Action-contract gaps from the #1025 audit — none left open (attack legality #1219, queue enqueue #1220, diplomatic denial #1221, espionage `startMission` #1222 and air-mission reasons #1223: done; see `docs/action-contract-inventory.md`) ·
#1199 finish #1015 (hand pushes, in-place mutation) ·
#1201 espionage consequences/recipients. (#1198 canonical unit removal, #1200 combat consequences and
#1202 trainable-unit wiring: done.)
