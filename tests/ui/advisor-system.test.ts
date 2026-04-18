import { describe, it, expect, vi } from 'vitest';
import { AdvisorSystem, getAdvisorMessageIds } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import type { GameState, Unit } from '@/core/types';

function makeState(overrides?: Partial<GameState>): GameState {
  const state = createNewGame(undefined, 'advisor-test');
  return { ...state, ...overrides };
}

function stateWithCity(): GameState {
  const state = makeState();
  // Found a city using the settler
  const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map);
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  delete state.units[settler.id];
  state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== settler.id);
  return state;
}

describe('AdvisorSystem', () => {
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
    expect(messages).toHaveLength(1);
  });

  it('skips tutorial messages when tutorial is inactive', () => {
    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const state = makeState();
    state.tutorial.active = false;
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

    const secondCity = foundCity('player', { q: 3, r: 0 }, state.map);
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
    expect(messages[0].message).toMatch(/wonder/i);
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
