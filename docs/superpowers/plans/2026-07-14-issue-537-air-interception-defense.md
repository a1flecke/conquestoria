# Issue #537 Air Interception Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Repository policy forbids subagents, so do not use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give conventional bombers weak defensive turret fire and stealth bombers evasion-only defense during fighter interception, while keeping ground retaliation, AI behavior, hot-seat privacy, saves, and audio coherent.

**Architecture:** Static unit-definition metadata declares the interception doctrine. A pure combat-system helper derives exchange multipliers and labels from attacker/defender definitions; both the resolver and preview consume it. A transient `CombatResult.exchange` summary carries that already-computed doctrine through every existing event/presentation/audio caller without putting new data in saves.

**Tech Stack:** TypeScript, Vitest, DOM UI, EventBus, Canvas presentation, existing SFX catalog.

---

## File map

- `src/core/types.ts` — typed air-interception metadata plus the transient combat-result exchange summary shared across systems.
- `src/systems/unit-system.ts` — `bomber` and `stealth_bomber` doctrine declarations.
- `src/systems/combat-system.ts` — shared poor-defense predicate, exchange-policy helper, deterministic damage application.
- `src/ui/combat-preview.ts` — kid-legible preview labels from the shared exchange result.
- `src/ui/notification-routing.ts` — defender notification-log wording from the transient exchange label.
- `src/audio/sfx-director.ts` — one delayed defensive-fire sound only for a nonzero turret-fire response.
- `src/ai/ai-tactics.ts` — rank attacks using seeded projected damage, including air-defense effects.
- `tests/systems/combat-system.test.ts` — catalog, resolver, parity, and balance coverage.
- `tests/ui/combat-preview.test.ts` — preview label and negative cases.
- `tests/ui/combat-resolved-presentation.test.ts` — notification visibility and exchange-label delivery.
- `tests/audio/sfx-director.test.ts` — one defensive-shot sound for turret fire and none for evasion.
- `tests/ai/ai-tactics.test.ts` — policy-aware AI target choice.
- `tests/storage/save-migrations.test.ts` — legacy bomber compatibility with no schema bump.
- `tests/main.integration.test.ts` — real selected-unit preview and hot-seat fog boundary.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Fighter targets visible conventional bomber | Tap the bomber | Preview says `Bomber gunners fire back weakly: 25% return fire`; resolving the attack plays one secondary defensive shot if it deals damage. |
| Fighter targets visible stealth bomber | Tap the bomber | Preview says `Stealth makes it harder to hit: −35% interceptor damage`; resolving the attack plays no defensive-shot sound. |
| Bomber targets fighter | Tap the fighter | No special air-defense label; the fighter’s ordinary retaliation remains visible through normal combat outcome. |
| A hot-seat player cannot see an enemy bomber | Tap its fogged hex | No legal target, preview, policy label, notification, or sound leaks to that viewer. |

## Misleading UI Risks

- `25% return fire` must describe only a fighter intercepting an air-bombard unit with `turret-fire`; it must not appear for ground siege, bomber-initiated attacks, or ordinary ranged duels.
- `−35% interceptor damage` must mean damage dealt to the stealth bomber, not a hidden fighter-strength penalty; the label must be emitted from the same exchange object that applies the multiplier.
- The defender notification is recipient-scoped through `routeCombatResolved`; do not use `currentPlayer` when appending it.

## Interaction Replay Checklist

- Open a conventional-bomber preview, confirm its label, resolve it, and assert the notification and exactly one defensive sound.
- Reopen the selected-unit preview on a stealth bomber and assert the label changes with no stale turret-fire wording.
- Switch `currentPlayer` to a viewer without visibility and assert target selection remains blocked.
- Reopen combat after a prior resolved event and assert no duplicated notification or delayed SFX is produced.

### Task 1: Add typed doctrine metadata and catalog validation

**Files:**
- Modify: `src/core/types.ts:360-385`
- Modify: `src/systems/unit-system.ts` (the `bomber` and `stealth_bomber` definitions)
- Modify: `src/systems/combat-system.ts:120-220`
- Test: `tests/systems/combat-system.test.ts`

- [ ] **Step 1: Write failing catalog and profile tests**

Add imports for `UNIT_DEFINITIONS` and the new `getCombatExchangeModifiers` / `defendsPoorly` exports. Add tests that enumerate definitions rather than hardcoding a roster:

