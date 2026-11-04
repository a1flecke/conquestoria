# City-State Graduation (#497) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (this repository forbids subagents — `CLAUDE.md` "Agent Policy"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the game a sound, deterministic foundation for a rare city-state to graduate into a major civilization, and ship the first independently mergeable slice: a pure, side-effect-free eligibility and candidate-selection contract with no player-reachable transition.

**Architecture:** Graduation is one atomic transition (`minor → major`) owned by one system module, run by one new round phase directly after `minor-civs`. PR 1 ships only the read side: a stamped `foundedTurn`, a typed eligibility evaluator, and a deterministic round planner that nothing in `src/` calls yet. PRs 2–7 add the conversion, AI, diplomacy, save, presentation and validation, and only PR 3 wires the phase live.

**Tech Stack:** TypeScript, Vitest, existing `createSimulationRng`, `SAVE_STATE_INVARIANTS`, `ORDERED_MIGRATIONS`, `ARCHITECTURE_RULES`.

**Spec:** GitHub issue #497 (body + comments) and `docs/superpowers/specs/2026-07-07-hidden-city-state-economy-design.md` §"Minor-civ graduation (#497)". This plan is the design; there is no separate spec file.

**Audited main:** `d206d513b62695651095e20816580e1a2c559b21` (2026-11-03). Only open PR: #1643 (strip art, #1627) — no overlap.

---

## Part A — Audit: current architecture and reusable foundations

### What exists and is reusable unchanged

| Need | Existing owner | Reuse verdict |
|---|---|---|
| Owner classification | `classifyOwner` / `isMajorCivOwner` (`src/core/owner-kind.ts`) — **by id prefix**: `mc-*` is minor, anything unprefixed is major | Reuse. Forces the graduated civ to take a **new, non-`mc-` id**; the minor id cannot be kept. |
| Seeded draws | `createSimulationRng(state, { domain, actorId })` (`simulation-rng.ts`) — keyed by `gameId` + `turn` | Reuse. Same state ⇒ same roll, so save/reload cannot reroll. |
| City-state signals | `getMinorCivPopulationCeiling`, `evaluateMinorCivEconomyPosture`, `getMinorCivMobilizationBudget`, `getMinorCivLeagueForMember`, `getMinorCivCompletedTechBand`, `resolveNeutralPressureEra` | Reuse as eligibility inputs (all pure queries). |
| Difficulty | `resolveOpponentChallenge(state)` → `'explorer' \| 'standard' \| 'veteran'` | Reuse; same pattern as `MINOR_CIV_ECONOMY_TUNING`. |
| World maturity | `resolveWorldAge(state)` (`tech-definitions.ts`) | Reuse for the early-game guardrail. |
| Minor-civ teardown precedent | `conquestMinorCiv`, `peacefullyAbsorbMinorCiv` (`minor-civ-system.ts:652-754`): set `isDestroyed`, clear quests/chains, emit `alliance-broken` transitions, transfer city, `reconcileMinorCivLeagues` | Reuse the bookkeeping shape in PR 2; `peacefullyAbsorbMinorCiv` already transfers units without removing them. |
| Mid-game major creation precedent | `createBreakawayFromCity` (`breakaway-system.ts`) | **Partial reuse only.** It builds a `Civilization` and runs `reconcileCivilizationLiveness`, but it does not give every other civ a relationship entry (violates `game-systems.md` "Diplomacy Lifecycle"), copies the origin's whole visibility and tech, and sets no `knownCivilizations`. Do not copy it wholesale. |
| Liveness | `getCivilizationLiveness`, `reconcileCivilizationLiveness` + `emitCivilizationLivenessTransitions` | Reuse unchanged. A civ with a city is living. |
| Unit removal / transfer | `removeUnits` (only removal path); ownership transfer is a field write + roster update | Reuse; graduation transfers and never removes. |
| Contact | `recordCivilizationContact`, `hasDiscoveredMinorCiv` (`discovery-system.ts`) | Reuse. |
| AI enrolment | `getLivingNonHumanMajorIds` (`ai-round-scheduler.ts`) enumerates living majors dynamically; `opponentAI.majorCivs[...]` portfolios are normalized lazily (`opponent-ai-state.ts:339`) | Reuse — likely needs no scheduler change; PR 3 must prove it. |
| Per-civ processing | `perCivPhase` visits every living civ in roster order | Reuse. A civ created after `per-civ` gets its first visit next round. |
| Invariants | `SAVE_STATE_INVARIANTS` (15 asserts incl. `city-rosters`, `unit-rosters`, `bilateral-war`, `treaty-reciprocity`, `opponent-ai-portfolio-integrity`, `no-illegal-blocking-occupancy`) | Reuse; add exactly one new assert (PR 2). |
| Long-run fixtures | `tests/systems/helpers/minor-civ-scenario-fixtures.ts` (`fixtureProsperousMercantile`, `fixtureLateEra`, `fixtureEarlyGameNearYoungPlayer`, `fixtureAtWarWithMajor`, `fixtureCoalitionMember`, … + `runMinorCivLongRun`) | Reuse for characterization in PR 1 and balance in PR 7. |

