import { describe, it, expect } from 'vitest';
import { AdvisorSystem } from '@/ui/advisor-system';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';

function makeState(): GameState {
  const state = createNewGame(undefined, 'victory-hint-test');
  state.tutorial.active = false;
  state.settings.advisorsEnabled = {
    builder: false, explorer: false, chancellor: false,
    warchief: true, treasurer: false, scholar: false,
    spymaster: false, artisan: false,
  };
  return state;
}

function drainMessages(advisor: AdvisorSystem, state: GameState, bus: EventBus, maxPumps = 30): string[] {
  const texts: string[] = [];
  bus.on('advisor:message', (msg: { message: string }) => texts.push(msg.message));
  let prev = 0;
  let pumps = 0;
  do {
    prev = texts.length;
    advisor.check(state);
    pumps++;
  } while (texts.length > prev && pumps < maxPumps);
  return texts;
}

describe('warchief_domination_hint advisor message', () => {
  it('fires within the first 5 turns when a rival civ exists', () => {
    const state = makeState();
    state.turn = 3;

    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const texts = drainMessages(advisor, state, bus);

    expect(texts.some(t => t.toLowerCase().includes('domination'))).toBe(true);
  });

  it('does NOT fire after turn 5', () => {
    const state = makeState();
    state.turn = 6;

    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const texts = drainMessages(advisor, state, bus);

    expect(texts.some(t => t.toLowerCase().includes('domination'))).toBe(false);
  });

  it('does NOT fire when the player is the only civ', () => {
    const state = makeState();
    state.turn = 1;
    for (const id of Object.keys(state.civilizations)) {
      if (id !== state.currentPlayer) {
        delete state.civilizations[id];
      }
    }

    const bus = new EventBus();
    const advisor = new AdvisorSystem(bus);
    const texts = drainMessages(advisor, state, bus);

    expect(texts.some(t => t.toLowerCase().includes('domination'))).toBe(false);
  });
});
