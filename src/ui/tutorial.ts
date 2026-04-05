import type { GameState, TutorialStep } from '@/core/types';
import { EventBus } from '@/core/event-bus';

interface TutorialMessage {
  step: TutorialStep;
  advisor: 'builder' | 'explorer';
  message: string;
  trigger: (state: GameState) => boolean;
}

const TUTORIAL_MESSAGES: TutorialMessage[] = [
  {
    step: 'welcome',
    advisor: 'builder',
    message: 'Welcome, leader! Your tribe has found a promising land. Select your Settler and found a city to begin building your civilization.',
    trigger: () => true,
  },
  {
    step: 'found_city',
    advisor: 'builder',
    message: 'Excellent! Your city is growing. Build a Shrine to start generating science, or train a Warrior to defend your borders. Tap your city to see options.',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === state.currentPlayer),
  },
  {
    step: 'explore',
    advisor: 'explorer',
    message: 'The world awaits! Select your Scout and send them into the unknown. Who knows what we might find out there?',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === state.currentPlayer),
  },
  {
    step: 'build_improvement',
    advisor: 'builder',
    message: 'Your Worker can build Farms and Mines on nearby tiles. Select the Worker and choose an improvement to boost your city\'s output.',
    trigger: (state) => Object.values(state.units).some(u => u.owner === state.currentPlayer && u.type === 'worker'),
  },
  {
    step: 'research_tech',
    advisor: 'explorer',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => state.civilizations[state.currentPlayer]?.techState.currentResearch === null && state.turn >= 2,
  },
  {
    step: 'build_unit',
    advisor: 'builder',
    message: 'Your city can train units. Open the city panel and queue up a Warrior to defend your borders.',
    trigger: (state) => {
      const cities = Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
      return cities.length > 0 && cities[0].productionQueue.length === 0;
    },
  },
  {
    step: 'combat',
    advisor: 'explorer',
    message: 'Barbarians! Move your Warrior next to them and tap the enemy to attack. Be careful — they fight back!',
    trigger: (state) => {
      // Trigger when barbarian is visible
      const vis = state.civilizations[state.currentPlayer]?.visibility;
      if (!vis) return false;
      return Object.values(state.units).some(u => u.owner === 'barbarian' && vis.tiles[`${u.position.q},${u.position.r}`] === 'visible');
    },
  },
  {
    step: 'complete',
    advisor: 'builder',
    message: 'You\'re doing great! You now know the basics. Explore, expand, research, and conquer. The world is yours to shape!',
    trigger: (state) => state.turn >= 10,
  },
];

const ADVISOR_ICONS = {
  builder: '🏗️',
  explorer: '🔭',
};

export class TutorialSystem {
  private bus: EventBus;
  private shownSteps = new Set<TutorialStep>();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  check(state: GameState): void {
    if (!state.tutorial.active) return;

    for (const msg of TUTORIAL_MESSAGES) {
      if (this.shownSteps.has(msg.step)) continue;
      if (state.tutorial.completedSteps.includes(msg.step)) {
        this.shownSteps.add(msg.step);
        continue;
      }

      if (msg.trigger(state)) {
        this.shownSteps.add(msg.step);
        this.bus.emit('tutorial:step', {
          step: msg.step,
          message: msg.message,
          advisor: msg.advisor,
        });
        break; // Only show one at a time
      }
    }
  }

  markComplete(state: GameState, step: TutorialStep): GameState {
    return {
      ...state,
      tutorial: {
        ...state.tutorial,
        currentStep: step,
        completedSteps: [...state.tutorial.completedSteps, step],
      },
    };
  }
}
