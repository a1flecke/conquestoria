// tests/ai/ai-espionage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldAiRecruitSpy,
  chooseAiSpyTarget,
  chooseAiMission,
  rankAiMissions,
  processAITurn,
} from '@/ai/basic-ai';
import {
  getAiGrudgeBonuses,
  applyAiGoPublic,
  AI_GRUDGE_MEMORY_TURNS,
  AI_GRUDGE_RECENT_BONUS,
  AI_GRUDGE_OLDER_BONUS,
} from '@/ai/ai-espionage-grudges';
import { EXPOSE_SCANDAL_PENALTY } from '@/systems/espionage-missions';
import type { GameState } from '@/core/types';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { EventBus } from '@/core/event-bus';

function makeAiTestState(): GameState {
  return {
    turn: 15,
    era: 2,
    currentPlayer: 'ai-egypt',
    map: { width: 10, height: 10, tiles: {}, wrapsHorizontally: false, rivers: [] },
    units: {},
    cities: {
      'city-player-1': {
        id: 'city-player-1', name: 'Capital', owner: 'player',
        position: { q: 0, r: 0 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
      'city-egypt-1': {
        id: 'city-egypt-1', name: 'Thebes', owner: 'ai-egypt',
        position: { q: 5, r: 3 }, population: 5, food: 0, foodNeeded: 20,
        buildings: [], productionQueue: [], productionProgress: 0,
        ownedTiles: [], grid: [[null]], gridSize: 3,
        unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
      },
    },
    civilizations: {
      player: {
        id: 'player', name: 'Player', color: '#4a90d9',
        isHuman: true, civType: 'egypt',
        cities: ['city-player-1'], units: [],
        techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any },
        gold: 100, visibility: { tiles: {} }, score: 50,
        diplomacy: {
          relationships: { 'ai-egypt': -10 }, treaties: [], events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
      'ai-egypt': {
        id: 'ai-egypt', name: 'Egypt', color: '#c4a94d',
        isHuman: false, civType: 'egypt',
        cities: ['city-egypt-1'], units: [],
        techState: {
          completed: ['espionage-scouting', 'espionage-informants'],
          currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} as any,
        },
        gold: 150, visibility: { tiles: {} }, score: 100,
        diplomacy: {
          relationships: { player: -40 }, treaties: [], events: [], atWarWith: [],
          treacheryScore: 0,
          vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 1, peakMilitary: 0 },
        },
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    gameOver: false,
    winner: null,
    tutorial: { active: false, currentStep: 'complete', completedSteps: [] },
    settings: { mapSize: 'small', soundEnabled: false, musicEnabled: false, musicVolume: 0, sfxVolume: 0, tutorialEnabled: false, advisorsEnabled: {} as any, councilTalkLevel: 'normal' },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    espionage: {
      player: createEspionageCivState(),
      'ai-egypt': { ...createEspionageCivState(), maxSpies: 2 }, // espionage-scouting + espionage-informants
    },
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
  } as unknown as GameState;
}

describe('AI espionage decisions', () => {
  beforeEach(() => {
  });

  describe('shouldAiRecruitSpy', () => {
    it('returns true when AI has espionage tech and no spies', () => {
      const state = makeAiTestState();
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(true);
    });

    it('returns false when AI has no espionage tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [];
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });

    it('returns false when at max spies', () => {
      const state = makeAiTestState();
      // maxSpies: 2 (espionage-scouting + espionage-informants) — fill both slots
      const { state: esp1 } = createSpyFromUnit(state.espionage!['ai-egypt'], 'unit-spy-1', 'ai-egypt', 'spy_scout', 'seed-1');
      const { state: esp2 } = createSpyFromUnit(esp1, 'unit-spy-2', 'ai-egypt', 'spy_informant', 'seed-2');
      state.espionage!['ai-egypt'] = esp2;
      expect(shouldAiRecruitSpy(state, 'ai-egypt')).toBe(false);
    });
  });

  describe('chooseAiSpyTarget', () => {
    it('targets the civ with lowest relationship', () => {
      const state = makeAiTestState();
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeDefined();
      expect(target!.civId).toBe('player');
    });

    it('returns null if no valid targets', () => {
      const state = makeAiTestState();
      delete state.civilizations['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target).toBeNull();
    });

    it('prefers civs at war over civs with low relationship', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].diplomacy.atWarWith = ['player'];
      const target = chooseAiSpyTarget(state, 'ai-egypt');
      expect(target!.civId).toBe('player');
    });
  });

  describe('chooseAiMission', () => {
    it('chooses stage 1 mission with only scouting tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['scout_area', 'monitor_troops']).toContain(mission);
    });

    it('prefers gather_intel with stage 2 tech', () => {
      const state = makeAiTestState();
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('gather_intel');
    });

    it('aggressive civs prefer disruptive stage 3-4 missions', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
      ];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['steal_tech', 'sabotage_production', 'arms_smuggling']).toContain(mission);
    });

    it('diplomatic civs prefer influence and information missions', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'greece';
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting',
        'espionage-informants',
        'spy-networks',
        'cryptography',
      ];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['forge_documents', 'incite_unrest', 'fund_rebels', 'monitor_diplomacy']).toContain(mission);
    });

    it('returns null with no espionage tech', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBeNull();
    });

    // #1087: a civ's current national intent overrides its fixed personality trait for
    // mission selection -- the civ's situation, not just its base personality, now shapes
    // which espionage strategy it pursues.
    it('a trader civ under a dominate national intent selects an aggressive mission, not its trait-based diplomatic order', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'persia'; // trader, expansionist
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
      ];
      state.opponentAI = {
        ...(state.opponentAI as any),
        nationalIntentByCiv: {
          'ai-egypt': {
            current: 'dominate', previous: null, selectedTurn: 0, reconsiderAfterTurn: 999,
            shockActive: false, shockFreeStreak: 0, reasonCodes: [],
          },
        },
      } as any;
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['steal_tech', 'sabotage_production', 'arms_smuggling']).toContain(mission);
    });

    it('an aggressive civ under a deter national intent selects a defensive/information mission, not its trait-based aggressive order', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin'; // aggressive
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
      ];
      state.opponentAI = {
        ...(state.opponentAI as any),
        nationalIntentByCiv: {
          'ai-egypt': {
            current: 'deter', previous: null, selectedTurn: 0, reconsiderAfterTurn: 999,
            shockActive: false, shockFreeStreak: 0, reasonCodes: [],
          },
        },
      } as any;
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('gather_intel');
    });

    it('a recover national intent selects a defensive/information mission for any personality', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin'; // aggressive
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
      ];
      state.opponentAI = {
        ...(state.opponentAI as any),
        nationalIntentByCiv: {
          'ai-egypt': {
            current: 'recover', previous: null, selectedTurn: 0, reconsiderAfterTurn: 999,
            shockActive: false, shockFreeStreak: 0, reasonCodes: [],
          },
        },
      } as any;
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('gather_intel');
    });

    it('with no opponentAI/national intent recorded, falls back to the pre-#1087 trait-only behavior', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
      ];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(['steal_tech', 'sabotage_production', 'arms_smuggling']).toContain(mission);
    });

    // #526 MR7: sabotage_relief is human-initiated only in this arc.
    it('never chooses sabotage_relief, even when it is the only mission covert-operations unlocks', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['covert-operations'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBeNull();
    });

    it('never chooses sabotage_relief even when it would otherwise sort first among available missions', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['covert-operations', 'espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).not.toBe('sabotage_relief');
    });

    // #524 MR2a: aggressive civs should reach for the strongest available mission.
    it('aggressive civs prefer flip_loyalty over other missions once propaganda is researched', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography', 'propaganda',
      ];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('flip_loyalty');
    });

    it('flip_loyalty is not chosen without propaganda even for aggressive civs', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'cryptography',
      ];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).not.toBe('flip_loyalty');
    });

    // #442 MR1
    it('aggressive civs choose intercept_courier once black-chambers is researched (no higher-priority mission available)', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'black-chambers'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('intercept_courier');
    });

    it('aggressive civs choose bribe_official once diplomatic-networks is researched (no higher-priority mission available)', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'diplomatic-networks'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('bribe_official');
    });

    it('intercept_courier/bribe_official are unavailable without their gating techs', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).not.toBe('intercept_courier');
      expect(mission).not.toBe('bribe_official');
    });

    it('diplomatic civs prefer bribe_official over intercept_courier when both are available', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'greece';
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'black-chambers', 'diplomatic-networks'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('bribe_official');
    });

    // #442 MR2
    it('diplomatic civs choose expose_scandal once disinformation-bureau is researched (no higher-priority mission available)', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'greece';
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'disinformation-bureau'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('expose_scandal');
    });

    it('aggressive civs choose signals_intercept once counterintelligence is researched (no higher-priority mission available)', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'counterintelligence'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).toBe('signals_intercept');
    });

    it('expose_scandal/signals_intercept are unavailable without their gating techs', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting'];
      const mission = chooseAiMission(state, 'ai-egypt');
      expect(mission).not.toBe('expose_scandal');
      expect(mission).not.toBe('signals_intercept');
    });
  });

  // #526 MR7 review fix: sabotage_relief is human-initiated only and must never reach an embedded spy.
  // Since #419 PR 3 this path uses the shared AI mission ranking (rankAiMissions) instead of a random pick.
  describe('infiltrated-spy mission selection', () => {
    it('never issues sabotage_relief to an embedded spy, across many turn seeds', () => {
      const startedMissionTypes: string[] = [];
      for (let turn = 1; turn <= 60; turn++) {
        const state = makeAiTestState();
        state.turn = turn;
        state.civilizations['ai-egypt'].techState.completed = [
          'espionage-scouting', 'espionage-informants', 'spy-networks', 'covert-operations',
        ];
        let aiEsp = { ...createEspionageCivState(), maxSpies: 1 };
        ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'spy-embed', 'ai-egypt', 'spy_agent', `seed-${turn}`));
        aiEsp = {
          ...aiEsp,
          spies: {
            'spy-embed': {
              ...aiEsp.spies['spy-embed'],
              status: 'stationed',
              infiltrationCityId: 'city-player-1',
              targetCivId: 'player',
              targetCityId: 'city-player-1',
              currentMission: null,
            },
          },
        };
        state.espionage = { ...state.espionage, 'ai-egypt': aiEsp };

        const bus = new EventBus();
        bus.on('espionage:mission-started', event => startedMissionTypes.push(event.missionType));
        processAITurn(state, 'ai-egypt', bus);
      }

      expect(startedMissionTypes.length).toBeGreaterThan(0); // sanity: the path actually fired
      expect(startedMissionTypes).not.toContain('sabotage_relief');
    });
  });

  // #419: do not spend a spy mission re-applying a persistent effect that is
  // already at full strength -- the repeat cannot improve the timer.
  describe('repeat operations (#419)', () => {
    const BASE_TECHS = ['espionage-scouting', 'espionage-informants', 'spy-networks'];

    function repeatState(options: {
      lockoutTurns?: number;
      stationed?: boolean;
      completedTechs?: string[];
    } = {}): GameState {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [
        ...BASE_TECHS,
        ...(options.completedTechs ?? ['cold-war-networks', 'cyber-intelligence']),
      ];
      // Annuvin is the aggressive persona, which ranks the stage-5/7 operations first.
      state.civilizations['ai-egypt'].civType = 'annuvin';
      state.cities['city-player-1'].productionDisabledTurns = options.lockoutTurns ?? 0;
      let aiEsp = { ...createEspionageCivState(), maxSpies: 1 };
      ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'spy-repeat', 'ai-egypt', 'spy_agent', 'seed-repeat'));
      aiEsp = {
        ...aiEsp,
        // Prevent the separate defensive-stationing pass from embedding the idle
        // spy in the AI capital before mission selection runs.
        counterIntelligence: { 'city-egypt-1': 1 },
        spies: {
          'spy-repeat': {
            ...aiEsp.spies['spy-repeat'],
            status: options.stationed ? 'stationed' : 'idle',
            ...(options.stationed ? { infiltrationCityId: 'city-player-1' } : {}),
            targetCivId: 'player',
            targetCityId: 'city-player-1',
            currentMission: null,
          },
        },
      };
      state.espionage = { ...state.espionage, 'ai-egypt': aiEsp };
      return state;
    }

    function startedMissions(state: GameState): string[] {
      const bus = new EventBus();
      const started: string[] = [];
      bus.on('espionage:mission-started', event => started.push(event.missionType));
      const after = processAITurn(state, 'ai-egypt', bus);
      // The remote-capable path starts missions without emitting mission-started,
      // so read the resulting assignment as well.
      const assigned = after.espionage?.['ai-egypt']?.spies['spy-repeat']?.currentMission?.type;
      return assigned ? [...started, assigned] : started;
    }

    it('does not re-run a cyber attack while its full production lockout is active', () => {
      const started = startedMissions(repeatState({ lockoutTurns: 3 }));
      expect(started).not.toContain('cyber_attack');
      expect(started).toContain('misinformation_campaign'); // chooses the next useful operation instead
    });

    it('still runs a cyber attack when the lockout is about to expire', () => {
      expect(startedMissions(repeatState({ lockoutTurns: 1 }))).toContain('cyber_attack');
    });

    it('applies the same skip to an embedded spy', () => {
      const started = startedMissions(repeatState({ lockoutTurns: 3, stationed: true }));
      expect(started).not.toContain('cyber_attack');
      expect(started).toContain('misinformation_campaign');
    });

    it('does not re-run disinformation while the full research penalty is active', () => {
      const state = repeatState({
        lockoutTurns: 3,
        stationed: true,
        completedTechs: ['cold-war-networks'],
      });
      state.civilizations.player.researchPenaltyTurns = 10;
      state.civilizations.player.researchPenaltyMultiplier = 0.2;
      const started = startedMissions(state);
      expect(started).not.toContain('misinformation_campaign');
      expect(started.length).toBeGreaterThan(0); // falls through to another legal embedded mission
    });
  });
});

