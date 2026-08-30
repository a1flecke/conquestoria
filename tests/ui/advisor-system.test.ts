import { describe, it, expect, vi, afterEach } from 'vitest';
import { AdvisorSystem, getAdvisorMessageIds, SESSION_SHOWN_TIPS, fireResourceDiscoveredTip } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { GameState, Unit } from '@/core/types';
import { createEmptyPirateState, type PirateFactionState } from '@/core/pirate-state';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function makeState(overrides?: Partial<GameState>): GameState {
  const state = createNewGame(undefined, 'advisor-test');
  return { ...state, ...overrides };
}

function stateWithCity(): GameState {
  const state = makeState();
  // Found a city using the settler
  const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, state.idCounters);
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  delete state.units[settler.id];
  state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== settler.id);
  return state;
}

describe('AdvisorSystem', () => {
  it('gives viewer-scoped pirate sighting advice without hidden coordinates', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.turn = 20;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: true, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'raiding', maritimeStage: 2,
      notoriety: 2, shipIds: [], headquarters: { kind: 'coastal-enclave', position: { q: 9, r: 7 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
    } satisfies PirateFactionState;
    state.pirates.intelByCiv.player = {
      'pirate-1': { factionId: 'pirate-1', level: 'rumor', discoveredRound: 20, lastUpdatedRound: 20, approximateRegion: { center: { q: 8, r: 8 }, radius: 5 } },
    };
    const messages: any[] = [];
    bus.on('advisor:message', message => messages.push(message));

    advisor.check(state);

    expect(messages[0]).toMatchObject({ advisor: 'warchief' });
    expect(messages[0].message).toMatch(/pirate/i);
    expect(messages[0].message).not.toMatch(/9|7|8,8/);
  });

  it('does not let one hot-seat viewer consume another viewers pirate advice cooldown', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.turn = 20;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: true, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.pirates = createEmptyPirateState();
    state.pirates.intelByCiv.player = {
      'pirate-1': { factionId: 'pirate-1', level: 'rumor', discoveredRound: 20, lastUpdatedRound: 20 },
    };
    state.pirates.intelByCiv['ai-1'] = {
      'pirate-1': { factionId: 'pirate-1', level: 'rumor', discoveredRound: 20, lastUpdatedRound: 20 },
    };
    const messages: any[] = [];
    bus.on('advisor:message', message => messages.push(message));

    state.currentPlayer = 'player';
    advisor.check(state);
    state.currentPlayer = 'ai-1';
    advisor.check(state);

    expect(messages.filter(message => /pirate/i.test(message.message))).toHaveLength(2);
  });

  it('warns through the Treasurer when a known tribute demand is unaffordable', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.turn = 20;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: true, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.gold = 0;
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Red Wake', spawnedRound: 1, behavior: 'blockading', maritimeStage: 4,
      notoriety: 5, shipIds: [], headquarters: { kind: 'coastal-enclave', position: { q: 9, r: 7 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: { player: { demandedRound: 20, lastReminderRound: 20, quotedCost: 65 } },
      contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
    } satisfies PirateFactionState;
    state.pirates.intelByCiv.player = {
      'pirate-1': { factionId: 'pirate-1', level: 'sighted', discoveredRound: 20, lastUpdatedRound: 20 },
    };
    const messages: any[] = [];
    bus.on('advisor:message', message => messages.push(message));

    advisor.check(state);

    expect(messages[0]).toMatchObject({ advisor: 'treasurer' });
    expect(messages[0].message).toMatch(/tribute|gold/i);
    expect(messages[0].message).not.toMatch(/9|7/);
  });
  it('shows welcome message on first check', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('builder');
    expect(messages[0].message).toContain('Welcome');
  });

  it('does not repeat the same message', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    advisor.check(state);
    // Verify the welcome message fires exactly once (de-duplication check)
    const welcomeCount = messages.filter(m => (m.message as string).includes('Welcome')).length;
    expect(welcomeCount).toBe(1);
  });

  it('skips tutorial messages when tutorial is inactive', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.turn = 6; // past domination-hint window (turn <= 5)
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: true, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    // No tutorial messages, and chancellor/warchief won't trigger without the right conditions
    expect(messages).toHaveLength(0);
  });

  it('shows chancellor hostile-civ warning', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    // Set hostile relationship
    state.civilizations.player.diplomacy.relationships['ai-1'] = -40;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('chancellor');
    expect(messages[0].message).toContain('hostile');
  });

  it('shows chancellor alliance opportunity', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.diplomacy.relationships['ai-1'] = 50;
    state.civilizations.player.diplomacy.treaties = [];

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('chancellor');
    expect(messages[0].message).toContain('favorably');
  });

  it('shows warchief undefended city warning', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: true, treasurer: false, scholar: false, spymaster: false, artisan: false };

    // Move all player units away from city
    for (const unit of Object.values(state.units)) {
      if (unit.owner === 'player') {
        unit.position = { q: 0, r: 0 };
      }
    }

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('warchief');
    expect(messages[0].message).toContain('garrison');
  });

  it('shows war notification from chancellor', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations.player.diplomacy.relationships['ai-1'] = -60;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('chancellor');
    expect(messages[0].message).toContain('war');
  });

  it('#919 MR3: chancellor unrest warning names the Courthouse only once magistracy is researched', () => {
    function unrestState(withMagistracy: boolean): GameState {
      const state = stateWithCity();
      state.tutorial.active = false;
      state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
      const cityId = state.civilizations.player.cities[0];
      state.cities[cityId].unrestLevel = 1;
      state.civilizations.player.diplomacy.atWarWith = []; // keep the unrest message ahead of the war one
      if (withMagistracy) {
        state.civilizations.player.techState.completed = [...state.civilizations.player.techState.completed, 'magistracy'];
      }
      return state;
    }

    const withMsg: any[] = [];
    const busA = new EventBus();
    busA.on('advisor:message', m => withMsg.push(m));
    new AdvisorSystem(busA).check(unrestState(true));
    const withText = withMsg.find(m => m.advisor === 'chancellor')?.message ?? '';
    expect(withText).toMatch(/discontent|unrest/i);
    expect(withText).toMatch(/courthouse/i);

    const withoutMsg: any[] = [];
    const busB = new EventBus();
    busB.on('advisor:message', m => withoutMsg.push(m));
    new AdvisorSystem(busB).check(unrestState(false));
    const withoutText = withoutMsg.find(m => m.advisor === 'chancellor')?.message ?? '';
    expect(withoutText).toMatch(/discontent|unrest/i);
    expect(withoutText).not.toMatch(/courthouse/i);
    expect(withoutText).not.toMatch(/happiness improvement/i);
  });

  it('does nothing when all advisors are disabled and tutorial is off', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.tutorialEnabled = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(0);
  });

  it('resetMessage allows showing the message again', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);

    advisor.resetMessage('welcome');
    advisor.check(state);
    expect(messages).toHaveLength(2);
  });

  it('shows scholar no-research reminder when tech completed but idle', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: true, spymaster: false, artisan: false };
    state.civilizations.player.techState.completed = ['agriculture'];
    state.civilizations.player.techState.currentResearch = null;
    state.turn = 5;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('scholar');
    expect(messages[0].message).toContain('idle');
  });

  it('shows treasurer broke warning when gold is low', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: true, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.gold = 5;
    state.turn = 10;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('treasurer');
    expect(messages[0].message).toContain('empty');
  });

  it('does not show treasurer broke on turn 1', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: true, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.gold = 0;
    state.turn = 1;

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(0);
  });

  it('shows treasurer rich-idle when gold high and no production', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: true, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.gold = 200;
    // Ensure city has empty production queue
    const cityId = state.civilizations.player.cities[0];
    state.cities[cityId].productionQueue = [];

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('treasurer');
    expect(messages[0].message).toContain('fortune');
  });

  it('shows build-unit guidance when a later city is idle', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity();
    state.settings.advisorsEnabled = { builder: true, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.tutorial.active = true;
    state.tutorial.completedSteps = ['welcome', 'found_city', 'explore', 'build_improvement', 'research_tech'];

    const secondCity = foundCity('player', { q: 3, r: 0 }, state.map, state.idCounters);
    secondCity.productionQueue = [];
    state.cities[secondCity.id] = secondCity;
    state.civilizations.player.cities.push(secondCity.id);

    const firstCityId = state.civilizations.player.cities[0];
    state.cities[firstCityId].productionQueue = ['warrior'];

    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('queue up a Warrior');
  });

  it('getAdvisorMessageIds includes new advisor IDs', () => {
    const ids = getAdvisorMessageIds();
    expect(ids).toContain('welcome');
    expect(ids).toContain('chancellor_hostile_civ');
    expect(ids).toContain('warchief_undefended_city');
    expect(ids).toContain('scholar_no_research');
    expect(ids).toContain('scholar_wonder');
    expect(ids).toContain('scholar_era');
    expect(ids).toContain('treasurer_rich_idle');
    expect(ids).toContain('treasurer_broke');
    expect(ids).toContain('treasurer_village_gold');
  });

  it('getAdvisorMessageIds includes minor civ messages', () => {
    const ids = getAdvisorMessageIds();
    expect(ids).toContain('chancellor_ally_city_state');
    expect(ids).toContain('chancellor_conquest_warning');
    expect(ids).toContain('warchief_undefended_city_state');
    expect(ids).toContain('warchief_guerrilla_harass');
    expect(ids).toContain('treasurer_mercantile_ally');
    expect(ids).toContain('scholar_cultural_ally');
  });

  it('shows Artisan guidance when a legendary wonder is eligible but not started', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity() as any;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
    state.legendaryWonderProjects = {
      'oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: state.civilizations.player.cities[0],
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);

    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('artisan');
    expect(messages[0].message).toMatch(/Build list/i);
    expect(messages[0].message).toMatch(/Start Construction/i);
  });

  it('warns when a current-player wonder race is underway', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity() as any;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
    state.legendaryWonderProjects = {
      'great-library': {
        wonderId: 'great-library',
        ownerId: 'player',
        cityId: state.civilizations.player.cities[0],
        phase: 'building',
        investedProduction: 40,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);

    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('artisan');
    expect(messages[0].message).toMatch(/delay|legacy|wonder/i);
  });

  it('celebrates a completed wonder for the current player', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity() as any;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
    state.legendaryWonderProjects = {
      'oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: state.civilizations.player.cities[0],
        phase: 'completed',
        investedProduction: 120,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);

    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('artisan');
    expect(messages[0].message).toMatch(/complete|legacy/i);
  });

  it('reacts when the current player loses a wonder race', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity() as any;
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
    state.legendaryWonderProjects = {
      'oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: state.civilizations.player.cities[0],
        phase: 'lost_race',
        investedProduction: 90,
        transferableProduction: 25,
        questSteps: [],
      },
    };

    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);

    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('artisan');
    expect(messages[0].message).toMatch(/rival|glory|wonder/i);
  });

  it('does not surface another human players wonder state in hot seat', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithCity() as any;
    state.currentPlayer = 'player-2';
    state.civilizations['player-2'] = {
      ...state.civilizations.player,
      id: 'player-2',
      isHuman: true,
      cities: ['city-player-2'],
    };
    state.cities['city-player-2'] = {
      ...state.cities[state.civilizations.player.cities[0]],
      id: 'city-player-2',
      owner: 'player-2',
    };
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: true };
    state.legendaryWonderProjects = {
      'oracle-of-delphi': {
        wonderId: 'oracle-of-delphi',
        ownerId: 'player',
        cityId: state.civilizations.player.cities[0],
        phase: 'ready_to_build',
        investedProduction: 0,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);

    expect(messages).toHaveLength(0);
  });

  it('emits a bounded council-memory callback when no regular advisor line fires', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: true, spymaster: false, artisan: false };
    state.councilMemory = {
      player: {
        entries: [
          {
            key: 'build-archive',
            advisor: 'scholar',
            kind: 'wonder-plan',
            turn: 5,
            subjects: { wonderId: 'world-archive' },
            outcome: 'followed',
          },
        ],
        eraCallbackCount: 0,
        callbackEra: state.era,
      },
    };
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    advisor.check(state);

    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('scholar');
    expect(messages[0].message).toMatch(/archive|council|wonder/i);
    expect(state.councilMemory.player.entries[0].lastCallbackTurn).toBe(state.turn);
  });
});

