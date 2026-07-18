import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { ActiveCrisis, GameState, HexTile } from '@/core/types';
import { processCrisisTurn, FAMINE_CONTAINMENT_SURPLUS_TURNS } from '@/systems/crisis-system';
import { makeCrisisFixture } from './helpers/crisis-fixture';
import { hexKey } from '@/systems/hex-utils';

// makeCrisisFixture's c1 only owns its own city-center tile (food yield 1, no worked
// tiles possible) — too food-starved to ever show a positive surplus regardless of
// population. Add one owned grassland tile (food yield 2) so surplus-sign tests can
// actually distinguish "positive surplus" from "negative surplus" via population alone.
function withFamineCrisis(overrides: Partial<ActiveCrisis> = {}, cityOverrides: { population?: number } = {}) {
  const { state, civId } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard' });
  const extraCoord = { q: -1, r: 0 };
  const extraTile: HexTile = {
    coord: extraCoord, terrain: 'grassland', elevation: 'lowland', resource: null,
    improvement: 'none', owner: civId, improvementTurnsLeft: 0, hasRiver: false,
    wonder: null, regionKey: 'landmass-1',
  };
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'crop-blight', archetype: 'famine', targetCivId: civId,
    cityIds: ['c1'], tileKeys: [], startedTurn: 38, stage: 'active', turnsInStage: 2,
    ...overrides,
  };
  const stateWithCrisis: GameState = {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [hexKey(extraCoord)]: extraTile } },
    cities: {
      ...state.cities,
      c1: {
        ...state.cities.c1,
        ownedTiles: [...state.cities.c1.ownedTiles, extraCoord],
        ...(cityOverrides.population !== undefined ? { population: cityOverrides.population } : {}),
      },
    },
    activeCrises: { [crisis.id]: crisis },
  };
  return { state: stateWithCrisis, civId, crisis };
}

describe('#590 MR3 — famine resolver', () => {
  it('ticks turnsInStage each turn', () => {
    const { state } = withFamineCrisis();
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises!['crisis-1'].turnsInStage).toBe(3);
  });

  it('halves the effective pop-loss interval when the target civ has epidemic-control', () => {
    // Force veteran challenge (only veteran has popLossEveryNTurnsIgnored set — crop-blight
    // veteran value is 3). Population set high (50) so surplus never goes positive and the
    // passive auto-contain path never fires, isolating this test to pop-loss only.
    const { state, civId } = withFamineCrisis({ turnsInStage: 0 }, { population: 50 });
    const veteranState: GameState = {
      ...state,
      civilizations: { ...state.civilizations, [civId]: { ...state.civilizations[civId], challenge: 'veteran' } },
    };
    const withTech: GameState = {
      ...veteranState,
      civilizations: {
        ...veteranState.civilizations,
        [civId]: {
          ...veteranState.civilizations[civId],
          techState: { ...veteranState.civilizations[civId].techState, completed: ['epidemic-control'] },
        },
      },
    };

    let withoutTechState = veteranState;
    let withTechState = withTech;
    for (let i = 0; i < 6; i++) {
      withoutTechState = processCrisisTurn(withoutTechState, new EventBus());
      withTechState = processCrisisTurn(withTechState, new EventBus());
    }
    // Without the tech: interval 3 -> loses pop on turnsInStage 3 and 6 (2 losses over 6 ticks).
    // With the tech: interval 6 -> loses pop only on turnsInStage 6 (1 loss over 6 ticks).
    expect(withoutTechState.cities.c1.population).toBe(48);
    expect(withTechState.cities.c1.population).toBe(49);
  });

  it('auto-contains a city after N consecutive turns of positive food surplus, independent of remedy', () => {
    // Population 1 with the extra owned grassland tile: food yield 3, comfortably above
    // population, so surplus is unambiguously positive every tick. Quarantined only to
    // isolate this test from the (separately-tested) spread mechanic, not because
    // quarantine matters to auto-contain itself.
    const { state } = withFamineCrisis({ quarantinedCityIds: ['c1'] }, { population: 1 });
    let working = state;
    for (let i = 0; i < FAMINE_CONTAINMENT_SURPLUS_TURNS; i++) {
      working = processCrisisTurn(working, new EventBus());
    }
    expect(working.activeCrises?.['crisis-1']).toBeUndefined();
  });

  it('resets the surplus streak if surplus drops before reaching the threshold', () => {
    // Alternate population between 1 (positive surplus) and 50 (negative surplus) every
    // other tick -- the streak should never accumulate to the threshold, so the crisis
    // must still be active after FAMINE_CONTAINMENT_SURPLUS_TURNS ticks.
    const { state } = withFamineCrisis({}, { population: 1 });
    let working = state;
    for (let i = 0; i < FAMINE_CONTAINMENT_SURPLUS_TURNS; i++) {
      working = processCrisisTurn(working, new EventBus());
      const nextPop = working.cities.c1?.population === 1 ? 50 : 1;
      working = { ...working, cities: { ...working.cities, c1: { ...working.cities.c1, population: nextPop } } };
    }
    expect(working.activeCrises?.['crisis-1']).toBeDefined();
  });

  it('quarantine stops spread but does not block the passive food-surplus auto-contain path', () => {
    const { state } = withFamineCrisis({ quarantinedCityIds: ['c1'] }, { population: 1 });
    let working = state;
    for (let i = 0; i < FAMINE_CONTAINMENT_SURPLUS_TURNS; i++) {
      working = processCrisisTurn(working, new EventBus());
    }
    expect(working.activeCrises?.['crisis-1']).toBeUndefined();
  });

  it('resolves via remedy exactly like outbreak (fixed 2-turn completion)', () => {
    const { state } = withFamineCrisis({
      remedyCompletionByCity: { c1: 42 },
      quarantinedCityIds: ['c1'], // isolates this test to remedy resolution — no spread noise
      turnsInStage: 0,
    }, { population: 50 }); // high population keeps auto-contain from interfering
    let working = state;
    working = processCrisisTurn(working, new EventBus()); // turn 40 -> crisis turn context still 40
    expect(working.activeCrises?.['crisis-1']).toBeDefined(); // not yet due
    working = { ...working, turn: 42 };
    working = processCrisisTurn(working, new EventBus());
    expect(working.activeCrises?.['crisis-1']).toBeUndefined();
  });
});
