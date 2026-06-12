import { describe, it, expect } from 'vitest';
import { getBestiaryEntriesForPlayer, recordBeastSightings } from '@/systems/beast-presentation';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';

function stateWithLair(): GameState {
  const state = createNewGame('rome', 'bestiary-seed', 'small', 'Bestiary Test');
  state.beasts = {
    mode: 'wild',
    lairs: {
      'lair-giant_boar': {
        id: 'lair-giant_boar', beastId: 'giant_boar', position: { q: 10, r: 10 },
        status: 'awake', strength: 0, unitIds: ['beast-1'],
      },
    },
    sightingsByCiv: {},
  };
  state.units['beast-1'] = {
    id: 'beast-1', type: 'beast_boar', owner: 'beasts', position: { q: 10, r: 10 },
    movementPointsLeft: 2, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
  return state;
}

describe('getBestiaryEntriesForPlayer', () => {
  it('masks EVERYTHING except the hint for unsighted beasts', () => {
    const entries = getBestiaryEntriesForPlayer(stateWithLair(), 'player');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.status).toBe('unknown');
    expect(entry.hint.length).toBeGreaterThan(10);
    expect(entry.name).toBeUndefined();
    expect(entry.unitType).toBeUndefined();
    expect(entry.tier).toBeUndefined();
    expect(entry.slainBy).toBeUndefined();
  });

  it('reveals name/tier/unitType after sighting, per civ', () => {
    const state = stateWithLair();
    state.beasts!.sightingsByCiv['player'] = ['giant_boar'];
    const mine = getBestiaryEntriesForPlayer(state, 'player');
    expect(mine[0].status).toBe('sighted');
    expect(mine[0].name).toBe('Giant Boar');
    expect(mine[0].unitType).toBe('beast_boar');
    const theirs = getBestiaryEntriesForPlayer(state, 'ai-1');
    expect(theirs[0].status).toBe('unknown');
    expect(theirs[0].name).toBeUndefined();
  });

  it('shows slain status with slayer to everyone', () => {
    const state = stateWithLair();
    state.beasts!.lairs['lair-giant_boar'].status = 'slain';
    state.beasts!.lairs['lair-giant_boar'].slainBy = 'ai-1';
    state.beasts!.lairs['lair-giant_boar'].slainTurn = 12;
    const entries = getBestiaryEntriesForPlayer(state, 'player');
    expect(entries[0].status).toBe('slain');
    expect(entries[0].name).toBe('Giant Boar');
    expect(entries[0].slainBy).toBe('ai-1');
    expect(entries[0].slainTurn).toBe(12);
  });

  it('lists only beasts whose lairs exist on this map', () => {
    const state = stateWithLair();
    const entries = getBestiaryEntriesForPlayer(state, 'player');
    expect(entries.map(e => e.lairId)).toEqual(['lair-giant_boar']);
  });
});

describe('recordBeastSightings', () => {
  it('returns new sightings exactly once (transition-owned)', () => {
    const state = stateWithLair();
    const visible = new Set(['10,10']);   // beast position is visible
    const first = recordBeastSightings(state, 'player', visible);
    expect(first.newSightings).toEqual(['giant_boar']);
    expect(first.state.beasts!.sightingsByCiv['player']).toEqual(['giant_boar']);
    const second = recordBeastSightings(first.state, 'player', visible);
    expect(second.newSightings).toEqual([]);
    // input state not mutated
    expect(state.beasts!.sightingsByCiv['player']).toBeUndefined();
  });

  it('does not sight beasts outside visible tiles', () => {
    const result = recordBeastSightings(stateWithLair(), 'player', new Set(['0,0']));
    expect(result.newSightings).toEqual([]);
  });
});
