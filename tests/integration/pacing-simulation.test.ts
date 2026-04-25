import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
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
});
