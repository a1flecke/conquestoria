import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { createEmptyPirateState, type PirateBehavior, type PirateFactionState } from '@/core/pirate-state';
import {
  assaultPirateEnclave,
  breakPirateTributeOnAttack,
  destroyPirateFaction,
  getEnclaveAssaultPreview,
  getPirateContractQuote,
  getPirateTributeQuote,
  hirePirateFlotilla,
  recordPirateContractRaid,
  refreshPirateTributeDemand,
  payPirateTribute,
} from '@/systems/pirate-actions';
import { getPirateBounty, getPirateTributeCost } from '@/systems/pirate-definitions';

function mapWith(entries: Array<[number, number, GameMap['tiles'][string]['terrain']]>): GameMap {
  return {
    width: 16,
    height: 16,
    wrapsHorizontally: false,
    rivers: [],
    tiles: Object.fromEntries(entries.map(([q, r, terrain]) => [`${q},${r}`, {
      coord: { q, r }, terrain, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    }])),
  };
}

function oceanAndEnclaveMap(): GameMap {
  const entries: Array<[number, number, 'ocean' | 'coast' | 'plains']> = [];
  for (let q = 0; q < 12; q++) {
    for (let r = 0; r < 12; r++) entries.push([q, r, 'ocean']);
  }
  entries.push([5, 5, 'plains']);
  entries.push([5, 4, 'coast']);
  return mapWith(entries);
}

function stateFixture(): GameState {
  const state = createNewGame(undefined, 'pirate-actions', 'small');
  state.turn = 20;
  state.map = oceanAndEnclaveMap();
  state.units = {};
  state.cities = {};
  state.pirates = createEmptyPirateState();
  for (const civ of Object.values(state.civilizations)) {
    civ.units = [];
    civ.cities = [];
    civ.gold = 500;
    civ.visibility = { tiles: {}, lastSeen: {} };
  }
  return state;
}

