# Era 13 MR3: Cyber Intent Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete, viewer-safe Harden and Exploit persistent-intent loop for Cyber Units while preserving the pre-Autonomy Era 12 passive behavior.

**Architecture:** Store serializable network plans under `autonomyByCiv`, validate every assignment and resolution through one canonical lifecycle module, and resolve effects only from the turn manager. UI and AI consume the same preview/validation result; migration v3 normalizes legacy Cyber Units deterministically and all lifecycle actors call the same cleanup helpers.

**Tech Stack:** TypeScript, Vitest, Vite, DOM UI, EventBus, serializable `GameState`, existing challenge profiles and save-migration registry.

**Target executor:** Sonnet 4.5.

---

## Inline implementation-readiness review: Surge-ready Exploit

| Dimension | Finding | Required implementation consequence |
|---|---|---|
| Balance and fun | A 15% result is 50% larger than the normal 10% Exploit. Without the MR4 Surge allowance, explicit confirmation, recovery, cooldown, and posture gates, it is an unpriced permanent advantage rather than a temporary tactical choice. | MR3 may not activate 15% from a bare boolean, migration default, or AI shortcut. |
| New-mechanic clarity and ages 7–43 | “Surge-ready” has no player-visible meaning if the selected-unit panel has no Surge action or explanation of its cost and recovery. Hidden stronger behavior is especially misleading for younger players and unlearnable for experienced players. | A live 15% outcome requires a visible pre-confirmation explanation and a later visible recovery state; neither belongs in the MR3 UI scope. |
| Play styles and difficulty | A hidden 15% AI-only or legacy-only path would make aggressive play inconsistent, while defensive players could not understand when to expect the stronger threat. Difficulty must vary choice quality only, not numeric outcomes or secret access. | AI must use the same ordinary 10% MR3 Exploit as humans until the full Surge mechanic exists. |
| UI and UX | The MR3 preview promises outcome, timing, counter, Load, and disclosure. A non-selectable `surgeReady` field cannot honestly appear there; a selectable toggle requires the MR4 confirmation/recovery interaction. | Keep the MR3 preview at 10% and do not render a Surge control, badge, or unexplained 15% result. |
| Architecture, extensibility, and data | A serialized flag needs a canonical owner, transition, validation, cancellation, migration, and resolver contract. Adding only a field creates an inert duplicate of the MR4 posture/Surge state model. | Keep `surgedPercent: 15` as definition metadata only if it remains unused by MR3 resolution; introduce live state only with the full MR4 model. |
| SFX, saves, solo, and hot seat | A live Surge result needs authorized feedback, mute/dedup rules, handoff persistence, and viewer-safe notification wording. A save carrying a flag without any transition source cannot be tested as a player journey. | Do not serialize or emit feedback for an untriggerable MR3 Surge state. |
| Testing and regression safety | A resolver-only flag test would not prove a real player/AI/save/hot-seat path. It would create coverage for code that no real caller can reach. | Test that definitions preserve both 10% and 15% values, but test MR3 gameplay resolution only at 10%; reserve the 15% end-to-end test for MR4. |

**Review conclusion:** The coherent MR3 scope is ordinary 10% Exploit with Harden/CDC mitigation. The 15% value remains typed definition metadata for the subsequent full Surge implementation; it must not create runtime state, UI, AI behavior, notifications, SFX, or save schema fields in this slice. Treating it as a live MR3 feature would expand the slice to include the omitted Surge contract and is not independently mergeable.

## Locked file structure

- Create `src/core/autonomy-state.ts`: closed persistent-plan, detection, and civic-pressure types plus state constructors.
- Create `src/systems/network-plan-definitions.ts`: Harden/Exploit data definitions and closed effect union.
- Create `src/systems/network-plan-system.ts`: activation predicate, validation, preview, assignment, Hold, retarget, cancellation, and cleanup.
- Create `src/systems/network-effect-resolver.ts`: deterministic Harden/Exploit mutation and typed result events.
- Create `src/systems/network-viewer-intel.ts`: viewer-safe warning and source-disclosure presentation.
- Create `src/ui/network-intent-panel.ts`: selected-Cyber-unit assignment/preview surface.
- Create mirrored core/system/UI/AI/audio/integration tests named in the tasks below.
- Modify `src/core/types.ts`, `src/core/id-counters.ts`, `src/core/turn-manager.ts`, `src/systems/cyber-warfare-system.ts`, `src/systems/unit-movement-system.ts`, `src/systems/city-capture-system.ts`, `src/systems/civilization-elimination-system.ts`, `src/systems/diplomacy-system.ts`, `src/storage/save-migrations.ts`, `src/storage/save-manager.ts`, `src/ui/selected-unit-info.ts`, `src/main.ts`, `src/ai/ai-round-scheduler.ts`, `src/ai/ai-plan-portfolio.ts`, `src/core/completed-round-handoff.ts`, notification routing, and SFX routing.

