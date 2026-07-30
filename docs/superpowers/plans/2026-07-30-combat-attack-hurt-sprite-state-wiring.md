# Combat Attack/Hurt Sprite State Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not use subagent-driven-development or any parallel-agent dispatch for this repo** — `CLAUDE.md`'s Agent Policy bans subagents/parallel agents outright; execute every task inline in the current session.

**Goal:** Make regular (non-pirate) unit combat actually trigger the `attack`/`hurt` DOM-overlay sprite animations that already exist in `sprite-animations-v2.css` and every v2-native/live-fallback unit sprite, but which currently never play for any combat outside the pirate system.

**Architecture:** `PirateSpriteStateController` (`src/renderer/pirate-sprite-state.ts`) already records a transient `attack`/`hurt`/`death` state for **every** combat's attacker/defender unconditionally — `RenderLoop.applyCombatVisual()` calls `this.pirateSpriteState.apply({ type: 'combat', ...result }, nowMs)` with no pirate-ownership check. The bug is entirely on the read side: `render()`'s real inline `unitEntities` builder (`src/renderer/render-loop.ts:616-648`) only ever reads that transient back via `this.pirateSpriteState.resolve(...)`, and only inside an `if (faction)` branch gated on the unit being pirate-owned. For every other unit, the already-recorded transient sits in the map, unread, until it expires. This plan adds a lightweight, non-pirate-specific read method and calls it as the fallback for every unit, matching the existing `visual?.state ?? ...` pattern already in place.

