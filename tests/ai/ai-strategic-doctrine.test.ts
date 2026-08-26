import { describe, it, expect } from 'vitest';
import type { GameState, Civilization, Unit, City, HexCoord } from '@/core/types';
import { canAuthorizeVeteranFirstUse } from '@/ai/ai-strategic-doctrine';

const CAPITAL_POS: HexCoord = { q: 0, r: 0 };

function makeDiplomacy(atWarWith: string[] = []) {
  return {
    relationships: {}, treaties: [], events: [], atWarWith, treacheryScore: 0,
    vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
  };
}

function makeCiv(id: string, overrides: Partial<Civilization> = {}): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [`${id}-capital`], units: [], gold: 0, visibility: { tiles: {}, lastSeen: {} }, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: makeDiplomacy(),
    ...overrides,
  } as Civilization;
}

function makeCity(id: string, owner: string, position: HexCoord, hp?: number): City {
  return { id, name: id, owner, position, buildings: [], hp } as unknown as City;
}

function makeUnit(id: string, owner: string, type: string, position: HexCoord): Unit {
  return {
    id, type: type as never, owner, position,
    movementPointsLeft: 1, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false,
  } as Unit;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, era: 5, currentPlayer: 'p1',
    civilizations: {}, cities: {}, units: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [], gameOver: false, winner: null,
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

// Fully-satisfied baseline: capital critically damaged, a hostile warrior
// adjacent, no friendly land unit nearby, and a legal target (ai-2's own
// capital, in range with a silo, discovered, at war).
function makeExistentialThreatState(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    civilizations: {
      'ai-1': makeCiv('ai-1', {
        cities: ['ai-1-capital', 'ai-1-silo'],
        diplomacy: makeDiplomacy(['ai-2']),
        strategicArsenal: 1,
        visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
      }),
      'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
    },
    cities: {
      'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
      'ai-1-silo': makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100) as City & { buildings: string[] },
      'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
    },
    units: {
      'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
    },
    ...overrides,
  });
}

describe('canAuthorizeVeteranFirstUse (#545 MR5 §10)', () => {
  it('authorizes when capital HP is critical, a hostile land unit is adjacent, and no friendly relief is near', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });

  it('does not authorize when capital HP is above the threshold', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    state.cities['ai-1-capital'] = { ...state.cities['ai-1-capital'], hp: 80 };
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('does not authorize when no hostile land unit is adjacent to the capital', () => {
    const state = makeExistentialThreatState({ units: {} });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('does not authorize when a friendly combat land unit is near the capital (relief present)', () => {
    const state = makeExistentialThreatState({
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
        'friendly-1': makeUnit('friendly-1', 'ai-1', 'warrior', { q: 0, r: 2 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('"friendly" means the endangered civ\'s own units only — an allied civ\'s unit does not count as relief', () => {
    const state = makeExistentialThreatState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'], diplomacy: makeDiplomacy(['ai-2']), strategicArsenal: 1,
          visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
        }),
        'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
        'ai-3': makeCiv('ai-3', { cities: [] }),
      },
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
        'ally-1': makeUnit('ally-1', 'ai-3', 'warrior', { q: 0, r: 2 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });

  it('does not authorize when there is no legal target', () => {
    const state = makeExistentialThreatState();
    // No missile_silo building anywhere -- no platform, so getLegalStrategicLaunchTargets is empty.
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('excludes a minor civ from AI-authorized targets, even when the minor civ itself is the besieger', () => {
    // Deliberately does NOT reuse makeExistentialThreatState's default
    // units (an ai-2-owned unit) -- if it did, ai-1 would no longer be at
    // war with ai-2 in this test's overridden diplomacy, so
    // isHostileOwnerTo would already return false for that leftover unit
    // and this test would pass for the wrong reason (no threat detected at
    // all) without ever reaching the minor-civ exclusion this test is
    // named for. Instead, the besieger here is mc-1 itself -- a minor civ
    // unit adjacent to the capital -- which must still authorize nothing
    // because minor civs are never legal AI-authorized targets, not
    // because no threat was detected.
    const state = makeState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'], diplomacy: makeDiplomacy(['mc-1']), strategicArsenal: 1,
          visibility: { tiles: { '2,2': 'visible' }, lastSeen: {} },
        }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
        'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
        'mc-1-city': makeCity('mc-1-city', 'mc-1', { q: 2, r: 2 }, 100),
      },
      minorCivs: {
        'mc-1': {
          id: 'mc-1', definitionId: 'mc-1', cityId: 'mc-1-city', units: ['mc-hostile-1'],
          diplomacy: makeDiplomacy(['ai-1']), activeQuests: {}, chainStatusByCiv: {},
          questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {}, isDestroyed: false,
          garrisonCooldown: 0, lastEraUpgrade: 0,
        },
      },
      units: {
        'mc-hostile-1': makeUnit('mc-hostile-1', 'mc-1', 'warrior', { q: 1, r: 0 }),
      },
    });
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBeNull();
  });

  it('never strikes an unrelated atWarWith civ that is not the one besieging the capital (pacifist-safety invariant)', () => {
    // ai-1 is at war with BOTH ai-2 (the actual besieger, adjacent to the
    // capital) and ai-4 (an unrelated war -- e.g. ai-4 never attacked
    // anyone and has no units anywhere near ai-1's capital). Only ai-2's
    // city may ever be selected; ai-4's must never be struck just because
    // it happens to have a legal target and appears in atWarWith.
    const state = makeExistentialThreatState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'],
          diplomacy: makeDiplomacy(['ai-2', 'ai-4']),
          strategicArsenal: 1,
          visibility: { tiles: { '5,5': 'visible', '9,9': 'visible' }, lastSeen: {} },
        }),
        'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
        'ai-4': makeCiv('ai-4', { cities: ['ai-4-capital'] }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 10),
        'ai-1-silo': makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100),
        'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
        'ai-4-capital': makeCity('ai-4-capital', 'ai-4', { q: 9, r: 9 }, 100),
      },
      // Only ai-2 has a unit anywhere -- ai-4 poses no threat at all.
      units: {
        'hostile-1': makeUnit('hostile-1', 'ai-2', 'warrior', { q: 1, r: 0 }),
      },
    });
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    expect(canAuthorizeVeteranFirstUse(state, 'ai-1')).toBe('ai-2-capital');
  });
});