### Player truth table

| Before | Player action | Canonical state result | Immediate visible result |
|---|---|---|---|
| Owned Cyber Unit is on Hold | Assign Harden to an adjacent owned city | One active Harden plan for that unit; target holds/refreshes mitigation as scheduled | Open unit panel shows Harden, city, 50% mitigation, Load 1, and cancel/retarget controls |
| Owned Cyber Unit is on Hold | Assign Exploit to adjacent at-war city | Preparing hostile plan with the target’s next-turn warning marker | Panel shows 10% outcome, Load 2, first target-turn-end timing, and CDC counter |
| Victim begins its next turn | Acknowledge the handoff | Viewer-safe warning becomes visible | Warning names affected city, Exploit, and CDC/Harden counter without source identity or coordinates |
| Victim adds/has a counter | End the victim turn | Resolver delays/halves/charges exactly once | City/treasury/log refresh with mitigated result; the selected/intent panel remains current |
| Player changes their mind | Retarget or cancel | Old ID is resolved from current state; old plan is removed or replaced | Same open panel rerenders; repeated clicks never call a captured stale plan ID |

### Misleading UI risks and replay checklist

- Do not label mitigation as `Protected`; use `reduces hostile network effects`.
- Do not display `Detected` as `Source known`; identity and coordinate require an explicit authorized detection record.
- Do not call Load a capacity limit in MR3; it is a definition value shown in the preview only.
- Replay assign, second assignment attempt, retarget, cancel, reopen, repeat click after rerender, source movement out and back into range, peace, capture, save/load, AI turn, and hot-seat identity confirmation. Each replay assertion must inspect rendered DOM after the state change.

### Task 1: Add serializable network state and stable IDs

**Files:**
- Create: `src/core/autonomy-state.ts`
- Modify: `src/core/types.ts`, `src/core/id-counters.ts`, `src/storage/save-manager.ts`
- Test: `tests/core/autonomy-state.test.ts`, `tests/core/id-counters.test.ts`, `tests/storage/save-manager.test.ts`

- [ ] **Step 1: Write failing state and counter tests.**

```ts
expect(createEmptyAutonomyCivState()).toEqual({ plans: {}, detections: {} });
expect(scanIdCounters({ autonomyByCiv: { p1: { plans: { 'network-plan-7': plan }, detections: {} } } }))
  .toMatchObject({ nextNetworkPlanId: 8 });
expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
```

- [ ] **Step 2: Run the tests and confirm the new imports fail.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/core/id-counters.test.ts tests/storage/save-manager.test.ts`

Expected: FAIL because `autonomy-state` and `nextNetworkPlanId` do not exist.

- [ ] **Step 3: Define closed plain-data types and counter scanning.**

```ts
export type NetworkPlanTarget =
  | { kind: 'city'; cityId: string }
  | { kind: 'unit'; unitId: string }
  | { kind: 'formation'; unitIds: string[] }
  | { kind: 'route'; routeId: string }
  | { kind: 'zone'; center: HexCoord; radius: number };
export type NetworkPlanStatus = 'preparing' | 'active' | 'paused' | 'recovering' | 'completed' | 'canceled';
export interface NetworkPlan { id: string; ownerCivId: string; definitionId: 'harden' | 'exploit'; sourceUnitId: string; target: NetworkPlanTarget; status: NetworkPlanStatus; createdTurn: number; nextResolutionTurn: number; warnedTurn: number | null; }
export interface AutonomyCivState { plans: Record<string, NetworkPlan>; detections: Record<string, NetworkViewerDetection>; }
```

Add optional `autonomyByCiv`, `networkCivicPressureByCity`, and `nextNetworkPlanId` to `GameState`/`IdCounters`; update `emptyIdCounters`, `scanIdCounters`, and `normalizeIdCounters` so a valid counter is `max(current, scanned)` and legacy state gets `1`.

- [ ] **Step 4: Re-run the state tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/core/id-counters.test.ts tests/storage/save-manager.test.ts`

Expected: PASS, including a partial legacy fixture and a state with no plans.

- [ ] **Step 5: Commit the state foundation.**