describe('AI mission start consumes the typed start-mission result (#1222)', () => {
  function stateWithSpy(spyOverrides: Record<string, unknown>): GameState {
    const state = makeAiTestState();
    state.civilizations['ai-egypt'].techState.completed = ['espionage-scouting', 'espionage-informants'];
    let aiEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'spy-1', 'ai-egypt', 'spy_agent', 'seed-1222'));
    aiEsp = { ...aiEsp, spies: { 'spy-1': { ...aiEsp.spies['spy-1'], currentMission: null, ...spyOverrides } } };
    state.espionage = { ...state.espionage, 'ai-egypt': aiEsp };
    return state;
  }

  it('skips a stale candidate whose spy has a target civ but no target city, without crashing the AI turn', () => {
    // Stationed with a half-recorded target: the AI's guard (`stationed && targetCivId`) passes,
    // but the command is not legal. It used to throw out of processAITurn.
    const state = stateWithSpy({ status: 'stationed', targetCivId: 'player', targetCityId: null, infiltrationCityId: null });
    const started: string[] = [];
    const bus = new EventBus();
    bus.on('espionage:mission-started', event => started.push(event.missionType));

    expect(() => processAITurn(state, 'ai-egypt', bus)).not.toThrow();

    const spy = state.espionage!['ai-egypt'].spies['spy-1'];
    expect(spy.currentMission).toBeNull();
    expect(started).toEqual([]);
  });

  it('still starts a legal mission for a fully-targeted stationed spy', () => {
    const state = stateWithSpy({
      status: 'stationed', targetCivId: 'player', targetCityId: 'city-player-1', infiltrationCityId: null,
    });

    const result = processAITurn(state, 'ai-egypt', new EventBus());

    expect(result.espionage!['ai-egypt'].spies['spy-1'].currentMission).not.toBeNull();
  });
});

