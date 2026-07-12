import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { beginConfirmedForeignCityEntry } from '@/input/foreign-city-entry-flow';
import { foundCity } from '@/systems/city-system';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeForeignCityEntryState(): GameState {
  const state = createNewGame(undefined, 'foreign-city-entry-flow', 'small');
  state.currentPlayer = 'player';
  const attacker = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'warrior')!;
  state.units['unit-1'] = {
    ...attacker,
    id: 'unit-1',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    hasMoved: false,
  };
  state.civilizations.player.units = ['unit-1'];
  state.cities.athens = {
    ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
    id: 'athens',
    name: 'Athens',
    owner: 'ai-1',
    position: { q: 1, r: 0 },
    population: 1,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations['ai-1'].cities = ['athens'];
  state.civilizations.player.diplomacy.atWarWith = [];
  state.civilizations['ai-1'].diplomacy.atWarWith = [];
  return state;
}

describe('foreign-city-entry-flow', () => {
  it('declares bilateral war and begins city assault only after confirmation', () => {
    const state = makeForeignCityEntryState();
    const bus = new EventBus();
    const warDeclared = vi.fn();
    const moved = vi.fn();
    bus.on('diplomacy:war-declared', warDeclared);
    bus.on('unit:move', moved);

    const result = beginConfirmedForeignCityEntry(state, 'unit-1', 'athens', bus);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');
    expect(result.state.civilizations['ai-1'].diplomacy.atWarWith).toContain('player');
    expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(result.pending.cityId).toBe('athens');
    expect(warDeclared).toHaveBeenCalledWith({ attackerId: 'player', defenderId: 'ai-1', opponentKind: 'major' });
    expect(moved).toHaveBeenCalledOnce();
  });

  it('does not duplicate war declarations when already at war', () => {
    const state = makeForeignCityEntryState();
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    const bus = new EventBus();
    const warDeclared = vi.fn();
    bus.on('diplomacy:war-declared', warDeclared);

    const result = beginConfirmedForeignCityEntry(state, 'unit-1', 'athens', bus);

    expect(result.state.civilizations.player.diplomacy.atWarWith).toEqual(['ai-1']);
    expect(result.state.civilizations['ai-1'].diplomacy.atWarWith).toEqual(['player']);
    expect(warDeclared).not.toHaveBeenCalled();
  });
});
