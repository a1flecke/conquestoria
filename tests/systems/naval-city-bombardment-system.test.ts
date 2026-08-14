import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { resolveNavalCityBombardment } from '@/systems/naval-city-bombardment-system';

function makeState(): GameState {
  return {
    turn: 30,
    map: { width: 8, height: 8, wrapsHorizontally: false, tiles: {} },
    cities: {
      port: {
        id: 'port', name: 'Port', owner: 'player', position: { q: 0, r: 0 },
        population: 4, food: 0, foodNeeded: 15, buildings: ['coastal_battery'],
        productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced',
        maturity: 'city', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, hp: 100,
      },
    },
    units: {
      cruiser: {
        id: 'cruiser', type: 'missile_cruiser', owner: 'ai-1', position: { q: 1, r: 0 },
        movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      },
    },
    civilizations: {
      player: { id: 'player', cities: ['port'], units: [], gold: 100, techState: { completed: [] } },
      'ai-1': {
        id: 'ai-1', cities: [], units: ['cruiser'], gold: 100, techState: { completed: [] },
        diplomacy: { atWarWith: ['player'] },
      },
    },
  } as unknown as GameState;
}

describe('resolveNavalCityBombardment', () => {
  it('uses the naval defense result for Battery counterfire, consumes the ship, and leaves the city capturable', () => {
    const result = resolveNavalCityBombardment(makeState(), {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'ai',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.cities.port.hp).toBe(80);
    expect(result.state.units.cruiser.health).toBe(96);
    expect(result.state.units.cruiser.hasActed).toBe(true);
    expect(result.state.units.cruiser.movementPointsLeft).toBe(0);
    expect(result.batteryEvent).toMatchObject({ recipientCivId: 'player', damage: 4, source: 'ai' });
    expect(result.cityEvent).toEqual({ cityId: 'port', recipientCivId: 'player', source: 'ai', hpLost: 20 });
  });

  it('cannot destroy a city from offshore and does not let a second same-turn bombardment re-fire its Battery', () => {
    const nearDeath = makeState();
    nearDeath.cities.port.hp = 3;
    const first = resolveNavalCityBombardment(nearDeath, {
      attackerUnitId: 'cruiser', cityId: 'port', source: 'player',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.cities.port.hp).toBe(1);

    const again = resolveNavalCityBombardment(
      {
        ...first.state,
        units: {
          ...first.state.units,
          cruiser: { ...first.state.units.cruiser, hasActed: false, movementPointsLeft: 4 },
        },
      },
      { attackerUnitId: 'cruiser', cityId: 'port', source: 'player' },
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.batteryEvent).toBeUndefined();
  });
});
