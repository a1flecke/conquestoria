# MR6 (#593): Religious Loyalty — Territory Pressure + Loyalty Flips — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Project override: this repo's CLAUDE.md forbids subagents/parallel agents — do NOT use superpowers:subagent-driven-development here. Execute every task inline in this session.**

**Goal:** Make religious Fervor's territory/loyalty claims real: cities following a foreign faith accrue loyalty points toward the faith owner and can peacefully defect (minor civs are absorbed, AI civs lose the city diplomatically); human-owned cities are immune but pay unrest instead.

**Architecture:** A new `src/systems/religion-loyalty-system.ts` owns eligibility, tick math, warning cadence, and defection execution as pure/near-pure `GameState -> GameState` functions, called once per turn from `turn-manager.ts` right after `processReligionTurn`. Defection reuses `transferCapturedCityOwnership` (major civ) and a new peaceful `minor-civ-system.ts` helper (minor civ) rather than hand-rolling ownership transfer. UI (map badge, city-panel row, notifications) follows the existing `world-pressure` presentation pattern and `notification-routing.ts` route-function pattern.

**Tech Stack:** TypeScript, vitest. No new dependencies.

## Global Constraints

- Never use `Math.random()` — this feature has no randomness (loyalty tick is deterministic), so this constraint is satisfied by construction; do not introduce a seeded RNG where none is needed.
- Every state-mutating function must return a new `GameState` (immutable turn processing) — no direct writes to `state.cities[id] = ...` etc.
- `CityFaith.loyaltyProgress` is additive/optional — no save migration required.
- Wonder/national-project yield-ceiling rules do not apply here (this is a city-territory-pressure and diplomacy mechanic, not a wonder/national-project yield) — do not add rows to `game-balance.md`'s wonder tables for this feature.
- Game-wide `opponentChallenge` (via `resolveOpponentChallenge(state)`) governs the loyalty threshold — never per-civ `resolveChallengeForCiv`.
- `LOYALTY_THRESHOLD_BY_CHALLENGE` keys must be exactly `'explorer' | 'standard' | 'veteran'` (confirmed via `src/core/types.ts:1243` and `OPPONENT_CHALLENGE_PROFILES` in `src/core/opponent-challenge.ts`).
- Human-owned cities must NEVER get a tracked `loyaltyProgress` record — this is enforced by `isLoyaltyTrackEligible` gating on `!state.civilizations[city.owner]?.isHuman`, and every test file touching this feature must include a regression proving it.

---

### Task 1: Types & events

**Files:**
- Modify: `src/core/types.ts:1607-1625` (`CityFaith` interface)
- Modify: `src/core/types.ts:1891-1893` (`GameEvents`, alongside the existing `religion:*` entries)
- Test: `tests/systems/religion-loyalty-system.test.ts` (new file — type-level smoke test only in this task; real logic tests start in Task 4)

**Interfaces:**
- Produces: `CityFaith.loyaltyProgress?: { toCivId: string; points: number }`; `GameEvents['religion:loyalty-warning']: { cityId: string; pressuringCivId: string; stage: 'start' | 'midpoint' | 'final'; turnsRemaining: number }`; `GameEvents['religion:city-defected']: { cityId: string; fromCivId: string; toCivId: string }`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/systems/religion-loyalty-system.test.ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { CityFaith, GameEvents } from '@/core/types';