function addCity(state: GameState, id: string, owner: string, position: HexCoord): City {
  const value: City = {
    id, owner, position, name: id, population: 3, food: 0, foodNeeded: 15,
    buildings: ['marketplace'], productionQueue: [], productionProgress: 0,
    ownedTiles: [position], workedTiles: [], focus: 'balanced', maturity: 'town',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  state.cities[id] = value;
  state.civilizations[owner].cities.push(id);
  return value;
}

function addUnit(
  state: GameState,
  id: string,
  type: UnitType,
  owner: string,
  position: HexCoord,
  overrides: Partial<Unit> = {},
): Unit {
  const value: Unit = {
    id, type, owner, position, movementPointsLeft: 3, health: 100,
    experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  };
  state.units[id] = value;
  if (state.civilizations[owner]) state.civilizations[owner].units.push(id);
  return value;
}

function faction(
  behavior: PirateBehavior = 'raiding',
  headquarters: PirateFactionState['headquarters'] = {
    kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100,
  },
  stage: PirateFactionState['maritimeStage'] = 3,
): PirateFactionState {
  return {
    id: 'pirate-1', name: 'The Red Wake', spawnedRound: 4, behavior,
    maritimeStage: stage, notoriety: behavior === 'blockading' ? 5 : behavior === 'raiding' ? 2 : 0,
    shipIds: [], headquarters, tributeByCiv: {}, demandByCiv: {}, contract: null,
    intent: null, transitionGuards: { emittedEventKeys: [] },
  };
}

function addFaction(state: GameState, value = faction()): PirateFactionState {
  state.pirates!.factions[value.id] = value;
  return value;
}

function revealKnownCoastalTarget(state: GameState): void {
  state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
  addCity(state, 'target-port', 'ai-1', { q: 8, r: 8 });
  state.map.tiles['8,8'] = { ...state.map.tiles['8,8'], terrain: 'plains' };
  state.map.tiles['8,7'] = { ...state.map.tiles['8,7'], terrain: 'coast' };
  state.civilizations.player.visibility.tiles['8,8'] = 'fog';
}

describe('pirate tribute', () => {
  it('quotes behavior plus stage surcharge and refuses payment that would create debt', () => {
    for (const [behavior, stage] of [
      ['patrolling', 1], ['raiding', 3], ['blockading', 5],
    ] as const) {
      const state = stateFixture();
      const current = addFaction(state, faction(behavior, undefined, stage));
      current.demandByCiv.player = { demandedRound: state.turn, lastReminderRound: state.turn, quotedCost: 0 };
      const quote = getPirateTributeQuote(state, current.id, 'player');
      expect(quote.cost).toBe(getPirateTributeCost(behavior, stage));
    }

    const state = stateFixture();
    const current = addFaction(state);
    current.demandByCiv.player = { demandedRound: state.turn, lastReminderRound: state.turn, quotedCost: 40 };
    state.civilizations.player.gold = 39;
    const result = payPirateTribute(state, current.id, 'player');
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/gold/i);
    expect(result.state).toBe(state);
  });

  it('protects for 15 completed rounds and cancels a pending raid or blockade intent immediately', () => {
    const state = stateFixture();
    const current = addFaction(state);
    current.demandByCiv.player = { demandedRound: state.turn, lastReminderRound: state.turn, quotedCost: 40 };
    current.intent = { kind: 'blockade', targetCivId: 'player', targetCityId: 'port', plannedRound: state.turn };

    const result = payPirateTribute(state, current.id, 'player');

    expect(result.success).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(500 - getPirateTributeCost('raiding', 3));
    expect(result.state.pirates!.factions[current.id].tributeByCiv.player).toEqual({
      paidRound: 20,
      protectedUntilRound: 35,
    });
    expect(result.state.pirates!.factions[current.id].intent).toBeNull();
    expect(result.state.pirates!.factions[current.id].demandByCiv.player).toBeUndefined();
  });

  it('ends only the attacked faction protection when the payer attacks', () => {
    const state = stateFixture();
    const current = addFaction(state);
    current.tributeByCiv.player = { paidRound: 10, protectedUntilRound: 30 };
    const other = { ...faction(), id: 'pirate-2' as const, name: 'The Black Current' };
    other.tributeByCiv = { player: { paidRound: 10, protectedUntilRound: 30 } };
    state.pirates!.factions[other.id] = other;

    const next = breakPirateTributeOnAttack(state, current.id, 'player');

    expect(next.pirates!.factions[current.id].tributeByCiv.player).toBeUndefined();
    expect(next.pirates!.factions[other.id].tributeByCiv.player).toBeDefined();
  });

  it('creates one demand only for positive projected income and reminds no more often than every eight rounds', () => {
    const state = stateFixture();
    addCity(state, 'port', 'player', { q: 2, r: 2 });
    const current = addFaction(state);

    const first = refreshPirateTributeDemand(state, current.id, 'player');
    expect(first.created).toBe(true);
    expect(first.reminderDue).toBe(true);

    const duplicate = refreshPirateTributeDemand({ ...first.state, turn: 27 }, current.id, 'player');
    expect(duplicate.created).toBe(false);
    expect(duplicate.reminderDue).toBe(false);
    const reminder = refreshPirateTributeDemand({ ...first.state, turn: 28 }, current.id, 'player');
    expect(reminder.created).toBe(false);
    expect(reminder.reminderDue).toBe(true);

    const noIncome = stateFixture();
    noIncome.civilizations.player.gold = 0;
    const noIncomeFaction = addFaction(noIncome);
    expect(refreshPirateTributeDemand(noIncome, noIncomeFaction.id, 'player').state).toBe(noIncome);
  });
});

