# Beast Stampede Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a recurring, pressure-aware Beast Stampede with fair containment, save-safe rewards, and viewer-safe core presentation.

**Architecture:** A typed `StampedeState` registry owns target recurrence and lifecycle facts while `CrisisForce` owns actor membership and #702 routes. A canonical Stampede system runs at the target turn boundary, passes trample through existing combat/movement helpers, and exposes one viewer-scoped presentation model for the existing world-pressure and production surfaces.

**Tech Stack:** TypeScript, Vitest, Canvas route overlay, DOM city/world-pressure panels, seeded RNG, serialized save migrations.

---

## File map

- `src/core/types.ts`: serializable Stampede phase, outcome, charge, and state types; optional `GameState.stampedes` registry.
- `src/systems/stampede-system.ts`: pressure gates, deterministic scheduling, lifecycle, trample/pillage, cleanup, rewards, and production-cost helpers.
- `src/systems/stampede-route-system.ts`: permits exactly one hostile first-step blocker while retaining #702 legality and fog rules.
- `src/core/turn-manager.ts`: target-turn invocation and transition event forwarding.
- `src/systems/combat-reward-system.ts`: transition-owned herd-death fact.
- `src/systems/pillage-system.ts`: actor-neutral crisis pillage transition that grants no civilization loot or healing.
- `src/systems/world-pressure-presentation.ts`, `src/ui/city-panel.ts`: current-player status and production-cost truth.
- `src/storage/save-migrations.ts`, `src/systems/crisis-force-system.ts`: schema 17 and idempotent normalization.
- Tests: `tests/systems/stampede-system.test.ts`, `tests/systems/stampede-route-system.test.ts`, `tests/systems/combat-reward-system.test.ts`, `tests/systems/pillage-system.test.ts`, `tests/systems/world-pressure-presentation.test.ts`, `tests/ui/city-panel-crisis.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/core/turn-manager-crisis.test.ts`.

## Player Truth Table

| Before | Action / transition | Immediate visible result |
| --- | --- | --- |
| No own Stampede | Own turn creates warning | Current-player world-pressure surface shows plain warning, phase, and one-turn safety. |
| Active visible herd | Select herd | Selected-unit text and route overlay show only earned-visible next steps. |
| Active event | Herd pass resolves | Status refreshes remaining turns and containment limits in the same render cycle. |
| Defeated/contained event | Open city production | Both eligible units remain visible; next eligible entry shows reduced cost and charge duration. |
| Other human owns event | Handoff/rerender | No warning, route, status, charge, marker, or text leaks. |

## Misleading UI Risks

- A step is not previewed unless herd and every committed step are visible to the current viewer.
- Containment is not promised before expiry; defeated and contained outcomes remain distinct.
- The discount never applies to unreachable/non-beast units, a second qualifying unit, or another player's charge.
- The compact current-player status does not become cross-civilization world-pressure intel.

## Interaction Replay Checklist

- Trigger warning; select a visible herd after activation; verify route/status refresh.
- Resolve a herd through player combat and world-turn combat; verify one shared outcome source.
- Complete an eligible production item; reopen/rerender and verify ordinary cost with charge consumed.
- Expire an unreachable charge; verify one 20-gold conversion across repeated turns and save/load.
- Hand off between two humans in warning, active, and reward phases; rerender all relevant surfaces.

### Task 1: Typed state and schema 17

**Files:** Modify `src/core/types.ts`, `src/storage/save-migrations.ts`, `src/systems/crisis-force-system.ts`; create `src/systems/stampede-system.ts`; test mirrored system/storage files.

- [ ] **Step 1: Write focused failing tests.**

```ts
expect(getStampedeProfile('explorer')).toMatchObject({ cooldownTurns: 12, initialChancePercent: 3, growthPercent: 1, capPercent: 12, herdCount: 2 });
expect(getStampedeProfile('veteran').capPercent).toBe(25);
expect(migrateSaveToCurrent({ ...legacy, saveSchemaVersion: 16 })).toMatchObject({ saveSchemaVersion: 17, stampedes: {} });
expect(normalizeStampedes(malformedState).stampedes).toEqual({});
```

