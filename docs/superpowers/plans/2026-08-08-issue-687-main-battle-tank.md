# Main Battle Tank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Main Battle Tank as Tank's gated successor with a visible, deterministic, non-stacking adjacent-line-infantry +10% combat bonus.

**Architecture:** Typed formation data on unit definitions feeds a pure map-aware helper. The shared combat context carries both sides' multipliers and owner-only facts for human combat, AI combat, preview, and notifications; formation state is always derived and is never saved.

**Tech Stack:** TypeScript, Vitest, Canvas sprite catalogue, DOM combat preview, serializable save pipeline.

---

### Task 1: Catalogue MBT and typed formation data

**Files:**
- Modify: `src/core/types.ts:357-430`
- Modify: `src/systems/unit-system.ts:345-385,776-810`
- Modify: `src/systems/city-system.ts:1153-1162,1605-1632`
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/systems/combat-role-definitions.ts`
- Test: `tests/systems/unit-chain-integrity.test.ts`
- Test: `tests/systems/tech-unlocks-consistency.test.ts`

- [ ] **Step 1: Write the failing roster assertions.**

```ts
expect(UNIT_DEFINITIONS.main_battle_tank).toMatchObject({
  strength: 72, movementPoints: 4, productionCost: 270,
  attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
});
expect(TRAINABLE_UNITS.find(unit => unit.type === 'tank')).toMatchObject({
  obsoletedByTech: 'precision-engineering', upgradesTo: 'main_battle_tank',
});
expect(TRAINABLE_UNITS.find(unit => unit.type === 'main_battle_tank')).toMatchObject({
  techRequired: 'precision-engineering', requiredTechs: ['armored-tactics'],
});
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts`

Expected: FAIL because `main_battle_tank` is absent.

- [ ] **Step 3: Implement the catalogue entries.**

```ts
export interface UnitCombinedArmsCapability {
  provides?: readonly string[];
  requiresAdjacent?: { providerTag: string; multiplier: number; label: string };
}
// UnitDefinition adds: combinedArms?: UnitCombinedArmsCapability

main_battle_tank: {
  type: 'main_battle_tank', name: 'Main Battle Tank',
  movementPoints: 4, visionRange: 2, strength: 72, productionCost: 270,
  domain: 'land', attackProfile: { kind: 'ranged', range: 1, targets: ['unit', 'city'] },
  combinedArms: { requiresAdjacent: {
    providerTag: 'line-infantry', multiplier: 1.10, label: 'Combined arms +10%',
  } },
},
```

Add `main_battle_tank` to `UnitType`, definitions, descriptions, trainable units,
production icons, Precision Engineering `unlocksUnits`, and role data
`['frontline', 'mobile', 'capture']`. Make Tank obsolete at Precision Engineering with
the explicit successor. Add `provides: ['line-infantry']` to Mechanized and Exosuit
Infantry.

- [ ] **Step 4: Run source rules and focused tests.**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions.ts src/systems/combat-role-definitions.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions.ts src/systems/combat-role-definitions.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts
git commit -m "feat(687): add Main Battle Tank catalogue"
```

### Task 2: Implement the canonical combined-arms rule

**Files:**
- Create: `src/systems/combined-arms-system.ts`
- Modify: `src/systems/combat-context.ts:1-150`
- Modify: `src/systems/combat-system.ts:119-310`
- Test: `tests/systems/combined-arms-system.test.ts`
- Test: `tests/systems/combat-system.test.ts`
- Test: `tests/storage/save-migrations.test.ts`

- [ ] **Step 1: Write the failing helper and combat-context tests.**

```ts
expect(resolveCombinedArms(state, mbt)).toMatchObject({
  multiplier: 1.10, provider: expect.objectContaining({ type: 'mechanized_infantry' }),
});
expect(resolveCombinedArms(stateWithTwoProviders, mbt).multiplier).toBe(1.10);
expect(resolveCombinedArms(stateWithHostileCargoOrDistantProvider, mbt).multiplier).toBe(1);
expect(buildCombatContextForDefender(state, mbt, enemy).attackerCombinedArmsMultiplier).toBe(1.10);
expect(buildCombatContextForDefender(state, enemy, mbt).defenderCombinedArmsMultiplier).toBe(1.10);
```

