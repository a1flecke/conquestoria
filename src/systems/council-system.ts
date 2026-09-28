import type { CouncilAgenda, CouncilCard, CouncilInterrupt, CouncilTalkLevel, GameState } from '@/core/types';
import { getMinorCivQuestPresentationForPlayer } from '@/systems/quest-presentation';
import { getMinorCivPresentationForPlayer } from '@/systems/minor-civ-presentation';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import {
  getReachableLegendaryWonderProjects,
  initializeLegendaryWonderProjectsForAllCities,
} from '@/systems/legendary-wonder-system';
import { EVENT_CHAIN_CARD_ID_PREFIX, getEventChainDramaCards } from '@/systems/event-chain-presentation';
import { getAllWorldRaceKinds } from '@/systems/world-race-definitions';
import { getWorldRacePresentationForViewer } from '@/systems/world-race-presentation';

export { EVENT_CHAIN_CARD_ID_PREFIX };

function getPrimaryCity(state: GameState, civId: string) {
  for (const cityId of state.civilizations[civId]?.cities ?? []) {
    const city = state.cities[cityId];
    if (city) return city;
  }
  return undefined;
}

function getFoodRecommendation(city: GameState['cities'][string]): string {
  if (!city.buildings.includes('herbalist')) {
    return 'Queue a Herbalist for a quick food boost.';
  }
  if (!city.buildings.includes('granary')) {
    return 'Queue a Granary next to steady food growth.';
  }
  return 'Work better farmland or build another food source before growth stalls.';
}

function getWonderRecommendationCards(state: GameState, civId: string): CouncilCard[] {
  const seededState = initializeLegendaryWonderProjectsForAllCities(state);
  const cityNames = seededState.civilizations[civId]?.cities.reduce<Record<string, string>>((acc, cityId) => {
    const city = seededState.cities[cityId];
    if (city) {
      acc[cityId] = city.name;
    }
    return acc;
  }, {}) ?? {};
  const reachableProjects = seededState.civilizations[civId]?.cities.flatMap(cityId =>
    getReachableLegendaryWonderProjects(seededState, civId, cityId),
  ) ?? [];
  const bestProjectByWonder = new Map<string, typeof reachableProjects[number]>();

  for (const project of reachableProjects) {
    const definition = getLegendaryWonderDefinition(project.wonderId);
    const completedSteps = project.questSteps.filter(step => step.completed).length;
    const totalSteps = project.questSteps.length;
    const phaseBonus = project.phase === 'ready_to_build' ? 100 : 45;
    const progressBonus = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 30) : 20;
    const costPenalty = Math.floor((definition?.productionCost ?? 300) / 40);
    const priority = phaseBonus + progressBonus - costPenalty;
    const existing = bestProjectByWonder.get(project.wonderId);

    if (!existing) {
      bestProjectByWonder.set(project.wonderId, project);
      continue;
    }

    const existingDefinition = getLegendaryWonderDefinition(existing.wonderId);
    const existingCompleted = existing.questSteps.filter(step => step.completed).length;
    const existingTotal = existing.questSteps.length;
    const existingPhaseBonus = existing.phase === 'ready_to_build' ? 100 : 45;
    const existingProgressBonus = existingTotal > 0 ? Math.round((existingCompleted / existingTotal) * 30) : 20;
    const existingCostPenalty = Math.floor((existingDefinition?.productionCost ?? 300) / 40);
    const existingPriority = existingPhaseBonus + existingProgressBonus - existingCostPenalty;

    if (priority > existingPriority) {
      bestProjectByWonder.set(project.wonderId, project);
    }
  }

  return [...bestProjectByWonder.values()]
    .map(project => {
      const definition = getLegendaryWonderDefinition(project.wonderId);
      const completedSteps = project.questSteps.filter(step => step.completed).length;
      const totalSteps = project.questSteps.length;
      const phaseBonus = project.phase === 'ready_to_build' ? 100 : 45;
      const progressBonus = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 30) : 20;
      const costPenalty = Math.floor((definition?.productionCost ?? 300) / 40);
      const priority = phaseBonus + progressBonus - costPenalty;
      const cityName = cityNames[project.cityId] ?? project.cityId;
      const isReady = project.phase === 'ready_to_build';

      return {
        id: `wonder-${project.cityId}-${project.wonderId}`,
        advisor: 'artisan' as const,
        bucket: 'to-win' as const,
        cardType: 'wonder' as const,
        title: `Legendary Wonder: ${definition?.name ?? project.wonderId}`,
        summary: isReady
          ? `${cityName} can begin it now. A glorious vanity project with actual upside.`
          : `${cityName} is ${completedSteps}/${totalSteps} steps in. Close enough to feel tantalizing, not overwhelming.`,
        why: `${definition?.reward.summary ?? 'A major empire bonus.'} Keep the Council pointed at one grand story at a time.`,
        priority,
        actionLabel: isReady ? 'Build wonder' : 'Track quest',
      };
    })
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 3);
}

