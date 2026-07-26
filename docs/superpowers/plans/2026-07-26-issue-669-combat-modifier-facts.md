# Combat Modifier Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface canonical, viewer-safe combat modifier explanations in preview and persisted recipient history without changing combat outcomes.

**Architecture:** The modifier evaluator produces structured facts beside existing numeric aggregates. Combat snapshots those facts before state changes. Viewer presentation projects safe facts per recipient, and notification history persists only that projection.

**Tech Stack:** TypeScript, Vitest, DOM UI, serializable game state, save migrations.

---

## File map

- `src/systems/unit-modifier-system.ts` — canonical numeric and fact evaluation.
- `src/systems/combat-system.ts`, `src/core/types.ts` — immutable calculation snapshot.
- `src/systems/viewer-event-presentation.ts`, `src/ui/combat-preview.ts` — viewer-safe preview.
- `src/core/notification-log.ts`, `src/ui/notification-routing.ts`, `src/ui/notification-log-panel.ts` — recipient history.
- `src/storage/save-migrations.ts`, `src/storage/save-manager.ts` — version and normalize history details.

## Player Truth Table

| Before | Action | Immediate visible result | Must remain private |
|---|---|---|---|
| Pikeman can attack cavalry | Tap target | “Your pikeman is strong against cavalry” and details affordance | Rival-only source identities |
| Preview is open | Expand calculation | Applied/ignored rows and exact values | Redacted sources stay generic |
| Visible AI combat resolves | Open Message Log | Recipient-specific saved detail expands in place | Another human’s detail |
| Hot-seat handoff | Open Message Log | Only active player entries render | Prior preview, log, toast, and audio |

## Misleading UI Risks

- Do not label a numeric total as a named source without an authorized fact.
- Do not render an ignored fact as an active bonus.
- Do not manufacture `capped` or `superseded` when no real rule produces it.
- Do not expose source identity through a detail label when projection redacted it.

## Interaction Replay Checklist

- Preview, expand, cancel, and reopen.
- Resolve that attack, then open the Message Log and compare stored projection.
- Change hot-seat current player before reopening history.
- Load valid, malformed, and legacy notification records and reopen history.

### Task 1: Emit canonical facts

**Files:**
- Modify: `src/systems/unit-modifier-system.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/core/types.ts`
- Test: `tests/systems/unit-modifier-system.test.ts`
- Test: `tests/systems/combat-system.test.ts`

- [ ] **Step 1: Write failing tests for applied and ignored facts**

```ts
expect(getCombatModifier('pikeman', 'attacker', baseCombatCtx({ opponentType: 'knight' })).facts)
  .toContainEqual(expect.objectContaining({
    key: 'counter:anti-cavalry', outcome: 'applied', operation: 'multiplier', value: 1.5,
  }));
expect(getCombatModifier('warrior', 'attacker', baseCombatCtx({
  completedTechs: ['steel-plate-armor'],
})).facts).toContainEqual(expect.objectContaining({
  key: 'tech:steel-plate-armor', outcome: 'ignored', ignoredReason: 'role',
}));
```

- [ ] **Step 2: Run RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts`

Expected: FAIL because no `facts` contract exists.

- [ ] **Step 3: Add the minimal typed fact contract and evaluator output**

```ts
export interface CombatModifierFact {
  key: string;
  side: 'attacker' | 'defender';
  operation: 'flat' | 'multiplier';
  value: number;
  outcome: 'applied' | 'ignored' | 'capped' | 'superseded';
  labelKey: string;
  source: { visibility: 'owner' | 'public'; kind: 'tech' | 'national-project' | 'unit' | 'counter' };
  ignoredReason?: 'role' | 'condition' | 'unit-class' | 'domain' | 'inactive-source';
}
```

Evaluate candidates in definition order. Applied facts alone change `mult` or `flat`. Keep outcomes `capped` and `superseded` un-emitted until a real canonical cap or strongest-source resolver exists. Snapshot attacker and defender facts in both `CombatStrengthBreakdown` and `CombatResult`.

- [ ] **Step 4: Run GREEN**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts`

Expected: PASS; existing strengths and damage remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-modifier-system.ts src/systems/combat-system.ts src/core/types.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts
git commit -m "feat(combat): emit modifier facts with strength evaluation"
```

### Task 2: Project and render preview detail

**Files:**
- Modify: `src/systems/viewer-event-presentation.ts`
- Modify: `src/ui/combat-preview.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/viewer-event-presentation.test.ts`
- Test: `tests/ui/combat-preview.test.ts`

- [ ] **Step 1: Write failing projection and DOM tests**

```ts
expect(projectCombatModifierFacts(rawFacts, 'defender', context))
  .toContainEqual(expect.objectContaining({ label: 'Unknown advantage', redacted: true }));
expect(previewPanel.textContent).toContain('Your pikeman is strong against cavalry');
detailsButton.click();
expect(previewPanel.textContent).toContain('Show less');
```

- [ ] **Step 2: Run RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/viewer-event-presentation.test.ts tests/ui/combat-preview.test.ts`

Expected: FAIL because no viewer projection or details interaction exists.

- [ ] **Step 3: Add a projection and expandable preview**

```ts
export interface CombatModifierPresentationFact {
  side: 'attacker' | 'defender';
  label: string;
  operation: 'flat' | 'multiplier';
  value: number;
  outcome: CombatModifierFact['outcome'];
  detail: string;
  redacted: boolean;
}
```

