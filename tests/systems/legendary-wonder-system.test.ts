import { describe, it, expect } from 'vitest';
import {
  initializeLegendaryWonderProjectsForCity,
  getEligibleLegendaryWonders,
  getLegendaryWonderCityYieldBonus,
  getLegendaryWonderCivYieldBonus,
  unlockLegendaryWonderProject,
  loseLegendaryWonderRace,
  startLegendaryWonderBuild,
  tickLegendaryWonderProjects,
} from '@/systems/legendary-wonder-system';
import { EventBus } from '@/core/event-bus';
import { createEspionageCivState, processEspionageTurn } from '@/systems/espionage-system';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-system', () => {
  it('seeds the full approved legendary wonder roster for a newly founded city', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects = undefined;

    const result = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');

    expect(Object.values(result.legendaryWonderProjects ?? {}).filter(project => project.cityId === 'city-river')).toHaveLength(15);
  });

  it('allows multiple civilizations to pursue the same legendary wonder in different cities', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects = undefined;

    const withPlayerProjects = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const withRivalProjects = initializeLegendaryWonderProjectsForCity(withPlayerProjects, 'rival', 'city-rival');
    const grandCanalProjects = Object.values(withRivalProjects.legendaryWonderProjects ?? {}).filter(project => project.wonderId === 'grand-canal');

    expect(grandCanalProjects).toHaveLength(2);
    expect(new Set(grandCanalProjects.map(project => project.cityId))).toEqual(new Set(['city-river', 'city-rival']));
  });

  it('does not seed a legendary wonder that has already been completed globally', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects = undefined;
    state.completedLegendaryWonders = {
      'oracle-of-delphi': {
        ownerId: 'player',
        cityId: 'city-river',
        turnCompleted: 32,
      },
    };

    const result = initializeLegendaryWonderProjectsForCity(state, 'rival', 'city-rival');

    expect(Object.values(result.legendaryWonderProjects ?? {}).some(project =>
      project.cityId === 'city-rival' && project.wonderId === 'oracle-of-delphi',
    )).toBe(false);
  });

  it('sanitizes stale projects for wonders that were already completed globally', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    state.completedLegendaryWonders = {
      'oracle-of-delphi': {
        ownerId: 'player',
        cityId: 'city-river',
        turnCompleted: 32,
      },
    };
    state.cities['late-city'] = {
      ...state.cities['city-river'],
      id: 'late-city',
      name: 'Late City',
      owner: 'player',
    };
    state.civilizations.player.cities.push('late-city');
    state.legendaryWonderProjects!['oracle-of-delphi:player:late-city'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'player',
      cityId: 'late-city',
      phase: 'ready_to_build',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: [],
    };

    const started = startLegendaryWonderBuild(state, 'player', 'late-city', 'oracle-of-delphi');
    const ticked = tickLegendaryWonderProjects(started, new EventBus());

    expect(Object.values(ticked.legendaryWonderProjects ?? {}).some(project =>
      project.cityId === 'late-city' && project.wonderId === 'oracle-of-delphi',
    )).toBe(false);
    expect(ticked.completedLegendaryWonders?.['oracle-of-delphi']).toEqual({
      ownerId: 'player',
      cityId: 'city-river',
      turnCompleted: 32,
    });
  });

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

  it('keeps manhattan project locked until nuclear-theory is researched', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: [],
      resources: ['iron'],
    });

    let eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');
    expect(eligible).not.toContain('manhattan-project');

    state.civilizations.player.techState.completed.push('nuclear-theory');
    eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');

    expect(eligible).toContain('manhattan-project');
  });

  it('keeps internet locked until both mass-media and global-logistics are researched', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: [],
      resources: [],
    });

    let eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');
    expect(eligible).not.toContain('internet');

    state.civilizations.player.techState.completed.push('mass-media');
    eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');
    expect(eligible).not.toContain('internet');

    state.civilizations.player.techState.completed.push('global-logistics');
    eligible = getEligibleLegendaryWonders(state, 'player', 'city-river');

    expect(eligible).toContain('internet');
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

  it('does not allow the same civilization to start the same wonder in two cities', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    state.cities['city-second'] = {
      ...state.cities['city-river'],
      id: 'city-second',
      name: 'Second City',
      owner: 'player',
      position: { q: 3, r: 2 },
      ownedTiles: [{ q: 3, r: 2 }],
    };
    state.map.tiles['3,2'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 3, r: 2 },
      owner: 'player',
    };
    state.civilizations.player.cities.push('city-second');

    const seededState = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-second');
    const riverProject = Object.entries(seededState.legendaryWonderProjects ?? {}).find(([, project]) =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'oracle-of-delphi',
    );
    const secondProject = Object.entries(seededState.legendaryWonderProjects ?? {}).find(([, project]) =>
      project.ownerId === 'player' && project.cityId === 'city-second' && project.wonderId === 'oracle-of-delphi',
    );

    if (!riverProject || !secondProject) {
      throw new Error('expected player oracle projects in both cities');
    }

    seededState.legendaryWonderProjects![riverProject[0]] = {
      ...riverProject[1],
      phase: 'ready_to_build',
      questSteps: riverProject[1].questSteps.map(step => ({ ...step, completed: true })),
    };
    seededState.legendaryWonderProjects![secondProject[0]] = {
      ...secondProject[1],
      phase: 'ready_to_build',
      questSteps: secondProject[1].questSteps.map(step => ({ ...step, completed: true })),
    };

    const firstStart = startLegendaryWonderBuild(seededState, 'player', 'city-river', 'oracle-of-delphi');
    const secondStart = startLegendaryWonderBuild(firstStart, 'player', 'city-second', 'oracle-of-delphi');

    const buildingProjects = Object.values(secondStart.legendaryWonderProjects ?? {}).filter(project =>
      project.ownerId === 'player' && project.wonderId === 'oracle-of-delphi' && project.phase === 'building',
    );

    expect(buildingProjects).toHaveLength(1);
    expect(buildingProjects[0].cityId).toBe('city-river');
    expect(firstStart.cities['city-river'].productionQueue).toEqual(['legendary:oracle-of-delphi']);
    expect(secondStart.cities['city-second'].productionQueue).toEqual([]);
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
    expect(result.legendaryWonderIntel?.observer).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectKey: expect.stringContaining('oracle-of-delphi'),
        wonderId: 'oracle-of-delphi',
        civId: 'player',
        cityId: 'city-river',
        intelLevel: 'started',
      }),
    ]));
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

  it('resolves the race globally when one civ completes a legendary wonder', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, resources: ['stone'] });
    state.legendaryWonderProjects!['grand-canal'].phase = 'building';
    state.legendaryWonderProjects!['grand-canal'].investedProduction = 145;
    state.cities['city-river'].productionQueue = ['legendary:grand-canal'];
    state.cities['city-river'].productionProgress = 150;
    state.cities['city-rival'].productionQueue = ['legendary:grand-canal'];
    state.cities['city-rival'].productionProgress = 90;
    state.legendaryWonderProjects!['grand-canal-rival'].investedProduction = 90;

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.legendaryWonderProjects!['grand-canal'].phase).toBe('completed');
    expect(result.legendaryWonderProjects!['grand-canal-rival'].phase).toBe('lost_race');
    expect(result.legendaryWonderProjects!['grand-canal-rival'].transferableProduction).toBe(22);
    expect(result.cities['city-rival'].productionQueue).toEqual([]);
    expect(result.cities['city-rival'].productionProgress).toBe(0);
    expect(result.civilizations.rival.gold).toBe(222);
  });

  it('applies the winning wonder reward when construction completes', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, resources: ['stone'] });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 120;

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.civilizations.player.techState.researchProgress).toBeGreaterThan(0);
    expect(result.completedLegendaryWonders?.['oracle-of-delphi']?.ownerId).toBe('player');
  });

  it('does not auto-complete stronghold quests just because no nearby camp exists', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['architecture-arts', 'theology-tech'],
      resources: ['stone'],
    });
    state.legendaryWonderProjects = {
      'sun-spire:player:city-river': {
        wonderId: 'sun-spire',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
          { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: false },
        ],
      },
    };
    state.barbarianCamps = {};
    state.legendaryWonderHistory = { destroyedStrongholds: [], discoveredSites: [] };

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.phase).toBe('questing');
    expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.questSteps[1]?.completed).toBe(false);
  });

  it('does not let another developed city satisfy grand canal host-city development', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['city-planning', 'printing'],
      resources: ['stone'],
    });

    state.cities['city-river'].buildings = ['granary'];
    state.cities['city-river'].population = 7;
    state.cities['city-rival'].owner = 'player';
    state.cities['city-rival'].buildings = ['granary', 'market', 'library'];
    state.civilizations.player.cities = ['city-river', 'city-rival'];

    const result = tickLegendaryWonderProjects(state, new EventBus());
    const grandCanal = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'grand-canal',
    );

    expect(grandCanal?.questSteps.find(step => step.id === 'grow-river-city')?.completed).toBe(false);
  });

  it('still lets empire-wide city-development wonders count multiple qualifying cities anywhere in the empire', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['irrigation', 'masonry'],
    });

    state.cities['city-river'].buildings = ['granary', 'shrine', 'market'];
    state.cities['city-rival'].owner = 'player';
    state.cities['city-rival'].buildings = ['granary', 'library', 'market'];
    state.civilizations.player.cities = ['city-river', 'city-rival'];

    const result = tickLegendaryWonderProjects(state, new EventBus());
    const moonwell = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.wonderId === 'moonwell-gardens',
    );

    expect(moonwell?.questSteps.find(step => step.id === 'tend-flourishing-gardens')?.completed).toBe(true);
  });

  it('does not let village discoveries satisfy a natural-wonder-only quest', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['irrigation', 'masonry'] });
    state.legendaryWonderHistory = {
      destroyedStrongholds: [],
      discoveredSites: [
        { civId: 'player', siteId: 'village-1', siteType: 'tribal-village', position: { q: 2, r: 0 }, turn: 12 },
        { civId: 'player', siteId: 'village-2', siteType: 'tribal-village', position: { q: 4, r: 0 }, turn: 16 },
      ],
    };

    const result = tickLegendaryWonderProjects(state, new EventBus());
    const moonwell = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.wonderId === 'moonwell-gardens',
    );

    expect(moonwell?.questSteps.find(step => step.id === 'chart-sacred-landscapes')?.completed).toBe(false);
  });

  it('lets remarkable-site wonders count a mix of natural wonders and tribal villages', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: ['astronomy', 'scholarship'] });
    state.legendaryWonderHistory = {
      destroyedStrongholds: [],
      discoveredSites: [
        { civId: 'player', siteId: 'wonder-1', siteType: 'natural-wonder', position: { q: 3, r: 0 }, turn: 8 },
        { civId: 'player', siteId: 'village-1', siteType: 'tribal-village', position: { q: 5, r: 1 }, turn: 11 },
      ],
    };

    const result = tickLegendaryWonderProjects(state, new EventBus());
    const starvault = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.wonderId === 'starvault-observatory',
    );

    expect(starvault?.questSteps.find(step => step.id === 'trace-two-celestial-sites')?.completed).toBe(true);
  });

  it('completes nearby stronghold quests only after the civ destroys a qualifying camp near the host city', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects = {
      'sun-spire:player:city-river': {
        wonderId: 'sun-spire',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
          { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: false },
        ],
      },
    };
    state.legendaryWonderHistory = {
      discoveredSites: [],
      destroyedStrongholds: [
        { civId: 'player', campId: 'camp-near', position: { q: 3, r: 2 }, turn: 40 },
      ],
    };

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.questSteps[1]?.completed).toBe(true);
  });

  it('does not treat a distant stronghold kill as satisfying a nearby-stronghold step', () => {
    const state = makeLegendaryWonderFixture();
    state.legendaryWonderProjects = {
      'sun-spire:player:city-river': {
        wonderId: 'sun-spire',
        ownerId: 'player',
        cityId: 'city-river',
        phase: 'questing',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [
          { id: 'complete-sacred-route', description: 'Establish a sacred trade route.', completed: true },
          { id: 'defeat-nearby-stronghold', description: 'Clear a nearby barbarian stronghold.', completed: false },
        ],
      },
    };
    state.legendaryWonderHistory = {
      discoveredSites: [],
      destroyedStrongholds: [
        { civId: 'player', campId: 'camp-far', position: { q: 20, r: 20 }, turn: 40 },
      ],
    };

    const result = tickLegendaryWonderProjects(state, new EventBus());

    expect(result.legendaryWonderProjects?.['sun-spire:player:city-river']?.questSteps[1]?.completed).toBe(false);
  });

  it('preserves existing city production when starting a wonder build', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2, resources: ['stone'] });
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    state.cities['city-river'].productionQueue = ['library', 'warrior'];
    state.cities['city-river'].productionProgress = 35;

    const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi');

    expect(result.legendaryWonderProjects!['oracle-of-delphi'].phase).toBe('building');
    expect(result.legendaryWonderProjects!['oracle-of-delphi'].investedProduction).toBe(35);
    expect(result.legendaryWonderProjects!['oracle-of-delphi'].transferableProduction).toBe(0);
    expect(result.cities['city-river'].productionQueue).toEqual(['legendary:oracle-of-delphi', 'library', 'warrior']);
  });

  it('exposes passive city and civ bonuses from completed legendary wonders', () => {
    const state = makeLegendaryWonderFixture();
    state.completedLegendaryWonders = {
      'oracle-of-delphi': {
        ownerId: 'player',
        cityId: 'city-river',
        turnCompleted: 38,
      },
      'world-archive': {
        ownerId: 'player',
        cityId: 'city-river',
        turnCompleted: 39,
      },
    };

    expect(getLegendaryWonderCityYieldBonus(state, 'player', 'city-river')).toMatchObject({
      science: 1,
    });
    expect(getLegendaryWonderCivYieldBonus(state, 'player')).toMatchObject({
      science: 4,
    });
    expect(getLegendaryWonderCityYieldBonus(state, 'rival', 'city-rival')).toEqual({});
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

  it('uses live city production when resolving a lost wonder race', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 2 });
    const bus = new EventBus();
    const lostEvents: Array<{ civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }> = [];
    bus.on('wonder:legendary-lost', event => lostEvents.push(event));

    state.legendaryWonderProjects!['oracle-of-delphi'] = {
      ...state.legendaryWonderProjects!['oracle-of-delphi'],
      phase: 'building',
      investedProduction: 110,
      questSteps: state.legendaryWonderProjects!['oracle-of-delphi'].questSteps.map(step => ({ ...step, completed: true })),
    };
    state.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-river'].productionProgress = 120;
    state.legendaryWonderProjects!['oracle-rival'] = {
      wonderId: 'oracle-of-delphi',
      ownerId: 'rival',
      cityId: 'city-rival',
      phase: 'building',
      investedProduction: 0,
      transferableProduction: 0,
      questSteps: state.legendaryWonderProjects!['oracle-of-delphi'].questSteps.map(step => ({ ...step, completed: true })),
    };
    state.cities['city-rival'].productionQueue = ['legendary:oracle-of-delphi'];
    state.cities['city-rival'].productionProgress = 80;

    const result = tickLegendaryWonderProjects(state, bus);
    const rivalProject = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'rival' && project.wonderId === 'oracle-of-delphi',
    );

    expect(rivalProject).toMatchObject({
      phase: 'lost_race',
      investedProduction: 80,
      transferableProduction: 20,
    });
    expect(result.civilizations.rival.gold).toBe(220);
    expect(lostEvents).toEqual([
      {
        civId: 'rival',
        cityId: 'city-rival',
        wonderId: 'oracle-of-delphi',
        goldRefund: 20,
        transferableProduction: 20,
      },
    ]);
  });

  it('evaluates grand canal growth from the new development rule, not legacy population logic', () => {
    const state = makeLegendaryWonderFixture({
      completedTechs: ['city-planning', 'printing'],
      resources: ['stone'],
    });
    state.cities['city-river'].population = 7;
    state.cities['city-river'].buildings = ['granary'];

    let result = tickLegendaryWonderProjects(state, new EventBus());
    let grandCanal = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'grand-canal',
    );
    expect(grandCanal?.questSteps.find(step => step.id === 'grow-river-city')?.completed).toBe(false);

    state.cities['city-river'].population = 5;
    state.cities['city-river'].buildings = ['granary', 'herbalist', 'library'];

    result = tickLegendaryWonderProjects(state, new EventBus());
    grandCanal = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'grand-canal',
    );
    expect(grandCanal?.questSteps.find(step => step.id === 'grow-river-city')?.completed).toBe(true);
  });

  it('seeds a new wonder project with already-satisfied steps marked complete and ready to build', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 0, resources: ['stone'] });
    state.legendaryWonderProjects = undefined;
    state.wonderDiscoverers = { 'natural-1': ['player'] };
    state.marketplace = {
      prices: {} as any,
      priceHistory: {} as any,
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [
        {
          fromCityId: 'city-river',
          toCityId: 'city-rival',
          goldPerTurn: 4,
          foreignCivId: 'rival',
        },
      ],
    };

    const result = initializeLegendaryWonderProjectsForCity(state, 'player', 'city-river');
    const oracle = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'oracle-of-delphi',
    );

    expect(oracle?.questSteps.every(step => step.completed)).toBe(true);
    expect(oracle?.phase).toBe('ready_to_build');
  });

  it('lets a player start a newly seeded wonder immediately when all conditions are already met', () => {
    const state = makeLegendaryWonderFixture({ oracleStepsCompleted: 0, resources: ['stone'] });
    state.legendaryWonderProjects = undefined;
    state.wonderDiscoverers = { 'natural-1': ['player'] };
    state.marketplace = {
      prices: {} as any,
      priceHistory: {} as any,
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [
        {
          fromCityId: 'city-river',
          toCityId: 'city-rival',
          goldPerTurn: 4,
          foreignCivId: 'rival',
        },
      ],
    };

    const result = startLegendaryWonderBuild(state, 'player', 'city-river', 'oracle-of-delphi');
    const oracle = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'oracle-of-delphi',
    );

    expect(oracle?.phase).toBe('building');
    expect(result.cities['city-river'].productionQueue[0]).toBe('legendary:oracle-of-delphi');
  });

  it('requires a coastal trade route for tidecaller bastion', () => {
    const state = makeLegendaryWonderFixture();
    state.civilizations.player.techState.completed = ['caravels', 'fortresses'];
    state.cities['city-river'].ownedTiles.push({ q: 2, r: 1 });
    state.map.tiles['2,1'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 2, r: 1 },
      terrain: 'coast',
      owner: 'player',
    };
    state.map.tiles['2,3'].resource = 'stone';
    state.marketplace = {
      prices: {} as any,
      priceHistory: {} as any,
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
    };
    state.cities['city-inland'] = {
      ...state.cities['city-river'],
      id: 'city-inland',
      name: 'Inland',
      position: { q: 4, r: 1 },
      ownedTiles: [{ q: 4, r: 1 }],
      productionQueue: [],
      productionProgress: 0,
    };
    state.cities['city-rival-inland'] = {
      ...state.cities['city-rival'],
      id: 'city-rival-inland',
      name: 'Rival Inland',
      position: { q: 6, r: 1 },
      ownedTiles: [{ q: 6, r: 1 }],
      productionQueue: [],
      productionProgress: 0,
    };
    state.map.tiles['4,1'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 4, r: 1 },
      owner: 'player',
      terrain: 'plains',
    };
    state.map.tiles['6,1'] = {
      ...state.map.tiles['5,5'],
      coord: { q: 6, r: 1 },
      owner: 'rival',
      terrain: 'plains',
    };
    state.civilizations.player.cities.push('city-inland');
    state.civilizations.rival.cities.push('city-rival-inland');
    state.marketplace.tradeRoutes = [
      {
        fromCityId: 'city-inland',
        toCityId: 'city-rival-inland',
        goldPerTurn: 4,
        foreignCivId: 'rival',
      },
    ];

    let result = tickLegendaryWonderProjects(state, new EventBus());
    let tidecaller = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'tidecaller-bastion',
    );
    expect(tidecaller?.questSteps.find(step => step.id === 'secure-coastal-trade')?.completed).toBe(false);

    state.cities['city-harbor'] = {
      ...state.cities['city-river'],
      id: 'city-harbor',
      name: 'Harbor',
      position: { q: 1, r: 1 },
      ownedTiles: [{ q: 1, r: 1 }, { q: 1, r: 0 }],
      productionQueue: [],
      productionProgress: 0,
    };
    state.map.tiles['1,1'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 1, r: 1 },
      owner: 'player',
    };
    state.map.tiles['1,0'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 1, r: 0 },
      terrain: 'coast',
      owner: 'player',
    };
    state.civilizations.player.cities.push('city-harbor');
    state.marketplace.tradeRoutes = [
      {
        fromCityId: 'city-harbor',
        toCityId: 'city-rival',
        goldPerTurn: 5,
        foreignCivId: 'rival',
      },
    ];

    result = tickLegendaryWonderProjects(state, new EventBus());
    tidecaller = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'tidecaller-bastion',
    );
    expect(tidecaller?.questSteps.find(step => step.id === 'secure-coastal-trade')?.completed).toBe(true);
  });

  it('requires an overseas trade route for leviathan drydock', () => {
    const state = makeLegendaryWonderFixture();
    state.civilizations.player.techState.completed = ['caravels', 'harbor-building'];
    state.cities['city-river'].ownedTiles.push({ q: 2, r: 1 });
    state.map.tiles['2,1'] = {
      ...state.map.tiles['2,2'],
      coord: { q: 2, r: 1 },
      terrain: 'coast',
      owner: 'player',
    };
    state.map.tiles['2,3'].resource = 'stone';
    state.marketplace = {
      prices: {} as any,
      priceHistory: {} as any,
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [
        {
          fromCityId: 'city-river',
          toCityId: 'city-river',
          goldPerTurn: 3,
        },
      ],
    };

    let result = tickLegendaryWonderProjects(state, new EventBus());
    let drydock = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'leviathan-drydock',
    );
    expect(drydock?.questSteps.find(step => step.id === 'prove-open-sea-command')?.completed).toBe(false);

    state.marketplace.tradeRoutes = [
      {
        fromCityId: 'city-river',
        toCityId: 'city-rival',
        goldPerTurn: 6,
        foreignCivId: 'rival',
      },
    ];

    result = tickLegendaryWonderProjects(state, new EventBus());
    drydock = Object.values(result.legendaryWonderProjects ?? {}).find(project =>
      project.ownerId === 'player' && project.cityId === 'city-river' && project.wonderId === 'leviathan-drydock',
    );
    expect(drydock?.questSteps.find(step => step.id === 'prove-open-sea-command')?.completed).toBe(true);
  });

  it('avalon amplifies legendary wonder completion rewards by 25% compared to a non-avalon civ', () => {
    const baselineState = makeLegendaryWonderFixture({ civType: 'rome', oracleStepsCompleted: 2, resources: ['stone'] });
    baselineState.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    baselineState.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    baselineState.cities['city-river'].productionProgress = 120;

    const avalonState = makeLegendaryWonderFixture({ civType: 'avalon', oracleStepsCompleted: 2, resources: ['stone'] });
    avalonState.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    avalonState.cities['city-river'].productionQueue = ['legendary:oracle-of-delphi'];
    avalonState.cities['city-river'].productionProgress = 120;

    const baselineResult = tickLegendaryWonderProjects(baselineState, new EventBus());
    const avalonResult = tickLegendaryWonderProjects(avalonState, new EventBus());

    const baselineGain = baselineResult.civilizations.player.techState.researchProgress - baselineState.civilizations.player.techState.researchProgress;
    const avalonGain = avalonResult.civilizations.player.techState.researchProgress - avalonState.civilizations.player.techState.researchProgress;

    expect(avalonGain).toBeGreaterThan(baselineGain);
    expect(avalonGain).toBe(75);
    expect(avalonGain).toBeCloseTo(baselineGain * 1.25, 0);
  });
});
