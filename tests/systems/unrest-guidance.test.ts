import { describe, it, expect } from 'vitest';
import type { GameState, City, HexCoord } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { getEraAdvancementTechs } from '@/systems/tech-definitions';
import { getUnrestRecommendations, getTopUnrestLever } from '@/systems/unrest-guidance';

function completedTechsForEra(era: number): string[] {
  return Array.from({ length: Math.max(0, era - 1) }, (_, index) => index + 2)
    .flatMap(candidate => {
      const techs = getEraAdvancementTechs(candidate);
      const required = Math.ceil(techs.length * (candidate <= 3 ? 0.5 : candidate <= 8 ? 0.6 : 0.55));
      return techs.slice(0, required).map(tech => tech.id);
    });
}

function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

function makeCity(id: string, owner: string, position: HexCoord, overrides: Partial<City> = {}): City {
  return {
    id, name: id, owner, position,
    population: 4, food: 0, foodNeeded: 20,
    buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

interface MakeStateOpts {
  cityCount?: number;
  cityPosition?: HexCoord;
  capitalPosition?: HexCoord;
  conquestTurn?: number;
  spyUnrestBonus?: number;
  atWarCount?: number;
  era?: number;
  completed?: string[];
  cityBuildings?: string[];
  spareMilitaryUnitAt?: HexCoord;
  criticalEconomy?: boolean;
  revoltingNeighborAt?: HexCoord;
}

function makeState(opts: MakeStateOpts = {}): GameState {
  const {
    cityCount = 1,
    cityPosition = { q: 0, r: 0 },
    capitalPosition = { q: 0, r: 0 },
    conquestTurn,
    spyUnrestBonus = 0,
    atWarCount = 0,
    era = 2,
    completed,
    cityBuildings = [],
    spareMilitaryUnitAt,
    criticalEconomy = false,
    revoltingNeighborAt,
  } = opts;
  const civId = 'player';
  const city = makeCity('city-1', civId, cityPosition, { conquestTurn, spyUnrestBonus, buildings: [...cityBuildings], unrestLevel: 1 });
  const capital = makeCity('capital', civId, capitalPosition, { name: 'Capital' });
  const cities: Record<string, City> = { [capital.id]: capital, [city.id]: city };
  for (let i = 2; i <= cityCount; i++) {
    cities[`city-${i}`] = makeCity(`city-${i}`, civId, { q: i * 2, r: 0 });
  }
  if (revoltingNeighborAt) {
    cities['revolt-neighbor'] = makeCity('revolt-neighbor', civId, revoltingNeighborAt, { unrestLevel: 2, unrestTurns: 5 });
  }

  const units: GameState['units'] = {};
  if (spareMilitaryUnitAt) {
    units['spare-1'] = {
      id: 'spare-1', type: 'warrior', owner: civId, position: spareMilitaryUnitAt,
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
  }

  const tiles = Object.fromEntries(
    Object.values(cities).map(c => [hexKey(c.position), {
      coord: c.position, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'none', owner: civId, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    }]),
  );

  const state: GameState = {
    turn: 10,
    era,
    currentPlayer: civId,
    gameOver: false,
    winner: null,
    map: { width: 40, height: 40, tiles, wrapsHorizontally: false, rivers: [] },
    units,
    cities,
    civilizations: {
      [civId]: {
        id: civId, name: 'Player', color: '#4a90d9', isHuman: true, civType: 'egypt',
        cities: Object.keys(cities), units: Object.keys(units),
        techState: {
          completed: completed ?? completedTechsForEra(era),
          currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as never,
        },
        gold: 100, visibility: { tiles: {} }, score: 0,
        diplomacy: {
          ...createDiplomacyState(['player', 'ai-1', 'ai-2', 'ai-3'], 'player'),
          atWarWith: Array.from({ length: atWarCount }, (_, i) => `ai-${i + 1}`),
        },
      },
      'ai-1': {
        id: 'ai-1', name: 'Opponent', color: '#d94a4a', isHuman: false, civType: 'rome',
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as never },
        gold: 100, visibility: { tiles: {} }, score: 0,
        diplomacy: createDiplomacyState(['player', 'ai-1', 'ai-2', 'ai-3'], 'ai-1'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: {
      mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0,
      tutorialEnabled: false, advisorsEnabled: {} as never, councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;

  if (criticalEconomy) {
    // normalizeEconomyStatus() recomputes strainLevel from unpaidMaintenance, so a large
    // unpaid figure is enough to force 'critical' regardless of the other fields.
    state.economyStatusByCiv = { player: { unpaidMaintenance: 999 } as never };
  }
  return state;
}

describe('unrest-guidance', () => {
  it('Empire overextension → research-magistracy (research-first) when code-of-laws done but magistracy not', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('research-magistracy');
    expect(rec?.availability).toBe('research-first');
  });

  it('NEGATIVE: Empire overextension does NOT yield build-courthouse before magistracy', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).not.toBe('build-courthouse');
  });

  it('Empire overextension → build-courthouse (now) when magistracy done and city lacks one', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws', 'magistracy'] });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('build-courthouse');
    expect(rec?.availability).toBe('now');
  });

  it('Empire overextension → garrison-unit when magistracy not researchable and a spare military unit exists', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'], spareMilitaryUnitAt: { q: 20, r: 20 } });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Empire overextension');
    expect(rec?.kind).toBe('garrison-unit');
    expect(rec?.availability).toBe('now');
  });

  it('garrison-unit vs train-garrison-unit flips on whether a spare unit exists', () => {
    const withUnit = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'], spareMilitaryUnitAt: { q: 20, r: 20 } });
    const without = makeState({ cityCount: 12, era: 2, completed: ['tribal-council'] });
    expect(getUnrestRecommendations('city-1', withUnit).find(r => r.rowLabel === 'Empire overextension')?.kind).toBe('garrison-unit');
    expect(getUnrestRecommendations('city-1', without).find(r => r.rowLabel === 'Empire overextension')?.kind).toBe('train-garrison-unit');
  });

  it('War weariness → make-peace (now) with params.warCivIds', () => {
    const state = makeState({ cityCount: 1, era: 2, atWarCount: 2 });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'War weariness');
    expect(rec?.kind).toBe('make-peace');
    expect(rec?.availability).toBe('now');
    expect((rec?.params as { warCivIds: string[] }).warCivIds).toHaveLength(2);
  });

  it('Recent conquest → await-conquest-settle (now), never a 3-eras-away tech as the primary lever', () => {
    const state = makeState({ cityCount: 1, era: 2, conquestTurn: 0 });
    state.turn = 5;
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Recent conquest');
    expect(rec?.kind).toBe('await-conquest-settle');
    expect(rec?.availability).toBe('now');
    expect((rec?.params as { turnsLeft: number }).turnsLeft).toBe(10); // 15 - (5 - 0)
    expect((rec?.params as { suggestConstitutionalLaw: boolean }).suggestConstitutionalLaw).toBe(true);
  });

  it('Economic strain → fix-economy (now); only appears at era ≥ 3', () => {
    const state = makeState({ cityCount: 1, era: 3, criticalEconomy: true });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Economic strain');
    expect(rec?.kind).toBe('fix-economy');
    const era2 = makeState({ cityCount: 1, era: 2, criticalEconomy: true });
    expect(getUnrestRecommendations('city-1', era2).some(r => r.rowLabel === 'Economic strain')).toBe(false);
  });

  it('Enemy espionage → counter-espionage (now)', () => {
    const state = makeState({ cityCount: 1, era: 2, spyUnrestBonus: 10 });
    expect(getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Enemy espionage')?.kind).toBe('counter-espionage');
  });

  it('Uprising contagion → stabilise-contagion-source (now) with params.sourceCityId', () => {
    const state = makeState({ cityCount: 1, era: 2, cityPosition: { q: 0, r: 0 }, revoltingNeighborAt: { q: 2, r: 0 } });
    const rec = getUnrestRecommendations('city-1', state).find(r => r.rowLabel === 'Uprising contagion');
    expect(rec?.kind).toBe('stabilise-contagion-source');
    expect((rec?.params as { sourceCityId: string }).sourceCityId).toBe('revolt-neighbor');
  });

  it('NEGATIVE: no build-happiness-building for an Era-2 civ', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    expect(getUnrestRecommendations('city-1', state).some(r => r.kind === 'build-happiness-building')).toBe(false);
  });

  it('POSITIVE: build-happiness-building appears for an Era-3 civ with philosophy and no happiness building', () => {
    const state = makeState({ cityCount: 12, era: 3, completed: [...completedTechsForEra(3), 'philosophy'] });
    expect(getUnrestRecommendations('city-1', state).some(r => r.kind === 'build-happiness-building' && r.availability === 'now')).toBe(true);
  });

  it('getTopUnrestLever picks the largest row that is now-actionable', () => {
    // overextension 18 (research-first) vs war 24 (now) → make-peace wins.
    const state = makeState({ cityCount: 12, era: 2, atWarCount: 3, completed: ['tribal-council', 'code-of-laws'] });
    expect(getTopUnrestLever('city-1', state)?.kind).toBe('make-peace');
  });

  it('getTopUnrestLever falls through to the largest row when none are now-actionable', () => {
    const state = makeState({ cityCount: 12, era: 2, completed: ['tribal-council', 'code-of-laws'] });
    expect(getTopUnrestLever('city-1', state)?.kind).toBe('research-magistracy');
  });

  it('getTopUnrestLever falls back to appease-or-concede with no positive rows', () => {
    const state = makeState({ cityCount: 1, era: 2 });
    const top = getTopUnrestLever('city-1', state);
    expect(top?.kind).toBe('appease-or-concede');
    expect(top?.rowLabel).toBe('');
  });

  it('a courthoused city surfaces a different top lever than the same city un-courthoused', () => {
    // Sprawl-dominated: 20 cities + 15 hexes out, no wars → the overextension row leads.
    const base = makeState({
      cityCount: 20, era: 2, cityPosition: { q: 15, r: 0 },
      completed: ['tribal-council', 'code-of-laws', 'magistracy'],
    });
    const withCh: GameState = {
      ...base,
      cities: { ...base.cities, 'city-1': { ...base.cities['city-1'], buildings: ['courthouse'] } },
    };
    expect(getTopUnrestLever('city-1', base)?.kind).toBe('build-courthouse');
    // Courthouse already built: the sprawl rows persist (residual floor) but the lever
    // for them is no longer "build one" — it changes to a garrison/train recommendation.
    expect(getTopUnrestLever('city-1', withCh)?.kind).not.toBe('build-courthouse');
  });
});