// ── SESSION_SHOWN_TIPS + resources-intro ─────────────────────────────────────

describe('SESSION_SHOWN_TIPS deduplication', () => {
  afterEach(() => {
    SESSION_SHOWN_TIPS.clear();
  });

  it('resources-intro is in the ADVISOR_MESSAGES list', () => {
    expect(getAdvisorMessageIds()).toContain('resources-intro');
  });

  it('resources-intro does not fire before turn 3', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.turn = 2;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);
    expect(messages.some(m => (m.message as string).includes('Special resources'))).toBe(false);
  });

  it('resources-intro fires at turn 3 when explorer enabled and no resources acquired', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.turn = 3;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);
    expect(messages.some(m => (m.message as string).includes('Special resources'))).toBe(true);
  });

  it('prevents resources-intro from firing again once in SESSION_SHOWN_TIPS', () => {
    SESSION_SHOWN_TIPS.add('resources-intro');
    const state = makeState();
    state.tutorial.active = false;
    state.turn = 3;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);
    expect(messages.some(m => (m.message as string).includes('Special resources'))).toBe(false);
  });

  it('check() adds fired tip ids to SESSION_SHOWN_TIPS', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.turn = 3;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);
    expect(SESSION_SHOWN_TIPS.has('resources-intro')).toBe(true);
  });

  it('resources-intro does NOT fire when civ has already acquired a resource', () => {
    // stateWithCity() founds a city so getCivAvailableResources can inspect ownedTiles.
    // makeState() has no city yet (only a settler), so getCivAvailableResources would
    // always return an empty set and the trigger would fire incorrectly.
    const state = stateWithCity();
    state.tutorial.active = false;
    state.turn = 5;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed = ['bronze-working'];
    // Add a completed mine on an iron tile inside the city's owned territory
    const cityId = state.civilizations[civId].cities[0];
    const tileCoord = { q: 99, r: 0 };
    state.map.tiles['99,0'] = {
      coord: tileCoord, terrain: 'hills', elevation: 'lowland',
      resource: 'iron' as never, improvement: 'mine', owner: civId,
      improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    state.cities[cityId] = {
      ...state.cities[cityId],
      ownedTiles: [...state.cities[cityId].ownedTiles, tileCoord],
    };
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));
    const advisor = new AdvisorSystem(bus);
    advisor.check(state);
    expect(messages.some(m => (m.message as string).includes('Special resources'))).toBe(false);
  });
});

