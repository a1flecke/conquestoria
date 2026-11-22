import { describe, it, expect } from 'vitest';
import { createProductionCostContext, processCity, BUILDINGS, getAvailableBuildings } from '@/systems/city-system';
import { applyBuildingCI, createEspionageCivState, processEspionageTurn } from '@/systems/espionage-system';
import { createSimulationRng } from '@/systems/simulation-rng';
import { EventBus } from '@/core/event-bus';
import type { GameState, Spy } from '@/core/types';

describe('espionage building definitions', () => {
  it('safehouse is defined with espionage category', () => {
    expect(BUILDINGS['safehouse']).toBeDefined();
    expect(BUILDINGS['safehouse'].category).toBe('espionage');
  });

  it('intelligence-agency is defined with espionage category', () => {
    expect(BUILDINGS['intelligence-agency']).toBeDefined();
    expect(BUILDINGS['intelligence-agency'].techRequired).toBe('political-intelligence');
    expect(BUILDINGS['intelligence-agency'].productionCost).toBe(108);
    expect(BUILDINGS['intelligence-agency'].defensiveEspionageAiValue).toBe(40);
  });

  it('security-bureau is defined with espionage category', () => {
    expect(BUILDINGS['security-bureau']).toBeDefined();
    expect(BUILDINGS['security-bureau'].techRequired).toBe('cold-war-networks');
    expect(BUILDINGS['security-bureau'].productionCost).toBe(120);
    expect(BUILDINGS['security-bureau'].defensiveEspionageAiValue).toBe(40);
  });

  it('cyber_defense_center carries a generic defensive-espionage AI value (#1335)', () => {
    expect(BUILDINGS['cyber_defense_center']).toBeDefined();
    expect(BUILDINGS['cyber_defense_center'].category).toBe('espionage');
    expect(BUILDINGS['cyber_defense_center'].defensiveEspionageAiValue).toBe(40);
  });

  it('keeps counter-intelligence buildings unavailable until their new era gates', () => {
    const city = { buildings: [], position: { q: 0, r: 0 } } as any;
    const map = { tiles: {}, width: 1, height: 1, wrapsHorizontally: false } as any;
    const early = getAvailableBuildings(city, ['espionage-informants', 'counter-intelligence'], map)
      .map(building => building.id);
    const late = getAvailableBuildings(city, ['political-intelligence', 'cold-war-networks'], map)
      .map(building => building.id);

    expect(early).not.toContain('intelligence-agency');
    expect(early).not.toContain('security-bureau');
    expect(late).toContain('intelligence-agency');
    expect(late).toContain('security-bureau');
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

  it('security-bureau CI halved (to +15) when signals-intelligence researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['signals-intelligence']);
    expect(result.counterIntelligence['c1']).toBe(15);
  });

  it('security-bureau keeps its full CI before signals-intelligence is researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['cold-war-networks']);
    expect(result.counterIntelligence['c1']).toBe(30);
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

  it('both buildings faded simultaneously with their respective era techs', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['digital-surveillance', 'signals-intelligence']);
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
    const result = processCity(city, baseMap, 0, 0, createProductionCostContext({ completedTechs: ['espionage-scouting'] }));
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionProgress: 23 };
    const result2 = processCity(city2, baseMap, 0, 0, createProductionCostContext({ completedTechs: ['espionage-scouting'] }));
    expect(result2.completedUnit).toBe('spy_scout');
  });

  it('safehouse does NOT reduce training cost for non-spy units', () => {
    // warrior costs 8; safehouse discount should not apply
    const city = { ...baseCity, productionQueue: ['warrior'], productionProgress: 7 };
    const result = processCity(city, baseMap, 0, 0, createProductionCostContext({ completedTechs: [] }));
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionQueue: ['warrior'], productionProgress: 8 };
    const result2 = processCity(city2, baseMap, 0, 0, createProductionCostContext({ completedTechs: [] }));
    expect(result2.completedUnit).toBe('warrior');
  });

  it('without safehouse spy_scout requires full 30 production', () => {
    const city = { ...baseCity, buildings: [], productionProgress: 29 };
    const result = processCity(city, baseMap, 0, 0, createProductionCostContext({ completedTechs: ['espionage-scouting'] }));
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, buildings: [], productionProgress: 30 };
    const result2 = processCity(city2, baseMap, 0, 0, createProductionCostContext({ completedTechs: ['espionage-scouting'] }));
    expect(result2.completedUnit).toBe('spy_scout');
  });
});

