# Issue 689 Missile Cruiser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Missile Cruiser as the gated Era 11 naval fire-support successor with naval-only adjacent +10 anti-aircraft coverage.

**Architecture:** Extend typed unit, role, air-defense, and obsolescence metadata instead of adding Missile-Cruiser ID branches. A shared unit-obsolescence predicate drives both catalogue and queued-production behavior; a domain-scoped air-defense capability drives combat, preview, AI, and overlays. Existing providers preserve all-domain coverage by omitting the new scope.

**Tech Stack:** TypeScript and Vitest.

---

## File map

- `src/core/types.ts` — `missile_cruiser`, all-of obsolescence metadata, and protected-domain air-defense capability.
- `src/systems/city-system.ts` — trainable entry, icon, all-of obsolescence predicate, production eligibility, and queue removal.
- `src/systems/unit-system.ts`, `src/systems/tech-definitions-eras10.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/unit-modifier-definitions.ts` — factual roster, unlock, role, counter, and description data.
- `src/systems/air-defense-system.ts` — canonical naval-only provider filtering while preserving strongest-source facts and viewer redaction.
- `src/ai/ai-tactics.ts` — typed air-defense escort filtering for visible aircraft and friendly naval defenders.
- `src/renderer/unit-visual-resolver.ts`, `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts` — valid temporary naval sprite, icon, movement, and ranged-fire fallbacks.
- Tests: `city-system`, `unit-system`, `tech-definitions`, `unit-chain-integrity`, `unit-modifier-system`, `air-defense-system`, `ai-research`, `ai-production`, `ai-tactics`, `combat-preview`, `air-defense-overlay`, sprite catalogue, SFX catalogue, and storage.

## Player Truth Table

| Before | Player action | Immediate visible result |
| --- | --- | --- |
| Carrier Warfare is complete but Radar Systems or Rocketry is missing | Open the production catalogue | Missile Cruiser is not selectable; its ordinary unlock surface identifies the remaining technology instead of hiding the full legal catalogue. |
| All three technologies and a coastal city are available | Open production catalogue, then queue Missile Cruiser | Missile Cruiser appears with its naval icon, plain-language role, exact values, and the normal queue/ETA update. |
| A friendly naval unit is adjacent to Missile Cruiser and an aircraft attacks | Open combat preview | Preview adds `Missile Cruiser +10`; moving beyond radius or attacking with a non-air unit removes that fact immediately. |
| A different hot-seat player has not observed the Cruiser | Toggle the anti-aircraft overlay or preview combat | No provider geometry, label, or source identity leaks. |

## Misleading UI Risks

- A Carrier Warfare unlock must not imply the unit is legal while Radar Systems or Rocketry remains missing; the normal missing-requirement presentation is required.
- The existing overlay circle describes coverage radius, not eligible defender domains. The Missile Cruiser unit description and preview must say `nearby ships`; land and city defenders must never receive the modifier.
- A weaker Air Defense provider is not an additional bonus. Its fact must remain superseded, not silently combined.
- Recommendations may rank legal units but must not remove other legal production entries.

## Interaction Replay Checklist

- Research the final missing prerequisite, reopen the production surface, queue Missile Cruiser, and verify the active item/ETA updates.
- Queue a Battleship, complete only one or two Missile Cruiser prerequisites, and verify it remains valid; complete the final prerequisite and verify it is removed as obsolete with normal queue feedback.
- Preview a visible air attack against an adjacent naval defender, then move the defender outside radius and reopen preview; verify the fact appears then disappears.
- Switch two-human `currentPlayer`, reopen the overlay and preview, and verify the unobserved Cruiser never appears.

### Task 1: Add typed scopes and all-of unit obsolescence

**Files:** `src/core/types.ts`; `src/systems/city-system.ts`; tests `tests/systems/city-system.test.ts` and `tests/systems/unit-chain-integrity.test.ts`.

- [ ] Write RED tests for a new `isUnitObsolete(entry, completedTechs)` helper:

```ts
const battleship = TRAINABLE_UNITS.find(unit => unit.type === ('battleship' as UnitType))!;
expect(isUnitObsolete(battleship, ['carrier-warfare', 'radar-systems'])).toBe(false);
expect(isUnitObsolete(battleship, ['carrier-warfare', 'rocketry'])).toBe(false);
expect(isUnitObsolete(battleship, ['radar-systems', 'rocketry'])).toBe(false);
expect(isUnitObsolete(battleship, ['carrier-warfare', 'radar-systems', 'rocketry'])).toBe(true);
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts`; confirm RED.
- [ ] Add `obsoletedWhenAllTechs?: string[]` to `TrainableUnitEntry`, `protectedDomains?: Array<'land' | 'naval' | 'air'>` to `AirDefenseProviderCapability` and its resolved/provider types, and `isUnitObsolete`. Make it return true for legacy `obsoletedByTech` or when every all-of tech is complete.
- [ ] Replace both direct unit-obsolescence checks in `getTrainableUnitsForCiv` and `processCity` with the helper. Preserve existing production-drop precedence and legacy queue grace behavior.
- [ ] Re-run the same command; confirm GREEN. Commit: `feat(689): type conjunctive naval obsolescence`.

