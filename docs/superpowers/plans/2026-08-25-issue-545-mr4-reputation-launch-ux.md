# #545 MR4 — Reputation/Witness Wiring + Launch UX Flow + Warchief Panel Implementation Plan

✅ executed 2026-08-25 (pre-merge; PR not yet opened). All 13 tasks complete, full
suite green (541 files / 9084 tests, 3 pre-existing skips), `yarn build` clean, zero
pacing-audit diff. One 18-dimension review pass ran before execution (gameplay,
ages 7-43, play styles, difficulty, AI, UI/UX, architecture, extensibility, data,
SFX, saved games, testing, regressions solo+hot-seat, proper implementation),
catching a circular-import risk, a DRY violation, a missing exact-numbers preview
requirement, a missing progressive-disclosure section, and a missing
defender-notification path -- all fixed in the plan before execution began.
Execution itself surfaced three further corrections not caught by review: (1) the
new `strategicStrikesReceivedFrom` field had to become optional, not required, to
avoid breaking ~15 pre-existing test fixtures; (2) `selected-unit-info.ts` has no
single shared ownership gate around its actions (each one re-checks
`unit.owner === state.currentPlayer` itself) -- caught by the hot-seat/ownership
regression test written alongside the change; (3) `EventBus.emit` is strictly typed
against `GameEvents`, forcing Task 11 (the notification registrar) to execute
before Task 9 (its emit call sites) rather than after, as originally planned. One
known non-blocking follow-up flagged separately: strategic strikes currently play
no sound effect (see the Definition of Done section for why this doesn't violate
mute-safe).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This repo's own CLAUDE.md forbids subagents/parallel agents in this repo.** Execute this plan via `superpowers:executing-plans` (inline, single session), never `subagent-driven-development`.

**Goal:** Give the strategic-strike system (MR3) its first real player-facing surface: reputation/witness consequences (spec §11), a 3-stage launch confirmation flow with a map blast-radius preview (spec §14), and a `warchief` "Strategic Arsenal" summary panel — while introducing the retaliation-vs-first-use tracking state neither MR1-3 nor the design spec pre-answered.

**Architecture:** Two small, targeted additions to MR2's `strategic-launch-system.ts` (a pure retaliation-classification predicate + a legal-targets query) and MR3's `strategic-strike-system.ts` (an exported blast-radius constant + a pure preview query), composed by a brand-new `strategic-launch-execution-system.ts` that is the *only* entry point the UI ever calls to actually launch a strike (it wraps MR3's `resolveStrategicStrike` with reputation deltas and retaliation-tracking, so UI code never calls `resolveStrategicStrike` directly). The 3-stage UI flow is one new component (`strategic-launch-flow.ts`) triggered from two existing surfaces (Missile Silo building action, Missile Submarine unit action), with a map overlay that mirrors the existing `supply-overlay-renderer.ts` presentation/pure-renderer split exactly. The warchief panel is a new standalone panel (existing `advisor-system.ts` is tips-only, not a panel host).

**Tech Stack:** TypeScript, Canvas 2D renderer, vitest, no new dependencies.

## Global Constraints

- Never use `Math.random()` — this MR introduces no RNG (reputation deltas and retaliation classification are deterministic reads).
- `state.currentPlayer` gates every new UI surface — never hardcode `'player'`.
- Every new `document.createElement('button')` must go through `createGameButton()` (`src/ui/ui-kit.ts`) except where an existing file's established local convention already uses a styled raw button (`hud-controller.ts`'s yields-row buttons) — match that file's own convention there, not `createGameButton`.
- No `innerHTML` with game-generated strings anywhere in this MR — `textContent`/`createTextNode()` only.
- Reputation deltas are spec-locked: **unprovoked first-use** target `-60` / witness `-25`; **retaliation** target `-20` / witness `-5`. Do not retune.
- Stage-3 confirmation copy is locked, serious-register, no gore/no casualty counts: `"The city lies in ruins."` / `"Fallout has devastated the surrounding region."`
- The stage-2 preview must **omit** (never stub) the arms-control-cap line (§12, MR6) and the retaliation-risk visibility note (§9/§10, MR5) — neither system exists yet.
- Every new interactive control needs a 44px touch target (`createGameButton` already enforces this), must be reduced-motion-safe, must be mute-safe (no sound-only signal), and must never rely on color alone.
- This MR does not resolve #545 — PR body must say "Part of #545", never "Closes #545".
- **AI never calls `executeStrategicLaunch` in this MR.** AI launch doctrine (first-use/retaliation willingness) is explicitly MR5's scope (spec §10), which reuses this MR's `strategicStrikesReceivedFrom` field rather than duplicating it. This MR's own scope is human-triggered UI plus the reputation/tracking backend both humans and a future AI caller will share — do not add an AI call site here.

---

### Task 1: Retaliation-tracking data model + save migration

**Files:**
- Modify: `src/core/types.ts` (`DiplomacyState` interface, line 1051-1058)
- Modify: `src/systems/diplomacy-system.ts` (`createDiplomacyState`, line 29-54)
- Modify: `src/storage/save-migrations.ts` (`CURRENT_SAVE_SCHEMA_VERSION` line 23, `SAVE_MIGRATIONS` table line 715-736)
- Test: `tests/storage/save-migrations.test.ts` (find the existing describe block for the most recent migration and add a sibling)
- Test: `tests/systems/diplomacy-system.test.ts` (add one assertion to whatever test already checks `createDiplomacyState`'s shape)

**Interfaces:**
- Produces: `DiplomacyState.strategicStrikesReceivedFrom: string[]` — the ids of every civ that has ever struck this civ with a strategic strike (deduplicated, append-only, never pruned). Task 3's `isStrategicStrikeRetaliation` and Task 4's `executeStrategicLaunch` both read/write this field.

- [x] **Step 1: Write the failing tests**

In `tests/systems/diplomacy-system.test.ts`, find the existing test(s) that assert `createDiplomacyState(...)`'s returned shape (search for `atWarWith: []`) and add:

```ts
  it('initializes strategicStrikesReceivedFrom empty (#545 MR4)', () => {
    const state = createDiplomacyState(['a', 'b'], 'a');
    expect(state.strategicStrikesReceivedFrom).toEqual([]);
  });
```

In `tests/storage/save-migrations.test.ts`, add a new describe block (place it near the other single-migration describe blocks, e.g. after whichever one currently tests migration 19):

```ts
describe('migration 20 -- strategicStrikesReceivedFrom default (#545 MR4)', () => {
  it('defaults strategicStrikesReceivedFrom to [] for every civ on an old save', () => {
    const civ = makeMinimalCiv('attacker'); // reuse this file's existing civ-fixture helper
    delete (civ.diplomacy as any).strategicStrikesReceivedFrom;
    const state = makeMinimalState({ civilizations: { attacker: civ } }); // reuse this file's existing state-fixture helper
    const migrated = SAVE_MIGRATIONS[20](state);
    expect(migrated.civilizations.attacker.diplomacy.strategicStrikesReceivedFrom).toEqual([]);
  });

  it('preserves an existing strategicStrikesReceivedFrom value (idempotent re-run)', () => {
    const civ = makeMinimalCiv('attacker');
    civ.diplomacy.strategicStrikesReceivedFrom = ['defender'];
    const state = makeMinimalState({ civilizations: { attacker: civ } });
    const migrated = SAVE_MIGRATIONS[20](state);
    expect(migrated.civilizations.attacker.diplomacy.strategicStrikesReceivedFrom).toEqual(['defender']);
  });
});
```

Before writing these, open `tests/storage/save-migrations.test.ts` and confirm the actual names of its civ/state fixture helpers (do not assume `makeMinimalCiv`/`makeMinimalState` are the real names — copy whatever the file already uses for a similar "one field defaulted" migration test, e.g. migration 15's or 17's own test).

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/diplomacy-system.test.ts tests/storage/save-migrations.test.ts`
Expected: FAIL — `strategicStrikesReceivedFrom` does not exist on the type, and `SAVE_MIGRATIONS[20]` is undefined.

- [x] **Step 3: Implement**

In `src/core/types.ts`, extend `DiplomacyState`:

```ts
export interface DiplomacyState {
  relationships: Record<string, number>;    // civId -> score (-100 to +100)
  treaties: Treaty[];
  events: DiplomaticEvent[];
  atWarWith: string[];
  treacheryScore: number;
  vassalage: VassalageState;
  /** #545 MR4 spec §11: ids of every civ that has ever struck this civ with a
   * strategic strike. Append-only, never pruned or decayed -- unlike the
   * capped rolling `events` log, a nuclear strike must never be "forgotten"
   * for retaliation-classification purposes. See strategic-launch-system.ts's
   * isStrategicStrikeRetaliation for the read side. */
  strategicStrikesReceivedFrom: string[];
}
```

In `src/systems/diplomacy-system.ts`, update `createDiplomacyState`'s return value:

```ts
  return {
    relationships,
    treaties: [],
    events: [],
    atWarWith: [],
    treacheryScore: 0,
    strategicStrikesReceivedFrom: [],
    vassalage: {
      overlord: null,
      vassals: [],
      protectionScore: 100,
      protectionTimers: [],
      peakCities: 0,
      peakMilitary: 0,
    },
  };
```

In `src/storage/save-migrations.ts`, bump the version and add the migration:

```ts
export const CURRENT_SAVE_SCHEMA_VERSION = 20;
```

```ts
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  // ...unchanged entries 1-19...
  20: state => ({
    ...state,
    civilizations: Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
      civId,
      {
        ...civ,
        diplomacy: {
          ...civ.diplomacy,
          strategicStrikesReceivedFrom: civ.diplomacy.strategicStrikesReceivedFrom ?? [],
        },
      },
    ])),
  }),
};
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/diplomacy-system.test.ts tests/storage/save-migrations.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/core/types.ts src/systems/diplomacy-system.ts src/storage/save-migrations.ts tests/systems/diplomacy-system.test.ts tests/storage/save-migrations.test.ts
git commit -m "feat(#545): add strategicStrikesReceivedFrom retaliation-tracking field (MR4 data model)"
```

---

### Task 2: Export shared primitives MR4 needs from MR2/MR3's files

**Files:**
- Modify: `src/systems/crisis-interaction-definitions.ts` (line 87, `applyBilateralRelationshipDelta`)
- Modify: `src/systems/strategic-strike-system.ts` (line 33 `STRIKE_BLAST_RADIUS`, add a new pure query after `resolveStrategicStrike`)
- Test: `tests/systems/crisis-interaction-definitions.test.ts` (find or add)
- Test: `tests/systems/strategic-strike-system.test.ts` (add a new describe block)

**Interfaces:**
- Consumes: `mapHexesInRange`, `hexKey` from `@/systems/hex-utils` (already imported in `strategic-strike-system.ts`); `getCityGarrisonUnit`, `SACK_GOLD_LOSS_FRACTION` (already imported in `strategic-strike-system.ts`).
- Produces: `applyBilateralRelationshipDelta(state, civAId, civBId, delta): GameState` (now exported, unchanged behavior). `STRIKE_BLAST_RADIUS: number` (now exported, value `3`, unchanged). `getStrategicStrikeBlastRadiusPreview(state: GameState, targetCityId: string): string[]` — the exact same tile-key set `applyStrategicFallout` would devastate, computed read-only with zero state mutation. `getStrategicStrikePreviewEffect(state: GameState, targetCityId: string): { hasGarrison: boolean; goldLost: number } | null` — the exact HP/gold outcome a real strike would produce, computed read-only, for the stage-2 preview's "expected city-HP/gold effect" requirement (spec §14). Task 4, Task 5, and Task 8 all depend on these exports.

- [x] **Step 1: Write the failing tests**

In `tests/systems/crisis-interaction-definitions.test.ts`, add (this function was previously untested because it was module-private and only reached through `applyInteractionReputation`; it already has full behavioral coverage indirectly, so this new test only needs to confirm the export exists and is directly callable):

```ts
import { applyBilateralRelationshipDelta } from '@/systems/crisis-interaction-definitions';
// ...
describe('applyBilateralRelationshipDelta (#545 MR4: exported for strike-reputation reuse)', () => {
  it('is directly callable and applies a symmetric bilateral delta', () => {
    const state = makeState({
      civilizations: {
        a: makeCiv({ id: 'a', diplomacy: { ...AT_PEACE_DIPLOMACY } }),
        b: makeCiv({ id: 'b', diplomacy: { ...AT_PEACE_DIPLOMACY } }),
      },
    });
    const next = applyBilateralRelationshipDelta(state, 'a', 'b', -10);
    expect(next.civilizations.a.diplomacy.relationships.b).toBe(-10);
    expect(next.civilizations.b.diplomacy.relationships.a).toBe(-10);
  });
});
```

Before writing this, open `tests/systems/crisis-interaction-definitions.test.ts` and copy its actual existing `makeState`/`makeCiv`/`AT_PEACE_DIPLOMACY`-equivalent fixture names — do not invent new ones if the file already has working fixtures for `applyInteractionReputation`'s own tests.

In `tests/systems/strategic-strike-system.test.ts`, add:

```ts
import { getStrategicStrikeBlastRadiusPreview, STRIKE_BLAST_RADIUS } from '@/systems/strategic-strike-system';