### Gaps and hazards found (verified against source, not the issue text)

1. **No founding turn anywhere.** `MinorCivState` and `City` have no founded/creation turn, so "survival age" is not a recorded fact. PR 1 adds `MinorCivState.foundedTurn`.
2. **No recorded history** of defensive victories, sustained wealth, or trade over time. The design uses only *current* recorded facts sampled on the cadence turn and says so; it does not invent hidden scores.
3. **Definition-id collision: `avalon`** is both a minor-civ definition and a major-civ definition (`civ-definitions.ts`). A graduated civ must never set `civType` to its minor definition id.
4. **Camp evolution overwrites destroyed records.** `checkCampEvolution` excludes only *active* definitions (`usedDefs`), then writes `minorCivs[\`mc-${def.id}\`]`, so a conquered (or later, graduated) city-state's record and id can be silently reused. PR 2 must exclude graduated definitions; the destroyed-record overwrite is a pre-existing bug to report separately.
5. **War and treaty count as contact evidence** (`hasMetCivilizationByCurrentEvidence`). Carrying a minor-civ war into a major-civ war would grant first contact to a major that never saw the city-state (the #435 bug class). Carry-over must be limited to majors that had already discovered the city-state.
6. **`declareMajorWar` is a player/AI command** (treachery, war-history hooks). Carrying an existing war is not a declaration; it needs its own bilateral transition owned by `diplomacy-war.ts`.
7. **Domination moves its goalposts.** A graduated civ is an `independent` rival in `buildDominationActorFacts` and counts toward `hasCompetitiveFoundingRecords` (only `breakaway` civs are excluded). Graduating while one civ is one rival away from Domination would steal a near-win.
8. **Dead-code rule vs. no live activation.** `end-to-end-wiring.md` says an uncalled function is a bug; this issue says not to activate graduation yet. PR 1 resolves this with an architecture rule that pins the module as test-only until PR 3, and says so in the PR body.

---

## Part B — The canonical graduation contract

Graduation is `graduateMinorCiv(state, plan, bus) → { state, transition }`: preconditions re-checked before the first write (action-contract rule 3), all writes on one cloned state, liveness reconciled, then events emitted from the returned transition. Partial application is impossible because nothing is published until it returns.

| # | Concern | Decision (D = owner decision needed, default shown) |
|---|---|---|
| 1 | Identity | New id `grad-<definitionId>` (unprefixed ⇒ major). Name = minor definition name. Color = definition color, **D1**: keep, or re-pick if within a contrast distance of a living major's color. `civType: 'generic'` (never the minor def id, see hazard 3). AI personality from a new `GRADUATED_PERSONALITY_BY_ARCHETYPE` table (**D2**). `isHuman: false`. `graduatedFrom: { minorCivId, definitionId, turn }`. |
| 2 | City | Owner → new id; city added to the new civ's `cities`; `ownedTiles` map tiles re-owned; territory recomputes next round as for capture. |
| 3 | Units | Every live id in `mc.units` re-owned and moved to the new civ's `units`; positions unchanged, so occupancy cannot change. `mc.units = []`. No removal, no creation. |
| 4 | Buildings / queue / economy | Buildings kept. Queue kept; `processCity`'s dequeue backstop drops items the new civ cannot build. `mc.economy` dropped with the record (historical). |
| 5 | Tech / era | `completed = getMinorCivCompletedTechBand(state, mcId)` — exactly what it already builds with, no more (no windfall). No current research. Era derives from techs. |
| 6 | Treasury / resources | `gold: 0` (breakaway precedent). Resources come from owned tiles as for any civ. **D3** if a start stipend is wanted. |
| 7 | AI initialization | No hand-built portfolio: the lazy normalizer and `getLivingNonHumanMajorIds` enrol it. PR 3 proves first-turn AI planning with a trace test. |
| 8 | Contact / first contact | `knownCivilizations` = every living major with `hasDiscoveredMinorCiv(state, majorId, mcId)`, recorded bilaterally via `recordCivilizationContact`. No other contact. |
| 9 | Diplomacy | Every living major gets a relationship entry; value = the minor's relationship to it (`mc.diplomacy.relationships[majorId]`, else 0), symmetric. Minor wars with *discovered* majors carry over through a new bilateral `carryOverMinorWar` in `diplomacy-war.ts` (no treachery, vassals dragged by the existing rule). Wars with undiscovered majors end. No treaties exist on a minor, so none carry. |
| 10 | Quests / ally rewards | All `activeQuests` cancelled, no reward, cooldowns cleared; each allied chain emits `alliance-broken` (conquest precedent). **D4**: convert an allied chain to +relationship instead of nothing. |
| 11 | Leagues / coalitions | `reconcileMinorCivLeagues` removes the member (it already handles destroyed members). Coalition membership and the minor's own grievances are dropped; other minors' grievances are untouched. `opponentAI.minorCivs[mcId]` is already pruned for destroyed minors. |
| 12 | Fog / viewer intel | New civ starts with a fresh visibility map revealed by its own city/units on its first per-civ visit (nothing inherited — minors have no map). Viewers learn the new name only if they had discovered the city-state. |
| 13 | Victory eligibility | Domination: an ordinary `independent` rival. Planner refuses graduation while any contender has `unresolvedRivalIds.length <= 1` (**D5**). Science: may race like any civ; its tech band is bounded by neighbours. Legacy (#1125): document only, no rules here. |
| 14 | Save / replay | Minor record kept with `isDestroyed: true` and `graduation: { turn, civId }` (historical). Conversion happens inside `processTurn`, so replay is deterministic by construction. |
| 15 | Notifications / history | `minor-civ:graduated { minorCivId, civId, turn }` emitted from the returned transition. Recipient-scoped: discoverers see the name; others see nothing until contact. Notification log entry is historical. No new art or audio. |

**Canonical round-phase boundary:** a new `minor-civ-graduation` phase immediately after `minor-civs` and before `beasts`. Reasons: the minor has finished this round's economy, quests and league turn; `per-civ` has already run (no double processing of the new civ this round); `espionage`, `diplomacy-trade`, `leagues` and `finalization` (victory) all see a complete civ. Adding it requires the new `RoundPhaseId`, the `ROUND_PHASES` entry and the order literals in `tests/core/round-phase-order.test.ts` — in PR 3, not before.

---

## Part C — Transition invariant matrix

| Invariant | Before | After | Enforced by |
|---|---|---|---|
| City has exactly one valid owner | `city.owner = mc-X`, `mc.cityId = city` | `city.owner = grad-X`, in `civ.cities`; no minor names it | `city-rosters` |
| Units keep valid ownership/rosters | in `mc.units` | in `civ.units`; `mc.units = []` | `unit-rosters`; PR 2 test: unit id set and positions identical before/after |
| No duplication / disappearance | — | `Object.keys(units)` unchanged | PR 2 conversion test |
| No illegal occupancy | — | positions unchanged | `no-illegal-blocking-occupancy` |
| No stale minor registry | `mc` active | `isDestroyed`, `graduation` set, no units, city not owned | new `minor-civ-graduation-integrity` (PR 2) |
| No dangling league/coalition refs | member | not in any `memberIds` / coalition | new assert + `reconcileMinorCivLeagues` |
| No orphaned quests/treaties | quests active | none; minors hold no treaties | new assert; `treaty-reciprocity` |
| Bilateral war | `mc` in majors' `atWarWith` | `grad-X` in both sides or neither; no `mc-X` remains | `bilateral-war` + new assert |
| No free tech/economy windfall | band B, minor has no gold | completed = B exactly, gold 0 | PR 2 test |
| No omniscient AI | — | AI reads only its own visibility | existing AI viewer tests + PR 3 trace test |
| No wrong first contact | — | `knownCivilizations` ⊆ discoverers of the minor | PR 4 viewer-safety differential |
| No victory from partial civ | — | atomic; finalization runs after | PR 2 atomicity test (throwing precondition leaves state untouched) |
| Deterministic across save/reload | — | planner is a pure function of state | PR 1 + PR 5 `assertSimulationEquivalent` |
| No repeated graduation | — | `isDestroyed` + `graduation` ⇒ evaluator returns ineligible; definition excluded from camp evolution | PR 1 (`destroyed`), PR 2 |
| No double processing in a round | — | one phase, one plan per turn, ≤1 conversion per round | PR 3 phase test |

---

## Part D — Eligibility and probability (PR 1)

All numbers below are **provisional** and live in one table, `MINOR_CIV_GRADUATION_TUNING`. PR 7 validates them against representative campaigns; the owner approves the final values (**D6**). Difficulty changes only timing, probability and caps — never conversion legality or what a graduated civ receives.

**Cadence:** evaluated only when `turn % 50 === 0` (`GRADUATION_CADENCE_TURNS = 50`).

**Global gates (planner)**, in order, each a typed skip reason:
1. `game-over` — `state.gameOver`.
2. `off-cadence` — not a cadence turn.
3. `world-too-young` — `resolveWorldAge(state) < tuning.minWorldAge`.
4. `living-major-cap` — living majors ≥ `GRADUATION_MAX_LIVING_MAJORS[settings.mapSize]` (small 6, medium 8, large 10). The per-game graduation count cap needs `graduatedFrom`, so it lands in PR 2.
5. `domination-imminent` — some contender has `eligible && unresolvedRivalIds.length <= 1` (`getDominationProgress`, a system-level read; the domination-authority rule bans only UI/AI importers).

**Per-candidate hard gates**, in order (first failure is the reason):
`missing-minor-civ` · `destroyed` · `unknown-definition` · `city-missing` · `city-not-owned` (city owner ≠ mc id) · `age-unknown` (no `foundedTurn`) · `too-young` (`turn - foundedTurn < tuning.minAgeTurns`) · `population-below-threshold` (`population < ceiling - tuning.populationHeadroom`) · `too-few-buildings` · `at-war` (`mc.diplomacy.atWarWith` non-empty) · `under-threat` (posture `mobilizing` or `recovering`) · `league-mobilized` (its league's readiness is `concern`) · `coalition-member` (member of a `forming`/`active` coalition).

| Knob | explorer | standard | veteran |
|---|---:|---:|---:|
| `minWorldAge` | 5 | 4 | 3 |
| `minAgeTurns` | 200 | 150 | 120 |
| `populationHeadroom` (pop ≥ ceiling − n) | 0 | 1 | 2 |
| `minBuildings` | 6 | 5 | 4 |
| `baseProbability` | 0.03 | 0.08 | 0.12 |
| `maxProbability` | 0.06 | 0.15 | 0.22 |

**Soft score** (`0..1`, eligible candidates only), from recorded facts: trade partners (distinct major civs with a `marketplace.tradeRoutes` entry whose `toCityId` or `fromCityId` is the minor's city, capped at 3) weight 0.4; allied patrons (`chainStatusByCiv` entries with `status: 'allied'`, capped at 2) weight 0.3; league membership weight 0.3. Probability `p = min(maxProbability, baseProbability × (0.5 + score))`.

**Roll and selection:** each eligible candidate, in id order, draws once from `createSimulationRng(state, { domain: 'minor-civ-graduation', actorId: mc.id })`; success iff `roll < p`. At most one graduation per cadence turn: among successes pick highest score, then lowest id. Same state ⇒ same plan, so save/reload and repeated calls cannot reroll.

---

## Part E — PR sequence

| PR | Delivers | Live? | Acceptance criteria |
|---|---|---|---|
| **1** | `foundedTurn` + migration 38; pure evaluator + planner; characterization | No (test-only module) | Part F tasks green; architecture pin proves no `src/` importer |
| **2** | `graduateMinorCiv` atomic conversion (Part B rows 1–6, 10–11, 14); `graduation`/`graduatedFrom` fields; per-game cap; camp-evolution exclusion; `minor-civ-graduation-integrity` assert | No (only tests call it) | Conversion on each long-run fixture passes all `SAVE_STATE_INVARIANTS`; unit/city id sets preserved; throwing precondition leaves input deep-equal; gold 0 and tech = band |
| **3** | `minor-civ-graduation` round phase + AI first turn | **Yes**, behind `settings.cityStateGraduation` defaulting off (**D7**: default on/off at ship) | Round-order literals updated with reason; graduated AI civ plans and acts next round with no thrown error over 50 rounds; per-civ visits it exactly once per round |
| **4** | Contact, relationships, war carry-over (`carryOverMinorWar`), quest cancellation | behind flag | `knownCivilizations` ⊆ discoverers (viewer-safety differential); no `mc-X` left in any `atWarWith`; vassals follow; no treachery recorded |
| **5** | Save normalization + compat-matrix case; additive proofs for new optional fields | behind flag | Save-compat matrix green; run N → save → reload → M equals uninterrupted run through a graduation turn |
| **6** | Viewer-safe notification route, diplomacy-panel/HUD rows, history log | behind flag | Hot-seat differential: non-discoverer sees nothing; discoverer sees name; no art/audio files added |
| **7** | Campaign + victory + balance validation; final tuning; flag default decision | flag default per D7 | Representative campaigns report graduation counts within an owner-approved envelope; Domination/Science tests with a graduated civ; plan file deleted, issue closable |

---

## Global Constraints

- No subagents; all work in this worktree; `./scripts/setup-git-hooks.sh` and `mise trust` done before first push.
- Commands via `./scripts/dev.sh <task>` or `./scripts/run-with-mise.sh yarn <cmd>`; never `pkill`/`killall`.
- No `Math.random()`; draws only through `createSimulationRng` with the full `mc.id` as `actorId`.
- No `as unknown as`, `@ts-ignore`, `@ts-expect-error` in `src/`.
- Immutable turn processing: return new state, never write through the input.
- `MINOR_CIV_GRADUATION_TUNING` is the only place a graduation number lives.
- PR 1 makes no player-visible change and adds no event, notification, UI, art or audio.
- Do not touch #1125 (Legacy victories), #1466 (streaming audio) or #1627 (strip art) files.
- Adding `SAVE_MIGRATIONS[38]` bumps `CURRENT_SAVE_SCHEMA_VERSION` to 38 in the same change.

## Review Focus

1. **A legacy save loaded mid-game** — every minor gets `foundedTurn = turn at load`, so none can graduate for `minAgeTurns`; test pins it (Task 1).
2. **A camp-evolved city-state** — stamped with the evolution turn, not 1 (Task 1).
3. **Calling the planner twice on the same state, or after save/reload** — identical plan (Task 4).
4. **Corrupt `foundedTurn`** (negative, NaN, in the future) — reads as `age-unknown`, never eligible, never throws (Task 2).
5. **Two candidates both succeed on one cadence turn** — exactly one selected, by score then id (Task 4).

---

## Part F — PR 1 tasks

### Task 1: Stamp `MinorCivState.foundedTurn` and migrate old saves

**Files:**
- Modify: `src/core/types.ts:1766` (`MinorCivState`)
- Modify: `src/systems/minor-civ-system.ts:149` (`placeMinorCivs`), `:887` (`checkCampEvolution`)
- Create: `src/storage/migrations/steps/minor-civ-founded-turn.ts`
- Modify: `src/storage/migrations/ordered.ts`, `src/storage/save-schema-version.ts`
- Modify: `tests/storage/fixtures/save-compat/manifest.ts`
- Test: `tests/systems/minor-civ-system.test.ts`, `tests/storage/save-migrations.test.ts`

**Interfaces:**
- Produces: `MinorCivState.foundedTurn?: number` — the turn the city-state came into being. Optional in the type because pre-38 saves lack it until migrated.
- Produces: `migrateMinorCivFoundedTurn(state: GameState): GameState`.

- [ ] **Step 1: Write the failing tests**

```ts
it('stamps foundedTurn on placement at the creation turn', () => {
  const state = createNewGame(/* existing helper used in this file */);
  for (const mc of Object.values(state.minorCivs)) expect(mc.foundedTurn).toBe(state.turn);
});
it('stamps foundedTurn on camp evolution at the evolution turn', () => {
  // existing camp-evolution fixture in this file, at turn 87
  expect(evolution!.newMinorCiv.foundedTurn).toBe(87);
});
// save-migrations.test.ts
it('migration 38 backfills foundedTurn with the load turn and preserves an existing value', () => {
  const legacy = { ...v37Fixture, turn: 140 };          // one minor without, one with foundedTurn: 3
  const migrated = migrateMinorCivFoundedTurn(legacy);
  expect(migrated.minorCivs['mc-a'].foundedTurn).toBe(140);
  expect(migrated.minorCivs['mc-b'].foundedTurn).toBe(3);
});
```

- [ ] **Step 2: Run them — expect FAIL** (`foundedTurn` undefined / migration not defined)

Run: `./scripts/dev.sh test tests/systems/minor-civ-system.test.ts tests/storage/save-migrations.test.ts`

- [ ] **Step 3: Implement.** Stamp `foundedTurn: state.turn` in both constructors. Migration 38 sets `foundedTurn = state.turn` where it is absent or not a finite integer `>= 0`; it never touches a valid value. Register it as `ORDERED_MIGRATIONS[38]` with a reason, bump `CURRENT_SAVE_SCHEMA_VERSION` to 38, and add the source-version-37 well-formed case to the compat manifest. New games already carry the field, so `new-game-completeness` needs no ratchet entry — confirm it stays green.

- [ ] **Step 4: Run the same tests plus the save registries — expect PASS**

Run: `./scripts/dev.sh test tests/systems/minor-civ-system.test.ts tests/storage/save-migrations.test.ts tests/storage/save-compat-coverage.test.ts tests/storage/save-persisted-shape-ratchet.test.ts tests/storage/save-migration-registries.test.ts tests/storage/new-game-completeness.test.ts`
If `save-migration-registries` reports the generated doc is stale, regenerate with `UPDATE_SAVE_COMPAT_DOC=1` (never hand-edit `docs/save-compatibility.md`). `save-migration-equivalence` digests move for `minorCivs` only — justify that in the PR body.

- [ ] **Step 5: Commit** — `feat(minor-civs): record each city-state's founding turn (#497)`

### Task 2: Typed eligibility evaluator

**Files:**
- Create: `src/systems/minor-civ-graduation-rules.ts` (tuning table, reason union, signal types — import-light leaf)
- Create: `src/systems/minor-civ-graduation.ts`
- Test: `tests/systems/minor-civ-graduation.test.ts`

**Interfaces:**
- Produces (rules leaf):
  - `MINOR_CIV_GRADUATION_TUNING: Record<OpponentChallenge, { minWorldAge; minAgeTurns; populationHeadroom; minBuildings; baseProbability; maxProbability }>` (Part D values)
  - `GRADUATION_CADENCE_TURNS = 50`, `GRADUATION_MAX_LIVING_MAJORS: Record<'small'|'medium'|'large', number>`
  - `type MinorCivGraduationIneligibleReason` = the 13 Part D per-candidate reasons
  - `interface MinorCivGraduationSignals { ageTurns: number; population: number; populationCeiling: number; buildingCount: number; tradePartnerCount: number; alliedPatronCount: number; leagueMember: boolean }`
  - `type MinorCivGraduationEligibility = { eligible: true; minorCivId: string; signals: MinorCivGraduationSignals } | { eligible: false; minorCivId: string; reason: MinorCivGraduationIneligibleReason }`
- Produces: `evaluateMinorCivGraduationEligibility(state: GameState, minorCivId: string): MinorCivGraduationEligibility`

- [ ] **Step 1: Write failing tests**, one per reason plus the eligible case, each built from `fixtureProsperousMercantile` / `fixtureLateEra` and edited to isolate one gate:
  - `too young` → `{ eligible: false, reason: 'too-young' }` at `turn - foundedTurn = minAgeTurns - 1`; eligible at exactly `minAgeTurns`.
  - `economically weak` → `population-below-threshold` at `ceiling - headroom - 1`; `too-few-buildings` at `minBuildings - 1`.
  - `strong eligible candidate` → `eligible: true` with `signals` equal to hand-computed values.
  - `difficulty`: the same state is `too-young` on explorer and eligible on veteran.
  - `league participation`: `league-mobilized` when its league readiness is `concern`; eligible with `leagueMember: true` when `quiet`.
  - `malformed source state`: missing id → `missing-minor-civ`; `foundedTurn` `-1`, `NaN`, `turn + 5` → `age-unknown`; `city.owner` changed → `city-not-owned`; unknown `definitionId` → `unknown-definition`. None throws.
  - The input state is deep-equal before and after every call.

- [ ] **Step 2: Run — expect FAIL** (module missing). Run: `./scripts/dev.sh test tests/systems/minor-civ-graduation.test.ts`

- [ ] **Step 3: Implement** the gates in Part D order; first failure returns. Read only: `state.minorCivs`, `state.cities`, `MINOR_CIV_DEFINITIONS`, `getMinorCivPopulationCeiling`, `evaluateMinorCivEconomyPosture`, `getMinorCivLeagueForMember`, `state.minorCivCoalitions`, `state.marketplace.tradeRoutes`, `resolveOpponentChallenge`. World-age and cap gates belong to the planner (Task 4), not here.

- [ ] **Step 4: Run — expect PASS**, then `./scripts/check-src-rule-violations.sh src/systems/minor-civ-graduation.ts src/systems/minor-civ-graduation-rules.ts`.

- [ ] **Step 5: Commit** — `feat(minor-civs): typed graduation eligibility evaluator (#497)`

### Task 3: Score and probability

**Files:** Modify `src/systems/minor-civ-graduation.ts`; Test `tests/systems/minor-civ-graduation.test.ts`

**Interfaces:**
- Produces: `scoreGraduationSignals(signals: MinorCivGraduationSignals): number` (0..1) and `getGraduationProbability(state: GameState, score: number): number`.

- [ ] **Step 1: Failing tests:** score 0 with no partners/patrons/league; score 1 at 3 partners + 2 patrons + league; partner count 5 scores like 3 (cap); probability equals `min(max, base × (0.5 + score))` for each difficulty; probability never exceeds `maxProbability`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** with the Part D weights.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(minor-civs): graduation score and probability (#497)`

### Task 4: Deterministic round planner

**Files:** Modify `src/systems/minor-civ-graduation.ts`; Test `tests/systems/minor-civ-graduation.test.ts`

**Interfaces:**
- Produces:
```ts
export type MinorCivGraduationSkipReason = 'game-over' | 'off-cadence' | 'world-too-young' | 'living-major-cap' | 'domination-imminent';
export interface MinorCivGraduationRoll { minorCivId: string; score: number; probability: number; roll: number; succeeded: boolean }
export type MinorCivGraduationPlan =
  | { status: 'skipped'; turn: number; reason: MinorCivGraduationSkipReason }
  | { status: 'evaluated'; turn: number; evaluations: MinorCivGraduationEligibility[]; rolls: MinorCivGraduationRoll[]; selectedMinorCivId: string | null };
export function planMinorCivGraduations(state: GameState): MinorCivGraduationPlan;
export function selectGraduationCandidate(rolls: readonly MinorCivGraduationRoll[]): string | null;
```

- [ ] **Step 1: Failing tests:**
  - **Cadence boundaries:** turns 49 and 51 → `off-cadence`; turn 50 → `evaluated` (with world age satisfied).
  - **Global cap:** living majors = cap → `living-major-cap`; cap − 1 → evaluated.
  - `world-too-young` and `game-over` each skip.
  - `domination-imminent` when a contender has one unresolved rival; evaluated with two.
  - **Deterministic success/failure:** for a fixed `gameId` find (in the test) one fixture whose roll succeeds and one that fails; pin both `succeeded` values and that `roll` equals `createSimulationRng(state, { domain: 'minor-civ-graduation', actorId })()`.
  - **Repeated calls:** two calls on the same state are deep-equal.
  - **Save/reload equivalence:** plan on `state` equals plan on `normalizeLoadedStateForTest(JSON.parse(JSON.stringify(state)))`.
  - **Selection:** test the selection step through an exported pure helper `selectGraduationCandidate(rolls: MinorCivGraduationRoll[]): string | null` with hand-built rolls: two successes → higher score wins; equal scores → lower id wins; no success → `null`. (Do not override tuning or stub the RNG to force successes.)
  - **Domain independence:** draining another domain's stream does not change this plan.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement**: gates in Part D order; evaluate every minor id sorted; roll each eligible one; select per Part D. Pure: no writes, no bus.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `feat(minor-civs): deterministic graduation planner, not yet wired (#497)`

### Task 5: Characterization, boundary pin, docs

**Files:**
- Test: `tests/systems/minor-civ-graduation-characterization.test.ts`
- Modify: `tests/app/architecture/rules.ts` (+ a fixture case in `rules.test.ts` if the rule kind needs proof)
- Modify: `scripts/run-tests-by-local-tier.sh` (if the characterization exceeds the regular tier budget, add it to `SLOW_TEST_FILES` and one CI shard)
- Modify: `docs/docs-lifecycle-manifest.json` (this plan as `active`, issue 497)
- Modify: `.claude/rules/game-balance.md` (new "City-State Graduation (#497)" inventory section with the Part D table, marked provisional)

- [ ] **Step 1: Write the characterization test.** Run `runMinorCivLongRun` for 200 turns on `fixtureEarlyGameNearYoungPlayer`, `fixtureAtWarWithMajor`, `fixtureProsperousMercantile`, `fixtureLateEra`, sampling `planMinorCivGraduations` and the evaluator each turn. Assert: the planner never throws; no plan is `evaluated` before `turn 50`; the early-game fixture is never eligible on explorer before `minAgeTurns`; the at-war fixture is never eligible while at war; every `evaluated` plan has at most one selection. Print (do not assert) the reason histogram for the PR body.
- [ ] **Step 2: Add the architecture rule** `minor-civ-graduation-is-test-only-until-497-pr3`: no module under `src/` imports `minor-civ-graduation` or `minor-civ-graduation-rules`; `why` names #497 PR 3. Confirm with `rule-engine.ts` that the chosen kind (`forbidden-import` from `src/**`) does not trip the "matcher matches nothing" check; if it does, add a fixture to `rules.test.ts` that proves the rule bites.
- [ ] **Step 3: Run** `./scripts/dev.sh test tests/systems/minor-civ-graduation-characterization.test.ts tests/app/architecture-boundaries.test.ts tests/app/architecture/rules.test.ts` — expect PASS.
- [ ] **Step 4: Docs.** Add the manifest entry and the provisional balance section; run `node scripts/docs-lifecycle.mjs check`.
- [ ] **Step 5: Commit** — `test(minor-civs): characterize graduation eligibility on long-run fixtures (#497)`

---

## Part G — Verification for PR 1

Run in order, sequentially (never two durable runs in one worktree):

1. `./scripts/dev.sh verify-impact` — record its required list; it is authoritative over this section.
2. Mirrored tests: `./scripts/dev.sh test tests/systems/minor-civ-graduation.test.ts tests/systems/minor-civ-graduation-characterization.test.ts tests/systems/minor-civ-system.test.ts tests/storage/`
3. `./scripts/check-src-rule-violations.sh` on every changed `src/` file.
4. `./scripts/dev.sh typecheck` and `./scripts/dev.sh build`.
5. `./scripts/dev.sh maintainability-check`.
6. Existing minor-civ long-run: `./scripts/dev.sh test tests/systems/minor-civ-economy-longrun.test.ts tests/systems/minor-civ-league-longrun.test.ts` (must be unchanged — PR 1 alters no behaviour).
7. Determinism: `./scripts/dev.sh test tests/app/simulation-determinism.test.ts` and `tests/storage/save-compat-matrix.test.ts` (intensive tier; check `yarn verify:local:status` first and do not start while another agent holds a lease).
8. `./scripts/dev.sh durable` then `./scripts/dev.sh durable-status` — must report pass for the current HEAD.
9. Do **not** run `ai-long` / the long-horizon matrix: PR 1 changes no live behaviour. Do not change any timeout budget or known-gap ratchet.

## Part H — Delivery

- PR title: `feat(minor-civs): city-state graduation eligibility foundation (#497 PR 1 of 7)`. Body via `./scripts/pr-body.sh` in `/tmp/pr-bodies/`, with "Out of scope" (PRs 2–7), "Why this is safe to merge partial" (no player-visible surface; module pinned test-only; migration 38 only adds a field), the dead-code deviation note, the moved migration digests, and the characterization histogram. Use "Part of #497", never "closes".
- Comment on #497: delivered (PR 1 link, contract summary, hazards 3–7), outstanding (PRs 2–7), owner decisions D1–D7.
- Do not merge; do not close #497.

## Owner decisions

| ID | Question | Default in this plan |
|---|---|---|
| D1 | Keep the city-state's color, or re-pick when it clashes with a living major? | Keep; re-pick only below a contrast threshold |
| D2 | Personality: archetype table, or `generic` defaults? | Archetype table (militaristic/mercantile/cultural) |
| D3 | Starting gold stipend? | 0 |
| D4 | Allied chains: lost, or converted to a relationship bonus? | Lost (conquest precedent) |
| D5 | Block graduation when a civ is one rival from Domination? | Block |
| D6 | Final tuning numbers (Part D) | Provisional until PR 7 |
| D7 | Ship the live phase on or off by default; is there a new-game setting? | Off until PR 7 validation |
| D8 | Can the player encourage/sponsor/prevent graduation (issue's open question)? | Out of scope for this arc; follow-up issue |