describe('pirate contracts', () => {
  it('requires a Stage 5 flotilla and a living known rival with earned coastal or naval sighting', () => {
    const state = stateFixture();
    const current = addFaction(state, faction('raiding', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: { planned: null, lastRelocatedRound: null },
    }, 5));
    addUnit(state, 'flagship', 'pirate_mothership', current.id, { q: 4, r: 4 });

    expect(getPirateContractQuote(state, current.id, 'player', 'ai-1').available).toBe(false);
    revealKnownCoastalTarget(state);
    expect(getPirateContractQuote(state, current.id, 'player', 'ai-1').available).toBe(true);

    current.maritimeStage = 4;
    expect(getPirateContractQuote(state, current.id, 'player', 'ai-1').available).toBe(false);
    current.maritimeStage = 5;
    current.headquarters = { kind: 'coastal-enclave', position: { q: 5, r: 5 }, integrity: 100, maxIntegrity: 100 };
    expect(getPirateContractQuote(state, current.id, 'player', 'ai-1').available).toBe(false);
  });

  it('costs twice tribute, lasts eight rounds, and is mutually exclusive with tribute', () => {
    const state = stateFixture();
    const current = addFaction(state, faction('blockading', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: { planned: null, lastRelocatedRound: null },
    }, 5));
    addUnit(state, 'flagship', 'pirate_mothership', current.id, { q: 4, r: 4 });
    revealKnownCoastalTarget(state);

    const quote = getPirateContractQuote(state, current.id, 'player', 'ai-1');
    expect(quote.cost).toBe(getPirateTributeCost('blockading', 5) * 2);
    expect(quote.durationRounds).toBe(8);
    const hired = hirePirateFlotilla(state, current.id, 'player', 'ai-1');
    expect(hired.success).toBe(true);
    expect(hired.state.pirates!.factions[current.id].contract).toMatchObject({
      employerId: 'player', targetId: 'ai-1', startedRound: 20, expiresAfterRound: 28,
    });
    expect(getPirateTributeQuote(hired.state, current.id, 'player').available).toBe(false);

    const protectedState = stateFixture();
    const protectedFaction = addFaction(protectedState, faction('raiding', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: { planned: null, lastRelocatedRound: null },
    }, 5));
    addUnit(protectedState, 'flagship', 'pirate_mothership', protectedFaction.id, { q: 4, r: 4 });
    revealKnownCoastalTarget(protectedState);
    protectedFaction.tributeByCiv.player = { paidRound: 10, protectedUntilRound: 30 };
    expect(getPirateContractQuote(protectedState, protectedFaction.id, 'player', 'ai-1').available).toBe(false);
  });

  it('rolls exposure once per successful raid, penalizes only the target opinion, and creates no war', () => {
    let state = stateFixture();
    const current = addFaction(state, faction('raiding', {
      kind: 'deep-sea-flotilla', flagshipUnitId: 'flagship', relocation: { planned: null, lastRelocatedRound: null },
    }, 5));
    current.contract = {
      employerId: 'player', targetId: 'ai-1', startedRound: 12, expiresAfterRound: 28,
      successfulRaidCount: 0, exposed: false, exposureResolvedRaidKeys: [],
    };
    state.civilizations['ai-1'].diplomacy.relationships.player = 10;

    let exposedResult: ReturnType<typeof recordPirateContractRaid> | undefined;
    for (let index = 0; index < 100 && !exposedResult?.exposed; index++) {
      const result = recordPirateContractRaid(state, current.id, `raid-${index}`);
      state = result.state;
      if (result.exposed) exposedResult = result;
    }
    expect(exposedResult?.exposed).toBe(true);
    expect(state.civilizations['ai-1'].diplomacy.relationships.player).toBe(-20);
    expect(state.civilizations['ai-1'].diplomacy.atWarWith).not.toContain('player');
    expect(state.civilizations.player.diplomacy.atWarWith).not.toContain('ai-1');
    expect(state.civilizations['ai-1'].diplomacy.events.at(-1)).toMatchObject({
      type: 'pirate_contract_exposed', otherCiv: 'player', weight: -30,
    });
    expect(state.notificationLog!['ai-1'].at(-1)?.message).toMatch(/employer/i);
    expect(state.notificationLog!.player.at(-1)?.message).toMatch(/exposed/i);

    const raidsBefore = state.pirates!.factions[current.id].contract!.successfulRaidCount;
    const duplicate = recordPirateContractRaid(state, current.id, state.pirates!.factions[current.id].contract!.exposureResolvedRaidKeys[0]);
    expect(duplicate.state).toBe(state);
    expect(duplicate.state.pirates!.factions[current.id].contract!.successfulRaidCount).toBe(raidsBefore);
  });
});

