# Issue #707 Elephant-Crisis Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Beast Stampede and Rogue Elephant Host wave with deterministic, save-safe, hot-seat-safe audit regressions and repair the missing Rogue Host warning lifecycle delivery.

**Architecture:** Keep all crisis rules in the existing canonical Stampede and Rogue Host systems. Add the missing warning transition at the state-change boundary, emit it in the existing completed-round scheduler, and deliver it through the existing target-scoped presentation registrar. Build the remaining audit as deterministic fixtures around those public system/turn-flow seams; do not add a parallel audit-only game path, feature flag, or new persistence shape.

**Tech Stack:** TypeScript, Vitest, existing `EventBus`, serializable `GameState`, seeded scenario fixtures, DOM-panel tests.

**Audited base:** `1ce44932298681a025e0ad34a5530cf65733cc87` (`origin/main`, 2026-08-23). #703, #704, and #706 are merged. `CURRENT_SAVE_SCHEMA_VERSION` is 19; this work must not reserve or bump a schema version unless the implementation demonstrably changes persisted shape.

**In scope:** Stampede and Rogue Host state transitions, mutual exclusion/once-per-target behavior, exact force/reward values, human and AI parity, viewer isolation, save normalization/round trips, notification delivery, and regression proof that an ordinary legacy crisis still advances.

**Out of scope:** new elephant unit tuning, crisis art, SFX, route algorithm changes, new save fields, or changing the independently approved #703/#705/#706 contracts. Current elephant-crisis presentation is text/DOM notification and map/panel state, not a bespoke sound or animation. Preserve that accessibility-safe choice; the audit proves its text remains available with muted audio and reduced motion rather than adding unrelated effects.

---

## File structure and responsibilities

| File | Responsibility |
| --- | --- |
| `src/core/types.ts` | Add the target-scoped Rogue Host `warning` transition payload to the existing event union. |
| `src/systems/rogue-elephant-host-system.ts` | Derive a warning transition from a before/after Host record, alongside the existing command-break and resolution transitions. |
| `src/core/turn-manager.ts` | Emit every newly scheduled Host warning once, using the same before/after transition discipline as Stampede scheduling. |
| `src/presentation/register-rogue-elephant-host-presentation.ts` | Queue the plain-language warning for only the target civilization. |
| `tests/core/turn-manager-crisis.test.ts` | Exercise the real scheduler/turn-flow event boundary and duplicate-event negative case. |
| `tests/presentation/register-rogue-elephant-host-presentation.test.ts` | Prove target-only queued warning delivery and listener disposal. |
| `tests/systems/rogue-elephant-host-system.test.ts` | Add exact Host state, overlap, cooldown, command, and outcome audit cases. |
| `tests/systems/stampede-system.test.ts` | Add the reciprocal active-Host exclusion and terminal Stampede recurrence cases. |
| `tests/systems/elephant-crisis-audit.test.ts` | New deterministic matrix fixture for three seeds, difficulty/era edges, low-military containment, forts, and legacy-world parity. |
| `tests/storage/save-migrations.test.ts` | Cover schema-0, previous-schema, current-schema, malformed, and every live elephant-crisis phase. |
| `tests/ai/ai-crisis-response.test.ts` | Prove observed-only, Standard-severity AI response for both active and dispersing crisis forces. |
| `tests/ui/city-panel-crisis.test.ts` and `tests/ui/selected-unit-info.test.ts` | Prove current-viewer panel state and command text update after an actionable Host transition. |
| `docs/superpowers/plans/2026-08-23-issue-707-elephant-crisis-audit.md` | Record the audit matrix, results, and exact verification evidence in the same PR. |

## Player Truth Table

| Before | Trigger | Immediate visible result | Must not be visible |
| --- | --- | --- | --- |
| No Host for the target | Scheduler creates warning | Target receives one queued warning; open city panel says the Host is approaching | Any rival human receives no pending event, toast, or panel text |
| Active Host with Handler in range | Player selects a visible Rogue Elephant | Unit panel states that nearby Handler coordination grants +20% | Command fact for fogged elephant or a broken Host |
| Active Host with Handler killed | Combat resolution removes Handler | Target receives one break notice; open panel changes to three-turn dispersal status | A second break notice on later turns |
| Active Stampede or Host | Other crisis scheduler runs | Existing crisis remains the only targeted elephant crisis | A competing warning/force or duplicate reward |
| Reward charge is live | Train eligible elephant unit or advance expiry | Next unit consumes the named discount, or unreachable expiry becomes the stated gold once | A stale, already-consumed charge or duplicate payout |

