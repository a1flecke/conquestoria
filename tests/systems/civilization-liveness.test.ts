import { describe, expect, it } from 'vitest';
import type { GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { createUnit } from '@/systems/unit-lifecycle';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { makeLivenessGame, withoutOwnedAssets } from './helpers/civilization-liveness-fixture';

function aiSettlerState(): { state: GameState; settlerId: string } {
  const state = makeLivenessGame();
  const settler = Object.values(state.units).find(unit =>
    unit.owner === 'ai-1' && unit.type === 'settler');
  if (!settler) throw new Error('Fixture requires an AI settler');
  return { state, settlerId: settler.id };
}

describe('getCivilizationLiveness', () => {
  it('reads authoritative city and settler ownership instead of their rosters', () => {
    const { state } = aiSettlerState();
    state.civilizations.player.cities = [];
    state.civilizations['ai-1'].units = [];

    expect(getCivilizationLiveness(state, 'player'))
      .toEqual({ living: true, reason: 'city' });
    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: true, reason: 'settler' });
  });

  it('treats an elimination marker as terminal even when entities remain', () => {
    const { state } = aiSettlerState();
    state.civilizations['ai-1'].isEliminated = true;

    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: false, reason: 'eliminated' });
  });

  it('rejects military-only, dead-settler, unknown, and non-major actors', () => {
    const { state, settlerId } = aiSettlerState();
    state.units[settlerId] = { ...state.units[settlerId], type: 'warrior' };

    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: false, reason: 'no-survival-assets' });

    const deadSettler = aiSettlerState();
    deadSettler.state.units[deadSettler.settlerId] = {
      ...deadSettler.state.units[deadSettler.settlerId],
      health: 0,
    };
    expect(getCivilizationLiveness(deadSettler.state, 'ai-1'))
      .toEqual({ living: false, reason: 'no-survival-assets' });

    expect(getCivilizationLiveness(state, 'missing-civ'))
      .toEqual({ living: false, reason: 'not-major' });
    expect(getCivilizationLiveness(state, 'barbarian'))
      .toEqual({ living: false, reason: 'not-major' });
  });

  it('treats incomplete legacy entity maps as having no survival assets', () => {
    const { state } = aiSettlerState();
    const incomplete = {
      civilizations: state.civilizations,
    } as unknown as GameState;

    expect(getCivilizationLiveness(incomplete, 'ai-1'))
      .toEqual({ living: false, reason: 'no-survival-assets' });
  });

  it.each(
    Object.values(UNIT_DEFINITIONS)
      .filter(definition => definition.cargoCapacity !== undefined)
      .map(definition => definition.type),
  )('keeps a settler alive aboard a reciprocal %s', (transportType: UnitType) => {
    const { state, settlerId } = aiSettlerState();
    const settler = state.units[settlerId];
    const transport = createUnit(transportType, 'ai-1', settler.position, state.idCounters);
    state.units[transport.id] = { ...transport, cargoUnitIds: [settlerId] };
    state.units[settlerId] = {
      ...settler,
      transportId: transport.id,
      hasActed: true,
      movementPointsLeft: 0,
    };

    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: true, reason: 'settler' });
  });

  it.each(['missing-manifest', 'missing-host', 'wrong-owner', 'dead-host', 'nested-host', 'self-link'] as const)('rejects %s cargo survival without changing the supplied state', corruption => {
    const { state, settlerId } = aiSettlerState();
    const settler = state.units[settlerId];
    const transport = createUnit('transport', 'ai-1', settler.position, state.idCounters);
    state.units[transport.id] = { ...transport, cargoUnitIds: [settlerId] };
    state.units[settlerId] = { ...settler, transportId: transport.id };
    switch (corruption) {
      case 'missing-manifest': state.units[transport.id].cargoUnitIds = []; break;
      case 'missing-host': delete state.units[transport.id]; break;
      case 'wrong-owner': state.units[transport.id].owner = 'player'; break;
      case 'dead-host': state.units[transport.id].health = 0; break;
      case 'nested-host': state.units[transport.id].transportId = 'another-host'; break;
      case 'self-link': state.units[settlerId].transportId = settlerId; break;
    }
    const before = structuredClone(state);

    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: false, reason: 'no-survival-assets' });
    expect(state).toEqual(before);
  });

  it('does not let a valid city be overridden by malformed cargo', () => {
    const state = withoutOwnedAssets(makeLivenessGame(), 'ai-1');
    const city = Object.values(state.cities).find(candidate => candidate.owner === 'player');
    if (!city) throw new Error('Fixture requires player city');
    state.cities[city.id] = { ...city, owner: 'ai-1' };

    expect(getCivilizationLiveness(state, 'ai-1'))
      .toEqual({ living: true, reason: 'city' });
  });

  it('keeps the founding capability catalog explicit', () => {
    expect(Object.values(UNIT_DEFINITIONS)
      .filter(definition => definition.canFoundCity)
      .map(definition => definition.type))
      .toEqual(['settler']);
  });
});
