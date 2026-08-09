# Issue 690 Fort/Citadel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Worker-built Fort that becomes a Citadel at Fortification Engineering and gives a friendly land combat unit bounded, counterable defense.

**Architecture:** Persist one `fort` value in the existing tile improvement field and derive its Fort/Citadel tier from the owning civilization's technologies. A pure fortification system owns legality, cap, tier, and combat facts; the worker, combat context, AI, persistence, and renderer consume it rather than adding duplicate ID checks.

**Tech Stack:** TypeScript, Canvas 2D, Vitest.

---

## Pre-audit

- Base: `origin/main` `293a3a7b`; all blockers #667, #669, #684, and #686 are closed.
- The original audit base predates a 436-file delta. The shared `buildCombatContextForDefender` and typed combat facts now cover player, AI, world, preview, and air callers, and are the correct Fort seam.
- No Fort exists. The current improvement catalogue, worker mutation/completion, replacement confirmation, generic AI actions, and pillage reward are stable extension seams.
- Pillage intentionally sets `improvement` to `none`; no ruined-improvement state exists. Retain that model: rebuilding takes the normal five turns. Existing `restore_land` repairs catastrophe devastation while preserving a Fort. No new save shape or schema version is needed.
- This is Task 26 only. Task 27's dedicated cap/status/defense UI remains out of scope. The existing Worker catalogue and a temporary map treatment are sufficient to avoid a dead player action.
- Current AI Workers do not travel to an improvement site deliberately. Add one bounded, deterministic candidate helper using only owned tiles and visible threats.

## File map

- Create `src/systems/fortification-system.ts`: Fort/Citadel tier, cap/frontier legality, candidate selection, and defense resolver.
- Modify `src/core/types.ts`, `src/systems/improvement-system.ts`, `src/systems/worker-action-system.ts`: typed `fort`, definition, and canonical five-turn build.
- Modify `src/systems/unit-system.ts`, `src/systems/combat-context.ts`, `src/systems/combat-system.ts`: typed half penetration and shared defense facts.
- Modify `src/ai/ai-tactics.ts`, `src/storage/save-migrations.ts`, `src/renderer/improvements/improvement-treatment.ts`, `src/renderer/hex-renderer.ts`; update the mirrored system/AI/storage/renderer tests.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Worker is on legal owned land with Fortresses | Click `Build Fort` | Normal active worker task begins at five turns and the action disappears. |
| Friendly land combat unit occupies Fort | Fortify or preview combat | Separate Fort and Fortify facts appear; they are not described as one layer. |
| Owner completes Fortification Engineering | Preview combat | The persisted tile stays `fort`; its fact says Citadel and uses +20%. |
| Enemy occupies a complete Fort | Click `Pillage` | Existing confirmation/reward/action path removes it; no defense remains. |
| A catastrophe devastates an occupied Fort tile | Click `Restore Land` | Existing restore action removes devastation and retains the Fort. |

## Misleading UI Risks

- Empty, building, pillaged, naval, transported, or hostile occupants must receive no Fortification defense.
- Fortify's +25% and the Fort/Citadel multiplier are independent public facts.
- Citadel is a derived technology tier, never a second saved improvement ID.
- The full detailed Fort status/cap presentation is explicitly deferred to Task 27; no new filtered catalogue is introduced.

## Inline review corrections

