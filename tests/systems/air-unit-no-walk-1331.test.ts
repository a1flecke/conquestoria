/**
 * #1331 — a based aircraft's position is its base's position (assertAirBaseIntegrity), so the
 * generic movement resolver must never walk it. Found by the AI-long matrix: the AI explore loop
 * put a jet fighter on auto-explore and it left its base city.
 */
import { describe, expect, it } from 'vitest';
import type { GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { createEmptyPirateState } from '@/core/pirate-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-system';
import { getMovementBlockerReason } from '@/systems/unit-movement-explainer';
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { assertAirBaseIntegrity } from '../helpers/save-state-invariants';

function grassland(w: number, h: number): GameMap {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < w; q++) for (let r = 0; r < h; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  return { width: w, height: h, wrapsHorizontally: false, tiles, rivers: [] };
}

function fixture(): { state: GameState; jetId: string; tankId: string } {
  const map = grassland(8, 6);
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const jet = createUnit('jet_fighter', 'civ-a', { q: 1, r: 1 }, c);
  jet.airBase = { kind: 'city', cityId: 'city-a' };
  const warrior = createUnit('warrior', 'civ-a', { q: 4, r: 4 }, c);
  const visible = Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible']));
  const state = {
    turn: 1, era: 1, gameId: 'no-walk', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [jet.id]: jet, [warrior.id]: warrior },
    cities: { 'city-a': { id: 'city-a', name: 'A', owner: 'civ-a', position: { q: 1, r: 1 }, buildings: ['airfield'], productionQueue: [] } },
    barbarianCamps: {}, pirates: createEmptyPirateState(), tribalVillages: {},
    civilizations: {
      'civ-a': {
        id: 'civ-a', units: [jet.id, warrior.id], cities: ['city-a'], techState: { completed: [] },
        visibility: { tiles: visible }, diplomacy: createDiplomacyState(['civ-a'], 'civ-a'),
      },
    },
  } as unknown as GameState;
  return { state, jetId: jet.id, tankId: warrior.id };
}

describe('a based aircraft is never walked (#1331)', () => {
  it('the resolver rejects a ground-style move with a typed reason', () => {
    const { state, jetId } = fixture();
    const result = resolveUnitMoveIntent(state, jetId, { q: 3, r: 1 }, { actor: 'automation', civId: 'civ-a' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('air-based');
  });

  it('offers no ground-style destinations and explains the refusal to the player', () => {
    const { state, jetId } = fixture();
    expect(getMovementRangeDetails(state, jetId).reachable).toEqual([]);
    expect(getMovementBlockerReason(state, jetId, { q: 3, r: 1 })?.code).toBe('air-based');
  });

  it('auto-explore cannot detach the aircraft from its base', () => {
    const { state, jetId } = fixture();
    state.units[jetId] = { ...state.units[jetId]!, automation: { mode: 'auto-explore', startedTurn: 1, lastTargets: [] } };
    // Leave frontier tiles unexplored so auto-explore has somewhere it would want to go.
    for (const key of Object.keys(state.map.tiles)) {
      if (state.map.tiles[key]!.coord.q >= 3) state.civilizations['civ-a']!.visibility.tiles[key] = 'unexplored';
    }
    const before = { ...state.units[jetId]!.position };
    applyAutoExploreOrder(state, jetId);
    expect(state.units[jetId]!.position).toEqual(before);
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();
  });

  it('still moves an ordinary land unit (earned control)', () => {
    const { state, tankId } = fixture();
    expect(resolveUnitMoveIntent(state, tankId, { q: 5, r: 4 }, { actor: 'player', civId: 'civ-a' }).ok).toBe(true);
  });

  it('the invariant does fire when a based aircraft is placed off its base (earned control)', () => {
    const { state, jetId } = fixture();
    state.units[jetId] = { ...state.units[jetId]!, position: { q: 3, r: 1 } };
    expect(() => assertAirBaseIntegrity(state)).toThrow(/air-base-integrity/);
  });
});