```bash
git add src/core/autonomy-state.ts src/core/types.ts src/core/id-counters.ts src/storage/save-manager.ts tests/core/autonomy-state.test.ts tests/core/id-counters.test.ts tests/storage/save-manager.test.ts
git commit -m "feat(era13-mr3): add persistent network plan state"
```

### Task 2: Define Harden/Exploit and the canonical lifecycle API

**Files:**
- Create: `src/systems/network-plan-definitions.ts`, `src/systems/network-plan-system.ts`
- Test: `tests/systems/network-plan-definitions.test.ts`, `tests/systems/network-plan-system.test.ts`

- [ ] **Step 1: Write failing definition and validator tests.**

```ts
expect(getNetworkPlanDefinition('harden')).toMatchObject({ load: 1, range: 1, targetKind: 'friendly-city' });
expect(getNetworkPlanDefinition('exploit')).toMatchObject({ load: 2, range: 1, targetKind: 'at-war-enemy-city' });
expect(validateNetworkPlanAssignment(state, request)).toEqual({ ok: false, reason: 'target-not-at-war' });
expect(assignNetworkPlan(state, request).state).toBe(state); // invalid input must not allocate an ID
```

- [ ] **Step 2: Run the lifecycle tests and confirm they fail.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts`

Expected: FAIL because the definitions and lifecycle exports are absent.

- [ ] **Step 3: Implement data definitions, activation, preview, and immutable mutations.**

```ts
export function isAutonomyActivated(state: GameState, civId: string): boolean {
  const completed = state.civilizations[civId]?.techState.completed ?? [];
  return completed.some(id => TECH_TREE.find(tech => tech.id === id)?.era === 13);
}
export function validateNetworkPlanAssignment(state: GameState, request: NetworkPlanRequest): NetworkPlanValidation;
export function previewNetworkPlan(state: GameState, request: NetworkPlanRequest): NetworkPlanPreview;
export function assignNetworkPlan(state: GameState, request: NetworkPlanRequest): NetworkPlanMutationResult;
export function holdNetworkPlan(state: GameState, ownerCivId: string, sourceUnitId: string): NetworkPlanMutationResult;
export function retargetNetworkPlan(state: GameState, ownerCivId: string, planId: string, target: NetworkPlanTarget): NetworkPlanMutationResult;
export function cancelNetworkPlan(state: GameState, ownerCivId: string, planId: string, reason: NetworkPlanCancelReason): NetworkPlanMutationResult;
```

`validateNetworkPlanAssignment` must check activation, source ownership/type/existence, source uniqueness, target union integrity, city/unit ownership, range, war, same-type target nonstacking, and orphan references. All outer records are spread-replaced; no lifecycle helper mutates its input.

- [ ] **Step 4: Re-run lifecycle tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts`

Expected: PASS for Hold, assignment, retarget, cancel, stable ID allocation, range/war rejection, and same-type nonstacking.

- [ ] **Step 5: Commit the lifecycle API.**

```bash
git add src/systems/network-plan-definitions.ts src/systems/network-plan-system.ts tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts
git commit -m "feat(era13-mr3): add canonical network plan lifecycle"
```

### Task 3: Replace post-activation passive drain with deterministic effect resolution

**Files:**
- Create: `src/systems/network-effect-resolver.ts`
- Modify: `src/systems/cyber-warfare-system.ts`, `src/core/turn-manager.ts`, `src/core/types.ts`
- Test: `tests/systems/network-effect-resolver.test.ts`, `tests/systems/cyber-warfare-system.test.ts`, `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing effect and exclusive-path tests.**

```ts
expect(resolveNetworkPlanAtTargetEnd(state, exploitId, { baseCityGold: 19 }).events[0]).toMatchObject({ goldTransferred: 1 });
expect(resolveNetworkPlanAtTargetEnd(withCdc, exploitId, { baseCityGold: 20 }).events[0]).toMatchObject({ goldTransferred: 5 });
expect(resolveNetworkPlanAtTargetEnd(withHardenCharge, exploitId, { baseCityGold: 20 }).events[0]).toMatchObject({ goldTransferred: 3 });
expect(processTurn(activatedState, bus)).not.toEmit('city:cyber-drained');
```

Cover normal 10%, valid existing Surge-ready 15%, base-city-gold floor, zero-gold city, minimum-positive transfer, CDC first-resolution delay then halving, one Harden charge, AI Safety Institute owner-round refresh, multiple attackers/nonstacking, war/range failure, and no probabilistic roll.

- [ ] **Step 2: Run the resolver tests and confirm they fail.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-effect-resolver.test.ts tests/systems/cyber-warfare-system.test.ts tests/core/turn-manager.test.ts`

