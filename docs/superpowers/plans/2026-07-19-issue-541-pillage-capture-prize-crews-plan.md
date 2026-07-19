# Pillage, Civilian Capture & Prize Crews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not use subagent-driven-development or any subagent dispatch for this plan** — this repository's CLAUDE.md forbids parallel/subagent execution; every task must be executed inline in the current session.

**Goal:** Give economic warfare a verb — a combat unit can pillage an enemy improvement/road for gold, defeated civilians (land and naval trade) are captured instead of killed, and decisively-won naval battles capture the enemy hull instead of sinking it — wired through the same shared helpers the player, AI civs, and barbarians all use.

**Architecture:** Four independently-shippable MRs, each ending in its own PR. MR1 (Pillage) is a new `pillage-system.ts` module plus a UI action button — no dependency on capture. MR2 (Civilian Capture) generalizes the existing `cyber_unit` ownership-transfer branch in `combat-reward-system.ts` from a single hardcoded type check to a `UNIT_CLASS_BY_TYPE`-driven check, and fixes a genuine gap this generalization exposes: four call sites that clean up trade routes strictly on "unit died," which capture bypasses by design. MR3 (Prize Crews) extends `CombatResult` with the strength numbers already computed internally by `resolveCombat`, then adds a second, naval-military capture branch reusing MR2's plumbing. MR4 (AI & Difficulty) wires pillage into barbarian raid plans (which already navigate to resource tiles and today do nothing on arrival) and adds a new AI decision loop plus one difficulty-profile field.

**Tech Stack:** TypeScript, Canvas 2D renderer, Vite, Vitest. Plain-object `GameState`, immutable turn processing (spread-copy, never mutate in place). Deterministic (seeded) RNG only — this feature adds zero new randomness.

**Spec:** `docs/superpowers/specs/2026-07-19-issue-541-pillage-capture-prize-crews-design.md` (issue #541). Read it before Task 1 — code snippets below assume its terminology (civilian capture, prize crews, era-scaled flavor).

## Global Constraints

- `GOLD_PER_PILLAGE_BUILD_TURN = 3` — pillage gold is `round(IMPROVEMENT_BUILD_TURNS[type] * 3)`. Never build a second hand-authored gold table.
- Pillage heals the pillaging unit +25 HP, capped at 100, and consumes the unit's full action (`hasActed: true`, `movementPointsLeft: 0`).
- Pillage eligibility is exactly `tile.owner !== unit.owner` — no separate "own territory" special case; this is structurally impossible under that inequality and must not be reimplemented.
- Civilian capture is **deterministic** — no RNG. A defeated, unescorted `UnitClass: 'civilian'` unit is *always* captured, never destroyed, never given an escape chance.
- Captured units keep their own type, **except** `settler` → `worker`. Capture changes only `owner` (and `type` for settler) — no health reset, no forced `hasActed`, matching the existing `cyber_unit` branch exactly. Do not reuse `applyUpgrade` — that helper resets health/hasActed for a *voluntary* in-city upgrade, which is the wrong semantics here.
- Prize-crew (naval military) capture is also deterministic: `loserStrength <= winnerStrength * 0.5 && winnerHealthAfter >= 50`. Applies to every naval military unit type at every era, **except** `beast_sea_serpent` (legendary beast, not a player-ownable hull).
- Pillaging an enemy tile is an act of war for the player, exactly like attacking a unit: call `ensurePlayerWarState(tile.owner)` before pillaging, skipping it when `tile.owner` is `null` or `'barbarian'`. AI civs only pillage civs they are *already* at war with (no auto-declare — pillage must not spontaneously start new AI wars). Barbarians need no war check at all (always-hostile, existing convention).
- No settings toggle to disable pillage/capture. No save migration for any of this — every new field is either a plain constant, a return-type interface field, or a `HexTile`/`OpponentChallengeProfile` field with a safe default.
- `yarn build` and `yarn test` must both exit 0 before every `git push` / `gh pr create` (project convention, enforced by the pre-push hook, but confirm locally first — it's faster to catch here).

---

## MR1 — Pillage

### Task 1: Pillage system core

**Files:**
- Create: `src/systems/pillage-system.ts`
- Test: `tests/systems/pillage-system.test.ts`

**Interfaces:**
- Consumes: `IMPROVEMENT_BUILD_TURNS: Record<ImprovementType, number>` from `@/systems/improvement-system`; `UNIT_DEFINITIONS` from `@/systems/unit-system`; `hexKey` from `@/systems/hex-utils`; `GameState`, `HexTile`, `ImprovementType` from `@/core/types`.
- Produces: `GOLD_PER_PILLAGE_BUILD_TURN: number`, `getPillageGoldReward(improvement: ImprovementType): number`, `canPillageTile(tile: HexTile | undefined, unitOwner: string): boolean`, `applyPillageToState(state: GameState, unitId: string): PillageResult`, `type PillageBlockerReason = 'missing-unit' | 'no-strength' | 'already-acted' | 'own-tile' | 'nothing-to-pillage'`, `interface PillageResult { ok: boolean; state: GameState; reason?: PillageBlockerReason; goldAwarded?: number; improvementPillaged?: ImprovementType | null; roadPillaged?: boolean }`. Task 2 (UI) and Task 11 (barbarians) and Task 12 (AI) all call `applyPillageToState` and `canPillageTile` directly — do not change these names/shapes without updating those tasks.

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/pillage-system.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createUnit } from '@/systems/unit-system';
import {
  applyPillageToState,
  canPillageTile,
  getPillageGoldReward,
  GOLD_PER_PILLAGE_BUILD_TURN,
} from '@/systems/pillage-system';
import type { GameState, HexTile } from '@/core/types';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeTile(overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord: { q: 1, r: 0 },
    terrain: 'plains',
    elevation: 'lowland',
    resource: null,
    improvement: 'farm',
    owner: 'ai-1',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    hasRoad: false,
    ...overrides,
  };
}

function makePillageState(tileOverrides: Partial<HexTile> = {}): GameState {
  const unit = { ...createUnit('warrior', 'player', { q: 1, r: 0 }, mkC()), id: 'raider' };
  const tile = makeTile(tileOverrides);
  return {
    turn: 5,
    era: 1,
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: { '1,0': tile } },
    units: { raider: unit },
    cities: {},
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#fff', isHuman: true, civType: 'rome',
        cities: [], units: ['raider'],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 10,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
      'ai-1': {
        id: 'ai-1', name: 'AI', color: '#d94a4a', isHuman: false, civType: 'egypt',
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 1 } },
      },
    },
  } as unknown as GameState;
}