describe('espionage building save compatibility', () => {
  it('grandfathers an intelligence-agency already queued before its gate moved', () => {
    const city = {
      id: 'legacy-city', food: 0, foodNeeded: 10, population: 1,
      productionProgress: 108, productionQueue: ['intelligence-agency'], buildings: [],
      ownedTiles: [], grid: [[null]],
    } as any;
    const map = { tiles: {}, width: 10, height: 10, wrapsHorizontally: false } as any;
    const result = processCity(city, map, 0, 0, createProductionCostContext({ completedTechs: ['espionage-informants'] }));

    expect(result.completedBuilding).toBe('intelligence-agency');
    expect(result.droppedProductionItems).toEqual([]);
  });
});

// ─── Security bureau turning-resistance tests ─────────────────────────────────
// The security bureau blocks 50% of turning attempts for captured spies.
// Seed format: `sec-bureau-${spy.id}-${state.turn}`.
// Deterministic values (precomputed from mulberry32):
//   'sec-bureau-spy1-1' => 0.0535 (< 0.5  → BLOCK)
//   'sec-bureau-spy1-2' => 0.9923 (>= 0.5 → ALLOW)

/** `bureau` says whose empire holds a Security Bureau: the spy's owner (attacker), its captor (defender), or neither. */
function makeSpyTurningState(spyId: string, turn: number, bureau: 'attacker' | 'defender' | 'none'): GameState {
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
        buildings: bureau === 'defender' ? ['security-bureau'] : [],
        productionQueue: [], productionProgress: 0,
        ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
        grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-2': {
        id: 'city-2', name: 'Memphis', owner: 'attacker',
        position: { q: 4, r: 4 }, population: 2, food: 0, foodNeeded: 10,
        buildings: bureau === 'attacker' ? ['security-bureau'] : [],
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
        cities: ['city-2'], units: [],
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
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as GameState;
}

describe('security bureau — protects its own side\'s spies from being turned (50%)', () => {
  // The resist draw is the one the turn makes: keyed on the spy, in the 'spy-turn-resist' domain, for that turn.
  const resists = (turn: number) => createSimulationRng({ gameId: undefined, turn }, { domain: 'spy-turn-resist', actorId: 'spy1' })() < 0.5;
  const resistTurn = Array.from({ length: 40 }, (_, i) => i + 1).find(resists)!;
  const allowTurn = Array.from({ length: 40 }, (_, i) => i + 1).find(turn => !resists(turn))!;

  function run(turn: number, bureau: 'attacker' | 'defender' | 'none') {
    const state = makeSpyTurningState('spy1', turn, bureau);
    const bus = new EventBus();
    const emitted: string[] = [];
    bus.on('espionage:spy-detected', () => emitted.push('detected'));
    return { result: processEspionageTurn(state, bus), emitted };
  }

  it('the spy owner\'s bureau makes a capture resist turning when the draw falls under 0.5', () => {
    const { result, emitted } = run(resistTurn, 'attacker');
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('captured');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(false);
    expect(emitted).toHaveLength(0);
  });

  it('the spy owner\'s bureau lets the turning through when the draw is 0.5 or more', () => {
    const { result, emitted } = run(allowTurn, 'attacker');
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('stationed');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(true);
    expect(emitted).toHaveLength(1);
  });

  it('a capture that resisted is not re-rolled on a later turn', () => {
    const first = run(resistTurn, 'attacker').result;
    const later = { ...first, turn: allowTurn };
    const bus = new EventBus();
    const after = processEspionageTurn(later, bus);
    expect(after.espionage!['attacker'].spies['spy1'].status).toBe('captured');
    expect(after.espionage!['attacker'].spies['spy1'].turnedBy).toBeUndefined();
  });

  it('the captor\'s own bureau never protects the enemy spy it is holding', () => {
    for (const turn of [resistTurn, allowTurn]) {
      const { result } = run(turn, 'defender');
      expect(result.espionage!['attacker'].spies['spy1'].status).toBe('stationed');
      expect(result.espionage!['attacker'].spies['spy1'].turnedBy).toBe('defender');
    }
  });

  it('without a bureau on the spy\'s side, a captured spy is always turned', () => {
    const { result } = run(resistTurn, 'none');
    expect(result.espionage!['attacker'].spies['spy1'].status).toBe('stationed');
    expect(result.espionage!['attacker'].spies['spy1'].feedsFalseIntel).toBe(true);
  });
});
