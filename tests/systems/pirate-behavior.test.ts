import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';
import {
  applyPlannedRelocation,
  choosePirateIntent,
  derivePirateBlockades,
  derivePirateRaids,
  getRelocationDirectionForViewer,
  isTransportEscorted,
  planFlotillaRelocation,
} from '@/systems/pirate-behavior';

function mapWith(entries: Array<[number, number, GameMap['tiles'][string]['terrain']]>, width = 20): GameMap {
  return {
    width,
    height: 20,
    wrapsHorizontally: false,
    rivers: [],
    tiles: Object.fromEntries(entries.map(([q, r, terrain]) => [`${q},${r}`, {
      coord: { q, r }, terrain, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    }])),
  };
}

function oceanGrid(min = 0, max = 14): GameMap {
  const entries: Array<[number, number, 'ocean']> = [];
  for (let q = min; q <= max; q++) {
    for (let r = min; r <= max; r++) entries.push([q, r, 'ocean']);
  }
  return mapWith(entries, max + 1);
}

function stateWithMap(map: GameMap): GameState {
  const state = createNewGame(undefined, 'pirate-behavior', 'large');
  state.map = map;
  state.units = {};
  state.cities = {};
  state.pirates = createEmptyPirateState();
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
    civ.gold = 50;
    civ.visibility = { tiles: {}, lastSeen: {} };
  }
  return state;
}

function unit(id: string, type: UnitType, owner: string, position: HexCoord): Unit {
  return {
    id, type, owner, position, movementPointsLeft: 4, health: 100,
    experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...(type === 'transport' ? { cargoUnitIds: [] } : {}),
  };
}

function addUnit(state: GameState, value: Unit): void {
  state.units[value.id] = value;
  if (state.civilizations[value.owner]) state.civilizations[value.owner].units.push(value.id);
}

function city(state: GameState, id: string, owner: string, position: HexCoord): City {
  const value: City = {
    id, owner, position, name: id, population: 2, food: 0, foodNeeded: 15,
    buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [position],
    workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  state.cities[id] = value;
  state.civilizations[owner].cities.push(id);
  return value;
}

function faction(
  id: `pirate-${number}`,
  behavior: PirateFactionState['behavior'],
  headquarters: PirateFactionState['headquarters'],
  shipIds: string[],
  stage: PirateFactionState['maritimeStage'] = 3,
): PirateFactionState {
  return {
    id, name: id, spawnedRound: 1, behavior, maritimeStage: stage,
    notoriety: behavior === 'blockading' ? 5 : behavior === 'raiding' ? 2 : 0,
    shipIds, headquarters, tributeByCiv: {}, demandByCiv: {}, contract: null,
    intent: null, transitionGuards: { emittedEventKeys: [] },
  };
}

describe('pirate escort and targeting', () => {
  it('ignores targets outside the bounded naval search neighborhood', () => {
    const state = stateWithMap(oceanGrid(0, 60));
    addUnit(state, unit('pirate', 'pirate_frigate', 'pirate-1', { q: 1, r: 1 }));
    addUnit(state, unit('distant-transport', 'transport', 'player', { q: 50, r: 50 }));
    state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'pirate',
      relocation: { planned: null, lastRelocatedRound: null },
    }, ['pirate']);

    expect(choosePirateIntent(state, 'pirate-1')).toBeNull();
  });

  it('requires a same-tile or adjacent friendly combat-capable naval escort', () => {
    const state = stateWithMap(oceanGrid());
    const transport = unit('transport', 'transport', 'player', { q: 5, r: 5 });
    addUnit(state, transport);
    addUnit(state, unit('land', 'warrior', 'player', { q: 5, r: 4 }));
    addUnit(state, unit('civilian-ship', 'carrack', 'player', { q: 6, r: 5 }));
    addUnit(state, unit('far-warship', 'galley', 'player', { q: 7, r: 5 }));
    expect(isTransportEscorted(state, transport)).toBe(false);

    addUnit(state, unit('escort', 'galley', 'player', { q: 5, r: 6 }));
    expect(isTransportEscorted(state, transport)).toBe(true);
    state.units.escort.position = { ...transport.position };
    expect(isTransportEscorted(state, transport)).toBe(true);
  });

  it('prioritizes unescorted transports, then coastal cities, hostile naval units, and Tier 3 escorted transports', () => {
    const state = stateWithMap(oceanGrid());
    addUnit(state, unit('pirate', 'pirate_frigate', 'pirate-1', { q: 1, r: 1 }));
    addUnit(state, unit('transport', 'transport', 'player', { q: 10, r: 10 }));
    addUnit(state, unit('enemy-warship', 'galley', 'ai-1', { q: 2, r: 1 }));
    addUnit(state, unit('independent-warship', 'galley', 'player', { q: 3, r: 2 }));
    city(state, 'port', 'ai-1', { q: 5, r: 5 });
    state.map.tiles['5,5'] = { ...state.map.tiles['5,5'], terrain: 'plains' };
    state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
      kind: 'coastal-enclave', position: { q: 0, r: 0 }, integrity: 100, maxIntegrity: 100,
    }, ['pirate']);

    expect(choosePirateIntent(state, 'pirate-1')).toMatchObject({ kind: 'raid', targetUnitId: 'transport' });
    addUnit(state, unit('escort', 'galley', 'player', { q: 10, r: 9 }));
    expect(choosePirateIntent(state, 'pirate-1')).toMatchObject({
      kind: 'raid', targetCityId: 'port', targetCivId: 'ai-1',
    });

    state.pirates!.factions['pirate-1'].tributeByCiv['ai-1'] = { paidRound: 1, protectedUntilRound: 20 };
    expect(choosePirateIntent(state, 'pirate-1')).toMatchObject({ kind: 'raid', targetUnitId: 'independent-warship' });
    delete state.units['independent-warship'];
    expect(choosePirateIntent(state, 'pirate-1')).toBeNull();
    state.pirates!.factions['pirate-1'].behavior = 'blockading';
    expect(choosePirateIntent(state, 'pirate-1')).toMatchObject({ kind: 'raid', targetUnitId: 'transport' });
  });
});

