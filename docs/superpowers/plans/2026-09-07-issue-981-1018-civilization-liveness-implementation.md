# Civilization Liveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task **inline**. No subagents. Steps use checkbox syntax for tracking. Terra High owns implementation; Sol High owns actual-code review/fixes and MR creation; Luna owns CI/merge. Astra must stop after this reviewed plan.

**Goal:** Resolve #981/#1018 with one city-or-surviving-settler liveness rule shared by victory, lifecycle, AI, turn rotation, active diplomacy/pressure and presentation.

**Architecture:** A pure leaf query reads actual entity ownership and honors the terminal elimination marker. The existing elimination system owns teardown and a new before/after coordinator returns source-owned transitions. Atomic mutation callers, turn boundaries, a small AI recovery module and owner-scoped presentation compose those APIs.

**Tech Stack:** Existing TypeScript, Vitest/jsdom, Canvas/DOM, Yarn/mise, EventBus/GameEventBuffer and save normalization. No new dependencies or persisted fields.

---

## Status and controlling design

- Phase 0 design and plan: written and reviewed inline; no production implementation.
- Tasks 1–9: **not started**.
- Terra final gate, Sol review/MR and Luna merge: **not started**.

Controlling contract: [civilization-liveness design](../specs/2026-09-07-issue-981-1018-civilization-liveness-design.md). Read it completely. In a phase-completing MR update this status, task checkboxes and actual merged phase annotations per `.claude/rules/spec-fidelity.md`. Do not mark work merged merely because a local task passes.

Starting branch/worktree: `codex/civilization-liveness-design` in `.worktrees/civilization-liveness-design`. Final audited source base: `824ea20e`, including #496 audit, #1004 determinism and #1006 save compatibility. The initial source probe was at `e9447a3a`; the final drift review inspected changed production files, policies and shared test helpers. The Phase-0 documentation commit may be ahead of this base. Preserve it on handoff; do not check out `main` over the plan.

### Decisions Terra must not redesign

1. City OR positive-health surviving settler keeps a major alive, indefinitely; ordinary military/naval/air/civilian units alone do not.
2. Valid reciprocal same-owner cargo settlers count, even with no unload action now. No liveness pathfinding, timer or hidden-map viability oracle.
3. `city.owner` / `unit.owner` are authoritative. No broad roster repair/migration; preserve city/capital ordering.
4. A true elimination marker remains terminal; absent/false does not by itself mean living. Completed game outcomes are not reopened on load.
5. One exported query; active-turn/diplomacy/victory consumers compose it. Historical existence and individual city-gated actions remain separate concepts.
6. Atomic operations finish before elimination; query eligibility is immediate, positive campaign victory remains at the existing end-of-world-turn location.
7. Vassals and breakaways use the same rule; minors/compacts and other owner kinds are excluded. New vassalage agreements still need two actual city-owning actors.
8. AI recovery, recipient-safe explanation, exact source-rule tests and save/hot-seat parity are required in the same MR as the rule.
9. No #985 implementation, broad #1019/#1020 migration, #1001 global registry, #1023 refactor or #993 presentation framework.

## Task 1 — Refresh, record drift and add the exact failing regressions

**Files:** read the design's source/audit inventory; modify `tests/systems/victory-system.test.ts`, `tests/systems/civilization-elimination-system.test.ts`, `tests/ai/ai-round-scheduler.test.ts`; create `tests/systems/helpers/civilization-liveness-fixture.ts` only for fixture sharing needed by later tasks.

- [ ] **Refresh read-only upstream context before touching production.**

```bash
git fetch origin
git status --short --branch
git log -n 35 --oneline --decorate origin/main
git diff --stat HEAD..origin/main
git diff --stat origin/main...HEAD
git diff --stat
git config --worktree --get core.hooksPath
```

Read actual full source diffs if the base moved, current #981/#1018 comments, open PRs, and the adjacent issues listed in the design. Rebase the Phase-0 docs onto current `origin/main` in this worktree if necessary, preserving the docs; never modify the root checkout. Run setup hooks and `mise trust mise.toml` if creating another worktree. Install worktree dependencies only if missing. Stop for a hard prerequisite or central design invalidation; do not silently replace APIs that have newly landed.

- [ ] **Repeat the narrow baseline once before adding tests.**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/victory-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/core/turn-cycling.test.ts tests/ai/ai-round-scheduler.test.ts
```

Phase-0 result on both the initial and final audited bases was 4 files / 34 tests plus hook smoke tests, exit 0. Counts may change with later drift. Preserve any running session ID until it exits. After two materially similar failures, stop and report the failure and evidence instead of retrying.

- [ ] **Write failing cases using actual entities, before production changes.** Use the existing `createNewGame`, `foundCityInState` and `EventBus`; do not keep `makeState`'s `{civilizations} as GameState` fixture as evidence of actual city ownership.

```ts
// tests/systems/helpers/civilization-liveness-fixture.ts
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { foundCityInState } from '@/systems/city-founding-system';

export function makeLivenessGame(): GameState {
  const state = createNewGame('egypt', 'audit-a1');
  const settler = Object.values(state.units).find(unit =>
    unit.owner === 'player' && unit.type === 'settler');
  if (!settler) throw new Error('Fixture requires the initial player settler');
  return foundCityInState(state, settler.id, new EventBus()).state;
}

export function withoutOwnedAssets(state: GameState, civId: string): GameState {
  const next = structuredClone(state);
  next.cities = Object.fromEntries(Object.entries(next.cities)
    .filter(([, city]) => city.owner !== civId));
  next.units = Object.fromEntries(Object.entries(next.units)
    .filter(([, unit]) => unit.owner !== civId));
  next.civilizations[civId].cities = [];
  next.civilizations[civId].units = [];
  return next;
}
```

This fixture is for liveness-only states; lifecycle tests must use real removal/transfer helpers to keep territory/cargo correct. For cargo cases create a host with `createUnit(type, owner, position, state.idCounters)`, add it to the map/roster, and use `loadUnitOntoTransport` on a legal shore. Construct intentionally malformed reciprocity only in specifically named negative tests.

```ts
it('does not end a campaign because only the player has founded', () => {
  const state = makeLivenessGame();
  expect(getLivingNonHumanMajorIds(state)).toContain('ai-1');
  const next = processTurn(state, new EventBus());
  expect(next.gameOver).toBe(false);
  expect(Object.values(next.units).some(unit =>
    unit.owner === 'ai-1' && unit.type === 'settler')).toBe(true);
});

it('does not eliminate a cityless civilization with its initial settler', () => {
  const state = makeLivenessGame();
  expect(eliminateCivilization(state, 'ai-1', 'player').eliminated).toBe(false);
});

it('does not let a ghost city roster block the ending', () => {
  const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
  state.civilizations['ai-1'].cities = ['city-ghost'];
  expect(checkDominationVictory(state)).toBe('player');
});

it('schedules a real settler omitted from its civilization roster', () => {
  const state = makeLivenessGame();
  state.civilizations['ai-1'].units = [];
  expect(getLivingNonHumanMajorIds(state)).toContain('ai-1');
});
```

Place each test in its corresponding existing suite and add the shown fixture imports. Keep the original positive victory test, but remove the defeated rival's actual assets first; rename its old founding-order assertion to the regression above. Add the inverse city case: an actual owned city with an empty roster blocks the opponent's victory.

- [ ] **Run the focused command and record the expected assertion failures.** Each failure must demonstrate the gameplay assertion, not an import/fixture error. Commit the regression tests and fixture as `test(liveness): reproduce cityless defeat and roster drift` after inspecting their diff. Red tests are intentional at this local TDD checkpoint; do not push/create an MR.

## Task 2 — Implement the single leaf liveness query

**Create:** `src/systems/civilization-liveness.ts`, `tests/systems/civilization-liveness.test.ts`.
**Modify:** `src/systems/victory-system.ts`, `src/ai/ai-round-scheduler.ts`, `src/core/turn-cycling.ts`, `src/core/types.ts` (marker comment only at this step).
**Tests:** the new suite plus the four original consumers' suites.

- [ ] **Write the canonical truth-table tests first.** Derive non-settler unit and cargo-host test groups from `UNIT_DEFINITIONS`; assert every `canFoundCity` entry currently has type `settler`. Cases: city+unit, city-only, settler-only, initial zero-city humans, spent/resting/skipped settler, no assets, military/worker/spy/general/missionary/naval/air-only, health 0/NaN, terminal flag, unknown owner, all six non-major kinds. Test both directions and wrong-owner values of both rosters.

```ts
it('reads authoritative ownership even when both rosters are empty', () => {
  const state = makeLivenessGame();
  state.civilizations.player.cities = [];
  state.civilizations['ai-1'].units = [];
  expect(getCivilizationLiveness(state, 'player'))
    .toEqual({ living: true, reason: 'city' });
  expect(getCivilizationLiveness(state, 'ai-1'))
    .toEqual({ living: true, reason: 'settler' });
});