### Task 2: Add the Missile Cruiser roster and honest catalogues

**Files:** `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras10.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/unit-modifier-definitions.ts`; tests `tests/systems/unit-system.test.ts`, `tests/systems/city-system.test.ts`, `tests/systems/tech-definitions.test.ts`, `tests/systems/unit-chain-integrity.test.ts`, `tests/systems/unit-modifier-system.test.ts`.

- [ ] Write RED assertions:

```ts
expect(UNIT_DEFINITIONS.missile_cruiser).toMatchObject({
  strength: 70, movementPoints: 5, visionRange: 3, domain: 'naval', waterAccess: 'ocean',
  attackProfile: { kind: 'ranged', range: 3, targets: ['unit', 'city'] },
  airDefenseProvider: { radius: 1, defenseModifier: 10, stackingGroup: 'ground-air-defense', protectedDomains: ['naval'] },
});
expect(getTrainableUnitsForCiv(['carrier-warfare', 'radar-systems', 'rocketry']).some(unit => unit.type === 'missile_cruiser')).toBe(true);
expect(getTrainableUnitsForCiv(['carrier-warfare', 'radar-systems']).some(unit => unit.type === 'missile_cruiser')).toBe(false);
expect(getClassCounterMultiplier('submarine', 'missile_cruiser', false)?.multiplier).toBe(1.25);
```

- [ ] Run the five named suites; confirm RED.
- [ ] Add the unit type, definition, 18-word-or-fewer role summary, `naval-combat`/`escort`/`air-defense` AI roles, public facts, description, coastal trainable entry at cost 285, `requiredTechs: ['radar-systems', 'rocketry']`, and Battleship's `obsoletedWhenAllTechs` plus `upgradesTo: 'missile_cruiser'`. Add Missile Cruiser to Carrier Warfare `unlocksUnits`; its existing secondary gate presentation must name both missing requirements.
- [ ] Add Missile Cruiser to the capital-ship ambush rule and make its terminal/upgrade metadata pass the generic role and chain validators. Do not copy Battleship's +20% coastal/city bombardment rule: range-three fire support and fleet anti-aircraft are the complete #689 contract.
- [ ] Re-run the same suites; confirm GREEN. Commit: `feat(689): add Missile Cruiser naval successor`.

### Task 3: Make fleet anti-aircraft canonical and bounded

**Files:** `src/systems/air-defense-system.ts`; tests `tests/systems/air-defense-system.test.ts`, `tests/systems/air-domain.test.ts`, and `tests/systems/combat-context.test.ts` if it owns the shared-context fixture.

- [ ] Write RED tests proving:

```ts
expect(resolveAirDefenseCoverage(stateWithCruiser(), navalDefender, 'owner').flatDefenseModifier).toBe(10);
expect(resolveAirDefenseCoverage(stateWithCruiser(), landDefender, 'owner').flatDefenseModifier).toBe(0);
expect(resolveAirDefenseCoverage(stateWithCruiser(), cityDefender, 'owner').flatDefenseModifier).toBe(0);
expect(resolveAirDefenseCoverage(stateWithCruiserAndMobileAa(), navalDefender, 'owner').facts)
  .toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Missile Cruiser', outcome: 'applied', value: 10 }), expect.objectContaining({ label: 'Mobile AA', outcome: 'superseded', value: 8 })]));
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts`; confirm RED.
- [ ] Filter providers in `providersFor` by radius and `protectedDomains`, interpreting an omitted scope as all domains. Keep cargo, ownership, wrapping distance, strongest-source selection, cache behavior, and viewer filtering unchanged.
- [ ] Add an air-versus-naval positive and land/naval-attacker negatives through the actual combat context so human execution and AI execution receive the same result.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(689): scope Missile Cruiser fleet air defense`.

### Task 4: Wire generic AI and player-visible presentation

**Files:** `src/ai/ai-tactics.ts`, `src/ui/combat-preview.ts` only if the existing fact formatter needs no behavior change, `src/renderer/air-defense-overlay.ts` only if the existing label needs a plain-language companion; tests `tests/ai/ai-research.test.ts`, `tests/ai/ai-production.test.ts`, `tests/ai/ai-tactics.test.ts`, `tests/ui/combat-preview.test.ts`, `tests/renderer/air-defense-overlay.test.ts`.

- [ ] Write RED AI and presentation tests:

```ts
expect(planAIResearch(coastalContextMissing(['carrier-warfare', 'radar-systems', 'rocketry'])).techId).toBe('carrier-warfare');
expect(chooseUnitTacticalAction(visibleAircraftAndFleetContext, missileCruiser.id)).toMatchObject({ kind: 'move', unitId: missileCruiser.id });
expect(chooseUnitTacticalAction(visibleAircraftAndLandOnlyContext, missileCruiser.id)).not.toMatchObject({ kind: 'move', unitId: missileCruiser.id });
expect(formatCombatPreviewDetails('Rival', 100, cruiserCoveragePreview)).toContain('Missile Cruiser +10');
```

- [ ] Run the named AI/UI/renderer suites; confirm RED.
- [ ] Generalize the escort candidate predicate from any adjacent ally to a provider capability's `protectedDomains`, preserving visibility checks and no hidden-aircraft action. Retain existing Mobile AA all-domain escort behavior. Use the existing canonical combat facts and viewer-safe provider resolver; do not add a duplicate UI calculation or overlay that reveals hidden units.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(689): guide fleets with Missile Cruiser air defense`.