## Misleading UI Risks

- “Approaching” means a persisted `warning` Host record exists for the current viewer; it must not be inferred from a rival’s force or an AI-targeted crisis.
- “Nearby Handler” means the active Handler is within two hexes of the selected elephant; handler death, a range-three Handler, a hidden elephant, and a dispersing herd must not show the +20% claim.
- “Disperse in N turns” means the persisted clock after command break, not a fresh Stampede’s six-turn duration.
- A target-scoped notification is not permission to show the same event to the current hot-seat player. The recipient is always `targetCivId`.

## Interaction Replay Checklist

- Create a Host warning for human A while human B is current; hand off to A and verify the queued warning appears once.
- Select a visible commanded elephant, resolve the Handler’s defeat through combat, then rerender the still-open selected-unit/city surface and verify the command claim disappears and dispersal status appears.
- Repeat the next two target turns; verify the countdown decrements, actors leave, terminal notification is single-shot, and reopening the panel does not recreate it.
- Repeat the same sequence with `settings.soundEnabled = false`; the same textual status and queued event remain present. Verify by code-path and DOM coverage that elephant crises create neither a bespoke audio cue nor a motion-managed overlay, so the browser’s reduced-motion preference cannot hide their information.

## Task 1: Restore the Host warning transition and target-scoped delivery

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/rogue-elephant-host-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/presentation/register-rogue-elephant-host-presentation.ts`
- Modify: `tests/core/turn-manager-crisis.test.ts`
- Modify: `tests/presentation/register-rogue-elephant-host-presentation.test.ts`

- [ ] **Step 1: Add failing transition and presentation regressions.**

  Add a direct transition assertion and real `processTurn` scheduler assertion. Use an eligible era-4 target and force the scheduling seam deterministically by calling `startRogueElephantHostWarning` only for the direct transition test; for scheduler wiring, capture `hostsBeforeScheduling` and use a test-only deterministic eligible state/seed whose next scheduler roll is below four. Assert exactly one event on the creation turn and no event on the following steady-state turn.

  ```ts
  expect(getRogueElephantHostLifecycleTransition(undefined, {
    targetCivId: 'p2', phase: 'warning', createdTurn: 8,
  })).toEqual({ kind: 'warning', targetCivId: 'p2' });

  expect(events).toEqual([{ kind: 'warning', targetCivId: targetCivId }]);
  processTurn(afterWarning, bus);
  expect(events).toHaveLength(1);
  ```

  In the presenter test, emit the new event while `p1` is current and target `p2`; assert `p2` has a queued/logged plain-language warning, `p1` has neither, then dispose and prove a later event has no effect.

  ```ts
  bus.emit('rogue-elephant-host:lifecycle', { kind: 'warning', targetCivId: 'p2' });
  expect(toast).not.toHaveBeenCalled();
  expect(state.pendingEvents?.p2?.[0]?.message).toContain('Rogue Elephant Host warning');
  expect(state.pendingEvents?.p1).toBeUndefined();
  ```

- [ ] **Step 2: Run the focused tests and confirm failure.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/core/turn-manager-crisis.test.ts tests/presentation/register-rogue-elephant-host-presentation.test.ts
  ```

  Expected: failure because the event union and transition helper do not admit `kind: 'warning'`, and the scheduler emits no Host warning event.

- [ ] **Step 3: Add the minimal event contract and canonical transition.**

  Extend the existing event type, not a second event name:

  ```ts
  'rogue-elephant-host:lifecycle':
    | { kind: 'warning'; targetCivId: string }
    | { kind: 'command-broken'; targetCivId: string; dispersalTurnsRemaining: number }
    | { kind: 'resolved'; targetCivId: string; outcome: RogueElephantHostOutcome; rewardGranted: boolean };
  ```

  Make `getRogueElephantHostLifecycleTransition` own the transition:

  ```ts
  if (before?.phase !== 'warning' && after.phase === 'warning') {
    return { kind: 'warning', targetCivId: after.targetCivId };
  }
  ```

  In `processTurn`, retain the before-map immediately before `processRogueElephantHostScheduling`, then iterate sorted resulting Host keys and emit only the helper’s returned transition. Do not scan final state later or emit from the presenter.

  ```ts
  const hostsBeforeScheduling = newState.rogueElephantHosts;
  newState = processRogueElephantHostScheduling(newState);
  for (const civId of Object.keys(newState.rogueElephantHosts ?? {}).sort()) {
    const transition = getRogueElephantHostLifecycleTransition(
      hostsBeforeScheduling?.[civId], newState.rogueElephantHosts?.[civId],
    );
    if (transition) bus.emit('rogue-elephant-host:lifecycle', transition);
  }
  ```

  Handle `warning` first in the Host registrar:

  ```ts
  if (event.kind === 'warning') {
    ctx.notifier.deliver(event.targetCivId,
      'Rogue Elephant Host warning: prepare defenses before the Handler coordinates an attack.',
      'warning');
    return;
  }
  ```