describe('pillage-system', () => {
  describe('getPillageGoldReward', () => {
    it('derives gold from IMPROVEMENT_BUILD_TURNS, not a hand-authored table', () => {
      expect(getPillageGoldReward('farm')).toBe(4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(getPillageGoldReward('oil_well')).toBe(5 * GOLD_PER_PILLAGE_BUILD_TURN);
    });
  });

  describe('canPillageTile', () => {
    it('is true for an enemy tile with a finished improvement', () => {
      expect(canPillageTile(makeTile({ owner: 'ai-1' }), 'player')).toBe(true);
    });

    it('is false when the tile is owned by the pillaging unit\'s own civ', () => {
      expect(canPillageTile(makeTile({ owner: 'player' }), 'player')).toBe(false);
    });

    it('is true for a null-owner (unclaimed) tile with a finished improvement', () => {
      expect(canPillageTile(makeTile({ owner: null }), 'player')).toBe(true);
    });

    it('is false when the improvement is mid-construction and there is no road', () => {
      expect(canPillageTile(makeTile({ improvementTurnsLeft: 2, hasRoad: false }), 'player')).toBe(false);
    });

    it('is true for a road-only tile with no finished improvement', () => {
      expect(canPillageTile(makeTile({ improvement: 'none', improvementTurnsLeft: 0, hasRoad: true }), 'player')).toBe(true);
    });

    it('is false for a missing tile', () => {
      expect(canPillageTile(undefined, 'player')).toBe(false);
    });
  });

  describe('applyPillageToState', () => {
    it('clears the improvement, awards gold, and heals the unit', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      const result = applyPillageToState(state, 'raider');

      expect(result.ok).toBe(true);
      expect(result.goldAwarded).toBe(4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(result.improvementPillaged).toBe('farm');
      expect(result.state.map.tiles['1,0'].improvement).toBe('none');
      expect(result.state.map.tiles['1,0'].improvementTurnsLeft).toBe(0);
      expect(result.state.civilizations.player.gold).toBe(10 + 4 * GOLD_PER_PILLAGE_BUILD_TURN);
      expect(result.state.units.raider.health).toBe(100);
      expect(result.state.units.raider.hasActed).toBe(true);
      expect(result.state.units.raider.movementPointsLeft).toBe(0);
    });

    it('also clears a road present on the same tile, in the same action', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1', hasRoad: true });
      const result = applyPillageToState(state, 'raider');

      expect(result.roadPillaged).toBe(true);
      expect(result.state.map.tiles['1,0'].hasRoad).toBe(false);
    });

    it('caps healing at 100', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      state.units.raider = { ...state.units.raider, health: 90 };
      const result = applyPillageToState(state, 'raider');
      expect(result.state.units.raider.health).toBe(100);
    });

    it('refuses to pillage a self-owned tile', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'player' });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('own-tile');
      expect(result.state).toBe(state);
    });

    it('refuses to pillage a mid-construction improvement with no road', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1', improvementTurnsLeft: 2 });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('nothing-to-pillage');
    });

    it('refuses to act twice — hasActed blocks a second pillage', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      state.units.raider = { ...state.units.raider, hasActed: true };
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('already-acted');
    });

    it('refuses to pillage with a non-combat unit (0 strength)', () => {
      const state = makePillageState({ improvement: 'farm', owner: 'ai-1' });
      const worker = { ...createUnit('worker', 'player', { q: 1, r: 0 }, mkC()), id: 'raider' };
      state.units = { raider: worker };
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no-strength');
    });

    it('awards zero gold for a road-only tile (no finished improvement)', () => {
      const state = makePillageState({ improvement: 'none', owner: 'ai-1', hasRoad: true });
      const result = applyPillageToState(state, 'raider');
      expect(result.ok).toBe(true);
      expect(result.goldAwarded).toBe(0);
      expect(result.improvementPillaged).toBeNull();
      expect(result.state.map.tiles['1,0'].hasRoad).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pillage-system.test.ts`
Expected: FAIL — `Cannot find module '@/systems/pillage-system'`.

- [ ] **Step 3: Write the implementation**

Create `src/systems/pillage-system.ts`:

```typescript
import type { GameState, HexTile, ImprovementType } from '@/core/types';
import { IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';

/** Deliberately flat, non-era-scaled — matches calculateDefeatReward's baseGold
 * convention (combat-reward-system.ts). Subject to the pacing-audit gate, not
 * fixed by this file; update this single constant to retune, never add a
 * second per-improvement gold table. */
export const GOLD_PER_PILLAGE_BUILD_TURN = 3;

export function getPillageGoldReward(improvement: ImprovementType): number {
  return Math.round(IMPROVEMENT_BUILD_TURNS[improvement] * GOLD_PER_PILLAGE_BUILD_TURN);
}

/** A tile can be pillaged only if it is not currently owned by the pillaging
 * unit's own civ (covers enemy, unclaimed/null, and barbarian-owned tiles
 * uniformly) and has a finished improvement and/or a road. */
export function canPillageTile(tile: HexTile | undefined, unitOwner: string): boolean {
  if (!tile) return false;
  if (tile.owner === unitOwner) return false;
  const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
  return hasFinishedImprovement || Boolean(tile.hasRoad);
}

export type PillageBlockerReason =
  | 'missing-unit'
  | 'no-strength'
  | 'already-acted'
  | 'own-tile'
  | 'nothing-to-pillage';

export interface PillageResult {
  ok: boolean;
  state: GameState;
  reason?: PillageBlockerReason;
  goldAwarded?: number;
  improvementPillaged?: ImprovementType | null;
  roadPillaged?: boolean;
}

/** Burns whatever is on the pillaging unit's tile (finished improvement
 * and/or road) in one action: gold reward, +25 heal (capped at 100), and the
 * unit's action is fully consumed. War declaration (an act-of-war
 * consequence) is the caller's responsibility — this is a pure state
 * transition, reused identically by the player UI, AI civs, and barbarians. */
export function applyPillageToState(state: GameState, unitId: string): PillageResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (UNIT_DEFINITIONS[unit.type].strength <= 0) return { ok: false, state, reason: 'no-strength' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };

  const tileKey = hexKey(unit.position);
  const tile = state.map.tiles[tileKey];
  if (!tile || tile.owner === unit.owner) return { ok: false, state, reason: 'own-tile' };

  const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
  const hasRoad = Boolean(tile.hasRoad);
  if (!hasFinishedImprovement && !hasRoad) return { ok: false, state, reason: 'nothing-to-pillage' };

  const goldAwarded = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
  const improvementPillaged = hasFinishedImprovement ? tile.improvement : null;

  const nextTile: HexTile = {
    ...tile,
    improvement: hasFinishedImprovement ? 'none' : tile.improvement,
    improvementTurnsLeft: hasFinishedImprovement ? 0 : tile.improvementTurnsLeft,
    hasRoad: false,
  };

  const civ = state.civilizations[unit.owner];
  const civilizations = civ
    ? { ...state.civilizations, [unit.owner]: { ...civ, gold: civ.gold + goldAwarded } }
    : state.civilizations;

  const units = {
    ...state.units,
    [unitId]: {
      ...unit,
      health: Math.min(100, unit.health + 25),
      hasActed: true,
      movementPointsLeft: 0,
    },
  };

  const nextState: GameState = {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [tileKey]: nextTile } },
    civilizations,
    units,
  };

  return { ok: true, state: nextState, goldAwarded, improvementPillaged, roadPillaged: hasRoad };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pillage-system.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/pillage-system.ts tests/systems/pillage-system.test.ts
git commit -m "feat(combat): add pillage-system core (#541)"
```

---

### Task 2: Pillage UI — button, war declaration, confirm, notification

**Files:**
- Modify: `src/ui/selected-unit-info.ts` (add `onPillage` callback + button, near the existing Fortify block at line ~662)
- Modify: `src/main.ts` (add `pillage-system` import, `onPillage` handler near the existing `onFortify` handler at line ~2054)
- Test: `tests/ui/selected-unit-info.test.ts` (extend — check this file exists first: `ls tests/ui/selected-unit-info.test.ts`)

**Interfaces:**
- Consumes: `canPillageTile`, `applyPillageToState`, `getPillageGoldReward` from `@/systems/pillage-system` (Task 1); `getImprovementDisplayName` from `@/systems/improvement-system` (already imported in both files); `isMajorCivOwner` from `@/core/owner-kind`.
- Produces: `SelectedUnitInfoCallbacks.onPillage?: (unitId: string) => void`.

- [ ] **Step 1: Write the failing test**

First run `ls tests/ui/selected-unit-info.test.ts` to confirm the file exists, then open it and find the `describe` block nearest the existing Fortify button test (search for `'Fortify'`) to match its exact rendering-test style (likely constructs a container `div`, calls `renderSelectedUnitInfo`, and asserts on `container.textContent`/`querySelector`). Add a new test block immediately after it:

```typescript
it('shows a Pillage button for a combat unit standing on a pillageable enemy tile', () => {
  const state = /* reuse this file's existing state-fixture helper, override: */
    /* - state.units[unitId] = a strength>0 unit (e.g. warrior) at the tile's coord */
    /* - state.map.tiles[hexKey(coord)] = { ...existing tile, owner: 'ai-1', improvement: 'farm', improvementTurnsLeft: 0 } */
    /* build via the file's existing helper rather than a new one — do not duplicate the fixture */;
  const container = document.createElement('div');
  const onPillage = vi.fn();

  renderSelectedUnitInfo(container, state, unitId, { onPillage });

  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Pillage');
  expect(button).toBeDefined();
  button!.click();
  expect(onPillage).toHaveBeenCalledWith(unitId);
});

it('hides the Pillage button when the tile is the unit\'s own territory', () => {
  const state = /* same fixture, but tile.owner === the unit's own owner */;
  const container = document.createElement('div');

  renderSelectedUnitInfo(container, state, unitId, { onPillage: vi.fn() });

  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Pillage');
  expect(button).toBeUndefined();
});
```

Adapt the two placeholder fixture lines to this file's actual existing helper function and imports (`vi` from `vitest`, `hexKey` from `@/systems/hex-utils` if needed) — every other test in this file already builds a `GameState` and calls `renderSelectedUnitInfo` the same way; match that pattern exactly rather than inventing a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: FAIL — no button with text `'Pillage'` found.

- [ ] **Step 3: Add the callback and button to selected-unit-info.ts**

In `src/ui/selected-unit-info.ts`, add the import and callback field:

```typescript
import { canPillageTile } from '@/systems/pillage-system';
```

In `SelectedUnitInfoCallbacks` (near `onFortify?: (unitId: string) => void;` at line 71):

```typescript
  onPillage?: (unitId: string) => void;
```

In the render function, immediately before the existing Fortify block (`if (def.strength > 0 && callbacks.onFortify) {` at line ~662):

```typescript
  if (def.strength > 0 && !unit.hasActed && callbacks.onPillage && canPillageTile(tile, unit.owner)) {
    actionsDiv.appendChild(makeButton('Pillage', '#8b2635', () => callbacks.onPillage!(unitId)));
  }

```

(`tile` is already computed at the top of the function via `const tile = state.map.tiles[hexKey(unit.position)];` — reuse it, do not recompute.)

- [ ] **Step 4: Wire the handler in main.ts**

Add the import near the existing `improvement-system` import (line ~34):

```typescript
import { applyPillageToState, canPillageTile, getPillageGoldReward } from '@/systems/pillage-system';
```

In the callbacks object passed to `renderSelectedUnitInfo`, immediately after the existing `onFortify: uid => { ... }` block (line ~2067):

```typescript
      onPillage: uid => {
        const unit = gameState.units[uid];
        if (!unit || unit.owner !== gameState.currentPlayer) return;
        const tile = gameState.map.tiles[hexKey(unit.position)];
        if (!tile || !canPillageTile(tile, unit.owner)) return;

        const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
        const goldPreview = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
        const targetLabel = hasFinishedImprovement ? getImprovementDisplayName(tile.improvement) : 'the road';
        const preview = `Pillage ${targetLabel}?\n\n+${goldPreview} gold, unit heals +25 HP.`;
        if (!window.confirm(preview)) return;

        if (tile.owner && isMajorCivOwner(tile.owner)) {
          ensurePlayerWarState(tile.owner);
        }

        const result = applyPillageToState(gameState, uid);
        if (!result.ok) return;
        gameState = result.state;
        showNotification(`Pillaged ${targetLabel} for ${result.goldAwarded} gold.`, 'success');
        renderLoop.setGameState(gameState);
        updateHUD();
        selectUnit(uid);
      },
```

Add `isMajorCivOwner` to the existing `@/core/owner-kind` import in `main.ts` if it is not already imported (grep for `isMajorCivOwner` in `main.ts` first — `ensurePlayerWarState` already uses it internally, so it is very likely already imported at module scope; only add it if the grep comes back empty).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 (confirms `main.ts` and `selected-unit-info.ts` type-check — `yarn test` does not run `tsc`).

- [ ] **Step 6: Commit**

```bash
git add src/ui/selected-unit-info.ts src/main.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(combat): wire Pillage action into unit panel + war declaration (#541)"
```

---

### Task 3: Inline dimensional review — MR1, then open PR

Perform this review against the actual diff (`git diff main...HEAD` or equivalent), not from memory. Fix anything it finds before opening the PR — do not open the PR with known issues outstanding.

- [ ] **Step 1: Review checklist**

Go through each dimension against the real MR1 diff and note pass/fail:

- **Balancing gameplay / fun:** confirm `GOLD_PER_PILLAGE_BUILD_TURN = 3` produces 9–15 gold across all 9 improvement types (`farm` 4→12, `mine` 5→15, `lumber_camp` 5→15, `watermill` 5→15, `plantation` 4→12, `pasture` 3→9, `camp` 3→9, `quarry` 5→15, `oil_well` 5→15) — proportionate to `calculateDefeatReward`'s 4/8 baseline, not economy-warping.
- **New mechanics / architecture / extensibility:** `applyPillageToState` is a pure `(state, unitId) => result` function with no UI/AI-specific branching — confirm Task 1's tests exercise it directly with no DOM/AI involved, so it is provably reusable by MR4's AI and barbarian call sites later.
- **Player ages 7–43 / different play styles:** confirm the confirm-dialog wording (`Pillage {name}? +{N} gold, unit heals +25 HP.`) states the consequence and reward in plain language before the irreversible action — no jargon, no color-only signal.
- **Difficulty modes:** confirm nothing in this MR reads `opponentChallenge` — pillage rules must be identical for the human player at every difficulty (that's MR4's barbarian/AI frequency knob, not a player-facing rule).
- **Computer players:** confirm this MR does *not* yet wire pillage into any AI or barbarian code path (that's MR4) — if it does, that's scope creep for this MR and should be reverted here.
- **UI / UX:** confirm the Pillage button only renders when `canPillageTile` is true and `!unit.hasActed` — spot-check that a unit that already acted this turn (e.g. after moving with 0 `movementPointsLeft` doesn't block it, but `hasActed: true` does) does not show the button.
- **Data / saves:** confirm no new field was added to any persisted type — `pillage-system.ts` only reads/writes existing `HexTile`/`Unit`/`Civilization` fields. Also confirm the "consumers of `improvement`/`improvementTurnsLeft`" audit the spec calls for: `tests/systems/resource-acquisition-system.test.ts` already has a passing test asserting `improvement: 'none'` yields no resource (pillage produces exactly that state shape, pre-verified safe); spot-check `city-work-system.ts` and `quest-objective-system.ts` the same way — grep each for `.improvement` reads and confirm none assume an improvement persists once set to `'none'`.
- **SFX:** none added in this MR (spec says reuse existing raze/fire stingers later — no bespoke SFX work is in scope here).
- **Testing:** confirm `yarn vitest run tests/systems/pillage-system.test.ts tests/ui/selected-unit-info.test.ts` and `yarn build` both pass.
- **Solo-play regressions:** run the full suite (`bash scripts/run-with-mise.sh yarn test`) and confirm no unrelated test broke — pillage touches shared files (`selected-unit-info.ts`, `main.ts`) that many other UI tests import.
- **Hot-seat regressions:** confirm `onPillage`'s `gameState.currentPlayer` ownership check (`unit.owner !== gameState.currentPlayer`) matches the exact guard pattern already used by `onFortify` immediately above it — a hot-seat player must never be able to pillage with a unit they don't currently control.
- **Proper implementation:** confirm `ensurePlayerWarState` is called before `applyPillageToState`, not after — pillaging must count as the war-declaring act, same ordering as `executeAttack`.

- [ ] **Step 2: Fix any issues found in Step 1, re-run the affected tests, and commit fixes**

If Step 1 found nothing to fix, skip this step.

- [ ] **Step 3: Final verification**

Run: `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
Run: `bash scripts/run-with-mise.sh yarn build` — expect exit 0.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(combat): pillage action (#541 MR1)" --body "$(cat <<'EOF'
## Summary
- Adds `pillage-system.ts`: a combat unit standing on a non-owned tile can burn its finished improvement and/or road for gold (derived from IMPROVEMENT_BUILD_TURNS, not a hand-authored table) plus a +25 heal.
- Wires a Pillage button into the unit panel with a confirm-on-tap preview (no-silent-destructive-UI rule) and auto-declares war on the target civ, same as attacking.

## Test plan
- [x] `yarn vitest run tests/systems/pillage-system.test.ts tests/ui/selected-unit-info.test.ts`
- [x] `yarn test` (full suite)
- [x] `yarn build`
- [x] Inline dimensional review completed (see plan Task 3)

Part of the #541 pillage/capture/prize-crews arc — see docs/superpowers/plans/2026-07-19-issue-541-pillage-capture-prize-crews-plan.md.
EOF
)"
```

---

## MR2 — Civilian Capture

### Task 4: Generalize the capture branch + settler→worker + escort-protection test

**Files:**
- Modify: `src/systems/combat-reward-system.ts`
- Test: `tests/systems/combat-reward-system.test.ts` (extend)

**Interfaces:**
- Consumes: `UNIT_CLASS_BY_TYPE` from `@/systems/unit-modifier-definitions` (new import); `selectDefenderForAttack` from `@/systems/combat-system` (already exists, for the escort test only).
- Produces: `CombatOutcomeApplication.attackerCaptured: boolean`, `CombatOutcomeApplication.defenderCaptured: boolean` — Task 5 (trade-route fix) and MR3 Task 8 (prize crews) both read these two new fields; do not rename them.

- [ ] **Step 1: Write the failing tests**

Open `tests/systems/combat-reward-system.test.ts` and add these `it` blocks inside the existing `describe('applyCombatOutcomeToState', ...)` block, reusing the file's existing `makeRewardState()` helper:

```typescript
  it('captures an unescorted worker instead of destroying it, transferring civ.units[] both ways', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'worker', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(false);
    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units.defender.owner).toBe('player');
    expect(applied.state.units.defender.type).toBe('worker');
    expect(applied.state.civilizations.player.units).toContain('defender');
    expect(applied.state.civilizations['ai-1'].units).not.toContain('defender');
  });

  it('downgrades a captured settler to worker, keeping health/hasActed unchanged from before combat', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'settler', owner: 'ai-1', health: 77, hasActed: false };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.defender.type).toBe('worker');
    expect(applied.state.units.defender.health).toBe(77);
    expect(applied.state.units.defender.hasActed).toBe(false);
  });

  it('keeps a captured caravan as a caravan (no type downgrade beyond settler)', () => {
    const state = makeRewardState();
    state.units.defender = { ...state.units.defender, type: 'caravan', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.state.units.defender.type).toBe('caravan');
    expect(applied.defenderCaptured).toBe(true);
  });

  it('captures a losing attacker civilian too (attacker-loses side), mirroring the defender side', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'worker', owner: 'player' };
    state.civilizations.player.units = ['attacker'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 100, defenderDamage: 0,
      attackerSurvived: false, defenderSurvived: true,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.attackerDefeated).toBe(false);
    expect(applied.attackerCaptured).toBe(true);
    expect(applied.state.units.attacker.owner).toBe('ai-1');
  });

  it('still destroys a defeated combat unit — capture only applies to civilian-class units', () => {
    const state = makeRewardState();
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.defenderCaptured).toBe(false);
    expect(applied.state.units.defender).toBeUndefined();
  });
