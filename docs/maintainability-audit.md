# Maintainability audit (#1013)

This is the narrative companion to the generated measured report. It answers the
question issue #1013 asks — *which production modules carry excessive
responsibility or drift across boundaries, and what evidence says so* — without
turning line count into a merge gate. **No production module is refactored here**;
the deliverable is the measurement, the structural guard, and focused follow-up
issues.

## How to reproduce

| Artifact | Produced by | Checked in |
|---|---|---|
| `docs/maintainability-audit-report.md` | `./scripts/run-with-mise.sh yarn node scripts/maintainability-audit.mjs --report` | yes (generated; do not hand-edit) |
| `docs/maintainability-audit-baseline.json` | `./scripts/run-with-mise.sh yarn node scripts/maintainability-audit.mjs --baseline` | yes (the drift baseline) |
| Drift check | `./scripts/run-with-mise.sh yarn node scripts/maintainability-audit.mjs --check` | run by `tests/app/architecture-boundaries.test.ts` ("#1013") |

The script is dependency-free and deterministic (all traversal and reporting is
sorted; the guard test runs `--json` twice and asserts byte-identical output).

## Why line count is the wrong lens

The three `*-map-data.ts` files are ~178k of the ~271k `src` lines and are
generated (`yarn generate-maps`); the script excludes them explicitly, and treats
`src/core/types.ts` separately (a shared type module is legitimately large). What
remains is scored on:

1. **responsibility** — assessed by reading; the report's export categories are a
   name-prefix *screening* heuristic (with an `other` bucket for unmatched names),
   not a verdict.
2. **export density** — exports per 100 lines: how little encapsulation remains.
3. **fan-in × surface** — the report ranks by `export density × direct runtime
   fan-in`: a widely imported module with a large public surface forces unrelated
   consumers to depend on each other. A cohesive data catalog has near-zero
   density and is not penalized for its size (`unit-definitions.ts` has fan-in 95
   and density 0.13).

## Highest-surface modules (from the generated report)

| Module | Surface | Lines | Exports | Density | Fan-in | Responsibility assessment |
|---|---:|---:|---:|---:|---:|---|
| `src/systems/trade-system.ts` | 104.5 | 505 | 24 | 4.75 | 22 | Marketplace pricing **and** trade-route lifecycle **and** caravan resolution; definitions + queries + commands; imports `core`. |
| `src/systems/faction-system.ts` | 101.5 | 918 | 49 | 5.34 | 19 | Unrest-pressure model **and** federalism toggle **and** courthouse/bureaucracy/railway relief **and** `processFactionTurn`; definitions + queries + commands + turn. |
| `src/ui/notification-routing.ts` | 76.2 | 1221 | 62 | 5.08 | 15 | Presentation-only but 62 `route*`/`format*` entry points across diplomacy, combat, crisis, espionage, world-race and settlement domains with no domain grouping. |
| `src/systems/city-territory-system.ts` | 72 | 667 | 32 | 4.8 | 15 | Territory expansion + border effects + presentation helpers. |
| `src/systems/map-generator.ts` | 71.8 | 543 | 15 | 2.76 | 26 | Seeded generation, defended by tests; high fan-in is expected. |
| `src/systems/air-operations-system.ts` | 71.3 | 526 | 25 | 4.75 | 15 | Air basing + interception + presentation. |
| `src/systems/combat-system.ts` | 63 | 600 | 21 | 3.5 | 18 | Combat resolution with many query surfaces. |
| `src/systems/network-plan-system.ts` | 57.5 | 522 | 20 | 3.83 | 15 | Rail/road network planning + validation + commands. |

## Re-audit of the previously named hotspots

| Module | Lines | Exports | Density | Fan-in | Assessment |
|---|---:|---:|---:|---:|---|
| `src/ui/notification-routing.ts` | 1221 | 62 | 5.08 | 15 | Confirmed: a giant presentation dispatcher; split by notification domain. |
| `src/core/turn-manager.ts` | 18 | 4 | — | 1 | Resolved by #1239 (phase order pinned) / #1240: `processTurn` is a reduce over `ROUND_PHASES`; the former 1596 lines are one module per phase under `src/core/round-phases/`. No longer over 500 lines. |
| `src/ai/basic-ai.ts` | 2042 | 7 | 0.34 | 1 | AI turn orchestration; low API surface, large body. |
| `src/ai/ai-tactics.ts` | 1402 | 7 | 0.5 | 1 | Tactical decision queries; cohesive, low fan-in. |
| `src/ui/city-panel.ts` | 1920 | 2 | 0.1 | 1 | Large but well encapsulated (2 exports, 1 importer) — a UI-cohesion question, not an API-surface one. |
| `src/ui/selected-unit-info.ts` | 1383 | 6 | 0.43 | 1 | Presentation; encapsulated. |
| `src/systems/legendary-wonder-system.ts` | 1092 | 19 | 1.74 | 9 | Queries + commands + turn processing; candidate but lower raw surface. |
| `src/systems/pirate-system.ts` | 963 | 5 | 0.52 | 1 | Commands + turn; encapsulated. |
| `src/systems/minor-civ-system.ts` | 992 | 14 | 1.41 | 6 | Definitions + commands + turn. |
| `src/systems/combat-reward-system.ts` | 957 | 19 | 1.99 | 14 | Queries + commands + presentation; candidate. |

