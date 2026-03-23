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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: true };
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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false };
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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false };
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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: true };

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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: true, warchief: false };
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
    state.settings.advisorsEnabled = { builder: false, explorer: false, chancellor: false, warchief: false };

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

  it('getAdvisorMessageIds returns all message IDs', () => {
    const ids = getAdvisorMessageIds();
    expect(ids.length).toBeGreaterThan(8);
    expect(ids).toContain('welcome');
    expect(ids).toContain('chancellor_hostile_civ');
    expect(ids).toContain('warchief_undefended_city');
  });
});