```ts
const bombardProfiles = Object.values(UNIT_DEFINITIONS)
  .filter(definition => definition.attackProfile?.kind === 'bombard' || definition.attackProfile?.kind === 'siege');

it('applies poor defense to every siege or bombard profile, but not agile ranged ballista', () => {
  expect(bombardProfiles.length).toBeGreaterThan(0);
  for (const definition of bombardProfiles) {
    expect(defendsPoorly(definition.attackProfile), definition.type).toBe(true);
  }
  expect(defendsPoorly(UNIT_DEFINITIONS.ballista.attackProfile)).toBe(false);
});

it('requires every air bombard definition to declare one bounded interception doctrine', () => {
  for (const definition of Object.values(UNIT_DEFINITIONS)
    .filter(def => def.domain === 'air' && def.attackProfile?.kind === 'bombard')) {
    const doctrine = definition.airInterceptionDefense;
    expect(doctrine, definition.type).toBeDefined();
    const multiplier = doctrine?.kind === 'turret-fire'
      ? doctrine.counterDamageMultiplier
      : doctrine?.incomingDamageMultiplier;
    expect(multiplier).toBeGreaterThan(0);
    expect(multiplier).toBeLessThanOrEqual(1);
  }
});

it('does not allow non-air-bombard definitions to carry interception doctrine', () => {
  for (const definition of Object.values(UNIT_DEFINITIONS)) {
    if (definition.domain === 'air' && definition.attackProfile?.kind === 'bombard') continue;
    expect(definition.airInterceptionDefense, definition.type).toBeUndefined();
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: FAIL because the helper and metadata do not exist.

- [ ] **Step 3: Add the discriminated metadata and shared profile predicate**

In `src/core/types.ts`, add:

```ts
export type AirInterceptionDefense =
  | { kind: 'turret-fire'; counterDamageMultiplier: number }
  | { kind: 'evasion'; incomingDamageMultiplier: number };

export interface UnitDefinition {
  // existing fields
  airInterceptionDefense?: AirInterceptionDefense;
}
```

In `src/systems/unit-system.ts`, add exactly these static declarations:

```ts
// bomber
airInterceptionDefense: { kind: 'turret-fire', counterDamageMultiplier: 0.25 },

// stealth_bomber
airInterceptionDefense: { kind: 'evasion', incomingDamageMultiplier: 0.65 },
```

In `src/systems/combat-system.ts`, add the reusable predicate:

```ts
export function defendsPoorly(profile: UnitAttackProfile | undefined): boolean {
  return profile?.kind === 'siege' || profile?.kind === 'bombard';
}
```

Replace the existing `profile?.kind === 'bombard'` checks in both strength calculation and `defenderDefendsPoorly` with `defendsPoorly(defenderDefinition.attackProfile)`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: PASS; every current/future semantic siege or bombard profile is covered and both air bombarders declare valid metadata.

- [ ] **Step 5: Commit the catalog foundation**

```sh
git add src/core/types.ts src/systems/unit-system.ts src/systems/combat-system.ts tests/systems/combat-system.test.ts
git commit -m "feat(combat): declare air interception defenses"
```

### Task 2: Apply one pure exchange policy in combat resolution and the preview model

**Files:**
- Modify: `src/core/types.ts:1120-1135`
- Modify: `src/systems/combat-system.ts:120-320`
- Test: `tests/systems/combat-system.test.ts`

- [ ] **Step 1: Write failing exchange-policy and deterministic-result tests**

Add fixtures for a `jet_fighter` attacking `bomber` and `stealth_bomber`, then test the policy directly and through `resolveCombat`:

```ts
it('gives a fighter a weak but nonzero bomber-gunner counterattack', () => {
  const exchange = getCombatExchangeModifiers(jetFighter, bomber);
  const result = resolveCombat(jetFighter, bomber, map, 77);
  expect(exchange).toMatchObject({ kind: 'turret-fire', defenderCounterDamageMultiplier: 0.25 });
  expect(result.attackerDamage).toBeGreaterThan(0);
  expect(result.exchange?.label).toBe('Bomber gunners fire back weakly: 25% return fire');
});

it('gives a stealth bomber evasion but no defensive shot', () => {
  const exchange = getCombatExchangeModifiers(jetFighter, stealthBomber);
  const result = resolveCombat(jetFighter, stealthBomber, map, 77);
  expect(exchange).toMatchObject({ kind: 'evasion', defenderCounterDamageMultiplier: 0, defenderIncomingDamageMultiplier: 0.65 });
  expect(result.attackerDamage).toBe(0);
  expect(result.exchange?.label).toBe('Stealth makes it harder to hit: −35% interceptor damage');
});