Expected: FAIL because the deterministic resolver and activation split do not exist.

- [ ] **Step 3: Implement deterministic resolver and turn-manager routing.**

```ts
export function resolveNetworkPlanAtTargetEnd(
  state: GameState,
  planId: string,
  context: { baseCityGold: number },
): NetworkEffectResolution;
```

Use integer arithmetic: `raw = Math.floor(baseCityGold * percent / 100)`. Apply CDC delay before the first otherwise-unmitigated resolution, then CDC halving and one consumed Harden halving in deterministic order; if `raw > 0`, clamp the final transfer to at least `1`. Refactor the turn manager to retain `processCyberDrain` only when `!isAutonomyActivated(state, victimCivId)` and to hand each activated target city’s base gold into the canonical resolver at its turn end. Credit the attacker through the existing gross-gold accumulator and emit typed network events from the resolver result.

- [ ] **Step 4: Re-run Cyber and turn tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-effect-resolver.test.ts tests/systems/cyber-warfare-system.test.ts tests/core/turn-manager.test.ts`

Expected: PASS, including a negative assertion that one victim round cannot apply both paths.

- [ ] **Step 5: Commit deterministic resolution.**

```bash
git add src/systems/network-effect-resolver.ts src/systems/cyber-warfare-system.ts src/core/turn-manager.ts src/core/types.ts tests/systems/network-effect-resolver.test.ts tests/systems/cyber-warfare-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(era13-mr3): convert cyber drain to deterministic intents"
```

### Task 4: Implement warning timing, viewer intel, and canonical cleanup

**Files:**
- Create: `src/systems/network-viewer-intel.ts`
- Modify: `src/systems/network-plan-system.ts`, `src/core/turn-manager.ts`, `src/systems/unit-movement-system.ts`, `src/systems/city-capture-system.ts`, `src/systems/civilization-elimination-system.ts`, `src/systems/diplomacy-system.ts`, `src/core/types.ts`
- Test: `tests/systems/network-viewer-intel.test.ts`, `tests/integration/network-plan-turn-flow.test.ts`, `tests/systems/unit-movement-system.test.ts`, `tests/systems/city-capture-system.test.ts`, `tests/systems/civilization-elimination-system.test.ts`, `tests/systems/diplomacy-system.test.ts`

- [ ] **Step 1: Write failing timing, privacy, and cleanup tests.**

```ts
expect(beginNetworkPlansForVictimTurn(prepared, 'victim').warnings).toEqual([expect.objectContaining({ effectLabel: 'Exploit', source: undefined })]);
expect(resolveVictimTurnEnd(warned, 'victim').state.civilizations.victim.gold).toBeLessThan(beforeGold);
expect(getNetworkWarningForViewer(detected, 'victim', plan.id).source).toEqual({ unitId: 'cyber-1', position: { q: 2, r: 0 } });
expect(cancelInvalidNetworkPlans(moveOutOfRange(state)).state.autonomyByCiv.attacker.plans).toEqual({});
```

Cover prepare-on-action, warning only at victim-turn start, one full response turn, target-end resolution, hidden-source default, authorized detection disclosure, source move/range break, source/target destruction, source capture, city capture, peace, conquest, elimination, diplomacy changes, malformed loads, and zero Load consumption for every invalid plan.

- [ ] **Step 2: Run timing and lifecycle tests and confirm failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-viewer-intel.test.ts tests/integration/network-plan-turn-flow.test.ts tests/systems/unit-movement-system.test.ts tests/systems/city-capture-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/systems/diplomacy-system.test.ts`

Expected: FAIL because lifecycle hooks and viewer-safe warning helpers are absent.

- [ ] **Step 3: Implement timing and route every invalidator to the shared cleanup helper.**

```ts
export function beginNetworkPlansForVictimTurn(state: GameState, victimCivId: string): NetworkTurnStartResult;
export function resolveNetworkPlansForVictimTurnEnd(state: GameState, victimCivId: string, baseGoldByCityId: Record<string, number>): NetworkTurnEndResult;
export function cancelInvalidNetworkPlans(state: GameState, trigger: NetworkPlanCleanupTrigger): NetworkPlanMutationResult;
export function getNetworkWarningForViewer(state: GameState, viewerId: string, planId: string): NetworkViewerWarning | null;
```

