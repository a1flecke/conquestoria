import { describe, it, expect, vi } from 'vitest';
import { processCity, BUILDINGS } from '@/systems/city-system';
import { applyBuildingCI, createEspionageCivState, processEspionageTurn } from '@/systems/espionage-system';
import { createRng } from '@/systems/map-generator';
import { EventBus } from '@/core/event-bus';
import type { GameState, Spy } from '@/core/types';

describe('espionage building definitions', () => {
  it('safehouse is defined with espionage category', () => {
    expect(BUILDINGS['safehouse']).toBeDefined();
    expect(BUILDINGS['safehouse'].category).toBe('espionage');
  });

  it('intelligence-agency is defined with espionage category', () => {
    expect(BUILDINGS['intelligence-agency']).toBeDefined();
    expect(BUILDINGS['intelligence-agency'].techRequired).toBe('espionage-informants');
  });

  it('security-bureau is defined with espionage category', () => {
    expect(BUILDINGS['security-bureau']).toBeDefined();
    expect(BUILDINGS['security-bureau'].techRequired).toBe('counter-intelligence');
  });
});

describe('applyBuildingCI', () => {
  it('intelligence-agency gives +20 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(20);
  });

  it('intelligence-agency CI halved (to +10) when digital-surveillance researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['digital-surveillance']);
    expect(result.counterIntelligence['c1']).toBe(10);
  });

  it('city without intelligence-agency gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('security-bureau gives +30 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(30);
  });

  it('security-bureau CI halved (to +15) when cyber-warfare researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['cyber-warfare']);
    expect(result.counterIntelligence['c1']).toBe(15);
  });

  it('city without security-bureau gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('both buildings stack CI', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(50); // 20 + 30
  });

  it('both buildings faded simultaneously with both era techs', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['digital-surveillance', 'cyber-warfare']);
    expect(result.counterIntelligence['c1']).toBe(25); // 10 + 15
  });

  it('CI is capped at 100', () => {
    const civEsp = { ...createEspionageCivState(), counterIntelligence: { c1: 90 } };
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(100);
  });
});