**Tech Stack:** TypeScript, Vitest (`node` environment by default; this plan's integration test needs `jsdom`, following the existing `// @vitest-environment jsdom` convention used by `tests/renderer/sprite-overlay.test.ts`).

## Global Constraints

- Do not touch `PirateSpriteVisualState`'s existing shape (`mode`/`damage`/`tier`/`stage` stay required, pirate-only fields) — the fix adds a new method, it does not change `resolve()`'s contract or any existing pirate call site.
- `SpriteEntity['state']` (`src/renderer/sprite-overlay.ts:46`) already includes `'attack'` and `'hurt'` in its union — no type change needed there.
- Every step's code must be complete and runnable as shown — this plan's exact diffs were prototyped and verified against this repo before being written down (see Verification Already Performed below), not guessed.
- Run `bash scripts/run-with-mise.sh yarn test` and `bash scripts/run-with-mise.sh yarn build` before considering this done (per `CLAUDE.md`'s pre-push requirement) — this plan's last task does that explicitly.

## Investigation Already Performed (context, not a task)

Traced the full pipeline end-to-end before writing this plan:

1. `resolveCombat()` (`src/systems/combat-system.ts:313`) runs for every real combat — player attacks (`src/main.ts:2989`), AI-prepared-turn combats (`src/core/turn-manager.ts:927,1170`), `ai-major-turn.ts:201`, `basic-ai.ts:396`, `pirate-system.ts:203`, `minor-civ-system.ts:476,831`.
2. Every one of those call sites emits `bus.emit('combat:resolved', { result, ... })` right after.
3. `src/main.ts:4559` is the one listener that turns that into a visual: `bus.on('combat:resolved', event => handleCombatResolvedEvent(gameState, event, { applyVisual: result => renderLoop.applyCombatVisual(result), ... }))`.
4. `RenderLoop.applyCombatVisual()` (`src/renderer/render-loop.ts:270-282`) calls `this.pirateSpriteState.apply({ type: 'combat', ...result }, nowMs)` **unconditionally** — this writes an `attack` transient for `result.attackerId` and a `hurt` transient for `result.defenderId` into `PirateSpriteStateController`'s internal `transients` map (`pirate-sprite-state.ts:63-72`), regardless of who owns either unit.
5. But the only place that map ever gets *read* is `render()`'s inline `unitEntities` builder (`render-loop.ts:616-648`): `const visual = faction ? this.pirateSpriteState.resolve(...) : null;` then `state: visual?.state ?? 'idle' as const`. `faction` comes from `this.state!.pirates?.factions[presentation.leadUnit.owner]` — for every unit that isn't pirate-owned, `faction` is `undefined`, so `visual` is always `null`, so `state` is always `'idle'`.
6. Confirmed via `grep -rn "state:\s*'attack'\|state:\s*'hurt'"` across all of `src/` outside `pirate-sprite-state.ts` — zero hits. No other code path ever sets these states for a regular unit.
7. `sprite-animations-v2.css` has a full CSS contract keyed on `data-state="attack"`/`data-state="hurt"` (muzzle flash, weapon swing, hit-spark, wound pose, per-`data-kind` variants like ranged bowstring and pike thrust) — none of it currently fires for non-pirate combat, even though every v2-native and live-fallback unit sprite supports it.
8. Checked for existing coverage before writing this plan: fetched `origin/main` (this worktree's `HEAD` already matched, no drift), `gh pr list --state open` returned zero open PRs, and `gh issue list --state open` was searched for `combat`/`sprite`/`animation`/`attack`/`hurt` — the closest hits were #760 (`buildUnitEntities()` is dead code — a *different* divergence: missing `civId` and pirate-visual-state resolution in the untested helper function, not this attack/hurt gap, and not about the *real* inline path at all), #364 (4-tier wound/damage-state art, a persistent-health visual, unrelated to momentary attack/hurt triggering), #622 (general placeholder audit, doesn't mention this), and #611 (serialization completeness, resolved by #755's live-fallback — not about state triggering). None cover this. The project's recorded "rejected on purpose" combat-mechanics list (project memory, battle-mechanics arc #546) doesn't include this either. This is a new, previously untracked gap.

## Cross-Dimension Review (performed before execution)

Reviewed against gameplay balance, fun, new mechanics, player ages 7-43, play styles, difficulty modes, AI usage, UI/UX, architecture, extensibility, data, SFX, save migration, testing, solo/hot-seat regressions, and implementation correctness. Two real issues found and fixed into this plan (Task 1 Step 3 and Task 1 Step 3.5 below); everything else was checked and found clean, recorded here so it isn't re-litigated:

- **Balance/difficulty/fun/new mechanics**: purely visual, zero combat-math change — `applyCombatVisual` fires identically regardless of difficulty setting or actor (human/AI/barbarian). No new mechanic, no balance risk. Net effect is positive "juice" (visible feedback for an action that already happens) with no downside.
- **Player ages 7-43**: grepped `sprite-animations-v2.css` and `units-v2.jsx` for `blood`/`gore` — zero hits. Effects are stylized sparks/flashes/weapon-swing motion, consistent with the game's existing all-ages art direction. No new age-appropriateness concern.
- **Play styles / AI usage**: feedback applies equally regardless of playstyle (aggressive or turtling) or actor; AI doesn't consume this signal, it's purely for the human viewer.
- **Hot-seat regressions**: the transient is a real-time ~420ms pulse keyed by unit id, not by viewer. Safe by construction — a hot-seat device hand-off takes far longer than 420ms in practice, and the existing `visibleToViewerIds` gate in `handleCombatResolvedEvent` (only calls `applyVisual` when the *current* player can see the combat) means a hidden combat never even writes a transient for a viewer who shouldn't see it. No fog-of-war leak.
- **Solo-play regressions**: covered by the full 831-test renderer suite re-run in Task 3, no change to any other code path.
- **UI/UX**: confirmed selection-ring/HP-bar/stack-count decorations (`updateUnitDecorations` in `sprite-overlay.ts:310+`) are sibling DOM nodes appended to the outer `wrapper`, not nested inside the animated `.cq-sprite-figure` — they won't jitter or misalign during the attack recoil/weapon-swing CSS animation.
- **Data / save migration**: transient combat state lives only in `RenderLoop`'s in-memory `PirateSpriteStateController`, never serialized to `GameState` — no save schema change, no migration needed.
- **SFX**: `sfx-director.ts` already listens to the same `combat:resolved` event independently for audio — this plan doesn't touch that path, so audio timing is unaffected (it was already firing correctly for non-pirate combat; only the *visual* was gapped).
- **Architecture/extensibility issue found and fixed**: `PirateSpriteStateController` had zero class-level documentation, and after this change it's no longer pirate-only — a future reader grepping for "pirate" could easily miss that it now drives all combat visuals. **Fix**: Task 1 Step 3 below now adds a class-level doc comment clarifying the dual role.
- **Accepted trade-off, not fixed (documented rather than silently ignored)**: `PirateSpriteStateController.transients` only prunes an entry when it's read again via `resolve()`/`resolveTransientState()`; a unit that dies immediately after combat (and so never renders again) leaves a small dangling entry forever. This already exists in the pirate path today — this plan extends the same characteristic to (a likely larger volume of) regular combat. Mitigating factor: entries are only created for combat visible to the *current* viewer (see hot-seat bullet above), which bounds growth to what one player session actually witnesses — realistic worst case is well under 1MB even in a very long session. Not worth adding cleanup/eviction machinery for; a future issue can revisit if it ever shows up in practice.
- **Out-of-scope pre-existing bug found, not fixed here**: `src/systems/air-operations-system.ts` calls `resolveCombat()` for air interception and air-strike resolution (lines 256 and 283) but never emits `bus.emit('combat:resolved', ...)` anywhere in that file — confirmed via `grep -n "bus.emit\|resolveCombat(" src/systems/air-operations-system.ts`. This means air combat today gets **no** visual feedback, **no** SFX, and **no** notification-log entry at all (all three listen to `combat:resolved`), independent of this plan. This plan's fix will not extend to air combat because the event that would trigger it is never fired. Flagging as a separate follow-up rather than folding it into this plan's scope.

## Verification Already Performed

Before writing this plan, the exact fix below was prototyped directly in this worktree, then reverted (only a plan was requested, not an implementation):
- `bash scripts/run-with-mise.sh yarn vitest run tests/renderer/pirate-sprite-state.test.ts` — 8/8 passed with the new method + tests.
- A real jsdom integration test (mounting a genuine `RenderLoop` + `SpriteOverlay` to a detached DOM node, calling `applyCombatVisual()` then the private `render()`, then reading the actual rendered `data-state` attribute off the DOM) — both assertions (`attack` on the attacker, `hurt` on the defender, and expiry back to `idle` after 420ms) passed.
- `bash scripts/run-with-mise.sh yarn vitest run tests/renderer/` — all 831 renderer tests still passed (no regression).
- `bash scripts/run-with-mise.sh yarn build` — exit 0.

This plan's code steps are the exact validated diffs, not a re-derivation.

## File Structure

- Modify `src/renderer/pirate-sprite-state.ts` — add `resolveTransientState(entityId, nowMs)` to `PirateSpriteStateController`, reusing the existing `transients` map with no new state.
- Modify `tests/renderer/pirate-sprite-state.test.ts` — add unit tests for the new method.
- Modify `src/renderer/render-loop.ts` — read the new method as the fallback for non-pirate units in the real inline `unitEntities` builder.
- Create `tests/renderer/render-loop-combat-sprite-state.test.ts` — new jsdom-environment integration test proving the fix end-to-end via real DOM output (the `render-loop-wrap.test.ts` file runs under the default `node` environment and mocks `window` manually — it cannot mount a real `SpriteOverlay`, so this needs its own file, following the `// @vitest-environment jsdom` convention already used by `tests/renderer/sprite-overlay.test.ts`).

---

### Task 1: Add `resolveTransientState` to `PirateSpriteStateController` (TDD)

**Files:**
- Modify: `src/renderer/pirate-sprite-state.ts:88-102` (after the existing `resolve()` method, before the class's closing brace)
- Modify: `tests/renderer/pirate-sprite-state.test.ts` (append after the final existing test)

**Interfaces:**
- Produces: `PirateSpriteStateController.resolveTransientState(entityId: string, nowMs: number): PirateSpriteState` — returns the bare transient state (`'idle' | 'walk' | 'attack' | 'hurt' | 'death'`) for any entity, with no pirate-specific persistent fields required. Task 2 calls this directly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/renderer/pirate-sprite-state.test.ts` (after the final `});` that closes the last existing `describe` block):

```ts
describe('resolveTransientState', () => {
  it('returns idle when there is no transient for the entity', () => {
    const controller = new PirateSpriteStateController();
    expect(controller.resolveTransientState('nobody', 0)).toBe('idle');
  });

  it('returns attack/hurt for a combat pair with no pirate-only persistent fields required', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'rifleman-1',
      defenderId: 'musketeer-2',
      attackerSurvived: true,
      defenderSurvived: true,
    }, 1_000);

    expect(controller.resolveTransientState('rifleman-1', 1_100)).toBe('attack');
    expect(controller.resolveTransientState('musketeer-2', 1_100)).toBe('hurt');
  });

  it('expires back to idle and deletes the transient once its window passes', () => {
    const controller = new PirateSpriteStateController();
    controller.apply({
      type: 'combat',
      attackerId: 'rifleman-1',
      defenderId: 'musketeer-2',
      attackerSurvived: true,
      defenderSurvived: false,
    }, 1_000);

    // defender died -- death lasts DEATH_STATE_MS (1200ms), not COMBAT_STATE_MS (420ms)
    expect(controller.resolveTransientState('musketeer-2', 1_500)).toBe('death');
    expect(controller.resolveTransientState('musketeer-2', 2_300)).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/pirate-sprite-state.test.ts
```

Expected: FAIL — `controller.resolveTransientState` is not a function.

- [ ] **Step 3: Add a class-level doc comment clarifying this controller's dual role (review fix)**

`PirateSpriteStateController` currently has no class-level documentation, and after Step 3.5 below it is no longer pirate-only — a future reader grepping for "pirate" could miss that it now drives all combat visuals. In `src/renderer/pirate-sprite-state.ts`, immediately above `export class PirateSpriteStateController {` (line 58), add:

```ts
/**
 * Despite the name, this controller now serves two audiences:
 *  - Pirates get the full `resolve()` path: a persistent mode/tier/stage visual state plus a
 *    transient attack/hurt/death overlay, because pirate factions have patrol/raid/blockade
 *    identity that regular units don't.
 *  - Every other unit (player, AI, barbarian, minor-civ) gets only the transient combat pulse,
 *    via `resolveTransientState()` — the same underlying `transients` map, just without the
 *    pirate-specific persistent fields. `RenderLoop.applyCombatVisual()` writes into this map
 *    unconditionally for every combat, regardless of which audience will end up reading it back.
 */
```

- [ ] **Step 3.5: Implement the method**

In `src/renderer/pirate-sprite-state.ts`, insert after `resolve()`'s closing brace (before the class's own closing `}` on line 102):

```ts
  /**
   * Bare transient state for entities that have no PirateSpriteVisualState (mode/tier/stage
   * don't apply to non-pirate units). applyCombatVisual() records an attack/hurt/death
   * transient for *every* combat's attacker/defender unconditionally, pirate or not — this is
   * the missing read side for everyone else, so the transient it already writes doesn't just
   * expire unread.
   */
  resolveTransientState(entityId: string, nowMs: number): PirateSpriteState {
    const transient = this.transients.get(entityId);
    if (!transient) return 'idle';
    if (transient.expiresAtMs !== undefined && transient.expiresAtMs <= nowMs) {
      this.transients.delete(entityId);
      return 'idle';
    }
    return transient.state;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/pirate-sprite-state.test.ts
```

Expected: PASS — 8 tests (5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pirate-sprite-state.ts tests/renderer/pirate-sprite-state.test.ts
git commit -m "feat(renderer): add PirateSpriteStateController.resolveTransientState for non-pirate combat states"
```

---

### Task 2: Wire the real render loop to read attack/hurt for every unit, not just pirates (TDD)

**Files:**
- Modify: `src/renderer/render-loop.ts:623-637`
- Create: `tests/renderer/render-loop-combat-sprite-state.test.ts`

**Interfaces:**
- Consumes: `PirateSpriteStateController.resolveTransientState(entityId, nowMs)` from Task 1.
- Produces: the `unitEntities` array built inside `RenderLoop`'s private `render()` method now carries `state: 'attack' | 'hurt'` for a unit that was just in combat, for both pirate and non-pirate owners — this flows into `this.spriteOverlay?.sync(...)` (`render-loop.ts:702-704`) exactly like every other entity field, and from there into the DOM's `data-state` attribute (`sprite-overlay.ts:174,224`), which is what the existing CSS in `sprite-animations-v2.css` keys off.

- [ ] **Step 1: Write the failing integration test**

Create `tests/renderer/render-loop-combat-sprite-state.test.ts`:

```ts
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/renderer/hex-renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hex-renderer')>();
  return {
    ...actual,
    drawHexMap: vi.fn(),
    drawRivers: vi.fn(),
    drawHexHighlight: vi.fn(),
    drawMinorCivTerritory: vi.fn(),
  };
});
vi.mock('@/renderer/fog-renderer', () => ({ drawFogOfWar: vi.fn() }));
vi.mock('@/renderer/city-renderer', () => ({ drawCities: vi.fn() }));
vi.mock('@/renderer/unit-renderer', () => ({
  drawUnits: vi.fn(),
  drawUnitPresentations: vi.fn(),
  drawUnitGlyph: vi.fn(),
}));
vi.mock('@/renderer/pirate-headquarters-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pirate-headquarters-presentation')>();
  return { ...actual, drawPirateHeadquartersMapPresentation: vi.fn() };
});

import { RenderLoop } from '@/renderer/render-loop';
import type { CombatResult, GameState, Unit } from '@/core/types';

function createMountedCanvas(): { canvas: HTMLCanvasElement; mount: HTMLDivElement } {
  const mount = document.createElement('div');
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    setTransform: vi.fn(), scale: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  };
  const canvas = {
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    parentElement: mount,
  } as unknown as HTMLCanvasElement;
  return { canvas, mount };
}

function buildTestState(attacker: Unit, defender: Unit): GameState {
  return {
    turn: 5,
    currentPlayer: 'player',
    map: { width: 5, height: 5, wrapsHorizontally: false, tiles: {}, rivers: [] },
    tribalVillages: {},
    minorCivs: {},
    cities: {},
    units: { [attacker.id]: attacker, [defender.id]: defender },
    civilizations: {
      player: {
        color: '#4a90d9',
        visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' } },
      },
    },
  } as unknown as GameState;
}

describe('render-loop — non-pirate combat sprite state', () => {
  it('reflects attack/hurt data-state for a regular unit combat via the DOM overlay', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult);

    (loop as unknown as { render: () => void }).render();

    const attackerWrap = mount.querySelector(`[data-entity-id="${attacker.id}"]`)?.firstElementChild;
    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(attackerWrap?.getAttribute('data-state')).toBe('attack');
    expect(defenderWrap?.getAttribute('data-state')).toBe('hurt');
  });

  it('returns to idle after the combat pulse window expires', () => {
    const { canvas, mount } = createMountedCanvas();
    const loop = new RenderLoop(canvas);

    const attacker = {
      id: 'rifleman-1', type: 'rifleman', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;
    const defender = {
      id: 'barbarian-1', type: 'warrior', owner: 'barbarian', position: { q: 1, r: 0 },
      movementPointsLeft: 2, health: 60, experience: 0, hasMoved: false, hasActed: false,
      isResting: false,
    } as unknown as Unit;

    loop.setGameState(buildTestState(attacker, defender));
    loop.camera.isHexVisible = () => true;

    const nowMs = 10_000;
    loop.applyCombatVisual({
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 10,
      defenderDamage: 40,
      attackerSurvived: true,
      defenderSurvived: true,
      attackerStrength: 10,
      defenderStrength: 6,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    } as CombatResult, nowMs);

    vi.spyOn(performance, 'now').mockReturnValue(nowMs + 1_000); // past COMBAT_STATE_MS (420ms)
    (loop as unknown as { render: () => void }).render();

    const defenderWrap = mount.querySelector(`[data-entity-id="${defender.id}"]`)?.firstElementChild;
    expect(defenderWrap?.getAttribute('data-state')).toBe('idle');
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/render-loop-combat-sprite-state.test.ts
```

Expected: FAIL — both `data-state` assertions get `'idle'` instead of `'attack'`/`'hurt'` (the real inline builder still only reads `pirateSpriteState` for pirate-owned units).

- [ ] **Step 3: Wire the fallback read in `render-loop.ts`**

In `src/renderer/render-loop.ts`, inside the `unitEntities = unitPresentations.map(presentation => { ... })` block (starts at line 616), change:

```ts
          : null;
        return {
          id: presentation.leadUnitId,
          memberIds: presentation.memberIds,
          kind: 'unit' as const,
          subtype: presentation.leadUnit.type,
          coord: presentation.coord,
          state: visual?.state ?? 'idle' as const,
          faction: presentation.faction,
```

to:

```ts
          : null;
        // Non-pirate units have no PirateSpriteVisualState (mode/tier/stage are pirate-only
        // concepts), but applyCombatVisual() records an attack/hurt/death transient for every
        // combat's attacker/defender unconditionally, pirate or not. Before this fix that
        // transient was only ever read back through the `faction ?` branch above, so it
        // silently expired unread for every non-pirate combat.
        const combatState = visual?.state
          ?? this.pirateSpriteState.resolveTransientState(presentation.leadUnitId, nowMs);
        return {
          id: presentation.leadUnitId,
          memberIds: presentation.memberIds,
          kind: 'unit' as const,
          subtype: presentation.leadUnit.type,
          coord: presentation.coord,
          state: combatState,
          faction: presentation.faction,
```

(`nowMs` is already in scope — it's computed once just above this block at `render-loop.ts:615`.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/render-loop-combat-sprite-state.test.ts
```

Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/render-loop.ts tests/renderer/render-loop-combat-sprite-state.test.ts
git commit -m "fix(renderer): trigger attack/hurt sprite states for non-pirate combat"
```

---

### Task 3: Full-suite verification and manual in-game check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full renderer test slice**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/renderer/
```

Expected: exit 0, all files passing (831 passed before this change; should be 833 after, +2 from Task 2's new file, plus the 3 added in Task 1's file).

- [ ] **Step 2: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: exit 0.

- [ ] **Step 3: Run the production build (type-check)**

```bash
bash scripts/run-with-mise.sh yarn build
```

Expected: exit 0.

- [ ] **Step 4: Manually verify in the dev server**

Start the dev server (`bash scripts/run-with-mise.sh yarn dev`), load or start a game, and attack an enemy unit (barbarian, minor civ, or another human/AI civ — any non-pirate combat). Confirm in the browser that:
- The attacker briefly shows its weapon-swing/muzzle-flash animation (whatever `data-state="attack"` art that unit type has).
- The defender briefly shows its hit-spark/wound-pose animation (`data-state="hurt"`).
- Neither pulse lingers past roughly half a second (`COMBAT_STATE_MS = 420` in `pirate-sprite-state.ts`), and the unit settles back to idle.
- No console errors, and pirate combat (if testable in the current save) still looks unchanged.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "fix(renderer): trigger attack/hurt sprite states for non-pirate combat" --body "$(cat <<'EOF'
## Summary
- `RenderLoop.applyCombatVisual()` already recorded an attack/hurt transient for every combat's attacker/defender unconditionally (pirate or not), but the real inline `unitEntities` builder in `render()` only ever read that transient back for pirate-owned units (`if (faction) ...`) — every regular combat (player vs AI, AI vs AI, vs barbarians, vs minor civs) silently kept `state: 'idle'` forever, so the existing `attack`/`hurt` CSS/art (muzzle flash, weapon swing, hit-spark, wound pose) never played outside the pirate system.
- Adds `PirateSpriteStateController.resolveTransientState(entityId, nowMs)` — a bare-state read with no pirate-only persistent fields required — and uses it as the fallback for non-pirate units in `render-loop.ts`.
- Confirmed via `grep -rn "state:\s*'attack'\|state:\s*'hurt'"` across `src/` (outside `pirate-sprite-state.ts`) that no other code path set these states before this change.
- Checked for existing coverage before writing the underlying plan: no open PR, and the closest open issues (#760 dead-code divergence, #364 wound-tier art, #611 serialization completeness) are all different gaps — this one was previously untracked.

## Test plan
- [x] `yarn vitest run tests/renderer/pirate-sprite-state.test.ts` — new `resolveTransientState` unit tests pass
- [x] `yarn vitest run tests/renderer/render-loop-combat-sprite-state.test.ts` — new real-DOM integration test proves attack/hurt now render and expire correctly for non-pirate units
- [x] `yarn vitest run tests/renderer/` — full renderer slice, no regressions
- [x] `yarn test` and `yarn build` both exit 0
- [x] Manually verified in dev server: regular combat now shows attack/hurt sprite animation, settles back to idle after ~420ms, no console errors
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** the gap has exactly two parts — (1) the missing generic read method, (2) the missing call site wiring it into the live render path. Both are covered, Task 1 and Task 2 respectively, each with its own TDD cycle.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code — and unlike the rifleman sprite-migration plan, every line of code here was actually executed against this repo before being written down (see Verification Already Performed), not just written by inspection.
- **Type/name consistency:** `resolveTransientState` (method name) is identical between its Task 1 definition and its Task 2 call site; `PirateSpriteState` (return type) is the type already exported from `pirate-sprite-state.ts` and already used as `SpriteEntity['state']`'s value set — no new type introduced.
- **Scope discipline:** this plan does not rename `PirateSpriteStateController` or generalize its pirate-specific `mode`/`tier`/`stage` concepts to non-pirate units — those genuinely don't apply outside pirates, and forcing them onto regular units would be new, unrequested scope. It also does not touch `buildMovingUnitEntities` (hardcodes `state: 'walk'`) — units don't move onto their attack target in this game's combat model, so a moving unit and an attacking unit are mutually exclusive states in practice; extending this fix there would be solving a case that doesn't occur.
- **Known pre-existing limitation, not introduced by this plan:** both the pirate path and this fix key the transient lookup by `presentation.leadUnitId` — if a stack's *lead* unit isn't the specific unit that fought (a non-lead stack member attacked or was attacked), the visual would apply to the wrong sprite in the stack. This is an existing assumption already present in the pirate code this plan mirrors, not a new bug.
