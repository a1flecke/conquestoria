import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, HexCoord, TerrainType as Terrain } from '@/core/types';
import { processEspionageTurn } from '@/systems/espionage-system';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { createUnit } from '@/systems/unit-lifecycle';
import { assertNoIllegalBlockingOccupancy } from '../helpers/save-state-invariants';

// Arms smuggling arms a rebel band next to the target city. It used to pick one of the six
// neighbours at random and spawn there if the tile merely existed: on ocean, on a mountain, on a
// barbarian camp, or on top of the target civ's own units (a mixed-owner stack).

const CITY: HexCoord = { q: 5, r: 5 };

function tile(q: number, r: number, terrain: Terrain) {
  return {
    coord: { q, r }, terrain, elevation: 'lowland', resource: null, improvement: 'none',
    owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function makeState(turn: number, neighbours: Record<string, Terrain>): GameState {
  const ids = ['player', 'rival'];
  const tiles: Record<string, ReturnType<typeof tile>> = { '5,5': tile(5, 5, 'plains'), '0,0': tile(0, 0, 'plains') };
  for (const [key, terrain] of Object.entries(neighbours)) {
    const [q, r] = key.split(',').map(Number);
    tiles[key] = tile(q, r, terrain);
  }
  const idCounters = { nextUnitId: 100, nextCityId: 10, nextCampId: 10, nextQuestId: 1 } as GameState['idCounters'];
  const guard = createUnit('warrior', 'rival', { q: 6, r: 5 }, idCounters);
  return {
    turn,
    era: 5,
    currentPlayer: 'player',
    idCounters,
    map: { width: 12, height: 12, tiles, wrapsHorizontally: false, rivers: [] },
    units: { [guard.id]: guard },
    barbarianCamps: {
      'camp-1': { id: 'camp-1', position: { q: 6, r: 4 }, strength: 3, spawnCooldown: 5 },
    },
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player', position: { q: 0, r: 0 }, population: 4,
        food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-rival-1': {
        id: 'city-rival-1', name: 'Carthage', owner: 'rival', position: CITY, population: 4,
        food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [CITY], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Rome', isHuman: true, civType: 'rome', cities: ['city-player-1'], units: [],
        techState: { completed: ['covert-operations'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, knownCivilizations: ['rival'], score: 0,
        diplomacy: createDiplomacyState(ids, 'player'),
      },
      rival: {
        id: 'rival', name: 'Carthage', isHuman: false, civType: 'egypt', cities: ['city-rival-1'], units: [guard.id],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, knownCivilizations: ['player'], score: 0,
        diplomacy: createDiplomacyState(ids, 'rival'),
      },
    },
    espionage: {
      player: {
        spies: {
          'spy-1': {
            id: 'spy-1', owner: 'player', name: 'Agent Echo', unitType: 'spy_agent',
            targetCivId: 'rival', targetCityId: 'city-rival-1', position: CITY,
            status: 'on_mission', experience: 100, promotion: 'infiltrator',
            currentMission: { type: 'arms_smuggling', turnsRemaining: 1, turnsTotal: 4, targetCivId: 'rival', targetCityId: 'city-rival-1' },
            cooldownTurns: 0, promotionAvailable: false, feedsFalseIntel: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
      rival: { spies: {}, maxSpies: 1, counterIntelligence: {} },
    },
    settings: {} as GameState['settings'],
  } as unknown as GameState;
}

function succeededTurns(neighbours: Record<string, Terrain>): Array<{ turn: number; next: GameState }> {
  const runs: Array<{ turn: number; next: GameState }> = [];
  for (let turn = 1; turn <= 60; turn++) {
    const state = makeState(turn, neighbours);
    const bus = new EventBus();
    let succeeded = false;
    bus.on('espionage:mission-succeeded', () => { succeeded = true; });
    const next = processEspionageTurn(state, bus);
    if (succeeded) runs.push({ turn, next });
  }
  return runs;
}

const rebelsOf = (state: GameState) => Object.values(state.units).filter(unit => unit.owner === 'rebels');

describe('arms_smuggling rebel spawn legality', () => {
  // One legal neighbour: (4,6). The rest are water, a mountain, the rival's guard and a camp.
  const neighbours: Record<string, Terrain> = {
    '6,5': 'plains', // rival warrior
    '4,5': 'ocean',
    '5,6': 'ocean',
    '5,4': 'coast',
    '6,4': 'plains', // barbarian camp
    '4,6': 'grassland',
  };

  it('only ever arms the rebels on a tile a land unit could legally stand on', () => {
    const runs = succeededTurns(neighbours);
    expect(runs.length).toBeGreaterThan(3);
    for (const { turn, next } of runs) {
      const rebels = rebelsOf(next);
      expect(rebels.map(unit => unit.position), `turn ${turn}`).toEqual([{ q: 4, r: 6 }]);
      assertNoIllegalBlockingOccupancy(next);
    }
  });

  it('spawns nothing when no neighbouring tile is legal', () => {
    const runs = succeededTurns({ ...neighbours, '4,6': 'ocean' });
    expect(runs.length).toBeGreaterThan(3);
    for (const { next } of runs) expect(rebelsOf(next)).toEqual([]);
  });

});