The map-data rows and `src/core/types.ts` in the original issue table are resolved
by exclusion: generated data is not a module, and `types.ts` is reported
separately so it cannot distort the ranking.

## Circular dependencies

The generated report lists the exact runtime cycles (2) and all-edge cycles
including type-only (8). The dominant runtime cycle is a 35-module strongly
connected component inside `src/systems` (combat, crisis, economy, espionage,
faction, minor-civ, pirate, quest, religion, rogue-host, stampede, threat,
transport, unit-movement, world-race). There is also a 3-module `src/ai` cycle.
Type-only cycles in `src/core`, `src/presentation`, `src/platform` and
`src/ui/diplomacy-panel ↔ vassalage-controls` only exist because of type imports
and are lower risk.

## Duplicate domain queries

Two modules answering the same question differently is the highest-value find
(it is the precursor to the alternate-executor bug class). Current state:

| Question | Canonical owner | Duplicate / residual | Status |
|---|---|---|---|
| Civilization liveness | `getCivilizationLiveness` (`src/systems/civilization-liveness.ts`) | `src/systems/pirate-system.ts:133-134` (`.cities.length > 0`), `src/core/round-phases/per-civ/city-production.ts:56`, `src/ai/basic-ai.ts:1117/1140/1431` | **Residual.** The #1019 source rule blocks new roster-length liveness outside sanctioned files; these are known/pre-existing. |
| Owned cities / units | `getOwnedCities`/`getOwnedCityCount`, `getOwnedUnits`/`getOwnedUnitCount` (`city-ownership.ts`, `unit-ownership.ts`) | none found outside the #1019/#1020-sanctioned files | **Healthy.** Adoption is broad (AI, systems, UI, core). |
| Civilization era vs world age | `resolveCivilizationEra` (tech-derived) vs `worldAgeFromNumber(state.era)` | `ProductionCostContext.era` was the historical divergence | **Closed.** `ProductionCostContext.era` is branded `CivilizationEra` and `buildProductionCostContext` can only pass `resolveCivilizationEra` (#984/#1016/#1017). Re-verify `legendary-wonder-presentation.ts:134`, which reads `state.era` for a display threshold. |
| Viewer safety | `getVisibility`/`isVisible` (`src/systems/fog-of-war.ts`) | direct `visibility.tiles[...]` reads in `pirate-actions.ts:231,239`, `pirate-ecology.ts:194`, `council-memory.ts:57`, `ai-prepared-turn.ts:297`, `pirate-presentation.ts:83`, `pirate-audio-director.ts:50`, `last-seen-presentation.ts:171` | **Residual.** Writes in `fog-of-war.ts`/`espionage-turn.ts` are canonical; the reads bypass the helper. |
| Session publication | `GameSession.commit/update/batch` + `bootstrap` subscription | closed in #1199 | **Closed.** Enforced by `architecture-boundaries.test.ts` and `check-src-rule-violations.sh`. |
| Notification audience | `getNotificationTargetsForEvent` (`notification-routing.ts`) | none | **Single owner.** |
| Roster / index authority | `city-ownership.ts`, `unit-ownership.ts` | rule-gated | **Healthy.** |

## Structural guard

`tests/app/architecture-boundaries.test.ts` ("#1013") spawns
`scripts/maintainability-audit.mjs --check` and fails when the runtime-cycle,
all-edge-cycle, or cross-layer-edge sets differ from
`docs/maintainability-audit-baseline.json`. It also proves `--json` is
deterministic and that the check bites (a synthetic empty baseline is rejected).
This is the "at least one automated check" the issue requires. It deliberately
does **not** gate on line count or export density. The broader declarative
import-graph rule layer is #1241; this is the immediate, minimal guard for this
audit.

## Follow-up issues

Filed from this audit (no production refactoring here):

- #1250 — decompose `src/ui/notification-routing.ts`.
- #1248 — break the `src/systems` runtime import cycle.
- #1246 — decompose `src/systems/faction-system.ts` (done: `faction-unrest-model` / `-federalism` / `-relief` / `-pressure` / `-commands`; `faction-system.ts` is now the turn orchestration only).
- #1249 — decompose `src/systems/trade-system.ts`.
- #1247 — route viewer-scoped tile reads through `getVisibility`/`isVisible`.

## Non-goals

- No module is split in this change.
- Line count / export density is not a merge gate.
- `src/core/types.ts` and generated `*-map-data.ts` are out of scope.