- [ ] **Step 4: Run the focused tests and source-rule check.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/rogue-elephant-host-system.ts src/core/turn-manager.ts src/presentation/register-rogue-elephant-host-presentation.ts
  bash scripts/run-with-mise.sh yarn test --run tests/core/turn-manager-crisis.test.ts tests/presentation/register-rogue-elephant-host-presentation.test.ts
  ```

  Expected: rule check exits 0 and all focused tests pass.

- [ ] **Step 5: Commit the small user-visible correction.**

  ```bash
  git add src/core/types.ts src/systems/rogue-elephant-host-system.ts src/core/turn-manager.ts src/presentation/register-rogue-elephant-host-presentation.ts tests/core/turn-manager-crisis.test.ts tests/presentation/register-rogue-elephant-host-presentation.test.ts
  git commit -m "fix(707): deliver rogue host warnings"
  ```

## Task 2: Lock down mutual exclusion, timing, exact values, and low-military containment

**Files:**
- Modify: `tests/systems/rogue-elephant-host-system.test.ts`
- Modify: `tests/systems/stampede-system.test.ts`
- Create: `tests/systems/elephant-crisis-audit.test.ts`

- [ ] **Step 1: Write the failing contract cases.**

  Add four focused cases to existing system tests:

  ```ts
  expect(startRogueElephantHostWarning(activeStampede, targetCivId, 'standard')).toEqual(activeStampede);
  expect(startStampedeWarning(activeHost, targetCivId, 'standard')).toEqual(activeHost);
  expect(processRogueElephantHostScheduling(resolvedHost)).toEqual(resolvedHost);
  expect(getRogueElephantHostProfile('veteran', false)).toEqual({ elephantCount: 2 });
  ```

  In the new audit file, create a deterministic `makeElephantAuditState(seed, era, humanCount)` helper local to the test file. It must: create a small game, add one city per target, make legal land around each city, and set only the target’s era-advancement techs. Do not patch random globals or call private helpers. The only persisted audio control is `settings.soundEnabled`; reduced motion is a browser preference used by unrelated wonder surfaces, not an elephant-crisis state field.

  Exercise these rows for `['elephant-audit-1', 'elephant-audit-2', 'elephant-audit-3']`:

  | Scenario | Required assertion |
  | --- | --- |
  | Era 3 Stampede | strengths are 28; Explorer/Standard/Veteran spawn 2/3/4; no warning-turn movement/attack |
  | Era 8 Stampede | strength is 48; six active passes remove survivors; containment only when city damage, civilian deaths, and pillages meet all three bounds |
  | Era 4 Host | Handler/elephant strengths 22/40; no attack in warning; 1/2/3 elephants for human Explorer/Standard/Veteran |
  | Era 9 Host | strengths 37/60; non-human target remains exactly Standard (one Handler + two elephants) |
  | Fort screen | route enters Fort, stops that herd, and respects the per-pass two-pillage cap |
  | No-military screen | six-pass zero-damage/zero-civilian/at-most-two-pillage expiry awards containment, not a forced-kill outcome |

  Add two conjunctive negative cases: three pillages with no city/civilian damage is `survived`; one civilian death with zero city damage and pillages is `survived`.

- [ ] **Step 2: Run the new audit tests and confirm failure.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/systems/stampede-system.test.ts tests/systems/rogue-elephant-host-system.test.ts tests/systems/elephant-crisis-audit.test.ts
  ```

  Expected: failures for missing reciprocal overlap/terminal coverage and any existing behavior that violates the stated contract. Do not retune values to make a test pass; first classify a failure as fixture error, approved-contract regression, or implementation defect.