describe('getStrategicStrikeBlastRadiusPreview (#545 MR4 stage-2 preview)', () => {
  it('matches the exact tile set a real strike would devastate, without mutating state', () => {
    const state = makeStrikeState();
    const preview = getStrategicStrikeBlastRadiusPreview(state, 'target');
    const real = resolveStrategicStrike(state, 'attacker', 'target');
    if (!real.ok) throw new Error(`expected ok, got reason=${real.reason}`);
    expect(new Set(preview)).toEqual(new Set(real.devastatedTileKeys));
  });

  it('does not mutate the input state', () => {
    const state = makeStrikeState();
    const before = JSON.stringify(state.map.tiles);
    getStrategicStrikeBlastRadiusPreview(state, 'target');
    expect(JSON.stringify(state.map.tiles)).toBe(before);
  });

  it('exports STRIKE_BLAST_RADIUS as 3', () => {
    expect(STRIKE_BLAST_RADIUS).toBe(3);
  });
});

describe('getStrategicStrikePreviewEffect (#545 MR4 stage-2 preview)', () => {
  it('predicts the exact gold loss for an undefended target, matching a real strike', () => {
    const state = makeStrikeState();
    const preview = getStrategicStrikePreviewEffect(state, 'target');
    const real = resolveStrategicStrike(state, 'attacker', 'target');
    if (!real.ok) throw new Error(`expected ok, got reason=${real.reason}`);
    expect(preview).toEqual({ hasGarrison: false, goldLost: real.goldLost });
  });

  it('predicts hasGarrison true and zero gold loss for a garrisoned target', () => {
    const state = makeStrikeState({
      units: { g1: { id: 'g1', type: 'warrior', owner: 'defender', position: { q: 0, r: 0 } } as any },
    });
    expect(getStrategicStrikePreviewEffect(state, 'target')).toEqual({ hasGarrison: true, goldLost: 0 });
  });

  it('is null for an unknown city', () => {
    expect(getStrategicStrikePreviewEffect(makeStrikeState(), 'nope')).toBeNull();
  });
});
```

Before finalizing the garrisoned-target test, confirm the exact fixture shape `getCityGarrisonUnit` expects for "this unit garrisons this city" against its real implementation in `city-siege-system.ts` (it may key off unit position matching city position, a dedicated `garrisonedCityId` field, or something else) — adjust the `g1` fixture unit above to actually satisfy it rather than assuming position-matching is sufficient.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/crisis-interaction-definitions.test.ts tests/systems/strategic-strike-system.test.ts`
Expected: FAIL — `applyBilateralRelationshipDelta` is not exported, `getStrategicStrikeBlastRadiusPreview`/`STRIKE_BLAST_RADIUS` are not exported.

- [x] **Step 3: Implement**

In `src/systems/crisis-interaction-definitions.ts`, remove the leading nothing and just add `export` (no logic change):

```ts
export function applyBilateralRelationshipDelta(
  state: GameState,
  civAId: string,
  civBId: string,
  delta: number,
): GameState {
```

In `src/systems/strategic-strike-system.ts`, export the constant and add the new query right after `resolveStrategicStrike` (before `applyStrategicFallout`):

```ts
export const STRIKE_BLAST_RADIUS = 3;
```

(remove the old `const STRIKE_BLAST_RADIUS = 3;` line — this is the same declaration, just exported.)

```ts
/**
 * #545 MR4: read-only preview of exactly which tiles a strike against
 * `targetCityId` would devastate, for the stage-2 launch-flow map overlay.
 * Mirrors applyStrategicFallout's own tile selection exactly (same
 * STRIKE_BLAST_RADIUS constant, same defending-civ ownership filter) so the
 * preview can never drift from what a real strike actually does -- but never
 * mutates state, since no strike has been committed yet.
 */
export function getStrategicStrikeBlastRadiusPreview(state: GameState, targetCityId: string): string[] {
  const targetCity = state.cities[targetCityId];
  if (!targetCity) return [];
  return mapHexesInRange(state.map, targetCity.position, STRIKE_BLAST_RADIUS)
    .map(hexKey)
    .filter(key => state.map.tiles[key]?.owner === targetCity.owner);
}

/**
 * #545 MR4 spec §14 stage 2: predicts the exact HP/gold outcome a real
 * strike would produce, without executing one. hasGarrison alone decides
 * both branches, mirroring resolveStrategicStrike's own gold-loss gate
 * exactly (see that function's docblock) -- HP always floors to 1 when
 * undefended; a garrisoned city's HP outcome is `resolveCitySiegeDamage`'s
 * own internal defense math, which this preview does not attempt to predict
 * exactly (only the gold/garrison fact, which IS exactly reproducible).
 */
export function getStrategicStrikePreviewEffect(
  state: GameState,
  targetCityId: string,
): { hasGarrison: boolean; goldLost: number } | null {
  const targetCity = state.cities[targetCityId];
  if (!targetCity) return null;
  const targetCiv = state.civilizations[targetCity.owner];
  if (!targetCiv) return null;
  const hasGarrison = getCityGarrisonUnit(state.units, targetCity) !== undefined;
  const goldLost = hasGarrison ? 0 : Math.round(targetCiv.gold * SACK_GOLD_LOSS_FRACTION);
  return { hasGarrison, goldLost };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/crisis-interaction-definitions.test.ts tests/systems/strategic-strike-system.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/crisis-interaction-definitions.ts src/systems/strategic-strike-system.ts tests/systems/crisis-interaction-definitions.test.ts tests/systems/strategic-strike-system.test.ts
git commit -m "feat(#545): export applyBilateralRelationshipDelta and add blast-radius preview query (MR4 shared primitives)"
```

---

### Task 3: Retaliation classification + legal-targets query in `strategic-launch-system.ts`

**Files:**
- Modify: `src/systems/strategic-launch-system.ts`
- Test: `tests/systems/strategic-launch-system.test.ts`

**Interfaces:**
- Consumes: `DiplomacyState.strategicStrikesReceivedFrom` (Task 1), `getStrategicLaunchLegality` (existing, same file).
- Produces: `isStrategicStrikeRetaliation(state, actorCivId, targetCivId): boolean` and `getLegalStrategicLaunchTargets(state, actorCivId): City[]`. Task 4 (`executeStrategicLaunch`) and Task 8 (stage-2 target list + reputation-magnitude preview text) both call these directly.

- [x] **Step 1: Write the failing tests**

