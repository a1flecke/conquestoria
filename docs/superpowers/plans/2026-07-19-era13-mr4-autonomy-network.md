# Era 13 MR4 Full Autonomy Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and execute inline. This repository forbids subagents and parallel agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete, optional Autonomy Network as one canonical, save-safe, accessible, AI-capable, hot-seat-private planning system.

**Architecture:** Extend the existing MR3 `NetworkPlan` lifecycle rather than adding a second evaluator. Typed plan definitions feed pure Capacity/Load, validation, preview, cleanup, canonical city/route/vision/combat effects, AI candidates, and all player surfaces. Persist only posture/timing and plan state; derive Capacity, Load, valid links, previews, and available sources from `GameState`.

**Tech Stack:** TypeScript strict mode, Vitest, Canvas 2D, DOM/UI kit, event bus, serialized saves/migrations, deterministic catalog-driven AI, Vite PWA/shared Tauri frontend.

**Approved design:** `docs/superpowers/specs/2026-07-19-era13-mr4-autonomy-network-design.md`.

**Drift record:** #513 merged at `f7c5e6101a71f2c5d9afc698739e33e686c1f2b1`; branch base `origin/main` is `e7bcc0cbae5e8ee5cdb453f89acf4179eedc5add`; the pre-edit 20-file baseline passed (656 tests). Existing Cyber lifecycle remains the sole evaluator. Open-PR search returned no Autonomy Network overlap. Current `save-migrations.ts` is already schema 5, so the compatible correction is an ordered schema-6 MR4 migration, plus availability-aware Capacity guidance.

---

## File map

- Create: `src/systems/autonomy-capacity.ts` — pure Capacity/Load, available-source, state, and Surge selectors.
- Create: `src/systems/autonomy-postures.ts` — typed postures, pending-boundary application, and recovery/cooldown transitions.
- Create: `src/systems/network-infrastructure-plans.ts` — definition data and plan-specific target/link validation.
- Create: `src/systems/network-combat-coordination.ts` — dormant formation definition validation and canonical modifier lookup.
- Create: `src/ai/ai-network-planning.ts` — bounded deterministic plan candidates/cache using public validators/previews.
- Create: `src/ui/network-panel.ts` — Plans/Capacity/Security catalog, preview, `Show all`, accessibility, and deep-link model.
- Create: `src/ui/network-tutorial.ts` — staged, skippable/replayable teaching state and rendering.
- Create: `src/renderer/network-overlay.ts` — viewer-authorized plan/link overlay only.
- Modify: `src/core/autonomy-state.ts`, `src/core/types.ts`, `src/storage/save-migrations.ts`, `src/core/id-counters.ts`, `src/core/game-state.ts` — serializable schema-6 state and normalization.
- Modify: `src/systems/network-plan-definitions.ts`, `src/systems/network-plan-system.ts`, `src/systems/network-effect-resolver.ts` — expanded closed definitions, canonical preview/assignment/cleanup/resolution.
- Modify: `src/systems/resource-system.ts`, `src/systems/city-work-system.ts`, `src/core/turn-manager.ts`, `src/systems/trade-system.ts`, `src/systems/fog-of-war.ts`, `src/systems/combat-system.ts` — authoritative effect application only.
- Modify: `src/ai/ai-network-intents.ts`, `src/core/opponent-challenge.ts`, `src/ui/advisor-system.ts`, `src/ui/game-shell.ts`, `src/ui/city-panel.ts`, `src/ui/selected-unit-info.ts`, `src/ui/turn-handoff.ts`, `src/main.ts`, notification routing — live callers, solo/hot-seat behavior, and immediate rerenders.
- Modify: `tests/**` mirrors for every source file above plus targeted integration, storage, UI, and renderer regressions.

## Global acceptance gates

- Normal assignment never overloads; Surge preview equals the exactly applied enhanced resolution.
- Strain never pauses ordinary valid plans or reduces base yields, movement, or strength.
- A player can always ignore the system or Hold; no action blocks end turn.
- Only buildable-now sources are recommended as Capacity remedies; future MR5 sources are explanatory only.
- Explorer/Standard/Veteran use identical numbers, rules, targets, and intel; only choice quality differs.
- Every visible action mutates through the canonical evaluator and rerenders the open surface.
- Save schema 6 is deterministic, idempotent, and preserves MR3 plans/viewer detections.
- No overlay, focus, notification, or SFX leaks at hot-seat handoff before identity confirmation.

### Task 1: Establish schema-6 autonomy state and pure Capacity/Load contracts

