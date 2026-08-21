# Crisis-Force Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a save-safe, non-diplomatic `crisis-force` owner that future Stampede and Rogue Host systems can use without borrowing barbarian, pirate, rebel, or beast-lair semantics.

**Architecture:** Extend the canonical owner-kind boundary with `crisis`, then keep registry creation and normalization in a focused `crisis-force-system`. Existing combat, hostility, movement safety, AI, renderer, and selected-unit code consume the owner-kind and presentation helpers. A numbered save migration initializes and sanitizes the optional registry idempotently.

**Tech Stack:** TypeScript, Vitest, serializable `GameState`, Canvas unit presentation, DOM selected-unit panel.

---

## File Structure

- `src/core/owner-kind.ts` — classifies the stable `crisis-force` owner, centralizes hostility and reward/capture eligibility.
- `src/core/types.ts` — defines serializable `CrisisForce` state and adds optional `GameState.crisisForces`.
- `src/systems/crisis-force-system.ts` — exports the owner constant, creation/registration helpers, neutral presentation, and deterministic normalization.
- `src/storage/save-migrations.ts` — schema 15 migration that initializes and normalizes crisis-force state.
- `src/ai/ai-hostility.ts` — treats crisis forces as unconditional hostile threats, distinct from optional beast contests.
- `src/systems/combat-reward-system.ts` — makes non-capturability an owner-kind rule for both combat directions.
- `src/renderer/*` and `src/ui/selected-unit-info.ts` — use neutral owner presentation so a crisis unit never displays an invented civilization identity.
- Mirrored tests under `tests/core`, `tests/systems`, `tests/storage`, `tests/ai`, `tests/renderer`, and `tests/ui` prove the complete actor path.

### Task 1: Canonical crisis owner semantics

**Files:**
- Modify: `src/core/owner-kind.ts`
- Test: `tests/core/owner-kind.test.ts`
- Test: `tests/systems/movement-safety.test.ts`

- [ ] **Step 1: Write failing owner-kind and movement tests**

```ts
expect(classifyOwner('crisis-force')).toBe('crisis');
expect(isCrisisForceOwner('crisis-force')).toBe(true);
expect(isAlwaysHostilePair('player', 'crisis-force')).toBe(true);
expect(isAlwaysHostilePair('crisis-force', 'mc-sparta')).toBe(true);
expect(isAlwaysHostilePair('crisis-force', 'crisis-force')).toBe(false);
expect(canReceiveCivilizationCombatRewards('crisis-force')).toBe(false);
expect(canCaptureDefeatedUnits('crisis-force')).toBe(false);
expect(isUnitHostileToCiv(stateWithVisibleCrisisUnit, 'player', 'crisis-force')).toBe(true);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/systems/movement-safety.test.ts`

Expected: FAIL because `crisis` and its predicates do not exist.

- [ ] **Step 3: Implement the canonical predicates**

```ts
export type OwnerKind = 'major' | 'minor' | 'barbarian' | 'rebel' | 'beast' | 'pirate' | 'crisis';
export const CRISIS_FORCE_OWNER = 'crisis-force';

export function isCrisisForceOwner(ownerId: string): boolean {
  return classifyOwner(ownerId) === 'crisis';
}

export function canCaptureDefeatedUnits(ownerId: string): boolean {
  return isMajorCivOwner(ownerId);
}
```

Classify only the exact constant as `crisis`, include it in `isAlwaysHostilePair`, and preserve existing pirate-vs-pirate behavior. Do not add it to civilizations, diplomacy, or beast predicates.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/systems/movement-safety.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the owner boundary**

```bash
git add src/core/owner-kind.ts tests/core/owner-kind.test.ts tests/systems/movement-safety.test.ts
git commit -m "feat(701): add crisis-force owner kind"
```

### Task 2: Serializable force registry and deterministic cleanup

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/crisis-force-system.ts`
- Test: `tests/systems/crisis-force-system.test.ts`

- [ ] **Step 1: Write failing registry tests**

```ts
const registered = registerCrisisForce(state, {
  id: 'stampede-1', targetCivId: 'player', severity: 'explorer', createdTurn: 12,
  unitIds: ['crisis-1'],
});
expect(registered.crisisForces?.['stampede-1']).toMatchObject({ unitIds: ['crisis-1'] });

const normalized = normalizeCrisisForces(malformedState);
expect(normalized.crisisForces).toEqual({ 'a-force': expect.any(Object) });
expect(normalized.units['orphan-crisis']).toBeUndefined();
expect(normalized.units['normal-unit']).toEqual(malformedState.units['normal-unit']);
expect(normalizeCrisisForces(normalized)).toEqual(normalized);
```

Cover missing/empty ID, unknown or eliminated target, invalid severity, missing/wrong-owner unit, duplicate unit IDs in one record, duplicate memberships resolved by lexical force ID, empty records, orphan crisis units, and AI targets that use Standard.

- [ ] **Step 2: Run the registry test and verify RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/crisis-force-system.test.ts`