- [ ] **Step 2: Run the tests and confirm they fail for missing types/schema behavior.**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/storage/save-migrations.test.ts tests/systems/crisis-force-system.test.ts`

- [ ] **Step 3: Implement typed, idempotent state.**

Add `StampedePhase`, `StampedeOutcome`, and `StampedeState` with force ID, phase, created/resolved turns, active and eligible turn counters, city/civilian/pillage facts, one terminal outcome, reward flag, and charge. Schema 17 defaults and normalizes `stampedes ?? {}`; reject invalid IDs, force references, phases, outcomes, counters, and duplicate tile keys without mutating input.

- [ ] **Step 4: Run the tests; commit.**

```bash
git add src/core/types.ts src/storage/save-migrations.ts src/systems/crisis-force-system.ts src/systems/stampede-system.ts tests/systems/stampede-system.test.ts tests/storage/save-migrations.test.ts tests/systems/crisis-force-system.test.ts
git commit -m "feat(703): add save-safe Stampede state"
```

### Task 2: Deterministic recurring warnings

**Files:** Modify `src/systems/stampede-system.ts`, `src/core/turn-manager.ts`; test `tests/systems/stampede-system.test.ts`, `tests/core/turn-manager-crisis.test.ts`.

- [ ] **Step 1: Write failing scheduling tests.**

```ts
expect(maybeStartStampede(stateAtGuaranteedRoll, 'player')).toMatchObject({ stampedes: { player: { phase: 'warning', eligibleTurns: 0 } } });
expect(maybeStartStampede(withActiveCrisis, 'player')).toBe(withActiveCrisis);
expect(resolveStampedeSeverity(aiState, 'ai-1')).toBe('standard');
```

Cover era 2/9, absent geography/spawn, cooldown, blocked non-growth, resumed accumulated chance, all difficulty profiles, and same-state deterministic rolls.

- [ ] **Step 2: Implement the canonical scheduler.**

Use `resolvePressureSeverityForCiv`, `countActiveCrisesForCiv`, and target-matching active crisis-force records. Roll a seeded integer from game ID, target ID, and turn. Choose sorted legal unoccupied spawn tiles. Only target-owned turn processing creates warning state; UI callers cannot schedule it.

- [ ] **Step 3: Run focused tests; commit.**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/core/turn-manager-crisis.test.ts
git add src/systems/stampede-system.ts src/core/turn-manager.ts tests/systems/stampede-system.test.ts tests/core/turn-manager-crisis.test.ts
git commit -m "feat(703): schedule recurring Stampede warnings"
```

### Task 3: Herd pass, trample, and pillage cap

**Files:** Modify `src/systems/stampede-system.ts`, `src/systems/stampede-route-system.ts`, `src/systems/combat-reward-system.ts`, `src/systems/pillage-system.ts`, `src/core/turn-manager.ts`; test all mirrored files.

- [ ] **Step 1: Write failing behavior tests.**

```ts
expect(planHerdRoute(blockedByEnemy, forceId, herdId).steps[0]).toEqual(enemy.position);
expect(resolveStampedeTurn(blockedByEnemy, 'player').units[enemy.id]).toBeUndefined();
expect(resolveStampedeTurn(twoPillages, 'player').stampedes!.player.pillagedTileKeys).toHaveLength(2);
expect(resolveStampedeTurn(twoPillages, 'player').map.tiles[thirdKey].improvement).not.toBe('none');
```

Prove water, mountain, city, cargo, friendly crisis, and second-unit blockers remain illegal; Fort ends movement; IDs define herd order; the warning pass cannot act; and human/non-human combat writes the same fact.

- [ ] **Step 2: Implement through shared mechanics.**

A single hostile defender is a first-step candidate only. Resolve it with `resolveCombat` and `applyCombatOutcomeToState`, then enter only if removed and movement remains legal. Add `recordStampedeCombatOutcome` at the shared combat-outcome source. Extract the tile mutation shared with `applyPillageToState` into a pure helper, then use a crisis wrapper that grants neither gold nor healing and consumes no player action. Pillage only after landing and stop after two force-wide pillages in the pass.

