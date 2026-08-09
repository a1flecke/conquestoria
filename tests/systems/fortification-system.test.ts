import { describe, expect, it } from 'vitest';
import { findFortificationCandidate, getFortificationPlacement, getFortificationTier, resolveFortificationDefense } from '@/systems/fortification-system';
import type { GameState, HexTile } from '@/core/types';
import { getAvailableWorkerActions } from '@/systems/improvement-system';

function tile(q: number, r: number, owner: string | null, improvement: HexTile['improvement'] = 'none'): HexTile {
  return { coord: { q, r }, terrain: 'plains', elevation: 'lowland', resource: null, improvement, owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null };
}

function placementState(): GameState {
  return {
    map: { width: 8, height: 8, wrapsHorizontally: false, rivers: [], tiles: {
      '0,0': tile(0, 0, 'owner'), '1,0': tile(1, 0, null), '0,1': tile(0, 1, 'owner'),
    } },
    cities: { capital: { id: 'capital', owner: 'owner', position: { q: 0, r: 0 } } },
  } as unknown as GameState;
}

describe('getFortificationTier', () => {
  it('returns Fort until Fortification Engineering is complete', () => {
    expect(getFortificationTier(['fortresses'])).toEqual({
      id: 'fort',
      label: 'Fort',
      multiplier: 1.1,
    });
  });

  it('returns Citadel from Fortification Engineering without changing the saved improvement id', () => {
    expect(getFortificationTier(['fortresses', 'fortification-engineering'])).toEqual({
      id: 'citadel',
      label: 'Citadel',
      multiplier: 1.2,
    });
  });
});

describe('getFortificationPlacement', () => {
  it('allows the first Fort on an owned frontier tile', () => {
    expect(getFortificationPlacement(placementState(), 'owner', { q: 0, r: 1 })).toMatchObject({ ok: true, isFrontier: true });
  });

  it('rejects a Fort adjacent to another Fort', () => {
    const state = placementState();
    state.map.tiles['0,0'] = tile(0, 0, 'owner', 'fort' as HexTile['improvement']);
    expect(getFortificationPlacement(state, 'owner', { q: 0, r: 1 })).toMatchObject({ ok: false, reason: 'adjacent-fort' });
  });

  it('allows replacing a normal improvement only when the caller explicitly permits it', () => {
    const state = placementState();
    state.map.tiles['0,1'] = tile(0, 1, 'owner', 'farm');

    expect(getFortificationPlacement(state, 'owner', { q: 0, r: 1 })).toMatchObject({ ok: false, reason: 'already-improved' });
    expect(getFortificationPlacement(state, 'owner', { q: 0, r: 1 }, { allowReplacement: true })).toMatchObject({ ok: true });
  });

  it('does not treat an off-map edge as a frontier', () => {
    const state = placementState();
    state.map.tiles['2,2'] = tile(2, 2, 'owner', 'fort');
    state.map.tiles['5,5'] = tile(5, 5, 'owner');

    expect(getFortificationPlacement(state, 'owner', { q: 5, r: 5 })).toMatchObject({ ok: false, reason: 'empire-cap' });
  });

  it('does not advertise a Fort when the supplied map state rejects its cap', () => {
    const state = placementState();
    state.map.tiles['2,2'] = tile(2, 2, 'owner', 'fort');
    state.map.tiles['5,5'] = tile(5, 5, 'owner');

    expect(getAvailableWorkerActions(state.map.tiles['5,5'], ['fortresses'], 'owner', { state }))
      .not.toContain('fort');
  });
});

describe('resolveFortificationDefense', () => {
  it('gives a friendly land combat unit the Fort multiplier', () => {
    const state = placementState();
    state.map.tiles['0,1'] = tile(0, 1, 'owner', 'fort');
    state.civilizations = { owner: { techState: { completed: ['fortresses'] } } } as unknown as GameState['civilizations'];
    const defender = { owner: 'owner', type: 'warrior', position: { q: 0, r: 1 }, transportId: undefined } as GameState['units'][string];
    const attacker = { owner: 'enemy', type: 'warrior', position: { q: 1, r: 1 } } as GameState['units'][string];
    expect(resolveFortificationDefense(state, defender, attacker)).toMatchObject({ multiplier: 1.1, label: 'Fort +10%' });
  });

  it('uses Citadel and halves only its improvement layer for approved siege', () => {
    const state = placementState();
    state.map.tiles['0,1'] = tile(0, 1, 'owner', 'fort');
    state.civilizations = { owner: { techState: { completed: ['fortification-engineering'] } } } as unknown as GameState['civilizations'];
    const defender = { owner: 'owner', type: 'warrior', position: { q: 0, r: 1 } } as GameState['units'][string];
    const attacker = { owner: 'enemy', type: 'trebuchet', position: { q: 1, r: 1 } } as GameState['units'][string];
    expect(resolveFortificationDefense(state, defender, attacker)).toMatchObject({ multiplier: 1.1, label: 'Citadel +20% (50% penetrated)' });
  });

  it.each(['trebuchet', 'grenadier', 'artillery', 'rocket_artillery'] as const)('keeps exactly half the Citadel layer against %s', type => {
    const state = placementState();
    state.map.tiles['0,1'] = tile(0, 1, 'owner', 'fort');
    state.civilizations = { owner: { techState: { completed: ['fortification-engineering'] } } } as unknown as GameState['civilizations'];
    const defender = { owner: 'owner', type: 'warrior', position: { q: 0, r: 1 } } as GameState['units'][string];
    const attacker = { owner: 'enemy', type, position: { q: 1, r: 1 } } as GameState['units'][string];

    expect(resolveFortificationDefense(state, defender, attacker).multiplier).toBeCloseTo(1.1);
  });

  it.each([
    { improvementTurnsLeft: 1 },
    { transportId: 'ship' },
    { type: 'frigate' },
  ])('gives no Fort defense to an ineligible occupant: %o', overrides => {
    const state = placementState();
    state.map.tiles['0,1'] = { ...tile(0, 1, 'owner', 'fort'), improvementTurnsLeft: overrides.improvementTurnsLeft ?? 0 };
    state.civilizations = { owner: { techState: { completed: ['fortresses'] } } } as unknown as GameState['civilizations'];
    const defender = { owner: 'owner', type: 'warrior', position: { q: 0, r: 1 }, ...overrides } as GameState['units'][string];
    const attacker = { owner: 'enemy', type: 'warrior', position: { q: 1, r: 1 } } as GameState['units'][string];

    expect(resolveFortificationDefense(state, defender, attacker).multiplier).toBe(1);
  });
});

describe('findFortificationCandidate', () => {
  it('chooses the first legal frontier tile with a visible hostile approach', () => {
    const state = placementState();
    state.map.tiles['1,1'] = tile(1, 1, 'enemy');
    state.civilizations = {
      owner: { techState: { completed: ['fortresses'] }, visibility: { tiles: { '1,1': 'visible' } } },
    } as unknown as GameState['civilizations'];
    state.units = {
      enemy: { id: 'enemy', owner: 'barbarian', type: 'warrior', position: { q: 1, r: 1 } },
    } as unknown as GameState['units'];

    expect(findFortificationCandidate(state, 'owner')).toMatchObject({ coord: { q: 0, r: 1 } });
  });
});