### Task 5: Register fallbacks and prove save/queue/hot-seat resilience

**Files:** `src/renderer/unit-visual-resolver.ts`, `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`; tests `tests/renderer/sprites/sprite-catalog.test.ts`, `tests/audio/sfx-catalog.test.ts`, `tests/storage/save-migrations.test.ts`, plus the city/air-defense/UI suites above.

- [ ] Write RED fallback and persistence assertions:

```ts
expect(getLocomotionClass('missile_cruiser')).toBe('naval');
expect(UNIT_SFX.missile_cruiser?.['ranged-loose']).toBeDefined();
expect(UNIT_SPRITE_CATALOG.missile_cruiser).toBeDefined();
expect(importGameState(exportGameState(stateWithQueuedBattleship))).toMatchObject({ cities: expect.any(Object) });
```

- [ ] Add a two-human fixture that switches `currentPlayer`: own Cruiser is visible in the anti-air overlay and its preview fact; an unobserved rival Cruiser is absent from both. Add queue/save tests for each partial and complete all-of obsolescence gate. Do not add a schema version or migration because the new fields are static catalogue metadata.
- [ ] Register the existing Battleship naval silhouette, ranged SFX, naval locomotion, and icon as explicit Missile Cruiser fallbacks, with a clearly scoped future-art comment. The air-defense fact remains text-visible; do not emit a passive SFX, toast, or notification.
- [ ] Run all named suites; confirm GREEN. Commit: `feat(689): complete Missile Cruiser fallback coverage`.

### Task 6: Measure balance and verify the complete delivery

- [ ] Add or extend a deterministic naval balance fixture comparing Battleship, Missile Cruiser, Destroyer, and Submarine. Assert Missile Cruiser's cost/strength/movement match 285/70/5, Submarine retains `×1.25` capital-ship ambush, and no weaker Air Defense source raises the +10 cap.
- [ ] Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/city-system.ts src/systems/unit-system.ts src/systems/tech-definitions-eras10.ts src/systems/combat-role-definitions.ts src/systems/unit-modifier-definitions.ts src/systems/air-defense-system.ts src/ai/ai-tactics.ts src/renderer/unit-visual-resolver.ts src/renderer/sprites/sprite-catalog.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts tests/ai/ai-research.test.ts tests/ai/ai-production.test.ts tests/ai/ai-tactics.test.ts tests/ui/combat-preview.test.ts tests/renderer/air-defense-overlay.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts tests/storage/save-migrations.test.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
```

- [ ] Inspect the complete committed and uncommitted diff. Record the seeded fixture results in the PR summary and confirm the web build keeps `/conquestoria/` asset paths.

## Self-review

The plan addresses the review dimensions: the new ship has a bounded tactical purpose and a submarine answer; child-friendly plain language keeps its 10-word role sentence while exact facts remain visible for experienced players; all difficulties share legality and math; AI has only typed, observable inputs; UI and overlay behavior are immediate and hot-seat-safe; capability and obsolescence data are serializable and extensible; existing fallbacks preserve accessible SFX/visual behavior; saved games require no migration; and deterministic catalog, combat, AI, solo, hot-seat, queue, save, balance, build, and durable-suite regressions cover the production path.