// ── fireResourceDiscoveredTip ─────────────────────────────────────────────────

describe('fireResourceDiscoveredTip', () => {
  afterEach(() => {
    SESSION_SHOWN_TIPS.clear();
  });

  it('emits advisor:message for a known resource the civ has tech for and returns true', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    // Give the player the tech needed for iron ('bronze-working')
    state.civilizations.player.techState.completed = ['bronze-working'];
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    const fired = fireResourceDiscoveredTip('iron', state, bus);

    expect(fired).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].advisor).toBe('explorer');
    expect(messages[0].message).toContain('Iron');
    expect(messages[0].message).toContain('Expedition');
  });

  it('mentions tech requirement when civ lacks the enabling tech', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.techState.completed = [];
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    const fired = fireResourceDiscoveredTip('iron', state, bus);

    expect(fired).toBe(true);
    expect(messages[0].message).toContain('bronze-working');
  });

  it('deduplicates: only fires once per resource per session and returns false on repeat', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.techState.completed = ['bronze-working'];
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    const first = fireResourceDiscoveredTip('iron', state, bus);
    const second = fireResourceDiscoveredTip('iron', state, bus);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(messages).toHaveLength(1);
  });

  it('returns false and does not fire when explorer advisor is disabled', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.techState.completed = ['bronze-working'];
    const bus = new EventBus();
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));

    const fired = fireResourceDiscoveredTip('iron', state, bus);

    expect(fired).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('returns false when disabled (not adding to SESSION_SHOWN_TIPS), so it can fire later when enabled', () => {
    const state = makeState();
    state.tutorial.active = false;
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    state.civilizations.player.techState.completed = ['bronze-working'];
    const bus = new EventBus();

    fireResourceDiscoveredTip('iron', state, bus); // disabled — should NOT add to SESSION_SHOWN_TIPS
    expect(SESSION_SHOWN_TIPS.has('resource-discovered-iron')).toBe(false);

    // Now enable the advisor — tip should fire
    state.settings.advisorsEnabled = { builder: false, explorer: true, chancellor: false, warchief: false, treasurer: false, scholar: false, spymaster: false, artisan: false };
    const messages: any[] = [];
    bus.on('advisor:message', (msg) => messages.push(msg));
    const fired = fireResourceDiscoveredTip('iron', state, bus);
    expect(fired).toBe(true);
    expect(messages).toHaveLength(1);
  });
});