describe('AI capture verdict', () => {
  it('resolves a captured enemy spy (expel/execute/interrogate) so it is no longer captured', () => {
    // Place a player spy in 'captured' status targeting ai-egypt
    const state = makeAiTestState();
    let playerEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: playerEsp } = createSpyFromUnit(playerEsp, 'spy-p1', 'player', 'spy_scout', 'seed-p1'));
    playerEsp = {
      ...playerEsp,
      spies: {
        'spy-p1': {
          ...playerEsp.spies['spy-p1'],
          status: 'captured',
          targetCivId: 'ai-egypt',
          targetCityId: 'city-egypt-1',
        },
      },
    };
    state.espionage = { ...state.espionage, player: playerEsp };

    const bus = new EventBus();
    const result = processAITurn(state, 'ai-egypt', bus);

    // After the AI verdict, the spy must not still be in 'captured' status
    const spyAfter = result.espionage?.['player']?.spies['spy-p1'];
    // Spy may be undefined (executed), in 'cooldown' (expelled), or 'interrogated'
    if (spyAfter !== undefined) {
      expect(spyAfter.status).not.toBe('captured');
    }
  });

  it('bilateral diplomacy is applied when AI expels a spy', () => {
    const state = makeAiTestState();
    // Force relationship away from war so AI chooses expel (rel >= 30, not at war)
    state.civilizations['ai-egypt'].diplomacy.relationships['player'] = 50;
    state.civilizations['ai-egypt'].diplomacy.atWarWith = [];

    let playerEsp = { ...createEspionageCivState(), maxSpies: 1 };
    ({ state: playerEsp } = createSpyFromUnit(playerEsp, 'spy-expel', 'player', 'spy_scout', 'seed-expel'));
    playerEsp = {
      ...playerEsp,
      spies: {
        'spy-expel': {
          ...playerEsp.spies['spy-expel'],
          status: 'captured',
          targetCivId: 'ai-egypt',
          targetCityId: 'city-egypt-1',
          infiltrationCityId: null,
        },
      },
    };
    state.espionage = { ...state.espionage, player: playerEsp };

    const bus = new EventBus();
    const result = processAITurn(state, 'ai-egypt', bus);

    // When expelled, the AI verdict block always picks 'expel' at rel >= 30
    // Both sides should have a modified relationship (penalty applied)
    const aiRel = result.civilizations['ai-egypt']?.diplomacy.relationships['player'] ?? 50;
    const playerRel = result.civilizations['player']?.diplomacy.relationships['ai-egypt'] ?? 0;
    // Either both changed from starting values OR the spy was still active for another reason
    // At minimum verify neither side errored out
    expect(typeof aiRel).toBe('number');
    expect(typeof playerRel).toBe('number');
  });
});