describe('pirate raids and blockades', () => {
  it('derives at most one raid per faction and caps total plunder by stage and available treasury', () => {
    const state = stateWithMap(oceanGrid());
    state.civilizations.player.gold = 7;
    city(state, 'port', 'player', { q: 5, r: 5 });
    state.map.tiles['5,5'] = { ...state.map.tiles['5,5'], terrain: 'plains' };
    addUnit(state, unit('p1', 'pirate_galley', 'pirate-1', { q: 5, r: 4 }));
    addUnit(state, unit('p2', 'pirate_corsair', 'pirate-2', { q: 6, r: 5 }));
    state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['p1'], 1);
    state.pirates!.factions['pirate-2'] = faction('pirate-2', 'raiding', {
      kind: 'coastal-enclave', position: { q: 2, r: 2 }, integrity: 100, maxIntegrity: 100,
    }, ['p2'], 2);

    const raids = derivePirateRaids(state, {
      movements: [], attacks: [],
      transportKills: [{ factionId: 'pirate-1', victimCivId: 'player', unitId: 'lost-transport' }],
    });
    expect(raids.filter(raid => raid.factionId === 'pirate-1')).toHaveLength(1);
    expect(raids.map(raid => raid.amount)).toEqual([5, 2]);
    expect(raids.reduce((sum, raid) => sum + raid.amount, 0)).toBe(7);
  });

  it('uses every maritime-stage plunder cap and skips protected victims', () => {
    const expectedCaps = [5, 8, 12, 16, 20];
    for (const [index, expected] of expectedCaps.entries()) {
      const state = stateWithMap(oceanGrid());
      state.civilizations.player.gold = 100;
      city(state, 'port', 'player', { q: 5, r: 5 });
      state.map.tiles['5,5'] = { ...state.map.tiles['5,5'], terrain: 'plains' };
      addUnit(state, unit('pirate', 'pirate_galley', 'pirate-1', { q: 5, r: 4 }));
      state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
        kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
      }, ['pirate'], (index + 1) as PirateFactionState['maritimeStage']);
      expect(derivePirateRaids(state, { movements: [], attacks: [], transportKills: [] })[0].amount).toBe(expected);
      state.pirates!.factions['pirate-1'].tributeByCiv.player = { paidRound: 1, protectedUntilRound: 20 };
      expect(derivePirateRaids(state, { movements: [], attacks: [], transportKills: [] })).toEqual([]);
    }
  });

  it('requires every blockade condition and removes protection or contract-invalid targets immediately', () => {
    const state = stateWithMap(oceanGrid());
    city(state, 'port', 'player', { q: 5, r: 5 });
    state.map.tiles['5,5'] = { ...state.map.tiles['5,5'], terrain: 'plains' };
    addUnit(state, unit('adjacent', 'pirate_corsair', 'pirate-1', { q: 5, r: 4 }));
    addUnit(state, unit('nearby', 'pirate_corsair', 'pirate-1', { q: 7, r: 4 }));
    state.pirates!.factions['pirate-1'] = faction('pirate-1', 'blockading', {
      kind: 'coastal-enclave', position: { q: 1, r: 1 }, integrity: 100, maxIntegrity: 100,
    }, ['adjacent', 'nearby']);

    expect(derivePirateBlockades(state)).toEqual([{ factionId: 'pirate-1', cityId: 'port', victimCivId: 'player' }]);
    state.units.nearby.position = { q: 10, r: 10 };
    expect(derivePirateBlockades(state)).toEqual([]);
    state.units.nearby.position = { q: 6, r: 4 };
    state.pirates!.factions['pirate-1'].tributeByCiv.player = { paidRound: 1, protectedUntilRound: 20 };
    expect(derivePirateBlockades(state)).toEqual([]);
    delete state.pirates!.factions['pirate-1'].tributeByCiv.player;
    state.pirates!.factions['pirate-1'].maritimeStage = 5;
    state.pirates!.factions['pirate-1'].contract = {
      employerId: 'ai-1', targetId: 'ai-1', startedRound: 1, expiresAfterRound: 20,
      successfulRaidCount: 0, exposed: false, exposureResolvedRaidKeys: [],
    };
    expect(derivePirateBlockades(state)).toEqual([]);
    state.pirates!.factions['pirate-1'].contract = null;
    state.pirates!.factions['pirate-1'].behavior = 'raiding';
    expect(derivePirateBlockades(state)).toEqual([]);
  });
});

