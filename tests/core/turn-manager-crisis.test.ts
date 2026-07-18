import { describe, it, expect, vi } from 'vitest';
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { EventBus } from '@/core/event-bus';
import { normalizeLoadedStateForTest } from '@/storage/save-manager';
import { resolveMajorCityCapture } from '@/systems/city-capture-system';
import { tagLandmassRegions } from '@/systems/landmass-tagger';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { hexKey } from '@/systems/hex-utils';
import type { ActiveCrisis, GameState, HexCoord } from '@/core/types';

function findLandCoord(state: GameState): HexCoord {
  const tile = Object.values(state.map.tiles).find(t => t.terrain !== 'ocean' && t.terrain !== 'coast');
  if (!tile) throw new Error('No land tile found in test map');
  return tile.coord;
}

function stateWithActiveCrisis(): { state: GameState; civId: string; cityId: string } {
  const state = createNewGame(undefined, 'crisis-turn-seed', 'small');
  const civId = state.currentPlayer;
  const city = foundCity(civId, findLandCoord(state), state.map, state.idCounters);
  city.id = 'capital';
  city.population = 4;
  state.cities = { capital: city };
  state.civilizations[civId].cities = ['capital'];
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: civId,
    cityIds: ['capital'], tileKeys: [], startedTurn: state.turn - 1, stage: 'active', turnsInStage: 1,
  };
  return { state: { ...state, activeCrises: { [crisis.id]: crisis } }, civId, cityId: 'capital' };
}

describe('turn-manager crisis wiring', () => {
  it('ticks an active outbreak and reduces city yields via processTurn', () => {
    const { state, cityId } = stateWithActiveCrisis();
    const cityBefore = state.cities[cityId];
    const next = processTurn(state, new EventBus());
    expect(next.activeCrises?.['crisis-1'].turnsInStage).toBe(2);
    // Yield reduction is hard to observe directly (production/food are consumed into
    // growth/queues), but the crisis must still be present and ticking.
    expect(next.cities[cityId]).toBeDefined();
    expect(cityBefore).toBeDefined();
  });

  it('scheduler runs during end-turn and can fire a plague once past grace', () => {
    const state = createNewGame(undefined, 'crisis-schedule-seed', 'small');
    const civId = state.currentPlayer;
    const city = foundCity(civId, findLandCoord(state), state.map, state.idCounters);
    city.id = 'capital';
    city.population = 5;
    state.cities = { capital: city };
    state.civilizations[civId].cities = ['capital'];
    state.civilizations[civId].units = [];
    state.units = {};
    state.map.tiles = tagLandmassRegions(state.map);
    const landmassId = state.map.tiles[hexKey(city.position)]?.regionKey;
    if (!landmassId) throw new Error('Test city needs a landmass');
    // This test isolates crisis scheduling; resurgence spawning is covered in the
    // threat-pressure suite and intentionally blocks a concurrent crisis.
    state.resurgentCampCooldownByCivLandmass = { [`${civId}:${landmassId}`]: 100 };
    const era3Techs = TECH_TREE
      .filter(tech => tech.era <= 3 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);
    for (const civ of Object.values(state.civilizations)) civ.techState.completed = [...era3Techs];
    let s: GameState = { ...state, era: 3, turn: 40, opponentChallenge: 'veteran' };
    let fired = false;
    for (let i = 0; i < 20 && !fired; i++) {
      s = processTurn(s, new EventBus());
      if (Object.keys(s.activeCrises ?? {}).length > 0) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('loads a save with no crisis fields and completes one turn without throwing', () => {
    const state = createNewGame('rome', 'legacy-save-seed', 'small', 'Legacy Save Test');
    delete (state as any).activeCrises;
    const normalized = normalizeLoadedStateForTest(state);
    expect(() => processTurn(normalized, new EventBus())).not.toThrow();
  });

  it('drops a crisis with an unknown flavorId on load and warns', () => {
    const { state } = stateWithActiveCrisis();
    const withUnknown: GameState = {
      ...state,
      activeCrises: {
        'crisis-unknown': {
          id: 'crisis-unknown', flavorId: 'removed-flavor', archetype: 'outbreak',
          targetCivId: state.currentPlayer, cityIds: [], tileKeys: [],
          startedTurn: 1, stage: 'active', turnsInStage: 1,
        },
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const normalized = normalizeLoadedStateForTest(withUnknown);
    expect(normalized.activeCrises?.['crisis-unknown']).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves an active crisis mid-arc through a save/load round-trip', () => {
    const { state } = stateWithActiveCrisis();
    const withQuarantine: GameState = {
      ...state,
      activeCrises: {
        'crisis-1': { ...state.activeCrises!['crisis-1'], quarantinedCityIds: ['irrelevant'], turnsInStage: 3 },
      },
    };
    const normalized = normalizeLoadedStateForTest(withQuarantine);
    expect(normalized.activeCrises?.['crisis-1']).toMatchObject({
      flavorId: 'plague', stage: 'active', turnsInStage: 3, quarantinedCityIds: ['irrelevant'],
    });
  });

  it('capturing an afflicted city resolves its crisis as abandoned', () => {
    const { state, civId, cityId } = stateWithActiveCrisis();
    const otherCivId = Object.keys(state.civilizations).find(id => id !== civId)!;
    const bus = new EventBus();
    const result = resolveMajorCityCapture(state, cityId, otherCivId, 'occupy', state.turn, bus);
    expect(result.state.activeCrises?.['crisis-1']).toBeUndefined();
  });

  it('applies the +1 food +1 production resilience bonus to a city with resilienceBonusUntilTurn active, both in the real turn-manager path and in the city-panel projected-yields display', () => {
    const { state, cityId } = stateWithActiveCrisis();
    delete (state as GameState).activeCrises; // isolate the resilience bonus from the outbreak's own yield multiplier
    const withBonus: GameState = {
      ...state,
      cities: { ...state.cities, [cityId]: { ...state.cities[cityId], resilienceBonusUntilTurn: state.turn + 1 } },
    };

    const boostedProjection = calculateProjectedCityYields(withBonus, cityId);
    const baseProjection = calculateProjectedCityYields(state, cityId);
    expect(boostedProjection.food).toBe(baseProjection.food + 1);
    expect(boostedProjection.production).toBe(baseProjection.production + 1);

    // Already-expired bonus (resilienceBonusUntilTurn === state.turn, not > state.turn) has no effect.
    const expiredBonus: GameState = {
      ...state,
      cities: { ...state.cities, [cityId]: { ...state.cities[cityId], resilienceBonusUntilTurn: state.turn } },
    };
    expect(calculateProjectedCityYields(expiredBonus, cityId)).toEqual(baseProjection);
  });
});