- [ ] **Step 3: Make only proven canonical fixes.**

  If a test exposes a rule violation, modify only the owner system:

  - mutual exclusion/once-per-target: `src/systems/stampede-system.ts` or `src/systems/rogue-elephant-host-system.ts`;
  - route/stopping/pillage: `src/systems/stampede-route-system.ts` or `src/systems/stampede-system.ts`;
  - target-era strength/reward: the corresponding crisis system.

  Preserve these non-negotiable checks in code:

  ```ts
  if (state.rogueElephantHosts?.[targetCivId]?.completed || hasActiveTargetedWorldPressure(state, targetCivId)) return state;
  const outcome = cityDamage === 0 && civilianDeaths === 0 && pillagedTileKeys.length <= 2
    ? 'contained' : 'survived';
  ```

  Do not fix an audit failure with a UI-only branch, a test-only override, or an ID-specific seed exception.

- [ ] **Step 4: Re-run exact-value and audit tests.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/systems/stampede-system.ts src/systems/stampede-route-system.ts src/systems/rogue-elephant-host-system.ts
  bash scripts/run-with-mise.sh yarn test --run tests/systems/stampede-route-system.test.ts tests/systems/stampede-system.test.ts tests/systems/rogue-elephant-host-system.test.ts tests/systems/elephant-crisis-audit.test.ts
  ```

  Expected: all three seeds and every difficulty/era edge are reproducible and pass without changed tuning values.

- [ ] **Step 5: Commit the audit coverage and any proven canonical fix.**

  ```bash
  git add src/systems/stampede-system.ts src/systems/stampede-route-system.ts src/systems/rogue-elephant-host-system.ts tests/systems/stampede-system.test.ts tests/systems/stampede-route-system.test.ts tests/systems/rogue-elephant-host-system.test.ts tests/systems/elephant-crisis-audit.test.ts
  git commit -m "test(707): audit elephant crisis balance and overlap"
  ```

## Task 3: Prove persistence across every live phase without a schema bump

**Files:**
- Modify: `tests/storage/save-migrations.test.ts`
- Modify only if a normalization defect is demonstrated: `src/storage/save-migrations.ts`, `src/systems/stampede-system.ts`, `src/systems/rogue-elephant-host-system.ts`, or `src/systems/crisis-force-system.ts`

- [ ] **Step 1: Add failing save fixtures for every phase.**

  Build valid states only through public start/advance/break/outcome helpers, then use `structuredClone` and `migrateSaveToCurrent`. Cover:

  ```ts
  const phases = [
    ['stampede-warning', warning],
    ['stampede-active', active],
    ['host-warning', hostWarning],
    ['host-active', hostActive],
    ['host-dispersing', brokenHost],
    ['stampede-reward', rewardedStampede],
    ['host-reward', rewardedHost],
  ] as const;

  for (const [, state] of phases) {
    const loaded = migrateSaveToCurrent(structuredClone(state));
    expect(migrateSaveToCurrent(structuredClone(loaded))).toEqual(loaded);
  }
  ```

  Assert the preserved facts rather than snapshots: `forceId`, force unit IDs/types and route, phase/turn counters, target, severity, command-conversion state, outcome, reward one-shot flags, expiry, and eligible-unit-seen flags.

  Also cover schema 0 and schema 18 inputs, plus malformed orphaned force/target/route records. The malformed test must prove normalization removes only malformed crisis records and leaves an unrelated ordinary `activeCrises` record intact.

- [ ] **Step 2: Run save migration tests and confirm failure.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts
  ```

  Expected: the expanded phase round trips fail until any missing normalizer invariant is repaired.

- [ ] **Step 3: Repair the narrowest normalizer invariant, if needed.**

  Keep normalizers idempotent and shape-preserving. A valid in-flight record must survive unchanged; invalid records are dropped with their orphan crisis units only. Do not add schema 20 for a test-only migration.

  ```ts
  const once = migrateSaveToCurrent(structuredClone(validState));
  expect(migrateSaveToCurrent(structuredClone(once))).toEqual(once);
  expect(once.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
  ```