```

Then add a new top-level `describe` block in the same file for the escort-protection guarantee (this exercises existing `combat-system.ts` code, proving the "no new code needed" claim rather than just asserting it):

```typescript
describe('escort protection (civilian capture precondition)', () => {
  it('never selects an unescorted civilian\'s escort — the combat unit always defends the stack', () => {
    const civilian = { ...createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'civilian' };
    const escort = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'escort' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const defender = selectDefenderForAttack([civilian, escort], map);

    expect(defender?.id).toBe('escort');
  });

  it('selects the civilian only when it is alone on its tile', () => {
    const civilian = { ...createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'civilian' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const defender = selectDefenderForAttack([civilian], map);

    expect(defender?.id).toBe('civilian');
  });
});
```

Add `selectDefenderForAttack` to this file's existing `@/systems/combat-system` import if it is not already imported (check the top of the file first).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-reward-system.test.ts`
Expected: FAIL — `applied.defenderCaptured` is `undefined` (property doesn't exist yet), and the settler/caravan capture assertions fail because the current code still destroys civilians via `removeUnitFromCopies`. The escort-protection tests should already PASS (no new code needed for those) — confirm they do, since that's the point.

- [ ] **Step 3: Generalize the capture branches in combat-reward-system.ts**

Add the import:

```typescript
import { UNIT_CLASS_BY_TYPE } from '@/systems/unit-modifier-definitions';
```

Update `CombatOutcomeApplication` (near the top of the file):

```typescript
export interface CombatOutcomeApplication {
  state: GameState;
  rewards: CombatReward[];
  attackerDefeated: boolean;
  defenderDefeated: boolean;
  attackerCaptured: boolean;
  defenderCaptured: boolean;
  questTransitions: ChainTransition[];
  pirateEvents: PirateActionEvent[];
}
```

Update the early-return guard (the `if (!attackerBefore || !defenderBefore)` block):

```typescript
  if (!attackerBefore || !defenderBefore) {
    return { state, rewards: [], attackerDefeated: false, defenderDefeated: false, attackerCaptured: false, defenderCaptured: false, questTransitions: [], pirateEvents: [] };
  }
```

Add the two new local flags next to the existing ones:

```typescript
  let attackerActuallyDefeated = !result.attackerSurvived;
  let defenderActuallyDefeated = !result.defenderSurvived;
  let attackerCaptured = false;
  let defenderCaptured = false;
```

Replace the attacker-side `cyber_unit` branch:

```typescript
  } else if (attackerBefore.type === 'cyber_unit') {
```

with:

```typescript
  } else if (UNIT_CLASS_BY_TYPE[attackerBefore.type].includes('civilian')) {
    // Civilian capture: transfer ownership instead of destroying. Covers cyber_unit
    // (already tagged 'civilian') and every other civilian type uniformly — settler
    // downgrades to worker so a captured settler can't hand the capturing civ a free
    // city-founding unit. No other field resets: health/hasActed/movementPointsLeft
    // carry over exactly as they were, matching this branch's pre-existing behavior.
    const capturedType = attackerBefore.type === 'settler' ? 'worker' : attackerBefore.type;
    units[result.attackerId] = { ...attackerBefore, type: capturedType, owner: defenderBefore.owner };
```

(keep the existing `civilizations = { ... }` block and `attackerActuallyDefeated = false;` line unchanged immediately below — only the condition and the `units[result.attackerId] = ...` line change), then add one line right after `attackerActuallyDefeated = false;`:

```typescript
    attackerCaptured = true;
  } else {
```

Repeat the identical change for the defender-side branch (`} else if (defenderBefore.type === 'cyber_unit') {` → `} else if (UNIT_CLASS_BY_TYPE[defenderBefore.type].includes('civilian')) {`, with `capturedType`/`type: capturedType` using `defenderBefore.type`/`attackerBefore.owner`, and `defenderCaptured = true;` added after `defenderActuallyDefeated = false;`).

Update the final `return` statement:

```typescript
  return {
    state: nextState,
    rewards,
    attackerDefeated: attackerActuallyDefeated,
    defenderDefeated: defenderActuallyDefeated,
    attackerCaptured,
    defenderCaptured,
    questTransitions,
    pirateEvents,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-reward-system.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 — this confirms every existing caller of `CombatOutcomeApplication` still compiles with the two new required fields (TypeScript will error at any destructuring/construction site that built this object manually and forgot them; there should be none, since the only producer is `applyCombatOutcomeToState` itself).

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat-reward-system.ts tests/systems/combat-reward-system.test.ts
git commit -m "feat(combat): generalize cyber_unit capture to all civilian-class units (#541)"
```

---

### Task 5: Trade-route cleanup + honest notification text on capture

**Files:**
- Modify: `src/systems/trade-system.ts` (add `'unit-captured'` reason)
- Modify: `src/main.ts` (route cleanup + notification text, two spots)
- Modify: `src/core/turn-manager.ts` (route cleanup, one spot)
- Modify: `src/systems/pirate-system.ts` (route cleanup, one spot)
- Modify: `src/systems/minor-civ-system.ts` (route cleanup, one spot)
- Test: `tests/systems/trade-system.test.ts` (extend), `tests/systems/combat-reward-system.test.ts` (already covers the capture flags themselves — this task's test coverage is about route cleanup consuming them, see Step 1)

**Interfaces:**
- Consumes: `CombatOutcomeApplication.attackerCaptured`/`defenderCaptured` from Task 4.
- Produces: `removeRouteForUnit`'s `reason` parameter gains a fourth member, `'unit-captured'`.

This is the fix for the concrete gap found while writing the spec: trade-route cleanup on unit loss is implemented four separate times, each currently gated strictly on `attackerDefeated`/`defenderDefeated` — which capture (Task 4) deliberately sets to `false`. Without this task, a captured caravan's `TradeRoute` would silently keep pointing at a unit that now belongs to the other civ, and reusing `'unit-died'` as the reason would tell the player their caravan was destroyed when it was actually captured.

- [ ] **Step 1: Write the failing test**

Open `tests/systems/trade-system.test.ts`, find the existing test `"removeRouteForUnit: removes route and clears committedToRouteId on unit"` (around line 571), and add a sibling test immediately after it:

```typescript
    it("removeRouteForUnit: accepts 'unit-captured' as a reason and emits it on the event", () => {
      const state = /* reuse this test's existing setup that produced `newState` with a committed route above */;
      const routeId = state.units['caravan1'].committedToRouteId!;
      const events: any[] = [];
      const bus = { emit: (name: string, payload: any) => events.push({ name, payload }) } as any;

      const result = removeRouteForUnit(state, 'caravan1', bus, 'unit-captured', routeId);

      expect(result.units['caravan1']?.committedToRouteId).toBeUndefined();
      expect(events).toContainEqual({ name: 'trade:route-ended', payload: expect.objectContaining({ reason: 'unit-captured' }) });
    });
```

Match this test's `bus`/`state` construction to whatever the existing `"removeRouteForUnit: removes route..."` test right above it already uses — do not invent a different fixture style in the same file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/trade-system.test.ts`
Expected: FAIL — TypeScript error, `'unit-captured'` is not assignable to the `reason` parameter's type.

- [ ] **Step 3: Add the new reason to trade-system.ts**

In `src/systems/trade-system.ts`, update `removeRouteForUnit`'s signature (line ~465):

```typescript
  reason: 'unit-died' | 'unit-disbanded' | 'trips-exhausted' | 'unit-captured' = 'unit-died',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/trade-system.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the four call sites — route cleanup + notification, gated on capture too**

In `src/main.ts`, locate the block (line ~2860, inside `executeAttack`):

```typescript
  if (applied.attackerDefeated && attackerRouteId) {
    gameState = removeRouteForUnit(gameState, result.attackerId, bus, 'unit-died', attackerRouteId);
  }
  if (applied.defenderDefeated && defenderRouteId) {
    gameState = removeRouteForUnit(gameState, result.defenderId, bus, 'unit-died', defenderRouteId);
  }
```

Replace with:

```typescript
  if (applied.attackerDefeated && attackerRouteId) {
    gameState = removeRouteForUnit(gameState, result.attackerId, bus, 'unit-died', attackerRouteId);
  } else if (applied.attackerCaptured && attackerRouteId) {
    gameState = removeRouteForUnit(gameState, result.attackerId, bus, 'unit-captured', attackerRouteId);
  }
  if (applied.defenderDefeated && defenderRouteId) {
    gameState = removeRouteForUnit(gameState, result.defenderId, bus, 'unit-died', defenderRouteId);
  } else if (applied.defenderCaptured && defenderRouteId) {
    gameState = removeRouteForUnit(gameState, result.defenderId, bus, 'unit-captured', defenderRouteId);
  }
```

Still in `main.ts`, locate the `if (applied.defenderDefeated) { showNotification('Enemy unit destroyed!', 'success'); ... }` block a few lines below (line ~2875) and add an `else if` right after its closing brace:

```typescript
  } else if (applied.defenderCaptured) {
    showNotification(`${UNIT_DEFINITIONS[defender.type].name} captured!`, 'success');
  }
```

(`defender` and `UNIT_DEFINITIONS` are already in scope in this function — confirm by checking the surrounding code before adding.)

Finally in `main.ts`, locate the reason→text map (line ~4755):

```typescript
    'unit-died': 'caravan destroyed',
    'unit-disbanded': 'caravan disbanded',
    'trips-exhausted': 'caravan retired after completing its service',
```

Add a fourth entry:

```typescript
    'unit-captured': 'caravan captured',
```

In `src/core/turn-manager.ts`, locate the identical pattern (line ~898, inside the barbarian-combat loop):

```typescript
    if (applied.attackerDefeated && attackerRouteId) {
      newState = removeRouteForUnit(newState, result.attackerId, bus, 'unit-died', attackerRouteId);
    }
    if (applied.defenderDefeated && defenderRouteId) {
      newState = removeRouteForUnit(newState, result.defenderId, bus, 'unit-died', defenderRouteId);
    }
```

Apply the same `else if (applied.*Captured ...)` pattern as `main.ts` above, using `newState` in place of `gameState`.

In `src/systems/pirate-system.ts`, locate (line ~213):

```typescript
  if (bus && applied.attackerDefeated && attacker.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, attacker.id, bus, 'unit-died', attacker.committedToRouteId);
  }
  if (bus && applied.defenderDefeated && defender.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, defender.id, bus, 'unit-died', defender.committedToRouteId);
  }
