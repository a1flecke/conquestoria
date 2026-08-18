import { describe, it, expect } from 'vitest';
import {
  applyUnitUpgradeToState,
  canUpgradeUnit,
  getUpgradeCost,
  applyUpgrade,
  evaluateUnitUpgrade,
} from '@/systems/unit-upgrade-system';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState, ResourceType, Spy, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { TRAINABLE_UNITS, foundCity } from '@/systems/city-system';
import { TECH_TREE } from '@/systems/tech-definitions';
import { createMarketplaceState } from '@/systems/trade-system';

const TECH_ERA_BY_ID = new Map(TECH_TREE.map(tech => [tech.id, tech.era]));

function makeUnit(type: string, position = { q: 0, r: 0 }): Unit {
  return { id: 'u1', type: type as any, owner: 'player', position, health: 70, movementPointsLeft: 2, hasActed: false, hasMoved: false, experience: 0, isResting: false };
}

describe('canUpgradeUnit', () => {
  it('spy_scout upgrades to spy_informant when espionage-informants researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('spy_informant');
  });

  it('spy_scout does not upgrade when espionage-informants not researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting']);
    expect(result.canUpgrade).toBe(false);
  });

  it('cannot upgrade unit not standing on the city tile', () => {
    const unit = makeUnit('spy_scout', { q: 5, r: 5 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(false);
  });

  it('reports canUpgrade:false when civGold is below cost', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants'], 10);
    expect(result.canUpgrade).toBe(false);
  });

  it('reports canUpgrade:true when civGold exactly meets cost', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants'], 25);
    expect(result.canUpgrade).toBe(true);
    expect(result.cost).toBe(25);
  });

  it('allows upgrading an Operative to an Intelligence Officer once covert-operations is researched', () => {
    const unit = makeUnit('spy_operative', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['cryptography', 'covert-operations'], 200);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('spy_intelligence_officer');
    expect(result.cost).toBe(70); // 50% of Intelligence Officer's 140 production cost
  });
});