describe('#593 MR6 — CityFaith.loyaltyProgress type', () => {
  it('accepts a loyaltyProgress record shape', () => {
    const faith: CityFaith = { religionId: 'religion-p1', loyaltyProgress: { toCivId: 'p2', points: 30 } };
    expect(faith.loyaltyProgress).toEqual({ toCivId: 'p2', points: 30 });
  });

  it('emits religion:loyalty-warning and religion:city-defected with the expected payload shape', () => {
    const bus = new EventBus();
    const warnings: GameEvents['religion:loyalty-warning'][] = [];
    const defections: GameEvents['religion:city-defected'][] = [];
    bus.on('religion:loyalty-warning', e => warnings.push(e));
    bus.on('religion:city-defected', e => defections.push(e));
    bus.emit('religion:loyalty-warning', { cityId: 'c1', pressuringCivId: 'p2', stage: 'start', turnsRemaining: 18 });
    bus.emit('religion:city-defected', { cityId: 'c1', fromCivId: 'p1', toCivId: 'p2' });
    expect(warnings).toHaveLength(1);
    expect(defections).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: FAIL (TypeScript error: `Property 'loyaltyProgress' does not exist` / `'religion:loyalty-warning'` not a known event) — vitest reports a type/compile error since these fields don't exist yet.

- [ ] **Step 3: Add the type fields**

In `src/core/types.ts`, replace the `CityFaith` interface's trailing comment (line ~1624 `// loyaltyProgress added by MR6 (#593)`) with the real field:

```typescript
export interface CityFaith {
  religionId: string;
  isHolyCity?: true;      // founding city — permanently immune to conversion, under ANY owner
  conversionProgress?: Record<string, number>;
  conversionCooldownUntilTurn?: number;
  conversionCooldownExemptCivId?: string;
  // #593 MR6: loyalty flip track. Only ever set for a minor-civ or non-human-AI-owned
  // city bordering a foreign faith's territory (see isLoyaltyTrackEligible in
  // religion-loyalty-system.ts) -- human-owned cities are never tracked here.
  loyaltyProgress?: { toCivId: string; points: number };
}
```

In the `GameEvents` block, add these two lines immediately after the existing `'religion:preached'` entry (`src/core/types.ts:1893`):

```typescript
  'religion:loyalty-warning': { cityId: string; pressuringCivId: string; stage: 'start' | 'midpoint' | 'final'; turnsRemaining: number };
  'religion:city-defected': { cityId: string; fromCivId: string; toCivId: string };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/systems/religion-loyalty-system.test.ts
git commit -m "feat(religion): add loyalty-flip types and events (#593 MR6 Task 1)"
```

---

### Task 2: Loyalty constants + Fervor description completion

**Files:**
- Modify: `src/systems/religion-definitions.ts`
- Test: `tests/systems/religion-definitions.test.ts`

**Interfaces:**
- Consumes: `OpponentChallenge` type from `@/core/types`.
- Produces: `LOYALTY_THRESHOLD_BY_CHALLENGE: Record<OpponentChallenge, number>`, `LOYALTY_BASE_TICK: number`, updated `BOON_DESCRIPTIONS.fervor`.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to tests/systems/religion-definitions.test.ts
import { LOYALTY_THRESHOLD_BY_CHALLENGE, LOYALTY_BASE_TICK, BOON_DESCRIPTIONS } from '@/systems/religion-definitions';

describe('#593 MR6 — loyalty constants', () => {
  it('has a threshold for every OpponentChallenge tier, gentlest to hardest', () => {
    expect(LOYALTY_THRESHOLD_BY_CHALLENGE.explorer).toBe(150);
    expect(LOYALTY_THRESHOLD_BY_CHALLENGE.standard).toBe(180);
    expect(LOYALTY_THRESHOLD_BY_CHALLENGE.veteran).toBe(220);
  });

  it('LOYALTY_BASE_TICK is 10', () => {
    expect(LOYALTY_BASE_TICK).toBe(10);
  });

  it('Fervor description now mentions territory pressure and loyalty, not just conversion speed', () => {
    expect(BOON_DESCRIPTIONS.fervor).toMatch(/loyalty|territory/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-definitions.test.ts`
Expected: FAIL — `LOYALTY_THRESHOLD_BY_CHALLENGE` is not exported; Fervor description doesn't match.

- [ ] **Step 3: Add constants and update the description**

In `src/systems/religion-definitions.ts`, change the import line and add constants after `CITY_CONVERSION_COOLDOWN_TURNS`:

```typescript
import type { OpponentChallenge, ReligionBoon } from '@/core/types';

// ... existing constants ...
export const CITY_CONVERSION_COOLDOWN_TURNS = 7;

// #593 MR6: loyalty-flip track. Game-wide opponentChallenge governs (see
// resolveOpponentChallenge), NOT per-civ challenge -- this keeps flip pacing
// consistent across every civ in a game, matching how the AI opponent difficulty
// itself is always game-wide.
export const LOYALTY_THRESHOLD_BY_CHALLENGE: Record<OpponentChallenge, number> = {
  explorer: 150,
  standard: 180,
  veteran: 220,
};
export const LOYALTY_BASE_TICK = 10;
```

Replace the `BOON_DESCRIPTIONS` block's `fervor` entry and its preceding comment:

```typescript
export const BOON_DESCRIPTIONS: Record<ReligionBoon, string> = {
  serenity: '+1 happiness in every city that follows your faith.',
  tithes: `+1 gold per turn from every foreign city that follows your faith, up to +${TITHES_CAP} gold.`,
  // #593 MR6: completes the MR4-deferred honesty contract -- Fervor now also adds
  // territory pressure in cities that follow your faith, and roughly halves the
  // number of turns until a foreign-faith-following minor civ or AI city defects to you.
  fervor: 'Your faith spreads 25% faster, adds territory pressure in cities that follow it, and speeds up foreign cities defecting to you.',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-definitions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/religion-definitions.ts tests/systems/religion-definitions.test.ts
git commit -m "feat(religion): add loyalty constants, complete Fervor description (#593 MR6 Task 2)"
```

---

### Task 3: Territory pressure bonus

**Files:**
- Modify: `src/systems/city-territory-system.ts:122-128` (`calculateCityPressureForTile`)
- Test: `tests/systems/city-territory-system.test.ts`

**Interfaces:**
- Consumes: `state.cityFaith`, `state.religions` (already on `GameState`).
- Produces: no new exports — `calculateCityPressureForTile`'s existing signature is unchanged, only its return value changes.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to tests/systems/city-territory-system.test.ts
import { calculateCityPressureForTile } from '@/systems/city-territory-system';

describe('#593 MR6 — faith territory pressure', () => {
  function baseState(overrides: Partial<any> = {}) {
    // Reuse this file's existing minimal-GameState fixture pattern; adjust field names
    // if the file's existing helper differs -- see the top of this test file for the
    // established fixture shape (city, map, civilizations).
    return { ...overrides };
  }

  it('adds +1 pressure when the city follows its own civ faith, +2 more if that civ boon is Fervor', () => {
    const city = { id: 'c1', owner: 'p1', position: { q: 0, r: 0 }, population: 4, maturity: 'outpost', buildings: [] } as any;
    const coord = { q: 1, r: 0 };
    const noFaithState = { map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] }, cityFaith: {}, religions: {} } as any;
    const base = calculateCityPressureForTile(noFaithState, city, coord);

    const ownFaithState = {
      ...noFaithState,
      cityFaith: { c1: { religionId: 'religion-p1' } },
      religions: { 'religion-p1': { id: 'religion-p1', name: 'Test Faith', ownerCivId: 'p1', foundedTurn: 1 } },
    };
    expect(calculateCityPressureForTile(ownFaithState, city, coord)).toBe(base + 1);

    const fervorState = {
      ...ownFaithState,
      religions: { 'religion-p1': { ...ownFaithState.religions['religion-p1'], boon: 'fervor' } },
    };
    expect(calculateCityPressureForTile(fervorState, city, coord)).toBe(base + 3);
  });

  it('adds no bonus when the city follows a foreign faith', () => {
    const city = { id: 'c1', owner: 'p1', position: { q: 0, r: 0 }, population: 4, maturity: 'outpost', buildings: [] } as any;
    const coord = { q: 1, r: 0 };
    const noFaithState = { map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] }, cityFaith: {}, religions: {} } as any;
    const base = calculateCityPressureForTile(noFaithState, city, coord);

    const foreignFaithState = {
      ...noFaithState,
      cityFaith: { c1: { religionId: 'religion-p2' } },
      religions: { 'religion-p2': { id: 'religion-p2', name: 'Rival Faith', ownerCivId: 'p2', boon: 'fervor', foundedTurn: 1 } },
    };
    expect(calculateCityPressureForTile(foreignFaithState, city, coord)).toBe(base);
  });
});
```

Note: check the top of `tests/systems/city-territory-system.test.ts` first — if it already has a `makeState`/fixture helper, use it instead of the inline object literals above so the new tests match the file's existing conventions; keep the assertions the same.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-territory-system.test.ts`
Expected: FAIL — pressure values don't include the faith bonus yet.

- [ ] **Step 3: Implement the bonus**

In `src/systems/city-territory-system.ts`, replace `calculateCityPressureForTile`:

```typescript
export function calculateCityPressureForTile(state: GameState, city: City, coord: HexCoord): number {
  // #593 MR6: +1 if the city follows its own civ's faith, +2 more (so +3 total) if
  // that civ's religion boon is Fervor. No bonus for a city following a FOREIGN faith --
  // that's the loyalty-flip liability, not a territory asset, for the current owner.
  let faithBonus = 0;
  const faith = state.cityFaith?.[city.id];
  if (faith) {
    const religion = state.religions?.[faith.religionId];
    if (religion && religion.ownerCivId === city.owner) {
      faithBonus += 1;
      if (religion.boon === 'fervor') faithBonus += 2;
    }
  }
  return TERRITORY_PRESSURE_BALANCE.basePressure
    + TERRITORY_PRESSURE_BALANCE.maturityBonus[city.maturity]
    + Math.floor(city.population / 2)
    + Math.min(TERRITORY_PRESSURE_BALANCE.cultureBuildingCap, countCultureBuildings(city))
    + faithBonus
    - cityDistance(city.position, coord, state.map);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/city-territory-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-territory-system.ts tests/systems/city-territory-system.test.ts
git commit -m "feat(religion): add faith territory pressure bonus (#593 MR6 Task 3)"
```

---

### Task 4: Eligibility and tick-math core (religion-loyalty-system.ts)

**Files:**
- Create: `src/systems/religion-loyalty-system.ts`
- Test: `tests/systems/religion-loyalty-system.test.ts` (extends Task 1's file)
- Test helper: `tests/systems/helpers/religion-loyalty-fixture.ts` (new)

**Interfaces:**
- Consumes: `canGarrisonCity` from `@/systems/faction-system`; `LOYALTY_BASE_TICK`, `LOYALTY_THRESHOLD_BY_CHALLENGE`, `FERVOR_MULTIPLIER` from `@/systems/religion-definitions`; `resolveOpponentChallenge` from `@/core/opponent-challenge`; `hexKey`, `hexNeighbors` from `@/systems/hex-utils`.
- Produces: `ForeignFaithPressure { religion: Religion; pressuringCivId: string }`; `getForeignFaithPressure(state, cityId): ForeignFaithPressure | null`; `isLoyaltyTrackEligible(state, cityId): ForeignFaithPressure | null`; `getLoyaltyThreshold(state): number`; `getLoyaltyTickAmount(state, city, religion): number`.

First, build a shared test fixture with two adjacent civs plus a minor civ, since every remaining task in this plan needs border-adjacent territory:

- [ ] **Step 1: Write the test fixture**

```typescript
// tests/systems/helpers/religion-loyalty-fixture.ts
import type { City, GameState, HexCoord, HexTile } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createMarketplaceState } from '@/systems/trade-system';
import { hexKey } from '@/systems/hex-utils';

function makeTile(coord: HexCoord, owner: string | null): HexTile {
  return {
    coord, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
    owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null, regionKey: 'landmass-1',
  };
}

function makeCity(id: string, owner: string, position: HexCoord, ownedTiles: HexCoord[], overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position, population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles, workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

// p1 (faith owner, human) at q0, p2 (AI, non-human) at q3 -- their single-tile
// territories are adjacent (q2/q3 share an edge). mc-border is a minor civ at q6,
// adjacent to p2's territory, used for minor-civ absorption tests. All three religions
// setups are added by individual tests via state.religions/cityFaith overrides.
export function makeLoyaltyFixture(): {
  state: GameState; p1: string; p1City: string; p2: string; p2City: string; mcId: string; mcCity: string;
} {
  const p1 = 'p1';
  const p2 = 'p2';
  const mcId = 'mc-border';
  const p1City = 'p1-city';
  const p2City = 'p2-city';
  const mcCity = 'mc-city';

  const p1Pos: HexCoord = { q: 0, r: 0 };
  const p1Edge: HexCoord = { q: 2, r: 0 };
  const p2Pos: HexCoord = { q: 3, r: 0 };
  const p2Edge: HexCoord = { q: 5, r: 0 };
  const mcPos: HexCoord = { q: 6, r: 0 };

  const cities: Record<string, City> = {
    [p1City]: makeCity(p1City, p1, p1Pos, [p1Pos, p1Edge]),
    [p2City]: makeCity(p2City, p2, p2Pos, [p2Pos, p2Edge]),
    [mcCity]: makeCity(mcCity, mcId, mcPos, [mcPos]),
  };

  const tiles: Record<string, HexTile> = {
    [hexKey(p1Pos)]: makeTile(p1Pos, p1),
    [hexKey(p1Edge)]: makeTile(p1Edge, p1),
    [hexKey(p2Pos)]: makeTile(p2Pos, p2),
    [hexKey(p2Edge)]: makeTile(p2Edge, p2),
    [hexKey(mcPos)]: makeTile(mcPos, mcId),
  };

  const ids = [p1, p2];

  const state: GameState = {
    turn: 40,
    era: 4,
    currentPlayer: p1,
    gameOver: false,
    winner: null,
    opponentChallenge: 'standard',
    map: { width: 20, height: 20, tiles, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities,
    civilizations: {
      [p1]: {
        id: p1, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: [p1City], units: [],
        techState: { completed: ['philosophy'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, p1),
      },
      [p2]: {
        id: p2, name: 'Rival', color: '#c2410c', isHuman: false, civType: 'rome',
        cities: [p2City], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 500, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(ids, p2),
      },
    },
    barbarianCamps: {},
    minorCivs: {
      [mcId]: {
        id: mcId, definitionId: 'mercantile-1', cityId: mcCity, units: [],
        diplomacy: createDiplomacyState(ids, mcId, 0),
        activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
        regionalGrievanceByCiv: {}, isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
      },
    },
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0,
      tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    marketplace: { ...createMarketplaceState(), tradeRoutes: [] },
    religions: {},
    cityFaith: {},
  } as GameState;

  return { state, p1, p1City, p2, p2City, mcId, mcCity };
}
```

- [ ] **Step 2: Write the failing tests for eligibility and tick math**

```typescript
// Add to tests/systems/religion-loyalty-system.test.ts
import {
  getForeignFaithPressure, isLoyaltyTrackEligible, getLoyaltyThreshold, getLoyaltyTickAmount,
} from '@/systems/religion-loyalty-system';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — getForeignFaithPressure / isLoyaltyTrackEligible', () => {
  it('is eligible when a non-human AI city follows a foreign faith bordering that faith owner territory', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const result = isLoyaltyTrackEligible(withFaith, p2City);
    expect(result).not.toBeNull();
    expect(result!.pressuringCivId).toBe(p1);
  });

  it('is NEVER eligible for a human-owned city -- gets foreign faith pressure info but not loyalty-track eligibility', () => {
    const { state, p1, p2, p1City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Rival', ownerCivId: p2, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, p1City)).toBeNull();
    // But the shared pressure-context check still reports it -- used by the human-immunity unrest row.
    expect(getForeignFaithPressure(withFaith, p1City)).not.toBeNull();
  });

  it('is not eligible when the city follows its own civ faith', () => {
    const { state, p2, p2City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Own', ownerCivId: p2, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, p2City)).toBeNull();
  });

  it('is not eligible when territory does not border the faith owner', () => {
    const { state, p1, mcId, mcCity, p2City } = makeLoyaltyFixture();
    // mc-city (q6) does NOT border p1's territory (q0/q2) -- only p2's (q3/q5).
    const withFaith = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    expect(isLoyaltyTrackEligible(withFaith, mcCity)).toBeNull();
  });

  it('IS eligible for a minor civ bordering the faith owner', () => {
    const { state, p2, mcCity } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Test', ownerCivId: p2, foundedTurn: 1 } },
    };
    const result = isLoyaltyTrackEligible(withFaith, mcCity);
    expect(result).not.toBeNull();
    expect(result!.pressuringCivId).toBe(p2);
  });
});

describe('#593 MR6 — getLoyaltyThreshold', () => {
  it('reads the game-wide opponentChallenge, not per-civ', () => {
    const { state } = makeLoyaltyFixture();
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'explorer' })).toBe(150);
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'standard' })).toBe(180);
    expect(getLoyaltyThreshold({ ...state, opponentChallenge: 'veteran' })).toBe(220);
  });
});

describe('#593 MR6 — getLoyaltyTickAmount', () => {
  it('base tick is 10', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = state.cities[p2City];
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(state, city, religion)).toBe(10);
  });

  it('Fervor multiplies tick by 1.25, floored to 12', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = state.cities[p2City];
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1, boon: 'fervor' as const };
    expect(getLoyaltyTickAmount(state, city, religion)).toBe(12);
  });

  it('a temple in the city halves the tick, floored', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = { ...state.cities[p2City], buildings: ['temple'] };
    const withCity = { ...state, cities: { ...state.cities, [p2City]: city } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(withCity, city, religion)).toBe(5);
  });

  it('temple + Fervor combine: 12 halved to 6', () => {
    const { state, p2City } = makeLoyaltyFixture();
    const city = { ...state.cities[p2City], buildings: ['temple'] };
    const withCity = { ...state, cities: { ...state.cities, [p2City]: city } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1, boon: 'fervor' as const };
    expect(getLoyaltyTickAmount(withCity, city, religion)).toBe(6);
  });

  it('a garrisoned city has zero tick (paused)', () => {
    const { state, p2, p2City } = makeLoyaltyFixture();
    const garrison = {
      id: 'garrison-1', type: 'warrior', owner: p2, position: state.cities[p2City].position,
      hp: 100, maxHp: 100, movementPointsLeft: 2, maxMovementPoints: 2, hasActed: false,
    } as any;
    const withGarrison = { ...state, units: { [garrison.id]: garrison } };
    const religion = { id: 'r', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } as const;
    expect(getLoyaltyTickAmount(withGarrison, state.cities[p2City], religion)).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: FAIL — `religion-loyalty-system.ts` does not exist yet.

- [ ] **Step 4: Implement the core module**

```typescript
// src/systems/religion-loyalty-system.ts
import type { City, GameState, Religion } from '@/core/types';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { canGarrisonCity } from '@/systems/faction-system';
import { LOYALTY_BASE_TICK, LOYALTY_THRESHOLD_BY_CHALLENGE, FERVOR_MULTIPLIER } from '@/systems/religion-definitions';
import { resolveOpponentChallenge } from '@/core/opponent-challenge';

export interface ForeignFaithPressure {
  religion: Religion;
  pressuringCivId: string;
}

// Shared adjacency + faith-mismatch check, used both by the loyalty track (AI/minor-civ
// cities, via isLoyaltyTrackEligible) and the human-immunity "Foreign faith pressure"
// unrest row (human-owned cities, via faction-system.ts) -- see #593 MR6.
export function getForeignFaithPressure(state: GameState, cityId: string): ForeignFaithPressure | null {
  const city = state.cities[cityId];
  if (!city) return null;
  const faith = state.cityFaith?.[cityId];
  if (!faith) return null;
  const religion = state.religions?.[faith.religionId];
  if (!religion || religion.ownerCivId === city.owner) return null;

  const bordersPressuringTerritory = city.ownedTiles.some(coord =>
    hexNeighbors(coord).some(n => state.map.tiles[hexKey(n)]?.owner === religion.ownerCivId),
  );
  if (!bordersPressuringTerritory) return null;

  return { religion, pressuringCivId: religion.ownerCivId };
}

// #593 MR6: "Humans NEVER flip" -- human-owned cities are never tracked here, no matter
// how strong the foreign faith pressure. Their sustained pressure surfaces instead as
// the "Foreign faith pressure" unrest row (faction-system.ts getUnrestPressureBreakdown).
export function isLoyaltyTrackEligible(state: GameState, cityId: string): ForeignFaithPressure | null {
  const city = state.cities[cityId];
  if (!city) return null;
  if (state.civilizations[city.owner]?.isHuman) return null;
  return getForeignFaithPressure(state, cityId);
}

export function getLoyaltyThreshold(state: Pick<GameState, 'opponentChallenge'>): number {
  return LOYALTY_THRESHOLD_BY_CHALLENGE[resolveOpponentChallenge(state)];
}

// Garrison pauses (0), Fervor multiplies (floored), temple halves whatever tick results
// (floored) -- applied in that order: base -> Fervor -> temple. Matches issue #593's
// worked examples: 10 -> Fervor 12 -> temple 6; 10 -> temple 5 (no Fervor).
export function getLoyaltyTickAmount(state: GameState, city: City, religion: Pick<Religion, 'boon'>): number {
  if (canGarrisonCity(city.id, state)) return 0;
  let tick = LOYALTY_BASE_TICK;
  if (religion.boon === 'fervor') tick = Math.floor(tick * FERVOR_MULTIPLIER);
  if (city.buildings.includes('temple')) tick = Math.floor(tick / 2);
  return tick;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: PASS (all eligibility + tick tests)

- [ ] **Step 6: Commit**

```bash
git add src/systems/religion-loyalty-system.ts tests/systems/religion-loyalty-system.test.ts tests/systems/helpers/religion-loyalty-fixture.ts
git commit -m "feat(religion): loyalty eligibility + tick math core (#593 MR6 Task 4)"
```

---

### Task 5: Peaceful minor-civ absorption helper

**Files:**
- Modify: `src/systems/minor-civ-system.ts` (add new function near `conquestMinorCiv` at line 679)
- Test: `tests/systems/minor-civ-system.test.ts`

**Interfaces:**
- Consumes: `MinorCivState`, `ChainTransition` (from `@/systems/quest-chain-system`).
- Produces: `peacefullyAbsorbMinorCiv(state: GameState, mcId: string, newOwnerId: string): { state: GameState; transitions: ChainTransition[]; absorbed: boolean }`.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to tests/systems/minor-civ-system.test.ts
import { peacefullyAbsorbMinorCiv } from '@/systems/minor-civ-system';

describe('#593 MR6 — peacefullyAbsorbMinorCiv', () => {
  function makeState() {
    const mcId = 'mc-1';
    const conquerorId = 'p1';
    const cityId = 'mc-city';
    return {
      state: {
        cities: { [cityId]: { id: cityId, owner: mcId, ownedTiles: [{ q: 0, r: 0 }] } },
        civilizations: { [conquerorId]: { id: conquerorId, cities: [], units: [] } },
        minorCivs: {
          [mcId]: {
            id: mcId, definitionId: 'x', cityId, units: ['garrison-1'],
            diplomacy: { relationships: {} }, activeQuests: {},
            chainStatusByCiv: { [conquerorId]: { status: 'allied', chainId: 'chain-1' } },
            questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
            isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
          },
        },
        units: { 'garrison-1': { id: 'garrison-1', owner: mcId, type: 'warrior', position: { q: 0, r: 0 } } },
      } as any,
      mcId, conquerorId, cityId,
    };
  }

  it('marks the minor civ destroyed, transfers the city, and TRANSFERS (does not delete) garrison units', () => {
    const { state, mcId, conquerorId, cityId } = makeState();
    const result = peacefullyAbsorbMinorCiv(state, mcId, conquerorId);
    expect(result.absorbed).toBe(true);
    expect(result.state.minorCivs[mcId].isDestroyed).toBe(true);
    expect(result.state.cities[cityId].owner).toBe(conquerorId);
    expect(result.state.civilizations[conquerorId].cities).toContain(cityId);
    expect(result.state.units['garrison-1']).toBeDefined();
    expect(result.state.units['garrison-1'].owner).toBe(conquerorId);
    expect(result.state.civilizations[conquerorId].units).toContain('garrison-1');
  });

  it('reports an alliance-broken transition for any allied major civ', () => {
    const { state, mcId, conquerorId } = makeState();
    const result = peacefullyAbsorbMinorCiv(state, mcId, conquerorId);
    expect(result.transitions).toContainEqual({ type: 'alliance-broken', majorCivId: conquerorId, minorCivId: mcId, chainId: 'chain-1' });
  });

  it('is a no-op for an already-destroyed minor civ', () => {
    const { state, mcId, conquerorId } = makeState();
    const destroyed = { ...state, minorCivs: { ...state.minorCivs, [mcId]: { ...state.minorCivs[mcId], isDestroyed: true } } };
    const result = peacefullyAbsorbMinorCiv(destroyed, mcId, conquerorId);
    expect(result.absorbed).toBe(false);
    expect(result.state).toBe(destroyed);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-system.test.ts`
Expected: FAIL — `peacefullyAbsorbMinorCiv` is not exported.

- [ ] **Step 3: Implement the function**

In `src/systems/minor-civ-system.ts`, add immediately after `conquestMinorCiv` (after line 720, before the `=== Guerrilla & Scuffles ===` section):

```typescript
// #593 MR6: peaceful counterpart to conquestMinorCiv, used by a religious loyalty
// defection rather than military conquest. Same core bookkeeping (destroyed flag,
// alliance-broken transitions, city ownership transfer) but deliberately does NOT
// delete the garrison units (they're transferred to the new owner, since nothing
// hostile happened) and does NOT call applyRegionalGrievanceForMinorCivConquest
// (peaceful defection isn't a regional act of war). Territory tiles are not touched
// here -- the per-turn recalculateTerritory pass in turn-manager.ts picks up the
// city.owner change on the same turn, matching conquestMinorCiv's existing convention.
export function peacefullyAbsorbMinorCiv(
  state: GameState,
  mcId: string,
  newOwnerId: string,
): { state: GameState; transitions: ChainTransition[]; absorbed: boolean } {
  const existing = state.minorCivs[mcId];
  if (!existing || existing.isDestroyed) return { state, transitions: [], absorbed: false };
  const nextState = structuredClone(state);
  const mc = nextState.minorCivs[mcId];
  const transitions: ChainTransition[] = [];
  for (const [majorCivId, status] of Object.entries(mc.chainStatusByCiv)) {
    if (status.status === 'allied') {
      transitions.push({ type: 'alliance-broken', majorCivId, minorCivId: mcId, chainId: status.chainId });
    }
  }

  mc.isDestroyed = true;
  mc.activeQuests = {};
  mc.chainStatusByCiv = {};
  mc.questCooldownUntilByCiv = {};
  mc.lastNotifiedStatusByCiv = {};

  const city = nextState.cities[mc.cityId];
  if (city) {
    city.owner = newOwnerId;
    const civ = nextState.civilizations[newOwnerId];
    if (civ && !civ.cities.includes(mc.cityId)) {
      civ.cities.push(mc.cityId);
    }
  }

  const transferredUnitIds = mc.units.filter(uid => nextState.units[uid] !== undefined);
  for (const unitId of transferredUnitIds) {
    nextState.units[unitId].owner = newOwnerId;
  }
  const civ = nextState.civilizations[newOwnerId];
  if (civ) {
    civ.units = [...civ.units, ...transferredUnitIds.filter(id => !civ.units.includes(id))];
  }
  mc.units = [];

  return { state: nextState, transitions, absorbed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/minor-civ-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/minor-civ-system.ts tests/systems/minor-civ-system.test.ts
git commit -m "feat(religion): peaceful minor-civ absorption helper (#593 MR6 Task 5)"
```

---

### Task 6: Defection execution

**Files:**
- Modify: `src/systems/religion-loyalty-system.ts` (add to the file created in Task 4)
- Test: `tests/systems/religion-loyalty-system.test.ts`

**Interfaces:**
- Consumes: `transferCapturedCityOwnership` from `@/systems/city-capture-system`; `modifyRelationship` from `@/systems/diplomacy-system`; `peacefullyAbsorbMinorCiv` from `@/systems/minor-civ-system`; `emitMinorCivQuestTransitions` from `@/systems/quest-chain-system`.
- Produces: `executeLoyaltyDefection(state: GameState, bus: EventBus, cityId: string, pressuringCivId: string): GameState`; internal helpers `setLoyaltyPoints`, `clearLoyaltyProgress` (exported for Task 7's reuse).

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to tests/systems/religion-loyalty-system.test.ts
import { EventBus } from '@/core/event-bus';
import { executeLoyaltyDefection, setLoyaltyPoints, clearLoyaltyProgress } from '@/systems/religion-loyalty-system';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — executeLoyaltyDefection (major civ to major civ)', () => {
  it('transfers the city, applies a bilateral relationship penalty, clears loyaltyProgress, and emits religion:city-defected', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const withProgress = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 180 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const bus = new EventBus();
    const defections: any[] = [];
    bus.on('religion:city-defected', e => defections.push(e));

    const next = executeLoyaltyDefection(withProgress, bus, p2City, p1);

    expect(next.cities[p2City].owner).toBe(p1);
    expect(next.civilizations[p1].diplomacy.relationships[p2]).toBeLessThan(0);
    expect(next.civilizations[p2]?.diplomacy.relationships[p1]).toBeLessThan(0);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
    expect(defections).toEqual([{ cityId: p2City, fromCivId: p2, toCivId: p1 }]);
  });
});

describe('#593 MR6 — executeLoyaltyDefection (minor civ absorption)', () => {
  it('absorbs the minor civ into the pressuring civ and clears loyaltyProgress', () => {
    const { state, p2, mcId, mcCity } = makeLoyaltyFixture();
    const withProgress = {
      ...state,
      cityFaith: { [mcCity]: { religionId: `religion-${p2}`, loyaltyProgress: { toCivId: p2, points: 180 } } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Test', ownerCivId: p2, foundedTurn: 1 } },
    };
    const bus = new EventBus();
    const destroyed: any[] = [];
    bus.on('minor-civ:destroyed', e => destroyed.push(e));

    const next = executeLoyaltyDefection(withProgress, bus, mcCity, p2);

    expect(next.cities[mcCity].owner).toBe(p2);
    expect(next.minorCivs[mcId].isDestroyed).toBe(true);
    expect(next.cityFaith![mcCity].loyaltyProgress).toBeUndefined();
    expect(destroyed).toEqual([{ minorCivId: mcId, conquerorId: p2 }]);
  });
});

describe('#593 MR6 — setLoyaltyPoints / clearLoyaltyProgress', () => {
  it('setLoyaltyPoints writes points for the given civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withFaith = { ...state, cityFaith: { [p2City]: { religionId: `religion-${p1}` } } };
    const next = setLoyaltyPoints(withFaith, p2City, p1, 40);
    expect(next.cityFaith![p2City].loyaltyProgress).toEqual({ toCivId: p1, points: 40 });
  });

  it('clearLoyaltyProgress removes the field without touching religionId', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withProgress = { ...state, cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 40 } } } };
    const next = clearLoyaltyProgress(withProgress, p2City);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
    expect(next.cityFaith![p2City].religionId).toBe(`religion-${p1}`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: FAIL — `executeLoyaltyDefection`, `setLoyaltyPoints`, `clearLoyaltyProgress` not exported.

- [ ] **Step 3: Implement defection execution**

Add to the top of `src/systems/religion-loyalty-system.ts`, extending the existing imports:

```typescript
import type { EventBus } from '@/core/event-bus';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';
import { modifyRelationship } from '@/systems/diplomacy-system';
import { peacefullyAbsorbMinorCiv } from '@/systems/minor-civ-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
```

Append to the end of the file:

```typescript
export function setLoyaltyPoints(state: GameState, cityId: string, toCivId: string, points: number): GameState {
  const faith = state.cityFaith?.[cityId];
  if (!faith) return state;
  return {
    ...state,
    cityFaith: { ...state.cityFaith, [cityId]: { ...faith, loyaltyProgress: { toCivId, points } } },
  };
}

export function clearLoyaltyProgress(state: GameState, cityId: string): GameState {
  const faith = state.cityFaith?.[cityId];
  if (!faith?.loyaltyProgress) return state;
  const { loyaltyProgress: _removed, ...rest } = faith;
  return { ...state, cityFaith: { ...state.cityFaith, [cityId]: rest } };
}

// -30 mirrors the flip_loyalty spy mission's bilateral penalty (#524 MR2a,
// espionage-system.ts); this is slightly milder (-25) since a religious defection is a
// consequence of sustained ambient pressure, not an active hostile spy operation.
const DEFECTION_RELATIONSHIP_PENALTY = -25;

export function executeLoyaltyDefection(
  state: GameState,
  bus: EventBus,
  cityId: string,
  pressuringCivId: string,
): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const fromCivId = city.owner;

  let next = state;
  if (next.minorCivs[fromCivId]) {
    const result = peacefullyAbsorbMinorCiv(next, fromCivId, pressuringCivId);
    next = result.state;
    emitMinorCivQuestTransitions(bus, result.transitions, next);
    if (result.absorbed) {
      bus.emit('minor-civ:destroyed', { minorCivId: fromCivId, conquerorId: pressuringCivId });
    }
  } else {
    next = transferCapturedCityOwnership(next, cityId, pressuringCivId, next.turn);
    const pressuringCiv = next.civilizations[pressuringCivId];
    const fromCiv = next.civilizations[fromCivId];
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        ...(pressuringCiv ? {
          [pressuringCivId]: {
            ...pressuringCiv,
            diplomacy: modifyRelationship(pressuringCiv.diplomacy, fromCivId, DEFECTION_RELATIONSHIP_PENALTY),
          },
        } : {}),
        // fromCiv may have been eliminated by transferCapturedCityOwnership if this was
        // its last city -- skip the penalty for a civ that no longer exists.
        ...(fromCiv ? {
          [fromCivId]: {
            ...fromCiv,
            diplomacy: modifyRelationship(fromCiv.diplomacy, pressuringCivId, DEFECTION_RELATIONSHIP_PENALTY),
          },
        } : {}),
      },
    };
  }

  next = clearLoyaltyProgress(next, cityId);
  bus.emit('religion:city-defected', { cityId, fromCivId, toCivId: pressuringCivId });
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/religion-loyalty-system.ts tests/systems/religion-loyalty-system.test.ts
git commit -m "feat(religion): loyalty defection execution, major and minor civ paths (#593 MR6 Task 6)"
```

---

### Task 7: processLoyaltyTurn — warnings, ambient drift, full turn loop, turn-manager wiring

**Files:**
- Modify: `src/systems/religion-loyalty-system.ts`
- Modify: `src/core/turn-manager.ts:98,153` (import + call site)
- Test: `tests/systems/religion-loyalty-system.test.ts`
- Test: `tests/core/turn-manager.test.ts` (or wherever the existing full-turn integration tests live — search for `processReligionTurn` usage in that file's imports first)

**Interfaces:**
- Consumes: everything from Tasks 4 and 6.
- Produces: `processLoyaltyTurn(state: GameState, bus: EventBus): GameState`.

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to tests/systems/religion-loyalty-system.test.ts
import { processLoyaltyTurn } from '@/systems/religion-loyalty-system';

describe('#593 MR6 — processLoyaltyTurn', () => {
  function withFaith(civId: string, targetCityId: string, state: any, boon?: 'fervor') {
    return {
      ...state,
      cityFaith: { [targetCityId]: { religionId: `religion-${civId}` } },
      religions: { [`religion-${civId}`]: { id: `religion-${civId}`, name: 'Test', ownerCivId: civId, foundedTurn: 1, ...(boon ? { boon } : {}) } },
    };
  }

  it('advances loyaltyProgress.points by the tick amount each turn', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = withFaith(p1, p2City, state);
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p2City].loyaltyProgress).toEqual({ toCivId: p1, points: 10 });
  });

  it('never advances a human-owned city -- points stay undefined, unrest row is the only signal', () => {
    const { state, p2, p1City } = makeLoyaltyFixture();
    const seeded = withFaith(p2, p1City, state);
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p1City].loyaltyProgress).toBeUndefined();
  });

  it('deterministically flips at the threshold turn for the standard challenge (180 / 10 = 18 turns)', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    for (let turn = 0; turn < 17; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });

  it('deterministically flips at the veteran threshold (220 / 10 = 22 turns)', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = { ...withFaith(p1, p2City, state), opponentChallenge: 'veteran' as const };
    const bus = new EventBus();
    for (let turn = 0; turn < 21; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });

  it('fires religion:loyalty-warning at start, midpoint, and one-turn-out', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    const stages: string[] = [];
    bus.on('religion:loyalty-warning', e => stages.push(e.stage));
    for (let turn = 0; turn < 18; turn++) {
      current = processLoyaltyTurn(current, bus);
    }
    expect(stages).toContain('start');
    expect(stages).toContain('midpoint');
    expect(stages).toContain('final');
  });

  it('garrisoning pauses the tick entirely', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const garrison = {
      id: 'g1', type: 'warrior', owner: p2, position: state.cities[p2City].position,
      hp: 100, maxHp: 100, movementPointsLeft: 2, maxMovementPoints: 2, hasActed: false,
    } as any;
    const seeded = { ...withFaith(p1, p2City, state), units: { [garrison.id]: garrison } };
    const bus = new EventBus();
    const next = processLoyaltyTurn(seeded, bus);
    expect(next.cityFaith![p2City].loyaltyProgress).toBeUndefined();
  });

  it('re-conversion (religionId change) resets progress to zero on the next tick', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = withFaith(p1, p2City, state);
    const bus = new EventBus();
    current = processLoyaltyTurn(current, bus);
    current = processLoyaltyTurn(current, bus);
    expect(current.cityFaith![p2City].loyaltyProgress!.points).toBe(20);
    // City re-converts back to its own civ's faith -- own-faith means not eligible at all.
    current = {
      ...current,
      cityFaith: { [p2City]: { religionId: `religion-${p2}` } },
      religions: { ...current.religions, [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Own', ownerCivId: p2, foundedTurn: 1 } },
    };
    current = processLoyaltyTurn(current, bus);
    expect(current.cityFaith![p2City].loyaltyProgress).toBeUndefined();
  });

  it('ambient drift: minor civs following a civ faith gain +1 relationship/turn toward that civ, capped at 60', () => {
    const { state, p2, mcId, mcCity } = makeLoyaltyFixture();
    let current = withFaith(p2, mcCity, state);
    current = { ...current, minorCivs: { ...current.minorCivs, [mcId]: { ...current.minorCivs[mcId], diplomacy: { relationships: { [p2]: 59 } } } } };
    const bus = new EventBus();
    current = processLoyaltyTurn(current, bus);
    expect(current.minorCivs[mcId].diplomacy.relationships[p2]).toBe(60);
    current = processLoyaltyTurn(current, bus);
    expect(current.minorCivs[mcId].diplomacy.relationships[p2]).toBe(60);
  });
});
```

Note: import `makeLoyaltyFixture` at the top of the test file alongside the existing imports if not already present from Task 4.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: FAIL — `processLoyaltyTurn` not exported.

- [ ] **Step 3: Implement processLoyaltyTurn**

Append to `src/systems/religion-loyalty-system.ts`:

```typescript
function applyAmbientFaithDrift(state: GameState): GameState {
  let next = state;
  for (const mc of Object.values(state.minorCivs)) {
    if (mc.isDestroyed) continue;
    const faith = state.cityFaith?.[mc.cityId];
    if (!faith) continue;
    const religion = state.religions?.[faith.religionId];
    if (!religion) continue;
    const current = mc.diplomacy.relationships[religion.ownerCivId] ?? 0;
    if (current >= 60) continue;
    const updated = Math.min(60, current + 1);
    next = {
      ...next,
      minorCivs: {
        ...next.minorCivs,
        [mc.id]: {
          ...next.minorCivs[mc.id],
          diplomacy: {
            ...next.minorCivs[mc.id].diplomacy,
            relationships: { ...next.minorCivs[mc.id].diplomacy.relationships, [religion.ownerCivId]: updated },
          },
        },
      },
    };
  }
  return next;
}

function emitLoyaltyWarning(
  bus: EventBus,
  cityId: string,
  pressuringCivId: string,
  currentPoints: number,
  newPoints: number,
  threshold: number,
  tick: number,
): void {
  let stage: 'start' | 'midpoint' | 'final' | null = null;
  if (tick > 0 && newPoints < threshold && threshold - newPoints <= tick) stage = 'final';
  else if (currentPoints < threshold / 2 && newPoints >= threshold / 2) stage = 'midpoint';
  else if (currentPoints === 0 && newPoints > 0) stage = 'start';
  if (!stage) return;
  const turnsRemaining = tick > 0 ? Math.max(1, Math.ceil((threshold - newPoints) / tick)) : -1;
  bus.emit('religion:loyalty-warning', { cityId, pressuringCivId, stage, turnsRemaining });
}

export function processLoyaltyTurn(state: GameState, bus: EventBus): GameState {
  let next = applyAmbientFaithDrift(state);
  const threshold = getLoyaltyThreshold(next);

  for (const city of Object.values(state.cities)) {
    const pressure = isLoyaltyTrackEligible(next, city.id);
    const faith = next.cityFaith?.[city.id];

    if (!pressure) {
      if (faith?.loyaltyProgress) next = clearLoyaltyProgress(next, city.id);
      continue;
    }

    const existingProgress = faith!.loyaltyProgress;
    const currentPoints = existingProgress && existingProgress.toCivId === pressure.pressuringCivId
      ? existingProgress.points
      : 0;

    const liveCity = next.cities[city.id];
    const tick = getLoyaltyTickAmount(next, liveCity, pressure.religion);
    const newPoints = Math.min(threshold, currentPoints + tick);

    if (tick > 0) {
      next = setLoyaltyPoints(next, city.id, pressure.pressuringCivId, newPoints);
      emitLoyaltyWarning(bus, city.id, pressure.pressuringCivId, currentPoints, newPoints, threshold, tick);
    }

    if (newPoints >= threshold) {
      next = executeLoyaltyDefection(next, bus, city.id, pressure.pressuringCivId);
    }
  }

  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: PASS (all `processLoyaltyTurn` tests)

- [ ] **Step 5: Wire into turn-manager.ts**

In `src/core/turn-manager.ts`, add the import alongside the existing religion import (line 98):

```typescript
import { processReligionTurn, foundReligion } from '@/systems/religion-system';
import { processLoyaltyTurn } from '@/systems/religion-loyalty-system';
```

And add the call immediately after `processReligionTurn` (line 153):

```typescript
  newState = processReligionTurn(newState, bus);
  newState = processLoyaltyTurn(newState, bus);
```

Search `tests/core/turn-manager.test.ts` (or the actual file covering `processTurn`/`endTurn`) for an existing integration test asserting turn-processing order or side effects, and add:

```typescript
// #593 MR6
it('processes religious loyalty after religion conversion each turn', () => {
  // Reuse this file's existing full-turn fixture helper. Seed a civ with a founded
  // religion and a foreign AI city following it with loyaltyProgress already set one
  // tick below the standard threshold (170), then confirm processTurn/endTurn (whatever
  // this file's real entry point is named) both advances the tick AND completes a flip
  // in the same call when it crosses the threshold -- i.e. processLoyaltyTurn is
  // actually reached, not just defined.
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/turn-manager.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/systems/religion-loyalty-system.ts src/core/turn-manager.ts tests/systems/religion-loyalty-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(religion): processLoyaltyTurn full turn loop, wire into turn-manager (#593 MR6 Task 7)"
```

---

### Task 8: Human immunity — Foreign faith pressure unrest row

**Files:**
- Modify: `src/systems/faction-system.ts:96-114` (`getUnrestPressureBreakdown`)
- Test: `tests/systems/faction-system.test.ts`

**Interfaces:**
- Consumes: `getForeignFaithPressure` from `@/systems/religion-loyalty-system`.
- Produces: no new exports — adds one row to the existing `getUnrestPressureBreakdown` return array.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to tests/systems/faction-system.test.ts
import { getUnrestPressureBreakdown } from '@/systems/faction-system';

describe('#593 MR6 — Foreign faith pressure unrest row (human immunity)', () => {
  it('adds a +2 "Foreign faith pressure" row for a human city bordering a foreign faith owner', () => {
    const { state, p2, p1City } = makeLoyaltyFixture(); // reuse Task 4's fixture (p1 is human)
    const withFaith = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Rival', ownerCivId: p2, foundedTurn: 1 } },
    };
    const rows = getUnrestPressureBreakdown(p1City, withFaith);
    expect(rows).toContainEqual({ label: 'Foreign faith pressure', amount: 2 });
  });

  it('does not add the row when the city follows its own civ faith', () => {
    const { state, p1, p1City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Own', ownerCivId: p1, foundedTurn: 1 } },
    };
    const rows = getUnrestPressureBreakdown(p1City, withFaith);
    expect(rows.find(r => r.label === 'Foreign faith pressure')).toBeUndefined();
  });

  it('does not add the row for an AI-owned city (that city gets the real loyalty track instead, not the immunity row)', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const withFaith = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const rows = getUnrestPressureBreakdown(p2City, withFaith);
    expect(rows.find(r => r.label === 'Foreign faith pressure')).toBeUndefined();
  });
});
```

Add `import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';` to this test file's imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/faction-system.test.ts`
Expected: FAIL — no such row yet.

- [ ] **Step 3: Implement the row**

In `src/systems/faction-system.ts`, add the import at the top:

```typescript
import { getForeignFaithPressure } from './religion-loyalty-system';
```

Add the row inside `getUnrestPressureBreakdown`, immediately after the existing "Religious serenity" block (after line 108, before the `contagion` block):

```typescript
  // #593 MR6: human cities never enter the loyalty-flip track (see
  // isLoyaltyTrackEligible), but sustained foreign-faith dominance still costs them --
  // a flat +2 unrest pressure row instead of a literal defection risk.
  if (state.civilizations[owner]?.isHuman && getForeignFaithPressure(state, cityId)) {
    rows.push({ label: 'Foreign faith pressure', amount: 2 });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/faction-system.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/systems/faction-system.ts tests/systems/faction-system.test.ts
git commit -m "feat(religion): Foreign faith pressure unrest row for human immunity (#593 MR6 Task 8)"
```

---

### Task 9: Notification routing

**Files:**
- Modify: `src/ui/notification-routing.ts` (add two route functions near `routeReligionCityConverted`, line ~503)
- Modify: `src/main.ts` (add two `bus.on` subscriptions near the existing `religion:*` subscriptions, line ~4610)
- Test: `tests/ui/religion-notification-routing.test.ts`

**Interfaces:**
- Consumes: `NotificationSink` type, `hasMetCivilization` from `@/systems/discovery-system` (already imported in `notification-routing.ts`).
- Produces: `routeLoyaltyWarning(state, event, sink): void`; `routeCityDefected(state, event, sink): void`.

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to tests/ui/religion-notification-routing.test.ts
import { routeLoyaltyWarning, routeCityDefected } from '@/ui/notification-routing';

describe('#593 MR6 — routeLoyaltyWarning', () => {
  it('notifies the pressuring civ with the warning stage', () => {
    const state = { cities: { c1: { name: 'Rival City', owner: 'p2' } }, civilizations: { p1: { name: 'Player' } } } as any;
    const calls: any[] = [];
    routeLoyaltyWarning(state, { cityId: 'c1', pressuringCivId: 'p1', stage: 'start', turnsRemaining: 18 }, (...args) => calls.push(args));
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('p1');
    expect(calls[0][1]).toMatch(/Rival City/);
  });
});

describe('#593 MR6 — routeCityDefected', () => {
  it('notifies both the new owner (success) and the former owner (warning), when the former owner still exists', () => {
    const state = { cities: { c1: { name: 'Border City', owner: 'p1' } }, civilizations: { p1: { name: 'Player' }, p2: { name: 'Rival' } } } as any;
    const calls: any[] = [];
    routeCityDefected(state, { cityId: 'c1', fromCivId: 'p2', toCivId: 'p1' }, (...args) => calls.push(args));
    expect(calls.some(c => c[0] === 'p1' && c[2] === 'success')).toBe(true);
    expect(calls.some(c => c[0] === 'p2' && c[2] === 'warning')).toBe(true);
  });

  it('only notifies the new owner when the former owner was a minor civ (not in civilizations)', () => {
    const state = { cities: { c1: { name: 'Border City', owner: 'p1' } }, civilizations: { p1: { name: 'Player' } } } as any;
    const calls: any[] = [];
    routeCityDefected(state, { cityId: 'c1', fromCivId: 'mc-1', toCivId: 'p1' }, (...args) => calls.push(args));
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('p1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/religion-notification-routing.test.ts`
Expected: FAIL — `routeLoyaltyWarning`, `routeCityDefected` not exported.

- [ ] **Step 3: Implement routing**

In `src/ui/notification-routing.ts`, add after `routeReligionCityConverted` (after line 503):

```typescript
const LOYALTY_WARNING_TEXT: Record<'start' | 'midpoint' | 'final', string> = {
  start: 'is starting to slip toward',
  midpoint: 'is now halfway to defecting to',
  final: 'will defect to',
};

// #593 MR6: notifies the PRESSURING civ (the faith owner) -- the target city's owner is
// always a minor civ or non-human AI (isLoyaltyTrackEligible excludes human owners), so
// notifying them would only ever silently log, never toast.
export function routeLoyaltyWarning(
  state: GameState,
  event: GameEvents['religion:loyalty-warning'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const verb = LOYALTY_WARNING_TEXT[event.stage];
  const suffix = event.stage === 'final' ? ' next turn' : ` in ~${event.turnsRemaining} turns`;
  sink(event.pressuringCivId, `${city.name} ${verb} your faith${event.stage === 'final' ? suffix : suffix}!`, event.stage === 'final' ? 'warning' : 'info');
}

// #593 MR6: mirrors routeReligionCityConverted's two-recipient shape -- the new owner
// gets a success toast, the former owner (if it still exists as a real civ) gets a
// warning. A minor-civ former owner isn't in state.civilizations, so it's silently
// skipped (there's no player to notify).
export function routeCityDefected(
  state: GameState,
  event: GameEvents['religion:city-defected'],
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  sink(event.toCivId, `${city.name} has defected to your faith!`, 'success');
  if (state.civilizations[event.fromCivId]) {
    sink(event.fromCivId, `${city.name} has defected to a rival faith and left your empire.`, 'warning');
  }
}
```

In `src/main.ts`, add subscriptions after the existing `bus.on('religion:city-converted', ...)` block (after line 4610):

```typescript
bus.on('religion:loyalty-warning', event => {
  routeLoyaltyWarning(gameState, event, appendToCivLog);
});

bus.on('religion:city-defected', event => {
  routeCityDefected(gameState, event, appendToCivLog);
});
```

Add `routeLoyaltyWarning, routeCityDefected` to the existing `notification-routing` import in `src/main.ts` (find the import line that already brings in `routeReligionFounded, routeReligionCityConverted` and extend it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/religion-notification-routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/notification-routing.ts src/main.ts tests/ui/religion-notification-routing.test.ts
git commit -m "feat(religion): loyalty-warning and city-defected notification routing (#593 MR6 Task 9)"
```

---

### Task 10: Map badge (both sides)

**Files:**
- Create: `src/systems/loyalty-pressure-presentation.ts`
- Modify: `src/renderer/city-render-passes.ts` (new field on `CityRenderItem`, new render pass)
- Modify: `src/renderer/city-renderer.ts` (thread the new presentation through `CityRenderOptions`)
- Modify: `src/renderer/render-loop.ts` (compute + pass the presentation, mirroring `worldPressurePresentation`)
- Test: `tests/systems/loyalty-pressure-presentation.test.ts`

**Interfaces:**
- Consumes: `getForeignFaithPressure`, `isLoyaltyTrackEligible` from `@/systems/religion-loyalty-system`.
- Produces: `LoyaltyPressureBadge { cityId: string; coord: HexCoord }`; `LoyaltyPressurePresentation { cityBadges: LoyaltyPressureBadge[] }`; `getLoyaltyPressurePresentationForViewer(state, viewerCivId): LoyaltyPressurePresentation`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/systems/loyalty-pressure-presentation.test.ts
import { describe, it, expect } from 'vitest';
import { getLoyaltyPressurePresentationForViewer } from '@/systems/loyalty-pressure-presentation';
import { makeLoyaltyFixture } from './helpers/religion-loyalty-fixture';

describe('#593 MR6 — getLoyaltyPressurePresentationForViewer', () => {
  it('shows a badge on the pressured city to the pressuring civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p1);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows a badge on the pressured city to the current (pressured) owner too', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, p2);
    expect(presentation.cityBadges.map(b => b.cityId)).toContain(p2City);
  });

  it('shows no badge to an unrelated third civ', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
      civilizations: { ...state.civilizations, p3: { ...state.civilizations[p1], id: 'p3' } },
    };
    const presentation = getLoyaltyPressurePresentationForViewer(seeded, 'p3');
    expect(presentation.cityBadges).toHaveLength(0);
  });

  it('shows no badge once loyaltyProgress is not yet tracked (no active pressure)', () => {
    const { state, p1, p2City } = makeLoyaltyFixture();
    const presentation = getLoyaltyPressurePresentationForViewer(state, p1);
    expect(presentation.cityBadges.find(b => b.cityId === p2City)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/loyalty-pressure-presentation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the presentation helper**

```typescript
// src/systems/loyalty-pressure-presentation.ts
import type { GameState, HexCoord } from '@/core/types';

export interface LoyaltyPressureBadge {
  cityId: string;
  coord: HexCoord;
}

export interface LoyaltyPressurePresentation {
  cityBadges: LoyaltyPressureBadge[];
}

const EMPTY: LoyaltyPressurePresentation = { cityBadges: [] };

// #593 MR6: "both sides see a map badge" -- the pressuring civ (religion owner) and the
// pressured city's current owner (if it's a real civ the viewer IS -- a minor civ owner
// has no viewer of its own). Only fires once loyaltyProgress is actively tracked (not
// merely eligible), so the badge means "a flip is actively counting down", matching the
// city-panel row's same gate.
export function getLoyaltyPressurePresentationForViewer(
  state: GameState,
  viewerCivId: string,
): LoyaltyPressurePresentation {
  const cityBadges: LoyaltyPressureBadge[] = [];
  for (const [cityId, faith] of Object.entries(state.cityFaith ?? {})) {
    const progress = faith.loyaltyProgress;
    if (!progress) continue;
    const city = state.cities[cityId];
    if (!city) continue;
    const isPressuringViewer = progress.toCivId === viewerCivId;
    const isPressuredViewer = city.owner === viewerCivId;
    if (!isPressuringViewer && !isPressuredViewer) continue;
    cityBadges.push({ cityId, coord: city.position });
  }
  return cityBadges.length > 0 ? { cityBadges } : EMPTY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/loyalty-pressure-presentation.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into the renderer**

In `src/renderer/city-render-passes.ts`, add the field to `CityRenderItem` (near `worldPressureCrisis?: CrisisArchetype;` at line 42):

```typescript
  loyaltyPressure?: true;
```

Add a new render pass after `drawCityWorldPressureBadgePass` (after line 513), reusing the same dark-circle style but a different glyph and vertical offset so it doesn't collide with the world-pressure badge:

```typescript
export function drawCityLoyaltyPressureBadgePass(ctx: CanvasRenderingContext2D, item: CityRenderItem): void {
  if (item.projection.renderMode === 'landmark-only') return;
  markPass(ctx, 'loyalty-pressure');
  if (!item.projection.isLive || !item.city || !item.loyaltyPressure) return;

  const x = item.screen.x + item.size * 0.5;
  const y = item.screen.y - item.size * 0.58;
  ctx.beginPath();
  ctx.arc(x, y, item.size * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,30,0.86)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFittedText(ctx, '☦', x, y, item.size * 0.28, item.size * 0.2);
}
```

Register it in `CITY_RENDER_PASSES` (after the `world-pressure` entry, line 524):

```typescript
  { name: 'loyalty-pressure', draw: drawCityLoyaltyPressureBadgePass },
```

In `src/renderer/city-renderer.ts`, add to `CityRenderOptions` (near `worldPressurePresentation?: WorldPressurePresentation;` at line 42):

```typescript
  loyaltyPressurePresentation?: LoyaltyPressurePresentation;
```

Add the import at the top of the file: `import type { LoyaltyPressurePresentation } from '@/systems/loyalty-pressure-presentation';`

In `createCityRenderItems`, add alongside the existing `worldPressureBadgesByCityId` computation (near line 89-92):

```typescript
  const loyaltyPressurePresentation = typeof options === 'boolean' ? undefined : options.loyaltyPressurePresentation;
  const loyaltyPressureCityIds = new Set(
    (loyaltyPressurePresentation?.cityBadges ?? []).map(badge => badge.cityId),
  );
```

And in the pushed render item object (near line 161), add:

```typescript
        loyaltyPressure: city && loyaltyPressureCityIds.has(city.id) ? true : undefined,
```

In `src/renderer/render-loop.ts`, mirror the `worldPressurePresentation` field exactly: add a `private loyaltyPressurePresentation: LoyaltyPressurePresentation = { cityBadges: [] };` field (near line 210), compute it alongside the existing `this.worldPressurePresentation = getWorldPressurePresentationForViewer(state, state.currentPlayer);` line (near 379) with:

```typescript
    this.loyaltyPressurePresentation = getLoyaltyPressurePresentationForViewer(state, state.currentPlayer);
```

And pass it in the options object alongside `worldPressurePresentation` (near line 560):

```typescript
      loyaltyPressurePresentation: this.loyaltyPressurePresentation,
```

Add the import: `import { getLoyaltyPressurePresentationForViewer } from '@/systems/loyalty-pressure-presentation';` and the type import alongside `WorldPressurePresentation`.

- [ ] **Step 6: Run the full test suite for touched renderer files**

Run: `bash scripts/run-with-mise.sh yarn test tests/renderer`
Expected: PASS (no regressions in existing city-render-passes / city-renderer / render-loop tests)

- [ ] **Step 7: Commit**

```bash
git add src/systems/loyalty-pressure-presentation.ts src/renderer/city-render-passes.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts tests/systems/loyalty-pressure-presentation.test.ts
git commit -m "feat(religion): loyalty-pressure map badge for both sides (#593 MR6 Task 10)"
```

---

### Task 11: City-panel loyalty row

**Files:**
- Modify: `src/ui/city-panel.ts` (near the existing faith section, line ~442-958)
- Test: `tests/ui/city-panel-religion.test.ts`

**Interfaces:**
- Consumes: `getLoyaltyThreshold`, `getLoyaltyTickAmount` from `@/systems/religion-loyalty-system`; `canGarrisonCity` from `@/systems/faction-system`.
- Produces: no new exports — extends the existing faith-data block and its rendered text.

- [ ] **Step 1: Write the failing test**

```typescript
// Add to tests/ui/city-panel-religion.test.ts
// Follow this file's existing convention for building the city panel and reading its
// rendered text (grep the top of the file for how `faithData`/religion text is already
// asserted, e.g. the "Holy City of" / "Converting to" tests, and mirror that setup).

describe('#593 MR6 — city panel loyalty row', () => {
  it('shows the pressuring civ name, current tick, and threshold when loyaltyProgress is active', () => {
    // Seed a city with cityFaith.loyaltyProgress = { toCivId: <rival>, points: 90 } and
    // opponentChallenge 'standard' (threshold 180), render the panel, and assert the
    // panel's text content contains the rival civ's name and "90" and "180".
  });

  it('shows "(garrisoned — paused)" or equivalent when a friendly unit occupies the city', () => {
    // Seed loyaltyProgress + a garrison unit at the city's position, assert the panel
    // text reflects the pause (via getLoyaltyTickAmount returning 0).
  });

  it('shows "(temple — halved)" or equivalent when the city has a temple', () => {
    // Seed loyaltyProgress + city.buildings including 'temple', assert the panel
    // reflects the halved tick.
  });

  it('renders nothing loyalty-related for a city with no active loyaltyProgress', () => {
    // Assert absence of any loyalty-row text when cityFaith[cityId].loyaltyProgress is
    // undefined -- most cities, most of the time.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel-religion.test.ts`
Expected: FAIL — no loyalty row rendered yet.

- [ ] **Step 3: Implement the row**

In `src/ui/city-panel.ts`, extend the `faithData` block (starting at line 444) to also compute loyalty info:

```typescript
  const faithData = cityFaithEntry && faithReligion ? (() => {
    const pointsTowardCurrentTarget = cityFaithEntry.conversionProgress?.[cityFaithEntry.religionId];
    // ... existing fields stay unchanged above this point ...
    const loyalty = cityFaithEntry.loyaltyProgress ? (() => {
      const pressuringCiv = state.civilizations[cityFaithEntry.loyaltyProgress!.toCivId];
      const threshold = getLoyaltyThreshold(state);
      const tick = getLoyaltyTickAmount(state, city, faithReligion);
      const counterplay = tick === 0
        ? ' (garrisoned — paused)'
        : city.buildings.includes('temple')
          ? ' (temple — halved)'
          : '';
      return {
        pressuringCivName: pressuringCiv?.name ?? 'Unknown',
        points: cityFaithEntry.loyaltyProgress!.points,
        threshold,
        counterplaySuffix: counterplay,
      };
    })() : null;
    return {
      religionName: faithReligion.name,
      isHolyCity: !!cityFaithEntry.isHolyCity,
      loyalty,
      // ... any other existing fields in this object stay as-is ...
    };
  })() : null;
```

Then, near the existing faith text block (line 955-958), add a loyalty line when `faithData?.loyalty` is present:

```typescript
  if (faithData?.loyalty) {
    const { pressuringCivName, points, threshold, counterplaySuffix } = faithData.loyalty;
    appendFaithLine(`Loyalty to ${pressuringCivName}: ${points} / ${threshold}${counterplaySuffix}`);
  }
```

(`appendFaithLine` is a placeholder name for however this file already appends a line of text to the faith section DOM node — search the ~30 lines around line 955-958 for the actual DOM-append pattern used for the existing `Holy City of` / `Converting to` / `Follows` text, and use that exact same helper/pattern, respecting the project's `textContent`/`createTextNode()`-only rule for game-generated strings — never `innerHTML`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel-religion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel-religion.test.ts
git commit -m "feat(religion): city panel loyalty row with counterplay display (#593 MR6 Task 11)"
```

---

### Task 12: Cross-cutting regression sweep

**Files:**
- Test: `tests/systems/religion-loyalty-system.test.ts` (extends Tasks 4/6/7's tests)

This task fills the gaps in issue #593's "Tests (minimum)" checklist not already covered by Tasks 1-11's TDD steps: the human-immunity regression run to completion (many turns, zero flips, unrest row present throughout), and `currentPlayer` correctness on badge/row visibility in hot-seat.

**Interfaces:**
- Consumes: everything built in Tasks 1-11.
- Produces: no new exports — test-only task.

- [ ] **Step 1: Write the failing tests**

```typescript
// Add to tests/systems/religion-loyalty-system.test.ts
describe('#593 MR6 — deterministic flip timing at the explorer threshold', () => {
  it('flips at exactly turn 15 for explorer (150 / 10 = 15 turns) -- completes the three-tier sweep alongside Task 7\'s standard (18) and veteran (22) cases', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    let current = {
      ...state,
      cityFaith: { [p2City]: { religionId: `religion-${p1}` } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
      opponentChallenge: 'explorer' as const,
    };
    const bus = new EventBus();
    for (let turn = 0; turn < 14; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p2City].owner).toBe(p2);
    }
    current = processLoyaltyTurn(current, bus);
    expect(current.cities[p2City].owner).toBe(p1);
  });
});

describe('#593 MR6 — human-immunity regression (run to completion)', () => {
  it('a human city under max foreign-faith pressure never flips even after 100 turns, and the unrest row is present every turn', () => {
    const { state, p1, p2, p1City } = makeLoyaltyFixture();
    let current = {
      ...state,
      cityFaith: { [p1City]: { religionId: `religion-${p2}` } },
      religions: { [`religion-${p2}`]: { id: `religion-${p2}`, name: 'Rival', ownerCivId: p2, foundedTurn: 1, boon: 'fervor' as const } },
    };
    const bus = new EventBus();
    for (let turn = 0; turn < 100; turn++) {
      current = processLoyaltyTurn(current, bus);
      expect(current.cities[p1City].owner).toBe(p1);
      expect(current.cityFaith![p1City].loyaltyProgress).toBeUndefined();
      const rows = getUnrestPressureBreakdown(p1City, current);
      expect(rows).toContainEqual({ label: 'Foreign faith pressure', amount: 2 });
    }
  });
});

describe('#593 MR6 — currentPlayer correctness for badge/row visibility', () => {
  it('map badge presentation only shows the pressuring civ\'s or pressured owner\'s own badges, never a bystander\'s, regardless of state.currentPlayer', () => {
    const { state, p1, p2, p2City } = makeLoyaltyFixture();
    const seeded = {
      ...state,
      currentPlayer: p2, // hot-seat: it's p2's turn to view, not p1's
      cityFaith: { [p2City]: { religionId: `religion-${p1}`, loyaltyProgress: { toCivId: p1, points: 50 } } },
      religions: { [`religion-${p1}`]: { id: `religion-${p1}`, name: 'Test', ownerCivId: p1, foundedTurn: 1 } },
    };
    // p2 is the pressured owner -- sees it regardless of currentPlayer being p2 or p1.
    expect(getLoyaltyPressurePresentationForViewer(seeded, p2).cityBadges.map(b => b.cityId)).toContain(p2City);
    expect(getLoyaltyPressurePresentationForViewer({ ...seeded, currentPlayer: p1 }, p2).cityBadges.map(b => b.cityId)).toContain(p2City);
  });
});
```

Add the necessary imports (`getUnrestPressureBreakdown` from `@/systems/faction-system`, `getLoyaltyPressurePresentationForViewer` from `@/systems/loyalty-pressure-presentation`) at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail or pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/religion-loyalty-system.test.ts`
Expected: These should PASS immediately if Tasks 1-11 were implemented correctly — this task is a regression net, not new functionality. If anything fails, fix the implementation in the relevant earlier task's file (do not weaken the test).

- [ ] **Step 3: Run the full project test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — including `tests/systems/national-project-balance.test.ts`, `tests/systems/wonder-definitions.test.ts`, `tests/systems/pacing-audit.test.ts`, and `tests/systems/pacing-reference-economy.test.ts` (this MR doesn't touch wonders/national projects/yields directly, but territory pressure is a new economy-adjacent number — confirm the pacing outlier gate still passes; if it flags an outlier, investigate before assuming it's a false positive).

- [ ] **Step 4: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS (0 TypeScript errors)

- [ ] **Step 5: Commit**

```bash
git add tests/systems/religion-loyalty-system.test.ts
git commit -m "test(religion): loyalty cross-cutting regression sweep (#593 MR6 Task 12)"
```

---

## Post-plan: PR

After Task 12, open the PR per the project's incremental-MR conventions (`.claude/rules/incremental-mr-completion.md`):
- Title: `feat(religion): territory pressure + loyalty flips (#593 MR6)`.
- Body should reference `#587`/`#593` per project convention (never `closes #524`), and explicitly call out the one deliberate deviation from the issue text: minor-civ absorption uses a new peaceful `peacefullyAbsorbMinorCiv` helper (transfers garrison units, skips regional grievance) rather than reusing `conquestMinorCiv` as-is, per the user's explicit choice during brainstorming.
- Run `bash scripts/run-with-mise.sh yarn build` and `bash scripts/run-with-mise.sh yarn test` one final time before `git push` / `gh pr create`, per this repo's pre-push gate.
