import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getResourceDefinition,
  getResourceSourceKindAt,
  isResourceOutpostSource,
  listResourceSources,
} from '@/systems/resource-source-eligibility';
import {
  getActiveResourceSourceCount,
  getCivAvailableResources,
} from '@/systems/resource-acquisition-system';

/**
 * #1505 MR08: one shared source rule, with the access/ownership distinction kept explicit.
 *
 * Flat strip: `alpha-city` at (2,2) sits on an iron deposit; (3,2) is an improvable iron tile;
 * (4,2) is bare iron; (5,2) is a completed resource outpost owned by alpha.
 */
function makeState(overrides: {
  techs?: string[];
  mine?: 'none' | 'incomplete' | 'complete';
  outpost?: boolean;
} = {}): GameState {
  const { techs = ['bronze-working'], mine = 'complete', outpost = true } = overrides;
  const tile = (q: number, r: number, extra: Record<string, unknown> = {}) => ({
    coord: { q, r }, terrain: 'hills', elevation: 'lowland', resource: null,
    improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: 'alpha', ...extra,
  });
  const tiles: Record<string, unknown> = {
    '2,2': tile(2, 2, { resource: 'iron', terrain: 'grassland' }),
    '3,2': tile(3, 2, {
      resource: 'iron',
      improvement: mine === 'none' ? 'none' : 'mine',
      improvementTurnsLeft: mine === 'incomplete' ? 2 : 0,
    }),
    '4,2': tile(4, 2, { resource: 'iron' }),
    '5,2': tile(5, 2, outpost
      ? { resource: 'iron', improvement: 'resource_outpost', owner: 'alpha' }
      : { resource: 'iron' }),
  };

  const city = (id: string, position: { q: number; r: number }, ownedTiles: Array<{ q: number; r: number }>) => ({
    id, name: id, owner: 'alpha', position, ownedTiles, workedTiles: [], buildings: [], productionQueue: [],
  });

  return {
    turn: 10,
    map: { tiles, width: 8, height: 4, wrapsHorizontally: false, rivers: [] },
    cities: {
      'alpha-city': city('alpha-city', { q: 2, r: 2 }, [{ q: 2, r: 2 }, { q: 3, r: 2 }, { q: 4, r: 2 }]),
      'alpha-second': city('alpha-second', { q: 0, r: 0 }, [{ q: 3, r: 2 }]),
    },
    civilizations: {
      alpha: {
        id: 'alpha', name: 'Alpha', color: '#888', isHuman: true, civType: 'generic', gold: 0,
        cities: ['alpha-city', 'alpha-second'], units: [],
        techState: { completed: [...techs], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility: { tiles: {}, fogMap: {} },
      },
      beta: {
        id: 'beta', name: 'Beta', color: '#f00', isHuman: false, civType: 'generic', gold: 0,
        cities: [], units: [],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
        diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        knownCivilizations: [], visibility: { tiles: {}, fogMap: {} },
      },
    },
    units: {}, minorCivs: {}, barbarianCamps: {},
    settings: { mapSize: 'small', opponentCount: 1, advisorsEnabled: {}, councilTalkLevel: 'normal' },
  } as unknown as GameState;
}

const iron = () => getResourceDefinition('iron')!;

describe('#1505 MR08 — the shared resource-source rule', () => {
  it('grants city-center access from technology alone but never counts it as a physical source', () => {
    const state = makeState({ outpost: false, mine: 'none' });

    expect(getCivAvailableResources(state, 'alpha').has('iron')).toBe(true);
    expect(listResourceSources(state, 'alpha')).toEqual([]);
    expect(getActiveResourceSourceCount(state, 'alpha', 'iron', { scope: 'empire' })).toBe(0);
  });

  it('requires a completed improvement for an off-center tile', () => {
    const complete = makeState({ outpost: false });
    expect(listResourceSources(complete, 'alpha').map(source => source.kind)).toContain('city-improvement');

    const unfinished = makeState({ outpost: false, mine: 'incomplete' });
    expect(listResourceSources(unfinished, 'alpha')).toEqual([]);
  });

  it('requires the reveal technology even when the tile is improved', () => {
    const noTech = makeState({ techs: [] });
    expect(getCivAvailableResources(noTech, 'alpha').has('iron')).toBe(false);
    expect(listResourceSources(noTech, 'alpha')).toEqual([]);
  });

  it('denies an occupied completed source', () => {
    const state = makeState({ outpost: false });
    state.units.raider = {
      id: 'raider', type: 'warrior', owner: 'barbarian', position: { q: 3, r: 2 }, health: 100,
      movementPointsLeft: 2, hasActed: false, hasMoved: false, isResting: false, experience: 0,
    } as never;

    expect(getResourceSourceKindAt(state, 'alpha', { q: 3, r: 2 }, iron(), {
      cityCenter: false, allowCityCenter: false,
    })).toBeNull();
  });

  it('counts a completed resource outpost as a physical source', () => {
    const state = makeState({ outpost: true });
    const sources = listResourceSources(state, 'alpha', { resource: 'iron' });
    expect(sources.some(source => source.kind === 'outpost' && source.coord.q === 5)).toBe(true);
    expect(isResourceOutpostSource(state, 'alpha', state.map.tiles['5,2'], iron())).toBe(true);
  });

  it('counts a tile once when two cities list it (parent §3.3)', () => {
    const state = makeState({ outpost: false });
    const sources = listResourceSources(state, 'alpha', { resource: 'iron' });
    const atShared = sources.filter(source => source.coord.q === 3 && source.coord.r === 2);
    expect(atShared).toHaveLength(1);
  });

  it('keeps the physically-owned meaning of getActiveResourceSourceCount (no city center, outposts yes)', () => {
    const state = makeState({ outpost: true });
    // one completed mine + one outpost; the city-center deposit does not count
    expect(getActiveResourceSourceCount(state, 'alpha', 'iron', { scope: 'empire' })).toBe(2);
    expect(getActiveResourceSourceCount(state, 'alpha', 'iron', { scope: 'host-city', cityId: 'alpha-city' })).toBe(1);
  });
});