describe('#544 MR2 — first-time supply tutorial', () => {
  function stateWithAllPriorTutorialStepsDone(): GameState {
    const state = stateWithCity();
    state.tutorial.active = true;
    state.tutorial.completedSteps = ['welcome', 'found_city', 'explore', 'build_improvement', 'research_tech', 'build_unit', 'combat', 'complete'];
    return state;
  }

  it('fires supply_intro the first time a participating unit is not full supply', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDone();
    const warrior = Object.values(state.units).find((u): u is Unit => u.owner === 'player' && u.type === 'warrior');
    state.units[warrior!.id] = { ...warrior!, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } };

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);

    expect(stepEvents.some(e => e.step === 'supply_intro')).toBe(true);
  });

  it('does not fire supply_intro while every participating unit is at full supply', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDone();

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);

    expect(stepEvents.some(e => e.step === 'supply_intro')).toBe(false);
  });

  it('resetMessage + check re-shows supply_intro on demand (the reopen affordance)', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDone();
    const warrior = Object.values(state.units).find((u): u is Unit => u.owner === 'player' && u.type === 'warrior');
    state.units[warrior!.id] = { ...warrior!, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } };

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);
    expect(stepEvents.filter(e => e.step === 'supply_intro')).toHaveLength(1);

    // Without reopening, a second check() does not re-fire it.
    advisor.check(state);
    expect(stepEvents.filter(e => e.step === 'supply_intro')).toHaveLength(1);

    advisor.resetMessage('supply_intro');
    advisor.check(state);
    expect(stepEvents.filter(e => e.step === 'supply_intro')).toHaveLength(2);
  });
});