it('does not resurrect a terminal marker from contradictory live assets', () => {
  const state = makeLivenessGame();
  state.civilizations['ai-1'].isEliminated = true;
  expect(getCivilizationLiveness(state, 'ai-1'))
    .toEqual({ living: false, reason: 'eliminated' });
});
```

For a loaded settler, test healthy reciprocal host positive; no unload destinations and spent cargo positive; missing host, host health 0, wrong owner, absent reciprocal ID, self-host and nested cargo-host negative. Another actual city or valid settler overrides a bad cargo record. Assert the query leaves the input byte-identical and ignores both rosters.

- [ ] **Run the new suite red, then add the following leaf implementation.**

```ts
import type { GameState, Unit } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';

export type CivilizationLivenessState = Pick<GameState, 'civilizations' | 'cities' | 'units'>;
export type CivilizationLiveness =
  | { living: true; reason: 'city' | 'settler' }
  | { living: false; reason: 'not-major' | 'eliminated' | 'no-survival-assets' };

function isSurvivingSettler(state: CivilizationLivenessState, unit: Unit): boolean {
  if (unit.type !== 'settler' || !Number.isFinite(unit.health) || unit.health <= 0) return false;
  if (!unit.transportId) return true;
  const host = state.units?.[unit.transportId];
  return Boolean(host && host.id !== unit.id && !host.transportId
    && host.owner === unit.owner && Number.isFinite(host.health) && host.health > 0
    && Array.isArray(host.cargoUnitIds) && host.cargoUnitIds.includes(unit.id));
}

export function getCivilizationLiveness(
  state: CivilizationLivenessState,
  civId: string,
): CivilizationLiveness {
  if (!isMajorCivOwner(civId) || !Object.hasOwn(state.civilizations ?? {}, civId)) {
    return { living: false, reason: 'not-major' };
  }
  if (state.civilizations[civId].isEliminated === true) {
    return { living: false, reason: 'eliminated' };
  }
  if (Object.values(state.cities ?? {}).some(city => city.owner === civId)) {
    return { living: true, reason: 'city' };
  }
  if (Object.values(state.units ?? {}).some(unit =>
    unit.owner === civId && isSurvivingSettler(state, unit))) {
    return { living: true, reason: 'settler' };
  }
  return { living: false, reason: 'no-survival-assets' };
}
```

The defensive absent-map fallback is for incomplete legacy input; it must never fall back to rosters. Do not import `UNIT_DEFINITIONS` or transport/diplomacy code here. Current gameplay transport-type/capacity validity stays in canonical transport mechanics; this query validates the live linkage needed for survival.

- [ ] **Migrate the original query consumers.**

```ts
// victory-system.ts; add the two imports used below.
export function checkDominationVictory(state: GameState): string | null {
  const ids = Object.keys(state.civilizations).filter(isMajorCivOwner);
  if (ids.length < 2) return null;
  const living = ids.filter(id => getCivilizationLiveness(state, id).living);
  return living.length === 1 ? living[0] : null;
}

// ai-round-scheduler.ts
export function getLivingNonHumanMajorIds(state: GameState): string[] {
  return Object.entries(state.civilizations)
    .filter(([id, civ]) => !civ.isHuman && getCivilizationLiveness(state, id).living)
    .map(([id]) => id)
    .sort();
}