it('keeps a bomber attacking a fighter on the normal counterattack path', () => {
  expect(getCombatExchangeModifiers(bomber, jetFighter).kind).toBe('none');
  expect(resolveCombat(bomber, jetFighter, map, 77).attackerDamage).toBeGreaterThan(0);
});
```

Also retain/add fixed-seed tests for adjacent catapult retaliation, long-range melee non-retaliation, ordinary ranged reciprocity, civilian/zero-strength early returns, and identical results after changing `currentPlayer`, owner IDs, and `opponentChallenge`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: FAIL because exchange policy and `CombatResult.exchange` do not exist.

- [ ] **Step 3: Implement the exchange helper and transient result summary**

In `src/core/types.ts`, add these transport-safe, non-persisted result types:

```ts
export type CombatExchangeKind = 'none' | 'turret-fire' | 'evasion';

export interface CombatExchangeSummary {
  kind: Exclude<CombatExchangeKind, 'none'>;
  label: string;
}
```

Append this exact member to the existing `CombatResult` interface in the same file:

```ts
exchange?: CombatExchangeSummary;
```

Import `CombatExchangeKind` from `src/core/types.ts`, then add this resolver-only type in `src/systems/combat-system.ts`:

```ts
export interface CombatExchangeModifiers {
  kind: CombatExchangeKind;
  defenderCounterDamageMultiplier: number;
  defenderIncomingDamageMultiplier: number;
  label?: string;
}
```

Implement `getCombatExchangeModifiers(attacker, defender)` with neutral `{ kind: 'none', defenderCounterDamageMultiplier: 1, defenderIncomingDamageMultiplier: 1 }` unless the attacker is air/ranged and the defender is air/bombard with doctrine metadata. Return the exact labels from the approved spec for the two declared doctrines.

After the existing base damage calculations and after existing early returns, apply:

```ts
const exchange = getCombatExchangeModifiers(attacker, defender);
const defenderDamage = Math.round(baseDefenderDamage * exchange.defenderIncomingDamageMultiplier);
const attackerDamage = canCounterAttackAtDistance(defender, distance)
  ? Math.round(baseAttackerDamage * exchange.defenderCounterDamageMultiplier)
  : 0;
```

Attach `{ kind: exchange.kind, label: exchange.label }` only when `kind !== 'none'`. Do not add this field to `Unit`, `GameState`, or save migrations.

Extend `CombatStrengthBreakdown` with `exchange`, sourced from this same helper, so preview code cannot recompute a divergent rule.

- [ ] **Step 4: Add deterministic balance regression bounds**

Use seeds `1..100` and fresh full-health units per seed. Assert the fighter’s mean damage dealt exceeds mean damage taken against both bomber doctrines; turret-fire mean return damage is `> 0` and less than half of the fighter’s mean dealt damage; stealth-bomber mean incoming damage is lower than conventional-bomber mean incoming damage but remains `> 0`.

```ts
const samples = Array.from({ length: 100 }, (_, seed) => resolveCombat(fighter, bomber, map, seed + 1));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
expect(mean(samples.map(result => result.defenderDamage))).toBeGreaterThan(mean(samples.map(result => result.attackerDamage)));
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts
```

Expected: PASS with deterministic policy, parity, early-exit, and balance coverage.

- [ ] **Step 6: Commit the resolver**

```sh
git add src/core/types.ts src/systems/combat-system.ts tests/systems/combat-system.test.ts
git commit -m "fix(combat): model bomber interception defenses"
```

### Task 3: Surface the exact exchange result in preview and notification log

**Files:**
- Modify: `src/ui/combat-preview.ts:3-28`
- Modify: `src/ui/notification-routing.ts:306-332`
- Test: `tests/ui/combat-preview.test.ts`
- Test: `tests/ui/combat-resolved-presentation.test.ts`
- Test: `tests/main.integration.test.ts`

- [ ] **Step 1: Write failing preview and post-combat presentation tests**

Add formatter tests with `exchange` to assert the exact approved text, then negative tests for `kind: 'none'`. Extend `makeEvent()` in `combat-resolved-presentation.test.ts` with a turret-fire exchange and assert the defender notification contains the same label. Add a live integration test that selects a fighter, taps a visible bomber, and asserts the rendered `#info-panel` contains `Bomber gunners fire back weakly: 25% return fire`.