/** #992: the council's "progress surface, position indicator" for world races -- reads
 * only the viewer-safe presentation, never state.worldRaces/civ.builtNationalProjects
 * directly. A race with no tech access yet contributes nothing (nothing to recommend);
 * a race that already resolved (won, lost, or someone else won) also contributes nothing --
 * that moment already had its own ceremony via #993's framework. */
function getWorldRaceRecommendationCards(state: GameState, civId: string): CouncilCard[] {
  const cards: CouncilCard[] = [];

  for (const kind of getAllWorldRaceKinds()) {
    const presentation = getWorldRacePresentationForViewer(state, civId, kind);
    if (!presentation.unlocked || presentation.completion) continue;

    const { own, knownRivals, displayName } = presentation;
    const progressPercent = own.launchCost > 0 ? Math.round((own.launchProgress / own.launchCost) * 100) : 0;

    let summary: string;
    let actionLabel: string;
    let priority: number;
    if (!own.componentBuilt) {
      summary = `Lay the groundwork for the ${displayName} race before committing to the launch attempt itself.`;
      actionLabel = 'Prepare';
      priority = 35;
    } else if (!own.launchQueued) {
      summary = `${displayName}: the groundwork is complete. Queue the launch attempt to enter the race.`;
      actionLabel = 'Enter the race';
      priority = 55;
    } else {
      summary = `${own.hostCityName ?? 'A city'} is ${progressPercent}% toward the ${displayName} launch.`;
      actionLabel = 'Track launch';
      priority = 65;
    }
    if (knownRivals.length > 0) {
      summary += ` ${knownRivals.length} known rival${knownRivals.length === 1 ? '' : 's'} ${knownRivals.length === 1 ? 'is' : 'are'} also pursuing it.`;
      priority += 10;
    }

    cards.push({
      id: `worldrace-${kind}`,
      advisor: 'scholar',
      bucket: 'to-win',
      title: `World Race: ${displayName}`,
      summary,
      why: 'Whoever completes the launch first claims a one-time empire reward; everyone else is refunded half their invested production.',
      priority,
      actionLabel,
    });
  }

  return cards;
}

