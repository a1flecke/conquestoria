# Issue #665 Upgrade Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to
> implement this plan task-by-task. This repository prohibits subagents.

**Goal:** Make every unit upgrade a transparent, percentage-health-preserving,
experience-preserving, save-safe action whose rules are shared by the player UI and AI.

**Architecture:** Put all upgrade eligibility and preserved-state facts in a typed
`UpgradeEvaluation` owned by `unit-upgrade-system`. Both state application and the
selected-unit panel consume that evaluation; cross-domain application composes the
existing air-basing helpers. The UI owns only ephemeral confirmation display state and
re-evaluates on confirmation, so stale UI cannot commit an invalid upgrade.

**Tech Stack:** TypeScript, Vitest, mock-DOM UI tests, existing save migration and air
operations helpers.

---

## Audited file map

- `src/systems/unit-upgrade-system.ts` — currently has split target eligibility,
  a single `missing-building` reason, and `applyUpgrade` healing to 100.
- `src/systems/air-operations-system.ts` — owns `canCompleteAirUnitProduction` and
  `baseNewAirUnit`, the legal city-base capacity/assignment contract.
- `src/ai/ai-upgrades.ts` — currently prefilters with
  `getCanonicalUpgradeTarget`, then calls `applyUnitUpgradeToState`.
- `src/ui/selected-unit-info.ts` — directly renders an enabled upgrade button or one
  missing-building sentence; it has no confirmation state.
- `src/main.ts` — has two upgrade callback entry points that re-check eligibility,
  call `executeUpgrade`, and show success notifications.
- `tests/systems/unit-upgrade.test.ts`, `tests/ai/ai-upgrades.test.ts`,
  `tests/ui/selected-unit-info.test.ts`, `tests/storage/save-migrations.test.ts` —
  mirrored regression homes.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Legal upgrade | Tap `Upgrade` | Inline confirmation shows source, target, cost, preserved HP/XP, and destination. |
| Confirmation open | Tap `Cancel` | Normal action surface returns; no unit, gold, or action mutation. |
| Confirmation open | Tap `Confirm upgrade` | Selected panel rerenders target type with spent movement/action and updated gold. |
| Any blockers | Inspect selected unit | Ordered text-and-icon blocker list remains visible and confirmation is unavailable. |
| Confirmation goes stale | Tap `Confirm upgrade` | It stays open and rerenders all current blockers without mutation. |
| Player handoff | Switch `currentPlayer` | Prior owner’s confirmation/details are absent; only current owner can act. |

## Misleading UI Risks

- A completed technology alone must never label an upgrade available when another
  requirement is missing.
- The health preview must show preserved percentage, not a free full heal.
- Fixing one requirement must not hide another blocker.
- A stale confirmation cannot imply an action will still succeed after gold, capacity,
  city ownership, or action availability changes.

## Interaction Replay Checklist

- Open a legal upgrade, cancel, reopen, and confirm; assert DOM after each transition.
- Open confirmation, make its state stale, confirm, and assert an unchanged state plus
  current blocker text.
- Render multiple blockers and prove all remain visible.
- Hand off to a second human and prove the first player’s confirmation and feedback do
  not appear.

## Task 1: Create the canonical evaluation contract

**Files:**
- Modify: `src/systems/unit-upgrade-system.ts`
- Modify: `src/core/types.ts` only if a shared input/result type belongs there
- Test: `tests/systems/unit-upgrade.test.ts`

- [ ] **Step 1: Write failing evaluation regressions**

Add tests that request the explicit `spy_scout → spy_informant` target and assert a
complete result shape rather than the current boolean-only result:

```ts
const evaluation = evaluateUnitUpgrade(state, 'upgrade-unit', 'spy_informant');
expect(evaluation).toMatchObject({
  targetType: 'spy_informant', cost: 25, canUpgrade: true,
  preserved: { health: 41, experience: 3, movementPointsLeft: 0, hasActed: true },
  missing: [],
});
```

Add a negative test that removes tech, building, resource, gold, city position, and
action availability at once and expects stable ordered missing keys for every unmet
condition, with no state mutation.

- [ ] **Step 2: Run the focused regression and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade.test.ts
```

Expected: FAIL because `evaluateUnitUpgrade` and its complete `missing` contract do not
exist.

- [ ] **Step 3: Add typed evaluation data and a single evaluator**

Define serializable facts with stable keys, not display-only strings:

```ts
export type UpgradeMissingRequirement =
  | { kind: 'friendly-city' }
  | { kind: 'technology'; techId: string }
  | { kind: 'building'; buildingId: string }
  | { kind: 'resource'; resource: ResourceType }
  | { kind: 'gold'; required: number; available: number }
  | { kind: 'action-already-spent' }
  | { kind: 'air-base'; reason: AirBaseCheck['reason'] };