describe('flotilla relocation', () => {
  it('plans a contiguous two-to-four-hex ocean move and relocates the nearby formation atomically', () => {
    const state = stateWithMap(oceanGrid());
    state.turn = 4;
    addUnit(state, unit('flagship', 'pirate_frigate', 'pirate-1', { q: 6, r: 6 }));
    addUnit(state, unit('escort', 'pirate_corsair', 'pirate-1', { q: 6, r: 7 }));
    state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: { planned: null, lastRelocatedRound: null },
    }, ['flagship', 'escort']);

    const plan = planFlotillaRelocation(state, 'pirate-1');
    expect(plan?.path.length).toBeGreaterThanOrEqual(2);
    expect(plan?.path.length).toBeLessThanOrEqual(4);
    expect(plan?.plannedRound).toBe(4);
    expect(plan?.resolvesOnRound).toBe(5);
    state.pirates!.factions['pirate-1'].headquarters = {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship',
      relocation: { planned: plan, lastRelocatedRound: null },
    };
    const beforeOffset = {
      q: state.units.escort.position.q - state.units.flagship.position.q,
      r: state.units.escort.position.r - state.units.flagship.position.r,
    };
    const result = applyPlannedRelocation({ ...state, turn: 5 }, 'pirate-1');

    expect(result.facts.relocation).toMatchObject({ status: 'moved', factionId: 'pirate-1' });
    expect(result.state.units.flagship.position).toEqual(plan!.path.at(-1));
    expect({
      q: result.state.units.escort.position.q - result.state.units.flagship.position.q,
      r: result.state.units.escort.position.r - result.state.units.flagship.position.r,
    }).toEqual(beforeOffset);
    expect(result.state.units.flagship).toMatchObject({ movementPointsLeft: 0, hasMoved: true, hasActed: true });
    expect(result.state.units.escort).toMatchObject({ movementPointsLeft: 0, hasMoved: true, hasActed: true });
  });

  it('cancels relocation after a flagship attack, adjacent hostile warship, or failed formation placement', () => {
    const makeDue = () => {
      const state = stateWithMap(oceanGrid());
      state.turn = 5;
      addUnit(state, unit('flagship', 'pirate_frigate', 'pirate-1', { q: 6, r: 6 }));
      addUnit(state, unit('escort', 'pirate_corsair', 'pirate-1', { q: 6, r: 7 }));
      state.pirates!.factions['pirate-1'] = faction('pirate-1', 'raiding', {
        kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: {
          planned: { plannedRound: 4, resolvesOnRound: 5, direction: 'north', path: [{ q: 6, r: 5 }, { q: 6, r: 4 }] },
          lastRelocatedRound: null,
        },
      }, ['flagship', 'escort']);
      return state;
    };

    const attacked = makeDue();
    attacked.pirates!.factions['pirate-1'].transitionGuards.lastFlagshipAttackedRound = 4;
    expect(applyPlannedRelocation(attacked, 'pirate-1').facts.relocation.status).toBe('cancelled');

    const threatened = makeDue();
    addUnit(threatened, unit('hostile', 'galley', 'player', { q: 5, r: 6 }));
    expect(applyPlannedRelocation(threatened, 'pirate-1').facts.relocation.status).toBe('cancelled');

    const blocked = makeDue();
    addUnit(blocked, unit('stationary', 'pirate_galley', 'pirate-2', { q: 6, r: 5 }));
    expect(applyPlannedRelocation(blocked, 'pirate-1').facts.relocation.status).toBe('cancelled');
  });

  it('reveals a relocation direction only through tracked viewer intel', () => {
    const state = stateWithMap(oceanGrid());
    state.pirates!.intelByCiv.player = {
      'pirate-1': {
        factionId: 'pirate-1', level: 'rumor', discoveredRound: 1, lastUpdatedRound: 1,
        approximateRegion: { center: { q: 5, r: 5 }, radius: 4 },
      },
    };
    expect(getRelocationDirectionForViewer(state, 'player', 'pirate-1')).toBeNull();
    state.pirates!.intelByCiv.player['pirate-1'] = {
      factionId: 'pirate-1', level: 'tracked', discoveredRound: 1, lastUpdatedRound: 4,
      lastKnownHeadquarters: { kind: 'deep-sea-flotilla', position: { q: 5, r: 5 }, observedRound: 4 },
      plannedRelocationDirection: 'south-east',
    };
    expect(getRelocationDirectionForViewer(state, 'player', 'pirate-1')).toBe('south-east');
    expect(getRelocationDirectionForViewer(state, 'ai-1', 'pirate-1')).toBeNull();
  });
});