Add to `tests/systems/strategic-launch-system.test.ts` (reuse the file's existing `makeState` helper):

```ts
import { getLegalStrategicLaunchTargets, isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';

describe('isStrategicStrikeRetaliation (#545 MR4 §11)', () => {
  it('is false when the actor has never been struck by the target', () => {
    const state = makeState({
      civilizations: { a: { id: 'a', diplomacy: { strategicStrikesReceivedFrom: [] } } as any },
    });
    expect(isStrategicStrikeRetaliation(state, 'a', 'b')).toBe(false);
  });

  it('is true when the target previously struck the actor', () => {
    const state = makeState({
      civilizations: { a: { id: 'a', diplomacy: { strategicStrikesReceivedFrom: ['b'] } } as any },
    });
    expect(isStrategicStrikeRetaliation(state, 'a', 'b')).toBe(true);
  });

  it('is false for an unknown actor civ', () => {
    expect(isStrategicStrikeRetaliation(makeState(), 'nobody', 'b')).toBe(false);
  });
});

describe('getLegalStrategicLaunchTargets (#545 MR4 §14 stage 2)', () => {
  it('is empty when the actor has no eligible platform', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p2', position: { q: 0, r: 0 }, buildings: [] } as any },
    });
    expect(getLegalStrategicLaunchTargets(state, 'p1')).toEqual([]);
  });

  it('includes only cities that pass getStrategicLaunchLegality', () => {
    const state = makeState({
      cities: {
        silo: { id: 'silo', name: 'Silo', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
        legal: { id: 'legal', name: 'Legal', owner: 'p2', position: { q: 1, r: 1 }, buildings: [] } as any,
        atPeace: { id: 'atPeace', name: 'AtPeace', owner: 'p3', position: { q: 2, r: 2 }, buildings: [] } as any,
      },
      civilizations: {
        p1: { id: 'p1', strategicArsenal: 1, diplomacy: { atWarWith: ['p2'] }, visibility: { tiles: { [hexKey({ q: 1, r: 1 })]: 'visible' }, lastSeen: {} } } as any,
        p2: { id: 'p2' } as any,
        p3: { id: 'p3' } as any,
      },
    });
    const targets = getLegalStrategicLaunchTargets(state, 'p1');
    expect(targets.map(c => c.id)).toEqual(['legal']);
  });
});
```

Verify against the real `getStrategicLaunchLegality` fixture shape used earlier in this same file (`visibleAt`, `BUILDINGS`) — adjust the `visibility`/`diplomacy` shape above to match whatever this file's existing tests already use for `hasDiscoveredCity`/`isAtWar`, rather than guessing a new shape.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-system.test.ts`
Expected: FAIL — both functions undefined.

- [x] **Step 3: Implement**

Append to `src/systems/strategic-launch-system.ts` (after `getStrategicLaunchLegality`):

```ts
/**
 * #545 MR4 spec §11: classifies a strike by actorCivId against targetCivId as
 * retaliation iff targetCivId has struck actorCivId at least once before.
 * Pure read of DiplomacyState.strategicStrikesReceivedFrom (MR4) -- safe to
 * call with either pre- or post-strike state, since resolveStrategicStrike
 * (MR3) never touches this field itself.
 */
export function isStrategicStrikeRetaliation(
  state: GameState,
  actorCivId: string,
  targetCivId: string,
): boolean {
  const actorCiv = state.civilizations[actorCivId];
  if (!actorCiv) return false;
  return actorCiv.diplomacy.strategicStrikesReceivedFrom.includes(targetCivId);
}

/**
 * #545 MR4 spec §14 stage 2: every city that is currently a legal strike
 * target for actorCivId, reusing getStrategicLaunchLegality per-candidate --
 * never a separate reimplementation of any of its four conditions.
 */
export function getLegalStrategicLaunchTargets(state: GameState, actorCivId: string): City[] {
  return Object.values(state.cities).filter(
    city => getStrategicLaunchLegality(state, actorCivId, city.id).ok,
  );
}
```

Add `City` to this file's existing `import type { GameState, HexCoord, UnitType } from '@/core/types';` line.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-system.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): add isStrategicStrikeRetaliation and getLegalStrategicLaunchTargets (MR4)"
```

---

### Task 4: `executeStrategicLaunch` orchestration (new file, avoids the MR2/MR3 import cycle)

**Files:**
- Create: `src/systems/strategic-launch-execution-system.ts`
- Test: `tests/systems/strategic-launch-execution-system.test.ts`

**Interfaces:**
- Consumes: `resolveStrategicStrike`, `StrategicStrikeResult` (`@/systems/strategic-strike-system`, Task 2); `isStrategicStrikeRetaliation` (`@/systems/strategic-launch-system`, Task 3); `getWitnessCivIds`, `applyBilateralRelationshipDelta` (`@/systems/crisis-interaction-definitions`, Task 2).
- Produces: `executeStrategicLaunch(state, actorCivId, targetCityId): StrategicStrikeResult` — **the only function UI code may call to launch a strike.** Task 8/9 (UI) call this exclusively; nothing in this MR calls `resolveStrategicStrike` directly outside its own MR3 test file.

**Design note (why this is a new file, not added to `strategic-launch-system.ts`):** `strategic-strike-system.ts` already imports `getStrategicLaunchLegality` from `strategic-launch-system.ts`. If `executeStrategicLaunch` (which must call `resolveStrategicStrike`) lived in `strategic-launch-system.ts`, that file would need to import back from `strategic-strike-system.ts`, creating a circular import. A new file that only *consumes* both existing files avoids this entirely.

- [x] **Step 1: Write the failing tests**

Create `tests/systems/strategic-launch-execution-system.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { City, Civilization, GameState, HexCoord, HexTile } from '@/core/types';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

const ACTOR_CITY_POS: HexCoord = { q: -10, r: -10 };
const TARGET_POS: HexCoord = { q: 0, r: 0 };

const AT_PEACE = {
  relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
  strategicStrikesReceivedFrom: [] as string[],
  vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
};
const attackerAtWar = { ...AT_PEACE, atWarWith: ['defender'] };
const defenderAtWar = { ...AT_PEACE, atWarWith: ['attacker'] };

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return {
    coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function makeCiv(overrides: Partial<Civilization> = {}): Civilization {
  return {
    id: 'attacker', name: 'Attacker', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 1000, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: AT_PEACE,
    ...overrides,
  } as Civilization;
}

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'target', name: 'Target', owner: 'defender', position: TARGET_POS,
    population: 5, food: 0, foodNeeded: 20, buildings: [], productionQueue: [],
    productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
    ...overrides,
  } as City;
}

function makeExecutionState(overrides: Partial<GameState> = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  for (const coord of hexesInRange(TARGET_POS, 4)) tiles[hexKey(coord)] = makeTile(coord, 'defender');
  tiles[hexKey(ACTOR_CITY_POS)] = makeTile(ACTOR_CITY_POS, 'attacker');

  return {
    turn: 50, era: 10, currentPlayer: 'attacker', gameOver: false, winner: null,
    map: { width: 60, height: 60, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      silo: { id: 'silo', name: 'Silo City', owner: 'attacker', position: ACTOR_CITY_POS, buildings: ['missile_silo'] } as any,
      target: makeCity(),
    },
    civilizations: {
      attacker: makeCiv({
        id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
        visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
      }),
      defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
    },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [],
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 1, nextCityId: 1, nextRouteId: 1 },
    ...overrides,
  } as GameState;
}

describe('executeStrategicLaunch (#545 MR4 §11)', () => {
  it('applies unprovoked first-use deltas (-60 target) when the actor has never been struck', () => {
    const state = makeExecutionState();
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.defender).toBe(-60);
    expect(result.state.civilizations.defender.diplomacy.relationships.attacker).toBe(-60);
  });

  it('records the strike so the target civ can classify a future counter-strike as retaliation', () => {
    const state = makeExecutionState();
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.defender.diplomacy.strategicStrikesReceivedFrom).toEqual(['attacker']);
  });

  it('applies retaliation deltas (-20 target) when the actor was struck by the target civ first', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 1,
          diplomacy: { ...attackerAtWar, strategicStrikesReceivedFrom: ['defender'] },
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
        }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.defender).toBe(-20);
  });

  it('applies witness deltas to a civ that has met both actor and target', () => {
    const state = makeExecutionState({
      civilizations: {
        attacker: makeCiv({
          id: 'attacker', cities: ['silo'], strategicArsenal: 1, diplomacy: attackerAtWar,
          visibility: { tiles: { [hexKey(TARGET_POS)]: 'visible' as const }, lastSeen: {} },
        }),
        defender: makeCiv({ id: 'defender', name: 'Defender', gold: 1000, cities: ['target'], diplomacy: defenderAtWar }),
        witness: makeCiv({ id: 'witness', name: 'Witness', diplomacy: { ...AT_PEACE, relationships: { attacker: 0, defender: 0 } } }),
      },
    });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    if (!result.ok) throw new Error(`expected ok, got reason=${result.reason}`);
    expect(result.state.civilizations.attacker.diplomacy.relationships.witness).toBe(-25);
  });

  it('passes through legality failures unchanged (never applies reputation on a failed launch)', () => {
    const state = makeExecutionState({ civilizations: { attacker: makeCiv({ id: 'attacker', strategicArsenal: 0 }) } });
    const result = executeStrategicLaunch(state, 'attacker', 'target');
    expect(result.ok).toBe(false);
  });
});
```

Note: `getWitnessCivIds` requires both civs to have "met" both parties (`hasMetCivilization`) — before finalizing this step, open `discovery-system.ts`'s `hasMetCivilization` and confirm what state shape satisfies it for the `witness` fixture above (it may need an explicit `metCivilizations`/`discoveredCivs`-style field rather than just existing in `state.civilizations`) and adjust the witness test's fixture accordingly so it actually exercises the witness path rather than silently asserting `-25` against a witness the function would have excluded anyway.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-execution-system.test.ts`
Expected: FAIL — module does not exist.

- [x] **Step 3: Implement**

Create `src/systems/strategic-launch-execution-system.ts`:

```ts
import type { GameState } from '@/core/types';
import { resolveStrategicStrike, type StrategicStrikeResult } from '@/systems/strategic-strike-system';
import { isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';
import { getWitnessCivIds, applyBilateralRelationshipDelta } from '@/systems/crisis-interaction-definitions';

// #545 spec §11: unprovoked first use is a much harsher penalty than
// retaliation against a civ that struck you first. No separate
// "self-defense" tier -- these two are the only cases.
const STRIKE_REPUTATION_DELTAS = {
  unprovoked: { target: -60, witness: -25 },
  retaliation: { target: -20, witness: -5 },
} as const;

function applyStrategicStrikeReputation(
  state: GameState,
  actorId: string,
  targetId: string,
  deltas: { target: number; witness: number },
): GameState {
  const witnessIds = getWitnessCivIds(state, actorId, targetId);
  let next = applyBilateralRelationshipDelta(state, actorId, targetId, deltas.target);
  for (const witnessId of witnessIds) {
    next = applyBilateralRelationshipDelta(next, actorId, witnessId, deltas.witness);
  }
  return next;
}

function recordStrategicStrikeReceived(state: GameState, actorId: string, targetCivId: string): GameState {
  const targetCiv = state.civilizations[targetCivId];
  if (!targetCiv || targetCiv.diplomacy.strategicStrikesReceivedFrom.includes(actorId)) return state;
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [targetCivId]: {
        ...targetCiv,
        diplomacy: {
          ...targetCiv.diplomacy,
          strategicStrikesReceivedFrom: [...targetCiv.diplomacy.strategicStrikesReceivedFrom, actorId],
        },
      },
    },
  };
}

/**
 * #545 MR4: the ONLY entry point UI code may call to launch a strategic
 * strike. Wraps MR3's resolveStrategicStrike with spec §11's reputation
 * consequences and the retaliation-tracking write -- UI code must never call
 * resolveStrategicStrike directly, or a strike would silently skip
 * reputation/witness consequences and retaliation tracking.
 *
 * Retaliation is classified using the PRE-strike state's
 * strategicStrikesReceivedFrom (equivalently the post-strike state, since
 * resolveStrategicStrike never touches this field) -- see
 * isStrategicStrikeRetaliation's own doc comment.
 */
export function executeStrategicLaunch(
  state: GameState,
  actorCivId: string,
  targetCityId: string,
): StrategicStrikeResult {
  const result = resolveStrategicStrike(state, actorCivId, targetCityId);
  if (!result.ok) return result;

  const targetCity = result.state.cities[targetCityId]!;
  const targetCivId = targetCity.owner;
  const deltas = isStrategicStrikeRetaliation(result.state, actorCivId, targetCivId)
    ? STRIKE_REPUTATION_DELTAS.retaliation
    : STRIKE_REPUTATION_DELTAS.unprovoked;

  let nextState = applyStrategicStrikeReputation(result.state, actorCivId, targetCivId, deltas);
  nextState = recordStrategicStrikeReceived(nextState, actorCivId, targetCivId);

  return { ...result, state: nextState };
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-execution-system.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-execution-system.ts tests/systems/strategic-launch-execution-system.test.ts
git commit -m "feat(#545): add executeStrategicLaunch -- reputation/witness consequences + retaliation tracking (MR4 §11)"
```

---

### Task 5: Blast-radius map overlay (presentation + renderer + render-loop wiring)

**Files:**
- Create: `src/systems/strategic-launch-preview-presentation.ts`
- Create: `src/renderer/strategic-launch-overlay-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/systems/strategic-launch-preview-presentation.test.ts`
- Test: `tests/renderer/strategic-launch-overlay-renderer.test.ts` (mirror whatever test shape `tests/renderer/supply-overlay-renderer.test.ts` already uses, if that file exists — check first)