describe('explicit upgrade chains', () => {
  it('Knight upgrades only to Cuirassier when both technologies and resources are present', () => {
    const knight = makeUnit('knight');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;

    expect(canUpgradeUnit(
      knight, city.id, { [city.id]: city },
      ['iron-forging', 'rifle-tactics'], undefined,
      new Set<ResourceType>(['horses', 'iron']),
    ).targetType).toBeNull();
    expect(canUpgradeUnit(
      knight, city.id, { [city.id]: city },
      ['iron-forging', 'rifle-tactics', 'professional-army'], undefined,
      new Set<ResourceType>(['horses', 'iron']),
    ).targetType).toBe('cuirassier');
  });

  it('#855: no longer leapfrogs cryptography+cyber-warfare straight to spy_hacker', () => {
    // Before the #855 plateau fix, spy_operative's obsoletedByTech was 'cyber-warfare'
    // directly, so a civ with only cryptography+cyber-warfare (skipping every intermediate
    // espionage tech) could upgrade straight to spy_hacker. The chain now routes through
    // spy_intelligence_officer (gated on covert-operations) — this is the fix working as
    // intended, not a regression. See 'allows upgrading an Operative to an Intelligence
    // Officer...' above for the new intended path.
    const unit = makeUnit('spy_operative');

    const result = canUpgradeUnit(
      unit,
      'c1',
      { c1: { id: 'c1', owner: 'player', position: unit.position } as any },
      ['cryptography', 'cyber-warfare'],
    );

    expect(result.targetType).toBeNull();
  });

  it('does not infer cross-role upgrades merely because a tech ID matches', () => {
    const steamship = makeUnit('steamship');
    const tank = makeUnit('tank');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;

    expect(canUpgradeUnit(
      steamship,
      city.id,
      { [city.id]: city },
      ['caravels', 'ironclad-warships'],
    ).targetType).toBeNull();
    // Terminal unit (no obsoletedByTech/upgradesTo) — researching a later tech must not
    // conjure an upgrade target out of thin air.
    expect(canUpgradeUnit(
      tank,
      city.id,
      { [city.id]: city },
      ['tank-warfare', 'armored-tactics'],
    ).targetType).toBeNull();
  });

  it('archer -> crossbowman upgrade is blocked without Copper (negative), allowed with Copper', () => {
    const archer = makeUnit('archer');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;

    const withoutCopper = canUpgradeUnit(
      archer,
      city.id,
      { [city.id]: city },
      ['tactics'],
      undefined,
      new Set<ResourceType>(),
    );
    expect(withoutCopper.targetType).toBeNull();

    const withCopper = canUpgradeUnit(
      archer,
      city.id,
      { [city.id]: city },
      ['tactics'],
      undefined,
      new Set<ResourceType>(['copper']),
    );
    expect(withCopper.targetType).toBe('crossbowman');
  });

  it('keeps every explicit upgrade target catalog-backed and tech-aligned', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (!unit.upgradesTo) continue;
      const target = TRAINABLE_UNITS.find(candidate => candidate.type === unit.upgradesTo);
      expect(target, `${unit.type} -> ${unit.upgradesTo}`).toBeDefined();
      if (!target?.techRequired) continue; // ungated target — always available, no gap possible
      if (!unit.obsoletedByTech) {
        // No obsoleting tech (e.g. steamship -> troop_transport): the source unit never
        // disappears, so the target just needs to unlock no later — same rule as below.
        expect(TECH_ERA_BY_ID.get(target.techRequired), `${unit.type} upgrade tech`).toBeDefined();
        continue;
      }
      // Most pairs unlock/obsolete on the exact same tech; a few (e.g. steamship's civilian
      // line -> troop_transport) unlock the target earlier, which is fine — no upgrade gap.
      const obsoletingEra = TECH_ERA_BY_ID.get(unit.obsoletedByTech);
      const targetEra = TECH_ERA_BY_ID.get(target.techRequired);
      expect(targetEra, `${unit.type} upgrade tech era`).toBeDefined();
      expect(obsoletingEra, `${unit.type} obsoleting tech era`).toBeDefined();
      expect(targetEra!, `${unit.type} upgrade tech`).toBeLessThanOrEqual(obsoletingEra!);
    }
  });
});

describe('trainedFromBuilding upgrade gate (Stealth Airbase)', () => {
  const completedTechs = ['nuclear-weapons', 'stealth-technology'];

  it('blocks bomber -> stealth_bomber upgrade in a city without stealth_airbase, with reason missing-building', () => {
    const unit = makeUnit('bomber');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 }, buildings: [] } as any;
    const result = canUpgradeUnit(unit, 'c1', { c1: city }, completedTechs);
    expect(result.canUpgrade).toBe(false);
    expect(result.targetType).toBeNull();
    expect(result.reason).toBe('missing-building');
  });

  it('allows bomber -> stealth_bomber upgrade in a city with stealth_airbase and deducts gold', () => {
    const unit = makeUnit('bomber');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 }, buildings: ['stealth_airbase'] } as any;
    const result = canUpgradeUnit(unit, 'c1', { c1: city }, completedTechs, 1000);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('stealth_bomber');
  });

  it('regression: musketeer -> rifleman (no trainedFromBuilding) is unaffected by building gate', () => {
    const unit = makeUnit('musketeer');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 }, buildings: [] } as any;
    const result = canUpgradeUnit(unit, 'c1', { c1: city }, ['tactics', 'rifled-infantry']);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('rifleman');
  });

  it('applyUnitUpgradeToState rejects the upgrade when the host city lacks the required building', () => {
    const state = createNewGame(undefined, 'building-gate-upgrade', 'small');
    const civ = state.civilizations.player;
    const source = civ.units.map(id => state.units[id]).find(Boolean)!;
    const city = foundCity(civ.id, source.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities = [city.id];
    source.id = 'upgrade-unit';
    source.type = 'bomber';
    state.units = { [source.id]: source };
    civ.units = [source.id];
    civ.techState.completed = completedTechs;
    civ.gold = 1000;

    const result = applyUnitUpgradeToState(state, 'upgrade-unit', 'stealth_bomber');

    expect(result).toEqual({ state, upgraded: false, reason: 'tech-unavailable' });
  });

  it('applyUnitUpgradeToState allows the upgrade once stealth_airbase is present in the host city', () => {
    const state = createNewGame(undefined, 'building-gate-upgrade-ok', 'small');
    const civ = state.civilizations.player;
    const source = civ.units.map(id => state.units[id]).find(Boolean)!;
    const city = foundCity(civ.id, source.position, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'stealth_airbase'];
    state.cities[city.id] = city;
    civ.cities = [city.id];
    source.id = 'upgrade-unit';
    source.type = 'bomber';
    state.units = { [source.id]: source };
    civ.units = [source.id];
    civ.techState.completed = completedTechs;
    civ.gold = 1000;

    const result = applyUnitUpgradeToState(state, 'upgrade-unit', 'stealth_bomber');

    expect(result.upgraded).toBe(true);
    expect(result.state.units['upgrade-unit'].type).toBe('stealth_bomber');
  });
});

