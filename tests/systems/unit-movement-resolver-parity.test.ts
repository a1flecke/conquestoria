/**
 * #1010 / #1025 follow-up guard — `getMovementBlockerReason` (the player-facing
 * tap explainer, now in unit-movement-queries.ts) is a SECOND derivation of
 * movement legality alongside `resolveUnitMoveIntent`. #1010 moves it verbatim
 * rather than freezing the gap; this test pins the current relationship so a
 * future divergence is caught, and marks the known-incomplete direction `.todo`
 * against the #1025 follow-up.
 */
import { describe, it, expect } from 'vitest';
import type { GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createEmptyPirateState } from '@/core/pirate-state';
import {
  createUnit,
  getMovementBlockerReason,
  getBlockingMapEntityAt,
  getMovementRangeDetails,
} from '@/systems/unit-system';
import { resolveUnitMoveIntent } from '@/systems/unit-movement-system';

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

function fixture(): { state: GameState; moverId: string } {
  const map = grassland(6, 4);
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, c);
  mover.movementPointsLeft = 2;
  const state = {
    turn: 1, era: 1, gameId: 'parity', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [mover.id]: mover },
    cities: { 'city-b': { id: 'city-b', name: 'B', owner: 'civ-b', position: { q: 3, r: 0 } } },
    barbarianCamps: { 'camp-1': { id: 'camp-1', position: { q: 1, r: 2 } } },
    pirates: createEmptyPirateState(),
    tribalVillages: {},
    civilizations: {
      'civ-a': { id: 'civ-a', units: [mover.id], techState: { completed: [] }, visibility: { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible'])) }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-a') },
      'civ-b': { id: 'civ-b', units: [], techState: { completed: [] }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-b') },
    },
  } as unknown as GameState;
  return { state, moverId: mover.id };
}

describe('#1010 — resolver ↔ tap-explainer parity', () => {
  it('every tile the resolver rejects that is ALSO outside movement range gets a non-null explainer reason', () => {
    const { state, moverId } = fixture();
    const mover = state.units[moverId]!;
    const completedTechs: string[] = [];
    const reachable = new Set(getMovementRangeDetails(state, moverId).reachable.map(hexKey));

    const unexplained: string[] = [];
    for (const key of Object.keys(state.map.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const to: HexCoord = { q, r };
      if (hexKey(mover.position) === key) continue;
      const res = resolveUnitMoveIntent(state, moverId, to, { actor: 'player', civId: 'civ-a' });
      if (res.ok) continue;
      if (reachable.has(key)) continue; // range preview already communicates "reachable but terminal"
      const reason = getMovementBlockerReason(mover, to, state.map, {
        completedTechs,
        blockingEntity: getBlockingMapEntityAt(state, mover, to),
      });
      if (!reason) unexplained.push(`${key} (resolver: ${res.reason})`);
    }
    expect(unexplained, unexplained.join('\n')).toEqual([]);
  });

  it('blocker tiles: resolver and explainer agree on the reason code', () => {
    const { state, moverId } = fixture();
    const mover = state.units[moverId]!;
    for (const to of [{ q: 3, r: 0 }, { q: 1, r: 2 }] as HexCoord[]) {
      const res = resolveUnitMoveIntent(state, moverId, to, { actor: 'player', civId: 'civ-a' });
      expect(res.ok).toBe(false);
      const reason = getMovementBlockerReason(mover, to, state.map, {
        blockingEntity: getBlockingMapEntityAt(state, mover, to),
      });
      if (res.ok) return;
      expect(reason?.code).toBe(res.reason);
    }
  });

  // Known incomplete (see module docblock + #1025 follow-up): the explainer does
  // not reproduce the resolver's hostile-occupant / path-crossing rejections.
  // Collapsing it onto resolveUnitMoveIntent is tracked under #1025.
  it.todo('explainer reproduces the resolver\'s hostile-occupant rejection (#1025 follow-up)');
});