**Files:**
- Modify: `src/core/autonomy-state.ts`, `src/core/types.ts`, `src/core/game-state.ts`, `src/core/id-counters.ts`, `src/storage/save-migrations.ts`
- Create: `src/systems/autonomy-capacity.ts`, `src/systems/autonomy-postures.ts`
- Test: `tests/core/autonomy-state.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/systems/autonomy-capacity.test.ts`, `tests/systems/autonomy-postures.test.ts`

- [ ] **Step 1: Write failing state/migration tests.**

```ts
expect(getAutonomyCapacity(state, 'player')).toMatchObject({ unrestricted: 2, restricted: {} });
expect(getAutonomyLoad(state, 'player')).toEqual({ total: 0, unrestricted: 0, byCategory: {} });
expect(migrateSaveToCurrent(legacyV5)).toMatchObject({ saveSchemaVersion: 6 });
expect(migrateSaveToCurrent(migrateSaveToCurrent(legacyV5))).toEqual(migrateSaveToCurrent(legacyV5));
```

- [ ] **Step 2: Run the new tests and confirm RED because schema 6 and selectors do not exist.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/storage/save-migrations.test.ts tests/systems/autonomy-capacity.test.ts tests/systems/autonomy-postures.test.ts`

Expected: failure naming the missing schema-6 state/selectors.

- [ ] **Step 3: Add the minimum serializable contract.**

```ts
export type AutonomyPostureId = 'safeguarded' | 'integrated' | 'accelerated';
export interface AutonomyCivState {
  plans: Record<string, NetworkPlan>;
  detections: Record<string, NetworkViewerDetection>;
  posture: AutonomyPostureId;
  pendingPosture: { id: AutonomyPostureId; appliesOnTurn: number } | null;
  surgeRecoveryUntilTurn: number | null;
  surgeCooldownUntilTurn: number | null;
}
export function getAutonomyCapacity(state: GameState, civId: string): AutonomyCapacity;
export function getAutonomyLoad(state: GameState, civId: string): AutonomyLoad;
```

Add ordered schema step 6, `migrateAutonomyNetworkPostures()`, which initializes these values for every civilization, preserves all MR3 plans/detections, and does not use wall-clock time. Capacity counts only definition metadata, applies precursor/diminishing/restricted caps, and returns `buildableNow` separately from future explanatory sources.

- [ ] **Step 4: Add posture/Surge boundary tests and implementation.**

```ts
expect(requestPostureChange(state, 'player', 'accelerated').state.autonomyByCiv!.player.pendingPosture)
  .toEqual({ id: 'accelerated', appliesOnTurn: state.turn + 1 });
expect(beginAutonomySurge(state, request).validation).toEqual({ ok: false, reason: 'ordinary-load-exceeds-capacity' });
```

Apply pending posture only at the owner boundary, reject a second change inside three rounds, expose allowance 1/1/3 and recovery 2/2/3, select the greatest recovery reduction only, and begin four-turn cooldown after recovery.

- [ ] **Step 5: Run focused tests and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/storage/save-migrations.test.ts tests/systems/autonomy-capacity.test.ts tests/systems/autonomy-postures.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): add capacity posture and schema migration`

### Task 2: Extend canonical plans, previews, validation, and cleanup

**Files:**
- Modify: `src/core/autonomy-state.ts`, `src/systems/network-plan-definitions.ts`, `src/systems/network-plan-system.ts`, `src/systems/network-effect-resolver.ts`
- Create: `src/systems/network-infrastructure-plans.ts`
- Test: `tests/systems/network-plan-definitions.test.ts`, `tests/systems/network-plan-system.test.ts`, `tests/systems/network-effect-resolver.test.ts`, `tests/systems/network-infrastructure-plans.test.ts`

- [ ] **Step 1: Write RED validation/preview tests for the four constructive definitions.**

```ts
expect(previewNetworkPlan(state, fabricationRequest)).toMatchObject({
  ok: true, load: 2, effect: { kind: 'city-production-percent', percent: 10, cap: 4 },
});
expect(validateNetworkPlanAssignment(state, overCapacityRequest)).toEqual({ ok: false, reason: 'ordinary-load-exceeds-capacity' });
expect(previewNetworkPlan(state, surgeRequest).effect).toEqual({ kind: 'route-gold', amount: 2 });
```

- [ ] **Step 2: Add closed definition data and a single public preview.**

```ts
export type NetworkPlanDefinitionId =
  | 'harden' | 'exploit' | 'fabrication-sprint' | 'research-mesh'
  | 'logistics-routing' | 'survey-grid' | 'guardian-screen' | 'swarm-strike';
export function previewNetworkPlan(state: GameState, request: NetworkPlanRequest): NetworkPlanPreview;
```