describe('getUpgradeCost', () => {
  it('returns half of the target unit production cost from the canonical catalog', () => {
    const cost = getUpgradeCost('spy_informant');
    expect(cost).toBe(25);
  });

  it('uses the retuned worker production cost for upgrade math', () => {
    expect(getUpgradeCost('worker')).toBe(6);
  });
});

describe('applyUpgrade', () => {
  it('changes unit type, preserves health and experience, and consumes action', () => {
    const unit = makeUnit('spy_scout');
    unit.experience = 3;
    const upgraded = applyUpgrade(unit, 'spy_informant');
    expect(upgraded.type).toBe('spy_informant');
    expect(upgraded.health).toBe(70);
    expect(upgraded.experience).toBe(3);
    expect(upgraded.hasActed).toBe(true);
    expect(upgraded.movementPointsLeft).toBe(0);
  });

  it('preserves identity fields (id, owner, position) so spy record can sync by unitId', () => {
    const unit = makeUnit('spy_scout', { q: 3, r: 4 });
    const upgraded = applyUpgrade(unit, 'spy_informant');
    expect(upgraded.id).toBe(unit.id);
    expect(upgraded.owner).toBe(unit.owner);
    expect(upgraded.position).toEqual({ q: 3, r: 4 });
  });
});

describe('applyUnitUpgradeToState', () => {
  function setup() {
    const state = createNewGame(undefined, 'whole-state-upgrade', 'small');
    const civ = state.civilizations.player;
    const source = civ.units.map(id => state.units[id]).find(Boolean)!;
    const city = foundCity(civ.id, source.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    civ.cities = [city.id];
    source.id = 'upgrade-unit';
    source.type = 'spy_scout';
    source.health = 41;
    state.units = { [source.id]: source };
    civ.units = [source.id];
    civ.techState.completed = ['espionage-scouting', 'espionage-informants'];
    civ.gold = 100;
    return { state, city, source };
  }

  it('evaluates a legal upgrade with its cost and preserved-state preview', () => {
    const { state } = setup();
    state.units['upgrade-unit'].experience = 3;

    expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'spy_informant')).toMatchObject({
      canUpgrade: true,
      sourceType: 'spy_scout',
      targetType: 'spy_informant',
      cost: 25,
      preserved: {
        health: 41,
        experience: 3,
        movementPointsLeft: 0,
        hasActed: true,
      },
      missing: [],
    });
  });

  it.each(['explorer', 'standard', 'veteran'] as const)('keeps human upgrade legality identical on %s', challenge => {
    const { state } = setup();
    state.opponentChallenge = challenge;

    expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'spy_informant'))
      .toMatchObject({ canUpgrade: true, missing: [] });
  });

  it.each(['explorer', 'standard', 'veteran'] as const)('keeps Knight -> Cuirassier legality identical on %s', challenge => {
    const { state } = setup();
    state.opponentChallenge = challenge;
    state.units['upgrade-unit'].type = 'knight';
    state.civilizations.player.gold = 1000;
    state.civilizations.player.techState.completed = [
      'animal-husbandry', 'bronze-working', 'iron-forging', 'rifle-tactics', 'professional-army',
    ];
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId: 'player', resource: 'horses', expiresOnTurn: state.turn + 1 },
      { civId: 'player', resource: 'iron', expiresOnTurn: state.turn + 1 },
    ] };

    expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'cuirassier'))
      .toMatchObject({ canUpgrade: true, targetType: 'cuirassier', missing: [] });
  });

  it('reports every missing conjunctive target technology', () => {
    const { state } = setup();
    const target = TRAINABLE_UNITS.find(entry => entry.type === 'spy_informant')!;
    const original = target.requiredTechs;
    target.requiredTechs = ['disguise'];
    try {
      expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'spy_informant').missing)
        .toContainEqual({ kind: 'technology', techId: 'disguise' });
    } finally {
      target.requiredTechs = original;
    }
  });

  it('reports an overlapping source and target technology requirement only once', () => {
    const { state, city } = setup();
    state.units['upgrade-unit'].type = 'archer';
    state.civilizations.player.techState.completed = [];
    city.buildings = [];

    const missing = evaluateUnitUpgrade(state, 'upgrade-unit', 'crossbowman').missing;

    expect(missing.filter(requirement => requirement.kind === 'technology' && requirement.techId === 'tactics'))
      .toHaveLength(1);
    expect(missing).toContainEqual({ kind: 'resource', resource: 'copper' });
  });

  it('reports a full helicopter base for an explicit cross-domain upgrade fixture', () => {
    const { state, city } = setup();
    const definitions = TRAINABLE_UNITS.map(entry => entry.type === 'tank'
      ? { ...entry, obsoletedByTech: 'armored-tactics', upgradesTo: 'attack_helicopter' as const }
      : entry);
    state.units['upgrade-unit'].type = 'tank';
    state.civilizations.player.gold = 1000;
    state.civilizations.player.techState.completed = ['tank-warfare', 'armored-tactics', 'helicopter-warfare'];
    city.buildings = ['helicopter_base'];
    for (const id of ['helicopter-1', 'helicopter-2']) {
      state.units[id] = {
        ...state.units['upgrade-unit'], id, type: 'attack_helicopter',
        airBase: { kind: 'city', cityId: city.id },
      };
      state.civilizations.player.units.push(id);
    }

    expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'attack_helicopter', definitions).missing)
      .toContainEqual({ kind: 'air-base', reason: 'base-full' });
  });

  it('blocks the real Armored Car transition when the host Helicopter Base is full', () => {
    const { state, city } = setup();
    state.units['upgrade-unit'].type = 'armored_car' as any;
    state.civilizations.player.gold = 1000;
    state.civilizations.player.techState.completed = ['motorized-transport', 'helicopter-warfare'];
    city.buildings = ['helicopter_base'];
    for (const id of ['helicopter-1', 'helicopter-2']) {
      state.units[id] = { ...state.units['upgrade-unit'], id, type: 'attack_helicopter', airBase: { kind: 'city', cityId: city.id } };
      state.civilizations.player.units.push(id);
    }
    expect(evaluateUnitUpgrade(state, 'upgrade-unit', 'attack_helicopter').missing)
      .toContainEqual({ kind: 'air-base', reason: 'base-full' });
  });

  it('bases the real Armored Car successor at its host Helicopter Base', () => {
    const { state, city } = setup();
    state.units['upgrade-unit'].type = 'armored_car' as any;
    state.civilizations.player.gold = 1000;
    state.civilizations.player.techState.completed = ['motorized-transport', 'helicopter-warfare'];
    city.buildings = ['helicopter_base'];
    expect(applyUnitUpgradeToState(state, 'upgrade-unit', 'attack_helicopter').state.units['upgrade-unit'])
      .toMatchObject({ type: 'attack_helicopter', airBase: { kind: 'city', cityId: city.id } });
  });

  it('upgrades canonically, deducts exact gold, preserves health, and consumes the action', () => {
    const { state } = setup();

    const result = applyUnitUpgradeToState(state, 'upgrade-unit', 'spy_informant');

    expect(result.upgraded).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(75);
    expect(result.state.units['upgrade-unit']).toMatchObject({
      type: 'spy_informant',
      health: 41,
      hasActed: true,
      movementPointsLeft: 0,
    });
  });

  it('rejects a noncanonical target and insufficient treasury without changing state', () => {
    const { state } = setup();
    expect(applyUnitUpgradeToState(state, 'upgrade-unit', 'tank')).toEqual({
      state,
      upgraded: false,
      reason: 'invalid-target',
    });
    state.civilizations.player.gold = 24;
    expect(applyUnitUpgradeToState(state, 'upgrade-unit', 'spy_informant')).toEqual({
      state,
      upgraded: false,
      reason: 'insufficient-gold',
    });
  });

  it('synchronizes a matching spy record and does not mutate its input', () => {
    const { state } = setup();
    state.espionage!.player.spies['upgrade-unit'] = makeTestSpy({
      id: 'upgrade-unit',
      unitType: 'spy_scout',
    });
    const before = structuredClone(state);

    const result = applyUnitUpgradeToState(state, 'upgrade-unit', 'spy_informant');

    expect(state).toEqual(before);
    expect(result.state.espionage!.player.spies['upgrade-unit'].unitType)
      .toBe('spy_informant');
  });
});

