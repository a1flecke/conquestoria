import type { CouncilAgenda, CouncilCard, CouncilInterrupt, CouncilTalkLevel, GameState } from '@/core/types';
import { getQuestDescriptionForPlayer, getQuestOriginLabel, isQuestVisibleToPlayer } from '@/systems/quest-presentation';
import { calculateCityYields } from '@/systems/resource-system';
import { getCivDefinition } from '@/systems/civ-definitions';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import {
  getReachableLegendaryWonderProjects,
  initializeLegendaryWonderProjectsForAllCities,
} from '@/systems/legendary-wonder-system';

function getPrimaryCity(state: GameState, civId: string) {
  const firstCityId = state.civilizations[civId]?.cities[0];
  return firstCityId ? state.cities[firstCityId] : undefined;
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

  return reachableProjects
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

export function buildCouncilAgenda(state: GameState, civId: string): CouncilAgenda {
  const primaryCity = getPrimaryCity(state, civId);
  const civBonus = getCivDefinition(state.civilizations[civId]?.civType ?? '')?.bonusEffect;
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
    const yields = calculateCityYields(primaryCity, state.map, civBonus);
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
    if (!quest || !isQuestVisibleToPlayer(state, quest, civId)) {
      continue;
    }
    doNow.push({
      id: `quest-${quest.id}`,
      advisor: 'chancellor',
      bucket: 'do-now',
      title: `Aid ${getQuestOriginLabel(state, quest, civId)}`,
      summary: getQuestDescriptionForPlayer(state, civId, quest),
      why: 'Helping friendly powers gives the Council concrete momentum, rewards, and a sense of purpose.',
      priority: 55,
      actionLabel: 'Review quest',
    });
    break;
  }

  const wonderCards = getWonderRecommendationCards(state, civId);

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
