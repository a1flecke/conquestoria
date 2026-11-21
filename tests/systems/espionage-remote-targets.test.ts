import { describe, expect, it } from 'vitest';
import type { City, GameState, Spy } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { hexDistance } from '@/systems/hex-utils';
import { createEspionageCivState } from '@/systems/espionage-system';
import {
  getRemoteMissionTargetDenial,
  getRemoteMissionTargetMode,
  getRemoteMissionTargetsForViewer,
  startMissionForCiv,
} from '@/systems/espionage-remote-targets';
import { START_MISSION_FAILURE_MESSAGES } from '@/systems/espionage-missions';
import {
  AI_A, AI_B, HUMAN_A, HUMAN_B, createTwoViewerWorld, expectUnmet, makeMet, setTileVisibility,
} from '../helpers/viewer-knowledge-fixtures';
import { expectHotSeatDifferential, expectViewerSafety, type ViewerSurface } from '../helpers/viewer-safety';

/**
 * #1780: a remote espionage mission may only be aimed at a met empire whose city the actor has
 * found. These tests pin the projection the panel renders and the gate the executor re-runs.
 */

const counters = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function landSites(state: GameState, count: number): Array<{ q: number; r: number }> {
  const picked: Array<{ q: number; r: number }> = [];
  const keys = Object.keys(state.map.tiles).sort();
  for (const key of keys) {
    const tile = state.map.tiles[key]!;
    if (['ocean', 'coast', 'mountain', 'snow'].includes(tile.terrain)) continue;
    if (picked.some(site => hexDistance(site, tile.coord) < 4)) continue;
    picked.push(tile.coord);
    if (picked.length === count) break;
  }
  if (picked.length < count) throw new Error('fixture: not enough land sites');
  return picked;
}

function addCity(state: GameState, owner: string, id: string, name: string, at: { q: number; r: number }): City {
  const city: City = { ...foundCity(owner, at, state.map, counters()), id, name };
  state.cities[id] = city;
  state.civilizations[owner]!.cities.push(id);
  return city;
}

/** Explored but not currently visible: the viewer knows where the city is, with no live evidence. */
function discover(state: GameState, viewerId: string, cityId: string): void {
  setTileVisibility(state, viewerId, state.cities[cityId]!.position, 'fog');
}

/**
 * AI_A: capital Alpha + second city Beta. AI_B: Gamma. HUMAN_B: Delta. Nobody has met anybody
 * and nothing is discovered; each test grants exactly what it needs.
 */
function makeWorld(): GameState {
  const state = createTwoViewerWorld('espionage-remote-targets-1780');
  for (const civ of Object.values(state.civilizations)) {
    for (const key of Object.keys(civ.visibility.tiles)) civ.visibility.tiles[key] = 'unexplored';
  }
  const [a, b, c, d] = landSites(state, 4);
  addCity(state, AI_A, 'city-alpha', 'Alpha', a!);
  addCity(state, AI_A, 'city-beta', 'Beta', b!);
  addCity(state, AI_B, 'city-gamma', 'Gamma', c!);
  addCity(state, HUMAN_B, 'city-delta', 'Delta', d!);
  expectUnmet(state, HUMAN_A, AI_A);
  expectUnmet(state, HUMAN_A, AI_B);
  return state;
}

function withIdleSpy(state: GameState, owner: string, spyId = 'spy-1'): void {
  const spy: Spy = {
    id: spyId, owner, name: 'Agent', unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false, feedsFalseIntel: false,
  };
  const esp = createEspionageCivState();
  state.espionage = { ...state.espionage, [owner]: { ...esp, spies: { [spyId]: spy } } };
}

describe('getRemoteMissionTargetMode (#1780)', () => {
  it('targets a city only for cyber attack; the other remote missions target an empire', () => {
    expect(getRemoteMissionTargetMode('cyber_attack')).toBe('city');
    expect(getRemoteMissionTargetMode('misinformation_campaign')).toBe('empire');
    expect(getRemoteMissionTargetMode('satellite_surveillance')).toBe('empire');
    expect(getRemoteMissionTargetMode('signals_intercept')).toBe('empire');
  });
});