- [ ] **Step 4: Run save and adjacent crisis tests.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/storage/save-migrations.ts src/systems/stampede-system.ts src/systems/rogue-elephant-host-system.ts src/systems/crisis-force-system.ts
  bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/systems/crisis-force-system.test.ts tests/systems/stampede-system.test.ts tests/systems/rogue-elephant-host-system.test.ts
  ```

  Expected: schema 19 remains current and all valid phases round-trip exactly once.

- [ ] **Step 5: Commit the persistence audit.**

  ```bash
  git add src/storage/save-migrations.ts src/systems/stampede-system.ts src/systems/rogue-elephant-host-system.ts src/systems/crisis-force-system.ts tests/storage/save-migrations.test.ts
  git commit -m "test(707): cover elephant crisis save states"
  ```

## Task 4: Verify AI, hot-seat, panel refresh, and accessibility parity

**Files:**
- Modify: `tests/ai/ai-crisis-response.test.ts`
- Modify: `tests/ui/city-panel-crisis.test.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`
- Modify: `tests/systems/world-pressure-presentation.test.ts`
- Modify only if a failing user-visible assertion proves it necessary: `src/ai/ai-crisis-response.ts`, `src/systems/world-pressure-presentation.ts`, `src/ui/city-panel.ts`, or `src/ui/selected-unit-info.ts`

- [ ] **Step 1: Add failing parity and rendered-DOM tests.**

  Add an AI fixture where the AI owns a visible active Host, then assert candidates include only observed active/dispersing force units and have Standard force size even if the human difficulty is Explorer/Veteran. Move a Host unit outside `civ.visibility` and assert no candidate is emitted.

  ```ts
  expect(getCrisisDispatchCandidates(state, 'ai-1')).toContainEqual(
    expect.objectContaining({ kind: 'rogue-elephant-host', sourceId: hostForceId, targetUnitId: visibleElephant.id }),
  );
  expect(getCrisisDispatchCandidates(hiddenState, 'ai-1')).not.toContainEqual(
    expect.objectContaining({ targetUnitId: hiddenElephant.id }),
  );
  ```

  In DOM tests, render the city panel for two human players. Trigger the same state transition while the other player is current, switch `currentPlayer`, and assert only the owner sees warning/dispersal/reward text. Keep the selected elephant’s panel open across handler-death state update and assert command text disappears immediately.

  ```ts
  expect(collectText(openPanel)).toContain('Handler defeated: the scattered herds disperse in 3 turns.');
  expect(collectText(openPanel)).not.toContain('+20%');
  expect(collectText(otherPlayersPanel)).not.toContain('Rogue Elephant Host');
  ```

  The muted case sets `state.settings.soundEnabled = false` and asserts the same panel/status and recipient-queued text. Add a source-path regression that the two elephant registrars call only `ctx.notifier.deliver` and no audio director/SFX function; this verifies a hidden event cannot leak through sound. For reduced motion, assert the crisis path creates no animation/overlay DOM and retains its text-only panel/notification contract, so the browser preference cannot suppress information.

- [ ] **Step 2: Run focused parity tests and confirm failure.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-crisis-response.test.ts tests/systems/world-pressure-presentation.test.ts tests/ui/city-panel-crisis.test.ts tests/ui/selected-unit-info.test.ts
  ```

  Expected: failures identify any stale panel, viewer leak, hidden-information AI decision, or unsupported accessibility assertion.

- [ ] **Step 3: Fix only the shared owner of each failing fact.**

  - AI visibility failure: keep the filter in `getCrisisDispatchCandidates`; never grant the AI map-wide crisis knowledge.
  - panel staleness: make the live render path consume `getWorldPressurePresentationForViewer`/`getRogueElephantCommandFact` after the transition; do not cache prose in a DOM closure.
  - hot-seat leak: send through `ctx.notifier.deliver(targetCivId, ...)`, never a current-player toast.

  Maintain these negative boundaries:

  ```ts
  if (!isVisible(civ.visibility, unit.position)) continue;
  if (!host || host.targetCivId !== viewerId) return undefined;
  if (before?.phase !== 'dispersing' && after.phase === 'dispersing') { /* emit once */ }
  ```