export interface UpgradeEvaluation {
  canUpgrade: boolean;
  sourceType: UnitType;
  targetType: UnitType | null;
  cost: number;
  preserved: Pick<Unit, 'health' | 'experience'> & {
    movementPointsLeft: 0;
    hasActed: true;
  };
  missing: UpgradeMissingRequirement[];
}
```

Implement `evaluateUnitUpgrade(state, unitId, requestedTarget, definitions =
TRAINABLE_UNITS)` so it validates explicit `upgradesTo`, each target prerequisite, and
all local conditions without early return. Retain `canUpgradeUnit` and
`getCanonicalUpgradeTarget` as thin compatibility wrappers over the evaluator until all
callers migrate; do not maintain duplicate eligibility logic.

- [ ] **Step 4: Run the focused regression and verify GREEN**

Run the Step 2 command. Expected: PASS, including existing explicit-chain and resource
tests.

- [ ] **Step 5: Commit the TDD slice**

```bash
git add src/systems/unit-upgrade-system.ts src/core/types.ts tests/systems/unit-upgrade.test.ts
git commit -m "feat(combat): evaluate upgrade requirements"
```

## Task 2: Apply upgrades without a free heal and safely base domain changes

**Files:**
- Modify: `src/systems/unit-upgrade-system.ts`
- Test: `tests/systems/unit-upgrade.test.ts`
- Test: `tests/storage/save-migrations.test.ts`

- [ ] **Step 1: Write failing state-application regressions**

Replace the current full-heal assertion with:

```ts
expect(result.state.units['upgrade-unit']).toMatchObject({
  type: 'spy_informant', health: 41, experience: 3,
  movementPointsLeft: 0, hasActed: true,
});
```

Build the fixture from a copied source definition whose explicit successor is the already
catalog-backed `attack_helicopter`; do not mutate `TRAINABLE_UNITS` or invent a test-only
unit type. Give the city a `helicopter_base` and the unit the completed
`helicopter-warfare` technology. Test that a legal conversion receives
`airBase: { kind: 'city', cityId }`; a full base returns an `air-base/base-full` missing
fact and leaves unit, gold, and base roster unchanged.

- [ ] **Step 2: Run the focused regression and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade.test.ts
```

Expected: FAIL because `applyUpgrade` sets `health: 100` and cross-domain application
does not assign an air base.

- [ ] **Step 3: Implement evaluation-gated application**

Make `applyUnitUpgradeToState` obtain one evaluation, reject a target mismatch or any
missing fact without cloning/mutating state, deduct only `evaluation.cost`, and call
`applyUpgrade` with the evaluated target. Preserve health and experience exactly; set
movement to zero and `hasActed` true.

For a target whose unit definition has `airOperation`, first apply the upgraded type,
then call `baseNewAirUnit(nextState, cityId, upgradedUnit)`. If basing fails, return the
original state and the evaluation-derived reason; never leave a converted unbased unit.
Use `canCompleteAirUnitProduction` during evaluation so capacity and compatibility use
the exact same rule as normal aircraft production.

- [ ] **Step 4: Add retained-save regressions**

In `tests/storage/save-migrations.test.ts`, create both an unversioned save and a current
schema save using `createNewGame`; upgrade a damaged, experienced unit; then call
`migrateSaveToCurrent` twice. Assert equality after the second normalization and verify
unit type, health, experience, movement/action, gold, and legal `airBase` assignment.
Do not change `CURRENT_SAVE_SCHEMA_VERSION` unless a new persisted field is introduced.

- [ ] **Step 5: Run system and storage tests and verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade.test.ts tests/storage/save-migrations.test.ts
```

Expected: PASS with no schema-version bump.

- [ ] **Step 6: Commit the TDD slice**

```bash
git add src/systems/unit-upgrade-system.ts tests/systems/unit-upgrade.test.ts tests/storage/save-migrations.test.ts
git commit -m "fix(combat): preserve upgrade state and air basing"
```

## Task 3: Route AI through evaluation and preserve difficulty fairness

**Files:**
- Modify: `src/ai/ai-upgrades.ts`
- Test: `tests/ai/ai-upgrades.test.ts`
- Test: `tests/systems/unit-upgrade.test.ts`

- [ ] **Step 1: Write failing parity tests**

Add parameterized Explorer/Standard/Veteran tests for the same human upgrade evaluation:

```ts
for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
  expect(evaluateUnitUpgrade(withChallenge(state, challenge), 'upgrade-unit', 'spy_informant'))
    .toMatchObject({ canUpgrade: true, missing: [] });
}
```

Add AI fixtures for a damaged experienced optimizer unit, a defender assigned to urgent
defense, and a noncombat/builder unit. Assert the AI shares application results, does not
spend a defender's action, and varies only its existing typed `remainingCap` behavior by
challenge profile.

- [ ] **Step 2: Run the focused regressions and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-upgrades.test.ts tests/systems/unit-upgrade.test.ts
```

Expected: FAIL because AI prefilters/routes against target-only helpers rather than the
complete evaluation facts.

- [ ] **Step 3: Make AI consume canonical evaluation**