Call `cancelInvalidNetworkPlans` after successful unit movement, city capture/raze, civilization elimination, and every bilateral peace mutation. The helper must cancel captured-source plans immediately, leave captured Cyber Units on Hold/recovery, revalidate hostile plans after city ownership changes, and create one owner-visible notice for malformed loaded data. Do not inspect richer live source data in viewer presentation.

- [ ] **Step 4: Re-run lifecycle and privacy tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-viewer-intel.test.ts tests/integration/network-plan-turn-flow.test.ts tests/systems/unit-movement-system.test.ts tests/systems/city-capture-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/systems/diplomacy-system.test.ts`

Expected: PASS for both human and turn-manager paths, including a negative privacy assertion for an undetected source.

- [ ] **Step 5: Commit timing and cleanup.**

```bash
git add src/systems/network-viewer-intel.ts src/systems/network-plan-system.ts src/core/turn-manager.ts src/systems/unit-movement-system.ts src/systems/city-capture-system.ts src/systems/civilization-elimination-system.ts src/systems/diplomacy-system.ts src/core/types.ts tests/systems/network-viewer-intel.test.ts tests/integration/network-plan-turn-flow.test.ts tests/systems/unit-movement-system.test.ts tests/systems/city-capture-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(era13-mr3): resolve network plans on viewer-safe timing"
```

### Task 5: Append deterministic migration version 3 and preserve transfers

**Files:**
- Modify: `src/storage/save-migrations.ts`, `src/storage/save-manager.ts`, `src/core/id-counters.ts`
- Test: `tests/storage/save-migrations.test.ts`, `tests/storage/save-manager.test.ts`, `tests/storage/save-file-transfer.test.ts`, `tests/core/completed-round-handoff.test.ts`

- [ ] **Step 1: Write failing v3 migration and transfer tests.**

```ts
expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(3);
expect(migrateSaveToCurrent(legacyAtActivation).autonomyByCiv.p1.plans).toMatchObject({ 'network-plan-1': expect.objectContaining({ definitionId: 'exploit' }) });
expect(migrateSaveToCurrent(legacyAtActivation).autonomyByCiv.p1.plans).not.toHaveProperty('network-plan-2');
expect(normalizeLoadedState(JSON.parse(JSON.stringify(normalizeLoadedState(legacy)))))
  .toEqual(normalizeLoadedState(legacy));
```

Fixture cases: pre-activation empty state; stable unit/city sorting; first valid Exploit per city; duplicate source plans on Hold; counter increments; malformed/orphan rejection with one recovery notice; preserved detections; autosave/manual/export/import/handoff equality.

- [ ] **Step 2: Run migration tests and confirm failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-file-transfer.test.ts tests/core/completed-round-handoff.test.ts`

Expected: FAIL because schema version 3 and migration step 3 are absent.

- [ ] **Step 3: Add migration step 3 without a second registry.**

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 3;
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateToEra13Foundation,
  2: migrateLateResources,
  3: migrateAutonomyNetwork,
};
```

`migrateAutonomyNetwork` must initialize every civ’s autonomy record, keep pre-activation Civs empty, stable-sort existing Cyber Unit IDs and eligible target-city IDs, assign only the first valid Exploit for a city, increment `nextNetworkPlanId` for every created plan, put all remaining Cyber Units on Hold, preserve valid detections, and normalize malformed data once. Reuse `normalizeLoadedState`; do not add separate autosave/export/import mutation paths.

- [ ] **Step 4: Re-run migration and handoff tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-file-transfer.test.ts tests/core/completed-round-handoff.test.ts`

Expected: PASS, including load-save-load equality and a second migration call with no new IDs or notices.

- [ ] **Step 5: Commit migration support.**

```bash
git add src/storage/save-migrations.ts src/storage/save-manager.ts src/core/id-counters.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-file-transfer.test.ts tests/core/completed-round-handoff.test.ts
git commit -m "feat(era13-mr3): migrate cyber units into explicit plans"
```

### Task 6: Deliver selected-unit intent UI and live caller wiring

**Files:**
- Create: `src/ui/network-intent-panel.ts`
- Modify: `src/ui/selected-unit-info.ts`, `src/main.ts`
- Test: `tests/ui/network-intent-panel.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/input/selected-unit-tap-intent.test.ts`

- [ ] **Step 1: Write failing DOM replay tests.**