| Dimension | Review result and required correction |
| --- | --- |
| Balance and fun | A Fort must reward preparation without becoming a default answer. The balance fixture now compares a builder's supported Fort against an explorer's mobile response, a defender's ordinary garrison, and the four approved siege counters; it rejects any result outside the four-to-eight successful-engagement envelope. |
| Ages 7–43 and play styles | `Build Fort — protect a friendly land unit` is the first, 7-word explanation. The action also shows `5 turns`, `+10% defense`, and the visible Citadel upgrade condition; the later status surface retains detailed breakdowns for optimizers. Explorer, builder, defender, expansionist, and casual fixtures prove the action stays optional, readable, and non-dominant. |
| Difficulty and computer players | Explorer, Standard, and Veteran must share the same placement legality, Fort/Citadel values, penetration, information boundary, and candidate set. Tests may permit existing decision-quality ranking differences only after the common legal candidate set is identical. |
| UI, UX, and hot seat | The selected Worker panel must refresh immediately after start/replacement, keep every other legal action reachable, use the existing 44-pixel button, and render from the selected owner/current viewer. Tests switch `currentPlayer` before opening panels and before completion/pillage presentation. |
| Architecture/extensibility/data | Capability data stays typed on improvements/units; no `trebuchet`/`fort` ID switch is allowed in combat. The AI makes one ordered owned-tile pass, and the public combat fact is computed in the shared context. |
| SFX and accessibility | #690 adds no unique sound or passive looping audio: the approved dedicated construction/damage/pillage/repair audio belongs to Wave 8 task 54. The existing owner-targeted text notification, map treatment, and combat fact are the accessible feedback path. Add regression coverage that no Fort completion/pillage presentation is delivered or played for the non-current hot-seat player. |
| Saves | Add an idempotent `normalizeImprovementValues` load normalizer that accepts every current legal improvement including `fort`, coerces unknown/malformed values to `none`, and clamps invalid construction turns to the definition's legal range. It runs after numbered migrations without pre-reserving a schema version. |
| Testing and regression | Each mutation gets RED/GREEN evidence; targeted suites cover solo, AI/world, all difficulties, two-human hot seat, current-viewer isolation, malformed/current/legacy/mid-action saves, renderer/DOM behavior, and the exact balance boundary. |

### Task 1: Add the pure Fortification contract

**Files:** Create `src/systems/fortification-system.ts`; modify `src/core/types.ts`; test `tests/systems/fortification-system.test.ts`.

- [ ] Write failing tier and legality tests:

```ts
expect(getFortificationTier(['fortresses'])).toEqual({ id: 'fort', label: 'Fort', multiplier: 1.1 });
expect(getFortificationTier(['fortresses', 'fortification-engineering'])).toEqual({ id: 'citadel', label: 'Citadel', multiplier: 1.2 });
expect(getFortificationPlacement(state, owner, target)).toMatchObject({ ok: true, isFrontier: true });
expect(getFortificationPlacement(stateAtCap, owner, interior).reason).toBe('empire-cap');
expect(getFortificationPlacement(stateWithAdjacentFort, owner, target).reason).toBe('adjacent-fort');
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/fortification-system.test.ts`; confirm RED.
- [ ] Add `fort` to `ImprovementType`, serializable tier/placement/defense result types, and pure helpers. Reject city centers, ocean/coast, mountains, unowned tiles, `resource_outpost`, adjacent completed/building Forts, and a full cap. Permit `cityCount` Forts anywhere legal, then only `Math.floor(cityCount / 3)` extra Forts on tiles adjacent to null/foreign ownership. Use wrapped neighbours and count in-progress Forts once.
- [ ] Re-run the suite; confirm GREEN. Commit: `feat(690): define Fortification contract`.

### Task 2: Build Forts through the ordinary Worker path

**Files:** `src/systems/improvement-system.ts`, `src/systems/worker-action-system.ts`; tests `tests/systems/improvement-system.test.ts`, `tests/systems/worker-action-system.test.ts`, `tests/systems/improvement-turn-system.test.ts`.

- [ ] Write failing tests:

```ts
expect(IMPROVEMENT_DEFINITIONS.fort).toMatchObject({ buildTurns: 5, requiredTech: 'fortresses' });
expect(canBuildImprovement(tile, 'fort', ['fortresses'], owner, fortOptions)).toBe(true);
expect(canBuildImprovement(tile, 'fort', [], owner, fortOptions)).toBe(false);
expect(applyWorkerAction(state, worker.id, 'fort').state.map.tiles[key]).toMatchObject({ improvement: 'fort', improvementTurnsLeft: 5 });
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/improvement-system.test.ts tests/systems/worker-action-system.test.ts tests/systems/improvement-turn-system.test.ts`; confirm RED.
- [ ] Add zero-yield `fort`, the `Build Fort` label, and a narrow state-aware Fort eligibility context that delegates to `getFortificationPlacement`. Thread that same context through `applyWorkerAction`; preserve charges, replacement confirmation, worker task cleanup, start/completion events, and notification behavior.
- [ ] Change the visible Worker text to `Build Fort — protect a friendly land unit (5 turns, +10%; Citadel +20%)`. Add DOM assertions that it is visible only after Fortresses, stays alongside every other legal Worker action, and that the panel rerenders immediately after the action.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(690): add Worker-built Fort`.

### Task 3: Resolve defense and siege penetration in shared combat

**Files:** `src/systems/fortification-system.ts`, `src/systems/unit-system.ts`, `src/systems/combat-context.ts`, `src/systems/combat-system.ts`; tests `tests/systems/fortification-system.test.ts`, `tests/systems/combat-system.test.ts`, `tests/systems/combat-context.test.ts`.

- [ ] Write failing tests:

```ts
expect(resolveFortificationDefense(state, defender, attacker)).toMatchObject({ multiplier: 1.1, label: 'Fort +10%' });
expect(resolveFortificationDefense(citadelState, defender, trebuchet)).toMatchObject({ multiplier: 1.1, label: 'Citadel +20% (50% penetrated)' });
expect(resolveFortificationDefense(state, emptyFortRepresentative, attacker).multiplier).toBe(1);
expect(resolveFortificationDefense(state, navalDefender, attacker).multiplier).toBe(1);
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/fortification-system.test.ts tests/systems/combat-system.test.ts tests/systems/combat-context.test.ts`; confirm RED.
- [ ] Add typed optional `fortificationPenetration` to `UnitDefinition`, set to `0.5` only for Trebuchet, Grenadier, Artillery, and Rocket Artillery, and add no Fort-specific unit switch. Resolve only finished owned Forts beneath friendly non-transported land combat units; calculate penetration as `1 + (tier.multiplier - 1) * penetration`.
- [ ] Put the applied/ignored public fact and multiplier into `buildCombatContextForDefender`, then apply it separately from ordinary Fortify in `calculateCombatStrengths`. Return facts through existing results for preview/player/AI/world parity.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(690): resolve Fortification defense`.

### Task 4: Preserve canonical pillage, recovery, and saves

**Files:** `src/systems/pillage-system.ts` only for exhaustive typing, `src/storage/save-migrations.ts`; tests `tests/systems/pillage-system.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/storage/save-migrations-v12.test.ts`, `tests/systems/worker-action-system.test.ts`.

- [ ] Write failing regressions:

```ts
expect(getPillageGoldReward('fort')).toBe(5 * GOLD_PER_PILLAGE_BUILD_TURN);
expect(applyPillageToState(enemyFortState, raider.id).state.map.tiles[key].improvement).toBe('none');
expect(applyWorkerAction(devastatedFortState, worker.id, 'restore_land').state.map.tiles[key].improvement).toBe('fort');
expect(migrateSaveToCurrent(malformedFortSave).map.tiles[key].improvement).toBe('none');
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/pillage-system.test.ts tests/storage/save-migrations.test.ts tests/storage/save-migrations-v12.test.ts tests/systems/worker-action-system.test.ts`; confirm RED.
- [ ] Let the existing build-turn reward calculate Fort gold. Normalize valid Fort strings and malformed strings safely, without a version bump because `HexTile` gains no field. Test schema 0, 11, 12, malformed, and a mid-construction Fort round trip.
- [ ] Implement and test an idempotent post-migration `normalizeImprovementValues`: accept every declared improvement, coerce an unknown value to `none`, set invalid/negative/overlong construction turns to the matching definition's valid range, and never rewrite a valid saved `fort` into `citadel`.
- [ ] Re-run the suites; confirm GREEN. Commit: `test(690): cover Fort recovery and persistence`.

### Task 5: Give AI a bounded, observable Fort decision

**Files:** `src/systems/fortification-system.ts`, `src/ai/ai-tactics.ts`; tests `tests/systems/fortification-system.test.ts`, `tests/ai/ai-tactics.test.ts`.

- [ ] Write RED tests:

```ts
expect(findFortificationCandidate(state, aiId)).toMatchObject({ coord: frontierCoord });
expect(findFortificationCandidate(stateWithHiddenThreat, aiId)).toBeNull();
expect(chooseUnitTacticalAction(context(state, plan), worker.id)).toMatchObject({ kind: 'move', destination: frontierCoord });
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/fortification-system.test.ts tests/ai/ai-tactics.test.ts`; confirm RED.
- [ ] Scan owned tiles once per decision, sorted by coordinate. Score only legal frontier candidates with a hostile unit visible to the owner on the nearby approach; move to the winner, then use generic `applyWorkerAction('fort')`. Do not inspect hidden rivals or rescan per candidate.
- [ ] Run the same candidate fixture for Explorer, Standard, and Veteran. Assert identical legal placements, tier, cap, and visible-threat inputs; only an already-typed decision-quality tie-break may differ.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(690): place AI frontier forts`.

### Task 6: Surface a usable temporary Fort treatment

**Files:** `src/ui/selected-unit-info.ts`, `src/renderer/improvements/improvement-treatment.ts`, `src/renderer/hex-renderer.ts`; tests `tests/ui/selected-unit-info.test.ts`, `tests/renderer/improvements/improvement-treatment.test.ts`, `tests/renderer/hex-renderer.test.ts`.

- [ ] Write failing DOM/canvas tests:

```ts
expect(findButtons(container).map(button => button.textContent)).toContain('Build Fort');
expect(findButtons(noFortresses).map(button => button.textContent)).not.toContain('Build Fort');
expect(getImprovementTreatmentFamily('fort')).toBe('fortification');
expect(IMPROVEMENT_ICONS.fort).toBeDefined();
```

- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/ui/selected-unit-info.test.ts tests/renderer/improvements/improvement-treatment.test.ts tests/renderer/hex-renderer.test.ts`; confirm RED.
- [ ] Use the existing 44-pixel Worker button and complete legal catalogue; add an earthy non-animated Canvas treatment and compatible icon. Do not add a second rendering path, status panel, cap explanation, or repair control reserved for Task 27.
- [ ] Add a two-human replay: Player A starts/completes/pillages a Fort, then hand off to Player B before presentation. Assert Player B receives no stale Fort notification, animation, or audio; Player A's later panel/preview renders only their own current facts.
- [ ] Re-run the suites; confirm GREEN. Commit: `feat(690): render Fort fallback`.

### Task 7: Balance and verify the delivery

- [ ] Add deterministic fixtures for Fortify-only, Fort, Citadel, approved siege, and a same-era generalist; then play-style fixtures for a builder, defender, explorer, expansionist, optimizer, and casual first-use path. Assert +25% Fortify, +10%/+20% Fortification, half penetration only for the four approved units, no strict same-era upgrade, and four-to-eight successful engagements for a supported position.
- [ ] Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/fortification-system.ts src/systems/improvement-system.ts src/systems/worker-action-system.ts src/systems/combat-context.ts src/systems/combat-system.ts src/systems/unit-system.ts src/ai/ai-tactics.ts src/storage/save-migrations.ts src/renderer/improvements/improvement-treatment.ts src/renderer/hex-renderer.ts src/ui/selected-unit-info.ts
bash scripts/run-with-mise.sh yarn test --run tests/systems/fortification-system.test.ts tests/systems/improvement-system.test.ts tests/systems/worker-action-system.test.ts tests/systems/improvement-turn-system.test.ts tests/systems/combat-system.test.ts tests/systems/combat-context.test.ts tests/systems/pillage-system.test.ts tests/ai/ai-tactics.test.ts tests/storage/save-migrations.test.ts tests/storage/save-migrations-v12.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/improvements/improvement-treatment.test.ts tests/renderer/hex-renderer.test.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
git diff --stat origin/main...HEAD
git diff --stat
```

- [ ] Inspect committed and uncommitted diffs. Record fixture results and Task 27's UI deferral in the PR; confirm the web build preserves `/conquestoria/` asset paths.

## Self-review

This plan covers exact tiers, cap/frontier and terrain negatives, Fortify stacking, all four typed counters, empty/pillaged/non-land negatives, player/AI/world parity, hot-seat owner-tech isolation, existing pillage/catastrophe semantics, schema 0/previous/current/malformed/mid-action saves, temporary visible treatment, and deterministic balance. It intentionally keeps detailed status/placement UI in Task 27 while delivering a complete Worker action and map result.