```

Apply the same pattern:

```typescript
  if (bus && applied.attackerDefeated && attacker.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, attacker.id, bus, 'unit-died', attacker.committedToRouteId);
  } else if (bus && applied.attackerCaptured && attacker.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, attacker.id, bus, 'unit-captured', attacker.committedToRouteId);
  }
  if (bus && applied.defenderDefeated && defender.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, defender.id, bus, 'unit-died', defender.committedToRouteId);
  } else if (bus && applied.defenderCaptured && defender.committedToRouteId) {
    appliedState = removeRouteForUnit(appliedState, defender.id, bus, 'unit-captured', defender.committedToRouteId);
  }
```

In `src/systems/minor-civ-system.ts`, locate (line ~490):

```typescript
    if (applied.attackerDefeated && attackerRouteId) {
      nextState = removeRouteForUnit(nextState, attacker.id, bus, 'unit-died', attackerRouteId);
    }
    if (applied.defenderDefeated && defenderRouteId) {
      nextState = removeRouteForUnit(nextState, defender.id, bus, 'unit-died', defenderRouteId);
    }
```

Apply the same pattern, using `nextState`.

- [ ] **Step 6: Write a regression test proving one non-player path cleans up a captured caravan's route**

Add to `tests/systems/pirate-system.test.ts` (find its existing combat-application test for style reference first):

```typescript
it('cancels a captured caravan\'s trade route with the honest unit-captured reason, not unit-died', () => {
  // Build state/attacker/defender per this file's existing combat-resolution test pattern,
  // with the defender a 'caravan' owned by the losing side and committedToRouteId set to
  // an existing marketplace.tradeRoutes[0].id. Capture the emitted bus events.
  // Assert: the route is removed from state.marketplace.tradeRoutes, and the
  // 'trade:route-ended' event's reason is 'unit-captured', never 'unit-died'.
});
```

Write out this test fully using `pirate-system.test.ts`'s actual existing state-fixture helper and combat-invocation style (open the file and copy the nearest existing `applyPirateAiResponse`-adjacent combat test's setup verbatim, then swap the defender to a caravan with a route) — do not leave it as the comment sketch above in the committed code.

- [ ] **Step 7: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/trade-system.test.ts tests/systems/pirate-system.test.ts tests/systems/combat-reward-system.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/systems/trade-system.ts src/main.ts src/core/turn-manager.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts tests/systems/trade-system.test.ts tests/systems/pirate-system.test.ts
git commit -m "fix(combat): clean up captured units' trade routes with honest notification text (#541)"
```

---

### Task 6: Inline dimensional review — MR2, then open PR

- [ ] **Step 1: Review checklist**