Definitions encode anchors, target kind, max links, Load, `surgeLoad`, stable/surged closed effects, AI tags, category, presentation text, and counter data. Preserve Harden/Exploit values unchanged. Validate ownership, anchors, first-two-active-route limit, science-building links, eligible survey units, no recursive base, same-plan target non-stacking, diplomacy, range, and ordinary Capacity before any Surge selection.

- [ ] **Step 3: Make assignment, retarget, Hold, cancellation, and target-end resolution consume the same preview.**

The mutation result returns the preview used for the state change. Cleanup cancels malformed/missing/captured/peace-broken/overlapping plans deterministically, but strained state permits cancel, repair, shrink, and same-or-lower-Load retarget. Neither AI nor UI derives an independent legality rule.

- [ ] **Step 4: Add negative and parity tests, then run.**

```ts
expect(validateNetworkPlanAssignment(state, duplicateMesh)).toEqual({ ok: false, reason: 'same-type-target-already-assigned' });
expect(resolveNetworkPlanAtTargetEnd(state, plan.id, context).preview).toEqual(preview);
```

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts tests/systems/network-effect-resolver.test.ts tests/systems/network-infrastructure-plans.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): add constructive network plan contracts`

### Task 3: Wire effects only through canonical yield, route, and vision paths

**Files:**
- Modify: `src/systems/resource-system.ts`, `src/systems/city-work-system.ts`, `src/core/turn-manager.ts`, `src/systems/trade-system.ts`, `src/systems/fog-of-war.ts`
- Test: `tests/systems/city-system.test.ts`, `tests/systems/tech-yield-system.test.ts`, `tests/systems/trade-system.test.ts`, `tests/systems/fog-of-war.test.ts`, `tests/ui/city-panel.test.ts`

- [ ] **Step 1: Write RED canonical-effect tests.**

```ts
expect(calculateProjectedCityYields(state, city).production).toBe(baseProduction + 4);
expect(getTradeRouteIncome(state, route).gold).toBe(baseGold + 1);
expect(getVisibilityRange(unit.position, baseVision + 1, state.map)).toContain(expectedHex);
```

Include cap tests (+4/+6 production, +3/+5 per linked science city), a recursive-base negative test, inactive/broken-link negatives, first-two-routes-only, and Surge preview/result equality.

- [ ] **Step 2: Implement a shared active-effect query and consume it at each canonical seam.**

```ts
export function getActiveNetworkEffects(state: GameState, civId: string): readonly ActiveNetworkEffect[];
export function getCityNetworkYieldBonus(state: GameState, cityId: string): Partial<ResourceYield>;
```

Apply percentages to unmodified base values at the same layer used by turn income and city projections. Route income reads only active valid links. Fog reads valid Survey Grid links but never changes movement. UI panels consume these helpers; they do not calculate a separate bonus.

- [ ] **Step 3: Verify immediate rendered recalculation and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-yield-system.test.ts tests/systems/trade-system.test.ts tests/systems/fog-of-war.test.ts tests/ui/city-panel.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): wire constructive plan effects canonically`

### Task 4: Add dormant formation coordination without exposing an untrainable action

**Files:**
- Create: `src/systems/network-combat-coordination.ts`
- Modify: `src/systems/combat-system.ts`, `src/systems/network-plan-system.ts`
- Test: `tests/systems/network-combat-coordination.test.ts`, `tests/systems/combat-system.test.ts`, `tests/ui/combat-preview.test.ts`, `tests/ui/combat-resolved-presentation.test.ts`

- [ ] **Step 1: Write RED formation fixtures.**

```ts
expect(getNetworkCombatCoordination(state, attackContext)).toEqual({ strengthBonus: 4, planId: 'network-plan-4' });
expect(getNetworkCombatCoordination(state, suppressedContext)).toEqual({ strengthBonus: 0, planId: null });
```

Cover one-to-three fixture Combat Drones, range two, defender/attacker exclusivity, declared target/zone, strongest-only with Hypersonic Coordination, EWA suppression, broken/restored links, and Surged +6. Assert base strength/movement never changes.

- [ ] **Step 2: Implement typed dormant formation definitions and the shared modifier lookup.**

`guardian-screen` and `swarm-strike` validate only through fixture-compatible unit data. Do not add them to an actionable player catalog until Drone Controller is trainable in MR5. `combat-system` calls the lookup in both preview and resolution and returns the applied plan ID/bonus for visible presentation.

