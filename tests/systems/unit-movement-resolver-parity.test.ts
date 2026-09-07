/**
 * #1025 MR4 guard — `getMovementBlockerReason` (the player-facing tap explainer in
 * `unit-movement-explainer.ts`) is now the VIEWER-SCOPED PROJECTION of
 * `resolveUnitMoveIntent`, not a second legality implementation. This pins that every
 * resolver rejection for an explored destination surfaces the identical explainer code.
 */
import { describe, it, expect } from 'vitest';
import type { GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { createEmptyPirateState } from '@/core/pirate-state';
import { createUnit } from '@/systems/unit-system';
import { getMovementBlockerReason } from '@/systems/unit-movement-explainer';
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

describe('#1025 MR4 — resolver ↔ tap-explainer parity', () => {
  it('every resolver rejection for an explored destination yields the same explainer code', () => {
    const { state, moverId } = fixture();
    const mismatches: string[] = [];
    for (const key of Object.keys(state.map.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      if (hexKey(state.units[moverId]!.position) === key) continue;
      const res = resolveUnitMoveIntent(state, moverId, { q, r }, { actor: 'player', civId: 'civ-a' });
      if (res.ok || res.reason === 'missing-unit') continue;
      const reason = getMovementBlockerReason(state, moverId, { q, r });
      if (reason?.code !== res.reason) {
        mismatches.push(`${key}: resolver=${res.reason} explainer=${reason?.code ?? 'null'}`);
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});
