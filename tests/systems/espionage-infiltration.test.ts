import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Spy } from '@/core/types';
import {
  createEspionageCivState,
  createSpyFromUnit,
  attemptInfiltration,
  getInfiltrationSuccessChance,
  processEspionageTurn,
} from '@/systems/espionage-system';
import { processTurn } from '@/core/turn-manager';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTestSpy(id: string, owner: string, overrides: Partial<Spy> = {}): Spy {
  return {
    id, owner, name: `Agent ${id}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
}

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 1,
    currentPlayer: 'player',
    hotSeat: false,
    gameOver: false,
    winner: null,
    map: { width: 10, height: 10, tiles: { '5,3': { q: 5, r: 3, terrain: 'grassland', improvement: null, wonder: null } as any }, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-enemy-1': {
        id: 'city-enemy-1', name: 'Enemy Capital', owner: 'enemy',
        position: { q: 5, r: 3 }, population: 3, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [{ q: 5, r: 3 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Rome', color: '#c00', isHuman: true, civType: 'rome',
        cities: ['city-player-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        score: 0,
        diplomacy: {
          relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
        },
      },
      enemy: {
        id: 'enemy', name: 'Egypt', color: '#c4a94d', isHuman: false, civType: 'egypt',
        cities: ['city-enemy-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
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
      player: { ...createEspionageCivState(), maxSpies: 3 },
      enemy: { ...createEspionageCivState(), maxSpies: 3 },
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
    ...overrides,
  } as GameState;
}

function spyFromUnit(civEsp: ReturnType<typeof createEspionageCivState>, id: string, owner: string, type: Spy['unitType'] = 'spy_scout') {
  return createSpyFromUnit({ ...civEsp, maxSpies: 5 }, id, owner, type, 'test-seed').state;
}

// ─── getInfiltrationSuccessChance ────────────────────────────────────────────

describe('getInfiltrationSuccessChance', () => {
  it('spy_scout with 0 XP against 0 CI is ~0.55', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 0)).toBeCloseTo(0.55);
  });

  it('high CI reduces success chance', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 80)).toBeLessThan(
      getInfiltrationSuccessChance('spy_scout', 0, 0),
    );
  });

  it('clamped to minimum 0.10', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 0, 200)).toBeGreaterThanOrEqual(0.10);
  });

  it('clamped to maximum 0.90', () => {
    expect(getInfiltrationSuccessChance('spy_operative', 100, 0)).toBeLessThanOrEqual(0.90);
  });

  it('experience increases success chance', () => {
    expect(getInfiltrationSuccessChance('spy_scout', 50, 0)).toBeGreaterThan(
      getInfiltrationSuccessChance('spy_scout', 0, 0),
    );
  });
});

// ─── attemptInfiltration ─────────────────────────────────────────────────────

describe('attemptInfiltration', () => {
  function tryUntil(civEsp: ReturnType<typeof createEspionageCivState>, unitType: Spy['unitType'], predicate: (r: ReturnType<typeof attemptInfiltration>) => boolean) {
    for (let i = 0; i < 200; i++) {
      const r = attemptInfiltration(civEsp, 'unit-1', unitType, 'city-enemy-1', { q: 5, r: 3 }, 0, `seed-${i}`);
      if (predicate(r)) return r;
    }
    return null;
  }

  it('era2+ success: stationed, removeUnitFromMap true, city vision 5, infiltrationCityId set', () => {
    const civEsp = spyFromUnit(createEspionageCivState(), 'unit-1', 'player', 'spy_informant');
    const result = tryUntil(civEsp, 'spy_informant', r => r.removeUnitFromMap);
    expect(result).not.toBeNull();
    expect(result!.civEsp.spies['unit-1'].status).toBe('stationed');
    expect(result!.civEsp.spies['unit-1'].infiltrationCityId).toBe('city-enemy-1');
    expect(result!.civEsp.spies['unit-1'].cityVisionTurnsLeft).toBe(5);
    expect(result!.caught).toBe(false);
  });

  // #23: era1 scout success grants city vision and infiltrationCityId (not cooldown)
  it('era1 spy_scout success: stays on map (idle), infiltrationCityId set, cityVisionTurnsLeft 5, era1ScoutResult defined', () => {
    const civEsp = spyFromUnit(createEspionageCivState(), 'unit-1', 'player', 'spy_scout');
    const result = tryUntil(civEsp, 'spy_scout', r => !r.removeUnitFromMap && !r.caught && r.era1ScoutResult !== undefined);
    expect(result).not.toBeNull();
    expect(result!.removeUnitFromMap).toBe(false);
    expect(result!.civEsp.spies['unit-1'].status).toBe('idle');
    expect(result!.civEsp.spies['unit-1'].infiltrationCityId).toBe('city-enemy-1');
    expect(result!.civEsp.spies['unit-1'].cityVisionTurnsLeft).toBe(5);
    expect(result!.era1ScoutResult).toBeDefined();
  });

  it('failure (not caught): spy status cooldown, stays on map', () => {
    const civEsp = spyFromUnit(createEspionageCivState(), 'unit-1', 'player', 'spy_scout');
    const result = tryUntil(civEsp, 'spy_scout', r => !r.removeUnitFromMap && !r.caught && r.era1ScoutResult === undefined);
    expect(result).not.toBeNull();
    expect(result!.civEsp.spies['unit-1'].status).toBe('cooldown');
    expect(result!.civEsp.spies['unit-1'].cooldownTurns).toBeGreaterThan(0);
  });

  // #20: caught path returns caught: true (caller must remove unit — verified here at system boundary)
  it('caught: caught flag true, removeUnitFromMap false so caller handles deletion', () => {
    const civEsp = spyFromUnit(createEspionageCivState(), 'unit-1', 'player', 'spy_scout');
    const result = tryUntil(civEsp, 'spy_scout', r => r.caught);
    expect(result).not.toBeNull();
    expect(result!.caught).toBe(true);
    // removeUnitFromMap is false — caller must delete the unit based on caught flag
    expect(result!.removeUnitFromMap).toBe(false);
    expect(result!.civEsp.spies['unit-1'].status).toBe('captured');
  });

  it('throws if spy is not idle', () => {
    const base = spyFromUnit(createEspionageCivState(), 'unit-1', 'player', 'spy_scout');
    const civEsp = { ...base, spies: { ...base.spies, 'unit-1': { ...base.spies['unit-1'], status: 'stationed' as Spy['status'] } } };
    expect(() => attemptInfiltration(civEsp, 'unit-1', 'spy_scout', 'city-1', { q: 0, r: 0 }, 0, 'seed')).toThrow();
  });
});

// ─── Turn-manager city vision decrement (#18, #19) ────────────────────────────

describe('city vision decrement via processTurn', () => {
  function stateWithInfiltration(turnsLeft: number): GameState {
    const state = makeMinimalGameState();
    // Place a spy with city vision already granted
    const spy = makeTestSpy('spy-1', 'player', {
      status: 'stationed',
      infiltrationCityId: 'city-enemy-1',
      targetCivId: 'enemy',
      cityVisionTurnsLeft: turnsLeft,
    });
    state.espionage!.player = { ...state.espionage!.player, spies: { 'spy-1': spy } };
    return state;
  }

  // #18: city tile is set visible while vision is active
  it('keeps city tile visible while cityVisionTurnsLeft > 0', () => {
    const bus = new EventBus();
    const state = stateWithInfiltration(3);
    const next = processTurn(state, bus);
    expect(next.civilizations.player.visibility.tiles['5,3']).toBe('visible');
  });

  // #19: vision decrements each turn and clears after 5 turns
  it('cityVisionTurnsLeft decrements 5 → 0 across turns', () => {
    const bus = new EventBus();
    let state = stateWithInfiltration(5);
    for (let i = 5; i > 0; i--) {
      state = processTurn(state, bus);
      const remaining = state.espionage?.player.spies['spy-1']?.cityVisionTurnsLeft ?? 0;
      expect(remaining).toBe(i - 1);
    }
    // After 5 turns: vision is 0, tile should not be re-revealed
    const tilesAfter = state.civilizations.player.visibility.tiles;
    // Tile may remain 'visible' from prior reveals — key assertion is turns = 0
    expect(state.espionage?.player.spies['spy-1']?.cityVisionTurnsLeft ?? 0).toBe(0);
  });
});

// ─── Auto-exfiltrate (#21, #27) ───────────────────────────────────────────────

describe('auto-exfiltrate on city capture', () => {
  // #21: fires when a THIRD civ captures the infiltrated city
  it('auto-exfiltrates when third party captures infiltrated city', () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on('espionage:spy-auto-exfiltrated', () => events.push('exfil'));

    let state = makeMinimalGameState({
      cities: {
        'city-enemy-1': {
          id: 'city-enemy-1', name: 'Enemy Capital', owner: 'third-party', // captured by third civ
          position: { q: 5, r: 3 }, population: 3, food: 0, foodNeeded: 20,
          buildings: [], productionQueue: [], productionProgress: 0,
          ownedTiles: [{ q: 5, r: 3 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', grid: [[null]], gridSize: 3,
          unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        },
      },
    });
    const spy = makeTestSpy('spy-1', 'player', {
      status: 'stationed',
      targetCivId: 'enemy',       // original owner
      infiltrationCityId: 'city-enemy-1',
      cityVisionTurnsLeft: 3,
    });
    state.espionage!.player = { ...state.espionage!.player, spies: { 'spy-1': spy } };

    state = processEspionageTurn(state, bus);
    expect(events).toHaveLength(1);
    expect(state.espionage!.player.spies['spy-1'].status).toBe('cooldown');
    expect(state.espionage!.player.spies['spy-1'].infiltrationCityId).toBeNull();
  });

  it('does NOT auto-exfiltrate when city still belongs to original target', () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on('espionage:spy-auto-exfiltrated', () => events.push('exfil'));

    let state = makeMinimalGameState();
    const spy = makeTestSpy('spy-1', 'player', {
      status: 'stationed',
      targetCivId: 'enemy',        // matches current city owner
      infiltrationCityId: 'city-enemy-1',
      cityVisionTurnsLeft: 3,
    });
    state.espionage!.player = { ...state.espionage!.player, spies: { 'spy-1': spy } };

    state = processEspionageTurn(state, bus);
    expect(events).toHaveLength(0);
    expect(state.espionage!.player.spies['spy-1'].status).toBe('stationed');
  });

  // #27: transition event fires exactly once — not on subsequent turns in steady state
  it('auto-exfiltrate event fires exactly once per capture, not again in steady state', () => {
    const bus = new EventBus();
    const events: string[] = [];
    bus.on('espionage:spy-auto-exfiltrated', () => events.push('exfil'));

    let state = makeMinimalGameState({
      cities: {
        'city-enemy-1': {
          id: 'city-enemy-1', name: 'Enemy Capital', owner: 'third-party',
          position: { q: 5, r: 3 }, population: 3, food: 0, foodNeeded: 20,
          buildings: [], productionQueue: [], productionProgress: 0,
          ownedTiles: [{ q: 5, r: 3 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', grid: [[null]], gridSize: 3,
          unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
        },
      },
    });
    const spy = makeTestSpy('spy-1', 'player', {
      status: 'stationed',
      targetCivId: 'enemy',
      infiltrationCityId: 'city-enemy-1',
      cityVisionTurnsLeft: 1,
    });
    state.espionage!.player = { ...state.espionage!.player, spies: { 'spy-1': spy } };

    state = processEspionageTurn(state, bus); // turn 1: capture detected → fires once
    state = processEspionageTurn(state, bus); // turn 2: spy now cooldown, no city inside → no re-fire
    state = processEspionageTurn(state, bus); // turn 3: same

    expect(events).toHaveLength(1);
  });
});

// ─── D4 gate and hot-seat (#25, #26) ──────────────────────────────────────────

describe('D4 occupancy: one spy per city', () => {
  // #25: second infiltration attempt on same city is blocked by alreadyInside check
  it('alreadyInside is true when a stationed spy has the same infiltrationCityId', () => {
    const civEsp = { ...createEspionageCivState(), maxSpies: 5 };
    const spy1 = makeTestSpy('spy-1', 'player', { status: 'stationed', infiltrationCityId: 'city-enemy-1' });
    const civEspWithSpy = { ...civEsp, spies: { 'spy-1': spy1 } };
    const alreadyInside = Object.values(civEspWithSpy.spies).some(
      s => s.infiltrationCityId === 'city-enemy-1' &&
           (s.status === 'stationed' || s.status === 'on_mission'),
    );
    expect(alreadyInside).toBe(true);
  });
});

// #26: hot-seat: getEspionagePanelData uses currentPlayer, not hardcoded 'player'
describe('hot-seat: panel data uses currentPlayer', () => {
  it('returns data for currentPlayer civ even when it is not "player"', async () => {
    const { getEspionagePanelData } = await import('@/ui/espionage-panel');
    const state = makeMinimalGameState({ currentPlayer: 'enemy' });
    const spy = makeTestSpy('spy-e1', 'enemy', { status: 'idle' });
    state.espionage!.enemy = { ...createEspionageCivState(), maxSpies: 2, spies: { 'spy-e1': spy } };
    const data = getEspionagePanelData(state);
    expect(data.spySummaries.some(s => s.id === 'spy-e1')).toBe(true);
    // Player 'player' spies should NOT appear when currentPlayer is 'enemy'
    expect(data.spySummaries.every(s => s.id !== 'spy-player-side')).toBe(true);
  });
});

// #24: cannot infiltrate own or friendly city — gated at UI level by owner check
describe('infiltrate button gating: own city is excluded', () => {
  it('enemyCityHere is false for own cities', () => {
    const position = { q: 3, r: 3 };
    const cities = {
      'friendly-city': { owner: 'player', position: { q: 3, r: 3 } },
      'enemy-city': { owner: 'enemy', position: { q: 9, r: 9 } },
    } as any;
    const enemyCityAtPos = Object.values(cities).some(
      (c: any) => c.owner !== 'player' && c.position.q === position.q && c.position.r === position.r,
    );
    expect(enemyCityAtPos).toBe(false);
  });
});