Cover Mechanized and Exosuit positives; hostile, cargo, nonqualifying, and distant
negatives; deterministic provider choice; horizontal-wrap adjacency; attack and defense;
and migration/import followed by recomputation with no cached formation state.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/combined-arms-system.test.ts tests/systems/combat-system.test.ts tests/storage/save-migrations.test.ts`

Expected: FAIL because the helper and context fields do not exist.

- [ ] **Step 3: Add one pure helper and use it for both combatants.**

```ts
export function resolveCombinedArms(state: GameState, unit: Unit) {
  const requirement = UNIT_DEFINITIONS[unit.type].combinedArms?.requiresAdjacent;
  if (!requirement) return { multiplier: 1, fact: undefined };
  const provider = Object.values(state.units)
    .filter(candidate => candidate.owner === unit.owner && !candidate.transportId)
    .filter(candidate => UNIT_DEFINITIONS[candidate.type].combinedArms?.provides?.includes(requirement.providerTag))
    .filter(candidate => distanceOnMap(state.map, candidate.position, unit.position) === 1)
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  return provider ? {
    multiplier: requirement.multiplier,
    fact: { key: 'combined-arms', label: `${requirement.label} — adjacent ${UNIT_DEFINITIONS[provider.type].name}`,
      sourceVisibility: 'owner' as const, operation: 'multiplier' as const,
      value: requirement.multiplier, outcome: 'applied' as const },
  } : { multiplier: 1, fact: undefined };
}
```

Use `wrappedHexDistance` for wrapped maps and `hexDistance` otherwise. Add attacker
and defender multiplier/fact fields in `CombatContext`, call the helper for both in
`buildCombatContextForDefender`, apply multipliers before ordinary unit-modifier
multipliers, and append facts to their result lists. Do not alter `GameState`, schemas,
or randomness.

- [ ] **Step 4: Run source rules and focused tests.**

Run: `scripts/check-src-rule-violations.sh src/systems/combined-arms-system.ts src/systems/combat-context.ts src/systems/combat-system.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/combined-arms-system.test.ts tests/systems/combat-system.test.ts tests/storage/save-migrations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/systems/combined-arms-system.ts src/systems/combat-context.ts src/systems/combat-system.ts tests/systems/combined-arms-system.test.ts tests/systems/combat-system.test.ts tests/storage/save-migrations.test.ts
git commit -m "feat(combat): add Main Battle Tank combined arms"
```

### Task 3: Render the reason for owners, redact it for rivals

**Files:**
- Modify: `src/ui/combat-preview.ts:8-54`
- Test: `tests/ui/combat-preview.test.ts`
- Test: `tests/ui/notification-routing.test.ts`
- Test: `tests/core/hotseat-events.test.ts`

**Player Truth Table**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Owner has MBT beside Mechanized Infantry | Open attack preview | `Combined arms +10% — adjacent Mechanized Infantry` appears. |
| Owner removes provider | Reopen same MBT preview | Line is absent and strength is recalculated. |
| Different hot-seat player or rival sees result | Open legal preview/log | Provider class, identity, and bonus are absent. |

**Misleading UI Risks:** A generic advantage is insufficient for the owner; first-fact-only
rendering can hide combined arms; a rival must not receive even a generic formation clue.

**Interaction Replay Checklist:** Open supported preview, close it, move support, reopen;
then switch hot-seat recipient and inspect notifications again.

- [ ] **Step 1: Write the failing text and privacy tests.**

```ts
expect(formatCombatPreviewDetails('Rival', 100, previewWithTwoFacts))
  .toContain('Combined arms +10% — adjacent Mechanized Infantry');
expect(formatCombatPreviewDetails('Rival', 100, previewWithTwoFacts))
  .toContain('Professional Army');
expect(buildCombatNotificationDetails(result, 'defender').facts)
  .toContainEqual(expect.objectContaining({ label: 'Unknown advantage', redacted: true }));
```

Add a hot-seat regression that switches `currentPlayer` and proves that
`Mechanized Infantry`, `Exosuit Infantry`, and `Combined arms` never leak.

- [ ] **Step 2: Run focused UI tests and verify failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/combat-preview.test.ts tests/ui/notification-routing.test.ts tests/core/hotseat-events.test.ts`

Expected: FAIL because the preview only prints its first applied fact or lacks coverage.

- [ ] **Step 3: Render all authorized applied facts.**

Replace the single `appliedFacts[0]` display with a deterministic loop over every active
fact. Preserve canonical labels and notification routing's owner/public projector; never
reconstruct a provider label for an unauthorized viewer.

