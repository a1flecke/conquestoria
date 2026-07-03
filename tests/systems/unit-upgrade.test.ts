import { describe, it, expect } from 'vitest';
import {
  applyUnitUpgradeToState,
  canUpgradeUnit,
  getUpgradeCost,
  applyUpgrade,
} from '@/systems/unit-upgrade-system';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState, Spy, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { TRAINABLE_UNITS, foundCity } from '@/systems/city-system';

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
});

describe('explicit upgrade chains', () => {
  it('upgrades spy_operative to spy_hacker instead of the conventional cyber unit', () => {
    const unit = makeUnit('spy_operative');

    const result = canUpgradeUnit(
      unit,
      'c1',
      { c1: { id: 'c1', owner: 'player', position: unit.position } as any },
      ['cryptography', 'cyber-warfare'],
    );

    expect(result.targetType).toBe('spy_hacker');
  });

  it('does not infer cross-role upgrades merely because a tech ID matches', () => {
    const steamship = makeUnit('steamship');
    const machineGunner = makeUnit('machine_gunner');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;

    expect(canUpgradeUnit(
      steamship,
      city.id,
      { [city.id]: city },
      ['caravels', 'ironclad-warships'],
    ).targetType).toBeNull();
    expect(canUpgradeUnit(
      machineGunner,
      city.id,
      { [city.id]: city },
      ['mass-firepower', 'armored-tactics'],
    ).targetType).toBeNull();
  });

  it('keeps every explicit upgrade target catalog-backed and tech-aligned', () => {
    for (const unit of TRAINABLE_UNITS) {
      if (!unit.upgradesTo) continue;
      const target = TRAINABLE_UNITS.find(candidate => candidate.type === unit.upgradesTo);
      expect(target, `${unit.type} -> ${unit.upgradesTo}`).toBeDefined();
      expect(target?.techRequired, `${unit.type} upgrade tech`).toBe(unit.obsoletedByTech);
    }
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
  it('changes unit type, heals to full health, and consumes action', () => {
    const unit = makeUnit('spy_scout');
    const upgraded = applyUpgrade(unit, 'spy_informant');
    expect(upgraded.type).toBe('spy_informant');
    expect(upgraded.health).toBe(100);
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

  it('upgrades canonically, deducts exact gold, heals, and consumes the action', () => {
    const { state } = setup();

    const result = applyUnitUpgradeToState(state, 'upgrade-unit', 'spy_informant');

    expect(result.upgraded).toBe(true);
    expect(result.state.civilizations.player.gold).toBe(75);
    expect(result.state.units['upgrade-unit']).toMatchObject({
      type: 'spy_informant',
      health: 100,
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