- **Balancing gameplay / fun:** confirm capture is strictly better for the winner than a kill only in the sense of "you gain a unit" — it does not additionally grant XP/gold beyond what `calculateDefeatReward` already gives for defeating any civilian (1 XP-adjacent... actually 3 XP / 1 gold per existing code) — capture must not double-reward.
- **New mechanics / architecture / extensibility:** confirm the capture condition is `UNIT_CLASS_BY_TYPE[type].includes('civilian')`, not a hardcoded type list — grep the diff for any stray `type === 'worker' || type === 'settler' || ...` list and remove it if present.
- **Player ages 7–43:** confirm the capture notification text says "captured," never anything resembling enslavement language (per the addendum's "they join you" framing) — check both the `main.ts` "Enemy unit destroyed!"-adjacent text and the trade-route reason-map text added in Task 5.
- **Different play styles / hot-seat regressions:** confirm the escort-protection tests from Task 4 pass and that nothing about capture changes which unit `selectDefenderForAttack` picks — a hot-seat player defending a stacked civilian must still be protected by any co-stacked combat unit, identically to before this MR.
- **Difficulty modes / computer players:** confirm capture requires zero new AI-specific code (it is a passive side effect of `applyCombatOutcomeToState`, which AI combat already calls) — grep `src/ai/` and `src/core/turn-manager.ts` for any new capture-specific branch; there should be none introduced by this MR (AI/barbarian capture parity is provable *now*, with a targeted test — add one if missing: an AI-vs-civilian combat in `turn-manager.ts`'s barbarian path or `ai-major-turn.ts` capturing a civilian exactly like the player path does).
- **UI / UX:** confirm the captured-unit notification actually renders (spot check via the existing notification test infra, not just that the code compiles).
- **Data / saves:** confirm no persisted field changed shape — `CombatOutcomeApplication` is a return type, never serialized to a save.
- **SFX:** none in scope for this MR.
- **Testing:** confirm Task 4's and Task 5's new tests all pass together, and specifically confirm the four call-site fix (Task 5 Step 5) has test coverage on at least one non-`main.ts` path (Task 5 Step 6) — per this repo's actor-complete rule, a fix proven only on the player path is incomplete.
- **Solo-play regressions:** run the full suite.
- **Proper implementation:** confirm the settler→worker swap changed `type` only — diff-check that `health`, `experience`, `hasMoved`, `hasActed`, `movementPointsLeft` on a captured unit are untouched by Task 4's branch (no accidental `applyUpgrade`-style reset crept in).

- [ ] **Step 2: Fix any issues found, re-run affected tests, and commit fixes**

- [ ] **Step 3: Final verification**

Run: `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
Run: `bash scripts/run-with-mise.sh yarn build` — expect exit 0.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(combat): civilian capture (#541 MR2)" --body "$(cat <<'EOF'
## Summary
- Generalizes the existing cyber_unit ownership-transfer branch in applyCombatOutcomeToState to every UnitClass: 'civilian' type (land + naval trade), deterministically — settler downgrades to worker, everything else keeps its type.
- Fixes a gap this generalization exposed: trade-route cleanup and player-facing notification text were gated strictly on "unit died" at four call sites (main.ts, turn-manager.ts, pirate-system.ts, minor-civ-system.ts); a captured caravan would have silently kept a dangling route and been told "destroyed." All four now handle capture with an honest 'unit-captured' reason.

## Test plan
- [x] `yarn vitest run tests/systems/combat-reward-system.test.ts tests/systems/trade-system.test.ts tests/systems/pirate-system.test.ts`
- [x] `yarn test` (full suite)
- [x] `yarn build`
- [x] Inline dimensional review completed (see plan Task 6)

Part of the #541 pillage/capture/prize-crews arc.
EOF
)"
```

---

## MR3 — Prize Crews

### Task 7: Add attacker/defender effective strength to CombatResult

**Files:**
- Modify: `src/core/types.ts` (`CombatResult` interface, line ~1153)
- Modify: `src/systems/combat-system.ts` (`resolveCombat`'s three `return` statements)
- Test: `tests/systems/combat-system.test.ts` (extend)

**Interfaces:**
- Produces: `CombatResult.attackerStrength: number`, `CombatResult.defenderStrength: number`. Task 8 reads these directly — do not recompute strength separately elsewhere, per the spec's explicit instruction to avoid a second parallel calculation that could drift from what `resolveCombat` actually used.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/combat-system.test.ts` (find the existing `describe('resolveCombat', ...)` block first):

```typescript
  it('exposes the attacker and defender effective strengths it used to resolve the exchange', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker' };
    const defender = { ...createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const result = resolveCombat(attacker, defender, map, 64);

    expect(result.attackerStrength).toBeGreaterThan(0);
    expect(result.defenderStrength).toBeGreaterThan(0);
  });

  it('reports zero defender strength when the defender cannot fight', () => {
    const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, mkC()), id: 'attacker' };
    const defender = { ...createUnit('worker', 'ai-1', { q: 1, r: 0 }, mkC()), id: 'defender' };
    const map = { width: 4, height: 4, wrapsHorizontally: false, rivers: [], tiles: {} };

    const result = resolveCombat(attacker, defender, map, 64);

    expect(result.defenderStrength).toBe(0);
    expect(result.attackerStrength).toBeGreaterThan(0);
  });
```

Use whatever `mkC`/`createUnit` import pattern this test file already uses (match `tests/systems/combat-reward-system.test.ts`'s convention if this file doesn't already define one).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts`
Expected: FAIL — `result.attackerStrength` is `undefined`.

- [ ] **Step 3: Extend CombatResult and populate it in resolveCombat**

In `src/core/types.ts`, update `CombatResult` (line ~1153):

```typescript
export interface CombatResult {
  attackerId: string;
  defenderId: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerSurvived: boolean;
  defenderSurvived: boolean;
  attackerStrength: number;
  defenderStrength: number;
  attackerPosition: HexCoord;
  defenderPosition: HexCoord;
  exchange?: CombatExchangeSummary;
}
```

In `src/systems/combat-system.ts`'s `resolveCombat`, the strengths are already computed once via `const strengths = calculateCombatStrengths(attacker, defender, map, context);` before any of the three `return` statements — add `attackerStrength: strengths.attackerStrength, defenderStrength: strengths.defenderStrength,` to all three:

The `defStrength === 0` early return:

```typescript
    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 0,
      defenderDamage: defender.health,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerStrength: strengths.attackerStrength,
      defenderStrength: strengths.defenderStrength,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    };
```

The `atkStrength === 0` early return (same two new lines added, same position), and the main-path return at the bottom of the function (same two new lines added, same position — right after `defenderSurvived: defenderHealthAfter > 0,`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0 — this is the important check here: every existing call site that *constructs* a `CombatResult` object literal (search the codebase for `attackerSurvived:` to find them — `combat-reward-system.test.ts` builds several by hand) will now fail to type-check without the two new required fields. Fix any you find by adding `attackerStrength: <n>, defenderStrength: <n>,` with any concrete number appropriate to that test's intent (e.g. `attackerStrength: 20, defenderStrength: 10,` for a decisive win, or values that don't cross the 50%/50% prize-capture threshold if the test is asserting ordinary destruction).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/combat-system.ts tests/systems/combat-system.test.ts
git commit -m "feat(combat): expose attacker/defender strength on CombatResult (#541)"
```

---

### Task 8: Prize-crew capture branch + era-flavor label

**Files:**
- Modify: `src/systems/combat-reward-system.ts`
- Test: `tests/systems/combat-reward-system.test.ts` (extend)

**Interfaces:**
- Consumes: `CombatResult.attackerStrength`/`defenderStrength` from Task 7; `attackerCaptured`/`defenderCaptured` fields and their assignment pattern from Task 4 (this task adds a second capture branch alongside the civilian one, so those two flags now mean "captured for any reason," not "captured, civilian-only").
- Produces: `isCapturableNavalMilitary(type: UnitType): boolean`, `meetsCaptureMargin(loserStrength: number, winnerStrength: number, winnerHealthAfter: number): boolean`, `getCaptureNotificationLabel(type: UnitType): string` — all exported for direct unit testing and for MR2's `main.ts` notification call site to optionally use later (not required this task).

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/combat-reward-system.test.ts`:

```typescript
  it('captures a decisively-defeated naval military unit instead of sinking it', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'frigate', owner: 'player' };
    state.units.defender = { ...state.units.defender, type: 'galley', owner: 'ai-1' };
    state.civilizations['ai-1'].units = ['defender'];
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerStrength: 20, defenderStrength: 8, // 8 <= 20 * 0.5
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(false);
    expect(applied.defenderCaptured).toBe(true);
    expect(applied.state.units.defender.owner).toBe('player');
    expect(applied.state.units.defender.type).toBe('galley');
  });

  it('sinks a naval military unit when the win is not decisive enough', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'frigate', owner: 'player' };
    state.units.defender = { ...state.units.defender, type: 'galley', owner: 'ai-1' };
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerStrength: 20, defenderStrength: 15, // 15 > 20 * 0.5 — not decisive
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.defenderCaptured).toBe(false);
  });

  it('sinks a naval military unit when the winner drops below 50% health, even with a decisive strength margin', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'frigate', owner: 'player', health: 40 };
    state.units.defender = { ...state.units.defender, type: 'galley', owner: 'ai-1' };
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 5, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerStrength: 20, defenderStrength: 8,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };
    // attacker health after: max(1, 40 - 5) = 35, below the 50 threshold

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderDefeated).toBe(true);
    expect(applied.defenderCaptured).toBe(false);
  });

  it('never captures a beast_sea_serpent — it is destroyed like any other beast', () => {
    const state = makeRewardState();
    state.units.attacker = { ...state.units.attacker, type: 'frigate', owner: 'player' };
    state.units.defender = { ...state.units.defender, type: 'beast_sea_serpent', owner: 'beasts' };
    const result: CombatResult = {
      attackerId: 'attacker', defenderId: 'defender', attackerDamage: 0, defenderDamage: 100,
      attackerSurvived: true, defenderSurvived: false,
      attackerStrength: 20, defenderStrength: 1,
      attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 },
    };

    const applied = applyCombatOutcomeToState(state, result, 64);

    expect(applied.defenderCaptured).toBe(false);
    expect(applied.defenderDefeated).toBe(true);
  });