- [ ] **Step 4: Run focused UI and hot-seat tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/combat-preview.test.ts tests/ui/notification-routing.test.ts tests/core/hotseat-events.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui/combat-preview.ts tests/ui/combat-preview.test.ts tests/ui/notification-routing.test.ts tests/core/hotseat-events.test.ts
git commit -m "fix(ui): explain Main Battle Tank combined arms safely"
```

### Task 4: Complete AI, counter, visual, and sound wiring

**Files:**
- Modify: `src/ai/ai-tactics.ts` only if it bypasses `buildCombatContextForDefender`
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/renderer/unit-visual-resolver.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Test: `tests/ai/ai-tactics.test.ts`
- Test: `tests/renderer/sprites/unit-identity.test.ts`
- Test: `tests/systems/unit-modifier-system.test.ts`

- [ ] **Step 1: Write failing AI, catalogue, and counter tests.**

```ts
expect(getAIStrategicRoles('main_battle_tank')).toEqual(expect.arrayContaining(['frontline', 'mobile']));
expect(bestAttackWithAdjacentLineInfantry.score).toBeGreaterThan(bestAttackWithoutIt.score);
expect(UNIT_SPRITE_CATALOG.main_battle_tank).toBeDefined();
expect(getUnitVisual('main_battle_tank').icon).toBe('🛡️');
expect(antiTankResult.attackerStrength).toBeGreaterThan(baseResult.attackerStrength);
```

Also prove Attack Helicopter retains its MBT counter. The AI score must come from shared
combat context, not an MBT-specific tactic branch.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts tests/renderer/sprites/unit-identity.test.ts tests/systems/unit-modifier-system.test.ts`

Expected: FAIL because MBT is not fully wired.

- [ ] **Step 3: Add shared-context AI use and catalogued fallbacks.**

Use `TankSprite`, `🛡️`, Tank's combat SFX fallback, and Tank's locomotion family.
If AI tactics already builds the shared context, add no AI-only formation branch. Extend
the typed armor classification so existing Anti-Tank Gun and Attack Helicopter rules
recognize MBT without duplicating counter definitions.

- [ ] **Step 4: Run source rules and focused tests.**

Run: `scripts/check-src-rule-violations.sh src/ai/ai-tactics.ts src/renderer/sprites/sprite-catalog.ts src/renderer/unit-visual-resolver.ts src/audio/sfx-catalog.ts && bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts tests/renderer/sprites/unit-identity.test.ts tests/systems/unit-modifier-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ai/ai-tactics.ts src/renderer/sprites/sprite-catalog.ts src/renderer/unit-visual-resolver.ts src/audio/sfx-catalog.ts tests/ai/ai-tactics.test.ts tests/renderer/sprites/unit-identity.test.ts tests/systems/unit-modifier-system.test.ts
git commit -m "feat(687): wire Main Battle Tank play surfaces"
```

### Task 5: Review and release-verify

**Files:** Review all changed files.

- [ ] **Step 1: Inspect committed and uncommitted deltas.**

Run: `git diff --stat origin/main...HEAD`, `git diff --stat`, then full
`git diff origin/main...HEAD` for all source changes.

Expected: only #687 roster, formation, AI, UI, fallback, test, and docs changes.

- [ ] **Step 2: Run the selected regression suite and rule check.**

Run: `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions.ts src/systems/combat-role-definitions.ts src/systems/combined-arms-system.ts src/systems/combat-context.ts src/systems/combat-system.ts src/systems/unit-modifier-system.ts src/ai/ai-tactics.ts src/ui/combat-preview.ts src/renderer/sprites/sprite-catalog.ts src/renderer/unit-visual-resolver.ts src/audio/sfx-catalog.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/combined-arms-system.test.ts tests/systems/combat-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-modifier-system.test.ts tests/ai/ai-tactics.test.ts tests/renderer/sprites/unit-identity.test.ts tests/ui/combat-preview.test.ts tests/ui/notification-routing.test.ts tests/core/hotseat-events.test.ts tests/storage/save-migrations.test.ts`

Expected: PASS.

- [ ] **Step 3: Run release checks separately.**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn test:durable`

Expected: durable full suite succeeds.

Run: `bash scripts/run-with-mise.sh yarn test:durable:status`

Expected: passed evidence matches current `HEAD` and working tree.

## Plan self-review

- Coverage: Tasks 1–4 cover roster, gates, upgrades, typed formation, attack/defense,
  AI, counters, visual/audio fallback, save safety, preview, solo play, and hot seat.
- UI: Task 3 supplies its required truth table, misleading-UI analysis, replay path, and
  visible DOM assertions.
- Type consistency: Task 1 defines `UnitCombinedArmsCapability`; Task 2 defines
  `resolveCombinedArms` and context facts before later consumers use them.