**Interfaces:**
- Consumes: `getStrategicStrikeBlastRadiusPreview` (Task 2).
- Produces: `StrategicLaunchPreviewPresentation` type + `getStrategicLaunchPreviewPresentation(state, targetCityId)`; `drawStrategicLaunchPreviewOverlay(ctx, presentation, mapWidth, mapHeight, camera, wrapsHorizontally)`; `RenderLoop.setStrategicLaunchPreview(presentation | null)`. Task 8 (the 3-stage flow) calls `setStrategicLaunchPreview` on stage-2 entry/exit.

- [x] **Step 1: Write the failing tests**

Create `tests/systems/strategic-launch-preview-presentation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameState, HexCoord, HexTile } from '@/core/types';
import { getStrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';
import { hexKey, hexesInRange } from '@/systems/hex-utils';

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return { coord, terrain: 'hills', elevation: 'lowland', resource: null, improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
}

describe('getStrategicLaunchPreviewPresentation (#545 MR4 §14 stage 2 map overlay)', () => {
  it('presents every tile getStrategicStrikeBlastRadiusPreview returns, as hex coords', () => {
    const targetPos: HexCoord = { q: 0, r: 0 };
    const tiles: Record<string, HexTile> = {};
    for (const coord of hexesInRange(targetPos, 4)) tiles[hexKey(coord)] = makeTile(coord, 'defender');
    const state = {
      map: { width: 40, height: 40, tiles, wrapsHorizontally: false, rivers: [] },
      cities: { target: { id: 'target', owner: 'defender', position: targetPos } as any },
    } as unknown as GameState;

    const presentation = getStrategicLaunchPreviewPresentation(state, 'target');
    expect(presentation.tiles.length).toBeGreaterThan(0);
    expect(presentation.tiles.every(t => tiles[hexKey(t.coord)]?.owner === 'defender')).toBe(true);
  });

  it('is empty for an unknown city', () => {
    const state = { map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] }, cities: {} } as unknown as GameState;
    expect(getStrategicLaunchPreviewPresentation(state, 'nope').tiles).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-preview-presentation.test.ts`
Expected: FAIL — module does not exist.

- [x] **Step 3: Implement**

Create `src/systems/strategic-launch-preview-presentation.ts`:

```ts
import type { GameState, HexCoord } from '@/core/types';
import { getStrategicStrikeBlastRadiusPreview } from '@/systems/strategic-strike-system';
import { parseHexKey } from '@/systems/hex-utils';

export interface StrategicLaunchPreviewPresentation {
  tiles: Array<{ coord: HexCoord }>;
}

/**
 * #545 MR4 §14 stage 2: viewer-facing presentation for the blast-radius map
 * overlay, mirroring supply-overlay-presentation.ts's own
 * presentation/pure-renderer split. Thin wrapper over
 * getStrategicStrikeBlastRadiusPreview (MR3/MR4) -- all real geometry lives
 * there so the overlay can never drift from the real fallout.
 */
export function getStrategicLaunchPreviewPresentation(
  state: GameState,
  targetCityId: string,
): StrategicLaunchPreviewPresentation {
  const keys = getStrategicStrikeBlastRadiusPreview(state, targetCityId);
  return { tiles: keys.map(key => ({ coord: parseHexKey(key) })) };
}
```

(`parseHexKey` is verified this session to already exist and be exported from `hex-utils.ts` — the exact inverse of `hexKey` this file needs.)

Create `src/renderer/strategic-launch-overlay-renderer.ts`:

```ts
import { hexToPixel, HEX_CORNERS_POINTY } from '@/systems/hex-utils';
import type { StrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';
import type { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';

// Distinct from supply-overlay-renderer.ts's greens/yellows -- a strike
// preview must read as unambiguously hostile/dangerous. Never the only
// signal: the launch-flow UI's text preview (stage 2) spells out the exact
// tile count and effect in words alongside this overlay.
const BLAST_RADIUS_FILL = 'rgba(200, 60, 40, 0.30)';
const BLAST_RADIUS_STROKE = 'rgba(255, 120, 90, 0.55)';

export function drawStrategicLaunchPreviewOverlay(
  ctx: CanvasRenderingContext2D,
  presentation: StrategicLaunchPreviewPresentation,
  mapWidth: number,
  mapHeight: number,
  camera: Camera,
  wrapsHorizontally: boolean,
): void {
  const size = camera.hexSize;
  for (const tile of presentation.tiles) {
    const renderCoords = wrapsHorizontally
      ? getHorizontalWrapRenderCoords(tile.coord, mapWidth, camera)
      : [tile.coord];
    for (const renderCoord of renderCoords) {
      if (!camera.isHexVisible(renderCoord)) continue;
      const pixel = hexToPixel(renderCoord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = HEX_CORNERS_POINTY[i]!;
        const x = screen.x + corner.x * scaledSize;
        const y = screen.y + corner.y * scaledSize;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = BLAST_RADIUS_FILL;
      ctx.fill();
      ctx.strokeStyle = BLAST_RADIUS_STROKE;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
```

Verify this exact hex-corner-drawing loop against the real `supply-overlay-renderer.ts` body (read the rest of that file past what this session already saw, lines 50-71) before finalizing — copy its precise corner-iteration code rather than approximating it, so both overlays render pixel-identically.

In `src/renderer/render-loop.ts`, add a field, setter, and draw call mirroring `supplyOverlayPresentation` (near line 332-346):

```ts
  private strategicLaunchPreview: StrategicLaunchPreviewPresentation | null = null;

  /** #545 MR4: set by strategic-launch-flow.ts on stage-2 entry, cleared on
   * stage-2 exit (cancel, back, or advancing to stage 3) and on flow close. */
  setStrategicLaunchPreview(presentation: StrategicLaunchPreviewPresentation | null): void {
    this.strategicLaunchPreview = presentation;
  }
```

Add the import at the top: `import { drawStrategicLaunchPreviewOverlay } from './strategic-launch-overlay-renderer';` and `import type { StrategicLaunchPreviewPresentation } from '@/systems/strategic-launch-preview-presentation';`.

Add the draw call right after the existing supply-overlay draw call (around line 843, still before fog):

```ts
    if (this.strategicLaunchPreview) {
      drawStrategicLaunchPreviewOverlay(
        this.ctx,
        this.strategicLaunchPreview,
        this.state.map.width,
        this.state.map.height,
        this.camera,
        this.state.map.wrapsHorizontally,
      );
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-launch-preview-presentation.test.ts`
Expected: PASS. (The renderer file has no meaningful pure-logic branch to unit test beyond "does it run without throwing" — check whether `tests/renderer/supply-overlay-renderer.test.ts` exists and, if so, mirror its exact test shape for the new renderer; if it doesn't exist, skip a dedicated renderer test file and rely on `yarn build`'s typecheck plus a manual smoke check in Task 8's browser verification.)

- [x] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-preview-presentation.ts src/renderer/strategic-launch-overlay-renderer.ts src/renderer/render-loop.ts tests/systems/strategic-launch-preview-presentation.test.ts
git commit -m "feat(#545): add strategic-launch blast-radius map overlay (MR4 §14 stage 2)"
```

---

### Task 6: Missile Silo "Prepare Strategic Launch" building action

**Files:**
- Modify: `src/ui/city-panel.ts`
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `getStrategicArsenal`, `getStrategicArsenalCapacity` (`@/systems/strategic-arsenal-system`).
- Produces: `CityPanelCallbacks.onPrepareStrategicLaunch?: (cityId: string) => void`. Task 9 wires this to actually open the flow.

- [x] **Step 1: Write the failing tests**

`tests/ui/city-panel.test.ts` (verified this session) calls `createCityPanel(container, city, state, callbacks)` directly, using the shared `makeWonderPanelFixture()` helper (from `./helpers/wonder-panel-fixture`) for `{ container, city, state }`, and this file's own `clickElement(el)` helper (`el!.dispatchEvent(new MouseEvent('click', { bubbles: true }))`) for interaction — mirror the existing Circular Manufacturing Network describe block (search `data-circular-material` in this file) exactly, since that is the closest existing precedent for a `city.buildings`-gated conditional action section. Add:

```ts
describe('Prepare Strategic Launch action (#545 MR4 §14 stage 1)', () => {
  it('shows the action with current arsenal count when the city has a missile_silo', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.civilizations.player.strategicArsenal = 2;
    const onPrepareStrategicLaunch = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      onPrepareStrategicLaunch,
    });

    expect(collectText(panel)).toContain('Strategic Arsenal: 2 / ');
    clickElement(panel.querySelector('[data-action="prepare-strategic-launch"]'));
    expect(onPrepareStrategicLaunch).toHaveBeenCalledWith(city.id);
  });

  it('is absent without a missile_silo', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.querySelector('[data-action="prepare-strategic-launch"]')).toBeNull();
  });

  it('is disabled with a reason when arsenal is 0', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const button = panel.querySelector('[data-action="prepare-strategic-launch"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(collectText(panel)).toContain('No warheads in arsenal.');
  });

  it('is absent for another player\'s city in hot-seat (currentPlayer gate)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.currentPlayer = 'player-2';
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.querySelector('[data-action="prepare-strategic-launch"]')).toBeNull();
  });
});
```

Verified this session: `makeWonderPanelFixture()` delegates to `makeLegendaryWonderFixture` (`tests/systems/helpers/legendary-wonder-fixture.ts`), whose civ id is `'player'`, `currentPlayer` is `'player'`, `isHuman: true`, and `strategicArsenal` is unset (so `getStrategicArsenal` correctly reads `0` by default) — the fixture code above matches this exactly, no adjustment needed.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`
Expected: FAIL — no such button exists yet.

- [x] **Step 3: Implement**

In `src/ui/city-panel.ts`, add `onPrepareStrategicLaunch?: (cityId: string) => void;` to the `CityPanelCallbacks` interface (wherever `onChooseCircularManufacturingMaterial` is declared).

Add a new conditional section, modeled directly on the Circular Manufacturing Network block (city-panel.ts:1315-1339), inserted at the same point in the render function:

```ts
  if (city.buildings.includes('missile_silo') && city.owner === state.currentPlayer && currentCiv.isHuman) {
    const arsenal = getStrategicArsenal(currentCiv);
    const capacity = getStrategicArsenalCapacity(state, currentCiv.id);
    const launchSection = document.createElement('section');
    launchSection.dataset.role = 'strategic-launch-action';
    launchSection.style.cssText = 'background:rgba(200,60,40,0.10);border:1px solid rgba(200,60,40,0.4);border-radius:8px;padding:10px 12px;margin:0 0 16px;font-size:12px;';
    const title = document.createElement('div');
    title.textContent = `Strategic Arsenal: ${arsenal} / ${capacity} warheads`;
    title.style.cssText = 'font-weight:bold;color:#e8917a;margin-bottom:4px;';
    launchSection.appendChild(title);
    const launchButton = createGameButton('Prepare Strategic Launch', 'danger', { disabled: arsenal < 1 });
    launchButton.dataset.action = 'prepare-strategic-launch';
    if (arsenal < 1) {
      const reason = document.createElement('div');
      reason.textContent = 'No warheads in arsenal.';
      reason.style.cssText = 'opacity:0.7;margin-top:6px;';
      launchSection.appendChild(reason);
    }
    launchButton.addEventListener('click', () => callbacks.onPrepareStrategicLaunch?.(city.id));
    launchSection.appendChild(launchButton);
    panel.insertBefore(launchSection, panel.firstChild);
  }
```