Replace AI target-only checks at eligibility, city selection, and immediate application
with `evaluateUnitUpgrade`. Keep AI behavior catalog-driven: it may route only toward a
city whose evaluation is legal, skips units with any missing fact, and retains existing
treasury reserve, safety, urgent-defense, deterministic sorting, and challenge-cap rules.
Do not add knowledge of hidden bases, units, resources, or new per-unit IDs.

- [ ] **Step 4: Run focused AI/system tests and verify GREEN**

Run the Step 2 command. Expected: PASS for all three challenges and existing route tests.

- [ ] **Step 5: Commit the TDD slice**

```bash
git add src/ai/ai-upgrades.ts tests/ai/ai-upgrades.test.ts tests/systems/unit-upgrade.test.ts
git commit -m "fix(ai): share canonical upgrade evaluation"
```

## Task 4: Implement confirmation and live selected-unit presentation

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

- [ ] **Step 1: Write failing rendered-DOM tests**

Add tests that render a legal damaged/experienced unit and click the existing `Upgrade`
button. Assert that an inline confirmation contains source/target names, gold, preserved
health/experience, `Confirm upgrade`, and `Cancel`; then click cancel and assert normal
actions return without invoking the callback. Test confirm invokes the callback once and
that rerendering with its returned state shows target type/action spent.

Add a multi-blocker fixture and assert every text label is rendered with icon-plus-text.
Add a stale-confirm fixture whose callback returns the newly evaluated blockers, then
assert the confirmation remains and its DOM updates. Assert all upgrade buttons use the
existing `makeButton` styling with a minimum height of 44px.

- [ ] **Step 2: Run the UI regression and verify RED**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/ui/selected-unit-info.test.ts
```

Expected: FAIL because the current UI immediately invokes `onUpgradeUnit` and only
renders one missing-building explanation.

- [ ] **Step 3: Implement the panel-local confirmation model**

Add a focused presentation helper that maps every `UpgradeMissingRequirement` to
plain-language icon-plus-text rows and derives preview health/experience. Keep ephemeral
confirmation state scoped to the selected panel render path. The initial action opens
confirmation; cancel closes it; confirm calls a callback that returns the re-evaluated
result so the UI can render late blockers without guessing.

Update both `src/main.ts` callback sites to call only the canonical application helper,
refresh renderer/HUD/selected unit after success, call the existing owner-scoped
`appendToCivLog(unit.owner, ...)` for success or late failure, and return the failure
evaluation to the panel. Do not use `showNotification` for a game consequence, because
it attributes the entry to `currentPlayer` at emission time. Remove callback-local
`canUpgradeUnit`, target, and duplicate gold checks.

- [ ] **Step 4: Add hot-seat and muted-feedback DOM coverage**

Render player one’s confirmation, change `currentPlayer`, and rerender player two’s
selected unit. Assert player one’s confirmation/source/target and feedback are absent,
and player two cannot invoke player one’s callback. Use `soundEnabled: false` and verify
the same text feedback is present; this delivery adds no audio event or mixer call.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/ui/selected-unit-info.test.ts
```

Expected: PASS, including current building-gate coverage adapted to the complete blocker
list.

- [ ] **Step 6: Commit the TDD slice**

```bash
git add src/ui/selected-unit-info.ts src/main.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(ui): confirm and explain unit upgrades"
```

## Task 5: Source rules, targeted regressions, and release verification

**Files:** No production changes; inspect all files changed above.

- [ ] **Step 1: Run source-rule validation**

```bash
scripts/check-src-rule-violations.sh \
  src/systems/unit-upgrade-system.ts src/ai/ai-upgrades.ts \
  src/ui/selected-unit-info.ts src/main.ts
```

Expected: exit 0.

- [ ] **Step 2: Run all mirrored and adjacent targeted tests**

```bash
bash scripts/run-with-mise.sh yarn test --run \
  tests/systems/unit-upgrade.test.ts tests/systems/air-operations-system.test.ts \
  tests/ai/ai-upgrades.test.ts tests/ui/selected-unit-info.test.ts \
  tests/storage/save-migrations.test.ts
```

Expected: PASS.

- [ ] **Step 3: Inspect branch and working-tree scope**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD
git diff
```

Expected: one focused upgrade-integrity delivery; no schema bump, new roster content, or
audio event.

- [ ] **Step 4: Run release checks**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

Expected: both exit 0. Tauri/web builds are not required because no platform or
distribution path changes.

- [ ] **Step 5: Commit verification-only follow-up if needed**

```bash
git status --short
```

Expected: clean. If a verification failure requires a code change, return to the
corresponding TDD task before committing the fix.

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover canonical rules, no-free-heal balance, cross-domain
  basing, and retained saves; Task 3 covers AI, difficulty, and play styles; Task 4
  covers ages 7–43 presentation, confirmation, hot seat, accessibility, and no-SFX
  feedback; Task 5 covers source rules and regressions.
- **No placeholder scan:** No task delegates an undefined behavior; each test, command,
  callback responsibility, and required outcome is explicit.
- **Type consistency:** `UpgradeEvaluation` and `UpgradeMissingRequirement` are created
  in Task 1 and consumed by Tasks 2–4; no caller retains a separate eligibility model.