```ts
renderSelectedUnitInfo(container, activatedState, cyberId, callbacks);
expect(container.textContent).toContain('Assign Intent');
getByRole(container, 'button', { name: 'Exploit' }).click();
expect(container.textContent).toContain('First effect: end of target’s next turn');
getByRole(container, 'button', { name: 'Confirm Exploit' }).click();
expect(container.textContent).toContain('Preparing Exploit');
```

Assert Hold/Harden/Exploit reachability; valid target list; disabled target reasons; outcome/Load/timing/counter/detection text; immediate rerender after assign/retarget/cancel; reopen; and two clicks after rerender acting on the current plan ID.

- [ ] **Step 2: Run UI tests and confirm failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/network-intent-panel.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-tap-intent.test.ts`

Expected: FAIL because no network intent panel or callbacks exist.

- [ ] **Step 3: Implement UI as a view over the shared preview and live callbacks.**

```ts
export interface NetworkIntentPanelCallbacks {
  onAssign(request: NetworkPlanRequest): void;
  onRetarget(planId: string, target: NetworkPlanTarget): void;
  onCancel(planId: string): void;
  onHold(sourceUnitId: string): void;
}
export function renderNetworkIntentPanel(container: HTMLElement, state: GameState, unitId: string, callbacks: NetworkIntentPanelCallbacks): void;
```

Use `createGameButton` or a button with background, color, and `min-height:44px`. In `main.ts`, callbacks must call lifecycle helpers, update `gameState`, update HUD/renderer, and re-run `selectUnit(unitId)` to render current IDs. Do not store a plan object in a closure or expose an action for another owner/current-player mismatch.

- [ ] **Step 4: Re-run UI replay tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/network-intent-panel.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-tap-intent.test.ts`

Expected: PASS with DOM assertions after every interaction.

- [ ] **Step 5: Commit the complete player loop.**

```bash
git add src/ui/network-intent-panel.ts src/ui/selected-unit-info.ts src/main.ts tests/ui/network-intent-panel.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-tap-intent.test.ts
git commit -m "feat(era13-mr3): add cyber intent player loop"
```

### Task 7: Add bounded, earned-intel AI intent selection

**Files:**
- Modify: `src/ai/ai-round-scheduler.ts`, `src/ai/ai-plan-portfolio.ts`
- Create: `src/ai/ai-network-intents.ts`
- Test: `tests/ai/ai-network-intents.test.ts`, `tests/ai/ai-round-scheduler.test.ts`, `tests/ai/ai-plan-portfolio.test.ts`

- [ ] **Step 1: Write failing AI behavior tests.**

```ts
expect(chooseNetworkIntent(aiState, 'ai-1')).toMatchObject({ kind: 'assign', definitionId: 'exploit' });
expect(chooseNetworkIntent(noEarnedIntel, 'ai-1')).toEqual({ kind: 'hold', sourceUnitId: cyberId });
expect(chooseNetworkIntent(obsoletePlanState, 'ai-1')).toMatchObject({ kind: 'cancel', planId });
```

Test deterministic sorting, `tacticalTopK` bounded evaluation, Explorer’s seeded suboptimal choice, Veteran’s best valid candidate, no hidden target/source data, source-protection rejection, and scheduler parity with a human `assignNetworkPlan` result.

- [ ] **Step 2: Run AI tests and confirm failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-network-intents.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-plan-portfolio.test.ts`

Expected: FAIL because network candidates are not scheduled.

- [ ] **Step 3: Implement deterministic candidate selection and scheduler application.**

```ts
export type AINetworkIntentDecision =
  | { kind: 'assign'; request: NetworkPlanRequest }
  | { kind: 'retarget'; planId: string; target: NetworkPlanTarget }
  | { kind: 'cancel'; planId: string }
  | { kind: 'hold'; sourceUnitId: string };
export function chooseNetworkIntent(state: GameState, civId: string): AINetworkIntentDecision[];
```

Build candidates only from AI perception’s earned city positions, sort by score then stable IDs, slice to `getChallengeProfileForCiv(state, civId).tacticalTopK`, and execute exclusively via the lifecycle API. Add summarized portfolio trace data without retaining live plan objects.

- [ ] **Step 4: Re-run AI tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-network-intents.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-plan-portfolio.test.ts`

Expected: PASS with deterministic results under all three difficulty profiles.

- [ ] **Step 5: Commit the AI loop.**

```bash
git add src/ai/ai-network-intents.ts src/ai/ai-round-scheduler.ts src/ai/ai-plan-portfolio.ts tests/ai/ai-network-intents.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-plan-portfolio.test.ts
git commit -m "feat(era13-mr3): teach AI cyber intent planning"
```