Add the import: `import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(#545): add Prepare Strategic Launch action to Missile Silo city panel (MR4 §14 stage 1)"
```

---

### Task 7: Missile Submarine "Prepare Strategic Launch" unit action

**Files:**
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/app/controllers/selection-controller.ts`
- Test: `tests/ui/selected-unit-info.test.ts`

**Interfaces:**
- Produces: `SelectedUnitInfoCallbacks.onPrepareStrategicLaunch?: (unitId: string) => void`, wired in `selection-controller.ts`'s `renderSelectedUnitInfo(...)` call.

- [x] **Step 1: Write the failing tests**

`tests/ui/selected-unit-info.test.ts` (verified this session) uses its own lightweight `MockElement`/`MockDocument` (not jsdom) plus `findButtons(node)` (recursively collects `MockElement`s with `tagName === 'BUTTON'`), `collectAllText(node)`, and calls `renderSelectedUnitInfo(container as unknown as HTMLElement, state, unitId, callbacks)` directly, with `container = new MockElement('div')`. The closest existing precedent is the General Rally-button block (`describe('#544 MR4 — General command panel', ...)`, line 300-364) — mirror it exactly:

```ts
describe('Prepare Strategic Launch action (#545 MR4 §14 stage 1)', () => {
  beforeEach(installMockDocument);
  afterEach(restoreMockDocument);

  function makeSubmarineState(strategicArsenal: number) {
    const state = createNewGame(undefined, 'strategic-launch-sub-action', 'small');
    const unit = { ...createUnit('missile_submarine', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'u1' };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    state.civilizations.player.strategicArsenal = strategicArsenal;
    return state;
  }

  it('shows the action for a missile_submarine with arsenal available', () => {
    const onPrepareStrategicLaunch = vi.fn();
    const state = makeSubmarineState(1);
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', { onPrepareStrategicLaunch });

    const launchButton = findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))!;
    expect(launchButton).toBeTruthy();
    expect(launchButton.disabled).toBe(false);
    launchButton.click();
    expect(onPrepareStrategicLaunch).toHaveBeenCalledWith('u1');
  });

  it('is disabled with a visible reason when arsenal is 0', () => {
    const state = makeSubmarineState(0);
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    const launchButton = findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))!;
    expect(launchButton.disabled).toBe(true);
    expect(collectAllText(container).join(' ')).toContain('No warheads in arsenal.');
  });

  it('is absent for a non-launch-platform unit (e.g. a plain warrior)', () => {
    const state = createNewGame(undefined, 'strategic-launch-warrior', 'small');
    const unit = { ...createUnit('warrior', 'player', { q: 15, r: 15 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 }), id: 'u1' };
    state.currentPlayer = 'player';
    state.units = { u1: unit };
    state.civilizations.player.units = ['u1'];
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))).toBeUndefined();
  });

  it('is absent on an enemy-owned missile_submarine, even in range with arsenal available (hot-seat/ownership regression)', () => {
    const state = makeSubmarineState(1);
    state.units.u1 = { ...state.units.u1, owner: 'rival' };
    state.currentPlayer = 'player'; // the viewing player does NOT own this submarine
    const container = new MockElement('div');
    renderSelectedUnitInfo(container as unknown as HTMLElement, state, 'u1', {});
    expect(findButtons(container).find(b => /^Prepare Strategic Launch/.test(b.textContent ?? ''))).toBeUndefined();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement**

In `src/ui/selected-unit-info.ts`, add `onPrepareStrategicLaunch?: (unitId: string) => void;` to the callbacks interface (near `onFortify`).

Add a conditional block inside the function that builds `actionsDiv` (near the other unit-type-conditional blocks, e.g. after the Fortify block). **Correction found during execution:** `actionsDiv` has no single shared ownership gate — line 553's `if (unit.owner === state.currentPlayer)` closes well before `actionsDiv` is even declared (line 614); each individual action inside `actionsDiv` re-checks `unit.owner === state.currentPlayer` itself (e.g. the auto-explore block: `if (unit.owner === state.currentPlayer && !unit.automation && callbacks.onStartAutoExplore)`). A hot-seat/ownership regression test caught this: placing the new block without its own explicit check let it render (and crash, since an enemy civ record wasn't in the minimal fixture) on a unit the viewer didn't own. **Add the ownership check explicitly to this block's own condition**, matching the auto-explore pattern, not the Fortify block's caller-side-only gating:

```ts
  if (unit.type === 'missile_submarine' && unit.owner === state.currentPlayer) {
    // No single reusable owner-civ local exists in this file (verified this
    // session) -- every other block reads state.civilizations[unit.owner]
    // inline (e.g. line 488, 698, 1005); match that idiom here.
    const arsenal = getStrategicArsenal(state.civilizations[unit.owner]!);
    const launchButton = createGameButton('Prepare Strategic Launch', 'danger', { disabled: arsenal < 1 });
    launchButton.dataset.action = 'prepare-strategic-launch';
    launchButton.addEventListener('click', () => callbacks.onPrepareStrategicLaunch?.(unit.id));
    actionsDiv.appendChild(launchButton);
    if (arsenal < 1) {
      const reason = document.createElement('div');
      reason.textContent = 'No warheads in arsenal.';
      reason.style.cssText = 'font-size:11px;opacity:0.7;margin-top:4px;width:100%;';
      actionsDiv.appendChild(reason);
    }
  }
```

Add the import: `import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';`.

In `src/app/controllers/selection-controller.ts`, add to the `renderSelectedUnitInfo(...)` callbacks object (alongside `onOpenRally`):

```ts
        onPrepareStrategicLaunch: (subUnitId: string) => {
          const unit = session.getState().units[subUnitId];
          if (!unit) return;
          openStrategicLaunchFlow(deps, unit.owner); // implemented in Task 9
        },
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/selected-unit-info.test.ts`
Expected: PASS (Task 9 has not yet defined `openStrategicLaunchFlow` — if `yarn build`'s typecheck fails on this reference before Task 9 lands, stub it as a local no-op function in this task's own commit and replace it in Task 9's commit, rather than leaving the repo in a non-building state between tasks.)

- [x] **Step 5: Commit**

```bash
git add src/ui/selected-unit-info.ts src/app/controllers/selection-controller.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(#545): add Prepare Strategic Launch action to Missile Submarine unit panel (MR4 §14 stage 1)"
```

---

### Task 8: The 3-stage launch flow component (target+preview, then confirmation)

**Files:**
- Create: `src/ui/strategic-launch-flow.ts`
- Test: `tests/ui/strategic-launch-flow.test.ts`

**Interfaces:**
- Consumes: `getLegalStrategicLaunchTargets`, `isStrategicStrikeRetaliation` (Task 3); `getStrategicStrikePreviewEffect`, `STRIKE_BLAST_RADIUS` (Task 2); `getStrategicLaunchPreviewPresentation` (Task 5); `SACK_GOLD_LOSS_FRACTION` (`@/systems/city-siege-system`, already exported per MR3); `getStrategicArsenal` (`@/systems/strategic-arsenal-system`).
- Produces: `createStrategicLaunchFlow(container, state, actorCivId, callbacks): HTMLElement`, `StrategicLaunchFlowCallbacks { onSetPreview: (presentation | null) => void; onConfirmLaunch: (targetCityId: string) => void; onClose: () => void }`. Task 9 wires `onSetPreview` to `RenderLoop.setStrategicLaunchPreview` and `onConfirmLaunch` to `executeStrategicLaunch` + `session.commit`.

- [x] **Step 1: Write the failing tests**

Create `tests/ui/strategic-launch-flow.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, currentPlayer: 'p1',
    civilizations: {
      p1: { id: 'p1', strategicArsenal: 2, diplomacy: { strategicStrikesReceivedFrom: [] } } as any,
    },
    cities: {
      target: { id: 'target', name: 'Target City', owner: 'p2', position: { q: 0, r: 0 } } as any,
    },
    units: {},
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    ...overrides,
  } as GameState;
}

describe('createStrategicLaunchFlow (#545 MR4 §14 stages 2-3)', () => {
  it('stage 2 lists every legal target city', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).toContain('Target City');
  });

  it('selecting a target calls onSetPreview with a non-null presentation', () => {
    const onSetPreview = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview, onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(onSetPreview).toHaveBeenCalledWith(expect.objectContaining({ tiles: expect.any(Array) }));
  });

  it('advancing to stage 3 shows the locked confirmation copy and clears the map preview', () => {
    const onSetPreview = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview, onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    (container.querySelector('[data-action="advance-to-confirm"]') as HTMLElement).click();
    expect(container.textContent).toContain('The city lies in ruins.');
    expect(container.textContent).toContain('Fallout has devastated the surrounding region.');
    expect(onSetPreview).toHaveBeenLastCalledWith(null);
  });

  it('confirming stage 3 calls onConfirmLaunch with the chosen target and never before', () => {
    const onConfirmLaunch = vi.fn();
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch, onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(onConfirmLaunch).not.toHaveBeenCalled();
    (container.querySelector('[data-action="advance-to-confirm"]') as HTMLElement).click();
    (container.querySelector('[data-action="confirm-launch"]') as HTMLElement).click();
    expect(onConfirmLaunch).toHaveBeenCalledWith('target');
  });

  it('never lists an illegal target (e.g. a civ not at war)', () => {
    const container = document.createElement('div');
    const state = makeState({
      cities: { peaceful: { id: 'peaceful', name: 'Peaceful City', owner: 'p3', position: { q: 1, r: 1 } } as any },
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.textContent).not.toContain('Peaceful City');
  });

  it('shows the exact predicted HP/gold effect for an undefended target (spec §14: real numbers, not vague prose)', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('1 HP');
  });

  it('provides an expandable exact-mechanics section separate from the always-visible summary (spec §14 progressive disclosure)', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.querySelector('summary')?.textContent).toBe('Exact mechanics');
    expect(details?.textContent).toContain('Blast radius: 3 tiles');
  });

  it('labels reputation-magnitude preview correctly for first-use vs retaliation', () => {
    const container = document.createElement('div');
    const state = makeState({
      civilizations: {
        p1: { id: 'p1', strategicArsenal: 2, diplomacy: { strategicStrikesReceivedFrom: ['p2'] } } as any,
      },
    });
    createStrategicLaunchFlow(container, state, 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    (container.querySelector('[data-target-city-id="target"]') as HTMLElement).click();
    expect(container.textContent).toContain('-20');
    expect(container.textContent).not.toContain('-60');
  });
});
```

This test suite calls `getLegalStrategicLaunchTargets` (via the component) against a fixture that doesn't fully satisfy `getStrategicLaunchLegality`'s real conditions (discovery, platform range) — before finalizing, verify the `makeState` fixture actually produces a `legal` result for `target` and an `ok:false` for `peaceful` by checking it against Task 3's own fixture requirements (visibility, `atWarWith`, an eligible platform). Adjust the fixture, not the component, if a test doesn't reflect real legality.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/strategic-launch-flow.test.ts`
Expected: FAIL — module does not exist.

- [x] **Step 3: Implement**

Create `src/ui/strategic-launch-flow.ts`:

```ts
import type { City, GameState } from '@/core/types';
import { createGameButton } from '@/ui/ui-kit';
import { getLegalStrategicLaunchTargets, isStrategicStrikeRetaliation } from '@/systems/strategic-launch-system';
import { getStrategicStrikePreviewEffect, STRIKE_BLAST_RADIUS } from '@/systems/strategic-strike-system';
import { SACK_GOLD_LOSS_FRACTION } from '@/systems/city-siege-system';
import { getStrategicArsenal } from '@/systems/strategic-arsenal-system';
import {
  getStrategicLaunchPreviewPresentation,
  type StrategicLaunchPreviewPresentation,
} from '@/systems/strategic-launch-preview-presentation';

export interface StrategicLaunchFlowCallbacks {
  /** Drives the map overlay -- called with a non-null presentation the moment
   * a target is selected (stage 2), and with null on advancing to stage 3,
   * cancelling, or closing. */
  onSetPreview: (presentation: StrategicLaunchPreviewPresentation | null) => void;
  onConfirmLaunch: (targetCityId: string) => void;
  onClose: () => void;
}

const REPUTATION_DELTAS_BY_KIND = {
  unprovoked: { target: -60, witness: -25 },
  retaliation: { target: -20, witness: -5 },
} as const;

export function createStrategicLaunchFlow(
  container: HTMLElement,
  state: GameState,
  actorCivId: string,
  callbacks: StrategicLaunchFlowCallbacks,
): HTMLElement {
  document.getElementById('strategic-launch-flow')?.remove();

  const root = document.createElement('div');
  root.id = 'strategic-launch-flow';
  root.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:480px;width:100%;max-height:90vh;overflow-y:auto;background:rgba(30,18,16,0.98);border:1px solid rgba(200,60,40,0.45);border-radius:18px;padding:20px;color:#f5e7c9;';
  root.appendChild(card);

  let selectedTargetId: string | null = null;
  let stage: 'select-target' | 'confirm' = 'select-target';

  function close(): void {
    callbacks.onSetPreview(null);
    callbacks.onClose();
    root.remove();
  }

  function render(): void {
    card.textContent = '';

    const closeButton = createGameButton('✕', 'close');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.style.cssText += 'position:absolute;top:12px;right:12px;font-size:20px;';
    closeButton.addEventListener('click', close);
    card.appendChild(closeButton);

    if (stage === 'select-target') renderSelectTarget();
    else renderConfirm();
  }

  function renderSelectTarget(): void {
    const title = document.createElement('h2');
    title.textContent = 'Select Strategic Launch Target';
    title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#e8917a;';
    card.appendChild(title);

    const targets = getLegalStrategicLaunchTargets(state, actorCivId);
    if (targets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No legal targets are currently in range.';
      empty.style.cssText = 'opacity:0.75;margin:12px 0;';
      card.appendChild(empty);
      return;
    }

    for (const city of targets) {
      const row = document.createElement('div');
      row.dataset.targetCityId = city.id;
      row.style.cssText = 'background:rgba(255,255,255,0.06);border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');

      const name = document.createElement('div');
      name.textContent = city.name;
      name.style.cssText = 'font-weight:bold;margin-bottom:4px;';
      row.appendChild(name);

      row.addEventListener('click', () => selectTarget(city, row));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') selectTarget(city, row);
      });

      card.appendChild(row);

      if (selectedTargetId === city.id) {
        renderImpactPreview(city, getStrategicLaunchPreviewPresentation(state, city.id));
      }
    }
  }

  function selectTarget(city: City, _row: HTMLElement): void {
    selectedTargetId = city.id;
    callbacks.onSetPreview(getStrategicLaunchPreviewPresentation(state, city.id));
    render();
  }

  function renderImpactPreview(city: City, presentation: StrategicLaunchPreviewPresentation): void {
    const preview = document.createElement('div');
    preview.style.cssText = 'background:rgba(200,60,40,0.12);border:1px solid rgba(200,60,40,0.4);border-radius:10px;padding:12px;margin:-2px 0 14px;font-size:13px;';

    const devastatedCount = presentation.tiles.length;
    const isRetaliation = isStrategicStrikeRetaliation(state, actorCivId, city.owner);
    const deltas = isRetaliation ? REPUTATION_DELTAS_BY_KIND.retaliation : REPUTATION_DELTAS_BY_KIND.unprovoked;
    const arsenalAfter = Math.max(0, getStrategicArsenal(state.civilizations[actorCivId]!) - 1);
    const effect = getStrategicStrikePreviewEffect(state, city.id);

    const lines = [
      `${devastatedCount} surrounding tile(s) will be devastated for multiple turns.`,
      effect?.hasGarrison
        ? `${city.name} is garrisoned -- the strike will be at least partially blocked. No gold will be lost.`
        : `${city.name} will be struck down to 1 HP. It will lose ${effect?.goldLost ?? 0} gold.`,
      isRetaliation
        ? `Relations with this civ will fall by ${deltas.target} (retaliation). Witnesses will react by ${deltas.witness}.`
        : `Relations with this civ will fall sharply by ${deltas.target} (unprovoked first use). Witnesses will react by ${deltas.witness}.`,
      `Arsenal after launch: ${arsenalAfter}.`,
    ];
    for (const line of lines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-bottom:4px;';
      preview.appendChild(p);
    }

    // Progressive disclosure (spec §14): plain-language sentence + key
    // numbers above are always visible; exact mechanics are opt-in via a
    // native <details> element (keyboard-accessible, no animation, no
    // color-only signal by construction).
    const details = document.createElement('details');
    details.style.cssText = 'margin-top:8px;font-size:12px;opacity:0.85;';
    const summary = document.createElement('summary');
    summary.textContent = 'Exact mechanics';
    summary.style.cssText = 'cursor:pointer;';
    details.appendChild(summary);
    const mechanicsLines = [
      `Blast radius: ${STRIKE_BLAST_RADIUS} tiles from the target city.`,
      `Gold loss (if undefended): ${Math.round(SACK_GOLD_LOSS_FRACTION * 100)}% of the defending civ's treasury.`,
      `A garrisoned city blocks the gold loss and floors the HP outcome instead of a full siege result.`,
    ];
    for (const line of mechanicsLines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-top:4px;';
      details.appendChild(p);
    }
    preview.appendChild(details);

    card.appendChild(preview);

    const advanceButton = createGameButton('Continue', 'danger');
    advanceButton.dataset.action = 'advance-to-confirm';
    advanceButton.addEventListener('click', () => {
      stage = 'confirm';
      callbacks.onSetPreview(null);
      render();
    });
    card.appendChild(advanceButton);
  }

  function renderConfirm(): void {
    const title = document.createElement('h2');
    title.textContent = 'Confirm Strategic Launch';
    title.style.cssText = 'margin:0 0 8px;font-size:20px;color:#e8917a;';
    card.appendChild(title);

    const copyLines = ['The city lies in ruins.', 'Fallout has devastated the surrounding region.', 'This cannot be undone.'];
    for (const line of copyLines) {
      const p = document.createElement('div');
      p.textContent = line;
      p.style.cssText = 'margin-bottom:8px;font-size:14px;';
      card.appendChild(p);
    }

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:10px;margin-top:16px;';

    const backButton = createGameButton('Back', 'ghost');
    backButton.dataset.action = 'back-to-select';
    backButton.addEventListener('click', () => {
      stage = 'select-target';
      render();
    });

    const confirmButton = createGameButton('Launch', 'danger');
    confirmButton.dataset.action = 'confirm-launch';
    confirmButton.addEventListener('click', () => {
      const targetId = selectedTargetId!;
      close();
      callbacks.onConfirmLaunch(targetId);
    });

    buttonRow.appendChild(backButton);
    buttonRow.appendChild(confirmButton);
    card.appendChild(buttonRow);
  }

  render();
  container.appendChild(root);
  return root;
}
```

This component only ever consumes `getStrategicLaunchPreviewPresentation` (Task 5) for tile data — it never parses hex keys itself, so Task 5's own resolution of the `keyToHex`/`HexCoord[]` open question is the only place that matters.

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/strategic-launch-flow.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/ui/strategic-launch-flow.ts tests/ui/strategic-launch-flow.test.ts
git commit -m "feat(#545): add 3-stage strategic launch flow -- target select, impact preview, confirmation (MR4 §14)"
```