Expected: FAIL because the registry type and functions do not exist.

- [ ] **Step 3: Add serializable types and the focused lifecycle module**

```ts
export interface CrisisForce {
  id: string;
  targetCivId: string;
  unitIds: string[];
  createdTurn: number;
  severity: OpponentChallenge;
}

function isValidSeverity(value: unknown): value is OpponentChallenge {
  return value === 'explorer' || value === 'standard' || value === 'veteran';
}

export function normalizeCrisisForces(state: GameState): GameState {
  const claimedUnitIds = new Set<string>();
  const crisisForces: Record<string, CrisisForce> = {};
  for (const [recordId, candidate] of Object.entries(state.crisisForces ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (!candidate || candidate.id !== recordId || !state.civilizations[candidate.targetCivId]
      || state.civilizations[candidate.targetCivId].isEliminated || !isValidSeverity(candidate.severity)
      || !Number.isInteger(candidate.createdTurn)) continue;
    const unitIds = [...new Set(candidate.unitIds)].filter(unitId =>
      !claimedUnitIds.has(unitId) && state.units[unitId]?.owner === CRISIS_FORCE_OWNER,
    ).sort();
    if (unitIds.length === 0) continue;
    unitIds.forEach(unitId => claimedUnitIds.add(unitId));
    crisisForces[recordId] = { ...candidate, unitIds };
  }
  const units = Object.fromEntries(Object.entries(state.units).filter(([unitId, unit]) =>
    unit.owner !== CRISIS_FORCE_OWNER || claimedUnitIds.has(unitId),
  ));
  return { ...state, crisisForces, units };
}

export function registerCrisisForce(state: GameState, force: CrisisForce): GameState {
  return normalizeCrisisForces({
    ...state,
    crisisForces: { ...(state.crisisForces ?? {}), [force.id]: { ...force, unitIds: [...force.unitIds] } },
  });
}
export function resolveCrisisForceSeverity(state: GameState, targetCivId: string): OpponentChallenge {
  return resolvePressureSeverityForCiv(state, targetCivId);
}
```

Use a plain optional `crisisForces?: Record<string, CrisisForce>` on `GameState`. Clone only changed maps; never mutate the input. A force may only retain actual `CRISIS_FORCE_OWNER` units, and unreferenced crisis-owned units are removed after sorted membership assignment. Do not add force unit IDs to a civilization roster.

- [ ] **Step 4: Run the registry test and verify GREEN**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/crisis-force-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the registry**

```bash
git add src/core/types.ts src/systems/crisis-force-system.ts tests/systems/crisis-force-system.test.ts
git commit -m "feat(701): persist crisis-force registry"
```

### Task 3: Shared combat, AI, and neutral presentation wiring

**Files:**
- Modify: `src/ai/ai-hostility.ts`
- Modify: `src/systems/combat-reward-system.ts`
- Modify: `src/renderer/unit-map-presentation.ts` and its faction/presentation helper
- Modify: `src/ui/selected-unit-info.ts`
- Create: `tests/ai/ai-hostility.test.ts`
- Test: `tests/systems/combat-reward-system.test.ts`
- Test: `tests/renderer/unit-map-presentation.test.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

- [ ] **Step 1: Write failing actor-path tests**

```ts
expect(isAIHostileOwner(stateWithBeastContestsDisabled, 'ai-1', CRISIS_FORCE_OWNER)).toBe(true);
expect(applyCombatOutcomeToState(crisisDefeatsCivilian).attackerCaptured).toBe(false);
expect(applyCombatOutcomeToState(playerDefeatsCrisisNavalUnit).defenderCaptured).toBe(false);
expect(renderedCrisisFaction.label).toBe('Crisis Force');
expect(panel.textContent).toContain('Crisis Force');
expect(panel.textContent).not.toContain('Legendary Beast');
```

The selected-unit test must assert the actual rendered label and border color. The renderer test must exercise the live faction path, not an unused helper. No test should expect a toast or SFX merely from registration.

- [ ] **Step 2: Run the actor-path tests and verify RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-hostility.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts tests/ui/selected-unit-info.test.ts`

Expected: FAIL because crisis units currently use missing-civilization fallback presentation and no AI branch exists.

- [ ] **Step 3: Wire all shared consumers through canonical predicates**

```ts
if (classifyOwner(ownerId) === 'crisis') return true;

const canCapture = canCaptureDefeatedUnits(victor.owner)
  && isMajorCivOwner(defeated.owner);

export const CRISIS_FORCE_PRESENTATION = {
  label: 'Crisis Force', color: '#b84a3a',
} as const;
```

Use the owner-kind/capture predicates in both combat capture branches. Add presentation resolution at the existing faction boundary and render the same label/color in selected-unit information. Keep unit statistics, audio dispatch, and notifications unchanged: there is no crisis event in this slice.

- [ ] **Step 4: Run the actor-path tests and verify GREEN**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-hostility.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts tests/ui/selected-unit-info.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit shared wiring**