```

Add a separate `describe` block for the two new pure helpers:

```typescript
describe('prize-crew helpers', () => {
  it('meetsCaptureMargin requires both a decisive strength ratio and winner health >= 50', () => {
    expect(meetsCaptureMargin(8, 20, 60)).toBe(true);
    expect(meetsCaptureMargin(15, 20, 60)).toBe(false);
    expect(meetsCaptureMargin(8, 20, 40)).toBe(false);
  });

  it('isCapturableNavalMilitary is true for naval military types, false for naval civilian and beasts', () => {
    expect(isCapturableNavalMilitary('galley')).toBe(true);
    expect(isCapturableNavalMilitary('submarine')).toBe(true);
    expect(isCapturableNavalMilitary('transport')).toBe(false); // naval civilian
    expect(isCapturableNavalMilitary('beast_sea_serpent')).toBe(false);
    expect(isCapturableNavalMilitary('warrior')).toBe(false); // not naval at all
  });

  it('getCaptureNotificationLabel uses Age-of-Sail phrasing for early naval types and modern phrasing for later ones', () => {
    expect(getCaptureNotificationLabel('galley')).toMatch(/prize crew|boarded/i);
    expect(getCaptureNotificationLabel('submarine')).toMatch(/disabled|captured/i);
    expect(getCaptureNotificationLabel('worker')).toMatch(/captured/i);
  });
});
```

Update this file's `@/systems/combat-reward-system` import to include `meetsCaptureMargin, isCapturableNavalMilitary, getCaptureNotificationLabel`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-reward-system.test.ts`
Expected: FAIL — the three new exports don't exist yet, and the naval-capture assertions still see `defenderDefeated: true` / `defenderCaptured: false` for the decisive-win case.

- [ ] **Step 3: Implement the prize-crew branch**

In `src/systems/combat-reward-system.ts`, add the two pure helpers and the label function (near the top, after the `UNIT_CLASS_BY_TYPE` import):

```typescript
import type { UnitType } from '@/core/types';

/** Age-of-Sail through ironclad — boarding-action flavor. Everything else
 * (destroyer onward) uses modern "disabled and captured" phrasing. Same
 * underlying mechanic at every era — this only changes notification text. */
const PRE_INDUSTRIAL_NAVAL_TYPES: readonly UnitType[] = [
  'galley', 'trireme', 'frigate', 'ironclad',
  'pirate_galley', 'pirate_corsair', 'pirate_frigate',
];

export function isCapturableNavalMilitary(type: UnitType): boolean {
  if (type === 'beast_sea_serpent') return false;
  const classes = UNIT_CLASS_BY_TYPE[type];
  return classes.includes('naval') && !classes.includes('civilian');
}

export function meetsCaptureMargin(loserStrength: number, winnerStrength: number, winnerHealthAfter: number): boolean {
  return loserStrength <= winnerStrength * 0.5 && winnerHealthAfter >= 50;
}

export function getCaptureNotificationLabel(type: UnitType): string {
  const name = UNIT_DEFINITIONS[type].name;
  if (type === 'settler') return `Settler captured — converted to Worker`;
  if (isCapturableNavalMilitary(type)) {
    return PRE_INDUSTRIAL_NAVAL_TYPES.includes(type)
      ? `${name} boarded — prize crew aboard!`
      : `${name} disabled and captured!`;
  }
  return `${name} captured!`;
}
```

Add the prize-crew branch to the attacker chain, as a new `else if` between the civilian-capture branch (Task 4) and the final `else` (destroy):

```typescript
  } else if (
    result.defenderSurvived
    && isCapturableNavalMilitary(attackerBefore.type)
    && meetsCaptureMargin(result.attackerStrength, result.defenderStrength, Math.max(1, defenderBefore.health - result.defenderDamage))
  ) {
    // Prize crew: a decisive naval defeat captures the hull instead of sinking it.
    units[result.attackerId] = { ...attackerBefore, owner: defenderBefore.owner };
    civilizations = {
      ...civilizations,
      [attackerBefore.owner]: {
        ...civilizations[attackerBefore.owner],
        units: (civilizations[attackerBefore.owner]?.units ?? []).filter(id => id !== result.attackerId),
      },
      [defenderBefore.owner]: {
        ...civilizations[defenderBefore.owner],
        units: [...(civilizations[defenderBefore.owner]?.units ?? []), result.attackerId],
      },
    };
    attackerActuallyDefeated = false;
    attackerCaptured = true;
  } else {
```