---

### Task 9: Wire the flow end-to-end (trigger buttons -> flow -> executeStrategicLaunch -> commit)

**Files:**
- Modify: `src/app/controllers/selection-controller.ts` (replace Task 7's stub)
- Modify: `src/app/controllers/panel-actions-controller.ts` (`openCityPanelForCity`'s callbacks, `PanelActionsRenderer` type)
- Test: `tests/app/controllers/selection-controller.test.ts` and/or `tests/app/controllers/panel-actions-controller.test.ts` (whichever this repo already uses for callback-wiring tests on these two controllers — check both)

**Interfaces:**
- Consumes: `createStrategicLaunchFlow` (Task 8), `executeStrategicLaunch` (Task 4), `RenderLoop.setStrategicLaunchPreview` (Task 5).
- Produces: a fully working end-to-end flow from both trigger points to a committed state change.

- [x] **Step 1: Write the failing tests**

Add to whichever of the two controller test files already covers `openCityPanelForCity`'s or `selectUnit`'s callback wiring (open both files first and pick the one with an existing pattern for asserting a callback triggers a `session.commit` with a specific shape):

```ts
it('Prepare Strategic Launch (silo) commits executeStrategicLaunch\'s result on confirm (#545 MR4)', () => {
  // Arrange a state with a legal target, spy on session.commit, drive
  // the city panel's onPrepareStrategicLaunch callback, then drive the
  // launch-flow DOM through target-select -> confirm -> Launch, and assert
  // session.commit was called with a state where the target city's hp
  // reflects a strike (matching executeStrategicLaunch's real behavior),
  // not a hand-rolled fake result.
});

it('Prepare Strategic Launch (submarine) commits executeStrategicLaunch\'s result on confirm (#545 MR4)', () => {
  // Same shape, driven through selection-controller.ts's onPrepareStrategicLaunch.
});
```

Write these two tests for real using whichever of the two files' existing controller-construction helpers already exists (both files necessarily have one, since every other callback in them is tested this way) — do not skip this step or leave it as a comment; a fresh implementer must have real assertions here before touching implementation code.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts tests/app/controllers/panel-actions-controller.test.ts`
Expected: FAIL — Task 7's stub `openStrategicLaunchFlow` is a no-op; the silo path has no wiring yet.

- [x] **Step 3: Implement**

In `src/app/controllers/selection-controller.ts`, replace Task 7's stub with the real implementation (add near the top of the file, as a local function, or inline in the callback):

```ts
        onPrepareStrategicLaunch: (subUnitId: string) => {
          const unit = session.getState().units[subUnitId];
          if (!unit) return;
          createStrategicLaunchFlow(deps.uiLayer, session.getState(), unit.owner, {
            onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
            onConfirmLaunch: targetCityId => {
              const targetCivId = session.getState().cities[targetCityId]?.owner;
              const result = executeStrategicLaunch(session.getState(), unit.owner, targetCityId);
              if (result.ok && targetCivId) {
                session.commit(result.state);
                deps.renderLoop.setGameState(session.getState());
                deps.showNotification('Strategic strike launched.', 'warning');
                deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, goldLost: result.goldLost });
              }
            },
            onClose: () => {},
          });
        },
```

Add imports: `import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';` and `import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';`.

Add `'setStrategicLaunchPreview'` to `SelectionControllerRenderer`'s `Pick<RenderLoop, ...>` list (line 70-83).

In `src/app/controllers/panel-actions-controller.ts`, add to `openCityPanelForCity`'s `createCityPanel(...)` callbacks object (alongside `onBuild`):

```ts
      onPrepareStrategicLaunch: (cityId: string) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        createStrategicLaunchFlow(deps.uiLayer, deps.session.getState(), targetCity.owner, {
          onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
          onConfirmLaunch: targetCityId2 => {
            const targetCivId = deps.session.getState().cities[targetCityId2]?.owner;
            const result = executeStrategicLaunch(deps.session.getState(), targetCity.owner, targetCityId2);
            if (result.ok && targetCivId) {
              deps.session.commit(result.state);
              deps.renderLoop.setGameState(deps.session.getState());
              deps.showNotification('Strategic strike launched.', 'warning');
              deps.bus.emit('city:strategic-strike', { cityId: targetCityId2, recipientCivId: targetCivId, goldLost: result.goldLost });
            }
          },
          onClose: () => {},
        });
      },
```

Add the same two imports, and add `'setStrategicLaunchPreview'` to `PanelActionsRenderer`'s `Pick<RenderLoop, ...>` list (line 129-132).

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts tests/app/controllers/panel-actions-controller.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/app/controllers/selection-controller.ts src/app/controllers/panel-actions-controller.ts tests/app/controllers/selection-controller.test.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "feat(#545): wire strategic launch flow end-to-end from silo and submarine triggers (MR4)"
```

---

### Task 10: `warchief` "Strategic Arsenal" summary panel

**Files:**
- Create: `src/ui/strategic-arsenal-panel.ts`
- Create: `src/systems/strategic-arsenal-summary-presentation.ts`
- Modify: `src/app/panel-registry.ts` (add `'strategic-arsenal'` to `PanelId`)
- Modify: `src/app/controllers/panel-actions-controller.ts` (`openStrategicArsenalPanel`, add to `PanelActionsController` interface + its return object)
- Modify: `src/app/bootstrap.ts` (registry entry)
- Modify: `src/app/controllers/hud-controller.ts` (conditional trigger button)
- Test: `tests/systems/strategic-arsenal-summary-presentation.test.ts`
- Test: `tests/ui/strategic-arsenal-panel.test.ts`

**Interfaces:**
- Produces: `getStrategicArsenalSummaryPresentation(state, civId): StrategicArsenalSummaryPresentation` (real data only: arsenal count/capacity, eligible platforms, civs that have struck this civ -- no MR5/MR6 stub content); `createStrategicArsenalPanel(container, presentation, onClose): HTMLElement`; new `PanelId: 'strategic-arsenal'`.

- [x] **Step 1: Write the failing tests**

Create `tests/systems/strategic-arsenal-summary-presentation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getStrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    civilizations: {
      p1: {
        id: 'p1', cities: [], units: [], strategicArsenal: 2,
        diplomacy: { strategicStrikesReceivedFrom: ['p2'] },
      } as any,
    },
    cities: {}, units: {},
    builtNationalProjects: { 'p1:manhattan_project': true },
    ...overrides,
  } as GameState;
}