// turn-cycling.ts
export function getActiveHumanPlayers(state: GameState): HotSeatPlayer[] {
  return (state.hotSeat?.players ?? []).filter(player =>
    player.isHuman && getCivilizationLiveness(state, player.slotId).living);
}
```

In the scheduler's execution guard replace `civ.isEliminated` with `!getCivilizationLiveness(working, civId).living`; keep missing/prepared/human/lastExecuted guards. Do not rewrite rotation or configured-seat order. Update the marker comment to “terminal elimination transition; use getCivilizationLiveness for current actor eligibility.”

- [ ] **Run canonical, victory, scheduler and cycling suites.** The elimination regression remains red until Task 3; record that distinction. Pin the two-rival guard, zero living majors and sole-settler winner explicitly. Commit `feat(liveness): centralize civilization survival queries`.

## Task 3 — Own elimination and source transitions after atomic mutations

**Modify:** `src/systems/civilization-elimination-system.ts`, `src/systems/city-capture-system.ts`, `src/systems/city-founding-system.ts`, `src/systems/combat-reward-system.ts`, `src/systems/unit-lifecycle-system.ts`, `src/systems/breakaway-system.ts`, `src/systems/religion-loyalty-system.ts`, `src/systems/diplomacy-system.ts`, `src/core/turn-manager.ts`, `src/core/types.ts`.
**Tests:** mirrored tests for all eight system files and `tests/core/turn-manager.test.ts`; add cases to `tests/systems/transport-system.test.ts` where canonical load/unload is part of the scenario.

- [ ] **Write failing lifecycle tests.** Cover capture/raze with surviving settler, military-only cleanup, actual-city omission preventing elimination, ghost roster not preventing elimination, last-settler combat capture/conversion and death, transport sink/deletion, atomic founding, cargo cannot found, breakaway creation/reconquest/reabsorption and repeated reconciliation. Add `expect(input).toEqual(before)` to immutable helpers.

Use the existing `resolveMajorCityCapture`, combat outcome and breakaway fixture builders rather than faking those mutation results. On valid completed lifecycle states call `assertSaveStateInvariants` from `tests/helpers/save-state-invariants.ts`, or its individual validators when testing a specific boundary. Do not invoke a whole-state roster invariant on intentionally malformed query fixtures and then expand production scope to repair them. Existing elimination fixtures currently retain the initial settler: remove that real settler for tests intended to describe a defeated actor, and retain it in the new negative-elimination test. Do not “fix” the tests by manually setting the marker instead of triggering cleanup.

```ts
it('finalizes every assetless actor once, with no invented victor', () => {
  let state = makeLivenessGame();
  state = withoutOwnedAssets(state, 'player');
  state = withoutOwnedAssets(state, 'ai-1');
  const first = reconcileCivilizationLiveness(state, state);
  expect(first.transitions.filter(t => t.kind === 'eliminated')
    .map(t => [t.civId, t.eliminatedBy])).toEqual([
      ['ai-1', null], ['player', null],
    ]);
  expect(reconcileCivilizationLiveness(first.state, first.state).transitions).toEqual([]);
});
```

- [ ] **Change `eliminateCivilization`'s guard and attribution; preserve its teardown body.**

```ts
// Signature and the eliminated:true result variant use string | null.
if (getCivilizationLiveness(state, civId).reason !== 'no-survival-assets') {
  return { state, eliminated: false };
}
```

Inside the eliminated actor's replacement object set `cities: []`, `units: []`, `isEliminated: true`; clear its own active diplomacy relationships/war/treaties/events and vassalage, in addition to the existing other-party cleanup. Preserve history fields identified in the design. Keep the result's removed IDs for callers/tests; collect them from actual owned objects.

For directly exposed active work, cancel the eliminated owner's nonterminal autonomy plans with `cancelNetworkPlan` and remove stale targeted active crisis records before the next tick; do not delete completed plan/history records. Disperse targeted stampede/rogue-host work using their existing outcome/normalization functions without rewards to the dead actor. Make their scheduling/tick eligibility canonical in Task 5. Test the resulting state has no acting target and no respawn next turn. If doing this requires a general new cleanup architecture rather than the existing APIs, stop with the narrow dependency proposal; do not absorb #1001 silently.

- [ ] **Add the reconciliation and emitter APIs exactly as declared in the design.** Coordinator algorithm:

```ts
let working = after;
const transitions: CivilizationLivenessTransition[] = [];
for (const civId of Object.keys(after.civilizations).sort()) {
  const verdict = getCivilizationLiveness(working, civId);
  if (verdict.reason === 'no-survival-assets') {
    const releasedVassalIds = Object.entries(working.civilizations)
      .filter(([, civ]) => civ.diplomacy.vassalage.overlord === civId)
      .map(([id]) => id).sort();
    const result = eliminateCivilization(working, civId, eliminatedBy[civId] ?? null);
    working = result.state;
    if (result.eliminated) {
      transitions.push({ kind: 'eliminated', civId, eliminatedBy: result.eliminatedBy,
        removedUnitIds: result.removedUnitIds, removedSpyIds: result.removedSpyIds,
        releasedVassalIds });
    }
    continue;
  }
  const previous = getCivilizationLiveness(before, civId);
  if (previous.reason === 'city' && verdict.reason === 'settler') {
    transitions.push({ kind: 'cityless', civId });
  } else if (previous.reason === 'settler' && verdict.reason === 'city') {
    transitions.push({ kind: 'resettled', civId });
  }
}
return { state: working, transitions };
```

The full function uses `(before, after, eliminatedBy = {})` and the exact result type in the design. The emitter maps `cityless` to `civ:resettlement-needed`, `resettled` to `civ:resettled`, and `eliminated` to existing `civ:eliminated`; the latter additionally emits `diplomacy:vassalage-ended` for returned releases with reason `overlord_eliminated`. Add the two new event payloads `{ civId: string }` and widen existing `eliminatedBy` to nullable in `GameEvents`. Do not emit from the query or from silent load normalization.

- [ ] **Wire each atomic caller; do not create duplicate elimination events.**

| Source and insertion point | Concrete integration |
|---|---|
| `resolveMajorCityCapture` occupy / raze | Replace direct elimination with reconciliation after project/aircraft effects. Cause map is `{[previousOwnerId]: newOwnerId}`. Preserve `MajorCityCaptureResult.elimination` as a backward-compatible view of the matching transition; add `livenessTransitions` for the full set. `emitMajorCityCaptureEvents` delegates once to the common emitter; delete its old independent elimination/release emission block. |
| Capture's early reconquest branch | Move the raw `reconquerBreakawayCity` function into `city-capture-system.ts` as a private helper, removing its public breakaway export/import. Complete project transfer/removal and territory recalculation, then reconcile once and populate the same result/emitter metadata as normal capture. Update the direct breakaway regression to call `resolveMajorCityCapture(..., 'occupy', state.turn)` and inspect `.state`; retain its unrest assertion. |
| `transferCapturedCityOwnership` | Both the ordinary branch and private reconquest branch reconcile after complete transfer/project/territory effects and return final state. Add optional final `bus?: EventBus`; pass it from `executeLoyaltyDefection` in `religion-loyalty-system.ts` and the espionage city-flip branch in `turn-manager.ts`. Emit once when a bus exists; cleanup still runs without it. Tests exercise both branches with and without the bus. |
| `foundCityInState` | Reject nonliving owner and cargo before validation. Reconcile only after unit consumption, city registration and territory update. Emit founding and recovery once; do not evaluate the transient units-only intermediate. |
| `applyCombatOutcomeToState` | Reconcile the final state after conversion/cargo/aircraft/reward/history logic, just before constructing the return. Build cause entries only for original owners whose survival asset was actually removed/transferred by this outcome; incidental pre-existing dead actors get null. Emit through its already optional bus. |
| `removePlayerUnitFromState` | Add optional bus. Remove host and actual carried units; when deleting cargo detach it from its remaining host. Update affected unit rosters and spy state. Reconcile after removal, with null attribution. Do not route voluntary loss through combat rewards. |
| `createBreakawayFromCity` | After city and unit transfer, reconcile parent and remaining majors; emit with its existing bus. The new breakaway itself owns a city before the check. |
| `tryReabsorbBreakaway` | Keep the `GameState` return and add optional final `bus?: EventBus`; `applyDiplomaticAction` passes its bus. Select all cities and units from actual owner fields and transfer their ownership/territory before removing the absorbed record, then reconcile remaining majors and emit once. Keep origin-city admission, payment and unrest rules. No defeat for the deleted record. Pin direct and diplomatic-call parity, a second acquired city, omitted owned entities, foreign roster IDs and preservation of the previous input. |

Keep `MajorCityCaptureResult.elimination.eliminatedBy` nullable wherever it is copied from general transitions. Existing capture results with a known new owner still carry that real ID.

There is no public reconquest API returning an unfinished lifecycle state after this change: both live users of the private stage are the complete capture entry points above. Reabsorption's existing loop mutates other civilization objects copied only at map depth; clone the specific civilization before replacing its diplomacy so the new input-immutability regression passes. This fixes the touched atomic path without a general state-normalization rewrite.

For voluntary transport deletion, use the union of reciprocal `transportId === unitId` children and legitimate existing cargo IDs for removal; cross-check owner before deleting an unrelated referenced unit. Clear carrier references and every removed unit's owning roster. This corrects the real last-settler-host removal path without exporting the combat reward module's private remover or introducing a general unit architecture refactor.

In the same unit lifecycle module, remove the redundant roster filter from `getUnmovedUnitsForEndTurn`; `getUnmovedUnits(state.units, civId)` already selects actual ownership. Preserve action/transport filters and order. Add a test that a real unrostered settler reaches the end-turn unit prompt, while a foreign or already-acted unit does not. Task 7 exercises the visible prompt.

- [ ] **Run all mirrored tests named above plus the canonical suite.** No initial red case may remain. Inspect the full diff for accidental quest/reward/cargo changes and event duplication, then commit `fix(liveness): finalize defeat after complete entity transitions`.

## Task 4 — Align AI/world/solo/hot-seat timing and prevent resurrection

**Modify:** `src/ai/ai-round-scheduler.ts`, `src/core/turn-manager.ts`, `src/core/hotseat-outcome.ts`, `src/app/controllers/turn-flow-controller.ts`.
**Tests:** `tests/ai/ai-round-scheduler.test.ts`, `tests/core/turn-manager.test.ts`, `tests/core/hotseat-outcome.test.ts`, `tests/core/turn-cycling.test.ts`, `tests/core/completed-round-orchestrator.test.ts`, `tests/core/completed-round-handoff.test.ts`, `tests/app/controllers/turn-flow-controller.test.ts`.

- [ ] **Write failing pipeline tests.** Include last-city capture with a surviving settler through real `processTurn`; a killed/captured last settler; an AI eliminated between planning and execution; a new breakaway; no unit/AI portfolio resurrection over two subsequent rounds; one actor winning while two others end together; transactional phase failure discarding all new events/state.

Pin `turn:start` to input turn + 1 and assert the returned result first holds the end-of-round winner. Pending city capture must block end-turn in the live controller; pending peace unrelated to the eliminated civ must not block a valid result. A defeated current human with pending research/production/boon choices can end/handoff. Exercise an eliminated middle seat, last seat, all humans, and solo human loss with at least two surviving AI civs.

- [ ] **Reconcile at stable boundaries and gate active actor processing.**

```ts
// Stable checkpoint; no cityless/resettled transition inferred from an unchanged snapshot.
const reconciled = reconcileCivilizationLiveness(working, working);
working = reconciled.state;
emitCivilizationLivenessTransitions(reconciled, bus);
```

Place this before AI normalization/planning, after each AI execution and before world processing. Retain the canonical recheck in the scheduler's per-actor execution guard. Do not recreate an eliminated actor's portfolio after execution: only write `lastExecutedTurn` if that actor still queries living. Apply the same rule to network-intent and propagandist pre-execution loops in Task 5.

In `processTurn`, checkpoint before faction/crisis processing and after unit/ownership-changing phase groups, before final opponent normalization. In its main `for ([civId,civ] of civilizations)` loop skip nonliving actors; similarly guard active CI, embargo joining, trade income, new era events, trophy income and economy processing. Keep historical comparison snapshots and historical records; do not delete civilization records to make iteration convenient. Source sub-systems that can keep active work for a dead target are gated in Task 5.

Keep `turn += 1`, `turn:start`, and the victory check in their current order. Do not call a positive victory check from `reconcileCivilizationLiveness` or from the human capture action.

- [ ] **Share zero-human outcome semantics without duplicating liveness.** Extract within `src/core/hotseat-outcome.ts`:

```ts
export function resolveHumanCampaignOutcome(state: GameState): GameState {
  if (state.gameOver) return state;
  const humans = Object.entries(state.civilizations).filter(([, civ]) => civ.isHuman);
  if (humans.length === 0 || humans.some(([id]) => getCivilizationLiveness(state, id).living)) {
    return state;
  }
  return { ...state, gameOver: true, winner: null, gameOverReason: 'all-humans-eliminated' };
}
```

No-human simulation fixtures remain valid: “no humans configured” is distinct from “all configured humans lost.” `resolveHotSeatPostSimulation` calls this before choosing the next seat. The solo completed-round path and the end of `processTurn` after its Domination check use the same helper. Preserve already-completed `gameOver` and existing missing-reason normalization.

In `showRequiredChoicesIfNeeded` / `showReligionBoonIfNeeded`, return false for a nonliving current actor. The end-turn unit-warning guard likewise skips it. Preserve all choice validation for living actors; do not globally weaken overlay blocking. At intermediate hot-seat handoffs recompute the next active configured slot; the final active human still completes the AI/world round exactly once.

- [ ] **Run the listed pipeline suites with an explicit simulation timeout for newly expensive cases.** Confirm no new source import cycle and both real source/non-human event paths, then commit `fix(liveness): align round scheduling and human defeat outcomes`.

## Task 5 — Migrate every active consumer and retain legitimate city gates

**Modify:** every query row in the inventory below, plus `src/systems/pirate-system.ts`, `src/systems/minor-civ-system.ts`, `src/systems/network-plan-system.ts`, `src/storage/save-migrations.ts` for the world-age caller, and `src/systems/crisis-system.ts` for active targeted ticks. New direct action admission belongs in the existing canonical diplomacy entry functions, not in the UI alone.

**Tests:** all existing mirrored tests for changed source files in the same focused invocation, using the exact selection rule in Task 9. Add positive settler-only and negative military-only cases to each domain's existing fixture builder; do not turn entity-less casts into a production fallback.

### Complete raw-marker inventory at the audited source base

`Q` means replace with the canonical query (or already-composed pressure helper); `W` means legitimate terminal write; `T` means type declaration; `C` means explanatory comment. Line numbers are audit anchors, not instructions to apply a stale patch.

| File | Lines / enclosing consumer | Classification and required change |
|---|---|---|
| `src/ai/ai-network-intents.ts` | 34 `assignNetworkIntentsForAI` | Q; retain human guard, query current working state. |
| `src/ai/ai-network-planning.ts` | 26 `getNetworkPlanCandidates`, 78 `planNetworkTurn` | Q; no planning/candidates for defeated actors. |
| `src/ai/ai-prepared-turn.ts` | 462 `prepareMajorCivStrategicPlan` | Q; `actorEliminated: !getCivilizationLiveness(state,civId).living` (decision input, not historical display). |
| `src/ai/ai-propagandist.ts` | 10 `usePropagandistActionsForAI` | Q; no action for dead actor. |
| `src/ai/ai-round-scheduler.ts` | 24 enumeration, 261 execution | Q; Tasks 2/4. |
| `src/core/opponent-ai-state.ts` | 278 AI portfolios, 301 human pressure ledger owners | Q; normalization must not recreate dead portfolios. |
| `src/core/turn-cycling.ts` | 27 `getActiveHumanPlayers` | Q; Task 2. |
| `src/core/types.ts` | 1484 marker field/comment | T; retain optional persisted field, correct comment. |
| `src/storage/vassalage-normalization.ts` | 11 local `living` closure | Q; retains unknown-input string guard before query. |
| `src/systems/barbarian-system.ts` | 306 `chooseBarbarianSpawnType` | Q; candidate city owners must be living majors. |
| `src/systems/civilization-elimination-system.ts` | 54 admission, 69 marker assignment | Q admission by reason; W true assignment only. |
| `src/systems/crisis-force-system.ts` | 32 `normalizeForce` | Q active target validation; keep severity/owner-kind checks. |
| `src/systems/diplomacy-system.ts` | 787 `acceptDiplomaticRequest`; 926 `getVassalageEligibility`; 1418 `hasActiveVassalage`; 1426–1427 `canPetitionIndependence`; 1509 `declareMajorWar`; 1573 `processVassalageTurn` | Q for every endpoint; retain independent treaty/city/military/consent rules. |
| `src/systems/era-resolution.ts` | 37 intended target; 44 nearby city owners | Q; missing major record is excluded, not assumed living. |
| `src/systems/minor-civ-league-system.ts` | 99 `hasLiveConcernSource` | Q major concern actor only; compact members stay minor owners. |
| `src/systems/rogue-elephant-host-system.ts` | 94 start warning; 133 scheduling | Q; current next state, preserve completed/history fields. |
| `src/systems/stampede-system.ts` | 136 scheduling | Q; active tick targets must also stop on defeat. |
| `src/systems/strategic-warning-system.ts` | 148 major warning actor; 348 viewer; 380 human recipients | Q; normal living warnings differ from defeat notification recipients. |
| `src/systems/supply-warning-system.ts` | 40 derive; 74 recipients | Q; keep human/viewer filters. |
| `src/systems/tech-definitions.ts` | 63 `resolveWorldAge` | Q; widen signature as below. |
| `src/systems/threat-pressure-system.ts` | 81 affected humans; 173 active threats; 233 reservation; 257 process | Q, remove redundant marker check when `isPiratePressureEligible` already composes the query. |
| `src/systems/viewer-event-presentation.ts` | 18 `getLivingHumanViewerIds` | Q; retain configured-human uniqueness/sort. Do not use for victim defeat delivery. |
| `src/systems/world-pressure-eligibility.ts` | 6 crisis; 13 pirate | Q; widened state plus existing pressure setting. |
| `src/ui/diplomacy-panel.ts` | 175 list filter | Q; also remove `hasValidOwnedCity` universal filter at 176. |
| `src/systems/espionage-system.ts` | 894 comment naming elimination helper | C; no raw field read; retain truthful comment. |

After migration the only permitted production runtime marker access is the query read and elimination write. Storage normalization is not a blanket raw exemption; no audited historical presentation needs to read the raw flag itself.

### Other liveness/authority consumers and signature changes

| File / API | Exact intended update |
|---|---|
| `src/systems/tech-definitions.ts` | `resolveWorldAge(state: CivilizationLivenessState): number`; filter `Object.entries(state.civilizations)` by query; keep majority calculation and `resolveCivilizationEra`. |
| `src/systems/minor-civ-system.ts` | `checkEraAdvancement`: call `resolveWorldAge(state)`. |
| `src/storage/save-migrations.ts` | Existing `withAircraft` migration call: `resolveWorldAge(withAircraft)`; do not change version/order. |
| World-age test callers | Update `tests/systems/tech-definitions.test.ts`, `production-cost-context.test.ts`, `production-cost-parity.test.ts`, `diplomacy-era-parity.test.ts` to pass a real state with owned cities/settlers. Keep their era assertions. |
| `src/systems/world-pressure-eligibility.ts` | All three exports accept `Pick<GameState,'settings'|'civilizations'|'cities'|'units'>`. `getCrisisEligibleCivIds` keeps an **actual owned city** requirement in addition to canonical liveness; cityless actors need not receive city-targeted disasters. |
| `src/systems/pirate-system.ts` | Replace `employerAlive` / `targetAlive` city-roster conditions with the query. Retain contract expiration and all other contract mechanics. |
| `src/systems/diplomacy-system.ts` | New-agreement city checks use actual `state.cities` owner fields. Keep city-count/military/peak thresholds as action rules; do not broaden vassalage to cityless agreement creation. Gate direct `applyDiplomaticAction`/request creation for both living endpoints, including paths lacking a raw flag today. |
| `src/systems/crisis-system.ts` | `processCrisisTurn` discards inactive-target work before `tickCrisisByArchetype`; no gifts/spawns to a defeated owner. Preserve city-required famine/scheduling denominators. |
| `src/systems/network-plan-system.ts` | `validateNetworkPlanAssignment` rejects a nonliving owner with existing reason `missing-owner`; an existing city whose major owner is nonliving yields `invalid-target`. Apply the latter after finding the target city and before action-specific legality; preserve missing-city and neutral-owner semantics. Cleanup cancels active invalid plans and retains historical completed/canceled records. |

Do not treat every `.cities.length` hit as liveness. Keep explicit last-city assault rules in bombardment/air/pirate combat, faction overextension arithmetic, economy city counts, capital ordering, advisor city recommendations, route/city-list empty-state checks, empire yield distribution and hot-seat summary counts out of the broad roster migration. Only the pirate contract conditions were an additional independent liveness definition found by the length sweep. An actual action-specific city gate may use owner filtering here without requiring #1019.

- [ ] **Write domain parity tests before each group of replacements.** For pressure eligibility, include one living cityless human/AI under every `aiPressure` setting, one defeated actor, and one city-only actor; `getCrisisEligibleCivIds` must still exclude the cityless actor. For new vassalage, either missing city fails even when both are living; an already active cityless-settler vassal relation persists. For pirate contracts, a settler-only endpoint keeps an unexpired contract; no-survival endpoint ends it.
- [ ] **Apply inventory replacements using the current local variable/state.** Example for a pure eligibility entry:

```ts
if (!getCivilizationLiveness(state, civId).living) return false;
const civ = state.civilizations[civId];
if (civ.isHuman) return true;
return resolveWorldPressureFlags(state.settings).aiPressure === 'full';
```

Normalizer unknown IDs use `typeof id === 'string' && getCivilizationLiveness(state,id).living`; no roster normalization. Where dead actor checks compose pressure helpers, retain one call, not two competing rules.

- [ ] **Run all changed modules' mirrored suites together, then `yarn build` separately.** The signature change should fail compilation at any missed caller; do not paper over it with an overload accepting only civilization maps. Review `rg -n 'isEliminated' src` and all inventory rows, then commit `refactor(liveness): migrate diplomacy pressure and era consumers`.

## Task 6 — Give cityless AI a real recovery action

**Create:** `src/ai/ai-resettlement.ts`, `tests/ai/ai-resettlement.test.ts`.
**Modify:** `src/ai/basic-ai.ts`, `src/ai/ai-perception.ts`, `src/ai/ai-major-turn.ts`, `src/ai/ai-upgrades.ts`.
**Tests:** new recovery suite; `tests/ai/basic-ai.test.ts`, `tests/ai/ai-perception.test.ts`, `tests/ai/ai-major-turn.test.ts`, `tests/ai/ai-upgrades.test.ts`, `tests/ai/ai-round-scheduler.test.ts`, `tests/systems/city-founding-system.test.ts`, `tests/systems/transport-system.test.ts`.

- [ ] **Write deterministic fixtures and failing action tests.** Use a small explicit plains/coast map with visible site A, an occupied/too-close current tile, and a legal site requiring movement. Run a scheduled AI round, not just a chooser. Then run a neutral-shore loaded settler fixture across unload → reset action → founding, a ship that must travel to shore, an unrostered own settler, no-known-site frontier, blocked movement, and a fully trapped unit. Each test checks action/state progress or an explicit wait; no invented success metric.

Differential privacy test: two states with identical actor visibility, own units/cities and known-city observations but different hidden terrain/cities must choose the same planned next step. Inspect the planning output before authoritative execution if the selected action's legality intentionally differs. Test all three challenge settings without changing the recovery rule. An established or defeated AI gets no recovery action.

- [ ] **Add the module with this API and deterministic algorithm.**

```ts
export function processAIResettlement(
  state: GameState,
  civId: string,
  bus: EventBus,
): GameState;
```

Private helpers may return a discriminated action (`found`, `move`, `unload`, `wait`) for testability within module tests; do not export another liveness predicate. All own-entity selection filters `Object.values(state.units/cities)` by owner and stable ID. Fix `buildMajorCivPerception`'s two own-entity collections the same way, preserving clones and ID ordering; leave enemy perception logic untouched.

Planning details, in order:

1. Return input unless civ is non-human and query reason is `settler`.
2. Build a **planning map** containing only tiles currently `visible` to this actor (plus its own unit's current tile). Do not call `findPath` on the full hidden map. Use `getVisibility` and `hexKey`; treat fog/unexplored as outside the known route. Known visible cities provide founding-distance exclusions; do not inspect hidden city objects to score/rank goals. Candidate center terrain excludes coast/ocean/mountain, matching current founding terrain; canonical validation is still called at execution.
3. Sort candidate sites by known path cost, then `hexKey`; sort settlers by ID. Use `findPath(from,to,planningMap,'land',{unit:settler,completedTechs:civ.techState.completed})`. Consider the current observed tile first. Choose one step from a known route; recompute later rather than persist a target.
4. For cargo, enumerate currently visible legal unload destinations with `getUnloadDestinations`; prefer a visible suitable founding site, then a visible landing with a known onward route. Otherwise route the host over observed water using its actual type/tech context to a visible coast adjacent to a known recovery site. Do not let a coastal-only hull traverse ocean. No neutral unit/city/camp bypass.
5. If no known site has a path, rank reachable **visible** frontier tiles adjacent to unexplored tiles, by distance then hex key, without reading those neighbors' terrain. Move toward a frontier; ordinary vision reveals additional tiles. A fully blocked unit waits. Do not use the hidden map to pick a “better” frontier.
6. Execute at most one move step per selected unit/host through `executeUnitMove` on an explicit cloned next state. It mutates that owned working copy; on denial retain the unmodified input. Use `foundCityInState` / `unloadUnitFromTransport` for actions. A move may be followed by founding only if the refreshed settler still has movement and has not acted. Unloaded cargo must wait because unloading spends its action. Stop recovery once a city is founded.

Executor example with the existing mutation contract:

```ts
const next = structuredClone(working);
const move = executeUnitMove(next, unit.id, path[1], { actor: 'ai', civId, bus });
if (move.ok) working = next;
```

Do not emit movement feedback on failure. Route occupancy/hidden blockers through canonical execution; do not preflight the full hidden world to optimize the plan. A denied step is a wait for this action, not a signal to use secret terrain to choose a new action.

- [ ] **Wire into the live AI turn before planning.** In `processAITurnInternal`, apply recovery after validating the actor and before constructing its default prepared plan. If a supplied prepared snapshot exists and recovery changed state, refresh that actor's perception/plan using the existing preparation API after recovery; do not spend it as if its old positions still applied. Keep the scheduler's single-round execution stamp.

Reserve every recovering settler and its carrying ship for that invocation. Compute `reservedUnitIds: Set<string>` in `basic-ai` from authoritative units immediately before calling the state-returning recovery API. Exclude these IDs from later administrative founding, cargo load/unload and pillage candidates, even when recovery has just founded a city. Do not change the recovery return type or add saved fields.

Add a final optional `options: { excludedUnitIds?: ReadonlySet<string> } = {}` argument to `processMajorCivStrategicTurn(state, prepared, bus, options)` and `processAIUpgrades(state, civId, prepared, bus, options)`. Pass `{ excludedUnitIds: reservedUnitIds }` from `basic-ai` to strategic execution, then forward it to upgrades. Filter excluded IDs from tactical assignments and new upgrade candidates; skip an excluded ID before executing an existing upgrade route. Keep its unexecuted route intact for future turns. Existing callers need no argument. Prove a reserved carrier with a prepared tactical assignment or upgrade route neither moves twice nor reloads the settler, and ordinary unreserved actions still execute.

Keep the old administrative founding loop for established expansion, with authoritative owner filtering, the reservation exclusion and `!unit.transportId` so it cannot refound from a ship. Recovery has priority, not an additional second turn. Do not rewrite general AI strategy/production or replan other civilizations from hidden updated information.

- [ ] **Run the recovery and live scheduler/perception suites.** Assert landed city, correct settler removal/roster, no double move, no immediate reload onto the ship, and no actions for a dead actor. Then commit `feat(ai): recover cityless civilizations with surviving settlers`.

## Task 7 — Wire owner explanation, safe defeat delivery and handoff roster

**Create:** `src/systems/civilization-status-presentation.ts`, `src/presentation/register-civilization-presentation.ts`, with mirrored tests.
**Modify:** `src/presentation/register-all.ts`, `src/app/controllers/hud-controller.ts`, `src/ui/diplomacy-panel.ts`, `src/ui/unit-turn-flow.ts`, `src/app/controllers/player-action-controller.ts`, `src/app/controllers/turn-flow-controller.ts`, `src/ui/turn-handoff.ts`, `src/audio/audio-system.ts` if its entitlement test needs strengthening.
**Tests:** mirrored files; `tests/ui/unit-turn-flow.test.ts`, `tests/ui/turn-handoff.test.ts`, `tests/ui/notification-delivery-regressions.test.ts`, and `tests/presentation/register-all.test.ts` are required live-wiring cases.

- [ ] **Write rendered interaction tests first.** Perform real Found/Delete/Cancel clicks or the existing live controller callback, then inspect visible DOM before reopening anything. Test a healthy cityless viewer, an established viewer, military-only and orphan-cargo negatives, two hot-seat viewers and repeat updates. An actual unrostered settler must appear in the existing unmoved-unit end-turn prompt and remain selectable. Keep every existing unit/cargo action reachable.

- [ ] **Add the narrow projection and HUD element.**

```ts
export interface CivilizationStatusPresentation {
  kind: 'rebuild' | 'defeated';
  message: string;
}
export function getCivilizationStatusForViewer(
  state: GameState,
  viewerId: string,
): CivilizationStatusPresentation | null {
  const verdict = getCivilizationLiveness(state, viewerId);
  if (verdict.reason === 'settler') return {
    kind: 'rebuild',
    message: 'Your civilization is still in play. Found a city with a settler to rebuild.',
  };
  if (verdict.reason === 'no-survival-assets') return {
    kind: 'defeated',
    message: 'Your civilization has no cities or surviving settlers. Its remaining units have stood down.',
  };
  if (verdict.reason === 'eliminated') return {
    kind: 'defeated', message: 'This civilization has been eliminated.',
  };
  return null;
}
```

Call only with the actual current viewer in `HudController.update`. After `hud.textContent = ''`, append a readable wrapping status row with `data-role="civilization-status"`, using `textContent`. Null omits the row. It must not be clipped into the existing single-line yield row. After source actions use the already live HUD refresh path; no new `main.ts` behavior.

The generic terminal text after immediate cleanup is deliberate: the persistent marker has no stored cause. More detailed new-defeat copy belongs to its source notification, not an invented historical HUD reason.

- [ ] **Install the new registrar in `ALL_REGISTRARS`.** Subscribe to the two new source events and `civ:eliminated`; deliver owner messages through `ctx.notifier.deliver(civId, ...)`, even if that human is now defeated. Do not enumerate only living viewers for defeat delivery. Rebuild/recovered messages are respectively the design copy and “Your civilization has a city again.”

For a responsible human victor use generic rival-defeat text; do not expose identity/asset counts/locations. Null or non-human attribution causes no victor toast. Existing mute/conquest audio stays recipient-scoped; if the responsible human did not know the victim, do not use its civ name in any audio/presentation cue. Register disposers and prove duplicate registration/disposal does not duplicate messages. No persisted notification dedupe field: the transition emitter fires once.

- [ ] **Preserve diplomacy reachability and city-specific legality.** Remove `hasValidOwnedCity` from the universal major-list filter (and remove the now unused local helper). Use query plus `shouldListMajorCivForViewer`. Test met cityless rival appears, unmet cityless rival does not, and neither party lacking a city can create a new vassal agreement. Do not display a rival's query reason.

- [ ] **Make final-asset deletion explicit and complete.** Before rendering the existing Delete dialog, compute the canonical removal on a copy without a bus and compare the owner's before/after verdict. If it changes living → nonliving, append: **“This is your last city-founding settler. Removing it will end your civilization and its remaining units will stand down.”** For a host: **“This ship carries your last city-founding settler. Removing it will end your civilization and its remaining units will stand down.”** Keep existing caravan route text where applicable. Cancel is a no-op. Confirm calls `removePlayerUnitFromState` against fresh state with the live bus, so state/notification cleanup happens once. Add `bus?: EventBus` to `UnitTurnFlowDeps` and pass `deps.bus` from the live player-action-controller.

Do not emit events from the preview copy. Recheck selected unit and owner on repeat click. Preserve overlay pop order before end/handoff and do not ask for impossible production choices after defeat.

- [ ] **Add the public configured-seat roster under the handoff veil.** In `showTurnHandoff`, derive configured human names whose `getCivilizationLiveness(state,slotId).living` is false and render “Out of this game: Alice, Bob” when nonempty. Use only configured player names; no civilization identity/reason/units/coordinates. Recompute on `setReady(state)` so AI-round eliminations appear. This is static state text on the veil, not an event queue; no new saved fields or replay ledger. Test waiting → ready, failed-save retry, reload and the next-seat readiness click.

In `handleVictoryIfNeeded`, use `shouldListMajorCivForViewer` (or the winner being the viewer) before providing its name; otherwise pass “Another civilization”. Do not change positive victory timing or add a progress panel.

### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Current owner cityless + settler | HUD update / open carrier | Owner rebuild text; existing unit/cargo controls remain usable. |
| Rebuild text shown | Live founding action | City shown; text removed immediately. |
| Last settler/host selected | Delete then Cancel | Defeat warning visible; no entity/log/state mutation. |
| Same unit | Delete then Confirm twice | One removal/defeat; no stale target or duplicate event; UI can end/handoff. |
| Known cityless rival | Open/reopen diplomacy | Rival listed; city-required offers unavailable. |
| Human lost during shared round | Handoff becomes ready | Configured name in public out-of-game roster; next living viewer only after Ready. |

### Misleading UI Risks

No rebuild label for an irrelevant unit, invalid cargo or terminal marker. No claim that the current tile is suitable. No rival query reason, unobserved winner name or victim-private defeat content on another seat. No “last settler” deletion warning when an actual city or second viable settler survives. Test those near misses explicitly.

### Interaction Replay Checklist

- [ ] Capture → handoff → select/move/unload → later found → immediate HUD update.
- [ ] Cancel/confirm/repeat Delete; stale selected host/cargo ID handled safely.
- [ ] Diplomacy close/reopen and cityless rival → eliminated rival refresh.
- [ ] Two viewer identities, eliminated middle/last seat, handoff save retry, reload.
- [ ] Queue/ETA: no new queue introduced; existing production/notification queue behavior must not regress.

- [ ] **Run the mirrored UI/controller/registrar tests, then commit** `feat(ui): explain civilization survival and defeat safely`.

## Task 8 — Prove save continuity, remove the workaround and enforce the rule

**Modify:** `src/storage/vassalage-normalization.ts`, `src/core/opponent-ai-state.ts` (their query migrations are Task 5), `src/testing/scenarios.ts`, `scripts/check-src-rule-violations.sh`, `.claude/hooks/check-src-edit.sh`, `.claude/rules/game-systems.md`.
**Create:** `scripts/check-civilization-liveness.mjs`, `tests/systems/civilization-liveness-integration.test.ts`, `tests/storage/civilization-liveness-continuity.test.ts`.
**Modify tests:** `tests/storage/vassalage-normalization.test.ts`, `tests/storage/save-manager.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/testing/scenarios.test.ts`, `tests/scripts/check-src-rule-violations.test.ts`, `tests/hooks/check-src-edit.test.sh`.

- [ ] **Write roundtrip tests using real load normalization.**

```ts
import { assertSimulationEquivalent } from '../helpers/deterministic-state';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