describe('#544 MR4 — general_command_intro tutorial', () => {
  function stateWithAllPriorTutorialStepsDoneMR4(): GameState {
    const state = stateWithCity();
    state.tutorial.active = true;
    state.tutorial.completedSteps = ['welcome', 'found_city', 'explore', 'build_improvement', 'research_tech', 'build_unit', 'combat', 'complete', 'supply_intro'];
    return state;
  }

  function makeGeneralUnit(overrides: Partial<Unit> = {}): Unit {
    return {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', ...overrides,
    } as Unit;
  }

  it('triggers once the player owns an operational (non-spawn-turn) General', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDoneMR4();
    state.units['gen-1'] = makeGeneralUnit();
    state.civilizations.player.units.push('gen-1');

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);

    expect(stepEvents.some(e => e.step === 'general_command_intro')).toBe(true);
  });

  it('does not trigger on the General\'s own spawn turn', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDoneMR4();
    state.units['gen-1'] = makeGeneralUnit({ generalNoCommandThisTurn: true });
    state.civilizations.player.units.push('gen-1');

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);

    expect(stepEvents.some(e => e.step === 'general_command_intro')).toBe(false);
  });

  it('does not trigger when the player has no General at all', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDoneMR4();

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);

    expect(stepEvents.some(e => e.step === 'general_command_intro')).toBe(false);
  });

  it('resetMessage + check re-shows general_command_intro on demand (the reopen affordance)', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = stateWithAllPriorTutorialStepsDoneMR4();
    state.units['gen-1'] = makeGeneralUnit();
    state.civilizations.player.units.push('gen-1');

    const stepEvents: any[] = [];
    bus.on('tutorial:step', event => stepEvents.push(event));

    advisor.check(state);
    advisor.check(state);
    expect(stepEvents.filter(e => e.step === 'general_command_intro')).toHaveLength(1);

    advisor.resetMessage('general_command_intro');
    advisor.check(state);
    expect(stepEvents.filter(e => e.step === 'general_command_intro')).toHaveLength(2);
  });
});