describe('enclave assault and canonical destruction', () => {
  it('requires an exposed enclave and an adjacent available major combat naval unit', () => {
    const state = stateFixture();
    const current = addFaction(state);
    addUnit(state, 'attacker', 'galley', 'player', { q: 5, r: 4 });
    addUnit(state, 'guard', 'pirate_corsair', current.id, { q: 4, r: 5 });
    current.shipIds = ['guard'];
    expect(getEnclaveAssaultPreview(state, current.id, 'attacker').available).toBe(false);

    delete state.units.guard;
    current.shipIds = [];
    expect(getEnclaveAssaultPreview(state, current.id, 'attacker').available).toBe(true);
    state.units.attacker.hasActed = true;
    expect(getEnclaveAssaultPreview(state, current.id, 'attacker').available).toBe(false);
    state.units.attacker.hasActed = false;
    state.units.attacker.type = 'transport';
    expect(getEnclaveAssaultPreview(state, current.id, 'attacker').available).toBe(false);
  });

  it('uses one deterministic preview for damage and Tier 2/3 counterfire', () => {
    for (const behavior of ['patrolling', 'raiding', 'blockading'] as const) {
      const state = stateFixture();
      const current = addFaction(state, faction(behavior));
      addUnit(state, 'attacker', 'trireme', 'player', { q: 5, r: 4 });
      const preview = getEnclaveAssaultPreview(state, current.id, 'attacker');
      const result = assaultPirateEnclave(state, current.id, 'attacker');
      expect(result.success).toBe(true);
      expect(result.damageToHeadquarters).toBe(preview.damageToHeadquarters);
      expect(result.counterfireDamage).toBe(preview.counterfireDamage);
      expect(result.state.pirates!.factions[current.id].headquarters).toMatchObject({
        integrity: 100 - preview.damageToHeadquarters,
      });
      expect(result.state.units.attacker.health).toBe(100 - preview.counterfireDamage);
      expect(result.state.units.attacker).toMatchObject({ hasActed: true, movementPointsLeft: 0 });
      expect(preview.counterfireDamage === 0).toBe(behavior === 'patrolling');
    }
  });

  it('destroys an enclave through the canonical helper and does not duplicate side effects', () => {
    const state = stateFixture();
    const current = addFaction(state, faction('blockading'));
    current.headquarters = { ...current.headquarters, integrity: 1 } as PirateFactionState['headquarters'];
    addUnit(state, 'attacker', 'trireme', 'player', { q: 5, r: 4 });
    state.pirates!.intelByCiv.player = { [current.id]: {
      factionId: current.id, level: 'sighted', discoveredRound: 10, lastUpdatedRound: 20,
    } };

    const result = assaultPirateEnclave(state, current.id, 'attacker');
    const bounty = getPirateBounty('blockading', 3);
    expect(result.destroyed).toBe(true);
    expect(result.state.pirates!.factions[current.id]).toBeUndefined();
    expect(result.state.civilizations.player.gold).toBe(500 + bounty);
    expect(result.state.pirates!.history.filter(entry => entry.kind === 'destroyed')).toHaveLength(1);
    expect(result.state.pirates!.pressure.suppression).toHaveLength(1);
    expect(result.events.filter(event => event.type === 'faction-destroyed')).toHaveLength(1);

    const repeated = destroyPirateFaction(result.state, {
      factionId: current.id, destroyedByOwnerId: 'player', reason: 'enclave-assault',
    });
    expect(repeated.destroyed).toBe(false);
    expect(repeated.state).toBe(result.state);
    expect(repeated.events).toEqual([]);
    expect(repeated.state.civilizations.player.gold).toBe(500 + bounty);
    expect(repeated.state.pirates!.history.filter(entry => entry.kind === 'destroyed')).toHaveLength(1);
    expect(repeated.state.pirates!.pressure.suppression).toHaveLength(1);
  });

  it('awards behavior and stage bounty only to a major civilization destroyer', () => {
    for (const [behavior, expectedBase] of [
      ['patrolling', 10], ['raiding', 25], ['blockading', 45],
    ] as const) {
      const state = stateFixture();
      const current = addFaction(state, faction(behavior, undefined, 4));
      const major = destroyPirateFaction(state, {
        factionId: current.id, destroyedByOwnerId: 'player', reason: 'combat', position: { q: 5, r: 5 },
      });
      expect(major.bountyAwarded).toBe(expectedBase + 20);
    }

    const state = stateFixture();
    const current = addFaction(state);
    const autonomous = destroyPirateFaction(state, {
      factionId: current.id, destroyedByOwnerId: 'beasts', reason: 'combat', position: { q: 5, r: 5 },
    });
    expect(autonomous.bountyAwarded).toBe(0);
  });
});