describe('getRemoteMissionTargetsForViewer (#1780)', () => {
  it('lists nothing when the viewer has met nobody, even with every city discovered', () => {
    const state = makeWorld();
    for (const id of ['city-alpha', 'city-beta', 'city-gamma']) discover(state, HUMAN_A, id);
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'satellite_surveillance')).toEqual([]);
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack')).toEqual([]);
  });

  it('lists nothing for a met empire none of whose cities the viewer has found', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'signals_intercept')).toEqual([]);
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack')).toEqual([]);
  });

  it('lists a met empire with a found city once, anchored to its capital when the capital is found', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-beta');
    discover(state, HUMAN_A, 'city-alpha');
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'misinformation_campaign')).toEqual([
      { civId: AI_A, civName: state.civilizations[AI_A]!.name, cityId: 'city-alpha', cityName: 'Alpha' },
    ]);
  });

  it('anchors to a found non-capital city when the capital is still unknown', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-beta');
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'satellite_surveillance').map(t => t.cityId))
      .toEqual(['city-beta']);
  });

  it('lists only found cities for cyber attack, never the met empire\'s unfound ones', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-beta');
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack').map(t => t.cityId)).toEqual(['city-beta']);
    discover(state, HUMAN_A, 'city-alpha');
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack').map(t => t.cityId))
      .toEqual(['city-alpha', 'city-beta']);
  });

  it('never lists the viewer\'s own cities, an eliminated empire, or anything for a placed-spy mission', () => {
    const state = makeWorld();
    addCity(state, HUMAN_A, 'city-home', 'Home', landSites(state, 5)[4]!);
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-alpha');
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack').map(t => t.civId)).toEqual([AI_A]);
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'steal_tech')).toEqual([]);
    state.civilizations[AI_A]!.isEliminated = true;
    expect(getRemoteMissionTargetsForViewer(state, HUMAN_A, 'cyber_attack')).toEqual([]);
  });

  const surface: ViewerSurface<GameState, unknown> = {
    name: 'remote espionage target picker',
    project: (world, viewerId) => ({
      empire: getRemoteMissionTargetsForViewer(world, viewerId, 'satellite_surveillance'),
      city: getRemoteMissionTargetsForViewer(world, viewerId, 'cyber_attack'),
    }),
  };

  it('is viewer-safe: unearned facts leave the list unchanged, earned contact and discovery change it', () => {
    const world = makeWorld();
    makeMet(world, HUMAN_A, AI_A);
    discover(world, HUMAN_A, 'city-alpha');
    expectViewerSafety(surface, {
      world,
      viewerId: HUMAN_A,
      hidden: [
        { label: 'an unmet empire founds another city', apply: w => addCity(w, AI_B, 'city-epsilon', 'Epsilon', landSites(w, 6)[5]!) },
        { label: 'an unmet empire\'s city is renamed', apply: w => { w.cities['city-gamma']!.name = 'Renamed'; } },
        { label: 'the viewer discovers a city of an unmet empire', apply: w => discover(w, HUMAN_A, 'city-gamma') },
        { label: 'a met empire\'s unfound city is renamed', apply: w => { w.cities['city-beta']!.name = 'Hidden'; } },
        { label: 'another human meets an empire', apply: w => makeMet(w, HUMAN_B, AI_B) },
      ],
      earned: [
        { label: 'the viewer meets an empire whose city it has found', apply: w => { discover(w, HUMAN_A, 'city-gamma'); makeMet(w, HUMAN_A, AI_B); } },
        { label: 'the viewer finds another city of a met empire', apply: w => discover(w, HUMAN_A, 'city-beta') },
      ],
    });
  });

  it('is hot-seat safe: contact earned by one human never reaches the other', () => {
    const world = makeWorld();
    expectHotSeatDifferential(surface, {
      world,
      viewers: [HUMAN_A, HUMAN_B],
      knownOnlyTo: HUMAN_B,
      mutation: { label: 'HUMAN_B meets AI_A and finds its capital', apply: w => { makeMet(w, HUMAN_B, AI_A); discover(w, HUMAN_B, 'city-alpha'); } },
    });
  });
});

describe('the remote-target gate at execution (#1780)', () => {
  it('refuses a remote mission aimed at an unmet empire, with copy that names nothing', () => {
    const state = makeWorld();
    discover(state, HUMAN_A, 'city-alpha');
    withIdleSpy(state, HUMAN_A);
    const result = startMissionForCiv(state, HUMAN_A, 'spy-1', 'cyber_attack', undefined, AI_A, 'city-alpha');
    expect(result).toMatchObject({ ok: false, reason: 'target-unknown' });
    expect(START_MISSION_FAILURE_MESSAGES['target-unknown']).not.toMatch(/Alpha|ai-1/);
  });

  it('refuses a met empire\'s city the actor has not found, and a city/owner mismatch', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-alpha');
    withIdleSpy(state, HUMAN_A);
    expect(getRemoteMissionTargetDenial(state, HUMAN_A, 'cyber_attack', AI_A, 'city-beta')).toBe('target-unknown');
    expect(getRemoteMissionTargetDenial(state, HUMAN_A, 'cyber_attack', AI_A, 'city-gamma')).toBe('target-unknown');
    expect(getRemoteMissionTargetDenial(state, HUMAN_A, 'cyber_attack', AI_A, 'city-missing')).toBe('target-unknown');
  });

  it('starts a remote mission against an earned target', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-alpha');
    withIdleSpy(state, HUMAN_A);
    const result = startMissionForCiv(state, HUMAN_A, 'spy-1', 'misinformation_campaign', undefined, AI_A, 'city-alpha');
    expect(result.ok).toBe(true);
    expect(result.state.spies['spy-1']!.currentMission).toMatchObject({ type: 'misinformation_campaign', targetCivId: AI_A });
  });

  it('does not apply to a placed-spy mission: the spy is in the city', () => {
    const state = makeWorld();
    expect(getRemoteMissionTargetDenial(state, HUMAN_A, 'steal_tech', AI_A, 'city-alpha')).toBeNull();
  });

  it('every target the picker offers is accepted by the executor', () => {
    const state = makeWorld();
    makeMet(state, HUMAN_A, AI_A);
    discover(state, HUMAN_A, 'city-alpha');
    discover(state, HUMAN_A, 'city-beta');
    for (const mission of ['cyber_attack', 'misinformation_campaign', 'satellite_surveillance', 'signals_intercept'] as const) {
      for (const target of getRemoteMissionTargetsForViewer(state, HUMAN_A, mission)) {
        expect(getRemoteMissionTargetDenial(state, HUMAN_A, mission, target.civId, target.cityId), `${mission} ${target.cityId}`).toBeNull();
      }
    }
  });
});