- [ ] **Step 3: Run tests and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/network-combat-coordination.test.ts tests/systems/combat-system.test.ts tests/ui/combat-preview.test.ts tests/ui/combat-resolved-presentation.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): add dormant formation coordination`

### Task 5: Deliver the Network HUD, panel, deep links, tutorial, and authorized overlay

**Files:**
- Create: `src/ui/network-panel.ts`, `src/ui/network-tutorial.ts`, `src/renderer/network-overlay.ts`
- Modify: `src/ui/network-intent-panel.ts`, `src/ui/game-shell.ts`, `src/ui/city-panel.ts`, `src/ui/selected-unit-info.ts`, `src/main.ts`
- Test: `tests/ui/network-panel.test.ts`, `tests/ui/network-intent-panel.test.ts`, `tests/ui/game-shell.test.ts`, `tests/ui/city-panel.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/renderer/network-overlay.test.ts`

#### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Stable with room | Confirm Fabrication Sprint | HUD `Network: Stable · Load/Capacity`, plan row, and city production breakdown refresh |
| Candidate exceeds ordinary Capacity | Select it | Disabled confirm names exact deficit; only buildable-now Capacity remedies are actionable |
| Eligible Surge | Toggle Surge preview | Enhanced output, recovery length, and cooldown text appear before commit |
| Strained | Reopen Plans | Existing plans remain active; expansion is disabled while cancel/repair/shrink/equal-or-lower retarget remain enabled |
| Focused recommendations | Click `Show all` | Every currently actionable definition is reachable |

#### Misleading UI Risks

- `Room for N plans` uses the selected candidate's Load and category restriction, never a raw plan count.
- `Recommended` is available only when the shared preview is valid now; a future MR5 Capacity building is explanatory but not an action.
- `Stable` means not in Surge recovery, not merely `Load <= Capacity`; `Source known` uses viewer detections, never plan ownership.

#### Interaction Replay Checklist

- Assign first and second plans; retarget; cancel; repeat-click the rerendered control; reopen; preview and confirm Surge; wait/recover; request/apply posture; break/restore a formation link; capture; make peace; eliminate; save/load; and hand off.
- Each replay test asserts DOM text after the action, not only state.

- [ ] **Step 1: Write RED DOM and privacy tests.**

```ts
expect(panel.textContent).toContain('Network: Stable · 2/2');
await user.click(screen.getByRole('button', { name: 'Show all plans' }));
expect(screen.getByText('Survey Grid')).toBeTruthy();
expect(panel.textContent).toContain('Need 1 more Capacity');
```

- [ ] **Step 2: Replace the MR3 intent-only surface with a canonical-preview model.**

```ts
export function getNetworkPanelModel(state: GameState, civId: string, options: NetworkPanelOptions): NetworkPanelModel;
export function createNetworkPanel(model: NetworkPanelModel, callbacks: NetworkPanelCallbacks): HTMLElement;
```

The model asks `previewNetworkPlan()` for every action. Use `createGameButton`, 44px targets, keyboard labels, textContent, non-color state text, reduced-motion-safe overlay rendering, and a visible formula-details control. Live `main.ts` callbacks call canonical mutations then recreate the still-open panel; no old inline launcher remains active.

- [ ] **Step 3: Add staged teaching and viewer-safe overlay wiring.**

Integrated is set automatically on activation; first valid constructive success unlocks posture teaching; first Stable resolution unlocks Surge teaching. Skip/replay is persistent, never locks the panel, and advice is derived from valid previews. Overlay only receives viewer-authorized plan/intel data and clears at handoff.

- [ ] **Step 4: Run UI/renderer tests and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ui/network-panel.test.ts tests/ui/network-intent-panel.test.ts tests/ui/game-shell.test.ts tests/ui/city-panel.test.ts tests/ui/selected-unit-info.test.ts tests/renderer/network-overlay.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): deliver network player surfaces`

### Task 6: Integrate deterministic AI, difficulty, solo advisor, and hot-seat lifecycle

**Files:**
- Create: `src/ai/ai-network-planning.ts`
- Modify: `src/ai/ai-network-intents.ts`, `src/core/opponent-challenge.ts`, `src/core/turn-manager.ts`, `src/ui/advisor-system.ts`, `src/ui/turn-handoff.ts`, notification delivery, `src/main.ts`
- Test: `tests/ai/ai-network-planning.test.ts`, `tests/ai/ai-network-intents.test.ts`, `tests/core/opponent-challenge.test.ts`, `tests/core/turn-manager.test.ts`, `tests/ui/advisor-system.test.ts`, `tests/ui/turn-handoff.test.ts`, `tests/integration/network-plan-turn-flow.test.ts`

- [ ] **Step 1: Write RED AI/difficulty/solo/hot-seat tests.**