export function buildCouncilAgenda(state: GameState, civId: string): CouncilAgenda {
  const primaryCity = getPrimaryCity(state, civId);
  const civBonus = resolveCivDefinition(state, state.civilizations[civId]?.civType ?? '')?.bonusEffect;
  const doNow: CouncilCard[] = [
    {
      id: 'survey-frontier',
      advisor: 'explorer',
      bucket: 'do-now' as const,
      title: 'Survey the frontier',
      summary: 'Look for nearby opportunities before ending the turn.',
      why: 'Fresh information helps the Council give better advice.',
      priority: 100,
      actionLabel: 'Scout',
    },
  ];

  if (primaryCity) {
    const yields = calculateProjectedCityYields(state, primaryCity.id, civBonus);
    const foodSurplus = yields.food - primaryCity.population;
    if (foodSurplus < 0) {
      doNow.unshift({
        id: 'food-warning',
        advisor: 'treasurer',
        bucket: 'do-now' as const,
        title: `Feed ${primaryCity.name}`,
        summary: `${primaryCity.name} is only making ${yields.food} food for ${primaryCity.population} citizens. ${getFoodRecommendation(primaryCity)}`,
        why: 'Food keeps growth alive. If the pantry is flat, every future plan slows down.',
        priority: 95,
        actionLabel: 'Fix food',
      });
    } else if (foodSurplus === 0) {
      doNow.push({
        id: 'food-warning',
        advisor: 'treasurer',
        bucket: 'do-now' as const,
        title: `Keep ${primaryCity.name} growing`,
        summary: `${primaryCity.name} is breaking even on food. ${getFoodRecommendation(primaryCity)}`,
        why: 'A city that only treads water stops feeling lively fast.',
        priority: 20,
        actionLabel: 'Add food',
      });
    }
  }

  for (const minorCiv of Object.values(state.minorCivs ?? {})) {
    const quest = minorCiv.activeQuests[civId];
    const presentation = getMinorCivQuestPresentationForPlayer(state, civId, minorCiv.id);
    if (!quest || !presentation) continue;
    const issuer = getMinorCivPresentationForPlayer(state, civId, minorCiv.id, 'City-state');
    doNow.push({
      id: `quest-${quest.id}`,
      advisor: 'chancellor',
      bucket: 'do-now',
      title: `Aid ${issuer.name}`,
      summary: presentation.description,
      why: 'Helping friendly powers gives the Council concrete momentum, rewards, and a sense of purpose.',
      priority: 55,
      actionLabel: 'Review quest',
    });
    break;
  }

  const wonderCards = getWonderRecommendationCards(state, civId);
  const worldRaceCards = getWorldRaceRecommendationCards(state, civId);

  return {
    doNow: doNow.sort((a, b) => b.priority - a.priority),
    soon: [
      {
        id: 'shape-the-economy',
        advisor: 'builder',
        bucket: 'soon',
        title: 'Shape the economy',
        summary: 'Plan the next build so the empire keeps moving.',
        why: 'A city with a plan is more lovable than a city waiting for orders.',
        priority: 40,
      },
    ],
    toWin: [
      ...wonderCards,
      ...worldRaceCards,
      {
        id: 'pick-a-victory-lane',
        advisor: 'scholar',
        bucket: 'to-win',
        title: 'Pick a path to victory',
        summary: 'Growth, conquest, and wonder races all reward focus.',
        why: 'Winning gets easier when the Council agrees on what matters most.',
        priority: 60,
      },
    ],
    drama: [
      ...getEventChainDramaCards(state, civId),
      {
        id: 'council-murmur',
        advisor: 'chancellor',
        bucket: 'drama',
        title: 'The Council is watching',
        summary: 'No scandal yet. They are saving their opinions for later.',
        why: 'A calm court is still a court.',
        priority: 10,
      },
    ],
  };
}

export function getCouncilInterrupt(
  state: GameState,
  civId: string,
  talkLevel: CouncilTalkLevel,
): CouncilInterrupt | null {
  const candidate = buildCouncilAgenda(state, civId).doNow.find(card => card.id !== 'survey-frontier');
  if (!candidate) {
    return null;
  }

  const minimumPriority = {
    quiet: 80,
    normal: 60,
    chatty: 40,
    chaos: 0,
  }[talkLevel];

  if (candidate.priority < minimumPriority) {
    return null;
  }

  return {
    civId,
    advisor: candidate.advisor,
    summary: candidate.summary,
    sourceCardId: candidate.id,
  };
}
