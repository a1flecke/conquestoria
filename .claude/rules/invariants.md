---
paths:
  - "src/systems/**"
  - "src/core/**"
  - "src/ai/**"
  - "src/storage/**"
---

# Cross-System Invariant Catalog (#1003)

What must be true of `GameState` relative to itself — walked across every top-level key
(`src/core/types.ts:2188+`) — and how each one is actually enforced today: a shared assert in
`SAVE_STATE_INVARIANTS`, a compile-checked exhaustive map (`ELIMINATED_CIV_AREAS`), a source rule
(`scripts/check-src-rule-violations.sh` / `.claude/hooks/check-src-edit.sh`), a dedicated open
issue, or discipline only (a comment, nothing mechanical).

This is a **catalog of relational `GameState` invariants**, not a restatement of every "must/never"
sentence in `.claude/rules/`. A grep for that vocabulary across the rules files returns 300+ hits,
the overwhelming majority of them balance/content prose (yield ceilings, movement-bonus stacking
caps, era-scaled costs) that is not a cross-system state relationship and is already enforced by its
own dedicated tests (`national-project-balance.test.ts`, `wonder-definitions.test.ts`,
`road-system.test.ts`, and the rest of `game-balance.md`'s own test references). Those are
deliberately **out of scope here** — see that non-goal in #1003's own issue body ("do not brand
every implicit assumption an invariant... short enough to read").

## The three mechanisms this catalog classifies against

1. **`SAVE_STATE_INVARIANTS`** (`tests/helpers/save-state-invariants.ts`) — a flat array of named
   `(state) => void` asserts, run by the save-compat matrix and the AI-playability fixture after
   every processed round. The general-purpose mechanism: name an invariant, write one function, add
   one array line.
2. **`ELIMINATED_CIV_AREAS`** (`tests/helpers/eliminated-civ-areas.ts`) — `Record<keyof GameState,
   EliminatedCivArea>`, compile-enforced exhaustive (a new `GameState` field is a type error until
   classified `teardown` / `historical` / `structural`). Scoped to exactly one question: does an
   eliminated civ leave a trace here. The single most complete key-by-key map of `GameState` that
   exists in this codebase — this catalog reuses its domain classification rather than re-deriving
   it, and does **not** repeat elimination-teardown detail already documented there.
3. **Source rules** (`scripts/check-src-rule-violations.sh`, mirrored in
   `.claude/hooks/check-src-edit.sh`, both fired by the `PostToolUse` hook on every `src/` edit) —
   structural bans on a known-bad call shape, independent of any specific `GameState` value.

## Civilizations, units, cities, and ownership

| Area | Invariant | Enforcement |
|---|---|---|
| `civilizations`, `units`, `cities` — unit ownership | `unit.owner` ⟺ owner's unit roster (major civ `civ.units` or minor civ `mc.units`) | `SAVE_STATE_INVARIANTS: unit-rosters` (shared assert exists); **#996 open** for the exhaustive/property-level suite beyond this shared check |
| `civilizations`, `units`, `cities` — city ownership | `city.owner` ⟺ owner's city roster (major `civ.cities` or minor `mc.cityId`) | `SAVE_STATE_INVARIANTS: city-rosters` (shared assert exists); **#997 open** for the exhaustive/property-level suite |
| `civilizations.*.diplomacy.atWarWith` | Major↔major war is bilateral, deduplicated, no self-war | `SAVE_STATE_INVARIANTS: bilateral-war` + `normalizeBilateralWar` repair (**#995, closed**) |
| `civilizations.*.diplomacy.treaties` | A treaty recorded by one side has a matching record on the other (same type); no self-treaty; no duplicate same-type treaty with the same partner | `SAVE_STATE_INVARIANTS: treaty-reciprocity` (**new, this MR**) + source rule blocking a stray `signTreaty(` call outside `diplomacy-system.ts`/`diplomacy-step.ts` (**new, this MR**) |
| `civilizations.*.diplomacy.vassalage` | Overlord/vassal reciprocal both directions; depth-1 star (an overlord has no overlord; a vassal has no vassals); no self-vassalage | `SAVE_STATE_INVARIANTS: vassalage-reciprocity` (**new, this MR** — was repair-only via `normalizeVassalage`, no live-state assert existed before) |
| `civilizations.*` — elimination | An eliminated civ retains no live entity or obligation anywhere in `GameState` | `ELIMINATED_CIV_AREAS` + `assertEliminatedCivHasNoLiveEntities` (**#1001, closed**) |
| `units.*.cargoUnitIds` / `.transportId` | Naval transport↔cargo dual reference stays reciprocal, capacity-bounded, same-tile, land-only cargo | `SAVE_STATE_INVARIANTS: cargo-reciprocity` (**#1000, closed**) |
| `units.*.airBase` | Carrier/city-based aircraft resolve to a live, capacity-bounded, same-owner, same-tile host | `SAVE_STATE_INVARIANTS: air-base-integrity` (**#1000, closed**) |
| `currentPlayer` | Turn cycling never hands the turn to an eliminated civ | `ELIMINATED_CIV_AREAS.currentPlayer` (teardown) |
| `map` / any occupying-entity check | No successful action leaves an illegal blocking entity on a tile | discipline + partial `getBlockingMapEntityAt` centralization; **#994 open** |
| Any legality-checked action | A legal preview stays executable under unchanged state; a rejected action cannot succeed via an alternate executor | **#998 / #999 open** — `resolveCityInteraction`'s single-source-of-truth pattern (`.claude/rules/game-balance.md`) is the model other action families should converge on; **#1025 open** owns generalizing it (movement's slice already landed, #1042) |
| `hotSeat`, `currentPlayer`, presentation everywhere | A viewer never sees information their fog/discovery state doesn't allow | discipline, spread across UI/renderer call sites; **#1002 open** |
| Any code centralizing "which cities/units does X actually own" | Stop re-deriving ownership ad hoc from stale rosters | **#1019 (cities) / #1020 (units) open** |

## Diplomacy beyond war/treaties/vassalage

| Area | Invariant | Enforcement |
|---|---|---|
| `embargoes` | A dead civ is neither a target nor a participant | `ELIMINATED_CIV_AREAS.embargoes` (teardown only — no general live-state consistency assert; no demonstrated break) |
| `defensiveLeagues` | A dead civ is not a member | `ELIMINATED_CIV_AREAS.defensiveLeagues` (teardown only) |
| `pendingDiplomacyRequests` | No pending request to/from a dead civ; TTL-expired requests don't linger | `ELIMINATED_CIV_AREAS.pendingDiplomacyRequests` (teardown) + `normalizeVassalage`'s own request-scrubbing (load-time only) |
| `territoryFrontiers` | A frontier contest naming a dead civ on either side is over | `ELIMINATED_CIV_AREAS.territoryFrontiers` (teardown) |

## Economy, national projects, and trade

| Area | Invariant | Enforcement |
|---|---|---|
| `builtNationalProjects`, city `productionQueue`/`buildings` | A `uniquePerEmpire` item is never simultaneously built/queued in two cities of one civ | Query-time dedup only (`getReservedNationalProjectKeys`); **no live-state assert** — **#1080** (no demonstrated break; cheap to add given the `${civId}:${buildingId}` key shape) |
| `marketplace.tradeRoutes` / `.purchasedResources` | A route/purchase names a real, living civ | `ELIMINATED_CIV_AREAS.marketplace` (teardown only); no demonstrated break — **#1083** |
| `nationalProjectChoices` | A dead civ makes no resource choice | `ELIMINATED_CIV_AREAS.nationalProjectChoices` (teardown) |
| `economyStatusByCiv` | A dead civ has no economy status | `ELIMINATED_CIV_AREAS.economyStatusByCiv` (teardown) |
| `idCounters` | Every counter has both a `scanIdCounters` reconstruction block and an `emptyIdCounters` default | Discipline only — an "EXTENSION CONTRACT" comment in `id-counters.ts`, no compile-enforced coverage (unlike `ELIMINATED_CIV_AREAS`'s `Record<keyof …>` pattern) — **#1082** |

## AI

| Area | Invariant | Enforcement |
|---|---|---|
| `opponentAI.majorCivs.*` (`assignedUnitIds`, `upgradeRoutesByUnitId`), `.barbarianHomeCampByUnitId` | A portfolio references only live units it actually owns | `ELIMINATED_CIV_AREAS.opponentAI` scrubs this **only for eliminated civs**; a living civ's portfolio referencing a unit that died in ordinary combat this round has no general assert — **#1081** (plausible latent-bug shape, no demonstrated break) |
| `opponentAI.pressureByCiv`, `autonomyByCiv`, `networkCivicPressureByCity`, `councilMemory` | Keyed only by live civs/cities | `ELIMINATED_CIV_AREAS` (teardown, per-field) |
| AI decision determinism | Same seed + state ⇒ identical AI trace and resulting state, in-process and across save/reload | `.claude/rules/game-systems.md`'s Deterministic Simulation Contract + `tests/app/simulation-determinism.test.ts` / `determinism-guard.test.ts` |
| Domination sovereignty/victory queries | UI and AI consume observer-safe DTOs, never the omniscient query directly | Source rule (`check-src-rule-violations.sh`'s domination-authority block) |

## World threats, wonders, religion, generals (mostly historical or teardown-only)

| Area | Invariant | Enforcement |
|---|---|---|
| `activeCrises`, `crisisForces`, `stampedes`, `rogueElephantHosts` | A threat targeting a dead civ has no target | `ELIMINATED_CIV_AREAS` (teardown, per-field) |
| `beasts`, `pirateFleets`, `pirates`, `pirateFleetCooldownByCivLandmass`, `resurgentCampCooldownByCivLandmass` | No live reference to a dead civ | `ELIMINATED_CIV_AREAS` (teardown, per-field) |
| `discoveredWonders`, `wonderDiscoverers`, `completedLegendaryWonders`, `legendaryWonderHistory`, `legendaryWonderTacticalEffects`, `legendaryWonderIntel`, `legendaryWonderProjects`, `legendaryWonderAvailability` | Discovery/completion credit is a **permanent chronicle** and survives elimination; an in-flight project belonging to a dead civ is abandoned; tactical grants keyed to a dead civ are void | `ELIMINATED_CIV_AREAS` (mixed `historical`/`teardown` per field) + `.claude/rules/wonder-content.md`'s own gating/collision/quest-baseline/terrain tests (content correctness, a different axis) |
| `religions`, `cityFaith` | A religion outlives its founder; the holy city is permanently conversion-immune under any owner | `ELIMINATED_CIV_AREAS` (`historical`) |
| `pendingGeneralCandidateChoices`, `generatedGenerals` | A General identity + career ledger survives its civ, like a Hall-of-Fame record | `ELIMINATED_CIV_AREAS` (`historical`) |
| `espionage` | Own state deleted on elimination; foreign spies/threats/interrogations referencing a dead civ are scrubbed | `ELIMINATED_CIV_AREAS.espionage` (teardown) |
| `notificationLog` | A per-recipient log is inert after elimination, not deleted | `ELIMINATED_CIV_AREAS` (`historical`) |
| `dominationIntel` | Domination-victory observational intel is a chronicle, including recorded defeats | `ELIMINATED_CIV_AREAS` (`historical`), owned by the `#985` arc |

## Structural (no relational invariant — a scalar, enum, or civ-free area)

`turn`, `era`, `saveSchemaVersion`, `gameId`, `playthroughId`, `gameTitle`, `opponentChallenge`,
`pendingOpponentChallenge`, `map`, `settings`, `idCounters` (coverage discipline aside, see above),
`tutorial`, `gameOver`, `gameOverReason`, `mapScript`, `startPlacementMode`, `barbarianCamps`,
`barbarianCampPressure`, `tribalVillages`, `reconReveals`, `patrolReveals`, `minorCivLeagues`,
`legendaryWonderAvailability`, `hotSeat` (the fixed seat roster — cycling correctness is covered
under "Civilizations, units, cities, and ownership" above, not here), `pendingEvents` (per-recipient
event queues — teardown-checked, see `ELIMINATED_CIV_AREAS`, no further relational rule). See
`ELIMINATED_CIV_AREAS`'s own `structural` classification and `why` string for each — not repeated
here.

## Save normalization as an invariant list

The unconditional normalizer tail (`UNCONDITIONAL_PASSES`, `src/storage/migrations/pipeline.ts`) —
every `CompatibilityNormalizer` and `CorruptionRepair` that runs on *every* load regardless of
schema version — **is itself an enumerable invariant catalog**: each entry's `reason` field states
the exact shape it repairs and why leaving it un-repaired would break the game. This is already
self-documenting and generated (`docs/save-compatibility.md`, `UPDATE_SAVE_COMPAT_DOC=1`), so it is
referenced here rather than duplicated. `normalizeVassalage` is the entry most relevant to this MR —
see `.claude/rules/game-systems.md#an-overlord-controls-its-vassals-war-and-peace-1054` for the
gameplay contract it repairs and this file's own vassalage-reciprocity row above for the live-state
assert that now backs it.

## Structural source rules relevant to cross-system invariants

(`scripts/check-src-rule-violations.sh` / `.claude/hooks/check-src-edit.sh`, both `PostToolUse`-fired
on every `src/` edit — the full list includes many single-file discipline rules not relevant to
cross-system state; this lists only the ones that are)

| Rule | Prevents |
|---|---|
| Single-side `declareWar()`/`makePeace()` outside `diplomacy-system.ts` | Reintroducing the pre-#995 one-sided-war bug class |
| Single-side `signTreaty()` outside `diplomacy-system.ts`/`diplomacy-step.ts` | The identical bug class, applied to treaties (**new, this MR**) |
| Domination authority boundary | UI/AI reading the omniscient sovereignty/victory query directly instead of an observer-safe DTO |
| `victory-system.ts` roster-length liveness | Victory inferring survival from `civilizations.*.cities/units.length` instead of canonical sovereignty facts |
| `city-system.ts` importing the espionage runtime | A catalog-initialization cycle between production content and espionage state |
| Low-level unit mover called outside the movement system | Bypassing `resolveUnitMoveIntent`/`executeValidatedUnitMove`'s omniscient legality+cost check |
| Direct state mutation (`state.x[...] = `) in turn-processing systems | Breaking immutable turn processing (`.claude/rules/game-systems.md#immutable-turn-processing`) |
| `cities[0]` in a UI/recommendation path | Silently ignoring every city but the first in a multi-city empire |

## Sibling invariant issues from the original #1003 audit (re-verified against `main`, not the stale audit)

| Issue | Invariant | State |
|---|---|---|
| #994 | No successful action leaves an illegal blocking entity on a tile | OPEN |
| #995 | Major-civ war bilateral + deduplicated | **CLOSED** |
| #996 | Unit owner ⟺ civ roster agreement | OPEN (shared assert already exists; exhaustive suite tracked here) |
| #997 | City owner ⟺ civ roster agreement | OPEN (shared assert already exists; exhaustive suite tracked here) |
| #998 | Legal action previews stay executable | OPEN |
| #999 | Rejected actions can't succeed via alternate executors | OPEN |
| #1000 | Cargo/carrier reciprocity | **CLOSED** |
| #1001 | Eliminated civs retain no live entity | **CLOSED** |
| #1002 | Viewer information safety | OPEN |

Related architecture issues (out of scope for #1003 to fix, referenced for context): #1014
(caller-discipline → structure, the general umbrella), #1019/#1020 (centralize owned-city/unit
resolution), #1022 (ambiguous-primitive type-safety), #1025 (canonical action contracts — #1042
already landed the movement-specific slice).

## New findings from this audit, not fixed here (follow-up issues)

1. **#1080** — National-project state-level uniqueness has no live-state assert (query-time dedup
   only).
2. **#1081** — `opponentAI` portfolio dangling-unit references are checked only on civ elimination,
   not for a living civ whose unit died in ordinary combat.
3. **#1082** — `IdCounters`' extension contract is discipline-only — no compile-enforced coverage
   the way `ELIMINATED_CIV_AREAS` enforces its own.
4. **#1083** — Trade-route / marketplace civ references are checked only on elimination, not for a
   living civ.

None has a demonstrated break; each is cheap to close later by extending one of the three mechanisms
above. Do not fix these here — see #1003's own non-goal against fixing every invariant in one PR.
