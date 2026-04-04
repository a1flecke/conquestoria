import type { GameState, TutorialStep, AdvisorType } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { isAtWar, getRelationship } from '@/systems/diplomacy-system';

/** Returns true only if the current player has discovered the minor civ's city position */
function isMinorCivDiscovered(state: GameState, mc: { cityId: string; isDestroyed: boolean }): boolean {
  if (mc.isDestroyed) return false;
  const playerVis = state.civilizations[state.currentPlayer]?.visibility;
  if (!playerVis) return false;
  const city = state.cities[mc.cityId];
  if (!city) return false;
  const key = `${city.position.q},${city.position.r}`;
  const visState = playerVis.tiles[key];
  return visState === 'visible' || visState === 'fog'; // fog = previously seen (explored)
}

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
    message: 'Excellent! Your city is growing. Build a Shrine to start generating science, or train a Warrior to defend your borders. Tap your city to see options.',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === state.currentPlayer),
    tutorialStep: 'found_city',
  },
  {
    id: 'build_improvement',
    advisor: 'builder',
    icon: '🏗️',
    message: "Your Worker can build Farms and Mines on nearby tiles. Select the Worker and choose an improvement to boost your city's output.",
    trigger: (state) => Object.values(state.units).some(u => u.owner === state.currentPlayer && u.type === 'worker'),
    tutorialStep: 'build_improvement',
  },
  {
    id: 'build_unit',
    advisor: 'builder',
    icon: '🏗️',
    message: 'Your city can train units. Open the city panel and queue up a Warrior to defend your borders.',
    trigger: (state) => {
      const cities = Object.values(state.cities).filter(c => c.owner === state.currentPlayer);
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
    trigger: (state) => Object.values(state.cities).some(c => c.owner === state.currentPlayer),
    tutorialStep: 'explore',
  },
  {
    id: 'research_tech',
    advisor: 'scholar',
    icon: '📚',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      return civ?.techState.currentResearch === null && state.turn >= 2;
    },
    tutorialStep: 'research_tech',
  },
  {
    id: 'combat',
    advisor: 'explorer',
    icon: '🔭',
    message: 'Barbarians! Move your Warrior next to them and tap the enemy to attack. Be careful — they fight back!',
    trigger: (state) => {
      const vis = state.civilizations[state.currentPlayer]?.visibility;
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
      const playerDip = state.civilizations[state.currentPlayer]?.diplomacy;
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
      const playerDip = state.civilizations[state.currentPlayer]?.diplomacy;
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
      const playerDip = state.civilizations[state.currentPlayer]?.diplomacy;
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
      const playerCities = state.civilizations[state.currentPlayer]?.cities ?? [];
      if (playerCities.length === 0) return false;
      const vis = state.civilizations[state.currentPlayer]?.visibility;
      if (!vis) return false;

      for (const cityId of playerCities) {
        const city = state.cities[cityId];
        if (!city) continue;
        for (const unit of Object.values(state.units)) {
          if (unit.owner === state.currentPlayer || unit.owner === 'barbarian') continue;
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
      const playerCities = state.civilizations[state.currentPlayer]?.cities ?? [];
      if (playerCities.length === 0) return false;
      const playerUnits = Object.values(state.units).filter(u => u.owner === state.currentPlayer);

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
      const vis = state.civilizations[state.currentPlayer]?.visibility;
      if (!vis) return false;
      return Object.values(state.barbarianCamps).some(
        camp => vis.tiles[`${camp.position.q},${camp.position.r}`] === 'visible',
      );
    },
  },

  // --- Scholar (unlocks when techState.completed.length > 0) ---
  {
    id: 'scholar_wonder',
    advisor: 'scholar',
    icon: '📚',
    message: 'Fascinating! This wonder could advance our knowledge. Settle nearby to benefit.',
    trigger: () => false, // Triggered via event in main.ts on wonder discovery
  },
  {
    id: 'scholar_no_research',
    advisor: 'scholar',
    icon: '📚',
    message: 'Our scholars are idle! Choose a tech to research.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ) return false;
      if (civ.techState.completed.length === 0) return false;
      return civ.techState.currentResearch === null && state.turn >= 2;
    },
  },
  {
    id: 'scholar_tech_complete',
    advisor: 'scholar',
    icon: '📚',
    message: 'Excellent progress! Our understanding deepens.',
    trigger: () => false, // Triggered via event
  },
  {
    id: 'scholar_village_science',
    advisor: 'scholar',
    icon: '📚',
    message: 'The villagers shared ancient knowledge with us!',
    trigger: () => false, // Triggered via event on village science outcome
  },
  {
    id: 'scholar_village_tech',
    advisor: 'scholar',
    icon: '📚',
    message: 'Remarkable — the villagers taught us something entirely new!',
    trigger: () => false, // Triggered via event on village free_tech outcome
  },
  {
    id: 'scholar_era',
    advisor: 'scholar',
    icon: '📚',
    message: "We're making strides. Continue researching to reach a new era.",
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ || civ.techState.completed.length === 0) return false;
      return state.turn > 0 && state.turn % 20 === 0;
    },
  },

  // --- Treasurer (unlocks when gold >= 50 or has trade route) ---
  {
    id: 'treasurer_rich_idle',
    advisor: 'treasurer',
    icon: '💎',
    message: "We're sitting on a fortune! Invest in buildings or units.",
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ || civ.gold <= 100) return false;
      return civ.cities.every(cityId => {
        const city = state.cities[cityId];
        return !city || city.productionQueue.length === 0;
      });
    },
  },
  {
    id: 'treasurer_broke',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Our coffers are nearly empty. We need gold-producing tiles or trade.',
    trigger: (state) => {
      const civ = state.civilizations.player ?? state.civilizations[state.currentPlayer];
      if (!civ) return false;
      if (civ.cities.length === 0 || state.turn < 5) return false;
      return civ.gold < 10;
    },
  },
  {
    id: 'treasurer_village_gold',
    advisor: 'treasurer',
    icon: '💎',
    message: 'A generous village! Our coffers grow.',
    trigger: () => false, // Triggered via event
  },
  {
    id: 'treasurer_trade_route',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Trade is flowing. Each route strengthens our economy.',
    trigger: () => false, // Triggered via event on trade route creation
  },
  {
    id: 'treasurer_wonder_yields',
    advisor: 'treasurer',
    icon: '💎',
    message: 'Our city near a wonder is thriving from its bounty.',
    trigger: () => false, // Triggered via event
  },
  {
    id: 'treasurer_camp_reward',
    advisor: 'treasurer',
    icon: '💎',
    message: 'The spoils of victory bolster our treasury.',
    trigger: () => false, // Triggered via event
  },
  // Minor Civ — Chancellor
  {
    id: 'chancellor_ally_city_state',
    advisor: 'chancellor',
    icon: '🤝',
    message: 'A nearby city-state could be a valuable ally. Consider their quest.',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        isMinorCivDiscovered(state, mc) && Object.values(mc.activeQuests).some(q => q.status === 'active')
      ),
  },
  {
    id: 'chancellor_conquest_warning',
    advisor: 'chancellor',
    icon: '⚠️',
    message: 'Our aggression against city-states is making others wary.',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        isMinorCivDiscovered(state, mc) && (mc.diplomacy.relationships[state.currentPlayer] ?? 0) < -30
      ),
  },
  // Minor Civ — Warchief
  {
    id: 'warchief_undefended_city_state',
    advisor: 'warchief',
    icon: '⚔️',
    message: 'An undefended city-state could be easy pickings...',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        isMinorCivDiscovered(state, mc) && mc.units.filter(uid => state.units[uid]).length === 0
      ),
  },
  {
    id: 'warchief_guerrilla_harass',
    advisor: 'warchief',
    icon: '🏴',
    message: 'City-state guerrillas are harassing our borders!',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        !mc.isDestroyed && mc.diplomacy.atWarWith.includes(state.currentPlayer) && mc.units.length > 1
      ),
  },
  // Minor Civ — Treasurer
  {
    id: 'treasurer_mercantile_ally',
    advisor: 'treasurer',
    icon: '💰',
    message: 'Our mercantile ally is boosting our income.',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        isMinorCivDiscovered(state, mc) && (mc.diplomacy.relationships[state.currentPlayer] ?? 0) >= 60
      ),
  },
  // Minor Civ — Scholar
  {
    id: 'scholar_cultural_ally',
    advisor: 'scholar',
    icon: '📚',
    message: 'Our cultural ally advances our knowledge.',
    trigger: (state: GameState) =>
      Object.values(state.minorCivs ?? {}).some(mc =>
        isMinorCivDiscovered(state, mc) && (mc.diplomacy.relationships[state.currentPlayer] ?? 0) >= 60
      ),
  },
  // --- Spymaster Advisor ---
  {
    id: 'spymaster_recruit_first_spy',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'My liege... I have eyes and ears throughout the realm, but none abroad. Recruit a spy — we must know what our neighbors are planning.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      const hasEspTech = state.civilizations[state.currentPlayer]?.techState.completed
        .some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      const activeSpies = Object.values(playerEsp.spies).filter(s => s.status !== 'captured');
      return activeSpies.length === 0;
    },
  },
  {
    id: 'spymaster_hostile_no_coverage',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'A hostile civilization grows bold, and we have no eyes on them. I recommend placing a spy in their capital before it is too late.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerDip = state.civilizations[state.currentPlayer]?.diplomacy;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerDip || !playerEsp) return false;
      const hasEspTech = state.civilizations[state.currentPlayer]?.techState.completed
        .some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      for (const [civId, score] of Object.entries(playerDip.relationships)) {
        if (score < -20) {
          const hasSpy = Object.values(playerEsp.spies).some(
            s => s.targetCivId === civId && s.status !== 'captured' && s.status !== 'idle' && s.status !== 'cooldown',
          );
          if (!hasSpy) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'spymaster_no_counter_intel',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our cities lack counter-intelligence. Any foreign spy could walk through our gates unseen. Consider stationing a spy defensively.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      const playerCiv = state.civilizations[state.currentPlayer];
      if (!playerCiv || playerCiv.cities.length === 0) return false;
      const hasEspTech = playerCiv.techState.completed.some(t => t.startsWith('espionage-'));
      if (!hasEspTech) return false;
      const hasAnyCi = playerCiv.cities.some(
        cityId => (playerEsp.counterIntelligence[cityId] ?? 0) > 0,
      );
      return !hasAnyCi && Object.values(playerEsp.spies).filter(s => s.status !== 'captured').length > 0;
    },
  },
  {
    id: 'spymaster_spy_captured_warning',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'One of our agents has been captured. Expect diplomatic fallout. Perhaps we should let tempers cool before sending another.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(s => s.status === 'captured');
    },
  },
  {
    id: 'spymaster_spy_expelled_warning',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our spy was discovered and expelled. The mission failed, but the agent survived. They will need time to recover before redeployment.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(s => s.status === 'cooldown');
    },
  },
  {
    id: 'spymaster_mission_available',
    advisor: 'spymaster',
    icon: '🕵️',
    message: 'Our spy is in position and awaiting orders. Select a mission to begin gathering intelligence.',
    trigger: (state: GameState) => {
      if (!state.espionage) return false;
      const playerEsp = state.espionage[state.currentPlayer];
      if (!playerEsp) return false;
      return Object.values(playerEsp.spies).some(
        s => s.status === 'stationed' && !s.currentMission,
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
            advisor: msg.advisor as 'builder' | 'explorer' | 'scholar',
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