- [ ] **Step 3: Run focused tests; commit.**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/systems/stampede-route-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/pillage-system.test.ts tests/core/turn-manager-crisis.test.ts
git add src/systems/stampede-system.ts src/systems/stampede-route-system.ts src/systems/combat-reward-system.ts src/systems/pillage-system.ts src/core/turn-manager.ts tests/systems/stampede-system.test.ts tests/systems/stampede-route-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/pillage-system.test.ts tests/core/turn-manager-crisis.test.ts
git commit -m "feat(703): resolve Stampede herd pressure"
```

### Task 4: Outcomes, Herding Insight, and core presentation

**Files:** Modify `src/systems/stampede-system.ts`, `src/systems/city-system.ts`, `src/systems/world-pressure-presentation.ts`, `src/ui/city-panel.ts`, `src/core/turn-manager.ts`; test mirrored system/UI files.

- [ ] **Step 1: Write failing boundary and DOM tests.**

```ts
expect(resolveExpiredStampede(quietExpiry).stampedes!.player.outcome).toBe('contained');
expect(resolveExpiredStampede(threePillages).stampedes!.player.outcome).toBe('survived');
expect(getStampedeUnitProductionCost(withCharge, 'beast_handler')).toBe(Math.ceil(base * 0.8));
expect(panel.textContent).toContain('next eligible unit');
```

Cover no city damage/no civilian kill/exactly two pillages, every failure boundary, one reward only, unreachable expiry conversion, no beast-hoard/capture duplicate, all legal catalog cards, current-player-only warning/status, route fog, and immediate rerender after state transition.

- [ ] **Step 2: Implement outcomes and cost composition.**

Classify only at shared herd-death/expiry transitions. Grant `min(10 * era, 80)` once for defeated/contained. Make `getStampedeUnitProductionCost` compose with existing city discounts, consume only on completed eligible production, and convert exactly once at expiry if neither eligible unit is reachable. Add compact current-player status to the existing world-pressure presentation; render via `textContent`.

- [ ] **Step 3: Run focused tests; commit.**

```bash
./scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/systems/city-system.test.ts tests/systems/world-pressure-presentation.test.ts tests/ui/city-panel-crisis.test.ts
git add src/systems/stampede-system.ts src/systems/city-system.ts src/systems/world-pressure-presentation.ts src/ui/city-panel.ts src/core/turn-manager.ts tests/systems/stampede-system.test.ts tests/systems/city-system.test.ts tests/systems/world-pressure-presentation.test.ts tests/ui/city-panel-crisis.test.ts
git commit -m "feat(703): reward Stampede containment"
```

### Task 5: Cross-mode regression and delivery verification

**Files:** Update focused tests and this plan’s task annotations only when verification finds a defect.

- [ ] **Step 1: Add deterministic matrix fixtures.**

Exercise Explorer/Standard/Veteran recurrence; defender screens; builder containment; combat defeat; AI Standard target; warning/active/resolved/charge save loads; reduced motion; and two-human handoff. Assert no hidden route/status/reward leak and no per-candidate full-map scan.

- [ ] **Step 2: Run source and targeted checks.**

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/core/turn-manager.ts src/systems/stampede-system.ts src/systems/stampede-route-system.ts src/systems/combat-reward-system.ts src/systems/pillage-system.ts src/systems/world-pressure-presentation.ts src/systems/city-system.ts src/ui/city-panel.ts src/storage/save-migrations.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/systems/stampede-route-system.test.ts tests/systems/combat-reward-system.test.ts tests/systems/pillage-system.test.ts tests/systems/city-system.test.ts tests/systems/world-pressure-presentation.test.ts tests/ui/city-panel-crisis.test.ts tests/storage/save-migrations.test.ts tests/core/turn-manager-crisis.test.ts
```

- [ ] **Step 3: Run delivery verification separately.**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn test:durable
./scripts/run-with-mise.sh yarn test:durable:status
```

Inspect the full `origin/main...HEAD` source diff after checks pass. Do not push or create a PR until every command passes for the current head and worktree.