it('preserves survival and one-turn outcome across the actual load boundary', () => {
  const before = normalizeLoadedState(makeLivenessGame());
  const uninterrupted = processTurn(structuredClone(before), new EventBus());
  const reloaded = normalizeLoadedState(JSON.parse(JSON.stringify(before)));
  const continued = processTurn(reloaded, new EventBus());
  assertSimulationEquivalent(continued, uninterrupted, 'liveness continuation');
  assertSaveStateInvariants(continued, 'valid liveness continuation');
  expect(getCivilizationLiveness(continued, 'ai-1'))
    .toEqual(getCivilizationLiveness(uninterrupted, 'ai-1'));
  expect(continued.gameOver).toBe(false);
  expect(continued.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
});
```

Expand to actual capture/loss commands between the save point and `processTurn`; do not normalize both branches after the action just to hide a divergence. Include current/legacy save versions supported by the existing fixture, cargo, terminal marker, ghost/unrostered city and unit, active vassal, unmarked assetless actor and completed old game. Assert no extra schema field and normalization idempotence. The first normalization above establishes a legitimate current fixture; add an independent assertion that the liveness verdict itself did not change on that first normalization.

The #1004 comparator and #1006 invariants are merged and mandatory; do not create a second global exclusion list or compare only a local state projection. Reuse `tests/storage/fixtures/save-compat/manifest.ts` and its baseline for representable legacy cases; the existing all-version matrix remains its owner. Explicit malformed-roster cases assert survival continuity without claiming structural roster validity. Capture source events on both continuations; load must emit none and must not repeat old defeat/recovery notifications. Test old `gameOver` saves remain completed; do not promise to restore historically deleted settlers.

- [ ] **Remove only the obsolete scenario workaround after proving it.** In `great-general-ai-command`, remove the workaround description and the artificially seeded player city if the scenario builder still preserves the starting settlers. Add a regression that runs its real AI/world pipeline, verifies the original general-command observation and asserts no unrelated turn-1 victory. If the builder has drifted to remove starting settlers, give the scenario a legitimate explicit survival asset with a documented purpose; do not retain a hidden victory bypass.

- [ ] **Write intentional source-check failures and allowed-code tests.** Required fixtures:

```ts
const badFlag = 'if (civ.isEliminated) return [];';
const badOptional = 'if (state.civilizations[id]?.isEliminated) return false;';
const badIndex = 'const dead = civ["isEliminated"];';
const badBinding = 'const { isEliminated: dead } = civ;';
const badRoster = 'export function checkDominationVictory(state) { return Object.values(state.civilizations).filter(civ => civ.cities.length > 0); }';
const badPirate = 'const employerAlive = civ.cities.length > 0;';
const goodCost = 'const maintenance = civ.cities.length * 2;';
const goodQuery = 'const alive = getCivilizationLiveness(state, civId).living;';
```

Use the existing temporary-workspace script harness. Add cases for comments, optional type declaration, legitimate cleanup assignment at its exact function/file, legitimate city-count arithmetic, a newly named source file outside the audited inventory, and a roster predicate inside each of the four original functions. Return 2 for violations and 0 for acceptable cases from both the shell source gate and the JSON-stdin hook.

- [ ] **Implement one shared AST checker without new dependencies.** CLI: `check-civilization-liveness.mjs --source-root <root> <absolute-target-path> [...]`. Return diagnostics with source-root-relative path/line and exit 2. Parse with the installed `typescript` AST, never execute target code. Core traversal:

```js
function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return undefined;
}
// Visit each node with ts.forEachChild. Track enclosing named function.
// Runtime property accesses with propertyName(node) === 'isEliminated' are violations
// except the exact canonical query read. Object property assignment of true is allowed
// only in eliminateCivilization; binding elements using this property are reads.
```

Identify the exact allowlist by repository-relative file and enclosing function, not line numbers. Type declarations are AST type nodes; comments are not runtime nodes. In the original four named functions inspect conditions/return/filter callbacks for roster `.length`, `.some`, `.filter` access chains; exclude assignment-only cleanup. For newly named obvious alive/living/eliminated predicates outside them, inspect the initializer/return expression for the same roster shape. Do not claim to solve arbitrary semantic aliasing.

Invoke from both existing gates using the repository's mise/Yarn runtime (`yarn node` supplies TypeScript's PnP resolution). The checker path and dependency resolution come from the gate's repository. Before invoking the wrapper, the shell gate captures the caller's absolute working directory as the source root and resolves its accepted root-relative source arguments to absolute targets. Keep its existing checks on their original arguments. The JSON hook already has an absolute target: derive the source root from the ancestor of its source-tree `src/` component, including a temporary workspace, and pass that root explicitly. Thus wrapper directory changes cannot redirect file reads or allowlist matching. Forward diagnostics/exit 2 without replacing existing rule output; do not borrow another worktree's `.pnp.cjs`. Test both gates with a caller/source root different from the checker's repository.

- [ ] **Add policy and structural integration coverage.** State the chosen rule, canonical query, terminal-marker exception and immutable atomic-boundary requirement in `.claude/rules/game-systems.md`. Add a source integration test that checks inventory runtime usages and live caller imports for query/registrar/HUD. Check that all trainable `canFoundCity` definitions remain covered by the explicit settler rule, without hardcoding a transport roster.

- [ ] **Run save/scenario/source suites and `yarn test:hooks`.** Verify the deliberate bad snippets actually fail; merely seeing a checker file in the diff is insufficient. Commit `test(liveness): guard save continuity and canonical rule ownership`.

## Task 9 — Final local verification and Terra stop

- [ ] **Complete the 38-category acceptance trace and bounded sibling sweep.** Every row below must point to passing tests; unimplemented checkboxes remain open. Run the raw-marker and city/unit-length searches again. Migrate newly discovered same-root active consumers, or record why a count is action-specific/historical. Do not start #1019/#1020 wholesale migration.
- [ ] **Review the actual full branch and working-tree diffs.**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
git diff --check
```