- [ ] **Step 4: Run focused tests and the full #707 target set.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/ai/ai-crisis-response.ts src/systems/world-pressure-presentation.ts src/ui/city-panel.ts src/ui/selected-unit-info.ts
  bash scripts/run-with-mise.sh yarn test --run tests/core/turn-manager-crisis.test.ts tests/presentation/register-rogue-elephant-host-presentation.test.ts tests/ai/ai-crisis-response.test.ts tests/systems/crisis-force-system.test.ts tests/systems/stampede-route-system.test.ts tests/systems/stampede-system.test.ts tests/systems/rogue-elephant-host-system.test.ts tests/systems/elephant-crisis-audit.test.ts tests/systems/world-pressure-fairness.test.ts tests/systems/world-pressure-presentation.test.ts tests/storage/save-migrations.test.ts tests/ui/city-panel-crisis.test.ts tests/ui/selected-unit-info.test.ts
  ```

  Expected: all target tests pass; no test relies on `currentPlayer === 'player'`, `Math.random`, a full-map per-candidate scan, or an audio-only signal.

- [ ] **Step 5: Commit the parity coverage and any proven user-facing fix.**

  ```bash
  git add src/ai/ai-crisis-response.ts src/systems/world-pressure-presentation.ts src/ui/city-panel.ts src/ui/selected-unit-info.ts tests/ai/ai-crisis-response.test.ts tests/systems/world-pressure-presentation.test.ts tests/ui/city-panel-crisis.test.ts tests/ui/selected-unit-info.test.ts
  git commit -m "test(707): prove elephant crisis world parity"
  ```

## Task 5: Record audit evidence and complete repository verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-23-issue-707-elephant-crisis-audit.md`

- [ ] **Step 1: Add completed-matrix evidence to this plan.**

  Append an `## Audit Evidence` table with exactly these columns: `Seed`, `Era`, `Difficulty`, `Target`, `Crisis state`, `Regression test`, and `Result`. Add one row for each of `elephant-audit-1`, `elephant-audit-2`, and `elephant-audit-3`; record any production defect and the canonical owner that fixed it immediately below the table. State explicitly that schema remains 19 when no persisted shape changed.

- [ ] **Step 2: Inspect the full intended diff.**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  git diff
  ```

  Expected: no whitespace errors; every source change is covered by the target tests above; no unrelated #544 or local-main changes are included.

- [ ] **Step 3: Run build and durable suite separately.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: build exits 0; durable status reports a passing run for the current `HEAD` and working tree. If durable streaming output is incomplete, use the status result rather than starting a second suite.

- [ ] **Step 4: Commit the audit record.**

  ```bash
  git add docs/superpowers/plans/2026-08-23-issue-707-elephant-crisis-audit.md
  git commit -m "docs(707): record elephant crisis audit"
  ```

## Plan self-review

- Exact #547 values and outcomes map to Task 2; no tuning change is assumed.
- Save/load and malformed-state requirements map to Task 3, including schema 0, previous schema, current schema, and idempotence.
- Human/AI, difficulty, hot-seat, fog, muted/reduced-motion, panel refresh, and notification requirements map to Tasks 1 and 4.
- The only new user-facing behavior is the already-promised Host warning delivery, implemented once at the canonical before/after event boundary in Task 1.
- No new schema, dark code, private test hook, duplicate ID branch, visual/audio asset, or broad refactor is planned.

## Audit Evidence

| Seed | Era | Difficulty | Target | Crisis state | Regression test | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `rogue-host-turn-event-0…99` | 4 | Standard | human | scheduled warning | `turn-manager-crisis.test.ts` | warning event is emitted once at the scheduler boundary |
| `stampede-current-round-trip` | 3 | Standard | human | warning + committed route | `save-migrations.test.ts` | current-schema state and route survive idempotent normalization |
| `rogue-host-command` | 4 | Standard | human | active command link | `rogue-elephant-host-system.test.ts` | Handler’s +20% fact is limited to active range-two command |
| `rogue-host-break` | 4 | Standard | human | broken command/dispersal | `rogue-elephant-host-system.test.ts` | conversion, three-turn dispersal, cleanup, and one reward complete |
| `ai-1` visible/hidden Host | 9 | Veteran setting | AI | active Host | `ai-crisis-response.test.ts` | AI sees only visible crisis actors; Host force remains Standard severity |
| hot-seat `p1`/`p2` | 4 | Standard | human | warning/notification | `register-rogue-elephant-host-presentation.test.ts`, `city-panel.test.ts` | only the target receives a queued warning and panel status |

Production defects fixed during the audit:

- Host scheduling previously created a warning state without a target-scoped lifecycle event. `src/core/turn-manager.ts` now emits the canonical before/after transition and the Host registrar delivers it only to `targetCivId`.
- `startStampedeWarning` previously allowed a new Stampede while a Host was warning, active, or dispersing. The canonical Stampede entry point now preserves mutual exclusion for every caller.

Schema remains 19: the audit added no persisted fields and valid current-schema records normalize idempotently.