### Task 8: Route notifications, SFX, and hot-seat viewer transitions

**Files:**
- Modify: `src/core/types.ts`, `src/core/notification-log.ts`, `src/ui/notification-routing.ts`, `src/main.ts`, `src/audio/sfx-director.ts`, `src/core/completed-round-handoff.ts`
- Test: `tests/ui/notification-routing.test.ts`, `tests/audio/sfx-director.test.ts`, `tests/audio/sfx-routing.test.ts`, `tests/core/completed-round-handoff.test.ts`, `tests/ui/turn-handoff.test.ts`

- [ ] **Step 1: Write failing viewer-safe feedback tests.**

```ts
expect(routeNetworkEvents(state, repeatedResolutions)).toContainEqual(expect.objectContaining({ message: expect.stringContaining('2 network effects resolved') }));
expect(routeNetworkEvents(state, [firstWarning]).filter(event => event.immediate)).toHaveLength(1);
expect(playNetworkSfx(hiddenWarning, state)).toBe(false);
expect(acknowledgeTurnHandoffSummary(state, victimId, summary).state.notificationLog[victimId][0].message).toContain('Exploit');
```

Cover first warning/capture/cancel immediate feedback, recurring per-civ-per-round aggregation, mute/volume, SFX deduplication, current-viewer authorization, no source-localized audio, and no warning/focus/audio before hot-seat identity confirmation.

- [ ] **Step 2: Run presentation and handoff tests and confirm failure.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts tests/audio/sfx-routing.test.ts tests/core/completed-round-handoff.test.ts tests/ui/turn-handoff.test.ts`

Expected: FAIL because typed network event routing does not exist.

- [ ] **Step 3: Add event-to-feedback routing.**

```ts
export type NetworkPresentationEvent = NetworkWarningEvent | NetworkResolutionEvent | NetworkCancellationEvent;
export function routeNetworkEvents(state: GameState, events: readonly NetworkPresentationEvent[]): GameState;
```

Emit network events from resolver/lifecycle results, aggregate only repeated resolutions, and invoke the SFX director only with `[state.currentPlayer]` authorization after the paired notification is visible. During `releaseHandoffToViewer`, derive that viewer’s warnings after acknowledgement; never read the previous player’s warning, selected unit, focus target, or detection state.

- [ ] **Step 4: Re-run presentation tests.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts tests/audio/sfx-routing.test.ts tests/core/completed-round-handoff.test.ts tests/ui/turn-handoff.test.ts`

Expected: PASS for visible feedback, mute, dedupe, and hot-seat privacy.

- [ ] **Step 5: Commit presentation integration.**

```bash
git add src/core/types.ts src/core/notification-log.ts src/ui/notification-routing.ts src/main.ts src/audio/sfx-director.ts src/core/completed-round-handoff.ts tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts tests/audio/sfx-routing.test.ts tests/core/completed-round-handoff.test.ts tests/ui/turn-handoff.test.ts
git commit -m "feat(era13-mr3): route cyber intent feedback safely"
```

### Task 9: Perform the required inline implementation review and final verification

**Files:**
- Modify only files required by concrete review findings.
- Test: every test file changed above, plus `tests/systems/era-12.test.ts` and `tests/main.integration.test.ts` when event/UI wiring changes.