describe('#544 MR4 — general_last_stand_crisis_hint', () => {
  function makeGeneralUnit(overrides: Partial<Unit> = {}): Unit {
    return {
      id: 'gen-1', type: 'great_general', owner: 'player', position: { q: 0, r: 0 },
      movementPointsLeft: 3, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      generalDefinitionId: 'gen_caesar', ...overrides,
    } as Unit;
  }

  function makeWoundedUnit(overrides: Partial<Unit> = {}): Unit {
    return {
      id: 'unit-1', type: 'warrior', owner: 'player', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 20, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      ...overrides,
    } as Unit;
  }

  function fires(state: GameState): boolean {
    // check() only fires one message per call ("one message at a time") --
    // isolate this specific hint by disabling every other advisor (so an
    // unrelated always-eligible non-tutorial entry can't win the race) and
    // turning tutorials off entirely (state.tutorial.active defaults to true
    // with no steps completed, so the trivially-true 'welcome' step would
    // otherwise win the race every time on a fresh fixture).
    state.settings.advisorsEnabled = {
      builder: false, explorer: false, chancellor: false, warchief: true,
      treasurer: false, scholar: false, spymaster: false, artisan: false,
    };
    state.tutorial.active = false;
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const messages: any[] = [];
    bus.on('advisor:message', msg => messages.push(msg));
    advisor.check(state);
    return messages.some(m => m.message.includes('Last Stand'));
  }

  it('fires when a low-HP combat unit is within an eligible General\'s command range', () => {
    const state = stateWithCity();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = makeWoundedUnit();
    state.civilizations.player.units.push('gen-1', 'unit-1');
    expect(fires(state)).toBe(true);
  });

  it('does not fire when a General exists but no unit nearby is wounded', () => {
    const state = stateWithCity();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = makeWoundedUnit({ health: 100 });
    state.civilizations.player.units.push('gen-1', 'unit-1');
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the wounded unit is outside the General\'s command range', () => {
    const state = stateWithCity();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = makeWoundedUnit({ position: { q: 10, r: 10 } });
    state.civilizations.player.units.push('gen-1', 'unit-1');
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the only nearby low-HP unit is a civilian', () => {
    const state = stateWithCity();
    state.units['gen-1'] = makeGeneralUnit();
    state.units['unit-1'] = { ...makeWoundedUnit(), type: 'worker' };
    state.civilizations.player.units.push('gen-1', 'unit-1');
    expect(fires(state)).toBe(false);
  });

  it('does not fire when the civ has no operational General at all', () => {
    const state = stateWithCity();
    state.units['unit-1'] = makeWoundedUnit();
    state.civilizations.player.units.push('unit-1');
    expect(fires(state)).toBe(false);
  });
});