```ts
expect(planNetworkTurn(state, 'ai-1', profile).state).toEqual(planNetworkTurn(state, 'ai-1', profile).state);
expect(getNetworkRecommendation(state, 'player')).toHaveLength(1);
expect(handoff.notifications.every(n => n.recipient === confirmedViewer)).toBe(true);
```

Assert Explorer chooses at least one valid constructive candidate and, after observed hostile impact, a valid counter within `planReconsiderRounds`; Veteran has better candidate selection but no numeric/intel advantage. Assert no more than one advisor recommendation and no automatic assign/retarget/Surge. Assert veil → confirm identity → clear viewer state → authorized warning → input → target-end resolution, including 2–4 player order.

- [ ] **Step 2: Implement bounded candidate selection and caches.**

```ts
export function getNetworkPlanCandidates(state: GameState, civId: string): readonly NetworkPlanRequest[];
export function planNetworkTurn(state: GameState, civId: string, profile: OpponentChallengeProfile): NetworkPlanningResult;
```

Candidates come only from public valid previews, stable-sort by IDs, use existing `tacticalTopK`, `seededSuboptimalChance`, `recoveryRounds`, and `planReconsiderRounds`, and cache unchanged forecasts by civ/turn. Add `maxConcurrentNetworkPlans` only if a failing profile test proves top-K cannot express the intended Explorer behavior.

- [ ] **Step 3: Thread viewer-safe events through turn/handoff callers.**

Use notification delivery with explicit recipient. Clear network panel/overlay selections and audio requests at handoff; never derive source identity, focus, or sound until confirmed viewer state is active. Reuse existing visible feedback; do not add MR6 authored motifs.

- [ ] **Step 4: Run tests and commit.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-network-planning.test.ts tests/ai/ai-network-intents.test.ts tests/core/opponent-challenge.test.ts tests/core/turn-manager.test.ts tests/ui/advisor-system.test.ts tests/ui/turn-handoff.test.ts tests/integration/network-plan-turn-flow.test.ts`

Expected: PASS.

Commit: `feat(era13-mr4): operate autonomy for AI solo and hot seat`

### Task 7: Run complete regressions, source checks, build, and delivery review

**Files:**
- Modify only any failing test/implementation file proven by this verification; do not broaden scope.

- [ ] **Step 1: Run source-rule checks for every changed source file.**

Run: `scripts/check-src-rule-violations.sh <every changed src path>`

Expected: exit 0.

- [ ] **Step 2: Run the complete targeted MR4 matrix.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/core/autonomy-state.test.ts tests/storage/save-migrations.test.ts tests/systems/autonomy-capacity.test.ts tests/systems/autonomy-postures.test.ts tests/systems/network-plan-definitions.test.ts tests/systems/network-plan-system.test.ts tests/systems/network-effect-resolver.test.ts tests/systems/network-infrastructure-plans.test.ts tests/systems/network-combat-coordination.test.ts tests/systems/city-system.test.ts tests/systems/tech-yield-system.test.ts tests/systems/trade-system.test.ts tests/systems/fog-of-war.test.ts tests/systems/combat-system.test.ts tests/ai/ai-network-planning.test.ts tests/ui/network-panel.test.ts tests/ui/network-intent-panel.test.ts tests/ui/game-shell.test.ts tests/ui/advisor-system.test.ts tests/ui/turn-handoff.test.ts tests/renderer/network-overlay.test.ts tests/integration/network-plan-turn-flow.test.ts`

Expected: PASS.

- [ ] **Step 3: Run build and full suite.**

Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test`

Expected: both exit 0.

- [ ] **Step 4: Review delivery diffs.**

Run:

```bash
git diff --stat origin/main...HEAD
git diff --stat
git diff origin/main...HEAD -- <all changed files>
git diff -- <all changed files>
```

Confirm no UI-only mutation, dead action, hidden future-content recommendation, new source leak, schema bypass, or untested derived label remains. Commit any verification-only correction separately.

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover balance, Capacity, postures, Surge, data, save migration, and canonical lifecycle; Task 3 covers constructive player-style effects; Task 4 covers formation counterplay; Task 5 covers ages, UI/UX, accessibility, and feedback; Task 6 covers AI, difficulty, solo, and hot seat; Task 7 proves buildability and regression safety.
- **Negative coverage:** ordinary overload, recursive bases, invalid/future recommendations, stale clicks, partial formula semantics, invalid links, EWA suppression, no second Surge, and pre-confirmation viewer leaks are explicit.
- **Delivery safety:** no action is exposed before all canonical, UI, save, AI, and privacy wiring lands; the full suite/build and both diff comparisons are required before delivery.