// ─── Obsolescence helpers ───────────────────────────────────────────────────

function makeTestSpy(overrides: Partial<Spy> = {}): Spy {
  return {
    id: 'spy1', owner: 'player', name: 'Agent Fox',
    unitType: 'spy_scout', targetCivId: null, targetCityId: null,
    position: null, status: 'embedded', experience: 0,
    currentMission: null, cooldownTurns: 0, promotionAvailable: false,
    ...overrides,
  };
}

// Minimal GameState where espionage-informants completes this turn.
// researchProgress = 80 = cost, so 80 + 0 >= 80 → completes with 0 science.
function makeObsolescenceState(overrides: {
  unitOnMap?: boolean;
  spyStatus?: 'embedded' | 'stationed' | 'on_mission';
} = {}): GameState {
  const civId = 'player';
  const spy = makeTestSpy({ status: overrides.spyStatus ?? 'embedded' });
  const mapUnit = {
    id: 'u1', type: 'spy_scout' as const, owner: civId,
    position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 2,
    hasActed: false, hasMoved: false, experience: 0, isResting: false,
  };
  return {
    turn: 1, era: 1, currentPlayer: civId, hotSeat: false,
    gameOver: false, winner: null,
    map: { width: 5, height: 5, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: overrides.unitOnMap ? { u1: mapUnit } : {},
    cities: {},
    civilizations: {
      [civId]: {
        id: civId, name: 'Rome', color: '#c00', isHuman: true, civType: 'rome',
        cities: [], units: overrides.unitOnMap ? ['u1'] : [],
        techState: {
          completed: ['espionage-scouting'],
          currentResearch: 'espionage-informants',
          researchProgress: 80, // at cost threshold — completes with 0 science
          researchQueue: [],
          trackPriorities: {} as any,
        },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
      },
    },
    espionage: {
      [civId]: { spies: { spy1: spy }, maxSpies: 2, counterIntelligence: {} },
    },
    barbarianCamps: {}, minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    embargoes: [], defensiveLeagues: [],
  } as unknown as GameState;
}

describe('obsolescence notifications', () => {
  it('emits unit:obsolete for map spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ unitOnMap: true });
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('unit:obsolete', e => events.push(e));
    processTurn(state, bus);
    expect(events.length).toBeGreaterThan(0);
  });

  it('silently removes embedded spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'embedded' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });

  it('silently removes stationed spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'stationed' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });

  it('silently removes on_mission spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'on_mission' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });
});