Project from the saved evaluation snapshot, never current state. The preview shows only one decisive applied fact by default; `Show calculation` expands all permitted rows. Use `textContent`, `createGameButton`, icon-plus-text labels, and a 44px control.

- [ ] **Step 4: Run GREEN and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/viewer-event-presentation.test.ts tests/ui/combat-preview.test.ts`

Expected: PASS; source redaction and repeat expansion are deterministic.

```bash
git add src/systems/viewer-event-presentation.ts src/ui/combat-preview.ts src/main.ts tests/systems/viewer-event-presentation.test.ts tests/ui/combat-preview.test.ts
git commit -m "feat(ui): present viewer-safe combat modifier details"
```

### Task 3: Persist recipient-specific history details

**Files:**
- Modify: `src/core/notification-log.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `src/ui/combat-resolved-presentation.ts`
- Modify: `src/ui/notification-log-panel.ts`
- Test: `tests/ui/notification-routing.test.ts`
- Test: `tests/ui/combat-resolved-presentation.test.ts`
- Test: `tests/ui/notification-log-panel.test.ts`

- [ ] **Step 1: Write failing history tests**

```ts
expect(calls[0]).toMatchObject({
  civId: 'defender',
  combatDetails: { facts: [expect.objectContaining({ redacted: true })] },
});
detailsButton.click();
expect(panel.textContent).toContain('Unknown advantage');
```

- [ ] **Step 2: Run RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/ui/combat-resolved-presentation.test.ts tests/ui/notification-log-panel.test.ts`

Expected: FAIL because notifications cannot carry `combatDetails`.

- [ ] **Step 3: Add recipient-only log data and interaction**

```ts
export interface CombatNotificationDetails {
  summary: string;
  facts: CombatModifierPresentationFact[];
}

export interface NotificationEntry {
  // existing fields
  combatDetails?: CombatNotificationDetails;
}
```

Extend `NotificationSink` and delivery so routing projects separately for each recipient before persisting. Keep toast text short. The message-log button expands/collapses in place, stops propagation, and does not alter map-focus behavior.

- [ ] **Step 4: Run GREEN and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/ui/combat-resolved-presentation.test.ts tests/ui/notification-log-panel.test.ts`

Expected: PASS; suppressed visuals still log details and each recipient receives only its projection.

```bash
git add src/core/notification-log.ts src/ui/notification-routing.ts src/ui/combat-resolved-presentation.ts src/ui/notification-log-panel.ts tests/ui/notification-routing.test.ts tests/ui/combat-resolved-presentation.test.ts tests/ui/notification-log-panel.test.ts
git commit -m "feat(history): retain recipient-safe combat modifier details"
```

### Task 4: Migrate saves and prove parity

**Files:**
- Modify: `src/storage/save-migrations.ts`
- Modify: `src/storage/save-manager.ts`
- Test: `tests/storage/save-migrations.test.ts`
- Test: `tests/storage/save-manager.test.ts`
- Test: `tests/ai/ai-major-turn.test.ts`
- Test: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing migration and parity tests**

```ts
expect(normalizeLoadedStateForTest(malformed).notificationLog.player[0])
  .not.toHaveProperty('combatDetails');
expect(migrateSaveToCurrent(previousSchema).saveSchemaVersion)
  .toBe(CURRENT_SAVE_SCHEMA_VERSION);
expect(aiCombatEvent.result.modifierFacts).toEqual(humanCombatResult.modifierFacts);
```

- [ ] **Step 2: Run RED**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/ai/ai-major-turn.test.ts tests/core/turn-manager.test.ts`

Expected: FAIL because migration and normalizer do not recognize detail.

- [ ] **Step 3: Add migration, total normalization, and required regressions**

Increment `CURRENT_SAVE_SCHEMA_VERSION` only after confirming the rebased value. Add the prior-schema migration and invoke a normalizer that accepts a valid summary/fact list, removes malformed `combatDetails` without dropping its notification, and remains idempotent. Add equal-state Explorer/Standard/Veteran facts, one AI/turn-manager emitter parity test, solo delivery, and two-human handoff tests. Assert a non-recipient never receives preview detail, notification detail, toast, or modifier-related SFX.

- [ ] **Step 4: Run GREEN and commit**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/ai/ai-major-turn.test.ts tests/core/turn-manager.test.ts`

Expected: PASS; migration is idempotent and difficulty/actor/viewer parity holds.

```bash
git add src/storage/save-migrations.ts src/storage/save-manager.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/ai/ai-major-turn.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(storage): preserve combat modifier history details"
```

### Task 5: Verify the complete slice

- [ ] **Step 1: Run source and targeted checks**

```bash
scripts/check-src-rule-violations.sh src/systems/unit-modifier-system.ts src/systems/combat-system.ts src/systems/viewer-event-presentation.ts src/ui/combat-preview.ts src/ui/notification-routing.ts src/ui/combat-resolved-presentation.ts src/ui/notification-log-panel.ts src/storage/save-manager.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ui/combat-preview.test.ts tests/ui/notification-routing.test.ts tests/ui/combat-resolved-presentation.test.ts tests/ui/notification-log-panel.test.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/ai/ai-major-turn.test.ts tests/core/turn-manager.test.ts
```

- [ ] **Step 2: Review and release-verify**

```bash
git diff --check
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
git diff --stat
git diff
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
```

## Plan self-review

The plan preserves balance by making facts observational, keeps casual and expert UX distinct, covers AI/difficulty/solo/hot-seat privacy, persists only recipient-safe history, adds no SFX, and rejects fabricated cap/supersession rows. Names and paths are consistent across all tasks.