describe('safehouse spy training cost reduction', () => {
  const baseCity = {
    id: 'c1',
    food: 0, foodNeeded: 10, population: 1,
    productionProgress: 0,
    productionQueue: ['spy_scout'],
    buildings: ['safehouse'],
    ownedTiles: [],
    grid: [[null]],
  } as any;

  const baseMap = { tiles: {}, width: 10, height: 10, wrap: false } as any;

  it('safehouse reduces spy_scout training cost by 25% (30 → 23)', () => {
    // spy_scout costs 30; with safehouse 25% discount: ceil(30 * 0.75) = 23
    const city = { ...baseCity, productionProgress: 22 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionProgress: 23 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });

  it('safehouse does NOT reduce training cost for non-spy units', () => {
    // warrior costs 8; safehouse discount should not apply
    const city = { ...baseCity, productionQueue: ['warrior'], productionProgress: 7 };
    const result = processCity(city, baseMap, 0, 0, undefined, []);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionQueue: ['warrior'], productionProgress: 8 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, []);
    expect(result2.completedUnit).toBe('warrior');
  });

  it('without safehouse spy_scout requires full 30 production', () => {
    const city = { ...baseCity, buildings: [], productionProgress: 29 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, buildings: [], productionProgress: 30 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });
});

// ─── Security bureau turning-resistance tests ─────────────────────────────────
// The security bureau blocks 50% of turning attempts for captured spies.
// Seed format: `sec-bureau-${spy.id}-${state.turn}`.
// Deterministic values (precomputed from mulberry32):
//   'sec-bureau-spy1-1' => 0.0535 (< 0.5  → BLOCK)
//   'sec-bureau-spy1-2' => 0.9923 (>= 0.5 → ALLOW)

function makeSpyTurningState(spyId: string, turn: number, hasSecurityBureau: boolean): GameState {
  const spy: Spy = {
    id: spyId,
    owner: 'attacker',
    name: 'Agent Shadow',
    unitType: 'spy_scout',
    targetCivId: 'defender',
    targetCityId: 'city-1',
    position: null,
    status: 'captured',
    experience: 0,
    currentMission: null,
    cooldownTurns: 0,
    promotion: undefined,
    promotionAvailable: false,
    feedsFalseIntel: false,
    disguiseAs: null,
    infiltrationCityId: null,
    cityVisionTurnsLeft: 0,
    stolenTechFrom: {},
  };

  const defenderEsp = createEspionageCivState();
  const attackerEsp = {
    ...createEspionageCivState(),
    spies: { [spyId]: spy },
  };

  return {
    turn,
    era: 1,
    currentPlayer: 'attacker',
    gameOver: false,
    winner: null,
    map: { width: 5, height: 5, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-1': {
        id: 'city-1', name: 'Rome', owner: 'defender',
        position: { q: 0, r: 0 }, population: 2, food: 0, foodNeeded: 10,
        buildings: hasSecurityBureau ? ['security-bureau'] : [],
        productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
        grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      attacker: {
        id: 'attacker', name: 'Attacker', color: '#ff0000',
        isHuman: false, civType: 'rome',
        cities: [], units: [],
        techState: { completed: ['espionage-scouting'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: { defender: -50 }, treaties: [], events: [], atWarWith: ['defender'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
      },
      defender: {
        id: 'defender', name: 'Defender', color: '#0000ff',
        isHuman: false, civType: 'egypt',
        cities: ['city-1'], units: [],
        techState: { completed: ['counter-intelligence'], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, score: 0,
        diplomacy: { relationships: { attacker: -50 }, treaties: [], events: [], atWarWith: ['attacker'], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
      },
    },
    espionage: {
      attacker: attackerEsp,
      defender: defenderEsp,
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    embargoes: [],
    defensiveLeagues: [],
  } as GameState;
}

describe('security bureau — turning resistance (50% block)', () => {
  it('seed sec-bureau-spy1-1 produces value < 0.5 (block path)', () => {
    // Verify the seed math is deterministic and matches what processEspionageTurn uses
    const val = createRng('sec-bureau-spy1-1')();
    expect(val).toBeCloseTo(0.0535, 3);
    expect(val).toBeLessThan(0.5); // should BLOCK turning
  });

  it('seed sec-bureau-spy1-2 produces value >= 0.5 (allow path)', () => {
    const val = createRng('sec-bureau-spy1-2')();
    expect(val).toBeCloseTo(0.9923, 3);
    expect(val).toBeGreaterThanOrEqual(0.5); // should ALLOW turning
  });

  it('security bureau blocks turning when RNG < 0.5 (turn 1 → block)', () => {
    // spy1, turn 1: RNG = 0.0535 < 0.5 → turning should be blocked
    const state = makeSpyTurningState('spy1', 1, /* hasSecurityBureau */ true);
    const bus = new EventBus();
    const emitted: string[] = [];
    bus.on('espionage:spy-detected', () => emitted.push('detected'));

    const result = processEspionageTurn(state, bus);
    // Spy should still be captured (not turned into a stationed double agent)
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('captured');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(false);
    expect(emitted).toHaveLength(0);
  });

  it('security bureau allows turning when RNG >= 0.5 (turn 2 → allow)', () => {
    // spy1, turn 2: RNG = 0.9923 >= 0.5 → turning should succeed
    const state = makeSpyTurningState('spy1', 2, /* hasSecurityBureau */ true);
    const bus = new EventBus();
    const emitted: string[] = [];
    bus.on('espionage:spy-detected', () => emitted.push('detected'));

    const result = processEspionageTurn(state, bus);
    // Spy should be turned (status = stationed, feedsFalseIntel = true)
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('stationed');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(true);
    expect(emitted).toHaveLength(1);
  });

  it('without security bureau, captured spy is always turned (no RNG gate)', () => {
    // turn 1 without security bureau: the RNG check is skipped entirely → always turns
    const state = makeSpyTurningState('spy1', 1, /* hasSecurityBureau */ false);
    const bus = new EventBus();
    const result = processEspionageTurn(state, bus);
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('stationed');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(true);
  });
});