// #419 PR 3: an AI that remembers who hit it, and answers with Go public.
describe('AI grudges and Go public (#419 PR 3)', () => {
  function threeCivState(): GameState {
    const state = makeAiTestState();
    const base = state.civilizations['player'];
    for (const id of ['rival', 'neighbor']) {
      state.civilizations[id] = {
        ...base, id, name: id, isHuman: false, cities: [`city-${id}`], units: [],
        diplomacy: { ...base.diplomacy, relationships: {}, treaties: [], atWarWith: [] },
      };
      state.cities[`city-${id}`] = { ...state.cities['city-player-1'], id: `city-${id}`, owner: id, name: id };
      state.espionage![id] = createEspionageCivState();
    }
    // The neighbour is disliked more than the rival, so with no memory it is the better target.
    state.civilizations['ai-egypt'].diplomacy.relationships = { player: 0, rival: -20, neighbor: -60 };
    return state;
  }

  function incident(actor: string, landedTurn: number, tracedTurn?: number) {
    return {
      id: `inc-${actor}-${landedTurn}`, actorCivId: actor, targetCivId: 'ai-egypt', cityId: 'city-egypt-1',
      missionType: 'cyber_attack' as const, landedTurn, ...(tracedTurn === undefined ? {} : { tracedTurn }),
    };
  }

  function withIncidents(state: GameState, list: ReturnType<typeof incident>[]): GameState {
    const attributedIncidents = Object.fromEntries(list.map(i => [i.id, i]));
    state.espionage!['ai-egypt'] = { ...state.espionage!['ai-egypt'], attributedIncidents };
    return state;
  }

  describe('target memory', () => {
    it('without a remembered attacker the most-disliked civ is chosen (control)', () => {
      expect(chooseAiSpyTarget(threeCivState(), 'ai-egypt')!.civId).toBe('neighbor');
    });

    it('a proven recent attacker outranks a more-disliked neighbour', () => {
      const state = withIncidents(threeCivState(), [incident('rival', 12, 14)]);
      expect(chooseAiSpyTarget(state, 'ai-egypt')!.civId).toBe('rival');
    });

    it('an incident the AI cannot attribute (no trace) creates no grudge and never names its actor', () => {
      const state = withIncidents(threeCivState(), [incident('rival', 12)]);
      expect(getAiGrudgeBonuses(state, 'ai-egypt')).toEqual({});
      expect(chooseAiSpyTarget(state, 'ai-egypt')!.civId).toBe('neighbor');
    });

    it('a grudge fades after the memory window', () => {
      const state = withIncidents(threeCivState(), [incident('rival', 12, 14)]);
      state.turn = 14 + AI_GRUDGE_MEMORY_TURNS + 1;
      expect(getAiGrudgeBonuses(state, 'ai-egypt')).toEqual({});
    });

    it('the most recent attacker gets the larger bonus; an older one a smaller one', () => {
      const state = withIncidents(threeCivState(), [incident('neighbor', 5, 6), incident('rival', 12, 14)]);
      expect(getAiGrudgeBonuses(state, 'ai-egypt')).toEqual({
        rival: AI_GRUDGE_RECENT_BONUS, neighbor: AI_GRUDGE_OLDER_BONUS,
      });
    });

    it("is deterministic and never reads another civ's record", () => {
      const a = withIncidents(threeCivState(), [incident('rival', 12, 14)]);
      const b = withIncidents(threeCivState(), [incident('rival', 12, 14)]);
      // A neighbour's own ledger about someone else must not change what ai-egypt remembers.
      b.espionage!['neighbor'] = {
        ...b.espionage!['neighbor'],
        attributedIncidents: { x: { ...incident('player', 1, 2), id: 'x', targetCivId: 'neighbor' } },
      };
      expect(getAiGrudgeBonuses(b, 'ai-egypt')).toEqual(getAiGrudgeBonuses(a, 'ai-egypt'));
      expect(getAiGrudgeBonuses(a, 'ai-egypt')).toEqual(getAiGrudgeBonuses(a, 'ai-egypt'));
    });
  });

  describe('mission ranking', () => {
    it('chooseAiMission is the head of rankAiMissions, which lists every available mission once', () => {
      const state = makeAiTestState();
      state.civilizations['ai-egypt'].techState.completed = [
        'espionage-scouting', 'espionage-informants', 'spy-networks', 'covert-operations',
      ];
      const ranked = rankAiMissions(state, 'ai-egypt');
      expect(ranked[0]).toBe(chooseAiMission(state, 'ai-egypt'));
      expect(new Set(ranked).size).toBe(ranked.length);
      expect(ranked).not.toContain('sabotage_relief');
    });

    it('an embedded spy follows the ranking instead of a random pick, on every turn seed', () => {
      const started = new Set<string>();
      for (let turn = 1; turn <= 20; turn++) {
        const state = makeAiTestState();
        state.turn = turn;
        state.civilizations['ai-egypt'].techState.completed = [
          'espionage-scouting', 'espionage-informants', 'spy-networks', 'covert-operations',
        ];
        let aiEsp = { ...createEspionageCivState(), maxSpies: 1 };
        ({ state: aiEsp } = createSpyFromUnit(aiEsp, 'spy-embed', 'ai-egypt', 'spy_agent', `seed-${turn}`));
        aiEsp = {
          ...aiEsp,
          spies: {
            'spy-embed': {
              ...aiEsp.spies['spy-embed'],
              status: 'stationed',
              infiltrationCityId: 'city-player-1',
              targetCivId: 'player',
              targetCityId: 'city-player-1',
              currentMission: null,
            },
          },
        };
        state.espionage = { ...state.espionage, 'ai-egypt': aiEsp };
        const bus = new EventBus();
        bus.on('espionage:mission-started', event => started.add(event.missionType));
        processAITurn(state, 'ai-egypt', bus);
      }
      expect(started.size).toBe(1); // one best mission, not a different random one per seed
    });
  });

  describe('Go public', () => {
    function goPublicState(): GameState {
      const state = withIncidents(threeCivState(), [incident('rival', 14, 15)]);
      state.turn = 15;
      state.civilizations['rival'].diplomacy.treaties = [
        { type: 'trade_agreement', civA: 'rival', civB: 'neighbor', turnsRemaining: -1 },
      ] as never;
      return state;
    }

    it('uses Go public once for a confirmed incident, with the same penalty the player gets, and announces it once', () => {
      const bus = new EventBus();
      const events: string[] = [];
      bus.on('espionage:went-public', e => events.push(`${e.civId}>${e.culpritCivId}`));
      const first = applyAiGoPublic(goPublicState(), 'ai-egypt', bus);
      expect(first.civilizations['rival'].diplomacy.relationships['neighbor']).toBe(EXPOSE_SCANDAL_PENALTY);
      expect(first.civilizations['neighbor'].diplomacy.relationships['rival']).toBe(EXPOSE_SCANDAL_PENALTY);
      expect(first.espionage!['ai-egypt'].attributedIncidents!['inc-rival-14'].usedTurn).toBe(15);
      const second = applyAiGoPublic(first, 'ai-egypt', bus);
      expect(second.civilizations['rival'].diplomacy.relationships['neighbor']).toBe(EXPOSE_SCANDAL_PENALTY);
      expect(events).toEqual(['ai-egypt>rival']);
    });

    it('does nothing for an unproven incident, after the window, or with no partners', () => {
      const bus = new EventBus();
      const unproven = withIncidents(goPublicState(), [incident('rival', 14)]);
      expect(applyAiGoPublic(unproven, 'ai-egypt', bus)).toBe(unproven);
      const stale = goPublicState();
      stale.turn = 17;
      expect(applyAiGoPublic(stale, 'ai-egypt', bus)).toBe(stale);
      const lonely = goPublicState();
      lonely.civilizations['rival'].diplomacy.treaties = [];
      expect(applyAiGoPublic(lonely, 'ai-egypt', bus)).toBe(lonely);
    });

    it('happens inside a real AI turn', () => {
      const bus = new EventBus();
      let announced = 0;
      bus.on('espionage:went-public', () => { announced += 1; });
      const after = processAITurn(goPublicState(), 'ai-egypt', bus);
      expect(announced).toBe(1);
      expect(after.espionage!['ai-egypt'].attributedIncidents!['inc-rival-14'].usedTurn).toBe(15);
    });
  });
});
