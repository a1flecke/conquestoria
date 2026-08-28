import { describe, it, expect } from 'vitest';
import type { GameState, Civilization, Unit, City, HexCoord } from '@/core/types';
import { canAuthorizeVeteranFirstUse, evaluateStrategicLaunchDecision } from '@/ai/ai-strategic-doctrine';

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
    settings: { superweapons: 'on' } as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
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

// A civ struck by ai-2 before, currently at war with ai-2, with a legal
// target and no existential threat of its own (so first-use never fires) --
// isolates the retaliation path.
function makeRetaliationEligibleState(): GameState {
  return makeState({
    civilizations: {
      'ai-1': makeCiv('ai-1', {
        cities: ['ai-1-capital', 'ai-1-silo'],
        diplomacy: { ...makeDiplomacy(['ai-2']), strategicStrikesReceivedFrom: ['ai-2'] },
        strategicArsenal: 1,
        visibility: { tiles: { '5,5': 'visible' }, lastSeen: {} },
      }),
      'ai-2': makeCiv('ai-2', { cities: ['ai-2-capital'] }),
    },
    cities: {
      'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 100),
      'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
      'ai-2-capital': makeCity('ai-2-capital', 'ai-2', { q: 5, r: 5 }, 100),
    },
  });
}

describe('evaluateStrategicLaunchDecision (#545 MR5 §10)', () => {
  it('explorer/standard never authorize first use, even under existential-threat conditions', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 1; // never wins a probability roll
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'explorer', rng)).toBeNull();
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('veteran authorizes first use via the existential gate, independent of the retaliation roll', () => {
    const state = makeExistentialThreatState();
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 1; // would fail any retaliation roll -- proves this path is the gate, not RNG
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'veteran', rng))
      .toBe(canAuthorizeVeteranFirstUse(state, 'ai-1'));
  });

  it('retaliation-eligible civ launches when the willingness roll succeeds', () => {
    const state = makeRetaliationEligibleState();
    const rng = () => 0; // always "wins" (0 < any positive willingness)
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBe('ai-2-capital');
  });

  it('retaliation-eligible civ does not launch when the willingness roll fails', () => {
    const state = makeRetaliationEligibleState();
    const rng = () => 0.999999; // above every difficulty's willingness (all < 1)
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('a civ that was never struck by its war opponent is not retaliation-eligible, regardless of RNG', () => {
    const state = makeExistentialThreatState(); // atWarWith ai-2, but no strategicStrikesReceivedFrom
    state.cities['ai-1-silo'] = { ...state.cities['ai-1-silo'], buildings: ['missile_silo'] } as City;
    const rng = () => 0; // would always "win" if eligibility were ignored
    expect(evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng)).toBeNull();
  });

  it('bounded correctly across multiple war opponents -- only the retaliation-eligible one is ever struck, even when a non-eligible opponent is checked first', () => {
    // A naive review of the first draft found this test's original form
    // (a third civ with a legal target but NOT in atWarWith) doesn't
    // actually prove anything: getStrategicLaunchLegality's own isAtWar
    // check already makes a non-warred civ's city illegal, so a target on
    // it can never exist in the first place -- the assertion passed
    // trivially, without ever exercising code this task added. This
    // version instead puts ai-3 IN atWarWith (so it has a genuinely legal
    // target) and iterates it BEFORE the actually-eligible ai-2, so the
    // only way the test can pass is if isStrategicStrikeRetaliation's gate
    // is actually being checked per-opponent, not just "first legal
    // target wins."
    const state = makeRetaliationEligibleState(); // ai-1 struck by ai-2 before -> ai-2 is retaliation-eligible
    state.civilizations['ai-1'].diplomacy.atWarWith = ['ai-3', 'ai-2']; // ai-3 iterated first
    state.civilizations['ai-3'] = makeCiv('ai-3', { cities: ['ai-3-capital'] }); // never struck ai-1
    state.cities['ai-3-capital'] = makeCity('ai-3-capital', 'ai-3', { q: 6, r: 6 }, 100);
    (state.civilizations['ai-1'].visibility as { tiles: Record<string, string> }).tiles['6,6'] = 'visible';
    const rng = () => 0; // always "wins" if reached -- proves ai-3 is skipped on eligibility, not luck
    const result = evaluateStrategicLaunchDecision(state, 'ai-1', 'standard', rng);
    expect(result).toBe('ai-2-capital');
  });

  it('play-styles invariant (#545 MR5 design doc finding #7): a civ that never built arsenal and never struck first is never targeted, at any difficulty', () => {
    // ai-9 is at war with ai-1 (so it has a genuinely legal target -- a
    // discovered city, in range, with ai-1 at war with it) but has zero
    // strategicArsenal, has never appeared in any civ's
    // strategicStrikesReceivedFrom, and poses no adjacency threat to
    // ai-1's capital (which also isn't critically damaged). Deliberately
    // NOT reusing makeRetaliationEligibleState's ai-2 alongside ai-9 --
    // an earlier draft of this test did that, and ai-2 (genuinely
    // retaliation-eligible) was always returned first regardless of
    // whether ai-9's exclusion logic worked at all, making the assertion
    // vacuous. Here ai-9 is the ONLY war opponent, so a null result is
    // the only way this test can pass, and only if eligibility is
    // actually being checked.
    const state = makeState({
      civilizations: {
        'ai-1': makeCiv('ai-1', {
          cities: ['ai-1-capital', 'ai-1-silo'],
          diplomacy: makeDiplomacy(['ai-9']),
          strategicArsenal: 1,
          visibility: { tiles: { '7,7': 'visible' }, lastSeen: {} },
        }),
        'ai-9': makeCiv('ai-9', { cities: ['ai-9-capital'], strategicArsenal: 0 }),
      },
      cities: {
        'ai-1-capital': makeCity('ai-1-capital', 'ai-1', CAPITAL_POS, 100),
        'ai-1-silo': { ...makeCity('ai-1-silo', 'ai-1', { q: 0, r: 1 }, 100), buildings: ['missile_silo'] } as City,
        'ai-9-capital': makeCity('ai-9-capital', 'ai-9', { q: 7, r: 7 }, 100),
      },
    });

    const alwaysWinRng = () => 0; // maximizes the chance a bug would surface
    for (const challenge of ['explorer', 'standard', 'veteran'] as const) {
      expect(evaluateStrategicLaunchDecision(state, 'ai-1', challenge, alwaysWinRng)).toBeNull();
    }
  });
});