describe('getStrategicArsenalSummaryPresentation (#545 MR4 warchief panel)', () => {
  it('reports real arsenal count, capacity, and who has struck this civ', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
    expect(presentation.arsenalCount).toBe(2);
    expect(presentation.arsenalCapacity).toBeGreaterThanOrEqual(1);
    expect(presentation.strikesReceivedFromCivIds).toEqual(['p2']);
  });

  it('reports zero platforms when the civ owns no eligible building or unit', () => {
    const presentation = getStrategicArsenalSummaryPresentation(makeState(), 'p1');
    expect(presentation.platforms).toEqual([]);
  });
});
```

Create `tests/ui/strategic-arsenal-panel.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createStrategicArsenalPanel } from '@/ui/strategic-arsenal-panel';

describe('createStrategicArsenalPanel (#545 MR4)', () => {
  it('renders arsenal count/capacity and closes via callback', () => {
    const container = document.createElement('div');
    const onClose = vi.fn();
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [] }, onClose);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('3');
    (container.querySelector('[aria-label="Close"]') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });

  it('never fabricates an arms-control-cap or retaliation-risk line (MR5/MR6 not built yet)', () => {
    const container = document.createElement('div');
    createStrategicArsenalPanel(container, { arsenalCount: 1, arsenalCapacity: 3, platforms: [], strikesReceivedFromCivIds: [] }, vi.fn());
    expect(container.textContent).not.toMatch(/arms.control/i);
    expect(container.textContent).not.toMatch(/retaliation.risk/i);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts`
Expected: FAIL — modules do not exist.

- [x] **Step 3: Implement**

Create `src/systems/strategic-arsenal-summary-presentation.ts`:

```ts
import type { GameState } from '@/core/types';
import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
import { getEligibleStrategicLaunchPlatforms, type StrategicLaunchPlatform } from '@/systems/strategic-launch-system';

export interface StrategicArsenalSummaryPresentation {
  arsenalCount: number;
  arsenalCapacity: number;
  platforms: StrategicLaunchPlatform[];
  /** Every civ that has struck this civ with a strategic strike (MR4
   * retaliation-tracking field, surfaced directly -- no MR5 AI-doctrine or
   * MR9 visibility gating exists yet to filter this further). */
  strikesReceivedFromCivIds: string[];
}

export function getStrategicArsenalSummaryPresentation(
  state: GameState,
  civId: string,
): StrategicArsenalSummaryPresentation {
  const civ = state.civilizations[civId];
  return {
    arsenalCount: civ ? getStrategicArsenal(civ) : 0,
    arsenalCapacity: getStrategicArsenalCapacity(state, civId),
    platforms: getEligibleStrategicLaunchPlatforms(state, civId),
    strikesReceivedFromCivIds: civ?.diplomacy.strategicStrikesReceivedFrom ?? [],
  };
}
```

Create `src/ui/strategic-arsenal-panel.ts`:

```ts
import { createGameButton } from '@/ui/ui-kit';
import type { StrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';

export function createStrategicArsenalPanel(
  container: HTMLElement,
  presentation: StrategicArsenalSummaryPresentation,
  onClose: () => void,
): HTMLElement {
  document.getElementById('strategic-arsenal-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'strategic-arsenal-panel';
  panel.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,20,0.92);z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;';

  const card = document.createElement('div');
  card.style.cssText = 'max-width:440px;width:100%;background:rgba(30,18,16,0.98);border:1px solid rgba(200,60,40,0.4);border-radius:18px;padding:20px;color:#f5e7c9;';
  panel.appendChild(card);

  const closeButton = createGameButton('✕', 'close');
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.style.cssText += 'float:right;font-size:20px;';
  closeButton.addEventListener('click', () => {
    onClose();
    panel.remove();
  });
  card.appendChild(closeButton);

  const title = document.createElement('h2');
  title.textContent = 'Strategic Arsenal';
  title.style.cssText = 'margin:0 0 12px;font-size:20px;color:#e8917a;';
  card.appendChild(title);

  const arsenalLine = document.createElement('div');
  arsenalLine.textContent = `Warheads: ${presentation.arsenalCount} / ${presentation.arsenalCapacity}`;
  arsenalLine.style.cssText = 'margin-bottom:10px;font-size:14px;';
  card.appendChild(arsenalLine);

  const platformsTitle = document.createElement('div');
  platformsTitle.textContent = 'Launch platforms:';
  platformsTitle.style.cssText = 'font-weight:bold;margin:12px 0 6px;';
  card.appendChild(platformsTitle);

  if (presentation.platforms.length === 0) {
    const none = document.createElement('div');
    none.textContent = 'None.';
    none.style.cssText = 'opacity:0.7;margin-bottom:10px;';
    card.appendChild(none);
  } else {
    for (const platform of presentation.platforms) {
      const row = document.createElement('div');
      row.textContent = platform.kind === 'building' ? `Missile Silo (city)` : `Missile Submarine`;
      row.style.cssText = 'margin-bottom:4px;font-size:13px;';
      card.appendChild(row);
    }
  }

  if (presentation.strikesReceivedFromCivIds.length > 0) {
    const struckTitle = document.createElement('div');
    struckTitle.textContent = `Struck by ${presentation.strikesReceivedFromCivIds.length} civilization(s) previously.`;
    struckTitle.style.cssText = 'margin-top:12px;font-size:13px;opacity:0.85;';
    card.appendChild(struckTitle);
  }

  container.appendChild(panel);
  return panel;
}
```

In `src/app/panel-registry.ts`, add `'strategic-arsenal'` to the `PanelId` union.

In `src/app/controllers/panel-actions-controller.ts`, add `openStrategicArsenalPanel(): void;` to the `PanelActionsController` interface, implement it near `openWonderAtlas`:

```ts
  function openStrategicArsenalPanel(): void {
    const presentation = getStrategicArsenalSummaryPresentation(deps.session.getState(), deps.session.getState().currentPlayer);
    createStrategicArsenalPanel(deps.uiLayer, presentation, () => {});
  }
```

and add `openStrategicArsenalPanel,` to the returned object. Add imports for `getStrategicArsenalSummaryPresentation` and `createStrategicArsenalPanel`.

In `src/app/bootstrap.ts`, add to `panelRegistry`:

```ts
    'strategic-arsenal': { domId: 'strategic-arsenal-panel', group: 'transient', open: () => panelActions.openStrategicArsenalPanel() },
```

In `src/app/controllers/hud-controller.ts`, add a conditional trigger button mirroring the `isAutonomyActivated` network button block exactly (same file, same section):

```ts
      if (getStrategicArsenalCapacity(state, civ.id) > 0) {
        const arsenalButton = document.createElement('button');
        arsenalButton.type = 'button';
        arsenalButton.style.cssText = 'background:transparent;color:inherit;border:1px solid rgba(200,60,40,0.45);border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;';
        arsenalButton.textContent = `☢ ${getStrategicArsenal(civ)}/${getStrategicArsenalCapacity(state, civ.id)}`;
        arsenalButton.addEventListener('click', () => deps.router.open('strategic-arsenal'));
        yieldsRow.appendChild(arsenalButton);
      }
```

Add the import: `import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';` (add to hud-controller.ts's existing import list, or a new one if that module isn't already imported there).

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/ui/strategic-arsenal-panel.ts src/systems/strategic-arsenal-summary-presentation.ts src/app/panel-registry.ts src/app/controllers/panel-actions-controller.ts src/app/bootstrap.ts src/app/controllers/hud-controller.ts tests/systems/strategic-arsenal-summary-presentation.test.ts tests/ui/strategic-arsenal-panel.test.ts
git commit -m "feat(#545): add warchief Strategic Arsenal summary panel (MR4)"
```

---

### Task 11: Notify the defending civ (event bus + presentation registrar)

**Why this task exists (found during this plan's own review):** `executeStrategicLaunch` and `resolveStrategicStrike` are pure system functions, same as the sibling `resolveNavalCityBombardment` -- neither emits any event or notification itself. The real defender-notification pattern in this codebase (verified this session against `player-action-controller.ts`'s naval-bombardment call site and `register-raider-presentation.ts`'s `city:naval-bombarded` handler) is: the controller emits a typed bus event after committing state, and a dedicated presentation registrar listens for it and calls `ctx.notifier.deliver(recipientCivId, message, type)`. Without this task, a hot-seat defender would have no notification that their city was struck until they happened to notice the HP/gold change themselves -- a real gap in a mechanic whose entire point is a consequence the defender must react to.

**Files:**
- Modify: `src/core/types.ts` (event map, add `'city:strategic-strike'` entry near `'city:naval-bombarded'`, line ~2318)
- Create: `src/presentation/register-strategic-strike-presentation.ts`
- Modify: `src/presentation/register-all.ts` (import + add to `ALL_REGISTRARS`)
- Test: `tests/presentation/register-strategic-strike-presentation.test.ts`

**Interfaces:**
- Consumes: `EventBus` (`@/core/event-bus`), `PresentationRegistrar` type and `makePresentationContext` test helper (`tests/helpers/presentation-context`).
- Produces: the defending civ receives a delivered notification the moment a strategic strike lands against one of their cities.

- [x] **Step 1: Write the failing tests**

Create `tests/presentation/register-strategic-strike-presentation.test.ts`, mirroring `tests/presentation/register-raider-presentation.test.ts`'s exact fixture shape:

```ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerStrategicStrikePresentation } from '@/presentation/register-strategic-strike-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('strategic strike presentation (#545 MR4)', () => {
  it('notifies the defending civ that its city was struck, including the gold lost', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({
      state: { cities: { target: { name: 'Rome', owner: 'p2' } } as never },
    });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'target', recipientCivId: 'p2', goldLost: 150 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('Rome'), 'warning');
    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.stringContaining('150'), 'warning');
  });

  it('handles an unknown city name gracefully', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext({ state: { cities: {} as never } });

    registerStrategicStrikePresentation(bus, ctx);
    bus.emit('city:strategic-strike', { cityId: 'nope', recipientCivId: 'p2', goldLost: 0 });

    expect(ctx.deliver).toHaveBeenCalledWith('p2', expect.any(String), 'warning');
  });
});
```

Before finalizing, open `tests/helpers/presentation-context.ts` and confirm `makePresentationContext`'s real option shape and whether `ctx.deliver` is genuinely a top-level alias for `ctx.notifier.deliver` (both spellings appear used across the existing raider test/registrar pair) — use whichever this file's own convention actually is.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/presentation/register-strategic-strike-presentation.test.ts`
Expected: FAIL — module does not exist, `'city:strategic-strike'` is not a known event.

