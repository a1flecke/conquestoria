import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';

describe('pacing simulation', () => {
  it('produces an early completion within a few turns on a deterministic seed', () => {
    const state = createNewGame(undefined, 'pacing-sim-seed', 'small');
    const bus = new EventBus();
    const settlerId = state.civilizations.player.units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = foundCity('player', state.units[settlerId!].position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    for (const coord of city.ownedTiles) {
      state.map.tiles[hexKey(coord)].owner = 'player';
    }
    state.cities[city.id].productionQueue = ['warrior'];
    state.civilizations.player.techState.currentResearch = 'fire';

    let next = state;
    let warriorDone = false;
    let fireDone = false;

    for (let i = 0; i < 6; i++) {
      next = processTurn(next, bus);
      warriorDone = warriorDone || Object.values(next.units).some(unit =>
        unit.owner === 'player' && unit.type === 'warrior' && !state.civilizations.player.units.includes(unit.id));
      fireDone = fireDone || next.civilizations.player.techState.completed.includes('fire');
    }

    expect(warriorDone || fireDone).toBe(true);
  });

  function makeBronzeWorkingResearchState(scienceInvestment: 'baseline' | 'idle-science') {
    const state = createNewGame(undefined, `bronze-working-${scienceInvestment}`, 'small');
    const player = state.civilizations.player;
    const settlerId = player.units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = foundCity('player', state.units[settlerId!].position, state.map);
    state.cities[city.id] = {
      ...city,
      productionQueue: [],
      idleProduction: scienceInvestment === 'idle-science' ? 'science' : null,
    };
    player.cities.push(city.id);
    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      state.map.tiles[key] = {
        ...state.map.tiles[key],
        terrain: 'grassland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
        owner: 'player',
      };
    }

    player.techState.completed = ['stone-weapons'];
    player.techState.currentResearch = 'bronze-working';
    player.techState.researchProgress = 0;
    player.techState.researchQueue = [];

    expect(calculateProjectedCityYields(state, city.id).science).toBe(
      scienceInvestment === 'idle-science' ? 2 : 1,
    );

    return state;
  }

  function turnsToCompleteBronzeWorking(scienceInvestment: 'baseline' | 'idle-science'): number {
    let next = makeBronzeWorkingResearchState(scienceInvestment);
    for (let turn = 1; turn <= 20; turn++) {
      next = processTurn(next, new EventBus());
      if (next.civilizations.player.techState.completed.includes('bronze-working')) {
        return turn;
      }
    }
    return Number.POSITIVE_INFINITY;
  }

  it('completes Bronze Working in 9-11 turns for a baseline one-city opening', () => {
    const turns = turnsToCompleteBronzeWorking('baseline');
    expect(turns).toBeGreaterThanOrEqual(9);
    expect(turns).toBeLessThanOrEqual(11);
  });

  it('completes Bronze Working in 5-7 turns when opening production is invested into science', () => {
    const turns = turnsToCompleteBronzeWorking('idle-science');
    expect(turns).toBeGreaterThanOrEqual(5);
    expect(turns).toBeLessThanOrEqual(7);
  });
});