```bash
git add src/ai/ai-hostility.ts src/systems/combat-reward-system.ts src/renderer src/ui/selected-unit-info.ts tests/ai/ai-hostility.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(701): wire crisis forces across combat and presentation"
```

### Task 4: Save migration and regression audit

**Files:**
- Modify: `src/storage/save-migrations.ts`
- Test: `tests/storage/save-migrations.test.ts`
- Test: `tests/app/controllers/turn-flow-controller.test.ts`

- [ ] **Step 1: Write failing migration and hot-seat tests**

```ts
expect(migrateSaveToCurrent(legacySave).saveSchemaVersion).toBe(15);
expect(migrateSaveToCurrent(legacySave).crisisForces).toEqual({});
expect(migrateSaveToCurrent(malformedSave).units['orphan-crisis']).toBeUndefined();
expect(migrateSaveToCurrent(migrateSaveToCurrent(malformedSave))).toEqual(migrateSaveToCurrent(malformedSave));
expect(forceBeforeHandoff.severity).toBe('explorer');
expect(forceAfterOtherHumanChangesDifficulty.severity).toBe('explorer');
```

The hot-seat regression must create two human civilizations with different personal challenges, register a force for one, hand off, change only the other player's pending/active challenge through the real controller path, and prove the first record and its neutral presentation do not change.

- [ ] **Step 2: Run the migration tests and verify RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/app/controllers/turn-flow-controller.test.ts`

Expected: FAIL because schema 15 and crisis-force migration are absent.

- [ ] **Step 3: Add schema 15 and call canonical normalization**

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 15;

function migrateCrisisForces(state: GameState): GameState {
  return normalizeCrisisForces({ ...state, crisisForces: state.crisisForces ?? {} });
}
```

Register migration 15 in the existing migration table. Do not duplicate validation in `save-migrations.ts`; the system normalizer is the sole cleanup path. Ensure a new game remains valid with absent optional state until its first load, and no notification/SFX is emitted by migration.

- [ ] **Step 4: Run the migration tests and verify GREEN**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/app/controllers/turn-flow-controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Run source checks and all targeted coverage**

Run: `scripts/check-src-rule-violations.sh src/core/owner-kind.ts src/core/types.ts src/systems/crisis-force-system.ts src/storage/save-migrations.ts src/ai/ai-hostility.ts src/systems/combat-reward-system.ts src/renderer/unit-map-presentation.ts src/ui/selected-unit-info.ts`

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/owner-kind.test.ts tests/systems/movement-safety.test.ts tests/systems/crisis-force-system.test.ts tests/ai/ai-hostility.test.ts tests/systems/combat-reward-system.test.ts tests/renderer/unit-map-presentation.test.ts tests/ui/selected-unit-info.test.ts tests/storage/save-migrations.test.ts tests/app/controllers/turn-flow-controller.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit migration and verification-ready state**

```bash
git add src/storage/save-migrations.ts tests/storage/save-migrations.test.ts tests/app/controllers/turn-flow-controller.test.ts
git commit -m "feat(701): migrate crisis-force ownership"
```

## Player Truth Table

| Before | Event/action | Immediate visible result |
|---|---|---|
| A visible crisis-owned unit is selected | Open selected-unit panel | The unit is labeled `Crisis Force` with its dedicated color; it is never labeled as a civilization or Legendary Beast. |
| A human and AI can see a crisis unit | Choose/score an attack | Standard hostile targeting is available; AI considers it hostile even when beast contests are disabled. |
| A force record exists in hot seat | Another player changes personal difficulty | No visible change to the existing force; its saved severity and neutral presentation remain unchanged. |
| A malformed save has crisis units | Load save | Invalid/orphan crisis actors disappear without a toast, SFX, fake civilization, or change to unrelated units. |

## Misleading UI Risks

- A yellow missing-civilization fallback is not a faction identity. Crisis units must use the explicit label/color.
- `Legendary Beast` is not an acceptable crisis label: it implies lair rules and optional AI engagement that do not apply.
- A force registry alone is not an earned warning. This slice must not create alerts, route markers, sounds, or target-revealing text.
- The neutral label must never include `targetCivId`, so hot-seat players cannot infer another player's private pressure state.

## Interaction Replay Checklist

- Select a visible crisis unit, close the panel, and select it again: the same neutral label/color renders each time.
- Attack a crisis unit through a human action and through an AI action: both use ordinary hostility and never capture the unit.
- Register a force for Human A, hand off to Human B, change B's difficulty, reload the save, and confirm A's severity snapshot remains unchanged.
- Load malformed force state twice and confirm the second load makes no further changes, alerts, or sounds.

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover owner semantics, registry/data, combat/AI/presentation, save normalization, and solo/hot-seat regression requirements.
- Placeholder scan: no unassigned behavior or deferred implementation step appears in the task instructions.
- Type consistency: `CrisisForce`, `crisisForces`, `CRISIS_FORCE_OWNER`, `normalizeCrisisForces`, `registerCrisisForce`, and `resolveCrisisForceSeverity` are introduced before later tasks consume them.
