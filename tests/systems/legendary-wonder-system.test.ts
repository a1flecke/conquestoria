import { describe, it, expect } from 'vitest';
import {
  getEligibleLegendaryWonders,
  unlockLegendaryWonderProject,
  loseLegendaryWonderRace,
  startLegendaryWonderBuild,
  tickLegendaryWonderProjects,
} from '@/systems/legendary-wonder-system';
import { EventBus } from '@/core/event-bus';
import { createEspionageCivState, processEspionageTurn } from '@/systems/espionage-system';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-system', () => {
  it('requires all eligibility constraints, not only one of them', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy'], resources: [] });

    const eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');

    expect(eligible).not.toContain('oracle-of-delphi');
  });

  it('returns a wonder as eligible only when every tech, resource, and city requirement is satisfied', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['philosophy', 'pilgrimages'],
      resources: ['stone'],
    });

    const eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');

    expect(eligible).toContain('oracle-of-delphi');
  });

  it('excludes river-gated wonders for cities that do not meet the river requirement', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['city-planning', 'printing'],
      resources: ['stone'],
      hasRiver: false,
    });

    const eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');

    expect(eligible).not.toContain('grand-canal');
  });

  it('unlocks construction only after every quest step is complete', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });

    const project = unlockLegendaryWonderProject(state, 'player', 'oracle-of-delphi');

    expect(project.phase).toBe('ready_to_build');
  });

  it('emits a legendary-ready event when quest completion unlocks construction', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const readyEvents: Array<{ civId: string; cityId: string; wonderId: string }> = [];
    bus.on('wonder:legendary-ready', event => readyEvents.push(event));

    tickLegendaryWonderProjects(state, bus);

    expect(readyEvents).toEqual([
      { civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi' },
    ]);
  });

  it('moves a ready project into the building phase when construction starts', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';

    const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi');

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('building');
  });

  it('surfaces a build-start event to observers with stationed spies in the target city', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const revealedEvents: Array<{ observerId: string; civId: string; cityId: string; wonderId: string }> = [];
    bus.on('wonder:legendary-race-revealed', event => revealedEvents.push(event));
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.pendingEvents = {};
    state.espionage = {
      player: { spies: {}, maxSpies: 1, counterIntelligence: {} },
      observer: {
        spies: {
          'spy-1': {
            id: 'spy-1',
            owner: 'observer',
            name: 'Agent Echo',
            targetCivId: 'player',
            targetCityId: 'city-river',
            position: { q: 2, r: 2 },
            status: 'stationed',
            experience: 0,
            currentMission: null,
            cooldownTurns: 0,
            promotionAvailable: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
    };
    state.civilizations.observer = {
      id: 'observer',
      name: 'Observer',
      color: '#999',
      isHuman: false,
      civType: 'generic',
      cities: [],
      units: [],
      techState: { completed: [], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
      gold: 0,
      visibility: { tiles: {} },
      score: 0,
      diplomacy: {
        relationships: { player: 0 },
        treaties: [],
        events: [],
        atWarWith: [],
        treacheryScore: 0,
        vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
      },
    };

    const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi', bus);

    expect(result.pendingEvents?.observer?.[0]?.message).toMatch(/oracle of delphi/i);
    expect(revealedEvents).toEqual([
      { observerId: 'observer', civId: 'player', cityId: 'city-river', wonderId: 'oracle-of-delphi' },
    ]);
  });

  it('tracks invested production from the active city queue while a legendary wonder is building', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 40;

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].investedProduction).toBe(40);
  });

  it('converts 25 percent to coins and 25 percent to city carryover when a race is lost', () => {
    const result = loseLegendaryWonderRace(200);

    expect(result.goldRefund).toBe(50);
    expect(result.transferableProduction).toBe(50);
    expect(result.lostProduction).toBe(100);
  });

  it('keeps legendary wonder invested production in sync when sabotage hits the active build', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.legendaryWonderProjects!['oracle-of-delphi'].investedProduction = 40;
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 40;
    state.civilizations.observer = {
      id: 'observer',
      name: 'Observer',
      color: '#999',
      isHuman: false,
      civType: 'generic',
      cities: [],
      units: [],
      techState: { completed: ['spy-networks', 'sabotage'], currentResearch: null, researchProgress: 0, trackPriorities: {} as any },
      gold: 0,
      visibility: { tiles: {} },
      score: 0,
      diplomacy: {
        relationships: { player: 0 },
        treaties: [],
        events: [],
        atWarWith: [],
        treacheryScore: 0,
        vassalage: { overlord: null, vassals: [], protectionScore: 100, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
      },
    };
    state.espionage = {
      player: createEspionageCivState(),
      observer: {
        spies: {
          'spy-1': {
            id: 'spy-1',
            owner: 'observer',
            name: 'Agent Echo',
            targetCivId: 'player',
            targetCityId: 'city-river',
            position: { q: 2, r: 2 },
            status: 'on_mission',
            experience: 0,
            currentMission: {
              type: 'sabotage_production',
              turnsRemaining: 1,
              turnsTotal: 4,
              targetCivId: 'player',
              targetCityId: 'city-river',
            },
            cooldownTurns: 0,
            promotionAvailable: false,
          },
        },
        maxSpies: 1,
        counterIntelligence: {},
      },
    };

    let sabotagedState = state;
    let sabotageSucceeded = false;
    for (let turn = 40; turn < 80; turn++) {
      const attempt = structuredClone(state);
      attempt.turn = turn;
      const result = processEspionageTurn(attempt, new EventBus());
      if (result.cities['city-river'].productionProgress < 40) {
        sabotagedState = result;
        sabotageSucceeded = true;
        break;
      }
    }

    expect(sabotageSucceeded).toBe(true);
    expect(sabotagedState.legendaryWonderProjects!['oracle-of-delphi'].investedProduction)
      .toBe(sabotagedState.cities['city-river'].productionProgress);
  });
});
