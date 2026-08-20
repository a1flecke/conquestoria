import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import {
  visibleUnitEntriesAtKey,
  visibleHostileUnitEntriesAtKey,
} from '@/input/hex-defender-selection';
import type { GameState, HexCoord, Unit, UnitType } from '@/core/types';

function setup(): GameState {
  return createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 'hex-defender-selection-test' });
}

function setTerrain(state: GameState, position: HexCoord, terrain: 'ocean' | 'plains'): void {
  state.map.tiles[hexKey(position)].terrain = terrain;
}

function placeUnit(state: GameState, civId: string, type: UnitType, position: HexCoord): Unit {
  const unit = createUnit(type, civId, position, state.idCounters);
  state.units[unit.id] = unit;
  state.civilizations[civId].units.push(unit.id);
  return unit;
}

describe('visibleUnitEntriesAtKey / visibleHostileUnitEntriesAtKey', () => {
  it('excludes a concealed enemy submarine', () => {
    const state = setup();
    state.currentPlayer = 'player';
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });

    const entries = visibleUnitEntriesAtKey(state, hexKey(sub.position));

    expect(entries.some(([id]) => id === sub.id)).toBe(false);
  });

  it('includes a detected enemy submarine', () => {
    const state = setup();
    state.currentPlayer = 'player';
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    setTerrain(state, { q: 1, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'ai-1', 'submarine', { q: 0, r: 0 });
    placeUnit(state, 'player', 'galley', { q: 1, r: 0 });
    state.civilizations.player.visibility.tiles[hexKey(sub.position)] = 'visible';

    const entries = visibleHostileUnitEntriesAtKey(state, hexKey(sub.position));

    expect(entries.some(([id]) => id === sub.id)).toBe(true);
  });

  it('always includes the current player\'s own submarine', () => {
    const state = setup();
    state.currentPlayer = 'player';
    setTerrain(state, { q: 0, r: 0 }, 'ocean');
    const sub = placeUnit(state, 'player', 'submarine', { q: 0, r: 0 });

    const entries = visibleUnitEntriesAtKey(state, hexKey(sub.position));

    expect(entries.some(([id]) => id === sub.id)).toBe(true);
  });
});
