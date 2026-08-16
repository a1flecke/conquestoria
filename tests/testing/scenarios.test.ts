import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '@/testing/scenarios';
import { buildScenario } from '@/testing/scenario-builder';
import { hexKey } from '@/systems/hex-utils';
import { getBlockingMapEntityAt, getMovementRangeDetails } from '@/systems/unit-system';

describe('undefended-enemy-city scenario (#843)', () => {
  it('reproduces a player scout 2 hexes from an undefended, at-war AI city', () => {
    const state = buildScenario(SCENARIOS['undefended-enemy-city']);
    const scout = Object.values(state.units).find(u => u.type === 'scout' && u.owner === 'player');
    const city = Object.values(state.cities).find(c => c.owner === 'ai-1');
    expect(scout).toBeDefined();
    expect(city).toBeDefined();
    // city has no garrison unit
    expect(Object.values(state.units).some(u => hexKey(u.position) === hexKey(city!.position))).toBe(false);
    expect(state.civilizations.player.diplomacy.atWarWith).toContain('ai-1');

    // Exactly what #843's fix guards: reachable adjacency-only, not walk-through.
    const range = getMovementRangeDetails(state, scout!.id);
    const keys = range.reachable.map(hexKey);
    expect(keys).not.toContain(hexKey(city!.position));
    const blocking = getBlockingMapEntityAt(state, scout!, city!.position);
    expect(blocking).toEqual({ reason: 'foreign-city', entityId: city!.id });
  });
});

describe('undefended-barbarian-camp scenario (#845)', () => {
  it('reproduces a player unit directly adjacent to an undefended camp', () => {
    const state = buildScenario(SCENARIOS['undefended-barbarian-camp']);
    const mover = Object.values(state.units).find(u => u.owner === 'player');
    const camp = Object.values(state.barbarianCamps)[0];
    expect(mover).toBeDefined();
    expect(camp).toBeDefined();
    const blocking = getBlockingMapEntityAt(state, mover!, camp!.position);
    expect(blocking).toEqual({ reason: 'barbarian-camp', entityId: camp!.id });
  });
});
