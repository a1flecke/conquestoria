import { describe, it, expect } from 'vitest';
import { getWorldPressurePresentationForViewer } from '@/systems/world-pressure-presentation';
import { hexKey } from '@/systems/hex-utils';
import type { GameState } from '@/core/types';

function baseCrisisState(): GameState {
  return {
    turn: 10,
    era: 3,
    settings: { aiPressureVisibility: true },
    civilizations: {
      viewer: { id: 'viewer', isHuman: true, cities: [], visibility: { tiles: {}, lastSeen: {} }, knownCivilizations: ['ai-1'] },
      'ai-1': { id: 'ai-1', isHuman: false, cities: ['ai-city'] },
    },
    cities: {
      'ai-city': { id: 'ai-city', owner: 'ai-1', position: { q: 2, r: 3 } },
    },
    activeCrises: {
      'crisis-1': {
        id: 'crisis-1',
        flavorId: 'plague',
        archetype: 'outbreak',
        targetCivId: 'ai-1',
        cityIds: ['ai-city'],
        tileKeys: [],
        startedTurn: 6,
        stage: 'active',
        turnsInStage: 4,
      },
    },
  } as unknown as GameState;
}

describe('getWorldPressurePresentationForViewer', () => {
  it('gates on the flag: aiPressureVisibility false yields nothing', () => {
    const state = baseCrisisState();
    state.settings = { aiPressureVisibility: false } as GameState['settings'];
    const result = getWorldPressurePresentationForViewer(state, 'viewer');
    expect(result.cityBadges).toEqual([]);
    expect(result.statusLinesByCivId).toEqual({});
  });

  it('unmet civ: no status line, no badge, even if tile is visible', () => {
    const state = baseCrisisState();
    state.civilizations.viewer.knownCivilizations = []; // has NOT met ai-1
    state.civilizations.viewer.visibility = { tiles: { [hexKey({ q: 2, r: 3 })]: 'visible' }, lastSeen: {} };
    const result = getWorldPressurePresentationForViewer(state, 'viewer');
    expect(result.cityBadges).toEqual([]);
    expect(result.statusLinesByCivId['ai-1']).toBeUndefined();
  });

  it('met civ, crisis city tile NOT visible: status line yes, badge no', () => {
    const state = baseCrisisState();
    // viewer.visibility has no entry for the city coord -> defaults to unexplored
    const result = getWorldPressurePresentationForViewer(state, 'viewer');
    expect(result.statusLinesByCivId['ai-1']).toBeDefined();
    expect(result.statusLinesByCivId['ai-1'].text).toContain('4');
    expect(result.cityBadges).toEqual([]);
  });

  it('met civ + visible tile: badge with correct archetype', () => {
    const state = baseCrisisState();
    state.civilizations.viewer.visibility = { tiles: { [hexKey({ q: 2, r: 3 })]: 'visible' }, lastSeen: {} };
    const result = getWorldPressurePresentationForViewer(state, 'viewer');
    expect(result.cityBadges).toEqual([
      { cityId: 'ai-city', coord: { q: 2, r: 3 }, archetype: 'outbreak' },
    ]);
  });

  it('hot-seat: independent viewers get independent results', () => {
    const state = baseCrisisState();
    state.civilizations.viewer.visibility = { tiles: { [hexKey({ q: 2, r: 3 })]: 'visible' }, lastSeen: {} };
    state.civilizations['viewer-b'] = {
      id: 'viewer-b', isHuman: true, cities: [],
      visibility: { tiles: {}, lastSeen: {} },
      knownCivilizations: [],
    } as unknown as GameState['civilizations'][string];

    const resultA = getWorldPressurePresentationForViewer(state, 'viewer');
    const resultB = getWorldPressurePresentationForViewer(state, 'viewer-b');
    expect(resultA.cityBadges.length).toBe(1);
    expect(resultB.cityBadges).toEqual([]);
    expect(resultB.statusLinesByCivId).toEqual({});
  });

  it('excludes the viewer\'s own crises (existing human UI covers them)', () => {
    const state = baseCrisisState();
    state.activeCrises!['crisis-1'].targetCivId = 'viewer';
    state.civilizations.viewer.knownCivilizations = ['viewer', 'ai-1'];
    const result = getWorldPressurePresentationForViewer(state, 'viewer');
    expect(result.statusLinesByCivId['viewer']).toBeUndefined();
    expect(result.cityBadges).toEqual([]);
  });
});
