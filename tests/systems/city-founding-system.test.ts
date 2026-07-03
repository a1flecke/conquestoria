import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord } from '@/core/types';
import { foundCityInState } from '@/systems/city-founding-system';
import { foundCity } from '@/systems/city-system';
import { cityDistance } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';

function getSettlerId(state: GameState, civId: string): string {
  const settlerId = state.civilizations[civId].units
    .find(unitId => state.units[unitId]?.type === 'settler');
  if (!settlerId) throw new Error(`missing settler for ${civId}`);
  return settlerId;
}

function findDistantLand(
  state: GameState,
  from: HexCoord,
  minimumDistance = 4,
): HexCoord {
  const tile = Object.values(state.map.tiles).find(candidate =>
    candidate.terrain !== 'ocean'
    && candidate.terrain !== 'coast'
    && candidate.terrain !== 'mountain'
    && cityDistance(candidate.coord, from, state.map) >= minimumDistance);
  if (!tile) throw new Error('missing distant land tile');
  return tile.coord;
}

describe('foundCityInState', () => {
  it.each(['player', 'ai-1'])(
    'applies the same complete founding mutation for %s',
    civId => {
      const state = createNewGame(undefined, `founding-parity-${civId}`, 'small');
      const settlerId = getSettlerId(state, civId);
      const settlerPosition = { ...state.units[settlerId].position };
      const before = structuredClone(state);
      const bus = new EventBus();
      const founded = vi.fn();
      bus.on('city:founded', founded);

      const result = foundCityInState(state, settlerId, bus);
      const city = result.state.cities[result.cityId];

      expect(state).toEqual(before);
      expect(city).toBeDefined();
      expect(city.owner).toBe(civId);
      expect(result.state.units[settlerId]).toBeUndefined();
      expect(result.state.civilizations[civId].units).not.toContain(settlerId);
      expect(result.state.civilizations[civId].cities).toContain(result.cityId);
      expect(result.state.map.tiles[hexKey(settlerPosition)].owner).toBe(civId);
      expect(Object.values(result.state.legendaryWonderProjects ?? {})
        .some(project => project.cityId === result.cityId && project.ownerId === civId))
        .toBe(true);
      expect(founded).toHaveBeenCalledOnce();
      expect(founded).toHaveBeenCalledWith({
        city: result.state.cities[result.cityId],
        founderId: civId,
      });
    },
  );

  it('clears near-defeat and emits recovery when founding restores a second city', () => {
    const state = createNewGame(undefined, 'founding-recovery', 'small');
    const civId = 'ai-1';
    const settlerId = getSettlerId(state, civId);
    const existingPosition = findDistantLand(
      state,
      state.units[settlerId].position,
    );
    const existing = foundCity(
      civId,
      existingPosition,
      state.map,
      state.idCounters,
    );
    state.cities[existing.id] = existing;
    state.civilizations[civId].cities = [existing.id];
    state.civilizations[civId].nearDefeat = true;
    const bus = new EventBus();
    const recovered = vi.fn();
    bus.on('civ:recovered-from-near-defeat', recovered);

    const result = foundCityInState(state, settlerId, bus);

    expect(result.state.civilizations[civId].cities).toHaveLength(2);
    expect(result.state.civilizations[civId].nearDefeat).toBe(false);
    expect(recovered).toHaveBeenCalledOnce();
    expect(recovered).toHaveBeenCalledWith({ civId });
  });

  it('does not emit recovery from a stale city roster entry', () => {
    const state = createNewGame(undefined, 'founding-stale-roster', 'small');
    const civId = 'ai-1';
    const settlerId = getSettlerId(state, civId);
    state.civilizations[civId].cities = ['missing-city'];
    state.civilizations[civId].nearDefeat = true;
    const bus = new EventBus();
    const recovered = vi.fn();
    bus.on('civ:recovered-from-near-defeat', recovered);

    const result = foundCityInState(state, settlerId, bus);

    expect(result.state.civilizations[civId].nearDefeat).toBe(true);
    expect(result.state.civilizations[civId].cities).toEqual([result.cityId]);
    expect(recovered).not.toHaveBeenCalled();
  });

  it('enforces canonical city spacing without consuming the settler', () => {
    const state = createNewGame(undefined, 'founding-spacing', 'small');
    const civId = 'player';
    const settlerId = getSettlerId(state, civId);
    const nearby = foundCity(
      civId,
      { ...state.units[settlerId].position },
      state.map,
      state.idCounters,
    );
    state.cities[nearby.id] = nearby;
    state.civilizations[civId].cities = [nearby.id];
    const before = structuredClone(state);

    expect(() => foundCityInState(state, settlerId, new EventBus()))
      .toThrow('City cannot be founded here');
    expect(state).toEqual(before);
  });

  it('rejects an exhausted settler without mutating the input', () => {
    const state = createNewGame(undefined, 'founding-exhausted', 'small');
    const settlerId = getSettlerId(state, 'player');
    state.units[settlerId].hasActed = true;
    const before = structuredClone(state);

    expect(() => foundCityInState(state, settlerId, new EventBus()))
      .toThrow('Settler has already acted');
    expect(state).toEqual(before);
  });
});
