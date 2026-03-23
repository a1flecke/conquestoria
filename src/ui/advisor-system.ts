import type { GameState, TutorialStep, AdvisorType } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { isAtWar, getRelationship } from '@/systems/diplomacy-system';

interface AdvisorMessage {
  id: string;
  advisor: AdvisorType;
  icon: string;
  message: string;
  trigger: (state: GameState) => boolean;
  /** If set, maps to a tutorial step (for backward compat) */
  tutorialStep?: TutorialStep;
}

const ADVISOR_MESSAGES: AdvisorMessage[] = [
  // --- Builder (tutorial) ---
  {
    id: 'welcome',
    advisor: 'builder',
    icon: '🏗️',
    message: 'Welcome, leader! Your tribe has found a promising land. Select your Settler and found a city to begin building your civilization.',
    trigger: () => true,
    tutorialStep: 'welcome',
  },
  {
    id: 'found_city',
    advisor: 'builder',
    icon: '🏗️',
    message: 'Excellent! Your city is growing. Now build a Granary to increase food production. Tap your city to see building options.',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === 'player'),
    tutorialStep: 'found_city',
  },
  {
    id: 'build_improvement',
    advisor: 'builder',
    icon: '🏗️',
    message: "Your Worker can build Farms and Mines on nearby tiles. Select the Worker and choose an improvement to boost your city's output.",
    trigger: (state) => Object.values(state.units).some(u => u.owner === 'player' && u.type === 'worker'),
    tutorialStep: 'build_improvement',
  },
  {
    id: 'build_unit',
    advisor: 'builder',
    icon: '🏗️',
    message: 'Your city can train units. Open the city panel and queue up a Warrior to defend your borders.',
    trigger: (state) => {
      const cities = Object.values(state.cities).filter(c => c.owner === 'player');
      return cities.length > 0 && cities[0].productionQueue.length === 0;
    },
    tutorialStep: 'build_unit',
  },

  // --- Explorer (tutorial) ---
  {
    id: 'explore',
    advisor: 'explorer',
    icon: '🔭',
    message: 'The world awaits! Select your Scout and send them into the unknown. Who knows what we might find out there?',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === 'player'),
    tutorialStep: 'explore',
  },
  {
    id: 'research_tech',
    advisor: 'explorer',
    icon: '🔭',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => state.civilizations.player?.techState.currentResearch === null && state.turn >= 2,
    tutorialStep: 'research_tech',
  },
  {
    id: 'combat',
    advisor: 'explorer',
    icon: '🔭',
    message: 'Barbarians! Move your Warrior next to them and tap the enemy to attack. Be careful — they fight back!',
    trigger: (state) => {
      const vis = state.civilizations.player?.visibility;
      if (!vis) return false;
      return Object.values(state.units).some(u => u.owner === 'barbarian' && vis.tiles[`${u.position.q},${u.position.r}`] === 'visible');
    },
    tutorialStep: 'combat',
  },
  {
    id: 'tutorial_complete',
    advisor: 'builder',
    icon: '🏗️',
    message: "You're doing great! You now know the basics. Explore, expand, research, and conquer. The world is yours to shape!",
    trigger: (state) => state.turn >= 10,
    tutorialStep: 'complete',
  },

  // --- Chancellor ---
  {
    id: 'chancellor_hostile_civ',
    advisor: 'chancellor',
    icon: '🎩',
    message: 'My liege, a neighboring civilization grows hostile. Consider diplomacy before conflict erupts.',
    trigger: (state) => {
      const playerDip = state.civilizations.player?.diplomacy;
      if (!playerDip) return false;
      return Object.entries(playerDip.relationships).some(
        ([civId, score]) => score < -30 && !isAtWar(playerDip, civId),
      );
    },
  },
  {
    id: 'chancellor_alliance_opportunity',
    advisor: 'chancellor',
    icon: '🎩',
    message: 'Excellent news! A civilization views us favorably. This could be a good time to propose a treaty.',
    trigger: (state) => {
      const playerDip = state.civilizations.player?.diplomacy;
      if (!playerDip) return false;
      return Object.entries(playerDip.relationships).some(
        ([_, score]) => score > 40 && playerDip.treaties.length === 0,
      );
    },
  },
  {
    id: 'chancellor_at_war',
    advisor: 'chancellor',
    icon: '🎩',
    message: 'We are at war! Consider seeking peace if our forces are spread thin, or press the attack if we have the advantage.',
    trigger: (state) => {
      const playerDip = state.civilizations.player?.diplomacy;
      if (!playerDip) return false;
      return playerDip.atWarWith.length > 0;
    },
  },

  // --- War Chief ---
  {
    id: 'warchief_enemy_near_border',
    advisor: 'warchief',
    icon: '⚔️',
    message: 'Enemy forces spotted near our borders! Station warriors nearby to protect our cities.',
    trigger: (state) => {
      const playerCities = state.civilizations.player?.cities ?? [];
      if (playerCities.length === 0) return false;
      const vis = state.civilizations.player?.visibility;
      if (!vis) return false;

      for (const cityId of playerCities) {
        const city = state.cities[cityId];
        if (!city) continue;
        for (const unit of Object.values(state.units)) {
          if (unit.owner === 'player' || unit.owner === 'barbarian') continue;
          if (vis.tiles[`${unit.position.q},${unit.position.r}`] !== 'visible') continue;
          const dq = Math.abs(unit.position.q - city.position.q);
          const dr = Math.abs(unit.position.r - city.position.r);
          if (dq + dr <= 4) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'warchief_undefended_city',
    advisor: 'warchief',
    icon: '⚔️',
    message: 'One of our cities has no garrison! Train a warrior or move troops there immediately.',
    trigger: (state) => {
      const playerCities = state.civilizations.player?.cities ?? [];
      if (playerCities.length === 0) return false;
      const playerUnits = Object.values(state.units).filter(u => u.owner === 'player');

      return playerCities.some(cityId => {
        const city = state.cities[cityId];
        if (!city) return false;
        return !playerUnits.some(u =>
          u.position.q === city.position.q && u.position.r === city.position.r,
        );
      });
    },
  },
  {
    id: 'warchief_barbarian_camp',
    advisor: 'warchief',
    icon: '⚔️',
    message: 'A barbarian camp lurks nearby. Destroy it before they grow stronger and raid our lands!',
    trigger: (state) => {
      const vis = state.civilizations.player?.visibility;
      if (!vis) return false;
      return Object.values(state.barbarianCamps).some(
        camp => vis.tiles[`${camp.position.q},${camp.position.r}`] === 'visible',
      );
    },
  },
];

export class AdvisorSystem {
  private bus: EventBus;
  private shownIds = new Set<string>();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  check(state: GameState): void {
    if (!state.settings.tutorialEnabled && !this.hasAdvisorsEnabled(state)) return;

    for (const msg of ADVISOR_MESSAGES) {
      if (this.shownIds.has(msg.id)) continue;

      // Skip tutorial messages if tutorial is completed or disabled
      if (msg.tutorialStep) {
        if (!state.tutorial.active) continue;
        if (state.tutorial.completedSteps.includes(msg.tutorialStep)) {
          this.shownIds.add(msg.id);
          continue;
        }
      }

      // Skip non-tutorial messages if that advisor is disabled
      if (!msg.tutorialStep && !state.settings.advisorsEnabled[msg.advisor]) continue;

      if (msg.trigger(state)) {
        this.shownIds.add(msg.id);

        if (msg.tutorialStep) {
          this.bus.emit('tutorial:step', {
            step: msg.tutorialStep,
            message: msg.message,
            advisor: msg.advisor as 'builder' | 'explorer',
          });
        }

        this.bus.emit('advisor:message', {
          advisor: msg.advisor,
          message: msg.message,
          icon: msg.icon,
        });
        break; // One message at a time
      }
    }
  }

  resetMessage(id: string): void {
    this.shownIds.delete(id);
  }

  private hasAdvisorsEnabled(state: GameState): boolean {
    return Object.values(state.settings.advisorsEnabled).some(v => v);
  }
}

/** Get the list of advisor message IDs (for testing) */
export function getAdvisorMessageIds(): string[] {
  return ADVISOR_MESSAGES.map(m => m.id);
}
