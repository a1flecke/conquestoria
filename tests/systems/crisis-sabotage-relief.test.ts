import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { ActiveCrisis, GameState } from '@/core/types';
import { getAvailableMissions, resolveMissionResult, processEspionageTurn } from '@/systems/espionage-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';

// #526 MR7 Task 7.2 -- sabotage_relief mission gating and eligibility.

function makeCrisisGameState(overrides: Partial<GameState> = {}): GameState {
  const ids = ['player', 'rival'];
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'plague', archetype: 'outbreak', targetCivId: 'rival',
    cityIds: ['city-rival-1'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
  };
  return {
    turn: 12,
    era: 5,
    currentPlayer: 'player',
    map: { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player', position: { q: 0, r: 0 }, population: 4,
        food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [{ q: 0, r: 0 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-rival-1': {
        id: 'city-rival-1', name: 'Carthage', owner: 'rival', position: { q: 1, r: 1 }, population: 4,
        food: 0, foodNeeded: 20, buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [{ q: 1, r: 1 }], workedTiles: [], focus: 'balanced', maturity: 'outpost', unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
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
        id: 'rival', name: 'Carthage', isHuman: false, civType: 'egypt', cities: ['city-rival-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 0, visibility: { tiles: {} }, knownCivilizations: ['player'], score: 0,
        diplomacy: createDiplomacyState(ids, 'rival'),
      },
    },
    activeCrises: { [crisis.id]: crisis },
    settings: {} as GameState['settings'],
    ...overrides,
  } as unknown as GameState;
}

describe('sabotage_relief mission availability', () => {
  it('is unlocked by covert-operations', () => {
    expect(getAvailableMissions(['covert-operations'])).toContain('sabotage_relief');
  });

  it('is not available without covert-operations (negative)', () => {
    expect(getAvailableMissions(['espionage-scouting', 'espionage-informants', 'spy-networks'])).not.toContain('sabotage_relief');
  });
});

describe('resolveMissionResult sabotage_relief eligibility', () => {
  it('targets the active outbreak crisis when eligible', () => {
    const state = makeCrisisGameState();
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBe('crisis-1');
  });

  it('is a no-op when the target civ has no active crisis (negative)', () => {
    const state = makeCrisisGameState({ activeCrises: {} });
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBeUndefined();
  });

  it('is a no-op when the crisis is a catastrophe (no remedy timer to pause) (negative)', () => {
    const state = makeCrisisGameState();
    state.activeCrises!['crisis-1'] = { ...state.activeCrises!['crisis-1'], archetype: 'catastrophe' };
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBeUndefined();
  });

  it('#590 MR3: is a no-op when the crisis is famine -- an explicit branch-audit decision, not an oversight (negative)', () => {
    // Famine reuses outbreak's remedy timer shape (remedyCompletionByCity), so it is
    // NOT structurally ineligible the way catastrophe is above -- this exclusion is a
    // deliberate scope decision (not in #590's locked interfaces), not an accident of
    // the mission's "has a remedy timer" check. If a future MR intentionally extends
    // sabotage_relief to famine, this test should be updated, not deleted silently.
    const state = makeCrisisGameState();
    state.activeCrises!['crisis-1'] = { ...state.activeCrises!['crisis-1'], archetype: 'famine', flavorId: 'crop-blight' };
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBeUndefined();
  });

  it('is a no-op when the crisis already has an active sabotage -- one active sabotage per crisis, across all actors (negative)', () => {
    const state = makeCrisisGameState();
    state.activeCrises!['crisis-1'] = {
      ...state.activeCrises!['crisis-1'],
      sabotage: { byCivId: 'some-other-civ', untilTurn: 20, discovered: false },
    };
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBeUndefined();
  });

  it('is a no-op when aiCrisisInteractions is not "full" (negative)', () => {
    const state = makeCrisisGameState({ settings: { aiCrisisInteractions: 'benign' } as GameState['settings'] });
    const result = resolveMissionResult('sabotage_relief', 'rival', 'city-rival-1', state, 'player', 'spy-1');
    expect(result.sabotageCrisisId).toBeUndefined();
  });
});

// Full integration through processEspionageTurn -- turn numbers below are precomputed
// against the exact seeded-RNG sequences (mission-success roll seeded
// `esp-turn-${turn}-player`, detection roll seeded `sab-relief-detect-spy-1-crisis-1-${turn}`)
// so the outcome is deterministic, not statistical: turn 1 rolls a mission success AND a
// detection roll under the 0.3 threshold (discovered); turn 3 rolls a mission success AND
// a detection roll at/above 0.3 (undiscovered).
function makeSpyFixture(turn: number): GameState {
  const state = makeCrisisGameState({ turn });
  return {
    ...state,
    espionage: {
      player: {
        spies: {
          'spy-1': {
            id: 'spy-1', owner: 'player', name: 'Agent Echo', unitType: 'spy_agent',
            targetCivId: 'rival', targetCityId: 'city-rival-1', position: { q: 1, r: 1 },
            status: 'on_mission', experience: 100, promotion: 'infiltrator',
            currentMission: { type: 'sabotage_relief', turnsRemaining: 1, turnsTotal: 4, targetCivId: 'rival', targetCityId: 'city-rival-1' },
            cooldownTurns: 0, promotionAvailable: false, feedsFalseIntel: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
      rival: { spies: {}, maxSpies: 1, counterIntelligence: {} },
    },
  } as unknown as GameState;
}

describe('processEspionageTurn sabotage_relief integration', () => {
  it('discovered: places the sabotage, applies bilateral reputation, and emits the discovery event', () => {
    const state = makeSpyFixture(1);
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:sabotage-relief-discovered', e => events.push(e));

    const next = processEspionageTurn(state, bus);

    expect(next.activeCrises!['crisis-1'].sabotage).toEqual({ byCivId: 'player', untilTurn: 1 + 4, discovered: true });
    expect(next.civilizations.player.diplomacy.relationships.rival).toBe(-25);
    expect(next.civilizations.rival.diplomacy.relationships.player).toBe(-25);
    expect(events).toEqual([{ crisisId: 'crisis-1', actorCivId: 'player', targetCivId: 'rival' }]);
  });

  it('undiscovered: places the sabotage but applies zero reputation change and emits nothing', () => {
    const state = makeSpyFixture(3);
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('espionage:sabotage-relief-discovered', e => events.push(e));

    const next = processEspionageTurn(state, bus);

    const sabotage = next.activeCrises!['crisis-1'].sabotage;
    expect(sabotage?.byCivId).toBe('player');
    expect(sabotage?.discovered).toBe(false);
    expect(next.civilizations.player.diplomacy.relationships.rival ?? 0).toBe(0);
    expect(next.civilizations.rival.diplomacy.relationships.player ?? 0).toBe(0);
    expect(events).toHaveLength(0);
  });
});