If untracked source/tests exist, inspect those too; they do not appear in `git diff`. Reconcile both docs with final implementation, decisions and task status. Keep this MR one deployable liveness change: no intermediate merge of canonical rule without recovery/UI/consumer migration.

- [ ] **Run required source checks and every mirrored test for changed source files.** Build the exact file list from the union of committed, uncommitted and intended untracked source changes. For each `src/foo/bar.ts`, run `tests/foo/bar.test.ts` if present; otherwise use the named new integration suite for this domain or the smallest existing relevant domain test. Never infer all tests passed from a narrow filter that matched no files. Run the resulting paths in **one** `yarn test --run ...` command; retain the result/session until exit.

The following integration/coverage set is additionally required even if not selected by mirroring:

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/civilization-liveness.test.ts tests/systems/civilization-liveness-integration.test.ts tests/storage/civilization-liveness-continuity.test.ts tests/systems/victory-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/ai/ai-resettlement.test.ts tests/ai/ai-round-scheduler.test.ts tests/core/turn-cycling.test.ts tests/core/hotseat-outcome.test.ts tests/core/completed-round-handoff.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/storage/vassalage-normalization.test.ts tests/systems/vassalage-lifecycle.test.ts tests/testing/scenarios.test.ts tests/scripts/check-src-rule-violations.test.ts
```

Do not unnecessarily repeat overlapping runs after they pass; combine this set with the mirrored set when practical. Ensure `tests/app/determinism-guard.test.ts`, `tests/app/simulation-determinism.test.ts`, `tests/storage/save-compat-matrix.test.ts`, `tests/storage/save-compat-coverage.test.ts` and the shared helper tests are included in final durable verification; if targeted failures arise, isolate only the affected suite. These are existing merged gates, not new matrix work. `scripts/run-wonder-regressions.sh` is required if implementation changes wonder history/quest rules rather than merely retaining untouched calls; do not broaden into wonder work.

- [ ] **Run build and durable full verification separately.**

```bash
./scripts/run-with-mise.sh yarn build
```

Then, after build has completed:

```bash
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
```

Never chain build and test in one shell session. For a bounded combined PR proof use `yarn verify:pr` then `yarn verify:pr:status` as required by repo policy; do not unnecessarily duplicate equivalent full runs when valid evidence already applies. Durable status is authoritative if streamed output truncates; inspect a process only when status says active. Do not start another equivalent run/push while one may still run. Stop/report after two materially similar failures. Any edits or commits that invalidate the HEAD/tree-bound proof require evidence for the final HEAD before PR/push.

Run `yarn test:hooks` for the hook change. No desktop packaging was changed, so Tauri packaging checks are not required by this plan; if implementation touches a platform/distribution path, follow its additional rule and re-scope that deviation explicitly.

- [ ] **Use the verification-before-completion skill and report exact local evidence.** Do not create the MR in Terra. Stop with:

`READY FOR SOL IMPLEMENTATION REVIEW — STOP HERE. SWITCH TO SOL, HIGH EFFORT.`

## Acceptance trace — the document's 38 categories

| Requested cases | Plan task / exact primary tests |
|---|---|
| 1 city+units; 2 city-only; 3 settler; 4 military; 5 cargo; 6 naval; 7 air; 8 none | Task 2, `tests/systems/civilization-liveness.test.ts`. |
| 9 ghost city; 10 omitted city; 11 ghost unit; 12 omitted unit | Tasks 1/2, canonical/victory/scheduler tests. |
| 13 victory; 14 elimination; 15 scheduler; 16 hot seat; 17 diplomacy/era/pressure agreement | Tasks 2–5, `civilization-liveness-integration.test.ts` plus each mirrored consumer suite. |
| 18 entity cleanup; 19 historical retention; 20 no resurrection | Tasks 3/4, elimination/combat/unit-lifecycle/turn-manager tests. |
| 21 cityless vassal; 22 living overlord; 23 release/end | Tasks 3/5, `diplomacy-vassalage.test.ts`, `vassalage-lifecycle.test.ts`, normalization tests. |
| 24 breakaway invariants | Task 3, `breakaway-system.test.ts` plus city-capture tests for the early reconquest branch. |
| 25 living AI turn; 26 recovery; 27 defeated AI skipped | Tasks 4/6, scheduler/recovery/perception tests. |
| 28 defeated human skipped; 29 living cityless seat; 30 mid-round completion; 31 privacy | Tasks 4/7, cycling/outcome/controller/handoff/notification tests. |
| 32 pre-transition save; 33 identical verdict; 34 one-turn continuation | Task 8, `civilization-liveness-continuity.test.ts`, actual load normalizers. |
| 35 outcome timing; 36 blocking/pending distinctions | Task 4, `turn-manager.test.ts`, controller and completed-round transaction tests. |
| 37 workaround removal; 38 proof it is unnecessary | Task 8, `tests/testing/scenarios.test.ts` real scenario pipeline. |

Additional design findings have explicit coverage: cargo cannot found (Task 3); last-asset Delete consequence/cancel/repeat (Task 7); no-human-configured simulation negative (Task 4); action-specific vassal city conjunction (Task 5); observed-only AI plan differential and no double action (Task 6); unknown winner and static handoff roster (Task 7); deliberate AST checker rejection/allowed arithmetic (Task 8).

## MR boundary, rollback and downstream handoffs

One implementation MR owns Tasks 1–9 and both docs. Internal commits may be red during TDD, but no partial MR may merge a rule that changes survival without its live AI/UI/cycling behavior. Sol's MR uses `Closes #981` and `Closes #1018` only once all acceptance rows are satisfied; no closure of #985/#1019/#1020.

