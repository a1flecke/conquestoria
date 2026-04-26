import { describe, it, expect } from 'vitest';
import { canUpgradeUnit, getUpgradeCost, applyUpgrade } from '@/systems/unit-upgrade-system';
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState, Spy, Unit } from '@/core/types';

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

describe('getUpgradeCost', () => {
  it('returns half of the target unit production cost', () => {
    const cost = getUpgradeCost('spy_informant');
    expect(cost).toBe(25); // spy_informant costs 50 in TRAINABLE_UNITS, half = 25
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