Add a fogged hot-seat test that changes `state.currentPlayer` to a civilization whose visibility does not include the bomber tile, taps the tile, and asserts no `Combat Preview` or exchange label appears.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/ui/combat-preview.test.ts tests/ui/combat-resolved-presentation.test.ts tests/main.integration.test.ts
```

Expected: FAIL because the label is not currently rendered or routed.

- [ ] **Step 3: Implement shared visible text without new UI controls**

In `formatCombatPreviewDetails`, append `preview.exchange.label` only when present:

```ts
if (preview.exchange?.label) details.push(preview.exchange.label);
```

Keep `main.ts` on its existing live `calculateCombatStrengths` → `formatCombatPreviewDetails` path; do not create a duplicate preview formatter or add a button.

In `routeCombatResolved`, append `result.exchange?.label` to the defender’s existing message:

```ts
const exchangeNote = result.exchange?.label ? ` ${result.exchange.label}.` : '';
const msg = result.defenderSurvived
  ? `${defenderType} was attacked by ${attackerLabel} (${result.defenderDamage} damage taken).${exchangeNote}`
  : `${defenderType} was destroyed by ${attackerLabel}!${exchangeNote}`;
```

Preserve the existing `sink(defenderOwner, ...)` recipient; never derive the recipient from `state.currentPlayer`.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/ui/combat-preview.test.ts tests/ui/combat-resolved-presentation.test.ts tests/main.integration.test.ts
```

Expected: PASS; visible, legal targets show the correct doctrine, ordinary combat stays unlabelled, and fogged hot-seat views reveal nothing.

- [ ] **Step 5: Commit presentation wiring**

```sh
git add src/ui/combat-preview.ts src/ui/notification-routing.ts tests/ui/combat-preview.test.ts tests/ui/combat-resolved-presentation.test.ts tests/main.integration.test.ts
git commit -m "feat(ui): explain bomber interception defenses"
```

### Task 4: Add exactly one defensive-fire sound and no stealth-shot sound

**Files:**
- Modify: `src/audio/sfx-director.ts:89-137`
- Test: `tests/audio/sfx-director.test.ts`

- [ ] **Step 1: Write failing sound-behavior tests**

Emit a `combat:resolved` event whose `result.exchange` is turret fire with positive `attackerDamage`; assert the defender’s existing `ranged-loose` file is requested exactly once. Emit an evasion result with `attackerDamage: 0`; assert no defender `ranged-loose` or `siege-fire` file is requested. Keep the ordinary attacker fire/impact expectations intact.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-director.test.ts
```

Expected: FAIL because the director currently has no defensive-fire branch.

- [ ] **Step 3: Reuse the existing defender weapon sound once**

After the normal attacker fire is scheduled, add this guarded branch in `handleCombatResolved`:

```ts
if (result.exchange?.kind === 'turret-fire' && result.attackerDamage > 0 && defenderType) {
  const defenderSfx = UNIT_SFX[defenderType];
  const counterFire = defenderSfx?.['ranged-loose'] ?? defenderSfx?.['siege-fire'];
  if (counterFire) this.scheduleFile(counterFire.file, 140, viewerIds);
}
```

Do not add a new audio asset, trigger the branch for `evasion`, or schedule it when the defender did zero damage. `canPresentTo(viewerIds)` remains the hot-seat/fog visibility gate.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/audio/sfx-director.test.ts
```

Expected: PASS; turret fire has one secondary sound and evasion has none.

- [ ] **Step 5: Commit audio behavior**

```sh
git add src/audio/sfx-director.ts tests/audio/sfx-director.test.ts
git commit -m "feat(audio): play bomber defensive fire once"
```

### Task 5: Make AI attack ranking policy-aware

**Files:**
- Modify: `src/ai/ai-tactics.ts:295-370`
- Test: `tests/ai/ai-tactics.test.ts`

- [ ] **Step 1: Write a failing AI target-choice regression**

Build one tactical context containing an AI `jet_fighter` and two otherwise comparable visible targets: a conventional bomber and a stealth bomber. Use the same fixed game ID/turn/IDs as the ranking seed. Assert the ranking score is derived from projected `attackerDamage` and `defenderDamage`, and that changing a target doctrine changes its score in the same direction as `resolveCombat`.