Add the mirrored branch to the defender chain (same shape, `defenderBefore.type` instead of `attackerBefore.type`, `result.defenderStrength`/`result.attackerStrength` swapped, `Math.max(1, attackerBefore.health - result.attackerDamage)` for the winner's health, guarded by `result.attackerSurvived`, setting `defenderCaptured = true`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/combat-reward-system.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat-reward-system.ts tests/systems/combat-reward-system.test.ts
git commit -m "feat(combat): prize-crew capture for decisive naval victories (#541)"
```

---

### Task 9: Inline dimensional review — MR3, then open PR

- [ ] **Step 1: Review checklist**

- **Balancing gameplay / fun:** confirm the 50%/50% threshold is genuinely rare in ordinary play (a strength ratio of 2:1 is already a lopsided matchup) — spot check with `tests/systems/pacing-audit.test.ts` that this doesn't shift any era's combat outcome distribution enough to trip the outlier gate.
- **New mechanics / architecture / extensibility:** confirm `meetsCaptureMargin`/`isCapturableNavalMilitary` are pure, independently-tested functions reused by both the attacker-chain and defender-chain branches — grep for any duplicated inline threshold logic instead of calling the shared helper.
- **Player ages 7–43:** confirm `getCaptureNotificationLabel`'s modern-era phrasing ("disabled and captured") reads as a clean military outcome, not glorified violence — matches the same register as "Enemy unit destroyed!" already in the game.
- **Difficulty modes:** confirm this MR reads no difficulty/challenge-profile field — the threshold is identical at every difficulty (matches MR2's precedent: capture rules don't vary by challenge, only barbarian/AI *frequency* will in MR4).
- **Computer players:** confirm prize-crew capture requires zero AI-specific code (same passive-side-effect reasoning as civilian capture) — verify with a quick manual trace: any existing AI-vs-AI or AI-vs-player naval combat test already exercises `applyCombatOutcomeToState`, so it's covered without new AI code.
- **UI / UX:** confirm the label function is at least referenced from a real call site (even if MR2's notification text isn't yet using it) — dead exported code that's only unit-tested is a smell; if nothing in `main.ts` calls `getCaptureNotificationLabel` yet, update `main.ts`'s Task 5 notification branch (`applied.defenderCaptured` → `showNotification(...)`) to call `getCaptureNotificationLabel(defender.type)` instead of the flat civilian-only string it currently has, so the era-flavor text actually reaches the player.
- **Data / saves:** confirm `CombatResult`'s two new fields don't appear in any persisted save shape (it's a transient combat-resolution return type, never stored on `GameState`).
- **SFX:** none in scope.
- **Testing:** confirm boundary tests exist on both sides of 50%/50% (Task 8's three threshold tests) and that `beast_sea_serpent` exclusion has a regression test.
- **Solo-play / hot-seat regressions:** run the full suite; naval combat is exercised by both a human player and AI/barbarian/pirate code paths already, so no new hot-seat-specific test should be needed — confirm no existing hot-seat test broke.
- **Proper implementation:** confirm Task 7's `yarn build` pass caught and fixed every hand-constructed `CombatResult` literal across the test suite (re-run `grep -rn "attackerSurvived:" tests/` and check each has `attackerStrength`/`defenderStrength` now).

- [ ] **Step 2: Fix any issues found (including the UI wiring gap most likely to surface in Step 1), re-run affected tests, and commit fixes**

- [ ] **Step 3: Final verification**

Run: `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
Run: `bash scripts/run-with-mise.sh yarn build` — expect exit 0.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(combat): prize-crew naval capture (#541 MR3)" --body "$(cat <<'EOF'
## Summary
- CombatResult now exposes the attacker/defender effective strengths resolveCombat already computes internally, so downstream logic never has to recompute (and risk drifting from) them.
- A decisively-won naval-military combat (loser <= 50% of winner's strength, winner ending >= 50% health) captures the hull instead of sinking it, at every era — Age-of-Sail types get "prize crew/boarded" notification text, later types get "disabled and captured." beast_sea_serpent is explicitly excluded.

## Test plan
- [x] `yarn vitest run tests/systems/combat-system.test.ts tests/systems/combat-reward-system.test.ts`
- [x] `yarn test` (full suite, including pacing-audit.test.ts)
- [x] `yarn build`
- [x] Inline dimensional review completed (see plan Task 9)

Part of the #541 pillage/capture/prize-crews arc.
EOF
)"
```

---

## MR4 — AI & Difficulty

### Task 10: Difficulty profile field

**Files:**
- Modify: `src/core/opponent-challenge.ts`
- Test: `tests/core/opponent-challenge.test.ts` (extend)

**Interfaces:**
- Produces: `OpponentChallengeProfile.pillageAggressivenessMultiplier: number`. Task 11 reads this from `OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(state)]`, the same access pattern `barbarian-system.ts` already uses for `profile.citySiegeDestructionEra` etc.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/opponent-challenge.test.ts`:

```typescript
  it('scales barbarian/pirate pillage aggressiveness across all three difficulty tiers', () => {
    expect(OPPONENT_CHALLENGE_PROFILES.explorer.pillageAggressivenessMultiplier).toBe(0.5);
    expect(OPPONENT_CHALLENGE_PROFILES.standard.pillageAggressivenessMultiplier).toBe(1.0);
    expect(OPPONENT_CHALLENGE_PROFILES.veteran.pillageAggressivenessMultiplier).toBe(1.3);
  });
```

(Match this file's existing import of `OPPONENT_CHALLENGE_PROFILES` — it's very likely already imported for similar field checks.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/opponent-challenge.test.ts`
Expected: FAIL — TypeScript error, `pillageAggressivenessMultiplier` doesn't exist on the profile type / is `undefined`.

- [ ] **Step 3: Add the field**

In `src/core/opponent-challenge.ts`, add to the `OpponentChallengeProfile` interface:

```typescript
  // #541: scales how eagerly barbarian/pirate raid plans prefer a pillage-capable
  // resource-tile raid target over a plain unit-raid target. Player-side pillage
  // rules are identical at every difficulty — only barbarian/pirate/AI frequency
  // changes.
  pillageAggressivenessMultiplier: number;
```

Add `pillageAggressivenessMultiplier: 0.5,` to the `explorer` profile, `pillageAggressivenessMultiplier: 1.0,` to `standard`, and `pillageAggressivenessMultiplier: 1.3,` to `veteran` — same tier spread as `crisisSeverityMultiplier` in the same three profile objects.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/core/opponent-challenge.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/opponent-challenge.ts tests/core/opponent-challenge.test.ts
git commit -m "feat(combat): add pillageAggressivenessMultiplier difficulty field (#541)"
```

---

### Task 11: Barbarian pillage-on-arrival + difficulty-scaled raid priority

**Files:**
- Modify: `src/systems/barbarian-system.ts`
- Modify: `src/core/turn-manager.ts`
- Test: `tests/systems/barbarian-system.test.ts` (extend)

**Interfaces:**
- Consumes: `applyPillageToState` from `@/systems/pillage-system` (MR1 Task 1); `pillageAggressivenessMultiplier` from Task 10.
- Produces: `BarbarianPillageOrder { unitId: string; tileKey: string }`, `BarbarianProcessResult.pillageOrders: BarbarianPillageOrder[]`.

Today, `processPurposefulBarbarians`'s resource-raid plan (`plan.target.kind === 'resource'`) navigates a barbarian unit to an improved resource tile and, on arrival, immediately marks the plan `'withdrawing'` without doing anything to the tile — this is the literal dead end the spec references. This task closes it.

- [ ] **Step 1: Write the failing test**

Add to `tests/systems/barbarian-system.test.ts` inside `describe('processPurposefulBarbarians', ...)`, reusing the existing `purposefulState()` helper:

```typescript
  it('pillages a resource tile on arrival instead of leaving it untouched', () => {
    const state = purposefulState();
    const raider = createUnit('warrior', 'barbarian', { q: 6, r: 5 }, state.idCounters);
    raider.id = 'raider';
    state.units = { raider };
    state.map.tiles['7,5'] = {
      ...state.map.tiles['7,5'],
      resource: 'iron',
      improvement: 'mine',
      improvementTurnsLeft: 0,
      owner: 'player',
    };
    state.opponentAI = {
      barbarianCamps: {
        'camp-a': {
          objective: 'raid',
          target: { kind: 'resource', resource: 'iron', position: { q: 7, r: 5 } },
          phase: 'raiding',
          commitment: 1,
          createdTurn: state.turn - 1,
          lastProgressTurn: state.turn - 1,
          assignedUnitIds: ['raider'],
        },
      },
      barbarianHomeCampByUnitId: { raider: 'camp-a' },
    } as never;
    raider.position = { q: 7, r: 5 };

    const result = processPurposefulBarbarians(state);

    expect(result.pillageOrders).toContainEqual({ unitId: 'raider', tileKey: '7,5' });
  });

  it('prioritizes a resource-raid target over a unit-raid target when pillageAggressivenessMultiplier > 1', () => {
    const state = purposefulState();
    state.opponentChallenge = 'veteran'; // pillageAggressivenessMultiplier 1.3
    const raider = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const worker = createUnit('worker', 'player', { q: 6, r: 5 }, state.idCounters);
    worker.id = 'worker';
    state.units = { raider, worker };
    state.civilizations.player.units = ['worker'];
    state.map.tiles['8,5'] = {
      ...state.map.tiles['8,5'],
      resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0, owner: 'player',
    };

    const result = processPurposefulBarbarians(state);

    expect(result.opponentAI.barbarianCamps['camp-a']).toMatchObject({
      target: { kind: 'resource' },
    });
  });

  it('prioritizes a unit-raid target over a resource-raid target on explorer (multiplier <= 1)', () => {
    const state = purposefulState();
    state.opponentChallenge = 'explorer';
    const raider = createUnit('warrior', 'barbarian', { q: 5, r: 5 }, state.idCounters);
    raider.id = 'raider';
    const worker = createUnit('worker', 'player', { q: 6, r: 5 }, state.idCounters);
    worker.id = 'worker';
    state.units = { raider, worker };
    state.civilizations.player.units = ['worker'];
    state.map.tiles['8,5'] = {
      ...state.map.tiles['8,5'],
      resource: 'iron', improvement: 'mine', improvementTurnsLeft: 0, owner: 'player',
    };

    const result = processPurposefulBarbarians(state);

    expect(result.opponentAI.barbarianCamps['camp-a']).toMatchObject({
      target: { kind: 'unit', id: 'worker' },
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/barbarian-system.test.ts`
Expected: FAIL — `result.pillageOrders` is `undefined`; the priority tests fail because today's code always checks unit-raid before resource-raid regardless of difficulty.

- [ ] **Step 3: Implement pillage-on-arrival**

In `src/systems/barbarian-system.ts`, add the import:

```typescript
import { applyPillageToState } from '@/systems/pillage-system';
```

Add the new order interface near the existing `BarbarianCityAttackOrder` (line ~150):

```typescript
export interface BarbarianPillageOrder {
  unitId: string;
  tileKey: string;
}
```

Add it to `BarbarianProcessResult` (line ~152-158):

```typescript
export interface BarbarianProcessResult {
  updatedCamps: BarbarianCamp[];
  spawnedUnits: Array<{ campId: string; position: HexCoord; unitType?: UnitType }>;
  moveOrders: BarbarianMoveOrder[];
  attackOrders: BarbarianAttackOrder[];
  cityAttackOrders: BarbarianCityAttackOrder[];
  pillageOrders: BarbarianPillageOrder[];
}
```

In `processPurposefulBarbarians`, declare the accumulator alongside the others (line ~337):

```typescript
  const pillageOrders: BarbarianPillageOrder[] = [];
```

Update the `completedResourceRaid` block (line ~486-498) to also identify the arrived unit and push a pillage order:

```typescript
    const targetPosition = planTargetPosition(state, plan);
    const resourceTarget = plan.target.kind === 'resource' ? plan.target : null;
    const arrivedRaider = resourceTarget
      ? assigned.find(unit => hexKey(unit.position) === hexKey(resourceTarget.position) && !unit.hasActed)
      : undefined;
    if (arrivedRaider && resourceTarget) {
      pillageOrders.push({ unitId: arrivedRaider.id, tileKey: hexKey(resourceTarget.position) });
    }
    const completedResourceRaid = resourceTarget !== null
      && plan.createdTurn < state.turn
      && assigned.some(unit => hexKey(unit.position) === hexKey(resourceTarget.position));
```

(the rest of that block — `lostUnitTarget`, the `if (completedResourceRaid || lostUnitTarget) { ... }` withdrawal transition — is unchanged; the raider still withdraws afterward, it just pillages first).

Add `pillageOrders` to the function's final return object (alongside `moveOrders`, `attackOrders`, `cityAttackOrders`).

- [ ] **Step 4: Reorder raid-target priority by difficulty**

Still in `processPurposefulBarbarians`, locate the unit-raid block and the resource-raid block (the two `if (!plan) { ... }` blocks). Wrap them in named closures and choose their order based on the profile:

```typescript
    const tryRaidUnitPlan = (): typeof plan => {
      const raidUnit = sensedUnits
        .filter(unit => unit.type === 'worker' || unit.type === 'caravan')
        .sort((a, b) => {
          const priority = (unit: Unit) => unit.type === 'caravan' ? 0 : 1;
          return priority(a) - priority(b)
            || barbarianDistance(state, camp.position, a.position) - barbarianDistance(state, camp.position, b.position)
            || a.id.localeCompare(b.id);
        })[0];
      return raidUnit
        ? makeBarbarianPlan(state, camp, { kind: 'unit', id: raidUnit.id, lastKnownPosition: { ...raidUnit.position } }, 'raid', 'opportunistic-raid', assignedIds)
        : null;
    };
    const tryRaidResourcePlan = (): typeof plan => {
      const resource = Object.values(state.map.tiles)
        .filter(tile =>
          Boolean(tile.resource)
          && tile.improvement !== 'none'
          && tile.improvementTurnsLeft === 0
          && tile.owner !== null
          && tile.owner !== 'barbarian'
          && sensedByCamp(state, camp, assigned, tile.coord))
        .sort((a, b) =>
          barbarianDistance(state, camp.position, a.coord) - barbarianDistance(state, camp.position, b.coord)
          || hexKey(a.coord).localeCompare(hexKey(b.coord)))[0];
      return resource?.resource
        ? makeBarbarianPlan(state, camp, { kind: 'resource', resource: resource.resource as ResourceType, position: { ...resource.coord } }, 'raid', 'opportunistic-raid', assignedIds)
        : null;
    };
    if (!plan) {
      plan = profile.pillageAggressivenessMultiplier > 1
        ? (tryRaidResourcePlan() ?? tryRaidUnitPlan())
        : (tryRaidUnitPlan() ?? tryRaidResourcePlan());
    }
```

This replaces the two separate `if (!plan) { const raidUnit = ...; if (raidUnit) {...} }` and `if (!plan) { const resource = ...; if (resource?.resource) {...} }` blocks — delete both originals, since `tryRaidUnitPlan`/`tryRaidResourcePlan` are their exact bodies extracted into closures. `profile` is already in scope (declared at line ~338 in this function).

In `src/core/turn-manager.ts`, after the existing `for (const order of barbResult.moveOrders) { ... }` loop (line ~868), add:

```typescript
  // Barbarian pillage-on-arrival
  for (const order of barbResult.pillageOrders) {
    const result = applyPillageToState(newState, order.unitId);
    if (result.ok) newState = result.state;
  }
```

Add the `applyPillageToState` import to `turn-manager.ts` if not already present (it will not be — this is the first non-MR1-UI consumer).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/barbarian-system.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/systems/barbarian-system.ts src/core/turn-manager.ts tests/systems/barbarian-system.test.ts
git commit -m "feat(combat): barbarians pillage resource tiles on arrival, scaled by difficulty (#541)"
```

---

### Task 12: AI civ discretionary pillage decision

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai.test.ts` (extend)

**Interfaces:**
- Consumes: `canPillageTile`, `applyPillageToState` from `@/systems/pillage-system` (MR1); `isAtWar` from `@/systems/diplomacy-system`.

Unlike capture (a passive side effect of `applyCombatOutcomeToState`, already automatic for AI once MR2/MR3 land), pillage is a discretionary action an AI-controlled combat unit must actively choose to take instead of continuing to move/attack/fortify. This mirrors the existing administrative worker-AI loops in `processAITurnInternal` (`applyWorkerAction` calls at lines ~620/666/686) — same pattern, new trigger condition.

- [ ] **Step 1: Write the failing test**

Open `tests/ai/basic-ai.test.ts`, find its existing state-fixture helper (used by the worker-road tests, most likely — check `tests/ai/basic-ai-worker-roads.test.ts` if this file's own helper doesn't cover map tiles), and add:

```typescript
it('pillages an enemy improved tile it is already at war with, using its action', () => {
  const state = /* this file's existing fixture helper */;
  state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
  state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
  const raider = createUnit('warrior', 'ai-1', { q: 3, r: 3 }, state.idCounters);
  raider.id = 'raider';
  state.units = { ...state.units, raider };
  state.civilizations['ai-1'].units = [...(state.civilizations['ai-1'].units ?? []), 'raider'];
  state.map.tiles['3,3'] = {
    ...state.map.tiles['3,3'],
    owner: 'player', improvement: 'farm', improvementTurnsLeft: 0,
  };

  const result = processAITurn(state, 'ai-1', bus);

  expect(result.units.raider.hasActed).toBe(true);
  expect(result.map.tiles['3,3'].improvement).toBe('none');
});

it('does not pillage a tile owned by a civ it is not at war with', () => {
  const state = /* same fixture, but no atWarWith entries */;
  const raider = createUnit('warrior', 'ai-1', { q: 3, r: 3 }, state.idCounters);
  raider.id = 'raider';
  state.units = { ...state.units, raider };
  state.civilizations['ai-1'].units = [...(state.civilizations['ai-1'].units ?? []), 'raider'];
  state.map.tiles['3,3'] = {
    ...state.map.tiles['3,3'],
    owner: 'player', improvement: 'farm', improvementTurnsLeft: 0,
  };

  const result = processAITurn(state, 'ai-1', bus);

  expect(result.map.tiles['3,3'].improvement).toBe('farm');
});
```

Adapt to this file's actual fixture and `processAITurn`/`bus` setup — every other test in the file already builds these; match the existing pattern exactly (look at the nearest existing `it('...', () => { const state = ...; const result = processAITurn(state, 'ai-1', bus); ... })` test above for the precise call shape, since `processAITurn` vs `processAITurnInternal` may differ in exported signature — use whichever this file's other tests already call).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts`
Expected: FAIL — the tile's improvement is still `'farm'` after the AI turn; nothing pillages it yet.

- [ ] **Step 3: Implement the AI pillage decision loop**

In `src/ai/basic-ai.ts`, add the imports:

```typescript
import { applyPillageToState, canPillageTile } from '@/systems/pillage-system';
import { isAtWar } from '@/systems/diplomacy-system';
```

In `processAITurnInternal`, add a new administrative loop after the existing worker-road/improvement loop (right after the closing brace of the `for (const worker of idleWorkers) { ... }` loop and its trailing `civ = newState.units[civId];` reassignment, so it runs on the same up-to-date `newState`):

```typescript
  // Pillage is discretionary, not a passive combat side effect (unlike capture) — an
  // AI combat unit standing on a pillageable enemy tile must actively choose to spend
  // its action burning it. Only pillages civs already at war (never auto-declares a
  // new war just to pillage — that stays the player's own explicit choice via the UI).
  const combatUnitsForPillage = civ.units
    .map(id => newState.units[id])
    .filter((unit): unit is Unit => Boolean(unit) && !unit.hasActed && UNIT_DEFINITIONS[unit.type].strength > 0);
  for (const unit of combatUnitsForPillage) {
    const current = newState.units[unit.id];
    if (!current || current.hasActed) continue;
    const tile = newState.map.tiles[hexKey(current.position)];
    if (!tile || !tile.owner || !isAtWar(civ.diplomacy, tile.owner)) continue;
    if (!canPillageTile(tile, civId)) continue;
    const result = applyPillageToState(newState, current.id);
    if (result.ok) newState = result.state;
  }
  civ = newState.civilizations[civId];
```

Place this after the existing `civ = newState.civilizations[civId];` line that follows the worker loop (line ~690) — confirm `UNIT_DEFINITIONS` and `hexKey` are already imported in this file (both are near-certainly already imported, given the file's extensive existing unit/tile logic; add them only if a grep comes back empty).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ai/basic-ai.test.ts`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(combat): AI civs pillage enemy tiles they're already at war with (#541)"
```

---

### Task 13: Inline dimensional review — MR4, then open PR

- [ ] **Step 1: Review checklist**

- **Balancing gameplay / fun:** confirm the 0.5/1.0/1.3 multiplier spread produces an actually observable difference in raid-target selection (Task 11's two priority tests prove this) — a difficulty knob that compiles but never changes behavior is a dead lever.
- **New mechanics / architecture / extensibility:** confirm `applyPillageToState` (MR1) is now called from three independent sites — the player UI (MR1 Task 2), barbarian turn processing (Task 11), and AI turn processing (Task 12) — with zero duplication of its internal eligibility/reward logic. Grep for any inline reimplementation of the gold formula or heal amount in either new call site; there should be none.
- **Player ages 7–43 / different play styles:** confirm barbarian/AI pillage doesn't change any player-facing rule or UI — the player's own Pillage button behaves identically regardless of difficulty (Global Constraints already require this; this review step is the check that nothing in this MR accidentally violated it).
- **Difficulty modes:** this MR *is* the difficulty-scaling MR — confirm `pillageAggressivenessMultiplier` is the only new difficulty-scoped lever, and that it affects barbarian/pirate/AI plan selection only, never a player-facing rule (re-confirm the boundary explicitly here, since it's the whole point of this MR).
- **Computer players:** confirm both barbarians (Task 11) and AI civs (Task 12) are covered, since the spec requires both, not just one. Confirm the AI-civ path's war-check (`isAtWar`, never auto-declare) versus the player path's auto-declare (`ensurePlayerWarState`, from MR1 Task 2) are each doing the *right* thing for their actor — re-read Global Constraints' war-declaration paragraph and confirm the diff matches it exactly.
- **UI / UX:** none directly in this MR (no new UI surface) — confirm no accidental UI regression by running the full UI test directory.
- **Architecture:** confirm the barbarian priority-reorder (Task 11 Step 4) preserved every other branch of `processPurposefulBarbarians` byte-for-byte (city-raid fallback, camp-defense plan, withdrawal logic) — the refactor should touch only the unit-raid/resource-raid ordering, nothing else in that function.
- **Data / saves:** confirm the new `pillageAggressivenessMultiplier` field requires no save migration — an old save's `opponentChallenge` string still resolves to a complete profile object via `OPPONENT_CHALLENGE_PROFILES[...]`, which now always includes the field for every tier (verify by re-running `tests/storage/opponent-challenge-migration.test.ts` if it exists).
- **SFX:** none in scope (spec: reuse existing raze/fire stingers later, not part of this arc).
- **Testing:** confirm Task 11's and Task 12's tests both assert the *actual mutated state* (tile improvement cleared, unit gold/hasActed), not just that a function was called — a mock-based assertion here would not prove the AI/barbarian path actually shares MR1's logic.
- **Solo-play regressions:** run the full suite — this MR touches `basic-ai.ts` and `barbarian-system.ts`, both large shared files with extensive existing coverage; confirm nothing broke.
- **Hot-seat regressions:** confirm AI/barbarian pillage during a hot-seat game only fires during that civ's own turn processing (via `processAITurnInternal`/`processPurposefulBarbarians`, both already turn-scoped) and never leaks into a human player's turn — no new code path should read or write `gameState.currentPlayer` in this MR.
- **Proper implementation:** confirm the AI pillage loop's `!unit.hasActed` re-check inside the loop body (after re-fetching `current` from `newState`) is present — without it, a unit already pillaged earlier in the same loop iteration by another accumulated effect could incorrectly act twice.

- [ ] **Step 2: Fix any issues found, re-run affected tests, and commit fixes**

- [ ] **Step 3: Final verification**

Run: `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
Run: `bash scripts/run-with-mise.sh yarn build` — expect exit 0.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(combat): AI/barbarian pillage + difficulty scaling (#541 MR4)" --body "$(cat <<'EOF'
## Summary
- Closes an existing dead end: barbarian raid plans already navigate to improved resource tiles (barbarian-system.ts) but did nothing on arrival — they now pillage, reusing MR1's pillage-system.ts helper verbatim.
- New pillageAggressivenessMultiplier difficulty field (0.5/1.0/1.3) controls whether a barbarian camp prioritizes a resource-raid target over a unit-raid target when both are available.
- AI civs gain a new discretionary pillage decision in their turn processing (unlike capture, which was already automatic) — AI only pillages civs it's already at war with, never auto-declaring a new war to do so.

## Test plan
- [x] `yarn vitest run tests/systems/barbarian-system.test.ts tests/ai/basic-ai.test.ts tests/core/opponent-challenge.test.ts`
- [x] `yarn test` (full suite)
- [x] `yarn build`
- [x] Inline dimensional review completed (see plan Task 13)

Closes #541.
EOF
)"
```

---

## Post-plan note

Each MR's PR body above intentionally omits "Closes #541" except the last one (MR4) — per this repo's convention, only the MR that actually completes the full issue should carry the closing keyword; GitHub auto-closes on merge, and closing the issue after MR1 would be wrong while MR2–4 are still outstanding.