Rollback before merge is a local change reversal with the existing schema retained. After merge, reverting the liveness MR restores old behavior but cannot reconstruct entities already deleted by completed eliminations; never promise data resurrection. A design invalidation prints `DESIGN ESCALATION REQUIRED — STOP. SWITCH TO ASTRA, XHIGH EFFORT.` A missing required helper may use the current equivalent only when semantics match; otherwise document the narrow prerequisite and stop.

Sol must refresh drift, inspect actual source/tests/UI/save/AI and both full diffs, perform the exact 18-dimension inline review, fix every real in-scope finding and add regressions. Sol then obtains final build/durable/current-tree evidence and creates the MR with the required Game rule, Root cause, Canonical API, Stale roster semantics, AI/hot-seat, Save/determinism, Similar-bug audit, Pre-MR inline review and Verification sections. After MR creation:

`STOP — SWITCH TO LUNA FOR CI WATCHING AND MERGE.`

Luna follows the supplied document's CI escalation rules. Merge requires all required non-build checks green, no unresolved blocking review or known defect; a build exception is allowed only under the repo's known policy and never for a proven real code defect. Rebase merge with admin bypass is authorized by the arc document, not squash or merge-commit. Verify remote HEAD if push streaming is incomplete; no duplicate push. After merge refresh main, verify merged SHA/issue states and phase docs, then stop for Astra #985 design. No Phase-0/Phase-1 automatic model switch or autonomous continuation into another phase.