Also assert a human and AI fighter given equivalent attacker/defender units, map, context, and seed receive equal `resolveCombat` results; only the owning caller differs.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts
```

Expected: FAIL because `rankAttacks` currently scores risk from raw strength instead of the projected exchange result.

- [ ] **Step 3: Score projected damage instead of raw symmetric strength**

Keep `calculateCombatStrengths` for terrain information, but calculate the seeded `preview` before score components and replace the raw strength ratios with:

```ts
const expectedDamageRatio = Math.min(2, preview.defenderDamage / Math.max(1, defender.health));
const deathRisk = Math.min(2, preview.attackerDamage / Math.max(1, unit.health));
```

Retain `safeRanged`, plan priority, capture preservation, and all other score terms. This makes every attack estimate use the same resolver—including turret fire and evasion—without a second AI-only combat formula.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-tactics.test.ts
```

Expected: PASS; the AI sees the same risk/reward as the player’s deterministic result.

- [ ] **Step 5: Commit AI parity**

```sh
git add src/ai/ai-tactics.ts tests/ai/ai-tactics.test.ts
git commit -m "fix(ai): score bomber interception outcomes"
```

### Task 6: Prove no-save-migration compatibility and run the complete regression set

**Files:**
- Modify: `tests/storage/save-migrations.test.ts`
- Modify: `docs/superpowers/specs/2026-07-14-issue-537-air-interception-defense-design.md` only if implementation revealed a verified design deviation.

- [ ] **Step 1: Write the legacy-save regression**

Create a current-schema save fixture containing existing `bomber` and `stealth_bomber` units. Save its schema version, call `migrateSaveToCurrent`, then resolve a jet-fighter interception against each loaded unit. Assert:

```ts
expect(migrated.saveSchemaVersion).toBe(versionBefore);
expect(migrated.units.legacyBomber.type).toBe('bomber');
expect(migrated.units.legacyStealthBomber.type).toBe('stealth_bomber');
expect(resolveCombat(fighter, migrated.units.legacyBomber, migrated.map, 41).exchange?.kind).toBe('turret-fire');
expect(resolveCombat(fighter, migrated.units.legacyStealthBomber, migrated.map, 41).exchange?.kind).toBe('evasion');
```

- [ ] **Step 2: Run the storage test to verify it passes without a migration**

Run:

```sh
bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts
```

Expected: PASS; no `CURRENT_SAVE_SCHEMA_VERSION` or `SAVE_MIGRATIONS` edit is needed.

- [ ] **Step 3: Run source-rule, targeted, and type-check validation**

Run:

```sh
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/combat-system.ts src/systems/unit-system.ts src/ui/combat-preview.ts src/ui/notification-routing.ts src/main.ts src/ai/ai-tactics.ts src/audio/sfx-director.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts tests/ui/combat-preview.test.ts tests/ui/combat-resolved-presentation.test.ts tests/main.integration.test.ts tests/ai/ai-tactics.test.ts tests/audio/sfx-director.test.ts tests/storage/save-migrations.test.ts
bash scripts/run-with-mise.sh yarn build
```

Expected: every selected test and the TypeScript/Vite build exit 0.

- [ ] **Step 4: Inspect the final implementation delta**

Run:

```sh
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/core/types.ts src/systems/combat-system.ts src/systems/unit-system.ts src/ui/combat-preview.ts src/ui/notification-routing.ts src/main.ts src/ai/ai-tactics.ts src/audio/sfx-director.ts
git status --short
```

Expected: only the planned combat, AI, UI, audio, tests, and design/plan documentation changes are present; no save-migration code is changed.

- [ ] **Step 5: Commit the compatibility regression**

```sh
git add tests/storage/save-migrations.test.ts
git commit -m "test(storage): preserve bomber saves across interception update"
```

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover typed doctrines, generic siege/bombard defense, deterministic damage, early exits, and balance; Task 3 covers plain-language live preview, log, and hot-seat privacy; Task 4 covers SFX; Task 5 covers AI and solo/AI parity; Task 6 covers legacy saves and final verification.
- **UI guardrails:** The player truth table, misleading-label boundaries, and replay checklist identify visible state before/after selection and resolution. No queue or catalog behavior is introduced.
- **Type consistency:** `AirInterceptionDefense`, `CombatExchangeKind`, `CombatExchangeSummary`, `CombatExchangeModifiers`, `CombatResult.exchange`, `defendsPoorly`, and `getCombatExchangeModifiers` use the same names in every task; `core/types.ts` owns all cross-layer transport types.
- **Scope:** No carrier, basing, radar, mission, content-roster, or save-schema work is included.