- [ ] **Step 1: Inspect complete committed and uncommitted diffs.**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- $(git diff --name-only origin/main...HEAD)
git diff -- $(git diff --name-only)
git diff --check
```

Expected: every source change traces from serializable state through canonical systems to UI/notification/audio, with no whitespace errors and no dead action.

- [ ] **Step 2: Review gameplay and product paths against the truth table.**

Trace: pre-activation passive drain; activation; Hold; Harden; Exploit; CDC delay; Harden charge; AI Safety refresh; warning; victim response; resolution; move/capture/peace/elimination cleanup; migration; export/import; solo; and 2–4 player handoff. Add a regression before fixing any discovered P0/P1 issue.

- [ ] **Step 3: Run source-rule and targeted regressions.**

Run:

```bash
scripts/check-src-rule-violations.sh src/core/autonomy-state.ts src/core/types.ts src/core/id-counters.ts src/core/turn-manager.ts src/core/notification-log.ts src/systems/cyber-warfare-system.ts src/systems/network-plan-definitions.ts src/systems/network-plan-system.ts src/systems/network-effect-resolver.ts src/systems/network-viewer-intel.ts src/systems/unit-movement-system.ts src/systems/city-capture-system.ts src/systems/civilization-elimination-system.ts src/systems/diplomacy-system.ts src/storage/save-migrations.ts src/storage/save-manager.ts src/ui/network-intent-panel.ts src/ui/selected-unit-info.ts src/ui/notification-routing.ts src/main.ts src/ai/ai-network-intents.ts src/ai/ai-round-scheduler.ts src/ai/ai-plan-portfolio.ts src/audio/sfx-director.ts
```

Then run:

```bash
bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/core/id-counters.test.ts tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts tests/systems/network-effect-resolver.test.ts tests/systems/network-viewer-intel.test.ts tests/integration/network-plan-turn-flow.test.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-file-transfer.test.ts tests/ui/network-intent-panel.test.ts tests/ui/selected-unit-info.test.ts tests/ai/ai-network-intents.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-plan-portfolio.test.ts tests/audio/sfx-director.test.ts tests/audio/sfx-routing.test.ts tests/core/completed-round-handoff.test.ts tests/ui/turn-handoff.test.ts tests/systems/city-capture-system.test.ts tests/systems/civilization-elimination-system.test.ts tests/systems/diplomacy-system.test.ts tests/systems/unit-movement-system.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run release verification.**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit review fixes, push, and open the required draft MR.**

```bash
git add src/core/autonomy-state.ts src/core/types.ts src/core/id-counters.ts src/core/turn-manager.ts src/core/notification-log.ts src/systems/cyber-warfare-system.ts src/systems/network-plan-definitions.ts src/systems/network-plan-system.ts src/systems/network-effect-resolver.ts src/systems/network-viewer-intel.ts src/systems/unit-movement-system.ts src/systems/city-capture-system.ts src/systems/civilization-elimination-system.ts src/systems/diplomacy-system.ts src/storage/save-migrations.ts src/storage/save-manager.ts src/ui/network-intent-panel.ts src/ui/selected-unit-info.ts src/ui/notification-routing.ts src/main.ts src/ai/ai-network-intents.ts src/ai/ai-round-scheduler.ts src/ai/ai-plan-portfolio.ts src/audio/sfx-director.ts tests/core/autonomy-state.test.ts tests/core/id-counters.test.ts tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts tests/systems/network-effect-resolver.test.ts tests/systems/network-viewer-intel.test.ts tests/integration/network-plan-turn-flow.test.ts tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts tests/storage/save-file-transfer.test.ts tests/ui/network-intent-panel.test.ts tests/ui/selected-unit-info.test.ts tests/input/selected-unit-tap-intent.test.ts tests/ai/ai-network-intents.test.ts tests/ai/ai-round-scheduler.test.ts tests/ai/ai-plan-portfolio.test.ts tests/ui/notification-routing.test.ts tests/audio/sfx-director.test.ts tests/audio/sfx-routing.test.ts tests/core/completed-round-handoff.test.ts tests/ui/turn-handoff.test.ts
git commit -m "fix(era13-mr3): close cyber intent review findings"
git push -u origin codex/issue-513-mr3
gh pr create --draft --base main --head codex/issue-513-mr3 --title "feat(era13-mr3): deliver cyber intents"
```

MR body must list #536/#548 drift SHAs, compatible deviation record, player-visible surfaces, AI/difficulty behavior, solo/hot-seat privacy, migration impact, explicit out-of-scope items, independent-merge safety, exact verification output, and screenshots of the selected-unit/intent UI.

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover serializable state, closed unions, validation, IDs, Hold, assignment, retarget, and cancellation. Task 3 covers the activation boundary and all effect numbers/mitigation. Task 4 covers timing, privacy, and all actor-agnostic cleanup. Task 5 covers migration and every save-transfer route. Tasks 6–8 cover the complete player, AI, notifications, SFX, solo, and hot-seat loops. Task 9 requires the multidimensional inline review and release verification.
- **UI guardrails:** The truth table, misleading-label limits, and replay matrix require visible post-action DOM assertions and current-ID callbacks.
- **Consistency:** `NetworkPlanTarget`, `NetworkPlanRequest`, `NetworkPlanValidation`, `NetworkPlanMutationResult`, and `NetworkPlanCleanupTrigger` are introduced in Task 2 before later tasks consume them; `NetworkPresentationEvent` is introduced in Task 8 before routing uses it.
- **Scope:** Capacity enforcement, postures, Surge controls, infrastructure plans, formations, new Era 13 content, wonders, and authored network motifs remain excluded.