## Mandatory implementation-plan review — completed inline

Review instruction: “perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

| Dimension | Finding / plan evidence inspected | Severity | Required fix | Resolution |
|---|---|---|---|---|
| Balancing gameplay | A mechanical query migration could leave any-unit fixtures and change pressure city gates. | High | Explicit negative units and retained city-action gates. | Tasks 2/5 enumerate both; no broad economy changes. |
| Fun | Recovery only tested as a chooser would leave the escape feature unusable. | High | Scheduled multi-turn land/cargo recovery. | Task 6 asserts real move/unload/found behavior and reserved actions. |
| New mechanics | Handoff event memory or grace timer could create hidden persisted requirements. | Medium | Use derived state surfaces. | Static veil roster; no new timer/ledger/schema field. |
| Ages 7–43 | Generic marker text alone would not explain last-settler deletion. | High | Exact warning and cancel/confirm DOM tests. | Task 7 preserves existing dialog and adds consequence copy. |
| Play styles | Cityless diplomacy listing could accidentally broaden new vassalage offers. | High | Separate list eligibility from action conjunction. | Task 5 two-party city negatives and Task 7 list tests. |
| Difficulty modes | Recovery tests could cover only default AI. | Medium | Parameterize all challenge settings. | Task 6 requires all three; Task 5 keeps pressure settings distinct. |
| Computer players | Existing prepared plans/cargo/upgrade loops can spend recovery units twice or reload them. | High | Recovery before preparation and explicit per-turn reservations. | Task 6 pins both optional exclusion arguments, live caller, stale-plan refresh and route/tactical negatives. |
| UI | A new status helper alone would be dead code. | High | Live HUD, registrar and controller changes. | Task 7 names all callers; Task 8 structural integration test. |
| UX | Eliminated owner might remain blocked on research or handoff retry. | High | End-turn gate and transaction replay coverage. | Tasks 4/7 cover middle/last seat and save retry. |
| Architecture | World-age input widening and checker runtime could miss callers/worktrees. | High | Exact call inventory; leaf query; explicit source root and absolute targets. | Tasks 2/5/8 identify signatures, PnP path and CLI/hook parity across temporary workspaces. |
| Extensibility | A generic `.length` ban creates noise, while raw-flag-only misses pirates. | Medium | Precise source shapes and allowed arithmetic cases. | Task 8 checks known entry functions, obvious alive predicates and deliberate negatives. |
| Data | Cargo removal and stale own rosters can defeat agency despite correct query. | High | Source cleanup and narrow own-perception migration. | Tasks 3/6 test reciprocal removal, omitted ownership and real recovery. |
| SFX | New general defeat may have no responsible major. | Medium | Nullable attribution and no wrong-viewer sting. | Tasks 3/7 propagate null; owner/victor audio tests. |
| Saved games | Normalizing both branches or using a local projection could conceal discontinuity; #1004/#1006 landed during review. | High | Save before real transition; reuse merged whole-state comparator and invariants. | Task 8 pins whole-state/turn/outcome, independent first-load verdict and existing version-matrix gate. |
| Testing | Tests originally encode false win and city rosters without real cities. | High | Exact red regressions, entity fixtures, full acceptance trace. | Tasks 1/2 replace flawed fixture assumptions; 38-category trace above. |
| Solo regressions | No-human simulation can be confused with defeated solo human. | High | Explicit humans.length negative. | Task 4 helper and dedicated simulation/solo cases. |
| Hot-seat regressions | Defeated recipient would be dropped by living-viewer enumeration. | High | Owner delivery outside living-viewer helper, public roster only. | Task 7 specific notification and differential handoff tests. |
| Proper implementation | Nested breakaway/capture emitters and multiple eliminations can duplicate or lose events. | High | Private reconquest stage; one returned transition set per complete source; one emitter. | Task 3 pins both capture branches and loyalty/spy/reabsorption callers, immutable inputs and multi-actor/repeat tests; Task 4 event-buffer rollback. |

The review also checked cold-start usability: exact query and lifecycle signatures, raw-marker inventory, source caller map, dependency boundaries, test-first order, live recovery/UI paths, save/hot-seat negatives, MR safety, verification/session handling, drift criteria and rollback limits are explicit. Resolved findings are requirements to implement; none is represented as an already-fixed production bug.

## Phase-0 stop

After both documents are saved, reviewed and checked, Astra must stop without production code or an MR:

`READY FOR TERRA IMPLEMENTATION — STOP HERE. SWITCH TO TERRA, HIGH EFFORT. DO NOT BEGIN IMPLEMENTATION IN ASTRA.`