- [x] **Step 3: Implement**

In `src/core/types.ts`, add to the event-map interface (near `'city:naval-bombarded'`, line 2318):

```ts
  'city:strategic-strike': { cityId: string; recipientCivId: string; goldLost: number };
```

Create `src/presentation/register-strategic-strike-presentation.ts`:

```ts
import type { PresentationRegistrar } from '@/presentation/register-all';

/**
 * #545 MR4: defender-notification for a strategic strike, same shape as
 * register-raider-presentation.ts's city:naval-bombarded handler -- the
 * controller emits the event after committing state (see
 * selection-controller.ts / panel-actions-controller.ts's onConfirmLaunch),
 * this registrar turns it into a delivered notification.
 */
export const registerStrategicStrikePresentation: PresentationRegistrar = (bus, ctx) => {
  const unsubscribers = [
    bus.on('city:strategic-strike', ({ cityId, recipientCivId, goldLost }) => {
      const cityName = ctx.session.getState().cities[cityId]?.name ?? 'A city';
      const goldLine = goldLost > 0 ? ` and lost ${goldLost} gold` : '';
      ctx.notifier.deliver(recipientCivId, `${cityName} was struck by a strategic weapon${goldLine}.`, 'warning');
    }),
  ];
  return () => unsubscribers.forEach(unsub => unsub());
};
```

Verify this exact return-shape (`() => unsubscribers.forEach(...)`) against `register-raider-presentation.ts`'s real disposer pattern before finalizing — copy it precisely rather than approximating.

In `src/presentation/register-all.ts`, add the import and registrar entry:

```ts
import { registerStrategicStrikePresentation } from '@/presentation/register-strategic-strike-presentation';
```

```ts
  registerStrategicStrikePresentation,
```

(added to the `ALL_REGISTRARS` array, same list `registerRaiderPresentation` is in.)

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/presentation/register-strategic-strike-presentation.test.ts tests/presentation/register-all.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/core/types.ts src/presentation/register-strategic-strike-presentation.ts src/presentation/register-all.ts tests/presentation/register-strategic-strike-presentation.test.ts
git commit -m "feat(#545): notify the defending civ when struck (MR4 event bus + registrar)"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [x] **Step 1: Confirm zero RNG in every new module**

Run: `grep -rn "Math.random" src/systems/strategic-launch-execution-system.ts src/systems/strategic-launch-preview-presentation.ts src/systems/strategic-arsenal-summary-presentation.ts src/ui/strategic-launch-flow.ts src/ui/strategic-arsenal-panel.ts`
Expected: no matches.

- [x] **Step 2: Confirm architecture boundaries**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts`
Expected: PASS — new app-layer wiring in this MR follows the existing controller pattern (no new logic added directly to `main.ts`).

- [x] **Step 3: Confirm zero pacing regression**

This MR adds no new yield, discount, or economy-affecting bonus (only a reputation/retaliation mechanic and UI) — confirm this is still true by re-reading the final diff's `civYieldBonus`/`cityYieldBonus`/production-cost touches (there should be none), then run:

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/pacing-audit.test.ts`
Expected: PASS with zero diff, confirming the "no economy change" assumption held.

- [x] **Step 4: Confirm sprite-catalog coverage is unaffected**

This MR adds no new `BUILDINGS`/`TRAINABLE_UNITS` entry (it adds a UI action to the existing `missile_silo`/`missile_submarine`) — confirm by running:

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/city-system.test.ts -t "icon"`
Expected: PASS, no new coverage gap.

- [x] **Step 5: Confirm the SFX/mute-safe requirement**

`resolveStrategicStrike` (MR3) already routes through the shared `resolveCitySiegeDamage`/`applyCitySiegeOutcome` pipeline, which drives the existing `siege-fire`/`siege-impact` SFX generically. Confirm this by grepping for where those SFX keys are triggered (`grep -rn "siege-fire\|siege-impact" src/audio/ src/renderer/`) and checking that trigger is keyed off the siege-outcome data path, not a specific unit type — if so, a strategic strike already gets SFX for free and this MR adds no new sound-only cue (satisfying "mute-safe" trivially, since the launch-flow itself is text/visual only). If the trigger turns out to be unit-type-gated and would NOT fire for a strategic strike, stop and flag this as a gap for a follow-up rather than silently shipping a silent strike.

- [x] **Step 6: Confirm no dead production item remains (incremental-mr-completion.md)**

Per the arc's incremental-delivery argument: after MR1 (arsenal data model), MR2 (legality), MR3 (resolution, no UI), the `warhead` production item and `manhattan_project`/`nuclear_arsenal`/`missile_silo` buildings had a real resource effect (arsenal count) but zero way for a player to ever consume that resource. This MR's Tasks 6, 7, 8, 9 give `executeStrategicLaunch` — and therefore the entire arsenal — its first real consumer. Confirm explicitly: grep `grep -rn "executeStrategicLaunch" src/` and verify it is called from both Task 9 call sites (silo and submarine), not just its own test file. State this confirmation in the PR body's "Why this is safe to merge" section if this MR ships partially (it should not, per the user's single-PR decision — but confirm the full task list lands together regardless).

- [x] **Step 7: Run the full suite and production build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS (full suite, all tiers).

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (typecheck + production build).

- [x] **Step 8: Commit (only if any step above required a fix)**

```bash
git add -A
git commit -m "fix(#545): MR4 final verification fixes"
```

## Definition of Done

- [x] `strategicStrikesReceivedFrom` exists on `DiplomacyState`, defaulted for new games and migrated (schema v20) for old saves. **Corrected during execution: made optional, not required** — a required field broke `yarn build` across ~15 pre-existing test files; matches the codebase's established `Civilization.strategicArsenal?` convention instead.
- [x] `executeStrategicLaunch` is the only strike entry point UI code calls; `resolveStrategicStrike` has no caller outside its own MR3 test file and `executeStrategicLaunch`'s implementation. Verified via grep at the end of execution.
- [x] Reputation deltas match spec exactly: unprovoked -60/-25, retaliation -20/-5, applied actor<->target then actor<->every witness.
- [x] The 3-stage flow (target+preview, confirm) is reachable from both a Missile Silo city panel and a Missile Submarine unit panel, gated on `state.currentPlayer`/`isHuman`, and every button uses `createGameButton` with visible arsenal count (no bare buttons).
- [x] The map overlay shows the exact blast-radius tile set during stage 2 only, cleared on advance/cancel/close.
- [x] Stage-3 copy is exactly the locked text, no casualty counts, no gore.
- [x] The preview omits (never stubs) the arms-control-cap and retaliation-risk-visibility lines.
- [x] The warchief Strategic Arsenal panel shows only real data (arsenal, platforms, who has struck this civ) with zero MR5/MR6 stub content.
- [x] The defending civ receives a delivered notification (`notifier.deliver`, never a bare `showNotification`) the moment its city is struck — verified via the `city:strategic-strike` event and its registrar, not left to the attacker's own toast.
- [x] The Missile Submarine action is verified absent on a unit the viewing player does not own (hot-seat/ownership regression). **Corrected during execution: `selected-unit-info.ts` has no single shared ownership gate** — each action re-checks `unit.owner === state.currentPlayer` itself; this block does too now, matching the auto-explore pattern, not a reused enclosing gate.
- [x] AI does not call `executeStrategicLaunch` anywhere in this MR's diff. Verified via grep.
- [x] `bash scripts/run-with-mise.sh yarn test` passes (full suite: 541 files, 9084 tests, 3 pre-existing skips).
- [x] `bash scripts/run-with-mise.sh yarn build` passes (typecheck + production build).
- [x] No dead production item remains: `warhead`'s arsenal now has a real consumer at both silo and submarine call sites.
- [ ] PR body states "Part of #545" (never "Closes #545") — pending PR creation.

**Known follow-up (flagged, not blocking):** a strategic strike currently plays no sound effect — `sfx-director.ts`'s siege-fire/siege-impact trigger is keyed to the generic unit-combat `CombatResult` event, which `executeStrategicLaunch` never emits (it calls `resolveCitySiegeDamage` directly). This does not violate mute-safe (the launch-flow confirmation is already fully text/visual), but it is a missed sensory-feedback opportunity. Flagged as a separate follow-up task rather than blocking this MR, since adding real audio assets is outside this session's tooling.
